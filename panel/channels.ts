/**
 * 渠道面板域 —— 从 assembly.ts 的 createPanel 闭包拆出(重构第五刀)。
 *
 * 职责:渠道页(Trae / WorkBuddy / SenseNova 的目录与额度)整条读链 + 仪表盘:
 *   - 自动采纳(trae 本机登录态)、签到(claim/status)
 *   - 刷新(单账号 / 全通道)与刷新账本
 *   - 上游模型目录拉取(冷却 + 单飞 + 落库)与额度探针(冷却 + 单飞)
 *   - 17 个渠道面板方法 + 客户端路径探测(safeExists / probeClientPath)
 *     已拆到 assembly-channels-methods.ts(createChannelsMethods,第十一刀)
 *
 * 两处边界:
 *   - 三个域外闭包(`realModelMap` / `modelViewOf` / `stripMemberFromLogicalModels`)
 *     被别的域(逻辑模型 / 模型总览)共用,留在 createPanel,经 deps 传入。
 *   - 进程级共享状态(`chQuotaCache` 等)在本文件模块级 —— 网关侧
 *     `AppSchedulerRepo.quotaSnapshot` 要读同一份(`chQuotaTableForScheduler`),
 *     所以它必须随本文件导出,而不能留在 createPanel 里。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  catalog_supported,
  fetch_catalog,
  type CatalogAccountInput,
  type CatalogEntry,
  type CatalogResult,
} from "@as-one/core/src/collector/catalog.js";
import {
  probe_trae_quota,
  probe_workbuddy_quota,
} from "@as-one/core/src/collector/quota.js";
import type {
  QuotaAccountInput,
  QuotaSnapshot,
} from "@as-one/core/src/collector/quota.js";
import type { QuotaSnapshot as SchedulerQuotaSnapshot } from "@as-one/core/src/scheduler/types.js";
import {
  checkinSupported,
  CheckinRegionError,
  CheckinCredentialError,
  TRAE_CODE_CROWDED,
  traeCheckinStatus,
  traeCheckinClaim,
  wbCheckinStatus,
  wbCheckinClaim,
  wbRegionOf as checkinWbRegionOf,
} from "@as-one/core/src/connectors/checkin.js";
import { MINIMAX_QUOTA_TIMEOUT_MS } from "@as-one/core/src/collector/quota.js";
import {
  minimaxSigninClaim,
  minimaxSigninStatus,
} from "@as-one/core/src/connectors/minimax-signin.js";
import { minimaxAccountFor } from "./minimax-renew.js";
import { panelClaimedToday, panelTodayPoints } from "@as-one/core/src/connectors/minimax-wire.js";
import { discoverTraeAccounts } from "@as-one/core/src/connectors/discover.js";
import {
  credentialKey,
  expiresAtOf,
  needsRefresh,
  fingerprint,
} from "@as-one/core/src/config/credentials.js";
import type { Credential } from "@as-one/core/src/config/types.js";
import { parseModelEntries } from "@as-one/core/src/gateway/model-catalog.js";
import { wallNow } from "@as-one/core/src/scheduler/engine.js";
// ⚠️ 只取这个**模块级纯函数**(不取 createSensenovaDomain):sensenova.ts 不反向
// import channels.ts,方向是单向的,不会成环。它读的是模块级 snRatioCache。
import { snPoolRatiosTable } from "./sensenova.js";
import {
  REFRESH_MARGIN_S,
  refreshSupported,
  refreshTraeToken,
  refreshWorkbuddyToken,
  refreshMinimaxToken,
  strOf,
} from "./refresh.js";
import type { RefreshOutcome } from "./refresh.js";
import { fpOf, splitRef } from "./utils.js";
import type {
  ApiResult,
  AutoRefreshInfo,
  CatalogModel,
  ChannelAccount,
  ChannelCheckin,
  ChannelCredits,
  ChannelModelPatch,
  ChannelModelSpec,
  ChannelRefreshStatus,
  ClientPathRow,
  ClientPathsResult,
  DiscoverChannelResult,
  ProviderPage,
  QuotaRead,
  RefreshAccountRow,
} from "./types.js";
import type { ModelView } from "./modelview.js";
import type { PanelContext } from "./context.js";
import {
  createChannelsMethods,
} from "./channels-methods.js";
import type {
  CheckinClaimRow,
  CheckinInputAccount,
} from "./channels-methods.js";
import { createChannelsSyncDomain } from "./channels-sync.js";

/** createPanel 需要传给渠道域的闭包(留在 createPanel,被别的域共用)。 */
export interface ChannelsDomainDeps {
  /** 注册表投影(provider → Map<"provider/model", ModelView>)。 */
  realModelMap: (pid?: string) => Map<string, ModelView>;
  /** 单模型查找。 */
  modelViewOf: (provider: string, model: string) => ModelView | undefined;
  /** 从所有逻辑模型 members 里摘掉某个真实模型,返回摘掉的条数。 */
  stripMemberFromLogicalModels: (targetRealModelId: string) => number;
  /**
   * Qoder 额度刷新(2026-11-09 用户报「qoder 不会自动更新」)。
   *
   * Qoder 的积分**不走** `CH_QUOTA_PROVIDERS` 那套探针(读数来自 `qoderCredits`),
   * 所以「全部刷新」以前根本不刷它 —— 卡头永远「未采集」。
   *
   * 为什么是**函数返回函数**:渠道域比 qoder 域先创建(顺序有讲究),直接传
   * `qd.methods.qoderCredits` 会拿到 undefined;用 getter 延迟到调用时才解引用。
   */
  qoderQuotaRefresh?: () =>
    | ((force: boolean) => Promise<{
        probed: number;
        written: number;
        message: string;
        errors: Record<string, string>;
      } | null>)
    | null;
}

