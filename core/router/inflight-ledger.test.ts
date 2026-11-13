/**
 * InflightLedger 移植测试 — 对应 `tests/test_v4_semantics.py` §1 / §9 / §11。
 *
 * 覆盖点(与实现注释逐条对齐):
 * | 语义 | 本文件的用例 |
 * |---|---|
 * | 并发账本**按凭据(端点)计**,展示按真实模型聚合 | `test_inflight_counts_per_credential` |
 * | 租约带**句柄**精确释放 | `test_lease_handle_releases_exactly_one` |
 * | 保留区容量上限 + 过期租约归档 | `test_recent_zone_is_capped_and_expired_leases_are_archived` |
 * | 已结束请求**没有时间窗** | `test_completed_requests_are_retained_without_a_time_window` |
 *
 * ⚠️ 2026-11-08 用户改口:并发是**每个凭据**的(并发=1 + 3 凭据 = 3 并发),
 * 旧 D12「多凭据共用一个真实模型桶」的断言已按新语义改写。
 */

import { describe, expect, it } from "vitest";
import { InflightLedger } from "./inflight-ledger.js";
import { mutableClock, type MutableClock } from "./clock.js";
import { LEASE_EXPIRED_ERROR } from "./inflight-ledger.js";

/** 一个真实模型键(`"provider/model"`)。 */
const KEY = "sensenova/deepseek-v4-flash";

/** 三个凭据端点(容量键 = 端点 id)。 */
const EP1 = "sensenova/deepseek-v4-flash@sensenova/u1";
const EP2 = "sensenova/deepseek-v4-flash@sensenova/u2";
const EP3 = "sensenova/deepseek-v4-flash@sensenova/u3";

/** 一条最简收尾数据(只给有值字段,验证保留区字段形状)。 */
function outcome(opts: { ok?: boolean; status?: number } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    error: "",
    latencyMs: 1234,
    ttftMs: 200,
    promptTokens: 10,
    completionTokens: 20,
    cachedTokens: 0,
  };
}

describe("InflightLedger 容量核算(2026-11-08:按凭据/端点计)", () => {
  it("多枚凭据各占一个槽:in_flight 按端点算,snapshot 仍按真实模型聚合", () => {
    const ledger = new InflightLedger({ leaseSeconds: 600, clock: mutableClock() });
    expect(ledger.inFlight(EP1)).toBe(0);
    ledger.acquire(KEY, { endpointId: EP1 });
    expect(ledger.inFlight(EP1)).toBe(1);
    // ⚠️ 另一个凭据**不**被这台占用影响 —— 这就是「三凭据 = 三并发」。
    expect(ledger.inFlight(EP2)).toBe(0);
    expect(ledger.hasRoom(EP2, 1)).toBe(true);
    ledger.acquire(KEY, { endpointId: EP2 });
    ledger.acquire(KEY, { endpointId: EP3 });
    expect(ledger.inFlight(EP3)).toBe(1);
    // 展示口径没变:三条在途都属于同一个真实模型。
    expect(ledger.snapshot()).toEqual({ [KEY]: 3 });
    expect(ledger.total()).toBe(3);
  });

  it("同一凭据上 concurrency=1 只有一个槽:占住后 hasRoom=false", () => {
    const ledger = new InflightLedger({ leaseSeconds: 600, clock: mutableClock() });
    expect(ledger.hasRoom(EP1, 1)).toBe(true);
    ledger.acquire(KEY, { endpointId: EP1 });
    expect(ledger.hasRoom(EP1, 1)).toBe(false);
    // 别的凭据仍是空的。
    expect(ledger.hasRoom(EP2, 1)).toBe(true);
  });

  it("不同真实模型各自独立计数,互不影响", () => {
    const ledger = new InflightLedger({ leaseSeconds: 600, clock: mutableClock() });
    const other = "workbuddy/hy4-preview";
    ledger.acquire(KEY, {});
    ledger.acquire(other, {});
    expect(ledger.inFlight(KEY)).toBe(1);
    expect(ledger.inFlight(other)).toBe(1);
  });

  it("has_room 按 concurrency 判定,且把上限夹到 >= 1", () => {
    const ledger = new InflightLedger({ leaseSeconds: 600, clock: mutableClock() });
    // concurrency=1 的桶,占一条就满了。
    expect(ledger.hasRoom(KEY, 1)).toBe(true);
    ledger.acquire(KEY, {});
    expect(ledger.hasRoom(KEY, 1)).toBe(false);
    // concurrency 缺失 / 非数字 / <=0 一律夹到 1,即「永远没空位」。
    expect(ledger.hasRoom(KEY, 0)).toBe(false);
    expect(ledger.hasRoom(KEY, 2)).toBe(true);
  });

  it("inFlight / has_room 会把过期租约先清掉再数", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({ leaseSeconds: 600, clock });
    const id = ledger.acquire(KEY, { now: clock.now });
    clock.advance(601); // 跑满租期
    expect(ledger.inFlight(KEY)).toBe(0);
    expect(ledger.hasRoom(KEY, 1)).toBe(true);
    // 过期租约被清掉后,句柄不再有效。
    expect(ledger.touch(id)).toBe(false);
  });
});

