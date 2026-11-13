/**
 * 逻辑模型子页(严格 1:1 复刻 Nexus panel/web/src/LogicalModels.vue,2026-10-12 定案结构)。
 *
 * 结构对照(Nexus 模板 → 本页,DOM/class/文案逐字对齐):
 *   section.section(max-width 720px,.lm-section)→ 同构
 *   div.err(role=alert) / p.savedNotice(role=status) → 同(错误 / 保存成功通知)
 *   ul.rows > li.rowCard               → 每逻辑模型一张行卡
 *     div.rowHead > span.rowIdentity   → span.rowName(模型名)+ span.rowTag(策略中文名)
 *     span.rowRuntime                  → 见下方「契约降级说明」(视觉徽章)
 *     span.rowActions                  → rowBtn 编辑(展开时变「收起」)/ rowBtn.danger 删除
 *   编辑卡(编辑态) → components/LogicalModelEditor(creating=false)
 *   li.rowCard 新建卡 → rowName「添加逻辑模型」+ LogicalModelEditor(creating=true)
 *   button.addButton「＋ 添加逻辑模型」(creating 时隐藏)
 *
 * ⚠️ 契约降级说明(panel-types.ts 冻结;Nexus 的运行时数据本页无法完整照搬):
 * 1. Nexus 的「冷却中 / 可用」pill 与「未在运行 Router」取 status.deployments 运行时行
 *    (按 model_name 索引,配合 fmtDuration 冷却提示)。As One 契约没有 Status 的
 *    逐模型运行时数据 —— GatewayStatus 只有聚合 cooldown_count,RuntimeSnapshot 无任何
 *    冷却字段 → 本页**不渲染** 冷却中/可用 pill,也不渲染「未在运行 Router」(无法判定
 *    运行态,渲染即编造);Nexus 对这些数据的空态即「不显示」,此处语义一致。
 * 2. Nexus 的视觉徽章(全视觉/有视觉)取自运行行 info.supports_vision / all_members_vision;
 *    As One 用 LogicalModelGroup.deployments[].supports_vision 目录字段做同一判定
 *    (some=有视觉 / every=全视觉,语义与 Nexus tooltip 完全一致),仅在组有视觉成员时显示。
 * 3. 保存/删除的 !r.ok 分支:Nexus 的 api 层在 !ok 时抛错进 catch;As One 契约直接返回
 *    {ok, message},故这里显式把 !ok 落进 error(等价语义)。
 * 4. members 契约是 "provider/model" 串数组(Nexus 是 {provider,model} 对象数组),
 *    回填/提交按首个斜杠拆/拼(裸模型名可能带斜杠,indexOf 取第一个,与
 *    Nexus 编辑器「不做字符串拆分拿 model 字段配对」在 UI 行为上等价)。
 */
import React from "react";
import { rendererApi } from "../../api";
import type { LogicalModelGroup } from "../../api";
import {
  LogicalModelEditor,
  NAME_RE,
  STRATEGY_KEYS,
  STRATEGY_LABELS,
  type LogicalMember,
  type StrategyKey,
} from "../../components/LogicalModelEditor";

/** 策略键 → 中文名(Nexus labelOf 同款;未知键原样显示)。 */
function labelOf(key: string): string {
  return STRATEGY_LABELS[key as StrategyKey] ?? key;
}

