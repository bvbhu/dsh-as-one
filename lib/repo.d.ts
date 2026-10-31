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
import type { QuotaSnapshot, RawEndpointRow, SchedulerRepo } from "@as-one/core/src/scheduler/types.js";
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
/** NexusDatabase + ProviderRegistry → SchedulerRepo。 */
export declare class AppSchedulerRepo implements SchedulerRepo {
    #private;
    private readonly db;
    private readonly registry;
    private readonly env;
    constructor(db: NexusDatabase, registry: ProviderRegistry, env: RepoEnv);
    getSetting(key: string): string | null;
    setSetting(key: string, value: string | null): void;
    settings(): Record<string, string>;
    logicalModelRow(name: string): Record<string, unknown> | null;
    membersOf(name: string): unknown[] | null;
    endpointChain(name: string): RawEndpointRow[];
    directChain(name: string): RawEndpointRow[];
    quotas(): Record<string, QuotaSnapshot>;
}
