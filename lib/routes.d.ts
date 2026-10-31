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
import type { AsOneWebRoute } from "./context-types.js";
import type { AsOneRuntime } from "./setup.js";
export interface GatewayRouteOptions {
    /** 供 onStreamResult 打日志用。 */
    logger?: Pick<Console, "warn" | "error">;
}
export declare function buildGatewayRoutes(rt: AsOneRuntime, opts?: GatewayRouteOptions): AsOneWebRoute[];
