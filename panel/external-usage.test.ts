/**
 * `getExternalUsage` 单测 —— 网关外用量的独立聚合。
 *
 * 三条必须钉死的口径:
 * 1. `tokens = prompt + completion`(cached 是 prompt 子集,**不双计**);
 * 2. `calls` 原样相加,不和网关的 `requests` 混;
 * 3. 空表 → 全零 + `from/to = null`(界面据此不画)。
 */

import { describe, expect, it } from "vitest";
import { createOverviewDomain } from "./overview.js";
import type { PanelContext } from "./context.js";
import type { StatsExternalRow } from "../core/db/types.js";

function ctxWith(rows: StatsExternalRow[]): PanelContext {
  const fake = {
    db: {
      statsExternalDaily: {
        range: (from: string, to: string) => rows.filter((r) => r.day >= from && r.day <= to),
      },
    },
  };
  return fake as unknown as PanelContext;
}

function domainOf(rows: StatsExternalRow[]) {
  return createOverviewDomain(ctxWith(rows), { realModelMap: () => new Map() });
}

function row(over: Partial<StatsExternalRow>): StatsExternalRow {
  return {
    day: "2026-11-14",
    provider: "yn",
    model: "deepseek-v4.1-flash",
    calls: 1,
    prompt_tokens: 100,
    cached_tokens: 80,
    completion_tokens: 10,
    last_seen: 1_000,
    ...over,
  };
}

describe("getExternalUsage", () => {
  it("tokens = prompt + completion,cached 不双计", async () => {
    const d = domainOf([row({})]);
    const out = await d.methods.getExternalUsage("all");
    expect(out.totals).toMatchObject({
      tokens: 110,
      calls: 1,
      prompt_tokens: 100,
      completion_tokens: 10,
      cached_tokens: 80,
      cache_hit_rate: 0.8,
      active_days: 1,
    });
  });

  it("按 provider/model 排名(按 token 降序),calls 各自累加", async () => {
    const d = domainOf([
      row({ provider: "yn", model: "a", calls: 2, prompt_tokens: 10, completion_tokens: 0 }),
      row({ provider: "hyperai", model: "b", calls: 7, prompt_tokens: 500, completion_tokens: 0 }),
      row({ day: "2026-11-13", provider: "yn", model: "a", calls: 3, prompt_tokens: 20, completion_tokens: 0 }),
    ]);
    const out = await d.methods.getExternalUsage("all");
    expect(out.series.map((s) => s.key)).toEqual(["hyperai/b", "yn/a"]);
    expect(out.series[1]).toMatchObject({ calls: 5, tokens: 30, provider: "yn", model: "a" });
    expect(out.totals.calls).toBe(12);
    expect(out.totals.active_days).toBe(2);
  });

  it("空表 → 全零;「全部」不画区间(界面不画)", async () => {
    const d = domainOf([]);
    const out = await d.methods.getExternalUsage("all");
    expect(out.from).toBeNull();
    expect(out.to).toBeNull();
    expect(out.last_day).toBeNull();
    expect(out.series).toEqual([]);
    expect(out.totals.tokens).toBe(0);
    expect(out.totals.cache_hit_rate).toBeNull();
  });

  it("空表 + N 天档 → 区间照算(是「这 7 天没量」,不是「没有区间」)", async () => {
    const d = domainOf([]);
    const out = await d.methods.getExternalUsage("7");
    expect(out.from).not.toBeNull();
    expect(out.to).not.toBeNull();
    expect(out.totals.tokens).toBe(0);
    expect(out.totals.active_days).toBe(0);
  });

  it("时间窗口按库内首日夹紧(选 365 而只有 2 天数据时不多算)", async () => {
    const d = domainOf([
      row({ day: "2026-11-13", prompt_tokens: 1, completion_tokens: 0 }),
      row({ day: "2026-11-14", prompt_tokens: 1, completion_tokens: 0 }),
    ]);
    const out = await d.methods.getExternalUsage("365");
    expect(out.from).toBe("2026-11-13");
    expect(out.to).toBe("2026-11-14");
    expect(out.totals.tokens).toBe(2);
    expect(out.daily.map((x) => x.day)).toEqual(["2026-11-13", "2026-11-14"]);
  });
});
