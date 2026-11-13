/**
 * Router 移植测试 —— 对应 `tests/test_v4_semantics.py` 的:
 *
 * | 用例 | Nexus 位置 |
 * |---|---|
 * | 并发按**凭据(端点)**计:单凭据 concurrency=1 仍会 all_busy;3 凭据 = 3 并发 | `test_concurrency_one_returns_all_busy_without_failure` / 三凭据用例 |
 * | 负载感知按**凭据**分桶,3 凭据 × 2 = 6 个并发位不误报 all_busy | 负载感知分桶用例 |
 * | 按序分配先吃满第一档;balanced 铺开用 | `test_balanced_spreads_instead_of_filling_first` |
 * | least-busy 并列时按配置序轮转 | `test_least_busy_rotates_over_equal_buckets` |
 * | 负载感知把同一真实模型的凭据并成**一个**桶 | `test_load_aware_merges_credentials_into_one_bucket` |
 * | 会话亲和跨优先级回到 pin;pin 那台忙时**不**解 pin | `test_concurrent_requests_do_not_steal_the_session_pin` |
 * | 供应商冷却覆盖只影响该 provider;rules 压过全局 | `test_provider_cooldown_rule_only_affects_that_provider` / `test_provider_cooldown_rule_beats_global_retry_key` |
 * | 上游 Retry-After → 冷却到**绝对时刻**,不取 max | `test_upstream_retry_after_pins_cooldown_to_absolute_time` / `test_note_failure_until_ignores_floor` |
 * | 已退役的冷却键不被读 | `test_retired_cooldown_keys_are_not_read` |
 * | 瞬时故障(timeout/connection)不冷却,但照样记账 | `test_timeout_failure_does_not_cool_endpoint` / `test_connection_failure_does_not_cool_endpoint` |
 * | 上游给了明确时刻时瞬时故障也照样冷 | `test_upstream_until_still_cools_transient_kind` |
 * | 5xx(upstream)**照旧**冷却(豁免名单边界) | `test_upstream_five_hundred_still_cools` |
 * | 瞬时故障不清零已有冷却 | `test_transient_failure_does_not_shorten_existing_cooldown` |
 * | 直连真实模型无视冷却;逻辑档链照旧跳过 | `test_direct_real_model_ignores_cooldown` / `test_logical_chain_still_skips_cooldown` |
 * | 带图请求优先视觉端点 / 视觉池全忙不回退 | `test_plan_prefers_vision_endpoint_when_image_requested` / `test_plan_vision_pool_all_busy_does_not_fall_to_plain` |
 * | 保留区容量跟着 ui.recent_limit | `test_router_ledger_capacity_follows_ui_recent_limit` / `test_recent_limit_reads_setting_with_defaults_and_bad_values` |
 *
 * 规格口径:**测试即规格**。源码与 inventory 矛盾时以源码为准(见 `router.ts` 的
 * 行内标注);本文件不逐行抄 Python,只锁行为。
 */

import { describe, expect, it } from "vitest";

import { mutableClock, type MutableClock } from "./clock.js";
import { HealthRegistry } from "./health.js";
import {
  InMemoryRouterDeps,
  Router,
  parseCooldownOverrides,
  parseCooldownRules,
  type SettingSource,
} from "./router.js";
import {
  SETTING_COOLDOWN_OVERRIDES,
  SETTING_LOGICAL_COOLDOWN,
  SETTING_RECENT_LIMIT,
  TRANSIENT_KINDS,
  UpstreamErrorKind,
  chainItemFrom,
  endpointFrom,
  type ChainItem,
  type EndpointSnapshot,
  type RequestOutcome,
} from "./types.js";

/** 缺省 `retry.logical_cooldown` = 15 分钟 → 900 秒。 */
const GLOBAL_FLOOR_S = 900;

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

interface EpDef {
  provider?: string;
  model?: string;
  user?: string;
  concurrency?: number;
  vision?: boolean;
  protocol?: string;
}

/** 构造一个端点快照(等价于 `Endpoint.from_dict` 的输入)。 */
function ep(def: EpDef): EndpointSnapshot {
  const provider = def.provider ?? "probe";
  const model = def.model ?? "m0";
  const user = def.user ?? "u0";
  return {
    provider,
    model,
    credentialKey: [provider, user],
    protocol: def.protocol ?? "openai",
    concurrency: def.concurrency ?? 1,
    supportsVision: def.vision ?? false,
  };
}

/** 构造一条链(顺序即 priority)。 */
function chain(defs: readonly EpDef[], strategy = ""): ChainItem[] {
  return defs.map((def, i) => {
    const item = chainItemFrom({ endpoint: ep(def), strategy });
    return { ...item, priority: i };
  });
}

/** 双档测试链:`probe/m0` + `probe/m1`,各 concurrency=1。 */
function twoTier(): ChainItem[] {
  return chain([{ model: "m0" }, { model: "m1" }]);
}

/** 一个「干净的」 deps:全局冷却 900s、`scheduler.cooldown_overrides` 为空。 */
function deps(extra: Readonly<Record<string, string>> = {}): InMemoryRouterDeps {
  return new InMemoryRouterDeps({
    [SETTING_LOGICAL_COOLDOWN]: "15",
    [SETTING_COOLDOWN_OVERRIDES]: "{}",
    [SETTING_RECENT_LIMIT]: "50",
    ...extra,
  });
}

/**
 * 建一个 Router,并把**同一个时钟**交回给测试。
 *
 * ⚠️ 必须成对使用:冷却截止是**墙钟**,租约 / pin 是**单调钟** ——
 * 测试断言「冷却到 now+120」时,`now` 必须取自 Router 实际使用的那个时钟,
 * 否则就是拿另一个时钟的读数去比。
 */
function makeRouter(
  d: InMemoryRouterDeps = deps(),
  over: { seed?: number; health?: HealthRegistry } = {},
): { router: Router; clock: MutableClock } {
  const clock = mutableClock(1_700_000_000);
  const router = new Router(d, {
    clock,
    ...(over.seed === undefined ? {} : { rng: seededRng(over.seed) }),
    ...(over.health === undefined ? {} : { health: over.health }),
  });
  return { router, clock };
}

