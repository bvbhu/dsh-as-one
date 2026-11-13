/**
 * 上游请求体与身份 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:把网关侧的 {@link UpstreamRequest} 翻译成各家上游要的报文与头 ——
 * 会话/缓存路由键、协议分派(trae / workbuddy / openai-compat)、图片桥预检、
 * 视觉判据。这一层**不碰**网络,只做形状变换,所以能单独看、单独测。
 */

import type { UpstreamRequest } from "@as-one/core/src/gateway/types.js";
import type { ChainItem } from "@as-one/core/src/scheduler/engine.js";
import { chainItemFrom } from "@as-one/core/src/router/types.js";
import type { ChainItem as RouterChainItem } from "@as-one/core/src/router/types.js";
import { identityFromExtra, prepareTraeRequest } from "@as-one/core/src/connectors/trae-wire.js";
import { buildWorkbuddyBody } from "@as-one/core/src/connectors/workbuddy-wire.js";
import { imagePartIndices } from "@as-one/core/src/gateway/image-bridge.js";
import type { BridgeMessage } from "@as-one/core/src/gateway/image-bridge.js";
import { isWorkbuddyWire } from "@as-one/core/src/connectors/workbuddy-gate.js";
import { toAnthropicRequest } from "@as-one/core/src/connectors/minimax-llm.js";
import { minimaxUpstreamModelOf } from "@as-one/core/src/connectors/minimax-models.js";
import { CACHE_ROUTING_KEY_FIELD } from "@as-one/core/src/gateway/request-fields.js";

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
export function mergeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    const existing = Object.keys(out).find((k) => k.toLowerCase() === lower);
    if (existing === undefined) {
      out[key] = value;
    } else {
      // 同名字段以键序靠后的为准(调用方字典序覆盖)
      out[existing] = value;
    }
  }
  return out;
}

/**
 * 上游网关请求头:JSON 请求体 + 连接器头,大小写去重。
 */
export function upstreamHeaders(headers: Record<string, string>): Record<string, string> {
  return mergeHeaders({ "content-type": "application/json", ...headers });
}

