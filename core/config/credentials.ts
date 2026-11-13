/**
 * 凭据库 —— 读 / 写 / 列举 / 轮换,后端可注入。
 *
 * 设计目标
 * --------
 * 凭据是**唯一允许持有明文密钥**的层:对外只暴露 {@link CredentialSummary}
 * (无密钥)与 {@link CredentialVault.secret} 这一个明文出口
 * (镜像 nexus/db/repo.py L716-721 ``credential_secret`` 的
 * 「唯一明文出口」纪律)。
 *
 * **后端可注入**是硬要求(阶段一 = 本地文件,阶段二 = DSH ``ctx.credentials``):
 * - ``MemoryCredentialBackend`` —— 测试用;
 * - ``FileCredentialBackend`` —— 阶段一,JSON 文件 + ``fs.watch`` 热重载;
 * - 阶段二的 ``DshCredentialBackend``(本文件末尾有接口 sketch)——
 *   真实上游令牌**永不出进程**(docs/dsh-plugin-reference-research.md),
 *   由宿主 ``ctx.credentials`` 按 ``credentialRef`` 逐次解析。
 *
 * 热轮换语义(重要,与 Nexus 对齐)
 * ------------------------------
 * ⚠️ **Nexus 没有「旧值宽限期」机制**:``save_tokens``
 * (nexus/credentials.py L260-327)是**立即写透**——刷新成功就覆盖
 * ``secret`` 列,下次读到新值;在途请求手里攥着的是**旧令牌的字符串副本**,
 * 自然用到它失效为止。这就是事实上的「宽限」:旧值的可存活范围 =
 * 已发出请求的闭包生命周期,而不是存储层维护的一个时间窗。
 *
 * 因此本层 ``rotate()`` 也**不维护**旧值宽限窗(Nexus 没有,不臆造)。
 * 阶段二 DSH 若引入宿主侧轮换语义(如 ``ctx.credentials`` 的
 * hot-rotation 事件),再在此扩展 —— 见文件末尾的 DSH sketch。
 *
 * 与 Nexus 的字段/行为对应
 * ------------------------
 * - 写入:``upsert_credential``(repo.py L657-688)+ ``save_tokens``
 *   (credentials.py L260-327)——空用户名兜底成 provider 名(L675);
 *   ``refresh_token`` 只在拿到新值时覆盖(L267-268);raw 里的到期字段
 *   与列一起更新(L293-298)。
 * - 读取:``credentials()``(L696-704,ORDER BY username / provider,username,
 *   不含 secret/refresh_secret)、``credential_secret()``(L716-721)、
 *   ``secrets_for()``(L723-730)。
 * - 到期:``expires_epoch_seconds()``(credentials.py L148-182)——
 *   **列优先**于 raw_json、``>= 1e11`` 判毫秒、raw 回退键
 *   ``token_expires_at_ms`` → ``expires_at``。
 * - 刷新判断:``needs_refresh()``(credentials.py L185-199)——无 refresh
 *   token 不刷;到期未知**要刷**;``margin_s`` 缺省 300 秒。
 * - 指纹:``fingerprint()``(credentials.py L228-238)——SHA-256 前 8 位。
 */

import { createHash } from "node:crypto";

import type {
  Credential,
  CredentialId,
  CredentialInput,
  CredentialSummary,
  WallClock,
} from "./types.js";
import { normalizeExpiresSeconds, systemWallClock } from "./types.js";
import { readJsonFile, watchJsonFile, writeJsonFileAtomic, StoreError } from "./store.js";

// ===========================================================================
// 错误
// ===========================================================================

/** 凭据层错误基类(带稳定 ``code``,方便调用方按类型处理)。 */
export class CredentialError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CredentialError";
    this.code = code;
  }
}

/** 凭据文件损坏 / 字段非法(初始加载或校验失败)。 */
export class CredentialConfigError extends CredentialError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("credential-config", message, options);
    this.name = "CredentialConfigError";
  }
}

