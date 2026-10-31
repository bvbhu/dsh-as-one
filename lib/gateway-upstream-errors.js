/**
 * 上游错误归类与冷却 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:上游抛出来的东西(HTTP 状态、各家错误体、网络异常)统一收口成
 * {@link UpstreamError},并算出要不要冷却、冷却多久、能不能换档。
 */
import { UpstreamError, UpstreamErrorKind, } from "@as-one/core/src/gateway/types.js";
import { isStickyNoSwitchProvider } from "@as-one/core/src/scheduler/sticky.js";
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
export const CONNECTOR_KIND_TO_GATEWAY = {
    rate_limit: UpstreamErrorKind.RateLimit,
    auth: UpstreamErrorKind.Auth,
    auth_challenge: UpstreamErrorKind.AuthChallenge,
    upstream: UpstreamErrorKind.Upstream,
    bad_request: UpstreamErrorKind.BadRequest,
    timeout: UpstreamErrorKind.Timeout,
    connection: UpstreamErrorKind.Connection,
    pool_saturated: UpstreamErrorKind.RateLimit,
    pool_exhausted: UpstreamErrorKind.RateLimit,
};
/**
 * 上游给的 `Retry-After` **最多认多久**(秒)—— 对齐 Nexus
 * `MAX_HONORED_RETRY_AFTER_S = 86400`(一天)。
 *
 * ⚠️ 必须封顶:上游偶尔会回 `retry_after: 604800`(一周)甚至一个荒谬的大数,
 * 照抄等于把这个端点单方面下线到「用户以为坏了」。超过一天的,一律按一天算。
 */
export const MAX_HONORED_RETRY_AFTER_S = 86_400;
/**
 * 上游错误 → **绝对**冷却截止时刻(epoch 秒)。
 *
 * 上游给了 `retry_after`(clawbrain 的 503 body、OpenAI 的 `Retry-After` 头)
 * 就按它算 —— 这就是「**优先按上游给出的时间**」:上游明说「30 秒后重试」,
 * 就没有理由拿全局 15 分钟熔断去压它。没给 → `undefined`,调用方回落
 * router 的 provider 覆盖 / 全局 floor(见 `CooldownHint` 的三层优先级)。
 */
export function cooldownUntilOf(gerr) {
    if (gerr.retryAfter === undefined)
        return undefined;
    const secs = Number(gerr.retryAfter);
    if (!Number.isFinite(secs) || secs < 0)
        return undefined;
    return Date.now() / 1000 + Math.min(secs, MAX_HONORED_RETRY_AFTER_S);
}
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
export function canFailover(gerr, provider) {
    if (isStickyNoSwitchProvider(provider) &&
        gerr.kind === UpstreamErrorKind.RateLimit) {
        return false;
    }
    return gerr.kind !== UpstreamErrorKind.BadRequest && gerr.kind !== UpstreamErrorKind.AuthChallenge;
}
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
export function isReasoningEffortRejection(detail) {
    if (detail.length === 0)
        return false;
    return /reasoning[_ ]?effort/i.test(detail) || /unsupported.*(reasoning|thinking)/i.test(detail);
}
export function toGatewayError(err) {
    if (err instanceof UpstreamError)
        return err;
    // 连接器层 UpstreamError(4 参 kind/message/retryable/httpStatus/retryAfter)是
    // 独立类,与网关 2 参版不同模块实例 —— 按结构识别并桥接。
    if (err !== null &&
        typeof err === "object" &&
        typeof err.kind === "string" &&
        typeof err.httpStatus === "number") {
        const ce = err;
        const kind = CONNECTOR_KIND_TO_GATEWAY[ce.kind] ?? UpstreamErrorKind.Upstream;
        return new UpstreamError(kind, ce.message || "上游错误", {
            statusCode: ce.httpStatus,
            ...(typeof ce.retryAfter === "number" ? { retryAfter: ce.retryAfter } : {}),
            // 连接器若带了上游原件(逐字透传),原封不动接过去。
            ...(ce.raw !== undefined ? { raw: ce.raw } : {}),
        });
    }
    if (err instanceof Error) {
        // undici 的 fetch 失败把真实网络错误藏在 cause 里(TypeError: fetch failed)。
        const cause = err.cause;
        const code = err.code ?? cause?.code;
        const name = err.name === "TimeoutError" ? "TimeoutError" : cause?.name ?? err.name;
        if (name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
            return new UpstreamError(UpstreamErrorKind.Timeout, err.message, { statusCode: 504 });
        }
        if (code === "ECONNREFUSED" ||
            code === "ENOTFOUND" ||
            code === "ECONNRESET" ||
            code === "EPIPE" ||
            code === "EAI_AGAIN" ||
            code === "UND_ERR_SOCKET") {
            const detail = cause?.message ?? err.message;
            return new UpstreamError(UpstreamErrorKind.Connection, detail, { statusCode: 502 });
        }
        if (name === "AbortError") {
            return new UpstreamError(UpstreamErrorKind.Timeout, `上游连接超时:${err.message}`, {
                statusCode: 504,
            });
        }
    }
    const message = err instanceof Error ? err.message : String(err);
    return new UpstreamError(UpstreamErrorKind.Upstream, message, { statusCode: 502 });
}
export function httpStatusOf(err) {
    return err.httpStatus;
}
//# sourceMappingURL=gateway-upstream-errors.js.map