/**
 * 供应商名改写(2026-11-14 用户定案:逐条分析后改写,不做通用归一化)。
 *
 * 三条必须钉住的:
 * 1. 只认**完全相等**的键 —— `WorkBuddy` 不会被改成 `workbuddy`,因为库里没有
 *    证据说明它们是一条链路,而"看起来一样"不是证据;
 * 2. 网关的名字不在改写表里(网关从不把 `as-one` 写进 provider 字段);
 * 3. 未登记的名字原样返回。
 */

import { describe, expect, it } from "vitest";
import { PROVIDER_RENAMES, REVIEWED_KEEP, renameProvider } from "./provider-name.js";
import { createOverviewDomain } from "./overview.js";
import type { PanelContext } from "./context.js";
import type { StatsDailyRow } from "../core/db/types.js";

describe("provider-name", () => {
  it("逐条改写:workbuddy_yn → hyperai", () => {
    expect(renameProvider("workbuddy_yn")).toBe("hyperai");
  });

  it("不做通用归一化:大小写 / 分隔符不同的名字原样返回", () => {
    // 库里没有这些写法,也就没有证据说它们同源 —— 不许模糊匹配。
    expect(renameProvider("WorkBuddy_yn")).toBe("WorkBuddy_yn");
    expect(renameProvider("workbuddy-yn")).toBe("workbuddy-yn");
    expect(renameProvider("HYPERAI")).toBe("HYPERAI");
    expect(renameProvider("workbuddy")).toBe("workbuddy");
  });

  it("网关的名字不进改写表(as-one 原样返回)", () => {
    expect(renameProvider("as-one")).toBe("as-one");
    expect(PROVIDER_RENAMES["as-one"]).toBeUndefined();
  });

  it("没登记的历史名原样返回;空串保持空串", () => {
    for (const name of REVIEWED_KEEP) expect(renameProvider(name)).toBe(name);
    expect(renameProvider("")).toBe("");
    expect(renameProvider("  ")).toBe("");
    expect(renameProvider("  longcat  ")).toBe("longcat");
  });

  it("改写表只登记了已经核对过的那一条(防止有人顺手加通配)", () => {
    expect(Object.keys(PROVIDER_RENAMES)).toEqual(["workbuddy_yn"]);
  });
});

function dailyRow(over: Partial<StatsDailyRow>): StatsDailyRow {
  return {
    day: "2026-11-14",
    logical_model: "auto",
    provider: "hyperai",
    model: "deepseek-v4.1-flash",
    requests: 1,
    fails: 0,
    prompt_tokens: 100,
    cached_tokens: 0,
    completion_tokens: 10,
    latency_sum_ms: 0,
    ttft_sum_ms: 0,
    ttft_requests: 0,
    ...over,
  };
}

describe("用量统计里的供应商改写", () => {
  it("workbuddy_yn 的用量并入 hyperai;其它名字各归各的", async () => {
    const rows = [
      dailyRow({ provider: "hyperai", requests: 2, prompt_tokens: 100, completion_tokens: 10 }),
      dailyRow({ provider: "workbuddy_yn", requests: 1, prompt_tokens: 50, completion_tokens: 5 }),
      dailyRow({ provider: "tokenrhythm", model: "deepseek-flash", requests: 1, prompt_tokens: 7, completion_tokens: 3 }),
    ];
    const ctx = {
      db: { statsDaily: { range: () => rows } },
      registry: { listProviders: () => [{ id: "hyperai" }] },
    } as unknown as PanelContext;
    const domain = createOverviewDomain(ctx, { realModelMap: () => new Map() });
    const out = await domain.methods.getUsageHistory("all", "day", "model");

    const byProvider = new Map(out.providers.map((p) => [p.provider, p.tokens]));
    // hyperai 110 + workbuddy_yn 55 = 165
    expect(byProvider.get("hyperai")).toBe(165);
    expect(byProvider.has("workbuddy_yn")).toBe(false);
    // 独立厂商不受影响
    expect(byProvider.get("tokenrhythm")).toBe(10);
  });
});
