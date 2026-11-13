/**
 * 客户端路径行(1:1 移植 Nexus ClientPaths.vue)。
 *
 * 行为:输入即存(change/回车落盘);留空保存 = 清除设置、退回自动探测。
 * 只对 provider 自己的行生效(trae 是云端 IDE,无本机客户端,整段不渲染)。
 *
 * ⚠️ 契约:saveClientPath(channel, path) 落盘并返回 ApiResult;检测按钮在
 * Nexus 当前版本没有(输入即存),若页面需要「自动检测」,用 rendererApi.detectClientPath。
 *
 * ⚠️ 2026-11-08:**渠道页已不再渲染本组件**(用户定案「账号接入一律由 Agent
 * 写库,面板不留入口」)。此文件保留只为 `index.ts` 的公共导出与 Agent 侧脚本
 * 复用,不要再把它挂回 ChannelPage。后端 saveClientPath / detectClientPath
 * RPC 同样保留。
 */
import React from "react";

export interface ClientPathRowData {
  channel: string;
  description?: string | null;
  saved_path?: string | null;
  detected_path?: string | null;
  effective_path?: string | null;
  exists?: boolean | null;
  source?: string | null;
}

export interface ClientPathsProps {
  provider: string;
  rows: ClientPathRowData[];
  busy?: boolean;
  onSave: (channel: string, path: string) => void;
  onDetect?: (channel: string) => void;
}

/** 各渠道的典型安装路径 —— 只在「既无已保存、也未探测到」时当占位提示。 */
const EXAMPLE_PATHS: Record<string, string> = {
  trae: "C:\\Program Files\\Trae\\Trae.exe",
  "trae-cn": "C:\\Program Files\\Trae CN\\Trae CN.exe",
  workbuddy: "C:\\Program Files\\WorkBuddy\\WorkBuddy.exe",
  sensenova: "SenseNova 无本机客户端,无需填写",
};

export function ClientPaths({ provider, rows, busy = false, onSave, onDetect }: ClientPathsProps): React.JSX.Element {
  const mine = rows.filter((r) => r.channel === provider && r.channel !== "trae");
  if (mine.length === 0) return <span className="na">无此渠道的客户端路径配置。</span>;

  return (
    <div className="client-paths">
      {mine.map((row) => {
        // 占位提示:优先用真实探测结果(它才是可点的路径),都没有才给该渠道的典型安装位置。
        const placeholder =
          row.effective_path ||
          row.detected_path ||
          EXAMPLE_PATHS[row.channel] ||
          "填客户端可执行文件的完整路径,如 C:\\Program Files\\<厂商>\\<程序>.exe";
        const title = row.saved_path
          ? "当前用的是本页保存的路径(自动探测到的会被它盖住);清空可退回自动探测"
          : "当前用的是自动探测到的路径,填这里可覆盖它。输入完离开输入框即保存";
        const state = row.saved_path ? "已保存" : row.detected_path ? "自动探测" : "未设置";
        return (
          <div key={row.channel} className="cp-row">
            <b>客户端路径</b>
            <input
              type="text"
              className="input cp-input"
              placeholder={placeholder}
              title={title}
              defaultValue={row.effective_path || row.saved_path || ""}
              disabled={busy}
              onBlur={(e) => onSave(row.channel, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            {onDetect ? (
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onDetect(row.channel)}>
                检测
              </button>
            ) : null}
            <span className="cp-state">{state}</span>
          </div>
        );
      })}
    </div>
  );
}

export default ClientPaths;