/** 对只读后端(阶段二 DSH 宿主管理)执行写操作。 */
export class UnsupportedBackendOperation extends CredentialError {
  constructor(operation: string) {
    super("unsupported-backend-operation", `后端不支持写操作:${operation}(凭据由宿主管理)`);
    this.name = "UnsupportedBackendOperation";
  }
}

// ===========================================================================
// 持久化形态(文件后端用)
// ===========================================================================

/**
 * 文件里的凭据行 —— **snake_case 逐字镜像** ``credential`` 表列
 * (schema.sql L117-128),便于与 Nexus DB 导出对表:
 *
 * | 文件键           | 表列            |
 * |------------------|-----------------|
 * | provider         | provider        |
 * | username         | username        |
 * | secret           | secret          |
 * | refresh_secret   | refresh_secret  |
 * | expires_at       | expires_at(秒!) |
 * | raw_json         | raw_json        |
 */
export interface StoredCredential {
  provider: string;
  username: string;
  secret: string | null;
  refresh_secret: string | null;
  /** epoch **秒**(schema.sql L125 的明确警告)。 */
  expires_at: number | null;
  /** 附加载荷(region/uid/label/device_id/JWT…);``null`` / 缺省 = 无。 */
  raw_json?: unknown;
}

/** 凭据文件文档形态。 */
export interface CredentialsFile {
  version: 1;
  credentials: StoredCredential[];
}

// ===========================================================================
// 后端接口(阶段一 / 阶段二共用)
// ===========================================================================

/** 凭据变更事件(批量发射,监听方自行去重)。 */
export interface CredentialEvent {
  /** ``put`` / ``rotate`` / ``remove`` = 本进程写;``external`` = 外部改文件/宿主推送。 */
  type: "put" | "rotate" | "remove" | "external";
  provider: string;
  username: string;
}

/**
 * 凭据后端接口 —— 阶段一(文件)/ 阶段二(DSH)可替换的唯一接缝。
 *
 * ⚠️ 约定:
 * - ``list`` / ``get`` 返回**含密钥**的完整记录 —— 后端是密钥的唯一持有者,
 *   本接口只在**进程内**被 vault 调用;vault 对外只给 summary。
 * - ``writable: false`` 的后端(DSH 宿主管理)必须让 ``put`` / ``remove``
 *   抛 {@link UnsupportedBackendOperation} —— vault 会先检查再调。
 * - ``onChange`` 可选:文件后端用 ``fs.watch`` 推「外部改了文件」;
 *   内存后端在写时自己推。阶段二 DSH 后端应转发宿主的轮换事件。
 */
export interface CredentialBackend {
  /** 后端标识(``"memory"`` / ``"file"`` / ``"dsh"`` …,日志用)。 */
  readonly name: string;
  /** 是否允许本进程写(DSH 宿主管理时为 ``false``)。 */
  readonly writable: boolean;
  /** 全部凭据行(含密钥)。 */
  list(): Promise<StoredCredential[]>;
  get(provider: string, username: string): Promise<StoredCredential | null>;
  put(record: StoredCredential): Promise<void>;
  remove(provider: string, username: string): Promise<boolean>;
  /** 外部变更通知(可选);返回退订函数。 */
  onChange?(listener: (events: CredentialEvent[]) => void): () => void;
}

// ===========================================================================
// 纯函数工具(与 Nexus 一一对应)
// ===========================================================================

/** 主键字符串 ``"<provider>/<username>"``(repo.py L186 ``credential_key``)。 */
export function credentialKey(provider: string, username: string): CredentialId {
  return `${provider}/${username}`;
}

/**
 * 令牌到期时刻(epoch 秒),``null`` = 未知。
 *
 * 镜像 nexus/credentials.py L148-182 ``expires_epoch_seconds``:
 * **列优先**于 raw_json(反过来会在刷新后给出错误答案 —— 刷新把新到期
 * 写进列,raw 里还留着旧值,L152-157 实测踩过);``>= 1e11`` 判毫秒;
 * raw 回退键顺序 ``token_expires_at_ms`` → ``expires_at``;字符串数字也认。
 */
