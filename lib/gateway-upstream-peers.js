/**
 * 对端准备与响应分类 —— 从 gateway-upstream.ts 拆出(重构第八刀)。
 *
 * 职责:按 provider 协议准备一次上游调用的「对端」形状(URL / 头 / 身份 /
 * 连接器钩子),以及把上游响应归类成功/可重试/不可重试。这里是 workbuddy
 * 渠道闸门与 sensenova 账号池钩子的挂点。
 */
import { RAW_BODY_MAX, UpstreamError, UpstreamErrorKind, } from "@as-one/core/src/gateway/types.js";
import { getConnector } from "@as-one/core/src/connectors/index.js";
import { resolveChatUrl as resolveTraeChatUrl } from "@as-one/core/src/connectors/trae-wire.js";
import { resolveWorkbuddyChatUrl } from "@as-one/core/src/connectors/workbuddy-wire.js";
import { classify_openai_error } from "@as-one/core/src/connectors/openai-compat.js";
import { DEFAULT_BASE_URL as SENSENOVA_DEFAULT_BASE_URL } from "@as-one/core/src/connectors/sensenova.js";
import { QODER_DEFAULT_HEADERS, QODER_REGION_CONFIGS, } from "@as-one/core/src/connectors/qoder-wire.js";
import { regionOfCreds } from "@as-one/core/src/connectors/qoder.js";
import { channelRejectMessage, isChannelRejectDetail, isWorkbuddyWire, neutralizeChannelFingerprints, perturbChannelFingerprints, } from "@as-one/core/src/connectors/workbuddy-gate.js";
import { upstreamHeaders } from "./gateway-upstream-body.js";
import { CONNECTOR_KIND_TO_GATEWAY, toGatewayError } from "./gateway-upstream-errors.js";
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
export async function connectorExtra(vault, provider, username) {
    try {
        const cred = await vault.get(provider, username);
        const raw = (cred?.raw ?? {});
        const out = {};
        const region = raw["region"];
        if (typeof region === "string" && region.trim() !== "")
            out.region = region.trim();
        // 透传上游身份派生可覆盖的字段(Nexus extras:uid/domain/enterprise_id/
        // machine_id/device_id/api_base + user_id);连接器的 resolve_identity /
        // build_chat_headers 只在字段存在时使用,多传无害。trae 凭据 raw 用
        // user_id(计费/签到接口的 x-uid 需要它),workbuddy 用 uid,两者都透传。
        for (const key of ["uid", "user_id", "domain", "enterprise_id", "machine_id", "device_id", "api_base"]) {
            const v = raw[key];
            if (typeof v === "string" && v.trim() !== "")
                out[key] = v.trim();
        }
        return out;
    }
    catch {
        // 读不到凭据 raw 不该让请求失败:连接器有 token 兜底判定。
        return {};
    }
}
/**
 * sensenova 专用:走连接器账号池调度打一次上游。
 *
 * 与普通 fetch 的区别:选号/429 同号硬等(内部等待,不让客户端重试)/
 * 换号全在连接器内完成 —— 网关侧只看到最终那次 Response。
 */
