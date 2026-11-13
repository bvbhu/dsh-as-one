/**
 * 对端准备与响应分类 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:按 provider 协议准备一次上游调用的「对端」形状(URL / 头 / 身份 /
 * 连接器钩子),以及把上游响应归类成功/可重试/不可重试。这里是 workbuddy
 * 渠道闸门与 sensenova 账号池钩子的挂点。
 */

import {
  RAW_BODY_MAX,
  UpstreamError,
  UpstreamErrorKind,
  type Upstream,
  type UpstreamRawResponse,
} from "@as-one/core/src/gateway/types.js";
import type { ChainItem as RouterChainItem } from "@as-one/core/src/router/types.js";
import type { CredentialVault } from "@as-one/core/src/config/credentials.js";
import { getConnector } from "@as-one/core/src/connectors/index.js";
import { resolveChatUrl as resolveTraeChatUrl } from "@as-one/core/src/connectors/trae-wire.js";
import { resolveWorkbuddyChatUrl } from "@as-one/core/src/connectors/workbuddy-wire.js";
import { classify_openai_error } from "@as-one/core/src/connectors/openai-compat.js";
import { DEFAULT_BASE_URL as SENSENOVA_DEFAULT_BASE_URL } from "@as-one/core/src/connectors/sensenova.js";
import { MINIMAX_BASE_CN, MINIMAX_BASE_GLOBAL } from "@as-one/core/src/connectors/minimax-wire.js";
import { MINIMAX_LLM_PATH } from "@as-one/core/src/connectors/minimax.js";
import {
  QODER_DEFAULT_HEADERS,
  QODER_REGION_CONFIGS,
  type QoderRegion,
} from "@as-one/core/src/connectors/qoder-wire.js";
import { regionOfCreds } from "@as-one/core/src/connectors/qoder.js";
import {
  channelRejectMessage,
  isChannelRejectDetail,
  isWorkbuddyWire,
} from "@as-one/core/src/connectors/workbuddy-gate.js";
import { upstreamHeaders } from "./gateway-upstream-body.js";
import { CONNECTOR_KIND_TO_GATEWAY, toGatewayError } from "./gateway-upstream-errors.js";

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
export async function connectorExtra(
  vault: CredentialVault,
  provider: string,
  username: string,
): Promise<Record<string, unknown>> {
  try {
    const cred = await vault.get(provider, username);
    const raw = (cred?.raw ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const region = raw["region"];
    if (typeof region === "string" && region.trim() !== "") out.region = region.trim();
    // 透传上游身份派生可覆盖的字段(Nexus extras:uid/domain/enterprise_id/
    // machine_id/device_id/api_base + user_id);连接器的 resolve_identity /
    // build_chat_headers 只在字段存在时使用,多传无害。trae 凭据 raw 用
    // user_id(计费/签到接口的 x-uid 需要它),workbuddy 用 uid,两者都透传。
    for (const key of ["uid", "user_id", "domain", "enterprise_id", "machine_id", "device_id", "api_base"]) {
      const v = raw[key];
      if (typeof v === "string" && v.trim() !== "") out[key] = v.trim();
    }
    return out;
  } catch {
    // 读不到凭据 raw 不该让请求失败:连接器有 token 兜底判定。
    return {};
  }
}

/** 账号池运行时(网关侧只用 name 做记账出口的键)。 */
export type PoolRuntime = { name: string };

/** sensenova 连接器上、网关侧只用到的一个方法(记账出口)。 */
export type SnConnector = { recordSpendFor(username: string, usage: unknown, ttftMs: number): void };

/**
 * sensenova 专用:走连接器账号池调度打一次上游。
 *
 * 与普通 fetch 的区别:选号/429 同号硬等(内部等待,不让客户端重试)/
 * 换号全在连接器内完成 —— 网关侧只看到最终那次 Response。
 */
export async function runSensenova(
  peer: Peer,
  body: Record<string, unknown>,
  model: string,
  signal: AbortSignal,
): Promise<{ res: Response; runtime: import("@as-one/core/src/connectors/sensenova.js").SensenovaAccountRuntime }> {
  const connector = peer.connector as unknown as {
    runWithAccount(
      url: string,
      body: Record<string, unknown>,
      model: string,
      creds: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<{ res: Response; runtime: import("@as-one/core/src/connectors/sensenova.js").SensenovaAccountRuntime }>;
    recordSpendFor(username: string, usage: unknown, ttftMs: number): void;
  };
  // ⚠️ signal 必须往下传:连接器内部的 429 硬等/换号循环也要能被客户端断开打断,
  // 否则断开的请求会一直占着并发槽位(租约泄漏)。
  return connector.runWithAccount(peer.url, body, model, peer.creds, signal);
}

/**
 * Qoder 专用:走连接器`runWithAccount` 打一次上游(cosy 模板 + 按 body 签名)。
 *
 * 与普通 fetch 的差别比 sensenova 更大:Qoder 的**请求体由连接器自己组**
 * (固定模板 + 每请求签名覆盖 body),所以网关这层只看得到合成的 Response ——
 * 它是一段本地 SSE(已翻译成 OpenAI chunk),`iterUpstreamChunks` 按 openai
 * 口径消费即可。真正的错误在合成流的注释行与 `QoderUpstreamError` 里。
 */
export async function runQoder(
  peer: Peer,
  body: Record<string, unknown>,
  model: string,
  signal: AbortSignal,
): Promise<{ res: Response; runtime: PoolRuntime }> {
  const connector = peer.connector as unknown as {
    runWithAccount(
      url: string,
      body: Record<string, unknown>,
      model: string,
      creds: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<{ res: Response; runtime: PoolRuntime }>;
    recordSpendFor(username: string, usage: unknown, ttftMs: number): void;
  };
  if (connector === undefined || typeof connector.runWithAccount !== "function") {
    throw new UpstreamError(UpstreamErrorKind.Auth, "Qoder 连接器未注册(protocol=qoder)", {
      statusCode: 500,
    });
  }
  /**
   * 模型键取 `body.model`(= 端点真名),`model` 参数只作兜底。
   *
   * Qoder 连接器把这个值**逐字**写进 `model_config.key` 发给上游,上游只认裸
   * 模型键(`qfmodel`):收到 `qoder/qfmodel`(客户端的直连名)或 `auto`(逻辑
   * 模型名)一律回 `403 code:112 + pricingUrl` —— 报文长得像「欠费」,实际是
   * 「没有这个模型」,非常容易被误判成额度用完。
   *
   * 网关已经在 `bodyForProtocol` 里把 `body.model` 换成了端点真名,所以这里以
   * 它为准;调用方传错名字(2026-11-02 实测:两处调用都传了 `req.model`)不会
   * 再把请求打死。
   */
  const key = typeof body["model"] === "string" && body["model"] !== "" ? body["model"] : model;
  return connector.runWithAccount(peer.url, body, key, peer.creds, signal);
}

/**
 * WorkBuddy **首用自检**的注入形状(装配层实现,见
 * `@as-one/core/connectors/workbuddy-selfcheck` 的 `createWorkbuddySelfCheck`)。
 *
 * 语义:`ok:false` ⇒ **不许发这次对话请求**(目前只有「11140 账号被限」会这样),
 * 网关直接把 message 当认证类错误抛出,错误出口据此触发「物理删除凭据 + 熔断」。
 */
export type WorkbuddySelfCheckFn = (input: {
  username: string;
  creds: { token: string; region?: string; uid?: string; enterpriseId?: string };
}) => Promise<{ ok: boolean; banned: boolean; message: string }>;

export interface PreparePeerOptions {
  /** WorkBuddy 首用自检(缺省 = 不探,保持旧行为;装配层生产环境必注入)。 */
  selfCheck?: WorkbuddySelfCheckFn | undefined;
}

export async function preparePeer(
  item: RouterChainItem,
  vault: CredentialVault,
  options: PreparePeerOptions = {},
): Promise<Peer> {
  const ep = item.endpoint;
  const provider = ep.provider;
  const username = ep.credentialKey[1];
  const secret = await vault.secret(provider, username);
  const connector = getConnector(ep.protocol);
  const extra = await connectorExtra(vault, provider, username);

  const protocol = ep.protocol;
  const baseUrl = (ep.baseUrl || "").trim().replace(/\/+$/, "");
  const creds: Record<string, unknown> = {
    apiKey: secret ?? undefined,
    username: secret == null ? username : undefined,
    base_url: baseUrl,
    ...extra,
  };

  let url: string;
  const region = ep.region ?? undefined;
  if (protocol === "trae") {
    url = resolveTraeChatUrl(baseUrl || undefined, region, creds);
  } else if (isWorkbuddyWire(protocol)) {
    // 只有 workbuddy 协议走 workbuddy 端点(区域端点 + /v2/chat/completions);
    // base_url 显式配了就尊重它(用户自建网关入口的常见形态)。
    url = resolveWorkbuddyChatUrl(baseUrl || undefined, (extra["region"] as string | undefined) ?? region);
  } else if (protocol === "sensenova") {
    const base = (baseUrl || SENSENOVA_DEFAULT_BASE_URL).replace(/\/+$/, "");
    url = `${base}/chat/completions`;
  } else if (protocol === "minimax") {
    // MiniMax 直连 LLM(Anthropic Messages)。
    //
    // ⚠️ 与签到/额度那套 `/minimax-cloud/api/v1/*` **不是同一条路**:这里只认
    // Bearer,不签名、不带设备查询串(2026-11-08 真机实测 200)。把 yy/x-signature
    // 那一套搬过来反而 401。
    const mmRegion = (typeof extra["region"] === "string" ? extra["region"] : region) ?? "";
    const fallback = mmRegion === "global" ? MINIMAX_BASE_GLOBAL : MINIMAX_BASE_CN;
    const base = (baseUrl || fallback).replace(/\/+$/, "");
    url = `${base}${MINIMAX_LLM_PATH}`;
  } else if (protocol === "qoder") {
    // Qoder:base_url 可被用户覆盖(自建反代),缺省取区域 cosy 网关;
    // 路径固定是 chatPath(base_url 只写到 host)。
    const qRegion: QoderRegion = regionOfCreds(creds, "qoder");
    const cfg = QODER_REGION_CONFIGS[qRegion];
    const base = (baseUrl || cfg.gateway).replace(/\/+$/, "");
    url = `${base}${cfg.chatPath}`;
  } else {
    // openai 兼容与未知协议:base_url 已含 /v1,直接拼 /chat/completions。
    url = `${baseUrl || ""}/chat/completions`;
  }

  let headers: Record<string, string> = {};
  let connectorRef = connector;

  // ⚠️ **首用自检**(2026-11-08 用户定案 A4):新账号第一次被选中时,先打一个
  // **只读**计费探针确认钥匙还灵不灵,再决定要不要发这次对话请求。
  // 为什么在这里:`preparePeer` 是「这一轮确定用这个账号」之后、真正发请求之前的
  // 唯一公共收口(stream / complete 都走它)。
  // 结论三态:ok → 继续;11140 → 抛认证类错误(出口会删凭据 + 熔断);其它 → 放行。
  if (isWorkbuddyWire(protocol) && options.selfCheck) {
    const verdict = await options.selfCheck({
      username,
      creds: {
        token: secret ?? "",
        ...(typeof extra["region"] === "string" ? { region: extra["region"] } : {}),
        ...(typeof extra["uid"] === "string" ? { uid: extra["uid"] } : {}),
        ...(typeof extra["enterprise_id"] === "string"
          ? { enterpriseId: extra["enterprise_id"] }
          : {}),
      },
    });
    if (!verdict.ok) {
      // 消息里必须带 `code 11140`:网关错误出口与熔断器都按这个串识别。
      throw new UpstreamError(UpstreamErrorKind.Auth, verdict.message, { statusCode: 403 });
    }
  }

  if (protocol === "qoder") {
    // ⚠️ 不能走 getToken:Qoder 的 getToken 会真打一次上游拉目录(浪费额度 +
    // 多一次网络往返),而真正的签名头由连接器在 runWithAccount 里按 body 生成。
    headers = { ...QODER_DEFAULT_HEADERS };
    return { url, headers, connector: connectorRef, creds };
  }
  if (connector) {
    try {
      const token = await connector.getToken(creds as never);
      headers = connector.decorateRequest({ headers: {} }, token, creds as never).headers ?? {};
    } catch (err) {
      // getToken 失败:把连接器错误翻成网关 UpstreamError(认证类),不外泄内部错误。
      throw toGatewayError(err);
    }
  } else {
    // 无连接器(未知协议):以 secret 直读为 Bearer,给一次机会。
    if (secret) headers.Authorization = `Bearer ${secret}`;
    connectorRef = undefined;
  }

  return { url, headers, connector: connectorRef, creds };
}

/** trae 端点 URL:base(显式 > extra.api_base > 区域默认)+ CHAT_PATH。 */
export async function classifyResponse(
  res: Response,
  connector: import("@as-one/core/src/connectors/index.js").AuthConnector | undefined,
): Promise<UpstreamError> {
  const text = await res.text();
  let body: unknown = text;
  let parsed = false;
  try {
    body = JSON.parse(text);
    parsed = true;
  } catch {
    /* 保持原始文本 */
  }
  const detail =
    typeof body === "object" && body !== null
      ? ((body as { error?: { message?: string } }).error?.message ??
        (body as { detail?: string }).detail ??
        text.slice(0, 200))
      : text.slice(0, 200);

  // 上游原件:客户端该看到的是这段原文,不是我们的转述(用户 m36329)。
  const raw = rawResponseOf(res, text, parsed ? body : undefined);

  // 优先走连接器分类(可区分 auth_challenge / pool_saturated 等)。
  // ⚠️ 响应头一并交给连接器:`Retry-After` 是「上游给的冷却时长」的
  // 另一个常见住处(OpenAI 走这里,clawbrain 走 body 的 retry_after) ——
  // 两个都不读,就只能永远按全局 15 分钟熔断。
  if (connector) {
    try {
      const ce = connector.classifyError(res.status, body, headerRecord(res.headers));
      const kind = CONNECTOR_KIND_TO_GATEWAY[ce.kind] ?? UpstreamErrorKind.Upstream;
      return new UpstreamError(kind, ce.message || detail, {
        statusCode: ce.httpStatus || res.status,
        retryAfter: ce.retryAfter,
        raw,
      });
    } catch {
      /* 分类器失败则回落 fromStatus */
    }
  }
  // 无连接器(或连接器分类抛错):通用 OpenAI 兼容分类,同样读 body + 响应头。
  const fallback = classify_openai_error(res.status, body, headerRecord(res.headers));
  const kind = CONNECTOR_KIND_TO_GATEWAY[fallback.kind] ?? UpstreamErrorKind.Upstream;
  return new UpstreamError(kind, fallback.message || detail, {
    statusCode: fallback.httpStatus || res.status,
    retryAfter: fallback.retryAfter,
    raw,
  });
}

/**
 * 上游错误响应 → {@link UpstreamRawResponse}(逐字透传用的原件)。
 *
 * 超长体按 {@link RAW_BODY_MAX} 截断 —— 真实的错误体是几百字节量级,留个上限
 * 只是不让异常上游把内存撑爆。
 */
export function rawResponseOf(
  res: Response,
  text: string,
  json: unknown | undefined,
): UpstreamRawResponse {
  const raw: UpstreamRawResponse = {
    text: text.length > RAW_BODY_MAX ? text.slice(0, RAW_BODY_MAX) : text,
    status: res.status,
  };
  if (json !== undefined) raw.json = json;
  const contentType = res.headers.get("content-type");
  if (contentType !== null && contentType !== "") raw.contentType = contentType;
  return raw;
}

/** fetch 的 Headers → 普通对象(连接器的 classifyError 只吃普通字典)。 */
export function headerRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

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
export async function postWorkbuddyWithGate(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal,
  connector: import("@as-one/core/src/connectors/index.js").AuthConnector | undefined,
  /**
   * 注入 fetch(测试用)。缺省走全局 `fetch`。
   *
   * 为什么要这个口子:这条路径以前没有可测性 —— 「11128 只打一次上游」
   * 正是 2026-11-08 快速止损定案的核心断言,没有注入就只能靠真实上游验证。
   */
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const originalMessages = Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
  const res = await fetchFn(url, {
    method: "POST",
    headers: upstreamHeaders(headers),
    body: JSON.stringify(body),
    signal,
  });
  if (res.ok) return res;

  // 失败 → 分类。
  const err = await classifyResponse(res, connector);
  if (!isChannelRejectDetail(err.detail)) {
    // 非渠道校验(限流 / 5xx / 认证…):**原样抛**,走既有分类路径。
    return Promise.reject(err);
  }
  // ⚡ **渠道校验(11128)= 快速止损**(2026-11-08 用户定案):命中即**立刻返回**,
  // 不再做「中性头 → 零宽扰动」的改造重试。
  //
  // 为什么:改造阶梯是「猜上游拦的是哪一段指纹」,但 11128 **按 code 认一族**
  // (上游把同一个码复用于 提示指纹 / conversation id missing / first message is
  // not system prompt 三个门,见 workbuddy-gate.ts 的说明)——既然按码认,改造
  // messages 大概率改不动。而每一级改造都是一次**真实上游请求**:白打两轮既
  // 拖慢首字,又多点两次风控采样(渠道校验本身就是风控行为)。
  //
  // 保留 detail 里的宿主原始命中开头(排查用),但 **raw 保持上游原文**
  // —— 客户端看到的仍是上游那句 11128,不是我们的转述。
  return Promise.reject(
    new UpstreamError(err.kind, `${channelRejectMessage(originalMessages)}\n${err.detail}`, {
      statusCode: err.httpStatus,
      ...(err.retryAfter !== undefined ? { retryAfter: err.retryAfter } : {}),
      ...(err.raw !== undefined ? { raw: err.raw } : {}),
    }),
  );
}
