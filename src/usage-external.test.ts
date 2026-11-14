import { describe, expect, it, vi } from "vitest";

import {
	createExternalUsageCollector,
	ExternalUsageFold,
	GATEWAY_PROVIDER_HISTORY,
	routeOf,
	sessionIdOf,
	tokensOf,
	type ExternalUsageSample,
} from "../src/usage-external.js";

/** 固定本地时间(dayKey 走本地时区,用本地构造器避免跨时区抖动)。 */
const AT = new Date(2026, 10, 14, 12, 0, 0).getTime();
const DAY = "2026-11-14";
const EXCLUDE = new Set(["as-one"]);

function foldEvent(event: { type?: string; data?: unknown }): ExternalUsageSample[] {
	return new ExternalUsageFold().fold({ ...event, time: AT }, EXCLUDE);
}

describe("routeOf / tokensOf", () => {
	it("路由必须 provider 与 model 都有", () => {
		expect(routeOf({ provider: "yn", model: "deepseek" })).toEqual({ provider: "yn", model: "deepseek" });
		expect(routeOf({ provider: "yn" })).toBeNull();
		expect(routeOf({ model: "deepseek" })).toBeNull();
		expect(routeOf(null)).toBeNull();
	});

	it("prompt 含 cached(含 cacheWrite),与网关 prompt_tokens 同口径", () => {
		expect(tokensOf({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 90 })).toEqual({
			prompt: 100,
			cached: 90,
			completion: 5,
		});
		// Anthropic 系:缓存写也是计费的输入,必须算进 prompt
		expect(tokensOf({ inputTokens: 1, outputTokens: 1, cacheWriteTokens: 8 })).toEqual({
			prompt: 9,
			cached: 0,
			completion: 1,
		});
	});

	it("全零 / 空 usage → null(不产生空行)", () => {
		expect(tokensOf({})).toBeNull();
		expect(tokensOf(undefined)).toBeNull();
	});
});

describe("ExternalUsageFold 归属规则", () => {
	it("provider = as-one → 整条丢弃(网关那份在 stats_daily)", () => {
		const samples = foldEvent({
			type: "assistant/message",
			data: {
				turn: 1,
				step: 1,
				usage: { inputTokens: 100, outputTokens: 50 },
				message: { source: { provider: "as-one", model: "auto" } },
			},
		});
		expect(samples).toEqual([]);
	});

	it("外部 provider → 记 tokens,不记 calls(调用由 step/start 计)", () => {
		const samples = foldEvent({
			type: "assistant/message",
			data: {
				turn: 1,
				step: 1,
				usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 300 },
				message: { source: { provider: "yn", model: "deepseek-v4.1-flash" } },
			},
		});
		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			day: DAY,
			provider: "yn",
			model: "deepseek-v4.1-flash",
			calls: 0,
			promptTokens: 400,
			cachedTokens: 300,
			completionTokens: 50,
		});
	});

	it("同一个 (turn, step) 重复上报只算一次", () => {
		const fold = new ExternalUsageFold();
		const event = {
			type: "assistant/message",
			time: AT,
			data: {
				turn: 1,
				step: 2,
				usage: { inputTokens: 10, outputTokens: 1 },
				message: { source: { provider: "yn", model: "m" } },
			},
		};
		expect(fold.fold(event, EXCLUDE)).toHaveLength(1);
		expect(fold.fold(event, EXCLUDE)).toEqual([]);
	});

	it("step/start 先到、request/context 后到:调用数攒着,路由到了再落", () => {
		const fold = new ExternalUsageFold();
		// agent-loop 先 append step/start —— 此时还没有路由
		expect(fold.fold({ type: "step/start", time: AT, data: { turn: 1, step: 1 } }, EXCLUDE)).toEqual([]);
		const flushed = fold.fold(
			{ type: "request/context", time: AT, data: { provider: "yn", model: "m" } },
			EXCLUDE,
		);
		expect(flushed).toHaveLength(1);
		expect(flushed[0]).toMatchObject({ provider: "yn", model: "m", calls: 1, promptTokens: 0 });
	});

	it("重试也算一次调用", () => {
		const fold = new ExternalUsageFold();
		fold.fold({ type: "request/context", time: AT, data: { provider: "yn", model: "m" } }, EXCLUDE);
		expect(fold.fold({ type: "step/start", time: AT, data: { turn: 1, step: 1 } }, EXCLUDE)).toHaveLength(1);
		const retry = fold.fold({ type: "llm/retry-started", time: AT, data: { turn: 1, step: 1 } }, EXCLUDE);
		expect(retry).toHaveLength(1);
		expect(retry[0]?.calls).toBe(1);
	});

	it("一轮结束还没路由 → 放弃这些调用(不猜 provider)", () => {
		const fold = new ExternalUsageFold();
		expect(fold.fold({ type: "step/start", time: AT, data: { turn: 1, step: 1 } }, EXCLUDE)).toEqual([]);
		expect(fold.fold({ type: "turn/end", time: AT, data: {} }, EXCLUDE)).toEqual([]);
		// 后面的 request/context 不该把上一轮攒的调用补记进来
		expect(
			fold.fold({ type: "request/context", time: AT, data: { provider: "yn", model: "m" } }, EXCLUDE),
		).toEqual([]);
	});

	it("message.source 覆盖会话上次的路由", () => {
		const fold = new ExternalUsageFold();
		fold.fold({ type: "request/context", time: AT, data: { provider: "yn", model: "old" } }, EXCLUDE);
		const samples = fold.fold(
			{
				type: "assistant/message",
				time: AT,
				data: {
					turn: 1,
					step: 1,
					usage: { inputTokens: 5, outputTokens: 1 },
					message: { source: { provider: "hyperai", model: "new" } },
				},
			},
			EXCLUDE,
		);
		expect(samples[0]).toMatchObject({ provider: "hyperai", model: "new" });
		expect(fold.currentRoute).toEqual({ provider: "hyperai", model: "new" });
	});

	it("compaction/summary 自带路由,并自带一次调用计数", () => {
		const samples = foldEvent({
			type: "compaction/summary",
			data: {
				compactionId: "c1",
				provider: "yn",
				model: "m",
				usage: { inputTokens: 20, outputTokens: 3 },
			},
		});
		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({ calls: 1, promptTokens: 20, completionTokens: 3 });
	});
});

