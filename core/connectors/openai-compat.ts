/**
 * OpenAI 兼容连接器 —— 覆盖 tokenrhythm / longcat / openrouter / stepfun 等
 * baseURL + API key 形态的上游。
 *
 * 协议要点（来自 Nexus `openai_compat.py`）：
 * - 认证：`Authorization: Bearer <api_key>`
 * - 端点：`{base_url}/chat/completions`
 * - 渠道特定头：openrouter → `x-title: As One`, `http-referer: https://as-one.local`
 * - 推理归一：`reasoning` → `reasoning_content`（规范名优先，不覆盖已有）
 * - 流式降级：clawbrain 等渠道 stream=true 返回空 delta → 降级为非流式
 * - 错误分类：标准 HTTP 状态码 → UpstreamErrorKind
 */

import {
  AuthConnector,
  ConnectorCredentials,
  RequestDecoration,
  TokenState,
  UpstreamError,
  UpstreamErrorKind,
  upstreamRawResponse,
} from "./types.js";

// ---------------------------------------------------------------------------
// 渠道特定头
// ---------------------------------------------------------------------------

/**
 * 渠道 → 额外请求头映射。
 *
 * 这些头由配置显式传入（不是按 base_url 里有没有 openrouter.ai 去猜），
 * 因为单测用本地假上游时永远命中不了。
 */
const VENDOR_EXTRA_HEADERS: Record<string, Record<string, string>> = {
  openrouter: {
    "x-title": "As One",
    "http-referer": "https://as-one.local",
  },
  stepfun: {
    "x-title": "As One",
    "http-referer": "https://as-one.local",
  },
};

/**
 * 获取渠道的额外请求头。
 *
 * @param vendor 渠道标识（如 "openrouter" / "stepfun"）
 * @returns 额外请求头，未知渠道返回空对象
 */
export function extra_headers_for(vendor: string): Record<string, string> {
  return VENDOR_EXTRA_HEADERS[vendor] ?? {};
}

// ---------------------------------------------------------------------------
// 推理字段归一
// ---------------------------------------------------------------------------

/**
 * 归一推理字段 —— 将 `reasoning` 搬进 `reasoning_content`。
 *
 * 规则（与 Nexus `normalize_reasoning` 对齐）：
 * - 只有 `reasoning` → 补出 `reasoning_content`
 * - 两者都有 → **规范名优先**，不被覆盖
 * - 没有推理字段 → 不动它
 * - `reasoning` 非字符串 → 不当成内容（不制造假字段）
 *
 * @param delta delta 对象（原地修改）
 */
export function normalize_reasoning(delta: Record<string, unknown>): void {
  if (typeof delta["reasoning"] === "string") {
    if (!("reasoning_content" in delta)) {
      delta["reasoning_content"] = delta["reasoning"];
    }
  }
}

// ---------------------------------------------------------------------------
// Chunk 归一
// ---------------------------------------------------------------------------

/**
 * 归一 chunk —— 把 `reasoning` 搬进 `delta`。
 *
 * 与 Nexus `normalize_chunk` 对齐：不改写顶层自定义字段（provider / service_tier 保留）。
 *
 * @param chunk 原始 chunk
 * @param completion_id completion id
 * @param created 创建时间
 * @param model 模型名
 * @returns 归一后的 chunk
 */
export function normalize_chunk(
  chunk: Record<string, unknown>,
  completion_id: string,
  created: number,
  model: string,
): Record<string, unknown> {
  const choices = chunk["choices"] as Record<string, unknown>[] | undefined;
  if (Array.isArray(choices) && choices.length > 0) {
    const delta = choices[0]["delta"] as Record<string, unknown> | undefined;
    if (delta && typeof delta === "object") {
      normalize_reasoning(delta);
    }
  }
  return {
    ...chunk,
    id: completion_id,
    created,
    model,
  };
}

// ---------------------------------------------------------------------------
// 流式降级
// ---------------------------------------------------------------------------

/**
 * 流式不可用渠道登记表。
 *
 * 这些渠道 stream=true 恒返回单块空 delta，而同一端点非流式是正常的。
 * 与 Nexus `stream_unsupported` 对齐。
 */
const STREAM_UNSUPPORTED: Record<string, string> = {
  clawbrain: "clawbrain 上游 SSE 已坏,降级为非流式",
};

