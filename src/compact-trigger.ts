/**
 * 只在「内部切换模型」时触发一次宿主压缩。
 *
 * 明确不接管宿主压缩：不注册 agent/pre-step、不注册 agent/request-error、
 * 不禁用 compaction-basic、不替换 ctx.compaction。宿主自己的压力压缩与
 * 溢出恢复照常工作，这里只补宿主看不见的那一种切换 —— 逻辑模型名不变、
 * 但网关在内部换到了另一个真实端点/档位。
 *
 * 防重入是硬要求：压缩事务发出的摘要请求会重新进入同一个 adapter，
 * 若不设 inflight，一次溢出会引发嵌套压缩。
 */

/** 宿主服务按调用时解析，缺服务时整体静默。 */
export interface CompactTriggerContext {
  sessionId?: unknown;
}

export interface CompactTriggerAgent {
  session?: CompactTriggerContext;
}

export interface CompactTriggerCompaction {
  compactIfNeeded(
    agent: CompactTriggerAgent,
    trigger: "pressure" | "context-overflow",
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface CompactTriggerHost {
  compaction?: CompactTriggerCompaction;
  warn?: (message: string, error?: unknown) => void;
}

export interface CompactTrigger {
  /** 网关内部换档时调用，登记「下一个请求前需要压缩」。 */
  noteInternalSwitch(sessionId: string): void;
  /** 挂到 ctx.on("agent/request", ...) 的 waterfall 监听体。 */
  onAgentRequest(
    payload: { agent: CompactTriggerAgent; signal: AbortSignal },
    next: () => Promise<unknown> | unknown,
  ): Promise<unknown>;
}

export function createCompactTrigger(
  resolve: () => CompactTriggerHost,
): CompactTrigger {
  const pending = new Set<string>();
  const inflight = new Set<string>();

  return {
    noteInternalSwitch(sessionId: string): void {
      if (sessionId) pending.add(sessionId);
    },

    async onAgentRequest(payload, next): Promise<unknown> {
      const config = await next();
      const raw = payload?.agent?.session?.sessionId;
      const sessionId = typeof raw === "string" ? raw : "";
      if (!sessionId || !pending.has(sessionId)) return config;
      pending.delete(sessionId);
      if (inflight.has(sessionId)) return config;

      inflight.add(sessionId);
      try {
        const host = resolve();
        if (host.compaction && !payload.signal?.aborted) {
          await host.compaction.compactIfNeeded(payload.agent, "pressure", payload.signal);
        }
      } catch (error) {
        resolve().warn?.("[as-one] internal-switch compaction failed", error);
      } finally {
        inflight.delete(sessionId);
      }
      return config;
    },
  };
}

/** 进程内单例:网关与插件入口共享同一份换档标记。 */
let activeHost: CompactTriggerHost = {};

export function setCompactHost(host: CompactTriggerHost): void {
  activeHost = host;
}

export const internalSwitch: CompactTrigger = createCompactTrigger(() => activeHost);
