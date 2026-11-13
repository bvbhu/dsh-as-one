/**
 * MiniMax 国内版**网络层**:签到面板 / 领取 / 余额 / 发放明细。
 *
 * 签名与查询串全部来自 `minimax-wire.ts`(与参考实现逐字节对齐,有单测兜住)。
 * 这里只负责「发请求 + 解包 + 错误分类」,不碰 DB、不碰调度。
 *
 * 错误分类沿用签到模块的 {@link CheckinError}:面板要将它原样展示给用户,
 * 网络失败 / 超时 / 非 JSON / 401 都要能区分出来。
 */

import { CheckinError } from "./checkin.js";
import {
  MINIMAX_CREDIT_DETAILS_PATH,
  MINIMAX_CREDIT_PATH,
  MINIMAX_SIGNIN_CLAIM_PATH,
  MINIMAX_SIGNIN_STATUS_PATH,
  MINIMAX_TIMEOUT_MS,
  coreOf,
  minimaxHeaders,
  parseCredit,
  parseCreditGrants,
  parseSigninClaim,
  parseSigninPanel,
  signinTarget,
  type MinimaxCredit,
  type MinimaxCreditGrant,
  type MinimaxCredential,
  type MinimaxSigninClaim,
  type MinimaxSigninPanel,
} from "./minimax-wire.js";

/** 一个 minimax 账号(与 panel 的 ChannelAccount 同源字段)。 */
export interface MinimaxAccount extends MinimaxCredential {
  /** 凭据列表序号(仅为与其它渠道的入参形状一致)。 */
  index?: number;
  username?: string;
}

export interface MinimaxHttpOptions {
  /** 注入 fetch(测试替身);缺省 globalThis.fetch。 */
  fetchFn?: typeof fetch;
  /** 超时毫秒;缺省 60s。 */
  timeoutMs?: number;
  /**
   * 401/403 时的**自动续期回调**(2026-11-07:minimax token 只有 1~12 小时寿命)。
   *
   * 由调用方提供(它才持有凭据库):用 refresh_token 换新 token、写回库、
   * 返回**带新 token 的账号**。返回 null = 无 refresh_token 可用(不重试)。
   *
   * 只会在 401/403 时调用**一次**,续期后仍失败就按原错误抛出。
   */
  onAuthExpired?: (account: MinimaxAccount) => Promise<MinimaxAccount | null>;
}

/** 一个已签发的请求目标 + 请求头。 */
function targetOf(
  account: MinimaxAccount,
  path: string,
  opts: { method?: "GET" | "POST"; body?: string } = {},
): { url: string; method: string; headers: Record<string, string>; body: string | undefined } {
  const target = signinTarget(account, path, {
    method: opts.method ?? "GET",
    body: opts.body ?? "",
  });
  return {
    url: target.url,
    method: target.method,
    headers: minimaxHeaders(account, target),
    body: target.body === "" ? undefined : target.body,
  };
}

