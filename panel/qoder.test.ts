import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type NexusDatabase } from "@as-one/core/src/db/database.js";
import type { QoderCatalogModel } from "@as-one/core/src/connectors/qoder-wire.js";
import { QODER_REGION_CONFIGS } from "@as-one/core/src/connectors/qoder-wire.js";

import {
  checkinEach,
  ensureQoderProviderRow,
  estimatedAddOnExpirySec,
  healQoderWindows,
  stripMemberFromLogicalModels,
  syncSelectedRealModels,
  viewExpiresAt,
} from "./qoder.js";

let db: NexusDatabase;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

/** 造一条上游目录行(只给测试关心的字段,其余按不涉及处理)。 */
function catalogModel(key: string, over: Partial<QoderCatalogModel> = {}): QoderCatalogModel {
  return {
    key,
    displayName: `name-${key}`,
    enable: true,
    isDefault: false,
    isVl: false,
    isReasoning: false,
    isFree: false,
    priceFactor: undefined,
    maxInputTokens: 200_000,
    maxContextTokens: undefined,
    maxOutputTokens: 32_000,
    raw: {},
    ...over,
  };
}

describe("qoder 勾选写库(real_model)", () => {
  it("勾上目录里的模型:建 provider 行 + real_model 行,能力字段来自目录", () => {
    const applied = syncSelectedRealModels(
      db,
      "qoder",
      [catalogModel("Qwen3.8-Max", { isVl: true, isReasoning: true, maxInputTokens: 1_000_000 })],
      new Set(["Qwen3.8-Max"]),
    );

    expect(applied).toEqual({ added: 1, kept: 0, skipped: [], removed: 0, stripped: 0 });

    const provider = db.provider.get("qoder");
    expect(provider).toBeDefined();
    expect(provider?.protocol).toBe("qoder");
    expect(provider?.base_url).toBe(QODER_REGION_CONFIGS.qoder.gateway);

    const row = db.realModel.get("qoder", "Qwen3.8-Max");
    expect(row).toBeDefined();
    expect(row?.name).toBe("name-Qwen3.8-Max");
    expect(row?.supports_vision).toBe(1);
    expect(row?.hidden).toBe(0);
    // 2026-11-08 用户定案:除 sensenova=1 / workbuddy=2 外统一 3,qoder 新行取 3。
    expect(row?.concurrency).toBe(3);
    expect(row?.max_input_tokens).toBe(1_000_000);
    expect(row?.max_output_tokens).toBe(32_000);
    // 思考模型 → supported_reasoning_efforts 留 null(不拦,交给上游)
    expect(row?.supported_reasoning_efforts).toBeNull();
  });

  it("非思考模型把 supported_reasoning_efforts 写成 \"[]\"(网关一律不传 effort)", () => {
    syncSelectedRealModels(
      db,
      "qoder",
      [catalogModel("Qwen3.8-Flash", { isReasoning: false })],
      new Set(["Qwen3.8-Flash"]),
    );
    expect(db.realModel.get("qoder", "Qwen3.8-Flash")?.supported_reasoning_efforts).toBe("[]");
  });

  it("目录里没有的 key 不瞎建,记进 skipped", () => {
    const applied = syncSelectedRealModels(
      db,
      "qoder",
      [catalogModel("known")],
      new Set(["known", "ghost"]),
    );
    expect(applied.added).toBe(1);
    expect(applied.skipped).toEqual(["ghost"]);
    expect(db.realModel.get("qoder", "ghost")).toBeUndefined();
  });

  it("取消勾选:删 real_model 行,并从逻辑模型档链里摘掉", () => {
    db.logicalModel.insert({
      name: "fast",
      strategy: "due-first",
      members: JSON.stringify([
        { provider: "qoder", model: "keep-me" },
        { provider: "qoder", model: "drop-me" },
      ]),
    });
    syncSelectedRealModels(
      db,
      "qoder",
      [catalogModel("keep-me"), catalogModel("drop-me")],
      new Set(["keep-me", "drop-me"]),
    );

    const applied = syncSelectedRealModels(db, "qoder", [], new Set(["keep-me"]));

    expect(applied.removed).toBe(1);
    expect(applied.stripped).toBe(1);
    expect(db.realModel.get("qoder", "drop-me")).toBeUndefined();
    expect(db.realModel.get("qoder", "keep-me")).toBeDefined();
    expect(JSON.parse(db.logicalModel.get("fast")!.members ?? "[]")).toEqual([
      { provider: "qoder", model: "keep-me" },
    ]);
  });

  it("已登记行的字段以库里为准(用户手改过的名字/并发不被目录覆盖)", () => {
    // real_model.provider 有外键指向 provider.id,先建行。
    ensureQoderProviderRow(db, "qoder");
    db.realModel.set({
      provider: "qoder",
      model: "Qwen3.8-Max",
      name: "我自己改的名字",
      supports_vision: 0,
      max_input_tokens: null,
      max_output_tokens: null,
      hidden: 0,
      concurrency: 4,
      supported_reasoning_efforts: null,
      reasoning_allows_off: true,
    });

    const applied = syncSelectedRealModels(
      db,
      "qoder",
      [catalogModel("Qwen3.8-Max", { name: "上游名", isVl: true } as never)],
      new Set(["Qwen3.8-Max"]),
    );

    expect(applied).toEqual({ added: 0, kept: 1, skipped: [], removed: 0, stripped: 0 });
    const row = db.realModel.get("qoder", "Qwen3.8-Max");
    expect(row?.name).toBe("我自己改的名字");
    expect(row?.concurrency).toBe(4);
    expect(row?.reasoning_allows_off).toBe(1);
    // 库里是 NULL 的字段才由目录补
    expect(row?.max_input_tokens).toBe(200_000);
  });

  it("provider 行已存在但协议不是 qoder:纠回 qoder,不动 base_url", () => {
    db.provider.insert({ id: "qoder", base_url: "https://my-proxy.example/v1", protocol: "openai" });

    ensureQoderProviderRow(db, "qoder");

    const row = db.provider.get("qoder");
    expect(row?.protocol).toBe("qoder");
    expect(row?.base_url).toBe("https://my-proxy.example/v1");
  });

  it("stripMemberFromLogicalModels 支持字符串形式的成员", () => {
    db.logicalModel.insert({
      name: "any",
      strategy: "due-first",
      members: JSON.stringify(["qoder/a", "trae/b"]),
    });
    expect(stripMemberFromLogicalModels(db, "qoder", "a")).toBe(1);
    // parseDbMembers 会把 "p/m" 串归一成 {provider, model} 对象再写回。
    expect(JSON.parse(db.logicalModel.get("any")!.members ?? "[]")).toEqual([
      { provider: "trae", model: "b" },
    ]);
  });
});

