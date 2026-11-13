/**
 * OpenAI 兼容线格式 DTO —— As One 网关对外 /v1/* 契约。
 *
 * 形状来源(冲突时以 Nexus 源码为准):
 * - `nexus/gateway/app.py`(/v1/chat/completions 与 /v1/models 的请求路径);
 * - `nexus/connectors/base.py` `UpstreamRequest`(上游请求对象)与 `Adapter`
 *   协议(`stream` 产 OpenAI chunk dict、`complete` 产完整 chat.completion dict
 *   —— 网关只加 SSE 帧,不做内部自有格式,见 base.py 模块 docstring);
 * - `nexus/core/errors.py` `UpstreamErrorKind` / `_KIND_SPEC`(错误体形状与
 *   kind→HTTP 状态码映射);
 * - OpenAI 官方 chat/completions 线格式(id/object/created/model/choices/usage)。
 *
 * ⚠️ 零第三方依赖:只用 `node:` 内建类型;本文件不 import 任何运行时模块
 * (框架无关,将来在 DSH 宿主进程里也要能跑)。
 */

// ---------------------------------------------------------------------------
// 消息(请求体 messages[] 元素)
// ---------------------------------------------------------------------------

/** 纯文本消息内容。 */
export interface ChatTextPart {
  type: "text";
  text: string;
}

/** 图像块(`image_url.url` 可以是 http(s) 也可以是 data: URI)。 */
export interface ChatImagePart {
  type: "image_url";
  image_url: { url: string; detail?: string };
}

export type ChatContentPart = ChatTextPart | ChatImagePart;

/** content 既可以是纯字符串,也可以是 OpenAI 多模态分段数组。 */
export type ChatMessageContent = string | ChatContentPart[];

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: ChatMessageContent;
  /** assistant 消息上的推理文本(部分上游回带,原样透传)。 */
  reasoning_content?: string;
  /** assistant 发起的工具调用。 */
  tool_calls?: ChatToolCall[];
  /** role=tool 消息上标识对应的调用。 */
  tool_call_id?: string;
  name?: string;
}

export interface ChatToolCall {
  index?: number;
  id?: string;
  type: "function";
  function: { name?: string; arguments?: string };
}

export interface ChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

// ---------------------------------------------------------------------------
// POST /v1/chat/completions 请求体
// ---------------------------------------------------------------------------

/**
 * chat/completions 请求。Nexus 对 body 的处理是宽松的:
 * `app.py:chat_completions` 只强看 `model`(缺 → 400「缺少 model」)与
 * `stream`(真值判断),其余字段按 OpenAI 兼容形状透传给上游构造器
 * (`connectors/base.py UpstreamRequest.to_body()`)。
 */
export interface ChatCompletionRequest {
  /** 对外模型名:逻辑模型名(如 "deepseek-flash")或 `provider/model` 直连。 */
  model: string;
  messages: ChatMessage[];
  /** 真值判断(Nexus `bool(body.get("stream"))`);缺省=false。 */
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  /** OpenAI 的同义字段(`max_tokens` 的新名字);两者等价,一起收(Nexus O1)。 */
  max_completion_tokens?: number;
  stop?: string[];
  tools?: ChatToolDefinition[];
  tool_choice?: unknown;
  reasoning_effort?: string;
  /** 流式要 usage(Nexus 给上游注入 `stream_options.include_usage=true` 后透传)。 */
  stream_options?: { include_usage?: boolean };
  /** 上游特定扩展字段(连接器 extra;`session_id` 属网关内部键,绝不透传)。 */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 非流式响应(chat.completion)
// ---------------------------------------------------------------------------

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: Record<string, unknown>;
}

export interface ChatChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    reasoning_content?: string;
    tool_calls?: ChatToolCall[];
  };
  finish_reason: string | null;
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: ChatUsage;
  /** 上游透传的系统指纹等额外字段。 */
  system_fingerprint?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 流式 chunk(chat.completion.chunk,OpenAI SSE `data:` 载荷)
