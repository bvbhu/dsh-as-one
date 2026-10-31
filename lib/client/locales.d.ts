/**
 * client 半 —— 面板 locale 字典(locale service 注册用)。
 * 侧栏行 label 与返回按钮走 locale;页面正文沿用 Electron 版中文文案,
 * 故字典只含导航与操作键。
 */
export declare const LOCALE_NS = "asOne";
export type AsOneKey = "nav" | "back";
export declare const zh: Record<AsOneKey, string>;
export declare const en: Record<AsOneKey, string>;
