/**
 * 凭据自动刷新域 —— 从 assembly.ts 拆出(镜像 nexus/refresh.py,只读参照)。
 *
 * 内容:刷新常量(REFRESH_*, TRAE_*, WB_*)、刷新错误类型、凭据刷新实现
 * (trae 按 edition 契约 / workbuddy 带 X-User-Id 头集)。
 *
 * 谁在用:assembly.ts 的 refreshOne(面板 refresh_run)与 refreshStatus 能力位。
 * 契约:只 import,绝不编辑 packages/core 的任何文件。
 */

import { createSign, randomBytes } from "node:crypto";

import { parse_refresh_response as parseTraeRefreshResponse } from "@as-one/core/src/connectors/trae.js";
import { minimaxRefreshToken } from "@as-one/core/src/connectors/minimax-signin.js";
import {
  build_refresh_headers as buildWbRefreshHeaders,
  jwt_claim,
  detect_region_from_token,
  parse_refresh_response as parseWbRefreshResponse,
} from "@as-one/core/src/connectors/workbuddy.js";

// ── 凭据自动刷新:镜像 nexus/refresh.py(只读参照)──────────────────────────

/** 支持凭据自动刷新的渠道(Nexus REFRESH_PROVIDERS + As One 新增 minimax)。 */
const REFRESH_PROVIDERS = ["trae", "workbuddy", "minimax"] as const;
/** 到期判定余量(秒)(Nexus REFRESH_MARGIN_S = 300.0)。 */
export const REFRESH_MARGIN_S = 300;
/** 刷新请求超时(毫秒;Nexus _post_json timeout=20.0)。 */
const REFRESH_TIMEOUT_MS = 20_000;

// trae 刷新端点常量(Nexus refresh.py L72-85)。
const TRAE_DEFAULT_HOST_CN = "https://api.trae.cn";
const TRAE_DEFAULT_HOST_AI = "https://api.trae.ai";
const TRAE_CLOUDIDE_PATH = "/cloudide/api/v3/trae/oauth/ExchangeToken";
const TRAE_SOLO_PATH = "/trae/api/v3/oauth/ExchangeToken";
const TRAE_CN_CLIENT_ID = "ono9krqynydwx5";
const TRAE_SOLO_CLIENT_ID = "en1oxy7wnw8j9n";

// workbuddy 刷新端点常量(Nexus refresh.py L72-85)。
const WB_CN_CHAT_BASE = "https://copilot.tencent.com";
const WB_REFRESH_PATH = "/v2/plugin/auth/token/refresh";
const WB_CLIENT_UA = "CLI/2.63.2 CodeBuddy/2.63.2";
const WB_CN_BILLING_BASE = "https://www.codebuddy.cn";
const WB_GLOBAL_DOMAINS = ["workbuddy.ai", "codebuddy.ai"];

/** 刷新失败(传输 / 上游拒绝 / 契约不匹配)—— 镜像 Nexus RefreshError。 */
class RefreshError extends Error {}

/** 凭据缺失导致的刷新不可用 —— 镜像 Nexus RefreshCredentialError。 */
class RefreshCredentialError extends RefreshError {}

/** 刷新所需的凭据视图(与 core 的 {@link Credential} 结构兼容)。 */
interface RefreshCred {
  provider: string;
  username: string;
  secret: string | null;
  refreshSecret: string | null;
  expiresAt: number | null;
  raw: Record<string, unknown>;
}

export function refreshSupported(provider: string): boolean {
  return (REFRESH_PROVIDERS as readonly string[]).includes(provider);
}

