/**
 * 认证连接器契约 —— 框架无关的 TS 模块。
 *
 * 设计目标：把 Nexus 各家上游的认证流（取 token / 刷新 / 请求装饰 / 错误分类）
 * 逐条复刻为独立模块，不依赖 fastapi / dsh / electron。
 *
 * 所有连接器实现 {@link AuthConnector} 接口，由 {@link ./index.ts} 注册表按 vendor id 查找。
 */

// 上游原件类型与上限只在网关层定义一处;连接器层只是把它挂到错误对象上
// (type-only + 一个常量,gateway/types.ts 本身零运行时依赖,不成环)。
import { RAW_BODY_MAX, type UpstreamRawResponse } from "../gateway/types.js";

export type { UpstreamRawResponse };

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

/**
 * 上游错误分类 —— 与 Nexus `UpstreamErrorKind` 对齐。
 *
 * 关键语义：
 * - `rate_limit`：429 或流内 code=429 —— **可重试**（换号 / 退避）
 * - `auth`：401 / 403 —— **不可重试**（换号无用）
 * - `auth_challenge`：需要人工介入（如验证码）—— **不可重试**
 * - `upstream`：5xx —— **可重试**
 * - `bad_request`：4xx —— **不可重试**
 * - `timeout`：超时 —— **可重试**
 * - `connection`：连接失败 —— **可重试**
 */
export type UpstreamErrorKind =
  | "rate_limit"
  | "auth"
  | "auth_challenge"
  | "upstream"
  | "bad_request"
  | "timeout"
  | "connection"
  | "pool_saturated"
  | "pool_exhausted";

/**
 * 上游错误 —— 携带分类、可重试性、HTTP 状态码与 Retry-After。
 *
 * 与 Nexus `UpstreamError` 对齐：kind 决定 http_status 与 retryable 的默认派生，
 * 子类可覆写。
 */
export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly retryable: boolean;
  readonly httpStatus: number;
  readonly retryAfter?: number;
  /**
   * 上游响应的**原件**(有上游答复时才带)。
   *
   * 连接器把上游原文改写进了 `message`(「认证失败 — 上游:…」),那对日志有用、
   * 对客户端是误导。带上原件后,网关出口(`upstreamErrorToHttp`)可以逐字写回
   * 上游的状态码与响应体,分类结果只用于内部的换档/冷却 —— 用户 m36329
   * 「只要上游有返回值,就返回上游返回的原始内容,不做修改」。
   *
   * 自造错误(缺凭据、池耗尽、客户端断开)没有原件,保持 undefined。
   */
  readonly raw?: UpstreamRawResponse;

  constructor(
    kind: UpstreamErrorKind,
    message: string,
    retryable: boolean,
    httpStatus: number,
    retryAfter?: number,
    raw?: UpstreamRawResponse,
  ) {
    super(message);
    this.name = "UpstreamError";
    this.kind = kind;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
    if (raw !== undefined) this.raw = raw;
  }
}

/**
 * 上游响应体 → {@link UpstreamRawResponse}(逐字透传用的原件)。
 *
 * 连接器拿到的是**已经读过一次的 body**(调用方常把 `res.text()` 的结果传进来),
 * 所以这里不再区分 text/Response:字符串就是原文,对象则序列化。
 * 超长按 {@link RAW_BODY_MAX} 截断 —— 真实错误体是几百字节量级。
 */
export function upstreamRawResponse(status: number, body: unknown): UpstreamRawResponse {
  let text: string;
  let json: unknown;
  if (typeof body === "string") {
    text = body;
    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        json = JSON.parse(trimmed);
      } catch {
        /* 保持原文,不挂 json */
      }
    }
  } else {
    json = body ?? undefined;
    try {
      text = JSON.stringify(body ?? null);
    } catch {
      text = String(body);
    }
  }
  const raw: UpstreamRawResponse = {
    text: text.length > RAW_BODY_MAX ? text.slice(0, RAW_BODY_MAX) : text,
    status,
  };
  if (json !== undefined) raw.json = json;
  return raw;
}

// ---------------------------------------------------------------------------
// Token 状态
// ---------------------------------------------------------------------------

/**
 * Token 状态 —— 认证连接器的输出。
 *
 * `expiresAt` 使用 **Unix 秒**（非毫秒），与 Nexus `parse_ms` 统一后的单位一致。
 * 连接器内部若遇到毫秒值（如 trae 的 `TokenExpireAt`），必须转换为秒。
 */
