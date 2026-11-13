/**
 * As One 管理面板共享契约(renderer / preload / main 三端 type-only)。
 *
 * 契约目标:页面结构 1:1 对齐 Nexus 面板(用户 m07680),因此本文件的数据形状
 * 全部以 Nexus 面板后端 api 形状为准镜像命名与结构;As One 主进程装配层
 * (src/main/assembly.ts)按本契约返回数据 —— 核心层真实可算的字段给真实值,
 * 核心层不具备的子系统的字段给诚实的"不支持/空"形状(如 credits.not_applicable、
 * checkin.supported=false),页面仍渲染相同元素。
 *
 * 方法名 ↔ IPC:RendererApi 方法名即 ipcMain.handle("as-one:panel") 的 method。
 */

// ─────────────────────────── 基础形状 ───────────────────────────

export type ProviderKind = "channel" | "endpoint";

export interface AccountInfo {
  index: number;
  env_var: string | null;
  has_key: boolean;
  key_fp: string | null;
  label: string | null;
  source: string | null;
  enabled: boolean;
}

export interface ProviderState {
  provider: string;
  env_prefix: string | null;
  kind: ProviderKind;
  base_url: string | null;
  model_count: number;
  exists: boolean;
  readable: boolean;
  error: string | null;
  count: number;
  accounts: AccountInfo[];
  login: { logged_in: boolean; reason: string | null } | null;
}

export interface GatewayStatus {
  ready: boolean;
  reason: string | null;
  uptime_s: number;
  deployments: number;
  healthy_count: number;
  cooldown_count: number;
  metrics_enabled: boolean;
  metrics_generated_at: string | null;
  providers: ProviderState[];
}

// ─────────────────────────── 总览 · 运行中 ───────────────────────────

export interface InflightLease {
  seq: number;
  conv: string | null;
  real_model_id: string;
  logical_model: string | null;
  endpoint_id: string;
  stream: boolean;
  elapsed_s: number;
}

export interface RecentRequest {
  seq: number;
  conv: string | null;
  real_model_id: string;
  logical_model: string | null;
  endpoint_id: string;
  stream: boolean;
  ok: boolean;
  status: number | null;
  error: string | null;
  latency_ms: number | null;
  ttft_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_tokens: number | null;
  tps: number | null;
  finished_s_ago: number | null;
}

export interface InflightLogicalGroup {
  /** 空字符串 "" 表示直连(无逻辑模型)。 */
  logical_model: string;
  in_flight: number;
  real_models: string[];
  leases: InflightLease[];
}

/**
 * 某个 DSH 会话**当前请求**的真实模型 —— 输入框内徽标(`conversation.input.left`)
 * 用的数据形状。
 *
 * 为什么需要:用户选的是**逻辑模型**(`auto` / `free` / 自建档链),真正应答的却是
 * 链里某个真实模型;选路发生在请求时刻、网关内部(due-first / random / 亲和 /
 * 抢占 / 失败换成员),DSH 侧完全看不到 —— 「这条消息到底发给了谁」在界面上是黑洞。
 *
 * ⚠️ 语义是「**当前**」,不是「上次」(2026-11-01 用户定案,取代上一版
 * `SessionRoute` 的「上次实际使用」):
 * - 有请求在跑(`in_flight: true`)→ 那个请求**正在用**的真实模型(账本在途租约,
 *   精确值,不是推断);
 * - 空闲 → 会话亲和 pin 指向、且**仍在当前候选链里**的成员(下一条消息预计使用);
 * - 都查不到 → 调用方返回 `null`,界面**什么都不画**。宁可空着,不编一个「上次是 X」。
 */
export interface SessionCurrentRoute {
  /** 客户端要的名字(逻辑模型名;直连时是 `provider/model`)。 */
  logical_model: string | null;
  /**
   * 逻辑模型的人话展示名(如 `Auto`);库里没有(`display_name` 为空/未填)时
   * **已由服务端回退成 `logical_model` 本身**,所以正常情况非 null。
   *
   * 只有 `is_logical` 为 true 时才有意义 —— 直连时 `logical_model` 就是
   * `provider/model`,不该拿它当名字。
   */
  logical_display_name: string | null;
  /** 账本键 `"provider/model"`。 */
  real_model_id: string;
  provider: string;
  model: string;
  /** `real_model.name` 人话展示名(如 `Qwen3.8-Flash`);库里没有则 null。 */
  display_name: string | null;
  /**
   * provider 的人话展示名(如 `Qoder`),来源是唯一映射
   * `@as-one/core/src/config/provider-labels.ts` —— 客户端**不要**再自己建表。
   *
   * 查不到(未知 provider)时填 `provider` 本身:宁可显示 id,不可编名。
   * 只有 `provider` 为 ""(无供应商信息)时才是 null —— 那时界面不该画标签。
   */
  provider_display_name: string | null;
  /** 确为逻辑模型(≠ 真实 model_id)时才 true —— 只有那时界面上才需要画「→」。 */
  is_logical: boolean;
  /** true = 有请求**正在跑**,这个模型就是它此刻在用的;false = 亲和钉住的下一跳。 */
  in_flight: boolean;
}


export interface RuntimeSnapshot {
  ready: boolean;
  uptime_s: number;
  in_flight_total: number;
  /**
   * `{real_model_id: 在途数}` —— **按真实模型聚合**的展示口径。
   *
   * ⚠️ 2026-11-08 起账本的容量键改成了端点/凭据(并发按凭据计),但这里**不变**:
   * 账本 `snapshot()` 逐条租约按 `lease.realModelId` 归并回来 —— 页面统计不能因
   * 内部换键而变形(3 个凭据同时在跑 = 该真实模型的 3 条在途)。
   */
  by_real_model: Record<string, number>;
  by_logical_model: InflightLogicalGroup[];
  leases: InflightLease[];
  recent: RecentRequest[];
  recent_limit: number;
}

// ─────────────────────────── 用量统计 ───────────────────────────

export type UsageRange = "all" | "7" | "30" | "90" | "365";
export type UsageGranularity = "day" | "month";
export type UsageGroup = "model" | "logical";

export interface UsageTotals {
  tokens: number;
  requests: number;
  fails: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cache_hit: number;
  cache_miss: number;
  cache_hit_rate: number | null;
  active_days: number;
}

export interface UsageSeriesModel {
  name: string;
  provider: string | null;
  tokens: number;
  percent: number | null;
  /** 被折叠序列的机器键(Nexus `_folded` 行;仅「其他」行的 folded 有条目)。 */
  key?: string;
}

export interface UsageSeries {
  key: string;
  name: string;
  provider: string | null;
  logical_model: string | null;
  tokens: number;
  requests: number;
  cache_hit: number;
  cache_miss: number;
  /** **0..1**(不是 0..100;前端 `fmtPct` 会再 ×100)。 */
  percent: number | null;
  is_other: boolean;
  /** 展开行的子行(按模型细分);group=logical 时为成员真实模型。
   *  ⚠️ head 序列(前 10)这里给明细;「其他」行的明细在 {@link folded}。 */
  models: UsageSeriesModel[];
  /** 被折叠进「其他」的序列明细(仅 is_other=true 的行有条目)。 */
  folded?: UsageSeriesModel[];
}

export interface UsageBucket {
  key: string;
  tokens: number;
  requests: number;
  fails: number;
  cache_hit: number;
  cache_miss: number;
  cache_hit_rate: number | null;
  by_series: Array<{ key: string; tokens: number }>;
  other: number;
}

