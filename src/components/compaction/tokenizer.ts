/**
 * Token 计数：优先复用 as-one 内核的 DeepSeek V4 精确 tokenizer，
 * 原 quilt 的 gzip tokenizer.json 方案不再需要（避免随组件带 1.8MB 资产）。
 *
 * @module src/components/compaction/tokenizer
 */

import { deepseekTokenCount } from "@as-one/core/src/tokenizer/deepseek.js";

/** 精确 token 数（与原 quilt countTokens 同语义）。 */
export function countTokens(text: string): number {
  return deepseekTokenCount(text);
}

/** 一条消息的文本 token 成本（内容块求和）。 */
export function messageTokens(message: { content?: unknown }): number {
  const content = message.content;
  if (typeof content === "string") return countTokens(content);
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" || b.type === "reasoning") total += countTokens(String(b.text ?? ""));
    else if (b.type === "tool-call") total += countTokens(`${String(b.name ?? "")} ${String(b.arguments ?? "")}`);
    else total += countTokens(JSON.stringify(b));
  }
  return total;
}
