/**
 * MiniMax 直连 LLM 端点的**方言转换** —— OpenAI chat ⇄ Anthropic Messages。
 *
 * ## 端点事实(2026-11-08 真机实测)
 *
 * 桌面端走的是 `{base}/mavis/api/v1/llm/v1/messages`:
 * - 认证只要 `Authorization: Bearer <access_token>` + `anthropic-version`;
 * - **不需要签名**(x-signature / yy 只用于签到与 agent 会话接口);
 * - **不需要设备查询串**(那是 agent session 协议才有的);
 * - 请求体是 Anthropic Messages,响应是 Anthropic SSE 或 JSON。
 *
 * 实测两条都通:非流式回 `{"content":[{"type":"thinking",…},{"type":"text",…}]}`,
 * 流式回 `message_start → ping → content_block_start/delta/stop → message_delta`。
 *
 * ## 为什么在这里做转换而不是改造上游
 *
 * as-one 的网关内部统一是 OpenAI 形状(见 `stream-aggregate.ts` / `llm-adapter.ts`)。
 * 把转换压在一个纯函数文件里,网关只需在「组体」和「解析帧」两处各调一次,
 * 不必让 Anthropic 方言渗进路由/记账/日志 —— 那些层只认 OpenAI chunk。
 *
 * ⚠️ **恒流式**:`toAnthropicRequest` 一律写 `stream: true`。网关的非流式请求
 * 也走 SSE 聚合(与 sensenova/workbuddy 同口径),否则得再维护一条 JSON 解析
 * 分支,两条路径的 usage/工具调用口径迟早分叉。
 */

// ---------------------------------------------------------------------------
// OpenAI chat 请求 → Anthropic Messages 请求
// ---------------------------------------------------------------------------

/** 消息内容里的文本片段(OpenAI `content` 既可能是串,也可能是分片数组)。 */
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

/** 单条 OpenAI 消息 → Anthropic 消息(`null` = 这条不该出现在 messages 里)。 */
function messageOf(item: Record<string, unknown>): Record<string, unknown> | null {
  const role = item["role"];
  if (role === "assistant") {
    const blocks: Array<Record<string, unknown>> = [];
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
 * OpenAI chat 请求体 → Anthropic Messages 请求体。
 *
 * @param body   网关组好的 OpenAI 请求体(已剥掉内部键)
 * @param model  上游模型串(`MiniMax-M3.1-Flash`,不是本地 id)
 *
 * ⚠️ 未知字段一律丢弃:上游对不认识的 body 键直接拒(400),透传只会把
 * OpenAI 专有字段(tool_choice 的 "none"、response_format 等)变成 400。
 */
export function toAnthropicRequest(
  body: Record<string, unknown>,
  model: string,
  /**
   * 思考强度 —— **已经翻成上游取值**的串(`low`/`medium`/`high`/`max`/`minimal`)。
   *
   * 规范档位 → 上游取值的翻译在 `gateway/reasoning-wire.ts`,这里只管落字段:
   * MiniMax 的直连 LLM 是 Anthropic Messages 方言,思考强度走
   * `output_config.effort`(2026-11-08 真机实测 200)。
   *
   * `undefined` = 本次不发(客户端没选 / 上游明说不支持)。
   */
  effort?: string,
): Record<string, unknown> {
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
        // OpenAI 的 tool 结果 → Anthropic 的 tool_result(user 角色)。
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
      const converted = messageOf(m);
      if (converted !== null) messages.push(converted);
    }
  }

  // Anthropic 要求 messages 非空且首条是 user;真实请求里极少违反,但空 body
  // 打过去只会得到一句「messages must be non-empty」,不如本地给个空提问。
  if (messages.length === 0) messages.push({ role: "user", content: [{ type: "text", text: "" }] });

  const out: Record<string, unknown> = {
    model,
    messages,
    // 恒流式:网关的非流式请求也走 SSE 聚合,见文件头。
    stream: true,
  };
  if (systemParts.length > 0) out["system"] = systemParts.join("\n\n");

  const maxTokens = body["max_tokens"] ?? body["max_completion_tokens"];
  out["max_tokens"] =
    typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens > 0
      ? Math.floor(maxTokens)
      : 4096;

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

  // 思考强度:Anthropic Messages 的 `output_config.effort`。
  // ⚠️ **不要**改写成 `thinking:{type:"enabled", budget_tokens:N}` —— 实测
  // `budget_tokens` 与 `max_tokens` 的约束会把短回答的请求打回 400,而
  // `output_config.effort` 在 low~max 上全部 200(high 起才真的产 thinking 块)。
  // ⚠️ 也**不要**发 `thinking:{type:"disabled"}` 表示关闭:该模型会回
  // 400 `requires adaptive`;「关」在 minimax 侧退到 `minimal`(不产 thinking)。
  if (effort !== undefined && effort !== "") {
    out["output_config"] = { effort };
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
  };
}

// ---------------------------------------------------------------------------
// Anthropic SSE 帧 → OpenAI chunk
// ---------------------------------------------------------------------------

/** 网关交给流解析的元信息。 */
export interface MinimaxChunkMeta {
  completionId: string;
  created: number;
  /** 对外暴露的模型名(客户端请求的那个,不是上游串)。 */
  model: string;
}

type Chunk = Record<string, unknown>;

/** OpenAI 的 finish_reason 映射:Anthropic 的 stop_reason 语义不同。 */
function finishOf(stopReason: unknown): string {
  if (stopReason === "tool_use") return "tool_calls";
  if (stopReason === "max_tokens") return "length";
  return "stop";
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
export function createAnthropicChunkTranslator(meta: MinimaxChunkMeta): {
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
          const seen = anthropicUsageOf(rawUsage);
          usage = {
            prompt_tokens: seen.prompt_tokens > 0 ? seen.prompt_tokens : usage.prompt_tokens,
            completion_tokens: Math.max(seen.completion_tokens, usage.completion_tokens),
            total_tokens: 0,
            prompt_tokens_details: {
              cached_tokens: Math.max(seen.prompt_tokens_details.cached_tokens, usage.prompt_tokens_details.cached_tokens),
            },
          };
          usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
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
  return "minimax 上游在流中返回 error 帧";
}
