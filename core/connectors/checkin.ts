/**
 * 渠道签到能力 —— 与 Nexus `nexus/checkin.py` 对齐。
 *
 * 支持渠道(与 Nexus CHECKIN_PROVIDERS 一致)：
 *   - trae      国内版(区域 cn),Authorization 为 `Cloud-IDE-JWT {token}`
 *   - workbuddy 国内版(domain=codebuddy.cn 等),Authorization 为 `Bearer {token}`
 *
 * 三条红线(与 Nexus 一致)：
 *   1. trae 的 Authorization 是 `Cloud-IDE-JWT {token}`,不是 Bearer;
 *   2. HTTP 200 + 非 0 业务 code = 业务拒绝,不算成功
 *      (trae: 9004 = 缺 x-device-id;9095 = 本设备今日已签);
 *   3. claim 必须先 status 短路;confirm=false 时零写请求,confirm=true 才 POST 领取。
 *
 * 与 Nexus 的刻意差异(均在本文件顶部注释声明,供后续对账)：
 *   - trae 缺 device_id 时不报错拒绝,而是用 `resolve_identity(token)` 确定性派生
 *     (与 As One trae 连接器登录时使用的身份一致;Nexus 直接抛凭据错误);
 *   - 网络级失败(fetch 拒绝/超时/应答流中断)统一包装为 CheckinError
 *     (Nexus 会原样冒泡成 500;按"As One 不伪造成功、失败要带原因"的约定包装)。
 */

import { resolve_identity } from "./trae.js";

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

export class CheckinError extends Error {
  readonly kind: string = "checkin";
  constructor(message: string) {
    super(message);
    this.name = "CheckinError";
  }
}

/** 区域限制(国际版无签到)。确定性本地门禁,不会发任何请求。 */
export class CheckinRegionError extends CheckinError {
  readonly kind = "region";
  constructor(message: string) {
    super(message);
    this.name = "CheckinRegionError";
  }
}

/** 凭据缺失/形态不对。确定性本地门禁,不会发任何请求。 */
export class CheckinCredentialError extends CheckinError {
  readonly kind = "credential";
  constructor(message: string) {
    super(message);
    this.name = "CheckinCredentialError";
  }
}

// ---------------------------------------------------------------------------
// 支持渠道
// ---------------------------------------------------------------------------

export const CHECKIN_PROVIDERS = ["trae", "workbuddy", "minimax"] as const;

export function checkinSupported(provider?: string | null): boolean {
  return typeof provider === "string" && (CHECKIN_PROVIDERS as readonly string[]).includes(provider);
}

// ---------------------------------------------------------------------------
// trae
// ---------------------------------------------------------------------------

export const TRAE_PAY_BASE_CN = "https://api.trae.cn";
export const TRAE_CHECKIN_STATUS_PATH = "/trae/api/v2/ug/checkin_credits/status";
export const TRAE_CHECKIN_CLAIM_PATH = "/trae/api/v2/ug/checkin_credits/claim";
export const TRAE_CODE_NO_DEVICE = 9004;
export const TRAE_CODE_DEVICE_ALREADY = 9095;
/**
 * 上游高峰限流:签到池被同时涌入的用户占满。
 *
 * ⚠️ 这**不是**账号问题(2026-11-09 实测):同一个账号在非高峰时立刻签成功,
 * 高峰时连重试 3 次都回 9074。文案必须说清「稍后重试即可」,否则用户会以为
 * 签到坏了、甚至怀疑账号被封。
 */
export const TRAE_CODE_CROWDED = 9074;
export const TRAE_CHECKIN_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// 瞬时失败重试(trae 签到高峰)
// ---------------------------------------------------------------------------

/**
 * trae 签到在**每日重置的那一小段时间**里,上游会按并发量直接拒发:
 * 实测(2026-10-21 00:xx)claim 返回 HTTP 200 + 非 0 code,message =
 * 「当前参与用户太多,请稍后再试」。这不是凭据问题也不是重复签到,
 * 重试几次就能领到 —— 但**每次请求都是真实写请求**,所以只认「拥挤」类
 * 文案,绝不把确定性拒绝(9004 缺设备号 / 9095 本设备已签)也拿去重试。
 */
