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

import type {
  ChatCompletionChunk,
  ChatContentPart,
  ChatMessage,
  ChatMessageContent,
  ChatToolCall,
  ChatToolDefinition,
  ModelEntry,
  Upstream,
  UpstreamRequest,
} from "@as-one/core/src/gateway/types.js";
import { UpstreamError } from "@as-one/core/src/gateway/types.js";
import type { AsOneRuntime } from "./setup.js";
import { buildMergePrompt, joinDigests, needsMerge, planCompactChunks } from "./compact-chunk.js";
import { estimateMessagesTokens } from "./gateway-upstream-context.js";
import { rerouteModel, type RerouteSettings } from "./reroute.js";
import type {
  DshAttachmentService,
  DshCatalogModelInfo,
  DshContentBlock,
  DshFailure,
  DshFinishReason,
  DshGenerateOptions,
  DshImageAttachmentRef,
  DshImageTarget,
  DshLlmAdapter,
  DshMessage,
  DshPreparedCall,
  DshRequestImage,
  DshResolvedModelInfo,
  DshStreamChunk,
  DshUsage,
} from "./llm-types.js";

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
  readonly code: string;
  readonly failure: DshFailure;

  constructor(
    message: string,
    code: string,
    extra: { status?: number; providerRetryAfterMs?: number; requestId?: string } = {},
  ) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    const failure: Record<string, unknown> = { message, code };
    if (
      typeof extra.status === "number" &&
      Number.isInteger(extra.status) &&
      extra.status >= 100 &&
      extra.status <= 599
    ) {
      failure.status = extra.status;
    }
    if (
      typeof extra.providerRetryAfterMs === "number" &&
      Number.isFinite(extra.providerRetryAfterMs) &&
      extra.providerRetryAfterMs > 0
    ) {
      failure.providerRetryAfterMs = extra.providerRetryAfterMs;
    }
    if (typeof extra.requestId === "string" && extra.requestId.length > 0) {
      failure.requestId = extra.requestId;
    }
    this.failure = Object.freeze(failure) as unknown as DshFailure;
  }
}

/** 上游 kind → 宿主错误码表(`harnessErrorCode` 的那几个常量)。 */
const KIND_TO_CODE: Record<string, string> = {
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
export function toLlmError(err: unknown, fallbackMessage: string): AsOneLlmError {
  if (err instanceof AsOneLlmError) return err;
  if (err instanceof UpstreamError) {
    const code = KIND_TO_CODE[err.kind] ?? "SERVER";
    const status = typeof err.statusCode === "number" ? err.statusCode : undefined;
    // 有原件就带上游原文:分类器为了「人能读懂」重写过 detail,但调用方想看的是
    // 上游到底回了什么(与网关对外「原样透传」同一条定案)。
    const message = err.raw?.text?.trim() || err.detail || err.kind;
    return new AsOneLlmError(message, code, {
      status,
      providerRetryAfterMs:
        typeof err.retryAfter === "number" ? Math.round(err.retryAfter * 1000) : undefined,
    });
  }
  const message = err instanceof Error && err.message ? err.message : fallbackMessage;
  return new AsOneLlmError(message, "SERVER");
}

// ---------------------------------------------------------------------------
// 模型元数据
// ---------------------------------------------------------------------------

/** 正安全整数才给(宿主 `normalizeModelInfo` 的硬条件)。 */
function positiveInt(v: number | undefined): number | undefined {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : undefined;
}

/** 档位 id → 模型选择器里的显示名(id 必须保持规范英文,网关按 id 认档)。 */
const EFFORT_LABELS: Record<string, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
  max: "Max",
};

/**
 * `ModelEntry` → 宿主元数据。
 *
 * 思考强度:`reasoning_efforts` 为 `null`/`[]`/缺省 时**不声明** `reasoning` ——
 * 声明了就必须给非空 efforts,而空数组在宿主侧直接 `INVALID_MODEL_REASONING`。
 * `reasoning_allows_off === true` 才追加一档 `off`(三态里 `null` 是「上游没说」,
 * 不等同于「可以关」)。档位 id 原样透传给网关(它按规范阶梯认值),显示名固定
 * 英文(Off/Low/Medium/High/Max)—— 用户定案「思考强度都只显示英文」。
 */
export function modelInfoOf(entry: ModelEntry, provider = AS_ONE_PROVIDER): DshResolvedModelInfo {
  const info: DshResolvedModelInfo = {
    provider,
    id: entry.id,
    // 选择器上显示的就是这个字段(宿主 buildModelCatalog 取 model.name)。
    // 优先用清单算好的 `display_name` —— 它是**整张表**去重后的名字;裸 `name`
    // 单独看没问题,摆在一起会和逻辑模型撞车(用户 m44638)。
    name: entry.display_name ?? entry.name ?? entry.id,
    description:
      entry.litenexus_kind === "logical"
        ? `逻辑模型 · 由 ${entry.owned_by} 调度`
        : `真实模型 · ${entry.owned_by}`,
    // **所有** as-one 路由都声明 `image`:这里声明的是「这个路由**接受**图片附件」,
    // 不是「上游模型自己看得见图」。
    //
    // ⚠️ 为什么不能按 `supports_vision` 声明(2026-11-02「模型读不了图」):
    //  宿主按 `inputModalities` 决定要不要把图片交给模型 —— 不声明 image 时它会
    //  把整块图**替换成** `[image omitted because this model accepts text only;
    //  attachment sha256:…]`(`projectImagesForTextModel`),`read_image` 工具
    //  更是直接拒绝执行。于是 as-one 的图像桥**永远收不到图**:上游是文本模型
    //  没错,但网关本来会把图转成文字证据(见 core/gateway/image-bridge.ts),
    //  这条能力被客户端那一行声明直接掐死,用户看到的就是「模型不能读图」。
    //
    //  分工是清楚的:
    //  · 上游自己有视觉(链上有 `supportsVision` 端点)→ 网关**透传**图片,原生读;
    //  · 上游看不见图 → 网关**桥接**:逐张转成文字证据塞回原位,再发给文本模型。
    //  两条路都不需要客户端先替网关做决定。
    inputModalities: ["text", "image"],
    systemPromptUpdate: "in-history",
    toolUpdate: "in-history",
  };
  const ctx = positiveInt(entry.max_input_tokens);
  if (ctx !== undefined) info.context = { contextWindow: ctx };
  const out = positiveInt(entry.max_output_tokens);
  if (out !== undefined) info.defaultMaxTokens = out;
  const efforts = Array.isArray(entry.reasoning_efforts) ? entry.reasoning_efforts : [];
  if (efforts.length > 0) {
    const list = efforts
      .filter((e): e is string => typeof e === "string" && e.length > 0)
      .map((id) => ({ id, name: EFFORT_LABELS[id] ?? id }));
    if (entry.reasoning_allows_off === true) list.push({ id: "off", name: EFFORT_LABELS.off });
    if (list.length > 0) info.reasoning = { efforts: list };
  }
  return info;
}

