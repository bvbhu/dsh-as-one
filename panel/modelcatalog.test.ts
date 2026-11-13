/**
 * `/v1/models` 清单的唯一真源 —— 显示名去重 + 逻辑/真实并列(用户 m44638)。
 *
 * 为什么值得单独测:这份逻辑以前是两个宿主各一份逐字副本,漂移过一次
 * (插件版不过滤 hidden)。现在共用一份,但**共用不等于正确** —— 撞名规则、
 * 留空回退、hidden 过滤都是对外承诺,回归要能立刻发现。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type NexusDatabase } from "@as-one/core/src/db/database.js";
import { snapshotFromDb } from "@as-one/core/src/db/registry-projection.js";
import { ProviderRegistry } from "@as-one/core/src/config/providers.js";

import { dedupeLabels, listModelEntries } from "./modelcatalog.js";
import { parseReasoningEfforts, serializeReasoningEfforts } from "./modelview.js";
import { orderRawLevels } from "@as-one/core/src/gateway/reasoning-effort.js";

let db: NexusDatabase;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

function registry(): ProviderRegistry {
  const { snapshot } = snapshotFromDb(db);
  return ProviderRegistry.fromSnapshot(snapshot, { filePath: "<test>" });
}

/** 登记一条真实模型(只写测试关心的字段,其余按不涉及处理)。 */
function seedReal(
  provider: string,
  model: string,
  over: Partial<{
    name: string | null;
    hidden: number;
    supports_vision: number;
    max_input_tokens: number | null;
    max_output_tokens: number | null;
    efforts: string | null;
    allowsOff: boolean | null;
  }> = {},
): void {
  if (!db.provider.get(provider)) {
    db.provider.insert({ id: provider, protocol: "openai", base_url: "https://example.invalid/v1" });
  }
  db.realModel.set({
    provider,
    model,
    name: over.name ?? null,
    supports_vision: over.supports_vision ?? 0,
    max_input_tokens: over.max_input_tokens ?? null,
    max_output_tokens: over.max_output_tokens ?? null,
    hidden: over.hidden ?? 0,
    concurrency: 3,
    supported_reasoning_efforts: over.efforts ?? null,
    reasoning_allows_off: over.allowsOff ?? null,
  });
}

function seedLogical(name: string, members: string[], displayName?: string | null): void {
  db.logicalModel.insert({
    name,
    strategy: "random",
    members: JSON.stringify(members),
    ...(displayName === undefined ? {} : { display_name: displayName }),
  });
}

describe("dedupeLabels", () => {
  it("不撞名时原样返回,不加任何后缀", () => {
    expect(dedupeLabels(["alpha", "beta"], ["p1", "p2"])).toEqual(["alpha", "beta"]);
  });

  it("撞名时按 tag 区分,大小写不敏感视为撞名", () => {
    expect(dedupeLabels(["DeepSeek-Flash", "deepseek-flash"], ["sensenova", "logical-name"])).toEqual([
      "DeepSeek-Flash (sensenova)",
      "deepseek-flash (logical-name)",
    ]);
  });

  it("tag 为 null 的条目撞名时用序号兜底(不能留两条同名)", () => {
    expect(dedupeLabels(["x", "x", "x"], [null, null, null])).toEqual(["x", "x ·2", "x ·3"]);
  });

  it("追加 tag 后仍然撞名 ⇒ 序号继续兜底", () => {
    // 同一 provider 下两条真实模型改了同一个显示名:base 与 tag 全同,追加后同为
    // `x (p)` —— 第二条必须再上序号。选择器里出现两条同名是查不出来的。
    expect(dedupeLabels(["x", "x"], ["p", "p"])).toEqual(["x (p)", "x (p) ·2"]);
  });
});

