/**
 * `/v1/models` 清单的唯一真源 —— 逻辑模型 + 真实模型并列。
 *
 * 为什么放在 `@as-one/panel` 而不是两个宿主各写一份:
 * 这份逻辑以前有**两份逐字副本**(Electron `assembly.ts` 与插件 `models.ts`),
 * 漂移过一次 —— 插件版不过滤 `hidden`、逻辑模型一个能力字段都不带,于是同一个
 * 「藏起来」的勾选在独立应用里生效、在插件里漏出去(2026-10-30 修)。SQLite 是
 * 唯一真源,清单口径也必须是唯一真源,否则每次改都要记得同步两处。
 *
 * 只放纯映射:`db` + 注册表 → 对外条目。不摸网络、不摸面板状态。
 *
 * ── 显示名(用户 m44638:「真实模型也显示到 dsh 模型选择器…需要优化显示名,
 *    如果有相同的显示名,则追加 provider 区分,为逻辑模型添加一个显示名字段」)──
 * 每条条目给两个名字,分工明确:
 * - `name`:这个模型**自己**填的人话名(逻辑模型 = `logical_model.display_name`,
 *   没填则用 `name`;真实模型 = `real_model.name`,没填则用裸 model 名);
 * - `display_name`:**整张清单摆在一起**后保证互不相同的名字 —— 撞名时真实模型
 *   追加 ` (provider)`,逻辑模型追加 ` (逻辑名)`,还撞再追加序号。
 *   渲染选择器只该用这个字段。
 * `id` 永远不变(它是调用串),所以显示层怎么改都不影响请求路由。
 */

import type { NexusDatabase } from "@as-one/core/src/db/database.js";
import type { ProviderRegistry } from "@as-one/core/src/config/providers.js";
import type { ModelEntry } from "@as-one/core/src/gateway/types.js";
import { realModelMapOf } from "./modelview.js";
import { parseDbMembers } from "./utils.js";

/** 成员清单里的一个档位(与 `parseDbMembers` 同形)。 */
type Member = { provider: string; model: string };

/** 显示名去重时用的比较键:忽略大小写与首尾空白(`DeepSeek-Flash` 与 `deepseek-flash` 算撞名)。 */
const labelKey = (s: string): string => s.trim().toLowerCase();

/**
 * 给一批候选显示名做去重标注。
 *
 * @param bases  原始显示名(可能撞车)
 * @param tags   撞车时追加的区分串(真实模型 = provider;逻辑模型 = 逻辑名)
 * @returns 与入参等长的最终显示名数组,保证互不相同
 */
export function dedupeLabels(bases: string[], tags: (string | null)[]): string[] {
  const keyCount = new Map<string, number>();
  for (const b of bases) {
    const k = labelKey(b);
    keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
  }
  const out: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    let label = (keyCount.get(labelKey(base)) ?? 0) > 1 && tags[i] ? `${base} (${tags[i]})` : base;
    // 追加 provider 后仍与别的条目撞车(例如有人把逻辑模型显示名填成 `x (y)`):
    // 用序号兜底,保证清单里显示名唯一 —— 选择器里两条同名是查不出来的。
    if (used.has(labelKey(label))) {
      for (let n = 2; ; n += 1) {
        const candidate = `${label} ·${n}`;
        if (!used.has(labelKey(candidate))) {
          label = candidate;
          break;
        }
      }
    }
    used.add(labelKey(label));
    out.push(label);
  }
  return out;
}

/**
 * 逻辑模型统一声明的思考强度(2026-11-02 用户定案)。
 *
 * ⚠️ 为什么是**完整规范阶梯**而不是成员交集:逻辑模型是**抽象层**,真正发请求时
 * 网关按**当轮选中的真实成员**自己的能力表钳制(见
 * `@as-one/core/src/gateway/reasoning-effort.ts`:一条全局规范阶梯
 * `off < low < medium < high < max` + 模型声明能力子集 + 运行时最近档位钳制)。
 * 对外声明交集反而把「调度可能选中任意档」这件事藏起来 —— 用户看到什么档位,
 * 就按什么档位发,由当轮真实模型兜底。`off` 不是这一列里的强度点,由
 * `reasoning_allows_off: true` 单独承诺。
 */
const LOGICAL_REASONING_EFFORTS: string[] = ["low", "medium", "high", "max"];

/**
 * 构建 `/v1/models` 的条目清单(逻辑模型在前,真实模型按 provider/model 字典序)。
 *
 * 能力字段的聚合口径(两份宿主必须一致,写死在这里):
 * - `max_input_tokens` = 各档成员窗口的**最小值** —— 链里最窄的那档决定能塞多少;
 * - `supports_vision` = **任一档支持即声明** —— 带图请求总会被某一档消化;
 * - `reasoning_efforts` = 逻辑模型**统一声明完整规范阶梯**(见
 *   {@link LOGICAL_REASONING_EFFORTS}),真实模型 = 自己库里的能力表;
 * - `reasoning_allows_off` = 逻辑模型恒为 `true`,真实模型 = 自己库里的列。
 *
 * ⚠️ 去重口径与 Nexus 一致:真实模型的 id 若已被某个逻辑模型名占用,跳过
 * (同一名字不能既是抽象模型又是真实模型)。
 *
 * ⚠️ 逻辑模型唯一真源 = `db.logical_model`(不读 registry —— 否则面板删掉的
 * 模型仍会出现);空成员的逻辑模型**不列**(列出去也调不通)。
 */
