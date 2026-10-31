/**
 * client 半 —— DSH 客户端服务契约的结构镜像(零 Node 类型)。
 *
 * 与宿主半 src/context-types.ts 不同,这里镜像的是 DSH 客户端注入的
 * 服务(dsh-client-locale / dsh-client-ui-slots 提供的 slots / locale /
 * layout)。运行时不 import 任何 @deepseek-ai 包,服务实例由 DSH
 * 客户端按 package.json 的 dsh.client.inject 列表注入到 ctx 上。
 */
export {};
//# sourceMappingURL=context.js.map