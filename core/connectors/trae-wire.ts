/**
 * Trae 真实上游线层(core 层,纯函数零网络)。
 *
 * 移植自 Nexus 的 connectors/trae.py —— 覆盖「请求体构建 + SSE 帧解析 +
 * 事件解码 + 分块产出」整条链路,与 trae.ts(AES/身份/头/错误分类)分工:
 * trae.ts 管「连接器」(getToken/decorateRequest/classifyError),
 * 本文件管「线」(wire):端点 URL、报文体、流式协议。两者都不做网络 IO。
 *
 * 事实依据(逐字对照 trae.py):
 * - 端点:POST {base}/api/agent/v3/llm_utils_chat,恒走 SSE(trae.py L5/L103/L992);
 * - 流内错误 HTTP 永远 200,错误以事件 `error` 或 code>=4000 表达,
 *   解码后转 solo_error(分类逻辑在 trae.ts classify_solo_error);
 * - `_ChunkBuilder` 是有状态对象:跨批次保留 usage / tool_calls / 首块 role;
 * - 空事件、queue、progress、unknown 一律不产出块(绝不发空 delta)。
 *
 * 约束:core 包零网络;不 import electron;tsconfig strict;中文注释。
 */

import { createHash, randomUUID } from "node:crypto";

import type { ChatCompletionChunk, ChatUsage, UpstreamRequest } from "../gateway/types.js";
import { UpstreamError } from "./types.js";
import {
  APP_ID,
  DEFAULT_IDE_VERSION,
  DEFAULT_IDE_VERSION_CODE,
  resolve_api_base,
  resolve_identity,
} from "./trae.js";

export const CHAT_PATH = "/api/agent/v3/llm_utils_chat";
export const WORKSPACE_ID = "e04cdd";
export const DEFAULT_MAX_TOKENS = 4096;
export const PROMPT_MAX_TOKENS = 168000;
export const DEFAULT_FUNCTION = "solo_work_lite";
export const _IMAGE_PLACEHOLDER = "[图片未发送:trae 通道无法确认该模型支持图像输入]";

/** 环境覆盖(与 Nexus _env 对齐:先环境变量,后默认值)。 */
function env(name: string, fallback: string): string {
  if (typeof process === "undefined") return fallback;
  const v = process.env[name];
  return v && v.trim() ? v : fallback;
}

/* ------------------------------------------------------------------ *
 * 报文体构建(trae.py L268-421)
 * ------------------------------------------------------------------ */

/** 单条 content → trae 多模态 part 列表。 */
export function convertContent(content: unknown): Array<Record<string, unknown>> {
  if (content === null || content === undefined) return [{ type: "text", text: "" }];
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [{ type: "text", text: String(content) }];

  const parts: Array<Record<string, unknown>> = [];
  let dropped = 0;
  for (const part of content) {
    if (!part || typeof part !== "object") {
      dropped += 1;
      continue;
    }
    const p = part as Record<string, unknown>;
    if (typeof p.text === "string") {
      parts.push({ type: "text", text: p.text });
      continue;
    }
    const url = imageUrlOf(p);
    if (url !== null) {
      // 只保留 image_url 形态,detail/alt_text 等私有键一律不带
      parts.push({ type: "image_url", image_url: { url } });
      continue;
    }
    dropped += 1;
  }
  if (dropped > 0) {
    parts.push({
      type: "text",
      text: _IMAGE_PLACEHOLDER + (dropped > 1 ? `×${dropped}` : ""),
    });
  }
  if (parts.length === 0) return [{ type: "text", text: "" }];
  return parts;
}

/** 取 part 里的图片 URL;无则 null。 */
export function imageUrlOf(part: Record<string, unknown>): string | null {
  const inner = part.image_url;
  const url =
    inner && typeof inner === "object"
      ? (inner as Record<string, unknown>).url
      : part.url;
  if (typeof url === "string" && url.trim() !== "") return url;
  return null;
}

