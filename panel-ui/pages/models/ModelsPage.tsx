/**
 * 「模型」聚合频道壳(对齐 Nexus Models.vue)。
 *
 * 子标题顺序(2026-11-07 合并定案):
 *   逻辑模型 → 模型总览 → 渠道 → 兼容供应商
 * 「渠道」页把原 Trae / MiniMax / Qoder / SenseNova 四个子页合成折叠卡列表:
 *   卡头常显余额(读运行期缓存),展开才渲染模型目录与配置(只在打开时拉取)。
 *   WorkBuddy 从导航隐藏(渠道/签到能力仍在,不再单列)。
 *
 * 刷新按钮的位置(用户 2026-10-30 第二轮定案):**统一上移到子标题行右端**,
 * 不再挂在页面内的账号带右侧。四个子页各有一份刷新状态(在刷/进度/禁用),
 * 壳不认识它们,所以走 `models-action.ts` 的 context 让子页**自己把刷新条登记上来**:
 * 子页挂载即 publish,卸载即收回(null),切子页时旧动作自动消失。
 *
 * ⚠️ 本壳不渲染顶栏主导航(NavTabs 由 App.tsx 统一提供),只负责子标题与子页切换。
 * 子页导航状态在 ModelsPage 内部管理(桌面端无 URL)。
 */
import React from "react";
import LogicalModelsPage from "./LogicalModelsPage";
import DeploymentsPage from "./DeploymentsPage";
import ChannelsPage from "./ChannelsPage";
import ProvidersPage from "./ProvidersPage";
import { ModelsActionProvider } from "./models-action";
import type { ChannelActionSpec, ModelsActionPublisher } from "./models-action";

export type { ChannelActionSpec };
export { useModelsActionPublisher } from "./models-action";

export interface ModelsPageProps {
  /** 初始子页 key(默认「逻辑模型」)。 */
  initialSub?: string;
  /** 壳自己的主动作(子页没登记时用;默认无)。 */
  action?: ChannelActionSpec | null;
}

// 子标题(2026-11-07 合并定案):四个渠道子页合成「渠道」一张卡列表页,
// WorkBuddy 从导航隐藏(渠道本身仍在,签到/额度照常聚合)。
const SUBS = [
  { key: "logical", label: "逻辑模型" },
  { key: "overview", label: "模型总览" },
  { key: "channels", label: "渠道" },
  { key: "suppliers", label: "兼容供应商" },
];

export function ModelsPage({ initialSub = "logical", action = null }: ModelsPageProps): React.JSX.Element {
  const [sub, setSub] = React.useState<string>(initialSub);
  /** 当前子页登记的刷新条(子页切换时旧的那份会被 cleanup 收回)。 */
  const [subAction, setSubAction] = React.useState<ChannelActionSpec | null>(null);
  const on = SUBS.some((s) => s.key === sub) ? sub : SUBS[0].key;

  /** ⚠️ 回调必须稳定:它经 context 下发,一旦每帧都变,子页的登记 effect 会互相打架。 */
  const publish = React.useCallback<ModelsActionPublisher>((spec) => {
    setSubAction(spec);
  }, []);

  /** 切子页时先清掉上一个子页的动作,避免「Trae 的刷新按钮点下去刷新 Qoder」。 */
  const select = React.useCallback((key: string) => {
    setSubAction(null);
    setSub(key);
  }, []);

  const shown = subAction ?? action;

  return (
    <div className="page">
      <h1 className="page-title">As One · 模型</h1>

      <nav className="subtabs">
        {SUBS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`subtab${s.key === on ? " on" : ""}`}
            onClick={() => select(s.key)}
          >
            {s.label}
          </button>
        ))}
        {shown ? (
          <div className="subtabs-action">
            {shown.note ? (
              <span className={`act-note${shown.noteBusy ? " busy" : ""}`} title={shown.note}>
                {shown.note}
              </span>
            ) : null}
            <button type="button" className="act-btn" disabled={shown.disabled} onClick={() => shown.run()}>
              {shown.label}
            </button>
          </div>
        ) : null}
      </nav>

      <ModelsActionProvider value={publish}>
        {on === "logical" ? <LogicalModelsPage /> : null}
        {on === "overview" ? <DeploymentsPage /> : null}
        {on === "channels" ? <ChannelsPage /> : null}
        {on === "suppliers" ? <ProvidersPage /> : null}
      </ModelsActionProvider>
    </div>
  );
}

export default ModelsPage;