describe("createExternalUsageCollector", () => {
	it("按会话隔离去重,并把增量交给 record", () => {
		const record = vi.fn();
		const collector = createExternalUsageCollector({ record, exclude: ["as-one"] });
		const event = {
			type: "assistant/message",
			time: AT,
			data: {
				turn: 1,
				step: 1,
				usage: { inputTokens: 10, outputTokens: 1 },
				message: { source: { provider: "yn", model: "m" } },
			},
		};
		collector.onEvent("s1", event);
		collector.onEvent("s2", event); // 另一个会话的同 (turn, step) 必须各算一次
		collector.onEvent("s1", event);
		expect(record).toHaveBeenCalledTimes(2);
		expect(collector.stats().recorded).toBe(2);
	});

	it("record 抛错不外溢(记账失败不能打断对话)", () => {
		const record = vi.fn(() => {
			throw new Error("disk full");
		});
		const warn = vi.fn();
		const collector = createExternalUsageCollector({ record, exclude: ["as-one"], logger: { warn } });
		expect(() =>
			collector.onEvent("s1", {
				type: "assistant/message",
				time: AT,
				data: {
					turn: 1,
					step: 1,
					usage: { inputTokens: 1, outputTokens: 1 },
					message: { source: { provider: "yn", model: "m" } },
				},
			}),
		).not.toThrow();
		expect(warn).toHaveBeenCalled();
	});

	it("会话销毁后丢掉折叠状态(不泄漏 Map)", () => {
		const record = vi.fn();
		const collector = createExternalUsageCollector({ record, exclude: ["as-one"] });
		const event = {
			type: "assistant/message",
			time: AT,
			data: {
				turn: 1,
				step: 1,
				usage: { inputTokens: 1, outputTokens: 1 },
				message: { source: { provider: "yn", model: "m" } },
			},
		};
		collector.onEvent("s1", event);
		collector.onSessionDisposed("s1");
		collector.onEvent("s1", event); // 状态没了 ⇒ 同 (turn, step) 会再记一次(新会话语义)
		expect(record).toHaveBeenCalledTimes(2);
	});
});

describe("sessionIdOf(宿主会话形态)", () => {
	it("宿主传的是 { header: { id } }", () => {
		expect(sessionIdOf({ header: { id: "s-1" } })).toBe("s-1");
	});

	it("兼容直接把 id 摊平的对象,并挡住缺失/null", () => {
		expect(sessionIdOf({ id: "s-2" })).toBe("s-2");
		expect(sessionIdOf({ header: { id: "" }, id: "s-3" })).toBe("s-3");
		expect(sessionIdOf({})).toBe("");
		expect(sessionIdOf(null)).toBe("");
		expect(sessionIdOf(undefined)).toBe("");
	});

	it("header 优先于摊平字段(两处都有时取宿主那一份)", () => {
		expect(sessionIdOf({ header: { id: "real" }, id: "stale" })).toBe("real");
	});
});

describe("网关历史 provider 名", () => {
	it("默认排除表逐条列出 4 个核对过的网关名", () => {
		expect([...GATEWAY_PROVIDER_HISTORY].sort()).toEqual(["as-one", "litenexus", "nexus", "one"]);
	});

	it("不传 exclude 时,4 个网关名下的调用一条都不落库", () => {
		const record = vi.fn();
		const collector = createExternalUsageCollector({ record });
		for (const provider of GATEWAY_PROVIDER_HISTORY) {
			collector.onEvent("s1", {
				type: "assistant/message",
				time: AT,
				data: {
					turn: 1,
					step: 1,
					usage: { inputTokens: 10, outputTokens: 1 },
					message: { source: { provider, model: "sensenova/deepseek-flash" } },
				},
			});
		}
		expect(record).not.toHaveBeenCalled();
		expect(collector.stats().excluded).toBe(0); // excluded 由 fold 内部判定,不在这里计数
	});

	it("直连 provider 照常落库(排除表不许误伤)", () => {
		const record = vi.fn();
		const collector = createExternalUsageCollector({ record });
		collector.onEvent("s1", {
			type: "assistant/message",
			time: AT,
			data: {
				turn: 1,
				step: 1,
				usage: { inputTokens: 10, outputTokens: 1 },
				message: { source: { provider: "yn", model: "deepseek-v4.1-flash" } },
			},
		});
		expect(record).toHaveBeenCalledTimes(1);
	});
});
