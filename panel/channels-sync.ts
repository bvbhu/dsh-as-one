/**
 * 渠道同步域 —— 从 assembly-channels.ts 的 createChannelsDomain 闭包拆出
 * (重构第十二刀)。
 *
 * 职责:「额度/目录探针 + 客户端路径」整条读链:
 *   - 渠道额度(trae/workbuddy):按需拉取 + 内存快照 + 冷却闸门
 *     (chQuotaCooldownMs / chQuotaFetch / chMaybeFetchQuota / chAwaitQuota / chCreditsOf)
 *   - 上游模型目录:冷却 + 单飞 + 落库
 *     (catalogCooldownStateOf / catalogAccountOf / chCatalogCache / chCatalogGate /
 *      chCatalogInflight / chCatalogFetch / chAwaitCatalog / catalogFetchedAt /
 *      catalogRows / catalogRowsOf / probeProviderModels / serializeReasoningEfforts /
 *      mergeCatalog / modelsSourceOf)
 *   - 客户端路径探测(safeExists / probeClientPath / getClientPathsImpl)
 *
 * 共享状态(`chQuotaCache` 等三个 Map)仍定义在 assembly-channels.ts 模块级,
 * 经 `ChannelsSyncDeps` 注入 —— 网关侧的 `chQuotaTableForScheduler` 要读
 * 同一份,不能搬到这里(会失去与网关的共享)。
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
  probe_minimax_quota,
} from "@as-one/core/src/collector/quota.js";
import type {
  QuotaAccountInput,
  QuotaSnapshot,
} from "@as-one/core/src/collector/quota.js";
import { credentialKey } from "@as-one/core/src/config/credentials.js";
import { parseModelEntries } from "@as-one/core/src/gateway/model-catalog.js";
import { wallNow } from "@as-one/core/src/scheduler/engine.js";
import {
  CH_QUOTA_PROVIDERS,
  CLIENT_CANDIDATES,
  CLIENT_CHANNELS,
  CLIENT_INSTALL_ROOTS,
} from "./constants.js";
import { strOf } from "./refresh.js";
import { renewMinimaxAccount } from "./minimax-renew.js";
import type {
  AutoRefreshInfo,
  CatalogModel,
  ChannelCredits,
  ClientPathRow,
  ClientPathsResult,
} from "./types.js";
import type { PanelContext } from "./context.js";
/** 第十二刀:同步域需要的进程级共享状态(定义在 assembly-channels.ts 模块级)。 */
export interface ChannelsSyncDeps {
  /** 额度内存快照(账号 → 快照)。网关侧 chQuotaTableForScheduler 读同一份。 */
  chQuotaCache: Map<string, { fetchedAtMs: number; snapshot: QuotaSnapshot }>;
  /** 额度冷却闸门(账号 → 上次探测时刻)。 */
  chQuotaGate: Map<string, number>;
  /** 额度单飞(账号 → 进行中的探测)。 */
  chQuotaInflight: Map<string, Promise<QuotaSnapshot | null>>;
}
/** 同步域产物:额度探针 + 目录探针 + 客户端路径探测(22 个符号)。 */
export interface ChannelsSyncDomain {
  /** 冷却毫秒(读 external_refresh.interval_hours)。 */
  chQuotaCooldownMs: () => number;
  /** 单账号额度探针(trae/workbuddy),失败记 error 不抛。 */
  chQuotaFetch: (pid: string, username: string) => Promise<QuotaSnapshot | null>;
  /** 目录冷却状态(页面措辞用)。 */
  catalogCooldownStateOf: (pid: string) => AutoRefreshInfo;
  /** 额度按需拉取(冷却/单飞,fire-and-forget)。 */
  chMaybeFetchQuota: (pid: string, username: string, force?: boolean) => void;
  /** 额度等待(单飞 + 冷却,force 绕过)。 */
  chAwaitQuota: (pid: string, username: string, force?: boolean) => Promise<QuotaSnapshot | null>;
  /** 目录账号输入(pid+username → CatalogAccountInput,无密钥 → null)。 */
  catalogAccountOf: (pid: string, username: string) => Promise<CatalogAccountInput | null>;
  /** 目录内存缓存(账号 → 结果)。 */
  chCatalogCache: Map<string, { fetchedAtMs: number; result: CatalogResult }>;
  /** 目录冷却闸门。 */
  chCatalogGate: Map<string, number>;
  /** 目录单飞。 */
  chCatalogInflight: Map<string, Promise<CatalogResult>>;
  /** 上游目录抓取(无冷却)。 */
  chCatalogFetch: (pid: string, username: string) => Promise<CatalogResult>;
  /** 拉上游模型目录(冷却 + 单飞)。 */
  chAwaitCatalog: (pid: string, username: string, force?: boolean) => Promise<CatalogResult>;
  /** 目录抓取时刻(账号 → ms)。 */
  catalogFetchedAt: Map<string, number>;
  /** 目录结果缓存(账号 → model → entry)。 */
  catalogRows: Map<string, Map<string, CatalogEntry>>;
  /** 目录行读取(账号 → rows)。 */
  catalogRowsOf: (pid: string) => Map<string, CatalogEntry>;
  /** 探一个通用 OpenAI 目录端点。 */
  probeProviderModels: (url: string, bearerKey: string | null) => Promise<{ ok: true; entries: CatalogEntry[] } | { ok: false; message: string }>;
  /** 推理档位序列化(后端只存字符串/逗号连)。 */
  serializeReasoningEfforts: (efforts: readonly string[] | null | undefined) => string | null;
  /** 目录落库(只更新不插入)。 */
  mergeCatalog: (pid: string, entries: CatalogEntry[], baseUrl: string | null, protocol: string) => number;
  /** 模型来源文案。 */
  modelsSourceOf: (pid: string, models: CatalogModel[]) => string;
  /** 额度视图换算。 */
  chCreditsOf: (snapshot: QuotaSnapshot, fetchedAtMs: number) => ChannelCredits;
  /** 路径存在性。 */
  safeExists: (p: string) => boolean;
  /** 探测客户端安装路径。 */
  probeClientPath: (channel: string) => Promise<{ detected_path: string | null; found: boolean; source: "candidates" | "program-files" | "program-files-x86" | "localappdata" | "ldrive" | "registry" | "none"; message: string }>;
  /** 全部客户端路径探测(遍历 CLIENT_CANDIDATES)。 */
  getClientPathsImpl: () => Promise<ClientPathsResult>;
}
/**
 * 合并目录时 `supports_vision` 该取哪个值 —— **纯函数,单独抽出来钉死**。
 *
 * 只升不降:上游目录说能读图(→ `entry.vision === true`)就置 1,其余一律保留
 * 库里旧值。
 *
 * ⚠️ 为什么**不**跟着目录降级(2026-11-02 实测):`sensenova` 的 `/v1/models`
 * 对 `deepseek-flash` 写的是 `input_modalities:["text"]`,而同一把 key 直接发图,
 * 它**准确读出了图里的两行文字**(红「AI4」蓝「2026」)。这份目录会漏报 ——
 * 拿它把库里的 1 改成 0,等于把一只看得见的眼睛主动蒙上,以后每张图都得先绕
 * 一次免费档转写。
 *
 * 「库里标了 1、上游其实看不见图」那种反方向的错,兜底不在这里 —— 那需要网关
 * 在上游拒图时改走图像桥重发;本函数只保证刷新不会把已知能力刷丢。
 */
