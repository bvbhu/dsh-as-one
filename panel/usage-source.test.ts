/**
 * `getUsageHistory(..., source)` 单测 —— 三档来源共用一套聚合。
 *
 * 必须钉死的口径:
 * 1. `tokens = prompt + completion`(cached 是 prompt 子集,**不双计**);
 * 2. `all` = 两张表**直接相加**(2026-11-14 用户定案),不是二选一;
 * 3. `gateway` 不含外部行、`external` 不含网关行;
 * 4. 外部行没有逻辑模型,按逻辑模型分组时**不能**整页跳过。
 */

import { describe, expect, it } from "vitest";
import { createOverviewDomain } from "./overview.js";
import type { PanelContext } from "./context.js";
import type { StatsDailyRow, StatsExternalRow } from "../core/db/types.js";

function ctxWith(gateway: StatsDailyRow[], external: StatsExternalRow[]): PanelContext {
	const fake = {
		db: {
			statsDaily: {
				range: (from: string, to: string) => gateway.filter((r) => r.day >= from && r.day <= to),
			},
			statsExternalDaily: {
				range: (from: string, to: string) => external.filter((r) => r.day >= from && r.day <= to),
			},
			logicalModel: { get: () => undefined },
		},
	};
	return fake as unknown as PanelContext;
}

function domainOf(gateway: StatsDailyRow[], external: StatsExternalRow[]) {
	return createOverviewDomain(ctxWith(gateway, external), { realModelMap: () => new Map() });
}

function gw(over: Partial<StatsDailyRow>): StatsDailyRow {
	return {
		day: "2026-11-14",
		logical_model: null,
		provider: "sensenova",
		model: "deepseek-flash",
		requests: 1,
		fails: 0,
		prompt_tokens: 100,
		cached_tokens: 80,
		completion_tokens: 10,
		latency_sum_ms: 500,
		ttft_sum_ms: 100,
		ttft_requests: 1,
		...over,
	};
}

