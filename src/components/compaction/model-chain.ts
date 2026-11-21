/**
 * ModelChain —— quilt 的分层模型池调度器（从 lib/model-chain.js 完整移植）。
 *
 * 与 quilt 原版的差别：
 * - **模型来源**：quilt 从 profile YAML 的 provider/model 池读；这里先从
 *   `compaction.logicalModel` 经 as-one `rt.registry.logicalModels` +
 *   `rt.scheduler.chain()` 解析出 tier/models（逻辑模型 members 按序即 tier），
 *   再由 `compaction.tiers` JSON 覆盖/补充。所有 route 都是 as-one 的
 *   logical model 名或 `provider/model` 直连键。
 * - **并发容量**：`CapacityView` 读 as-one 真实 ledger（增加并发窗口判断）。
 * - **调用**：`streamTextWithRetry` 用 ctx.llm.stream（DSH 的 llm/stream waterfall）；
 *   不引入 DSH 包的运行时 import（鸭子类型 + 本地错误形状）。
 *
 * @module src/components/compaction/model-chain
 */

import { errorChainOf } from "./errors.js";
import { countTokens, messageTokens } from "./tokenizer.js";
import { lineTokenCost } from "./stage0.js";
import { computeCooldownUntil, type CooldownStore } from "./cooldown.js";
import {
  chunkMessages,
  mergeMessages,
  fallbackInstruction,
  streamTextWithRetry,
  blocksToText,
  DEFAULT_MAX_TOKENS,
  type QuiltPromptConfig,
} from "./summarize.js";
import {
  computeOutputBudget,
  PROMPT_OVERHEAD_TOKENS,
  DEFAULT_CONTEXT_WINDOW,
} from "./budget.js";
import type { QuiltConfig, QuiltPoolModel } from "./config.js";
import type { CapacityView } from "../capacity.js";

export interface DshGenerateLike {
  provider: string;
  model: string;
  messages: unknown;
  maxTokens?: number;
  sessionId?: string;
  purpose?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
}

export interface ChainJob {
  label: string;
  text?: string;
  digests?: string[];
  meta?: Record<string, unknown>;
  preferredKey?: string;
  capTokens?: number;
  inputTokens?: number;
  buildMessages: (config: QuiltPromptConfig) => Array<{ role: "user"; content: Array<{ type: string; text?: string }> }>;
  split?: () => ChainJob[] | undefined;
}

export interface ChainResult {
  text: string;
  provider: string;
  model: string;
  usage?: unknown;
  maxTokens?: number;
  attempts?: Array<{ model: string; error: string }>;
  fallback?: boolean;
  splitInto?: number;
  models?: string[];
}

interface Task {
  index: number;
  label: string;
  meta?: Record<string, unknown>;
  buildMessages: ChainJob["buildMessages"];
  sourceText?: string;
  digests?: string[];
  inputTokens: number;
  tierIndex: number;
  running: boolean;
  done: boolean;
  aborted: boolean;
  attempts: Array<{ model: string; error: string }>;
  result?: ChainResult;
  preferredKey?: string;
  capTokens?: number;
  split?: () => ChainJob[] | undefined;
  splitDepth: number;
  splitRequested: boolean;
  parts?: Task[];
  capacityRejected: Set<string>;
  needsImmediateReschedule: boolean;
  root?: Task;
}

const MAX_SPLIT_DEPTH = 4;

function defaultNow(): number {
  return Date.now();
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
  });
}

function textStats(text: string): { chars: number; tokens: number } {
  const value = String(text);
  return { chars: value.length, tokens: countTokens(value) };
}

