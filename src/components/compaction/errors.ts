/**
 * 本组件自用的错误形状与 errorChain（不 import 宿主 @deepseek-ai/dsh-*）。
 * @module src/components/compaction/errors
 */

/** DSH LlmError 的鸭子类型形状。 */
export interface LlmErrorLike extends Error {
  code?: string;
  providerRetryAfterMs?: number;
  failure?: { message?: string; code?: string };
}

export function isLlmErrorLike(error: unknown): error is LlmErrorLike {
  return error instanceof Error && typeof (error as LlmErrorLike).code === "string";
}

/** 把错误（含 cause 链）压成一行有界文本。 */
export function errorChainOf(error: unknown, limit = 500): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      const msg = current.message;
      if (msg && !parts.some((p) => p.includes(msg))) parts.push(msg);
      const cause = (current as Error & { cause?: unknown }).cause;
      if (cause === undefined) break;
      current = cause;
    } else {
      const text = String(current);
      if (text && !parts.includes(text)) parts.push(text);
      break;
    }
  }
  const joined = parts.length > 0 ? parts.join(": ") : String(error);
  return joined.length > limit ? `${joined.slice(0, limit - 1)}…` : joined;
}

/** 本组件抛出的 LLM 失败。 */
export class CompactLlmError extends Error {
  readonly code: string;
  readonly providerRetryAfterMs?: number;
  constructor(message: string, code: string, failure?: { providerRetryAfterMs?: number }) {
    super(message);
    this.name = "CompactLlmError";
    this.code = code;
    this.providerRetryAfterMs = failure?.providerRetryAfterMs;
  }
}
