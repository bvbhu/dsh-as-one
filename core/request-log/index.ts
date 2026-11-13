/**
 * 请求日志聚合注册 —— 对齐 Nexus repo.py `log_requests`(L1051-1077)/
 * `_prepare_row`(L1079-1136)/`_write_stats`(L1168-1197)/`_detail`(L1199-1233)/
 * `_content_mode`(L1235-1250)。
 *
 * 一条完成行 → 库内 `stats_daily` 聚合(**复用注入的 `statsDaily.record`**,
 * 不自己写 SQL;NULL logical_model 的 UPDATE-IS-NULL 先试语义已在 record 内处理)
 * + 按 `content_mode` 决定是否写当天 JSONL 明细。
 */

import { endpointIdOf } from "../scheduler/engine.js";
import {
  CONTENT_MODES,
  dayKey,
  edges,
  parseMs,
  skeleton,
  trim,
  type ContentMode,
  type RequestLogWriter,
} from "./writer.js";

export {
  CONTENT_MODES,
  EDGE_CHARS,
  MAX_PAYLOAD_BYTES,
  RequestLogWriter,
  dayKey,
  edges,
  parseMs,
  payloadChars,
  skeleton,
  trim,
  type ContentMode,
} from "./writer.js";

// ---------------------------------------------------------------------------
// 完成行输入(_prepare_row 的入参,宽松形状)
// ---------------------------------------------------------------------------

export interface RequestLogRow {
  /** 完成时刻 epoch 秒;缺省 now。 */
  ts?: unknown;
  /** 明细按天的键 `YYYY-MM-DD`;缺省 dayKey(ts)。 */
  day?: unknown;
  /** 真实模型 id `provider/model`(与 Nexus real_model_id 同义)。 */
  real_model_id?: unknown;
  /** real_model_id 的别名(Nexus `row.get("real_model_id") or row.get("id")`)。 */
  id?: unknown;
  /** 逻辑模型名;可为 null(直连即真实模型)。 */
  logical_model?: unknown;
  provider?: unknown;
  model?: unknown;
  /** 账号名;容忍 (provider, username) 二元组(取第 2 项)。 */
  username?: unknown;
  account_id?: unknown;
  credential_key?: unknown;
  session_id?: unknown;
  /** 网关**丢弃**(透传不了)的顶层字段名 —— 用户 m09081 要求「可能需要额外记录
   *  丢弃了哪些字段」。空 = 全部字段都处理了。 */
  discarded_fields?: unknown;
  /** 缓存路由键(`prompt_cache_key`,billion-context)—— 用于端点亲和的内部键,
   *  **不进上游 body**。 */
  prompt_cache_key?: unknown;
  status?: unknown;
  ok?: unknown;
  /** 失败详情原文(不截断)。 */
  error?: unknown;
  error_kind?: unknown;
  error_status?: unknown;
  latency_ms?: unknown;
  /** 到首块耗时 ms;None 时 ttft_requests 不计数。 */
  ttft_ms?: unknown;
  requests?: unknown;
  fails?: unknown;
  /** Nexus usage{prompt,cached,completion} 语义(或逐 token 字段直接给)。 */
  usage?: unknown;
  prompt_tokens?: unknown;
  cached_tokens?: unknown;
  completion_tokens?: unknown;
  /** 请求正文(payload 优先,request 兜底 —— Nexus `payload or request`)。 */
  payload?: unknown;
  request?: unknown;
}

/** _prepare_row 之后的定型行。 */
export interface PreparedRequestLogRow {
  ts: number;
  day: string;
  logical_model: string | null;
  provider: string;
  model: string;
  username: string;
  endpoint_id: string | null;
  session_id: unknown;
  status: unknown;
  ok: boolean;
  error: unknown;
  error_kind: unknown;
  error_status: unknown;
  latency_ms: number;
  ttft_ms: number | null;
  requests: number;
  fails: number;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  payload: unknown;
  /** 网关**丢弃**的顶层字段名(用户 m09081:不能处理就丢弃,但要能查到丢了什么)。 */
  discarded_fields: unknown;
  /** 缓存路由键(`prompt_cache_key`,billion-context)—— 用于端点亲和的内部键。 */
  prompt_cache_key: unknown;
}

