/**
 * DSH(Cordis)宿主半插件入口 —— 薄薄一层 ctx 胶水。
 *
 * 写法仿 dsh-usage-statistics-panel/src/index.ts:
 * - 导出 name / inject / apply(cordis 直接加载);
 * - ctx.effect(回调, label) 注册生命周期:回调立即执行,返回值 = disposer,
 *   在 ctx 销毁(HMR / 卸载)时调用 —— 路由与运行时一起清理。
 *
 * 免重启 dev 语义:所有可重建服务(ledger / health / scheduler 实例)在
 * apply 里现建现放,持久状态只放 SQLite(<dataDir>/as-one.db),挂载点留
 * dispose。改动 src/setup.ts / src/routes.ts 后 DSH 热重载即生效。
 *
 * 存储:唯一真源是 SQLite(`<homedir>/.as-one/as-one.db`)。
 *
 * **没有配置文件、没有 YAML config** —— 路径固定,设置项(含重路由车道)全部
 * 在 `setting` 表,由面板「设置」页读写;保存后**下一个请求**即生效,不需要重载。
 * 这是刻意的:同一份设置有两个真源时,「改哪边生效」永远说不清。
 */

import { homedir } from "node:os";
import { join } from "node:path";

import { warmupDeepseekTokenizer } from "@as-one/core/src/tokenizer/deepseek.js";

import { setupAsOne, type AsOneRuntime } from "./setup.js";
import { buildGatewayRoutes } from "./routes.js";
import { buildPanelRoutes } from "./panel-routes.js";
import { AS_ONE_PROVIDER, AsOneLlmAdapter } from "./llm-adapter.js";
import type { DshAttachmentService } from "./llm-types.js";
import type { Context } from "./context-types.js";
import { internalSwitch, setCompactHost, type CompactTriggerCompaction } from "./compact-trigger.js";
import { rerouteSettingsFrom } from "./reroute.js";
import { createExternalUsageCollector, sessionIdOf } from "./usage-external.js";
import { createWarmupGate, type WarmupGate } from "./warmup-gate.js";
import { evaluateQuotaFreshness } from "./quota-freshness.js";
import { createCapacityView } from "./components/capacity.js";
import { applySubagentLimit } from "./components/subagent-limit.js";
import { applyCompaction } from "./components/compaction/index.js";

export const name = "@bvbhu/as-one";
export const inject = ["webServer"];

/** 固定路径布局:数据、库、日志都在这一个目录里。 */
export function resolveDirs(): { dataDir: string; dbPath: string; logDir: string } {
  const dataDir = join(homedir(), ".as-one");
  return { dataDir, dbPath: join(dataDir, "as-one.db"), logDir: join(dataDir, "logs") };
}

export function apply(ctx: Context): void {
  void startAsOne(ctx);
}

/**
 * 额度预热门的装配（用户 2026-11-16 定案）。
 *
 * 两条触发条件：
 * 1. **启动后首次调度前** —— 无条件刷一轮，把到期时间填进运行期快照；
 * 2. **没有有效数据时** —— 每个请求调度前用 {@link evaluateQuotaFreshness}
 *    判一次（只读内存，廉价），无效才再刷，受节流约束。
 *
 * 为什么要借面板的 `syncAllQuota`：额度探针（trae/workbuddy/minimax/qoder）
 * 全部活在 `@as-one/panel` 里，`src/` 不该反过来实现一遍 —— 那必然和面板分叉。
 * 面板宿主已经建好（`createPanelHost` 在 `setupAsOne` 之后），这里只是拿它的
 * 方法当刷新器。
 */