export interface UsageProvider {
  provider: string;
  tokens: number;
  requests: number;
  percent: number | null;
  is_other: boolean;
  models: UsageSeriesModel[];
  /**
   * folded 为对齐 Nexus is_other 行新增,2026-10-20。
   *
   * 「其他」供应商行(is_other=true)展开后的被聚合供应商明细,形状照 Nexus
   * 后端 api_pages.py `providers[].folded[]`:每项含 provider / key / name /
   * tokens / requests / percent / models。仅当排名尾部确实有被聚合的供应商
   * 时出现;普通供应商行恒为 undefined。
   */
  folded?: Array<{
    provider: string;
    key: string;
    name: string;
    tokens: number;
    requests: number;
    percent: number | null;
    models: UsageSeriesModel[];
  }>;
}

export interface UsageHistory {
  generated_at: string;
  source: string;
  range: UsageRange;
  granularity: UsageGranularity;
  group: UsageGroup;
  from: string | null;
  to: string | null;
  last_day: string | null;
  axis: string[];
  totals: UsageTotals;
  top: UsageSeries | null;
  series: UsageSeries[];
  buckets: UsageBucket[];
  providers: UsageProvider[];
}

// ─────────────────────────── 逻辑模型 ───────────────────────────

/** 逻辑模型的一员(真实模型)名下的一枚凭据端点(Nexus `_logical_list` 的 `accounts[]`)。 */
export interface LogicalDeploymentAccount {
  /** `"<provider>/<username>"`(凭据身份,D24)。 */
  account_id: string;
  username: string;
  /** 密钥指纹(前 8 位);没有密钥 → null。**永不给明文**。 */
  account_fp: string | null;
  in_cooldown: boolean;
  cooldown_remaining_s: number;
  /** 该账号剩余额度;没有额度快照 → null。 */
  quota_remaining: number | null;
}

/**
 * 逻辑模型的一个**档位成员**(`deployments[i]` 的下标就是 priority,D13)。
 *
 * ⚠️ 粒度是**成员(真实模型)**,不是 (成员 × 账号) —— 账号明细在
 * {@link accounts} 里。以前按账号展开,3 账号的 sensenova 会让同一个档位
 * 在列表里出现 3 遍、`order` 也跟着乱。
 */
export interface LogicalDeployment {
  provider: string;
  model: string;
  real_model: string;
  real_model_id: string;
  /** 首个可用账号的用户名(展示用;完整清单见 accounts)。 */
  account_key: string | null;
  account_fp: string | null;
  order: number;
  /** D28:`hidden` 只表示「不列入 /v1/models」,**不禁止调用**。 */
  hidden: boolean;
  listed: boolean;
  exposed: boolean;
  exposed_note: string | null;
  supports_vision: boolean | null;
  /**
   * 该真实模型**支持的思考强度档位**(用户 m09328/m09937),来自
   * `real_model.supported_reasoning_efforts`。三态同 {@link DeploymentItem}。
   */
  supported_reasoning_efforts: string[] | null;
  /**
   * 该真实模型**是否允许关闭思考**(`off`);`null` = 上游没说。
   * 来自 `real_model.reasoning_allows_off`(用户 m10437)。
   */
  reasoning_allows_off: boolean | null;
  endpoint_count: number;
  accounts: LogicalDeploymentAccount[];
  blackout: boolean | null;
  /** 时段规则由调度器管(面板只展示,Nexus 同名字段)。 */
  blackout_managed_by?: string;
}

/** 策略分组(Nexus `strategy_groups[]`;页面当前不渲染,契约形状要对齐)。 */
export interface LogicalStrategyGroup {
  group_name: string;
  model_name: string;
  routing_strategy: string;
  real_models: Array<{
    real_model: string;
    account_count: number;
    orders: number[];
    supports_vision: boolean | null;
  }>;
}

export interface LogicalModelGroup {
  model: string;
  /**
   * 人话显示名(用户 m44638,2026-11-01)。`null` = 没填,UI 与 `/v1/models`
   * 回退到 `model`。调用串永远是 `model`,这一列只影响显示。
   */
  display_name: string | null;
  deployments: LogicalDeployment[];
  count: number;
  routing_strategy: string;
  strategy_label: string | null;
  order_respected: boolean | null;
  /** 成员清单(`"provider/model"`,保序 = priority 序)。 */
  members: string[];
  /** D14:`hidden` 列已删,恒 false(Nexus 同口径)。 */
  reserved: boolean;
  /** v3 残留,恒 `[]`(Nexus 同口径)。 */
  fallback_chain: string[];
  entry_alias: string | null;
  hidden: boolean;
  /**
   * 这条逻辑模型**能安全接受**的思考强度档位(用户 m09937:「设计逻辑模型的
   * reasoning_efforts 返回值」)。
   *
   * 口径 = **各档成员能力表的交集**(只把「已知」的算进来):
   * - 任一档是 `[]`(明说不支持)⇒ 整条逻辑模型 `[]`(这一档会把请求挡掉);
   * - 所有档都是 `null`(上游都没给)⇒ `null`(不拦);
   * - 其余 ⇒ 取非空名单的交集 —— 交集之外的档位发给逻辑模型,可能落到不支持
   *   它的那一档上。
   *
   * ⚠️ 这是**展示用**的安全边界,不是硬保证:网关仍按**当轮真实模型**逐档匹配
   * (`effectiveReasoningEffort`),所以链里换一档仍可能发出不同的档位。
   */
  reasoning_efforts: string[] | null;
  /** Nexus `strategy_groups`(每个逻辑模型一条,Nexus 恒单元素数组)。 */
  strategy_groups: LogicalStrategyGroup[];
}

export interface LogicalModelsWriteInput {
  model_name: string;
  /**
   * 人话显示名(用户 m44638)。三态,和 `updateRow` 的语义对齐:
   * - `undefined` = 本次不动这一列(老调用方不传也不会被清空);
   * - `""` / 空白 = 清掉,回退用 `model_name`;
   * - 非空串 = 写入。
   */
  display_name?: string | null;
  members?: string[];
  deployments?: string[];
  strategy_groups?: Array<{ group: string; members: string[] }>;
  exposed?: boolean;
  hidden?: boolean;
  routing_strategy?: string;
  fallbacks?: string[];
}

// ─────────────────────────── 模型总览(部署) ───────────────────────────

