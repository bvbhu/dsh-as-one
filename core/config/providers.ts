/**
 * Provider 注册表 —— provider 定义 / 账户配置 / 逻辑模型 / 调度规则
 * 的加载、校验、查找,以及 ``fs.watch`` 热重载。
 *
 * 设计目标
 * --------
 * - **文件即配置**:Nexus 用 SQLite 表(provider / credential / real_model /
 *   logical_model / setting)当唯一真源;as-one 阶段一用**单个 JSON 文件**
 *   (``as-one.providers.json``)承载**非机密**部分 —— provider 定义、
 *   账户配置(启用/停用、冷却/亲和参数)、逻辑模型、调度规则。
 *   **凭据(secret)不进这个文件**,由 {@link CredentialVault} 持有
 *   (见 credentials.ts 的文件格式说明)。两边用
 *   ``credentialRef = "<provider>/<username>"`` 对齐(Nexus 的
 *   ``credential_key`` 字符串形态)。
 * - **校验哲学**(镜像 engine.py L934-1033 ``_valid_rules`):坏条目
 *   **跳过 + 大声 warning(issue),绝不因单条坏规则回滚整份配置**;
 *   但**版本号不认识 / 根节点不是对象**这类「整份都读不了」的错误
 *   必须**抛 {@link ConfigValidationError}** —— 静默丢配置比报错危险。
 * - **热重载**:``fs.watch`` 防抖 → 重新加载 → 成功则原子换快照;
 *   失败**保留上次好快照**并发射 ``error`` 事件(Nexus 配置缓存同哲学:
 *   engine.py L1641-1713 坏 JSON 回落默认,绝不抛)。
 *
 * 与 Nexus 的字段对应
 * ------------------
 * - provider 定义      —— provider 表(schema.sql L97-102);
 * - 账户配置           —— ⚠️ Nexus 无独立账户表:账户 = credential 行,
 *   启用/停用/配额/冷却/pin 全是运行期内存态(D17-D19,repo.py L1334-1429)。
 *   本文件的 ``accounts`` 段是**静态配置视图**,字段语义见
 *   ``AccountConfig``(types.ts);
 * - realModels          —— real_model 表(schema.sql L151-166);
 * - logicalModels       —— logical_model 表(schema.sql L168-172),
 *   members 归一化镜像 repo.py L287-312 ``normalize_members``
 *   (三种输入形状、顺序即 priority、完全重复只留第一次);
 * - schedulerRules      —— setting ``scheduler.rules`` 的扁平数组,
 *   校验逐条镜像 engine.py L934-1033 ``_valid_rules``
 *   (含 ``window`` / ``logical`` 废弃字段的宽容忽略)。
 */

import { readJsonFile, watchJsonFile, type FileWatcher } from "./store.js";
import type {
  AccountConfig,
  ChainMember,
  LogicalModelDefinition,
  ProviderDefinition,
  ProviderProtocol,
  RealModelDefinition,
  SchedulerRule,
  SchedulerStrategy,
  SchedulerWindow,
} from "./types.js";
import {
  DEFAULT_PROVIDER_PROTOCOL,
  DEFAULT_SCHEDULER_STRATEGY,
  isProviderProtocol,
  normalizeStrategy,
} from "./types.js";

// ===========================================================================
// 文件形态
// ===========================================================================

/** provider 文件里的 provider 条目(定义 + 其名下真实模型 + 账户配置)。 */
export interface ProviderEntry extends ProviderDefinition {
  realModels: RealModelDefinition[];
  accounts: AccountConfig[];
}

/** provider 配置文件的文档形态(阶段一的 JSON schema)。 */
export interface ProviderConfigFile {
  version: 1;
  providers: ProviderEntry[];
  logicalModels: LogicalModelDefinition[];
  schedulerRules: SchedulerRule[];
}

// ===========================================================================
// 校验错误
// ===========================================================================

/** 单条配置问题(坏条目跳过时记录,加载期汇总给调用方)。 */
export interface ConfigIssue {
  /** JSON 路径(``providers[2].accounts[0]`` 风格,便于人工定位)。 */
  path: string;
  /** 人类可读描述(含被丢弃的值)。 */
  message: string;
}

/**
 * 配置加载失败(整份读不了:版本不认识 / 根节点不是对象 / JSON 语法错误)。
 *
 * 与「单条坏条目跳过 + issue」的分工:坏条目不致命(运行中的系统不能因
 * 一条坏规则整体不可用),但**整份读不了**必须出声 —— 静默回落空配置
 * 会让用户以为「账号都还在」。
 */
