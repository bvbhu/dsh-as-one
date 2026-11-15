/**
 * 华为云 CodeArts（码道）**Chat Completions 线协议**：请求体构建、模型清单解析、
 * SSE 增量翻译、业务错误抽取（纯函数，零网络、零 fs）。
 *
 * 签名与 HTTP 在别的模块（`codearts-sign.ts` + 调用方），这里只钉「线上报文长什么样、
 * 我们回给 OpenAI 客户端长什么样」。
 *
 * 上游怪癖（证据：`docs/third-party-sources.md` §2.3「CodeArts 渠道：协议摸底」，
 * 四个独立实现互证；拿不准时以那一节为准，不要在别处另造口径）：
 *
 * - **HTTP 200 也可能是错误**：业务失败用 `{"error_code":"…","error_msg":"…"}` 表达，
 *   状态码不可信。判错只认 {@link codeartsBusinessError}，不要看 HTTP status。
 * - **`body.model` 必须与 `model-id` / `model-name` 请求头逐字一致**（尾随空格都回
 *   406）。所以 {@link buildCodeartsBody} 的 model 取自与请求头同源的那个参数，
 *   既不 trim 也不改写；调用方两个值必须同源。
 * - **部分模型（`glm-5.3`）只能流式**，且它们的 SSE 正文是**累计全文**（`text` 字段
 *   每帧都是全量），不是 OpenAI 的 `delta.content` 增量 —— 直接透传会让客户端看到
 *   「你好你好世界」。翻译器用「新值减已发前缀」还原增量，并对重复帧幂等。
 * - 另有 OpenAI 形态的 `choices[0].delta.content` 增量流，两种都要支持。
 * - 上游已下线 `maas_type` 通道，缺省不要发（发了会被拒或静默降级）。
 *
 * @module connectors/codearts-wire
 */

/* ------------------------------------------------------------------ *
 * 基础收窄工具（仓库约定：不引第三方依赖，不用 any）
 * ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** 只有 string 才算字段存在（`null` / 数字一律视为没给）。 */
function stringOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 缺失或非法一律按 0（规则：不替上游猜数字）。 */
function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/* ------------------------------------------------------------------ *
 * 模型清单
 * ------------------------------------------------------------------ */

/** 上游模型清单条目（GET /v1/model/builtin 解析结果）。 */
export interface CodeartsModel {
  /** 上游模型名，如 "glm-5.3"（必须逐字进 body 与请求头）。 */
  id: string;
  /** 展示名，缺省回落 id。 */
  name: string;
  /** `enable` 字段，缺省 true。 */
  enabled: boolean;
  /** 已知只能流式的标记（glm-5.3）。 */
  streamOnly?: boolean;
}

/**
 * 已知只能流式的模型 id（小写）。
 *
 * `glm-5.3` 非流式会回 **HTTP 400 + 空 body**（不是业务错误体），所以调用方发
 * `stream:false` 之前必须先用 {@link isCodeartsStreamOnlyModel} 兜住。
 */
const STREAM_ONLY_MODEL_IDS: readonly string[] = ["glm-5.3"];
const STREAM_ONLY_MODEL_SET: ReadonlySet<string> = new Set(STREAM_ONLY_MODEL_IDS);

/** 已知只能流式的模型 id（小写比较）。 */
export function isCodeartsStreamOnlyModel(id: string): boolean {
  return STREAM_ONLY_MODEL_SET.has(id.toLowerCase());
}

/**
 * 从各种包壳里找出模型数组。
 *
 * 上游与派生实现至少出现过三种：`{data:[...]}`、`{models:[...]}`、裸数组；
 * `data` 里再套一层 `models` 的也见过，所以允许一层层往下钻（设深度上限防环）。
 */
