/**
 * HealthRegistry —— `endpointId -> EndpointHealth` 的内存表
 * (从 `nexus/core/router.py:HealthRegistry` 移植,取代已删的 `endpoint_health` 表)。
 *
 * **没有记录 = 可用**(D19 的语义,也是这里的默认):进程刚起来时表是空的,
 * 所有端点一律健康,不需要任何「先写一份健康基线」的初始化。
 *
 * ⚠️ 纯函数化的记账逻辑在 `types.ts` 的 `noteSuccess` / `noteFailure` /
 * `inCooldown`,这里只负责**存**与**查**(表本身是可变的,记录是不可变的)。
 */

import type { EndpointHealth, RetryPolicy } from "./types.js";
import { emptyHealth, inCooldown, noteFailure, noteSuccess } from "./types.js";

export interface HealthRegistryOptions {
  /** 墙钟(epoch 秒);测试注入固定时钟。 */
  wallNow?: () => number;
}

export class HealthRegistry {
  private readonly items = new Map<string, EndpointHealth>();
  private readonly wallNow: () => number;

  constructor(opts: HealthRegistryOptions = {}) {
    this.wallNow = opts.wallNow ?? (() => Date.now() / 1000);
  }

  /**
   * 取(或建)**不落表**的记录 —— 只读查询不该让表无限增长。
   *
   * 返回的是**表内那条**(调用方若改了它,表就跟着变);表里没有则返回一个
   * 全新的空记录(表不变)。与 Python 版一致:调用方要落库得显式调 `put` / `note`。
   */
  get(endpointId: string): EndpointHealth {
    const rec = this.items.get(endpointId);
    return rec === undefined ? emptyHealth() : rec;
  }

  /** 表里是否**真的**有这条记录(`get` 会凭空造一条,这个方法不会)。 */
  known(endpointId: string): boolean {
    return this.items.has(endpointId);
  }

  /** 显式写入一条记录(表内替换 / 新增)。 */
  put(endpointId: string, rec: EndpointHealth): void {
    this.items.set(endpointId, rec);
  }

  /** 记一次成败(成功清零并解冻;失败 +1 并进入冷却)。 */
  note(
    endpointId: string,
    opts: {
      ok: boolean;
      error?: string;
      kind?: string;
      status?: number;
      policy?: RetryPolicy | null;
      until?: number | null;
      now?: number;
    },
  ): EndpointHealth {
    const now = opts.now ?? this.wallNow();
    const base = this.items.get(endpointId) ?? emptyHealth();
    const rec = opts.ok
      ? noteSuccess(base, now)
      : noteFailure(base, {
          error: opts.error,
          kind: opts.kind,
          status: opts.status,
          now,
          hint: { until: opts.until ?? null, policy: opts.policy ?? null },
        });
    this.items.set(endpointId, rec);
    return rec;
  }

  /** 强制解冻(凭据刷新成功后由维护循环调用)—— 直接删记录,回到「没有记录 = 可用」。 */
  clear(endpointId: string): void {
    this.items.delete(endpointId);
  }

  /**
   * **批量解冻**:删掉所有满足 `pred` 的记录,返回删掉的条数。
   *
   * 用于「某个账号的凭据换新了 —— 它在**所有**真实模型上的冷却都该解除」
   * ({@link Router.thawAccount}):一把失效的 key 会在多个模型端点上各落
   * 一次冷却,只清当前这一台的话,换档到同账号的别的模型还是被挡着。
   *
   * ⚠️ 与 `clear` 同语义:**删记录 = 回到未知/可用**,不是「记一次成功」。
   * 换新凭据后若仍不灵,下一轮请求会重新落冷却 —— 不掩盖真实故障。
   */
  clearWhere(pred: (endpointId: string) => boolean): number {
    let n = 0;
    for (const key of [...this.items.keys()]) {
      let hit = false;
      try {
        hit = pred(key);
      } catch {
        hit = false;
      }
      if (!hit) continue;
      this.items.delete(key);
      n += 1;
    }
    return n;
  }

  /** 当前处于冷却中的记录(按 `endpointId` 排序,与面板契约形状一致)。 */
  cooled(now: number = this.wallNow()): EndpointHealth[] {
    return [...this.items.entries()]
      .filter(([, rec]) => inCooldown(rec, now))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, rec]) => rec);
  }

  /** 健康账本快照(排障 / 面板用)。 */
  snapshot(now: number = this.wallNow()): {
    tracked: number;
    cooling: number;
    items: Record<string, EndpointHealth>;
  } {
    const items: Record<string, EndpointHealth> = {};
    let cooling = 0;
    for (const key of [...this.items.keys()].sort()) {
      const rec = this.items.get(key);
      if (rec === undefined) {
        continue;
      }
      items[key] = rec;
      if (inCooldown(rec, now)) {
        cooling += 1;
      }
    }
    return { tracked: this.items.size, cooling, items };
  }

  /**
   * 丢掉「早就冷却完了又一直没被选中」的记录,避免表无限增长。
   * @returns 丢掉的条数
   */
  purgeExpired(now: number = this.wallNow()): number {
    const stale = [...this.items.entries()]
      .filter(([, rec]) => rec.fails > 0 && !inCooldown(rec, now))
      .map(([key]) => key);
    for (const key of stale) {
      this.items.delete(key);
    }
    return stale.length;
  }
}
