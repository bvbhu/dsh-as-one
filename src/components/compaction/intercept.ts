/**
 * Compaction-only LLM stream interceptor（从 quilt/lib/intercept.js 完整移植）。
 *
 * 与宿主协作：
 * - 不替换 ctx.compaction、不停用 dsh-compaction-basic、不注册 adapter；
 * - 只拦 `purpose === 'compaction'` 的 `llm/stream` waterfall；
 * - `_inflight` guard 防止我们自己的 chunk/merge 调用递归；
 * - 任何失败都 `next()` 回退宿主原摘要（用户永不因增强而丢压缩）。
 *
 * promptMode:
 * - `dsh-default`：不改宿主压缩提示词，只走路由（quilt 引擎仍产生分块摘要，
 *   但不附加锚点块/恢复指令）；
 * - `anchored`：在压缩结果里附 `<session-search-anchors>` + ANCHOR_PROMPT_INSTRUCTION。
 *
 * @module src/components/compaction/intercept
 */

import type { Context } from "cordis";
import type { AsOneRuntime } from "../../setup.js";
import type { CapacityView } from "../capacity.js";
import type { CompactionComponentConfig, QuiltConfig } from "./config.js";
import { toQuiltConfig, readCompactionConfig, tiersFromLogicalModel } from "./config.js";
import { ModelChain, chunkJob, mergeJob, type ChainAgent, type ChainContext } from "./model-chain.js";
import { MemoryCooldownStore } from "./cooldown.js";
import { runStage0, lineTokenCost, sliceNextChunk } from "./stage0.js";
import { computeChunkBudget, computeUsableInputTokens } from "./budget.js";
import { ANCHOR_PROMPT_INSTRUCTION, buildAnchorBlock } from "./summarize.js";

interface LlmStreamOptions {
  purpose?: string;
  sessionId?: string;
  provider?: string;
  model?: string;
  signal?: AbortSignal;
  messages?: Array<{ role?: string; content?: unknown }>;
  [key: string]: unknown;
}

type NextStream = () => AsyncIterable<Record<string, unknown>>;

const DEFAULT_PRIORITY = 0;

function isCompactionRequest(options: unknown): options is LlmStreamOptions {
  return (options as LlmStreamOptions)?.purpose === "compaction";
}

/** 剥掉宿主的压缩指令（不属于被压缩的会话区域）。 */
function regionMessages(options: LlmStreamOptions): Array<{ role?: string; content?: unknown }> {
  const messages = Array.isArray(options?.messages) ? [...options.messages] : [];
  const last = messages.at(-1);
  const text = Array.isArray(last?.content)
    ? last.content.filter((block) => block && typeof block === "object" && (block as { type?: string }).type === "text")
      .map((block) => String((block as { text?: unknown }).text ?? "")).join("\n")
    : typeof last?.content === "string" ? last.content : "";
  if (last?.role === "user" && /compaction engine|condense the conversation|structured checkpoint/i.test(text)) {
    messages.pop();
  }
  return messages;
}

/** 会话上下文的派生事件/表面节点（鸭子类型，不 import dsh-session）。 */
interface SessionLike {
  id?: string;
  surface?: { nodes?: unknown[] };
  eventAt?: (seq: unknown) => unknown;
  deriveEventMessage?: (event: unknown) => { role?: string; content?: unknown } | null;
  requestHeader?: () => { config?: { provider?: string; model?: string } } | undefined;
}

function messageFingerprint(message: { role?: string; content?: unknown }): string {
  const content = message.content;
  if (typeof content === "string") return `${message.role ?? ""}:${content}`;
  if (!Array.isArray(content)) return `${message.role ?? ""}:${JSON.stringify(content ?? "")}`;
  return `${message.role ?? ""}:${content.map((block) => {
    const b = block as { type?: string; text?: unknown; arguments?: unknown } | null;
    return `${b?.type ?? ""}:${String(b?.text ?? b?.arguments ?? "")}`;
  }).join("|")}`;
}

