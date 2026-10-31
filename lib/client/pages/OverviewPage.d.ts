/**
 * 总览页(状态行 + 运行中在途租约 + 供应商一览)。
 * 移植自 apps/electron/src/renderer/src/pages/OverviewPage.tsx;
 * api 从 IPC 换成 fetch 层(./api 的 createFetchApi 实例)。
 */
import React from "react";
export declare function OverviewPage(): React.JSX.Element;
