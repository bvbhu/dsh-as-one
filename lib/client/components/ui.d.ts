/**
 * 共用小部件:徽章、条形、卡片骨架、空态。
 */
/** 状态徽章(ok=成功/健康;bad=失败/冷却;warn=降级;dim=未启用/无样本)。 */
export declare function StatusBadge({ tone, children }: {
    tone: "ok" | "bad" | "warn" | "dim";
    children: React.ReactNode;
}): React.JSX.Element;
/** 条形(用量占比/凭据覆盖等百分比展示;value 取值 0..1,null 渲染 N/A 短横)。 */
export declare function Bar({ value, tone }: {
    value: number | null;
    tone?: "blue" | "green" | "orange";
}): React.JSX.Element;
/** 页面区块卡片(标题 + 内容)。 */
export declare function Card({ title, extra, children }: {
    title: string;
    extra?: React.ReactNode;
    children: React.ReactNode;
}): React.JSX.Element;
/** 空态提示。 */
export declare function Empty({ text }: {
    text: string;
}): React.JSX.Element;
/** 加载态提示。 */
export declare function Loading({ text }: {
    text?: string;
}): React.JSX.Element;
