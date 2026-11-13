/**
 * 文件持久化 —— 原子写 / 读取 / ``fs.watch`` 防抖热重载。
 *
 * 设计目标
 * --------
 * 只依赖 ``node:fs`` / ``node:path``,不感知任何领域类型(纯 JSON 读写,
 * 上层 providers/credentials 决定文件内容)。所有函数接受**显式路径注入**
 * (阶段一测试用临时目录;阶段二生产路径由调用方给),不猜 cwd / 不读环境变量。
 *
 * 为什么原子写必须是「临时文件 + rename」
 * --------------------------------------
 * 直接 ``writeFileSync(path, …)`` 在写到一半时被杀进程(崩溃 / Ctrl+C /
 * 断电)会留下**半文件**——下次读直接 ``JSON.parse`` 炸,而且是在
 * 「凭据文件」这种关键路径上。正确姿势(Nexus 的 dsh-atomic-write 研究
 * 结论,docs/dsh-plugin-reference-research.md):
 *
 * 1. 序列化**先**在内存完成(``JSON.stringify`` 失败时还没碰过磁盘);
 * 2. 写同目录临时文件(``.as-one-tmp-<name>-*``),``fsync`` 落盘;
 * 3. ``rename`` 到目标路径(同卷 rename 在 POSIX 是原子的;Windows 上
 *    libuv 用 ``MoveFileEx(MOVEFILE_REPLACE_EXISTING)`` 会覆盖已有文件);
 * 4. **回读校验**(dsh-atomic-write 的教训:它的 ``set()`` 在 Windows
 *    文件锁下 rename **静默失败**却不报错 → 写完必须回读比对,不一致就抛);
 * 5. 失败时保留临时文件(供排查),但**下一轮写入前清理陈旧临时文件**
 *    (崩溃残留的 ``.as-one-tmp-*`` 永远不会被读,也不该堆着)。
 *
 * ⚠️ Windows 特例:``renameSync`` 在目标被占用(杀软 / 索引器持有句柄)
 * 时可能 ``EPERM`` / ``EBUSY``。本实现**重试若干次**(指数退避),
 * 仍失败则抛 ``StoreError`` —— 绝不静默。
 *
 * 热重载为什么 watch **父目录**而不是文件本身
 * -------------------------------------------
 * 编辑器保存分两种:原地覆盖(文件自身 ``change`` 事件)与原子替换
 * (inode 被 rename 换掉;Windows 上对**文件句柄**的 watch 会漏事件,
 * 因为原 inode 已经消失)。watch **父目录** + 按 basename 过滤两种都覆盖。
 * 防抖合并「保存过程中的多次事件」(编辑器常触发 2-3 次),只在
 * 内容**真的变了**时才回调(文本比对,避免无变化的热重载)。
 */

import { realpathSync, watch, type FSWatcher } from "node:fs";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

// ===========================================================================
// 错误类型
// ===========================================================================

/** 文件读写错误(携带路径,方便定位是哪份配置坏了)。 */
export class StoreError extends Error {
  /** 出错的文件路径。 */
  readonly path: string;
  /** 底层 errno 代码(``ENOENT`` / ``EPERM`` / ``EBUSY`` …),无则 ``null``。 */
  readonly code: string | null;
  /** 是否「文件不存在」(与语法/权限错误区分对待)。 */
  readonly missing: boolean;

  constructor(
    path: string,
    message: string,
    options?: { code?: string; cause?: unknown; missing?: boolean },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "StoreError";
    this.path = path;
    this.code = options?.code ?? null;
    this.missing = options?.missing ?? false;
  }
}

// ===========================================================================
// 最小 fs 操作面(可注入,测试用故障注入)
// ===========================================================================

/**
 * 本模块用到的 fs 操作最小集合。
 *
 * 默认实现就是 ``node:fs`` 本体;测试可以注入「rename 第 N 次失败」
 * 之类的假实现来模拟 Windows 文件锁 / 磁盘写失败,而生产代码零改动。
 */
export interface FsOps {
  writeFileSync(path: string, data: string): void;
  renameSync(from: string, to: string): void;
  /** 读文本;文件不存在返回 ``null``;其他错误抛原生异常。 */
  readFileSync(path: string): string | null;
  statSync(path: string): { mtimeMs: number; size: number } | null;
  readdirSync(dir: string): string[];
}

