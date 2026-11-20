/**
 * 摘要提示词与 <session-search-anchors> 锚点块（搬自 quilt/lib/summarize.js）。
 *
 * 锚点块是给**模型**读的机器可读恢复线索（不是 DSH 工具协议的入参）：
 * DSH 的 session-search 工具本身没有解析这个块的代码，模型读到后用
 * session_event_search(session_id, seq_from, seq_to, query) 精确定位原文。
 * 详见 docs/compaction-integration.md。
 *
 * @module src/components/compaction/summarize
 */

import { CompactLlmError } from "./errors.js";
import { toAsOneStreamOptions } from "./as-one-call.js";

export const DEFAULT_MAX_TOKENS = 32768;

const SUMMARY_OPEN_TAG = "<compacted-summary>";
const SUMMARY_CLOSE_TAG = "</compacted-summary>";

export const ANCHOR_OPEN_TAG = "<session-search-anchors>";
export const ANCHOR_CLOSE_TAG = "</session-search-anchors>";

/** 压缩结果末尾附的恢复指令（anchored 模式）。 */
export const ANCHOR_PROMPT_INSTRUCTION = [
  "Recovery: the original conversation is still indexed by @deepseek-ai/dsh-experimental-session-search, including shadowed events.",
  "To recover exact wording, call session_event_search with the session_id and seq_from/seq_to above, then session_event_read on the matching seq.",
  "Use business-specific keywords from the summary (paths, identifiers, error strings) as the query; avoid generic tool names.",
].join("\n");

/** 渲染机器可读锚点块（单行 JSON）。 */
export function buildAnchorBlock(anchor: {
  id: string;
  sessionId: string | null;
  seqStart: number | null;
  seqEnd: number | null;
  chunks: Array<{ i: number; lines: [number | null, number | null]; tokens: number | null; anchor: string }>;
}): string {
  return [ANCHOR_OPEN_TAG, JSON.stringify(anchor), ANCHOR_CLOSE_TAG].join("\n");
}

export const CHUNK_PROMPT = [
  "You are a tier-1 (Capture) stage of a hierarchical compaction engine. Condense the conversation EXCERPT above into a terse factual digest that lets another model resume without loss of essential context.",
  "",
  "Rules:",
  "- Use terse markdown bullets under stable headings: ## Request, ## Decisions, ## Files and Code, ## Errors and Fixes, ## Pending Work, ## Next Step, ## Critical Context.",
  "- Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.",
  "- Capture user feedback and corrections faithfully.",
  "- Keep 2-5 distinctive literal retrieval keys per topic (project names, chip/model numbers, branch names, exact error strings). These are used with full-text session search to recover the original text; generic words such as \"tool\" or \"file\" are useless.",
  "- If an excerpt section is empty, write \"(none)\". Never invent facts.",
  "- Output only the digest text: do not call any tool or take any other action.",
].join("\n");

export function digestCapInstruction(capTokens: number | undefined | null): string {
  if (capTokens === undefined || capTokens === null) return "";
  return `- Keep the digest at or under ${capTokens} tokens: a longer digest would overflow the single merge call. Prefer density over exhaustiveness.`;
}

export const MERGE_PROMPT = [
  "You are a tier-2 (Distill) stage of a hierarchical compaction engine. The numbered digests above are summaries of consecutive, overlapping excerpts of one conversation.",
  "",
  "Merge them into ONE consolidated checkpoint with these terse markdown sections, in order:",
  "## Primary Request and Intent, ## Key Technical Concepts, ## Files and Code, ## Errors and Fixes, ## Pending Jobs, ## Current Work, ## Next Step, ## Critical Context.",
  "",
  "Rules:",
  "- Deduplicate facts repeated across overlapping digests; keep each fact once.",
  "- Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.",
  "- Capture user feedback and corrections faithfully.",
  "- Preserve the distinctive literal retrieval keys from the chunk digests (project names, model/chip numbers, branches, exact error strings). Do not replace them with vague descriptions.",
  "- Write \"(none)\" for an empty section; never drop a section.",
  "- If the conversation already contains a <compacted-summary> block, it is a PRIOR checkpoint: preserve still-true facts, drop stale ones, and merge newer information into this single consolidated summary.",
  "- If the conversation contains a <session-search-anchors> block, copy that block verbatim into the final checkpoint; it points to the original indexed events. Never invent or rewrite session ids or seq numbers.",
  "- Do NOT mention this summarization request or that the context was compacted.",
  "- Output only the checkpoint text: do not call any tool or take any other action.",
].join("\n");

/**
 * 单块专用提示词（anchored 模式，只有一块时）。
 *
 * 2026-11 用户定案：先选模型、再按该模型窗口切块；**只有一块**时不再走
 * 「chunk digest → merge」两段式（那会给单块套 tier-1 的精简提示词，丢细节），
 * 而是用这份**一次成稿**的提示词直接产出最终 checkpoint（含与多块路径相同的
 * 结构章节与检索键要求），最后再由 intercept 附上锚点块。
 */
