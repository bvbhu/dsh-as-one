import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 用量统计页:KPI 卡(请求量/成功率/token/缓存命中/活跃天数)+
 * 供应商用量条形 + 模型用量表。聚合视图;纯 CSS 条形,不引入图表库。
 * 移植自 apps/electron/src/renderer/src/pages/StatsPage.tsx。
 */
import React from "react";
import { api } from "../api";
import { fmtCount, fmtInt, fmtPct } from "../format";
import { Bar, Card, Empty, Loading } from "../components/ui";
function Kpi({ label, value, sub }) {
    return (_jsxs("div", { className: "asone-kpi", children: [_jsx("div", { className: "asone-kpi-label", children: label }), _jsx("div", { className: "asone-kpi-value", children: value }), sub ? _jsx("div", { className: "asone-kpi-sub", children: sub }) : null] }));
}
export function StatsPage() {
    const [usage, setUsage] = React.useState(null);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        let alive = true;
        api
            .getUsageSummary()
            .then((u) => {
            if (alive) {
                setUsage(u);
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
    if (error !== null && usage === null) {
        return _jsx(Empty, { text: `加载失败:${error}` });
    }
    if (usage === null) {
        return _jsx(Loading, {});
    }
    const t = usage.totals;
    const successRate = t.requests > 0 ? (t.requests - t.fails) / t.requests : null;
    const maxTokens = Math.max(...usage.providers.map((p) => p.tokens), 0);
    return (_jsxs("div", { className: "asone-page", children: [_jsxs("div", { className: "asone-kpi-grid", children: [_jsx(Kpi, { label: "\u603B Tokens", value: fmtCount(t.tokens), sub: `输入 ${fmtCount(t.prompt_tokens)} · 输出 ${fmtCount(t.completion_tokens)}` }), _jsx(Kpi, { label: "\u8BF7\u6C42\u91CF", value: fmtInt(t.requests), sub: `失败 ${fmtInt(t.fails)}` }), _jsx(Kpi, { label: "\u6210\u529F\u7387", value: fmtPct(successRate), sub: `错误率 ${fmtPct(t.requests > 0 ? t.fails / t.requests : null)}` }), _jsx(Kpi, { label: "\u7F13\u5B58\u547D\u4E2D", value: fmtPct(t.cache_hit_rate), sub: `命中 ${fmtCount(t.cached_tokens)} tokens` }), _jsx(Kpi, { label: "\u6D3B\u8DC3\u5929\u6570", value: fmtInt(t.active_days), sub: `${usage.from ?? "?"} → ${usage.last_day ?? usage.to ?? "?"}` })] }), _jsx(Card, { title: "\u5404\u4F9B\u5E94\u5546\u7528\u91CF", extra: _jsx("span", { className: "asone-dim-text", children: "GET /as-one/api/pages/metrics/history" }), children: usage.providers.length === 0 ? (_jsx(Empty, { text: "\u533A\u95F4\u5185\u65E0\u4F9B\u5E94\u5546\u7528\u91CF\u6570\u636E\u3002" })) : (_jsxs("table", { className: "asone-tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u4F9B\u5E94\u5546" }), _jsx("th", { children: "Tokens" }), _jsx("th", { className: "asone-bar-col", children: "\u5360\u6BD4" }), _jsx("th", { className: "asone-num", children: "\u8BF7\u6C42\u6570" }), _jsx("th", { className: "asone-num", children: "\u5931\u8D25" }), _jsx("th", { className: "asone-num", children: "\u4EFD\u989D" })] }) }), _jsx("tbody", { children: usage.providers.map((p) => (_jsxs("tr", { children: [_jsx("td", { className: "asone-mono", children: p.provider }), _jsx("td", { className: "asone-num", children: fmtCount(p.tokens) }), _jsx("td", { className: "asone-bar-col", children: _jsx(Bar, { value: maxTokens > 0 ? p.tokens / maxTokens : null }) }), _jsx("td", { className: "asone-num", children: fmtInt(p.requests) }), _jsx("td", { className: "asone-num", children: fmtInt(p.fails) }), _jsx("td", { className: "asone-num", children: fmtPct(p.percent) })] }, p.provider))) })] })) }), _jsxs(Card, { title: "\u6A21\u578B\u7528\u91CF", extra: _jsx("span", { className: "asone-dim-text", children: "\u6309\u771F\u5B9E\u6A21\u578B\u805A\u5408(group=model)" }), children: [usage.models.length === 0 ? (_jsx(Empty, { text: "\u533A\u95F4\u5185\u65E0\u6A21\u578B\u7528\u91CF\u6570\u636E\u3002" })) : (_jsxs("table", { className: "asone-tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u6A21\u578B" }), _jsx("th", { children: "\u4F9B\u5E94\u5546" }), _jsx("th", { className: "asone-num", children: "Tokens" }), _jsx("th", { className: "asone-num", children: "\u8BF7\u6C42\u6570" }), _jsx("th", { className: "asone-num", children: "\u5931\u8D25" }), _jsx("th", { className: "asone-num", children: "\u7F13\u5B58\u547D\u4E2D" })] }) }), _jsx("tbody", { children: usage.models.map((m) => (_jsxs("tr", { children: [_jsx("td", { className: "asone-mono", children: m.model }), _jsx("td", { className: "asone-mono", children: m.provider }), _jsx("td", { className: "asone-num", children: fmtCount(m.tokens) }), _jsx("td", { className: "asone-num", children: fmtInt(m.requests) }), _jsx("td", { className: "asone-num", children: fmtInt(m.fails) }), _jsx("td", { className: "asone-num", children: fmtPct(m.cache_hit_rate) })] }, m.model))) })] })), _jsxs("p", { className: "asone-hint", children: ["\u7EDF\u8BA1\u622A\u81F3 ", usage.last_day ?? usage.to ?? "—", " \u00B7 \u6570\u636E\u6E90 ", usage.source, " \u00B7 \u751F\u6210\u4E8E ", usage.generated_at ?? "—", "\u3002"] })] })] }));
}
//# sourceMappingURL=StatsPage.js.map