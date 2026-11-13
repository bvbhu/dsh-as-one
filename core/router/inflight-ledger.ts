/**
 * InflightLedger —— 真实模型的在途租约账本(从 `nexus/core/router.py:InflightLedger`
 * 移植;测试规格 `tests/test_v4_semantics.py` §1 / §9 / §11)。
 *
 * ⚠️ **容量键是「端点」(`endpointId`,即 `provider/model@username`),不是真实模型**
 * (2026-11-08 用户改口;旧口径 D12 是真实模型键)。这不是命名口味问题,而是并发语义:
 *
 * - 真实模型键 → 同一模型的 N 枚凭据共用一个桶,总并发恒等于 `real_model.concurrency`;
 * - 端点键 → 每个凭据各算一份 → **concurrency=1 + 3 个凭据 = 3 并发**
 *   (用户原话:「修改并发设置的含义,改为按凭据记,即并发设置为1,三个凭据就可以三并发」)。
 *
 * 旧口径把「sensenova 聚合而非各自一份」当成键选择的自然结果;现在反过来:
 * sensenova 的「单账号单并发」由**连接器**自己保证
 * (`connectors/sensenova-pool.ts` 每账号 `maxSockets: 1` + `runtime.inflight`),
 * 账本只按凭据发槽。若某个上游真的按**模型**限并发,把该真实模型的 concurrency
 * 配成 1 即可(每凭据 1 → 多凭据才并行),不必回退键。
 *
 * ⚠️ **展示侧仍按真实模型聚合**:每条租约自己带 `realModelId`,`snapshot()` 逐条
 * 归并回真实模型 —— 面板 `RuntimeSnapshot.by_real_model` / `getRuntime().leases`
 * 的形状与口径不变(改键是内部实现,不能让页面统计变形)。
 *
 * ⚠️ 每条租约带一个**句柄**。以前只存到期时刻的列表,`release` 只能「丢最晚到期
 * 的一条」—— **它并不能保证丢的是调用方自己那条**。并发收尾时(成功回调与异常
 * 路径都可能调)这会真的错配:两个请求同时结束,一个的释放被记到另一个头上,
 * 计数因此永久漂移。改成句柄后是精确匹配。
 *
 * ⚠️ 租约用**单调钟**:它是进程内相对时钟,不受 NTP 校时影响。
 *
 * ⚠️ **租约必须能被续期**(见 {@link touch})。租期 600s 与适配器读超时同量级,
 * 一个跑满 10 分钟的长流会在**请求还在跑**的时候被清理掉 —— 面板上凭空少一条,
 * 而账本还以为有空位。
 *
 * ⚠️ **多 worker 会把并发上限放大 N 倍**:本账本是**进程内**状态,并发上限的
 * 真实性完全依赖「只有一个 worker / 一个事件循环」。Nexus 刻意只绑 loopback +
 * 单 worker(inventory §2),TS 侧必须保持同一约束(不要在集群 / 多进程模式下复用)。
 *
 * ⚠️ 线程安全 → **单线程安全**:JS 是单线程事件循环,不存在 Python 那种真正的
 * 竞态;这里的所有读改写都在同一个同步函数里完成,不需要锁。
 */

import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import {
  CONV_ORDER_LIMIT,
  DEFAULT_LEASE_SECONDS,
  DEFAULT_MAX_RECENT,
  DEFAULT_RETAIN_SECONDS,
  PREEMPT_ERROR,
  type CompletedRequest,
  type InflightLease,
  type PreemptNotifier,
  type RequestOutcome,
} from "./types.js";

/** 容量提供函数:保留区**当前**容量(通常就是 `ui.recentLimit` 的活读口)。 */
export type RecentCapacityFn = () => number;

/** 已过期 / 被租期扫掉的租约在保留区里的固定文案。 */
export const LEASE_EXPIRED_ERROR = "lease expired (no outcome reported)";