describe("InflightLedger 租约生命周期", () => {
  it("acquire 返回的句柄精确释放那一条,不碰同桶其他租约", () => {
    const ledger = new InflightLedger({ leaseSeconds: 600, clock: mutableClock() });
    // 同一个**凭据**连续三条(同一个桶),验证句柄精确性。
    const a = ledger.acquire(KEY, { endpointId: EP1 });
    const b = ledger.acquire(KEY, { endpointId: EP1 });
    const c = ledger.acquire(KEY, { endpointId: EP1 });
    expect(ledger.inFlight(EP1)).toBe(3);
    expect(ledger.release(a)).toBe(true);
    expect(ledger.inFlight(EP1)).toBe(2);
    expect(ledger.release(b)).toBe(true);
    expect(ledger.release(c)).toBe(true);
    expect(ledger.inFlight(EP1)).toBe(0);
    // 重复释放是幂等的 false,不会把计数打成负数。
    expect(ledger.release(a)).toBe(false);
    expect(ledger.release(b)).toBe(false);
    expect(ledger.release(c)).toBe(false);
  });

  it("空句柄 / 不存在的句柄释放返回 false", () => {
    const ledger = new InflightLedger({ leaseSeconds: 600, clock: mutableClock() });
    expect(ledger.release("")).toBe(false);
    expect(ledger.release("999")).toBe(false);
    expect(ledger.inFlight(KEY)).toBe(0);
  });

  it("release 兼容退回真实模型 id:丢该桶最旧的一条", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({ leaseSeconds: 600, clock });
    const a = ledger.acquire(KEY, { now: clock.now });
    clock.advance(1);
    const b = ledger.acquire(KEY, { now: clock.now });
    clock.advance(1);
    const c = ledger.acquire(KEY, { now: clock.now });
    // 退路行为:不传句柄 → 丢最旧的那条(a),计数从 3 降到 2。
    expect(ledger.release(KEY)).toBe(true);
    expect(ledger.inFlight(KEY)).toBe(2);
    // 退路丢的是最旧的;a 的句柄此时已失效。
    expect(ledger.release(a)).toBe(false);
    // b / c 仍在。
    expect(ledger.release(b)).toBe(true);
    expect(ledger.release(c)).toBe(true);
  });

  it("touch 续期让长流在跑满租期后仍留在在途", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({ leaseSeconds: 600, clock });
    const id = ledger.acquire(KEY, { now: clock.now }); // 1000 起,1600 到期
    clock.advance(400); // 1400
    expect(ledger.touch(id)).toBe(true); // 续期到 2000
    clock.advance(401); // 1801,原到期日 1600 已过,但续期后有效
    expect(ledger.inFlight(KEY)).toBe(1);
    clock.advance(201); // 2002,超过续期后的 2000
    expect(ledger.inFlight(KEY)).toBe(0);
    expect(ledger.touch(id)).toBe(false);
  });

  it("acquire 的 seq 单调递增,leaseId 是它的字符串形式", () => {
    const ledger = new InflightLedger({ leaseSeconds: 600, clock: mutableClock() });
    const ids = [
      ledger.acquire(KEY, {}),
      ledger.acquire(KEY, {}),
      ledger.acquire(KEY, {}),
    ];
    expect(ids[0]).toBe("1");
    expect(ids[1]).toBe("2");
    expect(ids[2]).toBe("3");
    const rows = ledger.detail();
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
  });
});

