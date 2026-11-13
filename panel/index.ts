/**
 * `@as-one/panel` —— Electron 与 DSH 插件共用的管理面板域。
 *
 * 装配层(Electron 主进程 / 插件宿主)构造 `PanelContext` 后,调四个域工厂拿到
 * 方法表,再拼成自己的 `Panel` 对象:
 *
 * ```ts
 * const sn = createSensenovaDomain(ctx, snDeps);
 * const ch = createChannelsDomain(ctx, chDeps);
 * const md = createModelsDomain(ctx, mdDeps);
 * const ov = createOverviewDomain(ctx, ovDeps);
 * const panel = { ...ch.methods, ...sn.methods, ...md.methods, ...ov.methods };
 * ```
 *
 * 域工厂之间通过 `deps` 注入彼此的能力(而不是互相 import 单例),
 * 这样 Electron 与插件可以用各自的方式提供同一份依赖,面板行为保持一致。
 */
export * from "./context.js";
export * from "./types.js";
export * from "./constants.js";
export * from "./utils.js";
export * from "./modelcatalog.js";
export * from "./modelview.js";
export * from "./refresh.js";
export * from "./qoder.js";
export * from "./sensenova.js";
export * from "./channels.js";
export * from "./channels-methods.js";
export * from "./channels-sync.js";
export * from "./models.js";
export * from "./overview.js";
export * from "./panel.js";
