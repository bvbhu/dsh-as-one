/**
 * 选路核心领域类型 —— 从 Nexus `nexus/core/router.py` + `nexus/core/errors.py` +
 * `nexus/core/metrics.py` 移植(测试规格:`tests/test_v4_semantics.py`)。
 *
 * 形状对齐 v4 契约(`nexus/db/V4_CONTRACT.md`):
 * - **标识符是三元组**,不是斜杠拼接的 id 列:`provider` / `model` /
 *   `credentialKey = (provider, username)`。需要字符串 id 时用
 *   {@link realModelKeyOf} / {@link endpointIdOf} 现拼(那是给人看的,不是存储键)。
 * - **运行期状态全部只在内存**:连续失败数、冷却截止时间、会话 pin、额度快照
 *   都不落盘(D17 / D18 / D19)。语义:**最近没有失败记录的端点一律视为可用**。
 *
 * ⚠️ 本文件只定义类型与纯函数,**不 import 任何运行时模块**(框架无关,也不依赖
 * DB / scheduler / 其他子代理的文件)。
 */

// ---------------------------------------------------------------------------
// 标识符
// ---------------------------------------------------------------------------

/** `(provider, username)` —— 一枚凭据的身份(v4 契约的二元组)。 */
export type CredentialKey = readonly [provider: string, username: string];

/**
 * 真实模型的对外字符串 id(`"provider/model"`)。
 *
 * ⚠️ 2026-11-08 起**不再是并发账本的计数键**:并发按**凭据(端点)**计
 * (见 `router/inflight-ledger.ts`),这里只用于展示口径与抢占标记。
 */
export type RealModelKey = string;

/** 端点身份键 `"<provider>/<model>@<provider>/<username>"`。 */
export type EndpointId = string;

// ---------------------------------------------------------------------------
// 端点 / 链
// ---------------------------------------------------------------------------

/** 上游错误类别(`nexus/core/errors.py:UpstreamErrorKind`,用 str 常量不用枚举)。 */
export const UpstreamErrorKind = {
  /** 429 / 账号额度耗尽 —— 换下一台 */
  RateLimit: "rate_limit",
  /** 401 / 403 —— 账号失效,冷却并登记强制刷新 */
  Auth: "auth",
  /** 验证码等「不该重试」的 502 */
  AuthChallenge: "auth_challenge",
  /** 5xx —— 计入冷却,可重试 */
  Upstream: "upstream",
  /** 其余 4xx —— 请求本身有问题,原样返回不重试 */
  BadRequest: "bad_request",
  /** 超时 */
  Timeout: "timeout",
  /** 连不上 */
  Connection: "connection",
  /** 流已开始,无法再换号(响应已发出) */
  AlreadyStreaming: "already_streaming",
} as const;

export type UpstreamErrorKindName =
  (typeof UpstreamErrorKind)[keyof typeof UpstreamErrorKind];

/**
 * **已知的明确瞬时故障**(2026-10-18 用户定案:「已知的明确的瞬时故障不冷却」)。
 *
 * 这两类失败 = 网络抖了一下 / 上游这次没赶上,端点本身没病,上一次成功之后它就好了。
 * 对它们只记账,**不落 `cooldownUntil`** —— 见 {@link EndpointHealth.noteFailure}。
 *
 * ⚠️ 不含 `upstream`(5xx):那是上游自己出了问题,可能持续一段时间。也不含
 * `alreadyStreaming`:流已开始,换端点救不了这一轮。
 */
export const TRANSIENT_KINDS: ReadonlySet<string> = new Set<string>([
  UpstreamErrorKind.Timeout,
  UpstreamErrorKind.Connection,
]);

