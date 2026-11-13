/**
 * Qoder 连接器（cosy 协议）—— PAT 凭据、流式 chat、目录/用量/签到数据面。
 *
 * ⚠️ Qoder **不是** OpenAI 兼容上游：请求体要按自定义 base64 编码、每个请求要带
 * cosy 签名（`md5(payloadB64 \n cosyKey \n date \n body \n path)`），凭据是 PAT
 * 先换 jobToken，再据此建 AES/RSA 会话。因此本连接器只实现「认证 + 数据面 +
 * 流式翻译」，报文体签名交给会话持有者，网关侧用 {@link QoderChatRequest} 直连。
 *
 * 区域：**只接国内版**（`qoder`，gateway.qoder.com.cn）。国际版已移除（用户定案
 * 2026-10-30），旧配置里的 `base_url` 指向 `api1.qoder.sh` 也一律按国内处理。
 *
 * 凭据只从 `creds.apiKey`（PAT，`pt-…`）或 `creds.refreshToken`（`drt-…`）取。
 *
 * @module connectors/qoder
 */

import {
  COSY_APPCODE,
  buildPayloadB64,
  composeBearer,
  cosyDateOf,
  cosyEncode,
  currentRfc1123Date,
  deriveFingerprint,
  identityFromJobToken,
  newCosySession,
  pathSigFrom,
  signLegacy,
  signRequest,
  type CosyAuthIdentity,
  type CosyFingerprint,
  type CosySessionContext,
} from "./qoder-cosy.js";
import {
  QODER_DEFAULT_HEADERS,
  QODER_REGION_CONFIGS,
  SASH_CLIENT_TYPE,
  SASH_USER_AGENT,
  applyModelKey,
  buildQoderMessages,
  classifyFailure,
  classifyHttpStatus,
  createChatBodyTemplate,
  deepestBusinessCode,
  extractLatestUserPrompt,
  isQoderRegion,
  jobTokenBody,
  parseCampaignFeed,
  parseModelCatalog,
  parseQoderFrame,
  parseStreamDelta,
  parseUsage,
  qoderErrorBlockOf,
  qoderErrorFrameOf,
  retryAfterMsOf,
  retryAfterMsOfHeader,
  sseDataPayload,
  type QoderCampaign,
  type QoderCatalogModel,
  type QoderChatTemplate,
  type QoderCheckinOutcome,
  type QoderRegion,
  type QoderRegionConfig,
  type QoderUsage,
  type UpstreamErrorKind,
} from "./qoder-wire.js";
import type {
  AuthConnector,
  ConnectorCredentials,
  RequestDecoration,
  TokenState,
  UpstreamErrorKind as CoreErrorKind,
  UpstreamRawResponse,
} from "./types.js";
import { UpstreamError, upstreamRawResponse } from "./types.js";

// ---------------------------------------------------------------------------
// JobToken
// ---------------------------------------------------------------------------

export interface QoderJobToken {
  id: string;
  name: string;
  userType: string;
  /** 秒。 */
  expireTime: number | undefined;
  securityOauthToken: string;
  refreshToken: string;
}

/** jobToken 交换响应 → jobToken（宽容：缺字段就留空，不编造）。 */
export function parseJobToken(payload: Record<string, unknown>): QoderJobToken {
  const data =
    typeof payload["data"] === "object" && payload["data"] !== null
      ? (payload["data"] as Record<string, unknown>)
      : payload;
  const str = (key: string): string => (typeof data[key] === "string" ? String(data[key]) : "");
  return {
    id: str("id") !== "" ? str("id") : str("uid"),
    name: str("name"),
    userType: str("userType") !== "" ? str("userType") : str("user_type"),
    expireTime:
      typeof data["expireTime"] === "number"
        ? (data["expireTime"] as number)
        : typeof data["expire_time"] === "number"
          ? (data["expire_time"] as number)
          : undefined,
    securityOauthToken:
      str("securityOauthToken") !== "" ? str("securityOauthToken") : str("security_oauth_token"),
    refreshToken: str("refreshToken") !== "" ? str("refreshToken") : str("refresh_token"),
  };
}

/**
 * Qoder 分类 → 核心 `UpstreamErrorKind` + 可重试性。
 *
 * 两套枚举的粒度不同：核心只有 `rate_limit/auth/upstream/bad_request/...`，
 * 而 Qoder 侧要区分「额度耗尽」（换账号有用、重试无用）与「限流」（等一会儿
 * 再试）。映射在这里集中一处，别散到调用点。
 */
export function toCoreErrorKind(kind: UpstreamErrorKind): { kind: CoreErrorKind; retryable: boolean } {
  switch (kind) {
    case "auth":
      return { kind: "auth", retryable: false };
    case "rate-limited":
      return { kind: "rate_limit", retryable: true };
    case "quota-exhausted":
      return { kind: "pool_exhausted", retryable: false };
    case "invalid-request":
      return { kind: "bad_request", retryable: false };
    case "content-policy":
      return { kind: "bad_request", retryable: false };
    case "transient":
      return { kind: "upstream", retryable: true };
    default:
      return { kind: "upstream", retryable: false };
  }
}

