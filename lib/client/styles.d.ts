/**
 * client 半 —— 面板样式注入。
 *
 * 样式源是共享面板包 `@as-one/panel-ui/src/styles.css`(Electron 面板同款);
 * 打包时由 scripts/bundle-client.mjs 通过 loader "text" 内联,并把所有选择器
 * 作用域化到 `.asone-panel`(见 scripts/scope-panel-css.mjs)。这里只把字符串
 * 塞进一个 <style> 标签:零构建期 CSS 依赖,也不污染 DSH 外壳。
 *
 * 另有一份「外壳样式」(SHELL_CSS):只管 DSH 宿主里的滚动容器,共享样式表管不着。
 */
/** 注入共享面板样式(幂等)。 */
export declare function injectAsOneStyles(): void;
