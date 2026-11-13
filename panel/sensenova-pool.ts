/**
 * SenseNova「通用积分池」的**唯一口径**(2026-11-08 重新设计)。
 *
 * ## 为什么要抽这一层
 *
 * 官网的通用积分池里有两个不同口径的数字:
 *   - `周期刷新·本周余额`(7d 窗口余量,如 914,850.76992)
 *   - `5h 窗口可用`(短窗口余量 / 上限,如 119,839.48176 / 120,000)
 *
 * 改版前卡头读 `quota.remaining`(= 活动固定积分 + 7d 余量),展开后的账号行
 * 读各池 `w5_remaining` —— 同一张卡上 914,851 与 119,839 并排,用户判定为
 * 「统计混乱」。现在卡头与账号行**都走这里**,主数字统一取通用池的 5h 可用。
 *
 * ## 不再展示的东西
 *
 * - 活动固定积分:活动已结束(官网恒为 0),且 `parse_pool_usage` 会把它掺进
 *   `remaining`。这里只取窗口字段,天然不含它。
 * - Flash-Lite 专属积分池:绑定模型白名单,花不到通用模型上,不并入也不展示。
 * - 控制台 JWT 会话到期(旧卡头那个 `03-04`):它不是积分到期,是登录态到期。
 *
 * ## 显示规格(2026-11-08 用户定案)
 *
 * 账号行压成**一行文本**,两个口径各一枚徽章、各跟一段重置说明:
 * `**5h可用 119,839** 重置 12:45  **周可用 914,851** 重置 11-10`。
 * 都带名字、互不相加;不显示分母、进度条、活动固定积分与专属池。
 * 卡头只取 5h 可用 + 5h 重置,与展开行的第一枚徽章同源。
 */

/** 只需这几个窗口字段即可;与 `types.ts` 的 `SensenovaPool` 结构兼容。 */
export interface SensenovaPoolLike {
  pool_type: string;
  w5_remaining: number | null;
  w5_limit: number | null;
  w5_reset_at: number | null;
  w7_remaining: number | null;
  w7_limit: number | null;
  w7_reset_at: number | null;
}

export interface GeneralPoolSummary {
  /** 主数字:5h 窗口可用(null = 未采集,不是 0)。 */
  remaining: number | null;
  /** 5h 窗口上限;null 时主徽章不显示「/ 上限」。 */
  limit: number | null;
  /** 辅助信息:本周余额 / 周额度。 */
  weekRemaining: number | null;
  weekLimit: number | null;
  /** 5h 窗口重置(epoch 秒)。 */
  w5ResetAt: number | null;
  /** 周窗口重置(epoch 秒)。 */
  w7ResetAt: number | null;
}

/**
 * 取通用池 = 第一个**非 dedicated** 的池。
 *
 * 与展开页原来的排序口径一致(`dedicated` 排后面),所以不会因为换了判断规则
 * 导致两处挑中不同的池。上游 `pool_type` 缺省时会回落成池名(见
 * `parse_pool_usage`),那种行也不是 "dedicated",仍会被当成通用池。
 */
export function generalPoolOf<T extends SensenovaPoolLike>(
  pools: readonly T[] | null | undefined,
): T | null {
  if (!pools) return null;
  for (const p of pools) {
    if (p && p.pool_type !== "dedicated") return p;
  }
  return null;
}

/** 有限数字才收;null / undefined / NaN 一律当「没数据」。 */
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 汇总成卡头与账号行共用的形状;没有通用池时返回 null(显示「未采集」)。 */
export function generalPoolSummary(
  pools: readonly SensenovaPoolLike[] | null | undefined,
): GeneralPoolSummary | null {
  const p = generalPoolOf(pools);
  if (p === null) return null;
  return {
    remaining: numOrNull(p.w5_remaining),
    limit: numOrNull(p.w5_limit),
    weekRemaining: numOrNull(p.w7_remaining),
    weekLimit: numOrNull(p.w7_limit),
    w5ResetAt: numOrNull(p.w5_reset_at),
    w7ResetAt: numOrNull(p.w7_reset_at),
  };
}
