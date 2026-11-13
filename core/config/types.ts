/**
 * 凭据与 provider 配置层 —— 领域类型。
 *
 * 设计目标
 * --------
 * 这一层是「静态配置」的唯一形状定义处:provider 定义、账户配置、
 * 凭据记录的归一化形态、以及 **Nexus 里散在各模块的运行期常量**
 * (策略集合 / 别名 / 规则默认值 / retry 缺省)。字段名与 Nexus 一一对应,
 * 差异处都写了源码位置注释,方便两边对表。
 *
 * 与 Nexus 的对应关系(只读源码,行号固定引用)
 * ------------------------------------------
 * - ``provider`` 表          —— nexus/db/schema.sql L97-102
 * - ``credential`` 表        —— nexus/db/schema.sql L117-128
 * - ``real_model`` 表        —— nexus/db/schema.sql L151-166
 * - ``logical_model`` 表     —— nexus/db/schema.sql L168-172
 * - 凭据归一化/到期/指纹    —— nexus/credentials.py
 * - 策略集合与别名            —— nexus/db/repo.py L90-150
 * - 调度规则默认值与校验      —— nexus/scheduler/engine.py L813-1033
 * - retry 缺省                —— nexus/core/backoff.py L86-110
 *
 * ⚠️ 两个刻意的差异(都有 Nexus 依据,不是臆造):
 * 1. TS 字段用 camelCase(与 src/connectors/types.ts、src/router/types.ts 一致),
 *    但 **raw 载荷里的键保留 snake_case**(那是上游给的,如 region/uid/label)。
 * 2. 本层只管「静态配置」。Nexus 的额度 / 冷却 / 会话亲和 pin 是**纯内存**
 *    运行期态(约定 D17-D19,见 nexus/db/repo.py L1334-1429),不落盘 ——
 *    这里给出形状参考 ``RuntimeQuota`` / ``RuntimeSessionPin``,但配置层
 *    不持有它们的实例。
 */

// ===========================================================================
// 协议
// ===========================================================================

/**
 * provider 协议枚举。
 *
 * nexus/db/schema.sql L100 的注释列了 ``openai | workbuddy | trae | sensenova``
 * (没有 CHECK 约束)。
 *
 * `qoder` 是 As One 新增的第五种协议(cosy 协议):不是 OpenAI 兼容上游,
 * 请求体是固定模板 + 按 body 签名,网关必须走连接器分叉(`runWithAccount`)。
 *
 * `minimax` 是第六种(MiniMax Agent 国内版):签名头(x-signature/yy)与设备
 * 指纹查询串都不是 OpenAI 形状;目前只用于**签到 + 额度**,聊天转发尚未接入。
 */
export const PROVIDER_PROTOCOLS = [
  "openai",
  "workbuddy",
  "trae",
  "sensenova",
  "qoder",
  "minimax",
] as const;

export type ProviderProtocol = (typeof PROVIDER_PROTOCOLS)[number];

/** provider.protocol 列缺省值(schema.sql L100:``DEFAULT 'openai'``)。 */
export const DEFAULT_PROVIDER_PROTOCOL: ProviderProtocol = "openai";

/** provider.protocol 的非法值 → 校验错误时给调用方的提示。 */
export function isProviderProtocol(value: unknown): value is ProviderProtocol {
  return (
    typeof value === "string" &&
    (PROVIDER_PROTOCOLS as readonly string[]).includes(value)
  );
}

// ===========================================================================
// 策略
// ===========================================================================

/** 逻辑模型选路策略(机器键)。nexus/db/repo.py L90-97。 */
export const SCHEDULER_STRATEGIES = [
  "due-first",
  "random",
  "ordered-fallback",
  "least-busy",
  "balanced",
] as const;

export type SchedulerStrategy = (typeof SCHEDULER_STRATEGIES)[number];

/** 策略缺省值(2026-10-26 用户 m15445 定案:调度策略改为随机)。 */
export const DEFAULT_SCHEDULER_STRATEGY: SchedulerStrategy = "random";

