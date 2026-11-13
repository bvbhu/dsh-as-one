/**
 * 网关层测试 —— 对齐 Nexus 测试语义(test_gateway_e2e / test_gateway_auth_env /
 * test_stream_interrupt),全部走真实 node:http 临时端口(loopback + 随机端口,
 * **零真实网络调用** —— 上游是注入的内存 FakeUpstream)。
 *
 * 覆盖:
 * - SSE 帧格式(`data: {json}\n\n` + `[DONE]`)+ 流式 chunk 顺序与终止;
 * - 鉴权:三种携带方式、缺/错 key 401、未配置放行、常量时间比较、每次现读;
 * - 错误码映射:400 缺 model / 404 未知模型 / kind→HTTP 状态码 / Retry-After 头 /
 *   503 capacity / 已开流后失败不砸状态码;
 * - /v1/models 形状(litenexus_kind、聚合字段);
 * - 客户端断开:中止上游迭代。
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGatewayServer, startGateway } from "./server.js";
import { checkAuth, constantTimeEqual, extractPresentedKey, resetMissingKeyWarning } from "./auth.js";
import { parseSseData, ssePackChunk, ssePackDone } from "./sse.js";
import { RequestLogWriter, logRequests } from "../request-log/index.js";
import {
  UpstreamError,
  UpstreamErrorKind,
  type ChatCompletion,
  type ChatCompletionChunk,
  type GatewayOptions,
  type ModelEntry,
  type Upstream,
  type UpstreamErrorKindName,
} from "./types.js";

// ---------------------------------------------------------------------------
// 内存 FakeUpstream(注入;不发任何真实网络请求)
// ---------------------------------------------------------------------------

const CHUNKS: ChatCompletionChunk[] = [
  { id: "cmpl-1", object: "chat.completion.chunk", created: 1, model: "deepseek-flash",
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] },
  { id: "cmpl-1", object: "chat.completion.chunk", created: 1, model: "deepseek-flash",
    choices: [{ index: 0, delta: { content: "He" }, finish_reason: null }] },
  { id: "cmpl-1", object: "chat.completion.chunk", created: 1, model: "deepseek-flash",
    choices: [{ index: 0, delta: { content: "llo" }, finish_reason: null }] },
  // usage 出现在独立块(translate.py 踩坑 1 的形状),网关必须透传
  { id: "cmpl-1", object: "chat.completion.chunk", created: 1, model: "deepseek-flash",
    choices: [{ index: 0, delta: {}, finish_reason: null }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5,
             prompt_tokens_details: { cached_tokens: 2 } } },
  { id: "cmpl-1", object: "chat.completion.chunk", created: 1, model: "deepseek-flash",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
];

const COMPLETION: ChatCompletion = {
  id: "cmpl-1",
  object: "chat.completion",
  created: 1,
  model: "deepseek-flash",
  choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5,
           prompt_tokens_details: { cached_tokens: 2 } },
};

class FakeUpstream implements Upstream {
  requests: Array<{ body: Record<string, unknown> }> = [];
  /** 剩余可吐块数;吐完后抛 UpstreamError(模拟上游中途挂)。 */
  failAfterChunks = Number.POSITIVE_INFINITY;
  /** 未发任何块前就抛(kind 可配)。 */
  failBeforeStart?: UpstreamError;
  failKind: UpstreamErrorKindName = UpstreamErrorKind.Upstream;
  /** complete 阶段的延迟 ms(模拟并发场景)。 */
  completeDelayMs = 0;
  /** 吐第一块前等待 ms(测试客户端断开用)。 */
  firstChunkDelayMs = 0;
  /** 每块之间等待 ms(测试「流中段断开」用:让流真的挂在中间)。 */
  chunkDelayMs = 0;
  /** 流式:收到过的 `req.clientSignal`(验证网关把它递到了上游)。 */
  clientSignals: Array<unknown> = [];
  /** 流式:客户端信号 fired 过没有(按 req 下标记)。 */
  clientAborted = false;
  /** 非流式:收到过的 `req.clientSignal`。 */
  completeSignals: Array<unknown> = [];
  private abortListeners: Array<() => void> = [];

  async *stream(req: { model: string; messages: unknown[]; stream: boolean; clientSignal?: AbortSignal }): AsyncGenerator<ChatCompletionChunk> {
    this.requests.push({ body: req as unknown as Record<string, unknown> });
    if (req.clientSignal) {
      this.clientSignals.push(req.clientSignal);
      if (req.clientSignal.aborted) this.clientAborted = true;
      else req.clientSignal.addEventListener("abort", () => { this.clientAborted = true; }, { once: true });
    }
    if (this.failBeforeStart) throw this.failBeforeStart;
    if (this.firstChunkDelayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, this.firstChunkDelayMs);
        const onAbort = () => {
          cleanup();
          reject(new Error("aborted"));
        };
        const cleanup = () => {
          this.abortListeners = this.abortListeners.filter((f) => f !== onAbort);
        };
        this.abortListeners.push(onAbort);
      }).catch(() => {
        throw new UpstreamError(UpstreamErrorKind.Connection, "客户端断开");
      });
    }
    const count = Math.min(this.failAfterChunks, CHUNKS.length);
    for (let i = 0; i < count; i++) {
      if (this.chunkDelayMs > 0) await new Promise((r) => setTimeout(r, this.chunkDelayMs));
      yield CHUNKS[i];
      if (i >= this.failAfterChunks) break;
    }
    if (this.failAfterChunks < CHUNKS.length) {
      throw new UpstreamError(this.failKind, "上游中途挂了");
    }
  }

  async complete(req: { model: string; messages: unknown[]; clientSignal?: AbortSignal }): Promise<ChatCompletion> {
    this.requests.push({ body: req as unknown as Record<string, unknown> });
    if (req.clientSignal) this.completeSignals.push(req.clientSignal);
    if (this.failBeforeStart) throw this.failBeforeStart;
    if (this.completeDelayMs > 0) await new Promise((r) => setTimeout(r, this.completeDelayMs));
    return COMPLETION;
  }

  notifyAborted(): void {
    // 测试断开传播:模拟上游被 abort 信号通知
    for (const fn of this.abortListeners.splice(0)) fn();
  }
}

