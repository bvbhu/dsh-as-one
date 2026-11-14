#!/usr/bin/env node
/**
 * 一次性数据迁移:把 `stats_daily` / `stats_external_daily` 里的**历史供应商名**
 * 改写成现行名字(2026-11-14 用户定案:直接 UPDATE,不做读数层映射)。
 *
 * ## 映射表(完整清单,逐条核对过)
 *
 * | 原名 | 改写为 | 处理 |
 * |---|---|---|
 * | workbuddy_yn | hyperai | **改写**(同一上游 ai.hyperai.icu 换过 id,见下) |
 * | workbuddy | workbuddy | 保持(独立渠道,与 hyperai 是两套凭据/额度) |
 * | tokenrhythm | tokenrhythm | 保持(独立中转:tr-alpha-channel / mimo / qwen) |
 * | longcat | longcat | 保持(LongCat-2.5-Preview) |
 * | deepseek-official | deepseek-official | 保持(DeepSeek 官方,模型名也是官方口径) |
 * | stepfun | stepfun | 保持(step-5-preview) |
 * | clawbrain | clawbrain | 保持(clawbrain-pro) |
 * | sensenova / trae / qoder / minimax / maas / opencsg / openrouter / hyperai | 自己 | 保持 |
 *
 * 依据(workbuddy_yn → hyperai):2026-10-29 ~ 10-31 共 23 次请求,只跑
 * `deepseek-v4.1-flash`;上游同为 ai.hyperai.icu;时间上 hyperai 的最后一次用量是
 * 10-27,紧接着就是它 —— 是"自建中转换了个 id",不是两套独立渠道。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/migrate-provider-names.mjs            # 预演(默认,只读)
 * node scripts/migrate-provider-names.mjs --apply    # 真写(先备份,再单事务)
 * ```
 *
 * 安全措施:
 * - 真写前先 `wal_checkpoint(TRUNCATE)` 并把库文件复制成
 *   `<db>.bak-<时间戳>-provider-rename`(库文件是唯一真源,跑前必须留底);
 * - 全程一个 `BEGIN IMMEDIATE` 事务,失败整体回滚;
 * - 目标行已存在(同 day / logical_model / model)时**合并计数**再删旧行,
 *   因为 `stats_daily` 的键含 provider,直接 UPDATE 会撞主键。
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** 逐条改写表:键是原样字符串,值是目标名。只放**已核对**的条目。 */
const RENAMES = {
  workbuddy_yn: "hyperai",
};

/** 已核对、确认不改的历史名(留档,脚本不会碰它们)。 */
const KEEP = [
  "workbuddy",
  "tokenrhythm",
  "longcat",
  "deepseek-official",
  "stepfun",
  "clawbrain",
  "sensenova",
  "trae",
  "qoder",
  "minimax",
  "maas",
  "opencsg",
  "openrouter",
  "hyperai",
];

const COUNTERS = [
  "requests",
  "fails",
  "prompt_tokens",
  "cached_tokens",
  "completion_tokens",
  "latency_sum_ms",
  "ttft_sum_ms",
  "ttft_requests",
];

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

function tableExists(handle, name) {
  return (
    handle.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?").get(name) !==
    undefined
  );
}

function summary(handle, table, column, counter = "requests") {
  if (!tableExists(handle, table)) return [];
  const rows = handle
    .prepare(`SELECT ${column} AS name, COUNT(*) AS rows, SUM(${counter}) AS req FROM ${table} GROUP BY ${column} ORDER BY req DESC`)
    .all();
  return rows.map((r) => ({ name: r.name, rows: Number(r.rows), req: Number(r.req ?? 0) }));
}

/** stats_external_daily 没有 requests 列 —— 统一用 rowid 取行,合并/改写都靠它定位。 */
function rowsOf(table, from) {
  return db.prepare(`SELECT rowid AS rid, * FROM ${table} WHERE provider = ?`).all(from);
}

console.log(`库:${dbPath}`);
console.log(`模式:${apply ? "真写(会先备份)" : "预演(只读,不改一个字)"}`);
console.log("\n── 改写前的 provider 分布(stats_daily)──");
for (const r of summary(db, "stats_daily", "provider")) {
  const target = RENAMES[r.name];
  console.log(`  ${r.name.padEnd(18)} ${String(r.rows).padStart(4)} 行 ${String(r.req).padStart(7)} 请求 ${target ? `→ ${target}` : ""}`);
}

