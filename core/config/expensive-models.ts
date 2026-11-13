/**
 * **高消耗模型额度闸门**(2026-11-10 用户定案)。
 *
 * ## 为什么需要
 *
 * sensenova 的「通用积分池」把**所有模型**绑在同一个额度里:
 *
 *   model_ids: [deepseek-flash, deepseek-v4-flash, glm-5.2, glm-5.3, kimi-k3,
 *               sensenova-6.8-flash, sensenova-6.8-flash-lite, ...]
 *
 * 而各模型的**单位请求消耗差得很远**(近 7 天实测):
 *
 *   deepseek-v4-flash      1092 请求 / 5.85 亿 token → 平均 535,776
 *   deepseek-flash         2922 请求 / 9.41 亿 token → 平均 321,871
 *   sensenova-6.8-flash     119 请求 / 1102 万 token → 平均  92,575
 *   glm-5.3                  33 请求 / 2733 万 token → 平均 828,173  ← 2.6 倍
 *
 * 也就是说:**33 次 glm-5.3 就能吃掉 deepseek-flash 约 86 次请求的额度**。
 * 一旦 glm/kimi 把 5h 窗口打满(实测 buhhuv 已到 120000/120000 = 0 剩余),
 * 同账号的 deepseek **也用不了** —— 这不是假设,是已经发生的事。
 *
 * ## 语义
 *
 * 额度紧张时**把额度留给便宜的主力模型**,只在额度健康时才允许跑贵模型。
 * 判据用**窗口剩余比例**,不用绝对值(不同账号的 limit 可能不同):
 *
 * - `minW5Ratio`:5h 窗口剩余低于此比例 → 该账号不再接这个模型;
 * - `minW7Ratio`:周窗口剩余低于此比例 → 同上(周窗更慢,阈值给得松一些)。
 *
 * ⚠️ 比例读不到(`null`,上游没给窗口数据)时**放行**(fail-open) —— 宁可让它跑,
 * 也不要因为「探针没采到」把整条链锁死。这与项目里其他 fail-open 口径一致。
 */

/** 单个高消耗模型的闸门阈值。 */
export interface ExpensiveModelGate {
  /** 5h 窗口剩余比例下限(0~1)。低于它 → 该账号不接这个模型。 */
  minW5Ratio: number;
  /** 周窗口剩余比例下限(0~1)。低于它 → 同上。 */
  minW7Ratio: number;
}

/**
 * 高消耗模型清单(键 = `provider/model`)。
 *
 * 目前只有 sensenova 的两个:
 * - `glm-5.3` —— 实测平均 828,173 token/请求,是 deepseek-flash 的 2.6 倍;
 * - `kimi-k3` —— 同为第三方大模型,与上面同一个通用池(近 7 天 0 请求,
 *   说明几乎没用过,但一旦用起来同样吃池)。
 *
 * ⚠️ 加新模型前先看 `stats_daily` 里的**单位请求 token**,别凭感觉标"贵"。
 */
export const EXPENSIVE_MODEL_GATES: Readonly<Record<string, ExpensiveModelGate>> = {
  "sensenova/glm-5.3": { minW5Ratio: 0.1, minW7Ratio: 0.15 },
  "sensenova/kimi-k3": { minW5Ratio: 0.1, minW7Ratio: 0.15 },
};

/**
 * 查某个 `provider/model` 是否有额度闸门。
 *
 * @returns 闸门配置;不是高消耗模型(或没配)返回 `null` = 不拦。
 */
export function expensiveModelGateOf(provider: string, model: string): ExpensiveModelGate | null {
  return EXPENSIVE_MODEL_GATES[`${provider}/${model}`] ?? null;
}

/**
 * 判断额度比例是否**不足**于跑这个模型。
 *
 * @param gate   闸门配置
 * @param ratios 该账号的窗口剩余比例(`null` = 没采到 → 该项不参与判定)
 * @returns `true` = 额度不足,应当跳过这个端点
 */
export function isQuotaShortFor(
  gate: ExpensiveModelGate,
  ratios: { w5?: number | null; w7?: number | null },
): boolean {
  // 5h 窗:最紧的一道闸,先看它。
  if (typeof ratios.w5 === "number" && ratios.w5 < gate.minW5Ratio) return true;
  // 周窗:次紧,单独判 —— 5h 可能刚重置(100%)但周窗已经快见底。
  if (typeof ratios.w7 === "number" && ratios.w7 < gate.minW7Ratio) return true;
  return false;
}
