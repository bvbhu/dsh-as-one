/**
 * 签到顺序（trae 设备级额度）的口径测试。
 *
 * 钉四件事：优先名单来自设置项（代码不写死账号名）、稳定分区（保序）、
 * 子串 + 大小写不敏感匹配、`index` 不丢。
 */

import { describe, expect, it } from "vitest";

import {
  TRAE_PRIORITY_SETTING_KEY,
  isPriorityLabel,
  parsePriorityList,
  prioritizeCheckinAccounts,
} from "./checkin-order.js";

describe("parsePriorityList", () => {
  it("逗号分隔、去空白、去空项、去重保序", () => {
    expect(parsePriorityList(" 用户2767 , ,alice,用户2767")).toEqual(["用户2767", "alice"]);
  });

  it("空值 → 空数组", () => {
    expect(parsePriorityList("")).toEqual([]);
    expect(parsePriorityList("  ")).toEqual([]);
    expect(parsePriorityList(null)).toEqual([]);
    expect(parsePriorityList(undefined)).toEqual([]);
  });
});

describe("isPriorityLabel", () => {
  it("大小写不敏感的子串匹配", () => {
    expect(isPriorityLabel("用户2767", ["用户2767"])).toBe(true);
    expect(isPriorityLabel("用户2767@example.com", ["用户2767"])).toBe(true);
    expect(isPriorityLabel("Alice", ["alice"])).toBe(true);
  });

  it("不命中 / 空标签不命中", () => {
    expect(isPriorityLabel("bvbhu", ["用户2767"])).toBe(false);
    expect(isPriorityLabel("", ["x"])).toBe(false);
    expect(isPriorityLabel(null, ["x"])).toBe(false);
  });
});

describe("prioritizeCheckinAccounts", () => {
  const acc = (username: string, index: number) => ({ username, index });

  it("命中名单的排最前，其余保序", () => {
    const out = prioritizeCheckinAccounts(
      [acc("bvbhu", 0), acc("alice", 1), acc("用户2767", 2), acc("bob", 3)],
      ["用户2767"],
    );
    expect(out.map((a) => a.username)).toEqual(["用户2767", "bvbhu", "alice", "bob"]);
  });

  it("index 跟着账号走，不重排编号", () => {
    const out = prioritizeCheckinAccounts([acc("bvbhu", 0), acc("用户2767", 1)], ["用户2767"]);
    expect(out[0]).toEqual({ username: "用户2767", index: 1 });
    expect(out[1]).toEqual({ username: "bvbhu", index: 0 });
  });

  it("名单为空 → 原顺序（不干预）", () => {
    const list = [acc("bvbhu", 0), acc("用户2767", 1)];
    expect(prioritizeCheckinAccounts(list, []).map((a) => a.index)).toEqual([0, 1]);
    expect(prioritizeCheckinAccounts(list, ["  "]).map((a) => a.index)).toEqual([0, 1]);
  });

  it("全部命中 → 顺序不变；一个都不命中 → 顺序不变", () => {
    const both = [acc("用户2767", 0), acc("用户2768", 1)];
    expect(prioritizeCheckinAccounts(both, ["用户"]).map((a) => a.index)).toEqual([0, 1]);
    const none = [acc("alice", 0), acc("bob", 1)];
    expect(prioritizeCheckinAccounts(none, ["用户2767"]).map((a) => a.index)).toEqual([0, 1]);
  });

  it("空数组安全", () => {
    expect(prioritizeCheckinAccounts([], ["x"])).toEqual([]);
  });

  it("设置项键名固定（面板不展示，直接写库）", () => {
    expect(TRAE_PRIORITY_SETTING_KEY).toBe("checkin.trae.priority.accounts");
  });
});