/** 可复现的确定性随机源(mulberry32)。 */
function seededRng(seed: number) {
  let a = seed >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** 失败一次并返回该端点的健康记录(与 `_fail_span` / `_transient_item` 同形)。 */
function failOnce(
  router: Router,
  ch: readonly ChainItem[],
  sessionId: string,
  over: {
    kind?: string;
    status?: number;
    error?: string;
    cooldownUntil?: number | null;
    logicalName?: string;
  } = {},
) {
  const plan = router.plan({ chain: ch, sessionId });
  expect(plan.item, plan.reason).not.toBeNull();
  const item = plan.item as ChainItem;
  const leaseId = router.commit(item, {
    sessionId,
    logicalName: over.logicalName ?? "",
  });
  router.finish(item, {
    leaseId,
    sessionId,
    ok: false,
    error: over.error ?? "boom",
    kind: over.kind ?? UpstreamErrorKind.Auth,
    status: over.status ?? 401,
    cooldownUntil: over.cooldownUntil ?? null,
  });
  return router.health.get(item.endpoint.endpointId);
}

function outcome(over: Partial<RequestOutcome> = {}): RequestOutcome {
  return {
    ok: true,
    status: 200,
    error: "",
    latencyMs: 1000,
    ttftMs: 100,
    promptTokens: 100,
    completionTokens: 500,
    cachedTokens: 50,
    ...over,
  };
}

// ===========================================================================
// 1. 按序分配 + 每凭据并发(2026-11-08 / D19)
// ===========================================================================

describe("按序分配与并发上限", () => {
  it("第一个并发占住首选,第二个落到次选(按序分配的用途)", () => {
    const { router } = makeRouter();
    const ch = twoTier();

    const first = router.plan({ chain: ch, sessionId: "a" });
    expect(first.item?.endpoint.model).toBe("m0");
    expect(first.reason).toBe("ordered");
    router.commit(first.item, { sessionId: "a" });

    const second = router.plan({ chain: ch, sessionId: "b" });
    expect(second.item?.endpoint.model).toBe("m1");
    expect(second.reason).toBe("ordered");
  });

  it("单凭据 concurrency=1 时第 2 个请求 all_busy,且**不**产生失败/冷却", () => {
    // 「忙」和「坏」是两回事:忙只该让上层退避等待,不该记失败、不该进冷却 ——
    // 否则一次流量尖峰就会把这台机器雪藏 15 分钟。
    //
    // ⚠️ 2026-11-08 语义改口:concurrency 是**每凭据**的。所以「第二个请求 all_busy」
    // 只在**同一个凭据**上成立(下面那组三凭据用例反过来:三个都能跑)。
    const { router } = makeRouter();
    const ch = chain([
      { provider: "sensenova", model: "deepseek-v4-flash", user: "seat0", concurrency: 1 },
    ]);
    const ep = ch[0].endpoint.endpointId;

    const first = router.plan({ chain: ch, sessionId: "a" });
    expect(first.item?.endpoint.endpointId).toBe(ep);
    router.commit(first.item, { sessionId: "a" });

    const second = router.plan({ chain: ch, sessionId: "b" });
    expect(second.item).toBeNull();
    expect(second.reason).toBe("all_busy");
    // 关键:没有失败计数、没有冷却、账本也没多占
    expect(router.health.cooled()).toEqual([]);
    expect(router.health.get(ep).fails).toBe(0);
    expect(router.ledger.inFlight(ep)).toBe(1);

    // 释放之后立刻恢复可用(而不是等冷却过期)
    router.finish(first.item, { sessionId: "a", ok: true });
    const third = router.plan({ chain: ch, sessionId: "c" });
    expect(third.item).not.toBeNull();
    expect(router.health.cooled()).toEqual([]);
  });

  it("并发按凭据计:3 个凭据 × concurrency=1 = 3 并发,第 4 个才 all_busy", () => {
    // 用户 2026-11-08 原话:「修改并发设置的含义,改为按凭据记,即并发设置为1,
    // 三个凭据就可以三并发」。占用键是 endpointId(provider/model@username)。
    const { router } = makeRouter();
    const ch = chain([
      { provider: "sensenova", model: "deepseek-v4-flash", user: "seat0", concurrency: 1 },
      { provider: "sensenova", model: "deepseek-v4-flash", user: "seat1", concurrency: 1 },
      { provider: "sensenova", model: "deepseek-v4-flash", user: "seat2", concurrency: 1 },
    ]);

    const picked: string[] = [];
    for (const sid of ["a", "b", "c"]) {
      const plan = router.plan({ chain: ch, sessionId: sid });
      expect(plan.item, `${sid}: ${plan.reason}`).not.toBeNull();
      expect(plan.reason).toBe("ordered");
      router.commit(plan.item, { sessionId: sid });
      picked.push(plan.item!.endpoint.endpointId);
    }
    // 三个请求分别落在三个凭据上,谁的槽都没被别人占。
    expect(new Set(picked).size).toBe(3);
    expect(router.ledger.total()).toBe(3);
    // 展示口径:仍是同一个真实模型的 3 条在途。
    expect(router.ledger.snapshot()).toEqual({ "sensenova/deepseek-v4-flash": 3 });
    // 第四个才真的全忙。
    expect(router.plan({ chain: ch, sessionId: "d" }).reason).toBe("all_busy");
  });

  it("全忙但**不是**全冷却:有健康端点却都占满 → all_busy", () => {
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    const first = router.plan({ chain: ch, sessionId: "a" });
    router.commit(first.item, { sessionId: "a" });
    const second = router.plan({ chain: ch, sessionId: "b" });
    expect(second.reason).toBe("all_busy");
  });

  it("空链 → all_blackout,且 commit/finish 都是空操作", () => {
    const { router } = makeRouter();
    const plan = router.plan({ chain: [] });
    expect(plan.item).toBeNull();
    expect(plan.reason).toBe("all_blackout");
    // 未选到端点时 commit/finish 都不占租约、不记账
    expect(router.commit(plan.item, { sessionId: "a" })).toBe("");
    router.finish(plan.item, { sessionId: "a", ok: false });
    expect(router.ledger.total()).toBe(0);
  });
});

// ===========================================================================
// 2. 会话亲和(D18)
// ===========================================================================

describe("会话亲和", () => {
  it("亲和跨优先级回到 pin,不管它现在排第几", () => {
    // 一场长会话必须固定在同一模型上,否则上游 prompt cache 全部落空。
    // ⚠️ concurrency=2:必须让 pin 那台**有空位** —— 亲和只在「在链上且有位」时生效,
    // 被占满时是 all_busy/顺延,而不是「亲和失效」。
    const { router } = makeRouter();
    const before = chain([
      { model: "m1", concurrency: 2 },
      { model: "m0", concurrency: 2 },
    ]);

    const first = router.plan({ chain: before, sessionId: "s" });
    expect(first.item?.endpoint.model).toBe("m1");
    router.commit(first.item, { sessionId: "s" });

    // 链序反过来(m1 掉到最后一档)→ 亲和必须压过链序
    const after = chain([
      { model: "m0", concurrency: 2 },
      { model: "m1", concurrency: 2 },
    ]);
    const second = router.plan({ chain: after, sessionId: "s" });
    expect(second.item?.endpoint.model).toBe("m1");
    expect(second.byAffinity).toBe(true);
    expect(second.reason).toBe("affinity");
  });

  it("pin 那台正忙时**不**解 pin(只是忙不是故障),下一轮仍回到它", () => {
    // 在这里解除 pin 会在并发高峰期正好摧毁亲和:端点一秒后就空出来。
    const { router } = makeRouter();
    const ch = twoTier();

    const first = router.plan({ chain: ch, sessionId: "s" });
    const pinnedId = first.item?.endpoint.endpointId;
    router.commit(first.item, { sessionId: "s" });

    // 同会话再来一个并发:m0 已被占 → 顺延到 m1
    const second = router.plan({ chain: ch, sessionId: "s" });
    expect(second.item?.endpoint.model).toBe("m1");
    // pin 必须还在 m0 上
    expect(router.pins.get("s")).toBe(pinnedId);

    router.finish(first.item, { sessionId: "s", ok: true });
    const third = router.plan({ chain: ch, sessionId: "s" });
    expect(third.item?.endpoint.model).toBe("m0");
    expect(third.reason).toBe("affinity");
  });

  it("pin 那台已不在链上(下线/被删)→ 解除 pin 换档", () => {
    // ⚠️ concurrency=2:让 pin 那台**有**空位,否则返回 all_busy 是「忙」而不是
    // 「不在链上」,这条测试就测不到它想测的东西。
    const { router } = makeRouter();
    const ch = chain([
      { model: "m0", concurrency: 2 },
      { model: "m1", concurrency: 2 },
    ]);
    const first = router.plan({ chain: ch, sessionId: "s" });
    router.commit(first.item, { sessionId: "s" });

    // 链缩成只剩 pin 那台:仍然亲和得到
    const shorter = [ch[0]];
    expect(router.plan({ chain: shorter, sessionId: "s" }).reason).toBe("affinity");

    // pin 指向的那台被摘掉(链换成只有 m1)→ pin 必须被解除
    const other = [ch[1]];
    const next = router.plan({ chain: other, sessionId: "s" });
    expect(next.item?.endpoint.model).toBe("m1");
    expect(next.reason).toBe("ordered");
    // plan 只**解除**失效的 pin,不负责重建 —— 新 pin 要等 commit 才落下去
    expect(router.pins.get("s")).toBeNull();
    router.commit(next.item, { sessionId: "s" });
    expect(router.pins.get("s")).toBe(ch[1].endpoint.endpointId);
  });

  it("同一会话的并发请求**不抢** pin —— 首个建立,其余照用但不覆盖", () => {
    // 以前无条件覆盖:N 个并发请求把 pin 依次推到第 N 档,下一轮顺序请求会回到
    // 最后那一档,恰恰是刚被最重的并发请求占过的那台。
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }, { model: "m1" }, { model: "m2" }], "balanced");
    const picks: string[] = [];
    let firstId: string | undefined;
    for (let i = 0; i < 3; i += 1) {
      const plan = router.plan({ chain: ch, sessionId: "same-session" });
      expect(plan.item, plan.reason).not.toBeNull();
      const item = plan.item as ChainItem;
      if (firstId === undefined) {
        firstId = item.endpoint.endpointId;
      }
      router.commit(item, { sessionId: "same-session", logicalName: "probe" });
      picks.push(item.endpoint.model);
    }
    expect(new Set(picks).size).toBe(3); // 三个并发确实落在不同档
    // ⚠️ balanced 是**加权随机**,第一档是哪个不确定 —— 所以断言 pin 停在「首个被选中
    // 的那档」,而不是配置里的第一档。
    expect(router.pins.get("same-session")).toBe(firstId);
  });

  it("pin 那台进冷却 → 解除 pin 换档;成功**绝不**解除 pin", () => {
    const { router } = makeRouter();
    const ch = twoTier();
    const first = router.plan({ chain: ch, sessionId: "s" });
    router.commit(first.item, { sessionId: "s" });

    // 失败:pin 那台被熔断 → pin 解除
    router.finish(first.item, {
      sessionId: "s",
      ok: false,
      kind: UpstreamErrorKind.Auth,
      status: 401,
    });
    expect(router.pins.get("s")).toBeNull();

    // 成功:pin 必须留着(每轮都 unpin 等于根本没有会话亲和)
    const { router: r2 } = makeRouter();
    const f2 = r2.plan({ chain: ch, sessionId: "s" });
    r2.commit(f2.item, { sessionId: "s" });
    r2.finish(f2.item, { sessionId: "s", ok: true });
    expect(r2.pins.get("s")).toBe(f2.item?.endpoint.endpointId);
  });
});

