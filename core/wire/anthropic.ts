/**
 * Anthropic Messages 编解码器（通用层）—— `chat ⇄ messages` 的**统一转换器**。
 *
 * ## 为什么单独一层
 *
 * 网关内部统一是 OpenAI chat 形状（见 `gateway/types.ts`），而多家的上游说的是
 * Anthropic Messages。以前这套转换只写在 `connectors/minimax-llm.ts` 里，接第二个
 * Messages 提供商就得复制一遍。现在抽到这里：
 *
 * - `toAnthropicRequest`：chat 请求 → messages 请求（请求方向）
 * - `createAnthropicChunkTranslator`：messages SSE → OpenAI chunk（响应方向）
 * - `anthropicUsageOf` / `anthropicErrorOf`：usage 与流内错误
 *
 * 连接器只负责「端点 + 认证 + 错误归类」，方言差异走 {@link AnthropicQuirks}。
 *
 * ## 方言开关（实测依据见 `docs/probe-anthropic-thinking.md`）
 *
 * - MiniMax：`effortField: "output_config"`、不校验签名（`requiresSignature: false`）。
 * - 真 Anthropic：`effortField` 用 `"budget_tokens"` 或 `"none"`，且**校验思考签名**
 *   （`requiresSignature: true`）—— 那种情况下**不回放**历史思考（本层没有签名可带）。
 *
 * ⚠️ **恒流式**：`streamOnly`（默认 true）会把 `stream` 恒写成 true。网关的非流式
 * 请求也走 SSE 聚合，否则得再维护一条 JSON 解析分支，两条路径的 usage 口径迟早分叉。
 */

// ---------------------------------------------------------------------------
// 方言参数
// ---------------------------------------------------------------------------

/** Messages 省道的方言开关。未写的字段取 {@link DEFAULT_ANTHROPIC_QUIRKS}。 */
export interface AnthropicQuirks {
  /**
   * 思考强度落在哪个字段：
   * - `output_config`（MiniMax 实测有效）
   * - `budget_tokens`（经典 Anthropic：`thinking:{type:"enabled",budget_tokens}`）
   * - `none`（不发，交给端点默认）
   */
  effortField?: "output_config" | "budget_tokens" | "none";
  /**
   * 上游是否**校验思考签名**。
   *
   * true 时本层**不回放**历史思考：Chat IR 里没有签名可带，硬发 unsigned thinking
   * 会被真 Anthropic 拒（400）。MiniMax 实测不校验（E3/E4/E5），所以是 false。
   */
  requiresSignature?: boolean;
  /** `system` 的形状：串（MiniMax）或文本块数组（真 Anthropic，支持 cache_control）。 */
  systemShape?: "string" | "blocks";
  /** 恒流式（网关的非流式请求也走 SSE 聚合）。 */
  streamOnly?: boolean;
  /** 请求没给 max_tokens 时的兜底（Anthropic 必填）。 */
  maxTokensDefault?: number;
}

/** 方言默认值（= MiniMax 的实测形态）。 */
export const DEFAULT_ANTHROPIC_QUIRKS: Required<AnthropicQuirks> = {
  effortField: "output_config",
  requiresSignature: false,
  systemShape: "string",
  streamOnly: true,
  maxTokensDefault: 4096,
};

// ---------------------------------------------------------------------------
// OpenAI chat 请求 → Anthropic Messages 请求
// ---------------------------------------------------------------------------

/** 消息内容里的文本片段（OpenAI `content` 既可能是串，也可能是分片数组）。 */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (part === null || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;
    if (p["type"] === "text" && typeof p["text"] === "string") parts.push(p["text"]);
  }
  return parts.join("\n");
}

