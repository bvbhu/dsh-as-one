/**
 * trae-wire 测试(纯函数,零网络)。
 */
import { describe, expect, it } from "vitest";

import {
  buildUpstreamBody,
  convertContent,
  convertHistoryToolCalls,
  convertMessages,
  decodedTraeEventsToChunks,
  decodeTraeEvent,
  identityFromExtra,
  normalizeToolCallDelta,
  normalizeTools,
  normalizeToolChoice,
  prepareTraeRequest,
  resolveChatUrl,
  TraeChunkBuilder,
  TraeSseParser,
} from "./trae-wire.js";
import { UpstreamError } from "./types.js";

describe("trae-wire: convertContent", () => {
  it("null/undefined → 空文本块", () => {
    expect(convertContent(null)).toEqual([{ type: "text", text: "" }]);
    expect(convertContent(undefined)).toEqual([{ type: "text", text: "" }]);
  });

  it("字符串 → 文本块", () => {
    expect(convertContent("hi")).toEqual([{ type: "text", text: "hi" }]);
  });

  it("非数组 → String 兜底", () => {
    expect(convertContent(42)).toEqual([{ type: "text", text: "42" }]);
  });

  it("多模态 part:文本 + 图片透传(只带 url)", () => {
    const out = convertContent([
      { type: "text", text: "look" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA", detail: "high" } },
    ]);
    expect(out).toEqual([
      { type: "text", text: "look" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });

  it("未知 part → 占位符;空结果 → 空文本块", () => {
    // url 字段会被当作图片 URL 透传(与 Nexus 一致)
    expect(convertContent([{ type: "audio", url: "x" }])).toEqual([
      { type: "image_url", image_url: { url: "x" } },
    ]);
    expect(convertContent([{ type: "audio", content: "x" }])).toEqual([
      { type: "text", text: "[图片未发送:trae 通道无法确认该模型支持图像输入]" },
    ]);
    expect(convertContent([])).toEqual([{ type: "text", text: "" }]);
  });

  it("多个未知 part → 占位符带 ×N", () => {
    expect(convertContent([1, 2])).toEqual([
      { type: "text", text: "[图片未发送:trae 通道无法确认该模型支持图像输入]×2" },
    ]);
  });
});

describe("trae-wire: convertHistoryToolCalls / convertMessages", () => {
  it("历史 tool_calls → trae 形状(空 name 跳过)", () => {
    expect(
      convertHistoryToolCalls([
        { id: "call_1", type: "function", function: { name: "f", arguments: "{}" } },
        { id: "call_2", type: "function", function: { arguments: "{}" } },
      ]),
    ).toEqual([
      { id: "call_1", type: "function", function_call: { name: "f", arguments: "{}" } },
    ]);
  });

  it("convertMessages:role/content/tool_call_id/name 搬运", () => {
    const out = convertMessages([
      { role: "system", content: "sys" },
      { role: "user", content: [{ type: "text", text: "u" }] },
      {
        role: "assistant",
        content: "a",
        tool_calls: [{ id: "c1", type: "function", function: { name: "g", arguments: "" } }],
      },
      { role: "tool", tool_call_id: "c1", content: "r", name: "g" },
    ]);
    expect(out).toEqual([
      { role: "system", content: [{ type: "text", text: "sys" }] },
      { role: "user", content: [{ type: "text", text: "u" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "a" }],
        tool_calls: [{ id: "c1", type: "function", function_call: { name: "g", arguments: "" } }],
      },
      { role: "tool", content: [{ type: "text", text: "r" }], tool_call_id: "c1", name: "g" },
    ]);
  });
});

describe("trae-wire: normalizeTools / normalizeToolChoice", () => {
  it("tools 空 → null;parameters 转 JSON 字符串", () => {
    expect(normalizeTools([])).toBeNull();
    expect(normalizeTools(null)).toBeNull();
    const out = normalizeTools([
      { type: "function", function: { name: "f", parameters: { type: "object" } } },
      { type: "function", function: { name: "g" } },
    ]);
    expect(out).toEqual([
      { type: "function", function: { name: "f", parameters: '{"type":"object"}' } },
      { type: "function", function: { name: "g" } },
    ]);
  });

  it("tool_choice:function 名剥离;无函数名 → null", () => {
    expect(normalizeToolChoice({ type: "function", function: { name: "f" } })).toBe("f");
    expect(normalizeToolChoice({ type: "function", function: { name: " f " } })).toBe("f");
    expect(normalizeToolChoice("auto")).toBeNull();
    expect(normalizeToolChoice({ type: "function", function: {} })).toBeNull();
    expect(normalizeToolChoice(null)).toBeNull();
  });
});

describe("trae-wire: buildUpstreamBody / prepareTraeRequest", () => {
  it("model 前缀剥离 + 字段齐全", () => {
    const body = buildUpstreamBody(
      "trae/deepseek-flash",
      [{ role: "user", content: "hi" }],
      { machine_id: "m1", device_id: "d1" },
      { max_tokens: 2048, tools: [], temperature: 0.7 },
      "req-1",
    );
    expect(body.model).toBe("deepseek-flash");
    expect(body.config_name).toBe("deepseek-flash");
    expect(body.model_name).toBe("deepseek-flash__dev");
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(2048);
    expect(body.temperature).toBe(0.7);
    expect(body.machine_id).toBe("m1");
    expect(body.device_id).toBe("d1");
    expect(body.request_id).toBe("req-1");
    expect(body.mode).toBe("FunctionCall");
    expect(body.package_type).toBe("stable_cn");
    expect(body.function).toBe("solo_work_lite");
  });

  it("max_tokens 缺省 → DEFAULT_MAX_TOKENS", () => {
    const body = buildUpstreamBody("m", [], { machine_id: "m", device_id: "d" }, {});
    expect(body.max_tokens).toBe(4096);
  });

  it("tools 非空 → body.tools;tool_choice 函数名 → body.tool_choice", () => {
    const body = buildUpstreamBody(
      "m",
      [],
      { machine_id: "m", device_id: "d" },
      {
        tools: [{ type: "function", function: { name: "f", parameters: { type: "object" } } }],
        tool_choice: { type: "function", function: { name: "f" } },
      },
    );
    const tools = body.tools as Array<{
      function: { name: string; parameters: string };
    }>;
    expect(tools[0].function.parameters).toBe('{"type":"object"}');
    expect(body.tool_choice).toBe("f");
  });

  it("resolveChatUrl:base_url 优先,去尾斜杠 + CHAT_PATH", () => {
    expect(resolveChatUrl("https://x.trae.cn/", "cn", {})).toBe(
      "https://x.trae.cn/api/agent/v3/llm_utils_chat",
    );
    expect(resolveChatUrl(undefined, "cn", { api_base: "https://extra" })).toBe(
      "https://extra/api/agent/v3/llm_utils_chat",
    );
  });

  it("identityFromExtra:机器/设备覆盖 + user_id 透传", () => {
    const id = identityFromExtra("key", { machine_id: "mx", device_id: "dx", user_id: "u1" });
    expect(id).toEqual({ machine_id: "mx", device_id: "dx", user_id: "u1" });
  });

  it("prepareTraeRequest:URL + body 齐备", () => {
    const { url, body } = prepareTraeRequest({
      req: { model: "trae/m", messages: [{ role: "user", content: "hi" }], stream: true },
      identity: { machine_id: "m", device_id: "d" },
      baseUrl: "https://trae-api-cn.mchost.guru",
      requestId: "r1",
    });
    expect(url).toBe("https://trae-api-cn.mchost.guru/api/agent/v3/llm_utils_chat");
    expect(body.request_id).toBe("r1");
  });
});

describe("trae-wire: TraeSseParser", () => {
  it("增量解析:event+data 成对,注释/空行忽略", () => {
    const parser = new TraeSseParser();
    const ev1 = parser.push("event: output\ndata: {\"response\":\"hi\"}\n\n");
    expect(ev1).toEqual([["output", '{"response":"hi"}']]);
    // 缺末尾空行 → 事件挂起,由 finish() 冲刷
    const ev2 = parser.push(": keepalive\n\nevent: done\ndata: {\"finish_reason\":\"stop\"}\n");
    expect(ev2).toEqual([]);
    expect(parser.finish()).toEqual([["done", '{"finish_reason":"stop"}']]);
  });

  it("TCP 分片跨行也能拼出事件", () => {
    const parser = new TraeSseParser();
    expect(parser.push("event: out")).toEqual([]);
    expect(parser.push('put\ndata: {"respo')).toEqual([]);
    expect(parser.push('nse":"a"}\n\n')).toEqual([["output", '{"response":"a"}']]);
  });

  it("data 多行 join(\\n)", () => {
    const parser = new TraeSseParser();
    expect(parser.push("event: token_usage\ndata: {\"a\":1}\ndata: {\"b\":2}\n\n")).toEqual([
      ["token_usage", '{"a":1}\n{"b":2}'],
    ]);
  });
});

describe("trae-wire: decodeTraeEvent", () => {
  it("[DONE] → done(null finish)", () => {
    expect(decodeTraeEvent("", "[DONE]")).toEqual({ kind: "done", finish_reason: null });
  });

  it("畸形 JSON / 非对象 → unknown", () => {
    expect(decodeTraeEvent("output", "{bad")).toEqual({ kind: "unknown", event: "output" });
    expect(decodeTraeEvent("output", "[1,2]")).toEqual({ kind: "unknown", event: "output" });
  });

  it("queue / progress / usage", () => {
    expect(decodeTraeEvent("request_wait_in_queue", '{"position":3}')).toEqual({
      kind: "queue",
      position: 3,
    });
    expect(decodeTraeEvent("progress_notice", '{"step":1}')).toEqual({
      kind: "progress",
      notice: { step: 1 },
    });
    expect(decodeTraeEvent("token_usage", '{"prompt_tokens":10,"completion_tokens":5}')).toEqual({
      kind: "usage",
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  });

  it("done 事件与 finish_reason 字符串(不含 response)", () => {
    expect(decodeTraeEvent("done", '{"finish_reason":"stop"}')).toEqual({
      kind: "done",
      finish_reason: "stop",
    });
    expect(decodeTraeEvent("output", '{"finish_reason":"stop"}')).toEqual({
      kind: "done",
      finish_reason: "stop",
    });
  });

  it("error 事件 / code>=4000", () => {
    expect(decodeTraeEvent("error", '{"code":1005,"message":"quota"}')).toEqual({
      kind: "error",
      code: 1005,
      message: "quota",
      extra: undefined,
    });
    expect(decodeTraeEvent("output", '{"code":4001,"message":"cfg"}')).toEqual({
      kind: "error",
      code: 4001,
      message: "cfg",
      extra: undefined,
    });
  });

  it("output 事件 → delta(text/reasoning/tool_calls)", () => {
    expect(
      decodeTraeEvent("output", '{"response":"a","reasoning_content":"r","tool_calls":[{"id":"c"}]}'),
    ).toEqual({
      kind: "delta",
      text: "a",
      reasoning: "r",
      tool_calls: [{ id: "c" }],
    });
  });
});

describe("trae-wire: normalizeToolCallDelta", () => {
  it("函数名首帧给,arguments 续帧拼;id 缺省派生", () => {
    const ids = new Map<number, string>();
    const first = normalizeToolCallDelta(
      { index: 0, id: "call_abc", function: { name: "f", arguments: "{" } },
      0,
      ids,
      "pfx",
    );
    expect(first).toEqual({
      index: 0,
      id: "call_abc",
      type: "function",
      function: { name: "f", arguments: "{" },
    });
    const second = normalizeToolCallDelta({ index: 0, function: { arguments: "}" } }, 0, ids, "pfx");
    expect(second!.function).toEqual({ arguments: "}" });
    expect(second!.id).toBe("call_abc");
  });

  it("无 id → call_{id_prefix}_{index}", () => {
    const ids = new Map<number, string>();
    const out = normalizeToolCallDelta({ function: { name: "f" } }, 0, ids, "pfx");
    expect(out!.id).toBe("call_pfx_0");
    expect(ids.get(0)).toBe("call_pfx_0");
  });

  it("非对象 / 函数名缺失 → 仅 arguments", () => {
    expect(normalizeToolCallDelta(null, 0, new Map(), "p")).toBeNull();
    expect(normalizeToolCallDelta({ index: 0 }, 0, new Map(), "p")).toEqual({
      index: 0,
      id: "call_p_0",
      type: "function",
      function: { arguments: "" },
    });
  });
});

describe("trae-wire: TraeChunkBuilder / decodedTraeEventsToChunks", () => {
  it("delta 流:首块带 role,后续不带", () => {
    const chunks = decodedTraeEventsToChunks(
      [
        { kind: "delta", text: "a" },
        { kind: "delta", text: "b" },
      ],
      { completionId: "chatcmpl-x", created: 1, model: "m" },
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].choices[0].delta).toEqual({ role: "assistant", content: "a" });
    expect(chunks[1].choices[0].delta).toEqual({ content: "b" });
    expect(chunks[0].object).toBe("chat.completion.chunk");
  });

  it("空事件不产块;reasoning 单独成段", () => {
    const chunks = decodedTraeEventsToChunks(
      [{ kind: "queue", position: 1 }, { kind: "delta", reasoning: "r" }],
      { completionId: "c", created: 1, model: "m" },
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].choices[0].delta).toEqual({ role: "assistant", reasoning_content: "r" });
  });

  it("done 收尾:usage 挂尾块 + finish_reason 覆盖(done 后 synthesizeEof 不再补块)", () => {
    const chunks = decodedTraeEventsToChunks(
      [
        { kind: "delta", text: "a" },
        { kind: "usage", usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } },
        { kind: "done", finish_reason: "stop" },
      ],
      { completionId: "chatcmpl-abc", created: 7, model: "m", synthesizeEof: true },
    );
    expect(chunks).toHaveLength(2);
    const tail = chunks[1];
    expect(tail.choices[0].finish_reason).toBe("stop");
    expect(tail.usage).toEqual({ prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 });
  });

  it("synthesizeEof 只在流未以 done 结束时补收尾块", () => {
    const chunks = decodedTraeEventsToChunks(
      [{ kind: "delta", text: "a" }],
      { completionId: "chatcmpl-xyz", created: 7, model: "m", synthesizeEof: true },
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[1].choices[0].finish_reason).toBe("stop");
    expect(chunks[1].choices[0].delta).toEqual({});
  });

  it("saw_tool_calls 且 stop → 收尾 tool_calls", () => {
    const chunks = decodedTraeEventsToChunks(
      [
        { kind: "delta", tool_calls: [{ id: "c1", function: { name: "f", arguments: "{}" } }] },
        { kind: "done", finish_reason: "stop" },
      ],
      { completionId: "chatcmpl-abcd1234", created: 1, model: "m" },
    );
    const delta = chunks[0].choices[0].delta as Record<string, unknown>;
    expect((delta.tool_calls as Array<Record<string, unknown>>)[0].function).toEqual({
      name: "f",
      arguments: "{}",
    });
    expect(chunks[1].choices[0].finish_reason).toBe("tool_calls");
  });

  it("done 后不再产块", () => {
    const builder = new TraeChunkBuilder("c", 1, "m");
    builder.feed([{ kind: "done", finish_reason: "stop" }]);
    expect(builder.feed([{ kind: "delta", text: "x" }])).toEqual([]);
    expect(builder.finish()).toEqual([]);
  });

  it("error 事件 → solo_error 分类(code 1005 → rate_limit 429)", () => {
    const builder = new TraeChunkBuilder("c", 1, "m");
    expect(() =>
      builder.feed([{ kind: "error", code: 1005, message: "quota" }]),
    ).toThrowError(UpstreamError);
    try {
      builder.feed([{ kind: "error", code: 1005, message: "quota" }]);
    } catch (e) {
      const err = e as UpstreamError;
      expect(err.kind).toBe("rate_limit");
      expect(err.httpStatus).toBe(429);
      expect(err.retryable).toBe(true);
    }
  });
});
