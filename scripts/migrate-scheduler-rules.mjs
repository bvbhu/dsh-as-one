/**
 * 迁移 `setting.scheduler.rules` 到 2026-10-21 新形状。
 *
 * 旧形状(扁平):
 *   {"rules": [{provider, model?, expires_at?, times?, weekdays?, priority?, cooldown?}]}
 * 新形状:
 *   scheduler.rules            = {"rules": [{provider, model?, expires_at?, priority?, window?: {weekdays?, times?}}]}
 *   scheduler.cooldown_overrides = {"<provider>": 分钟}
 *
 * 做三件事:
 *   1. 把每条规则的 `times` / `weekdays` 收进 `window` 对象;
 *   2. 把带 `cooldown` 的规则**移出** rules,写进 `scheduler.cooldown_overrides`;
 *   3. 其余字段原样保留(含 priority、expires_at)。
 *
 * 幂等:已是新形状的条目会被识别并原样保留,重复跑不会二次改写。
 *
 * 用法:
 *   node scripts/migrate-scheduler-rules.mjs "<as-one.db 路径>"           # 试运行,只打印
 *   node scripts/migrate-scheduler-rules.mjs "<as-one.db 路径>" --apply   # 实际写入
 *
 * 默认库路径:D:\Program Files\As One\userdata\as-one.db
 */
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB = "D:\\Program Files\\As One\\userdata\\as-one.db";

const dbPath = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : DEFAULT_DB;
const apply = process.argv.includes("--apply");

const db = new DatabaseSync(dbPath);
const getSetting = (k) => db.prepare("SELECT v FROM setting WHERE k = ?").get(k)?.v ?? null;
const setSetting = (k, v) => db.prepare("INSERT INTO setting (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v);

const rawRules = getSetting("scheduler.rules");
if (rawRules === null) {
  console.log("scheduler.rules 不存在,无需迁移");
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(rawRules);
} catch (e) {
  console.error("scheduler.rules 不是合法 JSON,拒绝迁移:", e.message);
  process.exit(1);
}

const rules = Array.isArray(parsed?.rules) ? parsed.rules : null;
if (rules === null) {
  console.error("scheduler.rules 缺少 rules 数组,拒绝迁移");
  process.exit(1);
}

const outRules = [];
const cooldowns = {};
let movedWindows = 0;
let movedCooldowns = 0;

for (const rule of rules) {
  if (rule === null || typeof rule !== "object" || Array.isArray(rule)) {
    outRules.push(rule); // 非对象条目原样保留,让引擎/面板自己报错
    continue;
  }
  const next = { ...rule };

  // 1) 冷却覆盖拆出
  if (next.cooldown !== undefined && next.cooldown !== null) {
    const pid = typeof next.provider === "string" ? next.provider.trim() : "";
    if (pid !== "" && typeof next.cooldown === "number" && next.cooldown > 0) {
      cooldowns[pid] = next.cooldown;
    }
    delete next.cooldown;
    movedCooldowns += 1;
    // 只剩 cooldown 的规则不该留在 rules 里
    const rest = Object.keys(next).filter((k) => k !== "provider");
    if (rest.length === 0) continue;
  }

  // 2) 时段收进 window
  if (next.times !== undefined || next.weekdays !== undefined) {
    const win = { ...(typeof next.window === "object" && next.window !== null ? next.window : {}) };
    if (next.times !== undefined) win.times = next.times;
    if (next.weekdays !== undefined) win.weekdays = next.weekdays;
    delete next.times;
    delete next.weekdays;
    next.window = win;
    movedWindows += 1;
  }

  outRules.push(next);
}

const existingCooldowns = getSetting("scheduler.cooldown_overrides");
let baseCooldowns = { sensenova: 1 };
if (existingCooldowns) {
  try {
    const parsedCooldowns = JSON.parse(existingCooldowns);
    if (parsedCooldowns && typeof parsedCooldowns === "object" && !Array.isArray(parsedCooldowns)) {
      baseCooldowns = parsedCooldowns;
    }
  } catch {
    /* 坏值忽略,用缺省 */
  }
}
const finalCooldowns = { ...baseCooldowns, ...cooldowns };

const newRulesJson = JSON.stringify({ rules: outRules }, null, 2);
const newCooldownsJson = JSON.stringify(finalCooldowns, null, 2);

console.log(`规则条数:${rules.length} → ${outRules.length}`);
console.log(`收进 window 的条目:${movedWindows}`);
console.log(`拆出冷却覆盖的条目:${movedCooldowns}`);
console.log("--- 新 scheduler.rules ---");
console.log(newRulesJson);
console.log("--- 新 scheduler.cooldown_overrides ---");
console.log(newCooldownsJson);

if (!apply) {
  console.log("\n(试运行,未写入。加 --apply 实际写入。)");
  process.exit(0);
}

setSetting("scheduler.rules", newRulesJson);
setSetting("scheduler.cooldown_overrides", newCooldownsJson);
console.log("\n已写入。");
db.close();
