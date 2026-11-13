/**
 * compact 请求的分块规划 —— 只借用 dsh-quilt-compact 的**压缩算法**。
 *
 * 不参考它的拦截逻辑：不替换 ctx.compaction、不注册 agent/pre-step 或
 * agent/request-error、不接管模型池冷却与 tier 降级。这里只做纯函数：
 * 把一次放不下的摘要请求，按目标模型的可用输入预算切成若干块，逐块出
 * digest，最后单级归并。
 *
 * 三条纪律（来自 quilt 的实测结论）：
 * 1. Stage 0 只做无损/近无损清理；第二次「内容删除式」长度控制会重复分块
 *    的工作，实测掉约 35 分 recall。
 * 2. 块大小按**处理它的模型**的可用输入预算现算，不按历史比例拍脑袋。
 * 3. 每块 digest 上限按块占区域总长的比例分配，保证归并不再超窗口。
 */

import type { ChatMessage } from "@as-one/core/src/gateway/types.js";

export interface CompactChunk {
  /** 该块的文本行（已展平、已占位化）。 */
  lines: string[];
  /** 该块 digest 的输出上限（token）。 */
  capTokens: number;
}

export interface CompactChunkPlan {
  chunks: CompactChunk[];
  /** 是否真的需要分块（单块时调用方可跳过归并）。 */
  split: boolean;
  /** 展平后的总行数。 */
  totalLines: number;
}

export interface CompactChunkOptions {
  /** 目标模型可用输入预算（token）；<=0 时不分块。 */
  inputBudgetTokens: number;
  /** 单块占可用输入预算的比例，默认 0.8。 */
  chunkRatio?: number;
  /** 相邻块重叠占块预算的比例，默认 0.1。 */
  overlapRatio?: number;
  /** digest 输出总预算（token），默认 4096。 */
  digestBudgetTokens?: number;
}

/** 一行文本 → 粗略 token 估算（不引入分词器依赖，保守偏高）。 */
export function lineTokens(line: string): number {
  return Math.max(1, Math.ceil(line.length / 3));
}

/** Stage 0：无损清理（相邻重复行合并、连续空行压缩、ANSI 噪音清除）。 */
export function stage0Clean(lines: string[]): string[] {
  const out: string[] = [];
  let last = "";
  for (const raw of lines) {
    const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\r/g, "");
    if (line.trim() === "" && (out.length === 0 || out[out.length - 1]!.trim() === "")) continue;
    if (line === last && line.trim() !== "") continue;
    out.push(line);
    last = line;
  }
  return out;
}

/**
 * 把消息展平成行文档。**图片不读像素**：只留可寻址占位，
 * 摘要 checkpoint 里保存的是引用而不是图像内容。
 */
export function flattenMessages(messages: readonly ChatMessage[]): string[] {
  const lines: string[] = [];
  for (const message of messages) {
    lines.push(`[${message.role}]`);
    const content = message.content;
    if (typeof content === "string") {
      lines.push(...content.split("\n"));
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part.type === "text") {
        lines.push(...String(part.text ?? "").split("\n"));
      } else if (part.type === "image_url") {
        const url = String(part.image_url?.url ?? "");
        const ref = url.startsWith("data:")
          ? `attachment:${url.slice(0, 64)}`
          : url || "attachment:unknown";
        lines.push(`[image: ${ref}]`);
      } else {
        lines.push(`[${String((part as { type?: string }).type ?? "unknown")}]`);
      }
    }
  }
  return lines;
}

/** 按可用输入预算切块；单块能装下时返回 split=false。 */
export function planCompactChunks(
  messages: readonly ChatMessage[],
  options: CompactChunkOptions,
): CompactChunkPlan {
  const lines = stage0Clean(flattenMessages(messages));
  const ratio = options.chunkRatio ?? 0.8;
  const overlap = options.overlapRatio ?? 0.1;
  const digestBudget = options.digestBudgetTokens ?? 4096;
  const coreBudget = Math.max(
    1,
    Math.floor(Math.max(0, options.inputBudgetTokens) * ratio),
  );
  const tokens = lines.map(lineTokens);
  const total = tokens.reduce((a, b) => a + b, 0);

  if (!(coreBudget > 0) || total <= coreBudget) {
    return {
      chunks: [{ lines, capTokens: Math.max(256, Math.min(digestBudget, total)) }],
      split: false,
      totalLines: lines.length,
    };
  }

  const chunks: CompactChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let used = 0;
    let end = start;
    while (end < lines.length && used + tokens[end]! <= coreBudget) {
      used += tokens[end]!;
      end += 1;
    }
    if (end === start) end = start + 1;
    chunks.push({
      lines: lines.slice(start, end),
      capTokens: 0,
    });
    if (end >= lines.length) break;
    const back = Math.max(1, Math.floor((end - start) * overlap));
    start = Math.max(end - back, start + 1);
  }

  const weight = chunks.reduce((a, c) => a + c.lines.length, 0) || 1;
  for (const chunk of chunks) {
    chunk.capTokens = Math.max(256, Math.floor((digestBudget * chunk.lines.length) / weight));
  }
  return { chunks, split: chunks.length > 1, totalLines: lines.length };
}

/** 把逐块 digest 拼成一次归并请求的 user 文本。 */
export function buildMergePrompt(digests: readonly string[]): string {
  const parts = digests.map(
    (digest, i) => `## 分块 ${i + 1}/${digests.length}\n${digest}`,
  );
  return [
    "把下列分块摘要合并成一份完整、不重复的会话检查点。保留精确文件路径、命令、",
    "错误原文、标识符与数值；不要复述本指令，不要输出额外解释。",
    "",
    ...parts,
  ].join("\n");
}