/** 一个可被选中的端点 = (真实模型 × 该 provider 名下的一枚凭据)。 */
export interface Endpoint {
  /** `"<provider>/<model>@<provider>/<username>"`,端点身份 */
  endpointId: EndpointId;
  /** 例:`"workbuddy"` */
  provider: string;
  /** 例:`"glm-5.3-flash"` —— **同时也是发给上游的名字** */
  model: string;
  credentialKey: CredentialKey;
  protocol: string;
  baseUrl: string | null;
  region: string | null;
  /**
   * 该**凭据（端点）**允许的并发 —— 2026-11-08 用户改口后的新语义：
   * 「并发设置为 1，三个凭据就可以三并发」。
   *
   * ⚠️ 旧口径 D12（按真实模型聚合、多凭据共用一个桶）**已作废**：同一个真实模型
   * 下 N 枚凭据各有自己的 `concurrency` 份槽，总并发 = N × concurrency。
   * 占用键见 `InflightLedger`（端点 id）。
   */
  concurrency: number;
  supportsVision: boolean;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  /**
   * 链快照里的冷却截止时刻 —— **恒为 0**(链来自 Repo,自己不带最新状态)。
   * 真实状态在 {@link HealthRegistry} 里,由 `Router.plan` 注入到 {@link health}。
   */
  cooldownUntil: number;
  /** 由 Router 注入的健康记录(内存态,D19)。`null` = 没有任何失败记录 = 可用。 */
  health: EndpointHealth | null;

  // ---- 身份 / 冷却(纯函数视图,与 Python 的 @property / 方法同形)------------

  /**
   * `"provider/model"` —— 真实模型 id。
   *
   * ⚠️ 2026-11-08 起**不再是并发账本计数键**(旧 D12 口径作废):账本按端点
   * (`endpointId`)计并发,这里只用于展示聚合与抢占标记。
   */
  readonly realModelKey: RealModelKey;

  /** 用户名(凭据的第二个分量)。 */
  readonly username: string;

  /**
   * 是否处于冷却。**墙钟比对**。
   *
   * 优先看注入的健康记录(内存态真值);没有记录时退回链快照里的 `cooldownUntil`
   * (恒为 0,即「没有失败记录 = 可用」)。
   *
   * ⚠️ 必须传 `now`(不读墙钟):调用方已经持有时刻,少一次时钟读取也少一处
   * 「同一轮里两个时刻」的不一致。
   */
  inCooldown(now: number): boolean;
}

/** 构造端点时补上的两个只读视图。 */
function withEndpointViews(seed: EndpointSeed): Endpoint {
  const endpoint = seed as Endpoint;
  const descriptors: PropertyDescriptorMap = {
    realModelKey: {
      enumerable: false,
      configurable: false,
      get(this: Endpoint): RealModelKey {
        return realModelKeyOf(this.provider, this.model);
      },
    },
    username: {
      enumerable: false,
      configurable: false,
      get(this: Endpoint): string {
        return this.credentialKey[1] ?? "";
      },
    },
    inCooldown: {
      enumerable: false,
      configurable: false,
      value(this: Endpoint, now: number): boolean {
        const rec = this.health;
        if (rec !== null && rec !== undefined) {
          return healthInCooldown(rec, now);
        }
        return this.cooldownUntil > 0 && this.cooldownUntil > now;
      },
    },
  };
  return Object.defineProperties(endpoint, descriptors) as Endpoint;
}
/** 端点链上的一项 = 一个真实模型 × 它的一枚凭据端点。 */
export interface ChainItem {
  endpoint: Endpoint;
  /** 调度算出的顺位(越小越先用);`Router` 只看**列表顺序**,这个字段是元信息。 */
  priority: number;
  /** 命中的时段禁用窗口(仅用于面板展示;**剔除由调度器做**)。 */
  blackout: unknown;
  /**
   * 这条链用的策略机器键。`least-busy` / `balanced` 靠它知道「要不要由 Router
   * 自己裁决」—— 没有它,Router 只能靠链的顺序猜,而这两个策略的顺序恰恰是
   * **没有意义的配置序**。
   */
  strategy: string;
  /**
   * 命中调度降级规则(P4 档,或时段 degrade)。
   *
   * `least-busy` / `balanced` 由 Router 按**实时在途数**裁决,不看链序 ——
   * 只把降级项排到链末对这两种策略无效。Router 见到本字段为 true 时,
   * **只要还有未降级的可用候选就跳过它**(全部降级时仍可用:降级=少用,不是禁用)。
   *
   * ⚠️ 由调度器的 `ChainItem.degraded` 透传(`chainItemFrom` 与
   * `toRouterChain` 都要保留,丢了它 P4 在负载感知策略下就失效)。
   */
  degraded?: boolean;
  /**
   * **直连条目**(真实模型直连,m02240)。直连请求:
   * - `Router.plan` 传 `ignoreCooldown: true` —— 冷却只挡后续请求,
   *   不挡「这一次」尝试(失败照常记冷却);
   * - `Router.commit` 走**抢占式** {@link InflightLedger.acquireDirect}:
   *   该**端点(凭据)**的并发槽被逻辑请求占满时,踢掉它上**最新入队**的逻辑租约,
   *   把容量让给直连(最先到达的逻辑请求保留)。⚠️ 2026-11-08 起抢占也按端点:
   *   别的凭据的租约不占这个槽,踢了没意义。
   *
   * ⚠️ 由调度器的 `ChainItem.direct` 透传而来(`chainItemFrom` 保留),
   * **不是**调用方自己填的。
   */
  direct?: boolean;
}

