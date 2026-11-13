/**
 * backoff_delay 纯函数与 RetryPolicy —— 移植自 nexus/core/backoff.py(439 行)。
 * 公式/常数逐字保留;唯一差异是随机源抽象为注入的 {@link Rng}。
 */
import type {
  BackoffParams,
  RetryableErrorLike,
  Rng,
  RetryPolicyData,
  SettingsRepo,
} from "./types.js";

/** 指数退避的底数。 */
export const DEFAULT_FACTOR = 2.0;

/** should_retry 忽略 reset_deadline 的最小提前量(秒)。 */
export const RESET_DEADLINE_MIN_LEAD_S = 60.0;

/** 播种用 7 个 retry 设置键(顺序即播种顺序)。 */
export const RETRY_KEYS: readonly string[] = [
  "retry.base_backoff_s",
  "retry.max_backoff_s",
  "retry.jitter_ratio",
  "retry.codes",
  "retry.logical_max",
  "retry.real_max",
  "retry.logical_cooldown",
];

/** 缺省值(与 Nexus RETRY_DEFAULTS 逐字一致)。 */
export const RETRY_DEFAULTS: Record<string, number | string> = {
  "retry.base_backoff_s": 1.0,
  "retry.max_backoff_s": 15.0,
  "retry.jitter_ratio": 0.2,
  "retry.codes": "timeout,connection,429,500,502,503,504",
  "retry.logical_max": 1,
  "retry.real_max": 10,
  "retry.logical_cooldown": 15,
};

/** 缺省可重试码(与 DEFAULT_CODES 逐字一致)。 */
export const DEFAULT_CODES =
  "timeout,connection,429,500,502,503,504";

// ---------------------------------------------------------------------------
// backoff_delay
// ---------------------------------------------------------------------------

/**
 * 指数退避的延迟秒数。
 *
 * ```
 * n   = max(1, int(attempt))
 * raw = min(cap_s, base_s * factor ** (n - 1))
 * jitter_ratio <= 0 → raw(确定性)
 * jitter_ratio >  1 → 1.0(夹紧)
 * 否则              → uniform(raw * (1 - ratio), raw)   # 抖动只向下
 * ```
 */
export function backoffDelay(params: BackoffParams): number {
  const factor = params.factor ?? DEFAULT_FACTOR;
  const n = Math.max(1, Math.trunc(params.attempt));
  const raw = Math.min(params.capS, params.baseS * Math.pow(factor, n - 1));
  const ratio = params.jitterRatio;
  if (ratio <= 0) return raw;
  const r = ratio > 1 ? 1 : ratio;
  const rng: Rng = params.rng ?? MathRng;
  return rng.uniform(raw * (1 - r), raw);
}

// ---------------------------------------------------------------------------
// 设置读取(带播种/纠错,行为对齐 retry_setting / retry_codes)
// ---------------------------------------------------------------------------

function coerceNumber(raw: string | null, key: string): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) return null;
  // 默认值是整数的键(logical_max/real_max/logical_cooldown)按整数归一整。
  const def = RETRY_DEFAULTS[key];
  return Number.isInteger(def) ? Math.trunc(value) : value;
}

/**
 * 读单个 retry 数值设置:缺失 → 播种缺省并重读;坏值 → 写回缺省并重读;
 * 仍无效 → 内存缺省。`retry.codes` 走 {@link retryCodes}。
 */
export function retrySetting(repo: SettingsRepo, key: string): number {
  if (!(key in RETRY_DEFAULTS)) {
    throw new Error(`unknown retry setting: ${key}`);
  }
  if (key === "retry.codes") {
    throw new Error("use retryCodes() for retry.codes");
  }
  let raw = repo.getSetting(key);
  if (raw === null || raw === undefined) {
    repo.setSetting(key, String(RETRY_DEFAULTS[key]));
    raw = repo.getSetting(key);
  }
  const coerced = coerceNumber(raw, key);
  if (coerced === null) {
    repo.setSetting(key, String(RETRY_DEFAULTS[key]));
    raw = repo.getSetting(key);
  }
  return coerceNumber(raw, key) ?? Number(RETRY_DEFAULTS[key]);
}

/** 读 retry.codes → 小写去空格集合;缺失/空集 → 播种缺省并重读。 */
export function retryCodes(repo: SettingsRepo): ReadonlySet<string> {
  let raw = repo.getSetting("retry.codes");
  if (raw === null || raw === undefined) {
    repo.setSetting("retry.codes", String(RETRY_DEFAULTS["retry.codes"]));
    raw = repo.getSetting("retry.codes");
  }
  let parts = splitCodes(raw);
  if (parts.size === 0) {
    repo.setSetting("retry.codes", String(RETRY_DEFAULTS["retry.codes"]));
    raw = repo.getSetting("retry.codes");
    parts = splitCodes(raw);
  }
  return parts;
}

