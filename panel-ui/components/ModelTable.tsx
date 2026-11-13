/**
 * 模型表(全项目共享;1:1 移植 Nexus ModelTable.vue)。
 *
 * 列:启用(checkbox)/ 模型 / 名称 / 倍率 / 上下文窗口 / 最大输出 / 视觉。
 * 数据来自契约类型 CatalogModel;`onEdit` 发单字段变更(id=裸模型名,
 * field ∈ exposed|name|vision|context|output),提交由页面代理负责
 * (与 Nexus ProviderCard.vue 的 draft → save 流程一致)。
 */
import React from "react";

export interface ModelTableRow {
  /** 裸模型名(表格行键与显示值,如 `glm-5.3-flash`)。 */
  id: string;
  /** 完整对外 id(`<provider>/<模型>`),title 提示用。 */
  fullId?: string;
  name: string;
  rate?: number | null;
  /** 输入框里的字符串;空 = 用目录默认值/清空声明。 */
  context: string;
  output: string;
  vision: boolean;
  exposed: boolean;
  available?: boolean;
  callable?: boolean;
  defaultContext?: number | null;
  defaultOutput?: number | null;
  /** 上游核验表说它是图像模型 → 表格上的绿点。 */
  visionUpstream?: boolean;
}

export interface ModelTableEdit {
  id: string;
  field: "exposed" | "name" | "vision" | "context" | "output";
  value: string | boolean;
}

export interface ModelTableProps {
  rows: ModelTableRow[];
  /** 是否渲染倍率列(渠道页认可 rate 时才开)。 */
  showRate?: boolean;
  disabled?: boolean;
  emptyText?: string;
  onEdit: (e: ModelTableEdit) => void;
  /**
   * 「这一格改完了」回调 —— 实时保存用(用户 2026-10-31 定案:四页删除保存按钮)。
   *
   * 触发时机刻意分两类:
   * - **勾选框 / 视觉框**:`onEdit` 之后立刻 `onCommit`(点一下就是一个完整动作);
   * - **文本/数字输入**:只在 **blur 或回车** 时 `onCommit` —— 每敲一个字符就落库
   *   会把「1024」中间态(「1」「10」「102」)全部写进库,还会让上游看到一串脏值。
   */
  onCommit?: (e: ModelTableEdit) => void;
  /**
   * 名称/上下文/最大输出/视觉四列只显示、不落库(默认 false)。
   *
   * 给「目录即上游、勾选才登记 real_model」的页面用:未勾选的行在库里根本没有
   * 对应记录,摆一个能改的输入框等于骗人 —— 改完没地方存。启用列仍可点。
   * ※ 现在的 Qoder 页已改成「勾上就建行 + 实时保存」,所以它**不再**用这个开关。
   */
  plainColumns?: boolean;
  /** 左上工具栏(来源标签/勾选计数/刷新说明)。 */
  toolbar?: React.ReactNode;
  /** 右上操作区(撤销/保存等)。已不作为主要交互 —— 四页都实时保存。 */
  actions?: React.ReactNode;
}

