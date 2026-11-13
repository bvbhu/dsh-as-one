/**
 * 渠道面板方法域 —— 从 assembly-channels.ts 的 createChannelsDomain 拆出(重构第十一刀)。
 *
 * 职责:17 个渠道面板方法(fetchModels / setChannelModels / checkModel / getQuota /
 * getProviderPage / getChannelAccounts / checkinStatus / checkinClaim / refreshStatus /
 * refreshRun / syncChannel / getClientPaths / saveClientPath / detectClientPath /
 * discoverChannelAccounts / adoptChannelAccount 等)。
 *
 * 结构:createChannelsMethods(ctx, deps) —— 27 个渠道域闭包经 deps 传入并在函数头解构,
 * 方法与原 createChannelsDomain 内逐字一致(含 self 引用 methods.checkinClaim)。
 *
 * 搬来的两个接口(CheckinInputAccount / CheckinClaimRow)在本文件导出 —— 它们在
 * createChannelsDomain 内定义,方法体(和 checkin Claim 闭包)都要用,channels.ts 经
 * `import type` 反向取用,方向 channels → methods,无循环。
 */

import { join } from "node:path";

import type {
  CatalogEntry,
  CatalogResult,
} from "@as-one/core/src/collector/catalog.js";
import type { QuotaSnapshot } from "@as-one/core/src/collector/quota.js";
import { MINIMAX_QUOTA_TIMEOUT_MS } from "@as-one/core/src/collector/quota.js";
// WorkBuddy 首用自检(2026-11-08):「接入」这一步就先探一次,别把坏号放进池。
import { probeWorkbuddyAccount } from "@as-one/core/src/connectors/workbuddy-selfcheck.js";
import {
  CheckinCredentialError,
  CheckinRegionError,
  checkinSupported,
  traeCheckinStatus,
  wbCheckinStatus,
} from "@as-one/core/src/connectors/checkin.js";
import { invalidateCheckinCache } from "./checkin-cache.js";
import { minimaxSigninStatus } from "@as-one/core/src/connectors/minimax-signin.js";
import { minimaxAccountFor } from "./minimax-renew.js";
import { panelClaimedToday, panelTodayPoints } from "@as-one/core/src/connectors/minimax-wire.js";
import { discoverTraeAccounts } from "@as-one/core/src/connectors/discover.js";
import { credentialKey } from "@as-one/core/src/config/credentials.js";
import type { Credential } from "@as-one/core/src/config/types.js";
import { wallNow } from "@as-one/core/src/scheduler/engine.js";
import { defaultConcurrencyOf } from "@as-one/core/src/config/concurrency-defaults.js";
import {
  CH_CATALOG_PROVIDERS,
  CH_QUOTA_PROVIDERS,
} from "./constants.js";
import { refreshSupported } from "./refresh.js";
import { splitRef } from "./utils.js";
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
  ClientPathsResult,
  DiscoverChannelResult,
  ProviderPage,
  QuotaRead,
  RefreshAccountRow,
} from "./types.js";
import type { ModelView } from "./modelview.js";
import type { PanelContext } from "./context.js";


/** 签到用的凭据视图(index 与 ChannelAccount.index 同源,含无令牌行)。 */
export interface CheckinInputAccount {
index: number;
username: string;
token: string | null;
region: string | null;
domain: string | null;
uid: string | null;
enterprise_id: string | null;
extra: Record<string, unknown>;
}


/** 单账号签到行(镜像 Nexus checkin_claim 的行形状)。 */
export interface CheckinClaimRow {
index: number;
provider: string;
username: string;
region: string | null;
status: "claimed" | "already" | "skipped" | "dry_run" | "failed";
message: string;
would_claim?: boolean;
credit?: number;
streak_days?: number;
daily_credit?: number;
/**
 * trae 专有:**本设备**今日已签(上游 9095),不是这个账号自己签过。
 *
 * `checkinClaim` 用它做设备级短路:同机多账号时一天只能签一个,
 * 第一个签上之后,后面的账号直接 `skipped`,不再打上游。
 */
device_checked_in?: boolean;
}


/** 方法域依赖:27 个渠道域闭包 + createPanel 的三个共享闭包(与 ChannelsDomainDeps 同形状)。 */
export interface ChannelsMethodsDeps {
  /** 额度探测缓存(模块级共享,getQuota/getProviderPage 直读)。 */
  chQuotaCache: Map<string, { fetchedAtMs: number; snapshot: QuotaSnapshot }>;
  /** 注册表投影(provider → Map<"provider/model", ModelView>)。 */
  realModelMap: (pid?: string) => Map<string, ModelView>;
  /** 单模型查找。 */
  modelViewOf: (provider: string, model: string) => ModelView | undefined;
  /** 从所有逻辑模型 members 里摘掉某个真实模型,返回摘掉的条数。 */
  stripMemberFromLogicalModels: (targetRealModelId: string) => number;
  /** 账户 + 密钥在场(打 vault)。 */
  accountsWithKey: (pid: string) => Promise<Array<{ credentialRef: string; username: string; hasKey: boolean; keyFp: string | null }>>;
  /** 自动采纳(trae 本机登录态)。 */
  autoAdoptTrae: (pid: string) => Promise<string>;
  /** 目录冷却状态(供页面显示下次可用时刻)。 */
  catalogCooldownStateOf: (pid: string) => AutoRefreshInfo;
  /** 目录拉取时刻表(账号 → ts)。 */
  catalogFetchedAt: Map<string, number>;
  /** 目录行缓存(账号 → model → entry)。 */
  catalogRows: Map<string, Map<string, CatalogEntry>>;
  /** 拉上游模型目录(带冷却/单飞)。 */
  chAwaitCatalog: (pid: string, username: string, force?: boolean) => Promise<CatalogResult>;
  /** 拉额度(带冷却/单飞)。 */
  chAwaitQuota: (pid: string, username: string, force?: boolean) => Promise<QuotaSnapshot | null>;
  /** 额度快照 → 页面用的 ChannelCredits。 */
  chCreditsOf: (snapshot: QuotaSnapshot, fetchedAtMs: number) => ChannelCredits;
  /** 额度刷新敲门砖(带冷却,fire-and-forget)。 */
  chMaybeFetchQuota: (pid: string, username: string, force?: boolean) => void;
  /** 渠道账号列表(打 vault,含密钥状态)。 */
  channelAccountsOf: (pid: string) => Promise<ChannelAccount[]>;
  /** 签到输入账号视图。 */
  checkinAccountsOf: (pid: string) => Promise<CheckinInputAccount[]>;
  /** 签到计费基址。 */
  checkinBaseOf: (pdef: { baseUrl?: string | null } | null) => string | null;
  /** 单账号签到。 */
  checkinClaimOne: (pid: string, protocol: string, acc: CheckinInputAccount, base: string | undefined, confirm: boolean) => Promise<CheckinClaimRow>;
  /** 全通道/单账号刷新(入口即写 refreshLedger.startedAtMs)。 */
  doRefreshRun: (pid: string, confirm: boolean, onlyIndex: number | undefined) => Promise<ApiResult>;
  /** 客户端路径探测实现(共用,含 L 盘约定)。 */
  getClientPathsImpl: () => Promise<ClientPathsResult>;
  /** 目录落库(只更新不插入)。 */
  mergeCatalog: (pid: string, entries: CatalogEntry[], baseUrl: string | null, protocol: string) => number;
  /** 上游目录 ∪ 已登记(渠道页口径)。 */
  mergedChannelModels: (pid: string) => CatalogModel[];
  /** 模型来源文案。 */
  modelsSourceOf: (pid: string, models: CatalogModel[]) => string;
  /** 探测单个客户端 exe 路径。 */
  probeClientPath: (channel: string) => Promise<{ detected_path: string | null; found: boolean; source: "candidates" | "program-files" | "program-files-x86" | "localappdata" | "ldrive" | "registry" | "none"; message: string }>;
  /** 通用 HTTP 拉模型目录。 */
  probeProviderModels: (url: string, bearerKey: string | null) => Promise<{ ok: true; entries: CatalogEntry[] } | { ok: false; message: string }>;
  /** raw 里某个字符串字段。 */
  rawStrOf: (raw: Record<string, unknown>, key: string) => string | null;
  /** 渠道凭据行(index 与 ChannelAccount.index 同源)。 */
  refreshAccountsOf: (pid: string) => Promise<Array<{ index: number; cred: Credential }>>;
  /**
   * Qoder 的额度刷新(2026-11-09 用户报「qoder 不会自动更新」)。
   *
   * Qoder 的积分**不走** `CH_QUOTA_PROVIDERS` 那套探针(它的读数来自
   * `qoderCredits(region)` 这个独立方法),所以「全部刷新」以前根本不刷它 ——
   * 卡头永远是「未采集」。
   *
   * 为什么是**函数返回函数**:渠道域在 `panel.ts` 里比 qoder 域先创建(顺序有
   * 讲究:sensenova 域要拿渠道域的目录缓存),直接传 `qd.methods.qoderCredits`
   * 会拿到 undefined。用 getter 延迟到**调用时**才解引用,创建顺序就不再是约束。
   *
   * 返回 `null` = 该渠道没有 qoder 域可用(不报错,按「无额度协议」处理)。
   */
  qoderQuotaRefresh?: () =>
    | ((force: boolean) => Promise<{
        probed: number;
        written: number;
        message: string;
        errors: Record<string, string>;
      } | null>)
    | null;
  /** 刷新单飞行。 */
  refreshInFlight: Map<string, Promise<ApiResult>>;
  /** 逐渠道最近一次刷新记账。 */
  refreshLedger: Map<string, {
    startedAtMs: number | null;
    lastRunAtMs: number | null;
    lastElapsedS: number | null;
    lastOk: boolean | null;
    lastError: string | null;
    result: string | null;
    lastRunAccounts: RefreshAccountRow[];
  }>;
  /** 单账号刷新行。 */
  refreshRowBase: (index: number, cred: Credential) => RefreshAccountRow;
  /** 路径存在性检查。 */
  safeExists: (p: string) => boolean;
  /** 推理偏好序列化。 */
  serializeReasoningEfforts: (efforts: readonly string[] | null | undefined) => string | null;
}

