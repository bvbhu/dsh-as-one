/**
 * sensenova 面板域 —— 从 assembly.ts 的 createPanel 闭包拆出(重构第四刀)。
 *
 * 职责:createPanel 里所有 `sn*` 闭包(登录串行化/自愈换 key/积分池)与
 * 10 个 `sensenova*` / `getSensenova*` 面板方法。两处共享状态仍在本文件:
 *   - `snRepairKey` 是唯一活出处;assembly.ts 的模块级钩子 `sensenovaKeyRepair`
 *     由本工厂的调用方在 createPanel 里赋值(挂给网关 onSensenovaKeyInvalid)。
 *   - 账号池不在这里:`syncSensenovaPool` 是 assembly.ts 模块级函数(池是进程级
 *     单例,不能搬),通过 {@link SensenovaDomainDeps} 传入。
 */

import type { CredentialVault } from "@as-one/core/src/config/credentials.js";
import type { NexusDatabase } from "@as-one/core/src/db/database.js";
import type { ProviderRegistry } from "@as-one/core/src/config/providers.js";
import type { InflightLedger as RouterLedger } from "@as-one/core/src/router/inflight-ledger.js";
import type { HealthRegistry as RouterHealthRegistry } from "@as-one/core/src/router/health.js";
import type { Router } from "@as-one/core/src/router/router.js";
import type { Scheduler } from "@as-one/core/src/scheduler/engine.js";
import { wallNow, endpointIdOf } from "@as-one/core/src/scheduler/engine.js";
import type { Credential } from "@as-one/core/src/config/types.js";
import {
  SensenovaAuthFlow,
  sensenova_username,
  parse_pool_usage,
  jwt_expiry_epoch_s,
} from "@as-one/core/src/connectors/sensenova.js";
import { UpstreamError } from "@as-one/core/src/connectors/types.js";
import type { CatalogEntry, CatalogResult } from "@as-one/core/src/collector/catalog.js";
import { fpOf, round1 } from "./utils.js";
import { strOf } from "./refresh.js";
import type {
  ApiResult,
  CatalogModel,
  RefreshAccountRow,
  SensenovaAccount,
  SensenovaAccountRow,
  SensenovaCatalogRow,
  SensenovaQuota,
  SensenovaStatus,
} from "./types.js";
import type { ModelView } from "./modelview.js";
import type { PanelContext } from "./context.js";

/** createPanel 需要传给 sensenova 域的闭包/函数(都在 createPanel 与模块级定义)。 */
export interface SensenovaDomainDeps {
  /** 最近统计日(yyyy-MM-dd),null = 无统计。getSensenovaStatus 用它筛当日行。 */
  lastStatsDay: () => string | null;
  /** 注册表投影(已登记真实模型)。 */
  realModelMap: (pid?: string) => Map<string, ModelView>;
  /** 单模型查找。 */
  modelViewOf: (provider: string, model: string) => ModelView | undefined;
  /** 上游目录 ∪ 已登记(渠道页口径)。getSensenovaModels 用它。 */
  mergedChannelModels: (pid: string) => CatalogModel[];
  /** 目录内存缓存(账号→结果)。sensenovaRefresh 它 peeking。 */
  chCatalogCache: Map<string, { fetchedAtMs: number; result: CatalogResult }>;
  /** 目录冷却闸门(账号→上次拉取时刻)。 */
  chCatalogGate: Map<string, number>;
  /** 拉上游模型目录(带冷却/单飞)。 */
  chAwaitCatalog: (pid: string, username: string, force?: boolean) => Promise<CatalogResult>;
  /** 目录落库(只更新不插入)。 */
  mergeCatalog: (pid: string, entries: CatalogEntry[], baseUrl: string | null, protocol: string) => number;
  /** 账号池重灌(模块级,进程级单例的唯一操作入口)。 */
  syncSensenovaPool: (vault: CredentialVault) => Promise<void>;
}

/** 修复结果({@link snRepairKey} 的返回)。 */
export interface SnKeyRepairReport {
  ok: boolean;
  message: string;
  created: boolean;
  dropped: string[];
}

/** 领域产物:10 个面板方法 + 自愈入口(snRepairKey 挂模块级钩子用)。 */
export interface SensenovaDomain {
  snRepairKey: (username: string, reason: string) => Promise<SnKeyRepairReport>;
  methods: {
    getSensenovaAccounts(): Promise<{ accounts: SensenovaAccountRow[]; count: number }>;
    getSensenovaStatus(): Promise<SensenovaStatus>;
    sensenovaRefresh(_force?: boolean): Promise<ApiResult>;
    getSensenovaModels(): Promise<SensenovaCatalogRow[]>;
    setSensenovaExposure(provider: string, model: string, exposed: boolean): Promise<ApiResult>;
    sensenovaLogin(account: string, username: string | null, password: string, fetchKey?: boolean): Promise<ApiResult>;
    sensenovaSavePassword(account: string, username: string, password: string): Promise<ApiResult>;
    sensenovaRefetchKey(account: string): Promise<ApiResult>;
    sensenovaAddAccount(username: string, password?: string, apiKey?: string): Promise<ApiResult>;
    sensenovaRemoveAccount(account: string): Promise<ApiResult>;
    /** 渠道卡折叠态的缓存读数(不打上游)。 */
    sensenovaQuotaCached(): Array<{ username: string; fetchedAtMs: number; quota: SensenovaQuota }>;
  };
}

// ── 通用池窗口比例(模块级,2026-11-10 用户定案)──────────────────────
//
// ⚠️ 这三块**必须是模块级的**:`chQuotaTableForScheduler()`(channels.ts 的
// 模块级导出)要读它们,而 `snQuotaCache` 在 `createSensenovaDomain` 闭包里 ——
// 所以单独存一份只含比例的缓存,由域内刷新时写入、由 channels.ts 读取。

/**
 * user → 通用池的窗口剩余比例(`{w5, w7}`,0~1)。
 *
 * 写入点:`snQuotaFetch` 成功拿到 quota 时。
 * 读取点:`snPoolRatiosTable()` → `chQuotaTableForScheduler` → 调度器闸门。
 */
const snRatioCache = new Map<string, { w5: number | null; w7: number | null }>();

/**
 * 从 quota 里算**通用池**的窗口剩余比例。
 *
 * ⚠️ 只认 `pool_type === "default"`(通用池):专属池(`dedicated`,如 Flash-Lite)
 * 额度互不影响,不参与判定;一个账号可能有多个池,通用池才是「所有模型共用」
 * 的那一个 —— 也正是 glm/kimi 会挤占 deepseek 的那一个。
 *
 * `limit` 缺失/为 0 → 该项给 `null`(调度器按 fail-open 放行)。
 */
function ratiosOfQuota(quota: SensenovaQuota): { w5: number | null; w7: number | null } {
  const ratioOf = (remaining: number | null, limit: number | null): number | null => {
    if (typeof remaining !== "number" || typeof limit !== "number" || limit <= 0) return null;
    // 夹到 [0,1]:上游偶尔给超额(used > limit)或负剩余,别让比例跳出去。
    return Math.min(1, Math.max(0, remaining / limit));
  };
  const pools = quota?.pools ?? [];
  const general = pools.find((p) => p.pool_type === "default");
  if (general === undefined) return { w5: null, w7: null };
  return {
    w5: ratioOf(general.w5_remaining, general.w5_limit),
    w7: ratioOf(general.w7_remaining, general.w7_limit),
  };
}