export interface TokenState {
  /** 访问 token（已就绪，可直接用于请求装饰） */
  accessToken: string;
  /** 过期时间（Unix 秒） */
  expiresAt: number;
  /** 刷新 token（可选） */
  refreshToken?: string;
}

// ---------------------------------------------------------------------------
// 凭据
// ---------------------------------------------------------------------------

/**
 * 连接器凭据 —— 各 vendor 的私有字段通过索引签名传入。
 *
 * 常见字段：
 * - `apiKey`：API key / 访问 token
 * - `refreshToken`：刷新 token
 * - `username` / `password`：账号密码（如 sensenova）
 * - `region`：区域（如 trae 的 cn/ai、workbuddy 的 cn/global）
 * - `base_url`：显式覆盖上游地址
 */
export interface ConnectorCredentials {
  apiKey?: string;
  refreshToken?: string;
  username?: string;
  password?: string;
  region?: string;
  base_url?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 请求装饰
// ---------------------------------------------------------------------------

/**
 * 请求装饰 —— 连接器注入到出站请求的 header / query。
 *
 * 与 Nexus 的 `build_headers` / `build_upstream_body` 对应，但只负责
 * **认证与身份相关**的 header，不碰请求体。
 */
export interface RequestDecoration {
  headers: Record<string, string>;
  query?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// 连接器契约
// ---------------------------------------------------------------------------

/**
 * 认证连接器契约 —— 所有上游认证流必须实现的接口。
 *
 * 职责：
 * 1. **取 token / 刷新**：从凭据获取访问 token，必要时自动刷新。
 * 2. **请求装饰**：将 token 与身份信息注入到出站请求的 header / query。
 * 3. **错误分类**：将上游返回的 HTTP 状态码 + 响应体分类为 {@link UpstreamError}。
 */
export interface AuthConnector {
  /** vendor id（如 "trae" / "workbuddy" / "sensenova" / "openai_compat"） */
  readonly vendorId: string;

  /**
   * 获取 / 刷新 token。
   *
   * 实现必须处理：
   * - 凭据中已有可用 token → 直接返回
   * - token 过期 → 用 refreshToken 刷新
   * - 无 refreshToken → 抛 {@link UpstreamError}（kind="auth"）
   *
   * @param creds 连接器凭据
   * @returns 就绪的 token 状态
   */
  getToken(creds: ConnectorCredentials): Promise<TokenState>;

  /**
   * 装饰请求 —— 将 token 与身份信息注入到出站请求。
   *
   * 实现必须：
   * - 注入认证 header（如 `Authorization: Bearer <token>`）
   * - 注入身份 header（如 trae 的 `x-machine-id`、workbuddy 的 `X-IDE-Name`）
   * - 不修改传入的 base 对象，返回新对象
   *
   * @param base 基础请求装饰（可能已有其他 header）
   * @param token 就绪的 token 状态
   * @param creds 凭据（可选）—— 身份覆盖（region/uid/domain/enterprise_id/
   *   machine_id/device_id/api_base 等）只从凭据 raw 取,不读 provider 表
   * @returns 完整的请求装饰
   */
  decorateRequest(
    base: RequestDecoration,
    token: TokenState,
    creds?: ConnectorCredentials,
  ): RequestDecoration;

  /**
   * 错误分类 —— 将上游返回的 HTTP 状态码 + 响应体分类为 {@link UpstreamError}。
   *
   * 实现必须处理：
   * - HTTP 200 + 非零 code = 拒绝（如 sensenova 的 429 body）
   * - HTTP 429 + 特定 code = 账号级 / 池级限流（如 sensenova 的 code=8 vs code=429003）
   * - HTTP 401 / 403 = 认证失败
   * - HTTP 5xx = 上游错误
   *
   * @param httpStatus HTTP 状态码
   * @param body 响应体（已解析的 JSON 或原始文本）
   * @param headers 响应头（可选）—— 供实现读 `Retry-After`；不传就只从 body 读
   * @returns 分类后的上游错误
   */
  classifyError(
    httpStatus: number,
    body: unknown,
    headers?: Record<string, string | string[] | undefined> | null,
  ): UpstreamError;
}
