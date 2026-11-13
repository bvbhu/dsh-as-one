/**
 * RendererApi —— As One 管理面板(渲染进程)读取/写入网关数据的唯一接缝。
 *
 * 宿主无关:数据经 ./bridge 注入的 invoke 实现取回(Electron 走 preload IPC,DSH
 * 插件 client 走 POST /as-one/api/<method>)。组件不得绕过本接口直接 fetch。
 *
 * 契约:面板页面结构 1:1 照搬 Nexus 面板(用户 m07680),本文件的 RendererApi
 * 方法全集与形状以 @as-one/panel/src/types 为准(冻结,勿改)。方法名即
 * method,直达主进程 dispatchPanel(panel, method, args) 的 switch。
 *
 * 跨层类型见 ./types(RendererApi 契约,type-only)。
 */

import { invokePanel } from "./bridge";

export * from "./types";
// 本文件内直接使用 RendererApi(export * 只形成再导出,不会把名字放进本模块
// 局部作用域,见 TS2304)。
import type { RendererApi } from "./types";
import type {
  ApiResult,
  ChannelAccount,
  ChannelCheckin,
  ChannelModelPatch,
  ChannelModelSpec,
  ChannelRefreshStatus,
  CheckinAllResult,
  CheckinOverview,
  ChannelOverview,
  ClientPathsResult,
  DataDirInfo,
  DeploymentList,
  DiscoverChannelResult,
  GatewayStatus,
  LogicalModelGroup,
  LogicalModelsWriteInput,
  MetricsSnapshot,
  ModelProvider,
  ProviderPage,
  QoderAccountRow,
  QoderCampaignView,
  QoderCatalogRow,
  QoderCheckinView,
  QoderCreditsView,
  QoderErrorView,
  QoderStatus,
  QuotaRead,
  RequestLogContentMode,
  RequestLogStatus,
  RuntimeSnapshot,
  SensenovaAccountRow,
  SensenovaCatalogRow,
  SensenovaStatus,
  SessionCurrentRoute,
  SettingsRead,
  UsageGroup,
  UsageGranularity,
  UsageHistory,
  UsageRange,
} from "./types";

export type {
  ApiResult,
  ChannelAccount,
  ChannelCheckin,
  ChannelModelSpec,
  ChannelRefreshStatus,
  CheckinAllResult,
  CheckinOverview,
  ChannelOverview,
  ClientPathsResult,
  DataDirInfo,
  DeploymentList,
  DiscoverChannelResult,
  GatewayStatus,
  LogicalModelGroup,
  LogicalModelsWriteInput,
  MetricsSnapshot,
  ModelProvider,
  ProviderPage,
  QoderAccountRow,
  QoderCampaignView,
  QoderCatalogRow,
  QoderCheckinView,
  QoderCreditsView,
  QoderErrorView,
  QoderStatus,
  QuotaRead,
  RequestLogContentMode,
  RequestLogStatus,
  RuntimeSnapshot,
  SensenovaAccountRow,
  SensenovaCatalogRow,
  SensenovaStatus,
  SessionCurrentRoute,
  SettingsRead,
  UsageGroup,
  UsageGranularity,
  UsageHistory,
  UsageRange,
} from "./types";

// ── 数据桥实现(宿主注入) ────────────────────────────────────────────────

/**
 * 走宿主注入的 invoke 实现的 RendererApi。
 *
 * Electron 渲染进程在 main.tsx 里注入 preload IPC,DSH 插件 client 注入
 * `POST /as-one/api/<method>`;页面代码两者皆不感知。
 */
