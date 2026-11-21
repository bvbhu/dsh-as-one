/**
 * 通用 Anthropic Messages 连接器回归（自建渠道）。
 *
 * 钉三件事：
 * 1. base URL 两种写法都能拼出 `/v1/messages`；
 * 2. quirks 只认白名单键与白名单取值（写错丢开关，不让整条渠道失效）；
 * 3. 错误归类与官方语义一致（401/403 → auth、429 → rate_limit、529/5xx → upstream）。
 */

import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_VERSION,
  AnthropicAdapter,
  anthropicMessagesUrl,
  anthropicQuirksFrom,
} from "./anthropic.js";

describe("anthropicMessagesUrl", () => {
  it("写到 /v1 的 base 只补 /messages", () => {
    expect(anthropicMessagesUrl("https://api.anthropic.com/v1")).toBe("https://api.anthropic.com/v1/messages");
    expect(anthropicMessagesUrl("https://api.anthropic.com/v1/")).toBe("https://api.anthropic.com/v1/messages");
  });

  it("只写 host 的 base 补 /v1/messages", () => {
    expect(anthropicMessagesUrl("https://gw.example")).toBe("https://gw.example/v1/messages");
    expect(anthropicMessagesUrl("https://gw.example/")).toBe("https://gw.example/v1/messages");
  });

  it("空 base 返回空串（调用方据此当场报错，而不是拼出无效 URL）", () => {
    expect(anthropicMessagesUrl("")).toBe("");
    expect(anthropicMessagesUrl("   ")).toBe("");
  });
});

describe("anthropicQuirksFrom", () => {
  it("接受对象与 JSON 串", () => {
    expect(anthropicQuirksFrom({ effortField: "output_config" })).toEqual({ effortField: "output_config" });
    expect(anthropicQuirksFrom('{"requiresSignature":false}')).toEqual({ requiresSignature: false });
  });

  it("坏 JSON / 非对象 → 空开关（不抛）", () => {
    expect(anthropicQuirksFrom("{not json")).toEqual({});
    expect(anthropicQuirksFrom(null)).toEqual({});
    expect(anthropicQuirksFrom([])).toEqual({});
  });

  it("未知键与非法取值被丢弃，合法项保留", () => {
    expect(
      anthropicQuirksFrom({
        effortField: "nonsense",
        systemShape: "blocks",
        maxTokensDefault: -1,
        streamOnly: "yes",
        surprise: true,
      }),
    ).toEqual({ systemShape: "blocks" });
  });

  it("maxTokensDefault 只接受正数并取整", () => {
    expect(anthropicQuirksFrom({ maxTokensDefault: 8192.9 })).toEqual({ maxTokensDefault: 8192 });
  });
});

describe("AnthropicAdapter", () => {
  const adapter = new AnthropicAdapter();

  it("vendorId 是 anthropic（与 protocol 名一致）", () => {
    expect(adapter.vendorId).toBe("anthropic");
  });

  it("无 key → auth 错误（不重试）", async () => {
    await expect(adapter.getToken({ apiKey: "" } as never)).rejects.toMatchObject({ kind: "auth", retryable: false });
  });

  it("有 key → 同时发 x-api-key 与 Bearer，并带 anthropic-version", async () => {
    const token = await adapter.getToken({ apiKey: "sk-test" } as never);
    const out = adapter.decorateRequest({ headers: {} } as never, token);
    expect(out.headers["x-api-key"]).toBe("sk-test");
    expect(out.headers["Authorization"]).toBe("Bearer sk-test");
    expect(out.headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
  });

  it("错误归类：401/auth、429/rate_limit、529/upstream、400/bad_request", () => {
    expect(adapter.classifyError(401, null).kind).toBe("auth");
    expect(adapter.classifyError(403, null).kind).toBe("auth");
    const limited = adapter.classifyError(429, { retry_after: 7 });
    expect(limited.kind).toBe("rate_limit");
    expect(limited.retryAfter).toBe(7);
    expect(adapter.classifyError(529, null).kind).toBe("upstream");
    const bad = adapter.classifyError(400, { type: "error", error: { message: "max_tokens required" } });
    expect(bad.kind).toBe("bad_request");
    expect(bad.message).toContain("max_tokens required");
  });
});