// ---------------------------------------------------------------------------
// _prepare_row(L1079-1136)
// ---------------------------------------------------------------------------

/** 拆 `provider/model`(按第一个 `/`;无斜杠 → (null, text))。 */
export function splitModelId(value: unknown): [string | null, string | null] {
  if (typeof value !== "string" || value.length === 0) return [null, null];
  const idx = value.indexOf("/");
  if (idx < 0) return [null, value];
  return [value.slice(0, idx), value.slice(idx + 1)];
}

export function prepareRow(row: RequestLogRow): PreparedRequestLogRow {
  const ts = parseMs(row.ts, 0) || Date.now() / 1000;
  const day = String(row.day ?? "") || dayKey(Math.round(ts * 1000));
  const [p1, m1] = splitModelId(row.real_model_id ?? row.id);
  const provider = String(row.provider ?? p1 ?? "");
  const model = String(row.model ?? m1 ?? "");
  const logical = row.logical_model === null || row.logical_model === undefined
    ? null
    : String(row.logical_model);
  const usernameRaw = row.username ?? row.account_id ?? row.credential_key ?? "";
  const username = Array.isArray(usernameRaw) && usernameRaw.length === 2
    ? String(usernameRaw[1])
    : String(usernameRaw);
  const usage = row.usage && typeof row.usage === "object" && !Array.isArray(row.usage)
    ? (row.usage as Record<string, unknown>)
    : {};
  const ttft = row.ttft_ms === undefined || row.ttft_ms === null
    ? null
    : parseMs(row.ttft_ms, 0);
  const error = row.error ?? null;
  const status = parseMs(row.status, 200);
  // ok 显式给了就用;否则 无错误 && status<400 默认真(Nexus `ok or` 语义)。
  const ok = row.ok !== undefined ? Boolean(row.ok) : !error && status < 400;
  const endpointId = provider && model ? endpointIdOf(provider, model, username) : null;
  return {
    ts,
    day,
    logical_model: logical,
    provider,
    model,
    username,
    endpoint_id: endpointId,
    session_id: row.session_id ?? null,
    status: row.status ?? null,
    ok,
    error,
    error_kind: row.error_kind ?? null,
    error_status: row.error_status ?? null,
    latency_ms: parseMs(row.latency_ms, 0),
    ttft_ms: ttft,
    requests: parseMs(row.requests, 1),
    fails: parseMs(row.fails, ok ? 0 : 1),
    prompt_tokens: parseMs(row.prompt_tokens, parseMs(usage.prompt_tokens, 0)),
    cached_tokens: parseMs(row.cached_tokens, parseMs(usage.cached_tokens, 0)),
    completion_tokens: parseMs(row.completion_tokens, parseMs(usage.completion_tokens, 0)),
    payload: row.payload !== undefined ? row.payload : row.request,
    discarded_fields: row.discarded_fields ?? null,
    prompt_cache_key: row.prompt_cache_key ?? null,
  };
}

// ---------------------------------------------------------------------------
// _write_stats(L1168-1197):按 (day, logical, provider, model) 分组累加 8 计数器
// ---------------------------------------------------------------------------

/** stats_daily 增量(structural;与 db StatsDelta 形状兼容,避免包间类型耦合)。 */
export interface StatsDeltaLike {
  day: string;
  logical_model: string | null;
  provider: string;
  model: string;
  requests: number;
  fails: number;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  latency_sum_ms: number;
  ttft_sum_ms: number;
  ttft_requests: number;
}

export type StatsRecorder = (delta: StatsDeltaLike) => void;

