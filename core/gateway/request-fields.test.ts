/**
 * request-fields.test.ts —— 客户端请求体字段处置表测试(用户 m09081,零网络)。
 *
 * 三条核心语义:
 *  1. **三段式**:认识且语义明确 → forward;网关内部键 → consume;其余 → drop。
 *  2. **绝不拒绝**:未知字段进 discarded,`classifyRequestFields` 不抛错。
 *  3. **两条易忽略线**:`prompt_cache_key` 是路由键(不进上游 body);
 *     `reasoning_effort` 只原样透传、非字符串视为未指定。
 */
import { describe, it, expect } from "vitest";

import {
  CACHE_ROUTING_KEY_FIELD,
  classifyRequestFields,
  reasoningEffortOf,
  cacheRoutingKeyOf,
  requestFieldAction,
  requestFieldNote,
  KNOWN_FIELDS,
  CONSUMED_FIELDS,
  FORWARDED_FIELDS,
} from "./request-fields.js";

describe("classifyRequestFields:三段式", () => {
  it("认识的字段进 forwarded", () => {
    const r = classifyRequestFields({ model: "auto", messages: [], stream: true });
    expect(r.forwarded).toContain("model");
    expect(r.forwarded).toContain("messages");
    expect(r.forwarded).toContain("stream");
    expect(r.consumed).toEqual([]);
    expect(r.discarded).toEqual([]);
  });

  it("网关内部键进 consumed(绝不进上游 body)", () => {
    const r = classifyRequestFields({ session_id: "s1", prompt_cache_key: "k1" });
    expect(r.consumed).toEqual(["session_id", "prompt_cache_key"]);
    expect(r.forwarded).toEqual([]);
    // ⚠️ 消费掉的字段**不能**同时出现在 forwarded 里 —— 否则就等于转发给上游了。
    for (const name of r.consumed) {
      expect(r.forwarded).not.toContain(name);
    }
  });

  it("未知字段进 discarded,且**不抛错**(绝不拒绝请求)", () => {
    expect(() => classifyRequestFields({ some_future_field: 1 })).not.toThrow();
    const r = classifyRequestFields({ some_future_field: 1, thinking: { type: "enabled" } });
    expect(r.discarded).toEqual(["some_future_field", "thinking"]);
    expect(r.forwarded).toEqual([]);
    expect(r.consumed).toEqual([]);
  });

  it("mixed 请求:三类各归各位", () => {
    const r = classifyRequestFields({
      model: "auto",
      reasoning_effort: "high",
      prompt_cache_key: "k1",
      mystery_flag: true,
    });
    expect(r.forwarded).toEqual(["model", "reasoning_effort"]);
    expect(r.consumed).toEqual(["prompt_cache_key"]);
    expect(r.discarded).toEqual(["mystery_flag"]);
  });

  it("非对象请求体 → 三类全空(不抛错)", () => {
    expect(classifyRequestFields(null)).toEqual({ forwarded: [], consumed: [], discarded: [] });
    expect(classifyRequestFields("string")).toEqual({ forwarded: [], consumed: [], discarded: [] });
    expect(classifyRequestFields(42)).toEqual({ forwarded: [], consumed: [], discarded: [] });
  });

  it("camelCase 别名 reasoningEffort 也算认识(部分 SDK 这么发)", () => {
    const r = classifyRequestFields({ reasoningEffort: "low" });
    expect(r.forwarded).toContain("reasoningEffort");
    expect(r.discarded).toEqual([]);
  });
});

describe("requestFieldAction / requestFieldNote", () => {
  it("内部键 → consume", () => {
    expect(requestFieldAction("session_id")).toBe("consume");
    expect(requestFieldAction(CACHE_ROUTING_KEY_FIELD)).toBe("consume");
  });

  it("标准参数 → forward", () => {
    expect(requestFieldAction("model")).toBe("forward");
    expect(requestFieldAction("reasoning_effort")).toBe("forward");
  });

  it("未知字段 → drop", () => {
    expect(requestFieldAction("totally_unknown")).toBe("drop");
  });

  it("已知字段都有说明文案(排查「这个字段怎么没了」时看)", () => {
    for (const name of KNOWN_FIELDS) {
      expect(requestFieldNote(name).length, `字段 ${name} 缺说明`).toBeGreaterThan(0);
    }
    expect(requestFieldNote("totally_unknown")).toBe("");
  });
});

describe("cacheRoutingKeyOf:缓存路由键(billion-context)", () => {
  it("取到非空字符串", () => {
    expect(cacheRoutingKeyOf({ prompt_cache_key: "abc123" })).toBe("abc123");
  });

  it("空串/缺失/非字符串 → undefined(没有键,不是空键)", () => {
    expect(cacheRoutingKeyOf({})).toBeUndefined();
    expect(cacheRoutingKeyOf({ prompt_cache_key: "" })).toBeUndefined();
    expect(cacheRoutingKeyOf({ prompt_cache_key: 123 })).toBeUndefined();
    expect(cacheRoutingKeyOf({ prompt_cache_key: null })).toBeUndefined();
  });

  it("字段名常量就是 prompt_cache_key", () => {
    expect(CACHE_ROUTING_KEY_FIELD).toBe("prompt_cache_key");
  });

  it("prompt_cache_key 属 consumed 表(不进上游 body)", () => {
    expect(CONSUMED_FIELDS).toContain("prompt_cache_key");
    expect(FORWARDED_FIELDS).not.toContain("prompt_cache_key");
  });
});

describe("reasoningEffortOf:只原样透传,不解释", () => {
  it("主字段原样返回(网关不改写档位值)", () => {
    expect(reasoningEffortOf({ reasoning_effort: "high" })).toBe("high");
    expect(reasoningEffortOf({ reasoning_effort: "none" })).toBe("none");
  });

  it("camelCase 别名兜底", () => {
    expect(reasoningEffortOf({ reasoningEffort: "low" })).toBe("low");
  });

  it("主字段优先于别名", () => {
    expect(reasoningEffortOf({ reasoning_effort: "high", reasoningEffort: "low" })).toBe("high");
  });

  it("未指定 → undefined(网关**不添加**这个字段,让上游自己决定)", () => {
    expect(reasoningEffortOf({})).toBeUndefined();
    expect(reasoningEffortOf({ model: "auto" })).toBeUndefined();
  });

  it("非字符串 → undefined(不当成已指定)", () => {
    expect(reasoningEffortOf({ reasoning_effort: 5 })).toBeUndefined();
    expect(reasoningEffortOf({ reasoning_effort: null })).toBeUndefined();
    expect(reasoningEffortOf({ reasoning_effort: { level: "high" } })).toBeUndefined();
  });
});
