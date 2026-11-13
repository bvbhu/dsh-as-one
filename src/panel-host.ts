/**
 * 面板宿主接线 —— 把插件的 `AsOneRuntime` 装成 `@as-one/panel` 的 `PanelContext`。
 *
 * 为什么单独一个文件:Electron(`apps/electron/src/main/assembly.ts`)与
 * 本插件共用同一个 `createPanel`,两边**只差构造上下文的那几行** —— 宿主专有的
 * 网关描述(`gatewayState` / `restartGateway`)与 sensenova 池播种在这里补上,
 * 面板方法本身全部来自共享包,行为天然一致。
 *
 * ⚠️ 插件模式没有独立网关端口:OpenAI 兼容路由(`/v1/*`)挂的是 DSH 宿主的
 * `ctx.webServer`,生命周期归 DSH。所以:
 * - `gatewayState.gateway` 给一个**恒就绪的占位描述**(端口取配置值,面板要显示
 *   base_url 与就绪状态);
 * - `restartGateway` 如实返回「插件模式不能重启」,不假装成功。
 */

import type { PanelContext } from "@as-one/panel/src/context.js";
import { createPanel, dispatchPanel } from "@as-one/panel/src/panel.js";
import type { Panel, PanelBundle } from "@as-one/panel/src/panel.js";

import { syncSensenovaPool } from "./setup.js";
import type { AsOneRuntime } from "./setup.js";

export interface PanelHostOptions {
  /** 面板展示用的网关端口(缺省 4000;与 Electron 版 DEFAULT_GATEWAY_PORT 对齐)。 */
  gatewayPort?: number;
  /** 面板展示用的网关主机(缺省 127.0.0.1)。 */
  gatewayHost?: string;
}

export interface PanelHost {
  panel: Panel;
  /** 方法名 + 位置参数 → 结果(与 Electron IPC 同一分派器)。 */
  dispatch(method: string, args: unknown[]): Promise<unknown>;
  ctx: PanelContext;
  bundle: PanelBundle;
}

/** 组装 `PanelContext` 并生成方法表。 */
export function createPanelHost(rt: AsOneRuntime, options: PanelHostOptions = {}): PanelHost {
  const port = options.gatewayPort ?? 4000;
  const gatewayHost = options.gatewayHost ?? "127.0.0.1";

  /**
   * 网关状态占位:插件自己不开端口,`close` 是空操作(路由由宿主 `ctx.webServer`
   * 持有,disposer 在 `index.ts` 的 ctx.effect 里)。`error: null` 表示「路由已挂」。
   */
  const gatewayState = {
    gateway: {
      port,
      close: async (): Promise<void> => undefined,
    },
    error: null as string | null,
  };

  const ctx: PanelContext = {
    db: rt.db,
    registry: rt.registry,
    vault: rt.vault,
    scheduler: rt.scheduler,
    router: rt.router,
    ledger: rt.ledger,
    health: rt.health,
    keyProvider: rt.keyProvider,
    gatewayState,
    gatewayHost,
    restartGateway: async (): Promise<string> =>
      "插件模式:网关由宿主 DSH 进程托管,面板不能重启它(重载插件即重建路由)",
    startedAtMs: rt.startedAtMs,
    accountOverlay: rt.accountOverlay,
    setAccountEnabled: rt.setAccountEnabled,
    dataDir: rt.dataDir,
    dbPath: rt.dbPath,
    secretPresence: rt.secretPresence,
    syncRegistry: rt.syncRegistry,
  };

  const bundle = createPanel(ctx, { syncSensenovaPool });
  // 网关 401/403 时 fire-and-forget 调它(见 setup.ts 的 'onSensenovaKeyInvalid'
  // 注入点):自愈实现只能活在 createPanel 闭包里(要跑登录 + 建 key + 换池),
  // 而网关注入点在那之前就构造好了 —— 用这个注册口搭桥,与 electron
  // `assembly.ts` 的模块级 `sensenovaKeyRepair` 同一手法。
  rt.setSensenovaKeyRepair(bundle.snRepairKey);
  return {
    panel: bundle.panel,
    dispatch: (method, args) => dispatchPanel(bundle.panel, method, args),
    ctx,
    bundle,
  };
}
