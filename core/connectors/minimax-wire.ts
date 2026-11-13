/**
 * MiniMax 国内版(agent.minimaxi.com)Web/桌面协议的**纯函数部分** —— 签名、查询串、
 * 响应解析。网络与业务编排在 `minimax-signin.ts` / `collector/quota.ts`。
 *
 * 三个签名(与参考实现 minimax2api/app/signing.py 逐字对齐,均为小写 32 位 MD5):
 *   - `x-signature` = md5(unixSeconds + SALT + 原始 body)
 *   - `yy`          = md5(encodeURIComponent(signUrl) + "_" + body + md5(String(unixMs)) + "ooui")
 *   - (查询串本身不是摘要,但**参数顺序是契约**:yy 摘要的是编码后的 URL)
 *
 * 编码语义要点(踩过才知道):
 *   - `encodeURIComponent` 是 **JS 语义** —— Node 的全局函数与浏览器一致,Python 的
 *     `urllib.parse.quote` 不一致(`!*'()` 与 `~` 恰好相反),所以这里直接用全局
 *     `encodeURIComponent`,不要再自己拼字符表。
 *   - 查询串用 URLSearchParams 口径:比 encodeURIComponent 多一条「空格 → `+`」。
 *
 * 与参考实现的**刻意差异**:
 *   - 参考实现把 op_ticket 字面量 `"undefined"` 放进**签名**但**不发到线上**
 *     (axios 序列化时丢弃),这里同样处理并经单测保证;
 *   - 不内置 cookie 会话;token/bearer 由调用方从凭据给出。
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// 常量(与 Web 包内一致;盐不是秘密,它随前端 bundle 下发)
// ---------------------------------------------------------------------------

/** 打进 x-signature 的静态盐。 */
export const SIGNIN_SIGNATURE_SALT = "I*7Cf%WZ#S&%1RlZJ&C2";
/** yy 摘要输入末尾的固定后缀。 */
export const SIGNIN_SIGNATURE_SUFFIX = "ooui";
/** op_ticket 的字面值:参与签名,不发送。 */
export const OP_TICKET_LITERAL = "undefined";

/** 国内版 base(参考实现 upstream.base_url_cn 的默认值)。 */
export const MINIMAX_BASE_CN = "https://agent.minimaxi.com";
/** 国际版 base(参考实现 upstream.base_url 的默认值)。 */
export const MINIMAX_BASE_GLOBAL = "https://agent.minimax.io";

/** 签到面板。 */
export const MINIMAX_SIGNIN_STATUS_PATH = "/minimax-cloud/api/v1/signin/status";
/** 领取今日积分(幂等:重复领返回 claim_result=2)。 */
export const MINIMAX_SIGNIN_CLAIM_PATH = "/minimax-cloud/api/v1/signin/claim";
/** 余额(POST,body 为 `{}`)。 */
export const MINIMAX_CREDIT_PATH = "/matrix/api/v1/commerce/get_membership_info";
/** 积分明细/发放记录(GET)—— 「最早到期」的唯一证据来源。 */
export const MINIMAX_CREDIT_DETAILS_PATH = "/minimax-cloud/api/v1/credit/details";

/** Web 画像 UA。 */
export const MINIMAX_WEB_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** 桌面端 UA 模板(`{version}` 替换为版本号)。 */
export const MINIMAX_DESKTOP_USER_AGENT =
  "MiniMaxAgent Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) MiniMaxAgent/{version} " +
  "Chrome/148.0.7778.280 Safari/537.36";

export const MINIMAX_DESKTOP_VERSION = "3.0.73";

/** 请求超时(毫秒)。 */
export const MINIMAX_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// 凭据画像
// ---------------------------------------------------------------------------

/** 协议需要的账号字段(对应 As One credential 表:secret/refresh_secret/raw_json)。 */
export interface MinimaxCredential {
  /** 区域:`cn`(agent.minimaxi.com) / `global`(agent.minimax.io)。 */
  region: "cn" | "global";
  /** Web JWT 或桌面 access token;放到 `token` 头。 */
  token: string;
  /** 桌面端 bearer;非空时改用 `Authorization: Bearer`,并在查询串里置 token=""。 */
  bearer?: string | null;
  /** 该设备的 uuid(web 会话 uuid)。 */
  uuid: string;
  /** 设备指纹 device_id。 */
  deviceId: string;
  /** 账号 user_id;查询串里缺省为 "0"。 */
  userId?: string | null;
  /** 自定义 base(缺省按 region 取)。 */
  baseUrl?: string | null;
  /** 屏幕宽度(缺省 1920)。 */
  screenWidth?: number | null;
  /** 屏幕高度(缺省 1080)。 */
  screenHeight?: number | null;
}