export class ConfigValidationError extends Error {
  readonly issues: readonly ConfigIssue[];
  constructor(issues: readonly ConfigIssue[], message?: string) {
    super(
      message ??
        `provider 配置加载失败(${issues.length} 个问题): ${issues
          .map((i) => `[${i.path}] ${i.message}`)
          .join("; ")}`,
    );
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

// ===========================================================================
// 内部快照(查找索引)
// ===========================================================================

/**
 * 注册表快照(查找索引)。
 *
 * 两个来源:
 * - **文件**({@link ProviderRegistry.load}):阶段一 / 测试 / dsh-plugin 兼容路径;
 * - **数据库**({@link snapshotFromDb},见 db-registry.ts):桌面端的唯一真源。
 *
 * 快照本身只是内存索引 —— 谁造它不重要,查找语义完全相同。
 */
export interface RegistrySnapshot {
  providers: ReadonlyMap<string, ProviderDefinition>;
  /** 键 = ``"<provider>/<model>"``(repo.py L181 ``real_model_id``)。 */
  realModels: ReadonlyMap<string, RealModelDefinition>;
  /** 键 = ``credentialRef``(``"<provider>/<username>"``)。 */
  accounts: ReadonlyMap<string, AccountConfig>;
  logicalModels: ReadonlyMap<string, LogicalModelDefinition>;
  schedulerRules: readonly SchedulerRule[];
}

/** 空快照(全新安装 / 库表为空)。 */
export function emptySnapshot(): RegistrySnapshot {
  return {
    providers: new Map(),
    realModels: new Map(),
    accounts: new Map(),
    logicalModels: new Map(),
    schedulerRules: [],
  };
}

// ===========================================================================
// 纯校验函数(可单测;不碰文件系统)
// ===========================================================================

/**
 * 解析 ``"provider/model"`` —— 镜像 repo.py L199-211 ``split_model_id``:
 * 按**第一个** ``/`` 切(模型名可含斜杠);无 ``/`` → ``[null, 原文]``。
 */
export function splitModelId(value: string): readonly [string | null, string] {
  const idx = value.indexOf("/");
  if (idx < 0) return [null, value];
  return [value.slice(0, idx), value.slice(idx + 1)];
}

/**
 * ``YYYY-MM-DD [HH:MM:SS]`` → epoch 秒(本地时区);解析不了 → ``null``。
 *
 * 镜像 engine.py L425-451 ``_expiry_epoch``:两种粒度按顺序尝试,
 * **天级取 00:00**(保持既有行为,不改成 23:59),且两种格式分开解析
 * (``%Y-%m-%d`` 会吃掉后面多余的字符,静默截断秒级精度)。
 */
export function parseExpiryDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  // ⚠️ 组件级校验:JS 的 ``new Date(2026, 12, 45)`` 会**滚动**成次年
  // 2 月(不返回 Invalid Date),而 Python ``strptime`` 对非法日期直接
  // ValueError。这里逐组件验证,与 _expiry_epoch 同口径。
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  // 当月天数(下个月的第 0 天 = 本月最后一天)。
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;
  if (hour > 23 || minute > 59 || second > 61) return null; // 61 = 闰秒
  // 本地时区(与 time.mktime 同口径)。
  const t = new Date(year, month - 1, day, hour, minute, second, 0);
  return Math.floor(t.getTime() / 1000);
}

/**
 * ``"HH:MM"`` 是否可解析(镜像 engine.py L488-490 ``_hhmm`` 的宽松度:
 * 按 ``:`` 切两段、各自 ``int()`` —— 允许前导零/空白/负数)。
 */
function isHhMm(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const parts = value.trim().split(":");
  if (parts.length !== 2) return false;
  return /^-?\d+$/.test(parts[0]!.trim()) && /^-?\d+$/.test(parts[1]!.trim());
}

/** ``times`` spans 校验(镜像 engine.py L853-865 ``_valid_spans``)。 */
function isValidSpans(value: unknown): value is [string, string][] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (span): span is [string, string] =>
      Array.isArray(span) && span.length === 2 && isHhMm(span[0]) && isHhMm(span[1]),
  );
}

/** 正有限数(``0`` / 负数 / NaN /  Infinity 都不要)。 */
function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** 正整数(``concurrency`` / 窗口等)。 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** 布尔或 ``undefined``(缺省走调用方默认)。 */
function asBool(value: unknown, fallback: boolean): { ok: boolean; value: boolean } {
  if (value === undefined || value === null) return { ok: true, value: fallback };
  if (typeof value === "boolean") return { ok: true, value };
  return { ok: false, value: fallback };
}

/** 可空字符串或 ``null``。 */
function asNullableString(value: unknown, fallback: string | null): { ok: boolean; value: string | null } {
  if (value === undefined) return { ok: true, value: fallback };
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string") return { ok: true, value };
  return { ok: false, value: fallback };
}

// ---------------------------------------------------------------------------
// 各段校验(返回归一化条目 + issues;坏条目跳过不抛)
// ---------------------------------------------------------------------------