/** 从 live session 派生精确的 shadowed seq 区间。 */
function deriveSpan(ctx: Context, options: LlmStreamOptions): { sessionId: string | null; seqStart: number | null; seqEnd: number | null } {
  const sessionId = options?.sessionId;
  if (sessionId === undefined) return { sessionId: null, seqStart: null, seqEnd: null };
  let session: SessionLike | undefined;
  try {
    const sessions = (ctx as unknown as { get?(name: string): unknown }).get?.("sessions") as
      | { get?(id: unknown): SessionLike | undefined }
      | undefined;
    session = sessions?.get?.(sessionId);
  } catch {
    session = undefined;
  }
  if (session === undefined) return { sessionId: String(sessionId), seqStart: null, seqEnd: null };
  const nodes = session.surface?.nodes ?? [];
  const replayed = regionMessages(options);
  const replayKeys = replayed.map(messageFingerprint);
  if (replayKeys.length === 0 || nodes.length < replayKeys.length) {
    return { sessionId: String(sessionId), seqStart: null, seqEnd: null };
  }
  const surfaceKeys: string[] = [];
  for (const seq of nodes) {
    const event = session.eventAt?.(seq);
    const message = event === undefined ? undefined : session.deriveEventMessage?.(event);
    surfaceKeys.push(message === null || message === undefined ? "" : messageFingerprint(message));
  }
  const headOffset = replayed[0]?.role === "system" ? 0 : 1;
  for (let i = 0; i < replayKeys.length; i += 1) {
    if (surfaceKeys[headOffset + i] !== replayKeys[i]) {
      return { sessionId: String(sessionId), seqStart: null, seqEnd: null };
    }
  }
  const first = replayed[0]?.role === "system" ? 1 : 0;
  const last = first + replayKeys.length - 1;
  if (last >= nodes.length) return { sessionId: String(sessionId), seqStart: null, seqEnd: null };
  return { sessionId: String(sessionId), seqStart: Number(nodes[first]), seqEnd: Number(nodes[last]) };
}

/** 展平消息列表为纯文本区域。 */
function messagesToRegion(messages: readonly { role?: string; content?: unknown }[]): string {
  return messages.map((message) => {
    const role = typeof message.role === "string" ? message.role : "message";
    const content = message.content;
    let text = "";
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      text = content.map((block) => {
        const b = block as { type?: string; text?: unknown; name?: unknown; arguments?: unknown } | null;
        if (b?.type === "text" || b?.type === "reasoning") return String(b.text ?? "");
        if (b?.type === "tool-call") return `${String(b.name ?? "")} ${String(b.arguments ?? "")}`;
        return JSON.stringify(b ?? "");
      }).join("\n");
    } else text = JSON.stringify(content ?? "");
    return `[${role}]\n${text}`;
  }).join("\n");
}

