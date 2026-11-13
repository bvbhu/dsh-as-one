// engine-planner.ts
// ========================================================================

import { ChainItem, Plan } from "./engine-models.js";
import {
  DEFAULT_PIN_SECONDS,
  LOAD_AWARE_STRATEGIES,
  RULES_TTL_SECONDS,
} from "./engine-constants.js";
import { HealthRegistry, InflightLedger, SessionPinTable } from "./engine-health.js";
import type {
  InflightLedgerLike,
  PlannerSnapshot,
  PreemptNotifier,
  RequestOutcome,
  RetryPolicyData,
  Rng,
  SchedulerRepo,
} from "./types.js";
import { MathRng, RetryPolicy, SeededRng } from "./backoff.js";
import { key, rulesCooldownMap, wallNow } from "./engine-utils.js";
import { isStickyNoSwitchProvider } from "./sticky.js";
// 本节由第十刀从 engine.ts 按行段抽出;import/导出由外面接线。
// ========================================================================

// ===========================================================================
// Planner(Router.plan/commit/finish 语义)
// ===========================================================================

export interface PlannerOptions {
  ledger?: InflightLedgerLike;
  pinSeconds?: number;
  health?: HealthRegistry;
  onCommit?: (realModelId: string, logicalName: string) => void;
  seed?: number;
}

export interface FinishOptions {
  leaseId?: string;
  sessionId?: string;
  ok?: boolean;
  error?: string;
  kind?: string;
  status?: number;
  latencyMs?: number;
  ttftMs?: number | null;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  cooldownUntil?: number | null;
  /**
   * 本次是被**直连请求抢占**的(m02240)—— 不是上游失败。
   *
   * ⚠️ 与 `router/router.ts` 的同名选项**同源同义**:端点一次都没失败过,
   * 按普通失败记账会给它记一次连续失败 + 冷却,平白连累一个健康端点;
   * 同时**不解除会话粘性**(抢占不是「这个端点坏了」)。
   */
  preempted?: boolean;
}

/**
 * 选路器:会话亲和 → 负载感知(least-busy/balanced 分桶裁决)→ 按序分配。
 * 全部状态(pin/健康/在途)只在内存。冷却覆盖表 5s TTL 实例缓存。
 */
export class Planner {
  readonly repo: SchedulerRepo;
  readonly ledger: InflightLedgerLike;
  readonly health: HealthRegistry;
  readonly pins: SessionPinTable;
  readonly pinSeconds: number;
  onCommit: ((realModelId: string, logicalName: string) => void) | null;

  private _rng: Rng;
  private _cdRules: Map<string, number> | null = null;
  private _cdRulesAt = 0.0;

  constructor(repo: SchedulerRepo, opts: PlannerOptions = {}) {
    this.repo = repo;
    this.pinSeconds = opts.pinSeconds ?? DEFAULT_PIN_SECONDS;
    this.pins = new SessionPinTable(this.pinSeconds);
    this.health = opts.health ?? new HealthRegistry();
    this.ledger =
      opts.ledger ??
      new InflightLedger({
        maxRecentFn: () => this._recentLimit(),
      });
    this.onCommit = opts.onCommit ?? null;
    this._rng = opts.seed !== undefined ? new SeededRng(opts.seed) : MathRng;
  }

  private _cooldownRules(): Map<string, number> {
    const now = wallNow();
    if (this._cdRules !== null && now - this._cdRulesAt < RULES_TTL_SECONDS) {
      return this._cdRules;
    }
    const table = rulesCooldownMap(this.repo);
    this._cdRules = table;
    this._cdRulesAt = now;
    return table;
  }
  private _cooldownMinOverride(provider: string): number | null {
    if (!provider) return null;
    const v = this._cooldownRules().get(provider);
    return v === undefined ? null : v;
  }
  /** 本次失败用的冷却策略(只有 cooldown_floor_s 被用到;读不动 → None = 不熔断)。 */
  private _cooldownPolicy(provider: string): RetryPolicy | null {
    let policy: RetryPolicy;
    try {
      policy = RetryPolicy.of(this.repo, { abstract: false });
    } catch {
      return null;
    }
    const overrideMin = this._cooldownMinOverride(provider);
    if (overrideMin !== null) {
      const data: RetryPolicyData = {
        maxAttempts: policy.maxAttempts,
        cooldownFloorS: overrideMin * 60.0,
        baseS: policy.baseS,
        factor: policy.factor,
        capS: policy.capS,
        jitterRatio: policy.jitterRatio,
        codes: policy.codes,
      };
      return new RetryPolicy(data);
    }
    return policy;
  }