/** 领域产物:17 个面板方法 + 被别的域引用的闭包/共享缓存。 */
export interface ChannelsDomain {
  /** 账户 + 密钥在场(**同步版**,读装配时那份快照)。 */
  accountsWithKeySync: (pid: string) => Array<{ credentialRef: string; username: string; hasKey: boolean; keyFp: string | null }>;
  /** 账户 + 密钥在场(打 vault)。 */
  accountsWithKey: (pid: string) => Promise<Array<{ credentialRef: string; username: string; hasKey: boolean; keyFp: string | null }>>;
  /** 上游目录 ∪ 已登记(渠道页口径)。sensenova 域的 getSensenovaModels 用它。 */
  mergedChannelModels: (pid: string) => CatalogModel[];
  /** 目录内存缓存(账号 → 结果)。sensenova 域 peeking 用。 */
  chCatalogCache: Map<string, { fetchedAtMs: number; result: CatalogResult }>;
  /** 额度内存快照(credentialKey → {fetchedAtMs, snapshot});渠道页卡头聚合读它。 */
  chQuotaCache: Map<string, { fetchedAtMs: number; snapshot: QuotaSnapshot }>;
  /** 目录冷却闸门(账号 → 上次拉取时刻)。 */
  chCatalogGate: Map<string, number>;
  /** 拉上游模型目录(带冷却/单飞)。 */
  chAwaitCatalog: (pid: string, username: string, force?: boolean) => Promise<CatalogResult>;
  /** 目录落库(只更新不插入)。 */
  mergeCatalog: (pid: string, entries: CatalogEntry[], baseUrl: string | null, protocol: string) => number;
  methods: {
    fetchModels(
      id: string,
      force?: boolean,
      decl?: { baseUrl?: string | null; protocol?: string | null } | null,
    ): Promise<ApiResult>;
    setChannelModels(provider: string, models: ChannelModelSpec[]): Promise<ApiResult>;
    /**
     * 单行实时保存(用户 2026-10-31 定案:四页删掉保存按钮,勾选/改格即落库)。
     *
     * ⚠️ 与 `setChannelModels` 的**整批替换**语义不同:整批是「清单外 = 删行」,
     * 一次只提交一行时那样做会把其余所有模型全删掉。所以这里按 (provider, model)
     * 单行 upsert;`patch.exposed === false` 才删这一行。
     */
    setChannelModel(provider: string, patch: ChannelModelPatch): Promise<ApiResult>;
    checkModel(provider: string, model: string): Promise<ApiResult>;
    checkModels(id?: string): Promise<ApiResult>;
    getQuota(): Promise<QuotaRead>;
    getProviderPage(provider: string, fresh?: boolean): Promise<ProviderPage>;
    getChannelAccounts(provider: string): Promise<ChannelAccount[]>;
    /**
     * 单渠道签到状态。
     *
     * `index` 给了就查**那一个账号**(2026-11-09:trae 概览改成逐账号查);
     * 没给则返回「代表账号」的状态(序号最小的带令牌账号)。
     */
    checkinStatus(provider: string, index?: number): Promise<ChannelCheckin>;
    checkinClaim(provider: string, confirm: boolean, index?: number): Promise<ApiResult>;
    refreshStatus(provider: string): Promise<ChannelRefreshStatus>;
    refreshRun(provider: string, confirm: boolean, index?: number): Promise<ApiResult>;
    syncChannel(provider: string, force?: boolean): Promise<ApiResult>;
    /**
     * **只刷新额度/积分**(2026-11-07 拆分语义):打开渠道页/点「刷新」走这条,
     * 不拉模型目录、不签到。
     */
    syncChannelQuota(provider: string, force?: boolean): Promise<ApiResult>;
    /**
     * **只拉模型目录**(2026-11-07 拆分语义):展开渠道卡片时才调,不刷额度、不签到。
     */
    syncChannelCatalog(provider: string, force?: boolean): Promise<ApiResult>;
    /** **批量只刷额度**(打开渠道页入口);不拉目录、不签到。 */
    syncAllQuota(force?: boolean): Promise<ApiResult>;
    getClientPaths(): Promise<ClientPathsResult>;
    saveClientPath(channel: string, path: string): Promise<ApiResult>;
    detectClientPath(channel: string): Promise<ApiResult>;
    discoverChannelAccounts(provider: string): Promise<DiscoverChannelResult>;
    adoptChannelAccount(
      provider: string,
      username: string,
      token: string,
      region?: string,
      /** 发现阶段的身份字段(device_id/user_id/edition…),整包写进 raw。 */
      extra?: Record<string, unknown>,
    ): Promise<ApiResult>;
  };
}

const chQuotaCache = new Map<string, { fetchedAtMs: number; snapshot: QuotaSnapshot }>();
const chQuotaGate = new Map<string, number>();
const chQuotaInflight = new Map<string, Promise<QuotaSnapshot | null>>();

/**
 * 运行期额度快照表(按 `provider/username` 索引)→ 调度器 due-first 的 T3 排序键。
 *
 * ⚠️ 为什么要有这一步:due-first 的 T3 消耗档按**到期时间**升序排,
 * trae/workbuddy 的到期时间是探针**实时读**出来的(`probe_*_quota` 的
 * expires_at),配置里没有;`AppSchedulerRepo.quotas()` 原先恒返回 `{}`,
 * 于是 `_expiryOf()` 两个来源全空 → 成员 expiry 全是 null → 排序键完全
 * 并列 → 只能按 members 数组序选(用户实测:永远走 trae 不走 workbuddy)。
 *
 * key 形状天然同构:这里 `credentialKey(p,u)` = `"p/u"`,调度侧
 * `quotaKey(row)` = `cred[0]/cred[1]`(credential_key 元组)。取
 * `snapshot.credentialKey` 而不是 Map 的键,保证与 QuotaSnapshot 自带字段一致。
 *
 * ⚠️ 类型:collector 的 `QuotaSnapshot` 用 `number | null` 表示「没读到」,
 * 调度器的同名接口用 `?: number`(缺省)。null 在调度侧等同于「没有」,
 * 所以这里做一次收敛:`null` → 不写该字段。不转的话
 * `Record<string, collector.QuotaSnapshot>` 赋不进
 * `Record<string, scheduler.QuotaSnapshot>`(TS2416)。
 *
 * ⚠️ 定义在模块顶层而不是 `createPanel` 里:`assemble()` 构造 AppSchedulerRepo
 * (第 877 行的 `quotaSnapshot` 注入)比 createPanel 早,够不到后者内部的作用域。
 */
/**
 * 渠道额度缓存 → 调度器的额度表。
 *
 * ⚠️ 除了 `chQuotaCache`(trae/workbuddy/minimax/qoder 的探针结果),
 * 这里还**补上 sensenova 通用池的窗口剩余比例**(2026-11-10 用户定案):
 * sensenova 不走 `CH_QUOTA_PROVIDERS` 那套探针,但它的通用池把
 * deepseek / glm / kimi 绑在同一份额度里 —— 闸门需要知道「这个账号还剩百分之几」
 * 才能决定要不要跳过 glm/kimi 这类贵模型。
 */
export function chQuotaTableForScheduler(): Record<string, SchedulerQuotaSnapshot> {
  const out: Record<string, SchedulerQuotaSnapshot> = {};
  const snapshots: QuotaSnapshot[] = [];
  for (const { snapshot } of chQuotaCache.values()) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const k = snapshot.credentialKey;
    if (typeof k !== "string" || k === "") continue;
    snapshots.push(snapshot);
    const row: SchedulerQuotaSnapshot = {};
    if (typeof snapshot.remaining === "number") row.remaining = snapshot.remaining;
    if (typeof snapshot.limit === "number") row.limit = snapshot.limit;
    if (typeof snapshot.expires_at === "number" && snapshot.expires_at > 0) {
      row.expires_at = snapshot.expires_at;
    }
    if (typeof snapshot.fetched_at === "number") row.fetched_at = snapshot.fetched_at;
    if (snapshot.error !== null) row.error = snapshot.error;
    out[k] = row;
  }
  // 多账号渠道再加一行 **provider 级聚合**(键 = 裸 provider id):
  // 到期取最早、积分取总和(用户 2026-10-30 定案)。
  // 调度侧 `_expiryOf()` 在凭据级快照拿不到到期时回落到这一行,详见 quotaRollupOf。
  for (const [provider, rollup] of quotaRollupOf(snapshots)) {
    out[provider] = {
      remaining: rollup.remaining ?? undefined,
      limit: rollup.limit ?? undefined,
      expires_at: rollup.expires_at ?? undefined,
      fetched_at: rollup.fetched_at ?? undefined,
    };
  }
  // ── sensenova:窗口剩余比例(2026-11-10 用户定案)──────────────
  //
  // 键用 `sensenova/<username>`,正好是调度器的 quotaKey(`provider/username`)。
  // 数据源是 sensenova 域刷新时写的模块级 `snRatioCache`(见 sensenova.ts)。
  // ⚠️ 只补 w5_ratio / w7_ratio,**不覆盖** remaining/limit(那些字段在 sensenova
  // 这条路上本来就没有,别伪造)。
  for (const [username, ratios] of snPoolRatiosTable()) {
    const k = `sensenova/${username}`;
    const prev = out[k] ?? {};
    out[k] = {
      ...prev,
      ...(ratios.w5 !== null ? { w5_ratio: ratios.w5 } : {}),
      ...(ratios.w7 !== null ? { w7_ratio: ratios.w7 } : {}),
    };
  }
  return out;
}