export const SINGLE_CHUNK_PROMPT = [
  "You are a compaction engine condensing ONE contiguous excerpt of a conversation into a single consolidated checkpoint that lets another model resume with no loss of essential context.",
  "",
  "Output terse markdown under these sections, in order:",
  "## Primary Request and Intent, ## Key Technical Concepts, ## Files and Code, ## Errors and Fixes, ## Pending Work, ## Current Work, ## Next Step, ## Critical Context.",
  "",
  "Rules:",
  "- Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.",
  "- Capture user feedback and corrections faithfully.",
  "- Keep 2-5 distinctive literal retrieval keys per topic (project names, model/chip numbers, exact error strings) for full-text session search; avoid generic words.",
  "- Write \"(none)\" for an empty section; never drop a section, never invent facts.",
  "- If a prior <compacted-summary> block is present, preserve still-true facts and merge newer information into this one checkpoint.",
  "- Do NOT mention this summarization request or that the context was compacted.",
  "- Output only the checkpoint text: do not call any tool or take any other action.",
].join("\n");

export const CHECKPOINT_PROMPT = [
  "You are a compaction engine. Condense the conversation ABOVE into one consolidated checkpoint that lets another model resume the work with no loss of essential context.",
  "",
  "Output terse markdown under these sections, in order:",
  "## Primary Request and Intent, ## Key Technical Concepts, ## Files and Code, ## Errors and Fixes, ## Pending Jobs, ## Current Work, ## Next Step, ## Critical Context.",
  "",
  "Rules:",
  "- Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.",
  "- Capture user feedback and corrections faithfully.",
  "- Write \"(none)\" for an empty section; never drop a section.",
  "- If the conversation already contains a <compacted-summary> block, it is a PRIOR checkpoint: preserve still-true facts, drop stale ones, and merge newer information into this single consolidated summary.",
  "- Do NOT mention this summarization request or that the context was compacted.",
  "- Output only the checkpoint text: do not call any tool or take any other action.",
].join("\n");

const CHECKPOINT_PREAMBLE = "This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.";

export interface QuiltPromptConfig {
  chunkPromptSuffix: string;
  mergePromptSuffix: string;
}

export function chunkInstruction(config: QuiltPromptConfig, capTokens?: number | null): string {
  const cap = digestCapInstruction(capTokens);
  const parts = [CHUNK_PROMPT];
  if (cap.length > 0) parts.push(cap);
  if (config.chunkPromptSuffix.length > 0) parts.push(config.chunkPromptSuffix);
  return parts.join("\n\n");
}

export function mergeInstruction(config: QuiltPromptConfig): string {
  return config.mergePromptSuffix.length === 0
    ? MERGE_PROMPT
    : `${MERGE_PROMPT}\n\n${config.mergePromptSuffix}`;
}

export function fallbackInstruction(config: QuiltPromptConfig): string {
  return config.mergePromptSuffix.length === 0
    ? CHECKPOINT_PROMPT
    : `${CHECKPOINT_PROMPT}\n\n${config.mergePromptSuffix}`;
}

export function chunkMessages(chunkText: string, config: QuiltPromptConfig, capTokens?: number | null): Array<{ role: "user"; content: Array<{ type: "text"; text: string }> }> {
  return [
    { role: "user", content: [{ type: "text", text: chunkText }] },
    { role: "user", content: [{ type: "text", text: chunkInstruction(config, capTokens) }] },
  ];
}

export function mergeMessages(digests: readonly string[], config: QuiltPromptConfig): Array<{ role: "user"; content: Array<{ type: "text"; text: string }> }> {
  const joined = digests.map((digest, index) => `--- digest ${index + 1} ---\n${digest}`).join("\n\n");
  return [
    { role: "user", content: [{ type: "text", text: joined }] },
    { role: "user", content: [{ type: "text", text: mergeInstruction(config) }] },
  ];
}

/** 把文本块拼成一份摘要字符串（去掉非 text 块）。 */
export function blocksToText(blocks: readonly { type: string; text?: string }[]): string {
  return blocks.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("\n");
}

/** 给最终摘要加上 durable checkpoint framing（与 dsh-compaction-basic 一致）。 */
export function frameSummary(summary: string): string {
  return `${CHECKPOINT_PREAMBLE}\n\n${SUMMARY_OPEN_TAG}\n${summary}\n${SUMMARY_CLOSE_TAG}`;
}

