/**
 * subagent-limit —— 按模型限制 subagent 并发，嵌入 as-one。
 *
 * 从归档的独立插件 dsh-subagent-model-limit 搬入，改了两点：
 *   1. 账本从插件自带的 Gate 换成 as-one 的 CapacityView（读真实 rt.ledger）；
 *   2. 超限抛 HarnessError(msg, 'ABORTED') —— DSH 里 ABORTED 不在默认重试码
 *      （EMPTY_RESPONSE/RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT），不会被自动重试。
 *
 * 拦截点：ctx.on('tools/execute', ...)，匹配 subagent / subagent_fork。
 * 模型归属：工具参数 provider/model 优先，其次父会话当前模型，最后兜底 *。
 *
 * 计数 = as-one ledger 真实在途 + 本进程 pending 预留（解决批准到落账的时间窗）。
 * 预留用 AsyncLocalStorage 从 tools/execute 传到 subagent/start，再由 subagent/end 精确释放。
 *
 * @module src/components/subagent-limit
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "cordis";
import type { CapacityView } from "./capacity.js";
import type { SubagentLimitRule } from "../../core/config/types.js";

const FALLBACK = "*";
const DEFAULT_TOOL_NAMES = ["subagent", "subagent_fork"];

/**
 * 不可重试错误 —— 结构与 DSH 的 `HarnessError` 一致（message + code），
 * 但不 import 宿主包（as-one 的 tsconfig 不声明 dsh-llm 类型）。
 * code='ABORTED' 不在 DSH 默认重试码列表里，工具失败后不会被自动重试。
 */
export class AbortedError extends Error {
  readonly code = "ABORTED";
  constructor(message: string) {
    super(message);
    this.name = "AbortedError";
  }
}

/** 组件配置（从 setting 表读，热读）。 */
export interface SubagentLimitConfig {
  enabled: boolean;
  defaultLimit: number;
  limits: SubagentLimitRule[];
  countMainAgent: boolean;
  toolNames: string[];
}

export const SUBAGENT_LIMIT_DEFAULTS: SubagentLimitConfig = {
  enabled: true,
  defaultLimit: 4,
  limits: [],
  countMainAgent: true,
  toolNames: [...DEFAULT_TOOL_NAMES],
};

/* ------------------------------------------------------------ 模型解析 */

export interface ResolvedModel {
  provider: string | undefined;
  model: string | undefined;
  source: "arguments" | "agent.model" | "fallback";
}

/** 解析这次 subagent 调用落在哪个模型上。 */
export function resolveModel(exec: {
  arguments?: unknown;
  agent?: { model?: { current?: () => unknown } };
}): ResolvedModel {
  const args = exec?.arguments as Record<string, unknown> | undefined;
  const argProvider =
    args && typeof args.provider === "string" && args.provider !== "" ? args.provider : undefined;
  const argModel =
    args && typeof args.model === "string" && args.model !== "" ? args.model : undefined;

  if (argModel !== undefined) {
    return { provider: argProvider, model: argModel, source: "arguments" };
  }

  let selection: unknown;
  try {
    selection = exec?.agent?.model?.current?.();
  } catch {
    selection = undefined;
  }
  if (
    selection !== null &&
    typeof selection === "object" &&
    typeof (selection as { model?: unknown }).model === "string" &&
    (selection as { model: string }).model !== ""
  ) {
    const s = selection as { provider?: unknown; model: string };
    const provider = typeof s.provider === "string" && s.provider !== "" ? s.provider : undefined;
    return { provider, model: s.model, source: "agent.model" };
  }

  return { provider: undefined, model: undefined, source: "fallback" };
}

/* ------------------------------------------------------------ 配额匹配 */

/** 四级匹配：精确 provider+model → provider 通配 → model 通配 → 全通配 → defaultLimit。 */
export function capFor(cfg: SubagentLimitConfig, resolved: ResolvedModel): number {
  const provider = resolved.provider ?? FALLBACK;
  const model = resolved.model ?? FALLBACK;
  const find = (p: string, m: string): number | undefined => {
    for (const rule of cfg.limits) {
      if (rule.provider === p && rule.model === m) return rule.max;
    }
    return undefined;
  };
  if (model !== FALLBACK) {
    const exact = find(provider, model);
    if (exact !== undefined) return exact;
  }
  const byProvider = find(provider, FALLBACK);
  if (byProvider !== undefined) return byProvider;
  if (model !== FALLBACK) {
    const byModel = find(FALLBACK, model);
    if (byModel !== undefined) return byModel;
  }
  const any = find(FALLBACK, FALLBACK);
  if (any !== undefined) return any;
  return cfg.defaultLimit;
}

function display(resolved: ResolvedModel): string {
  if (resolved.model === undefined) return "当前模型";
  return resolved.provider !== undefined
    ? `${resolved.provider}/${resolved.model}`
    : resolved.model;
}

/** 构造不可重试的 ABORTED 错误。 */
export function limitError(resolved: ResolvedModel, used: number, limit: number): AbortedError {
  return new AbortedError(
    `subagent 未创建：模型 ${display(resolved)} 的子代理并发已达上限（${used}/${limit}）。` +
      `当前可用槽位 0 个。请等待已有子代理结束后重试，或直接在当前会话完成这部分工作。`,
  );
}

