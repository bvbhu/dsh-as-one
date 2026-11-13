/**
 * WorkBuddy 真实上游线层(core 层,纯函数零网络)。
 *
 * 移植自 Nexus 的 connectors/workbuddy.py —— 覆盖「请求体构建 + SSE 行解析 +
 * XML 工具调用副本过滤」整条链路,与 workbuddy.ts(区域检测/头构建/错误分类)
 * 分工:workbuddy.ts 管「连接器」(getToken/decorateRequest/classifyError),
 * 本文件管「线」(wire):端点 URL、报文体、流式协议。两者都不做网络 IO。
 *
 * 事实依据(逐字对照 workbuddy.py):
 * - 端点:POST {base}/v2/chat/completions(workbuddy.py L47 CHAT_PATH);
 * - 请求体:to_body 之上补 stream:True + stream_options.include_usage,
 *   max_completion_tokens 改名 max_tokens(workbuddy.py L153-162);
 * - 上游会在结构化 tool_calls 之外再发一份 XML 文本副本
 *   (<tool_call><function=...>...</tool_call>),客户端双份消费会出双份工具调用;
 *   _XmlToolCallCopyFilter 按请求新建,把这份文本副本滤掉(workbuddy.py L196-303);
 * - SSE 行解析只认 `data:` 前缀,空/注释/[DONE] 全部跳过(workbuddy.py L140-150)。
 *
 * 约束:core 包零网络;不 import electron;tsconfig strict;中文注释。
 */

import type { ChatCompletionChunk } from "../gateway/types.js";
import { normalize_region, REGION_BASES } from "./workbuddy.js";

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

export const CHAT_PATH = "/v2/chat/completions";
export const XML_TOOL_OPEN = "<tool_call>";
export const XML_TOOL_CLOSE = "</tool_call>";
export const XML_TOOL_FN = "<function=";

/** XML 开标记(行首空白 + 多行,与 workbuddy.py _XML_TOOL_OPEN_RE 对齐)。 */
const XML_TOOL_OPEN_RE = /^\s*<tool_call>/m;

/* ------------------------------------------------------------------ *
 * 报文体构建(workbuddy.py L153-162)
 * ------------------------------------------------------------------ */

/** 构建 workbuddy 上游请求体。 */
export function buildWorkbuddyBody(
  req: {
    model: string;
    messages: unknown;
    stream: boolean;
    temperature?: number;
    max_tokens?: number;
    max_completion_tokens?: number;
    top_p?: number;
    stop?: string[];
    tools?: unknown;
    tool_choice?: unknown;
    reasoning_effort?: string;
  },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  const maxTokens = req.max_tokens ?? req.max_completion_tokens;
  if (typeof maxTokens === "number" && Number.isFinite(maxTokens)) {
    body.max_tokens = maxTokens;
  }
  if (typeof req.temperature === "number" && Number.isFinite(req.temperature)) {
    body.temperature = req.temperature;
  }
  if (typeof req.top_p === "number" && Number.isFinite(req.top_p)) {
    body.top_p = req.top_p;
  }
  if (Array.isArray(req.stop) && req.stop.length > 0) {
    body.stop = req.stop;
  }
  if (req.tools) body.tools = req.tools;
  if (req.tool_choice) body.tool_choice = req.tool_choice;
  if (req.reasoning_effort) body.reasoning_effort = req.reasoning_effort;
  return body;
}

/* ------------------------------------------------------------------ *
 * SSE 行解析(workbuddy.py L140-150)
 * ------------------------------------------------------------------ */

/** 从一行 SSE 原始数据里取出 data 载荷;非 data 行/心跳/[DONE] → null。 */
export function parseWorkbuddySseData(line: string): string | null {
  const stripped = line.trim();
  if (!stripped.startsWith("data:")) return null;
  const data = stripped.slice("data:".length).trim();
  if (data === "") return null;
  if (data.startsWith(":")) return null; // data: : heartbeat
  if (data === "[DONE]") return null;
  return data;
}

/* ------------------------------------------------------------------ *
 * _XmlToolCallCopyFilter(workbuddy.py L196-303)
 * ------------------------------------------------------------------ */

/**
 * XML 工具调用副本过滤器 —— 把上游发的 XML 文本副本从 content 里滤掉,
 * 避免客户端双份工具调用。
 *
 * 状态机规则(与 workbuddy.py 逐条对齐):
 * 1. seen_structured:一旦任何结构化 tool_calls 分片产出即 True;
 * 2. text delta 以行首 <tool_call> 开头(或 seen_structured 后任意位置出现
 *    <tool_call>/<function=)→ 开启缓冲,不外发;
 * 3. 缓冲中遇到 </tool_call> 闭合:seen_structured → 整段丢;未 seen → 整段原样外发;
 * 4. 流结束缓冲未闭合(截断副本)→ 无条件丢弃;
 * 5. 只过滤 content;结构化分片 / reasoning / usage / finish_reason 原样。
 */