/** 历史消息 assistant.tool_calls → trae 形状。 */
export function convertHistoryToolCalls(toolCalls: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(toolCalls)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== "object") continue;
    const t = tc as Record<string, unknown>;
    const fn = t.function_call ?? t.function;
    if (!fn || typeof fn !== "object") continue;
    const f = fn as Record<string, unknown>;
    if (typeof f.name !== "string" || f.name === "") continue;
    out.push({
      id: typeof t.id === "string" ? t.id : null,
      type: "function",
      function_call: { name: f.name, arguments: typeof f.arguments === "string" ? f.arguments : "" },
    });
  }
  return out;
}

/** 消息列表 → trae 报文体 messages。 */
export function convertMessages(messages: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(messages)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    const role = typeof m.role === "string" ? m.role : "user";
    const entry: Record<string, unknown> = { role, content: convertContent(m.content) };
    if (role === "assistant") {
      const converted = convertHistoryToolCalls(m.tool_calls);
      if (converted.length > 0) entry.tool_calls = converted;
    }
    if (role === "tool" && typeof m.tool_call_id === "string") {
      entry.tool_call_id = m.tool_call_id;
    }
    if (typeof m.name === "string") entry.name = m.name;
    out.push(entry);
  }
  return out;
}

/** tools → trae 形状(parameters 必须 JSON 字符串)。 */
export function normalizeTools(tools: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const out: Array<Record<string, unknown>> = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const t = tool as Record<string, unknown>;
    if (!t.function || typeof t.function !== "object") continue;
    const fn: Record<string, unknown> = { ...(t.function as Record<string, unknown>) };
    if (typeof fn.parameters === "object" && fn.parameters !== null) {
      fn.parameters = JSON.stringify(fn.parameters);
    }
    out.push({ type: typeof t.type === "string" ? t.type : "function", function: fn });
  }
  return out.length > 0 ? out : null;
}

/** tool_choice → trae 形状(只认函数名)。 */
export function normalizeToolChoice(toolChoice: unknown): string | null {
  if (!toolChoice || typeof toolChoice !== "object" || Array.isArray(toolChoice)) return null;
  const tc = toolChoice as Record<string, unknown>;
  const fn = tc.function;
  const name =
    fn && typeof fn === "object"
      ? (fn as Record<string, unknown>).name
      : tc.name;
  if (typeof name === "string" && name.trim() !== "") return name.trim();
  return null;
}

export interface TraeIdentity {
  user_id?: string;
  device_id: string;
  machine_id: string;
}

/**
 * 由**稳定会话键**派生一个 UUID v4 形态的 id;没有键就随机。
 *
 * 为什么要 UUID 形态:上游对 `conversation_id` / `session_id` 有格式校验,
 * 直接塞任意字符串可能被拒。派生走 sha256 前 16 字节,再按 RFC 4122 打上
 * version/variant 位 —— 同键恒同值,跨轮次稳定。
 */
