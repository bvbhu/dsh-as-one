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
import type { PanelHost, PanelHostOptions } from "./panel-host.js";
import type { AsOneRuntime } from "./setup.js";
/**
 * 面板方法全集 —— 顺序与共享包 `dispatchPanel` 的 case 对齐。
 * ⚠️ 加方法时**两处都要加**:共享包的 `dispatchPanel` 与本表(本表漏了 → 404)。
 */
export declare const PANEL_METHODS: readonly ["getStatus", "getRuntime", "restartGateway", "getUsageHistory", "getLogicalModels", "writeLogicalModel", "removeLogicalModel", "getDeployments", "getSessionCurrentRoute", "setDeploymentExposure", "setDeploymentReasoning", "fetchDeploymentReasoning", "getModelProviders", "upsertModelProvider", "removeModelProvider", "fetchModels", "setModelExposure", "checkModels", "getMetrics", "checkModel", "getSensenovaAccounts", "getQuota", "getProviderPage", "getChannelAccounts", "checkinStatus", "checkinClaim", "checkinOverview", "checkinAll", "refreshStatus", "refreshRun", "syncChannel", "setChannelModels", "setChannelModel", "getClientPaths", "saveClientPath", "detectClientPath", "discoverChannelAccounts", "adoptChannelAccount", "getSettings", "saveSettings", "getRequestLog", "setRequestLog", "getSensenovaStatus", "getSensenovaModels", "setSensenovaExposure", "sensenovaRefresh", "sensenovaLogin", "sensenovaSavePassword", "sensenovaRefetchKey", "sensenovaAddAccount", "sensenovaRemoveAccount", "getQoderAccounts", "getQoderStatus", "getQoderModels", "qoderRefreshCatalog", "qoderSetModelEnabled", "qoderCredits", "qoderCheckin", "qoderCampaigns", "qoderAddAccount", "qoderRemoveAccount", "qoderSetAccountEnabled", "qoderProbeChat", "qoderRecentErrors", "getDataDir", "listProviders", "setAccountEnabled", "getRecentRequests", "getRequestLogStatus"];
/** 把 HTTP body 翻译成位置参数。 */
export declare function argsOf(method: string, body: unknown): unknown[];
/**
 * 面板方法表(向后兼容旧导出名)。
 *
 * 旧实现是 8 个手写方法;现在整份来自共享包 —— 因此 `getSettings` 等返回的是
 * **共享契约**(`@as-one/panel/src/types.js` 的 `RendererApi`),不再是插件早期
 * 那份精简版。
 */
export declare function createPanelMethods(rt: AsOneRuntime, options?: PanelHostOptions): PanelHost["panel"];
/** 把面板方法包成 POST exact 路由(每方法一条,body 见文件头参数约定)。 */
export declare function buildPanelRoutes(rt: AsOneRuntime, options?: PanelHostOptions): AsOneWebRoute[];
