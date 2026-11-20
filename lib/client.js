window.__ModuleLoader__.load({
	id: "@bvbhu/as-one",
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

// panel-ui/bridge.ts
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

// panel-ui/api.ts
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
    async getUsageHistory(range, granularity, group, source = "all") {
      return call("getUsageHistory", range, granularity, group, source);
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
    /**
     * ⚠️ **只刷新额度(2026-11-07 拆分语义)**:打开渠道页与点「刷新」都走这条 ——
     * 不拉模型目录(只在展开渠道卡片时才拉)、不签到(只有点「全部签到」才签)。
     */
    async syncChannelQuota(provider, force) {
      return call("syncChannelQuota", provider, force);
    },
    /**
     * ⚠️ **只拉模型目录(2026-11-07 拆分语义)**:展开渠道卡片时才调,不刷额度、不签到。
     */
    async syncChannelCatalog(provider, force) {
      return call("syncChannelCatalog", provider, force);
    },
    /**
     * ⚠️ **批量只刷额度(2026-11-07 拆分语义)**:打开渠道页入口,对所有有额度能力的
     * 渠道各跑一次额度段;不拉模型目录、不签到。
     */
    async syncAllQuota(force) {
      return call("syncAllQuota", force);
    },
    async setChannelModels(provider, models) {
      return call("setChannelModels", provider, models);
    },
    /** 调度排序诊断（只读）：看某个逻辑模型「为什么这样排」。 */
    async getSchedulerPlan(logicalName) {
      return call("getSchedulerPlan", logicalName);
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
    async adoptChannelAccount(provider, username, token, region, extra) {
      return call("adoptChannelAccount", provider, username, token, region, extra);
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
    async sensenovaRefresh(force, parts) {
      return call("sensenovaRefresh", force, parts);
    },
    // SenseNova 登录与账号管理(镜像 /sensenova/login 等路由)
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

// panel-ui/format.ts
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

// panel-ui/App.tsx
var import_react14 = __toESM(require("react"), 1);

// panel-ui/components/NavTabs.tsx
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

// panel-ui/pages/OverviewPage.tsx
var import_react = __toESM(require("react"), 1);

// panel/checkin-chip-format.ts
function n(value) {
  if (value === null || value === void 0) return "\u2014";
  return Math.round(value).toLocaleString("en-US");
}
function formatCheckinCredit(c) {
  if (c.dailyCredit === null) return "";
  const perAccount = c.countExact && c.accounts > 1 && c.perAccountCredit != null;
  if (perAccount) {
    return ` \xB7 \u4ECA\u65E5 ${n(c.perAccountCredit)}\xD7${c.accounts}`;
  }
  return ` \xB7 \u4ECA\u65E5 ${n(c.dailyCredit)}`;
}
function checkinChipText(c) {
  const points = formatCheckinCredit(c);
  return `${checkinSignedText(c)}${points}`;
}
function checkinDone(c) {
  return c.checkedIn !== null && c.checkedIn > 0;
}
function checkinProgress(channels) {
  const eligible = channels.filter((c) => c.supported);
  return { done: eligible.filter(checkinDone).length, total: eligible.length };
}
function checkinSignedText(c) {
  if (c.checkedIn === null) return "\u7B7E\u5230\u672A\u77E5";
  const word = checkinDone(c) ? "\u5DF2\u7B7E" : "\u672A\u7B7E";
  if (c.countExact && c.accounts > 1) return `${c.checkedIn}/${c.accounts} ${word}`;
  return word;
}
function formatCheckinCreditInline(c) {
  if (c.dailyCredit === null) return null;
  if (c.countExact && c.accounts > 1 && c.perAccountCredit != null) {
    return `+${n(c.perAccountCredit)}\xD7${c.accounts}`;
  }
  return `+${n(c.dailyCredit)}`;
}

// panel-ui/pages/OverviewPage.tsx
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
  } else if (c.accounts === 0) {
    state = "\u65E0\u8D26\u53F7";
    cls = "na";
  } else if (c.checkedIn === null) {
    state = "\u672A\u77E5";
    cls = "na";
  } else {
    state = checkinSignedText(c);
    cls = checkinDone(c) ? "ok" : "warn";
  }
  const meta = [];
  const credit = formatCheckinCreditInline(c);
  if (credit !== null) meta.push(`\u4ECA\u65E5 ${credit}`);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-checkinRow", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-checkinName", children: c.label }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `ov-checkinState is-${cls}`, children: state }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ov-checkinMeta", children: meta.join(" \xB7 ") })
  ] });
}
var HIDDEN_CHECKIN_ROWS = /* @__PURE__ */ new Set();
function shownCheckinChannels(channels) {
  return (channels ?? []).filter(
    (c) => !HIDDEN_CHECKIN_ROWS.has(c.provider) && c.accounts > 0
  );
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
  const shownCheckin = import_react.default.useMemo(
    () => shownCheckinChannels(checkin?.channels),
    [checkin]
  );
  const checkinCount = import_react.default.useMemo(() => checkinProgress(shownCheckin), [shownCheckin]);
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
            checkinCount.done,
            "/",
            checkinCount.total
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: "btn",
            disabled: checkinBusy || checkinLoading,
            title: "\u5BF9\u6240\u6709\u652F\u6301\u7B7E\u5230\u7684\u6E20\u9053\u7B7E\u5230(\u542B\u5DF2\u4ECE\u5217\u8868\u9690\u85CF\u7684 WorkBuddy)",
            onClick: () => void claimAll(),
            children: checkinBusy ? "\u7B7E\u5230\u4E2D\u2026" : "\u5168\u90E8\u7B7E\u5230"
          }
        )
      ] }),
      checkinErr ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ov-checkinErr", children: checkinErr }) : null,
      checkinMsg ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ov-checkinMsg", children: checkinMsg }) : null,
      checkinLoading && !checkin ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "na", children: "\u52A0\u8F7D\u7B7E\u5230\u72B6\u6001\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ov-checkinRows", children: [
        shownCheckin.map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CheckinRow, { c }, c.provider)),
        !shownCheckin.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "na", children: "\u6CA1\u6709\u652F\u6301\u7B7E\u5230\u7684\u6E20\u9053" }) : null
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

// panel-ui/pages/models/ModelsPage.tsx
var import_react11 = __toESM(require("react"), 1);

// panel-ui/pages/models/LogicalModelsPage.tsx
var import_react3 = __toESM(require("react"), 1);

// panel-ui/components/LogicalModelEditor.tsx
var import_react2 = __toESM(require("react"), 1);

// panel-ui/components/logical-model-dnd.ts
function moveItemTo(items, from, insertAt) {
  if (!Number.isInteger(from) || from < 0 || from >= items.length) return [...items];
  const next = [...items];
  const item = next.splice(from, 1)[0];
  const at = Math.max(0, Math.min(next.length, insertAt > from ? insertAt - 1 : insertAt));
  next.splice(at, 0, item);
  return next;
}
function insertIndexAt(rows, y) {
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (y < (r.top + r.bottom) / 2) return i;
  }
  return rows.length;
}
function outsideRect(rect, x, y, margin = 0) {
  return x < rect.left - margin || x > rect.right + margin || y < rect.top - margin || y > rect.bottom + margin;
}

// panel-ui/components/LogicalModelEditor.tsx
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
var DROP_MARGIN = 8;
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
  const listRef = import_react2.default.useRef(null);
  const rowRefs = import_react2.default.useRef([]);
  const dragRef = import_react2.default.useRef(null);
  const lastPointRef = import_react2.default.useRef(null);
  const [dragFrom, setDragFrom] = import_react2.default.useState(null);
  const [dropAt, setDropAt] = import_react2.default.useState(null);
  const [outside, setOutside] = import_react2.default.useState(false);
  import_react2.default.useEffect(() => {
    if (dragFrom === null) return;
    const onDocDragOver = (e) => {
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      const rect = listRef.current?.getBoundingClientRect();
      setOutside(rect ? outsideRect(rect, e.clientX, e.clientY, DROP_MARGIN) : false);
    };
    document.addEventListener("dragover", onDocDragOver);
    return () => document.removeEventListener("dragover", onDocDragOver);
  }, [dragFrom]);
  function rowBands() {
    return rowRefs.current.slice(0, members.length).filter((el) => el !== null).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
  }
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
  function removeMember(i) {
    onChangeMembers?.(members.filter((_, idx) => idx !== i));
  }
  function onHandleDragStart(i, e) {
    dragRef.current = { from: i, handled: false };
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    setDragFrom(i);
    setDropAt(null);
    setOutside(false);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  }
  function onListDragOver(e) {
    if (dragRef.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropAt(insertIndexAt(rowBands(), e.clientY));
  }
  function onListDrop(e) {
    e.preventDefault();
    const d = dragRef.current;
    if (d === null) return;
    d.handled = true;
    onChangeMembers?.(moveItemTo(members, d.from, insertIndexAt(rowBands(), e.clientY)));
  }
  function onHandleDragEnd(e) {
    const d = dragRef.current;
    dragRef.current = null;
    setDragFrom(null);
    setDropAt(null);
    setOutside(false);
    if (d === null || d.handled) return;
    const rect = listRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = e.clientX !== 0 || e.clientY !== 0 ? { x: e.clientX, y: e.clientY } : lastPointRef.current ?? { x: e.clientX, y: e.clientY };
    if (outsideRect(rect, p.x, p.y, DROP_MARGIN)) removeMember(d.from);
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
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "chainHead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "fieldLabel", children: "\u6863\u94FE" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `chainHint${outside ? " chainHintDanger" : ""}`, children: outside ? "\u677E\u624B\u5373\u5220\u9664\u8BE5\u6863" : "\u62D6\u52A8 \u283F \u8C03\u6574\u4F18\u5148\u7EA7 \xB7 \u62D6\u51FA\u5217\u8868\u5373\u5220\u9664" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        ref: listRef,
        className: `nodeList${outside ? " nodeListOutside" : ""}`,
        onDragOver: onListDragOver,
        onDrop: onListDrop,
        children: [
          members.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_react2.default.Fragment, { children: [
            dropAt === i ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dropMarker", "aria-hidden": "true" }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "div",
              {
                ref: (el) => {
                  rowRefs.current[i] = el;
                },
                className: `nodeRow${dragFrom === i ? " nodeRowDragging" : ""}`,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    "span",
                    {
                      className: "dragHandle",
                      draggable: true,
                      title: "\u62D6\u52A8\u6392\u5E8F \xB7 \u62D6\u51FA\u6863\u94FE\u533A\u57DF\u5373\u5220\u9664",
                      "aria-label": `\u7B2C ${i + 1} \u6863\u7684\u62D6\u52A8\u624B\u67C4`,
                      onDragStart: (e) => onHandleDragStart(i, e),
                      onDragEnd: onHandleDragEnd,
                      children: "\u283F"
                    }
                  ),
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
                  )
                ]
              }
            )
          ] }, i)),
          dropAt === members.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dropMarker", "aria-hidden": "true" }) : null,
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
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "editorActions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "primaryButton", disabled: busy, onClick: () => onSave?.(), children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : creating ? "\u521B\u5EFA" : "\u4FDD\u5B58" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "secondaryButton", disabled: busy, onClick: () => onCancel?.(), children: "\u53D6\u6D88" })
    ] })
  ] });
}

// panel-ui/pages/models/LogicalModelsPage.tsx
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
  const [groups, setGroups] = import_react3.default.useState([]);
  const [catalog, setCatalog] = import_react3.default.useState([]);
  const [error, setError] = import_react3.default.useState("");
  const [notice, setNotice] = import_react3.default.useState("");
  const [busy, setBusy] = import_react3.default.useState(false);
  const [editingName, setEditingName] = import_react3.default.useState("");
  const [creating, setCreating] = import_react3.default.useState(false);
  const [formStrategy, setFormStrategy] = import_react3.default.useState("due-first");
  const [formDisplayName, setFormDisplayName] = import_react3.default.useState("");
  const [formMembers, setFormMembers] = import_react3.default.useState([]);
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
  import_react3.default.useEffect(() => {
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

// panel-ui/pages/models/DeploymentsPage.tsx
var import_react4 = __toESM(require("react"), 1);
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
function hasCache(d) {
  const v = d.cache_hit_rate;
  return v !== null && v !== void 0 && Number.isFinite(v);
}
function latencyTitle(d) {
  const parts = [];
  if (d.latency_day) parts.push(`${d.latency_day} \u8BB0\u5F55`);
  if (d.avg_ttft_ms != null) parts.push(`\u5E73\u5747 TTFT ${d.avg_ttft_ms} ms`);
  if (d.avg_tps != null) parts.push(`\u5E73\u5747 TPS ${d.avg_tps}`);
  if (d.cache_hit_rate != null) parts.push(`\u7F13\u5B58\u547D\u4E2D ${fmtPct(d.cache_hit_rate)}(cached \xF7 prompt)`);
  return parts.join(" \xB7 ");
}
function exposeTitle(d) {
  if (d.listed)
    return "\u5DF2\u7EB3\u5165:\u5916\u90E8\u80FD\u5728\u6A21\u578B\u5217\u8868\u91CC\u770B\u5230\u5E76\u76F4\u63A5\u4EE5 \u4F9B\u5E94\u5546/\u6A21\u578Bid \u8C03\u7528\u3002\u70B9\u300C\u672A\u7EB3\u5165\u300D\u628A\u5B83\u4ECE\u5217\u8868\u91CC\u79FB\u9664 \u2014\u2014 \u26A0\uFE0F \u79FB\u9664\u540E\u4ECD\u7136\u53EF\u4EE5\u76F4\u63A5\u8BF7\u6C42,\u4E5F\u53EF\u4EE5\u88AB\u903B\u8F91\u6A21\u578B\u5F15\u7528\u3002";
  return "\u672A\u7EB3\u5165:\u6A21\u578B\u5217\u8868\u91CC\u770B\u4E0D\u5230\u5B83\u3002\u26A0\uFE0F \u4F46\u5B83\u4ECD\u7136\u53EF\u4EE5\u88AB\u76F4\u63A5\u8BF7\u6C42\u3001\u4E5F\u53EF\u4EE5\u88AB\u903B\u8F91\u6A21\u578B\u5F15\u7528 \u2014\u2014 \u8FD9\u91CC\u53EA\u63A7\u5236\u300C\u662F\u5426\u7EB3\u5165\u300D\u3002";
}
var ALL_PROVIDERS = "__all_providers__";
function providerKey(d) {
  return (d.provider ?? "").trim();
}
function providerLabel(key) {
  return key || "\u672A\u5206\u7EC4";
}
function DeploymentsPage(_props) {
  const [deployments, setDeployments] = import_react4.default.useState([]);
  const [error, setError] = import_react4.default.useState("");
  const [notice, setNotice] = import_react4.default.useState("");
  const [directBusy, setDirectBusy] = import_react4.default.useState("");
  const [effortBusy, setEffortBusy] = import_react4.default.useState("");
  const [providerFilter, setProviderFilter] = import_react4.default.useState(ALL_PROVIDERS);
  async function load() {
    try {
      const dep = await rendererApi.getDeployments();
      setDeployments(dep.deployments);
      setError("");
    } catch (e) {
      setError(msg2(e));
    }
  }
  import_react4.default.useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1e4);
    return () => window.clearInterval(timer);
  }, []);
  const exposedCount = deployments.reduce((n4, d) => n4 + (d.listed ? 1 : 0), 0);
  const sorted = import_react4.default.useMemo(
    () => [...deployments].sort((a, b) => {
      const dt = (b.total_tokens ?? 0) - (a.total_tokens ?? 0);
      if (dt !== 0) return dt;
      const dr = (b.requests ?? 0) - (a.requests ?? 0);
      if (dr !== 0) return dr;
      return a.model.localeCompare(b.model);
    }),
    [deployments]
  );
  const providerOptions = import_react4.default.useMemo(() => {
    const set = /* @__PURE__ */ new Set();
    for (const d of deployments) set.add(providerKey(d));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [deployments]);
  const visible = import_react4.default.useMemo(
    () => providerFilter === ALL_PROVIDERS ? sorted : sorted.filter((d) => providerKey(d) === providerFilter),
    [sorted, providerFilter]
  );
  import_react4.default.useEffect(() => {
    if (providerFilter !== ALL_PROVIDERS && !providerOptions.includes(providerFilter)) {
      setProviderFilter(ALL_PROVIDERS);
    }
  }, [providerFilter, providerOptions]);
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
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "dep-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "dep-summary", children: [
          deployments.length,
          " \u4E2A\u771F\u5B9E\u6A21\u578B",
          exposedCount > 0 ? ` \xB7 ${exposedCount} \u4E2A\u5DF2\u7EB3\u5165\u6A21\u578B\u5217\u8868` : "",
          providerFilter === ALL_PROVIDERS ? "" : ` \xB7 \u5F53\u524D\u7B5B\u51FA ${visible.length} \u4E2A`
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "label",
          {
            className: "depChipEdit",
            title: "\u6309\u4F9B\u5E94\u5546\u7B5B\u9009\u672C\u9875\u6A21\u578B(\u53EA\u5F71\u54CD\u663E\u793A,\u4E0D\u6539\u4EFB\u4F55\u6570\u636E)",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "chipLabel", children: "\u4F9B\u5E94\u5546" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                "select",
                {
                  className: "chipSelect",
                  value: providerFilter,
                  onChange: (e) => setProviderFilter(e.currentTarget.value),
                  "aria-label": "\u6309\u4F9B\u5E94\u5546\u7B5B\u9009",
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: ALL_PROVIDERS, children: "\u5168\u90E8" }),
                    providerOptions.map((p) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: p, children: providerLabel(p) }, p))
                  ]
                }
              )
            ]
          }
        )
      ] }),
      visible.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "hint na", children: "\u8BE5\u4F9B\u5E94\u5546\u4E0B\u6682\u65E0\u771F\u5B9E\u6A21\u578B \u2014\u2014 \u4E0B\u62C9\u5207\u56DE\u300C\u5168\u90E8\u300D\u53EF\u770B\u5168\u90E8\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "dep-grid", children: visible.map((d) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "depCard", children: [
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
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { className: "depChipEdit", children: [
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
          hasCache(d) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "pill metric", title: latencyTitle(d), children: [
            "\u7F13\u5B58 ",
            fmtPct(d.cache_hit_rate)
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "label",
            {
              className: "depChipEdit",
              title: `\u6BCF\u51ED\u636E\u5E76\u53D1\u4E0A\u9650(\u540C\u4E00\u771F\u5B9E\u6A21\u578B N \u4E2A\u51ED\u636E = N \xD7 \u8BE5\u503C)\u3002\u6539\u5B8C\u56DE\u8F66/\u5931\u7126\u5373\u5B58,\u5F53\u524D ${d.concurrency ?? 1}`,
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

// panel-ui/pages/models/ChannelsPage.tsx
var import_react8 = __toESM(require("react"), 1);

// panel-ui/pages/models/ChannelPage.tsx
var import_react6 = __toESM(require("react"), 1);

// panel-ui/components/ModelTable.tsx
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
              disabled: disabled || row.available === false && !row.exposed,
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

// panel-ui/components/AccountRows.tsx
var import_react5 = __toESM(require("react"), 1);
var import_jsx_runtime7 = require("react/jsx-runtime");
function AccountRows({
  accounts,
  emptyText = "\u6682\u65E0\u8D26\u53F7",
  footer = null
}) {
  if (accounts.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "acct-cards", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "chan-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "chan-empty", children: emptyText }),
      footer
    ] }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "acct-cards", children: accounts.map((a) => {
    const rights = a.right == null ? [] : Array.isArray(a.right) ? a.right : [a.right];
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "chan-card acct-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "acct-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "acct-row-left", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            "span",
            {
              className: a.dot && a.dot !== "off" ? `dot ${a.dot}` : "dot off",
              "aria-hidden": "true"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "acct-name", children: a.label }),
          a.note ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "chan-sub", children: a.note }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "acct-row-right", children: rights.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_react5.default.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: r.tone ? `chan-badge ${r.tone}` : "chan-badge", children: [
            r.key,
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("b", { children: r.value })
          ] }),
          r.sub ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: r.subPlain ? "chan-sub acct-inline" : "chan-badge", children: r.sub }) : null
        ] }, `${r.key}-${i}`)) })
      ] }),
      footer
    ] }, a.id);
  }) });
}

// panel-ui/pages/models/ChannelPage.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function bare(id) {
  const i = id.lastIndexOf("/");
  return i >= 0 ? id.slice(i + 1) : id;
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
  const [catalogBusy, setCatalogBusy] = import_react6.default.useState(false);
  async function load() {
    try {
      const p = await rendererApi.getProviderPage(provider);
      setPage(p);
      setDraft(toDraft(p.models));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  import_react6.default.useEffect(() => {
    let alive = true;
    void (async () => {
      await load();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [provider]);
  const signedIn = page?.signed_in === true;
  const credits = page?.credits ?? null;
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
        // ⚠️ 只提交用户**刚改的那一格**:另一格传 `undefined`,后端保留库里原值。
        //    空输入框经 `num()` 得到 `null`,而 `null` 在后端是「明确不声明」= 清空 ——
        //    于是用户只是没填(或这一格没从目录回填到值),保存一次就把已有的上下文
        //    窗口 / 输出上限冲成 NULL(2026-11-15 用户实测「保存了但库里没有相关数据」)。
        context_window: e.field === "context" ? num(row.context) : void 0,
        max_output: e.field === "output" ? num(row.output) : void 0,
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
  async function refreshModels() {
    if (catalogBusy) return;
    setCatalogBusy(true);
    setError("");
    try {
      const r = await rendererApi.syncChannelCatalog(provider, true);
      await load();
      if (!r.ok) setError(r.message ?? "\u6A21\u578B\u76EE\u5F55\u5237\u65B0\u672A\u6210\u529F");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCatalogBusy(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("section", { className: "chan-page", children: [
    error ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "chan-banner err", role: "alert", children: error }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      AccountRows,
      {
        accounts: accountRows,
        emptyText: signedIn ? "\u6682\u65E0\u8D26\u53F7" : "\u672A\u63A5\u5165\u8D26\u53F7",
        footer: creditsError ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "chan-hint warn-line", children: creditsError }) : null
      }
    ),
    !page ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "chan-card", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "chan-empty", children: "\u52A0\u8F7D\u4E2D\u2026" }) }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("article", { className: "chan-card", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      ModelTable_default,
      {
        rows: draft,
        disabled: saving,
        emptyText: page.message ?? "\u672A\u67E5\u5230\u6A21\u578B\u76EE\u5F55",
        onEdit: applyEdit,
        onCommit: (e) => void commitEdit(e),
        toolbar: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("header", { className: "chan-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("h3", { children: "\u6A21\u578B\u76EE\u5F55" }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "button",
            {
              type: "button",
              className: "btn btn-sm",
              disabled: catalogBusy,
              onClick: () => void refreshModels(),
              children: catalogBusy ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0\u6A21\u578B\u5217\u8868"
            }
          )
        ] })
      }
    ) }) })
  ] });
}

// panel-ui/pages/models/SenseNovaPage.tsx
var import_react7 = __toESM(require("react"), 1);

// panel/sensenova-pool.ts
function generalPoolOf(pools) {
  if (!pools) return null;
  for (const p of pools) {
    if (p && p.pool_type !== "dedicated") return p;
  }
  return null;
}
function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function generalPoolSummary(pools) {
  const p = generalPoolOf(pools);
  if (p === null) return null;
  return {
    remaining: numOrNull(p.w5_remaining),
    limit: numOrNull(p.w5_limit),
    weekRemaining: numOrNull(p.w7_remaining),
    weekLimit: numOrNull(p.w7_limit),
    w5ResetAt: numOrNull(p.w5_reset_at),
    w7ResetAt: numOrNull(p.w7_reset_at)
  };
}

// panel-ui/pages/models/SenseNovaPage.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function n2(value) {
  if (value === null || value === void 0) return "\u2014";
  return Math.round(value).toLocaleString("en-US");
}
function tsTime(value) {
  if (!value) return "\u2014";
  const d = new Date(value * 1e3);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function tsDate(value) {
  if (!value) return "\u2014";
  const d = new Date(value * 1e3);
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
      const pool = generalPoolSummary(acc.quota?.pools ?? null);
      const rights = [];
      if (pool && pool.remaining !== null) {
        rights.push({
          key: "5h\u53EF\u7528",
          value: n2(pool.remaining),
          sub: pool.w5ResetAt ? `\u91CD\u7F6E ${tsTime(pool.w5ResetAt)}` : null,
          subPlain: true,
          tone: pool.remaining > 0 ? "ok" : "warn"
        });
      }
      if (pool && pool.weekRemaining !== null) {
        rights.push({
          key: "\u5468\u53EF\u7528",
          value: n2(pool.weekRemaining),
          sub: pool.w7ResetAt ? `\u91CD\u7F6E ${tsDate(pool.w7ResetAt)}` : null,
          subPlain: true,
          tone: pool.weekRemaining > 0 ? "ok" : "warn"
        });
      }
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
  async function refreshCatalog(force = true) {
    if (refreshing) return;
    const startedMs = Date.now();
    setError("");
    setRefreshMsg("");
    setNowMs(startedMs);
    localStartMsRef.current = startedMs;
    setRefreshingLocal(true);
    try {
      const r = await rendererApi.sensenovaRefresh(force, { quota: false });
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
        // ⚠️ 只提交用户**刚改的那一格**:另一格传 `undefined`,后端保留库里原值。
        //    空输入框经 `numOf()` 得到 `null`,而 `null` 在后端是「明确不声明」= 清空 ——
        //    用户只是没填(或这一格没回填到值),保存一次就把已有的窗口/输出上限冲成 NULL。
        context_window: e.field === "context" ? numOf(row.context) : void 0,
        max_output: e.field === "output" ? numOf(row.output) : void 0,
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
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("section", { className: "chan-page", children: [
    error ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "chan-banner err", role: "alert", children: error }) : null,
    refreshMsg ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "chan-banner ok", role: "status", children: refreshMsg }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(AccountRows, { accounts: accountRows, emptyText: "\u6682\u65E0\u8D26\u53F7" }),
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("article", { className: "chan-card", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      ModelTable_default,
      {
        rows: modelRows,
        showRate: false,
        disabled: saving,
        emptyText: "\u6682\u65E0\u6A21\u578B",
        onEdit: handleCatalogEdit,
        onCommit: (e) => void commitCatalogEdit(e),
        toolbar: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("header", { className: "chan-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("h3", { children: "\u6A21\u578B\u76EE\u5F55" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            "button",
            {
              type: "button",
              className: "btn btn-sm",
              disabled: refreshing,
              onClick: () => void refreshCatalog(true),
              children: refreshing ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0\u6A21\u578B\u5217\u8868"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: `act-note${refreshing ? " busy" : ""}`, title: refreshNote, children: refreshNote })
        ] })
      }
    ) })
  ] });
}

// panel-ui/pages/models/ChannelsPage.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
var CARDS = [
  { provider: "trae", label: "Trae" },
  { provider: "workbuddy", label: "WorkBuddy" },
  { provider: "minimax", label: "MiniMax" },
  { provider: "qoder", label: "Qoder" },
  { provider: "sensenova", label: "SenseNova" },
  { provider: "codearts", label: "CodeArts" }
];
var CHECKIN_PROVIDERS = /* @__PURE__ */ new Set(["trae", "workbuddy", "minimax", "qoder"]);
var QODER_REGION = "qoder";
function fmtExpiry(ms) {
  if (!ms) return "\u2014";
  const d = new Date(ms);
  const pad = (n4) => String(n4).padStart(2, "0");
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const within24h = ms - Date.now() <= 24 * 3600 * 1e3 && ms >= Date.now();
  return within24h ? `${hh}:${mi}` : `${mm}-${dd}`;
}
function n3(value) {
  if (value === null || value === void 0) return "\u2014";
  return Math.round(value).toLocaleString("en-US");
}
function checkinChip(c, loading = false) {
  if (!c) return { text: loading ? "\u2026" : "\u7B7E\u5230\u672A\u77E5", tone: "na" };
  if (!c.supported) return { text: "\u4E0D\u652F\u6301\u7B7E\u5230", tone: "na" };
  if (c.error) return { text: "\u7B7E\u5230\u67E5\u8BE2\u5931\u8D25", tone: "warn" };
  if (c.accounts === 0) return { text: "\u65E0\u8D26\u53F7", tone: "na" };
  if (c.checkedIn === null || c.pending === null) return { text: "\u7B7E\u5230\u672A\u77E5", tone: "na" };
  if (c.pending > 0) {
    if (c.countExact && c.accounts > 1) {
      const points = formatCheckinCredit(c);
      return { text: `${checkinSignedText(c)}${points}`, tone: "warn" };
    }
    if (c.checkedIn > 0) {
      return { text: checkinChipText(c), tone: "ok" };
    }
    return { text: `\u5F85\u7B7E ${c.pending}`, tone: "warn" };
  }
  return { text: checkinChipText(c), tone: "ok" };
}
function BalanceSummary({ card }) {
  if (!card || card.accounts.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "chx-balance none", children: "\u672A\u63A5\u5165\u8D26\u53F7" });
  }
  const collected = card.accounts.some((a) => a.left !== null);
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: "chx-balance", children: [
    card.accounts.map((a) => /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
      "span",
      {
        className: "chx-acct",
        title: a.expiresAtMs ? `${card.provider === "sensenova" ? "5h \u7A97\u53E3\u91CD\u7F6E" : "\u5230\u671F"} ${new Date(a.expiresAtMs).toLocaleString()}${a.expiresEstimated ? "(\u4F30\u7B97)" : ""}` : void 0,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("b", { children: a.label }),
          " ",
          a.left === null ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "chx-none", children: "\u672A\u91C7\u96C6" }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(import_jsx_runtime10.Fragment, { children: [
            n3(a.left),
            a.expiresAtMs !== null && /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("em", { className: "chx-expiry", children: fmtExpiry(a.expiresAtMs) })
          ] })
        ]
      },
      a.label
    )),
    !collected ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "chx-hint", children: "\u5C55\u5F00\u5237\u65B0\u540E\u663E\u793A" }) : null
  ] });
}
function ChannelsPage() {
  const [ov, setOv] = import_react8.default.useState(null);
  const [checkin, setCheckin] = import_react8.default.useState(null);
  const [checkinLoading, setCheckinLoading] = import_react8.default.useState(true);
  const [openId, setOpenId] = import_react8.default.useState("");
  const [busy, setBusy] = import_react8.default.useState(false);
  const [refreshing, setRefreshing] = import_react8.default.useState(false);
  const [note, setNote] = import_react8.default.useState("");
  const [quotaTick, setQuotaTick] = import_react8.default.useState(0);
  const loadHead = import_react8.default.useCallback(async () => {
    try {
      setOv(await rendererApi.channelOverview());
    } catch {
    }
  }, []);
  const loadCheckin = import_react8.default.useCallback(async () => {
    setCheckinLoading(true);
    try {
      setCheckin(await rendererApi.checkinOverview());
    } catch {
    } finally {
      setCheckinLoading(false);
    }
  }, []);
  import_react8.default.useEffect(() => {
    void loadHead();
    void loadCheckin();
    void refreshAllRef.current(false);
  }, [loadHead, loadCheckin]);
  const refreshAll = import_react8.default.useCallback(async (force) => {
    if (refreshing) return;
    setRefreshing(true);
    setNote("");
    const failed = [];
    try {
      const calls = [
        rendererApi.syncAllQuota(force),
        rendererApi.sensenovaRefresh(force, { catalog: false })
      ];
      const labels = ["\u989D\u5EA6", "SenseNova \u79EF\u5206\u6C60"];
      if (force) {
        calls.push(rendererApi.qoderCredits(QODER_REGION));
        labels.push("Qoder \u79EF\u5206");
      }
      const results = await Promise.allSettled(calls);
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          failed.push(`${labels[i]}:${String(r.reason)}`);
          return;
        }
        const v = r.value;
        if (v !== null && !Array.isArray(v) && v.ok === false) {
          failed.push(`${labels[i]}:${v.message ?? "\u672A\u5237\u65B0"}`);
        }
      });
      if (failed.length > 0 && force) setNote(`\u90E8\u5206\u672A\u5237\u65B0 \u2014\u2014 ${failed.join(";")}`);
      await loadHead();
      setQuotaTick((n4) => n4 + 1);
    } finally {
      setRefreshing(false);
    }
  }, [loadHead, refreshing]);
  const refreshAllRef = import_react8.default.useRef(refreshAll);
  refreshAllRef.current = refreshAll;
  const claimAll = import_react8.default.useCallback(async () => {
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
  const toggle = import_react8.default.useCallback(
    (provider) => {
      setOpenId((cur) => cur === provider ? "" : provider);
      void loadHead();
    },
    [loadHead]
  );
  const checkinById = import_react8.default.useMemo(
    () => new Map((checkin?.channels ?? []).map((c) => [c.provider, c])),
    [checkin]
  );
  const cardById = import_react8.default.useMemo(
    () => new Map((ov?.cards ?? []).map((c) => [c.provider, c])),
    [ov]
  );
  const visibleCards = import_react8.default.useMemo(
    () => ov === null ? [] : CARDS.filter((spec) => {
      const card = cardById.get(spec.provider);
      return card !== void 0 && card.accounts.length > 0;
    }),
    [ov, cardById]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("section", { className: "channels-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "channels-checkin", children: [
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "channels-checkin-chips", children: visibleCards.filter((spec) => CHECKIN_PROVIDERS.has(spec.provider)).filter((spec) => {
        const c = checkinById.get(spec.provider);
        if (c === void 0) return checkinLoading;
        return c.accounts > 0;
      }).map((spec) => {
        const chip = checkinChip(checkinById.get(spec.provider), checkinLoading);
        return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("span", { className: `chx-chip is-${chip.tone}`, title: `${spec.label} \u4ECA\u65E5\u7B7E\u5230`, children: [
          spec.label,
          " ",
          chip.text
        ] }, spec.provider);
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("div", { className: "channels-checkin-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "btn", disabled: refreshing, onClick: () => void refreshAll(true), children: refreshing ? "\u5237\u65B0\u4E2D\u2026" : "\u5168\u90E8\u5237\u65B0" }),
        /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("button", { type: "button", className: "btn primary", disabled: busy, onClick: () => void claimAll(), children: busy ? "\u7B7E\u5230\u4E2D\u2026" : "\u5168\u90E8\u7B7E\u5230" })
      ] })
    ] }),
    note ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "chx-note", children: note }) : null,
    ov !== null && visibleCards.length === 0 ? (
      // 全部渠道都没凭据:如实说明「没有渠道」而不是摆一堆空卡。
      // 凭据由 Agent 写入数据库,所以这句话对用户是可执行的指引。
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "chx-empty hint na", children: "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u6E20\u9053 \u2014\u2014 \u51ED\u636E\u914D\u7F6E\u7531 Agent \u76F4\u63A5\u5199\u5165\u6570\u636E\u5E93,\u914D\u7F6E\u540E\u8FD9\u91CC\u4F1A\u81EA\u52A8\u51FA\u73B0\u5BF9\u5E94\u6E20\u9053\u3002" })
    ) : null,
    visibleCards.map((spec) => {
      const open = openId === spec.provider;
      const card = cardById.get(spec.provider);
      return /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("article", { className: `chx-card${open ? " open" : ""}`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)("header", { className: "chx-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime10.jsxs)(
            "button",
            {
              type: "button",
              className: "chx-toggle",
              onClick: () => toggle(spec.provider),
              "aria-expanded": open,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: `chx-caret${open ? " open" : ""}`, "aria-hidden": "true" }),
                /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "chx-name", children: spec.label })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(BalanceSummary, { card })
        ] }),
        open ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "chx-body", children: spec.provider === "sensenova" ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(SenseNovaPage, {}, `sensenova:${quotaTick}`) : (
          // `key` 里带 `quotaTick`:点过「全部刷新」后重挂一次,
          // 让内嵌页重新读本地库(它读的是落库后的积分,不重读就还是旧数)。
          // 2026-11-15:Qoder 独立页已移除,与其它渠道一样走 ChannelPage。
          /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(ChannelPage, { provider: spec.provider }, `${spec.provider}:${quotaTick}`)
        ) }) : null
      ] }, spec.provider);
    })
  ] });
}