/** 归一化 members(镜像 repo.py L287-312 ``normalize_members``)。 */
function normalizeMembers(
  raw: unknown,
  path: string,
  issues: ConfigIssue[],
): ChainMember[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `members 不是数组,按空档链处理` });
    return [];
  }
  const out: ChainMember[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const itemPath = `${path}[${i}]`;
    let provider: string | null = null;
    let model: string | null = null;
    if (typeof item === "string") {
      [provider, model] = splitModelId(item);
    } else if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      if (typeof obj.provider === "string" && obj.provider !== "" &&
          typeof obj.model === "string" && obj.model !== "") {
        provider = obj.provider;
        model = obj.model;
      } else {
        [provider, model] = splitModelId(
          typeof obj.real_model_id === "string" ? obj.real_model_id
            : typeof obj.id === "string" ? obj.id : "",
        );
      }
    }
    if (!provider || !model) {
      issues.push({ path: itemPath, message: `members 条目缺少 provider/model,已忽略:${JSON.stringify(item)}` });
      return;
    }
    const key = `${provider}/${model}`;
    if (seen.has(key)) {
      // 完全重复的 (provider, model) 只保留第一次(repo.py L290-292:
      // 「数组里出现两次同一个模型没有意义,只会让选路把它算两遍」)。
      return;
    }
    seen.add(key);
    out.push({ provider, model });
  });
  return out;
}

