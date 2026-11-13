// engine-health.ts
// ========================================================================

import type {
  AcquireOptions,
  CompletedRequestData,
  EndpointHealthData,
  InflightLeaseData,
  InflightLedgerLike,
  PreemptNotifier,
  ReleaseOptions,
  RequestOutcome,
  SessionId,
} from "./types.js";
import {
  CONV_ORDER_LIMIT,
  DEFAULT_LEASE_SECONDS,
  DEFAULT_MAX_RECENT,
  DEFAULT_PIN_SECONDS,
  PREEMPT_ERROR,
  TRANSIENT_KINDS,
} from "./engine-constants.js";
import { RetryPolicy } from "./backoff.js";
import { monotonic, wallNow } from "./engine-utils.js";
import { computeTps } from "../request-log/tps.js";
// 本节由第十刀从 engine.ts 按行段抽出;import/导出由外面接线。
// ========================================================================

/** 端点健康(可变;冷却语义的载体;对齐 EndpointHealth)。 */
export class EndpointHealth {
  fails = 0;
  cooldownUntil = 0;
  lastError = "";
  updatedAt = 0;
  lastKind = "";
  lastStatus = 0;

  /** 从快照数据重建(Endpoint ctor 注入 health 用)。 */
  static fromData(data: EndpointHealthData): EndpointHealth {
    const h = new EndpointHealth();
    h.fails = data.fails;
    h.cooldownUntil = data.cooldownUntil;
    h.lastError = data.lastError;
    h.updatedAt = data.updatedAt;
    h.lastKind = data.lastKind;
    h.lastStatus = data.lastStatus;
    return h;
  }

  inCooldown(now?: number): boolean {
    if (this.cooldownUntil <= 0) return false;
    return this.cooldownUntil > (now ?? wallNow());
  }

  noteSuccess(now?: number): void {
    const t = now ?? wallNow();
    this.fails = 0;
    this.cooldownUntil = 0;
    this.lastError = "";
    this.lastKind = "";
    this.lastStatus = 0;
    this.updatedAt = t;
  }

  /**
   * 记失败:until 给 → cooldown_until 精确等于 until(绝对);kind 属瞬时
   * (timeout/connection) → 不熔断;否则 cooldown_until = now + floor(无策略 = 0)。
   */
  noteFailure(opts: {
    error?: string;
    kind?: string;
    status?: number;
    now?: number;
    policy?: RetryPolicy | null;
    until?: number | null;
  }): void {
    const t = opts.now ?? wallNow();
    this.fails += 1;
    this.lastError = (opts.error ?? "").slice(0, 200);
    this.lastKind = opts.kind ?? "";
    this.lastStatus = Math.trunc(opts.status ?? 0);
    this.updatedAt = t;
    if (opts.until !== undefined && opts.until !== null) {
      this.cooldownUntil = opts.until;
      return;
    }
    if (TRANSIENT_KINDS.has(this.lastKind)) return;
    this.cooldownUntil = t + (opts.policy ? opts.policy.cooldownFloorS : 0);
  }

  toData(): EndpointHealthData {
    return {
      fails: this.fails,
      cooldownUntil: this.cooldownUntil,
      lastError: this.lastError,
      updatedAt: this.updatedAt,
      lastKind: this.lastKind,
      lastStatus: this.lastStatus,
    };
  }
}

/** 健康账本(get 只读不落表;note/clear/purge 才改表)。 */
export class HealthRegistry {
  private _items = new Map<string, EndpointHealth>();

