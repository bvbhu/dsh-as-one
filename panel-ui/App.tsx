/**
 * 应用骨架:顶栏四频道导航 + 页面切换(结构 1:1 照搬原 Nexus 面板)。
 *
 * 频道:总览 / 模型 / 用量统计 / 设置(Nexus NavTabs 同款)。
 * 模型频道内部再用子标题切换子页(见 pages/models/ModelsPage.tsx)。
 *
 * 2026-11-03 用户定案「顶栏跟随背景」后加了一层 .app-scroll:
 * 顶栏是固定行(背景透出壁纸),滚动只发生在它下面的 .app-scroll 里 ——
 * 否则透明顶栏 sticky 会被滚上来的卡片穿透。
 */
import React from "react";
import { NavTabs, type NavTabItem } from "./components/NavTabs";
import OverviewPage from "./pages/OverviewPage";
import ModelsPage from "./pages/models/ModelsPage";
import UsageStatsPage from "./pages/UsageStatsPage";
import SettingsPage from "./pages/SettingsPage";

export type PageKey = "overview" | "models" | "usage" | "settings";

export const NAV_ITEMS: NavTabItem[] = [
  { key: "overview", label: "总览" },
  { key: "models", label: "模型" },
  { key: "usage", label: "用量统计" },
  { key: "settings", label: "设置" },
];

export function App(): React.JSX.Element {
  const [page, setPage] = React.useState<PageKey>("overview");

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">As One · 合一</span>
        <NavTabs tabs={NAV_ITEMS} active={page} onChange={(k) => setPage(k as PageKey)} />
      </header>
      <div className="app-scroll">
        <main className="content">
          {page === "overview" ? <OverviewPage /> : null}
          {page === "models" ? <ModelsPage /> : null}
          {page === "usage" ? <UsageStatsPage /> : null}
          {page === "settings" ? <SettingsPage /> : null}
        </main>
      </div>
    </div>
  );
}