function toolChoiceOf(choice: unknown): Record<string, unknown> | null {
  if (choice === null || choice === undefined || choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  // OpenAI 的 "none" = 不许调工具;Anthropic 没有对应值,只能不传(保留工具定义)。
  if (choice === "none") return null;
  if (typeof choice === "object") {
    const fn = (choice as Record<string, unknown>)["function"];
    const name = fn !== null && typeof fn === "object" ? (fn as Record<string, unknown>)["name"] : undefined;
    if (typeof name === "string" && name !== "") return { type: "tool", name };
  }
  return { type: "auto" };
}

function toolsOf(tools: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (!Array.isArray(tools)) return out;
  for (const tool of tools) {
    if (tool === null || typeof tool !== "object") continue;
    const t = tool as Record<string, unknown>;
    const fn = t["type"] === "function" && t["function"] !== null && typeof t["function"] === "object"
      ? (t["function"] as Record<string, unknown>)
      : t;
    const name = fn["name"];
    if (typeof name !== "string" || name === "") continue;
    const schema = fn["parameters"];
    out.push({
      name,
      description: typeof fn["description"] === "string" ? fn["description"] : "",
      input_schema:
        schema !== null && typeof schema === "object" && !Array.isArray(schema)
          ? schema
          : { type: "object", properties: {} },
    });
  }
  return out;
}

/** 单条 OpenAI 消息 → Anthropic 消息（`null` = 这条不该出现在 messages 里）。 */
function messageOf(
  item: Record<string, unknown>,
  quirks: Required<AnthropicQuirks>,
): Record<string, unknown> | null {
  const role = item["role"];
  if (role === "assistant") {
    const blocks: Array<Record<string, unknown>> = [];
    /**
     * 历史里的思考内容 → `thinking` 块（D1）。
     *
     * 以前这里只发 text + tool_use，`reasoning_content` 被整段丢掉 —— DSH 侧看得见
     * 思考、上游却收不到，多轮之间没有思考连续性。
     *
     * 实测（`docs/probe-anthropic-thinking.md`，2026-11-20）：
     * - 不带签名回放 200（E3）、乱造签名也 200（E4）、换前缀也 200（E5）
     * → MiniMax 不校验，所以默认回放；`requiresSignature` 的端点（真 Anthropic）
     *   则**跳过**，因为我们手里没有可验证的签名。
     */
    const reasoning = typeof item["reasoning_content"] === "string" ? item["reasoning_content"] : "";
    if (reasoning.trim() !== "" && !quirks.requiresSignature) {
      blocks.push({ type: "thinking", thinking: reasoning });
    }
    const text = textOf(item["content"]);
    if (text !== "") blocks.push({ type: "text", text });
    const calls = item["tool_calls"];
    if (Array.isArray(calls)) {
      for (const call of calls) {
        if (call === null || typeof call !== "object") continue;
        const c = call as Record<string, unknown>;
        const fn = c["function"] !== null && typeof c["function"] === "object"
          ? (c["function"] as Record<string, unknown>)
          : {};
        const args = fn["arguments"];
        let input: Record<string, unknown> = {};
        if (typeof args === "string") {
          try {
            const parsed: unknown = JSON.parse(args);
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
              input = parsed as Record<string, unknown>;
            }
          } catch {
            input = {};
          }
        } else if (args !== null && typeof args === "object" && !Array.isArray(args)) {
          input = args as Record<string, unknown>;
        }
        blocks.push({
          type: "tool_use",
          id: typeof c["id"] === "string" ? c["id"] : "",
          name: typeof fn["name"] === "string" ? fn["name"] : "",
          input,
        });
      }
    }
    // Anthropic 不接受空 content 数组。
    return { role: "assistant", content: blocks.length > 0 ? blocks : [{ type: "text", text: "" }] };
  }

  // user 的 content 可能是串或分片数组(text / image_url)。
  const content = item["content"];
  if (typeof content === "string") {
    return { role: "user", content: [{ type: "text", text: content }] };
  }
  if (Array.isArray(content)) {
    const blocks: Array<Record<string, unknown>> = [];
    for (const part of content) {
      if (part === null || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (p["type"] === "text") {
        blocks.push({ type: "text", text: typeof p["text"] === "string" ? p["text"] : "" });
      } else if (p["type"] === "image_url") {
        const image = p["image_url"];
        const url = image !== null && typeof image === "object"
          ? (image as Record<string, unknown>)["url"]
          : image;
        if (typeof url === "string" && url !== "") {
          blocks.push(anthropicImageBlock(url));
        }
      }
    }
    return { role: "user", content: blocks.length > 0 ? blocks : [{ type: "text", text: "" }] };
  }
  return null;
}

/**
 * OpenAI `image_url` 的 URL → **Anthropic Messages 的 image block**。
 *
 * ## ⚠️ 2026-11-12 修的真 bug
 *
 * 旧实现**一律**发 `{type:"image", source:{type:"url", url}}`。但 Anthropic
 * 的 `source.type:"url"` 只接受**公网 http(s) 地址**；网关这边绝大多数图是
 * `data:image/png;base64,…` 的 data URL —— 塞进 `url` 字段是**无效形状**，
 * 上游要么直接 400、要么静默忽略，看起来就像「这个渠道没有原生图片支持」。
 *
 * 正确映射：
 * - `data:<mime>;base64,<payload>` → `{type:"base64", media_type:<mime>, data:<payload>}`
 * - `http(s)://…`                → `{type:"url", url}`
 * - 其它形状                      → 退化成一条文本占位（宁可明说，不要让上游静默丢图）
 */
function anthropicImageBlock(url: string): Record<string, unknown> {
  if (/^https?:\/\//i.test(url)) {
    return { type: "image", source: { type: "url", url } };
  }
  const mime = /^data:([^;,]+);base64,/i.exec(url);
  if (mime !== null) {
    const payload = url.slice(mime[0].length);
    const mediaType = mime[1]!.toLowerCase();
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: payload },
    };
  }
  // 认不出的形状:留一条可读的占位,不让上游静默丢图。
  return {
    type: "text",
    text: "[图片: 该 image_url 既不是 data URL 也不是公网地址,未能传给上游。]",
  };
}

