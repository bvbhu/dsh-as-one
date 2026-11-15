/**
 * 华为云 CodeArts（码道）连接器 —— 认证 / 身份头 / 错误分类（纯函数，零网络）。
 *
 * 协议事实（置信度与出处见 `docs/third-party-sources.md` §2.3 与参考实现的
 * `docs/UPSTREAM.md`）：
 *
 * - **两条互不相通的族**。本文件只服务 **B 族（IDE/CLI）**：
 *   `https://snap-access.cn-north-4.myhuaweicloud.com`，鉴权是
 *   OAuth2 PKCE + DPoP → STS 临时 AK/SK → 每请求 `SDK-HMAC-SHA256` 签名。
 *   A 族（网页 Cookie + `cftk`）只能签到/积分，见 `codearts-signin.ts`。
 * - 签名在 {@link ./codearts-sign.ts}；这里只管**身份头**与**错误语义**。
 * - ⚠️ 上游用 **HTTP 200 + `error_code`** 表达业务失败，真实状态码编码在
 *   `error_code` 里（纯数字 / 复合码 `服务.业务号.状态码`）。**HTTP 状态码本身
 *   不可信**，所以 {@link statusFromCode} 必须被网关用来定案，否则会把「参数越界」
 *   当成账号故障、把健康号熔断。
 */

import {
  UpstreamError,
  upstreamRawResponse,
  type ConnectorCredentials,
  type UpstreamErrorKind,
  type RequestDecoration,
  type TokenState,
} from "./types.js";

/* ------------------------------------------------------------------ *
 * 端点
 * ------------------------------------------------------------------ */

/** B 族服务域（国际/国内同域；备用 `.cn` 由 base_url 覆盖时自行替换）。 */
export const CODEARTS_BASE_CN = "https://snap-access.cn-north-4.myhuaweicloud.com";
/** 推理（OpenAI 兼容 Chat Completions）。 */
export const CODEARTS_CHAT_PATH = "/api/v2/chat/completions";
/** 可用模型清单（需 `Agent-Type: PromptCenter`）。 */
export const CODEARTS_MODELS_PATH = "/v1/model/builtin";
/** 运营活动（签到就在这里面，`type == "USER_LOGIN"`）。 */
export const CODEARTS_DELIVERY_PATH = "/v1/ops/delivery";
export const CODEARTS_CLAIM_PATH = "/v1/ops/claim";
export const CODEARTS_CONFIRM_PATH = "/v1/ops/confirm";
/** 积分套餐与用量（路径前缀必须带 `snap-manager`）。 */
export const CODEARTS_CREDITS_PATH = "/snap-manager/v1/statistics/plugin";
/** STS 令牌签发 / 刷新。 */
export const CODEARTS_STS_BASE = "https://sts.cn-north-4.myhuaweicloud.com";
export const CODEARTS_STS_TOKENS_PATH = "/v1/oauth2/tokens";
/** OAuth 客户端标识（= 官方 `product.json` 的 `urlProtocol`）。 */
export const CODEARTS_CLIENT_ID = "codearts-agent";

/** 请求超时：推理走流式，签发/刷新要快。 */
export const CODEARTS_TIMEOUT_MS = 120_000;
export const CODEARTS_STS_TIMEOUT_MS = 20_000;

/* ------------------------------------------------------------------ *
 * 身份头（上游据此路由 / 埋点 / 限流）
 * ------------------------------------------------------------------ */

/** 与 CodeArts Agent 26.9.902 对齐的缺省身份头。 */
export const CODEARTS_IDENTITY = {
  pluginName: "codemate_vscode",
  pluginVersion: "26.9.902",
  ideName: "VSCode",
  ideVersion: "26.9.902",
  appId: "CodeAgent3.0",
  language: "zh-cn",
  clientType: "IDE",
  functionName: "agent-general",
} as const;

