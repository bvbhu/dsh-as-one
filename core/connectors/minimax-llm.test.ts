/**
 * MiniMax 方言转换回归。
 *
 * 钉两件事:
 * 1. **请求**必须转成 Anthropic Messages 的形状 —— 上游对不认识的 body 键直接
 *    400,所以「多传一个字段」和「少传 max_tokens」一样致命。
 * 2. **流帧**必须转成标准 OpenAI chunk —— 网关的记账/日志只认 OpenAI 形状,
 *    少一个 `finish_reason` 或把 usage 藏在 Anthropic 字段里,统计就是空的。
 */
import { describe, expect, it } from "vitest";
import {
  anthropicErrorOf,
  anthropicUsageOf,
  createAnthropicChunkTranslator,
  toAnthropicRequest,
} from "./minimax-llm.js";

const META = { completionId: "chatcmpl-test", created: 1_700_000_000, model: "minimax-m3.1-flash" };

describe("toAnthropicRequest:OpenAI → Anthropic Messages", () => {
  it("system 抽到顶层、user/assistant 转 content block、恒 stream:true", () => {
    const out = toAnthropicRequest(
      {
        model: "ignored-by-this-layer",
        messages: [
          { role: "system", content: "你是助手" },
          { role: "user", content: "你好" },
          { role: "assistant", content: "在" },
        ],
        stream: false,
      },
      "MiniMax-M3.1-Flash",
    );

    expect(out["model"]).toBe("MiniMax-M3.1-Flash");
    expect(out["system"]).toBe("你是助手");
    expect(out["stream"]).toBe(true); // 客户端传 false 也强制流式
    expect(out["messages"]).toEqual([
      { role: "user", content: [{ type: "text", text: "你好" }] },
      { role: "assistant", content: [{ type: "text", text: "在" }] },
    ]);
  });

  it("max_tokens 缺失时补 4096(Anthropic 必填,不补会 400)", () => {
    const out = toAnthropicRequest({ messages: [{ role: "user", content: "hi" }] }, "MiniMax-M3");
    expect(out["max_tokens"]).toBe(4096);
  });

  it("tool 结果转 tool_result,tools 转 input_schema", () => {
    const out = toAnthropicRequest(
      {
        messages: [
          { role: "user", content: "查天气" },
          {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"北京"}' } }],
          },
          { role: "tool", tool_call_id: "call_1", content: "晴" },
        ],
        tools: [
          {
            type: "function",
            function: { name: "get_weather", description: "查天气", parameters: { type: "object", properties: { city: { type: "string" } } } },
          },
        ],
        tool_choice: "required",
      },
      "MiniMax-M3.1-Flash",
    );

    const messages = out["messages"] as Array<Record<string, unknown>>;
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [{ type: "tool_use", id: "call_1", name: "get_weather", input: { city: "北京" } }],
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call_1", content: "晴" }],
    });
    expect(out["tools"]).toEqual([
      {
        name: "get_weather",
        description: "查天气",
        input_schema: { type: "object", properties: { city: { type: "string" } } },
      },
    ]);
    expect(out["tool_choice"]).toEqual({ type: "any" });
  });

  it("空 messages 补一条空 user(Anthropic 不接受空数组)", () => {
    const out = toAnthropicRequest({ messages: [] }, "MiniMax-M3");
    expect((out["messages"] as unknown[]).length).toBe(1);
  });

  it("stop 字符串转 stop_sequences 数组", () => {
    const out = toAnthropicRequest({ messages: [{ role: "user", content: "hi" }], stop: "END" }, "MiniMax-M3");
    expect(out["stop_sequences"]).toEqual(["END"]);
  });
});