export interface DeploymentItem {
  deployment_id: string;
  real_model_id: string;
  provider: string;
  account: string;
  model: string;
  listed: boolean;
  hidden: boolean;
  direct_exposed: boolean;
  group_exposed: boolean;
  exposed: boolean;
  direct_live: boolean;
  group_live: boolean;
  live: boolean;
  endpoint_count: number;
  usable_endpoint_count: number;
  logical_models: string[];
  supports_vision: boolean | null;
  /**
   * 该真实模型**支持的思考强度档位**(用户 m09328/m09937),直接来自
   * `real_model.supported_reasoning_efforts`:
   * - `null` = 上游没给档位表(网关不拦);
   * - `[]` = 上游明说不支持思考(一律不传);
   * - 非空 = 只在名单里才发,不在则就近匹配。
   */
  supported_reasoning_efforts: string[] | null;
  /**
   * `real_model.supported_reasoning_efforts` 列的**原始文本**(未归一)。
   *
   * 2026-11-03 用户定案:面板「思考强度」显示**库里原文**,而不是归一后的数组
   * —— 归一会丢掉上游原始拼写(如 `xhigh`),只看归一结果看不出「存的≠生效的」。
   *
   * - `null` = 列是 NULL(数据库默认:网关不拦也不发);
   * - 字符串 = 列原文(通常是 JSON 数组文本,如 `["low","medium","high"]`)。
   */
  supported_reasoning_efforts_raw: string | null;
  /**
   * 该真实模型**是否允许关闭思考**(`off`);`null` = 上游没说。
   * 来自 `real_model.reasoning_allows_off`(用户 m10437)。
   */
  reasoning_allows_off: boolean | null;
  in_cooldown: boolean;
  cooldown_remaining_s: number | null;
  requests: number;
  errors: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cache_hit_rate: number | null;
  avg_ttft_ms: number | null;
  avg_tps: number | null;
  /**
   * 这两个数字**取自哪天**(`"YYYY-MMD"` 日期串;Nexus 同名字段同义)。
   * ⚠️ 不是平均延迟毫秒数 —— 那会让人以为它是第三个指标。从来没有有效计时行
   * (三列任一为 0 的日子都跳过)时为 `null`,前端据此隐藏两个徽章。
   */
  latency_day: string | null;
  concurrency: number | null;
}

export interface DeploymentList {
  deployments: DeploymentItem[];
  count: number;
  note?: string | null;
}

// ─────────────────────────── 供应商(其他供应商) ───────────────────────────

export interface CatalogModel {
  id: string;
  name: string;
  exposed: boolean;
  listed: boolean;
  /**
   * `real_model.hidden` 的投影;**`null` = 表里没有这一行**(纯上游目录项)。
   * ⚠️ 它与 `exposed` 是两件事:`exposed` = 在不在模型表里(渠道页勾选),
   * `hidden` = 是否列入 /v1/models(部署页勾选)。别拿一个反推另一个。
   */
  hidden: boolean | null;
  available: boolean;
  vision: boolean;
  context_window: number | null;
  max_output: number | null;
  rate: number | null;
  registered: boolean;
  callable: boolean;
  origin: string | null;
  endpoints: number;
  usable_endpoints: number;
  default_vision: boolean | null;
  default_context: number | null;
  default_output: number | null;
  /**
   * 上游目录给的**思考强度档位表**(用户 m09937:「真实模型直接返回数据库中记录的
   * reasoning_efforts」)。三态,直接来自 `real_model.supported_reasoning_efforts`:
   * - `null` = 上游没给档位表(网关不拦,客户端给什么发什么);
   * - `[]` = 上游明说不支持思考(一律不传);
   * - 非空 = 规范阶梯档位表(`low`/`medium`/`high`/`max`),交给统一钳制算法。
   */
  supported_reasoning_efforts: string[] | null;
  /**
   * 是否允许**关闭思考**(`off`);`null` = 上游没说。
   * 来自 `real_model.reasoning_allows_off`。
   */
  reasoning_allows_off: boolean | null;
}

export interface ModelProvider {
  id: string;
  base_url: string | null;
  /** Nexus D4 已删 `credential_provider`;As One 保留但恒填 id(面板不渲染)。 */
  credential_provider: string | null;
  /** 凭据文件路径。凭据已入库(credential 表),故与 Nexus 一致恒 `null`。 */
  credential_file: string | null;
  protocol: string;
  env_prefix: string | null;
  accounts_count: number;
  accounts_with_key: number;
  /**
   * 逐账号指纹(**与 accounts 一一对应、位置对齐**,含 `null` 空位)。
   * ⚠️ 不要过滤掉 null:过滤后数组下标就和账号对不上了。
   */
  key_fingerprints: Array<string | null>;
  has_plaintext_keys: boolean;
  models: CatalogModel[];
  /** 已登记的模型 id 列表(`provider/model`;Nexus 同名同型)。 */
  deployed_models: string[];
  /** 列入 `/v1/models` 的模型 id 列表(= `hidden = 0` 的那些)。 */
  exposed: string[];
  /** 同 {@link exposed}(Nexus 两个字段同值,保留兼容旧前端)。 */
  listed: string[];
  is_channel: boolean;
}

/** 通用写操作结果。 */
export interface ApiResult {
  ok: boolean;
  message?: string | null;
  changed?: string[];
  provider?: string;
  index?: number;
  key_fp?: string | null;
  username?: string | null;
  models?: CatalogModel[];
  fetched?: boolean;
  count?: number;
  catalogs?: CatalogModel[];
  [k: string]: unknown;
}

// ─────────────────────────── 渠道页(Trae / WorkBuddy) ───────────────────────────

export interface ChannelAccount {
  index: number;
  /**
   * **裸用户名**(不含「渠道名/」前缀)。
   *
   * ⚠️ 2026-10-30 修正:`vault.list()` 给的是 `CredentialSummary.key` =
   * `credentialKey(provider, username)` = `"workbuddy/石英的石英块"`,以前直接塞进
   * `label` 会让账号行左侧显示成「workbuddy/石英的石英块」,且拿它再拼
   * `credentialKey(pid, label)` 查额度缓存会得到 `workbuddy/workbuddy/...`(永远查不到)。
   * 用户定案:账号行左侧只写用户名。
   */
  label: string;
  /** 完整凭据键 `"provider/username"`(查额度缓存/写库要它,显示不要它)。 */
  credential_key: string;
  key_fp: string | null;
  region: string | null;
  source: string | null;
  token_expires_at_ms: number | null;
  refresh_expires_at_ms: number | null;
  last_refresh: string | null;
  /**
   * 该账号自己的额度快照(仅 trae/workbuddy 这类有额度子系统的渠道会给)。
   *
   * 统一账号行要「一行一个账号、右侧摆剩余积分/最近到期」,而 `ProviderPage.credits`
   * 只有一个口径(第一把有密钥的账号)—— 多账号时那三行只能全摆同一份数字,等于撒谎。
   * 故在账号行上再带一份 per-account 快照;null = 这个账号还没拉过额度。
   */
  credits?: ChannelCredits | null;
}

export interface CreditPackage {
  package_name: string;
  remain: number;
  size: number;
  monthly: boolean;
  expires_at_ms: number | null;
  refresh_at_ms: number | null;
}

export interface ChannelCredits {
  /** 剩余额度。null = 未知(不是 0!0 = 确实用光)。 */
  left: number | null;
  /** 总额;跨周期总额无意义时为 null(workbuddy 即如此)。 */
  total: number | null;
  expires_at_ms: number | null;
  fetched_at_ms: number;
  packages: CreditPackage[];
  expiring_soon: boolean | null;
  not_applicable: boolean;
  error: string | null;
}

/**
 * 模型目录整批保存里的一行(对齐 Nexus `ExposeModelSpec` + `name`)。
 *
 * ⚠️ `context_window` / `max_output` 为 `null`(或省略)= **不声明**,
 * 不能与「声明了 0」混为一谈 —— 后者是荒谬的窗口值。
 */
export interface ChannelModelSpec {
  /** 完整 id(`<provider>/<模型>`)。 */
  id: string;
  /** 人话名称;空串 = 不改名。 */
  name?: string | null;
  /** 能不能直接吃图片(`real_model.supports_vision`)。 */
  vision?: boolean;
  context_window?: number | null;
  max_output?: number | null;
}

