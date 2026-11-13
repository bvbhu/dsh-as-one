/**
 * 顶栏频道导航(对齐 Nexus NavTabs.vue:总览 / 模型 / 用量统计 / 设置)。
 *
 * Nexus 版是 `<a>` + URL 路由;桌面端没有 URL,改成受控组件:
 * `tabs` 决定渲染哪些频道,`active` 为当前 key,点击回调 `onChange`。
 */

import React from "react";

export interface NavTabItem {
  key: string;
  label: string;
}

export const DEFAULT_TABS: NavTabItem[] = [
  { key: "overview", label: "总览" },
  { key: "models", label: "模型" },
  { key: "usage", label: "用量统计" },
  { key: "settings", label: "设置" },
];

export function NavTabs({
  tabs = DEFAULT_TABS,
  active,
  onChange,
}: {
  tabs?: NavTabItem[];
  active: string;
  onChange: (key: string) => void;
}): React.JSX.Element {
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`tab${t.key === active ? " on" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
