/**
 * Qoder 面板域 —— 独立管理页的数据面(账号池 / 模型目录 / 额度 / 签到 / 最近错误)。
 *
 * 与 assembly-sensenova.ts 同一套模式:deps 注入 + `methods` 返回,deps 只有
 * {@link PanelContext}(读 vault / configDir / accountOverlay),不碰网关闭包。
 *
 * 三个「真源」约定:
 * 1. **凭证真源是 vault**(`provider` = 区域名 `qoder` / `qoder-global`,
 *    `secret` = PAT `pt-…`)。本域只读写 vault,不自建账号表。
 * 2. **启停真源是 `ctx.accountOverlay`**(与其它供应商一致):`false` = 停用,
 *    缺省 = 启用。页面上的开关写这里,调度侧读同一份。
 * 3. **模型勾选真源是 configDir 下的 `qoder-models.json`**:勾选是本地偏好
 *    (上游目录只读,不能改它),放库表反而要迁移,所以用一个小 JSON 文件。
 *    **勾选同时登记 `real_model`**(取消即删行并摘逻辑模型成员)—— 用户要的是
 *    「勾上就能调度」,不是勾完再去「其他供应商」页手建一遍;清单外的端点在
 *    保存时删掉,语义对齐渠道页的 `setChannelModels`。
 *
 * 上游数据(目录 / 额度 / 活动)每次调用都走 `getQoderClient(region)`,与网关
 * 共用会话缓存:页面上看到的错误就是网关会遇到的错误。
 *
 * @module main/assembly-qoder
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  QODER_REGIONS,
  QODER_REGION_CONFIGS,
  isQoderRegion,
  type QoderCampaign,
  type QoderCatalogModel,
  type QoderCheckinOutcome,
  type QoderRegion,
  type QoderUsage,
} from "@as-one/core/src/connectors/qoder-wire.js";
import {
  QoderUpstreamError,
  getQoderClient,
  type QoderUpstreamErrorRecord,
} from "@as-one/core/src/connectors/qoder.js";
import type { CredentialSummary } from "@as-one/core/src/config/types.js";
import { defaultConcurrencyOf } from "@as-one/core/src/config/concurrency-defaults.js";
import type { NexusDatabase } from "@as-one/core/src/db/database.js";
import type {
  ApiResult,
  QoderAccountRow,
  QoderCatalogRow,
  QoderCheckinView,
  QoderCreditsView,
  QoderRegionStatus,
  QoderStatus,
} from "./types.js";
import { fpOf, parseDbMembers } from "./utils.js";
import { invalidateCheckinCache } from "./checkin-cache.js";
import type { PanelContext } from "./context.js";

/** 领域产物:面板方法集合。 */
export interface QoderDomain {
  methods: {
    getQoderAccounts(): Promise<{ accounts: QoderAccountRow[]; count: number }>;
    getQoderStatus(): Promise<QoderStatus>;
    getQoderModels(region?: string): Promise<QoderCatalogRow[]>;
    qoderRefreshCatalog(region?: string): Promise<ApiResult>;
    qoderSetModelEnabled(region: string, key: string, enabled: boolean): Promise<ApiResult>;
    qoderCredits(region: string, account?: string): Promise<QoderCreditsView[]>;
    /** 折叠态卡头用的缓存读数(不打上游)。 */
    qoderCreditsCached(): QoderCreditsView[];
    qoderCheckin(region: string, account?: string): Promise<QoderCheckinView[]>;
    qoderCampaigns(region: string, account?: string): Promise<{ campaigns: QoderCampaign[]; error: string | null }>;
    qoderAddAccount(region: string, name: string, pat: string): Promise<ApiResult>;
    qoderRemoveAccount(region: string, name: string): Promise<ApiResult>;
    qoderSetAccountEnabled(region: string, name: string, enabled: boolean): Promise<ApiResult>;
    qoderProbeChat(region: string, name?: string): Promise<ApiResult>;
    qoderRecentErrors(): Promise<{ errors: QoderUpstreamErrorRecord[] }>;
  };
}