/**
 * 旧显示名 / 旧策略值 → 机器键。**逐字镜像** nexus/db/repo.py L126-150
 * (``STRATEGY_ALIASES``)。改策略集合时两边都要动 —— Nexus 在
 * repo.py L117-120 踩过「只改一边」导致静默退化。
 */
export const STRATEGY_ALIASES: Readonly<Record<string, SchedulerStrategy>> = {
  "最先到期 due first": "due-first",
  "due first": "due-first",
  "cheapest-then-expiry": "due-first",
  nexus: "due-first",
  "simple-shuffle": "random",
  "随机": "random",
  "usage-based-routing-v2": "least-busy",
  "usage-balanced-routing-v2": "least-busy",
  "usage balanced": "least-busy",
  "usage-balanced": "least-busy",
  "用量平衡": "least-busy",
  "按序降级链": "ordered-fallback",
  ordered: "ordered-fallback",
  "最少在途": "least-busy",
  "cost-based-routing": "least-busy",
  "provider-budget-routing": "due-first",
  "平均使用": "balanced",
};

/**
 * 策略归一化(镜像 nexus/db/repo.py L271-284 ``normalize_strategy``)。
 *
 * - 空/None → 缺省 ``random``;
 * - 机器键原样返回;
 * - 命中别名表(原值与小写各查一次)→ 映射值;
 * - **认不出来 → 缺省 ``random``**(Nexus 哲学:坏数据不炸,退回默认,
 *   并把 ``unknown`` 原样回给调用方做 warning)。
 *
 * @returns 归一化后的机器键 + 是否发生了回退(调用方据此写 warning)。
 */
export function normalizeStrategy(
  value: unknown,
): { strategy: SchedulerStrategy; fellBack: boolean } {
  if (value === null || value === undefined || typeof value !== "string") {
    return { strategy: DEFAULT_SCHEDULER_STRATEGY, fellBack: true };
  }
  const text = value.trim();
  if (!text) return { strategy: DEFAULT_SCHEDULER_STRATEGY, fellBack: true };
  if ((SCHEDULER_STRATEGIES as readonly string[]).includes(text)) {
    return { strategy: text as SchedulerStrategy, fellBack: false };
  }
  const mapped = STRATEGY_ALIASES[text] ?? STRATEGY_ALIASES[text.toLowerCase()];
  if (mapped) return { strategy: mapped, fellBack: false };
  return { strategy: DEFAULT_SCHEDULER_STRATEGY, fellBack: true };
}

// ===========================================================================
// 凭据
// ===========================================================================

/**
 * 凭据主键二元组 ``(provider, username)``。
 *
 * nexus/credentials.py L20-33:v4 起 ``credential`` 表主键就是这两列,
 * username NOT NULL(空用户名会兜底成 provider 名,见 repo.py L675)。
 * ``src/router/types.ts`` L21 有同形状的 ``CredentialKey``(那边独立定义,
 * 本层不反向依赖 router)。
 */
export type CredentialKey = readonly [provider: string, username: string];

/** ``"<provider>/<username>"`` —— 展示串 / 日志串,**不用于寻址**(credentials.py L31-32)。 */
export type CredentialId = string;

/**
 * 凭据记录(归一化后的领域形态)。
 *
 * 字段一一对应 ``credential`` 表(schema.sql L117-128)与
 * ``ChannelAccount`` 统一视图(credentials.py L85-141):
 *
 * | 本层字段        | 表列            | 说明                                       |
 * |-----------------|-----------------|--------------------------------------------|
 * | ``provider``    | provider        | 主键之一                                    |
 * | ``username``    | username        | 主键之一,NOT NULL                          |
 * | ``secret``      | secret          | 明文令牌(Bearer / JWT 等)                   |
 * | ``refreshSecret``| refresh_secret | 刷新令牌,可能为空(上游不轮换时)             |
 * | ``expiresAt``    | expires_at      | **epoch 秒**(不是毫秒!见下)                 |
 * | ``raw``          | raw_json        | 附加载荷:region/uid/label/device_id/JWT…  |
 *
 * ⚠️ **单位陷阱**(credentials.py L14-18 踩过):旧凭据文件里到期是**毫秒**,
 * 而列是**秒**。本层写入一律要求秒;读取兼容由
 * {@link normalizeExpiresSeconds} 承担(列优先 + ``>= 1e11`` 判毫秒)。
 */
