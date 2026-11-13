#!/usr/bin/env node
/**
 * scripts/launch-dev-dsh.mjs — launch a SECOND DeepSeek Harness instance with a
 * custom dev profile, alongside the user's running desktop instance.
 *
 * Mechanism (verified against app.asar sources, see docs/dev-profile-launch.md):
 *   The desktop app's node child runs @deepseek-ai/dsh-desktop-host/lib/index.js
 *   which HARDCODES profile "desktop" and port 19387 — it cannot be pointed at a
 *   custom profile. The supported second-instance path is the CLI entry instead:
 *   the same Node runtime (DeepSeek Harness.exe with ELECTRON_RUN_AS_NODE=1) runs
 *   .../dsh-desktop-host/lib/cli.js, which parses `--profile <name>` and boots
 *   that profile. The web profile's dsh-web-app/startup consumes `--port <n>`
 *   (via ctx.webStartup.port) and --no-open. Base bundles (@deepseek-ai/dsh-base,
 *   @deepseek-ai/dsh-web-app) resolve from the ASAR installation scope, so a fresh
 *   profile needs NO node_modules for the base bundles.
 *
 * Usage:
 *   node scripts/launch-dev-dsh.mjs [--port 19388] [--profile as-one-dev]
 *       [--exe <DeepSeek Harness.exe>] [--home <dsh home>] [--once] [--no-hmr]
 *
 *   --once   : print ready info, then cleanly shut the instance down and exit
 *              (used for CI / boot verification; leaves no orphan processes).
 *   --no-hmr : skip ensuring the dsh-hmr source-watch patch in the profile.
 *
 * Safety: never touches profiles\desktop, never kills the user's desktop instance.
 * Only ever operates on profiles\<profile> in the chosen home, and kills only the
 * process tree it spawned itself.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { pathToFileURL, fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(SCRIPT_DIR, "..");
const PLUGIN_SRC = path.join(WORKSPACE_ROOT, "packages", "dsh-plugin", "src");
const DEFAULT_EXE = "D:\\Program Files\\deepseek HARNESS\\DeepSeek Harness.exe";
const READY_RE = /dsh web: (http:\/\/\S+)/;

function parseArgs(argv) {
  const out = { port: 19388, profile: "as-one-dev", once: false, hmr: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--once") out.once = true;
    else if (a === "--no-hmr") out.hmr = false;
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--profile") out.profile = argv[++i];
    else if (a === "--exe") out.exe = argv[++i];
    else if (a === "--home") out.home = argv[++i];
    else { console.error(`launch-dev-dsh: unknown option ${a}`); process.exit(2); }
  }
  return out;
}

function findExe(explicit) {
  if (explicit) return explicit;
  if (process.env.DSH_EXE) return process.env.DSH_EXE;
  if (fs.existsSync(DEFAULT_EXE)) return DEFAULT_EXE;
  // Fallback: discover through the `dsh` CLI shim on PATH (dsh.cmd embeds the exe path).
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const name of ["dsh.cmd", "dsh"]) {
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) continue;
      try {
        const text = fs.readFileSync(p, "utf8");
        const m = text.match(/["']?([A-Za-z]:\\[^"'\r\n]*DeepSeek Harness\.exe)["']?/i);
        if (m && fs.existsSync(m[1])) return m[1];
      } catch {}
    }
  }
  throw new Error("Cannot locate DeepSeek Harness.exe — pass --exe <path> or set DSH_EXE");
}

function tcpOpen(port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.setTimeout(timeoutMs, () => { s.destroy(); resolve(false); });
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
  });
}

async function waitFor(pred, timeoutMs, stepMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return false;
}

function killTree(pid) {
  try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" }); return true; } catch { return false; }
}

async function runInit(exe, cliJs, profile, home, env) {
  // `--dump-config` with --from-default-profile initializes the profile via
  // initializeProfileFromDefault (writes package.json/cordis.patch.yml/pnpm-workspace.yaml)
  // and exits 0 — it does NOT boot a server.
  return new Promise((resolve, reject) => {
    const c = spawn(exe, ["--expose-internals", cliJs, "--profile", profile, "--from-default-profile", "web", "--dump-config"], {
      env: { ...env, DSH_HOME: home }, stdio: "ignore",
    });
    c.on("error", reject);
    c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`profile init failed with exit code ${code}`))));
  });
}

function ensureHmrPatch(profileDir, pluginSrc, baseUrl, verbose) {
  if (!fs.existsSync(path.join(profileDir, "package.json"))) return false;
  const patchFile = path.join(profileDir, "cordis.patch.yml");
  let patch = fs.readFileSync(patchFile, "utf8");
  if (patch.includes("- id: hmr")) return false;
  const rootYaml = JSON.stringify(pluginSrc); // double-escaped by JSON for YAML string
  const entry = [
    "# hmr: watch the @as-one/plugin source tree for hot reload (added by launch-dev-dsh.mjs).",
    "# base MUST be a file:// URL - a bare Windows path breaks the Hmr constructor.",
    "- id: hmr",
    "  name: '@deepseek-ai/dsh-hmr'",
    "  config:",
    `    base: ${baseUrl}`,
    "    root:",
    `      - ${rootYaml}`,
    "",
  ].join("\n");
  // Replace the template's empty `[]` line (multiline) or append after the header.
  if (/^\s*\[\s*\]\s*$/m.test(patch)) {
    patch = patch.replace(/^\s*\[\s*\]\s*$/m, entry.trimEnd());
  } else {
    patch = patch.replace(/\s*$/, "\n") + entry;
  }
  fs.writeFileSync(patchFile, patch);
  if (verbose) console.log(`launch-dev-dsh: ensured dsh-hmr patch in ${patchFile}`);
  return true;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const exe = findExe(opts.exe);
  const home = opts.home ?? process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
  const profileDir = path.join(home, "profiles", opts.profile);
  const cliJs = path.join(path.dirname(exe), "resources", "app.asar", "dsh", "node_modules", "@deepseek-ai", "dsh-desktop-host", "lib", "cli.js");
  // The dev instance's plugin data dir must NOT be the plugin default (~/.as-one):
  // that WAL database is shared with the desktop instance's plugin copy. Isolate it
  // under the dev home unless the caller explicitly overrides.
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    DSH_HOME: home,
    AS_ONE_DATA_DIR: process.env.AS_ONE_DATA_DIR ?? path.join(home, "as-one-data"),
  };

  console.log(`launch-dev-dsh: exe=${exe}\n                 profile=${opts.profile}  home=${home}  port=${opts.port}`);

  // 1. Ensure the profile exists (self-bootstrapping).
  if (!fs.existsSync(path.join(profileDir, "package.json"))) {
    console.log("launch-dev-dsh: profile missing — initializing from the web template...");
    await runInit(exe, cliJs, opts.profile, home, env);
    console.log(`launch-dev-dsh: profile initialized at ${profileDir}`);
  }

  // 2. Ensure the hmr source-watch patch (harmless while packages/dsh-plugin/src
  //    does not exist yet; becomes active automatically once it appears).
  if (opts.hmr) {
    ensureHmrPatch(profileDir, PLUGIN_SRC, pathToFileURL(WORKSPACE_ROOT + path.sep).href, true);
  }

  // 3. Port must be free (the desktop instance owns 19387; ours defaults to 19388).
  if (await tcpOpen(opts.port)) {
    console.error(`launch-dev-dsh: port ${opts.port} is already in use — refusing to start (choose another with --port)`);
    process.exit(1);
  }

  // 4. Spawn the second instance through the CLI entry (pure Node child — no Chromium flags needed).
  //    Default dataDir is isolated from ~/.as-one (the plugin's default) so that this dev
  //    instance never shares the WAL database with the desktop instance's plugin copy.
  const child = spawn(exe, ["--expose-internals", cliJs, "--profile", opts.profile, "--no-open", "--port", String(opts.port)], {
    env, stdio: ["ignore", "pipe", "pipe"], windowsHide: false,
  });
  let captured = "";  const tail = [];
  const forward = (d) => {
    captured += d.toString();
    process.stdout.write(d);
  };
  child.stdout.on("data", forward);
  child.stderr.on("data", forward);
  child.on("exit", (code) => { tail.push(`(child exited with code ${code})`); });

  // 5. Wait for readiness: TCP + any HTTP response on the port.
  console.log(`launch-dev-dsh: waiting for http://127.0.0.1:${opts.port}/ ...`);
  const started = await waitFor(
    async () => {
      try { const r = await fetch(`http://127.0.0.1:${opts.port}/`, { signal: AbortSignal.timeout(800) }); return r.status < 500; }
      catch { return false; }
    },
    120_000,
  );
  if (!started) {
    if (child.exitCode !== null) {
      const lines = captured.split(/\r?\n/).filter(Boolean).slice(-40);
      console.error(`launch-dev-dsh: instance exited early (code ${child.exitCode}); last output:\n` + lines.join("\n"));
    } else {
      console.error("launch-dev-dsh: timeout waiting for the instance to become ready");
    }
    killTree(child.pid);
    process.exit(1);
  }

  // 6. Report readiness (prefer the token URL printed by the web startup service,
  //    which flushes a moment after the port opens — give it a short grace period).
  for (let i = 0; i < 10 && !captured.match(READY_RE); i++) await new Promise((r) => setTimeout(r, 300));
  const readyMatch = captured.match(READY_RE);
  const url = readyMatch?.[1] ?? `http://127.0.0.1:${opts.port}/`;
  let status = null, len = 0;
  try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); status = r.status; len = (await r.text()).length; } catch {}
  console.log(`launch-dev-dsh: READY  url=${url}`);
  if (status !== null) console.log(`launch-dev-dsh: GET ${url} -> HTTP ${status}, ${len} bytes`);

  // 7. --once: shut the instance down cleanly and confirm, else stay attached.
  if (opts.once) {
    console.log("launch-dev-dsh: --once — shutting the dev instance down...");
    killTree(child.pid);
    const closed = await waitFor(async () => !(await tcpOpen(opts.port, 600)), 15_000, 500);
    console.log(closed
      ? `launch-dev-dsh: shutdown confirmed — port ${opts.port} closed, no orphans left`
      : `launch-dev-dsh: WARNING — port ${opts.port} still open after kill`);
    process.exit(closed ? 0 : 1);
  }

  console.log("launch-dev-dsh: dev instance running — press Ctrl+C to stop (kills only its own process tree)");
  await new Promise((resolve) => {
    const stop = () => { killTree(child.pid); resolve(); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("exit", resolve);
  });
  process.exit(0);
}

main().catch((e) => { console.error("launch-dev-dsh:", e.message); process.exit(1); });
