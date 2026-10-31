/**
 * 面板数据类型 —— 宿主半路由与 client 半共享的 type-only 镜像。
 *
 * 形状与 apps/electron/src/shared/panel-types.ts 对齐(该文件为三端共享),
 * 这里复制 client 需要的子集,避免 client 包依赖 electron 目录或 Node 类型。
 * ⚠️ 本文件必须零 Node 类型、零运行时(可被 client 半引用)。
 */
export {};
//# sourceMappingURL=panel-types.js.map