// ---------------------------------------------------------------------------

export interface ChatChunkDelta {
  role?: "assistant";
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: ChatToolCall[];
}

export interface ChatChunkChoice {
  index: number;
  delta: ChatChunkDelta;
  finish_reason: string | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatChunkChoice[];
  /** ⚠️ usage 可能出现在任意一块上,不保证与 finish_reason 同块
   * (`nexus/core/translate.py` 模块 docstring 踩坑 1);按块透传,绝不丢块。 */
  usage?: ChatUsage | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// GET /v1/models
// ---------------------------------------------------------------------------

/**
 * /v1/models 条目(Nexus `app.py:list_models`,app.py:667):
 * - 所有条目:`id` / `object: "model"` / `owned_by` / `litenexus_kind`;
 * - real 额外:`name`(D29 人话名)/ `max_input_tokens` / `max_output_tokens` /
 *   `supports_vision`(有值才带);
 * - logical 额外:`max_input_tokens` / `supports_vision`(链上聚合,可 null 才省略)。
 * `litenexus_kind` 是 Nexus 的历史命名(旧名 LiteNexus),v4 语义= real|logical,
 * 保留它以兼容既有客户端。
 *
 * `owned_by` 原来是字面量 `"nexus"`(镜像上游返回值);As One 改名后由装配层
 * 写 `"as-one"`,故放宽为 `string` —— 客户端只用它做分组显示,不做校验。
 */
export interface ModelEntry {
  id: string;
  object: "model";
  owned_by: string;
  litenexus_kind?: "real" | "logical";
  name?: string;
  /**
   * **去重后的显示名**(用户 m44638:「需要优化显示名,如果有相同的显示名,
   * 则追加 provider 区分」)。
   *
   * 与 `name` 的分工:`name` 是这个模型自己填的人话名(库里那列),
   * `display_name` 是**整张清单摆在一起之后**保证互不相同的名字 —— 撞名时真实模型
   * 追加 ` (provider)`、逻辑模型追加 ` (逻辑名)`,还撞就再追加序号。
   * 所以只有这里能直接拿去渲染选择器;`name` 单独看仍然有意义。
   *
   * ⚠️ `id` 永远是调用串,不随显示名变 —— 显示层怎么改都不影响路由。
   */
  display_name?: string;
  max_input_tokens?: number;
  max_output_tokens?: number;
  supports_vision?: boolean;
  /**
   * 该模型**支持的思考强度档位**(用户 m09937:「设计逻辑模型的 reasoning_efforts
   * 返回值」)。三态:
   * - `null` = 未知(上游没给档位表)—— 网关不拦,客户端给什么发什么;
   * - `[]`   = 各档成员的交集为空 ⇒ 没有任何档位是所有档都支持的;
   * - 非空   = 逻辑模型是各档成员能力表的**交集**(只算「已知」的成员)。
   *
   * ⚠️ 这是**展示用的安全边界**,不是硬保证:网关在真实请求里仍按**当轮真实模型**
   * 自己的能力表逐档匹配(同一逻辑模型的不同档位可能给出不同的结果)。
   */
  reasoning_efforts?: string[] | null;
  /**
   * 是否允许**关闭思考**(`off`)。
   * - `true` = 可以发 `off`;
   * - `false` = 不允许,网关会退到最低思考档;
   * - `null` / 省略 = 上游没说(按「允许」处理,交给上游自己拒)。
   *
   * 与 `reasoning_efforts` 分开给:前者是「强度档位表」,这个是「能不能整个关掉」。
   */
  reasoning_allows_off?: boolean | null;
}

export interface ModelList {
  object: "list";
  data: ModelEntry[];
}

// ---------------------------------------------------------------------------
// 错误对象(OpenAI 形状 + Nexus 错误体)
// ---------------------------------------------------------------------------

export interface OpenAiErrorBody {
  error: {
    /** Nexus `UpstreamErrorKind` 之一(或网关自身错误类型),客户端据此分类。 */
    type: string;
    message: string;
  };
}

/** FastAPI(HTTPException)错误体形状:`{"detail": <string|object>}`。 */
export interface FastApiDetailBody {
  detail: string | OpenAiErrorBody;
}

/** 网关→客户端的错误响应体:FastAPI 形状(detail;Nexus _as_http 只产 detail.error)。 */
export type GatewayErrorBody = FastApiDetailBody;

// ---------------------------------------------------------------------------
// 上游错误(与 nexus/core/errors.py 对齐,语义供网关层复用)
// ---------------------------------------------------------------------------

/** `nexus/core/errors.py:UpstreamErrorKind`(str 常量,不用 enum)。 */
export const UpstreamErrorKind = {
  RateLimit: "rate_limit",
  Auth: "auth",
  AuthChallenge: "auth_challenge",
  Upstream: "upstream",
  BadRequest: "bad_request",
  Timeout: "timeout",
  Connection: "connection",
  AlreadyStreaming: "already_streaming",
} as const;

export type UpstreamErrorKindName =
  (typeof UpstreamErrorKind)[keyof typeof UpstreamErrorKind];

/** `_KIND_SPEC`(errors.py:61):kind → [回给客户端的 HTTP 状态码, 可重试]。 */
export const KIND_SPEC: Readonly<
  Record<UpstreamErrorKindName, readonly [httpStatus: number, retryable: boolean]>
> = {
  rate_limit: [429, true],
  auth: [401, false],
  auth_challenge: [502, false],
  upstream: [502, true],
  bad_request: [400, false],
  timeout: [504, true],
  connection: [502, true],
  already_streaming: [502, false],
};

/**
 * 上游错误响应的**原始**内容(用户 m36329:「只要上游有返回值,就返回上游返回的
 * 原始内容,不做修改」)。
 *
 * 为什么要在错误对象里带原件:分类器为了「人能读懂」会把上游原文重写成自己的话
 * (`认证失败 — 上游:…`),这对**日志**有价值,对**客户端**是误导 —— 客户端拿到的
 * 是网关的猜测,而不是上游的真实答复。带上原件后,对外出口可以直接把上游的响应体
 * 与状态码原样写回去,分类结果只用于内部的换档/冷却决策。
 */
export interface UpstreamRawResponse {
  /** 上游响应体文本(逐字)。超长时截断到 {@link RAW_BODY_MAX}。 */
  text: string;
  /** `JSON.parse(text)` 成功时的结果;解析失败则没有这个字段。 */
  json?: unknown;
  /** 上游原始 HTTP 状态码。 */
  status: number;
  /** 上游 `Content-Type`(缺省按 `application/json` 写回)。 */
  contentType?: string;
}

/**
 * 上游响应体**逐字透传**的上限(字符)。
 *
 * 留这个上限纯粹是为了不被异常上游打爆内存:真实的错误体是几百字节量级,
 * 256KB 已经远超任何正常答复。超过的按上限截断 —— 这种体量的「错误」本来
 * 也不是给客户端看的。
 */
export const RAW_BODY_MAX = 256 * 1024;

/**
 * 上游错误 —— 携带 kind / detail / retry_after,`httpStatus` 与 `retryable`
 * 由 kind 从 {@link KIND_SPEC} 派生(与 `UpstreamError.http_status/.retryable`
 * 属性语义一致)。
 */
export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKindName;
  readonly detail: string;
  readonly retryAfter?: number;
  /** 上游原始 HTTP 状态码(若有);`_busy_or_upstream` 的 all_cooldown 出口要用。 */
  readonly statusCode?: number;
  /**
   * 上游错误响应的原件(有上游答复时必带)。
   *
   * `upstreamErrorToHttp()` 见到它就**原样**写回客户端的 body + 状态码,
   * `detail` 只在没有原件(自造错误:并发已满、池耗尽、网络异常)时才上屏。
   */
  readonly raw?: UpstreamRawResponse;