/**
 * 单行实时保存(用户 2026-10-31 定案:四页删掉保存按钮,改成就地落库)。
 *
 * ⚠️ 与 {@link ChannelModelSpec} 的区别是 `exposed`:实时保存一次只动**一行**,
 * 所以「取消勾选」必须能单独表达(= 删掉这一行),不能像整批那样靠「不在清单里」
 * 间接表达。`exposed === false` → 删行(并从逻辑模型档链里摘掉)。
 */
export interface ChannelModelPatch extends ChannelModelSpec {
  /** false = 取消登记(删行);省略/true = 登记。 */
  exposed?: boolean;
}

export interface ChannelCheckin {
  supported: boolean;
  active: boolean | null;
  checked_in: boolean | null;
  did_checked_in: boolean | null;
  daily_credit: number | null;
  extra_credits: number | null;
  streak_days: number | null;
  reason: string | null;
  error: string | null;
  // ── 可选字段:渠道上游签名透传(Nexus 面板同样展示;As One 尽力而为)──
  /** trae 上游业务码(0=成功;9004=缺 device_id;9095=本设备今日已签)。 */
  code?: number | null;
  /** 上游返回的提示文案(trae status/claim 的 message)。 */
  message?: string | null;
  /** workbuddy 今日可领积分(today_credit,status 快照)。 */
  today_credit?: number | null;
  /** workbuddy 是否处于连续签到日(is_streak_day)。 */
  is_streak_day?: boolean | null;
  /** workbuddy 前端签到按钮文案(claim_button_text,若有)。 */
  claim_button_text?: string | null;
}

/**
 * 单个渠道的签到状态(总览页「每日签到」卡的一行)。
 *
 * 与 `ChannelCheckin` 的区别:这是**跨渠道聚合视图**,一个渠道一行;
 * `checkedIn`/`pending` 是账号维度计数(qoder 需要逐个账号查活动,
 * trae/workbuddy 用代表账号的状态推断),拿不到就给 null 而不是编数。
 */
export interface CheckinChannelStatus {
  provider: string;
  label: string;
  supported: boolean;
  /** 该渠道账号总数。 */
  accounts: number;
  /**
   * `checkedIn` / `pending` 是否为**精确的逐账号计数**。
   *
   * trae/workbuddy 的签到状态是「代表账号」一次性查出来的,不知道其余账号,
   * 所以 false —— 界面不得把 1 说成「已签 1/N」;qoder 是逐账号查活动,true。
   */
  countExact: boolean;
  /** 今日已签到账号数;null = 无法判定。 */
  checkedIn: number | null;
  /** 今日待签到账号数;null = 无法判定。 */
  pending: number | null;
  /** 今日签到可得积分(代表值)。 */
  dailyCredit: number | null;
  /**
   * 单账号今日积分(2026-11-07 多账号显示定案):多账号「每账号值」——
   * 各账号今日积分**完全相同**时才给这个统一值(供前端显示「值×账号数」,
   * 如 MiniMax 两个号各 400 → `400×2`);任一账号缺值或数值不一致时为
   * null/undefined,前端退回显示 `dailyCredit` 合计,绝不把不一致的值谎报成
   * 统一的单账号值。trae/workbuddy 只查代表账号(countExact=false),本字段为 null。
   */
  perAccountCredit?: number | null;
  /** 连续签到天数。 */
  streak: number | null;
  /** 不支持的本地原因(如「该渠道不支持签到」)。 */
  reason: string | null;
  /** 上游/网络错误原文。 */
  error: string | null;
}

/** 全部签到总览(总览页「每日签到」卡)。 */
export interface CheckinOverview {
  channels: CheckinChannelStatus[];
}

/**
 * 渠道页卡头聚合(2026-11-07 合并页定案)。
 *
 * ⚠️ **只读缓存,绝不打上游** —— 渠道页把 Trae/WorkBuddy/Qoder/SenseNova/MiniMax
 * 合并成卡片列表后,卡头要"余额常显";若每次进页都真拉五个渠道的上游,签到/风控
 * 敏感接口会被无谓触发。缓存里没有的显示「未采集」,展开卡片/点刷新才有真数。
 */
export interface ChannelOverviewAccount {
  /** 裸用户名(与 AccountRows 的 label 同口径)。 */
  label: string;
  /** 剩余额度;null = 未采集(不是 0)。 */
  left: number | null;
  /** 最近到期(epoch 毫秒);null = 未知。 */
  expiresAtMs: number | null;
  /** 到期值是否为估算(minimax 发放明细推算等给 false,qoder 签到档估算给 true)。 */
  expiresEstimated: boolean;
  /** 该账号额度读数时间(epoch 毫秒);0 = 从没拉过。 */
  fetchedAtMs: number;
}

export interface ChannelOverviewCard {
  provider: string;
  label: string;
  /** 渠道有凭据(卡头状态点)。 */
  signedIn: boolean;
  accounts: ChannelOverviewAccount[];
  /** 渠道级错误/说明(如 workbuddy 无凭据)。 */
  note: string | null;
}

export interface ChannelOverview {
  cards: ChannelOverviewCard[];
}

/** 一键全部签到的结果。 */
export interface CheckinAllResult {
  ok: boolean;
  message: string;
  /** 签到后各渠道的最新状态。 */
  channels: CheckinChannelStatus[];
}

export interface MaintenanceInfo {
  enabled: boolean;
  interval_s: number | null;
  last_run_ts: number | null;
  result: string | null;
  error: string | null;
  reason: string | null;
}

export interface AutoRefreshInfo {
  /** 后台自动刷新循环是否在跑(As One 默认 false —— 额度按需拉取)。 */
  armed: boolean;
  /** 冷却时长(秒)。 */
  cooldown_s: number;
  /** 目录上次回源距今(秒);null = 从没拉过。 */
  catalog_age_s: number | null;
  /** 额度上次采集距今(秒);null = 从没采过。 */
  quota_age_s: number | null;
  /** 目录下次自动回源还有多久(秒);null = 不知道。 */
  catalog_next_in_s: number | null;
  /** 额度下次自动采集还有多久(秒);null = 不知道。 */
  quota_next_in_s: number | null;
  /** 现在处于冷却期(自动刷新会跳过上游请求)。 */
  cooling: boolean;
  /** 额度是否耗尽;null = 不知道(没有额度接口)。 */
  quota_exhausted: boolean | null;
}

/**
 * 凭据自动刷新状态。``running`` / ``last_run_*`` 为旧面板聚合契约(保留不动);
 * ``count`` / ``accounts`` / ``last_run_accounts`` 为装配层扩展(2025):
 * Nexus ``refresh_status`` / ``refresh_run`` 返回逐账号结构化行
 * (``has_refresh_token`` / ``needs_refresh`` / 逐账号结果),这里如实带出,
 * 渲染层可展示每个账户的刷新能力与最近一次刷新的逐账户结果。
 * 全部可选,旧调用方不受影响。
 */
export interface ChannelRefreshStatus {
  running: boolean;
  /** 本轮刷新**开始**的时刻(ms);null = 从未开始过。渲染层「已用 Ns」以它为准。
   *  ⚠️ 与 `last_run_at_ms` 不同:那个是「最近一次**完成**」的锚点,刷新进行中
   *  读到的仍是旧值(或 null),拿来当起点会显示 0 或乱跳 —— 用户实测「刷新计时
   *  一直 0 秒」就是这(装配层改在开始时写入)。 */
  started_at_ms: number | null;
  last_run_at_ms: number | null;
  last_elapsed_s: number | null;
  last_ok: boolean | null;
  last_error: string | null;
  result: string | null;
  /** 扩展:该渠道凭据行数(镜像 Nexus refresh_status.count)。 */
  count?: number;
  /** 扩展:逐账号刷新能力行(镜像 Nexus refresh_status.accounts)。 */
  accounts?: RefreshAccountRow[];
  /** 扩展:最近一次 refreshRun 的逐账号结果(镜像 Nexus refresh_run.accounts)。 */
  last_run_accounts?: RefreshAccountRow[];
}

