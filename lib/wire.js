/**
 * HTTP 帮手 —— webServer 路由 handler 侧的读写原语。
 *
 * 与 core gateway/server.ts 的内部 readJsonBody/sendJson 同语义
 * (错误码/文案对齐),但输出接 ctx.webServer 的结构化 req/res。
 * 注意:webServer handler 抛错会被宿主 catch 成 400,所以所有错误路径
 * 必须自己 writeHead + end。
 */
import { GatewayHttpError } from "@as-one/core/src/gateway/server.js";
import { reasoningEffortOf } from "@as-one/core/src/gateway/request-fields.js";
const MAX_BODY_BYTES = 64 * 1024 * 1024;
/** 读 JSON 请求体(core gateway readJsonBody 同款:413 超限 / 400 坏 JSON / 空体 → {})。 */
export async function readJsonBody(req, limitBytes = MAX_BODY_BYTES) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > limitBytes) {
            throw new GatewayHttpError(413, { detail: "请求体过大" });
        }
        chunks.push(buf);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw.trim())
        return {};
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new GatewayHttpError(400, { detail: "请求体不是合法 JSON" });
    }
}
/** 写 JSON 响应(带 Content-Length;headers 供 Retry-After 等)。 */
export function writeJson(res, status, body, headers, rawBody) {
    // rawBody 优先:那是上游原文,`body` 只是它的可读影子(见 GatewayHttpError)。
    const payload = rawBody !== undefined ? Buffer.from(rawBody, "utf8") : Buffer.from(JSON.stringify(body), "utf8");
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": String(payload.length),
        ...headers,
    });
    res.end(payload);
}
/** 统一错误出口:GatewayHttpError → 原样映射;其余 → 500(宿主不会替我们写)。 */
export function writeError(res, exc) {
    if (exc instanceof GatewayHttpError) {
        writeJson(res, exc.status, exc.body, exc.headers, exc.rawBody);
        return;
    }
    writeJson(res, 500, { detail: "Internal Server Error" });
}
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
export function toUpstreamRequest(body, stream) {
    const mtClient = body.max_tokens ||
        body.max_completion_tokens;
    // 思考强度:只原样透传(`reasoningEffort` 别名归一到 `reasoning_effort`);
    // 未指定时**连键都不加**,让上游自行决定。
    const reasoningEffort = reasoningEffortOf(body);
    return {
        model: String(body.model ?? ""),
        messages: Array.isArray(body.messages) ? body.messages : [],
        stream,
        temperature: body.temperature,
        max_tokens: mtClient,
        maxTokensClient: mtClient,
        top_p: body.top_p,
        stop: body.stop,
        tools: body.tools,
        tool_choice: body.tool_choice,
        ...(reasoningEffort === undefined ? {} : { reasoning_effort: reasoningEffort }),
        extra: {},
    };
}
//# sourceMappingURL=wire.js.map