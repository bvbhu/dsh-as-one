/**
 * SenseNova 配额与限流口径 —— 从 sensenova.ts 拆出(重构第九刀)。
 *
 * 职责:把上游 429 报文归类(账号级 vs 池级)、把 usage 折算成可计费 token、
 * 解析 pool-usage 的额度池窗口、读 JWT 到期时间。这一层**纯函数**,不碰网络。
 *
 * 零跨组依赖 —— auth / pool / adapter 都可以安全引用它。
 */

/** 默认 API 地址(与 Nexus sensenova.py DEFAULT_BASE_URL 对齐,已含 /v1) */
export const DEFAULT_BASE_URL = "https://token.sensenova.cn/v1";
/** 控制台(platform)基础地址 —— 积分池等控制台接口都挂在它下面。 */
export const PLATFORM_BASE = "https://platform.sensenova.cn";
/** 积分池用量接口(控制台 JWT Bearer;约 3 小时过期的 access token)。 */
export const POOL_USAGE_URL = `${PLATFORM_BASE}/lite/console/v1/tokenplan/pool-usage`;
// ---------------------------------------------------------------------------
// 429 归因
// ---------------------------------------------------------------------------

/** 账号级限流（code=8） */
export const ATTR_RPM = "rpm_exhausted";
/** 池级限流（code=429003） */
export const ATTR_SHARED = "shared_or_transient";
/** 未知归因 */
export const ATTR_UNKNOWN = "unknown";
/** 池饱和 */
export const POOL_SATURATED = "pool_saturated";
/** 池耗尽 */
export const POOL_EXHAUSTED = "pool_exhausted";
/** 共享码正则 */
export const CODE_SHARED_RE = /429003|tpm\/rpm\s+limit/i;
/** 账号级码正则 */
export const CODE_RPM_RE = /code["\s:=]+8\b|rpm\s+exhausted/i;
/**
 * 429 报文 → 归因类别。
 *
 * ⚠️ **共享码必须先判**：`429003` 的报文里同时会出现 `tpm/rpm limit` 与数字码，
 * 顺序反了会把「池满」误判成「这个号没额度」。
 */
export function classify_rate_limit(body: string): string {
  const text = body || "";
  if (CODE_SHARED_RE.test(text)) {
    return ATTR_SHARED;
  }
  if (CODE_RPM_RE.test(text)) {
    return ATTR_RPM;
  }
  return ATTR_UNKNOWN;
}
// ---------------------------------------------------------------------------
// 可计费 token
// ---------------------------------------------------------------------------

/**
 * 上游 usage → 可计费 token（**命中 prompt cache 的 input 不计**）。
 *
 * 与 Nexus `billable_tokens` 对齐。
 */
export function billable_tokens(usage: unknown): number {
  if (!usage || typeof usage !== "object") {
    return 0;
  }
  const u = usage as Record<string, unknown>;
  const prompt = Number(u["prompt_tokens"] ?? 0);
  const details = u["prompt_tokens_details"] as Record<string, unknown> | undefined;
  const cached =
    details && typeof details === "object"
      ? Number(details["cached_tokens"] ?? 0)
      : 0;
  const completion = Number(u["completion_tokens"] ?? 0);
  return Math.max(0, prompt - cached) + completion;
}
/**
 * 归一 sensenova 用户名：`sensenova-xxx` → `xxx`。
 */
export function sensenova_username(name: string): string {
  return name.replace(/^sensenova-/, "");
}
// ---------------------------------------------------------------------------
// 控制台积分池(pool-usage)解析
// ---------------------------------------------------------------------------

/** 单个窗口(5h / 7d)的用量;上游没给该窗口时整体为 null。 */
export interface SensenovaPoolWindow {
  limit: number | null;
  used: number | null;
  remaining: number | null;
  /** 重置时刻(epoch 秒;窗口重置≠过期)。 */
  reset_at: number | null;
}
/** 单个池解析结果(窗口字段可空,「没有数据 ≠ 0」)。 */
export interface SensenovaQuotaPoolParsed {
  /** 机器值(default / dedicated),不是人话名。 */
  pool_type: string | null;
  /** 人话池名(如「通用积分池」);上游缺省回落 pool_type / "(未命名)"。 */
  pool_name: string | null;
  /** 活动固定积分;null = 上游没给,0 = 明确没有(两者不混淆)。 */
  grant_balance: number | null;
  grant_expiry: number | null;
  grant_expiring_balance: number | null;
  w5: SensenovaPoolWindow | null;
  w7: SensenovaPoolWindow | null;
}
/** pool-usage 报文解析结果(镜像 Nexus collector/sensenova.py 的 parse)。 */
export interface SensenovaPoolUsageParsed {
  plan_name: string | null;
  plan_type: string | null;
  pools: SensenovaQuotaPoolParsed[];
  /** 已知发放合计(round);没有已知发放 → null。**只算通用池**。 */
  grant_total: number | null;
  /** 是否至少有一个**通用池**明确给了发放数字(区分「没给」与「为 0」)。 */
  grant_known: boolean;
  /**
   * 总余量 = round((grant_total || 0) + 周窗口余量);都未知 → null。
   *
   * ⚠️ **只统计通用池(default)**,不含专属池(dedicated)。
   * 专属池一般绑定了模型白名单(如「Flash-Lite积分池」只能跑 Flash-Lite),
   * 把它加进来会让这个数字既不等于「能随便用多少」,也不等于任何单池余额
   * —— 用户 2026-11-07 明确要求「不要把通用积分池和专属积分池合并,
   * 因为后者有模型限制,可以只显示前者」。专属池的余额仍在 `pools` 里逐条可见。
   */
  remaining: number | null;
  /** 周窗口上限(>0 才有意义);未知 → null。**只算通用池**。 */
  limit: number | null;
  /**
   * 专属池的已知发放合计;没有专属池或都没给数 → null。
   * 仅用于「按池展示」,绝不并入 `remaining`(见上)。
   */
  dedicated_grant_total: number | null;
  /** 是否至少有一个专属池明确给了发放数字。 */
  dedicated_grant_known: boolean;
}
/** 数字或数字字符串 → number;空/非数字 → null。 */
export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : null;
}
/** 任意数值 → epoch 秒;0 / 未知 → null;毫秒(>=1e11)折成秒。 */
export function toEpochSeconds(value: unknown): number | null {
  const n = numOrNull(value);
  if (n === null) return null;
  if (n === 0) return null;
  return n >= 1e11 ? Math.round(n / 1000) : n;
}
export function intRound(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}
export function windowOf(raw: unknown): SensenovaPoolWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  const limit = numOrNull(w["limit"]);
  const used = numOrNull(w["used"] ?? w["used_tokens"]);
  const givenRemain = numOrNull(w["remaining"] ?? w["remain"]);
  // 上游只给 limit/used 时按「max(0, limit - used)」补余量(collector 同款兜底)。
  const remaining =
    givenRemain !== null ? givenRemain : limit !== null && used !== null ? Math.max(0, limit - used) : null;
  return {
    limit,
    used,
    remaining,
    reset_at: toEpochSeconds(w["reset_at"]),
  };
}
/**
 * 解析积分池报文(纯函数,可测)。
 *
 * `data.pools` 可能是数组或 dict(取 values);每池读 grant_balance /
 * nearest_grant_expiry / nearest_grant_expiring_balance 与 window_5h /
 * window_7d 两个窗口;总余量只取 7d 窗口(5h 是周额度内部短时限流,
 * 相加会高估近一倍),无 7d 时退 5h,再退池级 week_balance/week_limit。
 */
