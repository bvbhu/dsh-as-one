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

/**
 * 某模型的总并发容量（= 启用凭据数 × 每凭据并发；逻辑模型取成员之和）。
 * 返回 `null` 表示查不到 → **不限制**。
 *
 * 2026-11 用户定案：「子代理并发限制的设置项整体移除，只按模型的并发限制
 * 限制子代理（逻辑模型的并发取所有成员模型的并发之和）」—— 所以这里不再有任何
 * setting 开关/默认值/规则表，唯一依据就是模型自己的容量。
 */
export type SubagentCapOf = (
  provider: string | undefined,
  model: string | undefined,
) => number | null;

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
  capOf: SubagentCapOf,
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

    const resolved = resolveModel(e);
    // 限制 = 该模型的总并发容量(启用凭据数 × 每凭据并发;逻辑模型取成员之和)。
    // 查不到容量 → 不拦截(没有并发信息就不该凭猜测拦人)。
    const limit = capOf(resolved.provider, resolved.model);
    if (limit === null) return next();

    // 占用口径统一为「该模型上所有在途」—— 主会话对同一模型的占用也算在内,
    // 因为它同样消耗模型的并发名额(不再有「主会话是否计入」这个设置项)。
    const used = capacity.usage(resolved.provider, resolved.model);
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
