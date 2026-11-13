/**
 * 基于 node:http 的 OpenAI 兼容网关服务面 —— 对齐 Nexus 实际暴露的对外端点。
 *
 * 端点集合(以 inventory §2 为准 —— **只有两个对外端点**,探针已删):
 * - `POST /v1/chat/completions`(nexus/gateway/app.py:720)—— 流式 → SSE 直出,
 *   非流式 → JSON;
 * - `GET  /v1/models`(app.py:667)—— 逻辑模型 + 真实模型并列。
 *
 * Nexus **没有**的端点不臆造(test_gateway_e2e §0 钉死 `/health` 与
 * `/api/scheduler` 均已移除,2026-10-12):
 * - ~~POST /v1/completions~~、~~POST /v1/embeddings~~、~~GET /health~~
 *   —— TODO(阶段二 DSH 形态若需要再议,需先在 Nexus 侧补语义)。
 *
 * 请求路径顺序(app.py 模块 docstring「请求路径(顺序是用户定案,不可调换)」):
 * 1. 鉴权(require_key —— 本文件 `requireKey`);
 * 2. 解析对外模型名(缺 model → 400「缺少 model」;未知模型 → 404);
 * 3. 调注入的 {@link Upstream}(路由核心通过注入接口,**不 import**
 *    src/router、src/scheduler —— 换档/亲和/并发由注入方实现);
 * 4. 流式直出(只加 SSE 帧);失败按注入方的重试语义换档。
 *
 * 错误映射(对齐 `app.py`):
 * - 上游 {@link UpstreamError} → `{"detail": {"error": {"type": kind, "message": detail}}}`
 *   + `Retry-After` 头(`_as_http`,app.py:2327-2343);
 * - 并发全忙(all_busy)→ 503 `{"detail": {"error": {"type": "capacity", ...}}}`
 *   (`_busy_or_upstream`,app.py:2314-2318,不带 Retry-After —— 不排队就没承诺);
 * - 已开流之后上游失败 → **不改状态码**(响应头已出去,Starlette 的
 *   "response already started" 教训,test_stream_interrupt.py):让流断在那里。
 *
 * 客户端断开:`clientDisconnectSignal`(sse.ts)→ 中止上游迭代;未发字节前的
 * 断开直接结束请求。**零第三方依赖**:只用 node: 内建。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { requireKey } from "./auth.js";
import {
  clientDisconnectSignal,
  ssePackChunk,
  ssePackDone,
  SSE_RESPONSE_HEADERS,
} from "./sse.js";
import {
  cacheRoutingKeyOf,
  classifyRequestFields,
  reasoningEffortOf,
  type RequestFieldReport,
} from "./request-fields.js";
import {
  UpstreamError,
  UpstreamErrorKind,
  type ChatCompletionChunk,
  type ChatCompletionRequest,
  type GatewayErrorBody,
  type GatewayOptions,
  type RequestDoneInfo,
  type Upstream,
  type UpstreamRequest,
} from "./types.js";

/** 并发全忙提示(app.py:76 BUSY_DETAIL,2026-10-13 定:不排队、不带 Retry-After)。 */
export const BUSY_DETAIL =
  "并发已满:该模型当前所有档位的并发上限都已占满,请稍后重试";

/** 注入方可声明的请求级错误(对齐 `_REQUEST_LEVEL_KINDS`:换成员也必然同样失败)。 */
export const REQUEST_LEVEL_KINDS: ReadonlySet<string> = new Set([
  UpstreamErrorKind.BadRequest,
  UpstreamErrorKind.AuthChallenge,
]);

/**
 * 与 errors.py `_REQUEST_LEVEL_KINDS` 同口径:请求本身有问题,不换成员重试。
 * 供注入方在 Upstream 实现内决定「失败前是否换档」——本层只做映射,不换档。
 */
export function isRequestLevel(exc: UpstreamError): boolean {
  return REQUEST_LEVEL_KINDS.has(exc.kind);
}

// ---------------------------------------------------------------------------
// 错误映射(app.py:_as_http / _busy_or_upstream 对应物)
// ---------------------------------------------------------------------------