  /**
   * 选路:1) 会话亲和(粘住且可用 → 直接用;忙 → 保 pin;冷却/不在链 → 解除);
   * 2) 负载感知;3) 按序分配。视觉请求收窄 pool 到视觉端点。
   */
  plan(
    chain: ChainItem[],
    opts: { sessionId?: string; needsVision?: boolean; ignoreCooldown?: boolean } = {},
  ): Plan {
    if (chain.length === 0) return new Plan(null, "all_blackout");
    const sessionId = opts.sessionId ?? "";
    const ignoreCooldown = !!opts.ignoreCooldown;
    // 注入内存健康记录(链来自 Repo,不带最新状态)
    const items = chain.map(
      (item) =>
        new ChainItem({
          endpoint: item.endpoint.withHealth(this.health.get(item.endpoint.endpointId)),
          priority: item.priority,
          blackout: item.blackout,
          strategy: item.strategy,
          direct: item.direct,
        }),
    );
    let pool = items;
    if (opts.needsVision) {
      const vision = items.filter((it) => it.endpoint.supportsVision);
      if (vision.length > 0) pool = vision;
    }

    // 1) 会话亲和
    const pinned = this.pins.get(sessionId);
    if (pinned) {
      const wanted = pinned;
      let onChain = false;
      let affinityResult: Plan | null = null;
      for (const item of pool) {
        if (item.endpoint.endpointId !== wanted) continue;
        onChain = true;
        // 「粘性期间不换号」一族(sensenova,见 scheduler/sticky.ts):
        // 本地冷却**不解除粘性**。冷却只是「新会话选号时别选它」的提示,不是
        // 「把这个会话赶到另一个账号」的理由 —— 换号换的是同一服务的另一把
        // 钥匙,对用户没有意义。429 的处理权在连接器:同号有界硬等,预算耗尽
        // 才回 429 + Retry-After,由客户端退避(期间仍然是同一个号)。
        const stickyNoSwitch = isStickyNoSwitchProvider(item.endpoint.provider);
        const cooling = item.endpoint.inCooldown() && !ignoreCooldown;
        if (cooling && !stickyNoSwitch) {
          this.pins.drop(sessionId, wanted);
          break;
        }
        // ⚠️ 容量键是端点(凭据),不是真实模型(2026-11-08)。
        if (this.ledger.hasRoom(item.endpoint.endpointId, item.endpoint.concurrency)) {
          affinityResult = new Plan(item, cooling ? "affinity_sticky" : "affinity", true);
          break;
        }
        // 只是忙 → 保 pin;但粘性不换号一族**就地失败**,不下探到同模型的另一个
        // 账号(那是并发溢出,不是「更好的上游」,换过去等于悄悄换了号)。
        if (stickyNoSwitch) return new Plan(null, "all_busy");
        break;
      }
      if (!onChain) this.pins.drop(sessionId, wanted);
      if (affinityResult) return affinityResult;
    }

    // 2) 负载感知
    const strategy = chain[0]!.strategy || "";
    if (LOAD_AWARE_STRATEGIES.has(strategy)) {
      return this._planLoadAware(pool, strategy, ignoreCooldown);
    }

    // 3) 按序分配
    const healthy = pool.filter(
      (it) => ignoreCooldown || !it.endpoint.inCooldown(),
    );
    if (healthy.length === 0) return new Plan(null, "all_cooldown");
    for (const item of healthy) {
      // ⚠️ 容量键是端点(凭据):同一模型下三个凭据 concurrency=1 = 三个并发位。
      if (this.ledger.hasRoom(item.endpoint.endpointId, item.endpoint.concurrency)) {
        return new Plan(item, "ordered");
      }
    }
    // 3b) **抢占式兜底**(m02240):直连请求的槽位满了,但桶里还有**可让的逻辑
    //     租约** → 照样选出来,让 `commit` 走抢占路径(踢掉一条逻辑租约)。
    //     与 `router/router.ts` 同源同义:少了它,抢占在**选路**阶段就被
    //     all_busy 挡掉,根本走不到 commit 里的 acquireDirect。
    for (const item of healthy) {
      if (!item.direct) continue;
      if (this.ledger.hasPreemptable(item.endpoint.endpointId)) {
        return new Plan(item, "ordered");
      }
    }
    return new Plan(null, "all_busy");
  }