export async function runSensenova(peer, body, model, signal) {
    const connector = peer.connector;
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
export async function runQoder(peer, body, model, signal) {
    const connector = peer.connector;
    if (connector === undefined || typeof connector.runWithAccount !== "function") {
        throw new UpstreamError(UpstreamErrorKind.Auth, "Qoder 连接器未注册(protocol=qoder)", {
            statusCode: 500,
        });
    }
    return connector.runWithAccount(peer.url, body, model, peer.creds, signal);
}
export async function preparePeer(item, vault) {
    const ep = item.endpoint;
    const provider = ep.provider;
    const username = ep.credentialKey[1];
    const secret = await vault.secret(provider, username);
    const connector = getConnector(ep.protocol);
    const extra = await connectorExtra(vault, provider, username);
    const protocol = ep.protocol;
    const baseUrl = (ep.baseUrl || "").trim().replace(/\/+$/, "");
    const creds = {
        apiKey: secret ?? undefined,
        username: secret == null ? username : undefined,
        base_url: baseUrl,
        ...extra,
    };
    let url;
    const region = ep.region ?? undefined;
    if (protocol === "trae") {
        url = resolveTraeChatUrl(baseUrl || undefined, region, creds);
    }
    else if (isWorkbuddyWire(protocol)) {
        // 只有 workbuddy 协议走 workbuddy 端点(区域端点 + /v2/chat/completions);
        // base_url 显式配了就尊重它(用户自建网关入口的常见形态)。
        url = resolveWorkbuddyChatUrl(baseUrl || undefined, extra["region"] ?? region);
    }
    else if (protocol === "sensenova") {
        const base = (baseUrl || SENSENOVA_DEFAULT_BASE_URL).replace(/\/+$/, "");
        url = `${base}/chat/completions`;
    }
    else if (protocol === "qoder") {
        // Qoder:base_url 可被用户覆盖(自建反代),缺省取区域 cosy 网关;
        // 路径固定是 chatPath(base_url 只写到 host)。
        const qRegion = regionOfCreds(creds, "qoder");
        const cfg = QODER_REGION_CONFIGS[qRegion];
        const base = (baseUrl || cfg.gateway).replace(/\/+$/, "");
        url = `${base}${cfg.chatPath}`;
    }
    else {
        // openai 兼容与未知协议:base_url 已含 /v1,直接拼 /chat/completions。
        url = `${baseUrl || ""}/chat/completions`;
    }
    let headers = {};
    let connectorRef = connector;
    if (protocol === "qoder") {
        // ⚠️ 不能走 getToken:Qoder 的 getToken 会真打一次上游拉目录(浪费额度 +
        // 多一次网络往返),而真正的签名头由连接器在 runWithAccount 里按 body 生成。
        headers = { ...QODER_DEFAULT_HEADERS };
        return { url, headers, connector: connectorRef, creds };
    }
    if (connector) {
        try {
            const token = await connector.getToken(creds);
            headers = connector.decorateRequest({ headers: {} }, token, creds).headers ?? {};
        }
        catch (err) {
            // getToken 失败:把连接器错误翻成网关 UpstreamError(认证类),不外泄内部错误。
            throw toGatewayError(err);
        }
    }
    else {
        // 无连接器(未知协议):以 secret 直读为 Bearer,给一次机会。
        if (secret)
            headers.Authorization = `Bearer ${secret}`;
        connectorRef = undefined;
    }
    return { url, headers, connector: connectorRef, creds };
}
/** trae 端点 URL:base(显式 > extra.api_base > 区域默认)+ CHAT_PATH。 */
export async function classifyResponse(res, connector) {
    const text = await res.text();
    let body = text;
    let parsed = false;
    try {
        body = JSON.parse(text);
        parsed = true;
    }
    catch {
        /* 保持原始文本 */
    }
    const detail = typeof body === "object" && body !== null
        ? (body.error?.message ??
            body.detail ??
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
        }
        catch {
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
export function rawResponseOf(res, text, json) {
    const raw = {
        text: text.length > RAW_BODY_MAX ? text.slice(0, RAW_BODY_MAX) : text,
        status: res.status,
    };
    if (json !== undefined)
        raw.json = json;
    const contentType = res.headers.get("content-type");
    if (contentType !== null && contentType !== "")
        raw.contentType = contentType;
    return raw;
}
/** fetch 的 Headers → 普通对象(连接器的 classifyError 只吃普通字典)。 */
export function headerRecord(headers) {
    const out = {};
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
export async function postWorkbuddyWithGate(url, headers, body, signal, connector) {
    const originalMessages = Array.isArray(body.messages) ? body.messages : [];
    let currentBody = body;
    for (let pass = 0; pass < 3; pass += 1) {
        const res = await fetch(url, {
            method: "POST",
            headers: upstreamHeaders(headers),
            body: JSON.stringify(currentBody),
            signal,
        });
        if (res.ok)
            return res;
        if (pass >= 2) {
            // 三级(原文/中性头/零宽扰动)全部结束仍未成功。**先看最后一级是不是
            // 渠道校验**:改造本身可能让请求过了校验、但撞上别的错(典型:账号额度
            // 耗尽 → 429 限流)。那种情况必须**原样抛限流**,别再拼「命中的提示
            // 开头」—— 用户看到的是混合文案、type 却是 rate_limit,完全对不上
            // (用户 2026-10-27 实测反馈)。
            const err = await classifyResponse(res, connector);
            if (!isChannelRejectDetail(err.detail)) {
                // 最后一级不是渠道校验(限流/5xx/认证…):原样抛,走既有分类路径。
                return Promise.reject(err);
            }
            // 三级全被渠道校验拒:内部 detail 带上宿主原始命中开头(排查用),但
            // **raw 保持上游原文** —— 客户端看到的仍是上游那句 11128,不是我们的转述。
            return Promise.reject(new UpstreamError(err.kind, `${channelRejectMessage(originalMessages)}\n${err.detail}`, {
                statusCode: err.httpStatus,
                ...(err.retryAfter !== undefined ? { retryAfter: err.retryAfter } : {}),
                ...(err.raw !== undefined ? { raw: err.raw } : {}),
            }));
        }
        const probe = await classifyResponse(res, connector);
        if (!isChannelRejectDetail(probe.detail)) {
            // 非通道拒绝(普通 4xx/5xx):原样抛,走既有分类路径。
            return Promise.reject(probe);
        }
        // 通道拒绝 → 逐级改造(buildWorkbuddyBody 恒 stream,只动 messages)。
        currentBody =
            pass === 0
                ? { ...body, messages: neutralizeChannelFingerprints(originalMessages) }
                : { ...body, messages: perturbChannelFingerprints(originalMessages) };
    }
    // 不可达(循环上限 3),留给类型系统。
    return Promise.reject(new UpstreamError(UpstreamErrorKind.BadRequest, channelRejectMessage(originalMessages), {
        statusCode: 400,
    }));
}
//# sourceMappingURL=gateway-upstream-peers.js.map