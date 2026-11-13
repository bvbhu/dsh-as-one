/**
 * `getSessionCurrentRoute` 单测 —— 输入框内「当前请求真实模型」徽标的数据源。
 *
 * ## 为什么值得测
 *
 * 这个方法的返回值决定徽标**画不画、画谁**,而它的两个分支都靠「查不到就 null」
 * 表达诚实(不猜)。三条边界很容易被后续改动踩坏:
 * 1. 有在途请求时**必须**返回在途那台(用户要的是「当前」,不是「上次」);
 * 2. 空闲时只能返回**仍在候选链里**的亲和 pin —— 规则改过之后旧 pin 指向已下线
 *    成员,照画就是撒谎;
 * 3. 会话号为空 / 模型名为空 → null(界面什么都不画)。
 *
 * 依赖用一个只实现用到成员的最小 ctx 顶替:本方法只读 `ledger.detail()`、
 * `router.pins`、`scheduler.chain()`、`db.realModel.get()`,别的一概不碰。
 */

import { describe, expect, it } from "vitest";
import type { InflightLease } from "@as-one/core/src/router/types.js";
import { createOverviewDomain } from "./overview.js";
import type { PanelContext } from "./context.js";

type ChainItemLike = { endpoint: { endpointId: string; provider: string; model: string } };

function ctxWith(input: {
  leases?: InflightLease[];
  pinned?: string | null;
  chain?: ChainItemLike[];
  names?: Record<string, string>;
  /** 逻辑模型的 `display_name`(值 `null` = 库里这条的 display_name 为空)。 */
  logicalNames?: Record<string, string | null>;
  /** 故意不挂 `db.logicalModel` —— 模拟老宿主 / 形状不对,验证降级而不是抛错。 */
  noLogicalTable?: boolean;
}): PanelContext {
  const db: Record<string, unknown> = {
    realModel: {
      get: (provider: string, model: string) => {
        const name = input.names?.[`${provider}/${model}`];
        return name === undefined ? undefined : { name };
      },
    },
  };
  if (!input.noLogicalTable) {
    db.logicalModel = {
      get: (name: string) =>
        Object.prototype.hasOwnProperty.call(input.logicalNames ?? {}, name)
          ? { display_name: input.logicalNames?.[name] ?? null }
          : null,
    };
  }
  const fake = {
    ledger: { detail: () => input.leases ?? [] },
    router: { pins: { get: () => input.pinned ?? null } },
    scheduler: {
      chain: () => input.chain ?? [],
    },
    db,
  };
  return fake as unknown as PanelContext;
}

function domainOf(ctx: PanelContext) {
  return createOverviewDomain(ctx, { realModelMap: () => new Map() });
}

function lease(over: Partial<InflightLease>): InflightLease {
  return {
    leaseId: "l1",
    seq: 1,
    realModelId: "sensenova/deepseek-v3",
    endpointId: "ep-1",
    logicalModel: "auto",
    sessionId: "sess-1",
    stream: true,
    startedAt: 0,
    expiresAt: 600,
    convNo: 1,
    ...over,
  } as InflightLease;
}

