/**
 * 「额度快照是否还有效」的判定 —— 预热门用它在每个请求前决定要不要重刷。
 *
 * 用户 2026-11-16 定案：**没有有效数据时，先更新再调度**。
 *
 * 「有效」的定义（三条都要满足，任一不满足就算无效）：
 * 1. **至少有一条带到期时间的快照**（`expires_at > 0`）—— due-first 的排序键
 *    就是这个，一条都没有等于「排序键全空」，此时按链序排是错的；
 * 2. 没有过期：最新一条 `fetched_at` 距今不超过 `maxAgeMs`（默认跟随设置项
 *    `external_refresh.interval_hours`，即「外部数据刷新时间」）；
 * 3. 不全是错误：最后一条有数据的快照不是 `error` 态（上游挂了时探针会写
 *    error 快照，那不是「有效数据」）。
 *
 * ⚠️ 这个函数**必须廉价**：每个请求调度前都会调一次，所以只读内存表，
 * 绝不打上游。
 */

/** 判定需要的最小快照形状（与 `chQuotaCache` 的值同形，只取用到的字段）。 */
export interface QuotaFreshnessSnapshot {
  expires_at?: number | null;
  fetched_at?: number | null;
  error?: string | null;
}

export interface QuotaFreshnessInput {
  /** 全部快照（`chQuotaCache` 的 values，或任何同形集合）。 */
  snapshots: Iterable<QuotaFreshnessSnapshot>;
  /** 现在（毫秒）。 */
  now: number;
  /** 快照最大年龄（毫秒）；超过就算过期。 */
  maxAgeMs: number;
}

export interface QuotaFreshness {
  /** 是否有效（true = 不需要重刷）。 */
  fresh: boolean;
  /** 人话原因（fresh=true 时为空串）。 */
  reason: string;
  /** 带到期时间的快照条数。 */
  withExpiry: number;
  /** 快照总数。 */
  total: number;
  /** 最新一条的 fetched_at（毫秒；没有则 null）。 */
  newestAtMs: number | null;
}

/** 判定快照是否还有效。 */
export function evaluateQuotaFreshness(input: QuotaFreshnessInput): QuotaFreshness {
  let total = 0;
  let withExpiry = 0;
  let newestAtMs: number | null = null;
  /** 最新那条快照是不是 error（只有「最新的全部都是 error」才算无效）。 */
  let newestIsError = false;
  let newestErrorAtMs: number | null = null;

  for (const snap of input.snapshots) {
    if (!snap || typeof snap !== "object") continue;
    total += 1;
    const exp = snap.expires_at;
    if (typeof exp === "number" && exp > 0) withExpiry += 1;
    const at = snap.fetched_at;
    if (typeof at === "number" && at > 0) {
      if (newestAtMs === null || at > newestAtMs) {
        newestAtMs = at;
        newestIsError = typeof snap.error === "string" && snap.error !== "";
        newestErrorAtMs = at;
      }
    }
  }

  if (total === 0) {
    return { fresh: false, reason: "没有任何额度快照（进程刚启动 / 从未刷新）", withExpiry, total, newestAtMs };
  }
  if (withExpiry === 0) {
    return {
      fresh: false,
      reason: "没有任何带到期时间的快照，due-first 的排序键为空",
      withExpiry,
      total,
      newestAtMs,
    };
  }
  if (newestAtMs === null) {
    return { fresh: false, reason: "快照缺少 fetched_at，无法判断新鲜度", withExpiry, total, newestAtMs };
  }
  const age = input.now - newestAtMs;
  if (age > input.maxAgeMs) {
    const hours = (age / 3_600_000).toFixed(1);
    return {
      fresh: false,
      reason: `快照已过期（最新一条 ${hours} 小时前，上限 ${(input.maxAgeMs / 3_600_000).toFixed(1)} 小时）`,
      withExpiry,
      total,
      newestAtMs,
    };
  }
  if (newestIsError && newestErrorAtMs !== null) {
    return {
      fresh: false,
      reason: "最新一次刷新全部失败（快照是 error 态），没有可用到期数据",
      withExpiry,
      total,
      newestAtMs,
    };
  }
  return { fresh: true, reason: "", withExpiry, total, newestAtMs };
}