export function nextSupportsVision(existing: number, entry: Pick<CatalogEntry, "vision">): number {
  return entry.vision ? 1 : existing;
}

/**
 * 合并目录时 `max_input_tokens` / `max_output_tokens` 该取哪个值 —— **纯函数**。
 *
 * 「用户没填(null)→ 用上游目录值补上;用户填过(非 null)→ 保留用户值」。
 * 2026-11-06 用户反馈:sensenova 刷新不自动填上下文窗口 —— 上游给了
 * `context_length` 但 mergeCatalog 保留 existing(null 就一直是 null),选择器
 * 永远看不到窗口。这里把「补空」语义抽出来钉死:刷新只补洞,不覆盖手改。
 */
export function nextDeclaredCapability(
  existing: number | null | undefined,
  upstream: number | null | undefined,
): number | null {
  if (existing !== null && existing !== undefined) return existing;
  return upstream ?? null;
}

export function createChannelsSyncDomain(
  ctx: PanelContext,
  deps: ChannelsSyncDeps,
): ChannelsSyncDomain {
  const { chQuotaCache, chQuotaGate, chQuotaInflight } = deps;
    // ── 面板方法 ─────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────────
  // 渠道额度(trae/workbuddy):按需拉取 + 内存快照 + 冷却闸门。
  // 镜像 Nexus collector/trae.py、collector/workbuddy.py 的口径:
  //   - 不落库(D17),重启即空 —— 需要时由 syncChannel(force)/页面拉起;
  //   - 冷却跟随设置 external_refresh.interval_hours(Nexus _refresh_cooldown_s 同源),
  //     只约束自动刷新,用户点「刷新」用 force 绕过;
  //   - 失败记 QuotaSnapshot.error(真实原因),永不伪造成功。
  // ────────────────────────────────────────────────────────────────────────────
  /** 冷却毫秒:读设置 external_refresh.interval_hours(默认 24h),非法回退 24h。 */
  const chQuotaCooldownMs = (): number => {
    const raw = ctx.db.setting.get("external_refresh.interval_hours")?.v ?? "24";
    const hours = Number(raw);
    const h = Number.isFinite(hours) && hours > 0 ? hours : 24;
    return h * 3600 * 1000;
  };
  /** 单账号额度探针(trae/workbuddy;其他渠道不支持 → null)。失败记 error,不抛。 */
  const chQuotaFetch = async (pid: string, username: string): Promise<QuotaSnapshot | null> => {
    const key = credentialKey(pid, username);
    if (!CH_QUOTA_PROVIDERS.has(pid)) return null;
    const cred = await ctx.vault.get(pid, username);
    const token = cred?.secret ?? null;
    if (!token || !cred) return null; // 没有密钥 → 不出现在额度里(镜像 Nexus leftover)
    const raw = cred.raw ?? {};
    const account: QuotaAccountInput = {
      credentialKey: key,
      provider: pid,
      username,
      token,
      region: strOf(raw, "region"),
      uid: strOf(raw, "uid") ?? strOf(raw, "user_id"),
      enterprise_id: strOf(raw, "enterprise_id"),
      extras: raw,
    };
    let snapshot: QuotaSnapshot;
    try {
      snapshot = pid === "trae"
        ? await probe_trae_quota(account)
        : pid === "minimax"
          ? await probe_minimax_quota(account, {
              // 401 时自动 refresh 续期并重试(2026-11-07):minimax token
              // 只有数小时寿命,过期后不续期就永远「未采集」。
              onAuthExpired: (acct) =>
                renewMinimaxAccount(acct, { vault: ctx.vault, provider: pid, username }),
            })
          : await probe_workbuddy_quota(account);
    } catch (err) {
      snapshot = {
        credentialKey: key,
        remaining: null,
        limit: null,
        expires_at: null,
        fetched_at: Math.floor(Date.now() / 1000),
        packs: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
    chQuotaCache.set(key, { fetchedAtMs: Date.now(), snapshot });
    // ⚠️ 立即让调度缓存失效:engine 的 `_quotaMap()` 有 ttl(默认 300s)缓存,
    // 不清的话「刷新后到期时间已更新」要等 5 分钟才影响排序 —— 用户点了刷新
    // 却看到路由没变,只会当成 bug。invalidate() 不动 _refreshAt(不会触发
    // 额外的额度预取),只清链/额度/配置三份记忆化。
    try {
      ctx.scheduler.invalidate();
    } catch {
      /* 缓存失效失败不影响探测结果 */
    }
    return snapshot;
  };
  /**
   * 某渠道的**模型目录冷却状态**(B2:页面据此说明「为什么刷新没打上游」)。
   *
   * ⚠️ 口径与 `chAwaitCatalog` 的闸门一致:拉过一次之后,`冷却时长`内**不再打上游**
   * (自动刷新);用户手点「刷新」是 force,绕过冷却 —— 所以这个状态说的是
   * 「**自动**刷新会跳过」,不是「你点的刷新被拒了」。
   *
   * `armed: false` = 本机没有后台自动刷新循环(As One 的常态),于是「冷却期内
   * 跳过」只对后台循环有意义 —— 页面据此措辞,不夸大。
   */
  function catalogCooldownStateOf(pid: string): AutoRefreshInfo {
    const cooldownS = Math.round(chQuotaCooldownMs() / 1000);
    let newest = 0;
    for (const [key, entry] of chCatalogCache.entries()) {
      if (!key.startsWith(`${pid}/`)) continue;
      if (entry.fetchedAtMs > newest) newest = entry.fetchedAtMs;
    }
    const ageS = newest > 0 ? Math.round((Date.now() - newest) / 1000) : null;
    const nextInS = ageS === null ? null : Math.max(0, cooldownS - ageS);
    return {
      armed: false,
      cooldown_s: cooldownS,
      catalog_age_s: ageS,
      quota_age_s: null,
      catalog_next_in_s: nextInS,
      quota_next_in_s: null,
      cooling: ageS !== null && nextInS !== null && nextInS > 0,
      quota_exhausted: null,
    };
  }
  /** 冷却闸门拉取(单飞);force=true 绕过冷却(镜像 Nexus force 语义)。 */
  const chMaybeFetchQuota = (pid: string, username: string, force = false): void => {
    const key = credentialKey(pid, username);
    const now = Date.now();
    const cd = chQuotaCooldownMs();
    if (!force) {
      const cached = chQuotaCache.get(key);
      if (cached && now - cached.fetchedAtMs < cd) return;
      if (now - (chQuotaGate.get(key) ?? 0) < cd) return;
    }
    chQuotaGate.set(key, now);
    if (!chQuotaInflight.has(key)) {
      const p = chQuotaFetch(pid, username).finally(() => chQuotaInflight.delete(key));
      chQuotaInflight.set(key, p);
    }
  };
  /** 拉取并等待(force 语义与 syncChannel 联用)。失败 → {snapshot,error} 不抛。 */
  const chAwaitQuota = async (pid: string, username: string, force = false): Promise<QuotaSnapshot | null> => {
    const key = credentialKey(pid, username);
    const now = Date.now();
    const cd = chQuotaCooldownMs();
    const cached = chQuotaCache.get(key);
    if (!force && cached && now - cached.fetchedAtMs < cd) return cached.snapshot;
    if (!force && now - (chQuotaGate.get(key) ?? 0) < cd) {
      // 冷却内:有缓存就返回,没有就等飞单里的
      if (cached) return cached.snapshot;
      const inflight = chQuotaInflight.get(key);
      if (inflight) return inflight;
      return null;
    }
    chQuotaGate.set(key, now);
    const p = chQuotaFetch(pid, username);
    chQuotaInflight.set(key, p.finally(() => chQuotaInflight.delete(key)));
    return p;
  };
  /**
   * 凭据 → 目录拉取账号上下文(镜像 Nexus `AccountContext`)。
   *
   * 与 `chQuotaFetch` 的取数完全同源(同一 vault.get / 同一 raw 字段),
   * 保证「读目录」与「读额度」用的是同一份凭据口径。
   * 没有密钥 → null(调用方按「没有账号」处理,不伪造成功)。
   */
  const catalogAccountOf = async (pid: string, username: string): Promise<CatalogAccountInput | null> => {
    const cred = await ctx.vault.get(pid, username);
    const token = cred?.secret ?? null;
    if (!token || !cred) return null;
    const raw = cred.raw ?? {};
    return {
      provider: pid,
      username,
      token,
      region: strOf(raw, "region"),
      uid: strOf(raw, "uid") ?? strOf(raw, "user_id"),
      enterprise_id: strOf(raw, "enterprise_id"),
      extras: raw,
      // provider.base_url 只给 openai 兼容端点用;trae/workbuddy 的目录主机
      // 在 core catalog.ts 内部按区域推导(刻意不读聊天端点,理由见该文件)。
      baseUrl: null,
    };
  };
  /**
   * 渠道模型目录拉取(免额度):trae = wire ∪ remote、workbuddy = /v3/config、
   * sensenova = token/v1/models。失败抛错(调用方转 ApiResult)。
   *
   * 冷却语义与 Nexus `_refresh_cooldown_s` 对齐:**只约束自动刷新**,
   * 用户点「刷新」(force) 绕过 —— 与 chAwaitQuota 同一套闸门。
   */
  const chCatalogCache = new Map<string, { fetchedAtMs: number; result: CatalogResult }>();
  const chCatalogGate = new Map<string, number>();
  const chCatalogInflight = new Map<string, Promise<CatalogResult>>();
  const chCatalogFetch = async (pid: string, username: string): Promise<CatalogResult> => {
    const account = await catalogAccountOf(pid, username);
    if (account === null) throw new Error(`${pid}/${username} 没有可用密钥`);
    const pdef = ctx.registry.getProvider(pid);
    const result = await fetch_catalog(pid, account, {
      // openai 兼容端点(如 sensenova 的 token 站)可显式覆盖基址。
      baseUrl: catalog_supported(pid) ? undefined : (pdef?.baseUrl ?? undefined),
    });
    chCatalogCache.set(`${pid}/${username}`, { fetchedAtMs: Date.now(), result });
    return result;
  };
  /** 冷却闸门拉取(单飞);force=true 绕过冷却(镜像 Nexus force 语义)。 */
  const chAwaitCatalog = async (pid: string, username: string, force = false): Promise<CatalogResult> => {
    const key = `${pid}/${username}`;
    const now = Date.now();
    const cd = chQuotaCooldownMs();
    const cached = chCatalogCache.get(key);
    if (!force && cached && now - cached.fetchedAtMs < cd) return cached.result;
    if (!force && now - (chCatalogGate.get(key) ?? 0) < cd) {
      if (cached) return cached.result;
      const inflight = chCatalogInflight.get(key);
      if (inflight) return inflight;
      throw new Error("冷却中,请稍后再试");
    }
    chCatalogGate.set(key, now);
    const p = chCatalogFetch(pid, username).finally(() => chCatalogInflight.delete(key));
    chCatalogInflight.set(key, p);
    return p;
  };
  /** 每个渠道最近一次「真的从上游拉到目录」的时刻(页面「上次回源」用)。 */
  const catalogFetchedAt = new Map<string, number>();
  /**
   * 上游目录的**进程内缓存**(provider → 裸模型名 → 条目)。
   *
   * 为什么要有它:渠道页的模型表是「上游目录 ∪ 已登记」两边合并出来的
   * (Nexus `_merge_catalog`),而「上游目录」只存在于这一次拉取的结果里 ——
   * 没登记进 `real_model` 的模型**不能**写库(写了就等于替用户勾了选),
   * 可又必须在表格里显示成**未勾选**(否则用户看不到上游新出了什么)。
   * Nexus 用 `_CATALOG_CACHE` 做同一件事(内存 + TTL,重启即清),这里同构。
   */
  const catalogRows = new Map<string, Map<string, CatalogEntry>>();
  /** 取某渠道的上游目录缓存(没有 → 空表)。 */
  const catalogRowsOf = (pid: string): Map<string, CatalogEntry> =>
    catalogRows.get(pid) ?? new Map<string, CatalogEntry>();
  /**
   * 把上游目录并进运行期视图 —— **「刷新」能刷新模型目录**的关键一步。
   *
   * 以前 syncChannel 只 `fetch_catalog` 不写库:上游拉到了,但
   * `getProviderPage` 读的是 `db.real_model` ∪ 注册表,于是刷新前后表格一模一样
   * (症状:「点刷新,模型目录纹丝不动」)。
   *
   * ⚠️ **不再把上游模型直接 upsert 进 `real_model`**。Nexus 的口径是
   * 「目录 = 上游有什么,勾选 = 我要用哪些」:没勾的行只活在
   * {@link catalogRows} 里,勾了才由 `setChannelModels` 真正入库。以前靠
   * `hidden = 1` 表达「没勾」,那会把两个不同的概念压成一个位:
   * `hidden` 是**部署页**那个「是否列入 /v1/models」(D28),拿它反推渠道页的
   * 勾选态,正是「打开页面点一下保存就把模型删掉」的根因(见
   * {@link mergedChannelModels} 的注释)。
   *
   * 对**已登记**的行,这里只补上游的能力事实(名称 / 视觉 / 上下文 / 最大输出),
   * 且**只在用户没写过时**才补 —— 刷新不该把用户明确改过的声明覆盖回上游那一份。
   * ⚠️ 只更新不插入、不删除:删行是另一条写路径(整批 `setChannelModels`)。
   */
  /**
   * 探测一个 OpenAI 兼容 `/models` 端点,返回解析好的模型条目。
   *
   * 单独抽出来是为了把「探测」这件只读动作的失败原因说得清楚(见 `fetchModels`)。
   *
   * @param bearerKey 明文密钥;`null` = 上游不需要密钥(本地/内网网关常见)。
   */
  async function probeProviderModels(
    url: string,
    bearerKey: string | null,
  ): Promise<{ ok: true; entries: CatalogEntry[] } | { ok: false; message: string }> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (bearerKey !== null) headers["Authorization"] = `Bearer ${bearerKey}`;
    let res: Response;
    let bodyText: string;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    } catch (err) {
      // `fetch failed` 本身没有任何信息量(Node 把真因塞在 cause 链上:E_CONNREFUSED /
      // ENOTFOUND / 证书错误…),所以要把 cause 一起打出来,否则用户只看到一句
      // 「fetch failed」无从下手。
      const why = err instanceof Error ? `${err.name}:${err.message}` : String(err);
      const cause = err instanceof Error && err.cause instanceof Error
        ? `(${err.cause.message})`
        : "";
      return { ok: false, message: `打不到上游(10 秒后放弃):${why}${cause}` };
    }
    if (res.status >= 400) {
      return {
        ok: false,
        message: `上游返回 HTTP ${res.status} —— 这是**探测失败**,不代表上游没有模型(密钥不对/网关上线路由都可能这样)`,
      };
    }
    try {
      bodyText = await res.text();
    } catch (err) {
      return { ok: false, message: `读上游响应失败:${err instanceof Error ? err.message : String(err)}` };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      const clip = bodyText.replace(/[^\x20-\x7e\u4e00-\u9fff\n]/g, "?").slice(0, 120);
      const isHtml = /^\s*</.test(bodyText);
      return {
        ok: false,
        message: isHtml
          ? `上游返回的不是 JSON 而是一个网页(HTTP ${res.status})。这通常说明**地址不对** —— 该端点返回的是管理台/登录页,不是模型列表接口;请核对 base_url 与路径(常见是少了 /v1)。原始响应开头:${clip}`
          : `上游返回的不是 JSON(HTTP ${res.status}),无法解析模型清单:${clip}`,
      };
    }
    const parsed = parseModelEntries(payload);
    if (parsed === null) {
      return {
        ok: false,
        message: "上游回了 JSON,但认不出模型列表(期望 data / models 数组,或直接是字符串数组)",
      };
    }
    // 上游目录的条目形状与 catalog.ts 的 CatalogEntry 对齐:`name` 用裸 id
    // (目录行只负责展示,登记时由 setChannelModels 决定最终 name)。
    const entries: CatalogEntry[] = parsed.map((e) => ({
      id: e.id,
      name: e.id,
      vision: e.vision,
      context_window: e.context_window,
      max_output: e.max_output,
      rate: null,
      origin: "remote",
      callable: true,
    }));
    return { ok: true, entries };
  }
  /**
   * `CatalogEntry.reasoning_efforts`(内存三态)→ 库里的 TEXT 列。
   *
   * - `null`(上游没给档位表)→ 存 `NULL`:网关**不拦**(让上游自己决定要不要收)。
   * - `[]`(上游明说不支持思考)→ 存 `'[]'`:网关**一律不传** reasoning_effort。
   * - `["low","high"]` → 存 `'["low","high"]'`:网关按名单过滤。
   */
  function serializeReasoningEfforts(efforts: readonly string[] | null | undefined): string | null {
    if (efforts === null || efforts === undefined) return null;
    return JSON.stringify(efforts);
  }
  const mergeCatalog = (
    pid: string,
    entries: CatalogEntry[],
    baseUrl: string | null,
    protocol: string,
  ): number => {
    // ⚠️ **只更新,绝不插入**(2026-10-24 用户反馈:「点击获取可用模型会导致提供商被创建」)。
    // 目录探测是**只读**动作:provider 行只能由「保存」({@link upsertModelProvider})建。
    // 还没登记的供应商照样能把目录取回来 —— 它只活在 catalogRows 内存缓存里,
    // 用户勾选保存时才随 setChannelModels 一起落库。
    //
    // 以前这里会 `provider.insert`,于是「填表 → 点获取可用模型」就把一家空壳供应商
    // 建进了库:用户随后看到列表里多了一家自己没打算加的供应商,而且它的 real_model
    // 里一条都没有(因为没勾就保存)。
    const prow = ctx.db.provider.get(pid);
    if (prow) ctx.db.provider.update({ id: pid, base_url: baseUrl, protocol });
    const rows = catalogRows.get(pid) ?? new Map<string, CatalogEntry>();
    for (const entry of entries) rows.set(entry.id, entry);
    catalogRows.set(pid, rows);
    for (const entry of entries) {
      const existing = ctx.db.realModel.get(pid, entry.id);
      if (!existing) continue; // 没登记:只进目录缓存,不写库
      ctx.db.realModel.update({
        provider: pid,
        model: entry.id,
        // 已登记行的名称不动(用户可能改过)。
        name: existing.name,
        // 声明字段**默认**不覆盖用户写过的值:刷新的职责是「补进目录」,
        // 不是把用户改过的上下文/输出覆盖回上游那一份。
        //
        // ⚠️ 例外一:`supports_vision` 是**能力事实**,不是用户偏好 —— 判据见
        //   {@link nextSupportsVision}(目录说能读图就升到 1;说不支持则保留旧值,
        //   因为这份目录实测会漏报:deepseek-flash 被写成 ["text"] 却能读图)。
        //
        // ⚠️ 例外二(2026-11-06 用户反馈「sensenova 刷新不自动填上下文窗口」):
        //   `max_input_tokens` / `max_output_tokens` **为 null 时用上游值补上**。
        //   用户从没填过(库里是 null)→ 刷新拿到 context_window / max_output
        //   就顺手填进声明,让选择器/网关立刻用得上;用户填过(非 null)→ 仍保留
        //   用户值(刷新不覆盖手改)。用 `??` 而不是无条件覆盖,正是这个语义。
        supports_vision: nextSupportsVision(existing.supports_vision, entry),
        max_input_tokens: nextDeclaredCapability(existing.max_input_tokens, entry.context_window),
        max_output_tokens: nextDeclaredCapability(existing.max_output_tokens, entry.max_output),
        // 思考强度是**能力事实**:上游给了档位就覆盖(新档位立刻生效);
        // 上游这轮没给(`null` = 未知)**保留旧值** —— 表可能是用户手写/手动
        // 补进去的,刷新不该把它冲成 NULL(否则选择器和网关发送会一起消失)。
        supported_reasoning_efforts:
          entry.reasoning_efforts === null
            ? existing.supported_reasoning_efforts
            : serializeReasoningEfforts(entry.reasoning_efforts),
        reasoning_allows_off:
          entry.reasoning_allows_off === null
            ? existing.reasoning_allows_off
            : entry.reasoning_allows_off,
      });
    }
    catalogFetchedAt.set(pid, Date.now());
    return entries.length;
  };
  /**
   * 模型表来源标签(Nexus `_models_source` 的 TS 对应物)。
   *
   * - `router`  这一轮没拉到上游目录(或该渠道没有这条通路),显示已登记清单;
   * - `api`     全是上游目录行;
   * - `mixed`   上游目录 + 已登记(库里多出上游这一轮没有的模型)。
   *
   * ⚠️ 与 Nexus 同一口径:**全上游才算 `api`**,只要有一行是「纯登记表」来源
   * (`origin === "router"`)就是 `mixed`。以前用「有没有拉过目录」一个布尔量
   * 代替,于是「上游只回了 3 个、库里有 20 个」也会被标成 `mixed` 之外的值,
   * 页面上的来源说明与表格内容对不上。
   */
  function modelsSourceOf(pid: string, models: CatalogModel[]): string {
    if (!catalogFetchedAt.has(pid) || catalogRowsOf(pid).size === 0) return "router";
    const fromUpstream = models.filter((m) => m.origin !== "router").length;
    if (fromUpstream === 0) return "router";
    return fromUpstream === models.length ? "api" : "mixed";
  }
  /** QuotaSnapshot → 契约 ChannelCredits(packages 已折算毫秒)。 */
  const chCreditsOf = (snapshot: QuotaSnapshot, fetchedAtMs: number): ChannelCredits => {
    return {
      left: snapshot.remaining,
      total: snapshot.limit,
      expires_at_ms: snapshot.expires_at !== null ? snapshot.expires_at * 1000 : null,
      fetched_at_ms: fetchedAtMs,
      packages: snapshot.packs.map((p) => ({
        package_name: p.name,
        remain: p.remain ?? 0,
        size: p.limit ?? 0,
        monthly: p.extra?.monthly === true,
        expires_at_ms: p.expires_at !== null ? p.expires_at * 1000 : null,
        refresh_at_ms: p.extra?.refresh_at !== undefined && p.extra.refresh_at !== null
          ? Number(p.extra.refresh_at) * 1000
          : null,
      })),
      expiring_soon: (() => {
        if (snapshot.packs.length === 0) return null;
        const soonS = wallNow() + 3 * 86400; // 3 天内到期 = 快到期(Nexus SOON_MS 同款)
        return snapshot.packs.some((p) => p.expires_at !== null && p.expires_at > 0 && p.expires_at <= soonS && p.counts_for_expiry);
      })(),
      not_applicable: false,
      error: snapshot.error,
    };
  };
    // ── 闭包内工具(客户端路径探测被 getClientPaths/getProviderPage 复用) ──────
    function safeExists(p: string): boolean {
      try {
        return existsSync(p);
      } catch {
        return false;
      }
    }
    /**
     * 纯探测(不看已保存配置):按 `CLIENT_INSTALL_ROOTS` 逐个根 × 候选表。
     *
     * 2026-10-30 修正:原先只试 `%LOCALAPPDATA%\Programs` 与 L 盘,漏了官方
     * 默认安装位置(`C:\Program Files\Trae\`)。现在根列表集中在
     * `constants.ts` 的 `CLIENT_INSTALL_ROOTS`,这里只负责展开环境变量。
     * detectClientPath 面板方法在此基础上把「已保存」提到最高优先级。
     */
    async function probeClientPath(channel: string): Promise<{
      detected_path: string | null;
      found: boolean;
      source: "candidates" | "program-files" | "program-files-x86" | "localappdata" | "ldrive" | "none";
      message: string;
    }> {
      const pid = String(channel ?? "");
      const table = CLIENT_CANDIDATES[pid] ?? [];
      /** 展开 `%VAR%`;任何一个变量展开不出来 → 返回 null(整条根跳过)。 */
      const expandRoot = (template: string): string | null => {
        let missing = false;
        const out = template.replace(/%([^%]+)%/g, (_m, name: string) => {
          const v = process.env[name]?.trim();
          if (!v) {
            missing = true;
            return "";
          }
          return v;
        });
        return missing || out.trim() === "" ? null : out;
      };
      const checked: string[] = [];
      for (const root of CLIENT_INSTALL_ROOTS) {
        const expanded = expandRoot(root.dir);
        if (expanded === null) continue;
        checked.push(root.label);
        for (const rel of table) {
          const p = join(expanded, rel);
          if (safeExists(p)) {
            return {
              detected_path: p,
              found: true,
              source: root.source as "candidates",
              message: `检测到 ${p}(${root.label})`,
            };
          }
        }
      }
      if (table.length === 0) {
        return {
          detected_path: null,
          found: false,
          source: "none",
          message: pid === "sensenova" ? "SenseNova 无本机客户端(候选表为空)" : `${pid} 没有登记 exe 候选`,
        };
      }
      return {
        detected_path: null,
        found: false,
        source: "none",
        message:
          `未检测到 ${pid} 客户端(已检查 ${checked.join(" / ") || "无可用安装根"};` +
          `候选:${table.join(", ")})`,
      };
    }
    async function getClientPathsImpl(): Promise<ClientPathsResult> {
      const channels: ClientPathRow[] = [];
      for (const { channel, description } of CLIENT_CHANNELS) {
        const savedRaw = ctx.db.setting.get(`client_path.${channel}`)?.v ?? null;
        let saved = savedRaw !== null && savedRaw !== "" ? savedRaw : null;
        let repaired = false;
        let note: string | null = null;
        const det = await probeClientPath(channel);
        const detected = det.found ? det.detected_path : null;
        const effective = saved ?? detected;
        channels.push({
          channel,
          description,
          saved_path: saved,
          detected_path: detected,
          effective_path: effective,
          exists: effective !== null && safeExists(effective),
          source: saved !== null ? "saved" : det.found ? "detected" : null,
          repaired,
          ...(note !== null ? { note } : {}),
        });
      }
      return {
        channels,
        // 配置已入库 —— 与 Nexus 一致,不再暴露 JSON 路径。
        config_file: ctx.dbPath,
      };
    }
  return {
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
  };
}