/** 生产用 ``FsOps``(``node:fs`` 同口径)。 */
export const nodeFs: FsOps = {
  writeFileSync: (p, d) => writeFileSync(p, d, "utf8"),
  renameSync,
  readFileSync: (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  },
  statSync: (p) => {
    try {
      return statSync(p);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  },
  readdirSync,
};

// ===========================================================================
// 读取
// ===========================================================================

/**
 * 读 JSON 文件。
 *
 * - 文件不存在 / 空文件 → ``{ ok: false, missing: true }``
 *   (原子写保证不会出现半文件,但外部工具可能造出空文件,读侧不炸);
 * - 语法错误 → ``{ ok: false, missing: false, error }``,``error`` 带
 *   ``JSON.parse`` 的具体位置信息,调用方决定报错还是回落旧值;
 * - 权限等错误 → 抛 {@link StoreError}(不吞 —— 调用方必须知道读不了)。
 */
export function readJsonFile(
  path: string,
  fs: FsOps = nodeFs,
): { ok: true; value: unknown } | { ok: false; missing: boolean; error: string } {
  let text: string | null;
  try {
    text = fs.readFileSync(path);
  } catch (err) {
    throw new StoreError(path, `读取失败:${(err as Error).message}`, {
      code: (err as NodeJS.ErrnoException).code,
      cause: err,
    });
  }
  if (text === null) return { ok: false, missing: true, error: "文件不存在" };
  if (text.trim() === "") return { ok: false, missing: true, error: "空文件按不存在处理" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, missing: false, error: (err as Error).message };
  }
}

// ===========================================================================
// 原子写
// ===========================================================================

/** 原子写选项。 */
export interface AtomicWriteOptions {
  /** 临时文件前缀(默认 ``.as-one-tmp-<basename>-``)。 */
  tmpPrefix?: string;
  /** rename 重试次数(默认 3 —— Windows 文件锁常见瞬时 EPERM)。 */
  renameRetries?: number;
  /** 每次重试的退避基数(毫秒,默认 20,指数退避)。 */
  retryBaseMs?: number;
  /** 写完是否回读校验(默认 ``true``;dsh-atomic-write 教训)。 */
  verify?: boolean;
  /** 注入的 fs 操作面(测试用故障注入)。 */
  fs?: FsOps;
}

/** 默认临时文件前缀(``.`` 开头 = 隐藏文件)。 */
const DEFAULT_TMP_PREFIX = ".as-one-tmp-";

/** rename 重试的同步 sleep(测试可注入空实现跳过真实等待)。 */
let sleepImpl: (ms: number) => void = (ms) => {
  if (ms <= 0) return;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // 忙等:退避总长 <150ms,不值得引入 Atomics.wait 的兼容问题。
  }
};

/** 注入 sleep 实现(测试用,默认忙等)。 */
export function setSleepForTests(fn: (ms: number) => void): void {
  sleepImpl = fn;
}

/**
 * 原子写 JSON:序列化 → 临时文件 → fsync → rename → 回读校验。
 *
 * 任何一步失败都抛 {@link StoreError}(带路径与 errno),**目标文件不会被
 * 写成半截**;临时文件保留(供人工排查),但下次写入前会被清理。
 *
 * ⚠️ 本函数**不做**目录递归创建 —— 调用方(配置层)保证目录存在,
 * 写一个不存在的目录时报错比静默建目录更符合预期。
 */