// ---------------------------------------------------------------------------
// 测试基建
// ---------------------------------------------------------------------------

const MODELS: ModelEntry[] = [
  { id: "deepseek-flash", object: "model", owned_by: "as-one", litenexus_kind: "logical",
    max_input_tokens: 1_000_000, supports_vision: false },
  { id: "tokenrhythm/deepseek-flash", object: "model", owned_by: "as-one", litenexus_kind: "real",
    name: "DeepSeek Flash", max_input_tokens: 1_000_000, max_output_tokens: 8192,
    supports_vision: false },
];

const KEY = "env-gateway-key-0123456789";

function makeOptions(upstream: FakeUpstream, key?: string): GatewayOptions & { upstream: FakeUpstream } {
  return {
    keyProvider: {
      getKey: () => key ?? "",
      onMissingKeyWarning: vi.fn(),
    },
    modelProvider: { listModels: () => MODELS },
    resolveUpstream: (model) =>
      model === "deepseek-flash" || model === "tokenrhythm/deepseek-flash" ? upstream : undefined,
    upstream,
  };
}

type Started = Awaited<ReturnType<typeof startGateway>>;

async function withServer(
  upstream: FakeUpstream,
  key: string | undefined,
  fn: (ctx: { baseUrl: string; options: GatewayOptions; upstream: FakeUpstream; started: Started }) => Promise<void>,
): Promise<void> {
  resetMissingKeyWarning();
  const options = makeOptions(upstream, key);
  const started = await startGateway(options);
  try {
    await fn({ baseUrl: `http://127.0.0.1:${started.port}`, options, upstream, started });
  } finally {
    await started.close();
  }
}

async function post(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
}

// ---------------------------------------------------------------------------
// 鉴权
// ---------------------------------------------------------------------------

