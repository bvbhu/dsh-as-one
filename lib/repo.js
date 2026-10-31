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
import { endpointIdOf, splitModelId } from "@as-one/core/src/scheduler/engine.js";
function intOr(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}
/** NexusDatabase + ProviderRegistry → SchedulerRepo。 */
export class AppSchedulerRepo {
    db;
    registry;
    env;
    constructor(db, registry, env) {
        this.db = db;
        this.registry = registry;
        this.env = env;
    }
    // ── SettingsRepo ────────────────────────────────────────────────────────
    getSetting(key) {
        const row = this.db.setting.get(key);
        return row ? row.v : null;
    }
    setSetting(key, value) {
        this.db.setting.set(key, value);
    }
    settings() {
        const out = {};
        for (const row of this.db.raw.prepare("SELECT k, v FROM setting WHERE v IS NOT NULL").all()) {
            out[row.k] = row.v;
        }
        return out;
    }
    // ── SchedulerRepo ───────────────────────────────────────────────────────
    logicalModelRow(name) {
        const lm = this.registry.getLogicalModel(name);
        if (!lm)
            return null;
        return {
            name: lm.name,
            strategy: lm.strategy,
            members: lm.members,
        };
    }
    membersOf(name) {
        const lm = this.registry.getLogicalModel(name);
        return lm ? lm.members : null;
    }
    endpointChain(name) {
        const members = this.registry.membersOf(name);
        if (!members || members.length === 0)
            return [];
        const rows = [];
        for (const member of members) {
            rows.push(...this.#rowsFor(member.provider, member.model, member));
        }
        return rows;
    }
    directChain(name) {
        const pair = splitModelId(name);
        if (!pair)
            return [];
        // ⚠️ 直连路径:engine.chain() 对 direct 行做 `ChainItem.fromData({ endpoint: row })`,
        // 把整行**当作**端点 dict 喂给 Endpoint.fromData —— 所以这里的行必须是**扁平的**
        // RawEndpointData(不能是逻辑路径那种 {member, real_model_id, endpoint} 嵌套行,
        // 否则 provider/base_url 全空)。
        return this.#rowsFor(pair[0], pair[1], null);
    }
    quotas() {
        // 运行期额度快照(装配层注入的缓存投影)。必须**每次现取**:缓存自己带
        // fetched_at,这里再套一层 TTL 只会让面板刷新后仍按旧到期时间排序。
        try {
            return this.env.quotaSnapshot?.() ?? {};
        }
        catch {
            return {};
        }
    }
    // ── 私有 ────────────────────────────────────────────────────────────────
    /** 成员×启用账户展开成 RawEndpointRow(凭据序 = listAccounts 返回序)。 */
    #rowsFor(provider, model, member) {
        const pdef = this.registry.getProvider(provider);
        const rdef = this.registry.getRealModel(provider, model);
        if (!pdef || !rdef)
            return [];
        // 能力/并发上限以 **db.real_model 为准**(面板写库,即时生效);db 没这行
        // 或行值 ≤0 时回落配置文件 —— 与 electron `core-repo.ts` 同口径。
        // 少了它:面板改了 vision / 窗口 / 上限,调度还按旧配置走(双真源)。
        const dbRow = this.db.realModel.get(provider, model);
        const concurrency = dbRow && dbRow.concurrency > 0 ? dbRow.concurrency : intOr(rdef.concurrency, 1);
        const supportsVision = dbRow?.supports_vision ?? rdef.supportsVision;
        const maxInputTokens = dbRow?.max_input_tokens ?? intOr(rdef.maxInputTokens, 0);
        const maxOutputTokens = dbRow?.max_output_tokens ?? intOr(rdef.maxOutputTokens, 0);
        const rows = [];
        for (const account of this.registry.listAccounts(provider)) {
            const credentialRef = account.credentialRef;
            if (!this.env.hasSecret(credentialRef) || !this.env.isAccountEnabled(credentialRef))
                continue;
            const username = credentialRef.slice(provider.length + 1);
            if (!username)
                continue;
            const endpoint = {
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
            }
            else {
                // 直连:扁平端点 dict 即一行(engine 的 direct 路径误读语义见 directChain)。
                rows.push(endpoint);
            }
        }
        return rows;
    }
}
//# sourceMappingURL=repo.js.map