export function writeJsonFileAtomic(path: string, value: unknown, options: AtomicWriteOptions = {}): void {
  const fs = options.fs ?? nodeFs;
  const tmpPrefix = options.tmpPrefix ?? `${DEFAULT_TMP_PREFIX}${basename(path)}-`;
  const renameRetries = Math.max(1, options.renameRetries ?? 3);
  const retryBaseMs = Math.max(0, options.retryBaseMs ?? 20);
  const verify = options.verify ?? true;

  // ① 序列化先做:BigInt / 循环引用在碰磁盘之前就抛,目标文件纹丝不动。
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) + "\n";
  } catch (err) {
    throw new StoreError(path, `序列化失败(未写入磁盘):${(err as Error).message}`, { cause: err });
  }

  // ② 清理本文件的陈旧临时文件(上次崩溃残留的 ``.as-one-tmp-*`` 永远清掉)。
  cleanStaleTmpFiles(path, fs, tmpPrefix);

  const tmp = join(dirname(path), `${tmpPrefix}${process.pid}-${Math.random().toString(36).slice(2, 8)}`);

  // ③ 写临时文件并 fsync(把页缓存刷到磁盘,防「rename 成功但断电后文件空」)。
  try {
    fs.writeFileSync(tmp, text);
    fsyncFile(tmp);
  } catch (err) {
    tryRemove(tmp);
    throw new StoreError(path, `写临时文件失败:${(err as Error).message}`, {
      code: (err as NodeJS.ErrnoException).code,
      cause: err,
    });
  }

  // ④ rename 到目标路径,Windows 文件锁下重试。
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < renameRetries; attempt++) {
    try {
      fs.renameSync(tmp, path);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt + 1 < renameRetries) sleepImpl(retryBaseMs * 2 ** attempt);
    }
  }
  if (lastErr !== null) {
    tryRemove(tmp);
    throw new StoreError(
      path,
      `重命名失败(已重试 ${renameRetries} 次):${(lastErr as Error).message}`,
      { code: (lastErr as NodeJS.ErrnoException).code, cause: lastErr },
    );
  }

  // ⑤ 回读校验(dsh-atomic-write 的 set() 在 Windows 锁下**静默失败**,
  // 写完不回读就等于把「没写进去」当成成功)。
  if (verify) {
    const back = fs.readFileSync(path);
    if (back === null || back !== text) {
      throw new StoreError(path, "回读校验失败:写入后内容与期望不一致(磁盘/杀软拦截?)");
    }
  }
}

/** 清理 ``path`` 同目录下匹配 ``tmpPrefix`` 的陈旧临时文件(尽最大努力,不抛)。 */
function cleanStaleTmpFiles(path: string, fs: FsOps, tmpPrefix: string): void {
  try {
    const dir = dirname(path);
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(tmpPrefix)) tryRemove(join(dir, entry));
    }
  } catch {
    // 目录不存在 / 读不了:让后续 writeFileSync 去报错,而不是在这里静默建目录。
  }
}