export interface Credential {
  provider: string;
  username: string;
  secret: string | null;
  refreshSecret: string | null;
  /** 令牌到期时刻(epoch **秒**);``null`` = 未知(上游没给)。 */
  expiresAt: number | null;
  /** ``raw_json`` 解析后的对象;坏 JSON / 缺失 → 空对象(credentials.py L58-68)。 */
  raw: Record<string, unknown>;
}

/**
 * 凭据摘要 —— **不含任何密钥**(镜像 nexus/db/repo.py L707-714
 * ``_credential_row``:``secret`` / ``refresh_secret`` 两列被 pop 掉)。
 *
 * 这是「列举凭据」的安全形态:面板、日志、健康快照只能用这一个出口。
 */
export interface CredentialSummary {
  provider: string;
  username: string;
  /** ``"<provider>/<username>"`` 展示串(repo.py L711 的 ``key`` 字段)。 */
  key: CredentialId;
  expiresAt: number | null;
  raw: Record<string, unknown>;
}

/**
 * 凭据写入输入(``put`` / ``rotate`` 共用)。
 *
 * 所有字段可选:给了就覆盖,没给就保留原值(镜像 repo.upsert_credential 的
 * ``ON CONFLICT DO UPDATE`` 全列覆盖 + credentials.save_tokens 的
 * 「refresh_token 只在拿到新值时覆盖」哲学,credentials.py L267-268)。
 */
export interface CredentialInput {
  provider?: string;
  username?: string;
  secret?: string | null;
  refreshSecret?: string | null;
  /** epoch **秒**;``null`` 显式清空。 */
  expiresAt?: number | null;
  /** 整体替换 ``raw``(不是浅合并 —— 与 repo.upsert_credential 的 raw 列一致)。 */
  raw?: Record<string, unknown> | null;
}

// ===========================================================================
// 到期归一化(nexus/credentials.py L144-182)
// ===========================================================================

/**
 * ``>= 1e11`` 判毫秒(10 位 = 秒,13 位 = 毫秒)。
 * 与 credentials.py L144-145 ``_MILLIS_THRESHOLD``、collector/base.py L86
 * 同一口径。
 */
export const MILLIS_THRESHOLD = 1e11;

/**
 * 兼容毫秒的到期读数 → epoch 秒。
 *
 * 纯函数版(不需要整行凭据时用):输入可能是秒、毫秒、或数字字符串,
 * 统一按「``>= 1e11`` 即毫秒」折成秒;``<= 0`` / 非数字 / 空 → ``null``。
 * 注意 credentials.py L166 要求 ``> 0`` —— 0 和负数视为「没有到期」。
 */
export function normalizeExpiresSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return value >= MILLIS_THRESHOLD ? value / 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num >= MILLIS_THRESHOLD ? num / 1000 : num;
    }
  }
  return null;
}

// ===========================================================================
// Provider 定义
// ===========================================================================

/**
 * provider 定义 —— 镜像 ``provider`` 表(schema.sql L97-102)。
 *
 * nexus/db/repo.py L615-643 ``upsert_provider`` 的列全集。
 * 注意:Nexus 里 real_model / credential 都挂在 provider 名下
 * (外键 ON DELETE CASCADE,repo.py L653),但本层把它们放在
 * ``ProviderRegistry`` 的扁平列表里 —— 文件形态见 providers.ts。
 */
export interface ProviderDefinition {
  /** provider 主键(``id`` 列)。 */
  id: string;
  /** ``base_url`` 列;``null`` = 未配置(用连接器内建)。 */
  baseUrl: string | null;
  /** ``protocol`` 列,缺省 ``openai``。 */
  protocol: ProviderProtocol;
  /** ``env_prefix`` 列(面板探测环境变量用);``null`` = 不探测。 */
  envPrefix: string | null;
}

