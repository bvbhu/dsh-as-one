/**
 * DSH LLM adapter 单测。
 *
 * ## 为什么值得单独一个文件
 *
 * 宿主对 adapter 的三条约束都是**运行时校验**(没有类型可依赖):
 * 1. `validateStream`(`@deepseek-ai/dsh-llm/lib/types/invariant.js`)逐块检查
 *    block-start / delta / block-end 配平,`finish` 时不得有未关闭块;
 * 2. `normalizeModelInfo` 要求 `contextWindow` / `defaultMaxTokens` 是正安全整数、
 *    `reasoning.efforts` 非空数组;
 * 3. `normalizeLlmFailure` 只认「own `failure` 且 `failure.code === own code`」。
 *
 * 违反任何一条,现象都是「DSH 里这个模型直接报错」,而错误信息在宿主深处,
 * 排查成本极高。所以下面把宿主的 validateStream **逐字抄一份**当夹具,
 * 让语法错误在 CI 里就炸。
 */

import { describe, expect, it, vi } from "vitest";
import { UpstreamError } from "@as-one/core/src/gateway/types.js";
import type {
  ChatCompletionChunk,
  ModelEntry,
  RequestDoneInfo,
  Upstream,
  UpstreamRequest,
} from "@as-one/core/src/gateway/types.js";
import type { AsOneRuntime } from "../src/setup.js";
import {
  AS_ONE_PROVIDER,
  AsOneLlmAdapter,
  AsOneLlmError,
  finishKindOf,
  modelInfoOf,
  resolveImagesInMessages,
  toChatMessages,
  toLlmError,
  toUpstreamRequestFromOptions,
  translateStream,
} from "../src/llm-adapter.js";
import type { DshGenerateOptions, DshStreamChunk } from "../src/llm-types.js";

// ---------------------------------------------------------------------------
// 夹具:宿主 validateStream 的逐字转录
// (来源 .tmp-probe/asar/outdsh/node_modules/@deepseek-ai/dsh-llm/lib/types/
//  invariant.js:22-72;改了宿主要同步改这里)
// ---------------------------------------------------------------------------

async function* hostValidateStream(
  source: AsyncIterable<DshStreamChunk>,
  fail: (message: string) => void,
): AsyncGenerator<DshStreamChunk> {
  const open = new Map<number, string>();
  let usageSeen = false;
  let finished = false;
  const validateIndex = (index: number): void => {
    if (!Number.isSafeInteger(index) || index < 0) {
      fail(`LLM stream block index must be a non-negative safe integer, got ${index}`);
    }
  };
  const validateDelta = (index: number, expected: string): void => {
    validateIndex(index);
    const actual = open.get(index);
    if (actual !== expected) {
      fail(`${expected} delta at index ${index} requires an open ${expected} block, got ${String(actual)}`);
    }
  };
  for await (const chunk of source) {
    if (finished) fail(`LLM stream emitted ${chunk.type} after terminal finish`);
    switch (chunk.type) {
      case "block-start":
        validateIndex(chunk.index);
        if (open.has(chunk.index)) fail(`LLM stream repeated block-start index ${chunk.index}`);
        open.set(chunk.index, chunk.blockType);
        break;
      case "text-delta":
        validateDelta(chunk.index, "text");
        break;
      case "reasoning-delta":
        validateDelta(chunk.index, "reasoning");
        break;
      case "tool-call-delta":
        validateDelta(chunk.index, "tool-call");
        break;
      case "block-end": {
        validateIndex(chunk.index);
        const blockType = open.get(chunk.index);
        if (blockType === undefined) fail(`LLM stream block-end index ${chunk.index} has no open block`);
        if (chunk.block.type !== blockType) {
          fail(
            `LLM stream block-end index ${chunk.index} closes ${chunk.block.type}, expected ${String(blockType)}`,
          );
        }
        open.delete(chunk.index);
        break;
      }
      case "usage":
        if (usageSeen) fail("LLM stream emitted usage more than once");
        usageSeen = true;
        break;
      case "finish":
        if (open.size > 0 && chunk.reason.kind !== "error" && chunk.reason.kind !== "aborted") {
          fail(`LLM stream finished with ${open.size} open block(s)`);
        }
        finished = true;
        break;
    }
    yield chunk;
  }
  if (!finished) fail("LLM stream ended without a terminal finish chunk");
}

/** 跑完一条流,语法违规直接 throw(测试里等价于失败)。 */
async function collectLegal(source: AsyncIterable<DshStreamChunk>): Promise<DshStreamChunk[]> {
  const violations: string[] = [];
  const out: DshStreamChunk[] = [];
  for await (const chunk of hostValidateStream(source, (m) => violations.push(m))) out.push(chunk);
  if (violations.length > 0) throw new Error(`validateStream: ${violations.join(" | ")}`);
  return out;
}

function chunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
  usage?: Record<string, unknown>,
): ChatCompletionChunk {
  return {
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "m",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(usage ? { usage } : {}),
  } as unknown as ChatCompletionChunk;
}

async function* of(...chunks: ChatCompletionChunk[]): AsyncGenerator<ChatCompletionChunk> {
  for (const c of chunks) yield c;
}

