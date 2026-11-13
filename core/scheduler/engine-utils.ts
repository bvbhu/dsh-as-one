// engine-utils.ts
// ========================================================================

import type {
  BlackoutWindow,
  RawEndpointRow,
  Rule,
  RuleWindow,
  SchedulerRepo,
  SettingsRepo,
  StrategyName,
  TimeSpan,
} from "./types.js";
import {
  CONFIG_DEFAULT_COOLDOWN_OVERRIDES,
  CONFIG_DEFAULT_RULES,
  COOLDOWN_DEFAULTS_JSON,
  DEFAULT_STRATEGY,
  FREE_MODEL_PREFIXES,
  FREE_TIER_ORDER,
  GRANT_TIERS,
  SETTING_DEFAULTS,
  STRATEGIES,
} from "./engine-constants.js";
import { DEFAULT_PRIORITY } from "../config/types.js";
import { performance } from "node:perf_hooks";
// 本节由第十刀从 engine.ts 按行段抽出;import/导出由外面接线。
// ========================================================================

/** priority → 设置键名:`scheduler.rules_p<priority>`。 */
export function rulesKeyOf(priority: number): string {
  return `scheduler.rules_p${priority}`;
}

/** 某档位的缺省规则**数组** JSON(元素剥掉 priority —— 键名即档位)。 */
export function rulesDefaultsJson(priority: number): string {
  const rules = CONFIG_DEFAULT_RULES.filter((r) => (r.priority ?? DEFAULT_PRIORITY) === priority)
    .map(({ priority: _p, ...rest }) => rest);
  return JSON.stringify(rules, null, 2);
}

/** `scheduler.cooldown_overrides` 的播种值(2026-10-21 从 rules 拆出的独立键)。 */
export function cooldownDefaultsJson(): string {
  return COOLDOWN_DEFAULTS_JSON;
}

// ===========================================================================
// 时基与格式化
// ===========================================================================

