/**
 * 上游错误归类与冷却 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:上游抛出来的东西(HTTP 状态、各家错误体、网络异常)统一收口成
 * {@link UpstreamError},并算出要不要冷却、冷却多久、能不能换档。
 */
import { UpstreamError } from "@as-one/core/src/gateway/types.js";
import type { RetryPolicy } from "@as-one/core/src/scheduler/backoff.js";
/**
 * 连接器错误 kind → 网关错误 kind。
 *
 * ⚠️ `pool_saturated` / `pool_exhausted` 映射到 **RateLimit(429)** 而不是
 * Upstream(502)(2026-10-24 用户定案 m08405):这两个 kind 都是**上游 429
 * (tpm/rpm 超限)** 的收口结论,只是「换号是否有用」的判断不同。
 * - 映射成 Upstream(502)会丢 429 语义:面板显示 502、重试策略按 502 走;
 * - 映射成 RateLimit(429)后:sensenova 的 tpm/rpm 超限**照常参与设置里的
 *   重试策略**(`retry.codes` 含 429),并保留「退避后重试」的语义。
 */
export declare const CONNECTOR_KIND_TO_GATEWAY: Record<string, import("@as-one/core/src/gateway/types.js").UpstreamErrorKindName>;
/**
 * 上游给的 `Retry-After` **最多认多久**(秒)—— 对齐 Nexus
 * `MAX_HONORED_RETRY_AFTER_S = 86400`(一天)。
 *
 * ⚠️ 必须封顶:上游偶尔会回 `retry_after: 604800`(一周)甚至一个荒谬的大数,
 * 照抄等于把这个端点单方面下线到「用户以为坏了」。超过一天的,一律按一天算。
 */
export declare const MAX_HONORED_RETRY_AFTER_S = 86400;
/**
 * 上游错误 → **绝对**冷却截止时刻(epoch 秒)。
 *
 * 上游给了 `retry_after`(clawbrain 的 503 body、OpenAI 的 `Retry-After` 头)
 * 就按它算 —— 这就是「**优先按上游给出的时间**」:上游明说「30 秒后重试」,
 * 就没有理由拿全局 15 分钟熔断去压它。没给 → `undefined`,调用方回落
 * router 的 provider 覆盖 / 全局 floor(见 `CooldownHint` 的三层优先级)。
 */
export declare function cooldownUntilOf(gerr: UpstreamError): number | undefined;
/**
 * 哪些失败**不值得换档**(对齐 Nexus `_REQUEST_LEVEL_KINDS`)。
 *
 * - `bad_request`:请求本身有问题(参数错 / 上下文超限),换成员必然同样失败;
 * - `auth_challenge`:验证码类,要人介入,换号只是把风控触发得更勤。
 *
 * ⚠️ 这是**第一层**判据;第二层是 `RetryPolicy.shouldRetry`(可重试白名单 +
 * `retryable` 显式否决 + reset_deadline 远期否决)。两层都过才换档。
 *
 * ⚠️ 第三层(2026-10-30):**「粘性期间不换号」一族**(sensenova)的限流
 * 失败**不换档**。换档会重新 plan,而重新 plan 在「同模型多账号」的链上必然
 * 落到另一个账号端点 —— 等于绕过了连接器与 planner 两层的「不换号」约定。
 * 正确形态是把这个 429(带 `Retry-After`)原样交给客户端:会话粘性期内重试
 * 仍然是同一个账号。`auth`/`bad_request` 仍按原口径判(凭据坏了换号才有意义)。
 */
