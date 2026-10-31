import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 设置页(只读):网关关键配置、请求日志落盘状态、设置段(external_refresh/
 * scheduler/retry/ui)。本阶段纯展示,不提供编辑保存。
 * 移植自 apps/electron/src/renderer/src/pages/SettingsPage.tsx。
 */
import React from "react";
import { api } from "../api";
import { fmtBytes } from "../format";
import { Card, Empty, Loading, StatusBadge } from "../components/ui";
function ValueText({ value }) {
    if (value === null || value === undefined) {
        return _jsx("span", { className: "asone-dim-text", children: "\u672A\u8BBE\u7F6E" });
    }
    const text = typeof value === "string" ? value : JSON.stringify(value);
    const isLong = typeof value === "string" && value.length > 60;
    if (isLong) {
        return _jsx("code", { className: "asone-code-block", children: text });
    }
    return _jsx("code", { className: "asone-mono", children: text });
}
export function SettingsPage() {
    const [snap, setSnap] = React.useState(null);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        let alive = true;
        api
            .getSettings()
            .then((s) => {
            if (alive) {
                setSnap(s);
            }
        })
            .catch((e) => {
            if (alive) {
                setError(e instanceof Error ? e.message : String(e));
            }
        });
        return () => {
            alive = false;
        };
    }, []);
    if (error !== null && snap === null) {
        return _jsx(Empty, { text: `加载失败:${error}` });
    }
    if (snap === null) {
        return _jsx(Loading, {});
    }
    return (_jsxs("div", { className: "asone-page", children: [_jsx(Card, { title: "\u7F51\u5173", extra: _jsx("span", { className: "asone-dim-text", children: "POST /as-one/api/getSettings(\u5408\u6210\u89C6\u56FE)" }), children: _jsxs("div", { className: "asone-kv-grid", children: [_jsx("span", { className: "asone-k", children: "\u7F51\u5173\u5730\u5740" }), _jsx("span", { className: "asone-v asone-mono", children: snap.gateway.base_url }), _jsx("span", { className: "asone-k", children: "\u7AEF\u53E3" }), _jsx("span", { className: "asone-v asone-mono", children: snap.gateway.port }), _jsx("span", { className: "asone-k", children: "\u9274\u6743" }), _jsx("span", { className: "asone-v", children: snap.gateway.auth_required ? _jsx(StatusBadge, { tone: "ok", children: "\u5DF2\u542F\u7528(ONE_API_KEY)" }) : _jsx(StatusBadge, { tone: "bad", children: "\u672A\u542F\u7528:\u6240\u6709\u8BF7\u6C42\u653E\u884C" }) }), _jsx("span", { className: "asone-k", children: "\u7F51\u5173 key(master_key)" }), _jsx("span", { className: "asone-v asone-mono", children: snap.master_key ?? _jsx("span", { className: "asone-dim-text", children: "\u672A\u8BBE\u7F6E" }) })] }) }), _jsx(Card, { title: "\u8BF7\u6C42\u65E5\u5FD7", extra: _jsx("span", { className: "asone-dim-text", children: "POST /as-one/api/getRequestLogStatus" }), children: _jsxs("div", { className: "asone-kv-grid", children: [_jsx("span", { className: "asone-k", children: "\u8BB0\u5F55\u5F00\u5173" }), _jsx("span", { className: "asone-v", children: snap.request_log.enabled ? _jsx(StatusBadge, { tone: "ok", children: "\u5F00\u542F" }) : _jsx(StatusBadge, { tone: "dim", children: "\u5173\u95ED" }) }), _jsx("span", { className: "asone-k", children: "\u5185\u5BB9\u6A21\u5F0F" }), _jsx("span", { className: "asone-v", children: snap.request_log.content_modes.find((m) => m.value === snap.request_log.content_mode)?.label ?? snap.request_log.content_mode }), _jsx("span", { className: "asone-k", children: "\u843D\u76D8\u8DEF\u5F84" }), _jsx("span", { className: "asone-v asone-mono", children: snap.request_log.path ?? "—" }), _jsx("span", { className: "asone-k", children: "\u5DF2\u5199\u5165" }), _jsxs("span", { className: "asone-v", children: [snap.request_log.counters.written ?? 0, " \u6761 \u00B7 ", fmtBytes(snap.request_log.size_bytes)] }), _jsx("span", { className: "asone-k", children: "\u6700\u8FD1\u9519\u8BEF" }), _jsx("span", { className: "asone-v", children: snap.request_log.last_error ? _jsx(StatusBadge, { tone: "bad", children: snap.request_log.last_error }) : _jsx("span", { className: "asone-dim-text", children: "\u65E0" }) })] }) }), snap.sections.map((section) => (_jsx(Card, { title: section.label, extra: _jsx("span", { className: "asone-dim-text asone-mono", children: section.key }), children: _jsxs("table", { className: "asone-tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u914D\u7F6E\u952E" }), _jsx("th", { children: "\u503C" })] }) }), _jsx("tbody", { children: section.items.map((item) => (_jsxs("tr", { children: [_jsx("td", { className: "asone-mono", children: item.key }), _jsx("td", { children: _jsx(ValueText, { value: item.value }) })] }, item.key))) })] }) }, section.key))), _jsx("p", { className: "asone-page-note", children: "\u8BBE\u7F6E\u9875\u5F53\u524D\u4E3A\u53EA\u8BFB\u89C6\u56FE;\u8BBE\u7F6E\u7F16\u8F91\u4E0E diff \u4FDD\u5B58\u5C06\u968F\u540E\u7EED\u6279\u6B21\u63A5\u5165\u3002" })] }));
}
//# sourceMappingURL=SettingsPage.js.map