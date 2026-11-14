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

  ctx.effect(
    () => {
      const gatewayRoutes = buildGatewayRoutes(runtime, { logger: ctx.logger as unknown as Pick<Console, "warn" | "error"> });
      const panelRoutes = buildPanelRoutes(runtime);
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
