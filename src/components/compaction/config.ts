/**
 * 压缩引擎配置的纯函数校验（从 dsh-quilt-compact/lib/config.js 搬入）。
 *
 * 原版用 `@deepseek-ai/schemastery` + `zod` 做 load-time 校验；as-one 不引入
 * 这两个依赖（宿主也没有 zod），这里把 schema 全部改写成等价的纯函数：
 * defaults 在 resolveConfig 里解析，未知键 / 坏类型 still fail loud。
 *
 * 设置来源：as-one 的 `setting` 表，由 readCompactionConfig() 从 getSetting 读
 * `compaction.tiers` (JSON) 与 `compaction.logicalModel` 装配成 tiers。
 *
 * @module src/components/compaction/config
 */

import type { CompactionPromptMode } from "../../../core/config/types.js";
import type { ProviderRegistry } from "../../../core/config/providers.js";

/** 单个模型池路由（对齐 quilt 的 model entry，key = provider/model）。 */
export interface QuiltPoolModel {
  provider: string;
  model: string;
  maxConcurrent: number;
  cooldownHours: number;
  key: string;
}

/** 一层 tier。 */
export interface QuiltPoolTier {
  name: string;
  models: readonly QuiltPoolModel[];
}

/** Stage 0 预处理配置。 */
export interface QuiltPreprocessing {
  dedup: boolean;
  purgeErrors: boolean;
  astSkeleton: { enabled: boolean; maxDepth: number };
  logCondense: { mode: "balanced" | "head" | "tail"; maxLines: number };
}

/** JSONL 运行日志配置（默认关）。 */
export interface QuiltRunRecord {
  enabled: boolean;
  maxEntries: number;
  snapshotChars: number;
  path: string;
}

/** 完整 resolved config（不可变）。 */
export interface QuiltConfig {
  chunkRatio: number;
  chunkOverlapRatio: number;
  fallbackToSessionModel: boolean;
  chunkPromptSuffix: string;
  mergePromptSuffix: string;
  tiers: readonly QuiltPoolTier[];
  mergeMaxContextTokens: number;
  preprocessing: QuiltPreprocessing;
  runRecord: QuiltRunRecord;
  deprecatedPreprocessing: readonly string[];
  deprecatedConfig: readonly string[];
}

/** 组件设置（hot-read，从 setting 表）。 */
export interface CompactionComponentConfig {
  enabled: boolean;
  promptMode: CompactionPromptMode;
  /** 逻辑模型名（as-one registry / scheduler.chain() 的入口）；空 = 未指定。 */
  logicalModel: string;
  /** quilt tier 池（由 compaction.tiers JSON 解析并校验）。 */
  tiers: QuiltPoolTier[];
  /** 归并窗口（token），默认 128000。 */
  mergeMaxContextTokens: number;
}

const DEFAULT_CHUNK_RATIO = 0.8;
const DEFAULT_CHUNK_OVERLAP_RATIO = 0.1;
const DEFAULT_MERGE_MAX_CONTEXT_TOKENS = 128000;
const DEFAULT_FALLBACK_TO_SESSION_MODEL = true;
const DEFAULT_COOLDOWN_HOURS = 1;

const DEFAULT_PREPROCESSING: QuiltPreprocessing = {
  dedup: true,
  purgeErrors: true,
  astSkeleton: { enabled: false, maxDepth: 2 },
  logCondense: { mode: "balanced", maxLines: 200 },
};

const DEFAULT_RUN_RECORD: QuiltRunRecord = {
  enabled: false,
  maxEntries: 200,
  snapshotChars: 0,
  path: "",
};