  constructor(
    kind: UpstreamErrorKindName,
    detail?: string,
    opts: { retryAfter?: number; statusCode?: number; raw?: UpstreamRawResponse } = {},
  ) {
    super(detail || kind);
    this.name = "UpstreamError";
    this.kind = kind;
    this.detail = detail || kind;
    if (opts.retryAfter !== undefined) this.retryAfter = opts.retryAfter;
    if (opts.statusCode !== undefined) this.statusCode = opts.statusCode;
    if (opts.raw !== undefined) this.raw = opts.raw;
  }

  /** 回给客户端的 HTTP 状态码(errors.py `_KIND_SPEC` 派生)。 */
  get httpStatus(): number {
    return KIND_SPEC[this.kind]?.[0] ?? 502;
  }

  /** 能否换一个端点重试。 */
  get retryable(): boolean {
    return KIND_SPEC[this.kind]?.[1] ?? true;
  }

  /** 上游非 2xx → 分类错误(对齐 `classify_status`,errors.py:73)。 */
  static fromStatus(statusCode: number, detail?: string, retryAfter?: number): UpstreamError {
    let kind: UpstreamErrorKindName;
    if (statusCode === 429) kind = UpstreamErrorKind.RateLimit;
    else if (statusCode === 401 || statusCode === 403) kind = UpstreamErrorKind.Auth;
    else if (statusCode >= 500 && statusCode <= 599) kind = UpstreamErrorKind.Upstream;
    else kind = UpstreamErrorKind.BadRequest;
    return new UpstreamError(kind, detail, { retryAfter, statusCode });
  }
}

