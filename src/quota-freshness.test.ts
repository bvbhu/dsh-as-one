/**
 * 额度快照新鲜度判定的口径测试。
 *
 * 这份判定的唯一用途：**没有有效数据时先更新再调度**（用户 2026-11-16 定案）。
 * 所以每条「无效」的理由都要能被单独命中 —— 判错一次要么白打一轮上游，
 * 要么让 due-first 用空排序键排一次错序。
 */

import { describe, expect, it } from "vitest";

import { evaluateQuotaFreshness } from "./quota-freshness.js";

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const MAX_AGE = 5 * HOUR;

const ok = (at: number, exp = 1_900_000_000) => ({ expires_at: exp, fetched_at: at, error: null });
const failed = (at: number) => ({ expires_at: null, fetched_at: at, error: "上游 502" });

describe("evaluateQuotaFreshness", () => {
  it("有到期时间 + 新鲜 → 有效", () => {
    const r = evaluateQuotaFreshness({ snapshots: [ok(NOW - 1000)], now: NOW, maxAgeMs: MAX_AGE });
    expect(r.fresh).toBe(true);
    expect(r.reason).toBe("");
    expect(r.withExpiry).toBe(1);
    expect(r.total).toBe(1);
  });

  it("没有任何快照 → 无效（进程刚启动）", () => {
    const r = evaluateQuotaFreshness({ snapshots: [], now: NOW, maxAgeMs: MAX_AGE });
    expect(r.fresh).toBe(false);
    expect(r.reason).toContain("没有任何额度快照");
  });

  it("有快照但没有一条带到期时间 → 无效（排序键为空）", () => {
    const r = evaluateQuotaFreshness({
      snapshots: [{ expires_at: null, fetched_at: NOW - 1000 }],
      now: NOW,
      maxAgeMs: MAX_AGE,
    });
    expect(r.fresh).toBe(false);
    expect(r.reason).toContain("带到期时间的快照");
  });

  it("过期 → 无效，原因里带小时数", () => {
    const r = evaluateQuotaFreshness({ snapshots: [ok(NOW - 8 * HOUR)], now: NOW, maxAgeMs: MAX_AGE });
    expect(r.fresh).toBe(false);
    expect(r.reason).toContain("已过期");
    expect(r.reason).toContain("8.0");
  });

  it("最新一条是 error 态 → 无效（不能拿失败当数据）", () => {
    const r = evaluateQuotaFreshness({
      snapshots: [ok(NOW - 2 * HOUR), failed(NOW - 1000)],
      now: NOW,
      maxAgeMs: MAX_AGE,
    });
    expect(r.fresh).toBe(false);
    expect(r.reason).toContain("全部失败");
  });

  it("旧的 error + 新的成功 → 有效（看最新那条）", () => {
    const r = evaluateQuotaFreshness({
      snapshots: [failed(NOW - 2 * HOUR), ok(NOW - 1000)],
      now: NOW,
      maxAgeMs: MAX_AGE,
    });
    expect(r.fresh).toBe(true);
  });

  it("缺 fetched_at → 无效（无法判断新鲜度）", () => {
    const r = evaluateQuotaFreshness({
      snapshots: [{ expires_at: 1_900_000_000, fetched_at: null }],
      now: NOW,
      maxAgeMs: MAX_AGE,
    });
    expect(r.fresh).toBe(false);
    expect(r.reason).toContain("缺少 fetched_at");
  });

  it("边界：刚好等于上限算有效，超过 1ms 算过期", () => {
    expect(evaluateQuotaFreshness({ snapshots: [ok(NOW - MAX_AGE)], now: NOW, maxAgeMs: MAX_AGE }).fresh).toBe(true);
    expect(evaluateQuotaFreshness({ snapshots: [ok(NOW - MAX_AGE - 1)], now: NOW, maxAgeMs: MAX_AGE }).fresh).toBe(false);
  });

  it("多快照：只有一条有效就够（真实场景里各渠道各自新鲜）", () => {
    const r = evaluateQuotaFreshness({
      snapshots: [{ expires_at: null, fetched_at: NOW - 1 }, ok(NOW - 500)],
      now: NOW,
      maxAgeMs: MAX_AGE,
    });
    expect(r.fresh).toBe(true);
    expect(r.total).toBe(2);
    expect(r.withExpiry).toBe(1);
  });

  it("脏输入不炸（null / 非对象混在集合里）", () => {
    const r = evaluateQuotaFreshness({
      snapshots: [null as never, undefined as never, ok(NOW - 1000)],
      now: NOW,
      maxAgeMs: MAX_AGE,
    });
    expect(r.fresh).toBe(true);
    expect(r.total).toBe(1);
  });
});
