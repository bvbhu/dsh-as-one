/**
 * As One 的 DSH LLM adapter —— 把网关的模型嵌进 DSH 原生模型选择器。
 *
 * 为什么需要它:`dsh-api-session-controller` 的 `buildModelCatalog` 只认
 * `ctx.llm.listProviders()` → 每个 provider 的 `listModels()`,GUI 的模型
 * 下拉就是这份数据。As One 的模型此前只在 `/v1/models` 与自己的面板里,
 * DSH 选择器看不到。注册这个 adapter 后**前端零改动**。
 *
 * 三条硬规矩(逐条对着宿主源码核过,违反就是整条链路报错):
 * 1. **流语法**:宿主 `validateStream` 要求 block-start / delta / block-end 配平,
 *    `finish` 唯一且收尾时不得有未关闭块。上游是 OpenAI delta 形态(没有块概念),
 *    所以**块由本文件合成**。
 * 2. **错误形状**:宿主 `normalizeLlmFailure` 只在「own `failure` 且
 *    `failure.code === own code`」时复用失败信息,否则一律 `UNKNOWN` ——
 *    状态码与 Retry-After 全丢。所以抛错必须用 {@link AsOneLlmError}。
 * 3. **元数据边界**:`contextWindow` / `defaultMaxTokens` 必须是正安全整数,
 *    `reasoning.efforts` 不得是空数组(空 → `INVALID_MODEL_REASONING`),
 *    所以拿不准的一律**不给**,让宿主用默认值。
 *
 * 关于 `attributionHeaders()`:基类文档要求每个 provider HTTP 请求带归因头。
 * 本 adapter 不发公网 HTTP —— 它调的是**同进程内**的 As One 上游
 * (`rt.resolveUpstream`),归因头由真正的出口(各连接器)在上游侧负责。
 */
import { UpstreamError } from "@as-one/core/src/gateway/types.js";
/** 注册用的 provider id —— 必须与 `registerAdapter(["as-one"], …)` 逐字一致。 */
export const AS_ONE_PROVIDER = "as-one";
/** 选择器里显示的组名。 */
export const AS_ONE_PROVIDER_NAME = "As One · 合一";
// ---------------------------------------------------------------------------
// 错误
// ---------------------------------------------------------------------------
/**
 * 与宿主 `LlmError` **同形**的失败(不能 import,所以自己实现)。
 *
 * 校验口径抄自 `dsh-llm/lib/index.js` 的 `failureSnapshot`:message/code 非空、
 * `status` ∈ [100,599] 整数、`providerRetryAfterMs` 正有限数、`requestId` 非空。
 * 任一项不合规就整项丢掉 —— 宁可少给,不能因为一个坏字段让宿主把**整份** failure
 * 作废(那样状态码和退避时间一起没了)。
 */
export class AsOneLlmError extends Error {
    code;
    failure;
    constructor(message, code, extra = {}) {
        super(message);
        this.name = "LlmError";
        this.code = code;
        const failure = { message, code };
        if (typeof extra.status === "number" &&
            Number.isInteger(extra.status) &&
            extra.status >= 100 &&
            extra.status <= 599) {
            failure.status = extra.status;
        }
        if (typeof extra.providerRetryAfterMs === "number" &&
            Number.isFinite(extra.providerRetryAfterMs) &&
            extra.providerRetryAfterMs > 0) {
            failure.providerRetryAfterMs = extra.providerRetryAfterMs;
        }
        if (typeof extra.requestId === "string" && extra.requestId.length > 0) {
            failure.requestId = extra.requestId;
        }
        this.failure = Object.freeze(failure);
    }
}
/** 上游 kind → 宿主错误码表(`harnessErrorCode` 的那几个常量)。 */
const KIND_TO_CODE = {
    rate_limit: "RATE_LIMIT",
    auth: "AUTH",
    auth_challenge: "AUTH",
    bad_request: "INVALID_REQUEST",
    timeout: "TIMEOUT",
    connection: "TRANSPORT",
    upstream: "SERVER",
    already_streaming: "INVALID_REQUEST",
};
/** 把 As One 侧的任意异常翻译成宿主认得的失败。 */
export function toLlmError(err, fallbackMessage) {
    if (err instanceof AsOneLlmError)
        return err;
    if (err instanceof UpstreamError) {
        const code = KIND_TO_CODE[err.kind] ?? "SERVER";
        const status = typeof err.statusCode === "number" ? err.statusCode : undefined;
        // 有原件就带上游原文:分类器为了「人能读懂」重写过 detail,但调用方想看的是
        // 上游到底回了什么(与网关对外「原样透传」同一条定案)。
        const message = err.raw?.text?.trim() || err.detail || err.kind;
        return new AsOneLlmError(message, code, {
            status,
            providerRetryAfterMs: typeof err.retryAfter === "number" ? Math.round(err.retryAfter * 1000) : undefined,
        });
    }
    const message = err instanceof Error && err.message ? err.message : fallbackMessage;
    return new AsOneLlmError(message, "SERVER");
}
// ---------------------------------------------------------------------------
// 模型元数据
// ---------------------------------------------------------------------------
/** 正安全整数才给(宿主 `normalizeModelInfo` 的硬条件)。 */
function positiveInt(v) {
    return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : undefined;
}
/**
 * `ModelEntry` → 宿主元数据。
 *
 * 思考强度:`reasoning_efforts` 为 `null`/`[]`/缺省 时**不声明** `reasoning` ——
 * 声明了就必须给非空 efforts,而空数组在宿主侧直接 `INVALID_MODEL_REASONING`。
 * `reasoning_allows_off === true` 才追加一档 `off`(三态里 `null` 是「上游没说」,
 * 不等同于「可以关」)。
 */
