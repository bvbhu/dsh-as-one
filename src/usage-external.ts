/**
 * 网关外用量采集 —— DSH 会话里**没有经过 as-one 网关**的那些调用。
 *
 * ## 唯一数据源
 * 宿主的 `session/event`(与 dsh-usage-statistics-panel 同源)。不读它的库,理由三条:
 *   1. 它把 `usage_history` 域声明为进程级单例,`storageDomain.open()` 同名域第二次
 *      直接抛 `already-open` —— 本插件不可能以正常方式打开同一个域;
 *   2. 挂在 globalThis 上的实例是别人的私有实现细节;
 *   3. 读它的 JSON 文件可行,但那是别人的私有存储格式,长期依赖不划算。
 *
 * ## 为什么不导入历史
 * 用户定案(2026-11-14):历史上大量用量已经写进了网关库(`stats_daily`),再从别的
 * 地方导一遍就是重复统计。所以这里**只采实时**,不做回填、不做导入;真要历史,
 * 在卸载对方面板前手工同步一次。
 *
 * ## 归属规则(唯一的防双计开关)
 * ```
 * provider === "as-one"  → 整条丢弃(网关那份在 stats_daily,还带账号/延迟/TTFT,更准)
 * 其它 provider          → 写 stats_external_daily
 * 路由未知(没有 provider/model) → 丢弃(宁可少记,不伪造)
 * ```
 * 这一步必须在**写库前**做:放到查询期过滤,会让「今天一条外部行都没有」看起来像采集挂了。
 */

import { dayKey } from "@as-one/core/src/request-log/index.js";

/** 一条要落库的外部用量增量。 */
export interface ExternalUsageSample {
	/** 本地日历日 `YYYY-MM-DD`(与 stats_daily 同一个 dayKey)。 */
	day: string;
	provider: string;
	model: string;
	/** 上游调用次数(`step/start` + `llm/retry-started`),不是客户端请求数。 */
	calls: number;
	/** 含 cached,与 stats_daily.prompt_tokens 同口径。 */
	promptTokens: number;
	cachedTokens: number;
	completionTokens: number;
	/** epoch ms,取事件时间。 */
	at: number;
}

/** 宿主 usage 的字段名(未缓存输入 + 独立缓存桶)。 */
interface UsageLike {
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
}

interface RouteLike {
	provider?: string;
	model?: string;
}

/** 从 `request/context` / `message.source` 里取 `{provider, model}`。 */
export function routeOf(value: RouteLike | null | undefined): { provider: string; model: string } | null {
	if (!value) return null;
	const provider = typeof value.provider === "string" ? value.provider.trim() : "";
	const model = typeof value.model === "string" ? value.model.trim() : "";
	if (provider === "" || model === "") return null;
	return { provider, model };
}

/**
 * 宿主 usage → (prompt, cached, completion)。
 *
 * `prompt` = 未缓存输入 + 缓存读 + 缓存写:与网关侧 `prompt_tokens` 一样**含** cached,
 * 这样 `tokens = prompt + completion` 与 `stats_daily` 是同一个算式。
 * (网关自己的 `record()` 只加 cacheRead —— OpenAI 系缓存写恒为 0,所以两边一致;
 * 直连的 Anthropic 系会有 cacheWrite,必须算进 prompt,否则总量偏小。)
 */
export function tokensOf(usage: UsageLike | null | undefined): {
	prompt: number;
	cached: number;
	completion: number;
} | null {
	if (!usage) return null;
	const input = num(usage.inputTokens);
	const cached = num(usage.cacheReadTokens);
	const write = num(usage.cacheWriteTokens);
	const output = num(usage.outputTokens);
	const prompt = input + cached + write;
	if (prompt + output <= 0) return null;
	return { prompt, cached, completion: output };
}

