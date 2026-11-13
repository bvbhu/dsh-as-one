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

import { checkinSignedText } from "./checkin-chip-format.js";

/**
 * ⚠️ 这里**不再抄一份逻辑**:以前测试里内联实现了 `stateOf`,于是实现改成
 * 「0/2 已签」这种自相矛盾的状态时,测试也跟着一起错(2026-11-14 截图)。
 * 现在直接测生产函数,总览卡与渠道 chip 都用它。
 */
function stateOf(c: {
  accounts: number;
  countExact: boolean;
  checkedIn: number | null;
}): string {
  return checkinSignedText(c);
}

describe("签到状态展示", () => {
  it("trae 典型场景:2 账号、1 签 1 被设备挡住 → 显示「已签」(不是「未签」)", () => {
    // 这是用户截图里的真实状态:bvbhu 签上、用户2767 被 9095 挡住。
    expect(stateOf({ accounts: 2, countExact: false, checkedIn: 1 })).toBe("已签");
  });

  it("trae 一个都没签上 → 才是「未签」", () => {
    expect(stateOf({ accounts: 2, countExact: false, checkedIn: 0 })).toBe("未签");
  });

  it("countExact=true 的多账号报比例;0 个已签必须是「未签」", () => {
    expect(stateOf({ accounts: 2, countExact: true, checkedIn: 1 })).toBe("1/2 已签");
    expect(stateOf({ accounts: 2, countExact: true, checkedIn: 2 })).toBe("2/2 已签");
    // 2026-11-14 用户截图:以前这里显示「0/2 已签」。
    expect(stateOf({ accounts: 2, countExact: true, checkedIn: 0 })).toBe("0/2 未签");
    expect(stateOf({ accounts: 3, countExact: true, checkedIn: 0 })).toBe("0/3 未签");
  });

  it("上限未知 → 「签到未知」,不编状态", () => {
    expect(stateOf({ accounts: 2, countExact: true, checkedIn: null })).toBe("签到未知");
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
