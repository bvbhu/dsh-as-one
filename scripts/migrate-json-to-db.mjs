#!/usr/bin/env node
/**
 * 一次性迁移:JSON 配置 → SQLite(数据库成为唯一真源)。
 *
 * 背景(用户裁定 m28134 / m28051):**数据库是唯一存储**,JSON 退化为
 * 导入 / 导出 / 备份格式;启动流程不做迁移,迁移只由本脚本负责。
 *
 * 搬什么:
 * - `as-one.providers.json`
 *   - `providers[]`   → `provider` 表(id / base_url / protocol / env_prefix)
 *   - `realModels[]`  → `real_model` 表(含四个声明字段 + hidden + concurrency)
 *   - `accounts[]`    → `credential` 表里**只建行**(username 来自 credentialRef;
 *                       密钥由 credentials.json 那一步补上)
 *   - `logicalModels[]` → `logical_model` 表(name / strategy / members JSON)
 *   - `schedulerRules[]` → setting `scheduler.rules`(窗口收进 `window` 对象、
 *                         冷却拆到 `scheduler.cooldown_overrides` —— 与
 *                         engine 的新口径一致;形状已经对就直接写)
 * - `as-one.credentials.json` → `credential` 表(secret / refresh_secret /
 *   expires_at / raw_json 原样;raw_json 统一存成 JSON 字符串)
 *
 * 语义:
 * - **幂等**:重复跑不产生重复行(全部 upsert),也不删任何库里的行;
 * - **不删 JSON**:迁移后 JSON 留在原地当备份,确认无误后用户可自行删除;
 * - **--apply 才写**,默认只打印将要做什么(dry-run);
 * - 库里已有的行**不覆盖**为 JSON 的旧值,除非 `--force`(默认以库为准,
 *   因为库才是用户最近在面板上改过的真源)。
 *
 * 用法:
 *   node scripts/migrate-json-to-db.mjs [--dir <userdata>] [--apply] [--force]
 * 缺省目录:`D:\Program Files\As One\userdata`。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_DIR = "D:\\Program Files\\As One\\userdata";

function parseArgs(argv) {
  const out = { dir: DEFAULT_DIR, apply: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--force") out.force = true;
    else if (a === "--dir") out.dir = argv[++i] ?? out.dir;
  }
  return out;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} 不是合法 JSON:${err.message}`);
  }
}

/** `"<provider>/<username>"` → [provider, username]。 */
function splitRef(ref) {
  const s = String(ref ?? "");
  const i = s.indexOf("/");
  if (i <= 0 || i === s.length - 1) return null;
  return [s.slice(0, i), s.slice(i + 1)];
}

