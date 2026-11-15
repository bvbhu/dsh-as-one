#!/usr/bin/env node
/**
 * 一键签到（全部「支持签到」的渠道）。
 *
 * 走 **DSH 面板已有的 HTTP 接口**，不直接读库、不重复实现渠道逻辑：
 *   - 状态：`POST /as-one/api/checkinOverview`（只读，不发领取请求）
 *   - 领取：`POST /as-one/api/checkinAll`，body `[true]`
 *
 * 这样做的理由：签到逻辑（trae 的设备号短路、workbuddy 区域门禁、minimax 的
 * token 续期、qoder 的逐账号活动）全在插件里，脚本再实现一遍必然和面板分叉。
 * 脚本只负责「找到面板 → 调接口 → 把结果打成人能看的一张表」。
 *
 * ⚠️ 需要 DSH 应用在运行（面板路由挂在它的 web server 上）。端口每次重启都会变，
 * 所以默认**自动发现**：枚举 "DeepSeek Harness" 进程的监听端口，逐个探
 * `/as-one/api/getDataDir`，命中即用。
 *
 * 用法：
 *   node scripts/checkin-all.mjs              # 真签到
 *   node scripts/checkin-all.mjs --dry-run    # 只看状态，不领取
 *   node scripts/checkin-all.mjs --json       # 机器可读（供巡检脚本用）
 *   node scripts/checkin-all.mjs --url http://127.0.0.1:60871
 *   node scripts/checkin-all.mjs -v           # 打印自动发现过程
 *
 * 退出码：0 = 全部正常（或全部已签）；1 = 有渠道报错 / 仍待签；2 = 找不到面板。
 */

import { execFileSync } from "node:child_process";

const PROBE_TIMEOUT_MS = 4_000;
const CALL_TIMEOUT_MS = 120_000;
const APP_IMAGE = "DeepSeek Harness.exe";

/* ------------------------------------------------------------------ *
 * 参数
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
};

const DRY_RUN = has("--dry-run") || has("--dry");
const AS_JSON = has("--json");
const VERBOSE = has("--verbose") || has("-v");
const EXPLICIT_URL = valueOf("--url") ?? process.env.DSH_WEB_URL;

const say = (msg) => {
  if (!AS_JSON) process.stdout.write(`${msg}\n`);
};
const debug = (msg) => {
  if (VERBOSE && !AS_JSON) process.stderr.write(`[checkin] ${msg}\n`);
};

/* ------------------------------------------------------------------ *
 * 面板地址发现
 * ------------------------------------------------------------------ */

/** `POST <base>/as-one/api/<method>`，成功返回 envelope.value。 */
async function rpc(base, method, args = [], timeoutMs = CALL_TIMEOUT_MS) {
  const res = await fetch(`${base}/as-one/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`面板返回的不是 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  if (!body || body.ok !== true) {
    const err = body?.error ?? {};
    throw new Error(`${method} 失败：${err.message ?? `HTTP ${res.status}`}`);
  }
  return body.value;
}

/** 枚举本机 "DeepSeek Harness" 进程持有的 TCP 监听端口（Windows）。 */
function listeningPortsOf() {
  const pids = new Set();
  try {
    const out = execFileSync("tasklist", ["/FI", `IMAGENAME eq ${APP_IMAGE}`, "/FO", "CSV", "/NH"], {
      encoding: "utf8",
      windowsHide: true,
    });
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^"[^"]+","(\d+)"/);
      if (m) pids.add(m[1]);
    }
  } catch (err) {
    debug(`tasklist 失败：${err.message}`);
  }
  const ports = new Set();
  try {
    const out = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true });
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (m && (pids.size === 0 || pids.has(m[2]))) ports.add(Number(m[1]));
    }
  } catch (err) {
    debug(`netstat 失败：${err.message}`);
  }
  return [...ports].sort((a, b) => a - b);
}

