/**
 * 命名时段配置(2026-11「梁文峰/梁文谷」)单测。
 *
 * 覆盖:
 * 1. 缺省时段表随 Scheduler 构造写入 setting,且**不拆分**(梁文谷含工作日+周末两段);
 * 2. 规则 window.profile 在 `_readConfig` 里被**展开**成内联 weekdays/times
 *    (多段全部展开),下游 _rulesFor/_staticRulesFor/排序/chain 零改动;
 * 3. 悬空 profile 引用按「无时段」处理,不拖垮整份配置。
 */
import { describe, expect, it } from "vitest";
import { InMemoryRepo, Scheduler } from "./engine.js";
import {
  SETTING_WINDOW_PROFILES,
  validWindowProfiles,
  windowProfilesMap,
} from "./engine.js";
import { DEFAULT_SCHEDULER_WINDOW_PROFILES } from "../config/types.js";

type Cfg = {
  timeWindows: Array<{ provider: string; model: string; times: unknown; weekdays?: number[]; mode: string }>;
  staticRules: Array<{ provider: string; mode: string; weekdays?: number[] }>;
};

function cfgOf(repo: InMemoryRepo): Cfg {
  const s = new Scheduler(repo);
  return (s as unknown as { _config(): Cfg })._config();
}

describe("命名时段配置:缺省播种", () => {
  it("全新库构造后写入预置时段(梁文峰/梁文谷两条,不拆分)", () => {
    const repo = new InMemoryRepo();
    new Scheduler(repo);
    const raw = repo.getSetting(SETTING_WINDOW_PROFILES);
    expect(raw).not.toBeNull();
    const list = validWindowProfiles(JSON.parse(raw as string));
    // 只有两条:梁文峰、梁文谷。周末不再单拆成第三条。
    expect(list.map((p) => p.id)).toEqual(["lwf", "lwg"]);
    expect(list.map((p) => p.name)).toEqual(["梁文峰", "梁文谷"]);

    const peak = list.find((p) => p.id === "lwf")!;
    expect(peak.segments).toHaveLength(1);
    expect(peak.segments[0].weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(peak.segments[0].times).toEqual([
      ["09:00", "12:00"],
      ["14:00", "18:00"],
    ]);

    const valley = list.find((p) => p.id === "lwg")!;
    // 梁文谷 = 工作日三段 + 周末全天,两条子规则合在**同一个** profile 里。
    expect(valley.segments).toHaveLength(2);
    expect(valley.segments[0].weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(valley.segments[0].times).toEqual([
      ["00:00", "09:00"],
      ["12:00", "14:00"],
      ["18:00", "24:00"],
    ]);
    expect(valley.segments[1].weekdays).toEqual([6, 7]);
    expect(valley.segments[1].times).toEqual([["00:00", "24:00"]]);
  });

  it("存量库(已有档位键)仍补播时段表 —— 独立守卫不受 anyKey 影响", () => {
    const repo = new InMemoryRepo();
    repo.setSetting("scheduler.rules_p1", "[]");
    new Scheduler(repo);
    expect(repo.getSetting(SETTING_WINDOW_PROFILES)).not.toBeNull();
  });

  it("已有时段表不被覆盖", () => {
    const repo = new InMemoryRepo();
    const custom = JSON.stringify([
      { id: "mine", name: "我的时段", segments: [{ weekdays: [1], times: [["10:00", "11:00"]] }] },
    ]);
    repo.setSetting(SETTING_WINDOW_PROFILES, custom);
    new Scheduler(repo);
    expect(repo.getSetting(SETTING_WINDOW_PROFILES)).toBe(custom);
  });
});

describe("validWindowProfiles / windowProfilesMap", () => {
  it("坏条目跳过、重复 id 先出现者胜、坏 times 丢弃该字段", () => {
    const list = validWindowProfiles([
      { id: "a", name: "A", segments: [{ weekdays: [1] }] },
      null,
      { id: "", name: "空 id" },
      { id: "a", name: "重复", segments: [{ weekdays: [2] }] },
      { id: "b", segments: [{ times: [["bad", "x"]] }] },
    ]);
    expect(list.map((p) => p.id)).toEqual(["a", "b"]);
    expect(list[0].name).toBe("A");
    expect(list[0].segments[0].weekdays).toEqual([1]);
    // 坏 times 被丢弃,该段因无可用字段被整段略去。
    expect(list[1].segments).toHaveLength(0);
  });

  it("兼容旧形态(顶层 weekdays/times)按单段读取", () => {
    const list = validWindowProfiles([{ id: "old", name: "旧", weekdays: [3], times: [["08:00", "09:00"]] }]);
    expect(list[0].segments).toHaveLength(1);
    expect(list[0].segments[0].weekdays).toEqual([3]);
  });

  it("坏 JSON 回落预置表;合法空表保持为空", () => {
    const bad = new InMemoryRepo();
    bad.setSetting(SETTING_WINDOW_PROFILES, "not-json");
    expect([...windowProfilesMap(bad).keys()]).toEqual(["lwf", "lwg"]);

    const empty = new InMemoryRepo();
    empty.setSetting(SETTING_WINDOW_PROFILES, "[]");
    expect(windowProfilesMap(empty).size).toBe(0);
  });
});

describe("_readConfig:profile 展开", () => {
  function repoWith(rule: Record<string, unknown>, profiles?: unknown): InMemoryRepo {
    const repo = new InMemoryRepo();
    repo.setSetting("scheduler.window_profiles", JSON.stringify(profiles ?? DEFAULT_SCHEDULER_WINDOW_PROFILES));
    repo.setSetting("scheduler.rules_p4", JSON.stringify([rule]));
    return repo;
  }

  it("P4 引用 lwf → 一条工作日 9-12/14-18 的降级时段规则", () => {
    const cfg = cfgOf(repoWith({ provider: "p1", model: "m1", window: { profile: "lwf" } }));
    const win = cfg.timeWindows.find((w) => w.provider === "p1");
    expect(win).toBeDefined();
    expect(win?.model).toBe("m1");
    expect(win?.mode).toBe("degrade");
    expect(win?.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(win?.times).toEqual([
      ["09:00", "12:00"],
      ["14:00", "18:00"],
    ]);
  });

  it("P4 引用 lwg → **两条**时段规则(工作日非高峰 + 周末全天)", () => {
    const cfg = cfgOf(repoWith({ provider: "p2", model: "m2", window: { profile: "lwg" } }));
    const wins = cfg.timeWindows.filter((w) => w.provider === "p2");
    expect(wins).toHaveLength(2);
    const workday = wins.find((w) => w.weekdays?.includes(1))!;
    const weekend = wins.find((w) => w.weekdays?.includes(6))!;
    expect(workday.times).toEqual([
      ["00:00", "09:00"],
      ["12:00", "14:00"],
      ["18:00", "24:00"],
    ]);
    expect(weekend.times).toEqual([["00:00", "24:00"]]);
  });

  it("给了 profile 就忽略内联 weekdays/times", () => {
    const cfg = cfgOf(
      repoWith({
        provider: "p3",
        model: "m3",
        window: { profile: "lwf", weekdays: [7], times: [["00:00", "01:00"]] },
      }),
    );
    const win = cfg.timeWindows.find((w) => w.provider === "p3");
    expect(win?.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(win?.times).toEqual([
      ["09:00", "12:00"],
      ["14:00", "18:00"],
    ]);
  });

  it("悬空 profile 引用 → 按无时段处理(P4 变静态降级,不进 timeWindows)", () => {
    const cfg = cfgOf(repoWith({ provider: "p4", model: "m4", window: { profile: "deleted" } }));
    expect(cfg.timeWindows.find((w) => w.provider === "p4")).toBeUndefined();
    expect(cfg.staticRules.find((r) => r.provider === "p4")?.mode).toBe("degrade");
  });

  it("P4 引用「只有星期没有时段」的 profile → 进 staticRules 且带星期", () => {
    const cfg = cfgOf(
      repoWith(
        { provider: "p5", model: "m5", window: { profile: "wd" } },
        [{ id: "wd", name: "仅周三", segments: [{ weekdays: [3] }] }],
      ),
    );
    expect(cfg.timeWindows.find((w) => w.provider === "p5")).toBeUndefined();
    const stat = cfg.staticRules.find((r) => r.provider === "p5");
    expect(stat?.mode).toBe("degrade");
    expect(stat?.weekdays).toEqual([3]);
  });
});
