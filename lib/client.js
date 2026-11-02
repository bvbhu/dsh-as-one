window.__ModuleLoader__.load({
	id: "@as-one/plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  BUNDLE_NAME: () => BUNDLE_NAME,
  PANEL_ID: () => PANEL_ID,
  PANEL_ORDER: () => PANEL_ORDER,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);

// ../panel-ui/src/bridge.ts
var invoker = null;
function setPanelInvoker(fn) {
  invoker = fn;
}
function invokePanel(method, ...args) {
  if (invoker === null) {
    throw new Error("\u9762\u677F\u6570\u636E\u6865\u672A\u6CE8\u5165:\u5BBF\u4E3B\u9700\u5148\u8C03\u7528 setPanelInvoker()");
  }
  return invoker(method, ...args);
}

// ../panel-ui/src/api.ts
function createPanelApi() {
  const call = (method, ...args) => invokePanel(method, ...args);
  return {
    // 总览
    async getStatus() {
      return call("getStatus");
    },
    async getRuntime() {
      return call("getRuntime");
    },
    async getSessionCurrentRoute(sessionId, model) {
      return call(
        "getSessionCurrentRoute",
        sessionId,
        ...model === void 0 ? [] : [model]
      );
    },
    // 重启网关:唯一入口是托盘菜单,面板不再提供(用户定案 m03639)
    // 用量
    async getUsageHistory(range, granularity, group) {
      return call("getUsageHistory", range, granularity, group);
    },
    // 逻辑模型
    async getLogicalModels() {
      return call("getLogicalModels");
    },
    async writeLogicalModel(input) {
      return call("writeLogicalModel", input);
    },
    async removeLogicalModel(name2) {
      return call("removeLogicalModel", name2);
    },
    // 模型总览(部署)
    async getDeployments() {
      return call("getDeployments");
    },
    async setDeploymentExposure(deploymentId, kind, exposed, concurrency) {
      return call("setDeploymentExposure", deploymentId, kind, exposed, concurrency);
    },
    async setDeploymentReasoning(deploymentId, efforts, allowsOff) {
      return call("setDeploymentReasoning", deploymentId, efforts, allowsOff);
    },
    // 供应商(其他供应商)
    async getModelProviders() {
      return call("getModelProviders");
    },
    async upsertModelProvider(id, baseUrl, protocol, envPrefix, keys) {
      return call("upsertModelProvider", id, baseUrl, protocol, envPrefix, keys);
    },
    async removeModelProvider(id) {
      return call("removeModelProvider", id);
    },
    async fetchModels(id, force, decl) {
      return call("fetchModels", id, force, decl ?? null);
    },
    async setModelExposure(provider, model, exposed) {
      return call("setModelExposure", provider, model, exposed);
    },
    async getMetrics(days) {
      return call("getMetrics", days);
    },
    async checkModel(provider, model) {
      return call("checkModel", provider, model);
    },
    async getSensenovaAccounts() {
      return call("getSensenovaAccounts");
    },
    async getQuota() {
      return call("getQuota");
    },
    async checkModels(id) {
      return call("checkModels", id);
    },
    // 渠道页(Trae / WorkBuddy)
    async getProviderPage(provider, fresh) {
      return call("getProviderPage", provider, fresh);
    },
    async getChannelAccounts(provider) {
      return call("getChannelAccounts", provider);
    },
    async checkinStatus(provider) {
      return call("checkinStatus", provider);
    },
    async checkinClaim(provider, confirm, index) {
      return call("checkinClaim", provider, confirm, index);
    },
    async refreshStatus(provider) {
      return call("refreshStatus", provider);
    },
    async refreshRun(provider, confirm, index) {
      return call("refreshRun", provider, confirm, index);
    },
    async syncChannel(provider, force) {
      return call("syncChannel", provider, force);
    },
    async setChannelModels(provider, models) {
      return call("setChannelModels", provider, models);
    },
    /**
     * 单行实时保存(用户 2026-10-31 定案:四页删掉「撤销/保存」,勾选与改格即落库)。
     *
     * ⚠️ 不要用 `setChannelModels` 代替它:那个是整批替换(清单外 = 删行),
     * 一次只发一行会把其余模型全删掉。取消勾选传 `exposed: false`。
     */
    async setChannelModel(provider, patch) {
      return call("setChannelModel", provider, patch);
    },
    // 客户端路径
    async getClientPaths() {
      return call("getClientPaths");
    },
    async saveClientPath(channel, path) {
      return call("saveClientPath", channel, path);
    },
    async detectClientPath(channel) {
      return call("detectClientPath", channel);
    },
    // 自动发现 / 接入
    async discoverChannelAccounts(provider) {
      return call("discoverChannelAccounts", provider);
    },
    async adoptChannelAccount(provider, username, token, region) {
      return call("adoptChannelAccount", provider, username, token, region);
    },
    // 设置
    async getSettings() {
      return call("getSettings");
    },
    async saveSettings(payload) {
      return call("saveSettings", payload);
    },
    // 请求日志
    async getRequestLog() {
      return call("getRequestLog");
    },
    async setRequestLog(patch) {
      return call("setRequestLog", patch);
    },
    // SenseNova
    async getSensenovaStatus() {
      return call("getSensenovaStatus");
    },
    async getSensenovaModels() {
      return call("getSensenovaModels");
    },
    async setSensenovaExposure(provider, model, exposed) {
      return call("setSensenovaExposure", provider, model, exposed);
    },
    async sensenovaRefresh(force) {
      return call("sensenovaRefresh", force);
    },
    // SenseNova 登录与账号管理(镜像 Nexus /sensenova/login 等路由)
    async sensenovaLogin(account, username, password, fetchKey) {
      return call("sensenovaLogin", account, username, password, fetchKey);
    },
    async sensenovaSavePassword(account, username, password) {
      return call("sensenovaSavePassword", account, username, password);
    },
    async sensenovaRefetchKey(account) {
      return call("sensenovaRefetchKey", account);
    },
    async sensenovaAddAccount(username, password, apiKey) {
      return call("sensenovaAddAccount", username, password, apiKey);
    },
    async sensenovaRemoveAccount(account) {
      return call("sensenovaRemoveAccount", account);
    },
    // Qoder(cosy 协议;qoder 国内 / qoder-global 国际)。region 用字符串透传,
    // 主进程按区域分派;未知区域由面板域自己拒绝并给文案。
    async getQoderAccounts() {
      return call("getQoderAccounts");
    },
    async getQoderStatus() {
      return call("getQoderStatus");
    },
    async getQoderModels(region) {
      return call("getQoderModels", region);
    },
    async qoderRefreshCatalog(region) {
      return call("qoderRefreshCatalog", region);
    },
    async qoderSetModelEnabled(region, key, enabled) {
      return call("qoderSetModelEnabled", region, key, enabled);
    },
    async qoderCredits(region, account) {
      return call("qoderCredits", region, account);
    },
    async qoderCheckin(region, account) {
      return call("qoderCheckin", region, account);
    },
    async qoderCampaigns(region, account) {
      return call(
        "qoderCampaigns",
        region,
        account
      );
    },
    async qoderAddAccount(region, name2, pat) {
      return call("qoderAddAccount", region, name2, pat);
    },
    async qoderRemoveAccount(region, name2) {
      return call("qoderRemoveAccount", region, name2);
    },
    async qoderSetAccountEnabled(region, name2, enabled) {
      return call("qoderSetAccountEnabled", region, name2, enabled);
    },
    async qoderProbeChat(region, name2) {
      return call("qoderProbeChat", region, name2);
    },
    async qoderRecentErrors() {
      return call("qoderRecentErrors");
    },
    // 数据目录
    async getDataDir() {
      return call("getDataDir");
    }
  };
}
var rendererApi = createPanelApi();

// ../panel-ui/src/format.ts
function fmtCount(v) {
  const UNITS = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"]
  ];
  if (v === null || v === void 0) return "N/A";
  for (const [base, suffix] of UNITS) {
    if (Math.abs(v) >= base) {
      const scaled = v / base;
      const s = (Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)).replace(/\.0$/, "");
      return `${s}${suffix}`;
    }
  }
  return String(v);
}
function fmtSecFromMs(ms) {
  if (ms === null || ms === void 0) return "\u2014";
  return (ms / 1e3).toFixed(1);
}
function fmtInt(v) {
  if (v === null || v === void 0) return "\u2014";
  return String(Math.round(v));
}
function fmtPct(v) {
  if (v === null || v === void 0) return "\u2014";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtDuration(s) {
  if (s === null || s === void 0) return "\u2014";
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const sec = total % 60;
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ../panel-ui/src/App.tsx
var import_react14 = __toESM(require("react"), 1);

// ../panel-ui/src/components/NavTabs.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var DEFAULT_TABS = [
  { key: "overview", label: "\u603B\u89C8" },
  { key: "models", label: "\u6A21\u578B" },
  { key: "usage", label: "\u7528\u91CF\u7EDF\u8BA1" },
  { key: "settings", label: "\u8BBE\u7F6E" }
];
function NavTabs({
  tabs = DEFAULT_TABS,
  active,
  onChange
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", { className: "tabs", children: tabs.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className: `tab${t.key === active ? " on" : ""}`,
      onClick: () => onChange(t.key),
      children: t.label
    },
    t.key
  )) });
}

// ../panel-ui/src/pages/OverviewPage.tsx
var import_react = __toESM(require("react"), 1);
var import_jsx_runtime2 = require("react/jsx-runtime");
var DIRECT_LABEL = "\u76F4\u8FDE";
var DEFAULT_LIMIT = 50;
function countModels(names) {
  const n3 = /* @__PURE__ */ new Map();
  for (const s of names) {
    const key = String(s || "");
    if (!key) continue;
    n3.set(key, (n3.get(key) ?? 0) + 1);
  }
  return [...n3.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
function modelSummary(names) {
  if (!names.length) return "\u2014";
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}
function byActivity(a, b) {
  return a.finishedSago - b.finishedSago;
}
function sortConvGroups(groups) {
  const noConv = groups.filter((g) => g.noConv);
  const conv = groups.filter((g) => !g.noConv);
  return [...conv.sort(byActivity), ...noConv];
}
function fmtMsRange(min, max) {
  if (min == null && max == null) return "\u2014";
  const lo = Math.round(min ?? max);
  const hi = Math.round(max ?? min);
  const loS = (lo / 1e3).toFixed(1);
  const hiS = (hi / 1e3).toFixed(1);
  return loS === hiS ? `${loS}s` : `${loS}\u2013${hiS}s`;
}
function fmtMs(ms) {
  if (ms == null) return "\u2014";
  return `${(Math.round(ms) / 1e3).toFixed(1)}s`;
}
function fmtTps(tps) {
  if (tps == null) return "\u2014";
  return `${Number(tps).toFixed(1)} tok/s`;
}
function truncate(text, max) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max)}\u2026` : s;
}
function realModelRows(lm) {
  const counts = /* @__PURE__ */ new Map();
  for (const l of lm.leases) {
    counts.set(l.real_model_id, (counts.get(l.real_model_id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([real_model, n3]) => ({ real_model, n: n3 })).sort((a, b) => b.n - a.n || a.real_model.localeCompare(b.real_model));
}
function OverviewPage() {
  const [status, setStatus] = import_react.default.useState(null);
  const [error, setError] = import_react.default.useState("");
  const [inflight, setInflight] = import_react.default.useState(null);
  const [recentLimit, setRecentLimit] = import_react.default.useState(String(DEFAULT_LIMIT));
  const [recentLimitSaved, setRecentLimitSaved] = import_react.default.useState(DEFAULT_LIMIT);
  const [recentLimitSaving, setRecentLimitSaving] = import_react.default.useState(false);
  const [recentLimitError, setRecentLimitError] = import_react.default.useState("");
  const [expandedGroups, setExpandedGroups] = import_react.default.useState(/* @__PURE__ */ new Set());
  const load = import_react.default.useCallback(async () => {
    try {
      setStatus(await rendererApi.getStatus());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    try {
      setInflight(await rendererApi.getRuntime());
    } catch {
      setInflight(null);
    }
  }, []);
  const loadRecentLimit = import_react.default.useCallback(async () => {
    try {
      const r = await rendererApi.getSettings();
      const n3 = Number(
        r.sections?.["ui"]?.["ui.recent_limit"] ?? r.sections?.["ui"]?.["recent_limit"]
      );
      if (Number.isFinite(n3) && n3 >= 1) {
        setRecentLimit(String(n3));
        setRecentLimitSaved(n3);
      }
    } catch {
    }
  }, []);
  import_react.default.useEffect(() => {
    void load();
    void loadRecentLimit();
    const timer = window.setInterval(() => {
      void load();
    }, 5e3);
    return () => window.clearInterval(timer);
  }, [load, loadRecentLimit]);
  const saveRecentLimit = import_react.default.useCallback(async () => {
    const raw = recentLimit;
    const n3 = raw.trim() === "" ? NaN : Math.trunc(Number(raw));
    if (!Number.isFinite(n3)) {
      setRecentLimit(String(recentLimitSaved));
      setRecentLimitError("");
      return;
    }
    if (n3 < 1 || n3 > 500) {
      setRecentLimitError("\u6761\u6570\u9700\u4E3A 1\u2013500 \u7684\u6574\u6570");
      return;
    }
    setRecentLimit(String(n3));
    setRecentLimitError("");
    setRecentLimitSaving(true);
    try {
      await rendererApi.saveSettings({ ui: { recent_limit: String(n3) } });
      setRecentLimitSaved(n3);
      await load();
    } catch (e) {
      setRecentLimitError(`\u4FDD\u5B58\u5931\u8D25:${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRecentLimitSaving(false);
    }
  }, [recentLimit, recentLimitSaved, load]);
  const toggleGroup = import_react.default.useCallback((id) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const summary = status ? {
    ready: status.ready,
    reason: status.reason,
    uptime_s: status.uptime_s,
    healthy: status.healthy_count,
    cooldown: status.cooldown_count
  } : null;
  const recentConvGroups = import_react.default.useMemo(() => {
    const list = inflight?.recent ?? [];
    const byConv = /* @__PURE__ */ new Map();
    for (const r of list) {
      const key = r.conv === null ? `rm:${r.real_model_id}` : `conv:${r.conv}`;
      const bucket = byConv.get(key);
      if (bucket) bucket.push(r);
      else byConv.set(key, [r]);
    }
    const groups = [];
    for (const [key, rows] of byConv) {
      rows.sort((a, b) => b.seq - a.seq);
      const conv = key.startsWith("conv:") ? key.slice(5) : null;
      const noConv = conv === null || conv === "0";
      const label = conv === null ? rows[0]?.real_model_id || "\u65E0\u5BF9\u8BDD" : conv === "0" ? "\u65E0\u5BF9\u8BDD" : `#${conv}`;
      const lat = rows.map((r) => r.latency_ms).filter((v) => v != null);
      const ttft = rows.map((r) => r.ttft_ms).filter((v) => v != null);
      const tps = rows.map((r) => r.tps).filter((v) => v != null);
      const fago = rows.map((r) => r.finished_s_ago).filter((v) => v != null);
      groups.push({
        id: key,
        conv,
        label,
        noConv,
        rows,
        okCount: rows.filter((r) => r.ok).length,
        failCount: rows.length - rows.filter((r) => r.ok).length,
        firstError: rows.find((r) => !r.ok && r.error)?.error ?? "",
        latencyMin: lat.length ? Math.min(...lat) : null,
        latencyMax: lat.length ? Math.max(...lat) : null,
        ttftMin: ttft.length ? Math.min(...ttft) : null,
        ttftMax: ttft.length ? Math.max(...ttft) : null,
        tpsAvg: tps.length ? tps.reduce((a, b) => a + b, 0) / tps.length : null,
        promptSum: rows.reduce((a, r) => a + (r.prompt_tokens || 0), 0),
        completionSum: rows.reduce((a, r) => a + (r.completion_tokens || 0), 0),
        cachedSum: rows.reduce((a, r) => a + (r.cached_tokens || 0), 0),
        finishedSago: fago.length ? Math.min(...fago) : 0,
        lms: countModels(rows.map((r) => r.logical_model || DIRECT_LABEL)),
        rms: countModels(rows.map((r) => r.real_model_id))
      });
    }
    return sortConvGroups(groups);
  }, [inflight]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_react.default.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { className: "page-title", children: "As One \u7BA1\u7406\u9762\u677F" }),
    summary ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: summary.ready ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      "\u7F51\u5173\u8FD0\u884C\u4E2D \xB7 \u8FD0\u884C ",
      fmtDuration(summary.uptime_s),
      " \xB7 \u53EF\u7528 ",
      summary.healthy,
      " / \u51B7\u5374",
      " ",
      summary.cooldown
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      "\u7F51\u5173\u672A\u5C31\u7EEA:",
      summary.reason ?? "\u672A\u77E5\u539F\u56E0"
    ] }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "na", children: "\u52A0\u8F7D\u4E2D\u2026" }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-err", children: [
      error,
      error.includes("401") ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        " ",
        "\u2014\u2014 \u8BF7\u5728\u7F51\u5740\u540E\u8FFD\u52A0 ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: "?key=<ONE_API_KEY>" })
      ] }) : null
    ] }) : null,
    inflight ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-inflight", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-inflightHead", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "\u8FD0\u884C\u4E2D" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "count", children: [
            inflight.in_flight_total,
            " \u6761\u5728\u9014"
          ] })
        ] }),
        inflight.in_flight_total === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ov-inflightGrid", children: inflight.by_logical_model.map((lm) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: `ov-inflightCard${lm.logical_model === "" ? " ov-inflightDirect" : ""}`,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-inflightCardHead", children: [
                lm.logical_model === "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "span",
                  {
                    className: "ov-inflightLm",
                    title: "\u5BA2\u6237\u7AEF\u76F4\u63A5\u8C03\u7528\u771F\u5B9E\u6A21\u578B(provider/model),\u672A\u7ECF\u8FC7\u903B\u8F91\u6A21\u578B",
                    children: DIRECT_LABEL
                  }
                ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-inflightLm", children: lm.logical_model }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "count", children: lm.in_flight })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { className: "ov-inflightMap", children: realModelRows(lm).map((rm) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-mono", children: [
                  "\u2192 ",
                  rm.real_model
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-inflightRmN ov-mono", children: [
                  "\xD7",
                  rm.n
                ] })
              ] }, rm.real_model)) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ov-inflightLeases", children: lm.leases.map((l) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "span",
                {
                  className: "ov-lease",
                  title: `${l.real_model_id} \xB7 ${l.stream ? "\u6D41\u5F0F" : "\u975E\u6D41\u5F0F"} \xB7 \u5DF2\u8DD1 ${l.elapsed_s}s`,
                  children: [
                    "#",
                    l.conv ?? 0,
                    "#",
                    l.seq
                  ]
                },
                l.seq
              )) })
            ]
          },
          lm.logical_model
        )) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-recentBlock", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-inflightHead", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "\u5B9E\u65F6\u65E5\u5FD7" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "count", children: [
            inflight.recent?.length ?? 0,
            " \u6761"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "label",
            {
              className: "ov-recentLimit",
              title: "\u5B9E\u65F6\u65E5\u5FD7\u6700\u591A\u663E\u793A\u51E0\u6761;\u540C\u65F6\u51B3\u5B9A\u540E\u7AEF\u4FDD\u7559\u533A\u5BB9\u91CF(ui.recent_limit)",
              children: [
                "\u6700\u591A",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "input",
                  {
                    type: "number",
                    min: 1,
                    max: 500,
                    step: 1,
                    value: recentLimit,
                    disabled: recentLimitSaving,
                    onChange: (e) => setRecentLimit(e.target.value),
                    onBlur: () => void saveRecentLimit(),
                    onKeyDown: (e) => {
                      if (e.key === "Enter") void saveRecentLimit();
                    }
                  }
                ),
                "\u6761"
              ]
            }
          ),
          recentLimitError ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-recentLimitErr", children: recentLimitError }) : null
        ] }),
        !inflight.recent?.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "hint on", children: "\u6682\u65E0\u5DF2\u7ED3\u675F\u7684\u8BF7\u6C42\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ov-recentConvList", children: recentConvGroups.map((g) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: `ov-recentConv${expandedGroups.has(g.id) ? " open" : ""}`,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "div",
                {
                  className: "ov-recentConvHead",
                  title: expandedGroups.has(g.id) ? "\u6536\u8D77\u660E\u7EC6" : "\u5C55\u5F00\u660E\u7EC6",
                  onClick: () => toggleGroup(g.id),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-recentConvHeadId", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-recentConvCaret", children: expandedGroups.has(g.id) ? "\u25BE" : "\u25B8" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `ov-recentConvTitle ov-mono${g.noConv ? " direct" : ""}`, children: g.label })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "span",
                      {
                        className: `ov-mono ov-recentConvLm${g.noConv ? " direct" : ""}`,
                        title: g.lms.join(" / "),
                        children: modelSummary(g.lms)
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-mono ov-dim ov-recentConvRm", title: g.rms.join(" / "), children: modelSummary(g.rms) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-recentConvRes", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-recentConvN", children: [
                        g.rows.length,
                        " \u6761"
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: `ov-badge${g.failCount ? " bad" : " ok"}`, children: [
                        "OK \xD7",
                        g.okCount
                      ] }),
                      g.firstError ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-errText", title: g.firstError, children: truncate(g.firstError, 40) }) : null
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "span",
                      {
                        className: "ov-num",
                        title: `\u5EF6\u8FDF ${fmtMsRange(g.latencyMin, g.latencyMax)}(\u5361\u5185\u6700\u5C0F\u2013\u6700\u5927)`,
                        children: fmtMsRange(g.latencyMin, g.latencyMax)
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-num", title: "TTFT \u9996\u5B57\u5EF6\u8FDF(\u5361\u5185\u6700\u5C0F\u2013\u6700\u5927)", children: [
                      "TTFT ",
                      fmtMsRange(g.ttftMin, g.ttftMax)
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-num", children: fmtTps(g.tpsAvg) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-num ov-dim", children: [
                      fmtCount(g.promptSum),
                      " / ",
                      fmtCount(g.completionSum),
                      " /",
                      " ",
                      fmtCount(g.cachedSum)
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-num ov-dim", children: [
                      g.finishedSago,
                      "s \u524D"
                    ] })
                  ]
                }
              ),
              expandedGroups.has(g.id) ? g.rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "div",
                {
                  className: `ov-recentConvRow${!r.ok ? " fail" : ""}`,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                      "span",
                      {
                        className: "ov-mono ov-recentConvSeq",
                        title: `\u7B2C ${r.conv ?? 0} \u4E2A\u5BF9\u8BDD\u7684\u7B2C ${r.seq} \u4E2A\u8BF7\u6C42`,
                        children: [
                          "#",
                          r.conv ?? 0,
                          "#",
                          r.seq
                        ]
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "span",
                      {
                        className: `ov-mono ov-recentConvLm${!r.logical_model ? " direct" : ""}`,
                        children: r.logical_model || DIRECT_LABEL
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-mono ov-dim ov-recentConvRm", title: r.real_model_id, children: r.real_model_id }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-recentConvRes", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `ov-badge${r.ok ? " ok" : " bad"}`, children: r.ok ? r.status || "OK" : r.status || "\u5931\u8D25" }),
                      !r.ok && r.error ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-errText", title: r.error, children: truncate(r.error, 40) }) : null
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-num", children: fmtMs(r.latency_ms) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-num", children: fmtMs(r.ttft_ms) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-num", children: fmtTps(r.tps) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ov-num ov-dim", children: [
                      fmtCount(r.prompt_tokens || 0),
                      " / ",
                      fmtCount(r.completion_tokens || 0),
                      " ",
                      "/ ",
                      fmtCount(r.cached_tokens || 0)
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-num ov-dim", children: r.finished_s_ago == null ? "\u2014" : `${r.finished_s_ago}s \u524D` })
                  ]
                },
                r.seq
              )) : null
            ]
          },
          g.id
        )) })
      ] })
    ] }) : null
  ] });
}

// ../panel-ui/src/pages/models/ModelsPage.tsx
var import_react10 = __toESM(require("react"), 1);

// ../panel-ui/src/pages/models/LogicalModelsPage.tsx
var import_react2 = __toESM(require("react"), 1);

// ../panel-ui/src/components/LogicalModelEditor.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var NAME_RE = /^[a-z][a-z0-9._-]*$/;
var STRATEGY_KEYS = [
  "due-first",
  "random",
  "ordered-fallback",
  "least-busy",
  "balanced"
];
var STRATEGY_LABELS = {
  "due-first": "\u6700\u5148\u5230\u671F Due first",
  random: "\u968F\u673A Random",
  "ordered-fallback": "\u6309\u5E8F\u964D\u7EA7\u94FE Ordered fallback",
  "least-busy": "\u6700\u5C11\u5728\u9014 Least busy",
  balanced: "\u5E73\u5747\u4F7F\u7528 Balanced"
};
function labelOf(key) {
  return STRATEGY_LABELS[key] ?? key;
}
function LogicalModelEditor({
  creating,
  catalog,
  busy,
  name: name2,
  displayName = "",
  strategy,
  members,
  onChangeName,
  onChangeDisplayName,
  onChangeStrategy,
  onChangeMembers,
  onSave,
  onCancel
}) {
  const trimmedName = name2.trim();
  const nameBad = trimmedName !== "" && !NAME_RE.test(trimmedName);
  const providers = [...new Set(catalog.map((c) => c.provider))];
  function modelsOf(provider, cur) {
    const list = catalog.filter((c) => c.provider === provider).map((c) => c.model);
    if (cur && !list.includes(cur)) list.unshift(cur);
    return list;
  }
  function setMember(i, patch) {
    onChangeMembers?.(members.map((m, idx) => idx === i ? { ...m, ...patch } : m));
  }
  function onProviderChange(i, provider) {
    const same = catalog.filter((c) => c.provider === provider);
    if (same.length === 1) setMember(i, { provider, model: same[0].model });
    else setMember(i, { provider });
  }
  function addMember() {
    const first = catalog[0];
    onChangeMembers?.([...members, { provider: first?.provider ?? "", model: first?.model ?? "" }]);
  }
  function moveMember(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= members.length) return;
    const next = [...members];
    [next[i], next[j]] = [next[j], next[i]];
    onChangeMembers?.(next);
  }
  function removeMember(i) {
    onChangeMembers?.(members.filter((_, idx) => idx !== i));
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "editor", children: [
    creating ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "fieldRow", htmlFor: "lm-name", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fieldLabel", children: "\u903B\u8F91\u6A21\u578B\u540D" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "input",
        {
          id: "lm-name",
          className: `input${nameBad ? " inputBad" : ""}`,
          type: "text",
          placeholder: "\u5982 deepseek-v4-flash / glm-5.3-flashx",
          title: "\u5C0F\u5199\u5B57\u6BCD\u5F00\u5934,\u53EA\u80FD\u542B\u5C0F\u5199\u5B57\u6BCD / \u6570\u5B57 / \u70B9 / \u77ED\u6A2A\u7EBF / \u5355\u4E0B\u5212\u7EBF",
          value: name2,
          onChange: (e) => onChangeName?.(e.target.value.trim())
        }
      )
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fieldRow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fieldLabel", children: "\u903B\u8F91\u6A21\u578B\u540D" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fieldValue", title: `${name2}(\u6539\u540D\u8981\u5220\u4E86\u91CD\u5EFA,\u4F1A\u7834\u574F\u5DF2\u90E8\u7F72\u7684\u5F15\u7528)`, children: name2 })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "fieldRow", htmlFor: "lm-display-name", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fieldLabel", children: "\u663E\u793A\u540D" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "input",
        {
          id: "lm-display-name",
          className: "input",
          type: "text",
          placeholder: name2 || "\u7559\u7A7A\u5219\u7528\u903B\u8F91\u6A21\u578B\u540D",
          title: "\u53EA\u5F71\u54CD\u5217\u8868\u4E0E /v1/models \u91CC\u663E\u793A\u7684\u540D\u5B57,\u8C03\u7528\u4E32\u4ECD\u662F\u903B\u8F91\u6A21\u578B\u540D;\u548C\u522B\u7684\u6A21\u578B\u649E\u540D\u65F6\u4F1A\u81EA\u52A8\u8FFD\u52A0\u4F9B\u5E94\u5546\u533A\u5206",
          value: displayName,
          onChange: (e) => onChangeDisplayName?.(e.target.value.trim())
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "fieldRow", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fieldLabel", children: "\u8C03\u5EA6\u7B56\u7565" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "select",
        {
          className: "input selectInput",
          value: strategy,
          onChange: (e) => onChangeStrategy?.(e.target.value),
          children: STRATEGY_KEYS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: s, children: labelOf(s) }, s))
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "chainHead", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fieldLabel", children: "\u6863\u94FE" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "nodeList", children: [
      members.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "nodeRow", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "groupIdx", children: i + 1 }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "select",
          {
            className: "input nodeProvider",
            value: m.provider,
            "aria-label": `\u7B2C ${i + 1} \u6863\u7684\u4F9B\u5E94\u5546`,
            onChange: (e) => onProviderChange(i, e.target.value),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: "\u2014 \u9009\u4F9B\u5E94\u5546 \u2014" }),
              providers.map((p) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: p, children: p }, p))
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "select",
          {
            className: "input nodeSelect",
            value: m.model,
            disabled: !m.provider,
            "aria-label": `\u7B2C ${i + 1} \u6863\u7684\u6A21\u578B`,
            onChange: (e) => setMember(i, { model: e.target.value }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: "\u2014 \u9009\u6A21\u578B \u2014" }),
              modelsOf(m.provider, m.model).map((model) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: model, children: model }, model))
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "iconButton",
            title: "\u4E0A\u79FB\u4E00\u6863",
            disabled: i === 0,
            onClick: () => moveMember(i, -1),
            children: "\u2191"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "iconButton",
            title: "\u4E0B\u79FB\u4E00\u6863",
            disabled: i === members.length - 1,
            onClick: () => moveMember(i, 1),
            children: "\u2193"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            className: "iconButton iconButtonDanger",
            title: "\u79FB\u9664\u8BE5\u6863",
            onClick: () => removeMember(i),
            children: "\u2715"
          }
        )
      ] }, i)),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          className: "addModelButton",
          disabled: catalog.length === 0,
          onClick: addMember,
          children: "\uFF0B \u6DFB\u52A0\u6863\u4F4D"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "editorActions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "primaryButton", disabled: busy, onClick: () => onSave?.(), children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : creating ? "\u521B\u5EFA" : "\u4FDD\u5B58" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "secondaryButton", disabled: busy, onClick: () => onCancel?.(), children: "\u53D6\u6D88" })
    ] })
  ] });
}

// ../panel-ui/src/pages/models/LogicalModelsPage.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function labelOf2(key) {
  return STRATEGY_LABELS[key] ?? key;
}
function splitMember(s) {
  const i = s.indexOf("/");
  return i < 0 ? { provider: s, model: "" } : { provider: s.slice(0, i), model: s.slice(i + 1) };
}
function msg(e) {
  return e instanceof Error ? e.message : String(e);
}
function LogicalModelsPage() {
  const [groups, setGroups] = import_react2.default.useState([]);
  const [catalog, setCatalog] = import_react2.default.useState([]);
  const [error, setError] = import_react2.default.useState("");
  const [notice, setNotice] = import_react2.default.useState("");
  const [busy, setBusy] = import_react2.default.useState(false);
  const [editingName, setEditingName] = import_react2.default.useState("");
  const [creating, setCreating] = import_react2.default.useState(false);
  const [formStrategy, setFormStrategy] = import_react2.default.useState("due-first");
  const [formDisplayName, setFormDisplayName] = import_react2.default.useState("");
  const [formMembers, setFormMembers] = import_react2.default.useState([]);
  async function load() {
    try {
      const [lm, dep] = await Promise.all([rendererApi.getLogicalModels(), rendererApi.getDeployments()]);
      setGroups(lm);
      setCatalog(
        (dep.deployments ?? []).map((d) => ({ provider: d.provider, model: d.model }))
      );
      setError("");
    } catch (e) {
      setError(msg(e));
    }
  }
  import_react2.default.useEffect(() => {
    void load();
  }, []);
  function visionOf(g) {
    const ds = g.deployments ?? [];
    if (!ds.length || !ds.some((d) => d.supports_vision)) return null;
    return { all: ds.every((d) => d.supports_vision) };
  }
  function startCreate() {
    setCreating(true);
    setEditingName("");
    setFormDisplayName("");
    setFormStrategy("due-first");
    setFormMembers([]);
    setError("");
    setNotice("");
  }
  function startEdit(g) {
    if (editingName === g.model && !creating) {
      closeCard();
      return;
    }
    setCreating(false);
    setEditingName(g.model);
    setFormDisplayName(g.display_name ?? "");
    setFormStrategy(g.routing_strategy ?? "random");
    const rawMembers = g.members;
    const members = rawMembers != null ? rawMembers.map(splitMember) : (g.deployments ?? []).map((d) => ({ provider: d.provider, model: d.model }));
    setFormMembers(members);
    setError("");
    setNotice("");
  }
  function closeCard() {
    setEditingName("");
    setCreating(false);
  }
  function validateForm() {
    if (creating) {
      const name2 = editingName.trim();
      if (!NAME_RE.test(name2)) return "\u903B\u8F91\u6A21\u578B\u540D\u9700\u4EE5\u5C0F\u5199\u5B57\u6BCD\u5F00\u5934,\u53EA\u80FD\u542B\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u70B9/\u77ED\u6A2A\u7EBF/\u5355\u4E0B\u5212\u7EBF";
      if (groups.some((g) => g.model === name2)) return "\u5DF2\u6709\u903B\u8F91\u6A21\u578B\u4F7F\u7528\u4E86\u8FD9\u4E2A\u540D\u5B57\u3002";
    }
    if (!STRATEGY_KEYS.includes(formStrategy)) return "\u8C03\u5EA6\u7B56\u7565\u4E0D\u5408\u6CD5";
    const picked = formMembers.filter((m) => m.provider && m.model);
    if (!picked.length) return "\u81F3\u5C11\u8981\u9009\u4E00\u4E2A\u771F\u5B9E\u6A21\u578B";
    if (picked.length !== formMembers.length) return "\u6709\u672A\u9009\u5B8C\u7684\u8282\u70B9:\u5148\u9009\u4F9B\u5E94\u5546,\u518D\u9009\u6A21\u578B";
    const seen = new Set(picked.map((m) => `${m.provider}/${m.model}`));
    if (seen.size !== picked.length) return "\u6863\u94FE\u91CC\u6709\u91CD\u590D\u7684\u771F\u5B9E\u6A21\u578B";
    return null;
  }
  async function save() {
    const bad = validateForm();
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const r = await rendererApi.writeLogicalModel({
        model_name: editingName.trim(),
        // 显示名:空串 = 后端清成 NULL(回退用 model_name)。这里总是带上表单值,
        // 因为表单是从 g.display_name 回填的,不会把用户没看过的列误清。
        display_name: formDisplayName.trim(),
        routing_strategy: formStrategy,
        // ⚠️ 数组顺序就是 priority:原样提交,不做任何排序
        members: formMembers.filter((m) => m.provider && m.model).map((m) => `${m.provider}/${m.model}`)
      });
      if (!r.ok) {
        setError(r.message || "\u4FDD\u5B58\u5931\u8D25");
        return;
      }
      setNotice(r.message ?? "\u5DF2\u4FDD\u5B58");
      closeCard();
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  async function removeModel(g) {
    const n3 = g.count ?? 0;
    const tail = n3 > 0 ? `(\u542B ${n3} \u6863)` : "";
    if (!window.confirm(`\u786E\u5B9A\u5220\u9664\u903B\u8F91\u6A21\u578B ${g.model}?${tail}`)) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const r = await rendererApi.removeLogicalModel(g.model);
      if (!r.ok) {
        setError(r.message || "\u5220\u9664\u5931\u8D25");
        return;
      }
      setNotice(r.message ?? "\u5DF2\u5220\u9664");
      if (editingName === g.model) closeCard();
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "section lm-section", children: [
    error ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "err", role: "alert", children: error }) : null,
    notice ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "savedNotice", role: "status", children: notice }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("ul", { className: "rows", children: [
      groups.map((g) => {
        const vision = visionOf(g);
        return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "rowCard", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "rowHead", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "rowIdentity", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rowName", title: g.display_name ? `\u8C03\u7528\u4E32:${g.model}` : void 0, children: g.display_name || g.model }),
              g.display_name ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rowTag", children: g.model }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rowTag", children: labelOf2(g.routing_strategy ?? "random") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rowRuntime", children: vision ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "span",
              {
                className: "pill info",
                title: vision.all ? "\u6863\u94FE\u91CC\u6BCF\u4E00\u6863\u90FD\u662F\u89C6\u89C9\u6A21\u578B(\u5168\u90E8 supports_vision)" : "\u6863\u94FE\u91CC\u6709\u89C6\u89C9\u6A21\u578B(\u4EFB\u4E00\u6863 supports_vision),\u5E26\u56FE\u8BF7\u6C42\u4F18\u5148\u6295\u7ED9\u5B83",
                children: vision.all ? "\u5168\u89C6\u89C9" : "\u6709\u89C6\u89C9"
              }
            ) : null }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "rowActions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: "rowBtn",
                  disabled: busy,
                  onClick: () => startEdit(g),
                  children: editingName === g.model && !creating ? "\u6536\u8D77" : "\u7F16\u8F91"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: "rowBtn danger",
                  disabled: busy,
                  onClick: () => removeModel(g),
                  children: "\u5220\u9664"
                }
              )
            ] })
          ] }),
          editingName === g.model && !creating ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            LogicalModelEditor,
            {
              creating: false,
              catalog,
              busy,
              name: editingName,
              displayName: formDisplayName,
              strategy: formStrategy,
              members: formMembers,
              onChangeName: setEditingName,
              onChangeDisplayName: setFormDisplayName,
              onChangeStrategy: (s) => setFormStrategy(s),
              onChangeMembers: setFormMembers,
              onSave: () => void save(),
              onCancel: closeCard
            }
          ) : null
        ] }, g.model);
      }),
      creating ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("li", { className: "rowCard", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "rowHead", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rowIdentity", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rowName", children: "\u6DFB\u52A0\u903B\u8F91\u6A21\u578B" }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          LogicalModelEditor,
          {
            creating: true,
            catalog,
            busy,
            name: editingName,
            displayName: formDisplayName,
            strategy: formStrategy,
            members: formMembers,
            onChangeName: setEditingName,
            onChangeDisplayName: setFormDisplayName,
            onChangeStrategy: (s) => setFormStrategy(s),
            onChangeMembers: setFormMembers,
            onSave: () => void save(),
            onCancel: closeCard
          }
        )
      ] }) : null
    ] }),
    !creating ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "addButton", disabled: busy, onClick: startCreate, children: "\uFF0B \u6DFB\u52A0\u903B\u8F91\u6A21\u578B" }) : null
  ] });
}
var LogicalModelsPage_default = LogicalModelsPage;

// ../panel-ui/src/pages/models/DeploymentsPage.tsx
var import_react3 = __toESM(require("react"), 1);
var import_jsx_runtime5 = require("react/jsx-runtime");
function msg2(e) {
  return e instanceof Error ? e.message : String(e);
}
function effortText(d) {
  const raw = d.supported_reasoning_efforts;
  if (!Array.isArray(raw)) return "";
  return raw.map((x) => String(x ?? "").trim()).filter(Boolean).join(",");
}
var EFFORT_PRESETS = [
  { id: "unknown", label: "Unset (upstream default)", efforts: null, allowsOff: null },
  { id: "none", label: "No reasoning", efforts: [], allowsOff: null },
  { id: "low", label: "Low", efforts: ["low"], allowsOff: false },
  { id: "medium", label: "Low, Medium", efforts: ["low", "medium"], allowsOff: false },
  { id: "high", label: "Low, Medium, High", efforts: ["low", "medium", "high"], allowsOff: false },
  {
    id: "max",
    label: "Low, Medium, High, Max",
    efforts: ["low", "medium", "high", "max"],
    allowsOff: false
  },
  {
    id: "max-off",
    label: "Off, Low, Medium, High, Max",
    efforts: ["low", "medium", "high", "max"],
    allowsOff: true
  }
];
function effortSelectValue(d) {
  const raw = d.supported_reasoning_efforts;
  if (!Array.isArray(raw)) return "unknown";
  const csv = raw.map((x) => String(x ?? "").trim()).filter(Boolean).join(",");
  if (csv === "") return "none";
  for (const p of EFFORT_PRESETS) {
    if (p.efforts === null || p.efforts.length === 0) continue;
    if (p.efforts.join(",") === csv && p.allowsOff === d.reasoning_allows_off) return p.id;
  }
  return `custom:${csv}:${d.reasoning_allows_off === true ? "on" : "off"}`;
}
function effortTitle(d) {
  const current = effortText(d);
  return 'Reasoning effort: which thinking levels this real model accepts. Saving here makes the "Reasoning effort" submenu appear in the DSH model picker; the selected level is sent upstream and clamped against this table by the gateway. States: unset = gateway does not gate or send; no reasoning = never sent; a level list = clamped then forwarded.' + (current ? ` Current: ${current}` : "");
}
function anomalyOf(d) {
  if ((d.usable_endpoint_count ?? 0) === 0) {
    return `${d.provider} \u540D\u4E0B\u6CA1\u6709\u53EF\u7528\u5BC6\u94A5(\u7F3A\u914D\u7F6E),\u8BE5\u6A21\u578B\u6CA1\u6709\u53EF\u7528\u7684\u7AEF\u70B9\u3002`;
  }
  return "";
}
function fmtCooldown(d) {
  if (!d.in_cooldown || d.cooldown_remaining_s == null) return "\u2014";
  return fmtDuration(d.cooldown_remaining_s);
}
function fmtLatency(d) {
  const v = d.avg_ttft_ms;
  if (v === null || v === void 0 || !Number.isFinite(v)) return "\u2014";
  return `${fmtSecFromMs(v)} s`;
}
function fmtTps2(d) {
  const v = d.avg_tps;
  if (v === null || v === void 0 || !Number.isFinite(v)) return "\u2014";
  return fmtInt(v);
}
function hasTtft(d) {
  const v = d.avg_ttft_ms;
  return v !== null && v !== void 0 && Number.isFinite(v);
}
function hasTps(d) {
  const v = d.avg_tps;
  return v !== null && v !== void 0 && Number.isFinite(v);
}
function latencyTitle(d) {
  const parts = [];
  if (d.latency_day) parts.push(`${d.latency_day} \u8BB0\u5F55`);
  if (d.avg_ttft_ms != null) parts.push(`\u5E73\u5747 TTFT ${d.avg_ttft_ms} ms`);
  if (d.avg_tps != null) parts.push(`\u5E73\u5747 TPS ${d.avg_tps}`);
  return parts.join(" \xB7 ");
}
function exposeTitle(d) {
  if (d.listed)
    return "\u5DF2\u7EB3\u5165:\u5916\u90E8\u80FD\u5728\u6A21\u578B\u5217\u8868\u91CC\u770B\u5230\u5E76\u76F4\u63A5\u4EE5 \u4F9B\u5E94\u5546/\u6A21\u578Bid \u8C03\u7528\u3002\u70B9\u300C\u672A\u7EB3\u5165\u300D\u628A\u5B83\u4ECE\u5217\u8868\u91CC\u79FB\u9664 \u2014\u2014 \u26A0\uFE0F \u79FB\u9664\u540E\u4ECD\u7136\u53EF\u4EE5\u76F4\u63A5\u8BF7\u6C42,\u4E5F\u53EF\u4EE5\u88AB\u903B\u8F91\u6A21\u578B\u5F15\u7528\u3002";
  return "\u672A\u7EB3\u5165:\u6A21\u578B\u5217\u8868\u91CC\u770B\u4E0D\u5230\u5B83\u3002\u26A0\uFE0F \u4F46\u5B83\u4ECD\u7136\u53EF\u4EE5\u88AB\u76F4\u63A5\u8BF7\u6C42\u3001\u4E5F\u53EF\u4EE5\u88AB\u903B\u8F91\u6A21\u578B\u5F15\u7528 \u2014\u2014 \u8FD9\u91CC\u53EA\u63A7\u5236\u300C\u662F\u5426\u7EB3\u5165\u300D\u3002";
}
function DeploymentsPage(_props) {
  const [deployments, setDeployments] = import_react3.default.useState([]);
  const [error, setError] = import_react3.default.useState("");
  const [notice, setNotice] = import_react3.default.useState("");
  const [directBusy, setDirectBusy] = import_react3.default.useState("");
  const [effortBusy, setEffortBusy] = import_react3.default.useState("");
  async function load() {
    try {
      const dep = await rendererApi.getDeployments();
      setDeployments(dep.deployments);
      setError("");
    } catch (e) {
      setError(msg2(e));
    }
  }
  import_react3.default.useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1e4);
    return () => window.clearInterval(timer);
  }, []);
  const exposedCount = deployments.reduce((n3, d) => n3 + (d.listed ? 1 : 0), 0);
  const sorted = import_react3.default.useMemo(
    () => [...deployments].sort((a, b) => {
      const dt = (b.total_tokens ?? 0) - (a.total_tokens ?? 0);
      if (dt !== 0) return dt;
      const dr = (b.requests ?? 0) - (a.requests ?? 0);
      if (dr !== 0) return dr;
      return a.model.localeCompare(b.model);
    }),
    [deployments]
  );
  async function toggleDirect(d) {
    if (directBusy) return;
    setDirectBusy(d.deployment_id);
    setError("");
    setNotice("");
    try {
      const r = await rendererApi.setDeploymentExposure(d.deployment_id, "direct", !d.listed);
      if (!r.ok) {
        setError(r.message || "\u64CD\u4F5C\u5931\u8D25");
        return;
      }
      setNotice(r.message ?? (d.listed ? "\u5DF2\u4ECE\u6A21\u578B\u5217\u8868\u79FB\u9664" : "\u5DF2\u7EB3\u5165\u6A21\u578B\u5217\u8868"));
      await load();
    } catch (e) {
      setError(msg2(e));
    } finally {
      setDirectBusy("");
    }
  }
  async function saveConcurrency(d, raw) {
    const n3 = Number(raw);
    if (!Number.isFinite(n3) || n3 < 1) return;
    const capped = Math.min(1 << 20, Math.max(1, Math.trunc(n3)));
    if (capped === (d.concurrency ?? 1)) return;
    setDirectBusy(d.deployment_id);
    setError("");
    setNotice("");
    try {
      const r = await rendererApi.setDeploymentExposure(d.deployment_id, "direct", d.listed, capped);
      if (!r.ok) {
        setError(r.message || "\u64CD\u4F5C\u5931\u8D25");
        return;
      }
      setNotice(`\u5E76\u53D1\u4E0A\u9650\u5DF2\u6539\u4E3A ${capped}(${r.message ?? ""})`);
      setDeployments(
        (prev) => prev.map(
          (it) => it.deployment_id === d.deployment_id ? { ...it, concurrency: capped } : it
        )
      );
    } catch (e) {
      setError(msg2(e));
    } finally {
      setDirectBusy("");
    }
  }
  async function saveReasoning(d, value) {
    if (value.startsWith("custom:")) return;
    const preset = EFFORT_PRESETS.find((p) => p.id === value);
    if (!preset) return;
    if (effortSelectValue(d) === preset.id) return;
    if (effortBusy) return;
    setEffortBusy(d.deployment_id);
    setError("");
    setNotice("");
    try {
      const r = await rendererApi.setDeploymentReasoning(d.deployment_id, preset.efforts, preset.allowsOff);
      if (!r.ok) {
        setError(r.message || "\u64CD\u4F5C\u5931\u8D25");
        return;
      }
      setNotice(r.message ?? "\u601D\u8003\u5F3A\u5EA6\u5DF2\u4FDD\u5B58");
      await load();
    } catch (e) {
      setError(msg2(e));
    } finally {
      setEffortBusy("");
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "section dep-section", children: [
    error ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "err", role: "alert", children: error }) : null,
    notice ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "savedNotice", role: "status", children: notice }) : null,
    deployments.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "hint na", children: "\u5C1A\u65E0\u771F\u5B9E\u6A21\u578B \u2014\u2014 \u5148\u5230\u300C\u517C\u5BB9\u4F9B\u5E94\u5546\u300D\u6216\u5BF9\u5E94\u6E20\u9053\u9875\u767B\u8BB0\u6A21\u578B\u3002 \u767B\u8BB0\u540E\u7AEF\u70B9\u81EA\u52A8\u6210\u7ACB(\u7AEF\u70B9 = \u771F\u5B9E\u6A21\u578B \xD7 \u8BE5\u4F9B\u5E94\u5546\u540D\u4E0B\u7684\u51ED\u636E\u884C)\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dep-toolbar", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dep-summary", children: [
        deployments.length,
        " \u4E2A\u771F\u5B9E\u6A21\u578B",
        exposedCount > 0 ? ` \xB7 ${exposedCount} \u4E2A\u5DF2\u7EB3\u5165\u6A21\u578B\u5217\u8868` : ""
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dep-grid", children: sorted.map((d) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "depCard", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "depCardHead", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "depProvider", title: "\u4F9B\u5E94\u5546", children: d.provider || "\u672A\u5206\u7EC4" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("code", { className: "depCode", title: `\u771F\u5B9E\u6A21\u578B:${d.deployment_id}`, children: d.model }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "depCheck", title: exposeTitle(d), children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "input",
              {
                className: "checkInput",
                type: "checkbox",
                checked: d.listed,
                disabled: directBusy === d.deployment_id,
                onChange: () => void toggleDirect(d)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "\u7EB3\u5165\u6A21\u578B\u5217\u8868" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "depCardBody", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "depChips", children: [
          anomalyOf(d) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "pill alert", title: anomalyOf(d), children: "\u5F02\u5E38" }) : null,
          d.in_cooldown ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "pill bad", children: [
            "\u51B7\u5374 ",
            fmtCooldown(d)
          ] }) : null,
          d.supports_vision ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "pill info", children: "\u89C6\u89C9" }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "depChipEdit", title: effortTitle(d), children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "chipLabel", children: "Thinking" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
              "select",
              {
                className: "chipSelect",
                value: effortSelectValue(d),
                disabled: effortBusy === d.deployment_id,
                onChange: (e) => void saveReasoning(d, e.currentTarget.value),
                children: [
                  EFFORT_PRESETS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: p.id, children: p.label }, p.id)),
                  effortSelectValue(d).startsWith("custom:") ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("option", { value: effortSelectValue(d), children: [
                    "Custom(",
                    effortText(d) || "\u2014",
                    ")"
                  ] }) : null
                ]
              }
            )
          ] }),
          hasTtft(d) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "pill metric", title: latencyTitle(d), children: [
            "TTFT ",
            fmtLatency(d)
          ] }) : null,
          hasTps(d) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "pill metric", title: latencyTitle(d), children: [
            "TPS ",
            fmtTps2(d)
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "label",
            {
              className: "depChipEdit",
              title: `\u5E76\u53D1\u4E0A\u9650(\u6309\u771F\u5B9E\u6A21\u578B\u805A\u5408)\u3002\u6539\u5B8C\u56DE\u8F66/\u5931\u7126\u5373\u5B58,\u5F53\u524D ${d.concurrency ?? 1}`,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "chipLabel", children: "\u5E76\u53D1" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "input",
                  {
                    className: "chipNum",
                    type: "number",
                    min: 1,
                    max: 1048576,
                    step: 1,
                    defaultValue: d.concurrency ?? 1,
                    disabled: directBusy === d.deployment_id,
                    onChange: (e) => void saveConcurrency(d, e.currentTarget.value)
                  },
                  `${d.deployment_id}:${d.concurrency ?? 1}`
                )
              ]
            }
          )
        ] }) })
      ] }, d.deployment_id)) })
    ] })
  ] });
}
var DeploymentsPage_default = DeploymentsPage;

// ../panel-ui/src/pages/models/ChannelPage.tsx
var import_react6 = __toESM(require("react"), 1);

// ../panel-ui/src/components/ModelTable.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function ph(v) {
  return v == null ? "" : String(v);
}
function ModelTable({
  rows,
  showRate = true,
  disabled = false,
  emptyText = "\u672A\u67E5\u5230\u6A21\u578B\u76EE\u5F55(\u70B9\u300C\u5237\u65B0\u300D\u4ECE\u4E0A\u6E38\u62C9\u4E00\u6B21)",
  onEdit,
  onCommit,
  plainColumns = false,
  toolbar,
  actions
}) {
  function editOnChange(e) {
    onEdit(e);
  }
  function commitOnBlur(e) {
    if (onCommit !== void 0) onCommit(e);
  }
  if (rows.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "models-block", children: [
      toolbar ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "models-toolbar", children: toolbar }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "empty", children: emptyText })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "models-block", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "models-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "models-toolbar-left", children: toolbar }),
      actions ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "models-toolbar-right", children: actions }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("table", { className: "models-table", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { className: "models-col-enable", children: "\u542F\u7528" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u6A21\u578B" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u540D\u79F0" }),
        showRate ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u500D\u7387" }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u4E0A\u4E0B\u6587\u7A97\u53E3" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u6700\u5927\u8F93\u51FA" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("th", { children: "\u89C6\u89C9" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("tbody", { children: rows.map((row, i) => {
        const locked = disabled || !row.exposed;
        const cls = [
          row.exposed ? "on" : "",
          row.available === false ? "off" : "",
          row.callable === false ? "nocall" : ""
        ].filter(Boolean).join(" ");
        return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("tr", { className: cls, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              type: "checkbox",
              "aria-label": `\u542F\u7528:${row.id}`,
              checked: row.exposed,
              disabled: disabled || row.available === false,
              onChange: (ev) => {
                const e = { id: row.id, field: "exposed", value: ev.target.checked };
                editOnChange(e);
                commitOnBlur(e);
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("td", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { title: row.fullId || row.id, children: row.id }),
            row.callable === false ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "tag-warn", title: "\u4E0A\u6E38\u76EE\u5F55\u5217\u4E86\u5B83,\u4F46\u4E0D\u5728 chat \u7AEF\u70B9\u8BA4\u7684\u540D\u5355\u91CC,\u53EF\u80FD\u8C03\u4E0D\u901A", children: "\u53EF\u80FD\u4E0D\u53EF\u7528" }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: plainColumns ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "plain-cell", children: row.name || "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              className: "input name",
              type: "text",
              value: row.name,
              placeholder: row.id,
              disabled: locked,
              onChange: (ev) => editOnChange({ id: row.id, field: "name", value: ev.target.value }),
              onBlur: () => commitOnBlur({ id: row.id, field: "name", value: row.name }),
              onKeyDown: (ev) => {
                if (ev.key === "Enter") ev.currentTarget.blur();
              }
            }
          ) }),
          showRate ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { className: "rate-cell", children: row.rate != null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "mono", children: [
            "x",
            row.rate
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "na", children: "\u2014" }) }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: plainColumns ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "plain-cell", children: ph(row.defaultContext) || "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              className: "input num",
              type: "number",
              min: 0,
              value: row.context,
              placeholder: ph(row.defaultContext) || "\u2014",
              disabled: locked,
              onChange: (ev) => editOnChange({ id: row.id, field: "context", value: ev.target.value }),
              onBlur: () => commitOnBlur({ id: row.id, field: "context", value: row.context }),
              onKeyDown: (ev) => {
                if (ev.key === "Enter") ev.currentTarget.blur();
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: plainColumns ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "plain-cell", children: ph(row.defaultOutput) || "\u2014" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "input",
            {
              className: "input num",
              type: "number",
              min: 0,
              value: row.output,
              placeholder: ph(row.defaultOutput) || "\u2014",
              disabled: locked,
              onChange: (ev) => editOnChange({ id: row.id, field: "output", value: ev.target.value }),
              onBlur: () => commitOnBlur({ id: row.id, field: "output", value: row.output }),
              onKeyDown: (ev) => {
                if (ev.key === "Enter") ev.currentTarget.blur();
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "vision-cell", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "input",
              {
                type: "checkbox",
                "aria-label": `\u89C6\u89C9:${row.id}`,
                checked: row.vision,
                disabled: locked || plainColumns,
                onChange: (ev) => {
                  const e = { id: row.id, field: "vision", value: ev.target.checked };
                  editOnChange(e);
                  commitOnBlur(e);
                }
              }
            ),
            row.visionUpstream ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "dot", title: "\u4E0A\u6E38\u539F\u751F\u89C6\u89C9\u6A21\u578B", children: "\u25CF" }) : null
          ] }) })
        ] }, row.id ?? i);
      }) })
    ] })
  ] });
}
var ModelTable_default = ModelTable;

// ../panel-ui/src/components/ClientPaths.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var EXAMPLE_PATHS = {
  trae: "C:\\Program Files\\Trae\\Trae.exe",
  "trae-cn": "C:\\Program Files\\Trae CN\\Trae CN.exe",
  workbuddy: "C:\\Program Files\\WorkBuddy\\WorkBuddy.exe",
  sensenova: "SenseNova \u65E0\u672C\u673A\u5BA2\u6237\u7AEF,\u65E0\u9700\u586B\u5199"
};
function ClientPaths({ provider, rows, busy = false, onSave, onDetect }) {
  const mine = rows.filter((r) => r.channel === provider && r.channel !== "trae");
  if (mine.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "na", children: "\u65E0\u6B64\u6E20\u9053\u7684\u5BA2\u6237\u7AEF\u8DEF\u5F84\u914D\u7F6E\u3002" });
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "client-paths", children: mine.map((row) => {
    const placeholder = row.effective_path || row.detected_path || EXAMPLE_PATHS[row.channel] || "\u586B\u5BA2\u6237\u7AEF\u53EF\u6267\u884C\u6587\u4EF6\u7684\u5B8C\u6574\u8DEF\u5F84,\u5982 C:\\Program Files\\<\u5382\u5546>\\<\u7A0B\u5E8F>.exe";
    const title = row.saved_path ? "\u5F53\u524D\u7528\u7684\u662F\u672C\u9875\u4FDD\u5B58\u7684\u8DEF\u5F84(\u81EA\u52A8\u63A2\u6D4B\u5230\u7684\u4F1A\u88AB\u5B83\u76D6\u4F4F);\u6E05\u7A7A\u53EF\u9000\u56DE\u81EA\u52A8\u63A2\u6D4B" : "\u5F53\u524D\u7528\u7684\u662F\u81EA\u52A8\u63A2\u6D4B\u5230\u7684\u8DEF\u5F84,\u586B\u8FD9\u91CC\u53EF\u8986\u76D6\u5B83\u3002\u8F93\u5165\u5B8C\u79BB\u5F00\u8F93\u5165\u6846\u5373\u4FDD\u5B58";
    const state = row.saved_path ? "\u5DF2\u4FDD\u5B58" : row.detected_path ? "\u81EA\u52A8\u63A2\u6D4B" : "\u672A\u8BBE\u7F6E";
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "cp-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { children: "\u5BA2\u6237\u7AEF\u8DEF\u5F84" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "input",
        {
          type: "text",
          className: "input cp-input",
          placeholder,
          title,
          defaultValue: row.effective_path || row.saved_path || "",
          disabled: busy,
          onBlur: (e) => onSave(row.channel, e.currentTarget.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }
        }
      ),
      onDetect ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("button", { type: "button", className: "btn btn-sm", disabled: busy, onClick: () => onDetect(row.channel), children: "\u68C0\u6D4B" }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "cp-state", children: state })
    ] }, row.channel);
  }) });
}
var ClientPaths_default = ClientPaths;

// ../panel-ui/src/components/AccountRows.tsx
var import_react4 = __toESM(require("react"), 1);
var import_jsx_runtime8 = require("react/jsx-runtime");
function AccountRows({
  accounts,
  emptyText = "\u6682\u65E0\u8D26\u53F7",
  footer = null
}) {
  if (accounts.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "acct-cards", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "chan-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "chan-empty", children: emptyText }),
      footer
    ] }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "acct-cards", children: accounts.map((a) => {
    const rights = a.right == null ? [] : Array.isArray(a.right) ? a.right : [a.right];
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "chan-card acct-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "acct-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "acct-row-left", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "span",
            {
              className: a.dot && a.dot !== "off" ? `dot ${a.dot}` : "dot off",
              "aria-hidden": "true"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "acct-name", children: a.label }),
          a.note ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "chan-sub", children: a.note }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "acct-row-right", children: rights.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_react4.default.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: r.tone ? `chan-badge ${r.tone}` : "chan-badge", children: [
            r.key,
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("b", { children: r.value })
          ] }),
          r.sub ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "chan-badge", children: r.sub }) : null
        ] }, `${r.key}-${i}`)) })
      ] }),
      footer
    ] }, a.id);
  }) });
}

// ../panel-ui/src/pages/models/models-action.ts
var import_react5 = __toESM(require("react"), 1);
var ModelsActionContext = import_react5.default.createContext(() => {
});
var ModelsActionProvider = ModelsActionContext.Provider;
function useModelsActionPublisher() {
  return import_react5.default.useContext(ModelsActionContext);
}

// ../panel-ui/src/pages/models/ChannelPage.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function bare(id) {
  const i = id.lastIndexOf("/");
  return i >= 0 ? id.slice(i + 1) : id;
}
function ago(nowMs, ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((nowMs - ms) / 1e3));
  if (s < 60) return `${Math.round(s)} \u79D2\u524D`;
  if (s < 3600) return `${Math.round(s / 60)} \u5206\u949F\u524D`;
  if (s < 86400) return `${Math.round(s / 3600)} \u5C0F\u65F6\u524D`;
  return `${Math.round(s / 86400)} \u5929\u524D`;
}
function fmtTime(ms) {
  if (!ms) return "\u2014";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleString();
}
function fmtNum(v) {
  if (v === null || v === void 0) return "\u2014";
  return Number(v).toLocaleString(void 0, { maximumFractionDigits: 2 });
}
function num(v) {
  const t = v.trim();
  if (!t) return null;
  const n3 = Number(t);
  return Number.isFinite(n3) && n3 > 0 ? Math.round(n3) : null;
}
function toDraft(models) {
  return models.map((m) => ({
    id: bare(m.id),
    fullId: m.id,
    name: m.name,
    exposed: m.exposed,
    available: m.available,
    vision: m.vision,
    context: m.context_window != null ? String(m.context_window) : "",
    output: m.max_output != null ? String(m.max_output) : "",
    rate: m.rate,
    registered: m.registered,
    callable: m.callable,
    origin: m.origin,
    endpoints: m.endpoints,
    visionUpstream: m.default_vision ?? false,
    defaultContext: m.default_context,
    defaultOutput: m.default_output
  }));
}
function ChannelPage({ provider }) {
  const [page, setPage] = import_react6.default.useState(null);
  const [draft, setDraft] = import_react6.default.useState([]);
  const [error, setError] = import_react6.default.useState("");
  const [saving, setSaving] = import_react6.default.useState(false);
  const [scanning, setScanning] = import_react6.default.useState(false);
  const [syncing, setSyncing] = import_react6.default.useState(false);
  const [syncMsg, setSyncMsg] = import_react6.default.useState("");
  const [syncStartMs, setSyncStartMs] = import_react6.default.useState(null);
  const [nowMs, setNowMs] = import_react6.default.useState(() => Date.now());
  const [pathMsg, setPathMsg] = import_react6.default.useState("");
  const [pathBusy, setPathBusy] = import_react6.default.useState(false);
  async function load() {
    try {
      const p = await rendererApi.getProviderPage(provider);
      setPage(p);
      setDraft(toDraft(p.models));
      setError("");
      setSyncMsg("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  import_react6.default.useEffect(() => {
    let alive = true;
    void (async () => {
      await load();
      if (!alive) return;
      const p = await rendererApi.getProviderPage(provider).catch(() => null);
      if (!alive) return;
      if (p?.signed_in) await syncAll(false);
    })();
    return () => {
      alive = false;
    };
  }, [provider]);
  import_react6.default.useEffect(() => {
    const iv = window.setInterval(
      () => setNowMs(Date.now()),
      syncing ? 200 : 2e4
    );
    return () => window.clearInterval(iv);
  }, [syncing]);
  const signedIn = page?.signed_in === true;
  const credits = page?.credits ?? null;
  const elapsedMs = syncStartMs !== null ? Math.max(0, nowMs - syncStartMs) : 0;
  const elapsedSecText = (elapsedMs / 1e3).toFixed(1);
  const refreshNote = syncing ? `\u6B63\u5728\u5237\u65B0 \xB7 \u5DF2\u7528 ${elapsedSecText}s` : !signedIn ? "\u672A\u63A5\u5165\u8D26\u53F7" : credits && credits.fetched_at_ms ? `\u4E8E ${ago(nowMs, credits.fetched_at_ms)}\u5237\u65B0` : "\u5C1A\u672A\u91C7\u96C6";
  const accountRows = import_react6.default.useMemo(() => {
    const list = page?.accounts ?? [];
    return list.map((a) => {
      const c = a.credits ?? null;
      const hasLeft = c !== null && !c.not_applicable && c.left != null;
      return {
        id: a.label,
        label: a.label,
        note: a.region,
        dot: "ok",
        right: hasLeft && c ? {
          key: "\u5269\u4F59\u79EF\u5206",
          value: fmtNum(c.left),
          sub: `\u6700\u8FD1\u5230\u671F ${fmtTime(c.expires_at_ms)}`,
          tone: "ok"
        } : null
      };
    });
  }, [page]);
  const creditsError = import_react6.default.useMemo(() => {
    if (!page || page.accounts.length === 0) return "";
    const anyLeft = page.accounts.some((a) => {
      const c = a.credits;
      return c !== null && c !== void 0 && !c.not_applicable && c.left != null;
    });
    if (anyLeft) return "";
    return page.credits?.error ?? "";
  }, [page]);
  function applyEdit(e) {
    setDraft(
      (rows) => rows.map((row) => {
        if (row.id !== e.id) return row;
        switch (e.field) {
          case "exposed":
            return { ...row, exposed: Boolean(e.value) };
          case "vision":
            return { ...row, vision: Boolean(e.value) };
          case "name":
            return { ...row, name: String(e.value) };
          case "context":
            return { ...row, context: String(e.value) };
          case "output":
            return { ...row, output: String(e.value) };
        }
        return row;
      })
    );
  }
  function withEdit(row, e) {
    switch (e.field) {
      case "exposed":
        return { ...row, exposed: Boolean(e.value) };
      case "vision":
        return { ...row, vision: Boolean(e.value) };
      case "name":
        return { ...row, name: String(e.value) };
      case "context":
        return { ...row, context: String(e.value) };
      case "output":
        return { ...row, output: String(e.value) };
    }
    return row;
  }
  async function commitEdit(e) {
    const base = draft.find((r) => r.id === e.id);
    if (!base) return;
    const row = withEdit(base, e);
    setSaving(true);
    setError("");
    try {
      const r = await rendererApi.setChannelModel(provider, {
        id: row.fullId,
        name: row.name.trim(),
        vision: row.vision,
        context_window: num(row.context),
        max_output: num(row.output),
        exposed: row.exposed
      });
      if (!r.ok) {
        setError(r.message ?? "\u4FDD\u5B58\u5931\u8D25");
        await load();
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setSaving(false);
    }
  }
  async function syncAll(force = true) {
    if (syncing) return;
    setSyncing(true);
    setSyncStartMs(Date.now());
    setNowMs(Date.now());
    setError("");
    setSyncMsg("");
    try {
      const r = await rendererApi.syncChannel(provider, force);
      await load();
      const ci = r.checkin;
      if (ci?.supported && (ci.failed || ci.message)) {
        setError(`\u7B7E\u5230:${ci.message ?? ci.errors?.[0] ?? "\u7B7E\u5230\u5931\u8D25"}`);
      }
      const errMap = r.errors ?? {};
      if (Object.keys(errMap).length > 0) {
        setError(Object.entries(errMap).map(([aid, why]) => `${aid}:${why}`).join(";"));
      }
      if (force) setSyncMsg(r.message ?? "\u5DF2\u5237\u65B0");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
      setSyncStartMs(null);
    }
  }
  async function discoverAndAdopt() {
    if (scanning) return;
    setScanning(true);
    setError("");
    try {
      const d = await rendererApi.discoverChannelAccounts(provider);
      if (!d.ok || !d.found || d.accounts.length === 0) {
        setError(d.message);
        return;
      }
      const adopted = [];
      const failed = [];
      for (const acc of d.accounts) {
        const r = await rendererApi.adoptChannelAccount(
          provider,
          acc.username,
          acc.token ?? "",
          acc.region ?? void 0
        );
        if (r.ok) adopted.push(acc.username);
        else failed.push(acc.username);
      }
      await load();
      if (failed.length > 0) {
        setError(`\u5DF2\u63A5\u5165 ${adopted.length} \u4E2A,\u5931\u8D25 ${failed.length} \u4E2A(${failed.join(", ")})`);
      } else if (adopted.length > 0) {
        setPathMsg(`\u5DF2\u81EA\u52A8\u53D1\u73B0\u5E76\u63A5\u5165 ${adopted.length} \u4E2A\u8D26\u53F7:${adopted.join(", ")}`);
      } else {
        setError(d.message);
      }
    } catch (e) {
      setError(`\u81EA\u52A8\u53D1\u73B0\u5931\u8D25,\u8BF7\u624B\u52A8\u7F16\u8F91 as-one.credentials.json(${e instanceof Error ? e.message : String(e)})`);
    } finally {
      setScanning(false);
    }
  }
  async function savePath(channel, path) {
    setPathBusy(true);
    setPathMsg("");
    try {
      const r = await rendererApi.saveClientPath(channel, path);
      if (!r.ok) setPathMsg(`\u4FDD\u5B58\u5931\u8D25:${r.message ?? "\u672A\u77E5\u539F\u56E0"}`);
      await load();
    } catch (e) {
      setPathMsg(`\u4FDD\u5B58\u5931\u8D25:${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPathBusy(false);
    }
  }
  async function detectPath(channel) {
    if (pathBusy) return;
    setPathBusy(true);
    setPathMsg("");
    try {
      const r = await rendererApi.detectClientPath(channel);
      const found = r.ok && typeof r.detected_path === "string" && r.detected_path.length > 0 ? r.detected_path : null;
      setPathMsg(found ? `\u68C0\u6D4B\u5230 ${found}` : r.message ?? `${channel} \u672A\u68C0\u6D4B\u5230\u5BA2\u6237\u7AEF\u8DEF\u5F84`);
      await load();
    } catch (e) {
      setPathMsg(`\u68C0\u6D4B\u5931\u8D25:${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPathBusy(false);
    }
  }
  const publishAction = useModelsActionPublisher();
  const syncAllRef = import_react6.default.useRef(syncAll);
  syncAllRef.current = syncAll;
  import_react6.default.useEffect(() => {
    publishAction({
      label: syncing ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0",
      note: refreshNote,
      noteBusy: syncing,
      disabled: syncing || !signedIn,
      run: () => void syncAllRef.current()
    });
    return () => publishAction(null);
  }, [publishAction, syncing, signedIn, refreshNote]);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "chan-page", children: [
    error ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "chan-banner err", role: "alert", children: error }) : null,
    syncMsg ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "chan-banner ok", role: "status", children: syncMsg }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      AccountRows,
      {
        accounts: accountRows,
        emptyText: signedIn ? "\u6682\u65E0\u8D26\u53F7" : "\u672A\u63A5\u5165\u8D26\u53F7",
        footer: creditsError ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "chan-hint warn-line", children: creditsError }) : null
      }
    ),
    !signedIn ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "acct-cta", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "button",
      {
        type: "button",
        className: "btn primary",
        disabled: scanning,
        onClick: () => void discoverAndAdopt(),
        children: scanning ? "\u63A5\u5165\u4E2D\u2026" : "\u81EA\u52A8\u53D1\u73B0\u5E76\u63A5\u5165"
      }
    ) }) : null,
    !page ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "chan-card", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "chan-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }) }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("article", { className: "chan-card", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        ModelTable_default,
        {
          rows: draft,
          disabled: saving,
          emptyText: page.message ?? "\u672A\u67E5\u5230\u6A21\u578B\u76EE\u5F55",
          onEdit: applyEdit,
          onCommit: (e) => void commitEdit(e),
          toolbar: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: "\u6A21\u578B\u76EE\u5F55" }) })
        }
      ) }),
      provider !== "trae" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("article", { className: "chan-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: "\u5BA2\u6237\u7AEF\u8DEF\u5F84" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          ClientPaths_default,
          {
            provider,
            rows: page.client_paths,
            busy: pathBusy,
            onSave: (channel, path) => void savePath(channel, path),
            onDetect: (channel) => void detectPath(channel)
          }
        ),
        pathMsg ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "chan-hint warn-line", children: pathMsg }) : null
      ] }) : null
    ] })
  ] });
}

// ../panel-ui/src/pages/models/SenseNovaPage.tsx
var import_react7 = __toESM(require("react"), 1);
var import_jsx_runtime10 = require("react/jsx-runtime");
function n(value) {
  if (value === null || value === void 0) return "\u2014";
  return Math.round(value).toLocaleString("en-US");
}
function ts(value) {
  if (!value) return "\u2014";
  const d = new Date(value * 1e3);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDuration2(v) {
  if (v === null || v === void 0 || !Number.isFinite(Number(v))) return "\u2014";
  const s = Math.max(0, Math.floor(Number(v)));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function bare2(id) {
  const i = id.lastIndexOf("/");
  return i >= 0 ? id.slice(i + 1) : id;
}
function numOf(v) {
  const t = (v ?? "").trim();
  if (!t) return null;
  const n3 = Number(t);
  return Number.isFinite(n3) && n3 > 0 ? Math.round(n3) : null;
}
function refreshNoteOf(refresh, elapsedSecText, busy, localResult) {
  if (busy) return `\u6B63\u5728\u5237\u65B0 \xB7 \u5DF2\u7528 ${elapsedSecText}s`;
  if (localResult !== null) {
    const verdict = localResult.ok ? "\u6210\u529F" : "\u5931\u8D25";
    const body = localResult.text === "" ? verdict : `${verdict}:${localResult.text}`;
    return `${body} \xB7 \u7528\u65F6 ${(localResult.elapsedMs / 1e3).toFixed(1)}s`;
  }
  return refresh?.result ?? "";
}
function SenseNovaPage() {
  const [status, setStatus] = import_react7.default.useState(null);
  const [catalog, setCatalog] = import_react7.default.useState([]);
  const [error, setError] = import_react7.default.useState("");
  const [refreshMsg, setRefreshMsg] = import_react7.default.useState("");
  const [refreshingLocal, setRefreshingLocal] = import_react7.default.useState(false);
  const [localResult, setLocalResult] = import_react7.default.useState(null);
  const [nowMs, setNowMs] = import_react7.default.useState(() => Date.now());
  const localStartMsRef = import_react7.default.useRef(null);
  const [draft, setDraft] = import_react7.default.useState({});
  const [saving, setSaving] = import_react7.default.useState(false);
  const dirtyRef = import_react7.default.useRef(false);
  function markDirty(v) {
    dirtyRef.current = v;
  }
  async function load() {
    try {
      const [s, m] = await Promise.all([rendererApi.getSensenovaStatus(), rendererApi.getSensenovaModels()]);
      setStatus(s);
      setCatalog(m);
      if (!dirtyRef.current) setDraft({});
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const runningRef = import_react7.default.useRef(false);
  const fastRef = import_react7.default.useRef(null);
  const slowRef = import_react7.default.useRef(null);
  function stopFast() {
    if (fastRef.current !== null) {
      window.clearInterval(fastRef.current);
      fastRef.current = null;
    }
  }
  function startSlow() {
    if (slowRef.current === null) {
      slowRef.current = window.setInterval(() => void load(), 1e4);
    }
  }
  function startFast() {
    stopFast();
    if (slowRef.current !== null) {
      window.clearInterval(slowRef.current);
      slowRef.current = null;
    }
    fastRef.current = window.setInterval(() => {
      void load();
      if (runningRef.current) return;
      stopFast();
      startSlow();
    }, 2e3);
  }
  import_react7.default.useEffect(() => {
    runningRef.current = Boolean(status?.refresh?.running);
  }, [status]);
  import_react7.default.useEffect(() => {
    void (async () => {
      await load();
      startSlow();
      const s = await rendererApi.getSensenovaStatus().catch(() => null);
      const cooling = s?.auto_refresh?.cooling;
      const hasKey = (s?.accounts ?? []).some((a) => a.has_key);
      if (cooling !== true && !s?.refresh?.running && hasKey) {
        void refreshAllRef.current(false);
      }
    })();
    return () => {
      stopFast();
      if (slowRef.current !== null) {
        window.clearInterval(slowRef.current);
        slowRef.current = null;
      }
    };
  }, []);
  const refreshing = Boolean(status?.refresh?.running) || refreshingLocal;
  import_react7.default.useEffect(() => {
    const iv = window.setInterval(() => setNowMs(Date.now()), refreshing ? 200 : 2e4);
    return () => window.clearInterval(iv);
  }, [refreshing]);
  const accounts = status?.accounts ?? [];
  const refresh = status?.refresh ?? null;
  const elapsedMs = (() => {
    const started = refreshingLocal && localStartMsRef.current !== null && localStartMsRef.current !== void 0 ? localStartMsRef.current : refresh?.started_at_ms ?? refresh?.last_run_at_ms;
    if (!started) return 0;
    return Math.max(0, nowMs - started);
  })();
  const elapsedSecText = (elapsedMs / 1e3).toFixed(1);
  const refreshNote = refreshNoteOf(refresh, elapsedSecText, refreshing, localResult);
  const accountRows = import_react7.default.useMemo(() => {
    return accounts.map((acc) => {
      const pools = acc.quota?.pools ?? [];
      const ordered = [...pools].sort((a, b) => {
        const rank = (p) => p.pool_type === "dedicated" ? 1 : 0;
        return rank(a) - rank(b);
      });
      const resets = pools.map((p) => p.w5_reset_at).filter((v) => v !== null && v !== void 0);
      const nextReset = resets.length === 0 ? null : Math.min(...resets);
      const rights = ordered.map((p) => ({
        key: p.name || (p.pool_type === "dedicated" ? "\u4E13\u5C5E\u6C60" : "\u901A\u7528\u6C60"),
        value: n(p.w5_remaining),
        // 有余额才是绿;0 = 这个池的 5h 窗口真空了,用黄(与 Qoder 页同款)。
        tone: p.w5_remaining !== null && p.w5_remaining > 0 ? "ok" : "warn"
      }));
      if (nextReset !== null) rights.push({ key: "\u91CD\u7F6E", value: ts(nextReset) });
      const dot = acc.cooling ? "bad" : acc.has_key ? "ok" : "off";
      const flags = [];
      if (acc.key_hint) flags.push(`key ${acc.key_hint}`);
      if (!acc.has_key) flags.push("\u65E0\u5BC6\u94A5");
      if (!acc.has_password) flags.push("\u65E0\u5BC6\u7801");
      if (acc.cooling) flags.push(`\u51B7\u5374 ${fmtDuration2(acc.cooldown_remaining_s)}`);
      return {
        id: acc.account || acc.username,
        label: acc.account || acc.username,
        note: flags.join(" \xB7 "),
        dot,
        right: rights.length > 0 ? rights : null
      };
    });
  }, [accounts]);
  async function refreshAll(force = true) {
    if (refreshing) return;
    const startedMs = Date.now();
    setError("");
    setRefreshMsg("");
    setNowMs(startedMs);
    localStartMsRef.current = startedMs;
    setRefreshingLocal(true);
    try {
      const r = await rendererApi.sensenovaRefresh(force);
      setLocalResult({
        ok: r.ok,
        text: r.message ?? "",
        elapsedMs: Date.now() - startedMs
      });
      await load();
      if (!r.ok) setError(r.message ?? "\u5237\u65B0\u5931\u8D25");
      else setRefreshMsg(r.message ?? "\u5DF2\u5237\u65B0");
    } catch (e) {
      const msg4 = e instanceof Error ? e.message : String(e);
      setLocalResult({ ok: false, text: msg4, elapsedMs: Date.now() - startedMs });
      setError(msg4);
    } finally {
      setRefreshingLocal(false);
    }
    const s = await rendererApi.getSensenovaStatus().catch(() => null);
    if (s?.refresh?.running) startFast();
  }
  function rowsOf(models) {
    return models.map((m) => {
      const id = bare2(m.id);
      const d = draft[id] ?? {};
      return {
        id,
        fullId: m.id,
        name: typeof d.name === "string" ? d.name : m.name ?? id,
        context: typeof d.context === "string" ? d.context : m.context_window != null ? String(m.context_window) : "",
        output: typeof d.output === "string" ? d.output : m.max_output != null ? String(m.max_output) : "",
        vision: typeof d.vision === "boolean" ? d.vision : m.vision,
        exposed: typeof d.exposed === "boolean" ? d.exposed : m.registered,
        // ⚠️ 2026-10-23 修复:这里原来写 `m.available === false` —— 布尔被反转了。
        // ModelTable 用 `row.available === false` 来禁用 checkbox(L108)并加 "off" 类,
        // 反转后**所有可用模型**的行都 available=false → checkbox 全被禁用 →
        // 「sensenova页面不能配置模型」(不可用模型反而能勾选)。与 ChannelPage 对齐,
        // 且 null(未知可用性)不当禁用看。
        available: m.available ?? true,
        defaultContext: m.context_window,
        defaultOutput: m.max_output,
        visionUpstream: m.vision_upstream
      };
    });
  }
  const modelRows = rowsOf(catalog);
  function handleCatalogEdit(e) {
    setDraft((d) => ({ ...d, [e.id]: { ...d[e.id] ?? {}, [e.field]: e.value } }));
    markDirty(true);
  }
  function withEdit(row, e) {
    switch (e.field) {
      case "exposed":
        return { ...row, exposed: Boolean(e.value) };
      case "vision":
        return { ...row, vision: Boolean(e.value) };
      case "name":
        return { ...row, name: String(e.value) };
      case "context":
        return { ...row, context: String(e.value) };
      case "output":
        return { ...row, output: String(e.value) };
    }
    return row;
  }
  async function commitCatalogEdit(e) {
    const base = modelRows.find((r) => r.id === e.id);
    if (!base) return;
    const row = withEdit(base, e);
    setSaving(true);
    setError("");
    try {
      const r = await rendererApi.setChannelModel("sensenova", {
        id: row.fullId ?? `sensenova/${row.id}`,
        name: String(row.name ?? "").trim(),
        vision: Boolean(row.vision),
        context_window: numOf(row.context),
        max_output: numOf(row.output),
        exposed: row.exposed
      });
      if (!r.ok) {
        setError(r.message ?? "\u4FDD\u5B58\u767B\u8BB0\u5931\u8D25");
        markDirty(false);
        await load();
        return;
      }
      markDirty(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      markDirty(false);
      await load();
    } finally {
      setSaving(false);
    }
  }
  const [confirmDelete, setConfirmDelete] = import_react7.default.useState("");
  const [busy, setBusy] = import_react7.default.useState("");
  const [newUser, setNewUser] = import_react7.default.useState("");
  const [newPass, setNewPass] = import_react7.default.useState("");
  const [newKey, setNewKey] = import_react7.default.useState("");
  async function runBusy(tag, fn) {
    setBusy(tag);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  function removeAccount(account) {
    if (confirmDelete !== account) {
      setConfirmDelete(account);
      return;
    }
    void runBusy(`del:${account}`, async () => {
      const r = await rendererApi.sensenovaRemoveAccount(account);
      if (!r.ok) setError(r.message ?? "\u5220\u9664\u5931\u8D25");
      setConfirmDelete("");
      await load();
    });
  }
  function addAccount() {
    const name2 = newUser.trim();
    if (!name2 || !newPass) return;
    void runBusy("add", async () => {
      const r = await rendererApi.sensenovaAddAccount(name2, newPass, newKey.trim() || void 0);
      if (!r.ok) setError(r.message ?? "\u6DFB\u52A0\u8D26\u53F7\u5931\u8D25");
      else if (r.login_ok === false && r.message) setError(r.message);
      setNewUser("");
      setNewPass("");
      setNewKey("");
      await load();
    });
  }
  const publishAction = useModelsActionPublisher();
  const refreshAllRef = import_react7.default.useRef(refreshAll);
  refreshAllRef.current = refreshAll;
  import_react7.default.useEffect(() => {
    publishAction({
      label: refreshing ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0",
      note: refreshNote,
      noteBusy: refreshing,
      disabled: refreshing || accounts.length === 0,
      run: () => void refreshAllRef.current()
    });
    return () => publishAction(null);
  }, [publishAction, refreshing, accounts.length, refreshNote]);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "chan-page", children: [
    error ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "chan-banner err", role: "alert", children: error }) : null,
    refreshMsg ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "chan-banner ok", role: "status", children: refreshMsg }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(AccountRows, { accounts: accountRows, emptyText: "\u6682\u65E0\u8D26\u53F7" }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("article", { className: "chan-card", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      ModelTable_default,
      {
        rows: modelRows,
        showRate: false,
        disabled: saving,
        emptyText: "\u6682\u65E0\u6A21\u578B",
        onEdit: handleCatalogEdit,
        onCommit: (e) => void commitCatalogEdit(e),
        toolbar: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: "\u6A21\u578B\u76EE\u5F55" }) })
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("article", { className: "chan-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: "\u8D26\u53F7\u914D\u7F6E" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("table", { className: "sn-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("th", { children: "\u8D26\u53F7" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("th", { children: "API key" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("th", { className: "num", children: "\u64CD\u4F5C" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("tbody", { children: [
          accounts.map((row) => {
            const acc = row.account || row.username;
            return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { children: acc }) }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("td", { className: "sub", children: row.key_hint ?? "\u2014" }),
              /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("td", { className: "num", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "sn-ops", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
                "button",
                {
                  type: "button",
                  className: `btn btn-sm${confirmDelete === acc ? " danger" : ""}`,
                  disabled: busy === `del:${acc}`,
                  onClick: () => removeAccount(acc),
                  children: busy === `del:${acc}` ? "\u5220\u9664\u4E2D\u2026" : confirmDelete === acc ? "\u786E\u8BA4\u5220\u9664" : "\u5220\u9664"
                }
              ) }) })
            ] }, acc);
          }),
          accounts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("td", { colSpan: 3, className: "chan-empty", children: "\u6682\u65E0\u8D26\u53F7" }) }) : null
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sn-add", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            placeholder: "\u7528\u6237\u540D",
            value: newUser,
            onChange: (e) => setNewUser(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            type: "password",
            placeholder: "\u5BC6\u7801(\u4EC5\u5B58\u51ED\u636E\u6587\u4EF6)",
            value: newPass,
            autoComplete: "new-password",
            onChange: (e) => setNewPass(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            placeholder: "API key(\u53EF\u7559\u7A7A:\u767B\u5F55\u540E\u81EA\u52A8\u6293\u53D6)",
            value: newKey,
            onChange: (e) => setNewKey(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "button",
          {
            type: "button",
            className: "btn btn-sm primary",
            disabled: busy === "add" || !newUser.trim() || !newPass,
            onClick: addAccount,
            children: busy === "add" ? "\u6DFB\u52A0\u4E2D\u2026" : "\u6DFB\u52A0\u8D26\u53F7"
          }
        )
      ] })
    ] })
  ] });
}

// ../panel-ui/src/pages/models/QoderPage.tsx
var import_react8 = __toESM(require("react"), 1);
var import_jsx_runtime11 = require("react/jsx-runtime");
var REGION = "qoder";
function n2(value) {
  if (value === null || value === void 0) return "\u2014";
  return Math.round(value).toLocaleString("en-US");
}
function fmtAt(value) {
  if (!value) return "\u2014";
  return new Date(value * 1e3).toLocaleString();
}
function ago2(nowMs, ms) {
  if (!ms) return "\u2014";
  const s = Math.max(0, Math.round((nowMs - ms) / 1e3));
  if (s < 60) return `${s} \u79D2`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} \u5206\u949F`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} \u5C0F\u65F6`;
  return `${Math.round(h / 24)} \u5929`;
}
function errText(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
function checkinSummary(rows) {
  if (rows.length === 0) return "";
  const claimed = rows.filter((r) => r.status === "claimed");
  const already = rows.filter((r) => r.status === "already-claimed");
  const failed = rows.filter((r) => r.status === "unavailable");
  const parts = [];
  if (claimed.length > 0) {
    const credits = claimed.reduce((sum, r) => sum + (r.amount ?? 0), 0);
    parts.push(`\u7B7E\u5230 ${claimed.length} \u4E2A\u8D26\u53F7${credits > 0 ? `,\u5171 ${credits} \u79EF\u5206` : ""}`);
  }
  if (already.length > 0) parts.push(`${already.length} \u4E2A\u4ECA\u65E5\u5DF2\u9886`);
  if (failed.length > 0) {
    parts.push(`${failed.length} \u4E2A\u672A\u7B7E\u5230(${failed.map((r) => `${r.account}: ${r.message}`).join("\uFF1B")})`);
  }
  return parts.join(" \xB7 ");
}
function QoderPage() {
  const [status, setStatus] = import_react8.default.useState(null);
  const [accounts, setAccounts] = import_react8.default.useState([]);
  const [models, setModels] = import_react8.default.useState([]);
  const [credits, setCredits] = import_react8.default.useState([]);
  const [creditError, setCreditError] = import_react8.default.useState(null);
  const [catalogError, setCatalogError] = import_react8.default.useState(null);
  const [note, setNote] = import_react8.default.useState(null);
  const [busy, setBusy] = import_react8.default.useState(null);
  const [addName, setAddName] = import_react8.default.useState("");
  const [addPat, setAddPat] = import_react8.default.useState("");
  const [nowMs, setNowMs] = import_react8.default.useState(() => Date.now());
  const load = import_react8.default.useCallback(async () => {
    setBusy("load");
    try {
      const [st2, acc] = await Promise.all([
        rendererApi.getQoderStatus().catch(() => null),
        rendererApi.getQoderAccounts().catch(() => ({ accounts: [], count: 0 }))
      ]);
      setStatus(st2);
      setAccounts(acc.accounts);
      const rows = await rendererApi.getQoderModels(REGION).catch(() => []);
      setModels(rows);
      setCatalogError(rows.length === 0 ? "\u76EE\u5F55\u4E3A\u7A7A:\u4E0A\u6E38\u6CA1\u7ED9\u6A21\u578B\u6216\u8FD8\u6CA1\u62C9\u8FC7" : null);
      if (acc.accounts.length > 0) {
        const credit = await rendererApi.qoderCredits(REGION).catch((error) => {
          setCreditError(errText(error));
          return [];
        });
        setCredits(credit);
        if (credit.length > 0) setCreditError(null);
      }
    } finally {
      setBusy(null);
    }
  }, []);
  import_react8.default.useEffect(() => {
    void load();
  }, [load]);
  import_react8.default.useEffect(() => {
    const iv = window.setInterval(() => setNowMs(Date.now()), 2e4);
    return () => window.clearInterval(iv);
  }, []);
  const st = status === null ? null : status.regions.find((r) => r.region === REGION) ?? null;
  const run = async (key, what, action) => {
    setBusy(key);
    setNote(null);
    try {
      await action();
    } catch (error) {
      setNote({ kind: "err", text: `${what}\u5931\u8D25:${errText(error)}` });
    } finally {
      setBusy(null);
    }
  };
  const onRefresh = () => {
    void run("refresh", "\u5237\u65B0", async () => {
      const notes = [];
      let bad = false;
      const res = await rendererApi.qoderRefreshCatalog(REGION).catch((error) => {
        bad = true;
        notes.push(`\u76EE\u5F55\u5237\u65B0\u5931\u8D25:${errText(error)}`);
        return null;
      });
      if (res !== null) {
        if (!res.ok) bad = true;
        notes.push(res.message ?? (res.ok ? "\u76EE\u5F55\u5DF2\u5237\u65B0" : "\u76EE\u5F55\u5237\u65B0\u672A\u6210\u529F"));
      }
      const rows = await rendererApi.getQoderModels(REGION).catch(() => []);
      setModels(rows);
      setCatalogError(rows.length === 0 ? "\u76EE\u5F55\u4E3A\u7A7A:\u4E0A\u6E38\u6CA1\u7ED9\u6A21\u578B" : null);
      setStatus(await rendererApi.getQoderStatus().catch(() => null));
      if (accounts.length > 0) {
        const signed = await rendererApi.qoderCheckin(REGION).catch((error) => {
          bad = true;
          notes.push(`\u7B7E\u5230\u5931\u8D25:${errText(error)}`);
          return [];
        });
        const summary = checkinSummary(signed);
        if (summary !== "") notes.push(summary);
        if (signed.some((r) => r.status === "unavailable")) bad = true;
        const credit = await rendererApi.qoderCredits(REGION).catch((error) => {
          setCreditError(errText(error));
          return [];
        });
        setCredits(credit);
        if (credit.length > 0) setCreditError(null);
      }
      if (notes.length > 0) setNote({ kind: bad ? "warn" : "ok", text: notes.join(" \xB7 ") });
    });
  };
  const onToggleModel = (row, enabled) => {
    setModels((prev) => prev.map((m) => m.key === row.key ? { ...m, selected: enabled } : m));
    void run(`model:${row.key}`, "\u4FDD\u5B58\u52FE\u9009", async () => {
      const res = await rendererApi.qoderSetModelEnabled(REGION, row.key, enabled);
      if (!res.ok) {
        setModels((prev) => prev.map((m) => m.key === row.key ? { ...m, selected: !enabled } : m));
        setNote({ kind: "err", text: res.message ?? "\u4FDD\u5B58\u5931\u8D25" });
        return;
      }
      setNote({ kind: "ok", text: res.message ?? "\u5DF2\u4FDD\u5B58" });
    });
  };
  const onAdd = () => {
    void run("add", "\u6DFB\u52A0\u8D26\u53F7", async () => {
      const name2 = addName.trim();
      const pat = addPat.trim();
      if (name2 === "" || pat === "") {
        setNote({ kind: "warn", text: "\u8D26\u53F7\u540D\u4E0E PAT \u90FD\u4E0D\u80FD\u4E3A\u7A7A" });
        return;
      }
      const res = await rendererApi.qoderAddAccount(REGION, name2, pat);
      if (!res.ok) {
        setNote({ kind: "err", text: res.message ?? "\u6DFB\u52A0\u5931\u8D25" });
        return;
      }
      setAddName("");
      setAddPat("");
      setNote({ kind: "ok", text: res.message ?? "\u5DF2\u6DFB\u52A0\u5E76\u6821\u9A8C\u901A\u8FC7" });
      await load();
    });
  };
  const onRemove = (name2) => {
    void run(`remove:${name2}`, "\u5220\u9664\u8D26\u53F7", async () => {
      const res = await rendererApi.qoderRemoveAccount(REGION, name2);
      setNote({ kind: res.ok ? "ok" : "err", text: res.message ?? (res.ok ? "\u5DF2\u5220\u9664" : "\u5220\u9664\u5931\u8D25") });
      await load();
    });
  };
  const accountRows = import_react8.default.useMemo(
    () => accounts.map((a) => {
      const c = credits.find((x) => x.account === a.account) ?? null;
      const ready = c !== null && c.ok;
      const sumRemaining = () => {
        if (!ready) return null;
        const buckets = [c.userQuota?.remaining, c.addOnQuota?.remaining];
        const known = buckets.filter((v) => v !== null && v !== void 0);
        return known.length === 0 ? null : known.reduce((sum, v) => sum + v, 0);
      };
      const left = sumRemaining();
      return {
        id: a.account,
        label: a.account,
        note: [c?.userType ?? a.userType, `${a.models} \u4E2A\u6A21\u578B`].filter(Boolean).join(" \xB7 "),
        dot: a.lastError ? "bad" : a.hasPat ? "ok" : "off",
        right: left !== null ? {
          key: "\u5269\u4F59\u79EF\u5206",
          value: n2(left),
          sub: `\u5230\u671F ${fmtAt(c?.expiresAt ?? a.expiresAt)}`,
          // 有余额才是绿;0 表示两个桶都空了 —— 用黄,不假装正常。
          tone: left > 0 ? "ok" : "warn"
        } : null
      };
    }),
    [accounts, credits]
  );
  const modelRows = import_react8.default.useMemo(
    () => models.map((m) => {
      const ctx = m.maxContextTokens ?? m.maxInputTokens;
      return {
        id: m.key,
        name: m.displayName,
        rate: m.priceFactor,
        context: ctx === null ? "" : String(ctx),
        output: m.maxOutputTokens === null ? "" : String(m.maxOutputTokens),
        vision: m.isVl,
        exposed: m.selected,
        available: m.upstreamEnabled,
        defaultContext: ctx,
        defaultOutput: m.maxOutputTokens,
        visionUpstream: m.isVl
      };
    }),
    [models]
  );
  const handleModelEdit = (e) => {
    const row = models.find((m) => m.key === e.id);
    if (row === void 0) return;
    if (e.field === "exposed") onToggleModel(row, Boolean(e.value));
  };
  const refreshNote = busy !== null ? "\u6B63\u5728\u5237\u65B0\u2026" : st?.catalogFetchedAtMs ? `\u4E8E ${ago2(nowMs, st.catalogFetchedAtMs)}\u524D\u5237\u65B0` : "\u5C1A\u672A\u62C9\u53D6";
  const publishAction = useModelsActionPublisher();
  const onRefreshRef = import_react8.default.useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  import_react8.default.useEffect(() => {
    publishAction({
      label: busy !== null ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0",
      note: refreshNote,
      noteBusy: busy !== null,
      disabled: busy !== null || accounts.length === 0,
      run: () => onRefreshRef.current()
    });
    return () => publishAction(null);
  }, [publishAction, busy, accounts.length, refreshNote]);
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "chan-page", children: [
    note ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: `chan-banner ${note.kind}`, children: note.text }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      AccountRows,
      {
        accounts: accountRows,
        emptyText: "\u6682\u65E0\u8D26\u53F7",
        footer: creditError ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "chan-hint warn-line", children: creditError }) : null
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "chan-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        ModelTable_default,
        {
          rows: modelRows,
          plainColumns: true,
          disabled: busy !== null,
          emptyText: "\u6682\u65E0\u6A21\u578B",
          onEdit: handleModelEdit,
          toolbar: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h3", { children: "\u6A21\u578B\u76EE\u5F55" }) })
        }
      ),
      catalogError ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "chan-hint warn-line", children: catalogError }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "chan-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h3", { children: "\u8D26\u53F7\u914D\u7F6E" }) }),
      accounts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "chan-empty", children: "\u6682\u65E0\u8D26\u53F7" }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("table", { className: "grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { children: "\u8D26\u53F7" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { children: "API key" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { children: "\u64CD\u4F5C" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("tbody", { children: accounts.map((a) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { children: a.account }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { className: "mono", children: a.patHint ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            "button",
            {
              type: "button",
              className: "btn btn-sm",
              disabled: busy !== null,
              onClick: () => onRemove(a.account),
              children: "\u5220\u9664"
            }
          ) })
        ] }, a.account)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "sn-add", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "input",
          {
            placeholder: "\u8D26\u53F7\u540D(\u81EA\u53D6,\u5982 main)",
            value: addName,
            onChange: (e) => setAddName(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "input",
          {
            placeholder: "PAT(pt-\u2026)",
            value: addPat,
            onChange: (e) => setAddPat(e.target.value),
            type: "password"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "btn btn-sm primary", disabled: busy !== null, onClick: onAdd, children: "\u6DFB\u52A0\u5E76\u6821\u9A8C" })
      ] })
    ] })
  ] });
}
var QoderPage_default = QoderPage;

// ../panel-ui/src/pages/models/ProvidersPage.tsx
var import_react9 = __toESM(require("react"), 1);
var import_jsx_runtime12 = require("react/jsx-runtime");
var FormError = class extends Error {
};
function msg3(e) {
  return e instanceof Error ? e.message : String(e);
}
function bareModelId(providerId, modelId) {
  const prefix = `${providerId}/`;
  return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}
function rowOf(pid, m) {
  return {
    id: bareModelId(pid, m.id),
    name: m.name,
    context_window: m.context_window,
    max_output: m.max_output,
    input: m.vision ? ["text", "image"] : ["text"]
  };
}
var CAPACITY_RE = /^(\d+(?:\.\d+)?)([km])?$/i;
function parseCapacity(text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return void 0;
  const match = CAPACITY_RE.exec(trimmed);
  if (!match) return Number.NaN;
  const suffix = match[2]?.toLowerCase();
  const scale = suffix === "m" ? 1e6 : suffix === "k" ? 1e3 : 1;
  const scaled = Number(match[1]) * scale;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled;
}
function numOrNull(v) {
  const parsed = parseCapacity(v);
  if (parsed === void 0 || Number.isNaN(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}
function blankForm() {
  return { id: "", base_url: "", protocol: "openai", apiKey: "", models: [] };
}
function ProvidersPage() {
  const [providers, setProviders] = import_react9.default.useState([]);
  const [error, setError] = import_react9.default.useState("");
  const [notice, setNotice] = import_react9.default.useState("");
  const [busy, setBusy] = import_react9.default.useState(false);
  const [openId, setOpenId] = import_react9.default.useState("");
  const [creating, setCreating] = import_react9.default.useState(false);
  const [overridden, setOverridden] = import_react9.default.useState({});
  const [invalidIds, setInvalidIds] = import_react9.default.useState({});
  const [createInvalid, setCreateInvalid] = import_react9.default.useState(false);
  const [form, setForm] = import_react9.default.useState(() => blankForm());
  const [rowOpen, setRowOpen] = import_react9.default.useState({});
  const [catalogOpen, setCatalogOpen] = import_react9.default.useState(true);
  const [ctxDraft, setCtxDraft] = import_react9.default.useState({});
  const [outDraft, setOutDraft] = import_react9.default.useState({});
  const [inputChecked, setInputChecked] = import_react9.default.useState({});
  const [fetching, setFetching] = import_react9.default.useState(false);
  const [pickerOpen, setPickerOpen] = import_react9.default.useState(false);
  const [candidates, setCandidates] = import_react9.default.useState([]);
  const [picked, setPicked] = import_react9.default.useState(() => /* @__PURE__ */ new Set());
  const [pickQuery, setPickQuery] = import_react9.default.useState("");
  const [fetchedCatalog, setFetchedCatalog] = import_react9.default.useState([]);
  async function load() {
    try {
      const r = await rendererApi.getModelProviders();
      setProviders(r);
      setError("");
    } catch (e) {
      setError(msg3(e));
    }
  }
  import_react9.default.useEffect(() => {
    void load();
  }, []);
  function draftOf(p) {
    const byId = /* @__PURE__ */ new Map();
    for (const m of p.models) {
      const row = rowOf(p.id, m);
      byId.set(row.id, row);
    }
    return [...byId.values()];
  }
  function isOverridden(m) {
    return Boolean(
      m.name?.trim() || m.context_window != null || m.max_output != null || m.input && m.input.length > 0
    );
  }
  function seedRows(rows) {
    const open = {};
    const over = {};
    const ctx = {};
    const out = {};
    const inp = {};
    rows.forEach((m, i) => {
      open[i] = false;
      over[i] = isOverridden(m);
      ctx[i] = m.context_window != null ? String(m.context_window) : "";
      out[i] = m.max_output != null ? String(m.max_output) : "";
      const kinds = m.input ?? ["text"];
      inp[i] = { text: kinds.includes("text"), image: kinds.includes("image") };
    });
    setRowOpen(open);
    setOverridden(over);
    setCtxDraft(ctx);
    setOutDraft(out);
    setInputChecked(inp);
  }
  function startEdit(p) {
    if (openId === p.id && !creating) {
      closeCard();
      return;
    }
    setCreating(false);
    setOpenId(p.id);
    const models = draftOf(p);
    setForm({
      id: p.id,
      base_url: p.base_url ?? "",
      protocol: p.protocol || "openai",
      // ⚠️ **不回显明文**:输入框留空 = 沿用库里那把,只凭绿点/红点看有没有配。
      apiKey: "",
      models
    });
    seedRows(models);
    setCatalogOpen(true);
    setError("");
    setNotice("");
  }
  function startCreate() {
    setCreating(true);
    setOpenId("");
    setForm(blankForm());
    seedRows([]);
    setCatalogOpen(true);
    setCreateInvalid(false);
    setError("");
    setNotice("");
  }
  function closeCard() {
    setOpenId("");
    setCreating(false);
  }
  function keyPlaceholder(p) {
    return p.accounts_with_key > 0 ? "\u5DF2\u914D\u7F6E\u2014\u2014\u8F93\u5165\u65B0\u503C\u53EF\u66FF\u6362" : "\u8F93\u5165 API \u5BC6\u94A5";
  }
  function patchModel(i, patch) {
    setForm((f) => ({ ...f, models: f.models.map((m, at) => at === i ? { ...m, ...patch } : m) }));
  }
  function addModel() {
    const i = form.models.length;
    setForm((f) => ({ ...f, models: [...f.models, { id: "" }] }));
    setRowOpen((v) => ({ ...v, [i]: true }));
    setOverridden((v) => ({ ...v, [i]: false }));
    setCtxDraft((v) => ({ ...v, [i]: "" }));
    setOutDraft((v) => ({ ...v, [i]: "" }));
    setInputChecked((v) => ({ ...v, [i]: { text: true, image: false } }));
  }
  function removeModel(i) {
    setForm((f) => ({ ...f, models: f.models.filter((_, at) => at !== i) }));
    const shift = (map) => {
      const next = {};
      Object.entries(map).forEach(([k, v]) => {
        const at = Number(k);
        if (at < i) next[at] = v;
        else if (at > i) next[at - 1] = v;
      });
      return next;
    };
    setRowOpen((v) => shift(v));
    setOverridden((v) => shift(v));
    setCtxDraft((v) => shift(v));
    setOutDraft((v) => shift(v));
    setInputChecked((v) => shift(v));
  }
  function toggleRow(i) {
    setRowOpen((v) => ({ ...v, [i]: !v[i] }));
  }
  function toggleInput(i, kind, on) {
    setInputChecked((v) => {
      const cur = v[i] ?? { text: true, image: false };
      const next = { ...cur, [kind]: on };
      if (!next.text && !next.image) {
        if (kind === "image") next.image = true;
        else next.text = true;
      }
      return { ...v, [i]: next };
    });
  }
  const anyOverridden = Object.values(overridden).some(Boolean);
  function validateRows() {
    const seen = /* @__PURE__ */ new Set();
    form.models.forEach((m, i) => {
      const id = (m.id ?? "").trim();
      if (!id) return;
      if (seen.has(id)) throw new FormError(`\u6A21\u578B ID \u91CD\u590D:${id}`);
      seen.add(id);
      for (const [map, label] of [
        [ctxDraft, "\u4E0A\u4E0B\u6587\u7A97\u53E3"],
        [outDraft, "\u6700\u5927\u8F93\u51FA token \u6570"]
      ]) {
        if (Number.isNaN(parseCapacity(map[i] ?? ""))) {
          throw new FormError(`${label}\u5FC5\u987B\u662F\u6B63\u6570,\u4F8B\u5982 131072\u3001256K \u6216 1M\u3002`);
        }
      }
    });
  }
  function validateForm() {
    if (creating) {
      const id = form.id.trim();
      if (!id) throw new FormError("Provider ID \u5FC5\u586B\u3002");
      if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
        throw new FormError(
          "Provider ID \u9700\u4EE5\u5C0F\u5199\u5B57\u6BCD\u5F00\u5934,\u53EA\u80FD\u542B\u5C0F\u5199\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u4E0E\u8FDE\u5B57\u7B26\u3002"
        );
      }
      if (providers.some((p) => p.id === id)) {
        throw new FormError("\u5DF2\u6709\u63D0\u4F9B\u5546\u4F7F\u7528\u4E86\u8FD9\u4E2A ID\u3002");
      }
    }
    const url = form.base_url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      throw new FormError("API \u5730\u5740\u5FC5\u987B\u662F http(s) \u5730\u5740\u3002");
    }
    validateRows();
  }
  function buildModels() {
    return form.models.map((m, i) => {
      const kinds = inputChecked[i] ?? { text: true, image: false };
      const ctx = numOrNull(ctxDraft[i] ?? "");
      const out = numOrNull(outDraft[i] ?? "");
      return {
        id: m.id.trim(),
        ...m.name?.trim() ? { name: m.name.trim() } : {},
        ...ctx != null ? { context_window: ctx } : {},
        ...out != null ? { max_output: out } : {},
        input: kinds.image ? ["text", "image"] : ["text"]
      };
    }).filter((m) => m.id);
  }
  async function saveCard() {
    const pid = form.id.trim();
    try {
      validateForm();
    } catch (e) {
      if (creating) setCreateInvalid(true);
      else if (pid) setInvalidIds((v) => ({ ...v, [pid]: true }));
      setError(msg3(e));
      return;
    }
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const models = buildModels();
      const proto = form.protocol.trim() || "openai";
      const keyText = form.apiKey.trim();
      const r = await rendererApi.upsertModelProvider(
        pid,
        form.base_url.trim(),
        proto,
        // `env_prefix` 在 Nexus 页面上是**只读回显**,没有输入框 → 不提交(undefined
        // = 不改),后端保留原值 / 落 `ONE_<ID>` 默认。
        void 0,
        keyText === "" ? void 0 : [keyText]
      );
      if (!r.ok) throw new FormError(r.message ?? "\u4FDD\u5B58\u5931\u8D25");
      const exposure = models.map((m, i) => {
        const kinds = inputChecked[i] ?? { text: true, image: false };
        return {
          id: `${pid}/${m.id}`,
          ...m.name ? { name: m.name } : {},
          vision: kinds.image,
          context_window: numOrNull(ctxDraft[i] ?? ""),
          max_output: numOrNull(outDraft[i] ?? "")
        };
      });
      const e2 = await rendererApi.setChannelModels(pid, exposure);
      if (!e2.ok) throw new FormError(e2.message ?? "\u8BBE\u7F6E\u6A21\u578B\u66B4\u9732\u5931\u8D25");
      let text = e2.message ?? r.message ?? "\u5DF2\u4FDD\u5B58";
      setNotice(text);
      if (creating) setCreateInvalid(false);
      if (pid) {
        setInvalidIds((v) => {
          const next = { ...v };
          delete next[pid];
          return next;
        });
      }
      closeCard();
      await load();
    } catch (e) {
      if (creating) setCreateInvalid(true);
      else if (pid) setInvalidIds((v) => ({ ...v, [pid]: true }));
      setError(msg3(e));
    } finally {
      setBusy(false);
    }
  }
  async function removeProvider(p) {
    if (!window.confirm(`\u786E\u5B9A\u5220\u9664\u4F9B\u5E94\u5546 ${p.id}?(\u5176\u767B\u8BB0\u7684\u771F\u5B9E\u6A21\u578B\u4E0E\u51ED\u636E\u4F1A\u4E00\u5E76\u79FB\u9664)`)) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const r = await rendererApi.removeModelProvider(p.id);
      if (!r.ok) {
        setError(r.message ?? "\u5220\u9664\u5931\u8D25");
        return;
      }
      setNotice(r.message ?? "\u5DF2\u5220\u9664");
      if (openId === p.id) closeCard();
      await load();
    } catch (e) {
      setError(msg3(e));
    } finally {
      setBusy(false);
    }
  }
  function fetchedIndex() {
    const pid = form.id.trim();
    return new Map(
      fetchedCatalog.map((m) => {
        const row = rowOf(pid, m);
        return [row.id, row];
      })
    );
  }
  function visibleCandidates() {
    const q = pickQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((id) => id.toLowerCase().includes(q));
  }
  function allVisiblePicked() {
    const list = visibleCandidates();
    return list.length > 0 && list.every((id) => picked.has(id));
  }
  async function fetchModels() {
    if (!form.base_url.trim()) {
      setError("\u8BF7\u5148\u586B\u5199 API \u5730\u5740,\u518D\u83B7\u53D6\u3002");
      return;
    }
    setFetching(true);
    setError("");
    try {
      const pid = form.id.trim();
      const r = await rendererApi.fetchModels(pid, false, {
        baseUrl: form.base_url.trim(),
        protocol: form.protocol.trim() || "openai"
      });
      if (!r.ok) {
        setError(r.message ?? "\u8BE5\u63D0\u4F9B\u5546\u6CA1\u6709\u5217\u51FA\u4EFB\u4F55\u6A21\u578B,\u8BF7\u624B\u52A8\u6DFB\u52A0\u3002");
        await load();
        return;
      }
      const found = (r.models ?? []).map((m) => bareModelId(pid, m.id)).filter(Boolean);
      if (!found.length) {
        setError(r.message ?? "\u8BE5\u63D0\u4F9B\u5546\u6CA1\u6709\u5217\u51FA\u4EFB\u4F55\u6A21\u578B,\u8BF7\u624B\u52A8\u6DFB\u52A0\u3002");
        await load();
        return;
      }
      const fetched = r.models ?? [];
      setFetchedCatalog(fetched);
      const byId = new Map(
        fetched.map((m) => {
          const row = rowOf(pid, m);
          return [row.id, row];
        })
      );
      const nextCtx = { ...ctxDraft };
      const nextOut = { ...outDraft };
      const nextInp = { ...inputChecked };
      form.models.forEach((m, i) => {
        const entry = byId.get(m.id.trim());
        if (!entry) return;
        if (!(nextCtx[i] ?? "").trim() && entry.context_window != null) {
          nextCtx[i] = String(entry.context_window);
        }
        if (!(nextOut[i] ?? "").trim() && entry.max_output != null) {
          nextOut[i] = String(entry.max_output);
        }
        if (entry.input?.includes("image")) {
          const cur = nextInp[i] ?? { text: true, image: false };
          if (!cur.image) nextInp[i] = { ...cur, image: true };
        }
      });
      setCtxDraft(nextCtx);
      setOutDraft(nextOut);
      setInputChecked(nextInp);
      const known = new Set(form.models.map((m) => m.id.trim()).filter(Boolean));
      setCandidates(found);
      setPickQuery("");
      setPicked(/* @__PURE__ */ new Set());
      setPickerOpen(true);
    } catch (e) {
      setError(msg3(e));
    } finally {
      setFetching(false);
    }
  }
  function togglePick(id) {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  }
  function toggleAllVisible() {
    if (allVisiblePicked()) {
      setPicked(/* @__PURE__ */ new Set());
      return;
    }
    const next = new Set(picked);
    for (const id of visibleCandidates()) next.add(id);
    setPicked(next);
  }
  function closePicker() {
    setPickerOpen(false);
    setCandidates([]);
    setPicked(/* @__PURE__ */ new Set());
    setPickQuery("");
  }
  function adoptPicked() {
    const known = new Set(form.models.map((m) => m.id.trim()));
    const byId = fetchedIndex();
    const rows = [...form.models];
    const nextOpen = { ...rowOpen };
    const nextOver = { ...overridden };
    const nextCtx = { ...ctxDraft };
    const nextOut = { ...outDraft };
    const nextInp = { ...inputChecked };
    for (const id of picked) {
      if (known.has(id)) continue;
      known.add(id);
      rows.push({ id });
      const i = rows.length - 1;
      const entry = byId.get(id);
      nextOpen[i] = false;
      nextOver[i] = entry ? isOverridden(entry) : false;
      nextCtx[i] = entry?.context_window != null ? String(entry.context_window) : "";
      nextOut[i] = entry?.max_output != null ? String(entry.max_output) : "";
      const kinds = entry?.input?.length ? { text: entry.input.includes("text"), image: entry.input.includes("image") } : { text: true, image: false };
      if (!kinds.text && !kinds.image) kinds.text = true;
      nextInp[i] = kinds;
    }
    setForm((f) => ({ ...f, models: rows }));
    setRowOpen(nextOpen);
    setOverridden(nextOver);
    setCtxDraft(nextCtx);
    setOutDraft(nextOut);
    setInputChecked(nextInp);
    setCatalogOpen(true);
    closePicker();
  }
  function dotState(p) {
    if (invalidIds[p.id]) return "missing";
    return (p.base_url?.trim() ?? "") && p.accounts_with_key > 0 ? "ok" : "missing";
  }
  function dotTitle(p) {
    if (invalidIds[p.id]) return "\u4E0A\u6B21\u4FDD\u5B58\u6CA1\u901A\u8FC7\u6821\u9A8C,\u8BF7\u5C55\u5F00\u5361\u7247\u68C0\u67E5";
    const lacks = [];
    if (!(p.base_url?.trim() ?? "")) lacks.push("API \u5730\u5740");
    if (p.accounts_with_key === 0) lacks.push("API \u5BC6\u94A5");
    return lacks.length ? `\u8FD8\u7F3A:${lacks.join(" / ")}(\u53EF\u7A0D\u540E\u8865)` : "\u914D\u7F6E\u9F50\u6D3B";
  }
  function catalogSection() {
    const hasBase = form.base_url.trim().length > 0;
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-catalogSection", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "pv-catalogTitle", children: "\u6A21\u578B\u76EE\u5F55" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-modelListHead", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "pv-modelCatalogMeta", children: anyOverridden ? "\u5DF2\u81EA\u5B9A\u4E49\u6A21\u578B\u76EE\u5F55" : "\u6B63\u5728\u4F7F\u7528\u63D0\u4F9B\u5546\u9ED8\u8BA4\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "pv-headActions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              "button",
              {
                type: "button",
                className: "pv-linkButton",
                disabled: busy || fetching || !hasBase,
                title: hasBase ? "\u8FDE\u4E0A\u6E38 GET /models,\u5E76\u628A\u4E0A\u6E38\u7ED9\u7684\u4E0A\u4E0B\u6587\u7A97\u53E3 / \u6700\u5927\u8F93\u51FA / \u8F93\u5165\u7C7B\u578B\u5E26\u56DE\u76EE\u5F55(\u53EA\u8865\u6CA1\u586B\u8FC7\u7684)" : "\u8BF7\u5148\u586B\u5199 API \u5730\u5740,\u518D\u83B7\u53D6",
                onClick: () => void fetchModels(),
                children: fetching ? "\u6B63\u5728\u8BE2\u95EE\u63D0\u4F9B\u5546\u2026" : "\u83B7\u53D6\u53EF\u7528\u6A21\u578B"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              "button",
              {
                type: "button",
                className: "pv-iconButton",
                "aria-expanded": catalogOpen,
                title: "\u5C55\u5F00 / \u6536\u8D77\u6A21\u578B\u76EE\u5F55",
                onClick: () => setCatalogOpen((v) => !v),
                children: catalogOpen ? "\u25BE" : "\u25B8"
              }
            )
          ] })
        ] }),
        catalogOpen ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
          form.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "pv-modelEmpty", children: "\u8FD8\u6CA1\u6709\u767B\u8BB0\u6A21\u578B;\u70B9\u300C\u83B7\u53D6\u53EF\u7528\u6A21\u578B\u300D\u6216\u300C\uFF0B \u6DFB\u52A0\u6A21\u578B\u300D\u8865\u4E0A\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "pv-modelList", children: form.models.map((_m, i) => {
            const kinds = inputChecked[i] ?? { text: true, image: false };
            return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-modelEntry", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-modelRow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                  "input",
                  {
                    className: "pv-input",
                    type: "text",
                    placeholder: "\u6A21\u578B ID",
                    "aria-label": `\u6A21\u578B ID ${i + 1}`,
                    value: form.models[i].id ?? "",
                    onChange: (ev) => patchModel(i, { id: ev.target.value })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                  "input",
                  {
                    className: "pv-input",
                    type: "text",
                    placeholder: "\u663E\u793A\u540D\u79F0",
                    "aria-label": `\u663E\u793A\u540D\u79F0 ${i + 1}`,
                    value: form.models[i].name ?? "",
                    onChange: (ev) => patchModel(i, { name: ev.target.value })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "pv-iconButton",
                    "aria-expanded": !!rowOpen[i],
                    "aria-label": `\u6A21\u578B\u9009\u9879 ${i + 1}`,
                    title: "\u6A21\u578B\u9009\u9879",
                    onClick: () => toggleRow(i),
                    children: rowOpen[i] ? "\u25BE" : "\u25B8"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "pv-iconButton pv-iconButtonDanger",
                    "aria-label": `\u5220\u9664\u6A21\u578B ${i + 1}`,
                    title: "\u4ECE\u76EE\u5F55\u79FB\u9664\u5E76\u5220\u9664(\u4FDD\u5B58\u540E\u4ECE\u6A21\u578B\u8868\u5220\u6389\u8FD9\u4E00\u884C)",
                    disabled: busy,
                    onClick: () => removeModel(i),
                    children: "\u{1F5D1}"
                  }
                )
              ] }),
              rowOpen[i] ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-modelAdvanced", children: [
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "pv-modelField", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "pv-modelFieldLabel", children: "\u4E0A\u4E0B\u6587\u7A97\u53E3" }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                    "input",
                    {
                      className: "pv-input",
                      type: "text",
                      inputMode: "numeric",
                      placeholder: "\u672A\u586B\u5219\u7528 256K(262144)\u515C\u5E95",
                      value: ctxDraft[i] ?? "",
                      onChange: (ev) => setCtxDraft((v) => ({ ...v, [i]: ev.target.value }))
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "pv-modelField", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "pv-modelFieldLabel", children: "\u6700\u5927\u8F93\u51FA token \u6570" }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                    "input",
                    {
                      className: "pv-input",
                      type: "text",
                      inputMode: "numeric",
                      placeholder: "\u4F7F\u7528\u63D0\u4F9B\u5546\u9ED8\u8BA4\u503C",
                      value: outDraft[i] ?? "",
                      onChange: (ev) => setOutDraft((v) => ({ ...v, [i]: ev.target.value }))
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("fieldset", { className: "pv-modelInputTypes", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("legend", { className: "pv-modelFieldLabel", children: "\u8F93\u5165\u7C7B\u578B" }),
                  /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-modelInputChoices", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "pv-choice", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                        "input",
                        {
                          type: "checkbox",
                          checked: kinds.text,
                          onChange: (ev) => toggleInput(i, "text", ev.target.checked)
                        }
                      ),
                      "\u6587\u672C"
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "pv-choice", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                        "input",
                        {
                          type: "checkbox",
                          checked: kinds.image,
                          onChange: (ev) => toggleInput(i, "image", ev.target.checked)
                        }
                      ),
                      "\u56FE\u7247"
                    ] })
                  ] })
                ] })
              ] }) : null
            ] }, i);
          }) }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "pv-addModelButton", disabled: busy, onClick: addModel, children: "\uFF0B \u6DFB\u52A0\u6A21\u578B" })
        ] }) : null
      ] })
    ] });
  }
  function providerFields(withId, p) {
    const uid = withId ? "new-provider" : p?.id ?? form.id;
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-panel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "pv-panelTitle", children: withId ? "\u81EA\u5B9A\u4E49\u6A21\u578B API" : p?.id }),
      withId ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("label", { className: "pv-fieldLabel", htmlFor: "new-provider-id", children: "Provider ID" }),
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
          "input",
          {
            id: "new-provider-id",
            className: "pv-input",
            type: "text",
            placeholder: "\u5982 acme_gateway",
            value: form.id,
            onChange: (ev) => setForm((f) => ({ ...f, id: ev.target.value }))
          }
        )
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("label", { className: "pv-fieldLabel", htmlFor: `key-${uid}`, children: "API \u5BC6\u94A5" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "input",
        {
          id: `key-${uid}`,
          className: "pv-input",
          type: "password",
          autoComplete: "new-password",
          spellCheck: false,
          placeholder: withId || !p ? "\u8F93\u5165 API \u5BC6\u94A5" : keyPlaceholder(p),
          value: form.apiKey,
          onChange: (ev) => setForm((f) => ({ ...f, apiKey: ev.target.value }))
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("label", { className: "pv-fieldLabel", htmlFor: `url-${uid}`, children: "API \u5730\u5740" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "input",
        {
          id: `url-${uid}`,
          className: "pv-input",
          type: "text",
          placeholder: "https://gateway.example/v1",
          value: form.base_url,
          onChange: (ev) => setForm((f) => ({ ...f, base_url: ev.target.value }))
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("label", { className: "pv-fieldLabel", htmlFor: `proto-${uid}`, children: "API \u534F\u8BAE" }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "select",
        {
          id: `proto-${uid}`,
          className: "pv-input pv-selectInput",
          value: form.protocol,
          onChange: (ev) => setForm((f) => ({ ...f, protocol: ev.target.value })),
          children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("option", { value: "openai", children: "OpenAI Chat Completions" })
        }
      )
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "pv-section", children: [
      error ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "pv-err", role: "alert", children: error }) : null,
      notice ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "pv-savedNotice", role: "status", children: notice }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("ul", { className: "pv-rows", children: [
        providers.map((p) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { className: "pv-rowCard", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-rowHead", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "pv-rowName", children: p.id }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              "span",
              {
                className: "pv-credentialDot " + (dotState(p) === "ok" ? "pv-dotOk" : "pv-dotMissing"),
                title: dotTitle(p)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "pv-rowActions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "pv-rowBtn", disabled: busy, onClick: () => startEdit(p), children: openId === p.id && !creating ? "\u6536\u8D77" : "\u7F16\u8F91" }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                "button",
                {
                  type: "button",
                  className: "pv-rowBtn pv-rowBtnDanger",
                  disabled: busy,
                  onClick: () => void removeProvider(p),
                  children: "\u5220\u9664"
                }
              )
            ] })
          ] }),
          openId === p.id && !creating ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
            providerFields(false, p),
            catalogSection(),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-rowActions pv-cardFooter", children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "pv-secondaryButton", disabled: busy, onClick: closeCard, children: "\u53D6\u6D88" }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                "button",
                {
                  type: "button",
                  className: "pv-primaryButton",
                  disabled: busy,
                  onClick: () => void saveCard(),
                  children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
                }
              )
            ] })
          ] }) : null
        ] }, p.id)),
        creating ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("li", { className: "pv-rowCard", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-rowHead", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "pv-rowName", children: "\u6DFB\u52A0\u6A21\u578B\u63D0\u4F9B\u5546" }),
            createInvalid ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "pv-credentialDot pv-dotMissing", title: "\u521A\u624D\u4FDD\u5B58\u6CA1\u901A\u8FC7\u6821\u9A8C,\u8BF7\u68C0\u67E5\u4E0B\u9762\u7684\u5B57\u6BB5" }) : null
          ] }),
          providerFields(true),
          catalogSection(),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-rowActions pv-cardFooter", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "pv-secondaryButton", disabled: busy, onClick: closeCard, children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              "button",
              {
                type: "button",
                className: "pv-primaryButton",
                disabled: busy,
                onClick: () => void saveCard(),
                children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u521B\u5EFA\u63D0\u4F9B\u5546"
              }
            )
          ] })
        ] }) : null
      ] }),
      !creating ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "pv-addButton", disabled: busy, onClick: startCreate, children: "\uFF0B \u6DFB\u52A0\u6A21\u578B\u63D0\u4F9B\u5546" }) : null
    ] }),
    pickerOpen ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "div",
      {
        className: "pv-mask",
        onClick: (ev) => {
          if (ev.target === ev.currentTarget) closePicker();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-dialog", role: "dialog", "aria-modal": "true", "aria-label": "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u6A21\u578B", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h3", { className: "pv-dialogTitle", children: "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "pv-dialogDesc", children: "\u4EE5\u4E0B\u662F\u6A21\u578B\u63D0\u4F9B\u5546\u7684\u53EF\u7528\u6A21\u578B,\u52FE\u9009\u8981\u6DFB\u52A0\u7684\u6A21\u578B\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-candidateToolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              "input",
              {
                className: "pv-input pv-candidateSearch",
                type: "search",
                placeholder: "\u641C\u7D22\u6A21\u578B",
                "aria-label": "\u641C\u7D22\u6A21\u578B",
                value: pickQuery,
                onChange: (ev) => setPickQuery(ev.target.value)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              "button",
              {
                type: "button",
                className: "pv-linkButton",
                disabled: visibleCandidates().length === 0,
                onClick: toggleAllVisible,
                children: allVisiblePicked() ? "\u53D6\u6D88\u5168\u9009" : "\u5168\u9009"
              }
            )
          ] }),
          visibleCandidates().length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "pv-candidateEmpty", role: "status", children: "\u6CA1\u6709\u5339\u914D\u7684\u6A21\u578B\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "pv-candidateList", children: visibleCandidates().map((c) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("li", { className: "pv-candidate", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("label", { className: "pv-candidateLabel", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("input", { type: "checkbox", checked: picked.has(c), onChange: () => togglePick(c) }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "pv-candidateId", title: c, children: c })
          ] }) }, c)) }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "pv-dialogFooter", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "pv-secondaryButton", onClick: closePicker, children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "pv-secondaryButton", onClick: adoptPicked, children: "\u6DFB\u52A0\u6240\u9009" })
          ] })
        ] })
      }
    ) : null
  ] });
}

// ../panel-ui/src/pages/models/ModelsPage.tsx
var import_jsx_runtime13 = require("react/jsx-runtime");
var SUBS = [
  { key: "logical", label: "\u903B\u8F91\u6A21\u578B" },
  { key: "overview", label: "\u6A21\u578B\u603B\u89C8" },
  { key: "trae", label: "Trae" },
  { key: "workbuddy", label: "WorkBuddy" },
  { key: "qoder", label: "Qoder" },
  { key: "sensenova", label: "SenseNova" },
  { key: "suppliers", label: "\u5176\u4ED6\u4F9B\u5E94\u5546" }
];
function ModelsPage({ initialSub = "logical", action = null }) {
  const [sub, setSub] = import_react10.default.useState(initialSub);
  const [subAction, setSubAction] = import_react10.default.useState(null);
  const on = SUBS.some((s) => s.key === sub) ? sub : SUBS[0].key;
  const publish = import_react10.default.useCallback((spec) => {
    setSubAction(spec);
  }, []);
  const select = import_react10.default.useCallback((key) => {
    setSubAction(null);
    setSub(key);
  }, []);
  const shown = subAction ?? action;
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h1", { className: "page-title", children: "As One \xB7 \u6A21\u578B" }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("nav", { className: "subtabs", children: [
      SUBS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        "button",
        {
          type: "button",
          className: `subtab${s.key === on ? " on" : ""}`,
          onClick: () => select(s.key),
          children: s.label
        },
        s.key
      )),
      shown ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "subtabs-action", children: [
        shown.note ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: `act-note${shown.noteBusy ? " busy" : ""}`, title: shown.note, children: shown.note }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "act-btn", disabled: shown.disabled, onClick: () => shown.run(), children: shown.label })
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(ModelsActionProvider, { value: publish, children: [
      on === "logical" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(LogicalModelsPage_default, {}) : null,
      on === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(DeploymentsPage_default, {}) : null,
      on === "trae" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(ChannelPage, { provider: "trae" }) : null,
      on === "workbuddy" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(ChannelPage, { provider: "workbuddy" }) : null,
      on === "qoder" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(QoderPage_default, {}) : null,
      on === "sensenova" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(SenseNovaPage, {}) : null,
      on === "suppliers" ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(ProvidersPage, {}) : null
    ] })
  ] });
}
var ModelsPage_default = ModelsPage;

// ../panel-ui/src/pages/UsageStatsPage.tsx
var import_react11 = __toESM(require("react"), 1);
var import_jsx_runtime14 = require("react/jsx-runtime");
var RANGES = [
  { key: "all", label: "\u5168\u90E8" },
  { key: "7", label: "\u6700\u8FD1 7 \u5929" },
  { key: "30", label: "\u6700\u8FD1 30 \u5929" },
  { key: "90", label: "\u6700\u8FD1 90 \u5929" },
  { key: "365", label: "\u6700\u8FD1 365 \u5929" }
];
var MODEL_COLORS = [
  "#0576ff",
  "#2f6f37",
  "#c46212",
  "#975bf1",
  "#d34591",
  "#0d8a8a",
  "#b3341f",
  "#7a9018",
  "#4b3fd0",
  "#d4a017"
];
var PROVIDER_COLORS = ["#1f7a8c", "#6a8e3a", "#a15c2f", "#7b5ea7", "#b03a5b"];
var OTHER_COLOR = "#576270";
var LINE_COLOR = "#4d6bfe";
var GEO = { w: 720, h: 220, padL: 46, padR: 65, padB: 26, padT: 10 };
var PLOT_H = GEO.h - GEO.padT - GEO.padB;
var MIN_PITCH = 4;
function full(v) {
  return v == null ? "N/A" : Math.round(v).toLocaleString("en-US");
}
function rateText(r) {
  return r == null ? "\u2014" : fmtPct(r);
}
function seriesLabel(s, group) {
  return group === "logical" || !s.provider ? s.name : `${s.provider}/${s.name}`;
}
function seriesColor(s, list) {
  if (s.is_other) return OTHER_COLOR;
  const i = list.findIndex((x) => x.key === s.key);
  return MODEL_COLORS[Math.max(0, i) % MODEL_COLORS.length];
}
function providerColor(p, i) {
  return p.is_other ? OTHER_COLOR : PROVIDER_COLORS[i % PROVIDER_COLORS.length];
}
function rowMain(s) {
  return s.name;
}
function niceTicks(max, count = 4) {
  if (!(max > 0)) return [];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = step; v <= max * 1.0000001; v += step) out.push(v);
  return out;
}
function smoothPath(pts) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}
function segments(rows, colorOf, circ) {
  let acc = 0;
  return rows.map((row, i) => {
    const p = row.percent ?? 0;
    const len = Math.max(0, Math.min(1, p)) * circ;
    const seg = { key: row.key, color: colorOf(row, i), len, off: acc * circ };
    acc += p;
    return seg;
  });
}
function UsageStatsPage() {
  const [range, setRange] = import_react11.default.useState("all");
  const [granularity, setGranularity] = import_react11.default.useState("day");
  const [group, setGroup] = import_react11.default.useState("model");
  const [data, setData] = import_react11.default.useState(null);
  const [error, setError] = import_react11.default.useState("");
  const [loading, setLoading] = import_react11.default.useState(false);
  const [expanded, setExpanded] = import_react11.default.useState({});
  const [chartW, setChartW] = import_react11.default.useState(GEO.w);
  const [donutW, setDonutW] = import_react11.default.useState(760);
  const [hoverIdx, setHoverIdx] = import_react11.default.useState(null);
  const [tipW, setTipW] = import_react11.default.useState(0);
  const chartEl = import_react11.default.useRef(null);
  const donutEl = import_react11.default.useRef(null);
  const tipEl = import_react11.default.useRef(null);
  const load = import_react11.default.useCallback(async () => {
    setLoading(true);
    try {
      const r = await rendererApi.getUsageHistory(range, granularity, group);
      setData(r);
      setExpanded({});
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range, granularity, group]);
  import_react11.default.useEffect(() => {
    void load();
  }, [load]);
  const toggle = import_react11.default.useCallback((key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const totals = data?.totals ?? null;
  const top = data?.top ?? null;
  const totalTokens = totals?.tokens ?? 0;
  const hasData = totalTokens > 0;
  const trendTitle = granularity === "month" ? "\u6309\u6708 Token \u8D8B\u52BF" : "\u6309\u5929 Token \u8D8B\u52BF";
  const rangeText = data ? `${data.from} \u2192 ${data.to}` : "";
  const rowSub = (s) => {
    if (s.provider) return s.provider;
    return group === "logical" && !s.is_other ? "\u903B\u8F91\u6A21\u578B" : "";
  };
  const chart = import_react11.default.useMemo(() => {
    const all = data?.buckets ?? [];
    const series = data?.series ?? [];
    const inner = Math.max(40, chartW - GEO.padL - GEO.padR);
    const maxBars = Math.max(1, Math.floor(inner / MIN_PITCH) + 1);
    const hidden = Math.max(0, all.length - maxBars);
    const bs = hidden ? all.slice(hidden) : all;
    const n3 = bs.length;
    const pitch = n3 > 1 ? inner / (n3 - 1) : inner;
    const barW = Math.max(3, Math.min(30, pitch * 0.62));
    const xOf = (i) => n3 > 1 ? GEO.padL + i * pitch : GEO.padL + inner / 2;
    const bottom = GEO.padT + PLOT_H;
    const maxTotal = bs.reduce((m, b) => Math.max(m, b.tokens), 0);
    const bars = [];
    bs.forEach((b, i) => {
      const by = new Map(b.by_series.map((e) => [e.key, e.tokens]));
      let yb = bottom;
      for (const s of series) {
        const t = by.get(s.key) ?? 0;
        if (t <= 0) continue;
        const h = maxTotal > 0 ? t / maxTotal * PLOT_H : 0;
        yb -= h;
        bars.push({
          key: `${b.key}|${s.key}`,
          x: xOf(i) - barW / 2,
          y: yb,
          w: barW,
          h,
          color: seriesColor(s, series)
        });
      }
    });
    const pts = bs.map((b, i) => b.cache_hit_rate == null ? null : { x: xOf(i), y: bottom - b.cache_hit_rate * PLOT_H }).filter((p) => p !== null);
    const labels = [];
    const want = Math.min(8, n3);
    const seen = /* @__PURE__ */ new Set();
    for (let k = 0; k < want; k++) {
      const i = want > 1 ? Math.round((n3 - 1) * k / (want - 1)) : Math.max(0, n3 - 1);
      if (seen.has(i) || !bs[i]) continue;
      seen.add(i);
      labels.push({
        x: xOf(i),
        text: granularity === "month" ? bs[i].key : bs[i].key.slice(5)
      });
    }
    return {
      bs,
      n: n3,
      pitch,
      barW,
      xOf,
      bottom,
      maxTotal,
      bars,
      path: smoothPath(pts),
      labels,
      ticksLeft: maxTotal > 0 ? niceTicks(maxTotal, 4).map((v) => ({ v, y: bottom - v / maxTotal * PLOT_H, text: fmtCount(v) })) : [],
      // 右轴固定 0/25/50/75/100,只写百分比,不画网线。
      ticksRight: [0, 25, 50, 75, 100].map((p) => ({
        p,
        y: bottom - p / 100 * PLOT_H,
        text: `${p}%`
      })),
      hidden
    };
  }, [data, chartW, granularity]);
  const hover = import_react11.default.useMemo(() => {
    const i = hoverIdx;
    if (i == null || !data) return null;
    const b = chart.bs[i];
    if (!b) return null;
    const by = new Map(b.by_series.map((e) => [e.key, e.tokens]));
    const rows = data.series.map((s) => ({
      key: s.key,
      name: seriesLabel(s, group),
      color: seriesColor(s, data.series),
      tokens: by.get(s.key) ?? 0
    })).filter((r) => r.tokens > 0).sort((a, c) => c.tokens - a.tokens);
    const x = chart.xOf(i);
    const half = Math.max(85, (tipW || 170) / 2);
    return {
      key: b.key,
      tokens: b.tokens,
      requests: b.requests,
      rate: rateText(b.cache_hit_rate),
      rows: rows.slice(0, 6),
      more: Math.max(0, rows.length - 6),
      left: Math.min(Math.max(half, x), Math.max(half, chartW - half))
    };
  }, [hoverIdx, data, chart, group, tipW, chartW]);
  import_react11.default.useEffect(() => {
    if (hoverIdx == null) {
      setTipW(0);
      return;
    }
    const el = tipEl.current;
    if (el) setTipW(el.offsetWidth);
  }, [hoverIdx]);
  const showCharts = data !== null && hasData;
  import_react11.default.useEffect(() => {
    if (!showCharts) return;
    const ros = [];
    if (typeof ResizeObserver !== "undefined") {
      const bind = (el, out) => {
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
          const w = entries[0]?.contentRect.width ?? 0;
          if (w > 0) out(Math.max(320, Math.round(w)));
        });
        ro.observe(el);
        ros.push(ro);
      };
      bind(chartEl.current, setChartW);
      bind(donutEl.current, setDonutW);
    }
    return () => {
      for (const ro of ros) ro.disconnect();
    };
  }, [showCharts]);
  const donutSize = import_react11.default.useMemo(() => Math.max(200, Math.min(280, donutW - 16 - 260)), [donutW]);
  const ring = import_react11.default.useMemo(() => {
    const s = donutSize;
    const sw = s * 0.15;
    const outer = s * 0.475;
    const r = outer - sw / 2;
    return { s, sw, r, c: s / 2, circ: 2 * Math.PI * r };
  }, [donutSize]);
  const modelSegs = import_react11.default.useMemo(
    () => segments(data?.series ?? [], (s, i) => seriesColor(s, data?.series ?? []), ring.circ),
    [data, ring.circ]
  );
  const providerSegs = import_react11.default.useMemo(() => {
    const list = data?.providers ?? [];
    const rows = list.map((p, i) => ({ key: p.provider, percent: p.percent, idx: i }));
    return segments(rows, (r) => providerColor(list[r.idx], r.idx), ring.circ);
  }, [data, ring.circ]);
  const modelRingTotal = totalTokens;
  const providerRingTotal = import_react11.default.useMemo(
    () => (data?.providers ?? []).reduce((m, p) => m + p.tokens, 0),
    [data]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_react11.default.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h1", { className: "page-title", children: "\u7528\u91CF\u7EDF\u8BA1" }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-ctl", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-seg", role: "group", "aria-label": "\u65F6\u95F4\u8303\u56F4", children: RANGES.map((r) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        "button",
        {
          type: "button",
          className: range === r.key ? "on" : "",
          "aria-pressed": range === r.key,
          onClick: () => setRange(r.key),
          children: r.label
        },
        r.key
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-seg", role: "group", "aria-label": "\u805A\u5408", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "button",
          {
            type: "button",
            className: granularity === "day" ? "on" : "",
            "aria-pressed": granularity === "day",
            onClick: () => setGranularity("day"),
            children: "\u6309\u5929"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "button",
          {
            type: "button",
            className: granularity === "month" ? "on" : "",
            "aria-pressed": granularity === "month",
            onClick: () => setGranularity("month"),
            children: "\u6309\u6708"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-seg", role: "group", "aria-label": "\u7EDF\u8BA1\u7EF4\u5EA6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "button",
          {
            type: "button",
            className: group === "model" ? "on" : "",
            "aria-pressed": group === "model",
            onClick: () => setGroup("model"),
            children: "\u6309\u771F\u5B9E\u6A21\u578B"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "button",
          {
            type: "button",
            className: group === "logical" ? "on" : "",
            "aria-pressed": group === "logical",
            onClick: () => setGroup("logical"),
            children: "\u6309\u903B\u8F91\u6A21\u578B"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", className: "usage-refresh", disabled: loading, onClick: () => void load(), children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u5237\u65B0" }),
      data ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "hint usage-ctl-info", children: [
        rangeText,
        " \xB7 ",
        data.axis.length,
        " \u4E2A",
        granularity === "month" ? "\u6708" : "\u5929"
      ] }) : null
    ] }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "err", children: error }) : null,
    data && hasData ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-cards", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-k", children: "Tokens \u7528\u91CF" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-v", children: full(totals?.tokens) }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-card-s", children: [
            "\u8F93\u5165 ",
            full(totals?.prompt_tokens),
            " \xB7 \u8F93\u51FA ",
            full(totals?.completion_tokens)
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-k", children: "\u8BF7\u6C42\u6570\u91CF" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-v", children: full(totals?.requests) }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-s", children: "\u4EC5\u7EDF\u8BA1\u6210\u529F\u8BF7\u6C42" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-k", children: "\u5E73\u5747\u7F13\u5B58\u547D\u4E2D" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-v", children: rateText(totals?.cache_hit_rate) }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-card-s", children: [
            fmtCount(totals?.cached_tokens ?? 0),
            " \u7F13\u5B58\u547D\u4E2D"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-k", children: "\u6D3B\u8DC3\u5929\u6570" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-v", children: totals?.active_days ?? 0 }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-card-s", children: [
            "\u533A\u95F4 ",
            data.axis.length,
            " ",
            granularity === "month" ? "\u4E2A\u6708" : "\u5929"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-k", children: group === "logical" ? "\u6700\u5E38\u7528\u903B\u8F91\u6A21\u578B" : "\u6700\u5E38\u7528\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-v usage-card-v-sm", children: top?.name ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-card-s", children: top ? top.provider ?? (group === "logical" ? "\u903B\u8F91\u6A21\u578B" : "") : "\u5168\u90E8\u5F52\u300C\u5176\u4ED6\u300D" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { className: "usage-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { children: trendTitle }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { ref: chartEl, className: "usage-chart-wrap", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
            "svg",
            {
              width: "100%",
              height: GEO.h,
              viewBox: `0 0 ${chartW} ${GEO.h}`,
              className: "usage-chart",
              onMouseLeave: () => setHoverIdx(null),
              children: [
                chart.ticksLeft.map((t) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("text", { className: "axis-text", x: GEO.padL - 6, y: t.y + 3.5, textAnchor: "end", children: t.text }, `lt${t.v}`)),
                chart.ticksRight.map((t) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
                  "text",
                  {
                    className: "axis-text axis-text-r",
                    x: GEO.padL + (chartW - GEO.padL - GEO.padR) + 6,
                    y: t.y + 3.5,
                    children: t.text
                  },
                  `rt${t.p}`
                )),
                chart.labels.map((l) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("text", { className: "axis-text", x: l.x, y: GEO.padT + PLOT_H + 16, textAnchor: "middle", children: l.text }, `lb${l.x}`)),
                chart.bars.map((b) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("rect", { x: b.x, y: b.y, width: b.w, height: Math.max(0, b.h), fill: b.color, className: "usage-bar" }, b.key)),
                chart.path ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("path", { d: chart.path, fill: "none", stroke: LINE_COLOR, strokeWidth: 2, className: "usage-line" }) : null,
                chart.bs.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
                  "rect",
                  {
                    className: "bar-hit",
                    x: chart.xOf(i) - Math.max(chart.barW, chart.pitch) / 2,
                    y: GEO.padT,
                    width: Math.max(chart.barW, chart.pitch),
                    height: PLOT_H,
                    onMouseEnter: () => setHoverIdx(i)
                  },
                  `hit${b.key}`
                )),
                hoverIdx != null && chart.bs[hoverIdx] && chart.bs[hoverIdx].cache_hit_rate != null ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
                  "circle",
                  {
                    cx: chart.xOf(hoverIdx),
                    cy: chart.bottom - (chart.bs[hoverIdx].cache_hit_rate ?? 0) * PLOT_H,
                    r: 4,
                    fill: LINE_COLOR
                  }
                ) : null
              ]
            }
          ),
          hover ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { ref: tipEl, className: "usage-tip", style: { left: `${hover.left}px` }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-tip-head", children: hover.key }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "\u603B Token" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("b", { children: full(hover.tokens) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "\u8BF7\u6C42" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("b", { children: full(hover.requests) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { children: "\u7F13\u5B58\u547D\u4E2D\u7387" }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("b", { children: hover.rate })
            ] }),
            hover.rows.length ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-tip-sep" }) : null,
            hover.rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "usage-tip-nm", children: [
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("i", { className: "usage-dot sm", style: { background: r.color } }),
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-tip-nm-t", title: r.name, children: r.name })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("b", { children: fmtCount(r.tokens) })
            ] }, r.key)),
            hover.more ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-tip-more", children: [
              "\u2026\u53E6\u6709 ",
              hover.more,
              " \u4E2A\u5E8F\u5217"
            ] }) : null
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-legend", children: [
          data.series.map((s) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "usage-legend-i", children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("i", { className: "usage-dot", style: { background: seriesColor(s, data.series) } }),
            seriesLabel(s, group)
          ] }, s.key)),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "usage-legend-i", children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("i", { className: "usage-line-sw", style: { background: LINE_COLOR } }),
            "\u7F13\u5B58\u547D\u4E2D\u7387"
          ] })
        ] }),
        chart.hidden ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "hint", children: [
          "\u6876\u592A\u5BC6,\u53EA\u753B\u6700\u8FD1 ",
          chart.bs.length,
          " \u4E2A(\u66F4\u65E9 ",
          chart.hidden,
          " \u4E2A\u6CA1\u753B\u5165\u67F1\u72B6\u56FE),\u53EF\u5207\u300C\u6309\u6708\u300D\u770B\u66F4\u957F\u7684\u8DE8\u5EA6\u3002"
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { className: "usage-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { children: "\u6A21\u578B\u7528\u91CF" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { ref: donutEl, className: "usage-split", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("svg", { className: "usage-donut", width: ring.s, height: ring.s, viewBox: `0 0 ${ring.s} ${ring.s}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("circle", { cx: ring.c, cy: ring.c, r: ring.r, fill: "none", stroke: "#22262e", strokeWidth: ring.sw }),
            modelSegs.map((g) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              "circle",
              {
                cx: ring.c,
                cy: ring.c,
                r: ring.r,
                fill: "none",
                stroke: g.color,
                strokeWidth: ring.sw,
                strokeDasharray: `${g.len} ${ring.circ - g.len}`,
                strokeDashoffset: -g.off,
                transform: `rotate(-90 ${ring.c} ${ring.c})`
              },
              g.key
            )),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.04, className: "usage-donut-v", textAnchor: "middle", children: fmtCount(modelRingTotal) }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.13, className: "usage-donut-k", textAnchor: "middle", children: "Tokens \u7528\u91CF" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ol", { className: "usage-rank", children: data.series.map((s, i) => {
            const kids = s.is_other ? s.folded ?? [] : s.models;
            const kidKey = (m, j) => m.key ?? `${m.provider ?? ""}/${m.name}:${j}`;
            return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
                "div",
                {
                  className: `usage-row${kids.length > 0 ? " clickable" : ""}`,
                  onClick: kids.length ? () => toggle(`m:${s.key}`) : void 0,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-rank-i", children: i + 1 }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: `usage-caret${expanded[`m:${s.key}`] ? " open" : ""}`, children: kids.length ? "\u203A" : "" }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("i", { className: "usage-dot", style: { background: seriesColor(s, data.series) } }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "usage-name", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name-m", children: s.is_other ? "\u5176\u4ED6" : rowMain(s) }),
                      rowSub(s) ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name-s", children: rowSub(s) }) : null
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-val", children: full(s.tokens) }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-pct", children: fmtPct(s.percent) })
                  ]
                }
              ),
              expanded[`m:${s.key}`] ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-fold", children: kids.map((m, j) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-subrow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("i", { className: "usage-dot sm", style: { background: OTHER_COLOR } }),
                /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "usage-name", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name-m", children: m.name }),
                  m.provider ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name-s", children: m.provider }) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-val", children: full(m.tokens) }),
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-pct", children: fmtPct(m.percent) })
              ] }, kidKey(m, j))) }) : null
            ] }, s.key);
          }) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("section", { className: "usage-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h2", { children: "\u5404\u4F9B\u5E94\u5546\u7528\u91CF" }),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-split", children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("svg", { className: "usage-donut", width: ring.s, height: ring.s, viewBox: `0 0 ${ring.s} ${ring.s}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("circle", { cx: ring.c, cy: ring.c, r: ring.r, fill: "none", stroke: "#22262e", strokeWidth: ring.sw }),
            providerSegs.map((g) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              "circle",
              {
                cx: ring.c,
                cy: ring.c,
                r: ring.r,
                fill: "none",
                stroke: g.color,
                strokeWidth: ring.sw,
                strokeDasharray: `${g.len} ${ring.circ - g.len}`,
                strokeDashoffset: -g.off,
                transform: `rotate(-90 ${ring.c} ${ring.c})`
              },
              g.key
            )),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.04, className: "usage-donut-v", textAnchor: "middle", children: fmtCount(providerRingTotal) }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.13, className: "usage-donut-k", textAnchor: "middle", children: "Tokens \u7528\u91CF" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("ol", { className: "usage-rank", children: data.providers.map((p, i) => (
            //: As One 契约的 UsageProvider 无 key/name,用 provider 当键;「其他」行
            //: 的显示名固定为「其他」(Nexus 的 p.name),机器键为哨兵
            //: "\u0000pother"。folded 为对齐 Nexus is_other 行新增(见
            //: panel-types.ts),assembly 在排名尾部确有被聚合供应商时产出。
            /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
                "div",
                {
                  className: `usage-row${(p.is_other ? (p.folded?.length ?? 0) > 0 : p.models.length > 0) ? " clickable" : ""}`,
                  onClick: (p.is_other ? (p.folded?.length ?? 0) > 0 : p.models.length > 0) ? () => toggle(`p:${p.provider}`) : void 0,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-rank-i", children: i + 1 }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: `usage-caret${expanded[`p:${p.provider}`] ? " open" : ""}`, children: p.is_other ? p.folded?.length ?? 0 ? "\u203A" : "" : p.models.length ? "\u203A" : "" }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("i", { className: "usage-dot", style: { background: providerColor(p, i) } }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "usage-name", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name-m", children: p.is_other ? "\u5176\u4ED6" : p.provider }),
                      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name-s", children: p.is_other ? `${p.folded?.length ?? 0} \u4E2A\u4F9B\u5E94\u5546` : `${p.models.length} \u4E2A\u6A21\u578B` })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-val", children: full(p.tokens) }),
                    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-pct", children: fmtPct(p.percent) })
                  ]
                }
              ),
              expanded[`p:${p.provider}`] ? p.is_other ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-fold", children: (p.folded ?? []).map((f) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
                  "div",
                  {
                    className: `usage-subrow${f.models.length > 0 ? " clickable" : ""}`,
                    onClick: f.models.length ? () => toggle(`pf:${f.key}`) : void 0,
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: `usage-caret fold${expanded[`pf:${f.key}`] ? " open" : ""}`, children: f.models.length ? "\u203A" : "" }),
                      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("i", { className: "usage-dot sm", style: { background: OTHER_COLOR } }),
                      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "usage-name", children: [
                        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name-m", children: f.name }),
                        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("span", { className: "usage-name-s", children: [
                          f.models.length,
                          " \u4E2A\u6A21\u578B"
                        ] })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-val", children: full(f.tokens) }),
                      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-pct", children: fmtPct(f.percent) })
                    ]
                  }
                ),
                expanded[`pf:${f.key}`] ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-fold deep", children: f.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-subrow", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name-m", children: m.name }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-val", children: full(m.tokens) }),
                  /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-pct", children: fmtPct(m.percent) })
                ] }, `${m.provider ?? ""}/${m.name}`)) }) : null
              ] }, f.key)) }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "usage-fold", children: p.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "usage-subrow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("i", { className: "usage-dot sm", style: { background: OTHER_COLOR } }),
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-name-m", children: m.name }) }),
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-val", children: full(m.tokens) }),
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "usage-pct", children: fmtPct(m.percent) })
              ] }, `${m.provider ?? ""}/${m.name}`)) }) : null
            ] }, p.provider)
          )) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "hint usage-foot", children: [
        "\u7EDF\u8BA1\u622A\u81F3 ",
        data.last_day ?? "\u2014",
        " \xB7 \u533A\u95F4 ",
        rangeText,
        " \xB7 \u6570\u636E\u6E90 ",
        data.source
      ] })
    ] }) : null,
    data && !hasData ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("p", { className: "hint", children: [
      "\u8FD9\u4E2A\u533A\u95F4\u5185\u6CA1\u6709\u7528\u91CF\u6570\u636E(\u5E93\u91CC\u6709\u6570\u636E\u7684\u8303\u56F4\u662F ",
      data.from,
      " \u2192 ",
      data.last_day ?? data.to,
      ",\u6362\u4E00\u4E2A\u65F6\u95F4\u8303\u56F4\u770B\u770B)\u3002"
    ] }) : null,
    !data && !loading ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "hint", children: "\u6682\u65E0\u7559\u5B58\u6570\u636E(\u7F51\u5173\u5904\u7406\u8BF7\u6C42\u540E\u81EA\u52A8\u6309\u5929\u843D\u76D8)\u3002" }) : null
  ] });
}

// ../panel-ui/src/pages/SettingsPage.tsx
var import_react13 = __toESM(require("react"), 1);

// ../panel-ui/src/pages/settings-rules.tsx
var import_react12 = __toESM(require("react"), 1);
var import_jsx_runtime15 = require("react/jsx-runtime");
var WEEKDAYS = Array.from({ length: 7 }, (_, i) => ({
  k: i + 1,
  // 1=周一 .. 7=周日(后端口径)
  label: "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u65E5"[i]
}));
var HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function freshGroups() {
  return { free: [], expiry: [], consume: [], degrade: [], disabled: [], cooldown: [], other: [] };
}
var RULES_PRIORITY_KEYS = ["scheduler.rules_p1", "scheduler.rules_p2", "scheduler.rules_p3", "scheduler.rules_p4", "scheduler.rules_p0"];
function pushTier(groups, key, tr) {
  switch (key) {
    case "scheduler.rules_p1":
      groups.free.push(tr);
      break;
    case "scheduler.rules_p2":
      groups.expiry.push(tr);
      break;
    case "scheduler.rules_p3":
      groups.consume.push(tr);
      break;
    case "scheduler.rules_p4":
      groups.degrade.push(tr);
      break;
    case "scheduler.rules_p0":
      groups.disabled.push(tr);
      break;
    default:
      groups.other.push(tr);
  }
}
function parseRules(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON \u89E3\u6790\u5931\u8D25:${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, error: "\u9876\u5C42\u5FC5\u987B\u662F\u5BF9\u8C61(5 \u4E2A\u6863\u4F4D\u952E:scheduler.rules_p1..p0)" };
  }
  const groups = freshGroups();
  const seen = /* @__PURE__ */ new Set();
  for (const [key, value] of Object.entries(obj)) {
    if (!RULES_PRIORITY_KEYS.includes(key)) {
      return {
        ok: false,
        error: `\u672A\u77E5\u6863\u4F4D\u952E:${key}(\u9876\u5C42\u53EA\u8BA4 5 \u4E2A\u6863\u4F4D\u952E:scheduler.rules_p1..p0;\u65E7\u5355\u952E {"rules": [...]} \u5DF2\u9000\u5F79,\u7531\u5F15\u64CE\u8FC1\u79FB)`
      };
    }
    seen.add(key);
    if (!Array.isArray(value)) {
      return { ok: false, error: `${key} \u5FC5\u987B\u662F\u6570\u7EC4,\u6536\u5230 ${typeof value}` };
    }
    for (const item of value) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        groups.other.push(item);
        continue;
      }
      const r = item;
      if ("priority" in r && r["priority"] !== void 0 && r["priority"] !== null) {
        groups.other.push(item);
        continue;
      }
      const provider = typeof r.provider === "string" ? r.provider : "";
      const model = typeof r.model === "string" ? r.model : "";
      const expires_at = typeof r.expires_at === "string" ? r.expires_at : "";
      const winSrc = typeof r.window === "object" && r.window !== null && !Array.isArray(r.window) ? r.window : r;
      const hasTimes = Array.isArray(winSrc.times);
      const hasCooldown = r.cooldown !== void 0 && r.cooldown !== null;
      if (hasTimes && hasCooldown) {
        groups.other.push(item);
        continue;
      }
      if (hasTimes) {
        const spans = winSrc.times.map(
          (s) => Array.isArray(s) && s.length === 2 && typeof s[0] === "string" && typeof s[1] === "string" ? { start: s[0], end: s[1] } : null
        );
        if (spans.some((s) => s === null)) {
          groups.other.push(item);
          continue;
        }
        const weekdays2 = Array.isArray(winSrc.weekdays) ? winSrc.weekdays.filter(
          (d) => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7
        ) : [];
        const tr = { provider, model, expires_at, weekdays: weekdays2, times: spans };
        pushTier(groups, key, tr);
        continue;
      }
      if (hasCooldown) {
        groups.cooldown.push({ provider, cooldown: Number(r.cooldown) });
        continue;
      }
      const weekdays = Array.isArray(winSrc.weekdays) ? winSrc.weekdays.filter(
        (d) => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7
      ) : [];
      pushTier(groups, key, { provider, model, expires_at, weekdays, times: [] });
    }
  }
  for (const key of RULES_PRIORITY_KEYS) {
    if (!seen.has(key)) groups.other.push({ __missing: key });
  }
  return { ok: true, groups };
}
function serializeGroups(g) {
  const winOf = (r) => {
    const w = {};
    if (r.weekdays.length) w.weekdays = [...r.weekdays];
    if (r.times.length) w.times = r.times.map((t) => [t.start, t.end]);
    return Object.keys(w).length > 0 ? w : void 0;
  };
  const ruleOf = (r) => ({
    provider: r.provider,
    ...r.model ? { model: r.model } : {},
    ...r.expires_at ? { expires_at: r.expires_at } : {},
    ...winOf(r) ? { window: winOf(r) } : {}
  });
  const obj = {
    "scheduler.rules_p1": g.free.map(ruleOf),
    "scheduler.rules_p2": g.expiry.map(ruleOf),
    "scheduler.rules_p3": g.consume.map(ruleOf),
    "scheduler.rules_p4": g.degrade.map(ruleOf),
    "scheduler.rules_p0": g.disabled.map(ruleOf)
  };
  for (const o of g.other) {
    if (o && typeof o === "object" && "__key" in o && "__value" in o) {
      const rec = o;
      if (!(rec.__key in obj)) obj[rec.__key] = [];
      obj[rec.__key].push(rec.__value);
      continue;
    }
    if (o && typeof o === "object" && "__missing" in o) {
      continue;
    }
    obj["scheduler.rules_p3"].push(o);
  }
  for (const key of RULES_PRIORITY_KEYS) {
    if (!(key in obj)) obj[key] = [];
  }
  return JSON.stringify(obj, null, 2);
}
function serializeCooldowns(g) {
  const out = {};
  for (const r of g.cooldown) {
    if (r.provider.trim() === "") continue;
    if (!(Number(r.cooldown) > 0)) continue;
    out[r.provider.trim()] = Number(r.cooldown);
  }
  return JSON.stringify(out, null, 2);
}
function serializeRulesByKey(g) {
  const obj = JSON.parse(serializeGroups(g));
  const out = {};
  for (const key of RULES_PRIORITY_KEYS) {
    out[key] = JSON.stringify(obj[key] ?? [], null, 2);
  }
  return out;
}
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function tierErr(r) {
  if (!r.provider.trim()) return "provider \u5FC5\u586B";
  if (r.times.length > 0 && !r.model.trim()) return "\u5E26\u751F\u6548\u65F6\u95F4\u6BB5\u7684\u89C4\u5219\u5FC5\u987B\u586B model";
  for (const t of r.times) {
    if (!HHMM_RE.test(t.start) || !HHMM_RE.test(t.end)) return "\u65F6\u6BB5\u987B\u4E3A HH:MM \u683C\u5F0F";
    if (t.start === t.end) return "\u5F00\u59CB\u4E0E\u7ED3\u675F\u4E0D\u80FD\u76F8\u540C";
  }
  if (r.expires_at && !validDate(r.expires_at)) return "\u5230\u671F\u65E5\u987B\u4E3A YYYY-MM-DD";
  return null;
}
function cooldownErr(r) {
  if (!r.provider.trim()) return "provider \u5FC5\u586B";
  if (!(Number(r.cooldown) > 0)) return "\u51B7\u5374\u987B\u4E3A\u6B63\u6570(\u5206\u949F)";
  return null;
}
function rulesProblem(g) {
  for (const [group, name2] of [
    [g.free, "P1 \u514D\u8D39\u6863"],
    [g.expiry, "P2 \u79EF\u5206\u5230\u671F"],
    [g.consume, "P3 \u666E\u901A\u6D88\u8017"],
    [g.degrade, "P4 \u9AD8\u5CF0\u4F4E\u4F18\u5148"],
    [g.disabled, "\u7981\u7528\u6863"]
  ]) {
    for (const r of group) {
      const e = tierErr(r);
      if (e) return `${name2}:${e}`;
    }
  }
  for (const r of g.cooldown) {
    const e = cooldownErr(r);
    if (e) return `\u4F9B\u5E94\u5546\u51B7\u5374:${e}`;
  }
  return null;
}
function withCurrent(options, current) {
  return current && !options.includes(current) ? [...options, current] : options;
}
function ProviderBox(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "box box-provider", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "box-label", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { children: [
        "Provider ",
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "req", children: "*" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "btn-del", onClick: props.onDelete, children: "\u5220\u9664\u89C4\u5219" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("select", { className: "input-control", value: props.value, onChange: (ev) => props.onSelect(ev.target.value), children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: "", children: "\u8BF7\u9009\u62E9 Provider" }),
      withCurrent(props.options, props.value).map((p) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: p, children: p }, p))
    ] })
  ] });
}
function ModelBox(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "box box-model", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { children: [
      "Model",
      props.optional ? "(\u53EF\u9009)" : ""
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("select", { className: "input-control", value: props.value, onChange: (ev) => props.onSelect(ev.target.value), children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: "", children: "\u7559\u7A7A = \u5168\u90E8" }),
      withCurrent(props.options, props.value).map((m) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: m, children: m }, m))
    ] })
  ] });
}
function ExpiryBox(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "box box-expiry", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u5230\u671F\u65F6\u95F4" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
      "input",
      {
        type: "date",
        className: `input-control${props.value ? "" : " is-empty"}`,
        value: props.value,
        onChange: (ev) => props.onChange(ev.target.value)
      }
    )
  ] });
}
function WeekdayBox(props) {
  const renderDay = (w) => {
    const id = `${props.idPrefix}-w${w.k}`;
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_react12.default.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("input", { type: "checkbox", id, checked: props.weekdays.includes(w.k), onChange: () => props.onToggle(w.k) }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("label", { htmlFor: id, children: w.label })
    ] }, w.k);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "box box-weekdays", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u751F\u6548\u661F\u671F" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "weekday-flex", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "weekday-group", children: WEEKDAYS.slice(0, 5).map(renderDay) }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "weekday-group", children: WEEKDAYS.slice(5).map(renderDay) })
    ] })
  ] });
}
function TimesBox(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "box box-times", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u751F\u6548\u65F6\u95F4\u6BB5" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "time-flex", children: [
      props.times.map((t, ti) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "time-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "input",
          {
            type: "time",
            className: "input-control",
            value: t.start,
            onChange: (ev) => props.onPatch(props.times.map((x, at) => at === ti ? { ...x, start: ev.target.value } : x))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "separator", children: "~" }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "input",
          {
            type: "time",
            className: "input-control",
            value: t.end,
            onChange: (ev) => props.onPatch(props.times.map((x, at) => at === ti ? { ...x, end: ev.target.value } : x))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "button",
          {
            type: "button",
            className: "btn-del-time",
            onClick: () => props.onPatch(props.times.filter((_, at) => at !== ti)),
            children: "\xD7"
          }
        )
      ] }, ti)),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "button",
        {
          type: "button",
          className: "btn-add-time",
          onClick: () => props.onPatch([...props.times, { start: "09:00", end: "18:00" }]),
          children: "+ \u6DFB\u52A0\u65F6\u95F4\u6BB5"
        }
      )
    ] })
  ] });
}
function CooldownBox(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "box box-cooldown", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u51B7\u5374(\u5206\u949F)" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
      "input",
      {
        type: "number",
        min: 1,
        className: "input-control",
        value: props.value,
        onChange: (ev) => props.onChange(ev.target.value === "" ? "" : Number(ev.target.value))
      }
    )
  ] });
}
function ruleCard(badge, rules, add, render, hint) {
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "rule-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "card-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "badge", children: badge }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "btn-add", onClick: add, children: "+ \u6DFB\u52A0\u89C4\u5219" })
    ] }),
    hint ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "card-hint", children: hint }) : null,
    rules.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "card-empty", children: "\u6682\u65E0\u89C4\u5219,\u70B9\u53F3\u4E0A\u300C+ \u6DFB\u52A0\u89C4\u5219\u300D\u65B0\u589E" }) : null,
    rules.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_react12.default.Fragment, { children: render(r, i) }, i))
  ] });
}

// ../panel-ui/src/pages/SettingsPage.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
var SECTION_TITLES = {
  // ⚠️ 这些 key 必须与后端 sections 的段名一字不差。
  external_refresh: {
    title: "\u5916\u90E8\u6570\u636E\u5237\u65B0"
  },
  scheduler: {
    title: "\u8C03\u5EA6\u89C4\u5219"
  },
  retry: {
    title: "\u91CD\u8BD5\u7B56\u7565"
  },
  ui: {
    title: "\u754C\u9762"
  }
};
var UNIT_BY_KEY = {
  "external_refresh.interval_hours": "\u5C0F\u65F6",
  "retry.base_backoff_s": "\u79D2",
  "retry.max_backoff_s": "\u79D2",
  "retry.jitter_ratio": "\u6BD4\u4F8B",
  "retry.logical_max": "\u6B21",
  "retry.real_max": "\u6B21",
  "retry.logical_cooldown": "\u5206\u949F",
  "real.wait_budget_s": "\u79D2",
  "scheduler.pin_seconds": "\u79D2",
  "ui.recent_limit": "\u6761"
};
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}
function backoffChart(draft) {
  const retry = draft.retry ?? {};
  const read = (key, fb) => {
    const v = retry[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n3 = typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n3) ? n3 : fb;
  };
  const base = Math.max(1e-3, read("retry.base_backoff_s", 1));
  const cap = Math.max(base, read("retry.max_backoff_s", 15));
  const jit = Math.min(1, Math.max(0, read("retry.jitter_ratio", 0.2)));
  const realMax = Math.trunc(read("retry.real_max", 10));
  const logicalMax = Math.max(1, Math.trunc(read("retry.logical_max", 1)));
  const unlimited = realMax <= 0;
  const N = unlimited ? 12 : Math.min(Math.max(realMax, 1), 12);
  const raw = (n3) => Math.min(cap, base * Math.pow(2, n3 - 1));
  const seq = [];
  for (let n3 = 1; n3 <= N; n3++) seq.push(raw(n3));
  const maxV = Math.max(...seq, 1e-3);
  const sumUpTo = (k) => {
    let s = 0;
    for (let n3 = 1; n3 <= k; n3++) s += raw(n3);
    return s;
  };
  const W = 560;
  const H = 150;
  const padL = 46;
  const padR = 10;
  const padT = 16;
  const padB = 24;
  const x = (i) => padL + (N === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (N - 1));
  const yTop = niceCeil(maxV);
  const y = (v) => padT + (H - padT - padB) * (1 - v / yTop);
  const fmtAxis = (v) => {
    if (v === 0) return "0s";
    if (v >= 10) return `${Math.round(v)}s`;
    return `${v.toFixed(2).replace(/\.?0+$/, "")}s`;
  };
  const yTicks = [0, yTop / 2, yTop].map((v) => ({ v, y: y(v) }));
  const bandW = Math.max(6, Math.min(18, (W - padL - padR) / N * 0.7));
  const dashX = x(Math.min(Math.max(logicalMax, 1), N) - 1);
  const truncated = unlimited || realMax > 12;
  const fmt1 = (n3) => {
    if (!Number.isFinite(n3)) return "0";
    if (Math.abs(n3) >= 1e4) return n3.toLocaleString("en-US", { maximumFractionDigits: 1 });
    return n3.toFixed(1);
  };
  const seqText = `\u5E8F\u5217\uFF1A${seq.map((v) => `${fmt1(v)}s`).join(" \u2192 ")}${truncated ? " \u2026" : ""}\uFF08\u5171 ${N} \u6863${truncated ? "\uFF0C\u663E\u793A\u524D 12 \u6863" : ""}\uFF09`;
  const sumK = sumUpTo(logicalMax);
  const budgetKText = `\u9884\u7B97\uFF08\u903B\u8F91\u6A21\u578B\u6210\u5458\uFF0C${logicalMax} \u6863\uFF09\uFF1A\u7D2F\u8BA1 ${fmt1(sumK * (1 - jit))}s~${fmt1(sumK)}s\uFF08\u542B\u6296\u52A8\u533A\u95F4\uFF09`;
  let budgetMText;
  if (unlimited) {
    const s = sumUpTo(12);
    budgetMText = `\u9884\u7B97\uFF08\u76F4\u8FDE\uFF0C\u6863\u6570\u4E0D\u9650\u5236\uFF09\uFF1A\u6309\u524D 12 \u6863\u4F30\u7B97\u7D2F\u8BA1 ${fmt1(s * (1 - jit))}s~${fmt1(s)}s\uFF08\u542B\u6296\u52A8\u533A\u95F4\uFF09`;
  } else {
    const s = sumUpTo(realMax);
    budgetMText = `\u9884\u7B97\uFF08\u76F4\u8FDE\uFF0C${realMax} \u6863\uFF09\uFF1A\u7D2F\u8BA1 ${fmt1(s * (1 - jit))}s~${fmt1(s)}s\uFF08\u542B\u6296\u52A8\u533A\u95F4\uFF09`;
  }
  return {
    W,
    H,
    padL,
    padR,
    padT,
    padB,
    N,
    seq,
    jit,
    bandW,
    dashX,
    x,
    y,
    seqText,
    budgetKText,
    budgetMText,
    yTop,
    yTicks,
    fmtAxis
  };
}
function cloneSections(s) {
  const out = {};
  for (const k of Object.keys(s)) out[k] = { ...s[k] };
  return out;
}
function errText2(e) {
  return e instanceof Error ? e.message : String(e);
}
function SettingsPage() {
  const [data, setData] = import_react13.default.useState(null);
  const [draft, setDraft] = import_react13.default.useState({});
  const [busy, setBusy] = import_react13.default.useState(false);
  const [msg4, setMsg] = import_react13.default.useState("");
  const [err, setErr] = import_react13.default.useState("");
  const [ruleGroups, setRuleGroups] = import_react13.default.useState(freshGroups());
  const [deployments, setDeployments] = import_react13.default.useState([]);
  const [reqLog, setReqLog] = import_react13.default.useState(null);
  const [logMsg, setLogMsg] = import_react13.default.useState("");
  const [keyCopied, setKeyCopied] = import_react13.default.useState(false);
  async function load() {
    setBusy(true);
    setErr("");
    try {
      const r = await rendererApi.getSettings();
      const s = cloneSections(r.sections);
      setData(r);
      setDraft(s);
      parseDraftRules(s);
    } catch (e) {
      setErr(`\u8BFB\u53D6\u5931\u8D25:${errText2(e)}`);
    } finally {
      setBusy(false);
    }
  }
  async function loadReqLog() {
    try {
      const r = await rendererApi.getRequestLog();
      setReqLog(r);
    } catch (e) {
      setLogMsg(`\u8BFB\u53D6\u8BF7\u6C42\u65E5\u5FD7\u72B6\u6001\u5931\u8D25:${errText2(e)}`);
    }
  }
  async function loadDeployments() {
    try {
      const r = await rendererApi.getDeployments();
      setDeployments(r.deployments);
    } catch {
    }
  }
  import_react13.default.useEffect(() => {
    void load();
    void loadReqLog();
    void loadDeployments();
  }, []);
  function setValue(section, spec, raw) {
    const val = spec.kind === "bool" ? raw ? "true" : "false" : String(raw);
    setDraft((d) => ({ ...d, [section]: { ...d[section] ?? {}, [spec.key]: val } }));
  }
  function changedPayload() {
    const out = {};
    if (!data) return out;
    for (const section of Object.keys(draft)) {
      const orig = data.sections[section] ?? {};
      for (const key of Object.keys(draft[section])) {
        if (JSON.stringify(draft[section][key]) !== JSON.stringify(orig[key])) {
          (out[section] ??= {})[key] = draft[section][key];
        }
      }
    }
    return out;
  }
  function totalChanged() {
    if (!data) return 0;
    let n3 = 0;
    for (const section of Object.keys(draft)) {
      const orig = data.sections[section] ?? {};
      for (const key of Object.keys(draft[section])) {
        if (JSON.stringify(draft[section][key]) !== JSON.stringify(orig[key])) n3++;
      }
    }
    return n3;
  }
  async function save() {
    let groups = ruleGroups;
    const problem = rulesProblem(groups);
    if (problem) {
      setErr(problem);
      return;
    }
    const rulesFields = serializeRulesByKey(groups);
    const cooldownJson = serializeCooldowns(groups);
    console.log(
      "[\u8C03\u5EA6\u89C4\u5219] \u4FDD\u5B58 - \u6E05\u6D17\u540E\u6700\u7EC8 JSON:",
      JSON.stringify(
        { ...JSON.parse(serializeGroups(groups)), "scheduler.cooldown_overrides": JSON.parse(cooldownJson) },
        null,
        2
      )
    );
    setDraft((d) => ({
      ...d,
      scheduler: {
        ...d.scheduler ?? {},
        ...rulesFields,
        "scheduler.cooldown_overrides": cooldownJson
      }
    }));
    const payload = changedPayload();
    const origScheduler = data?.sections["scheduler"] ?? {};
    const schedOut = {};
    for (const key of RULES_PRIORITY_KEYS) {
      if (JSON.stringify(rulesFields[key]) !== JSON.stringify(origScheduler[key] ?? "")) {
        schedOut[key] = rulesFields[key];
      }
    }
    if (JSON.stringify(cooldownJson) !== JSON.stringify(origScheduler["scheduler.cooldown_overrides"] ?? "")) {
      schedOut["scheduler.cooldown_overrides"] = cooldownJson;
    }
    if (Object.keys(schedOut).length > 0) payload["scheduler"] = { ...payload["scheduler"] ?? {}, ...schedOut };
    if (Object.keys(payload).length === 0) {
      setMsg("\u6CA1\u6709\u6539\u52A8");
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await rendererApi.saveSettings(payload);
      setMsg(r.message || "\u5DF2\u4FDD\u5B58");
      await load();
    } catch (e) {
      setErr(`\u4FDD\u5B58\u5931\u8D25:${errText2(e)}`);
    } finally {
      setBusy(false);
    }
  }
  function discard() {
    void load();
  }
  async function saveReqLog(contentMode) {
    setBusy(true);
    setLogMsg("");
    try {
      const r = await rendererApi.setRequestLog({ content_mode: contentMode });
      setLogMsg(r.message ?? "");
      await loadReqLog();
    } catch (e) {
      setLogMsg(`\u4FDD\u5B58\u5931\u8D25:${errText2(e)}`);
    } finally {
      setBusy(false);
    }
  }
  async function copyKey() {
    if (!data?.master_key) return;
    try {
      await navigator.clipboard.writeText(data.master_key);
      setKeyCopied(true);
      window.setTimeout(() => setKeyCopied(false), 2e3);
    } catch {
      setKeyCopied(false);
    }
  }
  function sectionOf(spec) {
    if (spec.section) return spec.section;
    return spec.key.includes(".") ? spec.key.slice(0, spec.key.indexOf(".")) : spec.key;
  }
  function specsOf(section) {
    if (!data) return [];
    return data.specs.filter((s) => !s.hidden && sectionOf(s) === section);
  }
  function specOf(key) {
    if (!data) return void 0;
    return data.specs.find((s) => !s.hidden && s.key === key);
  }
  function field(section, spec, wide = false) {
    const value = draft[section]?.[spec.key] ?? "";
    const kind = spec.kind;
    const unit = UNIT_BY_KEY[spec.key] || "";
    const on = value === "true" || value === "1";
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-field" + (wide || kind === "json" ? " wide" : ""), children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-field-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-field-label", children: spec.label }),
        unit ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-field-unit", children: unit }) : null
      ] }),
      kind === "bool" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("label", { className: "ui-check", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
          "input",
          {
            type: "checkbox",
            checked: on,
            disabled: busy,
            onChange: (ev) => setValue(section, spec, ev.target.checked)
          }
        ),
        on ? "\u5DF2\u542F\u7528" : "\u5DF2\u5173\u95ED"
      ] }) : kind === "enum" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        "select",
        {
          className: "ui-select",
          value,
          disabled: busy,
          onChange: (ev) => setValue(section, spec, ev.target.value),
          children: (spec.options ?? []).map((opt) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: opt, children: opt }, opt))
        }
      ) : kind === "json" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        "textarea",
        {
          className: "ui-jsonbox",
          rows: 10,
          value,
          disabled: busy,
          onChange: (ev) => setValue(section, spec, ev.target.value)
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        "input",
        {
          className: "ui-input",
          type: kind === "int" || kind === "float" ? "number" : "text",
          min: spec.min,
          max: spec.max,
          step: kind === "float" ? "0.1" : void 0,
          value,
          disabled: busy,
          onChange: (ev) => setValue(section, spec, ev.target.value)
        }
      )
    ] }, spec.key);
  }
  function retryGroups() {
    const pick = (keys) => keys.map((k) => specOf(k)).filter((s) => s !== void 0);
    return [
      {
        title: "\u9000\u907F\u5F62\u72B6",
        fields: pick(["retry.base_backoff_s", "retry.max_backoff_s", "retry.jitter_ratio"])
      },
      // ⭐「请求超时时间」(real.wait_budget_s)归在本小节;契约无此字段时 pick 过滤后自然缺席。
      {
        title: "\u91CD\u8BD5\u6B21\u6570\u4E0E\u51B7\u5374",
        fields: pick(["real.wait_budget_s", "retry.logical_max", "retry.real_max", "retry.logical_cooldown"])
      }
    ];
  }
  const providerOptions = [...new Set(deployments.map((d) => d.provider))].sort();
  function modelOptionsFor(provider) {
    const src = provider ? deployments.filter((d) => d.provider === provider) : deployments;
    return [...new Set(src.map((d) => d.model))].sort();
  }
  function updateRules(next) {
    setRuleGroups(next);
    const rulesFields = serializeRulesByKey(next);
    setDraft((d) => ({
      ...d,
      scheduler: {
        ...d.scheduler ?? {},
        ...rulesFields,
        "scheduler.cooldown_overrides": serializeCooldowns(next)
      }
    }));
  }
  const TIER_KEYS = ["free", "expiry", "consume", "degrade", "disabled"];
  function tierList(key) {
    switch (key) {
      case "free":
        return ruleGroups.free;
      case "expiry":
        return ruleGroups.expiry;
      case "consume":
        return ruleGroups.consume;
      case "degrade":
        return ruleGroups.degrade;
      case "disabled":
        return ruleGroups.disabled;
    }
  }
  function patchTier(key, i, patch) {
    const next = { ...ruleGroups, [key]: tierList(key).map((r, at) => at === i ? { ...r, ...patch } : r) };
    updateRules(next);
  }
  function addTier(key) {
    updateRules({ ...ruleGroups, [key]: [...tierList(key), { provider: "", model: "", expires_at: "", weekdays: [], times: [] }] });
  }
  function removeTier(key, i) {
    updateRules({ ...ruleGroups, [key]: tierList(key).filter((_, at) => at !== i) });
  }
  function addTime(i, key) {
    const list = tierList(key);
    patchTier(key, i, { times: [...list[i].times, { start: "09:00", end: "18:00" }] });
  }
  function removeTime(i, ti, key) {
    const list = tierList(key);
    patchTier(key, i, { times: list[i].times.filter((_, at) => at !== ti) });
  }
  function toggleDay(i, d, key) {
    const list = tierList(key);
    const r = list[i];
    const weekdays = r.weekdays.includes(d) ? r.weekdays.filter((w) => w !== d) : [...r.weekdays, d];
    patchTier(key, i, { weekdays });
  }
  function patchCooldown(i, patch) {
    updateRules({ ...ruleGroups, cooldown: ruleGroups.cooldown.map((r, at) => at === i ? { ...r, ...patch } : r) });
  }
  function addCooldown() {
    updateRules({ ...ruleGroups, cooldown: [...ruleGroups.cooldown, { provider: "", cooldown: 15 }] });
  }
  function removeCooldown(i) {
    updateRules({ ...ruleGroups, cooldown: ruleGroups.cooldown.filter((_, at) => at !== i) });
  }
  function parseCooldowns(raw, base) {
    if (!raw) return base;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      return base;
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return base;
    const cooldown = [];
    for (const [provider, minutes] of Object.entries(obj)) {
      if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) continue;
      cooldown.push({ provider, cooldown: minutes });
    }
    return { ...base, cooldown };
  }
  function parseDraftRules(s) {
    const merged = {};
    for (const key of RULES_PRIORITY_KEYS) {
      const raw2 = s.scheduler?.[key] ?? "";
      if (raw2.trim() === "") continue;
      try {
        merged[key] = JSON.parse(raw2);
      } catch {
      }
    }
    const raw = JSON.stringify(merged, null, 2);
    const res = parseRules(raw);
    const groups = parseCooldowns(s.scheduler?.["scheduler.cooldown_overrides"], res.ok ? res.groups : freshGroups());
    setRuleGroups(groups);
  }
  function rulesEditor() {
    const g = ruleGroups;
    const tierCards = [
      { badge: "P1", key: "free", rules: g.free },
      { badge: "P2", key: "expiry", rules: g.expiry },
      { badge: "P3", key: "consume", rules: g.consume },
      { badge: "P4", key: "degrade", rules: g.degrade },
      { badge: "\u7981\u7528", key: "disabled", rules: g.disabled }
    ];
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "asone-scheduler", children: [
      tierCards.map(
        ({ badge, key, rules }) => ruleCard(badge, rules, () => addTier(key), (r, i) => {
          const e = tierErr(r);
          return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "blocks-container", children: [
              /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
                ProviderBox,
                {
                  value: r.provider,
                  options: providerOptions,
                  onSelect: (v) => patchTier(key, i, { provider: v, model: "" }),
                  onDelete: () => removeTier(key, i)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
                ModelBox,
                {
                  optional: true,
                  value: r.model,
                  options: modelOptionsFor(r.provider),
                  onSelect: (v) => patchTier(key, i, { model: v })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ExpiryBox, { value: r.expires_at, onChange: (v) => patchTier(key, i, { expires_at: v }) }),
              /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(WeekdayBox, { idPrefix: `tier-${key}-${i}`, weekdays: r.weekdays, onToggle: (d) => toggleDay(i, d, key) }),
              /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(TimesBox, { times: r.times, onPatch: (next) => patchTier(key, i, { times: next }) })
            ] }),
            e ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "rule-err", children: e }) : null
          ] });
        })
      ),
      ruleCard("\u51B7\u5374", g.cooldown, addCooldown, (r, i) => {
        const e = cooldownErr(r);
        return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "blocks-container", children: [
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
              ProviderBox,
              {
                value: r.provider,
                options: providerOptions,
                onSelect: (v) => patchCooldown(i, { provider: v }),
                onDelete: () => removeCooldown(i)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(CooldownBox, { value: r.cooldown, onChange: (v) => patchCooldown(i, { cooldown: v }) })
          ] }),
          e ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "rule-err", children: e }) : null
        ] });
      }),
      pinSecondsSpec ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "ui-fields", children: field("scheduler", pinSecondsSpec) }) : null
    ] });
  }
  const chart = backoffChart(draft);
  const codesField = specOf("retry.codes");
  const pinSecondsSpec = specOf("scheduler.pin_seconds");
  const chartBlock = /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-chart-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("svg", { className: "ui-chart", viewBox: `0 0 ${chart.W} ${chart.H}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("line", { className: "ui-chart-yaxis", x1: chart.padL, y1: chart.padT, x2: chart.padL, y2: chart.y(0) }),
      chart.yTicks.map((t) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("g", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("line", { className: "ui-chart-grid", x1: chart.padL, y1: t.y, x2: chart.W - chart.padR, y2: t.y }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("text", { className: "ui-chart-label", x: chart.padL - 6, y: t.y, textAnchor: "end", dominantBaseline: "middle", children: chart.fmtAxis(t.v) })
      ] }, `y${t.v}`)),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("line", { className: "ui-chart-axis", x1: chart.padL, y1: chart.y(0), x2: chart.W - chart.padR, y2: chart.y(0) }),
      chart.seq.map((v, i) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        "rect",
        {
          className: "ui-chart-band",
          x: chart.x(i) - chart.bandW / 2,
          y: chart.y(v),
          width: chart.bandW,
          height: Math.max(0, chart.y(v * (1 - chart.jit)) - chart.y(v))
        },
        `band${i}`
      )),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("line", { className: "ui-chart-dash", x1: chart.dashX, y1: chart.padT, x2: chart.dashX, y2: chart.y(0) }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("polyline", { className: "ui-chart-line", points: chart.seq.map((v, i) => `${chart.x(i)},${chart.y(v)}`).join(" ") }),
      chart.seq.map((v, i) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("circle", { className: "ui-chart-dot", cx: chart.x(i), cy: chart.y(v), r: 4 }, `dot${i}`)),
      chart.seq.map((_v, i) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("text", { className: "ui-chart-tick", x: chart.x(i), y: chart.H - 8, textAnchor: "middle", children: i + 1 }, `tick${i}`))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-chart-text", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: chart.seqText }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: chart.budgetKText }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: chart.budgetMText }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { children: "\u6BCF\u6B21 \xD72 \u9012\u589E\u5E76\u5728\u300C\u6700\u5927\u9000\u907F\u300D\u5904\u5C01\u9876;\u6296\u52A8\u4F7F\u6BCF\u4E00\u6863\u5728 [80%, 100%] \xD7 \u786E\u5B9A\u503C \u5185\u968F\u673A\u3002" })
    ] })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-shell", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h1", { className: "ui-page-title", children: "\u8BBE\u7F6E" }),
    busy ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "hint", children: "\u52A0\u8F7D\u4E2D\u2026" }) : null,
    err ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "ui-err", children: err }) : null,
    data ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "ui-layout", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-content", children: [
      ["external_refresh", "scheduler", "retry", "ui"].map((section) => {
        const specs = specsOf(section);
        if (specs.length === 0) return null;
        const meta = SECTION_TITLES[section];
        let body;
        if (section === "scheduler") {
          body = rulesEditor();
        } else if (section === "retry") {
          body = /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-rule-groups", children: [
            retryGroups().map((grp) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-group", children: [
              /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "ui-group-head", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-group-title", children: grp.title }) }),
              /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "ui-fields", children: grp.fields.map((s) => field("retry", s)) })
            ] }, grp.title)),
            codesField ? field("retry", codesField, true) : null,
            chartBlock
          ] });
        } else {
          body = /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "ui-fields", children: specs.map((s) => field(section, s)) });
        }
        return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { id: section, className: "ui-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "ui-card-head", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "ui-card-title", children: meta.title }) }),
          body
        ] }, section);
      }),
      reqLog ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { id: "request-log", className: "ui-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "ui-card-head", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "ui-card-title", children: "\u8BF7\u6C42\u65E5\u5FD7" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-fields", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "ui-field-head", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-field-label", children: "\u8BB0\u5F55\u6863\u4F4D" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
              "select",
              {
                className: "ui-select",
                value: reqLog.content_mode,
                disabled: busy,
                onChange: (ev) => void saveReqLog(ev.target.value),
                children: reqLog.content_modes.map((m) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: m.value, children: m.label }, m.value))
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-field wide", children: [
            /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "ui-field-head", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-field-label", children: "\u843D\u76D8\u4F4D\u7F6E" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-key-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("code", { className: "ui-key", children: reqLog.path }),
              /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { className: "ui-badge", children: [
                "\u5DF2\u5199 ",
                reqLog.counters?.written ?? 0,
                " \u6761"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { className: "ui-badge", children: [
                reqLog.size_bytes,
                " \u5B57\u8282"
              ] })
            ] }),
            reqLog.last_error ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("p", { className: "ui-field-err", children: [
              "\u4E0A\u6B21\u8BB0\u5F55\u5931\u8D25:",
              reqLog.last_error
            ] }) : null
          ] })
        ] }),
        logMsg ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "ui-field-hint", children: logMsg }) : null
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { id: "readonly", className: "ui-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-card-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("h2", { className: "ui-card-title", children: "\u53EA\u8BFB\u4FE1\u606F" }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-card-sub", children: "\u73AF\u5883\u53D8\u91CF ONE_API_KEY \xB7 \u53EA\u8BFB" })
        ] }),
        data.master_key ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-key-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("code", { className: "ui-key", children: data.master_key }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { type: "button", className: "ui-btn-ghost", disabled: busy, onClick: () => void copyKey(), children: keyCopied ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236" })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-field-hint", children: "\u672A\u8BBE\u7F6E ONE_API_KEY:\u5F53\u524D\u65E0\u9274\u6743(\u6240\u6709\u8BF7\u6C42\u653E\u884C)" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-savebar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-savebar-count", children: totalChanged() > 0 ? /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_jsx_runtime16.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-savebar-dot" }),
          totalChanged(),
          " \u9879\u672A\u4FDD\u5B58"
        ] }) : "\u6CA1\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" }),
        msg4 ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "ui-savebar-msg", children: msg4 }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-savebar-btns", children: [
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { type: "button", className: "ui-btn-ghost", disabled: busy, onClick: discard, children: "\u653E\u5F03\u6539\u52A8" }),
          /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
            "button",
            {
              type: "button",
              className: "ui-btn-primary",
              disabled: busy || totalChanged() === 0,
              onClick: () => void save(),
              children: "\u4FDD\u5B58\u8BBE\u7F6E"
            }
          )
        ] })
      ] })
    ] }) }) : null
  ] });
}

// ../panel-ui/src/App.tsx
var import_jsx_runtime17 = require("react/jsx-runtime");
var NAV_ITEMS = [
  { key: "overview", label: "\u603B\u89C8" },
  { key: "models", label: "\u6A21\u578B" },
  { key: "usage", label: "\u7528\u91CF\u7EDF\u8BA1" },
  { key: "settings", label: "\u8BBE\u7F6E" }
];
function App() {
  const [page, setPage] = import_react14.default.useState("overview");
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "app", children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("header", { className: "topbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "brand", children: "As One \xB7 \u5408\u4E00" }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(NavTabs, { tabs: NAV_ITEMS, active: page, onChange: (k) => setPage(k) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("main", { className: "content", children: [
      page === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(OverviewPage, {}) : null,
      page === "models" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(ModelsPage_default, {}) : null,
      page === "usage" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(UsageStatsPage, {}) : null,
      page === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(SettingsPage, {}) : null
    ] })
  ] });
}

// src/client/api.ts
var AS_ONE_PROVIDER_ID = "as-one";
var AsOneApiError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "AsOneApiError";
    this.code = code;
  }
};
async function post(method, args) {
  let res;
  try {
    res = await fetch(`as-one/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args })
    });
  } catch {
    throw new AsOneApiError("network", "\u8BF7\u6C42\u5931\u8D25(\u7F51\u7EDC\u9519\u8BEF)");
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new AsOneApiError("bad-response", `\u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON(HTTP ${res.status})`);
  }
  const wire = json;
  if (wire !== null && typeof wire === "object" && "ok" in wire) {
    if (wire.ok) return wire.value;
    const failure = wire;
    throw new AsOneApiError(
      failure.error?.code ?? "error",
      failure.error?.message ?? "As One API \u9519\u8BEF"
    );
  }
  return json;
}
function bindPanelBridge() {
  setPanelInvoker((method, ...args) => post(method, args));
}
function fetchSessionCurrentRoute(sessionId, model) {
  return post("getSessionCurrentRoute", [sessionId, model]);
}

// ../panel-ui/src/styles.css
var styles_default = '/*\r\n * As One \u7EE0\uFF04\u608A\u95C8\u3221\u6F98\u934F\u3125\u772C\u93CD\u5CF0\u7D21(plain CSS,\u93C3\u72B3\uE50B\u93CB?\u9286? *\r\n * 2026-11-02 \u7039\u6C2D\uE50D:\u95B0\u5D88\u58CA**\u9471\u65BF\u59E9 DSH \u6D93\u5A5A\uE57D** \u9225\u65BA\u20AC?\u95C8\u3221\u6F98\u934F\u3129\u5134\u68F0\u6EC6\u58CA\u74A7\u677F\uE196\u6D93\u8BB3\u5BCC\u68F0\u6A39\u62A4\u9417? * (`--dsw-alias-*`),`dsh-ui-appearance` \u95AB\u6C33\u7E43 `ctx.theme.overrideTokens()` \u7455\u55D9\u6D0A\u9428? * \u59DD\uFF46\u69F8\u6769\u6B10\u58D2\u6D60\u3087\u589D(\u9473\u5C7E\u6AD9/\u95C8\u3221\u6F98/\u93C2\u56E7\u74E7/\u6D93\u660F\u58CA/\u6748\u89C4\uE50B/\u5A4A\u6C2C\u59E9\u93C9?\u5A23\u8FA8\u796C\u9359\u5C7E\u0101\u9477\uE044\u59E9\u9352\u56E8\u5D32)\u9286\u5099\u62A4\u9417\u5C80\u5DF1\u752F? * (\u9419\uE102\u73DB Electron \u95C8\u3221\u6F98\u7EDB\u590B\u68E4 DSW \u6D93\u5A5A\uE57D\u9428\u52ED\u5E46\u6FA7?\u93C3\u8DFA\u6D16\u95AB\u20AC\u9358?Nexus \u93C6\u6944\u58CA\u7EEF?\u7459\u509B\u5285\u6D93\u5D85\u5F49\u9286? */\r\n\r\n.asone-panel * {\r\n  box-sizing: border-box;\r\n}\r\n\r\n.asone-panel {\r\n  --bg: var(--dsw-alias-bg-base, #101722);\r\n  --bg-card: var(--dsw-alias-bg-layer-1, #141b26);\r\n  --border: var(--dsw-alias-border-l2, #2c3a4d);\r\n  --text: var(--dsw-alias-label-primary, #e8eef5);\r\n  --text-soft: var(--dsw-alias-label-secondary, #cfe3f5);\r\n  --dim: var(--dsw-alias-label-tertiary, #8b94a3);\r\n  --ok: var(--dsw-alias-state-success-primary, #5fbf7d);\r\n  --bad: var(--dsw-alias-state-error-primary, #e0685f);\r\n  --warn: var(--dsw-alias-state-warn-primary, #d9a441);\r\n  --accent: var(--dsw-alias-brand-primary, #4d6bfe);\r\n  /* \u6DF1\u4E00\u5C42\u7684\u9762(\u8F93\u5165\u6846 / \u5C0F\u82AF\u7247 / \u6DF1\u8272\u76D2\u5B50):\u4E3B\u9898\u6709 layer-2 \u5C31\u7528,\u5426\u5219\u56DE\u9000\u539F\u8272 */\r\n  --bg-deep: var(--dsw-alias-bg-layer-2, #10141a);\r\n  --chip-bg: var(--dsw-alias-bg-layer-2, #232a33);\r\n  --mono: "JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace;\r\n}\r\n\r\n.asone-panel,\r\n.asone-panel,\r\n.asone-panel {\r\n  margin: 0;\r\n  padding: 0;\r\n  height: 100%;\r\n}\r\n\r\n.asone-panel {\r\n  background: var(--bg);\r\n  color: var(--text-soft);\r\n  font-family: system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;\r\n  font-size: 13px;\r\n  line-height: 1.55;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u5A4A\u6C2C\u59E9\u93C9?\u934F\u3125\u772C\u7F01\u71B6\u7AF4,\u6D93\u5D87\u6564\u7EEF\u8364\u7CBA\u9477\uE044\u752B\u5A34\u5470\u58CA\u5A4A\u6C2C\u59E9\u93C9?\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\r\n * \u6924\u7538\u6F70\u6D93\u20AC\u5BF0\u5B2C\u6564\u6769\u6B11\u5897\u5A23\u8FAB\u58CA\u7F01\u55D8\u7CB4\u9354\u3126\u6F6F(WebKit \u9350\u546E\u7273),\u6D93\u5EA2\u6BAB\u9479\u67E5\u6F70\u93C9\u5938\u7E5A\u93B8\u4F77\u7AF4\u9477?\r\n * Firefox \u9422\u3126\u7223\u9351?scrollbar-color \u934F\u6EC3\u7C33\u9286?*/\r\n.asone-panel * {\r\n  scrollbar-width: thin;\r\n  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e) transparent;\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar {\r\n  width: 8px;\r\n  height: 8px;\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar-track {\r\n  background: transparent;\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar-thumb {\r\n  background: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e);\r\n  border-radius: 4px;\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar-thumb:hover {\r\n  background: var(--dsw-alias-scrollbar-hover-l2, #4a5d74);\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar-corner {\r\n  background: transparent;\r\n}\r\n\r\n.asone-panel .app {\r\n  display: flex;\r\n  flex-direction: column;\r\n  min-height: 100%;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u6924\u8235\u722E\u6D93\u5EA1\uE1F1\u9478?\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .topbar {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 24px;\r\n  padding: 0 20px;\r\n  height: 48px;\r\n  background: var(--bg-card);\r\n  border-bottom: 1px solid var(--border);\r\n  position: sticky;\r\n  top: 0;\r\n  z-index: 10;\r\n}\r\n\r\n.asone-panel .brand {\r\n  font-size: 15px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n  letter-spacing: 0.02em;\r\n}\r\n\r\n.asone-panel .tabs {\r\n  display: flex;\r\n  gap: 4px;\r\n}\r\n\r\n.asone-panel .tab {\r\n  appearance: none;\r\n  background: transparent;\r\n  border: none;\r\n  color: var(--dim);\r\n  font: inherit;\r\n  padding: 6px 14px;\r\n  border-radius: 6px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .tab:hover {\r\n  color: var(--text);\r\n  background: rgba(77, 107, 254, 0.08);\r\n}\r\n\r\n.asone-panel .tab.on {\r\n  color: var(--text);\r\n  background: rgba(77, 107, 254, 0.18);\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u6924\u7538\u6F70\u6960\u3126\u7066 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .content {\r\n  flex: 1;\r\n  width: 100%;\r\n  /* \u923F\u72C5\u7B0D 2026-10-23:1180px \u922B?1400px\u9286\u4FFFensenova \u6924\u4F43\uE6E6 3 \u5BEE?420px \u7490\uFE40\u5F7F\u9357\u2033\u6093\u741B?     (3\u8133420 + 2\u813316 = 1292px \u9350\u546D\uE190 + padding 40px = 1332px),1180px \u93C0\u53E5\u7B09\u6D93?\r\n     \u9359\uE047\u5158\u6D93\u3085\u5D31\u6D93\u20AC\u741B?1400px \u7035\u5C7C\u7D91,\u6D93\u65C2\u7365\u9359\uFF49\u7CAF\u7481\u3085\uE194\u95C5\u5FCE\u7BA3\u93BB\u612C\u57CC 1440px(index.ts)\u9286?     \u923F\u72C5\u7B0D 2026-10-25(m14379):1400px \u922B?1680px\u9286?920px \u7ED0\u6940\u5F5B\u6D93\u5B2D\uE6E6\u7481\u2544\uE195\u7F03\uE1C0\u3009\r\n     \u9286\u5C83\u769F\u6434\uFE41\uE749\u9352\u6B0D\u20AC\u5D86\u7621\u5BEE\u72B2\u5D31\u95B2\u5C80\u6B91 5 \u6D93?box(provider/model/\u9352\u7248\u6E61/\u93C4\u71B8\u6E61/\u93C3\u5815\u68FF\u5A08?\u93BA\u6393\u579A\r\n     \u6D93\u20AC\u741B?box \u93C8\u20AC\u704F\u5FD3\uE194 160+280+180+300+280 = 1200px + 4\u813320 gap = 1280px,\r\n     \u9354?blocks-container padding 40px = 1320px,\u9354\u72B1\u88B1\u6E1A?padding 40px \u922E?1400px\r\n     (2026-10-25 m14922 \u7EC9\u5A5A\u6ACE\u7481\u5267\u7586\u6924\u975B\u4E4F\u6E1A?ui-nav,\u6D93\u5D85\u5540\u9357?168px+24px) \u922B?1680px \u7035\u5C7C\u7D91\u9286?     1920 \u7ED0\u6940\u5F5B\u6D93\u5B2A\u7733\u6D93?\u5BB8\uFE40\u5F78\u935A\u52ED\u6680 120px\u9286?*/\r\n  max-width: 1680px;\r\n  margin: 0 auto;\r\n  padding: 16px 20px 40px;\r\n}\r\n\r\n.asone-panel .page {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n\r\n.asone-panel .page-note,\r\n.asone-panel .hint {\r\n  margin: 0;\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .notice {\r\n  padding: 8px 12px;\r\n  border: 1px solid var(--ok);\r\n  border-radius: 6px;\r\n  color: var(--ok);\r\n  background: rgba(95, 191, 125, 0.08);\r\n}\r\n\r\n.asone-panel .empty {\r\n  padding: 28px 16px;\r\n  text-align: center;\r\n  color: var(--dim);\r\n}\r\n\r\n.asone-panel .loading {\r\n  animation: pulse 1.2s ease-in-out infinite;\r\n}\r\n\r\n@keyframes pulse {\r\n  50% {\r\n    opacity: 0.55;\r\n  }\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u9357\uFF04\u5896 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .card {\r\n  background: var(--bg-card);\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  padding: 14px 16px;\r\n}\r\n\r\n.asone-panel .card-head {\r\n  display: flex;\r\n  align-items: baseline;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  margin-bottom: 10px;\r\n}\r\n\r\n.asone-panel .card-head h2 {\r\n  margin: 0;\r\n  font-size: 14px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .card-extra {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .card-badges {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u741B\u3126\u7278 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .tbl {\r\n  width: 100%;\r\n  border-collapse: collapse;\r\n  font-size: 12.5px;\r\n}\r\n\r\n.asone-panel .tbl th,\r\n.asone-panel .tbl td {\r\n  padding: 6px 10px;\r\n  text-align: left;\r\n  border-bottom: 1px solid var(--border);\r\n  vertical-align: top;\r\n}\r\n\r\n.asone-panel .tbl th {\r\n  color: var(--dim);\r\n  font-weight: 500;\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .tbl tbody tr:hover {\r\n  background: rgba(77, 107, 254, 0.06);\r\n}\r\n\r\n.asone-panel .tbl .num {\r\n  text-align: right;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n\r\n.asone-panel .tbl .bar-col {\r\n  min-width: 140px;\r\n}\r\n\r\n.asone-panel .row-dim td {\r\n  opacity: 0.55;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u93C2\u56E8\u6E70\u5BB8\u30E5\u53FF \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .mono {\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .dim-text {\r\n  color: var(--dim);\r\n}\r\n\r\n.asone-panel .err-cell {\r\n  max-width: 280px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  color: var(--bad);\r\n}\r\n\r\n.asone-panel .code-block {\r\n  display: block;\r\n  font-family: var(--mono);\r\n  font-size: 11.5px;\r\n  white-space: pre-wrap;\r\n  word-break: break-all;\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 8px 10px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u5BF0\u754C\u73F7\u6D93\u5EA1\u569F\u93B9\uE1BE\u5063 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .badge {\r\n  display: inline-block;\r\n  padding: 1px 8px;\r\n  border-radius: 999px;\r\n  font-size: 11.5px;\r\n  border: 1px solid transparent;\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .badge-ok {\r\n  color: var(--ok);\r\n  border-color: rgba(95, 191, 125, 0.45);\r\n  background: rgba(95, 191, 125, 0.1);\r\n}\r\n\r\n.asone-panel .badge-bad {\r\n  color: var(--bad);\r\n  border-color: rgba(224, 104, 95, 0.45);\r\n  background: rgba(224, 104, 95, 0.1);\r\n}\r\n\r\n.asone-panel .badge-warn {\r\n  color: var(--warn);\r\n  border-color: rgba(217, 164, 65, 0.45);\r\n  background: rgba(217, 164, 65, 0.1);\r\n}\r\n\r\n.asone-panel .badge-dim {\r\n  color: var(--dim);\r\n  border-color: var(--border);\r\n  background: transparent;\r\n}\r\n\r\n.asone-panel .cred-dot {\r\n  display: inline-block;\r\n  width: 8px;\r\n  height: 8px;\r\n  border-radius: 50%;\r\n  flex: none;\r\n}\r\n\r\n.asone-panel .cred-dot.ok {\r\n  background: var(--ok);\r\n}\r\n\r\n.asone-panel .cred-dot.bad {\r\n  background: var(--bad);\r\n}\r\n\r\n.asone-panel .cred-cell {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC KPI \u6D93\u5EA3\u59F8\u93AC\u4F7D\uE511 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .status-line {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 16px;\r\n  flex-wrap: wrap;\r\n  padding: 10px 14px;\r\n  background: var(--bg-card);\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n}\r\n\r\n.asone-panel .kpi-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));\r\n  gap: 12px;\r\n}\r\n\r\n.asone-panel .kpi {\r\n  background: var(--bg-card);\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  padding: 12px 14px;\r\n}\r\n\r\n.asone-panel .kpi-label {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .kpi-value {\r\n  font-size: 22px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n  font-variant-numeric: tabular-nums;\r\n  margin: 2px 0;\r\n}\r\n\r\n.asone-panel .kpi-sub {\r\n  color: var(--dim);\r\n  font-size: 11.5px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u93C9\u2033\u8230 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .bar {\r\n  width: 100%;\r\n  min-width: 90px;\r\n  height: 8px;\r\n  border-radius: 4px;\r\n  background: rgba(44, 58, 77, 0.6);\r\n  overflow: hidden;\r\n}\r\n\r\n.asone-panel .bar-fill {\r\n  height: 100%;\r\n  border-radius: 4px;\r\n}\r\n\r\n.asone-panel .bar-blue {\r\n  background: var(--accent);\r\n}\r\n\r\n.asone-panel .bar-green {\r\n  background: var(--ok);\r\n}\r\n\r\n.asone-panel .bar-orange {\r\n  background: var(--warn);\r\n}\r\n\r\n.asone-panel .bar-na {\r\n  color: var(--dim);\r\n}\r\n\r\n.asone-panel .bar-legend {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 10px 18px;\r\n  margin-top: 12px;\r\n}\r\n\r\n.asone-panel .legend-item {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .legend-item .bar {\r\n  width: 90px;\r\n}\r\n\r\n.asone-panel .legend-name {\r\n  min-width: 72px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u95BF\uE1BC\u20AC\u80A9\u7D89\u93CD?\u5A13\u72BB\u4EBE\u9357?\u7481\u5267\u7586) \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .kv-grid {\r\n  display: grid;\r\n  grid-template-columns: 140px 1fr;\r\n  gap: 6px 14px;\r\n  margin-bottom: 10px;\r\n}\r\n\r\n.asone-panel .kv-grid .k {\r\n  color: var(--dim);\r\n}\r\n\r\n.asone-panel .kv-grid .v {\r\n  color: var(--text-soft);\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u93B8\u5910\u6333 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .btn {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: var(--text-soft);\r\n  background: rgba(77, 107, 254, 0.14);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 5px 14px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .btn:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .btn:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n.asone-panel .btn-sm {\r\n  padding: 2px 10px;\r\n  font-size: 12px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u6924\u7538\u6F70\u93CD\u56EC\uE57D\u6D93\u5EA1\u5D30\u6D63\u5D85\uFF13 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .page-title {\r\n  margin: 0 0 6px;\r\n  font-size: 18px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .page-page-shell {\r\n  padding: 28px 16px;\r\n  text-align: center;\r\n  color: var(--dim);\r\n  border: 1px dashed var(--border);\r\n  border-radius: 8px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u701B\u612D\u7223\u68F0\u6A3B\u6F6F(\u59AF\u2033\u7037\u68F0\u6226\u4EBE\u6FB9?\u7035\u5F52\u7D88 Nexus .subtabs) \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .subtabs {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  align-items: center;\r\n  gap: 4px;\r\n  min-height: 24px;\r\n  margin: 0 0 14px;\r\n  padding-bottom: 8px;\r\n  border-bottom: 1px solid var(--border);\r\n}\r\n\r\n.asone-panel .subtab {\r\n  appearance: none;\r\n  background: none;\r\n  border: none;\r\n  font: inherit;\r\n  color: var(--dim);\r\n  padding: 0 10px;\r\n  line-height: 24px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .subtab:hover {\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .subtab.on {\r\n  color: var(--text);\r\n  background: rgba(77, 107, 254, 0.14);\r\n  border-radius: 6px;\r\n}\r\n\r\n.asone-panel .subtabs-action {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  margin-left: auto;\r\n}\r\n\r\n.asone-panel .act-note {\r\n  color: var(--dim);\r\n  font-size: 11px;\r\n  max-width: 420px;\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n.asone-panel .act-note.busy {\r\n  color: var(--accent);\r\n}\r\n\r\n.asone-panel .act-btn {\r\n  appearance: none;\r\n  font: inherit;\r\n  background: #1d3550;\r\n  border: 1px solid #3d5a73;\r\n  color: var(--text-soft);\r\n  height: 24px;\r\n  box-sizing: border-box;\r\n  border-radius: 5px;\r\n  padding: 0 12px;\r\n  font-size: 12px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .act-btn:hover:not(:disabled) {\r\n  background: #24425f;\r\n}\r\n\r\n.asone-panel .act-btn:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u59AF\u2033\u7037\u741B?ModelTable) \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .models-block {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n}\r\n\r\n.asone-panel .models-toolbar {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  flex-wrap: wrap;\r\n}\r\n\r\n.asone-panel .models-toolbar-left,\r\n.asone-panel .models-toolbar-right {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .models-table {\r\n  width: 100%;\r\n  border-collapse: collapse;\r\n  font-size: 12.5px;\r\n}\r\n\r\n.asone-panel .models-table th,\r\n.asone-panel .models-table td {\r\n  padding: 6px 8px;\r\n  text-align: left;\r\n  border-bottom: 1px solid var(--border);\r\n  vertical-align: middle;\r\n}\r\n\r\n.asone-panel .models-table th {\r\n  color: var(--dim);\r\n  font-weight: 500;\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .models-table .models-col-enable {\r\n  width: 44px;\r\n}\r\n\r\n.asone-panel .models-table td.rate-cell {\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .models-table tr.on td {\r\n  background: rgba(77, 107, 254, 0.08);\r\n}\r\n\r\n.asone-panel .models-table tr.off td {\r\n  opacity: 0.55;\r\n}\r\n\r\n.asone-panel .models-table tr.nocall td {\r\n  opacity: 0.75;\r\n}\r\n\r\n.asone-panel .models-table .input {\r\n  width: 100%;\r\n  min-width: 60px;\r\n  height: 26px;\r\n  padding: 0 8px;\r\n}\r\n\r\n.asone-panel .models-table .input.num {\r\n  width: 90px;\r\n}\r\n\r\n.asone-panel .models-table input:disabled {\r\n  opacity: 0.45;\r\n}\r\n\r\n.asone-panel .vision-cell {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n\r\n.asone-panel .dot {\r\n  color: var(--ok);\r\n  font-size: 9px;\r\n  line-height: 1;\r\n}\r\n\r\n.asone-panel .tag-warn {\r\n  margin-left: 6px;\r\n  padding: 0 5px;\r\n  border: 1px solid var(--warn);\r\n  border-radius: 3px;\r\n  color: var(--warn);\r\n  font-size: 11px;\r\n  white-space: nowrap;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u95AB\u660F\u7DEB\u59AF\u2033\u7037\u7F02\u682C\u7DEB\u9363?LogicalModelEditor) \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .editor {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n\r\n.asone-panel .fieldRow {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n}\r\n\r\n.asone-panel .fieldLabel {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .fieldValue {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n}\r\n\r\n.asone-panel .fieldNote {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .fieldWarn {\r\n  color: var(--warn);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .fieldWarn b {\r\n  color: var(--text-soft);\r\n  font-weight: 500;\r\n}\r\n\r\n.asone-panel .input {\r\n  box-sizing: border-box;\r\n  height: 32px;\r\n  padding: 0 10px;\r\n  font: inherit;\r\n  font-size: 13px;\r\n  color: var(--text-soft);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n}\r\n\r\n.asone-panel .input:focus {\r\n  outline: none;\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .input.inputBad {\r\n  border-color: var(--bad);\r\n}\r\n\r\n.asone-panel .selectInput {\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .nodeList {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n\r\n.asone-panel .nodeRow {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n\r\n.asone-panel .groupIdx {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 16px;\r\n  height: 16px;\r\n  border-radius: 50%;\r\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  color: var(--text);\r\n  font-size: 11px;\r\n  flex-shrink: 0;\r\n}\r\n\r\n.asone-panel .nodeProvider {\r\n  width: 150px;\r\n  flex: 0 0 150px;\r\n}\r\n\r\n.asone-panel .nodeSelect {\r\n  flex: 1 1 0;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .addModelButton {\r\n  appearance: none;\r\n  font: inherit;\r\n  background: none;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  height: 28px;\r\n  padding: 0 10px;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  cursor: pointer;\r\n  align-self: flex-start;\r\n}\r\n\r\n.asone-panel .addModelButton:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .addModelButton:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n.asone-panel .iconButton {\r\n  appearance: none;\r\n  background: none;\r\n  border: none;\r\n  font: inherit;\r\n  color: var(--dim);\r\n  padding: 2px 6px;\r\n  border-radius: 4px;\r\n  cursor: pointer;\r\n  flex-shrink: 0;\r\n}\r\n\r\n.asone-panel .iconButton:hover:not(:disabled) {\r\n  color: var(--text);\r\n  background: rgba(77, 107, 254, 0.1);\r\n}\r\n\r\n.asone-panel .iconButtonDanger:hover:not(:disabled) {\r\n  color: var(--bad);\r\n}\r\n\r\n.asone-panel .iconButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: not-allowed;\r\n}\r\n\r\n.asone-panel .editorActions {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .primaryButton,\r\n.asone-panel .secondaryButton {\r\n  appearance: none;\r\n  font: inherit;\r\n  height: 36px;\r\n  padding: 0 16px;\r\n  border-radius: 6px;\r\n  font-size: 13px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .primaryButton {\r\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  border: 1px solid var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  color: var(--text-soft);\r\n}\r\n\r\n.asone-panel .primaryButton:hover:not(:disabled) {\r\n  background: #3a5d80;\r\n}\r\n\r\n.asone-panel .secondaryButton {\r\n  background: none;\r\n  border: 1px solid var(--border);\r\n  color: var(--text-soft);\r\n}\r\n\r\n.asone-panel .secondaryButton:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .primaryButton:disabled,\r\n.asone-panel .secondaryButton:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u6E1A\u6D98\u7C32\u935F\u55DA\u5904\u93B4\u75AF\u3003(ProviderAccounts) \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .provider-accounts {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n}\r\n\r\n.asone-panel .block-title {\r\n  margin: 0;\r\n  font-size: 14px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .provider-accounts-actions {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u7039\u3221\u57DB\u7ED4\uE21D\u77FE\u5BF0?ClientPaths) \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .client-paths {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .cp-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .cp-row b {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  flex-shrink: 0;\r\n}\r\n\r\n.asone-panel .cp-input {\r\n  flex: 1;\r\n  min-width: 200px;\r\n}\r\n\r\n.asone-panel .cp-state {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  white-space: nowrap;\r\n  flex-shrink: 0;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u93C2\u56E8\u6E70\u942B\u20AC\u9479\u63D2\u4F10\u934F?\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .ok {\r\n  color: var(--ok);\r\n}\r\n\r\n.asone-panel .bad {\r\n  color: var(--bad);\r\n}\r\n\r\n.asone-panel .na {\r\n  color: var(--dim);\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u95BF\u6B12\uE1E4\u93C9?\u9422\u3129\u567A\u6924\u7535\u6564,\u7035\u5F52\u7D88 Nexus \u934F\u3125\u772C .err)\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .err {\r\n  color: #e0685f;\r\n  font-size: 12px;\r\n  padding: 8px;\r\n  border: 1px solid #4a2224;\r\n  background: #241417;\r\n  border-radius: 4px;\r\n  margin: 10px 0;\r\n}\r\n\r\n/* ===========================================================================\r\n   \u93AC\u660F\uE74D\u6924?OverviewPage,1:1 \u7EC9\u7ED8\uE632 Nexus Overview.vue \u9428?scoped \u93CD\u5CF0\u7D21,\r\n   \u7EEB\u8BF2\u6095\u7F01\u71B6\u7AF4 ov- \u9353\u5D87\u7D11\u95C3\u832C\uE76B\u93BE?\u95B0\u5D88\u58CA\u6D93?Nexus \u9358\u71BA\u5897\u6D93\u20AC\u9477?\r\n   =========================================================================== */\r\n\r\n.asone-panel .ov-err {\r\n  color: #e0685f;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u6769\u612F\uE511\u6D93?\u9366\u3129\u20AC\u65C0\u69D1\u7F01?\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n.asone-panel .ov-inflight {\r\n  border: 1px solid #2c3a4d;\r\n  border-radius: 8px;\r\n  padding: 10px 12px;\r\n  background: #141b26;\r\n  margin-top: 12px;\r\n}\r\n.asone-panel .ov-inflightHead {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n  margin-bottom: 6px;\r\n}\r\n.asone-panel .ov-inflightHead h2 {\r\n  margin: 0;\r\n  font-size: 13px;\r\n  font-weight: 600;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .ov-inflightHead .count {\r\n  font-size: 12px;\r\n  color: var(--dim);\r\n}\r\n.asone-panel .ov-inflightGrid {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px;\r\n}\r\n.asone-panel .ov-inflightCard {\r\n  border: 1px solid #2c3a4d;\r\n  border-radius: 6px;\r\n  padding: 6px 8px;\r\n  background: var(--bg);\r\n  min-width: 180px;\r\n}\r\n.asone-panel .ov-inflightCardHead {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: baseline;\r\n  font-size: 12px;\r\n}\r\n.asone-panel .ov-inflightLm {\r\n  color: var(--text);\r\n  font-weight: 600;\r\n  word-break: break-all;\r\n}\r\n.asone-panel .ov-inflightMap {\r\n  margin: 4px 0 0;\r\n  padding: 0;\r\n  list-style: none;\r\n  font-size: 11px;\r\n  color: var(--dim);\r\n}\r\n.asone-panel .ov-inflightMap li {\r\n  display: flex;\r\n  align-items: baseline;\r\n  justify-content: space-between;\r\n  gap: 10px;\r\n}\r\n.asone-panel .ov-inflightRmN {\r\n  color: #6f7b8c;\r\n  font-variant-numeric: tabular-nums;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-inflightLeases {\r\n  margin-top: 4px;\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 4px;\r\n}\r\n.asone-panel .ov-lease {\r\n  font-size: 10px;\r\n  color: #5fbf7d;\r\n  background: #182435;\r\n  border-radius: 4px;\r\n  padding: 1px 5px;\r\n}\r\n/* \u9429\u78CB\u7E5B\u9357?\u95AB\u660F\u7DEB\u59AF\u2033\u7037\u6D93\u8679\u2516 = \u7039\u3221\u57DB\u7ED4\uE21C\u6D3F\u6769\u70B5\u6E61\u7039\u70B4\u0101\u9368?\u94CF\u6C31\u568E\u6748\u89C4\uE50B + \u9423\u30E4\u7B09\u935A\u5C7D\u7C33\u9479?\u9286?*/\r\n.asone-panel .ov-inflightDirect {\r\n  border-style: dashed;\r\n  border-color: #5b6a52;\r\n  background: #141b17;\r\n}\r\n.asone-panel .ov-inflightDirect .ov-inflightLm {\r\n  color: #9fd39b;\r\n}\r\n.asone-panel .ov-inflightDirect .ov-lease {\r\n  color: #9fd39b;\r\n  background: #1a2a1e;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u7039\u70B4\u6902\u93C3\u30E5\u7E54 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n.asone-panel .ov-recentBlock {\r\n  margin-top: 12px;\r\n  border-top: 1px solid #2c3a4d;\r\n  padding-top: 8px;\r\n}\r\n.asone-panel .ov-recentBlock .ov-inflightHead {\r\n  margin-bottom: 6px;\r\n}\r\n.asone-panel .ov-recentLimit {\r\n  display: inline-flex;\r\n  align-items: baseline;\r\n  gap: 4px;\r\n  font-size: 12px;\r\n  color: var(--dim);\r\n}\r\n.asone-panel .ov-recentLimit input {\r\n  width: 4.5em;\r\n  font-size: 12px;\r\n  color: var(--text-soft);\r\n  background: var(--bg);\r\n  border: 1px solid #2c3a4d;\r\n  border-radius: 4px;\r\n  padding: 1px 4px;\r\n}\r\n.asone-panel .ov-recentLimit input:disabled {\r\n  opacity: 0.5;\r\n}\r\n.asone-panel .ov-recentLimitErr {\r\n  font-size: 11px;\r\n  color: #e0685f;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u93B8\u590A\uE1EE\u7487\u6FC8\u6B91\u9357\uFF04\u5896\u9352\u6944\u3003 \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n.asone-panel .ov-recentConvList {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n.asone-panel .ov-recentConv {\r\n  border: 1px solid #2c3a4d;\r\n  border-radius: 6px;\r\n  background: var(--bg);\r\n  overflow: hidden;\r\n}\r\n/* \u9357\u2033\u3054 / \u93C4\u5EA3\u7C8F\u741B\u5C7D\u53E1\u9422\u3125\u6093\u6D93\u20AC\u6FC2\u6940\u6D50\u7039\u6C2C\u74E7\u7ED7\uFE40\uE194\u9352?grid \u9352\u6940\u5F78\u6748\u572D\u7D2D\u95AB\u612C\u57AA\u7035\u5F52\u7D88)\u9286?*/\r\n.asone-panel .ov-recentConvHead,\r\n.asone-panel .ov-recentConvRow {\r\n  display: grid;\r\n  grid-template-columns:\r\n    minmax(6ch, 10ch) /* \u6434\u5FD3\u5F7F:#\u7035\u7845\u763D#\u7487\u950B\u7730(\u9357\u2033\u3054\u93C4?\u923B?#\u7035\u7845\u763D) */\r\n    minmax(6ch, 18ch) /* \u95AB\u660F\u7DEB\u59AF\u2033\u7037 */\r\n    minmax(8ch, 24ch) /* \u942A\u71B7\u7584\u59AF\u2033\u7037 */\r\n    minmax(22ch, 1fr) /* \u7F01\u64B4\u7049\u5BF0\u754C\u73F7 + \u95BF\u6B12\uE1E4\u93C2\u56E8\uE50D \u9225\u65BA\u20AC?\u935E\uE219\u7AF4\u935A\u51A8\u58BF\u6D63\u6B0F\uE194\u6434\uFE3E\u6B91\u6D93\u20AC\u9352?*/\r\n    12ch /* \u5BE4\u60F0\u7E5C */\r\n    15ch /* TTFT(\u9357\u2033\u3054\u752F\uFE3A\u20AC\u5B74TFT \u9286\u5D85\u58A0\u7F02\u20AC,\u93C1\u546E\u762E\u5BE4\u60F0\u7E5C\u9352\u6940\uE194 3ch) */\r\n    11ch /* TPS:118.4 tok/s */\r\n    20ch /* token \u6D93\u590B\u7278:993K / 22.1K / 860K */\r\n    9ch; /* \u7F01\u64B4\u6F6B:165.7s \u9353?*/\r\n  column-gap: 8px;\r\n  align-items: baseline;\r\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\r\n  font-size: 11px;\r\n}\r\n.asone-panel .ov-recentConvHead {\r\n  padding: 4px 8px;\r\n  cursor: pointer;\r\n  user-select: none;\r\n}\r\n.asone-panel .ov-recentConvHead:hover,\r\n.asone-panel .ov-recentConv.open .ov-recentConvHead {\r\n  background: #182436;\r\n}\r\n.asone-panel .ov-recentConvHeadId {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 4px;\r\n  min-width: 0;\r\n}\r\n.asone-panel .ov-recentConvCaret {\r\n  width: 10px;\r\n  flex: 0 0 10px;\r\n  color: #5fbf7d;\r\n}\r\n.asone-panel .ov-recentConvTitle {\r\n  flex: 0 1 auto;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  color: var(--text);\r\n  font-weight: 600;\r\n}\r\n.asone-panel .ov-recentConvTitle.direct {\r\n  color: #9fd39b;\r\n}\r\n.asone-panel .ov-recentConvRow {\r\n  padding: 2px 8px;\r\n  color: var(--text-soft);\r\n  background: #0d131d;\r\n}\r\n.asone-panel .ov-recentConvRow:hover {\r\n  background: var(--bg);\r\n}\r\n.asone-panel .ov-recentConvRow.fail {\r\n  color: #e0a9a3;\r\n  box-shadow: inset 2px 0 0 #e0685f;\r\n}\r\n.asone-panel .ov-recentConvSeq {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  color: #6f7b8c;\r\n}\r\n.asone-panel .ov-recentConvLm {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-recentConvLm.direct {\r\n  color: #9fd39b;\r\n}\r\n.asone-panel .ov-recentConvRm {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-recentConvRes {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 6px;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-recentConvN {\r\n  color: var(--dim);\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-recentConvRes .ov-errText {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n.asone-panel .ov-mono {\r\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\r\n  font-size: 10.5px;\r\n  word-break: break-all;\r\n}\r\n.asone-panel .ov-dim {\r\n  color: var(--dim);\r\n}\r\n.asone-panel .ov-num {\r\n  font-variant-numeric: tabular-nums;\r\n  text-align: right;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-badge {\r\n  border-radius: 4px;\r\n  padding: 0 4px;\r\n  font-size: 10px;\r\n}\r\n.asone-panel .ov-badge.ok {\r\n  color: #5fbf7d;\r\n  background: #182435;\r\n}\r\n.asone-panel .ov-badge.bad {\r\n  color: #e0685f;\r\n  background: #2b1a1c;\r\n}\r\n.asone-panel .ov-errText {\r\n  color: var(--dim);\r\n  font-size: 10px;\r\n  margin-left: 4px;\r\n}\r\n\r\n/* ===========================================================================\r\n   \u9422\u3129\u567A\u7F01\u71BB\uE178\u6924?UsageStatsPage,1:1 \u7EC9\u7ED8\uE632 Nexus styles.css \u9428?.usage-* \u7EEB?\r\n   =========================================================================== */\r\n.asone-panel .usage-ctl {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  flex-wrap: wrap;\r\n  margin: 16px 0 6px;\r\n}\r\n/* \u9352\u55D8\uE18C\u93BA\u0442\u6B22(pill \u7F01?:\u6D93\u20AC\u6D93\uE044\u6E3E\u7459\u6391\uE190\u9363\u3129\u5677\u93BA\u6393\u5BDC\u95BD?\u95AB\u5909\u8151\u6924\u7470\uFF5E\u6434\u66D8\u20AC?*/\r\n.asone-panel .usage-seg {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 2px;\r\n  padding: 3px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 9px;\r\n  background: #161a20;\r\n}\r\n.asone-panel .usage-seg button {\r\n  appearance: none;\r\n  border: 0;\r\n  background: transparent;\r\n  color: #9fb3c8;\r\n  font: inherit;\r\n  font-size: 12px;\r\n  line-height: 1;\r\n  padding: 7px 12px;\r\n  border-radius: 7px;\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n  transition: background 0.12s ease, color 0.12s ease;\r\n}\r\n.asone-panel .usage-seg button:hover {\r\n  background: #1b2029;\r\n  color: #dfe3ea;\r\n}\r\n.asone-panel .usage-seg button.on,\r\n.asone-panel .usage-seg button.on:hover {\r\n  background: #2b3a4d;\r\n  color: #e8f1fa;\r\n}\r\n.asone-panel .usage-refresh {\r\n  appearance: none;\r\n  border: 1px solid #3d5a73;\r\n  background: #22303f;\r\n  color: var(--text-soft);\r\n  font: inherit;\r\n  font-size: 12px;\r\n  line-height: 1;\r\n  padding: 10px 14px;\r\n  border-radius: 9px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .usage-refresh:hover:not(:disabled) {\r\n  background: #2a3d50;\r\n}\r\n.asone-panel .usage-refresh:disabled {\r\n  opacity: 0.6;\r\n  cursor: default;\r\n}\r\n.asone-panel .usage-ctl-info {\r\n  margin: 0 0 0 4px;\r\n}\r\n\r\n/* 5 \u5BEE?KPI \u9357\xB0\u20AC?*/\r\n.asone-panel .usage-cards {\r\n  display: grid;\r\n  grid-template-columns: repeat(5, minmax(0, 1fr));\r\n  gap: 10px;\r\n  margin-top: 14px;\r\n}\r\n.asone-panel .usage-card {\r\n  background: #161a20;\r\n  border: 1px solid #232a35;\r\n  border-radius: 12px;\r\n  padding: 12px 14px;\r\n  min-width: 0;\r\n}\r\n.asone-panel .usage-card-k {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n}\r\n.asone-panel .usage-card-v {\r\n  color: #eef2f8;\r\n  font-size: 22px;\r\n  font-weight: 600;\r\n  line-height: 1.35;\r\n  font-variant-numeric: tabular-nums;\r\n  overflow-wrap: anywhere;\r\n}\r\n.asone-panel .usage-card-v-sm {\r\n  font-size: 15px;\r\n}\r\n.asone-panel .usage-card-s {\r\n  color: var(--dim);\r\n  font-size: 11px;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.asone-panel .usage-sec {\r\n  margin-top: 24px;\r\n}\r\n.asone-panel .usage-sec h2 {\r\n  margin: 0 0 8px;\r\n  font-size: 14px;\r\n  color: #9fb3c8;\r\n  font-weight: 600;\r\n}\r\n\r\n.asone-panel .usage-chart-wrap {\r\n  position: relative;\r\n  width: 100%;\r\n}\r\n.asone-panel .usage-chart {\r\n  display: block;\r\n  overflow: visible;\r\n}\r\n.asone-panel .axis-text {\r\n  fill: #7b8798;\r\n  font-size: 10px;\r\n}\r\n.asone-panel .axis-text-r {\r\n  fill: #8ea0b8;\r\n}\r\n.asone-panel .usage-bar {\r\n  stroke: none;\r\n}\r\n/* \u93C1\u6751\u57AA\u95AB\u5FD4\u69D1\u935B\u6212\u8151\u9356?\u93CC\u535E\u74D9\u9350\u5D87\u734E\u6D94\u71BB\u5158 hover \u9352\u822C\u20AC?*/\r\n.asone-panel .bar-hit {\r\n  fill: transparent;\r\n  pointer-events: all;\r\n}\r\n.asone-panel .usage-line {\r\n  stroke-linejoin: round;\r\n  stroke-linecap: round;\r\n}\r\n\r\n.asone-panel .usage-tip {\r\n  position: absolute;\r\n  top: 6px;\r\n  transform: translateX(-50%);\r\n  min-width: 170px;\r\n  max-width: calc(100% - 8px);\r\n  padding: 8px 10px;\r\n  border: 1px solid #2c3644;\r\n  border-radius: 8px;\r\n  background: #1b2130;\r\n  color: #cfd8e3;\r\n  font-size: 11px;\r\n  line-height: 1.6;\r\n  pointer-events: none;\r\n  z-index: 30;\r\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);\r\n}\r\n.asone-panel .usage-tip-head {\r\n  color: #9fb3c8;\r\n  margin-bottom: 4px;\r\n}\r\n.asone-panel .usage-tip-line {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n}\r\n.asone-panel .usage-tip-line b {\r\n  color: #eef2f8;\r\n  font-weight: 600;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .usage-tip-nm {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 5px;\r\n  min-width: 0;\r\n}\r\n/* \u59AF\u2033\u7037\u935A?\u6FEE\u5B2C\u7C93\u9357\u66E1\uE511,\u6FB6\uE048\u66B1\u704F\u8FA9\u6E37\u9423\u30E5\u5F7F\u9286?*/\r\n.asone-panel .usage-tip-nm-t {\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n.asone-panel .usage-tip-sep {\r\n  height: 1px;\r\n  background: #2a3340;\r\n  margin: 6px 0;\r\n}\r\n.asone-panel .usage-tip-more {\r\n  color: var(--dim);\r\n  font-size: 10px;\r\n}\r\n\r\n.asone-panel .usage-legend {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px 16px;\r\n  margin-top: 10px;\r\n  color: #9fb3c8;\r\n  font-size: 11px;\r\n}\r\n.asone-panel .usage-legend-i {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .usage-dot {\r\n  display: inline-block;\r\n  width: 10px;\r\n  height: 10px;\r\n  border-radius: 2px;\r\n  flex: 0 0 auto;\r\n}\r\n.asone-panel .usage-dot.sm {\r\n  width: 8px;\r\n  height: 8px;\r\n}\r\n.asone-panel .usage-line-sw {\r\n  display: inline-block;\r\n  width: 14px;\r\n  height: 3px;\r\n  border-radius: 2px;\r\n}\r\n\r\n.asone-panel .usage-split {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 16px;\r\n  flex-wrap: wrap;\r\n}\r\n.asone-panel .usage-donut {\r\n  flex: 0 0 auto;\r\n}\r\n.asone-panel .usage-donut-v {\r\n  fill: #eef2f8;\r\n  font-size: 20px;\r\n  font-weight: 600;\r\n}\r\n.asone-panel .usage-donut-k {\r\n  fill: var(--dim);\r\n  font-size: 11px;\r\n}\r\n\r\n.asone-panel .usage-rank {\r\n  list-style: none;\r\n  margin: 0;\r\n  padding: 0;\r\n  flex: 1 1 260px;\r\n  min-width: 260px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n}\r\n.asone-panel .usage-row,\r\n.asone-panel .usage-subrow {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  padding: 6px 8px;\r\n  border-radius: 8px;\r\n  font-size: 12px;\r\n  color: #dfe3ea;\r\n}\r\n.asone-panel .usage-row {\r\n  background: #171c24;\r\n}\r\n.asone-panel .usage-row.clickable {\r\n  cursor: pointer;\r\n}\r\n.asone-panel .usage-row.clickable:hover,\r\n.asone-panel .usage-subrow.clickable:hover {\r\n  background: #1b2029;\r\n}\r\n.asone-panel .usage-rank-i {\r\n  min-width: 14px;\r\n  text-align: right;\r\n  color: #7b8798;\r\n  font-size: 11px;\r\n}\r\n/* \u9359\uE21A\u774D\u5BEE\u20AC\u741B\u5C80\u6B91\u93B6\u6A3A\u5F54\u93B8\u56E9\u305A:\u5A0C\u2103\u6E41\u701B\u6130\u300D\u93C3\u5241\u6680\u7ECC\u54C4\u5D30\u6D63?\u6DC7\u6FCA\u7609\u752F\uFE41\u58CA\u9367\u6943\u6B91\u741B\u5C7D\u4E4F\u6748\u572D\u7D2D\u7035\u5F52\u7D88\u9286?*/\r\n.asone-panel .usage-caret {\r\n  width: 8px;\r\n  flex: 0 0 8px;\r\n  color: #7b8798;\r\n  font-size: 12px;\r\n  line-height: 1;\r\n  transition: transform 0.15s ease;\r\n}\r\n.asone-panel .usage-caret.open {\r\n  transform: rotate(90deg);\r\n}\r\n.asone-panel .usage-name {\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  display: flex;\r\n  flex-direction: column;\r\n  line-height: 1.35;\r\n}\r\n.asone-panel .usage-name-m {\r\n  color: #dfe3ea;\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n.asone-panel .usage-name-s {\r\n  color: var(--dim);\r\n  font-size: 11px;\r\n}\r\n.asone-panel .usage-val {\r\n  text-align: right;\r\n  color: #eef2f8;\r\n  white-space: nowrap;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .usage-pct {\r\n  width: 52px;\r\n  text-align: right;\r\n  color: var(--dim);\r\n  white-space: nowrap;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .usage-fold {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  margin: 2px 0 4px 26px;\r\n  padding-left: 10px;\r\n  border-left: 2px solid #232a35;\r\n}\r\n.asone-panel .usage-subrow {\r\n  font-size: 11.5px;\r\n  color: #c3cbd8;\r\n}\r\n.asone-panel .usage-foot {\r\n  margin-top: 20px;\r\n}\r\n\r\n@media (max-width: 1100px) {\r\n  .asone-panel .usage-cards {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  }\r\n}\r\n\r\n/* ===========================================================================\r\n   \u7481\u5267\u7586\u6924?SettingsPage,1:1 \u7EC9\u7ED8\uE632 Nexus Settings.vue \u9428?.ui-* \u6D63\u64B6\u90F4)\r\n   =========================================================================== */\r\n\r\n/* Nexus \u9428?.err / .savedNotice \u93C4\uE21C\u51FD\u93C2\u56E7\u74E7;As One \u5BB8\u53C9\u6E41 .err/.notice \u9429\u6391\u7D21\u9359\u6A39\u7D8B,\r\n   \u93C1\u5470\u7E56\u95B2\u5C80\u6564 .ui-err/.ui-notice \u93B5\u630E\u5AB4\u7481\u5267\u7586\u6924\u5178\u7B0C\u6E1A\u6D98\u7C32\u935F\u55DB\u3009\u9428\u52ED\u51FD\u93C2\u56E7\u74E7\u8930\u3221\u20AC\u4F75\u20AC?*/\r\n.asone-panel .ui-err {\r\n  color: #e0685f;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  margin: 0;\r\n}\r\n\r\n.asone-panel .ui-notice {\r\n  color: #5fbf7d;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  margin: 0;\r\n}\r\n\r\n/* \u7481\u5267\u7586\u6924\u975B\uE63B\u6FB9?\u6D60?SettingsPage \u6D63\u8DE8\u6564)\u9286?   \u923F\u72C5\u7B0D 2026-10-24 \u9422\u3126\u57DB m10716:\u95C8\u72B2\u4E4F\u9286\u4F77\u7B09\u95C4\u612C\u57D7\u7039\u85C9\u5BB3\u9286?   \u9358\u71B8\u6F75 max-width: 980px + margin: 0 auto \u93C8\u5909\u88B1\u6D93\uE045\u763A\u9425?\u9236\u72B3\u66A3\u6924\u975B\u7733\u6D93?\u9359\u5145\u6676\u9423\u6B0E\u7AF4\u6FB6\u0445\u5896\r\n   \u7ECC\u8679\u6AE7;\u9236?80px \u7441\u546C\u7B09\u6D93\u5B28\u20AC\u5C83\u769F\u6434\uFE41\uE749\u9352\u6B0D\u20AC\u5D89\u5045\u6D5C\u65BF\u7D36\u9357?\u59E3\u5FD3\u7D36 5 \u6D93?box),\u9359\uE047\u5158\u93B8\u3086\u579A\u6D93\u3085\u57AA\u9286?   \u7039\u85C9\u5BB3\u6D5C\u3087\u7CB0\u6FB6\u6827\u7730 .content(max-width 1400px)\u93BA\u0443\u57D7,\u6769\u6B13\u5677\u6D93\u5D85\u5540\u9477\uE047\uE195\u6D93\u5A47\u6ABA\u9286?*/\r\n.asone-panel .ui-shell {\r\n  width: 100%;\r\n  max-width: none;\r\n  margin: 0;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n}\r\n\r\n.asone-panel .ui-page-desc {\r\n  margin: 0 0 6px;\r\n  color: var(--dim);\r\n  font-size: 13px;\r\n}\r\n\r\n.asone-panel .ui-layout {\r\n  display: flex;\r\n  align-items: flex-start;\r\n  gap: 24px;\r\n}\r\n\r\n.asone-panel .ui-content {\r\n  flex: 1;\r\n  min-width: 0;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n\r\n.asone-panel .ui-card {\r\n  background: var(--bg-card);\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 14px 16px;\r\n  scroll-margin-top: 60px;\r\n}\r\n\r\n.asone-panel .ui-card-head {\r\n  display: flex;\r\n  align-items: baseline;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  margin-bottom: 10px;\r\n}\r\n\r\n.asone-panel .ui-card-title {\r\n  margin: 0;\r\n  font-size: 14px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .ui-card-sub {\r\n  margin: 2px 0 0;\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .ui-fields {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\r\n  gap: 6px 18px;\r\n}\r\n\r\n.asone-panel .ui-field {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .ui-field.wide {\r\n  grid-column: 1 / -1;\r\n}\r\n\r\n.asone-panel .ui-field-head {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .ui-field-label {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  font-weight: 500;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .ui-field-unit {\r\n  color: var(--dim);\r\n  font-size: 11px;\r\n}\r\n\r\n.asone-panel .ui-field-hint {\r\n  margin: 0;\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .ui-field-err {\r\n  margin: 0;\r\n  color: var(--bad);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .ui-check {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  font-size: 13px;\r\n  cursor: pointer;\r\n  color: var(--text-soft);\r\n}\r\n\r\n.asone-panel .ui-jsonbox {\r\n  box-sizing: border-box;\r\n  width: 100%;\r\n  padding: 8px 10px;\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  color: var(--text-soft);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  resize: vertical;\r\n}\r\n\r\n.asone-panel .ui-jsonbox:focus {\r\n  outline: none;\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .ui-json-toggle {\r\n  appearance: none;\r\n  background: none;\r\n  border: none;\r\n  font: inherit;\r\n  color: var(--accent);\r\n  padding: 4px 0;\r\n  cursor: pointer;\r\n  font-size: 12.5px;\r\n}\r\n\r\n.asone-panel .ui-json-err {\r\n  margin: 0;\r\n  color: var(--bad);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .ui-json-actions {\r\n  display: flex;\r\n  justify-content: flex-end;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .ui-key-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  flex-wrap: wrap;\r\n}\r\n\r\n.asone-panel .ui-key {\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n  color: var(--text-soft);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 4px 10px;\r\n  word-break: break-all;\r\n}\r\n\r\n.asone-panel .ui-badge {\r\n  display: inline-block;\r\n  padding: 1px 8px;\r\n  border-radius: 999px;\r\n  font-size: 11.5px;\r\n  color: var(--dim);\r\n  border: 1px solid var(--border);\r\n  background: transparent;\r\n  white-space: nowrap;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u748B\u51A8\u5BB3\u7459\u52EB\u57AF\u7F02\u682C\u7DEB\u9363?2026-10-24 \u93B8\u590E\uE195\u7481\uFF04\uE7C8\u95B2\u5D85\u4EDB:5 \u9367\u6940\u810A\u93AC\u0443\u7AF7\u705E\u20AC + \u6D93\u30E6\u7278\u93C2\uE161\uE511\u93C4\u71B8\u6E61) \u9239\u20AC\u9239\u20AC */\r\n/* \u934F\u3129\u5134 scoped \u9352?.asone-scheduler,\u95AC\u57AE\u53A4\u59F9\u2103\u714B\u934F\u3125\u772C\u9286?   2026-10-24 \u9422\u3126\u57DB\u7455\u4F79\u7730\u9286\u5C84\u53A4\u9479\u63D2\u5D17\u748B\u51A6\u20AC?\u93C0\u572D\u6564\u6924\u7538\u6F70\u934F\u3125\u772C\u748B\u51AD\u58CA\u93C9?   (--bg-card #141b26 / --border #2c3a4d / --text-soft var(--text-soft) / --dim var(--dim)\r\n   / --accent #4d6bfe / --bad #e0685f),\u6D93\u5EA1\u53FE\u7039\u51A8\u5D31\u9417\u56E7\u6093\u9479\u832C\u90F4\u9286?*/\r\n.asone-panel .asone-scheduler {\r\n  --asec-bg-card: var(--bg-card);\r\n  --asec-bg-box: var(--dsw-alias-bg-layer-2, #182130);\r\n  --asec-bg-input: var(--dsw-alias-bg-layer-2, #101722);\r\n  --asec-border: var(--border);\r\n  --asec-text: var(--text-soft);\r\n  --asec-muted: var(--dim);\r\n  --asec-primary: var(--accent);\r\n  --asec-primary-bg: var(--dsw-alias-button-primary-dimmed, rgba(77, 107, 254, 0.16));\r\n  --asec-danger: var(--bad);\r\n}\r\n\r\n/* \u6FB6\u0443\u5D31\u9417?*/\r\n.asone-panel .asone-scheduler .rule-card {\r\n  background: var(--asec-bg-card);\r\n  border: 1px solid var(--asec-border);\r\n  border-radius: 8px;\r\n  margin-bottom: 24px;\r\n  overflow: hidden;\r\n}\r\n/* \u935A\u5C7E\u3002\u6FB6\u6C2D\u6F6F\u7459\u52EB\u57AF:\u9429\u6401\u5066\u6D93\u3085\u6F61\u6D94\u5B2E\u68FF\u9354\u72B2\u578E\u95C5\u65C2\u568E */\r\n.asone-panel .asone-scheduler .blocks-container + .blocks-container {\r\n  border-top: 1px solid var(--asec-border);\r\n}\r\n\r\n/* \u9357\uFF04\u5896\u6FB6\u64AE\u5134 */\r\n.asone-panel .asone-scheduler .card-header {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 16px;\r\n  padding: 16px 20px;\r\n  border-bottom: 1px solid var(--asec-border);\r\n}\r\n/* \u5997\uFF44\u7D85\u5BF0\u754C\u73F7(\u6D63\u6EC5\u6564\u9369\u71B7\u5534\u7455\u55D9\u6D0A\u934F\u3125\u772C .badge) */\r\n.asone-panel .asone-scheduler .badge {\r\n  display: inline-block;\r\n  background: var(--asec-primary);\r\n  color: #16161e;\r\n  font-weight: bold;\r\n  font-size: 14px;\r\n  padding: 4px 12px;\r\n  border-radius: 6px;\r\n  border: 1px solid transparent;\r\n  white-space: nowrap;\r\n}\r\n/* \u5997\uFF44\u7D85\u935A?\u93C2\u677F\uE583,\u7481\u6350\uE178\u7ECB\u57AE\u5F67\u93C8\u590A\u7A98\u7ED4?+ \u93B8\u5910\u6333) */\r\n.asone-panel .asone-scheduler .card-subtitle {\r\n  color: var(--asec-muted);\r\n  font-size: 13px;\r\n}\r\n.asone-panel .asone-scheduler .btn-add {\r\n  background: transparent;\r\n  color: var(--asec-text);\r\n  border: 1px solid var(--asec-border);\r\n  padding: 4px 12px;\r\n  border-radius: 4px;\r\n  cursor: pointer;\r\n  transition: all 0.2s;\r\n}\r\n.asone-panel .asone-scheduler .btn-add:hover {\r\n  background: rgba(255, 255, 255, 0.05);\r\n}\r\n\r\n/* \u7ECC\u8679\u7C8D / \u9357\uFF04\u5896\u9350\u546E\u5F41\u7EC0?\u93C2\u677F\uE583) */\r\n.asone-panel .asone-scheduler .card-empty {\r\n  margin: 0;\r\n  padding: 20px;\r\n  color: var(--asec-muted);\r\n  font-size: 13px;\r\n  border-bottom: 1px solid var(--asec-border);\r\n}\r\n.asone-panel .asone-scheduler .card-hint {\r\n  margin: 0;\r\n  padding: 10px 20px;\r\n  color: var(--asec-muted);\r\n  font-size: 12px;\r\n  border-bottom: 1px solid var(--asec-border);\r\n}\r\n\r\n/* \u93CD\u7A3F\u7E3E\u9350\u546D\uE190\u9356?\u5BEE\u89C4\u20AC\u0443\u7AF7\u705E\u20AC\u7039\u7470\u6AD2 */\r\n.asone-panel .asone-scheduler .blocks-container {\r\n  padding: 20px;\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 20px;\r\n}\r\n\r\n/* 5 \u6D93\uE046\u5AED\u7ED4\u5B2B\u0101\u9367\u6943\u6B91\u934F\uE100\u53E1\u93CD\u5CF0\u7D21 */\r\n.asone-panel .asone-scheduler .box {\r\n  background: var(--asec-bg-box);\r\n  border: 1px solid var(--asec-border);\r\n  border-radius: 8px;\r\n  padding: 16px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n}\r\n.asone-panel .asone-scheduler .box-label {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: center;\r\n  color: var(--asec-muted);\r\n  font-size: 13px;\r\n  height: 20px;\r\n}\r\n.asone-panel .asone-scheduler .box-label .req {\r\n  color: var(--asec-danger);\r\n  margin-left: 4px;\r\n}\r\n\r\n/* \u9419\uE102\u73DB\u9428\u52EB\uE194\u6434\uFE3D\u5E36\u9352?\u6D93\u5EA4\uE195\u7481\uFF04\uE7C8\u6D93\u20AC\u9477? */\r\n.asone-panel .asone-scheduler .box-provider { flex: 1 1 160px; min-width: 160px; }\r\n.asone-panel .asone-scheduler .box-model    { flex: 2 1 280px; min-width: 280px; }\r\n.asone-panel .asone-scheduler .box-expiry   { flex: 1 1 180px; min-width: 180px; }\r\n.asone-panel .asone-scheduler .box-weekdays { flex: 3 1 300px; min-width: 300px; } /* \u7039\u85C9\u5BB3\u6D93\u5D88\u51BB\u93C3\u60F0\u0415\u9359\u621D\u53DA\u93C3\u30E6\u66A3\u6D63\u64B4\u5D32\u741B?*/\r\n.asone-panel .asone-scheduler .box-times    { flex: 2 1 300px; min-width: 280px; }\r\n.asone-panel .asone-scheduler .box-cooldown { flex: 1 1 180px; min-width: 160px; }\r\n\r\n/* \u9352\u72BB\u6ACE\u7459\u52EB\u57AF\u93B8\u5910\u6333 */\r\n.asone-panel .asone-scheduler .btn-del {\r\n  background: none;\r\n  border: none;\r\n  color: var(--asec-danger);\r\n  cursor: pointer;\r\n  font-size: 13px;\r\n}\r\n.asone-panel .asone-scheduler .btn-del:hover {\r\n  opacity: 0.8;\r\n}\r\n\r\n/* \u6748\u64B3\u53C6\u5997\u55DB\u20AC\u6C31\u6564\u93CD\u5CF0\u7D21(select / date / time / number \u934F\u8FA9\u6564) */\r\n.asone-panel .asone-scheduler .input-control {\r\n  background: var(--asec-bg-input);\r\n  border: 1px solid var(--asec-border);\r\n  color: var(--asec-text);\r\n  padding: 10px 12px;\r\n  border-radius: 6px;\r\n  font-size: 13px;\r\n  font-family: inherit;\r\n  width: 100%;\r\n  outline: none;\r\n  transition: border-color 0.2s;\r\n}\r\n.asone-panel .asone-scheduler .input-control:focus {\r\n  border-color: var(--asec-primary);\r\n}\r\n.asone-panel .asone-scheduler select.input-control {\r\n  cursor: pointer;\r\n}\r\n\r\n/* \u93C3\u30E5\u5DFB\u935C\u5C7E\u6902\u95BD\u71B7\u6D58\u93CD\u56E7\u5F3D\u9479\u53C9\u796C\u9479?\u7481\u6350\uE178\u7ECB\u57AE\u53E7\u95BF\uE1BE\u5063) */\r\n.asone-panel .asone-scheduler input[type="date"]::-webkit-calendar-picker-indicator,\r\n.asone-panel .asone-scheduler input[type="time"]::-webkit-calendar-picker-indicator {\r\n  filter: invert(0.6);\r\n  cursor: pointer;\r\n  opacity: 0.8;\r\n}\r\n.asone-panel .asone-scheduler input[type="date"]::-webkit-calendar-picker-indicator:hover,\r\n.asone-panel .asone-scheduler input[type="time"]::-webkit-calendar-picker-indicator:hover {\r\n  opacity: 1;\r\n}\r\n\r\n/* \u923D?\u95C5\u612F\u68CC\u93C8\uE048\u20AC\u590B\u5AE8\u93C3\u30E6\u6E61\u93C3\u5241\u6B91 yyyy/mm/\u93C3?\u9357\u72B1\u7D85\u7ED7?\u9422\u3126\u57DB\u9410\u7470\u6095\u8E47\u5474\u300F\u6DC7\u6FC8\u6680) \u923D?   \u923F\u72C5\u7B0D \u9422?JS \u6939\u535E\u59E9\u9428?`.is-empty` \u7EEB?\u6D93\u5D87\u6564 `:invalid`:\u7ECC\u8679\u6B91\u95C8?required date \u6748\u64B3\u53C6\r\n   \u93C4?`:valid`(\u5A0C\u2103\u6E41 valueMissing/typeMismatch),`:invalid` \u9359\uE044\u6E6A required \u93C3\u8235\u58A0\r\n   \u9356\u5F52\u53A4\u7ECC\u54C4\u20AC?\u9225\u65BA\u20AC?\u9470?required \u6D7C\u6C36\u300E\u752F\uFE3E\uE6E6\u93BA?Chromium \u9428?\u8133 \u5A13\u5474\u6ACE\u93B8\u5910\u6333(\u7459?SettingsPage)\u9286?*/\r\n.asone-panel .asone-scheduler input[type="date"].is-empty::-webkit-datetime-edit {\r\n  color: transparent;\r\n}\r\n.asone-panel .asone-scheduler input[type="date"]:focus::-webkit-datetime-edit {\r\n  color: var(--asec-text);\r\n}\r\n\r\n/* \u93C4\u71B8\u6E61\u59AF\u2033\u6F61:\u6D93\u20AC\u6D5C\u5C7C\u7B01\u9365\u6D97\u7C32 / \u934F\uE15F\u68E9 \u6D93\u3087\u7C8D,\u7ECC\u6D2A\u68FF\u6D93\u5D88\u51BB\u93C3\u8EB2\u20AC\u5C7D\u53DA\u93C3\u30E3\u20AC\u5D86\u66A3\u6D63\u64B4\u5D32\u741B?*/\r\n.asone-panel .asone-scheduler .weekday-flex {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px;\r\n}\r\n.asone-panel .asone-scheduler .weekday-group {\r\n  display: flex;\r\n  gap: 8px;\r\n}\r\n.asone-panel .asone-scheduler .weekday-flex input {\r\n  display: none;\r\n}\r\n.asone-panel .asone-scheduler .weekday-flex label {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 34px;\r\n  height: 34px;\r\n  border-radius: 6px;\r\n  border: 1px solid var(--asec-border);\r\n  background: var(--asec-bg-input);\r\n  color: var(--asec-muted);\r\n  cursor: pointer;\r\n  transition: all 0.2s;\r\n  flex-shrink: 0;\r\n}\r\n.asone-panel .asone-scheduler .weekday-flex input:checked + label {\r\n  background: var(--asec-primary-bg);\r\n  border-color: var(--asec-primary);\r\n  color: var(--asec-primary);\r\n  font-weight: bold;\r\n}\r\n\r\n/* \u93C3\u5815\u68FF\u5A08\u57AB\u0101\u9367?*/\r\n.asone-panel .asone-scheduler .time-flex {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n}\r\n.asone-panel .asone-scheduler .time-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n.asone-panel .asone-scheduler .time-row input[type="time"] {\r\n  width: 120px;\r\n  flex-shrink: 0;\r\n}\r\n.asone-panel .asone-scheduler .separator {\r\n  color: var(--asec-muted);\r\n}\r\n.asone-panel .asone-scheduler .btn-del-time {\r\n  background: none;\r\n  border: none;\r\n  color: var(--asec-danger);\r\n  cursor: pointer;\r\n  font-size: 16px;\r\n  padding: 0 4px;\r\n}\r\n.asone-panel .asone-scheduler .btn-add-time {\r\n  background: none;\r\n  border: none;\r\n  color: var(--asec-primary);\r\n  cursor: pointer;\r\n  font-size: 13px;\r\n  text-align: left;\r\n  padding: 0;\r\n  margin-top: 4px;\r\n}\r\n.asone-panel .asone-scheduler .btn-add-time:hover {\r\n  text-decoration: underline;\r\n}\r\n\r\n/* \u7459\u52EB\u57AF\u93CD\uFFE0\u7359\u95BF\u6B12\uE1E4(\u93C2\u677F\uE583:\u7481\u6350\uE178\u7ECB\u630E\u68E4,\u5A0C\u8DE8\u6564\u95BF\u6B12\uE1E4\u93BB\u612E\u305A\u9479? */\r\n.asone-panel .asone-scheduler .rule-err {\r\n  margin: -8px 20px 20px;\r\n  color: var(--asec-danger);\r\n  font-size: 12.5px;\r\n  line-height: 1.5;\r\n}\r\n\r\n/* \u9352\u55D9\u7C8D\u752F\u51A8\u772C(\u748B\u51A8\u5BB3\u7F02\u682C\u7DEB\u9363\u3125\u51E1\u93B9?.asone-scheduler \u7F01\u64B4\u702F;\u6769\u6B0F\u5691\u6D93\uE043\u7C8E\u9286\u5C84\u5678\u7487\u66E0\u74E5\u9423\u30E3\u20AC\u5D85\u5D31\u6769\u6A3A\u6E6A\u9422? */\r\n.asone-panel .ui-rule-groups {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 16px;\r\n}\r\n.asone-panel .ui-group {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n}\r\n.asone-panel .ui-group-head {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n}\r\n.asone-panel .ui-group-title {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  font-weight: 500;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u95AB\u20AC\u95AC\u630E\u6D38\u7EFE?\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n.asone-panel .ui-chart-box {\r\n  width: 100%;\r\n  overflow-x: auto;\r\n  padding: 8px 0 2px;\r\n}\r\n.asone-panel .ui-chart-yaxis {\r\n  stroke: #3d5a73;\r\n}\r\n.asone-panel .ui-chart-grid {\r\n  stroke: rgba(44, 58, 77, 0.7);\r\n}\r\n.asone-panel .ui-chart-axis {\r\n  stroke: #3d5a73;\r\n}\r\n.asone-panel .ui-chart-band {\r\n  fill: rgba(77, 107, 254, 0.12);\r\n}\r\n.asone-panel .ui-chart-dash {\r\n  stroke: var(--warn);\r\n  stroke-dasharray: 4 4;\r\n}\r\n.asone-panel .ui-chart-line {\r\n  fill: none;\r\n  stroke: var(--accent);\r\n  stroke-width: 1.8;\r\n}\r\n.asone-panel .ui-chart-dot {\r\n  fill: var(--accent);\r\n}\r\n.asone-panel .ui-chart-label {\r\n  fill: var(--dim);\r\n  font-size: 10px;\r\n}\r\n.asone-panel .ui-chart-tick {\r\n  fill: var(--dim);\r\n  font-size: 10px;\r\n}\r\n.asone-panel .ui-chart-text {\r\n  margin-top: 10px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n}\r\n.asone-panel .ui-chart-text p {\r\n  margin: 0;\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u6434\u66E2\u5134\u6DC7\u6FC6\u74E8\u93CD?\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n.asone-panel .ui-savebar {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 14px;\r\n  background: var(--bg-card);\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 10px 14px;\r\n  position: sticky;\r\n  bottom: 12px;\r\n  z-index: 5;\r\n}\r\n.asone-panel .ui-savebar-count {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  color: var(--text-soft);\r\n  font-size: 13px;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ui-savebar-dot {\r\n  width: 7px;\r\n  height: 7px;\r\n  border-radius: 50%;\r\n  background: var(--bad);\r\n}\r\n.asone-panel .ui-savebar-msg {\r\n  flex: 1;\r\n  min-width: 0;\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ui-savebar-btns {\r\n  display: flex;\r\n  gap: 8px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC ui-btn \u93B8\u5910\u6333\u6D63\u64B6\u90F4(\u7481\u5267\u7586\u6924? \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n.asone-panel .ui-btn {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: var(--text-soft);\r\n  background: rgba(77, 107, 254, 0.1);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  padding: 0 12px;\r\n  font-size: 12.5px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-btn:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n}\r\n.asone-panel .ui-btn:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n.asone-panel .ui-btn-sm {\r\n  height: 24px;\r\n  padding: 0 10px;\r\n  font-size: 12px;\r\n}\r\n.asone-panel .ui-btn-primary {\r\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  border-color: var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .ui-btn-primary:hover:not(:disabled) {\r\n  background: #3a5d80;\r\n}\r\n.asone-panel .ui-btn-ghost {\r\n  background: none;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .ui-btn-danger {\r\n  color: var(--bad);\r\n}\r\n\r\n/* ===========================================================================\r\n   \u934F\u6735\u7CAC\u6E1A\u6D98\u7C32\u935F\u55DB\u3009(ProvidersPage,1:1 \u7EC9\u7ED8\uE632 Nexus Providers.vue \u9428?scoped \u93CD\u5CF0\u7D21)\r\n   =========================================================================== */\r\n\r\n.asone-panel .providers-page {\r\n  max-width: 760px;\r\n}\r\n\r\n.asone-panel .rows {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  margin: 12px 0 0;\r\n  padding: 0;\r\n  list-style: none;\r\n}\r\n\r\n.asone-panel .rowCard {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  border: 1px solid var(--border);\r\n  background: var(--bg-card);\r\n  border-radius: 10px;\r\n  padding: 12px 14px;\r\n}\r\n\r\n.asone-panel .rowHead {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .rowName {\r\n  color: var(--text-soft);\r\n  font-size: 14px;\r\n  font-weight: 500;\r\n}\r\n\r\n.asone-panel .credentialDot {\r\n  flex: none;\r\n  width: 8px;\r\n  height: 8px;\r\n  border-radius: 50%;\r\n  display: inline-block;\r\n}\r\n\r\n.asone-panel .dotOk {\r\n  background: #22a06b;\r\n}\r\n\r\n.asone-panel .dotMissing {\r\n  background: #d92d20;\r\n}\r\n\r\n.asone-panel .rowActions {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  margin-left: auto;\r\n}\r\n\r\n.asone-panel .rowBtn {\r\n  appearance: none;\r\n  font: inherit;\r\n  border-radius: 6px;\r\n  height: 28px;\r\n  padding: 0 12px;\r\n  font-size: 12px;\r\n  cursor: pointer;\r\n  border: 1px solid var(--border);\r\n  background: transparent;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .rowBtn:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover, #1f2732);\r\n}\r\n.asone-panel .rowBtn.danger {\r\n  color: var(--bad);\r\n}\r\n.asone-panel .rowBtn:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.asone-panel .panel {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n  background: #1b2029;\r\n  border: 1px solid #232a34;\r\n  border-radius: 8px;\r\n  padding: 12px;\r\n}\r\n\r\n.asone-panel .panelTitle {\r\n  color: var(--text-soft);\r\n  font-size: 13px;\r\n  font-weight: 500;\r\n  line-height: 20px;\r\n  margin-bottom: 2px;\r\n}\r\n\r\n.asone-panel .catalogSection {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n\r\n.asone-panel .catalogTitle {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  font-weight: 500;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .modelListHead {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n  margin-bottom: 2px;\r\n}\r\n\r\n.asone-panel .modelCatalogMeta {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .headActions {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 2px;\r\n}\r\n\r\n.asone-panel .linkButton {\r\n  appearance: none;\r\n  background: none;\r\n  border: none;\r\n  font: inherit;\r\n  border-radius: 4px;\r\n  height: 28px;\r\n  color: var(--dim);\r\n  cursor: pointer;\r\n  padding: 0 8px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  display: inline-flex;\r\n  align-items: center;\r\n}\r\n.asone-panel .linkButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover, #1f2732);\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .linkButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.asone-panel .modelEmpty {\r\n  margin: 0;\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  border: 1px dashed var(--border);\r\n  border-radius: 8px;\r\n  text-align: center;\r\n  padding: 12px;\r\n}\r\n\r\n.asone-panel .addButton {\r\n  box-sizing: border-box;\r\n  flex: none;\r\n  width: 100%;\r\n  border: 1px dashed var(--border);\r\n  border-radius: 10px;\r\n  background: var(--bg-card);\r\n  height: 54px;\r\n  margin-top: 10px;\r\n  color: var(--text-soft);\r\n  font: inherit;\r\n  cursor: pointer;\r\n  display: flex;\r\n  justify-content: center;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 0 14px;\r\n  font-size: 14px;\r\n}\r\n.asone-panel .addButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover, #1f2732);\r\n  border-color: #3b4756;\r\n}\r\n.asone-panel .addButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.asone-panel .cardFooter {\r\n  justify-content: flex-end;\r\n}\r\n\r\n.asone-panel .envPrefix {\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n  color: var(--text-soft);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 4px 10px;\r\n  display: inline-block;\r\n  align-self: flex-start;\r\n  word-break: break-all;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u95AB\u660F\u7DEB\u59AF\u2033\u7037 / \u59AF\u2033\u7037\u93AC\u660F\uE74D \u701B\u6130\u3009(Nexus \u95C8\u3221\u6F98\u7EC9\u7ED8\uE632,\u7EEB\u8BF2\u6095\u5A0C\u8DE8\u6564 Nexus)\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .section {\r\n  color: var(--text-soft);\r\n  flex-direction: column;\r\n  gap: 12px;\r\n  display: flex;\r\n}\r\n\r\n/* \u6D93\u3089\u3009 section \u7039\u85C9\u5BB3\u5BB8\uE1BC\u7D13(\u6FB6\u5D87\u6564\u935A\u5C7C\u7AF4 .section,\u6D60?max-width \u6D93\u5D85\u6093) */\r\n.asone-panel .lm-section {\r\n  /* \u923F\u72C5\u7B0D 2026-10-25(m14379):\u95AB\u660F\u7DEB\u59AF\u2033\u7037\u9352\u6944\u3003\u9366\u3125\u59DE\u7039\u754C\u6B91 content \u95B2\u5C7D\u7733\u6D93\uE15C\u20AC?     \u93C4\u60E7\u7D21 width:min(720px,100%) \u9225\u65BA\u20AC?\u934F\u5910\u6F6C max-width + margin-inline:auto\r\n     \u6D7C\u6C33\uE180 flex item \u93C0\u5241\u7F09\u9352\u677F\u5534\u7039\u7470\uE194(\u7039\u70B4\u7974 531px),\u8E47\u5474\u300F\u7F01\u6B0F\u6D50\u7039\u6C2C\uE194\u6434\uFE3A\u20AC?*/\r\n  max-width: 720px;\r\n  width: min(720px, 100%);\r\n  margin-inline: auto;\r\n}\r\n.asone-panel .dep-section {\r\n  /* \u923F\u72C5\u7B0D 2026-10-25(m14922):\u59AF\u2033\u7037\u93AC\u660F\uE74D\u93C1\u5BF8\u7C8D\u705E\u546C\u8151\u9286\u4FFFection \u934F\u3125\uE194,\u9357\uFF04\u5896\u7F01\u52EE\u569C\u97EC?     (dep-grid)\u9422?width:min(1464px,100%) + margin-inline:auto \u705E\u546C\u8151;\r\n     \u6D93\u5D85\u5540\u9422?max-width 1200 \u95C4\u612C\u57D7(\u95AD\uFF44\u7D30\u9357\u2103\uE134\u9359\uE047\u5158 2 \u9352?\u9286?*/\r\n  width: 100%;\r\n}\r\n.asone-panel .pv-section {\r\n  /* \u923F\u72C5\u7B0D 2026-10-25(m14379):\u934F\u6735\u7CAC\u6E1A\u6D98\u7C32\u935F\u55D7\u57AA\u741B\u3125\u6E6A\u9354\u72B2\uE194\u9428?content \u95B2\u5C7D\u7733\u6D93\uE15C\u20AC?     \u935A\u5C7C\u7B02,\u93C4\u60E7\u7D21\u7039\u85C9\u5BB3\u95C3\u53C9\uE11B\u93C0\u5241\u7F09(\u7039\u70B4\u7974 248px)\u9286?*/\r\n  max-width: 720px;\r\n  width: min(720px, 100%);\r\n  margin-inline: auto;\r\n}\r\n\r\n/* \u9286\u5C7E\u656E\u93B8\u4F7A\u6B91\u93AC\u6FCA\u20AC\u51A8\u5DF1\u6434\uFE3A\u20AC\u5D85\u7A98\u7ED4?\u93AC\u660F\uE74D\u6924\u57AB\u7621\u741B\u5C7E\u0101\u9368\u5B29\u7AF4\u6D93?pill \u93CD\u5CF0\u7D21\u7F01\u71B6\u7AF4\u74A7?.pill) */\r\n.asone-panel .pill.efforts {\r\n  max-width: 22ch;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n/* Nexus \u9428?.err / .savedNotice \u93C4\uE21C\u51FD\u93C2\u56E7\u74E7;As One \u5BB8\u53C9\u6E41 .err \u9429\u6391\u7D21\u9359\u6A39\u7D8B,\r\n   \u9422\u3124\u7D94\u9422\u3125\u7159\u7455\u55D9\u6D0A(.section .err,\u9417\u7470\u7D13\u93AC?0,2,0)\u6769\u6A3A\u5E2B Nexus \u8930\u3221\u20AC?\u6D93\u5D85\u59E9\u934F\u3125\u772C .err */\r\n.asone-panel .section .err {\r\n  padding: 0;\r\n  border: 0;\r\n  background: none;\r\n  border-radius: 0;\r\n  margin: 0;\r\n  color: #e0685f;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .savedNotice {\r\n  color: #5fbf7d;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  margin: 0;\r\n}\r\n\r\n/* \u741B\u5C7D\u5D31\u6FB6\u64AE\u5134(\u95AB\u660F\u7DEB\u59AF\u2033\u7037) */\r\n.asone-panel .rowIdentity {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .rowTag {\r\n  border: 1px solid var(--border);\r\n  border-radius: 4px;\r\n  color: var(--dim);\r\n  flex: none;\r\n  padding: 1px 6px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n}\r\n\r\n.asone-panel .rowRuntime {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  margin-left: 8px;\r\n}\r\n\r\n/* \u5BF0\u754C\u73F7 pill(Nexus \u935A\u5C7E\uE0D9) */\r\n.asone-panel .pill {\r\n  display: inline-block;\r\n  padding: 1px 7px;\r\n  border-radius: 9px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .pill.ok {\r\n  background: #17301f;\r\n  color: #5fbf7d;\r\n}\r\n.asone-panel .pill.bad {\r\n  background: #33191a;\r\n  color: #e0685f;\r\n}\r\n.asone-panel .pill.info {\r\n  background: #1c2733;\r\n  color: #8fb8d8;\r\n}\r\n.asone-panel .pill.na {\r\n  background: var(--chip-bg);\r\n  color: var(--dim);\r\n}\r\n.asone-panel .pill.metric {\r\n  background: var(--chip-bg);\r\n  color: var(--text-soft);\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .pill.alert {\r\n  background: #35290f;\r\n  color: #d9a441;\r\n}\r\n\r\n/* \u59AF\u2033\u7037\u93AC\u660F\uE74D\u6924\u8235\u722E(2026-10-25 m14379 \u95B2\u5D86\u67CA\u7481\u6350\uE178;m14922 \u74A7\u8702\u7B09\u9350\u5D86\u6E41\u93B5\u5F52\u567A\u93B8\u5910\u6333,\u9359\uE046\u6680\u7F01\u71BB\uE178) */\r\n.asone-panel .dep-toolbar {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  flex-wrap: wrap;\r\n}\r\n.asone-panel .dep-summary {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n/* \u59AF\u2033\u7037\u93AC\u660F\uE74D\u6FB6\u6C2C\u57AA\u9357\uFF04\u5896(m14922 \u7039\u6C2D\uE50D:\u6D93\u5D85\u5540\u9352\u55D9\u7C8D\u93B6\u6A3A\u5F54,\u59E3\u5FDB\u5134\u7F03\u8E6D\u7AF4\u9357?\u5BEE\u89C4\u20AC\u0443\u57AA\u7039?+ \u93C1\u5BF8\u7C8D\u705E\u546C\u8151\u9286?   \u923F\u72C5\u7B0D \u9352\u6940\uE194 minmax(360px, 480px):1920 \u7ED0\u6940\u5F5B(content 1680,\u9350\u546D\uE190\u9356?1640)\u6D93\u5B2D\u5158\u93BA?3 \u9352?   (3\u8133480 + 2\u813312 = 1464 \u922E?1640);\u7ED0\u6940\u5F5B\u93C7\u5BF8\u734E\u93C3?auto-fill \u9477\uE044\u59E9\u95C4\u5D84\u8D1F 2 \u9352?1 \u9352\u693C\u20AC?   \u95AC\u57AE\u53A4 hyperai/deepseek-v4.1-flash-fastest \u6769\u6B11\u88AB\u95C0\u630E\u0101\u9368\u5B2A\u6095\u93B6\u5A42\u5D31\u9417\u56E7\u5534\u7039\u89C4\u5C0B\u93B4\u612A\u7B01\u741B\u5C7B\u20AC?*/\r\n.asone-panel .dep-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fill, minmax(360px, 480px));\r\n  justify-content: center;\r\n  gap: 12px;\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  width: min(1464px, 100%);\r\n  margin-inline: auto;\r\n}\r\n\r\n.asone-panel .depCard {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 10px 12px;\r\n  background: #14181f;\r\n}\r\n\r\n.asone-panel .depCardHead {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  flex-wrap: wrap;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .depProvider {\r\n  flex: none;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  color: var(--dim);\r\n  border: 1px solid var(--border);\r\n  border-radius: 999px;\r\n  padding: 1px 8px;\r\n  background: var(--bg-deep);\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .depCardBody {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n  min-width: 0;\r\n}\r\n\r\n/* \u95AE\u3127\u8BB2\u9357?\u93C3?hover \u6942\u6A39\u5BD2:\u9357\uFF04\u5896\u93C8\uE103\u97E9\u5BB8\u53C9\u69F8\u9419\uE102\u73DB\u9367?\u6D93\u5D85\u5540\u59AF\u2032\u8C62\u741B? */\r\n.asone-panel .depCard:hover {\r\n  background: #161b23;\r\n}\r\n\r\n.asone-panel .depCode {\r\n  background: none;\r\n  padding: 0;\r\n  border: 0;\r\n  border-radius: 0;\r\n  font-family: var(--mono);\r\n  font-size: 12.5px;\r\n  color: var(--text-soft);\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  max-width: 100%;\r\n}\r\n\r\n.asone-panel .depChips {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  flex-wrap: wrap;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .depChipEdit {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  background: var(--chip-bg);\r\n  border-radius: 9px;\r\n  padding: 1px 6px 1px 8px;\r\n  line-height: 16px;\r\n}\r\n\r\n.asone-panel .chipLabel {\r\n  font-size: 11px;\r\n  color: var(--dim);\r\n}\r\n\r\n.asone-panel .chipNum {\r\n  width: 42px;\r\n  background: var(--bg-deep);\r\n  border: 1px solid var(--border);\r\n  border-radius: 4px;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  font-variant-numeric: tabular-nums;\r\n  padding: 1px 4px;\r\n  text-align: center;\r\n}\r\n.asone-panel .chipNum:disabled {\r\n  opacity: 0.5;\r\n}\r\n.asone-panel .chipNum::-webkit-outer-spin-button,\r\n.asone-panel .chipNum::-webkit-inner-spin-button {\r\n  -webkit-appearance: none;\r\n  margin: 0;\r\n}\r\n\r\n/* \u93AC\u6FCA\u20AC\u51A8\u5DF1\u6434\uFE42\u20AC\u590B\u5AE8\u9363?\u59AF\u2033\u7037\u93AC\u660F\uE74D\u9357\uFF04\u5896\u9350\u546F\u6B91\u6D93\u5B2B\u5ABA) */\r\n.asone-panel .chipSelect {\r\n  background: var(--bg-deep);\r\n  border: 1px solid var(--border);\r\n  border-radius: 4px;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  padding: 1px 4px;\r\n  max-width: 168px;\r\n}\r\n.asone-panel .chipSelect:disabled {\r\n  opacity: 0.5;\r\n}\r\n\r\n.asone-panel .depCheck {\r\n  margin-left: auto;\r\n  flex: none;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  font-size: 12px;\r\n  color: var(--dim);\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .checkInput {\r\n  width: 15px;\r\n  height: 15px;\r\n  accent-color: #5fbf7d;\r\n}\r\n.asone-panel .checkInput:disabled {\r\n  opacity: 0.4;\r\n}\r\n\r\n/* \u59AF\u2033\u7037\u93AC\u660F\uE74D 2026-10-25(m14379)\u5BB8\u53C9\u59B8\u93B5\u5F52\u567A\u93B8\u5910\u6333\u93B8\uE044\u57CC\u6924\u5815\u5134\u5BB8\u30E5\u53FF\u93C9?m14922 \u74A7\u98CE\u0429\u95C4\u3086\u5BDC\u95BD?,\r\n   \u6D93\u5D85\u5540\u9422?.section .headActions \u7ED4\u6828\u5E13\u8930\u3221\u20AC\u4F75\u20AC?*/\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u5A13\u72BB\u4EBE\u6924\u5178\u7B01\u5A08\u975B\u7D21\u6960\u3126\u7066(1:1 \u7EC9\u7ED8\uE632 Nexus styles.css \u934F\u3125\u772C .chan-* \u5A08? \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n.asone-panel .chan-page { display: flex; flex-direction: column; gap: 16px; }\r\n\r\n.asone-panel .chan-card {\r\n  border: 1px solid var(--border);\r\n  border-radius: 12px;\r\n  padding: 16px;\r\n  background: #161a20;\r\n}\r\n\r\n.asone-panel .chan-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; }\r\n.asone-panel .chan-head h3 { margin: 0; font-size: 14px; color: var(--text-soft); }\r\n\r\n/* `.chan-tag` \u5BB8\u67E5\u6BA2\u9422\u3126\u57DB 2026-10-31 \u7039\u6C2D\uE50D\u9352\u72BB\u6ACE(\u9286\u5C80\u7CBA\u6D93\u20AC\u9352\u72BB\u6ACE\u9286\u5EA2\u0101\u9368\u5B2C\u6D30\u8930\u66D8\u20AC\u5FD4\u68BA\u9428\u52EB\u7A98\u7ED4?\r\n * \u6FE1\u5098\u20AC\u5E9D\u7B02\u5A13?API \u8DEF 3 \u6D93\uE042\u20AC\u5FCB\u20AC\u5EA1\u51E1\u9355\u9E43\u20AC?4 / 11\u9286\u5FCB\u20AC?\u9225\u65BA\u20AC?\u9365\u6D97\u91DC\u5A13\u72BB\u4EBE\u6924\u7535\u6B91\u59AF\u2033\u7037\u9429\uE1BC\u7D8D\u93CD\u56EC\uE57D\u741B\u5C7D\u5F67\u9353?h3\u9286?*/\r\n\r\n.asone-panel .chan-hint { color: var(--dim); font-size: 12px; line-height: 1.6; margin: 6px 0 0; }\r\n.asone-panel .chan-empty { color: var(--dim); font-size: 13px; }\r\n\r\n.asone-panel .chan-banner { margin: 0 0 8px; padding: 7px 10px; border-radius: 6px; font-size: 12px; }\r\n.asone-panel .chan-banner.err { color: #e0685f; border: 1px solid #4a2224; background: #241417; }\r\n.asone-panel .chan-banner.warn { color: #d9a441; border: 1px solid #4a3a1e; background: #241f14; }\r\n.asone-panel .chan-banner.ok { color: #5fbf7d; border: 1px solid #1d2f26; background: #14211a; }\r\n\r\n.asone-panel .chan-badge {\r\n  font-size: 11px;\r\n  padding: 2px 8px;\r\n  border-radius: 999px;\r\n  background: #1b2029;\r\n  color: #9fb3c8;\r\n}\r\n.asone-panel .chan-badge.ok { background: #17301f; color: #5fbf7d; }\r\n.asone-panel .chan-badge.bad { background: #33191a; color: #e0685f; }\r\n.asone-panel .chan-badge.off { background: #2a2418; color: #d9a441; }\r\n\r\n.asone-panel .chan-sub { color: var(--dim); font-size: 12px; }\r\n\r\n/* \u5A13\u72BB\u4EBE\u6924\u7538\u300A\u95AE\u3125\u59E9\u6D63\u6EC6\uE511:ModelsPage \u701B\u612D\u7223\u68F0\u6A3F\uE511 action \u93C8\uE045\u5E34\u7EFE?\u6FB9\u866B\u6E6D\u6D7C?,\u6924\u7538\u6F70\u9350\u546E\u8986\u93CC?   \u6D93?Nexus \u701B\u612D\u7223\u68F0\u6A3F\uE511\u9359\u5D07\uE06C\u9354\u3124\u7D94\u9356?act-note / act-btn)\u935A\u5C7E\uE0D9\u9428\u52EB\u57DB\u93C2\u7248\u6F6F */\r\n.asone-panel .chan-action { display: flex; align-items: center; gap: 10px; justify-content: flex-end; margin-bottom: 2px; }\r\n\r\n/* \u7490\uFE40\u5F7F\u9357\u2033\u3054(ProviderCard / SenseNovaPanel \u934F\u8FA9\u6564) */\r\n.asone-panel .acct-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }\r\n.asone-panel .acct-head h3 { margin: 0; font-size: 16px; color: #dfe3ea; }\r\n.asone-panel .who { display: flex; align-items: center; gap: 8px; }\r\n.asone-panel .who h3 { margin: 0; font-size: 16px; color: #dfe3ea; }\r\n.asone-panel .badges { display: flex; gap: 6px; flex-wrap: wrap; }\r\n.asone-panel .acct-side { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\r\n.asone-panel .acct-side b { font-size: 13px; color: #dfe3ea; font-variant-numeric: tabular-nums; }\r\n.asone-panel .acct-cta { margin-top: 10px; }\r\n.asone-panel .warn-line { color: #d9a441; }\r\n\r\n/* \u7490\uFE40\u5F7F\u9418\u8235\u20AC\u4F78\u6E3E\u9410?\u6D60\u546E\u7B2D\u95AC\u64BB\u3009\u6D63\u6EC5\u6564\u9369\u71B7\u5534;\u6D93\u5D85\u59E9 ModelTable \u7459\u55DA\uE74E\u9352\u6943\u6B91\u93C2\u56E8\u6E70 .dot) */\r\n.asone-panel .chan-page .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex: none; }\r\n.asone-panel .chan-page .dot.ok { background: #22a06b; }\r\n.asone-panel .chan-page .dot.bad { background: #d92d20; }\r\n.asone-panel .chan-page .dot.off { background: #4b5563; }\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u7F01\u71B6\u7AF4\u7490\uFE40\u5F7F\u9418\u8235\u20AC\u4F7D\uE511(Trae / WorkBuddy / Qoder / SenseNova \u9365\u6D98\uE629\u934F\u8FA9\u6564) \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\r\n   \u9417\u581D\u7D21\u9422\u8FA9\u6564\u93B4?2026-10-30 \u7039\u6C2D\uE50D:\u6D93\u20AC\u6D93\uE047\u5904\u9359\u8702\u7AF4\u6D93\uE045\uE50B(\u6FB6\u6C33\u5904\u9359\u5CF0\u6C28\u6FB6\u6C2B\u91DC\u5997?\u6D93\u5D85\u608E\u9A9E?,\r\n   \u5997\u55D7\u5534\u5BB8\uFE3E\u6564\u93B4\u5CF0\u6095\u9286\u4F78\u5F78\u9353\u2540\u7D91\u7EC9\uE21A\u578E/\u9352\u7248\u6E61\u9286?   \u9352\u950B\u67CA\u93B8\u5910\u6333 2026-10-30 \u7ED7\uE0FF\u7C29\u675E\uE1BB\u7B02\u7EC9\u8BF2\u57CC**\u701B\u612D\u7223\u68F0\u6A3F\uE511\u9359\u5D07\uE06C**(\u7459?ModelsPage.tsx),\r\n   \u7490\uFE40\u5F7F\u752F\uFE42\u5677\u9359\uE044\u58BF\u7490\uFE40\u5F7F\u5997?\u93B5\u20AC\u6D60\u30E4\u7B09\u9350\u5D89\u6E36\u7455?`.acct-band` \u9428\u52EB\u5F78\u6E1A\u0444\u722E\u9286?   SenseNova \u6D93\u20AC\u6D93\uE047\u5904\u9359\u75AF\uE6E6\u93BD\u55D5\u88B1\u6D93\u5909\u91DC\u59F9?\u5BF0\u754C\u73F7\u93C0\u53E5\u7B09\u6D93\u5B2A\u6C28\u93B9\u3223\uE511 \u9225\u65BA\u20AC?\u7039\u4F78\u5F72\u7481\u2542\uE50B\u9359\u6A40\u73EE,\r\n   \u6D94\u71B6\u7B09\u9473\u82A5\u59B8\u5BF0\u754C\u73F7\u9358\u5B2A\u56AD\u5997\u55D7\uE63B(\u95AD\uFF46\u7271\u93C1\u677F\u74E7\u6D7C\u6C33\uE766\u7441\u4F79\u5E00,\u7EDB\u5909\u7C2C\u5A0C\u2103\u6A09\u7EC0?\u9286?*/\r\n.asone-panel .acct-cards {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n}\r\n.asone-panel .acct-card { padding: 14px 16px; }\r\n.asone-panel .acct-row {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px 12px;\r\n  flex-wrap: wrap;\r\n}\r\n.asone-panel .acct-row-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto; }\r\n.asone-panel .acct-name {\r\n  font-size: 15px;\r\n  /* \u9422\u3126\u57DB\u935A\u5D85\u59DE\u7EEE?\u9422\u3126\u57DB 2026-10-30 \u7039\u6C2D\uE50D):\u6D93\u20AC\u741B\u5C84\u5677\u93C8\u20AC\u7487\u30E5\u539B\u741A\uE0A5\uE17B\u9351\u70D8\u6F75\u9428\u52EC\u69F8\u9286\u5C83\u7E56\u93C4\uE21D\u769D\u9428\u52EE\u5904\u9359\u67AB\u20AC?\r\n     \u9359\u5145\u6676\u95AD\uFF45\u5691\u6D93\uE044\u7A98\u7ED4\u72B3\u669F\u701B\u6940\u5F3D\u9470\u5C7E\u69F8\u7ED7\uE0FF\u7C29\u942A\u95F4\u4FCA\u93AD\uE218\u20AC?*/\r\n  font-weight: 700;\r\n  color: #eef2f8;\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n.asone-panel .acct-row-right { display: flex; align-items: center; gap: 8px; flex: none; }\r\n.asone-panel .acct-row-right .chan-badge b { font-variant-numeric: tabular-nums; font-weight: 600; }\r\n\r\n/* \u59AF\u2033\u7037\u741B\u3127\u6B91\u9359\uE047\uE1F0\u9352?Qoder \u6769\u6B11\u88AB\u93C8\uE046\u6AE5\u7481\u62CC\uE511\u6D93\u5D86\u619C\u6748\u64B3\u53C6\u5997? */\r\n.asone-panel .plain-cell { color: #9fb3c8; font-size: 12px; font-variant-numeric: tabular-nums; }\r\n\r\n/* \u5A13\u72BB\u4EBE\u6924\u5178\u5BCC\u93B8\u5910\u6333(Nexus ProviderCard \u935A\u5C7E\uE0D9;\u6D93\u5D86\u657C\u9354\u3126\u68E6\u93C8?.btn) */\r\n.asone-panel .chan-page .btn.primary { background: #1d3550; }\r\n.asone-panel .chan-page .btn.primary:hover:not(:disabled) { background: #24425f; }\r\n\r\n/* \u95AB\u6C31\u6564\u7F03\u621E\u7278\u741B?\u9351\uE15F\u5D41 / \u68F0\u6FC6\u5BB3 / \u7490\uFE40\u5F7F\u7EE0\uFF04\u608A / \u6769\u70BA\u20AC\u6C2D\u20AC\u0443\u53E1\u9422? */\r\n.asone-panel .grid { width: 100%; border-collapse: collapse; margin: 8px 0; }\r\n.asone-panel .grid th, .asone-panel .grid td { border-bottom: 1px solid var(--border); padding: 7px 6px; font-size: 13px; text-align: left; }\r\n.asone-panel .grid th { background: #1b2029; color: #9fb3c8; font-weight: 600; }\r\n.asone-panel .grid th.num, .asone-panel .grid td.num { text-align: right; font-variant-numeric: tabular-nums; }\r\n.asone-panel .grid td.sub { color: var(--dim); }\r\n.asone-panel .th-note { margin-left: 6px; color: #6b7484; font-weight: 400; }\r\n\r\n/* SenseNova \u7490\uFE40\u5F7F\u9357?+ \u7EC9\uE21A\u578E\u59F9?\u95AB\u6C31\u6564\u59F9\u72B5\u4F20 / \u6D93\u64B3\u7758\u59F9\u72B3\uE7F6)\r\n   \u923F\u72C5\u7B0D 2026-10-23:\u6DC7\u6FC7\u5BD4\u9357\u2033\uE194 420px \u74A7?\u9422\u3126\u57DB\u7455\u4F79\u7730\u6D93\u5D85\u5E07\u7ED0\u52EB\u5D31\u9417\u56E7\uE1F1\u9477\u5B58\u7271\u5BEE\u5FDB\u654A\u6D94?\u9286?   **\u5BEE\u89C4\u20AC\u0443\u7AF7\u705E\u20AC**:`repeat(auto-fill, minmax(420px, 1fr))` \u93C8\uE103\u97E9\u704F\u53D8\u7D30\u9366\u3129\u3009\u95C8\u3220\uE194\u6434?   \u74D2\u51B2\uE644\u93C3\u8235\u6581 3 \u5BEE\u72B2\u5D1F\u741B\u5C7B\u20AC\u4F78\uE194\u6434\uFE3F\u7B09\u74D2\u866B\u6902\u9477\uE044\u59E9\u93B9\u3223\uE511 \u9225\u65BA\u20AC?\u9354\u72B2\uE194 .content \u9359\uE045\u69F8\u7481\u253F\u20AC\u5C83\u51BB\u6FB6\u71B4\u20AC?   \u9428\u52EF\u68EC\u59B2\u6D98\u6E6A\u699B\u6A3F\uE17B\u7ED0\u6940\u5F5B\u6D93\u5B2A\u6C28\u6748\u60E7\u57CC(3\u8133420 + 2\u813316 = 1292px \u922E?\u9350\u546D\uE190\u9356?\u9286?*/\r\n.asone-panel .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }\r\n\r\n.asone-panel .pools {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\r\n  gap: 12px;\r\n  margin: 12px 0 0;\r\n}\r\n.asone-panel .pool {\r\n  position: relative;\r\n  overflow: hidden;\r\n  display: flex;\r\n  flex-direction: column;\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 12px 12px 10px;\r\n  background: #12151a;\r\n}\r\n.asone-panel .pool-accent { position: absolute; inset: 0 0 auto 0; height: 2px; }\r\n.asone-panel .pool.general .pool-accent { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }\r\n.asone-panel .pool.special .pool-accent { background: linear-gradient(90deg, #f97316, #fb923c); }\r\n.asone-panel .pool-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }\r\n.asone-panel .pool-head strong { color: var(--text-soft); font-size: 12px; }\r\n.asone-panel .pdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }\r\n.asone-panel .pool.general .pdot { background: #a78bfa; box-shadow: 0 0 0 2px #241d3d; }\r\n.asone-panel .pool.special .pdot { background: #fb923c; box-shadow: 0 0 0 2px #2e2118; }\r\n.asone-panel .row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 11px; color: var(--dim); margin: 8px 0 4px; }\r\n.asone-panel .row-label { flex: none; }\r\n.asone-panel .row-val { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }\r\n.asone-panel .row-val b { font-size: 15px; color: #dfe3ea; font-variant-numeric: tabular-nums; font-weight: 600; }\r\n.asone-panel .row-val .pct { color: #9fb3c8; font-size: 11px; font-variant-numeric: tabular-nums; }\r\n.asone-panel .row.split { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }\r\n.asone-panel .bar { height: 5px; background: #1b2029; border-radius: 999px; overflow: hidden; }\r\n.asone-panel .bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }\r\n.asone-panel .pool.general .bar-fill { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }\r\n.asone-panel .pool.special .bar-fill { background: linear-gradient(90deg, #f97316, #fb923c); }\r\n.asone-panel .pool.cooling .bar-fill { background: #4b5563; }\r\n.asone-panel .grant, .asone-panel .reset-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 7px;\r\n  min-height: 30px;\r\n  box-sizing: border-box;\r\n  margin-top: auto;\r\n  padding: 0 2px;\r\n  border-radius: 8px;\r\n  font-size: 11px;\r\n  color: var(--dim);\r\n}\r\n.asone-panel .grant b { color: #dfe3ea; font-size: 13px; font-variant-numeric: tabular-nums; }\r\n.asone-panel .g-label { flex: 1 1 auto; }\r\n.asone-panel .reset-row { justify-content: space-between; padding: 0 2px; }\r\n.asone-panel .r-label { flex: none; }\r\n.asone-panel .r-val { color: var(--text-soft); font-variant-numeric: tabular-nums; white-space: nowrap; }\r\n\r\n/* \u6924\u4F43\u527C\u7487\u5B58\u69D1 */\r\n.asone-panel .foot { margin-top: 0; }\r\n\r\n/* ===========================================================================\r\n   \u95AB\u660F\u7DEB\u59AF\u2033\u7037\u701B\u6130\u3009(LogicalModelsPage)\u6D93\u30E6\u7278\u6FB6\u5D85\u57E2 Nexus LogicalModels.vue \u9428?scoped\r\n   \u93CD\u5CF0\u7D21 \u9225\u65BA\u20AC?\u6D93\u5A43\u67DF .rows/.rowCard/.rowBtn/.addButton/.editor \u7EDB\u5910\u20AC\u6C31\u6564\u9367\u6943\u6571\u6E1A\u6D98\u7C32\u935F\u55DB\u3009\u7EDB?   \u934F\u8FA9\u6564,\u6D93\u5D88\u5158\u93C0?\u6769\u6B13\u5677\u7035?.lm-section \u6D63\u6EC5\u6564\u9369\u71B7\u5534\u9428\u52EB\u6A0A\u5BEE\u509A\u4EDB Nexus \u935A\u5C7D\u20AC\u8270\uE6EB\u9429\u6825\u20AC?   =========================================================================== */\r\n\r\n/* ul.rows:Nexus gap 8px(\u95AB\u6C31\u6564\u9367\u6941\u69F8\u6E1A\u6D98\u7C32\u935F\u55DB\u3009\u9428?10px) */\r\n.asone-panel .lm-section .rows {\r\n  gap: 8px;\r\n}\r\n\r\n/* li.rowCard:Nexus \u6748?var(--border) / \u6434?#161a20 / gap 12px */\r\n.asone-panel .lm-section .rowCard {\r\n  border-color: var(--border);\r\n  background: #161a20;\r\n  gap: 12px;\r\n}\r\n\r\n/* rowHead \u95C2\u78CB\u7A9B 10px */\r\n.asone-panel .lm-section .rowHead {\r\n  gap: 10px;\r\n}\r\n\r\n/* rowName \u741B\u5C84\u73EE 22px */\r\n.asone-panel .lm-section .rowName {\r\n  line-height: 22px;\r\n}\r\n\r\n/* rowActions \u95C2\u78CB\u7A9B 4px */\r\n.asone-panel .lm-section .rowActions {\r\n  gap: 4px;\r\n}\r\n\r\n/* rowBtn:\u9366\u55DA\uE757 4px / \u9350\u5470\u7A9B 0 10px / \u6748?var(--border) / \u701B\u6944\u58CA var(--text-soft);hover \u6434?var(--dsw-alias-interactive-bg-hover, #1f2732) */\r\n.asone-panel .lm-section .rowBtn {\r\n  border-radius: 4px;\r\n  padding: 0 10px;\r\n  border-color: var(--border);\r\n  color: var(--text-soft);\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .rowBtn:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover, #1f2732);\r\n}\r\n\r\n/* addButton:\u94CF\u6C31\u568E\u6748?var(--border) / \u6434?#161a20 / margin-top 8px(\u6D93?.rows \u741B\u5C83\u7A9B\u6D93\u20AC\u9477? */\r\n.asone-panel .lm-section .addButton {\r\n  border-color: var(--border);\r\n  background: #161a20;\r\n  margin-top: 8px;\r\n  line-height: 22px;\r\n}\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u7F02\u682C\u7DEB\u9363?Nexus LogicalModelEditor.vue scoped \u935A\u5C7D\u20AC? \u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC */\r\n\r\n/* Nexus \u7F02\u682C\u7DEB\u9363\u3125\u53CF\u95AE?.input \u934A?\u6434?var(--bg-deep) / \u6748?var(--border) / \u701B\u6944\u58CA var(--text-soft) /\r\n   \u701B\u6940\u5F7F 14px / \u741B\u5C84\u73EE 22px / \u9471\u6C31\u528D\u6748?#5686fe(\u95AB\u6C31\u6564 .input \u93C4\uE21E\u3009\u95C8\u3220\u53CF\u705E\u20AC 13px \u9359\u6A40\u567A\u9417? */\r\n.asone-panel .lm-section .editor .input {\r\n  width: 100%;\r\n  height: 32px;\r\n  padding: 0 10px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  background: var(--bg-deep);\r\n  color: var(--text-soft);\r\n  font: inherit;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n}\r\n.asone-panel .lm-section .editor .input::placeholder {\r\n  color: #5c6673;\r\n}\r\n.asone-panel .lm-section .editor .input:focus {\r\n  border-color: #5686fe;\r\n  outline: none;\r\n}\r\n.asone-panel .lm-section .editor .input.inputBad {\r\n  border-color: #e0685f;\r\n}\r\n.asone-panel .lm-section .editor .input.inputBad:focus {\r\n  border-color: #e0685f;\r\n}\r\n.asone-panel .lm-section .editor .input:disabled {\r\n  opacity: 0.6;\r\n  cursor: default;\r\n}\r\n.asone-panel .lm-section .editor .selectInput {\r\n  cursor: pointer;\r\n}\r\n\r\n/* fieldLabel / fieldNote / fieldWarn / fieldValue:Nexus \u9479\u8E6D\u7B0C\u741B\u5C84\u73EE */\r\n.asone-panel .lm-section .editor .fieldLabel {\r\n  color: var(--dim);\r\n  font-weight: 500;\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .editor .fieldValue {\r\n  color: var(--text-soft);\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n}\r\n.asone-panel .lm-section .editor .fieldNote {\r\n  color: #5c6673;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .editor .fieldWarn {\r\n  color: var(--dim);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .editor .fieldWarn b {\r\n  color: var(--text-soft);\r\n  font-weight: 500;\r\n}\r\n\r\n/* chainHead:\u5997\uFF49\u647C\u704F\u5FDA\u59AD\u6FB6?\u6924\u7538\u6F70\u59DD\u3085\u58A0\u93C8\uE045\u8986\u93CC\u64B9\uE1DA class) */\r\n.asone-panel .chainHead {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n}\r\n\r\n/* nodeRow \u9350?.input \u9428?width:100% \u6D7C\u6C33\uE180\u741B\u5C7E\u5B69\u9351\u54C4\u5D31\u9417?\u8E47\u5474\u300F\u74A7\u3223\u7E43\u7039?Nexus \u935A\u5C7D\u20AC? */\r\n.asone-panel .lm-section .editor .nodeRow .nodeProvider {\r\n  width: 150px;\r\n  flex: 0 0 150px;\r\n}\r\n.asone-panel .lm-section .editor .nodeRow .nodeSelect {\r\n  width: auto;\r\n  flex: 1 1 0;\r\n  min-width: 0;\r\n}\r\n\r\n/* groupIdx \u701B\u6944\u58CA var(--text-soft)(\u95AB\u6C31\u6564\u9367\u6941\u69F8 --text) */\r\n.asone-panel .lm-section .editor .groupIdx {\r\n  color: var(--text-soft);\r\n}\r\n\r\n/* addModelButton:\u93C2\u7845\uE757 4px / \u6748?var(--border) / \u6434\u66E2\u20AC\u5FD4\u69D1 / hover \u6434?var(--dsw-alias-interactive-bg-hover, #1f2732) */\r\n.asone-panel .lm-section .editor .addModelButton {\r\n  border: 1px solid var(--border);\r\n  border-radius: 4px;\r\n  height: 28px;\r\n  padding: 0 10px;\r\n  color: var(--text-soft);\r\n  font: inherit;\r\n  cursor: pointer;\r\n  background: none;\r\n  align-self: flex-start;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .editor .addModelButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover, #1f2732);\r\n  border-color: var(--border);\r\n}\r\n.asone-panel .lm-section .editor .addModelButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n/* iconButton:\u701B\u6944\u58CA var(--dim) / hover \u6434?var(--dsw-alias-interactive-bg-hover, #1f2732) + \u701B?var(--text-soft);\u9357\u904D\u6AD3\u5997?hover \u701B?#e0685f */\r\n.asone-panel .lm-section .editor .iconButton {\r\n  color: var(--dim);\r\n  cursor: pointer;\r\n  border: none;\r\n  background: none;\r\n  border-radius: 4px;\r\n  padding: 2px 6px;\r\n  font-size: 12px;\r\n  flex-shrink: 0;\r\n}\r\n.asone-panel .lm-section .editor .iconButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover, #1f2732);\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .lm-section .editor .iconButtonDanger:hover:not(:disabled) {\r\n  color: #e0685f;\r\n}\r\n.asone-panel .lm-section .editor .iconButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n/* primaryButton / secondaryButton:Nexus 36px / \u9366\u55DA\uE757 6px / \u9350\u5470\u7A9B 0 14px /\r\n   \u701B?14px \u741B\u5C84\u73EE 22px;\u6D93\u5A5A\u6333\u6434?var(--dsw-alias-button-info-fill, #2f4d6b) hover #3a5d80,\u9353\uE21E\u6333\u95AB\u5FD4\u69D1\u6434?+ \u6748?var(--border) */\r\n.asone-panel .lm-section .editor .primaryButton,\r\n.asone-panel .lm-section .editor .secondaryButton {\r\n  box-sizing: border-box;\r\n  height: 36px;\r\n  padding: 0 14px;\r\n  border-radius: 6px;\r\n  font: inherit;\r\n  cursor: pointer;\r\n  display: inline-flex;\r\n  justify-content: center;\r\n  align-items: center;\r\n  gap: 4px;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n}\r\n.asone-panel .lm-section .editor .primaryButton {\r\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  border: none;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .lm-section .editor .primaryButton:hover:not(:disabled) {\r\n  background: #3a5d80;\r\n}\r\n.asone-panel .lm-section .editor .secondaryButton {\r\n  border: 1px solid var(--border);\r\n  color: var(--text-soft);\r\n  background: none;\r\n}\r\n.asone-panel .lm-section .editor .secondaryButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-interactive-bg-hover, #1f2732);\r\n  border-color: var(--border);\r\n}\r\n.asone-panel .lm-section .editor .primaryButton:disabled,\r\n.asone-panel .lm-section .editor .secondaryButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n/* ===========================================================================\r\n   \u934F\u6735\u7CAC\u6E1A\u6D98\u7C32\u935F\u55DB\u3009(ProvidersPage):\u95AB\u612D\u6F6F\u9413\u0444\u60C9 Nexus panel/web/src/Providers.vue \u9428?   \\3c style scoped>(L1005-1261)\u9286\u509C\u88AB\u935A\u5D85\u53CF\u95AE\u3125\u59DE .pv- \u9353\u5D87\u7D11\u6D60\u30E5\u53A4\u6D93?As One \u941C\u7248\u6E41\u93CD\u5CF0\u7D21\u9350\u832C\u734A,\r\n   \u68F0\u6EC6\u58CA / \u704F\u54C4\uE1ED / \u95C2\u78CB\u7A9B / \u9366\u55DA\uE757 / \u6748\u89C4\uE50B / \u701B\u6945\u5678\u95AB\u612C\u74E7\u6DC7\u6FC8\u6680(\u93C6\u6944\u58CA\u9369\u9E3F\u769F\u6D93\u5EA3\u5E47\u93C8\u5910\u3009\u95C8\uE76D\u7AF4\u9477?\u9286?   =========================================================================== */\r\n\r\n/* \u752F\u51A8\u772C\u7035\u572D\u53CE dsh \u9428\u52EA\u7DF5\u6434\u65BF\u6662\u9357\uFF04\u5896:\u6FB6\u6827\u7730\u6D93\u20AC\u741B\u5C7D\u3054 + \u9350\u546D\u7975\u940F\u4F34\u6F70\u93C9?\u701B\u6941\uE18C / \u59AF\u2033\u7037\u9429\uE1BC\u7D8D) */\r\n.asone-panel .pv-section {\r\n  max-width: 720px;\r\n  color: var(--text-soft);\r\n  flex-direction: column;\r\n  gap: 12px;\r\n  display: flex;\r\n}\r\n.asone-panel .pv-title { color: var(--text-soft); margin: 0; font-size: 16px; font-weight: 500; line-height: 24px; }\r\n.asone-panel .pv-intro { color: var(--dim); margin: 0; font-size: 14px; line-height: 22px; }\r\n.asone-panel .pv-err { color: #e0685f; font-size: 12px; line-height: 18px; }\r\n.asone-panel .pv-savedNotice { color: #5fbf7d; font-size: 12px; line-height: 18px; margin: 0; }\r\n/* As One \u93C2\u677F\uE583:API \u7035\u55DB\u631C\u6748\u64B3\u53C6\u5997\u55D5\u7B05\u95C8\u3224\u5045\u741B\u5C7B\u20AC\u5C7D\u7611\u95BD\u30E7\u6571\u9351\uE15F\u5D41\u705E\u509C\uE178\u941E\u55D0\u20AC\u5D88\uE1E9\u93C4?\u6FC2\u6220\u5BB3\u93C3\u72B2\u5553\u7035\u55DB\u631C\u93BA\u30E5\u5F5B)\u9286?*/\r\n.asone-panel .pv-hint { color: var(--dim); margin: 0; font-size: 12px; line-height: 18px; }\r\n\r\n/* \u9357\uFF04\u5896 */\r\n.asone-panel .pv-rows { flex-direction: column; gap: 10px; margin: 12px 0 0; padding: 0; list-style: none; display: flex; }\r\n.asone-panel .pv-rowCard {\r\n  border: 1px solid var(--border);\r\n  background: #161a20;\r\n  border-radius: 10px;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  padding: 12px 14px;\r\n  display: flex;\r\n}\r\n.asone-panel .pv-rowHead { align-items: center; gap: 8px; display: flex; }\r\n.asone-panel .pv-rowName { color: var(--text-soft); font-size: 14px; font-weight: 500; line-height: 22px; }\r\n.asone-panel .pv-credentialDot { flex: none; width: 8px; height: 8px; border-radius: 50%; display: inline-block; }\r\n.asone-panel .pv-dotOk { background: #22a06b; }\r\n.asone-panel .pv-dotMissing { background: #d92d20; }\r\n.asone-panel .pv-rowActions { align-items: center; gap: 8px; margin-left: auto; display: inline-flex; }\r\n.asone-panel .pv-cardFooter { justify-content: flex-end; gap: 8px; }\r\n.asone-panel .pv-rowBtn {\r\n  border-radius: 6px;\r\n  height: 28px;\r\n  padding: 0 12px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  cursor: pointer;\r\n  border: 1px solid var(--border);\r\n  background: transparent;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .pv-rowBtn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #1f2732); }\r\n.asone-panel .pv-rowBtn.pv-rowBtnDanger { color: #e0685f; }\r\n.asone-panel .pv-rowBtn:disabled { opacity: 0.4; cursor: default; }\r\n\r\n/* \u9350\u546D\u7730\u95C8\u3221\u6F98 */\r\n.asone-panel .pv-panel {\r\n  background: #1b2029;\r\n  border: 1px solid #232a34;\r\n  border-radius: 8px;\r\n  padding: 12px;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n  display: flex;\r\n}\r\n.asone-panel .pv-panelTitle { color: var(--text-soft); font-size: 13px; font-weight: 500; line-height: 20px; margin-bottom: 2px; }\r\n.asone-panel .pv-fieldLabel { color: var(--dim); font-size: 12px; font-weight: 500; line-height: 18px; margin-top: 4px; }\r\n\r\n/* \u59AF\u2033\u7037\u9429\uE1BC\u7D8D */\r\n.asone-panel .pv-catalogSection { flex-direction: column; gap: 6px; display: flex; }\r\n.asone-panel .pv-catalogTitle { color: var(--dim); font-size: 12px; font-weight: 500; line-height: 18px; }\r\n.asone-panel .pv-modelListHead { justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 2px; display: flex; }\r\n.asone-panel .pv-modelCatalogMeta, .asone-panel .pv-modelEmpty { color: #5c6673; margin: 0; font-size: 12px; line-height: 18px; }\r\n.asone-panel .pv-headActions { align-items: center; gap: 2px; display: inline-flex; }\r\n.asone-panel .pv-modelList { flex-direction: column; gap: 8px; display: flex; }\r\n.asone-panel .pv-modelEntry {\r\n  border: 1px solid var(--border);\r\n  background: #161a20;\r\n  border-radius: 8px;\r\n  padding: 8px;\r\n  gap: 6px;\r\n  display: flex;\r\n  flex-direction: column;\r\n}\r\n.asone-panel .pv-modelRow {\r\n  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;\r\n  align-items: center;\r\n  gap: 6px;\r\n  display: grid;\r\n}\r\n.asone-panel .pv-modelAdvanced { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 2px 2px 0; display: grid; }\r\n.asone-panel .pv-modelField { flex-direction: column; gap: 4px; min-width: 0; display: flex; }\r\n.asone-panel .pv-modelInputTypes { border: none; grid-column: 1 / -1; min-width: 0; margin: 0; padding: 0; }\r\n.asone-panel .pv-modelInputTypes legend { margin-bottom: 4px; padding: 0; }\r\n.asone-panel .pv-modelInputChoices { flex-wrap: wrap; align-items: center; gap: 16px; min-height: 32px; display: flex; }\r\n.asone-panel .pv-modelFieldLabel { color: var(--dim); font-size: 12px; line-height: 18px; }\r\n.asone-panel .pv-modelEmpty { border: 1px dashed var(--border); border-radius: 8px; text-align: center; padding: 12px; }\r\n\r\n/* \u6748\u64B3\u53C6 */\r\n.asone-panel .pv-input {\r\n  box-sizing: border-box;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  width: 100%;\r\n  height: 32px;\r\n  font: inherit;\r\n  background: var(--bg-deep);\r\n  color: var(--text-soft);\r\n  padding: 0 10px;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n}\r\n.asone-panel .pv-input::placeholder { color: #5c6673; }\r\n.asone-panel .pv-input:focus { border-color: #5686fe; outline: none; }\r\n.asone-panel .pv-input:disabled { opacity: 0.6; cursor: default; }\r\n.asone-panel .pv-selectInput { cursor: pointer; max-width: 280px; }\r\n\r\n/* \u93B8\u5910\u6333 */\r\n.asone-panel .pv-primaryButton, .asone-panel .pv-secondaryButton {\r\n  box-sizing: border-box;\r\n  border-radius: 6px;\r\n  height: 36px;\r\n  font: inherit;\r\n  cursor: pointer;\r\n  border: none;\r\n  justify-content: center;\r\n  align-items: center;\r\n  gap: 4px;\r\n  padding: 0 14px;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  display: inline-flex;\r\n}\r\n.asone-panel .pv-primaryButton { background: var(--dsw-alias-button-info-fill, #2f4d6b); color: var(--text-soft); }\r\n.asone-panel .pv-primaryButton:hover:not(:disabled) { background: #3a5d80; }\r\n.asone-panel .pv-secondaryButton { border: 1px solid var(--border); color: var(--text-soft); background: none; }\r\n.asone-panel .pv-secondaryButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #1f2732); }\r\n.asone-panel .pv-primaryButton:disabled, .asone-panel .pv-secondaryButton:disabled { opacity: 0.4; cursor: default; }\r\n\r\n/* \u9286\u5C7E\u574A\u9354\u72AE\u20AC\u5D86\u5BDC\u95BD?= \u6D93\u20AC\u93C1\u6751\u6F61\u94CF\u6C31\u568E\u9357\uFF04\u5896(\u6D93?LogicalModels.vue \u935A\u5C7C\u7AF4\u6FC2\u6941\u7271\u5BEE?\u7035\u572D\u53CE dsh \u9428\u52EC\u574A\u9354\u72B2\u5D31):\r\n   \u6942\u6A3A\u5BB3 54px / \u9366\u55DA\uE757 10px / \u6434\u66E1\u58CA\u6D93?.pv-rowCard \u6D93\u20AC\u9477?\u922B?\u6D93\u5E9D\u7B02\u95C8\u3222\u6B91\u9357\uFF04\u5896\u6D93\u20AC\u93CD\u5CF0\u3047\u9286?*/\r\n.asone-panel .pv-addButton {\r\n  box-sizing: border-box;\r\n  flex: none;\r\n  width: 100%;\r\n  border: 1px dashed var(--border);\r\n  border-radius: 10px;\r\n  background: #161a20;\r\n  height: 54px;\r\n  margin-top: 10px; /* \u6D93?.pv-rows \u9428\u52EE\uE511\u74BA\u6FC5\u7AF4\u9477?*/\r\n  color: var(--text-soft);\r\n  font: inherit;\r\n  cursor: pointer;\r\n  justify-content: center;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 0 14px;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  display: flex;\r\n}\r\n.asone-panel .pv-addButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #1f2732); border-color: #3b4756; }\r\n.asone-panel .pv-addButton:disabled { opacity: 0.4; cursor: default; }\r\n.asone-panel .pv-linkButton {\r\n  border-radius: 4px;\r\n  height: 28px;\r\n  color: var(--dim);\r\n  cursor: pointer;\r\n  background: none;\r\n  border: none;\r\n  align-items: center;\r\n  padding: 0 8px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  display: inline-flex;\r\n}\r\n.asone-panel .pv-linkButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #1f2732); color: var(--text-soft); }\r\n.asone-panel .pv-linkButton:disabled { opacity: 0.4; cursor: default; }\r\n.asone-panel .pv-addModelButton {\r\n  box-sizing: border-box;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  color: var(--text-soft);\r\n  font: inherit;\r\n  cursor: pointer;\r\n  background: none;\r\n  align-self: flex-start;\r\n  align-items: center;\r\n  gap: 4px;\r\n  padding: 0 10px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  display: inline-flex;\r\n}\r\n.asone-panel .pv-addModelButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #1f2732); }\r\n.asone-panel .pv-addModelButton:disabled { opacity: 0.4; cursor: default; }\r\n\r\n.asone-panel .pv-iconButton {\r\n  background: none;\r\n  border: none;\r\n  color: var(--dim);\r\n  cursor: pointer;\r\n  padding: 2px 6px;\r\n  font-size: 12px;\r\n  flex-shrink: 0;\r\n  border-radius: 4px;\r\n}\r\n.asone-panel .pv-iconButton:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #1f2732); color: var(--text-soft); }\r\n.asone-panel .pv-iconButton.pv-iconButtonDanger:hover:not(:disabled) { color: #e0685f; }\r\n.asone-panel .pv-choice { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }\r\n/* Nexus \u9358\u71B6\u8D1F\u934F\u3125\u772C `input[type="checkbox"]`;\u6769\u6B13\u5677\u93B8?.pv- \u6D63\u6EC5\u6564\u9369\u71B8\u6579\u7ED0\u52EB\u57CC\u93C8\uE104\u3009\u6D93\u3084\u91DC\u9355\u9E43\u20AC\u5909\u7D85\r\n   (\u6748\u64B3\u53C6\u7EEB\u8BF2\u7037 / \u95AB\u590B\u5AE8\u9363\u3125\u20AC\u6B13\u20AC\u5910\u300D),\u95AC\u57AE\u53A4\u8930\u535E\u6437\u934F\u6735\u7CAC\u6924\u7538\u6F70\u9286?*/\r\n.asone-panel .pv-choice input[type="checkbox"],\r\n.asone-panel .pv-candidateLabel input[type="checkbox"] { accent-color: #5686fe; }\r\n\r\n/* \u95AB\u590B\u5AE8\u9363\u3125\u810A\u7ED0?*/\r\n.asone-panel .pv-mask {\r\n  position: fixed;\r\n  inset: 0;\r\n  background: rgba(0, 0, 0, 0.55);\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  z-index: 50;\r\n}\r\n.asone-panel .pv-dialog {\r\n  width: 520px;\r\n  max-width: calc(100vw - 32px);\r\n  max-height: calc(100vh - 64px);\r\n  overflow: auto;\r\n  background: #161a20;\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 16px 18px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n}\r\n.asone-panel .pv-dialogTitle { margin: 0; font-size: 15px; font-weight: 500; color: var(--text-soft); }\r\n.asone-panel .pv-dialogDesc { margin: 0; font-size: 13px; color: var(--dim); }\r\n.asone-panel .pv-candidateToolbar { align-items: center; gap: 8px; margin-bottom: 6px; display: flex; }\r\n.asone-panel .pv-candidateSearch { flex: 240px; min-width: 0; }\r\n.asone-panel .pv-candidateList {\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  max-height: 320px;\r\n  margin: 0;\r\n  padding: 0;\r\n  list-style: none;\r\n  display: flex;\r\n  overflow-y: auto;\r\n}\r\n.asone-panel .pv-candidate { border-radius: 6px; }\r\n.asone-panel .pv-candidate:hover { background: var(--dsw-alias-interactive-bg-hover, #1f2732); }\r\n.asone-panel .pv-candidateLabel { cursor: pointer; align-items: center; gap: 8px; padding: 6px 8px; display: flex; }\r\n.asone-panel .pv-candidateId {\r\n  min-width: 0;\r\n  font-family: ui-monospace, Consolas, monospace;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  flex: auto;\r\n  font-size: 13px;\r\n  overflow: hidden;\r\n}\r\n.asone-panel .pv-candidateEmpty { color: var(--dim); text-align: center; margin: 24px 0; font-size: 13px; line-height: 20px; }\r\n.asone-panel .pv-dialogFooter { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }\r\n\r\n/* ===========================================================================\r\n    \u7481\u5267\u7586\u6924\u4F43\u62F7\u9354\u72B3\u7271\u5BEE?Nexus Settings.vue 1:1 \u6FB6\u5D85\u57E2\u95B0\u5D85\uE69C;\u9359\uE047\u62F7\u9354?\u6D93\u5D85\u59E9\u93C3\u3221\u6E41\u7459\u52EB\u57AF)\r\n    =========================================================================== */\r\n\r\n/* \u6924\u975B\u3054 h1(Nexus .ui-page-title) */\r\n.asone-panel .ui-page-title {\r\n  margin: 0 0 4px;\r\n  font-size: 18px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n/* \u93BA\u0442\u6B22(Nexus .ui-input / .ui-select) */\r\n.asone-panel .ui-input,\r\n.asone-panel .ui-select {\r\n  width: 100%;\r\n  box-sizing: border-box;\r\n  height: 32px;\r\n  padding: 0 10px;\r\n  font: inherit;\r\n  font-size: 13px;\r\n  color: var(--text-soft);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n}\r\n.asone-panel .ui-input:focus,\r\n.asone-panel .ui-select:focus {\r\n  outline: none;\r\n  border-color: var(--accent);\r\n}\r\n.asone-panel .ui-input[type="number"] {\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .ui-select {\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-check input[type="checkbox"] {\r\n  accent-color: var(--accent);\r\n  width: auto;\r\n}\r\n\r\n/* \u9419\uE102\u73DB\u93B8\u5910\u6333(Nexus \u7441\u54E5\u88AB .ui-btn-ghost / .ui-btn-danger / .ui-btn-primary) */\r\n.asone-panel .ui-btn-ghost {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: var(--text-soft);\r\n  background: none;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  padding: 0 12px;\r\n  font-size: 12.5px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-btn-ghost:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n  color: var(--text);\r\n}\r\n.asone-panel .ui-btn-ghost:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n.asone-panel .ui-btn-danger {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: var(--bad);\r\n  background: none;\r\n  border: 1px solid transparent;\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  padding: 0 10px;\r\n  font-size: 12px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-btn-danger:hover:not(:disabled) {\r\n  background: rgba(224, 104, 95, 0.12);\r\n}\r\n.asone-panel .ui-btn-danger:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n.asone-panel .ui-btn-primary {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: #fff;\r\n  background: var(--accent);\r\n  border: 1px solid var(--accent);\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  padding: 0 12px;\r\n  font-size: 12.5px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-btn-primary:hover:not(:disabled) {\r\n  filter: brightness(1.12);\r\n}\r\n.asone-panel .ui-btn-primary:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n/* \u95AB\u20AC\u95AC\u630E\u6D38\u7EFE?Nexus .ui-chart-wrap / .ui-chart) */\r\n.asone-panel .ui-chart-wrap {\r\n  margin-top: 10px;\r\n}\r\n.asone-panel .ui-chart {\r\n  display: block;\r\n  width: 100%;\r\n}\r\n\r\n/* \u9357\uFF04\u5896\u6FB6?h2 \u6D93?.ui-card-sub \u9429\u6401\u5066\u93BA\u6391\u7AF7(\u6769\u6A3A\u5E2B Nexus \u9428?flex \u74A7\u98CE\u5063\u752F\u51A8\u772C) */\r\n.asone-panel .ui-card-head {\r\n  justify-content: flex-start;\r\n}\r\n\r\n/* <960px:\u7481\u5267\u7586\u6924\u57AB\u68E4 nav(2026-10-25 m14922 \u7EC9\u5A5A\u6ACE\u6E1A\u0444\u722E),\u9357\uFF04\u5896\u6FB6\u5BF8\u6B91\u704F\u5FD3\u7746\u7459\u52EB\u57AF\u6DC7\u6FC8\u6680 */\r\n@media (max-width: 959px) {\r\n  .asone-panel .ui-layout {\r\n    flex-direction: column;\r\n    gap: 12px;\r\n  }\r\n  .asone-panel .ui-card {\r\n    scroll-margin-top: 90px;\r\n  }\r\n}\r\n\r\n/* ===========================================================================\r\n   SenseNova \u6D93\u64BB\u3009(SenseNovaPage)\u6D93\u30E6\u7278\u6FB6\u5D85\u57E2 Nexus SenseNovaPanel.vue \u9428?scoped CSS\u9286?   \u923F\u72C5\u7B0D \u934F\u3129\u5134\u9354?`.sn-` \u9353\u5D87\u7D11:.row / .bar / .bar-fill / .pill / .grid \u6769\u6B0E\u7C3A\u935A\u5D85\u74E7\u9366?   styles.css \u95B2?*\u5BB8\u53C9\u6E41\u934F\u3125\u772C\u7039\u6C2B\u7B9F**(\u9418\u8235\u20AC\u4F79\u6F6F\u9286\u4E2EodelTable\u9286\u4F79\u7B2D\u95AC\u64BB\u3009\u934F\u8FA9\u6564),\u7441\u54E5\u6564\u6D7C\u6C2B\u7C30\u9429\u544A\u8584\u93CC?\r\n   \u9353\u5D87\u7D11\u9417\u5825\u20AC\u612C\u74E7\u93BC\uE103\u7E4D Nexus \u9428\u52EF\uE581\u9479?\u95C2\u78CB\u7A9B/\u9366\u55DA\uE757,\u6924\u7538\u6F70\u6D93\u5A42\u5F67\u7481\u3085\u58A0\u7F02\u20AC\u9417\u581B\u20AC?   =========================================================================== */\r\n\r\n/* \u7490\uFE40\u5F7F\u9357\u2033\u3054(\u6D93\u5EA2\u7B2D\u95AC\u64BB\u3009 ProviderCard \u934F\u8FA9\u6564\u9428\u52EB\u53CF\u705E\u20AC .acct-head / .who / .badges \u935A\u5C7D\u20AC?\u6D93\u5D89\u5678\u6FB6\u5D85\u757E\u6D94? */\r\n\r\n/* \u7EC9\uE21A\u578E\u59F9\u72B2\u6F61:\u6D93\u3084\u91DC\u59F9?*\u9A9E\u8235\u5E13**\u9286\u509A\u57AA\u7039\u85C9\u57E2\u93B0\u5FD3\u5E07\u7ED0?170px \u74A7?\u9225\u65BA\u20AC?\u6D94\u5B2A\u58A0\u9422?210px,420px \u9428\u52EE\u5904\u9359\u5CF0\u5D31\u95B2?   \u93C0\u53E5\u7B09\u6D93\u5B29\u88B1\u6D93?\u9477\uE044\u59E9\u95AB\u20AC\u9356\u6828\u579A\u6D93\u5A41\u7B05\u936B\u55D7\u5F54,\u9470\u5C7B\u20AC\u5C84\u20AC\u6C31\u6564 vs \u6D93\u64B3\u7758\u9286\u5D86\u6E36\u7487\u30E5\u4EDB\u9428\u52EC\u69F8\u59AF\uE044\u609C\u93BD\u55D7\u6E6A\u6D93\u20AC\u74A7\u5CF0\uE1EE\u59E3\u65BB\u20AC?   \u923F\u72C5\u7B0D `gap: 12px` \u93C4\uE21B\u5BDC\u9359\u509D\u20AC\u51A8\u6D58\u95B2\u5FD3\u56AD\u93C9\u30E7\u6B91:\u7039\u70B4\u7974\u6D93\u3086\u775C\u6FB6\u6828\u90E8\u9429\u6B4C\u7A9B 12px,\u9358\u71B7\u20AC?10px \u6D7C\u6C33\uE180\u7EF1\uE0A3\uE7F6\u6D93\u3085\u6F61\r\n   \u6434\u66E1\u58CA\u9351\u72B1\u7BAE\u7490\u7FE0\u7B02\u9286?*/\r\n.asone-panel .sn-pools {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\r\n  gap: 12px;\r\n  margin: 12px 0 0;\r\n}\r\n/* flex \u9352?+ \u7EDB\u5910\u73EE(\u7F03\u621E\u7278 stretch):\u7481\u253F\u20AC\u5C7E\u693F\u9354\u3125\u6D50\u7039\u6C31\u041D\u9352\u55D0\u20AC\u5D88\u5158\u7490\u7FE0\u7D87\u9357\uFF04\u5896\u6434\u66E2\u5134,\r\n   \u6D93\u3084\u91DC\u59F9\u72B2\u6D1C\u59DD\u3085\u6E6A\u935A\u5C7C\u7AF4\u59D8\u6751\u94A9\u7EFE\u5938\u7B02\u93C0\u8DFA\u71AC\u9286?*/\r\n.asone-panel .sn-pool {\r\n  position: relative;\r\n  overflow: hidden; /* \u7481\u2545\u300A\u95AE\u3128\u58CA\u93C9\xA4\u521B\u935A\u581D\u6E3E\u7459?*/\r\n  display: flex;\r\n  flex-direction: column;\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 12px 12px 10px;\r\n  background: #12151a;\r\n}\r\n/* \u6924\u5815\u5134\u9479\u53C9\u6F6F:\u59E3\u5FD3\u7D36\u59F9\u72B2\u5D31\u6924\u5241\uE06C\u95AD\uFF49\u4EBE\u8930\u2544\u58CA\u7EFE\u88E4\u20AC\u509E\u20AC\u6C31\u6564\u59F9\u72B2\u5F47**\u7EF1?*(violet-500/400),\u6D93\u64B3\u7758\u59F9\u72B2\u5F47\u59D7?   (orange-500/400)\u9286\u5097\u6BB8\u9514?\u6769\u6B0E\u88B1\u7F01\u52EB\u20AC\u517C\u69F8\u6D93\u70D8\u7E41\u9479\u63D2\u7C33\u95AB\u590C\u6B91:\u9359\u509D\u20AC\u51A8\u6D58\u93C4\uE21B\u796C\u6434?\u935A\u5C7C\u7AF4\u7F01\u52EE\u58CA\u9429\u5B58\u5E34\u93BC\uE100\u57CC\r\n   `#12151a` \u6D93\u5A41\u7D30\u7EEF\u5A43\u579A\u6D93\u20AC\u9417?\u9225\u65BA\u20AC?\u6D5C\uE1BD\u3002\u95C4\u5D84\u7AF4\u5997\uFF43\u20AC\u4F80\u30B1\u935C\u5C7D\u5BB3\u9423\u30E9\u6AB7\u93B5\u5D87\u73DB\u5BF0\u693E\u7D87\u9286?*/\r\n.asone-panel .sn-pool-accent { position: absolute; inset: 0 0 auto 0; height: 2px; }\r\n.asone-panel .sn-pool.general .sn-pool-accent { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }\r\n.asone-panel .sn-pool.special .sn-pool-accent { background: linear-gradient(90deg, #f97316, #fb923c); }\r\n\r\n.asone-panel .sn-pool-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }\r\n.asone-panel .sn-pool-head strong { color: var(--text-soft); font-size: 12px; }\r\n/* \u6D93\u64B3\u7758\u93CD\u56E9\uE137\u93C0\u89C4\u579A\u704F\u5FD3\u6E3E\u9410?\u95AB\u6C31\u6564=\u7EF1?\u6D93\u64B3\u7758=\u59D7?\u93AE\uE100\u4EE0\u93C8?tooltip \u7487\u5B58\u69D1\u93C4\uE21A\u6462\u6D93\u20AC\u7EC9? */\r\n.asone-panel .sn-pdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }\r\n.asone-panel .sn-pool.general .sn-pdot { background: #a78bfa; box-shadow: 0 0 0 2px #241d3d; }\r\n.asone-panel .sn-pool.special .sn-pdot { background: #fb923c; box-shadow: 0 0 0 2px #2e2118; }\r\n\r\n/* \u741B?\u5BB8\uFE3D\u7223\u7EDB?/ \u9359\u5145\u6676\u9286\u5C7E\u669F\u934A?+ \u9427\u60E7\u578E\u59E3\u65BB\u20AC\u5D85\u6093\u741B?\u93B6\u5A43\u669F\u934A\u517C\u6579\u6769\u6D99\u7223\u7EDB\u6350\uE511,\u942A\u4F79\u5E00\u6D93\u20AC\u93C1\u78CB\uE511\u6942\u6A3A\u5BB3)\u9286?   `margin` \u9358\u5B2A\u57CC 8px/4px:\u6D63\u6B13\u567A\u93C9\xA4\uE6E6\u7490\u5BF8\u6F43\u7039\u51A7\u7B02\u93C2\u572D\u6B91\u93CD\u56E9\uE137\u741B?\u6D93\uE162\u68FF\u6D93\u5D87\u6680\u7ECC\u70D8\u3002\u9286?*/\r\n.asone-panel .sn-row {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: baseline;\r\n  gap: 6px;\r\n  font-size: 11px;\r\n  color: var(--dim);\r\n  margin: 8px 0 4px;\r\n}\r\n.asone-panel .sn-row-label { flex: none; }\r\n/* \u9359\u5145\u6676\u93C1\u677F\u20AC?\u93C1\u677F\u74E7\u59E3\u65C0\u7223\u7EDB\u60E7\u3047\u6D93\u20AC\u9359\u67AB\u20AC\u4F7A\u6AE7\u6D93\u20AC\u5997?\u9225\u65BA\u20AC?\u93B5\uE0A5\uE74B\u93C3\u8DFA\u539B\u9480\u85C9\u6E6A\u93C1\u677F\u74E7\u6D93\u5A3F\u20AC?   \u9427\u60E7\u578E\u59E3\u65C7\u7AA1\u9366\u3125\u6097\u95C8\uE76C\u20AC\u4F78\u76AC\u6D93\u20AC\u9359\u8702\u7B16\u9358\u5B2B\u6BAB,\u7487\u8BB3\u7D94\u93C1\u677F\u74E7\u9428\u52EC\u655E\u7459\uFF48\u20AC\u5C7C\u7B09\u93C4\uE21A\u82DF\u9352\u6943\u6B91\u7ED7\uE0FF\u7C29\u6924\u5E7F\u20AC?*/\r\n.asone-panel .sn-row-val { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }\r\n.asone-panel .sn-row-val b { font-size: 15px; color: #dfe3ea; font-variant-numeric: tabular-nums; font-weight: 600; }\r\n.asone-panel .sn-row-val .sn-pct { color: #9fb3c8; font-size: 11px; font-variant-numeric: tabular-nums; }\r\n/* \u7ED7\uE0FF\u7C29\u6D93\uE046\u7365\u9359?\u93C8\uE100\u61C6\u6D63\u6B13\uE582)\u6D93?5h \u6D94\u5B2E\u68FF\u9422\u3128\u6AC4\u7EFE\u5757\u6BA7\u5BEE\u20AC:\u6D93\u3088\u20AC\u546E\u69F8\u935A\u5C7C\u7AF4\u6D93\uE045\u775C\u9428\u52EA\u88B1\u6D93\uE046\u7365\u9359?\r\n   \u95C5\u65BE\u7AF4\u93C9\uFF04\u568E\u59E3\u65BF\uE63F\u9423\u6B11\u6AE7\u93C7\u78CB\u5158\u7487\u5B58\u69D1\u9286\u5C7C\u7B02\u95C8\u3224\u5045\u6D93\uE045\u69F8 5h\u9286\u4F7D\u7E56\u6D93\uE045\u69F8 7d\u9286\u5D83\u20AC?*/\r\n.asone-panel .sn-row.split { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }\r\n.asone-panel .sn-bar { height: 5px; background: #1b2029; border-radius: 999px; overflow: hidden; }\r\n.asone-panel .sn-bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }\r\n.asone-panel .sn-pool.general .sn-bar-fill { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }\r\n.asone-panel .sn-pool.special .sn-bar-fill { background: linear-gradient(90deg, #f97316, #fb923c); }\r\n/* \u9350\u5CF0\u5D48\u6D93?\u6769\u6D98\u5BB3\u93C9\uFF04\u7CBA\u6D93\u20AC\u675E\uE102\u4F06 \u9225\u65BA\u20AC?\u68F0\u6EC6\u58CA\u59DD\u3086\u6902\u9359\uE047\u3003\u7EC0\u6052\u20AC\u5C83\u7E56\u6D93\uE045\u775C\u9366\u3124\u7D24\u93AD\uE218\u20AC?\u6D93\u5D85\u5540\u741B\u3127\u305A\u6D63\u6B13\u567A\u9286?*/\r\n.asone-panel .sn-pool.cooling .sn-bar-fill { background: #4b5563; }\r\n\r\n/* \u59F9\u72B2\u7C33\u59B2\u6212\u7D85(**\u6D93\u3084\u91DC\u59F9\u72B3\u6660\u93B0\u5FCE\u7B09\u6D93\u20AC\u93CD?*)\u9286?   `margin-top:auto` \u93C4\uE21D\u7E56\u95B2\u5C80\u6B91\u934F\u62BD\u656D:\u7039\u51A9\u59B8\u59B2\u6212\u7D85\u95BD\u590A\u6E6A\u9357\uFF04\u5896\u6434\u66E2\u5134,\u6D93\u3084\u91DC\u59F9\u72B2\u6D1C\u59DD\u3087\u74D1\u6942\u6A3B\u6579\u704F\u4FF1\u20AC?   \u923F\u72C5\u7B0D \u6D93\u3084\u91DC\u59B2\u6212\u7D85\u8E47\u5474\u300F**\u9357\u72B1\u7AF4\u93CD\u98CE\u6B91\u6942\u6A3A\u5BB3**,\u935A\uFE40\u57AF\u6D93\u3084\u91DC\u59F9\u72B5\u74D1\u6942\u6A38\u20AC\u4F78\u7C33\u6748\u7470\uE1EE\u69BB\u612A\u7C21,\u9350\u5474\u5134\u9350\u546D\uE190\u9357\u7FE0\u7AF4\u6942\u6A39\u7AF4\u6D63?\r\n   \u59AF\uE044\u609C\u93B5\uE0A5\uE74B\u6D60\u5D84\u7D30\u7459\u590A\u7DF1\u9286\u5C7D\u5F78\u6748\u7470\u76AF\u6D93\u20AC\u9367\u693C\u20AC\u5D83\u20AC\u509B\u588D\u6D60\u30E4\u88B1\u93C9\uFFE0\u5158\u95BD\u5909\u7C21\u935A\u5C7E\u7271\u9428\u52EF\u73EE\u6434?30px)\u6D93\u5EA1\u5534\u6748\u7845\u7A9B\u9286?   \u923F\u72C5\u7B0D \u59B2\u6212\u7D85\u93C4?*\u7EFE\uE21B\u6783\u701B?*:\u6D93\u5D87\u7CB0\u6434\u66E1\u58CA\u9286\u4F77\u7B09\u7F01\u6B12\u7ADF\u5997\u55D0\u20AC\u4F77\u7B09\u7F01\u6B0F\u76AC\u9366\u55D9\u5063(\u93B8\u590A\u5F2C\u9470\u51A8\u6D58\u7039\u70B4\u7974,\u9358\u71B7\u539B\u95AD\uFF47\u7C8D\r\n   `#1a1f28` + `#232a35` \u93BB\u5FDA\u7ADF\u9366\u3126\u66A3\u5BEE\u72B3\u57C5\u9365\u9E43\u5677\u935A\u52EB\u56AD\u941C?0 \u5A06?\u9286?*/\r\n.asone-panel .sn-grant,\r\n.asone-panel .sn-reset-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 7px;\r\n  min-height: 30px;\r\n  box-sizing: border-box;\r\n  margin-top: auto; /* \u7490\u7FE0\u7D87\u9357\uFF04\u5896\u6434\u66E2\u5134 \u922B?\u6D93\u3086\u775C\u6434\u66E1\u7ADF\u7035\u5F52\u7D88 */\r\n  padding: 0 2px;\r\n  border-radius: 8px;\r\n  font-size: 11px;\r\n  color: var(--dim);\r\n}\r\n.asone-panel .sn-grant b { color: #dfe3ea; font-size: 13px; font-variant-numeric: tabular-nums; }\r\n.asone-panel .sn-g-label { flex: 1 1 auto; }\r\n/* \u5A0C\u2103\u6E41\u5A32\u8BF2\u59E9\u9359\u621E\u6581:\u93C4\u5267\u305A 5h / 7d \u9428\u52EF\u5678\u7F03\uE1BD\u6902\u9352?\u7EFE\uE21B\u6783\u701B?\u6D93\u5D87\u7CB0\u6434\u66E1\u58CA\u6D94\u71B6\u7B09\u7F01\u6B12\u7ADF\u5997?\u9225\u65BA\u20AC?\u7F01\u6B0F\u7560\u9354\u72B2\u7C33\u9479?   \u9359\u5D88\u20AC\u5C7C\u7D30\u7481\u2540\u6C49\u6D60\u30E4\u8D1F Flash-Lite \u59F9\u72B1\u7BC3\u93C8\u590B\u693F\u9354\u3127\u041D\u9352?\u9286?*/\r\n.asone-panel .sn-reset-row { justify-content: space-between; padding: 0 2px; }\r\n.asone-panel .sn-r-label { flex: none; }\r\n.asone-panel .sn-r-val { color: var(--text-soft); font-variant-numeric: tabular-nums; white-space: nowrap; }\r\n\r\n/* \u7490\uFE40\u5F7F\u7EE0\uFF04\u608A\u741B?\u59AF\u2033\u7037\u9429\uE1BC\u7D8D\u95AD\uFF45\u7D36\u741B\u3127\u6B91\u9352\u6940\uE194 / \u6748\u64B3\u53C6\u5997?/ \u9365\u60E7\u511A\u9352\u6943\u8C62\u9410\u5F52\u5158\u9366?ModelTable \u95B2? */\r\n.asone-panel .sn-grid { width: 100%; border-collapse: collapse; margin: 8px 0; }\r\n.asone-panel .sn-grid th,\r\n.asone-panel .sn-grid td { border-bottom: 1px solid var(--border); padding: 7px 6px; font-size: 13px; text-align: left; }\r\n.asone-panel .sn-grid th { background: #1b2029; color: #9fb3c8; font-weight: 600; }\r\n.asone-panel .sn-grid th.num,\r\n.asone-panel .sn-grid td.num { text-align: right; font-variant-numeric: tabular-nums; }\r\n.asone-panel .sn-grid td.sub { color: var(--dim); }\r\n/* \u7490\uFE40\u5F7F\u7EE0\uFF04\u608A\u741B\u3129\u5677\u9428\u52EE\u514C\u9365?\u5BB8\u8E6D\u7E5A\u701B?/ \u93C8\u590A\u7611\u95BD?\u9286\u509A\u62F0 `.chan-badge` \u93C4\uE21A\u6093\u6D93\u20AC\u93C3\u5FD3\u8230\u9418?\u6D63\u55DB\u5045\u93CB\u6C2D\u69F8\u7459\u6393\u7223\u9286?   \u6769\u6B10\u7047\u9366\u3128\u3003\u93CD\u714E\u5D1F\u934F\u51A9\u7278\u95B2?\u701B\u6940\u5F7F\u5BB8\uE1BC\u5D10\u9359?\u93B5\u20AC\u6D60\u30E5\u6087\u9423\u6B0F\u6087\u9428\u52E9\u20AC?*/\r\n.asone-panel .sn-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #1b2029; color: #9fb3c8; }\r\n.asone-panel .sn-pill.ok { background: #17301f; color: #5fbf7d; }\r\n.asone-panel .sn-pill.na { background: #2a2418; color: #d9a441; }\r\n\r\n/* \u7490\uFE40\u5F7F\u7EE0\uFF04\u608A\u741B?\u93BF\u5D84\u7D94\u9352\u6941\u5BDC\u95BD?\u9427\u8BF2\u7D8D/\u95B2\u5D86\u59C4 key/\u9352\u72BB\u6ACE) */\r\n.asone-panel .sn-ops { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }\r\n.asone-panel .sn-ops .btn-sm { padding: 2px 9px; }\r\n.asone-panel .sn-ops .btn-sm.danger { background: rgba(224, 104, 95, 0.12); }\r\n.asone-panel .sn-ops .btn-sm.danger:hover:not(:disabled) { border-color: #e0685f; }\r\n\r\n/* \u7490\uFE40\u5F7F\u7EE0\uFF04\u608A\u741B?\u9427\u8BF2\u7D8D\u741B?\u7035\u55D9\u721C\u6748\u64B3\u53C6 + \u9427\u8BF2\u7D8D\u9A9E\u8235\u59C4 key/\u9359\uE043\u7E5A\u701B\u6A3A\u7611\u942E? */\r\n.asone-panel .sn-login { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }\r\n.asone-panel .sn-login input[type="password"],\r\n.asone-panel .sn-add input {\r\n  font: inherit;\r\n  color: var(--text, #dfe3ea);\r\n  background: #14181f;\r\n  border: 1px solid #2a313d;\r\n  border-radius: 6px;\r\n  padding: 5px 10px;\r\n  min-width: 180px;\r\n}\r\n.asone-panel .sn-login input[type="password"]:focus,\r\n.asone-panel .sn-add input:focus { border-color: var(--accent, #6f8dff); outline: none; }\r\n.asone-panel .sn-login .chan-hint { margin: 0; flex: 1 1 100%; }\r\n\r\n/* \u7490\uFE40\u5F7F\u7EE0\uFF04\u608A\u741B?\u5A23\u8BF2\u59DE\u741B\u3125\u5D1F\u741B?*/\r\n.asone-panel .sn-add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 2px; }\r\n.asone-panel .sn-add .chan-hint { margin: 0; flex: 1 1 100%; }\r\n\r\n/* \u9239\u20AC\u9239\u20AC \u7490\uFE40\u5F7F\u7EE0\uFF04\u608A\u6924?Nexus ProviderAccounts.vue \u9428?1:1 \u6FB6\u5D85\u57E2)\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\u9239\u20AC\r\n   \u9365\u6D98\u6F61\u7F01\u64B4\u702F:\u9477\uE044\u59E9\u95B4\u5B58\u6F48 / \u5BB8\u63D2\u53C6\u59F9\u72BA\u5904\u9359?/ \u942A\u71B7\u7584\u59AF\u2033\u7037 / \u7EDB\u60E7\u57CC\u9352\u950B\u67CA\u9286?   \u6FB6\u5D87\u6564 .grid / .btn / .chan-hint / .chan-banner \u7EDB\u590B\u68E6\u93C8\u590C\u88AB,\u6D93\u5D85\u5F5F\u95AB\u72B1\u7AF4\u6FC2\u693C\u20AC?*/\r\n.asone-panel .acct-page { display: flex; flex-direction: column; gap: 6px; }\r\n.asone-panel .acct-title { margin: 0 0 6px; font-size: 17px; color: #dfe3ea; }\r\n.asone-panel .acct-h3 { margin: 14px 0 6px; font-size: 13px; color: #9fb3c8; }\r\n.asone-panel .acct-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\r\n.asone-panel .acct-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }\r\n.asone-panel .acct-form input[type="text"],\r\n.asone-panel .acct-form input[type="password"] {\r\n  width: 420px; padding: 4px 6px; background: #161a20; color: #dfe3ea;\r\n  border: 1px solid #2b323d; border-radius: 4px; font-size: 12px;\r\n}\r\n.asone-panel .acct-form input::placeholder { color: #6b7787; }\r\n';

// src/client/styles.ts
var STYLE_TAG_ID = "as-one-plugin-styles";
var SHELL_STYLE_TAG_ID = "as-one-plugin-shell-styles";
var SHELL_CSS = `
.asone-panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #3a4a5e transparent;
}
.asone-panel::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.asone-panel::-webkit-scrollbar-track {
  background: transparent;
}
.asone-panel::-webkit-scrollbar-thumb {
  background: #3a4a5e;
  border-radius: 4px;
}
.asone-panel::-webkit-scrollbar-thumb:hover {
  background: #4a5d74;
}
.asone-panel::-webkit-scrollbar-corner {
  background: transparent;
}
`;
function injectAsOneStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_TAG_ID) === null) {
    const el = document.createElement("style");
    el.id = STYLE_TAG_ID;
    el.textContent = styles_default;
    document.head.appendChild(el);
  }
  if (document.getElementById(SHELL_STYLE_TAG_ID) === null) {
    const el = document.createElement("style");
    el.id = SHELL_STYLE_TAG_ID;
    el.textContent = SHELL_CSS;
    document.head.appendChild(el);
  }
}

// src/client/locales.ts
var LOCALE_NS = "asOne";
var zh = {
  nav: "As One \xB7 \u5408\u4E00"
};
var en = {
  nav: "As One \xB7 Unity"
};

// src/client/panel.tsx
var import_jsx_runtime18 = require("react/jsx-runtime");
function AsOnePanelPage() {
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "asone-panel", children: /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(App, {}) });
}
function AsOnePanelIcon({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("circle", { cx: "12", cy: "12", r: "9.4", stroke: "currentColor", strokeWidth: "1.6" }),
        /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("path", { d: "M6.5 12h11", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round" })
      ]
    }
  );
}

// src/client/routeBadge.tsx
var import_react15 = __toESM(require("react"), 1);
var import_jsx_runtime19 = require("react/jsx-runtime");
var POLL_MS = 2e3;
function selectionOf(projection) {
  if (projection === null || typeof projection !== "object") return null;
  const typed = projection;
  const picked = typed.next ?? typed.lastUsed;
  if (picked === null || picked === void 0) return null;
  const provider = typeof picked.provider === "string" ? picked.provider : "";
  const model = typeof picked.model === "string" ? picked.model : "";
  if (provider === "" || model === "") return null;
  return { provider, model };
}
function realNameOf(route) {
  return route.display_name !== null && route.display_name !== "" ? route.display_name : route.model;
}
function labelOf3(route) {
  const real = realNameOf(route);
  return route.is_logical && route.logical_model !== null ? `${route.logical_model} \u2192 ${real}` : real;
}
function titleOf(route) {
  const base = `\u771F\u5B9E\u6A21\u578B:${route.provider}/${route.model}`;
  return route.in_flight ? `\u672C\u6B21\u8BF7\u6C42\u6B63\u5728\u4F7F\u7528 ${base}(\u7F51\u5173\u5728\u9014\u8D26\u672C,${POLL_MS / 1e3}s \u5237\u65B0)` : `\u4E0B\u4E00\u6761\u6D88\u606F\u9884\u8BA1\u4F7F\u7528 ${base}(\u4F1A\u8BDD\u4EB2\u548C\u9489\u4F4F\u7684\u6210\u5458;\u89C4\u5219\u53D8\u52A8\u4F1A\u91CD\u65B0\u9009\u8DEF)`;
}
function AsOneCurrentModelBadge(props) {
  const sid = typeof props.sessionId === "string" ? props.sessionId : "";
  const projection = typeof props.useProjection === "function" ? props.useProjection("modelSelection") : void 0;
  const selection = selectionOf(projection);
  const mine = selection !== null && selection.provider === AS_ONE_PROVIDER_ID;
  const model = mine ? selection.model : "";
  const [route, setRoute] = import_react15.default.useState(null);
  import_react15.default.useEffect(() => {
    if (sid === "" || !mine) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      void fetchSessionCurrentRoute(sid, model).then((next) => {
        if (!cancelled) setRoute(next);
      }).catch(() => {
        if (!cancelled) setRoute(null);
      });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sid, model, mine]);
  if (!mine || route === null) return null;
  const dotColor = route.in_flight ? "var(--dsw-alias-state-business-primary, #2ea043)" : "var(--dsw-alias-label-tertiary, #8b94a3)";
  return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(
    "span",
    {
      "data-as-one-current-model": "",
      title: titleOf(route),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        maxWidth: 300,
        fontSize: 11,
        lineHeight: "16px",
        color: route.in_flight ? "var(--dsw-alias-label-secondary, #4c5563)" : "var(--dsw-alias-label-tertiary, #8b94a3)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
          "span",
          {
            "aria-hidden": "true",
            style: {
              flex: "0 0 auto",
              width: 6,
              height: 6,
              borderRadius: 3,
              background: dotColor
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("span", { style: { flex: "0 0 auto", opacity: 0.75 }, children: route.in_flight ? "\u6B63\u5728\u4F7F\u7528" : "\u9884\u8BA1\u4F7F\u7528" }),
        route.provider !== "" && /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
          "span",
          {
            "data-as-one-current-model-provider": "",
            title: `\u4F9B\u5E94\u5546:${route.provider}`,
            style: {
              flex: "0 0 auto",
              maxWidth: 96,
              padding: "0 4px",
              borderRadius: 3,
              fontSize: 10,
              lineHeight: "14px",
              color: "var(--dsw-alias-label-tertiary, #8b94a3)",
              background: "var(--dsw-alias-bg-secondary, rgba(127, 127, 127, 0.12))",
              overflow: "hidden",
              textOverflow: "ellipsis"
            },
            children: route.provider
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
          "span",
          {
            style: {
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontVariantNumeric: "tabular-nums"
            },
            children: labelOf3(route)
          }
        )
      ]
    }
  );
}

// src/client.ts
injectAsOneStyles();
bindPanelBridge();
var BUNDLE_NAME = "@as-one/plugin";
var PANEL_ID = "as-one";
var PANEL_ORDER = 30;
var name = "@as-one/plugin/client";
var inject = ["slots", "locale"];
function apply(ctx, _config = {}) {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, "zh-CN", zh));
  ctx.effect(() => ctx.locale.register(LOCALE_NS, "zh", zh));
  ctx.effect(() => ctx.locale.register(LOCALE_NS, "en", en));
  const t = ctx.locale.bind(LOCALE_NS);
  ctx.effect(
    () => ctx.slots.inject(
      "sidebar.panellist",
      () => ctx.slots.register(
        { name: "sidebar.panellist", id: PANEL_ID, order: PANEL_ORDER, label: () => t("nav"), locale: LOCALE_NS },
        AsOnePanelIcon
      )
    )
  );
  ctx.effect(
    () => ctx.slots.inject(
      "main",
      () => ctx.slots.register(
        { name: "main", key: PANEL_ID, locale: LOCALE_NS },
        AsOnePanelPage
      )
    )
  );
  ctx.effect(
    () => ctx.slots.inject(
      "conversation.input.left",
      () => ctx.slots.register(
        {
          name: "conversation.input.left",
          id: "as-one-current-model",
          order: 5,
          locale: LOCALE_NS
        },
        AsOneCurrentModelBadge
      )
    )
  );
}
	return module.exports;
	}
});

//# sourceMappingURL=client.js.map