  get(endpointId: string): EndpointHealth {
    let rec = this._items.get(endpointId);
    if (!rec) rec = new EndpointHealth();
    return rec;
  }
  known(endpointId: string): boolean {
    return this._items.has(endpointId);
  }
  note(
    endpointId: string,
    opts: {
      ok: boolean;
      error?: string;
      kind?: string;
      status?: number;
      now?: number;
      policy?: RetryPolicy | null;
      until?: number | null;
    },
  ): EndpointHealth {
    let rec = this._items.get(endpointId);
    if (!rec) {
      rec = new EndpointHealth();
      this._items.set(endpointId, rec);
    }
    if (opts.ok) rec.noteSuccess(opts.now);
    else rec.noteFailure(opts);
    return rec;
  }
  /** 强制解冻。 */
  clear(endpointId: string): void {
    this._items.delete(endpointId);
  }
  /** 冷却中的记录列表(按端点 id 排序)。 */
  cooled(now?: number): Array<{
    endpoint_id: string;
    fails: number;
    cooldown_until: number;
    last_error: string;
    last_kind: string;
    last_status: number;
  }> {
    const t = now ?? wallNow();
    const out: Array<{
      endpoint_id: string;
      fails: number;
      cooldown_until: number;
      last_error: string;
      last_kind: string;
      last_status: number;
    }> = [];
    for (const [id, rec] of [...this._items].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (rec.inCooldown(t)) {
        out.push({
          endpoint_id: id,
          fails: rec.fails,
          cooldown_until: rec.cooldownUntil,
          last_error: rec.lastError,
          last_kind: rec.lastKind,
          last_status: rec.lastStatus,
        });
      }
    }
    return out;
  }
  snapshot(now?: number): {
    tracked: number;
    cooling: number;
    items: Record<string, EndpointHealthData>;
  } {
    const t = now ?? wallNow();
    const items: Record<string, EndpointHealthData> = {};
    let cooling = 0;
    for (const [id, rec] of [...this._items].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (rec.inCooldown(t)) cooling += 1;
      items[id] = rec.toData();
    }
    return { tracked: this._items.size, cooling, items };
  }
  /** 清掉「失败过但已不冷却」的僵尸记录。 */
  purgeExpired(now?: number): number {
    const t = now ?? wallNow();
    let removed = 0;
    for (const [id, rec] of [...this._items]) {
      if (rec.fails > 0 && !rec.inCooldown(t)) {
        this._items.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

/** 会话 pin 表(monotonic 时基;过期即弃;drop 带端点比对防竞态)。 */
export class SessionPinTable {
  readonly ttlSeconds: number;
  private _pins = new Map<string, [string, number]>();

  constructor(ttlSeconds: number = DEFAULT_PIN_SECONDS) {
    this.ttlSeconds = ttlSeconds;
  }

  get(sessionId: SessionId, now?: number): string | null {
    if (!sessionId) return null;
    const t = now ?? monotonic();
    const hit = this._pins.get(sessionId);
    if (!hit) return null;
    if (hit[1] <= t) {
      this._pins.delete(sessionId);
      return null;
    }
    return hit[0];
  }
  set(sessionId: SessionId, endpointId: string, now?: number): void {
    if (!sessionId) return;
    this._pins.set(sessionId, [endpointId, (now ?? monotonic()) + this.ttlSeconds]);
  }
  /** 只有当前 pin 恰好指向 endpointId(或未指定)才解除 —— 防并发抢 pin。 */
  drop(sessionId: SessionId, endpointId?: string | null, now?: number): void {
    if (!sessionId) return;
    const hit = this._pins.get(sessionId);
    if (!hit) return;
    if (endpointId && hit[0] !== endpointId) return;
    this._pins.delete(sessionId);
  }
  count(now?: number): number {
    const t = now ?? monotonic();
    let n = 0;
    for (const [, hit] of this._pins) if (hit[1] > t) n += 1;
    return n;
  }
  snapshot(now?: number): { ttl_seconds: number; active: number; sessions: Record<string, string> } {
    const t = now ?? monotonic();
    const sessions: Record<string, string> = {};
    for (const [s, [ep, exp]] of [...this._pins].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (exp > t) sessions[s] = ep;
    }
    return { ttl_seconds: this.ttlSeconds, active: Object.keys(sessions).length, sessions };
  }
}

/** 在途租约(不可变快照)。 */
export class InflightLease {
  readonly leaseId: string;
  readonly seq: number;
  readonly realModelId: string;
  readonly endpointId: string;
  readonly logicalModel: string;
  readonly sessionId: SessionId;
  readonly stream: boolean;
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly convNo: number;
  /** 直连请求占用(true = 可抢占逻辑租约,不被逻辑请求抢占)。 */
  readonly direct: boolean;

  constructor(data: InflightLeaseData) {
    this.leaseId = data.leaseId;
    this.seq = data.seq;
    this.realModelId = data.realModelId;
    this.endpointId = data.endpointId;
    this.logicalModel = data.logicalModel;
    this.sessionId = data.sessionId;
    this.stream = data.stream;
    this.startedAt = data.startedAt;
    this.expiresAt = data.expiresAt;
    this.convNo = data.convNo;
    this.direct = data.direct;
  }
  elapsedS(now?: number): number {
    return Math.max(0, (now ?? monotonic()) - this.startedAt);
  }
}

/** 已结束请求(保留区;按条数裁剪)。 */
export class CompletedRequest {
  readonly lease: InflightLease;
  readonly finishedAt: number;
  readonly ok: boolean;
  readonly status: number;
  readonly error: string;
  readonly latencyMs: number;
  readonly ttftMs: number | null;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cachedTokens: number;

  constructor(data: CompletedRequestData) {
    this.lease = new InflightLease(data.lease);
    this.finishedAt = data.finishedAt;
    this.ok = data.ok;
    this.status = data.status;
    this.error = data.error;
    this.latencyMs = data.latencyMs;
    this.ttftMs = data.ttftMs;
    this.promptTokens = data.promptTokens;
    this.completionTokens = data.completionTokens;
    this.cachedTokens = data.cachedTokens;
  }
  /**
   * 输出速率 tok/s。
   *
   * ⚠️ 口径统一走 `computeTps`(request-log/tps.ts):非流式(ttft=null)与
   * 「首块≈末块」的伪流式上游,生成窗口不成立,退回端到端吞吐;
   * 早先这里直接用 latency-ttft 作分母,遇到那种上游会算出几十万 tok/s。
   */
  get tps(): number | null {
    return computeTps({
      completionTokens: this.completionTokens,
      latencyMs: this.latencyMs,
      ttftMs: this.ttftMs,
    });
  }
}

/**
 * 在途账本:**容量按端点(凭据)计**,展示按真实模型聚合;租约句柄精确释放;
 * 保留区只按条数清。
 *
 * ⚠️ 2026-11-08 用户改口:`concurrency` 是**每个凭据**并发(「并发设置为 1,
 * 三个凭据就可以三并发」)。所以容量键从 `realModelId` 改成**端点 id**
 * (`provider/model@username`)。`snapshot()` 仍逐条按 `lease.realModelId` 归并回
 * 真实模型 —— 面板/趋势图口径不变。与 `router/inflight-ledger.ts` 同源同义。
 */
export class InflightLedger implements InflightLedgerLike {
  private _lease: number;
  private _maxRecent: number;
  private _maxRecentFn: (() => number) | null;
  private _recentHint = 0;
  /** `容量键 -> Map<leaseId, lease>`;容量键 = 端点 id(缺省退回真实模型 id)。 */
  private _leases = new Map<string, Map<string, InflightLease>>();
  /** `leaseId -> 容量键`。 */
  private _index = new Map<string, string>();
  /**
   * `leaseId -> 抢占通知回调`(m02240)。
   *
   * ⚠️ 与 `router/inflight-ledger.ts` 的同名能力**同源同义**:两份账本是
   * 同一套抢占语义的两个视图。表项随租约释放同步删除(句柄复用不能误伤
   * 后来者)。
   */
  private _preemptHooks = new Map<string, PreemptNotifier>();
  private _seq = 0;
  private _convOrder = new Map<string, number>();
  private _convSeq = 0;
  private _recent: CompletedRequest[] = [];

  constructor(opts: { leaseSeconds?: number; maxRecent?: number; maxRecentFn?: () => number } = {}) {
    this._lease = opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
    this._maxRecent = Math.max(1, Math.trunc(opts.maxRecent ?? DEFAULT_MAX_RECENT));
    this._maxRecentFn = opts.maxRecentFn ?? null;
  }

  private _recentCapacity(): number {
    if (this._maxRecentFn !== null) {
      try {
        const cap = Math.trunc(this._maxRecentFn());
        if (cap >= 1) return cap;
      } catch {
        /* fall back to constructor default */
      }
    }
    return this._maxRecent;
  }
  private _trimRecent(): void {
    if (this._recent.length <= this._recentHint) return;
    const cap = this._recentCapacity();
    this._recentHint = cap;
    while (this._recent.length > cap) this._recent.shift();
  }
  /** 扫掉到期租约(进保留区,记一条假失败,不进指标)。 */
  private _purge(now: number): void {
    for (const [mid, bucket] of [...this._leases]) {
      for (const [lid, lease] of [...bucket]) {
        if (lease.expiresAt <= now) {
          this._finish(lease, null, now);
          bucket.delete(lid);
          this._index.delete(lid);
        }
      }
      if (bucket.size === 0) this._leases.delete(mid);
    }
    this._trimRecent();
  }
  private _finish(lease: InflightLease, outcome: RequestOutcome | null, now: number): void {
    if (outcome !== null) {
      this._recent.push(
        new CompletedRequest({
          lease,
          finishedAt: now,
          ok: outcome.ok,
          status: outcome.status,
          error: outcome.error,
          latencyMs: outcome.latencyMs,
          ttftMs: outcome.ttftMs,
          promptTokens: outcome.promptTokens,
          completionTokens: outcome.completionTokens,
          cachedTokens: outcome.cachedTokens,
        }),
      );
    } else {
      this._recent.push(
        new CompletedRequest({
          lease,
          finishedAt: now,
          ok: false,
          status: 0,
          error: "lease expired (no outcome reported)",
          latencyMs: 0,
          ttftMs: null,
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
        }),
      );
    }
    this._trimRecent();
  }

  /** 容量键:端点 id 优先,缺省退回真实模型 id(旧调用点兼容)。 */
  private _capacityKeyOf(realModelId: string, endpointId?: string): string {
    return endpointId !== undefined && endpointId !== "" ? endpointId : realModelId;
  }

  inFlight(capacityKey: string, now?: number): number {
    const t = now ?? monotonic();
    this._purge(t);
    return this._leases.get(capacityKey)?.size ?? 0;
  }
  /**
   * 该**容量键**(端点/凭据)是否还有空位。
   *
   * ⚠️ 键是端点不是真实模型:同一真实模型下不同凭据互不占槽
   * (concurrency=1 + 3 凭据 = 3 并发)。
   */
  hasRoom(capacityKey: string, concurrency: number, now?: number): boolean {
    return this.inFlight(capacityKey, now) < Math.max(1, Math.trunc(concurrency));
  }
  /**
   * 该**容量键**(端点)上是否还有**可被抢占的逻辑租约**(m02240)。
   *
   * ⚠️ 只数**非直连**租约:直连之间不互抢(直连是「用户点名要这个真实模型」,
   * 两个点名请求互相抢,谁都不该赢)。与 `router/inflight-ledger.ts` 同源同义。
   *
   * ⚠️ 抢占粒度跟着容量键走(2026-11-08):只在该端点的桶里找受害者。
   */
  hasPreemptable(capacityKey: string, now?: number): boolean {
    const t = now ?? monotonic();
    this._purge(t);
    const bucket = this._leases.get(capacityKey);
    if (!bucket) return false;
    for (const lease of bucket.values()) {
      if (!lease.direct) return true;
    }
    return false;
  }
  acquire(realModelId: string, opts: AcquireOptions, now?: number): string {
    const t = now ?? monotonic();
    this._purge(t);
    this._seq += 1;
    const leaseId = String(this._seq);
    const capacityKey = this._capacityKeyOf(realModelId, opts.endpointId);
    const lease = new InflightLease({
      leaseId,
      seq: this._seq,
      realModelId,
      endpointId: opts.endpointId ?? "",
      logicalModel: opts.logicalModel ?? "",
      sessionId: opts.sessionId ?? "",
      stream: opts.stream ?? false,
      direct: opts.direct ?? false,
      startedAt: t,
      expiresAt: t + this._lease,
      convNo: this._convNo(opts.sessionId ?? ""),
    });
    let bucket = this._leases.get(capacityKey);
    if (!bucket) {
      bucket = new Map();
      this._leases.set(capacityKey, bucket);
    }
    bucket.set(leaseId, lease);
    this._index.set(leaseId, capacityKey);
    if (opts.onPreempt !== undefined) {
      this._preemptHooks.set(leaseId, opts.onPreempt);
    }
    return leaseId;
  }
  /**
   * 直连抢占式获取(m02240):并发槽未满 → 普通 acquire(direct=true);
   * 已满 → 踢掉该**端点**(容量键)内**最新入队**的非直连(逻辑)租约,记一条
   * PREEMPT_ERROR 失败记录(槽即刻释放、账本不泄漏),再为本直连请求取槽;
   * 桶内全为直连在途(无可抢占对象)→ null。
   *
   * ⚠️ 抢占粒度 = 容量键(2026-11-08):只踢同一凭据上的逻辑租约 —— 别的凭据的
   * 租约本来就不占这个槽,踢了也换不来空位。
   */
  acquireDirect(
    realModelId: string,
    concurrency: number,
    opts: AcquireOptions,
    now?: number,
  ): string | null {
    const t = now ?? monotonic();
    this._purge(t);
    const capacityKey = this._capacityKeyOf(realModelId, opts.endpointId);
    if (this.hasRoom(capacityKey, concurrency, t)) {
      return this.acquire(realModelId, { ...opts, direct: true }, t);
    }
    const bucket = this._leases.get(capacityKey);
    if (!bucket || bucket.size === 0) return null;
    // 从最新往前找第一条非直连(逻辑)租约 → 踢
    let kicked: InflightLease | null = null;
    for (const lease of [...bucket.values()].reverse()) {
      if (!lease.direct) {
        kicked = lease;
        break;
      }
    }
    if (kicked === null) return null; // 全是直连在途,无可抢占
    // ⚠️ **先通知、再释放**(同 `router/inflight-ledger.ts` 口径):受害方得
    // 靠这个回调打断自己的上游调用(只释放账本槽位的话,真实上游的并发位
    // 没还回去,直连请求照样被限流)。顺序也不能反:通知在前,受害方才
    // 能在「租约还在」的时候判断出「这是被抢占」而不是「我正常收尾」。
    this._notifyPreempted(kicked.leaseId);
    this._finish(
      kicked,
      {
        ok: false,
        status: 0,
        latencyMs: 0,
        ttftMs: null,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        error: PREEMPT_ERROR,
      },
      monotonic(),
    );
    bucket.delete(kicked.leaseId);
    this._index.delete(kicked.leaseId);
    this._preemptHooks.delete(kicked.leaseId);
    if (bucket.size === 0) this._leases.delete(capacityKey);
    this._trimRecent();
    return this.acquire(realModelId, { ...opts, direct: true }, t);
  }

  /**
   * 通知「这条租约被挤掉了」(m02240)—— 吞掉回调异常:通知失败只意味着这次
   * 打断没生效,抢占本身必须照常完成。
   */
  private _notifyPreempted(leaseId: string): void {
    const hook = this._preemptHooks.get(leaseId);
    if (hook === undefined) return;
    try {
      hook(PREEMPT_ERROR);
    } catch {
      /* 通知失败不影响抢占 */
    }
  }
  /** 会话序号:同 session 同号;号从 1 起递增;表超限丢最旧;空 session = 0。 */
  private _convNo(sessionId: SessionId): number {
    if (!sessionId) return 0;
    const known = this._convOrder.get(sessionId);
    if (known !== undefined) return known;
    while (this._convOrder.size >= CONV_ORDER_LIMIT) {
      const oldest = this._convOrder.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this._convOrder.delete(oldest);
    }
    this._convSeq += 1;
    this._convOrder.set(sessionId, this._convSeq);
    return this._convSeq;
  }
  /** 续期:expires_at = now + lease;未知句柄 → false。 */
  touch(leaseId: string, now?: number): boolean {
    if (!leaseId) return false;
    const t = now ?? monotonic();
    const mid = this._index.get(leaseId);
    if (mid === undefined) return false;
    const bucket = this._leases.get(mid);
    const lease = bucket?.get(leaseId);
    if (!bucket || !lease) return false;
    bucket.set(leaseId, new InflightLease({ ...lease, expiresAt: t + this._lease }));
    return true;
  }
  /**
   * 按句柄精确释放;已释放/已过期 → false(幂等)。
   * 句柄不在索引 → legacy:当作容量键(端点 id;旧调用点传真实模型 id),
   * 丢该桶最旧的一条(旧行为,不归档)。
   */
  release(leaseId: string, opts?: ReleaseOptions): boolean {
    if (!leaseId) return false;
    const outcome = opts?.outcome ?? null;
    const finishNow = outcome !== null ? monotonic() : (opts?.now ?? monotonic());
    if (!this._index.has(leaseId)) {
      const bucket = this._leases.get(leaseId);
      if (!bucket) return false;
      let oldest: InflightLease | null = null;
      for (const l of bucket.values()) {
        if (oldest === null || l.startedAt < oldest.startedAt) oldest = l;
      }
      if (oldest === null) return false;
      bucket.delete(oldest.leaseId);
      this._index.delete(oldest.leaseId);
      this._preemptHooks.delete(oldest.leaseId);
      if (bucket.size === 0) this._leases.delete(leaseId);
      return true;
    }
    const mid = this._index.get(leaseId)!;
    const bucket = this._leases.get(mid);
    if (!bucket) return false;
    const lease = bucket.get(leaseId);
    if (!lease) return false;
    bucket.delete(leaseId);
    if (bucket.size === 0) this._leases.delete(mid);
    this._index.delete(leaseId);
    this._preemptHooks.delete(leaseId);
    this._finish(lease, outcome, finishNow);
    return true;
  }
  /** 清掉某个**容量键**(端点)的全部租约(测试/维护用)。 */
  releaseBucket(capacityKey: string, now?: number): number {
    if (now !== undefined) this._purge(now);
    const bucket = this._leases.get(capacityKey);
    if (!bucket) return 0;
    for (const lid of [...bucket.keys()]) this._index.delete(lid);
    this._leases.delete(capacityKey);
    return bucket.size;
  }
  /**
   * `{real_model_id: 在途数}` —— **对外契约形状,键是真实模型**。
   *
   * ⚠️ 容量键改成端点后(2026-11-08)必须逐条租约按 `lease.realModelId` 归并:
   * 面板 / 趋势图 / 部署页都按真实模型展示,内部换键不能让统计变形。
   */
  snapshot(now?: number): Record<string, number> {
    const t = now ?? monotonic();
    this._purge(t);
    const out: Record<string, number> = {};
    for (const bucket of this._leases.values()) {
      for (const lease of bucket.values()) {
        out[lease.realModelId] = (out[lease.realModelId] ?? 0) + 1;
      }
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  detail(now?: number): InflightLease[] {
    const t = now ?? monotonic();
    this._purge(t);
    const out: InflightLease[] = [];
    for (const bucket of this._leases.values()) out.push(...bucket.values());
    out.sort((a, b) => a.startedAt - b.startedAt);
    return out;
  }
  total(now?: number): number {
    return Object.values(this.snapshot(now)).reduce((s, n) => s + n, 0);
  }
  /** 最近的已结束请求,最新在前((finished_at, seq) 降序)。 */
  recent(limit: number = 50, now?: number): CompletedRequest[] {
    const t = now ?? monotonic();
    this._purge(t);
    const out = [...this._recent];
    out.sort(
      (a, b) => b.finishedAt - a.finishedAt || b.lease.seq - a.lease.seq,
    );
    return limit > 0 ? out.slice(0, limit) : out;
  }
  reset(capacityKey?: string): void {
    if (capacityKey === undefined) {
      this._leases.clear();
      this._index.clear();
      this._recent = [];
    } else {
      this.releaseBucket(capacityKey);
    }
  }
}