const pending = [];
for (const [from, to] of Object.entries(RENAMES)) {
  const rows = rowsOf("stats_daily", from);
  if (rows.length > 0) pending.push({ table: "stats_daily", from, to, rows });
  if (tableExists(db, "stats_external_daily")) {
    const ext = rowsOf("stats_external_daily", from);
    if (ext.length > 0) pending.push({ table: "stats_external_daily", from, to, rows: ext });
  }
}

if (pending.length === 0) {
  console.log("\n✓ 没有需要改写的行(库里已经都是现行名字)");
  db.close();
  process.exit(0);
}

console.log("\n── 待改写 ──");
for (const p of pending) {
  const req = p.rows.reduce((s, r) => s + Number(r.requests ?? r.calls ?? 0), 0);
  console.log(`  ${p.table}: ${p.from} → ${p.to}( ${p.rows.length} 行 / ${req} 次 )`);
}

if (!apply) {
  console.log("\n(预演结束。确认无误后加 --apply 真写)");
  db.close();
  process.exit(0);
}

// ── 备份 → 单事务改写 ────────────────────────────────────────────────
// 备份用 `VACUUM INTO`:它按当前事务快照写出一份完整库文件,不会像直接 copy
// 那样只拷主文件而丢掉还留在 -wal 里的最新提交。
const backup = `${dbPath}.bak-${stamp}-provider-rename`;
db.prepare("VACUUM INTO ?").run(backup);
db.close();
console.log(`\n已备份:${backup}`);

const rw = new DatabaseSync(dbPath);
rw.exec("PRAGMA busy_timeout = 5000;");
rw.exec("BEGIN IMMEDIATE");
try {
  let moved = 0;
  let merged = 0;
  for (const p of pending) {
    const hasLogical = p.table === "stats_daily";
    for (const row of p.rows) {
      const keySql = hasLogical
        ? "day = ? AND logical_model IS ? AND provider = ? AND model = ?"
        : "day = ? AND provider = ? AND model = ?";
      const keyArgs = hasLogical
        ? [row.day, row.logical_model, p.to, row.model]
        : [row.day, p.to, row.model];
      const hit = rw.prepare(`SELECT rowid AS rid FROM ${p.table} WHERE ${keySql}`).get(...keyArgs);
      if (hit) {
        // 目标行已存在:把计数加上去,再删旧行(PK 含 provider,不能直接 UPDATE)
        const sets = COUNTERS.filter((c) => Object.prototype.hasOwnProperty.call(row, c))
          .map((c) => `${c} = ${c} + ?`)
          .join(", ");
        const vals = COUNTERS.filter((c) => Object.prototype.hasOwnProperty.call(row, c)).map((c) => Number(row[c] ?? 0));
        if (sets !== "") rw.prepare(`UPDATE ${p.table} SET ${sets} WHERE rowid = ?`).run(...vals, hit.rid);
        rw.prepare(`DELETE FROM ${p.table} WHERE rowid = ?`).run(row.rid);
        merged += 1;
      } else {
        rw.prepare(`UPDATE ${p.table} SET provider = ? WHERE rowid = ?`).run(p.to, row.rid);
        moved += 1;
      }
    }
  }
  rw.exec("COMMIT");
  console.log(`✓ 完成:改了 ${moved} 行,合并进已有行 ${merged} 行`);
} catch (err) {
  rw.exec("ROLLBACK");
  console.error("✗ 改写失败,已回滚:", err);
  rw.close();
  process.exit(1);
}

console.log("\n── 改写后(stats_daily)──");
for (const r of summary(rw, "stats_daily", "provider")) {
  console.log(`  ${r.name.padEnd(18)} ${String(r.rows).padStart(4)} 行 ${String(r.req).padStart(7)} 请求`);
}
const leftover = Object.keys(RENAMES).filter((from) =>
  rw.prepare("SELECT 1 FROM stats_daily WHERE provider = ? LIMIT 1").get(from) !== undefined,
);
console.log(leftover.length === 0 ? "\n✓ 旧名字已清空" : `\n! 仍有残留:${leftover.join(", ")}`);
console.log(`校验:integrity_check = ${rw.prepare("PRAGMA integrity_check").get().integrity_check}`);
rw.close();