function stableSessionId(sessionKey: string | undefined): string {
  if (sessionKey === undefined || sessionKey === "") return randomUUID();
  const h = createHash("sha256").update(`trae-session|${sessionKey}`, "utf-8").digest();
  const b = Buffer.from(h.subarray(0, 16));
  // RFC 4122:version = 4, variant = 10xx
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 构建 trae 上游请求体。 */
export function buildUpstreamBody(
  model: string,
  messages: unknown,
  identity: TraeIdentity,
  optional: {
    temperature?: number;
    max_tokens?: number;
    max_completion_tokens?: number;
    tools?: unknown;
    tool_choice?: unknown;
    /**
     * 思考强度。trae 目录用 `reasoning_effort_config.options`
     * = `["light","high","extra_high"]` 声明档位(2026-11-08 实测),
     * 报文里同名透传(实测带未知字段不报错、HTTP 200)。
     */
    reasoning_effort?: string;
    /**
     * **这份 config 是干什么用的**(2026-11-13,补齐必填参数)。
     *
     * ⚠️ 上游**必填**,缺了直接 400:
     *   `bad request: binding: expr_path=usage, cause=missing required parameter`
     * 我们此前一直没带 —— 但生产请求看起来是 200,所以这个缺口长期没被发现
     * (见下方说明)。
     *
     * 取值(实测/参考实现 `dingminhua/dsh-connect-trae` 的 `solo.ts:411`)：
     * - `"chat_completion"` —— **真实模型**(普通对话),缺省就用它；
     * - `"custom_model"`   —— 账号自建模型；
     * - `"summary"` / `"title_generation"` / `"fast_apply"` / `"input_optimization"`
     *   —— IDE 的内置**工具**配置(不是模型,不该出现在模型选择器里)。
     *
     * 参考实现的做法是从上游目录(`batch_get_detail_param`)的 `config.usage`
     * 读出来原样透传;as-one 的 trae 目录采集没有保留该字段,所以这里用
     * **真实模型的缺省值**兜底,并允许调用方按需覆盖。
     */
    usage?: string;
    /**
     * **稳定会话键**(2026-11-13,修缓存命中)。
     *
     * 给了就由它**确定性派生** `conversation_id` / `session_id`(UUID v4 形态),
     * 于是同一会话的每一轮共享同一个上游对话 —— 上游才可能复用前缀缓存。
     * 不给则退回随机 UUID(等于每轮都是新对话,缓存永远不命中)。
     *
     * ⚠️ 不要直接把这个字符串当 conversation_id 发出去:上游要求 UUID 形态。
     */
    sessionKey?: string;
  },
  requestId?: string,
): Record<string, unknown> {
  const cleanModel = model.startsWith("trae/") ? model.split("/", 2)[1] ?? model : model;
  // 会话 id:有稳定键就派生,没有才随机(随机 = 每轮新对话 = 永不命中缓存)。
  const sessionId = stableSessionId(optional.sessionKey);
  const tools = normalizeTools(optional.tools);
  const body: Record<string, unknown> = {
    messages: convertMessages(messages),
    model: cleanModel,
    config_name: cleanModel,
    model_name: `${cleanModel}__dev`,
    // ⚠️ 上游必填(见 optional.usage 的长注释):真实模型的缺省是 chat_completion。
    usage: optional.usage ?? "chat_completion",
    function: env("TRAE_FUNCTION", DEFAULT_FUNCTION),
    stream: true,
    max_tokens:
      optional.max_tokens ?? optional.max_completion_tokens ?? DEFAULT_MAX_TOKENS,
    conversation_id: sessionId,
    session_id: sessionId,
    request_id: requestId ?? sessionId,
    user_id: identity.user_id ?? "",
    device_id: identity.device_id,
    machine_id: identity.machine_id,
    project_id: randomUUID(),
    workspace_id: WORKSPACE_ID,
    prompt_max_tokens: PROMPT_MAX_TOKENS,
    mode: "FunctionCall",
    ide_version: env("TRAE_IDE_VERSION", DEFAULT_IDE_VERSION),
    ide_version_code: env("TRAE_IDE_VERSION_CODE", DEFAULT_IDE_VERSION_CODE),
    app_id: env("TRAE_APP_ID", APP_ID),
    package_type: "stable_cn",
  };
  if (tools) body.tools = tools;
  const choice = normalizeToolChoice(optional.tool_choice);
  if (choice) body.tool_choice = choice;
  if (typeof optional.temperature === "number" && Number.isFinite(optional.temperature)) {
    body.temperature = optional.temperature;
  }
  if (typeof optional.reasoning_effort === "string" && optional.reasoning_effort !== "") {
    body.reasoning_effort = optional.reasoning_effort;
  }
  return body;
}

/** 解析端点 URL(与 trae.py L992:base + CHAT_PATH)。 */
export function resolveChatUrl(
  baseUrl: string | undefined,
  region: string | undefined,
  extra?: Record<string, unknown>,
): string {
  return resolve_api_base(baseUrl, region, extra) + CHAT_PATH;
}

/* ------------------------------------------------------------------ *
 * SSE 解析(trae.py L435-498,增量式)
 * ------------------------------------------------------------------ */

export interface TraeEvent {
  kind: "delta" | "done" | "error" | "usage" | "queue" | "progress" | "unknown";
  text?: string;
  reasoning?: string | null;
  tool_calls?: unknown;
  finish_reason?: string | null;
  position?: number | null;
  notice?: unknown;
  usage?: Record<string, unknown>;
  code?: number | null;
  message?: string;
  extra?: unknown;
  event?: string;
}

/** 解码单个 trae SSE 事件(trae.py decode_trae_event L507-550)。 */
export function decodeTraeEvent(event: string, data: string): TraeEvent {
  if (data.trim() === "[DONE]") return { kind: "done", finish_reason: null };
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return { kind: "unknown", event };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { kind: "unknown", event };
  }
  const p = payload as Record<string, unknown>;
  if (event === "request_wait_in_queue") {
    return {
      kind: "queue",
      position: typeof p.position === "number" && Number.isFinite(p.position) ? p.position : null,
    };
  }
  if (event === "progress_notice") return { kind: "progress", notice: payload };
  if (event === "token_usage") {
    return { kind: "usage", usage: toOpenAIUsage(payload) };
  }
  if (event === "done" || (typeof p.finish_reason === "string" && !String(p.finish_reason).includes("response"))) {
    return { kind: "done", finish_reason: typeof p.finish_reason === "string" ? p.finish_reason : "stop" };
  }
  if (
    event === "error" ||
    ((typeof p.code === "number" || typeof p.code === "bigint") && Number(p.code) >= 4000)
  ) {
    return {
      kind: "error",
      code: typeof p.code === "number" ? Number(p.code) : null,
      message: typeof p.message === "string" ? p.message : "",
      extra: p.extra,
    };
  }
  if (event === "output" || "response" in p || "reasoning_content" in p) {
    return {
      kind: "delta",
      text: typeof p.response === "string" ? p.response : "",
      reasoning: typeof p.reasoning_content === "string" ? p.reasoning_content : null,
      tool_calls: p.tool_calls,
    };
  }
  return { kind: "unknown", event };
}