// ---------------------------------------------------------------------------
// translateStream:OpenAI delta → DSH 块语法
// ---------------------------------------------------------------------------

describe("translateStream", () => {
  it("纯文本:一个 text 块,配平,finish=stop", async () => {
    const out = await collectLegal(
      translateStream(
        of(chunk({ role: "assistant" }), chunk({ content: "你好" }), chunk({ content: "世界" }, "stop")),
        "m",
      ),
    );
    expect(out.map((c) => c.type)).toEqual([
      "block-start",
      "text-delta",
      "text-delta",
      "block-end",
      "finish",
    ]);
    const end = out[3] as Extract<DshStreamChunk, { type: "block-end" }>;
    expect(end.block).toEqual({ type: "text", text: "你好世界" });
    const finish = out[4] as Extract<DshStreamChunk, { type: "finish" }>;
    expect(finish.reason.kind).toBe("stop");
  });

  it("reasoning 与 content 并存:两个块,index 递增,各自带完整文本", async () => {
    const out = await collectLegal(
      translateStream(of(chunk({ reasoning_content: "想一下" }), chunk({ content: "答" }), chunk({}, "stop")), "m"),
    );
    const starts = out.filter(
      (c) => c.type === "block-start",
    ) as Extract<DshStreamChunk, { type: "block-start" }>[];
    expect(starts.map((c) => [c.index, c.blockType])).toEqual([
      [0, "reasoning"],
      [1, "text"],
    ]);
    const ends = out.filter(
      (c) => c.type === "block-end",
    ) as Extract<DshStreamChunk, { type: "block-end" }>[];
    expect(ends.map((c) => c.block)).toEqual([
      { type: "reasoning", text: "想一下" },
      { type: "text", text: "答" },
    ]);
  });

  it("并行 tool_calls:按上游 index 分槽,arguments 拼成完整 JSON", async () => {
    const out = await collectLegal(
      translateStream(
        of(
          chunk({
            tool_calls: [
              { index: 0, id: "call_a", type: "function", function: { name: "read", arguments: '{"p":' } },
              { index: 1, id: "call_b", type: "function", function: { name: "write", arguments: "{}" } },
            ],
          }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] }),
          chunk({}, "tool_calls"),
        ),
        "m",
      ),
    );
    const ends = out.filter(
      (c) => c.type === "block-end",
    ) as Extract<DshStreamChunk, { type: "block-end" }>[];
    expect(ends.map((c) => c.block)).toEqual([
      { type: "tool-call", id: "call_a", name: "read", arguments: '{"p":"x"}' },
      { type: "tool-call", id: "call_b", name: "write", arguments: "{}" },
    ]);
    const finish = out.at(-1) as Extract<DshStreamChunk, { type: "finish" }>;
    expect(finish.reason.kind).toBe("tool-calls");
  });

  it("usage 只发一次且在 finish 之前;字段名换成宿主口径", async () => {
    const out = await collectLegal(
      translateStream(
        of(
          chunk({ content: "hi" }, null, {
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14,
            prompt_tokens_details: { cached_tokens: 6 },
            completion_tokens_details: { reasoning_tokens: 2 },
          }),
          chunk({}, "stop"),
        ),
        "m",
      ),
    );
    const usage = out.filter((c) => c.type === "usage") as Extract<DshStreamChunk, { type: "usage" }>[];
    expect(usage).toHaveLength(1);
    // ⚠️ inputTokens 是**未缓存输入**(10 − 6 = 4),不是上游 prompt_tokens。
    // 宿主拿它当 uncachedInputTokens 直接算命中率,填错会让分母把缓存算两遍。
    expect(usage[0].usage).toEqual({
      inputTokens: 4,
      outputTokens: 4,
      totalTokens: 14,
      cacheReadTokens: 6,
      reasoningTokens: 2,
    });
    expect(out.indexOf(usage[0])).toBeLessThan(out.length - 1);
  });

  it("cached 比 prompt 还大时钳到 0,不给宿主负的未缓存输入", async () => {
    const out = await collectLegal(
      translateStream(
        of(chunk({ content: "hi" }, "stop", { prompt_tokens: 100, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 400 } })),
        "m",
      ),
    );
    const usage = out.find((c) => c.type === "usage") as Extract<DshStreamChunk, { type: "usage" }>;
    expect(usage.usage.inputTokens).toBe(0);
    expect(usage.usage.cacheReadTokens).toBe(400);
    expect(usage.usage.totalTokens).toBe(101);
  });

  it("total_tokens 缺失时自己相加;0 缓存 / 0 推理不给键", async () => {
    const out = await collectLegal(
      translateStream(
        of(chunk({ content: "hi" }, "stop", { prompt_tokens: 3, completion_tokens: 5, total_tokens: 0 })),
        "m",
      ),
    );
    const usage = out.find((c) => c.type === "usage") as Extract<DshStreamChunk, { type: "usage" }>;
    expect(usage.usage.totalTokens).toBe(8);
    expect(usage.usage.cacheReadTokens).toBeUndefined();
    expect(usage.usage.reasoningTokens).toBeUndefined();
  });

  it("上游中途抛错:已开的块先关掉再抛(否则 finish 会因 open.size>0 追加报错)", async () => {
    const boom = (async function* (): AsyncGenerator<ChatCompletionChunk> {
      yield chunk({ reasoning_content: "半句" });
      throw new UpstreamError("rate_limit", "慢点", { retryAfter: 2, statusCode: 429 });
    })();
    const seen: DshStreamChunk[] = [];
    let caught: unknown;
    try {
      for await (const c of translateStream(boom, "m")) seen.push(c);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AsOneLlmError);
    expect((caught as AsOneLlmError).code).toBe("RATE_LIMIT");
    expect((caught as AsOneLlmError).failure.status).toBe(429);
    expect((caught as AsOneLlmError).failure.providerRetryAfterMs).toBe(2000);
    expect(seen.map((c) => c.type)).toEqual(["block-start", "reasoning-delta", "block-end"]);
  });

  it("零内容 + finish_reason=stop → EMPTY_RESPONSE(空白助手消息比报错更难查)", async () => {
    await expect(collectLegal(translateStream(of(chunk({}, "stop")), "m"))).rejects.toThrow(/未返回任何内容/);
  });

  it("signal 已 abort → 不等上游吐完,立即抛 ABORTED(终止会话不拖沓)", async () => {
    // 模拟「本地合成流不响应 fetch abort」的最坏情况:上游承诺永远吐不完,
    // 只有主动信号检查能救 —— 这正是 2026-11-06 用户反馈的场景。
    const endless = (async function* (): AsyncGenerator<ChatCompletionChunk> {
      // 这里不 return、不抛:真实本地合成流在停止后还继续吐(或挂着等读)。
      for (;;) await new Promise((r) => setTimeout(r, 50));
    })();
    const ac = new AbortController();
    ac.abort();
    const seen: DshStreamChunk[] = [];
    let caught: unknown;
    const t0 = Date.now();
    try {
      for await (const c of translateStream(endless, "m", ac.signal)) seen.push(c);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AsOneLlmError);
    expect((caught as AsOneLlmError).code).toBe("ABORTED");
    // race 语义:abort 在取第一块前就命中 → 没来得及开块也正确,重点是**没等**。
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("中途 abort(已开块):关掉已开块再抛 ABORTED(宿主 finish 要求 open.size===0)", async () => {
    // 先正常吐一块(开 reasoning 块),第二块之前 abort —— 模拟「生成到一半被停」。
    const source = (async function* (): AsyncGenerator<ChatCompletionChunk> {
      yield chunk({ reasoning_content: "半句" });
      for (;;) await new Promise((r) => setTimeout(r, 50));
    })();
    const ac = new AbortController();
    const seen: DshStreamChunk[] = [];
    let caught: unknown;
    // 手动推进:第一块照常收(此时 ac 未 abort),收完立即 abort。
    const iterator = translateStream(source, "m", ac.signal)[Symbol.asyncIterator]();
    const first = await iterator.next();
    seen.push(first.value);
    ac.abort();
    try {
      for (;;) seen.push((await iterator.next()).value);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AsOneLlmError);
    expect((caught as AsOneLlmError).code).toBe("ABORTED");
    expect(seen.map((c) => c.type)).toEqual(["block-start", "reasoning-delta", "block-end"]);
  });

  it("signal 正常(未 abort)→ 行为不变,照常收到 finish", async () => {
    const ac = new AbortController();
    const out = await collectLegal(translateStream(of(chunk({ content: "hi" }, "stop")), "m", ac.signal));
    expect(out.at(-1)?.type).toBe("finish");
  });

  it("只有 reasoning 也算有内容(思考模型不回正文是合法的)", async () => {
    const out = await collectLegal(translateStream(of(chunk({ reasoning_content: "x" }, "stop")), "m"));
    expect(out.at(-1)?.type).toBe("finish");
  });

  it("finishKindOf:length→max-tokens,function_call→tool-calls,未知→stop", () => {
    expect(finishKindOf("length")).toBe("max-tokens");
    expect(finishKindOf("tool_calls")).toBe("tool-calls");
    expect(finishKindOf("function_call")).toBe("tool-calls");
    expect(finishKindOf(null)).toBe("stop");
    expect(finishKindOf("content_filter")).toBe("stop");
  });
});

