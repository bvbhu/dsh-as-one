/**
 * MiniMax Agent 连接器 —— **聊天转发**部分(签到/额度在 minimax-signin.ts)。
 *
 * ## 端点(2026-11-08 真机实测,两个账号都是 HTTP 200)
 *
 * `POST {base}/mavis/api/v1/llm/v1/messages`
 * - `base`:cn = `https://agent.minimaxi.com`,global = `https://agent.minimax.io`
 * - 头:`Authorization: Bearer <access_token>`、`anthropic-version: 2023-06-01`
 * - 体:Anthropic Messages(转换见 {@link ./minimax-llm.ts})
 *
 * ⚠️ 与签到/额度接口的区别:**不签名、不带设备查询串**。`x-signature` / `yy` /
 * `device_platform` 那一整套只属于 `/minimax-cloud/api/v1/*` 与 agent 会话协议;
 * 直连 LLM 端点只认 Bearer(桌面端就是这么发的)。把它和签到混在一起会凭空
 * 多算一遍 yy,反而 401。
 *
 * ⚠️ access token 是**不透明令牌**(`mmoat_…`,不是 JWT),约 12 小时过期;
 * 过期后上游回 401,由网关的认证类错误出口处理(面板提示重新授权)。
 * 续期由 `panel/src/refresh.ts` 的 `refreshMinimaxToken` 负责,这里不重复实现。
 */

import { UpstreamError } from "./types.js";
import type { AuthConnector, ConnectorCredentials, RequestDecoration, TokenState } from "./types.js";

/** 直连 LLM 端点路径(相对 `base`)。 */
export const MINIMAX_LLM_PATH = "/mavis/api/v1/llm/v1/messages";

/** chat 端点要求的 Anthropic 协议版本。 */
export const MINIMAX_ANTHROPIC_VERSION = "2023-06-01";

/** 从凭据里取 access token;`kind=oauth` 时它就是 Bearer,无需另存副本。 */
function tokenOf(creds: ConnectorCredentials): string {
  const apiKey = typeof creds.apiKey === "string" ? creds.apiKey.trim() : "";
  if (apiKey !== "") return apiKey;
  // 有些装配路径把凭据放在 `token` 里(workbuddy 同款);一并认。
  const token = typeof creds["token"] === "string" ? String(creds["token"]).trim() : "";
  return token;
}

/** MiniMax 连接器 —— 三个契约方法都只做「Bearer + 版本头 + 错误归类」。 */
export class MinimaxAdapter implements AuthConnector {
  readonly vendorId = "minimax";

  async getToken(creds: ConnectorCredentials): Promise<TokenState> {
    const token = tokenOf(creds);
    if (token === "") {
      throw new UpstreamError("auth", "[minimax] 缺少 access token(需重新设备码授权)", false, 401);
    }
    // 过期不在这里判:access token 是不透明串,读不出 exp;上游 401 才是唯一信号。
    return { accessToken: token, expiresAt: Number.POSITIVE_INFINITY };
  }

  decorateRequest(base: RequestDecoration, token: TokenState): RequestDecoration {
    return {
      ...base,
      headers: {
        ...base.headers,
        Authorization: `Bearer ${token.accessToken}`,
        "content-type": "application/json",
        "anthropic-version": MINIMAX_ANTHROPIC_VERSION,
      },
    };
  }

  /**
   * 错误归类。
   *
   * ⚠️ 401/403 必须落 `auth`:面板据此提示「重新授权」,而不是当普通上游故障
   * 反复重试同一把废令牌。429 落 `rate_limit` 并尽量带出 `Retry-After`。
   */
  classifyError(
    httpStatus: number,
    body: unknown,
    headers?: Record<string, string | string[] | undefined> | null,
  ): UpstreamError {
    const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
    const detail = text.length > 300 ? `${text.slice(0, 300)}…` : text;
    const retryAfter = retryAfterOf(body, headers);

    if (httpStatus === 401 || httpStatus === 403) {
      return new UpstreamError(
        "auth",
        `[minimax] 鉴权失败(HTTP ${httpStatus}):access token 可能已过期,需重新设备码授权${detail ? ` — ${detail}` : ""}`,
        false,
        httpStatus,
      );
    }
    if (httpStatus === 429) {
      return new UpstreamError(
        "rate_limit",
        "[minimax] 上游限流(HTTP 429)",
        true,
        429,
        retryAfter,
      );
    }
    if (httpStatus >= 500) {
      return new UpstreamError("upstream", `[minimax] 上游错误(HTTP ${httpStatus})`, true, httpStatus, retryAfter);
    }
    if (httpStatus >= 400) {
      return new UpstreamError(
        "bad_request",
        `[minimax] 请求被拒(HTTP ${httpStatus})${detail ? ` — ${detail}` : ""}`,
        false,
        httpStatus,
      );
    }
    return new UpstreamError("upstream", `[minimax] 意外的 HTTP ${httpStatus}`, true, httpStatus);
  }
}

/** 从错误体 / 响应头读「多久后重试」(秒);读不出 → `undefined`。 */
function retryAfterOf(
  body: unknown,
  headers?: Record<string, string | string[] | undefined> | null,
): number | undefined {
  if (body !== null && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const key of ["retry_after", "retryAfter", "retry-after"]) {
      const v = b[key];
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
    }
  }
  if (headers === null || headers === undefined) return undefined;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== "retry-after") continue;
    const raw = Array.isArray(v) ? v[0] : v;
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const secs = Number(raw);
    if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs);
    const at = Date.parse(raw);
    if (Number.isFinite(at)) {
      const delta = Math.ceil((at - Date.now()) / 1000);
      if (delta >= 0) return delta;
    }
  }
  return undefined;
}