/** provider 级额度聚合:到期取**最早**、积分/上限取**总和**。 */
export interface QuotaRollup {
  /** 该 provider 下所有账号里最早的到期(epoch 秒);一个都没有则 null。 */
  expires_at: number | null;
  /** 所有账号剩余额度之和(只累加有数字的账号);一个都没有则 null。 */
  remaining: number | null;
  /** 所有账号额度上限之和(同上)。 */
  limit: number | null;
  /** 最近一次拉取时刻里最新的那个(epoch 秒)。 */
  fetched_at: number | null;
  /** 参与聚合的账号数。 */
  accounts: number;
}

/**
 * 把逐账号额度快照折叠成 provider 级聚合。
 *
 * 为什么这么折(用户 2026-10-30 定案「多账号的情况下,给调度策略注入的到期时间取最早值,
 * 积分取总和」):
 * - **到期取最早**:同一个 provider 的 N 个号里,最早过期的那个号一旦失效,这个 provider
 *   在 due-first 的 T3 消耗档里就该往后排 —— 用最晚的到期会假装自己还有很久可用。
 * - **积分取总和**:账号池能花的额度是各号之和;取第一个号或取最小值都是谎报。
 *
 * `credentialKey` 形如 `"provider/username"`,取 `/` 前那段当 provider。
 */
export function quotaRollupOf(snapshots: Iterable<QuotaSnapshot>): Map<string, QuotaRollup> {
  const out = new Map<string, QuotaRollup>();
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const key = snapshot.credentialKey;
    if (typeof key !== "string" || key === "") continue;
    const provider = key.split("/")[0] ?? "";
    if (provider === "") continue;
    const cur: QuotaRollup = out.get(provider) ?? {
      expires_at: null,
      remaining: null,
      limit: null,
      fetched_at: null,
      accounts: 0,
    };
    cur.accounts += 1;
    // 有 error 的快照仍然参与聚合:它可能只是这一次探针失败,
    // 而 remaining/expires_at 是上一轮的真值。把失败账号整条丢掉会让总和偏小。
    if (typeof snapshot.remaining === "number") {
      cur.remaining = (cur.remaining ?? 0) + snapshot.remaining;
    }
    if (typeof snapshot.limit === "number") {
      cur.limit = (cur.limit ?? 0) + snapshot.limit;
    }
    if (typeof snapshot.expires_at === "number" && snapshot.expires_at > 0) {
      cur.expires_at =
        cur.expires_at === null ? snapshot.expires_at : Math.min(cur.expires_at, snapshot.expires_at);
    }
    if (typeof snapshot.fetched_at === "number" && snapshot.fetched_at > 0) {
      cur.fetched_at =
        cur.fetched_at === null ? snapshot.fetched_at : Math.max(cur.fetched_at, snapshot.fetched_at);
    }
    out.set(provider, cur);
  }
  return out;
}

