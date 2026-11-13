/**
 * 调度引擎 —— 移植自 D:\projects\nexus:
 *  - nexus/scheduler/engine.py:Scheduler.chain 档位排序(六种策略全部语义)、
 *    时段规则(blackout/degrade/exclude)、积分到期、额度快照、分钟级记忆化、
 *    配额刷新节流、免费档/赠送档(GRANT_TIERS 为空,测试可注入)。
 *  - nexus/core/router.py:Planner.plan/commit/finish 选路语义(会话亲和 pin、
 *    负载感知 least-busy/balanced 的分桶裁决、冷却、在途租约)与 InflightLedger /
 *    SessionPinTable / HealthRegistry 三个纯内存组件。
 *  - nexus/core/backoff.py:RetryPolicy(见 ./backoff.ts)。
 *
 * 框架无关:不 import fastapi/dsh/electron;DB 访问只经 types.ts 定义的注入接口
 * (SchedulerRepo / SettingsRepo);本文件同时提供纯内存实现 InMemoryRepo 等供测试。
 */
import { MathRng, SeededRng, seedRetrySettings } from "./backoff.js";
import type {
  AccountPool,
  BlackoutWindow,
  FreeEntry,
  ProviderRegistry,
  QuotaSnapshot,
  RawEndpointRow,
  Rng,
  Rule,
  SchedulerConfig,
  SchedulerRepo,
  SchedulerSnapshot,
  ScheduledMemberData,
  StaticRule,
  StrategyName,
  WindowRule,
} from "./types.js";
import { DEFAULT_PRIORITY } from "../config/types.js";
import { defaultConcurrencyOf } from "../config/concurrency-defaults.js";
import { expensiveModelGateOf, isQuotaShortFor } from "../config/expensive-models.js";
import {
  CACHEABLE_STRATEGIES,
  CONFIG_DEFAULT_COOLDOWN_OVERRIDES,
  CONFIG_DEFAULT_RULES,
  CONFIG_DEFAULTS_JSON,
  CONFIG_TTL_SECONDS,
  CONSUME_TIER,
  DEFAULT_STRATEGY,
  DEFAULT_TTL_SECONDS,
  DEGRADED_TIER,
  FREE_TIER,
  GRANT_TIER,
  LOAD_AWARE_STRATEGIES,
  QUOTA_REFRESH_PROVIDERS,
  RULES_PRIORITY_KEYS,
  STRATEGIES,
  TIER_NAMES,
} from "./engine-constants.js";
import { ChainItem } from "./engine-models.js";
import {
  expiryEpoch,
  fmtMinute,
  formatLocal,
  isBlackout,
  isGrantTier,
  isRecord,
  jsonSetting,
  key,
  legacySectionsToRules,
  memberPair,
  normalizeStrategy,
  quotaKey,
  round1,
  rowMember,
  rulesKeyOf,
  stableBy,
  validRules,
} from "./engine-utils.js";
import type { Pair } from "./engine-utils.js";

// ============ (第十刀:以下段从 engine.ts 抽出,见同目录 engine-{constants,utils,health,models,planner}.ts) ============
// 保留段 1:L1512-1533(注释头 + CacheEntry + SchedulerOptions + sortReason)
// ===========================================================================
// Scheduler
// ===========================================================================

interface CacheEntry {
  minute: string;
  strategy: StrategyName;
  members: ScheduledMemberData[];
  quotasAt: number;
}

export interface SchedulerOptions {
  ttlSeconds?: number;
  seed?: number;
  now?: () => number;
}

function sortReason(m: ScheduledMemberData): string {
  if (m.reason) return m.reason;
  if (m.free) return "免费档(名单序)";
  return m.expiresAt ? "积分到期" : "积分到期未知(排末)";
}

/** 命中降级规则(P4 档,或任一时段 degrade 规则)时的排序原因文案。 */
const DEGRADED_REASON = "命中降级规则(P4 或时段),降至最末";

// 保留段 2:Scheduler(1535-2189)
/**
 * 调度器:档位排序 + 时段规则 + 记忆化 + 配额刷新节流。
 * 对 least-busy / balanced 只出「配置序 + 策略标签」,真实选择交给 Planner。
 */
export class Scheduler {
  readonly ttl: number;
  readonly repo: SchedulerRepo;
  lastPlan: Record<string, unknown> = {};

  private _cache = new Map<string, CacheEntry>();
  private _quotas: Record<string, QuotaSnapshot> = {};
  private _quotasAt = 0.0;
  private _rng: Rng;
  private _quotaRefresher: ((providers: string[]) => void) | null = null;
  private _refreshAt = 0.0;
  private _refreshTriggers = 0;
  private _cfgCache: SchedulerConfig | null = null;
  private _cfgAt = 0.0;
  private readonly _now: () => number;

  constructor(repo: SchedulerRepo, opts: SchedulerOptions = {}) {
    this.repo = repo;
    this.ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this._now = opts.now ?? (() => Date.now() / 1000);
    this._rng = opts.seed !== undefined ? new SeededRng(opts.seed) : MathRng;
    this._seedConfigSettings();
    this._seedRetrySettings();
    this._seedMiscSettings();
  }

  now(): number {
    return this._now();
  }

