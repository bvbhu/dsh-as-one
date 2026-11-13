/**
 * 冷却聚合口径(2026-11-07 用户定案:「多key的情况下,所有key都错误才显示冷却」)。
 *
 * 记账是**端点**粒度(provider/model@username,见 router/types.ts 的 endpointId),
 * 调度器 plan 会把冷却端点过滤掉继续挑别的 key —— 所以「一把 key 坏了」不等于
 * 「这个模型用不了」。本测试钉住面板两处的聚合口径:
 *
 *   1. 模型总览行(`getDeployments`):所有**有密钥的**端点都冷却才 in_cooldown;
 *   2. 顶部统计(`getStatus` 的 cooldown_count):同样 all-cooling 才算。
 *
 * 边界:单 key 时退化为原行为(它冷却 = 模型冷却);从未失败的 key 无记录 = 可用。
 *
 * ⚠️ 时钟:被测代码用 `wallNow()`(真实时钟),所以冷却截止时刻必须基于
 * `Date.now()/1000` 来造,不能用一个虚构的 NOW_S —— 否则「冷却中」会被判成
 * 「早就过期了」(这个坑踩过一次)。同理,剩余秒数断言用区间而不是精确值,
 * 因为测试构造与执行之间真实时钟会走几十毫秒。
 */
import { describe, expect, it } from "vitest";

import { createModelsDomain } from "./models.js";
import { createOverviewDomain } from "./overview.js";
import type { PanelContext } from "./context.js";
import type { ModelView } from "./modelview.js";

/** 真实墙钟(秒),与被测代码的 wallNow() 同源。 */
const NOW_S = Math.floor(Date.now() / 1000);

interface EndpointSpec {
  /** 凭据用户名 */
  username: string;
  /** 是否带密钥 */
  hasKey?: boolean;
  /** 冷却剩余秒数;0 = 不在冷却 */
  cooldownS?: number;
}

function makeModelView(provider: string, model: string): ModelView {
  return {
    provider,
    model,
    name: null,
    supportsVision: false,
    hidden: false,
    concurrency: 1,
    maxInputTokens: null,
    maxOutputTokens: null,
    supportedReasoningEfforts: null,
    supportedReasoningEffortsRaw: null,
    reasoningAllowsOff: null,
  } as unknown as ModelView;
}

function ctxWith(input: {
  provider: string;
  model: string;
  endpoints: EndpointSpec[];
}): PanelContext {
  const healthMap = new Map<string, { cooldownUntil: number }>();
  for (const e of input.endpoints) {
    const id = `${input.provider}/${input.model}@${input.provider}/${e.username}`;
    healthMap.set(id, { cooldownUntil: e.cooldownS ? NOW_S + e.cooldownS : 0 });
  }
  const accounts = input.endpoints.map((e) => ({
    credentialRef: `${input.provider}/${e.username}`,
    username: e.username,
    enabled: true,
  }));
  const providerDef = {
    id: input.provider,
    baseUrl: null,
    protocol: "openai",
    envPrefix: null,
  };
  const fake = {
    registry: {
      listAccounts: () => accounts,
      getProvider: () => providerDef,
      listProviders: () => [providerDef],
      listRealModels: () => [],
      listLogicalModels: () => [],
      getLogicalModel: () => null,
    },
    health: {
      get: (id: string) => healthMap.get(id) ?? { cooldownUntil: 0, fails: 0 },
    },
    scheduler: { invalidate: () => undefined },
    syncRegistry: () => undefined,
    db: {
      realModel: { get: () => undefined, listByProvider: () => [] },
      logicalModel: { list: () => [], get: () => undefined },
      statsDaily: { range: () => [] },
      setting: { get: () => undefined },
    },
    ledger: { detail: () => [] },
    router: { pins: { get: () => null } },
    accountOverlay: new Map<string, boolean>(),
    vault: {
      list: async () => input.endpoints.map((e) => ({ username: e.username, raw: {} })),
      get: async () => ({ raw: {} }),
      secret: async () => "k",
      describe: async (provider: string, username: string) => ({
        key: `${provider}/${username}`,
        provider,
        username,
        hasSecret: true,
        hasRefreshSecret: false,
        expiresAt: null,
        fingerprint: "fp",
        raw: {},
      }),
    },
    configDir: ".",
    dbPath: ":memory:",
    secretPresence: new Map<string, boolean>(),
    startedAtMs: Date.now() - 1000,
    gatewayState: { gateway: { port: 0, close: async () => undefined }, error: null },
    gatewayHost: "127.0.0.1",
    restartGateway: async () => "n/a",
    keyProvider: { get: () => null },
  };
  return fake as unknown as PanelContext;
}

