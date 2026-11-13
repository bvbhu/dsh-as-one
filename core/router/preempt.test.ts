/**
 * 抢占语义测试(m02240)—— 「直连的真实模型抢占逻辑模型」这条机制的规格。
 *
 * 覆盖点:
 * | 语义 | 本文件的用例 |
 * |---|---|
 * | 账本:抢占**通知**受害方(能真的打断上游调用) | `抢占会通知受害方` |
 * | 账本:回调抛异常不影响抢占本身 | `通知回调抛异常不影响抢占` |
 * | 账本:回调表与租约同生共死(不误伤后来者) | `租约释放后回调不再被触发` |
 * | 账本:可抢占对象只算**非直连**租约 | `hasPreemptable 只数非直连租约` |
 * | 选路:直连在满桶时仍能选中(抢占的**前提**) | `直连请求在满桶时仍能选到端点` |
 * | 选路:逻辑模型**不抢占**(只能等/换档) | `逻辑模型在满桶时不抢占` |
 * | 收尾:抢占**不记端点失败、不冷却** | `抢占不记端点失败也不冷却` |
 * | 收尾:抢占**不解除会话粘性** | `抢占不解除会话粘性` |
 * | 端到端:直连抢到槽位,受害方被通知并让位 | `直连抢占:受害方让位、直连拿到槽位` |
 *
 * ⚠️ **为什么这些断言这么严**:抢占一旦写错,后果是**看不见的故障** ——
 * 受害方继续占着真实上游的连接(直连照样被限流),或者受害方把无辜端点
 * 记成失败(那个端点被平白冷却 15 分钟)。两者都不会抛异常,只会表现为
 * 「直连还是慢」/「某个模型莫名其妙开始 503」。
 */

import { describe, expect, it } from "vitest";

import { mutableClock } from "./clock.js";
import { InMemoryRouterDeps, Router } from "./router.js";
import { InflightLedger } from "./inflight-ledger.js";
import {
  PREEMPT_ERROR,
  SETTING_COOLDOWN_OVERRIDES,
  SETTING_LOGICAL_COOLDOWN,
  SETTING_RECENT_LIMIT,
  chainItemFrom,
  type ChainItem,
  type EndpointSnapshot,
} from "./types.js";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

/** 构造一个端点快照。 */
function ep(model: string, user = "u0", concurrency = 1): EndpointSnapshot {
  return {
    provider: "probe",
    model,
    credentialKey: ["probe", user],
    protocol: "openai",
    concurrency,
    supportsVision: false,
  };
}

/** 构造一条链(顺序即 priority);`direct` 逐项指定。 */
function chain(
  defs: readonly { model: string; user?: string; concurrency?: number; direct?: boolean }[],
): ChainItem[] {
  return defs.map((d, i) => {
    const item = chainItemFrom({
      endpoint: ep(d.model, d.user, d.concurrency),
      direct: d.direct === true,
    });
    return { ...item, priority: i };
  });
}

/** 一个「干净的」deps:全局冷却 900s、`scheduler.cooldown_overrides` 为空。 */
function deps(): InMemoryRouterDeps {
  return new InMemoryRouterDeps({
    [SETTING_LOGICAL_COOLDOWN]: "15",
    [SETTING_COOLDOWN_OVERRIDES]: "{}",
    [SETTING_RECENT_LIMIT]: "50",
  });
}

/** 建一个 Router(时钟固定,便于断言冷却截止)。 */
function makeRouter(): Router {
  return new Router(deps(), { clock: mutableClock(1_700_000_000) });
}

// ---------------------------------------------------------------------------
// 账本层
// ---------------------------------------------------------------------------