// ---------------------------------------------------------------------------
// 上游接口(注入;网关路由核心不 import 任何具体连接器)
// ---------------------------------------------------------------------------

/**
 * 发往上游的一次调用(与 `nexus/connectors/base.py:UpstreamRequest` 对齐,
 * 网关层只关心网关侧字段)。
 */
export interface UpstreamRequest {
  /** 发往上游的模型 id(已去掉 `provider/` 前缀)。 */
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  temperature?: number;
  /**
   * 本次发给上游的**输出预算**。
   *
   * ⚠️ 它是**钳制后**的值,不是客户端原值 —— 按当轮成员的上限算
   * (见 `gateway-upstream.ts` 的 `clampMaxTokens`)。客户端原值另存在
   * {@link maxTokensClient},换档重试时必须**从原值重算**(拿上一轮钳过的值
   * 再 min 就永远回不去:A 档 64000 钳过之后,B 档 262144 就被永久压在 64000)。
   */
  max_tokens?: number;
  /**
   * 客户端**原始**的 `max_tokens`(`max_completion_tokens` 是同义字段,一起收)。
   * 只在网关构造请求时写一次,此后只读不写。
   */
  maxTokensClient?: number;
  top_p?: number;
  stop?: string[];
  tools?: ChatToolDefinition[];
  tool_choice?: unknown;
  reasoning_effort?: string;
  /**
   * **缓存路由键**(billion-context 插件的 `prompt_cache_key`)—— 网关内部键。
   *
   * 同一前缀的一批请求共享同一个键;网关用它做**端点亲和**(同键 → 同一端点),
   * 好让上游的前缀缓存(按 1024-token 块存在推理节点本地)命中。
   *
   * ⚠️ **绝不进上游 body**:上游见到这个键会直接 400(实测:带键 400、去键成功)。
   * 所以它**不放 `extra`**(`extra` 除 `session_id` 外会被整体透传),而是这个
   * 独立字段 —— 所有上游实现必须无视它。
   *
   * ⚠️ 与 `session_id` 的关系:两者都驱动会话 pin,`prompt_cache_key` **优先**
   * (它是客户端显式声明的「前缀相同」意图,比会话号更贴近缓存命中条件)。
   */
  prompt_cache_key?: string;
  /**
   * 网关**无法处理**、已丢弃的客户端字段名(2026-10-24 用户定案 m09081:
   * 「能处理就处理,不能处理就丢弃,不要拒绝请求……可能需要额外记录丢弃了哪些字段」)。
   *
   * 只用于日志与请求明细排查(`packages/core/src/gateway/request-fields.ts`
   * 的 `classifyRequestFields`);对请求结果没有任何影响。
   */
  discarded_fields?: string[];
  /** 协议特定扩展;`session_id` 是网关内部键,上游实现必须摘除不进报文体。 */
  extra?: Record<string, unknown>;
  /**
   * **客户端断开信号**(网关注入,上游实现必须响应)。
   *
   * 客户端中途放弃(关掉连接 / `reader.cancel()`)时它会 fired。上游实现拿到它
   * 后要**立刻打断自己的 fetch**,让流生成器抛错退出 —— 这是并发槽位能归还的
   * 唯一途径:
   *
   * - 生成器悬停在 `await reader.read()`(**await 点**,不是 yield 点);
   * - async generator 的 `.return()` 请求要等那个 await 落地才被处理 —— 上游还在
   *   持续产块时可以等很久(实测 20s 槽位仍未释放);
   * - 只有真的把上游 fetch abort 掉,生成器才走到 `catch` → `router.finish`
   *   → `ledger.release(leaseId)`,槽位当场归还。
   *
   * ⚠️ **不要把它塞进 `extra`**:`extra` 除 `session_id` 外会被整体透传进上游
   * 报文体(`gateway-upstream.ts` 的 `bodyFor`),一个 `AbortSignal` 进 body
   * 会直接把请求打成畸形。
   *
   * 对齐 Nexus `app.py` 的 `asyncio.CancelledError` 支:那里注释原话是
   * 「客户端断开:必须记失败并结账,否则端点会一直被占着」。
   */
  clientSignal?: AbortSignal;
}