  // ------------------------------------------------------------- 播种
  private _seedConfigSettings(): void {
    // 2026-10-22 起调度规则拆 5 键(priority 1/2/3/4/0 各一个键,键名即档位)。
    // 任一档位键已存在 → 用户已配过,整体不覆盖(单档单独改也在面板侧完成)。
    const anyKey = RULES_PRIORITY_KEYS.some((p) => this.repo.getSetting(rulesKeyOf(p)) !== null);
    if (anyKey) {
      // 冷却覆盖独立键仍补播(与档位键无关)。
      if (this.repo.getSetting("scheduler.cooldown_overrides") === null) {
        this.repo.setSetting("scheduler.cooldown_overrides", JSON.stringify(CONFIG_DEFAULT_COOLDOWN_OVERRIDES));
      }
      return;
    }
    // 全新库:优先看旧 scheduler.rules 单键迁移,没有才播缺省 5 键。
    const legacyRaw = this.repo.getSetting("scheduler.rules");
    if (legacyRaw !== null && legacyRaw !== undefined && legacyRaw.trim() !== "") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(legacyRaw);
      } catch {
        parsed = null;
      }
      const cfgObj: Record<string, unknown> = isRecord(parsed) ? parsed : {};
      let legacyRules: Rule[] = [];
      if ("rules" in cfgObj) legacyRules = validRules(cfgObj.rules);
      else legacyRules = legacySectionsToRules(cfgObj);
      this._seedRulesByPriority(legacyRules);
    } else {
      // 更老的三段式键(free.models / credit.expiry / time.windows)仍接受,
      // 有则迁移、没有才播缺省 —— 与旧 _readConfig 的兜底口径一致。
      let rows: Record<string, string> = {};
      try {
        rows = this.repo.settings();
      } catch {
        rows = {};
      }
      const legacy: Record<string, unknown> = {};
      for (const [key, field] of [
        ["free.models", "free_models"],
        ["credit.expiry", "credit_expiry"],
        ["time.windows", "time_windows"],
      ] as const) {
        const raw = rows[key];
        if (raw === null || raw === undefined) continue;
        try {
          legacy[field] = JSON.parse(String(raw));
        } catch {
          /* warning: legacy 解析失败跳过 */
        }
      }
      if (Object.keys(legacy).length > 0) {
        this._seedRulesByPriority(legacySectionsToRules(legacy));
      } else {
        this._seedRulesByPriority(CONFIG_DEFAULT_RULES);
      }
    }
    // 冷却覆盖独立键(2026-10-21 从 rules 拆出)。旧数据里 rules[].cooldown 由
    // 迁移脚本搬运;这里只在键缺失时播缺省,不覆盖用户已有值。
    if (this.repo.getSetting("scheduler.cooldown_overrides") === null) {
      this.repo.setSetting("scheduler.cooldown_overrides", JSON.stringify(CONFIG_DEFAULT_COOLDOWN_OVERRIDES));
    }
  }

  /** 把一份扁平 rules 按 priority 分组写进 5 个档位键(元素剥掉 priority,键名即档位)。 */
  private _seedRulesByPriority(rules: Rule[]): void {
    const byPriority = new Map<number, unknown[]>();
    for (const r of rules) {
      const p = typeof r.priority === "number" ? r.priority : DEFAULT_PRIORITY;
      if (!byPriority.has(p)) byPriority.set(p, []);
      const { priority: _drop, ...rest } = r;
      byPriority.get(p)!.push(rest);
    }
    for (const p of RULES_PRIORITY_KEYS) {
      this.repo.setSetting(rulesKeyOf(p), JSON.stringify(byPriority.get(p) ?? []));
    }
  }
  private _seedRetrySettings(): void {
    try {
      seedRetrySettings(this.repo);
    } catch {
      /* 播种辅助失败不致命 */
    }
  }
  private _seedMiscSettings(): void {
    for (const [k, v] of [
      ["ui.recent_limit", "50"],
      ["abstract.timeout_s", "25"],
    ] as const) {
      if (this.repo.getSetting(k) === null || this.repo.getSetting(k) === undefined) {
        try {
          this.repo.setSetting(k, v);
        } catch {
          /* 播种失败仅告警 */
        }
      }
    }
  }

  // ------------------------------------------------------------- 配置
  private _config(): SchedulerConfig {
    const now = this._now();
    if (this._cfgCache !== null && now - this._cfgAt < CONFIG_TTL_SECONDS) {
      return this._cfgCache;
    }
    const cfg = this._readConfig();
    this._cfgCache = cfg;
    this._cfgAt = now;
    return cfg;
  }
  private _readConfig(): SchedulerConfig {
    let rules: Rule[] | null = this._readRulesFromKeys();
    if (rules === null) {
      // 迁移期兼容:5 个档位键全空 → 回落旧 scheduler.rules 单键解析。
      const raw = jsonSetting(this.repo.getSetting("scheduler.rules"), CONFIG_DEFAULTS_JSON);
      const cfgObj: Record<string, unknown> = isRecord(raw) ? raw : JSON.parse(CONFIG_DEFAULTS_JSON);
      rules = "rules" in cfgObj ? validRules(cfgObj.rules) : legacySectionsToRules(cfgObj);
    }
    const freeModels: FreeEntry[] = [];
    const creditExpiry: Record<string, string> = {};
    const timeWindows: WindowRule[] = [];
    // 2026-11-07 修 P4 未生效:无时段的档位规则曾在此被整条丢弃。
    // 现在为它们建一条独立通路(staticRules),供 _degraded / chain 使用。
    const staticRules: StaticRule[] = [];
    for (const rule of rules) {
      const provider = rule.provider;
      const model = rule.model;
      const priority = rule.priority;
      if (rule.window?.times) {
        timeWindows.push({
          logical: "*",
          provider,
          model: model ?? "",
          times: rule.window.times,
          // 2026-10-24:五个档位键都允许时段规则(设置页五张卡统一显示星期/时间段框)。
          // 语义按档位分:priority 0 = 时段内**禁用**(整条从链里剔除),
          // 其余档位(1/2/3/4)= 时段内**降级**(仍在链里,排到链末)——
          // 只有「禁用档」这个名字承诺"不可用",其余档位只承诺"往后放"。
          mode: priority === 0 ? "exclude" : "degrade",
          priority: typeof priority === "number" ? priority : 0,
          weekdays: rule.window.weekdays,
        });
        // ⚠️ 带时段的规则若同时是 P1/P2 语义,仍要登记档位(免费档/积分到期),
        // 否则只是加个时段就会把「免费优先」悄悄弄丢。
        if (model && priority === 1) {
          freeModels.push({ provider, model, expiresAt: rule.expires_at ?? null });
        }
        if (rule.expires_at !== undefined && !model) {
          creditExpiry[provider] = rule.expires_at;
        }
        continue;
      }
      if (model && priority === 1) {
        freeModels.push({ provider, model, expiresAt: rule.expires_at ?? null });
        continue;
      }
      if (rule.expires_at !== undefined && !model) {
        creditExpiry[provider] = rule.expires_at;
        continue;
      }
      // 2026-11-07 修 P4 调度优先级未生效:无时段、非 P1/P2 语义的规则此前
      // 在此被**整条丢弃**,从未进入任何 SchedulerConfig 视图 → 既不 exclude
      // 也不 degrade。用户把 sensenova 配进 P4 却仍被优先调用,根因就在这里。
      //
      // ⚠️ 不是 DEGRADED_TIER 与档位号 4 撞车:那个 4 只是排序键(越大的 tier
      // 越靠后,见 engine-constants 的 1<2<3<4),与用户配的「P4 档」是两个
      // 独立概念;撞车假设不成立(时段 P4 规则一直工作正常,可作反证)。
      //
      // 只登记 P0 / P4:这两档才带「惩罚」语义(P0 剔除、P4 降到链末)。
      // P3 是「普通消耗档」= 基线档位,不进 staticRules —— 否则把成员写进
      // 缺省档反而被降级,与设置页「普通消耗」的说明相矛盾。
      //
      // ⚠️ 面板允许「只勾星期、不填时间段」:这类规则没有 times,进不了
      // timeWindows(isBlackout 要 times 非空才可能命中),所以星期必须带过来,
      // 否则「只勾周三」会被当成「每天都降级」。
      if (priority === 0 || priority === 4) {
        const staticRule: StaticRule = {
          provider,
          model: model ?? "",
          mode: priority === 0 ? "exclude" : "degrade",
        };
        if (rule.window?.weekdays !== undefined) staticRule.weekdays = rule.window.weekdays;
        staticRules.push(staticRule);
      }
      // 其余规则(含纯 expires_at + model 的到期档、P3 普通档)由 plan 侧按档位解析。
    }
    return { rules, freeModels, creditExpiry, timeWindows, staticRules };
  }

  /** 读 5 个档位键合并成扁平 rules(键名即档位,注入 priority);5 键全空 → null。 */
  private _readRulesFromKeys(): Rule[] | null {
    const out: Rule[] = [];
    let any = false;
    for (const p of RULES_PRIORITY_KEYS) {
      const raw = this.repo.getSetting(rulesKeyOf(p));
      if (raw === null || raw === undefined || raw.trim() === "") continue;
      any = true;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const r of validRules(parsed)) {
        out.push({ ...r, priority: p });
      }
    }
    return any ? out : null;
  }

  private _freeEntries(): FreeEntry[] {
    return this._config().freeModels;
  }
  private _freeEntryOf(realModelId: string): FreeEntry | null {
    for (const e of this._freeEntries()) {
      if (realModelId === `${e.provider}/${e.model}`) return e;
    }
    return null;
  }
  private _isFreeModel(realModelId: string, now: number): boolean {
    const entry = this._freeEntryOf(realModelId);
    if (entry === null) return false;
    if (entry.expiresAt) {
      const epoch = expiryEpoch(entry.expiresAt);
      if (epoch !== null && now >= epoch) return false;
    }
    return true;
  }
  private _freeRankOf(realModelId: string): number {
    const entries = this._freeEntries();
    const i = entries.findIndex((e) => realModelId === `${e.provider}/${e.model}`);
    return i === -1 ? entries.length : i;
  }
  private _isFreeTier(provider: string, model: string, now: number): boolean {
    return this._isFreeModel(key(provider, model), now);
  }
  private _creditExpiry(): Record<string, string> {
    return this._config().creditExpiry;
  }
  private _windowRules(): WindowRule[] {
    return this._config().timeWindows;
  }

  /** 命中当前时段黑名单的规则(weekdays 过滤 + 时段右开判定)。 */
  private _rulesFor(logical: string, provider: string, model: string, now: number): WindowRule[] {
    const out: WindowRule[] = [];
    for (const rule of this._windowRules()) {
      const rl = rule.logical || "*";
      if (rl !== "*" && rl !== logical) continue;
      if (rule.provider !== provider || rule.model !== model) continue;
      const windows: BlackoutWindow[] = [{ weekdays: rule.weekdays, times: rule.times }];
      if (isBlackout(windows, now)) out.push(rule);
    }    return out;
  }
  private _degraded(pair: Pair, logical: string, now: number): boolean {
    if (this._staticRulesFor(pair[0], pair[1], now).some((r) => r.mode === "degrade")) return true;
    return this._rulesFor(logical, pair[0], pair[1], now).some((r) => r.mode === "degrade");
  }

  /**
   * 命中该 provider/model 的静态档位规则(静态 P0 禁用于 chain()、静态 P4 用于降级)。
   *
   * 只带 `weekdays` 的规则按星期过滤;只带 `times` 的规则走 `timeWindows`(不在此表)。
   */
  private _staticRulesFor(provider: string, model: string, now: number): StaticRule[] {
    const weekday = new Date(now * 1000).getDay() || 7; // 0=周日 → 7
    return this._config().staticRules.filter(
      (r) =>
        r.provider === provider &&
        (r.model === "" || r.model === model) &&
        (r.weekdays === undefined || r.weekdays.length === 0 || r.weekdays.includes(weekday)),
    );
  }

  private _strategyOf(logicalName: string): StrategyName {
    let raw: unknown = null;
    if (typeof this.repo.logicalModelRow === "function") {
      try {
        const row = this.repo.logicalModelRow(logicalName);
        if (row && typeof row === "object") {
          raw = (row as Record<string, unknown>).strategy ?? null;
        }
      } catch {
        /* 继续走设置兜底 */
      }
    }
    if (!raw) {
      try {
        raw = this.repo.getSetting(`strategy.${logicalName}`);
      } catch {
        raw = null;
      }
    }
    return normalizeStrategy(raw);
  }

  /** 成员列表:members_of 优先(去重保首次),否则从行派生(先见序)。 */
  private _members(logicalName: string, rows?: RawEndpointRow[] | null): Pair[] {
    const out: Pair[] = [];
    const seen = new Set<string>();
    if (typeof this.repo.membersOf === "function") {
      const list = this.repo.membersOf(logicalName);
      if (list) {
        for (const member of list) {
          const pair = memberPair(member);
          if (pair) {
            const k = key(pair[0], pair[1]);
            if (!seen.has(k)) {
              seen.add(k);
              out.push(pair);
            }
          }
        }
      }
    }
    if (out.length > 0) return out;
    const list = rows ?? this.repo.endpointChain(logicalName);
    if (list) {
      for (const row of list) {
        const pair = rowMember(row);
        if (pair) {
          const k = key(pair[0], pair[1]);
          if (!seen.has(k)) {
            seen.add(k);
            out.push(pair);
          }
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------- 额度
  private _quotaMap(now: number, force: boolean): Record<string, QuotaSnapshot> {
    const fresh = !force && now - this._quotasAt < this.ttl;
    if (fresh && Object.keys(this._quotas).length > 0) return this._quotas;
    const quotas = this.repo.quotas() ?? {};
    this._quotas = { ...quotas };
    this._quotasAt = now;
    return this._quotas;
  }
  private _quotaAgeOf(
    providers: string[],
    quotas: Record<string, QuotaSnapshot>,
    now: number,
  ): number | null {
    const wanted = new Set(providers);
    let newest: number | null = null;
    for (const [qkey, snap] of Object.entries(quotas ?? {})) {
      const head = qkey.split("/")[0];
      if (!wanted.has(head)) continue;
      if (!snap || typeof snap !== "object") continue;
      const at = (snap as Record<string, unknown>).fetched_at;
      if (typeof at === "number" && at > 0) newest = newest === null ? at : Math.max(newest, at);
    }
    if (newest === null) return null;
    return Math.max(0, now - newest);
  }
  private _quotaRefreshProvidersOf(members: Pair[]): string[] {
    const wanted = new Set<string>();
    for (const [p] of members) {
      if (QUOTA_REFRESH_PROVIDERS.includes(p)) wanted.add(p);
    }
    return [...wanted].sort();
  }
  /** fire-and-forget:额度太旧且距上次刷新超过 TTL → 触发一次(回调抛异常不升级)。 */
  private _maybeRefreshQuotas(
    members: Pair[],
    quotas: Record<string, QuotaSnapshot>,
    now: number,
  ): string[] {
    if (this._quotaRefresher === null) return [];
    const wanted = this._quotaRefreshProvidersOf(members);
    if (wanted.length === 0) return [];
    const age = this._quotaAgeOf(wanted, quotas, now);
    if (age === null) return [];
    if (age < this.ttl || now - this._refreshAt < this.ttl) return [];
    this._refreshAt = now;
    this._refreshTriggers += 1;
    try {
      this._quotaRefresher(wanted);
    } catch {
      return [];
    }
    return wanted;
  }

  setQuotaRefresher(fn: ((providers: string[]) => void) | null): this {
    this._quotaRefresher = fn;
    return this;
  }

  /**
   * 该逻辑模型是否值得预取配额:仅 due-first、有 trae/workbuddy 成员、
   * 且快照够旧。⚠️ 不看 _refreshAt(请求路径每份过期快照最多等一次)。
   */
  pendingQuotaRefresh(logicalName: string, now?: number): string[] {
    const t = now ?? this._now();
    if (this._strategyOf(logicalName) !== "due-first") return [];
    const wanted = this._quotaRefreshProvidersOf(this._members(logicalName));
    if (wanted.length === 0) return [];
    const age = this._quotaAgeOf(wanted, this._quotaMap(t, false), t);
    if (age === null || age < this.ttl) return [];
    return wanted;
  }

  /** 清空记忆化/额度/配置缓存。⚠️ 不清 _refreshAt(否则会每请求触发刷新)。 */
  invalidate(): void {
    this._cache.clear();
    this._quotas = {};
    this._quotasAt = 0.0;
    this._cfgCache = null;
    this._cfgAt = 0.0;
  }

  // ------------------------------------------------------------- 排序
  private _expiryOf(
    row: RawEndpointRow,
    quotas: Record<string, QuotaSnapshot>,
    pair?: Pair,
  ): number | null {
    const p = pair ?? rowMember(row) ?? ["", ""];
    const qkey = quotaKey(row, p);
    if (qkey) {
      const snapshot = quotas[qkey];
      if (snapshot && typeof snapshot === "object") {
        const exp = (snapshot as Record<string, unknown>).expires_at;
        if (typeof exp === "number" && exp > 0) return exp;
      }
    }
    // 多账号回落:该凭据自己没有到期读数时,用 **provider 级聚合**的到期
    // (装配层把「各账号到期取最早」写成 `quotas["<provider>"]`,见
    // `packages/panel/src/channels.ts` 的 quotaRollupOf)。
    //
    // 为什么需要这一步:一个 provider 有 N 个号时,探针只对**部分**号拿得到
    // `expires_at`(另外的号可能是新加的、或那次探针失败)。只看凭据级快照的话,
    // 那些号 expiry 恒 null → 不能参与「谁先到期」的升序比较,只能落进
    // 「到期未知」档。回落 provider 聚合能让它们至少按最早到期日参与排序,
    // 而不是一律沉到底(用户 m34799 定案:到期取最早值)。
    //
    // ⚠️ 即便仍然是 null 也没关系:**null 排本层末位**(见 `_order` 的
    // UNKNOWN_EXPIRY),不会被误当成「永不过期所以先用光」。
    if (p[0] !== "") {
      const rollup = quotas[p[0]];
      if (rollup && typeof rollup === "object") {
        const exp = (rollup as Record<string, unknown>).expires_at;
        if (typeof exp === "number" && exp > 0) return exp;
      }
    }
    const staticExp = this._creditExpiry()[p[0]];
    if (staticExp) {
      const epoch = expiryEpoch(staticExp);
      if (epoch !== null) return epoch;
    }
    return null;
  }
  /** 每个真实模型取各凭据里**最早**的到期。 */
  private _expiryMap(
    rows: RawEndpointRow[],
    quotas: Record<string, QuotaSnapshot>,
  ): Map<string, number> {
    const out = new Map<string, number>();
    for (const row of rows) {
      const pair = rowMember(row);
      if (!pair) continue;
      const exp = this._expiryOf(row, quotas, pair);
      if (exp === null) continue;
      const mid = key(pair[0], pair[1]);
      const cur = out.get(mid);
      if (cur === undefined || exp < cur) out.set(mid, exp);
    }
    return out;
  }

  /**
   * 五策略档序:
   *  - ordered-fallback:数组顺序即档链;
   *  - random:每次随机打散(不缓存);
   *  - least-busy / balanced:调度器只出配置序 + 策略标签(真实选择在 Planner);
   *  - due-first:T1 免费(名单序)→ T2 赠送 → T3 消耗(到期升序,未知排末)→ T4 降级。
   *
   * 2026-11-07(用户报 P4 未生效)起,**降级对全部策略生效**:策略先出各自
   * 的基础序,再把命中降级规则的成员**稳定下沉到末尾**。此前只有 due-first
   * 看 `_degraded`,其余四种策略(含缺省策略 random)完全忽略降级规则 ——
   * 于是用户配了 P4 却仍被优先调用(rand 打散里降级项一样有机会排第一)。
   */
  private _order(
    strategy: StrategyName,
    logicalName: string,
    members: Pair[],
    expiry: Map<string, number>,
    now: number,
  ): { order: number[]; reasons: Map<string, string> } {
    const n = members.length;
    const midOf = (i: number) => key(members[i]![0], members[i]![1]);
    const configOrder = (reason: string): { order: number[]; reasons: Map<string, string> } => {
      const idx = Array.from({ length: n }, (_, i) => i);
      const reasons = new Map<string, string>();
      for (let i = 0; i < n; i++) reasons.set(midOf(i), reason);
      return { order: idx, reasons };
    };
    /** 稳定下沉:保留策略给出的相对序,只把降级成员挪到末尾。 */
    const sinkDegraded = (base: { order: number[]; reasons: Map<string, string> }): {
      order: number[];
      reasons: Map<string, string>;
    } => {
      const keep: number[] = [];
      const sunk: number[] = [];
      for (const src of base.order) {
        if (this._degraded(members[src]!, logicalName, now)) {
          sunk.push(src);
          base.reasons.set(midOf(src), DEGRADED_REASON);
        } else {
          keep.push(src);
        }
      }
      return { order: [...keep, ...sunk], reasons: base.reasons };
    };
    if (strategy === "ordered-fallback") return sinkDegraded(configOrder("数组顺序(按序降级链)"));
    if (strategy === "random") {
      const idx = Array.from({ length: n }, (_, i) => i);
      this._rng.shuffle(idx);
      const reasons = new Map<string, string>();
      for (let i = 0; i < n; i++) reasons.set(midOf(i), "随机打散");
      return sinkDegraded({ order: idx, reasons });
    }
    if (strategy === "least-busy") {
      return sinkDegraded(configOrder("最少在途:由选路器按实时在途数裁决"));
    }
    if (strategy === "balanced") {
      return sinkDegraded(configOrder("平均使用:由选路器按剩余空位加权随机"));
    }
    // due-first(落到这里)
    //
    // ⚠️ **到期未知(null)排本层末位**(排序键 Infinity),不是最前 —— 定案 2026-11-08:
    // 「先到期优先」的语义是**先用快过期的**;把 null 当成「永不过期」而排最前,
    // 等于让永远不过期的号先被用光、快过期的烂在池里(与用户 m34799「到期取最早值」
    // 的定案也相反)。`stableBy` 是升序稳定排序,Infinity 天然落尾,并列保持配置序。
    const UNKNOWN_EXPIRY = Number.POSITIVE_INFINITY;
    const keys: number[][] = [];
    for (let i = 0; i < n; i++) {
      const mid = midOf(i);
      if (this._degraded(members[i]!, logicalName, now)) keys.push([DEGRADED_TIER, 0, Infinity]);
      else if (this._isFreeTier(members[i]![0], members[i]![1], now))
        keys.push([FREE_TIER, this._freeRankOf(mid), 0]);
      else if (isGrantTier(members[i]![0], members[i]![1]))
        keys.push([GRANT_TIER, 0, expiry.get(mid) ?? UNKNOWN_EXPIRY]);
      else keys.push([CONSUME_TIER, 0, expiry.get(mid) ?? UNKNOWN_EXPIRY]);
    }
    const order = stableBy(keys);
    const reasons = new Map<string, string>();
    for (const src of order) {
      const mid = midOf(src);
      if (this._degraded(members[src]!, logicalName, now)) {
        reasons.set(mid, DEGRADED_REASON);
        continue;
      }
      if (this._isFreeTier(members[src]![0], members[src]![1], now)) {
        reasons.set(mid, `T1 免费档(名单第 ${this._freeRankOf(mid) + 1} 位)`);
        continue;
      }
      const tier = isGrantTier(members[src]![0], members[src]![1]) ? GRANT_TIER : CONSUME_TIER;
      const exp = expiry.get(mid);
      if (exp !== undefined && exp !== null && Number.isFinite(exp)) {
        reasons.set(mid, `${TIER_NAMES[tier]} 到期 ${formatLocal(exp)}`);
      } else {
        reasons.set(mid, `${TIER_NAMES[tier]} 到期未知(排本层末)`);
      }
    }
    return { order, reasons };
  }

  /** 排序视角的档链(命中剔除规则的成员仍在此列;剔除只发生在 chain)。 */
  planMembers(logicalName: string, opts?: { now?: number; force?: boolean }): ScheduledMemberData[] {
    return this._plan(logicalName, null, opts?.now ?? this._now(), opts?.force ?? false);
  }

  private _plan(
    logicalName: string,
    rows: RawEndpointRow[] | null,
    now: number,
    force: boolean,
  ): ScheduledMemberData[] {
    const strategy = this._strategyOf(logicalName);
    const cacheable = CACHEABLE_STRATEGIES.has(strategy);
    const minute = fmtMinute(now);
    if (cacheable && !force) {
      const hit = this._cache.get(logicalName);
      const quotaFresh = this._quotasAt > 0 && now - this._quotasAt < this.ttl;
      if (
        hit &&
        hit.minute === minute &&
        hit.strategy === strategy &&
        quotaFresh &&
        hit.quotasAt === this._quotasAt
      ) {
        return hit.members;
      }
    }
    const rowList = rows ?? this.repo.endpointChain(logicalName) ?? [];
    const members = this._members(logicalName, rowList);
    const quotas = this._quotaMap(now, force);
    const refreshed = this._maybeRefreshQuotas(members, quotas, now);
    const expiry = this._expiryMap(rowList, quotas);
    const { order, reasons } = this._order(strategy, logicalName, members, expiry, now);
    const result: ScheduledMemberData[] = order.map((src, pos) => {
      const mid = key(members[src]![0], members[src]![1]);
      return {
        realModelId: mid,
        provider: members[src]![0],
        model: members[src]![1],
        priority: pos,
        free: this._isFreeTier(members[src]![0], members[src]![1], now),
        expiresAt: expiry.get(mid) ?? null,
        reason: reasons.get(mid) ?? "",
        strategy,
      };
    });
    if (cacheable) {
      this._cache.set(logicalName, {
        minute,
        strategy,
        members: result,
        quotasAt: this._quotasAt,
      });
    }
    this.lastPlan = {
      logical_model: logicalName,
      at: minute,
      strategy,
      cached: cacheable,
      quota_age_s: this._quotasAt > 0 ? round1(now - this._quotasAt) : null,
      quota_refreshed: [...refreshed],
      order: result.map((m) => ({
        real_model: m.realModelId,
        priority: m.priority,
        free: m.free,
        reason: sortReason(m),
      })),
    };
    return result;
  }

  /** 端点链:已按档序排序、已剔除时段禁用项;直接模型走凭据序。 */
  chain(logicalName: string, opts?: { now?: number; force?: boolean }): ChainItem[] {
    const now = opts?.now ?? this._now();
    const rows = this.repo.endpointChain(logicalName) ?? [];
    const members = this._members(logicalName, rows);
    if (members.length === 0) {
      // 直接模型:凭据序,无调度规则;条目标记 direct → 抢占式 commit(m02240)
      const direct = this.repo.directChain(logicalName) ?? [];
      return direct.map((row) => ChainItem.fromData({ endpoint: row, direct: true }));
    }
    const plan = this._plan(logicalName, rows, now, opts?.force ?? false);
    const order = new Map(plan.map((m) => [m.realModelId, m.priority]));
    const strategy = this._strategyOf(logicalName);
    const items: ChainItem[] = [];
    // 每 key 的额度到期(2026-11-09 用户定案:「号池 = 多 key 渠道,选 key 按最快到期优先」):
    // 同一真实模型的多个凭据,按各自到期升序排,最快到期的 key 排最前 —— 这样
    // 「先到期的先被用」,避免快过期的额度烂在池里;未知到期排本档末位(Infinity)。
    // ⚠️ 键用 endpointId(含 key):不同 key 的到期不同,不能折叠成 provider/model。
    const keyExpiry = new Map<string, number>();
    for (const row of rows) {
      const pair = rowMember(row);
      if (!pair) continue;
      const mid = key(pair[0], pair[1]);
      if (!order.has(mid)) continue;
      const rules = this._rulesFor(logicalName, pair[0], pair[1], now);
      // 2026-11-07:无时段的静态 P0(禁用档)同样要整条剔除。
      if (
        rules.some((r) => r.mode === "exclude") ||
        this._staticRulesFor(pair[0], pair[1], now).some((r) => r.mode === "exclude")
      )
        continue;
      const windows: BlackoutWindow[] = rules.map((r) => ({
        weekdays: r.weekdays,
        times: r.times,
      }));
      // 🚦 **高消耗模型额度闸门**(2026-11-10 用户定案)。
      //
      // sensenova 的「通用积分池」把所有模型绑在同一份额度里,而 glm-5.3 的
      // 单位请求消耗是 deepseek-flash 的 2.6 倍(实测 828k vs 322k token/请求)。
      // 一旦 glm/kimi 把 5h 窗口打满,同账号的 deepseek 也跟着用不了。
      //
      // 所以:该账号的窗口剩余比例低于阈值时,**跳过这个端点**(深色模型的
      // 端点仍在链上,只是不参与本次选路)。便宜模型不受影响。
      //
      // 读不到比例(`null`)时放行 —— fail-open,别因为探针没采到就锁死链路。
      const gate = expensiveModelGateOf(pair[0], pair[1]);
      if (gate !== null) {
        // 凭据级优先,**读不到就回落到 provider 级聚合**(与 `_expiryOf` 同一口径):
        // 只有一个账号时装配层可能只写 provider 那一行。
        const qkey = quotaKey(row, pair);
        const snap =
          (qkey !== null ? this._quotas[qkey] : undefined) ?? this._quotas[pair[0]];
        const ratios = {
          w5: typeof snap?.w5_ratio === "number" ? snap.w5_ratio : null,
          w7: typeof snap?.w7_ratio === "number" ? snap.w7_ratio : null,
        };
        if (isQuotaShortFor(gate, ratios)) continue;
      }
      const item = ChainItem.fromData({
        ...row,
        priority: order.get(mid) ?? 0,
        blackout: windows,
        strategy,
        // least-busy / balanced 不看链序,必须显式告诉选路器「这台该少用」。
        degraded: this._degraded(pair, logicalName, now),
      });
      // 到期值以该 row 为准:expiryOf 优先取该凭据自己的额度快照(quotaKey →
      // `provider/username`),缺省回落 provider 级聚合 → 都无 → null。
      const exp = this._expiryOf(row, this._quotas, pair);
      keyExpiry.set(item.endpoint.endpointId, exp ?? Number.POSITIVE_INFINITY);
      items.push(item);
    }
    // 稳定排序:先按档序(priority),同档内按「key 到期升序」;
    // 两者都相等时保持 rows 原序(同一到期的 key 顺序不搅乱)。
    items.sort((a, b) => {
      const pa = a.priority - b.priority;
      if (pa !== 0) return pa;
      const ea = keyExpiry.get(a.endpoint.endpointId) ?? Number.POSITIVE_INFINITY;
      const eb = keyExpiry.get(b.endpoint.endpointId) ?? Number.POSITIVE_INFINITY;
      return ea - eb;
    });
    return items;
  }

  snapshot(): SchedulerSnapshot {
    const freeEntries = this._freeEntries();
    const prefixes = freeEntries.map((e) => `${e.provider}/${e.model}`);
    return {
      ttl_seconds: this.ttl,
      quota_loaded: this._quotasAt > 0,
      quota_age_s: this._quotasAt > 0 ? round1(this._now() - this._quotasAt) : null,
      strategies: [...STRATEGIES],
      default_strategy: DEFAULT_STRATEGY,
      free_prefixes: prefixes,
      free_order: prefixes,
      credit_expiry: { ...this._creditExpiry() },
      windows: [...this._windowRules()],
      load_aware_strategies: [...LOAD_AWARE_STRATEGIES],
      quota_refresh: {
        providers: [...QUOTA_REFRESH_PROVIDERS],
        wired: this._quotaRefresher !== null,
        min_interval_s: this.ttl,
        last_at: this._refreshAt > 0 ? this._refreshAt : null,
        triggers: this._refreshTriggers,
      },
      last_plan: { ...this.lastPlan },
    };
  }

  logicalHint(members: Pair[]): string {
    const parts = members.map(([p, m]) => key(p, m));
    return parts.length > 0 ? parts.join(",") : "(空档链)";
  }
}

// 保留段 3:InMemory*(2554-2659)
// ===========================================================================
// 纯内存实现(供测试与轻量嵌入)
// ===========================================================================

/** 内存版 SchedulerRepo(测试夹具基础;设置/逻辑模型/成员/链/额度都在内存)。 */
export class InMemoryRepo implements SchedulerRepo {
  private _settings = new Map<string, string>();
  private _logical = new Map<string, Record<string, unknown>>();
  private _memberRows = new Map<string, unknown[]>();
  private _chains = new Map<string, RawEndpointRow[]>();
  private _directs = new Map<string, RawEndpointRow[]>();
  private _quotas = new Map<string, QuotaSnapshot>();

  getSetting(key: string): string | null {
    return this._settings.get(key) ?? null;
  }
  setSetting(key: string, value: string): void {
    this._settings.set(key, value);
  }
  settings(): Record<string, string> {
    return Object.fromEntries(this._settings);
  }
  logicalModelRow(name: string): Record<string, unknown> | null {
    return this._logical.get(name) ?? null;
  }
  membersOf(name: string): unknown[] | null {
    return this._memberRows.get(name) ?? null;
  }
  endpointChain(name: string): RawEndpointRow[] {
    return this._chains.get(name) ?? [];
  }
  directChain(name: string): RawEndpointRow[] {
    return this._directs.get(name) ?? [];
  }
  quotas(): Record<string, QuotaSnapshot> {
    return Object.fromEntries(this._quotas);
  }

  // ---- 测试夹具辅助
  setLogicalModel(name: string, row: Record<string, unknown>): void {
    this._logical.set(name, row);
  }
  setMembers(name: string, members: unknown[]): void {
    this._memberRows.set(name, members);
  }
  setChain(name: string, rows: RawEndpointRow[]): void {
    this._chains.set(name, rows);
  }
  setDirectChain(name: string, rows: RawEndpointRow[]): void {
    this._directs.set(name, rows);
  }
  setQuota(qkey: string, snapshot: QuotaSnapshot): void {
    this._quotas.set(qkey, snapshot);
  }
  dropQuota(qkey: string): void {
    this._quotas.delete(qkey);
  }
}

/** 内存版 ProviderRegistry。 */
export class InMemoryProviderRegistry implements ProviderRegistry {
  private _providers = new Map<string, Map<string, { concurrency: number; vision: boolean; maxIn: number; maxOut: number }>>();

  register(provider: string, model: string, meta: Partial<{ concurrency: number; vision: boolean; maxIn: number; maxOut: number }> = {}): void {
    let models = this._providers.get(provider);
    if (!models) {
      models = new Map();
      this._providers.set(provider, models);
    }
    models.set(model, {
      // ⚠️ 2026-11-08:并发缺省按供应商查(config/concurrency-defaults),
      // 不再写死 1 —— 语义也已改成「每凭据」。
      concurrency: meta.concurrency ?? defaultConcurrencyOf(provider),
      vision: meta.vision ?? false,
      maxIn: meta.maxIn ?? 0,
      maxOut: meta.maxOut ?? 0,
    });
  }
  providerExists(provider: string): boolean {
    return this._providers.has(provider);
  }
  modelsOf(provider: string): string[] {
    return [...(this._providers.get(provider)?.keys() ?? [])];
  }
  concurrencyOf(provider: string, model: string): number {
    return this._providers.get(provider)?.get(model)?.concurrency ?? defaultConcurrencyOf(provider);
  }
  isVision(provider: string, model: string): boolean {
    return this._providers.get(provider)?.get(model)?.vision ?? false;
  }
  maxInputTokensOf(provider: string, model: string): number {
    return this._providers.get(provider)?.get(model)?.maxIn ?? 0;
  }
  maxOutputTokensOf(provider: string, model: string): number {
    return this._providers.get(provider)?.get(model)?.maxOut ?? 0;
  }
}

/** 内存版 AccountPool。 */
export class InMemoryAccountPool implements AccountPool {
  private _accounts = new Map<string, string[]>();
  setAccounts(provider: string, accounts: string[]): void {
    this._accounts.set(provider, accounts);
  }
  accountsOf(provider: string): string[] {
    return this._accounts.get(provider) ?? [];
  }
}

// ============ (第十刀:re-export 面板 —— 公开 API 与拆分前一致,旧 import "./engine.js" 不用改) ============

export * from "./engine-constants.js";
export * from "./engine-utils.js";
export * from "./engine-health.js";
export * from "./engine-models.js";
export * from "./engine-planner.js";
