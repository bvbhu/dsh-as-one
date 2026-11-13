/**
 * Qoder 线协议常量与纯解析（不触网、不持有状态）。
 *
 * 端点、请求头、错误码表、SSE 解析、目录/用量/活动解析、聊天报文体模板都在这里，
 * 便于单测逐条对着上游报文断言。网络与签名在 `qoder.ts` / `qoder-cosy.ts`。
 *
 * @module connectors/qoder-wire
 */

import { cosyEncode } from "./qoder-cosy.js";

// ---------------------------------------------------------------------------
// 区域
// ---------------------------------------------------------------------------

/**
 * 只接国内版(用户定案 2026-10-30)。
 *
 * 国际版(`api1.qoder.sh`)曾经实现过,但面板不提供切换、也没有任何账号在跑,
 * 留着一整套分支只会让「区域」这个维度在页面与接口里到处漏 —— 直接收成单区域。
 */
export const QODER_REGIONS = ["qoder"] as const;
export type QoderRegion = (typeof QODER_REGIONS)[number];

export function isQoderRegion(v: unknown): v is QoderRegion {
  return v === "qoder";
}

export interface QoderRegionConfig {
  /** 区域名（也是 provider id）。 */
  region: QoderRegion;
  label: string;
  /** cosy 网关（chat / models / jobToken 共用）。 */
  gateway: string;
  /** sash 面（用量 / 活动）主机。 */
  openapi: string;
  chatPath: string;
  modelsPath: string;
  jobTokenPath: string;
  campaignsPath: string;
  /** sash 面是否需要设备风控三件套头(国际版才需要;单区域后恒 false)。 */
  requiresDeviceRisk: boolean;
}

/**
 * 聊天端点。
 *
 * ⚠️ **`Encode=1` 是必需的,不是可选装饰**:报文体走 cosy 自定义 base64
 * (`signedRequest` 里 `body: cosyEncode(JSON.stringify(template))`),上游
 * `AlgoServiceApiController.internalSseInvoke` 靠这个查询参数决定「先解码再
 * `JsonUtils.parse`」。漏掉它,上游会把编码串直接当 JSON 解析,报
 * `Unrecognized token '<编码首字符>'` —— 实测首字符解码回来正是 `typ`,
 * 即我们 `contents:[{"type":"text",…}]` 的开头,416/502 由此而来。
 * 同组的 models / jobToken 两个端点都带着它,本端点此前漏了。
 */
export const QODER_CHAT_PATH =
  "/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentMode=prompt_enhancer&Encode=1";
const MODELS_PATH = "/algo/api/v2/model/list?Encode=1";
const JOB_TOKEN_PATH = "/algo/api/v3/user/jobToken?Encode=1";
const CAMPAIGNS_PATH = "/sash/api/v1/me/campaigns";
const CAMPAIGNS_QUERY = "?forceRefresh=true";

export const QODER_REGION_CONFIGS: Readonly<Record<QoderRegion, QoderRegionConfig>> = {
  qoder: {
    region: "qoder",
    label: "Qoder（国内）",
    gateway: "https://gateway.qoder.com.cn",
    openapi: "https://openapi.qoder.com.cn",
    chatPath: QODER_CHAT_PATH,
    modelsPath: MODELS_PATH,
    jobTokenPath: JOB_TOKEN_PATH,
    campaignsPath: CAMPAIGNS_PATH,
    requiresDeviceRisk: false,
  },
};

/** cosy 客户端版本（进请求头，**不**进 Bearer 载荷）。 */
export const COSY_CLIENT_TYPE = "10";
export const COSY_VERSION_HEADER = "1.1.69";
/** sash 面自己的客户端标识（与 cosy 面同值但不同源）。 */
export const SASH_CLIENT_TYPE = "10";
export const SASH_USER_AGENT = "Qoder";

/** 所有 cosy 面请求的公共头。 */
export const QODER_DEFAULT_HEADERS: Readonly<Record<string, string>> = {
  "cosy-data-policy": "agree",
  "content-type": "application/json",
  "cosy-clienttype": COSY_CLIENT_TYPE,
  "login-version": "v2",
  "user-agent": "Go-http-client/2.0",
  "cosy-scene": "assistant",
  "cosy-business-product": "ide",
  "cosy-business-type": "agent",
};