/** raw 里某个字符串字段(trim 后非空才取)。 */
export function strOf(raw: Record<string, unknown>, key: string): string | null {
  const v = raw[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** JWT payload(不解签)—— 镜像 Nexus refresh.py L163-176 的 user_id 回退。 */
function jwtPayloadOf(token: string): Record<string, unknown> | null {
  if (token.split(".").length < 2) return null;
  try {
    const seg = token.split(".")[1];
    const padded = seg + "=".repeat((-seg.length) % 4);
    const parsed: unknown = JSON.parse(Buffer.from(padded, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** trae 刷新 host:凭据 raw.host 优先,否则按区域(ai/sg/global→AI,其余→CN)。 */
function traeRefreshHost(cred: RefreshCred): string {
  const host = strOf(cred.raw, "host");
  if (host) return host.replace(/\/+$/, "");
  const region = (strOf(cred.raw, "region") ?? "").toLowerCase();
  return region === "ai" || region === "sg" || region === "global"
    ? TRAE_DEFAULT_HOST_AI
    : TRAE_DEFAULT_HOST_CN;
}

/**
 * trae 刷新契约:**按 edition 而非区域**(Nexus trae_refresh_contract)。
 * refresh token 绑定 ClientID,edition 判错上游回 040004
 * "refresh token is not matched to the client"(CN 桌面 SOLO 曾被误归 cn 契约)。
 * core 的 trae_refresh_contract 按区域、与 Nexus 不一致,故此处本地实现;
 * 应答解析仍复用 core 的 parse_refresh_response。
 */
function traeContractOf(cred: RefreshCred): { path: string; clientId: string; deviceInfo: boolean } {
  const edition = (strOf(cred.raw, "edition") ?? "cn").toLowerCase();
  if (edition === "solo" || edition === "solo-sg") {
    return { path: TRAE_SOLO_PATH, clientId: TRAE_SOLO_CLIENT_ID, deviceInfo: true };
  }
  return { path: TRAE_CLOUDIDE_PATH, clientId: TRAE_CN_CLIENT_ID, deviceInfo: false };
}

/** trae user_id:raw.uid → raw.user_id → 解 token JWT(payload.data.user_id/id)。 */
function traeUserId(cred: RefreshCred): string {
  const uid = strOf(cred.raw, "uid");
  if (uid) return uid;
  const userId = strOf(cred.raw, "user_id");
  if (userId) return userId;
  const token = cred.secret ?? "";
  if (token.split(".").length >= 2) {
    const payload = jwtPayloadOf(token);
    const data = payload?.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const key of ["user_id", "id"] as const) {
        const v = (data as Record<string, unknown>)[key];
        if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
      }
    }
  }
  throw new RefreshCredentialError(
    "trae 账号没有 user_id/uid,且无法从 token 里解出 —— 无法构造刷新请求。");
}

/**
 * trae solo DeviceProof —— 镜像 Nexus _device_proof(L277-298):
 * ECDSA-P256/SHA-256 对 "POST\n{path}\n{client_id}\n{refresh_token}\n{ts}\n{nonce}"
 * 签名,Signature 为标准 base64。core 的 device_proof 消息格式不同,故本地实现。
 */
function traeDeviceProof(
  path: string,
  clientId: string,
  refreshToken: string,
  privateKeyPem: string,
): { Signature: string; Timestamp: string; Nonce: string } {
  const timestamp = String(Date.now());
  const nonce = Buffer.from(randomBytes(16)).toString("base64url").replace(/=+$/, "");
  const message = ["POST", path, clientId, refreshToken, timestamp, nonce].join("\n");
  const signer = createSign("SHA256");
  signer.update(message, "utf8");
  const signature = signer.sign(privateKeyPem, "base64");
  return { Signature: signature, Timestamp: timestamp, Nonce: nonce };
}

/** workbuddy 区域判定(镜像 Nexus _wb_region_of):www. 前缀剥离后按全局域名表。 */
function wbRegionOf(domain: string): "cn" | "global" {
  let d = domain.trim().toLowerCase();
  if (d.startsWith("www.")) d = d.slice(4);
  for (const g of WB_GLOBAL_DOMAINS) {
    if (d === g || d.endsWith(`.${g}`)) return "global";
  }
  return "cn";
}

/** workbuddy billing origin(镜像 Nexus _wb_billing_base)。 */
function wbBillingBase(domain: string): string {
  if (wbRegionOf(domain) !== "global") return WB_CN_BILLING_BASE;
  return domain.toLowerCase().includes("codebuddy.ai")
    ? "https://www.codebuddy.ai"
    : "https://www.workbuddy.ai";
}

/** workbuddy 刷新 chat base(镜像 Nexus wb_chat_base)。 */
function wbChatBase(domain: string): string {
  if (wbRegionOf(domain) !== "global") return WB_CN_CHAT_BASE;
  return domain.toLowerCase().includes("codebuddy.ai")
    ? "https://www.codebuddy.ai"
    : "https://www.workbuddy.ai";
}

/**
 * workbuddy 域:raw.domain 优先;其次 raw.region;再退到 token iss 判定
 * (core detect_region_from_token,与 Nexus 解不出时按区域兜底同思路)。
 */
function wbDomainOf(cred: RefreshCred): string {
  const domain = strOf(cred.raw, "domain");
  if (domain) return domain;
  const regionRaw = strOf(cred.raw, "region");
  const region = regionRaw ? regionRaw.toLowerCase() : detect_region_from_token(cred.secret ?? "");
  return region === "cn" ? "copilot.tencent.com" : "https://www.workbuddy.ai";
}

/** POST JSON 并校验应答 —— 镜像 Nexus _post_json(L182-200)。 */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REFRESH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: abort.signal,
    });
  } catch (err) {
    throw new RefreshError(`刷新请求失败:${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new RefreshError(`刷新端点返回 HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new RefreshError("刷新应答不是合法 JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RefreshError("刷新应答不是 JSON 对象");
  }
  return payload as Record<string, unknown>;
}

/** 一次上游刷新换来的新凭据(expiresAtMs = epoch 毫秒,null = 上游没给到期)。 */
export interface RefreshOutcome {
  accessToken: string;
  expiresAtMs: number | null;
  refreshToken?: string;
  /** 写回凭据 raw 的附加字段(Nexus extra_updates,如 trae solo 的 device_keypair)。 */
  extra?: Record<string, unknown>;
}

/** trae 刷新(镜像 Nexus refresh_trae):契约按 edition;应答解析复用 core。 */
export async function refreshTraeToken(cred: RefreshCred): Promise<RefreshOutcome> {
  if (!cred.refreshSecret) {
    throw new RefreshCredentialError("无 refresh token,请在客户端重新登录后重新发现");
  }
  const contract = traeContractOf(cred);
  const userId = traeUserId(cred);
  const refreshToken = cred.refreshSecret.trim();
  const body: Record<string, unknown> = {
    ClientID: contract.clientId,
    ClientSecret: "",
    RefreshToken: refreshToken,
    UserID: userId,
  };
  const extra: Record<string, unknown> = {};
  if (contract.deviceInfo) {
    const deviceId = strOf(cred.raw, "device_id");
    const machineId = strOf(cred.raw, "machine_id");
    if (!deviceId || !machineId) {
      throw new RefreshCredentialError(
        "TRAE SOLO 刷新需要 device_id 与 machine_id,凭据里没有。请在客户端重新登录后重新导入。");
    }
    const keypair = cred.raw["device_keypair"];
    const pem = keypair && typeof keypair === "object"
      ? (keypair as Record<string, unknown>)["private_key_pem"]
      : undefined;
    if (typeof pem !== "string" || pem.length === 0) {
      throw new RefreshCredentialError(
        "TRAE SOLO 刷新需要 device_keypair(设备绑定密钥对),凭据里没有。请在客户端重新登录后重新导入凭据。");
    }
    body["DeviceInfo"] = {
      DeviceID: deviceId,
      MachineID: machineId,
      PlatformCode: "SOLO_PC",
      DeviceType: "PC",
      DeviceName: strOf(cred.raw, "device_name") ?? "as-one",
      ClientVersion: strOf(cred.raw, "build_version") ?? "",
    };
    body["DeviceProof"] = traeDeviceProof(contract.path, contract.clientId, refreshToken, pem);
    extra["device_keypair"] = keypair;
  }
  const payload = await postJson(traeRefreshHost(cred) + contract.path, { "Content-Type": "application/json" }, body);
  const parsed = parseTraeRefreshResponse(payload);
  if (!Number.isFinite(parsed.expiresAt)) {
    throw new RefreshError("trae 刷新应答未返回 TokenExpireAt");
  }
  return {
    accessToken: parsed.accessToken,
    expiresAtMs: Math.round(parsed.expiresAt * 1000),
    refreshToken: parsed.refreshToken,
    extra,
  };
}

/**
 * workbuddy 刷新(镜像 Nexus refresh_workbuddy):**不带 Authorization**;
 * X-User-Id 必带(漏了不报 401,只拿到"不属于任何账号"的新令牌);
 * 头集 = core build_refresh_headers + Nexus 要求的 Origin/Referer/UA 等。
 */
export async function refreshWorkbuddyToken(cred: RefreshCred): Promise<RefreshOutcome> {
  if (!cred.refreshSecret) {
    throw new RefreshCredentialError("无 refresh token,请在客户端重新登录后重新发现");
  }
  const domain = wbDomainOf(cred);
  const origin = wbBillingBase(domain);
  const uid = strOf(cred.raw, "uid")
    ?? (cred.secret ? jwt_claim(cred.secret, "sub") || undefined : undefined);
  const enterpriseId = strOf(cred.raw, "enterprise_id");
  const headers: Record<string, string> = {
    ...buildWbRefreshHeaders(cred.refreshSecret),
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    Origin: origin,
    Referer: `${origin}/`,
    "User-Agent": WB_CLIENT_UA,
    "X-Auth-Refresh-Source": "workbuddy",
  };
  if (uid) headers["X-User-Id"] = uid;
  if (enterpriseId) headers["X-Enterprise-Id"] = enterpriseId;
  const payload = await postJson(wbChatBase(domain) + WB_REFRESH_PATH, headers);
  const parsed = parseWbRefreshResponse(payload);
  return {
    accessToken: parsed.accessToken,
    // 上游可能不给 expiresIn → core 返回 Infinity;此时保留旧到期(Nexus 语义)。
    expiresAtMs: Number.isFinite(parsed.expiresAt) ? Math.round(parsed.expiresAt * 1000) : null,
    refreshToken: parsed.refreshToken,
  };
}

/**
 * minimax 刷新(国内/国际账号服务 `/oauth2/token`)。
 *
 * 与 trae/workbuddy 不同,它**只有一条路**:refresh_token 表单换令牌。区域从 raw
 * 里取(`cn` → account.minimax.cn,其余 → account.minimax.io);上游轮换 refresh_token
 * 时就写回新的,没给就保留旧的(旧的在被真正吊销前一直可用)。
 */
export async function refreshMinimaxToken(cred: RefreshCred): Promise<RefreshOutcome> {
  if (!cred.refreshSecret) {
    throw new RefreshCredentialError("无 refresh token,请在该账号导出的凭据里补上 refresh_token");
  }
  const region = (strOf(cred.raw, "region") ?? "").toLowerCase() === "global" ? "global" : "cn";
  const res = await minimaxRefreshToken({
    refreshToken: cred.refreshSecret,
    region,
  });
  return {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken ?? undefined,
    expiresAtMs:
      res.expiresInSec !== null && Number.isFinite(res.expiresInSec)
        ? Math.round((Date.now() + res.expiresInSec * 1000))
        : null,
  };
}