/**
 * 真实模型定义 —— 镜像 ``real_model`` 表(schema.sql L151-166)。
 *
 * nexus/db/repo.py L740-794 ``upsert_real_model`` 的列全集。
 * ⚠️ ``concurrency`` 为 ``null`` 表示「不改」(Nexus 写库时
 * ``COALESCE(?, 1)`` —— 传 NULL 不重置,见 repo.py L794 附近 SQL),
 * 与 ``maxInputTokens`` 等的 NULL 语义不同,别混。
 */
export interface RealModelDefinition {
  provider: string;
  model: string;
  name: string | null;
  /** ``supports_vision`` 列,缺省 ``false``。 */
  supportsVision: boolean;
  /** ``max_input_tokens`` 列;``null`` = 未探测到。 */
  maxInputTokens: number | null;
  /** ``max_output_tokens`` 列;``null`` = 未探测到。 */
  maxOutputTokens: number | null;
  /** ``hidden`` 列(``/v1/models`` 对外隐藏),缺省 ``false``。 */
  hidden: boolean;
  /** ``concurrency`` 列;``null`` = 未覆盖(回落 provider/默认)。 */
  concurrency: number | null;
}

// ===========================================================================
// 逻辑模型(档链)
// ===========================================================================

/**
 * 档链成员 —— ``logical_model.members`` 数组元素(有序,**顺序即 priority**)。
 *
 * nexus/db/repo.py L287-312 ``normalize_members``:数组顺序就是选路优先级
 * (约定 D13),完全重复的 ``(provider, model)`` 只保留第一次出现。
 */
export interface ChainMember {
  provider: string;
  model: string;
}

/**
 * 逻辑模型定义 —— 镜像 ``logical_model`` 表(schema.sql L168-172)。
 *
 * ``members`` 是**有序**的:下标 0 优先级最高。
 */
export interface LogicalModelDefinition {
  name: string;
  strategy: SchedulerStrategy;
  members: ChainMember[];
}

// ===========================================================================
// 账户配置
// ===========================================================================

/**
 * 账户配置 = 「凭据引用 + 启用/停用 + 配额/冷却/会话亲和的**静态**参数」。
 *
 * ⚠️ **Nexus 里没有独立的账户表**:账户就是 ``credential`` 行
 * (provider + username 二元组),启用/停用、配额、冷却、pin 全是**运行期**
 * 内存态(约定 D17-D19,repo.py L1334-1429)。本接口是 TS 侧的**静态配置**
 * 视图,字段与 Nexus 的运行期形态对齐但只收「能落盘的部分」:
 *
 * - ``credentialRef``:``"<provider>/<username>"``(= repo.py L186
 *   ``credential_key`` 的字符串形态,DSH 侧叫 credentialRef)。
 * - ``enabled``:⚠️ **TODO / 与 Nexus 的差异** —— Nexus 的 credential 表
 *   **没有 enabled 列**:停用 = 删除行,或写一条 ``priority: 0`` 的
 *   调度规则(engine.py L813-831 的 ``window`` 字段移除后一律显式写
 *   priority=0)。本字段是 as-one 侧扩展,阶段二若走 DSH ctx.credentials
 *   则改由宿主语义决定,需重新评估。
 * - ``cooldownOverrideMinutes``:⚠️ **TODO** —— Nexus 的冷却覆盖在
 *   ``scheduler.rules`` 的 ``cooldown`` 字段(**供应商级**,分钟,
 *   engine.py L813-831);账户级覆盖在本层是扩展。
 * - ``sessionPinTtlSeconds``:会话亲和 pin 的 TTL;``null`` → 回落
 *   ``DEFAULT_PIN_TTL_SECONDS = 600``(repo.py L1391
 *   ``pin_session(..., ttl_seconds=600.0)``)。
 */