/**
 * 单账号刷新行(镜像 Nexus nexus/refresh.py 的 status 行形状)。
 * ``status`` 仅在 ``refreshRun`` 结果 / ``last_run_accounts`` 中出现,
 * 取值 failed / skipped / dry_run / refreshed / refreshed_unsaved。
 */
export interface RefreshAccountRow {
  index: number;
  /** "provider/username"。 */
  account: string;
  username: string;
  uid: string | null;
  region: string | null;
  has_refresh_token: boolean;
  /** epoch 毫秒;无到期信息为 null。 */
  token_expires_at_ms: number | null;
  /** 有 refresh_token 时按 margin=300s 判定;无 refresh_token 恒 false(Nexus 语义)。 */
  needs_refresh: boolean;
  status?: string;
  message?: string;
  old_token_fp?: string | null;
  new_token_fp?: string | null;
}

export interface ClientPathRow {
  channel: string;
  description: string;
  saved_path: string | null;
  detected_path: string | null;
  effective_path: string | null;
  exists: boolean;
  /** "saved" | "detected" | null(镜像 Nexus _client_paths_list 的 source)。 */
  source: string | null;
  /** 保存值被「读路径自愈」顺手改写为 true(页面据此显示「已自动规整」)。 */
  repaired?: boolean;
  /** 自愈/推导说明(Nexus _client_paths_list 的 note;null 无说明)。 */
  note?: string | null;
}

export interface ClientPathsResult {
  channels: ClientPathRow[];
  config_file: string;
}

// ─────────────────── 自动发现 / 接入(Discover / Adopt) ───────────────────

/**
 * 一条被发现的本地登录态(「自动发现并接入」)。
 * ``token`` 为原始登录令牌,仅在同一对象内从 discover 回传给 adopt
 * (本地 IPC 传输);渲染层展示时必须脱敏,不得把 token 渲染到界面。
 */
export interface DiscoverChannelAccount {
  username: string;
  region: string | null;
  /** 逐行 hint(如「来源:CLI token 文件(cn)」),渲染层逐行展示。 */
  hint: string;
  /** 供 adoptChannelAccount 回传(与 discover 返回的对象同源)。 */
  token?: string | null;
  edition?: string | null;
  source?: string | null;
  token_expires_at_ms?: number | null;
  /**
   * trae: JWT payload 里的 user_id。
   *
   * ⚠️ 2026-11-09:这个字段以前在 discover 结果里被**丢掉**了(逐字段手挑时漏的),
   * 导致 adopt 写进库的凭据缺 user_id / device_id,签到被上游持续回 9074。
   */
  user_id?: string | null;
  /** trae: 上游 host(region 推导依据之一)。 */
  host?: string | null;
  /**
   * trae: 其余身份字段 —— `device_id` / `machine_id` / `refresh_token` /
   * `domain` / `last_refresh`。**adopt 必须整包写进 raw**。
   */
  extra?: Record<string, unknown> | null;
}

/** discoverChannelAccounts(provider) 结果(missing/found 语义见装配层实现)。 */
export interface DiscoverChannelResult {
  ok: boolean;
  provider: string;
  found: boolean;
  accounts: DiscoverChannelAccount[];
  message: string;
}

// ─────────────────────────── 指标页 / 额度只读面 ───────────────────────────

/** 指标行(按真实模型聚合;TTFT / TPS / 缓存命中率一律从原料现算)。 */
export interface MetricsRow {
  requests: number;
  fails: number;
  /** ⚠️ `prompt + completion`(cached 是 prompt 子集,不双计)。 */
  total: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cache_hit: number;
  cache_miss: number;
  /** 0..1。 */
  cache_hit_rate: number | null;
  avg_ttft_ms: number | null;
  avg_tps: number | null;
  latency_day: string | null;
}

/** 指标页快照(对齐 Nexus `GET /metrics` → `_metrics_page`)。 */
export interface MetricsSnapshot {
  enabled: boolean;
  generated_at: string;
  uptime_s: number;
  source: string;
  models: Array<{
    model: string;
    overall: MetricsRow;
    buckets: MetricsRow[];
    deployments: Array<{
      deployment: string;
      deployment_id: string;
      overall: MetricsRow;
      buckets: MetricsRow[];
    }>;
  }>;
}

/** SenseNova 账号行(凭据投影,**无明文**)。 */
export interface SensenovaAccountRow {
  index: number;
  account: string;
  username: string;
  /** D2/D6:没有停用开关;不可用 = 删这一行。 */
  enabled: boolean;
  has_key: boolean;
  /** 密钥指纹(前 8 位);没有 → null。 */
  key_hint: string | null;
  has_password: boolean;
}

/** 额度只读面(对齐 Nexus `GET /api/quota`)。 */
export interface QuotaRead {
  providers: Array<{
    provider: string;
    credential: string;
    /** 剩余额度;null = 未知(不是 0)。 */
    remaining: number | null;
    limit: number | null;
    /** epoch 秒。 */
    checked_at: number;
    error: string | null;
  }>;
  /** 各 provider 剩余额度之和(未知项按 0 计,只用于「量级」参考)。 */
  total: number;
  checked_at: number | null;
}

export interface ProviderPage {
  provider: string;
  env_prefix: string;
  region: string | null;
  signed_in: boolean;
  username: string | null;
  account: string | null;
  searched: string[];
  credits: ChannelCredits | null;
  checkin: ChannelCheckin | null;
  maintenance: MaintenanceInfo | null;
  models: CatalogModel[];
  models_source: string | null;
  models_fetched_at_ms: number | null;
  models_count: number;
  message: string | null;
  auto_refresh: AutoRefreshInfo | null;
  accounts: ChannelAccount[];
  client_paths: ClientPathRow[];
}

// ─────────────────────────── SenseNova ───────────────────────────

export interface SensenovaPool {
  /** 机器值(default / dedicated),**不是**人话名 —— 页面配色判断读它。 */
  pool_type: string;
  /** 人话池名(如「通用积分池」);上游缺省时回落 pool_type。 */
  name: string;
  /** 5h 窗口;上游没给该窗口时为 null(「没有数据 ≠ 0」,页面渲染「—」)。 */
  w5_limit: number | null;
  w5_used: number | null;
  w5_remaining: number | null;
  w5_reset_at: number | null;
  /** 7d 窗口;同上,null = 上游没给,不是 0。 */
  w7_limit: number | null;
  w7_used: number | null;
  w7_remaining: number | null;
  w7_reset_at: number | null;
  /** 活动固定积分;null = 上游没给(未查到),0 = 明确没有 —— 层与层之间不混淆。 */
  grant_balance: number | null;
  grant_expiry: number | null;
  grant_expiring_balance: number | null;
}

export interface SensenovaQuota {
  account: string;
  pools: SensenovaPool[];
  grant_balance: number | null;
  plan: string | null;
  fetched_at: number | null;
  remaining: number | null;
  expires_at: number | null;
}

