// Bundle the host half (src/index.ts + all of @as-one/core) into a single
// self-contained lib/index.js so the plugin can be installed into a bare
// dev profile WITHOUT the workspace:* dependency on @as-one/core.
// Run: node scripts/bundle-host.mjs   (after tsc -p tsconfig.build.json for .d.ts)
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";

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
const outfile = join(pkg, "lib", "index.js");

// wipe stale tsc emit of index.js first (tsc output would shadow the bundle)
try { rmSync(outfile); } catch {}

const r = await build({
  entryPoints: [join(pkg, "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  external: ["node:*"],
  // charset 默认是 ascii —— 那会把内联的 DeepSeek 词表(127k 条 merges,大量
  // Ġ/Ċ 这类字节级字符)整片转成 \uXXXX,白白胀大 1MB 多。产物只给 Node 读,
  // UTF-8 原样保留,加载也更快。
  charset: "utf8",
  logLevel: "warning",
  sourcemap: true,
});

if (r.errors.length) {
  console.error(r.errors.map((e) => e.text).join("\n"));
  process.exit(1);
}
console.log(`bundled ${outfile} (${(await import("node:fs")).statSync(outfile).size} bytes)`);