function createQuotaWarmup(
  runtime: AsOneRuntime,
  ctx: Context,
): WarmupGate {
  /** 面板方法表（惰性建：`createPanelHost` 有副作用，别在模块顶层跑）。 */
  let panel: { syncAllQuota?: (force?: boolean) => Promise<unknown> } | null = null;

  const refresh = async (): Promise<void> => {
    if (panel === null) {
      // 与 `buildPanelRoutes` 内部用的是**同一个** runtime，但各自建一份 host
      // 会让 chQuotaCache（模块级）被两个实例共享 —— 那没问题（缓存本来就是
      // 模块级单例）；两份 host 的 `qoderQuotaRefresh` 闭包各自引用同一 runtime，
      // 覆盖面一致（`CH_QUOTA_PROVIDERS` 是模块级常量，含 codearts）。
      const { createPanelHost } = await import("./panel-host.js");
      panel = createPanelHost(runtime, {}).panel as unknown as {
        syncAllQuota?: (force?: boolean) => Promise<unknown>;
      };
    }
    const fn = panel?.syncAllQuota;
    if (typeof fn !== "function") return;

    // ⚠️ **刷新后必须让调度器缓存失效** —— 这是「启动后第一次请求路由错」的根因。
    // `Scheduler.chain()` 对 due-first 会把结果按「分钟 + 额度代数」记忆化
    // （`_cache`）；刷到新额度却不清缓存，下一次 chain() 仍拿旧快照排序。
    // 放在 finally 里：即使 syncAllQuota 抛错、或 ok:false 被我们转成失败，
    // 只要探针写过任何一行，调度器都必须重新读，不允许任何 chain() 用旧快照。
    let incomplete: string | null = null;
    try {
      const res = (await fn.call(panel, true)) as
        | { ok?: boolean; message?: string; written?: number; probed?: number }
        | null
        | undefined;
      // ⚠️ **不完整就是失败**（2026-11-16 用户定案：「syncAllQuota，对于非 openai
      // 供应商必须全部读到数据」）。`ok:false` 抛给 gate，由它明确记降级原因。
      if (res !== null && res !== undefined && res.ok === false) {
        incomplete = res.message ?? `额度刷新不完整(${res.written ?? 0}/${res.probed ?? 0} 个账号读到)`;
      }
    } catch (err) {
      incomplete = err instanceof Error ? err.message : String(err);
    } finally {
      try {
        runtime.scheduler.invalidate();
      } catch (err) {
        ctx.logger?.warn?.("[as-one] 预热后调度器缓存失效失败", err);
      }
    }
    if (incomplete !== null) throw new Error(incomplete);
  };

  /**
   * 「有没有有效到期数据」的判定。
   *
   * ⚠️ 数据源必须与调度器读的**同一份**：`chQuotaTableForScheduler()` 是网关
   * 侧 `quotaSnapshot` 的实现，它把 `chQuotaCache` + provider 聚合 + sensenova
   * 比例合成一张表。这里只关心「有没有 expires_at / 新不新鲜」。
   */
  const needsRefresh = (): boolean => {
    try {
      const table = runtime.repo.quotas() ?? {};
      const snapshots = Object.values(table) as Array<{
        expires_at?: number | null;
        fetched_at?: number | null;
        error?: string | null;
      }>;
      const hours = Number(runtime.getSetting("external_refresh.interval_hours") ?? "5");
      const maxAgeHours = Number.isFinite(hours) && hours > 0 ? hours : 5;
      const verdict = evaluateQuotaFreshness({
        snapshots,
        now: Date.now(),
        maxAgeMs: maxAgeHours * 3_600_000,
      });
      if (!verdict.fresh) {
        ctx.logger?.info?.(`[as-one] 额度快照无效（${verdict.reason}）→ 调度前先刷新`);
      }
      return !verdict.fresh;
    } catch (err) {
      // 判定失败**不触发**刷新：宁可少刷一次，也不要因判定 bug 每请求打上游。
      ctx.logger?.warn?.("[as-one] 额度新鲜度判定失败，本轮不刷新", err);
      return false;
    }
  };

  return createWarmupGate({
    refresh,
    needsRefresh,
    logger: ctx.logger as unknown as Pick<Console, "warn" | "info">,
  });
}