/**
 * 运行一次 ctx.llm.stream 并收齐 text 块。
 *
 * ⚠️ as-one 适配（2026-11）：若 ctx 上挂了 `asOneCall=true`（由 intercept 注入），
 * 调用前把「组件视角的 provider/model + purpose=compaction」翻译成 as-one
 * 适配器能识别的「provider=as-one + model=provider/model + 无 purpose」。
 * 不挂开关时保持原样（兼容 quilt 原插件的单测与调用方）。
 */
export async function streamText(
  ctx: {
    llm: { stream(options: Record<string, unknown>): AsyncIterable<Record<string, unknown>> };
    asOneCall?: boolean;
    asOneProvider?: string;
  },
  options: Record<string, unknown>,
): Promise<{ summary: Array<{ type: string; text?: string }>; usage?: unknown }> {
  const blocks: Array<{ type: string; text?: string }> = [];
  let usage: unknown;
  const callOptions = ctx.asOneCall === true ? toAsOneStreamOptions(options, ctx.asOneProvider) : options;
  for await (const chunk of ctx.llm.stream(callOptions)) {
    if (chunk.type === "text-delta") {
      const last = blocks[blocks.length - 1];
      if (last?.type === "text") last.text = (last.text ?? "") + String(chunk.text ?? "");
      else blocks.push({ type: "text", text: String(chunk.text ?? "") });
    } else if (chunk.type === "block-end") {
      const block = chunk.block as { type?: string; text?: string } | undefined;
      if (block?.type === "text") blocks.push({ type: "text", text: String(block.text ?? "") });
    } else if (chunk.type === "usage") {
      usage = chunk.usage;
    } else if (chunk.type === "finish") {
      const reason = chunk.reason as { kind?: string; failure?: { message?: string; code?: string; providerRetryAfterMs?: number } } | undefined;
      if (reason?.kind === "error" || reason?.kind === "aborted") {
        const failure = reason.failure ?? { message: "stream aborted", code: "ABORTED" };
        throw new CompactLlmError(failure.message ?? "stream failed", failure.code ?? "UNKNOWN", failure);
      }
      if (reason?.kind === "max-tokens") {
        throw new CompactLlmError("summarization truncated at the token cap", "MAX_TOKENS");
      }
    }
  }
  const summary = blocks.filter((block) => block.type === "text" && (block.text ?? "").trim().length > 0);
  if (summary.length === 0) throw new Error("summarization produced no text summary content");
  return { summary, usage };
}

/** 按 DSH provider retryPolicy 重试（与 quilt/lib/summarize.js 同语义）。 */
export async function streamTextWithRetry(
  ctx: {
    llm: {
      stream(options: Record<string, unknown>): AsyncIterable<Record<string, unknown>>;
      providerRetryPolicy?: (provider: string) => unknown;
    };
    asOneCall?: boolean;
    asOneProvider?: string;
    logger?: { warn?(message: string): void };
  },
  options: Record<string, unknown>,
  internals: { random?: () => number } = {},
): Promise<{ summary: Array<{ type: string; text?: string }>; usage?: unknown }> {
  interface RetryPolicy {
    mode?: string;
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    jitterRatio?: number;
    retryableCodes?: string[];
  }
  let policy: RetryPolicy | undefined;
  try {
    policy = ctx.llm.providerRetryPolicy?.(String(options.provider)) as RetryPolicy | undefined;
  } catch {
    policy = undefined;
  }
  if (policy === undefined || typeof policy !== "object") return streamText(ctx, options);

  const random = internals.random ?? Math.random;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await streamText(ctx, options);
    } catch (error) {
      const signal = options.signal as AbortSignal | undefined;
      if (signal?.aborted === true) throw error;
      const code = error instanceof CompactLlmError ? error.code : undefined;
      const retryable = policy.mode === "always"
        ? true
        : typeof code === "string" && Array.isArray(policy.retryableCodes) && policy.retryableCodes.includes(code);
      if (!retryable) throw error;
      if (policy.mode !== "always" && attempt >= (policy.maxRetries ?? 0)) throw error;
      const after = error instanceof CompactLlmError ? error.providerRetryAfterMs : undefined;
      const exponent = Math.min(attempt, 1024);
      const exponential = Math.min((policy.initialDelayMs ?? 1000) * 2 ** exponent, policy.maxDelayMs ?? 60000);
      const jitterRatio = policy.jitterRatio ?? 0.1;
      const jitter = 1 - jitterRatio + 2 * jitterRatio * random();
      const delayMs = typeof after === "number" && Number.isFinite(after) && after > 0 && after <= (policy.maxDelayMs ?? 60000)
        ? after
        : Math.min(exponential * jitter, policy.maxDelayMs ?? 60000);
      ctx.logger?.warn?.(`[as-one compaction] retry route=${String(options.provider)}/${String(options.model)} attempt=${attempt + 1} code=${code ?? "unknown"} delayMs=${Math.round(delayMs)}`);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