// ---------------------------------------------------------------------------
// 健康 / 冷却(D19:内存态)
// ---------------------------------------------------------------------------

/** 单个端点的瞬时健康。**没有记录 = 可用**(默认)。 */
export interface EndpointHealth {
  /** 连续失败次数;成功一次即清零 */
  fails: number;
  /** **墙钟 epoch 秒**(与 `Endpoint.cooldownUntil` 同口径) */
  cooldownUntil: number;
  lastError: string;
  updatedAt: number;
  /** 最后一次失败的错误类别 */
  lastKind: string;
  /** 最后一次失败的上游 HTTP 状态码(0 = 没有/未知) */
  lastStatus: number;
}

/** 构造一条空的(即「可用」)健康记录。 */
export function emptyHealth(): EndpointHealth {
  return {
    fails: 0,
    cooldownUntil: 0,
    lastError: "",
    updatedAt: 0,
    lastKind: "",
    lastStatus: 0,
  };
}

/** 重试策略 —— 端点熔断只用到 `cooldownFloorS`,但形状与 `RetryPolicy` 对齐。 */
export interface RetryPolicy {
  maxAttempts: number;
  /** 端点熔断的冷却时长(**秒**),= `retry.logicalCooldown`(分钟)× 60 */
  cooldownFloorS: number;
  baseS: number;
  factor: number;
  capS: number;
  jitterRatio: number;
  codes: ReadonlySet<string>;
}

/** 一次失败要用的冷却来源(优先级从高到低,见 `EndpointHealth.noteFailure`)。 */
export interface CooldownHint {
  /**
   * 上游给的**绝对**冷却截止时刻(epoch 秒)。给了就**忽略** floor ——
   * 不跟 `now + floor` 取 max(取 max 会把上游给的更短时刻悄悄拉长)。
   */
  until: number | null;
  /** 本次请求的重试策略;`null` = 以 0 秒进冷却(等价于「不熔断」)。 */
  policy: RetryPolicy | null;
}