export class GatewayHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: GatewayErrorBody,
    readonly headers?: Record<string, string>,
    /**
     * 上游原始响应体的**逐字**字节(仅「原样透传」用)。
     *
     * 有它时出口直接写这段字节,不再 `JSON.stringify(body)` —— 上游回的可能是
     * HTML / 纯文本,包一层 `{"detail": "..."}` 就已经是「修改」了。`body` 仍
     * 保留一份可读表示,供请求日志与内部诊断读。
     */
    readonly rawBody?: string,
  ) {
    super(JSON.stringify(body));
    this.name = "GatewayHttpError";
  }
}

/**
 * UpstreamError → 客户端能读懂的 HTTP 错误(app.py:_as_http)。
 *
 * ⚠️ 有上游原件(`exc.raw`)时**逐字透传**:状态码与响应体都照上游的写回去,
 * 一个字符都不改(用户 m36329:「只要上游有返回值,就返回上游返回的原始内容,
 * 不做修改」)。分类器那套「认证失败 — 上游:…」的人话只进请求日志与内部决策,
 * 不上屏 —— 否则客户端看到的是网关的猜测,而它本可以拿到真实答复去自己判断
 * (例如上游 400 里点的具体参数名)。
 *
 * 只有**自造**错误(并发已满、号池耗尽、网络异常 —— 这些根本没有上游答复)
 * 才走 `detail` 的 detail.error 形状。
 */
export function upstreamErrorToHttp(exc: UpstreamError): GatewayHttpError {
  const headers: Record<string, string> = {};
  if (exc.retryAfter !== undefined) {
    headers["Retry-After"] = String(Math.max(1, Math.floor(exc.retryAfter)));
  }
  const raw = exc.raw;
  if (raw !== undefined) {
    const status = Number.isFinite(raw.status) && raw.status >= 400 ? raw.status : exc.httpStatus;
    // 上游给的是 JSON 就还它 JSON(连同原结构),否则按文本原样回。
    const body: GatewayErrorBody =
      raw.json !== undefined
        ? (raw.json as GatewayErrorBody)
        : ({ detail: raw.text } as GatewayErrorBody);
    if (raw.contentType !== undefined && !raw.contentType.startsWith("application/json")) {
      // 非 JSON 的错误体(HTML 网关页 / 纯文本):别假装是 JSON。
      headers["Content-Type"] = raw.contentType;
    }
    // 逐字写回上游原文 —— rawBody 让 sendJson 跳过 JSON.stringify。
    return new GatewayHttpError(
      status,
      body,
      Object.keys(headers).length > 0 ? headers : undefined,
      raw.text,
    );
  }
  return new GatewayHttpError(
    exc.httpStatus,
    { detail: { error: { type: exc.kind, message: exc.detail } } },
    Object.keys(headers).length > 0 ? headers : undefined,
  );
}

/** 整条链都没选出来时的出口(app.py:_busy_or_upstream):all_busy → 503 capacity。 */
export function allBusyError(): GatewayHttpError {
  return new GatewayHttpError(503, {
    detail: { error: { type: "capacity", message: BUSY_DETAIL } },
  });
}

// ---------------------------------------------------------------------------
// 请求体读取
// ---------------------------------------------------------------------------

async function readJsonBody(req: IncomingMessage, limitBytes = 64 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > limitBytes) {
      throw new GatewayHttpError(413, { detail: "请求体过大" });
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new GatewayHttpError(400, { detail: "请求体不是合法 JSON" });
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
  rawBody?: string,
): void {
  // rawBody 优先:那是上游原文,`body` 只是它的可读影子(见 GatewayHttpError)。
  const payload =
    rawBody !== undefined ? Buffer.from(rawBody, "utf8") : Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(payload.length),
    ...headers,
  });
  res.end(payload);
}

// ---------------------------------------------------------------------------
// 请求 → 上游请求(Nexus `_build_request` / `UpstreamRequest.to_body` 的网关侧)
// ---------------------------------------------------------------------------

