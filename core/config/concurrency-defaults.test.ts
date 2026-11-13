/**
 * 供应商级「每凭据并发」缺省的规格(2026-11-08 用户定案:除两个例外统一 3)。
 *
 * | 语义 | 用例 |
 * |---|---|
 * | 全局缺省 3 | `缺省是 3` |
 * | sensenova = 1(连接器 maxSockets=1 硬约束) | `sensenova 保持 1` |
 * | workbuddy = 2(国际版 WAF 风控) | `workbuddy 保持 2` |
 * | trae / qoder / minimax / 兼容 / 未知 = 3 | `其余渠道统一 3` |
 * | 例外必须显式钉住,不能靠全局兜底「蹭」 | `例外钉在表里` |
 * | 返回值恒为正整数 | `返回值恒为正整数` |
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONCURRENCY,
  PROVIDER_CONCURRENCY_DEFAULTS,
  defaultConcurrencyOf,
} from "./concurrency-defaults.js";

describe("defaultConcurrencyOf(每凭据并发缺省)", () => {
  it("缺省是 3:除 sensenova / workbuddy 外统一 3", () => {
    expect(DEFAULT_CONCURRENCY).toBe(3);
    expect(defaultConcurrencyOf("")).toBe(3);
    expect(defaultConcurrencyOf("不存在的渠道")).toBe(3);
  });

  it("sensenova 保持 1(连接器每账号 maxSockets=1,抬并发只会堆请求)", () => {
    expect(defaultConcurrencyOf("sensenova")).toBe(1);
  });

  it("workbuddy 保持 2(依据:panel pool.max_in_flight_global=2,风控)", () => {
    expect(defaultConcurrencyOf("workbuddy")).toBe(2);
    expect(PROVIDER_CONCURRENCY_DEFAULTS.workbuddy).toBe(2);
  });

  it("其余渠道统一 3(trae/qoder/minimax/openai 兼容/未知)", () => {
    for (const provider of ["trae", "qoder", "minimax", "openai", "deepseek", "unknown"]) {
      expect(defaultConcurrencyOf(provider), provider).toBe(3);
    }
  });

  it("例外钉在表里:全局缺省变成 3 后两个例外不跟着漂移", () => {
    // ⚠️ 回归点:sensenova 以前是靠全局 1「蹭」到的,全局抬到 3 后必须显式写表。
    expect(PROVIDER_CONCURRENCY_DEFAULTS.sensenova).toBe(1);
    expect(PROVIDER_CONCURRENCY_DEFAULTS.workbuddy).toBe(2);
    expect(PROVIDER_CONCURRENCY_DEFAULTS.sensenova).not.toBe(DEFAULT_CONCURRENCY);
    expect(PROVIDER_CONCURRENCY_DEFAULTS.workbuddy).not.toBe(DEFAULT_CONCURRENCY);
  });

  it("返回值恒为正整数(不会被配置层写出 0 / 负数 / 小数)", () => {
    for (const provider of ["workbuddy", "sensenova", "trae", "unknown"]) {
      const v = defaultConcurrencyOf(provider);
      expect(Number.isInteger(v), provider).toBe(true);
      expect(v, provider).toBeGreaterThanOrEqual(1);
    }
  });
});