function fingerprint(text: string): string {
  // Node crypto 的 createHash 在 as-one 里可直接用（零新依赖）。
  // 用轻量 hash 避免 bundle 依赖 node:crypto 浏览器实现。
  const value = String(text);
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function preview(text: string, max = 80): string {
  const single = String(text).replace(/\s+/g, " ").trim();
  return single.length <= max ? single : `${single.slice(0, Math.max(0, max - 1))}…`;
}

function wakeHandle() {
  let resolve = (): void => {};
  let promise = new Promise<void>((res) => {
    resolve = res;
  });
  return {
    get promise() { return promise; },
    fire: () => resolve(),
    reset: () => {
      promise = new Promise<void>((res) => { resolve = res; });
    },
  };
}

export function describeAttempts(attempts: ReadonlyArray<{ model?: unknown; error?: unknown }>, limit = 500): string {
  if (!Array.isArray(attempts) || attempts.length === 0) return "";
  const byRoute = new Map<string, { count: number; last: unknown }>();
  for (const attempt of attempts) {
    const key = String(attempt?.model ?? "unknown");
    const entry = byRoute.get(key) ?? { count: 0, last: undefined };
    entry.count += 1;
    entry.last = attempt?.error;
    byRoute.set(key, entry);
  }
  let text = [...byRoute.entries()]
    .map(([key, entry]) => `${key} x${entry.count}${entry.last === undefined ? "" : ` (last: ${String(entry.last)})`}`)
    .join("; ");
  if (text.length > limit) text = `${text.slice(0, limit - 1)}…`;
  return text;
}

function collapsedBatchError(headline: string, attempts: unknown[]): Error {
  const summary = describeAttempts(attempts as Array<{ model?: unknown; error?: unknown }>);
  const error = new Error(summary.length > 0 ? `${headline}; attempts: ${summary}` : headline) as Error & { attempts?: unknown[] };
  error.attempts = attempts;
  return error;
}

export interface ChainContext {
  llm: {
    stream(options: DshGenerateLike): AsyncIterable<Record<string, unknown> & { type?: string; text?: string; block?: { type?: string; text?: string }; usage?: unknown; reason?: { kind?: string; failure?: { message?: string; code?: string; providerRetryAfterMs?: number } } }>;
    providerRetryPolicy?: (provider: string) => unknown;
  };
  /** as-one 适配：调用前翻译 provider/model（见 as-one-call.ts）。 */
  asOneCall?: boolean;
  asOneProvider?: string;
  logger?: {
    debug?(message: string): void;
    info?(message: string): void;
    warn?(message: string, error?: unknown): void;
    error?(message: string, error?: unknown): void;
  };
}

export interface ChainInternals {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ChainFallbackOptions {
  fallbackInput?: { messages: unknown };
  defaultSummarize?: (input: { messages: unknown }, agent: ChainAgent, signal?: AbortSignal) => Promise<{ summary: Array<{ type: string; text?: string }>; usage?: unknown; provider?: string; model?: string }>;
  capacities?: Map<string, { contextWindow: number; maxTokens: number }>;
}

export interface ChainAgent {
  session: {
    id: string;
    requestHeader?: () => { config?: { provider?: string; model?: string } } | undefined;
    toolHistory?: () => unknown[];
  };
  options?: { provider?: string; model?: string };
}

/** 将 as-one CapacityView 的占用量映射为 quilt 的 per-model inFlight（用于并发判断）。 */
function capacityUsage(capacity: CapacityView | undefined, model: QuiltPoolModel): number {
  if (!capacity) return 0;
  return capacity.usage(model.provider, model.model);
}

export class ModelChain {
  readonly config: QuiltConfig;
  private readonly store: CooldownStore;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly capacity?: CapacityView;
  private readonly tiers: QuiltConfig["tiers"];
  private readonly routes = new Map<string, QuiltPoolModel>();
  private readonly inFlight = new Map<string, number>();
  private readonly cursorByTier: number[];
  private capacities: Map<string, { contextWindow: number; maxTokens: number }> | undefined;
  private _capacitiesPromise?: Promise<Map<string, { contextWindow: number; maxTokens: number }>>;
  readonly cooldownEvents: Array<{ model: string; job: string; error: string; until: number; hours: number }> = [];
  private readonly localCooldown = new Map<string, number>();

  constructor(
    private readonly ctx: ChainContext,
    config: QuiltConfig,
    store: CooldownStore,
    internals: ChainInternals = {},
    capacities?: Map<string, { contextWindow: number; maxTokens: number }>,
    capacity?: CapacityView,
  ) {
    this.config = config;
    this.store = store;
    this.now = internals.now ?? defaultNow;
    this.sleep = internals.sleep ?? defaultSleep;
    this.tiers = config.tiers;
    this.capacity = capacity;
    this.capacities = capacities;
    for (const tier of this.tiers) {
      for (const model of tier.models) {
        this.routes.set(model.key, model);
        this.inFlight.set(model.key, 0);
      }
    }
    this.cursorByTier = this.tiers.map(() => 0);
  }

  routeCooledUntil(key: string): number {
    const stored = this.store.cooldownUntil(key);
    const local = this.localCooldown.get(key) ?? 0;
    return local > stored ? local : stored;
  }

  isRouteHealthy(key: string, now = this.now()): boolean {
    return this.routeCooledUntil(key) <= now;
  }

  async clearAllCooldowns(): Promise<void> {
    this.localCooldown.clear();
    await this.store.clearAll();
  }

  modelWindow(model: QuiltPoolModel, capacities = this.capacities): number {
    const window = capacities?.get(model.key)?.contextWindow;
    return Number.isInteger(window) && (window as number) > 0 ? (window as number) : DEFAULT_CONTEXT_WINDOW;
  }

  capacityFits(task: Task, model: QuiltPoolModel, capacities = this.capacities): boolean {
    const cap = capacities?.get(model.key);
    const window = Number.isInteger(cap?.contextWindow) && (cap?.contextWindow as number) > 0
      ? (cap?.contextWindow as number)
      : DEFAULT_CONTEXT_WINDOW;
    const maxOutput = Number.isInteger(cap?.maxTokens) && (cap?.maxTokens as number) > 0
      ? (cap?.maxTokens as number)
      : DEFAULT_MAX_TOKENS;
    const outputBudget = Math.min(maxOutput, computeOutputBudget(window));
    return (task.inputTokens ?? 0) + PROMPT_OVERHEAD_TOKENS + outputBudget <= window;
  }

  effectiveMaxTokens(task: { inputTokens?: number }, model: { key: string }, capacities = this.capacities): number {
    const cap = capacities?.get(model.key);
    const window = Number.isInteger(cap?.contextWindow) && (cap?.contextWindow as number) > 0
      ? (cap?.contextWindow as number)
      : DEFAULT_CONTEXT_WINDOW;
    const hardLimit = window - (task.inputTokens ?? 0);
    if (hardLimit <= 0) return 0;
    const modelCap = Number.isInteger(cap?.maxTokens) && (cap?.maxTokens as number) > 0
      ? (cap?.maxTokens as number)
      : DEFAULT_MAX_TOKENS;
    return Math.min(DEFAULT_MAX_TOKENS, modelCap, hardLimit);
  }

  pickChunkModel(capacities = this.capacities): QuiltPoolModel | undefined {
    const now = this.now();
    for (let tierIndex = 0; tierIndex < this.tiers.length; tierIndex += 1) {
      const tier = this.tiers[tierIndex] as { models: readonly QuiltPoolModel[] };
      const cursor = this.cursorByTier[tierIndex] as number;
      for (let offset = 0; offset < tier.models.length; offset += 1) {
        const model = tier.models[(cursor + offset) % tier.models.length] as QuiltPoolModel;
        if (!this.isRouteHealthy(model.key, now)) continue;
        const used = (this.inFlight.get(model.key) ?? 0) + capacityUsage(this.capacity, model);
        if (used < model.maxConcurrent) {
          this.cursorByTier[tierIndex] = (cursor + offset + 1) % Math.max(1, tier.models.length);
          return model;
        }
      }
    }
    return undefined;
  }

  /**
   * anchored 模式「先选模型」：按调度顺序（tier→成员序）取第一个健康的模型，
   * 用它决定是否切块及按它的窗口切块。用户 2026-11 定案「先选模型，再切块；
   * 模型列表里各模型上下文窗口不同」—— 所以切块预算必须由这一个被选中的
   * 模型的窗口决定，而不是每块各挑一个模型。
   *
   * @param minWindow 归并/单块要求的最小窗口；<=0 表示只要求健康即可。
   *                  当有多个健康模型时优先选窗口 >= minWindow 的第一个；
   *                  否则退回第一个健康模型（后续由 run 的 pickModel 按窗口
   *                  重试/再切分兜底）。
   */
  pickPrimaryModel(minWindow = 0, capacities = this.capacities): QuiltPoolModel | undefined {
    const now = this.now();
    let fallback: QuiltPoolModel | undefined;
    for (const tier of this.tiers) {
      for (const model of tier.models) {
        if (!this.isRouteHealthy(model.key, now)) continue;
        fallback ??= model;
        if (minWindow > 0 && this.modelWindow(model, capacities) >= minWindow) return model;
      }
    }
    return fallback;
  }

  /**
   * 归并模型（用户 2026-11 定案）：优先选窗口 >= 192k 的健康模型；
   * 没有则选窗口最大的健康模型。`preferredKey` 让 run 的 pickModel 锁定它。
   */
  pickMergeModel(capacities = this.capacities): QuiltPoolModel | undefined {
    const now = this.now();
    const healthy = [...this.routes.values()].filter((m) => this.isRouteHealthy(m.key, now));
    if (healthy.length === 0) return undefined;
    const big = healthy.find((m) => this.modelWindow(m, capacities) >= 192_000);
    if (big !== undefined) return big;
    return [...healthy].sort((a, b) => this.modelWindow(b, capacities) - this.modelWindow(a, capacities))[0];
  }

  canHoldMerge(mergeWindow: number, capacities = this.capacities): boolean {
    const now = this.now();
    for (const model of this.routes.values()) {
      if (!this.isRouteHealthy(model.key, now)) continue;
      if (this.modelWindow(model, capacities) >= mergeWindow) return true;
    }
    return false;
  }

  pickModel(task: Task, capacities = this.capacities): QuiltPoolModel | undefined {
    const now = this.now();
    const rejected = task.capacityRejected;
    const isRetry = task.attempts.length > 0;
    const splittable = typeof task.split === "function" && (task.splitDepth ?? 0) < MAX_SPLIT_DEPTH;
    while (task.tierIndex < this.tiers.length) {
      const tier = this.tiers[task.tierIndex] as { models: readonly QuiltPoolModel[] };
      const cursor = this.cursorByTier[task.tierIndex] as number;
      const models: QuiltPoolModel[] = [];
      if (task.preferredKey !== undefined) {
        const preferred = tier.models.find((m) => m.key === task.preferredKey);
        if (preferred !== undefined) models.push(preferred);
      }
      const rest = tier.models.filter((m) => m.key !== task.preferredKey);
      models.push(...(isRetry
        ? [...rest].sort((a, b) => this.modelWindow(b, capacities) - this.modelWindow(a, capacities))
        : rest));
      let healthyFree: QuiltPoolModel | undefined;
      let anyHealthy = false;
      let anyFitting = false;
      for (const model of models) {
        if (rejected.has(model.key)) continue;
        const healthy = this.isRouteHealthy(model.key, now);
        if (healthy) anyHealthy = true;
        const fits = this.capacityFits(task, model, capacities);
        if (healthy && fits) anyFitting = true;
        const used = (this.inFlight.get(model.key) ?? 0) + capacityUsage(this.capacity, model);
        if (healthy && used < model.maxConcurrent && fits && healthyFree === undefined) healthyFree = model;
      }
      this.cursorByTier[task.tierIndex] = (cursor + 1) % Math.max(1, tier.models.length);
      if (healthyFree !== undefined) return healthyFree;
      if (isRetry && anyHealthy && !anyFitting && splittable) {
        task.splitRequested = true;
        return undefined;
      }
      if (!anyHealthy || !anyFitting) {
        task.tierIndex += 1;
        continue;
      }
      return undefined;
    }
    return undefined;
  }

  async run(jobs: ChainJob[], agent: ChainAgent, signal?: AbortSignal, options: ChainFallbackOptions = {}): Promise<Array<ChainResult | undefined>> {
    if (jobs.length === 0) return [];
    const capacities = options.capacities ?? this.capacities ?? await this.resolveCapacities(signal);
    this.capacities = capacities;

    const makeTask = (job: ChainJob, index: number, root?: Task): Task => ({
      index,
      label: job.label,
      meta: job.meta,
      buildMessages: job.buildMessages,
      sourceText: job.text,
      digests: job.digests,
      inputTokens: job.inputTokens ?? 0,
      tierIndex: 0,
      running: false,
      done: false,
      aborted: false,
      attempts: [],
      result: undefined,
      preferredKey: job.preferredKey,
      capTokens: job.capTokens,
      split: job.split,
      splitDepth: 0,
      splitRequested: false,
      capacityRejected: new Set(),
      needsImmediateReschedule: false,
      root,
    });
    const pending: Task[] = jobs.map((job, index) => makeTask(job, index));
    for (const task of pending) task.root = task;

    const settled = (task: Task): boolean => task.done || (task.parts !== undefined && task.parts.every(settled));
    const settledTexts = (task: Task): ChainResult[] => {
      if (task.parts === undefined) return task.result === undefined ? [] : [task.result];
      return task.parts.flatMap(settledTexts);
    };
    const markSubtreeDone = (task: Task): void => {
      task.done = true;
      for (const part of task.parts ?? []) markSubtreeDone(part);
    };
    const combineParts = (task: Task): ChainResult => {
      const parts = settledTexts(task);
      const first = parts[0];
      return {
        text: parts.map((part) => part.text).join("\n\n"),
        provider: first?.provider ?? "",
        model: first?.model ?? "",
        usage: undefined,
        maxTokens: first?.maxTokens,
        attempts: parts.flatMap((part) => part.attempts ?? []),
        fallback: parts.some((part) => part.fallback === true),
        splitInto: parts.length,
        models: [...new Set(parts.map((part) => `${part.provider}/${part.model}`))],
      };
    };

    const results = new Array<ChainResult | undefined>(jobs.length);
    const collectAttempts = () => pending.flatMap((task) => task.attempts);
    const wake = wakeHandle();
    let cooldownSerial = 0;
    const batchStartedAt = Date.now();
    const callsByRoute = new Map<string, number>();
    let totalCalls = 0;
    let failureCount = 0;
    let fallbackUsed = false;

    const armCooldownWake = () => {
      const serial = ++cooldownSerial;
      const now = this.now();
      let earliest = Infinity;
      for (const key of this.routes.keys()) {
        const until = this.routeCooledUntil(key);
        if (until > now && until < earliest) earliest = until;
      }
      if (earliest === Infinity) return;
      void this.sleep(Math.max(0, earliest - now)).then(() => {
        if (serial === cooldownSerial) wake.fire();
      });
    };

    const startCall = (task: Task, model: QuiltPoolModel, caps: Map<string, { contextWindow: number; maxTokens: number }>): boolean => {
      const messages = task.buildMessages(this.config);
      const actualInputTokens = messages.reduce((sum, message) => sum + messageTokens(message), 0);
      const maxTokens = this.effectiveMaxTokens({ inputTokens: actualInputTokens }, model, caps);
      if (maxTokens <= 0) {
        task.capacityRejected.add(model.key);
        task.needsImmediateReschedule = true;
        this.ctx.logger?.warn?.(`[as-one compaction] route ${model.key} cannot hold job=${task.label} (real input ${actualInputTokens} >= window)`);
        return false;
      }
      task.running = true;
      this.inFlight.set(model.key, (this.inFlight.get(model.key) ?? 0) + 1);
      callsByRoute.set(model.key, (callsByRoute.get(model.key) ?? 0) + 1);
      totalCalls += 1;
      const options: DshGenerateLike = {
        provider: model.provider,
        model: model.model,
        messages,
        maxTokens,
        sessionId: agent.session.id,
        purpose: "compaction",
        ...(signal === undefined ? {} : { signal }),
      };
      const inputText = task.sourceText ?? (task.digests ?? []).join("\n\n");
      const input = textStats(inputText);
      const startedAt = Date.now();
      this.ctx.logger?.debug?.(`[as-one compaction] call job=${task.label} route=${model.key} inputTokens~=${input.tokens} maxTokens=${maxTokens} sha=${fingerprint(inputText)} preview="${preview(inputText)}"`);
      void (async () => {
        try {
          const { summary, usage } = await streamTextWithRetry(this.ctx, options);
          const text = blocksToText(summary);
          this.ctx.logger?.debug?.(`[as-one compaction] call ok job=${task.label} route=${model.key} outputChars=${text.length} durationMs=${Date.now() - startedAt}`);
          task.result = {
            text,
            provider: model.provider,
            model: model.model,
            usage,
            maxTokens,
            attempts: task.attempts,
          };
          task.done = true;
        } catch (error) {
          if (signal?.aborted === true) {
            task.aborted = true;
            this.ctx.logger?.debug?.(`[as-one compaction] call aborted job=${task.label} route=${model.key}`);
          } else {
            failureCount += 1;
            const until = computeCooldownUntil(model.cooldownHours, this.now());
            try {
              await this.store.applyCooldown(model.key, until);
            } catch (storeError) {
              this.localCooldown.set(model.key, until);
              this.ctx.logger?.warn?.(`[as-one compaction] cooldown write failed for ${model.key}: ${errorChainOf(storeError)}; quarantining locally`);
            }
            const reason = errorChainOf(error);
            // 带上错误正文:此前只有错误「族」,`As One 没有这个模型:xxx` 这类
            // 关键线索被吞掉,只能靠加临时日志才发现(2026-11-21)。
            const detail = String((error as Error)?.message ?? error).slice(0, 300);
            this.ctx.logger?.warn?.(`[as-one compaction] route ${model.key} failed (${reason}: ${detail}) for job=${task.label}; cooling`);
            this.cooldownEvents.push({ model: model.key, job: task.label, error: reason, until, hours: model.cooldownHours });
            task.attempts.push({ model: model.key, error: reason });
            task.running = false;
          }
        } finally {
          task.running = false;
          this.inFlight.set(model.key, Math.max(0, (this.inFlight.get(model.key) ?? 1) - 1));
          wake.fire();
        }
      })();
      return true;
    };

    try {
      for (;;) {
        signal?.throwIfAborted();
        wake.reset();
        armCooldownWake();
        let dispatchedAny = false;
        const blocked: Task[] = [];
        for (const task of pending) {
          if (task.parts !== undefined || task.done || task.running) continue;
          if (task.splitRequested) {
            task.splitRequested = false;
            const halves = typeof task.split === "function" ? task.split() : undefined;
            if (halves === undefined || halves.length < 2) {
              task.split = undefined;
              task.needsImmediateReschedule = true;
              blocked.push(task);
              continue;
            }
            const parts = halves.map((job) => {
              const part = makeTask(job, -1, task.root);
              part.attempts = [...task.attempts];
              part.splitDepth = (task.splitDepth ?? 0) + 1;
              return part;
            });
            task.parts = parts;
            pending.push(...parts);
            dispatchedAny = true;
            continue;
          }
          const model = this.pickModel(task, capacities);
          if (model !== undefined) {
            if (startCall(task, model, capacities)) dispatchedAny = true;
            else blocked.push(task);
          } else {
            blocked.push(task);
          }
        }
        for (const task of pending) {
          if (task.parts === undefined || task.done) continue;
          if (!task.parts.every(settled)) continue;
          task.result = combineParts(task);
          task.done = true;
        }
        const running = pending.some((task) => task.running);
        const activeCount = pending.filter((task) => task.parts === undefined && !task.done && !task.running).length;
        if (!running && pending.every(settled)) break;
        const fullyDegraded = blocked.length > 0 && blocked.length === activeCount && blocked.every((task) => task.tierIndex >= this.tiers.length);
        if (fullyDegraded && !running) {
          const target = sessionTarget(agent);
          if (this.config.fallbackToSessionModel) {
            if (target === undefined) {
              throw collapsedBatchError("[as-one compaction] all tiers have no healthy model and no session-model target for fallback", collectAttempts());
            }
            fallbackUsed = true;
            let collapsed: ChainResult;
            try {
              collapsed = await this.fallbackCall(blocked, target, agent, signal, options);
            } catch (error) {
              if (signal?.aborted !== true && error instanceof Error && !Array.isArray((error as Error & { attempts?: unknown }).attempts)) {
                (error as Error & { attempts?: unknown }).attempts = collectAttempts();
              }
              throw error;
            }
            for (const root of new Set(blocked.map((task) => task.root as Task))) {
              const finished = settledTexts(root);
              root.result = {
                text: [...finished.map((part) => part.text), collapsed.text].join("\n\n"),
                provider: collapsed.provider,
                model: collapsed.model,
                usage: collapsed.usage,
                maxTokens: collapsed.maxTokens,
                attempts: [...(collapsed.attempts ?? [])],
                fallback: true,
                collapsedFrom: blocked.length,
              } as ChainResult;
              markSubtreeDone(root);
            }
            break;
          }
          throw collapsedBatchError("[as-one compaction] all tiers have no healthy model and session-model fallback is disabled", collectAttempts());
        }
        if (!running && blocked.some((task) => task.needsImmediateReschedule || task.splitRequested)) continue;
        await wake.promise;
        void dispatchedAny;
      }
      for (const task of pending) {
        if (task.result !== undefined && task.index >= 0) results[task.index] = task.result;
      }
      this.ctx.logger?.info?.(`[as-one compaction] batch jobs=${jobs.length} calls=${totalCalls} byRoute=${[...callsByRoute.entries()].map(([k, c]) => `${k}:${c}`).join(",")} failures=${failureCount} fallback=${fallbackUsed} durationMs=${Date.now() - batchStartedAt}`);
      return results;
    } catch (error) {
      if (error instanceof Error && !Array.isArray((error as Error & { cooldownEvents?: unknown }).cooldownEvents) && this.cooldownEvents.length > 0) {
        try {
          (error as Error & { cooldownEvents?: unknown }).cooldownEvents = [...this.cooldownEvents];
        } catch { /* frozen error */ }
      }
      throw error;
    } finally {
      cooldownSerial += 1;
    }
  }

  private async resolveCapacities(signal?: AbortSignal): Promise<Map<string, { contextWindow: number; maxTokens: number }>> {
    if (this.capacities !== undefined) return this.capacities;
    this._capacitiesPromise ??= (async () => {
      const capacities = new Map<string, { contextWindow: number; maxTokens: number }>();
      for (const [key] of this.routes) {
        // 没有 ctx.llm.resolveModelInfo 的鸭子类型保障：保守用默认窗口。
        capacities.set(key, { contextWindow: DEFAULT_CONTEXT_WINDOW, maxTokens: DEFAULT_MAX_TOKENS });
      }
      void signal;
      return capacities;
    })();
    return this._capacitiesPromise;
  }

  private async fallbackCall(
    tasks: Task[],
    target: { provider: string; model: string },
    agent: ChainAgent,
    signal: AbortSignal | undefined,
    options: ChainFallbackOptions,
  ): Promise<ChainResult> {
    const summarize = options.defaultSummarize;
    if (summarize !== undefined && options.fallbackInput !== undefined) {
      const result = await summarize(options.fallbackInput, agent, signal);
      return {
        text: blocksToText(result.summary),
        provider: result.provider ?? target.provider,
        model: result.model ?? target.model,
        usage: result.usage,
        attempts: tasks.flatMap((task) => task.attempts),
        fallback: true,
      };
    }
    const texts: string[] = [];
    for (const task of tasks) {
      if (task.label === "merge") texts.push(`--- digest ---\n${(task.digests ?? []).join("\n\n")}`);
      else texts.push(task.sourceText ?? "");
    }
    const joined = texts.join("\n\n");
    const callMessages = [
      { role: "user" as const, content: [{ type: "text", text: joined }] },
      { role: "user" as const, content: [{ type: "text", text: fallbackInstruction(this.config) }] },
    ];
    const actualInputTokens = callMessages.reduce((sum, message) => sum + messageTokens(message), 0);
    const maxTokens = this.effectiveMaxTokens({ inputTokens: actualInputTokens }, { key: `${target.provider}/${target.model}` });
    if (maxTokens <= 0) throw new Error(`[as-one compaction] session-model fallback cannot hold the region (input ${actualInputTokens} >= window)`);
    const { summary, usage } = await streamTextWithRetry(this.ctx, {
      provider: target.provider,
      model: target.model,
      messages: callMessages,
      maxTokens,
      sessionId: agent.session.id,
      purpose: "compaction",
      ...(signal === undefined ? {} : { signal }),
    });
    return {
      text: blocksToText(summary),
      provider: target.provider,
      model: target.model,
      usage,
      attempts: tasks.flatMap((task) => task.attempts),
      fallback: true,
    };
  }
}

/** 会话模型 target（requestHeader config 优先，否则 agent.options）。 */
export function sessionTarget(agent: ChainAgent): { provider: string; model: string } | undefined {
  const header = agent.session.requestHeader?.();
  const config = header?.config;
  if (config !== undefined && typeof config.provider === "string" && config.provider.length > 0
    && typeof config.model === "string" && config.model.length > 0) {
    return { provider: config.provider, model: config.model };
  }
  if (agent.options?.provider !== undefined && agent.options.provider.length > 0
    && agent.options?.model !== undefined && agent.options.model.length > 0) {
    return { provider: agent.options.provider, model: agent.options.model };
  }
  return undefined;
}

/** 建一个 chunk job（v7 model-bound + split retry）。 */
export function chunkJob(
  label: string,
  text: string,
  meta: Record<string, unknown>,
  preferredKey: string,
  capTokens: number,
  /** 单块专用提示词（anchored 只有一块时传；用一次成稿替代 tier-1 chunk digest）。 */
  promptOverride?: string,
): ChainJob {
  const ownTokens = (meta.tokens as number | undefined) ?? textStats(text).tokens;
  const lineTokens = String(text).split("\n").reduce((sum, line) => sum + lineTokenCost(line), 0);
  const job: ChainJob = {
    label,
    text,
    meta,
    preferredKey,
    capTokens,
    inputTokens: ownTokens,
    buildMessages: (config) =>
      promptOverride !== undefined
        ? [{ role: "user" as const, content: [{ type: "text" as const, text }] },
           { role: "user" as const, content: [{ type: "text" as const, text: promptOverride }] }]
        : chunkMessages(text, config, job.capTokens),
    split: () => {
      const lines = String(text).split("\n");
      if (lines.length < 2) return undefined;
      const mid = Math.max(1, Math.floor(lines.length / 2));
      const halves = [lines.slice(0, mid), lines.slice(mid)];
      const shares = halves.map((halfLines) => halfLines.reduce((sum, line) => sum + lineTokenCost(line), 0));
      const measure = Math.max(1, lineTokens);
      const childTokens = shares.map((share) => Math.floor(ownTokens * share / measure));
      if (childTokens.some((tokens) => tokens < 1 || tokens >= ownTokens)) return undefined;
      const lineStart = meta.lineStart as number | undefined;
      const lineEnd = meta.lineEnd as number | undefined;
      return halves.map((halfLines, index) => {
        const tokens = childTokens[index] as number;
        const childMeta = {
          ...meta,
          tokens,
          ...(lineStart === undefined || lineEnd === undefined ? {} : {
            lineStart: index === 0 ? lineStart : lineStart + mid,
            lineEnd: index === 0 ? lineStart + mid : lineEnd,
          }),
        };
        const childCap = Math.max(1, Math.floor(capTokens * (shares[index] as number) / measure));
        return chunkJob(`${label}/2-${index + 1}`, halfLines.join("\n"), childMeta, preferredKey, childCap);
      });
    },
  };
  return job;
}

/** 建 merge job。 */
export function mergeJob(digests: string[], meta: Record<string, unknown>): ChainJob {
  const joined = digests.join("\n\n");
  return {
    label: "merge",
    digests,
    meta,
    inputTokens: textStats(joined).tokens,
    buildMessages: (config) => mergeMessages(digests, config),
  };
}
