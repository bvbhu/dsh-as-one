/**
 * 面板外壳与侧栏图标。
 *
 * 页面本体来自共享视图层 `@as-one/panel-ui`(与 Electron 面板同一套代码):
 * 这里把 `<App />` 放进 `.asone-panel` 作用域(样式由 client.ts 内联注入时
 * 限定在该类下)。
 *
 * `.asone-panel` 同时是滚动容器(规则见 `client/styles.ts` 的 `SHELL_CSS`):
 * 宿主中列是 `display:flex; overflow:hidden`,面板是它的直接 flex item,
 * 不自己滚动的话长页面会被裁掉。
 */

import React from "react";
import { App } from "@as-one/panel-ui";

export function AsOnePanelPage(): React.JSX.Element {
  return (
    <div className="asone-panel">
      <App />
    </div>
  );
}

export type AsOneSidebarIconProps = { size?: number };

/** 侧栏图标:圆环内一条横线,取「一」(One)之意;纯内联 SVG,无外部图标库。 */
export function AsOnePanelIcon({ size = 16 }: AsOneSidebarIconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 12h11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
