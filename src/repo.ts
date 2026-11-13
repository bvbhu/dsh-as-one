/**
 * SchedulerRepo 适配层 —— 把 NexusDatabase(分区表)+ ProviderRegistry(配置)
 * 适配成 @as-one/core 调度器(Scheduler)需要的 SchedulerRepo 接口。
 *
 * 逐字段移植自 apps/electron/src/main/core-repo.ts(本插件包不与 electron 共享
 * 代码,只共享 @as-one/core 的冻结 API)。契约:
 * packages/core/src/scheduler/types.ts 的 SchedulerRepo / SettingsRepo。
 *
 * 本文件只 import,绝不编辑 packages/core 的任何文件。
 */

import type { NexusDatabase } from "@as-one/core/src/db/database.js";
import type { ProviderRegistry } from "@as-one/core/src/config/providers.js";
import type {
  QuotaSnapshot,
  RawEndpointData,
  RawEndpointRow,
  SchedulerRepo,
} from "@as-one/core/src/scheduler/types.js";
import { endpointIdOf, splitModelId } from "@as-one/core/src/scheduler/engine.js";
import { defaultConcurrencyOf } from "@as-one/core/src/config/concurrency-defaults.js";

/** 装配层注入的环境函数(repo 不直接依赖 vault/overlay 实现)。 */
export interface RepoEnv {
  /** 该凭据(credentialRef "provider/username")是否已有密钥。 */
  hasSecret(credentialRef: string): boolean;
  /** 面板覆盖后的启用态(config enabled × overlay),未覆盖时读 config。 */
  isAccountEnabled(credentialRef: string): boolean;
  /**
   * 运行期额度快照(按 "provider/username" 索引),来自刷新/探针缓存。
   *
   * ⚠️ **due-first 的到期时间就靠它**(用户 m17562):trae / workbuddy 的
   * 到期时间是探针**实时读出来**的,不喂这里 → 调度侧 `_expiryOf()` 两个
   * 来源全空 → `expiry=null` → 排序键并列 → 只能按 members 数组序,「到期
   * 早的先上」等于没生效。缺省(undefined)→ 空表(与旧行为一致)。
   */
  quotaSnapshot?(): Record<string, QuotaSnapshot> | null;
}

function intOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/** NexusDatabase + ProviderRegistry → SchedulerRepo。 */
export class AppSchedulerRepo implements SchedulerRepo {
  constructor(
    private readonly db: NexusDatabase,
    private readonly registry: ProviderRegistry,
    private readonly env: RepoEnv,
  ) {}

  // ── SettingsRepo ────────────────────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = this.db.setting.get(key);
    return row ? row.v : null;
  }

  setSetting(key: string, value: string | null): void {
    this.db.setting.set(key, value);
  }

  settings(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of this.db.raw.prepare("SELECT k, v FROM setting WHERE v IS NOT NULL").all() as {
      k: string;
      v: string;
    }[]) {
      out[row.k] = row.v;
    }
    return out;
  }

  // ── SchedulerRepo ───────────────────────────────────────────────────────

  logicalModelRow(name: string): Record<string, unknown> | null {
    const lm = this.registry.getLogicalModel(name);
    if (!lm) return null;
    return {
      name: lm.name,
      strategy: lm.strategy,
      members: lm.members,
    };
  }

  membersOf(name: string): unknown[] | null {
    const lm = this.registry.getLogicalModel(name);
    return lm ? (lm.members as unknown[]) : null;
  }

  endpointChain(name: string): RawEndpointRow[] {
    const members = this.registry.membersOf(name);
    if (!members || members.length === 0) return [];
    const rows: RawEndpointRow[] = [];
    for (const member of members) {
      rows.push(...this.#rowsFor(member.provider, member.model, member));
    }
    return rows;
  }

  directChain(name: string): RawEndpointRow[] {
    const pair = splitModelId(name);
    if (!pair) return [];
    // ⚠️ 直连路径:engine.chain() 对 direct 行做 `ChainItem.fromData({ endpoint: row })`,
    // 把整行**当作**端点 dict 喂给 Endpoint.fromData —— 所以这里的行必须是**扁平的**
    // RawEndpointData(不能是逻辑路径那种 {member, real_model_id, endpoint} 嵌套行,
    // 否则 provider/base_url 全空)。
    return this.#rowsFor(pair[0], pair[1], null);
  }

  quotas(): Record<string, QuotaSnapshot> {
    // 运行期额度快照(装配层注入的缓存投影)。必须**每次现取**:缓存自己带
    // fetched_at,这里再套一层 TTL 只会让面板刷新后仍按旧到期时间排序。
    try {
      return this.env.quotaSnapshot?.() ?? {};
    } catch {
      return {};
    }
  }

  // ── 私有 ────────────────────────────────────────────────────────────────

  /** 成员×启用账户展开成 RawEndpointRow(凭据序 = listAccounts 返回序)。 */
  #rowsFor(
    provider: string,
    model: string,
    member: { provider: string; model: string } | null,
  ): RawEndpointRow[] {
    const pdef = this.registry.getProvider(provider);
    const rdef = this.registry.getRealModel(provider, model);
    if (!pdef || !rdef) return [];

    // 能力/并发上限以 **db.real_model 为准**(面板写库,即时生效);db 没这行
    // 或行值 ≤0 时回落配置文件 —— 与 electron `core-repo.ts` 同口径。
    // 少了它:面板改了 vision / 窗口 / 上限,调度还按旧配置走(双真源)。
    //
    // ⚠️ 2026-11-08 并发语义改口:concurrency 是**每个凭据**的并发
    // (「并发=1 + 3 凭据 = 3 并发」),缺省按供应商查(workbuddy=2,其余 1)。
    const dbRow = this.db.realModel.get(provider, model);
    const concurrency = dbRow && dbRow.concurrency > 0
      ? dbRow.concurrency
      : intOr(rdef.concurrency, defaultConcurrencyOf(provider));
    const supportsVision = dbRow?.supports_vision ?? rdef.supportsVision;
    const maxInputTokens = dbRow?.max_input_tokens ?? intOr(rdef.maxInputTokens, 0);
    const maxOutputTokens = dbRow?.max_output_tokens ?? intOr(rdef.maxOutputTokens, 0);

    const rows: RawEndpointRow[] = [];
    for (const account of this.registry.listAccounts(provider)) {
      const credentialRef = account.credentialRef;
      if (!this.env.hasSecret(credentialRef) || !this.env.isAccountEnabled(credentialRef)) continue;
      const username = credentialRef.slice(provider.length + 1);
      if (!username) continue;
      const endpoint: RawEndpointData = {
        endpoint_id: endpointIdOf(provider, model, username),
        provider,
        provider_id: provider,
        model,
        upstream_id: model,
        credential_key: [provider, username],
        username,
        account_id: username,
        protocol: pdef.protocol,
        base_url: pdef.baseUrl ?? "",
        region: "",
        concurrency,
        supports_vision: supportsVision ? 1 : 0,
        max_input_tokens: maxInputTokens,
        max_output_tokens: maxOutputTokens,
        cooldown_until: 0,
      };
      if (member) {
        rows.push({ member, real_model_id: `${provider}/${model}`, endpoint });
      } else {
        // 直连:扁平端点 dict 即一行(engine 的 direct 路径误读语义见 directChain)。
        rows.push(endpoint as unknown as RawEndpointRow);
      }
    }
    return rows;
  }
}
