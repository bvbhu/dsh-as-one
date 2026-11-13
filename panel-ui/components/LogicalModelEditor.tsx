/**
 * 逻辑模型编辑器 —— 新建与编辑**共用这一份**(严格 1:1 移植 Nexus
 * panel/web/src/components/LogicalModelEditor.vue 的模板、文案与交互)。
 *
 * 与 Nexus 模板逐元素对应:
 *   div.editor                        → 同名同构
 *   编辑态 div.fieldRow                → fieldLabel「逻辑模型名」+ fieldValue
 *                                        (title = 改名要删了重建提示)
 *   新建态 label.fieldRow[for=lm-name] → fieldLabel + input#lm-name.input
 *                                        (placeholder「如 deepseek-v4-flash / glm-5.3-flashx」、
 *                                         title 规则说明;边打边校验:非空且不合法才标红
 *                                         inputBad,空着不算错 —— 拦截仍在保存前 validateForm)
 *   div.fieldRow「调度策略」           → select.input.selectInput(6 策略键,中文显示名)
 *   （新增,非 Nexus 移植）label.fieldRow[for=lm-display-name] → 显示名输入
 *                                         (用户 m44638:逻辑模型的调用串不能改,好看的名字
 *                                          另存 `logical_model.display_name`;留空回退用名字)
 *   div.chainHead「档链」             → fieldLabel
 *   div.nodeList > div.nodeRow        → span.groupIdx 序号 + 供应商/模型双下拉
 *                                        (aria-label「第 N 档的供应商/模型」,模型下拉在
 *                                         未选供应商时禁用)+ ↑ 上移一档 / ↓ 下移一档 /
 *                                        ✕ 移除该档 三个 iconButton(title 提示)
 *   button.addModelButton「＋ 添加档位」(目录为空时禁用)
 *   div.editorActions                 → primaryButton(保存中… / 创建 / 保存)+ secondaryButton「取消」
 *
 * 受控组件:name/strategy/members 由页面持有,变更经回调回写;保存/取消由页面代理。
 * 档链 members 的**数组顺序就是优先级**(Nexus 同款:前端原样提交,后端不排序)。
 * 名字输入对齐 Nexus 的 v-model.trim:输入即时去首尾空白。
 */
import React from "react";

/** 逻辑模型名合法规则:小写字母开头,可含小写/数字/点/短横线/单下划线(斜杠不许)。 */
export const NAME_RE = /^[a-z][a-z0-9._-]*$/;

export const STRATEGY_KEYS = [
  "due-first",
  "random",
  "ordered-fallback",
  "least-busy",
  "balanced",
] as const;

export type StrategyKey = (typeof STRATEGY_KEYS)[number];

export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  "due-first": "最先到期 Due first",
  random: "随机 Random",
  "ordered-fallback": "按序降级链 Ordered fallback",
  "least-busy": "最少在途 Least busy",
  balanced: "平均使用 Balanced",
};

/** 一条档链成员:数组顺序即优先级。 */
export interface LogicalMember {
  provider: string;
  model: string;
}

export interface LogicalModelEditorProps {
  /** true = 新建(名字可填);false = 编辑(名字只读,改名要删了重建)。 */
  creating: boolean;
  /** 可登记的档位候选(部署页那一行行,每行一个 provider/model)。 */
  catalog: Array<{ provider: string; model: string }>;
  busy: boolean;
  name: string;
  /**
   * 显示名(用户 m44638)。`""` = 未填,列表与 `/v1/models` 回退用 `name`;
   * 编辑态可清空(传 `""` 下去,保存时归一成 NULL 清列)。
   */
  displayName?: string;
  strategy: string;
  members: LogicalMember[];
  onChangeName?: (name: string) => void;
  onChangeDisplayName?: (displayName: string) => void;
  onChangeStrategy?: (strategy: string) => void;
  onChangeMembers?: (members: LogicalMember[]) => void;
  onSave?: () => void;
  onCancel?: () => void;
}

/** 策略键 → 中文显示名(Nexus labelOf 同款:未知键原样显示,不让下拉空白)。 */
function labelOf(key: string): string {
  return STRATEGY_LABELS[key as StrategyKey] ?? key;
}

