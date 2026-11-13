/**
 * 9074(上游拥挤)的文案口径(2026-11-09 用户报「trae 签到仍有问题」)。
 *
 * 实测:trae 两个账号,第一个已签,第二个连重试 3 次都回
 * `9074 当前参与用户太多,请稍后再试` —— 这是上游**高峰限流**,不是账号问题
 * (同一账号非高峰时立刻签成功)。
 *
 * 旧文案「当前参与用户太多,请稍后再试(已重试 3 次仍失败)」会让用户以为
 * 签到坏了、甚至怀疑账号被封。新文案必须说清「账号本身没问题,稍后重试即可」。
 */
import { describe, expect, it } from "vitest";

import { TRAE_CODE_CROWDED, TRAE_CODE_DEVICE_ALREADY, TRAE_CODE_NO_DEVICE } from "./checkin.js";

describe("TRAE_CODE_CROWDED", () => {
  it("常量值就是上游实测的 9074", () => {
    expect(TRAE_CODE_CROWDED).toBe(9074);
  });

  it("与确定性拒绝码区分开(9004 缺设备 / 9095 本设备已签)", () => {
    // 这三个码的处置完全不同:9074 要重试,9004/9095 重试也没用。
    expect(TRAE_CODE_CROWDED).not.toBe(TRAE_CODE_NO_DEVICE);
    expect(TRAE_CODE_CROWDED).not.toBe(TRAE_CODE_DEVICE_ALREADY);
  });
});

/** 与 channels.ts 的 message 组装同口径(只覆盖 crowded 分支)。 */
function claimMessage(res: {
  claimed: boolean;
  code: number | null;
  message: string;
  retries?: number;
  credits?: number;
}): string {
  const crowded = !res.claimed && res.code === TRAE_CODE_CROWDED;
  if (res.claimed) {
    return `领取成功${res.credits ? `,当前积分 ${res.credits}` : ""}${
      (res.retries ?? 0) > 0 ? `(上游拥挤,重试 ${res.retries} 次后成功)` : ""
    }`;
  }
  return crowded ? "上游当前拥挤(高峰限流),稍后重试即可 —— 账号本身没有问题" : res.message;
}

describe("签到失败文案", () => {
  it("9074 → 明确说「账号本身没有问题,稍后重试」", () => {
    const msg = claimMessage({
      claimed: false,
      code: 9074,
      message: "当前参与用户太多,请稍后再试(已重试 3 次仍失败)",
    });
    expect(msg).toContain("稍后重试");
    expect(msg).toContain("账号本身没有问题");
    // 不再直接甩上游那句让人误解的话
    expect(msg).not.toContain("已重试 3 次仍失败");
  });

  it("其他失败码 → 保留上游原文(不套用拥挤文案)", () => {
    const msg = claimMessage({
      claimed: false,
      code: 9095,
      message: "本设备今日已签(上游 code 9095)",
    });
    expect(msg).toContain("9095");
    expect(msg).not.toContain("稍后重试");
  });

  it("成功领取 → 说清领到多少,并标注重试过", () => {
    const msg = claimMessage({
      claimed: true,
      code: 0,
      message: "",
      retries: 2,
      credits: 100,
    });
    expect(msg).toContain("领取成功");
    expect(msg).toContain("当前积分 100");
    expect(msg).toContain("重试 2 次后成功");
  });
});
