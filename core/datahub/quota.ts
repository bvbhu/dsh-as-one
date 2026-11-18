/**
 * 运行时数据门面 —— **额度/到期/比例的唯读写口**。
 *
 * ## 为什么要它（2026-11-18 用户定案「同步到所有使用面，保证数据唯一」）
 *
 * 改造前，同一份「运行期额度快照」散在 `@as-one/panel` 的三个模块级 Map：
 * `chQuotaCache`（探针结果）、`snRatioCache`（sensenova 窗口比例）、
 * qoder 的积分缓存；再经一个手工拼接的 `chQuotaTableForScheduler()` 投影给调度器。
 * 数据源是同一份，但：
 *
 * - **投影逻辑只有一份、却挂在 panel 包的模块顶层** —— `src/` 侧要读只能靠
 *   `@as-one/panel` 的导出，等于让"调度"反向依赖"面板"；
 * - **没有就绪语义** —— 进程刚启动时表是空的，谁先读到谁就按空表排（due-first
 *   退化成配置序），而"该不该先去刷一轮"这个判断散落在各个调用点；
 * - 多写入口（各渠道 probe 各写各的）+ 多处 `invalidate()` 手工通知。
 *
 * 现在统一成这个模块：**存储、投影、新鲜度、就绪门、变更通知**都在这里，
 * 上层只经它读写。`core/` 是 `panel/` 与 `src/` 的共同底层，依赖方向不再倒挂。
 *
 * ## 边界
 *
 * - 本模块**只管运行期额度**（探针能刷出来的、会过时的那些）。
 * - SQLite 里的 provider/credential/real_model 等**持久化配置不进来**：
 *   那些有 repo 层，再包一层只会多一层转发。
 * - Router 的 `ledger`/`health` 是调度内核的运行态，也不进来（它们是"在途/健康"，
 *   不是"额度"，语义与刷新周期完全不同）。
 *
 * @module @as-one/core/src/datahub/quota
 */

import type { QuotaSnapshot } from "../collector/quota.js";
import type { QuotaSnapshot as SchedulerQuotaSnapshot } from "../scheduler/types.js";

/** 缓存条目：快照 + 写入时刻（毫秒）。 */
export interface QuotaEntry {
  fetchedAtMs: number;
  snapshot: QuotaSnapshot;
}

/** 通用池窗口剩余比例（0~1；读不到给 null）。 */
export interface PoolRatios {
  w5: number | null;
  w7: number | null;
}

/** 多账号渠道的 provider 级聚合（到期取最早、积分求和）。 */
export interface QuotaRollup {
  remaining: number | null;
  limit: number | null;
  expires_at: number | null;
  fetched_at: number | null;
  /** 参与聚合的账号数。 */
  accounts: number;
}

/**
 * 把逐账号快照聚合成 **provider 级**一行（键 = 裸 provider id）。
 *
 * 为什么需要：调度侧 `_expiryOf()` 在凭据级快照拿不到到期时，会回落到
 * `quotas["<provider>"]` 这一行。一个 provider 有 N 个号时，探针只对部分号
 * 拿得到 `expires_at`（另一些是新加的 / 那次探针失败），只看凭据级快照的话
 * 那些号 expiry 恒 null，只能落进「到期未知」档。
 *
 * 口径（用户 2026-10-30 定案）：**到期取最早、积分取总和**。
 * 没有任何有效到期 → `expires_at: null`（宁可未知也不虚报）。
 *
 * ⚠️ 有 error 的快照**照样参与聚合**：它可能只是这一轮探针失败，而
 * remaining/expires_at 是上一轮的真值；把失败账号整条丢掉会让总和偏小。
 */
export function quotaRollupOf(snapshots: Iterable<QuotaSnapshot>): Map<string, QuotaRollup> {
  const acc = new Map<string, QuotaRollup>();
  for (const snap of snapshots) {
    if (!snap || typeof snap !== "object") continue;
    const key = snap.credentialKey;
    if (typeof key !== "string" || key === "") continue;
    const provider = key.split("/")[0] ?? "";
    if (provider === "") continue;
    const current = acc.get(provider) ?? {
      remaining: null,
      limit: null,
      expires_at: null,
      fetched_at: null,
      accounts: 0,
    };
    current.accounts += 1;
    // 积分：只对**读到了数字**的号求和；全是 null 就保持 null（不是 0）。
    if (typeof snap.remaining === "number") {
      current.remaining = (current.remaining ?? 0) + snap.remaining;
    }
    if (typeof snap.limit === "number") {
      current.limit = (current.limit ?? 0) + snap.limit;
    }
    // 到期：取**最早**。0 / null 视为「未知」，不参与比较。
    if (typeof snap.expires_at === "number" && snap.expires_at > 0) {
      current.expires_at =
        current.expires_at === null ? snap.expires_at : Math.min(current.expires_at, snap.expires_at);
    }
    if (typeof snap.fetched_at === "number" && snap.fetched_at > 0) {
      current.fetched_at =
        current.fetched_at === null ? snap.fetched_at : Math.max(current.fetched_at, snap.fetched_at);
    }
    acc.set(provider, current);
  }
  return acc;
}

/**
 * 运行期额度中心 —— 进程级单例（`quotaHub`）。
 *
 * ⚠️ 单例而非实例注入：调度器在 `setupAsOne` 里构造，比面板早；两边必须看
 * **同一份**数据，所以只能有一个存储。（历史教训：`chQuotaCache` 当初正是
 * 因为"两处各存一份"才出现「面板显示了、调度没读到」。）
 */
