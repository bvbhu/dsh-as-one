/**
 * SenseNova 通用积分池口径测试(2026-11-08)。
 *
 * 锁住三件事:只挑非 dedicated 的池、两个窗口口径分开且不相加、
 * 「没数据(null)」和「明确为 0」不能混淆。
 */
import { describe, expect, it } from "vitest";

import { generalPoolOf, generalPoolSummary } from "./sensenova-pool.js";

/** 官网 buhhuv 的通用池(数值取整后的形状)。 */
const GENERAL = {
  pool_type: "default",
  w5_remaining: 119839,
  w5_limit: 120000,
  w5_reset_at: 1794105900,
  w7_remaining: 914851,
  w7_limit: 1200000,
  w7_reset_at: 1794260700,
};

const DEDICATED = {
  pool_type: "dedicated",
  w5_remaining: 120000,
  w5_limit: 120000,
  w5_reset_at: 1794105900,
  w7_remaining: 1177923,
  w7_limit: 1200000,
  w7_reset_at: 1794260700,
};

describe("generalPoolOf", () => {
  it("专属池排在前面也只挑通用池", () => {
    expect(generalPoolOf([DEDICATED, GENERAL])).toBe(GENERAL);
  });

  it("只有专属池 → null(显示未采集,不拿专属池顶替)", () => {
    expect(generalPoolOf([DEDICATED])).toBeNull();
  });

  it("空 / undefined → null", () => {
    expect(generalPoolOf([])).toBeNull();
    expect(generalPoolOf(undefined)).toBeNull();
  });
});

describe("generalPoolSummary", () => {
  it("5h 与周余量各归各,绝不相加", () => {
    const s = generalPoolSummary([DEDICATED, GENERAL]);
    expect(s).not.toBeNull();
    expect(s!.remaining).toBe(119839);
    expect(s!.weekRemaining).toBe(914851);
    expect(s!.limit).toBe(120000);
    expect(s!.weekLimit).toBe(1200000);
    // 挑中的是通用池,不是排在前面的专属池(专属池 5h 是 120,000)。
    expect(s!.remaining).not.toBe(DEDICATED.w5_remaining);
  });

  it("重置时刻原样透传(epoch 秒,不做单位换算)", () => {
    const s = generalPoolSummary([GENERAL]);
    expect(s!.w5ResetAt).toBe(1794105900);
    expect(s!.w7ResetAt).toBe(1794260700);
  });

  it("窗口没给数 → null,不退化成 0,也不回落到另一个池", () => {
    const s = generalPoolSummary([
      { ...GENERAL, w5_remaining: null, w7_remaining: 0 },
      DEDICATED,
    ]);
    expect(s!.remaining).toBeNull();
    expect(s!.weekRemaining).toBe(0);
  });

  it("NaN 之类脏值当没数据", () => {
    const s = generalPoolSummary([{ ...GENERAL, w5_remaining: Number.NaN }]);
    expect(s!.remaining).toBeNull();
  });
});