export interface AccountConfig {
  /** 凭据引用 ``"<provider>/<username>"``(Nexus ``credential_key`` 字符串形态)。 */
  credentialRef: string;
  /** 启用/停用(⚠️ 见上「enabled」注释:Nexus 无此列)。默认 ``true``。 */
  enabled: boolean;
  /**
   * 账户级冷却覆盖(分钟)。``null`` = 不覆盖,回落 scheduler.rules 的
   * 供应商级 ``cooldown`` 与 ``retry.logical_cooldown`` 缺省(15 分钟)。
   */
  cooldownOverrideMinutes: number | null;
  /** 会话亲和 pin TTL(秒);``null`` → 600(repo.py L1391)。 */
  sessionPinTtlSeconds: number | null;
}

/** 会话亲和 pin TTL 缺省值(repo.py L1391:``ttl_seconds=600.0``)。 */
export const DEFAULT_PIN_TTL_SECONDS = 600.0;

// ===========================================================================
// 调度规则(setting ``scheduler.rules``)
// ===========================================================================

/**
 * 调度规则(setting ``scheduler.rules`` 数组元素)。
 *
 * 一条规则 = 「某目标在满足条件时属于哪一档」。语义(2026-10-21 用户定案 m28168):
 *
 * - ``priority`` 本身就是**档位兼动作**:``0`` 剔除 / ``1`` T1 免费 /
 *   ``2`` T2 赠送额度 / ``3`` T3 消耗 / ``4`` T4 高峰降级(排末);
 * - 优先级**与时间和时段相关**:条目可带 ``window`` 限定「只在某些星期/时段
 *   内是该档」,窗口外回落 {@link DEFAULT_PRIORITY}(=3);
 * - 同一目标可写多条窗口规则、各给不同档位(例:9-12 点 T1 免费,其余 T3),
 *   引擎按时间解析出当刻档位;
 * - **未写 priority 的条目一律按 {@link DEFAULT_PRIORITY} 处理**,不做隐式推导
 *   (旧的「expiresAt 且无 model → 2」推导已删除)。
 *
 * 字段:
 * - ``provider``:**必填**,非空字符串;
 * - ``model``:可选,限定到某个真实模型;
 * - ``priority``:可选,见上;
 * - ``expiresAt``:可选,``YYYY-MM-DD``(该档位/额度的截止日);
 * - ``window``:可选,时段限定。
 *
 * 时区与星期基准是**代码常量**(本地时区、1 = 周一),不进设置 ——
 * 用户定案「不写我不会改的配置」。
 *
 * 校验哲学(镜像 engine.py L934-1033 ``_valid_rules``):坏条目**跳过 +
 * 大声 warning,绝不因单条坏规则回滚整份配置**。
 */
export interface SchedulerRule {
  provider: string;
  model?: string;
  priority?: number;
  /** ``YYYY-MM-DD``。 */
  expiresAt?: string;
  window?: SchedulerWindow;
}

/**
 * 规则的时间限定(星期 + 时段)。
 *
 * 两项都可缺省(= 不限);缺 ``window`` 整条即「恒为该档」。
 * 未来扩展(月份/日期区间/间隔)都落在这个对象内,顶层不再长并列时间字段。
 */
export interface SchedulerWindow {
  /** ``1..7``(1 = 周一,7 = 周日);缺省 = 每天。 */
  weekdays?: number[];
  /** ``[["HH:MM","HH:MM"], ...]``;左闭右开,``start > end`` 表示跨午夜。 */
  times?: ReadonlyArray<readonly [string, string]>;
}

/**
 * 未写 ``priority`` 的规则按这一档处理 —— 用户定案:未指定 = 3(消耗档)。
 *
 * 与引擎 ``CONSUME_TIER`` 同值;放在配置层是为了让「缺省档位」有唯一出处。
 */
export const DEFAULT_PRIORITY = 3;

/**
 * ``scheduler.rules`` 缺省数组 —— **恒为空**(2026-10-30 用户定案)。
 *
 * 原先这里有 8 条(workbuddy/hy4-preview 免费档、longcat/tokenrhythm/stepfun
 * 的到期待、trae/workbuddy 的高峰时段降级 …)。这些全是**具体账号**的状态,
 * 写进代码等于「新装的机器先按别人账号的到期日和时段跑」。
 *
 * 现在规则完全来自用户在设置页五张档位卡里填的内容(库里的
 * ``scheduler.rules_p*``);这份常量与 ``engine-constants.ts`` 的
 * ``CONFIG_DEFAULT_RULES`` 保持同步为空表,只用于类型/形状兜底。
 */