/** 上游错误（带原文，面板要展示最近错误原文）。 */
export class QoderUpstreamError extends UpstreamError {
  /** Qoder 侧细分分类（`quota-exhausted` 这类核心枚举里没有的）。 */
  readonly qoderKind: UpstreamErrorKind;
  readonly code: string | undefined;

  constructor(
    kind: UpstreamErrorKind,
    message: string,
    status = 0,
    code?: string,
    retryAfter?: number,
    /** 上游原件(有答复时带,网关出口逐字写回;用户 m36329)。 */
    raw?: UpstreamRawResponse,
  ) {
    const mapped = toCoreErrorKind(kind);
    super(mapped.kind, message, mapped.retryable, status, retryAfter, raw);
    this.qoderKind = kind;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// 会话持有
// ---------------------------------------------------------------------------

export interface QoderSessionHolder {
  session: CosySessionContext;
  fingerprint: CosyFingerprint;
  jobToken: QoderJobToken;
  /** sash 面专用令牌（`jt-…`）；jobToken 交换拿不到时为空串。 */
  sashToken: string;
  createdAtMs: number;
}

/** 最近一次上游错误（面板「最近错误原文」用）。 */
export interface QoderUpstreamErrorRecord {
  atMs: number;
  region: QoderRegion;
  status: number;
  kind: UpstreamErrorKind;
  /** 上游原文（截断到 2KB）。 */
  body: string;
}

const ERROR_RING_SIZE = 8;
const RETRY_AFTER_HINT_MS = 500;

/** 一个区域的 Qoder 客户端：会话缓存 + 数据面 + 流式 chat。 */
export class QoderClient {
  readonly region: QoderRegion;
  readonly config: QoderRegionConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly installSalt: string | undefined;
  private readonly logger: (message: string) => void;
  private readonly holders = new Map<string, QoderSessionHolder>();
  private readonly errors: QoderUpstreamErrorRecord[] = [];

  constructor(region: QoderRegion, options: { installSalt?: string; fetch?: typeof fetch; logger?: (m: string) => void } = {}) {
    this.region = region;
    this.config = QODER_REGION_CONFIGS[region];
    this.fetchImpl = options.fetch ?? fetch;
    this.installSalt = options.installSalt;
    this.logger = options.logger ?? (() => {});
  }

  /** 最近的上游错误（新的在前）。 */
  recentErrors(): QoderUpstreamErrorRecord[] {
    return [...this.errors];
  }

  private record(kind: UpstreamErrorKind, status: number, body: string): void {
    this.errors.unshift({
      atMs: Date.now(),
      region: this.region,
      status,
      kind,
      body: body.slice(0, 2048),
    });
    if (this.errors.length > ERROR_RING_SIZE) this.errors.length = ERROR_RING_SIZE;
  }

  /** 凭据 → 会话（按凭证键控；换 PAT 必换会话）。 */
  private async ensureSession(credential: string, signal?: AbortSignal): Promise<QoderSessionHolder> {
    const cached = this.holders.get(credential);
    if (cached !== undefined) {
      const remaining = (cached.jobToken.expireTime ?? 0) * 1000 - Date.now();
      if (cached.jobToken.expireTime === undefined || remaining > 5 * 60 * 1000) return cached;
    }
    const jobToken = await this.exchangeJobToken(credential, signal);
    const identity: CosyAuthIdentity = identityFromJobToken({
      id: jobToken.id,
      name: jobToken.name,
      userType: jobToken.userType,
      securityOauthToken: jobToken.securityOauthToken,
      refreshToken: jobToken.refreshToken,
    });
    const fingerprint = deriveFingerprint(jobToken.id, credential, this.installSalt);
    const session = newCosySession(
      identity,
      fingerprint.machineId,
      fingerprint.machineToken,
      fingerprint.machineType,
    );
    const sashToken = await this.exchangeSashToken(credential, signal).catch(() => jobToken.securityOauthToken);
    const holder: QoderSessionHolder = {
      session,
      fingerprint,
      jobToken,
      sashToken: sashToken !== "" ? sashToken : jobToken.securityOauthToken,
      createdAtMs: Date.now(),
    };
    this.holders.set(credential, holder);
    return holder;
  }

  /**
   * `POST {gateway}{jobTokenPath}`：PAT → jobToken。
   *
   * ⚠️ 这里是 **认证面**，不是 cosy 数据面 —— 两者签的不是同一套头。实测
   * （2026-10-30，真 PAT）用数据面那套（`cosy-key` + `authorization: <bearer>`）
   * 换 jobToken 会被上游直接丢弃：
   *
   * `HTTP 403 {"success":false,"errorMessage":"Request discarded","errorCode":"Forbidden"}`
   *
   * 认证面要的是**旧式签名**：`appcode: cosy` + `date: <RFC1123 UTC>` +
   * `signature: md5("cosy&<secret>&<date>")`，再配设备三件套
   * （`cosy-machineid/-token/-type`），且**不带** `authorization` 与 `cosy-key`。
   * 两个独立参考实现（`dingminhua/dsh-connect-qoder` 的 `exchangeJobToken`、
   * `fengyinxia/qoder2api` 的 `jobTokenPost`）都是这套头；`signLegacy()` 与
   * `currentRfc1123Date()` 早就在 `qoder-cosy.ts` 里备好，只是此前没人调。
   */
  private async exchangeJobToken(credential: string, signal?: AbortSignal): Promise<QoderJobToken> {
    const url = `${this.config.gateway}${this.config.jobTokenPath}`;
    const body = jobTokenBody(credential);
    // 指纹以凭证为种子（此时还没有 uid 可用），保证同一 PAT 每次派生出同一台设备。
    const fingerprint = deriveFingerprint("", credential, this.installSalt);
    const date = currentRfc1123Date();
    const resp = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "cosy-machinetoken": fingerprint.machineToken,
        "cosy-machinetype": fingerprint.machineType,
        "login-version": "v2",
        appcode: COSY_APPCODE,
        accept: "application/json",
        "accept-encoding": "identity",
        "cosy-version": "1.1.69",
        "cosy-clienttype": "10",
        date,
        signature: signLegacy(date),
        "content-type": "application/json",
        "cosy-machineid": fingerprint.machineId,
        "user-agent": "Go-http-client/2.0",
      },
      body,
      ...(signal ? { signal } : {}),
    });
    const text = await resp.text();
    if (resp.status !== 200) {
      const kind = classifyFailure(resp.status, text);
      this.record(kind, resp.status, text);
      throw new QoderUpstreamError(
        kind,
        `jobToken 交换失败: HTTP ${resp.status} ${text.slice(0, 200)}`,
        resp.status,
        deepestBusinessCode(text),
        retryAfterMsOf(text) ?? retryAfterMsOfHeader(resp.headers.get("retry-after")),
        upstreamRawResponse(resp.status, text),
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new QoderUpstreamError("unknown", `jobToken 响应不是 JSON: ${text.slice(0, 200)}`, resp.status);
    }
    const jt = parseJobToken(parsed as Record<string, unknown>);
    if (jt.id === "" && jt.securityOauthToken === "") {
      throw new QoderUpstreamError("auth", `jobToken 交换响应缺少身份字段: ${text.slice(0, 200)}`, resp.status);
    }
    return jt;
  }

