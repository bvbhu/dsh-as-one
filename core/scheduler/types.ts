/**
 * As One — scheduler core 领域类型(框架无关,零依赖)。
 *
 * 移植自 D:\projects\nexus(Nexus LLM 聚合网关)的调度侧:
 *  - nexus/scheduler/engine.py(档位排序、分桶、时段规则、额度快照)
 *  - nexus/core/router.py 的 plan/commit/finish 语义(会话亲和、冷却、在途租约)
 *  - nexus/core/backoff.py(backoff_delay、RetryPolicy)
 *
 * 本文件只声明类型与接口,**不 import db / connector / fastapi / electron**。
 * 与持久层对接统一走本文件定义的注入接口(SettingsRepo / SchedulerRepo /
 * ProviderRegistry / AccountPool / InflightLedgerLike),由上层 adapter 实现。
 */

// ---------------------------------------------------------------------------
// 基本标识符
// ---------------------------------------------------------------------------

/**
 * 真实模型键,形如 `"provider/model"`。
 *
 * ⚠️ 2026-11-08 起**不再是在途租约的计数键**(并发按凭据/端点计),只用于展示聚合。
 * 排序键仍用它。
 */
export type RealModelId = string;

/** 额度快照键,形如 `"provider/username"`(D17)。 */
export type QuotaKey = string;

/** 会话标识(内部使用;响应里永不出现)。 */
export type SessionId = string;

/** 在途租约句柄(acquire 的返回值,单调递增序号字符串)。 */
export type LeaseId = string;

/**
 * **抢占通知**:租约被直连请求挤掉时,账本回调这个函数(m02240)。
 *
 * ⚠️ **只放账本槽位是不够的** —— 受害方的上游请求还在真实上游占着连接。
 * 直连请求拿到的是「账面上的空位」,上游那边照样限流。所以抢占必须能把
 * 受害方的上游调用**真的打断**,让它立刻退出、把真实并发位还回去。
 *
 * 回调约定:
 * - **同步**执行(账本在 `acquireDirect` 里直接调),只能做「标记 + 触发
 *   中断」这类快动作,不能 await;
 * - 抛异常**不能**影响抢占本身(账本会吞掉);
 * - 回调被调用时,那条租约**即将**被释放 —— 持有方收到通知后不要再按
 *   「上游失败」收尾(那会给无辜端点记一次冷却),改用抢占口径收尾。
 *
 * ⚠️ 本类型在 `router/types.ts` 有一份**同义**定义(那边是运行时模块,
 * 那边还带 `PREEMPT_ERROR` 常量)。两份刻意不互相 import:`scheduler/types.ts`
 * 是**零依赖纯类型文件**,不能为了一个类型破例引入运行时依赖。
 */
export type PreemptNotifier = (reason: string) => void;

/** 调度策略机器键。 */
export type StrategyName =
  | "due-first"
  | "random"
  | "ordered-fallback"
  | "least-busy"
  | "balanced";

/** 档位层号:T1 免费 < T2 赠送额度 < T3 消耗 < T4 高峰期降级。 */
export type Tier = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// 配置 / 规则
// ---------------------------------------------------------------------------

/** 时段跨度,`"HH:MM"` 字面量对(支持 `24:00` 作跨午夜右端)。 */
export type TimeSpan = [string, string];

/** 黑名单/窗口表达(展示与 is_blackout 判定用)。weekdays: 1=周一 .. 7=周日。 */
export interface BlackoutWindow {
  weekdays?: number[];
  times: TimeSpan[];
}

/** 扁平 rules 数组里的一条(校验清洗后的形状;字段全部可选)。 */
export interface Rule {
  provider: string;
  model?: string;
  expires_at?: string;
  priority?: number;
  /** 时段限定(收进嵌套对象,见 config/types.ts ``SchedulerWindow``)。 */
  window?: RuleWindow;
}

/** 规则的时段限定(清洗后形状)。 */
export interface RuleWindow {
  weekdays?: number[];
  times?: TimeSpan[];
}