/** 校验 provider 条目(``providers[i]``)。 */
function validateProviderEntry(
  raw: unknown,
  index: number,
  issues: ConfigIssue[],
): ProviderEntry | null {
  const path = `providers[${index}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ path, message: `provider[${index}] 不是对象,已跳过` });
    return null;
  }
  const obj = raw as Record<string, unknown>;

  // id:必填非空。
  if (typeof obj.id !== "string" || obj.id === "") {
    issues.push({ path, message: `providers[${index}] 缺非空 id,已跳过` });
    return null;
  }
  const providerId = obj.id;

  // protocol:缺省 openai;非法值 → 跳过整条(猜错协议会把流量送错适配器)。
  if (obj.protocol === undefined) {
    // 缺省,无 issue。
  } else if (!isProviderProtocol(obj.protocol)) {
    issues.push({
      path: `${path}.protocol`,
      message: `未知协议 ${JSON.stringify(obj.protocol)},已跳过 provider ${providerId}`,
    });
    return null;
  }

  const baseUrl = asNullableString(obj.baseUrl, null);
  if (!baseUrl.ok) {
    issues.push({ path: `${path}.baseUrl`, message: `baseUrl 必须是字符串或 null,按 null 处理` });
  }
  const envPrefix = asNullableString(obj.envPrefix, null);
  if (!envPrefix.ok) {
    issues.push({ path: `${path}.envPrefix`, message: `envPrefix 必须是字符串或 null,按 null 处理` });
  }

  // realModels
  const realModels: RealModelDefinition[] = [];
  const modelSeen = new Set<string>();
  const rawModels = Array.isArray(obj.realModels) ? obj.realModels : [];
  if (obj.realModels !== undefined && !Array.isArray(obj.realModels)) {
    issues.push({ path: `${path}.realModels`, message: `realModels 不是数组,按空处理` });
  }
  rawModels.forEach((m, j) => {
    const mPath = `${path}.realModels[${j}]`;
    if (typeof m !== "object" || m === null || Array.isArray(m)) {
      issues.push({ path: mPath, message: `realModels[${j}] 不是对象,已跳过` });
      return;
    }
    const mo = m as Record<string, unknown>;
    if (typeof mo.model !== "string" || mo.model === "") {
      issues.push({ path: mPath, message: `realModels[${j}] 缺非空 model,已跳过` });
      return;
    }
    const key = `${providerId}/${mo.model}`;
    if (modelSeen.has(key)) {
      issues.push({ path: mPath, message: `重复的真实模型 ${key},已保留后者(与 DB upsert 同口径)` });
    } else {
      modelSeen.add(key);
    }
    const name = asNullableString(mo.name, null);
    if (!name.ok) issues.push({ path: `${mPath}.name`, message: `name 必须是字符串或 null,按 null 处理` });
    const vision = asBool(mo.supportsVision, false);
    if (!vision.ok) issues.push({ path: `${mPath}.supportsVision`, message: `supportsVision 必须是布尔,按 false 处理` });
    const hidden = asBool(mo.hidden, false);
    if (!hidden.ok) issues.push({ path: `${mPath}.hidden`, message: `hidden 必须是布尔,按 false 处理` });
    const maxIn = mo.maxInputTokens === undefined ? null
      : isPositiveInt(mo.maxInputTokens) ? mo.maxInputTokens
      : (issues.push({ path: `${mPath}.maxInputTokens`, message: `maxInputTokens 必须是正整数,按 null 处理` }), null);
    const maxOut = mo.maxOutputTokens === undefined ? null
      : isPositiveInt(mo.maxOutputTokens) ? mo.maxOutputTokens
      : (issues.push({ path: `${mPath}.maxOutputTokens`, message: `maxOutputTokens 必须是正整数,按 null 处理` }), null);
    // ⚠️ concurrency 的 null 语义与 maxInputTokens 不同:repo.py L794
    // SQL 是 COALESCE(?, 1) —— 传 NULL 表示「不改」,不是「清空」。
    const concurrency = mo.concurrency === undefined ? null
      : isPositiveInt(mo.concurrency) ? mo.concurrency
      : (issues.push({ path: `${mPath}.concurrency`, message: `concurrency 必须是正整数,按 null(不覆盖)处理` }), null);
    realModels.push({
      provider: providerId,
      model: mo.model,
      name: name.value,
      supportsVision: vision.value,
      maxInputTokens: maxIn,
      maxOutputTokens: maxOut,
      hidden: hidden.value,
      concurrency,
    });
  });

  // accounts
  const accounts: AccountConfig[] = [];
  const accountSeen = new Set<string>();
  const rawAccounts = Array.isArray(obj.accounts) ? obj.accounts : [];
  if (obj.accounts !== undefined && !Array.isArray(obj.accounts)) {
    issues.push({ path: `${path}.accounts`, message: `accounts 不是数组,按空处理` });
  }
  rawAccounts.forEach((a, j) => {
    const aPath = `${path}.accounts[${j}]`;
    if (typeof a !== "object" || a === null || Array.isArray(a)) {
      issues.push({ path: aPath, message: `accounts[${j}] 不是对象,已跳过` });
      return;
    }
    const ao = a as Record<string, unknown>;
    if (typeof ao.credentialRef !== "string" || ao.credentialRef === "") {
      issues.push({ path: aPath, message: `accounts[${j}] 缺非空 credentialRef,已跳过` });
      return;
    }
    // 外键一致性:credentialRef 必须是 "<本 provider>/<username>"
    // (镜像 credential.provider 的外键关系)。
    if (!ao.credentialRef.startsWith(`${providerId}/`)) {
      issues.push({
        path: `${aPath}.credentialRef`,
        message: `credentialRef ${JSON.stringify(ao.credentialRef)} 与所在 provider ${providerId} 不一致,已跳过`,
      });
      return;
    }
    if (accountSeen.has(ao.credentialRef)) {
      issues.push({ path: aPath, message: `重复的账户 ${ao.credentialRef},已保留后者` });
    } else {
      accountSeen.add(ao.credentialRef);
    }
    const enabled = asBool(ao.enabled, true);
    if (!enabled.ok) issues.push({ path: `${aPath}.enabled`, message: `enabled 必须是布尔,按 true 处理` });
    const cooldown = ao.cooldownOverrideMinutes === undefined ? null
      : (ao.cooldownOverrideMinutes === null || isPositiveNumber(ao.cooldownOverrideMinutes))
        ? ao.cooldownOverrideMinutes
        : (issues.push({ path: `${aPath}.cooldownOverrideMinutes`, message: `cooldownOverrideMinutes 必须是正数或 null,按 null 处理` }), null);
    const pinTtl = ao.sessionPinTtlSeconds === undefined ? null
      : (ao.sessionPinTtlSeconds === null || isPositiveNumber(ao.sessionPinTtlSeconds))
        ? ao.sessionPinTtlSeconds
        : (issues.push({ path: `${aPath}.sessionPinTtlSeconds`, message: `sessionPinTtlSeconds 必须是正数或 null,按 null 处理` }), null);
    accounts.push({
      credentialRef: ao.credentialRef,
      enabled: enabled.value,
      cooldownOverrideMinutes: cooldown,
      sessionPinTtlSeconds: pinTtl,
    });
  });

  return {
    id: providerId,
    baseUrl: baseUrl.value,
    protocol: obj.protocol === undefined ? DEFAULT_PROVIDER_PROTOCOL : (obj.protocol as ProviderProtocol),
    envPrefix: envPrefix.value,
    realModels,
    accounts,
  };
}

/** 校验逻辑模型条目(``logicalModels[i]``)。 */
function validateLogicalModelEntry(
  raw: unknown,
  index: number,
  issues: ConfigIssue[],
): LogicalModelDefinition | null {
  const path = `logicalModels[${index}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ path, message: `logicalModels[${index}] 不是对象,已跳过` });
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name === "") {
    issues.push({ path, message: `logicalModels[${index}] 缺非空 name,已跳过` });
    return null;
  }
  // ⚠️ 只有「显式给了但认不出来」才 warning + 回退;缺省(null/undefined)
  // 直接给默认值、**不 warning** —— 与 repo.save_logical_model 的
  // ``strategy="random"`` 缺省参数同口径(2026-10-26 起缺省策略为随机)。
  const rawStrategy = obj.strategy;
  const { strategy, fellBack } = rawStrategy == null
    ? { strategy: DEFAULT_SCHEDULER_STRATEGY, fellBack: false }
    : normalizeStrategy(rawStrategy);
  if (fellBack) {
    issues.push({
      path: `${path}.strategy`,
      message: `未知策略 ${JSON.stringify(obj.strategy)},已退回默认 ${DEFAULT_SCHEDULER_STRATEGY}(同 repo.normalize_strategy 口径)`,
    });
  }
  const members = normalizeMembers(obj.members, `${path}.members`, issues);
  return { name: obj.name, strategy, members };
}

