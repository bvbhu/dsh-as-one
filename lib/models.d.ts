/**
 * /v1/models 的条目构建 —— 逻辑模型 + 真实模型并列。
 *
 * ⚠️ 历史上这里是从 `registry.listRealModels()` 原样倒出来的简化版,与 Electron 的
 * `apps/electron/src/main/assembly.ts` `listModelEntries` 有两处**行为差异**:
 *
 * 1. 不过滤 `hidden` —— 面板上被用户藏起来的模型照样从 `/v1/models` 漏出去;
 * 2. 逻辑模型一个能力字段都不带 —— `auto` / `free` 没有 `context_window` 也没有
 *    `reasoning_efforts`,外部压缩器只能瞎猜。
 *
 * 现在按 Electron 的口径逐字段对齐(真源 = `db` 的 `logical_model` / `real_model`,
 * 注册表只当「空库首启播种」的投影),两个宿主的模型列表不再分叉。
 */
import type { NexusDatabase } from "@as-one/core/src/db/database.js";
import type { ProviderRegistry } from "@as-one/core/src/config/providers.js";
import type { ModelEntry } from "@as-one/core/src/gateway/types.js";
export declare function listModelEntries(registry: ProviderRegistry, db: NexusDatabase, providersWithCredentials: ReadonlySet<string>): ModelEntry[];
/** 凭据库里**至少有一条凭据**的 provider 集合(Nexus `EXISTS (credential)` 同义判据)。 */
export declare function providersWithCredentials(registry: ProviderRegistry, vault: {
    list(provider: string): Promise<unknown[]>;
}): Promise<Set<string>>;