const TRAE_RETRYABLE_HINTS = [
  "参与用户太多",
  "稍后再试",
  "请稍后",
  "系统繁忙",
  "服务繁忙",
  "请求过于频繁",
  "too many",
  "try again",
  "later",
  "busy",
] as const;

/** 明确**不重试**的业务码:确定性拒绝,重试多少次都是同一个结果。 */
const TRAE_NON_RETRYABLE_CODES = new Set<number>([TRAE_CODE_NO_DEVICE, TRAE_CODE_DEVICE_ALREADY]);

/** 网络/HTTP 层的瞬时失败(超时 / 连接中断 / 429 / 5xx);4xx(非 429)不重试。 */
const TRANSIENT_ERROR_HINTS = [
  "超时",
  "timeout",
  "连接",
  "connection",
  "econnreset",
  "socket",
  "http 429",
  "http 500",
  "http 502",
  "http 503",
  "http 504",
] as const;

/** 上游「稍后再试」类业务拒绝:可重试。 */
export function isRetryableCheckinFailure(message: string, code?: number | null): boolean {
  if (typeof code === "number" && Number.isFinite(code) && TRAE_NON_RETRYABLE_CODES.has(code)) {
    return false;
  }
  const m = (message ?? "").toLowerCase();
  if (m === "") return false;
  return TRAE_RETRYABLE_HINTS.some((h) => m.includes(h.toLowerCase()));
}

/** 网络/HTTP 层的瞬时失败:可重试。 */
export function isTransientCheckinError(err: unknown): boolean {
  const m = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return TRANSIENT_ERROR_HINTS.some((h) => m.includes(h));
}

