/**
 * Trae 连接器 —— Cloud-IDE-JWT 认证 + storage.json AES-128-CBC 解密。
 *
 * 协议要点（来自 Nexus `trae.py` / `refresh.py`）：
 *
 * ## 认证
 * - 头：`Authorization: Cloud-IDE-JWT <token>`（**非 Bearer**）
 * - 身份头：`x-app-id: 6eefa01c-1036-4c7e-9ca5-d891f63bfcd8`
 * - 身份派生：machine_id = sha256("trae-machine\0" + api_key)
 *              device_id = sha256("trae-device\0" + api_key)[:32]
 * - 版本头：`x-ide-version: 0.1.50`, `x-ide-version-code: 20260811`（必须纯数字）
 *
 * ## 区域
 * - cn → `https://trae-api-cn.mchost.guru`
 * - ai → `https://coresg-normal.trae.ai`
 *
 * ## 端点
 * - `/api/agent/v3/llm_utils_chat`, 恒走 SSE
 *
 * ## AES 解密（storage.json）
 * - 存储键：`iCubeAuthInfo://icube.cloudide`
 * - 结构：`header(6) || random(32) || AES-CBC ciphertext`
 * - header `74 63 05 10 00 00` → salt = SALT_A ⊕ SALT_B
 * - header `12 29 20 20 02 03` → salt = SALT_C ⊕ SALT_D
 * - derived = sha512(sha512(random) + salt); key = derived[:16], IV = derived[16:32]
 * - PKCS7 去填充，前 64 字节 = sha512(plaintext) 校验
 *
 * ## 刷新
 * - cn: POST `{base}/cloudide/api/v3/trae/oauth/ExchangeToken`, ClientID=ono9krqynydwx5
 * - solo(ai): POST `{base}/trae/api/v3/oauth/ExchangeToken`, ClientID=en1oxy7wnw8j9n
 *   + DeviceInfo + DeviceProof(ECDSA-P256/SHA-256 签名)
 * - 请求体: ClientID, ClientSecret(""), RefreshToken, UserID
 * - 应答: Result.Token, Result.TokenExpireAt（毫秒或 ISO 字符串）
 */

import { createCipheriv, createDecipheriv, createHash, createSign, randomBytes } from "node:crypto";
import {
  AuthConnector,
  ConnectorCredentials,
  RequestDecoration,
  TokenState,
  UpstreamError,
  upstreamRawResponse,
} from "./types.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 应用 ID（三仓一致） */
export const APP_ID = "6eefa01c-1036-4c7e-9ca5-d891f63bfcd8";

/**
 * `4017` = **账号临时限制**的流内错误码(2026-11-11，来自当日封号巡检)。
 *
 * 依据 `docs/ban-watch.md` 2026-11-11 条目：上游插件 PR #84 把 SOLO 的
 * `4008`（额度耗尽）映射 402/hard_credit、把 **`4017` 映射 429/soft_rate
 * 交由号池切换**。此前 `4017` 被当成通用 client 错误 → 不换号，
 * 一个被临时限制的账号会把后续请求全吃掉。
 *
 * ⚠️ 与 workbuddy 的 `11140` 不同：4017 是**临时**的，不物理删凭据、不熔断
 * 渠道，只让选路器换个账号继续（`rate_limit + retryable`）。
 *
 * ⚠️ 常量放在本文件而**不是** `checkin.ts`：`checkin.ts` 已经 import 本文件，
 * 反过来 import 会成环。
 */
export const TRAE_CODE_ACCOUNT_RESTRICTED = 4017;

/** 默认 IDE 版本 */
export const DEFAULT_IDE_VERSION = "0.1.50";

/** 默认 IDE 版本码（必须纯数字，点号会被 4001 拒） */
export const DEFAULT_IDE_VERSION_CODE = "20260811";

/** CN 区域默认 API 地址 */
export const DEFAULT_API_BASE_CN = "https://trae-api-cn.mchost.guru";

/** AI 区域默认 API 地址 */
export const DEFAULT_API_BASE_AI = "https://coresg-normal.trae.ai";

/** 区域 → API 地址映射 */
export const REGION_BASES: Record<string, string> = {
  cn: DEFAULT_API_BASE_CN,
  ai: DEFAULT_API_BASE_AI,
};

