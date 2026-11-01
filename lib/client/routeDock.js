import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 输入框上方的「真实模型」胶囊(`conversation.input.dock`)。
 *
 * 为什么需要它:用户选的是**逻辑模型**(`auto` / `free` / `deepseek-flash`),
 * 但真正应答的是链里某个真实模型 —— 那个决策在网关内部(选路在请求到来时
 * 才发生:due-first / random / 亲和 / 抢占),DSH 界面完全看不到。于是
 * 「这条消息到底发给了谁」在界面上是黑洞,排障只能事后翻请求日志。
 *
 * ⚠️ 语义边界(刻意保守,不替调度器说话):
 * - 展示**最近一次已结束请求**实际命中的真实模型,不是「下一次会用谁」。
 *   会话亲和让人在同一会话里通常继续用同一个真实模型,所以这个值对
 *   「我现在在用谁」是诚实的近似 —— 措辞用「上次实际使用」而不是「当前」。
 * - **只对逻辑模型显示**。直连真实模型时,DSH 自己的模型选择器已经写着它是
 *   谁,再画一行是重复。
 * - 查不到(新会话还没跑过请求 / 滑出账本保留窗口 / 后端不可用)→ **什么都不画**。
 *   编一个「上次是 X」比空着更糟。
 *
 * 数据源是网关的**内存账本**(`getSessionRoute`),不是 JSONL 明细日志 ——
 * 后者在「不记录日志」档位下完全不写(用户定案),拿它当数据源会让这个胶囊
 * 在用户关掉日志后凭空消失。
 */
import React from "react";
import { fetchSessionRoute } from "./api.js";
/** 轮询间隔:跟上「发一条消息」的节奏即可,不用太快把面板接口当成心跳。 */
const POLL_MS = 4000;
/** 胶囊文案:逻辑模型 → 真实模型(展示名)。 */
function labelOf(route) {
    const real = `${route.provider}/${route.model}`;
    const withName = route.display_name !== null && route.display_name !== "" && route.display_name !== route.model
        ? `${real} · ${route.display_name}`
        : real;
    return route.logical_model !== null ? `${route.logical_model} → ${withName}` : withName;
}
export function AsOneRouteDock({ sessionId }) {
    const sid = typeof sessionId === "string" ? sessionId : "";
    const [route, setRoute] = React.useState(null);
    React.useEffect(() => {
        if (sid === "") {
            setRoute(null);
            return;
        }
        let cancelled = false;
        const load = () => {
            void fetchSessionRoute(sid)
                .then((next) => {
                if (!cancelled)
                    setRoute(next);
            })
                .catch(() => {
                // 后端不可用 / 路由未注册 → 当作「查不到」,不画,也不刷错误提示。
                if (!cancelled)
                    setRoute(null);
            });
        };
        load();
        const timer = window.setInterval(load, POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [sid]);
    // 直连真实模型 → 不画(DSH 的选择器已经写着它是谁);查不到 → 不画。
    if (route === null || !route.is_logical)
        return null;
    const seconds = Math.round(route.finished_s_ago);
    return (_jsxs("div", { "data-as-one-route": "", style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 6,
            padding: "0 4px 4px",
            fontSize: 11,
            lineHeight: "16px",
            color: "var(--dsw-alias-label-tertiary, #8b94a3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        }, title: `这条会话最近一次请求实际路由:${labelOf(route)}(网关实时账本,${seconds} 秒前)`, children: [_jsx("span", { style: { opacity: 0.75 }, children: "\u4E0A\u6B21\u5B9E\u9645\u4F7F\u7528" }), _jsx("span", { style: { fontVariantNumeric: "tabular-nums" }, children: labelOf(route) })] }));
}
//# sourceMappingURL=routeDock.js.map