#!/usr/bin/env node
/**
 * 从 DSH 会话事件回填 `stats_external_daily`(网关外用量)。
 *
 * ## 为什么要有这个脚本
 * 实时采集只覆盖「插件装好之后」的调用。装之前的历史、以及采集器因 bug 空转的那段时间,
 * 会话文件里都有原始记录(`~/.dsh/sessions/**\/session.v4.jsonl.zstd`)。
 * 会话是**一手真源**:面板的 `usage_history.json` 是二手聚合,且受 `storage-json`
 * 的「一进程一 writer / last-write-wins」影响会丢更新(实测某些天只记到 1/5)。
 *
 * ## 口径
 * 直接复用生产代码的 `ExternalUsageFold`(esbuild 现场打包 `src/usage-external.ts`),
 * 所以回填出的数字与实时采集**同一套算规则**:`step/start` 与 `llm/retry-started` 计调用,
 * `assistant/message` 出 token,`prompt = input + cacheRead + cacheWrite`(含 cached),
 * 网关 provider 名整条丢弃,账号级名归到厂商名。
 *
 * ## 与已有数据的关系(重要)
 * 外部表当前的行来自面板导出(2026-08-16 起),与会话在 08-29~10-17 重叠。
 * 同一天两个源**不叠加**,按天二选一:
 *   - 会话当天调用数 ≥ 库里当天调用数 → 用会话整天替换(会话更全);
 *   - 否则保留库里的(说明那天的会话被清理过,是不完整的);
 *   - 会话完全没有的日期(08-16~08-28)原样保留。
 * 这样既不双计,也不会因为某天会话残缺而把已有的数字改小。
 *
 * ## 用法
 *   node scripts/backfill-external-from-sessions.mjs            # 预演(只读)
 *   node scripts/backfill-external-from-sessions.mjs --apply    # 真写(先 VACUUM INTO 备份)
 *   node scripts/backfill-external-from-sessions.mjs --db <路径>
 */

import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { zstdDecompressSync } from "node:zlib";

const APPLY = process.argv.includes("--apply");
const dbArgIdx = process.argv.indexOf("--db");
const DB_PATH =
	dbArgIdx !== -1 && process.argv[dbArgIdx + 1]
		? process.argv[dbArgIdx + 1]
		: join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".as-one", "as-one.db");

// ── 1. 现场打包生产代码里的折叠逻辑(避免脚本里复制一份算规则)─────────
const tmpDir = mkdtempSync(join(tmpdir(), "as-one-backfill-"));
const bundlePath = join(tmpDir, "usage-external.mjs");
await build({
	entryPoints: [join(import.meta.dirname, "..", "src", "usage-external.ts")],
	bundle: true,
	platform: "node",
	format: "esm",
	outfile: bundlePath,
	logLevel: "error",
});
const { ExternalUsageFold, GATEWAY_PROVIDER_HISTORY, renameExternalProvider } =
	await import(pathToFileURL(bundlePath).href);

// ── 2. 读会话文件(zstd 多帧:每次追加会新开一帧)────────────────────
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** 一个 .zstd 文件可能是多帧拼接,逐帧解压后拼回文本。 */
function readZstdFrames(file) {
	const buf = readFileSync(file);
	const cuts = [];
	let i = 0;
	while ((i = buf.indexOf(ZSTD_MAGIC, i)) !== -1) {
		cuts.push(i);
		i += 4;
	}
	if (cuts.length === 0) throw new Error("没有 zstd 帧头: " + file);
	const parts = [];
	let start = 0;
	for (let k = 1; k <= cuts.length; k++) {
		const end = k < cuts.length ? cuts[k] : buf.length;
		try {
			parts.push(zstdDecompressSync(buf.subarray(start, end)));
			start = end;
		} catch {
			// 压缩流内部恰好出现 magic → 把这一段并到下一帧再试
		}
	}
	if (start < buf.length) parts.push(zstdDecompressSync(buf.subarray(start)));
	return Buffer.concat(parts).toString("utf8");
}

function walk(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (e.name.endsWith(".jsonl.zstd")) out.push(p);
	}
	return out;
}

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? ".";
const roots = [join(HOME, ".dsh", "sessions"), join(HOME, ".dsh", "sessions-archive")];

// 同一会话可能在 sessions 与 sessions-archive 各留一份:按会话目录名去重,留文件大的那个。
const bySessionId = new Map();
for (const file of roots.flatMap((r) => walk(r))) {
	const sessionId = file.split(/[\\/]/).at(-2) ?? file;
	const size = readFileSync(file).length;
	const prev = bySessionId.get(sessionId);
	if (!prev || size > prev.size) bySessionId.set(sessionId, { file, size });
}