export function expiresAtOf(cred: {
  expiresAt: number | null;
  raw: Record<string, unknown>;
}): number | null {
  const fromColumn = normalizeExpiresSeconds(cred.expiresAt);
  if (fromColumn !== null) return fromColumn;
  for (const key of ["token_expires_at_ms", "expires_at"]) {
    const value = normalizeExpiresSeconds(cred.raw[key]);
    if (value !== null) return value;
  }
  return null;
}

/**
 * 是否该刷新令牌(镜像 credentials.py L185-199 ``needs_refresh``):
 *
 * - 没有 refresh token → ``false``(没得刷);
 * - 到期未知 → ``true``(刷新是幂等写操作,「误刷」最多多打一次上游,
 *   而「该刷没刷」会让账号直接失效);
 * - 否则 ``expires - marginSeconds <= now``。
 */
export function needsRefresh(
  cred: Credential,
  options: { marginSeconds?: number; now?: number } = {},
): boolean {
  if (!cred.refreshSecret) return false;
  const expires = expiresAtOf(cred);
  if (expires === null) return true;
  const now = options.now ?? systemWallClock();
  return expires - (options.marginSeconds ?? 300) <= now;
}

/**
 * 令牌指纹(SHA-256 前 8 位十六进制)—— 镜像 credentials.py L228-238。
 *
 * 用于「池子里那几条是不是同一条 / 是不是我刚换的那条」这类判断;
 * **不是密钥本体**,但也别全量返回(明文进日志 = 进历史记录)。
 */
export function fingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}

/**
 * raw_json 安全解析(镜像 credentials.py L58-68:坏 JSON → 空对象,不炸)。
 *
 * ⚠️ **`raw_json` 在文件里是 JSON **字符串**,不是对象** —— Nexus 的
 * `credentials.py:_load_json` 走的是 `json.loads(raw)`,而 As One 的凭据文件
 * 落盘形态同样是 `"raw_json": "{\"console_jwt\": \"…\"}"`。
 *
 * ⚠️ 以前这里只接受**对象**,于是文件里那串字符串一律被当成「不是对象」→
 * 返回 `{}` → `cred.raw.console_jwt` 永远读不到。症状:SenseNova 刷新恒报
 * 「没有控制台令牌 —— 请在下方『登录并抓 key』」(而令牌**确实在文件里**),
 * 同时 trae / workbuddy 账号行的 uid / region 全是空的。
 *
 * 现在两种形态都吃:
 * - **字符串** → `JSON.parse`;坏了(半截 JSON / 非对象)→ `{}`,不炸整份文件
 *   —— `raw_json` 是**附加**字段,坏了只该让「少一个 device_id」而不是让
 *   签到 / 刷新整个不可用;
 * - **对象** → 原样(内存后端与已解析的行);
 * - 其他(null / 数字 / 数组)→ `{}`。
 */