  /**
   * 负载感知裁决:**按端点(凭据)分桶**,每桶 = 一个凭据的剩余空位
   * (`concurrency - 该凭据 inFlight`),再 least-busy(在途最少,并列按档序)/
   * balanced(剩余空位加权随机)。永不超任一凭据的并发上限;冷却端点跳过
   * (除非 ignore_cooldown)。
   *
   * ⚠️ 2026-11-08 并发改按凭据计后,这里**不再按 real_model_key 归并**:旧口径
   * 必须归并是因为账本对同一模型的各凭据返回同一个在途数;现在账本按端点计数,
   * 逐端点分桶才对(3 凭据 × concurrency=1 = 3 个桶,各算各的空位)。
   */
  private _planLoadAware(
    pool: ChainItem[],
    strategy: string,
    ignoreCooldown: boolean,
  ): Plan {
    interface Bucket {
      item: ChainItem;
      used: number;
      room: number;
    }
    const buckets = new Map<string, Bucket>();
    for (const item of pool) {
      if (item.endpoint.inCooldown() && !ignoreCooldown) continue;
      // 容量键 = 端点 id(含 username)= 一个凭据一个桶。
      const key = item.endpoint.endpointId;
      const used = this.ledger.inFlight(key);
      const room = Math.max(0, Math.trunc(item.endpoint.concurrency) - used);
      const cur = buckets.get(key);
      if (cur === undefined) {
        buckets.set(key, { item, used, room });
      } else {
        // 同一端点重复出现(理论上不该有):保守取更小的空位。
        cur.room = Math.min(cur.room, room);
        cur.used = Math.max(cur.used, used);
      }
    }
    if (buckets.size === 0) {
      const anyCooldown = pool.some((it) => it.endpoint.inCooldown());
      if (anyCooldown && !ignoreCooldown) return new Plan(null, "all_cooldown");
      return new Plan(null, "all_busy");
    }
    const roomy = [...buckets.values()].filter((b) => b.room > 0);
    if (roomy.length === 0) return new Plan(null, "all_busy");

    // 2026-11-07(修 P4 未生效):负载感知策略不看链序,降级必须在这里体现 ——
    // 只要还有**未降级**的可用桶,就把降级桶排除在候选外(等价于「排到最后」)。
    // 全部候选都降级时仍然用它们:降级 = 少用,不是禁用(禁用是 P0 的事)。
    const preferred = roomy.filter((b) => b.item.degraded !== true);
    const candidates = preferred.length > 0 ? preferred : roomy;

    if (strategy === "least-busy") {
      candidates.sort((a, b) => a.used - b.used || a.item.priority - b.item.priority);
      return new Plan(candidates[0]!.item, "least_busy");
    }

    // balanced:按剩余空位加权随机 —— 每个空位等概率被选中
    const total = candidates.reduce((s, b) => s + b.room, 0);
    let pick = this._rng.random() * total;
    for (const b of candidates) {
      pick -= b.room;
      if (pick <= 0) return new Plan(b.item, "balanced");
    }
    return new Plan(candidates[candidates.length - 1]!.item, "balanced");
  }

  /**
   * 落账:占在途租约(**容量键 = 端点/凭据**,`realModelId` 只用于展示与抢占标记)
   * + 会话 pin(已有 pin 不覆盖)。
   */
  commit(
    plan: Plan,
    opts: {
      sessionId: string;
      logicalName?: string;
      stream?: boolean;
      /**
       * 被抢占时的通知回调(m02240)—— 登记在逻辑租约上,直连请求挤掉它时
       * 被调用(用来打断自己的上游调用)。与 `router/router.ts` 同源同义。
       */
      onPreempt?: PreemptNotifier;
    },
  ): string {
    if (plan.item === null) return "";
    const ep = plan.item.endpoint;
    const logicalName = opts.logicalName ?? "";
    const sessionId = opts.sessionId;
    // 直连条目(m02240):抢占式获取 —— 槽满时踢最新逻辑租约让位;无可抢占 → ""
    let leaseId: string;
    if (plan.item.direct) {
      const acquired = this.ledger.acquireDirect(ep.realModelKey, ep.concurrency, {
        endpointId: ep.endpointId,
        logicalModel: logicalName,
        sessionId,
        stream: !!opts.stream,
      });
      if (acquired === null) return "";
      leaseId = acquired;
    } else {
      leaseId = this.ledger.acquire(ep.realModelKey, {
        endpointId: ep.endpointId,
        logicalModel: logicalName,
        sessionId,
        stream: !!opts.stream,
        onPreempt: opts.onPreempt,
      });
    }
    if (!this.pins.get(sessionId)) {
      this.pins.set(sessionId, ep.endpointId);
    }
    if (this.onCommit !== null) {
      try {
        this.onCommit(ep.realModelKey, logicalName);
      } catch {
        /* 观测回调不该拖垮请求 */
      }
    }
    return leaseId;
  }

