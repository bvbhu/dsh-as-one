/**
 * Stage 0 预处理 + 重叠分块（合并自 quilt/lib/stage0/*）。
 *
 * 纪律（quilt 实测结论）：长度管理交给 overlap chunker；0a/0b 只做无损或
 * 近无损清理（去重、ANSI 噪音、log 折叠），不在压缩前二次删正文（实测掉 ~35 分 recall）。
 *
 * @module src/components/compaction/stage0
 */

import { countTokens } from "./tokenizer.js";
import type { QuiltPreprocessing } from "./config.js";

/** 一行的 token 成本（含换行），用精确 tokenizer。 */
export function lineTokenCost(line: string): number {
  return countTokens(line) + 1;
}

/** 把一个消息的内容块展平成文本行。 */
export function messageContentLines(message: { role?: unknown; content?: unknown }): string[] {
  const lines: string[] = [];
  const content = message.content;
  if (!Array.isArray(content)) {
    if (typeof content === "string") lines.push(...content.split(/\r\n|\r|\n/));
    return lines;
  }
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    switch (b.type) {
      case "text":
      case "reasoning":
        lines.push(...String(b.text ?? "").split(/\r\n|\r|\n/));
        break;
      case "tool-call":
        lines.push(`[tool-call ${String(b.name ?? "")}]`);
        lines.push(...String(b.arguments ?? "").split(/\r\n|\r|\n/));
        break;
      case "image":
      case "file": {
        const name = (b.attachment as { name?: unknown } | undefined)?.name;
        lines.push(`[${String(b.type)}${name === undefined ? "" : `: ${String(name)}`}]`);
        break;
      }
      default:
        lines.push(`[block ${String(b.type)}]`);
        try {
          lines.push(...JSON.stringify(b).split(/\r\n|\r|\n/));
        } catch {
          lines.push(String(b));
        }
    }
  }
  return lines;
}

/** 消息列表 → 行文档（每条消息一行 role header）。 */
export function extractRegionLines(messages: readonly { role?: unknown; content?: unknown }[]): string[] {
  const lines: string[] = [];
  for (const message of messages) {
    lines.push(`[${String(message.role)}]`);
    lines.push(...messageContentLines(message));
  }
  return lines;
}

/** 相邻重复行折叠（保留首次）。 */
export function dedupLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  let previous: string | undefined;
  for (const line of lines) {
    if (line === previous) continue;
    out.push(line);
    previous = line;
  }
  return out;
}

const ANSI_ESCAPE = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const CURSOR_MARKER = /^\s*[\^~]{4,}\s*$/;
const LONG_SEPARATOR = /^\s*([^\s\w])\1{15,}\s*$/;

/** 去掉终端噪音：ANSI、光标标记、长分隔符。 */
export function purgeNoiseLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(ANSI_ESCAPE, "");
    if (CURSOR_MARKER.test(line) || LONG_SEPARATOR.test(line)) continue;
    out.push(line);
  }
  return out;
}

/** 连续 ≥3 空行压成 1。 */
export function skipBlankBlocks(lines: readonly string[]): string[] {
  const out: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      blankRun += 1;
      if (blankRun === 3) out.push("");
      continue;
    }
    blankRun = 0;
    out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === "") out.pop();
  return out;
}

