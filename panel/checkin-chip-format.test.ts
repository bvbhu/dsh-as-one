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

import {
  checkinChipText,
  checkinDone,
  checkinProgress,
  checkinSignedText,
  formatCheckinCredit,
  formatCheckinCreditInline,
} from "./checkin-chip-format.js";
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

describe("formatCheckinCreditInline(总览卡)", () => {
  it("多账号一致 → 单账号值×账号数(+400×2 / +100×3)", () => {
    expect(formatCheckinCreditInline(status({}))).toBe("+400×2");
    expect(
      formatCheckinCreditInline(
        status({ provider: "qoder", label: "Qoder", accounts: 3, checkedIn: 0, pending: 3, dailyCredit: 300, perAccountCredit: 100 }),
      ),
    ).toBe("+100×3");
  });

  it("各账号不一致 / 单账号 → 合计", () => {
    expect(formatCheckinCreditInline(status({ perAccountCredit: null, dailyCredit: 900 }))).toBe("+900");
    expect(
      formatCheckinCreditInline(status({ accounts: 1, checkedIn: 1, dailyCredit: 100, perAccountCredit: 100 })),
    ).toBe("+100");
  });

  it("没有数字 → null(不显示「今日 +null」)", () => {
    expect(formatCheckinCreditInline(status({ dailyCredit: null, perAccountCredit: null }))).toBeNull();
  });

  it("状态词与积分的组合:0/2 未签 + 400×2", () => {
    const c = status({ checkedIn: 0, pending: 2 });
    expect(checkinSignedText(c)).toBe("0/2 未签");
    expect(formatCheckinCreditInline(c)).toBe("+400×2");
  });
});

/**
 * 2026-11-15 用户截图「每日签到 3/4」:四行 WorkBuddy / Trae / MiniMax /
 * Qoder 全显示「已签」,下方还写着「签到完成 4 个渠道」。根因是头部分子要求
 * `pending === 0`,而 trae 按设备放行时同机只有第一个账号签得上,其余仍 pending,
 * 行状态却按 `checkedIn > 0` 判「已签」。计数必须与行同一口径。
 */
describe("checkinProgress:头部 N/M 与行状态同口径", () => {
  const screenshot = [
    status({ provider: "workbuddy", label: "WorkBuddy", accounts: 1, checkedIn: 1, pending: 0 }),
    // trae:2 账号、1 个签上、1 个被 9095「本设备今日已签」挡住,分母不可信
    status({
      provider: "trae", label: "Trae", accounts: 2, countExact: false, checkedIn: 1, pending: 1,
    }),
    status({ accounts: 2, checkedIn: 2, pending: 0 }),
    status({ provider: "qoder", label: "Qoder", accounts: 3, checkedIn: 3, pending: 0 }),
    // 不支持签到的渠道不进分母
    status({ provider: "sensenova", label: "SenseNova", supported: false, checkedIn: 0 }),
  ];

  it("四行都领到 → 4/4(trae 的 pending 不再把它排除)", () => {
    expect(checkinProgress(screenshot)).toEqual({ done: 4, total: 4 });
  });

  it("真有一个渠道没签 → 3/4", () => {
    const rows = screenshot.map((c) =>
      c.provider === "qoder" ? { ...c, checkedIn: 0, pending: 3 } : c,
    );
    expect(checkinProgress(rows)).toEqual({ done: 3, total: 4 });
  });

  it("checkinDone 只看 checkedIn,与状态词一致", () => {
    expect(checkinDone({ checkedIn: 1 })).toBe(true);
    expect(checkinDone({ checkedIn: 0 })).toBe(false);
    expect(checkinDone({ checkedIn: null })).toBe(false);
    expect(checkinSignedText({ accounts: 2, countExact: false, checkedIn: 1 })).toBe("已签");
  });

  it("空列表 → 0/0,不支持签到的渠道不计入分母", () => {
    expect(checkinProgress([])).toEqual({ done: 0, total: 0 });
    expect(checkinProgress([status({ supported: false, checkedIn: 1 })])).toEqual({
      done: 0, total: 0,
    });
  });
});
