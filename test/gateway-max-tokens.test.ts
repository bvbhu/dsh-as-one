/**
 * `max_tokens` 钳制与上游报文体的回归测试。
 *
 * ## 为什么需要这个文件
 *
 * 2026-10-31 用户 m40778 实测:请求 `maas/spark-x2.6` 时上游回
 * `400 {"code":10005,"message":"invalid request","type":"invalid_request_error"}`
 * (官方错误码文档:10005 = 用户参数值有错误),而同一把 key 直连上游 200。
 *
 * 抓出站报文后定位到根因:body 里出现了 `"max_tokens": 0`。
 *   - 库 `real_model.max_output_tokens` 为 **NULL**(合法值,表示「没给上限」);
 *   - 调度层 `engine-models.ts` 把它归一成 `0`(`toInt(data.max_output_tokens, 0)`);
 *   - 旧 `clampMaxTokens` 只把 `null/undefined` 当成「无上限」,于是 0 被当成
 *     真实上限,客户端没带 max_tokens 时直接返回 0 → 报文里写死 `max_tokens: 0`。
 *
 * 所以这里的用例锁三件事:
 *   1) `memberCap <= 0` 与 `null` 同等对待(不钳制);
 *   2) 客户端真带了值时的既有钳制语义不变;
 *   3) `max_tokens === undefined` 时 body 里**没有**该键。
 */

import { describe, expect, it } from "vitest";
import { clampMaxTokens } from "../src/gateway-upstream.js";
import { bodyForProtocol } from "../src/gateway-upstream-body.js";

describe("clampMaxTokens", () => {
  it("成员上限为 0(NULL 被归一后的形态)时视为无上限,不发出 max_tokens", () => {
    // 这就是 m40778 那条 400 的直接来源。
    expect(clampMaxTokens(undefined, 0, null)).toBeUndefined();
    expect(clampMaxTokens(undefined, 0, 64000)).toBeUndefined();
  });

  it("成员上限为 0 时客户端原值原样透传", () => {
    expect(clampMaxTokens(64000, 0, null)).toBe(64000);
    expect(clampMaxTokens(1024, 0, 4096)).toBe(1024);
  });

  it("负数 / NaN / Infinity 上限同样视为无上限", () => {
    expect(clampMaxTokens(undefined, -1, null)).toBeUndefined();
    expect(clampMaxTokens(undefined, Number.NaN, null)).toBeUndefined();
    expect(clampMaxTokens(undefined, Number.POSITIVE_INFINITY, null)).toBeUndefined();
  });

  it("上限缺失(null / undefined)时客户端没带就保持 undefined", () => {
    expect(clampMaxTokens(undefined, null, null)).toBeUndefined();
    expect(clampMaxTokens(undefined, undefined, null)).toBeUndefined();
  });

  it("上限真实存在时:客户端没带 → 用成员上限", () => {
    expect(clampMaxTokens(undefined, 8192, null)).toBe(8192);
  });

  it("上限真实存在时:客户端带值 → 取 min", () => {
    expect(clampMaxTokens(64000, 8192, null)).toBe(8192);
    expect(clampMaxTokens(1024, 8192, null)).toBe(1024);
  });

  it("客户端带的是逻辑模型级上限 → 放开到真实成员能力", () => {
    expect(clampMaxTokens(32000, 64000, 32000)).toBe(64000);
  });
});

describe("bodyForProtocol(openai) 的 max_tokens 键", () => {
  const req = {
    model: "spark-x2.6",
    messages: [{ role: "user" as const, content: "hi" }],
    stream: false,
  };

  it("max_tokens 为 undefined 时**不写**这个键", () => {
    const body = bodyForProtocol(
      "maas",
      "openai",
      { ...req, max_tokens: clampMaxTokens(undefined, 0, null) },
      { apiKey: "k" },
    ) as Record<string, unknown>;
    expect("max_tokens" in body).toBe(false);
    expect(body).toEqual({
      model: "spark-x2.6",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
  });

  it("max_tokens 有值时原样带上", () => {
    const body = bodyForProtocol(
      "maas",
      "openai",
      { ...req, max_tokens: 8192 },
      { apiKey: "k" },
    ) as Record<string, unknown>;
    expect(body.max_tokens).toBe(8192);
  });

  it("网关内部键 session_id / prompt_cache_key 绝不进报文", () => {
    const body = bodyForProtocol(
      "maas",
      "openai",
      {
        ...req,
        extra: { session_id: "s1", prompt_cache_key: "p1" },
        prompt_cache_key: "p1",
      } as never,
      { apiKey: "k" },
    ) as Record<string, unknown>;
    expect("session_id" in body).toBe(false);
    expect("prompt_cache_key" in body).toBe(false);
  });
});