export function createChannelsMethods(ctx: PanelContext, deps: ChannelsMethodsDeps) {
  const {
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
  } = deps;

  /**
   * 单行 upsert 的真实写库逻辑(`setChannelModels` 与 `setChannelModel` 共用)。
   *
   * 抽出来的原因:实时保存(2026-10-31)必须与整批保存**逐字段同口径** —— 两个
   * 地方各写一份「name 空则回退、上下文没给就保留原值、思考强度先看上游目录」的
   * 规则,迟早会分叉成「保存按钮能存的字段、实时保存存不住」。
   *
   * @returns 是否新建了行(原来没有这条 real_model)。
   */
  function upsertRealModelRow(pid: string, bare: string, spec: ChannelModelSpec): boolean {
    const row = ctx.db.realModel.get(pid, bare);
    const name = (spec.name ?? "").trim();
    const vision = spec.vision === undefined ? undefined : spec.vision ? 1 : 0;
    // 提交体里没给(null/省略)= 保留原值;给了 null 才是不声明。
    const ctxWin = spec.context_window === undefined ? undefined : spec.context_window;
    const maxOut = spec.max_output === undefined ? undefined : spec.max_output;
    // 思考强度:提交体没给 → 优先用**本次上游目录**刚拉到的能力表,
    // 目录也没有才保留原值(用户可能手改过库)。
    const cat = catalogRows.get(pid)?.get(bare);
    ctx.db.realModel.set({
      provider: pid,
      model: bare,
      name: name !== "" ? name : (row?.name ?? bare),
      supports_vision: vision ?? (row?.supports_vision ?? 0),
      max_input_tokens: ctxWin === undefined ? (row?.max_input_tokens ?? null) : ctxWin,
      max_output_tokens: maxOut === undefined ? (row?.max_output_tokens ?? null) : maxOut,
      hidden: 0,
      // ⚠️ 2026-11-08:并发是**每凭据**的;老行保留原值,新行按供应商缺省
      // (workbuddy=2,其余 1),别一律写 1。
      concurrency: row && row.concurrency > 0 ? row.concurrency : defaultConcurrencyOf(pid),
      supported_reasoning_efforts:
        cat === undefined || cat.reasoning_efforts === null
          ? (row?.supported_reasoning_efforts ?? null)
          : serializeReasoningEfforts(cat.reasoning_efforts),
      reasoning_allows_off:
        cat === undefined || cat.reasoning_allows_off === null
          ? (row?.reasoning_allows_off ?? null)
          : cat.reasoning_allows_off,
    });
    return !row;
  }

  // ⚠️ **刷新语义拆分(用户原话:「拆分原来合并的刷新语义……签到仍然是手动」)**:
  // 原来 `syncChannel` 把「目录 + 签到 + 额度」拧成一次调用,页面只要碰一处就三件事
  // 全跑。现在拆出三段私有实现,公开方法各只跑一段:
  //   - {@link runCatalogSegment} → `syncChannelCatalog`(展开卡片才拉目录,不额度不签到);
  //   - {@link runCheckinSegment} → 只留在 `syncChannel`(签到是显式动作,手动点才跑);
  //   - {@link runQuotaSegment}  → `syncChannelQuota` / `syncAllQuota`(打开页面/点刷新只刷额度)。
  // `syncChannel` 自身仍三段全跑 —— 给既有调用方兜底,行为与拆分前逐字一致。
  //
  // ⚠️ **顺序约定**:checkin 必须排在 quota **之前**(签到会真的加积分,额度要在签后采,
  // 否则用户会看到「已领取 100 积分」而页首积分纹丝不动)。这顺序只在三合一的
  // `syncChannel` 内部成立;单跑 `syncChannelQuota` 时本就不涉及签到,无顺序问题。

  /** ① 模型目录段:per-vendor 上游目录,不烧额度。 */
  async function runCatalogSegment(
    pid: string,
    forced: boolean,
    accounts: Array<{ index: number; cred: Credential }>,
  ): Promise<{
    written: number;
    count: number;
    message: string;
    missing: string[];
    errors: Record<string, string>;
    catalog: { status: string; reason: string; count: number; source: string | null };
  }> {
    if (!CH_CATALOG_PROVIDERS.has(pid)) {
      return {
        written: 0,
        count: 0,
        message: "模型目录:缺项(该渠道没有 upstream_catalog 的能力声明)",
        missing: ["catalog"],
        errors: {},
        catalog: { status: "missing", reason: "该渠道无上游目录协议", count: 0, source: null },
      };
    }
    if (accounts.length === 0) {
      return {
        written: 0,
        count: 0,
        message: `模型目录:${pid} 下没有账号,跳过`,
        missing: [],
        errors: {},
        catalog: { status: "skipped", reason: "没有账号", count: 0, source: null },
      };
    }
    const failures: string[] = [];
    let count = 0;
    let written = 0;
    let warns: string[] = [];
    const pulls = accounts.map((a) => a.cred.username);
    for (const username of pulls) {
      try {
        const res = await chAwaitCatalog(pid, username, forced);
        // 落库:刷新必须真能刷新模型目录(getProviderPage 读的是 db.real_model)。
        // 只更新不插入不删除:已登记行的声明不动,新模型只进目录缓存(见 mergeCatalog)。
        const pdef = ctx.registry.getProvider(pid);
        count = mergeCatalog(pid, res.entries, pdef?.baseUrl ?? null, pdef?.protocol ?? pid);
        warns = res.warnings;
        written += 1;
        break;
      } catch (err) {
        failures.push(`${username}:${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const allFailed = failures.length === pulls.length;
    const catalog = allFailed
      ? { status: "failed", reason: failures[0] ?? "全部账号失败", count: 0, source: null }
      : { status: "ok", reason: `上游 ${count} 个模型,已写入库`, count, source: "api" };
    const message = allFailed
      ? `模型目录没拉到(${failures[0] ?? "全部账号失败"})`
      : `模型目录 ${count} 个(来源:上游 API)${warns.length > 0 ? `(降级:${warns[0]})` : ""}`;
    return { written, count, message, missing: [], errors: {}, catalog };
  }

  /** ② 签到段:仅 `syncChannel` 调用(独立额度/目录方法绝不调用)。 */
  async function runCheckinSegment(
    pid: string,
    accounts: Array<{ index: number; cred: Credential }>,
  ): Promise<{
    summary: {
      supported: boolean;
      claimed: number;
      already: number;
      skipped: number;
      failed: number;
      credit: number;
      errors: string[];
      message: string | null;
    };
    part: string | null;
  }> {
    const protocol = ctx.registry.getProvider(pid)?.protocol?.toLowerCase() ?? "";
    const checkinCapable = checkinSupported(protocol);
    const summary: {
      supported: boolean;
      claimed: number;
      already: number;
      skipped: number;
      failed: number;
      credit: number;
      errors: string[];
      message: string | null;
    } = {
      supported: checkinCapable,
      claimed: 0,
      already: 0,
      skipped: 0,
      failed: 0,
      credit: 0,
      errors: [] as string[],
      message: null,
    };
    let part: string | null = null;
    if (checkinCapable) {
      if (accounts.length === 0) {
        summary.message = `${pid} 下没有账号,跳过签到`;
      } else {
        try {
          const claim = await methods.checkinClaim(pid, true);
          const rows = (claim.accounts ?? []) as CheckinClaimRow[];
          summary.claimed = rows.filter((r) => r.status === "claimed").length;
          summary.already = rows.filter((r) => r.status === "already").length;
          summary.skipped = rows.filter((r) => r.status === "skipped").length;
          summary.failed = rows.filter((r) => r.status === "failed").length;
          // `credit` = **本次真的领到的积分合计**(Nexus 同口径);不是账号总余额。
          summary.credit = rows.reduce((s, r) => s + Number(r.credit ?? 0), 0);
          summary.errors = rows
            .filter((r) => r.status === "failed")
            .map((r) => String(r.message ?? "").slice(0, 300));
        } catch (err) {
          summary.message = `签到失败:${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
        }
      }
      // 签到结果必须**说到听到了什么**:领到多少 / 今天早就签过 / 压根没启用,
      // 三种情况文案都不同。揉成一句「已签到」会让用户天天以为领到了。
      if (summary.message) {
        part = summary.message;
      } else if (summary.claimed > 0) {
        const tail = summary.credit > 0 ? `,共 ${summary.credit} 积分` : "";
        part = `已签到领取 ${summary.claimed} 个账号${tail}`;
      } else if (summary.already > 0) {
        part = `今日已签到(${summary.already} 个账号,无需重复领取)`;
      } else if (summary.failed > 0) {
        part = `签到失败:${summary.errors[0] ?? "未知原因"}`;
      } else {
        part = "该渠道今日无签到活动(未领取)";
      }
    }
    return { summary, part };
  }

  /** ③ 额度段:trae/workbuddy(+minimax)真探针;失败逐账号记 errors。 */
  async function runQuotaSegment(
    pid: string,
    forced: boolean,
    accounts: Array<{ index: number; cred: Credential }>,
  ): Promise<{
    probed: number;
    written: number;
    message: string;
    missing: string[];
    errors: Record<string, string>;
    quota: { status: string; reason: string };
  }> {
    const errors: Record<string, string> = {};
    // ⚠️ `errors` 是**账号级 map**(`"<provider>/<username>" → 原因`),与 Nexus
    // 同一形状:页面据此逐条报「哪个账号为什么没采到」,而不是甩一句汇总。
    if (!CH_QUOTA_PROVIDERS.has(pid)) {
      return {
        probed: 0,
        written: 0,
        message: "额度:缺项(该渠道无额度协议,Nexus 仅 trae/workbuddy 有)",
        missing: ["quota"],
        errors,
        quota: { status: "missing", reason: "该渠道无额度协议" },
      };
    }
    if (accounts.length === 0) {
      return {
        probed: 0,
        written: 0,
        message: `${pid} 下没有账号,跳过额度`,
        missing: [],
        errors,
        quota: { status: "skipped", reason: "没有账号" },
      };
    }
    const probed = accounts.length;
    let written = 0;
    for (const acc of accounts) {
      const snap = await chAwaitQuota(pid, acc.cred.username, forced);
      if (snap && snap.error === null && snap.remaining !== null) {
        written += 1;
      } else {
        errors[credentialKey(pid, acc.cred.username)] = snap?.error ?? "无密钥";
      }
    }
    const quota = written === probed
      ? { status: "ok", reason: `已刷新 ${written} 个账号额度` }
      : { status: "partial", reason: `${written} 成功 / ${probed - written} 失败` };
    const message = quota.status === "ok"
      ? `已刷新 ${written}/${probed} 个账号的额度`
      : `刷新失败:${Object.values(errors)[0] ?? "无结果"}`;
    return { probed, written, message, missing: [], errors, quota };
  }

  // ── 面板方法(self 引用 methods.checkinClaim 继续有效)──
  const methods = {
    /**
     * 拉上游模型目录(**只读**动作)。
     *
     * ⚠️ `decl` 是给「**还没保存**的供应商」用的:用户在新建卡片里填了 base_url/协议、
     * 点「获取可用模型」时,provider 行还不存在。用本次表单给的地址去探测,但
     * **绝不因此建 provider 行**(2026-10-24 用户反馈「点击获取可用模型会导致提供商被创建」)
     * —— 声明落库只发生在「保存」({@link upsertModelProvider})。
     */
    async fetchModels(
      id: string,
      _force?: boolean,
      decl?: { baseUrl?: string | null; protocol?: string | null } | null,
    ): Promise<ApiResult> {
      const pid = String(id ?? "");
      const row = ctx.db.provider.get(pid);
      const saved = ctx.registry.getProvider(pid) ?? (row
        ? { id: row.id, baseUrl: row.base_url, protocol: row.protocol, envPrefix: row.env_prefix }
        : null);
      if (!saved && !decl) return { ok: false, message: `未知 provider ${pid}` };
      // 表单里填了就以表单为准(用户可能正在改地址);没填才回落到已保存的值。
      const baseUrl = String(decl?.baseUrl ?? "").trim() || saved?.baseUrl || "";
      const protocol = String(decl?.protocol ?? "").trim() || saved?.protocol || "openai";
      // ── 渠道分支:有模型目录采集的渠道(CH_CATALOG_PROVIDERS) ──────────────
      // 镜像 Nexus catalog.py:trae = wire(get_detail_param)∪ remote(/models)、
      // workbuddy = /v3/config(CN 回退 personal/models)、sensenova = token/v1/models。
      // minimax = **内置固定名单**(catalog.ts 的 MINIMAX_BUILTIN_MODELS,不打上游),
      // 2026-11-08 补进能力清单,否则展开卡片时内置目录永远合并不进页面。
      // 这些端点全是配置/元数据接口,**不烧额度**(用户 m12222 的诉求)。
      if (CH_CATALOG_PROVIDERS.has(pid)) {
        const accounts = await refreshAccountsOf(pid);
        if (accounts.length === 0) {
          return { ok: false, message: `${pid} 下没有账号,没有密钥可以拿去拉上游目录。` };
        }
        // 逐账号拉,第一个成功的算(Nexus `_fetch_models` 同一口径:目录是账号无关的,
        // 只要有一个账号能拉到就能展示)。
        const failures: string[] = [];
        let result: CatalogResult | null = null;
        const pulls = accounts.map((a) => a.cred.username);
        for (const username of pulls) {
          try {
            result = await chAwaitCatalog(pid, username, _force === true);
            break;
          } catch (err) {
            failures.push(`${username}:${err instanceof Error ? err.message : String(err)}`);
          }
        }
        if (result === null) {
          return {
            ok: false,
            message: `上游目录拉取失败(${failures.length} 个账号;示例:${failures[0] ?? "无账号"})`,
          };
        }
        const warnNote = result.warnings.length > 0 ? `(降级:${result.warnings[0]})` : "";
        const entries = result.entries.map((e) => ({
          id: e.id,
          name: e.name,
          vision: e.vision,
          context_window: e.context_window,
          max_output: e.max_output,
        }));
        mergeCatalog(pid, result.entries, baseUrl, protocol);
        // 与 getProviderPage 同一口径:上游目录 ∪ 已登记(勾选 = 在表里)。
        const models: CatalogModel[] = mergedChannelModels(pid);
        const registeredCount = models.filter((m) => m.exposed).length;
        const extra = registeredCount > 0 ? "" : ";还没有登记任何模型(勾选后保存)";
        return {
          ok: true,
          fetched: true,
          count: entries.length,
          message: `上游返回 ${entries.length} 个模型${warnNote}${extra}`,
          models,
        };
      }
      // 镜像 Nexus `_probe_upstream`:探测的是 base_url,协议不设门禁 ——
      // 有 http(s) base_url 的渠道都能探测;私有协议渠道没有统一 /models 接口。
      const base = baseUrl;
      if (!base) {
        return { ok: false, message: "这家没有 base_url:请求由本机私有协议适配器转成私有协议,没有统一的 /models 接口可探测。模型清单以库里已登记的为准。" };
      }
      let u: URL;
      try {
        u = new URL(base);
      } catch {
        return { ok: false, message: `base_url 不是可探测的 http(s) 地址:${base}` };
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, message: `base_url 不是可探测的 http(s) 地址:${base}` };
      }
      // 取第一条有明文密钥的凭据去探测(Nexus `_probe_credential`)。
      //
      // ⚠️ **取不到密钥不拦**(2026-10-24):本地/内网网关常常**本来就不需要密钥**
      // (minimax2api、各类自建代理),为「没填密钥」直接拒绝等于把这类上游挡在门外。
      // 有没有密钥看上游自己答什么:200 = 它不要密钥,401 = 它要。
      const creds = await ctx.vault.list(pid);
      let bearerKey: string | null = null;
      for (const c of creds) {
        const secret = await ctx.vault.secret(pid, c.username);
        if (typeof secret === "string" && secret !== "") {
          bearerKey = secret;
          break;
        }
      }
      const root = base.replace(/\/+$/, "");
      const first = await probeProviderModels(`${root}/models`, bearerKey);
      let probe: typeof first = first;
      // ⚠️ **不做任何自动补全/猜测**(2026-10-24 用户定案):地址填错、上游没有该接口时
      // 就**原样报错**,把探测到的现象讲清楚(HTTP 状态、是不是网页、JSON 认不出的原因),
      // 由用户自己决定改哪个地址。自动补 `/v1`、自动换路径都属于「替用户猜」——
      // 猜对了是运气,猜错了会写进库一份错模型表,比报错更难排查。
      if (!probe.ok) {
        return { ok: false, message: probe.message };
      }
      const catalogEntries = probe.entries;
      mergeCatalog(pid, catalogEntries, baseUrl, protocol);
      const models: CatalogModel[] = mergedChannelModels(pid);
      const registeredCount = models.filter((m) => m.exposed).length;
      const extra = registeredCount > 0 ? "" : ";还没有登记任何模型(勾选后保存)";
      return {
        ok: true,
        fetched: true,
        count: catalogEntries.length,
        message: `上游返回 ${catalogEntries.length} 个模型${extra}`,
        models,
      };
    },
    /**
     * 模型目录**整批保存** —— 对齐 Nexus `POST /providers/{id}/exposure`。
     *
     * As One 原来只有逐行 `setModelExposure(provider, model, exposed)`:它只翻
     * `hidden` 一个位,于是「名称 / 视觉 / 上下文 / 最大输出」这四个**声明字段
     * 改了存不住**(用户在表格里勾了视觉,保存后又被刷回上游那一份)。Nexus 的
     * 提交体本来就带这四个字段,这里按同一口径整批写。
     *
     * ⚠️ 清单外 = 删行(不是隐藏):Nexus 的「提交清单 = 成员名单」是整批替换语义,
     * 取消勾选就是从 `real_model` 摘掉。
     *
     * ⭐ **2026-10-18(m04740)语义:删行即连锁摘除** —— 以前这里在「被逻辑模型
     * 引用」时**整批拒绝**并点名让用户先去「逻辑模型」页手动摘。那是 Nexus
     * 引入连锁摘除**之前**的旧口径。现在的做法是:删之前先把这一档从所有逻辑
     * 模型的 `members` 里摘掉(保序,顺序即 priority 不变),再删行 ——
     * 用户不再需要先跑一趟别的页面,也不会留下指向空气的悬空档位。
     *
     * ⚠️ 提交 id 指向别家供应商时**静默忽略该行**(Nexus 同款 `continue`),
     * 不再整批报错:一个客户端顺手把整张目录表发过来时,别家的行不该让它失败。
     */
    async setChannelModels(provider: string, models: ChannelModelSpec[]): Promise<ApiResult> {
      const pid = String(provider ?? "").trim();
      if (!pid) return { ok: false, message: "provider 不能为空" };
      const list = Array.isArray(models) ? models : [];

      // ── 1. 解析提交清单:完整 id → 裸名(裸名带斜杠时无法分辨归属) ──────────
      const wanted = new Map<string, ChannelModelSpec>();
      for (const raw of list) {
        const full = String(raw?.id ?? "").trim();
        const slash = full.lastIndexOf("/");
        const owner = slash >= 0 ? full.slice(0, slash) : pid;
        const bare = slash >= 0 ? full.slice(slash + 1) : full;
        if (bare === "") return { ok: false, message: `模型 id 为空:${full || "(空)"}` };
        if (owner !== pid) continue; // 别家的行静默忽略(Nexus 同款)
        wanted.set(bare, raw);
      }

      // ── 2. 清单外 = 删行(先连锁摘除档链引用,不再 409) ────────────────────
      const existing = ctx.db.realModel.listByProvider(pid);
      const stale = existing.filter((r) => !wanted.has(r.model));
      let strippedTotal = 0;
      for (const r of stale) {
        strippedTotal += deps.stripMemberFromLogicalModels(`${pid}/${r.model}`);
      }

      // ── 3. upsert 清单内(含四个声明字段) ───────────────────────────────
      let added = 0;
      for (const [bare, spec] of wanted) {
        if (upsertRealModelRow(pid, bare, spec)) added += 1;
      }

      // ── 4. 删清单外 ────────────────────────────────────────────────────
      for (const r of stale) ctx.db.realModel.delete(pid, r.model);
      try {
        ctx.scheduler.invalidate(); // 成员变了 → 档链要重算
      } catch {
        /* 缓存失效失败不影响保存结果 */
      }
      ctx.syncRegistry();

      // 文案对齐 Nexus:三段计数(新登记 / 删除 / 连锁摘除)都要说出来 ——
      // 只报「共 N 个」会让用户以为被删的模型是静默消失的。
      const parts = [`共 ${wanted.size} 个模型`];
      if (added > 0) parts.push(`新登记 ${added} 个`);
      if (stale.length > 0) parts.push(`删除 ${stale.length} 个`);
      if (strippedTotal > 0) parts.push(`从逻辑模型档链连锁摘除 ${strippedTotal} 处`);
      return {
        ok: true,
        provider: pid,
        count: wanted.size,
        changed: [...wanted.keys()].map((m) => `${pid}/${m}`),
        message: `模型表已更新:${parts.join(",")}`,
      };
    },
    /**
     * 单行实时保存 —— 用户 2026-10-31 定案:四页(Trae/WorkBuddy/Qoder/SenseNova)
     * 删掉「撤销 / 保存」按钮,勾选、改名、改上下文窗口、改最大输出、勾视觉**当场落库**。
     *
     * ⚠️ 与 {@link setChannelModels} 刻意分离:那个是**整批替换**(清单外 = 删行),
     * 实时保存一次只带一行,套用整批语义会把用户没在看的模型全删掉。
     * 这里按 (provider, model) 单行 upsert;`patch.exposed === false` 才删这一行,
     * 并且**照旧先做连锁摘除**(与整批删行同口径,不留下指向空气的档位)。
     *
     * ⚠️ 只碰模型表:不动凭据、不打上游、不写请求日志。失败一律如实回 message。
     */
    async setChannelModel(provider: string, patch: ChannelModelPatch): Promise<ApiResult> {
      const pid = String(provider ?? "").trim();
      if (!pid) return { ok: false, message: "provider 不能为空" };
      const full = String(patch?.id ?? "").trim();
      if (full === "") return { ok: false, message: "模型 id 为空" };
      const slash = full.lastIndexOf("/");
      const owner = slash >= 0 ? full.slice(0, slash) : pid;
      const bare = slash >= 0 ? full.slice(slash + 1) : full;
      if (bare === "") return { ok: false, message: `模型 id 为空:${full}` };
      // 别家的行静默忽略(与整批保存同款:客户端顺手带上整张目录表时不该报错)。
      if (owner !== pid) {
        return { ok: true, provider: pid, count: 0, changed: [], message: "" };
      }

      // ── 取消登记 = 删这一行(先摘逻辑模型档链,再删) ──────────────────────
      if (patch.exposed === false) {
        const existed = ctx.db.realModel.get(pid, bare) !== null;
        if (!existed) {
          return { ok: true, provider: pid, count: 0, changed: [], message: "" };
        }
        const stripped = deps.stripMemberFromLogicalModels(`${pid}/${bare}`);
        ctx.db.realModel.delete(pid, bare);
        try {
          ctx.scheduler.invalidate();
        } catch {
          /* 缓存失效失败不影响保存结果 */
        }
        ctx.syncRegistry();
        const tail = stripped > 0 ? `,从逻辑模型档链连锁摘除 ${stripped} 处` : "";
        return {
          ok: true,
          provider: pid,
          count: 0,
          changed: [`${pid}/${bare}`],
          message: `已取消登记 ${pid}/${bare}${tail}`,
        };
      }

      // ── 登记 / 改声明字段 = 单行 upsert ────────────────────────────────
      const added = upsertRealModelRow(pid, bare, patch);
      try {
        ctx.scheduler.invalidate(); // 成员或声明字段变了 → 档链要重算
      } catch {
        /* 同上 */
      }
      ctx.syncRegistry();
      return {
        ok: true,
        provider: pid,
        count: 1,
        changed: [`${pid}/${bare}`],
        message: added ? `已登记 ${pid}/${bare}` : `已更新 ${pid}/${bare}`,
      };
    },
    /**
     * 单模型检测(对齐 Nexus `POST /providers/{id}/check-model`)。
     *
     * 只回答「这个模型有没有可调用账户」,**不打上游**。
     */
    async checkModel(provider: string, model: string): Promise<ApiResult> {
      const pid = String(provider ?? "").trim();
      const mid = String(model ?? "").trim();
      if (!pid || !mid) return { ok: false, message: "provider 与 model 都不能为空" };
      const bare = mid.includes("/") ? mid.slice(mid.lastIndexOf("/") + 1) : mid;
      const mv = deps.modelViewOf(pid, bare);
      if (!mv) return { ok: false, message: `未登记的模型:${pid}/${bare}` };
      const withKey = await accountsWithKey(pid);
      const usable = withKey.filter((a) => a.hasKey).length;
      const ok = usable > 0;
      return {
        ok,
        message: ok
          ? `${pid}/${bare} 可调用(该供应商下 ${usable} 个有密钥的账户)`
          : `${pid}/${bare} 没有可调用账户(该供应商下 ${withKey.length} 个账户,${usable} 个有密钥)`,
        provider: pid,
        changed: [],
      };
    },
    /**
     * SenseNova 账号列表(对齐 Nexus `GET /sensenova/accounts` → `_sensenova_accounts`)。
     *
     * 凭据投影,**无明文**。
     */

    /**
     * 额度只读面(对齐 Nexus `GET /api/quota`)。
     *
     * 数据源是采集器的内存快照(不实时打上游)—— 面板上显示的是「上次采集到的
     * 额度」,不是此刻的。
     */
    async getQuota(): Promise<QuotaRead> {
      // 数据源是采集器的**内存快照**(不实时打上游)—— 面板上显示的是「上次采集到
      // 的额度」,不是此刻的。
      const out: QuotaRead = { providers: [], total: 0, checked_at: null };
      for (const p of ctx.registry.listProviders()) {
        for (const acc of ctx.registry.listAccounts(p.id)) {
          const [, username] = splitRef(acc.credentialRef);
          const cached = chQuotaCache.get(`${p.id}/${username}`);
          const snap = cached?.snapshot ?? null;
          if (snap === null) continue;
          out.providers.push({
            provider: p.id,
            credential: acc.credentialRef,
            remaining: snap.remaining,
            limit: snap.limit,
            checked_at: Math.round((snap.fetched_at || 0)),
            error: snap.error,
          });
          out.total += snap.remaining ?? 0;
          out.checked_at = Math.round(snap.fetched_at || 0);
        }
      }
      return out;
    },
    async checkModels(id?: string): Promise<ApiResult> {
      const targets = id
        ? [String(id)]
        : ctx.registry.listProviders()
          .filter((p) => p.protocol === "openai")
          .map((p) => p.id);
      const checked: CatalogModel[] = [];
      const missing: string[] = [];
      for (const pid of targets) {
        const withKey = await accountsWithKey(pid);
        const usable = withKey.filter((a) => a.hasKey).length;
        // 与渠道页同一口径:勾选 = 在 real_model 表里(不是 !hidden)。
        for (const m of mergedChannelModels(pid)) {
          checked.push(m);
          if (m.registered && usable === 0) missing.push(m.id);
        }
      }
      return {
        ok: true,
        message: missing.length > 0
          ? `检查完成:${missing.length} 个模型无可调用账户(${missing.join(", ")})`
          : "检查完成:全部模型均有可调用账户",
        models: checked,
        count: checked.length,
      };
    },
    // ── 渠道页(Trae / WorkBuddy) ───────────────────────────────────────────

    async getProviderPage(provider: string, _fresh?: boolean): Promise<ProviderPage> {
      const pid = String(provider ?? "");
      // 每次进页先对齐一次本机登录态(m02117 自动登录;采纳后再读账号/模型,
      // 这样新采纳的凭据立刻反映在页面里)。
      const adoptMsg = await autoAdoptTrae(pid);
      const pdef = ctx.registry.getProvider(pid);
      const accounts = await channelAccountsOf(pid);
      const withKey = await accountsWithKey(pid);
      // ⚠️ 模型目录 = **上游目录 ∪ 已登记**(Nexus `_merge_catalog`),勾选 =
      // 在 `real_model` 表里。以前这里只读 `deps.realModelMap` 且拿 `!hidden` 当勾选态,
      // 于是一次刷新刷不出新模型、而被部署页取消列入的模型又显示成未勾选
      // (用户一保存就被删行)。见 mergedChannelModels 的说明。
      const models: CatalogModel[] = mergedChannelModels(pid);
      const clientPaths = await getClientPathsImpl();
      // 「自动发现并接入」的逐行 hint:库里已有 client_path.<channel> 时显示该已存路径
      // (表示「已接入客户端」),Nexus ProviderCard.searched 语义。
      const cpRow = clientPaths.channels.find((c) => c.channel === pid);
      const searchedHints = cpRow?.saved_path ? [`已接入客户端: ${cpRow.saved_path}`] : [];
      // 渠道页不主动打上游签到(只读页要轻,签到是显式动作);
      // 此处只判断能力,真值由 checkinStatus/checkinClaim 调用时给出。
      // supported 保持 false:刷新不会自动签到(As One 未接入刷新循环),
      // 不能让渲染层出现"刷新时顺带签到"徽标。
      const checkinProtocol = pdef?.protocol?.toLowerCase() ?? "";
      const checkinCapable = checkinSupported(checkinProtocol);
      const checkinBlock: ChannelCheckin = {
        supported: false,
        active: null,
        checked_in: null,
        did_checked_in: null,
        daily_credit: null,
        extra_credits: null,
        streak_days: null,
        reason: checkinCapable
          ? "支持签到(经 checkinStatus/checkinClaim 调用;渠道页刷新不会自动签到)"
          : "该渠道不支持签到",
        error: null,
      };
      // 渠道额度:trae/workbuddy 走内存快照(首次进页触发 gated 拉取,不阻塞响应;
      // 缓存/冷却语义见 snQuota)。其余渠道无额度子系统 → not_applicable。
      // 「未知 ≠ 0」:没拉到/没缓存时 left=null(渲染层不摆「剩余积分 0」),
      // 失败原因原样放 error(渲染层 warn-line 展示)。
      //
      // 2026-10-30:账号行改成「一行一个账号」后,`credits` 只够第一把账号用,
      // 故逐账号再带一份自己的快照(见下方 accountsWithCredits)—— 多账号时三行不能全摆同一份数字。
      let credits: ChannelCredits;
      if (CH_QUOTA_PROVIDERS.has(pid)) {
        const primary = withKey.find((a) => a.hasKey);
        if (!primary) {
          credits = {
            left: null, total: null, expires_at_ms: null, fetched_at_ms: 0,
            packages: [], expiring_soon: null, not_applicable: true, error: null,
          };
        } else {
          const cached = chQuotaCache.get(credentialKey(pid, primary.username));
          credits = cached
            ? chCreditsOf(cached.snapshot, cached.fetchedAtMs)
            : {
                left: null, total: null, expires_at_ms: null, fetched_at_ms: 0,
                packages: [], expiring_soon: null, not_applicable: false,
                error: "额度尚未拉取 —— 点上方「刷新」",
              };
          // 首次进页顺带拉一次(冷却闸门会挡住高频重复请求)
          chMaybeFetchQuota(pid, primary.username, false);
        }
      } else {
        credits = {
          left: null, total: null, expires_at_ms: null, fetched_at_ms: 0,
          packages: [], expiring_soon: null, not_applicable: true, error: null,
        };
      }
      // 账号行各带自己的额度快照(无额度子系统的渠道恒 null,渲染层就不摆右侧徽章)。
      // ⚠️ 按 `credential_key`(完整 "provider/username")查,不能用 label(裸用户名)。
      const accountsWithCredits: ChannelAccount[] = CH_QUOTA_PROVIDERS.has(pid)
        ? accounts.map((a) => {
            const cached = chQuotaCache.get(a.credential_key);
            return {
              ...a,
              credits: cached ? chCreditsOf(cached.snapshot, cached.fetchedAtMs) : null,
            };
          })
        : accounts;
      return {
        provider: pid,
        env_prefix: pdef?.envPrefix ?? `ONE_${pid.toUpperCase()}`,
        region: null,
        signed_in: accounts.length > 0,
        username: accounts[0]?.label ?? null,
        account: accounts[0]?.label ?? null,
        searched: searchedHints,
        credits,
        checkin: checkinBlock,
        maintenance: {
          enabled: refreshSupported(pid),
          interval_s: null,
          last_run_ts: null,
          result: null,
          error: null,
          reason: refreshSupported(pid)
            ? "令牌到期前可手动刷新(两段式:先干跑看清,再确认)"
            : "该渠道不需要令牌刷新",
        },
        models,
        // 契约值域是 modelsSourceLabel 认的那几个(api / mixed / router / error),
        // 判据逐条对齐 Nexus `_models_source`:
        // - 这一轮没拉到上游目录(或该渠道没有这条通路)→ "router"(仅已登记);
        // - 全是上游目录行 → "api";
        // - 上游目录 + 已登记(库里多出上游这一轮没有的模型)→ "mixed"。
        models_source: modelsSourceOf(pid, models),
        models_fetched_at_ms: catalogFetchedAt.get(pid) ?? null,
        models_count: models.length,
        message: [
          adoptMsg ? `${adoptMsg};` : "",
          CH_QUOTA_PROVIDERS.has(pid)
            ? ""
            : "该渠道无额度子系统,已展示该渠道的凭据与模型配置;签到经 checkinStatus/checkinClaim 调用",
        ]
          .filter(Boolean)
          .join(" "),
        // ⚠️ 目录的冷却状态**如实**给出(B2):页面要能说明「为什么刷新没打上游」。
        auto_refresh: catalogCooldownStateOf(pid),
        accounts: accountsWithCredits,
        client_paths: clientPaths.channels.filter((c) => c.channel === pid),
      };
    },
    async getChannelAccounts(provider: string): Promise<ChannelAccount[]> {
      const pid = String(provider ?? "");
      // 同 getProviderPage:读账号前先对齐一次本机登录态(采纳后列表即最新)。
      await autoAdoptTrae(pid);
      return channelAccountsOf(pid);
    },
    async checkinStatus(_provider: string, _index?: number): Promise<ChannelCheckin> {
      const pid = String(_provider ?? "");
      const pdef = ctx.registry.getProvider(pid);
      const protocol = pdef?.protocol?.toLowerCase() ?? "";
      // 扁平契约模板:未打上游的字段一律 null(诚实,不摆假数字)。
      const flat = (over: Partial<ChannelCheckin> & { supported: boolean }): ChannelCheckin => ({
        active: null,
        checked_in: null,
        did_checked_in: null,
        daily_credit: null,
        extra_credits: null,
        streak_days: null,
        reason: null,
        error: null,
        ...over,
      });

      if (!pdef || !checkinSupported(protocol)) {
        return flat({ supported: false, reason: pid ? "该渠道不支持签到" : "渠道为空,不支持签到" });
      }

      const accounts = await checkinAccountsOf(pid);
      const withToken = accounts.filter((a) => a.token !== null && a.token !== "");
      if (withToken.length === 0) {
        return flat({ supported: true, reason: "该渠道没有带令牌的凭据,无法查询签到" });
      }

      // ⚠️ `_index` 给了就查**那一个账号**(2026-11-09:trae 概览改成逐账号查,
      // 需要按账号索引取状态);没给则沿用「代表账号」语义(取序号最小的带令牌账号)
      // —— Nexus 面板是逐账号表格,As One 的 ChannelCheckin 是单值,故取其一并诚实标注。
      const acc =
        _index === undefined ? withToken[0]! : withToken.find((a) => a.index === _index);
      if (acc === undefined) {
        return flat({
          supported: true,
          reason: `账号序号不存在: ${String(_index)}(该渠道共 ${accounts.length} 个凭据)`,
        });
      }
      try {
        if (protocol === "trae") {
          const st = await traeCheckinStatus(
            {
              index: acc.index,
              username: acc.username,
              token: acc.token!,
              region: acc.region,
              // ⚠️ 不传 device_id(resolveTraeDevice 一律按 token 派生):
              // raw 里的真机指纹同机共享,会让多账号被上游判定成同一设备。
              // 只读 status 也会被设备维度影响 —— 用独立指纹才能如实反映
              // 每个账号「本设备视角」的可签状态(2026-11-09 用户实测定案)。
              extra: acc.extra,
            },
            { baseUrl: checkinBaseOf(pdef) ?? undefined },
          );
          return flat({
            supported: true,
            active: st.enable,
            checked_in: st.checked_in,
            did_checked_in: st.did_checked_in,
            daily_credit: st.credits,
            extra_credits: st.extra_credits,
            code: st.code,
            message: st.message ? st.message.slice(0, 300) : null,
          });
        }
        if (protocol === "minimax") {
          // 走 minimaxAccountFor:401 时自动 refresh 续期并重试。
          const bound = await minimaxAccountFor(ctx.vault, pid, acc.username);
          if (bound === null) {
            return flat({ supported: true, reason: "该账号没有可用令牌" });
          }
          const panel = await minimaxSigninStatus(bound.account, {
            timeoutMs: MINIMAX_QUOTA_TIMEOUT_MS,
            ...bound.httpOptions,
          });
          const claimed = panelClaimedToday(panel);
          const points = panelTodayPoints(panel);
          return flat({
            supported: true,
            active: true,
            checked_in: claimed,
            // panelTodayPoints 已改为「不论已签/未签都给当日真实积分」:
            // 已签读作「今天领到 X」,未签读作「今天可领 X」(两个字段同值,
            // 面板按 checked_in 的语境取用)。
            daily_credit: points,
            today_credit: points,
            reason: null,
            message: null,
          });
        }
        const st = await wbCheckinStatus(
          { index: acc.index, username: acc.username, token: acc.token!, domain: acc.domain, uid: acc.uid, enterprise_id: acc.enterprise_id },
          { baseUrl: checkinBaseOf(pdef) ?? undefined },
        );
        return flat({
          supported: true,
          active: st.active,
          checked_in: st.today_checked_in,
          daily_credit: st.daily_credit,
          streak_days: st.streak_days,
          today_credit: st.today_credit,
          is_streak_day: st.is_streak_day,
          claim_button_text: st.claim_button_text,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (err instanceof CheckinRegionError || err instanceof CheckinCredentialError) {
          // 确定性本地门禁(国际版 / 凭据缺字段):进 reason,不是上游失败。
          return flat({ supported: true, reason: msg.slice(0, 300) });
        }
        // 上游 4xx/5xx/网络/超时:进 error;reason 保持"代表账号"之外不猜测。
        return flat({ supported: true, error: msg.slice(0, 300) });
      }
    },
    async checkinClaim(_provider: string, _confirm: boolean, _index?: number): Promise<ApiResult> {
      const pid = String(_provider ?? "");
      const pdef = ctx.registry.getProvider(pid);
      const protocol = pdef?.protocol?.toLowerCase() ?? "";
      const confirm = _confirm === true;
      const fail = (message: string): ApiResult => ({ ok: false, provider: pid, message });

      if (!pdef || !checkinSupported(protocol)) {
        return fail(pid ? "该渠道不支持签到" : "渠道为空,不支持签到");
      }

      const accounts = await checkinAccountsOf(pid);
      if (accounts.length === 0) {
        return fail("该渠道没有凭据,无法签到");
      }
      const targets =
        _index === undefined ? accounts : accounts.filter((a) => a.index === _index);
      if (_index !== undefined && targets.length === 0) {
        return fail(`账号序号不存在: ${_index}(该渠道共 ${accounts.length} 个凭据)`);
      }

      // 逐账号独立(Nexus:一个失败不遮蔽其余)。
      const rows: CheckinClaimRow[] = [];
      /**
       * trae 的**设备级短路**(2026-11-10 实测定案)。
       *
       * trae 按**设备**放行每日签到:同一台机器上的多个账号,一天只有第一个
       * 能签上,其余一律 `9095 本设备今日已签`。所以一旦本轮出现「设备已签」,
       * 后面的账号**不必再打上游** —— 打过去也只会换回同一个 9095,
       * 还会多消耗几次风控采样。
       *
       * 用 `skipped` 而不是 `failed`:这不是「账号有问题」,是设备额度用完了。
       */
      let traeDeviceSpent = false;
      for (const acc of targets) {
        if (traeDeviceSpent) {
          rows.push({
            index: acc.index,
            provider: pid,
            username: acc.username,
            region: acc.region,
            status: "skipped",
            message: "本设备今日已签(同机其它账号先签了);trae 按设备放行,一天只能签一个账号",
          });
          continue;
        }
        const row = await checkinClaimOne(pid, protocol, acc, checkinBaseOf(pdef) ?? undefined, confirm);
        rows.push(row);
        // 只有「设备已签」才短路;账号级已签(already)说明是本账号自己签过,不影响别的账号。
        if (pid === "trae" && row.device_checked_in === true) traeDeviceSpent = true;
      }

      const claimedN = rows.filter((r) => r.status === "claimed").length;
      const alreadyN = rows.filter((r) => r.status === "already").length;
      const failedRows = rows.filter((r) => r.status === "failed");
      // ⚠️ 真领取成功(claimed)后打掉该渠道的签到日缓存(2026-11-07):
      // 否则概览/渠道页在本周期内继续命中「未签」旧值,签完界面不更新。
      // already 不需要(状态没变);dry_run/failed 也不动缓存。
      if (confirm && claimedN > 0) invalidateCheckinCache(pid);
      // 与 Nexus 的差异:干跑只有在至少一行 dry_run/skipped 时才算 ok;
      // 所有行都 failed 时 ok=false —— 不把"全部失败"包装成成功。
      const ok =
        claimedN + alreadyN > 0 ||
        (!confirm && rows.some((r) => r.status === "dry_run" || r.status === "skipped"));

      let message: string;
      if (ok) {
        if (!confirm) {
          message = "干跑结果(未发出领取请求)";
        } else {
          // 「签到成功没有提示」:成功也要有可展示的内容(领了几个号 / 拿了多少分)。
          const creditSum = rows.reduce((s, r) => s + (r.credit ?? 0), 0);
          const parts = [`已领取 ${claimedN} 个账号`];
          if (alreadyN > 0) parts.push(`今日已签 ${alreadyN} 个`);
          if (creditSum > 0) parts.push(`积分合计 ${creditSum}`);
          const first = rows.find((r) => r.status === "claimed" || r.status === "already");
          if (first) parts.push(first.message);
          message = parts.join(" · ");
        }
      } else if (rows.length > 0) {
        message =
          failedRows.length > 0
            ? `签到失败:${failedRows[0].message}`.slice(0, 300)
            : "该渠道今日无签到活动(未领取)";
      } else {
        message = "该渠道没有可用账号";
      }

      return {
        ok,
        provider: pid,
        index: _index,
        message,
        confirm,
        count: rows.length,
        claimed: claimedN,
        already: alreadyN,
        accounts: rows,
      };
    },
    async refreshStatus(provider: string): Promise<ChannelRefreshStatus> {
      const pid = String(provider ?? "");
      const unsupported: ChannelRefreshStatus = {
        running: false,
        started_at_ms: null,
        last_run_at_ms: null,
        last_elapsed_s: null,
        last_ok: null,
        last_error: null,
        result: `${pid} 暂无刷新能力(Nexus REFRESH_PROVIDERS = trae/workbuddy)`,
        count: 0,
        accounts: [],
      };
      if (!refreshSupported(pid)) return unsupported;
      const accounts = await refreshAccountsOf(pid);
      const rows: RefreshAccountRow[] = accounts.map(({ index, cred }) => refreshRowBase(index, cred));
      const entry = refreshLedger.get(pid);
      const running = [...refreshInFlight.keys()].some((k) => k.startsWith(`${pid}#`));
      return {
        running,
        started_at_ms: entry?.startedAtMs ?? null,
        last_run_at_ms: entry?.lastRunAtMs ?? null,
        last_elapsed_s: entry?.lastElapsedS ?? null,
        last_ok: entry?.lastOk ?? null,
        last_error: entry?.lastError ?? null,
        result: entry?.result ?? "尚未执行过凭据刷新",
        count: rows.length,
        accounts: rows,
        last_run_accounts: entry?.lastRunAccounts ?? [],
      };
    },
    async refreshRun(provider: string, confirm: boolean, index?: number): Promise<ApiResult> {
      const pid = String(provider ?? "");
      const want = confirm === true;
      const onlyIndex = typeof index === "number" && Number.isInteger(index) ? index : undefined;
      if (!refreshSupported(pid)) {
        return {
          ok: false,
          provider: pid,
          confirm: want,
          count: 0,
          refreshed: 0,
          accounts: [],
          message: `${pid}:该渠道无令牌刷新概念(Nexus REFRESH_PROVIDERS = trae/workbuddy)`,
        };
      }
      // 单飞:同渠道同 index 的并发调用复用同一 Promise(连点/双端并击不重打上游)。
      const flightKey = `${pid}#${onlyIndex === undefined ? "*" : String(onlyIndex)}`;
      const inflight = refreshInFlight.get(flightKey);
      if (inflight) return inflight;
      const run = doRefreshRun(pid, want, onlyIndex);
      refreshInFlight.set(flightKey, run);
      try {
        return await run;
      } finally {
        refreshInFlight.delete(flightKey);
      }
    },
    async syncChannel(provider: string, force?: boolean): Promise<ApiResult> {
      const pid = String(provider ?? "");
      const forced = force !== false;
      // Nexus /channels/{id}/sync = 模型目录 + 签到 + 额度三合一(_channel_sync,
      // force=True 用户点刷新绕过冷却,force=False 自动刷新受冷却)。
      // ⚠️ 拆分后这里仍三段全跑:只为向后兼容既有调用方。页面侧已按语义分开走
      // —— 打开页/刷新只刷额度走 {@link syncChannelQuota},展开卡片才拉目录走
      // {@link syncChannelCatalog},签到只在点「全部签到」时才跑。见文件顶部的拆分说明。
      // 接线:签到真接(checkinClaim)、额度真接(trae/workbuddy 探针,force 绕过冷却),
      // 模型目录按能力如实缺项;missing 动态生成。
      const accounts = await refreshAccountsOf(pid);
      const checked = accounts.length;
      const protocol = ctx.registry.getProvider(pid)?.protocol?.toLowerCase() ?? "";
      const checkinCapable = checkinSupported(protocol);

      // ⚠️ **顺序与 Nexus `_channel_sync` 一致:目录 → 签到 → 额度**。
      // 签到排在额度采集**之前**,因为它会真的往账号里加积分 —— 额度放在它后面
      // 采,页首拿到的才是**签后**的数字。反过来做,用户会看到「已领取 100 积分」
      // 而页首积分纹丝不动,只能再手动点一次刷新才对得上。
      const catalog = await runCatalogSegment(pid, forced, accounts);
      const checkin = await runCheckinSegment(pid, accounts);
      const quota = await runQuotaSegment(pid, forced, accounts);

      // ⚠️ **组装**:三段各自独立兜异常,这里只做缺项判定与文案拼接。
      // `errors` 是**账号级 map**(由额度段产生;目录/签到各带自己的 message/reason,不混进来),
      // 与 Nexus 同一形状:页面据此逐条报「哪个账号为什么没采到」。
      const missing: string[] = [];
      if (catalog.catalog.status === "missing") missing.push("catalog");
      if (quota.quota.status === "missing") missing.push("quota");
      if (!checkinCapable) missing.push("checkin");
      // ⚠️ **ok 看额度**:目录 / 签到失败都不该让整次刷新显示成失败(额度是真的
      // 刷到了),但也**不能假装成功** —— catalog / checkin / errors 各自带着自己
      // 的状态与原因。
      const ok = quota.written > 0;
      const message = `${quota.message};${catalog.message}${checkin.part ? `;${checkin.part}` : ""}`;
      return {
        ok,
        provider: pid,
        forced,
        checked,
        probed: quota.probed,
        written: quota.written,
        count: checked,
        message,
        missing,
        errors: quota.errors,
        quota: quota.quota,
        catalog: catalog.catalog,
        checkin: checkin.summary,
        skipped: [],
      };
    },

    /**
     * **只刷新额度/积分**(打开渠道页、点「刷新」共用这一条,2026-11-07 拆分语义)。
     *
     * ⚠️ 模型目录一律不拉(展开渠道卡片才拉),签到一律不跑(只有点「全部签到」才签)。
     * 返回口径:`quota.status` = ok / partial / failed / missing / skipped;
     * `errors` 为账号级 map(`"provider/username" → 原因`),成功时为空。
     */
    async syncChannelQuota(provider: string, force?: boolean): Promise<ApiResult> {
      const pid = String(provider ?? "");
      const forced = force !== false;
      // ⚠️ Qoder 走独立通道(2026-11-09):它的积分不在 `CH_QUOTA_PROVIDERS`
      // 那套探针里,`runQuotaSegment` 对它只会回 missing。这里先分流。
      const qoderRefresh = deps.qoderQuotaRefresh?.() ?? null;
      if (pid === "qoder" && qoderRefresh) {
        const q = await qoderRefresh(forced);
        if (q !== null) {
          return {
            ok: q.written > 0,
            provider: pid,
            probed: q.probed,
            message: q.message,
            missing: [],
            errors: q.errors,
            quota: { status: q.written > 0 ? "ok" : "failed", reason: q.message },
          };
        }
      }
      const accounts = await refreshAccountsOf(pid);
      const quota = await runQuotaSegment(pid, forced, accounts);
      return {
        ok: quota.written > 0,
        provider: pid,
        probed: quota.probed,
        message: quota.message,
        missing: quota.missing,
        errors: quota.errors,
        quota: quota.quota,
      };
    },

    /**
     * **只拉模型目录并落库**(展开渠道卡片时跑,2026-11-07 拆分语义)。
     *
     * ⚠️ 不签到、不刷额度 —— 展开卡片不该顺手打上游额度探针,也不该碰签到
     * (签到只在显式点「全部签到」时才跑)。
     */
    async syncChannelCatalog(provider: string, force?: boolean): Promise<ApiResult> {
      const pid = String(provider ?? "");
      const forced = force !== false;
      const accounts = await refreshAccountsOf(pid);
      const catalog = await runCatalogSegment(pid, forced, accounts);
      return {
        ok: catalog.catalog.status === "ok",
        provider: pid,
        written: catalog.written,
        count: catalog.count,
        message: catalog.message,
        missing: catalog.missing,
        errors: catalog.errors,
        catalog: catalog.catalog,
      };
    },

    /**
     * **批量只刷额度**(打开渠道页入口):对每个有额度能力的渠道各跑一次额度段。
     *
     * ⚠️ 逐渠道串行:每渠道内部的 per-account 探针共享 `chQuotaCache` 的冷却与单飞,
     * 上游压力与逐个调 `syncChannelQuota` 完全一致,只是把 N 次 IPC 收敛成 1 次。
     * 不拉模型目录、不签到 —— 这是「打开页面直接更新积分」的唯一含义。
     */
    async syncAllQuota(force?: boolean): Promise<ApiResult> {
      const forced = force !== false;
      const rows: Array<Record<string, unknown>> = [];
      const errorsAll: Record<string, string> = {};
      const missingAll = new Set<string>();
      let probed = 0;
      let written = 0;
      for (const pid of CH_QUOTA_PROVIDERS) {
        const accounts = await refreshAccountsOf(pid);
        const quota = await runQuotaSegment(pid, forced, accounts);
        probed += quota.probed;
        written += quota.written;
        Object.assign(errorsAll, quota.errors);
        for (const m of quota.missing) missingAll.add(m);
        rows.push({
          provider: pid,
          probed: quota.probed,
          written: quota.written,
          quota: quota.quota,
          message: quota.message,
          missing: quota.missing,
          errors: quota.errors,
        });
      }
      // ⚠️ **Qoder 单独一遍**(2026-11-09 用户报「qoder 不会自动更新」):
      // 它的积分不在 `CH_QUOTA_PROVIDERS` 那套探针里(读数来自 `qoderCredits`),
      // 所以上面那个循环根本刷不到它 —— 卡头永远显示「未采集」。
      // 放在循环之后串行跑:与其它渠道一样逐账号打上游,不额外加压。
      if (deps.qoderQuotaRefresh) {
        const qoderRefresh = deps.qoderQuotaRefresh();
        const q = qoderRefresh === null ? null : await qoderRefresh(forced);
        if (q !== null) {
          probed += q.probed;
          written += q.written;
          Object.assign(errorsAll, q.errors);
          rows.push({
            provider: "qoder",
            probed: q.probed,
            written: q.written,
            quota: { status: q.written > 0 ? "ok" : "failed", reason: q.message },
            message: q.message,
            missing: [],
            errors: q.errors,
          });
        }
      }
      // `ok` 口径:至少刷到过一个账号的额度;别处没有账号/没刷到则如实写失败文案。
      return {
        ok: written > 0,
        count: rows.length,
        probed,
        written,
        message: rows.length > 0
          ? `已刷新 ${rows.length} 个渠道额度(${written} 个账号成功${
              probed - written > 0 ? `,${probed - written} 个失败` : ""
            })`
          : "没有可刷新额度的渠道(CH_QUOTA_PROVIDERS = trae/workbuddy/minimax)",
        missing: [...missingAll],
        errors: errorsAll,
        channels: rows,
      };
    },
    // ── 客户端路径 ──────────────────────────────────────────────────────────
    async getClientPaths(): Promise<ClientPathsResult> {
      return getClientPathsImpl();
    },
    async saveClientPath(channel: string, path: string): Promise<ApiResult> {
      const pid = String(channel ?? "");
      const key = `client_path.${pid}`;
      const raw = String(path ?? "");
      // 路径不存在**不拒绝**(允许「先填后装」),但要说清楚。
      if (raw !== "" && !safeExists(raw)) {
        ctx.db.setting.set(key, raw);
        return {
          ok: true,
          channel: pid,
          message: `已保存 ${key}(⚠️ 该路径当前不存在,客户端装好后才会生效)`,
          changed: [key],
        };
      }
      ctx.db.setting.set(key, raw);
      return { ok: true, message: `已保存 ${key}`, changed: [key] };
    },
    async detectClientPath(channel: string): Promise<ApiResult> {
      const pid = String(channel ?? "");
      // 优先级:① 已保存(迁移库 / saveClientPath 写入)→ ② Nexus 候选表
      // (%LOCALAPPDATA%\Programs\...)→ ③ L 盘约定。
      const saved = ctx.db.setting.get(`client_path.${pid}`)?.v ?? null;
      if (saved !== null && saved !== "") {
        return {
          ok: true,
          channel: pid,
          detected_path: saved,
          source: "saved",
          message: `使用已保存的客户端路径(设置 client_path.${pid})`,
        };
      }
      const det = await probeClientPath(pid);
      if (!det.found || !det.detected_path) {
        return { ok: false, channel: pid, detected_path: null, message: det.message };
      }
      return { ok: true, channel: pid, detected_path: det.detected_path, source: det.source, message: det.message };
    },
    // ── 自动发现 / 接入(镜像 Nexus POST /providers/{id}/discover、/adopt) ───
    async discoverChannelAccounts(provider: string): Promise<DiscoverChannelResult> {
      const pid = String(provider ?? "");
      switch (pid) {
        case "trae": {
          const found = await discoverTraeAccounts();
          return {
            ok: true,
            provider: pid,
            found: found.length > 0,
            accounts: found.map((a) => ({
              username: a.username,
              region: a.region ?? null,
              hint: `来源:${a.source}${a.edition ? `(${a.edition})` : ""}${a.host ? `, host=${a.host}` : ""}`,
              token: a.token,
              edition: a.edition ?? null,
              source: a.source,
              token_expires_at_ms: a.token_expires_at_ms ?? null,
              // ⚠️ **身份字段必须透传**(2026-11-09 修 bug):以前这里逐字段手挑,
              // 把 `user_id` / `host` / `extra`(device_id / machine_id /
              // refresh_token / domain)全丢了 —— adopt 拿不到,写进库的凭据
              // 就只有 3 个键,签到被上游持续回 9074。
              user_id: a.user_id ?? null,
              host: a.host ?? null,
              extra: a.extra ?? null,
            })),
            message: found.length > 0
              ? `发现 ${found.length} 个本机 Trae 登录态(CLI token / 桌面版 storage.json)`
              : "未发现 Trae 本机登录态(已扫描 CLI token 与桌面版 storage.json;未登录或未安装)",
          };
        }
        case "workbuddy":
          return {
            ok: true,
            provider: pid,
            found: false,
            accounts: [],
            // ⚠️ 2026-11-08 复核(WorkBuddy 重新显性化):这条路径**没有失效**,
            // 它是「按设计找不到东西」—— WorkBuddy 没有可扫描的本机登录态
            // (官方桌面端的令牌在加密存储里,公开项目也都没做离线解密)。
            // 所以这里如实说明**怎么接入**,而不是假装扫了一圈没扫到。
            message:
              "WorkBuddy 没有可自动发现的本机登录态(官方客户端令牌在加密存储里,离线读不出)。" +
              "请从 WorkBuddy 客户端导出访问令牌后手动添加:面板导入或编辑 config 目录下的 " +
              "as-one.credentials.json(provider=workbuddy)。",
          };
        case "sensenova":
          return {
            ok: true,
            provider: pid,
            found: false,
            accounts: [],
            message: "SenseNova 无本机客户端登录态,不适用自动发现",
          };
        default:
          return { ok: false, provider: pid, found: false, accounts: [], message: `未知渠道 ${pid}` };
      }
    },
    async adoptChannelAccount(
      provider: string,
      username: string,
      token: string,
      region?: string,
      /**
       * 发现阶段拿到的**身份字段**(2026-11-09 修 bug)。
       *
       * ⚠️ 以前只写 `{source, adopted_at_ms, region}` 三个键,把发现阶段明明
       * 已经解析出来的 `device_id` / `user_id` / `edition` / `machine_id` /
       * `host` / `token_expires_at_ms` / `refresh_token` 全丢了。后果:
       * - `bvbhu`(走了另一条导入路径)有 18 个键,能正常签到;
       * - 通过 adopt 导入的账号只有 3 个键,缺 user_id/device_id,
       *   签到持续返回 9074(上游把不完整会话当异常);
       * - `adopted_at_ms` 还被写成**秒**(`wallNow()` 返回秒),按毫秒解析
       *   变成 1970 年。
       *
       * 现在把发现结果整包透传,只保留调用方明确给出的 region 优先。
       */
      extra?: Record<string, unknown>,
    ): Promise<ApiResult> {
      const pid = String(provider ?? "");
      const name = String(username ?? "").trim();
      const tok = String(token ?? "").trim();
      if (!pid || !name || !tok) {
        return { ok: false, provider: pid, message: "adopt 需要 provider/username/token" };
      }
      // ⚠️ `wallNow()` 返回**秒**,而字段名是 `_ms` —— 必须 ×1000,
      // 否则按毫秒解析会落到 1970 年(实测 bug:1970-01-22 02:21:08)。
      const raw: Record<string, unknown> = {
        source: "discover",
        adopted_at_ms: Math.round(wallNow() * 1000),
      };
      if (region) raw.region = String(region);
      // 发现阶段的身份字段整包透传(不含 provider/token —— token 走 secret 列,
      // 不该在 raw 里留第二份明文)。region 已在上面按入参写过,这里不覆盖。
      if (extra !== undefined && extra !== null) {
        for (const [k, v] of Object.entries(extra)) {
          if (v === undefined || v === null || v === "") continue;
          if (k === "provider" || k === "token" || k === "region") continue;
          raw[k] = v;
        }
      }
      // ⚠️ 2026-11-08(A4):**先自检,再入池**。
      //
      // 为什么放在接入这一步:凭据一进库,调度器就会把它当可用端点 ——
      // 一个已经被上游限制的账号会等到「第一次真的对话」才暴露,而那次请求已经
      // 带着反代身份打到上游了。这里先打一次**只读**计费探针(不消耗额度、
      // 不签到),命中 11140 就直接拒绝接入,并**不留凭据**。
      //
      // ⚠️ 为什么不顺带触发渠道熔断:自检阶段**一个对话请求都没发过**,不存在
      // 「已经用这台设备打过上游」的问题;熔断的语义是「打上游撞上封号之后停手」,
      // 在这里提前拉闸只会让用户更懵(他还没开始用)。只拒绝这一个账号即可。
      if (pid === "workbuddy") {
        const verdict = await probeWorkbuddyAccount({
          token: tok,
          ...(region ? { region: String(region) } : {}),
        });
        if (verdict.verdict === "banned") {
          return {
            ok: false,
            provider: pid,
            username: name,
            message:
              "该账号已被上游限制使用(code 11140),**未接入**。" +
              "换一个账号,或确认账号在官方客户端里还能正常登录后再试:" +
              verdict.message,
          };
        }
        // `unknown`(网络/计费接口异常)不阻断接入 —— 与网关侧同一口径的 fail-open。
        raw.selfcheck = { verdict: verdict.verdict, atMs: wallNow() };
      }
      // 镜像 Nexus adopt:只新增、按 username 合并(vault.put 对 undefined 字段保留原值)。
      await ctx.vault.put({ provider: pid, username: name, secret: tok, raw });
      ctx.syncRegistry(); // 新凭据 = 新账户行,索引要跟上
      return {
        ok: true,
        provider: pid,
        username: name,
        message: `已接入 ${pid}/${name}(自动发现导入${region ? `, region=${region}` : ""})`,
        changed: [credentialKey(pid, name)],
      };
    }
  };


  return methods;
}
