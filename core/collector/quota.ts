/**
 * 渠道额度探针 —— 与 Nexus `nexus/collector/trae.py` / `workbuddy.py` 对齐
 * (以及 `collector/base.py` 的 `number_of` / `to_epoch_seconds` / `precise_number`)。
 *
 * 支持渠道:
 *   - trae      国内版(cn):`POST /trae/api/v2/pay/web_user_ent_usage`,读
 *               `usage_summary` 权威口径 + 还有余额的包的最早到期;
 *               国际版: `POST /trae/api/v1/pay/ide_user_pay_status`,读 trial。
 *   - workbuddy `POST /v2/billing/meter/get-user-resource`(cn = www.codebuddy.cn /
 *               global = www.workbuddy.ai),月周期包(CapacityType==4)与一次性包分开计。
 *   - minimax   国内版:余额读 `POST /matrix/api/v1/commerce/get_membership_info`
 *               (`op_credit_summary.total_remaining_amount`,字符串浮点);
 *               「最早到期」读 `GET /minimax-cloud/api/v1/credit/details` 的发放
 *               明细 —— 签到接口的成功回执不算到账证据,发放记录才是。
 *
 * 两条业务口径(2026-10-06 Nexsus 实测定案,不可改):
 *   1. 「最近到期 = 还有余额的包里最早的那个」—— 已用光/免费包不参与,一个都不剩
 *      返回 None(未知),绝不回落到「所有包里最早的那个」;
 *   2. 余量优先取 `*Precise` 字符串(实测 CapacityRemainPrecise='41.02000309' 而
 *      CapacityRemain=41,只读数字字段会把小数整体丢掉)。
 *
 * 与 Nexus 的刻意差异(顶部声明):
 *   - 网络级失败统一包装为 QuotaError(含请求失败/超时/非 JSON),不伪造成功 ——
 *     与 As One checkin.ts 的包装约定一致;
 *   - trae 的鉴权失败是 **HTTP 200 + body.code 1001**(不是 401)。以前按成功
 *     解析 → 额度页摆「0 / 0」而 error 为空;2026-10-22 实测用户重登 Trae
 *     客户端后旧会话被上游整体吊销,就是这个形态,故显式抛 QuotaError
 *     「认证失败(code 1001)」,让调用方能区分「该重新登录」与「网络抖动」;
 *   - 不做后台采集循环:额度按需拉取,冷却闸门在装配层(syncChannel force / 页面临近),
 *     本文件只提供纯函数 + 单账号探针。
 */

import { randomBytes } from "node:crypto";
import { build_headers, resolve_identity } from "../connectors/trae.js";
import { build_chat_headers, derive_id, jwt_claim } from "../connectors/workbuddy.js";
import {
  earliestGrantExpiry,
  type MinimaxCreditGrant,
} from "../connectors/minimax-wire.js";
import {
  minimaxAccountOf,
  minimaxCredit,
  minimaxCreditGrants,
  type MinimaxAccount,
} from "../connectors/minimax-signin.js";

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

export class QuotaError extends Error {
  readonly kind: string = "quota";
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}

// ---------------------------------------------------------------------------
// 数值/时间纯函数(Nexus collector/base.py)
// ---------------------------------------------------------------------------