const CONFIG_KEYS = new Set([
  "chunkRatio",
  "chunkOverlapRatio",
  "fallbackToSessionModel",
  "chunkPromptSuffix",
  "mergePromptSuffix",
  "tiers",
  "mergeMaxContextTokens",
  "preprocessing",
  "runRecord",
]);
const DEPRECATED_CONFIG_KEYS = new Set(["mergeTiers"]);
const MODEL_KEYS = new Set(["provider", "model", "maxConcurrent", "cooldownHours"]);
const TIER_KEYS = new Set(["name", "models"]);
const PREPROCESSING_KEYS = new Set(["dedup", "purgeErrors", "astSkeleton", "logCondense"]);
const DEPRECATED_PREPROCESSING_KEYS = new Set(["headMiddleTail"]);
const AST_SKELETON_KEYS = new Set(["enabled", "maxDepth"]);
const LOG_CONDENSE_KEYS = new Set(["mode", "maxLines"]);
const RUN_RECORD_KEYS = new Set(["enabled", "maxEntries", "snapshotChars", "path"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateKeys(config: Record<string, unknown>, keys: Set<string>, name: string): void {
  for (const key of Object.keys(config)) {
    if (!keys.has(key)) throw new Error(`${name}: unknown key "${key}"`);
  }
}

function assertNonEmptyString(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertNonNegativeInteger(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} (${String(value)}) must be a non-negative integer`);
  }
}

function assertRatio(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${name} (${String(value)}) must be a number in (0, 1]`);
  }
}

/** Unwrap a schemastery volatile reference (kept for source compatibility). */
export function readConfigValue(value: unknown): unknown {
  return isRecord(value) && typeof value.get === "function" ? value.get() : value;
}

function resolveTiers(configured: unknown): readonly QuiltPoolTier[] {
  if (configured === undefined) {
    throw new Error("QuiltCompactConfig.tiers is required: the model pool must declare at least one tier");
  }
  if (!Array.isArray(configured) || configured.length === 0) {
    throw new Error("QuiltCompactConfig.tiers must be a non-empty array");
  }
  const seenNames = new Set<string>();
  const seenRoutes = new Set<string>();
  return configured.map((tier, index) => {
    if (!isRecord(tier)) throw new Error(`QuiltCompactConfig.tiers[${index}] must be an object`);
    validateKeys(tier, TIER_KEYS, `QuiltCompactConfig.tiers[${index}]`);
    assertNonEmptyString(`QuiltCompactConfig.tiers[${index}].name`, tier.name);
    if (seenNames.has(tier.name)) throw new Error(`QuiltCompactConfig: duplicate tier name "${tier.name}"`);
    seenNames.add(tier.name);
    if (!Array.isArray(tier.models) || tier.models.length === 0) {
      throw new Error(`QuiltCompactConfig.tiers[${index}] (${tier.name}): models must be a non-empty array`);
    }
    const models: QuiltPoolModel[] = tier.models.map((source, modelIndex) => {
      if (!isRecord(source)) {
        throw new Error(`QuiltCompactConfig.tiers[${index}].models[${modelIndex}] must be an object`);
      }
      // 允许已经 resolve 过的模型条目（带 key）再次进入，保持 toQuiltConfig 幂等。
      validateKeys(source, new Set([...MODEL_KEYS, "key"]), `QuiltCompactConfig.tiers[${index}].models[${modelIndex}]`);
      assertNonEmptyString("...models[].provider", source.provider);
      assertNonEmptyString("...models[].model", source.model);
      const maxConcurrent = source.maxConcurrent ?? 1;
      if (typeof maxConcurrent !== "number" || !Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
        throw new Error(`...models[${modelIndex}].maxConcurrent must be a positive integer`);
      }
      const cooldownHours = source.cooldownHours ?? DEFAULT_COOLDOWN_HOURS;
      if (typeof cooldownHours !== "number" || !Number.isFinite(cooldownHours) || cooldownHours <= 0) {
        throw new Error(`...models[${modelIndex}].cooldownHours must be a positive finite number`);
      }
      const key = typeof source.key === "string" && source.key.length > 0
        ? source.key
        : `${source.provider}/${source.model}`;
      if (seenRoutes.has(key)) throw new Error(`QuiltCompactConfig: duplicate pool route "${key}"`);
      seenRoutes.add(key);
      return Object.freeze({ provider: source.provider, model: source.model, maxConcurrent, cooldownHours, key });
    });
    return Object.freeze({ name: tier.name, models: Object.freeze(models) });
  });
}