/** 被租期扫掉、未上报 outcome 的保留行(只进保留区、不进指标)。 */
function archivedRow(lease: InflightLease, finishedAt: number): CompletedRequest {
  return {
    lease,
    finishedAt,
    ok: false,
    status: 0,
    error: LEASE_EXPIRED_ERROR,
    latencyMs: 0,
    ttftMs: null,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
  };
}

export interface InflightLedgerOptions {
  /** 在途租约租期(秒),默认 {@link DEFAULT_LEASE_SECONDS}。 */
  leaseSeconds?: number;
  /**
   * **已退役**(2026-10-15):保留区只按**条数**控制,不再按时间窗清除。
   * 保留这个参数只是为了不破坏既有构造点,清理逻辑不再读它。
   */
  retainSeconds?: number;
  /** 保留区的**兜底**容量上限。 */
  maxRecent?: number;
  /** 容量的**活来源**(2026-10-15):函数缺失 / 抛错 / 给出 <1 → 回落 `maxRecent`。 */
  maxRecentFn?: RecentCapacityFn | null;
  /** 时钟(默认系统时钟)。测试注入可推进的时钟。 */
  clock?: Clock;
}

export class InflightLedger {
  private readonly leaseSeconds: number;
  /** ⚠️ 已退役:保留期不再有行为,留着只为不破坏既有构造点。 */
  private readonly retainSeconds: number;
  private readonly maxRecent: number;
  private readonly maxRecentFn: RecentCapacityFn | null;
  private readonly clock: Clock;

  /**
   * 上次问到的容量。**只是「保留区还没到那个数就不可能超容」的短路**,
   * 不是权威值(权威值每次都问 {@link recentCapacity})。初值 0 保证第一次收尾
   * 一定真问一次 —— 否则配置比 `maxRecent` 小时会被这个短路挡住。
   */
  private recentHint = 0;

  /**
   * `容量键 -> Map<leaseId, lease>`。
   *
   * ⚠️ 容量键 = **端点 id**(`provider/model@username`,见 {@link capacityKeyOf});只有
   * 调用方没给端点(旧调用点 / 单测)时才退回真实模型 id。计数按凭据各算一份 ——
   * 这就是「concurrency 是每个凭据的并发」的落点。
   */
  private readonly leases = new Map<string, Map<string, InflightLease>>();

  /** `leaseId -> 容量键`,让 `release` / `touch` O(1) 定位 */
  private readonly index = new Map<string, string>();

  /**
   * `leaseId -> 抢占通知回调`(m02240)。
   *
   * ⚠️ **不进 `InflightLease` 对象**:那个对象会经 `detail()` 交给面板序列化
   * (JSON 丢函数、IPC 上更糟)。回调只在**进程内**有意义,所以单独一张表。
   *
   * 表项在租约释放时同步删掉 —— 回调表必须和租约**同生共死**,否则一次
   * 抢占之后,那个回调会被后来的同号租约误触发(句柄复用 → 打断别人的请求)。
   */
  private readonly preemptHooks = new Map<string, PreemptNotifier>();

  /** 对外展示用的运行序号(单调递增) */
  private seq = 0;

  /** `sessionId -> 会话序号`(面板 `#对话#请求` 的左半段) */
  private readonly convOrder = new Map<string, number>();

  /** 会话序号分配游标。**只增不减**,所以淘汰不会让两个可见会话撞号。 */
  private convSeq = 0;

  /** 保留区:已结束的请求(按结束时刻从旧到新)。只按**当前容量**清,没有时间窗。 */
  private readonly recent: CompletedRequest[] = [];

  constructor(opts: InflightLedgerOptions = {}) {
    this.leaseSeconds = Number(opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS);
    this.retainSeconds = Number(opts.retainSeconds ?? DEFAULT_RETAIN_SECONDS);
    this.maxRecent = Math.max(1, Math.trunc(Number(opts.maxRecent ?? DEFAULT_MAX_RECENT)));
    this.maxRecentFn = opts.maxRecentFn ?? null;
    this.clock = opts.clock ?? systemClock;
  }

  /** 在途租约租期(秒)。 */
  get leaseSecondsValue(): number {
    return this.leaseSeconds;
  }