/** 区域别名 */
const REGION_ALIASES: Record<string, string> = {
  cn: "cn",
  ai: "ai",
  sg: "ai",
  global: "ai",
  intl: "ai",
};

/** 本地存储认证值的存储键 */
export const AUTH_STORAGE_KEY = "iCubeAuthInfo://icube.cloudide";

/** 设备中心键前缀 */
export const DEVICE_CENTER_PREFIX = "iCubeAuthInfo://icube-dc:";

/** 加密头（标准） */
export const HEADER_AES = Buffer.from([0x74, 0x63, 0x05, 0x10, 0x00, 0x00]);

/** 加密头（私有） */
export const HEADER_AES_PRIVATE = Buffer.from([18, 57, 32, 32, 2, 3]);

// ---------------------------------------------------------------------------
// 盐值（来自 Nexus trae.py）
// ---------------------------------------------------------------------------

const SALT_A = Buffer.from([
  82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251,
  124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203,
  84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78,
  8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37,
]);

const SALT_B = Buffer.from([
  31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95,
  96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239,
  160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97,
  23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125,
]);

const SALT_C = Buffer.from([
  191, 192, 216, 250, 122, 246, 220, 97, 31, 254, 98, 27, 8, 72, 71, 176,
  135, 99, 96, 18, 127, 101, 203, 104, 211, 102, 191, 125, 37, 72, 150, 156,
  51, 229, 121, 35, 17, 153, 141, 177, 110, 131, 150, 128, 172, 255, 254,
  6, 18, 140, 55, 62, 236, 249, 135, 64, 135, 12, 117, 4, 89, 149, 168, 209,
]);

const SALT_D = Buffer.from([
  246, 204, 26, 232, 232, 70, 129, 109, 223, 146, 169, 242, 23, 241, 105, 145,
  50, 196, 165, 42, 254, 120, 3, 54, 244, 207, 209, 85, 53, 6, 138, 106,
  175, 148, 31, 204, 186, 186, 165, 182, 87, 142, 49, 10, 39, 110, 26, 154,
  86, 56, 173, 125, 18, 64, 198, 225, 99, 99, 83, 82, 191, 134, 76, 170,
]);

// ---------------------------------------------------------------------------
// 区域 / 地址
// ---------------------------------------------------------------------------

/**
 * 区域归一：`cn` / `ai`（国际）。未知与空值回退 CN。
 */
export function normalize_region(region?: string): string {
  const key = (region ?? "").trim().toLowerCase();
  return REGION_ALIASES[key] ?? "cn";
}

/**
 * 端点地址：显式 `base_url` > `extra["api_base"]` > 区域默认。
 */
export function resolve_api_base(
  base_url?: string,
  region?: string,
  extra?: Record<string, unknown>,
): string {
  if (base_url && base_url.trim()) {
    return base_url.trim().replace(/\/+$/, "");
  }
  const extraBase = extra?.["api_base"];
  if (typeof extraBase === "string" && extraBase.trim()) {
    return extraBase.trim().replace(/\/+$/, "");
  }
  return REGION_BASES[normalize_region(region)];
}

// ---------------------------------------------------------------------------
// 身份派生
// ---------------------------------------------------------------------------

/**
 * 从 api_key 确定性派生 machine_id / device_id。
 *
 * 与 Nexus `resolve_identity` 对齐：
 * - machine_id = sha256("trae-machine\0" + api_key)
 * - device_id = sha256("trae-device\0" + api_key)[:32]
 * - user_id = extra.user_id(计费/签到接口的 x-uid 需要真实 user_id,
 *   否则 401 code 1001「not able to authenticate you」)
 */
export function resolve_identity(
  api_key: string,
  extra?: Record<string, unknown>,
): { machine_id: string; device_id: string; user_id: string } {
  const machine_id =
    (extra?.["machine_id"] as string | undefined) ??
    createHash("sha256").update(`trae-machine\0${api_key}`).digest("hex");
  const device_id =
    (extra?.["device_id"] as string | undefined) ??
    createHash("sha256").update(`trae-device\0${api_key}`).digest("hex").slice(0, 32);
  const user_id =
    (extra?.["user_id"] as string | undefined) ??
    (extra?.["uid"] as string | undefined) ??
    "";
  return { machine_id, device_id, user_id };
}

