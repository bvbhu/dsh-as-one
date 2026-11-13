/**
 * 面板数据桥 —— 视图层与宿主的唯一接缝。
 *
 * 页面代码只依赖本模块的 `invokePanel(method, ...args)`:宿主( Electron 渲染进程
 * 走 preload IPC、DSH 插件 client 走 `POST /as-one/api/<method>`)在挂载前调用
 * `setPanelInvoker()` 注入具体实现。方法名与参数形状即共享契约
 * `@as-one/panel/src/types`(RendererApi)与 `dispatchPanel` 的 switch 分支。
 */

/** 宿主注入的调用实现:方法名 + 位置参数 → 结果。 */
export type PanelInvoker = (method: string, ...args: unknown[]) => Promise<unknown>;

let invoker: PanelInvoker | null = null;

/** 注入/替换宿主实现(Electron 与插件各自在启动时调一次)。 */
export function setPanelInvoker(fn: PanelInvoker): void {
  invoker = fn;
}

/** 当前是否已有宿主实现(面板可在未注入时给出可读错误而不是白屏)。 */
export function hasPanelInvoker(): boolean {
  return invoker !== null;
}

/** 调宿主实现。未注入时抛出明确错误。 */
export function invokePanel<T>(method: string, ...args: unknown[]): Promise<T> {
  if (invoker === null) {
    throw new Error("面板数据桥未注入:宿主需先调用 setPanelInvoker()");
  }
  return invoker(method, ...args) as Promise<T>;
}
