/**
 * As One(合一)DSH 插件 —— client 半入口。
 *
 * cordis 插件形状(platform "web" 由 package.json 的 dsh.client 声明):
 * 注册 locale 字典、侧栏行(sidebar.panellist)与主面板(main)。
 *
 * 页面本体是共享视图层 @as-one/panel-ui(与 Electron 面板同一套代码);
 * 数据全部走文档相对 fetch(见 ./client/api.ts),不 import 任何宿主/Node 类型。
 */
import type { Context } from "./client/context.js";
export declare const BUNDLE_NAME = "@as-one/plugin";
export declare const PANEL_ID = "as-one";
export declare const PANEL_ORDER = 30;
export declare const name = "@as-one/plugin/client";
/** client 侧依赖的服务座位(与 dsh.client.inject 的包一致)。 */
export declare const inject: string[];
export declare function apply(ctx: Context, _config?: Record<string, unknown>): void;