/** PAT（`pt-…`）或 refresh token（`drt-…`）。 */
export function credentialKind(credential: string): "pat" | "refresh" | "unknown" {
  if (credential.startsWith("pt-")) return "pat";
  if (credential.startsWith("drt-")) return "refresh";
  return "unknown";
}

/** jobToken 交换请求体（cosy 自定义 base64 编码）。 */
export function jobTokenBody(credential: string): string {
  const isRefresh = credential.startsWith("drt-");
  const inner = {
    personalToken: isRefresh ? "" : credential,
    securityOauthToken: "",
    refreshToken: isRefresh ? credential : "",
    needRefresh: isRefresh,
    authInfo: {},
  };
  const outer = { payload: JSON.stringify(inner), encodeVersion: "1" };
  return cosyEncode(new TextEncoder().encode(JSON.stringify(outer)));
}

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

export type UpstreamErrorKind =
  | "auth"
  | "rate-limited"
  | "quota-exhausted"
  | "invalid-request"
  | "transient"
  | "content-policy"
  | "unknown";

/** 额度耗尽类业务码（`110` 当日用量用尽、`111` 套餐过期等）。 */
export const QUOTA_CODES: ReadonlySet<string> = new Set(["110", "111", "112"]);

const CONTENT_POLICY_MARKERS = [
  "DataInspectionFailed",
  "inappropriate content",
  "content_policy",
  "content policy",
];

