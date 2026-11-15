/**
 * `setChannelModel` 的**声明字段提交契约**回归。
 *
 * 背景(2026-11-15 用户实测「保存了但库里没有相关数据」):界面上「上下文窗口 /
 * 最大输出」两格是空的(目录缓存为空时不会回填值),用户点保存时 UI 提交
 * `context_window: null`,而后端把 `null` 解释成「**明确不声明**」= 清空,
 * 于是已经存在的窗口/输出上限被写成 NULL。
 *
 * 修法是 UI 侧:没被用户碰过的格子提交 `undefined`。因此这条契约必须被钉死,
 * 否则后人改回「空框就提交 null」又会静默冲掉数据。
 *
 * 三态:
 * - `undefined` = 没给 → **保留库里原值**(刷新/保存不该覆盖手填的值);
 * - `null`      = 明确不给 → 写 NULL(清空);
 * - 数字        = 写该值。
 */
import { describe, expect, it, vi } from "vitest";
import { createChannelsMethods } from "./channels-methods.js";
import type { ChannelsMethodsDeps } from "./channels-methods.js";
import type { PanelContext } from "./context.js";

/** 内存版 real_model(与 `core/db/database.ts` 的 facade 同接口)。 */
function makeRealModelDb(
  initial: Array<[string, string, Record<string, unknown>]> = [],
): {
  db: PanelContext["db"];
  rows: Map<string, Record<string, unknown>>;
  /** setting.set 的写入记录(验 qoder 勾选偏好兼容层用)。 */
  writes: Map<string, string>;
} {
  const rows = new Map<string, Record<string, unknown>>();
  const writes = new Map<string, string>();
  const key = (p: string, m: string) => `${p}/${m}`;
  for (const [provider, model, fields] of initial) {
    rows.set(key(provider, model), { provider, model, ...fields });
  }
  const db = {
    setting: {
      get: (k: string) => (writes.has(k) ? { v: writes.get(k) } : undefined),
      set: (k: string, v: string) => {
        writes.set(k, v);
      },
    },
    realModel: {
      get: (p: string, m: string) => rows.get(key(p, m)),
      set: (row: Record<string, unknown>) => {
        rows.set(key(String(row.provider), String(row.model)), row);
      },
      update: (row: Record<string, unknown>) => {
        const k = key(String(row.provider), String(row.model));
        rows.set(k, { ...(rows.get(k) ?? {}), ...row });
      },
      delete: (p: string, m: string) => rows.delete(key(p, m)),
      listByProvider: (p: string) => [...rows.values()].filter((r) => r.provider === p),
    },
  };
  return { db: db as unknown as PanelContext["db"], rows, writes };
}

/** 只给 setChannelModel 用到的三个依赖点。 */
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
    chAwaitCatalog: vi.fn(async () => ({ entries: [], source: "api", warnings: [] })),
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

/** 库里已登记、窗口已知的一行(模拟目录同步已经补过的 workbuddy 行)。 */
function seeded(rows: Map<string, Record<string, unknown>>): void {
  rows.set("workbuddy/glm-5.3-flash", {
    provider: "workbuddy",
    model: "glm-5.3-flash",
    name: "GLM-5.3-Flash",
    supports_vision: 0,
    max_input_tokens: 1_000_000,
    max_output_tokens: 131_072,
    hidden: 0,
    concurrency: 2,
    supported_reasoning_efforts: null,
    reasoning_allows_off: null,
  });
}

function setup(initial: Array<[string, string, Record<string, unknown>]> = []) {
  const { db, rows, writes } = makeRealModelDb(initial);
  seeded(rows);
  const syncRegistry = vi.fn();
  const ctx = {
    db,
    registry: { getProvider: () => undefined },
    scheduler: { invalidate: vi.fn() },
    syncRegistry,
  } as unknown as PanelContext;
  const methods = createChannelsMethods(ctx, makeDeps());
  return { methods, rows, writes, syncRegistry };
}

const MODEL = "workbuddy/glm-5.3-flash";

/**
 * Qoder 独立页移除后(2026-11-15),勾选真源统一为 `real_model` 表;但旧 RPC
 * `qoderSetModelEnabled` 仍按 `qoder.models` 偏好重建行(供 Agent 脚本用)。
 * 这里钉住「通用保存必须把偏好对齐成表里的事实」,否则两套真源会互相回滚。
 */
