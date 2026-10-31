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
  strategy,
  members,
  onChangeName,
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
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "rowName", children: g.model }),
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
              strategy: formStrategy,
              members: formMembers,
              onChangeName: setEditingName,
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
            strategy: formStrategy,
            members: formMembers,
            onChangeName: setEditingName,
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
    return "\u5DF2\u5217\u5165:\u5916\u90E8\u80FD\u5728 /v1/models \u91CC\u770B\u5230\u5E76\u76F4\u63A5\u4EE5 \u4F9B\u5E94\u5546/\u6A21\u578Bid \u8C03\u7528\u3002\u70B9\u300C\u672A\u5217\u5165\u300D\u628A\u5B83\u4ECE\u5217\u8868\u91CC\u79FB\u9664 \u2014\u2014 \u26A0\uFE0F \u79FB\u9664\u540E\u4ECD\u7136\u53EF\u4EE5\u76F4\u63A5\u8BF7\u6C42,\u4E5F\u53EF\u4EE5\u88AB\u903B\u8F91\u6A21\u578B\u5F15\u7528\u3002";
  return "\u672A\u5217\u5165:/v1/models \u91CC\u770B\u4E0D\u5230\u5B83\u3002\u26A0\uFE0F \u4F46\u5B83\u4ECD\u7136\u53EF\u4EE5\u88AB\u76F4\u63A5\u8BF7\u6C42\u3001\u4E5F\u53EF\u4EE5\u88AB\u903B\u8F91\u6A21\u578B\u5F15\u7528 \u2014\u2014 \u8FD9\u91CC\u53EA\u63A7\u5236\u300C\u662F\u5426\u5217\u51FA\u300D\u3002";
}
function DeploymentsPage(_props) {
  const [deployments, setDeployments] = import_react3.default.useState([]);
  const [error, setError] = import_react3.default.useState("");
  const [notice, setNotice] = import_react3.default.useState("");
  const [directBusy, setDirectBusy] = import_react3.default.useState("");
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
      setNotice(r.message ?? (d.listed ? "\u5DF2\u4ECE\u6A21\u578B\u5217\u8868\u79FB\u9664" : "\u5DF2\u5217\u5165\u6A21\u578B\u5217\u8868"));
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
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("section", { className: "section dep-section", children: [
    error ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "err", role: "alert", children: error }) : null,
    notice ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "savedNotice", role: "status", children: notice }) : null,
    deployments.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "hint na", children: "\u5C1A\u65E0\u771F\u5B9E\u6A21\u578B \u2014\u2014 \u5148\u5230\u300C\u517C\u5BB9\u4F9B\u5E94\u5546\u300D\u6216\u5BF9\u5E94\u6E20\u9053\u9875\u767B\u8BB0\u6A21\u578B\u3002 \u767B\u8BB0\u540E\u7AEF\u70B9\u81EA\u52A8\u6210\u7ACB(\u7AEF\u70B9 = \u771F\u5B9E\u6A21\u578B \xD7 \u8BE5\u4F9B\u5E94\u5546\u540D\u4E0B\u7684\u51ED\u636E\u884C)\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dep-toolbar", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dep-summary", children: [
        deployments.length,
        " \u4E2A\u771F\u5B9E\u6A21\u578B",
        exposedCount > 0 ? ` \xB7 ${exposedCount} \u4E2A\u5DF2\u5217\u5165 /v1/models` : ""
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
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "/v1/models" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "depCardBody", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "depChips", children: [
          anomalyOf(d) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "pill alert", title: anomalyOf(d), children: "\u5F02\u5E38" }) : null,
          d.in_cooldown ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "pill bad", children: [
            "\u51B7\u5374 ",
            fmtCooldown(d)
          ] }) : null,
          d.supports_vision ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "pill info", children: "\u89C6\u89C9" }) : null,
          effortText(d) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "pill metric efforts", title: `\u652F\u6301\u7684\u601D\u8003\u5F3A\u5EA6:${effortText(d)}`, children: [
            "\u601D\u8003 ",
            effortText(d)
          ] }) : null,
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
function refreshNoteOf(refresh, elapsedSecText, busy) {
  if (!refresh) return "";
  if (busy) return `\u6B63\u5728\u5237\u65B0 \xB7 \u5DF2\u7528 ${elapsedSecText}s`;
  return refresh.result ?? "";
}
function SenseNovaPage() {
  const [status, setStatus] = import_react7.default.useState(null);
  const [catalog, setCatalog] = import_react7.default.useState([]);
  const [error, setError] = import_react7.default.useState("");
  const [refreshMsg, setRefreshMsg] = import_react7.default.useState("");
  const [refreshingLocal, setRefreshingLocal] = import_react7.default.useState(false);
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
        await load();
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
    if (!refreshing) return void 0;
    const iv = window.setInterval(() => setNowMs(Date.now()), 200);
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
  const refreshNote = refreshNoteOf(refresh, elapsedSecText, refreshing);
  const accountRows = import_react7.default.useMemo(() => {
    return accounts.map((acc) => {
      const pools = acc.quota?.pools ?? [];
      const ordered = [...pools].sort((a, b) => {
        const rank = (p) => p.pool_type === "dedicated" ? 1 : 0;
        return rank(a) - rank(b);
      });
      const rights = ordered.map((p) => ({
        key: p.name || (p.pool_type === "dedicated" ? "\u4E13\u5C5E\u6C60" : "\u901A\u7528\u6C60"),
        value: n(p.w5_remaining),
        sub: `\u91CD\u7F6E ${ts(p.w5_reset_at)}`,
        tone: "ok"
      }));
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
  async function refreshAll() {
    if (refreshing) return;
    setError("");
    setRefreshMsg("");
    setRefreshingLocal(true);
    localStartMsRef.current = Date.now();
    try {
      const r = await rendererApi.sensenovaRefresh(true);
      await load();
      if (!r.ok) setError(r.message ?? "\u5237\u65B0\u5931\u8D25");
      else setRefreshMsg(r.message ?? "\u5DF2\u5237\u65B0");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      const res = await rendererApi.qoderRefreshCatalog(REGION);
      if (!res.ok) setNote({ kind: "warn", text: res.message ?? "\u76EE\u5F55\u5237\u65B0\u672A\u6210\u529F" });
      else notes.push(res.message ?? "\u76EE\u5F55\u5DF2\u5237\u65B0");
      const rows = await rendererApi.getQoderModels(REGION);
      setModels(rows);
      setCatalogError(rows.length === 0 ? "\u76EE\u5F55\u4E3A\u7A7A:\u4E0A\u6E38\u6CA1\u7ED9\u6A21\u578B" : null);
      setStatus(await rendererApi.getQoderStatus().catch(() => null));
      if (accounts.length > 0) {
        const signed = await rendererApi.qoderCheckin(REGION).catch((error) => {
          notes.push(`\u7B7E\u5230\u5931\u8D25:${errText(error)}`);
          return [];
        });
        if (signed.length > 0) {
          notes.push(`\u7B7E\u5230 ${signed.filter((r) => r.status === "claimed").length}/${signed.length}`);
        }
        const credit = await rendererApi.qoderCredits(REGION).catch((error) => {
          setCreditError(errText(error));
          return [];
        });
        setCredits(credit);
        if (credit.length > 0) setCreditError(null);
      }
      if (notes.length > 0) setNote({ kind: "ok", text: notes.join(" \xB7 ") });
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
      const quota = c !== null && c.ok ? c.userQuota : null;
      return {
        id: a.account,
        label: a.account,
        note: [c?.userType ?? a.userType, `${a.models} \u4E2A\u6A21\u578B`].filter(Boolean).join(" \xB7 "),
        dot: a.lastError ? "bad" : a.hasPat ? "ok" : "off",
        right: quota !== null ? {
          key: "\u5269\u4F59\u79EF\u5206",
          value: n2(quota.remaining),
          sub: `\u6700\u8FD1\u5230\u671F ${fmtAt(c?.expiresAt ?? a.expiresAt)}`,
          tone: "ok"
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

// ../panel-ui/src/styles.css
var styles_default = '/*\n * As One \u7BA1\u7406\u9762\u677F\u5168\u5C40\u6837\u5F0F(plain CSS,\u65E0\u6846\u67B6)\u3002\n * \u914D\u8272\u4E0E\u539F Nexus \u9762\u677F\u6697\u8272\u7CFB\u5BF9\u9F50:bg #141b26 / #101722\u3001\u8FB9 #2c3a4d\u3001\n * \u5B57 #cfe3f5 / #e8eef5\u3001dim #8b94a3\u3001ok #5fbf7d\u3001bad #e0685f\u3002\n */\n\n.asone-panel * {\n  box-sizing: border-box;\n}\n\n.asone-panel {\n  --bg: #101722;\n  --bg-card: #141b26;\n  --border: #2c3a4d;\n  --text: #e8eef5;\n  --text-soft: #cfe3f5;\n  --dim: #8b94a3;\n  --ok: #5fbf7d;\n  --bad: #e0685f;\n  --warn: #d9a441;\n  --accent: #4d6bfe;\n  --mono: "JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace;\n}\n\n.asone-panel,\n.asone-panel,\n.asone-panel {\n  margin: 0;\n  padding: 0;\n  height: 100%;\n}\n\n.asone-panel {\n  background: var(--bg);\n  color: var(--text-soft);\n  font-family: system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;\n  font-size: 13px;\n  line-height: 1.55;\n}\n\n/* \u2500\u2500 \u6EDA\u52A8\u6761:\u5168\u5C40\u7EDF\u4E00,\u4E0D\u7528\u7CFB\u7EDF\u81EA\u5E26\u6D45\u8272\u6EDA\u52A8\u6761 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n * \u9875\u9762\u4E00\u5F8B\u7528\u8FD9\u7248\u6DF1\u8272\u7EC6\u6EDA\u52A8\u6761(WebKit \u5185\u6838),\u4E0E\u6697\u8272\u9762\u677F\u4FDD\u6301\u4E00\u81F4;\n * Firefox \u7528\u6807\u51C6 scrollbar-color \u515C\u5E95\u3002 */\n.asone-panel * {\n  scrollbar-width: thin;\n  scrollbar-color: #3a4a5e transparent;\n}\n\n.asone-panel ::-webkit-scrollbar {\n  width: 8px;\n  height: 8px;\n}\n\n.asone-panel ::-webkit-scrollbar-track {\n  background: transparent;\n}\n\n.asone-panel ::-webkit-scrollbar-thumb {\n  background: #3a4a5e;\n  border-radius: 4px;\n}\n\n.asone-panel ::-webkit-scrollbar-thumb:hover {\n  background: #4a5d74;\n}\n\n.asone-panel ::-webkit-scrollbar-corner {\n  background: transparent;\n}\n\n.asone-panel .app {\n  display: flex;\n  flex-direction: column;\n  min-height: 100%;\n}\n\n/* \u2500\u2500 \u9876\u680F\u4E0E\u5BFC\u822A \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .topbar {\n  display: flex;\n  align-items: center;\n  gap: 24px;\n  padding: 0 20px;\n  height: 48px;\n  background: var(--bg-card);\n  border-bottom: 1px solid var(--border);\n  position: sticky;\n  top: 0;\n  z-index: 10;\n}\n\n.asone-panel .brand {\n  font-size: 15px;\n  font-weight: 600;\n  color: var(--text);\n  letter-spacing: 0.02em;\n}\n\n.asone-panel .tabs {\n  display: flex;\n  gap: 4px;\n}\n\n.asone-panel .tab {\n  appearance: none;\n  background: transparent;\n  border: none;\n  color: var(--dim);\n  font: inherit;\n  padding: 6px 14px;\n  border-radius: 6px;\n  cursor: pointer;\n}\n\n.asone-panel .tab:hover {\n  color: var(--text);\n  background: rgba(77, 107, 254, 0.08);\n}\n\n.asone-panel .tab.on {\n  color: var(--text);\n  background: rgba(77, 107, 254, 0.18);\n}\n\n/* \u2500\u2500 \u9875\u9762\u9AA8\u67B6 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .content {\n  flex: 1;\n  width: 100%;\n  /* \u26A0\uFE0F 2026-10-23:1180px \u2192 1400px\u3002sensenova \u9875\u8981 3 \u5F20 420px \u8D26\u53F7\u5361\u540C\u884C\n     (3\xD7420 + 2\xD716 = 1292px \u5185\u5BB9 + padding 40px = 1332px),1180px \u653E\u4E0D\u4E0B,\n     \u53EA\u80FD\u4E24\u5361\u4E00\u884C;1400px \u5BCC\u4F59,\u4E14\u7A97\u53E3\u9ED8\u8BA4\u5BBD\u968F\u4E4B\u63D0\u5230 1440px(index.ts)\u3002\n     \u26A0\uFE0F 2026-10-25(m14379):1400px \u2192 1680px\u30021920px \u7A97\u53E3\u4E0B\u8981\u8BA9\u8BBE\u7F6E\u9875\n     \u300C\u8C03\u5EA6\u89C4\u5219\u300D\u6BCF\u5F20\u5361\u91CC\u7684 5 \u4E2A box(provider/model/\u5230\u671F/\u661F\u671F/\u65F6\u95F4\u6BB5)\u6392\u6210\n     \u4E00\u884C:box \u6700\u5C0F\u5BBD 160+280+180+300+280 = 1200px + 4\xD720 gap = 1280px,\n     \u52A0 blocks-container padding 40px = 1320px,\u52A0\u4E24\u4FA7 padding 40px \u2248 1400px\n     (2026-10-25 m14922 \u79FB\u9664\u8BBE\u7F6E\u9875\u5DE6\u4FA7 ui-nav,\u4E0D\u518D\u5360 168px+24px) \u2192 1680px \u5BCC\u4F59\u3002\n     1920 \u7A97\u53E3\u4E0B\u5C45\u4E2D,\u5DE6\u53F3\u5404\u7559 120px\u3002 */\n  max-width: 1680px;\n  margin: 0 auto;\n  padding: 16px 20px 40px;\n}\n\n.asone-panel .page {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n.asone-panel .page-note,\n.asone-panel .hint {\n  margin: 0;\n  color: var(--dim);\n  font-size: 12px;\n}\n\n.asone-panel .notice {\n  padding: 8px 12px;\n  border: 1px solid var(--ok);\n  border-radius: 6px;\n  color: var(--ok);\n  background: rgba(95, 191, 125, 0.08);\n}\n\n.asone-panel .empty {\n  padding: 28px 16px;\n  text-align: center;\n  color: var(--dim);\n}\n\n.asone-panel .loading {\n  animation: pulse 1.2s ease-in-out infinite;\n}\n\n@keyframes pulse {\n  50% {\n    opacity: 0.55;\n  }\n}\n\n/* \u2500\u2500 \u5361\u7247 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .card {\n  background: var(--bg-card);\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  padding: 14px 16px;\n}\n\n.asone-panel .card-head {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 12px;\n  margin-bottom: 10px;\n}\n\n.asone-panel .card-head h2 {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n.asone-panel .card-extra {\n  color: var(--dim);\n  font-size: 12px;\n}\n\n.asone-panel .card-badges {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n}\n\n/* \u2500\u2500 \u8868\u683C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .tbl {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 12.5px;\n}\n\n.asone-panel .tbl th,\n.asone-panel .tbl td {\n  padding: 6px 10px;\n  text-align: left;\n  border-bottom: 1px solid var(--border);\n  vertical-align: top;\n}\n\n.asone-panel .tbl th {\n  color: var(--dim);\n  font-weight: 500;\n  white-space: nowrap;\n}\n\n.asone-panel .tbl tbody tr:hover {\n  background: rgba(77, 107, 254, 0.06);\n}\n\n.asone-panel .tbl .num {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n\n.asone-panel .tbl .bar-col {\n  min-width: 140px;\n}\n\n.asone-panel .row-dim td {\n  opacity: 0.55;\n}\n\n/* \u2500\u2500 \u6587\u672C\u5DE5\u5177 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .mono {\n  font-family: var(--mono);\n  font-size: 12px;\n}\n\n.asone-panel .dim-text {\n  color: var(--dim);\n}\n\n.asone-panel .err-cell {\n  max-width: 280px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--bad);\n}\n\n.asone-panel .code-block {\n  display: block;\n  font-family: var(--mono);\n  font-size: 11.5px;\n  white-space: pre-wrap;\n  word-break: break-all;\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 8px 10px;\n}\n\n/* \u2500\u2500 \u5FBD\u7AE0\u4E0E\u51ED\u636E\u70B9 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .badge {\n  display: inline-block;\n  padding: 1px 8px;\n  border-radius: 999px;\n  font-size: 11.5px;\n  border: 1px solid transparent;\n  white-space: nowrap;\n}\n\n.asone-panel .badge-ok {\n  color: var(--ok);\n  border-color: rgba(95, 191, 125, 0.45);\n  background: rgba(95, 191, 125, 0.1);\n}\n\n.asone-panel .badge-bad {\n  color: var(--bad);\n  border-color: rgba(224, 104, 95, 0.45);\n  background: rgba(224, 104, 95, 0.1);\n}\n\n.asone-panel .badge-warn {\n  color: var(--warn);\n  border-color: rgba(217, 164, 65, 0.45);\n  background: rgba(217, 164, 65, 0.1);\n}\n\n.asone-panel .badge-dim {\n  color: var(--dim);\n  border-color: var(--border);\n  background: transparent;\n}\n\n.asone-panel .cred-dot {\n  display: inline-block;\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  flex: none;\n}\n\n.asone-panel .cred-dot.ok {\n  background: var(--ok);\n}\n\n.asone-panel .cred-dot.bad {\n  background: var(--bad);\n}\n\n.asone-panel .cred-cell {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}\n\n/* \u2500\u2500 KPI \u4E0E\u72B6\u6001\u884C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .status-line {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  flex-wrap: wrap;\n  padding: 10px 14px;\n  background: var(--bg-card);\n  border: 1px solid var(--border);\n  border-radius: 8px;\n}\n\n.asone-panel .kpi-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));\n  gap: 12px;\n}\n\n.asone-panel .kpi {\n  background: var(--bg-card);\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  padding: 12px 14px;\n}\n\n.asone-panel .kpi-label {\n  color: var(--dim);\n  font-size: 12px;\n}\n\n.asone-panel .kpi-value {\n  font-size: 22px;\n  font-weight: 600;\n  color: var(--text);\n  font-variant-numeric: tabular-nums;\n  margin: 2px 0;\n}\n\n.asone-panel .kpi-sub {\n  color: var(--dim);\n  font-size: 11.5px;\n}\n\n/* \u2500\u2500 \u6761\u5F62 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .bar {\n  width: 100%;\n  min-width: 90px;\n  height: 8px;\n  border-radius: 4px;\n  background: rgba(44, 58, 77, 0.6);\n  overflow: hidden;\n}\n\n.asone-panel .bar-fill {\n  height: 100%;\n  border-radius: 4px;\n}\n\n.asone-panel .bar-blue {\n  background: var(--accent);\n}\n\n.asone-panel .bar-green {\n  background: var(--ok);\n}\n\n.asone-panel .bar-orange {\n  background: var(--warn);\n}\n\n.asone-panel .bar-na {\n  color: var(--dim);\n}\n\n.asone-panel .bar-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 10px 18px;\n  margin-top: 12px;\n}\n\n.asone-panel .legend-item {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  color: var(--dim);\n  font-size: 12px;\n}\n\n.asone-panel .legend-item .bar {\n  width: 90px;\n}\n\n.asone-panel .legend-name {\n  min-width: 72px;\n}\n\n/* \u2500\u2500 \u952E\u503C\u7F51\u683C(\u6E20\u9053\u5361/\u8BBE\u7F6E) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .kv-grid {\n  display: grid;\n  grid-template-columns: 140px 1fr;\n  gap: 6px 14px;\n  margin-bottom: 10px;\n}\n\n.asone-panel .kv-grid .k {\n  color: var(--dim);\n}\n\n.asone-panel .kv-grid .v {\n  color: var(--text-soft);\n}\n\n/* \u2500\u2500 \u6309\u94AE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .btn {\n  appearance: none;\n  font: inherit;\n  color: var(--text-soft);\n  background: rgba(77, 107, 254, 0.14);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 5px 14px;\n  cursor: pointer;\n}\n\n.asone-panel .btn:hover:not(:disabled) {\n  border-color: var(--accent);\n}\n\n.asone-panel .btn:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n.asone-panel .btn-sm {\n  padding: 2px 10px;\n  font-size: 12px;\n}\n\n/* \u2500\u2500 \u9875\u9762\u6807\u9898\u4E0E\u5360\u4F4D\u58F3 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .page-title {\n  margin: 0 0 6px;\n  font-size: 18px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n.asone-panel .page-page-shell {\n  padding: 28px 16px;\n  text-align: center;\n  color: var(--dim);\n  border: 1px dashed var(--border);\n  border-radius: 8px;\n}\n\n/* \u2500\u2500 \u5B50\u6807\u9898\u6761(\u6A21\u578B\u9891\u9053\u58F3,\u5BF9\u9F50 Nexus .subtabs) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .subtabs {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px;\n  min-height: 24px;\n  margin: 0 0 14px;\n  padding-bottom: 8px;\n  border-bottom: 1px solid var(--border);\n}\n\n.asone-panel .subtab {\n  appearance: none;\n  background: none;\n  border: none;\n  font: inherit;\n  color: var(--dim);\n  padding: 0 10px;\n  line-height: 24px;\n  cursor: pointer;\n}\n\n.asone-panel .subtab:hover {\n  color: var(--text);\n}\n\n.asone-panel .subtab.on {\n  color: var(--text);\n  background: rgba(77, 107, 254, 0.14);\n  border-radius: 6px;\n}\n\n.asone-panel .subtabs-action {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin-left: auto;\n}\n\n.asone-panel .act-note {\n  color: var(--dim);\n  font-size: 11px;\n  max-width: 420px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.asone-panel .act-note.busy {\n  color: var(--accent);\n}\n\n.asone-panel .act-btn {\n  appearance: none;\n  font: inherit;\n  background: #1d3550;\n  border: 1px solid #3d5a73;\n  color: var(--text-soft);\n  height: 24px;\n  box-sizing: border-box;\n  border-radius: 5px;\n  padding: 0 12px;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.asone-panel .act-btn:hover:not(:disabled) {\n  background: #24425f;\n}\n\n.asone-panel .act-btn:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n/* \u2500\u2500 \u6A21\u578B\u8868(ModelTable) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .models-block {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.asone-panel .models-toolbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  flex-wrap: wrap;\n}\n\n.asone-panel .models-toolbar-left,\n.asone-panel .models-toolbar-right {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.asone-panel .models-table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 12.5px;\n}\n\n.asone-panel .models-table th,\n.asone-panel .models-table td {\n  padding: 6px 8px;\n  text-align: left;\n  border-bottom: 1px solid var(--border);\n  vertical-align: middle;\n}\n\n.asone-panel .models-table th {\n  color: var(--dim);\n  font-weight: 500;\n  white-space: nowrap;\n}\n\n.asone-panel .models-table .models-col-enable {\n  width: 44px;\n}\n\n.asone-panel .models-table td.rate-cell {\n  white-space: nowrap;\n}\n\n.asone-panel .models-table tr.on td {\n  background: rgba(77, 107, 254, 0.08);\n}\n\n.asone-panel .models-table tr.off td {\n  opacity: 0.55;\n}\n\n.asone-panel .models-table tr.nocall td {\n  opacity: 0.75;\n}\n\n.asone-panel .models-table .input {\n  width: 100%;\n  min-width: 60px;\n  height: 26px;\n  padding: 0 8px;\n}\n\n.asone-panel .models-table .input.num {\n  width: 90px;\n}\n\n.asone-panel .models-table input:disabled {\n  opacity: 0.45;\n}\n\n.asone-panel .vision-cell {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.asone-panel .dot {\n  color: var(--ok);\n  font-size: 9px;\n  line-height: 1;\n}\n\n.asone-panel .tag-warn {\n  margin-left: 6px;\n  padding: 0 5px;\n  border: 1px solid var(--warn);\n  border-radius: 3px;\n  color: var(--warn);\n  font-size: 11px;\n  white-space: nowrap;\n}\n\n/* \u2500\u2500 \u903B\u8F91\u6A21\u578B\u7F16\u8F91\u5668(LogicalModelEditor) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .editor {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n.asone-panel .fieldRow {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.asone-panel .fieldLabel {\n  color: var(--dim);\n  font-size: 12px;\n}\n\n.asone-panel .fieldValue {\n  color: var(--text);\n  font-size: 13px;\n}\n\n.asone-panel .fieldNote {\n  color: var(--dim);\n  font-size: 12px;\n}\n\n.asone-panel .fieldWarn {\n  color: var(--warn);\n  font-size: 12px;\n}\n\n.asone-panel .fieldWarn b {\n  color: var(--text-soft);\n  font-weight: 500;\n}\n\n.asone-panel .input {\n  box-sizing: border-box;\n  height: 32px;\n  padding: 0 10px;\n  font: inherit;\n  font-size: 13px;\n  color: var(--text-soft);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n}\n\n.asone-panel .input:focus {\n  outline: none;\n  border-color: var(--accent);\n}\n\n.asone-panel .input.inputBad {\n  border-color: var(--bad);\n}\n\n.asone-panel .selectInput {\n  cursor: pointer;\n}\n\n.asone-panel .nodeList {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.asone-panel .nodeRow {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.asone-panel .groupIdx {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  background: #2f4d6b;\n  color: var(--text);\n  font-size: 11px;\n  flex-shrink: 0;\n}\n\n.asone-panel .nodeProvider {\n  width: 150px;\n  flex: 0 0 150px;\n}\n\n.asone-panel .nodeSelect {\n  flex: 1 1 0;\n  min-width: 0;\n}\n\n.asone-panel .addModelButton {\n  appearance: none;\n  font: inherit;\n  background: none;\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  height: 28px;\n  padding: 0 10px;\n  color: var(--text-soft);\n  font-size: 12px;\n  cursor: pointer;\n  align-self: flex-start;\n}\n\n.asone-panel .addModelButton:hover:not(:disabled) {\n  border-color: var(--accent);\n}\n\n.asone-panel .addModelButton:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n.asone-panel .iconButton {\n  appearance: none;\n  background: none;\n  border: none;\n  font: inherit;\n  color: var(--dim);\n  padding: 2px 6px;\n  border-radius: 4px;\n  cursor: pointer;\n  flex-shrink: 0;\n}\n\n.asone-panel .iconButton:hover:not(:disabled) {\n  color: var(--text);\n  background: rgba(77, 107, 254, 0.1);\n}\n\n.asone-panel .iconButtonDanger:hover:not(:disabled) {\n  color: var(--bad);\n}\n\n.asone-panel .iconButton:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n\n.asone-panel .editorActions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.asone-panel .primaryButton,\n.asone-panel .secondaryButton {\n  appearance: none;\n  font: inherit;\n  height: 36px;\n  padding: 0 16px;\n  border-radius: 6px;\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.asone-panel .primaryButton {\n  background: #2f4d6b;\n  border: 1px solid #2f4d6b;\n  color: var(--text-soft);\n}\n\n.asone-panel .primaryButton:hover:not(:disabled) {\n  background: #3a5d80;\n}\n\n.asone-panel .secondaryButton {\n  background: none;\n  border: 1px solid var(--border);\n  color: var(--text-soft);\n}\n\n.asone-panel .secondaryButton:hover:not(:disabled) {\n  border-color: var(--accent);\n}\n\n.asone-panel .primaryButton:disabled,\n.asone-panel .secondaryButton:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n/* \u2500\u2500 \u4F9B\u5E94\u5546\u8D26\u6237\u8868(ProviderAccounts) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .provider-accounts {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.asone-panel .block-title {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n.asone-panel .provider-accounts-actions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n/* \u2500\u2500 \u5BA2\u6237\u7AEF\u8DEF\u5F84(ClientPaths) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .client-paths {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.asone-panel .cp-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.asone-panel .cp-row b {\n  color: var(--dim);\n  font-size: 12px;\n  flex-shrink: 0;\n}\n\n.asone-panel .cp-input {\n  flex: 1;\n  min-width: 200px;\n}\n\n.asone-panel .cp-state {\n  color: var(--dim);\n  font-size: 12px;\n  white-space: nowrap;\n  flex-shrink: 0;\n}\n\n/* \u2500\u2500 \u6587\u672C\u7740\u8272\u5DE5\u5177 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .ok {\n  color: var(--ok);\n}\n\n.asone-panel .bad {\n  color: var(--bad);\n}\n\n.asone-panel .na {\n  color: var(--dim);\n}\n\n/* \u2500\u2500 \u9519\u8BEF\u6761(\u7528\u91CF\u9875\u7528,\u5BF9\u9F50 Nexus \u5168\u5C40 .err)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .err {\n  color: #e0685f;\n  font-size: 12px;\n  padding: 8px;\n  border: 1px solid #4a2224;\n  background: #241417;\n  border-radius: 4px;\n  margin: 10px 0;\n}\n\n/* ===========================================================================\n   \u603B\u89C8\u9875(OverviewPage,1:1 \u79FB\u690D Nexus Overview.vue \u7684 scoped \u6837\u5F0F,\n   \u7C7B\u540D\u7EDF\u4E00 ov- \u524D\u7F00\u9632\u78B0\u649E;\u914D\u8272\u4E0E Nexus \u539F\u7248\u4E00\u81F4)\n   =========================================================================== */\n\n.asone-panel .ov-err {\n  color: #e0685f;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u2500\u2500 \u8FD0\u884C\u4E2D:\u5728\u9014\u660E\u7EC6 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ov-inflight {\n  border: 1px solid #2c3a4d;\n  border-radius: 8px;\n  padding: 10px 12px;\n  background: #141b26;\n  margin-top: 12px;\n}\n.asone-panel .ov-inflightHead {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  margin-bottom: 6px;\n}\n.asone-panel .ov-inflightHead h2 {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 600;\n  color: #cfe3f5;\n}\n.asone-panel .ov-inflightHead .count {\n  font-size: 12px;\n  color: #8b94a3;\n}\n.asone-panel .ov-inflightGrid {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n.asone-panel .ov-inflightCard {\n  border: 1px solid #2c3a4d;\n  border-radius: 6px;\n  padding: 6px 8px;\n  background: #101722;\n  min-width: 180px;\n}\n.asone-panel .ov-inflightCardHead {\n  display: flex;\n  justify-content: space-between;\n  align-items: baseline;\n  font-size: 12px;\n}\n.asone-panel .ov-inflightLm {\n  color: #e8eef5;\n  font-weight: 600;\n  word-break: break-all;\n}\n.asone-panel .ov-inflightMap {\n  margin: 4px 0 0;\n  padding: 0;\n  list-style: none;\n  font-size: 11px;\n  color: #8b94a3;\n}\n.asone-panel .ov-inflightMap li {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 10px;\n}\n.asone-panel .ov-inflightRmN {\n  color: #6f7b8c;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n.asone-panel .ov-inflightLeases {\n  margin-top: 4px;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n.asone-panel .ov-lease {\n  font-size: 10px;\n  color: #5fbf7d;\n  background: #182435;\n  border-radius: 4px;\n  padding: 1px 5px;\n}\n/* \u76F4\u8FDE\u5361:\u903B\u8F91\u6A21\u578B\u4E3A\u7A7A = \u5BA2\u6237\u7AEF\u76F4\u8FDE\u771F\u5B9E\u6A21\u578B(\u865A\u7EBF\u8FB9\u6846 + \u7565\u4E0D\u540C\u5E95\u8272)\u3002 */\n.asone-panel .ov-inflightDirect {\n  border-style: dashed;\n  border-color: #5b6a52;\n  background: #141b17;\n}\n.asone-panel .ov-inflightDirect .ov-inflightLm {\n  color: #9fd39b;\n}\n.asone-panel .ov-inflightDirect .ov-lease {\n  color: #9fd39b;\n  background: #1a2a1e;\n}\n\n/* \u2500\u2500 \u5B9E\u65F6\u65E5\u5FD7 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ov-recentBlock {\n  margin-top: 12px;\n  border-top: 1px solid #2c3a4d;\n  padding-top: 8px;\n}\n.asone-panel .ov-recentBlock .ov-inflightHead {\n  margin-bottom: 6px;\n}\n.asone-panel .ov-recentLimit {\n  display: inline-flex;\n  align-items: baseline;\n  gap: 4px;\n  font-size: 12px;\n  color: #8b94a3;\n}\n.asone-panel .ov-recentLimit input {\n  width: 4.5em;\n  font-size: 12px;\n  color: #cfe3f5;\n  background: #101722;\n  border: 1px solid #2c3a4d;\n  border-radius: 4px;\n  padding: 1px 4px;\n}\n.asone-panel .ov-recentLimit input:disabled {\n  opacity: 0.5;\n}\n.asone-panel .ov-recentLimitErr {\n  font-size: 11px;\n  color: #e0685f;\n}\n\n/* \u2500\u2500 \u6309\u5BF9\u8BDD\u7684\u5361\u7247\u5217\u8868 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ov-recentConvList {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.asone-panel .ov-recentConv {\n  border: 1px solid #2c3a4d;\n  border-radius: 6px;\n  background: #101722;\n  overflow: hidden;\n}\n/* \u5361\u5934 / \u660E\u7EC6\u884C\u5171\u7528\u540C\u4E00\u5957\u56FA\u5B9A\u5B57\u7B26\u5BBD\u5217(grid \u5217\u53F3\u8FB9\u7F18\u9010\u5217\u5BF9\u9F50)\u3002 */\n.asone-panel .ov-recentConvHead,\n.asone-panel .ov-recentConvRow {\n  display: grid;\n  grid-template-columns:\n    minmax(6ch, 10ch) /* \u5E8F\u53F7:#\u5BF9\u8BDD#\u8BF7\u6C42(\u5361\u5934\u662F \u25B8 #\u5BF9\u8BDD) */\n    minmax(6ch, 18ch) /* \u903B\u8F91\u6A21\u578B */\n    minmax(8ch, 24ch) /* \u771F\u5B9E\u6A21\u578B */\n    minmax(22ch, 1fr) /* \u7ED3\u679C\u5FBD\u7AE0 + \u9519\u8BEF\u6587\u6848 \u2014\u2014 \u552F\u4E00\u5403\u5269\u4F59\u5BBD\u5EA6\u7684\u4E00\u5217 */\n    12ch /* \u5EF6\u8FDF */\n    15ch /* TTFT(\u5361\u5934\u5E26\u300CTTFT \u300D\u524D\u7F00,\u6545\u6BD4\u5EF6\u8FDF\u5217\u5BBD 3ch) */\n    11ch /* TPS:118.4 tok/s */\n    20ch /* token \u4E09\u683C:993K / 22.1K / 860K */\n    9ch; /* \u7ED3\u675F:165.7s \u524D */\n  column-gap: 8px;\n  align-items: baseline;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n}\n.asone-panel .ov-recentConvHead {\n  padding: 4px 8px;\n  cursor: pointer;\n  user-select: none;\n}\n.asone-panel .ov-recentConvHead:hover,\n.asone-panel .ov-recentConv.open .ov-recentConvHead {\n  background: #182436;\n}\n.asone-panel .ov-recentConvHeadId {\n  display: flex;\n  align-items: baseline;\n  gap: 4px;\n  min-width: 0;\n}\n.asone-panel .ov-recentConvCaret {\n  width: 10px;\n  flex: 0 0 10px;\n  color: #5fbf7d;\n}\n.asone-panel .ov-recentConvTitle {\n  flex: 0 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: #e8eef5;\n  font-weight: 600;\n}\n.asone-panel .ov-recentConvTitle.direct {\n  color: #9fd39b;\n}\n.asone-panel .ov-recentConvRow {\n  padding: 2px 8px;\n  color: #cfe3f5;\n  background: #0d131d;\n}\n.asone-panel .ov-recentConvRow:hover {\n  background: #101722;\n}\n.asone-panel .ov-recentConvRow.fail {\n  color: #e0a9a3;\n  box-shadow: inset 2px 0 0 #e0685f;\n}\n.asone-panel .ov-recentConvSeq {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: #6f7b8c;\n}\n.asone-panel .ov-recentConvLm {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.asone-panel .ov-recentConvLm.direct {\n  color: #9fd39b;\n}\n.asone-panel .ov-recentConvRm {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.asone-panel .ov-recentConvRes {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n}\n.asone-panel .ov-recentConvN {\n  color: #8b94a3;\n  white-space: nowrap;\n}\n.asone-panel .ov-recentConvRes .ov-errText {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.asone-panel .ov-mono {\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 10.5px;\n  word-break: break-all;\n}\n.asone-panel .ov-dim {\n  color: #8b94a3;\n}\n.asone-panel .ov-num {\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n  white-space: nowrap;\n}\n.asone-panel .ov-badge {\n  border-radius: 4px;\n  padding: 0 4px;\n  font-size: 10px;\n}\n.asone-panel .ov-badge.ok {\n  color: #5fbf7d;\n  background: #182435;\n}\n.asone-panel .ov-badge.bad {\n  color: #e0685f;\n  background: #2b1a1c;\n}\n.asone-panel .ov-errText {\n  color: #8b94a3;\n  font-size: 10px;\n  margin-left: 4px;\n}\n\n/* ===========================================================================\n   \u7528\u91CF\u7EDF\u8BA1\u9875(UsageStatsPage,1:1 \u79FB\u690D Nexus styles.css \u7684 .usage-* \u7C7B)\n   =========================================================================== */\n.asone-panel .usage-ctl {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex-wrap: wrap;\n  margin: 16px 0 6px;\n}\n/* \u5206\u6BB5\u63A7\u4EF6(pill \u7EC4):\u4E00\u4E2A\u5706\u89D2\u5BB9\u5668\u91CC\u6392\u6309\u94AE,\u9009\u4E2D\u9879\u586B\u5E95\u3002 */\n.asone-panel .usage-seg {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n  padding: 3px;\n  border: 1px solid #262c36;\n  border-radius: 9px;\n  background: #161a20;\n}\n.asone-panel .usage-seg button {\n  appearance: none;\n  border: 0;\n  background: transparent;\n  color: #9fb3c8;\n  font: inherit;\n  font-size: 12px;\n  line-height: 1;\n  padding: 7px 12px;\n  border-radius: 7px;\n  cursor: pointer;\n  white-space: nowrap;\n  transition: background 0.12s ease, color 0.12s ease;\n}\n.asone-panel .usage-seg button:hover {\n  background: #1b2029;\n  color: #dfe3ea;\n}\n.asone-panel .usage-seg button.on,\n.asone-panel .usage-seg button.on:hover {\n  background: #2b3a4d;\n  color: #e8f1fa;\n}\n.asone-panel .usage-refresh {\n  appearance: none;\n  border: 1px solid #3d5a73;\n  background: #22303f;\n  color: #cfe3f5;\n  font: inherit;\n  font-size: 12px;\n  line-height: 1;\n  padding: 10px 14px;\n  border-radius: 9px;\n  cursor: pointer;\n}\n.asone-panel .usage-refresh:hover:not(:disabled) {\n  background: #2a3d50;\n}\n.asone-panel .usage-refresh:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n.asone-panel .usage-ctl-info {\n  margin: 0 0 0 4px;\n}\n\n/* 5 \u5F20 KPI \u5361\u3002 */\n.asone-panel .usage-cards {\n  display: grid;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n  gap: 10px;\n  margin-top: 14px;\n}\n.asone-panel .usage-card {\n  background: #161a20;\n  border: 1px solid #232a35;\n  border-radius: 12px;\n  padding: 12px 14px;\n  min-width: 0;\n}\n.asone-panel .usage-card-k {\n  color: #8b94a3;\n  font-size: 12px;\n}\n.asone-panel .usage-card-v {\n  color: #eef2f8;\n  font-size: 22px;\n  font-weight: 600;\n  line-height: 1.35;\n  font-variant-numeric: tabular-nums;\n  overflow-wrap: anywhere;\n}\n.asone-panel .usage-card-v-sm {\n  font-size: 15px;\n}\n.asone-panel .usage-card-s {\n  color: #8b94a3;\n  font-size: 11px;\n  overflow-wrap: anywhere;\n}\n\n.asone-panel .usage-sec {\n  margin-top: 24px;\n}\n.asone-panel .usage-sec h2 {\n  margin: 0 0 8px;\n  font-size: 14px;\n  color: #9fb3c8;\n  font-weight: 600;\n}\n\n.asone-panel .usage-chart-wrap {\n  position: relative;\n  width: 100%;\n}\n.asone-panel .usage-chart {\n  display: block;\n  overflow: visible;\n}\n.asone-panel .axis-text {\n  fill: #7b8798;\n  font-size: 10px;\n}\n.asone-panel .axis-text-r {\n  fill: #8ea0b8;\n}\n.asone-panel .usage-bar {\n  stroke: none;\n}\n/* \u6574\u5217\u900F\u660E\u547D\u4E2D\u533A:\u67F1\u5B50\u518D\u7A84\u4E5F\u80FD hover \u5230\u3002 */\n.asone-panel .bar-hit {\n  fill: transparent;\n  pointer-events: all;\n}\n.asone-panel .usage-line {\n  stroke-linejoin: round;\n  stroke-linecap: round;\n}\n\n.asone-panel .usage-tip {\n  position: absolute;\n  top: 6px;\n  transform: translateX(-50%);\n  min-width: 170px;\n  max-width: calc(100% - 8px);\n  padding: 8px 10px;\n  border: 1px solid #2c3644;\n  border-radius: 8px;\n  background: #1b2130;\n  color: #cfd8e3;\n  font-size: 11px;\n  line-height: 1.6;\n  pointer-events: none;\n  z-index: 30;\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);\n}\n.asone-panel .usage-tip-head {\n  color: #9fb3c8;\n  margin-bottom: 4px;\n}\n.asone-panel .usage-tip-line {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n.asone-panel .usage-tip-line b {\n  color: #eef2f8;\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .usage-tip-nm {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  min-width: 0;\n}\n/* \u6A21\u578B\u540D:\u59CB\u7EC8\u5355\u884C,\u592A\u957F\u5C31\u7701\u7565\u53F7\u3002 */\n.asone-panel .usage-tip-nm-t {\n  flex: 1 1 auto;\n  min-width: 0;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.asone-panel .usage-tip-sep {\n  height: 1px;\n  background: #2a3340;\n  margin: 6px 0;\n}\n.asone-panel .usage-tip-more {\n  color: #8b94a3;\n  font-size: 10px;\n}\n\n.asone-panel .usage-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px 16px;\n  margin-top: 10px;\n  color: #9fb3c8;\n  font-size: 11px;\n}\n.asone-panel .usage-legend-i {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  white-space: nowrap;\n}\n.asone-panel .usage-dot {\n  display: inline-block;\n  width: 10px;\n  height: 10px;\n  border-radius: 2px;\n  flex: 0 0 auto;\n}\n.asone-panel .usage-dot.sm {\n  width: 8px;\n  height: 8px;\n}\n.asone-panel .usage-line-sw {\n  display: inline-block;\n  width: 14px;\n  height: 3px;\n  border-radius: 2px;\n}\n\n.asone-panel .usage-split {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  flex-wrap: wrap;\n}\n.asone-panel .usage-donut {\n  flex: 0 0 auto;\n}\n.asone-panel .usage-donut-v {\n  fill: #eef2f8;\n  font-size: 20px;\n  font-weight: 600;\n}\n.asone-panel .usage-donut-k {\n  fill: #8b94a3;\n  font-size: 11px;\n}\n\n.asone-panel .usage-rank {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  flex: 1 1 260px;\n  min-width: 260px;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.asone-panel .usage-row,\n.asone-panel .usage-subrow {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 6px 8px;\n  border-radius: 8px;\n  font-size: 12px;\n  color: #dfe3ea;\n}\n.asone-panel .usage-row {\n  background: #171c24;\n}\n.asone-panel .usage-row.clickable {\n  cursor: pointer;\n}\n.asone-panel .usage-row.clickable:hover,\n.asone-panel .usage-subrow.clickable:hover {\n  background: #1b2029;\n}\n.asone-panel .usage-rank-i {\n  min-width: 14px;\n  text-align: right;\n  color: #7b8798;\n  font-size: 11px;\n}\n/* \u53EF\u5C55\u5F00\u884C\u7684\u6298\u53E0\u6307\u793A:\u6CA1\u6709\u5B50\u9879\u65F6\u7559\u7A7A\u5360\u4F4D,\u4FDD\u8BC1\u5E26\u8272\u5757\u7684\u884C\u5DE6\u8FB9\u7F18\u5BF9\u9F50\u3002 */\n.asone-panel .usage-caret {\n  width: 8px;\n  flex: 0 0 8px;\n  color: #7b8798;\n  font-size: 12px;\n  line-height: 1;\n  transition: transform 0.15s ease;\n}\n.asone-panel .usage-caret.open {\n  transform: rotate(90deg);\n}\n.asone-panel .usage-name {\n  flex: 1 1 auto;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  line-height: 1.35;\n}\n.asone-panel .usage-name-m {\n  color: #dfe3ea;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.asone-panel .usage-name-s {\n  color: #8b94a3;\n  font-size: 11px;\n}\n.asone-panel .usage-val {\n  text-align: right;\n  color: #eef2f8;\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .usage-pct {\n  width: 52px;\n  text-align: right;\n  color: #8b94a3;\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .usage-fold {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  margin: 2px 0 4px 26px;\n  padding-left: 10px;\n  border-left: 2px solid #232a35;\n}\n.asone-panel .usage-subrow {\n  font-size: 11.5px;\n  color: #c3cbd8;\n}\n.asone-panel .usage-foot {\n  margin-top: 20px;\n}\n\n@media (max-width: 1100px) {\n  .asone-panel .usage-cards {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n}\n\n/* ===========================================================================\n   \u8BBE\u7F6E\u9875(SettingsPage,1:1 \u79FB\u690D Nexus Settings.vue \u7684 .ui-* \u4F53\u7CFB)\n   =========================================================================== */\n\n/* Nexus \u7684 .err / .savedNotice \u662F\u7EAF\u6587\u5B57;As One \u5DF2\u6709 .err/.notice \u76D2\u5F0F\u53D8\u4F53,\n   \u6545\u8FD9\u91CC\u7528 .ui-err/.ui-notice \u627F\u62C5\u8BBE\u7F6E\u9875\u4E0E\u4F9B\u5E94\u5546\u9875\u7684\u7EAF\u6587\u5B57\u5F62\u6001\u3002 */\n.asone-panel .ui-err {\n  color: #e0685f;\n  font-size: 12px;\n  line-height: 18px;\n  margin: 0;\n}\n\n.asone-panel .ui-notice {\n  color: #5fbf7d;\n  font-size: 12px;\n  line-height: 18px;\n  margin: 0;\n}\n\n/* \u8BBE\u7F6E\u9875\u5916\u58F3(\u4EC5 SettingsPage \u4F7F\u7528)\u3002\n   \u26A0\uFE0F 2026-10-24 \u7528\u6237 m10716:\u9760\u5DE6\u3001\u4E0D\u9650\u5236\u5BBD\u5EA6\u3002\n   \u539F\u6765 max-width: 980px + margin: 0 auto \u6709\u4E24\u4E2A\u6BDB\u75C5:\u2460\u6574\u9875\u5C45\u4E2D,\u53F3\u4FA7\u7559\u4E00\u5927\u7247\n   \u7A7A\u767D;\u2461980px \u88C5\u4E0D\u4E0B\u300C\u8C03\u5EA6\u89C4\u5219\u300D\u90A3\u4E94\u5F20\u5361(\u6BCF\u5F20 5 \u4E2A box),\u53EA\u80FD\u6324\u6210\u4E24\u5217\u3002\n   \u5BBD\u5EA6\u4EA4\u7ED9\u5916\u5C42 .content(max-width 1400px)\u63A7\u5236,\u8FD9\u91CC\u4E0D\u518D\u81EA\u8BBE\u4E0A\u9650\u3002 */\n.asone-panel .ui-shell {\n  width: 100%;\n  max-width: none;\n  margin: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.asone-panel .ui-page-desc {\n  margin: 0 0 6px;\n  color: var(--dim);\n  font-size: 13px;\n}\n\n.asone-panel .ui-layout {\n  display: flex;\n  align-items: flex-start;\n  gap: 24px;\n}\n\n.asone-panel .ui-content {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n.asone-panel .ui-card {\n  background: var(--bg-card);\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  padding: 14px 16px;\n  scroll-margin-top: 60px;\n}\n\n.asone-panel .ui-card-head {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 12px;\n  margin-bottom: 10px;\n}\n\n.asone-panel .ui-card-title {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n.asone-panel .ui-card-sub {\n  margin: 2px 0 0;\n  color: var(--dim);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .ui-fields {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n  gap: 6px 18px;\n}\n\n.asone-panel .ui-field {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0;\n}\n\n.asone-panel .ui-field.wide {\n  grid-column: 1 / -1;\n}\n\n.asone-panel .ui-field-head {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n}\n\n.asone-panel .ui-field-label {\n  color: var(--dim);\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 18px;\n}\n\n.asone-panel .ui-field-unit {\n  color: var(--dim);\n  font-size: 11px;\n}\n\n.asone-panel .ui-field-hint {\n  margin: 0;\n  color: var(--dim);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .ui-field-err {\n  margin: 0;\n  color: var(--bad);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .ui-check {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 13px;\n  cursor: pointer;\n  color: var(--text-soft);\n}\n\n.asone-panel .ui-jsonbox {\n  box-sizing: border-box;\n  width: 100%;\n  padding: 8px 10px;\n  font-family: var(--mono);\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--text-soft);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  resize: vertical;\n}\n\n.asone-panel .ui-jsonbox:focus {\n  outline: none;\n  border-color: var(--accent);\n}\n\n.asone-panel .ui-json-toggle {\n  appearance: none;\n  background: none;\n  border: none;\n  font: inherit;\n  color: var(--accent);\n  padding: 4px 0;\n  cursor: pointer;\n  font-size: 12.5px;\n}\n\n.asone-panel .ui-json-err {\n  margin: 0;\n  color: var(--bad);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .ui-json-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n}\n\n.asone-panel .ui-key-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex-wrap: wrap;\n}\n\n.asone-panel .ui-key {\n  font-family: var(--mono);\n  font-size: 12px;\n  color: var(--text-soft);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 4px 10px;\n  word-break: break-all;\n}\n\n.asone-panel .ui-badge {\n  display: inline-block;\n  padding: 1px 8px;\n  border-radius: 999px;\n  font-size: 11.5px;\n  color: var(--dim);\n  border: 1px solid var(--border);\n  background: transparent;\n  white-space: nowrap;\n}\n\n/* \u2500\u2500 \u8C03\u5EA6\u89C4\u5219\u7F16\u8F91\u5668(2026-10-24 \u6309\u8BBE\u8BA1\u7A3F\u91CD\u505A:5 \u5757\u5F39\u6027\u5E03\u5C40 + \u4E25\u683C\u65AD\u884C\u661F\u671F) \u2500\u2500 */\n/* \u5168\u90E8 scoped \u5230 .asone-scheduler,\u907F\u514D\u6C61\u67D3\u5168\u5C40\u3002\n   2026-10-24 \u7528\u6237\u8981\u6C42\u300C\u914D\u8272\u534F\u8C03\u300D:\u6539\u7528\u9875\u9762\u5168\u5C40\u8C03\u8272\u677F\n   (--bg-card #141b26 / --border #2c3a4d / --text-soft #cfe3f5 / --dim #8b94a3\n   / --accent #4d6bfe / --bad #e0685f),\u4E0E\u5176\u5B83\u5361\u7247\u540C\u8272\u7CFB\u3002 */\n.asone-panel .asone-scheduler {\n  --asec-bg-card: var(--bg-card);\n  --asec-bg-box: #182130;\n  --asec-bg-input: #101722;\n  --asec-border: var(--border);\n  --asec-text: var(--text-soft);\n  --asec-muted: var(--dim);\n  --asec-primary: var(--accent);\n  --asec-primary-bg: rgba(77, 107, 254, 0.16);\n  --asec-danger: var(--bad);\n}\n\n/* \u5927\u5361\u7247 */\n.asone-panel .asone-scheduler .rule-card {\n  background: var(--asec-bg-card);\n  border: 1px solid var(--asec-border);\n  border-radius: 8px;\n  margin-bottom: 24px;\n  overflow: hidden;\n}\n/* \u540C\u6863\u591A\u6761\u89C4\u5219:\u76F8\u90BB\u4E24\u5757\u4E4B\u95F4\u52A0\u5206\u9694\u7EBF */\n.asone-panel .asone-scheduler .blocks-container + .blocks-container {\n  border-top: 1px solid var(--asec-border);\n}\n\n/* \u5361\u7247\u5934\u90E8 */\n.asone-panel .asone-scheduler .card-header {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  padding: 16px 20px;\n  border-bottom: 1px solid var(--asec-border);\n}\n/* \u6863\u4F4D\u5FBD\u7AE0(\u4F5C\u7528\u57DF\u5185\u8986\u76D6\u5168\u5C40 .badge) */\n.asone-panel .asone-scheduler .badge {\n  display: inline-block;\n  background: var(--asec-primary);\n  color: #16161e;\n  font-weight: bold;\n  font-size: 14px;\n  padding: 4px 12px;\n  border-radius: 6px;\n  border: 1px solid transparent;\n  white-space: nowrap;\n}\n/* \u6863\u4F4D\u540D(\u65B0\u589E,\u8BBE\u8BA1\u7A3F\u53EA\u6709\u5FBD\u7AE0 + \u6309\u94AE) */\n.asone-panel .asone-scheduler .card-subtitle {\n  color: var(--asec-muted);\n  font-size: 13px;\n}\n.asone-panel .asone-scheduler .btn-add {\n  background: transparent;\n  color: var(--asec-text);\n  border: 1px solid var(--asec-border);\n  padding: 4px 12px;\n  border-radius: 4px;\n  cursor: pointer;\n  transition: all 0.2s;\n}\n.asone-panel .asone-scheduler .btn-add:hover {\n  background: rgba(255, 255, 255, 0.05);\n}\n\n/* \u7A7A\u7EC4 / \u5361\u7247\u5185\u63D0\u793A(\u65B0\u589E) */\n.asone-panel .asone-scheduler .card-empty {\n  margin: 0;\n  padding: 20px;\n  color: var(--asec-muted);\n  font-size: 13px;\n  border-bottom: 1px solid var(--asec-border);\n}\n.asone-panel .asone-scheduler .card-hint {\n  margin: 0;\n  padding: 10px 20px;\n  color: var(--asec-muted);\n  font-size: 12px;\n  border-bottom: 1px solid var(--asec-border);\n}\n\n/* \u6838\u5FC3\u5185\u5BB9\u533A:\u5F39\u6027\u5E03\u5C40\u5BB9\u5668 */\n.asone-panel .asone-scheduler .blocks-container {\n  padding: 20px;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 20px;\n}\n\n/* 5 \u4E2A\u72EC\u7ACB\u6A21\u5757\u7684\u516C\u5171\u6837\u5F0F */\n.asone-panel .asone-scheduler .box {\n  background: var(--asec-bg-box);\n  border: 1px solid var(--asec-border);\n  border-radius: 8px;\n  padding: 16px;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.asone-panel .asone-scheduler .box-label {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  color: var(--asec-muted);\n  font-size: 13px;\n  height: 20px;\n}\n.asone-panel .asone-scheduler .box-label .req {\n  color: var(--asec-danger);\n  margin-left: 4px;\n}\n\n/* \u72EC\u7ACB\u7684\u5BBD\u5EA6\u63A7\u5236(\u4E0E\u8BBE\u8BA1\u7A3F\u4E00\u81F4) */\n.asone-panel .asone-scheduler .box-provider { flex: 1 1 160px; min-width: 160px; }\n.asone-panel .asone-scheduler .box-model    { flex: 2 1 280px; min-width: 280px; }\n.asone-panel .asone-scheduler .box-expiry   { flex: 1 1 180px; min-width: 180px; }\n.asone-panel .asone-scheduler .box-weekdays { flex: 3 1 300px; min-width: 300px; } /* \u5BBD\u5EA6\u4E0D\u8DB3\u65F6\u89E6\u53D1\u516D\u65E5\u6574\u4F53\u6362\u884C */\n.asone-panel .asone-scheduler .box-times    { flex: 2 1 300px; min-width: 280px; }\n.asone-panel .asone-scheduler .box-cooldown { flex: 1 1 180px; min-width: 160px; }\n\n/* \u5220\u9664\u89C4\u5219\u6309\u94AE */\n.asone-panel .asone-scheduler .btn-del {\n  background: none;\n  border: none;\n  color: var(--asec-danger);\n  cursor: pointer;\n  font-size: 13px;\n}\n.asone-panel .asone-scheduler .btn-del:hover {\n  opacity: 0.8;\n}\n\n/* \u8F93\u5165\u6846\u901A\u7528\u6837\u5F0F(select / date / time / number \u5171\u7528) */\n.asone-panel .asone-scheduler .input-control {\n  background: var(--asec-bg-input);\n  border: 1px solid var(--asec-border);\n  color: var(--asec-text);\n  padding: 10px 12px;\n  border-radius: 6px;\n  font-size: 13px;\n  font-family: inherit;\n  width: 100%;\n  outline: none;\n  transition: border-color 0.2s;\n}\n.asone-panel .asone-scheduler .input-control:focus {\n  border-color: var(--asec-primary);\n}\n.asone-panel .asone-scheduler select.input-control {\n  cursor: pointer;\n}\n\n/* \u65E5\u5386\u548C\u65F6\u949F\u56FE\u6807\u53CD\u8272\u6D45\u8272(\u8BBE\u8BA1\u7A3F\u5173\u952E\u70B9) */\n.asone-panel .asone-scheduler input[type="date"]::-webkit-calendar-picker-indicator,\n.asone-panel .asone-scheduler input[type="time"]::-webkit-calendar-picker-indicator {\n  filter: invert(0.6);\n  cursor: pointer;\n  opacity: 0.8;\n}\n.asone-panel .asone-scheduler input[type="date"]::-webkit-calendar-picker-indicator:hover,\n.asone-panel .asone-scheduler input[type="time"]::-webkit-calendar-picker-indicator:hover {\n  opacity: 1;\n}\n\n/* \u2605 \u9690\u85CF\u672A\u9009\u62E9\u65E5\u671F\u65F6\u7684 yyyy/mm/\u65E5 \u5360\u4F4D\u7B26(\u7528\u6237\u70B9\u540D\u5FC5\u987B\u4FDD\u7559) \u2605\n   \u26A0\uFE0F \u7528 JS \u9A71\u52A8\u7684 `.is-empty` \u7C7B,\u4E0D\u7528 `:invalid`:\u7A7A\u7684\u975E required date \u8F93\u5165\n   \u662F `:valid`(\u6CA1\u6709 valueMissing/typeMismatch),`:invalid` \u53EA\u5728 required \u65F6\u624D\n   \u5339\u914D\u7A7A\u503C \u2014\u2014 \u800C required \u4F1A\u987A\u5E26\u7981\u6389 Chromium \u7684 \xD7 \u6E05\u9664\u6309\u94AE(\u89C1 SettingsPage)\u3002 */\n.asone-panel .asone-scheduler input[type="date"].is-empty::-webkit-datetime-edit {\n  color: transparent;\n}\n.asone-panel .asone-scheduler input[type="date"]:focus::-webkit-datetime-edit {\n  color: var(--asec-text);\n}\n\n/* \u661F\u671F\u6A21\u5757:\u4E00\u4E8C\u4E09\u56DB\u4E94 / \u516D\u65E5 \u4E24\u7EC4,\u7A7A\u95F4\u4E0D\u8DB3\u65F6\u300C\u516D\u65E5\u300D\u6574\u4F53\u6362\u884C */\n.asone-panel .asone-scheduler .weekday-flex {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n.asone-panel .asone-scheduler .weekday-group {\n  display: flex;\n  gap: 8px;\n}\n.asone-panel .asone-scheduler .weekday-flex input {\n  display: none;\n}\n.asone-panel .asone-scheduler .weekday-flex label {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 34px;\n  height: 34px;\n  border-radius: 6px;\n  border: 1px solid var(--asec-border);\n  background: var(--asec-bg-input);\n  color: var(--asec-muted);\n  cursor: pointer;\n  transition: all 0.2s;\n  flex-shrink: 0;\n}\n.asone-panel .asone-scheduler .weekday-flex input:checked + label {\n  background: var(--asec-primary-bg);\n  border-color: var(--asec-primary);\n  color: var(--asec-primary);\n  font-weight: bold;\n}\n\n/* \u65F6\u95F4\u6BB5\u6A21\u5757 */\n.asone-panel .asone-scheduler .time-flex {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.asone-panel .asone-scheduler .time-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.asone-panel .asone-scheduler .time-row input[type="time"] {\n  width: 120px;\n  flex-shrink: 0;\n}\n.asone-panel .asone-scheduler .separator {\n  color: var(--asec-muted);\n}\n.asone-panel .asone-scheduler .btn-del-time {\n  background: none;\n  border: none;\n  color: var(--asec-danger);\n  cursor: pointer;\n  font-size: 16px;\n  padding: 0 4px;\n}\n.asone-panel .asone-scheduler .btn-add-time {\n  background: none;\n  border: none;\n  color: var(--asec-primary);\n  cursor: pointer;\n  font-size: 13px;\n  text-align: left;\n  padding: 0;\n  margin-top: 4px;\n}\n.asone-panel .asone-scheduler .btn-add-time:hover {\n  text-decoration: underline;\n}\n\n/* \u89C4\u5219\u6821\u9A8C\u9519\u8BEF(\u65B0\u589E:\u8BBE\u8BA1\u7A3F\u65E0,\u6CBF\u7528\u9519\u8BEF\u63D0\u793A\u8272) */\n.asone-panel .asone-scheduler .rule-err {\n  margin: -8px 20px 20px;\n  color: var(--asec-danger);\n  font-size: 12.5px;\n  line-height: 1.5;\n}\n\n/* \u5206\u7EC4\u5E03\u5C40(\u8C03\u5EA6\u7F16\u8F91\u5668\u5DF2\u6362 .asone-scheduler \u7ED3\u6784;\u8FD9\u51E0\u4E2A\u4EC5\u300C\u91CD\u8BD5\u7B56\u7565\u300D\u5361\u8FD8\u5728\u7528) */\n.asone-panel .ui-rule-groups {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n}\n.asone-panel .ui-group {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n.asone-panel .ui-group-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n}\n.asone-panel .ui-group-title {\n  color: var(--text);\n  font-size: 13px;\n  font-weight: 500;\n}\n\n/* \u2500\u2500 \u9000\u907F\u66F2\u7EBF \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ui-chart-box {\n  width: 100%;\n  overflow-x: auto;\n  padding: 8px 0 2px;\n}\n.asone-panel .ui-chart-yaxis {\n  stroke: #3d5a73;\n}\n.asone-panel .ui-chart-grid {\n  stroke: rgba(44, 58, 77, 0.7);\n}\n.asone-panel .ui-chart-axis {\n  stroke: #3d5a73;\n}\n.asone-panel .ui-chart-band {\n  fill: rgba(77, 107, 254, 0.12);\n}\n.asone-panel .ui-chart-dash {\n  stroke: var(--warn);\n  stroke-dasharray: 4 4;\n}\n.asone-panel .ui-chart-line {\n  fill: none;\n  stroke: var(--accent);\n  stroke-width: 1.8;\n}\n.asone-panel .ui-chart-dot {\n  fill: var(--accent);\n}\n.asone-panel .ui-chart-label {\n  fill: var(--dim);\n  font-size: 10px;\n}\n.asone-panel .ui-chart-tick {\n  fill: var(--dim);\n  font-size: 10px;\n}\n.asone-panel .ui-chart-text {\n  margin-top: 10px;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.asone-panel .ui-chart-text p {\n  margin: 0;\n  color: var(--dim);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u2500\u2500 \u5E95\u90E8\u4FDD\u5B58\u680F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ui-savebar {\n  display: flex;\n  align-items: center;\n  gap: 14px;\n  background: var(--bg-card);\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  padding: 10px 14px;\n  position: sticky;\n  bottom: 12px;\n  z-index: 5;\n}\n.asone-panel .ui-savebar-count {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--text-soft);\n  font-size: 13px;\n  white-space: nowrap;\n}\n.asone-panel .ui-savebar-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: var(--bad);\n}\n.asone-panel .ui-savebar-msg {\n  flex: 1;\n  min-width: 0;\n  color: var(--dim);\n  font-size: 12px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.asone-panel .ui-savebar-btns {\n  display: flex;\n  gap: 8px;\n}\n\n/* \u2500\u2500 ui-btn \u6309\u94AE\u4F53\u7CFB(\u8BBE\u7F6E\u9875) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ui-btn {\n  appearance: none;\n  font: inherit;\n  color: var(--text-soft);\n  background: rgba(77, 107, 254, 0.1);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  height: 30px;\n  padding: 0 12px;\n  font-size: 12.5px;\n  cursor: pointer;\n}\n.asone-panel .ui-btn:hover:not(:disabled) {\n  border-color: var(--accent);\n}\n.asone-panel .ui-btn:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.asone-panel .ui-btn-sm {\n  height: 24px;\n  padding: 0 10px;\n  font-size: 12px;\n}\n.asone-panel .ui-btn-primary {\n  background: #2f4d6b;\n  border-color: #2f4d6b;\n  color: var(--text-soft);\n}\n.asone-panel .ui-btn-primary:hover:not(:disabled) {\n  background: #3a5d80;\n}\n.asone-panel .ui-btn-ghost {\n  background: none;\n  color: var(--text-soft);\n}\n.asone-panel .ui-btn-danger {\n  color: var(--bad);\n}\n\n/* ===========================================================================\n   \u5176\u4ED6\u4F9B\u5E94\u5546\u9875(ProvidersPage,1:1 \u79FB\u690D Nexus Providers.vue \u7684 scoped \u6837\u5F0F)\n   =========================================================================== */\n\n.asone-panel .providers-page {\n  max-width: 760px;\n}\n\n.asone-panel .rows {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  margin: 12px 0 0;\n  padding: 0;\n  list-style: none;\n}\n\n.asone-panel .rowCard {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  border: 1px solid var(--border);\n  background: var(--bg-card);\n  border-radius: 10px;\n  padding: 12px 14px;\n}\n\n.asone-panel .rowHead {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.asone-panel .rowName {\n  color: var(--text-soft);\n  font-size: 14px;\n  font-weight: 500;\n}\n\n.asone-panel .credentialDot {\n  flex: none;\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  display: inline-block;\n}\n\n.asone-panel .dotOk {\n  background: #22a06b;\n}\n\n.asone-panel .dotMissing {\n  background: #d92d20;\n}\n\n.asone-panel .rowActions {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  margin-left: auto;\n}\n\n.asone-panel .rowBtn {\n  appearance: none;\n  font: inherit;\n  border-radius: 6px;\n  height: 28px;\n  padding: 0 12px;\n  font-size: 12px;\n  cursor: pointer;\n  border: 1px solid var(--border);\n  background: transparent;\n  color: var(--text-soft);\n}\n.asone-panel .rowBtn:hover:not(:disabled) {\n  background: #1f2732;\n}\n.asone-panel .rowBtn.danger {\n  color: var(--bad);\n}\n.asone-panel .rowBtn:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.asone-panel .panel {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  background: #1b2029;\n  border: 1px solid #232a34;\n  border-radius: 8px;\n  padding: 12px;\n}\n\n.asone-panel .panelTitle {\n  color: var(--text-soft);\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 20px;\n  margin-bottom: 2px;\n}\n\n.asone-panel .catalogSection {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.asone-panel .catalogTitle {\n  color: var(--dim);\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 18px;\n}\n\n.asone-panel .modelListHead {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-bottom: 2px;\n}\n\n.asone-panel .modelCatalogMeta {\n  color: var(--dim);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .headActions {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n}\n\n.asone-panel .linkButton {\n  appearance: none;\n  background: none;\n  border: none;\n  font: inherit;\n  border-radius: 4px;\n  height: 28px;\n  color: var(--dim);\n  cursor: pointer;\n  padding: 0 8px;\n  font-size: 12px;\n  line-height: 18px;\n  display: inline-flex;\n  align-items: center;\n}\n.asone-panel .linkButton:hover:not(:disabled) {\n  background: #1f2732;\n  color: var(--text-soft);\n}\n.asone-panel .linkButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.asone-panel .modelEmpty {\n  margin: 0;\n  color: var(--dim);\n  font-size: 12px;\n  line-height: 18px;\n  border: 1px dashed var(--border);\n  border-radius: 8px;\n  text-align: center;\n  padding: 12px;\n}\n\n.asone-panel .addButton {\n  box-sizing: border-box;\n  flex: none;\n  width: 100%;\n  border: 1px dashed var(--border);\n  border-radius: 10px;\n  background: var(--bg-card);\n  height: 54px;\n  margin-top: 10px;\n  color: var(--text-soft);\n  font: inherit;\n  cursor: pointer;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  gap: 6px;\n  padding: 0 14px;\n  font-size: 14px;\n}\n.asone-panel .addButton:hover:not(:disabled) {\n  background: #1f2732;\n  border-color: #3b4756;\n}\n.asone-panel .addButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.asone-panel .cardFooter {\n  justify-content: flex-end;\n}\n\n.asone-panel .envPrefix {\n  font-family: var(--mono);\n  font-size: 12px;\n  color: var(--text-soft);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 4px 10px;\n  display: inline-block;\n  align-self: flex-start;\n  word-break: break-all;\n}\n\n/* \u2500\u2500 \u903B\u8F91\u6A21\u578B / \u6A21\u578B\u603B\u89C8 \u5B50\u9875(Nexus \u9762\u677F\u79FB\u690D,\u7C7B\u540D\u6CBF\u7528 Nexus)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .section {\n  color: var(--text-soft);\n  flex-direction: column;\n  gap: 12px;\n  display: flex;\n}\n\n/* \u4E24\u9875 section \u5BBD\u5EA6\u5DEE\u5F02(\u590D\u7528\u540C\u4E00 .section,\u4EC5 max-width \u4E0D\u540C) */\n.asone-panel .lm-section {\n  /* \u26A0\uFE0F 2026-10-25(m14379):\u903B\u8F91\u6A21\u578B\u5217\u8868\u5728\u52A0\u5BBD\u7684 content \u91CC\u5C45\u4E2D\u3002\n     \u663E\u5F0F width:min(720px,100%) \u2014\u2014 \u5149\u9760 max-width + margin-inline:auto\n     \u4F1A\u8BA9 flex item \u6536\u7F29\u5230\u5185\u5BB9\u5BBD(\u5B9E\u6D4B 531px),\u5FC5\u987B\u7ED9\u56FA\u5B9A\u5BBD\u5EA6\u3002 */\n  max-width: 720px;\n  width: min(720px, 100%);\n  margin-inline: auto;\n}\n.asone-panel .dep-section {\n  /* \u26A0\uFE0F 2026-10-25(m14922):\u6A21\u578B\u603B\u89C8\u6574\u7EC4\u5C45\u4E2D\u3002section \u5168\u5BBD,\u5361\u7247\u7EC4\u81EA\u8EAB\n     (dep-grid)\u7528 width:min(1464px,100%) + margin-inline:auto \u5C45\u4E2D;\n     \u4E0D\u518D\u7528 max-width 1200 \u9650\u5236(\u90A3\u4F1A\u5361\u6B7B\u53EA\u80FD 2 \u5217)\u3002 */\n  width: 100%;\n}\n.asone-panel .pv-section {\n  /* \u26A0\uFE0F 2026-10-25(m14379):\u5176\u4ED6\u4F9B\u5E94\u5546\u5217\u8868\u5728\u52A0\u5BBD\u7684 content \u91CC\u5C45\u4E2D\u3002\n     \u540C\u4E0A,\u663E\u5F0F\u5BBD\u5EA6\u9632\u6B62\u6536\u7F29(\u5B9E\u6D4B 248px)\u3002 */\n  max-width: 720px;\n  width: min(720px, 100%);\n  margin-inline: auto;\n}\n\n/* \u300C\u652F\u6301\u7684\u601D\u8003\u5F3A\u5EA6\u300D\u5FBD\u7AE0(\u603B\u89C8\u9875\u6BCF\u884C\u6A21\u578B\u4E00\u4E2A;pill \u6837\u5F0F\u7EDF\u4E00\u8D70 .pill) */\n.asone-panel .pill.efforts {\n  max-width: 22ch;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* Nexus \u7684 .err / .savedNotice \u662F\u7EAF\u6587\u5B57;As One \u5DF2\u6709 .err \u76D2\u5F0F\u53D8\u4F53,\n   \u7528\u4F5C\u7528\u57DF\u8986\u76D6(.section .err,\u7279\u5F02\u6027 0,2,0)\u8FD8\u539F Nexus \u5F62\u6001,\u4E0D\u52A8\u5168\u5C40 .err */\n.asone-panel .section .err {\n  padding: 0;\n  border: 0;\n  background: none;\n  border-radius: 0;\n  margin: 0;\n  color: #e0685f;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .savedNotice {\n  color: #5fbf7d;\n  font-size: 12px;\n  line-height: 18px;\n  margin: 0;\n}\n\n/* \u884C\u5361\u5934\u90E8(\u903B\u8F91\u6A21\u578B) */\n.asone-panel .rowIdentity {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.asone-panel .rowTag {\n  border: 1px solid #2b333f;\n  border-radius: 4px;\n  color: #8b94a3;\n  flex: none;\n  padding: 1px 6px;\n  font-size: 11px;\n  line-height: 16px;\n}\n\n.asone-panel .rowRuntime {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  margin-left: 8px;\n}\n\n/* \u5FBD\u7AE0 pill(Nexus \u540C\u6B3E) */\n.asone-panel .pill {\n  display: inline-block;\n  padding: 1px 7px;\n  border-radius: 9px;\n  font-size: 11px;\n  line-height: 16px;\n  white-space: nowrap;\n}\n.asone-panel .pill.ok {\n  background: #17301f;\n  color: #5fbf7d;\n}\n.asone-panel .pill.bad {\n  background: #33191a;\n  color: #e0685f;\n}\n.asone-panel .pill.info {\n  background: #1c2733;\n  color: #8fb8d8;\n}\n.asone-panel .pill.na {\n  background: #232a33;\n  color: #8b94a3;\n}\n.asone-panel .pill.metric {\n  background: #232a33;\n  color: #cfe3f5;\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .pill.alert {\n  background: #35290f;\n  color: #d9a441;\n}\n\n/* \u6A21\u578B\u603B\u89C8\u9876\u680F(2026-10-25 m14379 \u91CD\u65B0\u8BBE\u8BA1;m14922 \u8D77\u4E0D\u518D\u6709\u6279\u91CF\u6309\u94AE,\u53EA\u7559\u7EDF\u8BA1) */\n.asone-panel .dep-toolbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  flex-wrap: wrap;\n}\n.asone-panel .dep-summary {\n  color: var(--dim);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u6A21\u578B\u603B\u89C8\u591A\u5217\u5361\u7247(m14922 \u5B9A\u6848:\u4E0D\u518D\u5206\u7EC4\u6298\u53E0,\u6BCF\u90E8\u7F72\u4E00\u5361;\u5F39\u6027\u5217\u5BBD + \u6574\u7EC4\u5C45\u4E2D\u3002\n   \u26A0\uFE0F \u5217\u5BBD minmax(360px, 480px):1920 \u7A97\u53E3(content 1680,\u5185\u5BB9\u533A 1640)\u4E0B\u80FD\u6392 3 \u5217\n   (3\xD7480 + 2\xD712 = 1464 \u2264 1640);\u7A97\u53E3\u66F4\u7A84\u65F6 auto-fill \u81EA\u52A8\u964D\u4E3A 2 \u5217/1 \u5217\u3002\n   \u907F\u514D hyperai/deepseek-v4.1-flash-fastest \u8FD9\u7C7B\u957F\u6A21\u578B\u540D\u628A\u5361\u7247\u5185\u5BB9\u6324\u6210\u4E09\u884C\u3002 */\n.asone-panel .dep-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(360px, 480px));\n  justify-content: center;\n  gap: 12px;\n  flex: 1 1 auto;\n  min-width: 0;\n  width: min(1464px, 100%);\n  margin-inline: auto;\n}\n\n.asone-panel .depCard {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  border: 1px solid #262c36;\n  border-radius: 10px;\n  padding: 10px 12px;\n  background: #14181f;\n}\n\n.asone-panel .depCardHead {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex-wrap: wrap;\n  min-width: 0;\n}\n\n.asone-panel .depProvider {\n  flex: none;\n  font-size: 12px;\n  line-height: 18px;\n  color: #8b94a3;\n  border: 1px solid #262c36;\n  border-radius: 999px;\n  padding: 1px 8px;\n  background: #10141a;\n  white-space: nowrap;\n}\n\n.asone-panel .depCardBody {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  min-width: 0;\n}\n\n/* \u90E8\u7F72\u5361(\u65E0 hover \u9AD8\u4EAE:\u5361\u7247\u672C\u8EAB\u5DF2\u662F\u72EC\u7ACB\u5757,\u4E0D\u518D\u6A21\u4EFF\u884C) */\n.asone-panel .depCard:hover {\n  background: #161b23;\n}\n\n.asone-panel .depCode {\n  background: none;\n  padding: 0;\n  border: 0;\n  border-radius: 0;\n  font-family: var(--mono);\n  font-size: 12.5px;\n  color: #cfe3f5;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  flex: 1 1 auto;\n  min-width: 0;\n  max-width: 100%;\n}\n\n.asone-panel .depChips {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n  min-width: 0;\n}\n\n.asone-panel .depChipEdit {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  background: #232a33;\n  border-radius: 9px;\n  padding: 1px 6px 1px 8px;\n  line-height: 16px;\n}\n\n.asone-panel .chipLabel {\n  font-size: 11px;\n  color: #8b94a3;\n}\n\n.asone-panel .chipNum {\n  width: 42px;\n  background: #10141a;\n  border: 1px solid #262c36;\n  border-radius: 4px;\n  color: #cfe3f5;\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  padding: 1px 4px;\n  text-align: center;\n}\n.asone-panel .chipNum:disabled {\n  opacity: 0.5;\n}\n.asone-panel .chipNum::-webkit-outer-spin-button,\n.asone-panel .chipNum::-webkit-inner-spin-button {\n  -webkit-appearance: none;\n  margin: 0;\n}\n\n.asone-panel .depCheck {\n  margin-left: auto;\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 12px;\n  color: #8b94a3;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.asone-panel .checkInput {\n  width: 15px;\n  height: 15px;\n  accent-color: #5fbf7d;\n}\n.asone-panel .checkInput:disabled {\n  opacity: 0.4;\n}\n\n/* \u6A21\u578B\u603B\u89C8 2026-10-25(m14379)\u5DF2\u628A\u6279\u91CF\u6309\u94AE\u632A\u5230\u9876\u90E8\u5DE5\u5177\u6761(m14922 \u8D77\u79FB\u9664\u6309\u94AE),\n   \u4E0D\u518D\u7528 .section .headActions \u7AD6\u6392\u5F62\u6001\u3002 */\n\n/* \u2500\u2500 \u6E20\u9053\u9875\u4E09\u6BB5\u5F0F\u9AA8\u67B6(1:1 \u79FB\u690D Nexus styles.css \u5168\u5C40 .chan-* \u6BB5) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .chan-page { display: flex; flex-direction: column; gap: 16px; }\n\n.asone-panel .chan-card {\n  border: 1px solid #262c36;\n  border-radius: 12px;\n  padding: 16px;\n  background: #161a20;\n}\n\n.asone-panel .chan-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; }\n.asone-panel .chan-head h3 { margin: 0; font-size: 14px; color: #cfe3f5; }\n\n/* `.chan-tag` \u5DF2\u968F\u7528\u6237 2026-10-31 \u5B9A\u6848\u5220\u9664(\u300C\u7EDF\u4E00\u5220\u9664\u300E\u6A21\u578B\u76EE\u5F55\u300F\u65C1\u7684\u5FBD\u7AE0,\n * \u5982\u300E\u4E0A\u6E38 API \xB7 3 \u4E2A\u300F\u300E\u5DF2\u52FE\u9009 4 / 11\u300F\u300D)\u2014\u2014 \u56DB\u4E2A\u6E20\u9053\u9875\u7684\u6A21\u578B\u76EE\u5F55\u6807\u9898\u884C\u53EA\u5269 h3\u3002 */\n\n.asone-panel .chan-hint { color: #8b94a3; font-size: 12px; line-height: 1.6; margin: 6px 0 0; }\n.asone-panel .chan-empty { color: #8b94a3; font-size: 13px; }\n\n.asone-panel .chan-banner { margin: 0 0 8px; padding: 7px 10px; border-radius: 6px; font-size: 12px; }\n.asone-panel .chan-banner.err { color: #e0685f; border: 1px solid #4a2224; background: #241417; }\n.asone-panel .chan-banner.warn { color: #d9a441; border: 1px solid #4a3a1e; background: #241f14; }\n.asone-panel .chan-banner.ok { color: #5fbf7d; border: 1px solid #1d2f26; background: #14211a; }\n\n.asone-panel .chan-badge {\n  font-size: 11px;\n  padding: 2px 8px;\n  border-radius: 999px;\n  background: #1b2029;\n  color: #9fb3c8;\n}\n.asone-panel .chan-badge.ok { background: #17301f; color: #5fbf7d; }\n.asone-panel .chan-badge.bad { background: #33191a; color: #e0685f; }\n.asone-panel .chan-badge.off { background: #2a2418; color: #d9a441; }\n\n.asone-panel .chan-sub { color: #8b94a3; font-size: 12px; }\n\n/* \u6E20\u9053\u9875\u9876\u90E8\u52A8\u4F5C\u884C:ModelsPage \u5B50\u6807\u9898\u884C action \u672A\u63A5\u7EBF(\u58F3\u672A\u4F20),\u9875\u9762\u5185\u6E32\u67D3\n   \u4E0E Nexus \u5B50\u6807\u9898\u884C\u53F3\u7AEF\u52A8\u4F5C\u533A(act-note / act-btn)\u540C\u6B3E\u7684\u5237\u65B0\u6761 */\n.asone-panel .chan-action { display: flex; align-items: center; gap: 10px; justify-content: flex-end; margin-bottom: 2px; }\n\n/* \u8D26\u53F7\u5361\u5934(ProviderCard / SenseNovaPanel \u5171\u7528) */\n.asone-panel .acct-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }\n.asone-panel .acct-head h3 { margin: 0; font-size: 16px; color: #dfe3ea; }\n.asone-panel .who { display: flex; align-items: center; gap: 8px; }\n.asone-panel .who h3 { margin: 0; font-size: 16px; color: #dfe3ea; }\n.asone-panel .badges { display: flex; gap: 6px; flex-wrap: wrap; }\n.asone-panel .acct-side { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\n.asone-panel .acct-side b { font-size: 13px; color: #dfe3ea; font-variant-numeric: tabular-nums; }\n.asone-panel .acct-cta { margin-top: 10px; }\n.asone-panel .warn-line { color: #d9a441; }\n\n/* \u8D26\u53F7\u72B6\u6001\u5706\u70B9(\u4EC5\u6E20\u9053\u9875\u4F5C\u7528\u57DF\u5185;\u4E0D\u52A8 ModelTable \u89C6\u89C9\u5217\u7684\u6587\u672C .dot) */\n.asone-panel .chan-page .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex: none; }\n.asone-panel .chan-page .dot.ok { background: #22a06b; }\n.asone-panel .chan-page .dot.bad { background: #d92d20; }\n.asone-panel .chan-page .dot.off { background: #4b5563; }\n\n/* \u2500\u2500 \u7EDF\u4E00\u8D26\u53F7\u72B6\u6001\u884C(Trae / WorkBuddy / Qoder / SenseNova \u56DB\u5904\u5171\u7528) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n   \u7248\u5F0F\u7531\u7528\u6237 2026-10-30 \u5B9A\u6848:\u4E00\u4E2A\u8D26\u53F7\u4E00\u4E2A\u6846(\u591A\u8D26\u53F7\u5C31\u591A\u4E2A\u6846,\u4E0D\u5408\u5E76),\n   \u6846\u5185\u5DE6\u7528\u6237\u540D\u3001\u53F3\u5269\u4F59\u79EF\u5206/\u5230\u671F\u3002\n   \u5237\u65B0\u6309\u94AE 2026-10-30 \u7B2C\u4E8C\u8F6E\u4E0A\u79FB\u5230**\u5B50\u6807\u9898\u884C\u53F3\u7AEF**(\u89C1 ModelsPage.tsx),\n   \u8D26\u53F7\u5E26\u91CC\u53EA\u5269\u8D26\u53F7\u6846,\u6240\u4EE5\u4E0D\u518D\u9700\u8981 `.acct-band` \u7684\u53F3\u4FA7\u680F\u3002\n   SenseNova \u4E00\u4E2A\u8D26\u53F7\u8981\u6446\u4E24\u4E09\u4E2A\u6C60,\u5FBD\u7AE0\u653E\u4E0D\u4E0B\u5C31\u6362\u884C \u2014\u2014 \u5B81\u53EF\u8BA9\u6846\u53D8\u9AD8,\n   \u4E5F\u4E0D\u80FD\u628A\u5FBD\u7AE0\u538B\u51FA\u6846\u5916(\u90A3\u6837\u6570\u5B57\u4F1A\u88AB\u88C1\u6389,\u7B49\u4E8E\u6CA1\u663E\u793A)\u3002 */\n.asone-panel .acct-cards {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.asone-panel .acct-card { padding: 14px 16px; }\n.asone-panel .acct-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px 12px;\n  flex-wrap: wrap;\n}\n.asone-panel .acct-row-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto; }\n.asone-panel .acct-name {\n  font-size: 15px;\n  /* \u7528\u6237\u540D\u52A0\u7C97(\u7528\u6237 2026-10-30 \u5B9A\u6848):\u4E00\u884C\u91CC\u6700\u8BE5\u5148\u88AB\u8BA4\u51FA\u6765\u7684\u662F\u300C\u8FD9\u662F\u8C01\u7684\u8D26\u53F7\u300D,\n     \u53F3\u4FA7\u90A3\u51E0\u4E2A\u5FBD\u7AE0\u6570\u5B57\u53CD\u800C\u662F\u7B2C\u4E8C\u773C\u4FE1\u606F\u3002 */\n  font-weight: 700;\n  color: #eef2f8;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.asone-panel .acct-row-right { display: flex; align-items: center; gap: 8px; flex: none; }\n.asone-panel .acct-row-right .chan-badge b { font-variant-numeric: tabular-nums; font-weight: 600; }\n\n/* \u6A21\u578B\u8868\u7684\u53EA\u8BFB\u5217(Qoder \u8FD9\u7C7B\u672A\u767B\u8BB0\u884C\u4E0D\u6446\u8F93\u5165\u6846) */\n.asone-panel .plain-cell { color: #9fb3c8; font-size: 12px; font-variant-numeric: tabular-nums; }\n\n/* \u6E20\u9053\u9875\u4E3B\u6309\u94AE(Nexus ProviderCard \u540C\u6B3E;\u4E0D\u6539\u52A8\u65E2\u6709 .btn) */\n.asone-panel .chan-page .btn.primary { background: #1d3550; }\n.asone-panel .chan-page .btn.primary:hover:not(:disabled) { background: #24425f; }\n\n/* \u901A\u7528\u7F51\u683C\u8868(\u51ED\u636E / \u989D\u5EA6 / \u8D26\u53F7\u7BA1\u7406 / \u8FDE\u901A\u6027\u5171\u7528) */\n.asone-panel .grid { width: 100%; border-collapse: collapse; margin: 8px 0; }\n.asone-panel .grid th, .asone-panel .grid td { border-bottom: 1px solid #262c36; padding: 7px 6px; font-size: 13px; text-align: left; }\n.asone-panel .grid th { background: #1b2029; color: #9fb3c8; font-weight: 600; }\n.asone-panel .grid th.num, .asone-panel .grid td.num { text-align: right; font-variant-numeric: tabular-nums; }\n.asone-panel .grid td.sub { color: #8b94a3; }\n.asone-panel .th-note { margin-left: 6px; color: #6b7484; font-weight: 400; }\n\n/* SenseNova \u8D26\u53F7\u5361 + \u79EF\u5206\u6C60(\u901A\u7528\u6C60\u7D2B / \u4E13\u5C5E\u6C60\u6A59)\n   \u26A0\uFE0F 2026-10-23:\u4FDD\u6301\u5361\u5BBD 420px \u8D77(\u7528\u6237\u8981\u6C42\u4E0D\u538B\u7A84\u5361\u7247\u5BFC\u81F4\u6837\u5F0F\u9519\u4E71)\u3002\n   **\u5F39\u6027\u5E03\u5C40**:`repeat(auto-fill, minmax(420px, 1fr))` \u672C\u8EAB\u5C31\u4F1A\u5728\u9875\u9762\u5BBD\u5EA6\n   \u8DB3\u591F\u65F6\u653E 3 \u5F20\u5355\u884C\u3001\u5BBD\u5EA6\u4E0D\u8DB3\u65F6\u81EA\u52A8\u6362\u884C \u2014\u2014 \u52A0\u5BBD .content \u53EA\u662F\u8BA9\u300C\u8DB3\u591F\u300D\n   \u7684\u95E8\u69DB\u5728\u9ED8\u8BA4\u7A97\u53E3\u4E0B\u5C31\u8FBE\u5230(3\xD7420 + 2\xD716 = 1292px \u2264 \u5185\u5BB9\u533A)\u3002 */\n.asone-panel .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }\n\n.asone-panel .pools {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\n  gap: 12px;\n  margin: 12px 0 0;\n}\n.asone-panel .pool {\n  position: relative;\n  overflow: hidden;\n  display: flex;\n  flex-direction: column;\n  border: 1px solid #262c36;\n  border-radius: 10px;\n  padding: 12px 12px 10px;\n  background: #12151a;\n}\n.asone-panel .pool-accent { position: absolute; inset: 0 0 auto 0; height: 2px; }\n.asone-panel .pool.general .pool-accent { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }\n.asone-panel .pool.special .pool-accent { background: linear-gradient(90deg, #f97316, #fb923c); }\n.asone-panel .pool-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }\n.asone-panel .pool-head strong { color: #cfe3f5; font-size: 12px; }\n.asone-panel .pdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }\n.asone-panel .pool.general .pdot { background: #a78bfa; box-shadow: 0 0 0 2px #241d3d; }\n.asone-panel .pool.special .pdot { background: #fb923c; box-shadow: 0 0 0 2px #2e2118; }\n.asone-panel .row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 11px; color: #8b94a3; margin: 8px 0 4px; }\n.asone-panel .row-label { flex: none; }\n.asone-panel .row-val { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }\n.asone-panel .row-val b { font-size: 15px; color: #dfe3ea; font-variant-numeric: tabular-nums; font-weight: 600; }\n.asone-panel .row-val .pct { color: #9fb3c8; font-size: 11px; font-variant-numeric: tabular-nums; }\n.asone-panel .row.split { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #262c36; }\n.asone-panel .bar { height: 5px; background: #1b2029; border-radius: 999px; overflow: hidden; }\n.asone-panel .bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }\n.asone-panel .pool.general .bar-fill { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }\n.asone-panel .pool.special .bar-fill { background: linear-gradient(90deg, #f97316, #fb923c); }\n.asone-panel .pool.cooling .bar-fill { background: #4b5563; }\n.asone-panel .grant, .asone-panel .reset-row {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  min-height: 30px;\n  box-sizing: border-box;\n  margin-top: auto;\n  padding: 0 2px;\n  border-radius: 8px;\n  font-size: 11px;\n  color: #8b94a3;\n}\n.asone-panel .grant b { color: #dfe3ea; font-size: 13px; font-variant-numeric: tabular-nums; }\n.asone-panel .g-label { flex: 1 1 auto; }\n.asone-panel .reset-row { justify-content: space-between; padding: 0 2px; }\n.asone-panel .r-label { flex: none; }\n.asone-panel .r-val { color: #cfe3f5; font-variant-numeric: tabular-nums; white-space: nowrap; }\n\n/* \u9875\u811A\u8BF4\u660E */\n.asone-panel .foot { margin-top: 0; }\n\n/* ===========================================================================\n   \u903B\u8F91\u6A21\u578B\u5B50\u9875(LogicalModelsPage)\u4E25\u683C\u590D\u523B Nexus LogicalModels.vue \u7684 scoped\n   \u6837\u5F0F \u2014\u2014 \u4E0A\u65B9 .rows/.rowCard/.rowBtn/.addButton/.editor \u7B49\u901A\u7528\u5757\u7531\u4F9B\u5E94\u5546\u9875\u7B49\n   \u5171\u7528,\u4E0D\u80FD\u6539;\u8FD9\u91CC\u5BF9 .lm-section \u4F5C\u7528\u57DF\u5185\u7684\u5DEE\u5F02\u505A Nexus \u540C\u503C\u8986\u76D6\u3002\n   =========================================================================== */\n\n/* ul.rows:Nexus gap 8px(\u901A\u7528\u5757\u662F\u4F9B\u5E94\u5546\u9875\u7684 10px) */\n.asone-panel .lm-section .rows {\n  gap: 8px;\n}\n\n/* li.rowCard:Nexus \u8FB9 #262c36 / \u5E95 #161a20 / gap 12px */\n.asone-panel .lm-section .rowCard {\n  border-color: #262c36;\n  background: #161a20;\n  gap: 12px;\n}\n\n/* rowHead \u95F4\u8DDD 10px */\n.asone-panel .lm-section .rowHead {\n  gap: 10px;\n}\n\n/* rowName \u884C\u9AD8 22px */\n.asone-panel .lm-section .rowName {\n  line-height: 22px;\n}\n\n/* rowActions \u95F4\u8DDD 4px */\n.asone-panel .lm-section .rowActions {\n  gap: 4px;\n}\n\n/* rowBtn:\u5706\u89D2 4px / \u5185\u8DDD 0 10px / \u8FB9 #2b333f / \u5B57\u8272 #cfe3f5;hover \u5E95 #1f2732 */\n.asone-panel .lm-section .rowBtn {\n  border-radius: 4px;\n  padding: 0 10px;\n  border-color: #2b333f;\n  color: #cfe3f5;\n  line-height: 18px;\n}\n.asone-panel .lm-section .rowBtn:hover:not(:disabled) {\n  background: #1f2732;\n}\n\n/* addButton:\u865A\u7EBF\u8FB9 #2b333f / \u5E95 #161a20 / margin-top 8px(\u4E0E .rows \u884C\u8DDD\u4E00\u81F4) */\n.asone-panel .lm-section .addButton {\n  border-color: #2b333f;\n  background: #161a20;\n  margin-top: 8px;\n  line-height: 22px;\n}\n\n/* \u2500\u2500 \u7F16\u8F91\u5668(Nexus LogicalModelEditor.vue scoped \u540C\u503C) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n/* Nexus \u7F16\u8F91\u5668\u5168\u90E8 .input \u503C:\u5E95 #10141a / \u8FB9 #2b333f / \u5B57\u8272 #cfe3f5 /\n   \u5B57\u53F7 14px / \u884C\u9AD8 22px / \u805A\u7126\u8FB9 #5686fe(\u901A\u7528 .input \u662F\u9875\u9762\u5168\u5C40 13px \u53D8\u91CF\u7248) */\n.asone-panel .lm-section .editor .input {\n  width: 100%;\n  height: 32px;\n  padding: 0 10px;\n  border: 1px solid #2b333f;\n  border-radius: 6px;\n  background: #10141a;\n  color: #cfe3f5;\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n}\n.asone-panel .lm-section .editor .input::placeholder {\n  color: #5c6673;\n}\n.asone-panel .lm-section .editor .input:focus {\n  border-color: #5686fe;\n  outline: none;\n}\n.asone-panel .lm-section .editor .input.inputBad {\n  border-color: #e0685f;\n}\n.asone-panel .lm-section .editor .input.inputBad:focus {\n  border-color: #e0685f;\n}\n.asone-panel .lm-section .editor .input:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n.asone-panel .lm-section .editor .selectInput {\n  cursor: pointer;\n}\n\n/* fieldLabel / fieldNote / fieldWarn / fieldValue:Nexus \u8272\u4E0E\u884C\u9AD8 */\n.asone-panel .lm-section .editor .fieldLabel {\n  color: #8b94a3;\n  font-weight: 500;\n  line-height: 18px;\n}\n.asone-panel .lm-section .editor .fieldValue {\n  color: #cfe3f5;\n  font-size: 14px;\n  line-height: 22px;\n}\n.asone-panel .lm-section .editor .fieldNote {\n  color: #5c6673;\n  font-size: 12px;\n  line-height: 18px;\n}\n.asone-panel .lm-section .editor .fieldWarn {\n  color: #8b94a3;\n  font-size: 12px;\n  line-height: 18px;\n}\n.asone-panel .lm-section .editor .fieldWarn b {\n  color: #cfe3f5;\n  font-weight: 500;\n}\n\n/* chainHead:\u6863\u94FE\u5C0F\u8282\u5934(\u9875\u9762\u6B64\u524D\u672A\u6E32\u67D3\u8BE5 class) */\n.asone-panel .chainHead {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n/* nodeRow \u5185:.input \u7684 width:100% \u4F1A\u8BA9\u884C\u6EA2\u51FA\u5361\u7247,\u5FC5\u987B\u8D62\u8FC7\u5B83(Nexus \u540C\u503C) */\n.asone-panel .lm-section .editor .nodeRow .nodeProvider {\n  width: 150px;\n  flex: 0 0 150px;\n}\n.asone-panel .lm-section .editor .nodeRow .nodeSelect {\n  width: auto;\n  flex: 1 1 0;\n  min-width: 0;\n}\n\n/* groupIdx \u5B57\u8272 #cfe3f5(\u901A\u7528\u5757\u662F --text) */\n.asone-panel .lm-section .editor .groupIdx {\n  color: #cfe3f5;\n}\n\n/* addModelButton:\u65B9\u89D2 4px / \u8FB9 #2b333f / \u5E95\u900F\u660E / hover \u5E95 #1f2732 */\n.asone-panel .lm-section .editor .addModelButton {\n  border: 1px solid #2b333f;\n  border-radius: 4px;\n  height: 28px;\n  padding: 0 10px;\n  color: #cfe3f5;\n  font: inherit;\n  cursor: pointer;\n  background: none;\n  align-self: flex-start;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  font-size: 12px;\n  line-height: 18px;\n}\n.asone-panel .lm-section .editor .addModelButton:hover:not(:disabled) {\n  background: #1f2732;\n  border-color: #2b333f;\n}\n.asone-panel .lm-section .editor .addModelButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n/* iconButton:\u5B57\u8272 #8b94a3 / hover \u5E95 #1f2732 + \u5B57 #cfe3f5;\u5371\u9669\u6863 hover \u5B57 #e0685f */\n.asone-panel .lm-section .editor .iconButton {\n  color: #8b94a3;\n  cursor: pointer;\n  border: none;\n  background: none;\n  border-radius: 4px;\n  padding: 2px 6px;\n  font-size: 12px;\n  flex-shrink: 0;\n}\n.asone-panel .lm-section .editor .iconButton:hover:not(:disabled) {\n  background: #1f2732;\n  color: #cfe3f5;\n}\n.asone-panel .lm-section .editor .iconButtonDanger:hover:not(:disabled) {\n  color: #e0685f;\n}\n.asone-panel .lm-section .editor .iconButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n/* primaryButton / secondaryButton:Nexus 36px / \u5706\u89D2 6px / \u5185\u8DDD 0 14px /\n   \u5B57 14px \u884C\u9AD8 22px;\u4E3B\u94AE\u5E95 #2f4d6b hover #3a5d80,\u526F\u94AE\u900F\u660E\u5E95 + \u8FB9 #2b333f */\n.asone-panel .lm-section .editor .primaryButton,\n.asone-panel .lm-section .editor .secondaryButton {\n  box-sizing: border-box;\n  height: 36px;\n  padding: 0 14px;\n  border-radius: 6px;\n  font: inherit;\n  cursor: pointer;\n  display: inline-flex;\n  justify-content: center;\n  align-items: center;\n  gap: 4px;\n  font-size: 14px;\n  line-height: 22px;\n}\n.asone-panel .lm-section .editor .primaryButton {\n  background: #2f4d6b;\n  border: none;\n  color: #cfe3f5;\n}\n.asone-panel .lm-section .editor .primaryButton:hover:not(:disabled) {\n  background: #3a5d80;\n}\n.asone-panel .lm-section .editor .secondaryButton {\n  border: 1px solid #2b333f;\n  color: #cfe3f5;\n  background: none;\n}\n.asone-panel .lm-section .editor .secondaryButton:hover:not(:disabled) {\n  background: #1f2732;\n  border-color: #2b333f;\n}\n.asone-panel .lm-section .editor .primaryButton:disabled,\n.asone-panel .lm-section .editor .secondaryButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n/* ===========================================================================\n   \u5176\u4ED6\u4F9B\u5E94\u5546\u9875(ProvidersPage):\u9010\u6761\u7167\u642C Nexus panel/web/src/Providers.vue \u7684\n   \\3c style scoped>(L1005-1261)\u3002\u7C7B\u540D\u5168\u90E8\u52A0 .pv- \u524D\u7F00\u4EE5\u514D\u4E0E As One \u73B0\u6709\u6837\u5F0F\u51B2\u7A81,\n   \u989C\u8272 / \u5C3A\u5BF8 / \u95F4\u8DDD / \u5706\u89D2 / \u8FB9\u6846 / \u5B57\u91CD\u9010\u5B57\u4FDD\u7559(\u6697\u8272\u57FA\u8C03\u4E0E\u73B0\u6709\u9875\u9762\u4E00\u81F4)\u3002\n   =========================================================================== */\n\n/* \u5E03\u5C40\u5BF9\u7167 dsh \u7684\u4F9B\u5E94\u5546\u5361\u7247:\u5916\u5C42\u4E00\u884C\u5934 + \u5185\u5D4C\u7070\u9762\u677F(\u5B57\u6BB5 / \u6A21\u578B\u76EE\u5F55) */\n.asone-panel .pv-section {\n  max-width: 720px;\n  color: #cfe3f5;\n  flex-direction: column;\n  gap: 12px;\n  display: flex;\n}\n.asone-panel .pv-title { color: #cfe3f5; margin: 0; font-size: 16px; font-weight: 500; line-height: 24px; }\n.asone-panel .pv-intro { color: #8b94a3; margin: 0; font-size: 14px; line-height: 22px; }\n.asone-panel .pv-err { color: #e0685f; font-size: 12px; line-height: 18px; }\n.asone-panel .pv-savedNotice { color: #5fbf7d; font-size: 12px; line-height: 18px; margin: 0; }\n/* As One \u65B0\u589E:API \u5BC6\u94A5\u8F93\u5165\u6846\u4E0B\u9762\u90A3\u884C\u300C\u5BC6\u94A5\u7531\u51ED\u636E\u5C42\u7BA1\u7406\u300D\u8BF4\u660E(\u5951\u7EA6\u65E0\u5199\u5BC6\u94A5\u63A5\u53E3)\u3002 */\n.asone-panel .pv-hint { color: #8b94a3; margin: 0; font-size: 12px; line-height: 18px; }\n\n/* \u5361\u7247 */\n.asone-panel .pv-rows { flex-direction: column; gap: 10px; margin: 12px 0 0; padding: 0; list-style: none; display: flex; }\n.asone-panel .pv-rowCard {\n  border: 1px solid #262c36;\n  background: #161a20;\n  border-radius: 10px;\n  flex-direction: column;\n  gap: 10px;\n  padding: 12px 14px;\n  display: flex;\n}\n.asone-panel .pv-rowHead { align-items: center; gap: 8px; display: flex; }\n.asone-panel .pv-rowName { color: #cfe3f5; font-size: 14px; font-weight: 500; line-height: 22px; }\n.asone-panel .pv-credentialDot { flex: none; width: 8px; height: 8px; border-radius: 50%; display: inline-block; }\n.asone-panel .pv-dotOk { background: #22a06b; }\n.asone-panel .pv-dotMissing { background: #d92d20; }\n.asone-panel .pv-rowActions { align-items: center; gap: 8px; margin-left: auto; display: inline-flex; }\n.asone-panel .pv-cardFooter { justify-content: flex-end; gap: 8px; }\n.asone-panel .pv-rowBtn {\n  border-radius: 6px;\n  height: 28px;\n  padding: 0 12px;\n  font-size: 12px;\n  line-height: 18px;\n  cursor: pointer;\n  border: 1px solid #2b333f;\n  background: transparent;\n  color: #cfe3f5;\n}\n.asone-panel .pv-rowBtn:hover:not(:disabled) { background: #1f2732; }\n.asone-panel .pv-rowBtn.pv-rowBtnDanger { color: #e0685f; }\n.asone-panel .pv-rowBtn:disabled { opacity: 0.4; cursor: default; }\n\n/* \u5185\u5C42\u9762\u677F */\n.asone-panel .pv-panel {\n  background: #1b2029;\n  border: 1px solid #232a34;\n  border-radius: 8px;\n  padding: 12px;\n  flex-direction: column;\n  gap: 6px;\n  display: flex;\n}\n.asone-panel .pv-panelTitle { color: #cfe3f5; font-size: 13px; font-weight: 500; line-height: 20px; margin-bottom: 2px; }\n.asone-panel .pv-fieldLabel { color: #8b94a3; font-size: 12px; font-weight: 500; line-height: 18px; margin-top: 4px; }\n\n/* \u6A21\u578B\u76EE\u5F55 */\n.asone-panel .pv-catalogSection { flex-direction: column; gap: 6px; display: flex; }\n.asone-panel .pv-catalogTitle { color: #8b94a3; font-size: 12px; font-weight: 500; line-height: 18px; }\n.asone-panel .pv-modelListHead { justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 2px; display: flex; }\n.asone-panel .pv-modelCatalogMeta, .asone-panel .pv-modelEmpty { color: #5c6673; margin: 0; font-size: 12px; line-height: 18px; }\n.asone-panel .pv-headActions { align-items: center; gap: 2px; display: inline-flex; }\n.asone-panel .pv-modelList { flex-direction: column; gap: 8px; display: flex; }\n.asone-panel .pv-modelEntry {\n  border: 1px solid #2b333f;\n  background: #161a20;\n  border-radius: 8px;\n  padding: 8px;\n  gap: 6px;\n  display: flex;\n  flex-direction: column;\n}\n.asone-panel .pv-modelRow {\n  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;\n  align-items: center;\n  gap: 6px;\n  display: grid;\n}\n.asone-panel .pv-modelAdvanced { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 2px 2px 0; display: grid; }\n.asone-panel .pv-modelField { flex-direction: column; gap: 4px; min-width: 0; display: flex; }\n.asone-panel .pv-modelInputTypes { border: none; grid-column: 1 / -1; min-width: 0; margin: 0; padding: 0; }\n.asone-panel .pv-modelInputTypes legend { margin-bottom: 4px; padding: 0; }\n.asone-panel .pv-modelInputChoices { flex-wrap: wrap; align-items: center; gap: 16px; min-height: 32px; display: flex; }\n.asone-panel .pv-modelFieldLabel { color: #8b94a3; font-size: 12px; line-height: 18px; }\n.asone-panel .pv-modelEmpty { border: 1px dashed #2b333f; border-radius: 8px; text-align: center; padding: 12px; }\n\n/* \u8F93\u5165 */\n.asone-panel .pv-input {\n  box-sizing: border-box;\n  border: 1px solid #2b333f;\n  border-radius: 6px;\n  width: 100%;\n  height: 32px;\n  font: inherit;\n  background: #10141a;\n  color: #cfe3f5;\n  padding: 0 10px;\n  font-size: 14px;\n  line-height: 22px;\n}\n.asone-panel .pv-input::placeholder { color: #5c6673; }\n.asone-panel .pv-input:focus { border-color: #5686fe; outline: none; }\n.asone-panel .pv-input:disabled { opacity: 0.6; cursor: default; }\n.asone-panel .pv-selectInput { cursor: pointer; max-width: 280px; }\n\n/* \u6309\u94AE */\n.asone-panel .pv-primaryButton, .asone-panel .pv-secondaryButton {\n  box-sizing: border-box;\n  border-radius: 6px;\n  height: 36px;\n  font: inherit;\n  cursor: pointer;\n  border: none;\n  justify-content: center;\n  align-items: center;\n  gap: 4px;\n  padding: 0 14px;\n  font-size: 14px;\n  line-height: 22px;\n  display: inline-flex;\n}\n.asone-panel .pv-primaryButton { background: #2f4d6b; color: #cfe3f5; }\n.asone-panel .pv-primaryButton:hover:not(:disabled) { background: #3a5d80; }\n.asone-panel .pv-secondaryButton { border: 1px solid #2b333f; color: #cfe3f5; background: none; }\n.asone-panel .pv-secondaryButton:hover:not(:disabled) { background: #1f2732; }\n.asone-panel .pv-primaryButton:disabled, .asone-panel .pv-secondaryButton:disabled { opacity: 0.4; cursor: default; }\n\n/* \u300C\u6DFB\u52A0\u300D\u6309\u94AE = \u4E00\u6574\u5757\u865A\u7EBF\u5361\u7247(\u4E0E LogicalModels.vue \u540C\u4E00\u5957\u6837\u5F0F,\u5BF9\u7167 dsh \u7684\u6DFB\u52A0\u5361):\n   \u9AD8\u5EA6 54px / \u5706\u89D2 10px / \u5E95\u8272\u4E0E .pv-rowCard \u4E00\u81F4 \u2192 \u4E0E\u4E0A\u9762\u7684\u5361\u7247\u4E00\u6837\u5927\u3002 */\n.asone-panel .pv-addButton {\n  box-sizing: border-box;\n  flex: none;\n  width: 100%;\n  border: 1px dashed #2b333f;\n  border-radius: 10px;\n  background: #161a20;\n  height: 54px;\n  margin-top: 10px; /* \u4E0E .pv-rows \u7684\u884C\u8DDD\u4E00\u81F4 */\n  color: #cfe3f5;\n  font: inherit;\n  cursor: pointer;\n  justify-content: center;\n  align-items: center;\n  gap: 6px;\n  padding: 0 14px;\n  font-size: 14px;\n  line-height: 22px;\n  display: flex;\n}\n.asone-panel .pv-addButton:hover:not(:disabled) { background: #1f2732; border-color: #3b4756; }\n.asone-panel .pv-addButton:disabled { opacity: 0.4; cursor: default; }\n.asone-panel .pv-linkButton {\n  border-radius: 4px;\n  height: 28px;\n  color: #8b94a3;\n  cursor: pointer;\n  background: none;\n  border: none;\n  align-items: center;\n  padding: 0 8px;\n  font-size: 12px;\n  line-height: 18px;\n  display: inline-flex;\n}\n.asone-panel .pv-linkButton:hover:not(:disabled) { background: #1f2732; color: #cfe3f5; }\n.asone-panel .pv-linkButton:disabled { opacity: 0.4; cursor: default; }\n.asone-panel .pv-addModelButton {\n  box-sizing: border-box;\n  border: 1px solid #2b333f;\n  border-radius: 6px;\n  height: 30px;\n  color: #cfe3f5;\n  font: inherit;\n  cursor: pointer;\n  background: none;\n  align-self: flex-start;\n  align-items: center;\n  gap: 4px;\n  padding: 0 10px;\n  font-size: 12px;\n  line-height: 18px;\n  display: inline-flex;\n}\n.asone-panel .pv-addModelButton:hover:not(:disabled) { background: #1f2732; }\n.asone-panel .pv-addModelButton:disabled { opacity: 0.4; cursor: default; }\n\n.asone-panel .pv-iconButton {\n  background: none;\n  border: none;\n  color: #8b94a3;\n  cursor: pointer;\n  padding: 2px 6px;\n  font-size: 12px;\n  flex-shrink: 0;\n  border-radius: 4px;\n}\n.asone-panel .pv-iconButton:hover:not(:disabled) { background: #1f2732; color: #cfe3f5; }\n.asone-panel .pv-iconButton.pv-iconButtonDanger:hover:not(:disabled) { color: #e0685f; }\n.asone-panel .pv-choice { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }\n/* Nexus \u539F\u4E3A\u5168\u5C40 `input[type="checkbox"]`;\u8FD9\u91CC\u6309 .pv- \u4F5C\u7528\u57DF\u6536\u7A84\u5230\u672C\u9875\u4E24\u4E2A\u52FE\u9009\u4F4D\n   (\u8F93\u5165\u7C7B\u578B / \u9009\u62E9\u5668\u5019\u9009\u9879),\u907F\u514D\u5F71\u54CD\u5176\u4ED6\u9875\u9762\u3002 */\n.asone-panel .pv-choice input[type="checkbox"],\n.asone-panel .pv-candidateLabel input[type="checkbox"] { accent-color: #5686fe; }\n\n/* \u9009\u62E9\u5668\u5F39\u7A97 */\n.asone-panel .pv-mask {\n  position: fixed;\n  inset: 0;\n  background: rgba(0, 0, 0, 0.55);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 50;\n}\n.asone-panel .pv-dialog {\n  width: 520px;\n  max-width: calc(100vw - 32px);\n  max-height: calc(100vh - 64px);\n  overflow: auto;\n  background: #161a20;\n  border: 1px solid #2b333f;\n  border-radius: 10px;\n  padding: 16px 18px;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n.asone-panel .pv-dialogTitle { margin: 0; font-size: 15px; font-weight: 500; color: #cfe3f5; }\n.asone-panel .pv-dialogDesc { margin: 0; font-size: 13px; color: #8b94a3; }\n.asone-panel .pv-candidateToolbar { align-items: center; gap: 8px; margin-bottom: 6px; display: flex; }\n.asone-panel .pv-candidateSearch { flex: 240px; min-width: 0; }\n.asone-panel .pv-candidateList {\n  flex-direction: column;\n  gap: 2px;\n  max-height: 320px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n  display: flex;\n  overflow-y: auto;\n}\n.asone-panel .pv-candidate { border-radius: 6px; }\n.asone-panel .pv-candidate:hover { background: #1f2732; }\n.asone-panel .pv-candidateLabel { cursor: pointer; align-items: center; gap: 8px; padding: 6px 8px; display: flex; }\n.asone-panel .pv-candidateId {\n  min-width: 0;\n  font-family: ui-monospace, Consolas, monospace;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  flex: auto;\n  font-size: 13px;\n  overflow: hidden;\n}\n.asone-panel .pv-candidateEmpty { color: #8b94a3; text-align: center; margin: 24px 0; font-size: 13px; line-height: 20px; }\n.asone-panel .pv-dialogFooter { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }\n\n/* ===========================================================================\n    \u8BBE\u7F6E\u9875\u8FFD\u52A0\u6837\u5F0F(Nexus Settings.vue 1:1 \u590D\u523B\u914D\u5957;\u53EA\u8FFD\u52A0,\u4E0D\u52A8\u65E2\u6709\u89C4\u5219)\n    =========================================================================== */\n\n/* \u9875\u5934 h1(Nexus .ui-page-title) */\n.asone-panel .ui-page-title {\n  margin: 0 0 4px;\n  font-size: 18px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n/* \u63A7\u4EF6(Nexus .ui-input / .ui-select) */\n.asone-panel .ui-input,\n.asone-panel .ui-select {\n  width: 100%;\n  box-sizing: border-box;\n  height: 32px;\n  padding: 0 10px;\n  font: inherit;\n  font-size: 13px;\n  color: var(--text-soft);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n}\n.asone-panel .ui-input:focus,\n.asone-panel .ui-select:focus {\n  outline: none;\n  border-color: var(--accent);\n}\n.asone-panel .ui-input[type="number"] {\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .ui-select {\n  cursor: pointer;\n}\n.asone-panel .ui-check input[type="checkbox"] {\n  accent-color: var(--accent);\n  width: auto;\n}\n\n/* \u72EC\u7ACB\u6309\u94AE(Nexus \u88F8\u7C7B .ui-btn-ghost / .ui-btn-danger / .ui-btn-primary) */\n.asone-panel .ui-btn-ghost {\n  appearance: none;\n  font: inherit;\n  color: var(--text-soft);\n  background: none;\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  height: 30px;\n  padding: 0 12px;\n  font-size: 12.5px;\n  cursor: pointer;\n}\n.asone-panel .ui-btn-ghost:hover:not(:disabled) {\n  border-color: var(--accent);\n  color: var(--text);\n}\n.asone-panel .ui-btn-ghost:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.asone-panel .ui-btn-danger {\n  appearance: none;\n  font: inherit;\n  color: var(--bad);\n  background: none;\n  border: 1px solid transparent;\n  border-radius: 6px;\n  height: 30px;\n  padding: 0 10px;\n  font-size: 12px;\n  cursor: pointer;\n}\n.asone-panel .ui-btn-danger:hover:not(:disabled) {\n  background: rgba(224, 104, 95, 0.12);\n}\n.asone-panel .ui-btn-danger:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.asone-panel .ui-btn-primary {\n  appearance: none;\n  font: inherit;\n  color: #fff;\n  background: var(--accent);\n  border: 1px solid var(--accent);\n  border-radius: 6px;\n  height: 30px;\n  padding: 0 12px;\n  font-size: 12.5px;\n  cursor: pointer;\n}\n.asone-panel .ui-btn-primary:hover:not(:disabled) {\n  filter: brightness(1.12);\n}\n.asone-panel .ui-btn-primary:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n/* \u9000\u907F\u66F2\u7EBF(Nexus .ui-chart-wrap / .ui-chart) */\n.asone-panel .ui-chart-wrap {\n  margin-top: 10px;\n}\n.asone-panel .ui-chart {\n  display: block;\n  width: 100%;\n}\n\n/* \u5361\u7247\u5934:h2 \u4E0E .ui-card-sub \u76F8\u90BB\u6392\u5E03(\u8FD8\u539F Nexus \u7684 flex \u8D77\u70B9\u5E03\u5C40) */\n.asone-panel .ui-card-head {\n  justify-content: flex-start;\n}\n\n/* <960px:\u8BBE\u7F6E\u9875\u65E0 nav(2026-10-25 m14922 \u79FB\u9664\u4FA7\u680F),\u5361\u7247\u5934\u7684\u5C0F\u5C4F\u89C4\u5219\u4FDD\u7559 */\n@media (max-width: 959px) {\n  .asone-panel .ui-layout {\n    flex-direction: column;\n    gap: 12px;\n  }\n  .asone-panel .ui-card {\n    scroll-margin-top: 90px;\n  }\n}\n\n/* ===========================================================================\n   SenseNova \u4E13\u9875(SenseNovaPage)\u4E25\u683C\u590D\u523B Nexus SenseNovaPanel.vue \u7684 scoped CSS\u3002\n   \u26A0\uFE0F \u5168\u90E8\u52A0 `.sn-` \u524D\u7F00:.row / .bar / .bar-fill / .pill / .grid \u8FD9\u4E9B\u540D\u5B57\u5728\n   styles.css \u91CC**\u5DF2\u6709\u5168\u5C40\u5B9A\u4E49**(\u72B6\u6001\u6761\u3001ModelTable\u3001\u6E20\u9053\u9875\u5171\u7528),\u88F8\u7528\u4F1A\u4E92\u76F8\u6C61\u67D3;\n   \u524D\u7F00\u7248\u9010\u5B57\u642C\u8FD0 Nexus \u7684\u989C\u8272/\u95F4\u8DDD/\u5706\u89D2,\u9875\u9762\u4E0A\u53EA\u8BA4\u524D\u7F00\u7248\u3002\n   =========================================================================== */\n\n/* \u8D26\u53F7\u5361\u5934(\u4E0E\u6E20\u9053\u9875 ProviderCard \u5171\u7528\u7684\u5168\u5C40 .acct-head / .who / .badges \u540C\u503C,\u4E0D\u91CD\u590D\u5B9A\u4E49) */\n\n/* \u79EF\u5206\u6C60\u5757:\u4E24\u4E2A\u6C60**\u5E76\u6392**\u3002\u5217\u5BBD\u523B\u610F\u538B\u7A84(170px \u8D77)\u2014\u2014 \u4E4B\u524D\u7528 210px,420px \u7684\u8D26\u53F7\u5361\u91CC\n   \u653E\u4E0D\u4E0B\u4E24\u4E2A,\u81EA\u52A8\u9000\u5316\u6210\u4E0A\u4E0B\u5806\u53E0,\u800C\u300C\u901A\u7528 vs \u4E13\u5C5E\u300D\u6700\u8BE5\u505A\u7684\u662F\u6A2A\u5411\u6446\u5728\u4E00\u8D77\u5BF9\u6BD4\u3002\n   \u26A0\uFE0F `gap: 12px` \u662F\u6309\u53C2\u8003\u56FE\u91CF\u51FA\u6765\u7684:\u5B9E\u6D4B\u4E24\u6C60\u5916\u6CBF\u76F8\u8DDD 12px,\u539F\u503C 10px \u4F1A\u8BA9\u7D2B\u6A59\u4E24\u5757\n   \u5E95\u8272\u51E0\u4E4E\u8D34\u4E0A\u3002 */\n.asone-panel .sn-pools {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\n  gap: 12px;\n  margin: 12px 0 0;\n}\n/* flex \u5217 + \u7B49\u9AD8(\u7F51\u683C stretch):\u8BA9\u300C\u6D3B\u52A8\u56FA\u5B9A\u79EF\u5206\u300D\u80FD\u8D34\u4F4F\u5361\u7247\u5E95\u90E8,\n   \u4E24\u4E2A\u6C60\u56E0\u6B64\u5728\u540C\u4E00\u6C34\u5E73\u7EBF\u4E0A\u6536\u5C3E\u3002 */\n.asone-panel .sn-pool {\n  position: relative;\n  overflow: hidden; /* \u8BA9\u9876\u90E8\u8272\u6761\u8D34\u5408\u5706\u89D2 */\n  display: flex;\n  flex-direction: column;\n  border: 1px solid #262c36;\n  border-radius: 10px;\n  padding: 12px 12px 10px;\n  background: #12151a;\n}\n/* \u9876\u90E8\u8272\u6761:\u6BCF\u5F20\u6C60\u5361\u9876\u7AEF\u90A3\u9053\u5F69\u8272\u7EBF\u3002\u901A\u7528\u6C60\u53D6**\u7D2B**(violet-500/400),\u4E13\u5C5E\u6C60\u53D6\u6A59\n   (orange-500/400)\u3002\u26A0\uFE0F \u8FD9\u4E24\u7EC4\u503C\u662F\u4E3A\u6DF1\u8272\u5E95\u9009\u7684:\u53C2\u8003\u56FE\u662F\u6D45\u5E95,\u540C\u4E00\u7EC4\u8272\u76F4\u63A5\u642C\u5230\n   `#12151a` \u4E0A\u4F1A\u7CCA\u6210\u4E00\u7247 \u2014\u2014 \u4EAE\u6863\u964D\u4E00\u6863\u3001\u9971\u548C\u5EA6\u7565\u964D\u624D\u7ACB\u5F97\u4F4F\u3002 */\n.asone-panel .sn-pool-accent { position: absolute; inset: 0 0 auto 0; height: 2px; }\n.asone-panel .sn-pool.general .sn-pool-accent { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }\n.asone-panel .sn-pool.special .sn-pool-accent { background: linear-gradient(90deg, #f97316, #fb923c); }\n\n.asone-panel .sn-pool-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }\n.asone-panel .sn-pool-head strong { color: #cfe3f5; font-size: 12px; }\n/* \u4E13\u5C5E\u6807\u7B7E\u6539\u6210\u5C0F\u5706\u70B9:\u901A\u7528=\u7D2B,\u4E13\u5C5E=\u6A59(\u60AC\u505C\u6709 tooltip \u8BF4\u660E\u662F\u54EA\u4E00\u79CD) */\n.asone-panel .sn-pdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }\n.asone-panel .sn-pool.general .sn-pdot { background: #a78bfa; box-shadow: 0 0 0 2px #241d3d; }\n.asone-panel .sn-pool.special .sn-pdot { background: #fb923c; box-shadow: 0 0 0 2px #2e2118; }\n\n/* \u884C:\u5DE6\u6807\u7B7E / \u53F3\u4FA7\u300C\u6570\u503C + \u767E\u5206\u6BD4\u300D\u540C\u884C(\u628A\u6570\u503C\u6536\u8FDB\u6807\u7B7E\u884C,\u7701\u6389\u4E00\u6574\u884C\u9AD8\u5EA6)\u3002\n   `margin` \u538B\u5230 8px/4px:\u4F59\u91CF\u6761\u8981\u8D34\u7740\u5B83\u4E0A\u65B9\u7684\u6807\u7B7E\u884C,\u4E2D\u95F4\u4E0D\u7559\u7A7A\u6863\u3002 */\n.asone-panel .sn-row {\n  display: flex;\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 6px;\n  font-size: 11px;\n  color: #8b94a3;\n  margin: 8px 0 4px;\n}\n.asone-panel .sn-row-label { flex: none; }\n/* \u53F3\u4FA7\u6570\u503C:\u6570\u5B57\u6BD4\u6807\u7B7E\u5927\u4E00\u53F7\u3001\u767D\u4E00\u6863 \u2014\u2014 \u626B\u89C6\u65F6\u5148\u843D\u5728\u6570\u5B57\u4E0A\u3002\n   \u767E\u5206\u6BD4\u8DDF\u5728\u540E\u9762\u3001\u5C0F\u4E00\u53F7\u4E14\u538B\u6697,\u8BFB\u4F5C\u6570\u5B57\u7684\u6CE8\u89E3\u800C\u4E0D\u662F\u5E76\u5217\u7684\u7B2C\u4E8C\u9879\u3002 */\n.asone-panel .sn-row-val { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }\n.asone-panel .sn-row-val b { font-size: 15px; color: #dfe3ea; font-variant-numeric: tabular-nums; font-weight: 600; }\n.asone-panel .sn-row-val .sn-pct { color: #9fb3c8; font-size: 11px; font-variant-numeric: tabular-nums; }\n/* \u7B2C\u4E8C\u4E2A\u7A97\u53E3(\u672C\u5468\u4F59\u989D)\u4E0E 5h \u4E4B\u95F4\u7528\u865A\u7EBF\u9694\u5F00:\u4E24\u8005\u662F\u540C\u4E00\u4E2A\u6C60\u7684\u4E24\u4E2A\u7A97\u53E3,\n   \u9694\u4E00\u6761\u7EBF\u6BD4\u591A\u7559\u767D\u66F4\u80FD\u8BF4\u660E\u300C\u4E0A\u9762\u90A3\u4E2A\u662F 5h\u3001\u8FD9\u4E2A\u662F 7d\u300D\u3002 */\n.asone-panel .sn-row.split { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #262c36; }\n.asone-panel .sn-bar { height: 5px; background: #1b2029; border-radius: 999px; overflow: hidden; }\n.asone-panel .sn-bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }\n.asone-panel .sn-pool.general .sn-bar-fill { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }\n.asone-panel .sn-pool.special .sn-bar-fill { background: linear-gradient(90deg, #f97316, #fb923c); }\n/* \u51B7\u5374\u4E2D:\u8FDB\u5EA6\u6761\u7EDF\u4E00\u8F6C\u7070 \u2014\u2014 \u989C\u8272\u6B64\u65F6\u53EA\u8868\u793A\u300C\u8FD9\u4E2A\u6C60\u5728\u4F11\u606F\u300D,\u4E0D\u518D\u8868\u793A\u4F59\u91CF\u3002 */\n.asone-panel .sn-pool.cooling .sn-bar-fill { background: #4b5563; }\n\n/* \u6C60\u5E95\u69FD\u4F4D(**\u4E24\u4E2A\u6C60\u6545\u610F\u4E0D\u4E00\u6837**)\u3002\n   `margin-top:auto` \u662F\u8FD9\u91CC\u7684\u5173\u952E:\u5B83\u628A\u69FD\u4F4D\u9489\u5728\u5361\u7247\u5E95\u90E8,\u4E24\u4E2A\u6C60\u56E0\u6B64\u7B49\u9AD8\u6536\u5C3E\u3002\n   \u26A0\uFE0F \u4E24\u4E2A\u69FD\u4F4D\u5FC5\u987B**\u5360\u4E00\u6837\u7684\u9AD8\u5EA6**,\u5426\u5219\u4E24\u4E2A\u6C60\u7B49\u9AD8\u3001\u5E95\u8FB9\u5BF9\u9F50\u4E86,\u5185\u90E8\u5185\u5BB9\u5374\u4E00\u9AD8\u4E00\u4F4E,\n   \u6A2A\u5411\u626B\u89C6\u4ECD\u4F1A\u89C9\u5F97\u300C\u53F3\u8FB9\u5C11\u4E00\u5757\u300D\u3002\u6240\u4EE5\u4E24\u6761\u90FD\u9489\u4E86\u540C\u6837\u7684\u9AD8\u5EA6(30px)\u4E0E\u5185\u8FB9\u8DDD\u3002\n   \u26A0\uFE0F \u69FD\u4F4D\u662F**\u7EAF\u6587\u5B57**:\u4E0D\u7ED9\u5E95\u8272\u3001\u4E0D\u7ED9\u8FB9\u6846\u3001\u4E0D\u7ED9\u5C0F\u5706\u70B9(\u6309\u53C2\u8003\u56FE\u5B9E\u6D4B,\u539F\u5148\u90A3\u7EC4\n   `#1a1f28` + `#232a35` \u63CF\u8FB9\u5728\u6574\u5F20\u622A\u56FE\u91CC\u5404\u51FA\u73B0 0 \u6B21)\u3002 */\n.asone-panel .sn-grant,\n.asone-panel .sn-reset-row {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  min-height: 30px;\n  box-sizing: border-box;\n  margin-top: auto; /* \u8D34\u4F4F\u5361\u7247\u5E95\u90E8 \u2192 \u4E24\u6C60\u5E95\u8FB9\u5BF9\u9F50 */\n  padding: 0 2px;\n  border-radius: 8px;\n  font-size: 11px;\n  color: #8b94a3;\n}\n.asone-panel .sn-grant b { color: #dfe3ea; font-size: 13px; font-variant-numeric: tabular-nums; }\n.asone-panel .sn-g-label { flex: 1 1 auto; }\n/* \u6CA1\u6709\u6D3B\u52A8\u53D1\u653E:\u663E\u793A 5h / 7d \u7684\u91CD\u7F6E\u65F6\u523B(\u7EAF\u6587\u5B57,\u4E0D\u7ED9\u5E95\u8272\u4E5F\u4E0D\u7ED9\u8FB9\u6846 \u2014\u2014 \u7ED9\u5B83\u52A0\u5E95\u8272\n   \u53CD\u800C\u4F1A\u8BA9\u4EBA\u4EE5\u4E3A Flash-Lite \u6C60\u4E5F\u6709\u6D3B\u52A8\u79EF\u5206)\u3002 */\n.asone-panel .sn-reset-row { justify-content: space-between; padding: 0 2px; }\n.asone-panel .sn-r-label { flex: none; }\n.asone-panel .sn-r-val { color: #cfe3f5; font-variant-numeric: tabular-nums; white-space: nowrap; }\n\n/* \u8D26\u53F7\u7BA1\u7406\u8868(\u6A21\u578B\u76EE\u5F55\u90A3\u5F20\u8868\u7684\u5217\u5BBD / \u8F93\u5165\u6846 / \u56FE\u50CF\u5217\u7EFF\u70B9\u90FD\u5728 ModelTable \u91CC) */\n.asone-panel .sn-grid { width: 100%; border-collapse: collapse; margin: 8px 0; }\n.asone-panel .sn-grid th,\n.asone-panel .sn-grid td { border-bottom: 1px solid #262c36; padding: 7px 6px; font-size: 13px; text-align: left; }\n.asone-panel .sn-grid th { background: #1b2029; color: #9fb3c8; font-weight: 600; }\n.asone-panel .sn-grid th.num,\n.asone-panel .sn-grid td.num { text-align: right; font-variant-numeric: tabular-nums; }\n.asone-panel .sn-grid td.sub { color: #8b94a3; }\n/* \u8D26\u53F7\u7BA1\u7406\u8868\u91CC\u7684\u80F6\u56CA(\u5DF2\u4FDD\u5B58 / \u6709\u5BC6\u94A5)\u3002\u548C `.chan-badge` \u662F\u540C\u4E00\u65CF\u5F62\u72B6,\u4F46\u90A3\u679A\u662F\u89D2\u6807\u3001\n   \u8FD9\u679A\u5728\u8868\u683C\u5355\u5143\u683C\u91CC,\u5B57\u53F7\u5DEE\u534A\u53F7,\u6240\u4EE5\u5404\u7559\u5404\u7684\u3002 */\n.asone-panel .sn-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #1b2029; color: #9fb3c8; }\n.asone-panel .sn-pill.ok { background: #17301f; color: #5fbf7d; }\n.asone-panel .sn-pill.na { background: #2a2418; color: #d9a441; }\n\n/* \u8D26\u53F7\u7BA1\u7406\u8868:\u64CD\u4F5C\u5217\u6309\u94AE(\u767B\u5F55/\u91CD\u6293 key/\u5220\u9664) */\n.asone-panel .sn-ops { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }\n.asone-panel .sn-ops .btn-sm { padding: 2px 9px; }\n.asone-panel .sn-ops .btn-sm.danger { background: rgba(224, 104, 95, 0.12); }\n.asone-panel .sn-ops .btn-sm.danger:hover:not(:disabled) { border-color: #e0685f; }\n\n/* \u8D26\u53F7\u7BA1\u7406\u8868:\u767B\u5F55\u884C(\u5BC6\u7801\u8F93\u5165 + \u767B\u5F55\u5E76\u6293 key/\u53EA\u4FDD\u5B58\u5BC6\u7801) */\n.asone-panel .sn-login { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }\n.asone-panel .sn-login input[type="password"],\n.asone-panel .sn-add input {\n  font: inherit;\n  color: var(--text, #dfe3ea);\n  background: #14181f;\n  border: 1px solid #2a313d;\n  border-radius: 6px;\n  padding: 5px 10px;\n  min-width: 180px;\n}\n.asone-panel .sn-login input[type="password"]:focus,\n.asone-panel .sn-add input:focus { border-color: var(--accent, #6f8dff); outline: none; }\n.asone-panel .sn-login .chan-hint { margin: 0; flex: 1 1 100%; }\n\n/* \u8D26\u53F7\u7BA1\u7406\u8868:\u6DFB\u52A0\u8868\u5355\u884C */\n.asone-panel .sn-add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 2px; }\n.asone-panel .sn-add .chan-hint { margin: 0; flex: 1 1 100%; }\n\n/* \u2500\u2500 \u8D26\u53F7\u7BA1\u7406\u9875(Nexus ProviderAccounts.vue \u7684 1:1 \u590D\u523B)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n   \u56DB\u5757\u7ED3\u6784:\u81EA\u52A8\u9274\u6743 / \u5DF2\u5165\u6C60\u8D26\u53F7 / \u771F\u5B9E\u6A21\u578B / \u7B7E\u5230\u5237\u65B0\u3002\n   \u590D\u7528 .grid / .btn / .chan-hint / .chan-banner \u7B49\u65E2\u6709\u7C7B,\u4E0D\u53E6\u9020\u4E00\u5957\u3002 */\n.asone-panel .acct-page { display: flex; flex-direction: column; gap: 6px; }\n.asone-panel .acct-title { margin: 0 0 6px; font-size: 17px; color: #dfe3ea; }\n.asone-panel .acct-h3 { margin: 14px 0 6px; font-size: 13px; color: #9fb3c8; }\n.asone-panel .acct-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\n.asone-panel .acct-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }\n.asone-panel .acct-form input[type="text"],\n.asone-panel .acct-form input[type="password"] {\n  width: 420px; padding: 4px 6px; background: #161a20; color: #dfe3ea;\n  border: 1px solid #2b323d; border-radius: 4px; font-size: 12px;\n}\n.asone-panel .acct-form input::placeholder { color: #6b7787; }\n';

// src/client/styles.ts
var STYLE_TAG_ID = "as-one-plugin-styles";
function injectAsOneStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_TAG_ID) !== null) return;
  const el = document.createElement("style");
  el.id = STYLE_TAG_ID;
  el.textContent = styles_default;
  document.head.appendChild(el);
}

// src/client/locales.ts
var LOCALE_NS = "asOne";
var zh = {
  nav: "As One \xB7 \u5408\u4E00",
  back: "\u8FD4\u56DE"
};
var en = {
  nav: "As One \xB7 Unity",
  back: "Back"
};

// src/client/panel.tsx
var import_jsx_runtime18 = require("react/jsx-runtime");
function AsOnePanelPage({ t, goBack }) {
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "asone-panel", children: [
    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "asone-back-row", children: /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("button", { type: "button", className: "asone-btn asone-back", onClick: goBack, children: [
      "\u2190 ",
      t("back")
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(App, {})
  ] });
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

// src/client.ts
injectAsOneStyles();
bindPanelBridge();
var BUNDLE_NAME = "@as-one/plugin";
var PANEL_ID = "as-one";
var PANEL_ORDER = 30;
var name = "@as-one/plugin/client";
var inject = ["slots", "locale", "layout"];
function apply(ctx, _config = {}) {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, "zh-CN", zh));
  ctx.effect(() => ctx.locale.register(LOCALE_NS, "zh", zh));
  ctx.effect(() => ctx.locale.register(LOCALE_NS, "en", en));
  const t = ctx.locale.bind(LOCALE_NS);
  let previousPanelId = null;
  let lastPanelId = null;
  ctx.effect(
    () => ctx.layout.panelInfo.subscribe(() => {
      const { activePanelId } = ctx.layout.panelInfo.getSnapshot();
      if (lastPanelId === PANEL_ID && activePanelId !== PANEL_ID) {
        previousPanelId = activePanelId;
      }
      lastPanelId = activePanelId;
    })
  );
  const goBack = () => {
    if (previousPanelId !== null) {
      try {
        ctx.layout.selectPanel(previousPanelId);
        return;
      } catch {
      }
    }
    ctx.layout.selectPanel(null);
  };
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
        { name: "main", key: PANEL_ID, locale: LOCALE_NS, inject: () => ({ goBack }) },
        AsOnePanelPage
      )
    )
  );
}
	return module.exports;
	}
});

//# sourceMappingURL=client.js.map