function parseRaw(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "") return {};
    try {
      const parsed = JSON.parse(text) as unknown;
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      // 坏 JSON → 空对象(不炸整份文件)。
      return {};
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

/** StoredCredential → 领域 Credential(camelCase + 归一化 raw)。 */
function toCredential(row: StoredCredential): Credential {
  return {
    provider: row.provider,
    username: row.username,
    secret: row.secret,
    refreshSecret: row.refresh_secret,
    expiresAt: row.expires_at,
    raw: parseRaw(row.raw_json),
  };
}

/** Credential → 文件行(snake_case)。 */
function toStored(cred: Credential): StoredCredential {
  return {
    provider: cred.provider,
    username: cred.username,
    secret: cred.secret,
    refresh_secret: cred.refreshSecret,
    expires_at: cred.expiresAt,
    // ⚠️ `raw_json` 落盘成 **JSON 字符串**,与 Nexus 的 DB 列语义一致
    // (`credentials.py` 那一列就是 TEXT,读侧 `json.loads`)。以前这里直接写对象,
    // 于是同一个文件里两种形态并存 —— 读侧只认一种,于是另一种的数据「静默丢失」。
    // 现在写读都用「JSON 字符串」这一种,`parseRaw` 两种都吃(兼容旧文件)。
    raw_json: JSON.stringify(cred.raw ?? {}),
  };
}

// ===========================================================================
// 内存后端(测试用)
// ===========================================================================

/**
 * 内存凭据后端 —— 测试与默认 fallback 用。
 *
 * ⚠️ 事件分工:**写事件由 vault 发射**(vault 知道 put/rotate/remove 的
 * 语义),本后端只在**外部变更**时发射 —— 内存后端没有外部变更源,
 * 所以 ``onChange`` 实际不会触发(保留以符合 {@link CredentialBackend}
 * 接口,测试可注入自定义后端验证事件链)。
 */
export class MemoryCredentialBackend implements CredentialBackend {
  readonly name = "memory";
  readonly writable = true;
  private readonly rows = new Map<string, StoredCredential>();
  private readonly listeners = new Set<(events: CredentialEvent[]) => void>();

  constructor(initial: readonly StoredCredential[] = []) {
    for (const row of initial) this.rows.set(credentialKey(row.provider, row.username), row);
  }

  onChange(listener: (events: CredentialEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async list(): Promise<StoredCredential[]> {
    return [...this.rows.values()];
  }

  async get(provider: string, username: string): Promise<StoredCredential | null> {
    return this.rows.get(credentialKey(provider, username)) ?? null;
  }

  async put(record: StoredCredential): Promise<void> {
    this.rows.set(credentialKey(record.provider, record.username), record);
  }

  async remove(provider: string, username: string): Promise<boolean> {
    return this.rows.delete(credentialKey(provider, username));
  }
}

// ===========================================================================
// 文件后端(阶段一)
// ===========================================================================

/**
 * 文件凭据后端 —— JSON 文件 + ``fs.watch`` 热重载(跨进程热轮换)。
 *
 * 文件格式({@link CredentialsFile}):
 * ``{"version": 1, "credentials": [{provider, username, secret,
 * refresh_secret, expires_at, raw_json}, …]}``
 *
 * 行为:
 * - **初始加载**:文件不存在 → 空库;语法错误 → 抛
 *   {@link CredentialConfigError}(凭据文件坏了必须出声,不能静默空库);
 * - **外部热重载**:``fs.watch`` 到文件内容变化 → 重新加载 → **diff**
 *   出新增/变更/删除的键,发射 ``external`` 事件(本进程自己写入后也会
 *   触发 watch,但 diff 为空 → 不发射,不会和 vault 自己的事件重复);
 * - **写**:``writeJsonFileAtomic``(临时文件 + rename + 回读校验);
 *   写事件由 vault 发射,本后端不重复发射。
 */
export class FileCredentialBackend implements CredentialBackend {
  readonly name = "file";
  readonly writable = true;
  private rows = new Map<string, StoredCredential>();
  private readonly listeners = new Set<(events: CredentialEvent[]) => void>();
  private loaded: Promise<void> | null = null;
  private unsubscribeWatch: (() => void) | null = null;
  private closed = false;

  constructor(private readonly filePath: string) {}

  /** 路径注入点:文件路径由调用方给(测试 = 临时目录)。 */
  get path(): string {
    return this.filePath;
  }

  onChange(listener: (events: CredentialEvent[]) => void): () => void {
    this.listeners.add(listener);
    // 订阅变更 = 要求热重载生效 → 立即启动加载与 watch(幂等)。
    // 不这么做的话,「先订阅、后改文件」的窗口里 watch 还没起来,
    // 外部编辑会静默丢失。
    void this.ensureLoaded();
    return () => this.listeners.delete(listener);
  }

  /** 停止 watch(进程退出 / 测试清理用)。 */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeWatch?.();
    this.unsubscribeWatch = null;
  }

  async list(): Promise<StoredCredential[]> {
    await this.ensureLoaded();
    return [...this.rows.values()];
  }

  async get(provider: string, username: string): Promise<StoredCredential | null> {
    await this.ensureLoaded();
    return this.rows.get(credentialKey(provider, username)) ?? null;
  }

  async put(record: StoredCredential): Promise<void> {
    await this.ensureLoaded();
    this.rows.set(credentialKey(record.provider, record.username), record);
    this.persist();
  }

  async remove(provider: string, username: string): Promise<boolean> {
    await this.ensureLoaded();
    const existed = this.rows.delete(credentialKey(provider, username));
    if (existed) this.persist();
    return existed;
  }

  // ---------------------------------------------------------------- 内部

  private ensureLoaded(): Promise<void> {
    if (!this.loaded) this.loaded = this.doLoad();
    return this.loaded;
  }

  private async doLoad(): Promise<void> {
    const result = readJsonFile(this.filePath);
    if (!result.ok) {
      if (result.missing) {
        this.rows = new Map();
        this.startWatch();
        return;
      }
      throw new CredentialConfigError(`凭据文件无法解析:${result.error}`, { cause: result.error });
    }
    const doc = result.value as Partial<CredentialsFile>;
    const rows = Array.isArray(doc.credentials) ? doc.credentials : [];
    const next = new Map<string, StoredCredential>();
    for (const row of rows) {
      if (!isStoredCredential(row)) {
        // 单条坏行跳过 + 出声(与 Nexus「坏条目跳过」哲学一致,但这里
        // 通过 console 警告而非 logger —— 本层不引入日志框架)。
        console.warn("[config/credentials] 跳过非法凭据行:", row);
        continue;
      }
      next.set(credentialKey(row.provider, row.username), row);
    }
    this.rows = next;
    this.startWatch();
  }

  /** 原子写整个文件(临时文件 + rename + 回读校验,见 store.ts)。 */
  private persist(): void {
    const doc: CredentialsFile = {
      version: 1,
      credentials: [...this.rows.values()],
    };
    writeJsonFileAtomic(this.filePath, doc);
  }

  /** 启动 ``fs.watch``:外部改文件 → 重载 + diff 发射 ``external`` 事件。 */
  private startWatch(): void {
    if (this.unsubscribeWatch || this.closed) return;
    const watcher = watchJsonFile(
      this.filePath,
      (text) => {
        void this.reloadFromText(text);
      },
      () => {
        // watch 起不来(目录不可读等):静默 —— 文件仍在,只是没有热重载。
      },
    );
    this.unsubscribeWatch = () => watcher.close();
  }

  /** 从文件文本重载并 diff(与内存里现有行比对,只发射真变化)。 */
  private async reloadFromText(text: string): Promise<void> {
    let doc: Partial<CredentialsFile>;
    try {
      doc = JSON.parse(text) as Partial<CredentialsFile>;
    } catch {
      return; // 半文件 / 坏 JSON:保留旧值,等下一次变更(热重载铁律)。
    }
    const rows = Array.isArray(doc.credentials) ? doc.credentials : [];
    const next = new Map<string, StoredCredential>();
    for (const row of rows) {
      if (!isStoredCredential(row)) continue;
      next.set(credentialKey(row.provider, row.username), row);
    }
    const events: CredentialEvent[] = [];
    for (const [key, row] of next) {
      const prev = this.rows.get(key);
      if (!prev || !sameStored(prev, row)) {
        events.push({ type: "external", provider: row.provider, username: row.username });
      }
    }
    for (const key of this.rows.keys()) {
      if (!next.has(key)) {
        const prev = this.rows.get(key)!;
        events.push({ type: "external", provider: prev.provider, username: prev.username });
      }
    }
    this.rows = next;
    if (events.length > 0) this.emit(events);
  }

  private emit(events: CredentialEvent[]): void {
    for (const listener of [...this.listeners]) listener(events);
  }
}

/** StoredCredential 形状校验(读侧宽容:坏行跳过,不炸整份文件)。 */
function isStoredCredential(value: unknown): value is StoredCredential {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.provider === "string" && row.provider !== "" &&
    typeof row.username === "string" &&
    (row.secret === null || row.secret === undefined || typeof row.secret === "string") &&
    (row.refresh_secret === null || row.refresh_secret === undefined ||
      typeof row.refresh_secret === "string") &&
    (row.expires_at === null || row.expires_at === undefined ||
      (typeof row.expires_at === "number" && Number.isFinite(row.expires_at)))
  );
}

/** 两行是否实质相同(用于 watch diff;``raw_json`` 深度比对)。 */
function sameStored(a: StoredCredential, b: StoredCredential): boolean {
  return (
    a.provider === b.provider &&
    a.username === b.username &&
    a.secret === b.secret &&
    a.refresh_secret === b.refresh_secret &&
    a.expires_at === b.expires_at &&
    JSON.stringify(a.raw_json ?? null) === JSON.stringify(b.raw_json ?? null)
  );
}

// ===========================================================================
// CredentialVault —— 对外门面
// ===========================================================================

/**
 * 凭据库门面 —— 唯一的密钥持有者与唯一明文出口。
 *
 * 线程模型:本层**不做**跨线程锁(单进程 Electron / DSH 宿主内单线程
 * JS);并发写由调用方串行化(面板保存、刷新任务各自单飞)。
 */
export class CredentialVault {
  private readonly listeners = new Set<(events: CredentialEvent[]) => void>();
  private readonly clock: WallClock;
  private unsubscribeBackend: (() => void) | null = null;

  constructor(
    private readonly backend: CredentialBackend,
    options: { clock?: WallClock } = {},
  ) {
    this.clock = options.clock ?? systemWallClock;
    if (backend.onChange) {
      this.unsubscribeBackend = backend.onChange((events) => this.emit(events));
    }
  }

  /** 后端标识(``memory`` / ``file`` / ``dsh`` …)。 */
  get backendName(): string {
    return this.backend.name;
  }

  // ---------------------------------------------------------------- 读

  /** 完整凭据记录(含密钥)—— **仅进程内**使用,绝不进日志 / 响应。 */
  async get(provider: string, username: string): Promise<Credential | null> {
    const row = await this.backend.get(provider, username);
    return row ? toCredential(row) : null;
  }

  /** 凭据摘要(**不含密钥**;面板 / 日志 / 健康快照唯一出口)。 */
  async describe(provider: string, username: string): Promise<CredentialSummary | null> {
    const cred = await this.get(provider, username);
    return cred ? toSummary(cred) : null;
  }

  /**
   * 凭据清单(**不含密钥**),按 ``(provider, username)`` 排序 ——
   * 镜像 repo.py L696-704 ``credentials()`` 的 ``ORDER BY provider, username``。
   */
  async list(provider?: string): Promise<CredentialSummary[]> {
    const rows = await this.backend.list();
    return rows
      .map(toCredential)
      .filter((cred) => (provider === undefined ? true : cred.provider === provider))
      .sort((a, b) => (a.provider === b.provider ? 0 : a.provider < b.provider ? -1 : 1) ||
        (a.username < b.username ? -1 : a.username > b.username ? 1 : 0))
      .map(toSummary);
  }

  /**
   * **唯一明文出口** —— 取某条凭据的 secret(镜像 repo.py L716-721
   * ``credential_secret``)。调用方必须自己拿去做 HTTP 头,
   * 且**永不**把它写进日志 / 响应 / 错误消息。
   */
  async secret(provider: string, username: string): Promise<string | null> {
    const row = await this.backend.get(provider, username);
    return row?.secret ?? null;
  }

  /**
   * 某 provider 全部凭据的 ``{username: secret}``(镜像 repo.py L723-730
   * ``secrets_for``,面板探测 / 连接器用)。
   *
   * ⚠️ 与 Nexus 的**有意偏差**:Nexus 的 ``str(r["secret"])`` 会把
   * NULL 变成字符串 ``"None"``(Python 语义);TS 侧**跳过** secret 为
   * null 的行 —— 探测结果里出现 "None" 字符串是明确的 bug 特征。
   */
  async secretsFor(provider: string): Promise<Map<string, string>> {
    const rows = await this.backend.list();
    const out = new Map<string, string>();
    for (const row of rows) {
      if (row.provider === provider && row.secret !== null) {
        out.set(row.username, row.secret);
      }
    }
    return out;
  }

  /** 令牌到期时刻(epoch 秒,``null`` = 未知)—— 委托 {@link expiresAtOf}。 */
  async expiresAt(provider: string, username: string): Promise<number | null> {
    const cred = await this.get(provider, username);
    return cred ? expiresAtOf(cred) : null;
  }

  /** 是否该刷新(见 {@link needsRefresh};可注入 ``now`` 便于测试)。 */
  async shouldRefresh(
    provider: string,
    username: string,
    options: { marginSeconds?: number } = {},
  ): Promise<boolean> {
    const cred = await this.get(provider, username);
    if (!cred) return false;
    return needsRefresh(cred, { ...options, now: this.clock() });
  }

  // ---------------------------------------------------------------- 写

  /**
   * 登记 / 覆盖一条凭据(镜像 ``upsert_credential`` + ``save_tokens``):
   *
   * - ``provider`` 必填非空(空 provider 无法兜底 username);
   * - ``username`` 空 → 兜底成 provider 名(repo.py L675);
   * - 每个字段:**给了(非 undefined)就覆盖**,``null`` 显式清空,
   *   ``undefined`` 保留原值 —— 与 save_tokens「refresh_token 只在拿到
   *   新值时覆盖」(L267-268)同哲学;
   * - ``expiresAt`` 单位是**秒**(写入前不替调用方猜单位)。
   */
  async put(input: CredentialInput): Promise<Credential> {
    this.assertWritable("put");
    const provider = requireNonEmpty(input.provider, "provider");
    const username = (input.username ?? "").trim() || provider;
    // ⚠️ backend 返回的是 StoredCredential(snake_case 行形态),先转成
    // 领域 Credential(camelCase)再取字段 —— 直接读 camelCase 会全部
    // 拿到 undefined(行形态的 refresh_secret/expires_at/raw_json 对不上)。
    const existingRow = await this.backend.get(provider, username);
    const existing = existingRow ? toCredential(existingRow) : null;
    const merged: Credential = {
      provider,
      username,
      secret: input.secret !== undefined ? input.secret : (existing?.secret ?? null),
      refreshSecret:
        input.refreshSecret !== undefined ? input.refreshSecret : (existing?.refreshSecret ?? null),
      expiresAt: input.expiresAt !== undefined ? input.expiresAt : (existing?.expiresAt ?? null),
      raw: input.raw != null ? input.raw : (existing?.raw ?? {}),
    };
    await this.backend.put(toStored(merged));
    this.emit([{ type: "put", provider, username }]);
    return merged;
  }

  /**
   * 热轮换 —— 刷新结果写回(镜像 ``save_tokens``,credentials.py L260-327):
   *
   * - ``secret`` 立即覆盖(Nexus 无宽限期,见文件头「热轮换语义」);
   * - ``refreshSecret`` **只在拿到新值时覆盖**(上游可能不轮换,L267-268);
   * - ``expiresAt`` 给了就覆盖,并把 ``raw_json`` 里的到期字段
   *   (``token_expires_at_ms`` / ``expires_at``,若存在)同步成**毫秒**
   *   (L293-298 —— 否则库里两处并存且不一致,下次直接读 raw 的代码会拿到
   *   过期数据);
   * - 发射 ``rotate`` 事件(在途请求手里仍是旧令牌字符串副本,用到失效为止)。
   */
  async rotate(
    provider: string,
    username: string,
    update: { secret?: string | null; refreshSecret?: string | null; expiresAt?: number | null },
  ): Promise<Credential> {
    this.assertWritable("rotate");
    const existing = await this.get(provider, username);
    if (!existing) {
      throw new CredentialConfigError(`轮换失败:凭据不存在 ${credentialKey(provider, username)}`);
    }
    const next: Credential = {
      ...existing,
      secret: update.secret !== undefined ? update.secret : existing.secret,
      refreshSecret:
        update.refreshSecret !== undefined ? update.refreshSecret : existing.refreshSecret,
      expiresAt: update.expiresAt !== undefined ? update.expiresAt : existing.expiresAt,
    };
    if (update.expiresAt !== undefined) {
      // 同步 raw 里的到期字段(credentials.py L293-298):毫秒口径。
      const stamp = update.expiresAt === null ? null : Math.trunc(update.expiresAt * 1000);
      const raw = { ...next.raw };
      let touched = false;
      for (const key of ["token_expires_at_ms", "expires_at"]) {
        if (key in raw) {
          raw[key] = stamp;
          touched = true;
        }
      }
      if (touched) next.raw = raw;
    }
    await this.backend.put(toStored(next));
    this.emit([{ type: "rotate", provider, username }]);
    return next;
  }

  /** 删除一条凭据(镜像 repo.py L732-736 ``delete_credential``)。 */
  async remove(provider: string, username: string): Promise<boolean> {
    this.assertWritable("remove");
    const existed = await this.backend.remove(provider, username);
    if (existed) this.emit([{ type: "remove", provider, username }]);
    return existed;
  }

  // ---------------------------------------------------------------- 事件 / 生命周期

  /** 订阅变更(本进程写 + 后端推送);返回退订函数。 */
  onChange(listener: (events: CredentialEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 停止后端 watch(幂等)。 */
  close(): void {
    if (this.backend instanceof FileCredentialBackend) this.backend.close();
    this.unsubscribeBackend?.();
    this.unsubscribeBackend = null;
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- 内部

  private assertWritable(operation: string): void {
    if (!this.backend.writable) throw new UnsupportedBackendOperation(operation);
  }

  private emit(events: CredentialEvent[]): void {
    for (const listener of [...this.listeners]) listener(events);
  }
}

/** Credential → CredentialSummary(摘掉密钥,镜像 repo.py L707-714)。 */
function toSummary(cred: Credential): CredentialSummary {
  return {
    provider: cred.provider,
    username: cred.username,
    key: credentialKey(cred.provider, cred.username),
    expiresAt: cred.expiresAt,
    raw: cred.raw,
  };
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new CredentialConfigError(`凭据字段 ${field} 必须是非空字符串`);
  }
  return value;
}

// ===========================================================================
// 阶段二 DSH 后端 sketch(TODO,不在本阶段实现)
// ===========================================================================
//
// 目标:真实上游令牌**永不出进程**(docs/dsh-plugin-reference-research.md),
// 由宿主 ``ctx.credentials`` 按 ``credentialRef`` 逐次解析。接口形状
// (以 dsh-plugin-reference-research.md 的调研为准):
//
//   interface DshCredentialsHost {
//     resolve(ref: credentialRef): Promise<{ token: string; expiresAt: number | null }>;
//     // 可选:热轮换事件(宿主换 token 后通知,免重启)
//     onRotate?(ref: credentialRef, listener: () => void): () => void;
//   }
//
// ``DshCredentialBackend`` 实现要点:
// - ``name = "dsh"``、``writable = false``(写操作抛 UnsupportedBackendOperation);
// - ``get(provider, username)`` → 用 ``credentialRef = "${provider}/${username}"``
//   向宿主解析;``secret`` 来自宿主,``refreshSecret`` / ``expiresAt`` 按宿主
//   返回填充(宿主不给就 null —— vault 的 expiresAtOf 会回退 raw);
// - ``onChange`` 转发宿主的 ``onRotate`` → ``external`` 事件;
// - **绝不**把解析到的 token 写进任何文件 / 日志 —— 这是与文件后端
//   的本质区别,也是注入后端接口存在的理由。
//
// TODO(阶段二):拿到 ``ctx.credentials`` 的真实类型签名后补实现;当前接口
// (``CredentialBackend``)已按可注入设计,阶段二只需新增一个实现类。