export function isContentPolicy(detail: string): boolean {
  const lower = detail.toLowerCase();
  return CONTENT_POLICY_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

/** HTTP 状态 → 错误分类（内容审核标记优先于状态码）。 */
export function classifyHttpStatus(status: number, detail = ""): UpstreamErrorKind {
  if (isContentPolicy(detail)) return "content-policy";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limited";
  if (status === 400) return "invalid-request";
  if (status === 418 || status >= 500) return "transient";
  return "unknown";
}

/** 从错误体里取业务码，统一成字符串（`"110"` 与 `110` 都认）。 */
export function businessCodeOf(detail: string): string | undefined {
  const trimmed = detail.trim();
  if (!trimmed.startsWith("{")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const raw = (parsed as Record<string, unknown>)["code"];
  if (typeof raw === "string" && raw !== "") return raw;
  if (typeof raw === "number" && Number.isInteger(raw)) return String(raw);
  return undefined;
}

const MAX_CODE_NESTING = 6;

/**
 * 下钻取最深一层的业务码：上游的错误常在 `message` 里再套一层 JSON
 * （`{"code":"10605","message":"{\"retryAfterSeconds\":5,…}"}`）。
 */
export function deepestBusinessCode(detail: string, depth = 0): string | undefined {
  const code = businessCodeOf(detail);
  if (code !== undefined) return code;
  if (depth >= MAX_CODE_NESTING) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail.trim());
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const message = (parsed as Record<string, unknown>)["message"];
  if (typeof message !== "string") return undefined;
  return deepestBusinessCode(message, depth + 1);
}

/**
 * 业务码 → 错误分类。`110` 是「当日用量用尽」，**不是**凭据失效：
 * chat 面实测就是 HTTP 403 + `{"code":"110"}`，只看状态码会把好账号踢出池。
 */
export function classifyBusinessCode(code: string | undefined): UpstreamErrorKind | undefined {
  if (code === undefined) return undefined;
  if (QUOTA_CODES.has(code)) return "quota-exhausted";
  if (code === "10605") return "rate-limited";
  return undefined;
}

/** 组合分类：业务码优先，其次 HTTP 状态。 */
export function classifyFailure(status: number, detail: string): UpstreamErrorKind {
  if (isContentPolicy(detail)) return "content-policy";
  return classifyBusinessCode(deepestBusinessCode(detail)) ?? classifyHttpStatus(status, detail);
}

/** 上游申报的「等这么久再试」（毫秒）。只认 JSON 里的 `retryAfterSeconds`。 */
export function retryAfterMsOf(detail: string, depth = 0): number | undefined {
  const trimmed = detail.trim();
  if (!trimmed.startsWith("{")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const rec = parsed as Record<string, unknown>;
  const seconds = rec["retryAfterSeconds"];
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  if (depth >= MAX_CODE_NESTING) return undefined;
  const message = rec["message"];
  return typeof message === "string" ? retryAfterMsOf(message, depth + 1) : undefined;
}

/** `Retry-After` 头 → 毫秒（秒数或 HTTP 日期都认）。 */
export function retryAfterMsOfHeader(value: string | null, nowMs = Date.now()): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}

// ---------------------------------------------------------------------------
// SSE 解析
// ---------------------------------------------------------------------------

/** 一条 SSE `data:` 行里取的帧（已剥壳）。 */
export interface QoderFrame {
  /** 内层 OpenAI 形状对象（可能是 delta 也可能整块）。 */
  inner: Record<string, unknown>;
  /** 信封上的 HTTP 状态（缺席视为 200）。 */
  statusCode: number;
  /** 原始文本（错误原文展示用）。 */
  raw: string;
}

/** 取 SSE 行的数据载荷：`data: {...}` / `data:{...}` / `[DONE]` → undefined。 */
export function sseDataPayload(line: string): string | undefined {
  if (!line.startsWith("data:")) return undefined;
  const payload = line.slice("data:".length).trim();
  if (payload === "" || payload === "[DONE]") return undefined;
  return payload;
}

/**
 * 把一行 `data:` 载荷解成帧。
 *
 * 上游有两种形状，都要认：
 * - 信封：`{"statusCodeValue":200,"body":"{\"choices\":[...]}","headers":{...}}`
 * - 直给：`{"choices":[...]}`（不带信封）
 */
export function parseQoderFrame(payload: string): QoderFrame | undefined {
  let outer: unknown;
  try {
    outer = JSON.parse(payload);
  } catch {
    return undefined;
  }
  if (typeof outer !== "object" || outer === null) return undefined;
  const rec = outer as Record<string, unknown>;
  const statusRaw = rec["statusCodeValue"] ?? rec["statusCode"];
  const statusCode = typeof statusRaw === "number" ? statusRaw : 200;
  const body = rec["body"];
  if (typeof body === "string" && body.trim() !== "") {
    try {
      const inner = JSON.parse(body);
      if (typeof inner === "object" && inner !== null) {
        return { inner: inner as Record<string, unknown>, statusCode, raw: payload };
      }
    } catch {
      return { inner: { __raw: body }, statusCode, raw: payload };
    }
    return undefined;
  }
  return { inner: rec, statusCode, raw: payload };
}

/**
 * 上游用 `event:error` 回的失败帧（实测形状）：
 * `{"success":false,"traceId":"…","msgCode":500,"msgInfo":"Internal Server Error","message":"…"}`
 *
 * 这类帧没有 `choices`，交给 {@link parseStreamDelta} 只会得到一条「空增量」，
 * 于是整条请求变成 200 + 空 content —— 明明上游报了错却装作成功。这里把它认出来，
 * 让调用方按真错误抛（带原文，符合「上游给了什么就回什么」的口径）。
 */
export function qoderErrorFrameOf(inner: Record<string, unknown>, raw: string): { status: number; detail: string } | undefined {
  const failed = inner["success"] === false;
  const codeRaw = inner["msgCode"] ?? inner["code"] ?? inner["statusCode"];
  const code = typeof codeRaw === "number" && Number.isFinite(codeRaw) ? codeRaw : undefined;
  const hasChoices = Array.isArray(inner["choices"]) && (inner["choices"] as unknown[]).length > 0;
  if (!failed && (code === undefined || hasChoices)) return undefined;
  const message = typeof inner["message"] === "string" ? inner["message"] : typeof inner["msgInfo"] === "string" ? inner["msgInfo"] : "";
  return {
    status: code !== undefined && code >= 400 ? code : 500,
    detail: message !== "" ? `${message} | ${raw}` : raw,
  };
}

/**
 * 把一整块 `event:error`（可能含多行、末行是不带 `data:` 前缀的 JSON）解成状态码。
 *
 * 上游真实形状见 {@link qoderErrorFrameOf} 的注释：带 `msgCode` 的那一行往往是
 * 块里的**最后一行裸 JSON**，所以这里逐行扫、后出现的覆盖先出现的。
 */
export function qoderErrorBlockOf(text: string): { status: number; detail: string } {
  let status: number | undefined;
  let message = "";
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const payload = line.startsWith("data:") ? line.slice("data:".length).trim() : line;
    if (!payload.startsWith("{")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const frame = qoderErrorFrameOf(parsed as Record<string, unknown>, payload);
    if (frame === undefined) continue;
    status = frame.status;
    if (message === "" || /msgInfo|message/.test(payload)) {
      message = frame.detail.split(" | ")[0] ?? "";
    }
  }
  return {
    status: status !== undefined && status >= 400 ? status : 500,
    detail: message !== "" ? `${message} | ${text}` : text,
  };
}

/** 从内层对象抽增量文本 / 思考 / 工具调用 / 用量 / 结束原因。 */
export interface QoderStreamDelta {
  content: string;
  reasoning: string;
  toolCalls: unknown[] | undefined;
  finishReason: string | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  cachedTokens: number | undefined;
}

function readCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** undefined = 上游这一帧没报（与「命中 0」是两件事）。 */
export function parseCachedTokens(usage: Record<string, unknown>): number | undefined {
  const details = usage["prompt_tokens_details"];
  if (typeof details === "object" && details !== null) {
    const fromDetails = readCount((details as Record<string, unknown>)["cached_tokens"]);
    if (fromDetails !== undefined) return fromDetails;
  }
  return readCount(usage["prompt_cache_hit_tokens"]) ?? readCount(usage["cached_tokens"]);
}

export function parseStreamDelta(inner: Record<string, unknown>): QoderStreamDelta {
  const choices = inner["choices"];
  const first =
    Array.isArray(choices) && choices.length > 0 && typeof choices[0] === "object" && choices[0] !== null
      ? (choices[0] as Record<string, unknown>)
      : undefined;
  const delta = first?.["delta"] as Record<string, unknown> | undefined;
  const message = first?.["message"] as Record<string, unknown> | undefined;
  const source = delta ?? message ?? {};
  const content = typeof source["content"] === "string" ? source["content"] : "";
  const reasoning =
    typeof source["reasoning_content"] === "string"
      ? source["reasoning_content"]
      : typeof source["reasoning"] === "string"
        ? source["reasoning"]
        : "";
  const toolCalls = Array.isArray(source["tool_calls"])
    ? (source["tool_calls"] as unknown[])
    : Array.isArray(inner["tool_calls"])
      ? (inner["tool_calls"] as unknown[])
      : undefined;
  const usage = inner["usage"];
  const usageRec =
    typeof usage === "object" && usage !== null ? (usage as Record<string, unknown>) : undefined;
  const finishRaw = first?.["finish_reason"];
  return {
    content,
    reasoning,
    toolCalls,
    finishReason: typeof finishRaw === "string" && finishRaw !== "" ? finishRaw : undefined,
    inputTokens: usageRec ? readCount(usageRec["prompt_tokens"]) : undefined,
    outputTokens: usageRec ? readCount(usageRec["completion_tokens"]) : undefined,
    cachedTokens: usageRec ? parseCachedTokens(usageRec) : undefined,
  };
}

// ---------------------------------------------------------------------------
// 目录 / 用量 / 活动解析
// ---------------------------------------------------------------------------

export interface QoderCatalogModel {
  /** 上游模型键（请求头 `x-model-key` / 报文 `model_config.key` 用它）。 */
  key: string;
  displayName: string;
  enable: boolean;
  isDefault: boolean;
  isVl: boolean;
  isReasoning: boolean;
  isFree: boolean;
  priceFactor: number | undefined;
  /** 默认档上下文窗口(上游 `max_input_tokens`,通常是最小档,如 200000)。 */
  maxInputTokens: number | undefined;
  /**
   * **最大档**上下文窗口(上游 `context_config` 里 `token_count` 的最大值,如 1000000)。
   *
   * 为什么需要:上游 `max_input_tokens` 只是 `context_config` 里 `is_default` 那一档
   * (用户实测拿到 200000,而同一模型 `context_config` 里还有 `"1M":{token_count:1000000}`)。
   * 我们的网关**总是**按报文体里的 `context_window` 声明上限,取最小档等于白扔 80% 窗口。
   */
  maxContextTokens: number | undefined;
  maxOutputTokens: number | undefined;
  raw: Record<string, unknown>;
}

function pickList(payload: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const v = payload[key];
    if (Array.isArray(v)) return v;
  }
  const data = payload["data"];
  if (typeof data === "object" && data !== null) return pickList(data as Record<string, unknown>, keys);
  return [];
}