/**
 * 查询渠道是否登记了流式不可用。
 *
 * @param vendor 渠道标识
 * @returns 降级说明，未登记返回 undefined
 */
export function stream_unsupported_note(
  vendor: string,
): string | undefined {
  return STREAM_UNSUPPORTED[vendor];
}

// ---------------------------------------------------------------------------
// OpenAI 兼容连接器
// ---------------------------------------------------------------------------

/**
 * OpenAI 兼容连接器 —— 实现 {@link AuthConnector} 契约。
 *
 * 认证：`Authorization: Bearer <api_key>`
 * 端点：`{base_url}/chat/completions`
 */
export class OpenAICompatAdapter implements AuthConnector {
  readonly vendorId = "openai_compat";

  private readonly extraHeaders: Record<string, string>;

  constructor(extraHeaders?: Record<string, string>) {
    this.extraHeaders = extraHeaders ?? {};
  }

  async getToken(creds: ConnectorCredentials): Promise<TokenState> {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      throw new UpstreamError(
        "auth",
        "[openai_compat] 缺少 api_key",
        false,
        401,
      );
    }
    // OpenAI 兼容上游的 api_key 本身就是访问 token，无过期概念
    return {
      accessToken: apiKey,
      expiresAt: Number.POSITIVE_INFINITY,
    };
  }

  decorateRequest(
    base: RequestDecoration,
    token: TokenState,
  ): RequestDecoration {
    return {
      ...base,
      headers: {
        ...base.headers,
        ...this.extraHeaders,
        Authorization: `Bearer ${token.accessToken}`,
      },
    };
  }

  classifyError(httpStatus: number, body: unknown, headers?: Record<string, string | string[] | undefined> | null): UpstreamError {
    return classify_openai_error(httpStatus, body, headers);
  }
}

// ---------------------------------------------------------------------------
// 请求头
// ---------------------------------------------------------------------------

/**
 * 构建 OpenAI 兼容请求头。
 *
 * 与 Nexus `_headers` 对齐。
 */
export function build_openai_headers(
  api_key: string,
  stream: boolean = false,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream" : "application/json",
    Authorization: `Bearer ${api_key}`,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

/**
 * 上游错误体 / 响应头里的「多久后重试」(**秒**)。读不出 → `undefined`。
 *
 * 三个来源(按优先级):
 * 1. 错误体 JSON 的 `retry_after` / `retryAfter` / `retry-after`(数字或数字串);
 * 2. 响应头 `Retry-After` 的**秒数**形态(RFC 7231 的 delay-seconds);
 * 3. 响应头 `Retry-After` 的 **HTTP-date** 形态 → 折算成「距今多少秒」。
 *
 * ⚠️ 这是「**优先按上游给出的时间**」的落地口:上游明说了「30 秒后重试」,
 * 就没有理由拿全局 15 分钟冷却去压它 —— 见 `router/types.ts` 的
 * {@link CooldownHint}:上游给的绝对时刻**压过**一切本地策略。
 *
 * 负值 / 非有限值一律当「没给」:上游偶尔会回 `retry_after: -1` 或
 * `retry_after: "soon"`,照抄会把冷却截止时刻设到过去(等于不冷却),
 * 也会把 `-1` 当成一个合法的秒数往下传。
 */
export function retryAfterOf(
  body: unknown,
  headers?: Record<string, string | string[] | undefined> | null,
): number | undefined {
  const fromBody = numberFrom(body);
  if (fromBody !== undefined) return fromBody;
  if (!headers) return undefined;
  const raw = pickHeader(headers, "retry-after");
  if (raw === undefined) return undefined;
  const secs = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(secs)) {
    return secs >= 0 ? Math.ceil(secs) : undefined;
  }
  // HTTP-date 形态(IMF-fixdate / RFC 850 / asctime 都试一遍)
  const at = Date.parse(raw);
  if (Number.isFinite(at)) {
    const delta = Math.ceil((at - Date.now()) / 1000);
    return delta >= 0 ? delta : undefined;
  }
  return undefined;
}

/** 大小写不敏感地取一个响应头(Node fetch 的 Headers 或普通对象都吃)。 */
function pickHeader(
  headers: Record<string, string | string[] | undefined> | null | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== want) continue;
    const text = Array.isArray(v) ? v[0] : v;
    if (typeof text === "string") return text;
  }
  return undefined;
}