/** wall-clock epoch 秒。 */
export function wallNow(): number {
  return Date.now() / 1000;
}
/** monotonic 秒(对齐 time.monotonic)。 */
export function monotonic(): number {
  return performance.now() / 1000;
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
/** localtime "%Y-%m-%dT%H:%M"(分钟级缓存键)。 */
export function fmtMinute(epoch: number): string {
  const d = new Date(epoch * 1000);
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** localtime "%Y-%m-%d %H:%M:%S"(到期原因展示)。 */
export function formatLocal(epoch: number): string {
  const d = new Date(epoch * 1000);
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// ===========================================================================
// 纯函数(Nexus 模块级 helper)
// ===========================================================================

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
export function toInt(value: unknown, fallback: number): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** "HH:MM" → 分钟(允许 24:00 → 1440;解析失败抛错,由调用方捕获)。 */
export function hhmm(value: unknown): number {
  const s = String(value);
  const idx = s.indexOf(":");
  if (idx < 0) throw new Error("invalid hhmm");
  const h = Number(s.slice(0, idx));
  const m = Number(s.slice(idx + 1));
  if (Number.isNaN(h) || Number.isNaN(m)) throw new Error("invalid hhmm");
  return h * 60 + m;
}
/** 分钟 → "HH:MM"(夹紧 0..1440)。 */
export function fmtHhmm(minute: number): string {
  const m = Math.max(0, Math.min(1440, minute));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** 解析 "YYYY-MM-DD HH:MM:SS" 或 "YYYY-MM-DD"(日级 = 本地 00:00);失败 → null。 */
export function expiryEpoch(value: string): number | null {
  const text = String(value).trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (full) {
    const d = new Date(
      Number(full[1]),
      Number(full[2]) - 1,
      Number(full[3]),
      Number(full[4]),
      Number(full[5]),
      Number(full[6]),
    );
    return d.getTime() / 1000;
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day) {
    const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 0, 0, 0);
    return d.getTime() / 1000;
  }
  return null;
}

/** [00:00, 1440) 对「可用时段」取差集 = 禁用时段(仅 legacy 迁移用)。 */
export function complementSpans(avail: TimeSpan[]): TimeSpan[] {
  const parsed: Array<[number, number]> = [];
  for (const span of avail) {
    let s: number;
    let e: number;
    try {
      s = hhmm(span[0]);
      e = hhmm(span[1]);
    } catch {
      continue;
    }
    if (s === e) continue;
    if (s < e) parsed.push([s, e]);
    else {
      parsed.push([s, 1440]);
      parsed.push([0, e]);
    }
  }
  if (parsed.length === 0) return [];
  parsed.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of parsed) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const out: TimeSpan[] = [];
  let cur = 0;
  for (const [s, e] of merged) {
    if (cur < s) out.push([fmtHhmm(cur), fmtHhmm(s)]);
    cur = Math.max(cur, e);
  }
  if (cur < 1440) out.push([fmtHhmm(cur), fmtHhmm(1440)]);
  return out;
}

/**
 * 时段黑名单判定:weekdays(1=周一..7=周日)过滤;span 右开 [start, end);
 * 跨午夜 start>end → minute>=start 或 minute<end。
 */
export function isBlackout(windows: BlackoutWindow[] | null | undefined, now: number): boolean {
  if (!windows || windows.length === 0) return false;
  const d = new Date(now * 1000);
  const weekday = d.getDay() === 0 ? 7 : d.getDay();
  const minute = d.getHours() * 60 + d.getMinutes();
  for (const win of windows) {
    if (!win || typeof win !== "object") continue;
    const days = win.weekdays;
    if (days && days.length > 0 && !days.includes(weekday)) continue;
    for (const span of win.times ?? []) {
      let start: number;
      let end: number;
      try {
        start = hhmm(span[0]);
        end = hhmm(span[1]);
      } catch {
        continue;
      }
      if (start <= end) {
        if (start <= minute && minute < end) return true;
      } else if (minute >= start || minute < end) {
        return true;
      }
    }
  }
  return false;
}

/** 多键稳定排序:返回 [0..n-1] 的排列,按 keys[i] 字典序;并列 → 配置序。 */
export function stableBy(keys: number[][]): number[] {
  const decorated = keys.map((k, i) => [...k, i]);
  decorated.sort(tupleCompare);
  return decorated.map((row) => row[row.length - 1]!);
}
function tupleCompare(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return a.length - b.length;
}

export type Pair = [string, string];

/** "provider/model"。 */
export function key(provider: string, model: string): string {
  return `${provider}/${model}`;
}
/** 拆 "provider/model"(两段都非空才返回)。 */
export function splitModelId(mid: string): Pair | null {
  const idx = mid.indexOf("/");
  if (idx < 0) return null;
  const p = mid.slice(0, idx);
  const m = mid.slice(idx + 1);
  if (!p || !m) return null;
  return [p, m];
}
/** member dict → (provider, model);兜底 real_model_id。 */
export function memberPair(member: unknown): Pair | null {
  if (!isRecord(member)) return null;
  const provider = member.provider ?? member.provider_id;
  const model = member.model ?? member.upstream_id;
  if (provider && model) return [String(provider), String(model)];
  return splitModelId(String(member.real_model_id ?? ""));
}
/** endpoint_chain 行 → (provider, model):member → endpoint → real_model_id 兜底链。 */
export function rowMember(row: RawEndpointRow): Pair | null {
  const pair = memberPair(row.member);
  if (pair) return pair;
  const endpoint = isRecord(row.endpoint) ? row.endpoint : null;
  const pair2 = memberPair(endpoint);
  if (pair2) return pair2;
  return splitModelId(String(row.real_model_id ?? ""));
}
/** 行的额度键 "provider/username"(凭据 tuple / 字符串 / username 字段兜底)。 */
export function quotaKey(row: RawEndpointRow, pair: Pair): string | null {
  const endpoint = isRecord(row.endpoint) ? row.endpoint : {};
  const cred = endpoint.credential_key;
  if (Array.isArray(cred) && cred.length >= 2) {
    return key(cred[0] ? String(cred[0]) : pair[0], String(cred[1] ?? ""));
  }
  if (typeof cred === "string" && cred !== "") {
    return cred;
  }
  const username = endpoint.username ?? endpoint.account_id;
  if (username) return key(pair[0], String(username));
  return null;
}

// ---------------------------------------------------------------------------
// 策略归一化
// ---------------------------------------------------------------------------

const LEGACY_STRATEGY: ReadonlyArray<[string, StrategyName]> = [
  ["最先到期 due first", "due-first"],
  ["最先到期", "due-first"],
  ["due first", "due-first"],
  ["random", "random"],
  ["简单打散", "random"],
  ["simple-shuffle", "random"],
  ["用量平衡", "least-busy"],
  ["usage-balanced", "least-busy"],
  ["usage-based-routing-v2", "least-busy"],
  ["usage-based-routing", "least-busy"],
  ["按序降级链", "ordered-fallback"],
  ["ordered-fallback", "ordered-fallback"],
  ["最少在途", "least-busy"],
  ["least-busy", "least-busy"],
  ["平均使用", "balanced"],
  ["balanced", "balanced"],
];
const STRATEGY_HINTS: ReadonlyArray<[string, StrategyName]> = [
  ["least-busy", "least-busy"],
  ["busy", "least-busy"],
  ["在途", "least-busy"],
  ["ordered", "ordered-fallback"],
  ["fallback", "ordered-fallback"],
  ["按序", "ordered-fallback"],
  ["usage", "least-busy"],
  ["用量", "least-busy"],
  ["平均", "balanced"],
  ["shuffle", "random"],
  ["random", "random"],
  ["随机", "random"],
  ["due", "due-first"],
  ["到期", "due-first"],
];

/** 机器键 → 原样;legacy 全名 → 映射;子串提示 → 映射;未知 → due-first。 */
export function normalizeStrategy(raw: unknown): StrategyName {
  if (!raw) return DEFAULT_STRATEGY;
  const value = String(raw).trim();
  if (value === "") return DEFAULT_STRATEGY;
  if ((STRATEGIES as readonly string[]).includes(value)) return value as StrategyName;
  const lowered = value.toLowerCase();
  for (const [legacy, machine] of LEGACY_STRATEGY) {
    if (lowered === legacy) return machine;
  }
  for (const [hint, machine] of STRATEGY_HINTS) {
    if (lowered.includes(hint)) return machine;
  }
  return DEFAULT_STRATEGY;
}

/**
 * 模块级免费判定(名单序前缀匹配,不含到期;面板兼容入口)。
 *
 * ⚠️ 2026-10-30 起 ``FREE_TIER_ENTRIES`` 恒为空 → 这里恒返回 false。
 * 真正的免费档判定在 Scheduler 内部,读库里的 ``scheduler.rules_p1``
 * (``_isFreeModel`` / ``_freeRankOf``,用 this._config().freeModels)。
 * 保留本函数只为面板/测试的导出形状稳定。
 */
export function isFreeModel(realModelId: string): boolean {
  return FREE_MODEL_PREFIXES.some((p) => realModelId.startsWith(p));
}
/** 同上:名单恒空 → 恒返回 0(所有模型并列)。真实排序用 Scheduler._freeRankOf。 */
export function freeRankOf(realModelId: string): number {
  const i = FREE_TIER_ORDER.indexOf(realModelId);
  return i === -1 ? FREE_TIER_ORDER.length : i;
}
export function isGrantTier(provider: string, model: string): boolean {
  return GRANT_TIERS.some(([p, m]) => p === provider && m === model);
}

/** 抽象档超时 / 真实档等待预算(秒)。 */
export function waitLimits(repo: SchedulerRepo, opts: { abstract: boolean }): number {
  if (opts.abstract) {
    return coerceSetting(repo.getSetting("abstract.timeout_s"), "abstract.timeout_s");
  }
  return coerceSetting(repo.getSetting("real.wait_budget_s"), "real.wait_budget_s");
}
function coerceSetting(raw: string | null, key: string): number {
  const def = SETTING_DEFAULTS[key];
  if (raw === null || raw === undefined || raw === "") return def;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) return def;
  return Number.isInteger(def) ? Math.trunc(value) : value;
}

/** 逻辑模型判定:repo 有行 → 抽象;不确定 → false(倒向真实)。 */
export function isAbstractModel(repo: SchedulerRepo, model: string): boolean {
  try {
    const row = repo.logicalModelRow(model);
    return row !== null && row !== undefined;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 配置解析(Nexus _valid_rules / _legacy_sections_to_rules / _read_config)
// ---------------------------------------------------------------------------

export function jsonSetting(raw: string | null, defaultJson: string): unknown {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return JSON.parse(defaultJson);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(defaultJson);
  }
}

/** spans 合法:非空数组,每项 [a,b] 均可解析。 */
export function validSpans(spans: unknown): boolean {
  if (!Array.isArray(spans) || spans.length === 0) return false;
  for (const span of spans) {
    if (!Array.isArray(span) || span.length !== 2) return false;
    try {
      hhmm(span[0]);
      hhmm(span[1]);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * 扁平 rules 校验清洗(坏字段丢弃,不拖垮整条)。
 *
 * 2026-10-21 改版:
 * - 时段字段收进 ``window`` 嵌套对象(兼容旧的扁平 ``times``/``weekdays``,
 *   读到就迁移进来 —— 旧数据不用手改);
 * - **不再有 ``cooldown`` 字段**(已拆到 ``scheduler.cooldown_overrides``);
 * - **不再做 priority 隐式推导**(未写 = {@link DEFAULT_PRIORITY} = 3)。
 */
export function validRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return [];
  const out: Rule[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    if (typeof entry.provider !== "string" || entry.provider.trim() === "") continue;
    const rule: Rule = { provider: entry.provider.trim() };
    if (entry.model !== undefined && entry.model !== null) {
      if (typeof entry.model === "string" && entry.model.trim() !== "") rule.model = entry.model.trim();
    }
    if (entry.expires_at !== undefined && entry.expires_at !== null) {
      if (typeof entry.expires_at === "string" && expiryEpoch(entry.expires_at) !== null) {
        rule.expires_at = entry.expires_at;
      }
    }
    // 时段:优先读 window 对象;旧的扁平 times/weekdays 仍接受(迁移期兼容)。
    const winSrc = isRecord(entry.window) ? entry.window : entry;
    const window: RuleWindow = {};
    const timesRaw = winSrc.times;
    if (timesRaw !== undefined && timesRaw !== null && validSpans(timesRaw)) {
      window.times = timesRaw as TimeSpan[];
    }
    const wdRaw = winSrc.weekdays;
    if (
      Array.isArray(wdRaw) &&
      wdRaw.length > 0 &&
      wdRaw.every((w) => typeof w === "number" && Number.isInteger(w) && w >= 1 && w <= 7)
    ) {
      window.weekdays = wdRaw as number[];
    }
    if (window.times !== undefined || window.weekdays !== undefined) rule.window = window;
    if (entry.priority !== undefined && entry.priority !== null) {
      if (typeof entry.priority === "number" && Number.isInteger(entry.priority) && entry.priority >= 0) {
        rule.priority = entry.priority;
      }
    }
    out.push(rule);
  }
  return out;
}

/**
 * ``scheduler.cooldown_overrides`` 校验 → ``{provider: 分钟}``。
 *
 * 键 = provider(非空字符串),值 = 正数分钟。坏条目跳过,不拖垮整份。
 */
export function validCooldownOverrides(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const provider = key.trim();
    if (provider === "") continue;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out[provider] = value;
  }
  return out;
}

/** 三段 legacy 配置 → 扁平 rules(free+补集 → credit_expiry → time_windows)。 */
export function legacySectionsToRules(legacy: Record<string, unknown>): Rule[] {
  const out: Rule[] = [];
  const free = legacy.free_models;
  if (Array.isArray(free)) {
    for (const e of free) {
      if (!isRecord(e)) continue;
      const { provider, model } = e;
      if (
        typeof provider !== "string" ||
        provider === "" ||
        typeof model !== "string" ||
        model === ""
      ) {
        continue;
      }
      const item: Rule = { provider, model, priority: 1 };
      const exp = e.expires_at;
      if (typeof exp === "string" && expiryEpoch(exp) !== null) item.expires_at = exp;
      out.push(item);
      const win = e.window;
      if (Array.isArray(win) && validSpans(win)) {
        const spans = complementSpans(win as TimeSpan[]);
        if (spans.length > 0) {
          out.push({ provider, model, window: { times: spans }, priority: 0 });
        }
      }
    }
  }
  const credit = legacy.credit_expiry;
  if (isRecord(credit)) {
    for (const [k, v] of Object.entries(credit)) {
      if (typeof v === "string" && expiryEpoch(v) !== null) {
        out.push({ provider: k, expires_at: v, priority: 2 });
      }
    }
  }
  const windows = legacy.time_windows;
  if (Array.isArray(windows)) {
    for (const r of windows) {
      if (!isRecord(r)) continue;
      const { provider, model } = r;
      if (
        typeof provider !== "string" ||
        provider === "" ||
        typeof model !== "string" ||
        model === ""
      ) {
        continue;
      }
      const times = r.times ?? r.window;
      if (!validSpans(times)) continue;
      const item: Rule = {
        provider,
        model,
        window: { times: times as TimeSpan[] },
        priority: r.mode === "degrade" ? 4 : 0,
      };
      const wd = r.weekdays;
      if (
        Array.isArray(wd) &&
        wd.length > 0 &&
        wd.every((w) => typeof w === "number" && Number.isInteger(w) && w >= 1 && w <= 7)
      ) {
        item.window!.weekdays = wd as number[];
      }
      out.push(item);
    }
  }
  return out;
}

/**
 * ``scheduler.cooldown_overrides`` → ``{provider: 冷却分钟}``。
 *
 * 2026-10-21 起冷却覆盖从 ``scheduler.rules`` 拆出独立键(档位调度与失败熔断
 * 是两条正交的轴)。旧数据里 ``rules[].cooldown`` 的写法**不再读取** ——
 * 迁移脚本负责搬运。
 */
export function rulesCooldownMap(repo: SettingsRepo): Map<string, number> {
  const raw = repo.getSetting("scheduler.cooldown_overrides");
  const out = new Map<string, number>();
  if (raw === null || raw === undefined || raw.trim() === "") {
    for (const [k, v] of Object.entries(CONFIG_DEFAULT_COOLDOWN_OVERRIDES)) out.set(k, v);
    return out;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    for (const [k, v] of Object.entries(CONFIG_DEFAULT_COOLDOWN_OVERRIDES)) out.set(k, v);
    return out;
  }
  for (const [k, v] of Object.entries(validCooldownOverrides(parsed))) out.set(k, v);
  return out;
}

// ===========================================================================
// 端点 / 健康 / pin / 账本
// ===========================================================================

/** 端点 id(仅身份/展示用;在途计数键是 real_model_key)。 */
export function endpointIdOf(provider: string, model: string, username: string): string {
  return `${provider}/${model}@${provider}/${username}`;
}

/** endpoint dict → credential_key (provider, username) 四层兜底。 */
export function credentialKeyOf(data: Record<string, unknown>, provider: string): [string, string] {
  const cred = data.credential_key;
  if (Array.isArray(cred) && cred.length >= 2) {
    return [cred[0] ? String(cred[0]) : provider, cred[1] != null ? String(cred[1]) : ""];
  }
  if (typeof cred === "string" && cred !== "") {
    const idx = cred.indexOf("/");
    if (idx >= 0) {
      const head = cred.slice(0, idx);
      const tail = cred.slice(idx + 1);
      return [head || provider, tail];
    }
    return [provider, cred];
  }
  const username = data.username ?? data.account_id;
  if (username) return [provider, String(username)];
  return [provider, ""];
}
