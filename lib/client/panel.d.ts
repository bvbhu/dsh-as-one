/**
 * 面板外壳与侧栏图标。
 *
 * 页面本体来自共享视图层 `@as-one/panel-ui`(与 Electron 面板同一套代码):
 * 这里只加一行「返回」(回到进入 As One 之前的 DSH 面板),再把 `<App />`
 * 放进 `.asone-panel` 作用域(样式由 client.ts 内联注入时限定在该类下)。
 * t 由 DSH 客户端按注册条目里的 locale 座位注入,goBack 由 main 条目的
 * inject 注入。
 */
import React from "react";
import type { AsOneKey } from "./locales.js";
export type AsOnePanelPageProps = {
    t: (key: AsOneKey) => string;
    goBack: () => void;
};
export declare function AsOnePanelPage({ t, goBack }: AsOnePanelPageProps): React.JSX.Element;
export type AsOneSidebarIconProps = {
    size?: number;
};
/** 侧栏图标:圆环内一条横线,取「一」(One)之意;纯内联 SVG,无外部图标库。 */
export declare function AsOnePanelIcon({ size }: AsOneSidebarIconProps): React.JSX.Element;
