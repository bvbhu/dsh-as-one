/**
 * `upstreamErrorToHttp` 的上游原件透传(用户 m36329)。
 *
 * 一句话:上游有答复时,客户端必须拿到**上游的原话与原状态码**;分类器那套
 * 人话(`认证失败 — 上游:…`)只进日志。自造错误(没有上游答复)才走
 * `detail.error` 形状。
 */

import { describe, expect, it } from "vitest";
import { upstreamErrorToHttp } from "./server.js";
import { UpstreamError, UpstreamErrorKind } from "./types.js";

describe("upstreamErrorToHttp(上游原件逐字透传,用户 m36329)", () => {
  it("有 raw 时:状态码与 body 都照上游,rawBody 是上游原文", () => {
    const text = '{"error":{"code":"DeploymentNotFound","message":"模型不存在"}}';
    const exc = new UpstreamError(UpstreamErrorKind.BadRequest, "请求错误 — 上游:模型不存在", {
      statusCode: 400,
      raw: { text, json: JSON.parse(text), status: 404, contentType: "application/json" },
    });
    const http = upstreamErrorToHttp(exc);
    // 状态码取上游那次 404,不是 kind 派生的 400。
    expect(http.status).toBe(404);
    // body 保留上游原结构(不做任何重排/改键)。
    expect(http.body).toEqual({ error: { code: "DeploymentNotFound", message: "模型不存在" } });
    // rawBody 让 sendJson 跳过 JSON.stringify —— 一个字符都不改。
    expect(http.rawBody).toBe(text);
  });

  it("有 raw 但没有 json:按文本原样回,body 的 detail 只是可读影子", () => {
    const exc = new UpstreamError(UpstreamErrorKind.Upstream, "上游错误", {
      raw: { text: "upstream is down", status: 502 },
    });
    const http = upstreamErrorToHttp(exc);
    expect(http.status).toBe(502);
    expect(http.body).toEqual({ detail: "upstream is down" });
    expect(http.rawBody).toBe("upstream is down");
  });

  it("上游状态码不是 ≥400(异常值)时回落 kind 派生码,不改文案", () => {
    const exc = new UpstreamError(UpstreamErrorKind.RateLimit, "上游限流", {
      raw: { text: '{"code":8}', json: { code: 8 }, status: 200 },
    });
    const http = upstreamErrorToHttp(exc);
    expect(http.status).toBe(429);
    expect(http.body).toEqual({ code: 8 });
  });

  it("非 JSON 的 content-type 覆盖回给客户端的头", () => {
    const exc = new UpstreamError(UpstreamErrorKind.Upstream, "上游错误", {
      raw: { text: "<html>502</html>", status: 502, contentType: "text/html; charset=utf-8" },
    });
    const http = upstreamErrorToHttp(exc);
    expect(http.headers?.["Content-Type"]).toBe("text/html; charset=utf-8");
  });

  it("没有 raw 的自造错误仍走 detail.error 形状(detail 是内部人话)", () => {
    const exc = new UpstreamError(UpstreamErrorKind.Auth, "认证失败 — 上游:token expired", {
      statusCode: 401,
    });
    const http = upstreamErrorToHttp(exc);
    expect(http.status).toBe(401);
    expect(http.body).toEqual({
      detail: { error: { type: "auth", message: "认证失败 — 上游:token expired" } },
    });
    expect(http.rawBody).toBeUndefined();
  });

  it("retryAfter 仍写 Retry-After(有 raw 也不丢)", () => {
    const exc = new UpstreamError(UpstreamErrorKind.RateLimit, "上游限流", {
      retryAfter: 60,
      raw: { text: '{"code":429,"msg":"slow down"}', json: { code: 429, msg: "slow down" }, status: 429 },
    });
    const http = upstreamErrorToHttp(exc);
    expect(http.status).toBe(429);
    expect(http.headers?.["Retry-After"]).toBe("60");
    // ⚠️ 上游原话里没有「我们等 60s」,客户端只该看到 code/msg。
    expect(http.body).toEqual({ code: 429, msg: "slow down" });
  });
});