function toUpstreamRequest(body: ChatCompletionRequest, stream: boolean): UpstreamRequest {
  // ⚠️ `max_completion_tokens` 是 OpenAI 的同义字段,一起收(Nexus O1)。
  // 0 经 `||` 归 undefined —— 客户端显式发 0 视为「没带」。
  const mtClient = body.max_tokens || body.max_completion_tokens;
  // ⚠️ 字段分类(m09081):**能处理就处理,不能处理就丢弃,绝不拒绝请求**。
  // 这里只负责把结果挂到请求上;丢弃清单会一路传到请求明细里。
  const fieldReport = classifyRequestFields(body);
  // 思考强度:**只原样透传**(`reasoningEffort` 别名归一到 `reasoning_effort`)。
  // 网关不解释档位值;上游说不支持就丢掉重试(见 gateway-upstream 的
  // isReasoningEffortRejection)。**未指定时连键都不加**(用户 m09081:
  // 「其他未指定就不添加,让上游自行决定」)—— 填 undefined 与不填在 bodyFor
  // 里等价,但内部对象也不该凭空多一个键。
  const reasoningEffort = reasoningEffortOf(body);
  return {
    model: body.model,
    messages: body.messages ?? [],
    stream,
    temperature: body.temperature,
    // 首档先按客户端原值填;真正的钳制在网关注入侧(那时才知道当轮成员是谁、
    // 上限多少)—— 见 `gateway-upstream.ts` 的 `clampMaxTokens`。
    max_tokens: mtClient,
    // 客户端**原始**意图另存一份:换档重试时必须从这里重算,不能拿上一轮
    // 已经钳过的 `max_tokens` 继续 min。
    maxTokensClient: mtClient,
    top_p: body.top_p,
    stop: body.stop,
    tools: body.tools,
    tool_choice: body.tool_choice,
    ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort }),
    // 缓存路由键(billion-context):网关拿它做端点亲和,**不进上游 body**。
    prompt_cache_key: cacheRoutingKeyOf(body),
    // 丢弃清单(仅记录用;对请求结果无影响)。
    discarded_fields: fieldReport.discarded.length > 0 ? fieldReport.discarded : undefined,
    extra: {} as Record<string, unknown>,
  };
}

/**
 * 记录一次请求的**字段处置**:消费了哪些内部键、丢弃了哪些不认识的字段。
 *
 * ⚠️ 这是「不拒绝请求」原则的配套观测:客户端带了网关不认识的字段时,请求照常
 * 跑,但用户得能看到「哪些字段被丢了」—— 否则一个参数静默消失,排查成本极高。
 */