/**
 * `EndpointHealth` 上的一次失败记账。**纯函数**(不读墙钟 —— 时间由调用方给)。
 *
 * 优先级(高 → 低):
 * 1. **上游显式指定** —— `hint.until`,绝对墙钟 epoch 秒(由 `Retry-After` 头算出);
 * 2. **供应商覆盖 / 全局默认** —— `hint.policy.cooldownFloorS`;
 * 3. 都没有 → `now + 0`(不熔断)。
 *
 * ⚠️ **已知的明确瞬时故障不冷却**:`timeout` / `connection` 只记账
 * (`fails` / `lastError` / `lastKind` / `lastStatus` 照旧更新),**不落
 * `cooldownUntil`**。例外:`hint.until` 仍然优先 —— 上游都明说「到 X 之前别来」
 * 了,就没有「这是瞬时抖动」的解释空间;`already_streaming` 也不豁免。
 *
 * ⚠️ 瞬时故障**不清零已存在的** `cooldownUntil`:上一次冷却还没到期时,这次抖动
 * 也无权把它缩短(只有成功能解冻)。
 *
 * `now` 缺省 = 0,便于在冻结时钟的测试里精确断言。
 */
export function noteFailure(
  health: EndpointHealth,
  opts: {
    error?: string;
    kind?: string;
    status?: number;
    now?: number;
    hint?: CooldownHint | null;
  } = {},
): EndpointHealth {
  const now = opts.now ?? 0;
  const until = opts.hint?.until ?? null;
  const kind = opts.kind ?? "";
  const error = (opts.error ?? "").slice(0, 200);
  const status = Number.isFinite(opts.status ?? 0) ? Math.trunc(opts.status ?? 0) : 0;

  const next: EndpointHealth = {
    ...health,
    fails: health.fails + 1,
    lastError: error,
    lastKind: kind,
    lastStatus: status,
    updatedAt: now,
  };

  if (until !== null && Number.isFinite(until)) {
    // 上游指定时刻:直接落,**不跟 now + floor 取 max**。
    next.cooldownUntil = Number(until);
    return next;
  }
  if (TRANSIENT_KINDS.has(kind)) {
    // 已知瞬时故障:只记账,不熔断。⚠️ 不清零已有的 cooldownUntil。
    return next;
  }
  const floor = opts.hint?.policy ? Number(opts.hint.policy.cooldownFloorS) : 0;
  next.cooldownUntil = now + (Number.isFinite(floor) ? floor : 0);
  return next;
}

/** 成功即清零并解冻 —— 一次网络抖动不该让端点背 60s 黑锅。 */
export function noteSuccess(health: EndpointHealth, now: number): EndpointHealth {
  return {
    ...health,
    fails: 0,
    cooldownUntil: 0,
    lastError: "",
    lastKind: "",
    lastStatus: 0,
    updatedAt: now,
  };
}

/** 是否处于冷却 —— **墙钟比对**。 */
export function inCooldown(
  health: EndpointHealth,
  now: number,
): boolean {
  if (health.cooldownUntil <= 0) {
    return false;
  }
  return health.cooldownUntil > now;
}

/** `healthInCooldown` 的别名(端点视图用;语义与 {@link inCooldown} 相同)。 */
const healthInCooldown = inCooldown;

// ---------------------------------------------------------------------------
// 选路结果
// ---------------------------------------------------------------------------

/** 未选到端点时的原因。成功时 `Plan.reason` 是 `affinity` / `ordered` 等。 */
export const PLAN_FAILURE_REASONS = [
  "all_blackout",
  "all_cooldown",
  "all_busy",
] as const;

/**
 * 一次选路的结果。
 *
 * ⚠️ v3 的 `no_such_model` **已删除**:网关侧模型名是否存在由 `Scheduler.chain()`
 * 判定,选路器只看得到一条链,从一条**空链**根本分不出「模型不存在」与「全被时段
 * 禁用剔除」。
 */
export interface Plan {
  item: ChainItem | null;
  /** 未选到时的原因(见 {@link PLAN_FAILURE_REASONS});选到时是选择路径名 */
  reason: string;
  /** 是否走了会话亲和 */
  byAffinity: boolean;
}

