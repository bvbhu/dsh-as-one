/**
 * 签到顺序（trae 设备级额度）的口径测试。
 *
 * 钉三件事：稳定分区（保序）、子串 + 大小写不敏感匹配、`index` 不丢。
 */

import { describe, expect, it } from "vitest";

import {
  TRAE_DEPRIORITIZED_LABELS,
  isDeprioritizedLabel,
  prioritizeCheckinAccounts,
} from "./checkin-order.js";

describe("isDeprioritizedLabel", () => {
  it("命中 bvbhu（大小写不敏感）", () => {
    expect(isDeprioritizedLabel("bvbhu")).toBe(true);
    expect(isDeprioritizedLabel("BVBHU")).toBe(true);
    expect(isDeprioritizedLabel("bvbhu@example.com")).toBe(true);
    expect(isDeprioritizedLabel("user-bvbhu-2")).toBe(true);
  });

  it("其它账号不命中", () => {
    expect(isDeprioritizedLabel("alice")).toBe(false);
    expect(isDeprioritizedLabel("330134472138")).toBe(false);
  });

  it("空标签不命中（宁可正常顺序，不要误判）", () => {
    expect(isDeprioritizedLabel("")).toBe(false);
    expect(isDeprioritizedLabel("   ")).toBe(false);
    expect(isDeprioritizedLabel(null)).toBe(false);
    expect(isDeprioritizedLabel(undefined)).toBe(false);
  });

  it("列表可注入", () => {
    expect(isDeprioritizedLabel("alice", ["alice"])).toBe(true);
    expect(isDeprioritizedLabel("bvbhu", ["alice"])).toBe(false);
  });
});

describe("prioritizeCheckinAccounts", () => {
  const acc = (username: string, index: number) => ({ username, index });

  it("非 bvbhu 在前、bvbhu 在后，各自保序（稳定分区）", () => {
    const out = prioritizeCheckinAccounts([
      acc("bvbhu", 0),
      acc("alice", 1),
      acc("bvbhu-2", 2),
      acc("bob", 3),
    ]);
    expect(out.map((a) => a.username)).toEqual(["alice", "bob", "bvbhu", "bvbhu-2"]);
  });

  it("index 跟着账号走，不重排编号", () => {
    const out = prioritizeCheckinAccounts([acc("bvbhu", 0), acc("alice", 1)]);
    expect(out[0]).toEqual({ username: "alice", index: 1 });
    expect(out[1]).toEqual({ username: "bvbhu", index: 0 });
  });

  it("全是 bvbhu / 全不是 bvbhu 时顺序不变", () => {
    const all = [acc("bvbhu", 0), acc("bvbhu2", 1)];
    expect(prioritizeCheckinAccounts(all).map((a) => a.index)).toEqual([0, 1]);
    const none = [acc("alice", 0), acc("bob", 1)];
    expect(prioritizeCheckinAccounts(none).map((a) => a.index)).toEqual([0, 1]);
  });

  it("空数组安全", () => {
    expect(prioritizeCheckinAccounts([])).toEqual([]);
  });

  it("缺省列表就是 bvbhu", () => {
    expect([...TRAE_DEPRIORITIZED_LABELS]).toEqual(["bvbhu"]);
  });
});