describe("anthropicUsageOf:缓存 token 必须并回 prompt", () => {
  it("prompt = input + cache_read + cache_creation,cached 另拆", () => {
    const u = anthropicUsageOf({
      input_tokens: 92,
      output_tokens: 64,
      cache_read_input_tokens: 128,
      cache_creation_input_tokens: 8,
    });
    expect(u.prompt_tokens).toBe(228);
    expect(u.completion_tokens).toBe(64);
    expect(u.total_tokens).toBe(292);
    expect(u.prompt_tokens_details.cached_tokens).toBe(136);
  });

  it("缺字段按 0,不产生 NaN", () => {
    const u = anthropicUsageOf(null);
    expect(u.prompt_tokens).toBe(0);
    expect(u.total_tokens).toBe(0);
  });
});

describe("createAnthropicChunkTranslator:Anthropic SSE → OpenAI chunk", () => {
  it("message_start 先发 role delta,text_delta 转 content", () => {
    const tr = createAnthropicChunkTranslator(META);
    const first = tr.handle({ type: "message_start", message: { usage: { input_tokens: 10 } } });
    expect(first).toHaveLength(1);
    expect((first[0]["choices"] as Array<Record<string, unknown>>)[0]["delta"]).toEqual({ role: "assistant" });

    const delta = tr.handle({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "你好" } });
    expect(delta).toHaveLength(1);
    const choice = (delta[0]["choices"] as Array<Record<string, unknown>>)[0];
    expect(choice["delta"]).toEqual({ content: "你好" });
    expect(choice["finish_reason"]).toBeNull();
    expect(delta[0]["model"]).toBe("minimax-m3.1-flash");
  });

  it("thinking_delta 转 reasoning_content", () => {
    const tr = createAnthropicChunkTranslator(META);
    const out = tr.handle({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "想一下" } });
    expect((out[0]["choices"] as Array<Record<string, unknown>>)[0]["delta"]).toEqual({ reasoning_content: "想一下" });
  });

  it("tool_use 分片累积,block_stop 时一次性吐 tool_calls", () => {
    const tr = createAnthropicChunkTranslator(META);
    tr.handle({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "call_9", name: "get_weather" } });
    tr.handle({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"city":' } });
    const closing = tr.handle({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"北京"}' } });
    expect(closing).toEqual([]);

    const stop = tr.handle({ type: "content_block_stop", index: 1 });
    expect(stop).toHaveLength(1);
    const delta = (stop[0]["choices"] as Array<Record<string, unknown>>)[0]["delta"] as Record<string, unknown>;
    expect(delta["tool_calls"]).toEqual([
      {
        index: 0,
        id: "call_9",
        type: "function",
        function: { name: "get_weather", arguments: '{"city":"北京"}' },
      },
    ]);
  });

  it("message_delta 带 finish_reason 与 usage,message_stop 收尾", () => {
    const tr = createAnthropicChunkTranslator(META);
    tr.handle({ type: "message_start", message: { usage: { input_tokens: 5 } } });
    const final = tr.handle({
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: { input_tokens: 5, output_tokens: 12, cache_read_input_tokens: 3 },
    });
    const choice = (final[0]["choices"] as Array<Record<string, unknown>>)[0];
    expect(choice["finish_reason"]).toBe("tool_calls");
    expect(final[0]["usage"]).toMatchObject({ prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 });

    expect(tr.finished).toBe(false);
    tr.handle({ type: "message_stop" });
    expect(tr.finished).toBe(true);
  });

  it("max_tokens → finish_reason=length", () => {
    const tr = createAnthropicChunkTranslator(META);
    const out = tr.handle({ type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: {} });
    expect((out[0]["choices"] as Array<Record<string, unknown>>)[0]["finish_reason"]).toBe("length");
  });
});

describe("anthropicErrorOf", () => {
  it("只有 type=error 才算,并取出 message", () => {
    expect(anthropicErrorOf({ type: "error", error: { message: "额度不足" } })).toBe("额度不足");
    expect(anthropicErrorOf({ type: "ping" })).toBeNull();
    expect(anthropicErrorOf("not an object")).toBeNull();
  });
});
