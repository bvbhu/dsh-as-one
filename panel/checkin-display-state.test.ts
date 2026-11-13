/**
 * 签到展示的两个口径(2026-11-11 用户报「trae 点击签到后仍显示未签」)。
 *
 * ## 背景
 *
 * trae 按**设备**放行每日签到:同机多账号一天只能签一个。所以一个账号签上、
 * 另一个被 9095 挡住是**常态**,不是失败。
 *
 * 我 0.4.42 为了「不显示账号数」把 `countExact` 设成 false,结果前端在
 * `pending > 0` 时一刀切显示「未签」—— 把「这个渠道今天确实领到了」抹掉了。
 *
 * 两个必须钉住的口径:
 * 1. **有账号签上 → 报「已签」**(不管还有几个被设备挡住);
 * 2. **只累计真签上的账号的积分**(未签账号的 `daily_credit` 是「可领」不是「已领」,
 *    混进去会让「今日 +100」变成「+200」)。
 */

import { describe, expect, it } from "vitest";

/** 与 panel-ui 的 CheckinRow / checkinChip 同口径(只覆盖 pending>0 那段)。 */
function stateOf(c: {
  accounts: number;
  countExact: boolean;
  checkedIn: number;
  pending: number;
}): string {
  if (c.pending > 0) {
    if (c.countExact && c.accounts > 1) return `${c.checkedIn}/${c.accounts} 已签`;
    if (c.checkedIn > 0) return "已签";
    return "未签";
  }
  if (c.countExact && c.accounts > 1) return `${c.checkedIn}/${c.accounts} 已签`;
  return "已签";
}

describe("签到状态展示", () => {
  it("trae 典型场景:2 账号、1 签 1 被设备挡住 → 显示「已签」(不是「未签」)", () => {
    // 这是用户截图里的真实状态:bvbhu 签上、用户2767 被 9095 挡住。
    expect(
      stateOf({ accounts: 2, countExact: false, checkedIn: 1, pending: 1 }),
    ).toBe("已签");
  });

  it("trae 一个都没签上 → 才是「未签」", () => {
    expect(
      stateOf({ accounts: 2, countExact: false, checkedIn: 0, pending: 2 }),
    ).toBe("未签");
  });

  it("countExact=true 的多账号仍报比例(该分母是真实可签的)", () => {
    expect(
      stateOf({ accounts: 2, countExact: true, checkedIn: 1, pending: 1 }),
    ).toBe("1/2 已签");
    expect(
      stateOf({ accounts: 2, countExact: true, checkedIn: 2, pending: 0 }),
    ).toBe("2/2 已签");
  });
});

/** 与 panel.ts 的 trae 分支同口径的积分累计。 */
function dailyCreditOf(
  rows: Array<{ checkedIn: boolean; points: number }>,
): number {
  let sum = 0;
  for (const r of rows) {
    // 只有真签上的账号才计入
    if (r.checkedIn && r.points > 0) sum += r.points;
  }
  return sum;
}

describe("每日积分累计", () => {
  it("1 签 1 未 → 只计已签的 100(不是 200)", () => {
    // 未签账号的 daily_credit 是「可领」额度,不是「已领」。
    expect(
      dailyCreditOf([
        { checkedIn: true, points: 100 },
        { checkedIn: false, points: 100 },
      ]),
    ).toBe(100);
  });

  it("两个都签上 → 计 200", () => {
    expect(
      dailyCreditOf([
        { checkedIn: true, points: 100 },
        { checkedIn: true, points: 100 },
      ]),
    ).toBe(200);
  });

  it("一个都没签 → 0(不显示「今日 +N」)", () => {
    expect(
      dailyCreditOf([
        { checkedIn: false, points: 100 },
        { checkedIn: false, points: 100 },
      ]),
    ).toBe(0);
  });
});
