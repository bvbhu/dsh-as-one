/**
 * 上游请求体与身份 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:把网关侧的 {@link UpstreamRequest} 翻译成各家上游要的报文与头 ——
 * 会话/缓存路由键、协议分派(trae / workbuddy / openai-compat)、图片桥预检、
 * 视觉判据。这一层**不碰**网络,只做形状变换,所以能单独看、单独测。
 */
import type { UpstreamRequest } from "@as-one/core/src/gateway/types.js";
import type { ChainItem } from "@as-one/core/src/scheduler/engine.js";
import type { ChainItem as RouterChainItem } from "@as-one/core/src/router/types.js";
/**
 * 合并请求头,防大小写重复(如 `Content-Type` 与 `content-type`)。
 *
 * 连接器(如 trae 的 build_headers)已自带 `Content-Type`/`Accept`,若这里再
 * 拼一个 `"content-type"` 小写键,Node fetch 会把两者合并成
 * `content-type: application/json, application/json`,trae 上游直接 400
 * `binding: expr_path=usage, cause=missing required parameter`(实测)。
 *
 * @param headers 连接器返回的请求头(可能含其中任一大小写)
 * @returns 只保留一种大小写、未被覆盖的头对象
 */
export declare function mergeHeaders(headers: Record<string, string>): Record<string, string>;
/**
 * 上游网关请求头:JSON 请求体 + 连接器头,大小写去重。
 */
export declare function upstreamHeaders(headers: Record<string, string>): Record<string, string>;
export declare function sessionOf(req: UpstreamRequest): string | undefined;
/**
 * **缓存路由键**(billion-context 的 `prompt_cache_key`)—— 端点亲和的**首选**键。
 *
 * 它表达的是「这一批请求前缀相同」,比会话号更贴近上游前缀缓存的命中条件:
 * 同一前缀 → 同一推理节点 → 缓存命中。所以它在路由里的优先级**高于** `session_id`。
 *
 * ⚠️ 它**绝不进上游 body**(上游见键即 400)—— 只在网关内部用。
 */
export declare function cacheRoutingKeyOf(req: UpstreamRequest): string | undefined;
/** 本轮用来做会话/缓存亲和的键:缓存路由键优先,回落会话号。 */
export declare function affinityKeyOf(req: UpstreamRequest): string | undefined;
/**
 * 调度器链(engine ChainItem,端点=Endpoint 类实例) → router 链
 * (chainItemFrom 构造,端点经 withEndpointViews 挂上不可枚举视图)。
 * 字段映射以 engine Endpoint 的 toData()/可公开字段为准,全部显式搬运。
 */
export declare function toRouterChain(chain: readonly ChainItem[]): RouterChainItem[];
/** 每次请求新生成 completion id / created(与 Nexus 的 chatcmpl-{ts:x} 同款)。 */
export declare function completionIdOf(): string;
export declare function createdOf(): number;
/**
 * ⚠️ 归属判定已移到 core 的 `connectors/workbuddy-gate.ts`(有 vitest 钉死)。
 *
 * 判据只有一条:{@link isWorkbuddyWire}(`protocol`)—— `protocol === "workbuddy"`。
 * 它同时决定「走不走 workbuddy 线格式」「挂不挂渠道校验闸门」「改不改提示词」。
 *
 * ⚠️ 2026-10-31 用户定案,**收回 2026-10-28 的「按名字放宽」**:名字带
 * workbuddy/wb 但 protocol=openai 的 provider(如用户自建的 `workbuddy_yn`,
 * base_url 指向转售站)一律走纯 OpenAI 形状、不挂闸门、不改提示词 ——
 * 上游已把那个指纹问题解决掉了。
 */
/** 请求体按协议构建(openai 用通用 bodyFor;trae/workbuddy/sensenova 走 wire)。 */
export declare function bodyForProtocol(providerId: string, protocol: string, req: UpstreamRequest, creds: Record<string, unknown>): Record<string, unknown>;
/** 通用 OpenAI 请求体(gateway 内部键 session_id 必须摘除)。 */
export declare function bodyFor(req: UpstreamRequest): Record<string, unknown>;
/**
 * 这条消息里有没有图 —— 与图像桥的判定**同一口径**(`image_url` / `image` 块)。
 *
 * ⚠️ 以前只认 `image_url`,而连接器也接受 `image` 形态 —— 于是「图像桥认为有图、
 * 选路认为没图」,桥接了但请求仍按非视觉选路,图白转了。
 */
export declare function hasVision(messages: unknown[]): boolean;
