#!/usr/bin/env node
/**
 * 一次性数据搬迁:把**当初从 usage-statistics-panel 导入网关库**的历史行
 * 从 `stats_daily` 挪到 `stats_external_daily`(2026-11-14 用户定案)。
 *
 * ## 为什么这些行不属于网关
 *
 * 逐值核对过(本机 1.0MB 的 `$DSH_HOME/storages/usage_history.json`):
 * 同一 (day, provider, model) 上两者的 `requests` / `cacheReadTokens` /
 * `outputTokens` **完全相等**,`stats_daily.prompt_tokens` = 面板
 * `inputTokens + cacheReadTokens`(prompt 含 cached,与面板 `inputTokens` 不含
 * cached 的差就是这一项)。provider 名也做了改写(`sensenova-1` → `sensenova`,
 * `tokenrhythm-2` → `tokenrhythm`)。也就是说这批数字是 **DSH 直连**的用量,
 * 网关从来没处理过,放在 `stats_daily` 里等于把 85% 的外部用量算成网关用量。
 *
 * ## 判定条件(为什么可靠)
 *
 * 导入只写了计数列,**没写延迟**:`latency_sum_ms = 0 AND ttft_requests = 0`。
 * 实测交集干净:
 * - `latency_sum_ms = 0 AND ttft_requests > 0` → 0 行;
 * - `latency_sum_ms = 0 AND logical_model IS NOT NULL` → 0 行;
 * - 混合日(10-12 ~ 10-17)里那 8 行零延迟数据,逐条与面板 `requests` 对得上(2914 / 104 / 30 / 172 / 22 / 443 / 187 / 1140)。
 *
 * ## 列映射
 *
 * | stats_daily | stats_external_daily | 说明 |
 * |---|---|---|
 * | `requests` | `calls` | 面板的 requests 本来就是**上游调用数**(step/start + 重试) |
 * | `prompt_tokens` | `prompt_tokens` | 两边同口径(含 cached) |
 * | `cached_tokens` | `cached_tokens` | 直接搬运 |
 * | `completion_tokens` | `completion_tokens` | 直接搬运 |
 * | `latency_sum_ms` / `ttft_*` / `fails` | —— | 导入时就没有,丢弃 |
 * | —— | `last_seen` | 填该日 23:59:59.999 的本地 epoch ms(只知道"那天有量") |
 *
 * ## 用法
 *
 * ```bash
 * node scripts/migrate-imported-to-external.mjs            # 预演
 * node scripts/migrate-imported-to-external.mjs --apply     # 真搬(先备份)
 * ```
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** 导入行的判定条件(见文件头「判定条件」)。 */
const IMPORTED_WHERE = "latency_sum_ms = 0 AND ttft_requests = 0 AND ttft_sum_ms = 0";