// ===========================================================================
// 3. 负载感知策略(least-busy / balanced)
// ===========================================================================

describe("负载感知策略", () => {
  it("least-busy 每次挑在途最少的桶,并列时按配置序 → 表现为轮转", () => {
    const { router } = makeRouter();
    // ⚠️ concurrency=2:每个桶要留出两轮空位才看得到「并列 → 按配置序」的轮转;
    // 上限=1 时第二轮三个桶全满,测到的是 all_busy 而不是排序规则。
    const ch = chain(
      [
        { model: "m0", concurrency: 2 },
        { model: "m1", concurrency: 2 },
        { model: "m2", concurrency: 2 },
      ],
      "least-busy",
    );
    // 每轮用**全新**会话 id:否则上一轮的 pin 会让第二轮走亲和分支,测不到 least-busy。
    let seq = 0;
    const take = (n: number) => {
      const out: Array<string | null> = [];
      for (let i = 0; i < n; i += 1) {
        const sessionId = `s${seq}`;
        seq += 1;
        const plan = router.plan({ chain: ch, sessionId });
        out.push(plan.item ? plan.item.endpoint.model : null);
        if (plan.item) {
          router.commit(plan.item, { sessionId });
        }
      }
      return out;
    };
    // 第一轮:三个桶都空 → 按配置序铺开
    expect(take(3)).toEqual(["m0", "m1", "m2"]);
    // 第二轮:三个桶在途都是 1(并列)→ 仍然回到配置序
    expect(take(3)).toEqual(["m0", "m1", "m2"]);
    // 现在三个桶都到上限 2 了 → 全忙
    expect(router.plan({ chain: ch, sessionId: "zzz" }).reason).toBe("all_busy");
  });

  it("balanced 铺开用(每档等概率),按序分配先吃满第一档", () => {
    // 用户要的是「先吃满前面的」,而 balanced 恰恰是它的反面(平均用)。
    // 两者是不同策略,不是同一行为的两种实现。
    //
    // ⚠️ 两侧的每档上限都必须是 3:ordered 要在同一档里塞下 3 个请求,
    // balanced 要能在 3 档之间正好各放 3 个(9 个请求填满 9 个位子)。
    const caps = [
      { model: "m0", concurrency: 3 },
      { model: "m1", concurrency: 3 },
      { model: "m2", concurrency: 3 },
    ];

    const { router: orderedRouter } = makeRouter();
    const orderedCh = chain(caps.map((c) => ({ ...c })), "");
    const takeOrdered: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const plan = orderedRouter.plan({ chain: orderedCh, sessionId: `o${i}` });
      takeOrdered.push(plan.item?.endpoint.model ?? "?");
      orderedRouter.commit(plan.item, { sessionId: `o${i}` });
    }
    expect(takeOrdered).toEqual(["m0", "m0", "m0"]);

    const { router: balancedRouter } = makeRouter();
    const balancedCh = chain(caps.map((c) => ({ ...c })), "balanced");
    const picks: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      const plan = balancedRouter.plan({ chain: balancedCh, sessionId: `b${i}` });
      picks.push(plan.item?.endpoint.model ?? "?");
      balancedRouter.commit(plan.item, { sessionId: `b${i}` });
    }
    expect(picks.filter((m) => m === "m0")).toHaveLength(3);
    expect(picks.filter((m) => m === "m1")).toHaveLength(3);
    expect(picks.filter((m) => m === "m2")).toHaveLength(3);
    expect(balancedRouter.ledger.snapshot()).toEqual({
      "probe/m0": 3,
      "probe/m1": 3,
      "probe/m2": 3,
    });
  });

  it("balanced 的硬约束:任何真实模型都不超自己的并发上限", () => {
    const { router } = makeRouter(undefined, { seed: 7 });
    const ch = chain([{ model: "m0" }, { model: "m1" }, { model: "m2" }], "balanced");
    for (let i = 0; i < 40; i += 1) {
      const plan = router.plan({ chain: ch, sessionId: `s${i}` });
      if (plan.item) {
        router.commit(plan.item, { sessionId: `s${i}` });
      }
    }
    const snap = router.ledger.snapshot();
    expect(Object.values(snap).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(9);
    for (const [mid, used] of Object.entries(snap)) {
      expect(used, mid).toBeLessThanOrEqual(3);
    }
  });

  it("降级(P4)对负载感知策略生效:有未降级候选时不选降级桶", () => {
    // 回归 2026-11-07:least-busy / balanced 按实时在途裁决,**完全不看链序** ——
    // 只把 P4 成员排到链末对这两种策略无效。现在调度器给链项打 degraded 标记,
    // Router 见到它就跳过(全部降级时才回退使用:降级=少用,不是禁用)。
    for (const strategy of ["least-busy", "balanced"] as const) {
      const { router } = makeRouter(undefined, { seed: 3 });
      // m0 降级、m1 正常。两者都给足空位(concurrency 10),
      // 这样「选谁」只由 degraded 决定,不会被并发上限干扰。
      const ch = chain(
        [
          { model: "m0", concurrency: 10 },
          { model: "m1", concurrency: 10 },
        ],
        strategy,
      ).map((it, i) => (i === 0 ? { ...it, degraded: true } : it));
      const picks: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        const plan = router.plan({ chain: ch, sessionId: `d${i}` });
        picks.push(plan.item?.endpoint.model ?? "?");
        if (plan.item) router.commit(plan.item, { sessionId: `d${i}` });
      }
      expect(picks, strategy).toEqual(Array(10).fill("m1"));
    }
  });

  it("降级桶是唯一可用候选时仍然用:降级 ≠ 禁用", () => {
    const { router } = makeRouter();
    // 唯一候选被降级 → 仍然必须能选出来,否则降级就变成了 P0 的语义
    const ch = chain([{ model: "m0" }], "least-busy").map((it) => ({ ...it, degraded: true }));
    const plan = router.plan({ chain: ch, sessionId: "only" });
    expect(plan.item?.endpoint.model).toBe("m0");
    expect(plan.reason).toBe("least_busy");
  });

  it("负载感知按**凭据**分桶:3 凭据 × concurrency 2 = 6 个并发位,不会误报 all_busy", () => {
    // ⚠️ 2026-11-08:账本按端点计,逐端点分桶是**正确**的 —— 每桶
    // room = concurrency - 该凭据在途。旧口径(D12)必须先按 realModelKey 归并,
    // 是因为那时各凭据查出来的是**同一个**在途数,逐项加权会被 hasRoom 挡下
    // (表现为「明明有空位却 all_busy」)。这条用例正是钉住「不再误报」。
    const { router } = makeRouter();
    const ch = chain(
      [
        { model: "m0", user: "u0", concurrency: 2 },
        { model: "m0", user: "u1", concurrency: 2 },
        { model: "m0", user: "u2", concurrency: 2 },
      ],
      "balanced",
    );
    const picks: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const plan = router.plan({ chain: ch, sessionId: `s${i}` });
      expect(plan.item, `第 ${i + 1} 个请求被判 ${plan.reason}`).not.toBeNull();
      picks.push(plan.item!.endpoint.endpointId);
      router.commit(plan.item, { sessionId: `s${i}` });
    }
    // 三个凭据都在用,共 6 条在途(= 3 × 2)。
    expect(new Set(picks).size).toBe(3);
    expect(router.ledger.total()).toBe(6);
    // 展示口径:仍是同一个真实模型的 6 条在途(不因内部换键变形)。
    expect(router.ledger.snapshot()).toEqual({ "probe/m0": 6 });
    // 第 7 个才全忙。
    expect(router.plan({ chain: ch, sessionId: "s-extra" }).reason).toBe("all_busy");
  });
});