/**
 * 从上游 `context_config` 里取**最大档**上下文窗口(令牌数)。
 *
 * 上游形状:`{"1M":{"token_count":1000000},"200K":{"token_count":200000,"is_default":true},
 * "400K":{"token_count":400000}}` —— 键是档位名(1M/200K/400K),值里 `token_count` 是
 * 该档的真实令牌数。`max_input_tokens` 同级字段只是 `is_default` 那一档,不取最大值。
 *
 * 容错:没有 `context_config` / 结构不符 / token_count 不是正数 → undefined
 * (交给上层回落到 `max_input_tokens`,而不是编一个数字)。
 */
function maxContextOf(rec: Record<string, unknown>): number | undefined {
  const cfg = rec["context_config"];
  if (typeof cfg !== "object" || cfg === null) return undefined;
  let max: number | undefined;
  for (const value of Object.values(cfg as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const count = (value as Record<string, unknown>)["token_count"];
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) continue;
    if (max === undefined || count > max) max = count;
  }
  return max;
}

/** 解析 `/algo/api/v2/model/list` 响应（宽容：缺字段就少渲染，不编造）。 */
export function parseModelCatalog(payload: Record<string, unknown>): QoderCatalogModel[] {
  const rows = pickList(payload, ["models", "chat", "model_list"]);
  const out: QoderCatalogModel[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const rec = row as Record<string, unknown>;
    const key = typeof rec["key"] === "string" ? rec["key"] : "";
    if (key === "") continue;
    const displayName =
      typeof rec["display_name"] === "string" && rec["display_name"] !== ""
        ? rec["display_name"]
        : typeof rec["name"] === "string" && rec["name"] !== ""
          ? rec["name"]
          : key;
    out.push({
      key,
      displayName,
      enable: rec["enable"] !== false,
      isDefault: rec["is_default"] === true,
      isVl: rec["is_vl"] === true,
      isReasoning: rec["is_reasoning"] === true,
      isFree: rec["is_free"] === true,
      priceFactor: typeof rec["price_factor"] === "number" ? rec["price_factor"] : undefined,
      maxInputTokens:
        typeof rec["max_input_tokens"] === "number" ? rec["max_input_tokens"] : undefined,
      maxContextTokens: maxContextOf(rec),
      maxOutputTokens:
        typeof rec["max_output_tokens"] === "number" ? rec["max_output_tokens"] : undefined,
      raw: rec,
    });
  }
  return out;
}