export interface SensenovaAccount {
  account: string;
  username: string;
  enabled: boolean;
  key_hint: string | null;
  has_password: boolean;
  has_key: boolean;
  slots: number;
  inflight: number;
  inflight_is_pool_total: boolean | null;
  parallel_cap: number | null;
  success_rate: number | null;
  avg_ttft_ms: number | null;
  avg_tps: number | null;
  cache_hit_rate: number | null;
  requests: number;
  errors: number;
  cooling: boolean;
  cooldown_remaining_s: number | null;
  last_error: string | null;
  last_error_kind: string | null;
  last_used_at: number | null;
  quota: SensenovaQuota | null;
  quota_stale: boolean;
}

export interface SensenovaStatus {
  accounts: SensenovaAccount[];
  pool: SensenovaPool | null;
  base_url: string | null;
  refresh: ChannelRefreshStatus | null;
  auto_refresh: AutoRefreshInfo | null;
  uptime_s: number;
  note: string | null;
}

export interface SensenovaCatalogRow {
  id: string;
  name: string;
  context_window: number | null;
  max_output: number | null;
  input_modalities: string[];
  vision_upstream: boolean;
  vision: boolean;
  registered: boolean;
  available: boolean | null;
}

// ─────────────────────────── 请求日志 ───────────────────────────

export type RequestLogContentMode = "off" | "structure" | "full" | "edges";

/**
 * 记录档位的一个选项。
 *
 * Nexus `_request_log_status` 给的是 **{value, label}** 对象数组(`api_pages.py`
 * L5284-5289),label 是中文说明 —— 直接把 value 摆进下拉框会显示成
 * `off` / `structure` 这种机器值,那是凭空丢掉的一层信息。
 */
export interface RequestLogModeOption {
  value: RequestLogContentMode;
  label: string;
}

export interface RequestLogStatus {
  enabled: boolean;
  content_mode: RequestLogContentMode;
  content_modes: RequestLogModeOption[];
  path: string | null;
  size_bytes: number | null;
  /**
   * `stats_rows` / `last_24h` / `errors` = `stats_daily` 规模(Nexus 同款);
   * **`written` = 日志文件里的真实条目数**(D20:逐请求明细不入库,只能从文件数)。
   */
  counters: Record<string, number> | null;
  /** 参与上面 size/条数统计的日志文件名(最近 30 个,Nexus 同名键)。 */
  log_files: string[] | null;
  last_error: string | null;
}

// ─────────────────────────── 设置 ───────────────────────────

export type SettingKind = "str" | "int" | "float" | "bool" | "enum" | "json";

export interface SettingSpec {
  key: string;
  kind: SettingKind;
  label: string;
  options?: string[];
  min?: number;
  max?: number;
  help?: string;
  hidden?: boolean;
  /**
   * 展示分组覆盖。缺省时按键名前缀(`retry.x` → `retry`)推导。
   *
   * Nexus 的 `real.wait_budget_s` 键前缀是 `real`,但被放进 **retry 段**渲染 ——
   * 它管的是「重试之前单次上游调用愿意等多久」,与 `retry.*` 同一决策语境。
   * 没有这个字段,前端按前缀推导就会凭空多出一个 `real` 段。
   */
  section?: string;
}

export interface SettingsRead {
  /** section 键 → 字段点号键 → 当前值字符串。 */
  sections: Record<string, Record<string, string>>;
  specs: SettingSpec[];
  master_key?: string | null;
  master_key_note?: string | null;
}

// ─────────────────────────── 数据目录 ───────────────────────────

export interface DataDirInfo {
  data_dir: string;
  credentials_dir: string;
  logs: string;
  state: string;
}

// ─────────────────────────── RendererApi ───────────────────────────

/**
 * 面板 API 全集(方法名即 IPC method)。页面组件只允许经 rendererApi
 * (src/renderer/src/api.ts)调用本接口;不得绕过直接 fetch。
 */