// ===========================================================================
// 4. 冷却:三层优先级 + 瞬时故障豁免
// ===========================================================================

describe("冷却的三层优先级(上游 until > 供应商覆盖 > 全局)", () => {
  it("cooldown_overrides 只影响该 provider", () => {
    // 冷却记录按 endpoint_id 存,覆盖按失败端点的 provider 查 ——
    // 覆盖只该落在配了的那家,不该污染没配的供应商。
    const { router } = makeRouter(
      deps({
        [SETTING_COOLDOWN_OVERRIDES]: JSON.stringify({ sensenova: 1 }),
      }),
    );
    const ch = chain([{ provider: "sensenova", model: "deepseek-v4-flash" }]);

    const recA = failOnce(router, ch, "za");
    expect(recA.fails).toBe(1);
    expect(recA.cooldownUntil - recA.updatedAt).toBeCloseTo(60, 6);

    const chB = chain([{ provider: "otherp", model: "m-x" }]);
    const recB = failOnce(router, chB, "zb");
    expect(recB.cooldownUntil - recB.updatedAt).toBeCloseTo(GLOBAL_FLOOR_S, 6);
  });

  it("cooldown_overrides 压过 retry.logical_cooldown(两级链)", () => {
    const { router } = makeRouter(
      deps({
        [SETTING_COOLDOWN_OVERRIDES]: JSON.stringify({ sensenova: 2 }),
        [SETTING_LOGICAL_COOLDOWN]: "4",
      }),
    );
    const ch = chain([{ provider: "sensenova", model: "deepseek-v4-flash" }]);
    const rec = failOnce(router, ch, "s");
    expect(rec.cooldownUntil - rec.updatedAt).toBeCloseTo(120, 6);
  });

  it("rules 里没有该 provider → 回落 retry.logical_cooldown", () => {
    const { router } = makeRouter(deps({ [SETTING_LOGICAL_COOLDOWN]: "4" }));
    const ch = chain([{ model: "m0" }]);
    const rec = failOnce(router, ch, "s");
    expect(rec.cooldownUntil - rec.updatedAt).toBeCloseTo(240, 6);
  });

  it("覆盖表里的 0 / 负数 / 非数字 = 不覆盖(回落全局)", () => {
    // 0 表示「没配」而不是「不冷却」—— 把 0 解读成「关掉冷却」会造出一个
    // 用覆盖键关掉熔断的静默通道。
    const { router } = makeRouter(
      deps({
        [SETTING_COOLDOWN_OVERRIDES]: JSON.stringify({
          sensenova: 0,
          otherp: -1,
          third: "x",
        }),
      }),
    );
    const ch = chain([{ provider: "sensenova", model: "deepseek-v4-flash" }]);
    const rec = failOnce(router, ch, "s");
    expect(rec.cooldownUntil - rec.updatedAt).toBeCloseTo(GLOBAL_FLOOR_S, 6);
  });

  it("覆盖表坏了 → 跳过该层,不炸请求", () => {
    const { router } = makeRouter(deps({ [SETTING_COOLDOWN_OVERRIDES]: "{not json" }));
    const ch = chain([{ model: "m0" }]);
    const rec = failOnce(router, ch, "s");
    expect(rec.cooldownUntil - rec.updatedAt).toBeCloseTo(GLOBAL_FLOOR_S, 6);
  });

  it("已退役的冷却键设了也**不被读**", () => {
    // 退役的是:provider.cooldown_overrides / provider.cooldown.<id> /
    // provider.cooldown_min。库里残留行惰性无效。
    const { router } = makeRouter(
      deps({
        "provider.cooldown_overrides": JSON.stringify({ sensenova: 1 }),
        "provider.cooldown.sensenova": "1",
        "provider.cooldown_min": "2",
      }),
    );
    const ch = chain([{ provider: "sensenova", model: "deepseek-v4-flash" }]);
    const rec = failOnce(router, ch, "s");
    expect(rec.cooldownUntil - rec.updatedAt).toBeCloseTo(GLOBAL_FLOOR_S, 6);
  });

  it("配置里没有 retry.logical_cooldown → 用**播种的缺省值** 15 分钟(900s)", () => {
    // ⚠️ 这里不是「不熔断」:Nexus 的 retry_setting() 在键缺失时会**播种**
    // RETRY_DEFAULTS["retry.logical_cooldown"] = 15 后回读,值非法时「写回缺省值再回读」,
    // 所以它永远返回一个数,Router 拿到的是 900s。只有「读不动」(repo 抛错)才退回
    // None = 不熔断 —— 见下一条。
    const d = new InMemoryRouterDeps({
      [SETTING_COOLDOWN_OVERRIDES]: "{}",
    });
    const { router } = makeRouter(d);
    const ch = chain([{ model: "m0" }]);
    const rec = failOnce(router, ch, "s");
    expect(rec.fails).toBe(1);
    expect(rec.cooldownUntil - rec.updatedAt).toBeCloseTo(GLOBAL_FLOOR_S, 6);
  });

  it("设置源读不动(repo 抛错)→ 不熔断(只记账)", () => {
    // 对应 Nexus `_cooldown_policy` 的 except 分支:拿不到策略时宁可只记失败,
    // 也不要用一个猜出来的时长把端点雪藏。
    const { clock } = makeRouter();
    const throwing: SettingSource = {
      getSetting(key: string): string | null {
        if (key === SETTING_LOGICAL_COOLDOWN) {
          throw new Error("db is down");
        }
        return null;
      },
    };
    const router = new Router(throwing, { clock });
    const ch = chain([{ model: "m0" }]);
    const rec = failOnce(router, ch, "s");
    expect(rec.fails).toBe(1); // 记账照旧
    // ⚠️ 落的是 `now + 0`(**不是** 0):Nexus `note_failure` 的
    // `floor = 0.0 if policy is None else policy.cooldown_floor_s` /
    // `self.cooldown_until = now + floor`。`now > now` 为假 → 实际不冷却,
    // 所以「不熔断」体现在 `cooled()` 为空,而不是字段等于 0。
    expect(rec.cooldownUntil).toBe(rec.updatedAt);
    expect(router.health.cooled()).toEqual([]);
    expect(router.plan({ chain: ch, sessionId: "s2" }).item).not.toBeNull();
  });

  it("上游 Retry-After → 冷却到**绝对时刻**,不跟 now+floor 取 max", () => {
    // 取 max 会把上游给的更短时刻悄悄拉长(Retry-After: 30 配 900s floor
    // 会变成 900s),那正是「上游说了不算」。
    const { router, clock } = makeRouter(
      deps({
        [SETTING_COOLDOWN_OVERRIDES]: JSON.stringify({ sensenova: 15 }),
      }),
    );
    const ch = chain([{ provider: "sensenova", model: "deepseek-v4-flash" }]);
    const t0 = clock.wallNow();
    const rec = failOnce(router, ch, "s", {
      kind: UpstreamErrorKind.RateLimit,
      status: 429,
      error: "上游限流:额度耗尽",
      cooldownUntil: t0 + 120,
    });
    expect(rec.cooldownUntil - t0).toBeCloseTo(120, 6);
    expect(rec.cooldownUntil).toBeLessThan(t0 + 600); // 远短于覆盖层的 900s
  });

  it("没有 Retry-After 的失败照旧走覆盖链", () => {
    // 这条是回归哨兵:上游时间那层是可选的,不传 cooldownUntil 时行为必须与
    // 「上游时间」加入之前逐字节一致。
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    const rec = failOnce(router, ch, "s", { kind: UpstreamErrorKind.Auth, status: 401 });
    expect(rec.cooldownUntil - rec.updatedAt).toBeCloseTo(GLOBAL_FLOOR_S, 6);
  });

  it("成功一次即清零并解冻;失败留得下 kind / status / error", () => {
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    const plan = router.plan({ chain: ch, sessionId: "s" });
    const endpointId = plan.item?.endpoint.endpointId ?? "";
    router.commit(plan.item, { sessionId: "s" });
    router.finish(plan.item, {
      sessionId: "s",
      ok: false,
      error: "账号失效: invalid api key",
      kind: UpstreamErrorKind.Auth,
      status: 401,
    });
    const failed = router.health.snapshot().items[endpointId];
    expect(failed.lastKind).toBe("auth");
    expect(failed.lastStatus).toBe(401);
    expect(failed.lastError).toContain("invalid api key");
    expect(failed.fails).toBe(1);

    // 成败必须记在同一个端点上才谈得上清零
    router.finish(plan.item, { sessionId: "s", ok: true });
    const cleared = router.health.snapshot().items[endpointId];
    expect(cleared.fails).toBe(0);
    expect(cleared.cooldownUntil).toBe(0);
    expect(cleared.lastKind).toBe("");
    expect(cleared.lastStatus).toBe(0);
    expect(cleared.lastError).toBe("");
  });
});