function resolvePreprocessing(configured: unknown): { value: QuiltPreprocessing; deprecated: string[] } {
  if (configured === undefined) return { value: { ...DEFAULT_PREPROCESSING }, deprecated: [] };
  if (!isRecord(configured)) throw new Error("QuiltCompactConfig.preprocessing must be an object");
  validateKeys(
    configured,
    new Set([...PREPROCESSING_KEYS, ...DEPRECATED_PREPROCESSING_KEYS]),
    "QuiltCompactConfig.preprocessing",
  );
  const deprecated = Object.keys(configured).filter((key) => DEPRECATED_PREPROCESSING_KEYS.has(key));
  const astSkeleton = configured.astSkeleton ?? DEFAULT_PREPROCESSING.astSkeleton;
  if (!isRecord(astSkeleton)) throw new Error("QuiltCompactConfig.preprocessing.astSkeleton must be an object");
  validateKeys(astSkeleton, AST_SKELETON_KEYS, "QuiltCompactConfig.preprocessing.astSkeleton");
  const ast = {
    enabled: astSkeleton.enabled ?? DEFAULT_PREPROCESSING.astSkeleton.enabled,
    maxDepth: astSkeleton.maxDepth ?? DEFAULT_PREPROCESSING.astSkeleton.maxDepth,
  };
  if (typeof ast.enabled !== "boolean") throw new Error("...astSkeleton.enabled must be a boolean");
  assertNonNegativeInteger("...astSkeleton.maxDepth", ast.maxDepth);
  const logCondense = configured.logCondense ?? DEFAULT_PREPROCESSING.logCondense;
  if (!isRecord(logCondense)) throw new Error("QuiltCompactConfig.preprocessing.logCondense must be an object");
  validateKeys(logCondense, LOG_CONDENSE_KEYS, "QuiltCompactConfig.preprocessing.logCondense");
  const mode = logCondense.mode ?? DEFAULT_PREPROCESSING.logCondense.mode;
  if (mode !== "balanced" && mode !== "head" && mode !== "tail") {
    throw new Error(`...logCondense.mode must be 'balanced', 'head', or 'tail', got ${String(mode)}`);
  }
  const maxLines = logCondense.maxLines ?? DEFAULT_PREPROCESSING.logCondense.maxLines;
  assertNonNegativeInteger("...logCondense.maxLines", maxLines);
  const dedup = configured.dedup ?? DEFAULT_PREPROCESSING.dedup;
  if (typeof dedup !== "boolean") throw new Error("...dedup must be a boolean");
  const purgeErrors = configured.purgeErrors ?? DEFAULT_PREPROCESSING.purgeErrors;
  if (typeof purgeErrors !== "boolean") throw new Error("...purgeErrors must be a boolean");
  return {
    value: Object.freeze({
      dedup,
      purgeErrors,
      astSkeleton: Object.freeze(ast as QuiltPreprocessing["astSkeleton"]),
      logCondense: Object.freeze({ mode, maxLines } as QuiltPreprocessing["logCondense"]),
    }),
    deprecated,
  };
}