/**
 * 校验单条调度规则 —— 逐字段镜像 engine.py L934-1033 ``_valid_rules``。
 *
 * 哲学:**坏条目跳过 + 大声 warning(issue),不回滚整份配置**;
 * 单字段形状不对**按「无该字段」处理**;``priority`` **不再隐式推导**
 * (未写即 {@link DEFAULT_PRIORITY} = 3);``cooldown`` 已拆到
 * ``scheduler.cooldown_overrides``,这里读到就警告并忽略;
 * 旧的扁平 ``times``/``weekdays`` 接受并迁移进 ``window``。
 */
export function validateSchedulerRule(
  raw: unknown,
  path: string,
  issues: ConfigIssue[],
): SchedulerRule | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ path, message: `${path} 不是对象,已忽略` });
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const provider = obj.provider;
  if (typeof provider !== "string" || provider.trim() === "") {
    issues.push({ path, message: `${path} 缺非空 provider,已忽略` });
    return null;
  }

  const rule: SchedulerRule = { provider };

  if (obj.model !== undefined) {
    if (typeof obj.model === "string" && obj.model.trim() !== "") {
      rule.model = obj.model;
    } else {
      issues.push({ path: `${path}.model`, message: `model ${JSON.stringify(obj.model)} 不是非空字符串,按「无 model」处理` });
    }
  }

  if (obj.expiresAt !== undefined) {
    if (parseExpiryDate(obj.expiresAt) !== null) {
      rule.expiresAt = obj.expiresAt as string;
    } else {
      issues.push({ path: `${path}.expiresAt`, message: `expiresAt ${JSON.stringify(obj.expiresAt)} 无法解析成 YYYY-MM-DD,按「无到期」处理` });
    }
  }

  // 时段:优先 window 对象;旧扁平 times/weekdays 兼容并迁入 window。
  const window: SchedulerWindow = {};
  const winSrc = typeof obj.window === "object" && obj.window !== null && !Array.isArray(obj.window)
    ? (obj.window as Record<string, unknown>)
    : null;
  if (obj.window !== undefined && winSrc === null) {
    issues.push({ path: `${path}.window`, message: `window ${JSON.stringify(obj.window)} 不是对象,按「无时段」处理` });
  }
  const timesRaw = winSrc !== null ? winSrc.times : obj.times;
  if (timesRaw !== undefined) {
    if (isValidSpans(timesRaw)) {
      window.times = (timesRaw as [string, string][]).map(([a, b]) => [a, b]);
    } else {
      issues.push({ path: `${path}.times`, message: `times ${JSON.stringify(timesRaw)} 不是合法 spans([["HH:MM","HH:MM"], ...]),按「无时段」处理` });
    }
  }
  const wdRaw = winSrc !== null ? winSrc.weekdays : obj.weekdays;
  if (wdRaw !== undefined) {
    if (
      Array.isArray(wdRaw) && wdRaw.length > 0 &&
      wdRaw.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7)
    ) {
      window.weekdays = wdRaw as number[];
    } else {
      issues.push({ path: `${path}.weekdays`, message: `weekdays ${JSON.stringify(wdRaw)} 不是 1..7 的整数列表,按「每天」处理` });
    }
  }
  if (window.times !== undefined || window.weekdays !== undefined) rule.window = window;

  // cooldown 已拆出到 scheduler.cooldown_overrides:读到就警告并忽略。
  if (obj.cooldown !== undefined) {
    issues.push({ path: `${path}.cooldown`, message: `cooldown 字段已迁到 setting「scheduler.cooldown_overrides」,此处已忽略` });
  }

  // logical 字段已废弃(engine.py L1000-1005):时段规则一律全局生效。
  if (obj.logical !== undefined) {
    issues.push({ path: `${path}.logical`, message: `logical 字段已废弃(时段规则一律全局生效),已忽略` });
  }

  if (obj.priority !== undefined) {
    if (Number.isInteger(obj.priority) && (obj.priority as number) >= 0) {
      rule.priority = obj.priority as number;
    } else {
      issues.push({ path: `${path}.priority`, message: `priority ${JSON.stringify(obj.priority)} 不是非负整数,按「未设置」处理` });
    }
  }

  return rule;
}

