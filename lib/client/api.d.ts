/**
 * client 半 —— 面板数据层:把共享视图层的 invoke 桥接到宿主的 HTTP 路由。
 *
 * 共享页面(`@as-one/panel-ui`)只调 `invokePanel(method, ...args)`;这里在
 * 面板挂载前注入实现:`POST as-one/api/<method>`,body `{ args: [...] }`
 * (宿主半 src/panel-routes.ts 的 argsOf 接受该形状,也兼容裸数组与旧对象)。
 *
 * wire 形状:成功 `{ ok: true, value: T }`、失败 `{ ok: false, error: { code, message } }`;
 * 失败/网络/坏响应统一抛 AsOneApiError(code, message)。零 Node 类型。
 */
export declare class AsOneApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/**
 * 把共享视图层的数据通道接到本面板的 HTTP 路由。
 * 幂等:面板重新挂载时重复调用即可。
 */
export declare function bindPanelBridge(): void;