/** 32 位 hex 的随机串（trace / msg id 用）。 */
function hexOf(bytes: number): string {
  const buf = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i += 1) buf[i] = Math.floor(Math.random() * 256);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 上游会话 id：`ses_<hash>`，**必须按凭据派生并复用**。
 *
 * 为什么不能每请求随机：上游按 `x-ot-session-id` 统计并发会话，**每账号上限 3**，
 * 随机值等于「每次请求都是一条新会话」，很快撞 `TM.00001041`。AK 轮换后自然换新。
 */
export function codeartsSessionId(accessKey: string, domainId?: string): string {
  const seed = `${domainId ?? ""}|${accessKey}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `ses_${h.toString(16).padStart(8, "0")}${accessKey.slice(-4).toLowerCase()}`;
}

export interface CodeartsHeadersInput {
  accessKey: string;
  /** 请求体里的模型名（`model-id` / `model-name` 必须与它**逐字一致**）。 */
  model?: string;
  domainId?: string;
  /** 注入时钟（`created-time`）。 */
  now?: number;
}

/**
 * identity 头集合。
 *
 * ⚠️ 这些头**不能**进 `SignedHeaders`（进了就 `401 APIG.0301`）。签名只覆盖
 * `host` + `x-sdk-date` (+ `x-security-token`)，见 `codearts-sign.ts`。
 */
export function codeartsIdentityHeaders(input: CodeartsHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "plugin-name": CODEARTS_IDENTITY.pluginName,
    "plugin-version": CODEARTS_IDENTITY.pluginVersion,
    "ide-name": CODEARTS_IDENTITY.ideName,
    "ide-version": CODEARTS_IDENTITY.ideVersion,
    "app-id": CODEARTS_IDENTITY.appId,
    "X-Language": CODEARTS_IDENTITY.language,
    "X-Requested-With": "XMLHttpRequest",
    "x-ot-client-type": CODEARTS_IDENTITY.clientType,
    "x-ot-function": CODEARTS_IDENTITY.functionName,
    "x-ot-session-id": codeartsSessionId(input.accessKey, input.domainId),
    "user-session-id": codeartsSessionId(input.accessKey, input.domainId),
    "x-ot-trace-id": hexOf(16),
    "x-ot-span-id": hexOf(8),
    "x-snap-traceid": hexOf(16),
    "user-msg-id": `msg_${hexOf(8)}`,
    "created-time": new Date(input.now ?? Date.now()).toISOString(),
  };
  // ⚠️ 模型名必须与 body.model 逐字一致（尾随空格都报 406），这里不做任何 trim。
  if (input.model !== undefined && input.model !== "") {
    headers["model-id"] = input.model;
    headers["model-name"] = input.model;
  }
  return headers;
}

/* ------------------------------------------------------------------ *
 * 错误语义
 * ------------------------------------------------------------------ */

/** 凭据类错误码：即使以 HTTP 400 返回，也必须计入**账号故障**（不能当客户端错误）。 */
export const CODEARTS_CREDENTIAL_CODES = [
  "APIG.0301",
  "APIG.0303",
  "STS5.1804",
  "STS5.1806",
  "invalid_grant",
] as const;

/** 临时故障码（可重试，**不计账号故障**）。 */
export const CODEARTS_TRANSIENT_CODES = ["TM.00001041"] as const;

/**
 * `error_code` → 真实 HTTP 状态码。
 *
 * 三种形态（实测）：纯数字业务码（`4005`）不在 400–599 → 兜底 400；
 * 纯数字状态码（`400` / `422`）直接用；复合码 `服务.业务号.状态码`（`InferHub.002002009.404`）
 * 取**末段**。**取不到一律兜底 400，绝不返回 200** —— 历史上就是因为固定写 200，
 * 参数错误被当成账号故障、健康号被熔断。
 */
export function statusFromCode(code: string | number | null | undefined): number {
  if (code === null || code === undefined) return 400;
  const segs = String(code).trim().split(".");
  const tail = segs[segs.length - 1] ?? "";
  const n = Number(tail);
  if (Number.isInteger(n) && n >= 400 && n <= 599) return n;
  return 400;
}

/** 从响应体里抽 `error_code` / `error_msg`；没有错误返回 null。 */
export function codeartsErrorOf(
  body: unknown,
): { code: string; message: string; status: number } | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const rec = body as Record<string, unknown>;
  const rawCode = rec["error_code"] ?? rec["errorCode"] ?? rec["code"];
  if (rawCode === undefined || rawCode === null) {
    // 有些接口用 `{code: 0}` 表成功；非 0 才是错误。
    if (typeof rec["code"] === "number" && rec["code"] !== 0) {
      const code = String(rec["code"]);
      return {
        code,
        message: String(rec["error_msg"] ?? rec["message"] ?? rec["msg"] ?? "上游业务错误"),
        status: statusFromCode(code),
      };
    }
    return null;
  }
  const code = String(rawCode);
  if (code === "0" || code === "") return null;
  const details = rec["details"];
  const detailMsg =
    Array.isArray(details) && details.length > 0 && typeof details[0] === "object"
      ? String((details[0] as Record<string, unknown>)["error_msg"] ?? "")
      : "";
  const message = String(
    detailMsg || rec["error_msg"] || rec["errorMsg"] || rec["message"] || rec["msg"] || "上游业务错误",
  );
  return { code, message, status: statusFromCode(code) };
}

/** 错误码 → 网关错误分类（决定「换号 / 退避 / 直接回客户端」）。 */
export function codeartsErrorKind(code: string, status: number): UpstreamErrorKind {
  const c = String(code);
  if ((CODEARTS_CREDENTIAL_CODES as readonly string[]).includes(c)) return "auth";
  if ((CODEARTS_TRANSIENT_CODES as readonly string[]).includes(c)) return "rate_limit";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream";
  if (status === 401 || status === 403) return "auth";
  return "bad_request";
}

/** 客户端错误（不换号、不计账号故障）：参数越界 / 模型名不一致 / 模型不存在 / 通道不支持。 */
export function isCodeartsClientRequestError(code: string, status: number): boolean {
  const c = String(code);
  if ((CODEARTS_CREDENTIAL_CODES as readonly string[]).includes(c)) return false;
  if ((CODEARTS_TRANSIENT_CODES as readonly string[]).includes(c)) return false;
  return status === 400 || status === 404 || status === 406 || status === 413 || status === 422;
}

/* ------------------------------------------------------------------ *
 * 凭据
 * ------------------------------------------------------------------ */

/** CodeArts 凭据（存库的字段名与登录返回同形）。 */
export interface CodeartsCredentials extends ConnectorCredentials {
  accessKey?: string;
  secretKey?: string;
  /** STS 临时令牌；有它就要签名并随请求发送。 */
  securityToken?: string;
  /** 过期时间（Unix 毫秒）。 */
  expiresAtMs?: number;
  /** 登录域标识（`domain_tag`），只用于派生会话 id。 */
  domainId?: string;
  /** 刷新令牌（一次性轮转，续期要单独实现，缺省不自动刷）。 */
  refreshToken?: string;
}

/** 从凭据里取 AK/SK；缺任一个就是确定性凭据错误（不发请求）。 */
export function requireCodeartsKeys(creds: ConnectorCredentials | undefined): {
  accessKey: string;
  secretKey: string;
} {
  const c = (creds ?? {}) as CodeartsCredentials;
  const accessKey = typeof c.accessKey === "string" ? c.accessKey.trim() : "";
  const secretKey = typeof c.secretKey === "string" ? c.secretKey.trim() : "";
  if (accessKey === "" || secretKey === "") {
    // ⚠️ 构造签名是 (kind, message, retryable, httpStatus, retryAfter?, raw?)
    // —— kind 是**字符串字面量**，连接器层没有 kind 枚举值。
    throw new UpstreamError(
      "auth",
      "CodeArts 凭据不完整：需要 accessKey + secretKey（请重新登录 CodeArts）",
      false,
      401,
    );
  }
  return { accessKey, secretKey };
}

/* ------------------------------------------------------------------ *
 * 连接器
 * ------------------------------------------------------------------ */

/**
 * CodeArts 连接器。
 *
 * ⚠️ 与 trae/workbuddy 的差别：**`decorateRequest` 只返回未签名的 identity 头**。
 * 签名依赖请求体与 URL，只能在实际发送前由网关调用 `signCodeartsRequest` 生成
 * （与 qoder 同一套路：连接器不在这里签名）。
 */
export class CodeartsAdapter {
  readonly vendorId = "codearts";

  async getToken(creds: ConnectorCredentials): Promise<TokenState> {
    const c = (creds ?? {}) as CodeartsCredentials;
    const { accessKey } = requireCodeartsKeys(c);
    const expiresAt =
      typeof c.expiresAtMs === "number" && Number.isFinite(c.expiresAtMs)
        ? Math.floor(c.expiresAtMs / 1000)
        : Math.floor(Date.now() / 1000) + 2 * 60 * 60;
    return {
      accessToken: accessKey,
      expiresAt,
      ...(typeof c.refreshToken === "string" && c.refreshToken !== ""
        ? { refreshToken: c.refreshToken }
        : {}),
    };
  }

  decorateRequest(
    base: RequestDecoration,
    _token: TokenState,
    creds?: ConnectorCredentials,
  ): RequestDecoration {
    const c = (creds ?? {}) as CodeartsCredentials;
    const { accessKey } = requireCodeartsKeys(c);
    const headers = codeartsIdentityHeaders({
      accessKey,
      ...(typeof c.domainId === "string" ? { domainId: c.domainId } : {}),
    });
    return { headers: { ...headers, ...base.headers } };
  }

  /**
   * 错误分类。
   *
   * 上游用 `200 + error_code` 表达失败，所以**先看业务码、再看 HTTP 状态**：
   * 只看状态码会把「参数越界」当账号故障、把「并发上限」当封号。
   */
  classifyError(
    httpStatus: number,
    body: unknown,
    _headers?: Record<string, string | string[] | undefined> | null,
  ): UpstreamError {
    const biz = codeartsErrorOf(body);
    const code = biz?.code ?? "";
    const status = biz ? biz.status : httpStatus;
    const raw = upstreamRawResponse(httpStatus, body);

    if (biz) {
      const kind = codeartsErrorKind(code, status);
      const retryable = kind === "rate_limit" || kind === "upstream" || kind === "timeout";
      return new UpstreamError(kind, `CodeArts 上游错误 ${code}: ${biz.message}`, retryable, status, undefined, raw);
    }
    if (httpStatus >= 200 && httpStatus < 300) {
      // 2xx 且没有业务错误码:调用方不该走到这里(正常响应直接消费)。
      return new UpstreamError("upstream", "CodeArts 上游返回成功", false, httpStatus, undefined, raw);
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return new UpstreamError(
        "auth",
        "CodeArts 登录态失效，请重新登录 CodeArts",
        false,
        httpStatus,
        undefined,
        raw,
      );
    }
    if (httpStatus === 429) {
      return new UpstreamError("rate_limit", "CodeArts 上游限流", true, httpStatus, undefined, raw);
    }
    if (httpStatus >= 500) {
      return new UpstreamError("upstream", `CodeArts 上游 ${httpStatus}`, true, httpStatus, undefined, raw);
    }
    return new UpstreamError(
      "bad_request",
      `CodeArts 请求被拒（HTTP ${httpStatus}）`,
      false,
      httpStatus,
      undefined,
      raw,
    );
  }
}

export const CODEARTS_ADAPTER = new CodeartsAdapter();