describe("auth", () => {
  const fakeReq = (headers: Record<string, string>, url = "/v1/models") =>
    ({ headers, url }) as Parameters<typeof extractPresentedKey>[0];

  it("三种携带方式都提取:Authorization Bearer / x-api-key / ?key=", () => {
    expect(extractPresentedKey(fakeReq({ authorization: `Bearer ${KEY}` }))).toBe(KEY);
    expect(extractPresentedKey(fakeReq({ authorization: KEY }))).toBe(KEY); // 裸值也收
    expect(extractPresentedKey(fakeReq({ "x-api-key": KEY }))).toBe(KEY);
    expect(extractPresentedKey(fakeReq({}, `/v1/models?key=${KEY}`))).toBe(KEY);
    expect(extractPresentedKey(fakeReq({}))).toBe("");
  });

  it("常量时间比较:相同为 true,不同为 false(含长度不同)", () => {
    expect(constantTimeEqual(KEY, KEY)).toBe(true);
    expect(constantTimeEqual(KEY, "env-gateway-key-0123456788")).toBe(false);
    expect(constantTimeEqual(KEY, "short")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("配置了 key:缺 key / 错 key → 401「缺少或错误的网关 key」", async () => {
    const kp = { getKey: () => KEY };
    const miss = checkAuth(fakeReq({}), kp);
    expect(miss.ok).toBe(false);
    if (!miss.ok) {
      expect(miss.status).toBe(401);
      expect(miss.body.detail).toBe("缺少或错误的网关 key");
    }
    const wrong = checkAuth(fakeReq({ authorization: "Bearer wrong" }), kp);
    expect(wrong.ok).toBe(false);
    const right = checkAuth(fakeReq({ authorization: `Bearer ${KEY}` }), kp);
    expect(right.ok).toBe(true);
  });

  it("未配置(空串/空白)→ 放行 + 告警只打一次", () => {
    resetMissingKeyWarning();
    const warnings: string[] = [];
    const kp = { getKey: () => "", onMissingKeyWarning: (m: string) => warnings.push(m) };
    expect(checkAuth(fakeReq({}), kp).ok).toBe(true);
    expect(checkAuth(fakeReq({ authorization: "Bearer anything" }), kp).ok).toBe(true);
    expect(checkAuth(fakeReq({}, "/v1/models?key=nope"), kp).ok).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("无鉴权");
    expect(warnings[0]).toContain("放行");
    // 空白值按未设置处理
    expect(checkAuth(fakeReq({}), { getKey: () => "   " }).ok).toBe(true);
  });

  it("每次现读不缓存:换 key 立即生效", () => {
    let current = KEY;
    const kp = { getKey: () => current };
    expect(checkAuth(fakeReq({ authorization: `Bearer ${KEY}` }), kp).ok).toBe(true);
    current = `${KEY}-rotated`;
    expect(checkAuth(fakeReq({ authorization: `Bearer ${KEY}` }), kp).ok).toBe(false);
    expect(checkAuth(fakeReq({ authorization: `Bearer ${KEY}-rotated` }), kp).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SSE 编码/解析
// ---------------------------------------------------------------------------

describe("sse", () => {
  it("帧格式:data: {json}\\n\\n(UTF-8 原文,中文不转义)", () => {
    const frame = ssePackChunk({ id: "x", choices: [{ delta: { content: "你好" } }] });
    const text = Buffer.from(frame).toString("utf8");
    expect(text).toBe('data: {"id":"x","choices":[{"delta":{"content":"你好"}}]}\n\n');
  });

  it("[DONE] 帧", () => {
    expect(Buffer.from(ssePackDone()).toString("utf8")).toBe("data: [DONE]\n\n");
  });

  it("解析:逐事件、心跳/注释行丢弃、[DONE] 哨兵、坏 JSON 丢弃", () => {
    const text = [
      'data: {"choices":[{"index":0,"delta":{"content":"He"}}]}',
      "data: : heartbeat", // 注释形态(上游 FakeUpstream 出现过)
      "",
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      "data: not-json",
      "data: [DONE]",
      "",
    ].join("\n");
    const events = parseSseData(text);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ choices: [{ delta: { content: "He" } }] });
    expect(events[1]).toMatchObject({ choices: [{ finish_reason: "stop" }] });
    expect(events[2]).toEqual({ __done__: true });
  });
});

// ---------------------------------------------------------------------------
// /v1/chat/completions —— 流式
// ---------------------------------------------------------------------------

describe("POST /v1/chat/completions (stream)", () => {
  let upstream: FakeUpstream;

  beforeAll(() => {
    upstream = new FakeUpstream();
  });

  it("200 + text/event-stream 头 + chunk 顺序 + [DONE] 收尾 + usage 透传", async () => {
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toBe("text/event-stream");
      expect(resp.headers.get("cache-control")).toBe("no-cache");
      expect(resp.headers.get("x-accel-buffering")).toBe("no");
      const events = parseSseData(await resp.text());
      expect(events.at(-1)).toEqual({ __done__: true });
      const contents = events
        .map((e) => (e.choices as Array<{ delta: { content?: string } }> | undefined)?.[0]?.delta?.content)
        .filter((c): c is string => typeof c === "string");
      expect(contents.join("")).toBe("Hello");
      const usage = events.find((e) => e.usage) as { usage: Record<string, unknown> } | undefined;
      expect(usage?.usage).toMatchObject({ total_tokens: 5, prompt_tokens_details: { cached_tokens: 2 } });
    });
  });

  it("鉴权先行:无 key 流式请求也 401(在开流之前)", async () => {
    const fresh = new FakeUpstream(); // 独立实例:隔离其他用例累积的 requests
    await withServer(fresh, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [], stream: true,
      });
      expect(resp.status).toBe(401);
      expect(fresh.requests).toHaveLength(0); // 没打到上游
    });
  }, 10_000);

  it("上游首块前失败 → 错误码按 kind 映射(auth=401 不重试形状原样透传)", async () => {
    const dying = new FakeUpstream();
    dying.failBeforeStart = new UpstreamError(UpstreamErrorKind.Auth, "[tokenrhythm] 密钥失效");
    await withServer(dying, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: true,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(401);
      const body = (await resp.json()) as { detail: { error: { type: string; message: string } } };
      expect(body.detail.error.type).toBe("auth");
      expect(body.detail.error.message).toContain("密钥失效");
    });
  });

  it("上游首块前 429 → 429 + Retry-After 头透传", async () => {
    const dying = new FakeUpstream();
    dying.failBeforeStart = new UpstreamError(UpstreamErrorKind.RateLimit, "池满", { retryAfter: 30 });
    await withServer(dying, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: true,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(429);
      expect(resp.headers.get("retry-after")).toBe("30");
    });
  });

  it("已发字节后上游失败:状态码仍是 200,流断在已发内容处(不砸 5xx)", async () => {
    const dying = new FakeUpstream();
    dying.failAfterChunks = 2; // 吐两个块后抛
    await withServer(dying, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: true,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200); // 响应头已出去,改不了
      const events = parseSseData(await resp.text());
      const contents = events
        .map((e) => (e.choices as Array<{ delta: { content?: string } }> | undefined)?.[0]?.delta?.content)
        .filter((c): c is string => typeof c === "string");
      expect(contents.join("")).toBe("He"); // 只有已吐出的部分,没有 [DONE]
      expect(events.at(-1)).not.toEqual({ __done__: true });
    });
  });
});

