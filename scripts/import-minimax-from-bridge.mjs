#!/usr/bin/env node
/**
 * 从 minimax2api(bridge.sqlite3)导入 minimax 账号到 As One(as-one.db)。
 *
 * 为什么是脚本而不是面板 UI:
 *   minimax 的凭据是「设备指纹 + access/refresh token」的整套快照(uuid / device_id /
 *   user_id),面板上手工粘贴既易漏字段又无法校验 —— 先走一次性迁移把现有账号搬过来,
 *   等接入「扫码/设备码登录」再补 UI。
 *
 * 用法:
 *   node scripts/import-minimax-from-bridge.mjs            # 预览(dry-run,默认)
 *   node scripts/import-minimax-from-bridge.mjs --apply    # 真写入
 *
 * 目标:
 *   - provider 行:`minimax` / protocol=minimax / env_prefix=MINIMAX_TOKEN;
 *   - credential 行:username = minimax2api 的 account.id,secret = token,
 *     refresh_secret = refresh_token,expires_at = token_expires_at(秒),
 *     raw_json = { kind, region, uuid, device_id, user_id, agent_id, ... }。
 *
 * 幂等:已存在的 (minimax, username) 行会被**更新**,不会重复插入;不删除任何行。
 */

import { existsSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SRC = process.env.MINIMAX_BRIDGE_DB ?? "D:/projects/minimax2api/minimax2api/data/bridge.sqlite3";
const DST = process.env.AS_ONE_DB ?? join(process.env.USERPROFILE ?? "", ".as-one", "as-one.db");
const APPLY = process.argv.includes("--apply");

const PROVIDER = "minimax";
const PROVIDER_ROW = {
  id: PROVIDER,
  base_url: null,
  protocol: "minimax",
  env_prefix: "MINIMAX_TOKEN",
};

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!existsSync(SRC)) fail(`找不到源库: ${SRC}`);
if (!existsSync(DST)) fail(`找不到目标库: ${DST}(As One 至少要先启动过一次)`);

/** 读源库里的 cn 账号。 */
function readSource() {
  const db = new DatabaseSync(SRC, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT id, kind, region, token, refresh_token, user_id, agent_id, device_id, uuid,
                screen_width, screen_height, base_url, identifier, email, source,
                token_expires_at, enabled
           FROM accounts
          WHERE region = 'cn'
          ORDER BY created_at`,
      )
      .all();
    return rows;
  } finally {
    db.close();
  }
}

/** token_expires_at 在源库是 epoch 秒(float);As One 的 expires_at 也是秒。 */
function expiresOf(row) {
  const v = row.token_expires_at;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return null;
}

function rawOf(row) {
  return {
    kind: row.kind,
    region: row.region,
    uuid: row.uuid,
    device_id: row.device_id,
    user_id: row.user_id,
    agent_id: row.agent_id,
    screen_width: row.screen_width ?? 0,
    screen_height: row.screen_height ?? 0,
    base_url: row.base_url ?? "",
    identifier: row.identifier ?? "",
    source: row.source ?? "",
  };
}

/**
 * 写目标库。
 *
 * ⚠️ 先做一份 WAL 一致性的备份:目标库正在被运行中的 DSH 使用(–wal/–shm 存在),
 * 直接 insert 虽然安全,但出问题时没有回退点。
 */
function applyToTarget(accounts) {
  let db;
  try {
    db = new DatabaseSync(DST);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");

    db.prepare(
      `INSERT INTO provider (id, base_url, protocol, env_prefix)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         base_url = excluded.base_url,
         protocol = excluded.protocol,
         env_prefix = excluded.env_prefix`,
    ).run(PROVIDER_ROW.id, PROVIDER_ROW.base_url, PROVIDER_ROW.protocol, PROVIDER_ROW.env_prefix);

    const upsert = db.prepare(
      `INSERT INTO credential (provider, username, secret, refresh_secret, expires_at, raw_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, username) DO UPDATE SET
         secret = excluded.secret,
         refresh_secret = excluded.refresh_secret,
         expires_at = excluded.expires_at,
         raw_json = excluded.raw_json`,
    );

    // node:sqlite 没有 transaction() 帮助函数;手写 BEGIN/COMMIT(整批原子)。
    db.exec("BEGIN");
    try {
      for (const row of accounts) {
        upsert.run(
          PROVIDER,
          String(row.id),
          String(row.token ?? ""),
          String(row.refresh_token ?? ""),
          expiresOf(row),
          JSON.stringify(rawOf(row)),
        );
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } finally {
    db?.close();
  }
}

function backupTarget() {
  const dir = mkdtempSync(join(tmpdir(), "as-one-backup-"));
  const target = join(dir, "as-one.db");
  copyFileSync(DST, target);
  for (const suffix of ["-wal", "-shm"]) {
    const src = DST + suffix;
    if (existsSync(src)) copyFileSync(src, target + suffix);
  }
  return dir;
}

const source = readSource();
if (source.length === 0) fail("源库里没有 cn 账号");

console.log(`源库: ${SRC}`);
console.log(`目标: ${DST}`);
console.log(`模式: ${APPLY ? "APPLY(会写入)" : "DRY-RUN(只预览)"}\n`);

for (const row of source) {
  const raw = rawOf(row);
  console.log(
    `· ${row.id}  region=${row.region} kind=${row.kind} enabled=${row.enabled} ` +
      `uuid=${String(raw.uuid).slice(0, 8)}… device=${raw.device_id} user=${raw.user_id} ` +
      `token=${String(row.token ?? "").length}字 refresh=${String(row.refresh_token ?? "").length}字`,
  );
}

if (!APPLY) {
  console.log("\n(预览结束;加 --apply 才会写入)");
  process.exit(0);
}

const backupDir = backupTarget();
console.log(`\n已备份目标库到: ${backupDir}`);
try {
  applyToTarget(source);
  console.log(`✓ 写入完成:provider=${PROVIDER},accounts=${source.length}`);
} finally {
  // 备份目录保留,供手工回滚:cp <backup>/as-one.db ~/.as-one/
  void rmSync;
}