describe("InflightLedger 会话序号(convNo)", () => {
  it("同一 session 同号;按首次出现递增;无 session 不编号", () => {
    const ledger = new InflightLedger({ leaseSeconds: 600, clock: mutableClock() });
    ledger.acquire(KEY, { sessionId: "sess-A" });
    ledger.acquire(KEY, { sessionId: "sess-B" });
    ledger.acquire(KEY, { sessionId: "sess-A" });
    ledger.acquire(KEY, {}); // 无 session → 0
    const rows = ledger.detail();
    const byId = new Map(rows.map((r) => [r.sessionId, r.convNo]));
    expect(byId.get("sess-A")).toBe(1);
    expect(byId.get("sess-B")).toBe(2);
    expect(byId.get("")).toBe(0); // 无 id 请求不共用伪会话号
  });
});

describe("InflightLedger 保留区", () => {
  it("release 带 outcome 的请求进保留区,字段原样保留", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({ leaseSeconds: 600, clock, maxRecent: 10 });
    const id = ledger.acquire(KEY, { endpointId: "sensenova/m@u1" });
    expect(ledger.release(id, { outcome: outcome({ status: 200 }), now: clock.now })).toBe(true);
    const rows = ledger.recentRows(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(true);
    expect(rows[0].status).toBe(200);
    expect(rows[0].latencyMs).toBe(1234);
    expect(rows[0].ttftMs).toBe(200);
    expect(rows[0].promptTokens).toBe(10);
    expect(rows[0].completionTokens).toBe(20);
    expect(rows[0].finishedAt).toBe(1000);
  });

  it("release 不带 outcome 的租约只释放,不进保留区(被扫掉的才进)", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({ leaseSeconds: 600, clock, maxRecent: 10 });
    const id = ledger.acquire(KEY, {});
    expect(ledger.release(id, { now: clock.now })).toBe(true);
    // 无 outcome 时不进保留区 —— 与「被租期扫掉的会进」区分开。
    expect(ledger.recentRows(10)).toHaveLength(1);
  });

  it("保留区有容量上限;被租期扫掉的租约也进保留区", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({
      leaseSeconds: 600,
      clock,
      maxRecent: 3,
    });
    // 三条租约到期前没释放,被租期扫掉 → 全进保留区(带 expired 文案)。
    ledger.acquire(KEY, { now: 1000 });
    ledger.acquire(KEY, { now: 1000 });
    ledger.acquire(KEY, { now: 1000 });
    ledger.acquire(KEY, { now: 1000 }); // 第四条触发容量裁到 3
    clock.advance(601);
    expect(ledger.inFlight(KEY)).toBe(0);
    const rows = ledger.recentRows(10);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.ok).toBe(false);
      expect(row.error).toBe(LEASE_EXPIRED_ERROR);
    }
  });

  it("容量调小会立刻裁(下次收尾重新问活来源)", () => {
    const clock = mutableClock(1000);
    let cap = 5;
    const ledger = new InflightLedger({
      leaseSeconds: 600,
      clock,
      maxRecent: 200,
      maxRecentFn: () => cap,
    });
    // 先塞 5 条(容量 5)。
    for (let i = 0; i < 5; i++) {
      const id = ledger.acquire(KEY, { now: clock.now });
      ledger.release(id, { outcome: outcome(), now: clock.now });
    }
    expect(ledger.recentRows(100)).toHaveLength(5);
    cap = 2; // 用户把 ui.recent_limit 调到 2
    // 下一次收尾触发 trimRecent,砍到 2 条。
    const id = ledger.acquire(KEY, { now: clock.now });
    ledger.release(id, { outcome: outcome(), now: clock.now });
    const rows = ledger.recentRows(100);
    expect(rows).toHaveLength(2);
  });

  it("时间过去不会清掉已结束请求(只受总条数控制)", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({ leaseSeconds: 600, clock, maxRecent: 200 });
    const id = ledger.acquire(KEY, { now: 1000 });
    ledger.release(id, { outcome: outcome(), now: 1000 });
    clock.advance(181); // 旧行为是 180s 时间窗,现在不该清
    expect(ledger.recentRows(100)).toHaveLength(1);
    clock.advance(600); // 再快进 600s,仍然留着
    expect(ledger.recentRows(100)).toHaveLength(1);
  });

  it("保留区排序以 (finishedAt, seq) 为键,新的在前", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({ leaseSeconds: 600, clock, maxRecent: 200 });
    // 同一毫秒里 finish 三条:seq 3 应排在最前。
    const a = ledger.acquire(KEY, { now: 1000 });
    const b = ledger.acquire(KEY, { now: 1000 });
    const c = ledger.acquire(KEY, { now: 1000 });
    ledger.release(a, { outcome: outcome(), now: 1000 });
    ledger.release(b, { outcome: outcome(), now: 1000 });
    ledger.release(c, { outcome: outcome(), now: 1000 });
    const rows = ledger.recentRows(100);
    expect(rows.map((r) => r.lease.seq)).toEqual([3, 2, 1]);
  });
});

