/**
 * setupAsOne —— 纯函数装配(不依赖 ctx / DSH 服务,直接拿 dirs 参数)。
 *
 * 把「配置加载 + 凭据库 + DB 打开 + Scheduler/Router 构造 + resolveUpstream
 * 注入 + 模型列表」提炼成与 apps/electron/src/main/assembly.ts 相同接线顺序
 * 的组装,但**不建 http.Server、不开面板** —— 输出由 src/index.ts 的
 * ctx.webServer 路由消费。这样宿主半可被 vitest 冒烟测(不碰真实 DSH)。
 *
 * ⚠️ **parity 纪律**:本文件是 electron `assembly.ts` 的镜像。装配顺序与注入
 * 的每一项都要对齐(会话粘性、重试策略、连接超时、思考强度能力表、逻辑模型
 * 输出上限、sensenova 账号池、请求日志/统计)。任何一侧改了接线,另一侧必须
 * 同步 —— 否则「同一个库,桌面版和插件版行为不一致」。
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { openDatabase, type NexusDatabase } from "@as-one/core/src/db/database.js";
import { ProviderRegistry } from "@as-one/core/src/config/providers.js";
import { CredentialVault } from "@as-one/core/src/config/credentials.js";
import { DbCredentialBackend } from "@as-one/core/src/db/credential-backend.js";
import { snapshotFromDb } from "@as-one/core/src/db/registry-projection.js";
import { Scheduler, splitModelId } from "@as-one/core/src/scheduler/engine.js";
import { RetryPolicy } from "@as-one/core/src/scheduler/backoff.js";
import { Router } from "@as-one/core/src/router/router.js";
import {
  AccountThrottle,
  accountThrottleKey,
} from "@as-one/core/src/router/account-throttle.js";
import { createWorkbuddySelfCheck } from "@as-one/core/src/connectors/workbuddy-selfcheck.js";
import { EnvKeyProvider } from "@as-one/core/src/gateway/auth.js";
import type {
  KeyProvider,
  ModelEntry,
  RequestDoneInfo,
  Upstream,
} from "@as-one/core/src/gateway/types.js";
import { registerConnector } from "@as-one/core/src/connectors/index.js";
import { SensenovaAdapter } from "@as-one/core/src/connectors/sensenova.js";
import type { SensenovaAccount } from "@as-one/core/src/connectors/sensenova.js";
import {
  createContentModeResolver,
  logRequests,
  type ContentMode,
  type RequestLogRow,
} from "@as-one/core/src/request-log/index.js";
import { RequestLogWriter } from "@as-one/core/src/request-log/writer.js";
// 运行期额度快照(与 electron 同一份投影):due-first 的「到期早的先上」靠它,
// 见 AppSchedulerRepo 的 quotaSnapshot 契约说明。
import { chQuotaTableForScheduler } from "@as-one/panel/src/index.js";
import { AppSchedulerRepo } from "./repo.js";
import { buildResolveUpstream } from "./upstream.js";
import type { RerouteSettings } from "./reroute.js";
import { listModelEntries, providersWithCredentials } from "./models.js";

/** sensenova key 自愈结果(与 `@as-one/panel` 的 `PanelBundle["snRepairKey"]` 同形)。 */
export interface SensenovaKeyRepairResult {
  ok: boolean;
  message: string;
  created: boolean;
  dropped: string[];
}

export interface SetupAsOneOptions {
  /** 配置目录:放 as-one.providers.json 等导入/导出文件。 */
  configDir: string;
  /** SQLite 文件路径(或 ":memory:")。 */
  dbPath: string;
  /** 请求明细日志目录(默认 `<configDir>/logs`,与 electron 同口径)。 */
  logDir?: string;
  /** 环境变量来源(默认 process.env),供 EnvKeyProvider 探测 ONE_API_KEY。 */
  env?: Record<string, string | undefined>;
  /**
   * 辅助请求的重路由设置(见 `reroute.ts`)。
   *
   * 只有「图像解析」这一条在这里消费:网关的图像桥需要一个**真的能看图**的
   * 模型名,没配就没有解析车道(请求带图原样放行,由上游自己决定能不能看)。
   * 压缩摘要与会话标题的重路由在 adapter 里做,不经运行时。
   */
  routes?: RerouteSettings;
}

