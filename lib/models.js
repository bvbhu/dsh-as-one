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
import { realModelMapOf } from "@as-one/panel/src/modelview.js";
import { parseDbMembers } from "@as-one/panel/src/utils.js";
export function listModelEntries(registry, db, providersWithCredentials) {
    // 各真实模型的窗口/视觉事实(独立取一次,供逻辑模型聚合复用)。
    const windowOf = new Map();
    const visionOf = new Map();
    const effortOf = new Map();
    const allowsOffOf = new Map();
    for (const mv of realModelMapOf(registry, db).values()) {
        const key = `${mv.provider}/${mv.model}`;
        windowOf.set(key, mv.maxInputTokens ?? 0);
        visionOf.set(key, mv.supportsVision);
        effortOf.set(key, mv.supportedReasoningEfforts);
        allowsOffOf.set(key, mv.reasoningAllowsOff);
    }
    /**
     * 各档成员的思考强度能力表的**交集** —— 逻辑模型对外只承诺「每一档都支持」的档位。
     *
     * 三态:
     * - 任一档成员是 `[]`(明说不支持思考)⇒ 整条 `[]`;
     * - 所有档都是 `null`(上游没给表)⇒ `null`(不拦);
     * - 其余取非空名单的交集(按 `toLowerCase()` 比较)。
     */
    const intersectEfforts = (members) => {
        const lists = [];
        for (const m of members) {
            const e = effortOf.get(`${m.provider}/${m.model}`) ?? null;
            if (e !== null && e.length === 0)
                return [];
            if (e !== null && e.length > 0)
                lists.push(e);
        }
        if (lists.length === 0)
            return null;
        let acc = lists[0];
        for (let i = 1; i < lists.length; i += 1) {
            const want = new Set(lists[i].map((x) => x.toLowerCase()));
            acc = acc.filter((x) => want.has(x.toLowerCase()));
            if (acc.length === 0)
                return [];
        }
        return acc;
    };
    /**
     * 「能否关闭思考」的聚合:**每一档都得允许**才敢承诺 `off`。
     * 任一档 `false` ⇒ 整条 `false`;所有档 `null`(未知)⇒ `null`;其余 `true`。
     */
    const intersectAllowsOff = (members) => {
        let saw = false;
        for (const m of members) {
            const a = allowsOffOf.get(`${m.provider}/${m.model}`) ?? null;
            if (a === false)
                return false;
            if (a === true)
                saw = true;
        }
        return saw ? true : null;
    };
    const out = [];
    const seen = new Set();
    // 逻辑模型唯一真源 = db.logical_model(不读 registry —— 否则面板删掉的模型仍会出现)。
    for (const row of db.logicalModel.list()) {
        if (seen.has(row.name))
            continue;
        const members = parseDbMembers(row.members);
        if (members.length === 0)
            continue; // 空成员列出去也调不通
        seen.add(row.name);
        const windows = members
            .map((m) => windowOf.get(`${m.provider}/${m.model}`) ?? 0)
            .filter((w) => Number.isFinite(w) && w > 0);
        out.push({
            id: row.name,
            object: "model",
            owned_by: "as-one",
            litenexus_kind: "logical",
            name: row.name,
            max_input_tokens: windows.length > 0 ? Math.min(...windows) : undefined,
            supports_vision: members.some((m) => visionOf.get(`${m.provider}/${m.model}`) === true),
            reasoning_efforts: intersectEfforts(members),
            reasoning_allows_off: intersectAllowsOff(members),
        });
    }
    // 真实模型:藏起来的不给、没有凭据的不给(与 Nexus `EXISTS (credential)` 同义)。
    const reals = [...realModelMapOf(registry, db).values()]
        .filter((mv) => !mv.hidden && providersWithCredentials.has(mv.provider))
        .sort((a, b) => a.provider < b.provider ? -1 : a.provider > b.provider ? 1
        : a.model < b.model ? -1 : a.model > b.model ? 1 : 0);
    for (const mv of reals) {
        const id = `${mv.provider}/${mv.model}`;
        if (seen.has(id))
            continue;
        seen.add(id);
        out.push({
            id,
            object: "model",
            owned_by: "as-one",
            litenexus_kind: "real",
            name: mv.name ?? mv.model,
            max_input_tokens: mv.maxInputTokens ?? undefined,
            max_output_tokens: mv.maxOutputTokens ?? undefined,
            supports_vision: mv.supportsVision,
            reasoning_efforts: mv.supportedReasoningEfforts,
            reasoning_allows_off: mv.reasoningAllowsOff,
        });
    }
    return out;
}
/** 凭据库里**至少有一条凭据**的 provider 集合(Nexus `EXISTS (credential)` 同义判据)。 */
export async function providersWithCredentials(registry, vault) {
    const out = new Set();
    for (const p of registry.listProviders()) {
        const creds = await vault.list(p.id).catch(() => []);
        if (creds.length > 0)
            out.add(p.id);
    }
    return out;
}
//# sourceMappingURL=models.js.map