/** 目录缓存条目(进程内)。 */
interface QoderCatalogCacheEntry {
  fetchedAtMs: number;
  models: QoderCatalogModel[];
  /** 拉取失败时保留上一次成功结果,同时记下错误文案。 */
  error: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

/** 勾选偏好的落盘形状。 */
interface QoderSelectionFile {
  version: 1;
  selected: Record<string, string[]>;
}

/**
 * qoder 供应商行:缺省建一行(`protocol = "qoder"`),已有行只把协议纠回 qoder。
 *
 * 放在模块级而不是 `createQoderDomain` 闭包里,是为了能被单元测试直接调用
 * (闭包里的函数要拿到 vault / PAT / 上游目录才跑得起来,测不了)。
 */
export function ensureQoderProviderRow(db: NexusDatabase, region: QoderRegion): void {
  const cfg = QODER_REGION_CONFIGS[region];
  const row = db.provider.get(region);
  if (row === undefined) {
    db.provider.insert({
      id: region,
      base_url: cfg.gateway,
      protocol: "qoder",
      env_prefix: `ONE_${region.toUpperCase().replace(/-/g, "_")}`,
    });
    return;
  }
  if (row.protocol !== "qoder") {
    db.provider.update({ id: region, protocol: "qoder" });
  }
}

/**
 * 从所有逻辑模型的档链里摘掉 `${provider}/${model}`(返回摘除处数)。
 *
 * ⚠️ `packages/panel/src/panel.ts` 里有一份同名闭包(模型域用)。两处逻辑
 * 完全一致,但一份在 `createPanel` 闭包里拿不到 `db` 之外的依赖,合并要先
 * 把模型域也改成模块级函数 —— 目前刻意重复,改动口径时**两处一起改**。
 */
export function stripMemberFromLogicalModels(
  db: NexusDatabase,
  provider: string,
  model: string,
): number {
  let removed = 0;
  for (const row of db.logicalModel.list()) {
    const parsed = parseDbMembers(row.members);
    const kept = parsed.filter((m) => !(m.provider === provider && m.model === model));
    if (kept.length === parsed.length) continue;
    db.logicalModel.update({ name: row.name, members: JSON.stringify(kept) });
    removed += parsed.length - kept.length;
  }
  return removed;
}

/** {@link syncSelectedRealModels} 的落库结果(给页面如实回报用)。 */
export interface QoderSelectionSync {
  /** 新登记的端点数 */
  added: number;
  /** 原本就在库里、这次只是保留下来的端点数 */
  kept: number;
  /** 目录里找不到、因此没登记的 key */
  skipped: string[];
  /** 从库里删掉的端点数(取消勾选) */
  removed: number;
  /** 从逻辑模型档链里连锁摘除的成员处数 */
  stripped: number;
}

/**
 * 上下文窗口取值 —— 含对「旧版默认档残留」的自愈。
 *
 * 三档优先级:
 * 1. 库里已有值(用户可能手改过,尊重它);
 * 2. 上游 `context_config` 的**最大档**(`maxContextTokens`);
 * 3. 上游 `max_input_tokens`(只是 `is_default` 那一档)。
 *
 * 自愈条件(**刻意收窄**,避免覆盖用户手改的值):
 * 库里值 **恰好等于** 上游默认档、且上游确实存在更大的档 → 升级到最大档。
 *
 * 背景:早期同步只写 `max_input_tokens`(默认档),而 `??` 链让旧值永远压住
 * 后面两个候选,于是「取最大档」那次修复对已登记行从不生效。实测 qfmodel
 * 卡在 180000 而上游同模型有 1M 档,连带把 auto 逻辑模型的窗口(取各成员
 * 最小值)也压成 180000 —— 用户看到的「auto 只有 180k」就是这个。
 */
function healDefaultTierWindow(
  stored: number | null | undefined,
  model: { maxInputTokens?: number; maxContextTokens?: number },
): number | null {
  const maxTier = model.maxContextTokens;
  const defaultTier = model.maxInputTokens;
  if (stored === null || stored === undefined) {
    return maxTier ?? defaultTier ?? null;
  }
  // 库值与上游默认档一致、且上游确有更大档 → 这是旧版残留,升级。
  if (
    maxTier !== undefined &&
    defaultTier !== undefined &&
    stored === defaultTier &&
    maxTier > defaultTier
  ) {
    return maxTier;
  }
  return stored;
}

/**
 * 在**不重新拉上游目录**的前提下,把已登记行的「默认档残留」窗口就地修正。
 *
 * 为什么需要:自愈写在 {@link syncSelectedRealModels} 里,而那个函数只在用户
 * 重新勾选模型时才跑;用户不改勾选就永远看不到修正结果。这里按「库里值 =
 * 该 provider 其它同名能力的常见默认档」无从判断,所以必须拿到上游目录 ——
 * 调用方负责先 `fetchModels` 再传进来。
 *
 * @returns 被修正的行数(0 = 本来就对,或目录里没有该 key)
 */
export function healQoderWindows(
  db: NexusDatabase,
  region: QoderRegion,
  models: readonly QoderCatalogModel[],
): number {
  const byKey = new Map(models.map((m) => [m.key, m]));
  let healed = 0;
  for (const row of db.realModel.listByProvider(region)) {
    const m = byKey.get(row.model);
    if (m === undefined) continue;
    const next = healDefaultTierWindow(row.max_input_tokens, m);
    if (next === null || next === row.max_input_tokens) continue;
    db.realModel.set({ ...row, max_input_tokens: next });
    healed += 1;
  }
  return healed;
}

/**
 * 把「勾选集合」写进库 —— 勾上 = 登记 real_model(立刻可被调度),
 * 取消 = 删行并从逻辑模型档链里摘除。
 *
 * 语义对齐渠道页的 `setChannelModels`:**清单即真源**,清单外的行删掉。
 * 目录里找不到该 key(还没拉到目录 / 上游已下架)时不瞎建,记进 `skipped`
 * 让调用方如实回报 —— 编造上下文长度、视觉能力比不登记更糟。
 *
 * 只碰库,不碰调度缓存与注册表快照(那两步由调用方在拿到结果后做,测试也
 * 就不必造 Scheduler)。
 *
 * @param models 该区域的上游目录(勾选行的能力字段从这里取)
 * @param wanted 页面上最终勾选的 key 集合
 */
export function syncSelectedRealModels(
  db: NexusDatabase,
  region: QoderRegion,
  models: readonly QoderCatalogModel[],
  wanted: ReadonlySet<string>,
): QoderSelectionSync {
  ensureQoderProviderRow(db, region);
  const byKey = new Map(models.map((m) => [m.key, m]));
  let added = 0;
  let kept = 0;
  const skipped: string[] = [];
  for (const key of wanted) {
    const m = byKey.get(key);
    if (m === undefined) {
      skipped.push(key);
      continue;
    }
    const row = db.realModel.get(region, key);
    // 已登记行的展示字段以库里为准(用户可能手改过),只补空值;
    // 思考强度是「能力事实」,缺省时按目录补。
    db.realModel.set({
      provider: region,
      model: key,
      name: row?.name ?? m.displayName,
      supports_vision: row?.supports_vision ?? (m.isVl ? 1 : 0),
      // 上下文窗口:库里没有才按上游补,且优先取 `context_config` 的**最大档**
      // (用户 2026-10-31:m37040 显示 200000 而上游 1M 档白扔 —— 取最大档)。
      //
      // ⚠️ 还要**自愈**「旧版默认档残留」:早期同步把上游 `max_input_tokens`
      // (只是 `is_default` 那一档)写进了库,而 `row?.x ?? …` 让这个旧值永远
      // 压住后面两个候选 —— 于是 m37040 那次修复对**已登记行**完全不生效。
      // 实测 qfmodel 卡在 180000(默认档)而上游同模型有 1M 档,连带把 auto
      // 逻辑模型的窗口(取各成员最小值)也压成 180000。
      // 判据刻意收窄:只有「库值**恰好等于**上游默认档、且上游确有更大的档」
      // 才升级 —— 用户手改过的其它值(如 500000)原样保留,不会被误覆盖。
      max_input_tokens: healDefaultTierWindow(row?.max_input_tokens, m),
      max_output_tokens: row?.max_output_tokens ?? m.maxOutputTokens ?? null,
      // ⚠️ **hidden 保留库里的现值,不写死 0**(2026-11-11 用户报
      // 「调整 qoder 模型列表会导致所有模型 hidden 重置」)。
      // 以前写死 `0`,于是每次勾选/取消任何一个模型,sync 就把 qoder 全部行
      // 的 hidden 抹成 0 —— 用户手改的隐藏状态全没了。
      // 修复:已登记行沿用 `row.hidden`;新行才落 0(上游 qoder 目录本身
      // 不提供 hidden 概念,`QoderCatalogModel` 没有该字段)。
      hidden: row?.hidden ?? 0,
      // ⚠️ 2026-11-08:并发是**每凭据**的;新行按供应商缺省(qoder 等 = 3),别写死。
      concurrency: row !== undefined && row.concurrency > 0 ? row.concurrency : defaultConcurrencyOf(region),
      // 非思考模型写 `"[]"`(网关一律不传 reasoning_effort);
      // 思考模型写 null(不拦,交给上游)。
      supported_reasoning_efforts:
        row?.supported_reasoning_efforts ?? (m.isReasoning ? null : "[]"),
      reasoning_allows_off: row?.reasoning_allows_off ?? null,
    });
    if (row === undefined) added += 1;
    else kept += 1;
  }
  let removed = 0;
  let stripped = 0;
  for (const row of db.realModel.listByProvider(region)) {
    if (wanted.has(row.model)) continue;
    stripped += stripMemberFromLogicalModels(db, region, row.model);
    db.realModel.delete(region, row.model);
    removed += 1;
  }
  return { added, kept, skipped, removed, stripped };
}

export function createQoderDomain(ctx: PanelContext): QoderDomain {
  const catalogs = new Map<QoderRegion, QoderCatalogCacheEntry>();
  /**
   * 最近一次 qoderCredits 的读数(账号 → 视图)。渠道卡「折叠态余额常显」读它,
   * **绝不打上游** —— 没拉过就是没有(卡头显示「未采集」,展开后刷新才有数)。
   */
  const lastCredits = new Map<string, import("./types.js").QoderCreditsView>();
  const selectionPath = join(ctx.configDir, "qoder-models.json");
  let selection = loadSelection();

  function loadSelection(): QoderSelectionFile {
    try {
      if (!existsSync(selectionPath)) return { version: 1, selected: {} };
      const parsed = JSON.parse(readFileSync(selectionPath, "utf8")) as Partial<QoderSelectionFile>;
      const selected: Record<string, string[]> = {};
      for (const [region, keys] of Object.entries(parsed.selected ?? {})) {
        if (!isQoderRegion(region)) continue;
        if (!Array.isArray(keys)) continue;
        selected[region] = keys.filter((k): k is string => typeof k === "string");
      }
      return { version: 1, selected };
    } catch {
      return { version: 1, selected: {} };
    }
  }

  function saveSelection(): void {
    try {
      writeFileSync(selectionPath, JSON.stringify(selection, null, 2), "utf8");
    } catch {
      // 落盘失败不该让页面崩:勾选仍然在当前进程内生效,只是重启后回退。
    }
  }

  /**
   * 页面上「看起来被勾选」的集合。
   *
   * 用户还没动过勾选(`qoder-models.json` 里该区域为空)时,目录里的
   * `isDefault` / `enable` 模型按默认勾选展示 —— 这里必须与
   * {@link toCatalogRows} 的判定保持同一口径,否则第一次点选时会把
   * 「看着勾上但没进库」的那批模型一起删掉。
   */
  function visualSelection(region: QoderRegion): Set<string> {
    const stored = selection.selected[region] ?? [];
    if (stored.length > 0) return new Set(stored);
    const entry = catalogs.get(region);
    if (entry === undefined) return new Set();
    return new Set(
      entry.models.filter((m) => m.isDefault || m.enable).map((m) => m.key),
    );
  }

  /** 落库 + 让调度/注册表立刻看见新端点(库是模块级纯函数在动)。 */
  function applySelectionToDb(region: QoderRegion, wanted: Set<string>): QoderSelectionSync {
    const applied = syncSelectedRealModels(
      ctx.db,
      region,
      catalogs.get(region)?.models ?? [],
      wanted,
    );
    try {
      ctx.scheduler.invalidate(); // 端点集合变了 → 调度缓存要重算
    } catch {
      /* 缓存失效失败不影响保存结果 */
    }
    ctx.syncRegistry();
    return applied;
  }

  /** 该区域所有账号(来自 vault)。 */
  async function accountsOf(region: QoderRegion): Promise<CredentialSummary[]> {
    const all = await ctx.vault.list(region);
    return all.filter((c) => c.provider === region);
  }

  /**
   * 该区域**全部**可用 PAT(启用且有凭据)。
   *
   * `account` 给了就只取那一个,不给就是整个账号池 —— 签到这类「该对每个人
   * 都做一次」的动作必须走这个函数,不能用 {@link patOf}(它只返回第一个)。
   */
  async function patTargetsOf(region: QoderRegion, account?: string): Promise<QoderCheckinTarget[]> {
    const rows = await accountsOf(region);
    const candidates = account === undefined || account === "" ? rows : rows.filter((r) => r.username === account);
    const out: QoderCheckinTarget[] = [];
    for (const row of candidates) {
      if (isDisabled(row.provider, row.username)) continue;
      const cred = await ctx.vault.get(row.provider, row.username);
      const pat = cred?.secret ?? "";
      if (pat !== "") out.push({ name: row.username, pat });
    }
    return out;
  }

  /** 单个可用 PAT(优先第一个启用且有 PAT 的账号;读目录/额度只需一把)。 */
  async function patOf(region: QoderRegion, account?: string): Promise<QoderCheckinTarget | null> {
    const [first] = await patTargetsOf(region, account);
    return first ?? null;
  }

  function isDisabled(provider: string, username: string): boolean {
    return ctx.accountOverlay.get(`${provider}/${username}`) === false;
  }

  function errorTextOf(error: unknown): string {
    if (error instanceof QoderUpstreamError) return error.message;
    if (error instanceof Error) return error.message;
    return String(error);
  }

  /** 拉目录(带 TTL 缓存;失败保留旧值并记错误)。 */
  async function refreshCatalog(region: QoderRegion, force = false): Promise<QoderCatalogCacheEntry> {
    const cached = catalogs.get(region);
    if (!force && cached !== undefined && Date.now() - cached.fetchedAtMs < CACHE_TTL_MS) return cached;
    const pat = await patOf(region);
    if (pat === null) {
      const entry: QoderCatalogCacheEntry = {
        fetchedAtMs: cached?.fetchedAtMs ?? 0,
        models: cached?.models ?? [],
        error: "没有可用的 PAT 账号（先在账号池里添加一个 pt-… 凭据）",
      };
      catalogs.set(region, entry);
      return entry;
    }
    try {
      const models = await getQoderClient(region).fetchModels(pat.pat);
      // 顺手自愈已登记行的「默认档残留」窗口:拉到目录是唯一能拿到
      // `context_config` 最大档的时机,不在这里做,用户不改勾选就永远看不到修正。
      // (写库后由调用方统一走 refreshProjection + scheduler.invalidate。)
      healQoderWindows(ctx.db, region, models);
      const entry: QoderCatalogCacheEntry = { fetchedAtMs: Date.now(), models, error: null };
      catalogs.set(region, entry);
      return entry;
    } catch (error) {
      const entry: QoderCatalogCacheEntry = {
        fetchedAtMs: cached?.fetchedAtMs ?? 0,
        models: cached?.models ?? [],
        error: errorTextOf(error),
      };
      catalogs.set(region, entry);
      return entry;
    }
  }

  function toCatalogRows(region: QoderRegion, entry: QoderCatalogCacheEntry): QoderCatalogRow[] {
    const selected = new Set(selection.selected[region] ?? []);
    return entry.models.map((m) => ({
      region,
      key: m.key,
      displayName: m.displayName,
      selected: selected.size === 0 ? m.isDefault || m.enable : selected.has(m.key),
      upstreamEnabled: m.enable,
      isDefault: m.isDefault,
      isReasoning: m.isReasoning,
      isVl: m.isVl,
      isFree: m.isFree,
      priceFactor: m.priceFactor ?? null,
      maxInputTokens: m.maxInputTokens ?? null,
      maxContextTokens: m.maxContextTokens ?? null,
      maxOutputTokens: m.maxOutputTokens ?? null,
    }));
  }

  return {
    methods: {
      async getQoderAccounts() {
        const clients = QODER_REGIONS.map((region) => getQoderClient(region));
        const accounts: QoderAccountRow[] = [];
        for (const region of QODER_REGIONS) {
          const rows = await accountsOf(region);
          const catalog = catalogs.get(region);
          const lastError = clients.find((c) => c.region === region)?.recentErrors()[0] ?? null;
          for (const row of rows) {
            const cred = await ctx.vault.get(row.provider, row.username);
            const raw = (row.raw ?? {}) as Record<string, unknown>;
            accounts.push({
              region,
              account: row.username,
              enabled: !isDisabled(region, row.username),
              hasPat: (cred?.secret ?? "") !== "",
              patHint: fpOf(cred?.secret),
              uid: typeof raw["uid"] === "string" ? raw["uid"] : null,
              userType: typeof raw["userType"] === "string" ? raw["userType"] : null,
              expiresAt: row.expiresAt ?? null,
              models: catalog?.models.length ?? 0,
              lastError: lastError?.body ?? null,
            });
          }
        }
        return { accounts, count: accounts.length };
      },

      async getQoderStatus() {
        const regions: QoderRegionStatus[] = [];
        for (const region of QODER_REGIONS) {
          const config = QODER_REGION_CONFIGS[region];
          const client = getQoderClient(region);
          const rows = await accountsOf(region);
          const catalog = catalogs.get(region);
          const errors = client.recentErrors();
          regions.push({
            region,
            label: config.label,
            gateway: config.gateway,
            openapi: config.openapi,
            accounts: rows.length,
            enabledAccounts: rows.filter((r) => !isDisabled(region, r.username)).length,
            catalogModels: catalog?.models.length ?? 0,
            catalogFetchedAtMs: catalog?.fetchedAtMs ?? null,
            catalogError: catalog?.error ?? null,
            lastError: errors[0] ?? null,
            requiresDeviceRisk: config.requiresDeviceRisk,
          });
        }
        return { checkedAtMs: Date.now(), regions };
      },

      async getQoderModels(region) {
        const target = isQoderRegion(region) ? region : undefined;
        const out: QoderCatalogRow[] = [];
        for (const r of target === undefined ? QODER_REGIONS : [target]) {
          const entry = await refreshCatalog(r);
          out.push(...toCatalogRows(r, entry));
        }
        return out;
      },

      async qoderRefreshCatalog(region) {
        const target = isQoderRegion(region) ? region : undefined;
        const changed: string[] = [];
        const messages: string[] = [];
        for (const r of target === undefined ? QODER_REGIONS : [target]) {
          const entry = await refreshCatalog(r, true);
          if (entry.error !== null) {
            messages.push(`${QODER_REGION_CONFIGS[r].label}: ${entry.error}`);
            continue;
          }
          changed.push(`${r}:${entry.models.length}`);
          messages.push(`${QODER_REGION_CONFIGS[r].label}: ${entry.models.length} 个模型`);
        }
        return {
          ok: messages.every((m) => !m.includes("失败")),
          message: messages.join("；") || "目录刷新完成",
          changed,
        };
      },

      async qoderSetModelEnabled(region, key, enabled) {
        if (!isQoderRegion(region)) return { ok: false, message: `未知区域: ${region}` };
        const modelKey = String(key ?? "").trim();
        if (modelKey === "") return { ok: false, message: "模型键不能为空" };
        // 先刷一次目录:登记 real_model 要用上游的上下文/视觉/思考能力,
        // 缓存过期时不刷新就会拿旧值建行。
        const entry = await refreshCatalog(region);
        const next = visualSelection(region);
        if (enabled) next.add(modelKey);
        else next.delete(modelKey);
        const applied = applySelectionToDb(region, next);
        selection = { version: 1, selected: { ...selection.selected, [region]: [...next] } };
        saveSelection();

        const parts = [enabled ? `已勾选 ${modelKey}` : `已取消 ${modelKey}`];
        if (applied.added > 0) parts.push(`新登记 ${applied.added} 个端点`);
        if (applied.removed > 0) parts.push(`删除 ${applied.removed} 个端点`);
        if (applied.stripped > 0) parts.push(`从逻辑模型档链连锁摘除 ${applied.stripped} 处`);
        if (applied.skipped.length > 0) {
          parts.push(
            `目录里找不到 ${applied.skipped.join(",")},未登记(先点「刷新目录」)`,
          );
        }
        if (entry.error !== null) parts.push(`目录刷新失败:${entry.error}`);
        return {
          ok: applied.skipped.length === 0 || !enabled,
          message: parts.join("；"),
          changed: [...next].map((k) => `${region}/${k}`),
        };
      },

      async qoderCredits(region, account) {
        if (!isQoderRegion(region)) return [];
        const rows = await accountsOf(region);
        const targets =
          account === undefined || account === "" ? rows.map((r) => r.username) : [account];
        const out: QoderCreditsView[] = [];
        for (const name of targets) {
          const cred = await ctx.vault.get(region, name);
          const pat = cred?.secret ?? "";
          if (pat === "") {
            out.push(emptyCredits(region, name, "该账号没有 PAT 凭据"));
            continue;
          }
          try {
            const usage = await getQoderClient(region).fetchUsage(pat);
            const view = creditsView(region, name, usage);
            out.push(view);
            lastCredits.set(`${region}/${name}`, view);
          } catch (error) {
            out.push(emptyCredits(region, name, errorTextOf(error)));
          }
        }
        return out;
      },

      /** 折叠态卡头用的**缓存读数**(不打上游):`region/account` → 最近一次 credits。 */
      qoderCreditsCached(): QoderCreditsView[] {
        return [...lastCredits.values()];
      },

      /**
       * 签到 —— **整个账号池逐个签**,不是只签第一个。
       *
       * 页面把「签到」并进了子标题行的刷新按钮(一次点击要对全部账号生效),
       * 而这里以前走的是 `patOf`(只返回第一个可用账号):双账号时第二个永远
       * 签不到,第一个若昨天已领,页面还会显示「签到 0/1」—— 看起来就是
       * 「插件不能签到」。
       */
      async qoderCheckin(region, account) {
        if (!isQoderRegion(region)) return [];
        const targets = await patTargetsOf(region, account);
        if (targets.length === 0) {
          return [
            {
              region,
              account: account ?? "",
              status: "unavailable",
              amount: null,
              validityDays: null,
              nextRefreshAtMs: null,
              message: "没有可用的 PAT 账号",
            },
          ];
        }
        return checkinEach(region, targets, (pat) => getQoderClient(region).claimDailyCredits(pat)).then(
          (views) => {
            // ⚠️ 真签到动作后打掉 qoder 的签到日缓存(2026-11-07):
            // claimed 状态变了必须失效;already-claimed 也失效 —— 缓存里若
            // 还是「未签」,那它本来就是过期的(活动 10 点刷新,跨刻查的旧值)。
            if (views.some((v) => v.status === "claimed" || v.status === "already-claimed")) {
              invalidateCheckinCache("qoder");
            }
            return views;
          },
        );
      },

      async qoderCampaigns(region, account) {
        if (!isQoderRegion(region)) return { campaigns: [], error: `未知区域: ${region}` };
        const pat = await patOf(region, account);
        if (pat === null) return { campaigns: [], error: "没有可用的 PAT 账号" };
        try {
          const campaigns = await getQoderClient(region).fetchCampaigns(pat.pat);
          return { campaigns, error: null };
        } catch (error) {
          return { campaigns: [], error: errorTextOf(error) };
        }
      },

      async qoderAddAccount(region, name, pat) {
        if (!isQoderRegion(region)) return { ok: false, message: `未知区域: ${region}（只支持 qoder / qoder-global）` };
        const username = String(name ?? "").trim();
        const token = String(pat ?? "").trim();
        if (username === "") return { ok: false, message: "账号名不能为空" };
        if (token === "") return { ok: false, message: "PAT 不能为空（应以 pt- 开头）" };
        // ⚠️ 必须先补 provider 行:`credential.provider` 有外键
        // `REFERENCES provider(id)`,而 qoder 的 provider 行只在「勾选模型」时
        // 才被 ensureQoderProviderRow 建出来 —— 用户先加账号就会撞
        // `FOREIGN KEY constraint failed`(2026-10-30 实测)。
        ensureQoderProviderRow(ctx.db, region);
        await ctx.vault.put({ provider: region, username, secret: token, raw: { kind: "pat" } });
        ctx.accountOverlay.set(`${region}/${username}`, true);
        // 写完立刻探一次:凭据错了要在「添加」这一步就说,而不是等页面空着。
        try {
          const models = await getQoderClient(region).fetchModels(token);
          catalogs.set(region, { fetchedAtMs: Date.now(), models, error: null });
          return { ok: true, message: `已添加 ${username}（上游返回 ${models.length} 个模型）`, provider: region, username };
        } catch (error) {
          return {
            ok: false,
            message: `凭据已保存，但上游校验失败: ${errorTextOf(error)}`,
            provider: region,
            username,
          };
        }
      },

      async qoderRemoveAccount(region, name) {
        if (!isQoderRegion(region)) return { ok: false, message: `未知区域: ${region}` };
        const removed = await ctx.vault.remove(region, name);
        ctx.accountOverlay.delete(`${region}/${name}`);
        return {
          ok: removed,
          message: removed ? `已删除 ${name}` : `没有找到账号 ${name}`,
          provider: region,
          username: name,
        };
      },

      async qoderSetAccountEnabled(region, name, enabled) {
        if (!isQoderRegion(region)) return { ok: false, message: `未知区域: ${region}` };
        ctx.accountOverlay.set(`${region}/${name}`, Boolean(enabled));
        return { ok: true, message: `${name} 已${enabled ? "启用" : "停用"}`, provider: region, username: name };
      },

      /**
       * 连通性探针:真的发一次最小 chat（8 token 上限的流式请求），只取首帧。
       *
       * 为什么不复用 `getToken`:Qoder 的签名与报文体绑定，只有真发一次 body 才能
       * 证明「PAT → jobToken → cosy 会话 → 编码 → 签名 → SSE」整条链路通。这里
       * 只读首帧、立刻中止，成本与一次健康检查相当。
       */
      async qoderProbeChat(region, name) {
        if (!isQoderRegion(region)) return { ok: false, message: `未知区域: ${region}` };
        const pat = await patOf(region, name);
        if (pat === null) return { ok: false, message: "没有可用的 PAT 账号" };
        const controller = new AbortController();
        try {
          let head = "";
          for await (const chunk of getQoderClient(region).chatStream(
            pat.pat,
            {
              modelKey: (selection.selected[region] ?? [])[0] ?? "lite",
              messages: [{ role: "user", content: "ping" }],
            },
            controller.signal,
          )) {
            head = chunk.content !== "" ? chunk.content : chunk.reasoning;
            break;
          }
          return { ok: true, message: `链路正常${head === "" ? "" : `（首帧: ${head.slice(0, 40)}）`}`, provider: region, username: pat.name };
        } catch (error) {
          return { ok: false, message: `链路探测失败: ${errorTextOf(error)}`, provider: region, username: pat.name };
        } finally {
          controller.abort();
        }
      },

      async qoderRecentErrors() {
        const errors: QoderUpstreamErrorRecord[] = [];
        for (const region of QODER_REGIONS) errors.push(...getQoderClient(region).recentErrors());
        errors.sort((a, b) => b.atMs - a.atMs);
        return { errors: errors.slice(0, 8) };
      },
    },
  };
}

/**
 * 签到积分「参考到期」估算 —— FIFO 阶梯模型(用户 2026-11-05 定案,不记流水)。
 *
 * 上游 `sash/api/v2/me/usage` 只给 addon 聚合 remaining,不给每笔领取时刻/到期。
 * 但签到活动明示每笔 100 Credits、领取后 30 天有效(`campaigns.benefit.validity
 * .days = 30`,RELATIVE_DAYS),连续签到即池内每笔 30/29/28/… 天递减:
 *
 *   384…400 分 → 4 笔 → 30/29/28/27 天 → 最早 27 天后
 *   284…300 分 → 3 笔 → 30/29/28 天   → 最早 28 天后
 *   184…200 分 → 2 笔 → 30/29 天      → 最早 29 天后
 *   1…100 分    → 1 笔 → 30 天        → 最早 30 天后
 *
 * 到期日 = 现在 + (31 − ceil(remaining/100)) 天。只是估算,用于「最近到期」的
 * 展示。
 */
export const QODER_DAILY_CHECKIN_CREDITS = 100;
export const QODER_CHECKIN_VALIDITY_DAYS = 30;

export function estimatedAddOnExpirySec(
  remaining: number | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (remaining === null || remaining === undefined || !(remaining > 0)) return null;
  const n = Math.max(1, Math.ceil(remaining / QODER_DAILY_CHECKIN_CREDITS));
  const daysLeft = Math.max(1, QODER_CHECKIN_VALIDITY_DAYS + 1 - n); // 30→29→…→1(31−n)
  return Math.floor(nowMs / 1000) + daysLeft * 86400;
}

/**
 * 组装 credits 视图的「最近到期」。
 *
 * 用户 2026-11-05 定案:**只按签到积分推算,不再用上游套餐级 expiresAt** ——
 * 那个"真实值"对 qoder 也不准(trial/套餐混合,且与我们可用的 addOn 口径不在
 * 一层),而签到积分按 FIFO 阶梯估算反而可预期。addOn 无余额 → null(不虚报)。
 */
export function viewExpiresAt(usage: QoderUsage, nowMs: number = Date.now()): number | null {
  return estimatedAddOnExpirySec(usage.addOnQuota?.remaining ?? null, nowMs);
}

function creditsView(
  region: QoderRegion,
  account: string,
  usage: QoderUsage,
  nowMs: number = Date.now(),
): QoderCreditsView {
  return {
    region,
    account,
    ok: true,
    error: null,
    userType: usage.userType ?? null,
    expiresAt: viewExpiresAt(usage, nowMs),
    userQuota: usage.userQuota
      ? {
          total: usage.userQuota.total ?? null,
          used: usage.userQuota.used ?? null,
          remaining: usage.userQuota.remaining ?? null,
          percentage: usage.userQuota.percentage ?? null,
        }
      : null,
    addOnQuota: usage.addOnQuota
      ? {
          total: usage.addOnQuota.total ?? null,
          used: usage.addOnQuota.used ?? null,
          remaining: usage.addOnQuota.remaining ?? null,
          percentage: usage.addOnQuota.percentage ?? null,
          detailUrl: usage.addOnQuota.detailUrl ?? null,
        }
      : null,
    orgResourcePackage: usage.orgResourcePackage
      ? {
          used: usage.orgResourcePackage.used ?? null,
          cap: usage.orgResourcePackage.cap ?? null,
          remaining: usage.orgResourcePackage.remaining ?? null,
          percentage: usage.orgResourcePackage.percentage ?? null,
          available: usage.orgResourcePackage.available,
        }
      : null,
    isQuotaExceeded: usage.isQuotaExceeded,
  };
}

/** 一个「可签到目标」:账号名 + 已取到的 PAT(停用/空凭据的账号不会进来)。 */
export interface QoderCheckinTarget {
  name: string;
  pat: string;
}

/**
 * 把「多账号签到」拉平成逐账号结果。
 *
 * 抽成纯函数而不是留在域方法里:域方法要读 vault、要 4 个依赖,而真正容易
 * 错的只有两件事 ——「一个账号失败不能拖累其它账号」和「三态怎么映射成
 * 页面文案」。这两件事不需要网络也不需要库,单独测更划算。
 *
 * 逐条串行:同一区域的账号共享上游配额,并发打过去只会更容易撞限流。
 */
export async function checkinEach(
  region: QoderRegion,
  targets: readonly QoderCheckinTarget[],
  claim: (pat: string) => Promise<QoderCheckinOutcome>,
): Promise<QoderCheckinView[]> {
  const out: QoderCheckinView[] = [];
  for (const t of targets) {
    try {
      const outcome = await claim(t.pat);
      if (outcome.status === "claimed") {
        out.push({
          region,
          account: t.name,
          status: "claimed",
          amount: outcome.amount ?? null,
          validityDays: outcome.validityDays ?? null,
          nextRefreshAtMs: outcome.nextRefreshAtMs ?? null,
          message: `已领取${outcome.amount === undefined ? "" : ` ${outcome.amount} Credits`}`,
        });
      } else if (outcome.status === "already-claimed") {
        out.push({
          region,
          account: t.name,
          status: "already-claimed",
          amount: null,
          validityDays: null,
          nextRefreshAtMs: outcome.nextRefreshAtMs ?? null,
          message: "今日已领取",
        });
      } else {
        out.push({
          region,
          account: t.name,
          status: "unavailable",
          amount: null,
          validityDays: null,
          nextRefreshAtMs: null,
          message: outcome.message,
        });
      }
    } catch (error) {
      // 一个账号的上游报错(凭据过期 / 429)只影响它自己,必须继续签下一个。
      out.push({
        region,
        account: t.name,
        status: "unavailable",
        amount: null,
        validityDays: null,
        nextRefreshAtMs: null,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return out;
}

function emptyCredits(region: QoderRegion, account: string, error: string): QoderCreditsView {
  return {
    region,
    account,
    ok: false,
    error,
    userType: null,
    expiresAt: null,
    userQuota: null,
    addOnQuota: null,
    orgResourcePackage: null,
    isQuotaExceeded: false,
  };
}