/**
 * OpenAI chat 请求体 → Anthropic Messages 请求体（通用转换器）。
 *
 * @param body   网关组好的 OpenAI 请求体（已剥掉内部键）
 * @param model  上游模型串（不是本地 id）
 * @param effort 已翻成上游取值的思考强度
 * @param quirks 方言开关
 *
 * ⚠️ 未知字段一律丢弃：上游对不认识的 body 键直接拒（400），透传只会把
 * OpenAI 专有字段（`tool_choice:"none"`、`response_format` 等）变成 400。
 */
export function toAnthropicRequest(
  body: Record<string, unknown>,
  model: string,
  effort?: string,
  quirks: AnthropicQuirks = DEFAULT_ANTHROPIC_QUIRKS,
): Record<string, unknown> {
  const q: Required<AnthropicQuirks> = { ...DEFAULT_ANTHROPIC_QUIRKS, ...quirks };
  const messages: Array<Record<string, unknown>> = [];
  const systemParts: string[] = [];

  const rawMessages = body["messages"];
  if (Array.isArray(rawMessages)) {
    for (const item of rawMessages) {
      if (item === null || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;
      const role = m["role"];
      if (role === "system" || role === "developer") {
        const text = textOf(m["content"]);
        if (text !== "") systemParts.push(text);
        continue;
      }
      if (role === "tool") {
        // OpenAI 的 tool 结果 → Anthropic 的 tool_result（user 角色）。
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: typeof m["tool_call_id"] === "string" ? m["tool_call_id"] : "",
              content: textOf(m["content"]),
            },
          ],
        });
        continue;
      }
      const converted = messageOf(m, q);
      if (converted !== null) messages.push(converted);
    }
  }

  // Anthropic 要求 messages 非空且首条是 user;真实请求里极少违反,但空 body
  // 打过去只会得到一句「messages must be non-empty」,不如本地给个空提问。
  if (messages.length === 0) messages.push({ role: "user", content: [{ type: "text", text: "" }] });

  const maxTokensRaw = body["max_tokens"] ?? body["max_completion_tokens"];
  const maxTokens =
    typeof maxTokensRaw === "number" && Number.isFinite(maxTokensRaw) && maxTokensRaw > 0
      ? Math.floor(maxTokensRaw)
      : q.maxTokensDefault;

  const out: Record<string, unknown> = {
    model,
    messages,
    // 恒流式:网关的非流式请求也走 SSE 聚合,见文件头。
    stream: q.streamOnly ? true : body["stream"] === true,
    max_tokens: maxTokens,
  };
  if (systemParts.length > 0) {
    const text = systemParts.join("\n\n");
    out["system"] = q.systemShape === "blocks" ? [{ type: "text", text }] : text;
  }

  if (typeof body["temperature"] === "number") out["temperature"] = body["temperature"];
  if (typeof body["top_p"] === "number") out["top_p"] = body["top_p"];

  const tools = toolsOf(body["tools"]);
  if (tools.length > 0) {
    out["tools"] = tools;
    const choice = toolChoiceOf(body["tool_choice"]);
    if (choice !== null) out["tool_choice"] = choice;
  }

  const stop = body["stop"];
  if (typeof stop === "string") out["stop_sequences"] = [stop];
  else if (Array.isArray(stop) && stop.every((s) => typeof s === "string")) {
    out["stop_sequences"] = stop as string[];
  }

  /**
   * 思考强度:三种方言落点。
   *
   * ⚠️ MiniMax **不要**发 `thinking:{type:"enabled", budget_tokens}`（实测某些
   * 组合 400）也**不要**发 `thinking:{type:"disabled"}`（必 400 requires adaptive），
   * 只有 `output_config.effort` 是稳的 —— 见 `docs/probe-anthropic-thinking.md`。
   */
  if (effort !== undefined && effort !== "") {
    if (q.effortField === "output_config") {
      out["output_config"] = { effort };
    } else if (q.effortField === "budget_tokens") {
      // 经典 Anthropic:budget 必须小于 max_tokens,且至少 1024。
      const budget = Math.max(1024, Math.min(2048, maxTokens - 1024));
      out["thinking"] = { type: "enabled", budget_tokens: budget };
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// DSH 块 → Anthropic Messages（DSH 路径专用；不经过 chat 中间形状）
// ---------------------------------------------------------------------------

/** 一个内容块（只要求 `type`，其余按类型读）。 */
export interface WireBlock {
  type: string;
  [key: string]: unknown;
}

/** 一条块消息（DSH 的 role + 块数组的最小投影）。 */
export interface BlockMessage {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content: WireBlock[];
  /** role=tool 时指向对应的 tool-call id。 */
  toolCallId?: string;
}

/** 一次块请求（system 独立字段，与 DSH 的 `GenerateOptions` 同构）。 */
export interface BlockRequest {
  system?: string;
  messages: BlockMessage[];
  tools?: Array<{ name: string; description?: string; parameters?: unknown }>;
}

/** 块里的图片：只认能落到 data URL / http(s) 的三种写法。 */
function imageUrlFromBlock(block: WireBlock): string | null {
  const direct = block["url"] ?? block["data_url"] ?? block["image_url"];
  if (typeof direct === "string" && direct !== "") return direct;
  const nested = block["image_url"] ?? block["source"] ?? block["image"];
  if (nested !== null && typeof nested === "object") {
    const url = (nested as Record<string, unknown>)["url"];
    if (typeof url === "string" && url !== "") return url;
  }
  return null;
}

function textFromBlocks(blocks: readonly WireBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text" && typeof b["text"] === "string") parts.push(b["text"]);
  }
  return parts.join("\n");
}

/**
 * 块请求 → Anthropic Messages 请求体。
 *
 * 这是 **DSH 路径**的写法：源头就是块（text / reasoning / tool-call / image /
 * tool 结果），直接落成 Messages，不先退化成 chat 消息再转回来 ——
 * 于是 FAQ 里「chat → messages → 私有」的中间那次转换被彻底省掉。
 *
 * 与 {@link toAnthropicRequest} 的差别只在**输入形状**；方言、usage、流解析完全共用。
 */
export function toAnthropicRequestFromBlocks(
  req: BlockRequest,
  model: string,
  effort?: string,
  quirks: AnthropicQuirks = DEFAULT_ANTHROPIC_QUIRKS,
  maxTokens?: number,
): Record<string, unknown> {
  const q: Required<AnthropicQuirks> = { ...DEFAULT_ANTHROPIC_QUIRKS, ...quirks };
  const messages: Array<Record<string, unknown>> = [];
  const systemParts: string[] = [];
  if (typeof req.system === "string" && req.system.trim() !== "") systemParts.push(req.system);

  for (const m of req.messages ?? []) {
    if (m.role === "system" || m.role === "developer") {
      const text = textFromBlocks(m.content);
      if (text !== "") systemParts.push(text);
      continue;
    }
    if (m.role === "tool") {
      const blocks: Array<Record<string, unknown>> = [];
      const images = m.content.filter((b) => b.type === "image");
      if (images.length > 0) {
        const content = images
          .map((b) => imageUrlFromBlock(b))
          .filter((u): u is string => u !== null)
          .map((url) => anthropicImageBlock(url));
        const text = textFromBlocks(m.content);
        if (text !== "") content.push({ type: "text", text });
        blocks.push({ type: "tool_result", tool_use_id: m.toolCallId ?? "", content });
      } else {
        blocks.push({ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: textFromBlocks(m.content) });
      }
      messages.push({ role: "user", content: blocks });
      continue;
    }
    if (m.role === "assistant") {
      const blocks: Array<Record<string, unknown>> = [];
      for (const b of m.content) {
        if (b.type === "reasoning") {
          const thinking = typeof b["text"] === "string" ? b["text"] : "";
          if (thinking.trim() !== "" && !q.requiresSignature) blocks.push({ type: "thinking", thinking });
        } else if (b.type === "text") {
          const text = typeof b["text"] === "string" ? b["text"] : "";
          if (text !== "") blocks.push({ type: "text", text });
        } else if (b.type === "tool-call") {
          let input: Record<string, unknown> = {};
          const args = b["arguments"];
          if (typeof args === "string") {
            try {
              const parsed: unknown = JSON.parse(args);
              if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                input = parsed as Record<string, unknown>;
              }
            } catch {
              input = {};
            }
          }
          blocks.push({
            type: "tool_use",
            id: typeof b["id"] === "string" ? b["id"] : "",
            name: typeof b["name"] === "string" ? b["name"] : "",
            input,
          });
        }
      }
      messages.push({ role: "assistant", content: blocks.length > 0 ? blocks : [{ type: "text", text: "" }] });
      continue;
    }
    // user
    const blocks: Array<Record<string, unknown>> = [];
    for (const b of m.content) {
      if (b.type === "text") {
        const text = typeof b["text"] === "string" ? b["text"] : "";
        if (text !== "") blocks.push({ type: "text", text });
      } else if (b.type === "image") {
        const url = imageUrlFromBlock(b);
        if (url !== null) blocks.push(anthropicImageBlock(url));
      }
    }
    messages.push({ role: "user", content: blocks.length > 0 ? blocks : [{ type: "text", text: "" }] });
  }

  if (messages.length === 0) messages.push({ role: "user", content: [{ type: "text", text: "" }] });

  const out: Record<string, unknown> = {
    model,
    messages,
    // DSH 路径恒流式:网关的非流式请求也走 SSE 聚合。
    stream: true,
    max_tokens:
      typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens > 0
        ? Math.floor(maxTokens)
        : q.maxTokensDefault,
  };
  if (systemParts.length > 0) {
    const text = systemParts.join("\n\n");
    out["system"] = q.systemShape === "blocks" ? [{ type: "text", text }] : text;
  }
  if (req.tools !== undefined && req.tools.length > 0) {
    out["tools"] = req.tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema:
        t.parameters !== null && typeof t.parameters === "object" && !Array.isArray(t.parameters)
          ? t.parameters
          : { type: "object", properties: {} },
    }));
  }
  if (effort !== undefined && effort !== "") {
    if (q.effortField === "output_config") {
      out["output_config"] = { effort };
    } else if (q.effortField === "budget_tokens") {
      const maxTokens = out["max_tokens"] as number;
      out["thinking"] = { type: "enabled", budget_tokens: Math.max(1024, Math.min(2048, maxTokens - 1024)) };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Anthropic usage → OpenAI usage
// ---------------------------------------------------------------------------

/**
 * Anthropic 的 usage → OpenAI 三段计数。
 *
 * ⚠️ `input_tokens` **只是没命中缓存的那部分**;开了缓存时大部分上下文在
 * `cache_read_input_tokens` 里。只报 `input_tokens` 会让长上下文看起来只有几十
 * token(实测:真实 92 + 缓存 128)。所以:
 *
 *     prompt = input + cache_read + cache_creation
 *
 * 缓存部分另拆到 `prompt_tokens_details.cached_tokens`,按 OpenAI 口径暴露。
 */
export function anthropicUsageOf(usage: unknown): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details: { cached_tokens: number };
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
} {
  const u = usage !== null && typeof usage === "object" ? (usage as Record<string, unknown>) : {};
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
  const fresh = num(u["input_tokens"]);
  const cacheRead = num(u["cache_read_input_tokens"]);
  const cacheWrite = num(u["cache_creation_input_tokens"]);
  const completion = num(u["output_tokens"]);
  const prompt = fresh + cacheRead + cacheWrite;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: { cached_tokens: cacheRead + cacheWrite },
    // D1:`DshUsage` 要区分 cacheRead / cacheWrite,所以原始两格单列带走。
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheWrite,
  };
}

