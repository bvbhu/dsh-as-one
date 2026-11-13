/**
 * 换档判据单测 —— `failoverDecision` / `canFailoverMember`。
 *
 * ## 为什么单独一个文件
 *
 * 这两条判据决定「一次失败之后,用户的请求是**换一台机器继续**还是**直接报错**」,
 * 但它们藏在一大坨流式代码里,靠端到端测试根本覆盖不到(要造多供应商上游)。
 * 2026-11-01 用户定案:「逻辑模型内出现错误自动切换模型,失败时不报错,
 * 直接换成员模型」—— 本文件就是这条定案的规格。
 *
 * ⚠️ 断言的是**行为差异**,不是实现细节:
 * - 直连:401(`retryable=false`)不换档(同一把钥匙坏了,重试无意义);
 * - 逻辑模型:401 **换档**(下一个成员可能是另一家、另一把钥匙);
 * - 粘性供应商(sensenova)的 429:还有别家成员才换,只剩自家不换。
 */

import { describe, expect, it } from "vitest";
import { UpstreamError, UpstreamErrorKind } from "@as-one/core/src/gateway/types.js";
import { RetryPolicy } from "@as-one/core/src/scheduler/backoff.js";
import { DEFAULT_CODES } from "@as-one/core/src/scheduler/backoff.js";
import { canFailoverMember, failoverDecision, isWorkbuddyBanError, isWorkbuddyChannelReject } from "../src/gateway-upstream-errors.js";

/** 默认退避参数(与 RETRY_DEFAULTS 同值),只用于断言「直连仍走指数退避」。 */
function policy(): RetryPolicy {
  return new RetryPolicy({
    maxAttempts: 10,
    cooldownFloorS: 900,
    baseS: 1,
    factor: 2,
    capS: 15,
    jitterRatio: 0,
    codes: new Set(DEFAULT_CODES.split(",")),
  });
}

function err(kind: string, detail = "x"): UpstreamError {
  return new UpstreamError(kind as never, detail, { statusCode: 502 });
}

describe("canFailoverMember(逻辑模型换成员)", () => {
  it("bad_request / auth_challenge 不换(换到哪都一样 / 要人介入)", () => {
    expect(canFailoverMember(err(UpstreamErrorKind.BadRequest), { provider: "trae", alternativeChannel: true })).toBe(false);
    expect(canFailoverMember(err(UpstreamErrorKind.AuthChallenge), { provider: "trae", alternativeChannel: true })).toBe(false);
  });

  it("auth(401)在逻辑模型里**要换**(下一成员可能是另一个渠道的另一把钥匙)", () => {
    expect(canFailoverMember(err(UpstreamErrorKind.Auth), { provider: "trae", alternativeChannel: false })).toBe(true);
  });

  it("粘性供应商的 429:还有别家成员 → 换;只剩自家 → 不换(同一额度池)", () => {
    const rate = err(UpstreamErrorKind.RateLimit);
    expect(canFailoverMember(rate, { provider: "sensenova", alternativeChannel: true })).toBe(true);
    expect(canFailoverMember(rate, { provider: "sensenova", alternativeChannel: false })).toBe(false);
  });

  it("非粘性供应商的 429 一律换(它的「不换号」约定不适用于换模型)", () => {
    expect(canFailoverMember(err(UpstreamErrorKind.RateLimit), { provider: "trae", alternativeChannel: false })).toBe(true);
  });
});

