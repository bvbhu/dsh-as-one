/**
 * ctx.webServer 路由 —— OpenAI 兼容网关面(与 core gateway/server.ts 的
 * handleRequest 同语义,但输出接宿主 webServer 而非自建 http.Server)。
 *
 * 挂载点(全部 exact,宿主匹配顺序:exact → prefix → fallback):
 *   GET  /v1/models           → { object: "list", data: ModelEntry[] }
 *   POST /v1/chat/completions → 非流式 JSON / 流式 SSE(forwardStream)
 *
 * ⚠️ webServer handler 抛错会被宿主 catch 成 400,因此**所有错误路径在
 * handler 内自写 status/body**(401 鉴权、404 未知模型、503 无可用上游…)。
 * 复用 core 导出:requireKey(auth.js)、clientDisconnectSignal(sse.js)、
 * forwardStream / upstreamErrorToHttp / GatewayHttpError(server.js)。
 *
 * ⚠️ parity:与 electron 的 gateway 面一致地**派生会话号**、**透传缓存路由键**、
 * **请求结束落一次 stats_daily + 明细日志**(`rt.onRequestDone`)——否则插件版的
 * 面板统计页永远是空的、会话粘性也拿不到 sessionId。
 */
import { requireKey } from "@as-one/core/src/gateway/auth.js";
import { clientDisconnectSignal } from "@as-one/core/src/gateway/sse.js";
import { forwardStream, GatewayHttpError, upstreamErrorToHttp, } from "@as-one/core/src/gateway/server.js";
import { UpstreamError } from "@as-one/core/src/gateway/types.js";
import { sessionIdOf } from "@as-one/core/src/gateway/session.js";
import { cacheRoutingKeyOf, classifyRequestFields, } from "@as-one/core/src/gateway/request-fields.js";
import { readJsonBody, toUpstreamRequest, writeJson } from "./wire.js";
/** 上游 usage → 统计三键(Nexus 口径:prompt / cached / completion)。 */
function usageOf(usage) {
    if (!usage)
        return null;
    const details = (usage.prompt_tokens_details ?? {});
    const num = (v) => {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
    };
    return {
        prompt_tokens: num(usage.prompt_tokens),
        cached_tokens: num(details.cached_tokens),
        completion_tokens: num(usage.completion_tokens),
    };
}
export function buildGatewayRoutes(rt, opts = {}) {
    const logger = opts.logger ?? console;
    const authGuard = (req, res) => {
        const denied = requireKey(req, rt.keyProvider);
        if (denied) {
            writeJson(res, denied.status, denied.body);
            return true;
        }
        return false;
    };
    /** 请求完成 → 统计/明细(electron 由 core handleRequest 触发,这里手写同口径)。 */
    const done = (info) => {
        try {
            rt.onRequestDone(info);
        }
        catch (err) {
            logger.error?.("[as-one] onRequestDone failed", err);
        }
    };
    return [
        {
            kind: "exact",
            path: "/v1/models",
            handler: async (req, res) => {
                const nreq = req;
                const nres = res;
                if ((nreq.method ?? "GET").toUpperCase() !== "GET") {
                    writeJson(nres, 405, { detail: `Method Not Allowed: ${nreq.method} GET` });
                    return;
                }
                if (authGuard(nreq, nres))
                    return;
                // ⚠️ `listModels()` 是 async(8ac0676 起要查凭据库)。这里漏 await 会把
                // Promise 直接喂给 JSON.stringify —— 序列化成 `{}`,于是 /v1/models
                // 返回 `{"object":"list","data":{}}`,客户端看到的就是「一个模型都没有」。
                writeJson(nres, 200, { object: "list", data: await rt.listModels() });
            },
        },
        {
            kind: "exact",
            path: "/v1/chat/completions",
            handler: async (req, res) => {
                const nreq = req;
                const nres = res;
                let model = "";
                let stream = false;
                let sessionId = null;
                let cacheKey = null;
                let discarded = null;
                let body = {};
                const t0 = Date.now();
                try {
                    if ((nreq.method ?? "POST").toUpperCase() !== "POST") {
                        writeJson(nres, 405, { detail: `Method Not Allowed: ${nreq.method} POST` });
                        return;
                    }
                    if (authGuard(nreq, nres))
                        return;
                    body = await readJsonBody(req);
                    model = String(body.model ?? "").trim();
                    if (!model)
                        throw new GatewayHttpError(400, { detail: "缺少 model" });
                    stream = Boolean(body.stream);
                    // 会话号/缓存路由键:与 electron 同口径(DSH 一个会话标识都不发,
                    // 只能从 body 或首条 user 消息派生;派生值按逻辑模型隔离)。
                    sessionId = sessionIdOf(body, model) ?? null;
                    cacheKey = cacheRoutingKeyOf(body) ?? null;
                    const fields = classifyRequestFields(body);
                    discarded = fields.discarded.length > 0 ? fields.discarded : null;
                    const upstream = rt.resolveUpstream(model);
                    if (!upstream)
                        throw new GatewayHttpError(404, { detail: `未知模型: ${model}` });
                    const signal = clientDisconnectSignal(nreq, nres);
                    const upstreamReq = toUpstreamRequest(body, stream);
                    // 亲和键与丢弃清单随请求走(上游不发,只给路由/统计用)。
                    upstreamReq.prompt_cache_key = cacheKey ?? undefined;
                    upstreamReq.discarded_fields = discarded ?? undefined;
                    upstreamReq.extra = { ...(upstreamReq.extra ?? {}), session_id: sessionId ?? undefined };
                    if (stream) {
                        await forwardStream(nres, upstream, upstreamReq, signal, (outcome, usage, firstChunkMs, totalMs) => {
                            if (outcome !== "ok") {
                                logger.warn?.(`[as-one] stream ${outcome} model=${model} ttft=${firstChunkMs ?? "-"}ms total=${totalMs}ms`);
                            }
                            done({
                                model,
                                stream: true,
                                // 已发字节后失败:状态码仍是 200(客户端拿到的是断流);
                                // 客户端断开(未发响应)= 0,与 core 口径一致。
                                ok: outcome === "ok",
                                status: outcome === "client_disconnected" ? 0 : 200,
                                error: outcome === "ok"
                                    ? null
                                    : outcome === "client_disconnected"
                                        ? "客户端断开"
                                        : "流式传输中断",
                                error_kind: outcome === "ok" ? null : outcome === "client_disconnected" ? "connection" : "timeout",
                                latency_ms: Math.round(totalMs),
                                ttft_ms: firstChunkMs === undefined ? null : Math.round(firstChunkMs),
                                usage: usageOf(usage),
                                session_id: sessionId,
                                prompt_cache_key: cacheKey,
                                discarded_fields: discarded,
                                request: body,
                            });
                        });
                        return;
                    }
                    const payload = await upstream.complete(upstreamReq);
                    const totalMs = Date.now() - t0;
                    writeJson(nres, 200, payload);
                    done({
                        model,
                        stream: false,
                        ok: true,
                        status: 200,
                        error: null,
                        error_kind: null,
                        latency_ms: totalMs,
                        ttft_ms: null,
                        usage: usageOf(payload.usage),
                        session_id: sessionId,
                        prompt_cache_key: cacheKey,
                        discarded_fields: discarded,
                        request: body,
                    });
                }
                catch (exc) {
                    const mapped = exc instanceof GatewayHttpError
                        ? exc
                        : exc instanceof UpstreamError
                            ? upstreamErrorToHttp(exc)
                            : null;
                    if (mapped) {
                        writeJson(nres, mapped.status, mapped.body, mapped.headers, mapped.rawBody);
                    }
                    else {
                        logger.error?.("[as-one] chat completions internal error", exc);
                        writeJson(nres, 500, { detail: "Internal Server Error" });
                    }
                    done({
                        model,
                        stream,
                        ok: false,
                        status: mapped ? mapped.status : 500,
                        error: exc instanceof Error ? exc.message : String(exc),
                        error_kind: exc instanceof UpstreamError ? exc.kind : null,
                        latency_ms: Date.now() - t0,
                        ttft_ms: null,
                        usage: null,
                        session_id: sessionId,
                        prompt_cache_key: cacheKey,
                        discarded_fields: discarded,
                        request: body,
                    });
                }
            },
        },
    ];
}
//# sourceMappingURL=routes.js.map