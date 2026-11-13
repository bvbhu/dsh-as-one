/**
 * OpenAI 兼容连接器测试 —— 覆盖 tokenrhythm/longcat/openrouter/stepfun 等。
 *
 * 禁止真实网络/真实子进程。
 */

import { describe, it, expect } from "vitest";
import {
  OpenAICompatAdapter,
  build_openai_headers,
  classify_openai_error,
  normalize_reasoning,
  retryAfterOf,
  upstreamDetailOf,
} from "./openai-compat.js";
import { UpstreamError } from "./types.js";

// ---------------------------------------------------------------------------
// 请求头
// ---------------------------------------------------------------------------

describe("build_openai_headers", () => {
  it("Authorization 是 Bearer", () => {
    const headers = build_openai_headers("my-api-key");
    expect(headers["Authorization"]).toBe("Bearer my-api-key");
  });

  it("包含 Content-Type", () => {
    const headers = build_openai_headers("my-api-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("流式 Accept: text/event-stream", () => {
    const headers = build_openai_headers("my-api-key", true);
    expect(headers["Accept"]).toBe("text/event-stream");
  });

  it("非流式 Accept: application/json", () => {
    const headers = build_openai_headers("my-api-key", false);
    expect(headers["Accept"]).toBe("application/json");
  });
});

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

describe("classify_openai_error", () => {
  it("429 → rate_limit", () => {
    const err = classify_openai_error(429, {});
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("401 → auth", () => {
    const err = classify_openai_error(401, {});
    expect(err.kind).toBe("auth");
    expect(err.retryable).toBe(false);
  });

  it("403 → auth", () => {
    const err = classify_openai_error(403, {});
    expect(err.kind).toBe("auth");
  });

  it("500 → upstream", () => {
    const err = classify_openai_error(500, {});
    expect(err.kind).toBe("upstream");
    expect(err.retryable).toBe(true);
  });

  it("400 → bad_request", () => {
    const err = classify_openai_error(400, {});
    expect(err.kind).toBe("bad_request");
    expect(err.retryable).toBe(false);
  });

  it("504 → upstream(与 Nexus classify_status 对齐:500-599 全走 upstream;timeout 只来自传输层异常)", () => {
    const err = classify_openai_error(504, {});
    expect(err.kind).toBe("upstream");
    expect(err.retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// retry_after / 上游原文(2026-10-21:「优先按上游给出的时间」)
// ---------------------------------------------------------------------------

describe("retryAfterOf", () => {
  it("body 的 retry_after(数字)→ 秒", () => {
    expect(retryAfterOf({ error: { message: "busy", retry_after: 30 } })).toBe(30);
  });

  it("body 的 retryAfter(驼峰)/ 数字串 都认", () => {
    expect(retryAfterOf({ retryAfter: 12 })).toBe(12);
    expect(retryAfterOf({ "retry-after": "45" })).toBe(45);
  });

  it("嵌在 error 对象里也认(OpenAI 的形状)", () => {
    expect(retryAfterOf({ error: { retry_after: 7 } })).toBe(7);
  });

  it("响应头 Retry-After 的秒数形态", () => {
    expect(retryAfterOf({}, { "Retry-After": "20" })).toBe(20);
  });

  it("响应头 Retry-After 的 HTTP-date 形态 → 折算成「距今多少秒」", () => {
    const at = new Date(Date.now() + 90_000).toUTCString();
    const secs = retryAfterOf({}, { "retry-after": at });
    expect(secs).toBeGreaterThan(80);
    expect(secs).toBeLessThanOrEqual(90);
  });

  it("负值 / 非数字 / 缺失 → undefined(不当成合法秒数往下传)", () => {
    expect(retryAfterOf({ retry_after: -1 })).toBeUndefined();
    expect(retryAfterOf({ retry_after: "soon" })).toBeUndefined();
    expect(retryAfterOf({})).toBeUndefined();
    expect(retryAfterOf(null)).toBeUndefined();
    expect(retryAfterOf({}, { "retry-after": "garbage" })).toBeUndefined();
  });

  it("body 优先于响应头", () => {
    expect(retryAfterOf({ retry_after: 5 }, { "retry-after": "99" })).toBe(5);
  });
});

describe("upstreamDetailOf", () => {
  it("error.message 优先", () => {
    expect(upstreamDetailOf({ error: { message: "服务暂时繁忙" } })).toBe("服务暂时繁忙");
  });
  it("message / detail / msg 依次兜底", () => {
    expect(upstreamDetailOf({ message: "a" })).toBe("a");
    expect(upstreamDetailOf({ detail: "b" })).toBe("b");
    expect(upstreamDetailOf({ msg: "c" })).toBe("c");
  });
  it("读不出 → 空串", () => {
    expect(upstreamDetailOf({})).toBe("");
    expect(upstreamDetailOf("x")).toBe("");
  });
});

describe("classify_openai_error 带上游原文与 retry_after", () => {
  it("503 + body retry_after → kind upstream、message 带原文、retryAfter=30", () => {
    const err = classify_openai_error(503, {
      error: { message: "服务暂时繁忙,请 30 秒后重试。如持续出现请联系客服。", type: "service_unavailable", retry_after: 30 },
    });
    expect(err.kind).toBe("upstream");
    expect(err.retryable).toBe(true);
    expect(err.retryAfter).toBe(30);
    expect(err.message).toContain("服务暂时繁忙");
    expect(err.message.startsWith("上游错误:")).toBe(true);
  });

  it("响应头 Retry-After 也能进 retryAfter", () => {
    const err = classify_openai_error(429, {}, { "retry-after": "15" });
    expect(err.kind).toBe("rate_limit");
    expect(err.retryAfter).toBe(15);
  });

  it("上游没给理由 → message 保持原类别标签(不编造)", () => {
    expect(classify_openai_error(500, {}).message).toBe("上游错误");
    expect(classify_openai_error(429, {}).message).toBe("上游限流");
    expect(classify_openai_error(401, {}).message).toBe("认证失败");
    expect(classify_openai_error(400, {}).message).toBe("请求错误");
  });

  it("connector.classifyError 也把响应头传进去", () => {
    const ce = new OpenAICompatAdapter().classifyError(503, { error: { message: "x", retry_after: 3 } }, {});
    expect(ce.retryAfter).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// normalize_reasoning
// ---------------------------------------------------------------------------

describe("normalize_reasoning", () => {
  it("reasoning → reasoning_content", () => {
    const chunk: Record<string, unknown> = { reasoning: "thinking..." };
    normalize_reasoning(chunk);
    expect(chunk.reasoning_content).toBe("thinking...");
  });

  it("已有 reasoning_content 不覆盖", () => {
    const chunk: Record<string, unknown> = { reasoning: "new", reasoning_content: "old" };
    normalize_reasoning(chunk);
    expect(chunk.reasoning_content).toBe("old");
  });

  it("无 reasoning 不变", () => {
    const chunk: Record<string, unknown> = { content: "hello" };
    normalize_reasoning(chunk);
    expect(chunk).toEqual({ content: "hello" });
  });
});

// ---------------------------------------------------------------------------
// OpenAICompatAdapter
// ---------------------------------------------------------------------------

describe("OpenAICompatAdapter", () => {
  it("vendorId 是 openai_compat", () => {
    const adapter = new OpenAICompatAdapter();
    expect(adapter.vendorId).toBe("openai_compat");
  });

  it("getToken 返回 api_key 作为 accessToken", async () => {
    const adapter = new OpenAICompatAdapter();
    const token = await adapter.getToken({ apiKey: "sk-as-one-test"});
    expect(token.accessToken).toBe("sk-as-one-test");
  });

  it("getToken 缺少 api_key 抛错", async () => {
    const adapter = new OpenAICompatAdapter();
    await expect(adapter.getToken({})).rejects.toThrow(UpstreamError);
  });

  it("decorateRequest 注入 Bearer <_REDACTED>", () => {
    const adapter = new OpenAICompatAdapter();
    const decorated = adapter.decorateRequest(
      { headers: {} },
      { accessToken: "my-token", expiresAt: Number.POSITIVE_INFINITY },
    );
    expect(decorated.headers["Authorization"]).toBe("Bearer my-token");
  });

  it("classifyError 200 + 非零 code → bad_request", () => {
    const adapter = new OpenAICompatAdapter();
    const err = adapter.classifyError(200, { code: 40001 });
    expect(err.kind).toBe("bad_request");
  });

  it("classifyError 401 → auth", () => {
    const adapter = new OpenAICompatAdapter();
    const err = adapter.classifyError(401, {});
    expect(err.kind).toBe("auth");
  });
});