/**
 * 上下文窗口自愈 —— 旧版同步把上游「默认档」写进库,而 `??` 链让旧值永远压住
 * 后面的「最大档」候选,于是那次「取最大档」的修复对已登记行从不生效。
 * 实测 qfmodel 卡在 180000(默认档)而上游同模型有 1M 档,连带把 auto 逻辑模型
 * 的窗口(取各成员最小值)也压成 180000 —— 用户看到的「auto 只有 180k」。
 */
describe("qoder 上下文窗口自愈(默认档残留)", () => {
  const TIERS = { maxInputTokens: 180_000, maxContextTokens: 1_000_000 };

  /** 只写测试关心的字段,其余按 real_model 的常规缺省填满。 */
  function seed(model: string, maxInputTokens: number | null): void {
    // real_model 对 provider 有外键,先把 provider 行建出来。
    ensureQoderProviderRow(db, "qoder");
    db.realModel.set({
      provider: "qoder",
      model,
      name: null,
      supports_vision: 0,
      max_input_tokens: maxInputTokens,
      max_output_tokens: null,
      hidden: 0,
      concurrency: 1,
    });
  }

  it("库里是上游默认档 + 上游有更大档 → 升级到最大档", () => {
    seed("qfmodel", 180_000);
    const healed = healQoderWindows(db, "qoder", [catalogModel("qfmodel", TIERS)]);
    expect(healed).toBe(1);
    expect(db.realModel.get("qoder", "qfmodel")?.max_input_tokens).toBe(1_000_000);
  });

  it("用户手改过的其它值原样保留(不被误覆盖)", () => {
    seed("qfmodel", 500_000);
    const healed = healQoderWindows(db, "qoder", [catalogModel("qfmodel", TIERS)]);
    expect(healed).toBe(0);
    expect(db.realModel.get("qoder", "qfmodel")?.max_input_tokens).toBe(500_000);
  });

  it("上游没有更大档时不升级(没有可比的最大档)", () => {
    seed("qfmodel", 200_000);
    const healed = healQoderWindows(db, "qoder", [
      catalogModel("qfmodel", { maxInputTokens: 200_000, maxContextTokens: undefined }),
    ]);
    expect(healed).toBe(0);
    expect(db.realModel.get("qoder", "qfmodel")?.max_input_tokens).toBe(200_000);
  });

  it("库里为 NULL → 补上游最大档", () => {
    seed("qfmodel", null);
    const healed = healQoderWindows(db, "qoder", [catalogModel("qfmodel", TIERS)]);
    expect(healed).toBe(1);
    expect(db.realModel.get("qoder", "qfmodel")?.max_input_tokens).toBe(1_000_000);
  });

  it("目录里没有该 key → 不动", () => {
    seed("gone", 180_000);
    const healed = healQoderWindows(db, "qoder", []);
    expect(healed).toBe(0);
    expect(db.realModel.get("qoder", "gone")?.max_input_tokens).toBe(180_000);
  });
});