function resolveRunRecord(configured: unknown): QuiltRunRecord {
  if (configured === undefined) return { ...DEFAULT_RUN_RECORD };
  if (!isRecord(configured)) throw new Error("QuiltCompactConfig.runRecord must be an object");
  validateKeys(configured, RUN_RECORD_KEYS, "QuiltCompactConfig.runRecord");
  const enabled = configured.enabled as boolean | undefined ?? DEFAULT_RUN_RECORD.enabled;
  if (typeof enabled !== "boolean") throw new Error("...runRecord.enabled must be a boolean");
  const maxEntries = (configured.maxEntries as number | undefined) ?? DEFAULT_RUN_RECORD.maxEntries;
  assertNonNegativeInteger("...runRecord.maxEntries", maxEntries);
  if ((maxEntries as number) < 1) throw new Error("...runRecord.maxEntries must be >= 1");
  const snapshotChars = (configured.snapshotChars as number | undefined) ?? DEFAULT_RUN_RECORD.snapshotChars;
  assertNonNegativeInteger("...runRecord.snapshotChars", snapshotChars);
  const path = configured.path ?? DEFAULT_RUN_RECORD.path;
  if (typeof path !== "string") throw new Error("...runRecord.path must be a string");
  return Object.freeze({ enabled, maxEntries: maxEntries as number, snapshotChars: snapshotChars as number, path });
}

/** Resolve + validate raw quilt config (pure-function rewrite of schemastery schema). */
export function resolveConfig(rawConfig: Record<string, unknown> = {}): QuiltConfig {
  if (!isRecord(rawConfig)) throw new Error("QuiltCompactConfig must be an object");
  validateKeys(rawConfig, new Set([...CONFIG_KEYS, ...DEPRECATED_CONFIG_KEYS]), "QuiltCompactConfig");
  const deprecatedConfig = Object.keys(rawConfig).filter((key) => DEPRECATED_CONFIG_KEYS.has(key));

  const chunkRatio = (rawConfig.chunkRatio as number | undefined) ?? DEFAULT_CHUNK_RATIO;
  assertRatio("QuiltCompactConfig.chunkRatio", chunkRatio);
  const chunkOverlapRatio = rawConfig.chunkOverlapRatio ?? DEFAULT_CHUNK_OVERLAP_RATIO;
  if (typeof chunkOverlapRatio !== "number" || !Number.isFinite(chunkOverlapRatio) || chunkOverlapRatio < 0 || chunkOverlapRatio >= 1) {
    throw new Error(`QuiltCompactConfig.chunkOverlapRatio (${String(chunkOverlapRatio)}) must be a finite number in [0, 1)`);
  }
  const fallbackToSessionModel = rawConfig.fallbackToSessionModel ?? DEFAULT_FALLBACK_TO_SESSION_MODEL;
  if (typeof fallbackToSessionModel !== "boolean") throw new Error("...fallbackToSessionModel must be a boolean");
  if (rawConfig.chunkPromptSuffix !== undefined && typeof rawConfig.chunkPromptSuffix !== "string") {
    throw new Error("...chunkPromptSuffix must be a string");
  }
  if (rawConfig.mergePromptSuffix !== undefined && typeof rawConfig.mergePromptSuffix !== "string") {
    throw new Error("...mergePromptSuffix must be a string");
  }

  const tiers = resolveTiers(rawConfig.tiers);
  const mergeMaxContextTokens = rawConfig.mergeMaxContextTokens ?? DEFAULT_MERGE_MAX_CONTEXT_TOKENS;
  if (typeof mergeMaxContextTokens !== "number" || !Number.isInteger(mergeMaxContextTokens) || mergeMaxContextTokens < 1) {
    throw new Error(`QuiltCompactConfig.mergeMaxContextTokens (${String(mergeMaxContextTokens)}) must be a positive integer`);
  }
  const preprocessing = resolvePreprocessing(rawConfig.preprocessing);
  const runRecord = resolveRunRecord(rawConfig.runRecord);

  return Object.freeze({
    chunkRatio: chunkRatio as number,
    chunkOverlapRatio,
    fallbackToSessionModel,
    chunkPromptSuffix: (rawConfig.chunkPromptSuffix as string) ?? "",
    mergePromptSuffix: (rawConfig.mergePromptSuffix as string) ?? "",
    tiers,
    mergeMaxContextTokens,
    preprocessing: preprocessing.value,
    runRecord,
    deprecatedPreprocessing: Object.freeze(preprocessing.deprecated),
    deprecatedConfig: Object.freeze(deprecatedConfig),
  });
}

