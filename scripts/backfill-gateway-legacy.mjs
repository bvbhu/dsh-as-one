#!/usr/bin/env node
/**
 * 把会话里**网关历史名**下的调用补进 `stats_daily`(网关那一侧)。
 *
 * ## 背景
 * as-one 插件的 provider 注册名换过几次:`nexus` → `one` → `as-one`(还有个精简版
 * `litenexus`)。外部用量采集把这些名字排除掉(它们不是"网关外"),于是这些调用
 * 既不进 `stats_external_daily`,也不进 `stats_daily` —— 面板能看到、网关看不到。
 *
 * ## 为什么只能补一部分
 * `stats_daily` 从 2026-10-12 起才有数据,而 `litenexus` 只活跃在 10-04 ~ 10-11;
 * `nexus` / `one` / `as-one` 的时段与 `stats_daily` **重叠** —— 那些调用当时已经
 * 被网关自己记进去了(`stats_daily.requests`),再补一遍就是双计。
 *
 * 所以规则是:**只补 `stats_daily` 完全没有记录的日期**。这不是"尽量补",而是
 * "能证明没记过的才补"。
 *
 * ## 落库形态
 * 会话只能看到 DSH 侧的 provider 与**逻辑模型名**,看不到上游是哪家(那是网关
 * 内部调度的结果)。所以:
 *   provider      = `as-one`(网关自己,不是某个上游)
 *   model         = 逻辑模型名(会话里就是这个)
 *   logical_model = 同一个逻辑模型名
 *   requests      = 会话算出的调用次数
 *   latency/ttft  = 0(网关当时没量过,填 0 而不是编一个数)
 *
 * ## 用法
 *   node scripts/backfill-gateway-legacy.mjs            # 预演
 *   node scripts/backfill-gateway-legacy.mjs --apply    # 真写(先 VACUUM INTO 备份)
 */

import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { listSessionFiles, sessionEvents } from "./lib/session-events.mjs";

const APPLY = process.argv.includes("--apply");
const dbArgIdx = process.argv.indexOf("--db");
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? ".";
const DB_PATH =
	dbArgIdx !== -1 && process.argv[dbArgIdx + 1]
		? process.argv[dbArgIdx + 1]
		: join(HOME, ".as-one", "as-one.db");

// ── 1. 生产代码里的折叠逻辑(与实时采集、外部回填同一套)────────────────
const tmpDir = mkdtempSync(join(tmpdir(), "as-one-gwlegacy-"));
const bundlePath = join(tmpDir, "usage-external.mjs");
await build({
	entryPoints: [join(import.meta.dirname, "..", "src", "usage-external.ts")],
	bundle: true,
	platform: "node",
	format: "esm",
	outfile: bundlePath,
	logLevel: "error",
});
const { ExternalUsageFold, GATEWAY_PROVIDER_HISTORY } = await import(pathToFileURL(bundlePath).href);

// ── 2. 回放:只收网关名下的样本 ────────────────────────────────────
const GATEWAY = new Set(GATEWAY_PROVIDER_HISTORY);
const seen = new Set();
/** `day|provider|model` → 累计 */
const agg = new Map();
/** provider → { days:Set, calls, tokens } */
const perProvider = new Map();
let eventCount = 0;

for (const { file } of listSessionFiles(HOME)) {
	const fold = new ExternalUsageFold();
	// 传空 exclude:网关名也放出来,后面自己挑
	for (const event of sessionEvents(file, seen)) {
		eventCount += 1;
		let samples;
		try {
			samples = fold.fold(event, new Set());
		} catch {
			continue;
		}
		for (const s of samples) {
			if (!GATEWAY.has(s.provider)) continue;
			const key = `${s.day}|${s.provider}|${s.model}`;
			const cur = agg.get(key) ?? { calls: 0, prompt: 0, cached: 0, completion: 0 };
			cur.calls += s.calls;
			cur.prompt += s.promptTokens;
			cur.cached += s.cachedTokens;
			cur.completion += s.completionTokens;
			agg.set(key, cur);

			const stat = perProvider.get(s.provider) ?? { days: new Set(), calls: 0, tokens: 0 };
			stat.days.add(s.day);
			stat.calls += s.calls;
			stat.tokens += s.promptTokens + s.completionTokens;
			perProvider.set(s.provider, stat);
		}
	}
}

