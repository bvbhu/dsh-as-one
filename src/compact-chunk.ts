/**
 * compact 请求的分块规划 —— 只借用 dsh-quilt-compact 的**压缩算法**。
 *
 * 不参考它的拦截逻辑：不替换 ctx.compaction、不注册 agent/pre-step 或
 * agent/request-error、不接管模型池冷却与 tier 降级。这里只做纯函数：
 * 把一次放不下的摘要请求，按目标模型的可用输入预算切成若干块，逐块出
 * digest，最后按需归并。
 *
 * 三条纪律（来自 quilt 的实测结论）：
 * 1. Stage 0 只做无损/近无损清理；第二次「内容删除式」长度控制会重复分块
 *    的工作，实测掉约 35 分 recall。
 * 2. 块大小按**处理它的模型**的可用输入预算现算，不按历史比例拍脑袋。
 * 3. 每块 digest 上限按块占区域总长的比例分配，保证归并不再超窗口。
 *
 * ## 2026-11-14:为什么改（实测数据）
 *
 * 上一版把块预算写死 24,000 token、按 `length / 3` 估 token、Stage 0 只去重
 * 相邻行。拿本机最大的那个会话（`session-3c4b2c9d`，7,439 条消息 / 10.73M
 * 字符 ≈ 3.07M token）量出来是 **179 块串行** —— 每块一次完整往返，光排队
 * 就几十分钟，用户看到的是一条 `This operation was aborted`。
 *
 * 三处都改了：
 * - token 估算换成 `estimateTextTokens`（中日韩按 0.75~1.0、ASCII 按 3.4 字），
 *   旧的 `length / 3` 在中文会话里**低估近 3 倍**，块会悄悄超窗；
 * - Stage 0 增加「超长工具输出截断」：同一份会话里工具结果是 4.97M 字符
 *   （46%），按 1,200 字符截尾能省 2.69M 字符（25%）而不丢叙事骨架；
 * - 摘要预算按**区域大小**现算（区域的 25%，上限 8,192），于是小区域也不会
 *   产出比原文更长的摘要 —— 宿主 `summary is not smaller than the shadowed
 *   content` 那条校验失败正是这么来的（区域 136 token、摘要 390 token）。
 */

import type { ChatMessage } from "@as-one/core/src/gateway/types.js";
import { estimateTextTokens } from "./gateway-upstream-context.js";

export interface CompactChunk {
  /** 该块的文本行（已展平、已占位化）。 */
  lines: string[];
  /** 该块 digest 的输出上限(token)。 */
  capTokens: number;
  /** 该块的 token 估算(切块时算过,归并预算与日志都用它)。 */
  tokens: number;
}

export interface CompactChunkPlan {
  chunks: CompactChunk[];
  /** 是否真的需要分块(单块时调用方可跳过归并)。 */
  split: boolean;
  /** 展平后的总行数。 */
  totalLines: number;
  /** 展平后的总 token 估算(截断之后)。 */
  regionTokens: number;
  /** Stage 0 截掉多少字符(日志用:衡量这次压缩省了多少输入)。 */
  trimmedChars: number;
}

export interface CompactChunkOptions {
  /** 目标模型可用输入预算(token)；<=0 时不分块。 */
  inputBudgetTokens: number;
  /** 单块占可用输入预算的比例，默认 0.8。 */
  chunkRatio?: number;
  /** 相邻块重叠占块预算的比例，默认 0.08。 */
  overlapRatio?: number;
  /** digest 输出总预算(token)；不给则按区域大小算(区域的 25%，上限 8192)。 */
  digestBudgetTokens?: number;
  /** 工具输出超过这个字符数就截成「头 + 省略 + 尾」；0 关闭，默认 1200。 */
  toolOutputChars?: number;
}