  touch(leaseId: string): boolean {
    return this.ledger.touch(leaseId);
  }

  /**
   * 收尾:释放在途租约(句柄精确,缺句柄退 release_bucket)+ 记成败;
   * 失败 → 解除会话 pin + 端点熔断(provider 覆盖 > 全局 floor;成功绝不 unpin)。
   */
  finish(plan: Plan, opts: FinishOptions = {}): void {
    if (plan.item === null) return;
    const ep = plan.item.endpoint;
    const ok = opts.ok ?? true;
    const counted = Boolean(
      opts.latencyMs || opts.ttftMs || opts.promptTokens || opts.completionTokens || opts.cachedTokens,
    );
    const outcome: RequestOutcome | null = counted
      ? {
          ok,
          status: opts.status ?? 0,
          latencyMs: Math.trunc(opts.latencyMs ?? 0),
          ttftMs: opts.ttftMs ?? null,
          promptTokens: Math.trunc(opts.promptTokens ?? 0),
          completionTokens: Math.trunc(opts.completionTokens ?? 0),
          cachedTokens: Math.trunc(opts.cachedTokens ?? 0),
          error: opts.error ?? "",
        }
      : null;
    if (opts.leaseId) {
      this.ledger.release(opts.leaseId, { outcome });
    } else {
      // 缺句柄的退路:只清这个端点(凭据)的租约(容量键,2026-11-08)。
      this.ledger.releaseBucket(ep.endpointId);
    }
    // ⚠️ **被抢占 ≠ 上游失败**(m02240):端点一次都没失败过,只是「直连优先级
    // 更高」。按失败记账会给它记一次连续失败 + 冷却 —— 平白连累健康端点。
    // 抢占路径**完全不动健康账本**,也**不解除会话粘性**。
    if (opts.preempted !== true) {
      this.health.note(ep.endpointId, {
        ok,
        error: opts.error ?? "",
        kind: opts.kind ?? "",
        status: opts.status ?? 0,
        policy: ok ? null : this._cooldownPolicy(ep.provider),
        until: ok ? null : (opts.cooldownUntil ?? null),
      });
      if (!ok) {
        // 粘性不换号一族:限流失败**不解除粘性**。解除的后果是「下一次请求
        // 重新 plan → 落到同模型的另一个账号」,那正是用户要禁掉的换号。
        // 只有真正的凭据/请求问题(401/400 等)才解除 —— 那种情况换号才有意义,
        // 而且 key 自愈链路会先把钥匙换好。
        const keepPin =
          isStickyNoSwitchProvider(ep.provider) &&
          (opts.kind === "rate_limit" || opts.status === 429);
        if (!keepPin) this.pins.drop(opts.sessionId ?? "", ep.endpointId);
      }
    }
  }

  snapshot(): PlannerSnapshot {
    return {
      inflight: this.ledger.snapshot(),
      inflight_total: this.ledger.total(),
      inflight_key: "real_model_id",
      pin_seconds: this.pinSeconds,
      pins: this.pins.count(),
      health: this.health.snapshot(),
    };
  }

  /** 保留区容量活来源(ui.recent_limit,默认 50;不缓存)。 */
  private _recentLimit(): number {
    const def = 50;
    try {
      const raw = this.repo.getSetting("ui.recent_limit");
      const limit = Math.trunc(Number(raw ?? def));
      if (Number.isNaN(limit)) return def;
      return limit >= 1 ? limit : def;
    } catch {
      return def;
    }
  }
}
