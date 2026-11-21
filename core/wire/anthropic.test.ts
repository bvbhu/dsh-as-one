/**
 * 通用 Anthropic Messages 转换器回归。
 *
 * 这里钉的是**方言开关**——拆出通用层之后，MiniMax 与自建渠道共用同一份实现，
 * 差异只能通过 `AnthropicQuirks` 表达。开关写错不会抛错，只会安静地发出一个
 * 上游不认的请求；所以每条开关都要有断言。
 */

import { describe, expect, it } from "vitest";
import {
  anthropicUsageOf,
  createAnthropicChunkTranslator,
  toAnthropicRequest,
  toAnthropicRequestFromBlocks,
  type AnthropicQuirks,
} from "./anthropic.js";

const MESSAGES = [
  { role: "user", content: "91 是质数吗" },
  { role: "assistant", content: "不是", reasoning_content: "先试 7:91=7×13。" },
  { role: "user", content: "谢谢" },
];

describe("toAnthropicRequest:默认方言（= MiniMax）", () => {
  const out = toAnthropicRequest({ messages: MESSAGES, max_tokens: 1000 }, "MiniMax-M3.1-Flash", "high");

  it("恒流式 + max_tokens 用客户端的值", () => {
    expect(out["stream"]).toBe(true);
    expect(out["max_tokens"]).toBe(1000);
  });

  it("思考强度落在 output_config.effort", () => {
    expect(out["output_config"]).toEqual({ effort: "high" });
    expect(out["thinking"]).toBeUndefined();
  });

  it("历史思考回放成 thinking 块（不校验签名的端点）", () => {
    const messages = out["messages"] as Array<Record<string, unknown>>;
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "先试 7:91=7×13。" },
        { type: "text", text: "不是" },
      ],
    });
  });
});

describe("toAnthropicRequest:方言开关", () => {
  it("requiresSignature=true → 不回放无签名思考（真 Anthropic 会 400）", () => {
    const quirks: AnthropicQuirks = { requiresSignature: true };
    const out = toAnthropicRequest({ messages: MESSAGES }, "claude-x", undefined, quirks);
    const messages = out["messages"] as Array<Record<string, unknown>>;
    expect(messages[1]).toEqual({ role: "assistant", content: [{ type: "text", text: "不是" }] });
  });

  it("systemShape=blocks → system 是文本块数组", () => {
    const out = toAnthropicRequest(
      { messages: [{ role: "system", content: "你是助手" }, { role: "user", content: "hi" }] },
      "claude-x",
      undefined,
      { systemShape: "blocks" },
    );
    expect(out["system"]).toEqual([{ type: "text", text: "你是助手" }]);
  });

  it("effortField=budget_tokens → 发 thinking.enabled，且 budget 小于 max_tokens", () => {
    const out = toAnthropicRequest({ messages: [{ role: "user", content: "hi" }], max_tokens: 4096 }, "claude-x", "high", {
      effortField: "budget_tokens",
    });
    const thinking = out["thinking"] as Record<string, unknown>;
    expect(thinking["type"]).toBe("enabled");
    const budget = thinking["budget_tokens"] as number;
    expect(budget).toBeGreaterThanOrEqual(1024);
    expect(budget).toBeLessThan(4096);
    expect(out["output_config"]).toBeUndefined();
  });

  it("effortField=none → 思考档位整个不出现", () => {
    const out = toAnthropicRequest({ messages: [{ role: "user", content: "hi" }] }, "claude-x", "high", {
      effortField: "none",
    });
    expect(out["output_config"]).toBeUndefined();
    expect(out["thinking"]).toBeUndefined();
  });

  it("streamOnly=false → stream 跟随客户端", () => {
    const out = toAnthropicRequest({ messages: [{ role: "user", content: "hi" }], stream: false }, "claude-x", undefined, {
      streamOnly: false,
    });
    expect(out["stream"]).toBe(false);
  });

  it("maxTokensDefault 可覆盖（Anthropic 必填字段的兜底）", () => {
    const out = toAnthropicRequest({ messages: [{ role: "user", content: "hi" }] }, "claude-x", undefined, {
      maxTokensDefault: 8192,
    });
    expect(out["max_tokens"]).toBe(8192);
  });
});