/** raw_json 统一成 JSON 字符串(Nexus DB 列语义)。 */
function rawJsonText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** 规则:把旧扁平 times/weekdays 收进 window,cooldown 拆出去。 */
function normalizeRule(rule, cooldowns) {
  if (!rule || typeof rule !== "object") return null;
  const out = {};
  if (typeof rule.provider === "string" && rule.provider.trim() !== "") out.provider = rule.provider.trim();
  else return null;
  if (typeof rule.model === "string" && rule.model.trim() !== "") out.model = rule.model.trim();
  if (typeof rule.expiresAt === "string" && rule.expiresAt.trim() !== "") out.expiresAt = rule.expiresAt.trim();
  if (typeof rule.expires_at === "string" && rule.expires_at.trim() !== "") out.expiresAt = rule.expires_at.trim();
  if (Number.isInteger(rule.priority) && rule.priority >= 0) out.priority = rule.priority;
  // cooldown 是供应商级熔断,搬去独立键(与调度档位正交)。
  const cooldown = Number(rule.cooldown);
  if (Number.isFinite(cooldown) && cooldown > 0) cooldowns[out.provider] = cooldown;

  const win = rule.window && typeof rule.window === "object" ? rule.window : rule;
  const window = {};
  if (Array.isArray(win.times) && win.times.length > 0) {
    const times = win.times
      .filter((t) => Array.isArray(t) && t.length === 2 && typeof t[0] === "string" && typeof t[1] === "string")
      .map((t) => [t[0], t[1]]);
    if (times.length > 0) window.times = times;
  }
  if (Array.isArray(win.weekdays) && win.weekdays.length > 0) {
    const days = win.weekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
    if (days.length > 0) window.weekdays = days;
  }
  if (window.times || window.weekdays) out.window = window;
  // 只有 cooldown 没有别的信息的条目,搬完冷却就该从规则里消失。
  const meaningful = out.model !== undefined || out.expiresAt !== undefined || out.priority !== undefined || out.window !== undefined;
  return meaningful ? out : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir;
  const dbPath = join(dir, "as-one.db");
  const providersPath = join(dir, "as-one.providers.json");
  const credentialsPath = join(dir, "as-one.credentials.json");

  console.log(`[migrate] userdata: ${dir}`);
  console.log(`[migrate] mode: ${args.apply ? "APPLY" : "dry-run"}${args.force ? " (force: 用 JSON 覆盖库里已有值)" : ""}`);

  if (!existsSync(dbPath)) {
    console.error(`[migrate] 数据库不存在:${dbPath}`);
    process.exitCode = 2;
    return;
  }

  const providersDoc = readJson(providersPath);
  const credentialsDoc = readJson(credentialsPath);
  if (!providersDoc && !credentialsDoc) {
    console.log("[migrate] 两个 JSON 都不存在 —— 没有可迁移的数据");
    return;
  }

  const { openDatabase } = await import("../packages/core/lib/db/database.js");
  const db = openDatabase(dbPath);

  const stats = { provider: 0, realModel: 0, logicalModel: 0, credentialRow: 0, credentialSecret: 0, rules: 0, cooldowns: 0 };

  try {
    // ── 1. provider / real_model / logical_model / accounts ───────────────
    const providers = Array.isArray(providersDoc?.providers) ? providersDoc.providers : [];
    for (const p of providers) {
      const id = String(p?.id ?? "").trim();
      if (!id) continue;
      const row = {
        id,
        base_url: typeof p.baseUrl === "string" && p.baseUrl.trim() !== "" ? p.baseUrl.trim() : null,
        protocol: typeof p.protocol === "string" && p.protocol.trim() !== "" ? p.protocol.trim() : "openai",
        env_prefix: typeof p.envPrefix === "string" && p.envPrefix.trim() !== "" ? p.envPrefix.trim() : null,
      };
      if (db.provider.get(id) && !args.force) continue;
      db.provider.insert(row);
      stats.provider += 1;

      const models = Array.isArray(p.realModels) ? p.realModels : [];
      for (const m of models) {
        const model = String(m?.model ?? m?.id ?? "").trim();
        if (!model) continue;
        if (db.realModel.get(id, model) && !args.force) continue;
        db.realModel.set({
          provider: id,
          model,
          name: typeof m.name === "string" && m.name.trim() !== "" ? m.name.trim() : null,
          supports_vision: m.supportsVision ? 1 : 0,
          max_input_tokens: Number.isFinite(m.maxInputTokens) ? m.maxInputTokens : null,
          max_output_tokens: Number.isFinite(m.maxOutputTokens) ? m.maxOutputTokens : null,
          hidden: m.hidden ? 1 : 0,
          concurrency: Number.isFinite(m.concurrency) && m.concurrency > 0 ? m.concurrency : 1,
        });
        stats.realModel += 1;
      }

      const accounts = Array.isArray(p.accounts) ? p.accounts : [];
      for (const a of accounts) {
        const ref = splitRef(a?.credentialRef);
        if (!ref) continue;
        const [aprovider, username] = ref;
        if (aprovider !== id) continue;
        if (db.credential.get(id, username)) continue;
        // 只建行,密钥留空 —— 下一步 credentials.json 会补上。
        db.credential.insert({
          provider: id,
          username,
          secret: null,
          refresh_secret: null,
          expires_at: null,
          raw_json: null,
        });
        stats.credentialRow += 1;
      }
    }

    const logicalModels = Array.isArray(providersDoc?.logicalModels) ? providersDoc.logicalModels : [];
    // ⚠️ 逻辑模型**只在库表为空时**才从 JSON 播种。
    //
    // 这是 bug1 的直接教训:用户在面板删了 `nexus-flash`(删的是库行),
    // 而 JSON 里那一份还在。如果迁移脚本逐条 upsert,删掉的模型会在下次
    // 迁移时复活 —— 「删除永不生效」。库里有行 = 用户已在库里做过决定,
    // 一切以库为准(--force 也不改这条:JSON 不是逻辑模型的有效来源)。
    const existingLogical = db.logicalModel.list().length;
    if (existingLogical > 0 && logicalModels.length > 0) {
      console.log(`[migrate] logical_model 库里已有 ${existingLogical} 行 —— 不从 JSON 播种(删除必须永久生效)`);
    } else {
      for (const lm of logicalModels) {
        const name = String(lm?.name ?? "").trim();
        if (!name) continue;
        if (db.logicalModel.get(name) && !args.force) continue;
        const members = Array.isArray(lm.members)
          ? lm.members
              .map((m) => (typeof m === "string" ? m : `${m?.provider ?? ""}/${m?.model ?? ""}`))
              .filter((s) => s.includes("/") && !s.startsWith("/") && !s.endsWith("/"))
              .map((s) => {
                const [provider, model] = splitRef(s);
                return { provider, model };
              })
          : [];
        db.logicalModel.insert({
          name,
          strategy: typeof lm.strategy === "string" && lm.strategy.trim() !== "" ? lm.strategy.trim() : "due-first",
          members: JSON.stringify(members),
        });
        stats.logicalModel += 1;
      }
    }

    // ── 2. 凭据(密钥 + raw_json) ─────────────────────────────────────────
    const creds = Array.isArray(credentialsDoc?.credentials) ? credentialsDoc.credentials : [];
    for (const c of creds) {
      const provider = String(c?.provider ?? "").trim();
      const username = String(c?.username ?? "").trim();
      if (!provider || !username) continue;
      const existing = db.credential.get(provider, username);
      const hasSecret = existing && typeof existing.secret === "string" && existing.secret !== "";
      if (hasSecret && !args.force) continue; // 库里的密钥是最新的,不拿 JSON 覆盖
      // 用 set(upsert):库里可能已有这一行(上一步建的空壳行,或旧数据)。
      db.credential.set({
        provider,
        username,
        secret: typeof c.secret === "string" ? c.secret : null,
        refresh_secret: typeof c.refresh_secret === "string" ? c.refresh_secret : null,
        expires_at: Number.isFinite(c.expires_at) ? c.expires_at : null,
        raw_json: rawJsonText(c.raw_json),
      });
      stats.credentialSecret += 1;
    }

    // ── 3. 调度规则 + 冷却覆盖(拆窗口 / 拆冷却) ───────────────────────────
    const jsonRules = Array.isArray(providersDoc?.schedulerRules) ? providersDoc.schedulerRules : [];
    if (jsonRules.length > 0) {
      const currentRaw = db.setting.get("scheduler.rules")?.v ?? "";
      let currentRules = [];
      try {
        const parsed = JSON.parse(currentRaw);
        currentRules = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rules) ? parsed.rules : [];
      } catch {
        currentRules = [];
      }
      if (currentRules.length === 0 || args.force) {
        const cooldowns = {};
        const normalized = jsonRules.map((r) => normalizeRule(r, cooldowns)).filter(Boolean);
        db.setting.set("scheduler.rules", JSON.stringify({ rules: normalized }, null, 2));
        stats.rules = normalized.length;
        const prevCooldownsRaw = db.setting.get("scheduler.cooldown_overrides")?.v ?? "";
        let prevCooldowns = {};
        try {
          const parsed = JSON.parse(prevCooldownsRaw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) prevCooldowns = parsed;
        } catch {
          prevCooldowns = {};
        }
        const merged = { ...prevCooldowns, ...cooldowns };
        db.setting.set("scheduler.cooldown_overrides", JSON.stringify(merged, null, 2));
        stats.cooldowns = Object.keys(merged).length;
      } else {
        console.log(`[migrate] scheduler.rules 库里已有 ${currentRules.length} 条 —— 保留库里的(用 --force 才覆盖)`);
      }
    }

    console.log("[migrate] 结果:", stats);
    if (!args.apply) {
      console.log("[migrate] dry-run 结束,加 --apply 才会真正写库");
    } else {
      console.log("[migrate] 已写入。JSON 文件保留未删(可作备份)。");
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("[migrate] 失败:", err);
  process.exitCode = 1;
});