/**
 * priority 推导 —— **已停用**(2026-10-21 用户定案)。
 *
 * 旧语义「有 ``expiresAt`` 且无 ``model`` → 自动设 2」是隐式魔法:用户在面板里
 * 写一条「provider 到期日」规则,档位被悄悄改成 2,与他看到的字面不符。
 * 现在未写 priority 一律按 {@link DEFAULT_PRIORITY}(=3),不再推导。
 *
 * 函数保留只为兼容旧调用点/旧测试;它现在**原样返回**入参。
 */
export function derivePriority(rule: SchedulerRule): SchedulerRule {
  return rule;
}

/**
 * 校验整份 provider 配置文件 → 归一化快照 + issues。
 *
 * - 根节点不是对象 / ``version`` 不是 1 → **抛 {@link ConfigValidationError}**
 *   (整份读不了必须出声,见类注释);
 * - 其余结构问题 → 坏条目跳过 + issue(镜像 ``_valid_rules`` 哲学)。
 */
export function loadProviderConfig(raw: unknown): { snapshot: RegistrySnapshot; issues: ConfigIssue[] } {
  const issues: ConfigIssue[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigValidationError(
      [{ path: "$", message: `配置根节点不是对象(${raw === null ? "null" : typeof raw})` }],
      "provider 配置根节点不是对象",
    );
  }
  const root = raw as Record<string, unknown>;
  if (root.version !== 1) {
    throw new ConfigValidationError(
      [{ path: "$.version", message: `无法识别的 version ${JSON.stringify(root.version)}(只支持 1)` }],
      `provider 配置 version 无法识别:${JSON.stringify(root.version)}`,
    );
  }

  const snapshot = emptySnapshot();
  const providers = snapshot.providers as Map<string, ProviderDefinition>;
  const realModels = snapshot.realModels as Map<string, RealModelDefinition>;
  const accounts = snapshot.accounts as Map<string, AccountConfig>;
  const logicalModels = snapshot.logicalModels as Map<string, LogicalModelDefinition>;

  // providers
  const rawProviders = Array.isArray(root.providers) ? root.providers : [];
  if (root.providers !== undefined && !Array.isArray(root.providers)) {
    issues.push({ path: "$.providers", message: `providers 不是数组,按空处理` });
  }
  rawProviders.forEach((entry, i) => {
    const validated = validateProviderEntry(entry, i, issues);
    if (!validated) return;
    const prevProvider = snapshot.providers.get(validated.id);
    if (prevProvider) {
      issues.push({ path: `providers[${i}]`, message: `重复的 provider ${validated.id},已保留后者` });
    }
    providers.set(validated.id, {
      id: validated.id,
      baseUrl: validated.baseUrl,
      protocol: validated.protocol,
      envPrefix: validated.envPrefix,
    });
    for (const model of validated.realModels) {
      realModels.set(`${model.provider}/${model.model}`, model);
    }
    for (const account of validated.accounts) {
      accounts.set(account.credentialRef, account);
    }
  });

  // logicalModels
  const rawLogical = Array.isArray(root.logicalModels) ? root.logicalModels : [];
  if (root.logicalModels !== undefined && !Array.isArray(root.logicalModels)) {
    issues.push({ path: "$.logicalModels", message: `logicalModels 不是数组,按空处理` });
  }
  rawLogical.forEach((entry, i) => {
    const validated = validateLogicalModelEntry(entry, i, issues);
    if (!validated) return;
    const prev = snapshot.logicalModels.get(validated.name);
    if (prev) {
      issues.push({ path: `logicalModels[${i}]`, message: `重复的逻辑模型 ${validated.name},已保留后者` });
    }
    logicalModels.set(validated.name, validated);
  });

  // schedulerRules
  const rawRules = Array.isArray(root.schedulerRules) ? root.schedulerRules : [];
  if (root.schedulerRules !== undefined && !Array.isArray(root.schedulerRules)) {
    issues.push({ path: "$.schedulerRules", message: `schedulerRules 不是数组,按空处理` });
  }
  const rules: SchedulerRule[] = [];
  rawRules.forEach((entry, i) => {
    const validated = validateSchedulerRule(entry, `$.schedulerRules[${i}]`, issues);
    if (validated) rules.push(validated);
  });
  snapshot.schedulerRules = rules;

  return { snapshot, issues };
}

// ===========================================================================
// ProviderRegistry
// ===========================================================================

/** 热重载事件。 */
export type RegistryEvent =
  | { type: "reloaded"; issues: readonly ConfigIssue[] }
  | { type: "error"; error: Error; issues: readonly ConfigIssue[] };

/**
 * provider 注册表 —— 加载 / 校验 / 查找 / 热重载。
 *
 * 用法:
 * ```ts
 * const registry = await ProviderRegistry.load("…/as-one.providers.json");
 * const workbuddy = registry.getProvider("workbuddy");
 * registry.watch(); // fs.watch 热重载,失败保留上次好快照
 * ```
 *
 * ⚠️ 本注册表**不持有凭据**:账户的 secret 在 {@link CredentialVault}
 * 里,通过 ``credentialRef`` 对齐。两者的组合(配置 + 凭据)才是完整
 * 的运行时视图 —— 阶段二由 DSH 宿主把 vault 换成
 * ``ctx.credentials`` 后端(见 credentials.ts 末尾的 sketch)。
 */
