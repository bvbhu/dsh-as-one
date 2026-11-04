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
import panelCss from "@as-one/panel-ui/src/styles.css";
const STYLE_TAG_ID = "as-one-plugin-styles";
const SHELL_STYLE_TAG_ID = "as-one-plugin-shell-styles";
/**
 * DSH 外壳下的滚动容器。
 *
 * 宿主的三栏骨架(`dsh-client-ui-layout/AppFrame.module.css`)中列是
 * `.BynINW_centerCol{display:flex;flex-direction:column;overflow:hidden}`,
 * 槽位锚点是 `display:contents`,所以 `.asone-panel` 正是中列的**直接 flex item**。
 * 而 flex item 默认 `min-height:auto`(内容多高就多高),于是长页面会把中列撑破,
 * 再被中列的 `overflow:hidden` 裁掉 —— 底部永远够不着。
 *
 * 四条规则缺一不可:
 * - `flex:1 1 auto`  占满中列高度(中列高度由 grid 行 `minmax(0,1fr)` 给定,是确定的);
 * - `min-height:0`   解除 flex item 的自动最小尺寸,内容超高时允许收缩 —— 没有它就撑破;
 * - `overflow-y:auto` 让本元素成为真正的滚动容器;
 *   (overflow-x 保持 visible 会被计算成 auto,宽表格仍能横向滚);
 * - 滚动条样式     与共享样式表内部滚动区一致(8px / #3a4a5e)。
 *   共享表里的 `.asone-panel ::-webkit-scrollbar` 是后代选择器,管不到容器自身。
 *
 * 共享样式表作用域化后还有一条 `.asone-panel{height:100%}`(`html/body/#root` 那条
 * 被改写过来的):它让百分比高度有确定的参照,与上面的 flex 规则不冲突,一并生效。
 *
 * 顶栏 `.topbar` 2026-11-03 起不再是 position:sticky —— 它现在是 .app 里
 * 不滚动的那一行(背景透出壁纸),滚动发生在 `.app-scroll`(.app 撑满本元素高度,
 * .app-scroll 是 flex:1 + overflow-y:auto 的真滚动容器)。
 * 所以本元素的 `overflow-y:auto` 平时不会真的滚动(内容在 .app-scroll 里滚),
 * 留着是兜底:.app 的百分比高度万一失效,整页仍能滚到底。
 */
const SHELL_CSS = `
.asone-panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e) transparent;
}
.asone-panel::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.asone-panel::-webkit-scrollbar-track {
  background: transparent;
}
.asone-panel::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-scrollbar-bg-l2, #3a4a5e);
  border-radius: 4px;
}
.asone-panel::-webkit-scrollbar-thumb:hover {
  background: var(--dsw-alias-scrollbar-hover-l2, #4a5d74);
}
.asone-panel::-webkit-scrollbar-corner {
  background: transparent;
}
`;
/** 注入共享面板样式(幂等)。 */
export function injectAsOneStyles() {
    if (typeof document === "undefined")
        return;
    if (document.getElementById(STYLE_TAG_ID) === null) {
        const el = document.createElement("style");
        el.id = STYLE_TAG_ID;
        el.textContent = panelCss;
        document.head.appendChild(el);
    }
    // 外壳样式后挂:与共享表同特异度时以靠后者为准。
    if (document.getElementById(SHELL_STYLE_TAG_ID) === null) {
        const el = document.createElement("style");
        el.id = SHELL_STYLE_TAG_ID;
        el.textContent = SHELL_CSS;
        document.head.appendChild(el);
    }
}
//# sourceMappingURL=styles.js.map