/** 构造一个选路结果。 */
export function planResult(
  item: ChainItem | null,
  reason: string,
  byAffinity = false,
): Plan {
  return { item, reason, byAffinity };
}

// ---------------------------------------------------------------------------
// 在途租约 / 保留区
// ---------------------------------------------------------------------------

/**
 * 一条在途租约 —— 不只是计数,还要能回答「谁在用、用了多久」。
 *
 * ⚠️ `sessionId` **不对外展示**:派生出来的不可读(`"模型名:sha256前32位"`),
 * 而客户端显式传的可能是邮箱 / 工单号,回显到页面等于把用户自己起的标识当日志
 * 公开。对外只有 {@link seq} 与 {@link convNo} 两个整数。
 */
export interface InflightLease {
  /** 唯一句柄,`acquire` 返回 */
  leaseId: string;
  /** 对外展示用的运行序号(不重复、可读) */
  seq: number;
  /** 真实模型 id(**展示聚合口径**;2026-11-08 起不再是容量计数键) */
  realModelId: RealModelKey;
  /** 真实模型 × 该 provider 的一枚凭据 */
  endpointId: EndpointId;
  /** 客户端要的那个名字 —— 可能是逻辑模型,也可能是**直连的真实模型**。 */
  logicalModel: string;
  /** 只用于内部分组,**不出现在任何对外响应里** */
  sessionId: string;
  stream: boolean;
  /** monotonic 秒 */
  startedAt: number;
  /** monotonic 秒 */
  expiresAt: number;
  /**
   * 对外展示用的**会话序号**:按 `sessionId` 分配,同一会话永远同号,
   * 不同会话按首次出现递增,从 1 起,**重启清零**。
   * `0` = 这条请求**没有会话 id**(不编号)。
   */
  convNo: number;
  /**
   * 直连请求占用(m02240):`true` = 可抢占逻辑租约,且**不被**逻辑请求抢占。
   * 缺省 / `false` = 普通逻辑成员占用。
   */
  direct?: boolean;
}

/**
 * 被直连请求抢占的逻辑租约:记入账本失败记录的 error 文本(m02240)。
 *
 * 与 `scheduler/engine.ts` 的同名常量同源同值 —— 两侧账本是同一套抢占语义的
 * 两个视图,文案分家会让面板上同一种故障显示成两句话。
 */
export const PREEMPT_ERROR = "preempted by direct request";

/**
 * **抢占通知**:租约被直连请求挤掉时,账本回调这个函数(m02240)。
 *
 * ⚠️ **只放账本槽位是不够的** —— 受害方的 HTTP 请求还在真实上游占着连接。
 * 直连请求拿到的是「账面上的空位」,上游那边照样限流。所以抢占必须能把
 * 受害方的上游调用**真的打断**,让它立刻退出、把真实并发位还回去。
 *
 * 回调约定:
 * - **同步**执行(账本在 `acquireDirect` 里直接调),所以它只能做「标记 +
 *   触发中断」这类快动作,不能 await;
 * - 抛异常**不能**影响抢占本身(账本会吞掉);
 * - 回调被调用时,那条租约**即将**被释放 —— 持有方收到通知后不要再
 *   `finish(ok:false)`(那是「上游失败」的口径,会给无辜端点记一次冷却);
 *   改用 `finish(preempted: true)`。
 */
export type PreemptNotifier = (reason: string) => void;

