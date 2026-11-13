/**
 * 刷新语义拆分回归(用户 2026-11-07 定案:「拆分原来合并的刷新语义……签到仍然是手动」)。
 *
 * 用 spy 把三段**互不越界**锁死:
 *   - `syncChannelQuota` / `syncAllQuota` 绝不能调 `chAwaitCatalog`/`checkinAccountsOf`;
 *   - `syncChannelCatalog` 绝不能调 `chAwaitQuota`/`checkinAccountsOf`;
 *   - `syncChannel`(兼容壳)仍三段全跑,`missing`/`catalog`/`checkin` 组装口径不变。
 * 否则后人很容易「顺手」在某个新方法里又把签到/目录塞回来。
 */
import { describe, expect, it, vi } from "vitest";
import type { CatalogEntry, CatalogResult } from "@as-one/core/src/collector/catalog.js";
import type { QuotaSnapshot } from "@as-one/core/src/collector/quota.js";
import type { Credential } from "@as-one/core/src/config/types.js";
import { createChannelsMethods } from "./channels-methods.js";
import type { ChannelsMethodsDeps } from "./channels-methods.js";
import { CH_CATALOG_PROVIDERS, CH_QUOTA_PROVIDERS } from "./constants.js";
import type { PanelContext } from "./context.js";

/** 一条能让目录段 / 额度段都走通的假账号(字段不完整,测试只关心 username)。 */
function fakeAccount(username: string) {
  return { index: 0, cred: { username } as unknown as Credential };
}

/** 一份「剩余 123」的额度快照。 */
const quotaSnap: QuotaSnapshot = {
  credentialKey: "trae/u1",
  remaining: 123,
  limit: 1000,
  expires_at: 1_800_000_000,
  fetched_at: 1_800_000_000,
  packs: [],
  error: null,
};

/** 一份能过目录段的上游目录结果。 */
function catalogResult(entriesCount = 1): CatalogResult {
  const entries = Array.from({ length: entriesCount }, (_, i) => ({ model: `m-${i}` }) as unknown as CatalogEntry);
  return { provider: "sensenova", entries, source: "api", fetched_at: 1_800_000_000, warnings: [] };
}

/** 造齐 27 个 closeures 的 deps;测试只关心被 spy 的那几个。 */
function makeDeps(overrides: Record<string, unknown> = {}): ChannelsMethodsDeps {
  const deps: Record<string, unknown> = {
    chQuotaCache: new Map(),
    realModelMap: vi.fn(() => new Map()),
    modelViewOf: vi.fn(() => undefined),
    stripMemberFromLogicalModels: vi.fn(() => 0),
    accountsWithKey: vi.fn(async () => []),
    autoAdoptTrae: vi.fn(async () => ""),
    catalogCooldownStateOf: vi.fn(() => ({})),
    catalogFetchedAt: new Map(),
    catalogRows: new Map(),
    chAwaitCatalog: vi.fn(async () => catalogResult()),
    chAwaitQuota: vi.fn(async () => null),
    chCreditsOf: vi.fn(() => ({})),
    chMaybeFetchQuota: vi.fn(() => undefined),
    channelAccountsOf: vi.fn(async () => []),
    checkinAccountsOf: vi.fn(async () => []),
    checkinBaseOf: vi.fn(() => null),
    checkinClaimOne: vi.fn(async () => ({})),
    doRefreshRun: vi.fn(async () => ({})),
    getClientPathsImpl: vi.fn(async () => ({})),
    mergeCatalog: vi.fn(() => 0),
    mergedChannelModels: vi.fn(() => []),
    modelsSourceOf: vi.fn(() => ""),
    probeClientPath: vi.fn(async () => ({})),
    probeProviderModels: vi.fn(async () => ({})),
    rawStrOf: vi.fn(() => null),
    refreshAccountsOf: vi.fn(async () => []),
    refreshInFlight: new Map(),
    refreshLedger: new Map(),
    refreshRowBase: vi.fn(() => ({})),
    safeExists: vi.fn(() => false),
    serializeReasoningEfforts: vi.fn(() => null),
  };
  return Object.assign(deps, overrides) as unknown as ChannelsMethodsDeps;
}

/** 只给同步三段用到的 `registry.getProvider`(protocol 直接当 provider 名)。 */
function makeCtx(): PanelContext {
  return {
    registry: {
      getProvider: (pid: string) => ({ provider: pid, protocol: pid, baseUrl: null }),
    },
  } as unknown as PanelContext;
}

describe("syncChannelQuota:打开页/点刷新只刷额度", () => {
  it("chAwaitQuota 真探针,且绝不碰目录/签到", async () => {
    const chAwaitQuota = vi.fn(async () => quotaSnap);
    const chAwaitCatalog = vi.fn(async () => catalogResult());
    const checkinAccountsOf = vi.fn(async () => []);
    const refreshAccountsOf = vi.fn(async () => [fakeAccount("u1")]);
    const methods = createChannelsMethods(
      makeCtx(),
      makeDeps({ chAwaitQuota, chAwaitCatalog, checkinAccountsOf, refreshAccountsOf }),
    );

    const r = await methods.syncChannelQuota("trae");

    expect(refreshAccountsOf).toHaveBeenCalledWith("trae");
    expect(chAwaitQuota).toHaveBeenCalledWith("trae", "u1", true);
    expect(chAwaitCatalog).not.toHaveBeenCalled();
    expect(checkinAccountsOf).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.errors).toMatchObject({});
    expect(r.quota).toMatchObject({ status: "ok" });
  });

  it("额度打不到 → ok=false 且逐账号记 errors", async () => {
    const chAwaitQuota = vi.fn(async () => ({ ...quotaSnap, remaining: null, error: "401" }));
    const methods = createChannelsMethods(
      makeCtx(),
      makeDeps({ chAwaitQuota, refreshAccountsOf: vi.fn(async () => [fakeAccount("u1")]) }),
    );

    const r = await methods.syncChannelQuota("trae");

    expect(r.ok).toBe(false);
    expect(r.errors).toMatchObject({ "trae/u1": "401" });
    expect(r.quota).toMatchObject({ status: "partial" });
  });
});