describe("qoder 多账号签到(checkinEach)", () => {
  const targets = [
    { name: "a", pat: "pt-a" },
    { name: "b", pat: "pt-b" },
    { name: "c", pat: "pt-c" },
  ];

  it("整个账号池逐个签:可领的正常领,已领的如实标 already-claimed", async () => {
    const seen: string[] = [];
    const rows = await checkinEach("qoder", targets, async (pat) => {
      seen.push(pat);
      if (pat === "pt-b") return { status: "already-claimed", nextRefreshAtMs: 1_793_584_740_000 };
      return { status: "claimed", amount: 100, validityDays: 30, nextRefreshAtMs: 1_793_584_740_000 };
    });

    // 关键:三个账号都打了一遍(以前只签第一个)
    expect(seen).toEqual(["pt-a", "pt-b", "pt-c"]);
    expect(rows.map((r) => [r.account, r.status])).toEqual([
      ["a", "claimed"],
      ["b", "already-claimed"],
      ["c", "claimed"],
    ]);
    expect(rows[0]?.amount).toBe(100);
    expect(rows[0]?.validityDays).toBe(30);
    expect(rows[0]?.message).toContain("100 Credits");
    expect(rows[1]?.amount).toBeNull();
    expect(rows[1]?.message).toBe("今日已领取");
  });

  it("一个账号抛错不拖累后面的账号(失败只记在它自己那条上)", async () => {
    const rows = await checkinEach("qoder", targets, async (pat) => {
      if (pat === "pt-a") throw new Error("凭据已过期");
      return { status: "claimed", amount: 100, validityDays: 30, nextRefreshAtMs: undefined };
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ account: "a", status: "unavailable", message: "凭据已过期" });
    expect(rows[1]).toMatchObject({ account: "b", status: "claimed" });
    expect(rows[2]).toMatchObject({ account: "c", status: "claimed" });
  });

  it("上游说没活动 → unavailable 且带原话,不伪装成已领", async () => {
    const rows = await checkinEach("qoder", [targets[0]!], async () => ({
      status: "unavailable",
      message: "上游今日没有下发可领取的签到活动",
    }));
    expect(rows[0]).toMatchObject({
      account: "a",
      status: "unavailable",
      message: "上游今日没有下发可领取的签到活动",
    });
  });

  it("amount 缺失写成 null(页面渲染「—」,不写成 0)", async () => {
    const rows = await checkinEach("qoder", [targets[0]!], async () => ({
      status: "claimed",
      amount: undefined,
      validityDays: undefined,
      nextRefreshAtMs: undefined,
    }));
    expect(rows[0]).toMatchObject({ status: "claimed", amount: null, validityDays: null, nextRefreshAtMs: null });
    expect(rows[0]?.message).toBe("已领取");
  });

  it("没有可用账号时不做任何上游请求", async () => {
    let called = 0;
    const rows = await checkinEach("qoder", [], async () => {
      called += 1;
      return { status: "claimed", amount: 1, validityDays: 1, nextRefreshAtMs: undefined };
    });
    expect(rows).toEqual([]);
    expect(called).toBe(0);
  });
});