/**
 * `token_usage` 事件 → OpenAI usage 形状。
 *
 * ⚠️ **2026-11-13:缓存字段改成多名字识别**(用户报「trae 缓存命中恒 0」)。
 *
 * 旧实现**只**读顶层 `cache_read_input_tokens`。而各家的缓存字段名并不统一：
 *
 * | 风格 | 字段 |
 * |---|---|
 * | Anthropic | `cache_read_input_tokens` / `cache_creation_input_tokens` |
 * | OpenAI | `prompt_tokens_details.cached_tokens`(嵌套) / `cached_tokens`(顶层) |
 * | DeepSeek | `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` |
 * | 其它 | `cache_read_tokens` |
 *
 * 只认一种 → 上游换了个名字就静默变成 0,看起来像「上游不缓存」。
 * 现在按**优先级逐个试**,命中即用;全部没有才是真的没有。
 *
 * 输出统一落到 OpenAI 口径:`prompt_tokens_details.cached_tokens`
 * (`cache_write_tokens` 同理),下游(`llm-adapter` / `stats_daily`)只认这一种。
 */
export function toOpenAIUsage(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const p = payload as Record<string, unknown>;
  const usage: Record<string, unknown> = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    const v = p[key];
    if (typeof v === "number" && Number.isFinite(v) && typeof v !== "boolean") {
      usage[key] = Math.trunc(v);
    }
  }

  /** 取第一个「有限数值且非 0」的候选(0 与缺失都算没有,避免写一堆 0)。 */
  const firstPositive = (keys: string[], nested?: Record<string, unknown>): number | null => {
    for (const k of keys) {
      const v = (nested ?? p)[k];
      if (typeof v === "number" && Number.isFinite(v) && v !== 0) return Math.trunc(v);
    }
    return null;
  };

  const details: Record<string, unknown> = {};

  // ① reasoning(原逻辑保留)
  const rt = p["reasoning_tokens"];
  if (typeof rt === "number" && Number.isFinite(rt) && rt !== 0) {
    details["reasoning_tokens"] = Math.trunc(rt);
  }

  // ② cached:顶层多名字 + OpenAI 嵌套形态
  const ptd =
    p["prompt_tokens_details"] !== null && typeof p["prompt_tokens_details"] === "object"
      ? (p["prompt_tokens_details"] as Record<string, unknown>)
      : null;
  const cached =
    firstPositive([
      "cache_read_input_tokens",
      "cached_tokens",
      "prompt_cache_hit_tokens",
      "cache_read_tokens",
      "cache_hit_tokens",
    ]) ??
    (ptd !== null ? firstPositive(["cached_tokens", "cache_read_input_tokens"], ptd) : null);
  if (cached !== null) details["cached_tokens"] = cached;

  // ③ cache write:多名字
  const write = firstPositive([
    "cache_creation_input_tokens",
    "cache_write_tokens",
    "prompt_cache_miss_tokens",
  ]);
  if (write !== null) details["cache_write_tokens"] = write;

  if (Object.keys(details).length > 0) {
    usage["prompt_tokens_details"] = details;
  }
  return usage;
}