function logFieldReport(
  options: GatewayOptions,
  report: RequestFieldReport,
  model: string,
): void {
  if (report.consumed.length > 0) {
    options.logger?.info?.(
      `[gateway] 内部键 model=${model}: ${report.consumed.join(", ")}`,
    );
  }
  if (report.discarded.length > 0) {
    options.logger?.warn?.(
      `[gateway] 丢弃无法处理的请求字段 model=${model}: ${report.discarded.join(", ")}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 流式转发
// ---------------------------------------------------------------------------

/**
 * 流式转发:`upstream.stream()` 产出的每个 chunk 加 SSE 帧直出,正常收尾追加
 * `[DONE]`(app.py:2031)。
 *
 * ⚠️ **已发字节后失败不改状态码**(test_stream_interrupt 的真 bug 教训):
 * 让流断在那里 —— 这是开流之后唯一诚实的信号。客户端断开(AbortSignal /
 * res close)→ 停止消费上游,记 `ok=false`。
 *
 * `onStreamResult` 给注入方记账(成功/断开/已开流后失败),参数:
 * `(outcome, usage, firstChunkMs, totalMs)`。
 */
export async function forwardStream(
  res: ServerResponse,
  upstream: Upstream,
  req: Parameters<Upstream["stream"]>[0],
  signal: AbortSignal,
  onStreamResult?: (
    outcome: "ok" | "client_disconnected" | "failed_after_start",
    usage: Record<string, unknown> | undefined,
    firstChunkMs: number | undefined,
    totalMs: number,
  ) => void,
): Promise<void> {
  const t0 = Date.now();
  let firstChunkMs: number | undefined;
  let usage: Record<string, unknown> | undefined;
  let headSent = false;
  const iterator = upstream.stream(req)[Symbol.asyncIterator]();
  try {
    // 手动迭代:首块之前抛错时响应头还没发,可以把错误映射成正确的状态码;
    // 首块之后抛错 = 已开流,只能让流断在那里(lazy head)。
    for (;;) {
      if (signal.aborted) {
        onStreamResult?.("client_disconnected", usage, firstChunkMs, Date.now() - t0);
        return;
      }
      const next = await iterator.next();
      if (next.done) break;
      if (!headSent) {
        headSent = true;
        firstChunkMs = Date.now() - t0;
        res.writeHead(200, SSE_RESPONSE_HEADERS);
      }
      const chunk = next.value as ChatCompletionChunk;
      if (chunk && typeof chunk === "object" && "usage" in chunk && chunk.usage) {
        usage = chunk.usage as unknown as Record<string, unknown>;
      }
      res.write(ssePackChunk(chunk));
    }
    if (!headSent) {
      // 空流:仍以 200 + [DONE] 收尾(与 Nexus「上游没吐块但没报错」一致)
      res.writeHead(200, SSE_RESPONSE_HEADERS);
    }
    res.write(ssePackDone());
    res.end();
    onStreamResult?.("ok", usage, firstChunkMs, Date.now() - t0);
  } catch (exc) {
    if (signal.aborted) {
      onStreamResult?.("client_disconnected", usage, firstChunkMs, Date.now() - t0);
      return;
    }
    if (headSent) {
      // 已发字节:状态码改不了,让流断在这里(app.py:2073-2093 的语义)。
      onStreamResult?.("failed_after_start", usage, firstChunkMs, Date.now() - t0);
      try {
        res.end();
      } catch {
        // 对端可能已经关了
      }
      return;
    }
    try {
      await iterator.return?.();
    } catch {
      // 上游生成器收尾失败不掩盖原错误
    }
    throw exc; // 未发字节:交给外层统一错误出口(换档/错误映射是注入方的事)
  }
}

// ---------------------------------------------------------------------------
// 路由核心(只通过注入接口,不 import router/scheduler)
// ---------------------------------------------------------------------------

async function handleChatCompletions(
  req: IncomingMessage,
  res: ServerResponse,
  options: GatewayOptions,
): Promise<void> {
  const bodyRaw = await readJsonBody(req);
  const body = (bodyRaw ?? {}) as ChatCompletionRequest;
  const model = String(body.model ?? "").trim();
  if (!model) {
    throw new GatewayHttpError(400, { detail: "缺少 model" });
  }
  const stream = Boolean(body.stream);

  const upstream = options.resolveUpstream(model);
  if (!upstream) {
    // 未知模型 404(含真实模型直连 404;Nexus `_model_exists` 判据:
    // 逻辑模型与真实模型都算 —— 这里由注入方的 resolveUpstream 决定存在性)
    throw new GatewayHttpError(404, { detail: `未知模型: ${model}` });
  }

  const signal = clientDisconnectSignal(req, res);
  const fieldReport = classifyRequestFields(body);
  const upstreamReq = toUpstreamRequest(body, stream);
  logFieldReport(options, fieldReport, model);

  // 会话 id:上游适配器读 req.extra.session_id 做会话亲和(gateway-upstream
  // sessionOf 同款),bodyFor 会摘除该键 → 必不透传给上游。
  const sessionId = options.deriveSessionId?.(body);
  if (sessionId !== undefined) (upstreamReq.extra ??= {}).session_id = sessionId;

  // 客户端断开信号交给上游:让它 abort 自己的 fetch,流生成器因此抛错退出,
  // catch 里的 router.finish 会归还并发槽位。不做这一步,槽位要等到租期
  // (inflight-ledger 600s)被 purge 扫掉 —— 客户端一断开,该档位就卡死。
  upstreamReq.clientSignal = signal;

  const t0 = Date.now();
  if (stream) {
    try {
      await forwardStream(res, upstream, upstreamReq, signal, (outcome, usage, firstChunkMs, totalMs) => {
        if (outcome !== "ok") {
          options.logger?.warn?.(
            `[gateway] stream ${outcome} model=${model} ttft=${firstChunkMs ?? "-"}ms total=${totalMs}ms`,
          );
        }
        const ok = outcome === "ok";
        fireRequestDone(options, {
          model,
          stream: true,
          ok,
          status: outcome === "client_disconnected" ? 0 : 200,
          error: ok
            ? null
            : outcome === "client_disconnected"
              ? "客户端断开"
              : "流式传输中断(首块后失败)",
          error_kind: null,
          latency_ms: totalMs,
          ttft_ms: firstChunkMs ?? null,
          usage: usageToTokens(usage),
          session_id: sessionId ?? null,
          prompt_cache_key: cacheRoutingKeyOf(body),
          discarded_fields: fieldReport.discarded.length > 0 ? fieldReport.discarded : null,
          request: body,
        });
      });
    } catch (exc) {
      // 首块前失败:响应未发,错误交外层统一出口;请求日志仍要记一笔。
      fireRequestDone(options, {
        model,
        stream: true,
        ...doneFromError(exc, Date.now() - t0),
        ttft_ms: null,
        session_id: sessionId ?? null,
        prompt_cache_key: cacheRoutingKeyOf(body),
        discarded_fields: fieldReport.discarded.length > 0 ? fieldReport.discarded : null,
        request: body,
      });
      throw exc;
    }
    return;
  }

  // 非流式:可以在任何时刻换号(响应还没发出去)—— 换档语义在注入方。
  try {
    const payload = await upstream.complete(upstreamReq);
    sendJson(res, 200, payload);
    fireRequestDone(options, {
      model,
      stream: false,
      ok: true,
      status: 200,
      error: null,
      error_kind: null,
      latency_ms: Date.now() - t0,
      ttft_ms: null,
      usage: usageToTokens((payload as { usage?: unknown } | null | undefined)?.usage),
      session_id: sessionId ?? null,
      prompt_cache_key: cacheRoutingKeyOf(body),
      discarded_fields: fieldReport.discarded.length > 0 ? fieldReport.discarded : null,
      request: body,
    });
  } catch (exc) {
    fireRequestDone(options, {
      model,
      stream: false,
      ...doneFromError(exc, Date.now() - t0),
      ttft_ms: null,
      session_id: sessionId ?? null,
      prompt_cache_key: cacheRoutingKeyOf(body),
      discarded_fields: fieldReport.discarded.length > 0 ? fieldReport.discarded : null,
      request: body,
    });
    throw exc;
  }
}

/**
 * 触发 onRequestDone 挂钩。挂钩抛错不得影响已发出的响应/请求流程:
 * 记账失败是观测问题,不是请求问题 —— 内部吞掉并走 logger.error。
 */
function fireRequestDone(options: GatewayOptions, info: RequestDoneInfo): void {
  if (!options.onRequestDone) return;
  try {
    options.onRequestDone(info);
  } catch (exc) {
    options.logger?.error?.("[gateway] onRequestDone 挂钩抛错", exc);
  }
}

/** 失败路径定型(exc → ok/status/error/error_kind)。 */
function doneFromError(
  exc: unknown,
  latencyMs: number,
): Pick<RequestDoneInfo, "ok" | "status" | "error" | "error_kind" | "latency_ms"> {
  if (exc instanceof UpstreamError) {
    return { ok: false, status: exc.httpStatus, error: exc.detail, error_kind: exc.kind, latency_ms: latencyMs };
  }
  if (exc instanceof GatewayHttpError) {
    let text: string;
    try {
      text = JSON.stringify(exc.body);
    } catch {
      text = String(exc.body);
    }
    return { ok: false, status: exc.status, error: text, error_kind: null, latency_ms: latencyMs };
  }
  const message = exc instanceof Error ? exc.message : String(exc);
  return { ok: false, status: 500, error: message, error_kind: null, latency_ms: latencyMs };
}

/**
 * 流式(或普通)usage → Nexus 三键:Nexus cached=prompt_tokens_details.cached_tokens。
 * usage 缺失 → null(逐 token 字段不得捏造 0)。
 */
function usageToTokens(usage: unknown): RequestDoneInfo["usage"] {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const details = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    if (v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    prompt_tokens: num(u.prompt_tokens) ?? 0,
    cached_tokens: num(details.cached_tokens) ?? 0,
    completion_tokens: num(u.completion_tokens) ?? 0,
  };
}

async function handleModels(res: ServerResponse, options: GatewayOptions): Promise<void> {
  const entries = await options.modelProvider.listModels();
  sendJson(res, 200, { object: "list", data: entries });
}

// ---------------------------------------------------------------------------
// 服务器
// ---------------------------------------------------------------------------

function notFound(res: ServerResponse, method: string, path: string): void {
  // Nexus 删除探针后,未注册路径就是普通 404(FastAPI `{"detail":"Not Found"}`)。
  sendJson(res, 404, { detail: `Not Found: ${method} ${path}` });
}

function methodNotAllowed(res: ServerResponse, method: string, path: string): void {
  // FastAPI 对已注册路径的方法不匹配回 405 `{"detail":"Method Not Allowed"}`。
  sendJson(res, 405, { detail: `Method Not Allowed: ${method} ${path}` });
}

export function createGatewayServer(options: GatewayOptions): Server {
  const server = createServer((req, res) => {
    void handleRequest(req, res, options);
  });
  // 客户端断开时不要再往死连接写(SSE 半途断开常见)
  server.on("clientError", (err, socket) => {
    try {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    } catch {
      void err;
    }
  });
  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: GatewayOptions,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = (req.method ?? "GET").toUpperCase();

  // ---- 1. 路由形状(先于鉴权 —— Starlette 的行为:未注册路径/方法不匹配
  //         在 Depends(require_key) 之前就返回 404/405) ----
  let route: "models" | "chat" | null = null;
  if (path === "/v1/models") {
    if (method !== "GET") {
      methodNotAllowed(res, method, path);
      return;
    }
    route = "models";
  } else if (path === "/v1/chat/completions") {
    if (method !== "POST") {
      methodNotAllowed(res, method, path);
      return;
    }
    route = "chat";
  } else {
    // TODO(阶段二再议,不在本阶段臆造):POST /v1/completions、POST /v1/embeddings、
    // /health —— Nexus 均未实现(test_gateway_e2e §0:/health 已移除 404)。
    notFound(res, method, path);
    return;
  }

  try {
    // ---- 2. 鉴权(require_key;/v1/* 全部走,对齐 FastAPI Depends) ----
    const denied = requireKey(req, options.keyProvider);
    if (denied) {
      sendJson(res, denied.status, denied.body);
      return;
    }

    // ---- 3. 处理 ----
    if (route === "models") {
      await handleModels(res, options);
      return;
    }
    await handleChatCompletions(req, res, options);
  } catch (exc) {
    if (res.writableEnded) return;
    if (exc instanceof GatewayHttpError) {
      // rawBody = 上游原文(原样透传时才有):sendJson 优先写它。
      sendJson(res, exc.status, exc.body, exc.headers, exc.rawBody);
      return;
    }
    if (exc instanceof UpstreamError) {
      // 统一 kind→HTTP 映射(_as_http 口径)。请求级错误(bad_request /
      // auth_challenge)与其它 kind 在这里都只是映射 —— 换档循环属于注入方:
      // 未发字节的失败若要换档,应由注入方在 Upstream 实现内完成。
      const mapped = upstreamErrorToHttp(exc);
      sendJson(res, mapped.status, mapped.body, mapped.headers, mapped.rawBody);
      return;
    }
    options.logger?.error?.("[gateway] internal error", exc);
    sendJson(res, 500, { detail: "Internal Server Error" });
  }
}

/** 便利启动:listen 随机端口(loopback)。返回实际端口。 */
export function startGateway(
  options: GatewayOptions,
  listenOpts: { host?: string; port?: number } = {},
): Promise<{ server: Server; port: number; close(): Promise<void> }> {
  const server = createGatewayServer(options);
  const host = listenOpts.host ?? "127.0.0.1";
  const port = listenOpts.port ?? 0; // 0 = 随机端口(loopback shim 形态)
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : port;
      resolve({
        server,
        port: actualPort,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => (err ? rejectClose(err) : resolveClose()));
          }),
      });
    });
  });
}
