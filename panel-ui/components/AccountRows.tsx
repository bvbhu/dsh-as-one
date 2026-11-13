/**
 * 账号状态行(Trae / WorkBuddy / Qoder / SenseNova 四处共用,2026-10-30 统一样式)。
 *
 * 用户定案的版式(勿自作主张改结构):
 *   第一行 = 账号状态,**一个账号一个框**(多账号就多个框,不要合并进同一个框);
 *     左:用户名(只写名字,**不写 workbuddy 等渠道名**,且加粗);
 *     右:剩余积分 + 最近到期(SenseNova 换成通用积分池 5h 剩余 + 重置时间)。
 *   刷新按钮 = 2026-10-30 第二轮定案**统一上移到子标题行右端**
 *     (见 `pages/models/ModelsPage.tsx` 的 `useModelsActionPublisher`)。
 *   往下 = 模型目录,再往下 = 配置/添加账号。
 *   **不写说明文字**。
 *
 * 这里只负责账号框;刷新条由各页 publish 到子标题行,不再从这个组件渲染。
 */
import React from "react";

export interface AccountRowRight {
  /** 右侧第一枚徽章的文案(已含数字,如「剩余积分」);null 则不摆该徽章。 */
  key: string;
  value: string;
  /** 第二枚徽章(到期/重置);没有就不摆。 */
  sub?: string | null;
  /**
   * `sub` 用**纯文本**而不是徽章(2026-11-08 SenseNova 一行文本规格):
   * `**5h可用 119,839** 重置 12:45  **周可用 914,851** 重置 11-10`
   * 里两段「重置」不是徽章。缺省 false,其它渠道版式不受影响。
   */
  subPlain?: boolean;
  /** ok=绿 / warn=黄 / bad=红;缺省灰。 */
  tone?: "ok" | "warn" | "bad";
}

export interface AccountRow {
  /** 稳定键(用户名)。 */
  id: string;
  /** 左侧显示的用户名(不拼渠道名)。 */
  label: string;
  /** 左侧小字(如 key 指纹 / 套餐);可省。 */
  note?: string | null;
  /** 右侧徽章;null 表示「没数据」——此时右侧只留空,不要写「未知」占位。
   *  数组用于「有两样都要摆」的场合(SenseNova 的通用池 + 专属池)。 */
  right?: AccountRowRight | AccountRowRight[] | null;
  /** 状态点:ok 绿 / bad 红 / off 灰。 */
  dot?: "ok" | "bad" | "off";
}

export interface AccountRowsProps {
  accounts: AccountRow[];
  /** 没有任何账号时的空态(一句话,不要写成长段落)。 */
  emptyText?: string;
  /** 账号框下方的附加内容(如额度读取失败的原因);空态时也会渲染。 */
  footer?: React.ReactNode;
}

/** 账号状态行(第一段):**一个账号一个框**。 */
export function AccountRows({
  accounts,
  emptyText = "暂无账号",
  footer = null,
}: AccountRowsProps): React.JSX.Element {
  if (accounts.length === 0) {
    return (
      <div className="acct-cards">
        <div className="chan-card">
          <p className="chan-empty">{emptyText}</p>
          {footer}
        </div>
      </div>
    );
  }
  return (
    <div className="acct-cards">
      {accounts.map((a) => {
        const rights = a.right == null ? [] : Array.isArray(a.right) ? a.right : [a.right];
        return (
          <div className="chan-card acct-card" key={a.id}>
            <div className="acct-row">
              <div className="acct-row-left">
                <span
                  className={a.dot && a.dot !== "off" ? `dot ${a.dot}` : "dot off"}
                  aria-hidden="true"
                />
                <span className="acct-name">{a.label}</span>
                {a.note ? <span className="chan-sub">{a.note}</span> : null}
              </div>
              <div className="acct-row-right">
                {rights.map((r, i) => (
                  <React.Fragment key={`${r.key}-${i}`}>
                    <span className={r.tone ? `chan-badge ${r.tone}` : "chan-badge"}>
                      {r.key} <b>{r.value}</b>
                    </span>
                    {r.sub ? (
                      <span className={r.subPlain ? "chan-sub acct-inline" : "chan-badge"}>
                        {r.sub}
                      </span>
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
            </div>
            {footer}
          </div>
        );
      })}
    </div>
  );
}

export interface RefreshBarProps {
  /** 「于 x 前刷新」那行说明;空串则不摆。 */
  note?: string | null;
  /** 正在刷新 → 按钮禁用 + 文案换掉。 */
  busy?: boolean;
  /** 未接入/无凭据 → 禁用。 */
  disabled?: boolean;
  label?: string;
  busyLabel?: string;
  onRefresh: () => void;
}

/** @deprecated 2026-10-30 第二轮定案:**刷新按钮已统一上移到子标题行右端**
 *  (见 `pages/models/ModelsPage.tsx` + `models-action.ts`)。本组件只剩「子页被单独
 *  渲染、拿不到 context」这一种兜底场合;正常路径不要再用它。 */
export function RefreshBar({
  note,
  busy = false,
  disabled = false,
  label = "刷新",
  busyLabel = "刷新中…",
  onRefresh,
}: RefreshBarProps): React.JSX.Element {
  return (
    <div className="chan-action">
      <span className={busy ? "act-note busy" : "act-note"}>{note ?? ""}</span>
      <button
        type="button"
        className="act-btn"
        disabled={busy || disabled}
        onClick={onRefresh}
      >
        {busy ? busyLabel : label}
      </button>
    </div>
  );
}

export default AccountRows;