function ext(over: Partial<StatsExternalRow>): StatsExternalRow {
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

describe("getUsageHistory 按来源聚合", () => {
	it("仅网关外:tokens = prompt + completion,cached 不双计", async () => {
		const d = domainOf([], [ext({})]);
		const out = await d.methods.getUsageHistory("all", "day", "model", "external");
		expect(out.scope).toBe("external");
		expect(out.totals).toMatchObject({
			tokens: 110,
			requests: 1,
			prompt_tokens: 100,
			completion_tokens: 10,
			cached_tokens: 80,
			cache_hit_rate: 0.8,
			active_days: 1,
		});
		expect(out.series.map((s) => s.key)).toEqual(["yn/deepseek-v4.1-flash"]);
	});

	it("仅网关:外部行一条都不进来", async () => {
		const d = domainOf([gw({})], [ext({ calls: 99, prompt_tokens: 9_999 })]);
		const out = await d.methods.getUsageHistory("all", "day", "model", "gateway");
		expect(out.scope).toBe("gateway");
		expect(out.totals.tokens).toBe(110);
		expect(out.totals.requests).toBe(1);
	});

	it("所有 = 两张表直接相加(同一天同一个键要相加)", async () => {
		const d = domainOf(
			[gw({ requests: 3, prompt_tokens: 100, completion_tokens: 10 })],
			[ext({ calls: 7, prompt_tokens: 50, completion_tokens: 5 })],
		);
		const out = await d.methods.getUsageHistory("all", "day", "model", "all");
		expect(out.scope).toBe("all");
		expect(out.totals.tokens).toBe(165); // (100+10) + (50+5)
		expect(out.totals.requests).toBe(10); // 3 次客户端请求 + 7 次上游调用
		expect(out.totals.prompt_tokens).toBe(150);
		expect(out.totals.active_days).toBe(1);
		// 两个 provider 各成一条
		expect(out.series.map((s) => s.key).sort()).toEqual(["sensenova/deepseek-flash", "yn/deepseek-v4.1-flash"]);
	});

	it("同一 provider/model 在两张表里 → 合成一条", async () => {
		const d = domainOf(
			[gw({ provider: "yn", model: "m", requests: 2, prompt_tokens: 10, completion_tokens: 0 })],
			[ext({ provider: "yn", model: "m", calls: 3, prompt_tokens: 20, completion_tokens: 0 })],
		);
		const out = await d.methods.getUsageHistory("all", "day", "model", "all");
		expect(out.series).toHaveLength(1);
		expect(out.series[0]).toMatchObject({ key: "yn/m", tokens: 30, requests: 5 });
	});

	it("按逻辑模型分组时,外部行不被跳过(否则「仅网关外」整页空白)", async () => {
		const d = domainOf([], [ext({})]);
		const out = await d.methods.getUsageHistory("all", "day", "logical", "external");
		expect(out.totals.tokens).toBe(110);
		expect(out.series.map((s) => s.key)).toEqual(["yn/deepseek-v4.1-flash"]);
	});

	it("按逻辑模型分组时,没有逻辑名的**网关行**照旧跳过", async () => {
		const d = domainOf(
			[gw({ logical_model: null, provider: "trae", model: "x" })],
			[],
		);
		const out = await d.methods.getUsageHistory("all", "day", "logical", "gateway");
		expect(out.totals.tokens).toBe(0);
		expect(out.series).toEqual([]);
	});

	it("空表 → 全零;「全部」不画区间", async () => {
		const d = domainOf([], []);
		const out = await d.methods.getUsageHistory("all", "day", "model", "all");
		expect(out.from).toBeNull();
		expect(out.to).toBeNull();
		expect(out.last_day).toBeNull();
		expect(out.series).toEqual([]);
		expect(out.totals.tokens).toBe(0);
		expect(out.totals.cache_hit_rate).toBeNull();
	});

	it("时间窗口按两表合并后的首日夹紧", async () => {
		const d = domainOf(
			[gw({ day: "2026-11-14", prompt_tokens: 1, completion_tokens: 0 })],
			[ext({ day: "2026-11-13", prompt_tokens: 1, completion_tokens: 0 })],
		);
		const out = await d.methods.getUsageHistory("365", "day", "model", "all");
		expect(out.from).toBe("2026-11-13");
		expect(out.to).toBe("2026-11-14");
		expect(out.totals.tokens).toBe(2);
		expect(out.axis).toEqual(["2026-11-13", "2026-11-14"]);
	});

	it("来源参数缺省 = all", async () => {
		const d = domainOf([gw({})], [ext({})]);
		const out = await d.methods.getUsageHistory("all", "day", "model");
		expect(out.scope).toBe("all");
		expect(out.totals.tokens).toBe(220);
	});
});

describe("零 token 记录", () => {
	it("不进模型榜/供应商榜,但调用次数仍计入 KPI", async () => {
		const d = domainOf(
			[gw({ provider: "clawbrain", model: "clawbrain-pro", requests: 63, prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 })],
			[ext({ provider: "clawbrain", model: "clawbrain-pro", calls: 38, prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 })],
		);
		const out = await d.methods.getUsageHistory("all", "day", "model", "all");
		expect(out.series).toEqual([]);
		expect(out.providers).toEqual([]);
		expect(out.totals.requests).toBe(101);
		expect(out.totals.tokens).toBe(0);
	});

	it("零 token 行不影响正常榜位(不会把有量的挤下去)", async () => {
		const d = domainOf(
			[
				gw({ provider: "a", model: "m1", requests: 5, prompt_tokens: 1000, completion_tokens: 100 }),
				gw({ provider: "b", model: "m2", requests: 500, prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 }),
			],
			[],
		);
		const out = await d.methods.getUsageHistory("all", "day", "model", "all");
		expect(out.series.map((s) => s.key)).toEqual(["a/m1"]);
		expect(out.totals.requests).toBe(505);
	});
});