// ---------------------------------------------------------------------------
// 请求方向:DSH 消息 → OpenAI messages
// ---------------------------------------------------------------------------

/** 取一个内容块的可见文本(非文本块返回空串)。 */
function blockText(block: DshContentBlock): string {
  if (block.type === "text" || block.type === "reasoning") {
    const t = (block as { text?: unknown }).text;
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
function messageText(message: DshMessage): string {
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
function imageUrlOf(block: DshContentBlock): string | null {
  const b = block as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  // 直接是字符串字段的几个常见位置。
  const direct = str(b["url"]) ?? str(b["src"]) ?? str(b["data_url"]) ?? str(b["image_url"]);
  if (direct !== null) {
    // `image_url` 也可能是对象({url}) —— 上面 str() 对对象返回 null,交给下面。
    if (direct.startsWith("data:") || /^https?:\/\//i.test(direct)) return direct;
  }
  // `image_url` / `source` 是对象的情况。
  for (const key of ["image_url", "source", "image"] as const) {
    const obj = b[key];
    if (typeof obj !== "object" || obj === null) continue;
    const inner = obj as Record<string, unknown>;
    const found = str(inner["url"]) ?? str(inner["data_url"]) ?? str(inner["data"]);
    if (found !== null) {
      // `data` 可能是裸 base64(没有 data: 前缀)→ 补成 data URL 才能被上游识别。
      if (found.startsWith("data:") || /^https?:\/\//i.test(found)) return found;
      return `data:image/png;base64,${found}`;
    }
  }
  // 裸 base64 字符串(块本身就是字符串形态的 data)。
  const raw = str(b["data"]);
  if (raw !== null) {
    if (raw.startsWith("data:") || /^https?:\/\//i.test(raw)) return raw;
    return `data:image/png;base64,${raw}`;
  }
  // ⚠️ `attachment` 里可能**直接带 url / data**(2026-11-10):多数宿主只给
  // `{attachmentId, mediaType, bytes, width, height}`(必须走 readImageRequest),
  // 但有的部署会顺手把兑好的 data URL 塞进同一个对象。能直读就别去读服务 ——
  // 少一次附件服务往返,也避免「服务没挂 → 图丢掉」。
  const att = b["attachment"];
  if (typeof att === "object" && att !== null) {
    const inner = att as Record<string, unknown>;
    // ⚠️ 下划线与驼峰**都要认**:DSH 的 JSON 走 snake_case(`data_url`),
    // 而宿主内存里的对象可能已经是 camelCase(`dataUrl`)。只认一种就会漏。
    const found =
      str(inner["url"]) ?? str(inner["data_url"]) ?? str(inner["dataUrl"]) ?? str(inner["data"]);
    if (found !== null) {
      if (found.startsWith("data:") || /^https?:\/\//i.test(found)) return found;
      // 裸 base64:要求够长(短串多半是 id/哈希,不是图)才当图。
      if (found.length >= 64) return `data:image/png;base64,${found}`;
    }
  }
  return null;
}

/**
 * 把一块**附件引用**形态的图片解析成内联 data URL(解析不了 → null)。
 *
 * `read_image` 工具的结果与用户附件在 DSH 消息里都是 `ImageBlock`:
 * `{type:"image", attachment:{attachmentId, mediaType, bytes, width, height}}`
 * —— **没有 url**。不解析就发不出去;解析成 data URL 后既有的
 * {@link imageUrlOf} 与网关图像桥都能直接消费。
 *
 * 同一附件在一次请求里只派生一次(缓存),重复出现的图不会重复解码。
 */
async function attachmentImageUrl(
  block: DshContentBlock,
  attachments: DshAttachmentService,
  targetOf: (ref: DshImageAttachmentRef) => DshImageTarget,
  cache: Map<string, string | null>,
  signal: AbortSignal | undefined,
): Promise<string | null> {
  const ref = (block as { attachment?: Partial<DshImageAttachmentRef> }).attachment;
  if (ref === undefined || typeof ref.attachmentId !== "string" || ref.attachmentId === "") {
    // ⚠️ 块类型是 image,却没有附件引用、也没有 url —— 形状不认识。
    // 记一条日志:这是「客户端换了图片块的形状」的第一现场,不记就无从排查。
    // 只打**键名与类型**,绝不打内容(图里可能是用户的隐私画面)。
    const shape = Object.entries(block as Record<string, unknown>)
      .map(([k, v]) => {
        if (k === "attachment" && typeof v === "object" && v !== null) {
          const keys = Object.keys(v as Record<string, unknown>).join("|");
          return `attachment{${keys}}`;
        }
        return `${k}:${v === null ? "null" : typeof v}`;
      })
      .join(", ");
    console.warn(`[as-one] 图片块形状不认识(既无 url 也无 attachmentId):{${shape}}`);
    return null;
  }
  const hit = cache.get(ref.attachmentId);
  if (hit !== undefined) return hit;
  try {
    const full: DshImageAttachmentRef = {
      attachmentId: ref.attachmentId,
      mediaType: typeof ref.mediaType === "string" && ref.mediaType !== "" ? ref.mediaType : "image/png",
      bytes: typeof ref.bytes === "number" && ref.bytes > 0 ? ref.bytes : 0,
      width: typeof ref.width === "number" && ref.width > 0 ? ref.width : 0,
      height: typeof ref.height === "number" && ref.height > 0 ? ref.height : 0,
    };
    const version = await attachments.readImageRequest(full, targetOf(full), signal);
    const mediaType =
      typeof version.mediaType === "string" && version.mediaType !== "" ? version.mediaType : full.mediaType;
    const url = `data:${mediaType};base64,${Buffer.from(version.data).toString("base64")}`;
    cache.set(ref.attachmentId, url);
    return url;
  } catch (err) {
    // ⚠️ **必须记日志**(2026-11-10):旧实现把异常整个吞掉,于是「图读不到」
    // 在日志里毫无痕迹,只能靠猜。现在留下附件 id 与原因 ——
    // 「附件已不在」「后端不支持派生」「target 不匹配」三种失败一眼能分开。
    console.warn(
      `[as-one] 图片附件读取失败(attachmentId=${ref.attachmentId.slice(0, 12)}…): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    // 丢掉这张图好过整条请求 400 —— 调用方会把它换成一条占位文本。
    cache.set(ref.attachmentId, null);
    return null;
  }
}

/**
 * 附件读不到时的**占位文本块**(2026-11-10 用户报「无法读取会话附图」)。
 *
 * 为什么不是「删掉这块」:删了之后模型完全不知道用户发过图,只会说「你没发图」;
 * 而用户明明贴了。留一条占位,模型就能如实回答「这张图我这边读不到,请重发」,
 * 这是**可恢复的错误**,而不是静默丢失。
 *
 * ⚠️ 文案刻意写成**中性陈述**,不带请求动作 —— 模型可以自己决定怎么跟用户讲。
 */
function imageUnreadableBlock(reason: string): DshContentBlock {
  return {
    type: "text",
    text: `[图片: 附件未能读取(${reason})。这张图本轮不可见。]`,
  } as unknown as DshContentBlock;
}

/**
 * 把消息里的图片块解析成**内联数据 URL**(只动 image 块,其余原样返回)。
 *
 * ⚠️ 为什么必需:DSH 的图片块只带附件引用,宿主对 adapter 的图片契约
 * (`imageRequestTarget`)只给宽/高/字节数、**不给字节内容** —— 想要字节必须
 * 自己经 `ctx.attachments.readImageRequest()` 读。不解析 = 图永远到不了网关
 * (用户「会话模型看不到图」的根因)。
 *
 * 已经能直接取到 URL 的块(自带 url/data_url/裸 base64)原样保留,交给
 * {@link imageUrlOf} 的宽容探测。没有附件服务(纯 Web 宿主)时图片块按旧行为
 * 丢弃 —— 文字照常。
 */
export async function resolveImagesInMessages(
  messages: DshMessage[],
  attachments: DshAttachmentService | undefined,
  targetOf: (ref: DshImageAttachmentRef) => DshImageTarget,
  signal?: AbortSignal,
): Promise<DshMessage[]> {
  const anyImage = messages.some((m) => (m.content ?? []).some((b) => b.type === "image"));
  if (!anyImage) return messages;
  const cache = new Map<string, string | null>();
  const out: DshMessage[] = [];
  for (const message of messages) {
    const blocks = message.content ?? [];
    if (!blocks.some((b) => b.type === "image")) {
      out.push(message);
      continue;
    }
    const next: DshContentBlock[] = [];
    for (const block of blocks) {
      if (block.type !== "image") {
        next.push(block);
        continue;
      }
      if (imageUrlOf(block) !== null) {
        next.push(block);
        continue;
      }
      // ⚠️ **读不到附件时留占位,不静默删块**(2026-11-10 用户报「无法读取会话附图」)。
      //
      // 旧行为:直接 `continue` 把块丢掉 —— 结果模型**完全不知道用户发过图**,
      // 于是它只会说「你没发图」或者干脆忽略,用户却明明贴了图。
      // 这与「网关丢图」是同一类症状的另一种成因:不是图被裁掉,是图从来没到。
      //
      // 现在换成一条明确的占位文本:模型能如实说「这张图我这边读不到」,
      // 用户也就能判断该重发或改走文件路径。
      if (attachments === undefined) {
        next.push(imageUnreadableBlock("当前宿主没有附件服务"));
        console.warn("[as-one] 图片附件未解析:宿主没有 attachments 服务(resolveAttachments 返回 undefined)");
        continue;
      }
      const url = await attachmentImageUrl(block, attachments, targetOf, cache, signal);
      if (url === null) {
        next.push(imageUnreadableBlock("附件读取失败"));
        continue;
      }
      next.push({ ...(block as { type: string }), url } as unknown as DshContentBlock);
    }
    out.push({ ...message, content: next });
  }
  return out;
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
function userContentOf(message: DshMessage): ChatMessageContent {
  const parts: ChatContentPart[] = [];
  for (const block of message.content ?? []) {
    if (block.type === "text") {
      const text = blockText(block);
      if (text !== "") parts.push({ type: "text", text });
      continue;
    }
    const url = imageUrlOf(block);
    if (url !== null) parts.push({ type: "image_url", image_url: { url } });
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
export function toChatMessages(options: DshGenerateOptions): ChatMessage[] {
  const systemParts: string[] = [];
  if (typeof options.system === "string" && options.system.trim()) systemParts.push(options.system);

  const messages: ChatMessage[] = [];
  for (const message of options.messages ?? []) {
    switch (message.role) {
      case "system":
      case "developer": {
        const text = messageText(message);
        if (text) systemParts.push(text);
        break;
      }
      case "assistant": {
        const text = messageText(message);
        const reasoning = (message.content ?? [])
          .filter((b) => b.type === "reasoning")
          .map((b) => blockText(b))
          .join("");
        const toolCalls: ChatToolCall[] = (message.content ?? [])
          .filter((b) => b.type === "tool-call")
          .map((b) => ({
            id: String((b as { id?: unknown }).id ?? ""),
            type: "function" as const,
            function: {
              name: String((b as { name?: unknown }).name ?? ""),
              arguments: String((b as { arguments?: unknown }).arguments ?? ""),
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
        // tool 结果可能带图 —— `read_image` 的返回就是「文字信封 + 图片块」。只取
        // text 会丢掉图,所以这里走与 user 消息同一套分段:有图时 content 是
        // OpenAI 多模态数组(网关图像桥按段扫描;视觉端点则原样透传)。
        const parts: ChatContentPart[] = [];
        const toolText = messageText(message);
        if (toolText !== "") parts.push({ type: "text", text: toolText });
        for (const block of message.content ?? []) {
          if (block.type !== "image") continue;
          const url = imageUrlOf(block);
          if (url !== null) parts.push({ type: "image_url", image_url: { url } });
        }
        messages.push({
          role: "tool",
          // 无图时保持纯字符串(历史消息的最小形状不变)。
          content: parts.some((p) => p.type === "image_url") ? parts : toolText,
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

  if (systemParts.length > 0) messages.unshift({ role: "system", content: systemParts.join("\n\n") });
  return messages;
}

/** DSH 工具定义 → OpenAI function 形状。 */
function toChatTools(options: DshGenerateOptions): ChatToolDefinition[] | undefined {
  const tools = options.tools;
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools
    .filter((t) => typeof t?.name === "string" && t.name.length > 0)
    .map((t) => ({
      type: "function" as const,
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
export function toUpstreamRequestFromOptions(options: DshGenerateOptions): UpstreamRequest {
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

/**
 * 上游 usage → 宿主 usage(字段名完全不同,必须逐字段搬)。
 *
 * ⚠️ **口径差**:宿主的 `inputTokens` 是**未缓存输入**(Anthropic 语义,
 * `uncachedInputTokens: usage.inputTokens` 直接照搬),而 OpenAI 的
 * `prompt_tokens` 是**含** cached 的超集。原样搬过去会让宿主的命中率
 * `cacheRead / (input + cacheRead)` 把缓存算两遍 —— 实测真实 45.6% 被显示成
 * 31.3%(单条 99.96% 显示成 50%)。所以这里先减掉 cached 再给宿主,
 * `totalTokens` 仍取上游 `total_tokens`(= prompt + completion),两者自洽。
 *
 * 负数兜底:个别渠道把 cached 报得比 prompt 还大,钳到 0 而不是给负值。
 */
function usageFromOpenAI(usage: Record<string, unknown>): DshUsage {
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const details = (usage.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const completionDetails = (usage.completion_tokens_details ?? {}) as Record<string, unknown>;
  const promptTokens = num(usage.prompt_tokens);
  const outputTokens = num(usage.completion_tokens);
  const cacheReadTokens = num(details.cached_tokens);
  const inputTokens = Math.max(0, promptTokens - cacheReadTokens);
  const out: DshUsage = {
    inputTokens,
    outputTokens,
    totalTokens: num(usage.total_tokens) || promptTokens + outputTokens,
  };
  if (cacheReadTokens > 0) out.cacheReadTokens = cacheReadTokens;
  const reasoningTokens = num(completionDetails.reasoning_tokens);
  if (reasoningTokens > 0) out.reasoningTokens = reasoningTokens;
  return out;
}

/** OpenAI `finish_reason` → 宿主 finish kind。 */
export function finishKindOf(reason: string | null | undefined): DshFinishReason["kind"] {
  if (reason === "length") return "max-tokens";
  if (reason === "tool_calls" || reason === "function_call") return "tool-calls";
  return "stop";
}

/** 一个已打开块的累积状态。 */
interface OpenBlock {
  index: number;
  type: "text" | "reasoning" | "tool-call";
  text: string;
  toolCallId?: string;
  toolName?: string;
}

/**
 * OpenAI delta 流 → DSH 块流。
 *
 * 上游没有「块」的概念,所以这里按**出现顺序**给每种内容分配 index:
 * 同一种内容(如 reasoning)始终占同一个 index,换类型才开新 index。
 * 收尾时按 index 升序关闭所有块 —— 宿主 `validateStream` 要求 finish 时
 * `open.size === 0`。
 */
/** abort 信号 → 一个立即 reject 的 Promise(与 `iter.next()` 赛跑用)。 */
function abortSignalPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
}

export async function* translateStream(
  source: AsyncIterable<ChatCompletionChunk>,
  modelName: string,
  signal?: AbortSignal,
): AsyncGenerator<DshStreamChunk> {
  const blocks = new Map<string, OpenBlock>(); // key: "text" | "reasoning" | `tool:${n}`
  const order: OpenBlock[] = [];
  let usage: DshUsage | undefined;
  let finishReason: string | null = null;
  let toolSeq = 0;

  const openBlock = function* (key: string, type: OpenBlock["type"]): Generator<DshStreamChunk> {
    const existing = blocks.get(key);
    if (existing) return;
    const block: OpenBlock = { index: order.length, type, text: "" };
    blocks.set(key, block);
    order.push(block);
    yield { type: "block-start", index: block.index, blockType: type };
  };

  const iterator = source[Symbol.asyncIterator]();
  try {
    for (;;) {
      // ⚠️ DSH 停止会话的**主动**检查(用户 2026-11-06「终止会话不要等过久」)。
      // `for await` 的问题是它阻塞在 `await next()` 上 —— 本地合成流
      // (sensenova/qoder 由连接器内存拼块)若在等上游数据,循环体里的检查
      // 永远轮不到。这里用 Promise.race 让 abort 与「取下一块」赛跑:
      // 命中 abort 立即抛,不等生成器吐完。
      const next: Promise<IteratorResult<ChatCompletionChunk>> =
        signal === undefined ? iterator.next() : Promise.race([iterator.next(), abortSignalPromise(signal)]);
      const { done, value: chunk } = await next;
      if (done) break;
      if (chunk.usage) usage = usageFromOpenAI(chunk.usage as unknown as Record<string, unknown>);
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta ?? {};

      if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
        yield* openBlock("reasoning", "reasoning");
        const block = blocks.get("reasoning")!;
        block.text += delta.reasoning_content;
        yield { type: "reasoning-delta", index: block.index, text: delta.reasoning_content };
      }

      if (typeof delta.content === "string" && delta.content.length > 0) {
        yield* openBlock("text", "text");
        const block = blocks.get("text")!;
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
          block = blocks.get(key)!;
        }
        const id = call.id ?? "";
        const name = call.function?.name ?? "";
        const args = call.function?.arguments ?? "";
        if (id) block.toolCallId = id;
        if (name) block.toolName = name;
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
  } catch (err) {
    // 已经开过块就必须关掉,否则 finish 会因为 open.size>0 被宿主判失败。
    for (const block of order) yield blockEndOf(block);
    throw toLlmError(err, `As One 上游流中断(${modelName})`);
  }

  for (const block of order) yield blockEndOf(block);

  const kind = finishKindOf(finishReason);
  // 与参考实现同一判据:零块 + stop 就是「上游什么都没回」。宿主对这种流不会
  // 报错(语法合法),但它会拼出一条空白的助手消息 —— 那是更难查的故障,
  // 所以在这里以 EMPTY_RESPONSE 显式失败(该码在宿主默认退避名单里,会重试)。
  if (order.length === 0 && kind === "stop") {
    throw new AsOneLlmError(`As One 未返回任何内容(${modelName})`, "EMPTY_RESPONSE");
  }
  if (usage) yield { type: "usage", usage };
  yield { type: "finish", reason: { kind } };
}

/** 关闭一个块:`block-end` 带的是**累积后的完整内容**。 */
function blockEndOf(block: OpenBlock): DshStreamChunk {
  const content: DshContentBlock =
    block.type === "tool-call"
      ? {
          type: "tool-call",
          id: block.toolCallId ?? `call-${block.index}`,
          name: block.toolName ?? "",
          arguments: block.text,
        }
      : { type: block.type, text: block.text };
  return { type: "block-end", index: block.index, block: content };
}

// ---------------------------------------------------------------------------
// 压缩请求(compact)
// ---------------------------------------------------------------------------

/**
 * compact 分块的输入预算(按目标模型的窗口现算,不写死)。
 *
 * 上一版写死 24,000 → 块预算 19,200,一个 3M token 的会话要切 **179 块**,
 * 串行跑完要几十分钟。窗口的 50% 封顶 160k:再大单块的 prefill 也会被上游
 * 按 TPM 拦(实测 `inference exceeds tpm/rpm limit`),而且归并压力更大。
 */
const COMPACT_BUDGET_RATIO = 0.5;
const COMPACT_BUDGET_MIN = 16_000;
const COMPACT_BUDGET_MAX = 160_000;
/** 窗口未知(逻辑模型的 `max_input_tokens` 常常是空)时的保守预算。 */
const COMPACT_BUDGET_FALLBACK = 48_000;
/** 同时跑几块 —— 每块一次独立上游调用,并发受调度器的端点容量约束。 */
const COMPACT_CONCURRENCY = 3;
/**
 * 归并输出上限。
 *
 * 4,096 而不是 8,192:归并是一次**串行尾延迟**(要等所有块出来才能开始),
 * 输出 token 数直接换成墙钟时间。8,192 tok 的输出在 50 tok/s 的模型上就是
 * 160 秒 —— 比整个分块阶段还长,而检查点写 8k 还是 4k 对后续对话几乎没差别。
 */
const COMPACT_MERGE_TOKENS = 4_096;
const COMPACT_CHUNK_PROMPT =
  "把下列会话片段压缩成简洁要点。保留精确文件路径、命令、错误原文、标识符与数值;不要输出额外解释。\n\n";

/** 模型窗口 → 分块输入预算。 */
export function compactInputBudget(windowTokens: number | undefined): number {
  if (!(typeof windowTokens === "number") || !Number.isFinite(windowTokens) || windowTokens <= 0) {
    return COMPACT_BUDGET_FALLBACK;
  }
  return Math.max(
    COMPACT_BUDGET_MIN,
    Math.min(COMPACT_BUDGET_MAX, Math.floor(windowTokens * COMPACT_BUDGET_RATIO)),
  );
}

/**
 * 有上限的并发池:按 `limit` 逐批推,失败不打断其它块。
 *
 * 刻意不用「一次发 N 个 Promise.all」——块数可能上百,一次全发会把调度器的
 * 并发账本打满、把用户的下一条消息挤死,还会同时撞上游 TPM。
 */
async function eachLimit<T>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const width = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length));
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await run(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: width }, () => worker()));
}

const sleepMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 把一组行对半切开(单行时按字符切)。切不动 → null。
 *
 * 「切不动」只发生在字符级也已经很短时 —— 那种情况再切只会得到一个
 * 无意义的片段,不如如实报失败。
 */
function splitLinesInHalf(lines: readonly string[]): [string[], string[]] | null {
  if (lines.length >= 2) {
    const mid = Math.ceil(lines.length / 2);
    return [lines.slice(0, mid), lines.slice(mid)];
  }
  const line = lines[0] ?? "";
  if (line.length < 512) return null;
  const mid = Math.floor(line.length / 2);
  return [[line.slice(0, mid)], [line.slice(mid)]];
}

/** 客户端有没有走掉(包一层是为了每次都现读,不被上一处 `=== true` 收窄类型)。 */
function abortedNow(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

// ---------------------------------------------------------------------------
// adapter
// ---------------------------------------------------------------------------

export interface AsOneLlmAdapterOptions {
  /** 覆盖注册 id(测试用)。 */
  provider?: string;
  /** 覆盖显示名。 */
  providerName?: string;
  /**
   * 宿主 `attachments` 服务的惰性取用口(每次请求现取 —— 服务可能晚于本 adapter
   * 挂载,或者根本没有;没有时 adapter 如实降级丢掉图片块)。
   *
   * 用**回调**而不是直接传服务实例:插件 `ctx.inject(["llm"], …)` 注册 adapter
   * 时 attachments 可能还没挂,拿一次快照会永远拿不到。
   */
  resolveAttachments?: () => DshAttachmentService | undefined;
  /**
   * 重路由设置的**现读口**(来自 `setting` 表,见 `reroute.ts`)。
   *
   * 传函数而不是快照:面板保存设置后,下一个请求就要换车道,不能等重载。
   * **缺省 = 不重路由**:任何 `purpose` 都按客户端给的模型走。
   */
  reroutes?: () => RerouteSettings;
}

/**
 * 适配器本体。一个实例对应一个 As One 运行时。
 *
 * ⚠️ **不是"实现五个必需方法就行"**。宿主 `LlmAdapter` 基类虽然为 `providerInfo`
 * / `providerRetryPolicy` / `imageRequestPricing` / `imageRequestTarget` /
 * `listModels` / `resolveModel` / `prepareCall` / `stream` 都写了默认实现,
 * 但本类是**普通类**(宿主包只有 .js 没有 .d.ts,运行时不 import),继承链不存在
 * ⇒ 基类默认实现**一个都不会生效**。宿主调用处大量写成
 * `adapter.xxx(...)`(可选链只护前面的 `get()`),漏一个方法就是
 * `TypeError: ... is not a function` —— 2026-11-01 的
 * `imageRequestPricing is not a function` 就是这么来的(声明了 image 模态之后,
 * 宿主的 token meter 才开始调它)。新增能力时**先把基类方法表对一遍**。
 */
export class AsOneLlmAdapter implements DshLlmAdapter {
  private readonly provider: string;
  private readonly providerName: string;
  private readonly resolveAttachments: (() => DshAttachmentService | undefined) | undefined;
  private readonly reroutes: () => RerouteSettings;

  constructor(
    private readonly rt: Pick<AsOneRuntime, "listModels" | "resolveUpstream" | "onRequestDone">,
    opts: AsOneLlmAdapterOptions = {},
  ) {
    this.provider = opts.provider ?? AS_ONE_PROVIDER;
    this.providerName = opts.providerName ?? AS_ONE_PROVIDER_NAME;
    this.resolveAttachments = opts.resolveAttachments;
    this.reroutes = opts.reroutes ?? (() => ({}));
  }

  /** `id` 必须**逐字**等于注册时的 provider,否则宿主判 `INVALID_ADAPTER`。 */
  providerInfo(provider: string): { id: string; name: string } {
    return { id: provider, name: this.providerName };
  }

  /** 退避策略交给宿主默认(`{mode:"normal", maxRetries:5, …}`)。 */
  providerRetryPolicy(): undefined {
    return undefined;
  }

  /**
   * 本路由的**图片计价**声明 —— 宿主 token meter 每次测量都同步调它。
   *
   * ⚠️ **这个方法不写就整条链路崩**:宿主调用处是
   * `this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model)`,
   * 可选链只护前面的 `get()`;方法本身不存在时抛的是
   * `TypeError: ... imageRequestPricing is not a function`,而且发生在**计量
   * 阶段** —— 用户看到的是"请求发不出去",日志里却在 llm runtime 深处。
   * 宿主基类 `LlmAdapter` 给了默认实现(`return undefined`),但本 adapter 是
   * 普通类、不继承宿主基类(宿主只有 .js 没有 .d.ts),默认实现落不到这里。
   *
   * 为什么返回 `undefined` 而不是一套单价:As One 的上游计费口径各不相同
   * (按次 / 按图块 / 按 token),拿不出一份对所有渠道都成立的视觉 token 换算;
   * 声明一个假单价会让宿主算出一个理直气壮的错数,比"不声明、由计量方回落
   * 中性估算"更糟。
   */
  imageRequestPricing(_provider: string, _model: string): undefined {
    return undefined;
  }

  /**
   * 本路由发出去的图片尺寸/字节目标。
   *
   * As One **不做二次缩放**:图片原样透传给上游连接器(`toChatMessages` 把图片
   * 块转成 `image_url` 分段),要不要压缩由各连接器自己决定。所以这里原样回传
   * 宿主给的宽/高/字节数 —— 与宿主基类默认实现同义,但必须**显式存在**:
   * `ctx.llm.imageRequestTarget()` 的调用处同样会对 `undefined` 抛
   * `is not a function`。
   */
  imageRequestTarget(
    _provider: string,
    _model: string,
    image: DshRequestImage,
  ): DshImageTarget {
    return { width: image.width, height: image.height, maxBytes: image.bytes };
  }

  async listModels(): Promise<DshCatalogModelInfo[]> {
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

  async resolveModel(provider: string, model: string): Promise<DshResolvedModelInfo> {
    const entries = await this.rt.listModels();
    const entry = entries.find((e) => e.id === model);
    if (!entry) {
      throw new AsOneLlmError(`As One 没有这个模型:${model}`, "INVALID_REQUEST", { status: 404 });
    }
    return modelInfoOf(entry, provider || this.provider);
  }

  async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<DshPreparedCall> {
    const resolved = await this.resolveModel(provider, model);
    if (signal?.aborted) throw abortError();
    return {
      model: resolved,
      stream: (options) => this.stream(options),
    };
  }

  /**
   * 重路由的辅助请求不读图片像素,只留**可寻址**占位(块数不变)。
   *
   * 为什么不是"删掉图块":删块会缩短块序列,同一条历史在不同轮次产出不同
   * 字节;而占位文本只由附件 id / 文件名决定,同图恒同字节。位置信息也保住了
   * —— 模型仍然知道"这里原本有一张图"。
   */
  private placeholderImages(messages: DshMessage[]): DshMessage[] {
    return messages.map((message) => ({
      ...message,
      content: (message.content ?? []).map((block) => {
        if (block.type !== "image") return block;
        const att = (block as { attachment?: { attachmentId?: string; name?: string } }).attachment;
        const ref = att?.attachmentId ?? att?.name ?? "unknown";
        return { type: "text", text: `[image: ${ref}]` } as unknown as DshContentBlock;
      }),
    }));
  }

  /**
   * 分块摘要 →（必要时）单级归并 → 合成宿主认得的块流(只借用压缩算法)。
   *
   * 2026-11-14 提速重做,四件事:
   * 1. **块预算按目标模型窗口算**(`compactInputBudget`),不再写死 24k;
   * 2. **块并行**(`COMPACT_CONCURRENCY` 路),每块独立会话号,免得同一条亲和
   *    pin 把并发挤成串行(`concurrency=1` 的端点会直接 `all_busy`);
   * 3. **能省归并就省**(`needsMerge`):归并要再读写一遍全部 digest,实测占整次
   *    压缩 15%~25% 墙钟;
   * 4. **单块失败不拖垮整次**:重试一次(限流退避),仍失败就跳过 —— 只要还有
   *    一块成功,就还能交出一份能用的检查点。
   */
  private async *compactStream(
    upstream: Upstream,
    request: UpstreamRequest,
    model: string,
  ): AsyncGenerator<DshStreamChunk> {
    const started = Date.now();
    const window = await this.contextWindowOf(model);
    const budget = compactInputBudget(window);
    const plan = planCompactChunks(request.messages, { inputBudgetTokens: budget });
    const baseSession = String(request.extra?.session_id ?? request.prompt_cache_key ?? "anon");
    const concurrency = Math.max(1, Math.min(COMPACT_CONCURRENCY, plan.chunks.length));

    const digests: string[] = new Array<string>(plan.chunks.length).fill("");
    let failed = 0;
    /** 每块一个唯一后缀:并发的两条请求不能共用同一条亲和键。 */
    let slotSeq = 0;

    /** 一块(或切小后的半块)出一次 digest。 */
    const runChunk = async (lines: string[], capTokens: number, depth: number): Promise<string> => {
      const slot = slotSeq;
      slotSeq += 1;
      const body: UpstreamRequest = {
        ...request,
        stream: false,
        messages: [{ role: "user", content: COMPACT_CHUNK_PROMPT + lines.join("\n") }],
        max_tokens: Math.max(48, Math.floor(capTokens / (depth + 1))),
        tools: undefined,
        // 每块一条独立的亲和键:同一条键会把并发请求排到同一个凭据上,
        // 那个凭据 `concurrency=1` 时后续请求直接 `all_busy`。
        prompt_cache_key: `${baseSession}#${slot}`,
        extra: { ...(request.extra ?? {}), session_id: `${baseSession}#${slot}` },
      };
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        if (abortedNow(request.clientSignal)) return "";
        try {
          const result = await upstream.complete(body);
          const text = result.choices?.[0]?.message?.content;
          return typeof text === "string" ? text : "";
        } catch (err) {
          if (abortedNow(request.clientSignal)) return "";
          if (attempt === 1) {
            // 限流要等一会儿(同一个配额窗口);其它错误也短暂让一下,再原样重试一次。
            await sleepMs(err instanceof UpstreamError && err.kind === "rate_limit" ? 2_000 : 300);
            continue;
          }
          // 还是失败 → 按错误性质分流,别一律重试:
          // · 限流(429):切小不会减少总 token,只是多几条请求 —— 直接放弃这一块;
          // · 报文被拒(400/422):多半就是「这一块太长」,减半再试,内容一点不丢;
          // · 其它(5xx/连接/鉴权):再切也只是把同一个错误复制一份,放弃。
          const kind = err instanceof UpstreamError ? err.kind : "server";
          const worthSplitting = kind === "bad_request";
          if (!worthSplitting || depth >= 2) {
            failed += 1;
            console.warn(
              `[as-one] compact 分块失败(已减半两次仍失败,跳过):${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            return "";
          }
          const halves = splitLinesInHalf(lines);
          if (halves === null) {
            failed += 1;
            console.warn(
              `[as-one] compact 分块失败(单行且无法再切,跳过):${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            return "";
          }
          const halfCap = Math.max(48, Math.floor(capTokens / 2));
          const [a, b] = await Promise.all([
            runChunk(halves[0], halfCap, depth + 1),
            runChunk(halves[1], halfCap, depth + 1),
          ]);
          return [a, b].filter((part) => part.trim() !== "").join("\n\n");
        }
      }
      return "";
    };

    await eachLimit(plan.chunks, concurrency, async (chunk, index) => {
      digests[index] = await runChunk(chunk.lines, chunk.capTokens, 0);
    });

    const kept = digests.filter((d) => d.trim() !== "");
    let summary = joinDigests(kept);
    let merged = false;
    if (needsMerge(kept.length) && !abortedNow(request.clientSignal)) {
      try {
        const result = await upstream.complete({
          ...request,
          stream: false,
          messages: [{ role: "user", content: buildMergePrompt(kept) }],
          max_tokens: COMPACT_MERGE_TOKENS,
          tools: undefined,
          prompt_cache_key: `${baseSession}#merge`,
          extra: { ...(request.extra ?? {}), session_id: `${baseSession}#merge` },
        });
        const text = result.choices?.[0]?.message?.content;
        if (typeof text === "string" && text.trim()) {
          summary = text;
          merged = true;
        }
      } catch (err) {
        // 归并失败不算失败:手里已经有一份按块组织、可直接用的摘要。
        console.warn(
          `[as-one] compact 归并失败,改用分块拼接:${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    if (!summary.trim()) throw new AsOneLlmError("compact 摘要为空", "SERVER");

    console.info(
      `[as-one] compact model=${model} budget=${budget} 块=${plan.chunks.length}` +
        `(并发 ${concurrency},失败 ${failed}) 区域≈${plan.regionTokens}tok` +
        ` 截断=${plan.trimmedChars}字符 归并=${merged ? "是" : "否"}` +
        ` 耗时=${Date.now() - started}ms`,
    );

    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: summary };
    yield { type: "block-end", index: 0, block: { type: "text", text: summary } as DshContentBlock };
    yield { type: "finish", reason: { kind: "stop" } };
  }

  /** 目标模型的窗口(拿不到 → undefined,预算走保守兜底)。 */
  private async contextWindowOf(model: string): Promise<number | undefined> {
    try {
      const info = await this.resolveModel(this.provider, model);
      return positiveInt(info.context?.contextWindow);
    } catch {
      return undefined;
    }
  }

  /** 唯一的抽象:产出**语法合法**的块流。 */
  async *stream(options: DshGenerateOptions): AsyncGenerator<DshStreamChunk> {
    // 辅助请求按设置项重路由;**没配就是没机制** —— 模型、会话号、图片都原样。
    const target = rerouteModel(this.reroutes(), options.purpose);
    let rerouted = target !== undefined;
    let model = target ?? options.model;
    let upstream: Upstream | undefined = this.rt.resolveUpstream(model);
    if (!upstream && rerouted) {
      // 配了但库里没有这条车道:如实回落并告警。半个重路由(换了会话号/图片
      // 占位,模型却没换)最难排查,所以宁可整体当没配。
      console.warn(`[as-one] 重路由目标不可用(${options.purpose}: ${model}),回落 ${options.model}`);
      rerouted = false;
      model = options.model;
      upstream = this.rt.resolveUpstream(model);
    }
    if (!upstream) {
      throw new AsOneLlmError(`As One 未知模型:${model}`, "INVALID_REQUEST", { status: 404 });
    }
    // 重路由的辅助请求不读附件像素、不带工具、不占用户会话的亲和 pin。
    const resolvedMessages = rerouted
      ? this.placeholderImages(options.messages ?? [])
      : await resolveImagesInMessages(
          options.messages ?? [],
          this.resolveAttachments?.(),
          (ref) => this.imageRequestTarget(this.provider, model, ref),
          options.signal,
        );
    const sessionId = rerouted
      ? `${options.sessionId ?? "anon"}:${String(options.purpose)}`
      : options.sessionId;
    const request = toUpstreamRequestFromOptions({
      ...options,
      model,
      messages: resolvedMessages,
      provider: this.provider,
      sessionId,
      tools: rerouted ? undefined : options.tools,
    });
    // ⚠️ 不要把 purpose 写进 `extra`:`extra` 除 session_id 外会整体透传进上游
    // 报文体,多一个未知字段就可能被上游 400(见 types.ts 的 extra 说明)。
    if (options.purpose === "compaction") {
      if (rerouted) {
        yield* this.compactStream(upstream, request, model);
        return;
      }
      // 🧯 安全网:没配 `route.compact` 时,宿主的原生摘要请求是**整段历史一条
      //    报文**;装得下就原样放行(它的 prompt 比我们的分块更强),装不下才接管。
      //    实测失败长这样:7,390 条消息 / 12.0M 字符 → 3,429,735 token → 400
      //    `context_length_exceeded`,用户看到「Compaction could not produce a
      //    useful summary」。窗口未知时不接管(判不了就别动)。
      const window = await this.contextWindowOf(model);
      if (window !== undefined && estimateMessagesTokens(request.messages) > window - 1024) {
        console.warn(
          `[as-one] compact 请求装不下目标窗口(窗口 ${window}),改走分块摘要`,
        );
        yield* this.compactStream(upstream, request, model);
        return;
      }
    }
    const t0 = Date.now();
    let firstChunkMs: number | undefined;
    let seen: DshUsage | undefined;
    let ok = false;
    let failure: AsOneLlmError | undefined;
    try {
      for await (const chunk of translateStream(upstream.stream(request), model, options.signal)) {
        if (firstChunkMs === undefined && chunk.type !== "usage" && chunk.type !== "finish") {
          firstChunkMs = Date.now() - t0;
        }
        if (chunk.type === "usage") seen = chunk.usage;
        yield chunk;
      }
      ok = true;
    } catch (err) {
      failure = err instanceof AsOneLlmError ? err : toLlmError(err, `As One 调用失败(${model})`);
      throw failure;
    } finally {
      // 与 /v1 路由同一口径记一条明细:面板「实时日志」要能看到 DSH 的调用。
      const aborted = options.signal?.aborted === true;
      this.record(model, ok, failure, aborted, t0, firstChunkMs, seen, request);
    }
  }

  /** 统计挂钩失败绝不能影响已经发出的响应。 */
  private record(
    model: string,
    ok: boolean,
    failure: AsOneLlmError | undefined,
    aborted: boolean,
    t0: number,
    firstChunkMs: number | undefined,
    usage: DshUsage | undefined,
    request: UpstreamRequest,
  ): void {
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
              // ⚠️ 面板/日志的 `prompt_tokens` 是 OpenAI 口径(**含**缓存),
              // 而宿主 usage 的 `inputTokens` 是未缓存量 —— 这里必须加回来,
              // 否则网关自己的统计会把 cached 记成「大于 prompt」。
              prompt_tokens: usage.inputTokens + (usage.cacheReadTokens ?? 0),
              cached_tokens: usage.cacheReadTokens ?? 0,
              completion_tokens: usage.outputTokens,
            }
          : null,
        session_id: typeof request.extra?.session_id === "string" ? request.extra.session_id : null,
        prompt_cache_key: request.prompt_cache_key ?? null,
        discarded_fields: null,
        request: { model: request.model, messages: request.messages, stream: true },
      });
    } catch {
      /* 统计失败不影响调用 */
    }
  }
}

/** 宿主码 → RequestDoneInfo.error_kind(面板按 kind 分类显示)。 */
function kindOfFailure(failure: AsOneLlmError | undefined): string | null {
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

function abortError(): AsOneLlmError {
  return new AsOneLlmError("调用已取消", "ABORTED");
}