/**
 * 分组累加计数器(顺序与 Nexus acc 一致):requests / prompt / cached /
 * completion / latency / ttft(0 兜底) / ttft_requests(仅在 ttft_ms 非空时 +1)。
 *
 * ⚠️ **失败的请求不进统计**(用户 m11736 定案):`ok === false` 的行整条跳过 ——
 * 既不进 `requests`,也不进 token/延迟。理由:「失败」在不同上游的含义差太多
 * (重试后成功的换档也算失败),拿它算成功率只会得出一个没有意义的数字。
 * 但**明细日志照写**(`logs/requests-*.jsonl` 仍保留失败行,排障要看的就是它)。
 *
 * **没有真实 provider/model 的行跳过 stats**(诚实降级:不伪造)。
 */
export function writeStats(items: readonly PreparedRequestLogRow[], record: StatsRecorder): void {
  interface Group {
    day: string;
    logical: string | null;
    provider: string;
    model: string;
    acc: [number, number, number, number, number, number, number];
  }
  const byKey = new Map<string, Group>();
  for (const it of items) {
    if (!it.provider || !it.model) continue; // 诚实降级:无法归属真实模型的请求不进聚合
    if (!it.ok) continue; // 失败请求不进统计(明细日志仍写,见函数头注释)
    const key = [it.day, it.logical_model ?? "", it.provider, it.model].join("\u0000");
    let g = byKey.get(key);
    if (!g) {
      g = { day: it.day, logical: it.logical_model, provider: it.provider, model: it.model, acc: [0, 0, 0, 0, 0, 0, 0] };
      byKey.set(key, g);
    }
    g.acc[0] += it.requests;
    g.acc[1] += it.prompt_tokens;
    g.acc[2] += it.cached_tokens;
    g.acc[3] += it.completion_tokens;
    g.acc[4] += it.latency_ms;
    g.acc[5] += it.ttft_ms ?? 0;
    g.acc[6] += it.ttft_ms === null ? 0 : 1;
  }
  for (const g of byKey.values()) {
    const a = g.acc;
    record({
      day: g.day,
      logical_model: g.logical,
      provider: g.provider,
      model: g.model,
      requests: a[0],
      // fails 恒 0:失败请求不再单独计数(历史行仍留着旧值,面板不再展示)
      fails: 0,
      prompt_tokens: a[1],
      cached_tokens: a[2],
      completion_tokens: a[3],
      latency_sum_ms: a[4],
      ttft_sum_ms: a[5],
      ttft_requests: a[6],
    });
  }
}

// ---------------------------------------------------------------------------
// _detail(L1199-1233):逐请求明细行(元数据永远写全,正文按档位裁剪)
// ---------------------------------------------------------------------------

export function detail(item: PreparedRequestLogRow, mode: ContentMode): Record<string, unknown> {
  const record: Record<string, unknown> = {
    ts: Math.round(item.ts * 1_000_000) / 1_000_000, // 6 位小数(repo.py round 语义)
    day: item.day,
    logical_model: item.logical_model,
    provider: item.provider,
    model: item.model,
    endpoint_id: item.endpoint_id,
    username: item.username || null,
    session_id: item.session_id ?? null,
    status: item.status ?? null,
    ok: item.ok,
    error: item.error,
    error_kind: item.error_kind,
    error_status: item.error_status,
    latency_ms: Math.round(item.latency_ms),
    ttft_ms: item.ttft_ms === null ? null : Math.round(item.ttft_ms),
    usage: {
      prompt_tokens: item.prompt_tokens,
      cached_tokens: item.cached_tokens,
      completion_tokens: item.completion_tokens,
    },
    content_mode: mode,
    // 字段处置(用户 m09081):**丢弃清单**与**缓存路由键**要能在明细里查到 ——
    // 否则一个客户端参数静默消失,排查成本极高(「我明明传了 X,上游说没收到」)。
    discarded_fields: item.discarded_fields ?? null,
    prompt_cache_key: item.prompt_cache_key ?? null,
  };
  if (mode === "full") {
    record.payload = trim(item.payload);
  } else if (mode === "edges") {
    record.payload_edges = edges(item.payload);
  } else {
    record.structure = skeleton(item.payload);
  }
  return record;
}