// ---------------------------------------------------------------------------
// 元数据
// ---------------------------------------------------------------------------

function entry(over: Partial<ModelEntry> = {}): ModelEntry {
  return { id: "stub/m1", object: "model", owned_by: "stub", ...over } as ModelEntry;
}

describe("modelInfoOf", () => {
  it("provider 逐字回传入参(宿主 normalizeModelInfo 的第一条硬判)", () => {
    expect(modelInfoOf(entry(), "as-one").provider).toBe("as-one");
  });

  it("窗口/输出上限:正整数才给,NULL、0、负数、非整数一律不给", () => {
    expect(modelInfoOf(entry({ max_input_tokens: 1000000, max_output_tokens: 8192 })).context).toEqual({
      contextWindow: 1000000,
    });
    const none = modelInfoOf(entry({ max_input_tokens: 0, max_output_tokens: -1 }));
    expect(none.context).toBeUndefined();
    expect(none.defaultMaxTokens).toBeUndefined();
    const weird = modelInfoOf(entry({ max_input_tokens: 1.5, max_output_tokens: undefined }));
    expect(weird.context).toBeUndefined();
    expect(weird.defaultMaxTokens).toBeUndefined();
  });

  it("efforts 空数组 / null 时不声明 reasoning(声明空数组 = INVALID_MODEL_REASONING)", () => {
    expect(modelInfoOf(entry({ reasoning_efforts: [] })).reasoning).toBeUndefined();
    expect(modelInfoOf(entry({ reasoning_efforts: null })).reasoning).toBeUndefined();
    expect(modelInfoOf(entry({})).reasoning).toBeUndefined();
  });

  it("efforts 非空才声明;allows_off=true 才追加 off 档;显示名固定英文(id 保持规范英文)", () => {
    expect(modelInfoOf(entry({ reasoning_efforts: ["low", "high"] })).reasoning).toEqual({
      efforts: [
        { id: "low", name: "Low" },
        { id: "high", name: "High" },
      ],
    });
    const withOff = modelInfoOf(entry({ reasoning_efforts: ["high"], reasoning_allows_off: true }));
    expect(withOff.reasoning?.efforts.map((e) => e.id)).toEqual(["high", "off"]);
    expect(withOff.reasoning?.efforts.map((e) => e.name)).toEqual(["High", "Off"]);
    // null 是「上游没说」,不等于「可以关」
    expect(
      modelInfoOf(entry({ reasoning_efforts: ["high"], reasoning_allows_off: null })).reasoning?.efforts,
    ).toHaveLength(1);
  });

  it("逻辑模型与真实模型的描述区分开(选择器里靠它认类型)", () => {
    expect(
      modelInfoOf(entry({ id: "auto", owned_by: "router", litenexus_kind: "logical" })).description,
    ).toBe("逻辑模型 · 由 router 调度");
    expect(modelInfoOf(entry({ id: "stub/m1", owned_by: "stub" })).description).toBe("真实模型 · stub");
  });

  /**
   * 输入模态**一律**声明 `["text","image"]` —— 声明的是「这个路由接受图片附件」,
   * 不是「上游看得见图」。
   *
   * ⚠️ 2026-11-02「模型读不了图」:以前按 `supports_vision` 声明,文本模型就不声明
   * image,于是宿主把图整块替换成 `[image omitted because this model accepts text
   * only; …]`(`projectImagesForTextModel`),`read_image` 工具更是直接拒绝执行 ——
   * 网关的图像桥(把图逐张转成文字证据)**永远收不到图**。上游是文本模型没错,
   * 但桥接正是为这种模型准备的:声明 image 之后图能到网关,再由网关决定透传
   * (链上有视觉端点)还是桥接(没有)。
   */
  it("任何模型都声明 image —— 图先送到网关,由图像桥决定透传还是转文字", () => {
    expect(modelInfoOf(entry({ supports_vision: true })).inputModalities).toEqual(["text", "image"]);
    expect(modelInfoOf(entry({ supports_vision: false })).inputModalities).toEqual(["text", "image"]);
    expect(modelInfoOf(entry({})).inputModalities).toEqual(["text", "image"]);
  });
});

