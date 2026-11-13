/**
 * sensenova「刷新」的**回执纪律** —— 用户报「刷新后页面还显示未刷新」的那条。
 *
 * 背景:`refresh.result` 是宿主进程内存里的一份回执,页面读它当刷新结论。只要
 * 有一条出口**没写账**(抛错 / 账号池读不出来),页面就看到陈旧值或空白,读起来
 * 就是「刷了等于没刷」。这组用例盯的就是「每条出口都必须留下回执,且绝不把异常
 * 冒到路由」。
 *
 * 用空账号池 / 无令牌账号来走这些路径,全程**不打上游**(没有网络、没有登录)。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";

import { openDatabase, type NexusDatabase } from "@as-one/core/src/db/database.js";
import type { PanelContext } from "./context.js";
import type { ApiResult, SensenovaStatus } from "./types.js";
import { createSensenovaDomain } from "./sensenova.js";
import type { SensenovaDomainDeps } from "./sensenova.js";

let db: NexusDatabase;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

type FakeCred = { username: string; secret?: string | null };

/** 只装 sensenova 域真正会碰到的字段 —— 其余用不到,故整体 as PanelContext。 */
function makeCtx(creds: FakeCred[], opts: { providerThrows?: boolean } = {}): PanelContext {
  const stored = new Map(creds.map((c) => [c.username, c]));
  /** 只让**第一次**取 provider 炸,后面正常 —— 否则断言阶段读 status 也会炸。 */
  let providerCalls = 0;
  return {
    db,
    registry: {
      getProvider: () => {
        providerCalls += 1;
        if (opts.providerThrows === true && providerCalls === 1) throw new Error("注册表投影损坏");
        return null;
      },
      listAccounts: () => [],
    },
    vault: {
      list: async () => creds.map((c) => ({ provider: "sensenova", username: c.username })),
      get: async (_p: string, u: string) => {
        const c = stored.get(u);
        return c === undefined ? null : { provider: "sensenova", username: u, secret: c.secret ?? null, raw: {} };
      },
      secret: async (_p: string, u: string) => stored.get(u)?.secret ?? null,
    },
    scheduler: {},
    router: {},
    ledger: { detail: () => [] },
    health: { get: () => ({ cooldownUntil: 0, lastError: null, lastKind: null, updatedAt: 0 }) },
    keyProvider: {},
    gatewayState: { gateway: null, error: null },
    gatewayHost: "127.0.0.1",
    restartGateway: async () => "",
    startedAtMs: Date.now(),
    accountOverlay: new Map<string, boolean>(),
    dataDir: tmpdir(),
    dbPath: ":memory:",
    secretPresence: () => false,
    syncRegistry: () => {},
  } as unknown as PanelContext;
}

function makeDeps(): SensenovaDomainDeps {
  return {
    lastStatsDay: () => null,
    realModelMap: () => new Map(),
    modelViewOf: () => ({}),
    mergedChannelModels: () => [],
    chCatalogCache: new Map(),
    chCatalogGate: new Map(),
    chAwaitCatalog: async () => ({ entries: [], warnings: [] }),
    mergeCatalog: () => 0,
    syncSensenovaPool: async () => {},
  } as unknown as SensenovaDomainDeps;
}

/** `refresh` 在契约里可空(`status.refresh` 可能还没建);测试里断言先钉住它。 */
function refreshOf(status: SensenovaStatus): NonNullable<SensenovaStatus["refresh"]> {
  expect(status.refresh).not.toBeNull();
  return status.refresh as NonNullable<SensenovaStatus["refresh"]>;
}

/** `ApiResult` 是开放形状(`[k: string]: unknown`),这里按刷新回执的实际字段读。 */
function accountsOf(r: ApiResult): { username: string; status: string }[] {
  return (r["accounts"] ?? []) as { username: string; status: string }[];
}

describe("sensenova 刷新:每条出口都要留回执", () => {
  it("账号池为空:返回失败并写账,页面不会停在「没有回执」", async () => {
    const domain = createSensenovaDomain(makeCtx([]), makeDeps());
    const r = await domain.methods.sensenovaRefresh(true);

    expect(r.ok).toBe(false);
    expect(r.message).toContain("没有账号");

    const refresh = refreshOf(await domain.methods.getSensenovaStatus());
    expect(refresh.result).toBe(`失败:${r.message}`);
    expect(refresh.last_ok).toBe(false);
    // 开始时刻仍要写上:进行中/刚结束的一瞬间,页面用它算「已用 Ns」。
    expect(refresh.started_at_ms).toBeGreaterThan(0);
  });

  it("中途抛错(取不到 provider):当成一条失败回执返回,不把异常丢给路由", async () => {
    const domain = createSensenovaDomain(
      makeCtx([{ username: "u1", secret: "sk-test" }], { providerThrows: true }),
      makeDeps(),
    );

    // 关键:不 reject。抛出去会变成 HTTP 500,页面只能显示「请求失败」。
    const r = await domain.methods.sensenovaRefresh(true);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("刷新中断");

    const refresh = refreshOf(await domain.methods.getSensenovaStatus());
    expect(refresh.result).toContain("失败");
    expect(refresh.result).toContain("刷新中断");
    // 逐账号结果也要有(一个账号一行,状态 failed),否则页面那张表会空着。
    expect(refresh.last_run_accounts?.length).toBe(0);
  });

  it("没有控制台令牌的账号:如实说「查不了积分池」,照样落账(不打上游)", async () => {
    const domain = createSensenovaDomain(makeCtx([{ username: "u2", secret: "sk-test" }]), makeDeps());
    const r = await domain.methods.sensenovaRefresh(true);

    const refresh = refreshOf(await domain.methods.getSensenovaStatus());
    expect(refresh.result).not.toBeNull();
    expect(refresh.result).toContain("积分池:未拉到");
    expect(refresh.last_ok).toBe(false);
    // 账号行仍然要产出 —— 「未拉到」也要能看出是哪个账号、为什么。
    const rows = accountsOf(r);
    expect(rows.map((a) => a.username)).toEqual(["u2"]);
    expect(rows[0]?.status).toBe("failed");
  });

  it("未刷新过时 result 是 null,而不是一句「尚未执行过登录或刷新」", async () => {
    const domain = createSensenovaDomain(makeCtx([]), makeDeps());
    const refresh = refreshOf(await domain.methods.getSensenovaStatus());
    expect(refresh.result).toBeNull();
  });
});