export interface RendererApi {
  // 总览
  getStatus(): Promise<GatewayStatus>;
  getRuntime(): Promise<RuntimeSnapshot>;
  /**
   * 某 DSH 会话**当前请求**实际使用的真实模型(输入框内徽标用)。
   *
   * @param sessionId DSH 会话 id(网关按请求体 `session_id` 记账,同字段)。
   * @param model 该会话当前选中的模型名(逻辑模型名;直连时是真实模型名)。
   *   空闲态要靠它去 `scheduler.chain()` 里把亲和 pin 的 `endpointId` 翻回
   *   「哪台真实模型」—— 没有它就只能报 `null`(界面不画)。
   * @returns 在途请求的真实模型 / 亲和钉住的下一跳;查不到返回 `null` —— 界面据此
   *   不画徽标,绝不猜。
   */
  getSessionCurrentRoute(
    sessionId: string,
    model?: string,
  ): Promise<SessionCurrentRoute | null>;
  /**
   * 重启网关入口**只保留给托盘菜单**(用户定案 m03639),面板不暴露该方法。
   *
   * 托盘菜单与面板此前共用装配层的 `restartGateway()`(同一实现,不重复);
   * 现在面板侧按钮已删,若渲染层仍调用会得到「未知面板方法」。
   */
  // restartGateway(): Promise<ApiResult>;
  // 用量
  getUsageHistory(
    range: UsageRange,
    granularity: UsageGranularity,
    group: UsageGroup,
  ): Promise<UsageHistory>;
  // 逻辑模型
  getLogicalModels(): Promise<LogicalModelGroup[]>;
  writeLogicalModel(input: LogicalModelsWriteInput): Promise<ApiResult>;
  removeLogicalModel(name: string): Promise<ApiResult>;
  // 模型总览(部署)
  getDeployments(): Promise<DeploymentList>;
  setDeploymentExposure(
    deploymentId: string,
    kind: "direct" | "group" | "all",
    exposed: boolean,
    concurrency?: number,
  ): Promise<ApiResult>;
  /**
   * 真实模型的思考强度能力(「思考强度选择器」的落库入口)。
   *
   * 三态:`efforts === null` = 未设置(网关不拦不发);`[]` = 不支持思考;
   * 非空 = 规范阶梯子集(`low`/`medium`/`high`/`max`)。`allowsOff` 单独表达
   * 「能不能关思考」(`null` = 未设置,按允许处理)。
   */
  setDeploymentReasoning(
    deploymentId: string,
    efforts: string[] | null,
    allowsOff: boolean | null,
  ): Promise<ApiResult>;
  /**
   * 「尝试从上游获取」思考强度档位 —— 拉一次上游目录,把它给本模型说的
   * 档位表落进 `real_model.supported_reasoning_efforts` / `reasoning_allows_off`。
   *
   * 只读探测 + 只写这两个字段;上游没给档位就存 NULL(网关不拦不发)。
   */
  fetchDeploymentReasoning(deploymentId: string): Promise<ApiResult>;
  // 供应商(其他供应商)
  getModelProviders(): Promise<ModelProvider[]>;
  /**
   * 新增/更新一个兼容供应商(Nexus `POST /providers`)。
   *
   * @param envPrefix 环境变量前缀;`undefined` / 空串 = 不改(保留现值)。
   * @param keys 凭据池(**数组即整池,按位置对齐座位**;空串座位不删也不改,
   *   只删数组比现有池短的尾部座位)。`undefined` / `null` = 完全不动凭据。
   */
  upsertModelProvider(
    id: string,
    baseUrl: string | null,
    protocol: string,
    envPrefix?: string | null,
    keys?: string[] | null,
  ): Promise<ApiResult>;
  removeModelProvider(id: string): Promise<ApiResult>;
  /**
   * 拉上游模型目录(**只读**动作,不会创建 provider 行)。
   *
   * `decl` 给「**还没保存**的供应商」用:用户在新建卡片里填了地址/协议、点
   * 「获取可用模型」时 provider 行还不存在 —— 用本次表单给的值去探测,但声明只在
   * 「保存」({@link upsertModelProvider})时才落库。
   */
  fetchModels(
    id: string,
    force?: boolean,
    decl?: { baseUrl?: string | null; protocol?: string | null } | null,
  ): Promise<ApiResult>;
  setModelExposure(provider: string, model: string, exposed: boolean): Promise<ApiResult>;
  checkModels(id?: string): Promise<ApiResult>;
  /** 指标页快照(对齐 Nexus `GET /metrics`)。 */
  getMetrics(days?: number): Promise<MetricsSnapshot>;
  /** 单模型检测(对齐 Nexus `POST /providers/{id}/check-model`)。 */
  checkModel(provider: string, model: string): Promise<ApiResult>;
  /** SenseNova 账号行列表(对齐 Nexus `GET /sensenova/accounts`)。 */
  getSensenovaAccounts(): Promise<{ accounts: SensenovaAccountRow[]; count: number }>;
  /** 额度只读面(对齐 Nexus `GET /api/quota`)。 */
  getQuota(): Promise<QuotaRead>;
  // 渠道页(Trae / WorkBuddy)
  getProviderPage(provider: string, fresh?: boolean): Promise<ProviderPage>;
  getChannelAccounts(provider: string): Promise<ChannelAccount[]>;
  checkinStatus(provider: string, index?: number): Promise<ChannelCheckin>;
  checkinClaim(provider: string, confirm: boolean, index?: number): Promise<ApiResult>;
  /** 全部渠道签到总览(总览页「每日签到」卡)。 */
  checkinOverview(): Promise<CheckinOverview>;
  /** 一键全部签到(confirm=false 只 dry-run)。 */
  checkinAll(confirm: boolean): Promise<CheckinAllResult>;
  /** 渠道页卡头聚合(只读缓存,不打上游)。 */
  channelOverview(): Promise<ChannelOverview>;
  refreshStatus(provider: string): Promise<ChannelRefreshStatus>;
  refreshRun(provider: string, confirm: boolean, index?: number): Promise<ApiResult>;
  syncChannel(provider: string, force?: boolean): Promise<ApiResult>;
  /**
   * **只刷新额度/积分**(2026-11-07 拆分语义)。
   *
   * ⚠️ 模型目录不拉(展开渠道卡片才拉)、签到不跑(只有点「全部签到」才签)。
   * 打开渠道页与「刷新」按钮都走这条。
   */
  syncChannelQuota(provider: string, force?: boolean): Promise<ApiResult>;
  /**
   * **只拉模型目录并落库**(2026-11-07 拆分语义)。
   *
   * ⚠️ 不签到、不刷额度;展开渠道卡片时才调。
   */
  syncChannelCatalog(provider: string, force?: boolean): Promise<ApiResult>;
  /**
   * **批量只刷额度**(打开渠道页入口,只对有额度能力的渠道跑额度段)。
   *
   * ⚠️ 不拉模型目录、不签到。
   */
  syncAllQuota(force?: boolean): Promise<ApiResult>;
  /**
   * 模型目录**整批保存**(1:1 对齐 Nexus `POST /providers/{id}/exposure`
   * 与 `/sensenova/expose`)。
   *
   * 语义(**提交清单 = 模型表成员名单**):
   *   - 清单里的行 → upsert `real_model`,并把 `name` / `vision` /
   *     `context_window` / `max_output` 一起写进去(这四个是**声明**,必须能存);
   *   - 不在清单里的行 → **从 `real_model` 删掉**(不是「隐藏」,是删行);
   *   - 仍被逻辑模型档链引用的行 → 整批拒绝并在 message 里点名。
   *
   * ⚠️ `id` 是**完整 id**(`trae/xxx`),不是表格里显示的裸名 —— 裸名带斜杠时
   * (`openrouter/free`)无法分辨它属于哪个供应商。
   */
  setChannelModels(provider: string, models: ChannelModelSpec[]): Promise<ApiResult>;
  /**
   * 单行实时保存(用户 2026-10-31 定案:四页删掉保存按钮,勾选与改格即落库)。
   *
   * ⚠️ 不是 `setChannelModels` 的便捷包装:后者是**整批替换**(清单外 = 删行),
   * 一次只带一行会把其余模型全删掉。这里按 (provider, model) 单行 upsert;
   * `patch.exposed === false` 才删这一行(并连锁摘除逻辑模型档链)。
   */
  setChannelModel(provider: string, patch: ChannelModelPatch): Promise<ApiResult>;
  // 客户端路径
  getClientPaths(): Promise<ClientPathsResult>;
  saveClientPath(channel: string, path: string): Promise<ApiResult>;
  detectClientPath(channel: string): Promise<ApiResult>;
  // 自动发现 / 接入(镜像 Nexus POST /providers/{id}/discover、/adopt)
  /** 扫描本机已登录态(经 discover.ts;workbuddy 恒 found:false,见文案)。 */
  discoverChannelAccounts(provider: string): Promise<DiscoverChannelResult>;
  /** 把一条发现的登录态写入 vault(镜像 Nexus adopt:只新增、按 username 合并)。 */
  adoptChannelAccount(
    provider: string,
    username: string,
    token: string,
    region?: string,
    /** 发现阶段的身份字段(device_id/user_id/edition…),整包写进 raw。 */
    extra?: Record<string, unknown>,
  ): Promise<ApiResult>;
  // 设置
  getSettings(): Promise<SettingsRead>;
  saveSettings(payload: Record<string, Record<string, string>>): Promise<ApiResult>;
  // 请求日志
  getRequestLog(): Promise<RequestLogStatus>;
  setRequestLog(patch: {
    enabled?: boolean;
    content_mode?: RequestLogContentMode;
  }): Promise<ApiResult>;
  // SenseNova
  getSensenovaStatus(): Promise<SensenovaStatus>;
  getSensenovaModels(): Promise<SensenovaCatalogRow[]>;
  setSensenovaExposure(provider: string, model: string, exposed: boolean): Promise<ApiResult>;
  /**
   * SenseNova 刷新:真拉上游模型目录(不烧额度)并落库,同时绕过 5h 冷却重拉积分池。
   * force=false 时受装配层冷却闸门约束;页面按钮走 force=true。
   *
   * ⚠️ 2026-11-08 拆分:两段可以**分开**刷 ——
   * `{ catalog: false }` = 只刷积分池(页面「全部刷新」),
   * `{ quota: false }` = 只刷模型目录(模型列表里的「刷新模型列表」)。
   * 都不传 = 两段都做(旧调用方/CLI 语义不变)。
   */
  sensenovaRefresh(force?: boolean, parts?: { catalog?: boolean; quota?: boolean }): Promise<ApiResult>;
  // SenseNova 登录与账号管理(与 Nexus 路由一一对应:POST /sensenova/login、
  // POST /sensenova/refetch-key、POST/DELETE /sensenova/accounts)。
  // 返回值带 Nexus 同名字段:ok/account/username/logged_in/key_updated/total_keys/
  // has_password/created/login_ok/message(经 ApiResult 扩展槽透传)。
  /**
   * 账号密码登录(串行队列 + 间隔,避免平台风控)。
   * fetchKey=true(默认)登录成功后自动抓 API key;false 只登录不抓。
   * 密码只在登录成功后才写库,输错不覆盖旧密码。
   */
  sensenovaLogin(
    account: string,
    username: string | null,
    password: string,
    fetchKey?: boolean,
  ): Promise<ApiResult>;
  /** 只保存密码(不登录);空密码不写、不清除已有密码。 */
  sensenovaSavePassword(account: string, username: string, password: string): Promise<ApiResult>;
  /** 用已保存的密码免登录重抓 API key;没存密码会如实报错。 */
  sensenovaRefetchKey(account: string): Promise<ApiResult>;
  /** 新增/更新账号(建行 + 存密码/key);给了密码会顺带登录并抓 key。 */
  sensenovaAddAccount(username: string, password?: string, apiKey?: string): Promise<ApiResult>;
  /** 删除账号(删凭据行;页面返回该渠道删了几个模型端点)。 */
  sensenovaRemoveAccount(account: string): Promise<ApiResult>;
  // Qoder(cosy 协议,双区域 qoder 国内 / qoder-global 国际)
  /** 账号池:两个区域的全部账号(vault 里 provider = 区域名的 PAT 凭据)。 */
  getQoderAccounts(): Promise<{ accounts: QoderAccountRow[]; count: number }>;
  /** 区域状态:上游地址、账号数、目录条数、最近错误原文。 */
  getQoderStatus(): Promise<QoderStatus>;
  /** 模型目录(带勾选状态;无缓存时自动拉一次)。 */
  getQoderModels(region?: string): Promise<QoderCatalogRow[]>;
  /** 强制刷新目录(绕过 5 分钟缓存)。 */
  qoderRefreshCatalog(region?: string): Promise<ApiResult>;
  /** 勾选/取消一个模型(本地偏好,落 configDir/qoder-models.json)。 */
  qoderSetModelEnabled(region: string, key: string, enabled: boolean): Promise<ApiResult>;
  /** 积分/额度读数(逐账号;失败时 ok=false 并带错误文案)。 */
  qoderCredits(region: string, account?: string): Promise<QoderCreditsView[]>;
  /** 每日签到(幂等三态:claimed / already-claimed / unavailable)。 */
  qoderCheckin(region: string, account?: string): Promise<QoderCheckinView[]>;
  /** 上游活动列表(签到活动的来源,含标题/文案)。 */
  qoderCampaigns(
    region: string,
    account?: string,
  ): Promise<{ campaigns: QoderCampaignView[]; error: string | null }>;
  /** 添加账号(存 PAT 并立刻用上游校验)。 */
  qoderAddAccount(region: string, name: string, pat: string): Promise<ApiResult>;
  /** 删除账号。 */
  qoderRemoveAccount(region: string, name: string): Promise<ApiResult>;
  /** 启用/停用账号(写 accountOverlay,与其它供应商一致)。 */
  qoderSetAccountEnabled(region: string, name: string, enabled: boolean): Promise<ApiResult>;
  /** 链路探针:真发一次最小 chat 流,只读首帧。 */
  qoderProbeChat(region: string, name?: string): Promise<ApiResult>;
  /** 最近的上游错误原文(双区域合并,新的在前,最多 8 条)。 */
  qoderRecentErrors(): Promise<{ errors: QoderErrorView[] }>;
  // 数据目录
  getDataDir(): Promise<DataDirInfo>;
}