function modelRows(payload: unknown, depth = 0): unknown[] {
  if (depth > 4) return [];
  if (Array.isArray(payload)) return payload;
  const rec = asRecord(payload);
  if (rec === undefined) return [];
  for (const key of ["data", "models", "model_list", "builtin", "items", "list"]) {
    const value = rec[key];
    if (Array.isArray(value)) return value;
  }
  const data = rec["data"];
  if (asRecord(data) !== undefined) return modelRows(data, depth + 1);
  return [];
}

/**
 * 解析 `/v1/model/builtin` 的响应。
 *
 * 条目有两种形态，都容忍：
 * - `{id, name, enable, credit:[{ratio_display}]}`（`credit` 与我们无关，忽略）
 * - `{model, display_name, enable}`
 *
 * 去重规则：同 id 取第一条（上游可能把同一模型按不同 credit 档重复列出）。
 * `enabled` 只在显式 false 时关闭（缺字段 = 默认可用，宁可多列也不要把好模型藏起来）。
 */
export function parseCodeartsModels(payload: unknown): CodeartsModel[] {
  const out: CodeartsModel[] = [];
  const seen = new Set<string>();
  for (const row of modelRows(payload)) {
    const rec = asRecord(row);
    if (rec === undefined) continue;
    const id = stringOf(rec["id"]) ?? stringOf(rec["model"]);
    if (id === undefined || id === "") continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = stringOf(rec["name"]) ?? stringOf(rec["display_name"]) ?? id;
    const enabled = rec["enable"] !== false && rec["enabled"] !== false;
    const model: CodeartsModel = { id, name: name === "" ? id : name, enabled };
    if (isCodeartsStreamOnlyModel(id)) model.streamOnly = true;
    out.push(model);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 请求体
 * ------------------------------------------------------------------ */

/** 构建上游请求体。model 原样使用（不 trim、不改写）。 */
export function buildCodeartsBody(
  req: {
    model: string;
    messages: unknown;
    stream: boolean;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    stop?: string[];
    tools?: unknown;
    tool_choice?: unknown;
    response_format?: unknown;
  },
  model: string,
): Record<string, unknown> {
  // 这里**只用第二个参数** `model`，忽略 `req.model`：第二个参数与 `model-id` /
  // `model-name` 请求头同源，body 必须逐字等于它（尾随空格都回 406）。若改成读
  // `req.model`，两处来源就会漂移，出现「头里一个名、体里另一个名」。
  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    stream: req.stream,
  };
  // 可选字段：undefined 表示客户端没给，**不要**补默认值（补了等于替客户端选参数）。
  if (req.temperature !== undefined) body["temperature"] = req.temperature;
  // `max_tokens` 用客户端的值；上游若另有默认，客户端的显式值优先。
  if (req.max_tokens !== undefined) body["max_tokens"] = req.max_tokens;
  if (req.top_p !== undefined) body["top_p"] = req.top_p;
  if (req.stop !== undefined) body["stop"] = req.stop;
  if (req.tools !== undefined) body["tools"] = req.tools;
  if (req.tool_choice !== undefined) body["tool_choice"] = req.tool_choice;
  if (req.response_format !== undefined) body["response_format"] = req.response_format;
  // 刻意不发 `maas_type`：该通道上游已下线，带上只会被拒。
  return body;
}

/* ------------------------------------------------------------------ *
 * SSE 帧解码
 * ------------------------------------------------------------------ */

/**
 * 喂进来的一帧可能是已解析的对象，也可能是原始 SSE 行（`data: {...}`）。
 * 空串、`[DONE]`、注释行（`: ping`）、`event:` 行都不产生内容。
 */
function decodeFrame(payload: unknown): Record<string, unknown> | undefined {
  if (typeof payload === "string") {
    let text = payload.trim();
    if (text === "" || text === "[DONE]") return undefined;
    if (text.startsWith(":")) return undefined; // SSE 注释 / keep-alive
    if (text.startsWith("data:")) text = text.slice("data:".length).trim();
    if (text === "" || text === "[DONE]") return undefined;
    if (text.startsWith("event:")) return undefined;
    try {
      return asRecord(JSON.parse(text));
    } catch {
      return undefined;
    }
  }
  return asRecord(payload);
}

function firstChoice(frame: Record<string, unknown>): Record<string, unknown> | undefined {
  const choices = frame["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  return asRecord(choices[0]);
}

/* ------------------------------------------------------------------ *
 * 业务错误（HTTP 200 + error_code）
 * ------------------------------------------------------------------ */

function parseJsonText(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * `error_code` → HTTP 语义状态。
 *
 * 规则（上行文档 §2.3 的错误码形状）：
 * - 复合码取**末段**：`InferHub.002002009.404` → `404`；
 * - 末段是 400–599 的整数 → 直接用；
 * - 纯数字但不在 400–599（如 `4005`）→ 兜底 400；
 * - 其余（非数字末段）→ 兜底 400。
 *
 * 绝不返回 200：这是「上游说失败了」的唯一出口，返回 2xx 会让网关把错误当成功。
 */
export function codeartsErrorStatus(code: string): number {
  const trimmed = code.trim();
  if (trimmed === "") return 400;
  const segments = trimmed.split(".");
  const last = segments[segments.length - 1] ?? "";
  const lastNum = Number(last);
  if (/^\d+$/.test(last) && lastNum >= 400 && lastNum <= 599) return lastNum;
  const whole = Number(trimmed);
  if (/^\d+$/.test(trimmed) && whole >= 400 && whole <= 599) return whole;
  return 400;
}

/** 上游 200 + error_code 形态的错误抽取；不是错误返回 null。 */
export function codeartsBusinessError(
  payload: unknown,
): { code: string; message: string; status: number } | null {
  const decoded = typeof payload === "string" ? parseJsonText(payload) : payload;
  const rec = asRecord(decoded);
  if (rec === undefined) return null;
  const codeRaw = rec["error_code"] ?? rec["errorCode"];
  const msgRaw = rec["error_msg"] ?? rec["errorMsg"] ?? rec["error_message"];
  const code =
    typeof codeRaw === "string"
      ? codeRaw
      : typeof codeRaw === "number" && Number.isFinite(codeRaw)
        ? String(codeRaw)
        : "";
  const message = typeof msgRaw === "string" ? msgRaw : msgRaw === undefined ? "" : String(msgRaw);
  // 两个字段都没给 = 正常帧（正文帧 / usage 帧 / finish 帧）。
  if (code === "" && message === "") return null;
  return { code, message, status: codeartsErrorStatus(code) };
}

/* ------------------------------------------------------------------ *
 * SSE 翻译（累计全文 → 增量）
 * ------------------------------------------------------------------ */

/**
 * 翻译器内部状态（外部只用 `push` / `finish` 的返回值，不要读写这里）。
 *
 * 关键是 `prevText` / `prevReasoning`：它们是**已经发给客户端**的全文，累计帧
 * 用「新值减它」还原增量。重复帧（同一负载喂两次）因此自然幂等。
 */
export interface CodeartsTranslateState {
  /** 整个流的 chunk id（OpenAI 要求同流稳定）。 */
  readonly id: string;
  /** 秒级时间戳（OpenAI chunk 的 `created`）。 */
  readonly created: number;
  /** 回给客户端的模型名（调用方的路由名，不是上游名也可以）。 */
  readonly model: string;
  /** 已发出的正文全文。 */
  prevText: string;
  /** 已发出的思考全文。 */
  prevReasoning: string;
  /** 是否已发过 `role: "assistant"`（只在首个有内容的 chunk 上带）。 */
  roleSent: boolean;
  /** 已透传的 finish_reason；null = 还没收到。 */
  finishReason: string | null;
  /** 是否发过任何非空 delta（`finish()` 只在有内容时才补 stop）。 */
  sawOutput: boolean;
}

let chunkSeq = 0;

function freshChunkId(): string {
  chunkSeq += 1;
  return `chatcmpl-codearts-${Date.now().toString(36)}${chunkSeq.toString(36)}`;
}

function makeChunk(
  state: CodeartsTranslateState,
  delta: Record<string, unknown>,
  finishReason: string | null,
): Record<string, unknown> {
  return {
    id: state.id,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

/**
 * 累计值 → 增量（用于 `text` / 整条 `message.content` / 累计 reasoning）。
 *
 * - 新值以已发前缀开头：只发多出来的尾巴；
 * - 新值等于已发值：什么都不发（**幂等**：上游会重复下发同一帧）；
 * - 其余（上游截断 / 重排 / 换了一种写法）：整段重发并**把基线换成新值** ——
 *   旧实现只在 startsWith 成立时才更新基线，一旦上游改写就永远发不出去。
 */
function subtractPrefix(prev: string, next: string): { delta: string; next: string } {
  if (next === prev) return { delta: "", next };
  if (next.startsWith(prev)) return { delta: next.slice(prev.length), next };
  return { delta: next, next };
}

/**
 * 形态未知字段（thinking 链）的保守推进：既可能是累计全文，也可能是增量。
 *
 * - 与已发值相同 → 幂等跳过；
 * - 以已发值开头且更长 → 按累计全文取尾巴；
 * - 其余 → 按增量追加（基线变成「已发 + 本段」）。
 */
function autoAdvance(prev: string, next: string): { delta: string; next: string } {
  if (next === prev) return { delta: "", next };
  if (prev !== "" && next.length > prev.length && next.startsWith(prev)) {
    return { delta: next.slice(prev.length), next };
  }
  return { delta: next, next: prev + next };
}

/**
 * usage 归一：字段缺失按 0，**不**替上游算 total（客户端拿到的数要么是上游的，
 * 要么是显式的 0，不做「猜测」）。
 */
function normalizeUsage(usage: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    prompt_tokens: countOf(usage["prompt_tokens"]),
    completion_tokens: countOf(usage["completion_tokens"]),
    total_tokens: countOf(usage["total_tokens"]),
  };
  const details = asRecord(usage["prompt_tokens_details"]);
  if (details !== undefined) {
    out["prompt_tokens_details"] = { cached_tokens: countOf(details["cached_tokens"]) };
  }
  return out;
}

/**
 * 逐块翻译：喂一个 SSE data 负载，吐出若干 OpenAI chunk。
 *
 * 支持的帧形态（同一流内不混用，但两种都认）：
 * - 累计全文：`{"text":"…累计…","reasoning_content":"…","finish_reason":…}`
 * - OpenAI 增量：`{"choices":[{"delta":{"content":"…"},"finish_reason":null}],…}`
 * - 整条消息：`{"choices":[{"message":{"content":"…","reasoning_content":"…"}}]}`
 *
 * 返回值为**纯函数式**结果：同一帧喂两次，第二次返回空数组（正文帧意义上）。
 * `[DONE]` / 空行 / 注释行返回空数组。
 */
export function createCodeartsTranslator(opts: { model?: string } = {}): {
  push(payload: unknown): Array<Record<string, unknown>>;
  finish(): Array<Record<string, unknown>>;
} {
  const state: CodeartsTranslateState = {
    id: freshChunkId(),
    created: Math.floor(Date.now() / 1000),
    model: opts.model ?? "",
    prevText: "",
    prevReasoning: "",
    roleSent: false,
    finishReason: null,
    sawOutput: false,
  };

  function push(payload: unknown): Array<Record<string, unknown>> {
    const frame = decodeFrame(payload);
    if (frame === undefined) return [];
    // 业务错误帧不是内容：判错在调用方（codeartsBusinessError），这里不吐 chunk，
    // 免得客户端把错误文本当成模型正文。
    if (codeartsBusinessError(frame) !== null) return [];

    const out: Array<Record<string, unknown>> = [];
    const choice = firstChoice(frame);
    const deltaFrame = asRecord(choice?.["delta"]);
    const messageFrame = asRecord(choice?.["message"]);

    // 累计正文候选：顶层 `text`（华为自家形态）> `delta.text` > `choice.text` >
    // 整条 `message.content`。出现任一个都说明这一段是**全量**，不能当增量透传。
    const cumulativeText =
      stringOf(frame["text"]) ??
      stringOf(deltaFrame?.["text"]) ??
      stringOf(choice?.["text"]) ??
      stringOf(messageFrame?.["content"]);
    const cumulativeReasoning = stringOf(messageFrame?.["reasoning_content"]);
    const deltaContent = stringOf(deltaFrame?.["content"]);
    const rawReasoning =
      stringOf(frame["reasoning_content"]) ?? stringOf(deltaFrame?.["reasoning_content"]);

    let contentDelta = "";
    if (cumulativeText !== undefined) {
      const step = subtractPrefix(state.prevText, cumulativeText);
      contentDelta = step.delta;
      state.prevText = step.next;
    } else if (deltaContent !== undefined && deltaContent !== "") {
      // OpenAI 增量：直接透传，基线只用来给后续累计帧兜底。
      contentDelta = deltaContent;
      state.prevText += deltaContent;
    }

    // 这一帧是不是「全量形态」：决定 reasoning 按累计还是按未知形态推进。
    const cumulativeFrame =
      cumulativeText !== undefined || messageFrame !== undefined || cumulativeReasoning !== undefined;

    let reasoningDelta = "";
    if (cumulativeReasoning !== undefined) {
      const step = subtractPrefix(state.prevReasoning, cumulativeReasoning);
      reasoningDelta = step.delta;
      state.prevReasoning = step.next;
    } else if (rawReasoning !== undefined && rawReasoning !== "") {
      const step = cumulativeFrame
        ? subtractPrefix(state.prevReasoning, rawReasoning)
        : autoAdvance(state.prevReasoning, rawReasoning);
      reasoningDelta = step.delta;
      state.prevReasoning = step.next;
    }

    const toolCalls =
      deltaFrame !== undefined && Array.isArray(deltaFrame["tool_calls"])
        ? (deltaFrame["tool_calls"] as unknown[])
        : undefined;

    const wireDelta: Record<string, unknown> = {};
    if (reasoningDelta !== "") wireDelta["reasoning_content"] = reasoningDelta;
    if (contentDelta !== "") wireDelta["content"] = contentDelta;
    if (toolCalls !== undefined && toolCalls.length > 0) wireDelta["tool_calls"] = toolCalls;
    if (Object.keys(wireDelta).length > 0) {
      // 首个**有内容**的 chunk 补 role（纯空 delta 不带 role，OpenAI 客户端会照抄）。
      if (!state.roleSent) {
        wireDelta["role"] = "assistant";
        state.roleSent = true;
      }
      state.sawOutput = true;
      out.push(makeChunk(state, wireDelta, null));
    }

    const finishReason =
      stringOf(frame["finish_reason"]) ?? stringOf(choice?.["finish_reason"]);
    if (finishReason !== undefined && finishReason !== "" && state.finishReason === null) {
      state.finishReason = finishReason;
      out.push(makeChunk(state, {}, finishReason));
    }

    const usageFrame = asRecord(frame["usage"]);
    if (usageFrame !== undefined) {
      // usage 独立成块（`choices: []`）：OpenAI 把「usage 与 finish 不同块」当常态，
      // 塞进 finish 块反而会让只读 choices 的客户端漏掉它（`core/gateway/types.ts` 注释）。
      out.push({
        id: state.id,
        object: "chat.completion.chunk",
        created: state.created,
        model: state.model,
        choices: [],
        usage: normalizeUsage(usageFrame),
      });
    }

    return out;
  }

  function finish(): Array<Record<string, unknown>> {
    // 已透传过 finish_reason：不再补（否则客户端会看到两个结束标记）。
    if (state.finishReason !== null) return [];
    // 全程没有任何内容：不补 stop，空流就让它是空的。
    if (!state.sawOutput) return [];
    state.finishReason = "stop";
    return [makeChunk(state, {}, "stop")];
  }

  return { push, finish };
}
