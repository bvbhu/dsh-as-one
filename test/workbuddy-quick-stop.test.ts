/**
 * `postWorkbuddyWithGate` 的**快速止损**语义(2026-11-08 用户定案)。
 *
 * 11128(渠道校验)命中即**立刻返回**,不再走「中性头 → 零宽扰动」的改造重试:
 * - 改造阶梯是「猜上游拦的是哪一段指纹」,而 11128 按 code 认一族,改不动;
 * - 每一级改造都是一次**真实上游请求**,白打两轮既拖慢首字,
 *   又多点两次风控采样(渠道校验本身就是风控行为)。
 *
 * 所以核心断言是:**上游只被打了 1 次**。
 */
import { describe, expect, it } from "vitest";

import { WorkbuddyAdapter } from "@as-one/core/src/connectors/workbuddy.js";
import { postWorkbuddyWithGate } from "../src/gateway-upstream-peers.js";

interface FetchCall {
  url: string;
  body: string;
}

/** 造一个统计调用次数的 fetch,按脚本返回响应。 */
function countingFetch(script: Array<{ status: number; body: unknown }>): {
  fetchFn: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    const step = script[Math.min(i, script.length - 1)]!;
    calls.push({ url: String(url), body: String(init.body ?? "") });
    i += 1;
    return {
      status: step.status,
      ok: step.status >= 200 && step.status < 300,
      // ⚠️ headers 不能省:分类路径要读 `Retry-After`(headerRecord(res.headers)),
      // 缺了会在连接器里抛错、被 catch 吞掉后回落通用分类器 —— 而通用分类器
      // **不认 11128**,于是 detail 里就没有「11128」字样了。
      headers: new Headers(),
      text: async () => JSON.stringify(step.body),
    };
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const CHANNEL_REJECT_BODY = { code: 11128, msg: "请求被网关的渠道校验拦截", data: null };

/** 调一次 gate(注入假 fetch + 真实 workbuddy 连接器,让 11128 走真分类)。 */
async function callGate(fetchFn: typeof fetch): Promise<unknown> {
  return postWorkbuddyWithGate(
    "https://api.example.invalid/v2/chat/completions",
    { Authorization: "Bearer x" },
    { model: "m", messages: [{ role: "user", content: "hi" }] },
    new AbortController().signal,
    new WorkbuddyAdapter(),
    fetchFn,
  ).catch((e: unknown) => e);
}

describe("postWorkbuddyWithGate 快速止损", () => {
  it("11128 → 只打一次上游,立刻抛错(不做中性头/零宽扰动重试)", async () => {
    const { fetchFn, calls } = countingFetch([{ status: 400, body: CHANNEL_REJECT_BODY }]);
    const err = await callGate(fetchFn);

    // ⚠️ 核心:上游只被打了 1 次(旧实现会打 3 次)。
    expect(calls).toHaveLength(1);
    expect(err).toBeInstanceOf(Error);
    const text = String((err as Error).message);
    // detail 里带上宿主侧的命中说明(排查用)。
    expect(text).toContain("11128");
  });

  it("11128 → 报错里的 raw 保持上游原文(客户端看到的不是我们的转述)", async () => {
    const { fetchFn } = countingFetch([{ status: 400, body: CHANNEL_REJECT_BODY }]);
    const err = await callGate(fetchFn);
    const raw = (err as { raw?: { text?: string } }).raw;
    expect(raw?.text).toContain("11128");
  });

  it("非 11128 的失败(限流)→ 仍只打一次,且原样抛(不拼渠道校验文案)", async () => {
    const { fetchFn, calls } = countingFetch([{ status: 429, body: { code: 429, msg: "too many requests" } }]);
    const err = await callGate(fetchFn);
    expect(calls).toHaveLength(1);
    expect(err).toBeInstanceOf(Error);
  });

  it("成功 → 原样返回 Response,只打一次", async () => {
    const { fetchFn, calls } = countingFetch([{ status: 200, body: { ok: true } }]);
    const res = await postWorkbuddyWithGate(
      "https://api.example.invalid/v2/chat/completions",
      { Authorization: "Bearer x" },
      { model: "m", messages: [{ role: "user", content: "hi" }] },
      new AbortController().signal,
      undefined,
      fetchFn,
    );
    expect(res).toBeTruthy();
    expect(calls).toHaveLength(1);
  });
});