describe("瞬时故障不冷却(2026-10-18 定案)", () => {
  it("timeout 失败:记账但**不进冷却**,且端点仍选得到", () => {
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    const plan = router.plan({ chain: ch, sessionId: "s" });
    const endpointId = plan.item?.endpoint.endpointId ?? "";
    router.commit(plan.item, { sessionId: "s" });
    router.finish(plan.item, {
      sessionId: "s",
      ok: false,
      error: "等待上游超过 25s 无响应",
      kind: UpstreamErrorKind.Timeout,
      status: 504,
    });
    const rec = router.health.snapshot().items[endpointId];
    expect(rec.cooldownUntil).toBe(0); // 断言打在 0 上,不是「小于 900」
    expect(rec.lastKind).toBe("timeout");
    expect(rec.lastError).toBe("等待上游超过 25s 无响应");

    // 可观测后果:同一条链再 plan 一次,拿得到同一枚端点
    const again = router.plan({ chain: ch, sessionId: "s2" });
    expect(again.item?.endpoint.endpointId).toBe(endpointId);
  });

  it("connection 失败:记账但**不进冷却**", () => {
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    const rec = failOnce(router, ch, "s", {
      kind: UpstreamErrorKind.Connection,
      status: 502,
      error: "[sensenova] 账号 buhhuv 连接失败",
    });
    expect(rec.cooldownUntil).toBe(0);
    expect(rec.lastKind).toBe("connection");
  });

  it("瞬时故障**照样累加** fails(只跳过冷却,不跳过记账)", () => {
    // 只跳过冷却,不跳过计数 —— 否则面板上的「最近一次失败」会停在第一次抖动之前。
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    let endpointId = "";
    for (let i = 0; i < 3; i += 1) {
      const plan = router.plan({ chain: ch, sessionId: `s${i}` });
      endpointId = plan.item?.endpoint.endpointId ?? "";
      router.commit(plan.item, { sessionId: `s${i}` });
      router.finish(plan.item, {
        sessionId: `s${i}`,
        ok: false,
        error: `连接失败 ${i}`,
        kind: UpstreamErrorKind.Connection,
        status: 502,
      });
    }
    const rec = router.health.snapshot().items[endpointId];
    expect(rec.fails).toBe(3);
    expect(rec.cooldownUntil).toBe(0);
  });

  it("上游给了**明确恢复时刻**时,瞬时故障也照样冷到那一刻", () => {
    // 优先级:上游显式 until > 「瞬时故障不冷却」。
    const { router, clock } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    const t0 = clock.wallNow();
    const rec = failOnce(router, ch, "s", {
      kind: UpstreamErrorKind.Timeout,
      status: 504,
      error: "等待上游超过 25s 无响应",
      cooldownUntil: t0 + 120,
    });
    expect(rec.cooldownUntil - t0).toBeCloseTo(120, 6);
  });

  it("对照组:upstream(5xx)**照旧**冷却 —— 豁免名单的边界", () => {
    // 把 5xx 也免掉等于关掉一半熔断。
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    const rec = failOnce(router, ch, "s", {
      kind: UpstreamErrorKind.Upstream,
      status: 502,
      error: "上游返回 HTTP 502",
    });
    expect(rec.cooldownUntil - rec.updatedAt).toBeCloseTo(GLOBAL_FLOOR_S, 6);
  });

  it("瞬时故障不清零已有冷却(只有成功能解冻)", () => {
    const { router, clock } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    const t0 = clock.wallNow();
    const endpointId = ch[0].endpoint.endpointId;

    const plan = router.plan({ chain: ch, sessionId: "s" });
    router.commit(plan.item, { sessionId: "s" });
    router.finish(plan.item, {
      sessionId: "s",
      ok: false,
      error: "429",
      kind: UpstreamErrorKind.RateLimit,
      status: 429,
      cooldownUntil: t0 + 600,
    });
    expect(router.health.get(endpointId).cooldownUntil).toBeCloseTo(t0 + 600, 6);

    // 冷却期内用 ignoreCooldown 再打一次瞬时故障
    const plan2 = router.plan({ chain: ch, sessionId: "s2", ignoreCooldown: true });
    router.commit(plan2.item, { sessionId: "s2" });
    router.finish(plan2.item, {
      sessionId: "s2",
      ok: false,
      error: "timeout",
      kind: UpstreamErrorKind.Timeout,
      status: 504,
    });
    const rec = router.health.get(endpointId);
    expect(rec.cooldownUntil).toBeCloseTo(t0 + 600, 6); // 未被缩短
    expect(rec.fails).toBe(2);
    expect(rec.lastKind).toBe("timeout");
  });
});