export function createPanelApi(): RendererApi {
  const call = <T>(method: string, ...args: unknown[]): Promise<T> => invokePanel<T>(method, ...args);

  return {
    // 总览
    async getStatus() {
      return call<GatewayStatus>("getStatus");
    },
    async getRuntime() {
      return call<RuntimeSnapshot>("getRuntime");
    },
    async getSessionCurrentRoute(sessionId: string, model?: string) {
      return call<SessionCurrentRoute | null>(
        "getSessionCurrentRoute",
        sessionId,
        ...(model === undefined ? [] : [model]),
      );
    },
    // 重启网关:唯一入口是托盘菜单,面板不再提供(用户定案 m03639)
    // 用量
    async getUsageHistory(range: UsageRange, granularity: UsageGranularity, group: UsageGroup) {
      return call<UsageHistory>("getUsageHistory", range, granularity, group);
    },
    // 逻辑模型
    async getLogicalModels() {
      return call<LogicalModelGroup[]>("getLogicalModels");
    },
    async writeLogicalModel(input: LogicalModelsWriteInput) {
      return call<ApiResult>("writeLogicalModel", input);
    },
    async removeLogicalModel(name: string) {
      return call<ApiResult>("removeLogicalModel", name);
    },
    // 模型总览(部署)
    async getDeployments() {
      return call<DeploymentList>("getDeployments");
    },
    async setDeploymentExposure(
      deploymentId: string,
      kind: "direct" | "group" | "all",
      exposed: boolean,
      concurrency?: number,
    ) {
      return call<ApiResult>("setDeploymentExposure", deploymentId, kind, exposed, concurrency);
    },
    async setDeploymentReasoning(
      deploymentId: string,
      efforts: string[] | null,
      allowsOff: boolean | null,
    ) {
      return call<ApiResult>("setDeploymentReasoning", deploymentId, efforts, allowsOff);
    },
    async fetchDeploymentReasoning(deploymentId: string) {
      return call<ApiResult>("fetchDeploymentReasoning", deploymentId);
    },
    // 供应商(其他供应商)
    async getModelProviders() {
      return call<ModelProvider[]>("getModelProviders");
    },
    async upsertModelProvider(
      id: string,
      baseUrl: string | null,
      protocol: string,
      envPrefix?: string | null,
      keys?: string[] | null,
    ) {
      return call<ApiResult>("upsertModelProvider", id, baseUrl, protocol, envPrefix, keys);
    },
    async removeModelProvider(id: string) {
      return call<ApiResult>("removeModelProvider", id);
    },
    async fetchModels(
      id: string,
      force?: boolean,
      decl?: { baseUrl?: string | null; protocol?: string | null } | null,
    ) {
      return call<ApiResult>("fetchModels", id, force, decl ?? null);
    },
    async setModelExposure(provider: string, model: string, exposed: boolean) {
      return call<ApiResult>("setModelExposure", provider, model, exposed);
    },
    async getMetrics(days?: number) {
      return call<MetricsSnapshot>("getMetrics", days);
    },
    async checkModel(provider: string, model: string) {
      return call<ApiResult>("checkModel", provider, model);
    },
    async getSensenovaAccounts() {
      return call<{ accounts: SensenovaAccountRow[]; count: number }>("getSensenovaAccounts");
    },
    async getQuota() {
      return call<QuotaRead>("getQuota");
    },
    async checkModels(id?: string) {
      return call<ApiResult>("checkModels", id);
    },
    // 渠道页(Trae / WorkBuddy)
    async getProviderPage(provider: string, fresh?: boolean) {
      return call<ProviderPage>("getProviderPage", provider, fresh);
    },
    async getChannelAccounts(provider: string) {
      return call<ChannelAccount[]>("getChannelAccounts", provider);
    },
    async checkinStatus(provider: string) {
      return call<ChannelCheckin>("checkinStatus", provider);
    },
    async checkinClaim(provider: string, confirm: boolean, index?: number) {
      return call<ApiResult>("checkinClaim", provider, confirm, index);
    },
    async checkinOverview() {
      return call<CheckinOverview>("checkinOverview");
    },
    async checkinAll(confirm: boolean) {
      return call<CheckinAllResult>("checkinAll", confirm);
    },
    async channelOverview() {
      return call<ChannelOverview>("channelOverview");
    },
    async refreshStatus(provider: string) {
      return call<ChannelRefreshStatus>("refreshStatus", provider);
    },
    async refreshRun(provider: string, confirm: boolean, index?: number) {
      return call<ApiResult>("refreshRun", provider, confirm, index);
    },
    async syncChannel(provider: string, force?: boolean) {
      return call<ApiResult>("syncChannel", provider, force);
    },
    /**
     * ⚠️ **只刷新额度(2026-11-07 拆分语义)**:打开渠道页与点「刷新」都走这条 ——
     * 不拉模型目录(只在展开渠道卡片时才拉)、不签到(只有点「全部签到」才签)。
     */
    async syncChannelQuota(provider: string, force?: boolean) {
      return call<ApiResult>("syncChannelQuota", provider, force);
    },
    /**
     * ⚠️ **只拉模型目录(2026-11-07 拆分语义)**:展开渠道卡片时才调,不刷额度、不签到。
     */
    async syncChannelCatalog(provider: string, force?: boolean) {
      return call<ApiResult>("syncChannelCatalog", provider, force);
    },
    /**
     * ⚠️ **批量只刷额度(2026-11-07 拆分语义)**:打开渠道页入口,对所有有额度能力的
     * 渠道各跑一次额度段;不拉模型目录、不签到。
     */
    async syncAllQuota(force?: boolean) {
      return call<ApiResult>("syncAllQuota", force);
    },
    async setChannelModels(provider: string, models: ChannelModelSpec[]) {
      return call<ApiResult>("setChannelModels", provider, models);
    },
    /**
     * 单行实时保存(用户 2026-10-31 定案:四页删掉「撤销/保存」,勾选与改格即落库)。
     *
     * ⚠️ 不要用 `setChannelModels` 代替它:那个是整批替换(清单外 = 删行),
     * 一次只发一行会把其余模型全删掉。取消勾选传 `exposed: false`。
     */
    async setChannelModel(provider: string, patch: ChannelModelPatch) {
      return call<ApiResult>("setChannelModel", provider, patch);
    },
    // 客户端路径
    async getClientPaths() {
      return call<ClientPathsResult>("getClientPaths");
    },
    async saveClientPath(channel: string, path: string) {
      return call<ApiResult>("saveClientPath", channel, path);
    },
    async detectClientPath(channel: string) {
      return call<ApiResult>("detectClientPath", channel);
    },
    // 自动发现 / 接入
    async discoverChannelAccounts(provider: string) {
      return call<DiscoverChannelResult>("discoverChannelAccounts", provider);
    },
    async adoptChannelAccount(
      provider: string,
      username: string,
      token: string,
      region?: string,
      /**
       * 发现阶段的身份字段(device_id/user_id/edition…)。
       *
       * ⚠️ 必须传(2026-11-09):不传的话后端只能写 `{source, region}` 三个键,
       * 凭据残缺会导致签到持续被上游回 9074。
       */
      extra?: Record<string, unknown>,
    ) {
      return call<ApiResult>("adoptChannelAccount", provider, username, token, region, extra);
    },
    // 设置
    async getSettings() {
      return call<SettingsRead>("getSettings");
    },
    async saveSettings(payload: Record<string, Record<string, string>>) {
      return call<ApiResult>("saveSettings", payload);
    },
    // 请求日志
    async getRequestLog() {
      return call<RequestLogStatus>("getRequestLog");
    },
    async setRequestLog(patch: { enabled?: boolean; content_mode?: RequestLogContentMode }) {
      return call<ApiResult>("setRequestLog", patch);
    },
    // SenseNova
    async getSensenovaStatus() {
      return call<SensenovaStatus>("getSensenovaStatus");
    },
    async getSensenovaModels() {
      return call<SensenovaCatalogRow[]>("getSensenovaModels");
    },
    async setSensenovaExposure(provider: string, model: string, exposed: boolean) {
      return call<ApiResult>("setSensenovaExposure", provider, model, exposed);
    },
    async sensenovaRefresh(force?: boolean, parts?: { catalog?: boolean; quota?: boolean }) {
      return call<ApiResult>("sensenovaRefresh", force, parts);
    },
    // SenseNova 登录与账号管理(镜像 Nexus /sensenova/login 等路由)
    async sensenovaLogin(account: string, username: string | null, password: string, fetchKey?: boolean) {
      return call<ApiResult>("sensenovaLogin", account, username, password, fetchKey);
    },
    async sensenovaSavePassword(account: string, username: string, password: string) {
      return call<ApiResult>("sensenovaSavePassword", account, username, password);
    },
    async sensenovaRefetchKey(account: string) {
      return call<ApiResult>("sensenovaRefetchKey", account);
    },
    async sensenovaAddAccount(username: string, password?: string, apiKey?: string) {
      return call<ApiResult>("sensenovaAddAccount", username, password, apiKey);
    },
    async sensenovaRemoveAccount(account: string) {
      return call<ApiResult>("sensenovaRemoveAccount", account);
    },
    // Qoder(cosy 协议;qoder 国内 / qoder-global 国际)。region 用字符串透传,
    // 主进程按区域分派;未知区域由面板域自己拒绝并给文案。
    async getQoderAccounts() {
      return call<{ accounts: QoderAccountRow[]; count: number }>("getQoderAccounts");
    },
    async getQoderStatus() {
      return call<QoderStatus>("getQoderStatus");
    },
    async getQoderModels(region?: string) {
      return call<QoderCatalogRow[]>("getQoderModels", region);
    },
    async qoderRefreshCatalog(region?: string) {
      return call<ApiResult>("qoderRefreshCatalog", region);
    },
    async qoderSetModelEnabled(region: string, key: string, enabled: boolean) {
      return call<ApiResult>("qoderSetModelEnabled", region, key, enabled);
    },
    async qoderCredits(region: string, account?: string) {
      return call<QoderCreditsView[]>("qoderCredits", region, account);
    },
    async qoderCheckin(region: string, account?: string) {
      return call<QoderCheckinView[]>("qoderCheckin", region, account);
    },
    async qoderCampaigns(region: string, account?: string) {
      return call<{ campaigns: QoderCampaignView[]; error: string | null }>(
        "qoderCampaigns",
        region,
        account,
      );
    },
    async qoderAddAccount(region: string, name: string, pat: string) {
      return call<ApiResult>("qoderAddAccount", region, name, pat);
    },
    async qoderRemoveAccount(region: string, name: string) {
      return call<ApiResult>("qoderRemoveAccount", region, name);
    },
    async qoderSetAccountEnabled(region: string, name: string, enabled: boolean) {
      return call<ApiResult>("qoderSetAccountEnabled", region, name, enabled);
    },
    async qoderProbeChat(region: string, name?: string) {
      return call<ApiResult>("qoderProbeChat", region, name);
    },
    async qoderRecentErrors() {
      return call<{ errors: QoderErrorView[] }>("qoderRecentErrors");
    },
    // 数据目录
    async getDataDir() {
      return call<DataDirInfo>("getDataDir");
    },
  };
}

/** 当前生效的面板数据源(宿主注入的 invoke 实现)。组件无需改动。 */
export const rendererApi: RendererApi = createPanelApi();