/**
 * **通用池窗口剩余比例表** → 调度器闸门用。
 *
 * 键 = 账号 username;值 = `{w5, w7}`,0~1,读不到给 null。
 * 由 `chQuotaTableForScheduler()` 调用,写进调度器的 quota 表
 * (键 `sensenova/<username>`),驱动 `expensive-models.ts` 的闸门。
 */
export function snPoolRatiosTable(): Map<string, { w5: number | null; w7: number | null }> {
  return new Map(snRatioCache);
}

export function createSensenovaDomain(ctx: PanelContext, deps: SensenovaDomainDeps): SensenovaDomain {
/** 归一 SenseNova 用户名(Nexus _sensenova_username_of 同款):
 *  「sensenova/user」取第一个斜杠后段;「sensenova-user」剥前缀;裸名原样。 */
const snUserOf = (name: string): string => {
  const s = String(name ?? "").trim();
  const slash = s.indexOf("/");
  if (slash >= 0 && s.slice(0, slash) === "sensenova") return s.slice(slash + 1);
  return sensenova_username(s);
};

/** 串行登录闸门(Nexus _SN_LOGIN_STATE:锁 + wait_s=2.0 间隔,避免平台风控)。
 *  链式 Promise 实现「同一时刻至多一个登录;上一个完成后等 2s 才放行下一个」;
 *  失败不打断链条(running 在 finally 归零)。 */
const snLoginState = {
  chain: Promise.resolve() as Promise<unknown>,
  lastDoneAtMs: 0,
  running: 0,
  waitMs: 2000,
};
const snSerialized = <T>(fn: () => Promise<T>): Promise<T> => {
  snLoginState.running++;
  const run = snLoginState.chain.then(async () => {
    const gapMs = Math.max(0, snLoginState.lastDoneAtMs + snLoginState.waitMs - Date.now());
    if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    try {
      return await fn();
    } finally {
      snLoginState.lastDoneAtMs = Date.now();
      snLoginState.running--;
    }
  });
  snLoginState.chain = run.then(() => undefined, () => undefined);
  return run;
};

/** SenseNova「刷新」在跑的计数(与 snLoginState.running 一起构成 refresh.running)。 */
const snRefreshState = { running: 0 };

/** SenseNova 最近一次登录/重抓记账(进程内存,refresh 字段展示用)。
 *
 * `result` 初值是 **null** 而不是一句「尚未执行过登录或刷新」:那句话会被页面当成
 * 一条**结论**显示出来(还带上「未刷新」字样),刷新失败或没刷过时看起来都一样。
 * null 表示「没有可说的」,页面就不显示 —— 由页面自己回答「这次点得怎么样」。 */
const snLedger = {
  startedAtMs: null as number | null,
  lastRunAtMs: null as number | null,
  lastElapsedS: null as number | null,
  lastOk: null as boolean | null,
  lastError: null as string | null,
  result: null as string | null,
  lastRunAccounts: [] as RefreshAccountRow[],
};

/** 凭据行读写(密码 → refreshSecret 槽,key → secret 槽,JWT → raw.console_jwt)。 */
const snCred = (username: string) => ctx.vault.get("sensenova", username);
const snStorePassword = async (username: string, password: string): Promise<void> => {
  if (!password) return; // 空密码不清除(Nexus 同款)
  await ctx.vault.put({ provider: "sensenova", username, refreshSecret: password });
};
const snStoreKey = async (username: string, apiKey: string): Promise<void> => {
  await ctx.vault.put({ provider: "sensenova", username, secret: apiKey });
};

/**
 * 拿到一个「已认证」的 flow —— 自愈链的第一步(2026-10-26 用户 m16204)。
 *
 * 三级回落,越靠前越不打扰用户:
 * 1. 库里存的控制台 JWT 还没过期 → 直接灌进 flow(零网络往返);
 * 2. 过期/缺失但有 `console_refresh_token` → 免密码换一个;
 * 3. 都没有但存了密码 → 走一次完整登录(串行队列内,避免并发撞风控)。
 *
 * ⚠️ 只解决「有没有 JWT」,**不碰 key** —— `flow` 交给调用方去 list/create/delete。
 * 拿不到就抛,抛的文案要能直接给用户看(缺什么、该点哪个按钮)。
 */
const snAuthFlow = async (username: string): Promise<SensenovaAuthFlow> => {
  const account = `sensenova/${username}`;
  const cred = await snCred(username);
  const rawJwt = cred?.raw?.console_jwt;
  const rawRefresh = cred?.raw?.console_refresh_token;
  const hasRefresh = typeof rawRefresh === "string" && rawRefresh !== "";

  // ① JWT 还在有效期(留 30s 提前量)
  if (typeof rawJwt === "string" && rawJwt !== "") {
    const exp = jwt_expiry_epoch_s(rawJwt);
    if (exp === null || exp > wallNow() + 30) {
      const f = new SensenovaAuthFlow();
      // jwtCache 是私有的;这里是唯一需要「拿现成 JWT 造 flow」的地方。
      (f as unknown as { jwtCache: Map<string, string> }).jwtCache.set(
        sensenova_username(account),
        rawJwt,
      );
      return f;
    }
  }
  // ② refresh_token 免密码续期
  if (hasRefresh) {
    try {
      const f = new SensenovaAuthFlow();
      const fresh = await f.refreshConsoleJwt(account, rawRefresh as string);
      await snStoreConsoleJwt(username, fresh);
      return f;
    } catch {
      /* 续期失败 → 回落密码重登,那里的报错更有信息量 */
    }
  }
  // ③ 用存下来的密码重登(与 snQuotaFetch 同一条路径)
  const pwd = cred?.refreshSecret ?? null;
  if (!pwd) {
    throw new UpstreamError(
      "auth",
      "既没有可用的控制台令牌/续期凭证,也没有已保存密码 —— 请点「登录并抓 key」输一次密码(之后会存下来)",
      false,
      401,
    );
  }
  const f = await snSerialized(async () => {
    const nf = new SensenovaAuthFlow();
    await nf.login(account, username, pwd);
    return nf;
  });
  const jwt = f.jwtFor(account);
  if (jwt) {
    try {
      await snStoreConsoleJwt(username, jwt);
    } catch {
      /* 存失败不阻断 */
    }
  }
  const rt = f.refreshTokenFor(account);
  if (rt) {
    try {
      await snStoreConsoleRefreshToken(username, rt);
    } catch {
      /* 同上 */
    }
  }
  return f;
};

/**
 * 探一把 key 还灵不灵 —— 打 token 站的 `/v1/models`(只读、不烧额度)。
 *
 * 判定很保守:**只有 401/403 才算「key 无效」**。其它状态(429 限流、
 * 5xx 上游抖、网络不通)一律算「未知」—— 那些不是 key 的问题,拿它去
 * 删 key 重建只会把账号下的 key 越删越少。
 *
 * ⚠️ `waitForNew` —— 新建的 key 在 IAM 侧**不是立刻生效**:实测同一把 key
 * 在 t+0/2/4/6s 连打 `/v1/models` 都是 401,t+8s 才转 200(2026-10-27 实测)。
 * 拿新建的 key 立刻探会把它误判成「无效」,于是一把一把地建下去 —— 这正是
 * 我第一次跑通自愈链时把账号下 6 把 key 全建出来的原因。所以:
 *   · 探**现存的** key(判要不要修)→ 探一次就定,不等;
 *   · 探**刚建的** key(验活)→ 重试到 {@link SN_KEY_PROBE_WAIT_S} 秒。
 */
const SN_KEY_PROBE_WAIT_S = 12;
const snProbeKey = async (
  apiKey: string,
  waitForNew = false,
): Promise<"ok" | "invalid" | "unknown"> => {
  if (!apiKey) return "invalid";
  const deadline = Date.now() + SN_KEY_PROBE_WAIT_S * 1000;
  for (;;) {
    let status = 0;
    try {
      const res = await fetch("https://token.sensenova.cn/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      status = res.status;
    } catch {
      return "unknown"; // 网络不通 ≠ key 失效
    }
    if (status === 200) return "ok";
    if (status !== 401 && status !== 403) return "unknown";
    // 401/403:新建的再等等,现存的直接判无效
    if (!waitForNew || Date.now() >= deadline) return "invalid";
    await new Promise((r) => setTimeout(r, 2000));
  }
};

/**
 * 修复结果:`ok` = 凭据现在能用了(新建或捞到现成的都算);
 * `created` = 这次真的新建了一把;`dropped` = 顺手删掉的旧 key id。
 */
interface SnKeyRepairResult {
  ok: boolean;
  message: string;
  created: boolean;
  dropped: string[];
}

/**
 * **单飞闸门**:同一账号同时只允许一次修复在跑(见 {@link snRepairKey})。
 *
 * 只在「修复进行中」期间存在 —— 结束就从表里摘掉,所以下一次失败会重新跑,
 * 不会把「修过一次」记成永久状态。
 */
const snRepairInflight = new Map<string, Promise<SnKeyRepairResult>>();

/**
 * 「key 无效或没有 key 就建一个」—— 用户 m16204 要的错误处理路径。
 *
 * 顺序:
 * 1. 没 key → 直接建(或捞现成的);
 * 2. 有 key → 先探:ok 就不动,**unknown 也不动**(那不是 key 的锅);
 * 3. 探出 invalid → 在控制台列表里按明文反查出这把 key 的 id,然后
 *    `ensure_api_key_replacing` **先建新的、再删旧的**(顺序反了会出现
 *    「删了没建成」的空窗,账号就彻底没 key 了);
 * 4. 新 key 落库 + 重灌账号池。
 *
 * 返回 `{ ok, message, created, dropped }` —— 拿不到就 ok:false 并把原因
 * 写进 message(没密码 / 登录失败 / 创建被拒),让用户看得见**为什么**没修好,
 * 而不是一句「失败」。
 */
const snRepairKeyRun = async (
  username: string,
  reason: string,
): Promise<SnKeyRepairResult> => {
  const cred = await snCred(username);
  const current = cred?.secret?.trim() ?? "";

  // ① key 还在:先探,好的就别动
  if (current !== "") {
    const verdict = await snProbeKey(current);
    if (verdict === "ok") {
      return {
        ok: false,
        message: `API key 实测可用(探针 200),本次失败原因不是 key:${reason} —— 未改动凭据`,
        created: false,
        dropped: [],
      };
    }
    if (verdict === "unknown") {
      return {
        ok: false,
        message: `探不清 API key 是否有效(非 401/403 响应或网络不通),不擅自删 key:${reason} —— 未改动凭据`,
        created: false,
        dropped: [],
      };
    }
  }

  try {
    const account = `sensenova/${username}`;
    const flow = await snAuthFlow(username);
    // 反查失效那把的 id(平台只认 id 删除,不认明文)
    let staleIds: string[] = [];
    if (current !== "") {
      const keys = await flow.list_api_keys(account).catch(() => []);
      staleIds = keys.filter((k) => k.api_key === current).map((k) => k.id);
    }
    const r = await flow.ensure_api_key_replacing(account, staleIds);
    // ⚠️ 新建的 key 要等 IAM 生效(实测 ~8s)才能验活;这里验的是「修好了没」,
    // 不是「该不该修」—— 判据用的是 waitForNew=true。
    const verdict = r.created ? await snProbeKey(r.apiKey, true) : await snProbeKey(r.apiKey);
    await snStoreKey(username, r.apiKey);
    await deps.syncSensenovaPool(ctx.vault);
    const msg = staleIds.length > 0
      ? `原 API key 已失效,已新建 1 把并删除失效的那把(${r.dropped.length}/${staleIds.length} 个已删)`
      : r.created
        ? "账号下没有可用 API key,已新建 1 把"
        : "已重新取回账号下的 API key";
    // 验活失败也要如实说:key 已经建出来并落库了,但还没被上游认 —— 让用户
    // 知道「等一会儿就好」,而不是误以为修好了。
    if (r.created && verdict !== "ok") {
      return {
        ok: true,
        message: `${msg};已等 ${SN_KEY_PROBE_WAIT_S}s 仍${verdict === "unknown" ? "探不清" : "未生效"},请稍候重试`,
        created: r.created,
        dropped: r.dropped,
      };
    }
    return { ok: true, message: msg, created: r.created, dropped: r.dropped };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `修复 API key 失败:${detail}`, created: false, dropped: [] };
  }
};

/**
 * **带单飞的修复入口**(用户 m16528:key 失效 → 照常走标准冷却 + 冷却期间
 * 后台自动更新 key)。
 *
 * 网关在首块前拿到 401/403 时**不阻塞**地通知(`onSensenovaKeyInvalid`),
 * 通知落到这里。同一账号同时只允许一次修复在跑:
 *
 * ⚠️ 没有这个闸门会怎样 —— 我第一次跑通自愈链时把 buhhuv 账号下建出了
 * **6 把 key**:新 key 在 IAM 侧有约 8 秒传播延迟(t+0/2/4/6s 打 `/v1/models`
 * 全是 401,t+8s 才 200),第一轮「验活失败」还没返回,下一批并发请求
 * 又各自判「key 无效」→ 各自建一把。`ensure_api_key_replacing` 只看
 * 「有没有 enabled 的 key」,不看「是不是正在建」,于是雪崩式建 key。
 *
 * 有闸门之后:并发请求共用一个修复 Promise,谁先建成就算谁的,后到的复用结果。
 * 修复**结束后**就从表里摘掉 —— 下一次真的失效时会重新跑,不会把
 * 「刚修过」记成永久状态。
 */
const snRepairKey = async (
  username: string,
  reason: string,
): Promise<SnKeyRepairResult> => {
  const existing = snRepairInflight.get(username);
  if (existing) return existing;
  const p = snRepairKeyRun(username, reason)
    .catch(
      (err): SnKeyRepairResult => ({
        ok: false,
        message: `修复 API key 异常:${err instanceof Error ? err.message : String(err)}`,
        created: false,
        dropped: [],
      }),
    )
    .finally(() => snRepairInflight.delete(username));
  snRepairInflight.set(username, p);
  return p;
};

// 挂模块级钩子的事由调用方(createPanel)做:sensenovaKeyRepair 定义在
// assembly.ts 模块级,网关注入点(assemble 的 buildResolveUpstream)读它。
// 本文件只暴露 snRepairKey,createPanel 拿返回值后 `sensenovaKeyRepair = snn.snRepairKey`。

/**
 * 控制台 refresh_token 落库(`raw.console_refresh_token`)。
 *
 * ⚠️ 它是「控制台 JWT 过期后不用密码也能续期」的凭证(scope 含
 * `offline_access`,平台登录时一并下发)。有了它,用户不必把明文密码留在机器上。
 */
const snStoreConsoleRefreshToken = async (
  username: string,
  token: string,
): Promise<void> => {
  const existing = await snCred(username);
  await ctx.vault.put({
    provider: "sensenova",
    username,
    raw: { ...(existing?.raw ?? {}), console_refresh_token: token },
  });
};

const snStoreConsoleJwt = async (username: string, jwt: string): Promise<void> => {
  const existing = await snCred(username);
  // put 的 raw 是整体替换 → 先读现 raw 再合并
  await ctx.vault.put({
    provider: "sensenova",
    username,
    raw: { ...(existing?.raw ?? {}), console_jwt: jwt },
  });
};

/**
 * 积分池冷却毫秒 —— 读设置 `external_refresh.interval_hours`(与 channels-sync.ts 的
 * `chQuotaCooldownMs()` 同形),源头是 Nexus `_refresh_cooldown_s`(api.py:3114-3137)。
 *
 * ⚠️ 它**只闸自动刷新**:status 轮询发现缓存缺失/过期才按这个间隔补拉。
 * 用户点「刷新」走的是 sensenovaRefresh 里的 `snQuotaGate.delete(username)` +
 * 直接 snQuotaFetch —— 等价 Nexus 的 force=True,先清闸门再拉,**完全绕过**本函数。
 * 别把清闸门那两行删了,否则「点刷新没反应」会回来。
 *
 * ⚠️ 回退值取 5h,不取 channels-sync.ts 的 24h:constants.ts 给这个键登记的
 * `def` 就是 "5"(Nexus 文档口径),键缺失/非法时保持本域既有行为不变。
 */
const snQuotaCooldownMs = (): number => {
  const raw = ctx.db.setting.get("external_refresh.interval_hours")?.v ?? "5";
  const hours = Number(raw);
  const h = Number.isFinite(hours) && hours > 0 ? hours : 5;
  return h * 3600 * 1000;
};

/** 积分池缓存:每账号 {fetchedAtMs, quota},冷却时长见 {@link snQuotaCooldownMs}。 */
const snQuotaCache = new Map<string, { fetchedAtMs: number; quota: SensenovaQuota }>();
const snQuotaGate = new Map<string, number>(); // 上次尝试拉取时刻(冷却闸门)
const snQuotaInflight = new Map<string, Promise<SensenovaQuota | null>>();
/** 上次拉取失败的原因(账号 → 文案)。snQuotaFetch 吞异常返回 null,页面要看得见原因。 */
const snQuotaError = new Map<string, string>();

/** 单账号拉积分池:JWT 未过期直接用;过期但有存密码 → 串行免登录换新 JWT 并落库;
 *  换不到(没密码/登录失败)→ null;拉取失败 → null(绝不抛)。
 *  上线前已知上游接口需要控制台 JWT(有效约 3h),这是它的唯一入口。 */
const snQuotaFetch = async (username: string): Promise<SensenovaQuota | null> => {
  const account = `sensenova/${username}`;
  /** 记下失败原因并如实返回 null(绝不抛,也绝不伪造成功)。 */
  const bail = (reason: string): null => {
    snQuotaError.set(username, reason);
    return null;
  };
  const cred = await snCred(username);
  const rawJwt = cred?.raw?.console_jwt;
  const rawRefresh = cred?.raw?.console_refresh_token;
  const hasRefresh = typeof rawRefresh === "string" && rawRefresh !== "";
  if (typeof rawJwt !== "string" || rawJwt === "") {
    // ⚠️ 有 refresh_token 就能**不用密码**换一个 JWT —— 别在这里就劝用户输密码。
    if (hasRefresh) {
      try {
        const f = new SensenovaAuthFlow();
        const fresh = await f.refreshConsoleJwt(account, rawRefresh);
        await snStoreConsoleJwt(username, fresh);
        return fetchPoolWith(f, fresh);
      } catch (err) {
        return bail(
          `没有控制台令牌,自动续期也失败:${err instanceof Error ? err.message : String(err)}` +
            " —— 请在下方「登录并抓 key」重新登录一次",
        );
      }
    }
    return bail("没有控制台令牌 —— 请在下方「登录并抓 key」"); // 无 JWT,查不了
  }
  const exp = jwt_expiry_epoch_s(rawJwt);
  const expired = exp !== null && exp <= wallNow() + 30;
  let flow = new SensenovaAuthFlow();
  let jwt: string | undefined = expired ? undefined : rawJwt;
  if (expired) {
    // ① 先试 refresh_token(不用密码、不触风控)
    if (hasRefresh) {
      try {
        const f = new SensenovaAuthFlow();
        jwt = await f.refreshConsoleJwt(account, rawRefresh);
        await snStoreConsoleJwt(username, jwt);
        flow = f;
      } catch (err) {
        jwt = undefined;
        void err; // 回落密码重登,那里的报错更有信息量
      }
    }
    // ② 回落「用密码重新登录」(Nexus 同款路径)
    if (!jwt) {
      const pwd = cred?.refreshSecret ?? null;
      if (!pwd) {
        return bail(
          `控制台令牌已于 ${exp !== null ? new Date(exp * 1000).toLocaleString() : "?"} 过期` +
            ",且没有可用的续期凭证或已保存密码 —— 请「登录并抓 key」或「只保存密码」",
        );
      }
      try {
        flow = await snSerialized(async () => {
          const f = new SensenovaAuthFlow();
          await f.login(account, username, pwd);
          return f;
        });
        jwt = flow.jwtFor(account);
        if (jwt) await snStoreConsoleJwt(username, jwt); // 续期落库,下次免登录
      } catch (err) {
        return bail(
          `控制台令牌已过期,自动续期失败:${err instanceof Error ? err.message : String(err)}` +
            " —— 请在下方「登录并抓 key」重新登录一次",
        );
      }
    }
  }
  if (!jwt) return bail("拿不到控制台令牌");
  return fetchPoolWith(flow, jwt);

  /** 拿 JWT 打积分池接口并解析(成功 → 快照;失败 → 如实报错)。 */
  async function fetchPoolWith(
    f: SensenovaAuthFlow,
    token: string,
  ): Promise<SensenovaQuota | null> {
    try {
    const raw = await f.fetch_pool_usage(account, token);
    const parsed = parse_pool_usage(raw);
    const sessionMs = 3 * 3600 * 1000; // 控制台 JWT 有效期约 3h
    const quota: SensenovaQuota = {
      account: username,
      pools: parsed.pools.map((p) => ({
        pool_type: p.pool_type ?? "",
        name: p.pool_name ?? "(未命名)",
        w5_limit: p.w5?.limit ?? null,
        w5_used: p.w5?.used ?? null,
        w5_remaining: p.w5?.remaining ?? null,
        w5_reset_at: p.w5?.reset_at ?? null,
        w7_limit: p.w7?.limit ?? null,
        w7_used: p.w7?.used ?? null,
        w7_remaining: p.w7?.remaining ?? null,
        w7_reset_at: p.w7?.reset_at ?? null,
        grant_balance: p.grant_balance,
        grant_expiry: p.grant_expiry,
        grant_expiring_balance: p.grant_expiring_balance,
      })),
      grant_balance: parsed.grant_total,
      plan: parsed.plan_name,
      fetched_at: Date.now(),
      remaining: parsed.remaining,
      expires_at: Date.now() + sessionMs, // 过期为 JWT 换新需求,不是额度到期
    };
      snQuotaCache.set(username, { fetchedAtMs: Date.now(), quota });
      // 顺手把**通用池窗口比例**写进模块级表(供 chQuotaTableForScheduler 读):
      // 调度器的高消耗模型闸门按它决定要不要跳过 glm/kimi 端点。
      // ⚠️ 只在拿到 quota 时写 —— 拉取失败不动旧值(它代表「上次已知的比例」)。
      snRatioCache.set(username, ratiosOfQuota(quota));
      snQuotaError.delete(username);
      return quota;
    } catch (err) {
      return bail(`拉取积分池失败:${err instanceof Error ? err.message : String(err)}`);
    }
  }
};

/** 冷却闸门拉取(单飞):冷却期内只试一次;status 轮询不重复打上游。
 *  冷却时长随设置 external_refresh.interval_hours(见 {@link snQuotaCooldownMs})。 */
const snMaybeFetchQuota = (username: string): void => {
  const now = Date.now();
  const cooldownMs = snQuotaCooldownMs();
  const cached = snQuotaCache.get(username);
  if (cached && now - cached.fetchedAtMs < cooldownMs) return;
  if (now - (snQuotaGate.get(username) ?? 0) < cooldownMs) return;
  snQuotaGate.set(username, now);
  if (!snQuotaInflight.has(username)) {
    const p = snQuotaFetch(username).finally(() => snQuotaInflight.delete(username));
    snQuotaInflight.set(username, p);
  }
};

/** 登录(镜像 Nexus _sensenova_login):密码为空 → 400 文案;登录 401 →「登录失败:…」;
 *  其他 →「登录异常:Type: …」;登录成功才存密码(输错不覆盖);
 *  fetchKey=true 时抓 key,JWT 尽力落库(失败不阻断)。串行化,不并发登录。 */
const snLogin = async (
  account: string,
  username: string,
  password: string,
  fetchKey = true,
): Promise<ApiResult> => {
  const user = snUserOf(username || account);
  if (!user || !password) {
    return { ok: false, message: "账号与密码均为必填(密码不回显)" };
  }
  const t0 = Date.now();
  // ⚠️ 入口即写「开始时刻」:登录/自动续期进行中,refresh.running 已为 true,
  // 页面「已用 Ns」要能从本轮开始计时 —— 旧实现只在 record()(结束)才写,
  // 进行中读到 null → 「刷新计时一直 0.0 秒」。
  snLedger.startedAtMs = t0;
  const record = (ok: boolean, result: string, message: string, totalKeys?: number) => {
    const now = Date.now();
    snLedger.startedAtMs = t0;
    snLedger.lastRunAtMs = now;
    snLedger.lastElapsedS = Math.round(((now - t0) / 1000) * 10) / 10;
    snLedger.lastOk = ok;
    snLedger.lastError = ok ? null : message;
    snLedger.result = result;
  };
  try {
    const flow = await snSerialized(async () => {
      const f = new SensenovaAuthFlow();
      await f.login(account, user, password); // 失败在此抛(不落密码)
      return f;
    });
    await snStorePassword(user, password); // 登录成功才写库
    // 控制台 JWT 尽力落库(额度查询要它;存失败不阻断登录)
    const jwt = flow.jwtFor(account);
    if (jwt) {
      try {
        await snStoreConsoleJwt(user, jwt);
      } catch {
        /* 仅警告,不让登录失败(Nexus 同款) */
      }
    }
    // refresh_token 一并落库:控制台 JWT 只有约 3 小时有效期,有了它就能
    // **不用密码**续期(用户不必把明文密码留在机器上)。
    const refreshToken = flow.refreshTokenFor(account);
    if (refreshToken) {
      try {
        await snStoreConsoleRefreshToken(user, refreshToken);
      } catch {
        /* 仅警告 */
      }
    }
    if (!fetchKey) {
      record(true, "登录成功(按要求未抓取 API key)", "登录成功(按要求未抓取 API key)");
      return { ok: true, account, username: user, logged_in: true, key_updated: false, has_password: true, message: "登录成功(按要求未抓取 API key)" };
    }
    try {
      // ⚠️ 用 ensure_api_key 而不是 fetch_api_key:账号下**一把 key 都没有**
      // 时(新号 / 全被删)直接新建一把,而不是报「抓 key 失败」让用户手动去
      // 控制台点一下 —— 2026-10-26 用户 m16204 定案的自愈路径。
      const { apiKey, total, created } = await flow.ensure_api_key(account);
      await snStoreKey(user, apiKey);
      const message = created
        ? `登录成功,账号下没有可用 API key,已自动新建 1 把(现共 ${total} 把)`
        : `登录成功,已抓取 API key(账号下共 ${total} 把)`;
      record(true, message, message, total);
      void snQuotaFetch(user); // 登录后立即刷新额度(绕过冷却闸门)
      return { ok: true, account, username: user, logged_in: true, key_updated: true, total_keys: total, has_password: true, message };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const message =
        e instanceof UpstreamError
          ? `登录成功,但抓 API key 失败:${detail}`
          : `登录成功,但抓 key 异常:${e instanceof Error ? e.constructor.name : typeof e}: ${detail}`;
      record(false, message, message);
      return { ok: false, account, username: user, logged_in: true, key_updated: false, has_password: true, message };
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    let message: string;
    if (e instanceof UpstreamError && e.kind === "auth") {
      // core 的 auth 错误消息自带「登录失败:」前缀,剥掉避免重复
      message = `登录失败:${detail.replace(/^登录失败[:：]\s*/, "")}`;
    } else {
      message = `登录异常:${e instanceof Error ? e.constructor.name : typeof e}: ${detail}`;
    }
    record(false, message, message);
    return { ok: false, account, username: user, logged_in: false, key_updated: false, has_password: false, message };
  }
};

  const methods = {
    // ── SenseNova 登录与账号管理(镜像 Nexus /sensenova/login、/refetch-key、/accounts)──
    /**
     * SenseNova 账号列表(对齐 Nexus `GET /sensenova/accounts` → `_sensenova_accounts`)。
     *
     * 凭据投影,**无明文**。
     */
    async getSensenovaAccounts(): Promise<{ accounts: SensenovaAccountRow[]; count: number }> {
      const creds = await ctx.vault.list("sensenova").catch(() => []);
      const accounts: SensenovaAccountRow[] = [];
      for (let i = 0; i < creds.length; i += 1) {
        const username = snUserOf(creds[i].username);
        const full = await ctx.vault.get("sensenova", creds[i].username);
        const secret = await ctx.vault.secret("sensenova", creds[i].username);
        accounts.push({
          index: i,
          account: username,
          username,
          // D2/D6:没有停用开关;不可用 = 删这一行
          enabled: true,
          has_key: Boolean(secret),
          key_hint: fpOf(secret),
          has_password: Boolean(full?.refreshSecret),
        });
      }
      return { accounts, count: accounts.length };
    },
    async getSensenovaStatus(): Promise<SensenovaStatus> {
      const pid = "sensenova";
      const pdef = ctx.registry.getProvider(pid);
      const creds = await ctx.vault.list(pid);
      const configAccounts = ctx.registry.listAccounts(pid);
      const enabledByRef = new Map(
        configAccounts.map((a) => [a.credentialRef, ctx.accountOverlay.get(a.credentialRef) ?? a.enabled]),
      );
      const lastDay = deps.lastStatsDay();
      const snRows = lastDay ? ctx.db.statsDaily.range(lastDay, lastDay).filter((r) => r.provider === pid) : [];
      let requests = 0, fails = 0, prompt = 0, completion = 0, cached = 0;
      let latencySum = 0, ttftSum = 0, ttftReq = 0;
      for (const r of snRows) {
        requests += r.requests;
        fails += r.fails;
        prompt += r.prompt_tokens;
        completion += r.completion_tokens;
        cached += r.cached_tokens;
        latencySum += r.latency_sum_ms;
        ttftSum += r.ttft_sum_ms;
        ttftReq += r.ttft_requests;
      }
      const genMs = latencySum - ttftSum;
      const nowS = wallNow();
      const leases = ctx.ledger.detail();
      const accounts: SensenovaAccount[] = [];
      for (let i = 0; i < creds.length; i++) {
        const cred = creds[i];
        const secret = await ctx.vault.secret(pid, cred.username);
        const full = await ctx.vault.get(pid, cred.username);
        const hasPassword = Boolean(full?.refreshSecret);
        const enabled = enabledByRef.get(cred.key) ?? true;
        const inflight = leases.filter((l) => l.endpointId.endsWith(`@${pid}/${cred.username}`)).length;
        // 冷却:该账户任意端点冷却即算
        let cooling = false;
        let cooldownRemaining: number | null = null;
        let lastError: string | null = null;
        let lastKind: string | null = null;
        let lastUsedAt: number | null = null;
        for (const mv of deps.realModelMap(pid).values()) {
          const epId = endpointIdOf(pid, mv.model, cred.username);
          const rec = ctx.health.get(epId);
          if (rec.cooldownUntil > 0 && rec.cooldownUntil > nowS) {
            cooling = true;
            const rem = Math.round((rec.cooldownUntil - nowS) * 10) / 10;
            if (cooldownRemaining === null || rem > cooldownRemaining) cooldownRemaining = rem;
          }
          if (rec.lastError) {
            lastError = rec.lastError || null;
            lastKind = rec.lastKind || null;
          }
          if (rec.updatedAt > 0 && (lastUsedAt === null || rec.updatedAt * 1000 > lastUsedAt)) {
            lastUsedAt = Math.round(rec.updatedAt * 1000);
          }
        }
        // 额度:读内存缓存(冷却期内不重复打上游);缺/旧时后台按冷却闸门补拉。
        // 「旧」的判据与闸门同一个来源(设置 external_refresh.interval_hours),
        // 否则会出现「页面标着过期、闸门却还拦着不拉」的自相矛盾。
        const q = snQuotaCache.get(cred.username);
        const quotaStale = q !== undefined && Date.now() - q.fetchedAtMs > snQuotaCooldownMs();
        if (q === undefined || quotaStale) snMaybeFetchQuota(cred.username);
        accounts.push({
          account: cred.username,
          username: cred.username,
          enabled,
          key_hint: fpOf(secret),
          has_password: hasPassword,
          has_key: secret !== null,
          slots: 0,
          inflight,
          inflight_is_pool_total: null,
          parallel_cap: null,
          // ⚠️ 成功率恒 100%(用户 m11736):失败请求不再进统计 → `requests` 本身就是
          // 成功数,再算「成功数 / 总数」没有意义。字段保留是为了契约兼容,
          // 值不再有信息量 —— 面板也不再展示它。
          success_rate: requests > 0 ? 100 : null,
          avg_ttft_ms: ttftReq > 0 ? round1(ttftSum / ttftReq) : null,
          avg_tps: completion > 0 && genMs > 0 ? round1(completion / (genMs / 1000)) : null,
          cache_hit_rate: prompt > 0 ? Math.min(1, cached / prompt) : null,
          requests,
          // 同 success_rate:失败请求不进统计,这里恒 0(历史行可能仍是旧值,不再展示)
          errors: 0,
          cooling,
          cooldown_remaining_s: cooldownRemaining,
          last_error: lastError,
          last_error_kind: lastKind,
          last_used_at: lastUsedAt,
          quota: q?.quota ?? null,
          quota_stale: quotaStale,
        });
      }
      return {
        accounts,
        pool: null,
        base_url: pdef?.baseUrl ?? null,
        refresh: {
          // 登录队列在跑,或「刷新」在跑 —— 两者都是这一行状态要反映的忙碌态。
          running: snLoginState.running > 0 || snRefreshState.running > 0,
          started_at_ms: snLedger.startedAtMs,
          last_run_at_ms: snLedger.lastRunAtMs,
          last_elapsed_s: snLedger.lastElapsedS,
          last_ok: snLedger.lastOk,
          last_error: snLedger.lastError,
          result: snLedger.result,
          count: snLedger.lastRunAccounts.length,
          last_run_accounts: snLedger.lastRunAccounts,
        },
        auto_refresh: null,
        uptime_s: Math.round(((Date.now() - ctx.startedAtMs) / 1000) * 10) / 10,
        note: null,
      };
    },
    /**
     * SenseNova「刷新」—— 页面那个按钮以前只 `load()` 本地库(所以「刷了没反应」)。
     * 现在真干两件事(都是**不烧额度**的元数据/控制台接口):
     *   ① 上游模型目录:`token.sensenova.cn/v1/models`(API key 认证)→ 落 db.real_model;
     *   ② 积分池:清空冷却闸门重拉(JWT 过期且已存密码 → 串行免登录续期再拉)。
     */
    async sensenovaRefresh(
      _force?: boolean,
      segments?: { catalog?: boolean; quota?: boolean },
    ): Promise<ApiResult> {
      const pid = "sensenova";
      const force = _force !== false;
      // 2026-11-08 用户定案:**刷新语义拆干净** ——
      //   - 页面「全部刷新」只刷积分余额 → `{ catalog: false }`;
      //   - 模型目录那一段归「刷新模型列表」按钮 → `{ quota: false }`。
      // 两者都不传 = 老行为(目录 + 积分池),仅供旧调用方使用。
      const wantCatalog = segments?.catalog !== false;
      const wantQuota = segments?.quota !== false;
      const t0 = Date.now();
      // 入口即写「开始时刻」:sensenovaRefresh 进行中状态轮询就能读到它,
      // 页面「已用 Ns」从本轮开始计时(旧实现结束时才写 lastRunAtMs,进行中
      // 读到旧值/null → 「刷新计时一直 0 秒」)。
      snLedger.startedAtMs = t0;
      /**
       * 统一落账 —— **每条出口都必须过这里**。
       *
       * 以前只有「跑完循环」那一条出口写账:中途抛错(或账号池读不出来)就直接
       * 冒出去变成 500,账本停在上一轮 / 初始值。页面读回执时看到的是「尚未
       * 刷新」,用户看到的是「刷了等于没刷」。
       */
      const record = (ok: boolean, message: string, rows: RefreshAccountRow[]): ApiResult => {
        const elapsed = Math.round(((Date.now() - t0) / 1000) * 10) / 10;
        snLedger.lastRunAtMs = Date.now();
        snLedger.lastElapsedS = elapsed;
        snLedger.lastOk = ok;
        snLedger.lastError = ok ? null : message;
        snLedger.result = `${ok ? "成功" : "失败"}:${message}`;
        snLedger.lastRunAccounts = rows;
        return { ok, provider: pid, count: rows.length, message, accounts: rows };
      };

      let creds: { username: string }[];
      try {
        creds = await ctx.vault.list(pid);
      } catch (err) {
        return record(false, `读取账号池失败:${err instanceof Error ? err.message : String(err)}`, []);
      }
      if (creds.length === 0) {
        return record(false, "SenseNova 下没有账号,无法刷新", []);
      }
      snRefreshState.running += 1;
      const rows: RefreshAccountRow[] = [];
      const catalogErrs: string[] = [];
      const quotaErrs: string[] = [];
      let catalogCount = 0;
      let catalogWarn = "";
      let quotaOk = 0;
      try {
        const pdef = ctx.registry.getProvider(pid);
        for (let i = 0; i < creds.length; i++) {
          const username = creds[i].username;
          // ⓪ 自愈前置:没有 key / key 失效 → 先建一把(用户 m16204)。
          //    只在这一轮刷新开始时判一次,不每个账号反复探。
          //    ⚠️ 逐账号兜住异常:补 key 会把登录/建 key 串起来,其中任一步抛错
          //    都不该让整轮刷新中断(那会让后面账号一个都不刷,还没回执)。
          //    ⚠️ 只在**要拉目录**时才补 key:补 key 是目录的前提,与积分池无关。
          try {
            const preCred = wantCatalog ? await ctx.vault.get(pid, username) : null;
            if (wantCatalog && !preCred?.secret?.trim()) {
              const rep = await snRepairKey(username, "账号下没有 API key");
              if (rep.ok) {
                // 修好了:清掉这个账号的目录缓存(它可能是「没密钥」的旧失败态)
                deps.chCatalogCache.delete(`${pid}/${username}`);
                deps.chCatalogGate.delete(`${pid}/${username}`);
              } else {
                catalogErrs.push(`${username}:${rep.message}`);
              }
            }
          } catch (err) {
            catalogErrs.push(`${username}:自动补 key 失败:${err instanceof Error ? err.message : String(err)}`);
          }
          // ① 模型目录(第一个能拉到的账号即可 —— 目录是账号无关的)
          //    ⚠️ `{ catalog: false }`(页面「全部刷新」)时整段跳过:那条路只刷积分池。
          if (wantCatalog) try {
            const res = await deps.chAwaitCatalog(pid, username, force);
            catalogCount = Math.max(
              catalogCount,
              deps.mergeCatalog(pid, res.entries, pdef?.baseUrl ?? null, pdef?.protocol ?? pid),
            );
            if (catalogWarn === "" && res.warnings.length > 0) catalogWarn = res.warnings[0];
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            // key 被判无效(401/403)→ 建新的再试一次。别的状态不重试:
            // 429 是限流、5xx 是上游抖,换了 key 也一样。
            const authFailed = /401|403|Unauthorized|Forbidden|invalid.*key|没有可用密钥/i.test(detail);
            if (authFailed) {
              try {
                const rep = await snRepairKey(username, detail);
                if (rep.ok) {
                  const res2 = await deps.chAwaitCatalog(pid, username, true);
                  catalogCount = Math.max(
                    catalogCount,
                    deps.mergeCatalog(pid, res2.entries, pdef?.baseUrl ?? null, pdef?.protocol ?? pid),
                  );
                } else {
                  catalogErrs.push(`${username}:${rep.message}`);
                }
              } catch (err2) {
                catalogErrs.push(
                  `${username}:重建 key 后仍失败:${err2 instanceof Error ? err2.message : String(err2)}`,
                );
              }
            } else {
              catalogErrs.push(`${username}:${detail}`);
            }
          }
          // ② 积分池(force:绕过冷却闸门)—— 对应 Nexus force=True 的语义:
          // 用户点了刷新,冷却只该约束自动刷新,不能拦手动的。
          // ⚠️ 同样逐账号兜住:`snQuotaFetch` 自己承诺不抛,但它的**调用方**(落库、
          //    读凭据)会;一个账号炸掉不该连累剩下的账号与整轮回执。
          // ⚠️ `{ quota: false }`(页面「刷新模型列表」)时整段跳过。
          let quota: SensenovaQuota | null = null;
          if (wantQuota) {
            try {
              snQuotaGate.delete(username);
              quota = await snQuotaFetch(username);
              if (quota === null) quotaErrs.push(`${username}:${snQuotaError.get(username) ?? "未拉取到"}`);
            } catch (err) {
              const detail = err instanceof Error ? err.message : String(err);
              quotaErrs.push(`${username}:拉取积分池异常:${detail}`);
              snQuotaError.set(username, detail);
            }
            if (quota !== null) quotaOk += 1;
          }
          const full = await ctx.vault.get(pid, username).catch(() => null);
          rows.push({
            index: i,
            account: `sensenova/${username}`,
            username,
            uid: strOf(full?.raw ?? {}, "uid"),
            region: strOf(full?.raw ?? {}, "region"),
            has_refresh_token: Boolean(full?.refreshSecret),
            token_expires_at_ms: null,
            needs_refresh: false,
            status: !wantQuota || quota ? "ok" : "failed",
            message: !wantQuota
              ? "仅刷新模型目录(未动积分池)"
              : quota
                ? `积分池已刷新(${quota.pools.length} 个池)`
                : (snQuotaError.get(username) ?? "积分池未拉取到"),
          });
        }
      } catch (err) {
        // 兜底:没预料到的异常(取不到 provider / 注册表投影失败 / 上游抛了没
        // 接住的错)也要落成一条**回执**,不能冒到路由变成 500 —— 那样页面连
        // 失败原因都拿不到,note 只能退回陈旧值。
        catalogErrs.push(`刷新中断:${err instanceof Error ? err.message : String(err)}`);
      } finally {
        snRefreshState.running -= 1;
      }
      const parts: string[] = [];
      // 只报**这次真做了的**那几段:同时上屏「模型目录」和「积分池」会让
      // 「全部刷新」看起来也刷了目录(2026-11-08 拆分语义后不许再这么写)。
      if (wantCatalog) {
        parts.push(
          catalogCount > 0
            ? `模型目录:上游 ${catalogCount} 个,已写入库${catalogWarn ? `(降级:${catalogWarn})` : ""}`
            : `模型目录:未拉到(${catalogErrs[0] ?? "无可用密钥"})`,
        );
      }
      if (wantQuota) {
        parts.push(
          quotaOk > 0 ? `积分池:${quotaOk}/${creds.length} 个账号` : `积分池:未拉到(${quotaErrs[0] ?? "无账号"})`,
        );
      }
      const message = parts.join("; ") || "未指定刷新内容";
      const ok = (wantCatalog && catalogCount > 0) || (wantQuota && quotaOk > 0);
      return record(ok, message, rows);
    },
    async getSensenovaModels(): Promise<SensenovaCatalogRow[]> {
      const pid = "sensenova";
      // ⚠️ 与渠道页同一口径:上游目录 ∪ 已登记(deps.mergedChannelModels)。
      // 以前只读 deps.realModelMap(已登记),刷新拉到的上游新模型永远不出现
      // (「刷新不会更新模型列表」)—— 现在目录里未登记行也显示,勾选 = 登记。
      return deps.mergedChannelModels(pid).map((m) => ({
        id: m.id,
        name: m.name,
        context_window: m.context_window,
        max_output: m.max_output,
        input_modalities: m.vision ? ["text", "image"] : ["text"],
        vision_upstream: m.default_vision ?? m.vision,
        vision: m.vision,
        registered: m.registered,
        available: m.available,
      }));
    },
    async setSensenovaExposure(provider: string, model: string, exposed: boolean): Promise<ApiResult> {
      const pid = String(provider ?? "").trim();
      const mid = String(model ?? "").trim();
      if (!pid || !mid) return { ok: false, message: "provider/model 不能为空" };
      const mv = deps.modelViewOf(pid, mid);
      if (!mv) return { ok: false, message: `未知模型 ${pid}/${mid}` };
      // 与 setModelExposure 同语义:exposed=true ⇔ hidden=0,真写 db.real_model.hidden。
      ctx.db.realModel.update({ provider: pid, model: mid, hidden: exposed ? 0 : 1 });
      ctx.syncRegistry();
      return {
        ok: true,
        message: exposed ? `已暴露 ${pid}/${mid}` : `已隐藏 ${pid}/${mid}`,
        changed: [`${pid}/${mid}`],
      };
    },
    async sensenovaLogin(
      account: string,
      username: string | null,
      password: string,
      fetchKey = true,
    ): Promise<ApiResult> {
      if (typeof fetchKey !== "boolean") fetchKey = true;
      const user = snUserOf((username != null && username !== "") ? username : String(account ?? ""));
      return snLogin(String(account ?? ""), user, String(password ?? ""), fetchKey);
    },
    async sensenovaSavePassword(account: string, username: string, password: string): Promise<ApiResult> {
      const user = snUserOf(String(username || account || ""));
      if (!user) return { ok: false, message: "账号与密码均为必填(密码不回显)" };
      // 保证有一行(Nexus INSERT ON CONFLICT DO NOTHING 语义)
      await ctx.vault.put({ provider: "sensenova", username: user });
      await snStorePassword(user, String(password ?? ""));
      await deps.syncSensenovaPool(ctx.vault);
      const hasPassword = Boolean(password);
      const message = hasPassword ? "已保存密码(未登录)" : "空密码不写入,未清除已有密码";
      snLedger.lastRunAtMs = Date.now();
      snLedger.result = message;
      return {
        ok: true,
        account: `sensenova/${user}`,
        username: user,
        has_password: hasPassword,
        message,
      };
    },
    async sensenovaRefetchKey(account: string): Promise<ApiResult> {
      const user = snUserOf(String(account ?? ""));
      if (!user) return { ok: false, message: "缺少账号" };
      const cred = await ctx.vault.get("sensenova", user);
      if (!cred?.refreshSecret && !cred?.raw?.console_refresh_token) {
        const msg = "该账号既没有保存密码也没有续期凭证,无法免登录重抓 —— 请点「登录并抓 key」输一次密码(之后会存下来,以后重抓与刷新都不再需要手输)";
        snLedger.lastRunAtMs = Date.now();
        snLedger.lastOk = false;
        snLedger.lastError = msg;
        snLedger.result = msg;
        return {
          ok: false,
          account: `sensenova/${user}`,
          has_key: cred?.secret != null,
          key_updated: false,
          message: msg,
        };
      }
      // ⚠️ 走自愈链而不是「无脑重登」:先探现有 key 还灵不灵。
      // 有效 → 不动(白跑一次登录只会触发风控);无效/缺失 → 建新的并删掉失效那把。
      const r = await snRepairKey(user, "手动重抓");
      snLedger.lastRunAtMs = Date.now();
      snLedger.lastOk = r.ok;
      snLedger.lastError = r.ok ? null : r.message;
      snLedger.result = r.message;
      return {
        ok: r.ok,
        account: `sensenova/${user}`,
        has_key: true,
        key_updated: r.created || r.dropped.length > 0,
        message: r.message,
      };
    },
    async sensenovaAddAccount(username: string, password?: string, apiKey?: string): Promise<ApiResult> {
      const user = snUserOf(String(username ?? ""));
      if (!user) return { ok: false, message: "缺少用户名" };
      const key = String(apiKey ?? "").trim();
      const pwd = String(password ?? "");
      // 建行 + 存 key/密码(Nexus _sensenova_account_upsert 语义)。
      await ctx.vault.put({
        provider: "sensenova",
        username: user,
        ...(key ? { secret: key } : {}),
      });
      await snStorePassword(user, pwd);
      await deps.syncSensenovaPool(ctx.vault);
      const saved = {
        ok: true,
        created: true,
        account: `sensenova/${user}`,
        username: user,
        has_password: Boolean(pwd),
        has_key: Boolean(key),
        key_hint: key ? fpOf(key) : null,
      };
      // 给了密码就顺带登录并抓 key(Nexus 路由 payload.login===True 语义);
      // 登录失败不整单失败:「账号已保存,但登录失败:…」。
      if (pwd) {
        const login = await snLogin(`sensenova/${user}`, user, pwd, true);
        if (login.ok) {
          return { ...saved, ...login, login_ok: true, logged_in: true, has_password: true };
        }
        return {
          ...saved,
          login_ok: false,
          logged_in: false,
          message: `账号已保存,但${login.message ?? "登录失败"}`,
        };
      }
      return { ...saved, login_ok: false, logged_in: false };
    },
    async sensenovaRemoveAccount(account: string): Promise<ApiResult> {
      const user = snUserOf(String(account ?? ""));
      if (!user) return { ok: false, message: "缺少用户名" };
      const models = ctx.db.realModel.listByProvider("sensenova").length;
      const removed = await ctx.vault.remove("sensenova", user);
      await deps.syncSensenovaPool(ctx.vault);
      const accountsLeft = (await ctx.vault.list("sensenova")).length;
      // 清掉该账号的内存额度缓存/闸门。
      snQuotaCache.delete(user);
      snQuotaGate.delete(user);
      snQuotaInflight.delete(user);
      const message = removed
        ? `已删除 sensenova/${user};该渠道 ${models} 个真实模型各少一个端点(端点 = 真实模型 × 凭据行,D5)。`
        : `sensenova/${user} 没有凭据行,未删除`;
      return {
        ok: removed,
        account: user,
        count: accountsLeft,
        removed_endpoints: models,
        message,
      };
    },
    /**
     * 渠道卡折叠态的**缓存读数**(不打上游、不补拉):`snQuotaCache` 里有什么
     * 就返回什么。没拉过的账号不在结果里(卡头显示「未采集」)。
     */
    sensenovaQuotaCached(): Array<{ username: string; fetchedAtMs: number; quota: SensenovaQuota }> {
      const out: Array<{ username: string; fetchedAtMs: number; quota: SensenovaQuota }> = [];
      for (const [username, entry] of snQuotaCache) out.push({ username, ...entry });
      return out;
    },
  };

  return { snRepairKey, methods };
}