/** 发一次签名请求并把响应体解析成对象(统一错误口径)。 */
async function callJson(
  account: MinimaxAccount,
  path: string,
  label: string,
  opts: MinimaxHttpOptions & { method?: "GET" | "POST"; body?: string } = {},
): Promise<Record<string, unknown>> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? MINIMAX_TIMEOUT_MS;

  /** 发一次(不处理 401),返回 Response。 */
  const send = async (acct: MinimaxAccount): Promise<Response> => {
    const req = targetOf(acct, path, { method: opts.method, body: opts.body });
    try {
      return await fetchFn(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new CheckinError(`minimax ${label} 请求超时(${timeoutMs}ms)`);
      }
      throw new CheckinError(
        `minimax ${label} 请求失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  let resp = await send(account);
  /** 续期失败的真实原因(上游拒绝 / 没有 refresh_token / 写库失败)。 */
  let renewFailure: string | null = null;
  /** 是否真的换到了新令牌并重试过 —— 用来区分「没救成」和「救了仍被拒」。 */
  let retriedWithNewToken = false;

  // ⚠️ 401/403 → **自动续期并重试一次**(2026-11-07 用户报「凭据可能已过期」):
  // minimax 的 access token 只有 1~12 小时寿命,凭据里 refresh_token 一直有效。
  // 以前这里直接抛错,用户得手动点刷新 —— 现在有 refreshToken 就自己救。
  // 只重试**一次**:续期后仍 401 说明 refresh_token 也废了,再试无意义。
  if ((resp.status === 401 || resp.status === 403) && opts.onAuthExpired) {
    try {
      const renewed = await opts.onAuthExpired(account);
      if (renewed !== null) {
        retriedWithNewToken = true;
        resp = await send(renewed);
      } else {
        renewFailure = "没有可用的 refresh_token(续期回调返回 null)";
      }
    } catch (err) {
      // 2026-11-08:以前这里空 catch,把 invalid_grant 之类的**确定答案**吞掉,
      // 面板上只剩「已尝试自动续期,仍失败」,用户不知道要做的是重新授权。
      // 现在把原因带进最终错误(不让它变成未处理异常)。
      renewFailure = err instanceof Error ? err.message : String(err);
    }
  }

  let text: string;
  try {
    text = await resp.text();
  } catch (err) {
    throw new CheckinError(
      `minimax ${label} 读取响应失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 401/403 在**读 body 之前**判定:上游对此常常回空 body,空就是唯一信号。
  if (resp.status === 401 || resp.status === 403) {
    let suffix = "";
    if (opts.onAuthExpired) {
      suffix = renewFailure !== null
        ? `(自动续期未成功: ${renewFailure})`
        : retriedWithNewToken
          ? "(已用 refresh_token 换新令牌并重试,上游仍拒绝:请检查设备指纹或账号状态)"
          : "(已尝试用 refresh_token 自动续期,仍失败)";
    }
    throw new CheckinError(
      `minimax ${label} 鉴权失败(HTTP ${resp.status}):凭据可能已过期${suffix}`,
    );
  }
  if (resp.status >= 400) {
    throw new CheckinError(`minimax ${label} HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    throw new CheckinError(`minimax ${label} 返回非 JSON: ${trimmed.slice(0, 200)}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    throw new CheckinError(`minimax ${label} 返回非法 JSON: ${trimmed.slice(0, 200)}`);
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new CheckinError(`minimax ${label} 返回非对象`);
  }
  return payload as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 签到
// ---------------------------------------------------------------------------

/**
 * 读 7 天签到面板。
 *
 * 未配置 uuid/device_id 的账号直接本地拒绝:查询串里缺这两个参数时 yy 签名
 * 虽然还能算,但上游会把会话认成另一个设备 → 401,错误信息毫无指向性。
 */
export async function minimaxSigninStatus(
  account: MinimaxAccount,
  opts: MinimaxHttpOptions = {},
): Promise<MinimaxSigninPanel> {
  requireDevice(account);
  const payload = await callJson(account, MINIMAX_SIGNIN_STATUS_PATH, "signin status", opts);
  return parseSigninPanel(coreOf(payload));
}

/**
 * 领取今日积分。**幂等**:今天已领时上游回 `claim_result=2`,不是错误。
 */
export async function minimaxSigninClaim(
  account: MinimaxAccount,
  opts: MinimaxHttpOptions = {},
): Promise<MinimaxSigninClaim> {
  requireDevice(account);
  const payload = await callJson(account, MINIMAX_SIGNIN_CLAIM_PATH, "signin claim", {
    ...opts,
    method: "POST",
    body: "{}",
  });
  return parseSigninClaim(coreOf(payload));
}

// ---------------------------------------------------------------------------
// 额度 / 发放明细
// ---------------------------------------------------------------------------

/** 读余额(POST `{}`)。 */
export async function minimaxCredit(
  account: MinimaxAccount,
  opts: MinimaxHttpOptions = {},
): Promise<MinimaxCredit> {
  requireDevice(account);
  const payload = await callJson(account, MINIMAX_CREDIT_PATH, "credit", {
    ...opts,
    method: "POST",
    body: "{}",
  });
  return parseCredit(coreOf(payload));
}

/**
 * 读发放明细(GET)。
 *
 * 签到接口「成功」不等于积分到账,发放明细是唯一证据 —— 面板的「最早到期」
 * 也从这里算(见 wire 的 `earliestGrantExpiry`)。
 */
export async function minimaxCreditGrants(
  account: MinimaxAccount,
  opts: MinimaxHttpOptions = {},
): Promise<MinimaxCreditGrant[]> {
  requireDevice(account);
  const payload = await callJson(account, MINIMAX_CREDIT_DETAILS_PATH, "credit details", opts);
  return parseCreditGrants(coreOf(payload));
}

/** uuid 与 device_id 是签名的组成部分,缺了必然被上游认成另一台设备。 */
function requireDevice(account: MinimaxAccount): void {
  if (!(account.uuid ?? "").trim() || !(account.deviceId ?? "").trim()) {
    throw new CheckinError("minimax 账号缺少 uuid / device_id,无法构造签名请求");
  }
  if (!(account.token ?? "").trim() && !(account.bearer ?? "").trim()) {
    throw new CheckinError("minimax 账号没有可用令牌");
  }
}

// ---------------------------------------------------------------------------
// 令牌续期
// ---------------------------------------------------------------------------

/** 账号服务 origin(与 App 端登录/续期同一个域,不是 agent 域)。 */
export const MINIMAX_ACCOUNT_ORIGINS = {
  cn: "https://account.minimax.cn",
  global: "https://account.minimax.io",
} as const;

/** 桌面客户端公开的 client_id(续期 grant 必须用它)。 */
export const MINIMAX_OAUTH_CLIENT_ID = "mcode-public";

export interface MinimaxRefreshResult {
  accessToken: string;
  /** 上游轮换了 refresh_token 时给出新值;没给就继续用旧的。 */
  refreshToken: string | null;
  /** 新 access token 有效期(秒);上游没给时 null。 */
  expiresInSec: number | null;
}

/**
 * 用 refresh_token 换新 access token。
 *
 * 三条要点(参考实现 keepalive.refresh_with_token 的注释,踩过才知道):
 *   - 表单编码(`application/x-www-form-urlencoded`),不是 JSON;
 *   - **不能带 `app_id`** —— 它属于浏览器 authorize,在 token 端点上是
 *     `invalid_request`;
 *   - `grant_type` 必须是 `refresh_token`,缺了直接拒。
 */
export async function minimaxRefreshToken(
  input: { refreshToken: string; region?: "cn" | "global" | null },
  opts: MinimaxHttpOptions = {},
): Promise<MinimaxRefreshResult> {
  const refreshToken = (input.refreshToken ?? "").trim();
  if (!refreshToken) {
    throw new CheckinError("minimax 账号没有 refresh_token,无法续期");
  }
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const origin = MINIMAX_ACCOUNT_ORIGINS[input.region === "global" ? "global" : "cn"];
  const body = new URLSearchParams({
    client_id: MINIMAX_OAUTH_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }).toString();

  let resp: Response;
  try {
    resp = await fetchFn(`${origin}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new CheckinError(`minimax 续期请求超时(${timeoutMs}ms)`);
    }
    throw new CheckinError(
      `minimax 续期请求失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const text = await resp.text();
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    /* 非 JSON:下面按「没有 access_token」处理,把原文带出去 */
  }
  const accessToken = typeof payload["access_token"] === "string" ? payload["access_token"] : "";
  if (!accessToken) {
    // 被拒绝的刷新是**确定答案**(如 invalid_grant),不是抖动 —— 不该重试。
    const detail =
      (typeof payload["error_description"] === "string" && payload["error_description"]) ||
      (typeof payload["error"] === "string" && payload["error"]) ||
      text.slice(0, 200);
    throw new CheckinError(`minimax 续期被拒(HTTP ${resp.status}): ${detail}`);
  }
  const expiresIn = payload["expires_in"];
  return {
    accessToken,
    refreshToken:
      typeof payload["refresh_token"] === "string" && payload["refresh_token"].length > 0
        ? payload["refresh_token"]
        : null,
    expiresInSec:
      typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? expiresIn
        : typeof expiresIn === "string" && Number.isFinite(Number(expiresIn))
          ? Number(expiresIn)
          : null,
  };
}

/**
 * 凭据行 → 账号。
 *
 * As One 的 credential 表只有 secret/refresh_secret/raw_json 三格可用,minimax 需要的
 * 设备指纹(uuid / device_id / user_id / bearer / 屏幕)全部放 raw_json;
 * 面板与探针都从这里取,避免两处字段名漂移。
 */
export interface MinimaxAccountInput {
  token: string | null;
  region?: string | null;
  extra?: Record<string, unknown> | null;
}

export function minimaxAccountOf(input: MinimaxAccountInput): MinimaxAccount {
  const raw = input.extra ?? {};
  const str = (key: string): string => {
    const v = raw[key];
    return typeof v === "string" ? v.trim() : "";
  };
  const numOf = (key: string): number | null => {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const token = input.token ?? "";
  // 桌面凭据(kind=oauth)的 access token 同时就是 bearer;从 kind 派生而不是
  // 复制进 raw —— 刷新后 token 会变,复制值必然过期。
  const bearer = str("bearer") || (str("kind") === "oauth" && token ? token : "");
  return {
    region: (input.region ?? "").trim().toLowerCase() === "global" ? "global" : "cn",
    token,
    bearer: bearer || null,
    uuid: str("uuid"),
    deviceId: str("device_id"),
    userId: str("user_id") || str("uid") || null,
    baseUrl: str("base_url") || null,
    screenWidth: numOf("screen_width"),
    screenHeight: numOf("screen_height"),
  };
}