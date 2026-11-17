/**
 * 统一并发容量视图 —— 把 `Router["ledger"]`（端点级账本）包装成
 * `provider/model` 级的只读占用查询，外加一个本进程内的 `pending` 预留层。
 *
 * 为什么需要它
 * ------------
 * 1. `rt.ledger` 的容量键是**端点** `provider/model@username`（每枚凭据各有
 *    自己的并发份），而 subagent / 压缩策略按 `provider/model` 判定。要按
 *    前缀聚合成一个模型维度的在途数。
 * 2. 从「批准一个 subagent」到「它真正发请求进 ledger」之间有时间窗；
 *    只靠 ledger 会连续放行多个。用 `pending` 把这段窗口也计进去。
 *
 * 纪律
 * ----
 * - 本模块**只读 ledger，不写它**：真实租约仍由 as-one 的请求路径 acquire/release。
 * - 唯一能写的是进程内 `pendingMap`（本插件自己批准的、尚未落到 ledger 的名额）。
 * - 单一进程内状态，与 ledger 同生命周期；重启即清零，与 DSH 进程语义一致。
 *
 * @module src/components/capacity
 */

import type { InflightLease } from "@as-one/core/src/router/types.js";

/** ledger 的最小只读形状（便于测试替身）。 */
export interface LedgerView {
  detail(): InflightLease[];
}

export interface CapacityKey {
  provider: string | undefined;
  model: string | undefined;
}

/** `provider/model` 的规范化字符串键。缺 provider 时用 `*`。 */
export function keyOf(provider: string | undefined, model: string | undefined): string {
  const p = provider && provider !== "" ? provider : "*";
  const m = model && model !== "" ? model : "*";
  return `${p}/${m}`;
}

/** 从端点 id（`provider/model@username`）里剥出 `provider/model` 前缀。 */
export function modelKeyOfEndpoint(endpointId: string): string {
  const base = endpointId.split("@")[0] ?? endpointId;
  return base.includes("/") ? base : `*/${base}`;
}

/**
 * 一个模型维度上的容量账本视图。
 *
 * usage(key) = ledger 里该 provider/model 的在途租约数 + 尚未落账的 pending 数。
 */
export class CapacityView {
  private readonly pending = new Map<string, number>();

  constructor(private readonly ledger: LedgerView) {}

  /** 当前占用（含 pending）。`provider` 为 `*` 时跨 provider 按模型名聚合。
   *  `excludeSessionId` 非空时排除该会话在 ledger 里的租约（用于「主会话不计入」）。 */
  usage(
    provider: string | undefined,
    model: string | undefined,
    excludeSessionId?: string,
  ): number {
    return this.usageWith(provider, model, excludeSessionId);
  }

  private usageWith(
    provider: string | undefined,
    model: string | undefined,
    excludeSessionId?: string,
  ): number {
    const key = keyOf(provider, model);
    let count = this.pending.get(key) ?? 0;
    for (const lease of this.ledger.detail()) {
      if (excludeSessionId && String(lease.sessionId ?? "") === excludeSessionId) continue;
      const leaseKey = modelKeyOfEndpoint(String(lease.endpointId ?? ""));
      if (this.matches(key, leaseKey)) count += 1;
    }
    return count;
  }

  /** `provider/model` 查询键是否命中某条租约的模型键。 */
  private matches(queryKey: string, leaseKey: string): boolean {
    if (queryKey === leaseKey) return true;
    const [qp, qm] = queryKey.split("/");
    const [lp, lm] = leaseKey.split("/");
    // `*/model`：跨 provider 只按模型名匹配
    if (qp === "*" && qm === lm) return true;
    // `provider/*`：该 provider 下任意模型
    if (qm === "*" && qp === lp) return true;
    return false;
  }

  /** 只数 ledger 里的真实在途（不含 pending），给面板/诊断用。 */
  inFlight(provider: string | undefined, model: string | undefined): number {
    const key = keyOf(provider, model);
    let count = 0;
    for (const lease of this.ledger.detail()) {
      const leaseKey = modelKeyOfEndpoint(String(lease.endpointId ?? ""));
      if (leaseKey === key) count += 1;
    }
    return count;
  }

  /** 预占一个名额（批准 subagent 但还没落账时调用）。 */
  reserve(provider: string | undefined, model: string | undefined): void {
    const key = keyOf(provider, model);
    this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
  }

  /** 释放一个预占（请求已落账或被拒时调用）。 */
  unreserve(provider: string | undefined, model: string | undefined): void {
    const key = keyOf(provider, model);
    const next = (this.pending.get(key) ?? 0) - 1;
    if (next <= 0) this.pending.delete(key);
    else this.pending.set(key, next);
  }

  /** 当前所有 pending（诊断用）。 */
  pendingSnapshot(): Record<string, number> {
    return Object.fromEntries([...this.pending.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  }

  /** 清空 pending（插件卸载 / 测试）。 */
  reset(): void {
    this.pending.clear();
  }
}

/** 从 `AsOneRuntime` 造一个视图（装配处调用）。 */
export function createCapacityView(ledger: LedgerView): CapacityView {
  return new CapacityView(ledger);
}
