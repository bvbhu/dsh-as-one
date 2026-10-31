/**
 * 网关 resolveUpstream 注入 —— 把「调度器链 → Router 选路 → 凭据 → 连接器装饰 →
 * fetch 上游」串成 gateway 需要的 Upstream(stream/complete/hasModel)。
 *
 * 契约:packages/core/src/gateway/types.ts 的 Upstream / UpstreamRequest /
 * UpstreamError(网关版,kind+detail);注入方负责真实网络(网关核心零网络)。
 *
 * 流程图(每请求):
 *   resolveUpstream(model) → scheduler.chain(model) 取链
 *   → upstream.stream/complete: router.plan({chain, sessionId, needsVision})
 *     → plan.item 为空 ⇒ 抛 UpstreamError(无可用上游)
 *     → router.commit(占并发) → 连接器 getToken/decorateRequest → fetch
 *     → router.finish(记结果/释放) → scheduler.invalidate()(清 TTL 缓存)
 *
 * 上游线层(wire)按协议分派,URL/报文体/SSE 解析全在
 * packages/core/src/connectors/{trae,workbuddy}-wire.ts 与
 * stream-aggregate.ts 里(纯函数可测),本文件只 import 不编辑 core:
 * - openai(兼容):${base}/chat/completions,bodyFor,SSE data 行;
 * - trae:        resolve_api_base + /api/agent/v3/llm_utils_chat,
 *                trae 专用报文体,SseParser+decode+ChunkBuilder;
 * - workbuddy:   REGION_BASES + /v2/chat/completions,stream_options,
 *                data 行 + XML 工具副本过滤;
 * - sensenova:   DEFAULT_BASE_URL + /chat/completions,data 行 + 心跳丢块。
 */
import type { Upstream } from "@as-one/core/src/gateway/types.js";
import type { Scheduler } from "@as-one/core/src/scheduler/engine.js";
import type { Router } from "@as-one/core/src/router/router.js";
import type { CredentialVault } from "@as-one/core/src/config/credentials.js";
import type { ProviderRegistry } from "@as-one/core/src/config/providers.js";
import { RetryPolicy } from "@as-one/core/src/scheduler/backoff.js";
/**
 * 上游请求侧的上下文(由装配层组装注入)。
 *
 * ``registry`` 保留在接口里(装配层已持有,且未来 base_url / 协议查询仍会用到),
 * 但**请求路径不再读它**:区域与身份字段全部来自凭据 raw_json —— 见
 * {@link connectorExtra} 的说明(provider id 当 region 是曾经的 bug)。
 */
