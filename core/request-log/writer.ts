/**
 * 逐请求明细的 JSONL 写入器 + 正文裁剪纯函数 —— 对齐 Nexus repo.py:
 * `_RequestLogWriter`(L350-445)/`_skeleton`(L448-481)/`_payload_chars`(L484-492)/
 * `_trim`(L315-324)/`_edges`(L327-343)/`day_key`(L214-216)/`_int`/`_float`(L249-268)。
 *
 * 语义(D20):逐请求明细**不入库**,按天写 `logs/requests-YYYYMMDD.jsonl`;
 * 库里只有 `stats_daily` 聚合(见 ../db/database.ts `statsDaily`)。句柄按天缓存
 * 复用、`write()` 立即落盘;`configure()` 重定向先关旧句柄;`prune()` 删到期文件。
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// 常量(repo.py L75/L78/L113)
// ---------------------------------------------------------------------------

/** `full` 档超长正文裁剪上限(repo.py `_MAX_PAYLOAD_BYTES`)。
 * 只影响裁剪阈值,不设内存上限 —— 命中 64MB 请求体读取上限时按整体裁剪。 */
export const MAX_PAYLOAD_BYTES = 256 * 1024;

/** `edges` 档正文首尾各保留的字符数(repo.py `_EDGE_CHARS`)。 */
export const EDGE_CHARS = 100;

/** 正文记录档位(顺序与 Nexus 面板一致;见 api_pages.py `content_modes`)。 */
export const CONTENT_MODES = ["off", "structure", "full", "edges"] as const;

export type ContentMode = (typeof CONTENT_MODES)[number];

/** 日志文件名:`requests-YYYYMMDD.jsonl`(day 为 `YYYY-MM-DD`)。 */
const LOG_FILE_RE = /^requests-(\d{8})\.jsonl$/;

// ---------------------------------------------------------------------------
// 辅助纯函数
// ---------------------------------------------------------------------------

/** 数值兜底(对齐 `_int`/`_float`:None/"" → 默认;可解析字符串 → 数值)。 */
function numValue(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** lenient 数值解析:None/空串 → fallback;可解析字符串/数字 → 数值。 */
export function parseMs(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) return numValue(fallback);
  const text = typeof value === "string" ? value.trim() : value;
  if (text === "") return numValue(fallback);
  const n = typeof text === "number" ? text : Number(text);
  return Number.isFinite(n) ? n : numValue(fallback);
}

/** 本地时间 `YYYY-MM-DD`(对齐 repo.py `day_key`:time.strftime 本地时区)。 */
export function dayKey(epochMs?: number): string {
  const d = epochMs === undefined ? new Date() : new Date(epochMs);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** JSON 序列化(中线兜底 BigInt;与 `default=str` 同向但不撒谎成空)。 */
function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v)) as string;
  } catch {
    // 记录本身结构固定(纯 JSON 数据),理论到不了这里。
    return JSON.stringify({ _error: "request-log: 记录无法序列化为 JSON" });
  }
}

/** 非 str 值 → 文本(对齐 json.dumps(ensure_ascii=False, default=str))。 */
function dumpText(value: unknown): string {
  try {
    const s = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v));
    return s === undefined ? String(value) : s;
  } catch {
    return String(value);
  }
}

/** `_uj`(L239-246):空 → default;能 parse 的 JSON 字符串 → 解析值。 */
function parseJson(raw: unknown, fallback: unknown): unknown {
  if (typeof raw !== "string" || raw === "") return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

/** `_payload_chars`(L484-492):str 记字符数,否则按序列化文本长度。 */
export function payloadChars(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.length;
  return dumpText(value).length;
}

/** 排序键(对齐 Python `sorted(dict)`)。 */
function sortedKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

function typeName(value: unknown): string {
  if (value === null) return "NoneType";
  if (Array.isArray(value)) return "list";
  const t = typeof value;
  if (t === "object") return "dict";
  if (t === "string") return "str";
  if (t === "number") return Number.isInteger(value) ? "int" : "float";
  return t === "boolean" ? "bool" : t;
}

/**
 * `_skeleton`(L448-481):正文结构摘要。
 * - messages 顶层特判:{role, chars, keys};
 * - depth>=2 只留 {_keys}/{_len}/{_type},不抄正文。
 */
export function skeleton(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return parseJson(value, { _raw_chars: value.length });
  }
  if (Array.isArray(value)) {
    if (depth >= 2) return { _len: value.length };
    return value.map((v) => skeleton(v, depth + 1));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // messages 顶层特判:只记 role + 字符数 + 键名,不抄内容(Nexus 语义)。
    if (Array.isArray(obj.messages) && depth === 0) {
      const out = obj.messages.map((msg: unknown) => {
        if (msg !== null && typeof msg === "object" && !Array.isArray(msg)) {
          const m = msg as Record<string, unknown>;
          return {
            role: m.role ?? null,
            chars: payloadChars(m.content),
            keys: sortedKeys(m),
          };
        }
        return { _type: typeName(msg) };
      });
      return { messages: out, keys: sortedKeys(obj) };
    }
    if (depth >= 2) return { _keys: sortedKeys(obj) };
    const out: Record<string, unknown> = {};
    for (const k of sortedKeys(obj)) out[String(k)] = skeleton(obj[k], depth + 1);
    return out;
  }
  return { _type: typeName(value) };
}