  /** 已退役:保留期不再有行为,留着只为不破坏既有调用点。 */
  get retainSecondsValue(): number {
    return this.retainSeconds;
  }

  // ------------------------------------------------------------- 容量核算

  /**
   * 容量键:端点 id 优先,缺省退回真实模型 id。
   *
   * ⚠️ 退回分支只为兼容**没传端点**的旧调用点与单测;生产路径(`Router.commit` /
   * `Planner.commit`)永远带 `endpointId` —— 少了端点就退回「所有凭据共用一个桶」,
   * 语义务必在调用方保证。
   */
  private capacityKeyOf(realModelId: string, endpointId?: string): string {
    return endpointId !== undefined && endpointId !== "" ? endpointId : realModelId;
  }

  /**
   * 该**容量键**(通常是端点)当前有几条在途租约。
   *
   * ⚠️ 与 Python 版一致:先清理过期租约再数 —— 一次只读查询不该让账本停在旧值上。
   */
  inFlight(capacityKey: string, now: number = this.clock.monoNow()): number {
    this.purge(now);
    return this.leases.get(capacityKey)?.size ?? 0;
  }

  /**
   * 该容量键是否还有空位(`concurrency` 会被夹到 ≥1)。
   *
   * ⚠️ 键是**端点**,不是真实模型:同一个真实模型下不同凭据互不占槽
   * (concurrency=1 + 3 凭据 = 3 并发)。
   */
  hasRoom(capacityKey: string, concurrency: number, now: number = this.clock.monoNow()): boolean {
    return this.inFlight(capacityKey, now) < Math.max(1, Math.trunc(concurrency));
  }

