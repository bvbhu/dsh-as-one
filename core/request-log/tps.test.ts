// tps.test.ts
// ========================================================================
// 输出速率口径的回归测试(2026-11-07 用户定案「按建议修」)。
//
// 锁住三件事:
//   1. 真流式 → 用生成窗口(与旧公式一致,不许改动既有正确值)
//   2. 非流式(ttft=null) → 退回整段 latency,不再恒 null
//   3. 伪流式(ttft≈latency) → 退回整段 latency,不再爆表
// ========================================================================

import { describe, expect, it } from "vitest";

import { TPS_MIN_GEN_MS, TPS_MIN_GEN_RATIO, computeTps, tpsOf } from "./tps.js";

describe("tpsOf:真流式仍用生成窗口", () => {
  it("首字节 500ms、总 2500ms、输出 1000 tok → 500 tok/s", () => {
    // genMs = 2000,分母就是 2 秒,与旧公式一字不差。
    expect(computeTps({ completionTokens: 1000, latencyMs: 2500, ttftMs: 500 })).toBe(500);
  });

  it("生成窗口刚好达到相对下限时仍走生成口径", () => {
    // latency 10000 → 相对下限 max(50, 500) = 500ms;给正好 500ms 的生成窗口。
    const d = tpsOf({ completionTokens: 100, latencyMs: 10000, ttftMs: 9500 });
    expect(d.endToEnd).toBe(false);
    expect(d.tps).toBe(200); // 100 tok / 0.5s
  });

  it("四位小数取整到 1 位", () => {
    expect(computeTps({ completionTokens: 10, latencyMs: 3000, ttftMs: 1000 })).toBe(5);
    expect(computeTps({ completionTokens: 7, latencyMs: 3000, ttftMs: 1000 })).toBe(3.5);
  });
});

describe("tpsOf:非流式退回整段 latency", () => {
  it("ttft=null 时不再恒为 null,而是端到端吞吐", () => {
    // 旧实现:denom=0 → null。新口径:861 tok / 5.955s。
    const d = tpsOf({ completionTokens: 861, latencyMs: 5955, ttftMs: null });
    expect(d.endToEnd).toBe(true);
    expect(d.tps).toBe(144.6);
  });

  it("非流式长请求同样可用", () => {
    expect(computeTps({ completionTokens: 2000, latencyMs: 8000, ttftMs: null })).toBe(250);
  });
});

describe("tpsOf:伪流式退回整段 latency", () => {
  it("复现 opencsg 的 430500 tok/s 爆表,修好后是 144.6", () => {
    // 线上真实样本:lat=5955 ttft=5953 genMs=2 ct=861。
    // 旧公式 861/(2/1000) = 430500 —— 荒谬值。
    const d = tpsOf({ completionTokens: 861, latencyMs: 5955, ttftMs: 5953 });
    expect(d.endToEnd).toBe(true);
    expect(d.tps).toBe(144.6);
  });

  it("另外两个爆表样本也收敛", () => {
    // lat=4275 ttft=4274 → 旧 133000
    expect(computeTps({ completionTokens: 133, latencyMs: 4275, ttftMs: 4274 })).toBe(31.1);
    // lat=17509 ttft=17508 → 旧 126000
    expect(computeTps({ completionTokens: 2207, latencyMs: 17509, ttftMs: 17508 })).toBe(126.0);
  });

  it("生成窗口低于绝对下限 50ms 时退让", () => {
    // latency 400 → 相对下限 max(50, 20) = 50;genMs = 30 < 50,退让。
    const d = tpsOf({ completionTokens: 100, latencyMs: 400, ttftMs: 370 });
    expect(d.endToEnd).toBe(true);
    expect(d.tps).toBe(250); // 100 / 0.4s
  });

  it("ttft 大于 latency 的畸形数据按 latency 截断,不产生负窗口", () => {
    // 上游时钟抖动/单位错乱时可能给出这种值;genMs 会是负数。
    const d = tpsOf({ completionTokens: 100, latencyMs: 1000, ttftMs: 1500 });
    expect(d.endToEnd).toBe(true);
    expect(d.tps).toBe(100); // 100 / 1s
  });
});

describe("tpsOf:不可算的情况必须给 null 而不是 0", () => {
  it("没有输出 token", () => {
    expect(computeTps({ completionTokens: 0, latencyMs: 1000, ttftMs: 100 })).toBeNull();
    expect(computeTps({ completionTokens: -5, latencyMs: 1000, ttftMs: 100 })).toBeNull();
  });

  it("没有耗时", () => {
    expect(computeTps({ completionTokens: 100, latencyMs: 0, ttftMs: null })).toBeNull();
    expect(computeTps({ completionTokens: 100, latencyMs: -1, ttftMs: 500 })).toBeNull();
  });

  it("NaN / Infinity 一律 null,不许漏成 NaN 或 Infinity", () => {
    expect(computeTps({ completionTokens: Number.NaN, latencyMs: 1000, ttftMs: 100 })).toBeNull();
    expect(computeTps({ completionTokens: 100, latencyMs: Number.NaN, ttftMs: null })).toBeNull();
    expect(computeTps({ completionTokens: 100, latencyMs: Number.POSITIVE_INFINITY, ttftMs: null })).toBeNull();
  });

  it("tps 为 null 时 endToEnd 必为 false", () => {
    expect(tpsOf({ completionTokens: 0, latencyMs: 1000, ttftMs: 100 }).endToEnd).toBe(false);
  });
});

describe("阈值常量本身", () => {
  it("绝对下限 50ms、相对下限 5%", () => {
    // 这两个数是有意选的:50ms 够分出首块与首块后的生成;
    // 5% 避免长请求里几百毫秒的抖动被误判成生成窗口。
    expect(TPS_MIN_GEN_MS).toBe(50);
    expect(TPS_MIN_GEN_RATIO).toBe(0.05);
  });
});