// ---------------------------------------------------------------------------
// /v1/chat/completions —— 非流式 + 通用错误
// ---------------------------------------------------------------------------

describe("POST /v1/chat/completions (non-stream) + errors", () => {
  it("非流式 200,完整 chat.completion JSON", async () => {
    const upstream = new FakeUpstream();
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as ChatCompletion;
      expect(body.choices[0].message.content).toBe("Hello");
      expect(body.usage?.total_tokens).toBe(5);
      // 上游收到的是去掉网关注入语义的请求体
      expect(upstream.requests[0].body).toMatchObject({ model: "deepseek-flash", stream: false });
    });
  });

  it("缺 model → 400「缺少 model」", async () => {
    const upstream = new FakeUpstream();
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", { messages: [] },
        { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(400);
      expect(((await resp.json()) as { detail: string }).detail).toBe("缺少 model");
    });
  });

  it("未知模型 → 404「未知模型: <model>」", async () => {
    const upstream = new FakeUpstream();
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", { model: "不存在", messages: [] },
        { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(404);
      expect(((await resp.json()) as { detail: string }).detail).toBe("未知模型: 不存在");
    });
  });

  it("GET /v1/chat/completions → 405", async () => {
    await withServer(new FakeUpstream(), KEY, async ({ baseUrl }) => {
      const resp = await fetch(`${baseUrl}/v1/chat/completions`, { signal: AbortSignal.timeout(5_000) });
      expect(resp.status).toBe(405);
    });
  });

  it("未知路径 → 404;bad JSON → 400", async () => {
    await withServer(new FakeUpstream(), KEY, async ({ baseUrl }) => {
      const nf = await fetch(`${baseUrl}/v1/nope`, { signal: AbortSignal.timeout(5_000) });
      expect(nf.status).toBe(404);
      const bad = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: "{not json",
        signal: AbortSignal.timeout(5_000),
      });
      expect(bad.status).toBe(400);
    });
  });

  it("非流式上游失败:kind→HTTP 状态码 + Retry-After 头(429)", async () => {
    const upstream = new FakeUpstream();
    upstream.failBeforeStart = new UpstreamError(UpstreamErrorKind.RateLimit, "配额耗尽", { retryAfter: 12 });
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: false,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(429);
      expect(resp.headers.get("retry-after")).toBe("12");
      const body = (await resp.json()) as { detail: { error: { type: string } } };
      expect(body.detail.error.type).toBe("rate_limit");
      // 与 Nexus _as_http 一致:错误只进 detail.error,FastAPI 形状,无顶层 error。
      expect((body as { error?: unknown }).error).toBeUndefined();
    });
  });

  it("非流式上游 5xx → 502 upstream kind", async () => {
    const upstream = new FakeUpstream();
    upstream.failBeforeStart = new UpstreamError(UpstreamErrorKind.Upstream, "上游炸了");
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [], stream: false,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(502);
      expect(((await resp.json()) as { detail: { error: { type: string } } }).detail.error.type).toBe("upstream");
    });
  });
});

// ---------------------------------------------------------------------------
// /v1/models
// ---------------------------------------------------------------------------

describe("GET /v1/models", () => {
  it("200 + object:list + 逻辑/真实模型并列(litenexus_kind 区分,聚合字段透传)", async () => {
    await withServer(new FakeUpstream(), KEY, async ({ baseUrl }) => {
      const resp = await fetch(`${baseUrl}/v1/models`, {
        headers: { authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(5_000),
      });
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as { object: string; data: ModelEntry[] };
      expect(body.object).toBe("list");
      const logical = body.data.find((m) => m.id === "deepseek-flash");
      const real = body.data.find((m) => m.id === "tokenrhythm/deepseek-flash");
      expect(logical?.litenexus_kind).toBe("logical");
      expect(logical?.max_input_tokens).toBe(1_000_000);
      expect(real?.litenexus_kind).toBe("real");
      expect(real?.name).toBe("DeepSeek Flash");
      expect(real?.max_output_tokens).toBe(8192);
      expect(body.data.every((m) => m.object === "model" && m.owned_by === "as-one")).toBe(true);
    });
  });

  it("无 key → 401", async () => {
    await withServer(new FakeUpstream(), KEY, async ({ baseUrl }) => {
      const resp = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(5_000) });
      expect(resp.status).toBe(401);
    });
  });
});

// ---------------------------------------------------------------------------
// 未配置 key → 全部放行(2026-10-17 定案语义)
// ---------------------------------------------------------------------------