// ── 3. 对照 stats_daily 的覆盖范围 ─────────────────────────────────
const db = new DatabaseSync(DB_PATH);
const coveredDays = new Set(db.prepare("SELECT DISTINCT day FROM stats_daily").all().map((r) => r.day));
const firstCovered = [...coveredDays].sort()[0] ?? null;

const pending = [];
const skipped = [];
for (const [key, v] of agg) {
	const [day, provider, model] = key.split("|");
	if (coveredDays.has(day)) {
		skipped.push({ day, provider, model, calls: v.calls });
		continue;
	}
	pending.push({ day, provider, model, ...v });
}

// ── 4. 报告 ────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString("en-US");
console.log(`库:${DB_PATH}`);
console.log(`模式:${APPLY ? "真写(会先备份)" : "预演(只读)"}`);
console.log(`事件 ${fmt(eventCount)} 条(已跨会话去重)\n`);

console.log("会话里网关名下的调用:");
for (const [p, s] of [...perProvider.entries()].sort((a, b) => b[1].calls - a[1].calls)) {
	const days = [...s.days].sort();
	console.log(
		`  ${p.padEnd(12)} ${String(fmt(s.calls)).padStart(7)} 次  ${String(fmt(s.tokens)).padStart(14)} tokens  ${days[0]} → ${days.at(-1)}`,
	);
}
console.log(`\nstats_daily 已覆盖 ${coveredDays.size} 天(最早 ${firstCovered ?? "—"});以下日期网关表没有记录,可补:`);

const byDay = new Map();
for (const p of pending) {
	const s = byDay.get(p.day) ?? { calls: 0, tokens: 0, providers: new Set() };
	s.calls += p.calls;
	s.tokens += p.prompt + p.completion;
	s.providers.add(p.provider);
	byDay.set(p.day, s);
}
if (byDay.size === 0) {
	console.log("  (没有可补的日期)");
} else {
	for (const [day, s] of [...byDay.entries()].sort()) {
		console.log(`  ${day}  ${String(fmt(s.calls)).padStart(6)} 次  ${String(fmt(s.tokens)).padStart(13)} tokens  [${[...s.providers].join(", ")}]`);
	}
}
const skippedDays = new Set(skipped.map((s) => s.day));
if (skippedDays.size > 0) {
	console.log(
		`\n跳过 ${skippedDays.size} 天(网关表当天已有记录,再补会双计):${[...skippedDays].sort().join(", ")}`,
	);
}

const planCalls = pending.reduce((a, p) => a + p.calls, 0);
const planTokens = pending.reduce((a, p) => a + p.prompt + p.completion, 0);
console.log(`\n计划写入 ${pending.length} 行 / ${fmt(planCalls)} 次调用 / ${fmt(planTokens)} tokens`);

if (!APPLY) {
	console.log("\n预演结束,没有写入。加 --apply 执行。");
	db.close();
	process.exit(0);
}

// ── 5. 执行 ────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const backup = `${DB_PATH}.bak-${stamp}-gateway-legacy`;
db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`\n已备份:${backup}`);

const insert = db.prepare(
	`INSERT INTO stats_daily
	 (day, logical_model, provider, model, requests, fails, prompt_tokens, cached_tokens, completion_tokens, latency_sum_ms, ttft_sum_ms, ttft_requests)
	 VALUES (?,?,?,?,?,?,?,?,?,0,0,0)`,
);

let written = 0;
db.exec("BEGIN IMMEDIATE");
try {
	for (const p of pending) {
		insert.run(
			p.day,
			p.model, // logical_model
			"as-one", // provider:网关自己,不是上游
			p.model,
			p.calls,
			0,
			p.prompt,
			p.cached,
			p.completion,
		);
		written += 1;
	}
	db.exec("COMMIT");
} catch (err) {
	db.exec("ROLLBACK");
	db.close();
	console.error("\n写入失败,已回滚:", err);
	process.exit(1);
}

const after = db.prepare("SELECT COUNT(*) n, SUM(requests) rq FROM stats_daily").get();
const integrity = db.prepare("PRAGMA integrity_check").get();
db.close();
console.log(`写入 ${written} 行`);
console.log(`stats_daily 合计:${Number(after.n)} 行 / ${fmt(Number(after.rq))} 请求`);
console.log(`integrity_check: ${integrity.integrity_check}`);