// panel-ui/pages/models/ProvidersPage.tsx
var import_react9 = __toESM(require("react"), 1);
var import_jsx_runtime11 = require("react/jsx-runtime");
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
function numOrNull2(v) {
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
  const [ctxTouched, setCtxTouched] = import_react9.default.useState({});
  const [outTouched, setOutTouched] = import_react9.default.useState({});
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
    setCtxTouched({});
    setOutTouched({});
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
    setCtxTouched((v) => shift(v));
    setOutTouched((v) => shift(v));
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
      const proto = form.protocol.trim() || "openai";
      const keyText = form.apiKey.trim();
      const r = await rendererApi.upsertModelProvider(
        pid,
        form.base_url.trim(),
        proto,
        // `env_prefix` 在原页面上是**只读回显**,没有输入框 → 不提交(undefined
        // = 不改),后端保留原值 / 落 `ONE_<ID>` 默认。
        void 0,
        keyText === "" ? void 0 : [keyText]
      );
      if (!r.ok) throw new FormError(r.message ?? "\u4FDD\u5B58\u5931\u8D25");
      const exposure = [];
      form.models.forEach((m, i) => {
        const id = (m.id ?? "").trim();
        if (!id) return;
        const kinds = inputChecked[i] ?? { text: true, image: false };
        exposure.push({
          id: `${pid}/${id}`,
          ...m.name?.trim() ? { name: m.name.trim() } : {},
          vision: kinds.image,
          context_window: ctxTouched[i] ? numOrNull2(ctxDraft[i] ?? "") : void 0,
          max_output: outTouched[i] ? numOrNull2(outDraft[i] ?? "") : void 0
        });
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
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-catalogSection", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "pv-catalogTitle", children: "\u6A21\u578B\u76EE\u5F55" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-panel", children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-modelListHead", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "pv-modelCatalogMeta", children: anyOverridden ? "\u5DF2\u81EA\u5B9A\u4E49\u6A21\u578B\u76EE\u5F55" : "\u6B63\u5728\u4F7F\u7528\u63D0\u4F9B\u5546\u9ED8\u8BA4\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "pv-headActions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
        catalogOpen ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
          form.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "pv-modelEmpty", children: "\u8FD8\u6CA1\u6709\u767B\u8BB0\u6A21\u578B;\u70B9\u300C\u83B7\u53D6\u53EF\u7528\u6A21\u578B\u300D\u6216\u300C\uFF0B \u6DFB\u52A0\u6A21\u578B\u300D\u8865\u4E0A\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "pv-modelList", children: form.models.map((_m, i) => {
            const kinds = inputChecked[i] ?? { text: true, image: false };
            return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-modelEntry", children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-modelRow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
                /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
              rowOpen[i] ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-modelAdvanced", children: [
                /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { className: "pv-modelField", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "pv-modelFieldLabel", children: "\u4E0A\u4E0B\u6587\u7A97\u53E3" }),
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                    "input",
                    {
                      className: "pv-input",
                      type: "text",
                      inputMode: "numeric",
                      placeholder: "\u7559\u7A7A = \u6CBF\u7528\u5E93\u91CC\u539F\u503C",
                      value: ctxDraft[i] ?? "",
                      onChange: (ev) => {
                        setCtxDraft((v) => ({ ...v, [i]: ev.target.value }));
                        setCtxTouched((v) => ({ ...v, [i]: true }));
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { className: "pv-modelField", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "pv-modelFieldLabel", children: "\u6700\u5927\u8F93\u51FA token \u6570" }),
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                    "input",
                    {
                      className: "pv-input",
                      type: "text",
                      inputMode: "numeric",
                      placeholder: "\u4F7F\u7528\u63D0\u4F9B\u5546\u9ED8\u8BA4\u503C",
                      value: outDraft[i] ?? "",
                      onChange: (ev) => {
                        setOutDraft((v) => ({ ...v, [i]: ev.target.value }));
                        setOutTouched((v) => ({ ...v, [i]: true }));
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("fieldset", { className: "pv-modelInputTypes", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("legend", { className: "pv-modelFieldLabel", children: "\u8F93\u5165\u7C7B\u578B" }),
                  /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-modelInputChoices", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { className: "pv-choice", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                        "input",
                        {
                          type: "checkbox",
                          checked: kinds.text,
                          onChange: (ev) => toggleInput(i, "text", ev.target.checked)
                        }
                      ),
                      "\u6587\u672C"
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { className: "pv-choice", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "pv-addModelButton", disabled: busy, onClick: addModel, children: "\uFF0B \u6DFB\u52A0\u6A21\u578B" })
        ] }) : null
      ] })
    ] });
  }
  function providerFields(withId, p) {
    const uid = withId ? "new-provider" : p?.id ?? form.id;
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-panel", children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "pv-panelTitle", children: withId ? "\u81EA\u5B9A\u4E49\u6A21\u578B API" : p?.id }),
      withId ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("label", { className: "pv-fieldLabel", htmlFor: "new-provider-id", children: "Provider ID" }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("label", { className: "pv-fieldLabel", htmlFor: `key-${uid}`, children: "API \u5BC6\u94A5" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("label", { className: "pv-fieldLabel", htmlFor: `url-${uid}`, children: "API \u5730\u5740" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("label", { className: "pv-fieldLabel", htmlFor: `proto-${uid}`, children: "API \u534F\u8BAE" }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
        "select",
        {
          id: `proto-${uid}`,
          className: "pv-input pv-selectInput",
          value: form.protocol,
          onChange: (ev) => setForm((f) => ({ ...f, protocol: ev.target.value })),
          children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("option", { value: "openai", children: "OpenAI Chat Completions" })
        }
      )
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("section", { className: "pv-section", children: [
      error ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "pv-err", role: "alert", children: error }) : null,
      notice ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "pv-savedNotice", role: "status", children: notice }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("ul", { className: "pv-rows", children: [
        providers.map((p) => /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("li", { className: "pv-rowCard", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-rowHead", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "pv-rowName", children: p.id }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              "span",
              {
                className: "pv-credentialDot " + (dotState(p) === "ok" ? "pv-dotOk" : "pv-dotMissing"),
                title: dotTitle(p)
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "pv-rowActions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "pv-rowBtn", disabled: busy, onClick: () => startEdit(p), children: openId === p.id && !creating ? "\u6536\u8D77" : "\u7F16\u8F91" }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
          openId === p.id && !creating ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(import_jsx_runtime11.Fragment, { children: [
            providerFields(false, p),
            catalogSection(),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-rowActions pv-cardFooter", children: [
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "pv-secondaryButton", disabled: busy, onClick: closeCard, children: "\u53D6\u6D88" }),
              /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
        creating ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("li", { className: "pv-rowCard", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-rowHead", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "pv-rowName", children: "\u6DFB\u52A0\u6A21\u578B\u63D0\u4F9B\u5546" }),
            createInvalid ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "pv-credentialDot pv-dotMissing", title: "\u521A\u624D\u4FDD\u5B58\u6CA1\u901A\u8FC7\u6821\u9A8C,\u8BF7\u68C0\u67E5\u4E0B\u9762\u7684\u5B57\u6BB5" }) : null
          ] }),
          providerFields(true),
          catalogSection(),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-rowActions pv-cardFooter", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "pv-secondaryButton", disabled: busy, onClick: closeCard, children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
      !creating ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "pv-addButton", disabled: busy, onClick: startCreate, children: "\uFF0B \u6DFB\u52A0\u6A21\u578B\u63D0\u4F9B\u5546" }) : null
    ] }),
    pickerOpen ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
      "div",
      {
        className: "pv-mask",
        onClick: (ev) => {
          if (ev.target === ev.currentTarget) closePicker();
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-dialog", role: "dialog", "aria-modal": "true", "aria-label": "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u6A21\u578B", children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h3", { className: "pv-dialogTitle", children: "\u9009\u62E9\u8981\u6DFB\u52A0\u7684\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "pv-dialogDesc", children: "\u4EE5\u4E0B\u662F\u6A21\u578B\u63D0\u4F9B\u5546\u7684\u53EF\u7528\u6A21\u578B,\u52FE\u9009\u8981\u6DFB\u52A0\u7684\u6A21\u578B\u3002" }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-candidateToolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
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
          visibleCandidates().length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("p", { className: "pv-candidateEmpty", role: "status", children: "\u6CA1\u6709\u5339\u914D\u7684\u6A21\u578B\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("ul", { className: "pv-candidateList", children: visibleCandidates().map((c) => /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("li", { className: "pv-candidate", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("label", { className: "pv-candidateLabel", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("input", { type: "checkbox", checked: picked.has(c), onChange: () => togglePick(c) }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "pv-candidateId", title: c, children: c })
          ] }) }, c)) }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "pv-dialogFooter", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "pv-secondaryButton", onClick: closePicker, children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("button", { type: "button", className: "pv-secondaryButton", onClick: adoptPicked, children: "\u6DFB\u52A0\u6240\u9009" })
          ] })
        ] })
      }
    ) : null
  ] });
}

// panel-ui/pages/models/models-action.ts
var import_react10 = __toESM(require("react"), 1);
var ModelsActionContext = import_react10.default.createContext(() => {
});
var ModelsActionProvider = ModelsActionContext.Provider;

// panel-ui/pages/models/ModelsPage.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h1", { className: "page-title", children: "As One \xB7 \u6A21\u578B" }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("nav", { className: "subtabs", children: [
      SUBS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
        "button",
        {
          type: "button",
          className: `subtab${s.key === on ? " on" : ""}`,
          onClick: () => select(s.key),
          children: s.label
        },
        s.key
      )),
      shown ? /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "subtabs-action", children: [
        shown.note ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: `act-note${shown.noteBusy ? " busy" : ""}`, title: shown.note, children: shown.note }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("button", { type: "button", className: "act-btn", disabled: shown.disabled, onClick: () => shown.run(), children: shown.label })
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(ModelsActionProvider, { value: publish, children: [
      on === "logical" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(LogicalModelsPage_default, {}) : null,
      on === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(DeploymentsPage_default, {}) : null,
      on === "channels" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ChannelsPage, {}) : null,
      on === "suppliers" ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(ProvidersPage, {}) : null
    ] })
  ] });
}
var ModelsPage_default = ModelsPage;

// panel-ui/pages/UsageStatsPage.tsx
var import_react12 = __toESM(require("react"), 1);
var import_jsx_runtime13 = require("react/jsx-runtime");
var RANGES = [
  { key: "all", label: "\u5168\u90E8" },
  { key: "7", label: "\u6700\u8FD1 7 \u5929" },
  { key: "30", label: "\u6700\u8FD1 30 \u5929" },
  { key: "90", label: "\u6700\u8FD1 90 \u5929" },
  { key: "365", label: "\u6700\u8FD1 365 \u5929" }
];
var SOURCES = [
  { key: "all", label: "\u6240\u6709" },
  { key: "gateway", label: "\u4EC5\u7F51\u5173" },
  { key: "external", label: "\u4EC5\u7F51\u5173\u5916" }
];
var SOURCE_EMPTY = {
  all: "\u7F51\u5173\u4E0E\u7F51\u5173\u5916\u90FD",
  gateway: "\u7F51\u5173\u4FA7",
  external: "\u7F51\u5173\u5916"
};
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
  const [source, setSource] = import_react12.default.useState("all");
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
      const r = await rendererApi.getUsageHistory(range, granularity, group, source);
      setData(r);
      setExpanded({});
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range, granularity, group, source]);
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
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_react12.default.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h1", { className: "page-title", children: "\u7528\u91CF\u7EDF\u8BA1" }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-ctl", children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-seg", role: "group", "aria-label": "\u65F6\u95F4\u8303\u56F4", children: RANGES.map((r) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-seg", role: "group", "aria-label": "\u6570\u636E\u6765\u6E90", children: SOURCES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        "button",
        {
          type: "button",
          className: source === s.key ? "on" : "",
          "aria-pressed": source === s.key,
          onClick: () => setSource(s.key),
          children: s.label
        },
        s.key
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-seg", role: "group", "aria-label": "\u805A\u5408", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "button",
          {
            type: "button",
            className: granularity === "day" ? "on" : "",
            "aria-pressed": granularity === "day",
            onClick: () => setGranularity("day"),
            children: "\u6309\u5929"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-seg", role: "group", "aria-label": "\u7EDF\u8BA1\u7EF4\u5EA6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "button",
          {
            type: "button",
            className: group === "model" ? "on" : "",
            "aria-pressed": group === "model",
            onClick: () => setGroup("model"),
            children: "\u6309\u771F\u5B9E\u6A21\u578B"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("button", { type: "button", className: "usage-refresh", disabled: loading, onClick: () => void load(), children: loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u5237\u65B0" }),
      data ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "hint usage-ctl-info", children: [
        rangeText,
        " \xB7 ",
        data.axis.length,
        " \u4E2A",
        granularity === "month" ? "\u6708" : "\u5929"
      ] }) : null
    ] }),
    error ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "err", children: error }) : null,
    data && hasData ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(import_jsx_runtime13.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-cards", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-k", children: "Tokens \u7528\u91CF" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-v", children: full(totals?.tokens) }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-card-s", children: [
            "\u8F93\u5165 ",
            full(totals?.prompt_tokens),
            " \xB7 \u8F93\u51FA ",
            full(totals?.completion_tokens)
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-k", children: "\u8BF7\u6C42\u6570\u91CF" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-v", children: full(totals?.requests) }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-s", children: "\u4EC5\u7EDF\u8BA1\u6210\u529F\u8BF7\u6C42" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-k", children: "\u5E73\u5747\u7F13\u5B58\u547D\u4E2D" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-v", children: rateText(totals?.cache_hit_rate) }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-card-s", children: [
            fmtCount(totals?.cached_tokens ?? 0),
            " \u7F13\u5B58\u547D\u4E2D"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-k", children: "\u6D3B\u8DC3\u5929\u6570" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-v", children: totals?.active_days ?? 0 }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-card-s", children: [
            "\u533A\u95F4 ",
            data.axis.length,
            " ",
            granularity === "month" ? "\u4E2A\u6708" : "\u5929"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-k", children: group === "logical" ? "\u6700\u5E38\u7528\u903B\u8F91\u6A21\u578B" : "\u6700\u5E38\u7528\u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-v usage-card-v-sm", children: top?.name ?? "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-card-s", children: top ? top.provider ?? (group === "logical" ? "\u903B\u8F91\u6A21\u578B" : "") : "\u5168\u90E8\u5F52\u300C\u5176\u4ED6\u300D" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("section", { className: "usage-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h2", { children: trendTitle }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { ref: chartEl, className: "usage-chart-wrap", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
            "svg",
            {
              width: "100%",
              height: GEO.h,
              viewBox: `0 0 ${chartW} ${GEO.h}`,
              className: "usage-chart",
              onMouseLeave: () => setHoverIdx(null),
              children: [
                chart.ticksLeft.map((t) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("text", { className: "axis-text", x: GEO.padL - 6, y: t.y + 3.5, textAnchor: "end", children: t.text }, `lt${t.v}`)),
                chart.ticksRight.map((t) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
                  "text",
                  {
                    className: "axis-text axis-text-r",
                    x: GEO.padL + (chartW - GEO.padL - GEO.padR) + 6,
                    y: t.y + 3.5,
                    children: t.text
                  },
                  `rt${t.p}`
                )),
                chart.labels.map((l) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("text", { className: "axis-text", x: l.x, y: GEO.padT + PLOT_H + 16, textAnchor: "middle", children: l.text }, `lb${l.x}`)),
                chart.bars.map((b) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("rect", { x: b.x, y: b.y, width: b.w, height: Math.max(0, b.h), fill: b.color, className: "usage-bar" }, b.key)),
                chart.path ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("path", { d: chart.path, fill: "none", stroke: LINE_COLOR, strokeWidth: 2, className: "usage-line" }) : null,
                chart.bs.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
                hoverIdx != null && chart.bs[hoverIdx] && chart.bs[hoverIdx].cache_hit_rate != null ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
          hover ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { ref: tipEl, className: "usage-tip", style: { left: `${hover.left}px` }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-tip-head", children: hover.key }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: "\u603B Token" }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("b", { children: full(hover.tokens) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: "\u8BF7\u6C42" }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("b", { children: full(hover.requests) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { children: "\u7F13\u5B58\u547D\u4E2D\u7387" }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("b", { children: hover.rate })
            ] }),
            hover.rows.length ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-tip-sep" }) : null,
            hover.rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-tip-line", children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "usage-tip-nm", children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("i", { className: "usage-dot sm", style: { background: r.color } }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-tip-nm-t", title: r.name, children: r.name })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("b", { children: fmtCount(r.tokens) })
            ] }, r.key)),
            hover.more ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-tip-more", children: [
              "\u2026\u53E6\u6709 ",
              hover.more,
              " \u4E2A\u5E8F\u5217"
            ] }) : null
          ] }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-legend", children: [
          data.series.map((s) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "usage-legend-i", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("i", { className: "usage-dot", style: { background: seriesColor(s, data.series) } }),
            seriesLabel(s, group)
          ] }, s.key)),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "usage-legend-i", children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("i", { className: "usage-line-sw", style: { background: LINE_COLOR } }),
            "\u7F13\u5B58\u547D\u4E2D\u7387"
          ] })
        ] }),
        chart.hidden ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { className: "hint", children: [
          "\u6876\u592A\u5BC6,\u53EA\u753B\u6700\u8FD1 ",
          chart.bs.length,
          " \u4E2A(\u66F4\u65E9 ",
          chart.hidden,
          " \u4E2A\u6CA1\u753B\u5165\u67F1\u72B6\u56FE),\u53EF\u5207\u300C\u6309\u6708\u300D\u770B\u66F4\u957F\u7684\u8DE8\u5EA6\u3002"
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("section", { className: "usage-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h2", { children: "\u6A21\u578B\u7528\u91CF" }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { ref: donutEl, className: "usage-split", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("svg", { className: "usage-donut", width: ring.s, height: ring.s, viewBox: `0 0 ${ring.s} ${ring.s}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("circle", { cx: ring.c, cy: ring.c, r: ring.r, fill: "none", stroke: "#22262e", strokeWidth: ring.sw }),
            modelSegs.map((g) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.04, className: "usage-donut-v", textAnchor: "middle", children: fmtCount(modelRingTotal) }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.13, className: "usage-donut-k", textAnchor: "middle", children: "Tokens \u7528\u91CF" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("ol", { className: "usage-rank", children: data.series.map((s, i) => {
            const kids = s.is_other ? s.folded ?? [] : s.models;
            const kidKey = (m, j) => m.key ?? `${m.provider ?? ""}/${m.name}:${j}`;
            return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
                "div",
                {
                  className: `usage-row${kids.length > 0 ? " clickable" : ""}`,
                  onClick: kids.length ? () => toggle(`m:${s.key}`) : void 0,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-rank-i", children: i + 1 }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: `usage-caret${expanded[`m:${s.key}`] ? " open" : ""}`, children: kids.length ? "\u203A" : "" }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("i", { className: "usage-dot", style: { background: seriesColor(s, data.series) } }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "usage-name", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name-m", children: s.is_other ? "\u5176\u4ED6" : rowMain(s) }),
                      rowSub(s) ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name-s", children: rowSub(s) }) : null
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-val", children: full(s.tokens) }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-pct", children: fmtPct(s.percent) })
                  ]
                }
              ),
              expanded[`m:${s.key}`] ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-fold", children: kids.map((m, j) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-subrow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("i", { className: "usage-dot sm", style: { background: OTHER_COLOR } }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "usage-name", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name-m", children: m.name }),
                  m.provider ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name-s", children: m.provider }) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-val", children: full(m.tokens) }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-pct", children: fmtPct(m.percent) })
              ] }, kidKey(m, j))) }) : null
            ] }, s.key);
          }) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("section", { className: "usage-sec", children: [
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("h2", { children: "\u5404\u4F9B\u5E94\u5546\u7528\u91CF" }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-split", children: [
          /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("svg", { className: "usage-donut", width: ring.s, height: ring.s, viewBox: `0 0 ${ring.s} ${ring.s}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("circle", { cx: ring.c, cy: ring.c, r: ring.r, fill: "none", stroke: "#22262e", strokeWidth: ring.sw }),
            providerSegs.map((g) => /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
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
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.04, className: "usage-donut-v", textAnchor: "middle", children: fmtCount(providerRingTotal) }),
            /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("text", { x: ring.c, y: ring.c + ring.s * 0.13, className: "usage-donut-k", textAnchor: "middle", children: "Tokens \u7528\u91CF" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("ol", { className: "usage-rank", children: data.providers.map((p, i) => (
            //: As One 契约的 UsageProvider 无 key/name,用 provider 当键;「其他」行
            //: 的显示名固定为「其他」(对应 p.name),机器键为哨兵
            //: "\u0000pother"。folded 为对齐 is_other 行新增(见
            //: panel-types.ts),assembly 在排名尾部确有被聚合供应商时产出。
            /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
                "div",
                {
                  className: `usage-row${(p.is_other ? (p.folded?.length ?? 0) > 0 : p.models.length > 0) ? " clickable" : ""}`,
                  onClick: (p.is_other ? (p.folded?.length ?? 0) > 0 : p.models.length > 0) ? () => toggle(`p:${p.provider}`) : void 0,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-rank-i", children: i + 1 }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: `usage-caret${expanded[`p:${p.provider}`] ? " open" : ""}`, children: p.is_other ? p.folded?.length ?? 0 ? "\u203A" : "" : p.models.length ? "\u203A" : "" }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("i", { className: "usage-dot", style: { background: providerColor(p, i) } }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "usage-name", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name-m", children: p.is_other ? "\u5176\u4ED6" : p.provider }),
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name-s", children: p.is_other ? `${p.folded?.length ?? 0} \u4E2A\u4F9B\u5E94\u5546` : `${p.models.length} \u4E2A\u6A21\u578B` })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-val", children: full(p.tokens) }),
                    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-pct", children: fmtPct(p.percent) })
                  ]
                }
              ),
              expanded[`p:${p.provider}`] ? p.is_other ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-fold", children: (p.folded ?? []).map((f) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
                  "div",
                  {
                    className: `usage-subrow${f.models.length > 0 ? " clickable" : ""}`,
                    onClick: f.models.length ? () => toggle(`pf:${f.key}`) : void 0,
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: `usage-caret fold${expanded[`pf:${f.key}`] ? " open" : ""}`, children: f.models.length ? "\u203A" : "" }),
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("i", { className: "usage-dot sm", style: { background: OTHER_COLOR } }),
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "usage-name", children: [
                        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name-m", children: f.name }),
                        /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: "usage-name-s", children: [
                          f.models.length,
                          " \u4E2A\u6A21\u578B"
                        ] })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-val", children: full(f.tokens) }),
                      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-pct", children: fmtPct(f.percent) })
                    ]
                  }
                ),
                expanded[`pf:${f.key}`] ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-fold deep", children: f.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-subrow", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name", children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name-m", children: m.name }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-val", children: full(m.tokens) }),
                  /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-pct", children: fmtPct(m.percent) })
                ] }, `${m.provider ?? ""}/${m.name}`)) }) : null
              ] }, f.key)) }) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("div", { className: "usage-fold", children: p.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: "usage-subrow", children: [
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("i", { className: "usage-dot sm", style: { background: OTHER_COLOR } }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name", children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-name-m", children: m.name }) }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-val", children: full(m.tokens) }),
                /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "usage-pct", children: fmtPct(m.percent) })
              ] }, `${m.provider ?? ""}/${m.name}`)) }) : null
            ] }, p.provider)
          )) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { className: "hint usage-foot", children: [
        "\u7EDF\u8BA1\u622A\u81F3 ",
        data.last_day ?? "\u2014",
        " \xB7 \u533A\u95F4 ",
        rangeText,
        " \xB7 \u6570\u636E\u6E90 ",
        data.source
      ] })
    ] }) : null,
    data && !hasData ? /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("p", { className: "hint", children: [
      SOURCE_EMPTY[source],
      "\u8FD9\u4E2A\u533A\u95F4\u6CA1\u6709\u8BB0\u5F55(\u5E93\u91CC\u6709\u6570\u636E\u7684\u8303\u56F4\u662F ",
      data.from,
      " \u2192",
      " ",
      data.last_day ?? data.to,
      ",\u6362\u4E00\u4E2A\u65F6\u95F4\u8303\u56F4\u770B\u770B)\u3002"
    ] }) : null,
    !data && !loading ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("p", { className: "hint", children: "\u6682\u65E0\u7559\u5B58\u6570\u636E\u3002" }) : null
  ] });
}

// panel-ui/pages/SettingsPage.tsx
var import_react13 = __toESM(require("react"), 1);

// panel-ui/pages/settings-rules.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
var WEEKDAYS = Array.from({ length: 7 }, (_, i) => ({
  k: i + 1,
  // 1=周一 .. 7=周日(后端口径)
  label: "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u65E5"[i]
}));
function freshGroups() {
  return { free: [], expiry: [], consume: [], degrade: [], disabled: [], cooldown: [], profiles: [], other: [] };
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
      const profile = typeof winSrc.profile === "string" ? winSrc.profile.trim() : "";
      const hasTimes = profile === "" && Array.isArray(winSrc.times);
      const hasCooldown = r.cooldown !== void 0 && r.cooldown !== null;
      if (hasTimes && hasCooldown) {
        groups.other.push(item);
        continue;
      }
      if (profile !== "") {
        if (hasCooldown) {
          groups.other.push(item);
          continue;
        }
        pushTier(groups, key, { provider, model, expires_at, profile });
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
        pushTier(groups, key, { provider, model, expires_at, profile: "" });
        continue;
      }
      if (hasCooldown) {
        groups.cooldown.push({ provider, cooldown: Number(r.cooldown) });
        continue;
      }
      pushTier(groups, key, { provider, model, expires_at, profile: "" });
    }
  }
  for (const key of RULES_PRIORITY_KEYS) {
    if (!seen.has(key)) groups.other.push({ __missing: key });
  }
  return { ok: true, groups };
}
function serializeGroups(g) {
  const winOf = (r) => {
    if (r.profile) return { profile: r.profile };
    return void 0;
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
function serializeProfiles(g) {
  const out = [];
  for (const p of g.profiles) {
    const id = p.id.trim();
    if (id === "") continue;
    const segs = [];
    for (const seg of p.segments) {
      const row = {};
      if (seg.weekdays.length > 0) row.weekdays = [...seg.weekdays];
      if (seg.times.length > 0) row.times = seg.times.map((t) => [t.start, t.end]);
      if (Object.keys(row).length > 0) segs.push(row);
    }
    out.push({ id, name: p.name.trim() || id, segments: segs });
  }
  return JSON.stringify(out, null, 2);
}
function parseProfiles(raw) {
  if (raw === void 0 || raw.trim() === "") return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const spansOf = (raw2) => {
    if (!Array.isArray(raw2)) return [];
    const spans = raw2.map(
      (s) => Array.isArray(s) && s.length === 2 && typeof s[0] === "string" && typeof s[1] === "string" ? { start: s[0], end: s[1] } : null
    );
    return spans.some((s) => s === null) ? null : spans;
  };
  for (const item of parsed) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const r = item;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (id === "" || seen.has(id)) continue;
    const name2 = typeof r.name === "string" && r.name.trim() !== "" ? r.name.trim() : id;
    const rawSegs = Array.isArray(r.segments) ? r.segments : [{ weekdays: r.weekdays, times: r.times }];
    const segments2 = [];
    let broken = false;
    for (const seg of rawSegs) {
      if (typeof seg !== "object" || seg === null || Array.isArray(seg)) continue;
      const s = seg;
      const weekdays = Array.isArray(s.weekdays) ? s.weekdays.filter(
        (d) => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7
      ) : [];
      const times = spansOf(s.times);
      if (times === null) {
        broken = true;
        break;
      }
      if (weekdays.length === 0 && times.length === 0) continue;
      segments2.push({ weekdays, times });
    }
    if (broken) continue;
    seen.add(id);
    out.push({ id, name: name2, segments: segments2 });
  }
  return out;
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
  if (r.profile !== "" && !r.model.trim()) return "\u5E26\u751F\u6548\u65F6\u6BB5\u7684\u89C4\u5219\u5FC5\u987B\u586B model";
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
function profileSummary(p) {
  const dayName = (k) => `\u5468${WEEKDAYS.find((w) => w.k === k)?.label ?? "?"}`;
  const segText = (seg) => {
    const wd = [...seg.weekdays].sort((a, b) => a - b);
    let days = "";
    if (wd.length > 0) {
      const contiguous = wd.every((d, i) => i === 0 || d === wd[i - 1] + 1);
      days = contiguous && wd.length > 1 ? `${dayName(wd[0])}~${dayName(wd[wd.length - 1])}` : wd.map(dayName).join("\u3001");
    }
    const times = seg.times.map((t) => `${t.start}-${t.end}`).join("\u3001");
    if (days === "" && times === "") return "\u5168\u5929\u4E0D\u9650";
    return [days, times].filter((s) => s !== "").join(" ");
  };
  if (p.segments.length === 0) return "\u5168\u5929\u4E0D\u9650";
  return p.segments.map(segText).join(" + ");
}
function RuleRow(props) {
  const r = props.rule;
  const prof = props.profiles.find((p) => p.id === r.profile);
  const err = tierErr(r);
  return (
    // ⚠️ 必须是 div 而不是 li:外层 <li className="schedRowOuter"> 已经占用了列表项,
    // li 嵌 li 是非法 HTML,浏览器会把内层 li 拆出去,导致拖动落点/ref 全面错位。
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "rowCard ruleRowCard" + (props.dragging ? " nodeRowDragging" : ""), children: [
      props.dropBefore ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "dropMarker", "aria-hidden": "true" }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "ruleRowLine", children: [
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "span",
          {
            className: "dragHandle",
            draggable: true,
            title: "\u62D6\u52A8\u6392\u5E8F \xB7 \u62D6\u5230\u522B\u7684\u6BB5\u5373\u6539\u4F18\u5148\u7EA7 \xB7 \u62D6\u51FA\u5217\u8868\u5373\u5220\u9664",
            "aria-label": "\u62D6\u52A8\u8FD9\u6761\u89C4\u5219",
            onDragStart: props.onDragStart,
            onDragEnd: props.onDragEnd,
            children: "\u283F"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
          "select",
          {
            className: "input selectInput ruleField ruleProvider",
            value: r.provider,
            title: "\u4F9B\u5E94\u5546(\u5FC5\u586B);\u6362\u4F9B\u5E94\u5546\u4F1A\u91CD\u7F6E\u6A21\u578B",
            onChange: (ev) => props.onPatch({ provider: ev.target.value, model: "" }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: "", children: "\u2014 \u9009\u4F9B\u5E94\u5546 \u2014" }),
              withCurrent(props.providerOptions, r.provider).map((p) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: p, children: p }, p))
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
          "select",
          {
            className: "input selectInput ruleField ruleModel",
            value: r.model,
            disabled: !r.provider,
            title: "\u7559\u7A7A = \u8BE5\u4F9B\u5E94\u5546\u7684\u5168\u90E8\u6A21\u578B",
            onChange: (ev) => props.onPatch({ model: ev.target.value }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: "", children: "\u2014 \u5168\u90E8\u6A21\u578B \u2014" }),
              withCurrent(props.modelOptions, r.model).map((m) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: m, children: m }, m))
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
          "input",
          {
            type: "date",
            className: `input ruleField ruleExpiry${r.expires_at ? "" : " is-empty"}`,
            value: r.expires_at,
            title: "\u5230\u671F\u65E5(\u53EF\u7559\u7A7A)",
            onChange: (ev) => props.onPatch({ expires_at: ev.target.value })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
          "select",
          {
            className: "input selectInput ruleField ruleProfile",
            value: r.profile,
            title: prof ? `\u65F6\u6BB5:${profileSummary(prof)}` : "\u5F15\u7528\u7684\u547D\u540D\u65F6\u6BB5(\u5728\u300C\u65F6\u6BB5\u914D\u7F6E\u300D\u91CC\u7EF4\u62A4);\u4E0D\u9009 = \u5168\u5929\u4E0D\u9650",
            onChange: (ev) => props.onPatch({ profile: ev.target.value }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: "", children: "\u5168\u5929/\u4E0D\u9650" }),
              withCurrent(props.profiles.map((p) => p.id), r.profile).map((id) => {
                const p = props.profiles.find((x) => x.id === id);
                return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: id, title: p ? profileSummary(p) : void 0, children: p ? p.name : id }, id);
              })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", className: "rowBtn danger ruleDel", title: "\u5220\u9664\u8FD9\u6761\u89C4\u5219", onClick: props.onRemove, children: "\u5220\u9664" })
      ] }),
      err ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "rule-err", children: err }) : null
    ] })
  );
}
function CooldownRuleRow(props) {
  const err = cooldownErr(props.rule);
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("li", { className: "rowCard ruleRowCard" + (err ? " hasError" : ""), children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "ruleRowLine", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
        "select",
        {
          className: "input selectInput ruleField ruleProvider",
          value: props.rule.provider,
          title: "\u4F9B\u5E94\u5546(\u5FC5\u586B)",
          onChange: (ev) => props.onPatch({ provider: ev.target.value }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: "", children: "\u2014 \u9009\u4F9B\u5E94\u5546 \u2014" }),
            withCurrent(props.providerOptions, props.rule.provider).map((p) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("option", { value: p, children: p }, p))
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
        "input",
        {
          type: "number",
          min: 1,
          className: "input ruleField ruleNum",
          value: props.rule.cooldown,
          title: "\u5931\u8D25\u540E\u591A\u4E45\u4E0D\u518D\u9009\u8BE5\u4F9B\u5E94\u5546(\u5206\u949F)",
          onChange: (ev) => props.onPatch({ cooldown: ev.target.value === "" ? "" : Number(ev.target.value) })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "ruleUnit", children: "\u5206\u949F" }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("button", { type: "button", className: "rowBtn danger ruleDel", title: "\u5220\u9664\u8FD9\u6761\u51B7\u5374", onClick: props.onRemove, children: "\u5220\u9664" })
    ] }),
    err ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("p", { className: "rule-err", children: err }) : null
  ] });
}