export interface QoderQuotaBucket {
  total: number | undefined;
  used: number | undefined;
  remaining: number | undefined;
  percentage: number | undefined;
}

export interface QoderUsage {
  userType: string | undefined;
  /** 套餐到期时间（秒）。 */
  expiresAt: number | undefined;
  upgradeUrl: string | undefined;
  userQuota: QoderQuotaBucket | undefined;
  addOnQuota: (QoderQuotaBucket & { detailUrl: string | undefined }) | undefined;
  orgResourcePackage:
    | {
        used: number | undefined;
        cap: number | undefined;
        remaining: number | undefined;
        percentage: number | undefined;
        available: boolean;
      }
    | undefined;
  isQuotaExceeded: boolean;
}

function numOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * 到期时间戳归一成 **epoch 秒**。
 *
 * 为什么需要:契约(`QoderUsage.expiresAt` / `QoderCreditsView.expiresAt`)写的是秒,
 * 页面按秒 × 1000 渲染;但上游 `sash/api/v2/me/usage` 实际回的是**毫秒**
 * (实测 1.79e12 量级,页面直接显示成「58836/4/30」)。这里按量级判定:
 * ≥ 1e11 视为毫秒(1e11 秒 = 公元 5138 年,任何真实秒级时间戳都到不了),
 * 除此之外原样返回(含 0 / 负数这种「上游给了但没意义」的值,交给上层当无值处理)。
 */
