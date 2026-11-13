/**
 * 调度核心测试 —— 移植自 D:\projects\nexus\tests:
 *  - test_scheduler.py(1365 行):六档排序、分桶、时段规则、记忆化、配额刷新;
 *  - test_backoff.py(24073B):backoff_delay 数值语义;
 *  - test_v4_semantics.py:InflightLedger 聚合 / 租约句柄 / 负载感知分桶。
 * 聚焦关键语义,不逐行照抄。时间夹具用「本地 naï ve 时间」,与引擎 local 语义一致。
 */
import { describe, expect, it, vi } from "vitest";
import {
  CACHEABLE_STRATEGIES,
  ChainItem,
  DEFAULT_STRATEGY,
  FREE_MODEL_PREFIXES,
  FREE_TIER_ORDER,
  GRANT_TIERS,
  HealthRegistry,
  InflightLedger,
  InMemoryRepo,
  Planner,
  PREEMPT_ERROR,
  Scheduler,
  SessionPinTable,
  STRATEGIES,
  expiryEpoch,
  isFreeModel,
  normalizeStrategy,
  setGrantTiers,
  stableBy,
  waitLimits,
  wallNow,
} from "./engine.js";
import {
  RETRY_DEFAULTS,
  RetryPolicy,
  SeededRng,
  backoffDelay,
  retryCodes,
  retrySetting,
  seedRetrySettings,
} from "./backoff.js";
import type { RawEndpointRow } from "./types.js";

// ---------------------------------------------------------------------------
// 夹具(对齐 test_scheduler.py 的 seed 结构)
// ---------------------------------------------------------------------------

/** 2026-10-{day} 本地时间 epoch 秒(day=7 周三,8 周四,11 周六)。 */
function at(hour: number, minute = 0, day = 7): number {
  return new Date(2026, 9, day, hour, minute, 0, 0).getTime() / 1000;
}

/** 与 test_scheduler.py SEAT 一致的账号名。 */
const SEAT: Record<string, string> = {
  longcat: "longcat",
  tokenrhythm: "tokenrhythm",
  workbuddy: "石英的石英块",
  trae: "bvbhu",
};

/** endpoint_chain 行:member + endpoint(v4 形状)。 */
function endpointRow(
  provider: string,
  model: string,
  username: string,
  opts: { concurrency?: number; vision?: boolean } = {},
): RawEndpointRow {
  return {
    member: { provider, model },
    endpoint: {
      provider_id: provider,
      upstream_id: model,
      credential_key: [provider, username],
      concurrency: opts.concurrency ?? 1,
      supports_vision: opts.vision ?? false,
    },
  };
}

/** 直接构造 ChainItem(测试用)。 */
function chainItem(
  provider: string,
  model: string,
  username: string,
  opts: { concurrency?: number; vision?: boolean; priority?: number; strategy?: string } = {},
): ChainItem {
  const row = endpointRow(provider, model, username, opts);
  return ChainItem.fromData({
    endpoint: row.endpoint,
    priority: opts.priority ?? 0,
    strategy: opts.strategy ?? "",
  });
}

function seedNexusFlash(repo: InMemoryRepo): void {
  const members: Array<[string, string]> = [
    ["workbuddy", "hy4-preview"],
    ["tokenrhythm", "tr-alpha-channel"],
    ["longcat", "LongCat-2.5-Preview"],
    ["tokenrhythm", "glm-5.3-flash"],
    ["trae", "glm-5.3-flash"],
    ["workbuddy", "glm-5.3-flash"],
  ];
  repo.setLogicalModel("as-one-flash", { strategy: "due-first" });
  repo.setMembers("as-one-flash", members.map(([p, m]) => ({ provider: p, model: m })));
  repo.setChain("as-one-flash", members.map(([p, m]) => endpointRow(p, m, SEAT[p]!)));
}

function seedDeepseekFlash(repo: InMemoryRepo): void {
  const members: Array<[string, string]> = [
    ["tokenrhythm", "deepseek-flash"],
    ["trae", "deepseek-v4.1-flash"],
    ["workbuddy", "deepseek-v4.1-flash"],
  ];
  repo.setLogicalModel("deepseek-flash", { strategy: "due-first" });
  repo.setMembers("deepseek-flash", members.map(([p, m]) => ({ provider: p, model: m })));
  repo.setChain("deepseek-flash", members.map(([p, m]) => endpointRow(p, m, SEAT[p]!)));
}

/**
 * 显式播种「2026-10-30 之前的产品缺省」那 8 条规则。
 *
 * 用户定案后 ``CONFIG_DEFAULT_RULES`` 恒空 —— 代码里不留任何供应商/模型缺省
 * (否则新装的机器会先按别人的账号、到期日和降级时段跑)。原先靠这份缺省才能
 * 成立的用例(免费档 T1、P0 禁用时段、P4 高峰降级、赠送档插队),现在用这个
 * 夹具显式喂进来:内容与旧缺省逐字一致,断言不用改;变的是「谁提供规则」。
 *
 * 元素形态与库里一致:键名即档位,数组元素里**不带 priority**。
 */
function seedLegacyRules(repo: InMemoryRepo): void {
  const byPriority: Record<number, unknown[]> = {
    1: [
      { provider: "workbuddy", model: "hy4-preview", expires_at: "2026-10-31" },
      { provider: "workbuddy", model: "step-5-preview", expires_at: "2026-10-25" },
    ],
    2: [
      { provider: "longcat", expires_at: "2026-10-27" },
      { provider: "tokenrhythm", expires_at: "2026-11-09" },
      { provider: "stepfun", expires_at: "2026-12-19" },
    ],
    3: [],
    4: [
      {
        provider: "workbuddy",
        model: "deepseek-v4.1-flash",
        window: {
          weekdays: [1, 2, 3, 4, 5],
          times: [
            ["09:00", "12:00"],
            ["14:00", "18:00"],
          ],
        },
      },
      { provider: "trae", model: "deepseek-v4.1-flash", window: { times: [["08:00", "22:00"]] } },
    ],
    0: [{ provider: "workbuddy", model: "hy4-preview", window: { times: [["08:00", "23:00"]] } }],
  };
  for (const [priority, rules] of Object.entries(byPriority)) {
    repo.setSetting(`scheduler.rules_p${priority}`, JSON.stringify(rules));
  }
}

function seedAaaBbbCcc(repo: InMemoryRepo): void {
  repo.setLogicalModel("m", { strategy: "ordered-fallback" });
  repo.setMembers("m", [
    { provider: "aaa", model: "m" },
    { provider: "bbb", model: "m" },
    { provider: "ccc", model: "m" },
  ]);
  repo.setChain("m", [
    endpointRow("aaa", "m", "seat"),
    endpointRow("bbb", "m", "seat"),
    endpointRow("ccc", "m", "seat"),
  ]);
}

/** probe 负载感知夹具:caps 为 [model, 并发] 列表,seats 为每模型凭据数。 */
function seedProbe(
  repo: InMemoryRepo,
  models: Array<[string, number]>,
  seats: number,
  strategy = "due-first",
): void {
  repo.setLogicalModel("probe", { strategy });
  repo.setMembers("probe", models.map(([m]) => ({ provider: "probe", model: m })));
  const rows: RawEndpointRow[] = [];
  for (const [m, cap] of models) {
    for (let i = 0; i < seats; i++) {
      rows.push(endpointRow("probe", m, `u${i}`, { concurrency: cap }));
    }
  }
  repo.setChain("probe", rows);
}