export class QuotaHub {
  /** 账号快照（键 = `provider/username`）。 */
  private readonly store = new Map<string, QuotaEntry>();
  /** sensenova 通用池窗口比例（键 = username）。 */
  private readonly ratios = new Map<string, PoolRatios>();

  /* ---------------------------------------------------------- 存储 */

  get(key: string): QuotaEntry | undefined {
    return this.store.get(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  set(key: string, entry: QuotaEntry): void {
    this.store.set(key, entry);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  keys(): IterableIterator<string> {
    return this.store.keys();
  }

  /** 全量条目迭代（键 + 快照 + 写入时刻）。 */
  entries(): IterableIterator<[string, QuotaEntry]> {
    return this.store.entries();
  }

  /** 快照迭代（只给值，调用方基本只要 snapshot）。 */
  *snapshots(): IterableIterator<QuotaSnapshot> {
    for (const entry of this.store.values()) {
      if (entry.snapshot && typeof entry.snapshot === "object") yield entry.snapshot;
    }
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
    this.ratios.clear();
  }

  /* -------------------------------------------------- sensenova 比例 */

  setPoolRatios(username: string, ratios: PoolRatios): void {
    this.ratios.set(username, ratios);
  }

  poolRatios(): Map<string, PoolRatios> {
    return new Map(this.ratios);
  }

  /* ---------------------------------------------------------- 投影 */

  /**
   * 快照表 → 调度器的额度表（`AppSchedulerRepo.quotas()` 的**唯一**实现）。
   *
   * 包含三段：
   * 1. 逐账号一行（键 `provider/username`，与调度侧 `quotaKey(row)` 同构）；
   * 2. 多账号渠道的 provider 级聚合行（键 = 裸 provider id，到期取最早）；
   * 3. sensenova 通用池的窗口剩余比例（只补 `w5_ratio`/`w7_ratio`，
   *    **不覆盖** remaining/limit —— 这条路上本来就没有那些字段，不伪造）。
   */
  table(): Record<string, SchedulerQuotaSnapshot> {
    const out: Record<string, SchedulerQuotaSnapshot> = {};
    const collected: QuotaSnapshot[] = [];
    for (const { snapshot } of this.store.values()) {
      if (!snapshot || typeof snapshot !== "object") continue;
      const k = snapshot.credentialKey;
      if (typeof k !== "string" || k === "") continue;
      collected.push(snapshot);
      const row: SchedulerQuotaSnapshot = {};
      if (typeof snapshot.remaining === "number") row.remaining = snapshot.remaining;
      if (typeof snapshot.limit === "number") row.limit = snapshot.limit;
      if (typeof snapshot.expires_at === "number" && snapshot.expires_at > 0) {
        row.expires_at = snapshot.expires_at;
      }
      if (typeof snapshot.fetched_at === "number") row.fetched_at = snapshot.fetched_at;
      if (snapshot.error !== null) row.error = snapshot.error;
      out[k] = row;
    }
    for (const [provider, rollup] of quotaRollupOf(collected)) {
      out[provider] = {
        remaining: rollup.remaining ?? undefined,
        limit: rollup.limit ?? undefined,
        expires_at: rollup.expires_at ?? undefined,
        fetched_at: rollup.fetched_at ?? undefined,
      };
    }
    for (const [username, ratios] of this.ratios) {
      const k = `sensenova/${username}`;
      const prev = out[k] ?? {};
      out[k] = {
        ...prev,
        ...(ratios.w5 !== null ? { w5_ratio: ratios.w5 } : {}),
        ...(ratios.w7 !== null ? { w7_ratio: ratios.w7 } : {}),
      };
    }
    return out;
  }

  /* -------------------------------------------------------- 新鲜度 */

  /**
   * 额度快照是否「可用来排序」（三条全满足才算新鲜）：
   * 1. 至少一条带 `expires_at > 0` —— 那是 due-first 的排序键；
   * 2. 最新一条 `fetched_at` 距今不超过 `maxAgeMs`；
   * 3. 最新那条不是 error 态。
   *
   * ⚠️ 必须廉价：每个请求调度前都会调，只读内存绝不打上游。
   * 与 `src/quota-freshness.ts` 的 `evaluateQuotaFreshness` 同口径 ——
   * 后者保留给纯函数单测，这里直接复用它的输入形状。
   */
  snapshotsForFreshness(): Array<{ expires_at?: number | null; fetched_at?: number | null; error?: string | null }> {
    const out: Array<{ expires_at?: number | null; fetched_at?: number | null; error?: string | null }> = [];
    for (const { snapshot } of this.store.values()) {
      if (!snapshot || typeof snapshot !== "object") continue;
      out.push({
        expires_at: snapshot.expires_at,
        fetched_at: snapshot.fetched_at,
        error: snapshot.error,
      });
    }
    return out;
  }

  /* -------------------------------------------------------- 诊断 */

  /** 一行摘要（面板/日志用）：多少条、几条有到期、最新一条多久前。 */
  summary(now: number): { total: number; withExpiry: number; newestAgeMs: number | null } {
    let withExpiry = 0;
    let newestAtMs: number | null = null;
    for (const entry of this.store.values()) {
      if (typeof entry.snapshot?.expires_at === "number" && entry.snapshot.expires_at > 0) withExpiry += 1;
      if (newestAtMs === null || entry.fetchedAtMs > newestAtMs) newestAtMs = entry.fetchedAtMs;
    }
    return {
      total: this.store.size,
      withExpiry,
      newestAgeMs: newestAtMs === null ? null : Math.max(0, now - newestAtMs),
    };
  }
}

/** 进程级唯一实例。 */
export const quotaHub = new QuotaHub();