// ---------------------------------------------------------------------------
// 请求头
// ---------------------------------------------------------------------------

/**
 * 构建出站请求头。
 *
 * 与 Nexus `build_headers` 对齐。
 */
export function build_headers(
  api_key: string,
  identity: { machine_id: string; device_id: string; user_id?: string },
  request_id?: string,
): Record<string, string> {
  const rid = request_id ?? randomBytes(16).toString("hex");
  const trace_id = rid.replace("-", "").slice(0, 32);
  return {
    Authorization: `Cloud-IDE-JWT ${api_key}`,
    "X-Cloudide-Token": api_key,
    "X-Ide-Token": api_key,
    // x-uid 必须是真实 user_id(计费/签到接口校验;发整串 JWT 会 401)
    "x-uid": identity.user_id ?? "",
    "x-app-id": APP_ID,
    "x-machine-id": identity.machine_id,
    "x-device-id": identity.device_id,
    "x-device-type": "windows",
    "x-os-version": "Windows 10",
    "x-app-version": DEFAULT_IDE_VERSION,
    "x-ide-version": DEFAULT_IDE_VERSION,
    "x-app-version-code": DEFAULT_IDE_VERSION_CODE,
    "x-ide-version-code": DEFAULT_IDE_VERSION_CODE,
    "x-ide-version-type": "stable",
    "request-traffic-type": "prod",
    "package-type": "stable_cn",
    "x-custom-trace-id": trace_id,
    "x-flow-traceparent": `04-${trace_id}-${trace_id.slice(0, 16)}-01`,
    "x-request-id": rid,
    "x-trae-request-id": rid,
    "User-Agent": `Trae/${DEFAULT_IDE_VERSION}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
}

// ---------------------------------------------------------------------------
// AES 解密
// ---------------------------------------------------------------------------

/**
 * 解密 storage.json 中的认证值（AES-128-CBC）。
 *
 * 与 Nexus `decrypt_storage_value` 对齐。
 *
 * @param encoded base64 编码的密文
 * @returns 解密后的明文字符串
 * @throws {UpstreamError} 密文过短、未知加密头、完整性校验失败
 */
export function decrypt_storage_value(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  if (raw.length <= 102) {
    throw new UpstreamError(
      "bad_request",
      "AES 解密: 密文过短",
      false,
      400,
    );
  }

  const header = raw.subarray(0, 6);
  let salt: Buffer;
  if (header.equals(HEADER_AES)) {
    salt = xorBuffers(SALT_A, SALT_B);
  } else if (header.equals(HEADER_AES_PRIVATE)) {
    salt = xorBuffers(SALT_C, SALT_D);
  } else {
    throw new UpstreamError(
      "bad_request",
      "AES 解密: 未知加密头",
      false,
      400,
    );
  }

  const random = raw.subarray(6, 38);
  const ciphertext = raw.subarray(38);

  const derived = createHash("sha512")
    .update(Buffer.concat([createHash("sha512").update(random).digest(), salt]))
    .digest();
  const key = derived.subarray(0, 16);
  const iv = derived.subarray(16, 32);

  // 关闭自动填充，手动处理 PKCS7（与 Nexus 对齐）
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  let padded: Buffer;
  try {
    padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new UpstreamError(
      "bad_request",
      `AES 解密: ${err instanceof Error ? err.message : "解密失败"}`,
      false,
      400,
    );
  }

  // PKCS7 去填充
  const padLen = padded[padded.length - 1];
  if (padLen < 1 || padLen > 16 || padLen > padded.length) {
    throw new UpstreamError(
      "bad_request",
      "AES 解密: 无效的 PKCS7 填充",
      false,
      400,
    );
  }
  const plaintext = padded.subarray(0, padded.length - padLen);

  // 完整性校验：前 64 字节 = sha512(正文)
  if (plaintext.length < 64) {
    throw new UpstreamError(
      "bad_request",
      "AES 解密: 明文过短",
      false,
      400,
    );
  }
  const expectedHash = plaintext.subarray(0, 64);
  const body = plaintext.subarray(64);
  const actualHash = createHash("sha512").update(body).digest();
  if (!expectedHash.equals(actualHash)) {
    throw new UpstreamError(
      "bad_request",
      "AES 解密: 完整性校验失败",
      false,
      400,
    );
  }

  return body.toString("utf-8");
}

/**
 * XOR 两个 buffer（较短的补零）。
 */
function xorBuffers(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] ^ (b[i] ?? 0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 刷新
// ---------------------------------------------------------------------------

/**
 * Trae 刷新契约。
 */
export interface TraeRefreshContract {
  /** 刷新端点路径 */
  path: string;
  /** ClientID */
  clientId: string;
  /** 是否需要 DeviceProof */
  needsDeviceProof: boolean;
}

/**
 * 根据区域获取刷新契约。
 */
export function trae_refresh_contract(region: string): TraeRefreshContract {
  const r = normalize_region(region);
  if (r === "ai") {
    return {
      path: "/trae/api/v3/oauth/ExchangeToken",
      clientId: "en1oxy7wnw8j9n",
      needsDeviceProof: true,
    };
  }
  return {
    path: "/cloudide/api/v3/trae/oauth/ExchangeToken",
    clientId: "ono9krqynydwx5",
    needsDeviceProof: false,
  };
}

/**
 * 构建刷新请求体。
 */
export function build_refresh_body(
  contract: TraeRefreshContract,
  refresh_token: string,
  user_id: string,
  identity?: { machine_id: string; device_id: string },
  private_key_pem?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ClientID: contract.clientId,
    ClientSecret: "",
    RefreshToken: refresh_token,
    UserID: user_id,
  };
  if (contract.needsDeviceProof && identity) {
    body["DeviceInfo"] = {
      machine_id: identity.machine_id,
      device_id: identity.device_id,
      os_version: "Windows 10",
      app_version: DEFAULT_IDE_VERSION,
    };
    if (private_key_pem) {
      body["DeviceProof"] = device_proof(private_key_pem, identity);
    }
  }
  return body;
}

/**
 * 生成 DeviceProof（ECDSA-P256/SHA-256 签名后 base64）。
 *
 * 与 Nexus `_device_proof` 对齐。
 */
export function device_proof(
  private_key_pem: string,
  identity: { machine_id: string; device_id: string },
): { Signature: string } {
  const message = `${identity.machine_id}:${identity.device_id}:${Date.now()}`;
  const sign = createSign("SHA256");
  sign.update(message);
  const signature = sign.sign(private_key_pem, "base64");
  return { Signature: signature };
}

/**
 * 解析刷新应答。
 */
export function parse_refresh_response(body: unknown): TokenState {
  if (!body || typeof body !== "object") {
    throw new UpstreamError("bad_request", "刷新应答格式错误", false, 400);
  }
  const result = (body as Record<string, unknown>)["Result"] as Record<string, unknown> | undefined;
  if (!result) {
    throw new UpstreamError("bad_request", "刷新应答缺少 Result", false, 400);
  }
  const token = result["Token"] as string | undefined;
  if (!token) {
    throw new UpstreamError("bad_request", "刷新应答缺少 Token", false, 400);
  }
  const expiresAt = parse_expiry(result["TokenExpireAt"]);
  const refreshToken = result["RefreshToken"] as string | undefined;
  return {
    accessToken: token,
    expiresAt,
    refreshToken,
  };
}

/**
 * 解析过期时间（毫秒或 ISO 字符串）→ Unix 秒。
 *
 * 与 Nexus `parse_ms` 对齐。
 */
export function parse_expiry(value: unknown): number {
  if (typeof value === "number") {
    // 毫秒 vs 秒
    if (value >= 1e11) return Math.floor(value / 1000);
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const num = Number(value);
    if (Number.isFinite(num)) {
      if (num >= 1e11) return Math.floor(num / 1000);
      return Math.floor(num);
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return Math.floor(date.getTime() / 1000);
    }
  }
  return Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

/**
 * Trae 流内错误分类（HTTP 永远 200）。
 *
 * 与 Nexus `classify_solo_error` 对齐。
 *
 * ⚠️ **`4017` 是「账号临时限制」**(2026-11-11,来自 `docs/ban-watch.md` 当日巡检:
 * 上游插件 PR #84 把 SOLO `4008` 映射 402/hard_credit、把 **`4017` 映射
 * 429/soft_rate 交由号池切换**;此前它被误判成 client 错误 → **不换号**,
 * 一个被临时限制的账号会把后续所有请求都吃掉)。
 *
 * 与 workbuddy 的 `11140`(永久封禁)不同:4017 是**临时**的,所以按
 * `rate_limit + retryable` 处理 —— 让选路器换个账号继续,而不是整条链路失败。
 * 也不做物理删凭据:临时限制会自己解除。
 */
export function classify_solo_error(code: number): UpstreamError {
  // 1005 = 套餐额度 → RATE_LIMIT
  if (code === 1005) {
    return new UpstreamError("rate_limit", "套餐额度耗尽", true, 429);
  }
  // 4017 = 账号临时限制 → RATE_LIMIT(可换号)
  if (code === TRAE_CODE_ACCOUNT_RESTRICTED) {
    return new UpstreamError(
      "rate_limit",
      "账号临时限制(上游 4017),已切换到其它账号",
      true,
      429,
    );
  }
  // 4001/4002 = 模型配置 → BAD_REQUEST
  if (code === 4001 || code === 4002) {
    return new UpstreamError("bad_request", "模型配置错误", false, 400);
  }
  // 401/403 = 账号失效 → AUTH
  if (code === 401 || code === 403) {
    return new UpstreamError("auth", "账号已失效", false, 401);
  }
  // 4008/4011/429 = 频控 → RATE_LIMIT
  if (code === 4008 || code === 4011 || code === 429) {
    return new UpstreamError("rate_limit", "请求过于频繁", true, 429);
  }
  // 5xx → UPSTREAM
  if (code >= 500) {
    return new UpstreamError("upstream", "上游错误", true, code);
  }
  return new UpstreamError("bad_request", "请求错误", false, 400);
}

// ---------------------------------------------------------------------------
// Trae 连接器
// ---------------------------------------------------------------------------

/**
 * Trae 连接器 —— 实现 {@link AuthConnector} 契约。
 */
export class TraeAdapter implements AuthConnector {
  readonly vendorId = "trae";

  async getToken(creds: ConnectorCredentials): Promise<TokenState> {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      throw new UpstreamError("auth", "[trae] 缺少 api_key", false, 401);
    }
    // trae 的 api_key 本身就是访问 token
    return {
      accessToken: apiKey,
      expiresAt: Number.POSITIVE_INFINITY,
    };
  }

  decorateRequest(
    base: RequestDecoration,
    token: TokenState,
    creds?: ConnectorCredentials,
  ): RequestDecoration {
    // 身份覆盖(machine_id/device_id)只从凭据 raw 取 —— 不传 creds 时回退
    // 由 api_key 确定性派生(与 Nexus resolve_identity 口径一致)
    const identity = resolve_identity(token.accessToken, creds);
    return {
      ...base,
      headers: {
        ...base.headers,
        ...build_headers(token.accessToken, identity),
      },
    };
  }

  classifyError(httpStatus: number, body: unknown): UpstreamError {
    // ⚠️ 上游原件透传(用户 m36329):客户端该看到上游原文,不是这四字文案。
    const original = upstreamRawResponse(httpStatus, body);
    // trae 的流内错误 HTTP 永远 200，按 code 分类
    if (httpStatus === 200) {
      const code = extract_code(body);
      if (code !== undefined) {
        return classify_solo_error(code);
      }
    }
    if (httpStatus === 429) {
      return new UpstreamError("rate_limit", "上游限流", true, 429, undefined, original);
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return new UpstreamError("auth", "认证失败", false, httpStatus, undefined, original);
    }
    if (httpStatus >= 500) {
      return new UpstreamError("upstream", "上游错误", true, httpStatus, undefined, original);
    }
    if (httpStatus >= 400) {
      return new UpstreamError("bad_request", "请求错误", false, httpStatus, undefined, original);
    }
    return new UpstreamError("upstream", "未知错误", true, httpStatus, undefined, original);
  }
}

/**
 * 从响应体中提取 code 字段。
 */
function extract_code(body: unknown): number | undefined {
  if (body && typeof body === "object") {
    const code = (body as Record<string, unknown>)["code"];
    if (typeof code === "number") return code;
  }
  return undefined;
}