/** 真实模型视图映射(单模型)。 */
const realModelMapOf = (provider: string, model: string) => () =>
  new Map<string, ModelView>([[`${provider}/${model}`, makeModelView(provider, model)]]);

/** 直接调 getDeployments,取目标模型行。 */
async function deploymentRow(ctx: PanelContext, provider: string, model: string) {
  const dom = createModelsDomain(ctx, {
    realModelMap: realModelMapOf(provider, model),
    modelViewOf: () => undefined,
    stripMemberFromLogicalModels: () => 0,
    lastStatsDay: () => null,
    accountsWithKeySync: () =>
      ctx.registry.listAccounts(provider).map((a) => ({
        credentialRef: a.credentialRef,
        // AccountConfig 只有 credentialRef;username 从 ref 里取(与真实实现一致)
        username: a.credentialRef.slice(a.credentialRef.indexOf("/") + 1),
        hasKey: true,
        keyFp: "fp",
      })),
    accountsWithKey: async () =>
      ctx.registry.listAccounts(provider).map((a) => ({
        credentialRef: a.credentialRef,
        username: a.credentialRef.slice(a.credentialRef.indexOf("/") + 1),
        hasKey: true,
        keyFp: "fp",
      })),
    chAwaitCatalog: async () => ({
      provider,
      entries: [],
      source: "empty",
      fetched_at: 0,
      warnings: [],
    }),
  } as never);
  const list = await dom.methods.getDeployments();
  return list.deployments.find((d) => d.provider === provider && d.model === model);
}

describe("模型总览冷却:所有 key 都错误才算冷却", () => {
  it("两个 key,只有一个在冷却 → 不算冷却(调度器还能挑另一把)", async () => {
    const ctx = ctxWith({
      provider: "qoder",
      model: "Qwen3.8-Flash",
      endpoints: [
        { username: "158", cooldownS: 60 },
        { username: "167", cooldownS: 0 },
      ],
    });
    const row = await deploymentRow(ctx, "qoder", "Qwen3.8-Flash");
    expect(row?.in_cooldown).toBe(false);
  });

  it("两个 key 都在冷却 → 算冷却,剩余取最长那枚", async () => {
    const ctx = ctxWith({
      provider: "qoder",
      model: "Qwen3.8-Flash",
      endpoints: [
        { username: "158", cooldownS: 30 },
        { username: "167", cooldownS: 90 },
      ],
    });
    const row = await deploymentRow(ctx, "qoder", "Qwen3.8-Flash");
    expect(row?.in_cooldown).toBe(true);
    // 真实时钟会走几十毫秒,断言区间而不是精确值
    expect(row?.cooldown_remaining_s).toBeGreaterThan(85);
    expect(row?.cooldown_remaining_s).toBeLessThanOrEqual(90);
  });

  it("单 key 冷却 → 退化为原行为(该模型冷却)", async () => {
    const ctx = ctxWith({
      provider: "trae",
      model: "solo",
      endpoints: [{ username: "only", cooldownS: 45 }],
    });
    const row = await deploymentRow(ctx, "trae", "solo");
    expect(row?.in_cooldown).toBe(true);
    expect(row?.cooldown_remaining_s).toBeGreaterThan(40);
    expect(row?.cooldown_remaining_s).toBeLessThanOrEqual(45);
  });

  it("从未失败(无记录)= 可用", async () => {
    const ctx = ctxWith({
      provider: "sensenova",
      model: "deepseek-flash",
      endpoints: [{ username: "a", cooldownS: 0 }, { username: "b", cooldownS: 0 }],
    });
    const row = await deploymentRow(ctx, "sensenova", "deepseek-flash");
    expect(row?.in_cooldown).toBe(false);
  });
});

describe("顶部统计冷却:同口径", () => {
  it("部分 key 冷却 → 该行不计入 cooldown_count", async () => {
    const ctx = ctxWith({
      provider: "qoder",
      model: "Qwen3.8-Flash",
      endpoints: [
        { username: "158", cooldownS: 60 },
        { username: "167", cooldownS: 0 },
      ],
    });
    const ov = createOverviewDomain(ctx, {
      realModelMap: realModelMapOf("qoder", "Qwen3.8-Flash"),
    });
    const status = await ov.methods.getStatus();
    expect(status.cooldown_count).toBe(0);
  });

  it("全部 key 冷却 → 计入 cooldown_count", async () => {
    const ctx = ctxWith({
      provider: "qoder",
      model: "Qwen3.8-Flash",
      endpoints: [
        { username: "158", cooldownS: 60 },
        { username: "167", cooldownS: 60 },
      ],
    });
    const ov = createOverviewDomain(ctx, {
      realModelMap: realModelMapOf("qoder", "Qwen3.8-Flash"),
    });
    const status = await ov.methods.getStatus();
    expect(status.cooldown_count).toBe(1);
  });
});