/** tool_calls 增量分片规范化(trae.py _normalize_tool_call_delta L597-628)。 */
export function normalizeToolCallDelta(
  raw: unknown,
  fallbackIndex: number,
  ids: Map<number, string>,
  idPrefix: string,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const fnRaw = r.function_call ?? r.function;
  const fn = fnRaw && typeof fnRaw === "object" ? (fnRaw as Record<string, unknown>) : {};
  const index = typeof r.index === "number" && Number.isInteger(r.index) ? r.index : fallbackIndex;
  const rawId = typeof r.id === "string" && r.id !== "" ? r.id : null;
  if (rawId && !ids.has(index)) ids.set(index, rawId);
  const callId = ids.get(index) ?? `call_${idPrefix}_${index}`;
  ids.set(index, callId);
  const name = typeof fn.name === "string" && fn.name !== "" ? fn.name : null;
  const args = typeof fn.arguments === "string" && fn.arguments !== "" ? fn.arguments : "";
  return {
    index,
    id: callId,
    type: "function",
    function: name !== null ? { name, arguments: args } : { arguments: args },
  };
}

/** 构造 OpenAI chunk 形状(trae.py _make_chunk L631-644)。 */
export function makeChunk(
  completionId: string,
  created: number,
  model: string,
  delta: Record<string, unknown>,
  finishReason: string | null = null,
  usage: Record<string, unknown> | null = null,
): ChatCompletionChunk {
  return {
    id: completionId,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    usage: usage as unknown as ChatUsage | null,
  };
}

/** 增量 SSE 解析器(trae.py SseParser L435-498):逐字节缓冲,按行切分。 */
export class TraeSseParser {
  private buffer = "";
  private event: string | null = null;
  private data: string[] = [];

  /** 喂入 chunk,返回完整事件对列表(可能为空)。 */
  push(chunk: string): Array<[string, string]> {
    this.buffer += chunk;
    const out: Array<[string, string]> = [];
    let match: RegExpExecArray | null;
    const newline = /\r?\n/;
    while ((match = newline.exec(this.buffer)) !== null) {
      const line = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const ev = this.consumeLine(line);
      if (ev) out.push(ev);
    }
    return out;
  }

  /** 流结束:冲刷残余缓冲。 */
  finish(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    if (this.buffer !== "") {
      const ev = this.consumeLine(this.buffer);
      if (ev) out.push(ev);
      this.buffer = "";
    }
    const dispatched = this.dispatch();
    if (dispatched) out.push(dispatched);
    return out;
  }

