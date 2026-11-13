/**
 * client 半 —— 面板 locale 字典(locale service 注册用)。
 * 侧栏行 label 走 locale;页面正文沿用 Electron 版中文文案,
 * 故字典只含导航键。
 */

export const LOCALE_NS = "asOne";

export type AsOneKey = "nav";

export const zh: Record<AsOneKey, string> = {
  nav: "As One · 合一",
};

export const en: Record<AsOneKey, string> = {
  nav: "As One · Unity",
};