describe("failoverDecision", () => {  it("直连:仍按 RetryPolicy 白名单 + 指数退避(不受本次放宽影响)", () => {
    // 401 的 retryable 是 false → shouldRetry 否决;base=1s、attempt=1。
    const auth = failoverDecision({
      gerr: err(UpstreamErrorKind.Auth),
      provider: "trae",
      direct: true,
      policy: policy(),
      attempt: 1,
      alternativeChannel: true,
    });
    expect(auth.allowed).toBe(false);
    expect(auth.delayS).toBe(1);

    const timeout = failoverDecision({
      gerr: err(UpstreamErrorKind.Timeout),
      provider: "trae",
      direct: true,
      policy: policy(),
      attempt: 2,
      alternativeChannel: false,
    });
    expect(timeout.allowed).toBe(true);
    expect(timeout.delayS).toBe(2);
  });

  it("逻辑模型:401 换档,且间隔是短的线性递增(不拖 TTFT)", () => {
    const first = failoverDecision({
      gerr: err(UpstreamErrorKind.Auth),
      provider: "trae",
      direct: false,
      policy: policy(),
      attempt: 1,
      alternativeChannel: false,
    });
    expect(first.allowed).toBe(true);
    expect(first.delayS).toBeCloseTo(0.2);

    const third = failoverDecision({
      gerr: err(UpstreamErrorKind.Auth),
      provider: "trae",
      direct: false,
      policy: policy(),
      attempt: 3,
      alternativeChannel: false,
    });
    expect(third.delayS).toBeCloseTo(0.6);
  });

  it("逻辑模型:400 不换(换成员只会把同一个错误再打一遍)", () => {
    expect(
      failoverDecision({
        gerr: err(UpstreamErrorKind.BadRequest),
        provider: "trae",
        direct: false,
        policy: policy(),
        attempt: 1,
        alternativeChannel: true,
      }).allowed,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11140 账号级封禁:绝不重试、绝不换号、绝不换成员(2026-11-08,A2)
//
// 依据(`workbuddy2api-hub` `note_restricted` 原文):「看到 11140 立即停手,
// 解封前**严禁换号继续打同一台设备**,否则**设备指纹会连坐**」。
// 「换成员」在链上往往就是「同一渠道的另一个账号」—— 同一条雷。
// ---------------------------------------------------------------------------

/** 11140 的 error(message 由 `classify_workbuddy_error` 产出,带 `code 11140`)。 */
function ban(): UpstreamError {
  return new UpstreamError(
    UpstreamErrorKind.Auth,
    "账号存在异常行为,已被限制使用(code 11140):device restricted",
    { statusCode: 403 },
  );
}

describe("11140 封号:换档判据", () => {
  it("isWorkbuddyBanError:边界匹配,不误伤 111401 / 11128", () => {
    expect(isWorkbuddyBanError({ detail: "x code 11140 y" })).toBe(true);
    expect(isWorkbuddyBanError({ detail: `{"code":11140}` })).toBe(true);
    expect(isWorkbuddyBanError({ detail: "code 111401" })).toBe(false);
    expect(isWorkbuddyBanError({ detail: "code 11128" })).toBe(false);
  });

  it("直连:即使把 auth 加进可重试白名单,也**不换档**", () => {
    // 白名单是设置项,用户完全可以填 auth/401 —— 那时若只靠 RetryPolicy,
    // 封号处理就退化成「换个号继续打」。
    const permissive = new RetryPolicy({
      maxAttempts: 10,
      cooldownFloorS: 900,
      baseS: 1,
      factor: 2,
      capS: 15,
      jitterRatio: 0,
      codes: new Set([...DEFAULT_CODES.split(","), "auth", "401", "403"]),
    });
    expect(
      failoverDecision({
        gerr: ban(),
        provider: "workbuddy",
        direct: true,
        policy: permissive,
        attempt: 1,
        alternativeChannel: true,
      }).allowed,
    ).toBe(false);
  });

  it("逻辑模型:封号**不换成员**(哪怕还有别家渠道没试)", () => {
    expect(canFailoverMember(ban(), { provider: "workbuddy", alternativeChannel: true })).toBe(false);
    expect(
      failoverDecision({
        gerr: ban(),
        provider: "workbuddy",
        direct: false,
        policy: policy(),
        attempt: 1,
        alternativeChannel: true,
      }).allowed,
    ).toBe(false);
  });

  it("普通 auth(401)不受影响:逻辑模型照旧换成员", () => {
    const plain = new UpstreamError(UpstreamErrorKind.Auth, "认证失败 — 上游:invalid token", {
      statusCode: 401,
    });
    expect(canFailoverMember(plain, { provider: "trae", alternativeChannel: true })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11128 渠道校验:不换号、也**不罚账号**(2026-11-08,A3)
// ---------------------------------------------------------------------------

describe("11128 渠道校验:不罚账号", () => {
  const reject = (): UpstreamError =>
    new UpstreamError(
      UpstreamErrorKind.BadRequest,
      "被 WorkBuddy 网关的渠道校验拦截(HTTP 400 / code 11128)",
      { statusCode: 400 },
    );

  it("是渠道校验 ⇒ 端点不记失败(voidAttempt),不能把账号打进冷却", () => {
    expect(isWorkbuddyChannelReject(reject(), "workbuddy")).toBe(true);
  });

  it("只对 protocol=workbuddy 生效(别的渠道出现同样的字面量只当普通文本)", () => {
    expect(isWorkbuddyChannelReject(reject(), "openai")).toBe(false);
    expect(isWorkbuddyChannelReject(reject(), "trae")).toBe(false);
  });

  it("封号(11140)不算「渠道校验」—— 两件事不能混", () => {
    expect(isWorkbuddyChannelReject(ban(), "workbuddy")).toBe(false);
  });

  it("其它 kind 不算(限流/5xx 该罚就罚)", () => {
    const rate = new UpstreamError(UpstreamErrorKind.RateLimit, "code 11128", { statusCode: 429 });
    expect(isWorkbuddyChannelReject(rate, "workbuddy")).toBe(false);
  });
});