describe("InflightLedger 抢占通知(m02240)", () => {
  it("抢占会通知受害方", () => {
    const ledger = new InflightLedger({ clock: mutableClock(1000) });
    let notified: string | null = null;
    // ⚠️ 2026-11-08 起容量键是**端点**:受害者与直连请求必须落在同一个端点,
    // 才谈得上「抢这个槽」(踢别的凭据的租约换不来空位)。
    ledger.acquire("p/m", {
      endpointId: "e1",
      sessionId: "s1",
      onPreempt: (reason) => {
        notified = reason;
      },
    });

    const direct = ledger.acquireDirect("p/m", 1, { endpointId: "e1", sessionId: "d1" });
    expect(direct).not.toBeNull();
    // 受害方**真的被通知了** —— 这是「能打断上游调用」的前提。
    expect(notified).toBe(PREEMPT_ERROR);
    // 槽位已让给直连:受害方的租约没了,直连的租约在。
    expect(ledger.inFlight("e1")).toBe(1);
    expect(ledger.detail().map((l) => l.direct)).toEqual([true]);
  });

  it("通知回调抛异常不影响抢占", () => {
    const ledger = new InflightLedger({ clock: mutableClock(1000) });
    ledger.acquire("p/m", {
      endpointId: "e1",
      onPreempt: () => {
        throw new Error("boom");
      },
    });
    // 回调炸了,抢占**照常完成** —— 否则受害方一个回调 bug 就能让直连请求
    // 也一起失败(那比不抢占更糟)。
    const direct = ledger.acquireDirect("p/m", 1, { endpointId: "e1" });
    expect(direct).not.toBeNull();
    expect(ledger.inFlight("e1")).toBe(1);
    expect(ledger.detail().map((l) => l.direct)).toEqual([true]);
  });

  it("租约释放后回调不再被触发", () => {
    const ledger = new InflightLedger({ clock: mutableClock(1000) });
    let count = 0;
    const lease = ledger.acquire("p/m", {
      endpointId: "e1",
      onPreempt: () => {
        count += 1;
      },
    });
    ledger.release(lease);
    // 租约已释放 → 回调表必须同步清掉(否则句柄复用后会误伤后来者)。
    ledger.acquire("p/m", { endpointId: "e1" });
    const direct = ledger.acquireDirect("p/m", 1, { endpointId: "e1" });
    expect(direct).not.toBeNull();
    expect(count).toBe(0);
  });

  it("hasPreemptable 只数非直连租约,且只看同一个凭据", () => {
    const ledger = new InflightLedger({ clock: mutableClock(1000) });
    expect(ledger.hasPreemptable("e1")).toBe(false);
    // 直连租约**不可被抢占**(直连是「用户点名要这个真实模型」,两个点名
    // 请求互相抢,谁都不该赢)。
    ledger.acquire("p/m", { endpointId: "e1", direct: true });
    expect(ledger.hasPreemptable("e1")).toBe(false);
    // 另一个凭据上的逻辑租约**不算**这个端点的可抢占对象。
    ledger.acquire("p/m", { endpointId: "e2", direct: false });
    expect(ledger.hasPreemptable("e1")).toBe(false);
    expect(ledger.hasPreemptable("e2")).toBe(true);
    // 同端点上的逻辑租约可被抢占。
    ledger.acquire("p/m", { endpointId: "e1", direct: false });
    expect(ledger.hasPreemptable("e1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 选路层
// ---------------------------------------------------------------------------

describe("Router 选路的抢占兜底(m02240)", () => {
  it("直连请求在满桶时仍能选到端点", () => {
    const router = makeRouter();
    const logical = chain([{ model: "m0" }]);
    const direct = chain([{ model: "m0", direct: true }]);

    // 先让逻辑请求占住桶(并发 1)。
    const lPlan = router.plan({ chain: logical, sessionId: "l1" });
    expect(lPlan.item).not.toBeNull();
    router.commit(lPlan.item, { sessionId: "l1" });

    // 桶满了。**逻辑**模型此时只能报 all_busy(它不抢占)。
    const lBusy = router.plan({ chain: logical, sessionId: "l2" });
    expect(lBusy.item).toBeNull();
    expect(lBusy.reason).toBe("all_busy");

    // 但**直连**请求仍要选得到端点 —— 否则抢占在**选路**阶段就被 503 挡掉,
    // `commit` 里的 acquireDirect 永远轮不到执行(抢占等于没写)。
    const dPlan = router.plan({ chain: direct, sessionId: "d1" });
    expect(dPlan.item, dPlan.reason).not.toBeNull();
  });

  it("逻辑模型在满桶时不抢占", () => {
    const router = makeRouter();
    const logical = chain([{ model: "m0" }]);
    const lPlan = router.plan({ chain: logical, sessionId: "l1" });
    router.commit(lPlan.item, { sessionId: "l1" });

    // 第二个逻辑请求**不**选到那个满着的端点(没有可让的对象时它该报 all_busy)。
    const second = router.plan({ chain: logical, sessionId: "l2" });
    expect(second.item).toBeNull();
    expect(second.reason).toBe("all_busy");
  });
});

// ---------------------------------------------------------------------------
// 收尾层
// ---------------------------------------------------------------------------

describe("Router.finish 的抢占口径(m02240)", () => {
  it("抢占不记端点失败也不冷却", () => {
    const router = makeRouter();
    const direct = chain([{ model: "m0", direct: true }]);
    const plan = router.plan({ chain: direct, sessionId: "d1" });
    const lease = router.commit(plan.item, { sessionId: "d1" });

    // 抢占收尾:端点一次都没失败过 → 健康账本必须**原封不动**。
    router.finish(plan.item, { leaseId: lease, sessionId: "d1", ok: false, preempted: true });

    const health = router.health.snapshot();
    expect(health.cooling).toBe(0);
    expect(health.items[plan.item!.endpoint.endpointId]?.fails ?? 0).toBe(0);
  });

  it("抢占不解除会话粘性", () => {
    const router = makeRouter();
    const logical = chain([{ model: "m0" }]);
    const plan = router.plan({ chain: logical, sessionId: "l1" });
    const lease = router.commit(plan.item, { sessionId: "l1" });
    expect(router.pins.get("l1")).not.toBeNull();

    // 抢占不是「这个端点坏了」→ 粘性该留(否则一次抢占就把长会话的固定
    // 模型搅乱了,prompt cache 全丢)。
    router.finish(plan.item, { leaseId: lease, sessionId: "l1", ok: false, preempted: true });
    expect(router.pins.get("l1")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 端到端
// ---------------------------------------------------------------------------

describe("直连抢占:端到端(m02240)", () => {
  it("直连抢占:受害方让位、直连拿到槽位", () => {
    const router = makeRouter();
    const logical = chain([{ model: "m0" }]);
    const direct = chain([{ model: "m0", direct: true }]);

    // 逻辑请求占住桶,并登记抢占回调(网关侧靠它打断自己的上游调用)。
    let victimNotified = false;
    const lPlan = router.plan({ chain: logical, sessionId: "l1" });
    const lLease = router.commit(lPlan.item, {
      sessionId: "l1",
      onPreempt: () => {
        victimNotified = true;
      },
    });
    expect(lLease).not.toBe("");

    // 直连请求到达:桶满,但桶里有可让的逻辑租约 → 选得到端点。
    const dPlan = router.plan({ chain: direct, sessionId: "d1" });
    expect(dPlan.item, dPlan.reason).not.toBeNull();

    // commit → 抢占:踢掉逻辑租约、通知受害方、直连拿到槽位。
    const dLease = router.commit(dPlan.item, { sessionId: "d1" });
    expect(dLease).not.toBe("");
    expect(victimNotified).toBe(true);
    // 容量键 = 端点(2026-11-08),不是真实模型。
    expect(router.ledger.inFlight(dPlan.item!.endpoint.endpointId)).toBe(1);

    // 账本上只剩直连那条。
    const leases = router.ledger.detail();
    expect(leases).toHaveLength(1);
    expect(leases[0]!.direct).toBe(true);
  });

  it("抢占后受害方收尾不污染端点健康", () => {
    const router = makeRouter();
    const logical = chain([{ model: "m0" }]);
    const direct = chain([{ model: "m0", direct: true }]);

    const lPlan = router.plan({ chain: logical, sessionId: "l1" });
    const lLease = router.commit(lPlan.item, {
      sessionId: "l1",
      onPreempt: () => {},
    });

    const dPlan = router.plan({ chain: direct, sessionId: "d1" });
    router.commit(dPlan.item, { sessionId: "d1" });

    // 受害方被抢占后收尾:按抢占口径走(不记失败、不冷却)。
    router.finish(lPlan.item, {
      leaseId: lLease,
      sessionId: "l1",
      ok: false,
      preempted: true,
    });

    // 端点健康账本干净 —— 被抢占的请求没做错任何事。
    const health = router.health.snapshot();
    expect(health.cooling).toBe(0);
    expect(health.items["probe/m0@probe/u0"]?.fails ?? 0).toBe(0);
  });
});
