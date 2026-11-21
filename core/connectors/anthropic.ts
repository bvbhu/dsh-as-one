/**
 * Anthropic Messages 协议连接器（通用）。
 *
 * 与 `minimax` 的区别：minimax 是**内建账号**（OAuth access token + 固定端点）；
 * 这里是**用户自建渠道**——只要一个 base URL 与一把 key，就能把任何说
 * Anthropic Messages 的端点（官方 Anthropic、公司网关、中转站）接进 as-one。
 *
 * ## 端点与认证（约定，不猜）
 *
 * - 路径：base URL 写到 `/v1` 时补 `/messages`，否则补 `/v1/messages`（两种写法都收，
 *   与 DSH 的 pi-ai 对 Anthropic 列表端点的宽容口径一致）。
 * - 头：`anthropic-version: 2023-06-01`（可用 provider 扩展覆盖）。
 * - 认证：默认**同时**发 `x-api-key` 与 `Authorization: Bearer`。
 *   官方 Anthropic 只认 x-api-key，而大量中转站只认 Bearer；同时发两者是
 *   这类「Anthropic 兼容」网关的通行做法。可用扩展 `authStyle` 收窄。
 *
 * ## 方言
 *
 * 默认取**保守档**（{@link ANTHROPIC_QUIRKS}）：不主动发思考参数、不回放无签名思考。
 * 理由:真 Anthropic 校验思考签名,乱发 unsigned thinking 会 400;需要 MiniMax 那种
 * 行为的自建端点,用 `quirks` 扩展显式打开。
 */

import type { AuthConnector, ConnectorCredentials, RequestDecoration, TokenState } from "./types.js";
import { UpstreamError } from "./types.js";
import type { AnthropicQuirks } from "../wire/anthropic.js";

/** 默认的 Anthropic 协议版本。 */
export const ANTHROPIC_VERSION = "2023-06-01";

/** 官方路径（相对 base 的 `/v1`）。 */
export const ANTHROPIC_MESSAGES_PATH = "/messages";

/**
 * 自建 Anthropic 渠道的**默认方言**（保守档）。
 *
 * - `effortField: "none"`：不主动发思考参数（官方与多数中转对 `budget_tokens`
 *   的校验各不相同，发错就是 400）。
 * - `requiresSignature: true`：真 Anthropic 校验思考签名，历史思考**不回放**。
 * - `systemShape: "blocks"`：官方推荐块数组（也是带 cache_control 的唯一形态）。
 */
export const ANTHROPIC_QUIRKS: AnthropicQuirks = {
  effortField: "none",
  requiresSignature: true,
  systemShape: "blocks",
  streamOnly: true,
  maxTokensDefault: 8192,
};

/**
 * base URL → messages 端点。
 *
 * 两种写法都收：`https://api.anthropic.com/v1` 与 `https://api.anthropic.com`。
 */
export function anthropicMessagesUrl(baseUrl: string): string {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (base === "") return "";
  return /\/v1$/i.test(base) ? `${base}${ANTHROPIC_MESSAGES_PATH}` : `${base}/v1${ANTHROPIC_MESSAGES_PATH}`;
}

const EFFORT_FIELDS = new Set(["output_config", "budget_tokens", "none"]);

/**
 * 解析 provider 扩展里的 `quirks`（对象或 JSON 串）。
 *
 * 只认白名单键与白名单取值：写错的开关**丢掉**而不是让整条渠道失效——
 * 一个拼错的 quirks 不该让用户的 key 变成「不可用」。
 */
export function anthropicQuirksFrom(raw: unknown): AnthropicQuirks {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return {};
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const out: AnthropicQuirks = {};
  if (typeof v["effortField"] === "string" && EFFORT_FIELDS.has(v["effortField"])) {
    out.effortField = v["effortField"] as AnthropicQuirks["effortField"];
  }
  if (typeof v["requiresSignature"] === "boolean") out.requiresSignature = v["requiresSignature"];
  if (v["systemShape"] === "string" || v["systemShape"] === "blocks") {
    out.systemShape = v["systemShape"];
  }
  if (typeof v["streamOnly"] === "boolean") out.streamOnly = v["streamOnly"];
  if (typeof v["maxTokensDefault"] === "number" && Number.isFinite(v["maxTokensDefault"]) && v["maxTokensDefault"] > 0) {
    out.maxTokensDefault = Math.floor(v["maxTokensDefault"]);
  }
  return out;
}