/** 连续 plan+commit n 次(每次独立 session),返回真实模型键;失败 → null。 */
function take(planner: Planner, chain: ChainItem[], n: number, prefix = "t"): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < n; i++) {
    const plan = planner.plan(chain, { sessionId: `${prefix}${i}` });
    if (plan.item === null) {
      out.push(null);
      continue;
    }
    out.push(plan.item.endpoint.realModelKey);
    planner.commit(plan, { sessionId: `${prefix}${i}` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// backoff_delay 数值语义(test_backoff.py)
// ---------------------------------------------------------------------------

describe("backoff_delay", () => {
  it("公式精确:n 夹紧、指数、上限封顶、零抖动确定性", () => {
    // attempt<=1 → n=1 → base * factor^0
    expect(backoffDelay({ attempt: 0, baseS: 1, capS: 15, jitterRatio: 0 })).toBe(1);
    expect(backoffDelay({ attempt: 1, baseS: 1, capS: 15, jitterRatio: 0 })).toBe(1);
    expect(backoffDelay({ attempt: -3, baseS: 1, capS: 15, jitterRatio: 0 })).toBe(1);
    // attempt 4 → 1*2^3 = 8
    expect(backoffDelay({ attempt: 4, baseS: 1, capS: 15, jitterRatio: 0 })).toBe(8);
    // attempt 5 → 16 撞 cap 15
    expect(backoffDelay({ attempt: 5, baseS: 1, capS: 15, jitterRatio: 0 })).toBe(15);
    // 非整数 attempt 截断
    expect(backoffDelay({ attempt: 2.9, baseS: 1, capS: 15, jitterRatio: 0 })).toBe(2);
  });

  it("抖动只向下、同种子可复现、ratio>1 夹紧到 1.0", () => {
    const rng1 = new SeededRng(42);
    // attempt=1 → raw = min(cap, base * factor^0) = 2;uniform(1.6, 2)
    const v = backoffDelay({ attempt: 1, baseS: 2, capS: 100, jitterRatio: 0.2, rng: rng1 });
    expect(v).toBeGreaterThanOrEqual(2 * 0.8);
    expect(v).toBeLessThanOrEqual(2);
    // 同种子 → 同值
    const rng2 = new SeededRng(42);
    expect(backoffDelay({ attempt: 1, baseS: 2, capS: 100, jitterRatio: 0.2, rng: rng2 })).toBe(v);
    // ratio>1 → clamp 1.0 → uniform(0, raw)
    const wide = backoffDelay({
      attempt: 1,
      baseS: 5,
      capS: 100,
      jitterRatio: 3,
      rng: new SeededRng(1),
    });
    expect(wide).toBeGreaterThanOrEqual(0);
    expect(wide).toBeLessThanOrEqual(5);
  });
});

describe("RetryPolicy", () => {
  it("of:abstract 用 logical_max=1,real 用 real_max=10;cooldown_floor=logical_cooldown*60", () => {
    const repo = new InMemoryRepo();
    seedRetrySettings(repo);
    const abstract = RetryPolicy.of(repo, { abstract: true });
    const real = RetryPolicy.of(repo, { abstract: false });
    expect(abstract.maxAttempts).toBe(1);
    expect(real.maxAttempts).toBe(10);
    expect(abstract.cooldownFloorS).toBe(15 * 60);
    expect(abstract.baseS).toBe(1);
    expect(abstract.capS).toBe(15);
    expect(abstract.jitterRatio).toBe(0.2);
    expect(abstract.factor).toBe(2);
    for (const code of ["timeout", "connection", "429", "500", "502", "503", "504"]) {
      expect(abstract.codes.has(code)).toBe(true);
    }
    expect(real.delayFor(1)).toBeGreaterThanOrEqual(0.8);
    expect(real.delayFor(1)).toBeLessThanOrEqual(1);
  });

  it("shouldRetry 三分支:reset_deadline / retryable / kind∩status", () => {
    const repo = new InMemoryRepo();
    seedRetrySettings(repo);
    const p = RetryPolicy.of(repo, { abstract: false });
    const now = wallNow();
    expect(p.shouldRetry({ reset_deadline: now + 1000 }, now)).toBe(false);
    expect(p.shouldRetry({ retryable: false }, now)).toBe(false);
    expect(p.shouldRetry({ retryable: true }, now)).toBe(true);
    expect(p.shouldRetry({ kind: "timeout" }, now)).toBe(true);
    expect(p.shouldRetry({ kind: { value: "http" }, http_status: 503 }, now)).toBe(true);
    expect(p.shouldRetry({ kind: "weird" }, now)).toBe(false);
    expect(p.shouldRetry({}, now)).toBe(false);
  });

  it("retrySetting 播种/纠错:缺失写缺省,坏值写回,整数键按整数", () => {
    const repo = new InMemoryRepo();
    // 缺失 → 播种缺省并返回
    expect(retrySetting(repo, "retry.base_backoff_s")).toBe(1.0);
    expect(repo.getSetting("retry.base_backoff_s")).toBe(String(RETRY_DEFAULTS["retry.base_backoff_s"]));
    // 坏值 → 写回缺省
    repo.setSetting("retry.max_backoff_s", "abc");
    expect(retrySetting(repo, "retry.max_backoff_s")).toBe(15.0);
    expect(repo.getSetting("retry.max_backoff_s")).toBe(String(RETRY_DEFAULTS["retry.max_backoff_s"]));
    // 整数键(logical_max)按整数归整
    repo.setSetting("retry.logical_max", "2.9");
    expect(retrySetting(repo, "retry.logical_max")).toBe(2);
    // 未知键 / retry.codes 抛错
    expect(() => retrySetting(repo, "retry.nope")).toThrow();
    expect(() => retrySetting(repo, "retry.codes")).toThrow(/retryCodes/);
    expect(retryCodes(repo).size).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 纯函数 helper(test_scheduler.py sec_stable_order / sec_strategies / sec_basics)
// ---------------------------------------------------------------------------

describe("helpers", () => {
  it("stable_by:字典序排列、并列保配置序、不修改输入", () => {
    expect(stableBy([])).toEqual([]);
    expect(stableBy([[1], [1], [1]])).toEqual([0, 1, 2]);
    expect(stableBy([[3], [1], [2]])).toEqual([1, 2, 0]);
    expect(
      stableBy([
        [1],
        [2],
        [1],
        [2],
      ]),
    ).toEqual([0, 2, 1, 3]);
    const input = [[2], [1]];
    const copy = input.map((r) => [...r]);
    stableBy(input);
    expect(input).toEqual(copy);
  });

  it("normalize_strategy:机器键/legacy 全名/子串提示 → 机器键,未知 → due-first", () => {
    expect(normalizeStrategy("due-first")).toBe("due-first");
    expect(normalizeStrategy("最先到期")).toBe("due-first");
    expect(normalizeStrategy("用量平衡")).toBe("least-busy");
    expect(normalizeStrategy("usage-balanced")).toBe("least-busy");
    expect(normalizeStrategy("usage-based-routing-v2")).toBe("least-busy");
    expect(normalizeStrategy("按序降级链")).toBe("ordered-fallback");
    expect(normalizeStrategy("最少在途")).toBe("least-busy");
    expect(normalizeStrategy("平均使用")).toBe("balanced");
    expect(normalizeStrategy("随机")).toBe("random");
    expect(normalizeStrategy("due")).toBe("due-first");
    expect(normalizeStrategy("完全未知的字符串")).toBe(DEFAULT_STRATEGY);
    expect(normalizeStrategy("")).toBe(DEFAULT_STRATEGY);
    expect(normalizeStrategy(null)).toBe(DEFAULT_STRATEGY);
  });

  it("is_free_model:模块级名单恒空(2026-10-30 移除代码缺省)", () => {
    // 免费档不再来自代码常量 —— 由用户在设置页 P1 卡里配,判定走 Scheduler._isFreeModel。
    for (const id of [
      "workbuddy/hy4-preview",
      "workbuddy/step-5-preview",
      "tokenrhythm/tr-alpha-channel",
      "openrouter/openrouter/free",
    ]) {
      expect(isFreeModel(id)).toBe(false);
    }
    expect(FREE_MODEL_PREFIXES).toEqual([]);
    expect(FREE_TIER_ORDER).toEqual(FREE_MODEL_PREFIXES);
  });
});

// ---------------------------------------------------------------------------
// Scheduler:档位排序、时段规则、记忆化、配额刷新
// ---------------------------------------------------------------------------

describe("Scheduler.due-first 档位排序", () => {
  it("夜间:免费档 T1 居首,T3 到期升序,未知到期排末(sec_nexus_flash)", () => {
    const repo = new InMemoryRepo();
    seedNexusFlash(repo);
    seedLegacyRules(repo);
    const sched = new Scheduler(repo);
    const plan = sched.planMembers("as-one-flash", { now: at(3, 0) });
    const ids = plan.map((m) => m.realModelId);
    expect(ids).toEqual([
      "workbuddy/hy4-preview",
      "longcat/LongCat-2.5-Preview",
      "tokenrhythm/tr-alpha-channel",
      "tokenrhythm/glm-5.3-flash",
      "trae/glm-5.3-flash",
      "workbuddy/glm-5.3-flash",
    ]);
    expect(plan[0]!.free).toBe(true);
    expect(plan[1]!.free).toBe(false);
    expect(plan[0]!.reason).toBe("T1 免费档(名单第 1 位)");
    expect(plan[1]!.reason).toContain("T3 消耗档 到期");
    expect(plan[2]!.reason).toBe("T3 消耗档 到期 2026-11-09 00:00:00");
    // 未知到期 → 排本层末
    expect(plan[4]!.reason).toBe("T3 消耗档 到期未知(排本层末)");
    // 到期数值:longcat 10-27 早于 tokenrhythm 11-09
    expect(plan[1]!.expiresAt).toBe(expiryEpoch("2026-10-27"));
    expect(plan[1]!.expiresAt! < plan[2]!.expiresAt!).toBe(true);
  });

  it("排除规则:命中时段剔除(chain 与 plan_members 视角不同),时段外恢复", () => {
    const repo = new InMemoryRepo();
    seedNexusFlash(repo);
    seedLegacyRules(repo);
    const sched = new Scheduler(repo);
    // 09:00:hy4 的禁用规则 [08:00,23:00) 命中 → chain 剔除,plan_members 仍列首位
    const chain9 = sched.chain("as-one-flash", { now: at(9, 0) });
    expect(chain9.map((c) => c.endpoint.realModelKey)[0]).toBe("longcat/LongCat-2.5-Preview");
    expect(chain9.some((c) => c.endpoint.realModelKey === "workbuddy/hy4-preview")).toBe(false);
    const plan9 = sched.planMembers("as-one-flash", { now: at(9, 0) });
    expect(plan9[0]!.realModelId).toBe("workbuddy/hy4-preview");
    // chain 条目带命中时段的 blackout 元信息
    const longcat = chain9.find((c) => c.endpoint.realModelKey === "longcat/LongCat-2.5-Preview")!;
    expect(longcat.priority).toBe(1);
    expect(longcat.strategy).toBe("due-first");
    // 23:30 规则不命中 → hy4 回到首位
    const chain2330 = sched.chain("as-one-flash", { now: at(23, 30) });
    expect(chain2330.map((c) => c.endpoint.realModelKey)[0]).toBe("workbuddy/hy4-preview");
  });

  it("降级规则:命中时段降到最末而非剔除;weekdays 只工作日生效(sec_deepseek_flash)", () => {
    const repo = new InMemoryRepo();
    seedDeepseekFlash(repo);
    seedLegacyRules(repo);
    const sched = new Scheduler(repo);
    const ids = (t: number) => sched.chain("deepseek-flash", { now: t }).map((c) => c.endpoint.realModelKey);
    // 周三 09:00:trae(08-22 全天)+ workbuddy(工作日 09-12)→ 双双降级
    expect(ids(at(9, 0, 7))).toEqual([
      "tokenrhythm/deepseek-flash",
      "trae/deepseek-v4.1-flash",
      "workbuddy/deepseek-v4.1-flash",
    ]);
    // 12:00:workbuddy 时段右开退出 → 只剩 trae 降级
    expect(ids(at(12, 0, 7))).toEqual([
      "tokenrhythm/deepseek-flash",
      "workbuddy/deepseek-v4.1-flash",
      "trae/deepseek-v4.1-flash",
    ]);
    // 周六 09:00:workbuddy 的 weekdays 1-5 不命中 → 只剩 trae
    expect(ids(at(9, 0, 11))).toEqual([
      "tokenrhythm/deepseek-flash",
      "workbuddy/deepseek-v4.1-flash",
      "trae/deepseek-v4.1-flash",
    ]);
    // 23:00:全部退出 → 配置序
    expect(ids(at(23, 0, 7))).toEqual([
      "tokenrhythm/deepseek-flash",
      "trae/deepseek-v4.1-flash",
      "workbuddy/deepseek-v4.1-flash",
    ]);
    const plan = sched.planMembers("deepseek-flash", { now: at(9, 0, 7) });
    expect(plan[2]!.reason).toContain("降级");
  });

  it("无时段 P4 规则生效:sensenova 排链末(回归:2026-11-07 用户报 P4 未生效)", () => {    const members: Array<[string, string]> = [
      ["sensenova", "model-a"],
      ["other", "model-b"],
    ];
    const seed = (repo: InMemoryRepo) => {
      repo.setLogicalModel("p4-demo", { strategy: "due-first" });
      repo.setMembers("p4-demo", members.map(([p, m]) => ({ provider: p, model: m })));
      repo.setChain("p4-demo", members.map(([p, m]) => endpointRow(p, m, "u1")));
    };
    // 基线:没有规则时保持配置序,sensenova 居首(旧 bug 的正确残留形态)。
    const baseline = new InMemoryRepo();
    seed(baseline);
    expect(
      new Scheduler(baseline).chain("p4-demo", { now: at(3, 0) }).map((c) => c.endpoint.realModelKey),
    ).toEqual(["sensenova/model-a", "other/model-b"]);
    // P4 无时段:sensenova 命中降级 → 排链末。
    // 此前无时段的 P4 规则在 _readConfig 里被整条丢弃,sensenova 仍居首 —— 这就是用户报的 bug。
    const repo = new InMemoryRepo();
    seed(repo);
    repo.setSetting("scheduler.rules_p4", JSON.stringify([{ provider: "sensenova" }]));
    const sched = new Scheduler(repo);
    expect(sched.chain("p4-demo", { now: at(3, 0) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "other/model-b",
      "sensenova/model-a",
    ]);
    const plan = sched.planMembers("p4-demo", { now: at(3, 0) });
    expect(plan.map((m) => m.realModelId)).toEqual(["other/model-b", "sensenova/model-a"]);
    expect(plan[1]!.reason).toMatch(/降级/);
  });

  it("只勾星期的 P4 规则按星期生效(不能退化成「每天都降级」)", () => {
    const members: Array<[string, string]> = [
      ["sensenova", "model-a"],
      ["other", "model-b"],
    ];
    const repo = new InMemoryRepo();
    repo.setLogicalModel("p4-weekday", { strategy: "due-first" });
    repo.setMembers("p4-weekday", members.map(([p, m]) => ({ provider: p, model: m })));
    repo.setChain("p4-weekday", members.map(([p, m]) => endpointRow(p, m, "u1")));
    // 只勾周三(weekday 3),不填时间段 —— 面板允许这种写法
    repo.setSetting(
      "scheduler.rules_p4",
      JSON.stringify([{ provider: "sensenova", window: { weekdays: [3] } }]),
    );
    const sched = new Scheduler(repo);
    // 2026-10-07 是周三 → 降级生效,sensenova 排末
    expect(sched.chain("p4-weekday", { now: at(3, 0, 7) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "other/model-b",
      "sensenova/model-a",
    ]);
    // 2026-10-08 是周四 → 规则不生效,保持配置序
    expect(sched.chain("p4-weekday", { now: at(3, 0, 8) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "sensenova/model-a",
      "other/model-b",
    ]);
  });

  it("P4 指定 model 时只降级该模型(其它同供应商模型不受影响)", () => {
    const members: Array<[string, string]> = [
      ["sensenova", "model-a"],
      ["sensenova", "model-b"],
      ["other", "model-c"],
    ];
    const repo = new InMemoryRepo();
    repo.setLogicalModel("p4-scope", { strategy: "due-first" });
    repo.setMembers("p4-scope", members.map(([p, m]) => ({ provider: p, model: m })));
    repo.setChain("p4-scope", members.map(([p, m]) => endpointRow(p, m, "u1")));
    repo.setSetting("scheduler.rules_p4", JSON.stringify([{ provider: "sensenova", model: "model-a" }]));
    const sched = new Scheduler(repo);
    expect(sched.chain("p4-scope", { now: at(3, 0) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "sensenova/model-b",
      "other/model-c",
      "sensenova/model-a",
    ]);
  });

  it("无时段 P0(禁用档)整条剔除;plan_members 仍保留(与时段 P0 语义一致)", () => {
    const members: Array<[string, string]> = [
      ["fine", "m"],
      ["bad", "m"],
    ];
    const repo = new InMemoryRepo();
    repo.setLogicalModel("p0-static", { strategy: "due-first" });
    repo.setMembers("p0-static", members.map(([p, m]) => ({ provider: p, model: m })));
    repo.setChain("p0-static", members.map(([p, m]) => endpointRow(p, m, "u1")));
    repo.setSetting("scheduler.rules_p0", JSON.stringify([{ provider: "bad" }]));
    const sched = new Scheduler(repo);
    // chain 视角:bad 整条拿掉
    expect(sched.chain("p0-static", { now: at(3, 0) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "fine/m",
    ]);
    // plan_members 视角:退化成员仍在列(与时段 P0 的「chain 剔除 / plan 保留」语义一致)
    expect(sched.planMembers("p0-static", { now: at(3, 0) }).map((m) => m.realModelId)).toEqual([
      "fine/m",
      "bad/m",
    ]);
  });

  it("降级对全部策略生效:缺省 random 也不再让 P4 成员排到前面", () => {
    // 回归:2026-11-07 用户报「P4 配了 sensenova 仍被优先调用」。
    // 除了「无时段 P4 规则被丢弃」,还有第二个坑:**只有 due-first 看降级**,
    // random(缺省策略)/ordered-fallback/least-busy/balanced 全都忽略降级规则,
    // 于是 random 打散后降级项照样有 1/N 机会排第一。
    const members: Array<[string, string]> = [
      ["sensenova", "m1"],
      ["alpha", "m2"],
      ["beta", "m3"],
    ];
    for (const strategy of ["random", "ordered-fallback", "least-busy", "balanced"] as const) {
      const repo = new InMemoryRepo();
      repo.setLogicalModel("p4-all", { strategy });
      repo.setMembers("p4-all", members.map(([p, m]) => ({ provider: p, model: m })));
      repo.setChain("p4-all", members.map(([p, m]) => endpointRow(p, m, "u1")));
      repo.setSetting("scheduler.rules_p4", JSON.stringify([{ provider: "sensenova" }]));
      const sched = new Scheduler(repo, { seed: 7 });
      // random 每次都重排 → 连跑 12 次,降级项必须**每次**都在末尾
      for (let i = 0; i < 12; i++) {
        const ids = sched.chain("p4-all", { now: at(3, 0) + i * 60 }).map((c) => c.endpoint.realModelKey);
        expect(ids).toHaveLength(3);
        expect(ids[ids.length - 1]).toBe("sensenova/m1");
        expect(ids.slice(0, 2).sort()).toEqual(["alpha/m2", "beta/m3"]);
      }
    }
  });

  it("无规则时行为完全不变:各策略保持配置序 / 随机打散", () => {
    const members: Array<[string, string]> = [
      ["aaa", "m"],
      ["bbb", "m"],
      ["ccc", "m"],
    ];
    for (const strategy of ["ordered-fallback", "least-busy", "balanced"] as const) {
      const repo = new InMemoryRepo();
      repo.setLogicalModel("plain", { strategy });
      repo.setMembers("plain", members.map(([p, m]) => ({ provider: p, model: m })));
      repo.setChain("plain", members.map(([p, m]) => endpointRow(p, m, "u1")));
      const ids = new Scheduler(repo).chain("plain", { now: at(3, 0) }).map((c) => c.endpoint.realModelKey);
      expect(ids).toEqual(["aaa/m", "bbb/m", "ccc/m"]);
    }
  });

  it("T1 < T2 < T3:赠送档插在免费档与消耗档之间(GRANT_TIERS 注入)", () => {
    const repo = new InMemoryRepo();
    const members: Array<[string, string]> = [
      ["zzz", "no-expiry"],
      ["tokenrhythm", "glm-5.3-flash"],
      ["longcat", "LongCat-2.5-Preview"],
      ["workbuddy", "step-5-preview"],
      ["workbuddy", "hy4-preview"],
    ];
    repo.setLogicalModel("tiers", { strategy: "due-first" });
    repo.setMembers("tiers", members.map(([p, m]) => ({ provider: p, model: m })));
    repo.setChain("tiers", members.map(([p, m]) => endpointRow(p, m, "u1")));
    seedLegacyRules(repo);
    setGrantTiers([["zzz", "no-expiry"]]);
    try {
      const sched = new Scheduler(repo);
      const ids = sched.chain("tiers", { now: at(3, 0) }).map((c) => c.endpoint.realModelKey);
      expect(ids).toEqual([
        "workbuddy/hy4-preview",
        "workbuddy/step-5-preview",
        "zzz/no-expiry",
        "longcat/LongCat-2.5-Preview",
        "tokenrhythm/glm-5.3-flash",
      ]);
    } finally {
      setGrantTiers([]);
    }
    expect(GRANT_TIERS).toEqual([]);
  });

  it("运行期配额到期(trae/workbuddy 探针实时值)决定 T3 顺序;撤掉配额 → 回落配置序", () => {
    // 基线:无运行期配额。注意 seedDeepseekFlash 不带任何窗口/赠送档规则 ——
    // tokenrhythm 的到期来自**配置** creditExpiry(2026-11-09),trae 在 11-04 有降级窗口,
    // 那两条都在其它 it 里各自加了规则;这里只看「纯消耗档 + 全部到期并列」的配置序。
    const repo = new InMemoryRepo();
    const members: Array<[string, string]> = [
      ["trae", "deepseek-v4.1-flash"],
      ["workbuddy", "deepseek-v4.1-flash"],
    ];
    repo.setLogicalModel("wb-vs-trae", { strategy: "due-first" });
    repo.setMembers("wb-vs-trae", members.map(([p, m]) => ({ provider: p, model: m })));
    repo.setChain("wb-vs-trae", members.map(([p, m]) => endpointRow(p, m, SEAT[p]!)));
    const sched = new Scheduler(repo);
    // 基线:无配额 → 到期全 null → 排序键完全并列 → 按 members 数组序(trae 先)
    expect(sched.chain("wb-vs-trae", { now: at(23, 0) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "trae/deepseek-v4.1-flash",
      "workbuddy/deepseek-v4.1-flash",
    ]);
    // 只报 workbuddy 的真实到期(11-02)→ 它必须先于到期未知的 trae
    repo.setQuota("workbuddy/石英的石英块", { expires_at: expiryEpoch("2026-11-02")! });
    sched.invalidate();
    expect(sched.chain("wb-vs-trae", { now: at(23, 0) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "workbuddy/deepseek-v4.1-flash",
      "trae/deepseek-v4.1-flash",
    ]);
    // 两个都报到期、workbuddy 更早 → 仍 workbuddy 先
    repo.setQuota("trae/bvbhu", { expires_at: expiryEpoch("2026-11-05")! });
    sched.invalidate();
    const plan = sched.planMembers("wb-vs-trae", { now: at(23, 0) });
    expect(plan.map((m) => m.realModelId)).toEqual([
      "workbuddy/deepseek-v4.1-flash",
      "trae/deepseek-v4.1-flash",
    ]);
    expect(plan[0]!.reason).toBe("T3 消耗档 到期 2026-11-02 00:00:00");
    // 反过来:trae 更早到期 → trae 先
    repo.setQuota("trae/bvbhu", { expires_at: expiryEpoch("2026-10-30")! });
    sched.invalidate();
    expect(sched.chain("wb-vs-trae", { now: at(23, 0) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "trae/deepseek-v4.1-flash",
      "workbuddy/deepseek-v4.1-flash",
    ]);
    // 全撤 → 回到并列/配置序
    repo.dropQuota("trae/bvbhu");
    repo.dropQuota("workbuddy/石英的石英块");
    sched.invalidate();
    expect(sched.chain("wb-vs-trae", { now: at(23, 0) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "trae/deepseek-v4.1-flash",
      "workbuddy/deepseek-v4.1-flash",
    ]);
  });

  it("凭据自身没有到期时,回落 provider 级聚合到期(多账号取最早,用户 m34799)", () => {
    // 场景:workbuddy 有两个号,只有「石英的石英块」那个探到了到期(11-02);
    // trae 一个号探到 11-05。装配层会额外写一行 `quotas["workbuddy"]` =
    // 各账号到期取最早(channels.ts 的 quotaRollupOf)。这里验的是:
    // 1) 该号自己的凭据级快照 → 命中,用 11-02;
    // 2) 换成另一个**没有自身快照**的号(seat-2)→ 仍要靠 provider 级聚合拿到 11-02,
    //    否则它会被当成「永不到期」排到 trae 前面。
    const repo = new InMemoryRepo();
    repo.setLogicalModel("wb-vs-trae2", { strategy: "due-first" });
    repo.setMembers("wb-vs-trae2", [
      { provider: "trae", model: "deepseek-v4.1-flash" },
      { provider: "workbuddy", model: "deepseek-v4.1-flash" },
    ]);
    repo.setChain("wb-vs-trae2", [
      // workbuddy 用一个**没有自己配额行**的号
      endpointRow("workbuddy", "deepseek-v4.1-flash", "seat-2"),
      endpointRow("trae", "deepseek-v4.1-flash", SEAT["trae"]!),
    ]);
    const sched = new Scheduler(repo);
    // 什么都不给 → 到期全空 → 并列 → members 序(trae 先)
    expect(
      sched.chain("wb-vs-trae2", { now: at(23, 0) }).map((c) => c.endpoint.realModelKey),
    ).toEqual(["trae/deepseek-v4.1-flash", "workbuddy/deepseek-v4.1-flash"]);
    // 只给 workbuddy 的 provider 级聚合(11-02 最早)+ trae 的凭据级 11-05
    repo.setQuota("workbuddy", { expires_at: expiryEpoch("2026-11-02")!, remaining: 5000 });
    repo.setQuota("trae/bvbhu", { expires_at: expiryEpoch("2026-11-05")! });
    sched.invalidate();
    expect(
      sched.chain("wb-vs-trae2", { now: at(23, 0) }).map((c) => c.endpoint.realModelKey),
    ).toEqual(["workbuddy/deepseek-v4.1-flash", "trae/deepseek-v4.1-flash"]);
    // trae 改成更早 → trae 先(证明 provider 级那一行没把 trae 抢走)
    repo.setQuota("trae/bvbhu", { expires_at: expiryEpoch("2026-10-31")! });
    sched.invalidate();
    expect(
      sched.chain("wb-vs-trae2", { now: at(23, 0) }).map((c) => c.endpoint.realModelKey),
    ).toEqual(["trae/deepseek-v4.1-flash", "workbuddy/deepseek-v4.1-flash"]);
    // 凭据级优先于 provider 级:同一 provider 的号自己有读数时用自己的
    repo.setQuota("workbuddy/seat-2", { expires_at: expiryEpoch("2026-10-30")! });
    sched.invalidate();
    expect(
      sched.chain("wb-vs-trae2", { now: at(23, 0) }).map((c) => c.endpoint.realModelKey),
    ).toEqual(["workbuddy/deepseek-v4.1-flash", "trae/deepseek-v4.1-flash"]);
    const plan = sched.planMembers("wb-vs-trae2", { now: at(23, 0) });
    expect(plan[0]!.reason).toBe("T3 消耗档 到期 2026-10-30 00:00:00");
  });
});

describe("Scheduler.策略选择", () => {
  it("ordered-fallback:数组顺序即档链(sec_strategies)", () => {
    const repo = new InMemoryRepo();
    seedAaaBbbCcc(repo);
    repo.setLogicalModel("m", { strategy: "ordered-fallback" });
    const sched = new Scheduler(repo);
    expect(sched.chain("m", { now: at(3, 0) }).map((c) => c.endpoint.realModelKey)).toEqual([
      "aaa/m",
      "bbb/m",
      "ccc/m",
    ]);
    // 倒序成员 → 倒序档链(force 绕过同分钟记忆化,同 Nexus force=True)
    repo.setMembers("m", [
      { provider: "ccc", model: "m" },
      { provider: "bbb", model: "m" },
      { provider: "aaa", model: "m" },
    ]);
    expect(
      sched.chain("m", { now: at(3, 0), force: true }).map((c) => c.endpoint.realModelKey),
    ).toEqual(["ccc/m", "bbb/m", "aaa/m"]);
  });

  it("due-first 尊重配额到期而非配置序;least-busy/balanced 只出配置序 + 策略标签", () => {
    const repo = new InMemoryRepo();
    seedAaaBbbCcc(repo);
    // 配额:ccc 最早到期 → due-first 排最前
    repo.setQuota("ccc/seat", { expires_at: new Date(2026, 0, 1).getTime() / 1000 });
    repo.setQuota("bbb/seat", { expires_at: new Date(2026, 5, 1).getTime() / 1000 });
    const due = new Scheduler(repo);
    repo.setLogicalModel("m", { strategy: "due-first" });
    expect(due.planMembers("m", { now: at(3, 0) }).map((x) => x.realModelId)).toEqual([
      "ccc/m",
      "bbb/m",
      "aaa/m",
    ]);
    // least-busy:配置序,原因指向选路器
    const lb = new Scheduler(repo);
    repo.setLogicalModel("m", { strategy: "least-busy" });
    const lbPlan = lb.planMembers("m", { now: at(3, 0) });
    expect(lbPlan.map((x) => x.realModelId)).toEqual(["aaa/m", "bbb/m", "ccc/m"]);
    expect(lbPlan[0]!.reason).toContain("选路器");
    // balanced:配置序,原因含加权随机
    const bal = new Scheduler(repo);
    repo.setLogicalModel("m", { strategy: "balanced" });
    const balPlan = bal.planMembers("m", { now: at(3, 0) });
    expect(balPlan.map((x) => x.realModelId)).toEqual(["aaa/m", "bbb/m", "ccc/m"]);
    expect(balPlan[0]!.reason).toContain("加权随机");
    const snap = lb.snapshot();
    expect(snap.load_aware_strategies).toEqual(["least-busy", "balanced"]);
    expect(snap.strategies).toEqual(STRATEGIES);
    expect(snap.default_strategy).toBe("due-first");
  });

  it("缺省策略是 due-first(2026-11-08);到期未知排同档**末位**,不抢快过期的位", () => {
    // 用户定案:号池要先把**快到期的额度**用掉。所以默认策略从 random 改成 due-first;
    // 同时钉住一个曾被注释写反的疑点:expiry=null 不是「永不过期所以先用」——
    // 它的排序键是 Infinity,落在 T3 末位(快过期的先上、未知的垫底)。
    const repo = new InMemoryRepo();
    // ⚠️ 刻意**不写** strategy:走 DEFAULT_STRATEGY。
    repo.setMembers("m", [
      { provider: "aaa", model: "m" }, // 到期未知 → 排末位
      { provider: "bbb", model: "m" }, // 晚到期
      { provider: "ccc", model: "m" }, // 最早到期 → 先上
    ]);
    repo.setChain("m", [
      endpointRow("aaa", "m", "seat"),
      endpointRow("bbb", "m", "seat"),
      endpointRow("ccc", "m", "seat"),
    ]);
    repo.setQuota("bbb/seat", { expires_at: new Date(2026, 11, 1).getTime() / 1000 });
    repo.setQuota("ccc/seat", { expires_at: new Date(2026, 0, 1).getTime() / 1000 });
    const sched = new Scheduler(repo);
    const plan = sched.planMembers("m", { now: at(3, 0) });
    expect(plan.map((x) => x.realModelId)).toEqual(["ccc/m", "bbb/m", "aaa/m"]);
    expect(plan[2]!.reason).toContain("到期未知");
    expect(plan[2]!.expiresAt).toBeNull();
    // 缺省值本身也锁住(面板读 snapshot().default_strategy 展示,别悄悄回退)。
    expect(DEFAULT_STRATEGY).toBe("due-first");
    expect(sched.snapshot().default_strategy).toBe("due-first");
  });

  it("号池选 key:同一真实模型多凭据,链上按各自到期升序,最快到期的 key 在前(2026-11-09 定案)", () => {
    // 场景:trae 一个模型挂两把 key,keyA 后天到期、keyB 未知 ——
    // 调度器应优先用 keyA(先把快过期的额度用掉),而不是固定靠凭据序。
    const repo = new InMemoryRepo();
    const members: Array<[string, string]> = [["trae", "deepseek-v4.1-flash"]];
    repo.setLogicalModel("trae-multi", { strategy: "due-first" });
    repo.setMembers("trae-multi", members.map(([p, m]) => ({ provider: p, model: m })));
    repo.setChain("trae-multi", [
      endpointRow("trae", "deepseek-v4.1-flash", "keyB"), // 无到期 → 后
      endpointRow("trae", "deepseek-v4.1-flash", "keyA"), // 后天到期 → 前
    ]);
    repo.setQuota("trae/keyA", { expires_at: expiryEpoch("2026-11-11")! });
    repo.setQuota("trae/keyB", {}); // 没有 expires_at → 未知
    const sched = new Scheduler(repo);
    const chain = sched.chain("trae-multi", { now: at(3, 0), force: true });
    const creds = chain.map((c) => c.endpoint.credentialKey[1]);
    // 同档(同一模型)内:keyA(有到期)排在 keyB(未知)前面,且 keyA 是名单里的
    // 下一跳 —— 号池优先把最快到期的号用掉。
    expect(creds).toEqual(["keyA", "keyB"]);
  });

  it("无到期概念的渠道:due-first 不抖成随机,按链序稳定排列(全部到期未知)", () => {
    // sensenova / qoder / openai 兼容 / minimax 的额度没有「到期日」概念,
    // expiry 恒 null。due-first 下它们全落 T3 的「未知」段 —— 必须保持**链序**,
    // 不能每次重算都换顺序(那等于退化成 random,还会破坏 prompt cache 亲和)。
    const repo = new InMemoryRepo();
    const members: Array<[string, string]> = [
      ["sensenova", "deepseek-v4-flash"],
      ["qoder", "qwen3-coder"],
      ["openai", "gpt-5"],
      ["minimax", "minimax-m2"],
    ];
    repo.setMembers("mixed", members.map(([p, m]) => ({ provider: p, model: m })));
    repo.setChain("mixed", members.map(([p, m]) => endpointRow(p, m, "seat")));
    const sched = new Scheduler(repo, { seed: 7 });
    const expected = members.map(([p, m]) => `${p}/${m}`);
    const first = sched.planMembers("mixed", { now: at(3, 0) });
    expect(first.map((x) => x.realModelId)).toEqual(expected);
    expect(first.every((x) => x.expiresAt === null)).toBe(true);
    // 跨分钟、跨实例(不同随机种子)都保持同一顺序 → 稳定,不是随机。
    for (const minute of [5, 17, 42]) {
      expect(sched.planMembers("mixed", { now: at(3, minute) }).map((x) => x.realModelId)).toEqual(expected);
    }
    const sched2 = new Scheduler(repo, { seed: 99 });
    expect(sched2.planMembers("mixed", { now: at(4, 0) }).map((x) => x.realModelId)).toEqual(expected);
  });

  it("random:每次调用重排、可复现种子、随机打散原因;random 不可缓存", () => {
    const repo = new InMemoryRepo();
    seedAaaBbbCcc(repo);
    repo.setLogicalModel("m", { strategy: "random" });
    const sched = new Scheduler(repo, { seed: 1234 });
    const base = at(3, 0);
    const permutations: string[] = [];
    for (let i = 0; i < 12; i++) {
      const plan = sched.planMembers("m", { now: base + i * 60 });
      const ids = plan.map((x) => x.realModelId);
      // 断言前复制排序 —— 不能就地 sort 后 join(会恒为配置序)
      expect([...ids].sort()).toEqual(["aaa/m", "bbb/m", "ccc/m"]);
      expect(plan.every((x) => x.reason === "随机打散")).toBe(true);
      permutations.push(ids.join("|"));
    }
    expect(new Set(permutations).size).toBeGreaterThan(1);
    expect(CACHEABLE_STRATEGIES.has("random")).toBe(false);
  });

  it("分钟记忆化:命中要求 同分钟+同策略+额度新鲜+quotas_at 一致(sec_quota_memo_guard)", () => {
    const repo = new InMemoryRepo();
    repo.setLogicalModel("q", { strategy: "due-first" });
    repo.setMembers("q", [
      { provider: "longcat", model: "flash" },
      { provider: "tokenrhythm", model: "flash" },
    ]);
    repo.setChain("q", [
      endpointRow("longcat", "flash", "longcat"),
      endpointRow("tokenrhythm", "flash", "tokenrhythm"),
    ]);
    const sched = new Scheduler(repo); // ttl 300
    const t1 = at(10, 0) + 5;
    repo.setQuota("longcat/longcat", { expires_at: t1 + 100 });
    repo.setQuota("tokenrhythm/tokenrhythm", { expires_at: t1 + 9000 });
    const first = sched.planMembers("q", { now: t1 }).map((x) => x.realModelId);
    expect(first).toEqual(["longcat/flash", "tokenrhythm/flash"]);
    // 改额度但不 invalidate:同分钟内仍命中缓存 → 旧顺序
    repo.setQuota("longcat/longcat", { expires_at: t1 + 90000 });
    const memoized = sched.planMembers("q", { now: t1 + 20 }).map((x) => x.realModelId);
    expect(memoized).toEqual(["longcat/flash", "tokenrhythm/flash"]);
    // 下一分钟:分钟键过期 → 重算,但额度仍新鲜(ttl 300)→ 仍按旧额度排序
    expect(sched.planMembers("q", { now: t1 + 70 }).map((x) => x.realModelId)).toEqual([
      "longcat/flash",
      "tokenrhythm/flash",
    ]);
    // invalidate 强制重读额度 → 反映新到期顺序
    sched.invalidate();
    expect(sched.planMembers("q", { now: t1 + 70 }).map((x) => x.realModelId)).toEqual([
      "tokenrhythm/flash",
      "longcat/flash",
    ]);
    // ttl=1:同分钟但额度已不新鲜 → 立即重算(guard 生效)
    const repo2 = new InMemoryRepo();
    repo2.setLogicalModel("q", { strategy: "due-first" });
    repo2.setMembers("q", [
      { provider: "longcat", model: "flash" },
      { provider: "tokenrhythm", model: "flash" },
    ]);
    repo2.setChain("q", [
      endpointRow("longcat", "flash", "longcat"),
      endpointRow("tokenrhythm", "flash", "tokenrhythm"),
    ]);
    const sched1 = new Scheduler(repo2, { ttlSeconds: 1 });
    repo2.setQuota("longcat/longcat", { expires_at: t1 + 100 });
    repo2.setQuota("tokenrhythm/tokenrhythm", { expires_at: t1 + 9000 });
    sched1.planMembers("q", { now: t1 });
    repo2.setQuota("longcat/longcat", { expires_at: t1 + 90000 });
    expect(sched1.planMembers("q", { now: t1 + 20 }).map((x) => x.realModelId)).toEqual([
      "tokenrhythm/flash",
      "longcat/flash",
    ]);
  });

  it("pendingQuotaRefresh 与刷新节流(sec_pending_quota_refresh / sec_quota_refresh)", () => {
    const repo = new InMemoryRepo();
    seedDeepseekFlash(repo);
    seedLegacyRules(repo);
    const sched = new Scheduler(repo);
    const now = at(3, 0);
    // 无快照 → 不预取
    expect(sched.pendingQuotaRefresh("deepseek-flash", now)).toEqual([]);
    // 新鲜快照 → 不预取
    repo.setQuota("trae/bvbhu", { fetched_at: now });
    repo.setQuota("workbuddy/石英的石英块", { fetched_at: now });
    expect(sched.pendingQuotaRefresh("deepseek-flash", now)).toEqual([]);
    // 过期快照 → 预取 trae+workbuddy(排序、只含 QUOTA_REFRESH_PROVIDERS)
    // ⚠️ 额度映射有 TTL 缓存:invalidate 强制重读(等价 Nexus 每步换新 Scheduler)
    repo.setQuota("trae/bvbhu", { fetched_at: now - 3600 });
    repo.setQuota("workbuddy/石英的石英块", { fetched_at: now - 7200 });
    sched.invalidate();
    expect(sched.pendingQuotaRefresh("deepseek-flash", now)).toEqual(["trae", "workbuddy"]);
    // 非 due-first 策略 → 不预取
    repo.setLogicalModel("deepseek-flash", { strategy: "random" });
    expect(sched.pendingQuotaRefresh("deepseek-flash", now)).toEqual([]);
    // plan 触发 fire-and-forget 刷新,TTL 窗口内不重复
    const repo2 = new InMemoryRepo();
    seedDeepseekFlash(repo2);
    seedLegacyRules(repo2);
    const sched2 = new Scheduler(repo2);
    const spy = vi.fn();
    sched2.setQuotaRefresher(spy);
    const t1 = at(3, 0) + 5;
    repo2.setQuota("trae/bvbhu", { fetched_at: t1 - 3600 });
    repo2.setQuota("workbuddy/石英的石英块", { fetched_at: t1 - 3600 });
    sched2.planMembers("deepseek-flash", { now: t1 });
    expect(spy).toHaveBeenCalledWith(["trae", "workbuddy"]);
    expect(sched2.snapshot().quota_refresh.triggers).toBe(1);
    // 同一 TTL 窗口内(下一分钟)不再触发
    sched2.planMembers("deepseek-flash", { now: t1 + 61 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Planner / InflightLedger:在途租约、会话亲和、负载感知分桶、冷却
// ---------------------------------------------------------------------------

describe("InflightLedger", () => {
  it("按凭据(端点)计 + legacy 释放丢最旧 + 句柄释放幂等(test_v4_semantics)", () => {
    const ledger = new InflightLedger();
    const t0 = 1000;
    // ⚠️ 2026-11-08:容量键是端点(含 username)→ 三条不同凭据 = 三个桶、各 1 条;
    // 展示口径(snapshot)仍按真实模型聚合。
    ledger.acquire("sensenova/deepseek-v4-flash", { endpointId: "sensenova/deepseek-v4-flash@sensenova/u1", sessionId: "s1" }, t0);
    ledger.acquire("sensenova/deepseek-v4-flash", { endpointId: "sensenova/deepseek-v4-flash@sensenova/u2", sessionId: "s2" }, t0 + 1);
    ledger.acquire("sensenova/deepseek-v4-flash", { endpointId: "sensenova/deepseek-v4-flash@sensenova/u3", sessionId: "s3" }, t0 + 2);
    expect(ledger.inFlight("sensenova/deepseek-v4-flash@sensenova/u1", t0 + 3)).toBe(1);
    expect(ledger.inFlight("sensenova/deepseek-v4-flash@sensenova/u2", t0 + 3)).toBe(1);
    expect(ledger.total(t0 + 3)).toBe(3);
    expect(ledger.snapshot(t0 + 3)).toEqual({ "sensenova/deepseek-v4-flash": 3 });

    // legacy:用容量键释放 → 丢该桶 started_at 最早的一条
    const legacy = new InflightLedger();
    legacy.acquire("K", {}, 1000);
    legacy.acquire("K", {}, 1001);
    expect(legacy.release("K", { now: 1002 })).toBe(true);
    expect(legacy.detail(1002)).toHaveLength(1);
    expect(legacy.detail(1002)[0]!.startedAt).toBe(1001);

    // 句柄精确释放;重复释放 → false
    const exact = new InflightLedger();
    const a = exact.acquire("K", {}, 1000);
    const b = exact.acquire("K", {}, 1001);
    expect(exact.inFlight("K", 1002)).toBe(2);
    expect(exact.release(b, { now: 1002 })).toBe(true);
    expect(exact.detail(1002)).toHaveLength(1);
    expect(exact.detail(1002)[0]!.startedAt).toBe(1000);
    expect(exact.release(a, { now: 1003 })).toBe(true);
    expect(exact.release(a, { now: 1004 })).toBe(false);
    expect(exact.inFlight("K", 1004)).toBe(0);
  });

  it("租约到期进保留区并记假失败(recent 最新在前)", () => {
    const ledger = new InflightLedger({ leaseSeconds: 10 });
    ledger.acquire("K", { endpointId: "e0" }, 1000);
    ledger.acquire("K", { endpointId: "e1" }, 1005);
    // 1002 时 e0 租约(1000+10)未到期
    expect(ledger.snapshot(1002)).toEqual({ K: 2 });
    // 1011:e0 到期被 purge → 剩 e1
    expect(ledger.snapshot(1011)).toEqual({ K: 1 });
    const recent = ledger.recent(10, 1011);
    expect(recent.length).toBe(1);
    expect(recent[0]!.ok).toBe(false);
    expect(recent[0]!.error).toBe("lease expired (no outcome reported)");
  });
});

describe("Planner.plan/commit/finish", () => {
  function snFlashPlanner(): { planner: Planner; chain: ChainItem[] } {
    const repo = new InMemoryRepo();
    repo.setLogicalModel("sn-flash", { strategy: "ordered-fallback" });
    repo.setMembers("sn-flash", [{ provider: "sensenova", model: "deepseek-v4-flash" }]);
    repo.setChain("sn-flash", [endpointRow("sensenova", "deepseek-v4-flash", "u1")]);
    const sched = new Scheduler(repo);
    const planner = new Planner(repo);
    return { planner, chain: sched.chain("sn-flash") };
  }

  it("并发 1:首单 ordered,第二单 all_busy;finish 后归零(test_v4 同语义)", () => {
    const { planner, chain } = snFlashPlanner();
    const p1 = planner.plan(chain, { sessionId: "s1" });
    expect(p1.reason).toBe("ordered");
    const lid = planner.commit(p1, { sessionId: "s1" });
    const p2 = planner.plan(chain, { sessionId: "s2" });
    expect(p2.failed).toBe(true);
    expect(p2.reason).toBe("all_busy");
    expect(planner.health.cooled()).toEqual([]);
    expect(planner.ledger.snapshot()).toEqual({ "sensenova/deepseek-v4-flash": 1 });
    planner.finish(p1, { leaseId: lid, sessionId: "s1", ok: true });
    expect(planner.ledger.total()).toBe(0);
    expect(planner.pins.count()).toBe(1); // 成功不 unpin
  });

  it("会话亲和:命中/忙时保 pin/冷却或不在链时解除;成功永不 unpin", () => {
    const { planner, chain } = snFlashPlanner();
    const ep = chain[0]!.endpoint;
    // 首次 ordered + commit → 落 pin
    const p1 = planner.plan(chain, { sessionId: "s" });
    const lid1 = planner.commit(p1, { sessionId: "s" });
    planner.finish(p1, { leaseId: lid1, sessionId: "s", ok: true });
    // 再次 plan → affinity
    const p2 = planner.plan(chain, { sessionId: "s" });
    expect(p2.reason).toBe("affinity");
    expect(p2.byAffinity).toBe(true);
    expect(p2.item!.endpoint.endpointId).toBe(ep.endpointId);
    // 在途占用 → 忙,保 pin(affinity 命中但无空位 → 继续按序 → all_busy)
    const lid2 = planner.commit(p2, { sessionId: "s" });
    const pBusy = planner.plan(chain, { sessionId: "s" });
    expect(pBusy.reason).toBe("all_busy");
    expect(planner.pins.count()).toBe(1);
    planner.finish(p2, { leaseId: lid2, sessionId: "s", ok: true });
    // 冷却 → 解除 pin 并 all_cooldown
    const p3 = planner.plan(chain, { sessionId: "s" });
    const lid3 = planner.commit(p3, { sessionId: "s" });
    planner.finish(p3, { leaseId: lid3, sessionId: "s", ok: false, kind: "http", status: 503 });
    expect(planner.pins.count()).toBe(0);
    expect(planner.plan(chain, { sessionId: "s" }).reason).toBe("all_cooldown");
    // 不在链 → 解除 pin,走新链
    const repo2 = new InMemoryRepo();
    repo2.setLogicalModel("other", { strategy: "ordered-fallback" });
    repo2.setMembers("other", [{ provider: "other", model: "m1" }]);
    repo2.setChain("other", [endpointRow("other", "m1", "u1")]);
    const chain2 = new Scheduler(repo2).chain("other");
    const pOther = planner.plan(chain2, { sessionId: "s" });
    expect(pOther.reason).toBe("ordered");
    expect(pOther.item!.endpoint.realModelKey).toBe("other/m1");
    expect(planner.pins.count()).toBe(0);
  });

  it("粘性不换号(sensenova):限流不解除粘性、冷却不换号;新会话才换空闲号", () => {
    // 用户 2026-10-30 定案:「不做账号切换机制,会话粘性期间不切换,超过粘性
    // 时间/新会话,选择一个空闲的账号」—— 策略见 scheduler/sticky.ts。
    const repo = new InMemoryRepo();
    repo.setLogicalModel("sn-flash", { strategy: "ordered-fallback" });
    repo.setMembers("sn-flash", [{ provider: "sensenova", model: "deepseek-v4-flash" }]);
    repo.setChain("sn-flash", [
      endpointRow("sensenova", "deepseek-v4-flash", "a"),
      endpointRow("sensenova", "deepseek-v4-flash", "b"),
    ]);
    const planner = new Planner(repo);
    const chain = new Scheduler(repo).chain("sn-flash");
    const p1 = planner.plan(chain, { sessionId: "s" });
    const pinnedId = p1.item!.endpoint.endpointId;
    const lid1 = planner.commit(p1, { sessionId: "s" });
    // 429 失败:pin 必须留着(换号禁令);否则下一次 plan 就落到账号 b 了。
    planner.finish(p1, { leaseId: lid1, sessionId: "s", ok: false, kind: "rate_limit", status: 429 });
    expect(planner.pins.get("s")).toBe(pinnedId);
    expect(planner.health.get(pinnedId)!.inCooldown()).toBe(true);
    // 同一会话:账号 a 冷却中,但**仍然**用它(冷却不换号),交给连接器同号硬等。
    const p2 = planner.plan(chain, { sessionId: "s" });
    expect(p2.reason).toBe("affinity_sticky");
    expect(p2.item!.endpoint.endpointId).toBe(pinnedId);
    // 新会话才允许选别的空闲账号(冷却中的 a 被跳过)。
    const p3 = planner.plan(chain, { sessionId: "s2" });
    expect(p3.item!.endpoint.endpointId).not.toBe(pinnedId);
  });

  it("粘性不换号(sensenova):粘住的号并发满了 → all_busy,不溢出到另一个号", () => {
    const repo = new InMemoryRepo();
    repo.setLogicalModel("sn-flash", { strategy: "ordered-fallback" });
    repo.setMembers("sn-flash", [{ provider: "sensenova", model: "deepseek-v4-flash" }]);
    repo.setChain("sn-flash", [
      endpointRow("sensenova", "deepseek-v4-flash", "a", { concurrency: 1 }),
      endpointRow("sensenova", "deepseek-v4-flash", "b", { concurrency: 1 }),
    ]);
    const planner = new Planner(repo);
    const chain = new Scheduler(repo).chain("sn-flash");
    const p1 = planner.plan(chain, { sessionId: "s" });
    const pinnedId = p1.item!.endpoint.endpointId;
    const lid1 = planner.commit(p1, { sessionId: "s" });
    // 同一会话第二次进:粘住的号占满 → 直接 all_busy(另一个号空闲也不换)。
    const p2 = planner.plan(chain, { sessionId: "s" });
    expect(p2.failed).toBe(true);
    expect(p2.reason).toBe("all_busy");
    expect(planner.pins.get("s")).toBe(pinnedId);
    planner.finish(p1, { leaseId: lid1, sessionId: "s", ok: true });
  });


  it("SessionPinTable:TTL 过期、drop 防竞态、count/snapshot", () => {
    const pins = new SessionPinTable(100);
    pins.set("s1", "e0", 1000);
    expect(pins.get("s1", 1050)).toBe("e0");
    expect(pins.get("s1", 1101)).toBe(null); // 1100 过期,get 时弹出
    expect(pins.get("s1", 1101)).toBe(null); // 已弹出,不再返回
    pins.set("s2", "e1", 1000);
    pins.drop("s2", "e2", 1000); // 指向别的端点 → 不解
    expect(pins.get("s2", 1000)).toBe("e1");
    pins.drop("s2", "e1", 1000); // 匹配 → 解
    expect(pins.get("s2", 1000)).toBe(null);
    expect(pins.count(1000)).toBe(0); // s1 已过期弹出,s2 已解除
    expect(pins.snapshot(1000)).toEqual({ ttl_seconds: 100, active: 0, sessions: {} });
    pins.set("", "e9", 1000); // 空 session 不落
    expect(pins.count(1000)).toBe(0);
  });

  it("视觉请求收窄到视觉端点;非视觉链不抛错", () => {
    const chain = [
      chainItem("p", "plain", "u1", { priority: 0 }),
      chainItem("p", "vision", "u1", { priority: 1, vision: true }),
    ];
    const planner = new Planner(new InMemoryRepo());
    const p = planner.plan(chain, { sessionId: "s", needsVision: true });
    expect(p.reason).toBe("ordered");
    expect(p.item!.endpoint.supportsVision).toBe(true);
    expect(p.item!.endpoint.realModelKey).toBe("p/vision");
    // 无视觉端点 → 保持全链
    const plainOnly = [chainItem("p", "plain", "u1", { priority: 0 })];
    const p2 = planner.plan(plainOnly, { sessionId: "s", needsVision: true });
    expect(p2.item!.endpoint.realModelKey).toBe("p/plain");
  });
});

describe("Planner.负载感知分桶", () => {
  it("least-busy:在途最少者轮流,并列按档序(test_v4 least_busy_rotates)", () => {
    const repo = new InMemoryRepo();
    seedProbe(repo, [["m0", 5], ["m1", 5], ["m2", 5]], 1, "least-busy");
    const planner = new Planner(repo, { seed: 1 });
    const chain = new Scheduler(repo).chain("probe");
    expect(take(planner, chain, 4)).toEqual(["probe/m0", "probe/m1", "probe/m2", "probe/m0"]);
  });

  it("balanced:空位加权随机,永不超任一桶并发,9 取各桶恰好 3", () => {
    const repo = new InMemoryRepo();
    seedProbe(repo, [["m0", 3], ["m1", 3], ["m2", 3]], 1, "balanced");
    const planner = new Planner(repo, { seed: 7 });
    const chain = new Scheduler(repo).chain("probe");
    const takes = take(planner, chain, 40);
    const nonNull = takes.filter((v): v is string => v !== null);
    expect(nonNull.length).toBe(9); // 容量 9 全用满
    const counts: Record<string, number> = { "probe/m0": 0, "probe/m1": 0, "probe/m2": 0 };
    for (const k of nonNull) counts[k]! += 1;
    expect(counts["probe/m0"]).toBe(3);
    expect(counts["probe/m1"]).toBe(3);
    expect(counts["probe/m2"]).toBe(3);
    expect(takes.slice(9).every((v) => v === null)).toBe(true);
  });

  it("按凭据分桶(2026-11-08):并发 2 × 3 凭据 = 6 个并发位;展示仍按真实模型聚合", () => {
    const repo = new InMemoryRepo();
    seedProbe(repo, [["m0", 2]], 3, "least-busy");
    const planner = new Planner(repo, { seed: 2 });
    const chain = new Scheduler(repo).chain("probe");
    const takes = take(planner, chain, 8);
    // 前 6 个都能跑(每凭据各 2),第 7/8 个才全忙 —— 不再「凭据多的模型被少算」。
    expect(takes.slice(0, 6).every((v) => v === "probe/m0")).toBe(true);
    expect(takes.slice(6)).toEqual([null, null]);
    // 展示口径:同一个真实模型的 6 条在途。
    expect(planner.ledger.snapshot()).toEqual({ "probe/m0": 6 });
  });

  it("冷却:全冷却 → all_cooldown;ignore_cooldown 可绕过;瞬时故障不熔断;Retry-After 精确", () => {
    const repo = new InMemoryRepo();
    repo.setLogicalModel("sn-flash", { strategy: "ordered-fallback" });
    repo.setMembers("sn-flash", [{ provider: "sensenova", model: "deepseek-v4-flash" }]);
    repo.setChain("sn-flash", [endpointRow("sensenova", "deepseek-v4-flash", "u1")]);
    new Scheduler(repo); // 播种默认 rules(无供应商级冷却缺省)
    const planner = new Planner(repo);
    const chain = new Scheduler(repo).chain("sn-flash");
    const EP = "sensenova/deepseek-v4-flash@sensenova/u1";

    // 瞬时故障(timeout)→ 只记账不熔断
    let p = planner.plan(chain, { sessionId: "s1" });
    let lid = planner.commit(p, { sessionId: "s1" });
    planner.finish(p, { leaseId: lid, sessionId: "s1", ok: false, kind: "timeout" });
    expect(planner.health.get(EP).cooldownUntil).toBe(0);
    expect(planner.plan(chain, { sessionId: "s2" }).reason).toBe("ordered");

    // Retry-After 精确生效
    p = planner.plan(chain, { sessionId: "s2" });
    lid = planner.commit(p, { sessionId: "s2" });
    const until = wallNow() + 123;
    planner.finish(p, { leaseId: lid, sessionId: "s2", ok: false, kind: "http", status: 429, cooldownUntil: until });
    expect(planner.health.get(EP).cooldownUntil).toBe(until);

    // 冷却中 → all_cooldown;ignore_cooldown → ordered
    expect(planner.plan(chain, { sessionId: "s3" }).reason).toBe("all_cooldown");
    expect(planner.plan(chain, { sessionId: "s3", ignoreCooldown: true }).reason).toBe("ordered");

    // 2026-10-24 用户定案:不再有供应商级冷却缺省 → sensenova 不再覆盖全局,
    // 走全局冷却(retry.logical_cooldown = 15 分钟 = 900s)。
    p = planner.plan(chain, { sessionId: "s4", ignoreCooldown: true });
    lid = planner.commit(p, { sessionId: "s4" });
    planner.finish(p, { leaseId: lid, sessionId: "s4", ok: false, kind: "http", status: 503 });
    const floor = planner.health.get(EP).cooldownUntil - wallNow();
    expect(floor).toBeCloseTo(900, 0);
  });
});

// ---------------------------------------------------------------------------
// 配置解析与设置播种
// ---------------------------------------------------------------------------

describe("配置与播种", () => {
  it("Scheduler 构造播种:5 个档位键全空(规则由用户配)、cooldown 拆出、retry 7 键、misc 设置;幂等", () => {
    const repo = new InMemoryRepo();
    new Scheduler(repo);
    // 5 键:键名即档位,元素不含 priority。2026-10-30 用户定案移除代码缺省后
    // 全新库播下去的**五档全空** —— 规则只来自用户在设置页填的内容。
    const p1 = JSON.parse(repo.getSetting("scheduler.rules_p1")!) as unknown[];
    const p2 = JSON.parse(repo.getSetting("scheduler.rules_p2")!) as unknown[];
    const p3 = JSON.parse(repo.getSetting("scheduler.rules_p3")!) as unknown[];
    const p4 = JSON.parse(repo.getSetting("scheduler.rules_p4")!) as unknown[];
    const p0 = JSON.parse(repo.getSetting("scheduler.rules_p0")!) as unknown[];
    expect(p1).toEqual([]);
    expect(p2).toEqual([]);
    expect(p3).toEqual([]);
    expect(p4).toEqual([]);
    expect(p0).toEqual([]);
    // 键名即档位:元素里没有 priority(写了由校验端拒绝)
    for (const arr of [p1, p2, p3, p4, p0]) {
      for (const r of arr) {
        expect((r as Record<string, unknown>).priority).toBeUndefined();
      }
    }
    // 冷却覆盖拆到独立设置键;2026-10-24 起不再有供应商级缺省
    const cooldowns = JSON.parse(repo.getSetting("scheduler.cooldown_overrides")!) as Record<string, number>;
    expect(cooldowns.sensenova).toBeUndefined();
    expect(Object.keys(cooldowns).length).toBe(0);
    // 用户配过的库:再次构造不覆盖(整体不覆盖,任一档位键存在即返回)
    seedLegacyRules(repo);
    const repo2 = new InMemoryRepo();
    seedLegacyRules(repo2);
    new Scheduler(repo2);
    const p1b = JSON.parse(repo2.getSetting("scheduler.rules_p1")!) as unknown[];
    expect(p1b.length).toBe(2);
    // retry 键全播种
    for (const key of [
      "retry.base_backoff_s",
      "retry.max_backoff_s",
      "retry.jitter_ratio",
      "retry.codes",
      "retry.logical_max",
      "retry.real_max",
      "retry.logical_cooldown",
    ]) {
      expect(repo.getSetting(key)).not.toBeNull();
    }
    expect(repo.getSetting("ui.recent_limit")).toBe("50");
    expect(repo.getSetting("abstract.timeout_s")).toBe("25");
    // 幂等:再次构造不覆盖用户值
    repo.setSetting("abstract.timeout_s", "99");
    new Scheduler(repo);
    expect(repo.getSetting("abstract.timeout_s")).toBe("99");
  });

  it("waitLimits:默认 abstract 10 / real 60,坏值回退缺省,构造播种 abstract=25", () => {
    const repo = new InMemoryRepo();
    // 未播种:缺省 10 / 60
    expect(waitLimits(repo, { abstract: true })).toBe(10);
    expect(waitLimits(repo, { abstract: false })).toBe(60);
    // 坏值 → 回退缺省
    repo.setSetting("abstract.timeout_s", "abc");
    repo.setSetting("real.wait_budget_s", "-5");
    expect(waitLimits(repo, { abstract: true })).toBe(10);
    expect(waitLimits(repo, { abstract: false })).toBe(60);
    // Scheduler 构造播种:仅在缺失时播种(已有用户值 → 不覆盖)
    const sched = new Scheduler(repo);
    expect(repo.getSetting("abstract.timeout_s")).toBe("abc");
    expect(repo.getSetting("real.wait_budget_s")).toBe("-5");
    // 全新 repo:播种 abstract.timeout_s=25;real.wait_budget_s 不播种
    const repo2 = new InMemoryRepo();
    new Scheduler(repo2);
    expect(Number(repo2.getSetting("abstract.timeout_s"))).toBe(25);
    expect(repo2.getSetting("real.wait_budget_s")).toBeNull();
    expect(waitLimits(repo2, { abstract: true })).toBe(25);
    expect(waitLimits(repo2, { abstract: false })).toBe(60);
    expect(sched).toBeInstanceOf(Scheduler);
  });

  it("HealthRegistry:冷却列表/快照/purgeExpired", () => {
    const h = new HealthRegistry();
    const now = wallNow();
    h.note("e1", { ok: false, kind: "http", status: 503, now, policy: RetryPolicy.of(new InMemoryRepo(), { abstract: false }) });
    h.note("e2", { ok: true, now });
    expect(h.cooled(now + 1).map((x) => x.endpoint_id)).toEqual(["e1"]);
    expect(h.snapshot(now + 1).tracked).toBe(2);
    expect(h.snapshot(now + 1).cooling).toBe(1);
    // 过期后 purge
    expect(h.purgeExpired(now + 10_000)).toBe(1);
    expect(h.cooled(now + 10_001)).toEqual([]);
    expect(h.known("e1")).toBe(false);
  });

// ---------------------------------------------------------------------------
// 直连抢占(m02240):直连请求 > 逻辑模型成员;逻辑内部 FCFS 不被打乱
// ---------------------------------------------------------------------------

describe("直连抢占(direct preemption)", () => {
  /** 逻辑档链 "l":members [p/m];直连档链 "d":无 members → 凭据直连 [p/m]。 */
  function seedLogicalAndDirect(repo: InMemoryRepo, concurrency = 2): void {
    repo.setLogicalModel("l", { strategy: "due-first" });
    repo.setMembers("l", [{ provider: "p", model: "m" }]);
    repo.setChain("l", [endpointRow("p", "m", "u1", { concurrency })]);
    repo.setDirectChain("d", [endpointRow("p", "m", "u1", { concurrency })]);
  }

  it("chain 标记直连条目;Planner 直连 commit 走抢占接口,租约带 direct 标记", () => {
    const repo = new InMemoryRepo();
    seedLogicalAndDirect(repo);
    const planner = new Planner(repo);
    const sched = new Scheduler(repo);
    const logicalChain = sched.chain("l");
    const directChain = sched.chain("d");
    expect(logicalChain[0]!.direct).toBe(false);
    expect(directChain[0]!.direct).toBe(true);

    // 逻辑请求:普通 acquire,direct=false
    const pL = planner.plan(logicalChain, { sessionId: "l1" });
    expect(pL.reason).toBe("ordered");
    const a = planner.commit(pL, { sessionId: "l1" });
    expect(planner.ledger.detail().map((l) => l.direct)).toEqual([false]);
    // 直连请求(有空位):direct 租约
    const pD = planner.plan(directChain, { sessionId: "d1" });
    expect(pD.direct).toBe(true);
    const dLease = planner.commit(pD, { sessionId: "d1" });
    expect(dLease).not.toBe("");
    expect(planner.ledger.detail().map((l) => l.direct).sort()).toEqual([false, true]);
    // 直连完成 → 释放
    planner.finish(pD, { leaseId: dLease, sessionId: "d1", ok: true });
    // 容量键 = 端点(p/m@p/u1),不是真实模型(2026-11-08)。
    expect(planner.ledger.inFlight("p/m@p/u1")).toBe(1);
    // 逻辑句柄仍在,精确释放
    expect(planner.ledger.release(a)).toBe(true);
    expect(planner.ledger.inFlight("p/m@p/u1")).toBe(0);
  });

  it("账本级:槽满踢最新逻辑租约(队首保留)→ PREEMPT_ERROR 留档;全直连 → null", () => {
    const ledger = new InflightLedger();
    const t0 = 1000;
    // ⚠️ 2026-11-08 容量键是**端点**:抢占只发生在同一个凭据的桶里。
    const EP = "p/m@p/u1";
    ledger.acquire("p/m", { endpointId: EP, sessionId: "s1", direct: false }, t0);
    ledger.acquire("p/m", { endpointId: EP, sessionId: "s2", direct: false }, t0 + 1);
    // 别凭据上的逻辑租约不占这个槽,也不该被踢 —— 先塞一条作反例。
    ledger.acquire("p/m", { endpointId: "p/m@p/u2", sessionId: "s9", direct: false }, t0 + 1);
    // 本端点并发槽满(2):踢最新入队的逻辑租约(s2),保留最早 s1(FCFS)
    const d = ledger.acquireDirect("p/m", 2, { endpointId: EP, sessionId: "d1" }, t0 + 2);
    expect(d).not.toBeNull();
    expect(ledger.detail(t0 + 3).map((l) => [l.endpointId, l.direct])).toEqual([
      [EP, false],
      ["p/m@p/u2", false],
      [EP, true],
    ]);
    const kicked = ledger.recent(5, t0 + 3).find((r) => r.error === PREEMPT_ERROR)!;
    expect(kicked.ok).toBe(false);
    expect(kicked.lease.sessionId).toBe("s2"); // 被踢的是 s2,不是队首 s1
    // 本端点只剩 s1:再来直连 → 仍可抢占(踢 s1),直到桶内全为直连
    const d2 = ledger.acquireDirect("p/m", 2, { endpointId: EP, sessionId: "d2" }, t0 + 3);
    expect(d2).not.toBeNull();
    expect(ledger.detail(t0 + 4).filter((l) => l.endpointId === EP).map((l) => l.direct)).toEqual([
      true,
      true,
    ]);
    const kicked2 = ledger.recent(5, t0 + 4).find((r) => r.error === PREEMPT_ERROR)!;
    expect(kicked2.lease.sessionId).toBe("s1"); // 被踢的是仅存的逻辑 s1
    // 全直连在途 → 无可抢占 → null
    expect(ledger.acquireDirect("p/m", 2, { endpointId: EP, sessionId: "d9" }, t0 + 5)).toBeNull();
    // 有槽 → 普通 acquire(direct=true)
    const d3 = ledger.acquireDirect("p/m", 5, { endpointId: EP, sessionId: "d3" }, t0 + 6);
    expect(d3).not.toBeNull();
    expect(ledger.detail(t0 + 7).filter((l) => l.endpointId === EP).map((l) => l.direct)).toEqual([
      true,
      true,
      true,
    ]);
    // 记账不泄漏:全部释放后本端点为 0,保留区恰好 2 条被抢占失败
    expect(ledger.release(d!, { now: t0 + 8 })).toBe(true);
    expect(ledger.release(d3!, { now: t0 + 8 })).toBe(true);
    expect(ledger.releaseBucket(EP, t0 + 9)).toBe(1);
    expect(ledger.inFlight(EP, t0 + 10)).toBe(0);
    // 反例桶(另一个凭据)一条都没被动过。
    expect(ledger.inFlight("p/m@p/u2", t0 + 10)).toBe(1);
    expect(ledger.recent(50, t0 + 10).filter((r) => r.error === PREEMPT_ERROR)).toHaveLength(2);
  });

  it("逻辑内部 FCFS 不被打乱:抢占只动最新入队者;队列中的逻辑请求不插队", () => {
    const repo = new InMemoryRepo();
    seedLogicalAndDirect(repo, 2);
    const planner = new Planner(repo);
    const sched = new Scheduler(repo);
    const logicalChain = sched.chain("l");

    // L1、L2 按到达顺序占住并发 2 的两个槽(seq 1、2)
    const a = planner.commit(planner.plan(logicalChain, { sessionId: "l1" }), { sessionId: "l1" });
    const b = planner.commit(planner.plan(logicalChain, { sessionId: "l2" }), { sessionId: "l2" });
    // 容量键 = 端点(2026-11-08)。
    expect(planner.ledger.inFlight("p/m@p/u1")).toBe(2);
    // 排队中的 L3:槽满 → 不被准入
    expect(planner.plan(logicalChain, { sessionId: "l3" }).reason).toBe("all_busy");

    // 直连请求竞争到达(commit 与 plan 之间的交错):槽满 → 踢最新逻辑 L2
    const dLease = planner.ledger.acquireDirect("p/m", 2, {
      endpointId: "p/m@p/u1",
      logicalModel: "d",
      sessionId: "d1",
    });
    expect(dLease).not.toBeNull();
    const inFlight = planner.ledger.detail().map((l) => l.seq).sort((x, y) => x - y);
    expect(inFlight).toEqual([1, 3]); // L1(队首)保留,L2(seq 2)被踢,直连 seq 3
    const kicked = planner.ledger.recent(5).find((r) => r.error === PREEMPT_ERROR)!;
    expect(kicked.lease.seq).toBe(2); // 被踢的确实是 L2
    // L3 仍不被准入 —— 让出的槽给了直连,不插到 L1 前
    expect(planner.plan(logicalChain, { sessionId: "l3" }).reason).toBe("all_busy");

    // 直连完成释放 → L3 准入(FCFS:L1 之后)
    expect(planner.ledger.release(dLease!)).toBe(true);
    const p3 = planner.plan(logicalChain, { sessionId: "l3" });
    expect(p3.reason).toBe("ordered");
    const c = planner.commit(p3, { sessionId: "l3" });
    expect(c).not.toBe("");
    const order = planner.ledger.detail().sort((x, y) => x.startedAt - y.startedAt);
    expect(order.map((l) => l.seq)).toEqual([1, 4]); // L1 最早,L3 后到(seq 全局递增:直连=3,L3=4),FCFS 未乱
    // 收尾
    expect(planner.ledger.release(a)).toBe(true);
    expect(planner.ledger.release(c)).toBe(true);
    expect(planner.ledger.inFlight("p/m@p/u1")).toBe(0);
  });
});
});