export declare function canFailover(gerr: UpstreamError, provider?: string): boolean;
/**
 * **逻辑模型**(抽象模型:auto / free / 用户自建的档链)的成员换档判据 ——
 * 2026-11-01 用户定案:「逻辑模型内出现错误自动切换模型,失败时不报错,
 * 直接换成员模型」。
 *
 * 与 {@link canFailover} 的差别只有两条,但都关键:
 *
 * 1. **不受 `RetryPolicy` 白名单约束**。直连真实模型的换档是「换一把钥匙」,
 *    值不值得试取决于错误码(`retry.codes`);逻辑模型的换档是「换一个**模型**」
 *    —— 成员之间连厂商都不同,上一台的 401(`retryable=false`)只说明**那一把
 *    钥匙坏了**,下一台完全可能正常。用错误码白名单去否决换成员,等于把
 *    「链上还有 5 个健康成员」这种情况也判成整体失败。
 * 2. **粘性供应商的 429 在「链上还有别家成员没试」时允许换档**。
 *    {@link isStickyNoSwitchProvider} 的语义是「换**账号**没意义」;而这里换的是
 *    **成员模型**,可能根本是另一个渠道。只有在剩下的成员全是同一家(共用额度池)
 *    时,才维持「不换」—— 那种情况下换过去只会再吃一次同样的 429。
 *
 * `bad_request` / `auth_challenge` 仍然不换:前者换到哪都一样(请求本身不合法),
 * 后者要人介入(换号只会把风控触发得更勤)。
 */
export declare function canFailoverMember(gerr: UpstreamError, opts: {
    provider: string;
    alternativeChannel: boolean;
}): boolean;
/**
 * 逻辑模型换档前的**等待**秒数(每次尝试递增)。
 *
 * 直连路径用 `RetryPolicy.delayFor()`(指数退避,默认 1s→2s→4s…):那是
 * 「同一台机器再敲一次门」,等一等有意义。逻辑模型的换档是「换一台机器」,
 * 退避只变成用户白等 —— 链上 3 个成员就是 4.5 秒的纯等待,而且往往第 2 个
 * 成员立刻就能应答。所以这里只留一个**递增的短间隔**(200ms/400ms/…),
 * 足够让出事件循环、避免紧循环打上游,又不至于把 TTFT 拖长。
 */
export declare const LOGICAL_SWITCH_DELAY_S = 0.2;
/**
 * 失败后「要不要换档 / 换档前等多久」的唯一判据(stream 与 complete 共用)。
 *
 * 两套语义刻意分开:
 * - **直连真实模型**:`canFailover`(错误族)+ `RetryPolicy.shouldRetry`(白名单 /
 *   `retryable` 显式否决 / reset_deadline 远期否决)+ 指数退避;
 * - **逻辑模型**:{@link canFailoverMember}(换成员)+ 短间隔,不走白名单。
 *
 * ⚠️ 调用方仍要自己判 `!alreadyTried && attempt < maxAttempts` —— 「这台试过了」
 * 与次数预算不属于错误语义,放在这里会把两件事搅成一件。
 */
export declare function failoverDecision(input: {
    gerr: UpstreamError;
    provider: string;
    /** 本次请求是不是**直连真实模型**(整条链都是 direct 条目)。 */
    direct: boolean;
    policy: RetryPolicy;
    attempt: number;
    /** 链上是否还有**别的渠道**、且没试过的成员(逻辑模型判 429 用)。 */
    alternativeChannel: boolean;
}): {
    allowed: boolean;
    delayS: number;
};
/**
 * 上游是否**因为 `reasoning_effort`** 拒了请求(用户 m09081:「只原样透传,
 * 上游报相关错误则丢弃」)。
 *
 * 判据只认「错误文案里点名了 reasoning」—— 不做「所有 400 都摘掉 reasoning_effort」
 * 那种宽判据:400 也可能是消息格式、工具定义、图片之类的真问题,盲目摘参数
 * 只会把真实错误藏起来、再多打一轮上游。
 *
 * 典型上游文案:`unsupported value: 'high' for 'reasoning_effort'` /
 * `model does not support reasoning_effort` / `Unsupported parameter: 'reasoning_effort'`。
 */
export declare function isReasoningEffortRejection(detail: string): boolean;
export declare function toGatewayError(err: unknown): UpstreamError;
export declare function httpStatusOf(err: UpstreamError): number;