// ---------------------------------------------------------------------------
// Qoder 面板数据(独立管理页)
// ---------------------------------------------------------------------------

/** 账号池一行。 */
export interface QoderAccountRow {
  region: string;
  account: string;
  enabled: boolean;
  hasPat: boolean;
  /**
   * PAT 开头 8 位(如 `pt-12345…`);没存 PAT 时为 null。
   *
   * 用户 2026-10-31 定案:账号配置表精简成三列「账号 / API key(显示开头)/ 删除」,
   * 于是这里只给**前缀提示**:整串 PAT 永不回显(它等同于密码)。
   */
  patHint: string | null;
  uid: string | null;
  userType: string | null;
  /** epoch 秒。 */
  expiresAt: number | null;
  models: number;
  /** 该区域最近一次上游错误原文(截断到 2KB),null = 没有错误。 */
  lastError: string | null;
}

/** 上游最近错误(面板「最近错误原文」栏)。 */
export interface QoderErrorView {
  atMs: number;
  region: string;
  status: number;
  kind: string;
  body: string;
}

/** 单区域状态。 */
export interface QoderRegionStatus {
  region: string;
  label: string;
  gateway: string;
  openapi: string;
  accounts: number;
  enabledAccounts: number;
  catalogModels: number;
  catalogFetchedAtMs: number | null;
  catalogError: string | null;
  lastError: QoderErrorView | null;
  requiresDeviceRisk: boolean;
}

export interface QoderStatus {
  checkedAtMs: number;
  regions: QoderRegionStatus[];
}

/** 模型目录一行(含本地勾选)。 */
export interface QoderCatalogRow {
  region: string;
  key: string;
  displayName: string;
  /** 本地勾选(页面复选框)。 */
  selected: boolean;
  /** 上游 `enable` 字段。 */
  upstreamEnabled: boolean;
  isDefault: boolean;
  isReasoning: boolean;
  isVl: boolean;
  isFree: boolean;
  priceFactor: number | null;
  /** 默认档上下文窗口(上游 `max_input_tokens`)。 */
  maxInputTokens: number | null;
  /**
   * **最大档**上下文窗口(上游 `context_config` 里 `token_count` 的最大值)。
   * 用户 2026-10-31 指出:页面显示 200000 而上游还能给 1M —— 摆最大值才有意义。
   * 上游没给 `context_context` 时为 null(渲染层回落到 `maxInputTokens`)。
   */
  maxContextTokens: number | null;
  maxOutputTokens: number | null;
}

export interface QoderQuotaView {
  total: number | null;
  used: number | null;
  remaining: number | null;
  percentage: number | null;
}

/** 积分/额度读数。 */
export interface QoderCreditsView {
  region: string;
  account: string;
  ok: boolean;
  error: string | null;
  userType: string | null;
  /** epoch 秒。 */
  expiresAt: number | null;
  userQuota: QoderQuotaView | null;
  addOnQuota: (QoderQuotaView & { detailUrl: string | null }) | null;
  orgResourcePackage: {
    used: number | null;
    cap: number | null;
    remaining: number | null;
    percentage: number | null;
    available: boolean;
  } | null;
  isQuotaExceeded: boolean;
}

/** 签到结果(逐账号)。 */
export interface QoderCheckinView {
  region: string;
  account: string;
  status: "claimed" | "already-claimed" | "unavailable";
  amount: number | null;
  validityDays: number | null;
  /** epoch 毫秒。 */
  nextRefreshAtMs: number | null;
  message: string;
}

/** 活动(签到活动就在其中)。 */
export interface QoderCampaignView {
  campaignId: string;
  campaignKey?: string;
  actionType: string;
  claimStatus: string;
  amount: number | undefined;
  validityDays: number | undefined;
  startAt: number | undefined;
  endAt: number | undefined;
  campaignUrl: string | undefined;
  content: Record<
    string,
    { title?: string; description?: string; detailUrl?: string; buttonText?: string }
  >;
}
