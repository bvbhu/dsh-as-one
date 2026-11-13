/**
 * 共用小部件:徽章、条形、卡片骨架、空态。
 */

/** 状态徽章(ok=成功/健康;bad=失败/冷却;warn=降级;dim=未启用/无样本)。 */
export function StatusBadge({ tone, children }: { tone: "ok" | "bad" | "warn" | "dim"; children: React.ReactNode }): React.JSX.Element {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** 条形(用量占比/凭据覆盖等百分比展示;value 取值 0..1,null 渲染 N/A 短横)。 */
export function Bar({ value, tone = "blue" }: { value: number | null; tone?: "blue" | "green" | "orange" }): React.JSX.Element {
  if (value === null || !Number.isFinite(value)) {
    return <span className="bar-na">—</span>;
  }
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="bar" role="img" aria-label={`占比 ${pct.toFixed(1)}%`}>
      <div className={`bar-fill bar-${tone}`} style={{ width: `${pct.toFixed(1)}%` }} />
    </div>
  );
}

/** 页面区块卡片(标题 + 内容)。 */
export function Card({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {extra ? <div className="card-extra">{extra}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** 空态提示。 */
export function Empty({ text }: { text: string }): React.JSX.Element {
  return <div className="empty">{text}</div>;
}

/** 加载态提示。 */
export function Loading({ text = "加载中…" }: { text?: string }): React.JSX.Element {
  return <div className="empty loading">{text}</div>;
}