// ===========================================================================
// 5. 直连真实模型无视冷却 / 逻辑档链照旧跳过
// ===========================================================================

describe("ignoreCooldown(直连真实模型语义)", () => {
  it("ignoreCooldown=true 时冷却期内仍选得到冷却端点;失败照常记冷却", () => {
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }]);

    const plan = router.plan({ chain: ch, sessionId: "s", ignoreCooldown: true });
    const epId = plan.item?.endpoint.endpointId ?? "";
    router.commit(plan.item, { sessionId: "s" });
    router.finish(plan.item, {
      sessionId: "s",
      ok: false,
      error: "boom",
      kind: UpstreamErrorKind.Auth,
      status: 401,
    });
    expect(router.health.get(epId).cooldownUntil).toBeGreaterThan(0);

    const again = router.plan({ chain: ch, sessionId: "s2", ignoreCooldown: true });
    expect(again.item?.endpoint.endpointId).toBe(epId);

    // 对照组:同一个冷却端点,默认(逻辑模型语义)就是 all_cooldown
    const blocked = router.plan({ chain: ch, sessionId: "s3" });
    expect(blocked.item).toBeNull();
    expect(blocked.reason).toBe("all_cooldown");
  });

  it("逻辑模型档链照旧:冷却端点被跳过(默认 ignoreCooldown=false)", () => {
    const { router } = makeRouter();
    const ch = chain([{ model: "m0" }]);
    const plan = router.plan({ chain: ch, sessionId: "s" });
    router.commit(plan.item, { sessionId: "s" });
    router.finish(plan.item, {
      sessionId: "s",
      ok: false,
      error: "boom",
      kind: UpstreamErrorKind.Auth,
      status: 401,
    });
    const again = router.plan({ chain: ch, sessionId: "s2" });
    expect(again.item).toBeNull();
    expect(again.reason).toBe("all_cooldown");
  });
});