export interface AsOneRuntime {
  configDir: string;
  dbPath: string;
  logDir: string;
  db: NexusDatabase;
  registry: ProviderRegistry;
  vault: CredentialVault;
  repo: AppSchedulerRepo;
  scheduler: Scheduler;
  router: Router;
  ledger: Router["ledger"];
  health: Router["health"];
  keyProvider: KeyProvider;
  /** 账户启用/停用 overlay(内存态;setAccountEnabled 写入,阶段二再持久化)。 */
  accountOverlay: Map<string, boolean>;
  resolveUpstream: (model: string) => Upstream | undefined;
  listModels: () => ModelEntry[] | Promise<ModelEntry[]>;
  /**
   * 请求完成 → 明细日志 + stats_daily 聚合(与 electron `logRequestDone` 同口径)。
   *
   * ⚠️ 面板的「用量统计」只读 `stats_daily`;不调这里,统计页永远是空的。
   */
  onRequestDone(info: RequestDoneInfo): void;
  /** 密钥在场表:repo 的 hasSecret 需同步读,装配时一次性探测(不碰明文)。 */
  secretPresence: Map<string, boolean>;
  /** 把库里的最新状态重新投影进注册表(面板写库之后调用,索引即时对齐)。 */
  syncRegistry(): void;
  startedAtMs: number;
  /**
   * sensenova key 自愈的**注册口** —— 面板构造完之后由 `panel-host.ts` 挂上来。
   *
   * 为什么要有这个口:自愈要跑登录 + 建 key(依赖 `PanelContext.vault` 与
   * `snCred` 闭包),只能活在 `createPanel` 里;而网关注入点
   * (`onSensenovaKeyInvalid`)在 `setupAsOne` 里 —— 两个作用域不互通。插件宿主
   * 先 `setupAsOne` 再 `createPanelHost`,于是用一个可变槽搭桥(与 electron
   * `assembly.ts` 的模块级 `sensenovaKeyRepair` 同一手法)。
   *
   * 未注册时网关侧静默跳过自愈:当轮请求照常按 auth 失败处理(落冷却/换档)。
   */
  setSensenovaKeyRepair(
    fn: ((username: string, reason: string) => Promise<SensenovaKeyRepairResult>) | null,
  ): void;
  dispose(): void;
}

/**
 * sensenova 连接器账号池的**进程级单例**(Nexus `sensenova.py` 的 AccountPool)。
 *
 * ⚠️ 池是运行态(冷却/健康/滚动记账)不可序列化,必须进程内唯一 —— 所以放模块级。
 * 注册表按 vendorId 覆盖:这个带账号池的实例替掉 defaultConnectors 里的无参实例。
 */
const sensenovaPoolConnector = new SensenovaAdapter();
registerConnector(sensenovaPoolConnector);

/**
 * 用库里 sensenova 凭据(有 secret=api key 的行)重灌连接器账号池。
 *
 * ⚠️ `setAccounts` 是**整池替换**:同名账号保留运行态(冷却/健康/滚动计数是
 * 运行事实,不能因凭据刷新归零),已删除的账号从池里摘掉。
 */
export async function syncSensenovaPool(vault: CredentialVault): Promise<void> {
  try {
    const creds = await vault.list("sensenova").catch(() => []);
    const accounts: SensenovaAccount[] = [];
    for (const c of creds) {
      const full = await vault.get("sensenova", c.username).catch(() => null);
      const key = full?.secret?.trim();
      if (!key) continue; // 只登录没 key 的行不进池(拿不到 key 就没法打上游)
      accounts.push({ username: c.username, api_key: key, enabled: true });
    }
    sensenovaPoolConnector.setAccounts(accounts);
  } catch (err) {
    console.error("[as-one] sensenova account pool sync failed:", err);
  }
}