/** JSON 数值字段 → number | null。bool 不算数值(True 不是 1 额度)。 */
export function number_of(value: unknown): number | null {
  if (typeof value === "boolean" || value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * 上游时间字段 → epoch 秒。实测 workbuddy 的 ExpiredTime/CycleEndTime 是毫秒、
 * trae 的 end_time 同样是毫秒;分界用经验阈值 1e11(10 位 = 秒,13 位 = 毫秒)。
 * 字符串先按数值试,再按 ISO-8601 试(无时区按本地时间)。
 */
export function to_epoch_seconds(value: unknown): number | null {
  const num = number_of(value);
  if (num !== null) {
    if (num >= 1e11) return Math.round(num / 1000);
    return Math.round(num);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return Math.round(d.getTime() / 1000);
  }
  return null;
}

/** 余量取值:优先 `*Precise` 字符串,回退数字字段;解析不到 0.0。 */
export function precise_number(raw: Record<string, unknown> | null | undefined, preciseKey: string, numberKey: string): number {
  for (const key of [preciseKey, numberKey]) {
    const v = number_of(raw?.[key]);
    if (v !== null) return Math.max(0, v);
  }
  return 0.0;
}

// ---------------------------------------------------------------------------
// 共享形状
// ---------------------------------------------------------------------------

export interface QuotaAccountInput {
  /** `provider/username` 唯一身份(与 Nexus `credential_key` 同构)。 */
  credentialKey: string;
  provider: string;
  username: string;
  token: string;
  /** 区域(cn / global);缺省时 trae 按 cn、workbuddy 按 token 推断。 */
  region?: string | null;
  /** workbuddy 用(桌面端身分头);缺省按 token `sub` 推断。 */
  uid?: string | null;
  /** workbuddy 企业账号用;缺省不发送。 */
  enterprise_id?: string | null;
  /** 凭据 raw 的其他字段(machine_id/device_id 等 trae 身份覆盖)。 */
  extras?: Record<string, unknown>;
}

export interface QuotaPack {
  name: string;
  /** 总额;免费包/无额度字段为 null。 */
  limit: number | null;
  used: number | null;
  remain: number | null;
  /** epoch 秒;未知为 null。 */
  expires_at: number | null;
  /** 是否参与「最近到期」判定。 */
  counts_for_expiry: boolean;
  /** 补充字段(workbuddy 的 monthly / refresh_at 等)。 */
  extra?: Record<string, unknown>;
}

/** 单个凭据的额度快照 —— 纯内存,不入库(与 Nexus D17 一致)。 */
export interface QuotaSnapshot {
  credentialKey: string;
  /** 剩余额度。null = 未知(不是 0!);0 = 确实用光。 */
  remaining: number | null;
  /** 总额;跨周期总额无意义时为 null(workbuddy 即如此)。 */
  limit: number | null;
  /** 积分到期时刻(epoch 秒);null/0 = 未知 —— 宁可未知也不虚报。 */
  expires_at: number | null;
  /** epoch 秒。 */
  fetched_at: number;
  packs: QuotaPack[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// trae
// ---------------------------------------------------------------------------

export const TRAE_PAY_BASE = "https://api.trae.cn";
export const TRAE_USAGE_PATH = "/trae/api/v2/pay/web_user_ent_usage";
export const TRAE_PAY_STATUS_PATH = "/trae/api/v1/pay/ide_user_pay_status";
export const TRAE_QUOTA_TIMEOUT_MS = 15_000;
const TRAE_ORIGIN = "https://www.trae.cn";

/**
 * 「还有余额的包里最早的那个」到期时刻 + 归一化包列表(trae 三探针共用)。
 * 免费包/无额度字段/已用光 → 不参与到期判定;一个都不剩 → null(未知,绝不假报)。
 */
export function earliest_expiry(
  packs: unknown,
): { expires_at: number | null; packs: QuotaPack[] } {
  const out: QuotaPack[] = [];
  let best: number | null = null;
  const list = Array.isArray(packs) ? packs : [];
  for (const pack of list) {
    if (typeof pack !== "object" || pack === null) continue;
    const p = pack as Record<string, unknown>;
    const base = (p["entitlement_base_info"] ?? {}) as Record<string, unknown>;
    const quota = (base["quota"] ?? {}) as Record<string, unknown>;
    const usage = (p["usage"] ?? {}) as Record<string, unknown>;
    const end_s = to_epoch_seconds(base["end_time"]);
    const limit = number_of(quota["credits_limit"]);
    const used = number_of(usage["credits_amount"]) ?? 0.0;
    const name =
      typeof base["name"] === "string" && base["name"] !== ""
        ? base["name"]
        : typeof p["display_desc"] === "string"
          ? String(p["display_desc"])
          : "(未命名)";
    // 免费包 / 无额度字段:本来就不消耗积分 → 整包排除
    if (limit === null || limit <= 0) continue;
    const remain = Math.max(0.0, limit - used);
    const counts = remain > 0; // ← 只有还有余额的包才算「最近到期」
    if (counts && end_s !== null && end_s > 0) {
      if (best === null || end_s < best) best = end_s;
    }
    out.push({
      name,
      limit: Math.round(limit * 10000) / 10000,
      used: Math.round(used * 10000) / 10000,
      remain: Math.round(remain * 10000) / 10000,
      expires_at: end_s,
      counts_for_expiry: counts,
    });
  }
  return { expires_at: best, packs: out };
}

/**
 * trae CN 口径:usage_summary 权威 + 还有余额的包的最早到期。
 * `remaining` 由 usage_summary.total_amount − consumed_amount 给出
 * (consumed 缺失按 0 处理,不是把额度清零);usage_summary 缺失时回退 Σ(包额度−包消耗)。
 */
export function parse_trae_usage(data: Record<string, unknown>, credentialKey: string, fetched_at: number): QuotaSnapshot {
  const packsRaw = data["user_entitlement_pack_list"];
  const summary = (data["usage_summary"] ?? {}) as Record<string, unknown>;
  const total = number_of(summary["total_amount"]);
  const consumed = number_of(summary["consumed_amount"]);
  const { expires_at, packs } = earliest_expiry(packsRaw);

  let remaining: number | null = null;
  let limit: number | null = null;
  if (total !== null) {
    limit = Math.round(total);
    const spent = consumed !== null ? consumed : 0.0;
    remaining = Math.round(Math.max(0.0, total - spent));
  }
  if (remaining === null) {
    // usage_summary 缺失 → 回退 Σ(包额度 − 包消耗)
    let fallback_limit = 0.0;
    let fallback_left = 0.0;
    for (const p of packs) {
      fallback_limit += p.limit ?? 0.0;
      fallback_left += p.remain ?? 0.0;
    }
    if (fallback_limit > 0) {
      remaining = Math.round(fallback_left);
      limit = Math.round(fallback_limit);
    }
  }
  return {
    credentialKey,
    remaining,
    limit,
    expires_at,
    fetched_at,
    packs,
    error: null,
  };
}

/**
 * trae 国际口径:无积分包,只有试用/订阅到期。
 * remaining 给 null(未知)而不是 0 —— 0 会让面板显示「余额 0」,看着像用光了。
 */
export function parse_trae_pay_status(data: Record<string, unknown>, credentialKey: string, fetched_at: number): QuotaSnapshot {
  const trial = (data["trial_status"] ?? {}) as Record<string, unknown>;
  const expires_s = to_epoch_seconds(trial["trial_end_time"]);
  const expires_at = expires_s !== null && expires_s > 0 ? expires_s : null;
  const status = typeof trial["trial_status"] === "string"
    ? trial["trial_status"]
    : typeof data["status"] === "string"
      ? String(data["status"])
      : "";
  return {
    credentialKey,
    remaining: null,
    limit: null,
    expires_at,
    fetched_at,
    packs: [{
      name: "订阅试用",
      limit: null,
      used: null,
      remain: null,
      expires_at,
      counts_for_expiry: false,
      extra: { kind: "trial", status },
    }],
    error: null,
  };
}

/** trae 计费头:连接器 build_headers + Origin/Referer = www.trae.cn(缺了会被判跨站)。 */
export function traeQuotaHeaders(token: string, extras: Record<string, unknown> | undefined): Record<string, string> {
  const identity = resolve_identity(token, extras ?? {});
  const requestId = randomBytes(16).toString("hex");
  const headers = build_headers(token, identity, requestId);
  headers["Origin"] = TRAE_ORIGIN;
  headers["Referer"] = `${TRAE_ORIGIN}/`;
  headers["Accept"] = "application/json";
  return headers;
}

export interface TraeQuotaOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** trae 单账号额度探针:CN 走 usage,非 CN 走 pay_status。失败抛 QuotaError。 */
export async function probe_trae_quota(account: QuotaAccountInput, opts: TraeQuotaOptions = {}): Promise<QuotaSnapshot> {
  const region = (account.region ?? "cn").toString().trim().toLowerCase();
  const base = (opts.baseUrl ?? TRAE_PAY_BASE).replace(/\/+$/, "");
  const path = region === "cn" ? TRAE_USAGE_PATH : TRAE_PAY_STATUS_PATH;
  const url = `${base}${path}`;
  const body = region === "cn" ? JSON.stringify({ require_usage: true }) : "{}";
  const timeoutMs = opts.timeoutMs ?? TRAE_QUOTA_TIMEOUT_MS;
  const fetchFn = opts.fetchFn ?? fetch;

  let resp: Response;
  try {
    resp = await fetchFn(url, {
      method: "POST",
      headers: traeQuotaHeaders(account.token, account.extras),
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new QuotaError(`trae 额度查询超时(${timeoutMs}ms)`);
    }
    throw new QuotaError(`trae 额度查询连接失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  let text: string;
  try {
    text = await resp.text();
  } catch (err) {
    throw new QuotaError(`trae 额度响应读取失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (resp.status >= 400) {
    throw new QuotaError(`trae 计费接口 HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  // trae 的鉴权失败是 200 响应体里的 code 1001(HTTP 层不报 401)。
  // 以前这里直接当成成功解析,额度页就摆出「0 / 0」+ 一句空 error;
  // 2026-10-22 实测:用户重登 Trae 客户端后旧会话被吊销,就是这个形态。
  // 现在显式抛 QuotaError,调用方(面板/自动采纳自检)能区分「认证失败」
  // 与「网络抖动」,前者必须提示重新登录。
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new QuotaError(`trae 额度响应不是 JSON(HTTP ${resp.status}): ${text.replace(/[^\x20-\x7e\u4e00-\u9fff\n]/g, "?").slice(0, 120)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new QuotaError("trae 额度响应不是对象");
  }
  const authCode = number_of((parsed as Record<string, unknown>)["code"]);
  if (authCode === 1001) {
    const msg = String((parsed as Record<string, unknown>)["message"] ?? "").slice(0, 200);
    throw new QuotaError(`trae 计费接口认证失败(code 1001): ${msg || "authenticate you"}`);
  }
  const fetched_at = Math.floor(Date.now() / 1000);
  if (region === "cn") {
    return parse_trae_usage(parsed as Record<string, unknown>, account.credentialKey, fetched_at);
  }
  return parse_trae_pay_status(parsed as Record<string, unknown>, account.credentialKey, fetched_at);
}

// ---------------------------------------------------------------------------
// workbuddy
// ---------------------------------------------------------------------------

/** 计费主机与聊天主机不是同一个(cn 聊天 copilot.tencent.com,计费 www.codebuddy.cn)。 */
export const WORKBUDDY_BILLING_BASES: Record<string, string> = {
  cn: "https://www.codebuddy.cn",
  global: "https://www.workbuddy.ai",
};
export const WORKBUDDY_RESOURCE_PATH = "/v2/billing/meter/get-user-resource";
/** 月周期包的 CapacityType(dsh fetchCredits: monthly = CapacityType === 4)。 */
export const WORKBUDDY_MONTHLY_CAPACITY_TYPE = 4;
/** 计费站点实测接受的 UA(与聊天头 UA 不同,显式覆盖)。 */
const WORKBUDDY_BILLING_UA = "CodeBuddy/2.63.2 CLI/2.63.2";
/** 「100 年后」的时间窗上界。 */
const WORKBUDDY_WINDOW_MS = 100 * 365.25 * 86400 * 1000;
export const WORKBUDDY_QUOTA_TIMEOUT_MS = 30_000;

/** dsh 同款时间窗:只看「现在 → 100 年内」的包。 */
export function workbuddy_request_body(now: Date = new Date()): Record<string, unknown> {
  const end = new Date(now.getTime() + WORKBUDDY_WINDOW_MS);
  const fmt = (d: Date): string => {
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  return {
    PageNumber: 1,
    PageSize: 100,
    ProductCode: "p_tcaca",
    Status: [0, 3],
    PackageEndTimeRangeBegin: fmt(now),
    PackageEndTimeRangeEnd: fmt(end),
  };
}

/** `data.data.Response.Data.Accounts` —— 逐层 try,坏数据退化成空列表。 */
function wb_accounts_of(data: Record<string, unknown>): unknown[] {
  try {
    const wrapped = (data["data"] ?? {}) as unknown;
    const response = (wrapped as Record<string, unknown> | null)?.["Response"] as Record<string, unknown> | null | undefined;
    const inner = response?.["Data"] as Record<string, unknown> | null | undefined;
    const accounts = inner?.["Accounts"] as unknown;
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

/**
 * workbuddy 解析(纯函数):月周期包用 CycleCapacity* 计余量、CycleEndTime 是**刷新**
 * 时间不是过期;一次性包用 Capacity* 与 ExpiredTime(空回退 CycleEndTime);
 * 余量 ≤0 或已过期的一次性包整包剔除;最近到期 = 还有余额的包里最早的那个。
 */
export function parse_workbuddy(data: Record<string, unknown>, credentialKey: string, fetched_at: number, now: number = Date.now() / 1000): QuotaSnapshot {
  const accounts = wb_accounts_of(data);
  const now_s = now;
  let total = 0.0;
  let nearest: number | null = null;
  const packs: QuotaPack[] = [];
  for (const acc of accounts) {
    if (typeof acc !== "object" || acc === null) continue;
    const a = acc as Record<string, unknown>;
    const monthly = a["CapacityType"] === WORKBUDDY_MONTHLY_CAPACITY_TYPE;
    let remain: number;
    let size: number | null;
    let expires_s: number | null;
    let refresh_s: number | null;
    if (monthly) {
      remain = precise_number(a, "CycleCapacityRemainPrecise", "CycleCapacityRemain");
      size = precise_number(a, "CycleCapacitySizePrecise", "CycleCapacitySize");
      expires_s = null; // ⚠️ CycleEndTime 是刷新时间,不是到期
      refresh_s = to_epoch_seconds(a["CycleEndTime"]);
    } else {
      remain = precise_number(a, "CapacityRemainPrecise", "CapacityRemain");
      size = precise_number(a, "CapacitySizePrecise", "CapacitySize");
      expires_s = to_epoch_seconds(a["ExpiredTime"]) ?? to_epoch_seconds(a["CycleEndTime"]);
      refresh_s = null;
    }
    // 一次性包:余量 ≤0 或已过期 → 整包剔除(对可用额度零贡献)
    if (!monthly && (remain <= 0 || (expires_s !== null && expires_s <= now_s))) {
      continue;
    }
    total += remain;
    if (expires_s !== null) {
      if (nearest === null || expires_s < nearest) nearest = expires_s;
    }
    packs.push({
      name: typeof a["PackageName"] === "string" && a["PackageName"] !== ""
        ? String(a["PackageName"])
        : "(未命名)",
      limit: size !== null ? Math.round(size * 100) / 100 : null,
      used: null,
      remain: Math.round(remain * 100) / 100,
      expires_at: expires_s,
      counts_for_expiry: expires_s !== null,
      extra: {
        monthly,
        refresh_at: refresh_s,
      },
    });
  }
  return {
    credentialKey,
    remaining: Math.round(total),
    limit: null, // 跨周期总额无意义(dsh 只展示余量)
    expires_at: nearest, // 无可用包 → null = 未知,不虚报
    fetched_at,
    packs,
    error: null,
  };
}

/** workbuddy 计费头:复用连接器身份头,Origin/Referer/UA 换成计费站点。 */
export function workbuddyQuotaHeaders(account: QuotaAccountInput, region: string): Record<string, string> {
  const realm = region === "cn" ? "cn" : "global";
  const origin = WORKBUDDY_BILLING_BASES[realm];
  const headers = build_chat_headers(
    account.token,
    realm,
    account.uid ?? undefined,
    undefined,
    account.enterprise_id ?? undefined,
  );
  headers["Origin"] = origin;
  headers["Referer"] = `${origin}/`;
  headers["User-Agent"] = WORKBUDDY_BILLING_UA;
  headers["Accept"] = "application/json";
  // ⚠️ `workbuddy2api-hub` wb_accounts 明确:X-Machine-ID / X-Session-ID 官方对话不带
  // （只用于反馈上报），但**计费路径仍带**。build_chat_headers 已去掉这两个头，
  // 计费路径在此按官方口径补回账号派生值。
  const uid = account.uid || jwt_claim(account.token, "sub") || "anonymous";
  headers["X-Machine-ID"] = derive_id(uid, "machine");
  headers["X-Session-ID"] = derive_id(uid, "session");
  // ⚠️ 2026-11-08(用户转述 hub 最新源码 `wb_accounts.Account.headers` billing 分支):
  // **无企业归属**的账号在**计费路径**上带 `X-No-Enterprise-Id: 1`,企业号带
  // `X-Enterprise-Id` + `X-Tenant-Id`。两处都有出处;漏了前者,上游会把这次计费
  // 请求当「企业目录/配额分支」走错。
  //
  // ⚠️ **对话路径不发这个头**:官方桌面端 chat 的 `build_identity_headers` 里没有
  // 它(hub 只在 billing 与 media 两条分支补),凭空多一个官方不发的头反而更显眼。
  // 所以这里只补计费。
  if (account.enterprise_id) {
    headers["X-Enterprise-Id"] = account.enterprise_id;
    headers["X-Tenant-Id"] = account.enterprise_id;
  } else {
    headers["X-No-Enterprise-Id"] = "1";
  }
  return headers;
}

export interface WorkbuddyQuotaOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** workbuddy 单账号额度探针。区域:显式优先,否则按 token 推断(与连接器同口径)。 */
export async function probe_workbuddy_quota(account: QuotaAccountInput, opts: WorkbuddyQuotaOptions = {}): Promise<QuotaSnapshot> {
  const region = (account.region ?? "").toString().trim().toLowerCase() || detectRegionOfToken(account.token);
  const realm = region === "cn" ? "cn" : "global";
  const base = (opts.baseUrl ?? WORKBUDDY_BILLING_BASES[realm]).replace(/\/+$/, "");
  const url = `${base}${WORKBUDDY_RESOURCE_PATH}`;
  const body = JSON.stringify(workbuddy_request_body());
  const timeoutMs = opts.timeoutMs ?? WORKBUDDY_QUOTA_TIMEOUT_MS;
  const fetchFn = opts.fetchFn ?? fetch;

  let resp: Response;
  try {
    resp = await fetchFn(url, {
      method: "POST",
      headers: workbuddyQuotaHeaders(account, realm),
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new QuotaError(`workbuddy 额度查询超时(${timeoutMs}ms)`);
    }
    throw new QuotaError(`workbuddy 额度查询连接失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  let text: string;
  try {
    text = await resp.text();
  } catch (err) {
    throw new QuotaError(`workbuddy 额度响应读取失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (resp.status >= 400) {
    throw new QuotaError(`workbuddy 计费接口 HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new QuotaError(`workbuddy 额度响应不是 JSON(HTTP ${resp.status}): ${text.replace(/[^\x20-\x7e\u4e00-\u9fff\n]/g, "?").slice(0, 120)}`);
  }
  if (typeof payload !== "object" || payload === null) {
    throw new QuotaError("workbuddy 额度响应不是对象");
  }
  return parse_workbuddy(payload as Record<string, unknown>, account.credentialKey, Math.floor(Date.now() / 1000));
}

/** 从 JWT iss 推断区域(与连接器同口径,避免重复导入循环)。 */
function detectRegionOfToken(token: string): string {
  try {
    const seg = token.split(".")[1] ?? "";
    // ⚠️ 与 connectors/workbuddy 的 _jwt_claims 同一个修(2026-11-08):
    // `(-len) % 4` 在长度非 4 倍数时是**负数**,`"=".repeat(-1)` 抛错 → 静默
    // 判成 global。padding 必须写 `(4 - len % 4) % 4`。
    const padded = seg + "=".repeat((4 - (seg.length % 4)) % 4);
    const claims = JSON.parse(Buffer.from(padded, "base64url").toString("utf-8")) as Record<string, unknown>;
    const iss = String(claims["iss"] ?? "").toLowerCase();
    if (iss.includes("copilot.tencent.com") || iss.includes("codebuddy.cn") || iss.includes("workbuddy.cn")) {
      return "cn";
    }
  } catch {
    /* fallthrough */
  }
  return "global";
}

// ---------------------------------------------------------------------------
// minimax(国内版)
// ---------------------------------------------------------------------------

export const MINIMAX_QUOTA_TIMEOUT_MS = 30_000;

export interface MinimaxQuotaOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** 是否顺带读发放明细(「最早到期」的唯一来源);缺省 true。 */
  withGrants?: boolean;
  /**
   * 401/403 时的自动续期回调(2026-11-07)。
   *
   * 由调用方注入(它持有凭据库):用 refresh_token 换新 token 并写回库,
   * 返回带新 token 的账号。返回 null = 没有 refresh_token,不重试。
   * 透传给 `minimaxCredit` / `minimaxCreditGrants`。
   */
  onAuthExpired?: (account: MinimaxAccount) => Promise<MinimaxAccount | null>;
}

/**
 * minimax 单账号额度探针。
 *
 * - `remaining` = `op_credit_summary.total_remaining_amount`(余额真源);
 * - `expires_at` = **仍有余额的发放**里最早的 `expires_at`,`packs` 为逐笔发放;
 * - 发放明细读失败不影响余额展示:只把 `expires_at` 留 null(未知),不虚报。
 *
 * 「最早到期」与 trae/workbuddy 同一业务口径:已用光的不参与,一个都不剩 → null。
 */
export async function probe_minimax_quota(
  account: QuotaAccountInput,
  opts: MinimaxQuotaOptions = {},
): Promise<QuotaSnapshot> {
  const raw = account.extras ?? {};
  // ⚠️ 凭据构造**必须走 minimaxAccountOf**(2026-11-07 修 401):
  // 手搓字段时 bearer 只读 raw.bearer,而 bridge 导入的行存的是 kind=oauth、
  // 没有 bearer 字段 —— 于是桌面凭据走了 web JWT 路径(查询串 token=),
  // /matrix/ 计费面只认 Authorization: Bearer,直接 401「鉴权失败」。
  // minimaxAccountOf 里 kind=oauth → bearer=token 的派生是唯一真源。
  const cred: MinimaxAccount = minimaxAccountOf({
    token: account.token,
    region: (account.region ?? "").toString().trim().toLowerCase() || "cn",
    extra: raw,
  });
  if (!cred.uuid || !cred.deviceId) {
    throw new QuotaError("minimax 账号缺少 uuid / device_id,无法构造签名请求");
  }
  if (opts.baseUrl) cred.baseUrl = opts.baseUrl;
  const fetchedAt = Math.floor(Date.now() / 1000);
  const httpOpts = {
    fetchFn: opts.fetchFn,
    timeoutMs: opts.timeoutMs ?? MINIMAX_QUOTA_TIMEOUT_MS,
    // 401 时自动 refresh 续期并重试(2026-11-07):token 寿命数小时,
    // 续期由调用方提供(它持有凭据库),这里只透传。
    onAuthExpired: opts.onAuthExpired,
  };

  const credit = await minimaxCredit(cred, httpOpts);

  let packs: QuotaPack[] = [];
  let expiresAt: number | null = null;
  let grantError: string | null = null;
  if (opts.withGrants !== false) {
    try {
      const grants = await minimaxCreditGrants(cred, httpOpts);
      expiresAt = earliestGrantExpiry(grants);
      packs = grants.map((g, i) => ({
        name: `grant#${i + 1}`,
        limit: g.granted,
        used: Math.max(0, g.granted - g.remaining),
        remain: g.remaining,
        expires_at: g.expiresAt > 0 ? g.expiresAt : null,
        counts_for_expiry: g.remaining > 0 && g.expiresAt > 0,
        extra: { granted_at: g.grantedAt },
      }));
    } catch (err) {
      // 明细失败降级:余额照常展示,只是不知道到期时间。
      grantError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    credentialKey: account.credentialKey,
    remaining: credit.total,
    // minimax 没有「总额」概念(充值/活动发放),与 workbuddy 同口径给 null。
    limit: null,
    expires_at: expiresAt,
    fetched_at: fetchedAt,
    packs,
    error: grantError,
  };
}