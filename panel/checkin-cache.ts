/**
 * 签到状态**按日缓存**(2026-11-07 用户定案,性能优化)。
 *
 * 背景:概览页/渠道页每次打开都逐渠道打上游查签到状态(trae/workbuddy 各一发、
 * qoder 逐账号 campaign、minimax 逐账号面板)。签到是**一天一次**的事,同一天内
 * 重复查纯属浪费,还把风控敏感接口点多了。
 *
 * 规则:
 *   - 每个渠道有自己的**重置时刻**:qoder 的活动每天 10:00(UTC+8)刷新,
 *     trae / workbuddy / minimax 是 0 点;周期键(cycle key)按各自时刻切日,
 *     10 点前的 qoder 属于「昨天的周期」,不会提前显示「未签到」。
 *   - 成功结果缓存到本周期结束(下个重置时刻之前不再打上游)。
 *   - 失败结果只缓存 {@link CHECKIN_ERROR_RETRY_MS}:错误不能挂一整天,
 *     但也不能每次进页面都重打(那等于没有缓存)。
 *   - 任何**真签到动作**(checkinClaim / qoderCheckin / checkinAll)成功后必须
 *     {@link invalidateCheckinCache},否则「刚签完概览还显示未签」。
 *
 * 独立成模块(而非塞进 panel.ts):channels-methods / qoder 域也要在签到成功后
 * 打掉缓存,方向是「各域 → 本模块」的单向依赖,不构成环。
 */

export interface CachedCheckin {
  /** 周期键(见 {@link checkinCycleKey});与当前键不同即视为过期。 */
  cycle: string;
  /** 错误结果的下次允许重查时刻(epoch 毫秒);成功结果记 0(缓存到周期结束)。 */
  retryAtMs: number;
  /** 是否失败结果(决定读缓存时要不要看 retryAtMs)。 */
  failed: boolean;
  /** 缓存的状态载荷(渠道侧结构,本模块不关心字段)。 */
  value: unknown;
}

const cache = new Map<string, CachedCheckin>();

/** 失败结果的重试间隔:一分钟。够挡住连点/轮询,又不会把一次抖动挂成一整天。 */
export const CHECKIN_ERROR_RETRY_MS = 60_000;

/** 各渠道的每日重置时刻(小时,本地时区)。缺省 0 点。 */
const RESET_HOUR_BY_PROVIDER: Record<string, number> = {
  // qoder 签到活动明示「每日 10:00(UTC+8)刷新」(campaigns 实测)。
  qoder: 10,
};

/**
 * 当前周期键:「今天 <重置时刻>」到「明天 <重置时刻>」算同一周期。
 *
 * qoder 在 09:59 查询时周期键仍是昨天 —— 10 点前活动还没刷出来,
 * 显示「未签到」是错的(昨天签过的积分今天还没发放)。
 */
export function checkinCycleKey(provider: string, nowMs: number = Date.now()): string {
  const resetHour = RESET_HOUR_BY_PROVIDER[provider] ?? 0;
  const d = new Date(nowMs);
  if (resetHour > 0 && d.getHours() < resetHour) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 读缓存。命中条件:周期键一致,且(成功结果 || 失败但已过重试间隔之外)。
 * 返回 undefined = 需要打上游。
 */
export function getCachedCheckin(
  provider: string,
  nowMs: number = Date.now(),
): CachedCheckin | undefined {
  const hit = cache.get(provider);
  if (hit === undefined) return undefined;
  if (hit.cycle !== checkinCycleKey(provider, nowMs)) {
    cache.delete(provider);
    return undefined;
  }
  if (hit.failed && hit.retryAtMs > nowMs) return hit;
  if (hit.failed) {
    // 失败结果过了重试窗:作废,让调用方重查。
    cache.delete(provider);
    return undefined;
  }
  return hit;
}

/** 写缓存。`failed=true` 时自动记重试时刻。 */
export function setCachedCheckin(
  provider: string,
  value: unknown,
  failed: boolean,
  nowMs: number = Date.now(),
): void {
  cache.set(provider, {
    cycle: checkinCycleKey(provider, nowMs),
    retryAtMs: failed ? nowMs + CHECKIN_ERROR_RETRY_MS : 0,
    failed,
    value,
  });
}

/** 打掉缓存(真签到成功后调用;不传 provider = 全部)。 */
export function invalidateCheckinCache(provider?: string): void {
  if (provider === undefined) cache.clear();
  else cache.delete(provider);
}

/** 测试/诊断用:清空并返回当前条目数。 */
export function checkinCacheSize(): number {
  return cache.size;
}