// ── 设置读取小工具(与 electron 同口径的缺省值) ──────────────────────────

function settingOf(db: NexusDatabase, key: string): string | null {
  const row = db.setting.get(key);
  return row ? row.v : null;
}

/** 数字设置:缺失/空串/NaN → 缺省;`floor` 给下限。 */
function numSetting(db: NexusDatabase, key: string, def: number, min = 0): number {
  const raw = settingOf(db, key);
  if (raw === null || raw === "") return def;
  const n = Number(raw);
  if (Number.isNaN(n) || n < min) return def;
  return n;
}

/** 逻辑模型 members 的 JSON 数组 → 成员对(兼容 {provider,model} 对象与 "p/m" 串)。 */
function parseMembers(raw: string | null | undefined): Array<{ provider: string; model: string }> {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: Array<{ provider: string; model: string }> = [];
    for (const item of arr) {
      if (typeof item === "string") {
        const pair = splitModelId(item);
        if (pair) out.push({ provider: pair[0], model: pair[1] });
      } else if (item !== null && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const p = o.provider;
        const m = o.model;
        if (typeof p === "string" && typeof m === "string" && p !== "" && m !== "") {
          out.push({ provider: p, model: m });
        } else if (typeof o.real_model_id === "string") {
          const pair = splitModelId(o.real_model_id);
          if (pair) out.push({ provider: pair[0], model: pair[1] });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** `supported_reasoning_efforts`:JSON 数组字符串 → 档位表;NULL/坏值 → null(不拦)。 */
function parseEfforts(raw: string | null | undefined): string[] | null {
  if (raw === null || raw === undefined) return null;
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

/** `reasoning_allows_off`:SQLite 布尔(0/1)或 JSON true/false → 三态。 */
function parseAllowsOff(raw: boolean | number | null | undefined): boolean | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  return null;
}

export async function setupAsOne(options: SetupAsOneOptions): Promise<AsOneRuntime> {
  const { configDir, dbPath } = options;
  const env = options.env ?? process.env;
  const startedAtMs = Date.now();

  mkdirSync(configDir, { recursive: true });

  // 1. DB 先开 —— 它是唯一真源(WAL + foreign_keys + SCHEMA_V7,缺失自动建)。
  const db = openDatabase(dbPath);

  // 2. 注册表 = 数据库在内存里的索引(provider / real_model / logical_model /
  //    scheduler.rules 全部来自表;JSON 已退化为导入/导出格式)。
  const providersPath = join(configDir, "as-one.providers.json");
  const registry = ProviderRegistry.fromSnapshot(snapshotFromDb(db).snapshot, {
    filePath: providersPath,
  });

  /** 把库里的最新状态重新投影进注册表(面板写库之后调用,索引即时对齐)。 */
  const syncRegistry = (): void => {
    try {
      registry.refreshFromSnapshot(snapshotFromDb(db).snapshot);
    } catch (err) {
      // 投影失败不阻断写路径:注册表停留在旧快照,scheduler.invalidate 仍会重读 db。
      console.error("[as-one] registry reprojection failed:", err);
    }
  };

  // 3. 凭据库(表后端;credential 表是唯一真源)。
  const vault = new CredentialVault(new DbCredentialBackend(db));

  // 4. sensenova 账号池启动播种(凭据以库为唯一真源)。
  await syncSensenovaPool(vault);

  // 5. 密钥存在性探测:repo 只关心「有没有」,不碰明文。
  const secretPresence = new Map<string, boolean>();
  for (const pdef of registry.listProviders()) {
    try {
      for (const username of (await vault.secretsFor(pdef.id)).keys()) {
        secretPresence.set(`${pdef.id}/${username}`, true);
      }
    } catch (err) {
      console.error(`[as-one] credential probe failed for provider ${pdef.id}:`, err);
    }
  }

  // 账户启用/停用 overlay(内存态;setAccountEnabled 写入,阶段二再持久化)。
  const accountOverlay = new Map<string, boolean>();

  // 6. 调度 + 路由。
  const repo = new AppSchedulerRepo(db, registry, {
    hasSecret: (ref) => secretPresence.get(ref) ?? false,
    isAccountEnabled: (ref) => accountOverlay.get(ref) ?? (registry.getAccount(ref)?.enabled ?? false),
    // 运行期额度快照:与 electron 同一份投影(`@as-one/panel` 模块级 chQuotaCache)。
    // 没喂它 → due-first 的 `_expiryOf()` 两个来源全空 → 排序键并列 → 只能按
    // members 数组序,「到期早的先上」等于没生效(用户 m17562/m34799)。
    // 面板刷新写完缓存后会 `scheduler.invalidate()`,所以这里不必自己缓存。
    quotaSnapshot: () => chQuotaTableForScheduler(),
  });
  const scheduler = new Scheduler(repo, {});
  const router = new Router(repo, {
    // 会话粘性活读设置项(与 electron 同口径:default 900s;0 = 关掉粘性)。
    pinSecondsOf: () => numSetting(db, "scheduler.pin_seconds", 900),
    onCommit: () => {
      try {
        scheduler.invalidate();
      } catch {
        /* 缓存失效失败不影响请求 */
      }
    },
  });

  // 7. 鉴权(沿 core EnvKeyProvider 语义:ONE_API_KEY;空 key = 放行 + 一次性警告)。
  const keyProvider: KeyProvider = new EnvKeyProvider("ONE_API_KEY", env);

  // 8. 请求日志:明细写 <logDir>/requests-YYYYMMDD.jsonl(按天),聚合走 stats_daily。
  const logDir = options.logDir ?? join(configDir, "logs");
  const requestLogWriter = new RequestLogWriter(logDir);
  const requestLogMode = createContentModeResolver((key) => settingOf(db, key));

  /**
   * 请求完成行(与 electron `logRequestDone` 同口径):
   * 真实 provider/model/username 从选路落账里取 —— 同 logical+stream+session(或
   * 缓存路由键)的最新一条就是本次;匹配不上时只写明细、不写聚合(诚实降级)。
   */
  const onRequestDone = (info: RequestDoneInfo): void => {
    let realModelId: string | undefined;
    let endpointId: string | undefined;
    try {
      const affinityKeys = new Set<string>();
      if (info.session_id) affinityKeys.add(info.session_id);
      if (info.prompt_cache_key) affinityKeys.add(info.prompt_cache_key);
      const matched = router.ledger.recentRows(40).find(
        (r) =>
          r.lease.logicalModel === info.model &&
          r.lease.stream === info.stream &&
          (affinityKeys.size === 0 || affinityKeys.has(r.lease.sessionId)),
      );
      if (matched) {
        realModelId = matched.lease.realModelId;
        endpointId = matched.lease.endpointId;
      }
    } catch {
      /* ledger 异常不阻断请求路径;按未匹配降级 */
    }
    // 逻辑模型名一律查库定名:客户端发来的 model 可能是真实模型直连名
    // (`provider/model`),那种名字不在 logical_model 表里 → 必须落 NULL。
    const logicalName = repo.logicalModelRow(info.model) !== null ? info.model : null;
    const row: RequestLogRow = {
      ts: Date.now() / 1000,
      real_model_id: realModelId,
      logical_model: logicalName,
      username: endpointId ? endpointId.split("@")[1]?.split("/")[1] : undefined,
      session_id: info.session_id ?? null,
      prompt_cache_key: info.prompt_cache_key ?? null,
      discarded_fields: info.discarded_fields ?? null,
      status: info.status,
      ok: info.ok,
      error: info.error ?? undefined,
      error_kind: info.error_kind ?? undefined,
      latency_ms: info.latency_ms,
      ttft_ms: info.ttft_ms,
      usage: info.usage ?? undefined,
      request: info.request,
    };
    try {
      logRequests([row], {
        record: (delta) => db.statsDaily.record(delta),
        writer: requestLogWriter,
        getSetting: (key) => settingOf(db, key),
        getContentMode: requestLogMode,
      });
    } catch {
      /* 日志记账失败不影响请求(磁盘写失败/序列化异常) */
    }
  };

  // 9. 网关注入(与 electron 逐项对齐;缺一项就是行为漂移)。
  //
  // sensenova key 自愈的实现由面板后挂(见 setSensenovaKeyRepair 的 docstring):
  // 这个槽必须是**每个 runtime 自己的闭包变量**,不能放模块级 —— 插件测试会
  // 并行建多个 runtime,放模块级会串味(后建的覆盖先建的)。
  let sensenovaKeyRepair:
    | ((username: string, reason: string) => Promise<SensenovaKeyRepairResult>)
    | null = null;

  /**
   * WorkBuddy 账号级出站节流(A1,2026-11-08)。
   *
   * ⚠️ **每个 runtime 一个实例**(不能放模块级):插件测试会并行建多个 runtime,
   * 模块级状态会串味(与上面 sensenova 自愈槽同一纪律)。
   *
   * ⚠️ 间隔**写死在 `account-throttle.ts`**(`ACCOUNT_MIN_INTERVAL_MS` = 4 秒,
   * 抖动 25%),**不是设置项**(2026-11-09 用户定案「写死在 wb 连接器中,
   * 不作为可设置项」)。它是账号安全下限:做成设置项意味着能被调成 0(关掉),
   * 那正是导致 11140 封号、凭据被物理删除的行为。
   */
  const workbuddyThrottle = new AccountThrottle();

  /**
   * WorkBuddy 首用自检(A4,2026-11-08):新账号第一次被选中时先打一次只读计费探针。
   * 命中 11140 → 网关不发对话请求,错误出口物理删除凭据 + 熔断渠道。
   */
  const workbuddySelfCheck = createWorkbuddySelfCheck({ vault });

  const resolveUpstream = buildResolveUpstream({
    scheduler,
    router,
    registry,
    vault,
    routes: options.routes,
    // 逻辑模型级输出上限(成员链最小值)—— `max_tokens` 钳制要用。
    // 唯一真源 = db(不读 registry:面板删掉的模型不该还参与钳制)。
    logicalOutputCap: (logicalName: string): number | null => {
      const row = db.logicalModel.get(logicalName);
      if (!row) return null;
      const members = parseMembers(row.members);
      if (members.length === 0) return null;
      const caps: number[] = [];
      for (const m of members) {
        const dbRow = db.realModel.get(m.provider, m.model);
        const rdef = registry.getRealModel(m.provider, m.model);
        const cap = dbRow?.max_output_tokens ?? rdef?.maxOutputTokens ?? null;
        if (cap === null || cap === undefined) return null; // 任一成员缺失 → 不放大上限
        caps.push(cap);
      }
      return caps.length > 0 ? Math.min(...caps) : null;
    },
    // 思考强度能力表(三态:NULL 不拦 / [] 一律不发 / [...] 钳制)。
    reasoningEffortsOf: (provider, model) =>
      parseEfforts(db.realModel.get(provider, model)?.supported_reasoning_efforts),
    reasoningAllowsOffOf: (provider, model) =>
      parseAllowsOff(db.realModel.get(provider, model)?.reasoning_allows_off),
    // 上游拒了 reasoning_effort → 丢参重试成功 ⇒ 写明「该模型不支持思考档位」。
    //
    // ⚠️ 写 `[]` 而不是 NULL(2026-11-08):NULL 只是「上游没给表」,将来上游
    // 补上档位表就会重新发送;`[]` 是确定的「不支持」,既不发也不用再学。
    onReasoningEffortLearned: (provider, model) => {
      try {
        db.realModel.update({ provider, model, supported_reasoning_efforts: "[]" });
      } catch (err) {
        console.error("[as-one] 记录思考强度不支持失败:", err);
      }
    },
    // 连接超时(秒)= 设置项 `real.wait_budget_s`;0 = 不设超时;坏值回退 60。
    requestTimeoutMs: () => numSetting(db, "real.wait_budget_s", 60),
    // 重试策略(次数上限 + 退避 + 可重试白名单);一次读齐,请求内前后一致。
    retryPolicy: (abstract: boolean) =>
      RetryPolicy.of(
        {
          getSetting: (key: string) => settingOf(db, key),
          setSetting: (key: string, value: string | null) => {
            db.setting.set(key, value);
          },
        },
        { abstract },
      ),
    // ⚠️ **凭据类失败 → 后台换 key**(用户 m16528)。这里是**不阻塞**的:换 key
    //    要登录 + 建 key + 等 IAM 传播(实测 ~8s),原地等会把这次请求的 TTFT
    //    硬拖 8 秒起跳;换档去别的账号**立刻**能试。冷却照常落(按
    //    `scheduler.cooldown_overrides` 里的 sensenova 设置值),后台修好 + 冷却
    //    到期 ⇒ 下一跳即用新 key。
    //    自愈实现由 `setSensenovaKeyRepair` 后挂(面板构造完才有)。
    onSensenovaKeyInvalid: (username) => {
      const repair = sensenovaKeyRepair;
      if (!repair) return; // 面板还没构造完就收到 auth 失败 → 跳过自愈
      void repair(username, "上游返回 401/403:API key 无效或已被回收")
        .then((r) => {
          console.warn(
            `[as-one] [sensenova] key 自愈 ${r.ok ? "完成" : "未成功"}(${username}):${r.message}`,
          );
          if (!r.ok) return;
          // 修好了 → 清掉这个账号名下的冷却:凭据已经换新,还按旧冷却挡着只会
          // 让用户多等一轮。下次若新 key 仍不灵,会重新落冷却。
          try {
            router.thawAccount("sensenova", username);
          } catch {
            /* 解冻失败不影响请求路径 */
          }
        })
        .catch((err: unknown) => {
          console.error(
            `[as-one] [sensenova] key 自愈异常(${username}):${err instanceof Error ? err.message : String(err)}`,
          );
        });
    },
    // A1:WorkBuddy 账号级最小请求间隔(网关在 commit 之前等,见 AccountThrottle)。
    workbuddyThrottle: async (username: string, signal?: AbortSignal) => {
      await workbuddyThrottle.acquire(accountThrottleKey("workbuddy", username), signal);
    },
    // A4:WorkBuddy 首用自检(新账号首个请求前先打只读探针)。
    workbuddySelfCheck,
  });

  return {
    configDir,
    dbPath,
    logDir,
    db,
    registry,
    vault,
    repo,
    scheduler,
    router,
    ledger: router.ledger,
    health: router.health,
    keyProvider,
    accountOverlay,
    secretPresence,
    syncRegistry,
    resolveUpstream,
    listModels: async () => listModelEntries(registry, db, await providersWithCredentials(registry, vault)),
    onRequestDone,
    startedAtMs,
    setSensenovaKeyRepair(fn) {
      sensenovaKeyRepair = fn;
    },
    dispose() {
      try {
        sensenovaPoolConnector.setAccounts([]);
      } catch {
        /* 池收尾失败不影响进程退出 */
      }
      vault.close();
      registry.close();
      db.close();
    },
  };
}

/** 供测试/装配复用:把内容档位设定读成 `ContentMode`。 */
export type { ContentMode };
