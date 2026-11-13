/**
 * trae `token_usage` 的**多名字缓存字段识别**(2026-11-13)。
 *
 * 背景:用户报「trae 缓存命中恒 0,应该是没处理返回的缓存字段」。
 * 旧实现只读顶层 `cache_read_input_tokens`;而各家的缓存字段名并不统一
 * (Anthropic / OpenAI 嵌套 / DeepSeek),只认一种 → 换个名字就静默变 0,
 * 看起来像「上游不缓存」。
 */
import { describe, expect, it } from "vitest";

import { toOpenAIUsage } from "./trae-wire.js";

/** 取 cached_tokens(统一出口)。 */
function cachedOf(usage: Record<string, unknown>): unknown {
  const d = usage["prompt_tokens_details"] as Record<string, unknown> | undefined;
  return d?.["cached_tokens"];
}

describe("toOpenAIUsage 缓存字段识别", () => {
  it("Anthropic 风格:cache_read_input_tokens", () => {
    const u = toOpenAIUsage({ prompt_tokens: 1000, completion_tokens: 20, cache_read_input_tokens: 800 });
    expect(u["prompt_tokens"]).toBe(1000);
    expect(cachedOf(u)).toBe(800);
  });

  it("OpenAI 顶层:cached_tokens", () => {
    expect(cachedOf(toOpenAIUsage({ prompt_tokens: 500, cached_tokens: 400 }))).toBe(400);
  });

  it("OpenAI 嵌套:prompt_tokens_details.cached_tokens", () => {
    const u = toOpenAIUsage({ prompt_tokens: 500, prompt_tokens_details: { cached_tokens: 450 } });
    expect(cachedOf(u)).toBe(450);
  });

  it("DeepSeek 风格:prompt_cache_hit_tokens", () => {
    expect(cachedOf(toOpenAIUsage({ prompt_tokens: 900, prompt_cache_hit_tokens: 700 }))).toBe(700);
  });

  it("cache_read_tokens / cache_hit_tokens 也认", () => {
    expect(cachedOf(toOpenAIUsage({ cache_read_tokens: 300 }))).toBe(300);
    expect(cachedOf(toOpenAIUsage({ cache_hit_tokens: 200 }))).toBe(200);
  });

  it("多个名字同时出现 → 取第一个命中的(优先级:Anthropic 先)", () => {
    const u = toOpenAIUsage({
      prompt_tokens: 1000,
      cache_read_input_tokens: 800,
      cached_tokens: 700,
    });
    expect(cachedOf(u)).toBe(800);
  });

  it("全都没有 → 不写 cached_tokens(不伪造 0)", () => {
    const u = toOpenAIUsage({ prompt_tokens: 1000, completion_tokens: 20 });
    expect(cachedOf(u)).toBeUndefined();
  });

  it("值为 0 → 视作没有(不写一堆 0)", () => {
    const u = toOpenAIUsage({ prompt_tokens: 1000, cache_read_input_tokens: 0, cached_tokens: 0 });
    expect(cachedOf(u)).toBeUndefined();
  });

  it("cache write 也支持多名字", () => {
    const a = toOpenAIUsage({ cache_creation_input_tokens: 120 });
    const b = toOpenAIUsage({ cache_write_tokens: 120 });
    const c = toOpenAIUsage({ prompt_cache_miss_tokens: 120 });
    for (const u of [a, b, c]) {
      const d = u["prompt_tokens_details"] as Record<string, unknown> | undefined;
      expect(d?.["cache_write_tokens"]).toBe(120);
    }
  });

  it("reasoning_tokens 仍保留(回归保护)", () => {
    const u = toOpenAIUsage({ prompt_tokens: 100, reasoning_tokens: 64 });
    const d = u["prompt_tokens_details"] as Record<string, unknown> | undefined;
    expect(d?.["reasoning_tokens"]).toBe(64);
  });

  it("非对象 / 数组 → 空对象(不炸)", () => {
    expect(toOpenAIUsage(null)).toEqual({});
    expect(toOpenAIUsage([1, 2])).toEqual({});
    expect(toOpenAIUsage("x")).toEqual({});
  });
});