/** 签到画像(与 Web 包一致的固定值,可按需覆盖)。 */
export interface MinimaxSigninProfile {
  lang: string;
  osName: string;
  browserName: string;
  browserLanguage: string;
  browserPlatform: string;
  /** 时区偏移**分钟**;上游发的是 `-60 * getTimezoneOffset()`,UTC+8 → +28800 秒。 */
  timezoneOffsetMin: number;
  deviceMemory: number;
  cpuCoreNum: number;
  screenWidth: number;
  screenHeight: number;
}

export const DEFAULT_MINIMAX_SIGNIN_PROFILE: MinimaxSigninProfile = {
  lang: "en",
  osName: "Windows",
  browserName: "Chrome",
  browserLanguage: "en-US",
  browserPlatform: "Win32",
  timezoneOffsetMin: 480,
  deviceMemory: 16,
  cpuCoreNum: 8,
  screenWidth: 1920,
  screenHeight: 1080,
};

// ---------------------------------------------------------------------------
// 摘要与编码
// ---------------------------------------------------------------------------

/** 小写 32 位十六进制 MD5。 */
export function md5Hex(value: string): string {
  return createHash("md5").update(value, "utf8").digest("hex");
}

/** URLSearchParams 口径编码(encodeURIComponent + 空格转 `+`)。 */
export function formEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

/** `x-signature` = md5(unixSeconds + salt + 原始 body)。 */
export function xSignature(unixSeconds: number, body: string): string {
  return md5Hex(`${unixSeconds}${SIGNIN_SIGNATURE_SALT}${body}`);
}

/**
 * `yy` = md5(encodeURIComponent(signUrl) + "_" + body + md5(String(unixMs)) + "ooui")。
 *
 * ⚠️ signUrl 对签到接口是**相对路径 + 查询串**(不是完整 URL);对 agent 接口才是完整
 * URL。调用方按自己的口径传,函数不做判断。
 */
export function yy(signUrl: string, body: string, unixMs: number): string {
  return md5Hex(
    `${encodeURIComponent(signUrl)}_${body}${md5Hex(String(unixMs))}${SIGNIN_SIGNATURE_SUFFIX}`,
  );
}

// ---------------------------------------------------------------------------
// base / 查询串
// ---------------------------------------------------------------------------

