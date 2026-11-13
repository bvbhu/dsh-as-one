/**
 * workbuddy-wire 测试(纯函数,零网络)。
 */
import { describe, expect, it } from "vitest";

import {
  buildWorkbuddyBody,
  filterWorkbuddyChunk,
  parseWorkbuddySseData,
  resolveWorkbuddyChatUrl,
  XmlToolCallCopyFilter,
} from "./workbuddy-wire.js";

describe("workbuddy-wire: parseWorkbuddySseData", () => {
  it("data: 行取载荷;非 data 行 → null", () => {
    expect(parseWorkbuddySseData('data: {"a":1}')).toBe('{"a":1}');
    expect(parseWorkbuddySseData("event: x")).toBeNull();
    expect(parseWorkbuddySseData(": keepalive")).toBeNull();
  });

  it("空 / 注释心跳 / [DONE] → null", () => {
    expect(parseWorkbuddySseData("data:")).toBeNull();
    expect(parseWorkbuddySseData("data: ")).toBeNull();
    expect(parseWorkbuddySseData("data: : heartbeat")).toBeNull();
    expect(parseWorkbuddySseData("data: [DONE]")).toBeNull();
  });

  it("前导空白容忍", () => {
    expect(parseWorkbuddySseData('  data: {"a":1}  ')).toBe('{"a":1}');
  });
});

describe("workbuddy-wire: buildWorkbuddyBody", () => {
  it("stream + stream_options 恒在;max_completion_tokens → max_tokens", () => {
    const body = buildWorkbuddyBody({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      max_completion_tokens: 512,
    });
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.max_tokens).toBe(512);
    expect(body.model).toBe("m");
  });

  it("max_tokens 优先;temperature/top_p/stop/tools/tool_choice/reasoning_effort 透传", () => {
    const body = buildWorkbuddyBody({
      model: "m",
      messages: [],
      stream: true,
      max_tokens: 100,
      temperature: 0.2,
      top_p: 0.9,
      stop: ["\n"],
      tools: [{ type: "function", function: { name: "f" } }],
      tool_choice: "auto",
      reasoning_effort: "high",
    });
    expect(body.max_tokens).toBe(100);
    expect(body.temperature).toBe(0.2);
    expect(body.top_p).toBe(0.9);
    expect(body.stop).toEqual(["\n"]);
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe("auto");
    expect(body.reasoning_effort).toBe("high");
  });

  it("非有限数值不写", () => {
    const body = buildWorkbuddyBody({
      model: "m",
      messages: [],
      stream: true,
      temperature: NaN,
      max_tokens: undefined,
    });
    expect("temperature" in body).toBe(false);
    expect("max_tokens" in body).toBe(false);
  });
});

describe("workbuddy-wire: resolveWorkbuddyChatUrl", () => {
  it("base_url 优先(去尾斜杠)+ /v2/chat/completions", () => {
    expect(resolveWorkbuddyChatUrl("https://www.codebuddy.cn/", "cn")).toBe(
      "https://www.codebuddy.cn/v2/chat/completions",
    );
  });

  it("无 base_url → 区域默认", () => {
    expect(resolveWorkbuddyChatUrl(undefined, "cn")).toBe(
      "https://copilot.tencent.com/v2/chat/completions",
    );
    expect(resolveWorkbuddyChatUrl(undefined, "global")).toBe(
      "https://www.workbuddy.ai/v2/chat/completions",
    );
    expect(resolveWorkbuddyChatUrl(undefined, undefined)).toMatch(/chat\/completions$/);
  });
});