describe("InflightLedger 容量活来源与观测", () => {
  it("提供函数缺失/抛错/给出 <1 时回落构造参数,绝不变成无上限", () => {
    const clock = mutableClock(1000);
    const fns: ReadonlyArray<[string, (() => number) | null]> = [
      ["missing", null],
      ["throws", () => {
        throw new Error("boom");
      }],
      ["zero", () => 0],
      ["negative", () => -3],
    ];
    for (const [name, fn] of fns) {
      const ledger = new InflightLedger({
        leaseSeconds: 600,
        clock,
        maxRecent: 7,
        maxRecentFn: fn,
      });
      expect(ledger.recentCapacity(), name).toBe(7);
    }
  });

  it("snapshot / total / detail 形状正确,且 detail 按开始时刻排序", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({ leaseSeconds: 600, clock });
    ledger.acquire(KEY, { endpointId: "sensenova/m@u1", now: 1000 });
    ledger.acquire(KEY, { endpointId: "sensenova/m@u2", now: 1001 });
    ledger.acquire("workbuddy/hy4-preview", { endpointId: "workbuddy/hy4@u1", now: 1002 });
    expect(ledger.snapshot()).toEqual({
      "sensenova/deepseek-v4-flash": 2,
      "workbuddy/hy4-preview": 1,
    });
    expect(ledger.total()).toBe(3);
    const detail = ledger.detail();
    expect(detail).toHaveLength(3);
    expect(detail[0].startedAt).toBeLessThanOrEqual(detail[1].startedAt);
  });

  it("reset 清掉租约与保留区(不给 key 就全清)", () => {
    const clock = mutableClock(1000);
    const ledger = new InflightLedger({ leaseSeconds: 600, clock, maxRecent: 200 });
    const id = ledger.acquire(KEY, { now: 1000 });
    ledger.release(id, { outcome: outcome(), now: 1000 });
    expect(ledger.inFlight(KEY)).toBe(0);
    expect(ledger.recentRows(100)).toHaveLength(1);
    // 带 key → 只清该桶(保留区不动)
    ledger.acquire(KEY, { now: 1000 });
    ledger.reset(KEY);
    expect(ledger.inFlight(KEY)).toBe(0);
    expect(ledger.recentRows(100)).toHaveLength(1);
    // 不带 key → 全清
    ledger.reset();
    expect(ledger.recentRows(100)).toHaveLength(0);
  });

  it("releaseBucket 清掉某个**容量键**(端点)的全部租约(测试/维护用)", () => {
    const ledger = new InflightLedger({ leaseSeconds: 600, clock: mutableClock() });
    // 端点键:只清这一个凭据,别的凭据不受影响。
    ledger.acquire(KEY, { endpointId: EP1 });
    ledger.acquire(KEY, { endpointId: EP1 });
    ledger.acquire(KEY, { endpointId: EP2 });
    expect(ledger.releaseBucket(EP1)).toBe(2);
    expect(ledger.inFlight(EP1)).toBe(0);
    expect(ledger.inFlight(EP2)).toBe(1);
    // 没有端点时容量键退回真实模型 id,行为同旧版。
    ledger.acquire("workbuddy/hy4-preview", {});
    // 清一个不存在的桶返回 0。
    expect(ledger.releaseBucket("missing/x")).toBe(0);
    expect(ledger.releaseBucket("workbuddy/hy4-preview")).toBe(1);
  });
});