// ---------------------------------------------------------------------------
// Anthropic SSE 帧 → OpenAI chunk
// ---------------------------------------------------------------------------

/** 网关交给流解析的元信息。 */
export interface AnthropicChunkMeta {
  completionId: string;
  created: number;
  /** 对外暴露的模型名(客户端请求的那个,不是上游串)。 */
  model: string;
}

type Chunk = Record<string, unknown>;

/** 退化过的 stop_reason 计数(见 {@link finishOf})。 */
const unmappedStopReasons = new Map<string, number>();

/**
 * 两帧 usage 取「更完整的那份」。
 *
 * `message_start` 与 `message_delta` 都会带 usage,字段不一定齐:缓存两格常只
 * 在尾帧出现,而 input/output 常只在首帧。所以逐字段取 max,并把 Anthropic 的
 * 缓存两格原样带下去(D1 需要 cacheRead / cacheWrite 分开)。
 */
function mergeUsage(
  prev: ReturnType<typeof anthropicUsageOf>,
  next: ReturnType<typeof anthropicUsageOf>,
): ReturnType<typeof anthropicUsageOf> {
  const prompt = Math.max(next.prompt_tokens, prev.prompt_tokens);
  const completion = Math.max(next.completion_tokens, prev.completion_tokens);
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: {
      cached_tokens: Math.max(
        next.prompt_tokens_details.cached_tokens,
        prev.prompt_tokens_details.cached_tokens,
      ),
    },
    cache_read_input_tokens: Math.max(next.cache_read_input_tokens, prev.cache_read_input_tokens),
    cache_creation_input_tokens: Math.max(
      next.cache_creation_input_tokens,
      prev.cache_creation_input_tokens,
    ),
  };
}