  private consumeLine(line: string): [string, string] | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null; // 注释/心跳
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") {
      this.event = value;
      return null;
    }
    if (field === "data") {
      this.data.push(value);
      return null;
    }
    // id/retry 忽略
    return null;
  }

  private dispatch(): [string, string] | null {
    if (this.data.length === 0) {
      this.event = null;
      return null;
    }
    const result: [string, string] = [this.event ?? "", this.data.join("\n")];
    this.event = null;
    this.data = [];
    return result;
  }
}

/* ------------------------------------------------------------------ *
 * _ChunkBuilder(trae.py L647-736) + decoded_events_to_chunks(L737-749)
 * ------------------------------------------------------------------ */

/** 把解码事件流变成 OpenAI chunk 流(有状态,跨批次保留 usage/tool_calls)。 */
export class TraeChunkBuilder {
  private sawToolCalls = false;
  private usage: Record<string, unknown> | null = null;
  private ids = new Map<number, string>();
  private readonly idPrefix: string;
  private opened = false;
  private finished = false;

  constructor(
    private readonly completionId: string,
    private readonly created: number,
    private readonly model: string,
  ) {
    this.idPrefix = completionId.replace(/^chatcmpl-/, "").slice(0, 16);
  }

  /** 喂入解码事件,产出 chunk(可能为空数组)。 */
  feed(events: TraeEvent[]): ChatCompletionChunk[] {
    if (this.finished) return [];
    const out: ChatCompletionChunk[] = [];
    for (const decoded of events) {
      if (this.finished) return out;
      if (decoded.kind === "delta") {
        const delta: Record<string, unknown> = {};
        if (decoded.reasoning && decoded.reasoning !== "") {
          delta.reasoning_content = decoded.reasoning;
        }
        const text = decoded.text ?? "";
        if (text !== "") delta.content = text;
        let normalized: Array<Record<string, unknown>> = [];
        if (Array.isArray(decoded.tool_calls)) {
          for (let i = 0; i < decoded.tool_calls.length; i++) {
            const norm = normalizeToolCallDelta(decoded.tool_calls[i], i, this.ids, this.idPrefix);
            if (norm) normalized.push(norm);
          }
        }
        if (normalized.length > 0) {
          delta.tool_calls = normalized;
          this.sawToolCalls = true;
        }
        if (Object.keys(delta).length === 0) continue; // 空事件不产块
        if (!this.opened) {
          this.opened = true;
          const withRole: Record<string, unknown> = { role: "assistant", ...delta };
          out.push(makeChunk(this.completionId, this.created, this.model, withRole));
        } else {
          out.push(makeChunk(this.completionId, this.created, this.model, delta));
        }
      } else if (decoded.kind === "usage") {
        this.usage = decoded.usage ?? {};
      } else if (decoded.kind === "done") {
        let finishReason = decoded.finish_reason ?? "stop";
        if (this.sawToolCalls && finishReason === "stop") finishReason = "tool_calls";
        this.finished = true;
        out.push(makeChunk(this.completionId, this.created, this.model, {}, finishReason, this.usage));
      } else if (decoded.kind === "error") {
        throw this.soloError(decoded);
      }
      // queue/progress/unknown:丢弃,绝不发空块
    }
    return out;
  }

  /** 整条流读完后再调:补发收尾块。 */
  finish(): ChatCompletionChunk[] {
    if (this.finished) return [];
    this.finished = true;
    return [
      makeChunk(
        this.completionId,
        this.created,
        this.model,
        {},
        this.sawToolCalls ? "tool_calls" : "stop",
        this.usage,
      ),
    ];
  }

  private soloError(decoded: TraeEvent): UpstreamError {
    if (typeof decoded.code === "number") {
      return classifySoloError(decoded.code);
    }
    return new UpstreamError("bad_request", decoded.message || "trae 流内错误", false, 400);
  }
}

