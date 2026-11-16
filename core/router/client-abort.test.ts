/**
 * 回归：「手动打断会话也会让模型进冷却」（2026-11-17 用户报）。
 *
 * 故障链：客户端打断（Esc / 停止按钮）→ `clientSignal.abort()` →
 * `gateway-upstream` 的 `clientGone` 分支 → `router.finish({ok:false,
 * kind:"client_disconnected"})` → 旧 `noteFailure` 里 `client_disconnected`
 * **不在** `TRANSIENT_KINDS` → 按 `cooldownFloorS` 落冷却 —— 而端点全程没失败
 * （上游可能正正常常吐流，是我们这头掐的）。
 *
 * 口径：打断 = 用户主动放弃，**只释放租约、记账，不落冷却**；且不清零已有的
 * 冷却（与其它瞬时故障同款：上次失败的冷却不能被这次打断洗掉）。
 */

import { describe, expect, it } from "vitest";

import { noteFailure, noteSuccess, TRANSIENT_KINDS } from "./types.js";

const NOW = 1_700_000_000;

function health(extra: Record<string, unknown> = {}) {
  return {
    endpointId: "p/m@p/u",
    provider: "workbuddy",
    fails: 0,
    cooldownUntil: 0,
    lastError: "",
    lastKind: "",
    lastStatus: 0,
    updatedAt: 0,
    ...extra,
  } as Parameters<typeof noteFailure>[0];
}

/** 只有 `cooldownFloorS` 与本组用例相关，其余字段给中性值满足类型。 */
const POLICY = {
  maxAttempts: 3,
  cooldownFloorS: 900,
  baseS: 1,
  factor: 2,
  capS: 30,
  jitterRatio: 0,
  codes: new Set<string>(),
};

describe("client_disconnected 是瞬时不冷却失败", () => {
  it("TRANSIENT_KINDS 含 client_disconnected", () => {
    expect(TRANSIENT_KINDS.has("client_disconnected")).toBe(true);
  });

  it("打断不落冷却（只记账）", () => {
    const rec = noteFailure(health(), {
      kind: "client_disconnected",
      status: 0,
      error: "客户端断开",
      now: NOW,
      hint: { until: null, policy: POLICY },
    });
    expect(rec.fails).toBe(1);
    expect(rec.lastKind).toBe("client_disconnected");
    // 关键：没有冷却。
    expect(rec.cooldownUntil).toBe(0);
  });

  it("打断不清零已有的冷却（不能被用来洗掉上次真实失败）", () => {
    const cooling = health({ cooldownUntil: NOW + 600 });
    const rec = noteFailure(cooling, {
      kind: "client_disconnected",
      status: 0,
      error: "客户端断开",
      now: NOW,
      hint: { until: null, policy: POLICY },
    });
    expect(rec.cooldownUntil).toBe(NOW + 600);
  });

  it("对照组：普通失败仍按 cooldownFloorS 落冷却", () => {
    const rec = noteFailure(health(), {
      kind: "upstream",
      status: 502,
      error: "Bad Gateway",
      now: NOW,
      hint: { until: null, policy: POLICY },
    });
    expect(rec.cooldownUntil).toBe(NOW + 900);
  });

  it("打断后一次成功即完全清账", () => {
    const afterBreak = noteFailure(health(), {
      kind: "client_disconnected",
      status: 0,
      error: "客户端断开",
      now: NOW,
    });
    const rec = noteSuccess(afterBreak, NOW + 5);
    expect(rec.fails).toBe(0);
    expect(rec.cooldownUntil).toBe(0);
    expect(rec.lastKind).toBe("");
  });
});