// ---------------------------------------------------------------------------
// 请求方向
// ---------------------------------------------------------------------------

const text = (t: string) => ({ type: "text" as const, text: t });

describe("toChatMessages", () => {
  it("options.system 与历史 system 合并成**一条**前置 system", () => {
    const messages = toChatMessages({
      provider: AS_ONE_PROVIDER,
      model: "m",
      system: "外层",
      messages: [{ role: "system", content: [text("内层")] }, { role: "user", content: [text("问题")] }],
    } as DshGenerateOptions);
    expect(messages[0]).toEqual({ role: "system", content: "外层\n\n内层" });
    expect(messages[1]).toEqual({ role: "user", content: "问题" });
  });

  it("assistant 拆出 reasoning_content 与 tool_calls;没有正文时给空串(不收 null)", () => {
    const messages = toChatMessages({
      provider: AS_ONE_PROVIDER,
      model: "m",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "想过" },
            { type: "tool-call", id: "c1", name: "read", arguments: '{"p":1}' },
          ],
        },
        { role: "tool", content: [text("结果")], toolCallId: "c1" },
      ],
    } as DshGenerateOptions);
    expect(messages[0]).toEqual({
      role: "assistant",
      content: "",
      reasoning_content: "想过",
      tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: '{"p":1}' } }],
    });
    expect(messages[1]).toEqual({ role: "tool", content: "结果", tool_call_id: "c1" });
  });

  it("developer 归入 system;多个文本块用换行拼接", () => {
    const messages = toChatMessages({
      provider: AS_ONE_PROVIDER,
      model: "m",
      messages: [
        { role: "developer", content: [text("指令")] },
        { role: "user", content: [text("a"), text("b")] },
      ],
    } as DshGenerateOptions);
    expect(messages[0]).toEqual({ role: "system", content: "指令" });
    expect(messages[1]?.content).toBe("a\nb");
  });

  /**
   * 图片块 → OpenAI 多模态 content。
   *
   * 声明 `inputModalities` 含 image 之后,宿主会**真发图片块**过来;此前
   * `messageText()` 只取 text 块,图片被无声丢弃 —— 「声明了支持却丢图」比
   * 不声明更糟。这里钉住转换形状与字段容错。
   */
  it("user 图片块 → image_url 分段(文本与图顺序保留)", () => {
    const messages = toChatMessages({
      provider: AS_ONE_PROVIDER,
      model: "m",
      messages: [
        {
          role: "user",
          content: [
            text("看图"),
            { type: "image", image_url: { url: "https://x/a.png" } },
            text("再说"),
          ],
        },
      ],
    } as DshGenerateOptions);
    expect(messages[0]?.content).toEqual([
      { type: "text", text: "看图" },
      { type: "image_url", image_url: { url: "https://x/a.png" } },
      { type: "text", text: "再说" },
    ]);
  });

  it("图片字段宽容探测:source.url / data_url / 裸 base64 都能取到", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ type: "image", source: { url: "data:image/png;base64,AA" } }, "data:image/png;base64,AA"],
      [{ type: "image", data_url: "https://x/b.png" }, "https://x/b.png"],
      // 裸 base64(无 data: 前缀)→ 补成 data URL,否则上游认不出
      [{ type: "image", data: "QUJD" }, "data:image/png;base64,QUJD"],
    ];
    for (const [block, expected] of cases) {
      const messages = toChatMessages({
        provider: AS_ONE_PROVIDER,
        model: "m",
        messages: [{ role: "user", content: [block as never] }],
      } as DshGenerateOptions);
      const content = messages[0]?.content;
      expect(Array.isArray(content)).toBe(true);
      expect((content as Array<{ image_url?: { url: string } }>)[0]?.image_url?.url).toBe(expected);
    }
  });

  it("图片块挖不到 URL → 跳过该块,不炸、不丢文本", () => {
    const messages = toChatMessages({
      provider: AS_ONE_PROVIDER,
      model: "m",
      messages: [
        {
          role: "user",
          content: [text("还有文字"), { type: "image", something: "unknown-shape" }],
        },
      ],
    } as DshGenerateOptions);
    // 没有可用图片 → 退回纯字符串(保持最小形状)
    expect(messages[0]?.content).toBe("还有文字");
  });

  it("无图 user 消息仍是纯字符串(不给上游多余结构)", () => {
    const messages = toChatMessages({
      provider: AS_ONE_PROVIDER,
      model: "m",
      messages: [{ role: "user", content: [text("纯文本")] }],
    } as DshGenerateOptions);
    expect(messages[0]?.content).toBe("纯文本");
  });
});

