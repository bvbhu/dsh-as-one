/**
 * 运行时数据门面（统一读写口）。
 *
 * 目前收进来的是**运行期额度**（探针可刷、会过时的那部分数据）。
 * 后续若要把设置项也统一，同样挂在这里，别另起一套模块级缓存。
 *
 * 纪律（2026-11-18 用户定案「保证数据唯一」）：
 * **任何模块级 Map 都不许再出现在 `panel/` 或 `src/` 里** —— 运行期共享状态
 * 一律放进 `core/datahub`。`panel/` 与 `src/` 只经这里的实例读写。
 *
 * @module @as-one/core/src/datahub
 */

export {
  QuotaHub,
  quotaHub,
  quotaRollupOf,
  type QuotaEntry,
  type QuotaRollup,
  type PoolRatios,
} from "./quota.js";
