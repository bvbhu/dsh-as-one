/**
 * 高消耗模型额度闸门(2026-11-10 用户定案)。
 *
 * ## 为什么有这道闸
 *
 * sensenova 的「通用积分池」把所有模型绑在同一份额度里:
 *
 *   model_ids: [deepseek-flash, deepseek-v4-flash, glm-5.2, glm-5.3, kimi-k3,
 *               sensenova-6.8-flash, sensenova-6.8-flash-lite, ...]
 *
 * 各模型的单位请求消耗差得很远(近 7 天实测):
 *
 *   deepseek-flash          2922 请求 / 9.41 亿 token → 平均 321,871
 *   deepseek-v4-flash       1092 请求 / 5.85 亿 token → 平均 535,776
 *   sensenova-6.8-flash      119 请求 / 1102 万 token → 平均  92,575
 *   glm-5.3                   33 请求 / 2733 万 token → 平均 828,173  ← 2.6 倍
 *
 * 33 次 glm-5.3 ≈ 86 次 deepseek-flash 的额度。一旦 glm/kimi 把 5h 窗口打满
 * (实测 buhhuv 已到 120000/120000 = 0 剩余),**同账号的 deepseek 也用不了**。
 *
 * 所以:额度紧张时把额度留给便宜的主力模型,只在额度健康时才允许跑贵模型。
 */
import { describe, expect, it } from "vitest";

import {
  EXPENSIVE_MODEL_GATES,
  expensiveModelGateOf,
  isQuotaShortFor,
} from "./expensive-models.js";

describe("expensiveModelGateOf", () => {
  it("sensenova 的 glm-5.3 / kimi-k3 有闸门", () => {
    expect(expensiveModelGateOf("sensenova", "glm-5.3")).not.toBeNull();
    expect(expensiveModelGateOf("sensenova", "kimi-k3")).not.toBeNull();
  });

  it("便宜的主力模型没有闸门(deepseek / sensenova-6.8-flash)", () => {
    expect(expensiveModelGateOf("sensenova", "deepseek-flash")).toBeNull();
    expect(expensiveModelGateOf("sensenova", "deepseek-v4-flash")).toBeNull();
    expect(expensiveModelGateOf("sensenova", "sensenova-6.8-flash")).toBeNull();
  });

  it("其他渠道的模型不受影响", () => {
    expect(expensiveModelGateOf("trae", "deepseek-v4.1-flash")).toBeNull();
    expect(expensiveModelGateOf("qoder", "dfmodel")).toBeNull();
  });

  it("闸门阈值:5h 窗 10%、周窗 15%", () => {
    const gate = EXPENSIVE_MODEL_GATES["sensenova/glm-5.3"]!;
    expect(gate.minW5Ratio).toBe(0.1);
    expect(gate.minW7Ratio).toBe(0.15);
  });
});

describe("isQuotaShortFor", () => {
  const gate = { minW5Ratio: 0.1, minW7Ratio: 0.15 };

  it("5h 剩余 0%(实测 buhhuv 的现状)→ 额度不足,跳过", () => {
    expect(isQuotaShortFor(gate, { w5: 0, w7: 0.57 })).toBe(true);
  });

  it("5h 剩余 5%(低于 10% 阈值)→ 跳过", () => {
    expect(isQuotaShortFor(gate, { w5: 0.05, w7: 0.6 })).toBe(true);
  });

  it("5h 剩余 9.9%(刚好低于阈值)→ 跳过", () => {
    expect(isQuotaShortFor(gate, { w5: 0.099, w7: 0.8 })).toBe(true);
  });

  it("5h 剩余 10%(恰好等于阈值)→ 放行(不到「少于」不算不足)", () => {
    expect(isQuotaShortFor(gate, { w5: 0.1, w7: 0.8 })).toBe(false);
  });

  it("5h 剩 83% / 周剩 81%(实测 hubhuv)→ 放行", () => {
    expect(isQuotaShortFor(gate, { w5: 0.83, w7: 0.81 })).toBe(false);
  });

  it("5h 刚重置(100%)但周窗只剩 10% → 仍跳过(周窗单独判)", () => {
    expect(isQuotaShortFor(gate, { w5: 1.0, w7: 0.1 })).toBe(true);
  });

  it("周窗剩 15%(等于阈值)→ 放行", () => {
    expect(isQuotaShortFor(gate, { w5: 0.8, w7: 0.15 })).toBe(false);
  });

  it("比例读不到(null)→ 放行(fail-open,别因探针没采到就锁死链路)", () => {
    expect(isQuotaShortFor(gate, { w5: null, w7: null })).toBe(false);
    expect(isQuotaShortFor(gate, {})).toBe(false);
  });

  it("只有 5h 有数据、周窗为 null → 只按 5h 判", () => {
    expect(isQuotaShortFor(gate, { w5: 0.02, w7: null })).toBe(true);
    expect(isQuotaShortFor(gate, { w5: 0.5, w7: null })).toBe(false);
  });
});