describe("签到积分「参考到期」估算(estimatedAddOnExpirySec / viewExpiresAt)", () => {
  // 固定 now:本地 2026-11-05 12:00:00(无时区后缀 → 按运行环境本地时区解析,与实现一致)
  const NOW = new Date(2026, 10, 5, 12, 0, 0, 0).getTime(); // 2026-11-05 12:00 本地
  const DAY = 86400;

  it("387 分(4 笔,100×3+87) → 最早一笔 27 天后(2026-12-02)", () => {
    const sec = estimatedAddOnExpirySec(387, NOW)!;
    const d = new Date(sec * 1000);
    // NOW 本地 2026-11-05 → 27 天后 = 2026-12-02
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11); // 12 月(0-based)
    expect(d.getDate()).toBe(2);
  });

  it("阶梯边界:每满一档 100 分,最早到期天数 -1", () => {
    const day = (sec: number): string => {
      const d = new Date(sec * 1000);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    };
    const dayOf = (plusDays: number): string => {
      const d = new Date(2026, 10, 5); // 本地 2026-11-05
      d.setDate(d.getDate() + plusDays);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    };

    // 1 笔(≤100)→ 30 天后 = 12-05
    expect(day(estimatedAddOnExpirySec(100, NOW)!)).toBe(dayOf(30));
    // 2 笔(101..200)→ 29 天后 = 12-04
    expect(day(estimatedAddOnExpirySec(200, NOW)!)).toBe(dayOf(29));
    // 3 笔(201..300)→ 28 天后 = 12-03
    expect(day(estimatedAddOnExpirySec(300, NOW)!)).toBe(dayOf(28));
    // 4 笔(301..400)→ 27 天后 = 12-02
    expect(day(estimatedAddOnExpirySec(400, NOW)!)).toBe(dayOf(27));
    // 30 笔(2901..3000)→ 1 天后
    expect(day(estimatedAddOnExpirySec(3000, NOW)!)).toBe(dayOf(1));
  });

  it("remaining ≤0 或缺失 → null(不虚报)", () => {
    expect(estimatedAddOnExpirySec(0, NOW)).toBeNull();
    expect(estimatedAddOnExpirySec(-5, NOW)).toBeNull();
    expect(estimatedAddOnExpirySec(null, NOW)).toBeNull();
    expect(estimatedAddOnExpirySec(undefined, NOW)).toBeNull();
  });

  it("viewExpiresAt:只看签到积分估算,不用套餐 expiresAt(套餐有值也忽略)", () => {
    // userQuota 有余额、expiresAt 也给 —— 但按定案只返回 addOn 的估算。
    // 该用例造 addOn 存在 → 返回估算值,证明没用套餐值(估算≠1790…套餐值)。
    const sec = viewExpiresAt(
      { userQuota: { total: 300, used: 100, remaining: 200, percentage: 0.33 }, addOnQuota: { total: 700, used: 313, remaining: 387, percentage: 0.45 }, expiresAt: 1_800_000_000 } as never,
      NOW,
    );
    expect(sec).toBe(estimatedAddOnExpirySec(387, NOW));
    expect(sec).not.toBe(1_800_000_000);
  });

  it("viewExpiresAt:addOn 无余额 → null(即使套餐有值也不显示)", () => {
    const sec = viewExpiresAt(
      { userQuota: { total: 300, used: 100, remaining: 200, percentage: 0.33 }, addOnQuota: { total: 0, used: 0, remaining: 0, percentage: 0 }, expiresAt: 1_800_000_000 } as never,
      NOW,
    );
    expect(sec).toBeNull();
  });

  it("viewExpiresAt:addOn 缺失 → null", () => {
    const sec = viewExpiresAt(
      { userQuota: { total: 300, used: 100, remaining: 200, percentage: 0.33 } } as never,
      NOW,
    );
    expect(sec).toBeNull();
  });
});