export function modelInfoOf(entry, provider = AS_ONE_PROVIDER) {
    const info = {
        provider,
        id: entry.id,
        // 选择器上显示的就是这个字段(宿主 buildModelCatalog 取 model.name)。
        // 优先用清单算好的 `display_name` —— 它是**整张表**去重后的名字;裸 `name`
        // 单独看没问题,摆在一起会和逻辑模型撞车(用户 m44638)。
        name: entry.display_name ?? entry.name ?? entry.id,
        description: entry.litenexus_kind === "logical"
            ? `逻辑模型 · 由 ${entry.owned_by} 调度`
            : `真实模型 · ${entry.owned_by}`,
        // 按**能力事实**声明输入模态:支持视觉的模型才声明 image。
        //
        // ⚠️ 为什么必须诚实:宿主按 `inputModalities` 决定「能不能给这个模型附图片」。
        // 此前一律写死 ["text"],于是 DSH 会把图片投影成文字(projectImagesForTextModel)
        // —— 视觉模型白扔眼睛。现在声明 image 后宿主会**真发图片块**过来,所以请求侧
        // 必须能接住(见 toChatMessages 的图片块转换),否则就是「声明了支持却丢图」。
        inputModalities: entry.supports_vision === true ? ["text", "image"] : ["text"],
        systemPromptUpdate: "in-history",
        toolUpdate: "in-history",
    };
    const ctx = positiveInt(entry.max_input_tokens);
    if (ctx !== undefined)
        info.context = { contextWindow: ctx };
    const out = positiveInt(entry.max_output_tokens);
    if (out !== undefined)
        info.defaultMaxTokens = out;
    const efforts = Array.isArray(entry.reasoning_efforts) ? entry.reasoning_efforts : [];
    if (efforts.length > 0) {
        const list = efforts
            .filter((e) => typeof e === "string" && e.length > 0)
            .map((id) => ({ id, name: id }));
        if (entry.reasoning_allows_off === true)
            list.push({ id: "off", name: "off" });
        if (list.length > 0)
            info.reasoning = { efforts: list };
    }
    return info;
}
// ---------------------------------------------------------------------------
// 请求方向:DSH 消息 → OpenAI messages
// ---------------------------------------------------------------------------
/** 取一个内容块的可见文本(非文本块返回空串)。 */
function blockText(block) {
    if (block.type === "text" || block.type === "reasoning") {
        const t = block.text;
        return typeof t === "string" ? t : "";
    }
    return "";
}
/**
 * 一条 DSH 消息的**正文**文本。
 *
 * ⚠️ 只取 `text` 块,不含 `reasoning` —— 助手消息里思考内容与正文是并列的两种块,
 * 若一起拼进 `content`,同一段思考会被**同时**写进 `content` 和
 * `reasoning_content`(上游对这种重复的处理不可预测,而且白白翻倍 token)。
 */