/** 解析账号 base:显式 baseUrl > 国内默认 > 国际默认。 */
export function baseUrlOf(cred: MinimaxCredential): string {
  const explicit = (cred.baseUrl ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return cred.region === "cn" ? MINIMAX_BASE_CN : MINIMAX_BASE_GLOBAL;
}

/** UA:桌面画像(有 bearer)用桌面 UA,否则 Web UA。 */
export function userAgentOf(cred: MinimaxCredential): string {
  return cred.bearer
    ? MINIMAX_DESKTOP_USER_AGENT.replace("{version}", MINIMAX_DESKTOP_VERSION)
    : MINIMAX_WEB_USER_AGENT;
}

/**
 * 签到查询串,**顺序即契约**(Web 包按此顺序拼,重排会让 yy 失效)。
 *
 * `forSignature=true` 时保留 op_ticket(字面量 "undefined");为 false 时丢弃它
 * (axios 序列化 undefined 的行为),其余空值一律跳过。
 */
export function buildSigninQuery(
  cred: MinimaxCredential,
  unixMs: number,
  forSignature: boolean,
  profile: MinimaxSigninProfile = DEFAULT_MINIMAX_SIGNIN_PROFILE,
): string {
  const width = cred.screenWidth || profile.screenWidth;
  const height = cred.screenHeight || profile.screenHeight;
  const pairs: Array<[string, string]> = [
    ["device_platform", "web"],
    ["biz_id", "3"],
    ["app_id", "3001"],
    ["version_code", "22201"],
    ["unix", String(unixMs)],
    ["timezone_offset", String(profile.timezoneOffsetMin * 60)],
    ["sys_language", profile.lang],
    ["lang", profile.lang],
    ["uuid", cred.uuid],
    ["device_id", cred.deviceId],
    ["os_name", profile.osName],
    ["browser_name", profile.browserName],
    ["device_memory", String(profile.deviceMemory)],
    ["cpu_core_num", String(profile.cpuCoreNum)],
    ["browser_language", profile.browserLanguage],
    ["browser_platform", profile.browserPlatform],
    ["user_id", (cred.userId ?? "").trim() || "0"],
    ["op_ticket", OP_TICKET_LITERAL],
    ["screen_width", String(width)],
    ["screen_height", String(height)],
    ["token", cred.bearer ? "" : cred.token],
    ["client", "web"],
  ];
  const out: string[] = [];
  for (const [key, value] of pairs) {
    if (key === "op_ticket" && !forSignature) continue;
    if (!value && key !== "op_ticket") continue;
    out.push(`${key}=${formEncode(value)}`);
  }
  return out.join("&");
}

/** 一次已构造好的请求(签名基址与实际上线 URL 可能不同)。 */
export interface MinimaxTarget {
  method: "GET" | "POST" | "DELETE";
  /** 实际请求的完整 URL。 */
  url: string;
  /** 参与 yy 的字符串(签到接口是相对路径 + 查询串)。 */
  signUrl: string;
  unixMs: number;
  body: string;
  /** 签到类接口:yy/x-signature 的 body 口径与普通接口不同(axmls 传字面量)。 */
  checkin: boolean;
}

/**
 * 构造签到类请求:签名基址是**相对路径 + 查询串**,线上 URL 是 base + 查询串。
 */
export function signinTarget(
  cred: MinimaxCredential,
  path: string,
  opts: { method?: "GET" | "POST"; body?: string; unixMs?: number } = {},
  profile: MinimaxSigninProfile = DEFAULT_MINIMAX_SIGNIN_PROFILE,
): MinimaxTarget {
  const unixMs = opts.unixMs ?? Date.now();
  const method = opts.method ?? "GET";
  const body = opts.body ?? "";
  const signed = `${path}?${buildSigninQuery(cred, unixMs, true, profile)}`;
  const wire = `${path}?${buildSigninQuery(cred, unixMs, false, profile)}`;
  return {
    method,
    url: `${baseUrlOf(cred)}${wire}`,
    signUrl: signed,
    unixMs,
    body,
    checkin: true,
  };
}

// ---------------------------------------------------------------------------
// 请求头
// ---------------------------------------------------------------------------

/**
 * 造请求头。
 *
 * 签到类接口(target.checkin)的 yy/x-signature 口径:
 *   - yy 的 body 固定为 `{}`(axios 把字面量交给签到模块,永不出现在摘要里);
 *   - x-signature 用真实 body(claim 是 `{}`,status/details 是空串)。
 */
export function minimaxHeaders(
  cred: MinimaxCredential,
  target: MinimaxTarget,
): Record<string, string> {
  const base = baseUrlOf(cred);
  const unixSeconds = Math.floor(target.unixMs / 1000);
  const yyBody = target.checkin ? "{}" : target.body;
  const headers: Record<string, string> = {
    accept: target.checkin ? "*/*" : "application/json, text/plain, */*",
    "content-type": "application/json",
    origin: base,
    referer: `${base}/`,
    "user-agent": userAgentOf(cred),
    token: cred.token,
    "x-timestamp": String(unixSeconds),
    "x-signature": xSignature(unixSeconds, target.body),
    yy: yy(target.signUrl, yyBody, target.unixMs),
  };
  if (cred.bearer) {
    headers["Authorization"] = `Bearer ${cred.bearer}`;
    delete headers["token"];
  }
  return headers;
}

// ---------------------------------------------------------------------------
// 响应解析
// ---------------------------------------------------------------------------

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** `core` = payload.data(dict) 或 payload 本身。 */
export function coreOf(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload["data"];
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : payload;
}

/** 签到日。 */
export interface MinimaxSigninDay {
  dayNo: number;
  points: number;
  /** 1 = 未来不可领;2 = 今日未领;3 = 已领。 */
  status: number;
  isToday: boolean;
}

export interface MinimaxSigninPanel {
  scene: number;
  days: MinimaxSigninDay[];
}

export function parseSigninPanel(core: Record<string, unknown>): MinimaxSigninPanel {
  const days: MinimaxSigninDay[] = [];
  const raw = core["days"];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const rec = item as Record<string, unknown>;
      days.push({
        dayNo: num(rec["day_no"]),
        points: num(rec["points"]),
        status: num(rec["status"]),
        isToday: rec["is_today"] === true,
      });
    }
  }
  return { scene: num(core["scene"]), days };
}

/**
 * 今日是否已领。
 *
 * ⚠️ `status` 语义:1 = 未来不可领、2 = 今日未领、3 = 已领。把 1 读成「已领」会
 * 反过来天天去打 claim(参考实现踩过)。
 */
export function panelClaimedToday(panel: MinimaxSigninPanel): boolean {
  const today = panel.days.find((d) => d.isToday);
  return today !== undefined && today.status === 3;
}