/** 错误码分类(与 trae.ts classify_solo_error 同一口径,这里供 wire 层独立引用)。 */
export function classifySoloError(code: number): UpstreamError {
  if (code === 1005) return new UpstreamError("rate_limit", "套餐额度耗尽", true, 429);
  if (code === 4001 || code === 4002) return new UpstreamError("bad_request", "模型配置错误", false, 400);
  if (code === 401 || code === 403) return new UpstreamError("auth", "账号已失效", false, 401);
  if (code === 4008 || code === 4011 || code === 429) return new UpstreamError("rate_limit", "请求过于频繁", true, 429);
  if (code >= 500) return new UpstreamError("upstream", "上游错误", true, code);
  return new UpstreamError("bad_request", "请求错误", false, 400);
}

/**
 * 一次性批次的便捷包装:把事件列表直接变成 chunk 列表(测试/离线重放用)。
 */
export function decodedTraeEventsToChunks(
  events: TraeEvent[],
  options: { completionId: string; created: number; model: string; synthesizeEof?: boolean },
): ChatCompletionChunk[] {
  const { completionId, created, model, synthesizeEof = false } = options;
  const builder = new TraeChunkBuilder(completionId, created, model);
  const chunks = builder.feed(events);
  if (synthesizeEof) {
    chunks.push(...builder.finish());
  }
  return chunks;
}

/* ------------------------------------------------------------------ *
 * 请求准备(供 gateway-upstream 分派):URL + 报文体 + 身份
 * ------------------------------------------------------------------ */

export interface TraeWireRequest {
  req: UpstreamRequest;
  identity: TraeIdentity;
  baseUrl?: string;
  region?: string;
  extra?: Record<string, unknown>;
  requestId?: string;
}

/** 准备 trae 上游请求:url + body。 */
export function prepareTraeRequest(w: TraeWireRequest): { url: string; body: Record<string, unknown> } {
  const url = resolveChatUrl(w.baseUrl, w.region, w.extra);
  // ⚠️ **会话键必须是稳定的**(2026-11-13,缓存命中问题的根因之一)。
  //
  // `buildUpstreamBody` 以前每次 `randomUUID()` 生成 conversation_id/session_id,
  // 于是**同一会话的每一轮都是「新对话」** —— 上游没有任何理由去复用前缀缓存,
  // `cache_read_input_tokens` 恒 0。实测证据:连续两次发**完全相同**的长消息,
  // 上游两次都回 `cache_read_input_tokens: 0`。
  //
  // 取法(优先级):`prompt_cache_key`(客户端显式声明的「前缀相同」意图)>
  // `extra.session_id`(会话号)。两者都没有才退回随机 —— 那种情况本来也无从关联。
  //
  // ⚠️ `prompt_cache_key` **本身绝不进 body**(上游见到会 400,见 types.ts 注释),
  // 这里只是拿它**派生**一个 UUID 形态的会话 id。
  const sessionKey =
    (typeof w.req.prompt_cache_key === "string" && w.req.prompt_cache_key !== ""
      ? w.req.prompt_cache_key
      : undefined) ??
    (typeof w.extra?.["session_id"] === "string" && w.extra["session_id"] !== ""
      ? (w.extra["session_id"] as string)
      : undefined);
  const body = buildUpstreamBody(
    w.req.model,
    w.req.messages,
    w.identity,
    {
      temperature: w.req.temperature,
      max_tokens: w.req.max_tokens,
      tools: w.req.tools,
      tool_choice: w.req.tool_choice,
      reasoning_effort: w.req.reasoning_effort,
      sessionKey,
    },
    w.requestId,
  );
  return { url, body };
}

/** 从凭据 extra 构造 trae 身份(与 gateway-upstream connectorExtra 对齐)。 */
export function identityFromExtra(
  apiKey: string,
  extra?: Record<string, unknown>,
): TraeIdentity {
  const identity = resolve_identity(apiKey, extra);
  return {
    user_id: typeof extra?.["user_id"] === "string" ? (extra["user_id"] as string) : undefined,
    machine_id: identity.machine_id,
    device_id: identity.device_id,
  };
}

export const TRAE_WIRE_CONSTANTS = {
  CHAT_PATH,
  WORKSPACE_ID,
  DEFAULT_MAX_TOKENS,
  PROMPT_MAX_TOKENS,
  DEFAULT_FUNCTION,
};
