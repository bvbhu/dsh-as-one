/**
 * Compaction-only LLM stream interceptor（从 quilt/lib/intercept.js 完整移植）。
 *
 * 与宿主协作：
 * - 不替换 ctx.compaction、不停用 dsh-compaction-basic、不注册 adapter；
 * - 只拦 `purpose === 'compaction'` 的 `llm/stream` waterfall；
 * - `_inflight` guard 防止我们自己的 chunk/merge 调用递归；
 * - 任何失败都 `next()` 回退宿主原摘要（用户永不因增强而丢压缩）。
 *
 * promptMode（三档）:
 * - `default`：**一次压完**。挑一个上下文窗口装得下整段历史的模型（按调度顺序，
 *   在够大的模型里随机），用宿主原样提示词一次完成；都不够大则回退宿主原摘要
 *   （即会话模型兜底）。除"换了个够大的模型"外与 DSH 自带压缩一致。
 * - `anchored`：quilt 分块摘要 + 归并，结果附 `<session-search-anchors>` 锚点块
 *   + ANCHOR_PROMPT_INSTRUCTION（配合 session-search 按 seq 区间取回原文）。
 * - `quilt`：quilt 分块摘要 + 归并，**不**附锚点块（纯降 token 成本）。
 *
 * @module src/components/compaction/intercept
 */