/** "provider/model" 串 → {provider, model}(首个斜杠分隔)。 */
function splitMember(s: string): LogicalMember {
  const i = s.indexOf("/");
  return i < 0 ? { provider: s, model: "" } : { provider: s.slice(0, i), model: s.slice(i + 1) };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function LogicalModelsPage(): React.JSX.Element {
  const [groups, setGroups] = React.useState<LogicalModelGroup[]>([]);
  /** 编辑器档位候选(部署行:provider/model —— Nexus 的 deployments 目录)。 */
  const [catalog, setCatalog] = React.useState<Array<{ provider: string; model: string }>>([]);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  /** 正在编辑的逻辑模型名("" = 未展开;新建时另用 creating)。 */
  const [editingName, setEditingName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  /** 策略:机器键。 */
  const [formStrategy, setFormStrategy] = React.useState<StrategyKey>("due-first");
  /**
   * 显示名(用户 m44638):`""` = 未填,列表与 `/v1/models` 回退用逻辑模型名。
   * 调用串仍是 `name` —— 这一列只改显示,不改路由。
   */
  const [formDisplayName, setFormDisplayName] = React.useState("");
  /** ⭐ 有序成员数组 —— 数组下标就是 priority,提交时原样发送。 */
  const [formMembers, setFormMembers] = React.useState<LogicalMember[]>([]);

  async function load(): Promise<void> {
    try {
      const [lm, dep] = await Promise.all([rendererApi.getLogicalModels(), rendererApi.getDeployments()]);
      setGroups(lm);
      setCatalog(
        (dep.deployments ?? []).map((d) => ({ provider: d.provider, model: d.model })),
      );
      setError("");
    } catch (e) {
      setError(msg(e));
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  /**
   * 视觉徽章判定(Nexus 语义同源:supports_vision 的 some/every,
   * 数据源换成目录字段 —— 见文件头降级说明 2)。
   */
  function visionOf(g: LogicalModelGroup): { all: boolean } | null {
    const ds = g.deployments ?? [];
    if (!ds.length || !ds.some((d) => d.supports_vision)) return null;
    return { all: ds.every((d) => d.supports_vision) };
  }

  /** 新建:空数组 + 默认策略 + 空显示名。 */
  function startCreate(): void {
    setCreating(true);
    setEditingName("");
    setFormDisplayName("");
    setFormStrategy("due-first");
    setFormMembers([]);
    setError("");
    setNotice("");
  }

  /** 编辑:回填表单(members 优先,否则 deployments;原样保序 —— 数组下标=priority)。 */
  function startEdit(g: LogicalModelGroup): void {
    if (editingName === g.model && !creating) {
      closeCard();
      return;
    }
    setCreating(false);
    setEditingName(g.model);
    setFormDisplayName(g.display_name ?? "");
    setFormStrategy((g.routing_strategy ?? "random") as StrategyKey);
    // Nexus 同款:`g.members ?? (g.deployments ?? []).map(...)` —— **空数组不回退**,
    // 只有 null/undefined 才回退到部署行(契约里 members 必填,故这里只做运行时防御)。
    const rawMembers = g.members as string[] | null | undefined;
    const members: LogicalMember[] =
      rawMembers != null
        ? rawMembers.map(splitMember)
        : (g.deployments ?? []).map((d) => ({ provider: d.provider, model: d.model }));
    setFormMembers(members);
    setError("");
    setNotice("");
  }

  function closeCard(): void {
    setEditingName("");
    setCreating(false);
  }

  /** 写入前校验(Nexus validateForm 同规则;错误就地显示,不落盘)。 */
  function validateForm(): string | null {
    if (creating) {
      const name = editingName.trim();
      if (!NAME_RE.test(name)) return "逻辑模型名需以小写字母开头,只能含小写字母/数字/点/短横线/单下划线";
      if (groups.some((g) => g.model === name)) return "已有逻辑模型使用了这个名字。";
    }
    if (!STRATEGY_KEYS.includes(formStrategy as StrategyKey)) return "调度策略不合法";
    const picked = formMembers.filter((m) => m.provider && m.model);
    if (!picked.length) return "至少要选一个真实模型";
    if (picked.length !== formMembers.length) return "有未选完的节点:先选供应商,再选模型";
    const seen = new Set(picked.map((m) => `${m.provider}/${m.model}`));
    if (seen.size !== picked.length) return "档链里有重复的真实模型";
    return null;
  }

  async function save(): Promise<void> {
    const bad = validateForm();
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const r = await rendererApi.writeLogicalModel({
        model_name: editingName.trim(),
        // 显示名:空串 = 后端清成 NULL(回退用 model_name)。这里总是带上表单值,
        // 因为表单是从 g.display_name 回填的,不会把用户没看过的列误清。
        display_name: formDisplayName.trim(),
        routing_strategy: formStrategy,
        // ⚠️ 数组顺序就是 priority:原样提交,不做任何排序
        members: formMembers
          .filter((m) => m.provider && m.model)
          .map((m) => `${m.provider}/${m.model}`),
      });
      if (!r.ok) {
        setError(r.message || "保存失败");
        return;
      }
      setNotice(r.message ?? "已保存");
      closeCard();
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeModel(g: LogicalModelGroup): Promise<void> {
    const n = g.count ?? 0;
    const tail = n > 0 ? `(含 ${n} 档)` : "";
    if (!window.confirm(`确定删除逻辑模型 ${g.model}?${tail}`)) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const r = await rendererApi.removeLogicalModel(g.model);
      if (!r.ok) {
        setError(r.message || "删除失败");
        return;
      }
      setNotice(r.message ?? "已删除");
      if (editingName === g.model) closeCard();
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section lm-section">
      {error ? <div className="err" role="alert">{error}</div> : null}
      {notice ? <p className="savedNotice" role="status">{notice}</p> : null}

      <ul className="rows">
        {groups.map((g) => {
          const vision = visionOf(g);
          return (
            <li key={g.model} className="rowCard">
              <div className="rowHead">
                <span className="rowIdentity">
                  {/* 显示名优先(用户 m44638);填了显示名时把调用串以小字标出 ——
                      调用才是用 name,藏起来会让人不知道自己在改哪一条。 */}
                  <span className="rowName" title={g.display_name ? `调用串:${g.model}` : undefined}>
                    {g.display_name || g.model}
                  </span>
                  {g.display_name ? <span className="rowTag">{g.model}</span> : null}
                  <span className="rowTag">{labelOf(g.routing_strategy ?? "random")}</span>
                </span>
                <span className="rowRuntime">
                  {vision ? (
                    <span
                      className="pill info"
                      title={
                        vision.all
                          ? "档链里每一档都是视觉模型(全部 supports_vision)"
                          : "档链里有视觉模型(任一档 supports_vision),带图请求优先投给它"
                      }
                    >
                      {vision.all ? "全视觉" : "有视觉"}
                    </span>
                  ) : null}
                </span>
                <span className="rowActions">
                  <button
                    type="button"
                    className="rowBtn"
                    disabled={busy}
                    onClick={() => startEdit(g)}
                  >
                    {editingName === g.model && !creating ? "收起" : "编辑"}
                  </button>
                  <button
                    type="button"
                    className="rowBtn danger"
                    disabled={busy}
                    onClick={() => removeModel(g)}
                  >
                    删除
                  </button>
                </span>
              </div>

              {/* 编辑块:与下面的「新建」共用一个组件,不再有两份几乎相同的模板 */}
              {editingName === g.model && !creating ? (
                <LogicalModelEditor
                  creating={false}
                  catalog={catalog}
                  busy={busy}
                  name={editingName}
                  displayName={formDisplayName}
                  strategy={formStrategy}
                  members={formMembers}
                  onChangeName={setEditingName}
                  onChangeDisplayName={setFormDisplayName}
                  onChangeStrategy={(s) => setFormStrategy(s as StrategyKey)}
                  onChangeMembers={setFormMembers}
                  onSave={() => void save()}
                  onCancel={closeCard}
                />
              ) : null}
            </li>
          );
        })}

        {creating ? (
          <li className="rowCard">
            <div className="rowHead">
              <span className="rowIdentity">
                <span className="rowName">添加逻辑模型</span>
              </span>
            </div>
            <LogicalModelEditor
              creating={true}
              catalog={catalog}
              busy={busy}
              name={editingName}
              displayName={formDisplayName}
              strategy={formStrategy}
              members={formMembers}
              onChangeName={setEditingName}
              onChangeDisplayName={setFormDisplayName}
              onChangeStrategy={(s) => setFormStrategy(s as StrategyKey)}
              onChangeMembers={setFormMembers}
              onSave={() => void save()}
              onCancel={closeCard}
            />
          </li>
        ) : null}
      </ul>

      {!creating ? (
        <button type="button" className="addButton" disabled={busy} onClick={startCreate}>
          ＋ 添加逻辑模型
        </button>
      ) : null}
    </section>
  );
}

export default LogicalModelsPage;