/** 派生视图:免费名单条目(config 顺序即名单序)。 */
export interface FreeEntry {
  provider: string;
  model: string;
  expiresAt: string | null;
}

/** 派生视图:时段规则(一律全局生效,logical="*")。 */
export interface WindowRule {
  logical: string;
  provider: string;
  model: string;
  times: TimeSpan[];
  mode: "degrade" | "exclude";
  priority: number;
  weekdays?: number[];
}

/**
 * 静态(无时段)档位规则 —— 2026-11-07 修 P4 未生效。
 *
 * 原先只有带 ``window.times`` 的规则才会进入 ``timeWindows``(进而被
 * ``_degraded`` / ``chain`` 的 exclude 判定看到);**没有时段的 P4/P0 规则被
 * ``_readConfig`` 整条丢弃**,于是用户在设置页把某 provider 配成 P4 后它
 * 仍按默认档位参与排队。这里给无时段规则一条独立通路:
 *   - ``priority 4`` → ``mode: "degrade"`` —— 始终降级(排链末);
 *   - ``priority 0`` → ``mode: "exclude"`` —— 始终剔除(整条从链里拿掉)。
 * ``model === ""`` 表示该供应商全部模型(面板「留空 = 全部」)。
 *
 * ⚠️ P3(普通消耗档)是**基线档位**,不进本表 —— 把成员写进缺省档不该被降级。
 */
export interface StaticRule {
  provider: string;
  model: string;
  mode: "degrade" | "exclude";
  /**
   * 只在这些星期生效(1=周一..7=周日);缺省 = 每天。
   *
   * 面板允许「只勾星期、不填时间段」(见 settings-rules 的 `winOf`),这类规则
   * 没有 `times` 因此进不了 `timeWindows`(isBlackout 要求 times 非空才可能命中)。
   * 若不在这里保留星期,「只勾周三」会被当成「每天都降级」—— 正好反了。
   */
  weekdays?: number[];
}

/** 运行期配置的三组派生视图(从 scheduler.rules 扁平 rules 推导)。 */
export interface SchedulerConfig {
  rules: Rule[];
  freeModels: FreeEntry[];
  creditExpiry: Record<string, string>;
  timeWindows: WindowRule[];
  /** 无时段的静态档位规则(P4 降级 / P0 剔除)。 */
  staticRules: StaticRule[];
}

// ---------------------------------------------------------------------------
// 原始行数据(snake_case,与 Nexus dict 字段一一对应;adapter 的产出形状)
// ---------------------------------------------------------------------------

/** endpoint 原始 dict(v4 形状 + v3 别名都兼容)。 */
export interface RawEndpointData {
  endpoint_id?: unknown;
  provider?: unknown;
  provider_id?: unknown; // v3
  model?: unknown;
  upstream_id?: unknown; // v3
  credential_key?: unknown; // tuple [provider, username] | "provider/username" | 裸 username
  username?: unknown;
  account_id?: unknown;
  protocol?: unknown;
  base_url?: unknown;
  region?: unknown;
  concurrency?: unknown;
  supports_vision?: unknown;
  max_input_tokens?: unknown;
  max_output_tokens?: unknown;
  cooldown_until?: unknown;
}

/** endpoint_chain / direct_chain 的一行。 */
export interface RawEndpointRow {
  member?: unknown; // {"provider","model"} 或 "provider/model" 或 {real_model_id}
  endpoint?: RawEndpointData;
  real_model_id?: unknown; // v3 兜底
  priority?: unknown; // chain 输出时由调度器写入
  blackout?: unknown; // chain 输出时由调度器写入(展示用)
  strategy?: unknown; // chain 输出时由调度器写入
  [key: string]: unknown;
}