describe("getSessionCurrentRoute", () => {
  it("有在途请求 → 返回**在途**那台真实模型(in_flight=true)", async () => {
    const ctx = ctxWith({
      leases: [lease({ realModelId: "sensenova/deepseek-v3" })],
      // 亲和 pin 指向别处:在途必须压过它 —— 用户要的是「当前」。
      pinned: "ep-2",
      chain: [{ endpoint: { endpointId: "ep-2", provider: "trae", model: "seed-1" } }],
    });
    const route = await domainOf(ctx).methods.getSessionCurrentRoute("sess-1", "auto");
    expect(route).toMatchObject({
      provider: "sensenova",
      model: "deepseek-v3",
      logical_model: "auto",
      in_flight: true,
      is_logical: true,
    });
  });

  it("空闲 + pin 仍在链里 → 返回那台成员(in_flight=false)", async () => {
    const ctx = ctxWith({
      pinned: "ep-2",
      chain: [
        { endpoint: { endpointId: "ep-1", provider: "sensenova", model: "deepseek-v3" } },
        { endpoint: { endpointId: "ep-2", provider: "trae", model: "seed-1" } },
      ],
      names: { "trae/seed-1": "Seed-1" },
    });
    const route = await domainOf(ctx).methods.getSessionCurrentRoute("sess-1", "auto");
    expect(route).toMatchObject({
      provider: "trae",
      model: "seed-1",
      display_name: "Seed-1",
      in_flight: false,
      is_logical: true,
    });
  });

  it("pin 指向的端点已不在链里 → null(规则改过,不拿旧 pin 撒谎)", async () => {
    const ctx = ctxWith({
      pinned: "ep-gone",
      chain: [{ endpoint: { endpointId: "ep-2", provider: "trae", model: "seed-1" } }],
    });
    await expect(domainOf(ctx).methods.getSessionCurrentRoute("sess-1", "auto")).resolves.toBeNull();
  });

  it("没有 pin / 没有会话号 / 没有模型名 → null(界面不画)", async () => {
    const noPin = ctxWith({ pinned: null });
    await expect(domainOf(noPin).methods.getSessionCurrentRoute("sess-1", "auto")).resolves.toBeNull();

    const noSession = ctxWith({ pinned: "ep-2" });
    await expect(domainOf(noSession).methods.getSessionCurrentRoute("", "auto")).resolves.toBeNull();

    const noModel = ctxWith({ pinned: "ep-2" });
    await expect(domainOf(noModel).methods.getSessionCurrentRoute("sess-1")).resolves.toBeNull();
  });

  it("直连真实模型:logical_model 等于真实模型键时 is_logical=false(界面不画「→」)", async () => {
    const ctx = ctxWith({
      leases: [lease({ realModelId: "trae/seed-1", logicalModel: "trae/seed-1" })],
    });
    const route = await domainOf(ctx).methods.getSessionCurrentRoute("sess-1", "trae/seed-1");
    expect(route).toMatchObject({ is_logical: false, in_flight: true });
  });

  it("逻辑模型的人话名:`display_name` 有值用它,空/null 回退逻辑名", async () => {
    const withName = ctxWith({
      leases: [lease({ realModelId: "qoder/qwen3-flash" })],
      logicalNames: { auto: "快速档" },
    });
    await expect(
      domainOf(withName).methods.getSessionCurrentRoute("sess-1", "auto"),
    ).resolves.toMatchObject({ logical_model: "auto", logical_display_name: "快速档" });

    // display_name 为空串 → 服务端已回退,客户端拿到的就是逻辑名本身。
    const blank = ctxWith({ leases: [lease({ realModelId: "qoder/qwen3-flash" })] });
    await expect(
      domainOf(blank).methods.getSessionCurrentRoute("sess-1", "auto"),
    ).resolves.toMatchObject({ logical_model: "auto", logical_display_name: "auto" });
  });

  it("provider 人话名:已知渠道给名,未知渠道原样返回 id(不编名)", async () => {
    const known = ctxWith({ leases: [lease({ realModelId: "qoder/qwen3-flash" })] });
    await expect(
      domainOf(known).methods.getSessionCurrentRoute("sess-1", "auto"),
    ).resolves.toMatchObject({ provider: "qoder", provider_display_name: "Qoder" });

    //:「acme」不在内建表里——与其给个好听的错名,不如原样显示 id。
    const unknown = ctxWith({ leases: [lease({ realModelId: "acme/m1" })] });
    await expect(
      domainOf(unknown).methods.getSessionCurrentRoute("sess-1", "auto"),
    ).resolves.toMatchObject({ provider: "acme", provider_display_name: "acme" });
  });

  it("`db.logicalModel` 查询抛错 → 降级成 null,不抛给调用方(客户端退回逻辑名)", async () => {
    const ctx = ctxWith({
      // 不给 `db.logicalModel`(老宿主形状)→ routeOf 里的查询会抛 TypeError。
      noLogicalTable: true,
      leases: [lease({ realModelId: "sensenova/deepseek-v3" })],
    });
    const route = await domainOf(ctx).methods.getSessionCurrentRoute("sess-1", "auto");
    // 这里 `logical_display_name` 是 null —— 名字是「查不到就降级成空」,不是「拿一个
    // 不知道的当名字」。客户端那侧对 null 的兜底是退回 `route.logical_model`(`auto`),
    // 所以徽标上看到的始终是同一个词,不会出现空白。
    expect(route).toMatchObject({
      logical_model: "auto",
      logical_display_name: null,
      provider: "sensenova",
      provider_display_name: "SenseNova",
      in_flight: true,
      is_logical: true,
    });
  });

  it("逻辑模型的 display_name 为 null → 服务端回退成逻辑名(客户端不必再兜一次)", async () => {
    const ctx = ctxWith({
      leases: [lease({ realModelId: "qoder/qwen3-flash" })],
      logicalNames: { auto: null },
    });
    const route = await domainOf(ctx).methods.getSessionCurrentRoute("sess-1", "auto");
    expect(route).toMatchObject({ logical_model: "auto", logical_display_name: "auto" });
  });
});
