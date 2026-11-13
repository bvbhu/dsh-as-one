/**
 * 面板数据路由 —— client 半的数据面(`/as-one/api/*`)。
 *
 * 与 Electron 版**同一份实现**:方法表来自 `@as-one/panel` 的 `createPanel`,
 * 分派走同一个 `dispatchPanel`。本文件只负责把 HTTP 请求翻译成
 * 「方法名 + 位置参数」,wire 形状对齐 docs/client-half-design.md §5:
 *   成功 `{ ok: true, value: T }`  失败 `{ ok: false, error: { code, message } }`
 *
 * ⚠️ 宿主半坑:webServer 对 handler 抛错统一 writeHead(400) —— 所有错误路径
 * 必须在 handler 内自写状态/body,不靠 throw。
 *
 * 参数约定(向后兼容两代 client):
 * 1. `{ args: [...] }` —— 新约定,位置参数与 Electron IPC 完全一致;
 * 2. 裸数组 `[...]` —— 同上;
 * 3. 旧对象 `{ provider, index, enabled }` 之类 —— 由 {@link LEGACY_ARGS} 映射。
 */

import type { AsOneWebRoute } from "./context-types.js";
import { readJsonBody, writeJson } from "./wire.js";
import { createPanelHost } from "./panel-host.js";
import type { PanelHost, PanelHostOptions } from "./panel-host.js";
import type { AsOneRuntime } from "./setup.js";

/**
 * 面板方法全集 —— 顺序与共享包 `dispatchPanel` 的 case 对齐。
 * ⚠️ 加方法时**两处都要加**:共享包的 `dispatchPanel` 与本表(本表漏了 → 404)。
 */
export const PANEL_METHODS = [
  // 总览 / 运行期
  "getStatus",
  "getRuntime",
  "restartGateway",
  // 用量
  "getUsageHistory",
  // 逻辑模型
  "getLogicalModels",
  "writeLogicalModel",
  "removeLogicalModel",
  // 模型总览(部署)
  "getDeployments",
  "getSessionCurrentRoute",
  "setDeploymentExposure",
  "setDeploymentReasoning",
  "fetchDeploymentReasoning",
  "getModelProviders",
  "upsertModelProvider",
  "removeModelProvider",
  "fetchModels",
  "setModelExposure",
  "checkModels",
  "getMetrics",
  "checkModel",
  // 渠道(SenseNova / Trae / WorkBuddy)
  "getSensenovaAccounts",
  "getQuota",
  "getProviderPage",
  "getChannelAccounts",
  "checkinStatus",
  "checkinClaim",
  "checkinOverview",
  "checkinAll",
  "channelOverview",
  "refreshStatus",
  "refreshRun",
  "syncChannel",
  "syncChannelQuota",
  "syncChannelCatalog",
  "syncAllQuota",
  "setChannelModels",
  "setChannelModel",
  "getClientPaths",
  "saveClientPath",
  "detectClientPath",
  "discoverChannelAccounts",
  "adoptChannelAccount",
  // 设置
  "getSettings",
  "saveSettings",
  "getRequestLog",
  "setRequestLog",
  // sensenova 页
  "getSensenovaStatus",
  "getSensenovaModels",
  "setSensenovaExposure",
  "sensenovaRefresh",
  "sensenovaLogin",
  "sensenovaSavePassword",
  "sensenovaRefetchKey",
  "sensenovaAddAccount",
  "sensenovaRemoveAccount",
  // qoder 页
  "getQoderAccounts",
  "getQoderStatus",
  "getQoderModels",
  "qoderRefreshCatalog",
  "qoderSetModelEnabled",
  "qoderCredits",
  "qoderCheckin",
  "qoderCampaigns",
  "qoderAddAccount",
  "qoderRemoveAccount",
  "qoderSetAccountEnabled",
  "qoderProbeChat",
  "qoderRecentErrors",
  // 数据目录
  "getDataDir",
  // 旧兼容
  "listProviders",
  "setAccountEnabled",
  "getRecentRequests",
  "getRequestLogStatus",
] as const;

