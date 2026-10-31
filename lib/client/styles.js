/**
 * client 半 —— 面板样式注入。
 *
 * 样式源是共享面板包 `@as-one/panel-ui/src/styles.css`(Electron 面板同款);
 * 打包时由 scripts/bundle-client.mjs 通过 loader "text" 内联,并把所有选择器
 * 作用域化到 `.asone-panel`(见 scripts/scope-panel-css.mjs)。这里只把字符串
 * 塞进一个 <style> 标签:零构建期 CSS 依赖,也不污染 DSH 外壳。
 */
import panelCss from "@as-one/panel-ui/src/styles.css";
const STYLE_TAG_ID = "as-one-plugin-styles";
/** 注入共享面板样式(幂等)。 */
export function injectAsOneStyles() {
    if (typeof document === "undefined")
        return;
    if (document.getElementById(STYLE_TAG_ID) !== null)
        return;
    const el = document.createElement("style");
    el.id = STYLE_TAG_ID;
    el.textContent = panelCss;
    document.head.appendChild(el);
}
//# sourceMappingURL=styles.js.map