/**
 * 今日那笔的积分(2026-11-07 修正语义:**不论已签/未签,一律给当日条目真实值**)。
 *
 * 面板两处消费它:未签时读作「今日可领 X」,已签时读作「今日领到 X」。
 * 旧实现在已签时返回 0,概览卡就出现「显示已签、却看不到领了多少」(用户实测)。
 * 没有今日条目时 0。
 */
export function panelTodayPoints(panel: MinimaxSigninPanel): number {
  const today = panel.days.find((d) => d.isToday);
  return today ? today.points : 0;
}

export interface MinimaxSigninClaim {
  claimId: number;
  /** 1 = 本次成功;2 = 今日已领(幂等)。 */
  result: number;
  dayNo: number;
  points: number;
  panel: MinimaxSigninPanel | null;
}

export function parseSigninClaim(core: Record<string, unknown>): MinimaxSigninClaim {
  const panelRaw = core["panel"];
  return {
    claimId: num(core["claim_id"]),
    result: num(core["claim_result"]),
    dayNo: num(core["day_no"]),
    points: num(core["points"]),
    panel:
      typeof panelRaw === "object" && panelRaw !== null && !Array.isArray(panelRaw)
        ? parseSigninPanel(panelRaw as Record<string, unknown>)
        : null,
  };
}

/** 余额。 */
export interface MinimaxCredit {
  planName: string;
  planType: number;
  /** 总剩余(字符串浮点口径)。 */
  total: number;
  free: number;
  purchased: number;
}

export function parseCredit(core: Record<string, unknown>): MinimaxCredit {
  const summary = core["op_credit_summary"];
  if (typeof summary === "object" && summary !== null && !Array.isArray(summary)) {
    const s = summary as Record<string, unknown>;
    return {
      planName: str(core["plan_name"]),
      planType: num(core["plan_type"]),
      total: num(s["total_remaining_amount"]),
      free: num(s["free_remaining_amount"]),
      purchased: num(s["purchased_remaining_amount"]),
    };
  }
  // 迁移前的老字段(几乎恒为 0),只作兜底。
  return {
    planName: str(core["plan_name"]),
    planType: num(core["plan_type"]),
    total: num(core["opcredit_balance"]) || num(core["total_remains_credit"]),
    free: 0,
    purchased: 0,
  };
}

/** 单笔发放(签到/活动给的那一份)。 */
export interface MinimaxCreditGrant {
  /** epoch 秒。 */
  grantedAt: number;
  /** epoch 秒。 */
  expiresAt: number;
  granted: number;
  remaining: number;
}

/**
 * 时间字段归一化到 **epoch 秒**。
 *
 * 上游 `credit/details` 实际下发的是**毫秒**(`granted_at_ms` / `expire_at_ms`),
 * 参考实现按 `granted_at` / `expires_at`(秒)解析,所以它的发放页恒为 0 ——
 * 这是个真 bug,我们按线上真实字段名解析,同时兼容旧口径。
 */
function epochSeconds(value: unknown): number {
  const n = num(value);
  if (n <= 0) return 0;
  // > 1e11 视为毫秒(1e11 秒 ≈ 公元 5138 年,不可能出现)。
  return n > 1e11 ? Math.floor(n / 1000) : n;
}

/**
 * 解析发放明细。
 *
 * 线上真实字段(2026-11 实测):`granted_amount` / `remaining_amount` /
 * `granted_at_ms` / `expire_at_ms`(前两个是**字符串**浮点)。
 * 兼容参考实现假设的 `granted` / `remaining` / `granted_at` / `expires_at`。
 */
export function parseCreditGrants(core: Record<string, unknown>): MinimaxCreditGrant[] {
  const raw = core["details"];
  if (!Array.isArray(raw)) return [];
  const out: MinimaxCreditGrant[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    out.push({
      grantedAt: epochSeconds(rec["granted_at_ms"] ?? rec["granted_at"]),
      expiresAt: epochSeconds(rec["expire_at_ms"] ?? rec["expires_at"] ?? rec["expire_at"]),
      granted: num(rec["granted_amount"] ?? rec["granted"]),
      remaining: num(rec["remaining_amount"] ?? rec["remaining"]),
    });
  }
  return out;
}

/**
 * 「最早到期」= 仍有余额的发放里最小的 expires_at(epoch 秒)。
 *
 * 与参考实现一致:只统计 `remaining > 0` 的发放;没有可用发放时返回 null
 * (宁可未知,不虚报一个已过期的时刻)。
 */
export function earliestGrantExpiry(grants: MinimaxCreditGrant[]): number | null {
  let best: number | null = null;
  for (const g of grants) {
    if (g.remaining <= 0) continue;
    if (g.expiresAt <= 0) continue;
    if (best === null || g.expiresAt < best) best = g.expiresAt;
  }
  return best;
}