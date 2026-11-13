/**
 * SSE 帧编码与解析 —— OpenAI 兼容流(`text/event-stream`)。
 *
 * 对齐 Nexus:
 * - `nexus/connectors/base.py:sse_pack` —— `b"data: " + json.dumps(chunk,
 *   ensure_ascii=False).encode("utf-8") + b"\n\n"`;
 * - `nexus/connectors/base.py:SSE_DONE` —— `b"data: [DONE]\n\n"`;
 * - `nexus/gateway/app.py:_pack`(app.py:2323)—— 同 sse_pack;
 * - `nexus/gateway/app.py:_stream_with_retry`(app.py:2031)—— 流正常收尾时
 *   追加 `[DONE]` 帧;`StreamingResponse` 响应头
 *   `Content-Type: text/event-stream` / `Cache-Control: no-cache` /
 *   `X-Accel-Buffering: no`(app.py:856-857)。
 *
 * 心跳注释行(`: ...\n\n`,上游 FakeUpstream 里出现过 `data: : heartbeat`
 * 的变体)与空 `data:` 行在**入站解析**时被丢弃(对齐 e2e 断言「心跳行被丢弃,
 * 不产生空块」);出站只发合法 JSON 帧。
 *
 * ⚠️ 零第三方依赖;`node:` 内建 + 严格 TS。
 */

import type { ChatCompletionChunk } from "./types.js";

/** SSE 流结束标记(base.py:SSE_DONE 的字节形态)。 */
export const SSE_DONE = "data: [DONE]\n\n";

/** 流式响应头(Nexus `StreamingResponse` 的 media_type + headers)。 */
export const SSE_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
  // 流式响应没有已知长度;node:http 会自动走 chunked。禁 keep-alive 复用由 server 层决定。
  Connection: "keep-alive",
};

/**
 * chunk dict → SSE 帧字节(`data: {json}\n\n`,ensure_ascii=False 对应
 * UTF-8 原文直接编码 —— 中文不转义)。
 */
export function ssePackChunk(chunk: ChatCompletionChunk | Record<string, unknown>): Uint8Array {
  return sseFrame(`data: ${JSON.stringify(chunk)}`);
}

/** `[DONE]` 帧。 */
export function ssePackDone(): Uint8Array {
  return sseFrame("data: [DONE]");
}

/** 单帧文本 → UTF-8 字节。 */
export function sseFrame(payload: string): Uint8Array {
  return Buffer.from(`${payload}\n\n`, "utf-8");
}

/** 多帧一次写出(减少 chunked 小帧数量;帧边界仍由 `\n\n` 保证)。 */
export function ssePackAll(frames: readonly (Uint8Array | string)[]): Buffer {
  const parts = frames.map((f) => (typeof f === "string" ? sseFrame(f) : f));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// 入站解析(测试/上游响应共用;Nexus e2e 的 sse_parse 对应物)
// ---------------------------------------------------------------------------

export interface SseEvent {
  /** `event:` 字段(缺省 = "message",未显式声明时为 undefined)。 */
  event?: string;
  /** `data:` 载荷(多行 data 用 \n 拼接);本文件不做字段合并语义。 */
  data?: string;
}

/**
 * 把字节流切成 SSE 事件(按空行 `\n\n` 分帧,容忍 `\r\n`)。
 * 纯状态机:不缓存跨调用状态,调用方逐次喂入。
 */
export function parseSseEvents(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = text.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const ev: SseEvent = {};
    const dataLines: string[] = [];
    for (const rawLine of block.split(/\r?\n/)) {
      if (rawLine.startsWith(":")) continue; // 注释/心跳行:解析侧直接丢弃
      const colon = rawLine.indexOf(":");
      const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
      let value = colon === -1 ? "" : rawLine.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") ev.event = value;
      else if (field === "data") dataLines.push(value);
      // id:/retry: 等 OpenAI 流不使用,忽略
    }
    if (dataLines.length > 0 || ev.event !== undefined) {
      if (dataLines.length > 0) ev.data = dataLines.join("\n");
      events.push(ev);
    }
  }
  return events;
}

/**
 * 流文本 → JSON 对象序列。**按行解析,一行 data 即一个事件**(对齐 Nexus
 * test_gateway_e2e.py:sse_parse:215-223 的行式语义;OpenAI 上游也是一行一个
 * chunk):`[DONE]` → 哨兵 `{"__done__":true}`;心跳变体 `data: : heartbeat`
 * (FakeUpstream 会把心跳行塞进与 JSON 同一个块,e2e:72-81)与坏 JSON 丢弃不抛。
 */
export function parseSseData(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue; // 空行/注释行/event: 行跳过
    const payload = line.slice(5).trim();
    if (!payload || payload.startsWith(":")) continue; // 心跳:": heartbeat" 形态
    if (payload === "[DONE]") {
      out.push({ __done__: true });
      continue;
    }
    try {
      out.push(JSON.parse(payload) as Record<string, unknown>);
    } catch {
      // 上游心跳/坏帧:丢弃(对齐「心跳行被丢弃,不产生空块」)
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 客户端断开(AbortSignal / res close)
// ---------------------------------------------------------------------------

/**
 * 把「客户端断开」翻译成 AbortSignal:
 * - `req` 的 `aborted`(请求流被真正中途掐断时触发);
 * - `res` 的 `close` **且响应没写完**(`writableEnded === false`,写半途对端关了);
 * - 外部传入的 `signal` 手动 abort 也算。
 * 返回的 signal 在任一来源触发时 abort。调用方 `signal.aborted` 或监听 abort
 * 事件后应停止产出/关闭上游流。
 *
 * ⚠️ **绝不监听 `req` 的 `close`**(2026-10-24 修复):Node 16+ 的
 * `IncomingMessage` 在**请求体读完**时就发 `close`,语义是「请求已完成」,
 * 不是「连接断了」。把它当断开会造成:
 * - 每个正常请求在读完 body 后几十毫秒就被判定成「客户端断开」——
 *   实测探针(`.tmp-probe/close-signal-probe.mjs`)对**完全正常**的 POST:
 *   `t0.aborted=false` → `t30.aborted=true`;
 * - 非流式路径(`complete()`)因此直接抛 502「客户端断开」;
 * - 流式路径则白白 `abort()` 掉还在跑的上游 fetch。
 * 真正的断连只看 `req.aborted` 与「res 没写完就 close」。
 */
export function clientDisconnectSignal(
  req: import("node:http").IncomingMessage,
  res?: import("node:http").ServerResponse,
  external?: AbortSignal,
): AbortSignal {
  const controller = new AbortController();
  let settled = false;
  const fire = () => {
    if (settled) return;
    settled = true;
    // req/res 的监听器在 close 时各自自动解除;external 的 ours 要手动。
    controller.abort(new Error("client disconnected"));
  };
  if (req.aborted) {
    fire();
    return controller.signal;
  }
  req.once("aborted", fire);
  // ⚠️ 只在**没写完**时算断连;正常收尾(res.end() 之后)的 close 是完成信号。
  res?.once("close", () => {
    if (!res.writableEnded) fire();
  });
  if (external) {
    if (external.aborted) {
      fire();
    } else {
      const onAbort = () => fire();
      external.addEventListener("abort", onAbort, { once: true });
      controller.signal.addEventListener("abort", () => {
        external.removeEventListener("abort", onAbort);
      }, { once: true });
    }
  }
  return controller.signal;
}