// panel-ui/pages/SettingsPage.tsx
var import_jsx_runtime15 = require("react/jsx-runtime");
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
var SETTINGS_TABS = [
  { key: "scheduler", label: "\u8C03\u5EA6" },
  { key: "policy", label: "\u7B56\u7565" },
  { key: "misc", label: "\u5176\u4ED6" }
];
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
function errText(e) {
  return e instanceof Error ? e.message : String(e);
}
var WEEKDAY_LABELS = ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"];
function ProfileCard(props) {
  const p = props.profile;
  const setSegs = (segs) => props.onPatch({ segments: segs });
  const patchSeg = (i, patch) => setSegs(p.segments.map((s, at) => at === i ? { ...s, ...patch } : s));
  const toggleDay = (i, d) => {
    const cur = p.segments[i].weekdays;
    patchSeg(i, { weekdays: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() });
  };
  const patchTime = (i, ti, patch) => patchSeg(i, { times: p.segments[i].times.map((t, at) => at === ti ? { ...t, ...patch } : t) });
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("li", { className: "profileRow", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "profileTop", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "input",
        {
          className: "input profileName",
          value: p.name,
          "aria-label": "\u65F6\u6BB5\u540D\u79F0",
          title: "\u65F6\u6BB5\u540D\u79F0(\u89C4\u5219\u4E0B\u62C9\u91CC\u663E\u793A\u8FD9\u4E2A\u540D\u5B57)",
          onChange: (ev) => props.onPatch({ name: ev.target.value })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "rowBtn danger profileDel", onClick: props.onRemove, children: "\u5220\u9664" })
    ] }),
    p.segments.map((seg, i) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "profileSeg", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "profileSegDays", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "rr-day-set", role: "group", "aria-label": "\u751F\u6548\u661F\u671F", children: WEEKDAY_LABELS.map((label, di) => {
          const d = di + 1;
          const on = seg.weekdays.includes(d);
          return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            "button",
            {
              type: "button",
              className: "rr-day" + (on ? " on" : ""),
              "aria-pressed": on,
              "aria-label": `\u5468${label}`,
              onClick: () => toggleDay(i, d),
              children: label
            },
            d
          );
        }) }),
        seg.weekdays.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "profileNote", children: "\u6BCF\u5929" }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "profileSegTimes", children: [
        seg.times.map((t, ti) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "profileTime", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            "input",
            {
              type: "time",
              className: "input",
              value: t.start,
              "aria-label": "\u5F00\u59CB\u65F6\u95F4",
              onChange: (ev) => patchTime(i, ti, { start: ev.target.value })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "profileNote", children: "\u2013" }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            "input",
            {
              type: "time",
              className: "input",
              value: t.end,
              "aria-label": "\u7ED3\u675F\u65F6\u95F4",
              onChange: (ev) => patchTime(i, ti, { end: ev.target.value })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            "button",
            {
              type: "button",
              className: "rowBtn danger",
              "aria-label": "\u5220\u9664\u8BE5\u65F6\u95F4\u6BB5",
              onClick: () => patchSeg(i, { times: seg.times.filter((_, at) => at !== ti) }),
              children: "\xD7"
            }
          )
        ] }, ti)),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "button",
          {
            type: "button",
            className: "rowBtn",
            onClick: () => patchSeg(i, { times: [...seg.times, { start: "09:00", end: "18:00" }] }),
            children: "\uFF0B \u65F6\u95F4\u6BB5"
          }
        )
      ] })
    ] }, i)),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "profileActions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "button",
        {
          type: "button",
          className: "rowBtn",
          onClick: () => setSegs([...p.segments, { weekdays: [], times: [] }]),
          children: "\uFF0B \u6DFB\u52A0\u5B50\u89C4\u5219"
        }
      ),
      p.segments.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "button",
        {
          type: "button",
          className: "rowBtn danger",
          onClick: () => setSegs(p.segments.slice(0, -1)),
          children: "\u5220\u9664\u6700\u540E\u4E00\u6BB5"
        }
      ) : null
    ] })
  ] });
}
function SettingsPage() {
  const [data, setData] = import_react13.default.useState(null);
  const [draft, setDraft] = import_react13.default.useState({});
  const [busy, setBusy] = import_react13.default.useState(false);
  const [msg4, setMsg] = import_react13.default.useState("");
  const [err, setErr] = import_react13.default.useState("");
  const [activeTab, setActiveTab] = import_react13.default.useState("scheduler");
  const [ruleGroups, setRuleGroups] = import_react13.default.useState(freshGroups());
  const [deployments, setDeployments] = import_react13.default.useState([]);
  const [logicalModels, setLogicalModels] = import_react13.default.useState([]);
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
      setErr(`\u8BFB\u53D6\u5931\u8D25:${errText(e)}`);
    } finally {
      setBusy(false);
    }
  }
  async function loadReqLog() {
    try {
      const r = await rendererApi.getRequestLog();
      setReqLog(r);
    } catch (e) {
      setLogMsg(`\u8BFB\u53D6\u8BF7\u6C42\u65E5\u5FD7\u72B6\u6001\u5931\u8D25:${errText(e)}`);
    }
  }
  async function loadDeployments() {
    try {
      const r = await rendererApi.getDeployments();
      setDeployments(r.deployments);
    } catch {
    }
  }
  async function loadLogicalModels() {
    try {
      setLogicalModels(await rendererApi.getLogicalModels());
    } catch {
    }
  }
  import_react13.default.useEffect(() => {
    void load();
    void loadReqLog();
    void loadDeployments();
    void loadLogicalModels();
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
    const profilesJson = serializeProfiles(groups);
    console.log(
      "[\u8C03\u5EA6\u89C4\u5219] \u4FDD\u5B58 - \u6E05\u6D17\u540E\u6700\u7EC8 JSON:",
      JSON.stringify(
        {
          ...JSON.parse(serializeGroups(groups)),
          "scheduler.cooldown_overrides": JSON.parse(cooldownJson),
          "scheduler.window_profiles": JSON.parse(profilesJson)
        },
        null,
        2
      )
    );
    setDraft((d) => ({
      ...d,
      scheduler: {
        ...d.scheduler ?? {},
        ...rulesFields,
        "scheduler.cooldown_overrides": cooldownJson,
        "scheduler.window_profiles": profilesJson
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
    if (JSON.stringify(profilesJson) !== JSON.stringify(origScheduler["scheduler.window_profiles"] ?? "")) {
      schedOut["scheduler.window_profiles"] = profilesJson;
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
      setErr(`\u4FDD\u5B58\u5931\u8D25:${errText(e)}`);
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
      setLogMsg(`\u4FDD\u5B58\u5931\u8D25:${errText(e)}`);
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
    const on = value === "true" || value === "1";
    let control;
    if (kind === "bool") {
      control = /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("label", { className: "setting-check", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "input",
          {
            type: "checkbox",
            className: "checkInput",
            checked: on,
            disabled: busy,
            onChange: (ev) => setValue(section, spec, ev.target.checked)
          }
        ),
        on ? "\u5DF2\u542F\u7528" : "\u5DF2\u5173\u95ED"
      ] });
    } else if (kind === "enum") {
      control = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "select",
        {
          className: "input selectInput",
          value,
          disabled: busy,
          onChange: (ev) => setValue(section, spec, ev.target.value),
          children: (spec.options ?? []).map((opt) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: opt.value, children: opt.label }, opt.value))
        }
      );
    } else if (kind === "json") {
      control = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "textarea",
        {
          className: "input setting-json",
          rows: 3,
          value,
          disabled: busy,
          onChange: (ev) => setValue(section, spec, ev.target.value)
        }
      );
    } else {
      control = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "input",
        {
          className: "input" + (wide ? " wideInput" : ""),
          type: kind === "int" || kind === "float" ? "number" : "text",
          min: spec.min,
          max: spec.max,
          step: kind === "float" ? "0.1" : void 0,
          value,
          disabled: busy,
          onChange: (ev) => setValue(section, spec, ev.target.value)
        }
      );
    }
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_react13.default.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "k", children: spec.label }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v", children: control })
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
      // ⚠️ 2026-11-09:WorkBuddy 的「账号最小请求间隔」已从设置项**移除**
      // (写死在 core 的 `ACCOUNT_MIN_INTERVAL_MS` = 4 秒)—— 它是账号安全下限,
      // 不该让用户调成 0 把节流关掉(那正是 11140 封号的成因)。
      {
        // ⚠️ `retry.logical_cooldown` **不在这里** —— 2026-11 用户定案移到「冷却」卡
        // （同为「失败后多久不选」的语境）。`specOf` 只按 key 查、不看 section，
        // 所以两边都写就会重复渲染同一个字段。
        title: "\u91CD\u8BD5\u6B21\u6570",
        fields: pick(["real.wait_budget_s", "retry.logical_max", "retry.real_max"])
      }
    ];
  }
  const providerOptions = [...new Set(deployments.map((d) => d.provider))].sort();
  function modelOptionsFor(provider) {
    const src = provider ? deployments.filter((d) => d.provider === provider) : deployments;
    return [...new Set(src.map((d) => d.model))].sort();
  }
  const ruleProfiles = ruleGroups.profiles;
  const schedListRef = import_react13.default.useRef(null);
  const dragSrcRef = import_react13.default.useRef(null);
  const dropTargetRef = import_react13.default.useRef(null);
  const lastPointRef = import_react13.default.useRef(null);
  const [dragSrc, setDragSrc] = import_react13.default.useState(null);
  const [dropTarget, setDropTarget] = import_react13.default.useState(null);
  const [dragOutside, setDragOutside] = import_react13.default.useState(false);
  import_react13.default.useEffect(() => {
    if (dragSrc === null) return;
    const onDocDragOver = (e) => {
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      const rect = schedListRef.current?.getBoundingClientRect();
      setDragOutside(rect ? outsideRect(rect, e.clientX, e.clientY, 8) : false);
    };
    document.addEventListener("dragover", onDocDragOver);
    return () => document.removeEventListener("dragover", onDocDragOver);
  }, [dragSrc]);
  import_react13.default.useEffect(() => {
    if (dragSrc === null) return;
    const clear = () => {
      dragSrcRef.current = null;
      dropTargetRef.current = null;
      setDragSrc(null);
      setDropTarget(null);
      setDragOutside(false);
    };
    document.addEventListener("dragend", clear);
    document.addEventListener("drop", clear);
    return () => {
      document.removeEventListener("dragend", clear);
      document.removeEventListener("drop", clear);
    };
  }, [dragSrc]);
  function bandsOf(tier) {
    const root = schedListRef.current;
    if (root === null) return [];
    return [...root.querySelectorAll(`li[data-tier="${tier}"]`)].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
  }
  function onRuleDragStart(tier, index, e) {
    dragSrcRef.current = { tier, index, handled: false };
    dropTargetRef.current = null;
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    setDragSrc({ tier, index });
    setDropTarget(null);
    setDragOutside(false);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${tier}:${index}`);
  }
  function onSegDragOver(tier, e) {
    if (dragSrcRef.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const insertAt = insertIndexAt(bandsOf(tier), e.clientY);
    dropTargetRef.current = { tier, insertAt };
    setDropTarget({ tier, insertAt });
  }
  function onSegDrop(tier, e) {
    e.preventDefault();
    const d = dragSrcRef.current;
    if (d === null) return;
    d.handled = true;
    const target = { tier, insertAt: insertIndexAt(bandsOf(tier), e.clientY) };
    dropTargetRef.current = null;
    dragMoveRule({ tier: d.tier, index: d.index }, target);
  }
  function onRuleDragEnd(e) {
    const d = dragSrcRef.current;
    const pending = dropTargetRef.current;
    dragSrcRef.current = null;
    dropTargetRef.current = null;
    setDragSrc(null);
    setDropTarget(null);
    setDragOutside(false);
    if (d === null) return;
    if (d.handled) return;
    const rect = schedListRef.current?.getBoundingClientRect();
    const p = e.clientX !== 0 || e.clientY !== 0 ? { x: e.clientX, y: e.clientY } : lastPointRef.current ?? null;
    if (rect && p && outsideRect(rect, p.x, p.y, 8)) {
      removeTier(d.tier, d.index);
      return;
    }
    if (pending !== null) dragMoveRule({ tier: d.tier, index: d.index }, pending);
  }
  function updateRules(next) {
    setRuleGroups(next);
    const rulesFields = serializeRulesByKey(next);
    setDraft((d) => ({
      ...d,
      scheduler: {
        ...d.scheduler ?? {},
        ...rulesFields,
        "scheduler.cooldown_overrides": serializeCooldowns(next),
        "scheduler.window_profiles": serializeProfiles(next)
      }
    }));
  }
  function dragMoveRule(from, to) {
    const fromList = tierList(from.tier);
    const rule = fromList[from.index];
    if (rule === void 0) return;
    if (from.tier === to.tier) {
      updateRules({ ...ruleGroups, [from.tier]: moveItemTo(fromList, from.index, to.insertAt) });
      return;
    }
    const targetList = [...tierList(to.tier)];
    const at = Math.max(0, Math.min(targetList.length, to.insertAt));
    targetList.splice(at, 0, rule);
    updateRules({
      ...ruleGroups,
      [from.tier]: fromList.filter((_, i) => i !== from.index),
      [to.tier]: targetList
    });
  }
  function patchProfile(id, patch) {
    updateRules({
      ...ruleGroups,
      profiles: ruleGroups.profiles.map((p) => p.id === id ? { ...p, ...patch } : p)
    });
  }
  function addProfile() {
    const id = `custom-${Date.now().toString(36)}`;
    updateRules({
      ...ruleGroups,
      profiles: [...ruleGroups.profiles, { id, name: "\u65B0\u65F6\u6BB5", segments: [] }]
    });
  }
  function removeProfile(id) {
    updateRules({ ...ruleGroups, profiles: ruleGroups.profiles.filter((p) => p.id !== id) });
  }
  const TIER_KEYS = ["free", "expiry", "degrade", "disabled"];
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
    updateRules({ ...ruleGroups, [key]: [...tierList(key), { provider: "", model: "", expires_at: "", profile: "" }] });
  }
  function removeTier(key, i) {
    updateRules({ ...ruleGroups, [key]: tierList(key).filter((_, at) => at !== i) });
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
    const base = parseCooldowns(s.scheduler?.["scheduler.cooldown_overrides"], res.ok ? res.groups : freshGroups());
    const groups = { ...base, profiles: parseProfiles(s.scheduler?.["scheduler.window_profiles"]) };
    setRuleGroups(groups);
  }
  function schedulerPanels() {
    const out = [];
    const segments2 = [
      { key: "free", badge: "P1", title: "\u9AD8\u4F18\u5148" },
      { key: "expiry", badge: "P2", title: "\u6B21\u4F18\u5148" },
      { key: "degrade", badge: "P4", title: "\u4F4E\u4F18\u5148" },
      { key: "disabled", badge: "\u7981\u7528", title: "\u7981\u7528" }
    ];
    const rows = [];
    for (const seg of segments2) {
      const list = tierList(seg.key);
      rows.push(
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
          "li",
          {
            className: "sched-sep",
            onDragOver: (e) => onSegDragOver(seg.key, e),
            onDrop: (e) => onSegDrop(seg.key, e),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "rowTag sched-sep-badge", children: seg.badge }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "sched-sep-title", children: seg.title }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "card-extra", children: [
                list.length,
                " \u6761"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "rowBtn sched-sep-add", onClick: () => addTier(seg.key), children: "\uFF0B \u6DFB\u52A0" })
            ]
          },
          `sep-${seg.key}`
        )
      );
      for (const [i, r] of list.entries()) {
        rows.push(
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            "li",
            {
              className: "schedRowOuter",
              "data-tier": seg.key,
              onDragOver: (e) => onSegDragOver(seg.key, e),
              onDrop: (e) => onSegDrop(seg.key, e),
              children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                RuleRow,
                {
                  rule: r,
                  profiles: ruleProfiles,
                  providerOptions,
                  modelOptions: modelOptionsFor(r.provider),
                  dragging: dragSrc !== null && dragSrc.tier === seg.key && dragSrc.index === i,
                  dropBefore: dropTarget !== null && dropTarget.tier === seg.key && dropTarget.insertAt === i,
                  onDragStart: (e) => onRuleDragStart(seg.key, i, e),
                  onDragEnd: onRuleDragEnd,
                  onPatch: (patch) => patchTier(seg.key, i, patch),
                  onRemove: () => removeTier(seg.key, i)
                }
              )
            },
            `${seg.key}-${r.provider}-${r.model}-${i}`
          )
        );
      }
      if (dropTarget !== null && dropTarget.tier === seg.key && dropTarget.insertAt === list.length) {
        rows.push(/* @__PURE__ */ (0, import_jsx_runtime15.jsx)("li", { className: "dropMarker", "aria-hidden": "true" }, `drop-${seg.key}`));
      }
    }
    out.push(
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "card setting-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "card-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: "\u8C03\u5EA6\u4F18\u5148\u7EA7" }),
          dragOutside ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "chainHint chainHintDanger", children: "\u677E\u624B\u5373\u5220\u9664" }) : null
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "ul",
          {
            className: `rows sched-rows${dragOutside ? " schedRowsOutside" : ""}`,
            ref: (el) => {
              schedListRef.current = el;
              if (el === null) return;
              void el;
            },
            onDragOver: (e) => {
              if (dragSrcRef.current === null) return;
              e.preventDefault();
            },
            children: rows
          }
        )
      ] }, "sched-list")
    );
    return out;
  }
  function profilesCard() {
    const list = ruleGroups.profiles;
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "card setting-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "card-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: "\u65F6\u6BB5\u914D\u7F6E" }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "btn btn-sm", onClick: addProfile, children: "\uFF0B \u6DFB\u52A0\u65F6\u6BB5" })
      ] }),
      list.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("ul", { className: "rows profileRows", children: list.map((p) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        ProfileCard,
        {
          profile: p,
          onPatch: (patch) => patchProfile(p.id, patch),
          onRemove: () => removeProfile(p.id)
        },
        p.id
      )) })
    ] }, "profiles");
  }
  function miscSchedCard() {
    const routeSpecs = ROUTE_KEYS.map((k) => specOf(k)).filter((s) => s !== void 0);
    const modeSpec = specOf("compaction.promptMode");
    if (pinSecondsSpec === void 0 && routeSpecs.length === 0 && modeSpec === void 0) return null;
    const names = logicalModels.map((m) => m.model).filter((m) => m !== "").sort();
    const labelOf3 = (name2) => {
      const hit = logicalModels.find((m) => m.model === name2);
      return hit?.display_name && hit.display_name !== name2 ? `${hit.display_name}(${name2})` : name2;
    };
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "card setting-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "card-head", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: "\u8F85\u52A9\u8BF7\u6C42\u8DEF\u7531" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "kv-grid kv-wide-grid", children: [
        routeSpecs.map((spec) => {
          const value = draft.route?.[spec.key] ?? "";
          const options = value === "" || names.includes(value) ? names : [value, ...names];
          return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_react13.default.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "k", children: spec.label }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
              "select",
              {
                className: "input selectInput",
                value,
                disabled: busy,
                onChange: (ev) => setValue("route", spec, ev.target.value),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: "", children: "\u4E0D\u91CD\u8DEF\u7531" }),
                  options.map((n4) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: n4, children: labelOf3(n4) }, n4))
                ]
              }
            ) })
          ] }, spec.key);
        }),
        modeSpec !== void 0 ? field("compaction", modeSpec) : null,
        pinSecondsSpec !== void 0 ? field("scheduler", pinSecondsSpec) : null
      ] })
    ] }, "misc");
  }
  function cooldownCard() {
    const g = ruleGroups;
    const memberSpec = specOf("retry.logical_cooldown");
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { className: "card setting-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "card-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: "\u51B7\u5374" }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "btn btn-sm", onClick: addCooldown, children: "\uFF0B \u6DFB\u52A0\u4F9B\u5E94\u5546" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("ul", { className: "rows sched-rows cooldownRows", children: [
        memberSpec !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("li", { className: "rowCard ruleRowCard", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "ruleRowLine", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "cooldownFieldLabel", title: memberSpec.label, children: memberSpec.label }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            "input",
            {
              type: "number",
              min: memberSpec.min,
              max: memberSpec.max,
              className: "input ruleField ruleNum",
              title: `${memberSpec.label}(\u5206\u949F)`,
              value: draft[sectionOf(memberSpec)]?.[memberSpec.key] ?? "",
              disabled: busy,
              onChange: (ev) => setValue(sectionOf(memberSpec), memberSpec, ev.target.value)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "ruleUnit", children: "\u5206\u949F" })
        ] }) }) : null,
        g.cooldown.map((r, i) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          CooldownRuleRow,
          {
            rule: r,
            providerOptions,
            onPatch: (patch) => patchCooldown(i, patch),
            onRemove: () => removeCooldown(i)
          },
          i
        ))
      ] })
    ] });
  }
  const ROUTE_KEYS = ["route.compact", "route.vision", "route.session_title"];
  function sectionCard(section) {
    const specs = specsOf(section);
    if (specs.length === 0) return null;
    const meta = SECTION_TITLES[section];
    let body;
    if (section === "retry") {
      body = /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "setting-groups", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "setting-group-cols", children: retryGroups().map((grp) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "setting-group", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "setting-group-title", children: grp.title }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "kv-grid", children: grp.fields.map((s) => field("retry", s)) })
        ] }, grp.title)) }),
        codesField ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "kv-grid", children: field("retry", codesField, true) }) : null,
        chartBlock
      ] });
    } else {
      body = /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "kv-grid", children: specs.map((s) => field(section, s)) });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { id: section, className: "card setting-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "card-head", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: meta.title }) }),
      body
    ] }, section);
  }
  const chart = backoffChart(draft);
  const codesField = specOf("retry.codes");
  const pinSecondsSpec = specOf("scheduler.pin_seconds");
  const chartBlock = /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "ui-chart-wrap", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("svg", { className: "ui-chart", viewBox: `0 0 ${chart.W} ${chart.H}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("line", { className: "ui-chart-yaxis", x1: chart.padL, y1: chart.padT, x2: chart.padL, y2: chart.y(0) }),
      chart.yTicks.map((t) => /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("g", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("line", { className: "ui-chart-grid", x1: chart.padL, y1: t.y, x2: chart.W - chart.padR, y2: t.y }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("text", { className: "ui-chart-label", x: chart.padL - 6, y: t.y, textAnchor: "end", dominantBaseline: "middle", children: chart.fmtAxis(t.v) })
      ] }, `y${t.v}`)),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("line", { className: "ui-chart-axis", x1: chart.padL, y1: chart.y(0), x2: chart.W - chart.padR, y2: chart.y(0) }),
      chart.seq.map((v, i) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
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
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("line", { className: "ui-chart-dash", x1: chart.dashX, y1: chart.padT, x2: chart.dashX, y2: chart.y(0) }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("polyline", { className: "ui-chart-line", points: chart.seq.map((v, i) => `${chart.x(i)},${chart.y(v)}`).join(" ") }),
      chart.seq.map((v, i) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("circle", { className: "ui-chart-dot", cx: chart.x(i), cy: chart.y(v), r: 4 }, `dot${i}`)),
      chart.seq.map((_v, i) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("text", { className: "ui-chart-tick", x: chart.x(i), y: chart.H - 8, textAnchor: "middle", children: i + 1 }, `tick${i}`))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "ui-chart-text", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { children: chart.seqText }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { children: chart.budgetKText }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { children: chart.budgetMText })
    ] })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "settings-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h1", { className: "page-title", children: "\u8BBE\u7F6E" }),
    busy ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "hint", children: "\u52A0\u8F7D\u4E2D\u2026" }) : null,
    err ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "ov-err", children: err }) : null,
    data ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("nav", { className: "subtabs", role: "tablist", "aria-label": "\u8BBE\u7F6E\u5206\u7C7B", children: SETTINGS_TABS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": activeTab === t.key,
          className: `subtab${activeTab === t.key ? " on" : ""}`,
          onClick: () => setActiveTab(t.key),
          children: t.label
        },
        t.key
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "settings-body", children: [
        activeTab === "scheduler" ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
          schedulerPanels(),
          profilesCard(),
          miscSchedCard()
        ] }) : null,
        activeTab === "policy" ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
          sectionCard("retry"),
          cooldownCard()
        ] }) : null,
        activeTab === "misc" ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
          sectionCard("external_refresh"),
          sectionCard("ui"),
          reqLog ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { id: "request-log", className: "card setting-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "card-head", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: "\u8BF7\u6C42\u65E5\u5FD7" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "kv-grid", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "k", children: "\u8BB0\u5F55\u6863\u4F4D" }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
                "select",
                {
                  className: "input selectInput",
                  value: reqLog.content_mode,
                  disabled: busy,
                  onChange: (ev) => void saveReqLog(ev.target.value),
                  children: reqLog.content_modes.map((m) => /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("option", { value: m.value, children: m.label }, m.value))
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "k", children: "\u843D\u76D8\u4F4D\u7F6E" }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "v", children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "setting-key-row", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("code", { className: "setting-key", children: reqLog.path }),
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "pill", children: [
                    reqLog.counters?.written ?? 0,
                    " \u6761"
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "pill", children: [
                    reqLog.size_bytes,
                    " \u5B57\u8282"
                  ] })
                ] }),
                reqLog.last_error ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "ov-err", children: [
                  "\u4E0A\u6B21\u8BB0\u5F55\u5931\u8D25:",
                  reqLog.last_error
                ] }) : null
              ] })
            ] }),
            logMsg ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: "hint", children: logMsg }) : null
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("section", { id: "readonly", className: "card setting-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "card-head", children: /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("h2", { children: "\u53EA\u8BFB\u4FE1\u606F" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "kv-grid", children: [
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "k", children: "ONE_API_KEY" }),
              /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "v", children: data.master_key ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "setting-key-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("code", { className: "setting-key", children: data.master_key }),
                /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "btn btn-sm", disabled: busy, onClick: () => void copyKey(), children: keyCopied ? "\u5DF2\u590D\u5236 \u2713" : "\u590D\u5236" })
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "ov-err", children: "\u672A\u8BBE\u7F6E" }) })
            ] })
          ] })
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "setting-savebar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "setting-savebar-count", children: totalChanged() > 0 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(import_jsx_runtime15.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "setting-savebar-dot" }),
          totalChanged(),
          " \u9879\u672A\u4FDD\u5B58"
        ] }) : "\u6CA1\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" }),
        msg4 ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { className: "setting-savebar-msg", children: msg4 }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("span", { className: "setting-savebar-btns", children: [
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("button", { type: "button", className: "secondaryButton", disabled: busy, onClick: discard, children: "\u653E\u5F03\u6539\u52A8" }),
          /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
            "button",
            {
              type: "button",
              className: "primaryButton",
              disabled: busy || totalChanged() === 0,
              onClick: () => void save(),
              children: "\u4FDD\u5B58\u8BBE\u7F6E"
            }
          )
        ] })
      ] })
    ] }) : null
  ] });
}

// panel-ui/App.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
var NAV_ITEMS = [
  { key: "overview", label: "\u603B\u89C8" },
  { key: "models", label: "\u6A21\u578B" },
  { key: "usage", label: "\u7528\u91CF\u7EDF\u8BA1" },
  { key: "settings", label: "\u8BBE\u7F6E" }
];
function App() {
  const [page, setPage] = import_react14.default.useState("overview");
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "app", children: [
    /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("header", { className: "topbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "brand", children: "As One \xB7 \u5408\u4E00" }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(NavTabs, { tabs: NAV_ITEMS, active: page, onChange: (k) => setPage(k) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "app-scroll", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("main", { className: "content", children: [
      page === "overview" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(OverviewPage, {}) : null,
      page === "models" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(ModelsPage_default, {}) : null,
      page === "usage" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(UsageStatsPage, {}) : null,
      page === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(SettingsPage, {}) : null
    ] }) })
  ] });
}

// panel-ui/components/ClientPaths.tsx
var import_jsx_runtime17 = require("react/jsx-runtime");

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

