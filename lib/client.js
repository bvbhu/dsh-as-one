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
    async fetchDeploymentReasoning(deploymentId) {
      return call("fetchDeploymentReasoning", deploymentId);
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
    async checkinOverview() {
      return call("checkinOverview");
    },
    async checkinAll(confirm) {
      return call("checkinAll", confirm);
    },
    async channelOverview() {
      return call("channelOverview");
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
var import_react15 = __toESM(require("react"), 1);

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
  const n4 = /* @__PURE__ */ new Map();
  for (const s of names) {
    const key = String(s || "");
    if (!key) continue;
    n4.set(key, (n4.get(key) ?? 0) + 1);
  }
  return [...n4.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
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
  return [...counts.entries()].map(([real_model, n4]) => ({ real_model, n: n4 })).sort((a, b) => b.n - a.n || a.real_model.localeCompare(b.real_model));
}
function CheckinRow({ c }) {
  let state = "\u5DF2\u7B7E";
  let cls = "ok";
  if (!c.supported) {
    state = "\u4E0D\u652F\u6301";
    cls = "na";
  } else if (c.error) {
    state = "\u67E5\u8BE2\u5931\u8D25";
    cls = "err";
  } else if (c.checkedIn === null) {
    state = "\u672A\u77E5";
    cls = "na";
  } else if (c.pending !== null && c.pending > 0) {
    state = c.countExact ? `\u672A\u7B7E ${c.pending}` : "\u672A\u7B7E";
    cls = "warn";
  } else if (c.countExact && c.accounts > 1) {
    state = `\u5DF2\u7B7E ${c.checkedIn}/${c.accounts}`;
    cls = "ok";
  } else {
    state = "\u5DF2\u7B7E";
    cls = "ok";
  }
  const meta = [];
  if (c.dailyCredit !== null) meta.push(`\u4ECA\u65E5 +${c.dailyCredit}`);
  if (c.streak !== null) meta.push(`\u8FDE\u7B7E ${c.streak} \u5929`);
  if (c.reason) meta.push(c.reason);
  if (c.error) meta.push(c.error);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-checkinRow", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-checkinName", children: c.label }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `ov-checkinState is-${cls}`, title: meta.join(" \xB7 "), children: state }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-checkinMeta", children: meta.join(" \xB7 ") })
  ] });
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
      const n4 = Number(
        r.sections?.["ui"]?.["ui.recent_limit"] ?? r.sections?.["ui"]?.["recent_limit"]
      );
      if (Number.isFinite(n4) && n4 >= 1) {
        setRecentLimit(String(n4));
        setRecentLimitSaved(n4);
      }
    } catch {
    }
  }, []);
  const [checkin, setCheckin] = import_react.default.useState(null);
  const [checkinLoading, setCheckinLoading] = import_react.default.useState(true);
  const [checkinBusy, setCheckinBusy] = import_react.default.useState(false);
  const [checkinMsg, setCheckinMsg] = import_react.default.useState("");
  const [checkinErr, setCheckinErr] = import_react.default.useState("");
  const loadCheckin = import_react.default.useCallback(async () => {
    setCheckinLoading(true);
    try {
      setCheckin(await rendererApi.checkinOverview());
      setCheckinErr("");
    } catch (e) {
      setCheckinErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckinLoading(false);
    }
  }, []);
  const claimAll = import_react.default.useCallback(async () => {
    setCheckinBusy(true);
    setCheckinMsg("");
    setCheckinErr("");
    try {
      const r = await rendererApi.checkinAll(true);
      setCheckinMsg(r.message);
      if (r.channels?.length) setCheckin({ channels: r.channels });
      if (!r.ok) setCheckinErr("\u6CA1\u6709\u6E20\u9053\u7B7E\u5230\u6210\u529F");
    } catch (e) {
      setCheckinErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckinBusy(false);
    }
  }, []);
  import_react.default.useEffect(() => {
    void load();
    void loadRecentLimit();
    void loadCheckin();
    const timer = window.setInterval(() => {
      void load();
    }, 5e3);
    return () => window.clearInterval(timer);
  }, [load, loadRecentLimit, loadCheckin]);
  const saveRecentLimit = import_react.default.useCallback(async () => {
    const raw = recentLimit;
    const n4 = raw.trim() === "" ? NaN : Math.trunc(Number(raw));
    if (!Number.isFinite(n4)) {
      setRecentLimit(String(recentLimitSaved));
      setRecentLimitError("");
      return;
    }
    if (n4 < 1 || n4 > 500) {
      setRecentLimitError("\u6761\u6570\u9700\u4E3A 1\u2013500 \u7684\u6574\u6570");
      return;
    }
    setRecentLimit(String(n4));
    setRecentLimitError("");
    setRecentLimitSaving(true);
    try {
      await rendererApi.saveSettings({ ui: { recent_limit: String(n4) } });
      setRecentLimitSaved(n4);
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
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-checkin", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-checkinHead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("h2", { children: [
          "\u6BCF\u65E5\u7B7E\u5230",
          checkin?.channels?.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "count", children: [
            checkin.channels.filter((c) => c.supported && c.pending === 0 && c.checkedIn !== null).length,
            "/",
            checkin.channels.filter((c) => c.supported).length
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: "btn",
            disabled: checkinBusy || checkinLoading,
            onClick: () => void claimAll(),
            children: checkinBusy ? "\u7B7E\u5230\u4E2D\u2026" : "\u5168\u90E8\u7B7E\u5230"
          }
        )
      ] }),
      checkinErr ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ov-checkinErr", children: checkinErr }) : null,
      checkinMsg ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ov-checkinMsg", children: checkinMsg }) : null,
      checkinLoading && !checkin ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "na", children: "\u52A0\u8F7D\u7B7E\u5230\u72B6\u6001\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-checkinRows", children: [
        (checkin?.channels ?? []).map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CheckinRow, { c }, c.provider)),
        !(checkin?.channels ?? []).length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "na", children: "\u6CA1\u6709\u652F\u6301\u7B7E\u5230\u7684\u6E20\u9053" }) : null
      ] })
    ] }),
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
var import_react11 = __toESM(require("react"), 1);

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
    const n4 = g.count ?? 0;
    const tail = n4 > 0 ? `(\u542B ${n4} \u6863)` : "";
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
function effortRawText(d) {
  const raw = d.supported_reasoning_efforts_raw;
  if (raw === null || raw === void 0) return "";
  return String(raw).trim();
}
function effortDisplayText(d) {
  return effortRawText(d) || "\u9ED8\u8BA4";
}
function effortSelectValue(d) {
  const raw = effortRawText(d);
  return raw ? EFFORT_RAW_PREFIX + raw : EFFORT_DEFAULT_VALUE;
}
var EFFORT_ACTIONS = [
  { id: "default", label: "\u9ED8\u8BA4" },
  { id: "upstream", label: "\u5C1D\u8BD5\u4ECE\u4E0A\u6E38\u83B7\u53D6" }
];
var EFFORT_DEFAULT_VALUE = "__effort_default__";
var EFFORT_UPSTREAM_VALUE = "__effort_upstream__";
var EFFORT_RAW_PREFIX = "__effort_raw__";
function effortTitle(d) {
  const raw = effortRawText(d);
  const state = raw ? `\u5F53\u524D\u6570\u636E\u5E93\u539F\u6587:${raw}` : "\u5F53\u524D:\u6570\u636E\u5E93\u91CC\u662F NULL(\u7F51\u5173\u4E0D\u62E6\u4E5F\u4E0D\u53D1,\u4EA4\u7ED9\u4E0A\u6E38\u81EA\u5DF1\u51B3\u5B9A)";
  return `\u601D\u8003\u5F3A\u5EA6:\u8FD9\u4E2A\u771F\u5B9E\u6A21\u578B\u652F\u6301\u54EA\u4E9B\u601D\u8003\u6863\u4F4D(\u663E\u793A\u6570\u636E\u5E93\u539F\u6587)\u3002\u9009\u300C\u9ED8\u8BA4\u300D= \u6E05\u6210 NULL,\u4E0D\u7BA1\u5B83,\u5BA2\u6237\u7AEF\u7ED9\u4EC0\u4E48\u53D1\u4EC0\u4E48;\u9009\u300C\u5C1D\u8BD5\u4ECE\u4E0A\u6E38\u83B7\u53D6\u300D= \u73B0\u5728\u53BB\u4E0A\u6E38\u95EE\u4E00\u53E5,\u628A\u5B83\u7ED9\u7684\u6863\u4F4D\u8868\u5B58\u4E0B\u6765\u3002\u5B58\u4E0B\u6765\u7684\u8868\u4F1A\u7ACB\u523B\u751F\u6548(\u7F51\u5173\u6309\u5B83\u94B3\u5236,DSH \u6A21\u578B\u9009\u62E9\u5668\u4E5F\u4F1A\u51FA\u73B0\u6863\u4F4D),\u4E0D\u9700\u8981\u91CD\u542F\u3002 ${state}`;
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
  const exposedCount = deployments.reduce((n4, d) => n4 + (d.listed ? 1 : 0), 0);
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
    const n4 = Number(raw);
    if (!Number.isFinite(n4) || n4 < 1) return;
    const capped = Math.min(1 << 20, Math.max(1, Math.trunc(n4)));
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
  async function saveReasoning(d, actionValue) {
    if (effortBusy) return;
    let action = null;
    if (actionValue === EFFORT_DEFAULT_VALUE) action = "default";
    else if (actionValue === EFFORT_UPSTREAM_VALUE) action = "upstream";
    if (!action) return;
    if (action === "default" && !effortRawText(d)) return;
    setEffortBusy(d.deployment_id);
    setError("");
    setNotice("");
    try {
      const r = action === "upstream" ? await rendererApi.fetchDeploymentReasoning(d.deployment_id) : await rendererApi.setDeploymentReasoning(d.deployment_id, null, null);
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
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "chipLabel", children: "\u601D\u8003\u5F3A\u5EA6" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
              "select",
              {
                className: "chipSelect",
                value: effortSelectValue(d),
                disabled: effortBusy === d.deployment_id,
                onChange: (e) => void saveReasoning(d, e.currentTarget.value),
                children: [
                  effortRawText(d) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: effortSelectValue(d), hidden: true, children: effortDisplayText(d) }) : null,
                  EFFORT_ACTIONS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: p.id === "default" ? EFFORT_DEFAULT_VALUE : EFFORT_UPSTREAM_VALUE, children: p.label }, p.id))
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

// ../panel-ui/src/pages/models/ChannelsPage.tsx
var import_react9 = __toESM(require("react"), 1);

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
  const n4 = Number(t);
  return Number.isFinite(n4) && n4 > 0 ? Math.round(n4) : null;
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
    !signedIn ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "acct-cta", children: provider === "minimax" ? (
      // minimax 凭据是「设备指纹 + access/refresh token」整套,本机没有可扫的
      // 客户端登录态,只能从 minimax2api 库导入(scripts/import-minimax-from-bridge.mjs)。
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("p", { className: "chan-hint", children: [
        "\u8FD0\u884C ",
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("code", { children: "node scripts/import-minimax-from-bridge.mjs --apply" }),
        " \u5BFC\u5165 MiniMax \u8D26\u53F7"
      ] })
    ) : /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
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
      provider !== "trae" && provider !== "minimax" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("article", { className: "chan-card", children: [
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

// ../panel-ui/src/pages/models/QoderPage.tsx
var import_react7 = __toESM(require("react"), 1);
var import_jsx_runtime10 = require("react/jsx-runtime");
var REGION = "qoder";
function n(value) {
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
  const [status, setStatus] = import_react7.default.useState(null);
  const [accounts, setAccounts] = import_react7.default.useState([]);
  const [models, setModels] = import_react7.default.useState([]);
  const [credits, setCredits] = import_react7.default.useState([]);
  const [creditError, setCreditError] = import_react7.default.useState(null);
  const [catalogError, setCatalogError] = import_react7.default.useState(null);
  const [note, setNote] = import_react7.default.useState(null);
  const [busy, setBusy] = import_react7.default.useState(null);
  const [addName, setAddName] = import_react7.default.useState("");
  const [addPat, setAddPat] = import_react7.default.useState("");
  const [nowMs, setNowMs] = import_react7.default.useState(() => Date.now());
  const load = import_react7.default.useCallback(async () => {
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
  import_react7.default.useEffect(() => {
    void load();
  }, [load]);
  import_react7.default.useEffect(() => {
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
  const accountRows = import_react7.default.useMemo(
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
      const exp = c?.expiresAt ?? null;
      return {
        id: a.account,
        label: a.account,
        note: [c?.userType ?? a.userType, `${a.models} \u4E2A\u6A21\u578B`].filter(Boolean).join(" \xB7 "),
        dot: a.lastError ? "bad" : a.hasPat ? "ok" : "off",
        right: left !== null ? {
          key: "\u5269\u4F59\u79EF\u5206",
          value: n(left),
          sub: exp !== null ? `\u7EA6 ${fmtAt(exp)}` : null,
          // 有余额才是绿;0 表示两个桶都空了 —— 用黄,不假装正常。
          tone: left > 0 ? "ok" : "warn"
        } : null
      };
    }),
    [accounts, credits]
  );
  const modelRows = import_react7.default.useMemo(
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
  const onRefreshRef = import_react7.default.useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  import_react7.default.useEffect(() => {
    publishAction({
      label: busy !== null ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0",
      note: refreshNote,
      noteBusy: busy !== null,
      disabled: busy !== null || accounts.length === 0,
      run: () => onRefreshRef.current()
    });
    return () => publishAction(null);
  }, [publishAction, busy, accounts.length, refreshNote]);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "chan-page", children: [
    note ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: `chan-banner ${note.kind}`, children: note.text }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      AccountRows,
      {
        accounts: accountRows,
        emptyText: "\u6682\u65E0\u8D26\u53F7",
        footer: creditError ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "chan-hint warn-line", children: creditError }) : null
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "chan-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
        ModelTable_default,
        {
          rows: modelRows,
          plainColumns: true,
          disabled: busy !== null,
          emptyText: "\u6682\u65E0\u6A21\u578B",
          onEdit: handleModelEdit,
          toolbar: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: "\u6A21\u578B\u76EE\u5F55" }) })
        }
      ),
      catalogError ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "chan-hint warn-line", children: catalogError }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "chan-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { children: "\u8D26\u53F7\u914D\u7F6E" }) }),
      accounts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "chan-empty", children: "\u6682\u65E0\u8D26\u53F7" }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("table", { className: "grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("th", { children: "\u8D26\u53F7" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("th", { children: "API key" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("th", { children: "\u64CD\u4F5C" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("tbody", { children: accounts.map((a) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("td", { children: a.account }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("td", { className: "mono", children: a.patHint ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "sn-add", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            placeholder: "\u8D26\u53F7\u540D(\u81EA\u53D6,\u5982 main)",
            value: addName,
            onChange: (e) => setAddName(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
          "input",
          {
            placeholder: "PAT(pt-\u2026)",
            value: addPat,
            onChange: (e) => setAddPat(e.target.value),
            type: "password"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "btn btn-sm primary", disabled: busy !== null, onClick: onAdd, children: "\u6DFB\u52A0\u5E76\u6821\u9A8C" })
      ] })
    ] })
  ] });
}
var QoderPage_default = QoderPage;

// ../panel-ui/src/pages/models/SenseNovaPage.tsx
var import_react8 = __toESM(require("react"), 1);
var import_jsx_runtime11 = require("react/jsx-runtime");
function n2(value) {
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
  const n4 = Number(t);
  return Number.isFinite(n4) && n4 > 0 ? Math.round(n4) : null;
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
  const [status, setStatus] = import_react8.default.useState(null);
  const [catalog, setCatalog] = import_react8.default.useState([]);
  const [error, setError] = import_react8.default.useState("");
  const [refreshMsg, setRefreshMsg] = import_react8.default.useState("");
  const [refreshingLocal, setRefreshingLocal] = import_react8.default.useState(false);
  const [localResult, setLocalResult] = import_react8.default.useState(null);
  const [nowMs, setNowMs] = import_react8.default.useState(() => Date.now());
  const localStartMsRef = import_react8.default.useRef(null);
  const [draft, setDraft] = import_react8.default.useState({});
  const [saving, setSaving] = import_react8.default.useState(false);
  const dirtyRef = import_react8.default.useRef(false);
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
  const runningRef = import_react8.default.useRef(false);
  const fastRef = import_react8.default.useRef(null);
  const slowRef = import_react8.default.useRef(null);
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
  import_react8.default.useEffect(() => {
    runningRef.current = Boolean(status?.refresh?.running);
  }, [status]);
  import_react8.default.useEffect(() => {
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
  import_react8.default.useEffect(() => {
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
  const accountRows = import_react8.default.useMemo(() => {
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
        value: n2(p.w5_remaining),
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
  const [confirmDelete, setConfirmDelete] = import_react8.default.useState("");
  const [busy, setBusy] = import_react8.default.useState("");
  const [newUser, setNewUser] = import_react8.default.useState("");
  const [newPass, setNewPass] = import_react8.default.useState("");
  const [newKey, setNewKey] = import_react8.default.useState("");
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
  const refreshAllRef = import_react8.default.useRef(refreshAll);
  refreshAllRef.current = refreshAll;
  import_react8.default.useEffect(() => {
    publishAction({
      label: refreshing ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0",
      note: refreshNote,
      noteBusy: refreshing,
      disabled: refreshing || accounts.length === 0,
      run: () => void refreshAllRef.current()
    });
    return () => publishAction(null);
  }, [publishAction, refreshing, accounts.length, refreshNote]);
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("section", { className: "chan-page", children: [
    error ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "chan-banner err", role: "alert", children: error }) : null,
    refreshMsg ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "chan-banner ok", role: "status", children: refreshMsg }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(AccountRows, { accounts: accountRows, emptyText: "\u6682\u65E0\u8D26\u53F7" }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("article", { className: "chan-card", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      ModelTable_default,
      {
        rows: modelRows,
        showRate: false,
        disabled: saving,
        emptyText: "\u6682\u65E0\u6A21\u578B",
        onEdit: handleCatalogEdit,
        onCommit: (e) => void commitCatalogEdit(e),
        toolbar: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h3", { children: "\u6A21\u578B\u76EE\u5F55" }) })
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("article", { className: "chan-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("header", { className: "chan-head", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h3", { children: "\u8D26\u53F7\u914D\u7F6E" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("table", { className: "sn-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { children: "\u8D26\u53F7" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { children: "API key" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("th", { className: "num", children: "\u64CD\u4F5C" })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tbody", { children: [
          accounts.map((row) => {
            const acc = row.account || row.username;
            return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("tr", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("code", { children: acc }) }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { className: "sub", children: row.key_hint ?? "\u2014" }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { className: "num", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "sn-ops", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
          accounts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("td", { colSpan: 3, className: "chan-empty", children: "\u6682\u65E0\u8D26\u53F7" }) }) : null
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "sn-add", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "input",
          {
            placeholder: "\u7528\u6237\u540D",
            value: newUser,
            onChange: (e) => setNewUser(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "input",
          {
            type: "password",
            placeholder: "\u5BC6\u7801(\u4EC5\u5B58\u51ED\u636E\u6587\u4EF6)",
            value: newPass,
            autoComplete: "new-password",
            onChange: (e) => setNewPass(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
          "input",
          {
            placeholder: "API key(\u53EF\u7559\u7A7A:\u767B\u5F55\u540E\u81EA\u52A8\u6293\u53D6)",
            value: newKey,
            onChange: (e) => setNewKey(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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

// ../panel-ui/src/pages/models/ChannelsPage.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
var CARDS = [
  { provider: "trae", label: "Trae" },
  { provider: "minimax", label: "MiniMax" },
  { provider: "qoder", label: "Qoder" },
  { provider: "sensenova", label: "SenseNova" }
];
var CHECKIN_PROVIDERS = /* @__PURE__ */ new Set(["trae", "minimax", "qoder"]);
function fmtExpiry(ms) {
  if (!ms) return "\u2014";
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}
function n3(value) {
  if (value === null || value === void 0) return "\u2014";
  return Math.round(value).toLocaleString("en-US");
}
function checkinChip(c, loading = false) {
  if (!c) return { text: loading ? "\u2026" : "\u7B7E\u5230\u672A\u77E5", tone: "na" };
  if (!c.supported) return { text: "\u4E0D\u652F\u6301\u7B7E\u5230", tone: "na" };
  if (c.error) return { text: "\u7B7E\u5230\u67E5\u8BE2\u5931\u8D25", tone: "warn" };
  if (c.checkedIn === null || c.pending === null) return { text: "\u7B7E\u5230\u672A\u77E5", tone: "na" };
  if (c.pending > 0) return { text: `\u5F85\u7B7E ${c.pending}`, tone: "warn" };
  const points = c.dailyCredit !== null ? ` \xB7 \u4ECA\u65E5 ${n3(c.dailyCredit)}` : "";
  const ratio = c.countExact && c.accounts > 1 ? ` ${c.checkedIn}/${c.accounts}` : "";
  return { text: `\u5DF2\u7B7E${ratio}${points}`, tone: "ok" };
}
function BalanceSummary({ card }) {
  if (!card || card.accounts.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "chx-balance none", children: "\u672A\u63A5\u5165\u8D26\u53F7" });
  }
  const collected = card.accounts.some((a) => a.left !== null);
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "chx-balance", children: [
    card.accounts.map((a) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "chx-acct", title: a.expiresAtMs ? `\u5230\u671F ${new Date(a.expiresAtMs).toLocaleString()}${a.expiresEstimated ? "(\u4F30\u7B97)" : ""}` : void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("b", { children: a.label }),
      " ",
      a.left === null ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "chx-none", children: "\u672A\u91C7\u96C6" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(import_jsx_runtime12.Fragment, { children: [
        n3(a.left),
        a.expiresAtMs !== null && /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("em", { className: "chx-expiry", children: [
          a.expiresEstimated ? "\u7EA6" : "",
          fmtExpiry(a.expiresAtMs)
        ] })
      ] })
    ] }, a.label)),
    !collected ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "chx-hint", children: "\u5C55\u5F00\u5237\u65B0\u540E\u663E\u793A" }) : null
  ] });
}
function ChannelsPage() {
  const [ov, setOv] = import_react9.default.useState(null);
  const [checkin, setCheckin] = import_react9.default.useState(null);
  const [checkinLoading, setCheckinLoading] = import_react9.default.useState(true);
  const [openId, setOpenId] = import_react9.default.useState("");
  const [busy, setBusy] = import_react9.default.useState(false);
  const [note, setNote] = import_react9.default.useState("");
  const loadHead = import_react9.default.useCallback(async () => {
    try {
      setOv(await rendererApi.channelOverview());
    } catch {
    }
  }, []);
  const loadCheckin = import_react9.default.useCallback(async () => {
    setCheckinLoading(true);
    try {
      setCheckin(await rendererApi.checkinOverview());
    } catch {
    } finally {
      setCheckinLoading(false);
    }
  }, []);
  import_react9.default.useEffect(() => {
    void loadHead();
    void loadCheckin();
  }, [loadHead, loadCheckin]);
  const claimAll = import_react9.default.useCallback(async () => {
    setBusy(true);
    setNote("");
    try {
      const r = await rendererApi.checkinAll(true);
      setNote(r.message);
      if (r.channels?.length) setCheckin({ channels: r.channels });
      await loadHead();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [loadHead]);
  const toggle = import_react9.default.useCallback(
    (provider) => {
      setOpenId((cur) => {
        const next = cur === provider ? "" : provider;
        void loadHead();
        return next;
      });
    },
    [loadHead]
  );
  const checkinById = import_react9.default.useMemo(
    () => new Map((checkin?.channels ?? []).map((c) => [c.provider, c])),
    [checkin]
  );
  const cardById = import_react9.default.useMemo(
    () => new Map((ov?.cards ?? []).map((c) => [c.provider, c])),
    [ov]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("section", { className: "channels-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "channels-checkin", children: [
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "channels-checkin-chips", children: CARDS.filter((spec) => CHECKIN_PROVIDERS.has(spec.provider)).map((spec) => {
        const chip = checkinChip(checkinById.get(spec.provider), checkinLoading);
        return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: `chx-chip is-${chip.tone}`, title: `${spec.label} \u4ECA\u65E5\u7B7E\u5230`, children: [
          spec.label,
          " ",
          chip.text
        ] }, spec.provider);
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "btn primary", disabled: busy, onClick: () => void claimAll(), children: busy ? "\u7B7E\u5230\u4E2D\u2026" : "\u5168\u90E8\u7B7E\u5230" })
    ] }),
    note ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "chx-note", children: note }) : null,
    CARDS.map((spec) => {
      const open = openId === spec.provider;
      const card = cardById.get(spec.provider);
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("article", { className: `chx-card${open ? " open" : ""}`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("header", { className: "chx-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("button", { type: "button", className: "chx-toggle", onClick: () => toggle(spec.provider), "aria-expanded": open, children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: `chx-caret${open ? " open" : ""}`, "aria-hidden": "true" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "chx-name", children: spec.label })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(BalanceSummary, { card })
        ] }),
        open ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "chx-body", children: spec.provider === "qoder" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(QoderPage_default, {}) : spec.provider === "sensenova" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(SenseNovaPage, {}) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ChannelPage, { provider: spec.provider }) }) : null
      ] }, spec.provider);
    })
  ] });
}

// ../panel-ui/src/pages/models/ProvidersPage.tsx
var import_react10 = __toESM(require("react"), 1);
var import_jsx_runtime13 = require("react/jsx-runtime");
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
  const [providers, setProviders] = import_react10.default.useState([]);
  const [error, setError] = import_react10.default.useState("");
  const [notice, setNotice] = import_react10.default.useState("");
  const [busy, setBusy] = import_react10.default.useState(false);
  const [openId, setOpenId] = import_react10.default.useState("");
  const [creating, setCreating] = import_react10.default.useState(false);
  const [overridden, setOverridden] = import_react10.default.useState({});
  const [invalidIds, setInvalidIds] = import_react10.default.useState({});
  const [createInvalid, setCreateInvalid] = import_react10.default.useState(false);
  const [form, setForm] = import_react10.default.useState(() => blankForm());
  const [rowOpen, setRowOpen] = import_react10.default.useState({});
  const [catalogOpen, setCatalogOpen] = import_react10.default.useState(true);
  const [ctxDraft, setCtxDraft] = import_react10.default.useState({});
  const [outDraft, setOutDraft] = import_react10.default.useState({});
  const [inputChecked, setInputChecked] = import_react10.default.useState({});
  const [fetching, setFetching] = import_react10.default.useState(false);
  const [pickerOpen, setPickerOpen] = import_react10.default.useState(false);
  const [candidates, setCandidates] = import_react10.default.useState([]);
  const [picked, setPicked] = import_react10.default.useState(() => /* @__PURE__ */ new Set());
  const [pickQuery, setPickQuery] = import_react10.default.useState("");
  const [fetchedCatalog, setFetchedCatalog] = import_react10.default.useState([]);
  async function load() {
    try {
      const r = await rendererApi.getModelProviders();
      setProviders(r);
      setError("");
    } catch (e) {
      setError(msg3(e));
    }
  }
  import_react10.default.useEffect(() => {
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
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-catalogSection", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "pv-catalogTitle", children: "\u6A21\u578B\u76EE\u5F55" }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-modelListHead", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "pv-modelCatalogMeta", children: anyOverridden ? "\u5DF2\u81EA\u5B9A\u4E49\u6A21\u578B\u76EE\u5F55" : "\u6B63\u5728\u4F7F\u7528\u63D0\u4F9B\u5546\u9ED8\u8BA4\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "pv-headActions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
        catalogOpen ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
          form.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "pv-modelEmpty", children: "\u8FD8\u6CA1\u6709\u767B\u8BB0\u6A21\u578B;\u70B9\u300C\u83B7\u53D6\u53EF\u7528\u6A21\u578B\u300D\u6216\u300C\uFF0B \u6DFB\u52A0\u6A21\u578B\u300D\u8865\u4E0A\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "pv-modelList", children: form.models.map((_m, i) => {
            const kinds = inputChecked[i] ?? { text: true, image: false };
            return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-modelEntry", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-modelRow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
              rowOpen[i] ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-modelAdvanced", children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "pv-modelField", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "pv-modelFieldLabel", children: "\u4E0A\u4E0B\u6587\u7A97\u53E3" }),
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
                /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "pv-modelField", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "pv-modelFieldLabel", children: "\u6700\u5927\u8F93\u51FA token \u6570" }),
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
                /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("fieldset", { className: "pv-modelInputTypes", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("legend", { className: "pv-modelFieldLabel", children: "\u8F93\u5165\u7C7B\u578B" }),
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-modelInputChoices", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "pv-choice", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
                        "input",
                        {
                          type: "checkbox",
                          checked: kinds.text,
                          onChange: (ev) => toggleInput(i, "text", ev.target.checked)
                        }
                      ),
                      "\u6587\u672C"
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "pv-choice", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "pv-addModelButton", disabled: busy, onClick: addModel, children: "\uFF0B \u6DFB\u52A0\u6A21\u578B" })
        ] }) : null
      ] })
    ] });
  }
  function providerFields(withId, p) {
    const uid = withId ? "new-provider" : p?.id ?? form.id;
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-panel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "pv-panelTitle", children: withId ? "\u81EA\u5B9A\u4E49\u6A21\u578B API" : p?.id }),
      withId ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("label", { className: "pv-fieldLabel", htmlFor: "new-provider-id", children: "Provider ID" }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("label", { className: "pv-fieldLabel", htmlFor: `key-${uid}`, children: "API \u5BC6\u94A5" }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("label", { className: "pv-fieldLabel", htmlFor: `url-${uid}`, children: "API \u5730\u5740" }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("label", { className: "pv-fieldLabel", htmlFor: `proto-${uid}`, children: "API \u534F\u8BAE" }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        "select",
        {
          id: `proto-${uid}`,
          className: "pv-input pv-selectInput",
          value: form.protocol,
          onChange: (ev) => setForm((f) => ({ ...f, protocol: ev.target.value })),
          children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("option", { value: "openai", children: "OpenAI Chat Completions" })
        }
      )
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("section", { className: "pv-section", children: [
      error ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "pv-err", role: "alert", children: error }) : null,
      notice ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "pv-savedNotice", role: "status", children: notice }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("ul", { className: "pv-rows", children: [
        providers.map((p) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("li", { className: "pv-rowCard", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-rowHead", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "pv-rowName", children: p.id }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
              "span",
              {
                className: "pv-credentialDot " + (dotState(p) === "ok" ? "pv-dotOk" : "pv-dotMissing"),
                title: dotTitle(p)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "pv-rowActions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "pv-rowBtn", disabled: busy, onClick: () => startEdit(p), children: openId === p.id && !creating ? "\u6536\u8D77" : "\u7F16\u8F91" }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
          openId === p.id && !creating ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
            providerFields(false, p),
            catalogSection(),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-rowActions pv-cardFooter", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "pv-secondaryButton", disabled: busy, onClick: closeCard, children: "\u53D6\u6D88" }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
        creating ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("li", { className: "pv-rowCard", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-rowHead", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "pv-rowName", children: "\u6DFB\u52A0\u6A21\u578B\u63D0\u4F9B\u5546" }),
            createInvalid ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "pv-credentialDot pv-dotMissing", title: "\u521A\u624D\u4FDD\u5B58\u6CA1\u901A\u8FC7\u6821\u9A8C,\u8BF7\u68C0\u67E5\u4E0B\u9762\u7684\u5B57\u6BB5" }) : null
          ] }),
          providerFields(true),
          catalogSection(),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-rowActions pv-cardFooter", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "pv-secondaryButton", disabled: busy, onClick: closeCard, children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
      !creating ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "pv-addButton", disabled: busy, onClick: startCreate, children: "\uFF0B \u6DFB\u52A0\u6A21\u578B\u63D0\u4F9B\u5546" }) : null
    ] }),
    pickerOpen ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      "div",
      {
        className: "pv-mask",
        onClick: (ev) => {
          if (ev.target === ev.currentTarget) closePicker();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-dialog", role: "dialog", "aria-modal": "true", "aria-label": "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u6A21\u578B", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h3", { className: "pv-dialogTitle", children: "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "pv-dialogDesc", children: "\u4EE5\u4E0B\u662F\u6A21\u578B\u63D0\u4F9B\u5546\u7684\u53EF\u7528\u6A21\u578B,\u52FE\u9009\u8981\u6DFB\u52A0\u7684\u6A21\u578B\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-candidateToolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
          visibleCandidates().length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "pv-candidateEmpty", role: "status", children: "\u6CA1\u6709\u5339\u914D\u7684\u6A21\u578B\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("ul", { className: "pv-candidateList", children: visibleCandidates().map((c) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("li", { className: "pv-candidate", children: /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("label", { className: "pv-candidateLabel", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("input", { type: "checkbox", checked: picked.has(c), onChange: () => togglePick(c) }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "pv-candidateId", title: c, children: c })
          ] }) }, c)) }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "pv-dialogFooter", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "pv-secondaryButton", onClick: closePicker, children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "pv-secondaryButton", onClick: adoptPicked, children: "\u6DFB\u52A0\u6240\u9009" })
          ] })
        ] })
      }
    ) : null
  ] });
}

