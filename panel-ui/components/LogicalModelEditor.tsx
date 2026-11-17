/**
 * 逻辑模型编辑器 —— 新建与编辑**共用这一份**(模板与文案
 * 沿用既有设计)。
 *
 * ## 2026-11-15 档链交互重做(用户定案)
 * - **不显示序号**:去掉蓝色圆圈 groupIdx,优先级由自上而下的排列表达;
 * - **拖动排序**:行首 ⠿ 手柄承担排序,拖到目标缝隙松手即重排,顺序原样提交;
 * - **拖出范围即删除**:把行拖出「档链」列表范围松手就删掉该档,拖动过程中
 *   列表描红并把提示改成「松手即删除该档」,避免误操作;
 * - 不再摆 ↑↓✕ 三个按钮;按用户定案**不保留键盘调序/删除**,档链只走拖拽。
 *
 * 受控组件:name/strategy/members 由页面持有,变更经回调回写;保存/取消由页面代理。
 * 档链 members 的**数组顺序就是优先级**(前端原样提交,后端不排序)。
 * 名字输入对齐 v-model.trim 语义:输入即时去首尾空白。
 */
import React from "react";
import { insertIndexAt, moveItemTo, outsideRect } from "./logical-model-dnd.js";

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

/** 策略键 → 中文显示名(labelOf 同款:未知键原样显示,不让下拉空白)。 */
function labelOf(key: string): string {
  return STRATEGY_LABELS[key as StrategyKey] ?? key;
}

/** 「拖出列表」的宽容差:蹭到边框几像素不算删除。 */
const DROP_MARGIN = 8;

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
   * 边打边校验。空着不算错(新建时刚打开就是空的),
   * 非空但不合法才标红 —— 真正的拦截仍在保存前的 validateForm。
   */
  const trimmedName = name.trim();
  const nameBad = trimmedName !== "" && !NAME_RE.test(trimmedName);

  /** 全部可登记的真实模型按 provider 去重后的清单。 */
  const providers = [...new Set(catalog.map((c) => c.provider))];

  // ── 拖拽状态 ────────────────────────────────────────────────────────────
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const rowRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  /** 源下标 + drop 是否已处理(已重排的档不能在 dragEnd 里再被当成「拖出删除」)。 */
  const dragRef = React.useRef<{ from: number; handled: boolean } | null>(null);
  /** 最后的指针位置:个别浏览器 dragend 的 clientX/Y 会归零,用它兜底。 */
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dropAt, setDropAt] = React.useState<number | null>(null);
  const [outside, setOutside] = React.useState(false);

  /** document 级 dragover:指针出了 nodeList 后,列表自己的事件就不再触发了。 */
  React.useEffect(() => {
    if (dragFrom === null) return;
    const onDocDragOver = (e: DragEvent): void => {
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      const rect = listRef.current?.getBoundingClientRect();
      setOutside(rect ? outsideRect(rect, e.clientX, e.clientY, DROP_MARGIN) : false);
    };
    document.addEventListener("dragover", onDocDragOver);
    return () => document.removeEventListener("dragover", onDocDragOver);
  }, [dragFrom]);

  function rowBands(): Array<{ top: number; bottom: number }> {
    return rowRefs.current
      .slice(0, members.length)
      .filter((el): el is HTMLDivElement => el !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
  }

  /**
   * 当前供应商下的可选模型名。
   *
   * ⚠️ 值是**裸模型名**而不是 `provider/model` —— 上游模型名本身可能带斜杠,
   * 只拿 model 字段跟选中的 provider 配对,不做任何字符串拆分。
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

  /** 换供应商后:该 provider 下只有一个模型时直接选上,省一次点击。 */
  function onProviderChange(i: number, provider: string): void {
    const same = catalog.filter((c) => c.provider === provider);
    if (same.length === 1) setMember(i, { provider, model: same[0].model });
    else setMember(i, { provider });
  }

  function addMember(): void {
    const first = catalog[0];
    onChangeMembers?.([...members, { provider: first?.provider ?? "", model: first?.model ?? "" }]);
  }

  function removeMember(i: number): void {
    onChangeMembers?.(members.filter((_, idx) => idx !== i));
  }

  function onHandleDragStart(i: number, e: React.DragEvent<HTMLSpanElement>): void {
    dragRef.current = { from: i, handled: false };
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    setDragFrom(i);
    setDropAt(null);
    setOutside(false);
    e.dataTransfer.effectAllowed = "move";
    // Firefox 要求 dragstart 里必须 setData,否则后续 dragover/drop 不派发。
    e.dataTransfer.setData("text/plain", String(i));
  }

  function onListDragOver(e: React.DragEvent<HTMLDivElement>): void {
    if (dragRef.current === null) return;
    e.preventDefault(); // 不 preventDefault 浏览器就不会派发 drop
    e.dataTransfer.dropEffect = "move";
    setDropAt(insertIndexAt(rowBands(), e.clientY));
  }

  function onListDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    const d = dragRef.current;
    if (d === null) return;
    d.handled = true;
    onChangeMembers?.(moveItemTo(members, d.from, insertIndexAt(rowBands(), e.clientY)));
  }

  function onHandleDragEnd(e: React.DragEvent<HTMLSpanElement>): void {
    const d = dragRef.current;
    dragRef.current = null;
    setDragFrom(null);
    setDropAt(null);
    setOutside(false);
    if (d === null || d.handled) return;
    // 没在列表内落点 → 只有确实越界才删;拖回原处松手什么都不做。
    const rect = listRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p =
      e.clientX !== 0 || e.clientY !== 0
        ? { x: e.clientX, y: e.clientY }
        : (lastPointRef.current ?? { x: e.clientX, y: e.clientY });
    if (outsideRect(rect, p.x, p.y, DROP_MARGIN)) removeMember(d.from);
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
        <span className={`chainHint${outside ? " chainHintDanger" : ""}`}>
          {outside ? "松手即删除该档" : "拖动 ⠿ 调整优先级 · 拖出列表即删除"}
        </span>
      </div>

      <div
        ref={listRef}
        className={`nodeList${outside ? " nodeListOutside" : ""}`}
        onDragOver={onListDragOver}
        onDrop={onListDrop}
      >
        {members.map((m, i) => (
          <React.Fragment key={i}>
            {dropAt === i ? <div className="dropMarker" aria-hidden="true" /> : null}
            <div
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              className={`nodeRow${dragFrom === i ? " nodeRowDragging" : ""}`}
            >
              <span
                className="dragHandle"
                draggable
                title="拖动排序 · 拖出档链区域即删除"
                aria-label={`第 ${i + 1} 档的拖动手柄`}
                onDragStart={(e) => onHandleDragStart(i, e)}
                onDragEnd={onHandleDragEnd}
              >
                ⠿
              </span>
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
            </div>
          </React.Fragment>
        ))}
        {dropAt === members.length ? <div className="dropMarker" aria-hidden="true" /> : null}
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