/** 设置键默认值（与 core/config/types.ts COMPONENT_DEFAULTS 同源）。 */
export const COMPACTION_DEFAULTS = {
  enabled: true,
  promptMode: "default" as CompactionPromptMode,
  logicalModel: "",
  mergeMaxContextTokens: DEFAULT_MERGE_MAX_CONTEXT_TOKENS,
};

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * 从组件设置键读配置。`compaction.tiers` 是 JSON 数组，元素形如
 * `{ name, models: [{ provider, model, maxConcurrent?, cooldownHours? }] }`。
 * 校验失败 → 抛错，由 applyCompaction 捕获后禁用增强（宿主原摘要照常）。
 */
export function readCompactionConfig(getSetting: (key: string) => string | null): CompactionComponentConfig {
  const rawMode = (getSetting("compaction.promptMode") ?? COMPACTION_DEFAULTS.promptMode).trim().toLowerCase();
  // 三档：default（一次压完） / anchored（分块+锚点） / quilt（分块不带锚点）。
  // 未知值回落到 default —— 它是"最像宿主自带压缩"的那一档，最不会让人意外。
  const promptMode: CompactionPromptMode =
    rawMode === "anchored" ? "anchored" : rawMode === "quilt" ? "quilt" : "default";
  const rawMerge = getSetting("compaction.mergeMaxContextTokens");
  const mergeMaxContextTokens = rawMerge !== null && Number.isSafeInteger(Number(rawMerge)) && Number(rawMerge) > 0
    ? Number(rawMerge)
    : DEFAULT_MERGE_MAX_CONTEXT_TOKENS;
  // 2026-11 用户定案：「逻辑模型和压缩模式已经提供了所有信息」——
  //   - 逻辑模型复用辅助请求路由卡的 `route.compact`（唯一真源，不再有 compaction.logicalModel）；
  //   - tiers 由该逻辑模型的 members 自动推导（不再有 compaction.tiers JSON）；
  //   - 恒启用（不再有 compaction.enabled 开关）：选了压缩逻辑模型就生效。
  const logicalModel = (getSetting("route.compact") ?? "").trim();
  return {
    enabled: logicalModel !== "",
    promptMode,
    logicalModel,
    tiers: [],
    mergeMaxContextTokens,
  };
}

/**
 * 从 as-one 的 registry 解析 `compaction.logicalModel` 的 members 成 quilt tier。
 *
 * 逻辑模型 members 的**数组顺序即优先级**（core/config/types.ts ChainMember），
 * 直接映射为 quilt 的单一 tier；每个 member 的 `maxConcurrent` 交给
 * CapacityView 的真实在途判断，这里给保守值 1，`cooldownHours` 用默认 1。
 * 若逻辑模型不存在 / 没有 members → 返回空数组（由调用方决定是否禁用增强）。
 */
export function tiersFromLogicalModel(registry: ProviderRegistry, logicalModel: string): QuiltPoolTier[] {
  const name = logicalModel.trim();
  if (name === "") return [];
  const members = registry.membersOf(name);
  if (members.length === 0) return [];
  const models: QuiltPoolModel[] = members.map((member) => ({
    provider: member.provider,
    model: member.model,
    key: `${member.provider}/${member.model}`,
    maxConcurrent: registry.getRealModel(member.provider, member.model)?.concurrency ?? 1,
    cooldownHours: DEFAULT_COOLDOWN_HOURS,
  }));
  return [Object.freeze({ name, models: Object.freeze(models) })];
}

/** 由组件设置 + quilt resolved config 合成引擎配置。 */
export function toQuiltConfig(comp: CompactionComponentConfig): QuiltConfig {
  return resolveConfig({ tiers: comp.tiers as unknown as Record<string, unknown>[], mergeMaxContextTokens: comp.mergeMaxContextTokens });
}