async function startAsOne(ctx: Context): Promise<void> {
  const { dataDir, dbPath, logDir } = resolveDirs();

  let runtime: AsOneRuntime;
  try {
    runtime = await setupAsOne({ dataDir, dbPath, logDir });
  } catch (err) {
    // 启动失败不能拖垮宿主:记日志,路由不挂(下次 apply / 修复配置后重载)。
    ctx.logger?.warn?.("[as-one] setup failed, gateway routes not mounted:", err);
    return;
  }

  // ⚠️ 预热门必须在**两处**都注入（2026-11-16 真根因）：
  //   · `buildGatewayRoutes` → 外部 `/v1/*` 调用方；
  //   · `AsOneLlmAdapter`   → **DSH 自己的对话请求**（进程内 `adapter.stream()`，
  //     不走 HTTP 路由，所以只修前者的那段预热对用户看到的请求完全无效）。
  // 它内部惰性建面板 host，提前构造是安全的。
  const warmup = createQuotaWarmup(runtime, ctx);

  // 统一并发容量视图 + 嵌入式组件（subagent 限制 / 压缩增强）。
  // 容量视图包装 rt.ledger（真实在途账本），组件只按 setting 表的开关/配额裁决，
  // 不做第二套账本、不注册独立 bundle 行。设置默认开启，关掉即不生效。
  const capacity = createCapacityView(runtime.ledger);
  const disposeSubagentLimit = applySubagentLimit(ctx, capacity, runtime.getSetting);
  // 压缩拦截器要挂在有 `llm` 服务的子 fiber 上（下面 llm effect 里装配），
  // 这里先留 disposer 槽位。
  let disposeCompaction: (() => void) | undefined;

  ctx.effect(
    () => {
      // 面板要先建出来 —— 预热门要借它的 `syncAllQuota(true)` 打真实探针。
      const panelRoutes = buildPanelRoutes(runtime);
      const gatewayRoutes = buildGatewayRoutes(runtime, {
        logger: ctx.logger as unknown as Pick<Console, "warn" | "error">,
        warmup,
      });
      const disposers: (() => void)[] = [];
      for (const route of [...gatewayRoutes, ...panelRoutes]) {
        try {
          // 宿主 register 收单条路由对象;返回 disposer。
          disposers.push(ctx.webServer.register(route as never));
        } catch (err) {
          ctx.logger?.warn?.(`[as-one] register route ${route.path} failed:`, err);
        }
      }
      ctx.logger?.info?.(
        `[as-one] mounted ${gatewayRoutes.length} gateway route(s) + ${panelRoutes.length} panel route(s)`,
      );
      // 预热 DeepSeek 分词表(纯内存建表 ~100ms)。放在挂载时而不是第一次请求时:
      // 那一百毫秒恰好落在「用户按下回车」上就很明显。
      warmupDeepseekTokenizer();
      return () => {
        disposeCompaction?.();
        disposeSubagentLimit();
        for (const dispose of disposers) dispose();
        runtime.dispose();
      };
    },
    "@bvbhu/as-one: gateway + panel routes",
  );

  // ---------------------------------------------------------------------------
  // LLM adapter —— 把模型列表嵌进 DSH 原生选择器(用户 m37114)。
  //
  // 为什么用 `ctx.inject(["llm"], …)` 而不是把它加进 `export const inject`:
  // 加进 inject 会让**整个插件**在宿主没有 llm 服务时(老版本宿主 / 纯 Web 形态)
  // 连网关路由都不挂。cordis 的 `inject(deps, callback)` 是独立子 fiber ——
  // 依赖没满足就只是不执行,网关/面板照挂。
  //
  // 注册必须发生在 effect 里:宿主 `registerAdapter` 用 `ctx.effect` 记账,
  // 子 fiber 销毁(HMR / 卸载)时自动摘掉路由,否则下次 apply 撞 `DUPLICATE_ADAPTER`。
  // ---------------------------------------------------------------------------
  // 只补「内部换档」这一种宿主看不见的压缩触发;不接管任何宿主压缩事件。
  setCompactHost({
    compaction: (() => {
      try {
        return (ctx.get("compaction") as CompactTriggerCompaction | undefined) ?? undefined;
      } catch {
        return undefined;
      }
    })(),
    warn: (message, error) => ctx.logger?.warn?.(message, error),
  });
  try {
    const host = ctx as unknown as {
      on(event: string, listener: (payload: unknown, next: () => unknown) => unknown, opts?: unknown): void;
    };
    host.on(
      "agent/request",
      (payload, next) =>
        internalSwitch.onAgentRequest(
          payload as Parameters<typeof internalSwitch.onAgentRequest>[0],
          next,
        ),
      { prepend: true },
    );
  } catch (err) {
    ctx.logger?.warn?.("[as-one] compact trigger registration skipped:", err);
  }

  // ── 网关外用量 ─────────────────────────────────────────────────────
  // 只采 `session/event` 里**没经过 as-one** 的调用(`provider !== "as-one"`),
  // 写独立的 `stats_external_daily`;不回填历史(用户定案:网关库里已有大量用量,
  // 再导一遍就是重复统计)。没有任何事件源时这段是纯 no-op,不影响插件加载。
  try {
    const collector = createExternalUsageCollector({
      exclude: [AS_ONE_PROVIDER],
      record: (sample) => {
        runtime.db.statsExternalDaily.record({
          day: sample.day,
          provider: sample.provider,
          model: sample.model,
          calls: sample.calls,
          prompt_tokens: sample.promptTokens,
          cached_tokens: sample.cachedTokens,
          completion_tokens: sample.completionTokens,
          last_seen: Math.round(sample.at),
        });
      },
      logger: ctx.logger,
    });
    const host = ctx as unknown as {
      on(event: string, listener: (session: unknown, event: unknown) => void): void;
    };
    host.on("session/event", (session, event) => {
      // 宿主给的是 `{ header: { id } }`;按 `session.id` 取会拿到 undefined,
      // 于是每条事件都被当空会话丢掉(外部表曾经一直是空的)。
      collector.onEvent(sessionIdOf(session), event as { type?: string });
    });
    host.on("session/disposed", (session) => {
      collector.onSessionDisposed(sessionIdOf(session));
    });
    ctx.logger?.info?.("[as-one] 网关外用量采集已挂上 session/event");
  } catch (err) {
    ctx.logger?.warn?.("[as-one] 网关外用量采集挂载失败(统计会缺这一块):", err);
  }

  ctx.inject(["llm"], (child) => {
    child.effect(() => {
      const adapter = new AsOneLlmAdapter(runtime, {
        // ⚠️ DSH 的对话请求走这条进程内路径（`adapter.stream()` → `resolveUpstream`），
        // **不经过** `/v1/chat/completions` 路由 —— 所以预热门必须在这里再注入一次，
        // 否则启动后首个请求仍会拿空额度快照排成 members 配置序（恒走 trae）。
        warmup,
        // 宿主 attachments 服务的惰性取用口 —— adapter 靠它把 `read_image`
        // 与用户附件的「附件引用」读成字节再编成 data URL。
        //
        // ⚠️ 故意不把 attachments 写进 `ctx.inject([...])`:纯 Web 宿主 / 没挂
        // 附件服务的部署里,整个 adapter 都不该因此消失(那样连文本模型都选不到)。
        // 服务缺失时 adapter 如实降级(丢图片块),文本请求照常。
        // 现读 setting 表:面板保存后下一个请求就换车道。
        reroutes: () => rerouteSettingsFrom(runtime.getSetting),
        resolveAttachments: () => {
          try {
            return (child.get("attachments") as DshAttachmentService | undefined) ?? undefined;
          } catch {
            return undefined;
          }
        },
      });
      let unregister: (() => void) | undefined;
      try {
        unregister = child.llm.registerAdapter([AS_ONE_PROVIDER], adapter);
        child.logger?.info?.(`[as-one] llm adapter registered as "${AS_ONE_PROVIDER}"`);
      } catch (err) {
        // 已经有人占了这条路由(比如同宿主装了两个 As One 插件实例):
        // 记一条日志继续,网关与面板不受影响。
        child.logger?.warn?.("[as-one] llm adapter registration failed:", err);
      }

      // 压缩增强拦截器挂在同一 child 上（它有 llm 服务）。失败只记日志，
      // 宿主原摘要不受影响。
      try {
        disposeCompaction = applyCompaction({
          ctx: child as unknown as Context,
          runtime,
          capacity,
          getSetting: (key) => runtime.getSetting(key),
        });
      } catch (err) {
        child.logger?.warn?.("[as-one] compaction enhancement setup failed:", err);
      }

      return () => {
        try {
          unregister?.();
        } catch (err) {
          child.logger?.warn?.("[as-one] llm adapter dispose failed:", err);
        }
      };
    }, "@bvbhu/as-one: llm adapter");
  });
}

// hmr-probe: 16:31:46.621