// ── 3. 回放事件 ────────────────────────────────────────────────────
const GATEWAY = new Set(GATEWAY_PROVIDER_HISTORY);
/** `day|provider|model` → 累计增量 */
const agg = new Map();
let fileCount = 0;
let badFiles = 0;
let eventCount = 0;
let sampleCount = 0;

for (const { file } of bySessionId.values()) {
	let text;
	try {
		text = readZstdFrames(file);
	} catch {
		badFiles += 1;
		continue;
	}
	fileCount += 1;
	const fold = new ExternalUsageFold();
	for (const line of text.split("\n")) {
		if (line === "") continue;
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof event?.type !== "string" || typeof event?.time !== "number") continue;
		eventCount += 1;
		let samples;
		try {
			samples = fold.fold(event, GATEWAY);
		} catch {
			continue;
		}
		for (const s of samples) {
			if (GATEWAY.has(s.provider)) continue;
			const provider = renameExternalProvider(s.provider);
			if (provider === "") continue;
			sampleCount += 1;
			const key = `${s.day}|${provider}|${s.model}`;
			const cur = agg.get(key) ?? { calls: 0, prompt: 0, cached: 0, completion: 0, last: 0 };
			cur.calls += s.calls;
			cur.prompt += s.promptTokens;
			cur.cached += s.cachedTokens;
			cur.completion += s.completionTokens;
			cur.last = Math.max(cur.last, s.at);
			agg.set(key, cur);
		}
	}
}

// ── 4. 与库里现状对照 ──────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);
const existing = db
	.prepare("SELECT day, provider, model, calls, prompt_tokens, cached_tokens, completion_tokens, last_seen FROM stats_external_daily")
	.all();

const dayTotals = (rows) => {
	const m = new Map();
	for (const r of rows) {
		const s = m.get(r.day) ?? { calls: 0, tokens: 0, rows: 0 };
		s.calls += Number(r.calls);
		s.tokens += Number(r.prompt_tokens) + Number(r.completion_tokens);
		s.rows += 1;
		m.set(r.day, s);
	}
	return m;
};

const sessionRows = [...agg.entries()].map(([key, v]) => {
	const [day, provider, model] = key.split("|");
	return { day, provider, model, ...v };
});
const sessionDays = dayTotals(sessionRows);
const existingDays = dayTotals(existing);

const days = [...new Set([...sessionDays.keys(), ...existingDays.keys()])].sort();
const replace = [];
const keep = [];
for (const day of days) {
	const s = sessionDays.get(day);
	const e = existingDays.get(day);
	if (!s) keep.push({ day, reason: "会话没有这天" });
	else if (!e) replace.push({ day, reason: "库里没有这天" });
	else if (s.calls >= e.calls) replace.push({ day, reason: `会话 ${s.calls} ≥ 库里 ${e.calls}` });
	else keep.push({ day, reason: `会话 ${s.calls} < 库里 ${e.calls}(会话被清理过)` });
}

const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
const sessionTotal = {
	calls: sum(sessionRows, (r) => r.calls),
	tokens: sum(sessionRows, (r) => r.prompt + r.completion),
	cached: sum(sessionRows, (r) => r.cached),
};
const existingTotal = {
	calls: sum(existing, (r) => Number(r.calls)),
	tokens: sum(existing, (r) => Number(r.prompt_tokens) + Number(r.completion_tokens)),
	cached: sum(existing, (r) => Number(r.cached_tokens)),
};
const replaceDaysSet = new Set(replace.map((r) => r.day));
const keepDaysSet = new Set(keep.map((k) => k.day));
// 会话行用 prompt/completion,库里旧行用 prompt_tokens/completion_tokens —— 分别取。
const plannedRows = [
	...sessionRows.filter((r) => replaceDaysSet.has(r.day)),
	...existing.filter((r) => keepDaysSet.has(r.day)),
];
let plannedCalls = 0;
let plannedTokens = 0;
for (const r of plannedRows) {
	if (r.prompt !== undefined) {
		plannedCalls += r.calls;
		plannedTokens += r.prompt + r.completion;
	} else {
		plannedCalls += Number(r.calls);
		plannedTokens += Number(r.prompt_tokens) + Number(r.completion_tokens);
	}
}
const plannedTotal = { calls: plannedCalls, tokens: plannedTokens };