/** 空串代替 null 显示(输入框 placeholder 回退)。 */
function ph(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

export function ModelTable({
  rows,
  showRate = true,
  disabled = false,
  emptyText = "未查到模型目录(点「刷新」从上游拉一次)",
  onEdit,
  onCommit,
  plainColumns = false,
  toolbar,
  actions,
}: ModelTableProps): React.JSX.Element {
  /**
   * 文本/数字输入:改的时候只走 `onEdit`(页面记草稿),**离开焦点或回车**才 `onCommit`。
   *
   * 为什么不在 `onChange` 里提交:每敲一个字符落一次库,「1024」会写进
   * 「1」「10」「102」三个中间态;上游/调度会看到一串脏值,库也要多写三次。
   * 值没变也提交一次没关系 —— 页面侧按「与后端快照比」判重,不会有写放大。
   */
  function editOnChange(e: ModelTableEdit): void {
    onEdit(e);
  }

  function commitOnBlur(e: ModelTableEdit): void {
    if (onCommit !== undefined) onCommit(e);
  }

  if (rows.length === 0) {
    return (
      <div className="models-block">
        {toolbar ? <div className="models-toolbar">{toolbar}</div> : null}
        <p className="empty">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="models-block">
      <div className="models-toolbar">
        <div className="models-toolbar-left">{toolbar}</div>
        {actions ? <div className="models-toolbar-right">{actions}</div> : null}
      </div>
      <table className="models-table">
        <thead>
          <tr>
            <th className="models-col-enable">启用</th>
            <th>模型</th>
            <th>名称</th>
            {showRate ? <th>倍率</th> : null}
            <th>上下文窗口</th>
            <th>最大输出</th>
            <th>视觉</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const locked = disabled || !row.exposed;
            const cls = [
              row.exposed ? "on" : "",
              row.available === false ? "off" : "",
              row.callable === false ? "nocall" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <tr key={row.id ?? i} className={cls}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`启用:${row.id}`}
                    checked={row.exposed}
                    disabled={disabled || row.available === false}
                    onChange={(ev) => {
                      const e: ModelTableEdit = { id: row.id, field: "exposed", value: ev.target.checked };
                      editOnChange(e);
                      commitOnBlur(e); // 勾选是一次完整动作 → 立刻落库
                    }}
                  />
                </td>
                <td>
                  <code title={row.fullId || row.id}>{row.id}</code>
                  {row.callable === false ? (
                    <span className="tag-warn" title="上游目录列了它,但不在 chat 端点认的名单里,可能调不通">
                      可能不可用
                    </span>
                  ) : null}
                </td>
                <td>
                  {plainColumns ? (
                    <span className="plain-cell">{row.name || "—"}</span>
                  ) : (
                    <input
                      className="input name"
                      type="text"
                      value={row.name}
                      placeholder={row.id}
                      disabled={locked}
                      onChange={(ev) => editOnChange({ id: row.id, field: "name", value: ev.target.value })}
                      onBlur={() => commitOnBlur({ id: row.id, field: "name", value: row.name })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") ev.currentTarget.blur();
                      }}
                    />
                  )}
                </td>
                {showRate ? (
                  <td className="rate-cell">
                    {row.rate != null ? <span className="mono">x{row.rate}</span> : <span className="na">—</span>}
                  </td>
                ) : null}
                <td>
                  {plainColumns ? (
                    <span className="plain-cell">{ph(row.defaultContext) || "—"}</span>
                  ) : (
                    <input
                      className="input num"
                      type="number"
                      min={0}
                      value={row.context}
                      placeholder={ph(row.defaultContext) || "—"}
                      disabled={locked}
                      onChange={(ev) => editOnChange({ id: row.id, field: "context", value: ev.target.value })}
                      onBlur={() => commitOnBlur({ id: row.id, field: "context", value: row.context })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") ev.currentTarget.blur();
                      }}
                    />
                  )}
                </td>
                <td>
                  {plainColumns ? (
                    <span className="plain-cell">{ph(row.defaultOutput) || "—"}</span>
                  ) : (
                    <input
                      className="input num"
                      type="number"
                      min={0}
                      value={row.output}
                      placeholder={ph(row.defaultOutput) || "—"}
                      disabled={locked}
                      onChange={(ev) => editOnChange({ id: row.id, field: "output", value: ev.target.value })}
                      onBlur={() => commitOnBlur({ id: row.id, field: "output", value: row.output })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") ev.currentTarget.blur();
                      }}
                    />
                  )}
                </td>
                <td>
                  <span className="vision-cell">
                    <input
                      type="checkbox"
                      aria-label={`视觉:${row.id}`}
                      checked={row.vision}
                      disabled={locked || plainColumns}
                      onChange={(ev) => {
                        const e: ModelTableEdit = { id: row.id, field: "vision", value: ev.target.checked };
                        editOnChange(e);
                        commitOnBlur(e); // 勾选是一次完整动作 → 立刻落库
                      }}
                    />
                    {row.visionUpstream ? <span className="dot" title="上游原生视觉模型">●</span> : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ModelTable;