/** 找到面板地址：显式 > 自动发现。 */
async function resolveBase() {
  if (EXPLICIT_URL) {
    debug(`使用显式地址 ${EXPLICIT_URL}`);
    return EXPLICIT_URL.replace(/\/+$/, "");
  }
  const candidates = listeningPortsOf().map((p) => `http://127.0.0.1:${p}`);
  if (candidates.length === 0) {
    throw new Error(
      `没有发现 ${APP_IMAGE} 的监听端口 —— DSH 应用没在运行？也可以显式指定：--url http://127.0.0.1:<端口>`,
    );
  }
  debug(`候选端口：${candidates.join(", ")}`);
  for (const base of candidates) {
    try {
      await rpc(base, "getDataDir", [], PROBE_TIMEOUT_MS);
      debug(`命中 ${base}`);
      return base;
    } catch (err) {
      debug(`${base} 不是面板：${err.message.slice(0, 80)}`);
    }
  }
  throw new Error(
    `候选端口都没有面板接口（${candidates.join(", ")}）。可以显式指定：--url http://127.0.0.1:<端口>`,
  );
}

/* ------------------------------------------------------------------ *
 * 输出
 * ------------------------------------------------------------------ */

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 一个渠道行 → 一行文本。 */
function rowOf(c) {
  const accounts = num(c?.accounts) ?? 0;
  const checkedIn = num(c?.checkedIn);
  const pending = num(c?.pending);
  const credit = num(c?.perAccountCredit) ?? num(c?.dailyCredit);
  const parts = [`账号 ${accounts}`];
  if (checkedIn !== null) parts.push(`已签 ${checkedIn}`);
  if (pending !== null) parts.push(`待签 ${pending}`);
  if (credit !== null && credit > 0) {
    parts.push(c?.perAccountCredit != null ? `每号 ${credit}` : `今日 ${credit}`);
  }
  if (num(c?.streak) !== null && c.streak > 0) parts.push(`连签 ${c.streak}`);
  return {
    provider: c?.provider ?? "?",
    label: c?.label ?? c?.provider ?? "?",
    supported: c?.supported !== false,
    accounts,
    checkedIn,
    pending,
    credit,
    note: c?.error ?? c?.reason ?? "",
    detail: parts.join(" · "),
  };
}

function printTable(rows, title) {
  say(`\n${title}`);
  const head = ["渠道", "状态", "明细", "备注"];
  const body = rows.map((r) => [
    `${r.label}`,
    r.supported ? (r.pending === 0 ? "已签" : r.pending === null ? "未知" : "待签") : "不支持",
    r.detail,
    r.note || "—",
  ]);
  const widths = head.map((h, i) => Math.max(h.length * 2, ...body.map((b) => (b[i] ?? "").length)));
  const fmt = (cells) => cells.map((c, i) => pad(c ?? "", widths[i])).join("  ");
  say(fmt(head));
  say(widths.map((w) => "-".repeat(w)).join("  "));
  for (const b of body) say(fmt(b));
}

/** 中英混排按「东亚宽字符=2」对齐（够用即可，不引第三方）。 */
function pad(s, width) {
  let w = 0;
  for (const ch of s) w += /[\u1100-\u115f\u2e80-\ua4cf\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(ch) ? 2 : 1;
  return s + " ".repeat(Math.max(0, width - w));
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function main() {
  let base;
  try {
    base = await resolveBase();
  } catch (err) {
    say(`✗ ${err.message}`);
    process.exitCode = 2;
    return;
  }
  debug(`面板：${base}`);

  if (DRY_RUN) {
    const overview = await rpc(base, "checkinOverview");
    const rows = (overview?.channels ?? []).map(rowOf);
    if (AS_JSON) {
      process.stdout.write(`${JSON.stringify({ mode: "dry-run", base, channels: rows }, null, 2)}\n`);
    } else {
      printTable(rows, `签到状态（只读，未领取）  ${new Date().toLocaleString("zh-CN")}`);
    }
    const bad = rows.filter((r) => r.supported && r.note);
    if (bad.length > 0) process.exitCode = 1;
    return;
  }

  const result = await rpc(base, "checkinAll", [true]);
  const rows = (result?.channels ?? []).map(rowOf);
  if (AS_JSON) {
    process.stdout.write(
      `${JSON.stringify({ mode: "claim", base, ok: Boolean(result?.ok), message: result?.message ?? "", channels: rows }, null, 2)}\n`,
    );
  } else {
    printTable(rows, `签到结果  ${new Date().toLocaleString("zh-CN")}`);
    say(`\n${result?.ok ? "✓" : "✗"} ${result?.message ?? "(无摘要)"}`);
  }
  const bad = rows.filter((r) => r.supported && r.note);
  if (!result?.ok || bad.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  say(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
