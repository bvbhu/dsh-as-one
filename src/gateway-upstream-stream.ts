/**
 * 上游流式解析 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:把上游的 SSE 字节流拆成行、解析成 chunk,并处理 trae 事件协议与
 * workbuddy 的 XML 工具副本过滤。`data: [DONE]` 必须识别(否则上游 1.5s
 * 说完、socket 空等到超时,这是历史上有过的 TTFT 事故)。
 */

import { UpstreamError, UpstreamErrorKind, type ChatCompletionChunk } from "@as-one/core/src/gateway/types.js";
import { anthropicErrorOf, createAnthropicChunkTranslator } from "@as-one/core/src/connectors/minimax-llm.js";
import { decodeTraeEvent, TraeChunkBuilder, TraeSseParser } from "@as-one/core/src/connectors/trae-wire.js";
import {
  decorateWorkbuddyChunk,
  filterWorkbuddyChunk,
  XmlToolCallCopyFilter,
} from "@as-one/core/src/connectors/workbuddy-wire.js";
import { isWorkbuddyWire } from "@as-one/core/src/connectors/workbuddy-gate.js";

export interface ChunkMeta {
  completionId: string;
  created: number;
  model: string;
}

/**
 * 逐行读上游响应体(已按 \n 切分,行尾 trim)。
 * 通用迭代器,协议差异在 parse 阶段处理。
 * 注意:空行必须保留 —— SSE 协议里空行是事件分隔符
 * (TraeSseParser.consumeLine("") 触发 dispatch),丢了会整条流合并成一个事件。
 */
/** SSE 结束标记(上游说完就发;之后 socket 可能还挂着 keep-alive)。 */
export const SSE_DONE = "[DONE]";

/** 这一行是不是结束标记(容忍 `data:[DONE]` / `data: [DONE]`)。 */
export function isSseDoneLine(line: string): boolean {
  return line.startsWith("data:") && line.slice("data:".length).trim() === SSE_DONE;
}

export async function* rawLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        yield line;
        // ⚠️ 见到 `data: [DONE]` **立刻收连接**:上游说完之后 socket 可能还
        // 挂着 keep-alive,继续 read() 会一直等到读超时才返回 —— 实测模型
        // 1s 就答完、整轮却记到 183s。Nexus `_attempt` 同款:
        // 「上游说完:立刻收连接,不空等到超时」。
        if (isSseDoneLine(line)) {
          await reader.cancel().catch(() => {});
          return;
        }
      }
    }
    const tail = buf.trim();
    if (tail) yield tail;
  } finally {
    // cancel() 之后 releaseLock 会抛(流已关闭),这里必须吞掉 ——
    // 否则异常会冒到 iterUpstreamChunks,把「正常收尾」变成 failed_after_start。
    try {
      reader.releaseLock();
    } catch {
      // 已 cancel / 已释放:无锁可还
    }
  }
}

/** 通用 SSE data 行 → JSON 载荷(非 data 行/空/[DONE] → null)。 */
export function sseDataPayload(line: string): unknown | null {
  if (!line.startsWith("data:")) return null;
  const data = line.slice("data:".length).trim();
  if (data === "" || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * 按协议产 chunk 流:
 * - openai:sseDataPayload → 直接当 chunk(带 choices 校验);
 * - sensenova:sseDataPayload + 心跳丢块(choices 与 usage 都空);
 * - workbuddy:sseDataPayload + XML 工具副本过滤 + id/created/model 装饰;
 * - trae:SseParser → decodeTraeEvent → TraeChunkBuilder(错误事件在
 *   builder.feed 内抛 solo_error)。
 */
export async function* iterUpstreamChunks(
  body: ReadableStream<Uint8Array>,
  protocol: string,
  meta: ChunkMeta,
  providerId = "",
): AsyncGenerator<ChatCompletionChunk> {
  if (protocol === "trae") {
    const parser = new TraeSseParser();
    const builder = new TraeChunkBuilder(meta.completionId, meta.created, meta.model);
    for await (const line of rawLines(body)) {
      for (const [event, data] of parser.push(`${line}\n`)) {
        const decoded = decodeTraeEvent(event, data);
        for (const chunk of builder.feed([decoded])) {
          yield chunk;
        }
      }
    }
    for (const chunk of parser.finish().flatMap(([event, data]) => {
      const decoded = decodeTraeEvent(event, data);
      return builder.feed([decoded]);
    })) {
      yield chunk;
    }
    for (const chunk of builder.finish()) {
      yield chunk;
    }
    return;
  }

  if (protocol === "minimax") {
    // Anthropic SSE → OpenAI chunk。帧仍是标准 `data: {json}`(只是事件语义是
    // Anthropic 那套:message_start / content_block_delta / message_delta …),
    // 所以逐行喂解析器即可,不需要缓冲整块。
    //
    // ⚠️ 上游会在流中回 `type:"error"` 帧(比如额度耗尽),它不是 HTTP 错误,
    // 只能在这里中断——否则客户端会收到半截回答且 HTTP 200。
    const tr = createAnthropicChunkTranslator(meta);
    for await (const line of rawLines(body)) {
      if (isSseDoneLine(line)) return;
      const obj = sseDataPayload(line);
      if (obj === null || typeof obj !== "object") continue;
      const upstreamError = anthropicErrorOf(obj);
      if (upstreamError !== null) {
        throw new UpstreamError(UpstreamErrorKind.Upstream, `[minimax] 流中错误:${upstreamError}`, {
          statusCode: 502,
        });
      }
      for (const chunk of tr.handle(obj)) {
        yield chunk as unknown as ChatCompletionChunk;
      }
      if (tr.finished) return;
    }
    return;
  }

  if (isWorkbuddyWire(protocol)) {
    const flt = new XmlToolCallCopyFilter();
    for await (const line of rawLines(body)) {
      const obj = sseDataPayload(line);
      if (obj === null || typeof obj !== "object") continue;
      const chunk = filterWorkbuddyChunk(obj as Record<string, unknown>, flt);
      yield decorateWorkbuddyChunk(chunk, meta.completionId, meta.created, meta.model);
    }
    flt.finish();
    return;
  }

  // openai / sensenova:通用 SSE data 行(openai 也常发 data: 帧)。
  for await (const line of rawLines(body)) {
    const obj = sseDataPayload(line);
    if (obj === null || typeof obj !== "object") continue;
    const raw = obj as Record<string, unknown>;
    if (protocol === "sensenova") {
      // 纯心跳块:choices 与 usage 都空 → 丢
      const choices = raw.choices;
      if ((!Array.isArray(choices) || choices.length === 0) && raw.usage == null) continue;
    }
    const choices = raw.choices;
    // ⚠️ **放行 usage-only 尾块**:choices 为空但 usage 有值的块是上游
    // 回报 token 统计的唯一载体(stream_options.include_usage 才发),
    // 以前被这里整块丢掉 → forwardStream 的 `usage = chunk.usage`
    // 永远收不到 → 日志/统计缺 token、tps 算不出来。
    // 与 sensenova 分支同口径(choices 与 usage 都空才丢)。
    if ((!Array.isArray(choices) || choices.length === 0) && raw.usage == null) continue;
    yield raw as unknown as ChatCompletionChunk;
  }
}