import type { Context } from "cordis";
import type { AsOneRuntime } from "../../setup.js";
import type { CapacityView } from "../capacity.js";
import type { CompactionComponentConfig, QuiltConfig, QuiltPoolModel } from "./config.js";
import { toQuiltConfig, readCompactionConfig, tiersFromLogicalModel } from "./config.js";
import { ModelChain, chunkJob, mergeJob, type ChainAgent, type ChainContext } from "./model-chain.js";
import { MemoryCooldownStore } from "./cooldown.js";
import { runStage0, lineTokenCost, sliceNextChunk } from "./stage0.js";
import { computeChunkBudget, computeUsableInputTokens } from "./budget.js";
import { ANCHOR_PROMPT_INSTRUCTION, SINGLE_CHUNK_PROMPT, buildAnchorBlock } from "./summarize.js";
import { toAsOneStreamOptions } from "./as-one-call.js";

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
    // ⚠️ as-one 适配（2026-11）：组件调 ctx.llm.stream 前必须把 provider/model
    // 翻译成 as-one 适配器能识别的「provider=as-one + model=provider/model +
    // 无 purpose」，否则真实 provider 会 NO_ADAPTER（压缩失败根因）。
    asOneCall: true,
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
      return decide(options, next);    },
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
      // `default` 模式不走分块引擎：挑一个窗口装得下整段历史的模型一次压完。
      // 其余模式（anchored / quilt）走 quilt 分块 + 归并。
      const assembled =
        config.promptMode === "default"
          ? await compressOnce(options)
          : await compress(options);
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

  /**
   * `default` 模式：**一次压完**。
   *
   * 语义是「除了换了个够大的模型，其余与 DSH 自带压缩完全一致」：
   * - 提示词用**宿主原样**（直接从 options 里取，不替换、不追加）；
   * - 挑模型：按调度顺序（`scheduler.chain`）遍历压缩逻辑模型的成员，
   *   在**上下文窗口装得下整段区域**的模型里随机取一个；
   * - 随机是为了摊平负载：同档位多个够大的模型时，不要每次都压到同一个号上；
   * - 一个够大的都没有 → 返回 undefined，回退宿主原摘要（即"会话模型兜底"）。
   *
   * @returns 摘要文本；`undefined` 表示本模式不接管，交给宿主。
   */
  async function compressOnce(options: LlmStreamOptions): Promise<string | undefined> {
    if (disposed) return undefined;
    const messages = regionMessages(options);
    if (messages.length === 0) return undefined;

    // 区域 token 数：用内核精确 DeepSeek 分词器（与上游计费口径一致）。
    const stage0Lines = runStage0(messages, quilt.preprocessing);
    if (stage0Lines.length === 0) return undefined;
    const regionTokens = stage0Lines.reduce((sum, line) => sum + lineTokenCost(line), 0);
    if (regionTokens <= 0) return undefined;

    // 调度顺序给出候选（成员顺序 = 优先级），过滤掉窗口装不下的与正在冷却的。
    const candidates: QuiltPoolModel[] = [];
    for (const tier of quilt.tiers) {
      for (const model of tier.models) {
        const info = runtime.registry.getRealModel(model.provider, model.model);
        const rawWindow = info?.maxInputTokens;
        const window = typeof rawWindow === "number" && Number.isInteger(rawWindow) && rawWindow > 0 ? rawWindow : 0;
        if (window <= 0) continue;
        // 留出输出预算：可用输入 = 窗口 - 预留输出（budget.ts 的口径）。
        const usable = computeUsableInputTokens(window);
        if (usable < regionTokens) continue;
        candidates.push(model);
      }
    }
    if (candidates.length === 0) {
      ctx.logger?.debug?.(
        `[as-one compaction] no model can hold ${regionTokens} tokens in one pass; delegating to host summary`,
      );
      return undefined;
    }

    // 在"装得下"的模型里随机（摊平负载）；同 key 只取一次。
    const unique = new Map<string, QuiltPoolModel>();
    for (const model of candidates) unique.set(`${model.provider}/${model.model}`, model);
    const pool = [...unique.values()];
    const chosen = pool[Math.floor(Math.random() * pool.length)]!;

    // 用**宿主原样的 messages + 原样的提示词**发一次压缩请求。
    // 关键：直接把 options 里的 messages 传下去，不替换、不加后缀 ——
    // 这就是"与自带压缩一致"的全部含义。inflight>0 保证不递归。
    const blocks: Array<{ type: string; text?: string }> = [];
    const rawRequest = { ...options, provider: chosen.provider, model: chosen.model };
    // as-one：翻译成 provider=as-one + model=provider/model + 无 purpose，
    // 直连选中的真实成员。
    const request = toAsOneStreamOptions(rawRequest);
    for await (const chunk of chainCtx.llm.stream(request as never)) {
      if (chunk.type === "text-delta") {
        const last = blocks[blocks.length - 1];
        if (last?.type === "text") last.text = (last.text ?? "") + String(chunk.text ?? "");
        else blocks.push({ type: "text", text: String(chunk.text ?? "") });
      } else if (chunk.type === "block-end" && (chunk.block as { type?: string })?.type === "text") {
        blocks.push({ type: "text", text: String((chunk.block as { text?: unknown }).text ?? "") });
      }
    }
    const text = blocks.map((b) => b.text ?? "").join("").trim();
    if (text === "") return undefined;
    ctx.logger?.info?.(
      `[as-one compaction] one-pass summary via ${chosen.provider}/${chosen.model} (region ~${regionTokens} tok)`,
    );
    return text;
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

    // ── 2026-11 用户定案「先选模型，再切块」（模型列表各窗口不同）────────────
    // 1. 先按调度顺序（tier→成员）选一个主模型；它的窗口决定切块预算。
    // 2. 用该窗口算 budget 切块，每块都 preferredKey=主模型（锁定成员）。
    // 3. 若只切出一块 → 用 SINGLE_CHUNK_PROMPT 一次成稿，不走 tier-1 digest→merge。
    // 4. 归并模型另选窗口 >= 192k 的成员（用户定案）。
    const primary = chain.pickPrimaryModel(0, capacities);
    if (primary === undefined) {
      ctx.logger?.warn?.("[as-one compaction] no healthy model in pool; delegating to host summary");
      return undefined;
    }
    const primaryWindow = chain.modelWindow(primary, capacities);
    const budget = computeChunkBudget(primaryWindow, quilt.chunkRatio);
    const overlap = Math.max(0, Math.floor(budget * quilt.chunkOverlapRatio));
    ctx.logger?.info?.(
      `[as-one compaction] primary model ${primary.key} window=${primaryWindow} chunkBudget=${budget} regionTokens~=${regionTokens}`,
    );

    const jobs: ReturnType<typeof chunkJob>[] = [];
    let cursor = 0;
    let coreStart = 0;
    let index = 0;
    while (cursor < stage0Lines.length) {
      const { end, next } = sliceNextChunk(stage0Lines, cursor, budget, overlap);
      const slice = stage0Lines.slice(cursor, end);
      if (slice.length === 0) break;
      const tokens = slice.reduce((sum, line) => sum + lineTokenCost(line), 0);
      const coreTokens = stage0Lines.slice(coreStart, end).reduce((sum, line) => sum + lineTokenCost(line), 0);
      const cap = Math.max(1, Math.floor((mergeUsableInput * coreTokens) / Math.max(1, regionTokens)));
      index += 1;
      const meta = {
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
      };
      // 单块专用提示词：只有一块时一次成稿，不套 tier-1 chunk digest。
      // 先按常规切完再判断（sliceNextChunk 保证一次到尾即单块）。
      jobs.push(chunkJob(`chunk ${index}`, slice.join("\n"), meta, primary.key, cap));
      cursor = next;
      coreStart = end;
    }
    if (jobs.length === 0) return undefined;
    // 单块 → 替换 buildMessages 为单块专用提示词（anchored/quilt 都受益；
    // anchored 后续还会附锚点块）。
    if (jobs.length === 1) {
      const only = jobs[0] as ReturnType<typeof chunkJob>;
      const text = String(only.text ?? "");
      only.buildMessages = () => [
        { role: "user" as const, content: [{ type: "text" as const, text }] },
        { role: "user" as const, content: [{ type: "text" as const, text: SINGLE_CHUNK_PROMPT }] },
      ];
      ctx.logger?.info?.("[as-one compaction] single chunk → one-pass prompt (no merge)");
    }
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
      // 单块：SINGLE_CHUNK_PROMPT 一次成稿，无需归并。
      finalText = digests[0];
    } else if (mergeChain.canHoldMerge(mergeWindow, capacities)) {
      // 多块归并：优先用窗口 >= 192k 的成员（用户 2026-11 定案）。
      const mergeModel = mergeChain.pickMergeModel(capacities);
      const merge = mergeJob(digests, { sourceChunks: digests.length });
      if (mergeModel !== undefined) merge.preferredKey = mergeModel.key;
      ctx.logger?.info?.(
        `[as-one compaction] merge via ${mergeModel?.key ?? "auto"} window=${mergeModel ? mergeChain.modelWindow(mergeModel, capacities) : "?"} chunks=${digests.length}`,
      );
      const mergeResult = await mergeChain.run([merge], agent, options.signal, fallbackOptions);
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
