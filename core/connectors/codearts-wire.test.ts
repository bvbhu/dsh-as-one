/**
 * codearts-wire 的对照测试 —— 纯函数、零网络。
 *
 * 断言对象是「上游报文 → 我们的 OpenAI chunk」这条链，重点是两处最容易回退的地方：
 * 1. 累计全文（`glm-5.3` 的 `text` 每帧全量）必须还原成增量，且同一帧喂两次幂等；
 * 2. `body.model` 必须与调用方传入的模型名逐字一致（尾随空格也要保留）。
 */
import { describe, expect, it } from "vitest";

import {
  buildCodeartsBody,
  codeartsBusinessError,
  codeartsErrorStatus,
  createCodeartsTranslator,
  isCodeartsStreamOnlyModel,
  parseCodeartsModels,
} from "./codearts-wire.js";

type Chunk = Record<string, unknown>;

/** 取 chunk 的 choices[0].delta（没有 choices 时返回空对象）。 */
function deltaOf(chunk: Chunk): Record<string, unknown> {
  const choices = chunk["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return {};
  const first = choices[0];
  if (typeof first !== "object" || first === null) return {};
  const delta = (first as Record<string, unknown>)["delta"];
  return typeof delta === "object" && delta !== null ? (delta as Record<string, unknown>) : {};
}

/** 取 chunk 的 choices[0].finish_reason。 */
function finishOf(chunk: Chunk): unknown {
  const choices = chunk["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return undefined;
  return (first as Record<string, unknown>)["finish_reason"];
}

/** 把一批 chunk 的正文拼起来（校验增量的唯一可靠方式）。 */
function joinContent(chunks: Chunk[]): string {
  let out = "";
  for (const chunk of chunks) {
    const content = deltaOf(chunk)["content"];
    if (typeof content === "string") out += content;
  }
  return out;
}

function joinReasoning(chunks: Chunk[]): string {
  let out = "";
  for (const chunk of chunks) {
    const reasoning = deltaOf(chunk)["reasoning_content"];
    if (typeof reasoning === "string") out += reasoning;
  }
  return out;
}

function contentDeltas(chunks: Chunk[]): string[] {
  const out: string[] = [];
  for (const chunk of chunks) {
    const content = deltaOf(chunk)["content"];
    if (typeof content === "string") out.push(content);
  }
  return out;
}

function reasoningDeltas(chunks: Chunk[]): string[] {
  const out: string[] = [];
  for (const chunk of chunks) {
    const reasoning = deltaOf(chunk)["reasoning_content"];
    if (typeof reasoning === "string") out.push(reasoning);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 模型清单
// ---------------------------------------------------------------------------

describe("codearts-wire: parseCodeartsModels", () => {
  it("解析 {data:[...]}，容忍 credit 与 {model, display_name} 两种条目", () => {
    const models = parseCodeartsModels({
      data: [
        { id: "glm-5.3", name: "GLM-5.3", enable: true, credit: [{ ratio_display: "1" }] },
        { id: "deepseek-v3.2", name: "DeepSeek V3.2" },
        { id: "deepseek-v3.2", name: "重复条目" },
        { model: "qwen3-coder", display_name: "Qwen3 Coder", enable: false },
        { id: "" },
      ],
    });
    expect(models).toEqual([
      { id: "glm-5.3", name: "GLM-5.3", enabled: true, streamOnly: true },
      { id: "deepseek-v3.2", name: "DeepSeek V3.2", enabled: true },
      { id: "qwen3-coder", name: "Qwen3 Coder", enabled: false },
    ]);
  });

  it("兼容 {models:[...]} 与裸数组", () => {
    expect(parseCodeartsModels({ models: [{ model: "b", display_name: "B" }] })).toEqual([
      // qwen3-coder 之前没有 display_name 时回落 id
      { id: "b", name: "B", enabled: true },
    ]);
    expect(parseCodeartsModels([{ id: "a", enable: false }])).toEqual([
      { id: "a", name: "a", enabled: false },
    ]);
  });

  it("容忍 data 里再套一层 models，并忽略非对象行", () => {
    expect(parseCodeartsModels({ data: { models: [{ id: "x", name: "" }] } })).toEqual([
      { id: "x", name: "x", enabled: true },
    ]);
    expect(parseCodeartsModels({ data: [null, 42, "skip", { id: "y" }] })).toEqual([
      { id: "y", name: "y", enabled: true },
    ]);
  });

  it("非预期载荷一律空清单（不抛）", () => {
    expect(parseCodeartsModels(null)).toEqual([]);
    expect(parseCodeartsModels(undefined)).toEqual([]);
    expect(parseCodeartsModels("nope")).toEqual([]);
    expect(parseCodeartsModels({ data: [] })).toEqual([]);
    expect(parseCodeartsModels({ choices: [] })).toEqual([]);
  });

  it("enabled 缺省 true，显式 enable:false 才关", () => {
    expect(parseCodeartsModels([{ id: "ok" }])[0]?.enabled).toBe(true);
    expect(parseCodeartsModels([{ id: "off", enable: false }])[0]?.enabled).toBe(false);
  });

  it("标记已知只能流式的模型", () => {
    const models = parseCodeartsModels([{ id: "glm-5.3" }, { id: "glm-4.6" }]);
    expect(models[0]?.streamOnly).toBe(true);
    expect(models[1]?.streamOnly).toBeUndefined();
  });
});

describe("codearts-wire: isCodeartsStreamOnlyModel", () => {
  it("glm-5.3（大小写不敏感）只能流式", () => {
    expect(isCodeartsStreamOnlyModel("glm-5.3")).toBe(true);
    expect(isCodeartsStreamOnlyModel("GLM-5.3")).toBe(true);
    expect(isCodeartsStreamOnlyModel("glm-4.6")).toBe(false);
    expect(isCodeartsStreamOnlyModel("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 请求体
// ---------------------------------------------------------------------------

describe("codearts-wire: buildCodeartsBody", () => {
  it("model 逐字使用（尾随空格保留），且不发 maas_type", () => {
    const messages = [{ role: "user", content: "hi" }];
    const body = buildCodeartsBody({ model: "glm-5.3 ", messages, stream: true }, "glm-5.3 ");
    expect(body).toEqual({ model: "glm-5.3 ", messages, stream: true });
    expect(body["maas_type"]).toBeUndefined();
    expect(body["model"]).toBe("glm-5.3 ");
    // messages 原样引用，不做深拷贝改写（改消息体口径属于另一层）
    expect(body["messages"]).toBe(messages);
  });

  it("body.model 只认与请求头同源的第二个参数（req.model 不参与）", () => {
    const body = buildCodeartsBody({ model: "glm-5.3", messages: [], stream: true }, "glm-5.3 ");
    expect(body["model"]).toBe("glm-5.3 ");
  });

  it("stream 原样透传 false", () => {
    expect(buildCodeartsBody({ model: "m", messages: [], stream: false }, "m")["stream"]).toBe(false);
  });

  it("可选字段全给时按原样带上（含 temperature:0）", () => {
    const tools = [{ type: "function", function: { name: "f", parameters: {} } }];
    const body = buildCodeartsBody(
      {
        model: "m",
        messages: [],
        stream: true,
        temperature: 0,
        max_tokens: 1024,
        top_p: 0.9,
        stop: ["\n\n"],
        tools,
        tool_choice: "auto",
        response_format: { type: "json_object" },
      },
      "m",
    );
    expect(body).toEqual({
      model: "m",
      messages: [],
      stream: true,
      temperature: 0,
      max_tokens: 1024,
      top_p: 0.9,
      stop: ["\n\n"],
      tools,
      tool_choice: "auto",
      response_format: { type: "json_object" },
    });
  });

  it("可选字段未给时不出现（不补默认值）", () => {
    const body = buildCodeartsBody({ model: "m", messages: [], stream: true }, "m");
    expect(Object.keys(body)).toEqual(["model", "messages", "stream"]);
  });
});

// ---------------------------------------------------------------------------
// 增量翻译：OpenAI delta 形态
// ---------------------------------------------------------------------------

describe("codearts-wire: 增量翻译（OpenAI delta 形态）", () => {
  it("delta.content 直接透传，首个有内容的 chunk 带 role:assistant", () => {
    const t = createCodeartsTranslator({ model: "as-one/codearts-glm" });
    const chunks = [
      ...t.push({ choices: [{ index: 0, delta: { content: "Hel" }, finish_reason: null }] }),
      ...t.push({ choices: [{ index: 0, delta: { content: "lo" }, finish_reason: null }] }),
    ];
    expect(contentDeltas(chunks)).toEqual(["Hel", "lo"]);
    expect(deltaOf(chunks[0]!)).toEqual({ content: "Hel", role: "assistant" });
    expect(deltaOf(chunks[1]!)).toEqual({ content: "lo" });
    expect(chunks[0]!["object"]).toBe("chat.completion.chunk");
    expect(chunks[0]!["model"]).toBe("as-one/codearts-glm");
    expect(chunks[0]!["id"]).toBe(chunks[1]!["id"]);
  });

  it("空 delta（content 为 null / 空串）不产生 chunk", () => {
    const t = createCodeartsTranslator();
    expect(t.push({ choices: [{ index: 0, delta: { content: null } }] })).toEqual([]);
    expect(t.push({ choices: [{ index: 0, delta: { content: "" } }] })).toEqual([]);
  });

  it("finish_reason 透传，且 finish() 不再补 stop", () => {
    const t = createCodeartsTranslator();
    const first = t.push({ choices: [{ index: 0, delta: { content: "ok" } }] });
    const end = t.push({ choices: [{ index: 0, delta: {}, finish_reason: "length" }] });
    expect(finishOf(end[0]!)).toBe("length");
    expect(t.finish()).toEqual([]);
    expect(joinContent([...first, ...end])).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// 增量翻译：累计全文形态（glm-5.3 怪癖）
// ---------------------------------------------------------------------------

describe("codearts-wire: 累计文本还原增量", () => {
  it("连续三条累计文本 → 只发新增部分", () => {
    const t = createCodeartsTranslator();
    const chunks = [
      ...t.push({ text: "你好" }),
      ...t.push({ text: "你好世界" }),
      ...t.push({ text: "你好世界！" }),
    ];
    expect(contentDeltas(chunks)).toEqual(["你好", "世界", "！"]);
    expect(joinContent(chunks)).toBe("你好世界！");
  });

  it("同一帧重复喂幂等（第二次不产生内容）", () => {
    const t = createCodeartsTranslator();
    const frame = { text: "你好世界" };
    expect(contentDeltas(t.push({ text: "你好" }))).toEqual(["你好"]);
    expect(contentDeltas(t.push(frame))).toEqual(["世界"]);
    expect(t.push(frame)).toEqual([]);
    // 再喂更短的旧帧：按「整段重发 + 更新基线」处理，不吞内容
    const rewrite = t.push({ text: "你好" });
    expect(contentDeltas(rewrite)).toEqual(["你好"]);
  });

  it("上游改写前缀（不再 startsWith）时整段重发并换基线", () => {
    const t = createCodeartsTranslator();
    expect(contentDeltas(t.push({ text: "abc" }))).toEqual(["abc"]);
    expect(contentDeltas(t.push({ text: "xyz" }))).toEqual(["xyz"]);
    // 新基线是 xyz：再累计到 xyz123 只发 123
    expect(contentDeltas(t.push({ text: "xyz123" }))).toEqual(["123"]);
  });

  it("整条 message 形态同样按累计全文处理", () => {
    const t = createCodeartsTranslator();
    expect(
      contentDeltas(t.push({ choices: [{ index: 0, message: { role: "assistant", content: "一" } }] })),
    ).toEqual(["一"]);
    expect(
      contentDeltas(t.push({ choices: [{ index: 0, message: { role: "assistant", content: "一二" } }] })),
    ).toEqual(["二"]);
  });
});

describe("codearts-wire: reasoning 增量", () => {
  it("累计 reasoning（text 帧内）还原增量", () => {
    const t = createCodeartsTranslator();
    const a = t.push({ text: "", reasoning_content: "先想" });
    const b = t.push({ text: "", reasoning_content: "先想一下" });
    expect(reasoningDeltas(a)).toEqual(["先想"]);
    expect(reasoningDeltas(b)).toEqual(["一下"]);
    // 重复帧幂等
    expect(t.push({ text: "", reasoning_content: "先想一下" })).toEqual([]);
  });

  it("纯 reasoning 阶段（还没有正文）也能识别累计形态", () => {
    const t = createCodeartsTranslator();
    const chunks = [
      ...t.push({ reasoning_content: "我" }),
      ...t.push({ reasoning_content: "我想" }),
      ...t.push({ reasoning_content: "我想想" }),
    ];
    expect(reasoningDeltas(chunks)).toEqual(["我", "想", "想"]);
    expect(chunks[0]?.["id"]).toBe(chunks[1]?.["id"]);
  });

  it("reasoning 与正文同帧时各自独立推进", () => {
    const t = createCodeartsTranslator();
    const a = t.push({ text: "答案", reasoning_content: "想" });
    const b = t.push({ text: "答案：42", reasoning_content: "想好了" });
    expect(joinReasoning(a)).toBe("想");
    expect(joinReasoning(b)).toBe("好了");
    expect(joinContent([...a, ...b])).toBe("答案：42");
  });

  it("OpenAI delta 形态的 thinking 增量照样透传", () => {
    const t = createCodeartsTranslator();
    const chunks = [
      ...t.push({ choices: [{ index: 0, delta: { reasoning_content: "Let" } }] }),
      ...t.push({ choices: [{ index: 0, delta: { reasoning_content: " me" } }] }),
    ];
    expect(reasoningDeltas(chunks)).toEqual(["Let", " me"]);
  });
});

// ---------------------------------------------------------------------------
// 不产生 chunk 的帧
// ---------------------------------------------------------------------------

describe("codearts-wire: 非内容帧", () => {
  it("[DONE] / 空行 / 注释行 / 坏 JSON 都不产生 chunk", () => {
    const t = createCodeartsTranslator();
    for (const frame of [
      "[DONE]",
      "data: [DONE]",
      "",
      "   ",
      "\n",
      ": ping",
      "data: ",
      "{not json",
      undefined,
      null,
      42,
      [],
    ]) {
      expect(t.push(frame)).toEqual([]);
    }
  });

  it("原始 SSE 行（data: {...}）也能解析", () => {
    const t = createCodeartsTranslator();
    const chunks = t.push('data: {"choices":[{"index":0,"delta":{"content":"A"}}]}');
    expect(contentDeltas(chunks)).toEqual(["A"]);
  });

  it("业务错误帧不产生内容 chunk", () => {
    const t = createCodeartsTranslator();
    expect(t.push({ error_code: "4005", error_msg: "bad" })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// finish
// ---------------------------------------------------------------------------

describe("codearts-wire: finish", () => {
  it("没收到 finish_reason 且有内容时补 stop，且只补一次", () => {
    const t = createCodeartsTranslator();
    t.push({ text: "hi" });
    const tail = t.finish();
    expect(tail).toHaveLength(1);
    expect(finishOf(tail[0]!)).toBe("stop");
    expect(deltaOf(tail[0]!)).toEqual({});
    expect(t.finish()).toEqual([]);
  });

  it("全程无内容时不补 stop", () => {
    const t = createCodeartsTranslator();
    expect(t.finish()).toEqual([]);
  });

  it("只有 reasoning 也算有内容", () => {
    const t = createCodeartsTranslator();
    t.push({ reasoning_content: "hmm" });
    expect(finishOf(t.finish()[0]!)).toBe("stop");
  });
});

// ---------------------------------------------------------------------------
// usage
// ---------------------------------------------------------------------------

describe("codearts-wire: usage", () => {
  it("usage 原样归一透传（独立 chunk，choices 为空）", () => {
    const t = createCodeartsTranslator();
    const chunks = t.push({
      choices: [],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        prompt_tokens_details: { cached_tokens: 3 },
      },
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!["choices"]).toEqual([]);
    expect(chunks[0]!["usage"]).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      prompt_tokens_details: { cached_tokens: 3 },
    });
  });

  it("字段缺失按 0，不猜 total", () => {
    const t = createCodeartsTranslator();
    const chunks = t.push({ choices: [], usage: { prompt_tokens: 7 } });
    expect(chunks[0]!["usage"]).toEqual({
      prompt_tokens: 7,
      completion_tokens: 0,
      total_tokens: 0,
    });
    expect(chunks[0]!["usage"]).not.toHaveProperty("prompt_tokens_details");
  });
});

// ---------------------------------------------------------------------------
// 业务错误
// ---------------------------------------------------------------------------

describe("codearts-wire: codeartsBusinessError", () => {
  it("纯数字码在 400–599 直接用", () => {
    expect(codeartsBusinessError({ error_code: "400", error_msg: "bad request" })).toEqual({
      code: "400",
      message: "bad request",
      status: 400,
    });
  });

  it("纯数字码越界（4005）兜底 400", () => {
    expect(codeartsBusinessError({ error_code: "4005", error_msg: "quota" })?.status).toBe(400);
  });

  it("复合码取末段（InferHub.002002009.404 → 404）", () => {
    const err = codeartsBusinessError({
      error_code: "InferHub.002002009.404",
      error_msg: "not found",
    });
    expect(err).toEqual({ code: "InferHub.002002009.404", message: "not found", status: 404 });
  });

  it("数字型 error_code 也认，且不吞错误码原文", () => {
    expect(codeartsBusinessError({ error_code: 403, error_msg: "denied" })).toEqual({
      code: "403",
      message: "denied",
      status: 403,
    });
  });

  it("正常帧 / 空对象 / 非法输入返回 null", () => {
    expect(codeartsBusinessError({ choices: [{ delta: { content: "hi" } }] })).toBeNull();
    expect(codeartsBusinessError({ text: "hi" })).toBeNull();
    expect(codeartsBusinessError({})).toBeNull();
    expect(codeartsBusinessError("[DONE]")).toBeNull();
    expect(codeartsBusinessError("{}")).toBeNull();
    expect(codeartsBusinessError(undefined)).toBeNull();
    expect(codeartsBusinessError(null)).toBeNull();
  });

  it("字符串 JSON 也能判错", () => {
    expect(codeartsBusinessError('{"error_code":"500","error_msg":"boom"}')).toEqual({
      code: "500",
      message: "boom",
      status: 500,
    });
  });

  it("错误码状态提取绝不返回 2xx", () => {
    expect(codeartsErrorStatus("")).toBe(400);
    expect(codeartsErrorStatus("4005")).toBe(400);
    expect(codeartsErrorStatus("InferHub.002002009.200")).toBe(400);
    expect(codeartsErrorStatus("InferHub.002002009.404")).toBe(404);
    expect(codeartsErrorStatus("APIG.0301")).toBe(400);
    expect(codeartsErrorStatus("400")).toBe(400);
    expect(codeartsErrorStatus("599")).toBe(599);
  });
});
