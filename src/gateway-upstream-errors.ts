/**
 * 上游错误归类与冷却 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:上游抛出来的东西(HTTP 状态、各家错误体、网络异常)统一收口成
 * {@link UpstreamError},并算出要不要冷却、冷却多久、能不能换档。
 */

import {
  UpstreamError,
  UpstreamErrorKind,
  type Upstream,
} from "@as-one/core/src/gateway/types.js";
import { isStickyNoSwitchProvider } from "@as-one/core/src/scheduler/sticky.js";
import type { RetryPolicy } from "@as-one/core/src/scheduler/backoff.js";
import { isChannelRejectDetail } from "@as-one/core/src/connectors/workbuddy-gate.js";

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
export const CONNECTOR_KIND_TO_GATEWAY: Record<string, import("@as-one/core/src/gateway/types.js").UpstreamErrorKindName> = {
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
 * 上游业务码 11140(WorkBuddy「账号存在异常行为,已被限制使用」)。
 *
 * ⚠️ 判据是 `detail` 里的 `code 11140`,因为 `classify_workbuddy_error`(core 纯函数)
 * 已经把这个码写进了 message —— 它必须保持纯函数,不该为了网关多一个字段。
 * 边界匹配:111401 / 1114000 不算。
 *
 * 语义:**账号级终态**。看到它必须立刻停手(用户的定案是物理删除凭据 + 熔断渠道,
 * 见 `workbuddy-breaker.ts`),所以它既**不重试**、也**不换号/换成员** ——
 * 换号继续打同一台设备正是「设备指纹连坐」的触发条件
 * (`workbuddy2api-hub` `note_restricted` 原文)。
 */
export function isWorkbuddyBanError(err: Pick<UpstreamError, "detail">): boolean {
  return /(?<!\d)11140(?!\d)/.test(err.detail);
}

/**
 * 这次失败是不是「11128 渠道校验拦截」—— **不是账号的错**。
 *
 * 调研结论(`TROUBLESHOOTING-11-128.md`):11128 是**请求内容/客户端身份**没过
 * 渠道校验,换账号换 Key 都不改变结果。所以:
 * - 不换号(`canFailover` 早就按 bad_request 挡住了);
 * - **也不该罚这个端点的健康记录** —— 计一次失败会让这个账号吃 15 分钟冷却,
 *   那等于「内容不合规」把账号打进冷宫,下一个无关请求反而无端失败。
 *
 * 判据只对 **protocol=workbuddy** 的端点生效(闸门/线格式都由它决定),
 * 别的渠道出现同样的字面量只当普通文本。
 */
export function isWorkbuddyChannelReject(err: UpstreamError, protocol: string): boolean {
  if (protocol !== "workbuddy") return false;
  if (err.kind !== UpstreamErrorKind.BadRequest) return false;
  return isChannelRejectDetail(err.detail);
}

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
export function cooldownUntilOf(gerr: UpstreamError): number | undefined {
  if (gerr.retryAfter === undefined) return undefined;
  const secs = Number(gerr.retryAfter);
  if (!Number.isFinite(secs) || secs < 0) return undefined;
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
export function canFailover(gerr: UpstreamError, provider?: string): boolean {
  // ⚠️ 账号级封禁(11140)**任何情况下都不换档**(2026-11-08 用户定案):
  // 直连路径上 `auth.retryable=false` 本来就会让 `RetryPolicy.shouldRetry` 否决,
  // 但这里显式再挡一次 —— 白名单是**设置项**(`retry.codes` 可被改成含 auth/401),
  // 一旦用户把 auth 加进可重试码,封号处理就会退化成「换号继续打」。
  if (isWorkbuddyBanError(gerr)) return false;
  if (
    isStickyNoSwitchProvider(provider) &&
    gerr.kind === UpstreamErrorKind.RateLimit
  ) {
    return false;
  }
  return gerr.kind !== UpstreamErrorKind.BadRequest && gerr.kind !== UpstreamErrorKind.AuthChallenge;
}

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
export function canFailoverMember(
  gerr: UpstreamError,
  opts: { provider: string; alternativeChannel: boolean },
): boolean {
  // ⚠️ 11140 账号级封禁:**逻辑模型的换成员也一律禁止**(2026-11-08)。
  // 「换成员」在链上往往就是「同一个 workbuddy 渠道的另一个账号」——
  // 那正是 `note_restricted` 说的「换号继续打同一台设备 → 指纹连坐」。
  // 这一条必须放在**所有**放宽之前:`canFailoverMember` 的本意是「换到别的
  // 厂商的钥匙不算换号」,但封号是**设备级**的,换厂商没用、换同渠道账号有害。
  if (isWorkbuddyBanError(gerr)) return false;
  if (
    gerr.kind === UpstreamErrorKind.BadRequest ||
    gerr.kind === UpstreamErrorKind.AuthChallenge
  ) {
    return false;
  }
  if (
    gerr.kind === UpstreamErrorKind.RateLimit &&
    isStickyNoSwitchProvider(opts.provider)
  ) {
    return opts.alternativeChannel;
  }
  return true;
}

/**
 * 逻辑模型换档前的**等待**秒数(每次尝试递增)。
 *
 * 直连路径用 `RetryPolicy.delayFor()`(指数退避,默认 1s→2s→4s…):那是
 * 「同一台机器再敲一次门」,等一等有意义。逻辑模型的换档是「换一台机器」,
 * 退避只变成用户白等 —— 链上 3 个成员就是 4.5 秒的纯等待,而且往往第 2 个
 * 成员立刻就能应答。所以这里只留一个**递增的短间隔**(200ms/400ms/…),
 * 足够让出事件循环、避免紧循环打上游,又不至于把 TTFT 拖长。
 */
export const LOGICAL_SWITCH_DELAY_S = 0.2;

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
export function failoverDecision(input: {
  gerr: UpstreamError;
  provider: string;
  /** 本次请求是不是**直连真实模型**(整条链都是 direct 条目)。 */
  direct: boolean;
  policy: RetryPolicy;
  attempt: number;
  /** 链上是否还有**别的渠道**、且没试过的成员(逻辑模型判 429 用)。 */
  alternativeChannel: boolean;
}): { allowed: boolean; delayS: number } {
  if (input.direct) {
    return {
      allowed: canFailover(input.gerr, input.provider) && input.policy.shouldRetry(input.gerr),
      delayS: input.policy.delayFor(input.attempt),
    };
  }
  return {
    allowed: canFailoverMember(input.gerr, {
      provider: input.provider,
      alternativeChannel: input.alternativeChannel,
    }),
    delayS: LOGICAL_SWITCH_DELAY_S * Math.max(1, input.attempt),
  };
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
export function isReasoningEffortRejection(detail: string): boolean {
  if (detail.length === 0) return false;
  return /reasoning[_ ]?effort/i.test(detail) || /unsupported.*(reasoning|thinking)/i.test(detail);
}

export function toGatewayError(err: unknown): UpstreamError {
  if (err instanceof UpstreamError) return err;
  // 连接器层 UpstreamError(4 参 kind/message/retryable/httpStatus/retryAfter)是
  // 独立类,与网关 2 参版不同模块实例 —— 按结构识别并桥接。
  if (
    err !== null &&
    typeof err === "object" &&
    typeof (err as { kind?: unknown }).kind === "string" &&
    typeof (err as { httpStatus?: unknown }).httpStatus === "number"
  ) {
    const ce = err as {
      kind: string;
      message: string;
      httpStatus: number;
      retryAfter?: number;
      raw?: import("@as-one/core/src/gateway/types.js").UpstreamRawResponse;
    };
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
    const cause = (err as NodeJS.ErrnoException & { cause?: unknown }).cause as
      | NodeJS.ErrnoException
      | undefined;
    const code = (err as NodeJS.ErrnoException).code ?? cause?.code;
    const name = err.name === "TimeoutError" ? "TimeoutError" : cause?.name ?? err.name;
    if (name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
      return new UpstreamError(UpstreamErrorKind.Timeout, err.message, { statusCode: 504 });
    }
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "EAI_AGAIN" ||
      code === "UND_ERR_SOCKET"
    ) {
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

export function httpStatusOf(err: UpstreamError): number {
  return err.httpStatus;
}