/** 旧对象式 body → 位置参数(只在 body 既不是数组也没有 `args` 时生效)。 */
const LEGACY_ARGS: Record<string, (body: Record<string, unknown>) => unknown[]> = {
  setAccountEnabled: (b) => [String(b.provider ?? ""), Number(b.index), Boolean(b.enabled)],
  getRecentRequests: (b) => (b.limit === undefined ? [] : [Number(b.limit)]),
  getUsageHistory: (b) => [
    String(b.range ?? "all"),
    String(b.granularity ?? "day"),
    String(b.group ?? "model"),
  ],
  removeLogicalModel: (b) => [String(b.name ?? "")],
  writeLogicalModel: (b) => [b.input ?? b],
  getQuota: (b) => [String(b.provider ?? "")],
  getProviderPage: (b) => [String(b.provider ?? "")],
  getChannelAccounts: (b) => [String(b.provider ?? "")],
  syncChannel: (b) => [String(b.provider ?? ""), Boolean(b.force)],
  syncChannelQuota: (b) => [String(b.provider ?? ""), Boolean(b.force)],
  syncChannelCatalog: (b) => [String(b.provider ?? ""), Boolean(b.force)],
  checkModel: (b) => [String(b.provider ?? ""), String(b.model ?? "")],
  saveSettings: (b) => [b.updates ?? b],
  setRequestLog: (b) => [
    b.enabled === undefined ? undefined : Boolean(b.enabled),
    String(b.contentMode ?? b.content_mode ?? "off"),
  ],
};

/** 成功 envelope。 */
function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** 失败 envelope。 */
function fail(code: string, message: string): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } };
}

/** 把 HTTP body 翻译成位置参数。 */
export function argsOf(method: string, body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body === null || typeof body !== "object") return [];
  const rec = body as Record<string, unknown>;
  if (Array.isArray(rec.args)) return rec.args;
  const legacy = LEGACY_ARGS[method];
  return legacy ? legacy(rec) : [];
}

/**
 * 面板方法表(向后兼容旧导出名)。
 *
 * 旧实现是 8 个手写方法;现在整份来自共享包 —— 因此 `getSettings` 等返回的是
 * **共享契约**(`@as-one/panel/src/types.js` 的 `RendererApi`),不再是插件早期
 * 那份精简版。
 */
export function createPanelMethods(rt: AsOneRuntime, options: PanelHostOptions = {}): PanelHost["panel"] {
  return createPanelHost(rt, options).panel;
}

/** 把面板方法包成 POST exact 路由(每方法一条,body 见文件头参数约定)。 */
export function buildPanelRoutes(rt: AsOneRuntime, options: PanelHostOptions = {}): AsOneWebRoute[] {
  const host = createPanelHost(rt, options);

  const route = (path: string, method: string): AsOneWebRoute =>
    ({
      kind: "exact",
      path,
      handler: async (req, res) => {
        if ((req.method ?? "GET").toUpperCase() !== "POST") {
          writeJson(res, 405, fail("method_not_allowed", `expected POST, got ${req.method ?? "?"}`));
          return;
        }
        try {
          const body = await readJsonBody(req);
          // getUsageSummary 是早期插件的别名(旧 StatsPage 在用):映射到
          // 共享契约的 getUsageHistory("all", "day", "model")。
          const value =
            method === "getUsageSummary"
              ? await host.dispatch("getUsageHistory", ["all", "day", "model"])
              : await host.dispatch(method, argsOf(method, body));
          writeJson(res, 200, ok(value));
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          const status =
            typeof (err as { status?: unknown }).status === "number"
              ? (err as { status: number }).status
              : 500;
          writeJson(res, status, fail("internal_error", detail));
        }
      },
    }) satisfies AsOneWebRoute;

  const routes = PANEL_METHODS.map((m) => route(`/as-one/api/${m}`, m));
  // 旧别名(getUsageSummary → getUsageHistory)
  routes.push(route("/as-one/api/getUsageSummary", "getUsageSummary"));
  return routes;
}