/**
 * 上游适配器 —— fetch-like,由外部注入(阶段一 = OpenAI 兼容直连连接器)。
 * 与 `nexus/connectors/base.py:Adapter` 协议逐条对应:
 * - `stream` 产 OpenAI chunk dict(含收尾块),失败抛 {@link UpstreamError};
 * - `complete` 产完整 chat.completion dict,失败抛 {@link UpstreamError}。
 * 连接器不负责选路/亲和/并发/冷却 —— 那是 router 的事。
 */
export interface Upstream {
  /** 产出 OpenAI chunk 流(对象);网关负责加 SSE 帧。 */
  stream(req: UpstreamRequest): AsyncIterable<ChatCompletionChunk>;
  /** 返回完整 chat.completion。 */
  complete(req: UpstreamRequest): Promise<ChatCompletion>;
  /** 该上游是否有此模型(真实模型直连判 404 用);实现可返回 undefined=未知。 */
  hasModel?(model: string): boolean | undefined;
}

// ---------------------------------------------------------------------------
// 网关注入配置(DSH 形态适配点)
// ---------------------------------------------------------------------------

/**
 * 网关密钥来源。阶段一(独立 Electron 应用)= 环境变量/配置文件;
 * 阶段二(DSH 插件)= 进程内随机密钥(真实上游 token 永不出进程,
 * 见 docs/dsh-plugin-reference-research.md 的 loopback shim 设计)。
 */
export interface KeyProvider {
  /** 现读网关 key(每次调用现取,不缓存 —— 对齐 `auth.current_key` 语义);
   * 空串/undefined = 未配置(所有请求放行 + 一次性告警)。 */
  getKey(): string | undefined | null;
  /** 未配置时的一次性告警文案(可注入以对接宿主日志);缺省用 console.warn。 */
  onMissingKeyWarning?(message: string): void;
}

/** 环境变量密钥来源(阶段一默认形态,对齐 ONE_API_KEY 语义)。 */
export class EnvKeyProvider implements KeyProvider {
  constructor(
    private readonly envVarName = "ONE_API_KEY",
    private readonly env: Record<string, string | undefined> = process.env,
  ) {}