describe("syncChannelCatalog:展开卡片才拉目录", () => {
  it("调 chAwaitCatalog + mergeCatalog,绝不碰额度/签到", async () => {
    const chAwaitCatalog = vi.fn(async () => catalogResult(5));
    const mergeCatalog = vi.fn(() => 5);
    const chAwaitQuota = vi.fn(async () => quotaSnap);
    const checkinAccountsOf = vi.fn(async () => []);
    const refreshAccountsOf = vi.fn(async () => [fakeAccount("u1")]);
    const methods = createChannelsMethods(
      makeCtx(),
      makeDeps({ chAwaitCatalog, mergeCatalog, chAwaitQuota, checkinAccountsOf, refreshAccountsOf }),
    );

    const r = await methods.syncChannelCatalog("sensenova");

    expect(CH_CATALOG_PROVIDERS.has("sensenova")).toBe(true);
    expect(chAwaitCatalog).toHaveBeenCalledWith("sensenova", "u1", true);
    expect(mergeCatalog).toHaveBeenCalledTimes(1);
    expect(chAwaitQuota).not.toHaveBeenCalled();
    expect(checkinAccountsOf).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.written).toBe(1);
    expect(r.count).toBe(5);
  });

  it("minimax 的内置模型目录也走采集合并,不再被判无目录能力(2026-11-08)", async () => {
    const chAwaitCatalog = vi.fn(async () => catalogResult());
    const mergeCatalog = vi.fn(() => 6);
    const chAwaitQuota = vi.fn(async () => quotaSnap);
    const checkinAccountsOf = vi.fn(async () => []);
    const refreshAccountsOf = vi.fn(async () => [fakeAccount("u1")]);
    const methods = createChannelsMethods(
      makeCtx(),
      makeDeps({ chAwaitCatalog, mergeCatalog, chAwaitQuota, checkinAccountsOf, refreshAccountsOf }),
    );

    const r = await methods.syncChannelCatalog("minimax");

    expect(CH_CATALOG_PROVIDERS.has("minimax")).toBe(true);
    expect(chAwaitCatalog).toHaveBeenCalledWith("minimax", "u1", true);
    expect(mergeCatalog).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
    // 额度/签到仍不参与目录段。
    expect(chAwaitQuota).not.toHaveBeenCalled();
    expect(checkinAccountsOf).not.toHaveBeenCalled();
  });

});

describe("syncAllQuota:打开渠道页则对每个额度渠道各刷一次", () => {
  it("三段互不越界:只跑额度段,绝不拉目录/签到", async () => {
    const chAwaitCatalog = vi.fn(async () => catalogResult());
    const chAwaitQuota = vi.fn(async (pid: string) => ({ ...quotaSnap, credentialKey: `${pid}/u` }));
    const checkinAccountsOf = vi.fn(async () => []);
    const refreshAccountsOf = vi.fn(async (pid: string) => [fakeAccount(`${pid}-u`)]);
    const methods = createChannelsMethods(
      makeCtx(),
      makeDeps({ chAwaitCatalog, chAwaitQuota, checkinAccountsOf, refreshAccountsOf }),
    );

    const r = await methods.syncAllQuota();

    expect(r.count).toBe(CH_QUOTA_PROVIDERS.size);
    expect(r.channels).toHaveLength(CH_QUOTA_PROVIDERS.size);
    expect(r.probed).toBe(CH_QUOTA_PROVIDERS.size);
    expect(r.written).toBe(CH_QUOTA_PROVIDERS.size);
    for (const pid of CH_QUOTA_PROVIDERS) {
      expect(chAwaitQuota).toHaveBeenCalledWith(pid, `${pid}-u`, true);
    }
    expect(chAwaitCatalog).not.toHaveBeenCalled();
    expect(checkinAccountsOf).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });
});

describe("syncChannel:兼容壳仍三段全跑", () => {
  it("sensenova:目录能拉、额度缺项、无签到能力 → missing 组装不变", async () => {
    const chAwaitCatalog = vi.fn(async () => catalogResult(5));
    const mergeCatalog = vi.fn(() => 5);
    const refreshAccountsOf = vi.fn(async () => [fakeAccount("u1")]);
    const methods = createChannelsMethods(
      makeCtx(),
      makeDeps({ chAwaitCatalog, mergeCatalog, refreshAccountsOf }),
    );

    const r = await methods.syncChannel("sensenova");

    expect(chAwaitCatalog).toHaveBeenCalledTimes(1);
    expect(r.missing).toEqual(["quota", "checkin"]);
    expect(r.catalog).toMatchObject({ status: "ok", count: 5, source: "api" });
    expect(r.checkin).toMatchObject({ supported: false });
    expect(r.quota).toMatchObject({ status: "missing" });
  });
});