function messageText(message) {
    return (message.content ?? [])
        .filter((b) => b.type === "text")
        .map(blockText)
        .filter((s) => s.length > 0)
        .join("\n");
}
/**
 * 从一个图片内容块里挖出可发给上游的 URL(挖不到返回 `null`)。
 *
 * ⚠️ **宽容探测**的理由:宿主下发图片块的字段名不是单一约定(`image` / `image_url`
 * 块里可能是 `{url}` / `{src}` / `{source:{url|data}}` / `{data}` / `{data_url}`,
 * 还可能是纯 base64 字符串)。宁可多试几个键,也不要因为猜错形状把图片丢了 ——
 * 但**绝不编造**:全都没命中就返回 null,由调用方跳过该块(丢一张图好过整个请求失败)。
 *
 * data URL 与 http(s) URL 都原样透传:上游 OpenAI 形状接受两者
 * (`image_url.url` 可以是 `data:image/png;base64,…` 也可以是公网地址)。
 */
function imageUrlOf(block) {
    const b = block;
    const str = (v) => typeof v === "string" && v.trim() !== "" ? v.trim() : null;
    // 直接是字符串字段的几个常见位置。
    const direct = str(b["url"]) ?? str(b["src"]) ?? str(b["data_url"]) ?? str(b["image_url"]);
    if (direct !== null) {
        // `image_url` 也可能是对象({url}) —— 上面 str() 对对象返回 null,交给下面。
        if (direct.startsWith("data:") || /^https?:\/\//i.test(direct))
            return direct;
    }
    // `image_url` / `source` 是对象的情况。
    for (const key of ["image_url", "source", "image"]) {
        const obj = b[key];
        if (typeof obj !== "object" || obj === null)
            continue;
        const inner = obj;
        const found = str(inner["url"]) ?? str(inner["data_url"]) ?? str(inner["data"]);
        if (found !== null) {
            // `data` 可能是裸 base64(没有 data: 前缀)→ 补成 data URL 才能被上游识别。
            if (found.startsWith("data:") || /^https?:\/\//i.test(found))
                return found;
            return `data:image/png;base64,${found}`;
        }
    }
    // 裸 base64 字符串(块本身就是字符串形态的 data)。
    const raw = str(b["data"]);
    if (raw !== null) {
        if (raw.startsWith("data:") || /^https?:\/\//i.test(raw))
            return raw;
        return `data:image/png;base64,${raw}`;
    }
    return null;
}
/**
 * 一条 user 消息 → OpenAI 多模态 content(文本 + 图片分段)。
 *
 * 无图时返回**纯字符串**(保持历史消息的最小形状,不给上游多余结构);
 * 有图时返回分段数组,顺序沿用 DSH 的块序(文本段保留原文,图片段转 image_url)。
 *
 * ⚠️ 只在 user 消息上做:assistant / tool / system 的 content 形状保持不变
 * (见 toChatMessages 的其余分支)。
 */
function userContentOf(message) {
    const parts = [];
    for (const block of message.content ?? []) {
        if (block.type === "text") {
            const text = blockText(block);
            if (text !== "")
                parts.push({ type: "text", text });
            continue;
        }
        const url = imageUrlOf(block);
        if (url !== null)
            parts.push({ type: "image_url", image_url: { url } });
    }
    // 没有图片段 → 退回纯字符串(哪怕为空,与旧行为一致)。
    const hasImage = parts.some((p) => p.type === "image_url");
    if (!hasImage) {
        const text = messageText(message);
        return text;
    }
    return parts;
}
/**
 * DSH 消息历史 → OpenAI `messages`。
 *
 * `options.system` 是**独立字段**(不在 messages 里),而历史里也可能带 system /
 * developer 块(in-history 语义)。这里统一收拢成**一条**前置 system —— 与参考
 * 实现 `[options.system, historySystem].filter(Boolean).join("\n\n")` 同口径。
 */
export function toChatMessages(options) {
    const systemParts = [];
    if (typeof options.system === "string" && options.system.trim())
        systemParts.push(options.system);
    const messages = [];
    for (const message of options.messages ?? []) {
        switch (message.role) {
            case "system":
            case "developer": {
                const text = messageText(message);
                if (text)
                    systemParts.push(text);
                break;
            }
            case "assistant": {
                const text = messageText(message);
                const reasoning = (message.content ?? [])
                    .filter((b) => b.type === "reasoning")
                    .map((b) => blockText(b))
                    .join("");
                const toolCalls = (message.content ?? [])
                    .filter((b) => b.type === "tool-call")
                    .map((b) => ({
                    id: String(b.id ?? ""),
                    type: "function",
                    function: {
                        name: String(b.name ?? ""),
                        arguments: String(b.arguments ?? ""),
                    },
                }))
                    .filter((tc) => tc.id !== "" || tc.function.name !== "");
                messages.push({
                    role: "assistant",
                    // 只有 tool_calls 没有正文时给空串:`ChatMessageContent` 不收 null,
                    // 而上游对 `content: ""` + `tool_calls` 的接受度比 null 更好。
                    content: text,
                    ...(reasoning ? { reasoning_content: reasoning } : {}),
                    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
                });
                break;
            }
            case "tool": {
                messages.push({
                    role: "tool",
                    content: messageText(message),
                    tool_call_id: message.toolCallId ?? "",
                });
                break;
            }
            default: {
                // user 消息:可能带图片块 → 转 OpenAI 多模态 content(无图时仍是纯字符串)。
                messages.push({ role: "user", content: userContentOf(message) });
            }
        }
    }
    if (systemParts.length > 0)
        messages.unshift({ role: "system", content: systemParts.join("\n\n") });
    return messages;
}
/** DSH 工具定义 → OpenAI function 形状。 */
function toChatTools(options) {
    const tools = options.tools;
    if (!Array.isArray(tools) || tools.length === 0)
        return undefined;
    return tools
        .filter((t) => typeof t?.name === "string" && t.name.length > 0)
        .map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
}
/**
 * `GenerateOptions` → 上游请求。
 *
 * ⚠️ `max_tokens` 与 `maxTokensClient` 都要给:前者是本轮发往上游的预算,
 * 后者是**未钳制**的客户端原值 —— 换档重试时 `clampMaxTokens` 必须从原值重算
 * (拿上一轮钳过的值再 min 会越试越小)。
 */
export function toUpstreamRequestFromOptions(options) {
    const maxTokens = positiveInt(options.maxTokens);
    return {
        model: options.model,
        messages: toChatMessages(options),
        stream: true,
        temperature: options.temperature,
        max_tokens: maxTokens,
        maxTokensClient: maxTokens,
        stop: Array.isArray(options.stop) && options.stop.length > 0 ? options.stop : undefined,
        tools: toChatTools(options),
        ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
        // 会话亲和:宿主每个会话给一个 sessionId,与 /v1 路由侧的 session_id 同义。
        prompt_cache_key: options.sessionId,
        extra: { session_id: options.sessionId },
        clientSignal: options.signal,
    };
}
// ---------------------------------------------------------------------------
// 响应方向:OpenAI chunk → DSH StreamChunk
// ---------------------------------------------------------------------------
/** 上游 usage → 宿主 usage(字段名完全不同,必须逐字段搬)。 */
function usageFromOpenAI(usage) {
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const details = (usage.prompt_tokens_details ?? {});
    const completionDetails = (usage.completion_tokens_details ?? {});
    const inputTokens = num(usage.prompt_tokens);
    const outputTokens = num(usage.completion_tokens);
    const cacheReadTokens = num(details.cached_tokens);
    const out = { inputTokens, outputTokens, totalTokens: num(usage.total_tokens) || inputTokens + outputTokens };
    if (cacheReadTokens > 0)
        out.cacheReadTokens = cacheReadTokens;
    const reasoningTokens = num(completionDetails.reasoning_tokens);
    if (reasoningTokens > 0)
        out.reasoningTokens = reasoningTokens;
    return out;
}
/** OpenAI `finish_reason` → 宿主 finish kind。 */
export function finishKindOf(reason) {
    if (reason === "length")
        return "max-tokens";
    if (reason === "tool_calls" || reason === "function_call")
        return "tool-calls";
    return "stop";
}
/**
 * OpenAI delta 流 → DSH 块流。
 *
 * 上游没有「块」的概念,所以这里按**出现顺序**给每种内容分配 index:
 * 同一种内容(如 reasoning)始终占同一个 index,换类型才开新 index。
 * 收尾时按 index 升序关闭所有块 —— 宿主 `validateStream` 要求 finish 时
 * `open.size === 0`。
 */
export async function* translateStream(source, modelName) {
    const blocks = new Map(); // key: "text" | "reasoning" | `tool:${n}`
    const order = [];
    let usage;
    let finishReason = null;
    let toolSeq = 0;
    const openBlock = function* (key, type) {
        const existing = blocks.get(key);
        if (existing)
            return;
        const block = { index: order.length, type, text: "" };
        blocks.set(key, block);
        order.push(block);
        yield { type: "block-start", index: block.index, blockType: type };
    };
    try {
        for await (const chunk of source) {
            if (chunk.usage)
                usage = usageFromOpenAI(chunk.usage);
            const choice = chunk.choices?.[0];
            if (!choice)
                continue;
            if (choice.finish_reason)
                finishReason = choice.finish_reason;
            const delta = choice.delta ?? {};
            if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
                yield* openBlock("reasoning", "reasoning");
                const block = blocks.get("reasoning");
                block.text += delta.reasoning_content;
                yield { type: "reasoning-delta", index: block.index, text: delta.reasoning_content };
            }
            if (typeof delta.content === "string" && delta.content.length > 0) {
                yield* openBlock("text", "text");
                const block = blocks.get("text");
                block.text += delta.content;
                yield { type: "text-delta", index: block.index, text: delta.content };
            }
            for (const call of delta.tool_calls ?? []) {
                // 上游用 `index` 区分并行工具调用;缺省时按出现顺序自己编号。
                const slot = typeof call.index === "number" ? call.index : toolSeq++;
                const key = `tool:${slot}`;
                let block = blocks.get(key);
                if (!block) {
                    yield* openBlock(key, "tool-call");
                    block = blocks.get(key);
                }
                const id = call.id ?? "";
                const name = call.function?.name ?? "";
                const args = call.function?.arguments ?? "";
                if (id)
                    block.toolCallId = id;
                if (name)
                    block.toolName = name;
                block.text += args;
                yield {
                    type: "tool-call-delta",
                    index: block.index,
                    id: block.toolCallId ?? `call-${block.index}`,
                    ...(block.toolName ? { name: block.toolName } : {}),
                    argumentsDelta: args,
                };
            }
        }
    }
    catch (err) {
        // 已经开过块就必须关掉,否则 finish 会因为 open.size>0 被宿主判失败。
        for (const block of order)
            yield blockEndOf(block);
        throw toLlmError(err, `As One 上游流中断(${modelName})`);
    }
    for (const block of order)
        yield blockEndOf(block);
    const kind = finishKindOf(finishReason);
    // 与参考实现同一判据:零块 + stop 就是「上游什么都没回」。宿主对这种流不会
    // 报错(语法合法),但它会拼出一条空白的助手消息 —— 那是更难查的故障,
    // 所以在这里以 EMPTY_RESPONSE 显式失败(该码在宿主默认退避名单里,会重试)。
    if (order.length === 0 && kind === "stop") {
        throw new AsOneLlmError(`As One 未返回任何内容(${modelName})`, "EMPTY_RESPONSE");
    }
    if (usage)
        yield { type: "usage", usage };
    yield { type: "finish", reason: { kind } };
}
/** 关闭一个块:`block-end` 带的是**累积后的完整内容**。 */
function blockEndOf(block) {
    const content = block.type === "tool-call"
        ? {
            type: "tool-call",
            id: block.toolCallId ?? `call-${block.index}`,
            name: block.toolName ?? "",
            arguments: block.text,
        }
        : { type: block.type, text: block.text };
    return { type: "block-end", index: block.index, block: content };
}
/**
 * 适配器本体。一个实例对应一个 As One 运行时。
 *
 * 宿主只要求 `providerInfo` / `listModels` / `resolveModel` / `prepareCall` /
 * `stream` 五个方法(`providerRetryPolicy` 返回 undefined = 用宿主默认退避)。
 */
export class AsOneLlmAdapter {
    rt;
    provider;
    providerName;
    constructor(rt, opts = {}) {
        this.rt = rt;
        this.provider = opts.provider ?? AS_ONE_PROVIDER;
        this.providerName = opts.providerName ?? AS_ONE_PROVIDER_NAME;
    }
    /** `id` 必须**逐字**等于注册时的 provider,否则宿主判 `INVALID_ADAPTER`。 */
    providerInfo(provider) {
        return { id: provider, name: this.providerName };
    }
    /** 退避策略交给宿主默认(`{mode:"normal", maxRetries:5, …}`)。 */
    providerRetryPolicy() {
        return undefined;
    }
    async listModels() {
        const entries = await this.rt.listModels();
        return entries.map((entry) => {
            const info = modelInfoOf(entry, this.provider);
            return {
                provider: this.provider,
                id: info.id,
                name: info.name,
                description: info.description,
                inputModalities: info.inputModalities,
            };
        });
    }
    async resolveModel(provider, model) {
        const entries = await this.rt.listModels();
        const entry = entries.find((e) => e.id === model);
        if (!entry) {
            throw new AsOneLlmError(`As One 没有这个模型:${model}`, "INVALID_REQUEST", { status: 404 });
        }
        return modelInfoOf(entry, provider || this.provider);
    }
    async prepareCall(provider, model, signal) {
        const resolved = await this.resolveModel(provider, model);
        if (signal?.aborted)
            throw abortError();
        return {
            model: resolved,
            stream: (options) => this.stream(options),
        };
    }
    /** 唯一的抽象:产出**语法合法**的块流。 */
    async *stream(options) {
        const model = options.model;
        const upstream = this.rt.resolveUpstream(model);
        if (!upstream) {
            throw new AsOneLlmError(`As One 未知模型:${model}`, "INVALID_REQUEST", { status: 404 });
        }
        const request = toUpstreamRequestFromOptions({ ...options, provider: this.provider });
        const t0 = Date.now();
        let firstChunkMs;
        let seen;
        let ok = false;
        let failure;
        try {
            for await (const chunk of translateStream(upstream.stream(request), model)) {
                if (firstChunkMs === undefined && chunk.type !== "usage" && chunk.type !== "finish") {
                    firstChunkMs = Date.now() - t0;
                }
                if (chunk.type === "usage")
                    seen = chunk.usage;
                yield chunk;
            }
            ok = true;
        }
        catch (err) {
            failure = err instanceof AsOneLlmError ? err : toLlmError(err, `As One 调用失败(${model})`);
            throw failure;
        }
        finally {
            // 与 /v1 路由同一口径记一条明细:面板「实时日志」要能看到 DSH 的调用。
            const aborted = options.signal?.aborted === true;
            this.record(model, ok, failure, aborted, t0, firstChunkMs, seen, request);
        }
    }
    /** 统计挂钩失败绝不能影响已经发出的响应。 */
    record(model, ok, failure, aborted, t0, firstChunkMs, usage, request) {
        try {
            this.rt.onRequestDone({
                model,
                stream: true,
                ok,
                status: ok ? 200 : aborted ? 0 : (failure?.failure.status ?? 500),
                error: ok ? null : (failure?.message ?? "调用失败"),
                error_kind: ok ? null : aborted ? "connection" : (kindOfFailure(failure) ?? "upstream"),
                latency_ms: Math.round(Date.now() - t0),
                ttft_ms: firstChunkMs === undefined ? null : Math.round(firstChunkMs),
                usage: usage
                    ? {
                        prompt_tokens: usage.inputTokens,
                        cached_tokens: usage.cacheReadTokens ?? 0,
                        completion_tokens: usage.outputTokens,
                    }
                    : null,
                session_id: typeof request.extra?.session_id === "string" ? request.extra.session_id : null,
                prompt_cache_key: request.prompt_cache_key ?? null,
                discarded_fields: null,
                request: { model: request.model, messages: request.messages, stream: true },
            });
        }
        catch {
            /* 统计失败不影响调用 */
        }
    }
}
/** 宿主码 → RequestDoneInfo.error_kind(面板按 kind 分类显示)。 */
function kindOfFailure(failure) {
    switch (failure?.code) {
        case "RATE_LIMIT":
            return "rate_limit";
        case "AUTH":
            return "auth";
        case "INVALID_REQUEST":
            return "bad_request";
        case "TIMEOUT":
            return "timeout";
        case "TRANSPORT":
            return "connection";
        case "SERVER":
            return "upstream";
        default:
            return null;
    }
}
function abortError() {
    return new AsOneLlmError("调用已取消", "ABORTED");
}
//# sourceMappingURL=llm-adapter.js.map