describe("listModelEntries 显示名(用户 m44638)", () => {
  it("真实模型撞上逻辑模型名 ⇒ 真实那条追加 provider,逻辑那条保持干净", () => {
    seedReal("sensenova", "deepseek-flash", { name: "deepseek-flash", max_input_tokens: 128_000 });
    seedLogical("deepseek-flash", ["sensenova/deepseek-flash"]);

    const entries = listModelEntries(registry(), db, new Set(["sensenova"]));
    const logical = entries.find((e) => e.id === "deepseek-flash");
    const real = entries.find((e) => e.id === "sensenova/deepseek-flash");

    expect(logical?.litenexus_kind).toBe("logical");
    expect(real?.litenexus_kind).toBe("real");
    // name 是各自的原始人话名,display_name 才是整表去重后的结果。
    expect(logical?.name).toBe("deepseek-flash");
    expect(real?.name).toBe("deepseek-flash");
    // 逻辑模型的裸名字是用户自己敲的调用串,不该被加上 `(同名)` 这种废话;
    // 让路的是真实模型 —— 它本来就该带 provider 说明是谁家的。
    expect(logical?.display_name).toBe("deepseek-flash");
    expect(real?.display_name).toBe("deepseek-flash (sensenova)");
  });

  it("两条真实模型跨 provider 撞同名 ⇒ 各自追加自己的 provider", () => {
    seedReal("sensenova", "deepseek-flash", { name: null });
    seedReal("trae", "deepseek-flash", { name: null });

    const entries = listModelEntries(registry(), db, new Set(["sensenova", "trae"]));
    const byId = (id: string) => entries.find((e) => e.id === id)?.display_name;
    expect(byId("sensenova/deepseek-flash")).toBe("deepseek-flash (sensenova)");
    expect(byId("trae/deepseek-flash")).toBe("deepseek-flash (trae)");
  });

  it("两条逻辑模型填了同一个显示名 ⇒ 后一条追加自己的调用串", () => {
    seedReal("p1", "a", { name: null });
    seedLogical("auto", ["p1/a"], "快速档");
    seedLogical("free", ["p1/a"], "快速档");

    const entries = listModelEntries(registry(), db, new Set(["p1"]));
    // 两条都填了同一个显示名 ⇒ 谁也不是「裸调用串」,一律追加调用串区分(与真实模型同规则)。
    expect(entries.find((e) => e.id === "auto")?.display_name).toBe("快速档 (auto)");
    expect(entries.find((e) => e.id === "free")?.display_name).toBe("快速档 (free)");
  });

  it("逻辑模型填了显示名 ⇒ 用显示名;没填 ⇒ 回退调用串", () => {
    seedReal("sensenova", "m1", { name: null });
    seedLogical("auto", ["sensenova/m1"], "自动档");
    seedLogical("free", ["sensenova/m1"]);

    const entries = listModelEntries(registry(), db, new Set(["sensenova"]));
    expect(entries.find((e) => e.id === "auto")?.name).toBe("自动档");
    expect(entries.find((e) => e.id === "free")?.name).toBe("free");
  });

  it("显示名只影响显示:空白串按未填处理(不落 `auto ()` 这种脏串)", () => {
    seedReal("sensenova", "m1", { name: null });
    seedLogical("auto", ["sensenova/m1"], "   ");
    const entries = listModelEntries(registry(), db, new Set(["sensenova"]));
    expect(entries.find((e) => e.id === "auto")?.name).toBe("auto");
  });

  it("真实模型 name 为空白 ⇒ 回退裸模型名", () => {
    seedReal("maas", "spark-x2.6", { name: "  " });
    const entries = listModelEntries(registry(), db, new Set(["maas"]));
    const e = entries.find((x) => x.id === "maas/spark-x2.6");
    expect(e?.name).toBe("spark-x2.6");
    expect(e?.display_name).toBe("spark-x2.6");
  });

  it("不撞名时 display_name 与 name 相同(不为了区分而区分)", () => {
    seedReal("maas", "spark-x2.6", { name: "Spark 星火" });
    const e = listModelEntries(registry(), db, new Set(["maas"])).find(
      (x) => x.id === "maas/spark-x2.6",
    );
    expect(e?.name).toBe("Spark 星火");
    expect(e?.display_name).toBe("Spark 星火");
  });
});