export function LogicalModelEditor({
  creating,
  catalog,
  busy,
  name,
  displayName = "",
  strategy,
  members,
  onChangeName,
  onChangeDisplayName,
  onChangeStrategy,
  onChangeMembers,
  onSave,
  onCancel,
}: LogicalModelEditorProps): React.JSX.Element {
  /**
   * 边打边校验(Nexus 同款)。空着不算错(新建时刚打开就是空的),
   * 非空但不合法才标红 —— 真正的拦截仍在保存前的 validateForm。
   */
  const trimmedName = name.trim();
  const nameBad = trimmedName !== "" && !NAME_RE.test(trimmedName);

  /** 全部可登记的真实模型按 provider 去重后的清单。 */
  const providers = [...new Set(catalog.map((c) => c.provider))];

  /**
   * 当前供应商下的可选模型名。
   *
   * ⚠️ 值是**裸模型名**而不是 `provider/model` —— 上游模型名本身可能带斜杠,
   * 只拿 model 字段跟选中的 provider 配对,不做任何字符串拆分(Nexus 同款)。
   * 已选的模型始终在列(即使目录里没有)。
   */
  function modelsOf(provider: string, cur: string): string[] {
    const list = catalog.filter((c) => c.provider === provider).map((c) => c.model);
    if (cur && !list.includes(cur)) list.unshift(cur);
    return list;
  }

  function setMember(i: number, patch: Partial<LogicalMember>): void {
    onChangeMembers?.(members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  /** 换供应商后:该 provider 下只有一个模型时直接选上,省一次点击(Nexus 同款)。 */
  function onProviderChange(i: number, provider: string): void {
    const same = catalog.filter((c) => c.provider === provider);
    if (same.length === 1) setMember(i, { provider, model: same[0].model });
    else setMember(i, { provider });
  }

  function addMember(): void {
    const first = catalog[0];
    onChangeMembers?.([...members, { provider: first?.provider ?? "", model: first?.model ?? "" }]);
  }

  /** 上移 / 下移 —— 「拖拽排序」的等价物,结果**原样提交**。 */
  function moveMember(i: number, delta: -1 | 1): void {
    const j = i + delta;
    if (j < 0 || j >= members.length) return;
    const next = [...members];
    [next[i], next[j]] = [next[j], next[i]];
    onChangeMembers?.(next);
  }

  function removeMember(i: number): void {
    onChangeMembers?.(members.filter((_, idx) => idx !== i));
  }

  return (
    <div className="editor">
      {/* 名字:编辑态只读,直接当标题用;新建态 label 包裹,点文字即聚焦输入框 */}
      {creating ? (
        <label className="fieldRow" htmlFor="lm-name">
          <span className="fieldLabel">逻辑模型名</span>
          <input
            id="lm-name"
            className={`input${nameBad ? " inputBad" : ""}`}
            type="text"
            placeholder="如 deepseek-v4-flash / glm-5.3-flashx"
            title="小写字母开头,只能含小写字母 / 数字 / 点 / 短横线 / 单下划线"
            value={name}
            onChange={(e) => onChangeName?.(e.target.value.trim())}
          />
        </label>
      ) : (
        <div className="fieldRow">
          <span className="fieldLabel">逻辑模型名</span>
          <span className="fieldValue" title={`${name}(改名要删了重建,会破坏已部署的引用)`}>
            {name}
          </span>
        </div>
      )}

      {/* 显示名(用户 m44638):调用串不能改,好看的名字另存一列。留空 = 用逻辑模型名。 */}
      <label className="fieldRow" htmlFor="lm-display-name">
        <span className="fieldLabel">显示名</span>
        <input
          id="lm-display-name"
          className="input"
          type="text"
          placeholder={name || "留空则用逻辑模型名"}
          title="只影响列表与 /v1/models 里显示的名字,调用串仍是逻辑模型名;和别的模型撞名时会自动追加供应商区分"
          value={displayName}
          onChange={(e) => onChangeDisplayName?.(e.target.value.trim())}
        />
      </label>

      <div className="fieldRow">
        <span className="fieldLabel">调度策略</span>
        <select
          className="input selectInput"
          value={strategy}
          onChange={(e) => onChangeStrategy?.(e.target.value)}
        >
          {STRATEGY_KEYS.map((s) => (
            <option key={s} value={s}>
              {labelOf(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="chainHead">
        <span className="fieldLabel">档链</span>
      </div>

      <div className="nodeList">
        {members.map((m, i) => (
          <div key={i} className="nodeRow">
            <span className="groupIdx">{i + 1}</span>
            <select
              className="input nodeProvider"
              value={m.provider}
              aria-label={`第 ${i + 1} 档的供应商`}
              onChange={(e) => onProviderChange(i, e.target.value)}
            >
              <option value="">— 选供应商 —</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              className="input nodeSelect"
              value={m.model}
              disabled={!m.provider}
              aria-label={`第 ${i + 1} 档的模型`}
              onChange={(e) => setMember(i, { model: e.target.value })}
            >
              <option value="">— 选模型 —</option>
              {modelsOf(m.provider, m.model).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="iconButton"
              title="上移一档"
              disabled={i === 0}
              onClick={() => moveMember(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="iconButton"
              title="下移一档"
              disabled={i === members.length - 1}
              onClick={() => moveMember(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="iconButton iconButtonDanger"
              title="移除该档"
              onClick={() => removeMember(i)}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="addModelButton"
          disabled={catalog.length === 0}
          onClick={addMember}
        >
          ＋ 添加档位
        </button>
      </div>

      <div className="editorActions">
        <button type="button" className="primaryButton" disabled={busy} onClick={() => onSave?.()}>
          {busy ? "保存中…" : creating ? "创建" : "保存"}
        </button>
        <button type="button" className="secondaryButton" disabled={busy} onClick={() => onCancel?.()}>
          取消
        </button>
      </div>
    </div>
  );
}

export default LogicalModelEditor;