// panel-ui/styles.css
var styles_default = '/*\r\n * As One \u7BA1\u7406\u9762\u677F\u5168\u5C40\u6837\u5F0F(plain CSS,\u65E0\u6846\u67B6)\u3002\r\n * 2026-11-02 \u5B9A\u6848:\u914D\u8272**\u8054\u52A8 DSH \u4E3B\u9898** \u2014\u2014 \u9762\u677F\u5168\u90E8\u989C\u8272\u8D70\u5BBF\u4E3B\u4E3B\u9898\u4EE4\u724C\r\n * (`--dsw-alias-*`),`dsh-ui-appearance` \u901A\u8FC7 `ctx.theme.overrideTokens()` \u8986\u76D6\u7684\r\n * \u6B63\u662F\u8FD9\u6279\u4EE4\u724C(\u80CC\u666F/\u9762\u677F/\u6587\u5B57/\u4E3B\u8272/\u8FB9\u6846/\u6309\u94AE/\u4EA4\u4E92\u6001),\u6DF1\u6D45\u53CC\u6A21\u81EA\u52A8\u5207\u6362\u3002\r\n * \u5C11\u6570\u5BBF\u4E3B\u539F\u751F\u4EE4\u724C(\u6EDA\u52A8\u6761 `--dsw-alias-scrollbar-*`\u3001\u72B6\u6001\u8272 `--dsw-alias-state-*`)\r\n * \u63D2\u4EF6\u4E0D\u8986\u76D6,\u4F46\u7531 DSH \u4E3B\u9898\u81EA\u8EAB\u6309\u6DF1\u6D45\u6A21\u5F0F\u7ED9\u51FA,\u540C\u6837\u4E0D\u7528\u5199\u6B7B\u3002\r\n * \u4EE4\u724C\u7F3A\u5E2D\u65F6(\u72EC\u7ACB Electron \u9762\u677F\u7B49\u65E0 DSH \u4E3B\u9898\u7684\u73AF\u5883)\u56DE\u9000\u5230\u5185\u7F6E\u6697\u8272\u7CFB,\u89C2\u611F\u4E0D\u53D8\u3002\r\n */\r\n\r\n.asone-panel * {\r\n  box-sizing: border-box;\r\n}\r\n\r\n.asone-panel {\r\n  /*\r\n   * \u8C03\u8272\u677F:\u6240\u6709\u989C\u8272\u90FD\u53D6\u81EA DSH \u5BBF\u4E3B\u4E3B\u9898\u4EE4\u724C\u5C42(--dsw-alias-*)\u3002\r\n   * dsh-ui-appearance \u8986\u76D6\u7684\u6B63\u662F\u540C\u4E00\u5C42\u4EE4\u724C,\u6240\u4EE5\u5B83\u6362\u914D\u8272\u65B9\u6848/\u6362\u76AE\u80A4\u65F6,\r\n   * \u9762\u677F\u6574\u4F53\u5B9E\u65F6\u8DDF\u968F,\u4E0D\u9700\u8981\u5728\u8FD9\u91CC\u5199\u6B7B\u4EFB\u4F55\u4E00\u4E2A\u989C\u8272\u3002\r\n   * \u9017\u53F7\u540E\u7684 hex \u53EA\u662F\u300C\u72EC\u7ACB Electron(\u6CA1\u6709 DSH \u5BBF\u4E3B\u3001\u6CA1\u6709\u4EE4\u724C)\u300D\u7684\u515C\u5E95\u503C,\r\n   * \u5728 DSH \u4E0B\u6C38\u8FDC\u4E0D\u4F1A\u88AB\u7528\u5230\u3002\r\n   */\r\n  --bg: var(--dsw-alias-bg-base, #101722);\r\n  /*\r\n   * \u80CC\u666F\u5C42(\u4E0D\u662F\u9762\u677F\u5C42):dsh-ui-appearance \u5F00\u4E86\u58C1\u7EB8/\u89C6\u9891\u65F6\u4F1A\u628A\r\n   * --dsw-alias-bg-base \u5199\u6210 transparent,\u4E8E\u662F\u8FD9\u4E00\u5C42\u76F4\u63A5\u900F\u51FA\u80CC\u666F\u56FE,\r\n   * \u9876\u680F\u7528\u5B83\u5C31\u300C\u8DDF\u968F\u80CC\u666F\u300D\u800C\u4E0D\u662F\u300C\u8DDF\u968F\u9762\u677F\u300D\u3002\r\n   * \u515C\u5E95\u503C\u7ED9 transparent:\u72EC\u7ACB Electron \u91CC body \u81EA\u5DF1\u6709\u5E95\u8272,\u9876\u680F\u900F\u660E = \u4E0E body \u540C\u8272\u3002\r\n   */\r\n  --bg-base: var(--dsw-alias-bg-base, transparent);\r\n  --bg-card: var(--dsw-alias-bg-layer-1, #141b26);\r\n  --bg-deep: var(--dsw-alias-bg-layer-2, #10141a);\r\n  --border: var(--dsw-alias-border-l2, #2c3a4d);\r\n  --border-soft: var(--dsw-alias-border-l1, #22303f);\r\n  /*\r\n   * \u5B57\u8272\u4E09\u7EA7(2026-11-03 \u7528\u6237\u5B9A\u6848\u300C\u52A0\u5927\u9ED1\u5B57\u6BD4\u4F8B\u300D):\r\n   *   --text       \u4E3B\u5B57\u8272(label-primary)\u3002\u6D45\u8272\u4E3B\u9898\u4E0B\u5C31\u662F\u9ED1\u5B57,\u6DF1\u8272\u4E3B\u9898\u4E0B\u662F\u767D\u5B57\u3002\r\n   *   --text-soft  \u6B21\u5B57\u8272(label-secondary)\u3002\u53EA\u7559\u7ED9**\u8F85\u52A9\u8BF4\u660E**:\u63D0\u793A/\u6CE8\u91CA/\u526F\u6807\u9898/\u5360\u4F4D\u7B26\u3002\r\n   *   --dim        \u6700\u5F31(label-tertiary)\u3002\u53EA\u7559\u7ED9**\u88C5\u9970\u6027**\u5185\u5BB9:\u6298\u53E0\u7BAD\u5934\u3001\u7A7A\u6001\u3001\u8FB9\u6846\u65C1\u6CE8\u3002\r\n   *\r\n   * \u5206\u7EA7\u53E3\u5F84:**\u51E1\u662F\u300C\u4FE1\u606F\u300D\u90FD\u7528 --text** \u2014\u2014 \u6807\u9898\u3001\u6570\u503C\u3001\u540D\u79F0\u3001\u8868\u5934\u3001\u5B57\u6BB5\u540D\u3001\r\n   * \u5FBD\u6807\u3001\u6309\u94AE\u6587\u5B57\u3001\u8F93\u5165\u6846\u91CC\u7684\u5185\u5BB9\u3001\u8868\u683C\u5355\u5143\u683C\u503C\u4E00\u5F8B\u4E3B\u5B57\u8272;\r\n   * \u53EA\u6709\u300C\u8BF4\u660E\u300D\u624D\u964D\u7EA7,\u8BF4\u660E\u662F\u7ED9\u4EBA\u8BFB\u4E0A\u4E0B\u6587\u7528\u7684,\u4E0D\u8BE5\u8DDF\u4FE1\u606F\u62A2\u6CE8\u610F\u529B\u3002\r\n   * \u6539\u9020\u540E\u4E3B\u5B57\u8272\u5360\u6BD4 19% \u2192 66%,\u5F31\u8272\u53EA\u5269 63 \u5904\u3002\r\n   */\r\n  --text: var(--dsw-alias-label-primary, #e8eef5);\r\n  --text-soft: var(--dsw-alias-label-secondary, #cfe3f5);\r\n  --dim: var(--dsw-alias-label-tertiary, #8b94a3);\r\n  /* \u5F3A\u8C03\u8272\u9762\u4E0A\u7684\u5B57\u8272:\u63D2\u4EF6\u6309\u5F3A\u8C03\u8272\u7B97\u5BF9\u6BD4\u5EA6\u540E\u7ED9\u51FA */\r\n  --on-accent: var(--dsw-alias-label-primary-foreground, #f2f6fc);\r\n  --ok: var(--dsw-alias-state-success-primary, #5fbf7d);\r\n  --bad: var(--dsw-alias-state-error-primary, #e0685f);\r\n  --warn: var(--dsw-alias-state-warn-primary, #d9a441);\r\n  --accent: var(--dsw-alias-brand-primary, #4d6bfe);\r\n  --chip-bg: var(--dsw-alias-bg-layer-2, #232a33);\r\n  --fill: var(--dsw-alias-fill-l1, #1c2430);\r\n  /*\r\n   * \u73BB\u7483\u9762:\u8FD9\u91CC\u7EDD\u5BF9\u4E0D\u80FD\u518D\u53E0\u4E00\u6B21 alpha\u3002\r\n   * dsh-ui-appearance \u5728 surfaceAlpha < 1 \u65F6\u5DF2\u7ECF\u628A\u900F\u660E\u5EA6\u70D8\u7119\u8FDB\r\n   * --dsw-alias-bg-layer-1/2 \u4E0E --dsw-alias-interactive-bg-hover;\r\n   * \u9762\u677F\u82E5\u518D color-mix(..., transparent),\u5B9E\u9645\u4E0D\u900F\u660E\u5EA6\u4F1A\u8FDC\u4F4E\u4E8E\u7528\u6237\u8BBE\u5B9A\u503C,\r\n   * \u58C1\u7EB8\u4E0A\u6B63\u6587\u76F4\u63A5\u7CCA\u6389\u3002\u4EE4\u724C\u76F4\u63A5\u7528,\u65E7\u7684\u534A\u900F\u660E\u5199\u6CD5\u53EA\u7559\u4F5C\u72EC\u7ACB Electron \u7684\u515C\u5E95\u3002\r\n   */\r\n  --surface: var(--dsw-alias-bg-layer-1, color-mix(in srgb, #141b26 64%, transparent));\r\n  --surface-deep: var(--dsw-alias-bg-layer-2, color-mix(in srgb, #10141a 56%, transparent));\r\n  --surface-hover: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, #1f2732 72%, transparent));\r\n  /* \u72B6\u6001\u9762:\u989C\u8272\u6765\u81EA\u4EE4\u724C,\u53EA\u56FA\u5B9A\u6BD4\u4F8B */\r\n  --surface-ok: color-mix(in srgb, var(--ok) 12%, transparent);\r\n  --surface-bad: color-mix(in srgb, var(--bad) 12%, transparent);\r\n  --surface-warn: color-mix(in srgb, var(--warn) 12%, transparent);\r\n  --ok-line: color-mix(in srgb, var(--ok) 45%, transparent);\r\n  --bad-line: color-mix(in srgb, var(--bad) 45%, transparent);\r\n  --warn-line: color-mix(in srgb, var(--warn) 45%, transparent);\r\n  /* \u5F3A\u8C03\u9762 */\r\n  --accent-soft: color-mix(in srgb, var(--accent) 12%, transparent);\r\n  --accent-softer: color-mix(in srgb, var(--accent) 8%, transparent);\r\n  --accent-strong: color-mix(in srgb, var(--accent) 20%, transparent);\r\n  /* \u6C60(\u901A\u7528/\u7279\u6B8A)\u914D\u8272:\u53D6\u4E3B\u9898\u4EE4\u724C,\u6E10\u53D8\u5C3E\u8272\u878D\u8FDB\u9762\u677F\u8272 */\r\n  --pool-general: var(--dsw-alias-brand-primary, #4d6bfe);\r\n  --pool-general-soft: color-mix(in srgb, var(--pool-general) 62%, var(--dsw-alias-bg-layer-1, #141b26));\r\n  --pool-special: var(--dsw-alias-state-warn-primary, #d9a441);\r\n  --pool-special-soft: color-mix(in srgb, var(--pool-special) 62%, var(--dsw-alias-bg-layer-1, #141b26));\r\n  --pool-grad-general: linear-gradient(90deg, var(--pool-general), var(--pool-general-soft));\r\n  --pool-grad-special: linear-gradient(90deg, var(--pool-special), var(--pool-special-soft));\r\n  /*\r\n   * \u6BDB\u73BB\u7483:\u5B8C\u5168\u8DDF\u968F dsh-ui-appearance \u7684 glassBlur \u8BBE\u7F6E\u3002\r\n   * \u63D2\u4EF6\u628A --dsw-appearance-glass-filter \u5199\u5230 body \u4E0A,\u503C\u662F\r\n   * "blur(Npx) saturate(150%)";\u7528\u6237\u628A\u73BB\u7483\u5173\u6389\u65F6\u63D2\u4EF6\u5199 "none",\r\n   * \u9762\u677F\u968F\u4E4B\u5B8C\u5168\u4E0D\u78E8\u7802\u3002\u72EC\u7ACB Electron \u6CA1\u6709\u63D2\u4EF6 \u2192 \u6CA1\u6709\u73BB\u7483\u3002\r\n   */\r\n  --glass: var(--dsw-appearance-glass-filter, none);\r\n  /* \u9634\u5F71 / \u906E\u7F69:\u7EAF\u9ED1\u4E0E\u660E\u6697\u6A21\u5F0F\u65E0\u5173,\u7EDF\u4E00\u6536\u53E3\u5230\u4E00\u4E2A\u4EE4\u724C */\r\n  --shadow: rgb(0 0 0 / 45%);\r\n  --scrim: rgb(0 0 0 / 55%);\r\n  --track: color-mix(in srgb, var(--border) 60%, transparent);\r\n  --hairline: color-mix(in srgb, var(--text) 8%, transparent);\r\n  --mono: "JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace;\r\n}\r\n\r\n.asone-panel,\r\n.asone-panel,\r\n.asone-panel {\r\n  margin: 0;\r\n  padding: 0;\r\n  height: 100%;\r\n}\r\n\r\n.asone-panel {\r\n  background: var(--bg);\r\n  color: var(--text);\r\n  font-family: system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;\r\n  font-size: 13px;\r\n  line-height: 1.55;\r\n}\r\n\r\n/* \u2500\u2500 \u6EDA\u52A8\u6761:\u5168\u5C40\u7EDF\u4E00,\u4E0D\u7528\u7CFB\u7EDF\u81EA\u5E26\u6D45\u8272\u6EDA\u52A8\u6761\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\r\n * \u9875\u9762\u4E00\u5F8B\u7528\u8FD9\u7248\u6DF1\u8272\u7EC6\u6EDA\u52A8\u6761(WebKit \u5185\u6838),\u4E0E\u6697\u8272\u9762\u677F\u4FDD\u6301\u4E00\u81F4;\r\n * Firefox \u7528\u6807\u51C6scrollbar-color \u515C\u5E95\u3002*/\r\n.asone-panel * {\r\n  scrollbar-width: thin;\r\n  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e) transparent;\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar {\r\n  width: 8px;\r\n  height: 8px;\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar-track {\r\n  background: transparent;\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar-thumb {\r\n  background: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e);\r\n  border-radius: 4px;\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar-thumb:hover {\r\n  background: var(--dsw-alias-scrollbar-hover-l2, #4a5d74);\r\n}\r\n\r\n.asone-panel ::-webkit-scrollbar-corner {\r\n  background: transparent;\r\n}\r\n\r\n/*\r\n * \u5E94\u7528\u9AA8\u67B6:\u9876\u680F\u56FA\u5B9A\u5728\u4E0A\u65B9,\u5185\u5BB9\u533A\u81EA\u5DF1\u6EDA\u3002\r\n *\r\n * 2026-11-03 \u7528\u6237\u5B9A\u6848\u300C\u9876\u680F\u8DDF\u968F\u80CC\u666F\u300D\u540E,\u9876\u680F\u4E0D\u80FD\u518D sticky \u2014\u2014\r\n * sticky \u7684\u900F\u660E\u9876\u680F\u4F1A\u88AB\u6EDA\u52A8\u4E0A\u6765\u7684\u5361\u7247\u7A7F\u900F(\u5361\u7247\u6807\u9898\u538B\u5728\u5BFC\u822A\u6587\u5B57\u4E0A)\u3002\r\n * \u6240\u4EE5\u628A\u6EDA\u52A8\u5BB9\u5668\u4E0B\u6C89\u4E00\u5C42:.app \u6491\u6EE1\u5BBF\u4E3B\u7ED9\u7684\u6574\u5217\u9AD8\u5EA6,.topbar \u662F\u4E0D\u6EDA\u52A8\u7684\r\n * \u56FA\u5B9A\u884C(\u80CC\u666F\u900F\u51FA\u58C1\u7EB8),.app-scroll \u624D\u662F\u771F\u6B63\u7684\u6EDA\u52A8\u533A\u3002\r\n */\r\n.asone-panel .app {\r\n  display: flex;\r\n  flex-direction: column;\r\n  height: 100%;\r\n  min-height: 0;\r\n}\r\n\r\n/* \u771F\u6B63\u7684\u6EDA\u52A8\u5BB9\u5668:\u9876\u680F\u4E0B\u9762\u7684\u5185\u5BB9\u533A\u3002 */\r\n.asone-panel .app-scroll {\r\n  flex: 1 1 auto;\r\n  min-height: 0;\r\n  overflow-y: auto;\r\n  scrollbar-width: thin;\r\n  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e) transparent;\r\n}\r\n\r\n/* \u2500\u2500 \u9876\u680F\u4E0E\u5BFC\u822A\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n/*\r\n * 2026-11-03 \u7528\u6237\u5B9A\u6848:\u9876\u680F**\u8DDF\u968F\u80CC\u666F**,\u4E0D\u8DDF\u968F\u9762\u677F\u3002\r\n * \u4E4B\u524D\u8FD9\u91CC\u94FA\u7684\u662F --surface(= bg-layer-1 \u9762\u677F\u5C42),\u5728\u5F00\u58C1\u7EB8\u65F6\u662F\u4E00\u5C42\u767D\u8499\u8499\u7684\r\n * \u9762\u677F\u8272,\u628A\u58C1\u7EB8\u76D6\u4F4F\u4E00\u5C42;\u4E0B\u9762\u5185\u5BB9\u533A\u5374\u662F\u7EAF\u58C1\u7EB8,\u4E24\u8005\u5BF9\u4E0D\u4E0A\u3002\r\n * \u73B0\u5728\u6539\u7528 --bg-base(bg-base \u4EE4\u724C):dsh-ui-appearance \u5F00\u58C1\u7EB8/\u89C6\u9891\u65F6\u628A\u5B83\r\n * \u5199\u6210 transparent \u2192 \u9876\u680F\u76F4\u63A5\u662F\u80CC\u666F\u56FE,\u4E0E\u5185\u5BB9\u533A\u540C\u4E00\u5C42\u80CC\u666F\u3002\r\n * \u72EC\u7ACB Electron(\u6CA1\u6709\u4EE4\u724C)\u65F6\u515C\u5E95 transparent,body \u7684\u5E95\u8272\u81EA\u7136\u900F\u4E0A\u6765\u3002\r\n *\r\n * \u26A0\uFE0F \u4E0D\u518D position:sticky \u2014\u2014 \u5B83\u73B0\u5728\u662F .app \u91CC\u4E0D\u6EDA\u52A8\u7684\u90A3\u4E00\u884C(\u89C1 .app/.app-scroll)\u3002\r\n * \u900F\u660E\u9876\u680F\u4E00\u65E6 sticky,\u6EDA\u52A8\u4E0A\u6765\u7684\u5361\u7247\u4F1A\u76F4\u63A5\u538B\u5728\u5BFC\u822A\u6587\u5B57\u5E95\u4E0B\u3002\r\n */\r\n.asone-panel .topbar {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 24px;\r\n  padding: 0 20px;\r\n  height: 48px;\r\n  flex: none;\r\n  background: var(--bg-base);\r\n  border-bottom: 1px solid var(--border);\r\n  position: relative;\r\n  z-index: 10;\r\n}\r\n\r\n.asone-panel .brand {\r\n  font-size: 15px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n  letter-spacing: 0.02em;\r\n}\r\n\r\n.asone-panel .tabs {\r\n  display: flex;\r\n  gap: 4px;\r\n}\r\n\r\n.asone-panel .tab {\r\n  appearance: none;\r\n  background: transparent;\r\n  border: none;\r\n  color: var(--text);\r\n  font: inherit;\r\n  padding: 6px 14px;\r\n  border-radius: 6px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .tab:hover {\r\n  color: var(--text);\r\n  background: var(--accent-softer);\r\n}\r\n\r\n.asone-panel .tab.on {\r\n  color: var(--text);\r\n  background: var(--accent-strong);\r\n}\r\n\r\n/* \u2500\u2500 \u9875\u9762\u9AA8\u67B6 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .content {\r\n  width: 100%;\r\n  /* \u26A0\uFE0F 2026-10-23:1180px \u2192 1400px\u3002sensenova \u9875\u8981 3 \u5F20 420px \u8D26\u53F7\u5361\u540C\u884C     (3\xD7420 + 2\xD716 = 1292px \u5185\u5BB9 + padding 40px = 1332px),1180px \u653E\u4E0D\u4E0B\r\n     \u53EA\u80FD\u4E24\u5361\u4E00\u884C1400px \u5BCC\u4F59,\u4E14\u7A97\u53E3\u9ED8\u8BA4\u5BBD\u968F\u4E4B\u63D0\u5230 1440px(index.ts)\u3002     \u26A0\uFE0F 2026-10-25(m14379):1400px \u21921680px\u3002920px \u7A97\u53E3\u4E0B\u8981\u8BA9\u8BBE\u7F6E\u9875\r\n     \u300C\u8C03\u5EA6\u89C4\u5219\u300D\u6BCF\u5F20\u5361\u91CC\u7684\u89C4\u5219\u6392\u6210\u4E00\u884C\u30022026-11-18 \u91CD\u505A\u540E\u4E00\u6761\u89C4\u5219\u5C31\u662F\u4E00\u884C\r\n     (.rule-row \u7684 6 \u4E2A .rr-seg),\u9700\u8981\u7EA6 1050px;1680px \u5BCC\u4F59,1920 \u7A97\u53E3\u4E0B\u5C45\u4E2D,\r\n     \u5DE6\u53F3\u5404\u7559 120px\u3002*/\r\n  max-width: 1680px;\r\n  margin: 0 auto;\r\n  padding: 16px 20px 40px;\r\n}\r\n\r\n.asone-panel .page {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n\r\n.asone-panel .page-note,\r\n.asone-panel .hint {\r\n  margin: 0;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .notice {\r\n  padding: 8px 12px;\r\n  border: 1px solid var(--ok);\r\n  border-radius: 6px;\r\n  color: var(--ok);\r\n  background: var(--surface-ok);\r\n}\r\n\r\n.asone-panel .empty {\r\n  padding: 28px 16px;\r\n  text-align: center;\r\n  color: var(--text-soft);\r\n}\r\n\r\n.asone-panel .loading {\r\n  animation: pulse 1.2s ease-in-out infinite;\r\n}\r\n\r\n@keyframes pulse {\r\n  50% {\r\n    opacity: 0.55;\r\n  }\r\n}\r\n\r\n/* \u2500\u2500 \u5361\u7247 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .card {\r\n  background: var(--surface);\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  padding: 14px 16px;\r\n}\r\n\r\n.asone-panel .card-head {\r\n  display: flex;\r\n  align-items: baseline;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  margin-bottom: 10px;\r\n}\r\n\r\n.asone-panel .card-head h2 {\r\n  margin: 0;\r\n  font-size: 14px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .card-extra {\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .card-badges {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n/* \u2500\u2500 \u8868\u683C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .tbl {\r\n  width: 100%;\r\n  border-collapse: collapse;\r\n  font-size: 12.5px;\r\n}\r\n\r\n.asone-panel .tbl th,\r\n.asone-panel .tbl td {\r\n  padding: 6px 10px;\r\n  text-align: left;\r\n  border-bottom: 1px solid var(--border);\r\n  vertical-align: top;\r\n}\r\n\r\n.asone-panel .tbl th {\r\n  color: var(--text);\r\n  font-weight: 500;\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .tbl tbody tr:hover {\r\n  background: var(--accent-softer);\r\n}\r\n\r\n.asone-panel .tbl .num {\r\n  text-align: right;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n\r\n.asone-panel .tbl .bar-col {\r\n  min-width: 140px;\r\n}\r\n\r\n.asone-panel .row-dim td {\r\n  opacity: 0.55;\r\n}\r\n\r\n/* \u2500\u2500 \u6587\u672C\u5DE5\u5177 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .mono {\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .dim-text {\r\n  color: var(--dim);\r\n}\r\n\r\n.asone-panel .err-cell {\r\n  max-width: 280px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  color: var(--bad);\r\n}\r\n\r\n.asone-panel .code-block {\r\n  display: block;\r\n  font-family: var(--mono);\r\n  font-size: 11.5px;\r\n  white-space: pre-wrap;\r\n  word-break: break-all;\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 8px 10px;\r\n}\r\n\r\n/* \u2500\u2500 \u5FBD\u7AE0\u4E0E\u51ED\u636E\u70B9 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .badge {\r\n  display: inline-block;\r\n  padding: 1px 8px;\r\n  border-radius: 999px;\r\n  font-size: 11.5px;\r\n  border: 1px solid transparent;\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .badge-ok {\r\n  color: var(--ok);\r\n  border-color: var(--ok-line);\r\n  background: var(--surface-ok);\r\n}\r\n\r\n.asone-panel .badge-bad {\r\n  color: var(--bad);\r\n  border-color: var(--bad-line);\r\n  background: var(--surface-bad);\r\n}\r\n\r\n.asone-panel .badge-warn {\r\n  color: var(--warn);\r\n  border-color: var(--warn-line);\r\n  background: var(--surface-warn);\r\n}\r\n\r\n.asone-panel .badge-dim {\r\n  color: var(--text);\r\n  border-color: var(--border);\r\n  background: transparent;\r\n}\r\n\r\n.asone-panel .cred-dot {\r\n  display: inline-block;\r\n  width: 8px;\r\n  height: 8px;\r\n  border-radius: 50%;\r\n  flex: none;\r\n}\r\n\r\n.asone-panel .cred-dot.ok {\r\n  background: var(--ok);\r\n}\r\n\r\n.asone-panel .cred-dot.bad {\r\n  background: var(--bad);\r\n}\r\n\r\n.asone-panel .cred-cell {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n\r\n/* \u2500\u2500 KPI \u4E0E\u72B6\u6001\u884C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .status-line {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 16px;\r\n  flex-wrap: wrap;\r\n  padding: 10px 14px;\r\n  background: var(--surface);\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n}\r\n\r\n.asone-panel .kpi-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));\r\n  gap: 12px;\r\n}\r\n\r\n.asone-panel .kpi {\r\n  background: var(--surface);\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  padding: 12px 14px;\r\n}\r\n\r\n.asone-panel .kpi-label {\r\n  color: var(--text);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .kpi-value {\r\n  font-size: 22px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n  font-variant-numeric: tabular-nums;\r\n  margin: 2px 0;\r\n}\r\n\r\n.asone-panel .kpi-sub {\r\n  color: var(--text-soft);\r\n  font-size: 11.5px;\r\n}\r\n\r\n/* \u2500\u2500 \u6761\u5F62 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .bar {\r\n  width: 100%;\r\n  min-width: 90px;\r\n  height: 8px;\r\n  border-radius: 4px;\r\n  background: var(--track);\r\n  overflow: hidden;\r\n}\r\n\r\n.asone-panel .bar-fill {\r\n  height: 100%;\r\n  border-radius: 4px;\r\n}\r\n\r\n.asone-panel .bar-blue {\r\n  background: var(--accent);\r\n}\r\n\r\n.asone-panel .bar-green {\r\n  background: var(--ok);\r\n}\r\n\r\n.asone-panel .bar-orange {\r\n  background: var(--warn);\r\n}\r\n\r\n.asone-panel .bar-na {\r\n  color: var(--text-soft);\r\n}\r\n\r\n.asone-panel .bar-legend {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 10px 18px;\r\n  margin-top: 12px;\r\n}\r\n\r\n.asone-panel .legend-item {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .legend-item .bar {\r\n  width: 90px;\r\n}\r\n\r\n.asone-panel .legend-name {\r\n  min-width: 72px;\r\n}\r\n\r\n/* \u2500\u2500 \u952E\u503C\u7F51\u683C(\u6E20\u9053\u5361/\u8BBE\u7F6E) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .kv-grid {\r\n  display: grid;\r\n  grid-template-columns: 140px 1fr;\r\n  gap: 6px 14px;\r\n  margin-bottom: 10px;\r\n  align-items: center;\r\n}\r\n\r\n/* \u26A0\uFE0F 2026-11 \u4FEE\u300C\u4E0A\u4E0B\u4E0D\u5BF9\u9F50\u300D(\u7528\u6237\u53CD\u590D\u62A5\u7684\u90A3\u4E2A)\uFF1A\r\n * \u6807\u7B7E\u662F\u7EAF\u6587\u5B57\u3001\u63A7\u4EF6\u662F 32px \u7684\u8F93\u5165\u6846\u3002\u5B9E\u6D4B\u6807\u7B7E\u57FA\u7EBF\u6BD4\u8F93\u5165\u6846\u5185\u6587\u5B57\u7684\u57FA\u7EBF\r\n * **\u4F4E 4.9px**(\u4E24\u884C\u6807\u7B7E\u4F4E 9.1px)\uFF0C\u770B\u4E0A\u53BB\u6587\u5B57\u538B\u5728\u6846\u7684\u4E0B\u534A\u90E8\u5206\u3002\r\n * \u4FEE\u6CD5:\u6807\u7B7E**\u4E0D\u52A0 flex**(flex \u9879\u4F1A\u6539\u53D8\u884C\u76D2\u8BA1\u7B97),\u76F4\u63A5\u7528 line-height \u6491\u6EE1\r\n * 32px \u8BA9\u6587\u5B57\u5728\u76D2\u5185\u5C45\u4E2D;\u63A7\u4EF6\u4E5F\u5B9A 32px\u3001\u5185\u90E8\u6587\u5B57\u540C\u7406\u5C45\u4E2D \u2014\u2014 \u4E24\u4FA7\u57FA\u7EBF\u91CD\u5408\u3002 */\r\n.asone-panel .kv-grid .k {\r\n  color: var(--text);\r\n  line-height: 32px;\r\n  min-height: 32px;\r\n}\r\n\r\n.asone-panel .kv-grid .v {\r\n  color: var(--text);\r\n  display: flex;\r\n  align-items: center;\r\n  min-height: 32px;\r\n}\r\n\r\n.asone-panel .kv-grid .v > .input,\r\n.asone-panel .kv-grid .v > .selectInput {\r\n  height: 32px;\r\n  line-height: 30px;\r\n}\r\n\r\n/* \u2500\u2500 \u6309\u94AE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .btn {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: var(--text);\r\n  background: var(--accent-soft);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 5px 14px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .btn:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .btn:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n.asone-panel .btn-sm {\r\n  padding: 2px 10px;\r\n  font-size: 12px;\r\n}\r\n\r\n/* \u2500\u2500 \u9875\u9762\u6807\u9898\u4E0E\u5360\u4F4D\u58F3 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .page-title {\r\n  margin: 0 0 6px;\r\n  font-size: 18px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .page-page-shell {\r\n  padding: 28px 16px;\r\n  text-align: center;\r\n  color: var(--text-soft);\r\n  border: 1px dashed var(--border);\r\n  border-radius: 8px;\r\n}\r\n\r\n/* \u2500\u2500 \u5B50\u6807\u9898\u6761(\u6A21\u578B\u9891\u9053\u58F3) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .subtabs {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  align-items: center;\r\n  gap: 4px;\r\n  min-height: 24px;\r\n  margin: 0 0 14px;\r\n  padding-bottom: 8px;\r\n  border-bottom: 1px solid var(--border);\r\n}\r\n\r\n.asone-panel .subtab {\r\n  appearance: none;\r\n  background: none;\r\n  border: none;\r\n  font: inherit;\r\n  color: var(--text);\r\n  padding: 0 10px;\r\n  line-height: 24px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .subtab:hover {\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .subtab.on {\r\n  color: var(--text);\r\n  background: var(--accent-soft);\r\n  border-radius: 6px;\r\n}\r\n\r\n.asone-panel .subtabs-action {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  margin-left: auto;\r\n}\r\n\r\n.asone-panel .act-note {\r\n  color: var(--text-soft);\r\n  font-size: 11px;\r\n  max-width: 420px;\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n.asone-panel .act-note.busy {\r\n  color: var(--accent);\r\n}\r\n\r\n.asone-panel .act-btn {\r\n  appearance: none;\r\n  font: inherit;\r\n  background: var(--dsw-alias-button-info-hover, #24425f);\r\n  border: 1px solid var(--border);\r\n  color: var(--on-accent);\r\n  height: 24px;\r\n  box-sizing: border-box;\r\n  border-radius: 5px;\r\n  padding: 0 12px;\r\n  font-size: 12px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .act-btn:hover:not(:disabled) {\r\n  background: var(--dsw-alias-button-info-hover, #24425f);\r\n}\r\n\r\n.asone-panel .act-btn:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n/* \u2500\u2500 \u6A21\u578B\u8868(ModelTable) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .models-block {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n}\r\n\r\n.asone-panel .models-toolbar {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  flex-wrap: wrap;\r\n}\r\n\r\n.asone-panel .models-toolbar-left,\r\n.asone-panel .models-toolbar-right {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .models-table {\r\n  width: 100%;\r\n  border-collapse: collapse;\r\n  font-size: 12.5px;\r\n}\r\n\r\n.asone-panel .models-table th,\r\n.asone-panel .models-table td {\r\n  padding: 6px 8px;\r\n  text-align: left;\r\n  border-bottom: 1px solid var(--border);\r\n  vertical-align: middle;\r\n}\r\n\r\n.asone-panel .models-table th {\r\n  color: var(--text);\r\n  font-weight: 500;\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .models-table .models-col-enable {\r\n  width: 44px;\r\n}\r\n\r\n.asone-panel .models-table td.rate-cell {\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .models-table tr.on td {\r\n  background: var(--accent-softer);\r\n}\r\n\r\n.asone-panel .models-table tr.off td {\r\n  opacity: 0.55;\r\n}\r\n\r\n.asone-panel .models-table tr.nocall td {\r\n  opacity: 0.75;\r\n}\r\n\r\n.asone-panel .models-table .input {\r\n  width: 100%;\r\n  min-width: 60px;\r\n  height: 26px;\r\n  padding: 0 8px;\r\n}\r\n\r\n.asone-panel .models-table .input.num {\r\n  width: 90px;\r\n}\r\n\r\n.asone-panel .models-table input:disabled {\r\n  opacity: 0.45;\r\n}\r\n\r\n.asone-panel .vision-cell {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n\r\n.asone-panel .dot {\r\n  color: var(--ok);\r\n  font-size: 9px;\r\n  line-height: 1;\r\n}\r\n\r\n.asone-panel .tag-warn {\r\n  margin-left: 6px;\r\n  padding: 0 5px;\r\n  border: 1px solid var(--warn);\r\n  border-radius: 3px;\r\n  color: var(--warn);\r\n  font-size: 11px;\r\n  white-space: nowrap;\r\n}\r\n\r\n/* \u2500\u2500 \u903B\u8F91\u6A21\u578B\u7F16\u8F91\u5668(LogicalModelEditor) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .editor {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n\r\n.asone-panel .fieldRow {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n}\r\n\r\n.asone-panel .fieldLabel {\r\n  color: var(--text);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .fieldValue {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n}\r\n\r\n.asone-panel .fieldNote {\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .fieldWarn {\r\n  color: var(--warn);\r\n  font-size: 12px;\r\n}\r\n\r\n.asone-panel .fieldWarn b {\r\n  color: var(--text);\r\n  font-weight: 500;\r\n}\r\n\r\n.asone-panel .input {\r\n  box-sizing: border-box;\r\n  height: 32px;\r\n  padding: 0 10px;\r\n  font: inherit;\r\n  font-size: 13px;\r\n  color: var(--text);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n}\r\n\r\n.asone-panel .input:focus {\r\n  outline: none;\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .input.inputBad {\r\n  border-color: var(--bad);\r\n}\r\n\r\n.asone-panel .selectInput {\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .nodeList {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n\r\n/* \u62D6\u51FA\u5217\u8868\u8303\u56F4\u65F6\u63CF\u7EA2\u63D0\u793A\u300C\u677E\u624B\u5373\u5220\u9664\u300D;outline \u4E0D\u5360\u5E03\u5C40,\u884C\u4E0D\u4F1A\u8DF3\u52A8\u3002 */\r\n.asone-panel .nodeList.nodeListOutside {\r\n  outline: 2px dashed var(--bad);\r\n  outline-offset: 4px;\r\n  border-radius: 4px;\r\n}\r\n\r\n.asone-panel .nodeRow {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n\r\n/* \u62D6\u62FD\u6E90\u884C\u534A\u900F\u660E,\u8BA9\u843D\u70B9\u66F4\u597D\u5224\u65AD */\r\n.asone-panel .nodeRow.nodeRowDragging {\r\n  opacity: 0.4;\r\n}\r\n\r\n/* \u884C\u9996\u62D6\u52A8\u624B\u67C4:\u53EA\u5728\u624B\u67C4\u4E0A draggable,\u907F\u514D <select> \u541E\u6389 mousedown */\r\n.asone-panel .dragHandle {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 16px;\r\n  height: 28px;\r\n  flex-shrink: 0;\r\n  color: var(--dim);\r\n  font-size: 14px;\r\n  line-height: 1;\r\n  cursor: grab;\r\n  user-select: none;\r\n  border-radius: 4px;\r\n}\r\n\r\n.asone-panel .dragHandle:hover {\r\n  color: var(--text);\r\n  background: var(--accent-soft);\r\n}\r\n\r\n.asone-panel .dragHandle:active {\r\n  cursor: grabbing;\r\n}\r\n\r\n/* \u63D2\u5165\u4F4D\u7F6E\u6307\u793A\u7EBF\uFF08\u903B\u8F91\u6A21\u578B\u6863\u94FE\u7528\uFF1A\u7EC6\u7EBF\uFF0C\u4E0D\u662F\u5217\u8868\u9879\uFF09 */\r\n.asone-panel .dropMarker {\r\n  height: 2px;\r\n  margin: 0 2px;\r\n  border-radius: 2px;\r\n  background: var(--accent);\r\n}\r\n/* \u8C03\u5EA6\u5217\u8868\u7684\u843D\u70B9\u6807\u8BB0\uFF1A\u753B\u5728\u884C\u5361**\u5185\u90E8\u9876\u7AEF**\uFF0C\u53EA\u5360\u5361\u7247\u5BBD\u5EA6\u30012px \u7EC6\u7EBF\u3002\r\n * \u26A0\uFE0F \u7EDD\u4E0D\u80FD\u4F5C\u4E3A <ul> \u7684\u76F4\u63A5\u5B50\u9879 \u2014\u2014 \u90A3\u4F1A\u53D8\u6210\u94FA\u6EE1\u6574\u884C\u7684\u84DD\u8272\u6A2A\u6761\u3002 */\r\n.asone-panel .ruleRowCard > .dropMarker {\r\n  height: 2px;\r\n  margin: -1px 0 6px;\r\n  width: 100%;\r\n  border-radius: 2px;\r\n  background: var(--accent);\r\n}\r\n/* \u62D6\u5230\u8BE5\u6BB5\u672B\u5C3E\uFF1A\u5728\u6700\u540E\u4E00\u6761\u884C\u5361\u5E95\u90E8\u8865\u4E00\u6761\u7EC6\u7EBF\uFF08\u540C\u6837\u4E0D\u8D70\u5217\u8868\u9879\uFF09\u3002 */\r\n.asone-panel .schedRowOuter.dropAtEnd {\r\n  height: 2px;\r\n  margin-top: -6px;\r\n  border-radius: 2px;\r\n  background: var(--accent);\r\n  list-style: none;\r\n}\r\n\r\n.asone-panel .nodeProvider {\r\n  width: 150px;\r\n  flex: 0 0 150px;\r\n}\r\n\r\n.asone-panel .nodeSelect {\r\n  flex: 1 1 0;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .addModelButton {\r\n  appearance: none;\r\n  font: inherit;\r\n  background: none;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  height: 28px;\r\n  padding: 0 10px;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  cursor: pointer;\r\n  align-self: flex-start;\r\n}\r\n\r\n.asone-panel .addModelButton:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .addModelButton:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n.asone-panel .editorActions {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .primaryButton,\r\n.asone-panel .secondaryButton {\r\n  appearance: none;\r\n  font: inherit;\r\n  height: 36px;\r\n  padding: 0 16px;\r\n  border-radius: 6px;\r\n  font-size: 13px;\r\n  cursor: pointer;\r\n}\r\n\r\n.asone-panel .primaryButton {\r\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  border: 1px solid var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  color: var(--on-accent);\r\n}\r\n\r\n.asone-panel .primaryButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-button-info-hover, #24425f);\r\n}\r\n\r\n.asone-panel .secondaryButton {\r\n  background: none;\r\n  border: 1px solid var(--border);\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .secondaryButton:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .primaryButton:disabled,\r\n.asone-panel .secondaryButton:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n/* \u2500\u2500 \u4F9B\u5E94\u5546\u8D26\u6237\u8868(ProviderAccounts) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .provider-accounts {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n}\r\n\r\n.asone-panel .block-title {\r\n  margin: 0;\r\n  font-size: 14px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .provider-accounts-actions {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n/* \u2500\u2500 \u5BA2\u6237\u7AEF\u8DEF\u5F84(ClientPaths) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .client-paths {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .cp-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .cp-row b {\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  flex-shrink: 0;\r\n}\r\n\r\n.asone-panel .cp-input {\r\n  flex: 1;\r\n  min-width: 200px;\r\n}\r\n\r\n.asone-panel .cp-state {\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  white-space: nowrap;\r\n  flex-shrink: 0;\r\n}\r\n\r\n/* \u2500\u2500 \u6587\u672C\u7740\u8272\u5DE5\u5177\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .ok {\r\n  color: var(--ok);\r\n}\r\n\r\n.asone-panel .bad {\r\n  color: var(--bad);\r\n}\r\n\r\n.asone-panel .na {\r\n  color: var(--text-soft);\r\n}\r\n\r\n/* \u2500\u2500 \u9519\u8BEF\u6761(\u7528\u91CF\u9875\u7528,\u5BF9\u9F50\u5168\u5C40 .err)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .err {\r\n  color: var(--bad);\r\n  font-size: 12px;\r\n  padding: 8px;\r\n  border: 1px solid color-mix(in srgb, var(--bad) 45%, transparent);\r\n  background: var(--surface-bad);\r\n  border-radius: 4px;\r\n  margin: 10px 0;\r\n}\r\n\r\n/* ===========================================================================\r\n   \u603B\u89C8\u9875(OverviewPage,scoped \u6837\u5F0F,\r\n   \u7C7B\u540D\u7EDF\u4E00 ov- \u524D\u7F00\u9632\u78B0\u649E;\u914D\u8272\u6CBF\u7528\u65E2\u6709\u4E3B\u9898)\r\n   =========================================================================== */\r\n\r\n.asone-panel .ov-err {\r\n  color: var(--bad);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n/* \u2500\u2500 \u6BCF\u65E5\u7B7E\u5230(\u603B\u89C8)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .ov-checkin {\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  padding: 10px 12px;\r\n  background: var(--surface);\r\n  margin-top: 12px;\r\n}\r\n.asone-panel .ov-checkinHead {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n  margin-bottom: 6px;\r\n}\r\n.asone-panel .ov-checkinHead h2 {\r\n  margin: 0;\r\n  font-size: 13px;\r\n  font-weight: 600;\r\n}\r\n.asone-panel .ov-checkinHead .count {\r\n  margin-left: 6px;\r\n  color: var(--muted, #888);\r\n  font-weight: 400;\r\n}\r\n.asone-panel .ov-checkinRows {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n}\r\n.asone-panel .ov-checkinRow {\r\n  display: grid;\r\n  grid-template-columns: 110px 90px 1fr;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n  font-size: 12px;\r\n}\r\n.asone-panel .ov-checkinName {\r\n  font-weight: 500;\r\n}\r\n.asone-panel .ov-checkinState {\r\n  font-weight: 600;\r\n}\r\n.asone-panel .ov-checkinState.is-ok {\r\n  color: #1a7f37;\r\n}\r\n.asone-panel .ov-checkinState.is-warn {\r\n  color: #b35900;\r\n}\r\n.asone-panel .ov-checkinState.is-err {\r\n  color: #c62828;\r\n}\r\n.asone-panel .ov-checkinState.is-na {\r\n  color: var(--muted, #888);\r\n  font-weight: 400;\r\n}\r\n.asone-panel .ov-checkinMeta {\r\n  color: var(--muted, #888);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-checkinMsg {\r\n  font-size: 12px;\r\n  color: #1a7f37;\r\n  margin-bottom: 4px;\r\n  word-break: break-all;\r\n}\r\n.asone-panel .ov-checkinErr {\r\n  font-size: 12px;\r\n  color: #c62828;\r\n  margin-bottom: 4px;\r\n  word-break: break-all;\r\n}\r\n\r\n/* \u2500\u2500 \u8FD0\u884C\u4E2D:\u5728\u9014\u660E\u7EC6\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .ov-inflight {\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  padding: 10px 12px;\r\n  background: var(--surface);\r\n  margin-top: 12px;\r\n}\r\n.asone-panel .ov-inflightHead {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n  margin-bottom: 6px;\r\n}\r\n.asone-panel .ov-inflightHead h2 {\r\n  margin: 0;\r\n  font-size: 13px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n.asone-panel .ov-inflightHead .count {\r\n  font-size: 12px;\r\n  color: var(--text);\r\n}\r\n.asone-panel .ov-inflightGrid {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px;\r\n}\r\n.asone-panel .ov-inflightCard {\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 6px 8px;\r\n  background: var(--bg);\r\n  min-width: 180px;\r\n}\r\n.asone-panel .ov-inflightCardHead {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: baseline;\r\n  font-size: 12px;\r\n}\r\n.asone-panel .ov-inflightLm {\r\n  color: var(--text);\r\n  font-weight: 600;\r\n  word-break: break-all;\r\n}\r\n.asone-panel .ov-inflightMap {\r\n  margin: 4px 0 0;\r\n  padding: 0;\r\n  list-style: none;\r\n  font-size: 11px;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .ov-inflightMap li {\r\n  display: flex;\r\n  align-items: baseline;\r\n  justify-content: space-between;\r\n  gap: 10px;\r\n}\r\n.asone-panel .ov-inflightRmN {\r\n  color: var(--text);\r\n  font-variant-numeric: tabular-nums;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-inflightLeases {\r\n  margin-top: 4px;\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 4px;\r\n}\r\n.asone-panel .ov-lease {\r\n  font-size: 10px;\r\n  color: var(--ok);\r\n  background: var(--surface);\r\n  border-radius: 4px;\r\n  padding: 1px 5px;\r\n}\r\n/* \u76F4\u8FDE\u5361:\u903B\u8F91\u6A21\u578B\u4E3A\u7A7A = \u5BA2\u6237\u7AEF\u76F4\u8FDE\u771F\u5B9E\u6A21\u578B(\u865A\u7EBF\u8FB9\u6846 + \u7565\u4E0D\u540C\u5E95\u8272)\u3002*/\r\n.asone-panel .ov-inflightDirect {\r\n  border-style: dashed;\r\n  border-color: var(--ok-line);\r\n  background: var(--surface-ok);\r\n}\r\n.asone-panel .ov-inflightDirect .ov-inflightLm {\r\n  color: var(--ok);\r\n}\r\n.asone-panel .ov-inflightDirect .ov-lease {\r\n  color: var(--ok);\r\n  background: var(--surface-ok);\r\n}\r\n\r\n/* \u2500\u2500 \u5B9E\u65F6\u65E5\u5FD7 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .ov-recentBlock {\r\n  margin-top: 12px;\r\n  border-top: 1px solid var(--border);\r\n  padding-top: 8px;\r\n}\r\n.asone-panel .ov-recentBlock .ov-inflightHead {\r\n  margin-bottom: 6px;\r\n}\r\n.asone-panel .ov-recentLimit {\r\n  display: inline-flex;\r\n  align-items: baseline;\r\n  gap: 4px;\r\n  font-size: 12px;\r\n  color: var(--text);\r\n}\r\n.asone-panel .ov-recentLimit input {\r\n  width: 4.5em;\r\n  font-size: 12px;\r\n  color: var(--text);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 4px;\r\n  padding: 1px 4px;\r\n}\r\n.asone-panel .ov-recentLimit input:disabled {\r\n  opacity: 0.5;\r\n}\r\n.asone-panel .ov-recentLimitErr {\r\n  font-size: 11px;\r\n  color: var(--bad);\r\n}\r\n\r\n/* \u2500\u2500 \u6309\u5BF9\u8BDD\u7684\u5361\u7247\u5217\u8868 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .ov-recentConvList {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n.asone-panel .ov-recentConv {\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  background: var(--bg);\r\n  overflow: hidden;\r\n}\r\n/* \u5361\u5934 / \u660E\u7EC6\u884C\u5171\u7528\u540C\u4E00\u5957\u56FA\u5B9A\u5B57\u7B26\u5BBD\u5217(grid \u5217\u53F3\u8FB9\u7F18\u9010\u5217\u5BF9\u9F50)\u3002*/\r\n.asone-panel .ov-recentConvHead,\r\n.asone-panel .ov-recentConvRow {\r\n  display: grid;\r\n  grid-template-columns:\r\n    minmax(6ch, 10ch) /* \u5E8F\u53F7:#\u5BF9\u8BDD#\u8BF7\u6C42(\u5361\u5934\u662F \u25B8 #\u5BF9\u8BDD) */\r\n    minmax(6ch, 18ch) /* \u903B\u8F91\u6A21\u578B */\r\n    minmax(8ch, 24ch) /* \u771F\u5B9E\u6A21\u578B */\r\n    minmax(22ch, 1fr) /* \u7ED3\u679C\u5FBD\u7AE0 + \u9519\u8BEF\u6587\u6848 \u2014\u2014\u552F\u4E00\u5403\u5269\u4F59\u5BBD\u5EA6\u7684\u4E00\u5217*/\r\n    12ch /* \u5EF6\u8FDF */\r\n    15ch /* TTFT(\u5361\u5934\u5E26\u300CTTFT \u300D\u524D\u7F00,\u6545\u6BD4\u5EF6\u8FDF\u5217\u5BBD 3ch) */\r\n    11ch /* TPS:118.4 tok/s */\r\n    20ch /* token \u4E09\u683C:993K / 22.1K / 860K */\r\n    9ch; /* \u7ED3\u675F:165.7s \u524D */\r\n  column-gap: 8px;\r\n  align-items: baseline;\r\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\r\n  font-size: 11px;\r\n}\r\n.asone-panel .ov-recentConvHead {\r\n  padding: 4px 8px;\r\n  cursor: pointer;\r\n  user-select: none;\r\n}\r\n.asone-panel .ov-recentConvHead:hover,\r\n.asone-panel .ov-recentConv.open .ov-recentConvHead {\r\n  background: var(--surface);\r\n}\r\n.asone-panel .ov-recentConvHeadId {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 4px;\r\n  min-width: 0;\r\n}\r\n.asone-panel .ov-recentConvCaret {\r\n  width: 10px;\r\n  flex: 0 0 10px;\r\n  color: var(--ok);\r\n}\r\n.asone-panel .ov-recentConvTitle {\r\n  flex: 0 1 auto;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  color: var(--text);\r\n  font-weight: 600;\r\n}\r\n.asone-panel .ov-recentConvTitle.direct {\r\n  color: var(--ok);\r\n}\r\n.asone-panel .ov-recentConvRow {\r\n  padding: 2px 8px;\r\n  color: var(--text-soft);\r\n  background: var(--surface-deep);\r\n}\r\n.asone-panel .ov-recentConvRow:hover {\r\n  background: var(--bg);\r\n}\r\n.asone-panel .ov-recentConvRow.fail {\r\n  color: var(--bad);\r\n  box-shadow: inset 2px 0 0 var(--bad);\r\n}\r\n.asone-panel .ov-recentConvSeq {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .ov-recentConvLm {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-recentConvLm.direct {\r\n  color: var(--ok);\r\n}\r\n.asone-panel .ov-recentConvRm {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-recentConvRes {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 6px;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-recentConvN {\r\n  color: var(--text);\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-recentConvRes .ov-errText {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n.asone-panel .ov-mono {\r\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\r\n  font-size: 10.5px;\r\n  word-break: break-all;\r\n}\r\n.asone-panel .ov-dim {\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .ov-num {\r\n  font-variant-numeric: tabular-nums;\r\n  text-align: right;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ov-badge {\r\n  border-radius: 4px;\r\n  padding: 0 4px;\r\n  font-size: 10px;\r\n}\r\n.asone-panel .ov-badge.ok {\r\n  color: var(--ok);\r\n  background: var(--surface);\r\n}\r\n.asone-panel .ov-badge.bad {\r\n  color: var(--bad);\r\n  background: var(--surface-bad);\r\n}\r\n.asone-panel .ov-errText {\r\n  color: var(--text-soft);\r\n  font-size: 10px;\r\n  margin-left: 4px;\r\n}\r\n\r\n/* ===========================================================================\r\n   \u7528\u91CF\u7EDF\u8BA1\u9875(UsageStatsPage,.usage-* \u7C7B)\r\n   =========================================================================== */\r\n.asone-panel .usage-ctl {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  flex-wrap: wrap;\r\n  margin: 16px 0 6px;\r\n}\r\n/* \u5206\u6BB5\u63A7\u4EF6(pill \u7EC4):\u4E00\u4E2A\u5706\u89D2\u5BB9\u5668\u91CC\u6392\u6309\u94AE,\u9009\u4E2D\u9879\u586B\u5E95\u3002*/\r\n.asone-panel .usage-seg {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 2px;\r\n  padding: 3px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 9px;\r\n  background: var(--surface);\r\n}\r\n.asone-panel .usage-seg button {\r\n  appearance: none;\r\n  border: 0;\r\n  background: transparent;\r\n  color: var(--text);\r\n  font: inherit;\r\n  font-size: 12px;\r\n  line-height: 1;\r\n  padding: 7px 12px;\r\n  border-radius: 7px;\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n  transition: background 0.12s ease, color 0.12s ease;\r\n}\r\n.asone-panel .usage-seg button:hover {\r\n  background: var(--surface-deep);\r\n  color: var(--text);\r\n}\r\n.asone-panel .usage-seg button.on,\r\n.asone-panel .usage-seg button.on:hover {\r\n  background: var(--surface-hover);\r\n  color: var(--text);\r\n}\r\n.asone-panel .usage-refresh {\r\n  appearance: none;\r\n  border: 1px solid var(--border);\r\n  background: var(--surface-deep);\r\n  color: var(--text);\r\n  font: inherit;\r\n  font-size: 12px;\r\n  line-height: 1;\r\n  padding: 10px 14px;\r\n  border-radius: 9px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .usage-refresh:hover:not(:disabled) {\r\n  background: var(--surface-hover);\r\n}\r\n.asone-panel .usage-refresh:disabled {\r\n  opacity: 0.6;\r\n  cursor: default;\r\n}\r\n.asone-panel .usage-ctl-info {\r\n  margin: 0 0 0 4px;\r\n}\r\n\r\n/* 5 \u5F20 KPI \u5361\u3002*/\r\n.asone-panel .usage-cards {\r\n  display: grid;\r\n  grid-template-columns: repeat(5, minmax(0, 1fr));\r\n  gap: 10px;\r\n  margin-top: 14px;\r\n}\r\n/* 4 \u5F20\u5361\u7684\u573A\u666F(\u7F51\u5173\u5916\u7528\u91CF):\u4E0A\u9762\u90A3\u6392\u5199\u6B7B 5 \u5217,\u76F4\u63A5\u590D\u7528\u4F1A\u5728\u53F3\u4FA7\u7A7A\u4E00\u683C\u3001\r\n   \u5361\u7247\u4E5F\u88AB\u538B\u7A84\u3002\u8FD9\u91CC\u5355\u72EC\u7ED9 4 \u5217,\u5BBD\u5EA6\u4E0E\u4E0A\u65B9 5 \u5217\u5361\u89C6\u89C9\u4E00\u81F4\u3002 */\r\n.asone-panel .usage-cards-4 {\r\n  grid-template-columns: repeat(4, minmax(0, 1fr));\r\n}\r\n.asone-panel .usage-card {\r\n  background: var(--surface);\r\n  border: 1px solid var(--border);\r\n  border-radius: 12px;\r\n  padding: 12px 14px;\r\n  min-width: 0;\r\n}\r\n.asone-panel .usage-card-k {\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n}\r\n.asone-panel .usage-card-v {\r\n  color: var(--text);\r\n  font-size: 22px;\r\n  font-weight: 600;\r\n  line-height: 1.35;\r\n  font-variant-numeric: tabular-nums;\r\n  overflow-wrap: anywhere;\r\n}\r\n.asone-panel .usage-card-v-sm {\r\n  font-size: 15px;\r\n}\r\n.asone-panel .usage-card-s {\r\n  color: var(--text-soft);\r\n  font-size: 11px;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.asone-panel .usage-sec {\r\n  margin-top: 24px;\r\n}\r\n.asone-panel .usage-sec h2 {\r\n  margin: 0 0 8px;\r\n  font-size: 14px;\r\n  color: var(--text);\r\n  font-weight: 600;\r\n}\r\n\r\n.asone-panel .usage-chart-wrap {\r\n  position: relative;\r\n  width: 100%;\r\n}\r\n.asone-panel .usage-chart {\r\n  display: block;\r\n  overflow: visible;\r\n}\r\n.asone-panel .axis-text {\r\n  fill: var(--text-soft);\r\n  font-size: 10px;\r\n}\r\n.asone-panel .axis-text-r {\r\n  fill: var(--text-soft);\r\n}\r\n.asone-panel .usage-bar {\r\n  stroke: none;\r\n}\r\n/* \u6574\u5217\u900F\u660E\u547D\u4E2D\u533A:\u67F1\u5B50\u518D\u7A84\u4E5F\u80FD hover \u5230\u3002*/\r\n.asone-panel .bar-hit {\r\n  fill: transparent;\r\n  pointer-events: all;\r\n}\r\n.asone-panel .usage-line {\r\n  stroke-linejoin: round;\r\n  stroke-linecap: round;\r\n}\r\n\r\n.asone-panel .usage-tip {\r\n  position: absolute;\r\n  top: 6px;\r\n  transform: translateX(-50%);\r\n  min-width: 170px;\r\n  max-width: calc(100% - 8px);\r\n  padding: 8px 10px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  color: var(--text-soft);\r\n  font-size: 11px;\r\n  line-height: 1.6;\r\n  pointer-events: none;\r\n  z-index: 30;\r\n  box-shadow: 0 6px 18px var(--shadow);\r\n}\r\n.asone-panel .usage-tip-head {\r\n  color: var(--text);\r\n  margin-bottom: 4px;\r\n}\r\n.asone-panel .usage-tip-line {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n}\r\n.asone-panel .usage-tip-line b {\r\n  color: var(--text);\r\n  font-weight: 600;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .usage-tip-nm {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 5px;\r\n  min-width: 0;\r\n}\r\n/* \u6A21\u578B\u540D:\u59CB\u7EC8\u5355\u884C,\u592A\u957F\u5C31\u7701\u7565\u53F7\u3002*/\r\n.asone-panel .usage-tip-nm-t {\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n.asone-panel .usage-tip-sep {\r\n  height: 1px;\r\n  background: var(--surface-hover);\r\n  margin: 6px 0;\r\n}\r\n.asone-panel .usage-tip-more {\r\n  color: var(--text-soft);\r\n  font-size: 10px;\r\n}\r\n\r\n.asone-panel .usage-legend {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px 16px;\r\n  margin-top: 10px;\r\n  color: var(--text-soft);\r\n  font-size: 11px;\r\n}\r\n.asone-panel .usage-legend-i {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .usage-dot {\r\n  display: inline-block;\r\n  width: 10px;\r\n  height: 10px;\r\n  border-radius: 2px;\r\n  flex: 0 0 auto;\r\n}\r\n.asone-panel .usage-dot.sm {\r\n  width: 8px;\r\n  height: 8px;\r\n}\r\n.asone-panel .usage-line-sw {\r\n  display: inline-block;\r\n  width: 14px;\r\n  height: 3px;\r\n  border-radius: 2px;\r\n}\r\n\r\n.asone-panel .usage-split {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 16px;\r\n  flex-wrap: wrap;\r\n}\r\n.asone-panel .usage-donut {\r\n  flex: 0 0 auto;\r\n}\r\n.asone-panel .usage-donut-v {\r\n  fill: var(--text);\r\n  font-size: 20px;\r\n  font-weight: 600;\r\n}\r\n.asone-panel .usage-donut-k {\r\n  fill: var(--text-soft);\r\n  font-size: 11px;\r\n}\r\n\r\n.asone-panel .usage-rank {\r\n  list-style: none;\r\n  margin: 0;\r\n  padding: 0;\r\n  flex: 1 1 260px;\r\n  min-width: 260px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n}\r\n.asone-panel .usage-row,\r\n.asone-panel .usage-subrow {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  padding: 6px 8px;\r\n  border-radius: 8px;\r\n  font-size: 12px;\r\n  color: var(--text);\r\n}\r\n.asone-panel .usage-row {\r\n  background: var(--surface);\r\n}\r\n.asone-panel .usage-row.clickable {\r\n  cursor: pointer;\r\n}\r\n.asone-panel .usage-row.clickable:hover,\r\n.asone-panel .usage-subrow.clickable:hover {\r\n  background: var(--surface-deep);\r\n}\r\n.asone-panel .usage-rank-i {\r\n  min-width: 14px;\r\n  text-align: right;\r\n  color: var(--text);\r\n  font-size: 11px;\r\n}\r\n/* \u53EF\u5C55\u5F00\u884C\u7684\u6298\u53E0\u6307\u793A:\u6CA1\u6709\u5B50\u9879\u65F6\u7559\u7A7A\u5360\u4F4D,\u4FDD\u8BC1\u5E26\u8272\u5757\u7684\u884C\u5DE6\u8FB9\u7F18\u5BF9\u9F50\u3002*/\r\n.asone-panel .usage-caret {\r\n  width: 8px;\r\n  flex: 0 0 8px;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  line-height: 1;\r\n  transition: transform 0.15s ease;\r\n}\r\n.asone-panel .usage-caret.open {\r\n  transform: rotate(90deg);\r\n}\r\n.asone-panel .usage-name {\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  display: flex;\r\n  flex-direction: column;\r\n  line-height: 1.35;\r\n}\r\n.asone-panel .usage-name-m {\r\n  color: var(--text);\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n.asone-panel .usage-name-s {\r\n  color: var(--text-soft);\r\n  font-size: 11px;\r\n}\r\n.asone-panel .usage-val {\r\n  text-align: right;\r\n  color: var(--text);\r\n  white-space: nowrap;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .usage-pct {\r\n  width: 52px;\r\n  text-align: right;\r\n  color: var(--text);\r\n  white-space: nowrap;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .usage-fold {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  margin: 2px 0 4px 26px;\r\n  padding-left: 10px;\r\n  border-left: 2px solid var(--border);\r\n}\r\n.asone-panel .usage-subrow {\r\n  font-size: 11.5px;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .usage-foot {\r\n  margin-top: 20px;\r\n}\r\n\r\n@media (max-width: 1100px) {\r\n  .asone-panel .usage-cards {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  }\r\n}\r\n\r\n/* ===========================================================================\r\n   \u8BBE\u7F6E\u9875(SettingsPage,.ui-* \u4F53\u7CFB)\r\n   =========================================================================== */\r\n\r\n/* \u539F\u9875\u9762\u7684.err / .savedNotice \u662F\u7EAF\u6587\u5B57;As One \u5DF2\u6709 .err/.notice \u76D2\u5F0F\u53D8\u4F53,\r\n   \u6545\u8FD9\u91CC\u7528 .ui-err/.ui-notice \u627F\u62C5\u8BBE\u7F6E\u9875\u4E0E\u4F9B\u5E94\u5546\u9875\u7684\u7EAF\u6587\u5B57\u5F62\u6001\u3002*/\r\n.asone-panel .ui-err {\r\n  color: var(--bad);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  margin: 0;\r\n}\r\n\r\n.asone-panel .ui-notice {\r\n  color: var(--ok);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  margin: 0;\r\n}\r\n\r\n/* \u8BBE\u7F6E\u9875\u5916\u58F3(\u4EC5 SettingsPage \u4F7F\u7528)\u3002   \u26A0\uFE0F 2026-10-24 \u7528\u6237 m10716:\u9760\u5DE6\u3001\u4E0D\u9650\u5236\u5BBD\u5EA6\u3002   \u539F\u6765 max-width: 980px + margin: 0 auto \u6709\u4E24\u4E2A\u6BDB\u75C5\u2460\u6574\u9875\u5C45\u4E2D\u53F3\u4FA7\u7559\u4E00\u5927\u7247\r\n   \u7A7A\u767D;980px \u88C5\u4E0D\u4E0B\u300C\u8C03\u5EA6\u89C4\u5219\u300D\u90A3\u4E94\u5F20\u5361(\u6BCF\u5F20 5 \u4E2A box),\u53EA\u80FD\u6324\u6210\u4E24\u5217\u3002   \u5BBD\u5EA6\u4EA4\u7ED9\u5916\u5C42 .content(max-width 1400px)\u63A7\u5236,\u8FD9\u91CC\u4E0D\u518D\u81EA\u8BBE\u4E0A\u9650\u3002*/\r\n.asone-panel .ui-shell {\r\n  width: 100%;\r\n  max-width: none;\r\n  margin: 0;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n}\r\n\r\n.asone-panel .ui-page-desc {\r\n  margin: 0 0 6px;\r\n  color: var(--text-soft);\r\n  font-size: 13px;\r\n}\r\n\r\n.asone-panel .ui-layout {\r\n  display: flex;\r\n  align-items: flex-start;\r\n  gap: 24px;\r\n}\r\n\r\n.asone-panel .ui-content {\r\n  flex: 1;\r\n  min-width: 0;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n\r\n.asone-panel .ui-card {\r\n  background: var(--surface);\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 14px 16px;\r\n  scroll-margin-top: 60px;\r\n}\r\n\r\n.asone-panel .ui-card-head {\r\n  display: flex;\r\n  align-items: baseline;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  margin-bottom: 10px;\r\n}\r\n\r\n.asone-panel .ui-card-title {\r\n  margin: 0;\r\n  font-size: 14px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .ui-card-sub {\r\n  margin: 2px 0 0;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .ui-fields {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\r\n  gap: 6px 18px;\r\n}\r\n\r\n.asone-panel .ui-field {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .ui-field.wide {\r\n  grid-column: 1 / -1;\r\n}\r\n\r\n.asone-panel .ui-field-head {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .ui-field-label {\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-weight: 500;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .ui-field-unit {\r\n  color: var(--text);\r\n  font-size: 11px;\r\n}\r\n\r\n.asone-panel .ui-field-hint {\r\n  margin: 0;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n/* \u2500\u2500 \u8BBE\u7F6E\u9875\u91CD\u8BBE\u8BA1(2026-11):\u5168\u7AD9\u8BBE\u8BA1\u8BED\u8A00 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\r\n * \u5361\u7247\u7EDF\u4E00\u7528 `.card/.card-head`(\u4E0E\u603B\u89C8/\u6A21\u578B/\u6E20\u9053/\u7528\u91CF\u5404\u9875\u540C\u6B3E),\u5B57\u6BB5\u884C\u7528\r\n * `.kv-grid`(\u5DE6 140px \u6807\u7B7E / \u53F3\u63A7\u4EF6),\u63A7\u4EF6\u7528 `.input/.selectInput`,\u6309\u94AE\u7528\r\n * `.btn/.primaryButton/.secondaryButton`,\u5FBD\u7AE0\u7528 `.pill/.rowTag`\u3002\r\n * \u4E0D\u518D\u6709\u8BBE\u7F6E\u9875\u4E13\u5C5E\u7684 .ui-* \u89C6\u89C9\u5B64\u5C9B\u3002 */\r\n.asone-panel .settings-page {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n/* \u5361\u7247\u5217**\u4E0D\u5957 720px \u4E0A\u9650**\uFF08\u7528\u6237 2026-11 \u9009\u300C\u53EA\u5BF9\u9F50\u8FB9\u8DDD\u3001\u5361\u7247\u4FDD\u6301\u8F83\u5BBD\u300D\uFF09\uFF1A\r\n * \u8C03\u5EA6\u89C4\u5219\u4E00\u884C\u6709 5 \u4E2A\u63A7\u4EF6\uFF0C\u9650\u5230 720px \u4F1A\u628A\u6A21\u578B\u540D\u622A\u65AD\uFF08\u5982\r\n * `deepseek-v4.1-flash-1` \u5C11\u4E86\u5C3E\u90E8\uFF09\u3002\u4E0E\u6A21\u578B\u9875\u7684\u5BF9\u9F50\u70B9\u53EA\u6709**\u6807\u9898/\u5BFC\u822A\u7684\r\n * \u5DE6\u8FB9\u7F18**\uFF08\u5DF2\u7531\u53BB\u6389\u91CD\u590D `.content` \u4FEE\u597D\uFF09\uFF0C\u5361\u7247\u81EA\u8EAB\u6309\u5185\u5BB9\u533A\u81EA\u7136\u94FA\u5F00\u3002 */\r\n.asone-panel .settings-body {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n.asone-panel .setting-card {\r\n  /* .card \u5DF2\u662F 8px \u5706\u89D2/1px border/surface \u5E95;\u8FD9\u91CC\u53EA\u6536\u7D27\u95F4\u8DDD\u6C42"\u7D27\u51D1\u6574\u9F50"\u3002 */\r\n  padding: 12px 16px;\r\n}\r\n.asone-panel .setting-groups {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 14px;\r\n}\r\n.asone-panel .setting-group {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n.asone-panel .setting-group-title {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  font-weight: 500;\r\n}\r\n/* \u4E24\u4E2A\u5C0F\u8282\u5E76\u6392(\u9000\u907F\u5F62\u72B6 / \u91CD\u8BD5\u6B21\u6570)\u3002\u7A84\u5C4F\u81EA\u52A8\u964D\u4E3A\u4E00\u5217\u3002 */\r\n.asone-panel .setting-group-cols {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));\r\n  gap: 14px 32px;\r\n}\r\n/* \u957F\u6587\u672C\u8F93\u5165(\u53EF\u91CD\u8BD5\u9519\u8BEF\u7801\u7B49):\u4E0E\u6807\u7B7E\u540C\u4E00\u884C,\u4F46\u8F93\u5165\u6846\u6491\u6EE1\u5269\u4F59\u5BBD\u5EA6\u3002 */\r\n.asone-panel .kv-grid .v > .input.wideInput {\r\n  width: 100%;\r\n}\r\n/* kv-grid \u91CC\u7684\u63A7\u4EF6:\u7EDF\u4E00\u5BBD\u5EA6\u3001\u548C\u5168\u7AD9 .input/.selectInput \u5BF9\u9F50\u3002\r\n *\r\n * \u26A0\uFE0F 2026-11 \u4FEE\u5BF9\u9F50:\u539F\u5148\u7EAF\u8F93\u5165\u6846 max-width 460\u3001\u5E26\u5355\u4F4D\u7684\u6846\u53C8\u8D70\u53E6\u4E00\u5957\u6536\u7F29\u89C4\u5219,\r\n * \u4E8E\u662F\u540C\u4E00\u5F20\u5361\u91CC\u300C1.5 \u7684\u6846\u300D\u548C\u300C10 \u7684\u6846\u300D\u5BBD\u5EA6\u4E0D\u540C\u3001\u53F3\u7AEF\u53C2\u5DEE\u3002\u73B0\u5728\u4E24\u8005\u7EDF\u4E00\r\n * \u5B9A\u5BBD 180px(\u4E0E .setting-input-unit \u7684\u8F93\u5165\u6846\u540C\u5BBD),\u6574\u5217\u53F3\u7AEF\u4E25\u683C\u5BF9\u9F50\u3002 */\r\n.asone-panel .kv-grid .v > .input,\r\n.asone-panel .kv-grid .v > .selectInput {\r\n  width: 180px;\r\n  box-sizing: border-box;\r\n}\r\n/* \u72EC\u5360\u6574\u884C\u7684 wide \u5B57\u6BB5(\u53EF\u91CD\u8BD5\u9519\u8BEF\u7801\u7B49):\u8F93\u5165\u6846\u5FC5\u987B\u6491\u6EE1\u6574\u884C\u3002\r\n * \u26A0\uFE0F \u5FC5\u987B\u5199\u5728 180px \u89C4\u5219**\u4E4B\u540E**\u4E14\u4FDD\u6301\u66F4\u9AD8\u7279\u5F02\u6027,\u5426\u5219\u540C\u4F18\u5148\u7EA7\u4E0B\u88AB\u8986\u76D6\u3002 */\r\n.asone-panel .kv-grid .v.kv-wide > .input,\r\n.asone-panel .kv-grid .v.kv-wide > .selectInput {\r\n  width: 100%;\r\n}\r\n.asone-panel .kv-wide {\r\n  grid-column: 1 / -1;\r\n}\r\n.asone-panel .setting-check {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 7px;\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .setting-check .checkInput {\r\n  accent-color: var(--ok);\r\n}\r\n.asone-panel .setting-json {\r\n  box-sizing: border-box;\r\n  height: auto;\r\n  min-height: 72px;\r\n  max-height: 200px;\r\n  padding: 8px 10px;\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  resize: vertical;\r\n}\r\n.asone-panel .setting-json:focus {\r\n  outline: none;\r\n  border-color: var(--accent);\r\n}\r\n/* \u5E26\u5355\u4F4D\u7684\u6570\u503C\u884C \u2014\u2014 \u7EDF\u4E00\u6210\u300C\u5B9A\u5BBD\u8F93\u5165\u6846 + \u7D27\u8DDF\u5355\u4F4D\u300D\u3002\r\n *\r\n * \u26A0\uFE0F 2026-11 \u4FEE\u300C\u6BCF\u884C\u9AD8\u5EA6/\u5BBD\u5EA6\u90FD\u4E0D\u5BF9\u9F50\u300D:\r\n * \u539F\u6765\u8FD9\u91CC\u662F `inline-flex` + `max-width`,\u5BBD\u5EA6\u968F\u5185\u5BB9\u6536\u7F29 \u2014\u2014 `1.5`/`24`\r\n * \u7684\u6846\u6BD4 `10` \u7A84,\u5355\u4F4D\u300C\u79D2\u300D/\u300C\u6BD4\u4F8B\u300D\u7684\u4F4D\u7F6E\u4E5F\u8DDF\u7740\u6D6E\u52A8,\u6574\u5217\u53F3\u7AEF\u53C2\u5DEE\u3002\r\n * \u73B0\u5728\u8F93\u5165\u6846\u5B9A\u5BBD(180px)\u3001\u5355\u4F4D\u7D27\u8D34\u5176\u540E,\u6240\u6709\u884C\u89C6\u89C9\u540C\u5BBD\u540C\u9AD8\u3002 */\r\n.asone-panel .setting-input-unit {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  width: 100%;\r\n}\r\n.asone-panel .setting-input-unit > .input {\r\n  flex: 0 0 180px;\r\n  width: 180px;\r\n  box-sizing: border-box;\r\n}\r\n.asone-panel .setting-unit {\r\n  color: var(--text-soft);\r\n  font-size: 11px;\r\n  flex: none;\r\n}\r\n.asone-panel .setting-key-row {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  flex-wrap: wrap;\r\n}\r\n.asone-panel .setting-key {\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n  color: var(--text);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 4px 10px;\r\n  word-break: break-all;\r\n}\r\n\r\n/* \u5E95\u90E8\u4FDD\u5B58\u680F:\u9759\u6001 footer(\u4E0D sticky\u3001\u4E0D\u906E\u6321\u5361\u7247),\u590D\u7528\u5168\u7AD9\u6309\u94AE\u3002 */\r\n.asone-panel .setting-savebar {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 14px;\r\n  padding: 12px 0 4px;\r\n  border-top: 1px solid var(--border);\r\n}\r\n.asone-panel .setting-savebar-count {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  color: var(--text);\r\n  font-size: 13px;\r\n}\r\n.asone-panel .setting-savebar-dot {\r\n  width: 7px;\r\n  height: 7px;\r\n  border-radius: 50%;\r\n  background: var(--bad);\r\n}\r\n.asone-panel .setting-savebar-msg {\r\n  flex: 1;\r\n  min-width: 0;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .setting-savebar-btns {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  margin-left: auto;\r\n}\r\n.asone-panel .setting-savebar .primaryButton,\r\n.asone-panel .setting-savebar .secondaryButton {\r\n  height: 32px;\r\n  font-size: 12px;\r\n  padding: 0 14px;\r\n}\r\n\r\n/* \u2500\u2500 \u8BBE\u7F6E\u9875\u6392\u7248:\u5355\u5217\u6D41\u5F0F + \u7EC4\u5185\u6A2A\u5411\u94FA\u6EE1 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\r\n * \u7528\u6237 2026-11:\u300C\u4E0D\u540C\u7684\u9879\u76EE\u4E0D\u5206\u5217,\u540C\u4E00\u7EC4\u6761\u76EE\u5C3D\u91CF\u5229\u7528\u6A2A\u5411\u7A7A\u95F4\u300D\u3002\r\n * \u6240\u4EE5\u8FD9\u91CC**\u4E0D\u505A\u591A\u5217\u5206\u7EC4**(\u90A3\u5F20 settingColumns \u5DF2\u5220),\u6BCF\u6761\u5B57\u6BB5\u4ECD\u662F\u4E00\u884C\r\n * \u300C\u6807\u7B7E\u5DE6 / \u63A7\u4EF6\u53F3\u300D,\u4F46\u63A7\u4EF6\u5360\u6EE1\u53EF\u7528\u5BBD\u5EA6 \u2014\u2014 \u53F3\u534A\u8FB9\u4E0D\u518D\u7559\u7A7A\u3002 */\r\n/* \u540C\u4E00\u884C\u63A7\u4EF6**\u53F3\u7AEF\u4E5F\u5BF9\u9F50**:\u8F93\u5165\u6846\u4E00\u5F8B\u5360\u6EE1\u5269\u4F59\u5BBD\u5EA6,\u5355\u4F4D\u8D34\u53F3\u3002 */\r\n.asone-panel .kv-wide-grid .v > .input,\r\n.asone-panel .kv-wide-grid .v > .selectInput {\r\n  width: 100%;\r\n  max-width: none;\r\n}\r\n.asone-panel .kv-wide-grid .v > .setting-input-unit {\r\n  width: 100%;\r\n  max-width: none;\r\n}\r\n.asone-panel .kv-wide-grid .v > .setting-input-unit > .input {\r\n  flex: 1;\r\n  max-width: none;\r\n}\r\n.asone-panel .kv-wide-grid {\r\n  gap: 8px 16px;\r\n}\r\n/* \u51B7\u5374\u884C:\u4F9B\u5E94\u5546 + \u5206\u949F + \u5220\u9664,\u6A2A\u6392\u3002\r\n *\r\n * \u4E24\u884C(\u903B\u8F91\u6A21\u578B\u6210\u5458\u51B7\u5374 / \u4F9B\u5E94\u5546\u7EA7\u51B7\u5374)\u5FC5\u987B**\u540C\u6784**:\r\n * \u540C\u6837\u7684 1px \u8FB9\u6846\u300110px \u5706\u89D2\u300112/14 \u5185\u8FB9\u8DDD\u300132px \u63A7\u4EF6\u9AD8\u3002 */\r\n.asone-panel .cooldownRows {\r\n  margin-top: 0;\r\n}\r\n.asone-panel .cooldownRows > li.rowCard {\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  background: var(--surface);\r\n  padding: 12px 14px;\r\n}\r\n/* \u300C\u903B\u8F91\u6A21\u578B\u6210\u5458\u51B7\u5374\u300D\u6807\u7B7E \u2014\u2014 \u505A\u6210**\u5E26\u8FB9\u6846\u7684\u53EA\u8BFB\u6846**\uFF0C\u5916\u89C2\u4E0E\u540C\u884C\u7684\r\n * \u300C\u4F9B\u5E94\u5546\u300D\u4E0B\u62C9\u6846\u4E00\u81F4\uFF08\u7528\u6237 2026-11 \u53C2\u8003\u56FE\u5B9A\u6848\uFF09\uFF1A\u540C\u6837\u7684\u5BBD\u5EA6\u3001\u9AD8\u5EA6\u3001\r\n * \u5706\u89D2\u3001\u5185\u8FB9\u8DDD\u3001\u80CC\u666F\u3002\u8FD9\u6837\u4E24\u884C\u7B2C\u4E00\u5217\u89C6\u89C9\u4E0A\u662F\u540C\u4E00\u79CD\u63A7\u4EF6\u3002 */\r\n.asone-panel .cooldownFieldLabel {\r\n  flex: 0 0 128px;\r\n  box-sizing: border-box;\r\n  height: 30px;\r\n  padding: 0 10px;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  background: var(--surface-raised, var(--surface));\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .cooldownRows .ruleProvider {\r\n  flex: 0 0 128px;\r\n}\r\n.asone-panel .cooldownRows .ruleNum {\r\n  /* \u26A0\uFE0F \u5FC5\u987B\u662F `flex: 0 0 92px` \u800C\u4E0D\u53EA\u662F `width`\uFF1A\u5728 flex \u884C\u91CC\u7EAF width \u4F1A\u88AB\r\n   * \u6536\u7F29\u5230 22px\uFF08\u5B9E\u6D4B\uFF09\uFF0C\u6570\u5B57\u6846\u7A84\u5230\u770B\u4E0D\u5168\u5185\u5BB9\u3002 */\r\n  flex: 0 0 92px;\r\n  width: 92px;\r\n  text-align: right;\r\n}\r\n.asone-panel .cooldownRows .ruleRowLine > .ruleNum,\r\n.asone-panel .cooldownRows .ruleRowLine > .cooldownMinute > .ruleNum {\r\n  height: 30px;\r\n  box-sizing: border-box;\r\n}\r\n.asone-panel .cooldownRows .ruleRowLine {\r\n  /* \u7B2C 1 \u4E2A\u63A7\u4EF6(\u6807\u7B7E/\u4F9B\u5E94\u5546)\u4E0E\u7B2C 2 \u4E2A\u63A7\u4EF6(\u5206\u949F)\u4E4B\u95F4\u7684\u95F4\u8DDD\u4E0E\u8C03\u5EA6\u884C\u4E00\u81F4\u3002 */\r\n  gap: 8px;\r\n}\r\n.asone-panel .cooldownMinute {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  flex: none;\r\n}\r\n.asone-panel .ruleUnit {\r\n  color: var(--text-soft);\r\n  font-size: 11.5px;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ruleRowCard.hasError {\r\n  border-color: var(--bad);\r\n}\r\n\r\n/* \u2500\u2500 \u8C03\u5EA6\u4F18\u5148\u7EA7\u5217\u8868:\u4E00\u4E2A\u5217\u8868,\u5206\u9694\u5360\u4F4D\u7B26\u5206\u6BB5 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\r\n * \u53C2\u7167\u903B\u8F91\u6A21\u578B\u5217\u8868(.rows > .rowCard)\u3002\u5206\u9694\u6761\u65E2\u662F\u6BB5\u6807\u9898(\u9AD8/\u6B21/\u4F4E/\u7981\u7528),\r\n * \u4E5F\u662F\u8BE5\u6BB5\u7684\u6DFB\u52A0\u4F4D(\u70B9\u300C\uFF0B \u6DFB\u52A0\u300D)\u3002P3 \u4E0D\u663E\u793A \u2014\u2014 \u6CA1\u6709\u89C4\u5219\u5C31\u662F P3 \u57FA\u7EBF\u6863\u3002 */\r\n.asone-panel .sched-rows {\r\n  gap: 8px;\r\n}\r\n.asone-panel .sched-sep {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  margin-top: 6px;\r\n  padding-bottom: 2px;\r\n}\r\n.asone-panel .sched-rows > .sched-sep:first-child {\r\n  margin-top: 0;\r\n}\r\n.asone-panel .sched-sep-badge {\r\n  /* \u5F31\u5316:\u6DE1\u5E95 + \u5F3A\u8C03\u8272\u5B57(\u4E0D\u7528\u5B9E\u5FC3 accent,\u907F\u514D\u4E0E\u9876\u90E8 tab / \u4E3B\u6309\u94AE\u62A2\u4E3B\u6B21)\u3002 */\r\n  color: var(--accent);\r\n  background: var(--accent-soft);\r\n  border-color: transparent;\r\n  font-weight: 600;\r\n}\r\n.asone-panel .sched-sep-title {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  font-weight: 600;\r\n}\r\n.asone-panel .sched-sep .card-extra {\r\n  color: var(--text-soft);\r\n  font-size: 11px;\r\n}\r\n.asone-panel .sched-sep-add {\r\n  margin-left: auto;\r\n}\r\n/* \u4E00\u6761\u89C4\u5219 = \u5E38\u5C55\u5F00\u7684\u4E00\u884C:\u283F + \u4F9B\u5E94\u5546 + \u6A21\u578B + \u5230\u671F + \u65F6\u6BB5 + \u5220\u9664\u3002 */\r\n.asone-panel .ruleRowCard {\r\n  padding: 8px 10px 8px 6px;\r\n}\r\n.asone-panel .ruleRowLine {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  min-width: 0;\r\n}\r\n.asone-panel .ruleField {\r\n  height: 30px;\r\n  font-size: 12px;\r\n  min-width: 0;\r\n}\r\n/* \u5217\u5BBD\u5236:\u4F9B\u5E94\u5546/\u5230\u671F/\u65F6\u6BB5\u5B9A\u5BBD(\u540C\u884C\u4E25\u683C\u5BF9\u9F50),\u6A21\u578B\u5403\u6389\u5269\u4F59\u5BBD\u5EA6 \u2014\u2014\r\n * \u8FD9\u6837\u6574\u884C\u94FA\u6EE1\u6A2A\u5411\u7A7A\u95F4\u3001\u53F3\u7AEF\u4E0D\u7559\u7A7A,\u300C\u5220\u9664\u300D\u59CB\u7EC8\u8D34\u53F3\u3002 */\r\n.asone-panel .ruleProvider {\r\n  flex: 0 0 128px;\r\n}\r\n.asone-panel .ruleModel {\r\n  flex: 1 1 auto;\r\n  min-width: 140px;\r\n}\r\n.asone-panel .ruleExpiry {\r\n  flex: 0 0 128px;\r\n}\r\n.asone-panel .ruleProfile {\r\n  flex: 0 0 128px;\r\n}\r\n.asone-panel .ruleDel {\r\n  flex: none;\r\n}\r\n.asone-panel .ruleRowCard .rule-err {\r\n  margin: 4px 0 0;\r\n  padding-left: 22px;\r\n}\r\n.asone-panel .schedRowOuter {\r\n  list-style: none;\r\n}\r\n.asone-panel .sched-rows {\r\n  /* \u4E0E .rows \u5BF9\u9F50:\u53BB\u6389\u9ED8\u8BA4 padding,\u9760 gap \u5206\u9694\u3002 */\r\n  margin: 0;\r\n  padding: 0;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n  list-style: none;\r\n}\r\n/* \u62D6\u52A8\u628A\u624B:\u4E0E\u903B\u8F91\u6A21\u578B\u6863\u94FE\u540C\u6B3E\u3002 */\r\n.asone-panel .ruleRowCard .dragHandle {\r\n  flex: none;\r\n  color: var(--dim);\r\n  cursor: grab;\r\n  user-select: none;\r\n  font-size: 13px;\r\n  line-height: 1;\r\n}\r\n.asone-panel .ruleRowCard .dragHandle:active {\r\n  cursor: grabbing;\r\n}\r\n.asone-panel .ruleRowCard.nodeRowDragging {\r\n  opacity: 0.45;\r\n}\r\n.asone-panel .schedRowsOutside {\r\n  outline: 1px dashed var(--bad);\r\n  outline-offset: 4px;\r\n  border-radius: 8px;\r\n}\r\n.asone-panel .ruleOpen {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  border-top: 1px solid var(--border);\r\n  padding-top: 10px;\r\n}\r\n/* \u7F16\u8F91\u5668:\u4E0E\u903B\u8F91\u6A21\u578B\u7F16\u8F91\u5668\u540C\u6B3E .editor + .fieldRow(\u6807\u7B7E\u5728\u4E0A)\u3002 */\r\n.asone-panel .ruleEditor,\r\n.asone-panel .ruleOpen .editor {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n}\r\n.asone-panel .ruleEditor .fieldRow,\r\n.asone-panel .ruleOpen .fieldRow {\r\n  max-width: 520px;\r\n}\r\n/* \u5361\u5934\u64CD\u4F5C\u533A:\u7F16\u8F91 / \u5220\u9664 \u7D27\u51D1\u6392\u5217\u3002 */\r\n.asone-panel .ruleRowCard .rowActions {\r\n  gap: 6px;\r\n}\r\n.asone-panel .ruleModelTag {\r\n  max-width: 320px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n/* \u65F6\u6BB5\u914D\u7F6E\u5361:\u4E00\u6761\u65F6\u6BB5 = \u540D\u79F0 + \u82E5\u5E72\u5B50\u89C4\u5219(\u5E38\u5C55\u5F00)\u3002 */\r\n.asone-panel .profileRows {\r\n  gap: 10px;\r\n}\r\n.asone-panel .profileRow {\r\n  list-style: none;\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  background: var(--surface-deep);\r\n  padding: 10px 12px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n}\r\n.asone-panel .profileTop {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n.asone-panel .profileName {\r\n  flex: 0 1 220px;\r\n  height: 30px;\r\n  font-size: 12.5px;\r\n  font-weight: 500;\r\n}\r\n.asone-panel .profileDel {\r\n  margin-left: auto;\r\n}\r\n.asone-panel .profileSeg {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 12px;\r\n  flex-wrap: wrap;\r\n  padding-top: 6px;\r\n  border-top: 1px dashed var(--border);\r\n}\r\n.asone-panel .profileSegDays {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  flex: none;\r\n}\r\n.asone-panel .profileSegTimes {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  flex-wrap: wrap;\r\n  min-width: 0;\r\n}\r\n.asone-panel .profileTime {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n}\r\n.asone-panel .profileTime .input {\r\n  width: 104px;\r\n  height: 28px;\r\n  font-size: 12px;\r\n  padding: 0 6px;\r\n}\r\n.asone-panel .profileNote {\r\n  color: var(--text-soft);\r\n  font-size: 11.5px;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .profileActions {\r\n  display: flex;\r\n  gap: 8px;\r\n  padding-top: 2px;\r\n}\r\n.asone-panel .profileRow .rr-day-set {\r\n  display: inline-flex;\r\n  gap: 3px;\r\n}\r\n.asone-panel .profileRow .rr-day {\r\n  appearance: none;\r\n  width: 24px;\r\n  height: 24px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 5px;\r\n  background: transparent;\r\n  color: var(--text-soft);\r\n  font-size: 11.5px;\r\n  line-height: 1;\r\n  cursor: pointer;\r\n  padding: 0;\r\n}\r\n.asone-panel .profileRow .rr-day.on {\r\n  background: var(--accent);\r\n  border-color: var(--accent);\r\n  color: var(--on-accent);\r\n}\r\n\r\n\r\n.asone-panel .ui-field-err {\r\n  margin: 0;\r\n  color: var(--bad);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .ui-check {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  font-size: 13px;\r\n  cursor: pointer;\r\n  color: var(--text);\r\n}\r\n\r\n.asone-panel .ui-jsonbox {\r\n  box-sizing: border-box;\r\n  width: 100%;\r\n  padding: 8px 10px;\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  color: var(--text);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  resize: vertical;\r\n  /* rows=3 \u8D77\u6B65\uFF1B\u5185\u5BB9\u591A\u65F6\u624B\u52A8\u5F80\u4E0B\u62D6\uFF0C\u4F46\u4E0D\u8BB8\u62D6\u5230\u628A\u6574\u5F20\u5361\u7247\u6491\u6EE1\u5C4F\u3002 */\r\n  max-height: 200px;\r\n}\r\n\r\n.asone-panel .ui-jsonbox:focus {\r\n  outline: none;\r\n  border-color: var(--accent);\r\n}\r\n\r\n.asone-panel .ui-json-toggle {\r\n  appearance: none;\r\n  background: none;\r\n  border: none;\r\n  font: inherit;\r\n  color: var(--accent);\r\n  padding: 4px 0;\r\n  cursor: pointer;\r\n  font-size: 12.5px;\r\n}\r\n\r\n.asone-panel .ui-json-err {\r\n  margin: 0;\r\n  color: var(--bad);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .ui-json-actions {\r\n  display: flex;\r\n  justify-content: flex-end;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .ui-key-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  flex-wrap: wrap;\r\n}\r\n\r\n.asone-panel .ui-key {\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n  color: var(--text);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 4px 10px;\r\n  word-break: break-all;\r\n}\r\n\r\n.asone-panel .ui-badge {\r\n  display: inline-block;\r\n  padding: 1px 8px;\r\n  border-radius: 999px;\r\n  font-size: 11.5px;\r\n  color: var(--text);\r\n  border: 1px solid var(--border);\r\n  background: transparent;\r\n  white-space: nowrap;\r\n}\r\n\r\n/* \u2500\u2500 \u8C03\u5EA6\u89C4\u5219\u7F16\u8F91\u5668(2026-11-18 \u91CD\u505A:\u4E00\u6761\u89C4\u5219\u4E00\u884C) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\r\n *\r\n * \u7ED3\u6784:section.ui-card.rule-panel.asone-scheduler\r\n *         > .ui-card-head(badge + \u526F\u6807\u9898 + \u6761\u6570 + \u6DFB\u52A0\u6309\u94AE)\r\n *         > .rule-rows > .rule-item > .rule-row > .rr-seg \xD7 N\r\n *                        > .rule-item > .rule-detail(\u65F6\u6BB5\u5C55\u5F00\u533A,\u6309\u9700)\r\n *\r\n * \u26A0\uFE0F \u5206\u9694\u7EBF\u7684\u5386\u53F2 bug(\u672C\u6B21\u4FEE\u6389,\u6839\u56E0\u89C1 `.rule-rows` \u6CE8\u91CA):\u65E7\u7248\u6BCF\u6761\u89C4\u5219\u662F\r\n * \u4E00\u4E2A `.blocks-container`,\u9760 `.rule-panel .blocks-container { padding: 12px 0 0;\r\n * border-top: 1px solid }` \u753B\u5206\u9694\u7EBF \u2014\u2014 **padding-bottom \u4E3A 0**,\u4E8E\u662F\u4E0A\u4E00\u4E2A\r\n * `.box` \u7684 border-bottom \u4E0E\u4E0B\u4E00\u6761\u7684 border-top \u4E25\u4E1D\u5408\u7F1D\u8D34\u5728\u4E00\u8D77(\u5B9E\u6D4B\u95F4\u8DDD\r\n * 0.0px),\u4E24\u6761 1px \u8FB9\u6846\u5E76\u6210\u4E00\u9053\u538B\u5728\u4E0A\u4E00\u5143\u7D20\u5E95\u8FB9\u4E0A\u7684\u7C97\u7EBF\u3002\r\n *\r\n * \u5168\u90E8 scoped \u5230 .asone-scheduler,\u907F\u514D\u6C61\u67D3\u5168\u5C40;\u989C\u8272\u4E00\u5F8B\u8D70\u4E3B\u9898\u4EE4\u724C\r\n * (--border / --text / --dim / --accent / --bad \u7B49,\u5747\u6765\u81EA --dsw-alias-*)\u3002\r\n */\r\n.asone-panel .asone-scheduler {\r\n  --asec-bg-card: var(--bg-card);\r\n  --asec-bg-box: var(--dsw-alias-bg-layer-2, #182130);\r\n  --asec-bg-input: var(--dsw-alias-bg-layer-3, #101722);\r\n  --asec-border: var(--border);\r\n  --asec-text: var(--text-soft);\r\n  --asec-muted: var(--dim);\r\n  --asec-primary: var(--accent);\r\n  --asec-primary-bg: var(--accent-soft);\r\n  --asec-danger: var(--bad);\r\n}\r\n\r\n/* \u6863\u4F4D\u5FBD\u7AE0(\u4F5C\u7528\u57DF\u5185\u8986\u76D6\u5168\u5C40 .badge) */\r\n.asone-panel .asone-scheduler .badge {\r\n  display: inline-block;\r\n  background: var(--asec-primary);\r\n  color: var(--on-accent);\r\n  font-weight: bold;\r\n  font-size: 12px;\r\n  padding: 2px 10px;\r\n  border-radius: 6px;\r\n  border: 1px solid transparent;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .asone-scheduler .btn-add {\r\n  background: transparent;\r\n  color: var(--asec-text);\r\n  border: 1px solid var(--asec-border);\r\n  padding: 4px 12px;\r\n  border-radius: 4px;\r\n  cursor: pointer;\r\n  transition: all 0.2s;\r\n}\r\n.asone-panel .asone-scheduler .btn-add:hover {\r\n  background: var(--surface-hover);\r\n}\r\n\r\n/* \u7A7A\u7EC4\u63D0\u793A */\r\n.asone-panel .asone-scheduler .card-empty {\r\n  margin: 0;\r\n  padding: 14px 0 0;\r\n  color: var(--asec-muted);\r\n  font-size: 13px;\r\n}\r\n\r\n/* \u2500\u2500 \u89C4\u5219\u5217\u8868:\u5206\u9694\u7EBF\u552F\u4E00\u51FA\u5904 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\r\n * \u5206\u9694\u7EBF\u53EA\u7531 `.rule-item + .rule-item` \u7684 border-top \u63D0\u4F9B,\u5E76\u4E14\u6BCF\u4E2A\r\n * `.rule-item` **\u4E0A\u4E0B\u5404\u6709\u7B49\u91CF padding**(10px),\u6240\u4EE5\u7EBF\u4E24\u4FA7\u6C38\u8FDC\u6709\u7559\u767D,\r\n * \u4E0D\u53EF\u80FD\u518D\u548C\u4E0A\u4E00\u4E2A\u5143\u7D20\u7684\u8FB9\u6846\u8D34\u5728\u4E00\u8D77\u3002\r\n * \u26A0\uFE0F \u4E0D\u8981\u5728\u8FD9\u91CC\u6216 .rule-item \u4E0A\u52A0\u8D1F margin \u2014\u2014 \u90A3\u6B63\u662F\u65E7 bug \u7684\u6210\u56E0\u4E4B\u4E00\r\n * (\u65E7\u7684 `.rule-err { margin: -8px 20px 20px }` \u628A\u9519\u8BEF\u6587\u6848\u4E0A\u63D0 8px \u538B\u8FDB\r\n * \u4E0A\u4E00\u4E2A .box,\u5B9E\u6D4B\u91CD\u53E0 8.0px)\u3002\r\n */\r\n.asone-panel .asone-scheduler .rule-rows {\r\n  display: flex;\r\n  flex-direction: column;\r\n}\r\n.asone-panel .asone-scheduler .rule-item {\r\n  padding: 10px 0;\r\n}\r\n.asone-panel .asone-scheduler .rule-item + .rule-item {\r\n  border-top: 1px solid var(--asec-border);\r\n}\r\n/* \u9996\u6761\u4E0D\u518D\u53E0\u4E00\u6B21\u5361\u7247\u5934\u7684\u4E0B\u8FB9\u8DDD(.ui-card-head \u81EA\u5E26 10px)\u3002 */\r\n.asone-panel .asone-scheduler .rule-rows > .rule-item:first-child {\r\n  padding-top: 2px;\r\n}\r\n\r\n/* \u2500\u2500 \u4E00\u884C\u5E03\u5C40 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .asone-scheduler .rule-row {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  align-items: center;\r\n  gap: 8px 14px;\r\n  min-width: 0;\r\n}\r\n\r\n/* \u4E00\u4E2A\u300C\u6BB5\u300D= \u5C0F\u6807\u7B7E + \u63A7\u4EF6;\u7A84\u5C4F\u6574\u4F53\u6298\u884C,\u4E0D\u5728\u6BB5\u5185\u90E8\u65AD\u5F00 */\r\n.asone-panel .asone-scheduler .rr-seg {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  min-width: 0;\r\n}\r\n.asone-panel .asone-scheduler .rr-lab {\r\n  flex: none;\r\n  color: var(--asec-muted);\r\n  font-size: 11.5px;\r\n  line-height: 1;\r\n  white-space: nowrap;\r\n  cursor: help;\r\n}\r\n.asone-panel .asone-scheduler .rr-req {\r\n  color: var(--asec-danger);\r\n  margin-left: 2px;\r\n}\r\n.asone-panel .asone-scheduler .rr-unit {\r\n  flex: none;\r\n  color: var(--asec-muted);\r\n  font-size: 11.5px;\r\n}\r\n/* \u7A7A\u6001\u8BF4\u660E(\u300C\u6BCF\u5929\u300D/\u300C\u5168\u5929\u300D):\u8BA9\u300C\u4E0D\u8BBE = \u4E0D\u9650\u300D\u8FD9\u4EF6\u4E8B\u663E\u5F0F\u53EF\u89C1 */\r\n.asone-panel .asone-scheduler .rr-note {\r\n  flex: none;\r\n  color: var(--asec-muted);\r\n  font-size: 11.5px;\r\n  font-style: normal;\r\n  cursor: help;\r\n}\r\n\r\n/* \u4F9B\u5E94\u5546 / \u6A21\u578B:\u53EF\u4F38\u7F29\u4F46\u6709\u4E0A\u9650\u3002\r\n * \u5B8C\u5168\u4E0D\u4F38\u7F29\u4F1A\u5728\u884C\u5C3E\u7559\u4E00\u5927\u7247\u7A7A\u767D(\xD7 \u88AB margin-left:auto \u9876\u5230\u6700\u53F3);\r\n * \u5B8C\u5168\u81EA\u7531\u4F38\u7F29\u5728 1440 \u5BBD\u4E0B\u53C8\u4F1A\u5404\u5360 300px\u3001\u628A\u884C\u644A\u5F97\u592A\u6563\u3002\u53D6\u4E2D\u95F4:\r\n * flex-basis 150/160,\u6700\u591A\u957F\u5230 260/280,\u5269\u4E0B\u7684\u7A7A\u767D\u7559\u7ED9\u884C\u5C3E\u7684 \xD7 \u2014\u2014 \u4F4D\u7F6E\r\n * \u56FA\u5B9A(\u6C38\u8FDC\u5728\u6700\u53F3),\u626B\u884C\u65F6\u597D\u627E,\u4E5F\u4E0D\u81F3\u4E8E\u79BB\u5185\u5BB9\u592A\u8FDC\u3002 */\r\n.asone-panel .asone-scheduler .rr-provider select,\r\n.asone-panel .asone-scheduler .rr-model select {\r\n  width: 100%;\r\n  min-width: 0;\r\n}\r\n.asone-panel .asone-scheduler .rr-provider {\r\n  flex: 1 1 150px;\r\n  max-width: 260px;\r\n  min-width: 110px;\r\n}\r\n.asone-panel .asone-scheduler .rr-model {\r\n  flex: 1 1 160px;\r\n  max-width: 280px;\r\n  min-width: 110px;\r\n}\r\n.asone-panel .asone-scheduler .rr-expiry {\r\n  flex: 0 0 auto;\r\n}\r\n.asone-panel .asone-scheduler .rr-expiry input[type="date"] {\r\n  width: 128px;\r\n}\r\n.asone-panel .asone-scheduler .rr-cooldown input[type="number"] {\r\n  width: 64px;\r\n}\r\n.asone-panel .asone-scheduler .rr-days {\r\n  flex: 0 0 auto;\r\n}\r\n.asone-panel .asone-scheduler .rr-times {\r\n  flex: 0 0 auto;\r\n}\r\n.asone-panel .asone-scheduler .rr-actions {\r\n  flex: 0 0 auto;\r\n  display: flex;\r\n  align-items: center;\r\n  margin-left: auto;\r\n}\r\n\r\n/* \u7D27\u51D1\u63A7\u4EF6:\u884C\u5185\u63A7\u4EF6\u538B\u5230 26px,\u4FDD\u8BC1\u4E00\u884C\u653E\u5F97\u4E0B\u4E14\u4E0D\u62AC\u9AD8\u884C\u9AD8 */\r\n.asone-panel .asone-scheduler .rule-row .input-control {\r\n  height: 26px;\r\n  padding: 0 6px;\r\n  font-size: 12.5px;\r\n  border-radius: 5px;\r\n  line-height: 1;\r\n}\r\n.asone-panel .asone-scheduler .input-control {\r\n  background: var(--asec-bg-input);\r\n  border: 1px solid var(--asec-border);\r\n  color: var(--asec-text);\r\n  padding: 6px 10px;\r\n  border-radius: 6px;\r\n  font-size: 13px;\r\n  font-family: inherit;\r\n  width: 100%;\r\n  outline: none;\r\n  transition: border-color 0.2s;\r\n}\r\n.asone-panel .asone-scheduler .input-control:focus {\r\n  border-color: var(--asec-primary);\r\n}\r\n.asone-panel .asone-scheduler select.input-control {\r\n  cursor: pointer;\r\n}\r\n\r\n/* \u65E5\u5386\u548C\u65F6\u949F\u56FE\u6807\u53CD\u8272\u6D45\u8272(\u8BBE\u8BA1\u7A3F\u5173\u952E\u70B9) */\r\n.asone-panel .asone-scheduler input[type="date"]::-webkit-calendar-picker-indicator,\r\n.asone-panel .asone-scheduler input[type="time"]::-webkit-calendar-picker-indicator {\r\n  filter: invert(0.6);\r\n  cursor: pointer;\r\n  opacity: 0.8;\r\n}\r\n.asone-panel .asone-scheduler input[type="date"]::-webkit-calendar-picker-indicator:hover,\r\n.asone-panel .asone-scheduler input[type="time"]::-webkit-calendar-picker-indicator:hover {\r\n  opacity: 1;\r\n}\r\n\r\n/* \u26A0 \u9690\u85CF\u672A\u9009\u62E9\u65E5\u671F\u65F6\u7684 yyyy/mm/\u65F6 \u5360\u4F4D\u7B26(\u7528\u6237\u70B9\u540D\u5FC5\u987B\u4FDD\u7559)\r\n * \u26A0\uFE0F \u7528 JS \u9A71\u52A8\u7684 `.is-empty` \u7C7B,\u4E0D\u7528 `:invalid`:\u7A7A\u7684\u975E required date \u8F93\u5165\r\n *    \u662F `:valid`(\u6CA1\u6709 valueMissing/typeMismatch),`:invalid` \u53EA\u5728 required \u65F6\u624D\r\n *    \u5339\u914D\u7A7A\u503C \u2014\u2014 \u800C required \u4F1A\u987A\u5E26\u7981\u6389 Chromium \u7684 \xD7 \u6E05\u9664\u6309\u94AE(\u89C1 settings-rules)\u3002*/\r\n.asone-panel .asone-scheduler input[type="date"].is-empty::-webkit-datetime-edit {\r\n  color: transparent;\r\n}\r\n.asone-panel .asone-scheduler input[type="date"]:focus::-webkit-datetime-edit {\r\n  color: var(--asec-text);\r\n}\r\n\r\n/* \u2500\u2500 \u661F\u671F\u6BB5:7 \u4E2A\u5C0F\u65B9\u5757 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .asone-scheduler .rr-day-set {\r\n  display: flex;\r\n  gap: 3px;\r\n  flex: none;\r\n}\r\n.asone-panel .asone-scheduler .rr-day {\r\n  appearance: none;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 22px;\r\n  height: 22px;\r\n  padding: 0;\r\n  border-radius: 4px;\r\n  border: 1px solid var(--asec-border);\r\n  background: var(--asec-bg-input);\r\n  color: var(--asec-muted);\r\n  font: inherit;\r\n  font-size: 11.5px;\r\n  line-height: 1;\r\n  cursor: pointer;\r\n  transition: background 0.15s, border-color 0.15s, color 0.15s;\r\n  flex: none;\r\n}\r\n.asone-panel .asone-scheduler .rr-day:hover {\r\n  border-color: var(--asec-primary);\r\n  color: var(--asec-text);\r\n}\r\n.asone-panel .asone-scheduler .rr-day.on {\r\n  background: var(--asec-primary-bg);\r\n  border-color: var(--asec-primary);\r\n  color: var(--asec-primary);\r\n  font-weight: bold;\r\n}\r\n.asone-panel .asone-scheduler .rr-clear {\r\n  appearance: none;\r\n  background: none;\r\n  border: none;\r\n  color: var(--asec-muted);\r\n  font: inherit;\r\n  font-size: 11px;\r\n  line-height: 1;\r\n  padding: 2px 3px;\r\n  border-radius: 3px;\r\n  cursor: pointer;\r\n  flex: none;\r\n}\r\n.asone-panel .asone-scheduler .rr-clear:hover {\r\n  color: var(--asec-danger);\r\n}\r\n\r\n/* \u2500\u2500 \u65F6\u6BB5\u6BB5:\u7D27\u51D1 chip + \u5C55\u5F00\u5F00\u5173 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .asone-scheduler .rr-spans {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  flex: none;\r\n}\r\n.asone-panel .asone-scheduler .rr-span {\r\n  display: inline-block;\r\n  padding: 1px 6px;\r\n  border-radius: 4px;\r\n  border: 1px solid var(--asec-border);\r\n  background: var(--asec-bg-input);\r\n  color: var(--asec-text);\r\n  font-size: 11.5px;\r\n  font-variant-numeric: tabular-nums;\r\n  line-height: 16px;\r\n  white-space: nowrap;\r\n  cursor: default;\r\n}\r\n.asone-panel .asone-scheduler .rr-span-more {\r\n  color: var(--asec-muted);\r\n}\r\n.asone-panel .asone-scheduler .rr-caret {\r\n  appearance: none;\r\n  background: none;\r\n  border: 1px solid transparent;\r\n  color: var(--asec-muted);\r\n  font: inherit;\r\n  font-size: 10px;\r\n  line-height: 1;\r\n  padding: 3px 4px;\r\n  border-radius: 4px;\r\n  cursor: pointer;\r\n  flex: none;\r\n  transition: transform 0.15s, color 0.15s;\r\n}\r\n.asone-panel .asone-scheduler .rr-caret:hover {\r\n  color: var(--asec-text);\r\n  border-color: var(--asec-border);\r\n}\r\n.asone-panel .asone-scheduler .rr-caret.on {\r\n  transform: rotate(180deg);\r\n  color: var(--asec-primary);\r\n}\r\n\r\n/* \u5220\u9664\u89C4\u5219(\u884C\u5C3E \xD7) */\r\n.asone-panel .asone-scheduler .rr-del {\r\n  appearance: none;\r\n  background: none;\r\n  border: 1px solid transparent;\r\n  color: var(--asec-muted);\r\n  font: inherit;\r\n  font-size: 15px;\r\n  line-height: 1;\r\n  padding: 2px 6px;\r\n  border-radius: 4px;\r\n  cursor: pointer;\r\n  flex: none;\r\n}\r\n.asone-panel .asone-scheduler .rr-del:hover {\r\n  color: var(--asec-danger);\r\n  border-color: var(--bad-line);\r\n  background: var(--surface-bad);\r\n}\r\n\r\n/* \u2500\u2500 \u65F6\u6BB5\u5C55\u5F00\u533A(\u5B8C\u6574\u7F16\u8F91:\u589E / \u5220 / \u6539\u591A\u6BB5) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .asone-scheduler .rule-detail {\r\n  margin-top: 8px;\r\n  padding: 8px 10px;\r\n  border: 1px dashed var(--asec-border);\r\n  border-radius: 6px;\r\n  background: var(--asec-bg-box);\r\n}\r\n.asone-panel .asone-scheduler .rd-head {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n  flex-wrap: wrap;\r\n  margin-bottom: 6px;\r\n}\r\n.asone-panel .asone-scheduler .rd-title {\r\n  color: var(--asec-text);\r\n  font-size: 12px;\r\n  font-weight: 500;\r\n}\r\n.asone-panel .asone-scheduler .rd-hint {\r\n  color: var(--asec-muted);\r\n  font-size: 11.5px;\r\n}\r\n.asone-panel .asone-scheduler .rd-times {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  align-items: center;\r\n  gap: 8px 12px;\r\n}\r\n.asone-panel .asone-scheduler .rd-time-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n.asone-panel .asone-scheduler .rd-time-row input[type="time"] {\r\n  width: 110px;\r\n  flex: none;\r\n}\r\n.asone-panel .asone-scheduler .rd-tilde {\r\n  color: var(--asec-muted);\r\n}\r\n.asone-panel .asone-scheduler .btn-del-time {\r\n  background: none;\r\n  border: none;\r\n  color: var(--asec-danger);\r\n  cursor: pointer;\r\n  font-size: 15px;\r\n  line-height: 1;\r\n  padding: 0 4px;\r\n}\r\n.asone-panel .asone-scheduler .btn-add-time {\r\n  background: none;\r\n  border: none;\r\n  color: var(--asec-primary);\r\n  cursor: pointer;\r\n  font: inherit;\r\n  font-size: 12.5px;\r\n  padding: 0;\r\n}\r\n.asone-panel .asone-scheduler .btn-add-time:hover {\r\n  text-decoration: underline;\r\n}\r\n\r\n/* \u89C4\u5219\u6821\u9A8C\u9519\u8BEF(\u26A0\uFE0F \u5FC5\u987B\u7528**\u6B63** margin:\u65E7\u7684 -8px \u4F1A\u538B\u8FDB\u4E0A\u4E00\u4E2A\u5143\u7D20) */\r\n.asone-panel .asone-scheduler .rule-err {\r\n  margin: 4px 0 0;\r\n  color: var(--asec-danger);\r\n  font-size: 12px;\r\n  line-height: 1.5;\r\n}\r\n\r\n/* \u2500\u2500 \u7A84\u5C4F:\u6BB5\u6574\u4F53\u6298\u884C(\u6BB5\u5185\u90E8\u4E0D\u65AD\u5F00),\u4E00\u884C\u53D8\u4E24\u4E09\u884C\u4F46\u6BCF\u884C\u4ECD\u662F\u7D27\u51D1\u6BB5 \u2500\u2500 */\r\n@media (max-width: 1180px) {\r\n  .asone-panel .asone-scheduler .rr-provider,\r\n  .asone-panel .asone-scheduler .rr-model {\r\n    flex: 1 1 180px;\r\n  }\r\n  .asone-panel .asone-scheduler .rr-actions {\r\n    margin-left: 0;\r\n  }\r\n}\r\n\r\n/* \u5206\u7EC4\u5E03\u5C40(\u8C03\u5EA6\u7F16\u8F91\u5668\u5DF2\u6362.asone-scheduler \u7ED3\u6784;\u8FD9\u51E0\u4E2A\u4EC5\u300C\u91CD\u8BD5\u7B56\u7565\u300D\u5361\u8FD8\u5728\u7528) */\r\n.asone-panel .ui-rule-groups {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 16px;\r\n}\r\n.asone-panel .ui-group {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n}\r\n.asone-panel .ui-group-head {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n}\r\n.asone-panel .ui-group-title {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  font-weight: 500;\r\n}\r\n\r\n/* \u2500\u2500 \u9000\u907F\u66F2\u7EBF\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .ui-chart-box {\r\n  width: 100%;\r\n  overflow-x: auto;\r\n  padding: 8px 0 2px;\r\n}\r\n.asone-panel .ui-chart-yaxis {\r\n  stroke: var(--border);\r\n}\r\n.asone-panel .ui-chart-grid {\r\n  stroke: var(--border);\r\n}\r\n.asone-panel .ui-chart-axis {\r\n  stroke: var(--border);\r\n}\r\n.asone-panel .ui-chart-band {\r\n  fill: var(--accent-soft);\r\n}\r\n.asone-panel .ui-chart-dash {\r\n  stroke: var(--warn);\r\n  stroke-dasharray: 4 4;\r\n}\r\n.asone-panel .ui-chart-line {\r\n  fill: none;\r\n  stroke: var(--accent);\r\n  stroke-width: 1.8;\r\n}\r\n.asone-panel .ui-chart-dot {\r\n  fill: var(--accent);\r\n}\r\n.asone-panel .ui-chart-label {\r\n  fill: var(--text-soft);\r\n  font-size: 10px;\r\n}\r\n.asone-panel .ui-chart-tick {\r\n  fill: var(--text-soft);\r\n  font-size: 10px;\r\n}\r\n.asone-panel .ui-chart-text {\r\n  margin-top: 10px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n}\r\n.asone-panel .ui-chart-text p {\r\n  margin: 0;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n/* \u2500\u2500 \u5E95\u90E8\u4FDD\u5B58\u680F\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .ui-savebar {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 14px;\r\n  background: var(--surface);\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 10px 14px;\r\n  /* \u9759\u6001 footer:\u4E0D\u60AC\u6D6E\u3001\u4E0D\u906E\u6321\u5361\u7247\u5185\u5BB9(\u7528\u6237\u91CD\u8BBE\u8BA1\u540E\u5361\u7247\u66F4\u5BC6,sticky \u4F1A\u538B\u4F4F\u672B\u5361)\u3002 */\r\n}\r\n.asone-panel .ui-savebar-count {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ui-savebar-dot {\r\n  width: 7px;\r\n  height: 7px;\r\n  border-radius: 50%;\r\n  background: var(--bad);\r\n}\r\n.asone-panel .ui-savebar-msg {\r\n  flex: 1;\r\n  min-width: 0;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .ui-savebar-btns {\r\n  display: flex;\r\n  gap: 8px;\r\n}\r\n\r\n/* \u2500\u2500 ui-btn \u6309\u94AE\u4F53\u7CFB(\u8BBE\u7F6E\u9875) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .ui-btn {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: var(--text);\r\n  background: var(--accent-soft);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  padding: 0 12px;\r\n  font-size: 12.5px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-btn:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n}\r\n.asone-panel .ui-btn:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n.asone-panel .ui-btn-sm {\r\n  height: 24px;\r\n  padding: 0 10px;\r\n  font-size: 12px;\r\n}\r\n.asone-panel .ui-btn-primary {\r\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  border-color: var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  color: var(--on-accent);\r\n}\r\n.asone-panel .ui-btn-primary:hover:not(:disabled) {\r\n  background: var(--dsw-alias-button-info-hover, #24425f);\r\n}\r\n.asone-panel .ui-btn-ghost {\r\n  background: none;\r\n  color: var(--text);\r\n}\r\n.asone-panel .ui-btn-danger {\r\n  color: var(--bad);\r\n}\r\n\r\n/* ===========================================================================\r\n   \u5176\u4ED6\u4F9B\u5E94\u5546\u9875(ProvidersPage,scoped \u6837\u5F0F)\r\n   =========================================================================== */\r\n\r\n.asone-panel .providers-page {\r\n  max-width: 760px;\r\n}\r\n\r\n.asone-panel .rows {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  margin: 12px 0 0;\r\n  padding: 0;\r\n  list-style: none;\r\n}\r\n\r\n.asone-panel .rowCard {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  border: 1px solid var(--border);\r\n  background: var(--surface);\r\n  border-radius: 10px;\r\n  padding: 12px 14px;\r\n}\r\n\r\n.asone-panel .rowHead {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n.asone-panel .rowName {\r\n  color: var(--text);\r\n  font-size: 14px;\r\n  font-weight: 500;\r\n}\r\n\r\n.asone-panel .credentialDot {\r\n  flex: none;\r\n  width: 8px;\r\n  height: 8px;\r\n  border-radius: 50%;\r\n  display: inline-block;\r\n}\r\n\r\n.asone-panel .dotOk {\r\n  background: var(--ok);\r\n}\r\n\r\n.asone-panel .dotMissing {\r\n  background: var(--bad);\r\n}\r\n\r\n.asone-panel .rowActions {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  margin-left: auto;\r\n}\r\n\r\n.asone-panel .rowBtn {\r\n  appearance: none;\r\n  font: inherit;\r\n  border-radius: 6px;\r\n  height: 28px;\r\n  padding: 0 12px;\r\n  font-size: 12px;\r\n  cursor: pointer;\r\n  border: 1px solid var(--border);\r\n  background: transparent;\r\n  color: var(--text);\r\n}\r\n.asone-panel .rowBtn:hover:not(:disabled) {\r\n  background: var(--surface-hover);\r\n}\r\n.asone-panel .rowBtn.danger {\r\n  color: var(--bad);\r\n}\r\n.asone-panel .rowBtn:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.asone-panel .panel {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n  background: var(--surface-deep);\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  padding: 12px;\r\n}\r\n\r\n.asone-panel .panelTitle {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  font-weight: 500;\r\n  line-height: 20px;\r\n  margin-bottom: 2px;\r\n}\r\n\r\n.asone-panel .catalogSection {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n\r\n.asone-panel .catalogTitle {\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-weight: 500;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .modelListHead {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n  margin-bottom: 2px;\r\n}\r\n\r\n.asone-panel .modelCatalogMeta {\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .headActions {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 2px;\r\n}\r\n\r\n.asone-panel .linkButton {\r\n  appearance: none;\r\n  background: none;\r\n  border: none;\r\n  font: inherit;\r\n  border-radius: 4px;\r\n  height: 28px;\r\n  color: var(--text);\r\n  cursor: pointer;\r\n  padding: 0 8px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  display: inline-flex;\r\n  align-items: center;\r\n}\r\n.asone-panel .linkButton:hover:not(:disabled) {\r\n  background: var(--surface-hover);\r\n  color: var(--text);\r\n}\r\n.asone-panel .linkButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.asone-panel .modelEmpty {\r\n  margin: 0;\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  border: 1px dashed var(--border);\r\n  border-radius: 8px;\r\n  text-align: center;\r\n  padding: 12px;\r\n}\r\n\r\n.asone-panel .addButton {\r\n  box-sizing: border-box;\r\n  flex: none;\r\n  width: 100%;\r\n  border: 1px dashed var(--border);\r\n  border-radius: 10px;\r\n  background: var(--surface);\r\n  height: 54px;\r\n  margin-top: 10px;\r\n  color: var(--text);\r\n  font: inherit;\r\n  cursor: pointer;\r\n  display: flex;\r\n  justify-content: center;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 0 14px;\r\n  font-size: 14px;\r\n}\r\n.asone-panel .addButton:hover:not(:disabled) {\r\n  background: var(--surface-hover);\r\n  border-color: var(--border);\r\n}\r\n.asone-panel .addButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n.asone-panel .cardFooter {\r\n  justify-content: flex-end;\r\n}\r\n\r\n.asone-panel .envPrefix {\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n  color: var(--text);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 4px 10px;\r\n  display: inline-block;\r\n  align-self: flex-start;\r\n  word-break: break-all;\r\n}\r\n\r\n/* \u2500\u2500 \u903B\u8F91\u6A21\u578B / \u6A21\u578B\u603B\u89C8 \u5B50\u9875(\u79FB\u690D\u81EA\u65E2\u6709\u9762\u677F,\u7C7B\u540D\u6CBF\u7528\u539F\u8BBE\u8BA1)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .section {\r\n  color: var(--text);\r\n  flex-direction: column;\r\n  gap: 12px;\r\n  display: flex;\r\n}\r\n\r\n/* \u4E24\u9875 section \u5BBD\u5EA6\u5DEE\u5F02(\u590D\u7528\u540C\u4E00 .section,\u4EC5 max-width \u4E0D\u540C) */\r\n.asone-panel .lm-section {\r\n  /* \u26A0\uFE0F 2026-10-25(m14379):\u903B\u8F91\u6A21\u578B\u5217\u8868\u5728\u52A0\u5BBD\u7684 content \u91CC\u5C45\u4E2D\u3002     \u663E\u5F0F width:min(720px,100%) \u2014\u2014\u5149\u9760 max-width + margin-inline:auto\r\n     \u4F1A\u8BA9 flex item \u6536\u7F29\u5230\u5185\u5BB9\u5BBD(\u5B9E\u6D4B 531px),\u5FC5\u987B\u7ED9\u56FA\u5B9A\u5BBD\u5EA6\u3002*/\r\n  max-width: 720px;\r\n  width: min(720px, 100%);\r\n  margin-inline: auto;\r\n}\r\n.asone-panel .dep-section {\r\n  /* \u26A0\uFE0F 2026-10-25(m14922):\u6A21\u578B\u603B\u89C8\u6574\u7EC4\u5C45\u4E2D\u3002section \u5168\u5BBD,\u5361\u7247\u7EC4\u81EA\u8EAB     (dep-grid)\u7528 width:min(1464px,100%) + margin-inline:auto \u5C45\u4E2D;\r\n     \u4E0D\u518D\u7528 max-width 1200 \u9650\u5236(\u90A3\u4F1A\u5361\u6B7B\u53EA\u80FD 2 \u5217)\u3002*/\r\n  width: 100%;\r\n}\r\n.asone-panel .pv-section {\r\n  /* \u26A0\uFE0F 2026-10-25(m14379):\u5176\u4ED6\u4F9B\u5E94\u5546\u5217\u8868\u5728\u52A0\u5BBD\u7684 content \u91CC\u5C45\u4E2D\u3002     \u540C\u4E0A,\u663E\u5F0F\u5BBD\u5EA6\u9632\u6B62\u6536\u7F29(\u5B9E\u6D4B 248px)\u3002*/\r\n  max-width: 720px;\r\n  width: min(720px, 100%);\r\n  margin-inline: auto;\r\n}\r\n\r\n/* \u300C\u652F\u6301\u7684\u601D\u8003\u5F3A\u5EA6\u300D\u5FBD\u7AE0(\u603B\u89C8\u9875\u6BCF\u884C\u6A21\u578B\u4E00\u4E2A;pill \u6837\u5F0F\u7EDF\u4E00\u8D70 .pill) */\r\n.asone-panel .pill.efforts {\r\n  max-width: 22ch;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n/* \u539F\u9875\u9762\u7684.err / .savedNotice \u662F\u7EAF\u6587\u5B57;As One \u5DF2\u6709 .err \u76D2\u5F0F\u53D8\u4F53,\r\n   \u7528\u4F5C\u7528\u57DF\u8986\u76D6(.section .err,\u7279\u5F02\u6027 0,2,0)\u8FD8\u539F\u7EAF\u6587\u5B57\u5F62\u6001,\u4E0D\u52A8\u5168\u5C40 .err */\r\n.asone-panel .section .err {\r\n  padding: 0;\r\n  border: 0;\r\n  background: none;\r\n  border-radius: 0;\r\n  margin: 0;\r\n  color: var(--bad);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .savedNotice {\r\n  color: var(--ok);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  margin: 0;\r\n}\r\n\r\n/* \u884C\u5361\u5934\u90E8(\u903B\u8F91\u6A21\u578B) */\r\n.asone-panel .rowIdentity {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .rowTag {\r\n  border: 1px solid var(--border);\r\n  border-radius: 4px;\r\n  color: var(--text);\r\n  flex: none;\r\n  padding: 1px 6px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n}\r\n\r\n.asone-panel .rowRuntime {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  margin-left: 8px;\r\n}\r\n\r\n/* \u5FBD\u7AE0 pill */\r\n.asone-panel .pill {\r\n  display: inline-block;\r\n  padding: 1px 7px;\r\n  border-radius: 9px;\r\n  font-size: 11px;\r\n  line-height: 16px;\r\n  white-space: nowrap;\r\n}\r\n.asone-panel .pill.ok {\r\n  background: var(--surface-ok);\r\n  color: var(--ok);\r\n}\r\n.asone-panel .pill.bad {\r\n  background: var(--surface-bad);\r\n  color: var(--bad);\r\n}\r\n.asone-panel .pill.info {\r\n  background: var(--surface);\r\n  color: var(--dsw-alias-state-business-primary, var(--accent));\r\n}\r\n.asone-panel .pill.na {\r\n  background: var(--chip-bg);\r\n  color: var(--dim);\r\n}\r\n.asone-panel .pill.metric {\r\n  background: var(--chip-bg);\r\n  color: var(--text);\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .pill.alert {\r\n  background: var(--surface-warn);\r\n  color: var(--warn);\r\n}\r\n\r\n/* \u6A21\u578B\u603B\u89C8\u9876\u680F(2026-10-25 m14379 \u91CD\u65B0\u8BBE\u8BA1;m14922 \u8D77\u4E0D\u518D\u6709\u6279\u91CF\u6309\u94AE,\u53EA\u7559\u7EDF\u8BA1) */\r\n.asone-panel .dep-toolbar {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  flex-wrap: wrap;\r\n}\r\n.asone-panel .dep-summary {\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n\r\n/* \u6A21\u578B\u603B\u89C8\u591A\u5217\u5361\u7247(m14922 \u5B9A\u6848:\u4E0D\u518D\u5206\u7EC4\u6298\u53E0,\u6BCF\u90E8\u7F72\u4E00\u884C\u5F39\u6027\u5217\u5BBD+ \u6574\u7EC4\u5C45\u4E2D\u3002   \u26A0\uFE0F \u5217\u5BBD minmax(360px, 480px):1920 \u7A97\u53E3(content 1680,\u5185\u5BB9\u533A 1640)\u4E0B\u80FD\u653E 3 \u5217   (3\xD7480 + 2\xD712 = 1464 \u22481640);\u7A97\u53E3\u66F4\u7A84\u65F6auto-fill \u81EA\u52A8\u964D\u4E3A 2 \u5217 / 1 \u5217\u3002   \u907F\u514D hyperai/deepseek-v4.1-flash-fastest \u8FD9\u7C7B\u957F\u6A21\u578B\u540D\u628A\u5361\u7247\u5185\u5BB9\u6324\u6210\u4E09\u884C\u3002*/\r\n.asone-panel .dep-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fill, minmax(360px, 480px));\r\n  justify-content: center;\r\n  gap: 12px;\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  width: min(1464px, 100%);\r\n  margin-inline: auto;\r\n}\r\n\r\n.asone-panel .depCard {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 10px 12px;\r\n  background: var(--surface);\r\n}\r\n\r\n.asone-panel .depCardHead {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  flex-wrap: wrap;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .depProvider {\r\n  flex: none;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  color: var(--text);\r\n  border: 1px solid var(--border);\r\n  border-radius: 999px;\r\n  padding: 1px 8px;\r\n  background: var(--bg-deep);\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .depCardBody {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n  min-width: 0;\r\n}\r\n\r\n/* \u90E8\u7F72\u5361(\u65E0 hover \u9AD8\u4EAE:\u5361\u7247\u672C\u8EAB\u5DF2\u662F\u72EC\u7ACB\u5757,\u4E0D\u518D\u6A21\u4EFF\u884C) */\r\n.asone-panel .depCard:hover {\r\n  background: var(--surface);\r\n}\r\n\r\n.asone-panel .depCode {\r\n  background: none;\r\n  padding: 0;\r\n  border: 0;\r\n  border-radius: 0;\r\n  font-family: var(--mono);\r\n  font-size: 12.5px;\r\n  color: var(--text);\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  max-width: 100%;\r\n}\r\n\r\n.asone-panel .depChips {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  flex-wrap: wrap;\r\n  min-width: 0;\r\n}\r\n\r\n.asone-panel .depChipEdit {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  background: var(--chip-bg);\r\n  border-radius: 9px;\r\n  padding: 1px 6px 1px 8px;\r\n  line-height: 16px;\r\n}\r\n\r\n.asone-panel .chipLabel {\r\n  font-size: 11px;\r\n  color: var(--text-soft);\r\n}\r\n\r\n.asone-panel .chipNum {\r\n  width: 42px;\r\n  background: var(--bg-deep);\r\n  border: 1px solid var(--border);\r\n  border-radius: 4px;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-variant-numeric: tabular-nums;\r\n  padding: 1px 4px;\r\n  text-align: center;\r\n}\r\n.asone-panel .chipNum:disabled {\r\n  opacity: 0.5;\r\n}\r\n.asone-panel .chipNum::-webkit-outer-spin-button,\r\n.asone-panel .chipNum::-webkit-inner-spin-button {\r\n  -webkit-appearance: none;\r\n  margin: 0;\r\n}\r\n\r\n/* \u601D\u8003\u5F3A\u5EA6\u9009\u62E9\u5668(\u6A21\u578B\u603B\u89C8\u5361\u7247\u5185\u7684\u4E0B\u62C9) */\r\n.asone-panel .chipSelect {\r\n  background: var(--bg-deep);\r\n  border: 1px solid var(--border);\r\n  border-radius: 4px;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  padding: 1px 4px;\r\n  /* \u95ED\u5408\u6001\u663E\u793A\u7684\u662F**\u6570\u636E\u5E93\u539F\u59CB\u6587\u672C**(\u5982 ["low","medium","high","max"]),\r\n     \u6BD4\u539F\u6765\u7684\u679A\u4E3E\u6807\u7B7E\u957F\u5F97\u591A,\u5BBD\u5EA6\u653E\u5BBD;\u8D85\u957F\u65F6\u7701\u7565\u53F7\u622A\u65AD,\u5168\u6587\u5728 title \u91CC\u3002 */\r\n  max-width: 320px;\r\n  text-overflow: ellipsis;\r\n}\r\n.asone-panel .chipSelect:disabled {\r\n  opacity: 0.5;\r\n}\r\n\r\n.asone-panel .depCheck {\r\n  margin-left: auto;\r\n  flex: none;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  font-size: 12px;\r\n  color: var(--text);\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n}\r\n\r\n.asone-panel .checkInput {\r\n  width: 15px;\r\n  height: 15px;\r\n  accent-color: var(--ok);\r\n}\r\n.asone-panel .checkInput:disabled {\r\n  opacity: 0.4;\r\n}\r\n\r\n/* \u6A21\u578B\u603B\u89C8 2026-10-25(m14379)\u5DF2\u628A\u6279\u91CF\u6309\u94AE\u632A\u5230\u9876\u90E8\u5DE5\u5177\u6761(m14922 \u8D77\u79FB\u9664\u6309\u94AE),\r\n   \u4E0D\u518D\u7528 .section .headActions \u7AD6\u6392\u5F62\u6001\u3002*/\r\n\r\n/* \u2500\u2500 \u6E20\u9053\u5408\u5E76\u9875(2026-11-07 \u5B9A\u6848:\u6298\u53E0\u5361 + \u5E38\u663E\u4F59\u989D\u5361\u5934)\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n.asone-panel .channels-page { display: flex; flex-direction: column; gap: 12px; }\r\n\r\n.asone-panel .channels-checkin {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 10px;\r\n  flex-wrap: wrap;\r\n  padding: 10px 14px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 12px;\r\n  background: var(--surface);\r\n}\r\n.asone-panel .channels-checkin-chips { display: flex; gap: 8px; flex-wrap: wrap; }\r\n/* \u53F3\u4E0A\u89D2\u4E24\u4E2A\u52A8\u4F5C:\u5168\u90E8\u5237\u65B0(\u53EA\u5237\u79EF\u5206)/ \u5168\u90E8\u7B7E\u5230(\u663E\u5F0F\u52A8\u4F5C)\u2014\u2014 \u5E38\u663E */\r\n.asone-panel .channels-checkin-actions { display: flex; gap: 8px; margin-left: auto; }\r\n.asone-panel .chx-chip {\r\n  font-size: 12px;\r\n  padding: 3px 9px;\r\n  border-radius: 999px;\r\n  border: 1px solid var(--border);\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .chx-chip.is-ok { color: var(--ok, #1a7f37); border-color: var(--ok, #1a7f37); }\r\n.asone-panel .chx-chip.is-warn { color: #b35900; border-color: #b35900; }\r\n.asone-panel .chx-note { margin: 0; font-size: 12px; color: var(--text-soft); word-break: break-all; }\r\n\r\n.asone-panel .chx-card {\r\n  border: 1px solid var(--border);\r\n  border-radius: 12px;\r\n  background: var(--surface);\r\n  overflow: hidden;\r\n}\r\n.asone-panel .chx-head {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  padding: 12px 16px;\r\n  flex-wrap: wrap;\r\n}\r\n.asone-panel .chx-toggle {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  background: none;\r\n  border: none;\r\n  cursor: pointer;\r\n  padding: 0;\r\n  color: var(--text);\r\n  font-size: 14px;\r\n  font-weight: 600;\r\n}\r\n.asone-panel .chx-caret {\r\n  width: 0;\r\n  height: 0;\r\n  border-left: 6px solid var(--text-soft);\r\n  border-top: 4px solid transparent;\r\n  border-bottom: 4px solid transparent;\r\n  transition: transform 0.12s ease;\r\n}\r\n.asone-panel .chx-caret.open { transform: rotate(90deg); }\r\n.asone-panel .chx-balance { display: inline-flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--text-soft); }\r\n.asone-panel .chx-acct b { color: var(--text); font-weight: 600; margin-right: 4px; }\r\n.asone-panel .chx-acct .chx-none { color: var(--text-soft); font-style: italic; }\r\n.asone-panel .chx-expiry { font-style: normal; margin-left: 6px; opacity: 0.8; }\r\n.asone-panel .chx-balance.none, .asone-panel .chx-hint { opacity: 0.7; }\r\n/* 2026-11-15 \u7528\u6237\u5B9A\u6848:\u6E20\u9053\u5361\u7684\u98CE\u63A7\u5FBD\u7AE0/\u8BF4\u660E\u5DF2\u79FB\u9664(\u6837\u5F0F\u4E00\u5E76\u5220\u6389,\u514D\u5F97\u7559\u4E0B\u6B7B\u89C4\u5219)\u3002 */\r\n.asone-panel .chx-body {\r\n  padding: 4px 16px 16px;\r\n  border-top: 1px solid var(--border);\r\n}\r\n/* \u5185\u5D4C\u9875\u81EA\u5E26 gap \u5E03\u5C40,\u6298\u53E0\u4F53\u91CC\u8865\u4E00\u70B9\u4E0A\u8FB9\u8DDD\u5373\u53EF */\r\n.asone-panel .chx-body .chan-page { padding-top: 12px; }\r\n\r\n/* \u2500\u2500 \u6E20\u9053\u9875\u4E09\u6BB5\u5F0F\u9AA8\u67B6(\u5168\u5C40 .chan-* \u6BB5) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n.asone-panel .chan-page { display: flex; flex-direction: column; gap: 16px; }\r\n\r\n.asone-panel .chan-card {\r\n  border: 1px solid var(--border);\r\n  border-radius: 12px;\r\n  padding: 16px;\r\n  background: var(--surface);\r\n}\r\n\r\n.asone-panel .chan-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; }\r\n.asone-panel .chan-head h3 { margin: 0; font-size: 14px; color: var(--text); }\r\n\r\n/* `.chan-tag` \u5DF2\u968F\u7528\u6237 2026-10-31 \u5B9A\u6848\u5220\u9664(\u300C\u7EDF\u4E00\u5220\u9664\u300E\u6A21\u578B\u76EE\u5F55\u300F\u65C1\u7684\u5FBD\u7AE0\r\n * \u5982\u300E\u4E0A\u6E38 API \xB7 3 \u4E2A\u300F\u300E\u5DF2\u52FE\u9009 4 / 11\u300F\u300D)\u2014\u2014 \u56DB\u4E2A\u6E20\u9053\u9875\u7684\u6A21\u578B\u76EE\u5F55\u6807\u9898\u884C\u53EA\u5269 h3\u3002 */\r\n\r\n.asone-panel .chan-hint { color: var(--text-soft); font-size: 12px; line-height: 1.6; margin: 6px 0 0; }\r\n.asone-panel .chan-empty { color: var(--text-soft); font-size: 13px; }\r\n\r\n.asone-panel .chan-banner { margin: 0 0 8px; padding: 7px 10px; border-radius: 6px; font-size: 12px; }\r\n.asone-panel .chan-banner.err { color: var(--bad); border: 1px solid color-mix(in srgb, var(--bad) 45%, transparent); background: var(--surface-bad); }\r\n.asone-panel .chan-banner.warn { color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent); background: var(--surface-warn); }\r\n.asone-panel .chan-banner.ok { color: var(--ok); border: 1px solid color-mix(in srgb, var(--ok) 45%, transparent); background: var(--surface-ok); }\r\n\r\n.asone-panel .chan-badge {\r\n  font-size: 11px;\r\n  padding: 2px 8px;\r\n  border-radius: 999px;\r\n  background: var(--surface-deep);\r\n  color: var(--text);\r\n}\r\n.asone-panel .chan-badge.ok { background: var(--surface-ok); color: var(--ok); }\r\n.asone-panel .chan-badge.bad { background: var(--surface-bad); color: var(--bad); }\r\n.asone-panel .chan-badge.off { background: var(--surface-warn); color: var(--warn); }\r\n\r\n.asone-panel .chan-sub { color: var(--text-soft); font-size: 12px; }\r\n\r\n/* \u6E20\u9053\u9875\u9876\u90E8\u52A8\u4F5C\u884C:ModelsPage \u5B50\u6807\u9898\u884C action \u672A\u63A5\u7EBF,\u58F3\u672A\u4F20,\u9875\u9762\u5185\u6E32\u67D3   \u4E0E\u5B50\u6807\u9898\u884C\u53F3\u7AEF\u52A8\u4F5C\u533A(act-note / act-btn)\u540C\u6B3E\u7684\u5237\u65B0\u6761 */\r\n.asone-panel .chan-action { display: flex; align-items: center; gap: 10px; justify-content: flex-end; margin-bottom: 2px; }\r\n\r\n/* \u8D26\u53F7\u5361\u5934(ProviderCard / SenseNovaPanel \u5171\u7528) */\r\n.asone-panel .acct-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }\r\n.asone-panel .acct-head h3 { margin: 0; font-size: 16px; color: var(--text); }\r\n.asone-panel .who { display: flex; align-items: center; gap: 8px; }\r\n.asone-panel .who h3 { margin: 0; font-size: 16px; color: var(--text); }\r\n.asone-panel .badges { display: flex; gap: 6px; flex-wrap: wrap; }\r\n.asone-panel .acct-side { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\r\n.asone-panel .acct-side b { font-size: 13px; color: var(--text); font-variant-numeric: tabular-nums; }\r\n.asone-panel .acct-cta { margin-top: 10px; }\r\n.asone-panel .warn-line { color: var(--warn); }\r\n\r\n/* \u8D26\u53F7\u72B6\u6001\u5706\u70B9(\u4EC5\u6E20\u9053\u9875\u4F5C\u7528\u57DF\u5185;\u4E0D\u52A8 ModelTable \u89C6\u89C9\u5217\u7684\u6587\u672C .dot) */\r\n.asone-panel .chan-page .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex: none; }\r\n.asone-panel .chan-page .dot.ok { background: var(--ok); }\r\n.asone-panel .chan-page .dot.bad { background: var(--bad); }\r\n.asone-panel .chan-page .dot.off { background: var(--dim); }\r\n\r\n/* \u2500\u2500 \u7EDF\u4E00\u8D26\u53F7\u72B6\u6001\u884C(Trae / WorkBuddy / Qoder / SenseNova \u56DB\u5904\u5171\u7528) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\r\n   \u7248\u5F0F\u7531\u7528\u6237 2026-10-30 \u5B9A\u6848:\u4E00\u4E2A\u8D26\u53F7\u4E00\u4E2A\u6846(\u591A\u8D26\u53F7\u5C31\u591A\u4E2A\u6846,\u4E0D\u5408\u5E76),\r\n   \u6846\u5185\u5DE6\u300C\u7528\u6237\u540D\u300D\u3001\u53F3\u300C\u5269\u4F59\u79EF\u5206/\u5230\u671F\u300D;   \u5237\u65B0\u6309\u94AE 2026-10-30 \u7B2C\u4E8C\u8F6E\u4E0A\u79FB\u5230**\u5B50\u6807\u9898\u884C\u53F3\u7AEF**(\u89C1 ModelsPage.tsx),\r\n   \u8D26\u53F7\u5E26\u91CC\u53EA\u5269\u8D26\u53F7\u6846,\u6240\u4EE5\u4E0D\u518D\u9700\u8981 `.acct-band` \u7684\u53F3\u4FA7\u680F\u3002   SenseNova \u4E00\u4E2A\u8D26\u53F7\u8981\u6446\u4E24\u4E09\u4E2A\u6C60\u5FBD\u7AE0\u653E\u4E0D\u4E0B\u5C31\u6362\u884C \u2014\u2014\u5B81\u53EF\u8BA9\u6846\u53D8\u9AD8,\r\n   \u4E5F\u4E0D\u80FD\u628A\u5FBD\u7AE0\u538B\u51FA\u6846\u5916(\u90A3\u6837\u6570\u5B57\u4F1A\u88AB\u88C1\u6389,\u7B49\u4E8E\u6CA1\u663E\u793A)\u3002*/\r\n.asone-panel .acct-cards {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n}\r\n.asone-panel .acct-card { padding: 14px 16px; }\r\n.asone-panel .acct-row {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px 12px;\r\n  flex-wrap: wrap;\r\n}\r\n.asone-panel .acct-row-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto; }\r\n.asone-panel .acct-name {\r\n  font-size: 15px;\r\n  /* \u7528\u6237\u540D\u52A0\u7C97(\u7528\u6237 2026-10-30 \u5B9A\u6848):\u4E00\u884C\u91CC\u6700\u8BE5\u5148\u88AB\u8BA4\u51FA\u6765\u7684\u662F\u300C\u8FD9\u662F\u8C01\u7684\u8D26\u53F7\u300D,\r\n     \u53F3\u4FA7\u90A3\u51E0\u4E2A\u5FBD\u7AE0\u6570\u5B57\u53CD\u800C\u662F\u7B2C\u4E8C\u773C\u4FE1\u606F\u3002*/\r\n  font-weight: 700;\r\n  color: var(--text);\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n.asone-panel .acct-row-right { display: flex; align-items: center; gap: 8px; flex: none; }\r\n.asone-panel .acct-row-right .chan-badge b { font-variant-numeric: tabular-nums; font-weight: 600; }\r\n/* 2026-11-08 SenseNova \u4E00\u884C\u6587\u672C\u89C4\u683C:\u5FBD\u7AE0\u4E4B\u95F4\u7684\u300C\u91CD\u7F6E 12:45\u300D\u662F\u7EAF\u6587\u672C,\r\n   \u4E0D\u5957\u5FBD\u7AE0\u5E95\u8272;nowrap \u4FDD\u8BC1\u300C\u91CD\u7F6E + \u65F6\u95F4\u300D\u4E0D\u4F1A\u88AB\u62C6\u6210\u4E24\u884C\u3002 */\r\n.asone-panel .acct-inline { white-space: nowrap; }\r\n\r\n/* \u6A21\u578B\u8868\u7684\u53EA\u8BFB\u5217(Qoder \u8FD9\u7C7B\u672A\u767B\u8BB0\u884C\u4E0D\u6446\u8F93\u5165\u6846) */\r\n.asone-panel .plain-cell { color: var(--text); font-size: 12px; font-variant-numeric: tabular-nums; }\r\n\r\n/* \u6E20\u9053\u9875\u4E3B\u6309\u94AE(ProviderCard \u540C\u6B3E;\u4E0D\u6539\u52A8\u65E2\u6709.btn) */\r\n.asone-panel .chan-page .btn.primary { background: var(--dsw-alias-button-info-hover, #24425f); }\r\n.asone-panel .chan-page .btn.primary:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover, #24425f); }\r\n\r\n/* \u901A\u7528\u7F51\u683C\u8868(\u51ED\u636E / \u989D\u5EA6 / \u8D26\u53F7\u7BA1\u7406 / \u8FDE\u901A\u6027\u5171\u7528) */\r\n.asone-panel .grid { width: 100%; border-collapse: collapse; margin: 8px 0; }\r\n.asone-panel .grid th, .asone-panel .grid td { border-bottom: 1px solid var(--border); padding: 7px 6px; font-size: 13px; text-align: left; }\r\n.asone-panel .grid th { background: var(--surface-deep); color: var(--text); font-weight: 600; }\r\n.asone-panel .grid th.num, .asone-panel .grid td.num { text-align: right; font-variant-numeric: tabular-nums; }\r\n.asone-panel .grid td.sub { color: var(--text-soft); }\r\n.asone-panel .th-note { margin-left: 6px; color: var(--text-soft); font-weight: 400; }\r\n\r\n/* SenseNova \u8D26\u53F7\u5361 + \u79EF\u5206\u6C60(\u901A\u7528\u6C60\u7D2B / \u4E13\u5C5E\u6C60\u6A59)\r\n   \u26A0\uFE0F 2026-10-23:\u4FDD\u6301\u5361\u5BBD 420px \u8D70\u7528\u6237\u8981\u6C42\u4E0D\u538B\u7A84\u5361\u7247\u5BFC\u81F4\u6837\u5F0F\u9519\u4E71\u3002   **\u5F39\u6027\u5E03\u5C40**:`repeat(auto-fill, minmax(420px, 1fr))` \u672C\u8EAB\u5C31\u4F1A\u5728\u9875\u9762\u5BBD\u5EA6   \u8DB3\u591F\u65F6\u653E 3 \u5F20\u5355\u884C\u3001\u5BBD\u5EA6\u4E0D\u8DB3\u65F6\u81EA\u52A8\u6362\u884C \u2014\u2014\u52A0\u5BBD .content \u53EA\u662F\u8BA9\u300C\u8DB3\u591F\u300D   \u7684\u95E8\u69DB\u5728\u9ED8\u8BA4\u7A97\u53E3\u4E0B\u5C31\u8FBE\u5230(3\xD7420 + 2\xD716 = 1292px \u2248 \u5185\u5BB9\u533A)\u3002*/\r\n.asone-panel .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }\r\n\r\n.asone-panel .pools {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\r\n  gap: 12px;\r\n  margin: 12px 0 0;\r\n}\r\n.asone-panel .pool {\r\n  position: relative;\r\n  overflow: hidden;\r\n  display: flex;\r\n  flex-direction: column;\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 12px 12px 10px;\r\n  background: var(--surface-deep);\r\n}\r\n.asone-panel .pool-accent { position: absolute; inset: 0 0 auto 0; height: 2px; }\r\n.asone-panel .pool.general .pool-accent { background: var(--pool-grad-general); }\r\n.asone-panel .pool.special .pool-accent { background: var(--pool-grad-special); }\r\n.asone-panel .pool-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }\r\n.asone-panel .pool-head strong { color: var(--text); font-size: 12px; }\r\n.asone-panel .pdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }\r\n.asone-panel .pool.general .pdot { background: var(--pool-general-soft); box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1, #141b26); }\r\n.asone-panel .pool.special .pdot { background: var(--pool-special-soft); box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1, #141b26); }\r\n.asone-panel .row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 11px; color: var(--dim); margin: 8px 0 4px; }\r\n.asone-panel .row-label { flex: none; }\r\n.asone-panel .row-val { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }\r\n.asone-panel .row-val b { font-size: 15px; color: var(--text); font-variant-numeric: tabular-nums; font-weight: 600; }\r\n.asone-panel .row-val .pct { color: var(--dim); font-size: 11px; font-variant-numeric: tabular-nums; }\r\n.asone-panel .row.split { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }\r\n.asone-panel .bar { height: 5px; background: var(--surface-deep); border-radius: 999px; overflow: hidden; }\r\n.asone-panel .bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }\r\n.asone-panel .pool.general .bar-fill { background: var(--pool-grad-general); }\r\n.asone-panel .pool.special .bar-fill { background: var(--pool-grad-special); }\r\n.asone-panel .pool.cooling .bar-fill { background: var(--dim); }\r\n.asone-panel .grant, .asone-panel .reset-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 7px;\r\n  min-height: 30px;\r\n  box-sizing: border-box;\r\n  margin-top: auto;\r\n  padding: 0 2px;\r\n  border-radius: 8px;\r\n  font-size: 11px;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .grant b { color: var(--text); font-size: 13px; font-variant-numeric: tabular-nums; }\r\n.asone-panel .g-label { flex: 1 1 auto; }\r\n.asone-panel .reset-row { justify-content: space-between; padding: 0 2px; }\r\n.asone-panel .r-label { flex: none; }\r\n.asone-panel .r-val { color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }\r\n\r\n/* \u9875\u811A\u8BF4\u660E */\r\n.asone-panel .foot { margin-top: 0; }\r\n\r\n/* ===========================================================================\r\n   \u903B\u8F91\u6A21\u578B\u5B50\u9875(LogicalModelsPage)\u7684scoped\r\n   \u6837\u5F0F \u2014\u2014\u4E0A\u65B9 .rows/.rowCard/.rowBtn/.addButton/.editor \u7B49\u901A\u7528\u5757\u7531\u4F9B\u5E94\u5546\u9875\u7B49   \u5171\u7528,\u4E0D\u80FD\u6539\u8FD9\u91CC\u5BF9 .lm-section \u4F5C\u7528\u57DF\u5185\u7684\u5DEE\u5F02\u505A\u540C\u503C\u8986\u76D6\u3002   =========================================================================== */\r\n\r\n/* ul.rows:gap 8px(\u901A\u7528\u5757\u662F\u4F9B\u5E94\u5546\u9875\u7684 10px) */\r\n.asone-panel .lm-section .rows {\r\n  gap: 8px;\r\n}\r\n\r\n/* li.rowCard:\u8FB9\u6846 var(--border) / \u5E95\u8272 var(--surface) / gap 12px */\r\n.asone-panel .lm-section .rowCard {\r\n  border-color: var(--border);\r\n  background: var(--surface);\r\n  gap: 12px;\r\n}\r\n\r\n/* rowHead \u95F4\u8DDD 10px */\r\n.asone-panel .lm-section .rowHead {\r\n  gap: 10px;\r\n}\r\n\r\n/* rowName \u884C\u9AD8 22px */\r\n.asone-panel .lm-section .rowName {\r\n  line-height: 22px;\r\n}\r\n\r\n/* rowActions \u95F4\u8DDD 4px */\r\n.asone-panel .lm-section .rowActions {\r\n  gap: 4px;\r\n}\r\n\r\n/* rowBtn:\u5706\u89D2 4px / \u5185\u8DDD 0 10px / \u8FB9\u6846 var(--border) / \u5B57\u8272 var(--text-soft);hover \u5E95\u8272 var(--dsw-alias-interactive-bg-hover, #1f2732) */\r\n.asone-panel .lm-section .rowBtn {\r\n  border-radius: 4px;\r\n  padding: 0 10px;\r\n  border-color: var(--border);\r\n  color: var(--text);\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .rowBtn:hover:not(:disabled) {\r\n  background: var(--surface-hover);\r\n}\r\n\r\n/* addButton:\u865A\u7EBF\u8FB9 var(--border) / \u5E95\u8272 var(--surface) / margin-top 8px(\u4E0E .rows \u884C\u8DDD\u4E00\u81F4) */\r\n.asone-panel .lm-section .addButton {\r\n  border-color: var(--border);\r\n  background: var(--surface);\r\n  margin-top: 8px;\r\n  line-height: 22px;\r\n}\r\n\r\n/* \u2500\u2500 \u7F16\u8F91\u5668(LogicalModelEditor.vue scoped \u540C\u503C) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */\r\n\r\n/* \u7F16\u8F91\u5668\u5168\u90E8.input \u5E95\u8272 var(--bg-deep) / \u8FB9\u6846 var(--border) / \u5B57\u8272 var(--text-soft) /\r\n   \u5B57\u53F7 14px / \u884C\u9AD8 22px / \u805A\u7126\u8FB9\u6846 var(--accent)(\u901A\u7528 .input \u662F\u9875\u9762\u5168\u5C40 13px \u53D8\u91CF\u7248 */\r\n.asone-panel .lm-section .editor .input {\r\n  width: 100%;\r\n  height: 32px;\r\n  padding: 0 10px;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  background: var(--bg-deep);\r\n  color: var(--text);\r\n  font: inherit;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n}\r\n.asone-panel .lm-section .editor .input::placeholder {\r\n  color: var(--dim);\r\n}\r\n.asone-panel .lm-section .editor .input:focus {\r\n  border-color: var(--accent);\r\n  outline: none;\r\n}\r\n.asone-panel .lm-section .editor .input.inputBad {\r\n  border-color: var(--bad);\r\n}\r\n.asone-panel .lm-section .editor .input.inputBad:focus {\r\n  border-color: var(--bad);\r\n}\r\n.asone-panel .lm-section .editor .input:disabled {\r\n  opacity: 0.6;\r\n  cursor: default;\r\n}\r\n.asone-panel .lm-section .editor .selectInput {\r\n  cursor: pointer;\r\n}\r\n\r\n/* fieldLabel / fieldNote / fieldWarn / fieldValue:\u8272\u4E0E\u884C\u9AD8 */\r\n.asone-panel .lm-section .editor .fieldLabel {\r\n  color: var(--text);\r\n  font-weight: 500;\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .editor .fieldValue {\r\n  color: var(--text);\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n}\r\n.asone-panel .lm-section .editor .fieldNote {\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .editor .fieldWarn {\r\n  color: var(--text-soft);\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .editor .fieldWarn b {\r\n  color: var(--text);\r\n  font-weight: 500;\r\n}\r\n\r\n/* chainHead:\u6863\u94FE\u5C0F\u8282\u5934 + \u53F3\u4FA7\u62D6\u62FD\u7528\u6CD5\u63D0\u793A(\u540C\u4E00\u884C,\u522B\u628A\u63D0\u793A\u9876\u6210\u7B2C\u4E8C\u884C) */\r\n.asone-panel .chainHead {\r\n  display: flex;\r\n  flex-direction: row;\r\n  align-items: baseline;\r\n  gap: 10px;\r\n}\r\n\r\n.asone-panel .chainHint {\r\n  color: var(--dim);\r\n  font-size: 11px;\r\n  line-height: 18px;\r\n}\r\n\r\n.asone-panel .chainHint.chainHintDanger {\r\n  color: var(--bad);\r\n}\r\n\r\n/* nodeRow \u5185:.input \u7684 width:100% \u4F1A\u8BA9\u884C\u6EA2\u51FA\u5361\u7247,\u5FC5\u987B\u8D62\u8FC7\u5B83(\u540C\u503C) */\r\n.asone-panel .lm-section .editor .nodeRow .nodeProvider {\r\n  width: 150px;\r\n  flex: 0 0 150px;\r\n}\r\n.asone-panel .lm-section .editor .nodeRow .nodeSelect {\r\n  width: auto;\r\n  flex: 1 1 0;\r\n  min-width: 0;\r\n}\r\n\r\n/* addModelButton:\u65B9\u89D2 4px / \u8FB9\u6846 var(--border) / \u5E95\u900F\u660E / hover \u5E95\u8272 var(--dsw-alias-interactive-bg-hover, #1f2732) */\r\n.asone-panel .lm-section .editor .addModelButton {\r\n  border: 1px solid var(--border);\r\n  border-radius: 4px;\r\n  height: 28px;\r\n  padding: 0 10px;\r\n  color: var(--text);\r\n  font: inherit;\r\n  cursor: pointer;\r\n  background: none;\r\n  align-self: flex-start;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n}\r\n.asone-panel .lm-section .editor .addModelButton:hover:not(:disabled) {\r\n  background: var(--surface-hover);\r\n  border-color: var(--border);\r\n}\r\n.asone-panel .lm-section .editor .addModelButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n/* primaryButton / secondaryButton:36px / \u5706\u89D2 6px / \u5185\u8DDD 0 14px /\r\n   \u5B5714px \u884C\u9AD8 22px;\u4E3B\u6309\u94AE\u5E95\u8272 var(--dsw-alias-button-info-fill, #2f4d6b) hover var(--dsw-alias-button-info-hover, var(--dsw-alias-button-info-hover, #24425f)),\u526F\u6309\u94AE\u900F\u660E\u5EA6 + \u8FB9\u6846 var(--border) */\r\n.asone-panel .lm-section .editor .primaryButton,\r\n.asone-panel .lm-section .editor .secondaryButton {\r\n  box-sizing: border-box;\r\n  height: 36px;\r\n  padding: 0 14px;\r\n  border-radius: 6px;\r\n  font: inherit;\r\n  cursor: pointer;\r\n  display: inline-flex;\r\n  justify-content: center;\r\n  align-items: center;\r\n  gap: 4px;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n}\r\n.asone-panel .lm-section .editor .primaryButton {\r\n  background: var(--dsw-alias-button-info-fill, #2f4d6b);\r\n  border: none;\r\n  color: var(--text);\r\n}\r\n.asone-panel .lm-section .editor .primaryButton:hover:not(:disabled) {\r\n  background: var(--dsw-alias-button-info-hover, #24425f);\r\n}\r\n.asone-panel .lm-section .editor .secondaryButton {\r\n  border: 1px solid var(--border);\r\n  color: var(--text);\r\n  background: none;\r\n}\r\n.asone-panel .lm-section .editor .secondaryButton:hover:not(:disabled) {\r\n  background: var(--surface-hover);\r\n  border-color: var(--border);\r\n}\r\n.asone-panel .lm-section .editor .primaryButton:disabled,\r\n.asone-panel .lm-section .editor .secondaryButton:disabled {\r\n  opacity: 0.4;\r\n  cursor: default;\r\n}\r\n\r\n/* ===========================================================================\r\n   \u5176\u4ED6\u4F9B\u5E94\u5546\u9875(ProvidersPage):\u9010\u6761\u7167\u642C\u65E2\u6709\u7684   \\3c style scoped>(L1005-1261)\u3002\u7C7B\u540D\u5168\u90E8\u52A0 .pv- \u524D\u7F00\u4EE5\u514D\u4E0E As One \u73B0\u6709\u6837\u5F0F\u51B2\u7A81,\r\n   \u989C\u8272 / \u5C3A\u5BF8 / \u95F4\u8DDD / \u5706\u89D2 / \u8FB9\u6846 / \u5B57\u91CD\u9010\u5B57\u4FDD\u7559(\u6697\u8272\u57FA\u8C03\u4E0E\u73B0\u6709\u9875\u9762\u4E00\u81F4)\u3002   =========================================================================== */\r\n\r\n/* \u5E03\u5C40\u5BF9\u7167 dsh \u7684\u4F9B\u5E94\u5546\u5361\u7247:\u5916\u5C42\u4E00\u884C\u5934 + \u5185\u5D4C\u7070\u9762\u677F(\u5B57\u6BB5 / \u6A21\u578B\u76EE\u5F55) */\r\n.asone-panel .pv-section {\r\n  max-width: 720px;\r\n  color: var(--text-soft);\r\n  flex-direction: column;\r\n  gap: 12px;\r\n  display: flex;\r\n}\r\n.asone-panel .pv-title { color: var(--text); margin: 0; font-size: 16px; font-weight: 500; line-height: 24px; }\r\n.asone-panel .pv-intro { color: var(--text-soft); margin: 0; font-size: 14px; line-height: 22px; }\r\n.asone-panel .pv-err { color: var(--bad); font-size: 12px; line-height: 18px; }\r\n.asone-panel .pv-savedNotice { color: var(--ok); font-size: 12px; line-height: 18px; margin: 0; }\r\n/* As One \u65B0\u589E:API \u5BC6\u94A5\u8F93\u5165\u6846\u4E0B\u9762\u90A3\u884C\u300C\u5BC6\u94A5\u7531\u51ED\u636E\u5C42\u7BA1\u7406\u300D\u8BF4\u660E(\u5951\u7EA6\u65E0\u5199\u5BC6\u94A5\u63A5\u53E3)\u3002*/\r\n.asone-panel .pv-hint { color: var(--text-soft); margin: 0; font-size: 12px; line-height: 18px; }\r\n\r\n/* \u5361\u7247 */\r\n.asone-panel .pv-rows { flex-direction: column; gap: 10px; margin: 12px 0 0; padding: 0; list-style: none; display: flex; }\r\n.asone-panel .pv-rowCard {\r\n  border: 1px solid var(--border);\r\n  background: var(--surface);\r\n  border-radius: 10px;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n  padding: 12px 14px;\r\n  display: flex;\r\n}\r\n.asone-panel .pv-rowHead { align-items: center; gap: 8px; display: flex; }\r\n.asone-panel .pv-rowName { color: var(--text); font-size: 14px; font-weight: 500; line-height: 22px; }\r\n.asone-panel .pv-credentialDot { flex: none; width: 8px; height: 8px; border-radius: 50%; display: inline-block; }\r\n.asone-panel .pv-dotOk { background: var(--ok); }\r\n.asone-panel .pv-dotMissing { background: var(--bad); }\r\n.asone-panel .pv-rowActions { align-items: center; gap: 8px; margin-left: auto; display: inline-flex; }\r\n.asone-panel .pv-cardFooter { justify-content: flex-end; gap: 8px; }\r\n.asone-panel .pv-rowBtn {\r\n  border-radius: 6px;\r\n  height: 28px;\r\n  padding: 0 12px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  cursor: pointer;\r\n  border: 1px solid var(--border);\r\n  background: transparent;\r\n  color: var(--text);\r\n}\r\n.asone-panel .pv-rowBtn:hover:not(:disabled) { background: var(--surface-hover); }\r\n.asone-panel .pv-rowBtn.pv-rowBtnDanger { color: var(--bad); }\r\n.asone-panel .pv-rowBtn:disabled { opacity: 0.4; cursor: default; }\r\n\r\n/* \u5185\u5C42\u9762\u677F */\r\n.asone-panel .pv-panel {\r\n  background: var(--surface-deep);\r\n  border: 1px solid var(--border);\r\n  border-radius: 8px;\r\n  padding: 12px;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n  display: flex;\r\n}\r\n.asone-panel .pv-panelTitle { color: var(--text); font-size: 13px; font-weight: 500; line-height: 20px; margin-bottom: 2px; }\r\n.asone-panel .pv-fieldLabel { color: var(--text); font-size: 12px; font-weight: 500; line-height: 18px; margin-top: 4px; }\r\n\r\n/* \u6A21\u578B\u76EE\u5F55 */\r\n.asone-panel .pv-catalogSection { flex-direction: column; gap: 6px; display: flex; }\r\n.asone-panel .pv-catalogTitle { color: var(--text); font-size: 12px; font-weight: 500; line-height: 18px; }\r\n.asone-panel .pv-modelListHead { justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 2px; display: flex; }\r\n.asone-panel .pv-modelCatalogMeta, .asone-panel .pv-modelEmpty { color: var(--text-soft); margin: 0; font-size: 12px; line-height: 18px; }\r\n.asone-panel .pv-headActions { align-items: center; gap: 2px; display: inline-flex; }\r\n.asone-panel .pv-modelList { flex-direction: column; gap: 8px; display: flex; }\r\n.asone-panel .pv-modelEntry {\r\n  border: 1px solid var(--border);\r\n  background: var(--surface);\r\n  border-radius: 8px;\r\n  padding: 8px;\r\n  gap: 6px;\r\n  display: flex;\r\n  flex-direction: column;\r\n}\r\n.asone-panel .pv-modelRow {\r\n  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto auto;\r\n  align-items: center;\r\n  gap: 6px;\r\n  display: grid;\r\n}\r\n.asone-panel .pv-modelAdvanced { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 2px 2px 0; display: grid; }\r\n.asone-panel .pv-modelField { flex-direction: column; gap: 4px; min-width: 0; display: flex; }\r\n.asone-panel .pv-modelInputTypes { border: none; grid-column: 1 / -1; min-width: 0; margin: 0; padding: 0; }\r\n.asone-panel .pv-modelInputTypes legend { margin-bottom: 4px; padding: 0; }\r\n.asone-panel .pv-modelInputChoices { flex-wrap: wrap; align-items: center; gap: 16px; min-height: 32px; display: flex; }\r\n.asone-panel .pv-modelFieldLabel { color: var(--text); font-size: 12px; line-height: 18px; }\r\n.asone-panel .pv-modelEmpty { border: 1px dashed var(--border); border-radius: 8px; text-align: center; padding: 12px; }\r\n\r\n/* \u8F93\u5165 */\r\n.asone-panel .pv-input {\r\n  box-sizing: border-box;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  width: 100%;\r\n  height: 32px;\r\n  font: inherit;\r\n  background: var(--bg-deep);\r\n  color: var(--text);\r\n  padding: 0 10px;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n}\r\n.asone-panel .pv-input::placeholder { color: var(--dim); }\r\n.asone-panel .pv-input:focus { border-color: var(--accent); outline: none; }\r\n.asone-panel .pv-input:disabled { opacity: 0.6; cursor: default; }\r\n.asone-panel .pv-selectInput { cursor: pointer; max-width: 280px; }\r\n\r\n/* \u6309\u94AE */\r\n.asone-panel .pv-primaryButton, .asone-panel .pv-secondaryButton {\r\n  box-sizing: border-box;\r\n  border-radius: 6px;\r\n  height: 36px;\r\n  font: inherit;\r\n  cursor: pointer;\r\n  border: none;\r\n  justify-content: center;\r\n  align-items: center;\r\n  gap: 4px;\r\n  padding: 0 14px;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  display: inline-flex;\r\n}\r\n.asone-panel .pv-primaryButton { background: var(--dsw-alias-button-info-fill, #2f4d6b); color: var(--on-accent); }\r\n.asone-panel .pv-primaryButton:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover, #24425f); }\r\n.asone-panel .pv-secondaryButton { border: 1px solid var(--border); color: var(--text); background: none; }\r\n.asone-panel .pv-secondaryButton:hover:not(:disabled) { background: var(--surface-hover); }\r\n.asone-panel .pv-primaryButton:disabled, .asone-panel .pv-secondaryButton:disabled { opacity: 0.4; cursor: default; }\r\n\r\n/* \u300C\u6DFB\u52A0\u300D\u6309\u94AE = \u4E00\u6574\u5757\u865A\u7EBF\u5361\u7247(\u4E0E LogicalModels.vue \u540C\u4E00\u5957\u6837\u5F0F,\u5BF9\u7167 dsh \u7684\u6DFB\u52A0\u5361):\r\n   \u9AD8\u5EA6 54px / \u5706\u89D2 10px / \u5E95\u8272\u4E0E.pv-rowCard \u4E00\u81F4\u2192\u4E0E\u4E0A\u9762\u7684\u5361\u7247\u4E00\u6837\u5927\u3002*/\r\n.asone-panel .pv-addButton {\r\n  box-sizing: border-box;\r\n  flex: none;\r\n  width: 100%;\r\n  border: 1px dashed var(--border);\r\n  border-radius: 10px;\r\n  background: var(--surface);\r\n  height: 54px;\r\n  margin-top: 10px; /* \u4E0E .pv-rows \u7684\u884C\u8DDD\u4E00\u81F4*/\r\n  color: var(--text);\r\n  font: inherit;\r\n  cursor: pointer;\r\n  justify-content: center;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 0 14px;\r\n  font-size: 14px;\r\n  line-height: 22px;\r\n  display: flex;\r\n}\r\n.asone-panel .pv-addButton:hover:not(:disabled) { background: var(--surface-hover); border-color: var(--border); }\r\n.asone-panel .pv-addButton:disabled { opacity: 0.4; cursor: default; }\r\n.asone-panel .pv-linkButton {\r\n  border-radius: 4px;\r\n  height: 28px;\r\n  color: var(--text);\r\n  cursor: pointer;\r\n  background: none;\r\n  border: none;\r\n  align-items: center;\r\n  padding: 0 8px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  display: inline-flex;\r\n}\r\n.asone-panel .pv-linkButton:hover:not(:disabled) { background: var(--surface-hover); color: var(--text); }\r\n.asone-panel .pv-linkButton:disabled { opacity: 0.4; cursor: default; }\r\n.asone-panel .pv-addModelButton {\r\n  box-sizing: border-box;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  color: var(--text);\r\n  font: inherit;\r\n  cursor: pointer;\r\n  background: none;\r\n  align-self: flex-start;\r\n  align-items: center;\r\n  gap: 4px;\r\n  padding: 0 10px;\r\n  font-size: 12px;\r\n  line-height: 18px;\r\n  display: inline-flex;\r\n}\r\n.asone-panel .pv-addModelButton:hover:not(:disabled) { background: var(--surface-hover); }\r\n.asone-panel .pv-addModelButton:disabled { opacity: 0.4; cursor: default; }\r\n\r\n.asone-panel .pv-iconButton {\r\n  background: none;\r\n  border: none;\r\n  color: var(--dim);\r\n  cursor: pointer;\r\n  padding: 2px 6px;\r\n  font-size: 12px;\r\n  flex-shrink: 0;\r\n  border-radius: 4px;\r\n}\r\n.asone-panel .pv-iconButton:hover:not(:disabled) { background: var(--surface-hover); color: var(--text); }\r\n.asone-panel .pv-iconButton.pv-iconButtonDanger:hover:not(:disabled) { color: var(--bad); }\r\n.asone-panel .pv-choice { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }\r\n/* \u539F\u4E3A\u5168\u5C40 `input[type="checkbox"]`;\u8FD9\u91CC\u6309 .pv- \u4F5C\u7528\u57DF\u6536\u7A84\u5230\u672C\u9875\u4E24\u4E2A\u52FE\u9009\u4F4D\r\n   (\u8F93\u5165\u7C7B\u578B / \u9009\u62E9\u5668\u5019\u9009\u9879),\u907F\u514D\u5F71\u54CD\u5176\u4ED6\u9875\u9762\u3002*/\r\n.asone-panel .pv-choice input[type="checkbox"],\r\n.asone-panel .pv-candidateLabel input[type="checkbox"] { accent-color: var(--accent); }\r\n\r\n/* \u9009\u62E9\u5668\u5F39\u7A97*/\r\n.asone-panel .pv-mask {\r\n  position: fixed;\r\n  inset: 0;\r\n  background: var(--scrim);\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  z-index: 50;\r\n}\r\n.asone-panel .pv-dialog {\r\n  width: 520px;\r\n  max-width: calc(100vw - 32px);\r\n  max-height: calc(100vh - 64px);\r\n  overflow: auto;\r\n  background: var(--surface);\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 16px 18px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 10px;\r\n}\r\n.asone-panel .pv-dialogTitle { margin: 0; font-size: 15px; font-weight: 500; color: var(--text-soft); }\r\n.asone-panel .pv-dialogDesc { margin: 0; font-size: 13px; color: var(--text-soft); }\r\n.asone-panel .pv-candidateToolbar { align-items: center; gap: 8px; margin-bottom: 6px; display: flex; }\r\n.asone-panel .pv-candidateSearch { flex: 240px; min-width: 0; }\r\n.asone-panel .pv-candidateList {\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  max-height: 320px;\r\n  margin: 0;\r\n  padding: 0;\r\n  list-style: none;\r\n  display: flex;\r\n  overflow-y: auto;\r\n}\r\n.asone-panel .pv-candidate { border-radius: 6px; }\r\n.asone-panel .pv-candidate:hover { background: var(--surface-hover); }\r\n.asone-panel .pv-candidateLabel { cursor: pointer; align-items: center; gap: 8px; padding: 6px 8px; display: flex; }\r\n.asone-panel .pv-candidateId {\r\n  min-width: 0;\r\n  font-family: ui-monospace, Consolas, monospace;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  flex: auto;\r\n  font-size: 13px;\r\n  overflow: hidden;\r\n}\r\n.asone-panel .pv-candidateEmpty { color: var(--text-soft); text-align: center; margin: 24px 0; font-size: 13px; line-height: 20px; }\r\n.asone-panel .pv-dialogFooter { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }\r\n\r\n/* ===========================================================================\r\n    \u8BBE\u7F6E\u9875\u8FFD\u52A0\u6837\u5F0F(\u914D\u5957\u8865\u5145;\u53EA\u8FFD\u52A0,\u4E0D\u52A8\u65E2\u6709\u89C4\u5219)\r\n    =========================================================================== */\r\n\r\n/* \u9875\u5934 h1(.ui-page-title) */\r\n.asone-panel .ui-page-title {\r\n  margin: 0 0 4px;\r\n  font-size: 18px;\r\n  font-weight: 600;\r\n  color: var(--text);\r\n}\r\n\r\n/* \u63A7\u4EF6(.ui-input / .ui-select) */\r\n.asone-panel .ui-input,\r\n.asone-panel .ui-select {\r\n  width: 100%;\r\n  box-sizing: border-box;\r\n  height: 32px;\r\n  padding: 0 10px;\r\n  font: inherit;\r\n  font-size: 13px;\r\n  color: var(--text);\r\n  background: var(--bg);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n}\r\n.asone-panel .ui-input:focus,\r\n.asone-panel .ui-select:focus {\r\n  outline: none;\r\n  border-color: var(--accent);\r\n}\r\n.asone-panel .ui-input[type="number"] {\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.asone-panel .ui-select {\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-check input[type="checkbox"] {\r\n  accent-color: var(--accent);\r\n  width: auto;\r\n}\r\n\r\n/* \u72EC\u7ACB\u6309\u94AE(\u88F8\u7C7B .ui-btn-ghost / .ui-btn-danger / .ui-btn-primary) */\r\n.asone-panel .ui-btn-ghost {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: var(--text);\r\n  background: none;\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  padding: 0 12px;\r\n  font-size: 12.5px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-btn-ghost:hover:not(:disabled) {\r\n  border-color: var(--accent);\r\n  color: var(--text);\r\n}\r\n.asone-panel .ui-btn-ghost:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n.asone-panel .ui-btn-danger {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: var(--bad);\r\n  background: none;\r\n  border: 1px solid transparent;\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  padding: 0 10px;\r\n  font-size: 12px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-btn-danger:hover:not(:disabled) {\r\n  background: var(--surface-bad);\r\n}\r\n.asone-panel .ui-btn-danger:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n.asone-panel .ui-btn-primary {\r\n  appearance: none;\r\n  font: inherit;\r\n  color: var(--on-accent);\r\n  background: var(--accent);\r\n  border: 1px solid var(--accent);\r\n  border-radius: 6px;\r\n  height: 30px;\r\n  padding: 0 12px;\r\n  font-size: 12.5px;\r\n  cursor: pointer;\r\n}\r\n.asone-panel .ui-btn-primary:hover:not(:disabled) {\r\n  filter: brightness(1.12);\r\n}\r\n.asone-panel .ui-btn-primary:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n}\r\n\r\n/* \u9000\u907F\u66F2\u7EBF(.ui-chart-wrap / .ui-chart) */\r\n.asone-panel .ui-chart-wrap {\r\n  margin-top: 10px;\r\n  max-width: 760px;\r\n}\r\n.asone-panel .ui-chart {\r\n  display: block;\r\n  width: 100%;\r\n}\r\n\r\n/* \u5361\u7247\u5934:h2 \u4E0E .ui-card-sub \u76F8\u90BB\u6392\u5E03(\u8FD8\u539F flex \u8D77\u70B9\u5E03\u5C40) */\r\n.asone-panel .ui-card-head {\r\n  justify-content: flex-start;\r\n}\r\n\r\n/* <960px:\u8BBE\u7F6E\u9875\u65E0 nav(2026-10-25 m14922 \u79FB\u9664\u4FA7\u680F),\u5361\u7247\u5934\u7684\u5C0F\u5C4F\u89C4\u5219\u4FDD\u7559 */\r\n@media (max-width: 959px) {\r\n  .asone-panel .ui-layout {\r\n    flex-direction: column;\r\n    gap: 12px;\r\n  }\r\n  .asone-panel .ui-card {\r\n    scroll-margin-top: 90px;\r\n  }\r\n}\r\n\r\n/* ===========================================================================\r\n   SenseNova \u4E13\u9875(SenseNovaPage)\u7684scoped CSS\u3002   \u26A0\uFE0F \u5168\u90E8\u52A0 `.sn-` \u524D\u7F00:.row / .bar / .bar-fill / .pill / .grid \u8FD9\u4E9B\u540D\u5B57\u5728   styles.css \u91CC*\u5DF2\u6709\u5168\u5C40\u5B9A\u4E49**(\u72B6\u6001\u6761\u3001ModelTable\u3001\u6E20\u9053\u9875\u5171\u7528),\u88F8\u7528\u4F1A\u4E92\u76F8\u6C61\u67D3\r\n   \u524D\u7F00\u7248\u9010\u5B57\u642C\u8FD0\u989C\u8272\u95F4\u8DDD/\u5706\u89D2,\u9875\u9762\u4E0A\u53EA\u8BA4\u524D\u7F00\u7248\u3002   =========================================================================== */\r\n\r\n/* \u8D26\u53F7\u5361\u5934(\u4E0E\u6E20\u9053\u9875 ProviderCard \u5171\u7528\u7684\u5168\u5C40 .acct-head / .who / .badges \u540C\u503C,\u4E0D\u91CD\u590D\u5B9A\u4E49) */\r\n\r\n/* \u79EF\u5206\u6C60\u5757:\u4E24\u4E2A\u6C60*\u5E76\u6392**\u3002\u5217\u5BBD\u523B\u610F\u538B\u7A84170px \u8D70\u2014\u2014\u4E4B\u524D\u7528210px,420px \u7684\u8D26\u53F7\u5361\u91CC   \u653E\u4E0D\u4E0B\u4E24\u4E2A\u81EA\u52A8\u9000\u5316\u6210\u4E0A\u4E0B\u5806\u53E0,\u800C\u300C\u901A\u7528 vs \u4E13\u5C5E\u300D\u6700\u8BE5\u505A\u7684\u662F\u6A2A\u5411\u6446\u5728\u4E00\u8D77\u5BF9\u6BD4\u3002   \u26A0\uFE0F `gap: 12px` \u662F\u6309\u53C2\u8003\u56FE\u91CF\u51FA\u6765\u7684:\u5B9E\u6D4B\u4E24\u6C60\u5916\u6CBF\u76F8\u8DDD 12px,\u539F\u503C10px \u4F1A\u8BA9\u7D2B\u6A59\u4E24\u5757\r\n   \u5E95\u8272\u51E0\u4E4E\u8D34\u4E0A\u3002*/\r\n.asone-panel .sn-pools {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\r\n  gap: 12px;\r\n  margin: 12px 0 0;\r\n}\r\n/* flex \u5217 + \u7B49\u9AD8(\u7F51\u683C stretch):\u8BA9\u300C\u6D3B\u52A8\u56FA\u5B9A\u79EF\u5206\u300D\u80FD\u8D34\u4F4F\u5361\u7247\u5E95\u90E8,\r\n   \u4E24\u4E2A\u6C60\u56E0\u6B64\u5728\u540C\u4E00\u6C34\u5E73\u7EBF\u4E0A\u6536\u5C3E\u3002*/\r\n.asone-panel .sn-pool {\r\n  position: relative;\r\n  overflow: hidden; /* \u8BA9\u9876\u90E8\u8272\u6761\u8D34\u5408\u5706\u89D2*/\r\n  display: flex;\r\n  flex-direction: column;\r\n  border: 1px solid var(--border);\r\n  border-radius: 10px;\r\n  padding: 12px 12px 10px;\r\n  background: var(--surface-deep);\r\n}\r\n/* \u9876\u90E8\u8272\u6761:\u6BCF\u5F20\u6C60\u5361\u9876\u7AEF\u90A3\u9053\u5F69\u8272\u7EBF\u3002\u901A\u7528\u6C60\u53D6**\u7D2B**(violet-500/400),\u4E13\u5C5E\u6C60\u53D6\u6A59   (orange-500/400)\u3002\u26A0\uFE00\u8FD9\u4E24\u7EC4\u503C\u662F\u4E3A\u6DF1\u8272\u5E95\u9009\u7684:\u53C2\u8003\u56FE\u662F\u6D45\u5E95\u540C\u4E00\u7EC4\u8272\u76F4\u63A5\u642C\u5230\r\n   `var(--surface-deep)` \u4E0A\u4F1A\u7CCA\u6210\u4E00\u7248\u2014\u2014\u4EAE\u6863\u964D\u4E00\u6863\u3001\u9971\u548C\u5EA6\u7565\u964D\u624D\u7ACB\u5F97\u4F4F\u3002*/\r\n.asone-panel .sn-pool-accent { position: absolute; inset: 0 0 auto 0; height: 2px; }\r\n.asone-panel .sn-pool.general .sn-pool-accent { background: var(--pool-grad-general); }\r\n.asone-panel .sn-pool.special .sn-pool-accent { background: var(--pool-grad-special); }\r\n\r\n.asone-panel .sn-pool-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }\r\n.asone-panel .sn-pool-head strong { color: var(--text); font-size: 12px; }\r\n/* \u4E13\u5C5E\u6807\u7B7E\u6539\u6210\u5C0F\u5706\u70B9:\u901A\u7528=\u7D2B,\u4E13\u5C5E=\u6A59(\u60AC\u505C\u6709 tooltip \u8BF4\u660E\u662F\u54EA\u4E00\u79CD) */\r\n.asone-panel .sn-pdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }\r\n.asone-panel .sn-pool.general .sn-pdot { background: var(--pool-general-soft); box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1, #141b26); }\r\n.asone-panel .sn-pool.special .sn-pdot { background: var(--pool-special-soft); box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1, #141b26); }\r\n\r\n/* \u884C\u5DE6\u6807\u7B7E / \u53F3\u4FA7\u300C\u6570\u503C + \u767E\u5206\u6BD4\u300D\u540C\u884C,\u628A\u6570\u503C\u6536\u8FDB\u6807\u7B7E\u884C,\u7701\u6389\u4E00\u6574\u884C\u9AD8\u5EA6)\u3002   `margin` \u538B\u5230 8px/4px:\u4F59\u91CF\u6761\u8981\u8D34\u7740\u5B83\u4E0A\u65B9\u7684\u6807\u7B7E\u884C\u4E2D\u95F4\u4E0D\u7559\u7A7A\u6863\u3002*/\r\n.asone-panel .sn-row {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: baseline;\r\n  gap: 6px;\r\n  font-size: 11px;\r\n  color: var(--text-soft);\r\n  margin: 8px 0 4px;\r\n}\r\n.asone-panel .sn-row-label { flex: none; }\r\n/* \u53F3\u4FA7\u6570\u503C:\u6570\u5B57\u6BD4\u6807\u7B7E\u5927\u4E00\u53F7\u3001\u767D\u4E00\u6863 \u2014\u2014 \u626B\u89C6\u65F6\u5148\u843D\u5728\u6570\u5B57\u4E0A\u3002   \u767E\u5206\u6BD4\u8DDF\u5728\u540E\u9762\u3001\u5C0F\u4E00\u53F7\u4E14\u538B\u6697,\u8BFB\u4F5C\u6570\u5B57\u7684\u6CE8\u89E3\u800C\u4E0D\u662F\u5E76\u5217\u7684\u7B2C\u4E8C\u9879\u3002*/\r\n.asone-panel .sn-row-val { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }\r\n.asone-panel .sn-row-val b { font-size: 15px; color: var(--text); font-variant-numeric: tabular-nums; font-weight: 600; }\r\n.asone-panel .sn-row-val .sn-pct { color: var(--text); font-size: 11px; font-variant-numeric: tabular-nums; }\r\n/* \u7B2C\u4E8C\u4E2A\u7A97\u53E3(\u672C\u5468\u4F59\u989D)\u4E0E 5h \u4E4B\u95F4\u7528\u865A\u7EBF\u9694\u5F00:\u4E24\u8005\u662F\u540C\u4E00\u4E2A\u6C60\u7684\u4E24\u4E2A\u7A97\u53E3\r\n   \u9694\u4E00\u6761\u7EBF\u6BD4\u591A\u7559\u767D\u66F4\u80FD\u8BF4\u660E\u300C\u4E0A\u9762\u90A3\u4E2A\u662F 5h\u3001\u8FD9\u4E2A\u662F 7d\u300D\u3002*/\r\n.asone-panel .sn-row.split { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }\r\n.asone-panel .sn-bar { height: 5px; background: var(--surface-deep); border-radius: 999px; overflow: hidden; }\r\n.asone-panel .sn-bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s ease; }\r\n.asone-panel .sn-pool.general .sn-bar-fill { background: var(--pool-grad-general); }\r\n.asone-panel .sn-pool.special .sn-bar-fill { background: var(--pool-grad-special); }\r\n/* \u51B7\u5374\u4E2D:\u8FDB\u5EA6\u6761\u7EDF\u4E00\u8F6C\u7070 \u2014\u2014 \u989C\u8272\u6B64\u65F6\u53EA\u8868\u793A\u300C\u8FD9\u4E2A\u6C60\u5728\u4F11\u606F\u300D,\u4E0D\u518D\u8868\u793A\u4F59\u91CF\u3002*/\r\n.asone-panel .sn-pool.cooling .sn-bar-fill { background: var(--dim); }\r\n\r\n/* \u6C60\u5E95\u69FD\u4F4D(**\u4E24\u4E2A\u6C60\u6545\u610F\u4E0D\u4E00\u6837*)\u3002   `margin-top:auto` \u662F\u8FD9\u91CC\u7684\u5173\u952E:\u5B83\u628A\u69FD\u4F4D\u9489\u5728\u5361\u7247\u5E95\u90E8,\u4E24\u4E2A\u6C60\u56E0\u6B64\u7B49\u9AD8\u6536\u5C3E\u3002   \u26A0\uFE0F \u4E24\u4E2A\u69FD\u4F4D\u5FC5\u987B**\u5360\u4E00\u6837\u7684\u9AD8\u5EA6**,\u5426\u5219\u4E24\u4E2A\u6C60\u7B49\u9AD8\u3001\u5E95\u8FB9\u5BF9\u9F50\u4E86,\u5185\u90E8\u5185\u5BB9\u5374\u4E00\u9AD8\u4E00\u4F4E\r\n   \u6A2A\u5411\u626B\u89C6\u4ECD\u4F1A\u89C9\u5F97\u300C\u53F3\u8FB9\u5C11\u4E00\u5757\u300D\u3002\u6240\u4EE5\u4E24\u6761\u90FD\u9489\u4E86\u540C\u6837\u7684\u9AD8\u5EA6(30px)\u4E0E\u5185\u8FB9\u8DDD\u3002   \u26A0\uFE0F \u69FD\u4F4D\u662F*\u7EAF\u6587\u5B57*:\u4E0D\u7ED9\u5E95\u8272\u3001\u4E0D\u7ED9\u8FB9\u6846\u3001\u4E0D\u7ED9\u5C0F\u5706\u70B9(\u6309\u53C2\u8003\u56FE\u5B9E\u6D4B,\u539F\u5148\u90A3\u7EC4\r\n   `var(--dim)` + `var(--border)` \u63CF\u8FB9\u5728\u6574\u5F20\u622A\u56FE\u91CC\u5404\u51FA\u73B00 \u6B21\u3002*/\r\n.asone-panel .sn-grant,\r\n.asone-panel .sn-reset-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 7px;\r\n  min-height: 30px;\r\n  box-sizing: border-box;\r\n  margin-top: auto; /* \u8D34\u4F4F\u5361\u7247\u5E95\u90E8 \u2192\u4E24\u6C60\u5E95\u8FB9\u5BF9\u9F50 */\r\n  padding: 0 2px;\r\n  border-radius: 8px;\r\n  font-size: 11px;\r\n  color: var(--text-soft);\r\n}\r\n.asone-panel .sn-grant b { color: var(--text); font-size: 13px; font-variant-numeric: tabular-nums; }\r\n.asone-panel .sn-g-label { flex: 1 1 auto; }\r\n/* \u6CA1\u6709\u6D3B\u52A8\u53D1\u653E:\u663E\u793A 5h / 7d \u7684\u91CD\u7F6E\u65F6\u523B\u7EAF\u6587\u5B57\u4E0D\u7ED9\u5E95\u8272\u4E5F\u4E0D\u7ED9\u8FB9\u6846\u2014\u2014\u7ED9\u5B83\u52A0\u5E95\u8272   \u53CD\u800C\u4F1A\u8BA9\u4EBA\u4EE5\u4E3A Flash-Lite \u6C60\u4E5F\u6709\u6D3B\u52A8\u79EF\u5206\u3002*/\r\n.asone-panel .sn-reset-row { justify-content: space-between; padding: 0 2px; }\r\n.asone-panel .sn-r-label { flex: none; }\r\n.asone-panel .sn-r-val { color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }\r\n\r\n/* \u8D26\u53F7\u7BA1\u7406\u8868(\u6A21\u578B\u76EE\u5F55\u90A3\u5F20\u8868\u7684\u5217\u5BBD / \u8F93\u5165\u6846 / \u56FE\u50CF\u5217\u7EFF\u70B9\u90FD\u5728 ModelTable \u91CC) */\r\n.asone-panel .sn-grid { width: 100%; border-collapse: collapse; margin: 8px 0; }\r\n.asone-panel .sn-grid th,\r\n.asone-panel .sn-grid td { border-bottom: 1px solid var(--border); padding: 7px 6px; font-size: 13px; text-align: left; }\r\n.asone-panel .sn-grid th { background: var(--surface-deep); color: var(--text); font-weight: 600; }\r\n.asone-panel .sn-grid th.num,\r\n.asone-panel .sn-grid td.num { text-align: right; font-variant-numeric: tabular-nums; }\r\n.asone-panel .sn-grid td.sub { color: var(--text-soft); }\r\n/* \u8D26\u53F7\u7BA1\u7406\u8868\u91CC\u7684\u80F6\u56CA\u5DF2\u4FDD\u5B58/ \u6709\u5BC6\u94A5\u3002\u548C `.chan-badge` \u662F\u540C\u4E00\u65CF\u5F62\u72B6\u4F46\u90A3\u679A\u662F\u89D2\u6807\u3002   \u8FD9\u679A\u5728\u8868\u683C\u5355\u5143\u683C\u91CC\u5B57\u53F7\u5DEE\u534A\u53F7\u6240\u4EE5\u5404\u7559\u5404\u7684\u3002*/\r\n.asone-panel .sn-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--surface-deep); color: var(--text-soft); }\r\n.asone-panel .sn-pill.ok { background: var(--surface-ok); color: var(--ok); }\r\n.asone-panel .sn-pill.na { background: var(--surface-warn); color: var(--warn); }\r\n\r\n/* \u8D26\u53F7\u7BA1\u7406\u8868:\u64CD\u4F5C\u5217\u6309\u94AE(\u767B\u5F55/\u91CD\u6293 key/\u5220\u9664) */\r\n.asone-panel .sn-ops { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }\r\n.asone-panel .sn-ops .btn-sm { padding: 2px 9px; }\r\n.asone-panel .sn-ops .btn-sm.danger { background: var(--surface-bad); }\r\n.asone-panel .sn-ops .btn-sm.danger:hover:not(:disabled) { border-color: var(--bad); }\r\n\r\n/* \u8D26\u53F7\u7BA1\u7406\u8868:\u767B\u5F55\u884C(\u5BC6\u7801\u8F93\u5165 + \u767B\u5F55\u5E76\u6293 key/\u53EA\u4FDD\u5B58\u5BC6\u7801) */\r\n.asone-panel .sn-login { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }\r\n.asone-panel .sn-login input[type="password"],\r\n.asone-panel .sn-add input {\r\n  font: inherit;\r\n  color: var(--text, var(--text));\r\n  background: var(--surface);\r\n  border: 1px solid var(--border);\r\n  border-radius: 6px;\r\n  padding: 5px 10px;\r\n  min-width: 180px;\r\n}\r\n.asone-panel .sn-login input[type="password"]:focus,\r\n.asone-panel .sn-add input:focus { border-color: var(--accent, #4d6bfe); outline: none; }\r\n.asone-panel .sn-login .chan-hint { margin: 0; flex: 1 1 100%; }\r\n\r\n/* \u8D26\u53F7\u7BA1\u7406\u8868:\u6DFB\u52A0\u8868\u5355\u884C */\r\n.asone-panel .sn-add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 2px; }\r\n.asone-panel .sn-add .chan-hint { margin: 0; flex: 1 1 100%; }\r\n\r\n/* \u2500\u2500 \u8D26\u53F7\u7BA1\u7406\u9875 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\r\n   \u56DB\u5757\u7ED3\u6784:\u81EA\u52A8\u9274\u6743 / \u5DF2\u5165\u6C60\u8D26\u53F7/ \u771F\u5B9E\u6A21\u578B / \u7B7E\u5230\u5237\u65B0\u3002   \u590D\u7528 .grid / .btn / .chan-hint / .chan-banner \u7B49\u65E2\u6709\u7C7B,\u4E0D\u53E6\u9020\u4E00\u5957\u3002*/\r\n.asone-panel .acct-page { display: flex; flex-direction: column; gap: 6px; }\r\n.asone-panel .acct-title { margin: 0 0 6px; font-size: 17px; color: var(--text); }\r\n.asone-panel .acct-h3 { margin: 14px 0 6px; font-size: 13px; color: var(--text); }\r\n.asone-panel .acct-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\r\n.asone-panel .acct-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }\r\n.asone-panel .acct-form input[type="text"],\r\n.asone-panel .acct-form input[type="password"] {\r\n  width: 420px; padding: 4px 6px; background: var(--surface); color: var(--text);\r\n  border: 1px solid var(--border); border-radius: 4px; font-size: 12px;\r\n}\r\n.asone-panel .acct-form input::placeholder { color: var(--dim); }\r\n\r\n/*\r\n * \u2500\u2500 \u73BB\u7483:\u4E3B\u9762/\u5361\u7247/\u4E0B\u62C9\u5206\u7EC4\u900F\u51FA\u58C1\u7EB8(dsh-ui-appearance \u7684\u80CC\u666F\u56FE/\u89C6\u9891) \u2500\u2500\r\n * \u26A0\uFE0F \u9876\u680F\u4E0D\u5728\u540D\u5355\u91CC:2026-11-03 \u7528\u6237\u5B9A\u6848\u300C\u9876\u680F\u8DDF\u968F\u80CC\u666F\u300D\u2014\u2014\u9876\u680F\u8981\u900F\u51FA\u7684\u662F\r\n * \u58C1\u7EB8\u672C\u8EAB(\u6E05\u6670),\u4E0D\u662F\u5B83\u7684\u78E8\u7802\u7248\u672C;\u78E8\u7802\u7559\u7ED9\u771F\u6B63\u538B\u5728\u58C1\u7EB8\u4E0A\u7684\u5361\u7247\u3002\r\n */\r\n.asone-panel .ov-inflight,\r\n.asone-panel .usage-card,\r\n.asone-panel .usage-seg,\r\n.asone-panel .rowCard,\r\n.asone-panel .depCard,\r\n.asone-panel .card,\r\n.asone-panel .panel {\r\n  backdrop-filter: var(--glass);\r\n  -webkit-backdrop-filter: var(--glass);\r\n}\r\n\r\n\r\n\r\n/* \u2500\u2500 \u8C03\u5EA6\u89C4\u5219:\u6BCF\u4E2A\u6863\u4F4D\u4E00\u5F20\u4E0E\u300C\u5916\u90E8\u6570\u636E\u5237\u65B0\u300D\u540C\u7EA7\u7684\u72EC\u7ACB\u9762\u677F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\r\n   \u539F\u5148\u628A\u4E94\u6863 + \u51B7\u5374 + \u4F1A\u8BDD\u7C98\u6027\u5168\u585E\u8FDB\u4E00\u4E2A\u300C\u8C03\u5EA6\u89C4\u5219\u300D\u603B\u5361,\u73B0\u5728\u62C6\u6210\u5E73\u7EA7\u5361\u7247\u3002\r\n   \u989C\u8272\u4E00\u5F8B\u8D70 --dsw-alias-* / \u8BED\u4E49\u4EE4\u724C,\u8DDF\u7740 dsh-ui-appearance \u5B9E\u65F6\u8054\u52A8\u3002\r\n\r\n   \u26A0\uFE0F \u8FD9\u91CC**\u53EA**\u653E\u5361\u7247\u58F3\u7684\u8986\u76D6:.ui-card \u7684 padding \u6536\u7A84\u7ED9\u89C4\u5219\u884C\u8BA9\u4F4D,\r\n   \u5361\u7247\u5934\u7684\u95F4\u8DDD\u538B\u7D27\u3002\u89C4\u5219\u884C\u672C\u8EAB\u7684\u6837\u5F0F\u5728\u6587\u4EF6\u4E0A\u534A\u90E8\u5206 `.asone-scheduler`\r\n   \u6BB5\u91CC(\u542B\u5206\u9694\u7EBF\u6839\u56E0\u8BF4\u660E)\u3002 */\r\n.asone-panel .rule-panel .ui-card-head {\r\n  align-items: center;\r\n  margin-bottom: 6px;\r\n}\r\n.asone-panel .rule-panel .ui-card-title {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n.asone-panel .rule-panel .ui-card-sub {\r\n  margin: 0;\r\n  font-weight: 400;\r\n}\r\n.asone-panel .rule-panel .badge {\r\n  font-size: 12px;\r\n  padding: 2px 10px;\r\n}\r\n/* \u5361\u7247\u5185\u8FB9\u8DDD\u6536\u7A84:\u4E00\u884C\u9AD8\u4E4B\u540E\u7EB5\u5411\u7A7A\u95F4\u4E3B\u8981\u8BE5\u7559\u7ED9\u89C4\u5219,\u800C\u4E0D\u662F\u58F3\u3002 */\r\n.asone-panel .rule-panel.ui-card {\r\n  padding: 10px 14px;\r\n}';

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
function logicalLabelOf(route) {
  const name2 = route.logical_display_name ?? route.logical_model;
  return name2 !== null && name2 !== "" ? name2 : null;
}
function providerLabelOf(route) {
  return route.provider_display_name ?? route.provider;
}
function titleOf(route) {
  const base = `\u771F\u5B9E\u6A21\u578B:${providerLabelOf(route)}/${route.model}`;
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
        /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(
          "span",
          {
            style: {
              minWidth: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              overflow: "hidden",
              fontVariantNumeric: "tabular-nums"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
                "span",
                {
                  title: route.in_flight ? `\u672C\u6B21\u8BF7\u6C42\u6B63\u5728\u4F7F\u7528 ${providerLabelOf(route)}/${route.model}` : `\u4E0B\u4E00\u6761\u6D88\u606F\u9884\u8BA1\u4F7F\u7528 ${providerLabelOf(route)}/${route.model}`,
                  style: {
                    flex: "0 0 auto",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  },
                  children: route.is_logical && logicalLabelOf(route) !== null ? `${logicalLabelOf(route)} \u2192` : ""
                }
              ),
              route.provider !== "" && /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
                "span",
                {
                  "data-as-one-current-model-provider": "",
                  title: `\u4F9B\u5E94\u5546:${providerLabelOf(route)}`,
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
                  children: providerLabelOf(route)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
                "span",
                {
                  style: {
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  },
                  children: realNameOf(route)
                }
              )
            ]
          }
        )
      ]
    }
  );
}

// src/client.ts
injectAsOneStyles();
bindPanelBridge();
var BUNDLE_NAME = "@bvbhu/as-one";
var PANEL_ID = "as-one";
var PANEL_ORDER = 30;
var name = "@bvbhu/as-one/client";
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