/** 错误体里的 `retry_after` 同义键。 */
function numberFrom(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  for (const key of ["retry_after", "retryAfter", "retry-after", "retry_in", "retryIn"]) {
    const v = b[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      return v >= 0 ? Math.ceil(v) : undefined;
    }
    if (typeof v === "string") {
      const n = Number(v.trim());
      if (v.trim() !== "" && Number.isFinite(n)) return n >= 0 ? Math.ceil(n) : undefined;
    }
  }
  // 有些上游把它塞在 error 对象里(OpenAI 的形状)
  const err = b["error"];
  if (err && typeof err === "object") return numberFrom(err);
  return undefined;
}

/**
 * 上游错误体里的人话理由(取第一个读得出的)。
 *
 * 顺序与 Nexus `_error_detail` 对齐:`error.message` → `message` → `detail`
 * → `msg` → `error`(字符串)。读不出 → 空串(调用方退回自己的类别标签)。
 */
export function upstreamDetailOf(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  const err = b["error"];
  if (err && typeof err === "object") {
    const inner = upstreamDetailOf(err);
    if (inner) return inner;
  }
  for (const key of ["message", "detail", "msg", "error"]) {
    const v = b[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim().slice(0, 300);
  }
  return "";
}

/**
 * OpenAI 兼容上游错误分类。
 *
 * 规则（与 Nexus `raise_for_status` 对齐）：
 * - 429 → rate_limit（可重试）
 * - 401 / 403 → auth（不可重试）
 * - 5xx → upstream（可重试）
 * - 4xx → bad_request（不可重试）
 * - 200 + 非零 code → 拒绝（特殊处理）
 *
 * ⚠️ 2026-10-21 起**带上游原文与 `retry_after`**:以前这里把 body 整个丢掉,
 * 用户只看到一句「上游错误」,既不知道上游说了什么,也拿不到上游给的冷却
 * 时长(于是每次 503 都按全局 15 分钟熔断)。现在 message 追加上游理由,
 * `retryAfter` 从 body / 响应头里读(见 {@link retryAfterOf})。
 */
export function classify_openai_error(
  httpStatus: number,
  body: unknown,
  headers?: Record<string, string | string[] | undefined> | null,
): UpstreamError {
  const detail = upstreamDetailOf(body);
  const retryAfter = retryAfterOf(body, headers);
  // ⚠️ 客户端看到的是上游原件(用户 m36329),不是这里改写过的 message ——
  // message 只喂日志。原本体一律挂到 raw 上。
  const original = upstreamRawResponse(httpStatus, body);
  const make = (kind: UpstreamErrorKind, label: string, retryable: boolean, status: number) =>
    new UpstreamError(
      kind,
      detail ? `${label}:${detail}` : label,
      retryable,
      status,
      retryAfter,
      original,
    );

  // HTTP 200 + 非零 code = 拒绝（如 sensenova 的 429 body）
  if (httpStatus === 200) {
    const code = extractCode(body);
    if (code !== undefined && code !== 0) {
      return new UpstreamError(
        "bad_request",
        detail ? `上游返回非零 code: ${code}:${detail}` : `上游返回非零 code: ${code}`,
        false,
        400,
        retryAfter,
        original,
      );
    }
    return new UpstreamError(
      "bad_request",
      detail ? `上游返回非零 code:${detail}` : "上游返回非零 code",
      false,
      400,
      retryAfter,
      original,
    );
  }

  if (httpStatus === 429) {
    return make("rate_limit", "上游限流", true, 429);
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return make("auth", "认证失败", false, httpStatus);
  }
  if (httpStatus >= 500) {
    return make("upstream", "上游错误", true, httpStatus);
  }
  if (httpStatus >= 400) {
    return make("bad_request", "请求错误", false, httpStatus);
  }
  return make("upstream", "未知错误", true, httpStatus);
}

/**
 * 从响应体中提取 code 字段。
 */
function extractCode(body: unknown): number | undefined {
  if (body && typeof body === "object") {
    const code = (body as Record<string, unknown>)["code"];
    if (typeof code === "number") return code;
  }
  return undefined;
}
