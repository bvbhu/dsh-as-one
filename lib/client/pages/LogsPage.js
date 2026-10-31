import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * 日志页:最近请求列表(时间、模型、provider、状态、耗时、错误摘要)。
 * 移植自 apps/electron/src/renderer/src/pages/LogsPage.tsx;
 * 数据来自宿主 POST /as-one/api/getRecentRequests。
 */
import React from "react";
import { api } from "../api";
import { fmtSecFromMs } from "../format";
import { Card, Empty, Loading, StatusBadge } from "../components/ui";
/** finished_s_ago(秒前)→ 面向人的"刚刚/N 分钟前/N 小时前"。 */
function fmtAgo(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v)))
        return "—";
    const s = Math.max(0, Math.floor(Number(v)));
    if (s < 60)
        return `${s} 秒前`;
    if (s < 3600)
        return `${Math.floor(s / 60)} 分钟前`;
    return `${Math.floor(s / 3600)} 小时前`;
}
function RequestRow({ r }) {
    return (_jsxs("tr", { children: [_jsxs("td", { className: "asone-mono", children: ["#", r.conv, "#", r.seq] }), _jsx("td", { className: "asone-mono", children: r.logical_model ?? "直连" }), _jsx("td", { className: "asone-mono", children: r.real_model_id }), _jsx("td", { className: "asone-mono", children: r.endpoint_id ?? "—" }), _jsx("td", { children: r.ok ? _jsx(StatusBadge, { tone: "ok", children: r.status === null ? "成功" : r.status }) : _jsx(StatusBadge, { tone: "bad", children: r.status === null ? "失败" : r.status }) }), _jsx("td", { className: "asone-mono asone-err-cell", title: r.error ?? undefined, children: r.error ?? "" }), _jsx("td", { className: "asone-num", children: fmtSecFromMs(r.latency_ms) }), _jsx("td", { className: "asone-num", children: fmtSecFromMs(r.ttft_ms) }), _jsx("td", { children: fmtAgo(r.finished_s_ago) })] }));
}
export function LogsPage() {
    const [rows, setRows] = React.useState(null);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const data = await api.getRecentRequests();
                if (alive) {
                    setRows(data);
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
    if (error !== null && rows === null) {
        return _jsx(Empty, { text: `加载失败:${error}` });
    }
    if (rows === null) {
        return _jsx(Loading, {});
    }
    const failCount = rows.filter((r) => !r.ok).length;
    return (_jsx("div", { className: "asone-page", children: _jsxs(Card, { title: "\u6700\u8FD1\u8BF7\u6C42", extra: _jsxs("span", { className: "asone-dim-text", children: ["POST /as-one/api/getRecentRequests \u00B7 ", rows.length, " \u6761 \u00B7 \u5931\u8D25 ", failCount, " \u6761 \u00B7 5 \u79D2\u81EA\u52A8\u5237\u65B0"] }), children: [rows.length === 0 ? (_jsx(Empty, { text: "\u6682\u65E0\u8BF7\u6C42\u8BB0\u5F55\u3002" })) : (_jsxs("table", { className: "asone-tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "#\u4F1A\u8BDD#\u5E8F\u53F7" }), _jsx("th", { children: "\u903B\u8F91\u6A21\u578B" }), _jsx("th", { children: "\u771F\u5B9E\u6A21\u578B" }), _jsx("th", { children: "\u7AEF\u70B9" }), _jsx("th", { children: "\u72B6\u6001" }), _jsx("th", { children: "\u9519\u8BEF\u6458\u8981" }), _jsx("th", { className: "asone-num", children: "\u8017\u65F6(s)" }), _jsx("th", { className: "asone-num", children: "TTFT(s)" }), _jsx("th", { children: "\u5B8C\u6210\u65F6\u95F4" })] }) }), _jsx("tbody", { children: rows.map((r) => (_jsx(RequestRow, { r: r }, `${r.conv}-${r.seq}`))) })] })), _jsx("p", { className: "asone-hint", children: "\u4FDD\u7559\u6761\u6570\u7531\u8BBE\u7F6E ui.recent_limit \u63A7\u5236;\u8017\u65F6/TTFT \u5355\u4F4D\u4E3A\u79D2\u3002\u5931\u8D25\u539F\u56E0\u524D\u7F00\u4E3A\u4E0A\u6E38\u9519\u8BEF\u7C7B\u578B (auth/rate_limit/upstream/timeout \u7B49)\u3002" })] }) }));
}
//# sourceMappingURL=LogsPage.js.map