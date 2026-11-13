/**
 * Qoder 上游「模型键」回归测试。
 *
 * ## 症状(2026-11-02)
 *
 * DSH 里选 `qoder/qfmodel` 对话一律失败:
 * `403 {"code":"112","message":"{\"pricingUrl\":\"https://qoder.com.cn/pricing?client=qoder\"}"}`。
 * 报文长得像「额度用完/该续费了」,直接拿 PAT 调同一个模型却是 200 —— 于是最
 * 容易被误判成账号欠费。
 *
 * ## 真因
 *
 * Qoder 连接器把传进来的 `model` **逐字**写进报文体
 * `model_config.key`(`applyModelKey`),而网关两处调用(`stream()` /
 * `complete()`)传的是**客户端的请求名**:直连是 `qoder/qfmodel`(带 provider
 * 前缀),逻辑模型是 `auto` / `deepseek-flash`。上游只认裸模型键 `qfmodel`,
 * 收到别的就按「不存在的模型」回 403(错误码表里 110/111/112 都属于配额类,
 * 所以看起来像欠费)。
 *
 * ## 判据
 *
 * - 上游模型键取 `body.model`(网关在 `bodyForProtocol` 里已换成端点真名);
 * - `body.model` 缺失时才退回调用方传入的 `model`(兼容非常规调用);
 * - 连接器缺失仍按 500 auth 报错(与修复前一致)。
 */

import { describe, expect, it } from "vitest";
import { runQoder, type Peer } from "../src/gateway-upstream-peers.js";
import { UpstreamError } from "@as-one/core/src/gateway/types.js";

/** 只有 `name` 的账号池运行时(网关侧只用它记账)。 */
const runtime = { name: "1" };

function peerOf(record: { model?: string; body?: Record<string, unknown> }): Peer {
  return {
    url: "https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation",
    headers: {},
    creds: { apiKey: "pt-x", username: undefined },
    connector: {
      runWithAccount: async (
        _url: string,
        body: Record<string, unknown>,
        model: string,
      ) => {
        record.model = model;
        record.body = body;
        return { res: new Response("", { status: 200 }), runtime };
      },
    } as unknown as Peer["connector"],
  };
}

const signal = new AbortController().signal;

describe("runQoder 的模型键", () => {
  it("body.model = 端点真名 → 用它,不看调用方传的客户端名", async () => {
    const rec: { model?: string } = {};
    await runQoder(
      peerOf(rec),
      { model: "qfmodel", messages: [{ role: "user", content: "hi" }], stream: true },
      // 调用方(旧网关)传的就是客户端的直连名 —— 修复前正是它把请求打死的。
      "qoder/qfmodel",
      signal,
    );
    expect(rec.model).toBe("qfmodel");
  });

  it("逻辑模型的请求名(auto)同样被端点真名顶掉", async () => {
    const rec: { model?: string } = {};
    await runQoder(
      peerOf(rec),
      { model: "dfmodel", messages: [{ role: "user", content: "hi" }], stream: true },
      "auto",
      signal,
    );
    expect(rec.model).toBe("dfmodel");
  });

  it("body 里没有 model(非常规调用)→ 退回调用方传入的值", async () => {
    const rec: { model?: string } = {};
    await runQoder(peerOf(rec), { messages: [], stream: true }, "qfmodel", signal);
    expect(rec.model).toBe("qfmodel");
  });

  it("body.model 是空串 → 也退回,不把空键发给上游", async () => {
    const rec: { model?: string } = {};
    await runQoder(peerOf(rec), { model: "", messages: [], stream: true }, "qfmodel", signal);
    expect(rec.model).toBe("qfmodel");
  });

  it("连接器未注册 → 500 auth(与修复前一致)", async () => {
    const peer: Peer = { url: "https://x", headers: {}, creds: { apiKey: "pt-x" }, connector: undefined };
    await expect(
      runQoder(peer, { model: "qfmodel", messages: [] }, "qfmodel", signal),
    ).rejects.toBeInstanceOf(UpstreamError);
  });
});
