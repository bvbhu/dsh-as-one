/**
 * 供应商名归并(2026-11-14 用户定案:网关历史名归到网关,供应商名统一化)。
 *
 * 两处规则各钉一组:别名表(workbuddy_yn → hyperai)、拼写变体(大小写/分隔符)
 * 归到 provider 表的规范 id。以及一条**反向**约束:不同厂商的名字不许被合并 ——
 * 这是最容易"顺手改错"的地方,合并了就是错账。
 */

import { describe, expect, it } from "vitest";
import {
  GATEWAY_BUCKET,
  canonicalProviderName,
  createProviderCanonicalizer,
  isGatewayProviderName,
  providerNameKey,
} from "./provider-name.js";
import { createOverviewDomain } from "./overview.js";
import type { PanelContext } from "./context.js";
import type { StatsDailyRow } from "../core/db/types.js";

describe("provider-name", () => {
  it("网关的名字(各种写法)归一", () => {
    for (const n of ["as-one", "AS ONE", "as_one", "asone", "as-one-gateway", "dsh", "gateway", "网关"]) {
      expect(isGatewayProviderName(n)).toBe(true);
      expect(canonicalProviderName(n)).toBe(GATEWAY_BUCKET);
    }
    expect(isGatewayProviderName("sensenova")).toBe(false);
  });

  it("workbuddy_yn 归到 hyperai(用户定案),其余历史名保持原样", () => {
    const canon = createProviderCanonicalizer(["hyperai", "workbuddy", "sensenova"]);
    expect(canon("workbuddy_yn")).toBe("hyperai");
    expect(canon("WorkBuddy.yn")).toBe("hyperai"); // 归一后同样命中
    // 不同厂商不许合并:workbuddy 自己还是 workbuddy
    expect(canon("workbuddy")).toBe("workbuddy");
    expect(canon("longcat")).toBe("longcat"); // 库里没有 provider 行 → 原样
    expect(canon("deepseek-official")).toBe("deepseek-official");
  });

  it("拼写变体归到 provider 表里的规范 id", () => {
    const canon = createProviderCanonicalizer(["workbuddy", "qoder", "openrouter"]);
    expect(canon("WorkBuddy")).toBe("workbuddy");
    expect(canon("work-buddy")).toBe("workbuddy");
    expect(canon("QODER")).toBe("qoder");
    expect(canon("open_router")).toBe("openrouter");
    expect(providerNameKey("Open-Router")).toBe("openrouter");
  });

  it("空串不参与归并(界面据此判断'没有供应商信息')", () => {
    const canon = createProviderCanonicalizer(["hyperai"]);
    expect(canon("")).toBe("");
    expect(canon("   ")).toBe("");
    expect(canonicalProviderName("")).toBe("");
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

describe("用量统计里的供应商归并", () => {
  it("workbuddy_yn 与 hyperai 的用量合成一行,网关别名显示为「网关」", async () => {
    const rows = [
      dailyRow({ provider: "hyperai", requests: 2, prompt_tokens: 100, completion_tokens: 10 }),
      dailyRow({ provider: "workbuddy_yn", requests: 1, prompt_tokens: 50, completion_tokens: 5 }),
      dailyRow({ provider: "as-one", model: "auto", requests: 1, prompt_tokens: 7, completion_tokens: 3 }),
    ];
    const ctx = {
      db: { statsDaily: { range: () => rows } },
      registry: { listProviders: () => [{ id: "hyperai" }] },
    } as unknown as PanelContext;
    const domain = createOverviewDomain(ctx, { realModelMap: () => new Map() });
    const out = await domain.methods.getUsageHistory("all", "day", "model");

    const byProvider = new Map(out.providers.map((p) => [p.provider, p.tokens]));
    // hyperai 110 + workbuddy_yn 55 = 165(同一个上游的两次记录)
    expect(byProvider.get("hyperai")).toBe(165);
    expect(byProvider.has("workbuddy_yn")).toBe(false);
    // 网关自己的名字不再冒充一个供应商
    expect(byProvider.get(GATEWAY_BUCKET)).toBe(10);
    expect(byProvider.has("as-one")).toBe(false);
  });
});