export function listModelEntries(
  registry: ProviderRegistry,
  db: NexusDatabase,
  providersWithCredentials: ReadonlySet<string>,
): ModelEntry[] {
  // 各真实模型的窗口/视觉能力事实(独立取一次,供逻辑模型聚合复用)。
  const windowOf = new Map<string, number>();
  const visionOf = new Map<string, boolean>();
  for (const mv of realModelMapOf(registry, db).values()) {
    const key = `${mv.provider}/${mv.model}`;
    windowOf.set(key, mv.maxInputTokens ?? 0);
    visionOf.set(key, mv.supportsVision);
  }

  // ── 1. 逻辑模型 ────────────────────────────────────────────────────────────
  const logical: Array<{
    row: { name: string; members: string; display_name?: string | null };
    members: Member[];
    base: string;
  }> = [];
  const seen = new Set<string>();
  for (const row of db.logicalModel.list()) {
    if (seen.has(row.name)) continue;
    const members = parseDbMembers(row.members);
    if (members.length === 0) continue;
    seen.add(row.name);
    logical.push({ row, members, base: (row.display_name ?? "").trim() || row.name });
  }

  // ── 2. 真实模型:藏起来的不给、没有凭据的不给(与 Nexus `EXISTS (credential)` 同义)──
  const reals = [...realModelMapOf(registry, db).values()]
    .filter((mv) => !mv.hidden && providersWithCredentials.has(mv.provider))
    .sort((a, b) =>
      a.provider < b.provider ? -1 : a.provider > b.provider ? 1
        : a.model < b.model ? -1 : a.model > b.model ? 1 : 0,
    );
  // ⚠️ 不往 mv 上挂字段 —— 那些对象来自 realModelMapOf,改了会污染调用方的视图。
  const realRows: Array<{ mv: (typeof reals)[number]; id: string }> = [];
  for (const mv of reals) {
    const id = `${mv.provider}/${mv.model}`;
    if (seen.has(id)) continue; // 逻辑名占位优先(与旧口径一致)
    seen.add(id);
    realRows.push({ mv, id });
  }

  // ── 3. 显示名去重(整张清单一起算,逻辑名与真实名互相撞也要区分)────────────
  // 真实模型的 base 取**注册表投影**(`realModelMapOf` = registry.listRealModels +
  // db overlay),库里改了名但没刷新注册表时会拿到旧串。这里显式按 (provider,model)
  // 回查一次 db 行 —— 库里那一列才是真源,不依赖调用方有没有 refresh 过注册表。
  const dbReal = new Map<string, string | null>();
  for (const r of db.realModel.list()) dbReal.set(`${r.provider}/${r.model}`, r.name);

  const bases = [
    ...logical.map((l) => l.base),
    ...realRows.map(({ mv, id }) => {
      const raw = dbReal.has(id) ? dbReal.get(id) : mv.name;
      return (raw ?? "").trim() || mv.model;
    }),
  ];
  // 撞名时追加的区分串:
  // - 真实模型 → provider(`deepseek-flash (sensenova)`),它本来就该说明是谁家的;
  // - 逻辑模型 → 只在**填了显示名**时追加调用串。没填时 base 就是 row.name,
  //   追加会写出 `deepseek-flash (deepseek-flash)` 这种废话,而且逻辑模型的裸名字
  //   是用户自己敲的调用串,该保持干净 —— 撞它的真实模型让路。
  const tags: (string | null)[] = [
    ...logical.map((l) => (l.base === l.row.name ? null : l.row.name)),
    ...realRows.map(({ mv }) => mv.provider),
  ];
  const labels = dedupeLabels(bases, tags);

  const out: ModelEntry[] = [];
  logical.forEach((l, i) => {
    const windows = l.members
      .map((m) => windowOf.get(`${m.provider}/${m.model}`) ?? 0)
      .filter((w) => Number.isFinite(w) && w > 0);
    out.push({
      id: l.row.name,
      object: "model",
      owned_by: "as-one",
      litenexus_kind: "logical",
      name: l.base,
      display_name: labels[i],
      max_input_tokens: windows.length > 0 ? Math.min(...windows) : undefined,
      // 最大成员窗口:压缩分块按它切块(配合请求上的 `minInputTokens` 让选路
      // 避开装不下的小窗口成员),详见 `ModelEntry.max_member_input_tokens`。
      max_member_input_tokens: windows.length > 0 ? Math.max(...windows) : undefined,
      supports_vision: l.members.some((m) => visionOf.get(`${m.provider}/${m.model}`) === true),
      reasoning_efforts: LOGICAL_REASONING_EFFORTS,
      reasoning_allows_off: true,
    });
  });
  realRows.forEach(({ mv, id }, j) => {
    // 档位表**原样**来自库(`real_model.supported_reasoning_efforts`)：
    // 它就是上游自己的拼写，网关钳制后直接写进报文。NULL = 上游没给表 →
    // 这一维不声明(DSH 选择器不出现思考强度)，网关也一个字段都不发 ——
    // 不猜、不替上游造默认梯。
    out.push({
      id,
      object: "model",
      owned_by: "as-one",
      litenexus_kind: "real",
      name: (mv.name ?? "").trim() || mv.model,
      display_name: labels[logical.length + j],
      max_input_tokens: mv.maxInputTokens ?? undefined,
      max_output_tokens: mv.maxOutputTokens ?? undefined,
      supports_vision: mv.supportsVision,
      reasoning_efforts: mv.supportedReasoningEfforts,
      reasoning_allows_off: mv.reasoningAllowsOff,
    });
  });
  return out;
}

/** 凭据库里**至少有一条凭据**的 provider 集合(Nexus `EXISTS (credential)` 同义判据)。 */
export async function providersWithCredentials(
  registry: ProviderRegistry,
  vault: { list(provider: string): Promise<unknown[]> },
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const p of registry.listProviders()) {
    const creds = await vault.list(p.id).catch(() => []);
    if (creds.length > 0) out.add(p.id);
  }
  return out;
}