/**
 * `_trim`(L315-324):`full` 档正文裁剪 —— 超长只留头尾,不静默丢字段。
 * 短于上限原样返回(非 str 值返回原值,与 Nexus 一致)。
 */
export function trim(value: unknown, limit = MAX_PAYLOAD_BYTES): unknown {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : dumpText(value);
  if (text.length <= limit) return typeof value === "string" ? text : value;
  const head = text.slice(0, Math.floor(limit / 2));
  const tail = text.slice(-Math.floor(limit / 4));
  return `${head}\n...[截断 ${text.length - head.length - tail.length} 字节]...\n${tail}`;
}

/**
 * `_edges`(L327-343):`edges` 档正文摘要 —— 任何长度都只留首尾各 n 字符。
 * 返回 {head, tail, chars};总长 <= n 时 tail 为 null。
 */
export function edges(
  value: unknown,
  n = EDGE_CHARS,
): { head: string; tail: string | null; chars: number } | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : dumpText(value);
  if (text.length <= n) return { head: text, tail: null, chars: text.length };
  return { head: text.slice(0, n), tail: text.slice(-n), chars: text.length };
}

// ---------------------------------------------------------------------------
// JSONL 写入器(对齐 `_RequestLogWriter`,repo.py L350-445)
// ---------------------------------------------------------------------------

/**
 * 按天 JSONL 写入器。句柄按天缓存复用(Nexus 同款:每条 open/close 在并发下
 * 会炸 fd,且 NTFS 上每开一次就留 4KB 稀疏文件);`write()` 同步落盘(立即 flush
 * 语义);`configure()` 重定向时先关旧句柄;`prune(cutoffDay)` 删到期文件。
 */
export class RequestLogWriter {
  private root: string | null = null;
  /** 已打开文件路径 → fd(按天缓存,复用到 close/prune)。 */
  private handles = new Map<string, number>();

  constructor(root?: string) {
    if (root !== undefined && root !== null) this.root = root;
  }

  /** 重定向日志根目录(Nexus `configure`):先关旧句柄再换根。 */
  configure(root?: string | null): void {
    this.close();
    this.root = root ?? null;
  }

  private fileName(day: string): string {
    // Nexus: f"requests-{day.replace('-', '')}.jsonl"(Python replace 全量替换)
    return `requests-${String(day).replaceAll("-", "")}.jsonl`;
  }

  /** 某天文件的完整路径(未配置根目录时按空路径拼接)。 */
  pathFor(day: string): string {
    return join(this.root ?? "", this.fileName(day));
  }

  private handle(day: string): number {
    if (!this.root) {
      throw new Error("RequestLogWriter 未配置日志目录(先调用 configure)");
    }
    const file = this.pathFor(day);
    const opened = this.handles.get(file);
    if (opened !== undefined) return opened;
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
    const fd = openSync(file, "a");
    this.handles.set(file, fd);
    return fd;
  }

  /** 写一组记录(某天),立即落盘;空数组不创建文件。 */
  write(day: string, records: readonly unknown[]): void {
    if (!records || records.length === 0) return;
    const blob = records.map((r) => `${stringifyJson(r)}\n`).join("");
    const fd = this.handle(day);
    writeSync(fd, Buffer.from(blob, "utf8"));
  }

  /** 删除 day < cutoffDay 的文件(对齐 `prune`);删不掉仅警告不抛。 */
  prune(cutoffDay: string): void {
    if (!this.root) return;
    let names: string[];
    try {
      names = readdirSync(this.root);
    } catch {
      return; // 目录还不存在 = 没有可清理的
    }
    for (const name of names) {
      const m = LOG_FILE_RE.exec(name);
      if (!m) continue;
      const day = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
      if (day >= cutoffDay) continue;
      const file = join(this.root, name);
      const fd = this.handles.get(file);
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          // 关不掉也继续尝试删
        }
        this.handles.delete(file);
      }
      try {
        unlinkSync(file);
      } catch (exc) {
        console.warn(
          `清理旧请求日志失败(${file}): ${exc instanceof Error ? exc.message : String(exc)}`,
        );
      }
    }
  }

  /** 关闭全部句柄(atexit 同款收尾;Assembly.dispose 调用)。 */
  close(): void {
    for (const fd of this.handles.values()) {
      try {
        closeSync(fd);
      } catch {
        // 句柄可能已被系统回收
      }
    }
    this.handles.clear();
  }
}