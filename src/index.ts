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
 * 路径规则(全部可被 cordis.patch.yml 的 config 覆盖):
 *   dataDir  → config.dataDir ?? $AS_ONE_DATA_DIR ?? ctx.dataDir ?? <homedir>/.as-one
 *   configDir→ config.configDir ?? <dataDir>/config   (导入/导出用的 JSON 备份目录)
 *   dbPath   → config.dbPath ?? <dataDir>/as-one.db
 * 数据库是唯一真源;configDir 只剩「JSON 导入 / 导出 / 备份」用途。
 * 默认绝不写死到用户桌面 profile 的既定文件。
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
import { normalizeReroutes, rerouteCount, type RerouteSettings } from "./reroute.js";

export const name = "@bvbhu/as-one";
export const inject = ["webServer"];

export interface AsOnePluginConfig {
  /** 保留字段:与独立 Electron 版(DEFAULT_GATEWAY_PORT=4000)对齐;宿主路由形态不建端口。 */
  gatewayPort?: number;
  /** 数据目录覆盖(默认 <homedir>/.as-one)。 */
  dataDir?: string;
  /** 配置目录覆盖(默认 <dataDir>/config)。 */
  configDir?: string;
  /** SQLite 文件路径覆盖(默认 <dataDir>/as-one.db)。 */
  dbPath?: string;
  /**
   * **辅助请求的重路由设置**(压缩摘要 / 图像解析 / 会话标题)。
   *
   * 缺省是空 —— **没有任何重路由机制**,所有请求都按客户端给的模型走。
   * 只有显式写出模型名的那一类才会被切到另一条车道:
   *
   * ```yaml
   * routes:
   *   compact: free       # purpose: "compaction"
   *   vision: free        # 图像桥解析(必须真的能看图)
   *   sessionTitle: free  # purpose: "session-title"
   * ```
   *
   * 配了但库里没有该模型 → 该次请求回落原模型并告警(不产生半个重路由)。
   */
  routes?: RerouteSettings;
}

function ctxDataDir(_ctx: Context): string | undefined {
  // 当前 DSH 无公开 ctx.dataDir 服务:访问 ctx.dataDir 会触发
  // "cannot get property without inject" 代理错误,所以只以
  // config / 环境变量 / 用户主目录兜底(见 resolveDirs)。
  return undefined;
}

export function resolveDirs(ctx: Context, config: AsOnePluginConfig = {}) {
  const dataDir =
    config.dataDir ?? process.env.AS_ONE_DATA_DIR ?? ctxDataDir(ctx) ?? join(homedir(), ".as-one");
  const configDir = config.configDir ?? join(dataDir, "config");
  const dbPath = config.dbPath ?? join(dataDir, "as-one.db");
  return { dataDir, configDir, dbPath };
}

export function apply(ctx: Context, config: AsOnePluginConfig = {}): void {
  void startAsOne(ctx, config);
}

async function startAsOne(ctx: Context, config: AsOnePluginConfig): Promise<void> {
  const { dataDir, configDir, dbPath } = resolveDirs(ctx, config);
  // 重路由设置只读一次:改了要重载插件(与其它进程内服务同一口径)。
  const routes = normalizeReroutes(config.routes);
  if (rerouteCount(routes) > 0) {
    ctx.logger?.info?.(`[as-one] 重路由已启用:${JSON.stringify(routes)}`);
  }

  let runtime: AsOneRuntime;
  try {
    // ⚠️ 明细日志必须和独立应用写同一个地方。setupAsOne 的缺省是
    // `<configDir>/logs`(= `<dataDir>/config/logs`),而 Electron 侧是
    // `<dataDir>/logs` —— 两个形态共用一个 dataDir 时日志会分叉成两份,
    // 「这次的请求到底记到哪去了」全靠猜。这里显式按 dataDir 对齐。
    runtime = await setupAsOne({ configDir, dbPath, logDir: join(dataDir, "logs"), routes });
  } catch (err) {
    // 启动失败不能拖垮宿主:记日志,路由不挂(下次 apply / 修复配置后重载)。
    ctx.logger?.warn?.("[as-one] setup failed, gateway routes not mounted:", err);
    return;
  }

  ctx.effect(
    () => {
      const gatewayRoutes = buildGatewayRoutes(runtime, { logger: ctx.logger as unknown as Pick<Console, "warn" | "error"> });
      const panelRoutes = buildPanelRoutes(runtime, { gatewayPort: config.gatewayPort });
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

  ctx.inject(["llm"], (child) => {
    child.effect(() => {
      const adapter = new AsOneLlmAdapter(runtime, {
        // 宿主 attachments 服务的惰性取用口 —— adapter 靠它把 `read_image`
        // 与用户附件的「附件引用」读成字节再编成 data URL。
        //
        // ⚠️ 故意不把 attachments 写进 `ctx.inject([...])`:纯 Web 宿主 / 没挂
        // 附件服务的部署里,整个 adapter 都不该因此消失(那样连文本模型都选不到)。
        // 服务缺失时 adapter 如实降级(丢图片块),文本请求照常。
        routes,
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