/**
 * 附件引用 → 请求字节。
 *
 * DSH 的图片块(`read_image` 结果、用户附件)只带 `attachment` 引用,**没有 url**;
 * 宿主对 adapter 的图片契约只给宽/高/字节数,不给字节。不在这里读一次图,
 * 图就永远到不了网关 —— 这正是「会话模型看不到图」的根因。这里钉住:
 * 1. 附件引用被 `attachments.readImageRequest()` 解成 data URL;
 * 2. tool 消息(工具结果)同样能带图,content 变成多模态分段;
 * 3. 附件服务缺失/解析失败时只丢那一块,文字与其它图照发。
 */
describe("图片附件解析 + tool 消息多模态", () => {
  const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const BASE64 = Buffer.from(PNG_BYTES).toString("base64");

  function attachmentService(overrides: Partial<{ fail: boolean }> = {}) {
    return {
      readImageRequest: vi.fn(
        async (
          ref: { attachmentId: string; mediaType: string; width: number; height: number },
          _target: unknown,
        ) => {
          if (overrides.fail === true) throw new Error("attachment gone");
          return {
            data: PNG_BYTES,
            mediaType: ref.mediaType,
            bytes: PNG_BYTES.byteLength,
            width: ref.width,
            height: ref.height,
          };
        },
      ),
    };
  }

  const imageBlock = () => ({
    type: "image",
    attachment: {
      attachmentId: "sha256:abcdef0123456789",
      mediaType: "image/png",
      bytes: PNG_BYTES.byteLength,
      width: 160,
      height: 120,
    },
  });

  it("tool 结果里的图片块 → 多模态 content(文字信封 + image_url data URL)", async () => {
    const messages = await resolveImagesInMessages(
      [
        {
          role: "tool",
          toolCallId: "call_1",
          content: [text("<path>x.png</path>\n<type>image</type>"), imageBlock() as never],
        },
      ],
      attachmentService() as never,
      () => ({ width: 160, height: 120, maxBytes: PNG_BYTES.byteLength }),
    );
    const chat = toChatMessages({ provider: AS_ONE_PROVIDER, model: "m", messages } as DshGenerateOptions);
    expect(chat[0]?.role).toBe("tool");
    const content = chat[0]?.content as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "text", text: "<path>x.png</path>\n<type>image</type>" });
    expect(content[1]).toEqual({ type: "image_url", image_url: { url: `data:image/png;base64,${BASE64}` } });
  });

  it("user 附件引用同样被解析;同一附件只派生一次", async () => {
    const service = attachmentService();
    const messages = await resolveImagesInMessages(
      [
        { role: "user", content: [text("看这张"), imageBlock() as never] },
        { role: "user", content: [imageBlock() as never] },
      ],
      service as never,
      () => ({ width: 160, height: 120, maxBytes: PNG_BYTES.byteLength }),
    );
    expect(service.readImageRequest).toHaveBeenCalledTimes(1);
    const chat = toChatMessages({ provider: AS_ONE_PROVIDER, model: "m", messages } as DshGenerateOptions);
    expect((chat[0]?.content as unknown[])[1]).toEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${BASE64}` },
    });
    expect((chat[1]?.content as unknown[])[0]).toEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${BASE64}` },
    });
  });

  it("附件缺失/解析失败 → 文字照发,图变成**占位文本**(不再静默消失)", async () => {
    // ⚠️ 2026-11-10 用户报「无法读取会话附图」后的口径变更:
    // 旧行为是把图块直接删掉 —— 模型完全不知道用户发过图,只会说「你没发图」。
    // 现在换成一条占位文本,模型能如实回答「这张图我这边读不到」。
    const noService = await resolveImagesInMessages(
      [{ role: "tool", toolCallId: "c", content: [text("信封"), imageBlock() as never] }],
      undefined,
      () => ({ width: 1, height: 1, maxBytes: 1 }),
    );
    const failed = await resolveImagesInMessages(
      [{ role: "tool", toolCallId: "c", content: [text("信封"), imageBlock() as never] }],
      attachmentService({ fail: true }) as never,
      () => ({ width: 1, height: 1, maxBytes: 1 }),
    );
    for (const messages of [noService, failed]) {
      const chat = toChatMessages({ provider: AS_ONE_PROVIDER, model: "m", messages } as DshGenerateOptions);
      const text = String(chat[0]?.content ?? "");
      // 文字信封照旧在
      expect(text).toContain("信封");
      // 关键:两个失败场景都留下了**可见的占位**(而不是把块抹掉)
      expect(text).toContain("图片");
      expect(text).toContain("未能读取");
    }
  });

  it("attachment 里直接带 data URL → 直读,不必调附件服务", async () => {
    // 有些宿主会把兑好的 data URL 塞进 attachment 对象;能直读就别去读服务。
    const inline = {
      type: "image",
      attachment: { attachmentId: "sha256:x", mediaType: "image/png", dataUrl: `data:image/png;base64,${BASE64}` },
    };
    const service = attachmentService();
    const messages = await resolveImagesInMessages(
      [{ role: "user", content: [inline as never] }],
      service as never,
      () => ({ width: 1, height: 1, maxBytes: 1 }),
    );
    const chat = toChatMessages({ provider: AS_ONE_PROVIDER, model: "m", messages } as DshGenerateOptions);
    const content = chat[0]?.content as unknown as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${BASE64}` },
    });
    // 直读路径不该触发附件服务调用
    expect(service.readImageRequest).not.toHaveBeenCalled();
  });
});

describe("toUpstreamRequestFromOptions", () => {
  const base = { provider: AS_ONE_PROVIDER, model: "auto", messages: [] } as unknown as DshGenerateOptions;

  it("max_tokens 与 maxTokensClient 同时给(换档重算要用未钳制的原值)", () => {
    const req = toUpstreamRequestFromOptions({ ...base, maxTokens: 4096 });
    expect(req.max_tokens).toBe(4096);
    expect(req.maxTokensClient).toBe(4096);
  });

  it("maxTokens 非法值一律丢掉,不写 0", () => {
    const req = toUpstreamRequestFromOptions({ ...base, maxTokens: 0 });
    expect(req.max_tokens).toBeUndefined();
    expect(req.maxTokensClient).toBeUndefined();
  });

  it("sessionId 同时进 prompt_cache_key 与 extra.session_id;signal 走独立字段", () => {
    const ac = new AbortController();
    const req = toUpstreamRequestFromOptions({ ...base, sessionId: "s-1", signal: ac.signal });
    expect(req.prompt_cache_key).toBe("s-1");
    expect(req.extra).toEqual({ session_id: "s-1" });
    expect(req.clientSignal).toBe(ac.signal);
    // ⚠️ 反例保护:signal 绝不能出现在 extra 里(bodyFor 会把 extra 整体透传)
    expect(JSON.stringify(req.extra)).not.toContain("signal");
  });

  it("reasoningEffort 未指定时连键都不加(否则 openai 系会把 undefined 发给上游)", () => {
    expect("reasoning_effort" in toUpstreamRequestFromOptions(base)).toBe(false);
    expect(toUpstreamRequestFromOptions({ ...base, reasoningEffort: "high" }).reasoning_effort).toBe("high");
  });

  it("tools 映射成 OpenAI function 形状,无名工具丢弃", () => {
    const req = toUpstreamRequestFromOptions({
      ...base,
      tools: [{ name: "read", description: "读", parameters: { type: "object" } }, { name: "" }],
    });
    expect(req.tools).toEqual([
      { type: "function", function: { name: "read", description: "读", parameters: { type: "object" } } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 错误翻译
// ---------------------------------------------------------------------------

describe("toLlmError", () => {
  it("上游原文优先于分类器改写(与网关对外「原样透传」同一定案)", () => {
    const err = new UpstreamError("upstream", "上游暂时不可用", {
      statusCode: 403,
      raw: { text: '{"code":11140,"msg":"request illegal"}', status: 403 },
    });
    const out = toLlmError(err, "fallback");
    expect(out.message).toBe('{"code":11140,"msg":"request illegal"}');
    expect(out.code).toBe("SERVER");
    expect(out.failure.status).toBe(403);
  });

  it("kind → 宿主码;非法字段被丢掉而不是整份 failure 作废", () => {
    expect(toLlmError(new UpstreamError("auth", "x"), "f").code).toBe("AUTH");
    expect(toLlmError(new UpstreamError("timeout", "x"), "f").code).toBe("TIMEOUT");
    expect(toLlmError(new UpstreamError("connection", "x"), "f").code).toBe("TRANSPORT");
    expect(toLlmError(new UpstreamError("bad_request", "x"), "f").code).toBe("INVALID_REQUEST");
    const bad = new AsOneLlmError("m", "SERVER", { status: 999, providerRetryAfterMs: -1, requestId: "" });
    expect(bad.failure).toEqual({ message: "m", code: "SERVER" });
  });

  it("failure.code 与 own code 同值(宿主 normalizeLlmFailure 的复用条件)", () => {
    const e = new AsOneLlmError("x", "RATE_LIMIT", { status: 429 });
    expect(Object.prototype.hasOwnProperty.call(e, "failure")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(e, "code")).toBe(true);
    expect(e.failure.code).toBe(e.code);
  });

  it("裸 Error / 非 Error 也有确定归类(宿主对非 LlmError 一律 UNKNOWN)", () => {
    expect(toLlmError(new Error("boom"), "f").code).toBe("SERVER");
    expect(toLlmError("not an error", "兜底").message).toBe("兜底");
  });
});

// ---------------------------------------------------------------------------
// adapter 本体
// ---------------------------------------------------------------------------

interface Captured {
  req?: UpstreamRequest;
  done?: RequestDoneInfo;
}

function fakeRuntime(chunks: ChatCompletionChunk[], captured: Captured = {}): AsOneRuntime {
  const upstream: Upstream = {
    stream(req) {
      captured.req = req;
      return of(...chunks);
    },
    complete: async () => {
      throw new Error("不该走 complete");
    },
  };
  return {
    listModels: async () => [
      entry({ id: "auto", litenexus_kind: "logical", owned_by: "router" }),
      entry({ id: "stub/m1" }),
    ],
    resolveUpstream: (model: string) => (model === "auto" || model === "stub/m1" ? upstream : undefined),
    onRequestDone: (info: RequestDoneInfo) => {
      captured.done = info;
    },
  } as unknown as AsOneRuntime;
}

const emptyOptions = { provider: "as-one", model: "auto", messages: [] } as unknown as DshGenerateOptions;

describe("AsOneLlmAdapter", () => {
  it("providerInfo 的 id 逐字等于注册 provider(否则宿主判 INVALID_ADAPTER)", () => {
    const adapter = new AsOneLlmAdapter(fakeRuntime([]));
    expect(adapter.providerInfo(AS_ONE_PROVIDER)).toEqual({ id: "as-one", name: "As One · 合一" });
    expect(adapter.providerRetryPolicy()).toBeUndefined();
  });

  /**
   * 宿主 `LlmAdapter` 基类给 `imageRequestPricing` / `imageRequestTarget` 写了
   * 默认实现,但本 adapter 不继承它 —— 方法不存在时宿主调用处
   * (`this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model)`)
   * 抛的是 TypeError,现象是**整条请求在计量阶段失败**,与上游无关。
   *
   * 这两条测试就是那个缺陷的钉死钉:删掉实现 → 立刻变红。
   */
  it("imageRequestPricing 显式返回 undefined(不声明视觉定价,而不是方法不存在)", () => {
    const adapter = new AsOneLlmAdapter(fakeRuntime([]));
    expect(typeof adapter.imageRequestPricing).toBe("function");
    // 宿主对「未声明」的判据就是 falsy:undefined 触发计量方回落中性估算。
    expect(adapter.imageRequestPricing("as-one", "auto")).toBeUndefined();
  });

  it("imageRequestTarget 原样透传宽/高/字节(As One 不做二次缩放)", () => {
    const adapter = new AsOneLlmAdapter(fakeRuntime([]));
    expect(typeof adapter.imageRequestTarget).toBe("function");
    expect(adapter.imageRequestTarget("as-one", "auto", { width: 800, height: 600, bytes: 12345 })).toEqual({
      width: 800,
      height: 600,
      maxBytes: 12345,
    });
  });

  it("宿主会主动调的 adapter 方法表一个都不能缺(基类默认实现不继承)", () => {
    const adapter = new AsOneLlmAdapter(fakeRuntime([]));
    // 逐字对应宿主 LlmAdapter 的公开方法表(见 llm-types.ts 的 DshLlmAdapter 注释)。
    for (const method of [
      "providerInfo",
      "providerRetryPolicy",
      "imageRequestPricing",
      "imageRequestTarget",
      "listModels",
      "resolveModel",
      "prepareCall",
      "stream",
    ] as const) {
      expect(typeof (adapter as unknown as Record<string, unknown>)[method], method).toBe("function");
    }
  });

  it("listModels:每条 provider 逐字、id 非空不重复(选择器分组的数据源)", async () => {
    const models = await new AsOneLlmAdapter(fakeRuntime([])).listModels();
    expect(models.map((m) => m.id)).toEqual(["auto", "stub/m1"]);
    for (const m of models) {
      expect(m.provider).toBe("as-one");
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.inputModalities).toEqual(["text", "image"]);
    }
  });

  it("resolveModel 对未知模型抛 INVALID_REQUEST + 404(不是 UNKNOWN)", async () => {
    const adapter = new AsOneLlmAdapter(fakeRuntime([]));
    await expect(adapter.resolveModel("as-one", "nope")).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      failure: { status: 404 },
    });
  });

  it("prepareCall 返回 {model, stream};stream 产出语法合法的块", async () => {
    const captured: Captured = {};
    const adapter = new AsOneLlmAdapter(
      fakeRuntime(
        [chunk({ content: "回答" }, "stop", { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 })],
        captured,
      ),
    );
    const prepared = await adapter.prepareCall("as-one", "auto");
    expect(prepared.model.id).toBe("auto");

    const out = await collectLegal(
      prepared.stream({
        provider: "as-one",
        model: "auto",
        messages: [{ role: "user", content: [text("hi")] }],
        system: "s",
        maxTokens: 100,
        sessionId: "sess-1",
      } as unknown as DshGenerateOptions),
    );
    expect((out[1] as Extract<DshStreamChunk, { type: "text-delta" }>).text).toBe("回答");
    expect(captured.req?.max_tokens).toBe(100);
    expect(captured.req?.prompt_cache_key).toBe("sess-1");
    expect(captured.req?.messages[0]).toEqual({ role: "system", content: "s" });
  });

  it("调用结束记一条明细(面板实时日志/统计页要能看到 DSH 的调用)", async () => {
    const captured: Captured = {};
    const adapter = new AsOneLlmAdapter(
      fakeRuntime(
        [
          chunk(
            { content: "ok" },
            "stop",
            {
              prompt_tokens: 5,
              completion_tokens: 3,
              total_tokens: 8,
              prompt_tokens_details: { cached_tokens: 2 },
            },
          ),
        ],
        captured,
      ),
    );
    for await (const _c of adapter.stream(emptyOptions)) {
      /* drain */
    }
    // 上游 prompt 5(含 cached 2)→ 宿主 inputTokens 3 → 记账时**加回来**仍是 5:
    // 网关自己的统计是 OpenAI 口径,不能跟着宿主变成「未缓存量」。
    expect(captured.done).toMatchObject({
      model: "auto",
      stream: true,
      ok: true,
      status: 200,
      error: null,
      usage: { prompt_tokens: 5, cached_tokens: 2, completion_tokens: 3 },
    });
    expect(captured.done?.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("失败路径也记账,且 error_kind 由宿主码反推", async () => {
    const captured: Captured = {};
    const rt = {
      listModels: async () => [entry({ id: "auto" })],
      resolveUpstream: () =>
        ({
          stream() {
            return (async function* (): AsyncGenerator<ChatCompletionChunk> {
              throw new UpstreamError("rate_limit", "慢点", { statusCode: 429, retryAfter: 1 });
            })();
          },
          complete: async () => {
            throw new Error("no");
          },
        }) as unknown as Upstream,
      onRequestDone: (info: RequestDoneInfo) => {
        captured.done = info;
      },
    } as unknown as AsOneRuntime;
    const adapter = new AsOneLlmAdapter(rt);
    await expect(
      (async () => {
        for await (const _c of adapter.stream(emptyOptions)) {
          /* drain */
        }
      })(),
    ).rejects.toMatchObject({ code: "RATE_LIMIT" });
    expect(captured.done).toMatchObject({ ok: false, status: 429, error_kind: "rate_limit" });
  });

  it("未知模型:stream 抛 INVALID_REQUEST/404,不静默产空流", async () => {
    const adapter = new AsOneLlmAdapter(fakeRuntime([]));
    await expect(
      (async () => {
        for await (const _c of adapter.stream({ ...emptyOptions, model: "ghost" })) {
          /* drain */
        }
      })(),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST", failure: { status: 404 } });
  });

  it("onRequestDone 抛错不能影响已经发出的响应", async () => {
    const rt = fakeRuntime([chunk({ content: "x" }, "stop")]);
    rt.onRequestDone = vi.fn(() => {
      throw new Error("统计挂了");
    });
    const adapter = new AsOneLlmAdapter(rt);
    const out = await collectLegal(adapter.stream(emptyOptions));
    expect(out.at(-1)?.type).toBe("finish");
  });
});
