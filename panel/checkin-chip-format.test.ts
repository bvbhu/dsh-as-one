/**
 * 签到 chip 文案:多账号显示「单账号值×账号数」(2026-11-07 用户定案)。
 *
 * 用户原话:「调整描述,显示为 400*2 和 100*2」—— 原来的合计数字看不出是
 * 单号多少还是几号之和。
 *
 * 口径:
 *   - 多账号 + 各账号积分完全一致(perAccountCredit 非空)→ `今日 400×2`
 *   - 单账号 / 各账号不一致(perAccountCredit 为 null)→ 退回合计 `今日 800`
 *   - 完全没有数字 → 不显示「今日 —」
 */
import { describe, expect, it } from "vitest";

import { checkinChipText, formatCheckinCredit } from "./checkin-chip-format.js";
import type { CheckinChannelStatus } from "./types.js";

function status(over: Partial<CheckinChannelStatus>): CheckinChannelStatus {
  return {
    provider: "minimax",
    label: "MiniMax",
    supported: true,
    accounts: 2,
    countExact: true,
    checkedIn: 2,
    pending: 0,
    dailyCredit: 800,
    perAccountCredit: 400,
    streak: null,
    reason: null,
    error: null,
    ...over,
  };
}

describe("formatCheckinCredit", () => {
  it("多账号且每账号一致 → 单账号值×账号数", () => {
    expect(formatCheckinCredit(status({}))).toBe(" · 今日 400×2");
  });

  it("多账号但每账号不一致(perAccountCredit 为 null)→ 退回合计", () => {
    expect(formatCheckinCredit(status({ perAccountCredit: null, dailyCredit: 900 }))).toBe(
      " · 今日 900",
    );
  });

  it("单账号 → 不显示乘法", () => {
    expect(
      formatCheckinCredit(status({ accounts: 1, checkedIn: 1, dailyCredit: 100, perAccountCredit: 100 })),
    ).toBe(" · 今日 100");
  });

  it("没有数字 → 空串(不显示「今日 —」)", () => {
    expect(formatCheckinCredit(status({ dailyCredit: null, perAccountCredit: null }))).toBe("");
  });

  it("千分位保留", () => {
    expect(
      formatCheckinCredit(status({ accounts: 2, dailyCredit: 2400, perAccountCredit: 1200 })),
    ).toBe(" · 今日 1,200×2");
  });
});

describe("checkinChipText", () => {
  it("多账号已签 → 含 2/2 与 400×2", () => {
    const text = checkinChipText(status({}));
    expect(text).toContain("2/2");
    expect(text).toContain("400×2");
  });

  it("单账号已签 → 不含乘法也不含比例", () => {
    const text = checkinChipText(
      status({ accounts: 1, checkedIn: 1, dailyCredit: 100, perAccountCredit: 100 }),
    );
    expect(text).toBe("已签 · 今日 100");
    expect(text).not.toContain("×");
    expect(text).not.toContain("/");
  });

  it("qoder 两号各 100 → 100×2", () => {
    const text = checkinChipText(
      status({ provider: "qoder", label: "Qoder", dailyCredit: 200, perAccountCredit: 100 }),
    );
    expect(text).toContain("100×2");
  });
});