/** 稳定的请求指纹（anchored 锚点 ID）。 */
function requestFingerprint(options: LlmStreamOptions): string {
  const parts = [String(options?.sessionId ?? ""), ...(options?.messages ?? []).map((m) => messageFingerprint(m))].join("\n");
  let hash = 2166136261;
  for (let i = 0; i < parts.length; i += 1) {
    hash ^= parts.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase();
}

/** 输出完整 text stream。 */
async function* syntheticChunks(text: string, signal?: AbortSignal): AsyncGenerator<Record<string, unknown>> {
  if (signal?.aborted) return;
  yield { type: "block-start", index: 0, blockType: "text" };
  yield { type: "text-delta", index: 0, text };
  yield { type: "block-end", index: 0, block: { type: "text", text } };
  yield { type: "finish", reason: { kind: "stop" } };
}

export interface ApplyCompactionOptions {
  ctx: Context;
  runtime: AsOneRuntime;
  capacity: CapacityView;
  getSetting: (key: string) => string | null;
}

/**
 * 安装压缩拦截器；返回 disposer。
 *
 * 与 applySubagentLimit 同款生命周期：在 ctx.on('llm/stream') 上挂 waterfall，
 * 组件卸载时摘 listener 并 reset 容量视图。
 */
export function applyCompaction(opts: ApplyCompactionOptions): () => void {
  const { ctx, runtime, capacity, getSetting } = opts;
  const readConfigSafe = (getSetting: (key: string) => string | null): CompactionComponentConfig => {
    const cfg = readCompactionConfig(getSetting);
    // `compaction.tiers` JSON 为空时，用逻辑模型 members 作为 quilt tier。
    if (cfg.tiers.length === 0 && cfg.logicalModel !== "") {
      cfg.tiers = tiersFromLogicalModel(runtime.registry, cfg.logicalModel);
    }
    return cfg;
  };

  let config: CompactionComponentConfig;
  try {
    config = readConfigSafe(getSetting);
  } catch (error) {
    ctx.logger?.warn?.("[as-one compaction] invalid config, enhancement disabled:", error);
    return () => {};
  }

  const chainCtx: ChainContext = {
    llm: (ctx as unknown as { llm?: ChainContext["llm"] }).llm as ChainContext["llm"],
    logger: ctx.logger as unknown as ChainContext["logger"],
  };
  if (!chainCtx.llm || typeof chainCtx.llm.stream !== "function") {
    ctx.logger?.warn?.("[as-one compaction] no llm service available, enhancement disabled");
    return () => {};
  }

  let quilt: QuiltConfig;
  try {
    quilt = toQuiltConfig(config);
  } catch (error) {
    ctx.logger?.warn?.("[as-one compaction] invalid pool config, enhancement disabled:", error);
    return () => {};
  }

  const store = new MemoryCooldownStore();
  let inflight = 0;
  let disposed = false;

  const host = ctx as unknown as {
    on(event: string, listener: (options: LlmStreamOptions, next: NextStream) => unknown, opts?: { global?: boolean; prepend?: boolean }): () => void;
  };
  const off = host.on(
    "llm/stream",
    (options, next) => {
      if (!isCompactionRequest(options)) return next();
      // 每次请求 hot-read 设置，面板保存后下一个请求即生效。
      try {
        config = readConfigSafe(getSetting);
        quilt = toQuiltConfig(config);
      } catch (error) {
        ctx.logger?.warn?.("[as-one compaction] config reload rejected, delegating:", error);
        return next();
      }
      if (!config.enabled || config.tiers.length === 0) return next();
      return decide(options, next);
    },
    { global: true, prepend: true },
  );

  async function* stream(options: LlmStreamOptions, next: NextStream): AsyncGenerator<Record<string, unknown>> {
    if (inflight > 0) {
      // 我们自己的 chunk/merge 调用：原样通过 waterfall。
      yield* next();
      return;
    }
    inflight += 1;
    try {
      const assembled = await compress(options);
      if (assembled !== undefined) {
        yield* syntheticChunks(assembled, options.signal);
        return;
      }
    } catch (error) {
      ctx.logger?.warn?.("[as-one compaction] compression failed, delegating to host summary:", error);
    } finally {
      inflight -= 1;
    }
    // 宿主原摘要（dsh-compaction-basic）照常跑。
    yield* next();
  }

  function decide(options: LlmStreamOptions, next: NextStream): AsyncIterable<Record<string, unknown>> {
    return stream(options, next);
  }

  async function compress(options: LlmStreamOptions): Promise<string | undefined> {
    if (disposed) return undefined;
    const messages = regionMessages(options);
    if (messages.length === 0) return undefined;
    const span = deriveSpan(ctx, options);
    const rawRegion = messagesToRegion(messages);
    const stage0Lines = runStage0(messages, quilt.preprocessing);
    if (stage0Lines.length === 0) return undefined;
    const regionTokens = stage0Lines.reduce((sum, line) => sum + lineTokenCost(line), 0);
    if (regionTokens <= 0) return undefined;

    const capacities = new Map<string, { contextWindow: number; maxTokens: number }>();
    for (const tier of quilt.tiers) {
      for (const model of tier.models) {
        // 逻辑模型成员：contextWindow 从 registry 的真实模型定义读（members 的顺序 = tier）。
        const info = runtime.registry.getRealModel(model.provider, model.model);
        const window = info?.maxInputTokens ?? undefined;
        capacities.set(model.key, {
          contextWindow: Number.isInteger(window) && (window as number) > 0 ? (window as number) : 262144,
          maxTokens: info?.maxOutputTokens && info.maxOutputTokens > 0 ? info.maxOutputTokens : 32768,
        });
      }
    }

    const mergeWindow = quilt.mergeMaxContextTokens;
    const mergeUsableInput = computeUsableInputTokens(mergeWindow);
    const chain = new ModelChain(chainCtx, quilt, store, {}, capacities, capacity);
    const mergeChain = new ModelChain(chainCtx, quilt, store, {}, capacities, capacity);

    // 按当前路由模型的窗口切块（per-model budget）。
    const jobs: ReturnType<typeof chunkJob>[] = [];
    let cursor = 0;
    let coreStart = 0;
    let index = 0;
    while (cursor < stage0Lines.length) {
      const model = chain.pickChunkModel(capacities);
      if (model === undefined) break;
      const window = chain.modelWindow(model, capacities);
      const budget = computeChunkBudget(window, quilt.chunkRatio);
      const overlap = Math.max(0, Math.floor(budget * quilt.chunkOverlapRatio));
      const { end, next } = sliceNextChunk(stage0Lines, cursor, budget, overlap);
      const slice = stage0Lines.slice(cursor, end);
      if (slice.length === 0) break;
      const tokens = slice.reduce((sum, line) => sum + lineTokenCost(line), 0);
      const coreTokens = stage0Lines.slice(coreStart, end).reduce((sum, line) => sum + lineTokenCost(line), 0);
      const cap = Math.max(1, Math.floor((mergeUsableInput * coreTokens) / Math.max(1, regionTokens)));
      index += 1;
      jobs.push(chunkJob(`chunk ${index}`, slice.join("\n"), {
        chunk: index,
        lineStart: cursor,
        lineEnd: end,
        coreStart,
        coreEnd: end,
        tokens,
        coreTokens,
        sessionId: span.sessionId,
        seqStart: span.seqStart,
        seqEnd: span.seqEnd,
      }, model.key, cap));
      cursor = next;
      coreStart = end;
    }
    if (jobs.length === 0) return undefined;
    const total = jobs.reduce((sum, job) => sum + (job.capTokens ?? 0), 0);
    if (total > mergeUsableInput) {
      const scale = mergeUsableInput / total;
      for (const job of jobs) job.capTokens = Math.max(1, Math.floor((job.capTokens ?? 0) * scale));
    }

    const agent: ChainAgent = {
      session: {
        id: String(options.sessionId ?? "anon"),
        requestHeader: () => undefined,
        toolHistory: () => [],
      },
      options: { provider: options.provider, model: options.model },
    };
    const fallbackOptions = {
      fallbackInput: { messages },
      defaultSummarize: async (input: { messages: unknown }, _agent: ChainAgent, abort?: AbortSignal) => {
        // 宿主原摘要流：经 ctx.llm.stream（此时 inflight>0，不再被我们接管）。
        const result = await (async () => {
          const blocks: Array<{ type: string; text?: string }> = [];
          let usage: unknown;
          for await (const chunk of chainCtx.llm.stream({
            ...options,
            messages: input.messages,
            signal: abort ?? options.signal,
          } as never)) {
            if (chunk.type === "text-delta") {
              const last = blocks[blocks.length - 1];
              if (last?.type === "text") last.text = (last.text ?? "") + String(chunk.text ?? "");
              else blocks.push({ type: "text", text: String(chunk.text ?? "") });
            } else if (chunk.type === "block-end" && (chunk.block as { type?: string })?.type === "text") {
              blocks.push({ type: "text", text: String((chunk.block as { text?: unknown }).text ?? "") });
            } else if (chunk.type === "usage") usage = chunk.usage;
          }
          return { summary: blocks, usage };
        })();
        return result;
      },
      capacities,
    };

    const chunkResults = await chain.run(jobs, agent, options.signal, fallbackOptions);
    const digests = chunkResults.filter((result) => result !== undefined).map((result) => result.text);
    if (digests.length === 0 || digests.some((text) => !text || text.trim().length === 0)) return undefined;

    let finalText: string | undefined;
    if (digests.length === 1) {
      finalText = digests[0];
    } else if (mergeChain.canHoldMerge(mergeWindow, capacities)) {
      const mergeResult = await mergeChain.run([mergeJob(digests, { sourceChunks: digests.length })], agent, options.signal, fallbackOptions);
      finalText = mergeResult[0]?.text;
    } else {
      return undefined;
    }
    if (!finalText || finalText.trim().length === 0) return undefined;

    let text = finalText.trim();
    if (config.promptMode === "anchored") {
      const id = `QC-${requestFingerprint(options)}`;
      const anchor = buildAnchorBlock({
        id,
        sessionId: span.sessionId,
        seqStart: span.seqStart,
        seqEnd: span.seqEnd,
        chunks: jobs.map((job, i) => ({
          i: i + 1,
          lines: [(job.meta?.lineStart as number | null) ?? null, (job.meta?.lineEnd as number | null) ?? null],
          tokens: (job.meta?.tokens as number | null) ?? null,
          anchor: `${id}-${i + 1}`,
        })),
      });
      text = `${text}\n\n${anchor}\n\n${ANCHOR_PROMPT_INSTRUCTION}`;
    }
    // 宿主要求摘要严格小于被替换区域；附加锚点有固定开销，小区域直接回退。
    if (text.length >= rawRegion.length) {
      ctx.logger?.info?.(`[as-one compaction] ${rawRegion.length} chars region would not shrink (digest ${text.length} chars); keeping host summary`);
      return undefined;
    }
    return text;
  }

  return () => {
    disposed = true;
    try { off?.(); } catch { /* already disposed */ }
    capacity.reset();
    void store.clearAll();
  };
}

export { isCompactionRequest as isCompactionRequestForTest, regionMessages as regionMessagesForTest, deriveSpan as deriveSpanForTest };