  getKey(): string | undefined | null {
    const raw = this.env[this.envVarName];
    return raw === undefined ? undefined : raw.trim();
  }
}

export interface ModelProvider {
  /** /v1/models 的清单来源(repo.public_models() 的 TS 对应物)。 */
  /**
   * 模型清单。**允许返回 Promise** —— 装配层判「该 provider 名下有没有凭据」
   * (Nexus `EXISTS (SELECT 1 FROM credential ...)` 的同义判据)要读凭据库,
   * 而 As One 的凭据库是异步的文件型 vault。
   */
  listModels(): ModelEntry[] | Promise<ModelEntry[]>;
}

export interface GatewayOptions {
  keyProvider: KeyProvider;
  modelProvider: ModelProvider;
  /** 模型 → 上游适配器。未知模型由网关先 404,再到这里查不到时也按 404 处理。 */
  resolveUpstream(model: string): Upstream | undefined;
  /** 会话亲和 id(可选注入;缺省网关不派生 —— 阶段二由 router 接管)。 */
  deriveSessionId?(body: ChatCompletionRequest): string | undefined;
  /** 日志注入(DSH 宿主用自己的 logger);缺省 no-op。 */
  logger?: Pick<Console, "warn" | "error" | "info">;
  /**
   * 请求完成挂钩(可选):每次聊天请求结束时调用一次 —— 流式在流收尾/断流/首块前
   * 失败时,普通完成在 complete 返回或抛错后。用于请求日志:网关只保证它自己
   * 知道的事实;真实 provider/model/username 等由注入方在挂钩实现里从选路侧补齐。
   * 挂钩抛错不得影响已发出的响应(内部 try/catch 吞掉并 logger.error)。
   */
  onRequestDone?(info: RequestDoneInfo): void;
}

/**
 * onRequestDone 的载荷 —— Nexus 面板「逐请求明细」行的网关侧视图。
 * - ok/status:本次请求最终对外结果(客户端断开时响应未发出,status=0);
 * - latency_ms/ttft_ms:网关侧计时(ttft 仅流式有,非流式为 null);
 * - usage:Nexus `usage{prompt, cached, completion}` 语义(cached=prompt_tokens_details.cached_tokens);
 * - session_id:经 deriveSessionId 提取(可能 null);
 * - request:请求体原文(可能较大;供 content_mode 裁剪 —— full/edges/structure)。
 */
export interface RequestDoneInfo {
  /** 客户端请求的模型名(逻辑模型或真实模型直连名)。 */
  model: string;
  stream: boolean;
  ok: boolean;
  /** 最终对外状态码;客户端断开(响应未发出)为 0。 */
  status: number;
  /** 失败详情原文;成功/未知时为 null。 */
  error?: string | null;
  error_kind?: string | null;
  /** 请求总耗时 ms(网关侧计时,含排队到发完)。 */
  latency_ms: number;
  /** 到首块耗时 ms;非流式(无首块概念)为 null ⇒ ttft_requests 不计数。 */
  ttft_ms: number | null;
  usage?: {
    prompt_tokens?: number;
    cached_tokens?: number;
    completion_tokens?: number;
  } | null;
  /** 客户端会话 id(经 deriveSessionId 提取;无会话时为 null)。 */
  session_id?: string | null;
  /**
   * 客户端的**缓存路由键**(billion-context 的 `prompt_cache_key`;未带为 null)。
   * 仅记录用 —— 网关拿它做过端点亲和,但**从不转发给上游**。
   */
  prompt_cache_key?: string | null;
  /**
   * 网关无法处理、已丢弃的客户端字段名(2026-10-24 用户定案 m09081)。
   * 面板「逐请求明细」据此显示「本次丢弃了哪些字段」。
   */
  discarded_fields?: string[] | null;
  /** 请求体原文(供正文裁剪;可能较大)。 */
  request?: unknown;
}