/** 对已写好的文件做 fsync(失败仅记录 —— 最坏情况是断电后需人工介入)。 */
function fsyncFile(path: string): void {
  try {
    const fd = openSync(path, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // fsync 失败不阻断写入:Nexus 侧(dsh-atomic-write)同样把 fsync 当
    // 加固而非硬失败 —— 真丢了页缓存,回读校验也会兜住大部分场景。
  }
}

/** 尽力删除(文件不存在 / 被占用都吞掉 —— 清理不是关键路径)。 */
function tryRemove(path: string): void {
  try {
    rmSync(path, { force: true, maxRetries: 1 });
  } catch {
    // 忽略:残留的临时文件永远不会被读(读路径按完整文件名匹配)。
  }
}

// ===========================================================================
// 热重载:fs.watch 防抖
// ===========================================================================

/** 热重载选项。 */
export interface WatchOptions {
  /** 防抖窗口(毫秒,默认 100 —— 编辑器一次保存常触发 2-3 次事件)。 */
  debounceMs?: number;
  /** 内容比对:true 时内容没变也回调(默认 false —— 只在真的变了时回调)。 */
  emitUnchanged?: boolean;
  /** 读取失败(半文件 / 权限)时:``keep-last-good``(默认)或 ``emit-null``。 */
  onReadError?: "keep-last-good" | "emit-null";
  /** 目录无法 watch 时的行为:``noop``(默认,等文件出现)或 ``error``。 */
  onWatchError?: "noop" | "error";
}

/** watch 句柄(``close()`` 停止)。 */
export interface FileWatcher {
  /** 停止监听(幂等)。 */
  close(): void;
  /** 当前已知内容(最近一次成功读取的原始文本;未读过为 ``null``)。 */
  readonly lastKnown: string | null;
}

/**
 * 解析路径到**长形式**(Windows 8.3 短名 → 长名)。
 *
 * ⚠️ **为什么必须做**:Windows 上 ``fs.watch`` 对含 8.3 短名组件的路径
 * (如 ``C:\Users\ADMINI~1\...``)会**断言崩溃**
 * (``Assertion failed: !_wcsnicmp(filename, dir, dirlen),
 * src\win\fs-event.c``)—— 事件文件名按长形式解析,而 ``watch()`` 内部
 * 存的 dir 是短形式,前缀比对失败直接崩进程。``realpathSync.native``
 * 把短名解析成长名即可根治(实测:短名路径必崩,长名路径正常)。
 *
 * 解析不了(路径不存在等)→ 原样返回,由后续逻辑报错。
 */
function toLongPath(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}

/**
 * 监听单个 JSON 文件的变更(``fs.watch`` **父目录** + basename 过滤 +
 * 防抖 + 内容比对)。
 *
 * - 只在**内容真的变了**时回调 ``onChange(text)`` —— 编辑器保存过程中
 *   mtime 抖动、touch、无变化写入都不会触发无意义热重载;
 * - 目标文件**不存在**时(首次创建前)也照常 watch 父目录 —— 文件出现
 *   的瞬间会触发一次读取回调;
 * - 读取失败(半文件 / 权限)默认**保留上次好内容**并静默 —— 热重载的
 *   铁律是「坏文件不炸运行中的系统」(Nexus 配置缓存同哲学,
 *   engine.py L1641-1713:坏 JSON 回落默认,绝不抛)。
 *
 * @param onChange 回调拿到**完整文件文本**(调用方自己 ``JSON.parse``,
 *   这样 store 层不需要知道 schema;解析错误在 readJsonFile 里)。
 * @param onError 非致命错误(目录不可读 / watch 起不来)—— 不抛,只上报。
 */
export function watchJsonFile(
  path: string,
  onChange: (text: string) => void,
  onError?: (err: StoreError) => void,
  options: WatchOptions = {},
): FileWatcher {
  const debounceMs = Math.max(0, options.debounceMs ?? 100);
  // ⚠️ 先解析长路径名再 watch —— 短名路径会让 fs.watch 断言崩溃
  // (见 toLongPath 注释)。
  const dir = toLongPath(dirname(path));
  const file = basename(path);
  let lastKnown: string | null = null;
  let closed = false;
  let timer: NodeJS.Timeout | null = null;

  /** 防抖触发:到点才读盘 + 比对内容。 */
  const schedule = (): void => {
    if (closed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (closed) return;
      fire();
    }, debounceMs);
  };

  const fire = (): void => {
    let text: string | null;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      // 读失败(半文件 / 权限 / 竞态删除):按 onReadError 处理。
      if (options.onReadError === "emit-null" && lastKnown !== null) {
        lastKnown = null;
        onChange("" /* 空串 = 解析必然失败,交给调用方 */);
      }
      // keep-last-good(默认):什么都不做,等下一次变更。
      return;
    }
    if (!options.emitUnchanged && text === lastKnown) return;
    lastKnown = text;
    onChange(text);
  };

  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(dir, (_eventType, filename) => {
      if (closed) return;
      // filename 可能是 null(某些平台),保守起见不跳过这次检查。
      if (filename !== null && filename !== file) return;
      schedule();
    });
  } catch (err) {
    const storeErr = new StoreError(path, `无法监听目录:${(err as Error).message}`, {
      code: (err as NodeJS.ErrnoException).code,
      cause: err,
    });
    if (options.onWatchError === "error") onError?.(storeErr);
    // noop 模式:返回 lastKnown=null 的空 watcher。
    return {
      close: () => {
        closed = true;
      },
      get lastKnown() {
        return null;
      },
    };
  }

  // 初始读一次,把当前内容记为**基线**:这样「内容没变」的重复事件
  // (编辑器 touch / 无变化保存)会被抑制,而文件首次出现
  // (lastKnown 仍为 null)仍会触发。文件还不存在 → 保持 null 等它出现。
  try {
    lastKnown = readFileSync(path, "utf8");
  } catch {
    // 文件不存在 / 读不了:保持 null。
  }

  return {
    close: () => {
      if (closed) return;
      closed = true;
      if (timer !== null) clearTimeout(timer);
      watcher?.close();
      watcher = null;
    },
    get lastKnown() {
      return lastKnown;
    },
  };
}