  /**
   * `POST {openapi}/api/v1/jobToken/exchange`：换 sash 面令牌（失败回落）。
   *
   * 与 {@link exchangeJobToken} 是**不同的端点、不同的请求头**（2026-10-30 对齐
   * 参考实现 `dingminhua/dsh-connect-qoder`）：
   * - 主机是 `openapi`（sash 面），不是 cosy `gateway`；
   * - body 是 `{ personal_token: <PAT> }` —— 参考实现实测 `personal_access_token`
   *   拼写会回 400 BadRequest；
   * - 只带 `content-type` + `accept`，**不带** Authorization、不带 cosy 协议头。
   *
   * 国内版两族令牌等价，所以这一支失败时回落到 `securityOauthToken` 是安全的；
   * 但它决定「积分/签到能不能读」，故仍按正确形状发，而不是随便带个 Bearer。
   */
  private async exchangeSashToken(credential: string, signal?: AbortSignal): Promise<string> {
    const url = `${this.config.openapi}/api/v1/jobToken/exchange`;
    const resp = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ personal_token: credential }),
      ...(signal ? { signal } : {}),
    });
    if (resp.status !== 200 && resp.status !== 201) return "";
    const text = await resp.text();
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const data =
        typeof parsed["data"] === "object" && parsed["data"] !== null
          ? (parsed["data"] as Record<string, unknown>)
          : parsed;
      // 上游在这一点上有过多种拼写（token / job_token / jobToken / accessToken），全试。
      for (const key of ["token", "job_token", "jobToken", "accessToken"]) {
        const v = data[key];
        if (typeof v === "string" && v !== "") return v;
      }
    } catch {
      return "";
    }
    return "";
  }

  /** 签名后的通用请求（GET/POST 都走这条）。 */
  private async signedRequest(
    holder: QoderSessionHolder,
    url: string,
    init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal; modelKey?: string; stream?: boolean },
  ): Promise<Response> {
    const rawBody = init.body === undefined ? "" : JSON.stringify(init.body);
    const encoded = rawBody === "" ? "" : cosyEncode(new TextEncoder().encode(rawBody));
    const date = cosyDateOf();
    const payloadB64 = buildPayloadB64(holder.session.info);
    const sig = signRequest(payloadB64, holder.session.cosyKey, date, encoded, pathSigFrom(url));
    return this.fetchImpl(url, {
      method: init.method,
      headers: {
        ...QODER_DEFAULT_HEADERS,
        "cosy-machinetype": holder.session.machineType,
        "cosy-date": date,
        "cosy-user": holder.session.identity.uid,
        "cosy-key": holder.session.cosyKey,
        "cosy-machineid": holder.session.machineId,
        "cosy-machinetoken": holder.session.machineToken,
        "cosy-version": "1.1.69",
        authorization: composeBearer(payloadB64, sig),
        ...(init.stream ? { accept: "text/event-stream", "cache-control": "no-cache" } : {}),
        ...(init.modelKey ? { "x-model-key": init.modelKey, "x-model-source": "system" } : {}),
      },
      ...(encoded === "" ? {} : { body: encoded }),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  }

  /** sash 面请求（`jt-` 令牌 + sash 专有头；国际版带设备风控头）。 */
  private async sashRequest(
    holder: QoderSessionHolder,
    url: string,
    init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal },
  ): Promise<Record<string, unknown>> {
    const token = holder.sashToken !== "" ? holder.sashToken : holder.jobToken.securityOauthToken;
    if (token === "") {
      throw new QoderUpstreamError("auth", "没有可用的 sash 令牌（jobToken 交换未产出）", 401);
    }
    const resp = await this.fetchImpl(url, {
      method: init.method,
      headers: {
        authorization: `Bearer ${token}`,
        "cosy-clienttype": SASH_CLIENT_TYPE,
        accept: "application/json",
        "accept-language": "zh-CN",
        "user-agent": SASH_USER_AGENT,
        ...(this.config.requiresDeviceRisk
          ? {
              "cosy-machinetoken": holder.session.machineToken,
              "cosy-machineid": holder.session.machineId,
              "cosy-machinetype": holder.session.machineType,
            }
          : {}),
        ...(init.method === "POST"
          ? { "content-type": "application/json", origin: this.config.openapi }
          : {}),
      },
      ...(init.method === "POST" ? { body: JSON.stringify(init.body ?? {}) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
    const text = await resp.text();
    if (resp.status !== 200 && resp.status !== 201) {
      throw this.failFromHttp(resp.status, text, resp.headers.get("retry-after"));
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new QoderUpstreamError("unknown", `响应不是 JSON: ${text.slice(0, 200)}`, resp.status);
    }
  }

  private failFromHttp(status: number, text: string, retryAfterHeader: string | null): QoderUpstreamError {
    const kind = classifyFailure(status, text);
    this.record(kind, status, text);
    return new QoderUpstreamError(
      kind,
      `请求失败: HTTP ${status} ${text.slice(0, 200)}`,
      status,
      deepestBusinessCode(text),
      retryAfterMsOf(text) ?? retryAfterMsOfHeader(retryAfterHeader) ?? (kind === "rate-limited" ? RETRY_AFTER_HINT_MS : undefined),
      upstreamRawResponse(status, text),
    );
  }

  // -------------------------------------------------------------------------
  // 数据面
  // -------------------------------------------------------------------------

  /** 模型目录（`/algo/api/v2/model/list`）。 */
  async fetchModels(credential: string, signal?: AbortSignal): Promise<QoderCatalogModel[]> {
    const holder = await this.ensureSession(credential, signal);
    const url = `${this.config.gateway}${this.config.modelsPath}`;
    const resp = await this.signedRequest(holder, url, { method: "GET", signal });
    const text = await resp.text();
    if (resp.status !== 200) throw this.failFromHttp(resp.status, text, resp.headers.get("retry-after"));
    try {
      return parseModelCatalog(JSON.parse(text) as Record<string, unknown>);
    } catch {
      throw new QoderUpstreamError("unknown", `模型目录不是 JSON: ${text.slice(0, 200)}`, resp.status);
    }
  }

  /** 用量（`{openapi}/sash/api/v2/me/usage`，需 `jt-` 令牌）。 */
  async fetchUsage(credential: string, signal?: AbortSignal): Promise<QoderUsage> {
    const holder = await this.ensureSession(credential, signal);
    const url = `${this.config.openapi}/sash/api/v2/me/usage`;
    const data = await this.sashRequest(holder, url, { method: "GET", signal });
    return parseUsage(data);
  }

  /** 活动列表（签到活动就在这里面）。 */
  async fetchCampaigns(credential: string, signal?: AbortSignal): Promise<QoderCampaign[]> {
    const holder = await this.ensureSession(credential, signal);
    const url = `${this.config.openapi}${this.config.campaignsPath}?forceRefresh=true`;
    const data = await this.sashRequest(holder, url, { method: "GET", signal });
    return parseCampaignFeed(data).campaigns;
  }

  /**
   * 每日签到：先拉活动找 `CLAIM_BENEFIT` 可领的那条，再领。
   *
   * 三态分清：`claimed` / `already-claimed`（幂等，409 也算）/ `unavailable`。
   */
  async claimDailyCredits(credential: string, signal?: AbortSignal): Promise<QoderCheckinOutcome> {
    const campaigns = await this.fetchCampaigns(credential, signal);
    const daily = campaigns.find((c) => c.actionType === "CLAIM_BENEFIT");
    const claimable = campaigns.find((c) => c.actionType === "CLAIM_BENEFIT" && c.claimStatus === "CLAIMABLE");
    const nextRefreshAtMs = daily?.endAt === undefined ? undefined : daily.endAt * 1000;
    if (claimable === undefined) {
      return daily?.claimStatus === "CLAIMED"
        ? { status: "already-claimed", nextRefreshAtMs }
        : { status: "unavailable", message: "上游今日没有下发可领取的签到活动" };
    }
    const holder = await this.ensureSession(credential, signal);
    const url = `${this.config.openapi}${this.config.campaignsPath}/${encodeURIComponent(claimable.campaignId)}/claim`;
    try {
      const data = await this.sashRequest(holder, url, { method: "POST", body: {}, signal });
      if (String(data["status"] ?? "") === "CLAIMED") {
        return {
          status: "claimed",
          amount: claimable.amount,
          validityDays: claimable.validityDays,
          nextRefreshAtMs,
        };
      }
      return { status: "unavailable", message: `签到未完成（上游状态 ${String(data["status"] ?? "未知")}）` };
    } catch (error) {
      if (error instanceof QoderUpstreamError && error.httpStatus === 409) {
        return { status: "already-claimed", nextRefreshAtMs };
      }
      throw error;
    }
  }

  /**
   * 流式 chat。逐帧产出 OpenAI 形状的增量（由调用方包成 SSE 行）。
   *
   * 会话必须已经建好（会按 credential 惰性交换）。
   */
  async *chatStream(
    credential: string,
    request: QoderChatRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<QoderStreamChunk, void, void> {
    const holder = await this.ensureSession(credential, signal);
    const template = createChatBodyTemplate();
    const userType = holder.jobToken.userType;
    applyModelKey(template, request.modelKey, userType, request.isVl === true);
    if (request.isReasoning === true) {
      template.model_config.is_reasoning = true;
      template.chat_context.extra.modelConfig.is_reasoning = true;
    }
    if (request.reasoningEffort !== undefined && request.reasoningEffort !== "") {
      template.reasoningEffort = request.reasoningEffort;
      template.parameters = { ...(template.parameters ?? {}), reasoning_effort: request.reasoningEffort };
    }
    const prompt = extractLatestUserPrompt(request.messages);
    template.messages = buildQoderMessages(request.messages);
    if (request.tools !== undefined && request.tools.length > 0) template.tools = request.tools;
    const requestId = request.requestId ?? cryptoRandomId();
    template.request_id = requestId;
    template.chat_record_id = requestId;
    template.request_set_id = cryptoRandomId();
    template.session_id = cryptoRandomId();
    template.business.id = cryptoRandomId();
    template.business.name = prompt.slice(0, 30) || "hi";
    template.business.begin_at = Date.now();

    const url = `${this.config.gateway}${this.config.chatPath}`;
    const resp = await this.signedRequest(holder, url, {
      method: "POST",
      body: template,
      signal,
      modelKey: request.modelKey,
      stream: true,
    });
    if (resp.status !== 200) {
      const text = await resp.text();
      throw this.failFromHttp(resp.status, text, resp.headers.get("retry-after"));
    }
    if (resp.body === null) {
      throw new QoderUpstreamError("unknown", "聊天响应没有 body", resp.status);
    }
    const decoder = new TextDecoder();
    let buffer = "";
    /**
     * 当前帧所属的 `event:` 名字。SSE 语义里它只作用于紧随其后的那条 `data:`，
     * 消费完必须清空 —— 否则后面的正常帧会被一直当成错误帧。
     */
    let frameEvent = "";
    /**
     * `event:error` 这一块的正文行。
     *
     * 实测上游的失败块是**两行**（2026-10-31，真 PAT）：
     *
     * ```
     * event:error
     * data:{"stackTrace":[…],"message":"Unrecognized token 'X'…"}
     *
     * {"success":false,"msgCode":500,"msgInfo":"Internal Server Error"}
     * ```
     *
     * 第二行**没有 `data:` 前缀**，按 SSE 规范本应被忽略 —— 但真正的状态码
     * （`msgCode`）只在那一行里。所以整块攒起来一起判，别逐行各看各的。
     */
    let errorBlock: string[] | null = null;
    const flushErrorBlock = (): void => {
      if (errorBlock === null) return;
      const text = errorBlock.join("\n");
      errorBlock = null;
      if (text.trim() === "") return;
      const failure = qoderErrorBlockOf(text);
      this.record("transient", failure.status, text);
      throw new QoderUpstreamError(
        "transient",
        `上游错误帧: ${failure.detail.slice(0, 300)}`,
        failure.status,
        deepestBusinessCode(text),
        undefined,
        upstreamRawResponse(failure.status, text),
      );
    };
    for await (const raw of resp.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(raw, { stream: true });
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line.startsWith("event:")) {
          // 换事件前先把上一块收掉（正常块的 errorBlock 是 null，等于什么也不做）。
          flushErrorBlock();
          frameEvent = line.slice("event:".length).trim();
          errorBlock = frameEvent === "error" ? [] : null;
          index = buffer.indexOf("\n");
          continue;
        }
        if (errorBlock !== null && line.trim() !== "") {
          errorBlock.push(line);
          index = buffer.indexOf("\n");
          continue;
        }
        const payload = sseDataPayload(line);
        if (payload !== undefined) {
          const chunk = this.translateFrame(payload, frameEvent, requestId, request.modelKey);
          frameEvent = "";
          if (chunk !== undefined) yield chunk;
        } else if (line.trim() === "") {
          // 一块结束：错误块在这里判定（此时两行都收齐了）。
          flushErrorBlock();
          frameEvent = "";
        }
        index = buffer.indexOf("\n");
      }
    }
    if (buffer.trim() !== "") {
      const leftover = buffer.replace(/\r$/, "");
      if (errorBlock !== null) {
        errorBlock.push(leftover);
      } else {
        const payload = sseDataPayload(leftover);
        if (payload !== undefined) {
          const chunk = this.translateFrame(payload, frameEvent, requestId, request.modelKey);
          if (chunk !== undefined) yield chunk;
        }
      }
    }
    flushErrorBlock();
  }

  /** 一帧 → 增量（错误帧抛 {@link QoderUpstreamError}，带原文）。 */
  private translateFrame(
    payload: string,
    eventName: string,
    requestId: string,
    modelKey: string,
  ): QoderStreamChunk | undefined {
    const frame = parseQoderFrame(payload);
    if (frame === undefined) return undefined;
    if (frame.statusCode !== 200) {
      const kind = classifyFailure(frame.statusCode, frame.raw);
      this.record(kind, frame.statusCode, frame.raw);
      throw new QoderUpstreamError(
        kind,
        `流内错误帧: HTTP ${frame.statusCode} ${frame.raw.slice(0, 300)}`,
        frame.statusCode,
        deepestBusinessCode(frame.raw),
        undefined,
        upstreamRawResponse(frame.statusCode, frame.raw),
      );
    }
    // `event:error` 或业务失败帧：上游报了错，不能再当成「空增量」静默成功。
    const failure = qoderErrorFrameOf(frame.inner, frame.raw);
    if (failure !== undefined) {
      const kinds = classifyFailure(failure.status, frame.raw);
      this.record(kinds, failure.status, frame.raw);
      // `event:error` 是「服务端自己炸了」的口径（分类可能被正文里的业务词误导），
      // 一律按 transient 记，便于上层重试/换档；其余帧仍按正文分类。
      const kind: UpstreamErrorKind = eventName === "error" ? "transient" : kinds;
      throw new QoderUpstreamError(
        kind,
        `上游错误帧: ${failure.detail.slice(0, 300)}`,
        failure.status,
        deepestBusinessCode(frame.raw),
        undefined,
        upstreamRawResponse(failure.status, frame.raw),
      );
    }
    const delta = parseStreamDelta(frame.inner);
    const text = /\{"code"/.test(payload) && delta.content === "" && delta.reasoning === "" ? payload : undefined;
    if (text !== undefined && deepestBusinessCode(payload) !== undefined) {
      const kind = classifyFailure(frame.statusCode, payload);
      this.record(kind, frame.statusCode, payload);
      throw new QoderUpstreamError(
        kind,
        `流内业务错误: ${payload.slice(0, 300)}`,
        frame.statusCode,
        deepestBusinessCode(payload),
        undefined,
        upstreamRawResponse(frame.statusCode, payload),
      );
    }
    return {
      id: requestId,
      created: Math.floor(Date.now() / 1000),
      model: modelKey,
      content: delta.content,
      reasoning: delta.reasoning,
      toolCalls: delta.toolCalls,
      finishReason: delta.finishReason,
      inputTokens: delta.inputTokens,
      outputTokens: delta.outputTokens,
      cachedTokens: delta.cachedTokens,
    };
  }
}

/** OpenAI 形状的流式增量（不依赖 gateway 类型，便于单测与网关适配）。 */
export interface QoderStreamChunk {
  id: string;
  created: number;
  model: string;
  content: string;
  reasoning: string;
  toolCalls: unknown[] | undefined;
  finishReason: string | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  cachedTokens: number | undefined;
}

/** 网关侧发起一次 chat 需要的入参。 */
export interface QoderChatRequest {
  modelKey: string;
  messages: Array<Record<string, unknown>>;
  tools?: unknown[];
  isVl?: boolean;
  isReasoning?: boolean;
  reasoningEffort?: string;
  requestId?: string;
}

function cryptoRandomId(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// 区域客户端单例（面板与网关共用同一份会话缓存）
// ---------------------------------------------------------------------------

const clients = new Map<QoderRegion, QoderClient>();

/** 取区域的客户端（惰性创建；面板与网关共用）。 */
export function getQoderClient(region: QoderRegion, options: { installSalt?: string } = {}): QoderClient {
  const existing = clients.get(region);
  if (existing !== undefined) return existing;
  const created = new QoderClient(region, options);
  clients.set(region, created);
  return created;
}

// ---------------------------------------------------------------------------
// 连接器契约
// ---------------------------------------------------------------------------

/**
 * Qoder 连接器。
 *
 * `getToken` 交出的是 cosy Bearer —— 但它**不含报文体签名**，所以只能用于
 * 不校验签名的探活；真正的 chat 必须走 {@link getQoderClient} 的 `chatStream`
 * （那里由会话持有者按 body 逐条签名）。这一点在 gateway 里显式分叉，不糊在一起。
 */
export class QoderAdapter implements AuthConnector {
  readonly vendorId: string;
  readonly region: QoderRegion;

  constructor(region: QoderRegion = "qoder") {
    this.region = region;
    this.vendorId = region;
  }

  private credentialOf(creds: ConnectorCredentials): string {
    const pat = typeof creds.apiKey === "string" ? creds.apiKey.trim() : "";
    if (pat !== "") return pat;
    const refresh = typeof creds.refreshToken === "string" ? creds.refreshToken.trim() : "";
    return refresh;
  }

  async getToken(creds: ConnectorCredentials): Promise<TokenState> {
    const credential = this.credentialOf(creds);
    if (credential === "") {
      throw new QoderUpstreamError("auth", "Qoder 凭据为空：需要 PAT（pt-…）", 401);
    }
    const client = getQoderClient(this.region);
    // 会话建立（jobToken 交换）本身就是「取 token」：成功后用同一份会话签一个
    // 不含 body 的 Bearer 交出，仅为满足契约形状。
    const probe = await client.fetchModels(credential).catch((error: unknown) => {
      if (error instanceof QoderUpstreamError) throw error;
      throw new QoderUpstreamError("unknown", String(error), 0);
    });
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    void probe;
    return { accessToken: `qoder:${this.region}`, expiresAt };
  }

  decorateRequest(base: RequestDecoration, _token: TokenState, _creds?: ConnectorCredentials): RequestDecoration {
    // 身份头依赖每请求的签名（cosy-key/date/user 与 body 绑定），这里只补公共头；
    // 签名头由 QoderClient.signedRequest 追加。
    return {
      headers: { ...(base.headers ?? {}), ...QODER_DEFAULT_HEADERS, "cosy-version": "1.1.69" },
      ...(base.query === undefined ? {} : { query: base.query }),
    };
  }

  classifyError(
    httpStatus: number,
    body: unknown,
    headers?: Record<string, string | string[] | undefined> | null,
  ): UpstreamError {
    const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
    const kind = classifyFailure(httpStatus, text);
    const retryHeader = headers?.["retry-after"];
    const retryValue = Array.isArray(retryHeader) ? retryHeader[0] : retryHeader;
    const retryAfter =
      retryAfterMsOf(text) ?? retryAfterMsOfHeader(retryValue ?? null) ?? undefined;
    void classifyHttpStatus;
    return new QoderUpstreamError(
      kind,
      `Qoder 上游错误: HTTP ${httpStatus} ${text.slice(0, 200)}`,
      httpStatus,
      deepestBusinessCode(text),
      retryAfter,
      upstreamRawResponse(httpStatus, text),
    );
  }

  /**
   * 网关侧「打一次上游」的出口 —— 形状对齐 `SensenovaAdapter.runWithAccount`。
   *
   * 为什么不是普通 fetch：
   * - Qoder 的请求体是**固定模板 + 签名**，签名覆盖 body，所以必须由本类
   *   自己组包（网关那层只给 OpenAI 形状的 body）；
   * - 上游回的是 cosy 信封帧（`{statusCodeValue, body}` 双层 JSON），要在这里
   *   翻译成 OpenAI chunk 流，网关的 `iterUpstreamChunks` 才能按 openai 口径解析。
   *
   * 返回的 `res` 是**本地合成的 SSE Response**（不是上游原始响应）：上层
   * 照常 `iterUpstreamChunks(res.body, "openai", …)` 消费，错误分类也照常
   * 走 `classifyResponse`（本方法非 200 时抛 `QoderUpstreamError`）。
   */
  async runWithAccount(
    _url: string,
    body: Record<string, unknown>,
    model: string,
    creds: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ res: Response; runtime: QoderAccountRuntime }> {
    const pat = typeof creds.apiKey === "string" ? creds.apiKey.trim() : "";
    const account = typeof creds.username === "string" ? creds.username : model;
    if (pat === "") {
      throw new QoderUpstreamError("auth", "Qoder 账号缺少 PAT（pt-…）", 401);
    }
    const region = regionOfCreds(creds, this.region);
    const client = getQoderClient(region);
    const messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : [];
    const tools = Array.isArray(body.tools) ? (body.tools as unknown[]) : undefined;
    const effort = typeof body.reasoning_effort === "string" ? body.reasoning_effort : undefined;
    const request: QoderChatRequest = {
      modelKey: model,
      messages,
      ...(tools === undefined ? {} : { tools }),
      ...(creds.is_vl === true ? { isVl: true } : {}),
      ...(creds.is_reasoning === true ? { isReasoning: true } : {}),
      ...(effort === undefined || effort === "" ? {} : { reasoningEffort: effort }),
    };
    const completionId = `qoder-${cryptoRandomId()}`;
    const created = Math.floor(Date.now() / 1000);
    const source = client.chatStream(pat, request, signal);
    const encoder = new TextEncoder();
    let usage: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    } | null = null;
    const line = (obj: unknown): Uint8Array => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
    /**
     * 先拉第一帧再建 Response。
     *
     * 上游把失败写进**第一帧**（`event:error`）很常见；如果等响应头发出 200 之后
     * 才发现，错误就只能退化成一句 SSE 注释 —— 上层看到的是「成功但空 content」。
     * 在这里先 await 一次，第一帧就报错时按真错误抛，网关才能把上游状态码与原文
     * 原样回给调用方（用户定案：上游给了什么就回什么）。
     */
    const first = await source.next();
    const emit = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      chunk: QoderStreamChunk,
    ): void => {
      const delta: Record<string, unknown> = {};
      if (chunk.content !== "") delta.content = chunk.content;
      if (chunk.reasoning !== "") delta.reasoning_content = chunk.reasoning;
      if (chunk.toolCalls !== undefined && chunk.toolCalls.length > 0) delta.tool_calls = chunk.toolCalls;
      controller.enqueue(
        line({
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta,
              finish_reason: chunk.finishReason ?? null,
            },
          ],
        }),
      );
      if (chunk.inputTokens !== undefined || chunk.outputTokens !== undefined) {
        /**
         * **逐帧累加**,不是整体覆盖。
         *
         * 上游把用量分散在多个帧里报(实测先给 `prompt_tokens`,后面才补
         * `completion_tokens`),覆盖式写法会把先前那一半冲掉 —— 尾块只剩
         * completion,客户端按 prompt 计费就是 0。
         *
         * `total_tokens` 上游从不报,按 OpenAI 口径补成两者之和;尾部 usage 块
         * 是 forwardStream / aggregateCompletion **唯一**的用量来源,缺了它
         * 非流式聚合就是 `total_tokens: 0`。
         */
        const prev = usage ?? {};
        const prompt = chunk.inputTokens ?? prev.prompt_tokens;
        const completion = chunk.outputTokens ?? prev.completion_tokens;
        const next: NonNullable<typeof usage> = { ...prev };
        if (prompt !== undefined) next.prompt_tokens = prompt;
        if (completion !== undefined) next.completion_tokens = completion;
        if (prompt !== undefined && completion !== undefined) next.total_tokens = prompt + completion;
        if (chunk.cachedTokens !== undefined) {
          next.prompt_tokens_details = { cached_tokens: chunk.cachedTokens };
        }
        usage = next;
      }
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (!first.done) emit(controller, first.value);
          for await (const chunk of source) {
            emit(controller, chunk);
          }
          // usage-only 尾块（choices 为空）—— 网关的 aggregateCompletion 与
          // 流式 usage 记账都靠它，位置必须在 [DONE] 之前。
          if (usage !== null) {
            controller.enqueue(line({ id: completionId, created, model, choices: [], usage }));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          // 已经开了流：把错误原文塞进注释行后收流，让上层 classifyResponse 之外
          // 的路径也能看到真相（响应头已发出，改不了状态码）。
          const text = error instanceof Error ? error.message : String(error);
          controller.enqueue(encoder.encode(`: qoder-error ${text.replace(/\n/g, " ").slice(0, 400)}\n\n`));
          controller.close();
        }
      },
      cancel() {
        // 客户端断开：让上游生成器在下一个 yield 点收手。
        void source.return(undefined as never);
      },
    });
    return {
      res: new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      }),
      runtime: { name: account, region },
    };
  }

  /** 记账出口（Qoder 没有 TPM/RPM 池，保留形状供网关统一调用）。 */
  recordSpendFor(_username: string, _usage: unknown, _ttftMs: number): void {
    /* Qoder 侧无可记账的账号池额度，留空实现。 */
  }
}

/** `runWithAccount` 返回的运行时信息（账号名 + 实际区域）。 */
export interface QoderAccountRuntime {
  name: string;
  region: QoderRegion;
}

/**
 * 从凭据附加字段判断区域 —— **只接国内版,所以恒为 `qoder`**。
 *
 * 保留这个函数(而不是删掉改成常量)是因为网关与面板都按「凭据 → 区域」取值;
 * 旧凭据里可能还留着 `region: "qoder-global"` 或 `base_url: https://api1.qoder.sh`,
 * 这里统一收口成国内,不让他们在别处各判一遍。
 */
export function regionOfCreds(_creds: Record<string, unknown>, _fallback: QoderRegion): QoderRegion {
  return "qoder";
}

/** 连接器实例(注册进 connectors/index 用;单区域)。 */
export const QODER_ADAPTERS: QoderAdapter[] = [new QoderAdapter("qoder")];

export { isQoderRegion };
