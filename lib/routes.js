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
import { isWorkbuddyBanMessage, isWorkbuddyBreakerTripped, readWorkbuddyBreaker, tripWorkbuddyBreaker, } from "./workbuddy-breaker.js";
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
    /**
     * 该模型(可能是逻辑模型)的档链里是否含 workbuddy 成员。
     *
     * 熔断必须拦住「逻辑模型 → workbuddy 成员」这条路径,否则用户选的是 `auto`
     * 这类逻辑模型,请求照样会落到 workbuddy 上。
     */
    const modelIncludesWorkbuddyMember = (modelId) => {
        try {
            const chain = rt.scheduler.chain(modelId);
            return chain.some((item) => item.endpoint.provider === "workbuddy");
        }
        catch {
            // 未知模型/调度器异常:交给后面的 404 处理,这里不拦。
            return false;
        }
    };
    /**
     * 触发 WorkBuddy 彻底熔断(物理删除全部凭据 + 持久化标记)。
     *
     * 绝不抛错:熔断是**错误路径上的补救**,它自己失败不能把原本要返回给客户端的
     * 上游错误盖成 500。失败只记日志(用户至少还能看到上游原文)。
     */
    const tripBreakerQuietly = async (reason) => {
        try {
            const r = await tripWorkbuddyBreaker(rt.db, rt.vault, "workbuddy", reason);
            logger.warn?.(`[as-one] WorkBuddy 11140 → 已彻底熔断:删除 ${r.removedAccounts} 个凭据` +
                (r.failedAccounts.length > 0 ? `,${r.failedAccounts.length} 个删除失败(见凭据列表)` : "") +
                "。恢复需人工清除熔断标记并重新导入账号。");
            // 删完凭据后注册表/调度链要立刻反映(否则本轮仍可能选到刚删的账号)。
            try {
                rt.syncRegistry();
            }
            catch {
                /* 投影失败不阻断 */
            }
        }
        catch (err) {
            logger.error?.("[as-one] WorkBuddy 熔断失败(凭据可能未删除)", err);
        }
    };
    /**
     * 渠道熔断时直接拒绝请求(在选路/打上游**之前**)。
     *
     * @returns true = 已写响应并拦下,调用方应立即 return
     */
    const rejectIfBreakerTripped = (res) => {
        if (!isWorkbuddyBreakerTripped(rt.db))
            return false;
        const state = readWorkbuddyBreaker(rt.db);
        writeJson(res, 503, {
            error: {
                type: "service_unavailable",
                code: "workbuddy_channel_broken",
                message: "WorkBuddy 渠道因上游 11140(账号异常行为)已彻底熔断,凭据已删除。" +
                    "需人工恢复:清除熔断标记后重新从 WorkBuddy 客户端导入账号。",
                tripped_at_ms: state?.trippedAtMs ?? null,
                reason: state?.reason ?? null,
            },
        });
        return true;
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
                    // ⚠️ 熔断拦截放在**解析模型之后、选路之前**(2026-11-07):
                    // 熔断是渠道级的,但只有该渠道的模型才该被拦 —— 其它渠道照常服务。
                    // 这里先判一次,避免把请求送进调度器后被选到已删凭据的端点。
                    body = await readJsonBody(req);
                    model = String(body.model ?? "").trim();
                    if (!model)
                        throw new GatewayHttpError(400, { detail: "缺少 model" });
                    {
                        // 熔断是 workbuddy 渠道级的:用模型 id 的 provider 前缀判断
                        // (Upstream 接口不暴露 provider,而 model 形如 `workbuddy/xxx`
                        // 或逻辑模型名 —— 逻辑模型的成员可能含 workbuddy,故两者都看)。
                        const touchesWorkbuddy = model.startsWith("workbuddy/") || modelIncludesWorkbuddyMember(model);
                        if (touchesWorkbuddy && rejectIfBreakerTripped(nres))
                            return;
                    }
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
                    // ⚠️ WorkBuddy 11140(账号异常/被限)→ **彻底熔断**(2026-11-07 用户定案):
                    // 物理删除该渠道全部凭据 + 写持久化标记,之后请求在选路前就被拦。
                    // 为什么不等「冷却窗口」:调研结论是换号重试会导致设备指纹连坐
                    // (见 workbuddy-breaker.ts 顶部)。删除是**结构性**保证不漏发。
                    if (exc instanceof UpstreamError && isWorkbuddyBanMessage(exc.message)) {
                        await tripBreakerQuietly(exc.message);
                    }
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