  /**
   * 该容量键上是否还有**可被抢占的逻辑租约**(m02240)。
   *
   * 直连请求专用:桶满了的时候,只有「还剩一条逻辑租约」才谈得上抢占 ——
   * 全是直连在途的话,`acquireDirect` 会返回 `null`(没有可让的对象),
   * 调用方按「无可用」处理。
   *
   * ⚠️ 只数**非直连**租约:直连之间不互抢(直连是「用户点名要这个真实模型」,
   * 抢另一个直连的槽位等于让两个点名请求互相打架,谁都不该赢)。
   *
   * ⚠️ 抢占粒度跟着容量键走(2026-11-08):只在该**端点**的桶里找受害者 ——
   * 直连请求要的是这个凭据的槽,踢别的凭据的租约不会给它腾出这个槽。
   */
  hasPreemptable(capacityKey: string, now: number = this.clock.monoNow()): boolean {
    this.purge(now);
    const bucket = this.leases.get(capacityKey);
    if (bucket === undefined) {
      return false;
    }
    for (const lease of bucket.values()) {
      if (lease.direct !== true) {
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------- 租约生命周期

  /**
   * 占一条租约,返回句柄。**释放必须用这个句柄**({@link release})。
   *
   * @param realModelId 真实模型 id(`"provider/model"`,**仅用于展示聚合 / 抢占标记**)
   * @param endpointId 端点身份(`"provider/model@username"`)= **容量键**(按凭据计);
   *   缺省时退回 `realModelId`(旧调用点兼容,见 {@link capacityKeyOf})
   * @param logicalModel 客户端要的那个名字(可能是逻辑模型,也可能是直连真实模型)
   * @param sessionId 只用于内部分组,**绝不出现在对外响应里**
   */
  acquire(
    realModelId: string,
    opts: {
      endpointId?: string;
      logicalModel?: string;
      sessionId?: string;
      stream?: boolean;
      /** 直连请求占用(true = 可抢占逻辑租约,不被逻辑请求抢占)。 */
      direct?: boolean;
      /**
       * 被抢占时的通知回调(m02240)—— 直连请求挤掉这条租约时被调用。
       *
       * ⚠️ 只有**逻辑**租约需要登记:直连租约本身不被抢占(见
       * `acquireDirect` 的受害者筛选),登记了也永远不会触发。
       */
      onPreempt?: PreemptNotifier;
      now?: number;
    } = {},
  ): string {
    const now = opts.now ?? this.clock.monoNow();
    this.purge(now);
    this.seq += 1;
    const leaseId = `${this.seq}`;
    const lease: InflightLease = {
      leaseId,
      seq: this.seq,
      realModelId,
      endpointId: opts.endpointId ?? "",
      logicalModel: opts.logicalModel ?? "",
      sessionId: opts.sessionId ?? "",
      stream: opts.stream ?? false,
      direct: opts.direct === true,
      startedAt: now,
      expiresAt: now + this.leaseSeconds,
      convNo: this.convNo(opts.sessionId ?? ""),
    };
    const capacityKey = this.capacityKeyOf(realModelId, opts.endpointId);
    let bucket = this.leases.get(capacityKey);
    if (bucket === undefined) {
      bucket = new Map<string, InflightLease>();
      this.leases.set(capacityKey, bucket);
    }
    bucket.set(leaseId, lease);
    this.index.set(leaseId, capacityKey);
    if (opts.onPreempt !== undefined) {
      this.preemptHooks.set(leaseId, opts.onPreempt);
    }
    return leaseId;
  }

  /**
   * **抢占式**获取(m02240):并发槽已满时,踢掉该**端点**(容量键)上**最新入队**的
   * 非直连(逻辑)租约,把容量让给直连请求。
   *
   * 语义(用户 2026 定案):
   * - 直连(真实模型直连)请求的优先级**高于**任何逻辑模型成员;
   * - 槽未满 → 普通 acquire(`direct: true`);
   * - 槽已满 → 找该桶里 `direct !== true` 且**最晚入队**的那条踢掉
   *   (最不影响其余逻辑请求的 FCFS 次序;最先到达者保留);
   * - 桶里全是直连在途 → 没有可让的对象,返回 `null`(调用方按「无可用」处理)。
   *
   * ⚠️ 抢占粒度 = 容量键(2026-11-08):只踢**同一凭据**上的逻辑租约。别的凭据的
   * 租约本来就不占这个槽,踢了也换不来空位(而且会平白打断一个没用满的号)。
   *
   * 被踢掉的逻辑租约会记一条失败({@link PREEMPT_ERROR}),并发槽即刻释放 ——
   * 账本记账不泄漏,调用方按既有重试策略重试。
   *
   * ⚠️ **受害方会被同步通知**(m02240):只释放账本槽位是不够的 ——
   * 受害方的 HTTP 请求还在真实上游占着连接,直连请求拿到的只是「账面上的
   * 空位」,上游照样限流。所以这里先调受害方的 `onPreempt` 回调(让它
   * 打断自己的上游调用、立刻退出),再释放槽位。
   *
   * ⚠️ **回调抛异常不影响抢占**:通知失败只意味着这次打断没生效,抢占本身
   * 照常进行(否则一次回调异常会让直连请求也失败 —— 那更糟)。
   */
  acquireDirect(
    realModelId: string,
    concurrency: number,
    opts: {
      endpointId?: string;
      logicalModel?: string;
      sessionId?: string;
      stream?: boolean;
      now?: number;
    } = {},
  ): string | null {
    const now = opts.now ?? this.clock.monoNow();
    this.purge(now);
    const cap = Math.max(1, Math.trunc(concurrency));
    const capacityKey = this.capacityKeyOf(realModelId, opts.endpointId);
    const bucket = this.leases.get(capacityKey);
    if (bucket === undefined || bucket.size < cap) {
      return this.acquire(realModelId, { ...opts, direct: true, now });
    }
    // 槽已满:找最新入队的非直连租约。Map 保插入序,倒序扫即是「最新优先」。
    let victim: InflightLease | null = null;
    if (bucket !== undefined) {
      const ids = [...bucket.keys()].reverse();
      for (const id of ids) {
        const lease = bucket.get(id);
        if (lease === undefined) continue;
        if (lease.direct === true) continue;
        victim = lease;
        break;
      }
    }
    if (victim === null) {
      return null; // 全是直连在途,没有可让的逻辑租约
    }
    // ⚠️ 顺序要紧:**先通知、再释放**。
    // 通知在前,受害方才有机会在「租约还在」的时候把上游调用打断并退出;
    // 反过来(先释放)的话,受害方收到通知时租约已经没了,它无法判断
    // 「这是被抢占」还是「我自己正常收尾」——就会按上游失败去记冷却,
    // 白白连累一个无辜端点。
    this.notifyPreempted(victim.leaseId);
    this.release(victim.leaseId, {
      now,
      outcome: {
        ok: false,
        status: 0,
        error: PREEMPT_ERROR,
        latencyMs: 0,
        ttftMs: null,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
      },
    });
    return this.acquire(realModelId, { ...opts, direct: true, now });
  }

  /**
   * 通知「这条租约被挤掉了」(m02240)—— 回调表命中才通知。
   *
   * ⚠️ **吞掉回调异常**:通知失败只意味着这次打断没生效(受害方的上游调用
   * 还在跑),抢占本身必须照常完成 —— 否则受害方一个回调 bug 就能让直连
   * 请求也一起失败。
   */
  private notifyPreempted(leaseId: string): void {
    const hook = this.preemptHooks.get(leaseId);
    if (hook === undefined) {
      return;
    }
    try {
      hook(PREEMPT_ERROR);
    } catch {
      /* 通知失败不影响抢占 */
    }
  }

  /**
   * 会话 → 会话序号(面板 `#对话#请求` 的左半段)。
   *
   * - 同一 `sessionId` 永远拿到同一个号 —— 这是「这几条是同一个会话」可读的唯一依据;
   * - 号从 1 起**按首次出现顺序递增**;游标单调不减,所以淘汰后新号不会重复用旧号;
   * - 空 `sessionId`(无法派生的请求)→ `0` = **不编号**(否则所有无 id 请求会共用
   *   一个伪会话号,`#对话` 那一列就永远显示同一个数);
   * - 淘汰:表超过 {@link CONV_ORDER_LIMIT} 条时丢掉**最旧**的一条(`Map` 保插入序)。
   *
   * ⚠️ **重启清零**是预期语义(与 v4「会话 pin 只在内存」同一口径,D18):
   * 这是运行期序号,不是持久身份。
   */
  private convNo(sessionId: string): number {
    if (!sessionId) {
      return 0;
    }
    const known = this.convOrder.get(sessionId);
    if (known !== undefined) {
      return known;
    }
    while (this.convOrder.size >= CONV_ORDER_LIMIT) {
      const oldest = this.convOrder.keys().next();
      if (oldest.done) {
        break;
      }
      this.convOrder.delete(oldest.value);
    }
    this.convSeq += 1;
    this.convOrder.set(sessionId, this.convSeq);
    return this.convSeq;
  }

  /**
   * 续期一条租约(流式每收到一个 chunk 调一次)。不存在返回 `false`。
   *
   * ⚠️ 这是「面板上的在途列表可信」的前提:没有它,跑满租期的长请求会在还活着的
   * 时候消失,用户会以为网关丢了请求 —— 同时账本误以为腾出了空位,并发上限被悄悄放大。
   */
  touch(leaseId: string, now: number = this.clock.monoNow()): boolean {
    if (!leaseId) {
      return false;
    }
    const key = this.index.get(leaseId);
    if (key === undefined) {
      return false;
    }
    const bucket = this.leases.get(key);
    if (bucket === undefined) {
      return false;
    }
    const old = bucket.get(leaseId);
    if (old === undefined) {
      return false;
    }
    bucket.set(leaseId, { ...old, expiresAt: now + this.leaseSeconds });
    return true;
  }

  /**
   * 按**句柄**精确释放。已释放 / 已过期都是幂等的 `false`。
   *
   * @param outcome 收尾数据(token 数、TTFT、状态)。给了就同时进**保留区**;
   *   不给就只是释放 —— 调用方没数,我们也不瞎编。
   *
   * ⚠️ `leaseId` 是 {@link acquire} 返回的那个**字符串句柄**。为兼容尚未升级的
   * 调用点,传容量键(端点 id / 旧的真实模型 id)也能用 —— 那就退回「丢该桶里最旧
   * 的一条」(旧行为)。但**不要**依赖这条退路:它正是本方法要修掉的那个
   * 「不知道自己在丢谁的租约」。
   */
  release(
    leaseId: string,
    opts: { outcome?: RequestOutcome | null; now?: number } = {},
  ): boolean {
    if (!leaseId) {
      return false;
    }
    const now = opts.now ?? this.clock.monoNow();
    if (!this.index.has(leaseId)) {
      // 不是句柄 → 当作容量键(端点 id;旧调用点传真实模型 id),丢该桶最旧的一条
      const bucket = this.leases.get(leaseId);
      if (bucket === undefined || bucket.size === 0) {
        return false;
      }
      let oldest: InflightLease | null = null;
      for (const l of bucket.values()) {
        if (oldest === null || l.startedAt < oldest.startedAt) {
          oldest = l;
        }
      }
      if (oldest === null) {
        return false;
      }
      bucket.delete(oldest.leaseId);
      this.index.delete(oldest.leaseId);
      this.preemptHooks.delete(oldest.leaseId);
      if (bucket.size === 0) {
        this.leases.delete(leaseId);
      }
      return true;
    }
    const key = this.index.get(leaseId);
    if (key === undefined) {
      return false;
    }
    this.index.delete(leaseId);
    this.preemptHooks.delete(leaseId);
    const bucket = this.leases.get(key);
    if (bucket === undefined) {
      return false;
    }
    const lease = bucket.get(leaseId);
    bucket.delete(leaseId);
    if (bucket.size === 0) {
      this.leases.delete(key);
    }
    if (lease === undefined) {
      return false;
    }
    this.archive(lease, opts.outcome ?? null, now);
    return true;
  }

  /** 清掉某个**容量键**(端点)的**全部**租约(测试 / 维护用),返回清掉的条数。 */
  releaseBucket(capacityKey: string): number {
    const bucket = this.leases.get(capacityKey);
    if (bucket === undefined) {
      return 0;
    }
    this.leases.delete(capacityKey);
    for (const leaseId of bucket.keys()) {
      this.index.delete(leaseId);
      this.preemptHooks.delete(leaseId);
    }
    return bucket.size;
  }

  // ------------------------------------------------------------- 保留区

  /**
   * 保留区**当前**容量 —— 优先问活来源(``ui.recent_limit``)。
   *
   * 容量提供函数缺失、抛错或给出 <1 时回落构造参数 `maxRecent`(默认
   * {@link DEFAULT_MAX_RECENT}):观测不该因为设置读不到而把账本拖垮,
   * 更不该让保留区变成无上限。
   */
  recentCapacity(): number {
    if (this.maxRecentFn !== null) {
      let cap = 0;
      try {
        cap = Math.trunc(Number(this.maxRecentFn()));
      } catch {
        cap = 0;
      }
      if (Number.isFinite(cap) && cap >= 1) {
        return cap;
      }
    }
    return this.maxRecent;
  }

  /**
   * 保留区砍回容量上限 —— **从头砍,因为它最旧**。
   *
   * `recentHint` 是短路:保留区条数还没到「上次问到的容量」就不可能超容,
   * 直接返回,省掉一次设置读库。用户把上限**调小**之后,下一次收尾就会重新问一次
   * 并立刻砍到位。
   */
  private trimRecent(): void {
    if (this.recent.length <= this.recentHint) {
      return;
    }
    const cap = this.recentCapacity();
    this.recentHint = cap;
    while (this.recent.length > cap) {
      this.recent.shift();
    }
  }

  /**
   * 清掉过期租约(被租期扫掉的也要进保留区 —— 否则「刚才那条到底怎么了」
   * 在面板上永远是空白),再把保留区砍回容量。
   */
  purge(now: number = this.clock.monoNow()): void {
    for (const [key, bucket] of this.leases) {
      for (const [leaseId, lease] of bucket) {
        if (lease.expiresAt > now) {
          continue;
        }
        // 被租期扫掉的租约也要进保留区:outcome 无从得知,只记失败。
        this.archive(lease, null, now);
        bucket.delete(leaseId);
        this.index.delete(leaseId);
        this.preemptHooks.delete(leaseId);
      }
      if (bucket.size === 0) {
        this.leases.delete(key);
      }
    }
    // 保留区只按**条数**清(2026-10-15 用户改口:不再按时间窗清除)。
    this.trimRecent();
  }

  /** 收尾归档:保留区 + 砍容量。 */
  private archive(
    lease: InflightLease,
    outcome: RequestOutcome | null,
    now: number,
  ): void {
    if (outcome !== null) {
      this.recent.push({
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
      });
    } else {
      this.recent.push(archivedRow(lease, now));
    }
    // 容量上限:从头砍,因为它最旧。**两条路都要砍** —— 被租期扫掉的租约同样会
    // 把保留区撑爆(旧代码只在有 outcome 的那一支砍)。
    this.trimRecent();
  }

  /**
   * 最近的已结束请求,**最新在前**。只按条数清(无时间窗,2026-10-15)。
   *
   * ⚠️ 降序键必须是 **`(finishedAt, seq)`** 而不是单独的 `finishedAt`:
   * 单调钟在同一毫秒里会给出**同一个值**,单键排序会退化成「按 FIFO 进出顺序」——
   * 一条刚结束的请求被排在几分钟前的旁边,面板上表现为「最新的不在最上面」。
   * `seq` 单调递增,正好作 tiebreaker。
   */
  recentRows(limit = 50): CompletedRequest[] {
    this.purge();
    const out = [...this.recent];
    out.sort((a, b) =>
      a.finishedAt === b.finishedAt
        ? b.lease.seq - a.lease.seq
        : b.finishedAt - a.finishedAt,
    );
    return limit > 0 ? out.slice(0, limit) : out;
  }

  /** 一条已结束请求距离现在多久(秒);`null` 时间由账本时钟提供。 */
  finishedAgoS(row: CompletedRequest, now: number = this.clock.monoNow()): number {
    return Math.max(0, now - row.finishedAt);
  }

  // ------------------------------------------------------------- 观测

  /**
   * `{realModelId: 在途数}` —— **对外契约形状,键是真实模型**(不要改成端点)。
   *
   * ⚠️ 2026-11-08 容量键改成端点后,这里必须**逐条租约按 `lease.realModelId` 归并**:
   * 面板 `RuntimeSnapshot.by_real_model` / 趋势图 / 部署页的「在途」列都按真实模型
   * 展示,内部换键不能让统计变形(1 个模型 3 个凭据同时在跑 → 仍然是这个模型的 3)。
   */
  snapshot(): Record<string, number> {
    this.purge();
    const out: Record<string, number> = {};
    for (const bucket of this.leases.values()) {
      for (const lease of bucket.values()) {
        out[lease.realModelId] = (out[lease.realModelId] ?? 0) + 1;
      }
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  /** 全部在途租约(供面板展示)。**已按开始时刻排序**。 */
  detail(): InflightLease[] {
    this.purge();
    const out: InflightLease[] = [];
    for (const bucket of this.leases.values()) {
      out.push(...bucket.values());
    }
    out.sort((a, b) => a.startedAt - b.startedAt);
    return out;
  }

  /** 在途租约总数。 */
  total(): number {
    return Object.values(this.snapshot()).reduce((a, b) => a + b, 0);
  }

  /** 清账(测试 / 维护)。不给容量键(端点)就全清。 */
  reset(capacityKey?: string): void {
    if (capacityKey === undefined) {
      this.leases.clear();
      this.index.clear();
      this.preemptHooks.clear();
      this.recent.length = 0;
      this.recentHint = 0;
      this.seq = 0;
      this.convSeq = 0;
      this.convOrder.clear();
      return;
    }
    this.releaseBucket(capacityKey);
  }
}

export { DEFAULT_LEASE_SECONDS, DEFAULT_RETAIN_SECONDS, DEFAULT_MAX_RECENT };