function epochSecondsOf(v: unknown): number | undefined {
  const n = numOrUndefined(v);
  if (n === undefined) return undefined;
  return n >= 100_000_000_000 ? Math.floor(n / 1000) : n;
}

function readBucket(value: unknown): QoderQuotaBucket | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  return {
    total: numOrUndefined(v["total"]),
    used: numOrUndefined(v["used"]),
    remaining: numOrUndefined(v["remaining"]),
    percentage: numOrUndefined(v["percentage"]),
  };
}

/** 解析 `sash/api/v2/me/usage`（兼容 `qoderUsage` 内层与平铺两种形状）。 */
export function parseUsage(payload: Record<string, unknown>): QoderUsage {
  const nested = payload["qoderUsage"];
  const source =
    typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : payload;
  const userQuota = readBucket(source["userQuota"]);
  const addOnRaw = source["addOnQuota"];
  const addOn = readBucket(addOnRaw);
  const orgRaw = source["orgResourcePackage"];
  const org =
    typeof orgRaw === "object" && orgRaw !== null ? (orgRaw as Record<string, unknown>) : undefined;
  const expRaw = source["expiresAt"];
  return {
    userType: typeof source["userType"] === "string" ? source["userType"] : undefined,
    expiresAt: epochSecondsOf(expRaw),
    upgradeUrl: typeof source["upgradeUrl"] === "string" ? source["upgradeUrl"] : undefined,
    userQuota,
    addOnQuota:
      addOn === undefined
        ? undefined
        : {
            ...addOn,
            detailUrl:
              typeof (addOnRaw as Record<string, unknown>)["detailUrl"] === "string"
                ? String((addOnRaw as Record<string, unknown>)["detailUrl"])
                : undefined,
          },
    orgResourcePackage:
      org === undefined
        ? undefined
        : {
            used: numOrUndefined(org["used"]),
            cap: numOrUndefined(org["cap"]),
            remaining: numOrUndefined(org["remaining"]),
            percentage: numOrUndefined(org["percentage"]),
            available: org["available"] === true,
          },
    isQuotaExceeded: source["isQuotaExceeded"] === true,
  };
}

export interface QoderCampaign {
  campaignId: string;
  campaignKey: string | undefined;
  actionType: string;
  /** `CLAIMABLE` / `CLAIMED` / … */
  claimStatus: string;
  amount: number | undefined;
  validityDays: number | undefined;
  /** 秒。 */
  startAt: number | undefined;
  endAt: number | undefined;
  campaignUrl: string | undefined;
  content: Record<string, { title?: string; description?: string; detailUrl?: string; buttonText?: string }>;
}