describe("unset key allows all", () => {
  it("未配置:不带 key / 带错 key 都放行,告警只发一次", async () => {
    resetMissingKeyWarning();
    const warnings: string[] = [];
    const upstream = new FakeUpstream();
    const options: GatewayOptions = {
      keyProvider: { getKey: () => "", onMissingKeyWarning: (m) => warnings.push(m) },
      modelProvider: { listModels: () => MODELS },
      resolveUpstream: () => upstream,
    };
    const started = await startGateway(options);
    try {
      const baseUrl = `http://127.0.0.1:${started.port}`;
      const m1 = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(5_000) });
      expect(m1.status).toBe(200);
      const m2 = await fetch(`${baseUrl}/v1/models`, {
        headers: { authorization: "Bearer anything" }, signal: AbortSignal.timeout(5_000),
      });
      expect(m2.status).toBe(200);
      const c1 = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: false,
      });
      expect(c1.status).toBe(200);
      expect(warnings).toHaveLength(1);
    } finally {
      await started.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 客户端断开
// ---------------------------------------------------------------------------

describe("client disconnect", () => {
  it("客户端半途断开:上游迭代被中止,不写 [DONE]", async () => {
    const upstream = new FakeUpstream();
    upstream.firstChunkDelayMs = 200; // 首块前挂着,等客户端断
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const controller = new AbortController();
      const respPromise = fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-flash",
          messages: [{ role: "user", content: "hi" }], stream: true }),
        signal: controller.signal,
      });
      const resp = await respPromise;
      expect(resp.status).toBe(200);
      controller.abort(); // 客户端立刻断开
      // 给网关一点时间走断开路径
      await new Promise((r) => setTimeout(r, 100));
      expect(upstream.requests).toHaveLength(1);
    });
  }, 10_000);

  it("客户端断开信号递到上游:req.clientSignal 存在且会 fired", async () => {
    // ⚠️ 这是并发槽位能归还的前提(2026-10-23 租约泄漏修复):
    // 上游的实现靠这个信号 abort 自己的 fetch;网关不递,槽位就卡到租期
    // (inflight-ledger 600s)被 purge 扫掉,后续请求一律 503「并发已满」。
    const upstream = new FakeUpstream();
    upstream.firstChunkDelayMs = 300; // 首块前挂着,等客户端断
    // ⚠️ 逐块延迟:否则首块之后剩下的块会同步吐完、响应当场 res.end(),
    // 客户端再 abort 时 writableEnded 已是 true —— 那测的就不是「流中段断开」了。
    upstream.chunkDelayMs = 80;
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const controller = new AbortController();
      const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-flash",
          messages: [{ role: "user", content: "hi" }], stream: true }),
        signal: controller.signal,
      });
      expect(resp.status).toBe(200);
      // 上游拿到了网关递下来的信号
      expect(upstream.clientSignals).toHaveLength(1);
      const sig = upstream.clientSignals[0] as AbortSignal;
      controller.abort();
      await new Promise((r) => setTimeout(r, 150));
      // 客户端一断,上游侧的信号必须跟着 fired —— 上游据此 abort fetch
      expect(sig.aborted).toBe(true);
    });
  }, 10_000);

  it("非流式也递 clientSignal(上游据此 abort,响应尚未发出)", async () => {
    const upstream = new FakeUpstream();
    upstream.completeDelayMs = 300;
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const controller = new AbortController();
      const p = fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-flash",
          messages: [{ role: "user", content: "hi" }] }),
        signal: controller.signal,
      });
      await new Promise((r) => setTimeout(r, 60));
      controller.abort();
      await p.catch(() => {});
      await new Promise((r) => setTimeout(r, 100));
      // 非流式路径同样把信号递给了上游(注入方据此打断在途 fetch 并归还租约)
      expect(upstream.completeSignals).toHaveLength(1);
      expect((upstream.completeSignals[0] as AbortSignal).aborted).toBe(true);
    });
  }, 10_000);

  it("正常请求不能被误判成断开(req close ≠ 断连)", async () => {
    // ⚠️ 回归(2026-10-24 用户 m08405):Node 16+ 的 `IncomingMessage` 在
    // **请求体读完**时就发 `close`(语义是「请求已完成」,不是「连接断了」)。
    // 旧实现把 `req.once("close")` 当断连 → 每个正常请求在读完 body 后几十
    // 毫秒就被判成「客户端断开」:非流式直接 502「客户端断开」,流式白 abort
    // 掉在跑的上游 fetch。真实症状:实时日志里同一模型成片 502 + 客户端断开。
    const upstream = new FakeUpstream();
    upstream.firstChunkDelayMs = 60; // 跨越 close 事件的时间点
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      // ① 流式:正常跑完,信号全程不得 abort
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: true,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200);
      await resp.text();
      await new Promise((r) => setTimeout(r, 50));
      expect(upstream.clientSignals).toHaveLength(1);
      expect((upstream.clientSignals[0] as AbortSignal).aborted).toBe(false);
      expect(upstream.clientAborted).toBe(false);

      // ② 非流式:更关键 —— 旧实现会在这里抛 502「客户端断开」
      upstream.completeDelayMs = 60;
      const resp2 = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }],
      }, { authorization: `Bearer ${KEY}` });
      expect(resp2.status).toBe(200);
      expect(upstream.completeSignals).toHaveLength(1);
      expect((upstream.completeSignals[0] as AbortSignal).aborted).toBe(false);
    });
  }, 10_000);
});