/** OpenAI 的 finish_reason 映射:Anthropic 的 stop_reason 语义不同。 */
function finishOf(stopReason: unknown): string {
  if (stopReason === "tool_use") return "tool_calls";
  if (stopReason === "max_tokens") return "length";
  if (typeof stopReason === "string" && stopReason !== "" && stopReason !== "end_turn" && stopReason !== "stop_sequence") {
    // Q4:`refusal` / `pause_turn` 等没有 DSH 对应值,退化 stop,但**计数**留证据。
    unmappedStopReasons.set(stopReason, (unmappedStopReasons.get(stopReason) ?? 0) + 1);
  }
  return "stop";
}

/** 退化过的 stop_reason 计数快照(面板/日志用;进程内累计)。 */
export function anthropicUnmappedStopReasons(): Record<string, number> {
  return Object.fromEntries([...unmappedStopReasons.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * 逐帧翻译器 —— 一个请求一个实例(内部累积工具调用分片与 usage)。
 *
 * 用法(网关 `iterUpstreamChunks`):
 * ```ts
 * const tr = createAnthropicChunkTranslator(meta);
 * for await (const line of rawLines(body)) {
 *   const ev = sseDataPayload(line);
 *   if (ev === null) continue;
 *   for (const chunk of tr.handle(ev)) yield chunk;
 *   if (tr.finished) return;
 * }
 * ```
 */
export function createAnthropicChunkTranslator(meta: AnthropicChunkMeta): {
  handle(event: unknown): Chunk[];
  readonly finished: boolean;
  /** 已见到的 usage(流结束后回读;没有 usage 帧时是 0)。 */
  usage(): ReturnType<typeof anthropicUsageOf>;
} {
  let finished = false;
  let roleSent = false;
  let usage = anthropicUsageOf(null);
  /** index → [tool_use_id, name] */
  const toolNames = new Map<number, [string, string]>();
  const toolArgs = new Map<number, string>();
  const toolOrder: number[] = [];

  function chunk(delta: Chunk, finish: string | null = null, withUsage = false): Chunk {
    const payload: Chunk = {
      id: meta.completionId,
      object: "chat.completion.chunk",
      created: meta.created,
      model: meta.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    };
    if (withUsage) payload["usage"] = usage;
    return payload;
  }

  return {
    get finished(): boolean {
      return finished;
    },
    usage(): ReturnType<typeof anthropicUsageOf> {
      return usage;
    },
    handle(event: unknown): Chunk[] {
      if (event === null || typeof event !== "object") return [];
      const e = event as Record<string, unknown>;
      const type = e["type"];
      const out: Chunk[] = [];

      if (type === "message_start") {
        const message = e["message"];
        const rawUsage = message !== null && typeof message === "object"
          ? (message as Record<string, unknown>)["usage"]
          : null;
        if (rawUsage !== null && rawUsage !== undefined) usage = anthropicUsageOf(rawUsage);
        if (!roleSent) {
          roleSent = true;
          out.push(chunk({ role: "assistant" }));
        }
        return out;
      }

      if (type === "content_block_start") {
        const block = e["content_block"];
        const index = typeof e["index"] === "number" ? e["index"] : 0;
        if (block !== null && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (b["type"] === "tool_use") {
            toolNames.set(index, [
              typeof b["id"] === "string" ? b["id"] : "",
              typeof b["name"] === "string" ? b["name"] : "",
            ]);
            toolArgs.set(index, "");
            toolOrder.push(index);
          }
        }
        return out;
      }

      if (type === "content_block_delta") {
        const delta = e["delta"];
        const index = typeof e["index"] === "number" ? e["index"] : 0;
        if (delta === null || typeof delta !== "object") return out;
        const d = delta as Record<string, unknown>;
        if (d["type"] === "text_delta") {
          out.push(chunk({ content: typeof d["text"] === "string" ? d["text"] : "" }));
        } else if (d["type"] === "thinking_delta") {
          // 思考内容按 OpenAI 生态的惯例走 reasoning_content。
          out.push(chunk({ reasoning_content: typeof d["thinking"] === "string" ? d["thinking"] : "" }));
        } else if (d["type"] === "input_json_delta") {
          toolArgs.set(index, (toolArgs.get(index) ?? "") + (typeof d["partial_json"] === "string" ? d["partial_json"] : ""));
        }
        return out;
      }

      if (type === "content_block_stop") {
        const index = typeof e["index"] === "number" ? e["index"] : 0;
        const named = toolNames.get(index);
        if (named !== undefined) {
          toolNames.delete(index);
          const [id, name] = named;
          const position = toolOrder.indexOf(index);
          out.push(
            chunk({
              tool_calls: [
                {
                  index: position >= 0 ? position : index,
                  id,
                  type: "function",
                  function: { name, arguments: toolArgs.get(index) || "{}" },
                },
              ],
            }),
          );
          toolArgs.delete(index);
        }
        return out;
      }

      if (type === "message_delta") {
        const rawUsage = e["usage"];
        if (rawUsage !== null && rawUsage !== undefined) {
          // 尾帧才是本轮总数;缓存字段也可能只在这里给。
          usage = mergeUsage(usage, anthropicUsageOf(rawUsage));
        }
        const d = e["delta"];
        const stop = d !== null && typeof d === "object" ? (d as Record<string, unknown>)["stop_reason"] : null;
        out.push(chunk({}, finishOf(stop), true));
        return out;
      }

      if (type === "message_stop") {
        finished = true;
        return out;
      }

      // ping / error / 其它:不产出 chunk。error 帧由调用方按上游错误处理。
      return out;
    },
  };
}

/** Anthropic 的 error 帧是否表示上游拒绝(调用方据此中断并分类)。 */
export function anthropicErrorOf(event: unknown): string | null {
  if (event === null || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  if (e["type"] !== "error") return null;
  const err = e["error"];
  if (err !== null && typeof err === "object") {
    const message = (err as Record<string, unknown>)["message"];
    if (typeof message === "string" && message !== "") return message;
  }
  return "上游在流中返回 error 帧";
}
