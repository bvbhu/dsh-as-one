/**
 * `@as-one/panel-ui` —— As One 管理面板视图层。
 *
 * Electron 渲染进程与 DSH 插件 client 共用同一套页面:宿主只需在挂载前
 * `setPanelInvoker()` 注入数据通道(IPC 或 HTTP),然后渲染 `<App />`。
 * 样式由宿主引入 `@as-one/panel-ui/styles.css`(插件 client 内联注入)。
 */

export * from "./bridge";
export * from "./types";
export * from "./api";
export * from "./format";
export * from "./App";

export { default as ModelTable } from "./components/ModelTable";
export type { ModelTableEdit, ModelTableRow } from "./components/ModelTable";
export { default as LogicalModelEditor } from "./components/LogicalModelEditor";
export type { LogicalMember, LogicalModelEditorProps, StrategyKey } from "./components/LogicalModelEditor";
export { default as ClientPaths } from "./components/ClientPaths";
export { NavTabs } from "./components/NavTabs";
export type { NavTabItem } from "./components/NavTabs";

export { default as OverviewPage } from "./pages/OverviewPage";
export { default as UsageStatsPage } from "./pages/UsageStatsPage";
export { default as SettingsPage } from "./pages/SettingsPage";
export { default as ModelsPage } from "./pages/models/ModelsPage";
export { default as LogicalModelsPage } from "./pages/models/LogicalModelsPage";
export { default as DeploymentsPage } from "./pages/models/DeploymentsPage";
export { default as ChannelPage } from "./pages/models/ChannelPage";
export { default as SenseNovaPage } from "./pages/models/SenseNovaPage";
export { default as QoderPage } from "./pages/models/QoderPage";
export { default as ProvidersPage } from "./pages/models/ProvidersPage";