/** 一行文本 → token 估算。中日韩/代码/ASCII 分开计,不再按长度一刀切。 */
export function lineTokens(line: string): number {
  return Math.max(1, estimateTextTokens(line));
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

/** 截断后保留的头部/尾部字符数(与网关 `truncateMiddle` 同一口径)。 */
const TRIM_HEAD_CHARS = 900;
const TRIM_TAIL_CHARS = 300;

/**
 * Stage 0 的第二刀：把超长工具输出截成「头 + 省略标记 + 尾」。
 *
 * 为什么先动工具结果：它天然可再造（重跑一次命令就有），而用户/助手的叙述
 * 不可再造。实测那个 10.73M 字符的会话里工具结果占 46%，其中 p99 是 10,923
 * 字符 —— 截断省 25% 输入 token，摘要质量几乎不受影响。
 */
function trimToolOutputs(
  messages: readonly ChatMessage[],
  limit: number,
): { messages: ChatMessage[]; trimmedChars: number } {
  if (!(limit > 0)) return { messages: [...messages], trimmedChars: 0 };
  let trimmed = 0;
  const out = messages.map((message) => {
    if (message.role !== "tool") return message;
    const content = message.content;
    if (typeof content !== "string") return message;
    // 阈值小于「头 + 尾」时截断反而会变长 —— 抬到 1200 再来比。
    if (content.length <= Math.max(limit, TRIM_HEAD_CHARS + TRIM_TAIL_CHARS)) return message;
    const head = content.slice(0, TRIM_HEAD_CHARS);
    const tail = content.slice(content.length - TRIM_TAIL_CHARS);
    const removed = content.length - head.length - tail.length;
    trimmed += removed;
    return {
      ...message,
      content: `${head}\n…[As One:压缩时省略 ${removed} 字符工具输出]…\n${tail}`,
    };
  });
  return { messages: out, trimmedChars: trimmed };
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

/** 摘要总预算：区域的 25%（宿主校验要求严格更小），下限 48、上限 8192。 */
export function digestBudgetFor(regionTokens: number, ceiling = 8192): number {
  if (!(regionTokens > 0)) return 48;
  return Math.max(48, Math.min(ceiling, Math.floor(regionTokens * 0.25)));
}

/** 按可用输入预算切块；单块能装下时返回 split=false。 */
export function planCompactChunks(
  messages: readonly ChatMessage[],
  options: CompactChunkOptions,
): CompactChunkPlan {
  const trimmed = trimToolOutputs(messages, options.toolOutputChars ?? 1200);
  const lines = stage0Clean(flattenMessages(trimmed.messages));
  const ratio = options.chunkRatio ?? 0.8;
  const overlap = options.overlapRatio ?? 0.08;
  const coreBudget = Math.max(
    1,
    Math.floor(Math.max(0, options.inputBudgetTokens) * ratio),
  );
  const tokens = lines.map(lineTokens);
  const total = tokens.reduce((a, b) => a + b, 0);
  const digestBudget = options.digestBudgetTokens ?? digestBudgetFor(total);

  if (!(coreBudget > 0) || total <= coreBudget) {
    return {
      chunks: [
        {
          lines,
          capTokens: Math.max(48, Math.min(digestBudget, digestBudgetFor(total))),
          tokens: total,
        },
      ],
      split: false,
      totalLines: lines.length,
      regionTokens: total,
      trimmedChars: trimmed.trimmedChars,
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
    if (end === start) {
      // 单行自己就超预算(压缩过的 JSON、长 base64、一万行的日志被拼成一行):
      // 按字符硬切,否则这一块会带着 3~4 倍预算的体积发给上游 —— 正是「明明
      // 分了块还是被 context_length_exceeded 打回」的来源。3 字符/token 是
      // ASCII 的保守下界,宁可多切一块。
      const line = lines[start] ?? "";
      const pieceChars = Math.max(512, Math.floor(coreBudget * 3));
      for (let from = 0; from < line.length; from += pieceChars) {
        const piece = line.slice(from, from + pieceChars);
        chunks.push({ lines: [piece], capTokens: 0, tokens: lineTokens(piece) });
      }
      start += 1;
      continue;
    }
    chunks.push({ lines: lines.slice(start, end), capTokens: 0, tokens: used });
    if (end >= lines.length) break;
    const back = Math.max(1, Math.floor((end - start) * overlap));
    start = Math.max(end - back, start + 1);
  }

  const weight = chunks.reduce((a, c) => a + c.lines.length, 0) || 1;
  for (const chunk of chunks) {
    // 按行数分摊总预算；同时夹在「本块自身长度的 40%」以下 —— 单块摘要再长
    // 也不该接近它要替换的内容，否则归并后整体就缩不下来。
    const share = Math.floor((digestBudget * chunk.lines.length) / weight);
    chunk.capTokens = Math.max(48, Math.min(share, Math.floor(chunk.tokens * 0.4)));
  }
  return {
    chunks,
    split: chunks.length > 1,
    totalLines: lines.length,
    regionTokens: total,
    trimmedChars: trimmed.trimmedChars,
  };
}

/**
 * 要不要再花一次往返做单级归并。
 *
 * 归并**不是免费**的:它把全部 digest 再读一遍、再写一遍(4k 输入 / 4k 输出
 * ≈ 一次完整往返),而它的产物在句子上并不比「带标题直接拼」短多少。实测
 * 3M token 的区域里,归并这一步占整次压缩 15%~25% 的墙钟时间。所以只在
 * 「块确实多到拼起来读不下去」时才归并。
 */
export function needsMerge(chunkCount: number): boolean {
  return chunkCount > 5;
}

/** 把逐块 digest 拼成一份直接可用的摘要(不归并时走这条)。 */
export function joinDigests(digests: readonly string[]): string {
  if (digests.length === 1) return digests[0] ?? "";
  return digests.map((digest, i) => `## 片段 ${i + 1}/${digests.length}\n${digest}`).join("\n\n");
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