// ../panel-ui/src/pages/models/ModelsPage.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
var SUBS = [
  { key: "logical", label: "\u903B\u8F91\u6A21\u578B" },
  { key: "overview", label: "\u6A21\u578B\u603B\u89C8" },
  { key: "channels", label: "\u6E20\u9053" },
  { key: "suppliers", label: "\u517C\u5BB9\u4F9B\u5E94\u5546" }
];
function ModelsPage({ initialSub = "logical", action = null }) {
  const [sub, setSub] = import_react11.default.useState(initialSub);
  const [subAction, setSubAction] = import_react11.default.useState(null);
  const on = SUBS.some((s) => s.key === sub) ? sub : SUBS[0].key;
  const publish = import_react11.default.useCallback((spec) => {
    setSubAction(spec);
  }, []);
  const select = import_react11.default.useCallback((key) => {
    setSubAction(null);
    setSub(key);
  }, []);
  const shown = subAction ?? action;
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("h1", { className: "page-title", children: "As One \xB7 \u6A21\u578B" }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("nav", { className: "subtabs", children: [
      SUBS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        "button",
        {
          type: "button",
          className: `subtab${s.key === on ? " on" : ""}`,
          onClick: () => select(s.key),
          children: s.label
        },
        s.key
      )),
      shown ? /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "subtabs-action", children: [
        shown.note ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: `act-note${shown.noteBusy ? " busy" : ""}`, title: shown.note, children: shown.note }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", className: "act-btn", disabled: shown.disabled, onClick: () => shown.run(), children: shown.label })
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(ModelsActionProvider, { value: publish, children: [
      on === "logical" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(LogicalModelsPage_default, {}) : null,
      on === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(DeploymentsPage_default, {}) : null,
      on === "channels" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(ChannelsPage, {}) : null,
      on === "suppliers" ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(ProvidersPage, {}) : null
    ] })
  ] });
}
var ModelsPage_default = ModelsPage;