export interface UpstreamRuntime {
    scheduler: Scheduler;
    router: Router;
    /** 见 {@link UpstreamRuntime} 说明:请求路径不读它。 */
    registry: ProviderRegistry;
    vault: CredentialVault;
    /**
     * 逻辑模型的**最大输出上限** = 成员链中最小的 `max_output_tokens`
     * (Nexus `_logical_output_cap`)。用于 `max_tokens` 钳制的「逻辑模型级上限」
     * 判定 —— 装配层注入(它才拿得到 registry + db)。
     *
     * 缺省 → 不提供(钳制退回保守的 `min(clientMax, memberCap)`)。
     */
    logicalOutputCap?: (logicalName: string) => number | null;
    /**
     * 本次请求的重试策略(次数上限 + 退避参数 + 可重试白名单)。
     *
     * 装配层注入(它才拿得到 settings 表)。缺省 → 用 {@link DEFAULT_RETRY_POLICY}
     * 的内置缺省(次数 1/10、退避 base 1s ×2、封顶 15s、抖动 0.2、白名单同 Nexus)。
     */
    retryPolicy?: (abstract: boolean) => RetryPolicy;
    /**
     * 某个真实模型**支持**的思考强度档位(2026-10-24 用户定案 m09328/m09937/m10437)。
     *
     * 返回值三态:
     * - `null` ⇒ 上游没给档位表 ⇒ **不传**(不拦,让它自己决定);
     * - `[]`   ⇒ 上游明说不支持思考 ⇒ **不传**;
     * - `[...]` ⇒ 交给**统一钳制算法**解析(精确命中 → 最近档位;见
     *   `core/gateway/reasoning-effort.ts`)。
     *
     * 装配层注入(它才拿得到 db.real_model)。缺省 → 不拦(等价于「未知也放行」)。
     */
    reasoningEffortsOf?: (provider: string, model: string) => readonly string[] | null;
    /**
     * 该模型是否允许**关闭思考**(`off`);`null` = 上游没说(按「允许」处理)。
     * 缺省 → `null`。
     */
    reasoningAllowsOffOf?: (provider: string, model: string) => boolean | null;
    /**
     * 「这个模型实测不接受 `reasoning_effort`」的学习结果回调(2026-10-24 用户定案 m09328:
     * 「上游报相关错误则移除字段再测试,如果可以请求,则清空字段」)。
     *
     * 由注入方在**成功且本轮丢过参**时调用;装配层据此把
     * `real_model.supported_reasoning_efforts` 清空。缺省 → 不写回。
     */
    onReasoningEffortLearned?: (provider: string, model: string) => void;
    /**
     * 单次上游调用的**连接超时**(秒)—— 等连接/首字节愿意等多久。
     *
     * 装配层注入(它才拿得到 settings 表):设置页「请求超时时间(秒)」
     * = `real.wait_budget_s`。0 / 负数 = **不设超时**(等上游自己回)。
     * 缺省 → {@link STREAM_CONNECT_TIMEOUT_MS}。
     *
     * ⚠️ 只覆盖「拿到响应头之前」;头到手后 timer 就被清掉,之后的流式读取
     * 靠 {@link STREAM_IDLE_TIMEOUT_MS} 那条路(见 iterUpstreamChunks)。
     */
    requestTimeoutMs?: () => number;
    /**
     * 「这个 sensenova 账号的 API key 不灵了」的通知(**不阻塞**,fire-and-forget)。
     *
     * 语义:网关在**首块之前**拿到 401/403(凭据类错误)时通知装配层,装配层
     * 去**后台**新建一把 key 并落库;网关自己**不等** —— 这一次照常落冷却、
     * 照常换档继续。
     *
     * ⚠️ 为什么不等:新 key 在 IAM 侧有约 8 秒传播延迟(2026-10-27 实测
     * t+0/2/4/6s 全 401,t+8s 才 200)。原地等它生效等于把这次请求的 TTFT
     * 硬拖 8 秒起跳;而换档去别的账号是**立刻**能试的。
     *
     * ⚠️ 为什么冷却照走:用户 m16528 定案 —— key 失效仍然**走一波标准冷却**
     * (按 `scheduler.cooldown_overrides` 里 sensenova 的设置值,当前 1 分钟)。
     * 端点是真的失败了,不该因为它「能自愈」就免罚;后台修好 + 冷却到期时
     * 下一跳即可用新 key。
     */
    onSensenovaKeyInvalid?: (username: string) => void;
}
/**
 * 内置缺省重试策略 —— 与 Nexus `core/backoff.py:RETRY_DEFAULTS` 同值。
 * 装配层没注入 `retryPolicy` 时用它兜底(行为与 Nexus 默认设置一致)。
 */
export declare function DEFAULT_RETRY_POLICY(abstract: boolean): RetryPolicy;
/**
 * 按**当轮成员**的输出上限钳制 `max_tokens`（O1，对齐 Nexus `_clamp_max_tokens`）。
 *
 * 规则表：
 * ```
 * 客户端缺(mtClient 未带)          → 补成成员上限
 * 客户端带了 + 成员上限有            → min(mtClient, cap)
 * 客户端带了 + 成员上限 None         → mtClient 原样(不放大也不缩小)
 * 成员上限 None                     → 不钳制(缺 / 带都一样透传)
 * 客户端带 == 逻辑模型最大输出上限    → 用**真实成员**的上限(放大到成员能力)
 * ```
 *
 * 最后一条是 2026-10-20 用户定案：harness 带的 `max_tokens` 是**逻辑模型级**
 * 上限（成员最小值，见 {@link logicalOutputCapOf}）。路由到某个真实成员时,
 * 该成员自己的 `max_output_tokens` 只可能 ≥ 逻辑最小值,于是 `min` 会把能跑的
 * 成员压到最弱成员的水平 —— 比如链 [A(64000), B(32000)],harness 带 32000,
 * 路由到 A 时正确行为是用 A 的 64000。
 *
 * 为什么必须补发：客户端常常不带 `max_tokens`,而上游各自的行为很差 ——
 * workbuddy 大 prompt 会隐式截断在 1861、trae 被上游强制 4096、longcat 小预算
 * 时 reasoning 抢占生成额度。带上成员真实上限就是把这些「隐式行为」显式化。
 *
 * ⚠️ **重复钳制防护（关键）**：多档重试时每轮都必须从**客户端原始值**
 * `maxTokensClient` 重新算,不能拿上一轮已经钳过的 `max_tokens` 继续 `min` ——
 * 否则 A 档 64000 钳过之后,B 档 262144 就永远回不去。
 */
export declare function clampMaxTokens(clientMax: number | undefined, memberCap: number | null | undefined, logicalCap: number | null | undefined): number | undefined;
/** 工厂:gateway 每次调用(每个请求)都会调 resolveUpstream(model)。 */
export declare function buildResolveUpstream(runtime: UpstreamRuntime): (model: string) => Upstream | undefined;
