/**
 * 子标题行「刷新」通道 —— 四个渠道子页(Trae / WorkBuddy / Qoder / SenseNova)
 * 把它自己的刷新条挂到 `ModelsPage` 的子标题行右端。
 *
 * 为什么单独一个模块:壳要 import 子页,子页又要 import 壳里的 hook —— 直接互相
 * import 会形成运行时循环(壳还没求值完子页就用了 context)。放在这里,壳与子页
 * 都只依赖这一个叶子模块,没有环。
 *
 * 用法(子页):
 * ```tsx
 * const publish = useModelsActionPublisher();
 * React.useEffect(() => {
 *   publish({ label: busy ? "刷新中…" : "刷新", note, noteBusy: busy, disabled, run: refreshAll });
 *   return () => publish(null);   // 卸载/切页 → 收回,按钮消失
 * }, [publish, busy, note, disabled]);
 * ```
 */
import React from "react";

export interface ChannelActionSpec {
  label: string;
  disabled?: boolean;
  /** 按钮左边那句状态(「于 3 分钟前刷新」/「正在刷新 · 已用 1.2s」)。 */
  note?: string;
  /** 那句状态要不要用「进行中」配色。 */
  noteBusy?: boolean;
  run: () => void;
}

/** 子页把刷新条登记到子标题行;传 null 表示收回。 */
export type ModelsActionPublisher = (spec: ChannelActionSpec | null) => void;

const ModelsActionContext = React.createContext<ModelsActionPublisher>(() => {
  /* 子页被单独渲染(不在壳里)时是空操作 —— 此时页面内的备用刷新入口仍然可用。 */
});

export const ModelsActionProvider = ModelsActionContext.Provider;

/** 子页用它把自己的刷新条挂到子标题行右端。 */
export function useModelsActionPublisher(): ModelsActionPublisher {
  return React.useContext(ModelsActionContext);
}
