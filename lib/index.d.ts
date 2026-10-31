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
import type { Context } from "./context-types.js";
export declare const name = "@as-one/plugin";
export declare const inject: string[];
export interface AsOnePluginConfig {
    /** 保留字段:与独立 Electron 版(DEFAULT_GATEWAY_PORT=4000)对齐;宿主路由形态不建端口。 */
    gatewayPort?: number;
    /** 数据目录覆盖(默认 <homedir>/.as-one)。 */
    dataDir?: string;
    /** 配置目录覆盖(默认 <dataDir>/config)。 */
    configDir?: string;
    /** SQLite 文件路径覆盖(默认 <dataDir>/as-one.db)。 */
    dbPath?: string;
}
export declare function resolveDirs(ctx: Context, config?: AsOnePluginConfig): {
    dataDir: string;
    configDir: string;
    dbPath: string;
};
export declare function apply(ctx: Context, config?: AsOnePluginConfig): void;