/** 把一条 campaign 投影成面板能直接渲染的形状（宽容）。 */
export function projectCampaignEntry(entry: unknown): QoderCampaign | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const raw = entry as Record<string, unknown>;
  const campaignId = typeof raw["campaignId"] === "string" ? raw["campaignId"] : "";
  if (campaignId === "") return undefined;
  const benefit =
    typeof raw["benefit"] === "object" && raw["benefit"] !== null
      ? (raw["benefit"] as Record<string, unknown>)
      : {};
  const validity =
    typeof benefit["validity"] === "object" && benefit["validity"] !== null
      ? (benefit["validity"] as Record<string, unknown>)
      : {};
  const placements = Array.isArray(raw["placements"]) ? (raw["placements"] as unknown[]) : [];
  let campaignUrl: string | undefined;
  const content: QoderCampaign["content"] = {};
  for (const p of placements) {
    if (typeof p !== "object" || p === null) continue;
    const slot = p as Record<string, unknown>;
    if (campaignUrl === undefined && typeof slot["campaignUrl"] === "string") {
      campaignUrl = slot["campaignUrl"];
    }
    const slotContent = slot["content"];
    if (typeof slotContent !== "object" || slotContent === null) continue;
    for (const [lang, text] of Object.entries(slotContent as Record<string, unknown>)) {
      if (typeof text !== "object" || text === null) continue;
      const t = text as Record<string, unknown>;
      const row: QoderCampaign["content"][string] = {
        ...(typeof t["title"] === "string" ? { title: t["title"] } : {}),
        ...(typeof t["description"] === "string" ? { description: t["description"] } : {}),
        ...(typeof t["detailUrl"] === "string" ? { detailUrl: t["detailUrl"] } : {}),
        ...(typeof t["buttonText"] === "string" ? { buttonText: t["buttonText"] } : {}),
      };
      const prior = content[lang];
      if (prior === undefined || (Object.keys(prior).length === 0 && Object.keys(row).length > 0)) {
        content[lang] = row;
      }
    }
  }
  return {
    campaignId,
    campaignKey: typeof raw["campaignKey"] === "string" ? raw["campaignKey"] : undefined,
    actionType: typeof raw["actionType"] === "string" ? raw["actionType"] : "",
    claimStatus: typeof raw["claimStatus"] === "string" ? raw["claimStatus"] : "",
    amount: numOrUndefined(benefit["amount"]),
    validityDays: numOrUndefined(validity["days"]),
    startAt: numOrUndefined(raw["startAt"]),
    endAt: numOrUndefined(raw["endAt"]),
    campaignUrl,
    content,
  };
}

/** 活动列表响应 → `{campaigns, claimable, showCampaign, campaignUrl}`。 */
export function parseCampaignFeed(payload: Record<string, unknown>): {
  campaigns: QoderCampaign[];
  claimable: boolean | undefined;
  showCampaign: boolean | undefined;
  campaignUrl: string | undefined;
} {
  const data =
    typeof payload["data"] === "object" && payload["data"] !== null
      ? (payload["data"] as Record<string, unknown>)
      : payload;
  const rows = Array.isArray(data["campaigns"]) ? (data["campaigns"] as unknown[]) : [];
  return {
    campaigns: rows
      .map((entry) => projectCampaignEntry(entry))
      .filter((c): c is QoderCampaign => c !== undefined),
    claimable: typeof data["claimable"] === "boolean" ? data["claimable"] : undefined,
    showCampaign: typeof data["showCampaign"] === "boolean" ? data["showCampaign"] : undefined,
    campaignUrl: typeof data["campaignUrl"] === "string" ? data["campaignUrl"] : undefined,
  };
}

/** 签到结果（幂等三态）。 */
export type QoderCheckinOutcome =
  | { status: "claimed"; amount: number | undefined; validityDays: number | undefined; nextRefreshAtMs: number | undefined }
  | { status: "already-claimed"; nextRefreshAtMs: number | undefined }
  | { status: "unavailable"; message: string };

// ---------------------------------------------------------------------------
// 聊天报文体
// ---------------------------------------------------------------------------

export interface QoderChatTemplate {
  request_id: string;
  request_set_id: string;
  chat_record_id: string;
  stream: boolean;
  chat_task: string;
  chat_context: {
    extra: { modelConfig: { is_reasoning: boolean; key: string }; originalContent: { type: string; text: string } };
    text: { type: string; text: string };
  };
  session_id: string;
  source: number;
  version: string;
  aliyun_user_type: string;
  session_type: string;
  agent_id: string;
  task_id: string;
  model_config: { key: string; is_vl: boolean; is_reasoning: boolean; source: string };
  messages: unknown[];
  business: { id: string; name: string; begin_at: number };
  tools?: unknown[];
  reasoningEffort?: string;
  parameters?: Record<string, unknown>;
}

/** chat 报文体骨架（与官方客户端同形：顶层 + chat_context + business）。 */
export function createChatBodyTemplate(): QoderChatTemplate {
  return {
    request_id: "",
    request_set_id: "",
    chat_record_id: "",
    stream: true,
    chat_task: "FREE_INPUT",
    chat_context: {
      extra: {
        modelConfig: { is_reasoning: false, key: "lite" },
        originalContent: { type: "text", text: "" },
      },
      text: { type: "text", text: "" },
    },
    session_id: "",
    source: 1,
    version: "3",
    aliyun_user_type: "personal_standard",
    session_type: "qodercli",
    agent_id: "agent_common",
    task_id: "common",
    model_config: { key: "lite", is_vl: false, is_reasoning: false, source: "system" },
    messages: [],
    business: { id: "", name: "hi", begin_at: 0 },
  };
}

