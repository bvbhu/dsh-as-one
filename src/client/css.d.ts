/**
 * CSS 文本模块:打包脚本(bundle-client.mjs)用 esbuild 的 loader "text"
 * 把 `@as-one/panel-ui/src/styles.css` 编译成一个导出字符串的模块。
 */
declare module "*.css" {
  const text: string;
  export default text;
}