function splitCodes(raw: string | null): Set<string> {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0),
  );
}

/** 幂等播种 7 个 retry 键(缺失才写,绝不覆盖用户值)。 */
export function seedRetrySettings(repo: SettingsRepo): void {
  for (const key of RETRY_KEYS) {
    const raw = repo.getSetting(key);
    if (raw === null || raw === undefined) {
      try {
        repo.setSetting(key, String(RETRY_DEFAULTS[key]));
      } catch {
        // 播种失败仅告警,不影响调度器启动
      }
    }
  }
}

// ---------------------------------------------------------------------------
// RetryPolicy
// ---------------------------------------------------------------------------

/** 不可变重试策略(对齐 RetryPolicy frozen dataclass)。 */
export class RetryPolicy {
  readonly maxAttempts: number;
  readonly cooldownFloorS: number;
  readonly baseS: number;
  readonly factor: number;
  readonly capS: number;
  readonly jitterRatio: number;
  readonly codes: ReadonlySet<string>;

  constructor(data: RetryPolicyData) {
    this.maxAttempts = data.maxAttempts;
    this.cooldownFloorS = data.cooldownFloorS;
    this.baseS = data.baseS;
    this.factor = data.factor;
    this.capS = data.capS;
    this.jitterRatio = data.jitterRatio;
    this.codes = data.codes;
  }

  /** 从设置构建:abstract → retry.logical_max(1),否则 retry.real_max(10)。 */
  static of(repo: SettingsRepo, opts: { abstract: boolean }): RetryPolicy {
    return new RetryPolicy({
      maxAttempts: opts.abstract
        ? retrySetting(repo, "retry.logical_max")
        : retrySetting(repo, "retry.real_max"),
      cooldownFloorS: retrySetting(repo, "retry.logical_cooldown") * 60.0,
      baseS: retrySetting(repo, "retry.base_backoff_s"),
      factor: DEFAULT_FACTOR,
      capS: retrySetting(repo, "retry.max_backoff_s"),
      jitterRatio: retrySetting(repo, "retry.jitter_ratio"),
      codes: retryCodes(repo),
    });
  }

  /**
   * 三分支判定:
   * 1. reset_deadline > now + 60 → False(上游即将复位,不重试);
   * 2. retryable 显式 false → False;retryable 真值 → True;
   * 3. 否则 kind(http 名/枚举)与 http_status/status_code 与 codes 求交。
   */
  shouldRetry(exc: RetryableErrorLike, now?: number): boolean {
    const t = now ?? Date.now() / 1000;
    if (
      typeof exc.reset_deadline === "number" &&
      exc.reset_deadline > t + RESET_DEADLINE_MIN_LEAD_S
    ) {
      return false;
    }
    if (exc.retryable !== undefined && exc.retryable !== null && !exc.retryable) {
      return false;
    }
    if (exc.retryable) {
      return true;
    }
    const lowered = this.codes;
    let kind = "";
    if (typeof exc.kind === "string") {
      kind = exc.kind;
    } else if (exc.kind && typeof exc.kind === "object") {
      kind = exc.kind.value ?? exc.kind.name ?? "";
    }
    if (kind && lowered.has(kind.toLowerCase())) return true;
    const status = exc.http_status ?? exc.status_code;
    if (status !== undefined && status !== null) {
      if (lowered.has(String(status))) return true;
    }
    return false;
  }

  /** 该尝试次数的退避秒数(无 rng → 系统随机源,抖动向下)。 */
  delayFor(attempt: number): number {
    return backoffDelay({
      attempt,
      baseS: this.baseS,
      factor: this.factor,
      capS: this.capS,
      jitterRatio: this.jitterRatio,
    });
  }
}

// ---------------------------------------------------------------------------
// 随机源
// ---------------------------------------------------------------------------

/** 兜底随机源:Math.random(近似 uniform;仅缺省路径使用)。 */
export const MathRng: Rng = {
  random: () => Math.random(),
  uniform: (min, max) => min + (max - min) * Math.random(),
  shuffle: (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j]!;
      arr[j] = tmp!;
    }
  },
};

/**
 * 确定性 PRNG(mulberry32,32 位种子)。不是 Python random.Random 的 MT 复刻 ——
 * 测试注入它只求「同种子同序列」可复现,不追求与 CPython 同值。
 */
export class SeededRng implements Rng {
  private state: number;

  constructor(seed: number = 0x2f6e2b1) {
    this.state = seed >>> 0;
  }

  random(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j]!;
      arr[j] = tmp!;
    }
  }
}
