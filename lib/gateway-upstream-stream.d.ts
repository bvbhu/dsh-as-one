/**
 * 上游流式解析 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:把上游的 SSE 字节流拆成行、解析成 chunk,并处理 trae 事件协议与
 * workbuddy 的 XML 工具副本过滤。`data: [DONE]` 必须识别(否则上游 1.5s
 * 说完、socket 空等到超时,这是历史上有过的 TTFT 事故)。
 */
import type { ChatCompletionChunk } from "@as-one/core/src/gateway/types.js";
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
export declare const SSE_DONE = "[DONE]";
/** 这一行是不是结束标记(容忍 `data:[DONE]` / `data: [DONE]`)。 */
export declare function isSseDoneLine(line: string): boolean;
export declare function rawLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string>;
/** 通用 SSE data 行 → JSON 载荷(非 data 行/空/[DONE] → null)。 */
export declare function sseDataPayload(line: string): unknown | null;
/**
 * 按协议产 chunk 流:
 * - openai:sseDataPayload → 直接当 chunk(带 choices 校验);
 * - sensenova:sseDataPayload + 心跳丢块(choices 与 usage 都空);
 * - workbuddy:sseDataPayload + XML 工具副本过滤 + id/created/model 装饰;
 * - trae:SseParser → decodeTraeEvent → TraeChunkBuilder(错误事件在
 *   builder.feed 内抛 solo_error)。
 */
export declare function iterUpstreamChunks(body: ReadableStream<Uint8Array>, protocol: string, meta: ChunkMeta, providerId?: string): AsyncGenerator<ChatCompletionChunk>;