export class ProviderRegistry {
  private snapshot: RegistrySnapshot;
  private configIssues: readonly ConfigIssue[];
  private readonly listeners = new Set<(event: RegistryEvent) => void>();
  private watcher: FileWatcher | null = null;
  private closed = false;

  private constructor(
    readonly filePath: string,
    snapshot: RegistrySnapshot,
    issues: readonly ConfigIssue[],
  ) {
    this.snapshot = snapshot;
    this.configIssues = issues;
  }

  /**
   * 加载 provider 配置文件。
   *
   * - 文件不存在 → 空注册表(首次安装,不算错误);
   * - JSON 语法错误 / 版本不认识 / 根节点不是对象 → 抛
   *   {@link ConfigValidationError}(issues 里带具体路径与原因);
   * - 结构问题 → 坏条目跳过 + ``registry.issues`` 可查。
   */
  static async load(filePath: string): Promise<ProviderRegistry> {
    const result = readJsonFile(filePath);
    if (!result.ok) {
      if (result.missing) return new ProviderRegistry(filePath, emptySnapshot(), []);
      throw new ConfigValidationError(
        [{ path: "$", message: `JSON 解析失败:${result.error}` }],
        `provider 配置文件无法解析`,
      );
    }
    const { snapshot, issues } = loadProviderConfig(result.value);
    return new ProviderRegistry(filePath, snapshot, issues);
  }

  /** 配置文件路径。 */
  get path(): string {
    return this.filePath;
  }

  /** 加载期产生的 issues(坏条目跳过 / 宽容忽略等;空数组 = 干净)。 */
  get issues(): readonly ConfigIssue[] {
    return this.configIssues;
  }

  // ---------------------------------------------------------------- 查找

  /** 按 vendor(= provider id)查找 provider 定义;不存在 → ``null``。 */
  getProvider(vendorId: string): ProviderDefinition | null {
    return this.snapshot.providers.get(vendorId) ?? null;
  }