/** 额度快照(Repo 侧的内存实现;键 = "provider/username")。 */
export interface QuotaSnapshot {
  remaining?: number;
  expires_at?: number;
  fetched_at?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 规范化领域对象(调度结果 / 端点 / 租约)
// ---------------------------------------------------------------------------

/** 一个被调度后的成员(顺序已定;命中剔除规则者仍在此列 —— 剔除只发生在 chain)。 */
export interface ScheduledMemberData {
  realModelId: string; // "provider/model"
  priority: number; // 越小越先用
  free: boolean;
  expiresAt: number | null; // 积分到期 epoch;null = 未知(fail-closed)
  provider: string;
  model: string;
  reason: string; // 排序依据(面板展示用)
  strategy: string;
}

/** 规范化端点(引擎内部使用;由 RawEndpointData 构建)。 */
export interface EndpointData {
  endpointId: string;
  provider: string;
  model: string;
  credentialKey: [string, string]; // (provider, username)
  protocol: string;
  baseUrl: string;
  region: string;
  concurrency: number;
  supportsVision: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  cooldownUntil: number; // wall-clock epoch;<=0 = 无
  health: EndpointHealthData | null; // Router.plan 注入
}

/** 可直接喂给 Planner 的端点链条目。priority 只是元信息 —— 选路读列表顺序。 */
export interface ChainItemData {
  endpoint: EndpointData;
  priority: number;
  blackout: BlackoutWindow[] | null; // 展示用;剔除已由调度器完成
  strategy: string; // least-busy / balanced 由 Planner 实时裁决
  /**
   * 命中降级规则(P4 档或时段 degrade)标记。
   *
   * ⚠️ 为什么需要独立字段:`least-busy` / `balanced` 由 Planner 按**实时在途数**
   * 裁决,根本不看链序 —— 只把降级项排到链末对这两种策略**毫无作用**。
   * 2026-11-07 修 P4 时一并加上,让选路器也能看到「这台该少用」。
   */
  degraded?: boolean;
  /** 直连条目(成员链外,凭据直连):commit 时走抢占式 acquireDirect。 */
  direct?: boolean;
}

/** Planner.plan() 的结果。 */
export interface PlanData {
  item: ChainItemData | null;
  reason: string; // "affinity" / "ordered" / "least_busy" / "balanced" / 失败原因
  byAffinity: boolean;
  readonly failed: boolean; // item 为空
  direct?: boolean; // 命中直连条目(m02240 抢占语义)
}

/** 端点健康(可变;冷却语义的载体)。 */
export interface EndpointHealthData {
  fails: number;
  cooldownUntil: number; // wall-clock epoch;<=0 = 无冷却
  lastError: string;
  updatedAt: number;
  lastKind: string;
  lastStatus: number;
}

/** 在途租约(不可变快照;elapsedS 由调用方按当前时刻计算)。 */
export interface InflightLeaseData {
  leaseId: string;
  seq: number;
  realModelId: string; // 账本计数键 "provider/model"
  endpointId: string;
  logicalModel: string;
  sessionId: string; // 内部使用,永不进响应
  stream: boolean;
  startedAt: number; // monotonic
  expiresAt: number; // monotonic
  convNo: number; // 会话内序号(从 1;无 session = 0)
  /** 直连请求占用(true = 可抢占逻辑租约,不被逻辑请求抢占)。 */
  direct: boolean;
}

/** 已完成请求(留档用;按条数裁剪,ui.recent_limit)。 */
export interface CompletedRequestData {
  lease: InflightLeaseData;
  finishedAt: number; // monotonic
  ok: boolean;
  status: number;
  error: string;
  latencyMs: number;
  ttftMs: number | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

/** finish() 时上报的结果;全零则不下发(不计入留档)。 */
export interface RequestOutcome {
  ok: boolean;
  status: number;
  latencyMs: number;
  ttftMs: number | null;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  error: string;
}

// ---------------------------------------------------------------------------
// backoff 领域类型
// ---------------------------------------------------------------------------

/** backoff_delay 的参数(与 Nexus backoff_delay(*, attempt, base_s, factor, cap_s, jitter_ratio, rng) 对齐)。 */
export interface BackoffParams {
  attempt: number;
  baseS: number;
  factor?: number; // 缺省 DEFAULT_FACTOR=2.0
  capS: number;
  jitterRatio: number;
  rng?: Rng; // 缺省系统随机源;测试注入 SeededRng
}

/** RetryPolicy 的不可变数据。 */
export interface RetryPolicyData {
  maxAttempts: number;
  cooldownFloorS: number;
  baseS: number;
  factor: number;
  capS: number;
  jitterRatio: number;
  codes: ReadonlySet<string>;
}

/** should_retry 的入参(鸭子类型,对齐 Python 异常对象属性)。 */
export interface RetryableErrorLike {
  reset_deadline?: number; // wall-clock epoch
  retryable?: boolean | null;
  kind?: string | { value?: string; name?: string };
  http_status?: number | string;
  status_code?: number | string;
}

/** 随机源(可注入;测试用 SeededRng 保证确定性)。 */
export interface Rng {
  random(): number; // [0, 1)
  uniform(min: number, max: number): number;
  shuffle<T>(arr: T[]): void;
}

// ---------------------------------------------------------------------------
// 注入接口(与 db / connector 的对接边界)
// ---------------------------------------------------------------------------

/** 设置存取(engine 只经此读写字符串配置;adapter 落到 SQLite/内存表)。 */
export interface SettingsRepo {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
}

/**
 * 调度器所需的最小 Repo 契约(引擎与 db 的唯一对接面)。
 * 字段形状对齐 Nexus Repo 的端点:endpoint_chain / direct_chain / members_of /
 * logical_model_row / quotas / settings。
 */
export interface SchedulerRepo extends SettingsRepo {
  /** 逻辑模型 → strategy 行;不是逻辑模型 → null。 */
  logicalModelRow(name: string): Record<string, unknown> | null;
  /** 逻辑模型成员数组(数组顺序 = 配置序);非逻辑模型 → null。 */
  membersOf(name: string): unknown[] | null;
  /** 逻辑模型的端点链(按凭据序展开;每行带 member/endpoint)。 */
  endpointChain(name: string): RawEndpointRow[];
  /** 真实模型直连链(裸 endpoint dict 行,凭据序)。 */
  directChain(name: string): RawEndpointRow[];
  /** 全部额度快照,键 "provider/username"。 */
  quotas(): Record<string, QuotaSnapshot>;
  /** 全部设置行(播种迁移用)。 */
  settings(): Record<string, string>;
}

/** Provider 注册表(真实模型元数据)。 */
export interface ProviderRegistry {
  providerExists(provider: string): boolean;
  modelsOf(provider: string): ModelId[];
  concurrencyOf(provider: string, model: string): number;
  isVision(provider: string, model: string): boolean;
  maxInputTokensOf(provider: string, model: string): number;
  maxOutputTokensOf(provider: string, model: string): number;
}

/** 账户池(每个 provider 的凭据用户名集合)。 */
export interface AccountPool {
  accountsOf(provider: string): string[];
}

/**
 * 直连抢占策略(m02240 用户决策):
 * 直连(real model 直连)请求的优先级高于任何 logical model 成员。当直连请求到达
 * 而目标**端点(凭据)**的并发槽已满(被逻辑请求占满)时,允许释放(打断)该端点
 * 上**最新入队**的逻辑租约(最不影响其余逻辑请求的 FCFS 次序;最先到达者保留),
 * 把容量让给直连请求;逻辑模型内部仍然先到先得(FCFS),互不抢占。
 * 被抢占的逻辑请求由账本记一条失败记录(见 PREEMPT_ERROR),并发槽即刻释放,
 * 由调用方按既有重试策略重试——账本记账不泄漏。
 *
 * ⚠️ 2026-11-08 并发按凭据计后,抢占也按**端点**粒度:只踢同一凭据上的逻辑租约。
 */
export interface AcquireOptions {
  /** 端点 id(`provider/model@username`)= **容量键**(按凭据计并发)。 */
  endpointId?: string;
  logicalModel?: string;
  sessionId?: string;
  stream?: boolean;
  /** 直连请求(external "direct" 占用,可抢占逻辑租约)。 */
  direct?: boolean;
  /**
   * 被抢占时的通知回调(m02240)—— 直连请求挤掉这条租约时被调用。
   *
   * ⚠️ 与 `router/inflight-ledger.ts` 的同名能力**同源同义**:两份账本是
   * 同一套抢占语义的两个视图,行为分家会让「谁被抢了」在不同宿主里不一致。
   */
  onPreempt?: PreemptNotifier;
}

export interface ReleaseOptions {
  outcome?: RequestOutcome | null;
  now?: number;
}

/**
 * 在途账本接口。
 *
 * ⚠️ 2026-11-08 用户改口:容量键从真实模型改成**端点(凭据)**,`concurrency` 是
 * **每个凭据**同时能跑几个请求 —— concurrency=1 + 3 个凭据 = 3 并发。
 * `inFlight` / `hasRoom` / `hasPreemptable` / `releaseBucket` 的参数因此都是
 * **端点 id**(`provider/model@username`)。`snapshot()` 仍按真实模型聚合(展示契约)。
 */
export interface InflightLedgerLike {
  inFlight(capacityKey: string, now?: number): number;
  hasRoom(capacityKey: string, concurrency: number, now?: number): boolean;
  /**
   * 该端点(凭据)上是否还有**可被抢占的逻辑租约**(m02240)—— 直连请求专用:
   * 桶满了的时候,只有「还剩一条逻辑租约」才谈得上抢占。
   *
   * ⚠️ 只数**非直连**租约:直连之间不互抢。
   */
  hasPreemptable(capacityKey: string, now?: number): boolean;
  acquire(realModelId: string, opts: AcquireOptions, now?: number): LeaseId;
  /**
   * 直连抢占式获取:该**端点**的并发槽满时踢掉它上面最新入队的非直连(逻辑)租约
   * (记 PREEMPT_ERROR 失败记录),让出容量给直连请求;无可抢占对象(全为直连
   * 在途)或有空位时走普通 acquire。返回 null = 无可抢占槽。
   */
  acquireDirect(
    realModelId: string,
    concurrency: number,
    opts: AcquireOptions,
    now?: number,
  ): LeaseId | null;
  touch(leaseId: string, now?: number): boolean;
  release(leaseId: string, opts?: ReleaseOptions): boolean;
  releaseBucket(capacityKey: string, now?: number): number;
  snapshot(now?: number): Record<string, number>; // {real_model_id: count}(展示口径)
  detail(now?: number): InflightLeaseData[];
  total(now?: number): number;
  recent(limit?: number, now?: number): CompletedRequestData[];
  reset(capacityKey?: string): void;
}

/** Scheduler.snapshot() 的结构化形状(Nexus engine.snapshot 对应)。 */
export interface SchedulerSnapshot {
  ttl_seconds: number;
  quota_loaded: boolean;
  quota_age_s: number | null;
  strategies: string[];
  default_strategy: string;
  free_prefixes: string[];
  free_order: string[];
  credit_expiry: Record<string, string>;
  windows: WindowRule[];
  load_aware_strategies: string[];
  quota_refresh: {
    providers: string[];
    wired: boolean;
    min_interval_s: number;
    last_at: number | null;
    triggers: number;
  };
  last_plan: Record<string, unknown>;
}

/** Planner.snapshot() 的结构化形状(Nexus Router.snapshot 对应)。 */
export interface PlannerSnapshot {
  inflight: Record<string, number>;
  inflight_total: number;
  inflight_key: string;
  pin_seconds: number;
  pins: number;
  health: HealthSnapshot;
}

/** HealthRegistry.snapshot() 的形状(items 值即 EndpointHealthData,TS 侧 camelCase)。 */
export interface HealthSnapshot {
  tracked: number;
  cooling: number;
  items: Record<string, EndpointHealthData>;
}

/** 模型名(原始字符串)。 */
export type ModelId = string;