// ===========================================================================
// 6. 带图请求的视觉池收窄(D30)
// ===========================================================================

describe("带图请求的视觉池(D30)", () => {
  const mixed = () => chain([{ model: "plain" }, { model: "vis", vision: true }]);

  it("链上有视觉端点 → 只从视觉端点里挑(即使它排在链末尾)", () => {
    // 带图请求若按链序走,会把图发给不能看图的模型。
    const { router } = makeRouter();
    const ch = mixed();
    const plan = router.plan({ chain: ch, sessionId: "s", needsVision: true });
    expect(plan.item?.endpoint.model).toBe("vis");
  });

  it("链上**没有**视觉端点 → 允许落到普通端点(图像桥/连接器兜底)", () => {
    const { router } = makeRouter();
    const ch = chain([{ model: "p0" }, { model: "p1" }]);
    const plan = router.plan({ chain: ch, sessionId: "s", needsVision: true });
    expect(plan.item?.endpoint.model).toBe("p0");
  });

  it("视觉池全忙 → all_busy,而**不是**回退到链里的普通端点", () => {
    // 若悄悄回退,慢视觉请求会被普通模型接走,图照样白发。
    // ⚠️ 必须真的 commit(占住租约):只 plan 不 commit 等于没占位,
    // 第二个请求当然还能挑到同一台 —— 那样测的是夹具,不是收窄逻辑。
    const { router } = makeRouter();
    const ch = mixed();
    const first = router.plan({ chain: ch, sessionId: "s1", needsVision: true });
    expect(first.item?.endpoint.model).toBe("vis");
    router.commit(first.item, { sessionId: "s1" });

    const second = router.plan({ chain: ch, sessionId: "s2", needsVision: true });
    expect(second.item).toBeNull();
    expect(second.reason).toBe("all_busy");
    // 普通端点此时是空的,却**不能**被拿来兜底(容量键 = 端点)
    expect(router.ledger.inFlight("probe/plain@probe/u0")).toBe(0);

    // 释放后立刻又能挑到视觉端点
    router.finish(first.item, { sessionId: "s1", ok: true });
    const third = router.plan({ chain: ch, sessionId: "s3", needsVision: true });
    expect(third.item?.endpoint.model).toBe("vis");
  });

  it("不带图的请求**不看**视觉池 —— 照常按链序走(普通模型优先)", () => {
    const { router } = makeRouter();
    const ch = mixed();
    const plan = router.plan({ chain: ch, sessionId: "s", needsVision: false });
    expect(plan.item?.endpoint.model).toBe("plain");
  });
});

// ===========================================================================
// 7. 保留区容量跟着 ui.recent_limit
// ===========================================================================

describe("保留区容量(ui.recent_limit 是唯一条数口径)", () => {
  it("容量真的驱动账本(不是只有显示层在切),且恢复后不再截断", () => {
    const d = deps({ [SETTING_RECENT_LIMIT]: "3" });
    const { router } = makeRouter(d);
    const finishOne = () => {
      const h = router.ledger.acquire("p/m", { endpointId: "p/m@x", logicalModel: "lg" });
      router.ledger.release(h, { outcome: outcome() });
    };
    for (let i = 0; i < 5; i += 1) {
      finishOne();
    }
    expect(router.ledger.recentRows()).toHaveLength(3);

    d.setSetting(SETTING_RECENT_LIMIT, "50");
    for (let i = 0; i < 5; i += 1) {
      finishOne();
    }
    expect(router.ledger.recentRows()).toHaveLength(8);
  });

  it("默认 50、正常值照读、坏值一律回落 50", () => {
    const d = new InMemoryRouterDeps();
    const { router } = makeRouter(d);
    expect(router.recentLimit()).toBe(50);

    d.setSetting(SETTING_RECENT_LIMIT, "120");
    expect(router.recentLimit()).toBe(120);

    for (const bad of ["", "abc", "0", "-5", null, "3.9"]) {
      d.setSetting(SETTING_RECENT_LIMIT, bad);
      expect(router.recentLimit(), String(bad)).toBe(50);
    }
  });
});

// ===========================================================================
// 8. 观测面
// ===========================================================================