export class XmlToolCallCopyFilter {
  seenStructured = false;
  private buf: string[] | null = null;

  /** 喂入一段文本,返回应外发的部分。 */
  feed(text: string): string {
    if (text === "") return "";
    if (this.buf !== null) return this.drain(text);
    const openAt = this.findOpen(text);
    if (openAt === -1) return text;
    return text.slice(0, openAt) + this.open(text.slice(openAt));
  }

  /** 流结束:丢弃未闭合缓冲。 */
  finish(): string {
    if (this.buf !== null) {
      this.buf = null;
    }
    return "";
  }

  /** 缓冲内追加,寻找闭合标记(闭合标签本身计入缓冲段)。 */
  private drain(text: string): string {
    const closeAt = text.indexOf(XML_TOOL_CLOSE);
    if (closeAt === -1) {
      this.buf!.push(text);
      return "";
    }
    this.buf!.push(text.slice(0, closeAt + XML_TOOL_CLOSE.length));
    const segment = this.buf!.join("");
    this.buf = null;
    return this.decide(segment) + this.feed(text.slice(closeAt + XML_TOOL_CLOSE.length));
  }

  /** 开启缓冲(首段可能同帧闭合)。 */
  private open(text: string): string {
    const closeAt = text.indexOf(XML_TOOL_CLOSE);
    if (closeAt !== -1) {
      const segment = text.slice(0, closeAt + XML_TOOL_CLOSE.length);
      return this.decide(segment) + this.feed(text.slice(closeAt + XML_TOOL_CLOSE.length));
    }
    this.buf = [text];
    return "";
  }

  /** 闭合段去向:seen_structured 时丢弃,否则原样外发。 */
  private decide(segment: string): string {
    return this.seenStructured ? "" : segment;
  }

  /** 找开启位置:行首 <tool_call> 优先;seen_structured 后任意位置也认。 */
  private findOpen(text: string): number {
    const m = XML_TOOL_OPEN_RE.exec(text);
    if (m) return m.index;
    if (!this.seenStructured) return -1;
    const openAt = text.indexOf(XML_TOOL_OPEN);
    if (openAt !== -1) return openAt;
    return text.indexOf(XML_TOOL_FN);
  }
}

/**
 * 对单个上游 chunk 应用副本过滤(workbuddy.py _filter_chunk L306-332)。
 * choices 为空(usage-only / 收尾块)→ 原样返回;content 空 → 摘掉键。
 */
export function filterWorkbuddyChunk(
  chunk: Record<string, unknown>,
  flt: XmlToolCallCopyFilter,
): Record<string, unknown> {
  const choices = chunk.choices;
  if (!Array.isArray(choices) || choices.length === 0) return chunk;
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const c = choice as Record<string, unknown>;
    const delta = c.delta;
    if (!delta || typeof delta !== "object") continue;
    const d = delta as Record<string, unknown>;
    if (Array.isArray(d.tool_calls) && d.tool_calls.length > 0) {
      flt.seenStructured = true;
    }
    if (typeof d.content !== "string" || d.content === "") continue;
    const text = flt.feed(d.content);
    if (text !== "") {
      d.content = text;
    } else {
      delete d.content; // 摘掉键,客户端不收空 content delta
    }
  }
  return chunk;
}

/** 组装 OpenAI chunk 外壳(与 workbuddy.py stream L407-419 对齐)。 */
export function decorateWorkbuddyChunk(
  chunk: Record<string, unknown>,
  completionId: string,
  created: number,
  model: string,
): ChatCompletionChunk {
  return {
    ...chunk,
    id: chunk.id ?? completionId,
    object: "chat.completion.chunk",
    created: chunk.created ?? created,
    model: chunk.model ?? model,
  } as unknown as ChatCompletionChunk;
}

/* ------------------------------------------------------------------ *
 * 请求准备(供 gateway-upstream 分派):URL + 报文体
 * ------------------------------------------------------------------ */

export interface WorkbuddyWireRequest {
  req: {
    model: string;
    messages: unknown;
    stream: boolean;
    temperature?: number;
    max_tokens?: number;
    max_completion_tokens?: number;
    top_p?: number;
    stop?: string[];
    tools?: unknown;
    tool_choice?: unknown;
    reasoning_effort?: string;
  };
  baseUrl?: string;
  region?: string;
}

/** 解析端点 URL(与 workbuddy.py _resolve L349-357:base 缺省区域默认)。 */
export function resolveWorkbuddyChatUrl(
  baseUrl: string | undefined,
  region: string | undefined,
): string {
  const base = (baseUrl && baseUrl.trim() ? baseUrl.trim() : REGION_BASES[normalize_region(region)]).replace(/\/+$/, "");
  return base + CHAT_PATH;
}

export const WORKBUDDY_WIRE_CONSTANTS = { CHAT_PATH, XML_TOOL_OPEN, XML_TOOL_CLOSE, XML_TOOL_FN };