  /** 全部 provider 定义(按 id 升序,镜像 repo.providers() 的 ORDER BY id)。 */
  listProviders(): ProviderDefinition[] {
    return [...this.snapshot.providers.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** 按协议过滤 provider(``openai`` / ``workbuddy`` / ``trae`` / ``sensenova``)。 */
  listProvidersByProtocol(protocol: ProviderProtocol): ProviderDefinition[] {
    return this.listProviders().filter((p) => p.protocol === protocol);
  }

  /** 按 ``credentialRef``(``"<provider>/<username>"``)查找账户配置。 */
  getAccount(credentialRef: string): AccountConfig | null {
    return this.snapshot.accounts.get(credentialRef) ?? null;
  }

  /** 全部账户配置(可选按 provider 过滤;按 credentialRef 升序)。 */
  listAccounts(provider?: string): AccountConfig[] {
    return [...this.snapshot.accounts.values()]
      .filter((a) => (provider === undefined ? true : a.credentialRef.startsWith(`${provider}/`)))
      .sort((a, b) => (a.credentialRef < b.credentialRef ? -1 : a.credentialRef > b.credentialRef ? 1 : 0));
  }

  /** 已启用的账户(``enabled: false`` 的停用账户;Nexus 无此维度 —— 见 AccountConfig 注释)。 */
  listEnabledAccounts(provider?: string): AccountConfig[] {
    return this.listAccounts(provider).filter((a) => a.enabled);
  }

  /** 按 ``(provider, model)`` 查找真实模型定义。 */
  getRealModel(provider: string, model: string): RealModelDefinition | null {
    return this.snapshot.realModels.get(`${provider}/${model}`) ?? null;
  }

  /** 全部真实模型(可选按 provider 过滤)。 */
  listRealModels(provider?: string): RealModelDefinition[] {
    return [...this.snapshot.realModels.values()].filter(
      (m) => (provider === undefined ? true : m.provider === provider),
    );
  }

  /** 按名称查找逻辑模型(档链)。 */
  getLogicalModel(name: string): LogicalModelDefinition | null {
    return this.snapshot.logicalModels.get(name) ?? null;
  }

  /** 全部逻辑模型(按 name 升序)。 */
  listLogicalModels(): LogicalModelDefinition[] {
    return [...this.snapshot.logicalModels.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** 档链成员(**数组顺序 = priority**;不存在 → 空数组)。 */
  membersOf(name: string): ChainMember[] {
    return this.snapshot.logicalModels.get(name)?.members ?? [];
  }

  /** 档链策略(缺省 ``random`` —— 2026-10-26 用户 m15445 定案,镜像 repo.strategy_of 的 default 参数)。 */
  strategyOf(name: string): SchedulerStrategy {
    return this.snapshot.logicalModels.get(name)?.strategy ?? DEFAULT_SCHEDULER_STRATEGY;
  }

  /** 调度规则(已归一化 + priority 推导;数组顺序 = 配置顺序)。 */
  listSchedulerRules(): readonly SchedulerRule[] {
    return this.snapshot.schedulerRules;
  }

  /** 按 provider 过滤的调度规则(``cooldown`` 覆盖 / 免费档 / 时段规则等)。 */
  listSchedulerRulesFor(provider: string): SchedulerRule[] {
    return this.snapshot.schedulerRules.filter((r) => r.provider === provider);
  }

  // ---------------------------------------------------------------- 热重载

  /**
   * 从**已有快照**构造(数据库投影路径)。
   *
   * 桌面端用户裁定(m28134):数据库是唯一真源,JSON 退化为导入/导出。
   * 于是注册表不再从文件加载,而是由装配层把
   * ``snapshotFromDb(db)``(见 db/registry-projection.ts)的结果喂进来。
   *
   * ``filePath`` 只用于诊断信息(日志/``registry.path``),不再被读取。
   */
  static fromSnapshot(
    snapshot: RegistrySnapshot,
    options: { filePath?: string; issues?: readonly ConfigIssue[] } = {},
  ): ProviderRegistry {
    return new ProviderRegistry(options.filePath ?? "<db>", snapshot, options.issues ?? []);
  }

  /**
   * 原地换快照(数据库写入之后调用)。
   *
   * 与 {@link reload} 的区别:不读文件、不抛错 —— 快照由调用方负责正确性
   * (装配层刚从库里投影出来)。换完发射 ``reloaded``,让订阅者
   * (面板缓存 / 调度器)知道该失效。
   */
  refreshFromSnapshot(snapshot: RegistrySnapshot, issues: readonly ConfigIssue[] = []): void {
    this.snapshot = snapshot;
    this.configIssues = issues;
    this.emit({ type: "reloaded", issues });
  }

  /**
   * 手动重新加载(``fs.watch`` 热重载失败时也会走这条路)。
   *
   * 成功 → 原子换快照 + 返回 ``{ reloaded: true }``;
   * 失败 → **保留上次好快照** + 返回 ``{ reloaded: false }`` 并发射
   * ``error`` 事件(热重载铁律:坏文件不炸运行中的系统)。
   */
  async reload(): Promise<{ reloaded: boolean; issues: readonly ConfigIssue[] }> {
    try {
      const registry = await ProviderRegistry.load(this.filePath);
      this.snapshot = registry.snapshot;
      this.configIssues = registry.issues;
      this.emit({ type: "reloaded", issues: this.configIssues });
      return { reloaded: true, issues: this.configIssues };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const issue: ConfigIssue = { path: "$", message: `热重载失败,保留上次好快照:${error.message}` };
      this.emit({ type: "error", error, issues: [issue] });
      return { reloaded: false, issues: [issue] };
    }
  }

  /**
   * 启动 ``fs.watch`` 防抖热重载(默认 100ms 防抖,见 store.ts)。
   *
   * @returns 句柄,``close()`` 停止监听。
   */
  async watch(options: { debounceMs?: number } = {}): Promise<{ close(): void }> {
    if (this.watcher) return { close: () => this.watcher?.close() };
    const watcher = watchJsonFile(
      this.filePath,
      (text) => {
        void this.applyText(text);
      },
      (err) => {
        // watch 起不来(目录不可读等):保留旧快照,上报事件。
        this.emit({
          type: "error",
          error: err,
          issues: [{ path: "$", message: `文件监听失败:${err.message}` }],
        });
      },
      { debounceMs: options.debounceMs },
    );
    this.watcher = watcher;
    return {
      close: () => {
        watcher.close();
        if (this.watcher === watcher) this.watcher = null;
      },
    };
  }

  /** 订阅热重载事件(``reloaded`` / ``error``);返回退订函数。 */
  onChange(listener: (event: RegistryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 停止监听(幂等)。 */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.watcher?.close();
    this.watcher = null;
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- 内部

  /** 应用 watch 回调拿到的文件文本(解析 + 校验 + 原子换快照)。 */
  private async applyText(text: string): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      this.emit({
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
        issues: [{ path: "$", message: `热重载解析失败,保留上次好快照:${(err as Error).message}` }],
      });
      return;
    }
    try {
      const { snapshot, issues } = loadProviderConfig(raw);
      this.snapshot = snapshot;
      this.configIssues = issues;
      this.emit({ type: "reloaded", issues });
    } catch (err) {
      this.emit({
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
        issues: [{ path: "$", message: `热重载校验失败,保留上次好快照:${(err as Error).message}` }],
      });
    }
  }

  private emit(event: RegistryEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