export function parse_pool_usage(data: unknown): SensenovaPoolUsageParsed {
  const root =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const planRaw =
    root["plan"] && typeof root["plan"] === "object"
      ? (root["plan"] as Record<string, unknown>)
      : {};
  const poolsRaw = root["pools"];
  const poolList: unknown[] = Array.isArray(poolsRaw)
    ? poolsRaw
    : poolsRaw && typeof poolsRaw === "object"
      ? Object.values(poolsRaw as Record<string, unknown>)
      : [];

  const pools: SensenovaQuotaPoolParsed[] = [];
  // 通用池(default)的累计量 —— 进 `remaining` / `limit`。
  let grantKnown = false;
  let grantSum = 0;
  let weekLimit = 0;
  let weekRemaining = 0;
  let weekFound = false;
  // 专属池(dedicated)的累计量 —— 只做展示,绝不并入 remaining。
  let dedicatedKnown = false;
  let dedicatedSum = 0;

  for (const item of poolList) {
    if (!item || typeof item !== "object") continue;
    const pool = item as Record<string, unknown>;
    const typeRaw =
      typeof pool["pool_type"] === "string" ? pool["pool_type"].trim() : "";
    const nameRaw =
      typeof pool["name"] === "string" && pool["name"].trim() !== ""
        ? pool["name"].trim()
        : typeRaw !== ""
          ? typeRaw
          : "(未命名)";

    // 专属池(有模型白名单)单独累计,不参与总余量。
    const isDedicated = typeRaw === "dedicated";

    const grant = intRound(numOrNull(pool["grant_balance"]));
    if (grant !== null) {
      if (isDedicated) {
        dedicatedKnown = true;
        dedicatedSum += grant;
      } else {
        grantKnown = true;
        grantSum += grant;
      }
    }
    const w5 = windowOf(pool["window_5h"]);
    const w7 = windowOf(pool["window_7d"]);
    // 周窗口:7d 优先,5h 兜底,再退池级 week_* 字段(collector 同款)。
    // 专属池的周窗口同样不进总余量(它的额度花不出去在通用模型上)。
    const week = w7 ?? w5;
    if (isDedicated) {
      // 专属池只记 pools[],累计量不动。
    } else if (week) {
      if (week.limit !== null) weekLimit += week.limit;
      if (week.remaining !== null) {
        weekRemaining += week.remaining;
        weekFound = true;
      }
    } else {
      const fallbackLimit = numOrNull(pool["week_limit"]);
      const fallbackRemain = numOrNull(pool["week_balance"] ?? pool["week_remaining"]);
      if (fallbackLimit !== null) weekLimit += fallbackLimit;
      if (fallbackRemain !== null) {
        weekRemaining += fallbackRemain;
        weekFound = true;
      }
    }

    pools.push({
      pool_type: typeRaw !== "" ? typeRaw : nameRaw,
      pool_name: nameRaw,
      grant_balance: grant,
      grant_expiry: toEpochSeconds(pool["nearest_grant_expiry"]),
      // 在途发放**不取整**(collector 同款):round(0.53)=1 会凭空造数字。
      grant_expiring_balance: numOrNull(pool["nearest_grant_expiring_balance"]),
      w5,
      w7,
    });
  }

  // grantTotal / remaining / limit 只来自通用池 —— 专属池有模型白名单,
  // 并进来会让「可用余额」既不能随便花、也不等于任何单池余额。
  const grantTotal = grantKnown ? grantSum : null;
  const remaining =
    grantKnown || weekFound
      ? Math.round((grantTotal ?? 0) + weekRemaining)
      : null;
  const limit = weekLimit > 0 ? Math.round(weekLimit) : null;

  return {
    plan_name: typeof planRaw["name"] === "string" ? planRaw["name"] : null,
    plan_type: typeof planRaw["type"] === "string" ? planRaw["type"] : null,
    pools,
    grant_total: grantTotal,
    grant_known: grantKnown,
    remaining,
    limit,
    dedicated_grant_total: dedicatedKnown ? dedicatedSum : null,
    dedicated_grant_known: dedicatedKnown,
  };
}
/**
 * 控制台 JWT 的 exp(epoch 秒);解析不出(坏段/坏 base64/无 exp) → null。
 *
 * 与 collector/sensenova.py 的 _jwt_expired 同一口径:只认标准三段 JWT,
 * 读不出 exp 一律视为「不知道过期」。
 */
export function jwt_expiry_epoch_s(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const exp = (payload as Record<string, unknown>)["exp"];
  const n = Number(exp);
  return Number.isFinite(n) && n > 0 ? n : null;
}
