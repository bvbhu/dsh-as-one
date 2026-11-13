// engine-models.ts
// ========================================================================

import type {
  BlackoutWindow,
  ChainItemData,
  EndpointData,
  PlanData,
} from "./types.js";
import { EndpointHealth } from "./engine-health.js";
import { credentialKeyOf, endpointIdOf, key, toInt, wallNow } from "./engine-utils.js";
import { defaultConcurrencyOf } from "../config/concurrency-defaults.js";
// 本节由第十刀从 engine.ts 按行段抽出;import/导出由外面接线。
// ========================================================================

// ===========================================================================
// Endpoint / ChainItem / Plan
// ===========================================================================

/** 规范化端点(引擎内部对象;由 RawEndpointData 构建)。 */
export class Endpoint {
  readonly endpointId: string;
  readonly provider: string;
  readonly model: string;
  readonly credentialKey: [string, string];
  readonly protocol: string;
  readonly baseUrl: string;
  readonly region: string;
  readonly concurrency: number;
  readonly supportsVision: boolean;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly cooldownUntil: number;
  readonly health: EndpointHealth | null;

  constructor(data: EndpointData) {
    this.endpointId = data.endpointId;
    this.provider = data.provider;
    this.model = data.model;
    this.credentialKey = data.credentialKey;
    this.protocol = data.protocol;
    this.baseUrl = data.baseUrl;
    this.region = data.region;
    this.concurrency = data.concurrency;
    this.supportsVision = data.supportsVision;
    this.maxInputTokens = data.maxInputTokens;
    this.maxOutputTokens = data.maxOutputTokens;
    this.cooldownUntil = data.cooldownUntil;
    this.health = data.health ? EndpointHealth.fromData(data.health) : null;
  }

  static fromData(data: Record<string, unknown>): Endpoint {
    const provider = String(data.provider ?? data.provider_id ?? "");
    const model = String(data.model ?? data.upstream_id ?? "");
    const credential = credentialKeyOf(data, provider);
    const endpointId = data.endpoint_id
      ? String(data.endpoint_id)
      : endpointIdOf(provider, model, credential[1]);
    return new Endpoint({
      endpointId,
      provider,
      model,
      credentialKey: credential,
      protocol: String(data.protocol ?? "openai"),
      baseUrl: String(data.base_url ?? ""),
      region: String(data.region ?? ""),
      // ⚠️ 2026-11-08:并发是**每凭据**的;行里没带就按供应商缺省
      // (workbuddy=2,其余 1),不要在这里写死 1。
      concurrency: toInt(data.concurrency, defaultConcurrencyOf(provider)),
      supportsVision: Boolean(data.supports_vision),
      maxInputTokens: toInt(data.max_input_tokens, 0),
      maxOutputTokens: toInt(data.max_output_tokens, 0),
      cooldownUntil: Number(data.cooldown_until ?? 0) || 0,
      health: null,
    });
  }

  get realModelKey(): string {
    return key(this.provider, this.model);
  }
  get username(): string {
    return this.credentialKey[1];
  }
  withHealth(health: EndpointHealth | null): Endpoint {
    return new Endpoint({ ...this.toData(), health });
  }
  inCooldown(now?: number): boolean {
    const t = now ?? wallNow();
    if (this.health) return this.health.inCooldown(t);
    if (this.cooldownUntil <= 0) return false;
    return this.cooldownUntil > t;
  }
  toData(): EndpointData {
    return {
      endpointId: this.endpointId,
      provider: this.provider,
      model: this.model,
      credentialKey: this.credentialKey,
      protocol: this.protocol,
      baseUrl: this.baseUrl,
      region: this.region,
      concurrency: this.concurrency,
      supportsVision: this.supportsVision,
      maxInputTokens: this.maxInputTokens,
      maxOutputTokens: this.maxOutputTokens,
      cooldownUntil: this.cooldownUntil,
      health: this.health ? this.health.toData() : null,
    };
  }
}

/** 链条目(priority/blackout 是元信息;选路读列表顺序)。 */
export class ChainItem {
  readonly endpoint: Endpoint;
  readonly priority: number;
  readonly blackout: BlackoutWindow[] | null;
  readonly strategy: string;
  /** 命中降级规则(P4 / 时段 degrade):选路器可据此少用它。 */
  readonly degraded: boolean;
  /** 直连条目(m02240):commit 走抢占式 acquireDirect。 */
  readonly direct: boolean;

  constructor(data: ChainItemData) {
    this.endpoint = new Endpoint(data.endpoint);
    this.priority = data.priority;
    this.blackout = data.blackout;
    this.strategy = data.strategy;
    this.degraded = data.degraded ?? false;
    this.direct = data.direct ?? false;
  }

  static fromData(data: Record<string, unknown>): ChainItem {
    const endpointData =
      data.endpoint && typeof data.endpoint === "object"
        ? (data.endpoint as Record<string, unknown>)
        : {};
    const priorityRaw = data.priority == null ? 0 : Number(data.priority);
    const priority = Number.isFinite(priorityRaw) ? Math.trunc(priorityRaw) : 0;
    const blackout = data.blackout as BlackoutWindow[] | null | undefined;
    return new ChainItem({
      endpoint: Endpoint.fromData(endpointData),
      priority,
      blackout: blackout ?? null,
      strategy: data.strategy ? String(data.strategy) : "",
      degraded: data.degraded === true,
      direct: data.direct === true,
    });
  }
}

/** plan 结果。 */
export class Plan {
  readonly item: ChainItem | null;
  readonly reason: string;
  readonly byAffinity: boolean;

  constructor(item: ChainItem | null, reason: string, byAffinity = false) {
    this.item = item;
    this.reason = reason;
    this.byAffinity = byAffinity;
  }
  get failed(): boolean {
    return this.item === null;
  }
  /** 命中直连条目(m02240 抢占语义)。 */
  get direct(): boolean {
    return this.item?.direct ?? false;
  }
  toData(): PlanData {
    return {
      item: this.item
        ? {
            endpoint: this.item.endpoint.toData(),
            priority: this.item.priority,
            blackout: this.item.blackout,
            strategy: this.item.strategy,
            direct: this.item.direct,
          }
        : null,
      reason: this.reason,
      byAffinity: this.byAffinity,
      failed: this.failed,
      direct: this.direct,
    };
  }
}
