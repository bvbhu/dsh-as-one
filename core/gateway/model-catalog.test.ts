/**
 * model-catalog.test.ts —— 上游模型目录解析纯函数测试。
 * 语义对齐 Nexus `nexus/panel/api.py`(_parse_model_entries / _model_entry /
 * _capability_int / _vision_of),零网络。
 */
import { describe, it, expect } from "vitest";

import {
  capabilityInt,
  modelEntry,
  parseModelEntries,
  reasoning_allows_off_of,
  reasoning_efforts_of,
  visionOf,
  MAX_MODEL_NAME,
  MAX_UPSTREAM_MODELS,
} from "./model-catalog.js";

describe("capabilityInt", () => {
  it("bool 先挡掉(否则 true 会被当成 1)", () => {
    expect(capabilityInt(true)).toBeNull();
    expect(capabilityInt(false)).toBeNull();
  });

  it("正整数原样", () => {
    expect(capabilityInt(128)).toBe(128);
    expect(capabilityInt(1024)).toBe(1024);
  });

  it("float 截断;NaN/±inf 挡掉", () => {
    expect(capabilityInt(1.5)).toBe(1);
    expect(capabilityInt(Number.NaN)).toBeNull();
    expect(capabilityInt(Number.POSITIVE_INFINITY)).toBeNull();
    expect(capabilityInt(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("≤0 一律当「没说」", () => {
    expect(capabilityInt(0)).toBeNull();
    expect(capabilityInt(-5)).toBeNull();
  });

  it("数字字符串可读;非全数字挡掉", () => {
    expect(capabilityInt("4096")).toBe(4096);
    expect(capabilityInt(" 8192 ")).toBe(8192);
    expect(capabilityInt("12k")).toBeNull();
    expect(capabilityInt("abc")).toBeNull();
    expect(capabilityInt("")).toBeNull();
  });

  it("其他类型挡掉", () => {
    expect(capabilityInt(null)).toBeNull();
    expect(capabilityInt(undefined)).toBeNull();
    expect(capabilityInt({})).toBeNull();
    expect(capabilityInt([1])).toBeNull();
  });
});

describe("visionOf", () => {
  it("flag 键为 true → true", () => {
    expect(visionOf({ supports_vision: true })).toBe(true);
    expect(visionOf({ vision: true })).toBe(true);
    expect(visionOf({ supports_image_input: true })).toBe(true);
  });

  it("flag 键为 false / 其它值 → 不认", () => {
    expect(visionOf({ supports_vision: false })).toBe(false);
    expect(visionOf({ vision: 1 })).toBe(false);
  });

  it("list 键含 image/vision/multimodal → true(大小写/空白容错)", () => {
    expect(visionOf({ input_modalities: ["text", "image"] })).toBe(true);
    expect(visionOf({ modalities: ["Image", " text "] })).toBe(true);
    expect(visionOf({ supported_input_modalities: ["text", "multimodal"] })).toBe(true);
    expect(visionOf({ input_types: ["text"] })).toBe(false);
  });

  it("没有明说一律 false(保守)", () => {
    expect(visionOf({})).toBe(false);
    expect(visionOf({ input_modalities: 42 })).toBe(false);
    expect(visionOf({ input_modalities: "image" })).toBe(false);
  });
});

describe("modelEntry", () => {
  it("字符串元素只有名字,能力不猜", () => {
    expect(modelEntry("deepseek-flash", null)).toEqual({
      id: "deepseek-flash",
      context_window: null,
      max_output: null,
      vision: false,
      reasoning_efforts: null,
      reasoning_allows_off: null,
    });
  });

  it("Mapping 从候选键读能力", () => {
    const entry = modelEntry("gpt-4o", {
      id: "gpt-4o",
      context_length: 128000,
      max_output_tokens: 4096,
      supports_vision: true,
    });
    expect(entry).toEqual({
      id: "gpt-4o",
      context_window: 128000,
      max_output: 4096,
      vision: true,
      reasoning_efforts: null,
      reasoning_allows_off: null,
    });
  });

  it("别名键按顺序取第一个读得出的", () => {
    const entry = modelEntry("m", {
      max_input_tokens: 0, // 第一候选无效(≤0)
      context_window: 32000, // 第三候选命中
      max_model_len: 999999,
    });
    expect(entry.context_window).toBe(32000);
  });

  it("sensenova input_modalities 风格", () => {
    const entry = modelEntry("step-3", {
      id: "step-3",
      input_modalities: ["text", "image"],
      max_input_tokens: 100000,
      max_output: 20000,
    });
    expect(entry.vision).toBe(true);
    expect(entry.context_window).toBe(100000);
    expect(entry.max_output).toBe(20000);
  });

  it("record 数组不当对象(撞 Array 检查)", () => {
    const entry = modelEntry("m", [1, 2, 3]);
    expect(entry).toEqual({
      id: "m",
      context_window: null,
      max_output: null,
      vision: false,
      reasoning_efforts: null,
      reasoning_allows_off: null,
    });
  });
});

describe("parseModelEntries", () => {
  it("裸数组", () => {
    const entries = parseModelEntries(["a", "b", "a"]);
    expect(entries?.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("dict 的 data 键", () => {
    const entries = parseModelEntries({
      data: [{ id: "x", context_length: 1000, supports_vision: true }],
    });
    expect(entries).toEqual([
      { id: "x", context_window: 1000, max_output: null, vision: true, reasoning_efforts: null, reasoning_allows_off: null },
    ]);
  });

  it("dict 的 data/models/items/result 键(按序第一个为数组的)", () => {
    expect(parseModelEntries({ data: ["m0"], models: ["m1"] })?.[0]?.id).toBe("m0");
    expect(parseModelEntries({ items: [{ model: "m2" }] })?.[0]?.id).toBe("m2");
    expect(parseModelEntries({ result: ["m3"] })?.[0]?.id).toBe("m3");
  });

  it("id/model/name 都接受", () => {
    expect(parseModelEntries([{ model: "via-model" }])?.[0]?.id).toBe("via-model");
    expect(parseModelEntries([{ name: "via-name" }])?.[0]?.id).toBe("via-name");
  });

  it("认不出 → null(不是空列表)", () => {
    expect(parseModelEntries(null)).toBeNull();
    expect(parseModelEntries(42)).toBeNull();
    expect(parseModelEntries("nope")).toBeNull();
    expect(parseModelEntries({ data: "not-an-array" })).toBeNull();
    expect(parseModelEntries({})).toBeNull();
    expect(parseModelEntries({ data: null })).toBeNull();
  });

  it("空数组是合法结果(成功但没模型),不是 null", () => {
    expect(parseModelEntries([])).toEqual([]);
    expect(parseModelEntries({ data: [] })).toEqual([]);
  });

  it("id 缺失/空字符串/非对象元素跳过", () => {
    const entries = parseModelEntries([{ id: "" }, 42, null, { id: "ok" }]);
    expect(entries?.map((e) => e.id)).toEqual(["ok"]);
  });

  it("名字截断 200(MAX_MODEL_NAME)", () => {
    const long = "x".repeat(MAX_MODEL_NAME + 50);
    const entries = parseModelEntries([long]);
    expect(entries?.[0]?.id.length).toBe(MAX_MODEL_NAME);
  });

  it("500 条封顶(MAX_UPSTREAM_MODELS)", () => {
    const big = Array.from({ length: 600 }, (_, i) => `m${i}`);
    const entries = parseModelEntries(big);
    expect(entries?.length).toBe(MAX_UPSTREAM_MODELS);
  });
});

describe("reasoning_efforts(m09328/m09937)", () => {
  it("通用 /models 探测:条目上**没有**思考字段 = 未知(null),不是「明说不支持」", () => {
    // 各家 /models 的字段名毫无共识;凭「没有这个字段」就断言不支持,会把一个
    // 其实支持思考的模型永久标成「一律不传 reasoning_effort」—— 不可逆的误判。
    expect(modelEntry("m", { id: "m" }).reasoning_efforts).toBeNull();
    expect(modelEntry("m", "just-a-name").reasoning_efforts).toBeNull();
  });

  it("有思考字段但读不出档位 → 明说不支持([])", () => {
    expect(modelEntry("m", { reasoning: { summary: "auto" } }).reasoning_efforts).toEqual([]);
    // `reasoning: null` 按「没说」处理(与「没有这个字段」同义)—— 通用探测不猜。
    expect(modelEntry("m", { reasoning: null }).reasoning_efforts).toBeNull();
  });

  it("档位表照收(对象 / 逗号串 / 数组三种形态)", () => {
    expect(
      modelEntry("m", { reasoning: { supportedEfforts: ["low", "high", "low"] } }).reasoning_efforts,
    ).toEqual(["low", "high"]);
    expect(modelEntry("m", { reasoning_efforts: "low,high" }).reasoning_efforts).toEqual(["low", "high"]);
    expect(modelEntry("m", { supported_reasoning_efforts: ["high"] }).reasoning_efforts).toEqual(["high"]);
  });

  it("reasoning_efforts_of:三态与 supportsReasoning 布尔", () => {
    expect(reasoning_efforts_of({ supportedEfforts: ["low", "high", "low"] })).toEqual(["low", "high"]);
    expect(reasoning_efforts_of({ effort: "high" })).toEqual(["high"]);
    expect(reasoning_efforts_of({ summary: "auto" })).toEqual([]);
    // reasoning 缺失/为 null 且上游没说 supportsReasoning → 明说**不支持**。
    expect(reasoning_efforts_of(null)).toEqual([]);
    expect(reasoning_efforts_of(undefined)).toEqual([]);
    // 上游承认支持但没给档位表 → null(不拦)。
    expect(reasoning_efforts_of(null, true)).toBeNull();
    expect(reasoning_efforts_of(undefined, true)).toBeNull();
  });

  it("reasoning_efforts_of:认 snake_case(OpenRouter 口径,2026-11-08 实测)", () => {
    // 真实条目:google/gemini-omni-1.2-flash → {"mandatory":true,"supported_efforts":["high","low"],"default_effort":"low"}
    expect(
      reasoning_efforts_of({ mandatory: true, supported_efforts: ["high", "low"], default_effort: "low" }),
    ).toEqual(["low", "high"]);
    // stealth/crouton-alpha → 六档(含 xhigh/minimal):**保留上游原文**,
    // 只按阶梯排序、去掉不会发给上游的 off —— 这里不做 `xhigh → max` 的改写,
    // 否则落库后就再也发不出上游认的 `xhigh`。
    expect(
      reasoning_efforts_of({
        mandatory: true,
        supported_efforts: ["max", "xhigh", "high", "medium", "low", "minimal"],
      }),
    ).toEqual(["low", "minimal", "medium", "high", "max", "xhigh"]);
    // 只给默认档、没给表 → 单档
    expect(reasoning_efforts_of({ default_effort: "high" })).toEqual(["high"]);
    // 只有 mandatory 没有档位 → 「支持但没有档位表」的语义是 [] (不能选)
    expect(reasoning_efforts_of({ mandatory: true })).toEqual([]);
  });

  it("reasoning_allows_off_of:canDisableThinking 优先,其次 OpenRouter 的 mandatory", () => {
    expect(reasoning_allows_off_of({ canDisableThinking: true })).toBe(true);
    expect(reasoning_allows_off_of({ canDisableThinking: false })).toBe(false);
    // OpenRouter: mandatory=true 关不掉;false 能关
    expect(reasoning_allows_off_of({ mandatory: true })).toBe(false);
    expect(reasoning_allows_off_of({ mandatory: false })).toBe(true);
    // 档位表里点了 none/off 也是「能关」的直接证据(tencent/hy4)
    expect(reasoning_allows_off_of({ supported_efforts: ["high", "low", "none"] })).toBe(true);
    // 什么都没说 → 未知
    expect(reasoning_allows_off_of({ summary: "auto" })).toBeNull();
    expect(reasoning_allows_off_of(null)).toBeNull();
  });
});