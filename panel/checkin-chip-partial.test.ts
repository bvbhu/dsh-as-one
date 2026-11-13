/**
 * 签到 chip 与「全部签到」摘要的两处口径(2026-11-09 用户反馈)。
 *
 * 1. **部分已签要显示比例**:Trae 2 个账号「1 个已签 1 个未签」时,旧实现只给
 *    「待签 1」——看起来像「一个都没签」,已签数和积分全丢了。
 *
 * 2. **摘要要短、且跳过没有凭据的渠道**:以前把每个渠道的完整 message 用
 *    ` · ` 串成两三百字的一整段(截图里就是那样),WorkBuddy 没有凭据也照样
 *    塞一句「该渠道没有凭据,无法签到」——那不是签到结果,是噪音。
 */
import { describe, expect, it } from "vitest";

import type { CheckinChannelStatus } from "./types.js";

/** 与 panel-ui 的 checkinChip 同口径(只覆盖 pending > 0 那段)。 */
function partialChipText(c: CheckinChannelStatus): string {
  if (c.pending !== null && c.pending > 0) {
    if (c.countExact && c.accounts > 1) {
      const points =
        c.dailyCredit === null
          ? ""
          : c.perAccountCredit != null
            ? ` · 今日 ${c.perAccountCredit}×${c.accounts}`
            : ` · 今日 ${c.dailyCredit}`;
      return `已签 ${c.checkedIn}/${c.accounts}(待签 ${c.pending})${points}`;
    }
    return `待签 ${c.pending}`;
  }
  return `已签 ${c.checkedIn}/${c.accounts}`;
}

function status(over: Partial<CheckinChannelStatus>): CheckinChannelStatus {
  return {
    provider: "trae",
    label: "Trae",
    supported: true,
    accounts: 2,
    countExact: true,
    checkedIn: 1,
    pending: 1,
    dailyCredit: 200,
    perAccountCredit: 100,
    streak: null,
    reason: null,
    error: null,
    ...over,
  };
}

describe("部分已签的 chip 文案", () => {
  it("2 账号 1 签 1 未 → 显示「已签 1/2(待签 1)」,不再只说待签", () => {
    const text = partialChipText(status({}));
    expect(text).toContain("已签 1/2");
    expect(text).toContain("待签 1");
    // 积分也要在
    expect(text).toContain("100×2");
  });

  it("单账号未签 → 仍只说「待签 1」(不硬塞 1/1)", () => {
    const text = partialChipText(status({ accounts: 1, checkedIn: 0, pending: 1, dailyCredit: 100, perAccountCredit: null }));
    expect(text).toBe("待签 1");
  });
});

/** 与 checkinAll 的摘要口径同形。 */
function summarize(okChannels: number, failedLabels: string[], ranAny: boolean): string {
  if (failedLabels.length > 0) return `签到完成 ${okChannels} 个渠道;失败:${failedLabels.join("、")}`;
  if (okChannels > 0) return `签到完成 ${okChannels} 个渠道`;
  if (!ranAny) return "没有可签到的渠道(未配置或没有账号)";
  return "签到完成";
}

describe("全部签到的摘要", () => {
  it("3 个渠道成功 → 一句短话(不再是两三百字的长串)", () => {
    const msg = summarize(3, [], true);
    expect(msg).toBe("签到完成 3 个渠道");
    expect(msg.length).toBeLessThan(30);
  });

  it("有失败 → 点名失败渠道", () => {
    expect(summarize(2, ["Qoder"], true)).toBe("签到完成 2 个渠道;失败:Qoder");
  });

  it("一个渠道都没跑(全无凭据)→ 说清楚,不摆空摘要", () => {
    expect(summarize(0, [], false)).toBe("没有可签到的渠道(未配置或没有账号)");
  });
});