// ../panel-ui/src/pages/UsageStatsPage.tsx
var import_react12 = __toESM(require("react"), 1);
var import_jsx_runtime15 = require("react/jsx-runtime");
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
  const [range, setRange] = import_react12.default.useState("all");
  const [granularity, setGranularity] = import_react12.default.useState("day");
  const [group, setGroup] = import_react12.default.useState("model");
  const [data, setData] = import_react12.default.useState(null);
  const [error, setError] = import_react12.default.useState("");
  const [loading, setLoading] = import_react12.default.useState(false);
  const [expanded, setExpanded] = import_react12.default.useState({});
  const [chartW, setChartW] = import_react12.default.useState(GEO.w);
  const [donutW, setDonutW] = import_react12.default.useState(760);
  const [hoverIdx, setHoverIdx] = import_react12.default.useState(null);
  const [tipW, setTipW] = import_react12.default.useState(0);
  const chartEl = import_react12.default.useRef(null);
  const donutEl = import_react12.default.useRef(null);
  const tipEl = import_react12.default.useRef(null);
  const load = import_react12.default.useCallback(async () => {
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
  import_react12.default.useEffect(() => {
    void load();
  }, [load]);
  const toggle = import_react12.default.useCallback((key) => {
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
  const chart = import_react12.default.useMemo(() => {
    const all = data?.buckets ?? [];
    const series = data?.series ?? [];
    const inner = Math.max(40, chartW - GEO.padL - GEO.padR);
    const maxBars = Math.max(1, Math.floor(inner / MIN_PITCH) + 1);
    const hidden = Math.max(0, all.length - maxBars);
    const bs = hidden ? all.slice(hidden) : all;
    const n4 = bs.length;
    const pitch = n4 > 1 ? inner / (n4 - 1) : inner;
    const barW = Math.max(3, Math.min(30, pitch * 0.62));
    const xOf = (i) => n4 > 1 ? GEO.padL + i * pitch : GEO.padL + inner / 2;
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
    const want = Math.min(8, n4);
    const seen = /* @__PURE__ */ new Set();
    for (let k = 0; k < want; k++) {
      const i = want > 1 ? Math.round((n4 - 1) * k / (want - 1)) : Math.max(0, n4 - 1);
      if (seen.has(i) || !bs[i]) continue;
      seen.add(i);
      labels.push({
        x: xOf(i),
        text: granularity === "month" ? bs[i].key : bs[i].key.slice(5)
      });
    }
    return {
      bs,
      n: n4,
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
  const hover = import_react12.default.useMemo(() => {
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
  import_react12.default.useEffect(() => {
    if (hoverIdx == null) {
      setTipW(0);
      return;
    }
    const el = tipEl.current;
    if (el) setTipW(el.offsetWidth);
  }, [hoverIdx]);
  const showCharts = data !== null && hasData;
  import_react12.default.useEffect(() => {
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
  const donutSize = import_react12.default.useMemo(() => Math.max(200, Math.min(280, donutW - 16 - 260)), [donutW]);
  const ring = import_react12.default.useMemo(() => {
    const s = donutSize;
    const sw = s * 0.15;
    const outer = s * 0.475;
    const r = outer - sw / 2;
    return { s, sw, r, c: s / 2, circ: 2 * Math.PI * r };
  }, [donutSize]);
  const modelSegs = import_react12.default.useMemo(
    () => segments(data?.series ?? [], (s, i) => seriesColor(s, data?.series ?? []), ring.circ),
    [data, ring.circ]
  );
  const providerSegs = import_react12.default.useMemo(() => {
    const list = data?.providers ?? [];
    const rows = list.map((p, i) => ({ key: p.provider, percent: p.percent, idx: i }));
    return segments(rows, (r) => providerColor(list[r.idx], r.idx), ring.circ);
  }, [data, ring.circ]);
  const modelRingTotal = totalTokens;
  const providerRingTotal = import_react12.default.useMemo(
    () => (data?.providers ?? []).reduce((m, p) => m + p.tokens, 0),
    [data]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_react12.default.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h1", { className: "page-title", children: "\u7528\u91CF\u7EDF\u8BA1" }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-ctl", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-seg", role: "group", "aria-label": "\u65F6\u95F4\u8303\u56F4", children: RANGES.map((r) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-seg", role: "group", "aria-label": "\u805A\u5408", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "button",
          {
            type: "button",
            className: granularity === "day" ? "on" : "",
            "aria-pressed": granularity === "day",
            onClick: () => setGranularity("day"),
            children: "\u6309\u5929"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-seg", role: "group", "aria-label": "\u7EDF\u8BA1\u7EF4\u5EA6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "button",
          {
            type: "button",
            className: group === "model" ? "on" : "",
            "aria-pressed": group === "model",
            onClick: () => setGroup("model"),
            children: "\u6309\u771F\u5B9E\u6A21\u578B"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "usage-refresh", disabled: loading, onClick: () => void load(), children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u5237\u65B0" }),
      data ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "hint usage-ctl-info", children: [
        rangeText,
        " \xB7 ",
        data.axis.length,
        " \u4E2A",
        granularity === "month" ? "\u6708" : "\u5929"
      ] }) : null
    ] }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "err", children: error }) : null,
    data && hasData ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-cards", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-k", children: "Tokens \u7528\u91CF" }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-v", children: full(totals?.tokens) }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-card-s", children: [
            "\u8F93\u5165 ",
            full(totals?.prompt_tokens),
            " \xB7 \u8F93\u51FA ",
            full(totals?.completion_tokens)
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-k", children: "\u8BF7\u6C42\u6570\u91CF" }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-v", children: full(totals?.requests) }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-s", children: "\u4EC5\u7EDF\u8BA1\u6210\u529F\u8BF7\u6C42" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-k", children: "\u5E73\u5747\u7F13\u5B58\u547D\u4E2D" }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-v", children: rateText(totals?.cache_hit_rate) }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-card-s", children: [
            fmtCount(totals?.cached_tokens ?? 0),
            " \u7F13\u5B58\u547D\u4E2D"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-k", children: "\u6D3B\u8DC3\u5929\u6570" }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-v", children: totals?.active_days ?? 0 }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-card-s", children: [
            "\u533A\u95F4 ",
            data.axis.length,
            " ",
            granularity === "month" ? "\u4E2A\u6708" : "\u5929"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-k", children: group === "logical" ? "\u6700\u5E38\u7528\u903B\u8F91\u6A21\u578B" : "\u6700\u5E38\u7528\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-v usage-card-v-sm", children: top?.name ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-card-s", children: top ? top.provider ?? (group === "logical" ? "\u903B\u8F91\u6A21\u578B" : "") : "\u5168\u90E8\u5F52\u300C\u5176\u4ED6\u300D" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "usage-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: trendTitle }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { ref: chartEl, className: "usage-chart-wrap", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
            "svg",
            {
              width: "100%",
              height: GEO.h,
              viewBox: `0 0 ${chartW} ${GEO.h}`,
              className: "usage-chart",
              onMouseLeave: () => setHoverIdx(null),
              children: [
                chart.ticksLeft.map((t) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("text", { className: "axis-text", x: GEO.padL - 6, y: t.y + 3.5, textAnchor: "end", children: t.text }, `lt${t.v}`)),
                chart.ticksRight.map((t) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                  "text",
                  {
                    className: "axis-text axis-text-r",
                    x: GEO.padL + (chartW - GEO.padL - GEO.padR) + 6,
                    y: t.y + 3.5,
                    children: t.text
                  },
                  `rt${t.p}`
                )),
                chart.labels.map((l) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("text", { className: "axis-text", x: l.x, y: GEO.padT + PLOT_H + 16, textAnchor: "middle", children: l.text }, `lb${l.x}`)),
                chart.bars.map((b) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("rect", { x: b.x, y: b.y, width: b.w, height: Math.max(0, b.h), fill: b.color, className: "usage-bar" }, b.key)),
                chart.path ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("path", { d: chart.path, fill: "none", stroke: LINE_COLOR, strokeWidth: 2, className: "usage-line" }) : null,
                chart.bs.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
                hoverIdx != null && chart.bs[hoverIdx] && chart.bs[hoverIdx].cache_hit_rate != null ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
          hover ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { ref: tipEl, className: "usage-tip", style: { left: `${hover.left}px` }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-tip-head", children: hover.key }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u603B Token" }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("b", { children: full(hover.tokens) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u8BF7\u6C42" }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("b", { children: full(hover.requests) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "\u7F13\u5B58\u547D\u4E2D\u7387" }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("b", { children: hover.rate })
            ] }),
            hover.rows.length ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-tip-sep" }) : null,
            hover.rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "usage-tip-nm", children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "usage-dot sm", style: { background: r.color } }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-tip-nm-t", title: r.name, children: r.name })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("b", { children: fmtCount(r.tokens) })
            ] }, r.key)),
            hover.more ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-tip-more", children: [
              "\u2026\u53E6\u6709 ",
              hover.more,
              " \u4E2A\u5E8F\u5217"
            ] }) : null
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-legend", children: [
          data.series.map((s) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "usage-legend-i", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "usage-dot", style: { background: seriesColor(s, data.series) } }),
            seriesLabel(s, group)
          ] }, s.key)),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "usage-legend-i", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "usage-line-sw", style: { background: LINE_COLOR } }),
            "\u7F13\u5B58\u547D\u4E2D\u7387"
          ] })
        ] }),
        chart.hidden ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "hint", children: [
          "\u6876\u592A\u5BC6,\u53EA\u753B\u6700\u8FD1 ",
          chart.bs.length,
          " \u4E2A(\u66F4\u65E9 ",
          chart.hidden,
          " \u4E2A\u6CA1\u753B\u5165\u67F1\u72B6\u56FE),\u53EF\u5207\u300C\u6309\u6708\u300D\u770B\u66F4\u957F\u7684\u8DE8\u5EA6\u3002"
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "usage-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: "\u6A21\u578B\u7528\u91CF" }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { ref: donutEl, className: "usage-split", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("svg", { className: "usage-donut", width: ring.s, height: ring.s, viewBox: `0 0 ${ring.s} ${ring.s}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("circle", { cx: ring.c, cy: ring.c, r: ring.r, fill: "none", stroke: "#22262e", strokeWidth: ring.sw }),
            modelSegs.map((g) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.04, className: "usage-donut-v", textAnchor: "middle", children: fmtCount(modelRingTotal) }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.13, className: "usage-donut-k", textAnchor: "middle", children: "Tokens \u7528\u91CF" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("ol", { className: "usage-rank", children: data.series.map((s, i) => {
            const kids = s.is_other ? s.folded ?? [] : s.models;
            const kidKey = (m, j) => m.key ?? `${m.provider ?? ""}/${m.name}:${j}`;
            return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                "div",
                {
                  className: `usage-row${kids.length > 0 ? " clickable" : ""}`,
                  onClick: kids.length ? () => toggle(`m:${s.key}`) : void 0,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-rank-i", children: i + 1 }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: `usage-caret${expanded[`m:${s.key}`] ? " open" : ""}`, children: kids.length ? "\u203A" : "" }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "usage-dot", style: { background: seriesColor(s, data.series) } }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "usage-name", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name-m", children: s.is_other ? "\u5176\u4ED6" : rowMain(s) }),
                      rowSub(s) ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name-s", children: rowSub(s) }) : null
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-val", children: full(s.tokens) }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-pct", children: fmtPct(s.percent) })
                  ]
                }
              ),
              expanded[`m:${s.key}`] ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-fold", children: kids.map((m, j) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-subrow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "usage-dot sm", style: { background: OTHER_COLOR } }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "usage-name", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name-m", children: m.name }),
                  m.provider ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name-s", children: m.provider }) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-val", children: full(m.tokens) }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-pct", children: fmtPct(m.percent) })
              ] }, kidKey(m, j))) }) : null
            ] }, s.key);
          }) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "usage-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: "\u5404\u4F9B\u5E94\u5546\u7528\u91CF" }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-split", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("svg", { className: "usage-donut", width: ring.s, height: ring.s, viewBox: `0 0 ${ring.s} ${ring.s}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("circle", { cx: ring.c, cy: ring.c, r: ring.r, fill: "none", stroke: "#22262e", strokeWidth: ring.sw }),
            providerSegs.map((g) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.04, className: "usage-donut-v", textAnchor: "middle", children: fmtCount(providerRingTotal) }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.13, className: "usage-donut-k", textAnchor: "middle", children: "Tokens \u7528\u91CF" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("ol", { className: "usage-rank", children: data.providers.map((p, i) => (
            //: As One 契约的 UsageProvider 无 key/name,用 provider 当键;「其他」行
            //: 的显示名固定为「其他」(Nexus 的 p.name),机器键为哨兵
            //: "\u0000pother"。folded 为对齐 Nexus is_other 行新增(见
            //: panel-types.ts),assembly 在排名尾部确有被聚合供应商时产出。
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                "div",
                {
                  className: `usage-row${(p.is_other ? (p.folded?.length ?? 0) > 0 : p.models.length > 0) ? " clickable" : ""}`,
                  onClick: (p.is_other ? (p.folded?.length ?? 0) > 0 : p.models.length > 0) ? () => toggle(`p:${p.provider}`) : void 0,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-rank-i", children: i + 1 }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: `usage-caret${expanded[`p:${p.provider}`] ? " open" : ""}`, children: p.is_other ? p.folded?.length ?? 0 ? "\u203A" : "" : p.models.length ? "\u203A" : "" }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "usage-dot", style: { background: providerColor(p, i) } }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "usage-name", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name-m", children: p.is_other ? "\u5176\u4ED6" : p.provider }),
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name-s", children: p.is_other ? `${p.folded?.length ?? 0} \u4E2A\u4F9B\u5E94\u5546` : `${p.models.length} \u4E2A\u6A21\u578B` })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-val", children: full(p.tokens) }),
                    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-pct", children: fmtPct(p.percent) })
                  ]
                }
              ),
              expanded[`p:${p.provider}`] ? p.is_other ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-fold", children: (p.folded ?? []).map((f) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
                  "div",
                  {
                    className: `usage-subrow${f.models.length > 0 ? " clickable" : ""}`,
                    onClick: f.models.length ? () => toggle(`pf:${f.key}`) : void 0,
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: `usage-caret fold${expanded[`pf:${f.key}`] ? " open" : ""}`, children: f.models.length ? "\u203A" : "" }),
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "usage-dot sm", style: { background: OTHER_COLOR } }),
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "usage-name", children: [
                        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name-m", children: f.name }),
                        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "usage-name-s", children: [
                          f.models.length,
                          " \u4E2A\u6A21\u578B"
                        ] })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-val", children: full(f.tokens) }),
                      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-pct", children: fmtPct(f.percent) })
                    ]
                  }
                ),
                expanded[`pf:${f.key}`] ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-fold deep", children: f.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-subrow", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name-m", children: m.name }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-val", children: full(m.tokens) }),
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-pct", children: fmtPct(m.percent) })
                ] }, `${m.provider ?? ""}/${m.name}`)) }) : null
              ] }, f.key)) }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "usage-fold", children: p.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "usage-subrow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("i", { className: "usage-dot sm", style: { background: OTHER_COLOR } }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-name-m", children: m.name }) }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-val", children: full(m.tokens) }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "usage-pct", children: fmtPct(m.percent) })
              ] }, `${m.provider ?? ""}/${m.name}`)) }) : null
            ] }, p.provider)
          )) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "hint usage-foot", children: [
        "\u7EDF\u8BA1\u622A\u81F3 ",
        data.last_day ?? "\u2014",
        " \xB7 \u533A\u95F4 ",
        rangeText,
        " \xB7 \u6570\u636E\u6E90 ",
        data.source
      ] })
    ] }) : null,
    data && !hasData ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("p", { className: "hint", children: [
      "\u8FD9\u4E2A\u533A\u95F4\u5185\u6CA1\u6709\u7528\u91CF\u6570\u636E(\u5E93\u91CC\u6709\u6570\u636E\u7684\u8303\u56F4\u662F ",
      data.from,
      " \u2192 ",
      data.last_day ?? data.to,
      ",\u6362\u4E00\u4E2A\u65F6\u95F4\u8303\u56F4\u770B\u770B)\u3002"
    ] }) : null,
    !data && !loading ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "hint", children: "\u6682\u65E0\u7559\u5B58\u6570\u636E(\u7F51\u5173\u5904\u7406\u8BF7\u6C42\u540E\u81EA\u52A8\u6309\u5929\u843D\u76D8)\u3002" }) : null
  ] });
}

// ../panel-ui/src/pages/SettingsPage.tsx
var import_react14 = __toESM(require("react"), 1);

// ../panel-ui/src/pages/settings-rules.tsx
var import_react13 = __toESM(require("react"), 1);
var import_jsx_runtime16 = require("react/jsx-runtime");
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
    [g.free, "P1 \u8C03\u5EA6\u4F18\u5148\u7EA7"],
    [g.expiry, "P2 \u8C03\u5EA6\u4F18\u5148\u7EA7"],
    [g.consume, "P3 \u8C03\u5EA6\u4F18\u5148\u7EA7"],
    [g.degrade, "P4 \u8C03\u5EA6\u4F18\u5148\u7EA7"],
    [g.disabled, "\u7981\u7528"]
  ]) {
    for (const r of group) {
      const e = tierErr(r);
      if (e) return `${name2}:${e}`;
    }
  }
  for (const r of g.cooldown) {
    const e = cooldownErr(r);
    if (e) return `\u51B7\u5374:${e}`;
  }
  return null;
}
function withCurrent(options, current) {
  return current && !options.includes(current) ? [...options, current] : options;
}
function ProviderBox(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "box box-provider", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "box-label", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { children: [
        "Provider ",
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "req", children: "*" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { type: "button", className: "btn-del", onClick: props.onDelete, children: "\u5220\u9664\u89C4\u5219" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("select", { className: "input-control", value: props.value, onChange: (ev) => props.onSelect(ev.target.value), children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: "", children: "\u8BF7\u9009\u62E9 Provider" }),
      withCurrent(props.options, props.value).map((p) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: p, children: p }, p))
    ] })
  ] });
}
function ModelBox(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "box box-model", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { children: [
      "Model",
      props.optional ? "(\u53EF\u9009)" : ""
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("select", { className: "input-control", value: props.value, onChange: (ev) => props.onSelect(ev.target.value), children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: "", children: "\u7559\u7A7A = \u5168\u90E8" }),
      withCurrent(props.options, props.value).map((m) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("option", { value: m, children: m }, m))
    ] })
  ] });
}
function ExpiryBox(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "box box-expiry", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u5230\u671F\u65F6\u95F4" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
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
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(import_react13.default.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("input", { type: "checkbox", id, checked: props.weekdays.includes(w.k), onChange: () => props.onToggle(w.k) }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("label", { htmlFor: id, children: w.label })
    ] }, w.k);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "box box-weekdays", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u751F\u6548\u661F\u671F" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "weekday-flex", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "weekday-group", children: WEEKDAYS.slice(0, 5).map(renderDay) }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "weekday-group", children: WEEKDAYS.slice(5).map(renderDay) })
    ] })
  ] });
}
function TimesBox(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "box box-times", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u751F\u6548\u65F6\u95F4\u6BB5" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "time-flex", children: [
      props.times.map((t, ti) => /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "time-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
          "input",
          {
            type: "time",
            className: "input-control",
            value: t.start,
            onChange: (ev) => props.onPatch(props.times.map((x, at) => at === ti ? { ...x, start: ev.target.value } : x))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "separator", children: "~" }),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
          "input",
          {
            type: "time",
            className: "input-control",
            value: t.end,
            onChange: (ev) => props.onPatch(props.times.map((x, at) => at === ti ? { ...x, end: ev.target.value } : x))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
          "button",
          {
            type: "button",
            className: "btn-del-time",
            onClick: () => props.onPatch(props.times.filter((_, at) => at !== ti)),
            children: "\xD7"
          }
        )
      ] }, ti)),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "box box-cooldown", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "box-label", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: "\u51B7\u5374(\u5206\u949F)" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
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
function ruleCard(badge, title, rules, add, render, hint) {
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("section", { className: "ui-card rule-panel asone-scheduler", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "ui-card-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("h2", { className: "ui-card-title", children: [
        /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "badge", children: badge }),
        title ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { children: title }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("button", { type: "button", className: "btn-add", onClick: add, children: "+ \u6DFB\u52A0\u89C4\u5219" })
    ] }),
    hint ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "card-hint", children: hint }) : null,
    rules.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("p", { className: "card-empty", children: "\u6682\u65E0\u89C4\u5219,\u70B9\u53F3\u4E0A\u300C+ \u6DFB\u52A0\u89C4\u5219\u300D\u65B0\u589E" }) : null,
    rules.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(import_react13.default.Fragment, { children: render(r, i) }, i))
  ] });
}

// ../panel-ui/src/pages/SettingsPage.tsx
var import_jsx_runtime17 = require("react/jsx-runtime");
var SECTION_TITLES = {
  // ⚠️ 这些 key 必须与后端 sections 的段名一字不差。
  external_refresh: {
    title: "\u5916\u90E8\u6570\u636E\u5237\u65B0"
  },
  // 「调度规则」不再是总卡:五档 + 冷却各自拆成平级面板(见 TIER_PANELS)。
  retry: {
    title: "\u91CD\u8BD5\u7B56\u7565"
  },
  ui: {
    title: "\u754C\u9762"
  }
};
var TIER_PANELS = [
  { badge: "P1", key: "free", title: "\u8C03\u5EA6\u4F18\u5148\u7EA7", desc: "priority 1:\u547D\u4E2D\u5373\u514D\u8D39,\u4E0D\u8BA1\u8D39\u3001\u4E0D\u964D\u7EA7\u3002" },
  { badge: "P2", key: "expiry", title: "\u8C03\u5EA6\u4F18\u5148\u7EA7", desc: "priority 2:\u547D\u4E2D\u5373\u6309\u51ED\u636E\u5230\u671F\u65F6\u95F4\u5904\u7406\u3002" },
  { badge: "P3", key: "consume", title: "\u8C03\u5EA6\u4F18\u5148\u7EA7", desc: "priority 3:\u547D\u4E2D\u5373\u6309\u666E\u901A\u6D88\u8017\u8BA1\u8D39\u3002" },
  { badge: "P4", key: "degrade", title: "\u8C03\u5EA6\u4F18\u5148\u7EA7", desc: "priority 4:\u547D\u4E2D\u5373\u964D\u4F18\u5148\u7EA7\u5904\u7406\u3002" },
  { badge: "\u7981\u7528", key: "disabled", title: "", desc: "priority 0:\u547D\u4E2D\u5373\u76F4\u63A5\u7981\u7528\u8BE5\u63D0\u4F9B\u5546/\u6A21\u578B\u3002" }
];
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
    const n4 = typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n4) ? n4 : fb;
  };
  const base = Math.max(1e-3, read("retry.base_backoff_s", 1));
  const cap = Math.max(base, read("retry.max_backoff_s", 15));
  const jit = Math.min(1, Math.max(0, read("retry.jitter_ratio", 0.2)));
  const realMax = Math.trunc(read("retry.real_max", 10));
  const logicalMax = Math.max(1, Math.trunc(read("retry.logical_max", 1)));
  const unlimited = realMax <= 0;
  const N = unlimited ? 12 : Math.min(Math.max(realMax, 1), 12);
  const raw = (n4) => Math.min(cap, base * Math.pow(2, n4 - 1));
  const seq = [];
  for (let n4 = 1; n4 <= N; n4++) seq.push(raw(n4));
  const maxV = Math.max(...seq, 1e-3);
  const sumUpTo = (k) => {
    let s = 0;
    for (let n4 = 1; n4 <= k; n4++) s += raw(n4);
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
  const fmt1 = (n4) => {
    if (!Number.isFinite(n4)) return "0";
    if (Math.abs(n4) >= 1e4) return n4.toLocaleString("en-US", { maximumFractionDigits: 1 });
    return n4.toFixed(1);
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
  const [data, setData] = import_react14.default.useState(null);
  const [draft, setDraft] = import_react14.default.useState({});
  const [busy, setBusy] = import_react14.default.useState(false);
  const [msg4, setMsg] = import_react14.default.useState("");
  const [err, setErr] = import_react14.default.useState("");
  const [ruleGroups, setRuleGroups] = import_react14.default.useState(freshGroups());
  const [deployments, setDeployments] = import_react14.default.useState([]);
  const [reqLog, setReqLog] = import_react14.default.useState(null);
  const [logMsg, setLogMsg] = import_react14.default.useState("");
  const [keyCopied, setKeyCopied] = import_react14.default.useState(false);
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
  import_react14.default.useEffect(() => {
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
    let n4 = 0;
    for (const section of Object.keys(draft)) {
      const orig = data.sections[section] ?? {};
      for (const key of Object.keys(draft[section])) {
        if (JSON.stringify(draft[section][key]) !== JSON.stringify(orig[key])) n4++;
      }
    }
    return n4;
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
    return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-field" + (wide || kind === "json" ? " wide" : ""), children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-field-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-field-label", children: spec.label }),
        unit ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-field-unit", children: unit }) : null
      ] }),
      kind === "bool" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("label", { className: "ui-check", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
          "input",
          {
            type: "checkbox",
            checked: on,
            disabled: busy,
            onChange: (ev) => setValue(section, spec, ev.target.checked)
          }
        ),
        on ? "\u5DF2\u542F\u7528" : "\u5DF2\u5173\u95ED"
      ] }) : kind === "enum" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
        "select",
        {
          className: "ui-select",
          value,
          disabled: busy,
          onChange: (ev) => setValue(section, spec, ev.target.value),
          children: (spec.options ?? []).map((opt) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("option", { value: opt, children: opt }, opt))
        }
      ) : kind === "json" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
        "textarea",
        {
          className: "ui-jsonbox",
          rows: 10,
          value,
          disabled: busy,
          onChange: (ev) => setValue(section, spec, ev.target.value)
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
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
  function schedulerPanels() {
    const g = ruleGroups;
    const out = [];
    for (const p of TIER_PANELS) {
      const key = p.key;
      out.push(
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_react14.default.Fragment, { children: ruleCard(
          p.badge,
          p.title,
          tierList(key),
          () => addTier(key),
          (r, i) => {
            const e = tierErr(r);
            return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "blocks-container", children: [
                /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
                  ProviderBox,
                  {
                    value: r.provider,
                    options: providerOptions,
                    onSelect: (v) => patchTier(key, i, { provider: v, model: "" }),
                    onDelete: () => removeTier(key, i)
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
                  ModelBox,
                  {
                    optional: true,
                    value: r.model,
                    options: modelOptionsFor(r.provider),
                    onSelect: (v) => patchTier(key, i, { model: v })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(ExpiryBox, { value: r.expires_at, onChange: (v) => patchTier(key, i, { expires_at: v }) }),
                /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(WeekdayBox, { idPrefix: `tier-${key}-${i}`, weekdays: r.weekdays, onToggle: (d) => toggleDay(i, d, key) }),
                /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(TimesBox, { times: r.times, onPatch: (next) => patchTier(key, i, { times: next }) })
              ] }),
              e ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "rule-err", children: e }) : null
            ] });
          },
          p.desc
        ) }, p.key)
      );
    }
    out.push(
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_react14.default.Fragment, { children: ruleCard(
        "\u51B7\u5374",
        "",
        g.cooldown,
        addCooldown,
        (r, i) => {
          const e = cooldownErr(r);
          return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "blocks-container", children: [
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
                ProviderBox,
                {
                  value: r.provider,
                  options: providerOptions,
                  onSelect: (v) => patchCooldown(i, { provider: v }),
                  onDelete: () => removeCooldown(i)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(CooldownBox, { value: r.cooldown, onChange: (v) => patchCooldown(i, { cooldown: v }) })
            ] }),
            e ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "rule-err", children: e }) : null
          ] });
        },
        "\u6309\u4F9B\u5E94\u5546\u8BBE\u7F6E\u51B7\u5374\u65F6\u957F(\u5206\u949F);\u547D\u4E2D\u51B7\u5374\u671F\u95F4\u8BE5\u4F9B\u5E94\u5546\u4E0D\u53EF\u7528\u3002"
      ) }, "cooldown")
    );
    if (pinSecondsSpec) {
      out.push(
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("section", { id: "sched-pin", className: "ui-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-card-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h2", { className: "ui-card-title", children: "\u4F1A\u8BDD\u7C98\u6027" }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-card-sub", children: "\u540C\u4E00\u4F1A\u8BDD\u5728\u7C98\u6027\u65F6\u957F\u5185\u4FDD\u6301\u540C\u4E00\u540E\u7AEF" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "ui-fields", children: field("scheduler", pinSecondsSpec) })
        ] }, "pin")
      );
    }
    return out;
  }
  function sectionCard(section) {
    const specs = specsOf(section);
    if (specs.length === 0) return null;
    const meta = SECTION_TITLES[section];
    let body;
    if (section === "retry") {
      body = /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-rule-groups", children: [
        retryGroups().map((grp) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "ui-group-head", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-group-title", children: grp.title }) }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "ui-fields", children: grp.fields.map((s) => field("retry", s)) })
        ] }, grp.title)),
        codesField ? field("retry", codesField, true) : null,
        chartBlock
      ] });
    } else {
      body = /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "ui-fields", children: specs.map((s) => field(section, s)) });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("section", { id: section, className: "ui-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "ui-card-head", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h2", { className: "ui-card-title", children: meta.title }) }),
      body
    ] }, section);
  }
  const chart = backoffChart(draft);
  const codesField = specOf("retry.codes");
  const pinSecondsSpec = specOf("scheduler.pin_seconds");
  const chartBlock = /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-chart-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("svg", { className: "ui-chart", viewBox: `0 0 ${chart.W} ${chart.H}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("line", { className: "ui-chart-yaxis", x1: chart.padL, y1: chart.padT, x2: chart.padL, y2: chart.y(0) }),
      chart.yTicks.map((t) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("g", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("line", { className: "ui-chart-grid", x1: chart.padL, y1: t.y, x2: chart.W - chart.padR, y2: t.y }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("text", { className: "ui-chart-label", x: chart.padL - 6, y: t.y, textAnchor: "end", dominantBaseline: "middle", children: chart.fmtAxis(t.v) })
      ] }, `y${t.v}`)),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("line", { className: "ui-chart-axis", x1: chart.padL, y1: chart.y(0), x2: chart.W - chart.padR, y2: chart.y(0) }),
      chart.seq.map((v, i) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("line", { className: "ui-chart-dash", x1: chart.dashX, y1: chart.padT, x2: chart.dashX, y2: chart.y(0) }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("polyline", { className: "ui-chart-line", points: chart.seq.map((v, i) => `${chart.x(i)},${chart.y(v)}`).join(" ") }),
      chart.seq.map((v, i) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("circle", { className: "ui-chart-dot", cx: chart.x(i), cy: chart.y(v), r: 4 }, `dot${i}`)),
      chart.seq.map((_v, i) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("text", { className: "ui-chart-tick", x: chart.x(i), y: chart.H - 8, textAnchor: "middle", children: i + 1 }, `tick${i}`))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-chart-text", children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { children: chart.seqText }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { children: chart.budgetKText }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { children: chart.budgetMText }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { children: "\u6BCF\u6B21 \xD72 \u9012\u589E\u5E76\u5728\u300C\u6700\u5927\u9000\u907F\u300D\u5904\u5C01\u9876;\u6296\u52A8\u4F7F\u6BCF\u4E00\u6863\u5728 [80%, 100%] \xD7 \u786E\u5B9A\u503C \u5185\u968F\u673A\u3002" })
    ] })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-shell", children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h1", { className: "ui-page-title", children: "\u8BBE\u7F6E" }),
    busy ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "hint", children: "\u52A0\u8F7D\u4E2D\u2026" }) : null,
    err ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "ui-err", children: err }) : null,
    data ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "ui-layout", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-content", children: [
      sectionCard("external_refresh"),
      schedulerPanels(),
      sectionCard("retry"),
      sectionCard("ui"),
      reqLog ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("section", { id: "request-log", className: "ui-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "ui-card-head", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h2", { className: "ui-card-title", children: "\u8BF7\u6C42\u65E5\u5FD7" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-fields", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-field", children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "ui-field-head", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-field-label", children: "\u8BB0\u5F55\u6863\u4F4D" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
              "select",
              {
                className: "ui-select",
                value: reqLog.content_mode,
                disabled: busy,
                onChange: (ev) => void saveReqLog(ev.target.value),
                children: reqLog.content_modes.map((m) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("option", { value: m.value, children: m.label }, m.value))
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-field wide", children: [
            /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "ui-field-head", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-field-label", children: "\u843D\u76D8\u4F4D\u7F6E" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-key-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("code", { className: "ui-key", children: reqLog.path }),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { className: "ui-badge", children: [
                "\u5DF2\u5199 ",
                reqLog.counters?.written ?? 0,
                " \u6761"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { className: "ui-badge", children: [
                reqLog.size_bytes,
                " \u5B57\u8282"
              ] })
            ] }),
            reqLog.last_error ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("p", { className: "ui-field-err", children: [
              "\u4E0A\u6B21\u8BB0\u5F55\u5931\u8D25:",
              reqLog.last_error
            ] }) : null
          ] })
        ] }),
        logMsg ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: "ui-field-hint", children: logMsg }) : null
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("section", { id: "readonly", className: "ui-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-card-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("h2", { className: "ui-card-title", children: "\u53EA\u8BFB\u4FE1\u606F" }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-card-sub", children: "\u73AF\u5883\u53D8\u91CF ONE_API_KEY \xB7 \u53EA\u8BFB" })
        ] }),
        data.master_key ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-key-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("code", { className: "ui-key", children: data.master_key }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("button", { type: "button", className: "ui-btn-ghost", disabled: busy, onClick: () => void copyKey(), children: keyCopied ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236" })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-field-hint", children: "\u672A\u8BBE\u7F6E ONE_API_KEY:\u5F53\u524D\u65E0\u9274\u6743(\u6240\u6709\u8BF7\u6C42\u653E\u884C)" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-savebar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-savebar-count", children: totalChanged() > 0 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-savebar-dot" }),
          totalChanged(),
          " \u9879\u672A\u4FDD\u5B58"
        ] }) : "\u6CA1\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" }),
        msg4 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "ui-savebar-msg", children: msg4 }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "ui-savebar-btns", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("button", { type: "button", className: "ui-btn-ghost", disabled: busy, onClick: discard, children: "\u653E\u5F03\u6539\u52A8" }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
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
var import_jsx_runtime18 = require("react/jsx-runtime");
var NAV_ITEMS = [
  { key: "overview", label: "\u603B\u89C8" },
  { key: "models", label: "\u6A21\u578B" },
  { key: "usage", label: "\u7528\u91CF\u7EDF\u8BA1" },
  { key: "settings", label: "\u8BBE\u7F6E" }
];
function App() {
  const [page, setPage] = import_react15.default.useState("overview");
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("div", { className: "app", children: [
    /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("header", { className: "topbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("span", { className: "brand", children: "As One \xB7 \u5408\u4E00" }),
      /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(NavTabs, { tabs: NAV_ITEMS, active: page, onChange: (k) => setPage(k) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)("div", { className: "app-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)("main", { className: "content", children: [
      page === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(OverviewPage, {}) : null,
      page === "models" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(ModelsPage_default, {}) : null,
      page === "usage" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(UsageStatsPage, {}) : null,
      page === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(SettingsPage, {}) : null
    ] }) })
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
var styles_default = '/*\n * As One \u7BA1\u7406\u9762\u677F\u5168\u5C40\u6837\u5F0F(plain CSS,\u65E0\u6846\u67B6)\u3002\n * 2026-11-02 \u5B9A\u6848:\u914D\u8272**\u8054\u52A8 DSH \u4E3B\u9898** \u2014\u2014 \u9762\u677F\u5168\u90E8\u989C\u8272\u8D70\u5BBF\u4E3B\u4E3B\u9898\u4EE4\u724C\n * (`--dsw-alias-*`),`dsh-ui-appearance` \u901A\u8FC7 `ctx.theme.overrideTokens()` \u8986\u76D6\u7684\n * \u6B63\u662F\u8FD9\u6279\u4EE4\u724C(\u80CC\u666F/\u9762\u677F/\u6587\u5B57/\u4E3B\u8272/\u8FB9\u6846/\u6309\u94AE/\u4EA4\u4E92\u6001),\u6DF1\u6D45\u53CC\u6A21\u81EA\u52A8\u5207\u6362\u3002\n * \u5C11\u6570\u5BBF\u4E3B\u539F\u751F\u4EE4\u724C(\u6EDA\u52A8\u6761 `--dsw-alias-scrollbar-*`\u3001\u72B6\u6001\u8272 `--dsw-alias-state-*`)\n * \u63D2\u4EF6\u4E0D\u8986\u76D6,\u4F46\u7531 DSH \u4E3B\u9898\u81EA\u8EAB\u6309\u6DF1\u6D45\u6A21\u5F0F\u7ED9\u51FA,\u540C\u6837\u4E0D\u7528\u5199\u6B7B\u3002\n * \u4EE4\u724C\u7F3A\u5E2D\u65F6(\u72EC\u7ACB Electron \u9762\u677F\u7B49\u65E0 DSH \u4E3B\u9898\u7684\u73AF\u5883)\u56DE\u9000\u5230 Nexus \u6697\u8272\u7CFB,\u89C2\u611F\u4E0D\u53D8\u3002\n */\n\n.asone-panel * {\n  box-sizing: border-box;\n}\n\n.asone-panel {\n  /*\n   * \u8C03\u8272\u677F:\u6240\u6709\u989C\u8272\u90FD\u53D6\u81EA DSH \u5BBF\u4E3B\u4E3B\u9898\u4EE4\u724C\u5C42(--dsw-alias-*)\u3002\n   * dsh-ui-appearance \u8986\u76D6\u7684\u6B63\u662F\u540C\u4E00\u5C42\u4EE4\u724C,\u6240\u4EE5\u5B83\u6362\u914D\u8272\u65B9\u6848/\u6362\u76AE\u80A4\u65F6,\n   * \u9762\u677F\u6574\u4F53\u5B9E\u65F6\u8DDF\u968F,\u4E0D\u9700\u8981\u5728\u8FD9\u91CC\u5199\u6B7B\u4EFB\u4F55\u4E00\u4E2A\u989C\u8272\u3002\n   * \u9017\u53F7\u540E\u7684 hex \u53EA\u662F\u300C\u72EC\u7ACB Electron(\u6CA1\u6709 DSH \u5BBF\u4E3B\u3001\u6CA1\u6709\u4EE4\u724C)\u300D\u7684\u515C\u5E95\u503C,\n   * \u5728 DSH \u4E0B\u6C38\u8FDC\u4E0D\u4F1A\u88AB\u7528\u5230\u3002\n   */\n  --bg: var(--dsw-alias-bg-base, #101722);\n  /*\n   * \u80CC\u666F\u5C42(\u4E0D\u662F\u9762\u677F\u5C42):dsh-ui-appearance \u5F00\u4E86\u58C1\u7EB8/\u89C6\u9891\u65F6\u4F1A\u628A\n   * --dsw-alias-bg-base \u5199\u6210 transparent,\u4E8E\u662F\u8FD9\u4E00\u5C42\u76F4\u63A5\u900F\u51FA\u80CC\u666F\u56FE,\n   * \u9876\u680F\u7528\u5B83\u5C31\u300C\u8DDF\u968F\u80CC\u666F\u300D\u800C\u4E0D\u662F\u300C\u8DDF\u968F\u9762\u677F\u300D\u3002\n   * \u515C\u5E95\u503C\u7ED9 transparent:\u72EC\u7ACB Electron \u91CC body \u81EA\u5DF1\u6709\u5E95\u8272,\u9876\u680F\u900F\u660E = \u4E0E body \u540C\u8272\u3002\n   */\n  --bg-base: var(--dsw-alias-bg-base, transparent);\n  --bg-card: var(--dsw-alias-bg-layer-1, #141b26);\n  --bg-deep: var(--dsw-alias-bg-layer-2, #10141a);\n  --border: var(--dsw-alias-border-l2, #2c3a4d);\n  --border-soft: var(--dsw-alias-border-l1, #22303f);\n  /*\n   * \u5B57\u8272\u4E09\u7EA7(2026-11-03 \u7528\u6237\u5B9A\u6848\u300C\u52A0\u5927\u9ED1\u5B57\u6BD4\u4F8B\u300D):\n   *   --text       \u4E3B\u5B57\u8272(label-primary)\u3002\u6D45\u8272\u4E3B\u9898\u4E0B\u5C31\u662F\u9ED1\u5B57,\u6DF1\u8272\u4E3B\u9898\u4E0B\u662F\u767D\u5B57\u3002\n   *   --text-soft  \u6B21\u5B57\u8272(label-secondary)\u3002\u53EA\u7559\u7ED9**\u8F85\u52A9\u8BF4\u660E**:\u63D0\u793A/\u6CE8\u91CA/\u526F\u6807\u9898/\u5360\u4F4D\u7B26\u3002\n   *   --dim        \u6700\u5F31(label-tertiary)\u3002\u53EA\u7559\u7ED9**\u88C5\u9970\u6027**\u5185\u5BB9:\u6298\u53E0\u7BAD\u5934\u3001\u7A7A\u6001\u3001\u8FB9\u6846\u65C1\u6CE8\u3002\n   *\n   * \u5206\u7EA7\u53E3\u5F84:**\u51E1\u662F\u300C\u4FE1\u606F\u300D\u90FD\u7528 --text** \u2014\u2014 \u6807\u9898\u3001\u6570\u503C\u3001\u540D\u79F0\u3001\u8868\u5934\u3001\u5B57\u6BB5\u540D\u3001\n   * \u5FBD\u6807\u3001\u6309\u94AE\u6587\u5B57\u3001\u8F93\u5165\u6846\u91CC\u7684\u5185\u5BB9\u3001\u8868\u683C\u5355\u5143\u683C\u503C\u4E00\u5F8B\u4E3B\u5B57\u8272;\n   * \u53EA\u6709\u300C\u8BF4\u660E\u300D\u624D\u964D\u7EA7,\u8BF4\u660E\u662F\u7ED9\u4EBA\u8BFB\u4E0A\u4E0B\u6587\u7528\u7684,\u4E0D\u8BE5\u8DDF\u4FE1\u606F\u62A2\u6CE8\u610F\u529B\u3002\n   * \u6539\u9020\u540E\u4E3B\u5B57\u8272\u5360\u6BD4 19% \u2192 66%,\u5F31\u8272\u53EA\u5269 63 \u5904\u3002\n   */\n  --text: var(--dsw-alias-label-primary, #e8eef5);\n  --text-soft: var(--dsw-alias-label-secondary, #cfe3f5);\n  --dim: var(--dsw-alias-label-tertiary, #8b94a3);\n  /* \u5F3A\u8C03\u8272\u9762\u4E0A\u7684\u5B57\u8272:\u63D2\u4EF6\u6309\u5F3A\u8C03\u8272\u7B97\u5BF9\u6BD4\u5EA6\u540E\u7ED9\u51FA */\n  --on-accent: var(--dsw-alias-label-primary-foreground, #f2f6fc);\n  --ok: var(--dsw-alias-state-success-primary, #5fbf7d);\n  --bad: var(--dsw-alias-state-error-primary, #e0685f);\n  --warn: var(--dsw-alias-state-warn-primary, #d9a441);\n  --accent: var(--dsw-alias-brand-primary, #4d6bfe);\n  --chip-bg: var(--dsw-alias-bg-layer-2, #232a33);\n  --fill: var(--dsw-alias-fill-l1, #1c2430);\n  /*\n   * \u73BB\u7483\u9762:\u8FD9\u91CC\u7EDD\u5BF9\u4E0D\u80FD\u518D\u53E0\u4E00\u6B21 alpha\u3002\n   * dsh-ui-appearance \u5728 surfaceAlpha < 1 \u65F6\u5DF2\u7ECF\u628A\u900F\u660E\u5EA6\u70D8\u7119\u8FDB\n   * --dsw-alias-bg-layer-1/2 \u4E0E --dsw-alias-interactive-bg-hover;\n   * \u9762\u677F\u82E5\u518D color-mix(..., transparent),\u5B9E\u9645\u4E0D\u900F\u660E\u5EA6\u4F1A\u8FDC\u4F4E\u4E8E\u7528\u6237\u8BBE\u5B9A\u503C,\n   * \u58C1\u7EB8\u4E0A\u6B63\u6587\u76F4\u63A5\u7CCA\u6389\u3002\u4EE4\u724C\u76F4\u63A5\u7528,\u65E7\u7684\u534A\u900F\u660E\u5199\u6CD5\u53EA\u7559\u4F5C\u72EC\u7ACB Electron \u7684\u515C\u5E95\u3002\n   */\n  --surface: var(--dsw-alias-bg-layer-1, color-mix(in srgb, #141b26 64%, transparent));\n  --surface-deep: var(--dsw-alias-bg-layer-2, color-mix(in srgb, #10141a 56%, transparent));\n  --surface-hover: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, #1f2732 72%, transparent));\n  /* \u72B6\u6001\u9762:\u989C\u8272\u6765\u81EA\u4EE4\u724C,\u53EA\u56FA\u5B9A\u6BD4\u4F8B */\n  --surface-ok: color-mix(in srgb, var(--ok) 12%, transparent);\n  --surface-bad: color-mix(in srgb, var(--bad) 12%, transparent);\n  --surface-warn: color-mix(in srgb, var(--warn) 12%, transparent);\n  --ok-line: color-mix(in srgb, var(--ok) 45%, transparent);\n  --bad-line: color-mix(in srgb, var(--bad) 45%, transparent);\n  --warn-line: color-mix(in srgb, var(--warn) 45%, transparent);\n  /* \u5F3A\u8C03\u9762 */\n  --accent-soft: color-mix(in srgb, var(--accent) 12%, transparent);\n  --accent-softer: color-mix(in srgb, var(--accent) 8%, transparent);\n  --accent-strong: color-mix(in srgb, var(--accent) 20%, transparent);\n  /* \u6C60(\u901A\u7528/\u7279\u6B8A)\u914D\u8272:\u53D6\u4E3B\u9898\u4EE4\u724C,\u6E10\u53D8\u5C3E\u8272\u878D\u8FDB\u9762\u677F\u8272 */\n  --pool-general: var(--dsw-alias-brand-primary, #4d6bfe);\n  --pool-general-soft: color-mix(in srgb, var(--pool-general) 62%, var(--dsw-alias-bg-layer-1, #141b26));\n  --pool-special: var(--dsw-alias-state-warn-primary, #d9a441);\n  --pool-special-soft: color-mix(in srgb, var(--pool-special) 62%, var(--dsw-alias-bg-layer-1, #141b26));\n  --pool-grad-general: linear-gradient(90deg, var(--pool-general), var(--pool-general-soft));\n  --pool-grad-special: linear-gradient(90deg, var(--pool-special), var(--pool-special-soft));\n  /*\n   * \u6BDB\u73BB\u7483:\u5B8C\u5168\u8DDF\u968F dsh-ui-appearance \u7684 glassBlur \u8BBE\u7F6E\u3002\n   * \u63D2\u4EF6\u628A --dsw-appearance-glass-filter \u5199\u5230 body \u4E0A,\u503C\u662F\n   * "blur(Npx) saturate(150%)";\u7528\u6237\u628A\u73BB\u7483\u5173\u6389\u65F6\u63D2\u4EF6\u5199 "none",\n   * \u9762\u677F\u968F\u4E4B\u5B8C\u5168\u4E0D\u78E8\u7802\u3002\u72EC\u7ACB Electron \u6CA1\u6709\u63D2\u4EF6 \u2192 \u6CA1\u6709\u73BB\u7483\u3002\n   */\n  --glass: var(--dsw-appearance-glass-filter, none);\n  /* \u9634\u5F71 / \u906E\u7F69:\u7EAF\u9ED1\u4E0E\u660E\u6697\u6A21\u5F0F\u65E0\u5173,\u7EDF\u4E00\u6536\u53E3\u5230\u4E00\u4E2A\u4EE4\u724C */\n  --shadow: rgb(0 0 0 / 45%);\n  --scrim: rgb(0 0 0 / 55%);\n  --track: color-mix(in srgb, var(--border) 60%, transparent);\n  --hairline: color-mix(in srgb, var(--text) 8%, transparent);\n  --mono: "JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace;\n}\n\n.asone-panel,\n.asone-panel,\n.asone-panel {\n  margin: 0;\n  padding: 0;\n  height: 100%;\n}\n\n.asone-panel {\n  background: var(--bg);\n  color: var(--text);\n  font-family: system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;\n  font-size: 13px;\n  line-height: 1.55;\n}\n\n/* \u2500\u2500 \u6EDA\u52A8\u6761:\u5168\u5C40\u7EDF\u4E00,\u4E0D\u7528\u7CFB\u7EDF\u81EA\u5E26\u6D45\u8272\u6EDA\u52A8\u6761\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n * \u9875\u9762\u4E00\u5F8B\u7528\u8FD9\u7248\u6DF1\u8272\u7EC6\u6EDA\u52A8\u6761(WebKit \u5185\u6838),\u4E0E\u6697\u8272\u9762\u677F\u4FDD\u6301\u4E00\u81F4;\n * Firefox \u7528\u6807\u51C6scrollbar-color \u515C\u5E95\u3002*/\n.asone-panel * {\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e) transparent;\n}\n\n.asone-panel ::-webkit-scrollbar {\n  width: 8px;\n  height: 8px;\n}\n\n.asone-panel ::-webkit-scrollbar-track {\n  background: transparent;\n}\n\n.asone-panel ::-webkit-scrollbar-thumb {\n  background: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e);\n  border-radius: 4px;\n}\n\n.asone-panel ::-webkit-scrollbar-thumb:hover {\n  background: var(--dsw-alias-scrollbar-hover-l2, #4a5d74);\n}\n\n.asone-panel ::-webkit-scrollbar-corner {\n  background: transparent;\n}\n\n/*\n * \u5E94\u7528\u9AA8\u67B6:\u9876\u680F\u56FA\u5B9A\u5728\u4E0A\u65B9,\u5185\u5BB9\u533A\u81EA\u5DF1\u6EDA\u3002\n *\n * 2026-11-03 \u7528\u6237\u5B9A\u6848\u300C\u9876\u680F\u8DDF\u968F\u80CC\u666F\u300D\u540E,\u9876\u680F\u4E0D\u80FD\u518D sticky \u2014\u2014\n * sticky \u7684\u900F\u660E\u9876\u680F\u4F1A\u88AB\u6EDA\u52A8\u4E0A\u6765\u7684\u5361\u7247\u7A7F\u900F(\u5361\u7247\u6807\u9898\u538B\u5728\u5BFC\u822A\u6587\u5B57\u4E0A)\u3002\n * \u6240\u4EE5\u628A\u6EDA\u52A8\u5BB9\u5668\u4E0B\u6C89\u4E00\u5C42:.app \u6491\u6EE1\u5BBF\u4E3B\u7ED9\u7684\u6574\u5217\u9AD8\u5EA6,.topbar \u662F\u4E0D\u6EDA\u52A8\u7684\n * \u56FA\u5B9A\u884C(\u80CC\u666F\u900F\u51FA\u58C1\u7EB8),.app-scroll \u624D\u662F\u771F\u6B63\u7684\u6EDA\u52A8\u533A\u3002\n */\n.asone-panel .app {\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n  min-height: 0;\n}\n\n/* \u771F\u6B63\u7684\u6EDA\u52A8\u5BB9\u5668:\u9876\u680F\u4E0B\u9762\u7684\u5185\u5BB9\u533A\u3002 */\n.asone-panel .app-scroll {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow-y: auto;\n  scrollbar-width: thin;\n  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e) transparent;\n}\n\n/* \u2500\u2500 \u9876\u680F\u4E0E\u5BFC\u822A\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n/*\n * 2026-11-03 \u7528\u6237\u5B9A\u6848:\u9876\u680F**\u8DDF\u968F\u80CC\u666F**,\u4E0D\u8DDF\u968F\u9762\u677F\u3002\n * \u4E4B\u524D\u8FD9\u91CC\u94FA\u7684\u662F --surface(= bg-layer-1 \u9762\u677F\u5C42),\u5728\u5F00\u58C1\u7EB8\u65F6\u662F\u4E00\u5C42\u767D\u8499\u8499\u7684\n * \u9762\u677F\u8272,\u628A\u58C1\u7EB8\u76D6\u4F4F\u4E00\u5C42;\u4E0B\u9762\u5185\u5BB9\u533A\u5374\u662F\u7EAF\u58C1\u7EB8,\u4E24\u8005\u5BF9\u4E0D\u4E0A\u3002\n * \u73B0\u5728\u6539\u7528 --bg-base(bg-base \u4EE4\u724C):dsh-ui-appearance \u5F00\u58C1\u7EB8/\u89C6\u9891\u65F6\u628A\u5B83\n * \u5199\u6210 transparent \u2192 \u9876\u680F\u76F4\u63A5\u662F\u80CC\u666F\u56FE,\u4E0E\u5185\u5BB9\u533A\u540C\u4E00\u5C42\u80CC\u666F\u3002\n * \u72EC\u7ACB Electron(\u6CA1\u6709\u4EE4\u724C)\u65F6\u515C\u5E95 transparent,body \u7684\u5E95\u8272\u81EA\u7136\u900F\u4E0A\u6765\u3002\n *\n * \u26A0\uFE0F \u4E0D\u518D position:sticky \u2014\u2014 \u5B83\u73B0\u5728\u662F .app \u91CC\u4E0D\u6EDA\u52A8\u7684\u90A3\u4E00\u884C(\u89C1 .app/.app-scroll)\u3002\n * \u900F\u660E\u9876\u680F\u4E00\u65E6 sticky,\u6EDA\u52A8\u4E0A\u6765\u7684\u5361\u7247\u4F1A\u76F4\u63A5\u538B\u5728\u5BFC\u822A\u6587\u5B57\u5E95\u4E0B\u3002\n */\n.asone-panel .topbar {\n  display: flex;\n  align-items: center;\n  gap: 24px;\n  padding: 0 20px;\n  height: 48px;\n  flex: none;\n  background: var(--bg-base);\n  border-bottom: 1px solid var(--border);\n  position: relative;\n  z-index: 10;\n}\n\n.asone-panel .brand {\n  font-size: 15px;\n  font-weight: 600;\n  color: var(--text);\n  letter-spacing: 0.02em;\n}\n\n.asone-panel .tabs {\n  display: flex;\n  gap: 4px;\n}\n\n.asone-panel .tab {\n  appearance: none;\n  background: transparent;\n  border: none;\n  color: var(--text);\n  font: inherit;\n  padding: 6px 14px;\n  border-radius: 6px;\n  cursor: pointer;\n}\n\n.asone-panel .tab:hover {\n  color: var(--text);\n  background: var(--accent-softer);\n}\n\n.asone-panel .tab.on {\n  color: var(--text);\n  background: var(--accent-strong);\n}\n\n/* \u2500\u2500 \u9875\u9762\u9AA8\u67B6 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .content {\n  width: 100%;\n  /* \u26A0\uFE0F 2026-10-23:1180px \u2192 1400px\u3002sensenova \u9875\u8981 3 \u5F20 420px \u8D26\u53F7\u5361\u540C\u884C     (3\xD7420 + 2\xD716 = 1292px \u5185\u5BB9 + padding 40px = 1332px),1180px \u653E\u4E0D\u4E0B\n     \u53EA\u80FD\u4E24\u5361\u4E00\u884C1400px \u5BCC\u4F59,\u4E14\u7A97\u53E3\u9ED8\u8BA4\u5BBD\u968F\u4E4B\u63D0\u5230 1440px(index.ts)\u3002     \u26A0\uFE0F 2026-10-25(m14379):1400px \u21921680px\u3002920px \u7A97\u53E3\u4E0B\u8981\u8BA9\u8BBE\u7F6E\u9875\n     \u300C\u8C03\u5EA6\u89C4\u5219\u300D\u6BCF\u5F20\u5361\u91CC\u7684 5 \u4E2A box(provider/model/\u5230\u671F/\u661F\u671F/\u65F6\u95F4\u6BB5)\u6392\u6210\n     \u4E00\u884C:box \u6700\u5C0F\u5BBD 160+280+180+300+280 = 1200px + 4\xD720 gap = 1280px,\n     \u52A0 blocks-container padding 40px = 1320px,\u52A0\u4E24\u4FA7padding 40px \u22481400px\n     (2026-10-25 m14922 \u79FB\u9664\u8BBE\u7F6E\u9875\u5DE6\u4FA7 ui-nav,\u4E0D\u518D\u5360 168px+24px) \u2192 1680px \u5BCC\u4F59\u3002     1920 \u7A97\u53E3\u4E0B\u5C45\u4E2D,\u5DE6\u53F3\u5404\u7559 120px\u3002*/\n  max-width: 1680px;\n  margin: 0 auto;\n  padding: 16px 20px 40px;\n}\n\n.asone-panel .page {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n.asone-panel .page-note,\n.asone-panel .hint {\n  margin: 0;\n  color: var(--text-soft);\n  font-size: 12px;\n}\n\n.asone-panel .notice {\n  padding: 8px 12px;\n  border: 1px solid var(--ok);\n  border-radius: 6px;\n  color: var(--ok);\n  background: var(--surface-ok);\n}\n\n.asone-panel .empty {\n  padding: 28px 16px;\n  text-align: center;\n  color: var(--text-soft);\n}\n\n.asone-panel .loading {\n  animation: pulse 1.2s ease-in-out infinite;\n}\n\n@keyframes pulse {\n  50% {\n    opacity: 0.55;\n  }\n}\n\n/* \u2500\u2500 \u5361\u7247 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .card {\n  background: var(--surface);\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  padding: 14px 16px;\n}\n\n.asone-panel .card-head {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 12px;\n  margin-bottom: 10px;\n}\n\n.asone-panel .card-head h2 {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n.asone-panel .card-extra {\n  color: var(--text-soft);\n  font-size: 12px;\n}\n\n.asone-panel .card-badges {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n}\n\n/* \u2500\u2500 \u8868\u683C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .tbl {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 12.5px;\n}\n\n.asone-panel .tbl th,\n.asone-panel .tbl td {\n  padding: 6px 10px;\n  text-align: left;\n  border-bottom: 1px solid var(--border);\n  vertical-align: top;\n}\n\n.asone-panel .tbl th {\n  color: var(--text);\n  font-weight: 500;\n  white-space: nowrap;\n}\n\n.asone-panel .tbl tbody tr:hover {\n  background: var(--accent-softer);\n}\n\n.asone-panel .tbl .num {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n\n.asone-panel .tbl .bar-col {\n  min-width: 140px;\n}\n\n.asone-panel .row-dim td {\n  opacity: 0.55;\n}\n\n/* \u2500\u2500 \u6587\u672C\u5DE5\u5177 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .mono {\n  font-family: var(--mono);\n  font-size: 12px;\n}\n\n.asone-panel .dim-text {\n  color: var(--dim);\n}\n\n.asone-panel .err-cell {\n  max-width: 280px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--bad);\n}\n\n.asone-panel .code-block {\n  display: block;\n  font-family: var(--mono);\n  font-size: 11.5px;\n  white-space: pre-wrap;\n  word-break: break-all;\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 8px 10px;\n}\n\n/* \u2500\u2500 \u5FBD\u7AE0\u4E0E\u51ED\u636E\u70B9 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .badge {\n  display: inline-block;\n  padding: 1px 8px;\n  border-radius: 999px;\n  font-size: 11.5px;\n  border: 1px solid transparent;\n  white-space: nowrap;\n}\n\n.asone-panel .badge-ok {\n  color: var(--ok);\n  border-color: var(--ok-line);\n  background: var(--surface-ok);\n}\n\n.asone-panel .badge-bad {\n  color: var(--bad);\n  border-color: var(--bad-line);\n  background: var(--surface-bad);\n}\n\n.asone-panel .badge-warn {\n  color: var(--warn);\n  border-color: var(--warn-line);\n  background: var(--surface-warn);\n}\n\n.asone-panel .badge-dim {\n  color: var(--text);\n  border-color: var(--border);\n  background: transparent;\n}\n\n.asone-panel .cred-dot {\n  display: inline-block;\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  flex: none;\n}\n\n.asone-panel .cred-dot.ok {\n  background: var(--ok);\n}\n\n.asone-panel .cred-dot.bad {\n  background: var(--bad);\n}\n\n.asone-panel .cred-cell {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}\n\n/* \u2500\u2500 KPI \u4E0E\u72B6\u6001\u884C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .status-line {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  flex-wrap: wrap;\n  padding: 10px 14px;\n  background: var(--surface);\n  border: 1px solid var(--border);\n  border-radius: 8px;\n}\n\n.asone-panel .kpi-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));\n  gap: 12px;\n}\n\n.asone-panel .kpi {\n  background: var(--surface);\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  padding: 12px 14px;\n}\n\n.asone-panel .kpi-label {\n  color: var(--text);\n  font-size: 12px;\n}\n\n.asone-panel .kpi-value {\n  font-size: 22px;\n  font-weight: 600;\n  color: var(--text);\n  font-variant-numeric: tabular-nums;\n  margin: 2px 0;\n}\n\n.asone-panel .kpi-sub {\n  color: var(--text-soft);\n  font-size: 11.5px;\n}\n\n/* \u2500\u2500 \u6761\u5F62 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .bar {\n  width: 100%;\n  min-width: 90px;\n  height: 8px;\n  border-radius: 4px;\n  background: var(--track);\n  overflow: hidden;\n}\n\n.asone-panel .bar-fill {\n  height: 100%;\n  border-radius: 4px;\n}\n\n.asone-panel .bar-blue {\n  background: var(--accent);\n}\n\n.asone-panel .bar-green {\n  background: var(--ok);\n}\n\n.asone-panel .bar-orange {\n  background: var(--warn);\n}\n\n.asone-panel .bar-na {\n  color: var(--text-soft);\n}\n\n.asone-panel .bar-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 10px 18px;\n  margin-top: 12px;\n}\n\n.asone-panel .legend-item {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  color: var(--text-soft);\n  font-size: 12px;\n}\n\n.asone-panel .legend-item .bar {\n  width: 90px;\n}\n\n.asone-panel .legend-name {\n  min-width: 72px;\n}\n\n/* \u2500\u2500 \u952E\u503C\u7F51\u683C(\u6E20\u9053\u5361/\u8BBE\u7F6E) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .kv-grid {\n  display: grid;\n  grid-template-columns: 140px 1fr;\n  gap: 6px 14px;\n  margin-bottom: 10px;\n}\n\n.asone-panel .kv-grid .k {\n  color: var(--text);\n}\n\n.asone-panel .kv-grid .v {\n  color: var(--text);\n}\n\n/* \u2500\u2500 \u6309\u94AE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .btn {\n  appearance: none;\n  font: inherit;\n  color: var(--text);\n  background: var(--accent-soft);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 5px 14px;\n  cursor: pointer;\n}\n\n.asone-panel .btn:hover:not(:disabled) {\n  border-color: var(--accent);\n}\n\n.asone-panel .btn:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n.asone-panel .btn-sm {\n  padding: 2px 10px;\n  font-size: 12px;\n}\n\n/* \u2500\u2500 \u9875\u9762\u6807\u9898\u4E0E\u5360\u4F4D\u58F3 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .page-title {\n  margin: 0 0 6px;\n  font-size: 18px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n.asone-panel .page-page-shell {\n  padding: 28px 16px;\n  text-align: center;\n  color: var(--text-soft);\n  border: 1px dashed var(--border);\n  border-radius: 8px;\n}\n\n/* \u2500\u2500 \u5B50\u6807\u9898\u6761(\u6A21\u578B\u9891\u9053\u58F3,\u5BF9\u9F50 Nexus .subtabs) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .subtabs {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px;\n  min-height: 24px;\n  margin: 0 0 14px;\n  padding-bottom: 8px;\n  border-bottom: 1px solid var(--border);\n}\n\n.asone-panel .subtab {\n  appearance: none;\n  background: none;\n  border: none;\n  font: inherit;\n  color: var(--text);\n  padding: 0 10px;\n  line-height: 24px;\n  cursor: pointer;\n}\n\n.asone-panel .subtab:hover {\n  color: var(--text);\n}\n\n.asone-panel .subtab.on {\n  color: var(--text);\n  background: var(--accent-soft);\n  border-radius: 6px;\n}\n\n.asone-panel .subtabs-action {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin-left: auto;\n}\n\n.asone-panel .act-note {\n  color: var(--text-soft);\n  font-size: 11px;\n  max-width: 420px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.asone-panel .act-note.busy {\n  color: var(--accent);\n}\n\n.asone-panel .act-btn {\n  appearance: none;\n  font: inherit;\n  background: var(--dsw-alias-button-info-hover, #24425f);\n  border: 1px solid var(--border);\n  color: var(--on-accent);\n  height: 24px;\n  box-sizing: border-box;\n  border-radius: 5px;\n  padding: 0 12px;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.asone-panel .act-btn:hover:not(:disabled) {\n  background: var(--dsw-alias-button-info-hover, #24425f);\n}\n\n.asone-panel .act-btn:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n/* \u2500\u2500 \u6A21\u578B\u8868(ModelTable) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .models-block {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.asone-panel .models-toolbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  flex-wrap: wrap;\n}\n\n.asone-panel .models-toolbar-left,\n.asone-panel .models-toolbar-right {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.asone-panel .models-table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 12.5px;\n}\n\n.asone-panel .models-table th,\n.asone-panel .models-table td {\n  padding: 6px 8px;\n  text-align: left;\n  border-bottom: 1px solid var(--border);\n  vertical-align: middle;\n}\n\n.asone-panel .models-table th {\n  color: var(--text);\n  font-weight: 500;\n  white-space: nowrap;\n}\n\n.asone-panel .models-table .models-col-enable {\n  width: 44px;\n}\n\n.asone-panel .models-table td.rate-cell {\n  white-space: nowrap;\n}\n\n.asone-panel .models-table tr.on td {\n  background: var(--accent-softer);\n}\n\n.asone-panel .models-table tr.off td {\n  opacity: 0.55;\n}\n\n.asone-panel .models-table tr.nocall td {\n  opacity: 0.75;\n}\n\n.asone-panel .models-table .input {\n  width: 100%;\n  min-width: 60px;\n  height: 26px;\n  padding: 0 8px;\n}\n\n.asone-panel .models-table .input.num {\n  width: 90px;\n}\n\n.asone-panel .models-table input:disabled {\n  opacity: 0.45;\n}\n\n.asone-panel .vision-cell {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.asone-panel .dot {\n  color: var(--ok);\n  font-size: 9px;\n  line-height: 1;\n}\n\n.asone-panel .tag-warn {\n  margin-left: 6px;\n  padding: 0 5px;\n  border: 1px solid var(--warn);\n  border-radius: 3px;\n  color: var(--warn);\n  font-size: 11px;\n  white-space: nowrap;\n}\n\n/* \u2500\u2500 \u903B\u8F91\u6A21\u578B\u7F16\u8F91\u5668(LogicalModelEditor) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .editor {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n.asone-panel .fieldRow {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.asone-panel .fieldLabel {\n  color: var(--text);\n  font-size: 12px;\n}\n\n.asone-panel .fieldValue {\n  color: var(--text);\n  font-size: 13px;\n}\n\n.asone-panel .fieldNote {\n  color: var(--text-soft);\n  font-size: 12px;\n}\n\n.asone-panel .fieldWarn {\n  color: var(--warn);\n  font-size: 12px;\n}\n\n.asone-panel .fieldWarn b {\n  color: var(--text);\n  font-weight: 500;\n}\n\n.asone-panel .input {\n  box-sizing: border-box;\n  height: 32px;\n  padding: 0 10px;\n  font: inherit;\n  font-size: 13px;\n  color: var(--text);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n}\n\n.asone-panel .input:focus {\n  outline: none;\n  border-color: var(--accent);\n}\n\n.asone-panel .input.inputBad {\n  border-color: var(--bad);\n}\n\n.asone-panel .selectInput {\n  cursor: pointer;\n}\n\n.asone-panel .nodeList {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.asone-panel .nodeRow {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n\n.asone-panel .groupIdx {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\n  color: var(--on-accent);\n  font-size: 11px;\n  flex-shrink: 0;\n}\n\n.asone-panel .nodeProvider {\n  width: 150px;\n  flex: 0 0 150px;\n}\n\n.asone-panel .nodeSelect {\n  flex: 1 1 0;\n  min-width: 0;\n}\n\n.asone-panel .addModelButton {\n  appearance: none;\n  font: inherit;\n  background: none;\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  height: 28px;\n  padding: 0 10px;\n  color: var(--text);\n  font-size: 12px;\n  cursor: pointer;\n  align-self: flex-start;\n}\n\n.asone-panel .addModelButton:hover:not(:disabled) {\n  border-color: var(--accent);\n}\n\n.asone-panel .addModelButton:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n.asone-panel .iconButton {\n  appearance: none;\n  background: none;\n  border: none;\n  font: inherit;\n  color: var(--dim);\n  padding: 2px 6px;\n  border-radius: 4px;\n  cursor: pointer;\n  flex-shrink: 0;\n}\n\n.asone-panel .iconButton:hover:not(:disabled) {\n  color: var(--text);\n  background: var(--accent-soft);\n}\n\n.asone-panel .iconButtonDanger:hover:not(:disabled) {\n  color: var(--bad);\n}\n\n.asone-panel .iconButton:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n\n.asone-panel .editorActions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.asone-panel .primaryButton,\n.asone-panel .secondaryButton {\n  appearance: none;\n  font: inherit;\n  height: 36px;\n  padding: 0 16px;\n  border-radius: 6px;\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.asone-panel .primaryButton {\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\n  border: 1px solid var(--dsw-alias-button-info-fill, #2f4d6b);\n  color: var(--on-accent);\n}\n\n.asone-panel .primaryButton:hover:not(:disabled) {\n  background: var(--dsw-alias-button-info-hover, #24425f);\n}\n\n.asone-panel .secondaryButton {\n  background: none;\n  border: 1px solid var(--border);\n  color: var(--text);\n}\n\n.asone-panel .secondaryButton:hover:not(:disabled) {\n  border-color: var(--accent);\n}\n\n.asone-panel .primaryButton:disabled,\n.asone-panel .secondaryButton:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n/* \u2500\u2500 \u4F9B\u5E94\u5546\u8D26\u6237\u8868(ProviderAccounts) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .provider-accounts {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.asone-panel .block-title {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n.asone-panel .provider-accounts-actions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n/* \u2500\u2500 \u5BA2\u6237\u7AEF\u8DEF\u5F84(ClientPaths) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .client-paths {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n\n.asone-panel .cp-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.asone-panel .cp-row b {\n  color: var(--text);\n  font-size: 12px;\n  flex-shrink: 0;\n}\n\n.asone-panel .cp-input {\n  flex: 1;\n  min-width: 200px;\n}\n\n.asone-panel .cp-state {\n  color: var(--text-soft);\n  font-size: 12px;\n  white-space: nowrap;\n  flex-shrink: 0;\n}\n\n/* \u2500\u2500 \u6587\u672C\u7740\u8272\u5DE5\u5177\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .ok {\n  color: var(--ok);\n}\n\n.asone-panel .bad {\n  color: var(--bad);\n}\n\n.asone-panel .na {\n  color: var(--text-soft);\n}\n\n/* \u2500\u2500 \u9519\u8BEF\u6761(\u7528\u91CF\u9875\u7528,\u5BF9\u9F50 Nexus \u5168\u5C40 .err)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .err {\n  color: var(--bad);\n  font-size: 12px;\n  padding: 8px;\n  border: 1px solid color-mix(in srgb, var(--bad) 45%, transparent);\n  background: var(--surface-bad);\n  border-radius: 4px;\n  margin: 10px 0;\n}\n\n/* ===========================================================================\n   \u603B\u89C8\u9875(OverviewPage,1:1 \u79FB\u690D Nexus Overview.vue \u7684 scoped \u6837\u5F0F,\n   \u7C7B\u540D\u7EDF\u4E00 ov- \u524D\u7F00\u9632\u78B0\u649E;\u914D\u8272\u4E0E Nexus \u539F\u7248\u4E00\u81F4)\n   =========================================================================== */\n\n.asone-panel .ov-err {\n  color: var(--bad);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u2500\u2500 \u6BCF\u65E5\u7B7E\u5230(\u603B\u89C8)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ov-checkin {\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  padding: 10px 12px;\n  background: var(--surface);\n  margin-top: 12px;\n}\n.asone-panel .ov-checkinHead {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-bottom: 6px;\n}\n.asone-panel .ov-checkinHead h2 {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 600;\n}\n.asone-panel .ov-checkinHead .count {\n  margin-left: 6px;\n  color: var(--muted, #888);\n  font-weight: 400;\n}\n.asone-panel .ov-checkinRows {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.asone-panel .ov-checkinRow {\n  display: grid;\n  grid-template-columns: 110px 90px 1fr;\n  align-items: baseline;\n  gap: 8px;\n  font-size: 12px;\n}\n.asone-panel .ov-checkinName {\n  font-weight: 500;\n}\n.asone-panel .ov-checkinState {\n  font-weight: 600;\n}\n.asone-panel .ov-checkinState.is-ok {\n  color: #1a7f37;\n}\n.asone-panel .ov-checkinState.is-warn {\n  color: #b35900;\n}\n.asone-panel .ov-checkinState.is-err {\n  color: #c62828;\n}\n.asone-panel .ov-checkinState.is-na {\n  color: var(--muted, #888);\n  font-weight: 400;\n}\n.asone-panel .ov-checkinMeta {\n  color: var(--muted, #888);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.asone-panel .ov-checkinMsg {\n  font-size: 12px;\n  color: #1a7f37;\n  margin-bottom: 4px;\n  word-break: break-all;\n}\n.asone-panel .ov-checkinErr {\n  font-size: 12px;\n  color: #c62828;\n  margin-bottom: 4px;\n  word-break: break-all;\n}\n\n/* \u2500\u2500 \u8FD0\u884C\u4E2D:\u5728\u9014\u660E\u7EC6\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ov-inflight {\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  padding: 10px 12px;\n  background: var(--surface);\n  margin-top: 12px;\n}\n.asone-panel .ov-inflightHead {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  margin-bottom: 6px;\n}\n.asone-panel .ov-inflightHead h2 {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 600;\n  color: var(--text);\n}\n.asone-panel .ov-inflightHead .count {\n  font-size: 12px;\n  color: var(--text);\n}\n.asone-panel .ov-inflightGrid {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n.asone-panel .ov-inflightCard {\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 6px 8px;\n  background: var(--bg);\n  min-width: 180px;\n}\n.asone-panel .ov-inflightCardHead {\n  display: flex;\n  justify-content: space-between;\n  align-items: baseline;\n  font-size: 12px;\n}\n.asone-panel .ov-inflightLm {\n  color: var(--text);\n  font-weight: 600;\n  word-break: break-all;\n}\n.asone-panel .ov-inflightMap {\n  margin: 4px 0 0;\n  padding: 0;\n  list-style: none;\n  font-size: 11px;\n  color: var(--text-soft);\n}\n.asone-panel .ov-inflightMap li {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 10px;\n}\n.asone-panel .ov-inflightRmN {\n  color: var(--text);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n.asone-panel .ov-inflightLeases {\n  margin-top: 4px;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n.asone-panel .ov-lease {\n  font-size: 10px;\n  color: var(--ok);\n  background: var(--surface);\n  border-radius: 4px;\n  padding: 1px 5px;\n}\n/* \u76F4\u8FDE\u5361:\u903B\u8F91\u6A21\u578B\u4E3A\u7A7A = \u5BA2\u6237\u7AEF\u76F4\u8FDE\u771F\u5B9E\u6A21\u578B(\u865A\u7EBF\u8FB9\u6846 + \u7565\u4E0D\u540C\u5E95\u8272)\u3002*/\n.asone-panel .ov-inflightDirect {\n  border-style: dashed;\n  border-color: var(--ok-line);\n  background: var(--surface-ok);\n}\n.asone-panel .ov-inflightDirect .ov-inflightLm {\n  color: var(--ok);\n}\n.asone-panel .ov-inflightDirect .ov-lease {\n  color: var(--ok);\n  background: var(--surface-ok);\n}\n\n/* \u2500\u2500 \u5B9E\u65F6\u65E5\u5FD7 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ov-recentBlock {\n  margin-top: 12px;\n  border-top: 1px solid var(--border);\n  padding-top: 8px;\n}\n.asone-panel .ov-recentBlock .ov-inflightHead {\n  margin-bottom: 6px;\n}\n.asone-panel .ov-recentLimit {\n  display: inline-flex;\n  align-items: baseline;\n  gap: 4px;\n  font-size: 12px;\n  color: var(--text);\n}\n.asone-panel .ov-recentLimit input {\n  width: 4.5em;\n  font-size: 12px;\n  color: var(--text);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 4px;\n  padding: 1px 4px;\n}\n.asone-panel .ov-recentLimit input:disabled {\n  opacity: 0.5;\n}\n.asone-panel .ov-recentLimitErr {\n  font-size: 11px;\n  color: var(--bad);\n}\n\n/* \u2500\u2500 \u6309\u5BF9\u8BDD\u7684\u5361\u7247\u5217\u8868 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ov-recentConvList {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.asone-panel .ov-recentConv {\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  background: var(--bg);\n  overflow: hidden;\n}\n/* \u5361\u5934 / \u660E\u7EC6\u884C\u5171\u7528\u540C\u4E00\u5957\u56FA\u5B9A\u5B57\u7B26\u5BBD\u5217(grid \u5217\u53F3\u8FB9\u7F18\u9010\u5217\u5BF9\u9F50)\u3002*/\n.asone-panel .ov-recentConvHead,\n.asone-panel .ov-recentConvRow {\n  display: grid;\n  grid-template-columns:\n    minmax(6ch, 10ch) /* \u5E8F\u53F7:#\u5BF9\u8BDD#\u8BF7\u6C42(\u5361\u5934\u662F \u25B8 #\u5BF9\u8BDD) */\n    minmax(6ch, 18ch) /* \u903B\u8F91\u6A21\u578B */\n    minmax(8ch, 24ch) /* \u771F\u5B9E\u6A21\u578B */\n    minmax(22ch, 1fr) /* \u7ED3\u679C\u5FBD\u7AE0 + \u9519\u8BEF\u6587\u6848 \u2014\u2014\u552F\u4E00\u5403\u5269\u4F59\u5BBD\u5EA6\u7684\u4E00\u5217*/\n    12ch /* \u5EF6\u8FDF */\n    15ch /* TTFT(\u5361\u5934\u5E26\u300CTTFT \u300D\u524D\u7F00,\u6545\u6BD4\u5EF6\u8FDF\u5217\u5BBD 3ch) */\n    11ch /* TPS:118.4 tok/s */\n    20ch /* token \u4E09\u683C:993K / 22.1K / 860K */\n    9ch; /* \u7ED3\u675F:165.7s \u524D */\n  column-gap: 8px;\n  align-items: baseline;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n}\n.asone-panel .ov-recentConvHead {\n  padding: 4px 8px;\n  cursor: pointer;\n  user-select: none;\n}\n.asone-panel .ov-recentConvHead:hover,\n.asone-panel .ov-recentConv.open .ov-recentConvHead {\n  background: var(--surface);\n}\n.asone-panel .ov-recentConvHeadId {\n  display: flex;\n  align-items: baseline;\n  gap: 4px;\n  min-width: 0;\n}\n.asone-panel .ov-recentConvCaret {\n  width: 10px;\n  flex: 0 0 10px;\n  color: var(--ok);\n}\n.asone-panel .ov-recentConvTitle {\n  flex: 0 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--text);\n  font-weight: 600;\n}\n.asone-panel .ov-recentConvTitle.direct {\n  color: var(--ok);\n}\n.asone-panel .ov-recentConvRow {\n  padding: 2px 8px;\n  color: var(--text-soft);\n  background: var(--surface-deep);\n}\n.asone-panel .ov-recentConvRow:hover {\n  background: var(--bg);\n}\n.asone-panel .ov-recentConvRow.fail {\n  color: var(--bad);\n  box-shadow: inset 2px 0 0 var(--bad);\n}\n.asone-panel .ov-recentConvSeq {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--text-soft);\n}\n.asone-panel .ov-recentConvLm {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.asone-panel .ov-recentConvLm.direct {\n  color: var(--ok);\n}\n.asone-panel .ov-recentConvRm {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.asone-panel .ov-recentConvRes {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n  overflow: hidden;\n  white-space: nowrap;\n}\n.asone-panel .ov-recentConvN {\n  color: var(--text);\n  white-space: nowrap;\n}\n.asone-panel .ov-recentConvRes .ov-errText {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.asone-panel .ov-mono {\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 10.5px;\n  word-break: break-all;\n}\n.asone-panel .ov-dim {\n  color: var(--text-soft);\n}\n.asone-panel .ov-num {\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n  white-space: nowrap;\n}\n.asone-panel .ov-badge {\n  border-radius: 4px;\n  padding: 0 4px;\n  font-size: 10px;\n}\n.asone-panel .ov-badge.ok {\n  color: var(--ok);\n  background: var(--surface);\n}\n.asone-panel .ov-badge.bad {\n  color: var(--bad);\n  background: var(--surface-bad);\n}\n.asone-panel .ov-errText {\n  color: var(--text-soft);\n  font-size: 10px;\n  margin-left: 4px;\n}\n\n/* ===========================================================================\n   \u7528\u91CF\u7EDF\u8BA1\u9875(UsageStatsPage,1:1 \u79FB\u690D Nexus styles.css \u7684 .usage-* \u7C7B)\n   =========================================================================== */\n.asone-panel .usage-ctl {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex-wrap: wrap;\n  margin: 16px 0 6px;\n}\n/* \u5206\u6BB5\u63A7\u4EF6(pill \u7EC4):\u4E00\u4E2A\u5706\u89D2\u5BB9\u5668\u91CC\u6392\u6309\u94AE,\u9009\u4E2D\u9879\u586B\u5E95\u3002*/\n.asone-panel .usage-seg {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n  padding: 3px;\n  border: 1px solid var(--border);\n  border-radius: 9px;\n  background: var(--surface);\n}\n.asone-panel .usage-seg button {\n  appearance: none;\n  border: 0;\n  background: transparent;\n  color: var(--text);\n  font: inherit;\n  font-size: 12px;\n  line-height: 1;\n  padding: 7px 12px;\n  border-radius: 7px;\n  cursor: pointer;\n  white-space: nowrap;\n  transition: background 0.12s ease, color 0.12s ease;\n}\n.asone-panel .usage-seg button:hover {\n  background: var(--surface-deep);\n  color: var(--text);\n}\n.asone-panel .usage-seg button.on,\n.asone-panel .usage-seg button.on:hover {\n  background: var(--surface-hover);\n  color: var(--text);\n}\n.asone-panel .usage-refresh {\n  appearance: none;\n  border: 1px solid var(--border);\n  background: var(--surface-deep);\n  color: var(--text);\n  font: inherit;\n  font-size: 12px;\n  line-height: 1;\n  padding: 10px 14px;\n  border-radius: 9px;\n  cursor: pointer;\n}\n.asone-panel .usage-refresh:hover:not(:disabled) {\n  background: var(--surface-hover);\n}\n.asone-panel .usage-refresh:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n.asone-panel .usage-ctl-info {\n  margin: 0 0 0 4px;\n}\n\n/* 5 \u5F20 KPI \u5361\u3002*/\n.asone-panel .usage-cards {\n  display: grid;\n  grid-template-columns: repeat(5, minmax(0, 1fr));\n  gap: 10px;\n  margin-top: 14px;\n}\n.asone-panel .usage-card {\n  background: var(--surface);\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  padding: 12px 14px;\n  min-width: 0;\n}\n.asone-panel .usage-card-k {\n  color: var(--text-soft);\n  font-size: 12px;\n}\n.asone-panel .usage-card-v {\n  color: var(--text);\n  font-size: 22px;\n  font-weight: 600;\n  line-height: 1.35;\n  font-variant-numeric: tabular-nums;\n  overflow-wrap: anywhere;\n}\n.asone-panel .usage-card-v-sm {\n  font-size: 15px;\n}\n.asone-panel .usage-card-s {\n  color: var(--text-soft);\n  font-size: 11px;\n  overflow-wrap: anywhere;\n}\n\n.asone-panel .usage-sec {\n  margin-top: 24px;\n}\n.asone-panel .usage-sec h2 {\n  margin: 0 0 8px;\n  font-size: 14px;\n  color: var(--text);\n  font-weight: 600;\n}\n\n.asone-panel .usage-chart-wrap {\n  position: relative;\n  width: 100%;\n}\n.asone-panel .usage-chart {\n  display: block;\n  overflow: visible;\n}\n.asone-panel .axis-text {\n  fill: var(--text-soft);\n  font-size: 10px;\n}\n.asone-panel .axis-text-r {\n  fill: var(--text-soft);\n}\n.asone-panel .usage-bar {\n  stroke: none;\n}\n/* \u6574\u5217\u900F\u660E\u547D\u4E2D\u533A:\u67F1\u5B50\u518D\u7A84\u4E5F\u80FD hover \u5230\u3002*/\n.asone-panel .bar-hit {\n  fill: transparent;\n  pointer-events: all;\n}\n.asone-panel .usage-line {\n  stroke-linejoin: round;\n  stroke-linecap: round;\n}\n\n.asone-panel .usage-tip {\n  position: absolute;\n  top: 6px;\n  transform: translateX(-50%);\n  min-width: 170px;\n  max-width: calc(100% - 8px);\n  padding: 8px 10px;\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  background: var(--surface);\n  color: var(--text-soft);\n  font-size: 11px;\n  line-height: 1.6;\n  pointer-events: none;\n  z-index: 30;\n  box-shadow: 0 6px 18px var(--shadow);\n}\n.asone-panel .usage-tip-head {\n  color: var(--text);\n  margin-bottom: 4px;\n}\n.asone-panel .usage-tip-line {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n.asone-panel .usage-tip-line b {\n  color: var(--text);\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .usage-tip-nm {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  min-width: 0;\n}\n/* \u6A21\u578B\u540D:\u59CB\u7EC8\u5355\u884C,\u592A\u957F\u5C31\u7701\u7565\u53F7\u3002*/\n.asone-panel .usage-tip-nm-t {\n  flex: 1 1 auto;\n  min-width: 0;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.asone-panel .usage-tip-sep {\n  height: 1px;\n  background: var(--surface-hover);\n  margin: 6px 0;\n}\n.asone-panel .usage-tip-more {\n  color: var(--text-soft);\n  font-size: 10px;\n}\n\n.asone-panel .usage-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px 16px;\n  margin-top: 10px;\n  color: var(--text-soft);\n  font-size: 11px;\n}\n.asone-panel .usage-legend-i {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  white-space: nowrap;\n}\n.asone-panel .usage-dot {\n  display: inline-block;\n  width: 10px;\n  height: 10px;\n  border-radius: 2px;\n  flex: 0 0 auto;\n}\n.asone-panel .usage-dot.sm {\n  width: 8px;\n  height: 8px;\n}\n.asone-panel .usage-line-sw {\n  display: inline-block;\n  width: 14px;\n  height: 3px;\n  border-radius: 2px;\n}\n\n.asone-panel .usage-split {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  flex-wrap: wrap;\n}\n.asone-panel .usage-donut {\n  flex: 0 0 auto;\n}\n.asone-panel .usage-donut-v {\n  fill: var(--text);\n  font-size: 20px;\n  font-weight: 600;\n}\n.asone-panel .usage-donut-k {\n  fill: var(--text-soft);\n  font-size: 11px;\n}\n\n.asone-panel .usage-rank {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  flex: 1 1 260px;\n  min-width: 260px;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.asone-panel .usage-row,\n.asone-panel .usage-subrow {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 6px 8px;\n  border-radius: 8px;\n  font-size: 12px;\n  color: var(--text);\n}\n.asone-panel .usage-row {\n  background: var(--surface);\n}\n.asone-panel .usage-row.clickable {\n  cursor: pointer;\n}\n.asone-panel .usage-row.clickable:hover,\n.asone-panel .usage-subrow.clickable:hover {\n  background: var(--surface-deep);\n}\n.asone-panel .usage-rank-i {\n  min-width: 14px;\n  text-align: right;\n  color: var(--text);\n  font-size: 11px;\n}\n/* \u53EF\u5C55\u5F00\u884C\u7684\u6298\u53E0\u6307\u793A:\u6CA1\u6709\u5B50\u9879\u65F6\u7559\u7A7A\u5360\u4F4D,\u4FDD\u8BC1\u5E26\u8272\u5757\u7684\u884C\u5DE6\u8FB9\u7F18\u5BF9\u9F50\u3002*/\n.asone-panel .usage-caret {\n  width: 8px;\n  flex: 0 0 8px;\n  color: var(--text-soft);\n  font-size: 12px;\n  line-height: 1;\n  transition: transform 0.15s ease;\n}\n.asone-panel .usage-caret.open {\n  transform: rotate(90deg);\n}\n.asone-panel .usage-name {\n  flex: 1 1 auto;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  line-height: 1.35;\n}\n.asone-panel .usage-name-m {\n  color: var(--text);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.asone-panel .usage-name-s {\n  color: var(--text-soft);\n  font-size: 11px;\n}\n.asone-panel .usage-val {\n  text-align: right;\n  color: var(--text);\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .usage-pct {\n  width: 52px;\n  text-align: right;\n  color: var(--text);\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .usage-fold {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  margin: 2px 0 4px 26px;\n  padding-left: 10px;\n  border-left: 2px solid var(--border);\n}\n.asone-panel .usage-subrow {\n  font-size: 11.5px;\n  color: var(--text-soft);\n}\n.asone-panel .usage-foot {\n  margin-top: 20px;\n}\n\n@media (max-width: 1100px) {\n  .asone-panel .usage-cards {\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n  }\n}\n\n/* ===========================================================================\n   \u8BBE\u7F6E\u9875(SettingsPage,1:1 \u79FB\u690D Nexus Settings.vue \u7684 .ui-* \u4F53\u7CFB)\n   =========================================================================== */\n\n/* Nexus \u7684.err / .savedNotice \u662F\u7EAF\u6587\u5B57;As One \u5DF2\u6709 .err/.notice \u76D2\u5F0F\u53D8\u4F53,\n   \u6545\u8FD9\u91CC\u7528 .ui-err/.ui-notice \u627F\u62C5\u8BBE\u7F6E\u9875\u4E0E\u4F9B\u5E94\u5546\u9875\u7684\u7EAF\u6587\u5B57\u5F62\u6001\u3002*/\n.asone-panel .ui-err {\n  color: var(--bad);\n  font-size: 12px;\n  line-height: 18px;\n  margin: 0;\n}\n\n.asone-panel .ui-notice {\n  color: var(--ok);\n  font-size: 12px;\n  line-height: 18px;\n  margin: 0;\n}\n\n/* \u8BBE\u7F6E\u9875\u5916\u58F3(\u4EC5 SettingsPage \u4F7F\u7528)\u3002   \u26A0\uFE0F 2026-10-24 \u7528\u6237 m10716:\u9760\u5DE6\u3001\u4E0D\u9650\u5236\u5BBD\u5EA6\u3002   \u539F\u6765 max-width: 980px + margin: 0 auto \u6709\u4E24\u4E2A\u6BDB\u75C5\u2460\u6574\u9875\u5C45\u4E2D\u53F3\u4FA7\u7559\u4E00\u5927\u7247\n   \u7A7A\u767D;980px \u88C5\u4E0D\u4E0B\u300C\u8C03\u5EA6\u89C4\u5219\u300D\u90A3\u4E94\u5F20\u5361(\u6BCF\u5F20 5 \u4E2A box),\u53EA\u80FD\u6324\u6210\u4E24\u5217\u3002   \u5BBD\u5EA6\u4EA4\u7ED9\u5916\u5C42 .content(max-width 1400px)\u63A7\u5236,\u8FD9\u91CC\u4E0D\u518D\u81EA\u8BBE\u4E0A\u9650\u3002*/\n.asone-panel .ui-shell {\n  width: 100%;\n  max-width: none;\n  margin: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.asone-panel .ui-page-desc {\n  margin: 0 0 6px;\n  color: var(--text-soft);\n  font-size: 13px;\n}\n\n.asone-panel .ui-layout {\n  display: flex;\n  align-items: flex-start;\n  gap: 24px;\n}\n\n.asone-panel .ui-content {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n.asone-panel .ui-card {\n  background: var(--surface);\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  padding: 14px 16px;\n  scroll-margin-top: 60px;\n}\n\n.asone-panel .ui-card-head {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 12px;\n  margin-bottom: 10px;\n}\n\n.asone-panel .ui-card-title {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n.asone-panel .ui-card-sub {\n  margin: 2px 0 0;\n  color: var(--text-soft);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .ui-fields {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n  gap: 6px 18px;\n}\n\n.asone-panel .ui-field {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0;\n}\n\n.asone-panel .ui-field.wide {\n  grid-column: 1 / -1;\n}\n\n.asone-panel .ui-field-head {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n}\n\n.asone-panel .ui-field-label {\n  color: var(--text);\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 18px;\n}\n\n.asone-panel .ui-field-unit {\n  color: var(--text);\n  font-size: 11px;\n}\n\n.asone-panel .ui-field-hint {\n  margin: 0;\n  color: var(--text-soft);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .ui-field-err {\n  margin: 0;\n  color: var(--bad);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .ui-check {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 13px;\n  cursor: pointer;\n  color: var(--text);\n}\n\n.asone-panel .ui-jsonbox {\n  box-sizing: border-box;\n  width: 100%;\n  padding: 8px 10px;\n  font-family: var(--mono);\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--text);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  resize: vertical;\n}\n\n.asone-panel .ui-jsonbox:focus {\n  outline: none;\n  border-color: var(--accent);\n}\n\n.asone-panel .ui-json-toggle {\n  appearance: none;\n  background: none;\n  border: none;\n  font: inherit;\n  color: var(--accent);\n  padding: 4px 0;\n  cursor: pointer;\n  font-size: 12.5px;\n}\n\n.asone-panel .ui-json-err {\n  margin: 0;\n  color: var(--bad);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .ui-json-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 8px;\n}\n\n.asone-panel .ui-key-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex-wrap: wrap;\n}\n\n.asone-panel .ui-key {\n  font-family: var(--mono);\n  font-size: 12px;\n  color: var(--text);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 4px 10px;\n  word-break: break-all;\n}\n\n.asone-panel .ui-badge {\n  display: inline-block;\n  padding: 1px 8px;\n  border-radius: 999px;\n  font-size: 11.5px;\n  color: var(--text);\n  border: 1px solid var(--border);\n  background: transparent;\n  white-space: nowrap;\n}\n\n/* \u2500\u2500 \u8C03\u5EA6\u89C4\u5219\u7F16\u8F91\u5668(2026-10-24 \u6309\u8BBE\u8BA1\u7A3F\u91CD\u505A:5 \u5757\u5F39\u6027\u5E03\u5C40 + \u4E25\u683C\u65AD\u884C\u661F\u671F) \u2500\u2500 */\n/* \u5168\u90E8 scoped \u5230.asone-scheduler,\u907F\u514D\u6C61\u67D3\u5168\u5C40\u3002   2026-10-24 \u7528\u6237\u8981\u6C42\u300C\u914D\u8272\u534F\u8C03\u300D\u6539\u7528\u9875\u9762\u5168\u5C40\u8C03\u8272\u6761   (--bg-card var(--surface) / --border var(--border) / --text-soft var(--text-soft) / --dim var(--dim)\n   / --accent var(--accent) / --bad var(--bad)),\u4E0E\u5176\u5B83\u5361\u7247\u540C\u8272\u7CFB\u3002*/\n.asone-panel .asone-scheduler {\n  --asec-bg-card: var(--bg-card);\n  --asec-bg-box: var(--dsw-alias-bg-layer-2, #182130);\n  --asec-bg-input: var(--dsw-alias-bg-layer-3, #101722);\n  --asec-border: var(--border);\n  --asec-text: var(--text-soft);\n  --asec-muted: var(--dim);\n  --asec-primary: var(--accent);\n  --asec-primary-bg: var(--accent-soft);\n  --asec-danger: var(--bad);\n}\n\n/* \u5927\u5361\u7247 */\n.asone-panel .asone-scheduler .rule-card {\n  background: var(--asec-bg-card);\n  border: 1px solid var(--asec-border);\n  border-radius: 8px;\n  margin-bottom: 24px;\n  overflow: hidden;\n}\n/* \u540C\u6863\u591A\u6761\u89C4\u5219:\u76F8\u90BB\u4E24\u5757\u4E4B\u95F4\u52A0\u5206\u9694\u7EBF */\n.asone-panel .asone-scheduler .blocks-container + .blocks-container {\n  border-top: 1px solid var(--asec-border);\n}\n\n/* \u5361\u7247\u5934\u90E8 */\n.asone-panel .asone-scheduler .card-header {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  padding: 16px 20px;\n  border-bottom: 1px solid var(--asec-border);\n}\n/* \u6863\u4F4D\u5FBD\u7AE0(\u4F5C\u7528\u57DF\u5185\u8986\u76D6\u5168\u5C40 .badge) */\n.asone-panel .asone-scheduler .badge {\n  display: inline-block;\n  background: var(--asec-primary);\n  color: var(--on-accent);\n  font-weight: bold;\n  font-size: 14px;\n  padding: 4px 12px;\n  border-radius: 6px;\n  border: 1px solid transparent;\n  white-space: nowrap;\n}\n/* \u6863\u4F4D\u540D(\u65B0\u589E,\u8BBE\u8BA1\u7A3F\u53EA\u6709\u5FBD\u7AE0 + \u6309\u94AE) */\n.asone-panel .asone-scheduler .card-subtitle {\n  color: var(--asec-muted);\n  font-size: 13px;\n}\n.asone-panel .asone-scheduler .btn-add {\n  background: transparent;\n  color: var(--asec-text);\n  border: 1px solid var(--asec-border);\n  padding: 4px 12px;\n  border-radius: 4px;\n  cursor: pointer;\n  transition: all 0.2s;\n}\n.asone-panel .asone-scheduler .btn-add:hover {\n  background: var(--surface-hover);\n}\n\n/* \u7A7A\u7EC4 / \u5361\u7247\u5185\u63D0\u793A(\u65B0\u589E) */\n.asone-panel .asone-scheduler .card-empty {\n  margin: 0;\n  padding: 20px;\n  color: var(--asec-muted);\n  font-size: 13px;\n  border-bottom: 1px solid var(--asec-border);\n}\n.asone-panel .asone-scheduler .card-hint {\n  margin: 0;\n  padding: 10px 20px;\n  color: var(--asec-muted);\n  font-size: 12px;\n  border-bottom: 1px solid var(--asec-border);\n}\n\n/* \u6838\u5FC3\u5185\u5BB9\u533A:\u5F39\u6027\u5E03\u5C40\u5BB9\u5668 */\n.asone-panel .asone-scheduler .blocks-container {\n  padding: 20px;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 20px;\n}\n\n/* 5 \u4E2A\u72EC\u7ACB\u6A21\u5757\u7684\u516C\u5171\u6837\u5F0F */\n.asone-panel .asone-scheduler .box {\n  background: var(--asec-bg-box);\n  border: 1px solid var(--asec-border);\n  border-radius: 8px;\n  padding: 16px;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.asone-panel .asone-scheduler .box-label {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  color: var(--asec-muted);\n  font-size: 13px;\n  height: 20px;\n}\n.asone-panel .asone-scheduler .box-label .req {\n  color: var(--asec-danger);\n  margin-left: 4px;\n}\n\n/* \u72EC\u7ACB\u7684\u5BBD\u5EA6\u63A7\u5236(\u4E0E\u8BBE\u8BA1\u7A3F\u4E00\u81F4) */\n.asone-panel .asone-scheduler .box-provider { flex: 1 1 160px; min-width: 160px; }\n.asone-panel .asone-scheduler .box-model    { flex: 2 1 280px; min-width: 280px; }\n.asone-panel .asone-scheduler .box-expiry   { flex: 1 1 180px; min-width: 180px; }\n.asone-panel .asone-scheduler .box-weekdays { flex: 3 1 300px; min-width: 300px; } /* \u5BBD\u5EA6\u4E0D\u8DB3\u65F6\u89E6\u53D1\u516D\u65E5\u6574\u4F53\u6362\u884C*/\n.asone-panel .asone-scheduler .box-times    { flex: 2 1 300px; min-width: 280px; }\n.asone-panel .asone-scheduler .box-cooldown { flex: 1 1 180px; min-width: 160px; }\n\n/* \u5220\u9664\u89C4\u5219\u6309\u94AE */\n.asone-panel .asone-scheduler .btn-del {\n  background: none;\n  border: none;\n  color: var(--asec-danger);\n  cursor: pointer;\n  font-size: 13px;\n}\n.asone-panel .asone-scheduler .btn-del:hover {\n  opacity: 0.8;\n}\n\n/* \u8F93\u5165\u6846\u901A\u7528\u6837\u5F0F(select / date / time / number \u5171\u7528) */\n.asone-panel .asone-scheduler .input-control {\n  background: var(--asec-bg-input);\n  border: 1px solid var(--asec-border);\n  color: var(--asec-text);\n  padding: 10px 12px;\n  border-radius: 6px;\n  font-size: 13px;\n  font-family: inherit;\n  width: 100%;\n  outline: none;\n  transition: border-color 0.2s;\n}\n.asone-panel .asone-scheduler .input-control:focus {\n  border-color: var(--asec-primary);\n}\n.asone-panel .asone-scheduler select.input-control {\n  cursor: pointer;\n}\n\n/* \u65E5\u5386\u548C\u65F6\u949F\u56FE\u6807\u53CD\u8272\u6D45\u8272(\u8BBE\u8BA1\u7A3F\u5173\u952E\u70B9) */\n.asone-panel .asone-scheduler input[type="date"]::-webkit-calendar-picker-indicator,\n.asone-panel .asone-scheduler input[type="time"]::-webkit-calendar-picker-indicator {\n  filter: invert(0.6);\n  cursor: pointer;\n  opacity: 0.8;\n}\n.asone-panel .asone-scheduler input[type="date"]::-webkit-calendar-picker-indicator:hover,\n.asone-panel .asone-scheduler input[type="time"]::-webkit-calendar-picker-indicator:hover {\n  opacity: 1;\n}\n\n/* \u26A0 \u9690\u85CF\u672A\u9009\u62E9\u65E5\u671F\u65F6\u7684 yyyy/mm/\u65F6 \u5360\u4F4D\u7B26(\u7528\u6237\u70B9\u540D\u5FC5\u987B\u4FDD\u7559)   \u26A0\uFE0F \u7528 JS \u9A71\u52A8\u7684 `.is-empty` \u7C7B,\u4E0D\u7528 `:invalid`:\u7A7A\u7684\u975E required date \u8F93\u5165\n   \u662F `:valid`(\u6CA1\u6709 valueMissing/typeMismatch),`:invalid` \u53EA\u5728 required \u65F6\u624D\n   \u5339\u914D\u7A7A\u503C \u2014\u2014 \u800C required \u4F1A\u987A\u5E26\u7981\u6389 Chromium \u7684 \xD7 \u6E05\u9664\u6309\u94AE(\u89C1 SettingsPage)\u3002*/\n.asone-panel .asone-scheduler input[type="date"].is-empty::-webkit-datetime-edit {\n  color: transparent;\n}\n.asone-panel .asone-scheduler input[type="date"]:focus::-webkit-datetime-edit {\n  color: var(--asec-text);\n}\n\n/* \u661F\u671F\u6A21\u5757:\u4E00\u4E8C\u4E09\u56DB\u4E94 / \u516D\u65E5 \u4E24\u7EC4,\u7A7A\u95F4\u4E0D\u8DB3\u65F6\u300C\u516D\u65E5\u300D\u6574\u4F53\u6362\u884C*/\n.asone-panel .asone-scheduler .weekday-flex {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n.asone-panel .asone-scheduler .weekday-group {\n  display: flex;\n  gap: 8px;\n}\n.asone-panel .asone-scheduler .weekday-flex input {\n  display: none;\n}\n.asone-panel .asone-scheduler .weekday-flex label {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 34px;\n  height: 34px;\n  border-radius: 6px;\n  border: 1px solid var(--asec-border);\n  background: var(--asec-bg-input);\n  color: var(--asec-muted);\n  cursor: pointer;\n  transition: all 0.2s;\n  flex-shrink: 0;\n}\n.asone-panel .asone-scheduler .weekday-flex input:checked + label {\n  background: var(--asec-primary-bg);\n  border-color: var(--asec-primary);\n  color: var(--asec-primary);\n  font-weight: bold;\n}\n\n/* \u65F6\u95F4\u6BB5\u6A21\u5757*/\n.asone-panel .asone-scheduler .time-flex {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.asone-panel .asone-scheduler .time-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.asone-panel .asone-scheduler .time-row input[type="time"] {\n  width: 120px;\n  flex-shrink: 0;\n}\n.asone-panel .asone-scheduler .separator {\n  color: var(--asec-muted);\n}\n.asone-panel .asone-scheduler .btn-del-time {\n  background: none;\n  border: none;\n  color: var(--asec-danger);\n  cursor: pointer;\n  font-size: 16px;\n  padding: 0 4px;\n}\n.asone-panel .asone-scheduler .btn-add-time {\n  background: none;\n  border: none;\n  color: var(--asec-primary);\n  cursor: pointer;\n  font-size: 13px;\n  text-align: left;\n  padding: 0;\n  margin-top: 4px;\n}\n.asone-panel .asone-scheduler .btn-add-time:hover {\n  text-decoration: underline;\n}\n\n/* \u89C4\u5219\u6821\u9A8C\u9519\u8BEF(\u65B0\u589E:\u8BBE\u8BA1\u7A3F\u65E0,\u6CBF\u7528\u9519\u8BEF\u63D0\u793A\u8272)*/\n.asone-panel .asone-scheduler .rule-err {\n  margin: -8px 20px 20px;\n  color: var(--asec-danger);\n  font-size: 12.5px;\n  line-height: 1.5;\n}\n\n/* \u5206\u7EC4\u5E03\u5C40(\u8C03\u5EA6\u7F16\u8F91\u5668\u5DF2\u6362.asone-scheduler \u7ED3\u6784;\u8FD9\u51E0\u4E2A\u4EC5\u300C\u91CD\u8BD5\u7B56\u7565\u300D\u5361\u8FD8\u5728\u7528) */\n.asone-panel .ui-rule-groups {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n}\n.asone-panel .ui-group {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n.asone-panel .ui-group-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n}\n.asone-panel .ui-group-title {\n  color: var(--text);\n  font-size: 13px;\n  font-weight: 500;\n}\n\n/* \u2500\u2500 \u9000\u907F\u66F2\u7EBF\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ui-chart-box {\n  width: 100%;\n  overflow-x: auto;\n  padding: 8px 0 2px;\n}\n.asone-panel .ui-chart-yaxis {\n  stroke: var(--border);\n}\n.asone-panel .ui-chart-grid {\n  stroke: var(--border);\n}\n.asone-panel .ui-chart-axis {\n  stroke: var(--border);\n}\n.asone-panel .ui-chart-band {\n  fill: var(--accent-soft);\n}\n.asone-panel .ui-chart-dash {\n  stroke: var(--warn);\n  stroke-dasharray: 4 4;\n}\n.asone-panel .ui-chart-line {\n  fill: none;\n  stroke: var(--accent);\n  stroke-width: 1.8;\n}\n.asone-panel .ui-chart-dot {\n  fill: var(--accent);\n}\n.asone-panel .ui-chart-label {\n  fill: var(--text-soft);\n  font-size: 10px;\n}\n.asone-panel .ui-chart-tick {\n  fill: var(--text-soft);\n  font-size: 10px;\n}\n.asone-panel .ui-chart-text {\n  margin-top: 10px;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.asone-panel .ui-chart-text p {\n  margin: 0;\n  color: var(--text-soft);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u2500\u2500 \u5E95\u90E8\u4FDD\u5B58\u680F\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ui-savebar {\n  display: flex;\n  align-items: center;\n  gap: 14px;\n  background: var(--surface);\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  padding: 10px 14px;\n  position: sticky;\n  bottom: 12px;\n  z-index: 5;\n}\n.asone-panel .ui-savebar-count {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--text);\n  font-size: 13px;\n  white-space: nowrap;\n}\n.asone-panel .ui-savebar-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background: var(--bad);\n}\n.asone-panel .ui-savebar-msg {\n  flex: 1;\n  min-width: 0;\n  color: var(--text-soft);\n  font-size: 12px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.asone-panel .ui-savebar-btns {\n  display: flex;\n  gap: 8px;\n}\n\n/* \u2500\u2500 ui-btn \u6309\u94AE\u4F53\u7CFB(\u8BBE\u7F6E\u9875) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .ui-btn {\n  appearance: none;\n  font: inherit;\n  color: var(--text);\n  background: var(--accent-soft);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  height: 30px;\n  padding: 0 12px;\n  font-size: 12.5px;\n  cursor: pointer;\n}\n.asone-panel .ui-btn:hover:not(:disabled) {\n  border-color: var(--accent);\n}\n.asone-panel .ui-btn:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.asone-panel .ui-btn-sm {\n  height: 24px;\n  padding: 0 10px;\n  font-size: 12px;\n}\n.asone-panel .ui-btn-primary {\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\n  border-color: var(--dsw-alias-button-info-fill, #2f4d6b);\n  color: var(--on-accent);\n}\n.asone-panel .ui-btn-primary:hover:not(:disabled) {\n  background: var(--dsw-alias-button-info-hover, #24425f);\n}\n.asone-panel .ui-btn-ghost {\n  background: none;\n  color: var(--text);\n}\n.asone-panel .ui-btn-danger {\n  color: var(--bad);\n}\n\n/* ===========================================================================\n   \u5176\u4ED6\u4F9B\u5E94\u5546\u9875(ProvidersPage,1:1 \u79FB\u690D Nexus Providers.vue \u7684scoped \u6837\u5F0F)\n   =========================================================================== */\n\n.asone-panel .providers-page {\n  max-width: 760px;\n}\n\n.asone-panel .rows {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  margin: 12px 0 0;\n  padding: 0;\n  list-style: none;\n}\n\n.asone-panel .rowCard {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  border: 1px solid var(--border);\n  background: var(--surface);\n  border-radius: 10px;\n  padding: 12px 14px;\n}\n\n.asone-panel .rowHead {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.asone-panel .rowName {\n  color: var(--text);\n  font-size: 14px;\n  font-weight: 500;\n}\n\n.asone-panel .credentialDot {\n  flex: none;\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  display: inline-block;\n}\n\n.asone-panel .dotOk {\n  background: var(--ok);\n}\n\n.asone-panel .dotMissing {\n  background: var(--bad);\n}\n\n.asone-panel .rowActions {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  margin-left: auto;\n}\n\n.asone-panel .rowBtn {\n  appearance: none;\n  font: inherit;\n  border-radius: 6px;\n  height: 28px;\n  padding: 0 12px;\n  font-size: 12px;\n  cursor: pointer;\n  border: 1px solid var(--border);\n  background: transparent;\n  color: var(--text);\n}\n.asone-panel .rowBtn:hover:not(:disabled) {\n  background: var(--surface-hover);\n}\n.asone-panel .rowBtn.danger {\n  color: var(--bad);\n}\n.asone-panel .rowBtn:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.asone-panel .panel {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  background: var(--surface-deep);\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  padding: 12px;\n}\n\n.asone-panel .panelTitle {\n  color: var(--text);\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 20px;\n  margin-bottom: 2px;\n}\n\n.asone-panel .catalogSection {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.asone-panel .catalogTitle {\n  color: var(--text);\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 18px;\n}\n\n.asone-panel .modelListHead {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-bottom: 2px;\n}\n\n.asone-panel .modelCatalogMeta {\n  color: var(--text-soft);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .headActions {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n}\n\n.asone-panel .linkButton {\n  appearance: none;\n  background: none;\n  border: none;\n  font: inherit;\n  border-radius: 4px;\n  height: 28px;\n  color: var(--text);\n  cursor: pointer;\n  padding: 0 8px;\n  font-size: 12px;\n  line-height: 18px;\n  display: inline-flex;\n  align-items: center;\n}\n.asone-panel .linkButton:hover:not(:disabled) {\n  background: var(--surface-hover);\n  color: var(--text);\n}\n.asone-panel .linkButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.asone-panel .modelEmpty {\n  margin: 0;\n  color: var(--text-soft);\n  font-size: 12px;\n  line-height: 18px;\n  border: 1px dashed var(--border);\n  border-radius: 8px;\n  text-align: center;\n  padding: 12px;\n}\n\n.asone-panel .addButton {\n  box-sizing: border-box;\n  flex: none;\n  width: 100%;\n  border: 1px dashed var(--border);\n  border-radius: 10px;\n  background: var(--surface);\n  height: 54px;\n  margin-top: 10px;\n  color: var(--text);\n  font: inherit;\n  cursor: pointer;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  gap: 6px;\n  padding: 0 14px;\n  font-size: 14px;\n}\n.asone-panel .addButton:hover:not(:disabled) {\n  background: var(--surface-hover);\n  border-color: var(--border);\n}\n.asone-panel .addButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.asone-panel .cardFooter {\n  justify-content: flex-end;\n}\n\n.asone-panel .envPrefix {\n  font-family: var(--mono);\n  font-size: 12px;\n  color: var(--text);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 4px 10px;\n  display: inline-block;\n  align-self: flex-start;\n  word-break: break-all;\n}\n\n/* \u2500\u2500 \u903B\u8F91\u6A21\u578B / \u6A21\u578B\u603B\u89C8 \u5B50\u9875(Nexus \u9762\u677F\u79FB\u690D,\u7C7B\u540D\u6CBF\u7528 Nexus)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .section {\n  color: var(--text);\n  flex-direction: column;\n  gap: 12px;\n  display: flex;\n}\n\n/* \u4E24\u9875 section \u5BBD\u5EA6\u5DEE\u5F02(\u590D\u7528\u540C\u4E00 .section,\u4EC5 max-width \u4E0D\u540C) */\n.asone-panel .lm-section {\n  /* \u26A0\uFE0F 2026-10-25(m14379):\u903B\u8F91\u6A21\u578B\u5217\u8868\u5728\u52A0\u5BBD\u7684 content \u91CC\u5C45\u4E2D\u3002     \u663E\u5F0F width:min(720px,100%) \u2014\u2014\u5149\u9760 max-width + margin-inline:auto\n     \u4F1A\u8BA9 flex item \u6536\u7F29\u5230\u5185\u5BB9\u5BBD(\u5B9E\u6D4B 531px),\u5FC5\u987B\u7ED9\u56FA\u5B9A\u5BBD\u5EA6\u3002*/\n  max-width: 720px;\n  width: min(720px, 100%);\n  margin-inline: auto;\n}\n.asone-panel .dep-section {\n  /* \u26A0\uFE0F 2026-10-25(m14922):\u6A21\u578B\u603B\u89C8\u6574\u7EC4\u5C45\u4E2D\u3002section \u5168\u5BBD,\u5361\u7247\u7EC4\u81EA\u8EAB     (dep-grid)\u7528 width:min(1464px,100%) + margin-inline:auto \u5C45\u4E2D;\n     \u4E0D\u518D\u7528 max-width 1200 \u9650\u5236(\u90A3\u4F1A\u5361\u6B7B\u53EA\u80FD 2 \u5217)\u3002*/\n  width: 100%;\n}\n.asone-panel .pv-section {\n  /* \u26A0\uFE0F 2026-10-25(m14379):\u5176\u4ED6\u4F9B\u5E94\u5546\u5217\u8868\u5728\u52A0\u5BBD\u7684 content \u91CC\u5C45\u4E2D\u3002     \u540C\u4E0A,\u663E\u5F0F\u5BBD\u5EA6\u9632\u6B62\u6536\u7F29(\u5B9E\u6D4B 248px)\u3002*/\n  max-width: 720px;\n  width: min(720px, 100%);\n  margin-inline: auto;\n}\n\n/* \u300C\u652F\u6301\u7684\u601D\u8003\u5F3A\u5EA6\u300D\u5FBD\u7AE0(\u603B\u89C8\u9875\u6BCF\u884C\u6A21\u578B\u4E00\u4E2A;pill \u6837\u5F0F\u7EDF\u4E00\u8D70 .pill) */\n.asone-panel .pill.efforts {\n  max-width: 22ch;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* Nexus \u7684.err / .savedNotice \u662F\u7EAF\u6587\u5B57;As One \u5DF2\u6709 .err \u76D2\u5F0F\u53D8\u4F53,\n   \u7528\u4F5C\u7528\u57DF\u8986\u76D6(.section .err,\u7279\u5F02\u6027 0,2,0)\u8FD8\u539F Nexus \u5F62\u6001,\u4E0D\u52A8\u5168\u5C40 .err */\n.asone-panel .section .err {\n  padding: 0;\n  border: 0;\n  background: none;\n  border-radius: 0;\n  margin: 0;\n  color: var(--bad);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.asone-panel .savedNotice {\n  color: var(--ok);\n  font-size: 12px;\n  line-height: 18px;\n  margin: 0;\n}\n\n/* \u884C\u5361\u5934\u90E8(\u903B\u8F91\u6A21\u578B) */\n.asone-panel .rowIdentity {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.asone-panel .rowTag {\n  border: 1px solid var(--border);\n  border-radius: 4px;\n  color: var(--text);\n  flex: none;\n  padding: 1px 6px;\n  font-size: 11px;\n  line-height: 16px;\n}\n\n.asone-panel .rowRuntime {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  margin-left: 8px;\n}\n\n/* \u5FBD\u7AE0 pill(Nexus \u540C\u6B3E) */\n.asone-panel .pill {\n  display: inline-block;\n  padding: 1px 7px;\n  border-radius: 9px;\n  font-size: 11px;\n  line-height: 16px;\n  white-space: nowrap;\n}\n.asone-panel .pill.ok {\n  background: var(--surface-ok);\n  color: var(--ok);\n}\n.asone-panel .pill.bad {\n  background: var(--surface-bad);\n  color: var(--bad);\n}\n.asone-panel .pill.info {\n  background: var(--surface);\n  color: var(--dsw-alias-state-business-primary, var(--accent));\n}\n.asone-panel .pill.na {\n  background: var(--chip-bg);\n  color: var(--dim);\n}\n.asone-panel .pill.metric {\n  background: var(--chip-bg);\n  color: var(--text);\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .pill.alert {\n  background: var(--surface-warn);\n  color: var(--warn);\n}\n\n/* \u6A21\u578B\u603B\u89C8\u9876\u680F(2026-10-25 m14379 \u91CD\u65B0\u8BBE\u8BA1;m14922 \u8D77\u4E0D\u518D\u6709\u6279\u91CF\u6309\u94AE,\u53EA\u7559\u7EDF\u8BA1) */\n.asone-panel .dep-toolbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  flex-wrap: wrap;\n}\n.asone-panel .dep-summary {\n  color: var(--text-soft);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n/* \u6A21\u578B\u603B\u89C8\u591A\u5217\u5361\u7247(m14922 \u5B9A\u6848:\u4E0D\u518D\u5206\u7EC4\u6298\u53E0,\u6BCF\u90E8\u7F72\u4E00\u884C\u5F39\u6027\u5217\u5BBD+ \u6574\u7EC4\u5C45\u4E2D\u3002   \u26A0\uFE0F \u5217\u5BBD minmax(360px, 480px):1920 \u7A97\u53E3(content 1680,\u5185\u5BB9\u533A 1640)\u4E0B\u80FD\u653E 3 \u5217   (3\xD7480 + 2\xD712 = 1464 \u22481640);\u7A97\u53E3\u66F4\u7A84\u65F6auto-fill \u81EA\u52A8\u964D\u4E3A 2 \u5217 / 1 \u5217\u3002   \u907F\u514D hyperai/deepseek-v4.1-flash-fastest \u8FD9\u7C7B\u957F\u6A21\u578B\u540D\u628A\u5361\u7247\u5185\u5BB9\u6324\u6210\u4E09\u884C\u3002*/\n.asone-panel .dep-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(360px, 480px));\n  justify-content: center;\n  gap: 12px;\n  flex: 1 1 auto;\n  min-width: 0;\n  width: min(1464px, 100%);\n  margin-inline: auto;\n}\n\n.asone-panel .depCard {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  padding: 10px 12px;\n  background: var(--surface);\n}\n\n.asone-panel .depCardHead {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex-wrap: wrap;\n  min-width: 0;\n}\n\n.asone-panel .depProvider {\n  flex: none;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--text);\n  border: 1px solid var(--border);\n  border-radius: 999px;\n  padding: 1px 8px;\n  background: var(--bg-deep);\n  white-space: nowrap;\n}\n\n.asone-panel .depCardBody {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  min-width: 0;\n}\n\n/* \u90E8\u7F72\u5361(\u65E0 hover \u9AD8\u4EAE:\u5361\u7247\u672C\u8EAB\u5DF2\u662F\u72EC\u7ACB\u5757,\u4E0D\u518D\u6A21\u4EFF\u884C) */\n.asone-panel .depCard:hover {\n  background: var(--surface);\n}\n\n.asone-panel .depCode {\n  background: none;\n  padding: 0;\n  border: 0;\n  border-radius: 0;\n  font-family: var(--mono);\n  font-size: 12.5px;\n  color: var(--text);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  flex: 1 1 auto;\n  min-width: 0;\n  max-width: 100%;\n}\n\n.asone-panel .depChips {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n  min-width: 0;\n}\n\n.asone-panel .depChipEdit {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  background: var(--chip-bg);\n  border-radius: 9px;\n  padding: 1px 6px 1px 8px;\n  line-height: 16px;\n}\n\n.asone-panel .chipLabel {\n  font-size: 11px;\n  color: var(--text-soft);\n}\n\n.asone-panel .chipNum {\n  width: 42px;\n  background: var(--bg-deep);\n  border: 1px solid var(--border);\n  border-radius: 4px;\n  color: var(--text);\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  padding: 1px 4px;\n  text-align: center;\n}\n.asone-panel .chipNum:disabled {\n  opacity: 0.5;\n}\n.asone-panel .chipNum::-webkit-outer-spin-button,\n.asone-panel .chipNum::-webkit-inner-spin-button {\n  -webkit-appearance: none;\n  margin: 0;\n}\n\n/* \u601D\u8003\u5F3A\u5EA6\u9009\u62E9\u5668(\u6A21\u578B\u603B\u89C8\u5361\u7247\u5185\u7684\u4E0B\u62C9) */\n.asone-panel .chipSelect {\n  background: var(--bg-deep);\n  border: 1px solid var(--border);\n  border-radius: 4px;\n  color: var(--text);\n  font-size: 12px;\n  padding: 1px 4px;\n  /* \u95ED\u5408\u6001\u663E\u793A\u7684\u662F**\u6570\u636E\u5E93\u539F\u59CB\u6587\u672C**(\u5982 ["low","medium","high","max"]),\n     \u6BD4\u539F\u6765\u7684\u679A\u4E3E\u6807\u7B7E\u957F\u5F97\u591A,\u5BBD\u5EA6\u653E\u5BBD;\u8D85\u957F\u65F6\u7701\u7565\u53F7\u622A\u65AD,\u5168\u6587\u5728 title \u91CC\u3002 */\n  max-width: 320px;\n  text-overflow: ellipsis;\n}\n.asone-panel .chipSelect:disabled {\n  opacity: 0.5;\n}\n\n.asone-panel .depCheck {\n  margin-left: auto;\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 12px;\n  color: var(--text);\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.asone-panel .checkInput {\n  width: 15px;\n  height: 15px;\n  accent-color: var(--ok);\n}\n.asone-panel .checkInput:disabled {\n  opacity: 0.4;\n}\n\n/* \u6A21\u578B\u603B\u89C8 2026-10-25(m14379)\u5DF2\u628A\u6279\u91CF\u6309\u94AE\u632A\u5230\u9876\u90E8\u5DE5\u5177\u6761(m14922 \u8D77\u79FB\u9664\u6309\u94AE),\n   \u4E0D\u518D\u7528 .section .headActions \u7AD6\u6392\u5F62\u6001\u3002*/\n\n/* \u2500\u2500 \u6E20\u9053\u5408\u5E76\u9875(2026-11-07 \u5B9A\u6848:\u6298\u53E0\u5361 + \u5E38\u663E\u4F59\u989D\u5361\u5934)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n.asone-panel .channels-page { display: flex; flex-direction: column; gap: 12px; }\n\n.asone-panel .channels-checkin {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  flex-wrap: wrap;\n  padding: 10px 14px;\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  background: var(--surface);\n}\n.asone-panel .channels-checkin-chips { display: flex; gap: 8px; flex-wrap: wrap; }\n.asone-panel .chx-chip {\n  font-size: 12px;\n  padding: 3px 9px;\n  border-radius: 999px;\n  border: 1px solid var(--border);\n  color: var(--text-soft);\n}\n.asone-panel .chx-chip.is-ok { color: var(--ok, #1a7f37); border-color: var(--ok, #1a7f37); }\n.asone-panel .chx-chip.is-warn { color: #b35900; border-color: #b35900; }\n.asone-panel .chx-note { margin: 0; font-size: 12px; color: var(--text-soft); word-break: break-all; }\n\n.asone-panel .chx-card {\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  background: var(--surface);\n  overflow: hidden;\n}\n.asone-panel .chx-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 12px 16px;\n  flex-wrap: wrap;\n}\n.asone-panel .chx-toggle {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  background: none;\n  border: none;\n  cursor: pointer;\n  padding: 0;\n  color: var(--text);\n  font-size: 14px;\n  font-weight: 600;\n}\n.asone-panel .chx-caret {\n  width: 0;\n  height: 0;\n  border-left: 6px solid var(--text-soft);\n  border-top: 4px solid transparent;\n  border-bottom: 4px solid transparent;\n  transition: transform 0.12s ease;\n}\n.asone-panel .chx-caret.open { transform: rotate(90deg); }\n.asone-panel .chx-balance { display: inline-flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--text-soft); }\n.asone-panel .chx-acct b { color: var(--text); font-weight: 600; margin-right: 4px; }\n.asone-panel .chx-acct .chx-none { color: var(--text-soft); font-style: italic; }\n.asone-panel .chx-expiry { font-style: normal; margin-left: 6px; opacity: 0.8; }\n.asone-panel .chx-balance.none, .asone-panel .chx-hint { opacity: 0.7; }\n.asone-panel .chx-body {\n  padding: 4px 16px 16px;\n  border-top: 1px solid var(--border);\n}\n/* \u5185\u5D4C\u9875\u81EA\u5E26 gap \u5E03\u5C40,\u6298\u53E0\u4F53\u91CC\u8865\u4E00\u70B9\u4E0A\u8FB9\u8DDD\u5373\u53EF */\n.asone-panel .chx-body .chan-page { padding-top: 12px; }\n\n/* \u2500\u2500 \u6E20\u9053\u9875\u4E09\u6BB5\u5F0F\u9AA8\u67B6(1:1 \u79FB\u690D Nexus styles.css \u5168\u5C40 .chan-* \u6BB5) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n.asone-panel .chan-page { display: flex; flex-direction: column; gap: 16px; }\n\n.asone-panel .chan-card {\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  padding: 16px;\n  background: var(--surface);\n}\n\n.asone-panel .chan-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; }\n.asone-panel .chan-head h3 { margin: 0; font-size: 14px; color: var(--text); }\n\n/* `.chan-tag` \u5DF2\u968F\u7528\u6237 2026-10-31 \u5B9A\u6848\u5220\u9664(\u300C\u7EDF\u4E00\u5220\u9664\u300E\u6A21\u578B\u76EE\u5F55\u300F\u65C1\u7684\u5FBD\u7AE0\n * \u5982\u300E\u4E0A\u6E38 API \xB7 3 \u4E2A\u300F\u300E\u5DF2\u52FE\u9009 4 / 11\u300F\u300D)\u2014\u2014 \u56DB\u4E2A\u6E20\u9053\u9875\u7684\u6A21\u578B\u76EE\u5F55\u6807\u9898\u884C\u53EA\u5269 h3\u3002 */\n\n.asone-panel .chan-hint { color: var(--text-soft); font-size: 12px; line-height: 1.6; margin: 6px 0 0; }\n.asone-panel .chan-empty { color: var(--text-soft); font-size: 13px; }\n\n.asone-panel .chan-banner { margin: 0 0 8px; padding: 7px 10px; border-radius: 6px; font-size: 12px; }\n.asone-panel .chan-banner.err { color: var(--bad); border: 1px solid color-mix(in srgb, var(--bad) 45%, transparent); background: var(--surface-bad); }\n.asone-panel .chan-banner.warn { color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent); background: var(--surface-warn); }\n.asone-panel .chan-banner.ok { color: var(--ok); border: 1px solid color-mix(in srgb, var(--ok) 45%, transparent); background: var(--surface-ok); }\n\n.asone-panel .chan-badge {\n  font-size: 11px;\n  padding: 2px 8px;\n  border-radius: 999px;\n  background: var(--surface-deep);\n  color: var(--text);\n}\n.asone-panel .chan-badge.ok { background: var(--surface-ok); color: var(--ok); }\n.asone-panel .chan-badge.bad { background: var(--surface-bad); color: var(--bad); }\n.asone-panel .chan-badge.off { background: var(--surface-warn); color: var(--warn); }\n\n.asone-panel .chan-sub { color: var(--text-soft); font-size: 12px; }\n\n/* \u6E20\u9053\u9875\u9876\u90E8\u52A8\u4F5C\u884C:ModelsPage \u5B50\u6807\u9898\u884C action \u672A\u63A5\u7EBF,\u58F3\u672A\u4F20,\u9875\u9762\u5185\u6E32\u67D3   \u4E0E Nexus \u5B50\u6807\u9898\u884C\u53F3\u7AEF\u52A8\u4F5C\u533A(act-note / act-btn)\u540C\u6B3E\u7684\u5237\u65B0\u6761 */\n.asone-panel .chan-action { display: flex; align-items: center; gap: 10px; justify-content: flex-end; margin-bottom: 2px; }\n\n/* \u8D26\u53F7\u5361\u5934(ProviderCard / SenseNovaPanel \u5171\u7528) */\n.asone-panel .acct-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }\n.asone-panel .acct-head h3 { margin: 0; font-size: 16px; color: var(--text); }\n.asone-panel .who { display: flex; align-items: center; gap: 8px; }\n.asone-panel .who h3 { margin: 0; font-size: 16px; color: var(--text); }\n.asone-panel .badges { display: flex; gap: 6px; flex-wrap: wrap; }\n.asone-panel .acct-side { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\n.asone-panel .acct-side b { font-size: 13px; color: var(--text); font-variant-numeric: tabular-nums; }\n.asone-panel .acct-cta { margin-top: 10px; }\n.asone-panel .warn-line { color: var(--warn); }\n\n/* \u8D26\u53F7\u72B6\u6001\u5706\u70B9(\u4EC5\u6E20\u9053\u9875\u4F5C\u7528\u57DF\u5185;\u4E0D\u52A8 ModelTable \u89C6\u89C9\u5217\u7684\u6587\u672C .dot) */\n.asone-panel .chan-page .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex: none; }\n.asone-panel .chan-page .dot.ok { background: var(--ok); }\n.asone-panel .chan-page .dot.bad { background: var(--bad); }\n.asone-panel .chan-page .dot.off { background: var(--dim); }\n\n/* \u2500\u2500 \u7EDF\u4E00\u8D26\u53F7\u72B6\u6001\u884C(Trae / WorkBuddy / Qoder / SenseNova \u56DB\u5904\u5171\u7528) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n   \u7248\u5F0F\u7531\u7528\u6237 2026-10-30 \u5B9A\u6848:\u4E00\u4E2A\u8D26\u53F7\u4E00\u4E2A\u6846(\u591A\u8D26\u53F7\u5C31\u591A\u4E2A\u6846,\u4E0D\u5408\u5E76),\n   \u6846\u5185\u5DE6\u300C\u7528\u6237\u540D\u300D\u3001\u53F3\u300C\u5269\u4F59\u79EF\u5206/\u5230\u671F\u300D;   \u5237\u65B0\u6309\u94AE 2026-10-30 \u7B2C\u4E8C\u8F6E\u4E0A\u79FB\u5230**\u5B50\u6807\u9898\u884C\u53F3\u7AEF**(\u89C1 ModelsPage.tsx),\n   \u8D26\u53F7\u5E26\u91CC\u53EA\u5269\u8D26\u53F7\u6846,\u6240\u4EE5\u4E0D\u518D\u9700\u8981 `.acct-band` \u7684\u53F3\u4FA7\u680F\u3002   SenseNova \u4E00\u4E2A\u8D26\u53F7\u8981\u6446\u4E24\u4E09\u4E2A\u6C60\u5FBD\u7AE0\u653E\u4E0D\u4E0B\u5C31\u6362\u884C \u2014\u2014\u5B81\u53EF\u8BA9\u6846\u53D8\u9AD8,\n   \u4E5F\u4E0D\u80FD\u628A\u5FBD\u7AE0\u538B\u51FA\u6846\u5916(\u90A3\u6837\u6570\u5B57\u4F1A\u88AB\u88C1\u6389,\u7B49\u4E8E\u6CA1\u663E\u793A)\u3002*/\n.asone-panel .acct-cards {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n.asone-panel .acct-card { padding: 14px 16px; }\n.asone-panel .acct-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px 12px;\n  flex-wrap: wrap;\n}\n.asone-panel .acct-row-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto; }\n.asone-panel .acct-name {\n  font-size: 15px;\n  /* \u7528\u6237\u540D\u52A0\u7C97(\u7528\u6237 2026-10-30 \u5B9A\u6848):\u4E00\u884C\u91CC\u6700\u8BE5\u5148\u88AB\u8BA4\u51FA\u6765\u7684\u662F\u300C\u8FD9\u662F\u8C01\u7684\u8D26\u53F7\u300D,\n     \u53F3\u4FA7\u90A3\u51E0\u4E2A\u5FBD\u7AE0\u6570\u5B57\u53CD\u800C\u662F\u7B2C\u4E8C\u773C\u4FE1\u606F\u3002*/\n  font-weight: 700;\n  color: var(--text);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.asone-panel .acct-row-right { display: flex; align-items: center; gap: 8px; flex: none; }\n.asone-panel .acct-row-right .chan-badge b { font-variant-numeric: tabular-nums; font-weight: 600; }\n\n/* \u6A21\u578B\u8868\u7684\u53EA\u8BFB\u5217(Qoder \u8FD9\u7C7B\u672A\u767B\u8BB0\u884C\u4E0D\u6446\u8F93\u5165\u6846) */\n.asone-panel .plain-cell { color: var(--text); font-size: 12px; font-variant-numeric: tabular-nums; }\n\n/* \u6E20\u9053\u9875\u4E3B\u6309\u94AE(Nexus ProviderCard \u540C\u6B3E;\u4E0D\u6539\u52A8\u65E2\u6709.btn) */\n.asone-panel .chan-page .btn.primary { background: var(--dsw-alias-button-info-hover, #24425f); }\n.asone-panel .chan-page .btn.primary:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover, #24425f); }\n\n/* \u901A\u7528\u7F51\u683C\u8868(\u51ED\u636E / \u989D\u5EA6 / \u8D26\u53F7\u7BA1\u7406 / \u8FDE\u901A\u6027\u5171\u7528) */\n.asone-panel .grid { width: 100%; border-collapse: collapse; margin: 8px 0; }\n.asone-panel .grid th, .asone-panel .grid td { border-bottom: 1px solid var(--border); padding: 7px 6px; font-size: 13px; text-align: left; }\n.asone-panel .grid th { background: var(--surface-deep); color: var(--text); font-weight: 600; }\n.asone-panel .grid th.num, .asone-panel .grid td.num { text-align: right; font-variant-numeric: tabular-nums; }\n.asone-panel .grid td.sub { color: var(--text-soft); }\n.asone-panel .th-note { margin-left: 6px; color: var(--text-soft); font-weight: 400; }\n\n/* SenseNova \u8D26\u53F7\u5361 + \u79EF\u5206\u6C60(\u901A\u7528\u6C60\u7D2B / \u4E13\u5C5E\u6C60\u6A59)\n   \u26A0\uFE0F 2026-10-23:\u4FDD\u6301\u5361\u5BBD 420px \u8D70\u7528\u6237\u8981\u6C42\u4E0D\u538B\u7A84\u5361\u7247\u5BFC\u81F4\u6837\u5F0F\u9519\u4E71\u3002   **\u5F39\u6027\u5E03\u5C40**:`repeat(auto-fill, minmax(420px, 1fr))` \u672C\u8EAB\u5C31\u4F1A\u5728\u9875\u9762\u5BBD\u5EA6   \u8DB3\u591F\u65F6\u653E 3 \u5F20\u5355\u884C\u3001\u5BBD\u5EA6\u4E0D\u8DB3\u65F6\u81EA\u52A8\u6362\u884C \u2014\u2014\u52A0\u5BBD .content \u53EA\u662F\u8BA9\u300C\u8DB3\u591F\u300D   \u7684\u95E8\u69DB\u5728\u9ED8\u8BA4\u7A97\u53E3\u4E0B\u5C31\u8FBE\u5230(3\xD7420 + 2\xD716 = 1292px \u2248 \u5185\u5BB9\u533A)\u3002*/\n.asone-panel .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }\n\n.asone-panel .pools {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\n  gap: 12px;\n  margin: 12px 0 0;\n}\n.asone-panel .pool {\n  position: relative;\n  overflow: hidden;\n  display: flex;\n  flex-direction: column;\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  padding: 12px 12px 10px;\n  background: var(--surface-deep);\n}\n.asone-panel .pool-accent { position: absolute; inset: 0 0 auto 0; height: 2px; }\n.asone-panel .pool.general .pool-accent { background: var(--pool-grad-general); }\n.asone-panel .pool.special .pool-accent { background: var(--pool-grad-special); }\n.asone-panel .pool-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }\n.asone-panel .pool-head strong { color: var(--text); font-size: 12px; }\n.asone-panel .pdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }\n.asone-panel .pool.general .pdot { background: var(--pool-general-soft); box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1, #141b26); }\n.asone-panel .pool.special .pdot { background: var(--pool-special-soft); box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1, #141b26); }\n.asone-panel .row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 11px; color: var(--dim); margin: 8px 0 4px; }\n.asone-panel .row-label { flex: none; }\n.asone-panel .row-val { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }\n.asone-panel .row-val b { font-size: 15px; color: var(--text); font-variant-numeric: tabular-nums; font-weight: 600; }\n.asone-panel .row-val .pct { color: var(--dim); font-size: 11px; font-variant-numeric: tabular-nums; }\n.asone-panel .row.split { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }\n.asone-panel .bar { height: 5px; background: var(--surface-deep); border-radius: 999px; overflow: hidden; }\n.asone-panel .bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }\n.asone-panel .pool.general .bar-fill { background: var(--pool-grad-general); }\n.asone-panel .pool.special .bar-fill { background: var(--pool-grad-special); }\n.asone-panel .pool.cooling .bar-fill { background: var(--dim); }\n.asone-panel .grant, .asone-panel .reset-row {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  min-height: 30px;\n  box-sizing: border-box;\n  margin-top: auto;\n  padding: 0 2px;\n  border-radius: 8px;\n  font-size: 11px;\n  color: var(--text-soft);\n}\n.asone-panel .grant b { color: var(--text); font-size: 13px; font-variant-numeric: tabular-nums; }\n.asone-panel .g-label { flex: 1 1 auto; }\n.asone-panel .reset-row { justify-content: space-between; padding: 0 2px; }\n.asone-panel .r-label { flex: none; }\n.asone-panel .r-val { color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }\n\n/* \u9875\u811A\u8BF4\u660E */\n.asone-panel .foot { margin-top: 0; }\n\n/* ===========================================================================\n   \u903B\u8F91\u6A21\u578B\u5B50\u9875(LogicalModelsPage)\u4E25\u683C\u590D\u523B Nexus LogicalModels.vue \u7684scoped\n   \u6837\u5F0F \u2014\u2014\u4E0A\u65B9 .rows/.rowCard/.rowBtn/.addButton/.editor \u7B49\u901A\u7528\u5757\u7531\u4F9B\u5E94\u5546\u9875\u7B49   \u5171\u7528,\u4E0D\u80FD\u6539\u8FD9\u91CC\u5BF9 .lm-section \u4F5C\u7528\u57DF\u5185\u7684\u5DEE\u5F02\u505A Nexus \u540C\u503C\u8986\u76D6\u3002   =========================================================================== */\n\n/* ul.rows:Nexus gap 8px(\u901A\u7528\u5757\u662F\u4F9B\u5E94\u5546\u9875\u7684 10px) */\n.asone-panel .lm-section .rows {\n  gap: 8px;\n}\n\n/* li.rowCard:Nexus \u8FB9\u6846 var(--border) / \u5E95\u8272 var(--surface) / gap 12px */\n.asone-panel .lm-section .rowCard {\n  border-color: var(--border);\n  background: var(--surface);\n  gap: 12px;\n}\n\n/* rowHead \u95F4\u8DDD 10px */\n.asone-panel .lm-section .rowHead {\n  gap: 10px;\n}\n\n/* rowName \u884C\u9AD8 22px */\n.asone-panel .lm-section .rowName {\n  line-height: 22px;\n}\n\n/* rowActions \u95F4\u8DDD 4px */\n.asone-panel .lm-section .rowActions {\n  gap: 4px;\n}\n\n/* rowBtn:\u5706\u89D2 4px / \u5185\u8DDD 0 10px / \u8FB9\u6846 var(--border) / \u5B57\u8272 var(--text-soft);hover \u5E95\u8272 var(--dsw-alias-interactive-bg-hover, #1f2732) */\n.asone-panel .lm-section .rowBtn {\n  border-radius: 4px;\n  padding: 0 10px;\n  border-color: var(--border);\n  color: var(--text);\n  line-height: 18px;\n}\n.asone-panel .lm-section .rowBtn:hover:not(:disabled) {\n  background: var(--surface-hover);\n}\n\n/* addButton:\u865A\u7EBF\u8FB9 var(--border) / \u5E95\u8272 var(--surface) / margin-top 8px(\u4E0E .rows \u884C\u8DDD\u4E00\u81F4) */\n.asone-panel .lm-section .addButton {\n  border-color: var(--border);\n  background: var(--surface);\n  margin-top: 8px;\n  line-height: 22px;\n}\n\n/* \u2500\u2500 \u7F16\u8F91\u5668(Nexus LogicalModelEditor.vue scoped \u540C\u503C) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\n\n/* Nexus \u7F16\u8F91\u5668\u5168\u90E8.input \u5E95\u8272 var(--bg-deep) / \u8FB9\u6846 var(--border) / \u5B57\u8272 var(--text-soft) /\n   \u5B57\u53F7 14px / \u884C\u9AD8 22px / \u805A\u7126\u8FB9\u6846 var(--accent)(\u901A\u7528 .input \u662F\u9875\u9762\u5168\u5C40 13px \u53D8\u91CF\u7248 */\n.asone-panel .lm-section .editor .input {\n  width: 100%;\n  height: 32px;\n  padding: 0 10px;\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  background: var(--bg-deep);\n  color: var(--text);\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n}\n.asone-panel .lm-section .editor .input::placeholder {\n  color: var(--dim);\n}\n.asone-panel .lm-section .editor .input:focus {\n  border-color: var(--accent);\n  outline: none;\n}\n.asone-panel .lm-section .editor .input.inputBad {\n  border-color: var(--bad);\n}\n.asone-panel .lm-section .editor .input.inputBad:focus {\n  border-color: var(--bad);\n}\n.asone-panel .lm-section .editor .input:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n.asone-panel .lm-section .editor .selectInput {\n  cursor: pointer;\n}\n\n/* fieldLabel / fieldNote / fieldWarn / fieldValue:Nexus \u8272\u4E0E\u884C\u9AD8 */\n.asone-panel .lm-section .editor .fieldLabel {\n  color: var(--text);\n  font-weight: 500;\n  line-height: 18px;\n}\n.asone-panel .lm-section .editor .fieldValue {\n  color: var(--text);\n  font-size: 14px;\n  line-height: 22px;\n}\n.asone-panel .lm-section .editor .fieldNote {\n  color: var(--text-soft);\n  font-size: 12px;\n  line-height: 18px;\n}\n.asone-panel .lm-section .editor .fieldWarn {\n  color: var(--text-soft);\n  font-size: 12px;\n  line-height: 18px;\n}\n.asone-panel .lm-section .editor .fieldWarn b {\n  color: var(--text);\n  font-weight: 500;\n}\n\n/* chainHead:\u6863\u94FE\u5C0F\u8282\u5934(\u9875\u9762\u6B64\u524D\u672A\u6E32\u67D3\u8BE5 class) */\n.asone-panel .chainHead {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n/* nodeRow \u5185:.input \u7684 width:100% \u4F1A\u8BA9\u884C\u6EA2\u51FA\u5361\u7247,\u5FC5\u987B\u8D62\u8FC7\u5B83(Nexus \u540C\u503C) */\n.asone-panel .lm-section .editor .nodeRow .nodeProvider {\n  width: 150px;\n  flex: 0 0 150px;\n}\n.asone-panel .lm-section .editor .nodeRow .nodeSelect {\n  width: auto;\n  flex: 1 1 0;\n  min-width: 0;\n}\n\n/* groupIdx \u5B57\u8272 var(--text-soft)(\u901A\u7528\u5757\u662F --text) */\n.asone-panel .lm-section .editor .groupIdx {\n  color: var(--text);\n}\n\n/* addModelButton:\u65B9\u89D2 4px / \u8FB9\u6846 var(--border) / \u5E95\u900F\u660E / hover \u5E95\u8272 var(--dsw-alias-interactive-bg-hover, #1f2732) */\n.asone-panel .lm-section .editor .addModelButton {\n  border: 1px solid var(--border);\n  border-radius: 4px;\n  height: 28px;\n  padding: 0 10px;\n  color: var(--text);\n  font: inherit;\n  cursor: pointer;\n  background: none;\n  align-self: flex-start;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  font-size: 12px;\n  line-height: 18px;\n}\n.asone-panel .lm-section .editor .addModelButton:hover:not(:disabled) {\n  background: var(--surface-hover);\n  border-color: var(--border);\n}\n.asone-panel .lm-section .editor .addModelButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n/* iconButton:\u5B57\u8272 var(--dim) / hover \u5E95\u8272 var(--dsw-alias-interactive-bg-hover, #1f2732) + \u5B57\u8272 var(--text-soft);\u5371\u9669\u6863hover \u5B57var(--bad) */\n.asone-panel .lm-section .editor .iconButton {\n  color: var(--dim);\n  cursor: pointer;\n  border: none;\n  background: none;\n  border-radius: 4px;\n  padding: 2px 6px;\n  font-size: 12px;\n  flex-shrink: 0;\n}\n.asone-panel .lm-section .editor .iconButton:hover:not(:disabled) {\n  background: var(--surface-hover);\n  color: var(--text);\n}\n.asone-panel .lm-section .editor .iconButtonDanger:hover:not(:disabled) {\n  color: var(--bad);\n}\n.asone-panel .lm-section .editor .iconButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n/* primaryButton / secondaryButton:Nexus 36px / \u5706\u89D2 6px / \u5185\u8DDD 0 14px /\n   \u5B5714px \u884C\u9AD8 22px;\u4E3B\u6309\u94AE\u5E95\u8272 var(--dsw-alias-button-info-fill, #2f4d6b) hover var(--dsw-alias-button-info-hover, var(--dsw-alias-button-info-hover, #24425f)),\u526F\u6309\u94AE\u900F\u660E\u5EA6 + \u8FB9\u6846 var(--border) */\n.asone-panel .lm-section .editor .primaryButton,\n.asone-panel .lm-section .editor .secondaryButton {\n  box-sizing: border-box;\n  height: 36px;\n  padding: 0 14px;\n  border-radius: 6px;\n  font: inherit;\n  cursor: pointer;\n  display: inline-flex;\n  justify-content: center;\n  align-items: center;\n  gap: 4px;\n  font-size: 14px;\n  line-height: 22px;\n}\n.asone-panel .lm-section .editor .primaryButton {\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\n  border: none;\n  color: var(--text);\n}\n.asone-panel .lm-section .editor .primaryButton:hover:not(:disabled) {\n  background: var(--dsw-alias-button-info-hover, #24425f);\n}\n.asone-panel .lm-section .editor .secondaryButton {\n  border: 1px solid var(--border);\n  color: var(--text);\n  background: none;\n}\n.asone-panel .lm-section .editor .secondaryButton:hover:not(:disabled) {\n  background: var(--surface-hover);\n  border-color: var(--border);\n}\n.asone-panel .lm-section .editor .primaryButton:disabled,\n.asone-panel .lm-section .editor .secondaryButton:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n/* ===========================================================================\n   \u5176\u4ED6\u4F9B\u5E94\u5546\u9875(ProvidersPage):\u9010\u6761\u7167\u642C Nexus panel/web/src/Providers.vue \u7684   \\3c style scoped>(L1005-1261)\u3002\u7C7B\u540D\u5168\u90E8\u52A0 .pv- \u524D\u7F00\u4EE5\u514D\u4E0E As One \u73B0\u6709\u6837\u5F0F\u51B2\u7A81,\n   \u989C\u8272 / \u5C3A\u5BF8 / \u95F4\u8DDD / \u5706\u89D2 / \u8FB9\u6846 / \u5B57\u91CD\u9010\u5B57\u4FDD\u7559(\u6697\u8272\u57FA\u8C03\u4E0E\u73B0\u6709\u9875\u9762\u4E00\u81F4)\u3002   =========================================================================== */\n\n/* \u5E03\u5C40\u5BF9\u7167 dsh \u7684\u4F9B\u5E94\u5546\u5361\u7247:\u5916\u5C42\u4E00\u884C\u5934 + \u5185\u5D4C\u7070\u9762\u677F(\u5B57\u6BB5 / \u6A21\u578B\u76EE\u5F55) */\n.asone-panel .pv-section {\n  max-width: 720px;\n  color: var(--text-soft);\n  flex-direction: column;\n  gap: 12px;\n  display: flex;\n}\n.asone-panel .pv-title { color: var(--text); margin: 0; font-size: 16px; font-weight: 500; line-height: 24px; }\n.asone-panel .pv-intro { color: var(--text-soft); margin: 0; font-size: 14px; line-height: 22px; }\n.asone-panel .pv-err { color: var(--bad); font-size: 12px; line-height: 18px; }\n.asone-panel .pv-savedNotice { color: var(--ok); font-size: 12px; line-height: 18px; margin: 0; }\n/* As One \u65B0\u589E:API \u5BC6\u94A5\u8F93\u5165\u6846\u4E0B\u9762\u90A3\u884C\u300C\u5BC6\u94A5\u7531\u51ED\u636E\u5C42\u7BA1\u7406\u300D\u8BF4\u660E(\u5951\u7EA6\u65E0\u5199\u5BC6\u94A5\u63A5\u53E3)\u3002*/\n.asone-panel .pv-hint { color: var(--text-soft); margin: 0; font-size: 12px; line-height: 18px; }\n\n/* \u5361\u7247 */\n.asone-panel .pv-rows { flex-direction: column; gap: 10px; margin: 12px 0 0; padding: 0; list-style: none; display: flex; }\n.asone-panel .pv-rowCard {\n  border: 1px solid var(--border);\n  background: var(--surface);\n  border-radius: 10px;\n  flex-direction: column;\n  gap: 10px;\n  padding: 12px 14px;\n  display: flex;\n}\n.asone-panel .pv-rowHead { align-items: center; gap: 8px; display: flex; }\n.asone-panel .pv-rowName { color: var(--text); font-size: 14px; font-weight: 500; line-height: 22px; }\n.asone-panel .pv-credentialDot { flex: none; width: 8px; height: 8px; border-radius: 50%; display: inline-block; }\n.asone-panel .pv-dotOk { background: var(--ok); }\n.asone-panel .pv-dotMissing { background: var(--bad); }\n.asone-panel .pv-rowActions { align-items: center; gap: 8px; margin-left: auto; display: inline-flex; }\n.asone-panel .pv-cardFooter { justify-content: flex-end; gap: 8px; }\n.asone-panel .pv-rowBtn {\n  border-radius: 6px;\n  height: 28px;\n  padding: 0 12px;\n  font-size: 12px;\n  line-height: 18px;\n  cursor: pointer;\n  border: 1px solid var(--border);\n  background: transparent;\n  color: var(--text);\n}\n.asone-panel .pv-rowBtn:hover:not(:disabled) { background: var(--surface-hover); }\n.asone-panel .pv-rowBtn.pv-rowBtnDanger { color: var(--bad); }\n.asone-panel .pv-rowBtn:disabled { opacity: 0.4; cursor: default; }\n\n/* \u5185\u5C42\u9762\u677F */\n.asone-panel .pv-panel {\n  background: var(--surface-deep);\n  border: 1px solid var(--border);\n  border-radius: 8px;\n  padding: 12px;\n  flex-direction: column;\n  gap: 6px;\n  display: flex;\n}\n.asone-panel .pv-panelTitle { color: var(--text); font-size: 13px; font-weight: 500; line-height: 20px; margin-bottom: 2px; }\n.asone-panel .pv-fieldLabel { color: var(--text); font-size: 12px; font-weight: 500; line-height: 18px; margin-top: 4px; }\n\n/* \u6A21\u578B\u76EE\u5F55 */\n.asone-panel .pv-catalogSection { flex-direction: column; gap: 6px; display: flex; }\n.asone-panel .pv-catalogTitle { color: var(--text); font-size: 12px; font-weight: 500; line-height: 18px; }\n.asone-panel .pv-modelListHead { justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 2px; display: flex; }\n.asone-panel .pv-modelCatalogMeta, .asone-panel .pv-modelEmpty { color: var(--text-soft); margin: 0; font-size: 12px; line-height: 18px; }\n.asone-panel .pv-headActions { align-items: center; gap: 2px; display: inline-flex; }\n.asone-panel .pv-modelList { flex-direction: column; gap: 8px; display: flex; }\n.asone-panel .pv-modelEntry {\n  border: 1px solid var(--border);\n  background: var(--surface);\n  border-radius: 8px;\n  padding: 8px;\n  gap: 6px;\n  display: flex;\n  flex-direction: column;\n}\n.asone-panel .pv-modelRow {\n  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;\n  align-items: center;\n  gap: 6px;\n  display: grid;\n}\n.asone-panel .pv-modelAdvanced { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 2px 2px 0; display: grid; }\n.asone-panel .pv-modelField { flex-direction: column; gap: 4px; min-width: 0; display: flex; }\n.asone-panel .pv-modelInputTypes { border: none; grid-column: 1 / -1; min-width: 0; margin: 0; padding: 0; }\n.asone-panel .pv-modelInputTypes legend { margin-bottom: 4px; padding: 0; }\n.asone-panel .pv-modelInputChoices { flex-wrap: wrap; align-items: center; gap: 16px; min-height: 32px; display: flex; }\n.asone-panel .pv-modelFieldLabel { color: var(--text); font-size: 12px; line-height: 18px; }\n.asone-panel .pv-modelEmpty { border: 1px dashed var(--border); border-radius: 8px; text-align: center; padding: 12px; }\n\n/* \u8F93\u5165 */\n.asone-panel .pv-input {\n  box-sizing: border-box;\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  width: 100%;\n  height: 32px;\n  font: inherit;\n  background: var(--bg-deep);\n  color: var(--text);\n  padding: 0 10px;\n  font-size: 14px;\n  line-height: 22px;\n}\n.asone-panel .pv-input::placeholder { color: var(--dim); }\n.asone-panel .pv-input:focus { border-color: var(--accent); outline: none; }\n.asone-panel .pv-input:disabled { opacity: 0.6; cursor: default; }\n.asone-panel .pv-selectInput { cursor: pointer; max-width: 280px; }\n\n/* \u6309\u94AE */\n.asone-panel .pv-primaryButton, .asone-panel .pv-secondaryButton {\n  box-sizing: border-box;\n  border-radius: 6px;\n  height: 36px;\n  font: inherit;\n  cursor: pointer;\n  border: none;\n  justify-content: center;\n  align-items: center;\n  gap: 4px;\n  padding: 0 14px;\n  font-size: 14px;\n  line-height: 22px;\n  display: inline-flex;\n}\n.asone-panel .pv-primaryButton { background: var(--dsw-alias-button-info-fill, #2f4d6b); color: var(--on-accent); }\n.asone-panel .pv-primaryButton:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover, #24425f); }\n.asone-panel .pv-secondaryButton { border: 1px solid var(--border); color: var(--text); background: none; }\n.asone-panel .pv-secondaryButton:hover:not(:disabled) { background: var(--surface-hover); }\n.asone-panel .pv-primaryButton:disabled, .asone-panel .pv-secondaryButton:disabled { opacity: 0.4; cursor: default; }\n\n/* \u300C\u6DFB\u52A0\u300D\u6309\u94AE = \u4E00\u6574\u5757\u865A\u7EBF\u5361\u7247(\u4E0E LogicalModels.vue \u540C\u4E00\u5957\u6837\u5F0F,\u5BF9\u7167 dsh \u7684\u6DFB\u52A0\u5361):\n   \u9AD8\u5EA6 54px / \u5706\u89D2 10px / \u5E95\u8272\u4E0E.pv-rowCard \u4E00\u81F4\u2192\u4E0E\u4E0A\u9762\u7684\u5361\u7247\u4E00\u6837\u5927\u3002*/\n.asone-panel .pv-addButton {\n  box-sizing: border-box;\n  flex: none;\n  width: 100%;\n  border: 1px dashed var(--border);\n  border-radius: 10px;\n  background: var(--surface);\n  height: 54px;\n  margin-top: 10px; /* \u4E0E .pv-rows \u7684\u884C\u8DDD\u4E00\u81F4*/\n  color: var(--text);\n  font: inherit;\n  cursor: pointer;\n  justify-content: center;\n  align-items: center;\n  gap: 6px;\n  padding: 0 14px;\n  font-size: 14px;\n  line-height: 22px;\n  display: flex;\n}\n.asone-panel .pv-addButton:hover:not(:disabled) { background: var(--surface-hover); border-color: var(--border); }\n.asone-panel .pv-addButton:disabled { opacity: 0.4; cursor: default; }\n.asone-panel .pv-linkButton {\n  border-radius: 4px;\n  height: 28px;\n  color: var(--text);\n  cursor: pointer;\n  background: none;\n  border: none;\n  align-items: center;\n  padding: 0 8px;\n  font-size: 12px;\n  line-height: 18px;\n  display: inline-flex;\n}\n.asone-panel .pv-linkButton:hover:not(:disabled) { background: var(--surface-hover); color: var(--text); }\n.asone-panel .pv-linkButton:disabled { opacity: 0.4; cursor: default; }\n.asone-panel .pv-addModelButton {\n  box-sizing: border-box;\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  height: 30px;\n  color: var(--text);\n  font: inherit;\n  cursor: pointer;\n  background: none;\n  align-self: flex-start;\n  align-items: center;\n  gap: 4px;\n  padding: 0 10px;\n  font-size: 12px;\n  line-height: 18px;\n  display: inline-flex;\n}\n.asone-panel .pv-addModelButton:hover:not(:disabled) { background: var(--surface-hover); }\n.asone-panel .pv-addModelButton:disabled { opacity: 0.4; cursor: default; }\n\n.asone-panel .pv-iconButton {\n  background: none;\n  border: none;\n  color: var(--dim);\n  cursor: pointer;\n  padding: 2px 6px;\n  font-size: 12px;\n  flex-shrink: 0;\n  border-radius: 4px;\n}\n.asone-panel .pv-iconButton:hover:not(:disabled) { background: var(--surface-hover); color: var(--text); }\n.asone-panel .pv-iconButton.pv-iconButtonDanger:hover:not(:disabled) { color: var(--bad); }\n.asone-panel .pv-choice { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }\n/* Nexus \u539F\u4E3A\u5168\u5C40 `input[type="checkbox"]`;\u8FD9\u91CC\u6309 .pv- \u4F5C\u7528\u57DF\u6536\u7A84\u5230\u672C\u9875\u4E24\u4E2A\u52FE\u9009\u4F4D\n   (\u8F93\u5165\u7C7B\u578B / \u9009\u62E9\u5668\u5019\u9009\u9879),\u907F\u514D\u5F71\u54CD\u5176\u4ED6\u9875\u9762\u3002*/\n.asone-panel .pv-choice input[type="checkbox"],\n.asone-panel .pv-candidateLabel input[type="checkbox"] { accent-color: var(--accent); }\n\n/* \u9009\u62E9\u5668\u5F39\u7A97*/\n.asone-panel .pv-mask {\n  position: fixed;\n  inset: 0;\n  background: var(--scrim);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 50;\n}\n.asone-panel .pv-dialog {\n  width: 520px;\n  max-width: calc(100vw - 32px);\n  max-height: calc(100vh - 64px);\n  overflow: auto;\n  background: var(--surface);\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  padding: 16px 18px;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n.asone-panel .pv-dialogTitle { margin: 0; font-size: 15px; font-weight: 500; color: var(--text-soft); }\n.asone-panel .pv-dialogDesc { margin: 0; font-size: 13px; color: var(--text-soft); }\n.asone-panel .pv-candidateToolbar { align-items: center; gap: 8px; margin-bottom: 6px; display: flex; }\n.asone-panel .pv-candidateSearch { flex: 240px; min-width: 0; }\n.asone-panel .pv-candidateList {\n  flex-direction: column;\n  gap: 2px;\n  max-height: 320px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n  display: flex;\n  overflow-y: auto;\n}\n.asone-panel .pv-candidate { border-radius: 6px; }\n.asone-panel .pv-candidate:hover { background: var(--surface-hover); }\n.asone-panel .pv-candidateLabel { cursor: pointer; align-items: center; gap: 8px; padding: 6px 8px; display: flex; }\n.asone-panel .pv-candidateId {\n  min-width: 0;\n  font-family: ui-monospace, Consolas, monospace;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  flex: auto;\n  font-size: 13px;\n  overflow: hidden;\n}\n.asone-panel .pv-candidateEmpty { color: var(--text-soft); text-align: center; margin: 24px 0; font-size: 13px; line-height: 20px; }\n.asone-panel .pv-dialogFooter { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }\n\n/* ===========================================================================\n    \u8BBE\u7F6E\u9875\u8FFD\u52A0\u6837\u5F0F(Nexus Settings.vue 1:1 \u590D\u523B\u914D\u5957;\u53EA\u8FFD\u52A0,\u4E0D\u52A8\u65E2\u6709\u89C4\u5219)\n    =========================================================================== */\n\n/* \u9875\u5934 h1(Nexus .ui-page-title) */\n.asone-panel .ui-page-title {\n  margin: 0 0 4px;\n  font-size: 18px;\n  font-weight: 600;\n  color: var(--text);\n}\n\n/* \u63A7\u4EF6(Nexus .ui-input / .ui-select) */\n.asone-panel .ui-input,\n.asone-panel .ui-select {\n  width: 100%;\n  box-sizing: border-box;\n  height: 32px;\n  padding: 0 10px;\n  font: inherit;\n  font-size: 13px;\n  color: var(--text);\n  background: var(--bg);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n}\n.asone-panel .ui-input:focus,\n.asone-panel .ui-select:focus {\n  outline: none;\n  border-color: var(--accent);\n}\n.asone-panel .ui-input[type="number"] {\n  font-variant-numeric: tabular-nums;\n}\n.asone-panel .ui-select {\n  cursor: pointer;\n}\n.asone-panel .ui-check input[type="checkbox"] {\n  accent-color: var(--accent);\n  width: auto;\n}\n\n/* \u72EC\u7ACB\u6309\u94AE(Nexus \u88F8\u7C7B .ui-btn-ghost / .ui-btn-danger / .ui-btn-primary) */\n.asone-panel .ui-btn-ghost {\n  appearance: none;\n  font: inherit;\n  color: var(--text);\n  background: none;\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  height: 30px;\n  padding: 0 12px;\n  font-size: 12.5px;\n  cursor: pointer;\n}\n.asone-panel .ui-btn-ghost:hover:not(:disabled) {\n  border-color: var(--accent);\n  color: var(--text);\n}\n.asone-panel .ui-btn-ghost:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.asone-panel .ui-btn-danger {\n  appearance: none;\n  font: inherit;\n  color: var(--bad);\n  background: none;\n  border: 1px solid transparent;\n  border-radius: 6px;\n  height: 30px;\n  padding: 0 10px;\n  font-size: 12px;\n  cursor: pointer;\n}\n.asone-panel .ui-btn-danger:hover:not(:disabled) {\n  background: var(--surface-bad);\n}\n.asone-panel .ui-btn-danger:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n.asone-panel .ui-btn-primary {\n  appearance: none;\n  font: inherit;\n  color: var(--on-accent);\n  background: var(--accent);\n  border: 1px solid var(--accent);\n  border-radius: 6px;\n  height: 30px;\n  padding: 0 12px;\n  font-size: 12.5px;\n  cursor: pointer;\n}\n.asone-panel .ui-btn-primary:hover:not(:disabled) {\n  filter: brightness(1.12);\n}\n.asone-panel .ui-btn-primary:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n}\n\n/* \u9000\u907F\u66F2\u7EBF(Nexus .ui-chart-wrap / .ui-chart) */\n.asone-panel .ui-chart-wrap {\n  margin-top: 10px;\n}\n.asone-panel .ui-chart {\n  display: block;\n  width: 100%;\n}\n\n/* \u5361\u7247\u5934:h2 \u4E0E .ui-card-sub \u76F8\u90BB\u6392\u5E03(\u8FD8\u539F Nexus \u7684 flex \u8D77\u70B9\u5E03\u5C40) */\n.asone-panel .ui-card-head {\n  justify-content: flex-start;\n}\n\n/* <960px:\u8BBE\u7F6E\u9875\u65E0 nav(2026-10-25 m14922 \u79FB\u9664\u4FA7\u680F),\u5361\u7247\u5934\u7684\u5C0F\u5C4F\u89C4\u5219\u4FDD\u7559 */\n@media (max-width: 959px) {\n  .asone-panel .ui-layout {\n    flex-direction: column;\n    gap: 12px;\n  }\n  .asone-panel .ui-card {\n    scroll-margin-top: 90px;\n  }\n}\n\n/* ===========================================================================\n   SenseNova \u4E13\u9875(SenseNovaPage)\u4E25\u683C\u590D\u523B Nexus SenseNovaPanel.vue \u7684scoped CSS\u3002   \u26A0\uFE0F \u5168\u90E8\u52A0 `.sn-` \u524D\u7F00:.row / .bar / .bar-fill / .pill / .grid \u8FD9\u4E9B\u540D\u5B57\u5728   styles.css \u91CC*\u5DF2\u6709\u5168\u5C40\u5B9A\u4E49**(\u72B6\u6001\u6761\u3001ModelTable\u3001\u6E20\u9053\u9875\u5171\u7528),\u88F8\u7528\u4F1A\u4E92\u76F8\u6C61\u67D3\n   \u524D\u7F00\u7248\u9010\u5B57\u642C\u8FD0 Nexus \u7684\u989C\u8272\u95F4\u8DDD/\u5706\u89D2,\u9875\u9762\u4E0A\u53EA\u8BA4\u524D\u7F00\u7248\u3002   =========================================================================== */\n\n/* \u8D26\u53F7\u5361\u5934(\u4E0E\u6E20\u9053\u9875 ProviderCard \u5171\u7528\u7684\u5168\u5C40 .acct-head / .who / .badges \u540C\u503C,\u4E0D\u91CD\u590D\u5B9A\u4E49) */\n\n/* \u79EF\u5206\u6C60\u5757:\u4E24\u4E2A\u6C60*\u5E76\u6392**\u3002\u5217\u5BBD\u523B\u610F\u538B\u7A84170px \u8D70\u2014\u2014\u4E4B\u524D\u7528210px,420px \u7684\u8D26\u53F7\u5361\u91CC   \u653E\u4E0D\u4E0B\u4E24\u4E2A\u81EA\u52A8\u9000\u5316\u6210\u4E0A\u4E0B\u5806\u53E0,\u800C\u300C\u901A\u7528 vs \u4E13\u5C5E\u300D\u6700\u8BE5\u505A\u7684\u662F\u6A2A\u5411\u6446\u5728\u4E00\u8D77\u5BF9\u6BD4\u3002   \u26A0\uFE0F `gap: 12px` \u662F\u6309\u53C2\u8003\u56FE\u91CF\u51FA\u6765\u7684:\u5B9E\u6D4B\u4E24\u6C60\u5916\u6CBF\u76F8\u8DDD 12px,\u539F\u503C10px \u4F1A\u8BA9\u7D2B\u6A59\u4E24\u5757\n   \u5E95\u8272\u51E0\u4E4E\u8D34\u4E0A\u3002*/\n.asone-panel .sn-pools {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\n  gap: 12px;\n  margin: 12px 0 0;\n}\n/* flex \u5217 + \u7B49\u9AD8(\u7F51\u683C stretch):\u8BA9\u300C\u6D3B\u52A8\u56FA\u5B9A\u79EF\u5206\u300D\u80FD\u8D34\u4F4F\u5361\u7247\u5E95\u90E8,\n   \u4E24\u4E2A\u6C60\u56E0\u6B64\u5728\u540C\u4E00\u6C34\u5E73\u7EBF\u4E0A\u6536\u5C3E\u3002*/\n.asone-panel .sn-pool {\n  position: relative;\n  overflow: hidden; /* \u8BA9\u9876\u90E8\u8272\u6761\u8D34\u5408\u5706\u89D2*/\n  display: flex;\n  flex-direction: column;\n  border: 1px solid var(--border);\n  border-radius: 10px;\n  padding: 12px 12px 10px;\n  background: var(--surface-deep);\n}\n/* \u9876\u90E8\u8272\u6761:\u6BCF\u5F20\u6C60\u5361\u9876\u7AEF\u90A3\u9053\u5F69\u8272\u7EBF\u3002\u901A\u7528\u6C60\u53D6**\u7D2B**(violet-500/400),\u4E13\u5C5E\u6C60\u53D6\u6A59   (orange-500/400)\u3002\u26A0\uFE00\u8FD9\u4E24\u7EC4\u503C\u662F\u4E3A\u6DF1\u8272\u5E95\u9009\u7684:\u53C2\u8003\u56FE\u662F\u6D45\u5E95\u540C\u4E00\u7EC4\u8272\u76F4\u63A5\u642C\u5230\n   `var(--surface-deep)` \u4E0A\u4F1A\u7CCA\u6210\u4E00\u7248\u2014\u2014\u4EAE\u6863\u964D\u4E00\u6863\u3001\u9971\u548C\u5EA6\u7565\u964D\u624D\u7ACB\u5F97\u4F4F\u3002*/\n.asone-panel .sn-pool-accent { position: absolute; inset: 0 0 auto 0; height: 2px; }\n.asone-panel .sn-pool.general .sn-pool-accent { background: var(--pool-grad-general); }\n.asone-panel .sn-pool.special .sn-pool-accent { background: var(--pool-grad-special); }\n\n.asone-panel .sn-pool-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }\n.asone-panel .sn-pool-head strong { color: var(--text); font-size: 12px; }\n/* \u4E13\u5C5E\u6807\u7B7E\u6539\u6210\u5C0F\u5706\u70B9:\u901A\u7528=\u7D2B,\u4E13\u5C5E=\u6A59(\u60AC\u505C\u6709 tooltip \u8BF4\u660E\u662F\u54EA\u4E00\u79CD) */\n.asone-panel .sn-pdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }\n.asone-panel .sn-pool.general .sn-pdot { background: var(--pool-general-soft); box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1, #141b26); }\n.asone-panel .sn-pool.special .sn-pdot { background: var(--pool-special-soft); box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1, #141b26); }\n\n/* \u884C\u5DE6\u6807\u7B7E / \u53F3\u4FA7\u300C\u6570\u503C + \u767E\u5206\u6BD4\u300D\u540C\u884C,\u628A\u6570\u503C\u6536\u8FDB\u6807\u7B7E\u884C,\u7701\u6389\u4E00\u6574\u884C\u9AD8\u5EA6)\u3002   `margin` \u538B\u5230 8px/4px:\u4F59\u91CF\u6761\u8981\u8D34\u7740\u5B83\u4E0A\u65B9\u7684\u6807\u7B7E\u884C\u4E2D\u95F4\u4E0D\u7559\u7A7A\u6863\u3002*/\n.asone-panel .sn-row {\n  display: flex;\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 6px;\n  font-size: 11px;\n  color: var(--text-soft);\n  margin: 8px 0 4px;\n}\n.asone-panel .sn-row-label { flex: none; }\n/* \u53F3\u4FA7\u6570\u503C:\u6570\u5B57\u6BD4\u6807\u7B7E\u5927\u4E00\u53F7\u3001\u767D\u4E00\u6863 \u2014\u2014 \u626B\u89C6\u65F6\u5148\u843D\u5728\u6570\u5B57\u4E0A\u3002   \u767E\u5206\u6BD4\u8DDF\u5728\u540E\u9762\u3001\u5C0F\u4E00\u53F7\u4E14\u538B\u6697,\u8BFB\u4F5C\u6570\u5B57\u7684\u6CE8\u89E3\u800C\u4E0D\u662F\u5E76\u5217\u7684\u7B2C\u4E8C\u9879\u3002*/\n.asone-panel .sn-row-val { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }\n.asone-panel .sn-row-val b { font-size: 15px; color: var(--text); font-variant-numeric: tabular-nums; font-weight: 600; }\n.asone-panel .sn-row-val .sn-pct { color: var(--text); font-size: 11px; font-variant-numeric: tabular-nums; }\n/* \u7B2C\u4E8C\u4E2A\u7A97\u53E3(\u672C\u5468\u4F59\u989D)\u4E0E 5h \u4E4B\u95F4\u7528\u865A\u7EBF\u9694\u5F00:\u4E24\u8005\u662F\u540C\u4E00\u4E2A\u6C60\u7684\u4E24\u4E2A\u7A97\u53E3\n   \u9694\u4E00\u6761\u7EBF\u6BD4\u591A\u7559\u767D\u66F4\u80FD\u8BF4\u660E\u300C\u4E0A\u9762\u90A3\u4E2A\u662F 5h\u3001\u8FD9\u4E2A\u662F 7d\u300D\u3002*/\n.asone-panel .sn-row.split { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }\n.asone-panel .sn-bar { height: 5px; background: var(--surface-deep); border-radius: 999px; overflow: hidden; }\n.asone-panel .sn-bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }\n.asone-panel .sn-pool.general .sn-bar-fill { background: var(--pool-grad-general); }\n.asone-panel .sn-pool.special .sn-bar-fill { background: var(--pool-grad-special); }\n/* \u51B7\u5374\u4E2D:\u8FDB\u5EA6\u6761\u7EDF\u4E00\u8F6C\u7070 \u2014\u2014 \u989C\u8272\u6B64\u65F6\u53EA\u8868\u793A\u300C\u8FD9\u4E2A\u6C60\u5728\u4F11\u606F\u300D,\u4E0D\u518D\u8868\u793A\u4F59\u91CF\u3002*/\n.asone-panel .sn-pool.cooling .sn-bar-fill { background: var(--dim); }\n\n/* \u6C60\u5E95\u69FD\u4F4D(**\u4E24\u4E2A\u6C60\u6545\u610F\u4E0D\u4E00\u6837*)\u3002   `margin-top:auto` \u662F\u8FD9\u91CC\u7684\u5173\u952E:\u5B83\u628A\u69FD\u4F4D\u9489\u5728\u5361\u7247\u5E95\u90E8,\u4E24\u4E2A\u6C60\u56E0\u6B64\u7B49\u9AD8\u6536\u5C3E\u3002   \u26A0\uFE0F \u4E24\u4E2A\u69FD\u4F4D\u5FC5\u987B**\u5360\u4E00\u6837\u7684\u9AD8\u5EA6**,\u5426\u5219\u4E24\u4E2A\u6C60\u7B49\u9AD8\u3001\u5E95\u8FB9\u5BF9\u9F50\u4E86,\u5185\u90E8\u5185\u5BB9\u5374\u4E00\u9AD8\u4E00\u4F4E\n   \u6A2A\u5411\u626B\u89C6\u4ECD\u4F1A\u89C9\u5F97\u300C\u53F3\u8FB9\u5C11\u4E00\u5757\u300D\u3002\u6240\u4EE5\u4E24\u6761\u90FD\u9489\u4E86\u540C\u6837\u7684\u9AD8\u5EA6(30px)\u4E0E\u5185\u8FB9\u8DDD\u3002   \u26A0\uFE0F \u69FD\u4F4D\u662F*\u7EAF\u6587\u5B57*:\u4E0D\u7ED9\u5E95\u8272\u3001\u4E0D\u7ED9\u8FB9\u6846\u3001\u4E0D\u7ED9\u5C0F\u5706\u70B9(\u6309\u53C2\u8003\u56FE\u5B9E\u6D4B,\u539F\u5148\u90A3\u7EC4\n   `var(--dim)` + `var(--border)` \u63CF\u8FB9\u5728\u6574\u5F20\u622A\u56FE\u91CC\u5404\u51FA\u73B00 \u6B21\u3002*/\n.asone-panel .sn-grant,\n.asone-panel .sn-reset-row {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  min-height: 30px;\n  box-sizing: border-box;\n  margin-top: auto; /* \u8D34\u4F4F\u5361\u7247\u5E95\u90E8 \u2192\u4E24\u6C60\u5E95\u8FB9\u5BF9\u9F50 */\n  padding: 0 2px;\n  border-radius: 8px;\n  font-size: 11px;\n  color: var(--text-soft);\n}\n.asone-panel .sn-grant b { color: var(--text); font-size: 13px; font-variant-numeric: tabular-nums; }\n.asone-panel .sn-g-label { flex: 1 1 auto; }\n/* \u6CA1\u6709\u6D3B\u52A8\u53D1\u653E:\u663E\u793A 5h / 7d \u7684\u91CD\u7F6E\u65F6\u523B\u7EAF\u6587\u5B57\u4E0D\u7ED9\u5E95\u8272\u4E5F\u4E0D\u7ED9\u8FB9\u6846\u2014\u2014\u7ED9\u5B83\u52A0\u5E95\u8272   \u53CD\u800C\u4F1A\u8BA9\u4EBA\u4EE5\u4E3A Flash-Lite \u6C60\u4E5F\u6709\u6D3B\u52A8\u79EF\u5206\u3002*/\n.asone-panel .sn-reset-row { justify-content: space-between; padding: 0 2px; }\n.asone-panel .sn-r-label { flex: none; }\n.asone-panel .sn-r-val { color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }\n\n/* \u8D26\u53F7\u7BA1\u7406\u8868(\u6A21\u578B\u76EE\u5F55\u90A3\u5F20\u8868\u7684\u5217\u5BBD / \u8F93\u5165\u6846 / \u56FE\u50CF\u5217\u7EFF\u70B9\u90FD\u5728 ModelTable \u91CC) */\n.asone-panel .sn-grid { width: 100%; border-collapse: collapse; margin: 8px 0; }\n.asone-panel .sn-grid th,\n.asone-panel .sn-grid td { border-bottom: 1px solid var(--border); padding: 7px 6px; font-size: 13px; text-align: left; }\n.asone-panel .sn-grid th { background: var(--surface-deep); color: var(--text); font-weight: 600; }\n.asone-panel .sn-grid th.num,\n.asone-panel .sn-grid td.num { text-align: right; font-variant-numeric: tabular-nums; }\n.asone-panel .sn-grid td.sub { color: var(--text-soft); }\n/* \u8D26\u53F7\u7BA1\u7406\u8868\u91CC\u7684\u80F6\u56CA\u5DF2\u4FDD\u5B58/ \u6709\u5BC6\u94A5\u3002\u548C `.chan-badge` \u662F\u540C\u4E00\u65CF\u5F62\u72B6\u4F46\u90A3\u679A\u662F\u89D2\u6807\u3002   \u8FD9\u679A\u5728\u8868\u683C\u5355\u5143\u683C\u91CC\u5B57\u53F7\u5DEE\u534A\u53F7\u6240\u4EE5\u5404\u7559\u5404\u7684\u3002*/\n.asone-panel .sn-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--surface-deep); color: var(--text-soft); }\n.asone-panel .sn-pill.ok { background: var(--surface-ok); color: var(--ok); }\n.asone-panel .sn-pill.na { background: var(--surface-warn); color: var(--warn); }\n\n/* \u8D26\u53F7\u7BA1\u7406\u8868:\u64CD\u4F5C\u5217\u6309\u94AE(\u767B\u5F55/\u91CD\u6293 key/\u5220\u9664) */\n.asone-panel .sn-ops { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }\n.asone-panel .sn-ops .btn-sm { padding: 2px 9px; }\n.asone-panel .sn-ops .btn-sm.danger { background: var(--surface-bad); }\n.asone-panel .sn-ops .btn-sm.danger:hover:not(:disabled) { border-color: var(--bad); }\n\n/* \u8D26\u53F7\u7BA1\u7406\u8868:\u767B\u5F55\u884C(\u5BC6\u7801\u8F93\u5165 + \u767B\u5F55\u5E76\u6293 key/\u53EA\u4FDD\u5B58\u5BC6\u7801) */\n.asone-panel .sn-login { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }\n.asone-panel .sn-login input[type="password"],\n.asone-panel .sn-add input {\n  font: inherit;\n  color: var(--text, var(--text));\n  background: var(--surface);\n  border: 1px solid var(--border);\n  border-radius: 6px;\n  padding: 5px 10px;\n  min-width: 180px;\n}\n.asone-panel .sn-login input[type="password"]:focus,\n.asone-panel .sn-add input:focus { border-color: var(--accent, #4d6bfe); outline: none; }\n.asone-panel .sn-login .chan-hint { margin: 0; flex: 1 1 100%; }\n\n/* \u8D26\u53F7\u7BA1\u7406\u8868:\u6DFB\u52A0\u8868\u5355\u884C */\n.asone-panel .sn-add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 2px; }\n.asone-panel .sn-add .chan-hint { margin: 0; flex: 1 1 100%; }\n\n/* \u2500\u2500 \u8D26\u53F7\u7BA1\u7406\u9875(Nexus ProviderAccounts.vue \u7684 1:1 \u590D\u523B)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n   \u56DB\u5757\u7ED3\u6784:\u81EA\u52A8\u9274\u6743 / \u5DF2\u5165\u6C60\u8D26\u53F7/ \u771F\u5B9E\u6A21\u578B / \u7B7E\u5230\u5237\u65B0\u3002   \u590D\u7528 .grid / .btn / .chan-hint / .chan-banner \u7B49\u65E2\u6709\u7C7B,\u4E0D\u53E6\u9020\u4E00\u5957\u3002*/\n.asone-panel .acct-page { display: flex; flex-direction: column; gap: 6px; }\n.asone-panel .acct-title { margin: 0 0 6px; font-size: 17px; color: var(--text); }\n.asone-panel .acct-h3 { margin: 14px 0 6px; font-size: 13px; color: var(--text); }\n.asone-panel .acct-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\n.asone-panel .acct-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }\n.asone-panel .acct-form input[type="text"],\n.asone-panel .acct-form input[type="password"] {\n  width: 420px; padding: 4px 6px; background: var(--surface); color: var(--text);\n  border: 1px solid var(--border); border-radius: 4px; font-size: 12px;\n}\n.asone-panel .acct-form input::placeholder { color: var(--dim); }\n\n/*\n * \u2500\u2500 \u73BB\u7483:\u4E3B\u9762/\u5361\u7247/\u4E0B\u62C9\u5206\u7EC4\u900F\u51FA\u58C1\u7EB8(dsh-ui-appearance \u7684\u80CC\u666F\u56FE/\u89C6\u9891) \u2500\u2500\n * \u26A0\uFE0F \u9876\u680F\u4E0D\u5728\u540D\u5355\u91CC:2026-11-03 \u7528\u6237\u5B9A\u6848\u300C\u9876\u680F\u8DDF\u968F\u80CC\u666F\u300D\u2014\u2014\u9876\u680F\u8981\u900F\u51FA\u7684\u662F\n * \u58C1\u7EB8\u672C\u8EAB(\u6E05\u6670),\u4E0D\u662F\u5B83\u7684\u78E8\u7802\u7248\u672C;\u78E8\u7802\u7559\u7ED9\u771F\u6B63\u538B\u5728\u58C1\u7EB8\u4E0A\u7684\u5361\u7247\u3002\n */\n.asone-panel .ov-inflight,\n.asone-panel .usage-card,\n.asone-panel .usage-seg,\n.asone-panel .rowCard,\n.asone-panel .depCard,\n.asone-panel .card,\n.asone-panel .panel {\n  backdrop-filter: var(--glass);\n  -webkit-backdrop-filter: var(--glass);\n}\n\n\n\n/* \u2500\u2500 \u8C03\u5EA6\u89C4\u5219:\u6BCF\u4E2A\u6863\u4F4D\u4E00\u5F20\u4E0E\u300C\u5916\u90E8\u6570\u636E\u5237\u65B0\u300D\u540C\u7EA7\u7684\u72EC\u7ACB\u9762\u677F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n   \u539F\u5148\u628A\u4E94\u6863 + \u51B7\u5374 + \u4F1A\u8BDD\u7C98\u6027\u5168\u585E\u8FDB\u4E00\u4E2A\u300C\u8C03\u5EA6\u89C4\u5219\u300D\u603B\u5361,\u73B0\u5728\u62C6\u6210\u5E73\u7EA7\u5361\u7247\u3002\n   \u989C\u8272\u4E00\u5F8B\u8D70 --dsw-alias-* / \u8BED\u4E49\u4EE4\u724C,\u8DDF\u7740 dsh-ui-appearance \u5B9E\u65F6\u8054\u52A8\u3002 */\n.asone-panel .rule-panel .ui-card-head {\n  align-items: center;\n}\n.asone-panel .rule-panel .ui-card-title {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.asone-panel .rule-panel .ui-card-sub {\n  margin: 0;\n}\n.asone-panel .rule-panel .card-hint {\n  padding: 0 0 8px;\n  border-bottom: none;\n  color: var(--text-soft);\n}\n.asone-panel .rule-panel .card-empty {\n  padding: 14px 0;\n  border-bottom: none;\n}\n.asone-panel .rule-panel .badge {\n  font-size: 12px;\n  padding: 2px 10px;\n}\n.asone-panel .rule-panel .blocks-container {\n  padding: 12px 0 0;\n  border-top: 1px solid var(--asec-border);\n}\n.asone-panel .rule-panel .blocks-container + .blocks-container {\n  border-top: 1px solid var(--asec-border);\n}';

// src/client/styles.ts
var STYLE_TAG_ID = "as-one-plugin-styles";
var SHELL_STYLE_TAG_ID = "as-one-plugin-shell-styles";
var SHELL_CSS = `
.asone-panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e) transparent;
}
.asone-panel::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.asone-panel::-webkit-scrollbar-track {
  background: transparent;
}
.asone-panel::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e);
  border-radius: 4px;
}
.asone-panel::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-scrollbar-hover-l2, #4a5d74);
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
var import_jsx_runtime19 = require("react/jsx-runtime");
function AsOnePanelPage() {
  return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("div", { className: "asone-panel", children: /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(App, {}) });
}
function AsOnePanelIcon({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("circle", { cx: "12", cy: "12", r: "9.4", stroke: "currentColor", strokeWidth: "1.6" }),
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("path", { d: "M6.5 12h11", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round" })
      ]
    }
  );
}

// src/client/routeBadge.tsx
var import_react16 = __toESM(require("react"), 1);
var import_jsx_runtime20 = require("react/jsx-runtime");
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
  const [route, setRoute] = import_react16.default.useState(null);
  import_react16.default.useEffect(() => {
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
  return /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)(
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
        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
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
        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { style: { flex: "0 0 auto", opacity: 0.75 }, children: route.in_flight ? "\u6B63\u5728\u4F7F\u7528" : "\u9884\u8BA1\u4F7F\u7528" }),
        route.provider !== "" && /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
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
        /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
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