describe("toAnthropicRequestFromBlocks:DSH 块直落 Messages（省掉 chat 中间形状）", () => {
  const BLOCKS = {
    system: "你是助手",
    messages: [
      { role: "user" as const, content: [{ type: "text", text: "看图" }, { type: "image", url: "data:image/png;base64,AAA" }] },
      {
        role: "assistant" as const,
        content: [
          { type: "reasoning", text: "先看图。" },
          { type: "text", text: "好的" },
          { type: "tool-call", id: "call_1", name: "look", arguments: '{"x":1}' },
        ],
      },
      { role: "tool" as const, toolCallId: "call_1", content: [{ type: "text", text: "看完了" }] },
    ],
    tools: [{ name: "look", description: "看图", parameters: { type: "object", properties: {} } }],
  };

  it("system / user / assistant / tool 各自落到正确形状", () => {
    const out = toAnthropicRequestFromBlocks(BLOCKS, "MiniMax-M3.1-Flash", undefined, { requiresSignature: false });
    expect(out["system"]).toBe("你是助手");
    expect(out["stream"]).toBe(true);
    const messages = out["messages"] as Array<Record<string, unknown>>;
    expect(messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "看图" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } },
      ],
    });
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "先看图。" },
        { type: "text", text: "好的" },
        { type: "tool_use", id: "call_1", name: "look", input: { x: 1 } },
      ],
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call_1", content: "看完了" }],
    });
    expect(out["tools"]).toEqual([
      { name: "look", description: "看图", input_schema: { type: "object", properties: {} } },
    ]);
  });

  it("requiresSignature=true → 思考块不回放", () => {
    const out = toAnthropicRequestFromBlocks(BLOCKS, "claude-x", undefined, { requiresSignature: true });
    const messages = out["messages"] as Array<Record<string, unknown>>;
    const kinds = (messages[1]["content"] as Array<Record<string, unknown>>).map((b) => b["type"]);
    expect(kinds).toEqual(["text", "tool_use"]);
  });

  it("maxTokens 由网关钳制值传入（块路径没有 chat body 可读）", () => {
    const out = toAnthropicRequestFromBlocks(BLOCKS, "MiniMax-M3.1-Flash", undefined, undefined, 64000);
    expect(out["max_tokens"]).toBe(64000);
  });

  it("没有可用内容时兜一条空 user（Anthropic 不接受空数组）", () => {
    const out = toAnthropicRequestFromBlocks({ messages: [] }, "MiniMax-M3.1-Flash");
    expect(out["messages"]).toEqual([{ role: "user", content: [{ type: "text", text: "" }] }]);
  });
});

describe("响应方向:usage 与 stop_reason", () => {
  const META = { completionId: "chatcmpl-t", created: 1_700_000_000, model: "claude-x" };

  it("usage 带 Anthropic 缓存两格（D1）", () => {
    const u = anthropicUsageOf({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 30, cache_creation_input_tokens: 2 });
    expect(u).toMatchObject({
      prompt_tokens: 42,
      completion_tokens: 5,
      total_tokens: 47,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 2,
    });
  });

  it("tool_use / max_tokens / 其它都映射成 OpenAI 的 finish_reason", () => {
    const tr = createAnthropicChunkTranslator(META);
    const finish = (stop: string) => {
      const out = tr.handle({ type: "message_delta", delta: { stop_reason: stop }, usage: {} });
      return (out[0]["choices"] as Array<Record<string, unknown>>)[0]["finish_reason"];
    };
    expect(finish("tool_use")).toBe("tool_calls");
    expect(finish("max_tokens")).toBe("length");
    expect(finish("end_turn")).toBe("stop");
  });
});