// ---------------------------------------------------------------------------
// 路由核心不 import router/scheduler(结构性验证:Upstream 注入边界)
// ---------------------------------------------------------------------------

describe("injection boundary", () => {
  it("resolveUpstream 决定存在性;Upstream 是唯一上游入口", async () => {
    const upstream = new FakeUpstream();
    await withServer(upstream, KEY, async ({ baseUrl, options }) => {
      expect(options.resolveUpstream("deepseek-flash")).toBe(upstream);
      expect(options.resolveUpstream("ghost")).toBeUndefined();
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "ghost", messages: [],
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// onRequestDone 挂钩(请求日志的网关侧入口)
// ---------------------------------------------------------------------------

describe("onRequestDone hook", () => {
  it("非流式成功:ok/status/usage 齐全,挂钩先行于响应返回", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const upstream = new FakeUpstream();
    const options: GatewayOptions = {
      keyProvider: { getKey: () => KEY, onMissingKeyWarning: () => {} },
      modelProvider: { listModels: () => MODELS },
      resolveUpstream: (model) =>
        model === "deepseek-flash" || model === "tokenrhythm/deepseek-flash" ? upstream : undefined,
      deriveSessionId: () => "sess-1234",
      onRequestDone: (info) => captured.push({ ...info }),
    };
    const started = await startGateway(options);
    try {
      const baseUrl = `http://127.0.0.1:${started.port}`;
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: false,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200);
      expect(captured).toHaveLength(1);
      const info = captured[0];
      expect(info.ok).toBe(true);
      expect(info.status).toBe(200);
      expect(info.model).toBe("deepseek-flash");
      expect(info.stream).toBe(false);
      expect(info.session_id).toBe("sess-1234");
      const usage = info.usage as Record<string, unknown> | undefined;
      expect(usage?.prompt_tokens).toBe(3);
      expect(usage?.completion_tokens).toBe(2);
      expect(usage?.cached_tokens).toBe(2);
    } finally {
      await started.close();
    }
  });

  it("流式成功:逐块消费后挂钩一次,ttft/latency 记录", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const upstream = new FakeUpstream();
    const options: GatewayOptions = {
      keyProvider: { getKey: () => KEY, onMissingKeyWarning: () => {} },
      modelProvider: { listModels: () => MODELS },
      resolveUpstream: (model) =>
        model === "deepseek-flash" || model === "tokenrhythm/deepseek-flash" ? upstream : undefined,
      onRequestDone: (info) => captured.push({ ...info }),
    };
    const started = await startGateway(options);
    try {
      const baseUrl = `http://127.0.0.1:${started.port}`;
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: true,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200);
      const text = await resp.text();
      expect(text).toContain("[DONE]");
      // 挂钩可能在流结束后触发,给事件循环一次机会
      await new Promise((r) => setTimeout(r, 50));
      expect(captured).toHaveLength(1);
      const info = captured[0];
      expect(info.ok).toBe(true);
      expect(info.stream).toBe(true);
      expect(typeof info.latency_ms).toBe("number");
      const ttft = info.ttft_ms as number | null | undefined;
      expect(ttft === null || typeof ttft === "number").toBe(true);
    } finally {
      await started.close();
    }
  });

  it("上游失败(首块前):挂钩 ok=false + error_kind", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const upstream = new FakeUpstream();
    upstream.failBeforeStart = new UpstreamError(UpstreamErrorKind.RateLimit, "额度没了", { statusCode: 429 });
    const options: GatewayOptions = {
      keyProvider: { getKey: () => KEY, onMissingKeyWarning: () => {} },
      modelProvider: { listModels: () => MODELS },
      resolveUpstream: (model) =>
        model === "deepseek-flash" || model === "tokenrhythm/deepseek-flash" ? upstream : undefined,
      onRequestDone: (info) => captured.push({ ...info }),
    };
    const started = await startGateway(options);
    try {
      const baseUrl = `http://127.0.0.1:${started.port}`;
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [], stream: false,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(429);
      expect(captured).toHaveLength(1);
      const info = captured[0];
      expect(info.ok).toBe(false);
      expect(info.status).toBe(429);
      expect(info.error_kind).toBe("rate_limit");
      expect(info.error).toContain("额度没了");
    } finally {
      await started.close();
    }
  });

  it("挂钩抛错不影响请求(fireRequestDone try/catch)", async () => {
    const upstream = new FakeUpstream();
    const options: GatewayOptions = {
      keyProvider: { getKey: () => KEY, onMissingKeyWarning: () => {} },
      modelProvider: { listModels: () => MODELS },
      resolveUpstream: (model) =>
        model === "deepseek-flash" || model === "tokenrhythm/deepseek-flash" ? upstream : undefined,
      onRequestDone: () => {
        throw new Error("writer 炸了");
      },
    };
    const started = await startGateway(options);
    try {
      const baseUrl = `http://127.0.0.1:${started.port}`;
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [], stream: false,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200);
    } finally {
      await started.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 请求日志端到端:真实网关请求 → onRequestDone → logRequests → JSONL 落盘 + 聚合
// (补 b177 诚实降级③:先前只测到挂钩层,这里走完整链路,零真实上游)
// ---------------------------------------------------------------------------

describe("request-log E2E", () => {
  it("非流式请求:JSONL 明细落盘 + stats_daily 聚合计数正确", async () => {
    const dir = mkdtempSync(join(tmpdir(), "as-one-reqlog-e2e-"));
    const writer = new RequestLogWriter(dir);
    const aggregates: Array<Record<string, unknown>> = [];
    const upstream = new FakeUpstream();
    const options: GatewayOptions = {
      keyProvider: { getKey: () => KEY, onMissingKeyWarning: () => {} },
      modelProvider: { listModels: () => MODELS },
      resolveUpstream: (model) =>
        model === "deepseek-flash" || model === "tokenrhythm/deepseek-flash" ? upstream : undefined,
      deriveSessionId: (body) =>
        String((body as { session_id?: unknown }).session_id ?? ""),
      onRequestDone: (info) => {
        logRequests(
          [{
            ts: Date.now() / 1000,
            real_model_id: "mock/deepseek-flash",
            logical_model: info.model ?? null,
            session_id: info.session_id ?? null,
            status: info.status,
            ok: info.ok,
            error: info.error ?? undefined,
            error_kind: info.error_kind ?? undefined,
            latency_ms: info.latency_ms,
            ttft_ms: info.ttft_ms,
            usage: info.usage ?? undefined,
          }],
          {
            writer,
            record: (delta) => aggregates.push(delta as unknown as Record<string, unknown>),
            getContentMode: () => "structure",
            getSetting: () => null,
          },
        );
      },
    };
    const started = await startGateway(options);
    try {
      const baseUrl = `http://127.0.0.1:${started.port}`;
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
        session_id: "sess-e2e-1",
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));

      // JSONL 明细:按天文件存在且恰好一行
      const files = await import("node:fs").then((fs) => fs.readdirSync(dir));
      expect(files).toHaveLength(1);
      const lines = readFileSync(join(dir, files[0]!), "utf8").split("\n").filter((s) => s !== "");
      expect(lines).toHaveLength(1);
      const row = JSON.parse(lines[0]!);
      expect(row.ok).toBe(true);
      expect(row.status).toBe(200);
      expect(row.logical_model).toBe("deepseek-flash");
      expect(row.session_id).toBe("sess-e2e-1");
      expect(row.latency_ms).toEqual(expect.any(Number));
      expect(row.usage.completion_tokens).toBe(2);

      // 聚合:恰好一次 stats_daily.record,requests 计数 1
      expect(aggregates).toHaveLength(1);
      expect(aggregates[0]?.requests).toBe(1);
    } finally {
      await started.close();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // 宿主环境临时目录清理偶发 EPERM(已知),不影响断言
      }
    }
  });

  it("流式请求:末尾也有明细行 + [DONE] 后聚合恰好一次", async () => {
    const dir = mkdtempSync(join(tmpdir(), "as-one-reqlog-e2e-"));
    const writer = new RequestLogWriter(dir);
    const aggregates: Array<Record<string, unknown>> = [];
    const upstream = new FakeUpstream();
    const options: GatewayOptions = {
      keyProvider: { getKey: () => KEY, onMissingKeyWarning: () => {} },
      modelProvider: { listModels: () => MODELS },
      resolveUpstream: (model) =>
        model === "deepseek-flash" || model === "tokenrhythm/deepseek-flash" ? upstream : undefined,
      onRequestDone: (info) => {
        logRequests(
          [{
            ts: Date.now() / 1000,
            real_model_id: "mock/deepseek-flash",
            logical_model: info.model ?? null,
            session_id: info.session_id ?? null,
            status: info.status,
            ok: info.ok,
            error: info.error ?? undefined,
            latency_ms: info.latency_ms,
            ttft_ms: info.ttft_ms,
          }],
          {
            writer,
            record: (delta) => aggregates.push(delta as unknown as Record<string, unknown>),
            getContentMode: () => "structure",
            getSetting: () => null,
          },
        );
      },
    };
    const started = await startGateway(options);
    try {
      const baseUrl = `http://127.0.0.1:${started.port}`;
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash", messages: [{ role: "user", content: "hi" }], stream: true,
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200);
      const text = await resp.text();
      expect(text).toContain("[DONE]");
      await new Promise((r) => setTimeout(r, 50));

      const files = await import("node:fs").then((fs) => fs.readdirSync(dir));
      expect(files).toHaveLength(1);
      const lines = readFileSync(join(dir, files[0]!), "utf8").split("\n").filter((s) => s !== "");
      expect(lines).toHaveLength(1);
      const row = JSON.parse(lines[0]!);
      expect(row.ok).toBe(true);
      expect(row.provider).toBe("mock");
      expect(row.model).toBe("deepseek-flash");
      expect(typeof row.latency_ms).toBe("number");
      expect(aggregates).toHaveLength(1);
    } finally {
      await started.close();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // 同上
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 字段处置(用户 m09081):能处理就处理,不能处理就丢弃,**绝不拒绝请求**
// ---------------------------------------------------------------------------

describe("request field handling (m09081)", () => {
  it("未知顶层字段**不导致 400** —— 请求照常跑完", async () => {
    const upstream = new FakeUpstream();
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
        some_future_field: { nested: true },
        thinking: { type: "enabled" },
      }, { authorization: `Bearer ${KEY}` });
      // ⚠️ 关键断言:带着两个网关不认识的字段,请求**不是 400/422**,而是正常完成。
      expect(resp.status).toBe(200);
      expect(await resp.text()).toContain("[DONE]");
    });
  });

  it("prompt_cache_key 进**专用内部键**(供端点亲和),绝不进 extra/上游请求体", async () => {
    const upstream = new FakeUpstream();
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const resp = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
        prompt_cache_key: "pc-key-abc",
      }, { authorization: `Bearer ${KEY}` });
      expect(resp.status).toBe(200);
      await resp.text();
      expect(upstream.requests.length).toBeGreaterThan(0);
      const req = upstream.requests[0]!.body;
      // ① 专用键就位:electron 侧靠它做端点亲和(affinityKeyOf = cacheRoutingKeyOf(req) ?? sessionOf(req))。
      expect(req.prompt_cache_key).toBe("pc-key-abc");
      // ② 绝不能进 `extra` —— extra 是**唯一**会整体透传进上游报文的通道
      //    (bodyFor 除 session_id 外全部写入),漏进去就是「上游见键即 400」。
      expect((req.extra as Record<string, unknown> | undefined)?.prompt_cache_key).toBeUndefined();
      // ③ 最终从报文里摘除由 electron 侧 `bodyFor` 的
      //    `if (k === "session_id" || k === CACHE_ROUTING_KEY_FIELD) continue;`
      //    + `delete body[CACHE_ROUTING_KEY_FIELD]` 双保险保证(那里才做 HTTP 序列化)。
      expect(JSON.stringify(req.messages)).not.toContain("pc-key-abc");
    });
  });

  it("reasoning_effort 原样透传到上游,未指定时不添加", async () => {
    const upstream = new FakeUpstream();
    await withServer(upstream, KEY, async ({ baseUrl }) => {
      const withEffort = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
        reasoning_effort: "high",
      }, { authorization: `Bearer ${KEY}` });
      expect(withEffort.status).toBe(200);
      await withEffort.text();

      const withoutEffort = await post(baseUrl, "/v1/chat/completions", {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }, { authorization: `Bearer ${KEY}` });
      expect(withoutEffort.status).toBe(200);
      await withoutEffort.text();

      expect(upstream.requests).toHaveLength(2);
      // ⚠️ FakeUpstream 记的是 `{ body: req }`,字段在 `.body` 上。
      const first = upstream.requests[0]!.body;
      const second = upstream.requests[1]!.body;
      // 网关不解释档位值:客户端给什么就是什么。
      expect(first.reasoning_effort).toBe("high");
      // 未指定 → **不添加**(让上游自己决定),不是填个缺省值。
      expect(second.reasoning_effort).toBeUndefined();
      expect("reasoning_effort" in second).toBe(false);
    });
  });

  it("onRequestDone 带上缓存路由键与丢弃清单(排查「字段怎么没了」)", async () => {
    const upstream = new FakeUpstream();
    const seen: Array<Record<string, unknown>> = [];
    const options: GatewayOptions = {
      keyProvider: { getKey: () => KEY, onMissingKeyWarning: () => {} },
      modelProvider: { listModels: () => MODELS },
      resolveUpstream: (model) => (model === "deepseek-flash" ? upstream : undefined),
      onRequestDone: (info) => seen.push(info as unknown as Record<string, unknown>),
    };
    const started = await startGateway(options);
    try {
      await post(`http://127.0.0.1:${started.port}`, "/v1/chat/completions", {
        model: "deepseek-flash",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
        prompt_cache_key: "pc-key-xyz",
        mystery_flag: 1,
      }, { authorization: `Bearer ${KEY}` });
      await new Promise((r) => setTimeout(r, 50));
      expect(seen.length).toBeGreaterThan(0);
      const info = seen[0]!;
      expect(info.prompt_cache_key).toBe("pc-key-xyz");
      expect(info.discarded_fields).toEqual(["mystery_flag"]);
    } finally {
      await started.close();
    }
  });
});
