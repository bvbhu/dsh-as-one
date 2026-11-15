/**
 * 签到 chip 文案拼接(2026-11-07 用户定案):**多账号要能看出单账号是多少**。
 *
 * 原实现只给「今日合计」(如 MiniMax 两号各 400 显示 `今日 800`),用户无法
 * 判断是单号 800 还是双号各 400 —— 用户要求「调整描述,显示为 400*2 和 100*2」。
 * 故后端新增 `CheckinChannelStatus.perAccountCredit`(各账号今日积分**完全相同**
 * 时的单账号值),这里的纯函数据此把多账号积分显示成 `单账号值×账号数`
 * (如 `今日 400×2`);单账号或后端无法给出统一单账号值(perAccountCredit 为
 * null/undefined)时,保持退回合计 `今日 X`,绝不把不一致的值谎报成乘法。
 *
 * ⚠️ 这是**纯函数**,不碰任何 DOM/state:panel-ui 直接 import 使用,panel 的
 * vitest 可单独覆盖文案(panel-ui 没有测试环境)。
 */
import type { CheckinChannelStatus } from "./types.js";

/** 与 panel-ui 的 `n()` 同口径:四舍五入 + 千分位。 */
function n(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/**
 * 单渠道签到 chip 的「今日积分」片段(以 ` · 今日 …` 开头;无积分时为空串)。
 *
 * 多账号且 `countExact` 且后端给了统一单账号值 → ` · 今日 400×2`;
 * 其余 → 合计 ` · 今日 800`。
 */
export function formatCheckinCredit(
  c: Pick<CheckinChannelStatus, "accounts" | "countExact" | "dailyCredit" | "perAccountCredit">,
): string {
  if (c.dailyCredit === null) return "";
  const perAccount = c.countExact && c.accounts > 1 && c.perAccountCredit != null;
  if (perAccount) {
    return ` · 今日 ${n(c.perAccountCredit)}×${c.accounts}`;
  }
  return ` · 今日 ${n(c.dailyCredit)}`;
}

/**
 * 单渠道签到 chip 的完整文案(「已签 2/2 · 今日 400×2」)。
 *
 * 只负责已签(`pending === 0`、`checkedIn !== null`)这一档;加载中 / 不支持 /
 * 报错 / 待签等前置分支仍由调用方(panel-ui 的 `checkinChip`)处理。
 */
export function checkinChipText(c: CheckinChannelStatus): string {
  const points = formatCheckinCredit(c);
  return `${checkinSignedText(c)}${points}`;
}

/**
 * 签到状态词 —— **总览卡与渠道 chip 共用这一份**。
 *
 * 口径(2026-11-14 修「0/2 已签」自相矛盾):
 * - 多账号且分母可信 → `2/3 已签` / `0/3 未签`(**比例在前、状态在后**);
 * - 其余 → `已签` / `未签`(分母不可信时不编比例,但**签没签照实说**)。
 *
 * ⚠️ 以前两处各自写了一遍,且 `checkedIn === 0` 时仍然拼「已签」 —— 于是截图里
 * 出现「0/2 已签」「0/3 已签」这种自己打自己的状态。判断只看 `checkedIn > 0`
 * 这一条,别再按「有没有 pending」分叉。
 */
/**
 * 渠道「今天领到了」的**唯一判据**:只看 `checkedIn > 0`。
 *
 * 2026-11-15 修「每日签到 3/4」:trae 按**设备**放行每日签到,同机多账号
 * 一天只有第一个能签上,其余被 9095 挡住 → `checkedIn = 1` 但 `pending > 0`。
 * 行状态按 `checkedIn > 0` 显示绿色「已签」,总览头部计数却要求 `pending === 0`,
 * 于是四个渠道明明都显示已签、计数只有 3/4,还和「签到完成 4 个渠道」的
 * 摘要自相矛盾。头部计数 / 行状态 / chip 一律走这里,**别再按 pending 分叉**。
 */
export function checkinDone(c: { checkedIn: number | null }): boolean {
  return c.checkedIn !== null && c.checkedIn > 0;
}

/**
 * 总览「每日签到 N/M」:分母 = 展示出来且支持签到的渠道数,分子 = 其中今天
 * 领到过的渠道数。调用方已过滤隐藏渠道与 0 账号渠道,分母永远等于可见行数。
 */
export function checkinProgress(
  channels: readonly { supported: boolean; checkedIn: number | null }[],
): { done: number; total: number } {
  const eligible = channels.filter((c) => c.supported);
  return { done: eligible.filter(checkinDone).length, total: eligible.length };
}

export function checkinSignedText(c: {
  accounts: number;
  countExact: boolean;
  checkedIn: number | null;
}): string {
  // 上限未知时不能编状态:调用方通常已前置判空,这里兜底成「未知」而不是「未签」。
  if (c.checkedIn === null) return "签到未知";
  const word = checkinDone(c) ? "已签" : "未签";
  if (c.countExact && c.accounts > 1) return `${c.checkedIn}/${c.accounts} ${word}`;
  return word;
}

/**
 * 总览卡用的**短**积分文案:`+400×2` / `+800` / 无数字 `null`。
 *
 * 与 {@link formatCheckinCredit}(` · 今日 400×2`)同一口径,只去掉「今日」前缀
 * 与分隔符 —— 总览行已经有自己的 `meta` 串。
 */
export function formatCheckinCreditInline(c: {
  accounts: number;
  countExact: boolean;
  dailyCredit: number | null;
  perAccountCredit?: number | null;
}): string | null {
  if (c.dailyCredit === null) return null;
  if (c.countExact && c.accounts > 1 && c.perAccountCredit != null) {
    return `+${n(c.perAccountCredit)}×${c.accounts}`;
  }
  return `+${n(c.dailyCredit)}`;
}