/** 重试策略(attempts = 含首次的总尝试次数)。 */
export interface CheckinRetryPolicy {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  /** 注入用 sleep(测试替身);缺省真实 setTimeout。 */
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * trae 签到的重试策略(attempts = 含首次的总尝试次数)。
 *
 * ⚠️ **2026-11-10 收紧**(实测结论):`9074「当前参与用户太多」`是上游对
 * **高频请求**的限流反应,不是真的排队 —— 实测连续 12 次 claim 全 9074,
 * 停下来等 45 秒后**一次就成功**。
 *
 * 所以「短间隔猛重试」是**帮倒忙**:4 次 × 1.2s 起步会把限流窗口一直续着。
 * 改成「少打、等久」:
 * - `attempts: 2`(首次 + 1 次重试)—— 2 次拿不到就交给用户稍后再点;
 * - `baseDelayMs: 5000` —— 起步就等 5 秒,让上一次的限流反应先过去;
 * - `maxDelayMs: 20000` —— 上限放宽,不至于在限流里硬撞。
 */
export const DEFAULT_CHECKIN_RETRY = {
  attempts: 2,
  baseDelayMs: 5000,
  maxDelayMs: 20000,
  jitterRatio: 0.3,
} as const;

/** 第 n 次重试的退避毫秒(指数 + 抖动,封顶)。 */
export function checkinBackoffMs(attempt: number, p: CheckinRetryPolicy = {}): number {
  const base = p.baseDelayMs ?? DEFAULT_CHECKIN_RETRY.baseDelayMs;
  const max = p.maxDelayMs ?? DEFAULT_CHECKIN_RETRY.maxDelayMs;
  const ratio = p.jitterRatio ?? DEFAULT_CHECKIN_RETRY.jitterRatio;
  const step = Math.max(0, attempt);
  const raw = Math.min(max, base * Math.pow(2, step));
  return Math.round(Math.min(max, raw + raw * ratio * Math.random()));
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export interface TraeCheckinAccount {
  /** 该账号在凭据列表中的序号(与 ChannelAccount.index 同源)。 */
  index: number;
  username: string;
  token: string;
  /** 区域(小写);设置且 != "cn" 时直接区域拒绝。 */
  region?: string | null;
  /** 客户端设备标识;缺省时按 token 确定性派生(见 resolve_identity)。 */
  device_id?: string | null;
  /** 凭据原始字段(machine_id/device_id 等覆盖派生)。 */
  extra?: Record<string, unknown>;
}

/** trae 签到请求头:Nexus 用 `Cloud-IDE-JWT`,不是 Bearer。 */
export function traeCheckinHeaders(token: string, device_id?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Cloud-IDE-JWT ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
    Origin: "https://www.trae.cn",
    Referer: "https://www.trae.cn/",
  };
  // 缺 device_id 时**不发** x-device-id 头(缺失 ≠ 空串;Nexus 同样只在校验通过后发)。
  if (device_id && device_id.length > 0) {
    headers["x-device-id"] = device_id;
  }
  return headers;
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}

export interface TraeStatus {
  checked_in: boolean;
  credits: number;
  enable: boolean;
  did_checked_in: boolean;
  extra_credits: number | null;
  code: number | null;
  message: string;
}

/** trae status 应答是**扁平**结构(checked_in/credits/code 在顶层,无 data 包裹)。 */
export function parseTraeStatus(payload: unknown): TraeStatus {
  if (typeof payload !== "object" || payload === null) {
    return {
      checked_in: false,
      credits: 0,
      enable: true,
      did_checked_in: false,
      extra_credits: null,
      code: null,
      message: "",
    };
  }
  const p = payload as Record<string, unknown>;
  return {
    checked_in: p["checked_in"] === true,
    credits: isNumber(p["credits"]) ? p["credits"] : 0,
    enable: p["enable"] !== false,
    did_checked_in: p["did_checked_in"] === true,
    extra_credits: isNumber(p["extra_credits"]) && p["extra_credits"] > 0 ? p["extra_credits"] : null,
    code: isNumber(p["code"]) ? p["code"] : null,
    message: typeof p["message"] === "string" ? p["message"] : "",
  };
}

export interface TraeClaimParsed {
  claimed: boolean;
  code: number;
  message: string;
}

export function parseTraeClaim(payload: unknown): TraeClaimParsed {
  if (typeof payload !== "object" || payload === null) {
    return { claimed: false, code: -1, message: "claim 应答不是 JSON 对象" };
  }
  const p = payload as Record<string, unknown>;
  const code = isNumber(p["code"]) ? p["code"] : -1;
  return {
    claimed: code === 0,
    code,
    message: typeof p["message"] === "string" ? p["message"].slice(0, 200) : "",
  };
}

// ---------------------------------------------------------------------------
// 通用 POST(带注入 fetch 与超时;网络失败包装为 CheckinError)
// ---------------------------------------------------------------------------

export interface CheckinHttpOptions {
  /** 签到计费端点基址;缺省随渠道取国内版默认值。 */
  baseUrl?: string;
  /** 注入用 fetch(测试替身);缺省 globalThis.fetch。 */
  fetchFn?: typeof fetch;
  /** 超时毫秒;渠道缺省 trae 15s / workbuddy 30s。 */
  timeoutMs?: number;
}

interface RawResponse {
  status: number;
  text: string;
}

async function rawPost(
  fetchFn: typeof fetch,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<RawResponse> {
  let resp: Response;
  try {
    resp = await fetchFn(url, {
      method: "POST",
      headers,
      body: "{}",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new CheckinError(`签到请求超时(${timeoutMs}ms)`);
    }
    throw new CheckinError(`签到请求失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  let text: string;
  try {
    text = await resp.text();
  } catch (err) {
    throw new CheckinError(`签到应答读取失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { status: resp.status, text };
}

// ---------------------------------------------------------------------------
// trae 签到
// ---------------------------------------------------------------------------

/** 区域门禁:区域已设置且 != "cn" → 直接拒绝,零请求。 */
export function requireCNCheckinAccount(account: { region?: string | null }, action = "签到"): void {
  const region = (account.region ?? "").toString().trim().toLowerCase();
  if (region && region !== "cn") {
    throw new CheckinRegionError(
      `${action}:国际版(区域 ${region})没有签到功能 —— 国际版是订阅制,额度走 payStatus 接口。`,
    );
  }
}

/**
 * trae 签到用 device_id:**一律按 token 确定性派生**(2026-11-09 用户实测定案)。
 *
 * ⚠️ 不能沿用 raw 里的真机指纹:同机 storage.json 的 device_id 对所有账号相同,
 * 上游按**设备**粒度放行每日签到 —— 多账号同机时只有第一个能签(9095 本设备已签)。
 * 每个账号用自己 token 派生的**独立**指纹 → 上游视为不同设备 → 各自可签。
 *
 * 为什么不会重复领:签到是**账号级**幂等 —— 实测同一账号换设备指纹查 status,
 * `checked_in` 恒一致(已签的 accounts 返回 already),`did_checked_in` 只是
 * 设备维度提示,不参与「是否该领」。所以派生指纹对已签账号同样短路,不产生额外领取。
 */
/**
 * trae 签到用 device_id:**优先真机指纹,缺省按 token 派生**(2026-11-10 修正)。
 *
 * ## 为什么改回真机指纹优先
 *
 * 2026-11-09 我一度让它**一律按 token 派生**,理由是「同机多账号共享真机指纹
 * 会被上游当成同一设备、只能签一个」。当时看到的是 9074(人多),误以为派生
 * 指纹能绕过设备限制。
 *
 * **2026-11-10 实测推翻了那个判断**:
 * - 真机指纹 → 上游返回 **9095「当前设备今日已经签到,请明日再来哦～」**
 *   —— 语义**准确**:这台机器今天签过了;
 * - 派生指纹 → 上游返回 **9074「当前参与用户太多」**
 *   —— 语义**误导**:它其实是「陌生设备」被限流的伪装,不是真的排队。
 *
 * 也就是说:**单台机器一天只能签 1 个 trae 账号,这是上游按设备的硬限制,
 * 派生指纹绕不过去,只会把失败原因伪装成「人多」。**
 *
 * 用真机指纹的好处是**失败原因可读**:用户看到 9095 就知道「这台机器今天签过
 * 另一个号了」,而不是反复重试一个永远签不上的 9074。
 *
 * ## 顺序
 *
 * 1. `account.extra.device_id`(凭据 raw 里的真机指纹,同机多账号相同);
 * 2. `account.device_id`(调用方显式给的);
 * 3. 兜底:按 token 确定性派生(没有真机指纹时的最后手段)。
 */
export function resolveTraeDevice(account: TraeCheckinAccount): string {
  const fromExtra = account.extra?.["device_id"];
  if (typeof fromExtra === "string" && fromExtra.trim() !== "") return fromExtra.trim();
  const explicit = account.device_id;
  if (typeof explicit === "string" && explicit.trim() !== "") return explicit.trim();
  return resolve_identity(account.token, {}).device_id;
}

export type TraeCheckinOptions = CheckinHttpOptions;

export async function traeCheckinStatus(account: TraeCheckinAccount, opts: TraeCheckinOptions = {}): Promise<TraeStatus> {
  requireCNCheckinAccount(account, "签到状态");
  const deviceId = resolveTraeDevice(account);
  const base = (opts.baseUrl ?? TRAE_PAY_BASE_CN).replace(/\/+$/, "");
  const url = `${base}${TRAE_CHECKIN_STATUS_PATH}`;
  const r = await rawPost(
    opts.fetchFn ?? fetch,
    url,
    traeCheckinHeaders(account.token, deviceId),
    opts.timeoutMs ?? TRAE_CHECKIN_TIMEOUT_MS,
  );
  if (r.status < 200 || r.status >= 300) {
    throw new CheckinError(`trae 签到端点 ${TRAE_CHECKIN_STATUS_PATH} 返回 HTTP ${r.status}: ${r.text.slice(0, 300)}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(r.text);
  } catch (err) {
    throw new CheckinError(`trae 签到应答不是合法 JSON:${err instanceof Error ? err.message : String(err)}`);
  }
  return parseTraeStatus(payload);
}

export interface TraeClaimOptions extends CheckinHttpOptions {
  /** true 才会发领取请求;false 恒为干跑(零写请求)。 */
  confirm: boolean;
  /**
   * 瞬时失败重试策略(签到高峰上游会回「当前参与用户太多,请稍后再试」)。
   * 传 `null` 可显式关闭重试;缺省 {@link DEFAULT_CHECKIN_RETRY}。
   */
  retry?: CheckinRetryPolicy | null;
}

export interface TraeClaimResult {
  provider: "trae";
  username: string;
  index: number;
  claimed: boolean;
  enabled: boolean;
  would_claim: boolean;
  already_checked_in?: boolean;
  device_checked_in?: boolean;
  code: number | null;
  message: string;
  checkin: TraeStatus;
  /** 领取请求实际发出的次数(含首次);1 = 一次就成。 */
  attempts: number;
  /** 因瞬时失败而重试的次数。 */
  retries: number;
}

/**
 * trae 领取:status 短路(未启用/今日已签/本设备已签/干跑),confirm=true 才 POST claim。
 * 领取成功后再 best-effort 重查一次 status(失败不影响成功,保留旧值)。
 */
export async function traeCheckinClaim(
  account: TraeCheckinAccount,
  opts: TraeClaimOptions,
): Promise<TraeClaimResult> {
  const confirm = opts.confirm === true;
  requireCNCheckinAccount(account, "签到");
  const status = await traeCheckinStatus(account, opts);
  const base = { provider: "trae" as const, username: account.username, index: account.index };
  /**
   * 结果装配:attempts/retries 默认 0(分支短路时一次写请求都没发),
   * 走完 claim 的分支显式覆盖成真实次数。
   */
  const settled = (
    over: Pick<TraeClaimResult, "claimed" | "enabled" | "would_claim" | "code" | "message" | "checkin"> &
      Partial<TraeClaimResult>,
  ): TraeClaimResult => ({ attempts: 0, retries: 0, ...base, ...over });
  if (status.enable === false) {
    return settled({ claimed: false, enabled: false, would_claim: false, code: null, message: "该账号未启用签到", checkin: status });
  }
  if (status.checked_in) {
    return settled({ claimed: false, enabled: true, would_claim: false, already_checked_in: true, code: null, message: "今日已签到", checkin: status });
  }
  if (status.did_checked_in) {
    return settled({
      claimed: false,
      enabled: true,
      would_claim: false,
      device_checked_in: true,
      code: TRAE_CODE_DEVICE_ALREADY,
      // ⚠️ 文案要说清**这是设备级限制**(2026-11-10 实测):上游按设备放行每日签到,
      // 同一台机器上多账号时只有第一个能签,其余一律 9095。
      // 写成「本设备今日已签」+ 原因,用户才知道该等明天、而不是反复重试。
      message:
        `本设备今日已签到(上游 code ${TRAE_CODE_DEVICE_ALREADY})` +
        " —— trae 按**设备**放行每日签到:同一台机器上的多个账号,一天只有第一个能签上",
      checkin: status,
    });
  }
  if (!confirm) {
    return settled({ claimed: false, enabled: true, would_claim: true, code: null, message: "今日可签到;需显式确认(confirm=True)才会领取", checkin: status });
  }

  // confirm=true → POST claim(瞬时失败带退避重试)
  const deviceId = resolveTraeDevice(account);
  const baseUrl = (opts.baseUrl ?? TRAE_PAY_BASE_CN).replace(/\/+$/, "");
  const claimUrl = `${baseUrl}${TRAE_CHECKIN_CLAIM_PATH}`;
  const policy: CheckinRetryPolicy | null =
    opts.retry === null ? null : (opts.retry ?? DEFAULT_CHECKIN_RETRY);
  const maxAttempts = policy === null
    ? 1
    : Math.max(1, Math.trunc(policy.attempts ?? DEFAULT_CHECKIN_RETRY.attempts));
  const sleep = policy?.sleepFn ?? defaultSleep;

  /** 一次 claim:成功/业务拒绝都返回 parsed,传输层失败抛 CheckinError。 */
  const postClaim = async (): Promise<TraeClaimParsed> => {
    const r = await rawPost(
      opts.fetchFn ?? fetch,
      claimUrl,
      traeCheckinHeaders(account.token, deviceId),
      opts.timeoutMs ?? TRAE_CHECKIN_TIMEOUT_MS,
    );
    if (r.status < 200 || r.status >= 300) {
      throw new CheckinError(`trae 签到端点 ${TRAE_CHECKIN_CLAIM_PATH} 返回 HTTP ${r.status}: ${r.text.slice(0, 300)}`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(r.text);
    } catch (err) {
      throw new CheckinError(`trae 签到应答不是合法 JSON:${err instanceof Error ? err.message : String(err)}`);
    }
    return parseTraeClaim(payload);
  };

  let parsed: TraeClaimParsed | null = null;
  let lastError: unknown = null;
  let tries = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(checkinBackoffMs(attempt - 1, policy ?? undefined));
      tries += 1;
    }
    try {
      parsed = await postClaim();
    } catch (err) {
      lastError = err;
      if (!(err instanceof CheckinError) || !isTransientCheckinError(err)) break;
      continue;
    }
    lastError = null;
    if (parsed.claimed) break;
    // 业务拒绝:只对「拥挤/稍后再试」类重试,确定性拒绝(9004/9095 等)不重试。
    if (!isRetryableCheckinFailure(parsed.message, parsed.code)) break;
  }

  if (parsed === null) {
    throw lastError instanceof Error ? lastError : new CheckinError(String(lastError ?? "trae 领取失败"));
  }
  const attemptsMade = tries + 1;
  if (!parsed.claimed) {
    const retried = tries > 0 ? `(已重试 ${tries} 次仍失败)` : "";
    return settled({
      claimed: false,
      enabled: true,
      would_claim: false,
      code: parsed.code,
      message: `${parsed.message || "上游拒绝领取"}${retried}`,
      checkin: status,
      attempts: attemptsMade,
      retries: tries,
    });
  }

  // 领取成功 → best-effort 重查状态(失败不影响成功)
  let fresh: TraeStatus = status;
  try {
    fresh = await traeCheckinStatus(account, opts);
  } catch {
    /* 保留旧 status */
  }
  const got = fresh.credits > 0 ? `领取成功,当前积分 ${fresh.credits}` : "领取成功";
  return settled({
    claimed: true,
    enabled: true,
    would_claim: false,
    code: 0,
    message: parsed.message || got,
    checkin: fresh,
    attempts: attemptsMade,
    retries: tries,
  });
}

// ---------------------------------------------------------------------------
// workbuddy
// ---------------------------------------------------------------------------

export const WB_CN_BILLING_BASE = "https://www.codebuddy.cn";
export const WB_CHECKIN_STATUS_PATH = "/v2/billing/meter/checkin-activity-status";
export const WB_CHECKIN_CLAIM_PATH = "/v2/billing/meter/daily-checkin";
export const WB_GLOBAL_BASE = "https://www.workbuddy.ai";
export const WB_GLOBAL_BASE_CODEBUDDY = "https://www.codebuddy.ai";
export const WB_CHECKIN_TIMEOUT_MS = 30_000;

const GLOBAL_DOMAINS = ["workbuddy.ai", "codebuddy.ai"];

export type WbRegion = "cn" | "global";

/** 由 domain 判区域:Nexus 同款(剥 www.;精确/后缀命中全球域名 → global)。 */
export function wbRegionOf(domain?: string | null): WbRegion {
  let d = (domain ?? "").toString().trim().toLowerCase();
  if (d.startsWith("www.")) d = d.slice(4);
  if (GLOBAL_DOMAINS.some((g) => d === g || d.endsWith(`.${g}`))) return "global";
  return "cn";
}

/** 计费端点基址:全球域名 → codebuddy.ai(域名含之)否则 workbuddy.ai;其余 → codebuddy.cn。 */
export function wbBillingBase(domain?: string | null): string {
  if (wbRegionOf(domain) === "global") {
    const d = (domain ?? "").toString().toLowerCase();
    return d.includes("codebuddy.ai") ? WB_GLOBAL_BASE_CODEBUDDY : WB_GLOBAL_BASE;
  }
  return WB_CN_BILLING_BASE;
}

export function wbCheckinHeaders(
  token: string,
  uid?: string | null,
  domain?: string | null,
  enterpriseId?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (uid && uid.length > 0) headers["X-User-Id"] = uid;
  if (enterpriseId && enterpriseId.length > 0) {
    headers["X-Enterprise-Id"] = enterpriseId;
    headers["X-Tenant-Id"] = enterpriseId;
  }
  if (domain && domain.length > 0) headers["X-Domain"] = domain;
  return headers;
}

export interface WbCheckinAccount {
  index: number;
  username: string;
  /** 可为空(无令牌时 wbClaim 抛凭据错,由装配层先短路)。 */
  token: string | null;
  domain?: string | null;
  uid?: string | null;
  enterprise_id?: string | null;
}

function num(v: unknown): number {
  return isNumber(v) ? v : 0;
}

async function wbPost(
  opts: WbCheckinOptions,
  path: string,
  account: WbCheckinAccount,
): Promise<Record<string, unknown>> {
  const base = (opts.baseUrl ?? wbBillingBase(account.domain)).replace(/\/+$/, "");
  const url = `${base}${path}`;
  const r = await rawPost(
    opts.fetchFn ?? fetch,
    url,
    wbCheckinHeaders(account.token ?? "", account.uid, account.domain, account.enterprise_id),
    opts.timeoutMs ?? WB_CHECKIN_TIMEOUT_MS,
  );
  if (r.status < 200 || r.status >= 300) {
    throw new CheckinError(`workbuddy 签到端点返回 HTTP ${r.status}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(r.text);
  } catch {
    throw new CheckinError("workbuddy 签到应答不是合法 JSON");
  }
  if (typeof payload !== "object" || payload === null) {
    throw new CheckinError("workbuddy 签到应答不是对象");
  }
  const envelope = payload as Record<string, unknown>;
  // code 缺失/非数字/非 0 一律业务失败(Nexus:code != 0 → 失败)
  if (!(isNumber(envelope["code"]) && envelope["code"] === 0)) {
    const code = isNumber(envelope["code"]) ? envelope["code"] : null;
    const message =
      (typeof envelope["message"] === "string" && envelope["message"].length > 0 ? envelope["message"] : "") ||
      (typeof envelope["msg"] === "string" && envelope["msg"].length > 0 ? envelope["msg"] : "");
    throw new CheckinError(`workbuddy 业务失败 code=${code === null ? "None" : code}: ${message}`);
  }
  const data = envelope["data"];
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
}

export type WbCheckinOptions = CheckinHttpOptions;

export interface WbStatus {
  active: boolean;
  today_checked_in: boolean;
  streak_days: number;
  daily_credit: number;
  today_credit: number;
  is_streak_day: boolean;
  claim_button_text: string | null;
}

/** workbuddy 签到状态:仅国内版(global 直接区域拒绝,零请求)。 */
export async function wbCheckinStatus(account: WbCheckinAccount, opts: WbCheckinOptions = {}): Promise<WbStatus> {
  if (wbRegionOf(account.domain) !== "cn") {
    throw new CheckinRegionError("国际版无签到(订阅制,额度走 payStatus)");
  }
  const data = await wbPost(opts, WB_CHECKIN_STATUS_PATH, account);
  return {
    active: data["active"] === true,
    today_checked_in: data["today_checked_in"] === true,
    streak_days: num(data["streak_days"]),
    daily_credit: num(data["daily_credit"]),
    today_credit: num(data["today_credit"]),
    is_streak_day: data["is_streak_day"] === true,
    claim_button_text:
      typeof data["claim_button_text"] === "string" && data["claim_button_text"].length > 0
        ? data["claim_button_text"]
        : null,
  };
}

export interface WbClaimResult {
  credit: number;
  streak_days: number;
  is_streak_day: boolean;
}

/**
 * workbuddy 领取:先查状态再 POST claim(与 Nexus 一致;未启用/今日已签的短路
 * 在装配层统一循环里做,Nexus 同样如此)。
 */
export async function wbCheckinClaim(account: WbCheckinAccount, opts: WbCheckinOptions = {}): Promise<WbClaimResult> {
  if (!account.token) {
    throw new CheckinCredentialError("该账号没有可用令牌");
  }
  if (wbRegionOf(account.domain) !== "cn") {
    throw new CheckinRegionError("国际版无签到(订阅制,额度走 payStatus)");
  }
  await wbCheckinStatus(account, opts);
  const data = await wbPost(opts, WB_CHECKIN_CLAIM_PATH, account);
  return {
    credit: num(data["credit"]),
    streak_days: num(data["streak_days"]),
    is_streak_day: data["is_streak_day"] === true,
  };
}