const FENCE_OPEN = /^```[^\s`]*\s*$/;
const FENCE_CLOSE = /^```\s*$/;

function indentationDepth(line: string): number {
  let columns = 0;
  for (const char of line) {
    if (char === " ") columns += 1;
    else if (char === "\t") columns += 4;
    else break;
  }
  return Math.floor(columns / 4);
}

/** 代码 fence 内超过 maxDepth 的行折叠成 [condensed: N lines removed]。 */
export function astSkeletonize(lines: readonly string[], maxDepth: number): string[] {
  const out: string[] = [];
  let index = 0;
  let inFence = false;
  while (index < lines.length) {
    const line = lines[index] as string;
    if (inFence) {
      if (FENCE_CLOSE.test(line)) {
        inFence = false;
        out.push(line);
        index += 1;
        continue;
      }
      if (indentationDepth(line) <= maxDepth) {
        out.push(line);
      } else {
        let removed = 0;
        while (index < lines.length && !FENCE_CLOSE.test(lines[index] as string) && indentationDepth(lines[index] as string) > maxDepth) {
          removed += 1;
          index += 1;
        }
        out.push(`[condensed: ${removed} lines removed]`);
        continue;
      }
      index += 1;
      continue;
    }
    out.push(line);
    if (FENCE_OPEN.test(line)) inFence = true;
    index += 1;
  }
  return out;
}

const LOG_TIMESTAMP = /^\S+\s+\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
const LOG_LEVEL = /\b(?:INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\b/;

function findLogRuns(lines: readonly string[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  const isLogLine = (line: string) => LOG_TIMESTAMP.test(line) || LOG_LEVEL.test(line);
  for (let index = 0; index <= lines.length; index += 1) {
    const logLike = index < lines.length && isLogLine(lines[index] as string);
    if (logLike && start === -1) start = index;
    if (!logLike && start !== -1) {
      if (index - start >= 4) runs.push([start, index]);
      start = -1;
    }
  }
  return runs;
}

/** 长 log run 折叠：sampled head + metadata + sampled tail。 */
export function logCondenseLines(
  lines: readonly string[],
  mode: "balanced" | "head" | "tail",
  maxLines: number,
): string[] {
  const runs = findLogRuns(lines);
  if (runs.length === 0) return [...lines];
  const out: string[] = [];
  let cursor = 0;
  for (const [start, end] of runs) {
    const count = end - start;
    out.push(...lines.slice(cursor, start));
    if (count <= maxLines) {
      out.push(...lines.slice(start, end));
    } else if (maxLines === 0) {
      out.push(`[condensed: ${count} lines removed]`);
    } else {
      const headCount = mode === "balanced" ? Math.ceil(maxLines / 2) : mode === "head" ? maxLines : 0;
      const tailCount = mode === "balanced" ? Math.floor(maxLines / 2) : mode === "head" ? 0 : maxLines;
      out.push(...lines.slice(start, start + headCount));
      out.push(`[condensed: ${count - maxLines} lines removed]`);
      out.push(...lines.slice(end - tailCount, end));
    }
    cursor = end;
  }
  out.push(...lines.slice(cursor));
  return out;
}

/** Stage 0 pipeline（0a + 0b）。 */
export function runStage0(
  messages: readonly { role?: unknown; content?: unknown }[],
  preprocessing: QuiltPreprocessing,
): string[] {
  let lines = extractRegionLines(messages);
  if (preprocessing.dedup) lines = dedupLines(lines);
  if (preprocessing.purgeErrors) lines = purgeNoiseLines(lines);
  lines = skipBlankBlocks(lines);
  if (preprocessing.astSkeleton.enabled) {
    lines = astSkeletonize(lines, preprocessing.astSkeleton.maxDepth);
  }
  lines = logCondenseLines(lines, preprocessing.logCondense.mode, preprocessing.logCondense.maxLines);
  return lines;
}

const SENTENCE_END_CHARS = new Set([".", "?", "!", ":", ";", ",", "}", "]", ")", '"', "'", "`"]);

function isBoundaryLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || SENTENCE_END_CHARS.has(trimmed[trimmed.length - 1] ?? "");
}

const ALIGN_WINDOW_LINES = 12;

function alignEndBoundary(lines: readonly string[], start: number, candidate: number): number {
  const low = Math.max(start + 1, candidate - ALIGN_WINDOW_LINES);
  for (let cut = candidate; cut >= low; cut -= 1) {
    if (isBoundaryLine(lines[cut - 1] as string)) return cut;
  }
  return candidate;
}

function overlapStart(lines: readonly string[], costs: readonly number[], start: number, end: number, overlapTokens: number): number {
  if (overlapTokens <= 0) return end;
  let cursor = end;
  let acc = 0;
  while (cursor > start && acc < overlapTokens) {
    cursor -= 1;
    acc += costs[cursor] as number;
  }
  return cursor;
}

function sliceAt(
  lines: readonly string[],
  costs: readonly number[],
  start: number,
  chunkTokens: number,
  overlapTokens: number,
): { end: number; next: number } {
  let end = start;
  let acc = 0;
  while (end < lines.length && (end === start || acc + (costs[end] as number) <= chunkTokens)) {
    acc += costs[end] as number;
    end += 1;
  }
  if (end >= lines.length) return { end: lines.length, next: lines.length };
  const aligned = alignEndBoundary(lines, start, end);
  const overlap = overlapStart(lines, costs, start, aligned, overlapTokens);
  return { end: aligned, next: overlap > start ? overlap : aligned };
}

/** 从 start 切下一块，返回 { end, next }（end 为独占尾，next 为下一块 core 起点）。 */
export function sliceNextChunk(
  lines: readonly string[],
  start: number,
  chunkTokens: number,
  overlapTokens: number,
): { end: number; next: number } {
  if (start >= lines.length) return { end: lines.length, next: lines.length };
  const costs = lines.map(lineTokenCost);
  return sliceAt(lines, costs, start, chunkTokens, overlapTokens);
}

/** 整文档分块（纯函数 helper，测试用）。 */
export function chunkLines(lines: readonly string[], chunkTokens: number, overlapTokens: number): Array<{ start: number; end: number; lines: string[] }> {
  if (lines.length === 0) return [];
  const costs = lines.map(lineTokenCost);
  const chunks: Array<{ start: number; end: number; lines: string[] }> = [];
  let start = 0;
  while (start < lines.length) {
    const sliced = sliceAt(lines, costs, start, chunkTokens, overlapTokens);
    chunks.push({ start, end: sliced.end, lines: lines.slice(start, sliced.end) });
    if (sliced.next <= start) break;
    start = sliced.next;
  }
  return chunks;
}
