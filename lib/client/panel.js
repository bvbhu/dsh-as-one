import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { App } from "@as-one/panel-ui";
export function AsOnePanelPage() {
    return (_jsx("div", { className: "asone-panel", children: _jsx(App, {}) }));
}
/** 侧栏图标:圆环内一条横线,取「一」(One)之意;纯内联 SVG,无外部图标库。 */
export function AsOnePanelIcon({ size = 16 }) {
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", children: [_jsx("circle", { cx: "12", cy: "12", r: "9.4", stroke: "currentColor", strokeWidth: "1.6" }), _jsx("path", { d: "M6.5 12h11", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round" })] }));
}
//# sourceMappingURL=panel.js.map