/** 一次请求(一条租约)的**收尾数据** —— 调用方按实际知道的填。 */
export interface RequestOutcome {
  ok: boolean;
  status: number;
  error: string;
  /** 整段延迟(毫秒)。**含**连接 / 排队 / 生成全过程。 */
  latencyMs: number;
  /** 首字延迟(毫秒)。非流式传 `null`。 */
  ttftMs: number | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

/**
 * 一条**已结束**的租约 —— 「运行中」区块要能看见它,而不是一结束就消失。
 *
 * ⚠️ 2026-10-15 用户改口:保留区**只按条数**清,不再有时间窗。
 */
export interface CompletedRequest {
  lease: InflightLease;
  /** monotonic 秒 */
  finishedAt: number;
  ok: boolean;
  status: number;
  error: string;
  latencyMs: number;
  ttftMs: number | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

// ---------------------------------------------------------------------------
// 常量(与 `nexus/core/router.py` 同名常量一一对应)
// ---------------------------------------------------------------------------

/** 在途租约租期(秒)。请求结束就释放;租期只是「回调漏触发」的保险。 */
export const DEFAULT_LEASE_SECONDS = 600.0;

/**
 * **已结束**请求的保留时长(秒)。
 *
 * ⚠️ **已退役**(2026-10-15):保留区只按**条数**控制。常量保留是为了不破坏既有
 * 构造点 / 测试,但清理逻辑里已经**没有任何时间窗**。
 */
export const DEFAULT_RETAIN_SECONDS = 180.0;

/** 保留区的**兜底**容量上限(只在容量提供函数缺失 / 抛错时兜底)。 */
export const DEFAULT_MAX_RECENT = 200;

/** 会话粘住租期(秒)。**与在途租期是两件事** —— 一场会话可能连续几十分钟。 */
export const DEFAULT_PIN_SECONDS = 900.0;

/** 默认的「实时日志」显示 / 保留容量(设置键 `ui.recentLimit` 缺省 / 读坏时)。 */
export const DEFAULT_RECENT_LIMIT = 50;

/**
 * `retry.logical_cooldown` 的**默认值(分钟)**,与 Nexus
 * `nexus/core/backoff.py:RETRY_DEFAULTS["retry.logical_cooldown"] = 15` 同源。
 *
 * ⚠️ 这个常量**不是**给 Router 自己发明缺省值用的 —— Nexus 里它是
 * `retry_setting()` 的**播种值**:键缺失时先把默认值写回库再回读,所以 Router
 * 拿到的永远是「库里的值」。这里没有可写的库,只能在读不到时**等价地**取它。
 * 所以「配置里没有这个键」= 900 秒冷却,**不是**「不熔断」。
 */
export const DEFAULT_LOGICAL_COOLDOWN_MIN = 15;

/**
 * Python `float()` 认的字面量形状(不接受 `0x10` / `Infinity` / 尾随垃圾)。
 *
 * ⚠️ 与 Python 的唯一差别:下划线分隔符(`"1_000"`)不支持 —— 那是人手填设置时
 * 不会出现的形状,而 JS 的 `Number()` 本身不认它,支持它反而要多一条剥下划线的
 * 分支。这里选择「不认 → 落回默认值」。
 */
const PY_FLOAT_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Python `int()` 认的字面量形状(可选符号 + 纯数字,两侧空白已去掉;不含下划线)。 */
const PY_INT_RE = /^[+-]?\d+$/;

/**
 * 读一个**数值型** retry 设置 —— 与 Nexus
 * `nexus/core/backoff.py:_coerce_number` + `retry_setting` 等价。
 *
 * ⚠️ **类型由默认值决定,不由输入决定**:库里存的是字符串,`"4"` 与 `"4.0"` 在
 * Python 侧长得一样,`int(value)` 把 `"4.9"` 截成 `4`(默认值是 `int` 时)。
 * ⚠️ 非法值(空串 / 非数字 / 负数)→ 返回**默认值**:Nexus 会「记错 + 写回默认 +
 * 回读」,所以调用点看到的是默认值,而不是 0。
 */
export function coerceRetryNumber(raw: unknown, fallback: number): number {
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  if (text === "" || !PY_FLOAT_RE.test(text)) {
    return fallback;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.trunc(value);
}

/**
 * 读一个**整数**设置 —— 与 Nexus `Router._recent_limit` 里的 `int(raw or default)`
 * 等价(Python `int()` 不吃 `"3.9"`,那会抛 `ValueError` → 落回默认值)。
 *
 * @returns 解析出的整数;缺失 / 非法 / `< min` 一律返回 `fallback`。
 */
export function parseStrictInt(raw: unknown, fallback: number, min = 1): number {
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  if (text === "" || !PY_INT_RE.test(text)) {
    return fallback;
  }
  const value = Number(text);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

/** 会话序号表(`sessionId -> convNo`)的容量上限,超限按 FIFO 淘汰最旧的一条。 */
export const CONV_ORDER_LIMIT = 2048;

/**
 * **负载感知策略** —— 选择动作在 `Router` 里做,不在调度器里。
 *
 * ⚠️ 这两个策略要看**实时**在途数,而 `Scheduler.chain()` 的产出会被按分钟
 * 记忆化。拿分钟级快照去「挑最闲的那台」等于挑了个寂寞:链算出顺序的那一刻和
 * 真正派发的那一刻之间,在途数可能已经变了 N 次。
 */
export const LOAD_AWARE_STRATEGIES: ReadonlySet<string> = new Set<string>([
  "least-busy",
  "balanced",
]);

// ---------------------------------------------------------------------------
// 现拼标识符(独立出来是为了让 core 层不必反向依赖 db 层)
// ---------------------------------------------------------------------------

/** `(provider, model)` → `"provider/model"`。真实模型对外 id / 并发账本计数键。 */
export function realModelKeyOf(provider: string, model: string): RealModelKey {
  return `${provider}/${model}`;
}

/** `(provider, model, username)` → `"<provider>/<model>@<provider>/<username>"`。 */
export function endpointIdOf(
  provider: string,
  model: string,
  username: string,
): EndpointId {
  return `${provider}/${model}@${provider}/${username}`;
}

/** `Endpoint` → 真实模型 id(展示聚合口径;容量键是 {@link endpointIdOf})。 */
export function realModelKeyOfEndpoint(endpoint: Endpoint): RealModelKey {
  return realModelKeyOf(endpoint.provider, endpoint.model);
}

/** `Endpoint` → 端点身份键。 */
export function endpointIdOfEndpoint(endpoint: Endpoint): EndpointId {
  return endpointIdOf(endpoint.provider, endpoint.model, endpoint.credentialKey[1]);
}

/** `Endpoint` → 用户名(凭据的第二个分量)。 */
export function usernameOf(endpoint: Endpoint): string {
  return endpoint.credentialKey[1] ?? "";
}

// ---------------------------------------------------------------------------
// 端点构造(供测试与调用方;等价于 `Endpoint.from_dict`)
// ---------------------------------------------------------------------------

/**
 * 端点链快照的输入形状 —— 只取选路用得上的字段。
 *
 * 接受 `provider` / `model` / `credentialKey` 为主,也容忍 v3 的
 * `providerId` / `upstreamId` / `accountId`(db 层重写期间两边混跑不会直接崩)。
 *
 * ⚠️ 用 `EndpointSeed` 表达「除了两个只读视图之外都可选」——
 * `realModelKey` / `username` / `inCooldown` 由 {@link withEndpointViews} 现拼,
 * 调用方**不该**填(填了也会被覆盖)。
 */
export type EndpointSnapshot = Partial<EndpointSeed> & {
  providerId?: string;
  upstreamId?: string;
  accountId?: string;
  username?: string;
  credentialKey?: CredentialKey | string | readonly string[];
};

/** 端点的可写字段(两个只读视图除外)。 */
export type EndpointSeed = Omit<
  Endpoint,
  "realModelKey" | "username" | "inCooldown"
>;

function credentialKeyOf(
  data: EndpointSnapshot,
  provider: string,
): CredentialKey {
  const cred: unknown = data.credentialKey;
  if (Array.isArray(cred) && cred.length >= 2) {
    return [String(cred[0] || provider), String(cred[1])];
  }
  if (typeof cred === "string" && cred !== "") {
    const at = cred.indexOf("/");
    if (at >= 0) {
      const head = cred.slice(0, at);
      return [head || provider, cred.slice(at + 1)];
    }
    return [provider, cred];
  }
  const username = data.username ?? data.accountId ?? "";
  return [provider, String(username)];
}

/** 从快照构造端点(等价于 `Endpoint.from_dict`)。 */
export function endpointFrom(data: EndpointSnapshot): Endpoint {
  const provider = String(data.provider ?? data.providerId ?? "");
  const model = String(data.model ?? data.upstreamId ?? "");
  const credentialKey = credentialKeyOf(data, provider);
  const endpointId =
    data.endpointId && String(data.endpointId) !== ""
      ? String(data.endpointId)
      : endpointIdOf(provider, model, credentialKey[1]);
  // ⚠️ 缺省 1 只是**形状兜底**:真实的供应商级缺省在装配层用
  // `config/concurrency-defaults.ts` 的 defaultConcurrencyOf(provider) 填好,
  // 走到这里时 concurrency 一定是显式值(本文件刻意不 import 运行时模块)。
  const concurrencyRaw = data.concurrency ?? 1;
  return withEndpointViews({
    endpointId,
    provider,
    model,
    credentialKey,
    protocol: data.protocol ?? "openai",
    baseUrl: data.baseUrl ?? null,
    region: data.region ?? null,
    concurrency:
      typeof concurrencyRaw === "number" && Number.isFinite(concurrencyRaw)
        ? Math.max(1, Math.trunc(concurrencyRaw))
        : Number.parseInt(String(concurrencyRaw), 10) > 0
          ? Number.parseInt(String(concurrencyRaw), 10)
          : 1,
    supportsVision: Boolean(data.supportsVision),
    maxInputTokens: data.maxInputTokens ?? null,
    maxOutputTokens: data.maxOutputTokens ?? null,
    cooldownUntil: Number(data.cooldownUntil) || 0,
    health: null,
  });
}

/** 端点链快照的输入形状。 */
export type ChainItemSnapshot = Partial<Omit<ChainItem, "endpoint">> & {
  endpoint: EndpointSnapshot;
};

/** 从快照构造链项(等价于 `ChainItem.from_dict`)。 */
export function chainItemFrom(data: ChainItemSnapshot): ChainItem {
  return {
    endpoint: endpointFrom(data.endpoint),
    priority: Number(data.priority) || 0,
    blackout: data.blackout ?? null,
    strategy: data.strategy ?? "",
    // ⚠️ degraded 必须透传:least-busy / balanced 不看链序,只认这个标记。
    degraded: data.degraded === true,
    // ⚠️ direct 必须透传:丢了它,直连请求就走不上 m02240 的抢占语义
    // (plan 的 ignoreCooldown / commit 的 acquireDirect 都靠它判定)。
    direct: data.direct === true,
  };
}

// ---------------------------------------------------------------------------
// 设置读取(与 Nexus 的 `get_setting("<字面量键>")` 对齐的键名)
// ---------------------------------------------------------------------------

/** `scheduler.rules` —— 旧单键(2026-10-22 拆 5 键后仅迁移期回落读取)。 */
export const SETTING_SCHEDULER_RULES = "scheduler.rules";

/** `scheduler.cooldown_overrides` —— 供应商冷却覆盖唯一入口(2026-10-21 拆出独立键)。 */
export const SETTING_COOLDOWN_OVERRIDES = "scheduler.cooldown_overrides";

/** `retry.logical_cooldown` —— 全局冷却兜底,**单位是分钟**。 */
export const SETTING_LOGICAL_COOLDOWN = "retry.logical_cooldown";

/** `ui.recent_limit` —— 「实时日志」显示 / 保留容量(1-500)。 */
export const SETTING_RECENT_LIMIT = "ui.recent_limit";