export function createChannelsDomain(
  ctx: PanelContext,
  deps: ChannelsDomainDeps,
): ChannelsDomain {
  // trae 自动采纳(traeAutoAdopt)的 TTL 状态:上次扫描时刻(ms)与上次结果文案。
  let lastTraeAdoptScanMs = 0;

  // 同步域(第十二刀):额度/目录/客户端路径探针 → assembly-channels-sync.ts
  const chSync = createChannelsSyncDomain(ctx, { chQuotaCache, chQuotaGate, chQuotaInflight });
  const {
    chQuotaCooldownMs,
    chQuotaFetch,
    catalogCooldownStateOf,
    chMaybeFetchQuota,
    chAwaitQuota,
    catalogAccountOf,
    chCatalogCache,
    chCatalogGate,
    chCatalogInflight,
    chCatalogFetch,
    chAwaitCatalog,
    catalogFetchedAt,
    catalogRows,
    catalogRowsOf,
    probeProviderModels,
    serializeReasoningEfforts,
    mergeCatalog,
    modelsSourceOf,
    chCreditsOf,
    safeExists,
    probeClientPath,
    getClientPathsImpl,
  } = chSync;

  let lastTraeAdoptMsg = "";

  /**
   * trae 计费/签到接口的身份门禁(实测,非猜测):只认**桌面版** storage.json
   * 签发的 JWT —— claims 里 `data.source === "refresh_token"`。CLI 版 token
   * 虽同 user_id、也能走 ExchangeToken 刷新,但打 `/pay/web_user_ent_usage`
   * 与 `/checkin_credits/status` 一律 401 code 1001
   * "We're sorry, but we are not able to authenticate you"。
   *
   * ⚠️ 这只是**必要不充分**条件:2026-10-22 实测,桌面版 token 也会被上游整体
   * 吊销(用户在 Trae 客户端重登过一次 → 旧会话整对失效,连 storage.json 里
   * 的 refreshToken 都变成 invalid)。所以采纳后还要真打一次计费接口自检,
   * 见 autoAdoptTrae 里的 traeTokenWorks。
   *
   * 所以自动采纳只收合格登录态;本机只有 CLI token 时不动库(留着还能聊天),
   * 但会在面板留一句说明,免得用户对着 401 莫名其妙。
   */
  const traeTokenBillingEligible = (token: string): boolean => {
    try {
      const seg = token.split(".")[1];
      if (!seg) return false;
      const payload = JSON.parse(Buffer.from(seg, "base64url").toString("utf8")) as {
        data?: { source?: unknown } | null;
      };
      return payload?.data?.source === "refresh_token";
    } catch {
      return false;
    }
  };

  // ── 3.1 sensenova 连接器账号池注入 ───────────────────────────────────────
  // 连接器层账号池(Nexus sensenova.py 的 AccountPool):网关每次请求按
  // 「429 同号硬等 → 烧够 TPM 才换号 → 冷却按 (账号,模型) 分格」挑账号。
  // 池是进程内运行态(不可序列化),凭据以库为唯一真源 —— 所以这里只在
  // 启动时播种一次,后续凭据变化由 syncSensenovaPool() 增量对齐。

  /**
   * 采纳前自检:拿候选 token 真打一次计费接口。401/鉴权失败 → 这个登录态
   * 已被上游拒绝(吊销/风控),写进库只会让用户对着 401 莫名其妙,不如不采纳
   * 并提示去 Trae 客户端重新登录。
   *
   * 只对**桌面版**候选跑这一步(CLI 已知不合格,省一次请求);网络抖动等
   * 非鉴权错误一律放过(不能因为一次超时就把好凭据拒了)。
   */
  const traeTokenWorks = async (token: string, extras: Record<string, unknown> | undefined): Promise<boolean> => {
    try {
      await probe_trae_quota({
        credentialKey: "trae-selfcheck",
        provider: "trae",
        username: "selfcheck",
        token,
        extras,
        region: "cn",
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 鉴权失败的特征:上游把 401 带在 200 响应体里(code 1001),probe 只在
      // HTTP >= 400 时抛错 —— 所以这里两种形态都要认。
      if (/HTTP 401|code["\s:]*1001|authenticate you/i.test(msg)) return false;
      return true; // 超时/网络/其他 → 不阻断采纳(下轮还能再试)
    }
  };

  /**
   * trae 自动采纳(m02117「自然是希望自动完成登录」)。
   *
   * ⚠️ 自动登录的边界:只在**库里有凭据、本机能发现到同账号登录态、且 token
   * 与库里不同**时采纳。三条件缺一就不动 —— 不凭空建账号(那是「自动发现」按钮
   * 的活),也不覆盖用户改过的凭据(库里没有这账号就不管)。
   *
   * 调用点:getProviderPage / getChannelAccounts 每次读都跑一遍;开面板就会
   * 顺带对齐一次本机登录态(参考插件 #29 的 liveLogin 方案:「检测到本机登录态
   * 比存储的新 → 自动采用」,本实现直接自动写入而非提示一键切换)。
   */
  const autoAdoptTrae = async (pid: string): Promise<string> => {
    if (pid !== "trae") return "";
    // ⚠️ TTL 冷却:本机扫描是磁盘 IO(storage.json 解密),面板轮询/连点会
    // 高频触发 getProviderPage —— 30s 内只真扫一次,其余直接跳过。
    const nowMs = Date.now();
    if (nowMs - lastTraeAdoptScanMs < 30_000) return lastTraeAdoptMsg;
    lastTraeAdoptScanMs = nowMs;
    lastTraeAdoptMsg = ""; // 每轮重算:上一轮的「已采用/只有 CLI」结论过期就撤
    let adopted = 0;
    let rejectedAuth = 0; // 桌面版 token 但被上游拒绝(吊销/风控)的个数
    try {
      const creds = await ctx.vault.list("trae").catch(() => []);
      if (creds.length === 0) return "";
      const found = discoverTraeAccounts();
      // 计费/签到门禁:只采纳桌面版登录态(CLI token 会 401)。一个本机账号
      // 可能同时被 CLI 与桌面版扫到,先按合格性排序 —— 桌面版永远优先,
      // CLI 只在没有任何桌面版登录态时才考虑(仍然不写库,只提示)。
      const ranked = [...found].sort((a, b) =>
        Number(traeTokenBillingEligible(b.token ?? "")) - Number(traeTokenBillingEligible(a.token ?? "")),
      );
      for (const acc of ranked) {
        if (!acc.token) continue;
        if (!traeTokenBillingEligible(acc.token)) {
          // CLI 版 token:计费/签到接口不认。不覆盖库里可能更好的凭据。
          continue;
        }
        // 本机登录态账号(CLI 的 username = user_id;桌面版 username = 昵称)。
        const uid = acc.user_id ?? acc.username ?? "";
        // 匹配库里同账号:优先 user_id/uid 一致,退而求 username 一致。
        const match = creds.find((c) => {
          const rawUid = strOf(c.raw, "uid") ?? strOf(c.raw, "user_id");
          return (uid !== "" && (rawUid === uid || c.username === uid)) || c.username === acc.username;
        });
        if (!match) continue;
        const secret = await ctx.vault.secret("trae", match.username);
        if (secret === acc.token) continue; // 已是最新
        // 采纳前自检:桌面版 token 也可能被上游整体吊销(2026-10-22 实测:
        // 用户在 Trae 客户端重登一次,旧会话 access+refresh 整对失效)。
        // 不写进库 —— 否则用户对着 401 莫名其妙,还不如留一句明确提示。
        const selfExtras: Record<string, unknown> = { ...(match.raw ?? {}) };
        if (acc.extra && typeof acc.extra === "object") {
          for (const [k, v] of Object.entries(acc.extra)) {
            if (v !== null && v !== undefined) selfExtras[k] = v;
          }
        }
        const selfOk = await traeTokenWorks(acc.token, selfExtras);
        if (!selfOk) {
          rejectedAuth += 1;
          continue;
        }
        // 采纳:镜像 adoptChannelAccount 的写库语义(secret + raw 合并)。
        const raw: Record<string, unknown> = {
          ...(match.raw ?? {}),
          source: "discover",
          adopted_at_ms: wallNow() * 1000,
          last_refresh: null,
        };
        if (acc.region) raw.region = acc.region;
        if (acc.edition) raw.edition = acc.edition;
        if (acc.host) raw.host = acc.host;
        if (acc.user_id) {
          raw.user_id = acc.user_id;
          raw.uid = acc.user_id;
        }
        if (acc.token_expires_at_ms) raw.token_expires_at_ms = acc.token_expires_at_ms;
        if (acc.extra && typeof acc.extra === "object") {
          for (const [k, v] of Object.entries(acc.extra)) {
            if (v !== null && v !== undefined) raw[k] = v;
          }
        }
        // 桌面版登录态带 refresh_token → 一并写 refreshSecret 列,刷新链路才完整。
        const refreshToken =
          acc.extra && typeof acc.extra === "object" && typeof acc.extra.refresh_token === "string"
            ? acc.extra.refresh_token
            : undefined;
        await ctx.vault.put({
          provider: "trae",
          username: match.username,
          secret: acc.token,
          ...(refreshToken !== undefined ? { refreshSecret: refreshToken } : {}),
          raw,
        });
        adopted += 1;
      }
      // 本机只有 CLI 版登录态(没有任何桌面版 storage.json 登录态)时,提醒一句
      // —— 否则用户会对着计费页的 401 一脸懵。
      const cliOnly = found.some((a) => a.token && !traeTokenBillingEligible(a.token)) &&
        !found.some((a) => a.token && traeTokenBillingEligible(a.token));
      if (adopted === 0 && cliOnly) {
        lastTraeAdoptMsg =
          "trae 计费/签到接口只认桌面版 Trae 登录态;本机当前只有 CLI token(无法用于额度与签到,聊天仍可用)—— 请在 Trae 桌面客户端登录";
      }
      // 桌面版 token 也被上游拒绝 → 明确说「重登」,不要留个空白让用户猜。
      if (adopted === 0 && rejectedAuth > 0) {
        lastTraeAdoptMsg =
          "本机 Trae 桌面版登录态已被上游拒绝(计费/签到接口返回认证失败)—— 请在 Trae 桌面客户端重新登录,登录后本页会自动采用新令牌";
      }
    } catch {
      /* 自动采纳失败不影响读(下轮再试)。 */
    }
    if (adopted === 0) {
      return lastTraeAdoptMsg;
    }
    ctx.syncRegistry(); // 新凭据 = 新账户行,索引要跟上
    lastTraeAdoptMsg = `已自动采用本机最新登录态(trae,${adopted} 个账号)`;
    return lastTraeAdoptMsg;
  };

  /**
   * 某 provider 的账户(含密钥在场信息)——**同步版**。
   *
   * 装配时已一次性探测过各账号的密钥在场情况({@link secretPresence}),
   * 面板读数路径全是同步的(契约方法不是 async),所以这里读那份快照而不打 vault。
   */
  const accountsWithKeySync = (pid: string): Array<{ credentialRef: string; username: string; hasKey: boolean; keyFp: string | null }> => {
    const out: Array<{ credentialRef: string; username: string; hasKey: boolean; keyFp: string | null }> = [];
    for (const account of ctx.registry.listAccounts(pid)) {
      const [p, u] = splitRef(account.credentialRef);
      out.push({
        credentialRef: account.credentialRef,
        username: u,
        hasKey: ctx.secretPresence.get(`${p}/${u}`) ?? false,
        keyFp: null,
      });
    }
    return out;
  };

  /** 某 provider 的账户(含密钥在场信息)。 */
  const accountsWithKey = async (pid: string): Promise<Array<{ credentialRef: string; username: string; hasKey: boolean; keyFp: string | null }>> => {
    const out: Array<{ credentialRef: string; username: string; hasKey: boolean; keyFp: string | null }> = [];
    for (const account of ctx.registry.listAccounts(pid)) {
      const [p, u] = splitRef(account.credentialRef);
      const summary = await ctx.vault.describe(p, u);
      const secret = summary ? await ctx.vault.secret(p, u) : null;
      out.push({
        credentialRef: account.credentialRef,
        username: u,
        hasKey: summary !== null,
        keyFp: fpOf(secret),
      });
    }
    return out;
  };

  /** 某 provider 的 credential 行转 ChannelAccount[](来源 = credential 表)。 */
  const channelAccountsOf = async (pid: string): Promise<ChannelAccount[]> => {
    const creds = await ctx.vault.list(pid);
    const out: ChannelAccount[] = [];
    for (let i = 0; i < creds.length; i++) {
      const s = creds[i];
      const secret = await ctx.vault.secret(pid, s.username);
      const region = typeof s.raw?.region === "string" ? (s.raw.region as string) : null;
      out.push({
        index: i,
        // 左侧只写用户名(用户 2026-10-30 定案),完整键另存 —— 见 ChannelAccount 注释。
        label: s.username,
        credential_key: s.key,
        key_fp: fpOf(secret),
        region,
        source: "credential 表",
        token_expires_at_ms: s.expiresAt !== null ? Math.round(s.expiresAt * 1000) : null,
        refresh_expires_at_ms: null,
        last_refresh: null,
      });
    }
    return out;
  };

  // ── 渠道签到:镜像 nexus/checkin.py(Nexus CHECKIN_PROVIDERS = trae/workbuddy)──

  /** 签到计费基址:有则用(渠道页配置的 API 地址覆盖),无则交给 core 默认端点
   *  (trae → TRAE_PAY_BASE_CN,workbuddy → wbBillingBase(domain))。 */
  const checkinBaseOf = (pdef: { baseUrl?: string | null } | null): string | null => {
    if (!pdef) return null;
    const base = pdef.baseUrl?.trim().replace(/\/+$/, "");
    return base && base.length > 0 ? base : null;
  };

  /** raw 里某个字符串字段(trim 后非空才取)。 */
  const rawStrOf = (raw: Record<string, unknown>, key: string): string | null => {
    const v = raw[key];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  };


  /** 某 provider 的全部凭据行 → 签到输入(Nexus load_accounts 同源字段)。 */
  const checkinAccountsOf = async (pid: string): Promise<CheckinInputAccount[]> => {
    const creds = await ctx.vault.list(pid);
    const out: CheckinInputAccount[] = [];
    for (let i = 0; i < creds.length; i++) {
      const s = creds[i];
      const raw = s.raw ?? {};
      out.push({
        index: i,
        username: s.username,
        token: await ctx.vault.secret(pid, s.username),
        region: rawStrOf(raw, "region"),
        domain: rawStrOf(raw, "domain"),
        uid: rawStrOf(raw, "uid") ?? rawStrOf(raw, "user_id"),
        enterprise_id: rawStrOf(raw, "enterprise_id"),
        extra: raw,
      });
    }
    return out;
  };


  /** 失败消息:类型名 + 原因(Nexus `f"{TypeName}: {exc}"[:300]`)。 */
  const checkinErrText = (err: unknown): string => {
    if (err instanceof Error) {
      return `${err.constructor.name}: ${err.message}`.slice(0, 300);
    }
    return String(err).slice(0, 300);
  };

  /** 逐账号领取(Nexus checkin_claim 的 per-account 循环;彼此独立,互不遮蔽)。 */
  const checkinClaimOne = async (
    pid: string,
    protocol: string,
    acc: CheckinInputAccount,
    base: string | undefined,
    confirm: boolean,
  ): Promise<CheckinClaimRow> => {
    const baseRow = { index: acc.index, provider: pid, username: acc.username, region: acc.region };
    if (protocol === "minimax") {
      // 走 minimaxAccountFor:401 时自动 refresh 续期并重试(签到/领取都要)。
      const bound = await minimaxAccountFor(ctx.vault, pid, acc.username);
      if (bound === null) {
        return { ...baseRow, status: "failed", message: "该账号没有可用令牌" };
      }
      const account = bound.account;
      const httpOpts = { timeoutMs: MINIMAX_QUOTA_TIMEOUT_MS, ...bound.httpOptions };
      try {
        // 先读面板:已签则不再打 claim(上游幂等,但省一次写请求),未确认只报告。
        const st = await minimaxSigninStatus(account, httpOpts);
        if (panelClaimedToday(st)) {
          const got = panelTodayPoints(st);
          return {
            ...baseRow,
            status: "already",
            message: got > 0 ? `今日已签,当日积分 ${got}` : "今日已签",
          };
        }
        const due = panelTodayPoints(st);
        if (!confirm) {
          return {
            ...baseRow,
            status: "dry_run",
            would_claim: true,
            daily_credit: due,
            message: `未签到,今日可领 ${due} 积分(未确认,不写)`,
          };
        }
        // 真领取。上游幂等:今日已领会回 claim_result=2,不是错误。
        const res = await minimaxSigninClaim(account, httpOpts);
        if (res.result === 2) {
          return { ...baseRow, status: "already", message: "今日已签(上游回报重复领取)" };
        }
        if (res.result === 1) {
          return {
            ...baseRow,
            status: "claimed",
            credit: res.points,
            message: `领取成功,获得 ${res.points} 积分${
              res.dayNo > 0 ? `(第 ${res.dayNo} 天)` : ""
            }`,
          };
        }
        return { ...baseRow, status: "failed", message: `领取返回异常结果 ${res.result}` };
      } catch (err) {
        return { ...baseRow, status: "failed", message: checkinErrText(err) };
      }
    }
    if (protocol === "trae") {
      // Nexus 不预查令牌(会带空令牌打上游);As One 先短路,避免无用写请求。
      if (!acc.token) {
        return { ...baseRow, status: "failed", message: "该账号没有可用令牌" };
      }
      try {
        const res = await traeCheckinClaim(
          {
            index: acc.index,
            username: acc.username,
            token: acc.token,
            region: acc.region,
            // ⚠️ 不传 device_id(resolveTraeDevice 一律按 token 派生):
            // raw 里的真机指纹同机共享,会让多账号被上游判定成同一设备,
            // 每日签到只有第一个能领(2026-11-09 用户实测定案)。
            extra: acc.extra,
          },
          { baseUrl: base ?? undefined, confirm },
        );
        const status: CheckinClaimRow["status"] = res.claimed
          ? "claimed"
          : res.already_checked_in || res.device_checked_in
            ? "already"
            : !res.enabled
              ? "skipped"
              : res.would_claim
                ? "dry_run"
                : "failed";
        // 领取成功要说清领到了什么(「签到成功没有提示」的一半原因就是这行只有
        // 一个「领取成功」,页面拿到后也没什么可展示的)。
        // ⚠️ **9074(上游拥挤)要给出可操作的下一步**(2026-11-09):用户看到
        // 「当前参与用户太多,请稍后再试(已重试 3 次仍失败)」会以为签到坏了。
        // 其实这是上游高峰限流 —— 隔几分钟再点一次就好,账号本身没问题。
        const crowded = !res.claimed && res.code === TRAE_CODE_CROWDED;
        const message = res.claimed
          ? `领取成功${res.checkin.credits > 0 ? `,当前积分 ${res.checkin.credits}` : ""}${
              res.retries > 0 ? `(上游拥挤,重试 ${res.retries} 次后成功)` : ""}`
          : crowded
            ? "上游当前拥挤(高峰限流),稍后重试即可 —— 账号本身没有问题"
            : res.message;
        return {
          ...baseRow,
          status,
          message,
          would_claim: res.would_claim || undefined,
          credit: res.checkin.credits || undefined,
          // 供 checkinClaim 做**设备级短路**:同机多账号时,第一个签上之后
          // 后面的账号直接 skipped,不再打上游(2026-11-10 实测定案)。
          device_checked_in: res.device_checked_in || undefined,
        };
      } catch (err) {
        return { ...baseRow, status: "failed", message: checkinErrText(err) };
      }
    }
    // workbuddy —— Nexus 顺序:区域门禁 → 令牌 → status → 短路 → claim
    if (checkinWbRegionOf(acc.domain) !== "cn") {
      return { ...baseRow, status: "skipped", message: "国际版无签到(订阅制,额度走 payStatus)" };
    }
    if (!acc.token) {
      return { ...baseRow, status: "failed", message: "该账号没有可用令牌" };
    }
    try {
      const st = await wbCheckinStatus(
        { index: acc.index, username: acc.username, token: acc.token, domain: acc.domain, uid: acc.uid, enterprise_id: acc.enterprise_id },
        { baseUrl: base ?? undefined },
      );
      if (!st.active) {
        return { ...baseRow, status: "skipped", message: "该账号未启用签到活动", streak_days: st.streak_days };
      }
      if (st.today_checked_in) {
        return {
          ...baseRow,
          status: "already",
          message: `今日已签到${st.streak_days > 0 ? ` · 连续 ${st.streak_days} 天` : ""}`,
          streak_days: st.streak_days,
        };
      }
      if (!confirm) {
        return {
          ...baseRow,
          status: "dry_run",
          message: "可领取(未确认,未发出领取请求)",
          would_claim: true,
          daily_credit: st.daily_credit,
        };
      }
      const res = await wbCheckinClaim(
        { index: acc.index, username: acc.username, token: acc.token, domain: acc.domain, uid: acc.uid, enterprise_id: acc.enterprise_id },
        { baseUrl: base },
      );
      // 与 trae 同款:成功要说清领到了什么,不能只有一个「领取成功」。
      const message = `领取成功${res.credit > 0 ? `,获得 ${res.credit} 积分` : ""}${
        res.streak_days > 0 ? ` · 连续 ${res.streak_days} 天` : ""}`;
      return { ...baseRow, status: "claimed", message, credit: res.credit, streak_days: res.streak_days };
    } catch (err) {
      return { ...baseRow, status: "failed", message: checkinErrText(err) };
    }
  };

  /**
   * 目录行 → 契约 CatalogModel。
   *
   * ⚠️ **`exposed` 的语义按页面分家**(Nexus `api.ts` 的 CatalogModel docstring):
   * - **渠道页 / 兼容供应商页**:`exposed` = **在 `real_model` 表里**(勾上 ⇔
   *   有这一行;取消勾选 = 删掉这一行,2026-10-12 渠道页定、10-13 供应商页对齐)。
   *   所以这里第 4 参传的是 `registered`,**不是** `!mv.hidden`;
   * - **部署页 / 模型总览**:那一列才是 D28 的 `hidden`(只决定是否出现在
   *   `/v1/models`,取消后仍可调用),由 `listed` / `hidden` 两个字段承担。
   *
   * ⚠️ 曾经这里传 `!mv.hidden`,后果是:已登记但被用户取消列入的模型在渠道页
   * 显示成**未勾选**,用户一保存就把那几行从 `real_model` 真删掉 ——
   * 「不列入 /v1/models」被错搞成「从模型表移除」,两套语义混成一锅。
   */
  const catalogModel = (
    mv: ModelView,
    accountsCount: number,
    usableCount: number,
    exposed: boolean,
  ): CatalogModel => ({
    id: `${mv.provider}/${mv.model}`,
    name: mv.name ?? mv.model,
    exposed,
    listed: !mv.hidden,
    hidden: mv.hidden,
    available: true,
    vision: mv.supportsVision,
    context_window: mv.maxInputTokens,
    max_output: mv.maxOutputTokens,
    rate: null,
    registered: mv.registered,
    callable: mv.registered && usableCount > 0,
    origin: null,
    endpoints: accountsCount,
    usable_endpoints: usableCount,
    default_vision: null,
    default_context: null,
    default_output: null,
    supported_reasoning_efforts: mv.supportedReasoningEfforts,
    reasoning_allows_off: mv.reasoningAllowsOff,
  });

  /**
   * 渠道页 / 兼容供应商页的模型表 —— **上游目录 ∪ 已登记**,逐字段对齐
   * Nexus `api_pages.py:_merge_catalog`。
   *
   * ⭐ **勾选态 = 在 `real_model` 表里**(`registered`),**不是** `!hidden`。
   * Nexus 的注释把这件事的后果写得很直白:
   *   > 若退回 `not hidden`,一个被部署页设成 hidden 的模型会显示成未勾,
   *   > 用户只是打开页面点一下保存,它就被当成「取消勾选」**删掉了**。
   * As One 曾经正是这么写的(`catalogModel(mv, …, !mv.hidden)`),后果:
   * workbuddy 5 个已登记模型里有 3 个被部署页取消列入,渠道页就把它们显示成
   * 未勾选 —— 用户一保存,那 3 行从 `real_model` 真删掉。两个页面的勾选
   * **语义相反**(渠道页删行、部署页只翻 `hidden`),绝不能共用一个判据。
   *
   * 另外两条口径:
   * - 上游目录给出「现在有什么」;已登记给出「本机在用什么」。两边都要,
   *   缺一边就会出现「上游新模型永远不出现」或「目录挂了模型全消失」。
   * - 上游没给的字段**不**回填已保存的声明(用户明确写下的值,悄悄改掉
   *   等于「保存了但没生效」);只有「库里空 + 上游有值」才用上游值顶上,
   *   否则表单绑定空值、placeholder 显示上游值,保存后库里永远是 null。
   */
  const mergedChannelModels = (pid: string): CatalogModel[] => {
    const withKey = accountsWithKeySync(pid);
    const accountsCount = withKey.length;
    const usableCount = withKey.filter((a) => a.hasKey).length;
    const registryMap = deps.realModelMap(pid);
    const upstream: Map<string, CatalogEntry> = catalogRowsOf(pid);

    const out: CatalogModel[] = [];
    const seen = new Set<string>();

    // 上游目录行(按模型名排序,与 Nexus `sorted(upstream)` 一致)
    for (const [model, up] of [...upstream.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      seen.add(model);
      const mv = registryMap.get(`${pid}/${model}`);
      out.push({
        id: `${pid}/${model}`,
        name: (mv?.name && mv.name.length > 0 ? mv.name : up.name && up.name.length > 0 ? up.name : model),
        exposed: mv !== undefined, // 勾选 ⇔ 表里有这一行
        hidden: mv ? mv.hidden : null,
        listed: mv !== undefined,
        available: mv !== undefined || up.vision !== undefined,
        vision: mv ? mv.supportsVision : up.vision,
        context_window: mv ? mv.maxInputTokens : null,
        // 库里空 + 上游有值 → 用上游值顶上(见上面第二条口径)
        max_output: (mv?.maxOutputTokens ?? null) || up.max_output || null,
        // 倍率来自上游目录解析(workbuddy credits / trae consumption_rate);
        // 目录没给(或解析失败)才是 null,不硬编码丢弃。
        rate: up.rate ?? null,
        registered: mv !== undefined,
        callable: true,
        origin: up.origin ?? "remote",
        endpoints: mv ? accountsCount : 0,
        usable_endpoints: mv ? usableCount : 0,
        default_vision: up.vision,
        default_context: up.context_window,
        default_output: up.max_output,
        // 能力事实取**库里已登记行的值**(上游目录这一轮没给时目录项本身就是 null,
        // 不会把库里的学习结果冲掉)。
        supported_reasoning_efforts: mv ? mv.supportedReasoningEfforts : up.reasoning_efforts ?? null,
        reasoning_allows_off: mv
          ? mv.reasoningAllowsOff
          : (up.reasoning_allows_off ?? null),
      });
    }

    // 已登记但上游这一轮没列出来的:照样显示。隐藏它们等于让用户以为模型被下架,
    // 而真实原因可能只是远程目录那一路挂了。
    for (const mv of [...registryMap.values()].sort((a, b) =>
      a.model < b.model ? -1 : a.model > b.model ? 1 : 0,
    )) {
      if (seen.has(mv.model)) continue;
      seen.add(mv.model);
      out.push({
        id: `${pid}/${mv.model}`,
        name: mv.name ?? mv.model,
        exposed: true, // 在表里 ⇒ 一律勾着
        hidden: mv.hidden,
        listed: true,
        available: true,
        vision: mv.supportsVision,
        context_window: mv.maxInputTokens,
        max_output: mv.maxOutputTokens,
        rate: null,
        registered: true,
        callable: true,
        origin: "router",
        endpoints: accountsCount,
        usable_endpoints: usableCount,
        default_vision: null,
        default_context: null,
        default_output: null,
        supported_reasoning_efforts: mv.supportedReasoningEfforts,
        reasoning_allows_off: mv.reasoningAllowsOff,
      });
    }
    return out;
  };

  // ── 凭据自动刷新:镜像 nexus/refresh.py 的 refresh_status/refresh_run ──────

  /** 逐渠道最近一次刷新记账(进程内存态;刷新结果本身经 vault 落盘)。 */
  const refreshLedger = new Map<string, {
    /** 本轮刷新**开始**的时刻;null = 从未开始过。刷新进行中也有效(见 doRefreshRun
     *  入口即写),页面「已用 Ns」以它为准 —— 不能用 lastRunAtMs(那是完成锚点,
     *  进行中读到的是旧值或 null,用户实测「刷新计时一直 0 秒」就是这)。 */
    startedAtMs: number | null;
    lastRunAtMs: number | null;
    lastElapsedS: number | null;
    lastOk: boolean | null;
    lastError: string | null;
    result: string | null;
    lastRunAccounts: RefreshAccountRow[];
  }>();

  /** 单飞:同渠道(或同渠道同 index)刷新进行中 → 复用同一 Promise,不打重复上游。
   *  Nexus 手动刷新无冷却窗口(refresh.py 无节流),「避免连点」由这里承担。 */
  const refreshInFlight = new Map<string, Promise<ApiResult>>();

  /** 渠道凭据行(vault.list 顺序 = Nexus 按 provider,username 排序;index 与
   *  channelAccountsOf / getChannelAccounts 一致,渲染层可按行号指定账户)。 */
  const refreshAccountsOf = async (pid: string): Promise<Array<{ index: number; cred: Credential }>> => {
    const creds = await ctx.vault.list(pid);
    const out: Array<{ index: number; cred: Credential }> = [];
    for (let i = 0; i < creds.length; i++) {
      const full = await ctx.vault.get(pid, creds[i].username);
      if (full) out.push({ index: i, cred: full });
    }
    return out;
  };

  /** 单账号刷新行(镜像 Nexus refresh_status 行 / _refresh_one base)。 */
  const refreshRowBase = (index: number, cred: Credential): RefreshAccountRow => ({
    index,
    account: credentialKey(cred.provider, cred.username),
    username: cred.username,
    uid: strOf(cred.raw, "uid"),
    region: strOf(cred.raw, "region"),
    has_refresh_token: cred.refreshSecret !== null && cred.refreshSecret !== undefined,
    token_expires_at_ms: (() => {
      const sec = expiresAtOf(cred);
      return sec !== null ? Math.round(sec * 1000) : null;
    })(),
    needs_refresh: cred.refreshSecret ? needsRefresh(cred, { marginSeconds: REFRESH_MARGIN_S }) : false,
  });

  /** 逐账号刷新(镜像 Nexus _refresh_one):绝不抛异常,状态进行。 */
  const refreshOne = async (
    pid: string,
    index: number,
    cred: Credential,
    confirm: boolean,
  ): Promise<RefreshAccountRow> => {
    const base = refreshRowBase(index, cred);
    if (!cred.secret) {
      return { ...base, status: "failed", message: "该账号没有可用令牌" };
    }
    if (!cred.refreshSecret) {
      return { ...base, status: "skipped", message: "无 refresh token,请在客户端重新登录后重新发现" };
    }
    if (!confirm) {
      return {
        ...base,
        status: "dry_run",
        needs_refresh: needsRefresh(cred, { marginSeconds: REFRESH_MARGIN_S }),
        old_token_fp: fingerprint(cred.secret),
        message: "可刷新(未确认,未发出上游请求)",
      };
    }
    const oldFp = fingerprint(cred.secret);
    let outcome: RefreshOutcome;
    try {
      outcome = pid === "trae"
        ? await refreshTraeToken(cred)
        : pid === "minimax"
          ? await refreshMinimaxToken(cred)
          : await refreshWorkbuddyToken(cred);
    } catch (err) {
      const msg = err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err);
      return { ...base, status: "failed", old_token_fp: oldFp, message: msg.slice(0, 300) };
    }
    // 写回 vault(镜像 save_tokens:secret 立即覆盖;refreshSecret 仅新值覆盖;
    // expires_at 秒;trae solo 的 device_keypair 经 raw 写回)。
    let saved = true;
    let saveError = "";
    try {
      const expiresSec = typeof outcome.expiresAtMs === "number" && Number.isFinite(outcome.expiresAtMs)
        ? outcome.expiresAtMs / 1000
        : undefined;
      await ctx.vault.rotate(pid, cred.username, {
        secret: outcome.accessToken,
        refreshSecret: outcome.refreshToken,
        expiresAt: expiresSec,
      });
      if (outcome.extra && Object.keys(outcome.extra).length > 0) {
        const updated = await ctx.vault.get(pid, cred.username);
        if (updated) {
          await ctx.vault.put({ provider: pid, username: cred.username, raw: { ...updated.raw, ...outcome.extra } });
        }
      }
    } catch (err) {
      saved = false;
      saveError = err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err);
    }
    const status = saved ? "refreshed" : "refreshed_unsaved";
    const messages = saved
      ? ["已写入数据库"]
      : [`落盘凭据失败: ${saveError}`, "已写入数据库"];
    return {
      ...base,
      status,
      old_token_fp: oldFp,
      new_token_fp: fingerprint(outcome.accessToken),
      token_expires_at_ms: typeof outcome.expiresAtMs === "number" && Number.isFinite(outcome.expiresAtMs)
        ? Math.round(outcome.expiresAtMs)
        : null,
      message: messages.join("; "),
    };
  };

  /** 整渠道刷新(镜像 Nexus refresh_run):targets 按 onlyIndex 过滤,逐账号执行。 */
  const doRefreshRun = async (
    pid: string,
    confirm: boolean,
    onlyIndex: number | undefined,
  ): Promise<ApiResult> => {
    const startedAt = Date.now();
    // 入口即写「开始时刻」:刷新进行中 refreshStatus 就能读到它,页面「已用 Ns」
    // 从本轮开始计时。旧实现只在循环结束后 set 整条 entry,进行中读到旧值/null
    // → 用户看到「刷新计时一直 0 秒」。
    const prevEntry = refreshLedger.get(pid);
    refreshLedger.set(pid, {
      ...(prevEntry ?? {
        startedAtMs: null,
        lastRunAtMs: null,
        lastElapsedS: null,
        lastOk: null,
        lastError: null,
        result: null,
        lastRunAccounts: [],
      }),
      startedAtMs: startedAt,
    });
    const accounts = await refreshAccountsOf(pid);
    const targets = onlyIndex === undefined
      ? accounts
      : accounts.filter((a) => a.index === onlyIndex);
    const rows: RefreshAccountRow[] = [];
    for (const t of targets) {
      rows.push(await refreshOne(pid, t.index, t.cred, confirm));
    }
    const elapsedS = Math.round((Date.now() - startedAt) / 100) / 10;
    const refreshed = rows.filter((r) => r.status === "refreshed" || r.status === "refreshed_unsaved").length;
    const ok = refreshed > 0 || (!confirm && rows.length > 0);
    // Nexus message 按 confirm 静态取;index 越界(rows 空)时给诚实文案而非"已刷新"。
    const message = confirm
      ? (rows.length > 0 ? "已刷新" : `没有匹配的账号(index=${onlyIndex})`)
      : "干跑结果(未发出上游请求)";
    refreshLedger.set(pid, {
      startedAtMs: startedAt,
      lastRunAtMs: startedAt,
      lastElapsedS: elapsedS,
      lastOk: ok,
      lastError: !ok && rows.length > 0 ? (rows.find((r) => r.status === "failed")?.message ?? null) : null,
      result: `${ok ? "成功" : "失败"}:${message}(${refreshed}/${rows.length} 个账号)`,
      lastRunAccounts: rows,
    });
    return {
      ok,
      provider: pid,
      confirm,
      count: rows.length,
      refreshed,
      message,
      accounts: rows,
    };
  };


  return {
    accountsWithKeySync,
    accountsWithKey,
    mergedChannelModels,
    chCatalogCache,
    chQuotaCache,
    chCatalogGate,
    chAwaitCatalog,
    mergeCatalog,
    methods: createChannelsMethods(ctx, {
      realModelMap: deps.realModelMap,
      modelViewOf: deps.modelViewOf,
      stripMemberFromLogicalModels: deps.stripMemberFromLogicalModels,
      // Qoder 额度刷新口子(2026-11-09):原样透传,渠道域不自己解引用 ——
      // 装配层用 getter 延迟绑定,创建顺序不再是约束。
      qoderQuotaRefresh: deps.qoderQuotaRefresh,
      // 27 个渠道域闭包(与 assembly-channels-methods.ts 的 ChannelsMethodsDeps 对齐)
      chQuotaCache,
      accountsWithKey,
      autoAdoptTrae,
      catalogCooldownStateOf,
      catalogFetchedAt,
      catalogRows,
      chAwaitCatalog,
      chAwaitQuota,
      chCreditsOf,
      chMaybeFetchQuota,
      channelAccountsOf,
      checkinAccountsOf,
      checkinBaseOf,
      checkinClaimOne,
      doRefreshRun,
      getClientPathsImpl,
      mergeCatalog,
      mergedChannelModels,
      modelsSourceOf,
      probeClientPath,
      probeProviderModels,
      rawStrOf,
      refreshAccountsOf,
      refreshInFlight,
      refreshLedger,
      refreshRowBase,
      safeExists,
      serializeReasoningEfforts,
    }),
  };
}