function num(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/** 一个会话的折叠状态。 */
export class ExternalUsageFold {
	/** `turn:step` 去重槽 —— 一次调用可能先来流式 usage、再来最终 message。 */
	private readonly seen = new Set<string>();
	/** 路由未知时先攒着的调用数(agent-loop 会先 append `step/start` 再 append `request/context`)。 */
	private pendingCalls = 0;
	private route: { provider: string; model: string } | null = null;

	/** 当前已识别的路由(诊断用)。 */
	get currentRoute(): { provider: string; model: string } | null {
		return this.route;
	}

	/**
	 * 折叠一个事件。返回需要落库的增量(**0~1 条**),由调用方决定写不写。
	 *
	 * `exclude` 是「这些 provider 不归这里管」的集合(默认含 `as-one`)。
	 */
	fold(
		event: { type?: string; time?: number; data?: unknown },
		exclude: ReadonlySet<string>,
	): ExternalUsageSample[] {
		const type = event?.type ?? "";
		const at = typeof event?.time === "number" && Number.isFinite(event.time) ? event.time : Date.now();
		const day = dayKey(at);
		const data = (event?.data ?? {}) as Record<string, unknown> & {
			turn?: unknown;
			step?: unknown;
			usage?: UsageLike;
			message?: { source?: RouteLike };
			provider?: unknown;
			model?: unknown;
			compactionId?: unknown;
		};

		if (type === "request/context") {
			const route = routeOf({ provider: data.provider as string, model: data.model as string });
			if (!route) return [];
			this.route = route;
			// 路由到了:把之前攒下的调用数记到这条路由上。
			return this.flushCalls(day, at, exclude);
		}

		if (type === "assistant/message") {
			const route = routeOf(data.message?.source) ?? this.route;
			// `message.source` 是这次调用自己的来源,比会话上次路由更可信。
			if (routeOf(data.message?.source)) this.route = routeOf(data.message?.source);
			const tokens = tokensOf(data.usage);
			if (!route || !tokens) return [];
			if (exclude.has(route.provider)) return [];
			const key = dedupeKey(data);
			if (key !== null) {
				if (this.seen.has(key)) return [];
				this.seen.add(key);
			}
			return [
				{
					day,
					provider: route.provider,
					model: route.model,
					calls: 0,
					promptTokens: tokens.prompt,
					cachedTokens: tokens.cached,
					completionTokens: tokens.completion,
					at,
				},
			];
		}

		if (type === "step/start" || type === "llm/retry-started") {
			this.pendingCalls += 1;
			return this.flushCalls(day, at, exclude);
		}

		if (type === "turn/end") {
			// 一轮结束还没等到路由 ⇒ 放弃这几次调用(不猜 provider)。
			this.pendingCalls = 0;
			return [];
		}

		if (type === "compaction/summary") {
			// 摘要调用在 agent loop 之外,事件自带 provider/model。
			const route = routeOf({ provider: data.provider as string, model: data.model as string });
			if (!route || exclude.has(route.provider)) return [];
			const tokens = tokensOf(data.usage);
			return [
				{
					day,
					provider: route.provider,
					model: route.model,
					// 摘要调用没有 step/start 打开它,这次事件自己就是一次调用。
					calls: 1,
					promptTokens: tokens?.prompt ?? 0,
					cachedTokens: tokens?.cached ?? 0,
					completionTokens: tokens?.completion ?? 0,
					at,
				},
			];
		}

		return [];
	}

	/** 把攒着的调用数落到当前路由上;没路由就继续攒着。 */
	private flushCalls(day: string, at: number, exclude: ReadonlySet<string>): ExternalUsageSample[] {
		if (this.pendingCalls <= 0) return [];
		const route = this.route;
		if (!route) return [];
		const calls = this.pendingCalls;
		this.pendingCalls = 0;
		if (exclude.has(route.provider)) return [];
		return [
			{
				day,
				provider: route.provider,
				model: route.model,
				calls,
				promptTokens: 0,
				cachedTokens: 0,
				completionTokens: 0,
				at,
			},
		];
	}
}

function dedupeKey(data: { turn?: unknown; step?: unknown }): string | null {
	if (typeof data?.turn !== "number" || typeof data?.step !== "number") return null;
	return `${data.turn}:${data.step}`;
}

export interface ExternalUsageCollectorDeps {
	/** 落库回调(由装配层接到 `db.statsExternalDaily.record`)。 */
	record(sample: ExternalUsageSample): void;
	/** 不归本模块管的 provider(默认 `as-one`)。 */
	exclude?: readonly string[];
	logger?: { warn?(message: string, error?: unknown): void };
}

export interface ExternalUsageCollector {
	/** 喂一个会话事件。 */
	onEvent(sessionId: string, event: { type?: string; time?: number; data?: unknown }): void;
	/** 会话销毁时丢掉折叠状态(长跑宿主否则每个会话留一份小 Map)。 */
	onSessionDisposed(sessionId: string): void;
	/** 诊断计数:被丢弃的样本(路由未知 / 归属网关)。 */
	stats(): { unknownRoute: number; excluded: number; recorded: number };
}

/**
 * 采集器:按会话维护折叠状态,把增量交给 `record`。
 *
 * ⚠️ `record` 抛错绝不能冒泡 —— 记账失败不能影响对话(与会话事件的其他监听者同款契约)。
 */
export function createExternalUsageCollector(deps: ExternalUsageCollectorDeps): ExternalUsageCollector {
	const exclude = new Set(deps.exclude ?? ["as-one"]);
	const folds = new Map<string, ExternalUsageFold>();
	const counters = { unknownRoute: 0, excluded: 0, recorded: 0 };

	return {
		onEvent(sessionId, event) {
			if (typeof sessionId !== "string" || sessionId === "") return;
			let fold = folds.get(sessionId);
			if (!fold) {
				fold = new ExternalUsageFold();
				folds.set(sessionId, fold);
			}
			let samples: ExternalUsageSample[];
			try {
				samples = fold.fold(event, exclude);
			} catch (err) {
				deps.logger?.warn?.("[as-one] 外部用量折叠失败", err);
				return;
			}
			for (const sample of samples) {
				try {
					deps.record(sample);
					counters.recorded += 1;
				} catch (err) {
					deps.logger?.warn?.("[as-one] 外部用量落库失败", err);
				}
			}
		},
		onSessionDisposed(sessionId) {
			folds.delete(sessionId);
		},
		stats() {
			return { ...counters };
		},
	};
}
