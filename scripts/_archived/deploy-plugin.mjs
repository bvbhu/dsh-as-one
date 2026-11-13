#!/usr/bin/env node
/**
 * scripts/deploy-plugin.mjs — deploy the local @as-one/plugin build into a
 * DSH plugin directory as a `link:` target.
 *
 * Why a dedicated script:
 *   The workspace package.json (@as-one/plugin) carries `workspace:*` deps and
 *   dev-only scripts — it CANNOT be linked into a profile as-is. What a profile
 *   needs is the *release shape*: the prebuilt self-contained lib/ plus a
 *   package.json whose only runtime dependency is the peer set the host
 *   provides (all optional). The host half (lib/index.js) imports node
 *   builtins only; the client half (lib/client.js) is a CJS bundle that takes
 *   react/react-dom from the host require().
 *
 *   So: build -> strip workspace-only metadata -> write package.json + copy
 *   lib/ + cordis.patch.yml -> the profile references it via `link:<dir>`.
 *
 * Usage:
 *   node scripts/deploy-plugin.mjs [--dest <dir>] [--dry-run] [--no-build]
 *
 *   --dest <dir>  target plugin directory (default: %DSH_HOME%/plugins/as-one,
 *                 i.e. ~/.dsh/plugins/as-one)
 *   --dry-run     print the plan without touching the filesystem
 *   --no-build    skip `pnpm build` and deploy whatever is already in lib/
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, "..");
const PKG_DIR = path.join(WORKSPACE_ROOT, "packages", "dsh-plugin");

function parseArgs(argv) {
  const out = { dest: null, dryRun: false, build: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-build") out.build = false;
    else if (a === "--dest") out.dest = argv[++i];
    else { console.error(`deploy-plugin: unknown option ${a}`); process.exit(2); }
  }
  return out;
}

function defaultDest() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
  return path.join(home, "plugins", "as-one");
}

/** Recursively copy a directory tree, replacing the destination. */
function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dest = path.resolve(opts.dest ?? defaultDest());
  const pkgJsonPath = path.join(PKG_DIR, "package.json");

  if (!fs.existsSync(pkgJsonPath)) {
    console.error(`deploy-plugin: ${pkgJsonPath} not found — run from the as-one workspace root`);
    process.exit(1);
  }
  const src = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

  // 1. Build (optional).
  if (opts.build) {
    console.log("deploy-plugin: building @as-one/plugin ...");
    const r = spawnSync("pnpm", ["build"], { cwd: PKG_DIR, stdio: "inherit", shell: true });
    if (r.status !== 0) {
      console.error("deploy-plugin: build failed");
      process.exit(r.status ?? 1);
    }
  }

  const libDir = path.join(PKG_DIR, "lib");
  if (!fs.existsSync(path.join(libDir, "index.js"))) {
    console.error("deploy-plugin: lib/index.js missing — build first (drop --no-build)");
    process.exit(1);
  }

  // 2. Compose the RELEASE-shape package.json:
  //    keep peerDependencies (optional) + the dsh block; drop workspace:* deps,
  //    devDependencies, build scripts and the "./src/*" export (src is not
  //    shipped — the profile links the built lib only).
  const releasePkg = {
    name: src.name,
    version: src.version,
    description: src.description,
    type: src.type,
    main: src.main,
    types: src.types,
    exports: {
      ".": { types: "./lib/index.d.ts", default: "./lib/index.js" },
      "./client": "./lib/client.js",
      "./cordis.patch.yml": "./cordis.patch.yml",
      "./package.json": "./package.json",
    },
    engines: src.engines,
    peerDependencies: src.peerDependencies,
    peerDependenciesMeta: src.peerDependenciesMeta,
    dsh: src.dsh,
    license: "MIT",
    repository: src.repository ?? { type: "git", url: "git+https://github.com/bvbhu/dsh-as-one.git" },
    keywords: src.keywords ?? ["dsh", "dsh-plugin", "deepseek-harness", "llm-gateway", "as-one"],
  };

  console.log(`deploy-plugin: ${src.name}@${src.version}`);
  console.log(`deploy-plugin:   source  ${PKG_DIR}`);
  console.log(`deploy-plugin:   dest    ${dest}`);
  console.log(`deploy-plugin:   lib     ${(fs.statSync(path.join(libDir, "index.js")).size / 1024 / 1024).toFixed(2)} MB (index.js)`);

  if (opts.dryRun) {
    console.log("deploy-plugin: --dry-run — nothing written");
    return;
  }

  // 3. Write into the destination.
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "package.json"), JSON.stringify(releasePkg, null, 2) + "\n");
  fs.copyFileSync(path.join(PKG_DIR, "cordis.patch.yml"), path.join(dest, "cordis.patch.yml"));

  const destLib = path.join(dest, "lib");
  // Replace lib/ wholesale so stale files from a previous release cannot linger.
  fs.rmSync(destLib, { recursive: true, force: true });
  copyTree(libDir, destLib);

  for (const extra of ["README.md", "LICENSE"]) {
    const from = path.join(PKG_DIR, extra);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dest, extra));
  }

  console.log(`deploy-plugin: DONE — ${dest}`);
  console.log(`deploy-plugin: link it into a profile with:`);
  console.log(`deploy-plugin:   "@as-one/plugin": "link:${dest.replace(/\\/g, "/")}"`);
}

main();