describe("workbuddy-wire: XmlToolCallCopyFilter", () => {
  it("未 seen_structured 时副本原样外发(不误伤)", () => {
    const flt = new XmlToolCallCopyFilter();
    const seg = '<tool_call><function= f>args</tool_call>';
    expect(flt.feed(seg)).toBe(seg);
    expect(flt.finish()).toBe("");
  });

  it("seen_structured 后整段 XML 副本被丢弃", () => {
    const flt = new XmlToolCallCopyFilter();
    flt.seenStructured = true;
    const seg = '<tool_call><function= f>args</tool_call>';
    expect(flt.feed(seg)).toBe("");
  });

  it("跨帧缓冲:seen 后开启 → 闭合丢弃;未 seen → 原样", () => {
    // seen: <tool_call> 先到,</tool_call> 后到 → 丢弃
    const flt1 = new XmlToolCallCopyFilter();
    flt1.seenStructured = true;
    expect(flt1.feed("<tool_call><function= f>")).toBe("");
    expect(flt1.feed("args</tool_call>")).toBe("");
    // 未 seen:跨帧原样
    const flt2 = new XmlToolCallCopyFilter();
    expect(flt2.feed("<tool_call><function= f>")).toBe("");
    expect(flt2.feed("args</tool_call>")).toBe("<tool_call><function= f>args</tool_call>");
  });

  it("行首 <tool_call> 匹配(含前导空白/换行)", () => {
    const flt = new XmlToolCallCopyFilter();
    flt.seenStructured = true;
    expect(flt.feed("\n  <tool_call><function= f>a</tool_call>")).toBe("");
  });

  it("seen_structured 后任意位置 <function= 也触发缓冲", () => {
    const flt = new XmlToolCallCopyFilter();
    flt.seenStructured = true;
    expect(flt.feed("x<function= f>")).toBe("x");
    expect(flt.feed("args</tool_call>")).toBe("");
  });

  it("流结束未闭合缓冲 → 丢弃", () => {
    const flt = new XmlToolCallCopyFilter();
    flt.seenStructured = true;
    expect(flt.feed("<tool_call><function= f>")).toBe("");
    expect(flt.finish()).toBe("");
    // 未 seen:同样丢(截断副本)
    const flt2 = new XmlToolCallCopyFilter();
    expect(flt2.feed("<tool_call><function= f>")).toBe("");
    expect(flt2.finish()).toBe("");
  });

  it("同帧开合 + 后续文本继续外发", () => {
    const flt = new XmlToolCallCopyFilter();
    flt.seenStructured = true;
    expect(flt.feed("a<tool_call><function= f>b</tool_call>c")).toBe("ac");
  });
});

describe("workbuddy-wire: filterWorkbuddyChunk", () => {
  it("choices 空 → 原样(usage-only/收尾块)", () => {
    const chunk = { choices: [], usage: { total_tokens: 3 } };
    expect(filterWorkbuddyChunk(chunk, new XmlToolCallCopyFilter())).toBe(chunk);
  });

  it("tool_calls 分片置 seenStructured", () => {
    const flt = new XmlToolCallCopyFilter();
    const chunk = {
      choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "f" } }] } }],
    };
    filterWorkbuddyChunk(chunk, flt);
    expect(flt.seenStructured).toBe(true);
  });

  it("副本被滤掉后摘掉 content 键", () => {
    const flt = new XmlToolCallCopyFilter();
    flt.seenStructured = true;
    const chunk = {
      choices: [{ delta: { content: "<tool_call><function= f>a</tool_call>" } }],
    };
    const out = filterWorkbuddyChunk(chunk, flt) as {
      choices: Array<{ delta: Record<string, unknown> }>;
    };
    expect(out.choices[0].delta).toEqual({});
    expect("content" in out.choices[0].delta).toBe(false);
  });

  it("正常文本外发;非字符串 content 不动", () => {
    const flt = new XmlToolCallCopyFilter();
    const chunk = { choices: [{ delta: { content: "hi" } }] };
    const out = filterWorkbuddyChunk(chunk, flt) as {
      choices: Array<{ delta: Record<string, unknown> }>;
    };
    expect(out.choices[0].delta.content).toBe("hi");

    const chunk2 = { choices: [{ delta: { content: 42 } }] };
    const out2 = filterWorkbuddyChunk(chunk2, flt) as {
      choices: Array<{ delta: Record<string, unknown> }>;
    };
    expect(out2.choices[0].delta.content).toBe(42);
  });
});
