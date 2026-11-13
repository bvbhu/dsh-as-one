// Bundle the client half (src/client.ts + pages/components) into the single
// DSH client-loadable form: window.__ModuleLoader__.load({ id, factory }).
// The DSH browser host is a lazy-CJS module table (dsh-client-modules): a
// plugin client bundle MUST register itself via __ModuleLoader__.load and
// take its react / react-dom / react/jsx-runtime / @deepseek-ai/* from the
// host require() — plain tsc ESM output is NOT loadable there.
// Run: node scripts/bundle-client.mjs   (after tsc -p tsconfig.build.json for .d.ts)
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, rmSync } from "node:fs";

// esbuild is only a transitive dep in the workspace .pnpm store (tsdown pulls it in);
// resolve it from a few candidate locations so this script runs from any cwd.
async function loadEsbuild() {
  const candidates = [
    new URL("../node_modules/esbuild/lib/main.js", import.meta.url),
    new URL("../../../node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js", import.meta.url),
    new URL("../../node_modules/esbuild/lib/main.js", import.meta.url),
    new URL("../../../node_modules/esbuild/lib/main.js", import.meta.url),
  ];
  for (const c of candidates) {
    try {
      return await import(c);
    } catch {}
  }
  throw new Error("esbuild not found — install it or run pnpm install at the workspace root first");
}
const { build } = await loadEsbuild();

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const outfile = join(pkg, "lib", "client.js");

// wipe stale tsc emit of client.js first (tsc output would shadow the bundle)
try { rmSync(outfile); } catch {}

const ID = "@bvbhu/as-one"; // stripClientSuffix normalization: "<id>/client" and bare name both land here
const banner = `window.__ModuleLoader__.load({\n\tid: "${ID}",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n`;
const footer = `\treturn module.exports;\n\t}\n});\n`;

// 共享面板样式:把 @as-one/panel-ui 的 styles.css 作用域化后内联进 bundle
// (loader "text" → 模块默认导出字符串,由 src/client/styles.ts 注入 <style>)。
import { scopePanelCss } from "./scope-panel-css.mjs";
const panelCssPath = join(pkg, "panel-ui", "styles.css");
const panelCss = scopePanelCss(readFileSync(panelCssPath, "utf8"));
console.log(`scoped panel css: ${panelCss.length} chars from ${panelCssPath}`);

const scopedCssPlugin = {
  name: "as-one-scoped-panel-css",
  setup(build) {
    // 单包后没有 @as-one/panel-ui 这个包:把 CSS specifier 直接解析到根目录源码。
    build.onResolve({ filter: /^@as-one\/panel-ui\/src\/styles\.css$/ }, () => ({ path: panelCssPath }));
    // 只按文件名匹配:Windows 路径是反斜杠,`[\/]` 这种写法在 Win 上永不命中,
    // 会让 CSS 退化成空模块(`var styles_default = {}`),样式看起来"没生效"。
    build.onLoad({ filter: /styles\.css$/ }, () => ({
      contents: panelCss,
      loader: "text",
    }));
  },
};

const r = await build({
  entryPoints: [join(pkg, "src", "client.ts")],
  bundle: true,
  platform: "browser",
  format: "cjs",
  jsx: "automatic", // emit require("react/jsx-runtime") for the host to satisfy
  outfile,
  external: ["react", "react-dom", "react/jsx-runtime", "@deepseek-ai/*"],
  banner: { js: banner },
  footer: { js: footer },
  plugins: [scopedCssPlugin],
  logLevel: "warning",
  sourcemap: true,
});

if (r.errors.length) {
  console.error(r.errors.map((e) => e.text).join("\n"));
  process.exit(1);
}
console.log(`bundled ${outfile} (${(await import("node:fs")).statSync(outfile).size} bytes, ${ID})`);