export const DEFAULT_SCHEDULER_RULES: readonly SchedulerRule[] = [];

/**
 * ``scheduler.cooldown_overrides`` 缺省 —— 供应商级端点熔断覆盖(分钟)。
 *
 * 从原 ``scheduler.rules`` 的 ``cooldown`` 字段拆出:它约束的是「失败后多久
 * 不再选该供应商」,与档位调度无关,混在同一条规则里会让校验器同时管两种
 * 不相干的字段。
 *
 * 2026-10-24 用户定案:**不再有供应商级缺省**(原先 sensenova=1)——
 * 缺省统一走全局冷却(retry.logical_cooldown)。
 */
export const DEFAULT_SCHEDULER_COOLDOWN_OVERRIDES: Readonly<Record<string, number>> = {};

// ===========================================================================
// retry 缺省(setting ``retry.*``,nexus/core/backoff.py L86-110)
// ===========================================================================

/**
 * retry 缺省键值 —— 镜像 backoff.py L102-110 ``RETRY_DEFAULTS``。
 *
 * ⚠️ ``retry.logical_cooldown`` 的单位是**分钟**(不是秒)—— backoff.py
 * L359 消费时 ``* 60.0`` 换算;别在别处自己乘。
 */
export const RETRY_DEFAULTS = {
  "retry.base_backoff_s": 1.0,
  "retry.max_backoff_s": 15.0,
  "retry.jitter_ratio": 0.2,
  "retry.codes": "timeout,connection,429,500,502,503,504",
  "retry.logical_max": 1,
  "retry.real_max": 10,
  "retry.logical_cooldown": 15,
} as const;

/** retry 键全集(顺序 = backoff.py L86-94 ``RETRY_KEYS`` 的文档顺序)。 */
export const RETRY_KEYS = [
  "retry.base_backoff_s",
  "retry.max_backoff_s",
  "retry.jitter_ratio",
  "retry.codes",
  "retry.logical_max",
  "retry.real_max",
  "retry.logical_cooldown",
] as const;

export type RetryKey = (typeof RETRY_KEYS)[number];

// ===========================================================================
// 运行期内存态形状参考(约定 D17-D19:不落盘,仅形状镜像)
// ===========================================================================

/**
 * 额度快照 —— 镜像 repo.py L1334-1357 ``quotas()`` 的条目
 * (键 = ``"<provider>/<username>"``)。
 *
 * ⚠️ **Nexus 里这是纯内存 dict,重启即失**(D17);本类型只作形状参考,
 * 配置层不持有其实例 —— 运行期额度由 router/collector 在内存维护。
 */
export interface RuntimeQuota {
  remaining: number;
  expiresAt: number | null;
  raw: Record<string, unknown> | null;
  fetchedAt: number;
}

/**
 * 会话亲和 pin —— 镜像 repo.py L1391-1405 ``pin_session`` 写入的内存 dict
 * 条目。
 *
 * ⚠️ 同样是**纯内存**(D19):``{endpoint_id, logical_name, pinned_at,
 * expires_at}``,TTL 默认 600 秒;「pin 成功只续期,失败不解除」
 * (repo.py L1391-1398),``unpin_session`` 只在指向它时才解(防竞态,
 * repo.py L1416-1426)。配置层只存 TTL 参数(见 ``AccountConfig``)。
 */
export interface RuntimeSessionPin {
  endpointId: string;
  logicalName: string;
  pinnedAt: number;
  expiresAt: number;
}

// ===========================================================================
// 时钟(测试注入用;本层不反向依赖 router)
// ===========================================================================

/** 墙钟:绝对 epoch 秒(与 Nexus ``time.time()`` 同口径)。 */
export type WallClock = () => number;

/** 默认墙钟(``Date.now() / 1000``,epoch 秒)。 */
export const systemWallClock: WallClock = () => Date.now() / 1000;