describe("setChannelModel:qoder 勾选偏好兼容层", () => {
  it("勾选 / 取消都把 qoder.models 对齐成 real_model 的事实", async () => {
    const { methods, rows, writes } = setup();
    const patch = {
      id: "qoder/qfmodel",
      name: "Qwen3.8-Flash",
      vision: false,
      context_window: undefined,
      max_output: undefined,
      exposed: true,
    };
    expect((await methods.setChannelModel("qoder", patch)).ok).toBe(true);
    expect(rows.has("qoder/qfmodel")).toBe(true);
    expect(JSON.parse(writes.get("qoder.models")!).selected.qoder).toContain("qfmodel");

    await methods.setChannelModel("qoder", { ...patch, exposed: false });
    expect(rows.has("qoder/qfmodel")).toBe(false);
    expect(JSON.parse(writes.get("qoder.models")!).selected.qoder).not.toContain("qfmodel");
  });

  it("非 qoder 渠道不碰 qoder.models", async () => {
    const { methods, writes } = setup();
    await methods.setChannelModel("workbuddy", {
      id: MODEL,
      name: "GLM-5.3-Flash",
      vision: false,
      context_window: undefined,
      max_output: undefined,
      exposed: true,
    });
    expect(writes.has("qoder.models")).toBe(false);
  });
});

describe("setChannelModel:上下文窗口/输出上限的提交契约", () => {
  it("`undefined` = 保留库里原值(UI 靠这个做「没动过的格子不提交」)", async () => {
    const { methods, rows } = setup();
    // UI 没碰这两格时提交 undefined
    const r = await methods.setChannelModel("workbuddy", {
      id: MODEL,
      name: "GLM-5.3-Flash",
      vision: false,
      context_window: undefined,
      max_output: undefined,
      exposed: true,
    });
    expect(r.ok).toBe(true);
    const row = rows.get("workbuddy/glm-5.3-flash")!;
    expect(row.max_input_tokens).toBe(1_000_000);
    expect(row.max_output_tokens).toBe(131_072);
  });

  it("`null` = 明确不声明 → 写 NULL(清空)", async () => {
    const { methods, rows } = setup();
    const r = await methods.setChannelModel("workbuddy", {
      id: MODEL,
      name: "GLM-5.3-Flash",
      vision: false,
      context_window: null,
      max_output: null,
      exposed: true,
    });
    expect(r.ok).toBe(true);
    const row = rows.get("workbuddy/glm-5.3-flash")!;
    expect(row.max_input_tokens).toBeNull();
    expect(row.max_output_tokens).toBeNull();
  });

  it("数字 = 写该值", async () => {
    const { methods, rows } = setup();
    const r = await methods.setChannelModel("workbuddy", {
      id: MODEL,
      name: "GLM-5.3-Flash",
      vision: false,
      context_window: 512_000,
      max_output: 64_000,
      exposed: true,
    });
    expect(r.ok).toBe(true);
    const row = rows.get("workbuddy/glm-5.3-flash")!;
    expect(row.max_input_tokens).toBe(512_000);
    expect(row.max_output_tokens).toBe(64_000);
  });

  it("混用:只给一个字段,另一个保留", async () => {
    const { methods, rows } = setup();
    await methods.setChannelModel("workbuddy", {
      id: MODEL,
      name: "GLM-5.3-Flash",
      vision: false,
      context_window: 256_000,
      max_output: undefined,
      exposed: true,
    });
    const row = rows.get("workbuddy/glm-5.3-flash")!;
    expect(row.max_input_tokens).toBe(256_000);
    expect(row.max_output_tokens).toBe(131_072);
  });

  it("保存后会同步注册表(否则选择器/网关仍按旧窗口读)", async () => {
    const { methods, syncRegistry } = setup();
    await methods.setChannelModel("workbuddy", {
      id: MODEL,
      name: "GLM-5.3-Flash",
      vision: false,
      context_window: 1_000_000,
      max_output: undefined,
      exposed: true,
    });
    expect(syncRegistry).toHaveBeenCalled();
  });
});
