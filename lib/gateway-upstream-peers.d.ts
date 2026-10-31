/**
 * 对端准备与响应分类 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:按 provider 协议准备一次上游调用的「对端」形状(URL / 头 / 身份 /
 * 连接器钩子),以及把上游响应归类成功/可重试/不可重试。这里是 workbuddy
 * 渠道闸门与 sensenova 账号池钩子的挂点。
 */
import { UpstreamError, type UpstreamRawResponse } from "@as-one/core/src/gateway/types.js";
import type { ChainItem as RouterChainItem } from "@as-one/core/src/router/types.js";
import type { CredentialVault } from "@as-one/core/src/config/credentials.js";
export interface Peer {
    url: string;
    headers: Record<string, string>;
    connector: import("@as-one/core/src/connectors/index.js").AuthConnector | undefined;
    /** 连接器附加字段(raw 里的 region/身份字段 + api_key/base_url 快照)。 */
    creds: Record<string, unknown>;
}
/**
 * 连接器附加字段:凭据 raw 里的区域 / 身份字段。
 *
 * ⚠️ **不能拿 provider id 当 region**(曾经的 bug):trae 的
 * `resolve_api_base` / workbuddy 的 `normalize_region` 需要真正的区域值
 * (`trae`: cn/ai;`workbuddy`: cn/global),provider id("trae"/"workbuddy")
 * 不在别名表里 → 归一回退默认区域 → CN 账号被打到国际主机。
 *
 * 真实区域存在**凭据 raw_json.region**(discover 导入/自动发现时写入,
 * 与 Nexus `AccountContext.region` 同源)。provider 表没有 region 列
 * (schema.sql L97-102),所以只能从凭据侧取。
 *
 * 拿不到区域时传 `undefined` 而不是空串:连接器各自有
 * `detect_region_from_token` 兜底(workbuddy 的 JWT iss 判定),
 * 空串会把「未知」错写成「空区域」。
 */
export declare function connectorExtra(vault: CredentialVault, provider: string, username: string): Promise<Record<string, unknown>>;
/** 账号池运行时(网关侧只用 name 做记账出口的键)。 */
export type PoolRuntime = {
    name: string;
};
/** sensenova 连接器上、网关侧只用到的一个方法(记账出口)。 */
export type SnConnector = {
    recordSpendFor(username: string, usage: unknown, ttftMs: number): void;
};
/**
 * sensenova 专用:走连接器账号池调度打一次上游。
 *
 * 与普通 fetch 的区别:选号/429 同号硬等(内部等待,不让客户端重试)/
 * 换号全在连接器内完成 —— 网关侧只看到最终那次 Response。
 */
export declare function runSensenova(peer: Peer, body: Record<string, unknown>, model: string, signal: AbortSignal): Promise<{
    res: Response;
    runtime: import("@as-one/core/src/connectors/sensenova.js").SensenovaAccountRuntime;
}>;
/**
 * Qoder 专用:走连接器`runWithAccount` 打一次上游(cosy 模板 + 按 body 签名)。
 *
 * 与普通 fetch 的差别比 sensenova 更大:Qoder 的**请求体由连接器自己组**
 * (固定模板 + 每请求签名覆盖 body),所以网关这层只看得到合成的 Response ——
 * 它是一段本地 SSE(已翻译成 OpenAI chunk),`iterUpstreamChunks` 按 openai
 * 口径消费即可。真正的错误在合成流的注释行与 `QoderUpstreamError` 里。
 */
export declare function runQoder(peer: Peer, body: Record<string, unknown>, model: string, signal: AbortSignal): Promise<{
    res: Response;
    runtime: PoolRuntime;
}>;
export declare function preparePeer(item: RouterChainItem, vault: CredentialVault): Promise<Peer>;
/** trae 端点 URL:base(显式 > extra.api_base > 区域默认)+ CHAT_PATH。 */
export declare function classifyResponse(res: Response, connector: import("@as-one/core/src/connectors/index.js").AuthConnector | undefined): Promise<UpstreamError>;
/**
 * 上游错误响应 → {@link UpstreamRawResponse}(逐字透传用的原件)。
 *
 * 超长体按 {@link RAW_BODY_MAX} 截断 —— 真实的错误体是几百字节量级,留个上限
 * 只是不让异常上游把内存撑爆。
 */
export declare function rawResponseOf(res: Response, text: string, json: unknown | undefined): UpstreamRawResponse;
/** fetch 的 Headers → 普通对象(连接器的 classifyError 只吃普通字典)。 */
export declare function headerRecord(headers: Headers): Record<string, string>;
/**
 * workbuddy 上游请求(带「渠道校验」闸门)。
 *
 * ⚠️ 2026-10-21 上游对 `system`/`assistant` 提示做**内容指纹扫描**(HTTP 400 /
 * code 11128),命中的请求换号/换区域拿到的仍是同一个 400 —— 所以通道拒绝
 * **不走换档**(bad_request 本来也不 failover),而是对同一端点逐级改造重试:
 *
 *   pass 0:原文(绝大多数请求一次通过,零成本)
 *   pass 1:门 A —— system/assistant 开头命中已知句式 → 前缀中性头
 *   pass 2:门 B —— 句读处插 U+200B 零宽空格,截断跨句中段指纹
 *
 * 三级全被拒才抛错,且错误信息带**宿主原始**的命中开头(镜像插件 #98:
 * 归一化后的 body 会把网关自己加的中性头误报成命中对象)。
 */
export declare function postWorkbuddyWithGate(url: string, headers: Record<string, string>, body: Record<string, unknown>, signal: AbortSignal, connector: import("@as-one/core/src/connectors/index.js").AuthConnector | undefined): Promise<Response>;
