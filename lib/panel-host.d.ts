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
import type { Panel, PanelBundle } from "@as-one/panel/src/panel.js";
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
export declare function createPanelHost(rt: AsOneRuntime, options?: PanelHostOptions): PanelHost;
