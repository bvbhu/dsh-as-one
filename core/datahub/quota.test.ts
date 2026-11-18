import { describe, it, expect, beforeEach } from "vitest";
import { QuotaHub, quotaRollupOf } from "./quota.js";
import type { QuotaSnapshot } from "../collector/quota.js";

function snap(over: Partial<QuotaSnapshot> & { credentialKey: string }): QuotaSnapshot {
  return {
    remaining: null,
    limit: null,
    expires_at: null,
    fetched_at: 1000,
    packs: [],
    error: null,
    ...over,
  };
}

describe("quotaRollupOf", () => {
  it("到期取最早、积分取总和、error 快照照样参与", () => {
    const map = quotaRollupOf([
      snap({ credentialKey: "trae/a", remaining: 100, expires_at: 2000, error: "429" }),
      snap({ credentialKey: "trae/b", remaining: 50, expires_at: 1500 }),
      snap({ credentialKey: "trae/c", remaining: null, expires_at: null }),
    ]);
    const r = map.get("trae")!;
    expect(r.accounts).toBe(3);
    expect(r.remaining).toBe(150); // 100 + 50，null 不累加
    expect(r.expires_at).toBe(1500); // 最早
    expect(r.fetched_at).toBe(1000);
  });

  it("全是 null 时 remaining/expires_at 保持 null（不谎报 0）", () => {
    const r = quotaRollupOf([snap({ credentialKey: "qoder/a" })]).get("qoder")!;
    expect(r.remaining).toBeNull();
    expect(r.expires_at).toBeNull();
  });
});

describe("QuotaHub", () => {
  let hub: QuotaHub;
  beforeEach(() => {
    hub = new QuotaHub();
  });

  it("table(): 逐账号行 + provider 聚合行", () => {
    hub.set("trae/a", {
      fetchedAtMs: 1000,
      snapshot: snap({ credentialKey: "trae/a", remaining: 100, expires_at: 2000 }),
    });
    hub.set("trae/b", {
      fetchedAtMs: 1000,
      snapshot: snap({ credentialKey: "trae/b", remaining: 50, expires_at: 1500 }),
    });
    const t = hub.table();
    expect(t["trae/a"]?.expires_at).toBe(2000);
    expect(t["trae"]?.expires_at).toBe(1500); // 聚合取最早
    expect(t["trae"]?.remaining).toBe(150);
  });

  it("table(): sensenova 比例只补 w5/w7，不伪造 remaining/limit", () => {
    hub.setPoolRatios("u1", { w5: 0.5, w7: null });
    const t = hub.table();
    expect(t["sensenova/u1"]).toEqual({ w5_ratio: 0.5 });
    expect(t["sensenova/u1"]?.remaining).toBeUndefined();
  });

  it("table(): sensenova 比例与已有快照合并，不覆盖 remaining", () => {
    hub.set("sensenova/u1", {
      fetchedAtMs: 1000,
      snapshot: snap({ credentialKey: "sensenova/u1", remaining: 7, expires_at: 3000 }),
    });
    hub.setPoolRatios("u1", { w5: 0.5, w7: 0.25 });
    const t = hub.table();
    expect(t["sensenova/u1"]?.remaining).toBe(7);
    expect(t["sensenova/u1"]?.w5_ratio).toBe(0.5);
    expect(t["sensenova/u1"]?.w7_ratio).toBe(0.25);
  });

  it("snapshotsForFreshness / summary 读的是同一份存储", () => {
    hub.set("workbuddy/a", {
      fetchedAtMs: 1000,
      snapshot: snap({ credentialKey: "workbuddy/a", expires_at: 2000 }),
    });
    const fresh = hub.snapshotsForFreshness();
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.expires_at).toBe(2000);
    expect(hub.summary(5000)).toEqual({ total: 1, withExpiry: 1, newestAgeMs: 4000 });
  });

  it("delete / clear 清理所有状态（含 sensenova 比例）", () => {
    hub.set("a/b", { fetchedAtMs: 1, snapshot: snap({ credentialKey: "a/b" }) });
    hub.setPoolRatios("u", { w5: 1, w7: 1 });
    expect(hub.delete("a/b")).toBe(true);
    hub.clear();
    expect(hub.poolRatios().size).toBe(0);
    expect(hub.size).toBe(0);
  });
});