export function sessionOf(req: UpstreamRequest): string | undefined {
  const v = req.extra?.session_id;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * **缓存路由键**(billion-context 的 `prompt_cache_key`)—— 端点亲和的**首选**键。
 *
 * 它表达的是「这一批请求前缀相同」,比会话号更贴近上游前缀缓存的命中条件:
 * 同一前缀 → 同一推理节点 → 缓存命中。所以它在路由里的优先级**高于** `session_id`。
 *
 * ⚠️ 它**绝不进上游 body**(上游见键即 400)—— 只在网关内部用。
 */
export function cacheRoutingKeyOf(req: UpstreamRequest): string | undefined {
  const v = req.prompt_cache_key;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** 本轮用来做会话/缓存亲和的键:缓存路由键优先,回落会话号。 */
export function affinityKeyOf(req: UpstreamRequest): string | undefined {
  return cacheRoutingKeyOf(req) ?? sessionOf(req);
}

/**
 * 调度器链(engine ChainItem,端点=Endpoint 类实例) → router 链
 * (chainItemFrom 构造,端点经 withEndpointViews 挂上不可枚举视图)。
 * 字段映射以 engine Endpoint 的 toData()/可公开字段为准,全部显式搬运。
 */
export function toRouterChain(chain: readonly ChainItem[]): RouterChainItem[] {
  return chain.map((item) => {
    const ep = item.endpoint;
    return chainItemFrom({
      endpoint: {
        endpointId: ep.endpointId,
        provider: ep.provider,
        model: ep.model,
        credentialKey: ep.credentialKey as readonly [string, string],
        protocol: ep.protocol,
        baseUrl: ep.baseUrl,
        region: ep.region,
        concurrency: ep.concurrency,
        supportsVision: ep.supportsVision,
        maxInputTokens: ep.maxInputTokens,
        maxOutputTokens: ep.maxOutputTokens,
        cooldownUntil: ep.cooldownUntil,
      },
      priority: item.priority,
      blackout: item.blackout,
      strategy: item.strategy,
      // ⚠️ degraded 必须搬过去:least-busy / balanced 由 Router 按实时在途裁决,
      // 完全不看链序 —— 丢了它,用户在 P4 里配的「少用」对这两种策略就失效
      // (2026-11-07 修 P4 未生效的一部分)。
      degraded: item.degraded,
      // ⚠️ direct 必须搬过去:router 的 plan(ignoreCooldown)与
      // commit(acquireDirect 抢占)都按它判定是不是「真实模型直连」。
      direct: item.direct,
    });
  });
}

/** 每次请求新生成 completion id / created(与 Nexus 的 chatcmpl-{ts:x} 同款)。 */
export function completionIdOf(): string {
  return `chatcmpl-${Math.floor(performance.now()).toString(16)}`;
}

export function createdOf(): number {
  return Math.floor(Date.now() / 1000);
}

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
export function bodyForProtocol(
  providerId: string,
  protocol: string,
  req: UpstreamRequest,
  creds: Record<string, unknown>,
): Record<string, unknown> {
  // 思考强度:`req.reasoning_effort` **已经是上游要的取值** ——
  // 网关按库里的档位表钳制时选中的就是表里那行原文(`xhigh`/`light`/`extra_high`…),
  // 所以这里不做任何翻译,只管**按协议决定字段落在哪儿**:
  // - `minimax` 换成 Anthropic 的 `output_config.effort`(规范字段整个丢掉);
  // - 其余协议仍是 `reasoning_effort`,原样透传。
  if (protocol === "minimax") {
    // MiniMax 直连 LLM 是 **Anthropic Messages 方言**(`/mavis/api/v1/llm/v1/messages`),
    // 不是 OpenAI 形状。转换集中在 core 的 minimax-llm.ts,这里只负责把端点真名
    // 换成上游模型串(`minimax-m3.1-flash` → `MiniMax-M3.1-Flash`)。
    // ⚠️ 转换器恒写 `stream: true`:网关的非流式请求也走 SSE 聚合(与 sensenova 同口径)。
    return toAnthropicRequest(
      req as unknown as Record<string, unknown>,
      minimaxUpstreamModelOf(String(req.model ?? "")),
      typeof req.reasoning_effort === "string" ? req.reasoning_effort : undefined,
    );
  }
  if (protocol === "trae") {
    const identity = identityFromExtra(creds["apiKey"] as string | undefined ?? "", creds);
    return prepareTraeRequest({
      req,
      identity,
      baseUrl: creds["base_url"] as string | undefined,
      region: creds["region"] as string | undefined,
      extra: creds,
    }).body;
  }
  if (isWorkbuddyWire(protocol) || protocol === "sensenova") {
    // ⚠️ sensenova 也必须走这个构造器:**恒 stream:true**(网关侧 complete()
    // 走 SSE 聚合,若发 stream:false 上游回 JSON,聚合器会解析失败)——
    // 与 Nexus sensenova.py `_build_body` 的 `body["stream"] = True` 同款。
    // 它顺带带上 stream_options.include_usage(tpm 记账的载体)。
    //
    // ⚠️ 2026-10-29:只有 `protocol === "workbuddy"` 走这里。provider 名里带
    // workbuddy/wb 但 protocol 是 openai 的(如用户自建的 workbuddy_yn 指向
    // hyperai),必须走下面的通用 OpenAI 形状 —— 塞 workbuddy 报文会 401。
    return buildWorkbuddyBody(req);
  }
  // openai 兼容与未知协议:通用 OpenAI 形状。
  return bodyFor(req);
}

/** 通用 OpenAI 请求体(gateway 内部键 session_id 必须摘除)。 */
export function bodyFor(req: UpstreamRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages as unknown[],
    stream: req.stream,
  };
  // ⚠️ **流式必须向客户端要 usage**(对齐 Nexus `base.py` to_body:
  // `if self.stream: body["stream_options"] = {"include_usage": True}`):
  // 上游默认**不在流尾发 usage 块**,于是 forwardStream 收不到
  // completion_tokens → 请求日志与统计的 token 数全空、tps 无从计算
  // (分母没有 completion,或 0 兜底 → 面板显示个位数/null)。
  // workbuddy/trae 的 wire 已各自带,这里是 openai 兼容协议的同一口径。
  if (req.stream === true) {
    body.stream_options = { include_usage: true };
  }
  for (const key of [
    "temperature",
    "max_tokens",
    "top_p",
    "stop",
    "tools",
    "tool_choice",
    "reasoning_effort",
  ] as const) {
    const v = req[key];
    if (v !== undefined) body[key] = v;
  }
  if (req.extra) {
    for (const [k, v] of Object.entries(req.extra)) {
      // ⚠️ `session_id` 与 `prompt_cache_key` 都是**网关内部键**,绝不进上游
      // 报文体:`session_id` 是亲和键,`prompt_cache_key` 是缓存路由键
      // (上游见键即 400,实测)。
      if (k === "session_id" || k === CACHE_ROUTING_KEY_FIELD) continue;
      if (v !== undefined) body[k] = v;
    }
  }
  // ⚠️ 双保险:`prompt_cache_key` 也不从 `req` 上带进 body(它本就不在这条
  // 白名单里,但显式跳过能把「以后有人把它加进白名单」的坑堵死)。
  delete body[CACHE_ROUTING_KEY_FIELD];
  return body;
}

/**
 * 这条消息里有没有图 —— 与图像桥的判定**同一口径**(`image_url` / `image` 块)。
 *
 * ⚠️ 以前只认 `image_url`,而连接器也接受 `image` 形态 —— 于是「图像桥认为有图、
 * 选路认为没图」,桥接了但请求仍按非视觉选路,图白转了。
 */
export function hasVision(messages: unknown[]): boolean {
  const asBridge = messages as unknown as BridgeMessage[];
  if (imagePartIndices(asBridge).length > 0) return true;
  return messages.some((m) => {
    const content = (m as { content?: unknown })?.content;
    return typeof content === "string" && content.includes("data:image");
  });
}
