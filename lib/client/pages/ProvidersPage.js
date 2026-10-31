import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 渠道与账户页:渠道/供应商列表、账户启用与停用、凭据状态(只读)。
 * 写操作仅账户启停;凭据(密钥/指纹/来源/登录态)一律只读展示。
 * 移植自 apps/electron/src/renderer/src/pages/ProvidersPage.tsx。
 */
import React from "react";
import { api } from "../api";
import { Card, Empty, Loading, StatusBadge } from "../components/ui";
const KIND_LABEL = {
    channel: "渠道",
    endpoint: "端点",
};
function CredentialDot({ ok, title }) {
    return _jsx("span", { className: `asone-cred-dot ${ok ? "asone-cred-dot-ok" : "asone-cred-dot-bad"}`, title: title });
}
function AccountRow({ provider, account, onToggle }) {
    const [busy, setBusy] = React.useState(false);
    const toggle = async () => {
        setBusy(true);
        try {
            onToggle(provider, account.index, !account.enabled);
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("tr", { className: account.enabled ? "" : "asone-row-dim", children: [_jsxs("td", { className: "asone-mono", children: ["#", account.index] }), _jsx("td", { children: account.label || _jsx("span", { className: "asone-dim-text", children: "\u672A\u547D\u540D" }) }), _jsx("td", { className: "asone-mono", children: account.env_var }), _jsx("td", { children: account.has_key ? (_jsxs("span", { className: "asone-cred-cell", children: [_jsx(CredentialDot, { ok: true, title: "\u5DF2\u914D\u7F6E\u5BC6\u94A5" }), _jsx("span", { className: "asone-mono", children: account.key_fp ?? "已配置" })] })) : (_jsxs("span", { className: "asone-cred-cell", children: [_jsx(CredentialDot, { ok: false, title: "\u672A\u914D\u7F6E\u5BC6\u94A5" }), _jsx("span", { className: "asone-dim-text", children: "\u672A\u914D\u7F6E" })] })) }), _jsx("td", { children: account.source }), _jsx("td", { children: _jsx("button", { type: "button", className: "asone-btn asone-btn-sm", disabled: busy || !account.has_key, onClick: () => {
                        void toggle();
                    }, children: account.enabled ? "停用" : "启用" }) })] }));
}
function ProviderCardView({ p, onToggle }) {
    const credOk = p.base_url !== null && p.accounts.some((a) => a.has_key);
    return (_jsxs(Card, { title: `${p.provider}(${KIND_LABEL[p.kind] ?? p.kind})`, extra: _jsxs("span", { className: "asone-card-badges", children: [_jsx(CredentialDot, { ok: credOk, title: credOk ? "凭据就绪" : "缺少 API 地址或密钥" }), _jsxs("span", { className: "asone-dim-text", children: [p.model_count, " \u4E2A\u6A21\u578B \u00B7 ", p.count, " \u4E2A\u8D26\u6237"] })] }), children: [_jsxs("div", { className: "asone-kv-grid", children: [_jsx("span", { className: "asone-k", children: "API \u5730\u5740" }), _jsx("span", { className: "asone-v asone-mono", children: p.base_url ?? "未配置" }), _jsx("span", { className: "asone-k", children: "\u73AF\u5883\u53D8\u91CF\u524D\u7F00" }), _jsx("span", { className: "asone-v asone-mono", children: p.env_prefix }), _jsx("span", { className: "asone-k", children: "\u767B\u5F55\u6001" }), _jsx("span", { className: "asone-v", children: p.login === null ? (_jsx("span", { className: "asone-dim-text", children: "\u7AEF\u70B9\u7C7B\u578B\u65E0\u767B\u5F55\u6001" })) : p.login.logged_in ? (_jsx(StatusBadge, { tone: "ok", children: "\u5DF2\u767B\u5F55" })) : (_jsxs("span", { children: [_jsx(StatusBadge, { tone: "bad", children: "\u672A\u767B\u5F55" }), p.login.reason ? _jsxs("span", { className: "asone-dim-text", children: [" ", p.login.reason] }) : null] })) }), _jsx("span", { className: "asone-k", children: "\u6E20\u9053\u72B6\u6001" }), _jsx("span", { className: "asone-v", children: p.readable ? _jsx(StatusBadge, { tone: "ok", children: "\u6B63\u5E38" }) : _jsx(StatusBadge, { tone: "bad", children: p.error ?? "不可读" }) })] }), p.accounts.length === 0 ? (_jsx(Empty, { text: "\u8BE5\u4F9B\u5E94\u5546\u6CA1\u6709\u5DF2\u914D\u7F6E\u8D26\u6237\u3002" })) : (_jsxs("table", { className: "asone-tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u5E8F\u53F7" }), _jsx("th", { children: "\u540D\u79F0" }), _jsx("th", { children: "\u73AF\u5883\u53D8\u91CF" }), _jsx("th", { children: "\u51ED\u636E\u72B6\u6001(\u6307\u7EB9)" }), _jsx("th", { children: "\u6765\u6E90" }), _jsx("th", { children: "\u64CD\u4F5C" })] }) }), _jsx("tbody", { children: p.accounts.map((a) => (_jsx(AccountRow, { provider: p.provider, account: a, onToggle: onToggle }, a.index))) })] }))] }));
}
export function ProvidersPage() {
    const [providers, setProviders] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [notice, setNotice] = React.useState(null);
    React.useEffect(() => {
        let alive = true;
        api
            .listProviders()
            .then((rows) => {
            if (alive) {
                setProviders(rows);
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
    const toggle = (provider, index, enabled) => {
        void api
            .setAccountEnabled(provider, index, enabled)
            .then(() => api.listProviders())
            .then((rows) => {
            setProviders(rows);
            setNotice(`${provider} 账户 #${index} 已${enabled ? "启用" : "停用"}`);
            window.setTimeout(() => setNotice(null), 3000);
        })
            .catch((e) => {
            setError(e instanceof Error ? e.message : String(e));
        });
    };
    if (error !== null && providers === null) {
        return _jsx(Empty, { text: `加载失败:${error}` });
    }
    if (providers === null) {
        return _jsx(Loading, {});
    }
    return (_jsxs("div", { className: "asone-page", children: [_jsx("p", { className: "asone-page-note", children: "\u51ED\u636E(\u5BC6\u94A5\u3001\u6307\u7EB9\u3001\u767B\u5F55\u6001)\u4E3A\u53EA\u8BFB\u5C55\u793A,\u5BC6\u94A5\u660E\u6587\u6C38\u4E0D\u56DE\u663E;\u6B64\u5904\u4EC5\u53EF\u542F\u7528/\u505C\u7528\u8D26\u6237 (POST /as-one/api/pages/providers/{provider}/accounts/upsert)\u3002fixture \u9636\u6BB5\u66F4\u6539\u4EC5\u672C\u5730\u751F\u6548\u3002" }), notice ? _jsx("div", { className: "asone-notice", children: notice }) : null, providers.map((p) => (_jsx(ProviderCardView, { p: p, onToggle: toggle }, p.provider)))] }));
}
//# sourceMappingURL=ProvidersPage.js.map