/** 写模型键（三处：model_config / chat_context.extra.modelConfig / aliyun_user_type）。 */
export function applyModelKey(
  template: QoderChatTemplate,
  modelKey: string,
  userType: string,
  isVl: boolean,
): void {
  template.model_config.key = modelKey;
  template.model_config.is_vl = isVl;
  template.chat_context.extra.modelConfig.key = modelKey;
  template.aliyun_user_type = userType !== "" ? userType : "personal_standard";
}

function blankResponseMeta(): Record<string, unknown> {
  return {
    id: "",
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      completion_tokens_details: { reasoning_tokens: 0 },
      prompt_tokens_details: { cached_tokens: 0 },
    },
  };
}

function structuredMessage(role: string, text: string): Record<string, unknown> {
  return { role, content: text, response_meta: blankResponseMeta(), reasoning_content_signature: "" };
}

/** 从 OpenAI 消息提取纯文本（content 字符串或 parts 数组）。 */
export function normalizeMessageText(message: Record<string, unknown>): string {
  const content = message["content"];
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content as unknown[]) {
      if (typeof part === "string") {
        parts.push(part);
        continue;
      }
      if (typeof part === "object" && part !== null) {
        const rec = part as Record<string, unknown>;
        if (typeof rec["text"] === "string") parts.push(rec["text"]);
        else if (typeof rec["value"] === "string") parts.push(rec["value"]);
      }
    }
    return parts.join("");
  }
  return "";
}

/** 提取 user 消息里的图片 URL。 */
export function extractMessageImages(message: Record<string, unknown>): string[] {
  if (message["role"] !== "user") return [];
  const content = message["content"];
  if (!Array.isArray(content)) return [];
  const urls: string[] = [];
  for (const part of content as unknown[]) {
    if (typeof part !== "object" || part === null) continue;
    const iu = (part as Record<string, unknown>)["image_url"];
    if (typeof iu === "object" && iu !== null) {
      const url = (iu as Record<string, unknown>)["url"];
      if (typeof url === "string") urls.push(url);
    }
  }
  return urls;
}

/** 最后一条 user 消息的纯文本（`business.name` 与 prompt 用）。 */
export function extractLatestUserPrompt(messages: Array<Record<string, unknown>>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m["role"] === "user") {
      const text = normalizeMessageText(m);
      if (text.trim() !== "") return text;
    }
  }
  return "";
}

/** OpenAI 消息数组 → Qoder 消息数组。 */
export function buildQoderMessages(messages: Array<Record<string, unknown>>): unknown[] {
  const out: unknown[] = [];
  for (const message of messages) {
    const role = typeof message["role"] === "string" ? message["role"] : "user";
    if (role === "user") {
      const images = extractMessageImages(message);
      const text = normalizeMessageText(message);
      const parts: Array<Record<string, unknown>> = [];
      for (const url of images) parts.push({ type: "image_url", image_url: { url } });
      if (text.trim() !== "") parts.push({ type: "text", text });
      if (parts.length === 0) parts.push({ type: "text", text: "" });
      out.push({
        role: "user",
        content: "",
        contents: parts,
        response_meta: blankResponseMeta(),
        reasoning_content_signature: "",
      });
      continue;
    }
    if (role === "tool") {
      const row = structuredMessage("tool", normalizeMessageText(message));
      if (typeof message["name"] === "string") row["name"] = message["name"];
      if (typeof message["tool_call_id"] === "string") row["tool_call_id"] = message["tool_call_id"];
      out.push(row);
      continue;
    }
    if (role === "assistant") {
      const row = structuredMessage("assistant", normalizeMessageText(message));
      if (Array.isArray(message["tool_calls"])) row["tool_calls"] = message["tool_calls"];
      out.push(row);
      continue;
    }
    out.push(structuredMessage(role, normalizeMessageText(message)));
  }
  return out;
}
