/**
 * HTTP 帮手 —— webServer 路由 handler 侧的读写原语。
 *
 * 与 core gateway/server.ts 的内部 readJsonBody/sendJson 同语义
 * (错误码/文案对齐),但输出接 ctx.webServer 的结构化 req/res。
 * 注意:webServer handler 抛错会被宿主 catch 成 400,所以所有错误路径
 * 必须自己 writeHead + end。
 */
import type { UpstreamRequest } from "@as-one/core/src/gateway/types.js";
import type { AsOneHttpRequest, AsOneHttpResponse } from "./context-types.js";
/** 读 JSON 请求体(core gateway readJsonBody 同款:413 超限 / 400 坏 JSON / 空体 → {})。 */
export declare function readJsonBody(req: AsOneHttpRequest, limitBytes?: number): Promise<Record<string, unknown>>;
/** 写 JSON 响应(带 Content-Length;headers 供 Retry-After 等)。 */
export declare function writeJson(res: AsOneHttpResponse, status: number, body: unknown, headers?: Record<string, string>, rawBody?: string): void;
/** 统一错误出口:GatewayHttpError → 原样映射;其余 → 500(宿主不会替我们写)。 */
export declare function writeError(res: AsOneHttpResponse, exc: unknown): void;
/**
 * 请求体 → 上游请求(port core gateway/server.ts 的 toUpstreamRequest)。
 * ⚠️ 它只搬网关白名单字段,业务扩展字段(body 上多余键)不透传 ——
 * 与 core 版保持逐字段一致,避免语义漂移。
 *
 * ⚠️ 两处**必须**与 core 同口径(少了它们网关行为会漂移):
 * - `max_completion_tokens` 是 OpenAI 的同义字段,一起收(O1);
 * - `maxTokensClient` 存客户端**原始**上限 —— 换档重试时钳制要从未钳过的值
 *   重算,拿上一轮已钳过的 `max_tokens` 继续 min 会越试越小。
 */
export declare function toUpstreamRequest(body: Record<string, unknown>, stream: boolean): UpstreamRequest;