/* ------------------------------------------------------------ 配置读取 */

export type SettingReader = (key: string) => string | null;

export function readConfig(getSetting: SettingReader): SubagentLimitConfig {
  const bool = (key: string, def: boolean): boolean => {
    const v = getSetting(key);
    if (v === null) return def;
    const t = v.trim().toLowerCase();
    // 面板 saveSettings 把 bool 存成 "1"/"0"（见 panel/overview.ts），
    // 手工改库也可能写 "true"/"false"，两种都认。
    return t === "true" || t === "1";
  };
  const int = (key: string, def: number): number => {
    const v = getSetting(key);
    if (v === null) return def;
    const n = Number(v);
    return Number.isSafeInteger(n) && n >= 1 ? n : def;
  };
  const json = (key: string): SubagentLimitRule[] => {
    const v = getSetting(key);
    if (v === null || v.trim() === "") return [];
    try {
      const parsed = JSON.parse(v);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (r): r is SubagentLimitRule =>
          r !== null &&
          typeof r === "object" &&
          typeof r.provider === "string" &&
          typeof r.model === "string" &&
          Number.isSafeInteger(r.max) &&
          r.max >= 1,
      );
    } catch {
      return [];
    }
  };
  return {
    enabled: bool("subagentLimit.enabled", SUBAGENT_LIMIT_DEFAULTS.enabled),
    defaultLimit: int("subagentLimit.defaultLimit", SUBAGENT_LIMIT_DEFAULTS.defaultLimit),
    limits: json("subagentLimit.limits"),
    countMainAgent: bool("subagentLimit.countMainAgent", SUBAGENT_LIMIT_DEFAULTS.countMainAgent),
    toolNames: [...DEFAULT_TOOL_NAMES],
  };
}

/* ------------------------------------------------------------ 安装 */

/** 一次预留的句柄，交给 subagent/start 认领、subagent/end 释放。 */
interface Reservation {
  provider: string | undefined;
  model: string | undefined;
  state: "open" | "bound" | "done";
}

export function applySubagentLimit(
  ctx: Context,
  capacity: CapacityView,
  getSetting: SettingReader,
): () => void {
  const toolNames = new Set(DEFAULT_TOOL_NAMES);
  /** 把本次调用的预留句柄传给 subagent/start（异步上下文）。 */
  const startContext = new AsyncLocalStorage<Reservation>();
  /** runId → 预留句柄。 */
  const boundByRun = new Map<string, Reservation>();

  const release = (res: Reservation) => {
    if (res.state === "done") return;
    res.state = "done";
    capacity.unreserve(res.provider, res.model);
  };

  const handler = async (exec: unknown, next: () => unknown): Promise<unknown> => {
    const e = exec as {
      name?: string;
      arguments?: unknown;
      agent?: { model?: { current?: () => unknown } };
    };
    if (!e.name || !toolNames.has(e.name)) return next();

    const cfg = readConfig(getSetting);
    if (!cfg.enabled) return next();

    const resolved = resolveModel(e);
    const limit = capFor(cfg, resolved);

    // 主会话占用是否计入：countMainAgent=false 时排除当前父会话在 ledger 里的租约。
    // 子会话有自己的 sessionId，不会被误排除。
    const parentSessionId =
      !cfg.countMainAgent && typeof (e.agent as { session?: { id?: unknown } } | undefined)?.session?.id === "string"
        ? String((e.agent as { session: { id: unknown } }).session.id)
        : undefined;
    const used = capacity.usage(resolved.provider, resolved.model, parentSessionId);
    if (used >= limit) throw limitError(resolved, used, limit);

    // 放行：预留一个名额。
    const reservation: Reservation = {
      provider: resolved.provider,
      model: resolved.model,
      state: "open",
    };
    capacity.reserve(resolved.provider, resolved.model);

    let failed = false;
    try {
      return await startContext.run(reservation, next);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      // 失败（没起子代理）→ 立即归还。成功则保留，等 subagent/start 认领。
      if (failed && reservation.state === "open") release(reservation);
    }
  };

  // DSH 的 cordis 事件表不含第三方/未来事件名，用宽松 host 类型规避类型报
  // （与 src/index.ts 里 `host.on("agent/request", ...)` 同一手法）。
  const host = ctx as unknown as {
    on(event: string, listener: (payload: unknown, next: () => unknown) => unknown): void;
  };
  host.on("tools/execute", handler);

  host.on("subagent/start", (info: unknown) => {
    const res = startContext.getStore();
    if (!res || res.state !== "open") return;
    res.state = "bound";
    const runId = String((info as { runId?: unknown })?.runId ?? "");
    if (runId) boundByRun.set(runId, res);
  });

  host.on("subagent/end", (info: unknown) => {
    const runId = String((info as { runId?: unknown })?.runId ?? "");
    const res = boundByRun.get(runId);
    if (!res) return;
    boundByRun.delete(runId);
    release(res);
  });

  return () => {
    for (const res of boundByRun.values()) release(res);
    boundByRun.clear();
    capacity.reset();
  };
}
