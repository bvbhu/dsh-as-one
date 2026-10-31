import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * 总览页(状态行 + 运行中在途租约 + 供应商一览)。
 * 移植自 apps/electron/src/renderer/src/pages/OverviewPage.tsx;
 * api 从 IPC 换成 fetch 层(./api 的 createFetchApi 实例)。
 */
import React from "react";
import { api } from "../api";
import { fmtDuration } from "../format";
import { Bar, Card, Empty, Loading, StatusBadge } from "../components/ui";
const KIND_LABEL = {
    channel: "渠道",
    endpoint: "端点",
};
function ProviderRow({ p }) {
    return (_jsxs("tr", { children: [_jsx("td", { className: "asone-mono", children: p.provider }), _jsx("td", { children: KIND_LABEL[p.kind] ?? p.kind }), _jsx("td", { className: "asone-mono", children: p.base_url ?? "—" }), _jsx("td", { className: "asone-num", children: p.model_count }), _jsx("td", { className: "asone-num", children: p.count }), _jsx("td", { children: p.login === null ? (_jsx("span", { className: "asone-dim-text", children: "\u2014" })) : p.login.logged_in ? (_jsx(StatusBadge, { tone: "ok", children: "\u5DF2\u767B\u5F55" })) : (_jsx(StatusBadge, { tone: "bad", children: "\u672A\u767B\u5F55" })) }), _jsx("td", { children: p.readable ? _jsx(StatusBadge, { tone: "ok", children: "\u6B63\u5E38" }) : _jsx(StatusBadge, { tone: "bad", children: p.error ?? "不可读" }) })] }));
}
function LeaseRow({ lease }) {
    return (_jsxs("tr", { children: [_jsxs("td", { className: "asone-mono", children: ["#", lease.conv, "#", lease.seq] }), _jsx("td", { className: "asone-mono", children: lease.real_model_id }), _jsx("td", { className: "asone-mono", children: lease.endpoint_id ?? "—" }), _jsx("td", { children: lease.stream ? _jsx(StatusBadge, { tone: "ok", children: "\u6D41\u5F0F" }) : _jsx(StatusBadge, { tone: "dim", children: "\u975E\u6D41\u5F0F" }) }), _jsx("td", { className: "asone-num", children: fmtDuration(lease.elapsed_s) })] }));
}
export function OverviewPage() {
    const [status, setStatus] = React.useState(null);
    const [runtime, setRuntime] = React.useState(null);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const [st, rt] = await Promise.all([api.getStatus(), api.getRuntime()]);
                if (alive) {
                    setStatus(st);
                    setRuntime(rt);
                    setError(null);
                }
            }
            catch (e) {
                if (alive) {
                    setError(e instanceof Error ? e.message : String(e));
                }
            }
        };
        void load();
        const timer = window.setInterval(load, 5000);
        return () => {
            alive = false;
            window.clearInterval(timer);
        };
    }, []);
    if (error !== null && status === null) {
        return _jsx(Empty, { text: `加载失败:${error}` });
    }
    if (status === null || runtime === null) {
        return _jsx(Loading, {});
    }
    return (_jsxs("div", { className: "asone-page", children: [_jsx("div", { className: "asone-status-line", children: status.ready ? (_jsxs(_Fragment, { children: [_jsx(StatusBadge, { tone: "ok", children: "\u7F51\u5173\u8FD0\u884C\u4E2D" }), _jsxs("span", { children: ["\u8FD0\u884C ", _jsx("b", { children: fmtDuration(status.uptime_s) })] }), _jsxs("span", { children: ["\u53EF\u7528 ", _jsx("b", { children: status.healthy_count }), " \u00B7 \u51B7\u5374 ", _jsx("b", { children: status.cooldown_count })] }), _jsxs("span", { children: ["\u90E8\u7F72 ", _jsx("b", { children: status.deployments })] })] })) : (_jsxs(_Fragment, { children: [_jsx(StatusBadge, { tone: "bad", children: "\u672A\u5C31\u7EEA" }), _jsx("span", { children: status.reason ?? "原因未知" })] })) }), _jsxs(Card, { title: "\u8FD0\u884C\u4E2D(\u5728\u9014\u8BF7\u6C42)", children: [runtime.leases.length === 0 ? (_jsx(Empty, { text: "\u7F51\u5173\u7A7A\u8F6C:\u5F53\u524D\u6CA1\u6709\u5728\u9014\u8BF7\u6C42\u3002" })) : (_jsxs("table", { className: "asone-tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u4F1A\u8BDD#\u5E8F\u53F7" }), _jsx("th", { children: "\u771F\u5B9E\u6A21\u578B" }), _jsx("th", { children: "\u7AEF\u70B9" }), _jsx("th", { children: "\u6A21\u5F0F" }), _jsx("th", { className: "asone-num", children: "\u5DF2\u8FDB\u884C" })] }) }), _jsx("tbody", { children: runtime.leases.map((lease) => (_jsx(LeaseRow, { lease: lease }, `${lease.conv}-${lease.seq}`))) })] })), _jsxs("p", { className: "asone-hint", children: ["\u5171 ", runtime.in_flight_total, " \u4E2A\u5728\u9014\u8BF7\u6C42 \u00B7 \u4F1A\u8BDD\u5E8F\u53F7\u4E3A\u9762\u677F\u5E8F\u53F7(\u91CD\u542F\u6E05\u96F6),\u4E0D\u542B\u4F1A\u8BDD\u6807\u8BC6\u3002"] })] }), _jsxs(Card, { title: "\u4F9B\u5E94\u5546\u4E00\u89C8", extra: _jsx("span", { className: "asone-dim-text", children: "GET /as-one/api/pages/providers" }), children: [_jsxs("table", { className: "asone-tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u4F9B\u5E94\u5546" }), _jsx("th", { children: "\u7C7B\u578B" }), _jsx("th", { children: "API \u5730\u5740" }), _jsx("th", { className: "asone-num", children: "\u6A21\u578B\u6570" }), _jsx("th", { className: "asone-num", children: "\u8D26\u6237\u6570" }), _jsx("th", { children: "\u767B\u5F55\u6001" }), _jsx("th", { children: "\u72B6\u6001" })] }) }), _jsx("tbody", { children: status.providers.map((p) => (_jsx(ProviderRow, { p: p }, p.provider))) })] }), _jsxs("div", { className: "asone-bar-legend", children: [_jsx("span", { className: "asone-legend-item", children: "\u51ED\u636E\u5C31\u7EEA:" }), status.providers.map((p) => (_jsxs("span", { className: "asone-legend-item", children: [_jsx("span", { className: "asone-legend-name", children: p.provider }), _jsx(Bar, { value: p.count > 0 ? p.accounts.filter((a) => a.has_key).length / p.count : null })] }, p.provider)))] })] })] }));
}
//# sourceMappingURL=OverviewPage.js.map