// ---------------------------------------------------------------------------
// _content_mode(L1235-1250):5 秒缓存 + enabled 判定
// ---------------------------------------------------------------------------

/** enabled 命中即按 off 处理的值(Nexus `in ("0","false","off","no")`)。 */
const OFF_ENABLED = new Set(["0", "false", "off", "no"]);

/** 档位校验:`raw` 洗白(去空格/小写)后必须在四档内,否则回退 fallback。 */
export function parseContentMode(
  raw: string | null | undefined,
  fallback: ContentMode = "structure",
): ContentMode {
  const mode = String(raw ?? "").trim().toLowerCase();
  return (CONTENT_MODES as readonly string[]).includes(mode)
    ? (mode as ContentMode)
    : fallback;
}

export interface GetSetting {
  (key: string): string | null | undefined;
}

function computeMode(getSetting: GetSetting): ContentMode {
  // 面板 set 时默认 off(api_pages.py L5270:`or "off"`);写入端默认 structure。
  const mode = parseContentMode(getSetting("request_log.content_mode"), "structure");
  // enabled 关 → 一律 off(Nexus: `str(setting or "1") in ("0","false","off","no")`)。
  const enabledRaw = String(getSetting("request_log.enabled") ?? "1").trim().toLowerCase();
  return OFF_ENABLED.has(enabledRaw) ? "off" : mode;
}

/** 立即求解(Nexus 面板用;无缓存)。 */
export function resolveContentMode(getSetting: GetSetting): ContentMode {
  return computeMode(getSetting);
}

/** 5 秒缓存解析器(Nexus `_mode_cache`/`_mode_exp`;ttlMs/tnow 可注入测试)。 */
export function createContentModeResolver(
  getSetting: GetSetting,
  opts: { ttlMs?: number; now?: () => number } = {},
): () => ContentMode {
  const ttlMs = opts.ttlMs ?? 5_000;
  const clock = opts.now ?? Date.now;
  let cached: { mode: ContentMode; at: number } | null = null;
  return () => {
    const now = clock();
    if (cached !== null && now - cached.at < ttlMs) return cached.mode;
    const mode = computeMode(getSetting);
    cached = { mode, at: now };
    return mode;
  };
}

// ---------------------------------------------------------------------------
// log_requests(L1051-1077):完整注册 —— stats 聚合 + 按天明细
// ---------------------------------------------------------------------------

export interface RequestLogDeps {
  /** 复用注入的 `statsDaily.record`(增量累加;NULL logical 已在此层处理)。 */
  record: StatsRecorder;
  writer: RequestLogWriter;
  getSetting: GetSetting;
  /** 命中即用(带 5s 缓存);缺省每次现算。 */
  getContentMode?: () => ContentMode;
  /** 测试注入时钟(epoch 秒)。 */
  now?: () => number;
}

/**
 * 注册一批完成的请求行:先写 stats_daily 聚合,再按 content_mode(≠off)逐天写
 * JSONL 明细。返回注册行数(Nexus 同款 return len(items))。
 */
export function logRequests(rows: readonly RequestLogRow[], deps: RequestLogDeps): number {
  const items = (rows ?? []).map((r) => prepareRow(r));
  if (items.length === 0) return 0;
  writeStats(items, deps.record);
  const mode = deps.getContentMode ? deps.getContentMode() : computeMode(deps.getSetting);
  if (mode !== "off") {
    const byDay = new Map<string, unknown[]>();
    for (const it of items) {
      const list = byDay.get(it.day) ?? [];
      list.push(detail(it, mode));
      byDay.set(it.day, list);
    }
    for (const [day, records] of byDay) deps.writer.write(day, records);
  }
  return items.length;
}