// ── 5. 报告 ────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString("en-US");
const pct = (a, b) => (b === 0 ? "—" : `${((a / b) * 100).toFixed(1)}%`);

console.log(`库:${DB_PATH}`);
console.log(`模式:${APPLY ? "真写(会先备份)" : "预演(只读)"}\n`);
console.log(`会话文件 ${bySessionId.size} 个(解析成功 ${fileCount},失败 ${badFiles}),事件 ${fmt(eventCount)},样本 ${fmt(sampleCount)}`);
console.log(`会话侧(排除网关名 + 归并账号名):${fmt(sessionTotal.calls)} 次调用 / ${fmt(sessionTotal.tokens)} tokens`);
console.log(`库里现状:${fmt(existingTotal.calls)} 次调用 / ${fmt(existingTotal.tokens)} tokens,${existing.length} 行\n`);

console.log("按 provider(会话侧):");
const byProv = new Map();
for (const r of sessionRows) {
	const c = byProv.get(r.provider) ?? { calls: 0, tokens: 0, days: new Set() };
	c.calls += r.calls;
	c.tokens += r.prompt + r.completion;
	c.days.add(r.day);
	byProv.set(r.provider, c);
}
for (const [p, v] of [...byProv.entries()].sort((a, b) => b[1].calls - a[1].calls)) {
	console.log(`  ${p.padEnd(20)} ${String(fmt(v.calls)).padStart(8)} 次  ${String(fmt(v.tokens)).padStart(15)} tokens  ${v.days.size} 天`);
}

console.log(`\n替换 ${replace.length} 天 / 保留 ${keep.length} 天`);
console.log("  替换的日期:" + (replace.length ? replace.map((r) => r.day).join(", ") : "(无)"));
const keptWithData = keep.filter((k) => existingDays.has(k.day));
if (keptWithData.length > 0) {
	console.log("  保留的日期(库里有数据):");
	for (const k of keptWithData) console.log(`    ${k.day}  ${k.reason}`);
}
const keptEmpty = keep.filter((k) => !existingDays.has(k.day));
if (keptEmpty.length > 0) console.log(`  另有 ${keptEmpty.length} 天两边都没数据: ${keptEmpty.map((k) => k.day).join(", ")}`);

console.log("\n回填后预计:");
console.log(`  ${fmt(plannedTotal.calls)} 次调用 / ${fmt(plannedTotal.tokens)} tokens,${plannedRows.length} 行`);
console.log(`  (调用 ${pct(plannedTotal.calls, existingTotal.calls)} / tokens ${pct(plannedTotal.tokens, existingTotal.tokens)} 相对现状)`);

if (!APPLY) {
	console.log("\n预演结束,没有写入。加 --apply 执行。");
	db.close();
	process.exit(0);
}

// ── 6. 执行 ────────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const backup = `${DB_PATH}.bak-${stamp}-backfill-sessions`;
db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
console.log(`\n已备份:${backup}`);

const replaceDays = new Set(replace.map((r) => r.day));
const insert = db.prepare(
	"INSERT INTO stats_external_daily (day, provider, model, calls, prompt_tokens, cached_tokens, completion_tokens, last_seen) VALUES (?,?,?,?,?,?,?,?)",
);
const del = db.prepare("DELETE FROM stats_external_daily WHERE day = ?");

let written = 0;
db.exec("BEGIN IMMEDIATE");
try {
	for (const day of replaceDays) {
		del.run(day);
		for (const r of sessionRows) {
			if (r.day !== day) continue;
			insert.run(r.day, r.provider, r.model, r.calls, r.prompt, r.cached, r.completion, Math.round(r.last));
			written += 1;
		}
	}
	db.exec("COMMIT");
} catch (err) {
	db.exec("ROLLBACK");
	db.close();
	console.error("\n写入失败,已回滚:", err);
	process.exit(1);
}

const after = db.prepare("SELECT COUNT(*) n, SUM(calls) c, SUM(prompt_tokens+completion_tokens) t FROM stats_external_daily").get();
const integrity = db.prepare("PRAGMA integrity_check").get();
db.close();
console.log(`写入 ${written} 行,覆盖 ${replaceDays.size} 天`);
console.log(`表内合计:${Number(after.n)} 行 / ${fmt(Number(after.c))} 次调用 / ${fmt(Number(after.t))} tokens`);
console.log(`integrity_check: ${integrity.integrity_check}`);
console.log(`\n回滚:关掉宿主,把备份覆盖回 ${DB_PATH}(同时删掉 -wal/-shm)再启动。`);