describe("观测面", () => {
  it("snapshot 的 inflight 键是**真实模型**,不是端点", () => {
    const { router } = makeRouter();
    const ch = chain([{ model: "m0", user: "u0" }, { model: "m0", user: "u1" }]);
    const plan = router.plan({ chain: ch, sessionId: "a" });
    router.commit(plan.item, { sessionId: "a", logicalName: "lg" });

    const snap = router.snapshot();
    expect(snap.inflightKey).toBe("real_model_id");
    expect(snap.inflight).toEqual({ "probe/m0": 1 });
    expect(snap.inflightTotal).toBe(1);
    expect(snap.pins).toBe(1);
  });

  it("on_commit 回调被调用,抛错也不拖垮请求", () => {
    const seen: string[] = [];
    const router = new Router(deps(), {
      clock: mutableClock(1_700_000_000),
      onCommit: (realModelId) => {
        seen.push(realModelId);
      },
    });
    const ch = chain([{ model: "m0" }]);
    const plan = router.plan({ chain: ch, sessionId: "a" });
    router.commit(plan.item, { sessionId: "a", logicalName: "lg" });
    expect(seen).toEqual(["probe/m0"]);

    const boom = new Router(deps(), {
      clock: mutableClock(1_700_000_000),
      onCommit: () => {
        throw new Error("observer boom");
      },
    });
    const plan2 = boom.plan({ chain: ch, sessionId: "b" });
    expect(() => boom.commit(plan2.item, { sessionId: "b" })).not.toThrow();
  });

  it("plan 会把内存健康记录注入链(链来自 Repo,自己不带最新状态)", () => {
    const registry = new HealthRegistry({ wallNow: () => 1_700_000_000 });
    registry.put("probe/m0@probe/u0", {
      fails: 1,
      cooldownUntil: 1_700_000_000 + 900,
      lastError: "boom",
      updatedAt: 1_700_000_000,
      lastKind: "auth",
      lastStatus: 401,
    });
    const { router } = makeRouter(deps(), { health: registry });
    const ch = chain([{ model: "m0" }]);
    const plan = router.plan({ chain: ch, sessionId: "a" });
    expect(plan.item).toBeNull();
    expect(plan.reason).toBe("all_cooldown");
  });

  it("cooled() 只列冷却中的记录;tracked / cooling 计数同源", () => {
    const { router } = makeRouter();
    router.health.put("b@p", {
      fails: 1,
      cooldownUntil: 1_700_000_000 + 60,
      lastError: "",
      updatedAt: 1_700_000_000,
      lastKind: "auth",
      lastStatus: 401,
    });
    router.health.put("a@p", {
      fails: 1,
      cooldownUntil: 1_700_000_000 + 60,
      lastError: "",
      updatedAt: 1_700_000_000,
      lastKind: "auth",
      lastStatus: 401,
    });
    const cooled = router.health.cooled();
    expect(cooled).toHaveLength(2);
    expect(router.health.snapshot().cooling).toBe(2);
    expect(router.health.snapshot().tracked).toBe(2);
  });
});

// ===========================================================================
// 9. 纯函数层:解析器与键
// ===========================================================================

describe("纯函数层", () => {
  it("parseCooldownOverrides:对象 {provider: 分钟},形状合法的才进表", () => {
    const rules = parseCooldownOverrides(
      JSON.stringify({
        a: 1,
        b: 7,
        c: 0,
        d: -1,
        e: "x",
        "": 3,
      }),
    );
    expect(rules).toEqual({ a: 1, b: 7 }); // 0/-1/非数字/空 provider 全部不进表

    expect(parseCooldownOverrides(null)).toEqual({});
    expect(parseCooldownOverrides("")).toEqual({});
    expect(parseCooldownOverrides("{not json")).toEqual({});
    expect(parseCooldownOverrides(JSON.stringify([1, 2]))).toEqual({});
  });

  it("parseCooldownRules:形状合法的才进表,同一 provider 最后一条赢", () => {
    const rules = parseCooldownRules(
      JSON.stringify({
        rules: [
          { provider: "a", cooldown: 1 },
          { provider: "a", cooldown: 7 },
          { provider: "b", cooldown: 0 },
          { provider: "c", cooldown: -1 },
          { provider: "d", cooldown: "x" },
          { provider: "", cooldown: 3 },
          { nope: true },
        ],
      }),
    );
    expect(rules).toEqual({ a: 7 }); // b/c/d/空 provider 全部不进表

    expect(parseCooldownRules(null)).toEqual({});
    expect(parseCooldownRules("")).toEqual({});
    expect(parseCooldownRules("{not json")).toEqual({});
    expect(parseCooldownRules(JSON.stringify({ rules: "nope" }))).toEqual({});
    expect(parseCooldownRules(JSON.stringify([1, 2]))).toEqual({});
  });

  it("现拼标识符与 v4 契约一致", () => {
    const item = chainItemFrom({ endpoint: ep({ provider: "workbuddy", model: "m" }) });
    expect(item.endpoint.realModelKey).toBe("workbuddy/m");
    expect(item.endpoint.username).toBe("u0");
    expect(item.endpoint.inCooldown(0)).toBe(false);

    // 端点身份键 = 真实模型 × 该 provider 名下的一枚凭据
    const sensenova = chainItemFrom({
      endpoint: ep({ provider: "sensenova", model: "deepseek-v4-flash", user: "seat0" }),
    });
    expect(sensenova.endpoint.endpointId).toBe("sensenova/deepseek-v4-flash@sensenova/seat0");
  });

  it("chainItemFrom 透传 direct(m02240 抢占语义的载体)", () => {
    // 丢了 direct,直连请求就走不上 ignoreCooldown / acquireDirect ——
    // 表现为「一次 503 之后同模型在冷却期内永远 502 all_cooldown」。
    const direct = chainItemFrom({
      endpoint: ep({ provider: "clawbrain", model: "clawbrain-pro" }),
      direct: true,
    });
    expect(direct.direct).toBe(true);

    const logical = chainItemFrom({
      endpoint: ep({ provider: "workbuddy", model: "hy4-preview" }),
    });
    expect(logical.direct).toBe(false);
  });

  it("endpointFrom 容忍 v3 字段名与缺省值", () => {
    const fromV3 = endpointFrom({
      providerId: "p",
      upstreamId: "m",
      accountId: "alice",
    });
    expect(fromV3.provider).toBe("p");
    expect(fromV3.model).toBe("m");
    expect(fromV3.credentialKey).toEqual(["p", "alice"]);
    expect(fromV3.concurrency).toBe(1);
    expect(fromV3.health).toBeNull();

    const badConcurrency = endpointFrom({ provider: "p", model: "m", concurrency: -5 });
    expect(badConcurrency.concurrency).toBe(1); // 夹到 ≥1
  });

  it("HealthRegistry:没有记录 = 可用;purgeExpired 只丢「冷完又没被选过」的", () => {
    const registry = new HealthRegistry();
    expect(registry.known("x")).toBe(false);
    expect(registry.get("x").cooldownUntil).toBe(0);

    const now = 1_700_000_000;
    registry.put("stale", {
      fails: 1,
      cooldownUntil: now - 1, // 早就冷完了
      lastError: "boom",
      updatedAt: now - 100,
      lastKind: "auth",
      lastStatus: 401,
    });
    registry.put("cooling", {
      fails: 1,
      cooldownUntil: now + 600,
      lastError: "boom",
      updatedAt: now,
      lastKind: "auth",
      lastStatus: 401,
    });
    expect(registry.purgeExpired(now)).toBe(1);
    expect(registry.known("stale")).toBe(false);
    expect(registry.known("cooling")).toBe(true);

    registry.clear("cooling");
    expect(registry.known("cooling")).toBe(false);
  });

  it("TRANSIENT_KINDS 就是 timeout + connection 两个(哨兵)", () => {
    // 名单是代码里的常量,改它必须同步改测试 —— 这是哨兵。
    expect([...TRANSIENT_KINDS].sort()).toEqual(
      [UpstreamErrorKind.Timeout, UpstreamErrorKind.Connection].sort(),
    );
  });
});