function argOf(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const apply = process.argv.includes("--apply");
const dbPath = argOf("--db", join(homedir(), ".as-one", "as-one.db"));
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");

if (!existsSync(dbPath)) {
  console.error(`✗ 找不到库:${dbPath}`);
  process.exit(2);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000;");

const rows = db
  .prepare(
    `SELECT day, logical_model, provider, model, requests, prompt_tokens, cached_tokens, completion_tokens
       FROM stats_daily WHERE ${IMPORTED_WHERE}
      ORDER BY day, provider, model`,
  )
  .all();

const totals = rows.reduce(
  (acc, r) => {
    acc.calls += Number(r.requests);
    acc.prompt += Number(r.prompt_tokens);
    acc.cached += Number(r.cached_tokens);
    acc.completion += Number(r.completion_tokens);
    return acc;
  },
  { calls: 0, prompt: 0, cached: 0, completion: 0 },
);

const gw = db
  .prepare(
    `SELECT COUNT(*) AS n, SUM(requests) AS rq, SUM(prompt_tokens + completion_tokens) AS tk
       FROM stats_daily WHERE NOT (${IMPORTED_WHERE})`,
  )
  .get();
const ext = db.prepare("SELECT COUNT(*) AS n FROM stats_external_daily").get();

console.log(`库:${dbPath}`);
console.log(`模式:${apply ? "真搬(会先备份)" : "预演(只读)"}`);
console.log(`\n识别为「导入行」:${rows.length} 行`);
console.log(`  调用 ${totals.calls.toLocaleString()} · 输入 ${totals.prompt.toLocaleString()} · 其中缓存 ${totals.cached.toLocaleString()} · 输出 ${totals.completion.toLocaleString()}`);
console.log(`  区间:${rows[0]?.day ?? "—"} → ${rows[rows.length - 1]?.day ?? "—"}`);
console.log(`\n搬完后网关侧剩:${Number(gw.n).toLocaleString()} 行 / ${Number(gw.rq ?? 0).toLocaleString()} 请求 / ${Number(gw.tk ?? 0).toLocaleString()} tokens`);
console.log(`网关外表当前:${Number(ext.n).toLocaleString()} 行`);

const byProvider = new Map();
for (const r of rows) {
  const cur = byProvider.get(r.provider) ?? { rows: 0, calls: 0, tokens: 0 };
  cur.rows += 1;
  cur.calls += Number(r.requests);
  cur.tokens += Number(r.prompt_tokens) + Number(r.completion_tokens);
  byProvider.set(r.provider, cur);
}
console.log("\n── 按供应商(将被搬走的部分)──");
for (const [p, v] of [...byProvider.entries()].sort((a, b) => b[1].tokens - a[1].tokens)) {
  console.log(`  ${p.padEnd(18)} ${String(v.rows).padStart(4)} 行 ${String(v.calls).padStart(7)} 调用 ${String(v.tokens).padStart(13)} tokens`);
}

if (rows.length === 0) {
  console.log("\n✓ 没有需要搬的行(库里已经没有零延迟的导入行)");
  db.close();
  process.exit(0);
}
if (!apply) {
  console.log("\n(预演结束。确认无误后加 --apply 真搬)");
  db.close();
  process.exit(0);
}

// ── 备份 → 单事务搬迁 ────────────────────────────────────────────────
const backup = `${dbPath}.bak-${stamp}-imported-to-external`;
db.prepare("VACUUM INTO ?").run(backup);
db.close();
console.log(`\n已备份:${backup}`);

const rw = new DatabaseSync(dbPath);
rw.exec("PRAGMA busy_timeout = 5000;");
rw.exec("BEGIN IMMEDIATE");
try {
  let inserted = 0;
  let merged = 0;
  for (const r of rows) {
    const lastSeen = new Date(`${r.day}T23:59:59.999`).getTime();
    const hit = rw
      .prepare("SELECT 1 AS ok FROM stats_external_daily WHERE day = ? AND provider = ? AND model = ?")
      .get(r.day, r.provider, r.model);
    if (hit) {
      // 外部表已有同一行(理论上不该发生):计数相加,别覆盖
      rw.prepare(
        `UPDATE stats_external_daily SET
           calls = calls + ?, prompt_tokens = prompt_tokens + ?, cached_tokens = cached_tokens + ?,
           completion_tokens = completion_tokens + ?, last_seen = MAX(last_seen, ?)
         WHERE day = ? AND provider = ? AND model = ?`,
      ).run(
        Number(r.requests),
        Number(r.prompt_tokens),
        Number(r.cached_tokens),
        Number(r.completion_tokens),
        lastSeen,
        r.day,
        r.provider,
        r.model,
      );
      merged += 1;
    } else {
      rw.prepare(
        `INSERT INTO stats_external_daily
           (day, provider, model, calls, prompt_tokens, cached_tokens, completion_tokens, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        r.day,
        r.provider,
        r.model,
        Number(r.requests),
        Number(r.prompt_tokens),
        Number(r.cached_tokens),
        Number(r.completion_tokens),
        lastSeen,
      );
      inserted += 1;
    }
    // 删除按完整键,避免 NULL 键误删(这些行的 logical_model 恒为 NULL)
    rw.prepare(
      "DELETE FROM stats_daily WHERE day = ? AND provider = ? AND model = ? AND logical_model IS ? AND requests = ? AND prompt_tokens = ?",
    ).run(r.day, r.provider, r.model, r.logical_model, Number(r.requests), Number(r.prompt_tokens));
  }
  rw.exec("COMMIT");
  console.log(`✓ 完成:写入外部表 ${inserted} 行(合并 ${merged} 行),从网关表删除 ${rows.length} 行`);
} catch (err) {
  rw.exec("ROLLBACK");
  console.error("✗ 搬迁失败,已回滚:", err);
  rw.close();
  process.exit(1);
}

const afterGw = rw
  .prepare(`SELECT COUNT(*) AS n, SUM(requests) AS rq FROM stats_daily WHERE ${IMPORTED_WHERE}`)
  .get();
const afterExt = rw
  .prepare("SELECT COUNT(*) AS n, SUM(calls) AS c, SUM(prompt_tokens + completion_tokens) AS tk FROM stats_external_daily")
  .get();
console.log("\n── 校验 ──");
console.log(`  stats_daily 残留导入行:${Number(afterGw.n)}(应为 0)`);
console.log(`  stats_external_daily:${Number(afterExt.n)} 行 / ${Number(afterExt.c ?? 0).toLocaleString()} 调用 / ${Number(afterExt.tk ?? 0).toLocaleString()} tokens`);
console.log(`  integrity_check = ${rw.prepare("PRAGMA integrity_check").get().integrity_check}`);
rw.close();