describe("listModelEntries 过滤与聚合口径", () => {
  it("hidden=1 的真实模型不列;provider 无凭据的不列", () => {
    seedReal("sensenova", "hidden-one", { hidden: 1 });
    seedReal("sensenova", "shown");
    seedReal("trae", "no-cred");

    const ids = listModelEntries(registry(), db, new Set(["sensenova"])).map((e) => e.id);
    expect(ids).toContain("sensenova/shown");
    expect(ids).not.toContain("sensenova/hidden-one");
    expect(ids).not.toContain("trae/no-cred");
  });

  it("空成员的逻辑模型不列(列出去也调不通)", () => {
    seedReal("sensenova", "m1", { name: null });
    seedLogical("empty", []);
    const ids = listModelEntries(registry(), db, new Set(["sensenova"])).map((e) => e.id);
    expect(ids).not.toContain("empty");
  });

  /**
   * 2026-11-02 用户定案:**逻辑模型统一声明完整规范阶梯**
   * (`off < low < medium < high < max`,off 由 `reasoning_allows_off` 表达),
   * **不再取成员能力表的交集** —— 逻辑模型是抽象层,当轮真实成员会按自己的表
   * 钳制。这一条钉住:窗口仍取各档最小值,但思考强度不随成员收缩。
   */
  it("逻辑模型:窗口取最小值,思考强度统一为完整阶梯(不随成员收缩)", () => {
    seedReal("p1", "a", {
      name: null,
      max_input_tokens: 1_000_000,
      efforts: JSON.stringify(["low", "high", "max"]),
      allowsOff: true,
    });
    seedReal("p2", "b", {
      name: null,
      max_input_tokens: 256_000,
      efforts: JSON.stringify(["low", "high"]),
      allowsOff: false,
    });
    seedLogical("auto", ["p1/a", "p2/b"]);

    const e = listModelEntries(registry(), db, new Set(["p1", "p2"])).find(
      (x) => x.id === "auto",
    );
    expect(e?.max_input_tokens).toBe(256_000);
    expect(e?.reasoning_efforts).toEqual(["low", "medium", "high", "max"]);
    expect(e?.reasoning_allows_off).toBe(true);
  });

  it("逻辑模型:成员明确不吃思考也不影响对外声明(统一完整阶梯)", () => {
    seedReal("p1", "a", { name: null, efforts: JSON.stringify(["low", "high"]) });
    seedReal("p2", "b", { name: null, efforts: "[]" });
    seedLogical("auto", ["p1/a", "p2/b"]);

    const e = listModelEntries(registry(), db, new Set(["p1", "p2"])).find((x) => x.id === "auto");
    expect(e?.reasoning_efforts).toEqual(["low", "medium", "high", "max"]);
    expect(e?.reasoning_allows_off).toBe(true);
  });

  it("真实模型的 id 被逻辑名占用时跳过(逻辑名优先占位)", () => {
    // 真实模型的调用串是 `provider/model`,所以撞的是**逻辑模型恰好叫这个名字**。
    seedReal("sensenova", "auto", { name: null });
    seedLogical("sensenova/auto", ["sensenova/auto"]);
    const entries = listModelEntries(registry(), db, new Set(["sensenova"]));
    const hit = entries.filter((e) => e.id === "sensenova/auto");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.litenexus_kind).toBe("logical");
  });

  /**
   * 「思考强度选择器」写库口径(setDeploymentReasoning 的实现核心)。
   *
   * 选择器把用户选的档位写进 `real_model.supported_reasoning_efforts`;这条
   * 测试钉住:① 写前只排序去重(**保留上游原文**,不把 `xhigh` 改成 `max`);
   * ② 写后 `/v1/models` 清单原样反映;③ `off` 不进档位表,由
   * `reasoning_allows_off` 单独表达;④ 读侧同样保留原文。
   */
  it("思考强度选择器:原文写库、清单原样反映、off 由 allows_off 表达", () => {
    seedReal("p1", "a", { name: null });
    const normalized = orderRawLevels(["max", "xhigh", "low", "medium", "high", "low", "bogus"]);
    // 同档的两个拼写(max / xhigh)保持上游给的先后,只按阶梯分组排序。
    expect(normalized).toEqual(["low", "medium", "high", "max", "xhigh"]);
    db.realModel.update({
      provider: "p1",
      model: "a",
      supported_reasoning_efforts: serializeReasoningEfforts(normalized),
      reasoning_allows_off: true,
    });
    const e = listModelEntries(registry(), db, new Set(["p1"])).find((x) => x.id === "p1/a");
    expect(e?.reasoning_efforts).toEqual(["low", "medium", "high", "max", "xhigh"]);
    expect(e?.reasoning_allows_off).toBe(true);
    // 读侧保留原文:老库存的 xhigh 读出来还是 xhigh(网关要把它发给上游)
    expect(parseReasoningEfforts('["xhigh","low"]')).toEqual(["low", "xhigh"]);    // 「不支持思考」= "[]",读出来是空数组(与 null「未设置」区分开)
    db.realModel.update({ provider: "p1", model: "a", supported_reasoning_efforts: "[]" });
    const none = listModelEntries(registry(), db, new Set(["p1"])).find((x) => x.id === "p1/a");
    expect(none?.reasoning_efforts).toEqual([]);
  });
});