/** 认证风格：官方只认 x-api-key；多数中转只认 Bearer。默认两者都发。 */
export type AnthropicAuthStyle = "both" | "x-api-key" | "bearer";

function tokenOf(creds: ConnectorCredentials): string {
  const apiKey = typeof creds.apiKey === "string" ? creds.apiKey.trim() : "";
  if (apiKey !== "") return apiKey;
  const token = typeof creds["token"] === "string" ? String(creds["token"]).trim() : "";
  return token;
}

/** 上游错误体 → 可读一句（Anthropic 的形状是 `{type:"error",error:{type,message}}`）。 */
function detailOf(body: unknown): string {
  if (body !== null && typeof body === "object") {
    const err = (body as Record<string, unknown>)["error"];
    if (err !== null && typeof err === "object") {
      const message = (err as Record<string, unknown>)["message"];
      if (typeof message === "string" && message !== "") return message;
    }
  }
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/** 从错误体 / 响应头读 Retry-After（秒）。 */
function retryAfterOf(body: unknown, headers?: Record<string, string | string[] | undefined> | null): number | undefined {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() !== "retry-after") continue;
    const n = Number(Array.isArray(value) ? value[0] : value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (body !== null && typeof body === "object") {
    for (const key of ["retry_after", "retryAfter"]) {
      const n = Number((body as Record<string, unknown>)[key]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

/** 通用 Anthropic Messages 连接器：只做「取 token / 装饰头 / 错误归类」。 */
export class AnthropicAdapter implements AuthConnector {
  readonly vendorId = "anthropic";

  async getToken(creds: ConnectorCredentials): Promise<TokenState> {
    const token = tokenOf(creds);
    if (token === "") {
      throw new UpstreamError("auth", "[anthropic] 缺少 API key", false, 401);
    }
    return { accessToken: token, expiresAt: Number.POSITIVE_INFINITY };
  }

  decorateRequest(base: RequestDecoration, token: TokenState): RequestDecoration {
    return {
      ...base,
      headers: {
        ...base.headers,
        "content-type": "application/json",
        "anthropic-version": ANTHROPIC_VERSION,
        // 官方只认 x-api-key，多数中转只认 Bearer —— 同时发是这类网关的通行做法。
        "x-api-key": token.accessToken,
        Authorization: `Bearer ${token.accessToken}`,
      },
    };
  }

  /**
   * 错误归类（Anthropic 语义）。
   *
   * 401/403 → auth（换号无意义）；429 → rate_limit（可退避）；529/5xx → upstream（可换档）；
   * 其余 4xx → bad_request（不可重试）。
   */
  classifyError(
    httpStatus: number,
    body: unknown,
    headers?: Record<string, string | string[] | undefined> | null,
  ): UpstreamError {
    const detail = detailOf(body);
    const retryAfter = retryAfterOf(body, headers);
    const suffix = detail === "" ? "" : ` — ${detail}`;
    if (httpStatus === 401 || httpStatus === 403) {
      return new UpstreamError("auth", `[anthropic] 鉴权失败(HTTP ${httpStatus})${suffix}`, false, httpStatus);
    }
    if (httpStatus === 429) {
      return new UpstreamError("rate_limit", `[anthropic] 上游限流(HTTP 429)${suffix}`, true, 429, retryAfter);
    }
    if (httpStatus >= 500) {
      return new UpstreamError("upstream", `[anthropic] 上游错误(HTTP ${httpStatus})${suffix}`, true, httpStatus, retryAfter);
    }
    if (httpStatus >= 400) {
      return new UpstreamError("bad_request", `[anthropic] 请求被拒(HTTP ${httpStatus})${suffix}`, false, httpStatus);
    }
    return new UpstreamError("upstream", `[anthropic] 意外的 HTTP ${httpStatus}`, true, httpStatus);
  }
}
