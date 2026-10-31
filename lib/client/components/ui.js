import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 共用小部件:徽章、条形、卡片骨架、空态。
 */
/** 状态徽章(ok=成功/健康;bad=失败/冷却;warn=降级;dim=未启用/无样本)。 */
export function StatusBadge({ tone, children }) {
    return _jsx("span", { className: `asone-badge asone-badge-${tone}`, children: children });
}
/** 条形(用量占比/凭据覆盖等百分比展示;value 取值 0..1,null 渲染 N/A 短横)。 */
export function Bar({ value, tone = "blue" }) {
    if (value === null || !Number.isFinite(value)) {
        return _jsx("span", { className: "asone-bar-na", children: "\u2014" });
    }
    const pct = Math.max(0, Math.min(1, value)) * 100;
    return (_jsx("div", { className: "asone-bar", role: "img", "aria-label": `占比 ${pct.toFixed(1)}%`, children: _jsx("div", { className: `asone-bar-fill asone-bar-${tone}`, style: { width: `${pct.toFixed(1)}%` } }) }));
}
/** 页面区块卡片(标题 + 内容)。 */
export function Card({ title, extra, children }) {
    return (_jsxs("section", { className: "asone-card", children: [_jsxs("div", { className: "asone-card-head", children: [_jsx("h2", { children: title }), extra ? _jsx("div", { className: "asone-card-extra", children: extra }) : null] }), children] }));
}
/** 空态提示。 */
export function Empty({ text }) {
    return _jsx("div", { className: "asone-empty", children: text });
}
/** 加载态提示。 */
export function Loading({ text = "加载中…" }) {
    return _jsx("div", { className: "asone-empty asone-loading", children: text });
}
//# sourceMappingURL=ui.js.map