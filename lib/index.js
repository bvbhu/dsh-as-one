// src/index.ts
import { homedir as homedir2 } from "node:os";
import { join as join8 } from "node:path";

// src/setup.ts
import { mkdirSync as mkdirSync2 } from "node:fs";
import { join as join7 } from "node:path";

// ../core/src/db/database.ts
import { DatabaseSync } from "node:sqlite";

// ../core/src/db/schema.ts
var SCHEMA_V7 = `
-- ============================================================
-- provider \u8868 (schema.sql L97-102)
-- ============================================================
CREATE TABLE IF NOT EXISTS provider (
    id                  TEXT PRIMARY KEY,            -- 'workbuddy' / 'trae' / 'sensenova' ...
    base_url            TEXT,                        -- OpenAI \u517C\u5BB9\u7AEF\u70B9\u7684 api_base
    protocol            TEXT NOT NULL DEFAULT 'openai',  -- openai | workbuddy | trae | sensenova
    env_prefix          TEXT                         -- \u8D26\u53F7\u5BC6\u94A5\u7684\u73AF\u5883\u53D8\u91CF\u524D\u7F00,\u5982 WORKBUDDY_TOKEN
);
CREATE INDEX IF NOT EXISTS ix_provider_protocol ON provider(protocol);

-- ============================================================
-- credential \u8868 (schema.sql L117-128)
-- ============================================================
CREATE TABLE IF NOT EXISTS credential (
    provider       TEXT NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    username       TEXT NOT NULL,
    secret         TEXT,
    refresh_secret TEXT,
    expires_at     REAL,                              -- \u26A0\uFE0F \u5355\u4F4D\u662F\u79D2(epoch seconds),\u4E0D\u662F\u6BEB\u79D2
    raw_json       TEXT,
    PRIMARY KEY (provider, username)
);

-- ============================================================
-- real_model \u8868 (schema.sql L151-166)
-- ============================================================
CREATE TABLE IF NOT EXISTS real_model (
    provider          TEXT NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    model             TEXT NOT NULL,
    name              TEXT,
    supports_vision   INTEGER NOT NULL DEFAULT 0,
    max_input_tokens  INTEGER,
    max_output_tokens INTEGER,
    hidden            INTEGER NOT NULL DEFAULT 0,
    concurrency       INTEGER NOT NULL DEFAULT 1,
    -- \u8BE5\u6A21\u578B**\u652F\u6301**\u7684\u601D\u8003\u5F3A\u5EA6(\u4E0A\u6E38\u6A21\u578B\u76EE\u5F55\u7ED9\u7684\u6863\u4F4D\u8868,\u5982 ["low","high","max"])\u3002
    -- JSON \u6570\u7EC4\u5B57\u7B26\u4E32;NULL = \u4E0A\u6E38\u6CA1\u7ED9 / \u8FD8\u6CA1\u56DE\u6E90\u3002
    -- \u26A0\uFE0F \u8BED\u4E49(2026-10-24 \u7528\u6237\u5B9A\u6848 m09328):**\u7A7A(NULL \u6216 [])\u5C31\u4E0D\u4F20
    -- reasoning_effort**;\u975E\u7A7A\u65F6\u4E5F\u53EA\u653E\u884C\u540D\u5355\u91CC\u7684\u503C\u3002\u4E0A\u6E38\u62A5\u300C\u4E0D\u652F\u6301\u8BE5\u601D\u8003\u5F3A\u5EA6\u300D
    -- \u65F6\u7F51\u5173\u4E22\u53C2\u91CD\u8BD5,\u91CD\u8BD5\u6210\u529F\u5373\u628A\u672C\u5217**\u6E05\u7A7A**(\u5B66\u4E60\u7ED3\u679C,\u4E0B\u6B21\u4E0D\u518D\u53D1)\u3002
    supported_reasoning_efforts TEXT,
    -- \u8BE5\u6A21\u578B**\u662F\u5426\u5141\u8BB8\u5173\u95ED\u601D\u8003**(off)\u30021 = \u5141\u8BB8(\u539F\u6837\u53D1 off);
    -- 0 = \u4E0D\u5141\u8BB8(\u9000\u5230\u6700\u4F4E\u601D\u8003\u6863 low);NULL = \u4E0A\u6E38\u6CA1\u8BF4(\u6309\u300C\u5141\u8BB8\u300D\u5904\u7406,
    -- \u4EA4\u7ED9\u4E0A\u6E38\u81EA\u5DF1\u62D2 \u2014\u2014 \u603B\u6BD4\u64C5\u81EA\u628A\u300C\u5173\u95ED\u601D\u8003\u300D\u6539\u6210\u300Clow\u300D\u597D)\u3002
    -- \u5B9E\u6D4B\u53EA\u6709 workbuddy \u7684 reasoning.canDisableThinking \u7ED9\u8FD9\u4E2A\u4FE1\u53F7\u3002
    reasoning_allows_off INTEGER,
    PRIMARY KEY (provider, model)
);
CREATE INDEX IF NOT EXISTS ix_real_model_hidden ON real_model(hidden);

-- ============================================================
-- logical_model \u8868 (schema.sql L188-195)
-- ============================================================
CREATE TABLE IF NOT EXISTS logical_model (
    name       TEXT PRIMARY KEY,
    -- 2026-10-26 \u7528\u6237 m15445 \u5B9A\u6848:\u7F3A\u7701\u7B56\u7565\u6539\u4E3A\u968F\u673A(\u4E0E DEFAULT_SCHEDULER_STRATEGY \u4E00\u81F4)\u3002
    -- \u26A0\uFE0F \u4EC5\u5BF9**\u65B0\u5EFA**\u5E93\u751F\u6548:CREATE TABLE IF NOT EXISTS \u4E0D\u4F1A\u6539\u5DF2\u5B58\u5728\u7684\u8868\u3002
    strategy   TEXT NOT NULL DEFAULT 'random',
    members    TEXT NOT NULL DEFAULT '[]',            -- JSON \u6570\u7EC4,\u987A\u5E8F\u5373\u4F18\u5148\u7EA7
    -- 2026-11-01 \u7528\u6237 m44638:\u903B\u8F91\u6A21\u578B\u7684\u4EBA\u8BDD\u663E\u793A\u540D(NULL = \u76F4\u63A5\u7528 name)\u3002
    -- name \u662F\u8C03\u7528\u6807\u8BC6(\u8FDB /v1/models \u7684 id\u3001\u5BA2\u6237\u7AEF\u8BF7\u6C42\u4E32),\u4E0D\u80FD\u4E3A\u4E86\u597D\u770B\u6539\u5B83;
    -- \u663E\u793A\u540D\u8D70\u8FD9\u4E00\u5217,\u649E\u540D\u65F6\u7531 listModelEntries \u8FFD\u52A0 provider \u533A\u5206\u3002
    -- \u26A0\uFE0F \u8FD9\u6BB5\u6CE8\u91CA\u91CC\u4E0D\u8981\u5199\u53CD\u5F15\u53F7 \u2014\u2014 \u6574\u4E2A schema \u662F\u4E00\u4E2A\u6A21\u677F\u5B57\u7B26\u4E32,\u53CD\u5F15\u53F7\u4F1A\u622A\u65AD\u5B83\u3002
    display_name TEXT
);

-- ============================================================
-- stats_daily \u8868 (schema.sql L211-225)
-- ============================================================
CREATE TABLE IF NOT EXISTS stats_daily (
    day               TEXT NOT NULL,                  -- 'YYYY-MM-DD'
    logical_model     TEXT,                           -- NULL \u8868\u793A"\u4EFB\u4F55 logical_model"\u805A\u5408\u884C
    provider          TEXT NOT NULL,
    model             TEXT NOT NULL,
    requests          INTEGER NOT NULL DEFAULT 0,
    fails             INTEGER NOT NULL DEFAULT 0,
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    cached_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    latency_sum_ms    INTEGER NOT NULL DEFAULT 0,     -- \u6BEB\u79D2\u7D2F\u52A0\u503C
    ttft_sum_ms       INTEGER NOT NULL DEFAULT 0,     -- \u6BEB\u79D2\u7D2F\u52A0\u503C
    ttft_requests     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, logical_model, provider, model)
);
CREATE INDEX IF NOT EXISTS ix_stats_provider_model ON stats_daily(provider, model);

-- ============================================================
-- setting \u8868 (schema.sql L234-240)
-- ============================================================
CREATE TABLE IF NOT EXISTS setting (
    k TEXT PRIMARY KEY,
    v TEXT
);
INSERT OR IGNORE INTO setting (k, v) VALUES ('version', '4');
`;

// ../core/src/db/database.ts
function assertNonNullable(v, what) {
  if (v === void 0 || v === null) {
    throw new Error(`as-one-db: missing required value: ${what}`);
  }
  return v;
}
function toBind(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  return v;
}
function openDatabase(target) {
  const raw = new DatabaseSync(target);
  if (target !== ":memory:") {
    raw.exec("PRAGMA journal_mode = WAL;");
  }
  raw.exec("PRAGMA foreign_keys = ON;");
  raw.exec("PRAGMA busy_timeout = 5000;");
  raw.exec(SCHEMA_V7);
  const ensureColumn = (table, column, ddl) => {
    const cols = raw.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name);
    if (!cols.includes(column)) raw.exec(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
  };
  ensureColumn(
    "real_model",
    "supported_reasoning_efforts",
    "supported_reasoning_efforts TEXT"
  );
  ensureColumn(
    "real_model",
    "reasoning_allows_off",
    "reasoning_allows_off INTEGER"
  );
  ensureColumn(
    "logical_model",
    "display_name",
    "display_name TEXT"
  );
  function insertRow(table, row) {
    const cols = Object.entries(row).filter(([, v]) => v !== void 0);
    if (cols.length === 0) {
      throw new Error(`as-one-db: insert into ${table} with no columns`);
    }
    const names = cols.map(([k]) => `"${k}"`).join(", ");
    const marks = cols.map(() => "?").join(", ");
    const values = cols.map(([, v]) => toBind(v));
    raw.prepare(`INSERT INTO ${table} (${names}) VALUES (${marks})`).run(...values);
  }
  function updateRow(table, row, keySql, keyParams) {
    const cols = Object.entries(row).filter(([k, v]) => v !== void 0 && !k.startsWith("$key"));
    const setClause = cols.map(([k]) => `"${k}" = ?`).join(", ");
    if (setClause.length === 0) {
      throw new Error(`as-one-db: update ${table} with no settable columns`);
    }
    const values = [...cols.map(([, v]) => toBind(v)), ...keyParams];
    raw.prepare(`UPDATE ${table} SET ${setClause} WHERE ${keySql}`).run(...values);
  }
  function deleteRow(table, keySql, keyParams) {
    raw.prepare(`DELETE FROM ${table} WHERE ${keySql}`).run(...keyParams);
  }
  const db = {
    raw,
    close() {
      raw.close();
    },
    provider: {
      get(id) {
        return raw.prepare("SELECT * FROM provider WHERE id = ?").get(id);
      },
      list() {
        return raw.prepare("SELECT * FROM provider").all();
      },
      insert(row) {
        insertRow("provider", row);
      },
      update(row) {
        const id = assertNonNullable(row.id, "provider.id");
        const { id: _id, ...rest } = row;
        updateRow("provider", rest, "id = ?", [id]);
      },
      delete(id) {
        deleteRow("provider", "id = ?", [id]);
      }
    },
    credential: {
      get(provider, username) {
        return raw.prepare("SELECT * FROM credential WHERE provider = ? AND username = ?").get(provider, username);
      },
      listByProvider(provider) {
        return raw.prepare("SELECT * FROM credential WHERE provider = ? ORDER BY username").all(provider);
      },
      list() {
        return raw.prepare("SELECT * FROM credential").all();
      },
      insert(row) {
        insertRow("credential", row);
      },
      set(row) {
        const cols = Object.entries(row).filter(([, v]) => v !== void 0);
        const names = cols.map(([k]) => `"${k}"`).join(", ");
        const marks = cols.map(() => "?").join(", ");
        const updates = cols.map(([k]) => `"${k}" = excluded."${k}"`).join(", ");
        const values = cols.map(([, v]) => toBind(v));
        raw.prepare(
          `INSERT INTO credential (${names}) VALUES (${marks})
					 ON CONFLICT (provider, username) DO UPDATE SET ${updates}`
        ).run(...values);
      },
      update(row) {
        const provider = assertNonNullable(row.provider, "credential.provider");
        const username = assertNonNullable(row.username, "credential.username");
        const { provider: _p, username: _u, ...rest } = row;
        updateRow(
          "credential",
          rest,
          "provider = ? AND username = ?",
          [provider, username]
        );
      },
      delete(provider, username) {
        deleteRow("credential", "provider = ? AND username = ?", [provider, username]);
      },
      secretsFor(provider) {
        const rows = raw.prepare("SELECT username, secret FROM credential WHERE provider = ?").all(provider);
        const out = {};
        for (const r of rows) out[r.username] = r.secret;
        return out;
      }
    },
    realModel: {
      get(provider, model) {
        return raw.prepare("SELECT * FROM real_model WHERE provider = ? AND model = ?").get(provider, model);
      },
      list() {
        return raw.prepare("SELECT * FROM real_model").all();
      },
      listByProvider(provider) {
        return raw.prepare("SELECT * FROM real_model WHERE provider = ? ORDER BY model").all(provider);
      },
      set(row) {
        const cols = Object.entries(row).filter(([, v]) => v !== void 0);
        const names = cols.map(([k]) => `"${k}"`).join(", ");
        const marks = cols.map(() => "?").join(", ");
        const updates = cols.map(([k]) => `"${k}" = excluded."${k}"`).join(", ");
        const values = cols.map(([, v]) => toBind(v));
        raw.prepare(
          `INSERT INTO real_model (${names}) VALUES (${marks})
					 ON CONFLICT (provider, model) DO UPDATE SET ${updates}`
        ).run(...values);
      },
      update(row) {
        const provider = assertNonNullable(row.provider, "real_model.provider");
        const model = assertNonNullable(row.model, "real_model.model");
        const { provider: _p, model: _m, ...rest } = row;
        updateRow("real_model", rest, "provider = ? AND model = ?", [
          provider,
          model
        ]);
      },
      delete(provider, model) {
        deleteRow("real_model", "provider = ? AND model = ?", [provider, model]);
      }
    },
    logicalModel: {
      get(name2) {
        return raw.prepare("SELECT * FROM logical_model WHERE name = ?").get(name2);
      },
      list() {
        return raw.prepare("SELECT * FROM logical_model").all();
      },
      insert(row) {
        insertRow("logical_model", row);
      },
      update(row) {
        const name2 = assertNonNullable(row.name, "logical_model.name");
        const { name: _n, ...rest } = row;
        updateRow("logical_model", rest, "name = ?", [name2]);
      },
      delete(name2) {
        deleteRow("logical_model", "name = ?", [name2]);
      }
    },
    statsDaily: {
      range(dayFrom, dayTo, logicalModel) {
        let sql = "SELECT * FROM stats_daily WHERE day >= ? AND day <= ?";
        const params = [dayFrom, dayTo];
        if (logicalModel !== void 0) {
          sql += " AND logical_model IS ?";
          params.push(logicalModel);
        }
        sql += " ORDER BY day, logical_model, provider, model";
        return raw.prepare(sql).all(...params);
      },
      record(delta) {
        const {
          day,
          logical_model,
          provider,
          model,
          requests = 0,
          fails = 0,
          prompt_tokens = 0,
          cached_tokens = 0,
          completion_tokens = 0,
          latency_sum_ms = 0,
          ttft_sum_ms = 0,
          ttft_requests = 0
        } = delta;
        assertNonNullable(day, "stats_daily.day");
        assertNonNullable(provider, "stats_daily.provider");
        assertNonNullable(model, "stats_daily.model");
        if (logical_model === void 0 || logical_model === null) {
          const upd = raw.prepare(
            `UPDATE stats_daily SET
							requests = requests + ?,
							fails = fails + ?,
							prompt_tokens = prompt_tokens + ?,
							cached_tokens = cached_tokens + ?,
							completion_tokens = completion_tokens + ?,
							latency_sum_ms = latency_sum_ms + ?,
							ttft_sum_ms = ttft_sum_ms + ?,
							ttft_requests = ttft_requests + ?
						 WHERE day = ? AND logical_model IS NULL AND provider = ? AND model = ?`
          ).run(
            requests,
            fails,
            prompt_tokens,
            cached_tokens,
            completion_tokens,
            latency_sum_ms,
            ttft_sum_ms,
            ttft_requests,
            day,
            provider,
            model
          );
          if (Number(upd.changes) > 0) return;
        }
        raw.prepare(
          `INSERT INTO stats_daily
						(day, logical_model, provider, model, requests, fails, prompt_tokens,
						 cached_tokens, completion_tokens, latency_sum_ms, ttft_sum_ms, ttft_requests)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT (day, logical_model, provider, model) DO UPDATE SET
						requests = requests + excluded.requests,
						fails = fails + excluded.fails,
						prompt_tokens = prompt_tokens + excluded.prompt_tokens,
						cached_tokens = cached_tokens + excluded.cached_tokens,
						completion_tokens = completion_tokens + excluded.completion_tokens,
						latency_sum_ms = latency_sum_ms + excluded.latency_sum_ms,
						ttft_sum_ms = ttft_sum_ms + excluded.ttft_sum_ms,
						ttft_requests = ttft_requests + excluded.ttft_requests`
        ).run(
          day,
          logical_model ?? null,
          provider,
          model,
          requests,
          fails,
          prompt_tokens,
          cached_tokens,
          completion_tokens,
          latency_sum_ms,
          ttft_sum_ms,
          ttft_requests
        );
      },
      insert(row) {
        insertRow("stats_daily", row);
      },
      /**
       * 聚合表整体规模(面板「请求日志」counters,Nexus api_pages.py L5264-5269 同款 SQL):
       * - stats_rows:stats_daily 总行数(COUNT(*));
       * - last_24h:近 24h 请求数(day >= 传入的边界日,即 dayKey(now-86400s));
       * - errors:累计失败数(SUM(fails))。
       */
      counters(dayFrom24h) {
        const statsRows = raw.prepare("SELECT COUNT(*) AS n FROM stats_daily").get();
        const last24h = raw.prepare("SELECT COALESCE(SUM(requests), 0) AS n FROM stats_daily WHERE day >= ?").get(dayFrom24h);
        const errors = raw.prepare("SELECT COALESCE(SUM(fails), 0) AS n FROM stats_daily").get();
        return {
          stats_rows: Number(statsRows?.n ?? 0),
          last_24h: Number(last24h?.n ?? 0),
          errors: Number(errors?.n ?? 0)
        };
      }
    },
    setting: {
      get(key3) {
        return raw.prepare("SELECT * FROM setting WHERE k = ?").get(key3);
      },
      set(key3, value) {
        raw.prepare(
          "INSERT INTO setting (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v"
        ).run(key3, value);
      },
      delete(key3) {
        deleteRow("setting", "k = ?", [key3]);
      }
    }
  };
  return db;
}

// ../core/src/config/store.ts
import { realpathSync, watch } from "node:fs";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
var StoreError = class extends Error {
  /** 出错的文件路径。 */
  path;
  /** 底层 errno 代码(``ENOENT`` / ``EPERM`` / ``EBUSY`` …),无则 ``null``。 */
  code;
  /** 是否「文件不存在」(与语法/权限错误区分对待)。 */
  missing;
  constructor(path, message, options) {
    super(message, options?.cause !== void 0 ? { cause: options.cause } : void 0);
    this.name = "StoreError";
    this.path = path;
    this.code = options?.code ?? null;
    this.missing = options?.missing ?? false;
  }
};
var nodeFs = {
  writeFileSync: (p, d) => writeFileSync(p, d, "utf8"),
  renameSync,
  readFileSync: (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  },
  statSync: (p) => {
    try {
      return statSync(p);
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  },
  readdirSync
};
function readJsonFile(path, fs = nodeFs) {
  let text;
  try {
    text = fs.readFileSync(path);
  } catch (err) {
    throw new StoreError(path, `\u8BFB\u53D6\u5931\u8D25:${err.message}`, {
      code: err.code,
      cause: err
    });
  }
  if (text === null) return { ok: false, missing: true, error: "\u6587\u4EF6\u4E0D\u5B58\u5728" };
  if (text.trim() === "") return { ok: false, missing: true, error: "\u7A7A\u6587\u4EF6\u6309\u4E0D\u5B58\u5728\u5904\u7406" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, missing: false, error: err.message };
  }
}
var DEFAULT_TMP_PREFIX = ".as-one-tmp-";
var sleepImpl = (ms) => {
  if (ms <= 0) return;
  const end = Date.now() + ms;
  while (Date.now() < end) {
  }
};
function writeJsonFileAtomic(path, value, options = {}) {
  const fs = options.fs ?? nodeFs;
  const tmpPrefix = options.tmpPrefix ?? `${DEFAULT_TMP_PREFIX}${basename(path)}-`;
  const renameRetries = Math.max(1, options.renameRetries ?? 3);
  const retryBaseMs = Math.max(0, options.retryBaseMs ?? 20);
  const verify = options.verify ?? true;
  let text;
  try {
    text = JSON.stringify(value, null, 2) + "\n";
  } catch (err) {
    throw new StoreError(path, `\u5E8F\u5217\u5316\u5931\u8D25(\u672A\u5199\u5165\u78C1\u76D8):${err.message}`, { cause: err });
  }
  cleanStaleTmpFiles(path, fs, tmpPrefix);
  const tmp = join(dirname(path), `${tmpPrefix}${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    fs.writeFileSync(tmp, text);
    fsyncFile(tmp);
  } catch (err) {
    tryRemove(tmp);
    throw new StoreError(path, `\u5199\u4E34\u65F6\u6587\u4EF6\u5931\u8D25:${err.message}`, {
      code: err.code,
      cause: err
    });
  }
  let lastErr = null;
  for (let attempt = 0; attempt < renameRetries; attempt++) {
    try {
      fs.renameSync(tmp, path);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt + 1 < renameRetries) sleepImpl(retryBaseMs * 2 ** attempt);
    }
  }
  if (lastErr !== null) {
    tryRemove(tmp);
    throw new StoreError(
      path,
      `\u91CD\u547D\u540D\u5931\u8D25(\u5DF2\u91CD\u8BD5 ${renameRetries} \u6B21):${lastErr.message}`,
      { code: lastErr.code, cause: lastErr }
    );
  }
  if (verify) {
    const back = fs.readFileSync(path);
    if (back === null || back !== text) {
      throw new StoreError(path, "\u56DE\u8BFB\u6821\u9A8C\u5931\u8D25:\u5199\u5165\u540E\u5185\u5BB9\u4E0E\u671F\u671B\u4E0D\u4E00\u81F4(\u78C1\u76D8/\u6740\u8F6F\u62E6\u622A?)");
    }
  }
}
function cleanStaleTmpFiles(path, fs, tmpPrefix) {
  try {
    const dir = dirname(path);
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(tmpPrefix)) tryRemove(join(dir, entry));
    }
  } catch {
  }
}
function fsyncFile(path) {
  try {
    const fd = openSync(path, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
  }
}
function tryRemove(path) {
  try {
    rmSync(path, { force: true, maxRetries: 1 });
  } catch {
  }
}
function toLongPath(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}
function watchJsonFile(path, onChange, onError, options = {}) {
  const debounceMs = Math.max(0, options.debounceMs ?? 100);
  const dir = toLongPath(dirname(path));
  const file = basename(path);
  let lastKnown = null;
  let closed = false;
  let timer = null;
  const schedule = () => {
    if (closed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (closed) return;
      fire();
    }, debounceMs);
  };
  const fire = () => {
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      if (options.onReadError === "emit-null" && lastKnown !== null) {
        lastKnown = null;
        onChange(
          ""
          /* 空串 = 解析必然失败,交给调用方 */
        );
      }
      return;
    }
    if (!options.emitUnchanged && text === lastKnown) return;
    lastKnown = text;
    onChange(text);
  };
  let watcher = null;
  try {
    watcher = watch(dir, (_eventType, filename) => {
      if (closed) return;
      if (filename !== null && filename !== file) return;
      schedule();
    });
  } catch (err) {
    const storeErr = new StoreError(path, `\u65E0\u6CD5\u76D1\u542C\u76EE\u5F55:${err.message}`, {
      code: err.code,
      cause: err
    });
    if (options.onWatchError === "error") onError?.(storeErr);
    return {
      close: () => {
        closed = true;
      },
      get lastKnown() {
        return null;
      }
    };
  }
  try {
    lastKnown = readFileSync(path, "utf8");
  } catch {
  }
  return {
    close: () => {
      if (closed) return;
      closed = true;
      if (timer !== null) clearTimeout(timer);
      watcher?.close();
      watcher = null;
    },
    get lastKnown() {
      return lastKnown;
    }
  };
}

// ../core/src/config/types.ts
var PROVIDER_PROTOCOLS = [
  "openai",
  "workbuddy",
  "trae",
  "sensenova",
  "qoder"
];
var DEFAULT_PROVIDER_PROTOCOL = "openai";
function isProviderProtocol(value) {
  return typeof value === "string" && PROVIDER_PROTOCOLS.includes(value);
}
var SCHEDULER_STRATEGIES = [
  "due-first",
  "random",
  "ordered-fallback",
  "least-busy",
  "balanced"
];
var DEFAULT_SCHEDULER_STRATEGY = "random";
var STRATEGY_ALIASES = {
  "\u6700\u5148\u5230\u671F due first": "due-first",
  "due first": "due-first",
  "cheapest-then-expiry": "due-first",
  nexus: "due-first",
  "simple-shuffle": "random",
  "\u968F\u673A": "random",
  "usage-based-routing-v2": "least-busy",
  "usage-balanced-routing-v2": "least-busy",
  "usage balanced": "least-busy",
  "usage-balanced": "least-busy",
  "\u7528\u91CF\u5E73\u8861": "least-busy",
  "\u6309\u5E8F\u964D\u7EA7\u94FE": "ordered-fallback",
  ordered: "ordered-fallback",
  "\u6700\u5C11\u5728\u9014": "least-busy",
  "cost-based-routing": "least-busy",
  "provider-budget-routing": "due-first",
  "\u5E73\u5747\u4F7F\u7528": "balanced"
};
function normalizeStrategy(value) {
  if (value === null || value === void 0 || typeof value !== "string") {
    return { strategy: DEFAULT_SCHEDULER_STRATEGY, fellBack: true };
  }
  const text = value.trim();
  if (!text) return { strategy: DEFAULT_SCHEDULER_STRATEGY, fellBack: true };
  if (SCHEDULER_STRATEGIES.includes(text)) {
    return { strategy: text, fellBack: false };
  }
  const mapped = STRATEGY_ALIASES[text] ?? STRATEGY_ALIASES[text.toLowerCase()];
  if (mapped) return { strategy: mapped, fellBack: false };
  return { strategy: DEFAULT_SCHEDULER_STRATEGY, fellBack: true };
}
var MILLIS_THRESHOLD = 1e11;
function normalizeExpiresSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return value >= MILLIS_THRESHOLD ? value / 1e3 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const num2 = Number(value);
    if (Number.isFinite(num2) && num2 > 0) {
      return num2 >= MILLIS_THRESHOLD ? num2 / 1e3 : num2;
    }
  }
  return null;
}
var DEFAULT_PRIORITY = 3;
var systemWallClock = () => Date.now() / 1e3;

// ../core/src/config/providers.ts
var ConfigValidationError = class extends Error {
  issues;
  constructor(issues, message) {
    super(
      message ?? `provider \u914D\u7F6E\u52A0\u8F7D\u5931\u8D25(${issues.length} \u4E2A\u95EE\u9898): ${issues.map((i) => `[${i.path}] ${i.message}`).join("; ")}`
    );
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
};
function emptySnapshot() {
  return {
    providers: /* @__PURE__ */ new Map(),
    realModels: /* @__PURE__ */ new Map(),
    accounts: /* @__PURE__ */ new Map(),
    logicalModels: /* @__PURE__ */ new Map(),
    schedulerRules: []
  };
}
function splitModelId(value) {
  const idx = value.indexOf("/");
  if (idx < 0) return [null, value];
  return [value.slice(0, idx), value.slice(idx + 1)];
}
function parseExpiryDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;
  if (hour > 23 || minute > 59 || second > 61) return null;
  const t = new Date(year, month - 1, day, hour, minute, second, 0);
  return Math.floor(t.getTime() / 1e3);
}
function isHhMm(value) {
  if (typeof value !== "string") return false;
  const parts = value.trim().split(":");
  if (parts.length !== 2) return false;
  return /^-?\d+$/.test(parts[0].trim()) && /^-?\d+$/.test(parts[1].trim());
}
function isValidSpans(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (span) => Array.isArray(span) && span.length === 2 && isHhMm(span[0]) && isHhMm(span[1])
  );
}
function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function isPositiveInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function asBool(value, fallback) {
  if (value === void 0 || value === null) return { ok: true, value: fallback };
  if (typeof value === "boolean") return { ok: true, value };
  return { ok: false, value: fallback };
}
function asNullableString(value, fallback) {
  if (value === void 0) return { ok: true, value: fallback };
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string") return { ok: true, value };
  return { ok: false, value: fallback };
}
function normalizeMembers(raw, path, issues) {
  if (raw === void 0) return [];
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `members \u4E0D\u662F\u6570\u7EC4,\u6309\u7A7A\u6863\u94FE\u5904\u7406` });
    return [];
  }
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  raw.forEach((item, i) => {
    const itemPath = `${path}[${i}]`;
    let provider = null;
    let model = null;
    if (typeof item === "string") {
      [provider, model] = splitModelId(item);
    } else if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      const obj = item;
      if (typeof obj.provider === "string" && obj.provider !== "" && typeof obj.model === "string" && obj.model !== "") {
        provider = obj.provider;
        model = obj.model;
      } else {
        [provider, model] = splitModelId(
          typeof obj.real_model_id === "string" ? obj.real_model_id : typeof obj.id === "string" ? obj.id : ""
        );
      }
    }
    if (!provider || !model) {
      issues.push({ path: itemPath, message: `members \u6761\u76EE\u7F3A\u5C11 provider/model,\u5DF2\u5FFD\u7565:${JSON.stringify(item)}` });
      return;
    }
    const key3 = `${provider}/${model}`;
    if (seen.has(key3)) {
      return;
    }
    seen.add(key3);
    out.push({ provider, model });
  });
  return out;
}
function validateProviderEntry(raw, index, issues) {
  const path = `providers[${index}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ path, message: `provider[${index}] \u4E0D\u662F\u5BF9\u8C61,\u5DF2\u8DF3\u8FC7` });
    return null;
  }
  const obj = raw;
  if (typeof obj.id !== "string" || obj.id === "") {
    issues.push({ path, message: `providers[${index}] \u7F3A\u975E\u7A7A id,\u5DF2\u8DF3\u8FC7` });
    return null;
  }
  const providerId = obj.id;
  if (obj.protocol === void 0) {
  } else if (!isProviderProtocol(obj.protocol)) {
    issues.push({
      path: `${path}.protocol`,
      message: `\u672A\u77E5\u534F\u8BAE ${JSON.stringify(obj.protocol)},\u5DF2\u8DF3\u8FC7 provider ${providerId}`
    });
    return null;
  }
  const baseUrl = asNullableString(obj.baseUrl, null);
  if (!baseUrl.ok) {
    issues.push({ path: `${path}.baseUrl`, message: `baseUrl \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216 null,\u6309 null \u5904\u7406` });
  }
  const envPrefix = asNullableString(obj.envPrefix, null);
  if (!envPrefix.ok) {
    issues.push({ path: `${path}.envPrefix`, message: `envPrefix \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216 null,\u6309 null \u5904\u7406` });
  }
  const realModels = [];
  const modelSeen = /* @__PURE__ */ new Set();
  const rawModels = Array.isArray(obj.realModels) ? obj.realModels : [];
  if (obj.realModels !== void 0 && !Array.isArray(obj.realModels)) {
    issues.push({ path: `${path}.realModels`, message: `realModels \u4E0D\u662F\u6570\u7EC4,\u6309\u7A7A\u5904\u7406` });
  }
  rawModels.forEach((m, j) => {
    const mPath = `${path}.realModels[${j}]`;
    if (typeof m !== "object" || m === null || Array.isArray(m)) {
      issues.push({ path: mPath, message: `realModels[${j}] \u4E0D\u662F\u5BF9\u8C61,\u5DF2\u8DF3\u8FC7` });
      return;
    }
    const mo = m;
    if (typeof mo.model !== "string" || mo.model === "") {
      issues.push({ path: mPath, message: `realModels[${j}] \u7F3A\u975E\u7A7A model,\u5DF2\u8DF3\u8FC7` });
      return;
    }
    const key3 = `${providerId}/${mo.model}`;
    if (modelSeen.has(key3)) {
      issues.push({ path: mPath, message: `\u91CD\u590D\u7684\u771F\u5B9E\u6A21\u578B ${key3},\u5DF2\u4FDD\u7559\u540E\u8005(\u4E0E DB upsert \u540C\u53E3\u5F84)` });
    } else {
      modelSeen.add(key3);
    }
    const name2 = asNullableString(mo.name, null);
    if (!name2.ok) issues.push({ path: `${mPath}.name`, message: `name \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216 null,\u6309 null \u5904\u7406` });
    const vision = asBool(mo.supportsVision, false);
    if (!vision.ok) issues.push({ path: `${mPath}.supportsVision`, message: `supportsVision \u5FC5\u987B\u662F\u5E03\u5C14,\u6309 false \u5904\u7406` });
    const hidden = asBool(mo.hidden, false);
    if (!hidden.ok) issues.push({ path: `${mPath}.hidden`, message: `hidden \u5FC5\u987B\u662F\u5E03\u5C14,\u6309 false \u5904\u7406` });
    const maxIn = mo.maxInputTokens === void 0 ? null : isPositiveInt(mo.maxInputTokens) ? mo.maxInputTokens : (issues.push({ path: `${mPath}.maxInputTokens`, message: `maxInputTokens \u5FC5\u987B\u662F\u6B63\u6574\u6570,\u6309 null \u5904\u7406` }), null);
    const maxOut = mo.maxOutputTokens === void 0 ? null : isPositiveInt(mo.maxOutputTokens) ? mo.maxOutputTokens : (issues.push({ path: `${mPath}.maxOutputTokens`, message: `maxOutputTokens \u5FC5\u987B\u662F\u6B63\u6574\u6570,\u6309 null \u5904\u7406` }), null);
    const concurrency = mo.concurrency === void 0 ? null : isPositiveInt(mo.concurrency) ? mo.concurrency : (issues.push({ path: `${mPath}.concurrency`, message: `concurrency \u5FC5\u987B\u662F\u6B63\u6574\u6570,\u6309 null(\u4E0D\u8986\u76D6)\u5904\u7406` }), null);
    realModels.push({
      provider: providerId,
      model: mo.model,
      name: name2.value,
      supportsVision: vision.value,
      maxInputTokens: maxIn,
      maxOutputTokens: maxOut,
      hidden: hidden.value,
      concurrency
    });
  });
  const accounts = [];
  const accountSeen = /* @__PURE__ */ new Set();
  const rawAccounts = Array.isArray(obj.accounts) ? obj.accounts : [];
  if (obj.accounts !== void 0 && !Array.isArray(obj.accounts)) {
    issues.push({ path: `${path}.accounts`, message: `accounts \u4E0D\u662F\u6570\u7EC4,\u6309\u7A7A\u5904\u7406` });
  }
  rawAccounts.forEach((a, j) => {
    const aPath = `${path}.accounts[${j}]`;
    if (typeof a !== "object" || a === null || Array.isArray(a)) {
      issues.push({ path: aPath, message: `accounts[${j}] \u4E0D\u662F\u5BF9\u8C61,\u5DF2\u8DF3\u8FC7` });
      return;
    }
    const ao = a;
    if (typeof ao.credentialRef !== "string" || ao.credentialRef === "") {
      issues.push({ path: aPath, message: `accounts[${j}] \u7F3A\u975E\u7A7A credentialRef,\u5DF2\u8DF3\u8FC7` });
      return;
    }
    if (!ao.credentialRef.startsWith(`${providerId}/`)) {
      issues.push({
        path: `${aPath}.credentialRef`,
        message: `credentialRef ${JSON.stringify(ao.credentialRef)} \u4E0E\u6240\u5728 provider ${providerId} \u4E0D\u4E00\u81F4,\u5DF2\u8DF3\u8FC7`
      });
      return;
    }
    if (accountSeen.has(ao.credentialRef)) {
      issues.push({ path: aPath, message: `\u91CD\u590D\u7684\u8D26\u6237 ${ao.credentialRef},\u5DF2\u4FDD\u7559\u540E\u8005` });
    } else {
      accountSeen.add(ao.credentialRef);
    }
    const enabled = asBool(ao.enabled, true);
    if (!enabled.ok) issues.push({ path: `${aPath}.enabled`, message: `enabled \u5FC5\u987B\u662F\u5E03\u5C14,\u6309 true \u5904\u7406` });
    const cooldown = ao.cooldownOverrideMinutes === void 0 ? null : ao.cooldownOverrideMinutes === null || isPositiveNumber(ao.cooldownOverrideMinutes) ? ao.cooldownOverrideMinutes : (issues.push({ path: `${aPath}.cooldownOverrideMinutes`, message: `cooldownOverrideMinutes \u5FC5\u987B\u662F\u6B63\u6570\u6216 null,\u6309 null \u5904\u7406` }), null);
    const pinTtl = ao.sessionPinTtlSeconds === void 0 ? null : ao.sessionPinTtlSeconds === null || isPositiveNumber(ao.sessionPinTtlSeconds) ? ao.sessionPinTtlSeconds : (issues.push({ path: `${aPath}.sessionPinTtlSeconds`, message: `sessionPinTtlSeconds \u5FC5\u987B\u662F\u6B63\u6570\u6216 null,\u6309 null \u5904\u7406` }), null);
    accounts.push({
      credentialRef: ao.credentialRef,
      enabled: enabled.value,
      cooldownOverrideMinutes: cooldown,
      sessionPinTtlSeconds: pinTtl
    });
  });
  return {
    id: providerId,
    baseUrl: baseUrl.value,
    protocol: obj.protocol === void 0 ? DEFAULT_PROVIDER_PROTOCOL : obj.protocol,
    envPrefix: envPrefix.value,
    realModels,
    accounts
  };
}
function validateLogicalModelEntry(raw, index, issues) {
  const path = `logicalModels[${index}]`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ path, message: `logicalModels[${index}] \u4E0D\u662F\u5BF9\u8C61,\u5DF2\u8DF3\u8FC7` });
    return null;
  }
  const obj = raw;
  if (typeof obj.name !== "string" || obj.name === "") {
    issues.push({ path, message: `logicalModels[${index}] \u7F3A\u975E\u7A7A name,\u5DF2\u8DF3\u8FC7` });
    return null;
  }
  const rawStrategy = obj.strategy;
  const { strategy, fellBack } = rawStrategy == null ? { strategy: DEFAULT_SCHEDULER_STRATEGY, fellBack: false } : normalizeStrategy(rawStrategy);
  if (fellBack) {
    issues.push({
      path: `${path}.strategy`,
      message: `\u672A\u77E5\u7B56\u7565 ${JSON.stringify(obj.strategy)},\u5DF2\u9000\u56DE\u9ED8\u8BA4 ${DEFAULT_SCHEDULER_STRATEGY}(\u540C repo.normalize_strategy \u53E3\u5F84)`
    });
  }
  const members = normalizeMembers(obj.members, `${path}.members`, issues);
  return { name: obj.name, strategy, members };
}
function validateSchedulerRule(raw, path, issues) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    issues.push({ path, message: `${path} \u4E0D\u662F\u5BF9\u8C61,\u5DF2\u5FFD\u7565` });
    return null;
  }
  const obj = raw;
  const provider = obj.provider;
  if (typeof provider !== "string" || provider.trim() === "") {
    issues.push({ path, message: `${path} \u7F3A\u975E\u7A7A provider,\u5DF2\u5FFD\u7565` });
    return null;
  }
  const rule = { provider };
  if (obj.model !== void 0) {
    if (typeof obj.model === "string" && obj.model.trim() !== "") {
      rule.model = obj.model;
    } else {
      issues.push({ path: `${path}.model`, message: `model ${JSON.stringify(obj.model)} \u4E0D\u662F\u975E\u7A7A\u5B57\u7B26\u4E32,\u6309\u300C\u65E0 model\u300D\u5904\u7406` });
    }
  }
  if (obj.expiresAt !== void 0) {
    if (parseExpiryDate(obj.expiresAt) !== null) {
      rule.expiresAt = obj.expiresAt;
    } else {
      issues.push({ path: `${path}.expiresAt`, message: `expiresAt ${JSON.stringify(obj.expiresAt)} \u65E0\u6CD5\u89E3\u6790\u6210 YYYY-MM-DD,\u6309\u300C\u65E0\u5230\u671F\u300D\u5904\u7406` });
    }
  }
  const window = {};
  const winSrc = typeof obj.window === "object" && obj.window !== null && !Array.isArray(obj.window) ? obj.window : null;
  if (obj.window !== void 0 && winSrc === null) {
    issues.push({ path: `${path}.window`, message: `window ${JSON.stringify(obj.window)} \u4E0D\u662F\u5BF9\u8C61,\u6309\u300C\u65E0\u65F6\u6BB5\u300D\u5904\u7406` });
  }
  const timesRaw = winSrc !== null ? winSrc.times : obj.times;
  if (timesRaw !== void 0) {
    if (isValidSpans(timesRaw)) {
      window.times = timesRaw.map(([a, b]) => [a, b]);
    } else {
      issues.push({ path: `${path}.times`, message: `times ${JSON.stringify(timesRaw)} \u4E0D\u662F\u5408\u6CD5 spans([["HH:MM","HH:MM"], ...]),\u6309\u300C\u65E0\u65F6\u6BB5\u300D\u5904\u7406` });
    }
  }
  const wdRaw = winSrc !== null ? winSrc.weekdays : obj.weekdays;
  if (wdRaw !== void 0) {
    if (Array.isArray(wdRaw) && wdRaw.length > 0 && wdRaw.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
      window.weekdays = wdRaw;
    } else {
      issues.push({ path: `${path}.weekdays`, message: `weekdays ${JSON.stringify(wdRaw)} \u4E0D\u662F 1..7 \u7684\u6574\u6570\u5217\u8868,\u6309\u300C\u6BCF\u5929\u300D\u5904\u7406` });
    }
  }
  if (window.times !== void 0 || window.weekdays !== void 0) rule.window = window;
  if (obj.cooldown !== void 0) {
    issues.push({ path: `${path}.cooldown`, message: `cooldown \u5B57\u6BB5\u5DF2\u8FC1\u5230 setting\u300Cscheduler.cooldown_overrides\u300D,\u6B64\u5904\u5DF2\u5FFD\u7565` });
  }
  if (obj.logical !== void 0) {
    issues.push({ path: `${path}.logical`, message: `logical \u5B57\u6BB5\u5DF2\u5E9F\u5F03(\u65F6\u6BB5\u89C4\u5219\u4E00\u5F8B\u5168\u5C40\u751F\u6548),\u5DF2\u5FFD\u7565` });
  }
  if (obj.priority !== void 0) {
    if (Number.isInteger(obj.priority) && obj.priority >= 0) {
      rule.priority = obj.priority;
    } else {
      issues.push({ path: `${path}.priority`, message: `priority ${JSON.stringify(obj.priority)} \u4E0D\u662F\u975E\u8D1F\u6574\u6570,\u6309\u300C\u672A\u8BBE\u7F6E\u300D\u5904\u7406` });
    }
  }
  return rule;
}
function loadProviderConfig(raw) {
  const issues = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigValidationError(
      [{ path: "$", message: `\u914D\u7F6E\u6839\u8282\u70B9\u4E0D\u662F\u5BF9\u8C61(${raw === null ? "null" : typeof raw})` }],
      "provider \u914D\u7F6E\u6839\u8282\u70B9\u4E0D\u662F\u5BF9\u8C61"
    );
  }
  const root = raw;
  if (root.version !== 1) {
    throw new ConfigValidationError(
      [{ path: "$.version", message: `\u65E0\u6CD5\u8BC6\u522B\u7684 version ${JSON.stringify(root.version)}(\u53EA\u652F\u6301 1)` }],
      `provider \u914D\u7F6E version \u65E0\u6CD5\u8BC6\u522B:${JSON.stringify(root.version)}`
    );
  }
  const snapshot = emptySnapshot();
  const providers = snapshot.providers;
  const realModels = snapshot.realModels;
  const accounts = snapshot.accounts;
  const logicalModels = snapshot.logicalModels;
  const rawProviders = Array.isArray(root.providers) ? root.providers : [];
  if (root.providers !== void 0 && !Array.isArray(root.providers)) {
    issues.push({ path: "$.providers", message: `providers \u4E0D\u662F\u6570\u7EC4,\u6309\u7A7A\u5904\u7406` });
  }
  rawProviders.forEach((entry, i) => {
    const validated = validateProviderEntry(entry, i, issues);
    if (!validated) return;
    const prevProvider = snapshot.providers.get(validated.id);
    if (prevProvider) {
      issues.push({ path: `providers[${i}]`, message: `\u91CD\u590D\u7684 provider ${validated.id},\u5DF2\u4FDD\u7559\u540E\u8005` });
    }
    providers.set(validated.id, {
      id: validated.id,
      baseUrl: validated.baseUrl,
      protocol: validated.protocol,
      envPrefix: validated.envPrefix
    });
    for (const model of validated.realModels) {
      realModels.set(`${model.provider}/${model.model}`, model);
    }
    for (const account of validated.accounts) {
      accounts.set(account.credentialRef, account);
    }
  });
  const rawLogical = Array.isArray(root.logicalModels) ? root.logicalModels : [];
  if (root.logicalModels !== void 0 && !Array.isArray(root.logicalModels)) {
    issues.push({ path: "$.logicalModels", message: `logicalModels \u4E0D\u662F\u6570\u7EC4,\u6309\u7A7A\u5904\u7406` });
  }
  rawLogical.forEach((entry, i) => {
    const validated = validateLogicalModelEntry(entry, i, issues);
    if (!validated) return;
    const prev = snapshot.logicalModels.get(validated.name);
    if (prev) {
      issues.push({ path: `logicalModels[${i}]`, message: `\u91CD\u590D\u7684\u903B\u8F91\u6A21\u578B ${validated.name},\u5DF2\u4FDD\u7559\u540E\u8005` });
    }
    logicalModels.set(validated.name, validated);
  });
  const rawRules = Array.isArray(root.schedulerRules) ? root.schedulerRules : [];
  if (root.schedulerRules !== void 0 && !Array.isArray(root.schedulerRules)) {
    issues.push({ path: "$.schedulerRules", message: `schedulerRules \u4E0D\u662F\u6570\u7EC4,\u6309\u7A7A\u5904\u7406` });
  }
  const rules = [];
  rawRules.forEach((entry, i) => {
    const validated = validateSchedulerRule(entry, `$.schedulerRules[${i}]`, issues);
    if (validated) rules.push(validated);
  });
  snapshot.schedulerRules = rules;
  return { snapshot, issues };
}
var ProviderRegistry = class _ProviderRegistry {
  constructor(filePath, snapshot, issues) {
    this.filePath = filePath;
    this.snapshot = snapshot;
    this.configIssues = issues;
  }
  filePath;
  snapshot;
  configIssues;
  listeners = /* @__PURE__ */ new Set();
  watcher = null;
  closed = false;
  /**
   * 加载 provider 配置文件。
   *
   * - 文件不存在 → 空注册表(首次安装,不算错误);
   * - JSON 语法错误 / 版本不认识 / 根节点不是对象 → 抛
   *   {@link ConfigValidationError}(issues 里带具体路径与原因);
   * - 结构问题 → 坏条目跳过 + ``registry.issues`` 可查。
   */
  static async load(filePath) {
    const result = readJsonFile(filePath);
    if (!result.ok) {
      if (result.missing) return new _ProviderRegistry(filePath, emptySnapshot(), []);
      throw new ConfigValidationError(
        [{ path: "$", message: `JSON \u89E3\u6790\u5931\u8D25:${result.error}` }],
        `provider \u914D\u7F6E\u6587\u4EF6\u65E0\u6CD5\u89E3\u6790`
      );
    }
    const { snapshot, issues } = loadProviderConfig(result.value);
    return new _ProviderRegistry(filePath, snapshot, issues);
  }
  /** 配置文件路径。 */
  get path() {
    return this.filePath;
  }
  /** 加载期产生的 issues(坏条目跳过 / 宽容忽略等;空数组 = 干净)。 */
  get issues() {
    return this.configIssues;
  }
  // ---------------------------------------------------------------- 查找
  /** 按 vendor(= provider id)查找 provider 定义;不存在 → ``null``。 */
  getProvider(vendorId) {
    return this.snapshot.providers.get(vendorId) ?? null;
  }
  /** 全部 provider 定义(按 id 升序,镜像 repo.providers() 的 ORDER BY id)。 */
  listProviders() {
    return [...this.snapshot.providers.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  /** 按协议过滤 provider(``openai`` / ``workbuddy`` / ``trae`` / ``sensenova``)。 */
  listProvidersByProtocol(protocol) {
    return this.listProviders().filter((p) => p.protocol === protocol);
  }
  /** 按 ``credentialRef``(``"<provider>/<username>"``)查找账户配置。 */
  getAccount(credentialRef) {
    return this.snapshot.accounts.get(credentialRef) ?? null;
  }
  /** 全部账户配置(可选按 provider 过滤;按 credentialRef 升序)。 */
  listAccounts(provider) {
    return [...this.snapshot.accounts.values()].filter((a) => provider === void 0 ? true : a.credentialRef.startsWith(`${provider}/`)).sort((a, b) => a.credentialRef < b.credentialRef ? -1 : a.credentialRef > b.credentialRef ? 1 : 0);
  }
  /** 已启用的账户(``enabled: false`` 的停用账户;Nexus 无此维度 —— 见 AccountConfig 注释)。 */
  listEnabledAccounts(provider) {
    return this.listAccounts(provider).filter((a) => a.enabled);
  }
  /** 按 ``(provider, model)`` 查找真实模型定义。 */
  getRealModel(provider, model) {
    return this.snapshot.realModels.get(`${provider}/${model}`) ?? null;
  }
  /** 全部真实模型(可选按 provider 过滤)。 */
  listRealModels(provider) {
    return [...this.snapshot.realModels.values()].filter(
      (m) => provider === void 0 ? true : m.provider === provider
    );
  }
  /** 按名称查找逻辑模型(档链)。 */
  getLogicalModel(name2) {
    return this.snapshot.logicalModels.get(name2) ?? null;
  }
  /** 全部逻辑模型(按 name 升序)。 */
  listLogicalModels() {
    return [...this.snapshot.logicalModels.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }
  /** 档链成员(**数组顺序 = priority**;不存在 → 空数组)。 */
  membersOf(name2) {
    return this.snapshot.logicalModels.get(name2)?.members ?? [];
  }
  /** 档链策略(缺省 ``random`` —— 2026-10-26 用户 m15445 定案,镜像 repo.strategy_of 的 default 参数)。 */
  strategyOf(name2) {
    return this.snapshot.logicalModels.get(name2)?.strategy ?? DEFAULT_SCHEDULER_STRATEGY;
  }
  /** 调度规则(已归一化 + priority 推导;数组顺序 = 配置顺序)。 */
  listSchedulerRules() {
    return this.snapshot.schedulerRules;
  }
  /** 按 provider 过滤的调度规则(``cooldown`` 覆盖 / 免费档 / 时段规则等)。 */
  listSchedulerRulesFor(provider) {
    return this.snapshot.schedulerRules.filter((r) => r.provider === provider);
  }
  // ---------------------------------------------------------------- 热重载
  /**
   * 从**已有快照**构造(数据库投影路径)。
   *
   * 桌面端用户裁定(m28134):数据库是唯一真源,JSON 退化为导入/导出。
   * 于是注册表不再从文件加载,而是由装配层把
   * ``snapshotFromDb(db)``(见 db/registry-projection.ts)的结果喂进来。
   *
   * ``filePath`` 只用于诊断信息(日志/``registry.path``),不再被读取。
   */
  static fromSnapshot(snapshot, options = {}) {
    return new _ProviderRegistry(options.filePath ?? "<db>", snapshot, options.issues ?? []);
  }
  /**
   * 原地换快照(数据库写入之后调用)。
   *
   * 与 {@link reload} 的区别:不读文件、不抛错 —— 快照由调用方负责正确性
   * (装配层刚从库里投影出来)。换完发射 ``reloaded``,让订阅者
   * (面板缓存 / 调度器)知道该失效。
   */
  refreshFromSnapshot(snapshot, issues = []) {
    this.snapshot = snapshot;
    this.configIssues = issues;
    this.emit({ type: "reloaded", issues });
  }
  /**
   * 手动重新加载(``fs.watch`` 热重载失败时也会走这条路)。
   *
   * 成功 → 原子换快照 + 返回 ``{ reloaded: true }``;
   * 失败 → **保留上次好快照** + 返回 ``{ reloaded: false }`` 并发射
   * ``error`` 事件(热重载铁律:坏文件不炸运行中的系统)。
   */
  async reload() {
    try {
      const registry = await _ProviderRegistry.load(this.filePath);
      this.snapshot = registry.snapshot;
      this.configIssues = registry.issues;
      this.emit({ type: "reloaded", issues: this.configIssues });
      return { reloaded: true, issues: this.configIssues };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const issue = { path: "$", message: `\u70ED\u91CD\u8F7D\u5931\u8D25,\u4FDD\u7559\u4E0A\u6B21\u597D\u5FEB\u7167:${error.message}` };
      this.emit({ type: "error", error, issues: [issue] });
      return { reloaded: false, issues: [issue] };
    }
  }
  /**
   * 启动 ``fs.watch`` 防抖热重载(默认 100ms 防抖,见 store.ts)。
   *
   * @returns 句柄,``close()`` 停止监听。
   */
  async watch(options = {}) {
    if (this.watcher) return { close: () => this.watcher?.close() };
    const watcher = watchJsonFile(
      this.filePath,
      (text) => {
        void this.applyText(text);
      },
      (err) => {
        this.emit({
          type: "error",
          error: err,
          issues: [{ path: "$", message: `\u6587\u4EF6\u76D1\u542C\u5931\u8D25:${err.message}` }]
        });
      },
      { debounceMs: options.debounceMs }
    );
    this.watcher = watcher;
    return {
      close: () => {
        watcher.close();
        if (this.watcher === watcher) this.watcher = null;
      }
    };
  }
  /** 订阅热重载事件(``reloaded`` / ``error``);返回退订函数。 */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** 停止监听(幂等)。 */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.watcher?.close();
    this.watcher = null;
    this.listeners.clear();
  }
  // ---------------------------------------------------------------- 内部
  /** 应用 watch 回调拿到的文件文本(解析 + 校验 + 原子换快照)。 */
  async applyText(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      this.emit({
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
        issues: [{ path: "$", message: `\u70ED\u91CD\u8F7D\u89E3\u6790\u5931\u8D25,\u4FDD\u7559\u4E0A\u6B21\u597D\u5FEB\u7167:${err.message}` }]
      });
      return;
    }
    try {
      const { snapshot, issues } = loadProviderConfig(raw);
      this.snapshot = snapshot;
      this.configIssues = issues;
      this.emit({ type: "reloaded", issues });
    } catch (err) {
      this.emit({
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
        issues: [{ path: "$", message: `\u70ED\u91CD\u8F7D\u6821\u9A8C\u5931\u8D25,\u4FDD\u7559\u4E0A\u6B21\u597D\u5FEB\u7167:${err.message}` }]
      });
    }
  }
  emit(event) {
    for (const listener of [...this.listeners]) listener(event);
  }
};

// ../core/src/config/credentials.ts
import { createHash } from "node:crypto";
var CredentialError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options?.cause !== void 0 ? { cause: options.cause } : void 0);
    this.name = "CredentialError";
    this.code = code;
  }
};
var CredentialConfigError = class extends CredentialError {
  constructor(message, options) {
    super("credential-config", message, options);
    this.name = "CredentialConfigError";
  }
};
var UnsupportedBackendOperation = class extends CredentialError {
  constructor(operation) {
    super("unsupported-backend-operation", `\u540E\u7AEF\u4E0D\u652F\u6301\u5199\u64CD\u4F5C:${operation}(\u51ED\u636E\u7531\u5BBF\u4E3B\u7BA1\u7406)`);
    this.name = "UnsupportedBackendOperation";
  }
};
function credentialKey(provider, username) {
  return `${provider}/${username}`;
}
function expiresAtOf(cred) {
  const fromColumn = normalizeExpiresSeconds(cred.expiresAt);
  if (fromColumn !== null) return fromColumn;
  for (const key3 of ["token_expires_at_ms", "expires_at"]) {
    const value = normalizeExpiresSeconds(cred.raw[key3]);
    if (value !== null) return value;
  }
  return null;
}
function needsRefresh(cred, options = {}) {
  if (!cred.refreshSecret) return false;
  const expires = expiresAtOf(cred);
  if (expires === null) return true;
  const now = options.now ?? systemWallClock();
  return expires - (options.marginSeconds ?? 300) <= now;
}
function fingerprint(value) {
  if (!value) return null;
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}
function parseRaw(raw) {
  if (raw === null || raw === void 0) return {};
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "") return {};
    try {
      const parsed = JSON.parse(text);
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}
function toCredential(row) {
  return {
    provider: row.provider,
    username: row.username,
    secret: row.secret,
    refreshSecret: row.refresh_secret,
    expiresAt: row.expires_at,
    raw: parseRaw(row.raw_json)
  };
}
function toStored(cred) {
  return {
    provider: cred.provider,
    username: cred.username,
    secret: cred.secret,
    refresh_secret: cred.refreshSecret,
    expires_at: cred.expiresAt,
    // ⚠️ `raw_json` 落盘成 **JSON 字符串**,与 Nexus 的 DB 列语义一致
    // (`credentials.py` 那一列就是 TEXT,读侧 `json.loads`)。以前这里直接写对象,
    // 于是同一个文件里两种形态并存 —— 读侧只认一种,于是另一种的数据「静默丢失」。
    // 现在写读都用「JSON 字符串」这一种,`parseRaw` 两种都吃(兼容旧文件)。
    raw_json: JSON.stringify(cred.raw ?? {})
  };
}
var FileCredentialBackend = class {
  constructor(filePath) {
    this.filePath = filePath;
  }
  filePath;
  name = "file";
  writable = true;
  rows = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  loaded = null;
  unsubscribeWatch = null;
  closed = false;
  /** 路径注入点:文件路径由调用方给(测试 = 临时目录)。 */
  get path() {
    return this.filePath;
  }
  onChange(listener) {
    this.listeners.add(listener);
    void this.ensureLoaded();
    return () => this.listeners.delete(listener);
  }
  /** 停止 watch(进程退出 / 测试清理用)。 */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeWatch?.();
    this.unsubscribeWatch = null;
  }
  async list() {
    await this.ensureLoaded();
    return [...this.rows.values()];
  }
  async get(provider, username) {
    await this.ensureLoaded();
    return this.rows.get(credentialKey(provider, username)) ?? null;
  }
  async put(record2) {
    await this.ensureLoaded();
    this.rows.set(credentialKey(record2.provider, record2.username), record2);
    this.persist();
  }
  async remove(provider, username) {
    await this.ensureLoaded();
    const existed = this.rows.delete(credentialKey(provider, username));
    if (existed) this.persist();
    return existed;
  }
  // ---------------------------------------------------------------- 内部
  ensureLoaded() {
    if (!this.loaded) this.loaded = this.doLoad();
    return this.loaded;
  }
  async doLoad() {
    const result = readJsonFile(this.filePath);
    if (!result.ok) {
      if (result.missing) {
        this.rows = /* @__PURE__ */ new Map();
        this.startWatch();
        return;
      }
      throw new CredentialConfigError(`\u51ED\u636E\u6587\u4EF6\u65E0\u6CD5\u89E3\u6790:${result.error}`, { cause: result.error });
    }
    const doc = result.value;
    const rows = Array.isArray(doc.credentials) ? doc.credentials : [];
    const next = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (!isStoredCredential(row)) {
        console.warn("[config/credentials] \u8DF3\u8FC7\u975E\u6CD5\u51ED\u636E\u884C:", row);
        continue;
      }
      next.set(credentialKey(row.provider, row.username), row);
    }
    this.rows = next;
    this.startWatch();
  }
  /** 原子写整个文件(临时文件 + rename + 回读校验,见 store.ts)。 */
  persist() {
    const doc = {
      version: 1,
      credentials: [...this.rows.values()]
    };
    writeJsonFileAtomic(this.filePath, doc);
  }
  /** 启动 ``fs.watch``:外部改文件 → 重载 + diff 发射 ``external`` 事件。 */
  startWatch() {
    if (this.unsubscribeWatch || this.closed) return;
    const watcher = watchJsonFile(
      this.filePath,
      (text) => {
        void this.reloadFromText(text);
      },
      () => {
      }
    );
    this.unsubscribeWatch = () => watcher.close();
  }
  /** 从文件文本重载并 diff(与内存里现有行比对,只发射真变化)。 */
  async reloadFromText(text) {
    let doc;
    try {
      doc = JSON.parse(text);
    } catch {
      return;
    }
    const rows = Array.isArray(doc.credentials) ? doc.credentials : [];
    const next = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (!isStoredCredential(row)) continue;
      next.set(credentialKey(row.provider, row.username), row);
    }
    const events = [];
    for (const [key3, row] of next) {
      const prev = this.rows.get(key3);
      if (!prev || !sameStored(prev, row)) {
        events.push({ type: "external", provider: row.provider, username: row.username });
      }
    }
    for (const key3 of this.rows.keys()) {
      if (!next.has(key3)) {
        const prev = this.rows.get(key3);
        events.push({ type: "external", provider: prev.provider, username: prev.username });
      }
    }
    this.rows = next;
    if (events.length > 0) this.emit(events);
  }
  emit(events) {
    for (const listener of [...this.listeners]) listener(events);
  }
};
function isStoredCredential(value) {
  if (typeof value !== "object" || value === null) return false;
  const row = value;
  return typeof row.provider === "string" && row.provider !== "" && typeof row.username === "string" && (row.secret === null || row.secret === void 0 || typeof row.secret === "string") && (row.refresh_secret === null || row.refresh_secret === void 0 || typeof row.refresh_secret === "string") && (row.expires_at === null || row.expires_at === void 0 || typeof row.expires_at === "number" && Number.isFinite(row.expires_at));
}
function sameStored(a, b) {
  return a.provider === b.provider && a.username === b.username && a.secret === b.secret && a.refresh_secret === b.refresh_secret && a.expires_at === b.expires_at && JSON.stringify(a.raw_json ?? null) === JSON.stringify(b.raw_json ?? null);
}
var CredentialVault = class {
  constructor(backend, options = {}) {
    this.backend = backend;
    this.clock = options.clock ?? systemWallClock;
    if (backend.onChange) {
      this.unsubscribeBackend = backend.onChange((events) => this.emit(events));
    }
  }
  backend;
  listeners = /* @__PURE__ */ new Set();
  clock;
  unsubscribeBackend = null;
  /** 后端标识(``memory`` / ``file`` / ``dsh`` …)。 */
  get backendName() {
    return this.backend.name;
  }
  // ---------------------------------------------------------------- 读
  /** 完整凭据记录(含密钥)—— **仅进程内**使用,绝不进日志 / 响应。 */
  async get(provider, username) {
    const row = await this.backend.get(provider, username);
    return row ? toCredential(row) : null;
  }
  /** 凭据摘要(**不含密钥**;面板 / 日志 / 健康快照唯一出口)。 */
  async describe(provider, username) {
    const cred = await this.get(provider, username);
    return cred ? toSummary(cred) : null;
  }
  /**
   * 凭据清单(**不含密钥**),按 ``(provider, username)`` 排序 ——
   * 镜像 repo.py L696-704 ``credentials()`` 的 ``ORDER BY provider, username``。
   */
  async list(provider) {
    const rows = await this.backend.list();
    return rows.map(toCredential).filter((cred) => provider === void 0 ? true : cred.provider === provider).sort((a, b) => (a.provider === b.provider ? 0 : a.provider < b.provider ? -1 : 1) || (a.username < b.username ? -1 : a.username > b.username ? 1 : 0)).map(toSummary);
  }
  /**
   * **唯一明文出口** —— 取某条凭据的 secret(镜像 repo.py L716-721
   * ``credential_secret``)。调用方必须自己拿去做 HTTP 头,
   * 且**永不**把它写进日志 / 响应 / 错误消息。
   */
  async secret(provider, username) {
    const row = await this.backend.get(provider, username);
    return row?.secret ?? null;
  }
  /**
   * 某 provider 全部凭据的 ``{username: secret}``(镜像 repo.py L723-730
   * ``secrets_for``,面板探测 / 连接器用)。
   *
   * ⚠️ 与 Nexus 的**有意偏差**:Nexus 的 ``str(r["secret"])`` 会把
   * NULL 变成字符串 ``"None"``(Python 语义);TS 侧**跳过** secret 为
   * null 的行 —— 探测结果里出现 "None" 字符串是明确的 bug 特征。
   */
  async secretsFor(provider) {
    const rows = await this.backend.list();
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (row.provider === provider && row.secret !== null) {
        out.set(row.username, row.secret);
      }
    }
    return out;
  }
  /** 令牌到期时刻(epoch 秒,``null`` = 未知)—— 委托 {@link expiresAtOf}。 */
  async expiresAt(provider, username) {
    const cred = await this.get(provider, username);
    return cred ? expiresAtOf(cred) : null;
  }
  /** 是否该刷新(见 {@link needsRefresh};可注入 ``now`` 便于测试)。 */
  async shouldRefresh(provider, username, options = {}) {
    const cred = await this.get(provider, username);
    if (!cred) return false;
    return needsRefresh(cred, { ...options, now: this.clock() });
  }
  // ---------------------------------------------------------------- 写
  /**
   * 登记 / 覆盖一条凭据(镜像 ``upsert_credential`` + ``save_tokens``):
   *
   * - ``provider`` 必填非空(空 provider 无法兜底 username);
   * - ``username`` 空 → 兜底成 provider 名(repo.py L675);
   * - 每个字段:**给了(非 undefined)就覆盖**,``null`` 显式清空,
   *   ``undefined`` 保留原值 —— 与 save_tokens「refresh_token 只在拿到
   *   新值时覆盖」(L267-268)同哲学;
   * - ``expiresAt`` 单位是**秒**(写入前不替调用方猜单位)。
   */
  async put(input) {
    this.assertWritable("put");
    const provider = requireNonEmpty(input.provider, "provider");
    const username = (input.username ?? "").trim() || provider;
    const existingRow = await this.backend.get(provider, username);
    const existing = existingRow ? toCredential(existingRow) : null;
    const merged = {
      provider,
      username,
      secret: input.secret !== void 0 ? input.secret : existing?.secret ?? null,
      refreshSecret: input.refreshSecret !== void 0 ? input.refreshSecret : existing?.refreshSecret ?? null,
      expiresAt: input.expiresAt !== void 0 ? input.expiresAt : existing?.expiresAt ?? null,
      raw: input.raw != null ? input.raw : existing?.raw ?? {}
    };
    await this.backend.put(toStored(merged));
    this.emit([{ type: "put", provider, username }]);
    return merged;
  }
  /**
   * 热轮换 —— 刷新结果写回(镜像 ``save_tokens``,credentials.py L260-327):
   *
   * - ``secret`` 立即覆盖(Nexus 无宽限期,见文件头「热轮换语义」);
   * - ``refreshSecret`` **只在拿到新值时覆盖**(上游可能不轮换,L267-268);
   * - ``expiresAt`` 给了就覆盖,并把 ``raw_json`` 里的到期字段
   *   (``token_expires_at_ms`` / ``expires_at``,若存在)同步成**毫秒**
   *   (L293-298 —— 否则库里两处并存且不一致,下次直接读 raw 的代码会拿到
   *   过期数据);
   * - 发射 ``rotate`` 事件(在途请求手里仍是旧令牌字符串副本,用到失效为止)。
   */
  async rotate(provider, username, update) {
    this.assertWritable("rotate");
    const existing = await this.get(provider, username);
    if (!existing) {
      throw new CredentialConfigError(`\u8F6E\u6362\u5931\u8D25:\u51ED\u636E\u4E0D\u5B58\u5728 ${credentialKey(provider, username)}`);
    }
    const next = {
      ...existing,
      secret: update.secret !== void 0 ? update.secret : existing.secret,
      refreshSecret: update.refreshSecret !== void 0 ? update.refreshSecret : existing.refreshSecret,
      expiresAt: update.expiresAt !== void 0 ? update.expiresAt : existing.expiresAt
    };
    if (update.expiresAt !== void 0) {
      const stamp = update.expiresAt === null ? null : Math.trunc(update.expiresAt * 1e3);
      const raw = { ...next.raw };
      let touched = false;
      for (const key3 of ["token_expires_at_ms", "expires_at"]) {
        if (key3 in raw) {
          raw[key3] = stamp;
          touched = true;
        }
      }
      if (touched) next.raw = raw;
    }
    await this.backend.put(toStored(next));
    this.emit([{ type: "rotate", provider, username }]);
    return next;
  }
  /** 删除一条凭据(镜像 repo.py L732-736 ``delete_credential``)。 */
  async remove(provider, username) {
    this.assertWritable("remove");
    const existed = await this.backend.remove(provider, username);
    if (existed) this.emit([{ type: "remove", provider, username }]);
    return existed;
  }
  // ---------------------------------------------------------------- 事件 / 生命周期
  /** 订阅变更(本进程写 + 后端推送);返回退订函数。 */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** 停止后端 watch(幂等)。 */
  close() {
    if (this.backend instanceof FileCredentialBackend) this.backend.close();
    this.unsubscribeBackend?.();
    this.unsubscribeBackend = null;
    this.listeners.clear();
  }
  // ---------------------------------------------------------------- 内部
  assertWritable(operation) {
    if (!this.backend.writable) throw new UnsupportedBackendOperation(operation);
  }
  emit(events) {
    for (const listener of [...this.listeners]) listener(events);
  }
};
function toSummary(cred) {
  return {
    provider: cred.provider,
    username: cred.username,
    key: credentialKey(cred.provider, cred.username),
    expiresAt: cred.expiresAt,
    raw: cred.raw
  };
}
function requireNonEmpty(value, field) {
  if (typeof value !== "string" || value === "") {
    throw new CredentialConfigError(`\u51ED\u636E\u5B57\u6BB5 ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  }
  return value;
}

// ../core/src/db/credential-backend.ts
function rowToStored(row) {
  const out = {
    provider: row.provider,
    username: row.username,
    secret: row.secret ?? null,
    refresh_secret: row.refresh_secret ?? null,
    expires_at: row.expires_at ?? null
  };
  if (row.raw_json !== null) out.raw_json = row.raw_json;
  return out;
}
function storedToRow(record2) {
  let rawJson = null;
  if (typeof record2.raw_json === "string") rawJson = record2.raw_json;
  else if (record2.raw_json !== null && record2.raw_json !== void 0) rawJson = JSON.stringify(record2.raw_json);
  return {
    provider: record2.provider,
    username: record2.username,
    secret: record2.secret ?? null,
    refresh_secret: record2.refresh_secret ?? null,
    expires_at: record2.expires_at ?? null,
    raw_json: rawJson
  };
}
var DbCredentialBackend = class {
  constructor(db) {
    this.db = db;
  }
  db;
  name = "db";
  writable = true;
  listeners = /* @__PURE__ */ new Set();
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async list() {
    return this.db.credential.list().map(rowToStored);
  }
  async get(provider, username) {
    const row = this.db.credential.get(provider, username);
    return row ? rowToStored(row) : null;
  }
  async put(record2) {
    this.db.credential.set(storedToRow(record2));
  }
  async remove(provider, username) {
    if (!this.db.credential.get(provider, username)) return false;
    this.db.credential.delete(provider, username);
    return true;
  }
  emit(events) {
    for (const listener of [...this.listeners]) listener(events);
  }
};

// ../core/src/scheduler/backoff.ts
var DEFAULT_FACTOR = 2;
var RESET_DEADLINE_MIN_LEAD_S = 60;
var RETRY_KEYS = [
  "retry.base_backoff_s",
  "retry.max_backoff_s",
  "retry.jitter_ratio",
  "retry.codes",
  "retry.logical_max",
  "retry.real_max",
  "retry.logical_cooldown"
];
var RETRY_DEFAULTS = {
  "retry.base_backoff_s": 1,
  "retry.max_backoff_s": 15,
  "retry.jitter_ratio": 0.2,
  "retry.codes": "timeout,connection,429,500,502,503,504",
  "retry.logical_max": 1,
  "retry.real_max": 10,
  "retry.logical_cooldown": 15
};
function backoffDelay(params) {
  const factor = params.factor ?? DEFAULT_FACTOR;
  const n = Math.max(1, Math.trunc(params.attempt));
  const raw = Math.min(params.capS, params.baseS * Math.pow(factor, n - 1));
  const ratio = params.jitterRatio;
  if (ratio <= 0) return raw;
  const r = ratio > 1 ? 1 : ratio;
  const rng = params.rng ?? MathRng;
  return rng.uniform(raw * (1 - r), raw);
}
function coerceNumber(raw, key3) {
  if (raw === null || raw === void 0 || raw === "") return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) return null;
  const def = RETRY_DEFAULTS[key3];
  return Number.isInteger(def) ? Math.trunc(value) : value;
}
function retrySetting(repo, key3) {
  if (!(key3 in RETRY_DEFAULTS)) {
    throw new Error(`unknown retry setting: ${key3}`);
  }
  if (key3 === "retry.codes") {
    throw new Error("use retryCodes() for retry.codes");
  }
  let raw = repo.getSetting(key3);
  if (raw === null || raw === void 0) {
    repo.setSetting(key3, String(RETRY_DEFAULTS[key3]));
    raw = repo.getSetting(key3);
  }
  const coerced = coerceNumber(raw, key3);
  if (coerced === null) {
    repo.setSetting(key3, String(RETRY_DEFAULTS[key3]));
    raw = repo.getSetting(key3);
  }
  return coerceNumber(raw, key3) ?? Number(RETRY_DEFAULTS[key3]);
}
function retryCodes(repo) {
  let raw = repo.getSetting("retry.codes");
  if (raw === null || raw === void 0) {
    repo.setSetting("retry.codes", String(RETRY_DEFAULTS["retry.codes"]));
    raw = repo.getSetting("retry.codes");
  }
  let parts = splitCodes(raw);
  if (parts.size === 0) {
    repo.setSetting("retry.codes", String(RETRY_DEFAULTS["retry.codes"]));
    raw = repo.getSetting("retry.codes");
    parts = splitCodes(raw);
  }
  return parts;
}
function splitCodes(raw) {
  return new Set(
    String(raw ?? "").split(",").map((part) => part.trim().toLowerCase()).filter((part) => part.length > 0)
  );
}
function seedRetrySettings(repo) {
  for (const key3 of RETRY_KEYS) {
    const raw = repo.getSetting(key3);
    if (raw === null || raw === void 0) {
      try {
        repo.setSetting(key3, String(RETRY_DEFAULTS[key3]));
      } catch {
      }
    }
  }
}
var RetryPolicy = class _RetryPolicy {
  maxAttempts;
  cooldownFloorS;
  baseS;
  factor;
  capS;
  jitterRatio;
  codes;
  constructor(data) {
    this.maxAttempts = data.maxAttempts;
    this.cooldownFloorS = data.cooldownFloorS;
    this.baseS = data.baseS;
    this.factor = data.factor;
    this.capS = data.capS;
    this.jitterRatio = data.jitterRatio;
    this.codes = data.codes;
  }
  /** 从设置构建:abstract → retry.logical_max(1),否则 retry.real_max(10)。 */
  static of(repo, opts) {
    return new _RetryPolicy({
      maxAttempts: opts.abstract ? retrySetting(repo, "retry.logical_max") : retrySetting(repo, "retry.real_max"),
      cooldownFloorS: retrySetting(repo, "retry.logical_cooldown") * 60,
      baseS: retrySetting(repo, "retry.base_backoff_s"),
      factor: DEFAULT_FACTOR,
      capS: retrySetting(repo, "retry.max_backoff_s"),
      jitterRatio: retrySetting(repo, "retry.jitter_ratio"),
      codes: retryCodes(repo)
    });
  }
  /**
   * 三分支判定:
   * 1. reset_deadline > now + 60 → False(上游即将复位,不重试);
   * 2. retryable 显式 false → False;retryable 真值 → True;
   * 3. 否则 kind(http 名/枚举)与 http_status/status_code 与 codes 求交。
   */
  shouldRetry(exc, now) {
    const t = now ?? Date.now() / 1e3;
    if (typeof exc.reset_deadline === "number" && exc.reset_deadline > t + RESET_DEADLINE_MIN_LEAD_S) {
      return false;
    }
    if (exc.retryable !== void 0 && exc.retryable !== null && !exc.retryable) {
      return false;
    }
    if (exc.retryable) {
      return true;
    }
    const lowered = this.codes;
    let kind = "";
    if (typeof exc.kind === "string") {
      kind = exc.kind;
    } else if (exc.kind && typeof exc.kind === "object") {
      kind = exc.kind.value ?? exc.kind.name ?? "";
    }
    if (kind && lowered.has(kind.toLowerCase())) return true;
    const status = exc.http_status ?? exc.status_code;
    if (status !== void 0 && status !== null) {
      if (lowered.has(String(status))) return true;
    }
    return false;
  }
  /** 该尝试次数的退避秒数(无 rng → 系统随机源,抖动向下)。 */
  delayFor(attempt) {
    return backoffDelay({
      attempt,
      baseS: this.baseS,
      factor: this.factor,
      capS: this.capS,
      jitterRatio: this.jitterRatio
    });
  }
};
var MathRng = {
  random: () => Math.random(),
  uniform: (min, max) => min + (max - min) * Math.random(),
  shuffle: (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }
};
var SeededRng = class {
  state;
  constructor(seed = 49734321) {
    this.state = seed >>> 0;
  }
  random() {
    let t = this.state = this.state + 1831565813 >>> 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  uniform(min, max) {
    return min + (max - min) * this.random();
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }
};

// ../core/src/scheduler/engine-constants.ts
var STRATEGIES = [
  "due-first",
  "random",
  "ordered-fallback",
  "least-busy",
  "balanced"
];
var ORDER_STRATEGIES = /* @__PURE__ */ new Set([
  "ordered-fallback"
]);
var DEFAULT_STRATEGY = "random";
var CACHEABLE_STRATEGIES = /* @__PURE__ */ new Set([
  "due-first",
  "ordered-fallback",
  "least-busy",
  "balanced"
]);
var LOAD_AWARE_STRATEGIES = /* @__PURE__ */ new Set([
  "least-busy",
  "balanced"
]);
var DEFAULT_TTL_SECONDS = 300;
var QUOTA_REFRESH_PROVIDERS = ["trae", "workbuddy"];
var FREE_TIER = 1;
var GRANT_TIER = 2;
var CONSUME_TIER = 3;
var DEGRADED_TIER = 4;
var TIER_NAMES = {
  1: "T1 \u514D\u8D39\u6863",
  2: "T2 \u8D60\u9001\u989D\u5EA6",
  3: "T3 \u6D88\u8017\u6863",
  4: "T4 \u9AD8\u5CF0\u671F\u964D\u7EA7(\u6392\u672B)"
};
var GRANT_TIERS = [];
var FREE_TIER_ENTRIES = [];
var FREE_MODEL_PREFIXES = FREE_TIER_ENTRIES.map(
  (e) => `${e.provider}/${e.model}`
);
var CONFIG_TTL_SECONDS = 5;
var TRANSIENT_KINDS = /* @__PURE__ */ new Set([
  "timeout",
  "connection"
]);
var CONFIG_DEFAULT_RULES = [];
var CONFIG_DEFAULT_COOLDOWN_OVERRIDES = {};
var CONFIG_DEFAULTS_JSON = JSON.stringify({ rules: CONFIG_DEFAULT_RULES });
var COOLDOWN_DEFAULTS_JSON = JSON.stringify(CONFIG_DEFAULT_COOLDOWN_OVERRIDES);
var RULES_PRIORITY_KEYS = [1, 2, 3, 4, 0];

// ../core/src/scheduler/engine-utils.ts
import { performance as performance2 } from "node:perf_hooks";
function rulesKeyOf(priority) {
  return `scheduler.rules_p${priority}`;
}
function rulesDefaultsJson(priority) {
  const rules = CONFIG_DEFAULT_RULES.filter((r) => (r.priority ?? DEFAULT_PRIORITY) === priority).map(({ priority: _p, ...rest }) => rest);
  return JSON.stringify(rules, null, 2);
}
function cooldownDefaultsJson() {
  return COOLDOWN_DEFAULTS_JSON;
}
function wallNow() {
  return Date.now() / 1e3;
}
function monotonic() {
  return performance2.now() / 1e3;
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function fmtMinute(epoch) {
  const d = new Date(epoch * 1e3);
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function formatLocal(epoch) {
  const d = new Date(epoch * 1e3);
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function isRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function toInt(value, fallback) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
function hhmm(value) {
  const s = String(value);
  const idx = s.indexOf(":");
  if (idx < 0) throw new Error("invalid hhmm");
  const h = Number(s.slice(0, idx));
  const m = Number(s.slice(idx + 1));
  if (Number.isNaN(h) || Number.isNaN(m)) throw new Error("invalid hhmm");
  return h * 60 + m;
}
function fmtHhmm(minute) {
  const m = Math.max(0, Math.min(1440, minute));
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}
function expiryEpoch(value) {
  const text = String(value).trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (full) {
    const d = new Date(
      Number(full[1]),
      Number(full[2]) - 1,
      Number(full[3]),
      Number(full[4]),
      Number(full[5]),
      Number(full[6])
    );
    return d.getTime() / 1e3;
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day) {
    const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 0, 0, 0);
    return d.getTime() / 1e3;
  }
  return null;
}
function complementSpans(avail) {
  const parsed = [];
  for (const span of avail) {
    let s;
    let e;
    try {
      s = hhmm(span[0]);
      e = hhmm(span[1]);
    } catch {
      continue;
    }
    if (s === e) continue;
    if (s < e) parsed.push([s, e]);
    else {
      parsed.push([s, 1440]);
      parsed.push([0, e]);
    }
  }
  if (parsed.length === 0) return [];
  parsed.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of parsed) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const out = [];
  let cur = 0;
  for (const [s, e] of merged) {
    if (cur < s) out.push([fmtHhmm(cur), fmtHhmm(s)]);
    cur = Math.max(cur, e);
  }
  if (cur < 1440) out.push([fmtHhmm(cur), fmtHhmm(1440)]);
  return out;
}
function isBlackout(windows, now) {
  if (!windows || windows.length === 0) return false;
  const d = new Date(now * 1e3);
  const weekday = d.getDay() === 0 ? 7 : d.getDay();
  const minute = d.getHours() * 60 + d.getMinutes();
  for (const win of windows) {
    if (!win || typeof win !== "object") continue;
    const days = win.weekdays;
    if (days && days.length > 0 && !days.includes(weekday)) continue;
    for (const span of win.times ?? []) {
      let start;
      let end;
      try {
        start = hhmm(span[0]);
        end = hhmm(span[1]);
      } catch {
        continue;
      }
      if (start <= end) {
        if (start <= minute && minute < end) return true;
      } else if (minute >= start || minute < end) {
        return true;
      }
    }
  }
  return false;
}
function stableBy(keys) {
  const decorated = keys.map((k, i) => [...k, i]);
  decorated.sort(tupleCompare);
  return decorated.map((row) => row[row.length - 1]);
}
function tupleCompare(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}
function key(provider, model) {
  return `${provider}/${model}`;
}
function splitModelId2(mid) {
  const idx = mid.indexOf("/");
  if (idx < 0) return null;
  const p = mid.slice(0, idx);
  const m = mid.slice(idx + 1);
  if (!p || !m) return null;
  return [p, m];
}
function memberPair(member) {
  if (!isRecord(member)) return null;
  const provider = member.provider ?? member.provider_id;
  const model = member.model ?? member.upstream_id;
  if (provider && model) return [String(provider), String(model)];
  return splitModelId2(String(member.real_model_id ?? ""));
}
function rowMember(row) {
  const pair = memberPair(row.member);
  if (pair) return pair;
  const endpoint = isRecord(row.endpoint) ? row.endpoint : null;
  const pair2 = memberPair(endpoint);
  if (pair2) return pair2;
  return splitModelId2(String(row.real_model_id ?? ""));
}
function quotaKey(row, pair) {
  const endpoint = isRecord(row.endpoint) ? row.endpoint : {};
  const cred = endpoint.credential_key;
  if (Array.isArray(cred) && cred.length >= 2) {
    return key(cred[0] ? String(cred[0]) : pair[0], String(cred[1] ?? ""));
  }
  if (typeof cred === "string" && cred !== "") {
    return cred;
  }
  const username = endpoint.username ?? endpoint.account_id;
  if (username) return key(pair[0], String(username));
  return null;
}
var LEGACY_STRATEGY = [
  ["\u6700\u5148\u5230\u671F due first", "due-first"],
  ["\u6700\u5148\u5230\u671F", "due-first"],
  ["due first", "due-first"],
  ["random", "random"],
  ["\u7B80\u5355\u6253\u6563", "random"],
  ["simple-shuffle", "random"],
  ["\u7528\u91CF\u5E73\u8861", "least-busy"],
  ["usage-balanced", "least-busy"],
  ["usage-based-routing-v2", "least-busy"],
  ["usage-based-routing", "least-busy"],
  ["\u6309\u5E8F\u964D\u7EA7\u94FE", "ordered-fallback"],
  ["ordered-fallback", "ordered-fallback"],
  ["\u6700\u5C11\u5728\u9014", "least-busy"],
  ["least-busy", "least-busy"],
  ["\u5E73\u5747\u4F7F\u7528", "balanced"],
  ["balanced", "balanced"]
];
var STRATEGY_HINTS = [
  ["least-busy", "least-busy"],
  ["busy", "least-busy"],
  ["\u5728\u9014", "least-busy"],
  ["ordered", "ordered-fallback"],
  ["fallback", "ordered-fallback"],
  ["\u6309\u5E8F", "ordered-fallback"],
  ["usage", "least-busy"],
  ["\u7528\u91CF", "least-busy"],
  ["\u5E73\u5747", "balanced"],
  ["shuffle", "random"],
  ["random", "random"],
  ["\u968F\u673A", "random"],
  ["due", "due-first"],
  ["\u5230\u671F", "due-first"]
];
function normalizeStrategy2(raw) {
  if (!raw) return DEFAULT_STRATEGY;
  const value = String(raw).trim();
  if (value === "") return DEFAULT_STRATEGY;
  if (STRATEGIES.includes(value)) return value;
  const lowered = value.toLowerCase();
  for (const [legacy, machine] of LEGACY_STRATEGY) {
    if (lowered === legacy) return machine;
  }
  for (const [hint, machine] of STRATEGY_HINTS) {
    if (lowered.includes(hint)) return machine;
  }
  return DEFAULT_STRATEGY;
}
function isGrantTier(provider, model) {
  return GRANT_TIERS.some(([p, m]) => p === provider && m === model);
}
function jsonSetting(raw, defaultJson) {
  if (raw === null || raw === void 0 || raw.trim() === "") {
    return JSON.parse(defaultJson);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(defaultJson);
  }
}
function validSpans(spans) {
  if (!Array.isArray(spans) || spans.length === 0) return false;
  for (const span of spans) {
    if (!Array.isArray(span) || span.length !== 2) return false;
    try {
      hhmm(span[0]);
      hhmm(span[1]);
    } catch {
      return false;
    }
  }
  return true;
}
function validRules(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    if (typeof entry.provider !== "string" || entry.provider.trim() === "") continue;
    const rule = { provider: entry.provider.trim() };
    if (entry.model !== void 0 && entry.model !== null) {
      if (typeof entry.model === "string" && entry.model.trim() !== "") rule.model = entry.model.trim();
    }
    if (entry.expires_at !== void 0 && entry.expires_at !== null) {
      if (typeof entry.expires_at === "string" && expiryEpoch(entry.expires_at) !== null) {
        rule.expires_at = entry.expires_at;
      }
    }
    const winSrc = isRecord(entry.window) ? entry.window : entry;
    const window = {};
    const timesRaw = winSrc.times;
    if (timesRaw !== void 0 && timesRaw !== null && validSpans(timesRaw)) {
      window.times = timesRaw;
    }
    const wdRaw = winSrc.weekdays;
    if (Array.isArray(wdRaw) && wdRaw.length > 0 && wdRaw.every((w) => typeof w === "number" && Number.isInteger(w) && w >= 1 && w <= 7)) {
      window.weekdays = wdRaw;
    }
    if (window.times !== void 0 || window.weekdays !== void 0) rule.window = window;
    if (entry.priority !== void 0 && entry.priority !== null) {
      if (typeof entry.priority === "number" && Number.isInteger(entry.priority) && entry.priority >= 0) {
        rule.priority = entry.priority;
      }
    }
    out.push(rule);
  }
  return out;
}
function legacySectionsToRules(legacy) {
  const out = [];
  const free = legacy.free_models;
  if (Array.isArray(free)) {
    for (const e of free) {
      if (!isRecord(e)) continue;
      const { provider, model } = e;
      if (typeof provider !== "string" || provider === "" || typeof model !== "string" || model === "") {
        continue;
      }
      const item = { provider, model, priority: 1 };
      const exp = e.expires_at;
      if (typeof exp === "string" && expiryEpoch(exp) !== null) item.expires_at = exp;
      out.push(item);
      const win = e.window;
      if (Array.isArray(win) && validSpans(win)) {
        const spans = complementSpans(win);
        if (spans.length > 0) {
          out.push({ provider, model, window: { times: spans }, priority: 0 });
        }
      }
    }
  }
  const credit = legacy.credit_expiry;
  if (isRecord(credit)) {
    for (const [k, v] of Object.entries(credit)) {
      if (typeof v === "string" && expiryEpoch(v) !== null) {
        out.push({ provider: k, expires_at: v, priority: 2 });
      }
    }
  }
  const windows = legacy.time_windows;
  if (Array.isArray(windows)) {
    for (const r of windows) {
      if (!isRecord(r)) continue;
      const { provider, model } = r;
      if (typeof provider !== "string" || provider === "" || typeof model !== "string" || model === "") {
        continue;
      }
      const times = r.times ?? r.window;
      if (!validSpans(times)) continue;
      const item = {
        provider,
        model,
        window: { times },
        priority: r.mode === "degrade" ? 4 : 0
      };
      const wd = r.weekdays;
      if (Array.isArray(wd) && wd.length > 0 && wd.every((w) => typeof w === "number" && Number.isInteger(w) && w >= 1 && w <= 7)) {
        item.window.weekdays = wd;
      }
      out.push(item);
    }
  }
  return out;
}
function endpointIdOf(provider, model, username) {
  return `${provider}/${model}@${provider}/${username}`;
}
function credentialKeyOf(data, provider) {
  const cred = data.credential_key;
  if (Array.isArray(cred) && cred.length >= 2) {
    return [cred[0] ? String(cred[0]) : provider, cred[1] != null ? String(cred[1]) : ""];
  }
  if (typeof cred === "string" && cred !== "") {
    const idx = cred.indexOf("/");
    if (idx >= 0) {
      const head = cred.slice(0, idx);
      const tail = cred.slice(idx + 1);
      return [head || provider, tail];
    }
    return [provider, cred];
  }
  const username = data.username ?? data.account_id;
  if (username) return [provider, String(username)];
  return [provider, ""];
}

// ../core/src/scheduler/engine-health.ts
var EndpointHealth = class _EndpointHealth {
  fails = 0;
  cooldownUntil = 0;
  lastError = "";
  updatedAt = 0;
  lastKind = "";
  lastStatus = 0;
  /** 从快照数据重建(Endpoint ctor 注入 health 用)。 */
  static fromData(data) {
    const h = new _EndpointHealth();
    h.fails = data.fails;
    h.cooldownUntil = data.cooldownUntil;
    h.lastError = data.lastError;
    h.updatedAt = data.updatedAt;
    h.lastKind = data.lastKind;
    h.lastStatus = data.lastStatus;
    return h;
  }
  inCooldown(now) {
    if (this.cooldownUntil <= 0) return false;
    return this.cooldownUntil > (now ?? wallNow());
  }
  noteSuccess(now) {
    const t = now ?? wallNow();
    this.fails = 0;
    this.cooldownUntil = 0;
    this.lastError = "";
    this.lastKind = "";
    this.lastStatus = 0;
    this.updatedAt = t;
  }
  /**
   * 记失败:until 给 → cooldown_until 精确等于 until(绝对);kind 属瞬时
   * (timeout/connection) → 不熔断;否则 cooldown_until = now + floor(无策略 = 0)。
   */
  noteFailure(opts) {
    const t = opts.now ?? wallNow();
    this.fails += 1;
    this.lastError = (opts.error ?? "").slice(0, 200);
    this.lastKind = opts.kind ?? "";
    this.lastStatus = Math.trunc(opts.status ?? 0);
    this.updatedAt = t;
    if (opts.until !== void 0 && opts.until !== null) {
      this.cooldownUntil = opts.until;
      return;
    }
    if (TRANSIENT_KINDS.has(this.lastKind)) return;
    this.cooldownUntil = t + (opts.policy ? opts.policy.cooldownFloorS : 0);
  }
  toData() {
    return {
      fails: this.fails,
      cooldownUntil: this.cooldownUntil,
      lastError: this.lastError,
      updatedAt: this.updatedAt,
      lastKind: this.lastKind,
      lastStatus: this.lastStatus
    };
  }
};

// ../core/src/scheduler/engine-models.ts
var Endpoint = class _Endpoint {
  endpointId;
  provider;
  model;
  credentialKey;
  protocol;
  baseUrl;
  region;
  concurrency;
  supportsVision;
  maxInputTokens;
  maxOutputTokens;
  cooldownUntil;
  health;
  constructor(data) {
    this.endpointId = data.endpointId;
    this.provider = data.provider;
    this.model = data.model;
    this.credentialKey = data.credentialKey;
    this.protocol = data.protocol;
    this.baseUrl = data.baseUrl;
    this.region = data.region;
    this.concurrency = data.concurrency;
    this.supportsVision = data.supportsVision;
    this.maxInputTokens = data.maxInputTokens;
    this.maxOutputTokens = data.maxOutputTokens;
    this.cooldownUntil = data.cooldownUntil;
    this.health = data.health ? EndpointHealth.fromData(data.health) : null;
  }
  static fromData(data) {
    const provider = String(data.provider ?? data.provider_id ?? "");
    const model = String(data.model ?? data.upstream_id ?? "");
    const credential = credentialKeyOf(data, provider);
    const endpointId = data.endpoint_id ? String(data.endpoint_id) : endpointIdOf(provider, model, credential[1]);
    return new _Endpoint({
      endpointId,
      provider,
      model,
      credentialKey: credential,
      protocol: String(data.protocol ?? "openai"),
      baseUrl: String(data.base_url ?? ""),
      region: String(data.region ?? ""),
      concurrency: toInt(data.concurrency, 1),
      supportsVision: Boolean(data.supports_vision),
      maxInputTokens: toInt(data.max_input_tokens, 0),
      maxOutputTokens: toInt(data.max_output_tokens, 0),
      cooldownUntil: Number(data.cooldown_until ?? 0) || 0,
      health: null
    });
  }
  get realModelKey() {
    return key(this.provider, this.model);
  }
  get username() {
    return this.credentialKey[1];
  }
  withHealth(health) {
    return new _Endpoint({ ...this.toData(), health });
  }
  inCooldown(now) {
    const t = now ?? wallNow();
    if (this.health) return this.health.inCooldown(t);
    if (this.cooldownUntil <= 0) return false;
    return this.cooldownUntil > t;
  }
  toData() {
    return {
      endpointId: this.endpointId,
      provider: this.provider,
      model: this.model,
      credentialKey: this.credentialKey,
      protocol: this.protocol,
      baseUrl: this.baseUrl,
      region: this.region,
      concurrency: this.concurrency,
      supportsVision: this.supportsVision,
      maxInputTokens: this.maxInputTokens,
      maxOutputTokens: this.maxOutputTokens,
      cooldownUntil: this.cooldownUntil,
      health: this.health ? this.health.toData() : null
    };
  }
};
var ChainItem = class _ChainItem {
  endpoint;
  priority;
  blackout;
  strategy;
  /** 直连条目(m02240):commit 走抢占式 acquireDirect。 */
  direct;
  constructor(data) {
    this.endpoint = new Endpoint(data.endpoint);
    this.priority = data.priority;
    this.blackout = data.blackout;
    this.strategy = data.strategy;
    this.direct = data.direct ?? false;
  }
  static fromData(data) {
    const endpointData = data.endpoint && typeof data.endpoint === "object" ? data.endpoint : {};
    const priorityRaw = data.priority == null ? 0 : Number(data.priority);
    const priority = Number.isFinite(priorityRaw) ? Math.trunc(priorityRaw) : 0;
    const blackout = data.blackout;
    return new _ChainItem({
      endpoint: Endpoint.fromData(endpointData),
      priority,
      blackout: blackout ?? null,
      strategy: data.strategy ? String(data.strategy) : "",
      direct: data.direct === true
    });
  }
};

// ../core/src/scheduler/sticky.ts
var STICKY_NO_SWITCH_PROVIDERS = /* @__PURE__ */ new Set(["sensenova"]);
function isStickyNoSwitchProvider(provider) {
  if (typeof provider !== "string" || provider === "") return false;
  return STICKY_NO_SWITCH_PROVIDERS.has(provider.toLowerCase());
}

// ../core/src/scheduler/engine.ts
function sortReason(m) {
  if (m.reason) return m.reason;
  if (m.free) return "\u514D\u8D39\u6863(\u540D\u5355\u5E8F)";
  return m.expiresAt ? "\u79EF\u5206\u5230\u671F" : "\u79EF\u5206\u5230\u671F\u672A\u77E5(\u6392\u672B)";
}
var Scheduler = class {
  ttl;
  repo;
  lastPlan = {};
  _cache = /* @__PURE__ */ new Map();
  _quotas = {};
  _quotasAt = 0;
  _rng;
  _quotaRefresher = null;
  _refreshAt = 0;
  _refreshTriggers = 0;
  _cfgCache = null;
  _cfgAt = 0;
  _now;
  constructor(repo, opts = {}) {
    this.repo = repo;
    this.ttl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this._now = opts.now ?? (() => Date.now() / 1e3);
    this._rng = opts.seed !== void 0 ? new SeededRng(opts.seed) : MathRng;
    this._seedConfigSettings();
    this._seedRetrySettings();
    this._seedMiscSettings();
  }
  now() {
    return this._now();
  }
  // ------------------------------------------------------------- 播种
  _seedConfigSettings() {
    const anyKey = RULES_PRIORITY_KEYS.some((p) => this.repo.getSetting(rulesKeyOf(p)) !== null);
    if (anyKey) {
      if (this.repo.getSetting("scheduler.cooldown_overrides") === null) {
        this.repo.setSetting("scheduler.cooldown_overrides", JSON.stringify(CONFIG_DEFAULT_COOLDOWN_OVERRIDES));
      }
      return;
    }
    const legacyRaw = this.repo.getSetting("scheduler.rules");
    if (legacyRaw !== null && legacyRaw !== void 0 && legacyRaw.trim() !== "") {
      let parsed;
      try {
        parsed = JSON.parse(legacyRaw);
      } catch {
        parsed = null;
      }
      const cfgObj = isRecord(parsed) ? parsed : {};
      let legacyRules = [];
      if ("rules" in cfgObj) legacyRules = validRules(cfgObj.rules);
      else legacyRules = legacySectionsToRules(cfgObj);
      this._seedRulesByPriority(legacyRules);
    } else {
      let rows = {};
      try {
        rows = this.repo.settings();
      } catch {
        rows = {};
      }
      const legacy = {};
      for (const [key3, field] of [
        ["free.models", "free_models"],
        ["credit.expiry", "credit_expiry"],
        ["time.windows", "time_windows"]
      ]) {
        const raw = rows[key3];
        if (raw === null || raw === void 0) continue;
        try {
          legacy[field] = JSON.parse(String(raw));
        } catch {
        }
      }
      if (Object.keys(legacy).length > 0) {
        this._seedRulesByPriority(legacySectionsToRules(legacy));
      } else {
        this._seedRulesByPriority(CONFIG_DEFAULT_RULES);
      }
    }
    if (this.repo.getSetting("scheduler.cooldown_overrides") === null) {
      this.repo.setSetting("scheduler.cooldown_overrides", JSON.stringify(CONFIG_DEFAULT_COOLDOWN_OVERRIDES));
    }
  }
  /** 把一份扁平 rules 按 priority 分组写进 5 个档位键(元素剥掉 priority,键名即档位)。 */
  _seedRulesByPriority(rules) {
    const byPriority = /* @__PURE__ */ new Map();
    for (const r of rules) {
      const p = typeof r.priority === "number" ? r.priority : DEFAULT_PRIORITY;
      if (!byPriority.has(p)) byPriority.set(p, []);
      const { priority: _drop, ...rest } = r;
      byPriority.get(p).push(rest);
    }
    for (const p of RULES_PRIORITY_KEYS) {
      this.repo.setSetting(rulesKeyOf(p), JSON.stringify(byPriority.get(p) ?? []));
    }
  }
  _seedRetrySettings() {
    try {
      seedRetrySettings(this.repo);
    } catch {
    }
  }
  _seedMiscSettings() {
    for (const [k, v] of [
      ["ui.recent_limit", "50"],
      ["abstract.timeout_s", "25"]
    ]) {
      if (this.repo.getSetting(k) === null || this.repo.getSetting(k) === void 0) {
        try {
          this.repo.setSetting(k, v);
        } catch {
        }
      }
    }
  }
  // ------------------------------------------------------------- 配置
  _config() {
    const now = this._now();
    if (this._cfgCache !== null && now - this._cfgAt < CONFIG_TTL_SECONDS) {
      return this._cfgCache;
    }
    const cfg = this._readConfig();
    this._cfgCache = cfg;
    this._cfgAt = now;
    return cfg;
  }
  _readConfig() {
    let rules = this._readRulesFromKeys();
    if (rules === null) {
      const raw = jsonSetting(this.repo.getSetting("scheduler.rules"), CONFIG_DEFAULTS_JSON);
      const cfgObj = isRecord(raw) ? raw : JSON.parse(CONFIG_DEFAULTS_JSON);
      rules = "rules" in cfgObj ? validRules(cfgObj.rules) : legacySectionsToRules(cfgObj);
    }
    const freeModels = [];
    const creditExpiry = {};
    const timeWindows = [];
    for (const rule of rules) {
      const provider = rule.provider;
      const model = rule.model;
      const priority = rule.priority;
      if (rule.window?.times) {
        timeWindows.push({
          logical: "*",
          provider,
          model: model ?? "",
          times: rule.window.times,
          // 2026-10-24:五个档位键都允许时段规则(设置页五张卡统一显示星期/时间段框)。
          // 语义按档位分:priority 0 = 时段内**禁用**(整条从链里剔除),
          // 其余档位(1/2/3/4)= 时段内**降级**(仍在链里,排到链末)——
          // 只有「禁用档」这个名字承诺"不可用",其余档位只承诺"往后放"。
          mode: priority === 0 ? "exclude" : "degrade",
          priority: typeof priority === "number" ? priority : 0,
          weekdays: rule.window.weekdays
        });
        if (model && priority === 1) {
          freeModels.push({ provider, model, expiresAt: rule.expires_at ?? null });
        }
        if (rule.expires_at !== void 0 && !model) {
          creditExpiry[provider] = rule.expires_at;
        }
        continue;
      }
      if (model && priority === 1) {
        freeModels.push({ provider, model, expiresAt: rule.expires_at ?? null });
        continue;
      }
      if (rule.expires_at !== void 0 && !model) {
        creditExpiry[provider] = rule.expires_at;
        continue;
      }
    }
    return { rules, freeModels, creditExpiry, timeWindows };
  }
  /** 读 5 个档位键合并成扁平 rules(键名即档位,注入 priority);5 键全空 → null。 */
  _readRulesFromKeys() {
    const out = [];
    let any = false;
    for (const p of RULES_PRIORITY_KEYS) {
      const raw = this.repo.getSetting(rulesKeyOf(p));
      if (raw === null || raw === void 0 || raw.trim() === "") continue;
      any = true;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const r of validRules(parsed)) {
        out.push({ ...r, priority: p });
      }
    }
    return any ? out : null;
  }
  _freeEntries() {
    return this._config().freeModels;
  }
  _freeEntryOf(realModelId) {
    for (const e of this._freeEntries()) {
      if (realModelId === `${e.provider}/${e.model}`) return e;
    }
    return null;
  }
  _isFreeModel(realModelId, now) {
    const entry = this._freeEntryOf(realModelId);
    if (entry === null) return false;
    if (entry.expiresAt) {
      const epoch = expiryEpoch(entry.expiresAt);
      if (epoch !== null && now >= epoch) return false;
    }
    return true;
  }
  _freeRankOf(realModelId) {
    const entries = this._freeEntries();
    const i = entries.findIndex((e) => realModelId === `${e.provider}/${e.model}`);
    return i === -1 ? entries.length : i;
  }
  _isFreeTier(provider, model, now) {
    return this._isFreeModel(key(provider, model), now);
  }
  _creditExpiry() {
    return this._config().creditExpiry;
  }
  _windowRules() {
    return this._config().timeWindows;
  }
  /** 命中当前时段黑名单的规则(weekdays 过滤 + 时段右开判定)。 */
  _rulesFor(logical, provider, model, now) {
    const out = [];
    for (const rule of this._windowRules()) {
      const rl = rule.logical || "*";
      if (rl !== "*" && rl !== logical) continue;
      if (rule.provider !== provider || rule.model !== model) continue;
      const windows = [{ weekdays: rule.weekdays, times: rule.times }];
      if (isBlackout(windows, now)) out.push(rule);
    }
    return out;
  }
  _degraded(pair, logical, now) {
    return this._rulesFor(logical, pair[0], pair[1], now).some((r) => r.mode === "degrade");
  }
  _strategyOf(logicalName) {
    let raw = null;
    if (typeof this.repo.logicalModelRow === "function") {
      try {
        const row = this.repo.logicalModelRow(logicalName);
        if (row && typeof row === "object") {
          raw = row.strategy ?? null;
        }
      } catch {
      }
    }
    if (!raw) {
      try {
        raw = this.repo.getSetting(`strategy.${logicalName}`);
      } catch {
        raw = null;
      }
    }
    return normalizeStrategy2(raw);
  }
  /** 成员列表:members_of 优先(去重保首次),否则从行派生(先见序)。 */
  _members(logicalName, rows) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    if (typeof this.repo.membersOf === "function") {
      const list2 = this.repo.membersOf(logicalName);
      if (list2) {
        for (const member of list2) {
          const pair = memberPair(member);
          if (pair) {
            const k = key(pair[0], pair[1]);
            if (!seen.has(k)) {
              seen.add(k);
              out.push(pair);
            }
          }
        }
      }
    }
    if (out.length > 0) return out;
    const list = rows ?? this.repo.endpointChain(logicalName);
    if (list) {
      for (const row of list) {
        const pair = rowMember(row);
        if (pair) {
          const k = key(pair[0], pair[1]);
          if (!seen.has(k)) {
            seen.add(k);
            out.push(pair);
          }
        }
      }
    }
    return out;
  }
  // ------------------------------------------------------------- 额度
  _quotaMap(now, force) {
    const fresh = !force && now - this._quotasAt < this.ttl;
    if (fresh && Object.keys(this._quotas).length > 0) return this._quotas;
    const quotas = this.repo.quotas() ?? {};
    this._quotas = { ...quotas };
    this._quotasAt = now;
    return this._quotas;
  }
  _quotaAgeOf(providers, quotas, now) {
    const wanted = new Set(providers);
    let newest = null;
    for (const [qkey, snap] of Object.entries(quotas ?? {})) {
      const head = qkey.split("/")[0];
      if (!wanted.has(head)) continue;
      if (!snap || typeof snap !== "object") continue;
      const at = snap.fetched_at;
      if (typeof at === "number" && at > 0) newest = newest === null ? at : Math.max(newest, at);
    }
    if (newest === null) return null;
    return Math.max(0, now - newest);
  }
  _quotaRefreshProvidersOf(members) {
    const wanted = /* @__PURE__ */ new Set();
    for (const [p] of members) {
      if (QUOTA_REFRESH_PROVIDERS.includes(p)) wanted.add(p);
    }
    return [...wanted].sort();
  }
  /** fire-and-forget:额度太旧且距上次刷新超过 TTL → 触发一次(回调抛异常不升级)。 */
  _maybeRefreshQuotas(members, quotas, now) {
    if (this._quotaRefresher === null) return [];
    const wanted = this._quotaRefreshProvidersOf(members);
    if (wanted.length === 0) return [];
    const age = this._quotaAgeOf(wanted, quotas, now);
    if (age === null) return [];
    if (age < this.ttl || now - this._refreshAt < this.ttl) return [];
    this._refreshAt = now;
    this._refreshTriggers += 1;
    try {
      this._quotaRefresher(wanted);
    } catch {
      return [];
    }
    return wanted;
  }
  setQuotaRefresher(fn) {
    this._quotaRefresher = fn;
    return this;
  }
  /**
   * 该逻辑模型是否值得预取配额:仅 due-first、有 trae/workbuddy 成员、
   * 且快照够旧。⚠️ 不看 _refreshAt(请求路径每份过期快照最多等一次)。
   */
  pendingQuotaRefresh(logicalName, now) {
    const t = now ?? this._now();
    if (this._strategyOf(logicalName) !== "due-first") return [];
    const wanted = this._quotaRefreshProvidersOf(this._members(logicalName));
    if (wanted.length === 0) return [];
    const age = this._quotaAgeOf(wanted, this._quotaMap(t, false), t);
    if (age === null || age < this.ttl) return [];
    return wanted;
  }
  /** 清空记忆化/额度/配置缓存。⚠️ 不清 _refreshAt(否则会每请求触发刷新)。 */
  invalidate() {
    this._cache.clear();
    this._quotas = {};
    this._quotasAt = 0;
    this._cfgCache = null;
    this._cfgAt = 0;
  }
  // ------------------------------------------------------------- 排序
  _expiryOf(row, quotas, pair) {
    const p = pair ?? rowMember(row) ?? ["", ""];
    const qkey = quotaKey(row, p);
    if (qkey) {
      const snapshot = quotas[qkey];
      if (snapshot && typeof snapshot === "object") {
        const exp = snapshot.expires_at;
        if (typeof exp === "number" && exp > 0) return exp;
      }
    }
    if (p[0] !== "") {
      const rollup = quotas[p[0]];
      if (rollup && typeof rollup === "object") {
        const exp = rollup.expires_at;
        if (typeof exp === "number" && exp > 0) return exp;
      }
    }
    const staticExp = this._creditExpiry()[p[0]];
    if (staticExp) {
      const epoch = expiryEpoch(staticExp);
      if (epoch !== null) return epoch;
    }
    return null;
  }
  /** 每个真实模型取各凭据里**最早**的到期。 */
  _expiryMap(rows, quotas) {
    const out = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const pair = rowMember(row);
      if (!pair) continue;
      const exp = this._expiryOf(row, quotas, pair);
      if (exp === null) continue;
      const mid = key(pair[0], pair[1]);
      const cur = out.get(mid);
      if (cur === void 0 || exp < cur) out.set(mid, exp);
    }
    return out;
  }
  /**
   * 五策略档序:
   *  - ordered-fallback:数组顺序即档链;
   *  - random:每次随机打散(不缓存);
   *  - least-busy / balanced:调度器只出配置序 + 策略标签(真实选择在 Planner);
   *  - due-first:T1 免费(名单序)→ T2 赠送 → T3 消耗(到期升序,未知排末)→ T4 降级。
   */
  _order(strategy, logicalName, members, expiry, now) {
    const n = members.length;
    const midOf = (i) => key(members[i][0], members[i][1]);
    const configOrder = (reason) => {
      const idx = Array.from({ length: n }, (_, i) => i);
      const reasons2 = /* @__PURE__ */ new Map();
      for (let i = 0; i < n; i++) reasons2.set(midOf(i), reason);
      return { order: idx, reasons: reasons2 };
    };
    if (strategy === "ordered-fallback") return configOrder("\u6570\u7EC4\u987A\u5E8F(\u6309\u5E8F\u964D\u7EA7\u94FE)");
    if (strategy === "random") {
      const idx = Array.from({ length: n }, (_, i) => i);
      this._rng.shuffle(idx);
      const reasons2 = /* @__PURE__ */ new Map();
      for (let i = 0; i < n; i++) reasons2.set(midOf(i), "\u968F\u673A\u6253\u6563");
      return { order: idx, reasons: reasons2 };
    }
    if (strategy === "least-busy") {
      return configOrder("\u6700\u5C11\u5728\u9014:\u7531\u9009\u8DEF\u5668\u6309\u5B9E\u65F6\u5728\u9014\u6570\u88C1\u51B3");
    }
    if (strategy === "balanced") {
      return configOrder("\u5E73\u5747\u4F7F\u7528:\u7531\u9009\u8DEF\u5668\u6309\u5269\u4F59\u7A7A\u4F4D\u52A0\u6743\u968F\u673A");
    }
    const keys = [];
    for (let i = 0; i < n; i++) {
      const mid = midOf(i);
      if (this._degraded(members[i], logicalName, now)) keys.push([DEGRADED_TIER, 0, Infinity]);
      else if (this._isFreeTier(members[i][0], members[i][1], now))
        keys.push([FREE_TIER, this._freeRankOf(mid), 0]);
      else if (isGrantTier(members[i][0], members[i][1]))
        keys.push([GRANT_TIER, 0, expiry.get(mid) ?? Infinity]);
      else keys.push([CONSUME_TIER, 0, expiry.get(mid) ?? Infinity]);
    }
    const order = stableBy(keys);
    const reasons = /* @__PURE__ */ new Map();
    for (const src of order) {
      const mid = midOf(src);
      if (this._degraded(members[src], logicalName, now)) {
        reasons.set(mid, "\u9AD8\u5CF0\u671F\u7981\u7528:\u547D\u4E2D\u65F6\u6BB5,\u964D\u81F3\u6700\u672B");
        continue;
      }
      if (this._isFreeTier(members[src][0], members[src][1], now)) {
        reasons.set(mid, `T1 \u514D\u8D39\u6863(\u540D\u5355\u7B2C ${this._freeRankOf(mid) + 1} \u4F4D)`);
        continue;
      }
      const tier = isGrantTier(members[src][0], members[src][1]) ? GRANT_TIER : CONSUME_TIER;
      const exp = expiry.get(mid);
      if (exp !== void 0 && exp !== null && Number.isFinite(exp)) {
        reasons.set(mid, `${TIER_NAMES[tier]} \u5230\u671F ${formatLocal(exp)}`);
      } else {
        reasons.set(mid, `${TIER_NAMES[tier]} \u5230\u671F\u672A\u77E5(\u6392\u672C\u5C42\u672B)`);
      }
    }
    return { order, reasons };
  }
  /** 排序视角的档链(命中剔除规则的成员仍在此列;剔除只发生在 chain)。 */
  planMembers(logicalName, opts) {
    return this._plan(logicalName, null, opts?.now ?? this._now(), opts?.force ?? false);
  }
  _plan(logicalName, rows, now, force) {
    const strategy = this._strategyOf(logicalName);
    const cacheable = CACHEABLE_STRATEGIES.has(strategy);
    const minute = fmtMinute(now);
    if (cacheable && !force) {
      const hit = this._cache.get(logicalName);
      const quotaFresh = this._quotasAt > 0 && now - this._quotasAt < this.ttl;
      if (hit && hit.minute === minute && hit.strategy === strategy && quotaFresh && hit.quotasAt === this._quotasAt) {
        return hit.members;
      }
    }
    const rowList = rows ?? this.repo.endpointChain(logicalName) ?? [];
    const members = this._members(logicalName, rowList);
    const quotas = this._quotaMap(now, force);
    const refreshed = this._maybeRefreshQuotas(members, quotas, now);
    const expiry = this._expiryMap(rowList, quotas);
    const { order, reasons } = this._order(strategy, logicalName, members, expiry, now);
    const result = order.map((src, pos) => {
      const mid = key(members[src][0], members[src][1]);
      return {
        realModelId: mid,
        provider: members[src][0],
        model: members[src][1],
        priority: pos,
        free: this._isFreeTier(members[src][0], members[src][1], now),
        expiresAt: expiry.get(mid) ?? null,
        reason: reasons.get(mid) ?? "",
        strategy
      };
    });
    if (cacheable) {
      this._cache.set(logicalName, {
        minute,
        strategy,
        members: result,
        quotasAt: this._quotasAt
      });
    }
    this.lastPlan = {
      logical_model: logicalName,
      at: minute,
      strategy,
      cached: cacheable,
      quota_age_s: this._quotasAt > 0 ? round1(now - this._quotasAt) : null,
      quota_refreshed: [...refreshed],
      order: result.map((m) => ({
        real_model: m.realModelId,
        priority: m.priority,
        free: m.free,
        reason: sortReason(m)
      }))
    };
    return result;
  }
  /** 端点链:已按档序排序、已剔除时段禁用项;直接模型走凭据序。 */
  chain(logicalName, opts) {
    const now = opts?.now ?? this._now();
    const rows = this.repo.endpointChain(logicalName) ?? [];
    const members = this._members(logicalName, rows);
    if (members.length === 0) {
      const direct = this.repo.directChain(logicalName) ?? [];
      return direct.map((row) => ChainItem.fromData({ endpoint: row, direct: true }));
    }
    const plan = this._plan(logicalName, rows, now, opts?.force ?? false);
    const order = new Map(plan.map((m) => [m.realModelId, m.priority]));
    const strategy = this._strategyOf(logicalName);
    const items = [];
    for (const row of rows) {
      const pair = rowMember(row);
      if (!pair) continue;
      const mid = key(pair[0], pair[1]);
      if (!order.has(mid)) continue;
      const rules = this._rulesFor(logicalName, pair[0], pair[1], now);
      if (rules.some((r) => r.mode === "exclude")) continue;
      const windows = rules.map((r) => ({
        weekdays: r.weekdays,
        times: r.times
      }));
      items.push(
        ChainItem.fromData({
          ...row,
          priority: order.get(mid) ?? 0,
          blackout: windows,
          strategy
        })
      );
    }
    items.sort((a, b) => a.priority - b.priority);
    return items;
  }
  snapshot() {
    const freeEntries = this._freeEntries();
    const prefixes = freeEntries.map((e) => `${e.provider}/${e.model}`);
    return {
      ttl_seconds: this.ttl,
      quota_loaded: this._quotasAt > 0,
      quota_age_s: this._quotasAt > 0 ? round1(this._now() - this._quotasAt) : null,
      strategies: [...STRATEGIES],
      default_strategy: DEFAULT_STRATEGY,
      free_prefixes: prefixes,
      free_order: prefixes,
      credit_expiry: { ...this._creditExpiry() },
      windows: [...this._windowRules()],
      load_aware_strategies: [...LOAD_AWARE_STRATEGIES],
      quota_refresh: {
        providers: [...QUOTA_REFRESH_PROVIDERS],
        wired: this._quotaRefresher !== null,
        min_interval_s: this.ttl,
        last_at: this._refreshAt > 0 ? this._refreshAt : null,
        triggers: this._refreshTriggers
      },
      last_plan: { ...this.lastPlan }
    };
  }
  logicalHint(members) {
    const parts = members.map(([p, m]) => key(p, m));
    return parts.length > 0 ? parts.join(",") : "(\u7A7A\u6863\u94FE)";
  }
};

// ../core/src/db/registry-projection.ts
function toProtocol(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return PROVIDER_PROTOCOLS.includes(text) ? text : "openai";
}
function realModelKey(provider, model) {
  return `${provider}/${model}`;
}
function parseMembersColumn(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of parsed) {
    let provider = "";
    let model = "";
    if (typeof item === "string") {
      const slash = item.indexOf("/");
      if (slash <= 0 || slash === item.length - 1) continue;
      provider = item.slice(0, slash).trim();
      model = item.slice(slash + 1).trim();
    } else if (item && typeof item === "object") {
      const rec = item;
      provider = typeof rec.provider === "string" ? rec.provider.trim() : "";
      model = typeof rec.model === "string" ? rec.model.trim() : "";
    }
    if (!provider || !model) continue;
    const key3 = realModelKey(provider, model);
    if (seen.has(key3)) continue;
    seen.add(key3);
    out.push({ provider, model });
  }
  return out;
}
function parseSchedulerRulesFromDb(db) {
  const out = [];
  let any = false;
  for (const p of RULES_PRIORITY_KEYS) {
    const row = db.setting.get(rulesKeyOf(p));
    if (row === null || row === void 0 || !row.v) continue;
    any = true;
    let parsed;
    try {
      parsed = JSON.parse(row.v);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const r of validRules(parsed)) {
      out.push({ ...r, priority: p });
    }
  }
  if (any) return out;
  const legacyRow = db.setting.get("scheduler.rules");
  return parseSchedulerRulesColumn(legacyRow?.v ?? null);
}
function parseSchedulerRulesColumn(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const container = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray(parsed.rules) ? parsed.rules : [];
  return validRules(container);
}
function toRealModel(row) {
  return {
    provider: row.provider,
    model: row.model,
    name: row.name ?? null,
    supportsVision: Number(row.supports_vision) !== 0,
    maxInputTokens: row.max_input_tokens ?? null,
    maxOutputTokens: row.max_output_tokens ?? null,
    hidden: Number(row.hidden) !== 0,
    concurrency: row.concurrency ?? null
  };
}
function toLogicalModel(row) {
  const strategy = row.strategy === "random" ? "random" : "due-first";
  return {
    name: row.name,
    strategy,
    members: parseMembersColumn(row.members)
  };
}
function snapshotFromDb(db) {
  const providers = /* @__PURE__ */ new Map();
  for (const row of db.provider.list()) {
    providers.set(row.id, {
      id: row.id,
      baseUrl: row.base_url ?? null,
      protocol: toProtocol(row.protocol),
      envPrefix: row.env_prefix ?? null
    });
  }
  const realModels = /* @__PURE__ */ new Map();
  for (const row of db.realModel.list()) {
    realModels.set(realModelKey(row.provider, row.model), toRealModel(row));
  }
  const logicalModels = /* @__PURE__ */ new Map();
  for (const row of db.logicalModel.list()) {
    logicalModels.set(row.name, toLogicalModel(row));
  }
  const accounts = /* @__PURE__ */ new Map();
  for (const row of db.credential.list()) {
    const credentialRef = `${row.provider}/${row.username}`;
    accounts.set(credentialRef, {
      credentialRef,
      enabled: true,
      cooldownOverrideMinutes: null,
      sessionPinTtlSeconds: null
    });
  }
  const schedulerRules = parseSchedulerRulesFromDb(db);
  return {
    snapshot: { providers, realModels, accounts, logicalModels, schedulerRules },
    issues: []
  };
}

// ../core/src/router/clock.ts
var systemClock = {
  monoNow: () => performance.now() / 1e3,
  wallNow: () => Date.now() / 1e3
};

// ../core/src/router/types.ts
var UpstreamErrorKind = {
  /** 429 / 账号额度耗尽 —— 换下一台 */
  RateLimit: "rate_limit",
  /** 401 / 403 —— 账号失效,冷却并登记强制刷新 */
  Auth: "auth",
  /** 验证码等「不该重试」的 502 */
  AuthChallenge: "auth_challenge",
  /** 5xx —— 计入冷却,可重试 */
  Upstream: "upstream",
  /** 其余 4xx —— 请求本身有问题,原样返回不重试 */
  BadRequest: "bad_request",
  /** 超时 */
  Timeout: "timeout",
  /** 连不上 */
  Connection: "connection",
  /** 流已开始,无法再换号(响应已发出) */
  AlreadyStreaming: "already_streaming"
};
var TRANSIENT_KINDS2 = /* @__PURE__ */ new Set([
  UpstreamErrorKind.Timeout,
  UpstreamErrorKind.Connection
]);
function withEndpointViews(seed) {
  const endpoint = seed;
  const descriptors = {
    realModelKey: {
      enumerable: false,
      configurable: false,
      get() {
        return realModelKeyOf(this.provider, this.model);
      }
    },
    username: {
      enumerable: false,
      configurable: false,
      get() {
        return this.credentialKey[1] ?? "";
      }
    },
    inCooldown: {
      enumerable: false,
      configurable: false,
      value(now) {
        const rec = this.health;
        if (rec !== null && rec !== void 0) {
          return healthInCooldown(rec, now);
        }
        return this.cooldownUntil > 0 && this.cooldownUntil > now;
      }
    }
  };
  return Object.defineProperties(endpoint, descriptors);
}
function emptyHealth() {
  return {
    fails: 0,
    cooldownUntil: 0,
    lastError: "",
    updatedAt: 0,
    lastKind: "",
    lastStatus: 0
  };
}
function noteFailure(health, opts = {}) {
  const now = opts.now ?? 0;
  const until = opts.hint?.until ?? null;
  const kind = opts.kind ?? "";
  const error = (opts.error ?? "").slice(0, 200);
  const status = Number.isFinite(opts.status ?? 0) ? Math.trunc(opts.status ?? 0) : 0;
  const next = {
    ...health,
    fails: health.fails + 1,
    lastError: error,
    lastKind: kind,
    lastStatus: status,
    updatedAt: now
  };
  if (until !== null && Number.isFinite(until)) {
    next.cooldownUntil = Number(until);
    return next;
  }
  if (TRANSIENT_KINDS2.has(kind)) {
    return next;
  }
  const floor = opts.hint?.policy ? Number(opts.hint.policy.cooldownFloorS) : 0;
  next.cooldownUntil = now + (Number.isFinite(floor) ? floor : 0);
  return next;
}
function noteSuccess(health, now) {
  return {
    ...health,
    fails: 0,
    cooldownUntil: 0,
    lastError: "",
    lastKind: "",
    lastStatus: 0,
    updatedAt: now
  };
}
function inCooldown(health, now) {
  if (health.cooldownUntil <= 0) {
    return false;
  }
  return health.cooldownUntil > now;
}
var healthInCooldown = inCooldown;
function planResult(item, reason, byAffinity = false) {
  return { item, reason, byAffinity };
}
var PREEMPT_ERROR2 = "preempted by direct request";
var DEFAULT_LEASE_SECONDS2 = 600;
var DEFAULT_RETAIN_SECONDS = 180;
var DEFAULT_MAX_RECENT2 = 200;
var DEFAULT_PIN_SECONDS2 = 900;
var DEFAULT_RECENT_LIMIT = 50;
var DEFAULT_LOGICAL_COOLDOWN_MIN = 15;
var PY_FLOAT_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
var PY_INT_RE = /^[+-]?\d+$/;
function coerceRetryNumber(raw, fallback) {
  const text = raw === null || raw === void 0 ? "" : String(raw).trim();
  if (text === "" || !PY_FLOAT_RE.test(text)) {
    return fallback;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.trunc(value);
}
function parseStrictInt(raw, fallback, min = 1) {
  const text = raw === null || raw === void 0 ? "" : String(raw).trim();
  if (text === "" || !PY_INT_RE.test(text)) {
    return fallback;
  }
  const value = Number(text);
  return Number.isFinite(value) && value >= min ? value : fallback;
}
var CONV_ORDER_LIMIT2 = 2048;
var LOAD_AWARE_STRATEGIES2 = /* @__PURE__ */ new Set([
  "least-busy",
  "balanced"
]);
function realModelKeyOf(provider, model) {
  return `${provider}/${model}`;
}
function endpointIdOf2(provider, model, username) {
  return `${provider}/${model}@${provider}/${username}`;
}
function credentialKeyOf2(data, provider) {
  const cred = data.credentialKey;
  if (Array.isArray(cred) && cred.length >= 2) {
    return [String(cred[0] || provider), String(cred[1])];
  }
  if (typeof cred === "string" && cred !== "") {
    const at = cred.indexOf("/");
    if (at >= 0) {
      const head = cred.slice(0, at);
      return [head || provider, cred.slice(at + 1)];
    }
    return [provider, cred];
  }
  const username = data.username ?? data.accountId ?? "";
  return [provider, String(username)];
}
function endpointFrom(data) {
  const provider = String(data.provider ?? data.providerId ?? "");
  const model = String(data.model ?? data.upstreamId ?? "");
  const credentialKey2 = credentialKeyOf2(data, provider);
  const endpointId = data.endpointId && String(data.endpointId) !== "" ? String(data.endpointId) : endpointIdOf2(provider, model, credentialKey2[1]);
  const concurrencyRaw = data.concurrency ?? 1;
  return withEndpointViews({
    endpointId,
    provider,
    model,
    credentialKey: credentialKey2,
    protocol: data.protocol ?? "openai",
    baseUrl: data.baseUrl ?? null,
    region: data.region ?? null,
    concurrency: typeof concurrencyRaw === "number" && Number.isFinite(concurrencyRaw) ? Math.max(1, Math.trunc(concurrencyRaw)) : Number.parseInt(String(concurrencyRaw), 10) > 0 ? Number.parseInt(String(concurrencyRaw), 10) : 1,
    supportsVision: Boolean(data.supportsVision),
    maxInputTokens: data.maxInputTokens ?? null,
    maxOutputTokens: data.maxOutputTokens ?? null,
    cooldownUntil: Number(data.cooldownUntil) || 0,
    health: null
  });
}
function chainItemFrom(data) {
  return {
    endpoint: endpointFrom(data.endpoint),
    priority: Number(data.priority) || 0,
    blackout: data.blackout ?? null,
    strategy: data.strategy ?? "",
    // ⚠️ direct 必须透传:丢了它,直连请求就走不上 m02240 的抢占语义
    // (plan 的 ignoreCooldown / commit 的 acquireDirect 都靠它判定)。
    direct: data.direct === true
  };
}
var SETTING_COOLDOWN_OVERRIDES = "scheduler.cooldown_overrides";
var SETTING_LOGICAL_COOLDOWN = "retry.logical_cooldown";
var SETTING_RECENT_LIMIT = "ui.recent_limit";

// ../core/src/router/health.ts
var HealthRegistry2 = class {
  items = /* @__PURE__ */ new Map();
  wallNow;
  constructor(opts = {}) {
    this.wallNow = opts.wallNow ?? (() => Date.now() / 1e3);
  }
  /**
   * 取(或建)**不落表**的记录 —— 只读查询不该让表无限增长。
   *
   * 返回的是**表内那条**(调用方若改了它,表就跟着变);表里没有则返回一个
   * 全新的空记录(表不变)。与 Python 版一致:调用方要落库得显式调 `put` / `note`。
   */
  get(endpointId) {
    const rec = this.items.get(endpointId);
    return rec === void 0 ? emptyHealth() : rec;
  }
  /** 表里是否**真的**有这条记录(`get` 会凭空造一条,这个方法不会)。 */
  known(endpointId) {
    return this.items.has(endpointId);
  }
  /** 显式写入一条记录(表内替换 / 新增)。 */
  put(endpointId, rec) {
    this.items.set(endpointId, rec);
  }
  /** 记一次成败(成功清零并解冻;失败 +1 并进入冷却)。 */
  note(endpointId, opts) {
    const now = opts.now ?? this.wallNow();
    const base = this.items.get(endpointId) ?? emptyHealth();
    const rec = opts.ok ? noteSuccess(base, now) : noteFailure(base, {
      error: opts.error,
      kind: opts.kind,
      status: opts.status,
      now,
      hint: { until: opts.until ?? null, policy: opts.policy ?? null }
    });
    this.items.set(endpointId, rec);
    return rec;
  }
  /** 强制解冻(凭据刷新成功后由维护循环调用)—— 直接删记录,回到「没有记录 = 可用」。 */
  clear(endpointId) {
    this.items.delete(endpointId);
  }
  /**
   * **批量解冻**:删掉所有满足 `pred` 的记录,返回删掉的条数。
   *
   * 用于「某个账号的凭据换新了 —— 它在**所有**真实模型上的冷却都该解除」
   * ({@link Router.thawAccount}):一把失效的 key 会在多个模型端点上各落
   * 一次冷却,只清当前这一台的话,换档到同账号的别的模型还是被挡着。
   *
   * ⚠️ 与 `clear` 同语义:**删记录 = 回到未知/可用**,不是「记一次成功」。
   * 换新凭据后若仍不灵,下一轮请求会重新落冷却 —— 不掩盖真实故障。
   */
  clearWhere(pred) {
    let n = 0;
    for (const key3 of [...this.items.keys()]) {
      let hit = false;
      try {
        hit = pred(key3);
      } catch {
        hit = false;
      }
      if (!hit) continue;
      this.items.delete(key3);
      n += 1;
    }
    return n;
  }
  /** 当前处于冷却中的记录(按 `endpointId` 排序,与面板契约形状一致)。 */
  cooled(now = this.wallNow()) {
    return [...this.items.entries()].filter(([, rec]) => inCooldown(rec, now)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, rec]) => rec);
  }
  /** 健康账本快照(排障 / 面板用)。 */
  snapshot(now = this.wallNow()) {
    const items = {};
    let cooling = 0;
    for (const key3 of [...this.items.keys()].sort()) {
      const rec = this.items.get(key3);
      if (rec === void 0) {
        continue;
      }
      items[key3] = rec;
      if (inCooldown(rec, now)) {
        cooling += 1;
      }
    }
    return { tracked: this.items.size, cooling, items };
  }
  /**
   * 丢掉「早就冷却完了又一直没被选中」的记录,避免表无限增长。
   * @returns 丢掉的条数
   */
  purgeExpired(now = this.wallNow()) {
    const stale = [...this.items.entries()].filter(([, rec]) => rec.fails > 0 && !inCooldown(rec, now)).map(([key3]) => key3);
    for (const key3 of stale) {
      this.items.delete(key3);
    }
    return stale.length;
  }
};

// ../core/src/router/inflight-ledger.ts
var LEASE_EXPIRED_ERROR = "lease expired (no outcome reported)";
function archivedRow(lease, finishedAt) {
  return {
    lease,
    finishedAt,
    ok: false,
    status: 0,
    error: LEASE_EXPIRED_ERROR,
    latencyMs: 0,
    ttftMs: null,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0
  };
}
var InflightLedger2 = class {
  leaseSeconds;
  /** ⚠️ 已退役:保留期不再有行为,留着只为不破坏既有构造点。 */
  retainSeconds;
  maxRecent;
  maxRecentFn;
  clock;
  /**
   * 上次问到的容量。**只是「保留区还没到那个数就不可能超容」的短路**,
   * 不是权威值(权威值每次都问 {@link recentCapacity})。初值 0 保证第一次收尾
   * 一定真问一次 —— 否则配置比 `maxRecent` 小时会被这个短路挡住。
   */
  recentHint = 0;
  /** `realModelId -> Map<leaseId, lease>`(计数按真实模型聚合,D12) */
  leases = /* @__PURE__ */ new Map();
  /** `leaseId -> realModelId`,让 `release` / `touch` O(1) 定位 */
  index = /* @__PURE__ */ new Map();
  /**
   * `leaseId -> 抢占通知回调`(m02240)。
   *
   * ⚠️ **不进 `InflightLease` 对象**:那个对象会经 `detail()` 交给面板序列化
   * (JSON 丢函数、IPC 上更糟)。回调只在**进程内**有意义,所以单独一张表。
   *
   * 表项在租约释放时同步删掉 —— 回调表必须和租约**同生共死**,否则一次
   * 抢占之后,那个回调会被后来的同号租约误触发(句柄复用 → 打断别人的请求)。
   */
  preemptHooks = /* @__PURE__ */ new Map();
  /** 对外展示用的运行序号(单调递增) */
  seq = 0;
  /** `sessionId -> 会话序号`(面板 `#对话#请求` 的左半段) */
  convOrder = /* @__PURE__ */ new Map();
  /** 会话序号分配游标。**只增不减**,所以淘汰不会让两个可见会话撞号。 */
  convSeq = 0;
  /** 保留区:已结束的请求(按结束时刻从旧到新)。只按**当前容量**清,没有时间窗。 */
  recent = [];
  constructor(opts = {}) {
    this.leaseSeconds = Number(opts.leaseSeconds ?? DEFAULT_LEASE_SECONDS2);
    this.retainSeconds = Number(opts.retainSeconds ?? DEFAULT_RETAIN_SECONDS);
    this.maxRecent = Math.max(1, Math.trunc(Number(opts.maxRecent ?? DEFAULT_MAX_RECENT2)));
    this.maxRecentFn = opts.maxRecentFn ?? null;
    this.clock = opts.clock ?? systemClock;
  }
  /** 在途租约租期(秒)。 */
  get leaseSecondsValue() {
    return this.leaseSeconds;
  }
  /** 已退役:保留期不再有行为,留着只为不破坏既有调用点。 */
  get retainSecondsValue() {
    return this.retainSeconds;
  }
  // ------------------------------------------------------------- 容量核算
  /**
   * 该**真实模型**当前有几条在途租约(所有凭据合计)。
   *
   * ⚠️ 与 Python 版一致:先清理过期租约再数 —— 一次只读查询不该让账本停在旧值上。
   */
  inFlight(realModelId, now = this.clock.monoNow()) {
    this.purge(now);
    return this.leases.get(realModelId)?.size ?? 0;
  }
  /** 该真实模型是否还有空位(`concurrency` 会被夹到 ≥1)。 */
  hasRoom(realModelId, concurrency, now = this.clock.monoNow()) {
    return this.inFlight(realModelId, now) < Math.max(1, Math.trunc(concurrency));
  }
  /**
   * 该真实模型上是否还有**可被抢占的逻辑租约**(m02240)。
   *
   * 直连请求专用:桶满了的时候,只有「还剩一条逻辑租约」才谈得上抢占 ——
   * 全是直连在途的话,`acquireDirect` 会返回 `null`(没有可让的对象),
   * 调用方按「无可用」处理。
   *
   * ⚠️ 只数**非直连**租约:直连之间不互抢(直连是「用户点名要这个真实模型」,
   * 抢另一个直连的槽位等于让两个点名请求互相打架,谁都不该赢)。
   */
  hasPreemptable(realModelId, now = this.clock.monoNow()) {
    this.purge(now);
    const bucket = this.leases.get(realModelId);
    if (bucket === void 0) {
      return false;
    }
    for (const lease of bucket.values()) {
      if (lease.direct !== true) {
        return true;
      }
    }
    return false;
  }
  // ------------------------------------------------------------- 租约生命周期
  /**
   * 占一条租约,返回句柄。**释放必须用这个句柄**({@link release})。
   *
   * @param realModelId 账本键(`"provider/model"`,D12)
   * @param endpointId 端点身份(仅用于展示 / 分组)
   * @param logicalModel 客户端要的那个名字(可能是逻辑模型,也可能是直连真实模型)
   * @param sessionId 只用于内部分组,**绝不出现在对外响应里**
   */
  acquire(realModelId, opts = {}) {
    const now = opts.now ?? this.clock.monoNow();
    this.purge(now);
    this.seq += 1;
    const leaseId = `${this.seq}`;
    const lease = {
      leaseId,
      seq: this.seq,
      realModelId,
      endpointId: opts.endpointId ?? "",
      logicalModel: opts.logicalModel ?? "",
      sessionId: opts.sessionId ?? "",
      stream: opts.stream ?? false,
      direct: opts.direct === true,
      startedAt: now,
      expiresAt: now + this.leaseSeconds,
      convNo: this.convNo(opts.sessionId ?? "")
    };
    let bucket = this.leases.get(realModelId);
    if (bucket === void 0) {
      bucket = /* @__PURE__ */ new Map();
      this.leases.set(realModelId, bucket);
    }
    bucket.set(leaseId, lease);
    this.index.set(leaseId, realModelId);
    if (opts.onPreempt !== void 0) {
      this.preemptHooks.set(leaseId, opts.onPreempt);
    }
    return leaseId;
  }
  /**
   * **抢占式**获取(m02240):并发槽已满时,踢掉该真实模型上**最新入队**的
   * 非直连(逻辑)租约,把容量让给直连请求。
   *
   * 语义(用户 2026 定案):
   * - 直连(真实模型直连)请求的优先级**高于**任何逻辑模型成员;
   * - 槽未满 → 普通 acquire(`direct: true`);
   * - 槽已满 → 找该桶里 `direct !== true` 且**最晚入队**的那条踢掉
   *   (最不影响其余逻辑请求的 FCFS 次序;最先到达者保留);
   * - 桶里全是直连在途 → 没有可让的对象,返回 `null`(调用方按「无可用」处理)。
   *
   * 被踢掉的逻辑租约会记一条失败({@link PREEMPT_ERROR}),并发槽即刻释放 ——
   * 账本记账不泄漏,调用方按既有重试策略重试。
   *
   * ⚠️ **受害方会被同步通知**(m02240):只释放账本槽位是不够的 ——
   * 受害方的 HTTP 请求还在真实上游占着连接,直连请求拿到的只是「账面上的
   * 空位」,上游照样限流。所以这里先调受害方的 `onPreempt` 回调(让它
   * 打断自己的上游调用、立刻退出),再释放槽位。
   *
   * ⚠️ **回调抛异常不影响抢占**:通知失败只意味着这次打断没生效,抢占本身
   * 照常进行(否则一次回调异常会让直连请求也失败 —— 那更糟)。
   */
  acquireDirect(realModelId, concurrency, opts = {}) {
    const now = opts.now ?? this.clock.monoNow();
    this.purge(now);
    const cap = Math.max(1, Math.trunc(concurrency));
    const bucket = this.leases.get(realModelId);
    if (bucket === void 0 || bucket.size < cap) {
      return this.acquire(realModelId, { ...opts, direct: true, now });
    }
    let victim = null;
    if (bucket !== void 0) {
      const ids = [...bucket.keys()].reverse();
      for (const id of ids) {
        const lease = bucket.get(id);
        if (lease === void 0) continue;
        if (lease.direct === true) continue;
        victim = lease;
        break;
      }
    }
    if (victim === null) {
      return null;
    }
    this.notifyPreempted(victim.leaseId);
    this.release(victim.leaseId, {
      now,
      outcome: {
        ok: false,
        status: 0,
        error: PREEMPT_ERROR2,
        latencyMs: 0,
        ttftMs: null,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0
      }
    });
    return this.acquire(realModelId, { ...opts, direct: true, now });
  }
  /**
   * 通知「这条租约被挤掉了」(m02240)—— 回调表命中才通知。
   *
   * ⚠️ **吞掉回调异常**:通知失败只意味着这次打断没生效(受害方的上游调用
   * 还在跑),抢占本身必须照常完成 —— 否则受害方一个回调 bug 就能让直连
   * 请求也一起失败。
   */
  notifyPreempted(leaseId) {
    const hook = this.preemptHooks.get(leaseId);
    if (hook === void 0) {
      return;
    }
    try {
      hook(PREEMPT_ERROR2);
    } catch {
    }
  }
  /**
   * 会话 → 会话序号(面板 `#对话#请求` 的左半段)。
   *
   * - 同一 `sessionId` 永远拿到同一个号 —— 这是「这几条是同一个会话」可读的唯一依据;
   * - 号从 1 起**按首次出现顺序递增**;游标单调不减,所以淘汰后新号不会重复用旧号;
   * - 空 `sessionId`(无法派生的请求)→ `0` = **不编号**(否则所有无 id 请求会共用
   *   一个伪会话号,`#对话` 那一列就永远显示同一个数);
   * - 淘汰:表超过 {@link CONV_ORDER_LIMIT} 条时丢掉**最旧**的一条(`Map` 保插入序)。
   *
   * ⚠️ **重启清零**是预期语义(与 v4「会话 pin 只在内存」同一口径,D18):
   * 这是运行期序号,不是持久身份。
   */
  convNo(sessionId) {
    if (!sessionId) {
      return 0;
    }
    const known = this.convOrder.get(sessionId);
    if (known !== void 0) {
      return known;
    }
    while (this.convOrder.size >= CONV_ORDER_LIMIT2) {
      const oldest = this.convOrder.keys().next();
      if (oldest.done) {
        break;
      }
      this.convOrder.delete(oldest.value);
    }
    this.convSeq += 1;
    this.convOrder.set(sessionId, this.convSeq);
    return this.convSeq;
  }
  /**
   * 续期一条租约(流式每收到一个 chunk 调一次)。不存在返回 `false`。
   *
   * ⚠️ 这是「面板上的在途列表可信」的前提:没有它,跑满租期的长请求会在还活着的
   * 时候消失,用户会以为网关丢了请求 —— 同时账本误以为腾出了空位,并发上限被悄悄放大。
   */
  touch(leaseId, now = this.clock.monoNow()) {
    if (!leaseId) {
      return false;
    }
    const key3 = this.index.get(leaseId);
    if (key3 === void 0) {
      return false;
    }
    const bucket = this.leases.get(key3);
    if (bucket === void 0) {
      return false;
    }
    const old = bucket.get(leaseId);
    if (old === void 0) {
      return false;
    }
    bucket.set(leaseId, { ...old, expiresAt: now + this.leaseSeconds });
    return true;
  }
  /**
   * 按**句柄**精确释放。已释放 / 已过期都是幂等的 `false`。
   *
   * @param outcome 收尾数据(token 数、TTFT、状态)。给了就同时进**保留区**;
   *   不给就只是释放 —— 调用方没数,我们也不瞎编。
   *
   * ⚠️ `leaseId` 是 {@link acquire} 返回的那个**字符串句柄**。为兼容尚未升级的
   * 调用点,传 `realModelId` 也能用 —— 那就退回「丢该桶里最旧的一条」(旧行为)。
   * 但**不要**依赖这条退路:它正是本方法要修掉的那个「不知道自己在丢谁的租约」。
   */
  release(leaseId, opts = {}) {
    if (!leaseId) {
      return false;
    }
    const now = opts.now ?? this.clock.monoNow();
    if (!this.index.has(leaseId)) {
      const bucket2 = this.leases.get(leaseId);
      if (bucket2 === void 0 || bucket2.size === 0) {
        return false;
      }
      let oldest = null;
      for (const l of bucket2.values()) {
        if (oldest === null || l.startedAt < oldest.startedAt) {
          oldest = l;
        }
      }
      if (oldest === null) {
        return false;
      }
      bucket2.delete(oldest.leaseId);
      this.index.delete(oldest.leaseId);
      this.preemptHooks.delete(oldest.leaseId);
      if (bucket2.size === 0) {
        this.leases.delete(leaseId);
      }
      return true;
    }
    const key3 = this.index.get(leaseId);
    if (key3 === void 0) {
      return false;
    }
    this.index.delete(leaseId);
    this.preemptHooks.delete(leaseId);
    const bucket = this.leases.get(key3);
    if (bucket === void 0) {
      return false;
    }
    const lease = bucket.get(leaseId);
    bucket.delete(leaseId);
    if (bucket.size === 0) {
      this.leases.delete(key3);
    }
    if (lease === void 0) {
      return false;
    }
    this.archive(lease, opts.outcome ?? null, now);
    return true;
  }
  /** 清掉某个真实模型的**全部**租约(测试 / 维护用),返回清掉的条数。 */
  releaseBucket(realModelId) {
    const bucket = this.leases.get(realModelId);
    if (bucket === void 0) {
      return 0;
    }
    this.leases.delete(realModelId);
    for (const leaseId of bucket.keys()) {
      this.index.delete(leaseId);
      this.preemptHooks.delete(leaseId);
    }
    return bucket.size;
  }
  // ------------------------------------------------------------- 保留区
  /**
   * 保留区**当前**容量 —— 优先问活来源(``ui.recent_limit``)。
   *
   * 容量提供函数缺失、抛错或给出 <1 时回落构造参数 `maxRecent`(默认
   * {@link DEFAULT_MAX_RECENT}):观测不该因为设置读不到而把账本拖垮,
   * 更不该让保留区变成无上限。
   */
  recentCapacity() {
    if (this.maxRecentFn !== null) {
      let cap = 0;
      try {
        cap = Math.trunc(Number(this.maxRecentFn()));
      } catch {
        cap = 0;
      }
      if (Number.isFinite(cap) && cap >= 1) {
        return cap;
      }
    }
    return this.maxRecent;
  }
  /**
   * 保留区砍回容量上限 —— **从头砍,因为它最旧**。
   *
   * `recentHint` 是短路:保留区条数还没到「上次问到的容量」就不可能超容,
   * 直接返回,省掉一次设置读库。用户把上限**调小**之后,下一次收尾就会重新问一次
   * 并立刻砍到位。
   */
  trimRecent() {
    if (this.recent.length <= this.recentHint) {
      return;
    }
    const cap = this.recentCapacity();
    this.recentHint = cap;
    while (this.recent.length > cap) {
      this.recent.shift();
    }
  }
  /**
   * 清掉过期租约(被租期扫掉的也要进保留区 —— 否则「刚才那条到底怎么了」
   * 在面板上永远是空白),再把保留区砍回容量。
   */
  purge(now = this.clock.monoNow()) {
    for (const [key3, bucket] of this.leases) {
      for (const [leaseId, lease] of bucket) {
        if (lease.expiresAt > now) {
          continue;
        }
        this.archive(lease, null, now);
        bucket.delete(leaseId);
        this.index.delete(leaseId);
        this.preemptHooks.delete(leaseId);
      }
      if (bucket.size === 0) {
        this.leases.delete(key3);
      }
    }
    this.trimRecent();
  }
  /** 收尾归档:保留区 + 砍容量。 */
  archive(lease, outcome, now) {
    if (outcome !== null) {
      this.recent.push({
        lease,
        finishedAt: now,
        ok: outcome.ok,
        status: outcome.status,
        error: outcome.error,
        latencyMs: outcome.latencyMs,
        ttftMs: outcome.ttftMs,
        promptTokens: outcome.promptTokens,
        completionTokens: outcome.completionTokens,
        cachedTokens: outcome.cachedTokens
      });
    } else {
      this.recent.push(archivedRow(lease, now));
    }
    this.trimRecent();
  }
  /**
   * 最近的已结束请求,**最新在前**。只按条数清(无时间窗,2026-10-15)。
   *
   * ⚠️ 降序键必须是 **`(finishedAt, seq)`** 而不是单独的 `finishedAt`:
   * 单调钟在同一毫秒里会给出**同一个值**,单键排序会退化成「按 FIFO 进出顺序」——
   * 一条刚结束的请求被排在几分钟前的旁边,面板上表现为「最新的不在最上面」。
   * `seq` 单调递增,正好作 tiebreaker。
   */
  recentRows(limit = 50) {
    this.purge();
    const out = [...this.recent];
    out.sort(
      (a, b) => a.finishedAt === b.finishedAt ? b.lease.seq - a.lease.seq : b.finishedAt - a.finishedAt
    );
    return limit > 0 ? out.slice(0, limit) : out;
  }
  /** 一条已结束请求距离现在多久(秒);`null` 时间由账本时钟提供。 */
  finishedAgoS(row, now = this.clock.monoNow()) {
    return Math.max(0, now - row.finishedAt);
  }
  // ------------------------------------------------------------- 观测
  /** `{realModelId: 在途数}` —— 键是**真实模型**,不是端点(对外契约形状,不要改)。 */
  snapshot() {
    this.purge();
    const out = {};
    for (const key3 of [...this.leases.keys()].sort()) {
      out[key3] = this.leases.get(key3)?.size ?? 0;
    }
    return out;
  }
  /** 全部在途租约(供面板展示)。**已按开始时刻排序**。 */
  detail() {
    this.purge();
    const out = [];
    for (const bucket of this.leases.values()) {
      out.push(...bucket.values());
    }
    out.sort((a, b) => a.startedAt - b.startedAt);
    return out;
  }
  /** 在途租约总数。 */
  total() {
    return Object.values(this.snapshot()).reduce((a, b) => a + b, 0);
  }
  /** 清账(测试 / 维护)。不给 key 就全清。 */
  reset(realModelId) {
    if (realModelId === void 0) {
      this.leases.clear();
      this.index.clear();
      this.preemptHooks.clear();
      this.recent.length = 0;
      this.recentHint = 0;
      this.seq = 0;
      this.convSeq = 0;
      this.convOrder.clear();
      return;
    }
    this.releaseBucket(realModelId);
  }
};

// ../core/src/router/session-pin.ts
var SessionPinTable2 = class {
  ttl;
  clock;
  /** `sessionId -> { endpointId, expiresAt }`(单调钟) */
  pins = /* @__PURE__ */ new Map();
  constructor(ttlSeconds = DEFAULT_PIN_SECONDS2, clock = systemClock) {
    this.ttl = Number(ttlSeconds);
    this.clock = clock;
  }
  /** 会话粘住租期(秒)。 */
  get ttlSeconds() {
    return this.ttl;
  }
  /** 取粘住的 `endpointId`;不存在或**已过期**返回 `null`(顺带删掉过期项)。 */
  get(sessionId) {
    if (!sessionId) {
      return null;
    }
    const now = this.clock.monoNow();
    const hit = this.pins.get(sessionId);
    if (hit === void 0) {
      return null;
    }
    if (hit.expiresAt <= now) {
      this.pins.delete(sessionId);
      return null;
    }
    return hit.endpointId;
  }
  /** 建立 / 续期粘住。空 `sessionId` 直接忽略(不编号、不粘住)。 */
  set(sessionId, endpointId, ttlSeconds) {
    if (!sessionId) {
      return;
    }
    this.pins.set(sessionId, {
      endpointId,
      // 按次可选 ttl:Router 活读设置项时逐次传入当前值,
      // 不传则用表构造时的默认。
      expiresAt: this.clock.monoNow() + (Number.isFinite(ttlSeconds) ? ttlSeconds : this.ttl)
    });
  }
  /**
   * 解除粘住。给了 `endpointId` 就**只在指向它时才解**。
   *
   * 「只在指向它时才解」防的是竞态:旧请求的失败回调晚到时,不能把会话从
   * **已经迁移到的新端点**上摘下来。
   */
  drop(sessionId, endpointId) {
    if (!sessionId) {
      return;
    }
    const hit = this.pins.get(sessionId);
    if (hit === void 0) {
      return;
    }
    if (endpointId && hit.endpointId !== endpointId) {
      return;
    }
    this.pins.delete(sessionId);
  }
  /** 当前未过期的粘住条数。 */
  count() {
    const now = this.clock.monoNow();
    let n = 0;
    for (const { expiresAt } of this.pins.values()) {
      if (expiresAt > now) {
        n += 1;
      }
    }
    return n;
  }
  /** `{sessionId: endpointId}` —— 值是**粘住的端点**,不是过期时刻。 */
  snapshot() {
    const now = this.clock.monoNow();
    const alive = {};
    for (const [sessionId, { endpointId, expiresAt }] of this.pins) {
      if (expiresAt > now) {
        alive[sessionId] = endpointId;
      }
    }
    return {
      ttlSeconds: this.ttl,
      active: Object.keys(alive).length,
      sessions: Object.fromEntries(Object.entries(alive).sort(([a], [b]) => a < b ? -1 : 1))
    };
  }
};

// ../core/src/router/router.ts
function parseCooldownOverrides(raw) {
  const out = {};
  if (!raw) {
    return out;
  }
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return out;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return out;
  }
  for (const [provider, minutes] of Object.entries(parsed)) {
    if (typeof provider !== "string" || provider.trim() === "") {
      continue;
    }
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
      continue;
    }
    out[provider] = minutes;
  }
  return out;
}
var RULES_TTL_SECONDS2 = 5;
var systemRandom = {
  next: () => Math.random()
};
var Router = class {
  deps;
  ledger;
  health;
  pins;
  onCommit;
  pinSeconds;
  pinSecondsOf;
  clock;
  rng;
  /** `scheduler.rules` 的供应商冷却覆盖表(5s TTL 缓存,**挂在实例上**)。 */
  cdRules = null;
  cdRulesAt = 0;
  constructor(deps = null, options = {}) {
    if (deps !== null && typeof deps.getSetting === "function") {
      const source = deps;
      this.deps = { settings: source, applyCooldownRules: null };
    } else if (deps === null) {
      this.deps = { settings: null, applyCooldownRules: null };
    } else {
      this.deps = deps;
    }
    this.clock = options.clock ?? systemClock;
    this.pinSeconds = Number(options.pinSeconds ?? DEFAULT_PIN_SECONDS2);
    this.pinSecondsOf = options.pinSecondsOf ?? null;
    this.pins = options.pins ?? new SessionPinTable2(this.pinSeconds, this.clock);
    this.health = options.health ?? new HealthRegistry2({ wallNow: () => this.clock.wallNow() });
    this.ledger = options.ledger ?? new InflightLedger2({ maxRecentFn: () => this.recentLimit(), clock: this.clock });
    this.rng = options.rng ?? systemRandom;
    this.onCommit = options.onCommit ?? null;
  }
  // ------------------------------------------------------------------ 选路
  /**
   * 选出本次请求该用的端点。
   *
   * @param chain **已排好序、且已剔除时段禁用项**的端点链(时段判定属于调度器
   *   职责;这里只管「谁空闲、谁排前面」)。⚠️ **必须每个请求重新取** —— 健康状态
   *   是内存态且随时变,在别处缓存了 chain,冷却与在途就会停在旧值上。
   * @param sessionId 会话 id(客户端没带时由上层从首条 user 消息派生)
   * @param needsVision 请求是否带图片。为真时**只从视觉端点里挑** —— 普通端点
   *   接不住图片。带图规则(D30)**对一切调度策略生效**:链上有视觉端点时,
   *   视觉端点占住整条 pool;链上**没有**视觉端点时,pool 就是整条链
   *   (图像桥 / 连接器兜底的场景)。视觉端点全忙 / 全冷却时如实返回
   *   `all_busy` / `all_cooldown`,而不是把图丢给文本模型。
   * @param ignoreCooldown 为真时**无视端点冷却**参加选路 —— 冷却中的端点不再被
   *   跳过。这是**直连真实模型**(名字不在 `logical_model` 表)的请求语义:冷却挡不住
   *   「这一次」尝试,失败照常记冷却、后续请求照旧被冷却挡住,直到成功清零。
   *   逻辑模型档链**不许**传它(默认 `false` = 照旧跳过冷却端点)。
   */
  plan(opts) {
    const chain = opts.chain;
    const sessionId = opts.sessionId ?? "";
    const needsVision = opts.needsVision ?? false;
    const ignoreCooldown = opts.ignoreCooldown ?? false;
    if (!chain || chain.length === 0) {
      return planResult(null, "all_blackout");
    }
    const now = this.clock.wallNow();
    const items = chain.map(
      (item) => withHealth(item, this.health.get(item.endpoint.endpointId))
    );
    let pool = items;
    if (needsVision) {
      const vision = items.filter((it) => it.endpoint.supportsVision);
      if (vision.length > 0) {
        pool = vision;
      }
    }
    const pinned = this.pins.get(sessionId);
    if (pinned) {
      const wanted = pinned;
      let onChain = false;
      for (const item of pool) {
        if (item.endpoint.endpointId !== wanted) {
          continue;
        }
        onChain = true;
        if (inCooldown(item.endpoint.health ?? emptyHealthRecord(), now) && !ignoreCooldown) {
          this.pins.drop(sessionId, wanted);
          break;
        }
        if (this.ledger.hasRoom(item.endpoint.realModelKey, item.endpoint.concurrency)) {
          return planResult(item, "affinity", true);
        }
        break;
      }
      if (!onChain) {
        this.pins.drop(sessionId, wanted);
      }
    }
    const strategy = chain[0]?.strategy ?? "";
    if (LOAD_AWARE_STRATEGIES2.has(strategy)) {
      return this.planLoadAware(pool, strategy, ignoreCooldown);
    }
    const healthy = pool.filter(
      (item) => ignoreCooldown || !item.endpoint.inCooldown(now)
    );
    if (healthy.length === 0) {
      return planResult(null, "all_cooldown");
    }
    for (const item of healthy) {
      if (this.ledger.hasRoom(item.endpoint.realModelKey, item.endpoint.concurrency)) {
        return planResult(item, "ordered");
      }
    }
    for (const item of healthy) {
      if (item.direct !== true) {
        continue;
      }
      if (this.ledger.hasPreemptable(item.endpoint.realModelKey)) {
        return planResult(item, "ordered");
      }
    }
    return planResult(null, "all_busy");
  }
  // ------------------------------------------------------- 负载感知策略
  /**
   * `least-busy` / `balanced` 的裁决 —— 两者共用同一份「剩余空位」。
   *
   * ⚠️ **必须先按 `realModelKey` 归并,再按桶加权** —— 这是 D12 的直接后果。
   * 同一个真实模型的 N 枚凭据在链上是 N 个 `ChainItem`,而 `ledger.inFlight`
   * 对它们返回**同一个值**。逐项加权会让「凭据多的模型」拿到成倍的权重,随后被
   * `hasRoom` 挡下 —— 表现为明明还有空位,请求却被判 all_busy。
   *
   * - `least-busy`:取**在途最少**的桶(并列 → 配置序,由链序保证)
   * - `balanced` :按**剩余空位**加权随机 —— 每个空位等概率被选中,
   *   这就是「平均使用」的字面含义
   *
   * ⚠️ 两个策略都**不会**超过任何一个真实模型的并发上限:加权用的是
   * `concurrency - inFlight`,等于 0 的桶根本不进候选。
   */
  planLoadAware(pool, strategy, ignoreCooldown) {
    const now = this.clock.wallNow();
    const buckets = /* @__PURE__ */ new Map();
    for (const item of pool) {
      if (item.endpoint.inCooldown(now) && !ignoreCooldown) {
        continue;
      }
      const key3 = item.endpoint.realModelKey;
      const used = this.ledger.inFlight(key3);
      const room = Math.max(0, item.endpoint.concurrency - used);
      const cur = buckets.get(key3);
      if (cur === void 0) {
        buckets.set(key3, { item, used, room });
      } else {
        cur.room = Math.min(cur.room, room);
        cur.used = Math.max(cur.used, used);
      }
    }
    if (buckets.size === 0) {
      if (pool.some((item) => item.endpoint.inCooldown(now)) && !ignoreCooldown) {
        return planResult(null, "all_cooldown");
      }
      return planResult(null, "all_busy");
    }
    const roomy = [...buckets.values()].filter((b) => b.room > 0);
    if (roomy.length === 0) {
      return planResult(null, "all_busy");
    }
    if (strategy === "least-busy") {
      roomy.sort((a, b) => a.used - b.used || a.item.priority - b.item.priority);
      return planResult(roomy[0].item, "least_busy");
    }
    const total = roomy.reduce((sum, b) => sum + b.room, 0);
    let pick = this.rng.next() * total;
    for (const b of roomy) {
      pick -= b.room;
      if (pick <= 0) {
        return planResult(b.item, "balanced");
      }
    }
    return planResult(roomy[roomy.length - 1].item, "balanced");
  }
  // ------------------------------------------------------- 落账 / 收尾
  /**
   * 选路成功后的落账:占在途租约(按**真实模型**)+ 建立/续期会话 pin。
   *
   * @returns 租约句柄。**必须**原样交回 {@link finish} 才能精确释放。
   *
   * ⚠️ 会话 pin 只在**尚未指向任何端点**时才写(2026-10-13)。以前无条件覆盖:
   * 同一会话的 N 个并发请求会把 pin 依次推到第 N 档 —— 第 1 个占住首选后,
   * 第 2 个顺延到次选并**覆盖**掉 pin,第 3 个再推到第 3 档。于是下一轮顺序
   * 请求回到**最后**那一档,恰恰是刚被最重的并发请求占过的那台。亲和存在的
   * 唯一理由(长会话固定同一模型,prompt cache 才命中)因此被并发反向摧毁。
   *
   * ⚠️ **直连条目走抢占式 acquire**(m02240):`planItem.direct === true` 时
   * 用 {@link InflightLedger.acquireDirect} —— 并发槽被逻辑请求占满就踢掉
   * 该真实模型上**最新入队**的逻辑租约(记 PREEMPT_ERROR),把容量让给直连。
   * 无可抢占对象(全为直连在途)时返回 `""`,调用方按「无可用上游」处理。
   */
  commit(planItem, opts = {}) {
    if (planItem === null || planItem === void 0) {
      return "";
    }
    const ep = planItem.endpoint;
    const sessionId = opts.sessionId ?? "";
    const logicalName = opts.logicalName ?? "";
    let leaseId;
    if (planItem.direct === true) {
      const preempted = this.ledger.acquireDirect(
        ep.realModelKey,
        ep.concurrency,
        {
          endpointId: ep.endpointId,
          logicalModel: logicalName,
          sessionId,
          stream: opts.stream ?? false
        }
      );
      if (preempted === null) return "";
      leaseId = preempted;
    } else {
      leaseId = this.ledger.acquire(ep.realModelKey, {
        endpointId: ep.endpointId,
        logicalModel: logicalName,
        sessionId,
        stream: opts.stream ?? false,
        // ⚠️ 登记抢占回调:直连请求挤掉本租约时,靠它打断本请求的上游调用。
        onPreempt: opts.onPreempt
      });
    }
    if (!this.pins.get(sessionId)) {
      this.pins.set(
        sessionId,
        ep.endpointId,
        this.pinSecondsOf !== null ? this.pinSecondsOf() : void 0
      );
    }
    if (this.onCommit !== null) {
      try {
        this.onCommit(ep.realModelKey, logicalName);
      } catch {
      }
    }
    return leaseId;
  }
  /** 续期在途租约(流式每收到一个 chunk 调一次)。不存在返回 `false`。 */
  touch(leaseId) {
    return this.ledger.touch(leaseId);
  }
  /**
   * 请求结束:**释放在途租约** + 记成败;失败时额外解除会话 pin + 端点熔断。
   *
   * @param leaseId {@link commit} 返回的句柄。按句柄**精确**释放 —— 账本不再猜
   *   「该丢哪一条」。缺句柄(未升级的调用点)时退回清掉该真实模型上的一条,
   *   避免永久泄漏。
   * @param cooldownUntil 上游给的**绝对**冷却截止时刻(epoch 秒),由调用方从
   *   `UpstreamError.retryAfter` 算出来。给了就**压过** provider 覆盖与全局 floor ——
   *   见 {@link CooldownHint} 的三层优先级。不传就是现行为:走覆盖链。
   *
   * ⚠️ 成功时**绝不**解除 pin —— 每轮都 unpin 等于根本没有会话亲和:额度刷新
   * 触发的重排会把长会话在几个模型之间来回甩,prompt cache 全失效。
   *
   * ⚠️ `kind` / `status` 必须由调用方**如实传**:否则面板上「密钥失效」和
   * 「上游超时」长得一模一样,都只能显示成一句没有信息量的空白。
   */
  finish(planItem, opts = {}) {
    if (planItem === null || planItem === void 0) {
      return;
    }
    const ep = planItem.endpoint;
    const sessionId = opts.sessionId ?? "";
    const ok2 = opts.ok ?? true;
    const preempted = opts.preempted === true;
    const voidAttempt = opts.voidAttempt === true;
    const latencyMs = opts.latencyMs ?? 0;
    const ttftMs = opts.ttftMs ?? null;
    const promptTokens = opts.promptTokens ?? 0;
    const completionTokens = opts.completionTokens ?? 0;
    const cachedTokens = opts.cachedTokens ?? 0;
    const counted = Boolean(latencyMs) || Boolean(ttftMs) || Boolean(promptTokens) || Boolean(completionTokens) || Boolean(cachedTokens);
    const outcome = counted ? {
      ok: ok2,
      status: opts.status ?? 0,
      error: opts.error ?? "",
      latencyMs: Math.trunc(latencyMs || 0),
      ttftMs: ttftMs === null || ttftMs === void 0 ? null : Math.trunc(ttftMs),
      promptTokens: Math.trunc(promptTokens || 0),
      completionTokens: Math.trunc(completionTokens || 0),
      cachedTokens: Math.trunc(cachedTokens || 0)
    } : null;
    const leaseId = opts.leaseId ?? "";
    if (leaseId) {
      this.ledger.release(leaseId, { outcome });
    } else {
      this.ledger.releaseBucket(ep.realModelKey);
    }
    const hint = ok2 ? { until: null, policy: null } : {
      until: opts.cooldownUntil ?? null,
      policy: this.cooldownPolicy(ep.provider)
    };
    if (!preempted && !voidAttempt) {
      const rec = this.health.get(ep.endpointId);
      this.health.put(
        ep.endpointId,
        ok2 ? noteSuccess(rec, this.clock.wallNow()) : noteFailure(rec, {
          error: opts.error,
          kind: opts.kind,
          status: opts.status,
          now: this.clock.wallNow(),
          hint
        })
      );
    }
    if (!ok2 && !preempted && !voidAttempt) {
      this.pins.drop(sessionId, ep.endpointId);
    }
  }
  // ------------------------------------------------------- 冷却策略
  /**
   * 本次失败要用的冷却策略(只有它的 `cooldownFloorS` 会被用到)。
   *
   * ⚠️ **真实/抽象档在这里没差别**:两档只有 `maxAttempts` 不同,而
   * `cooldownFloorS` 两档**完全一致**(都读 `retry.logical_cooldown`)。
   * 端点熔断是**端点**自己的事,不该跟着「这次谁在调用」换时长:同一个端点被
   * 两个逻辑模型共用时,分档只会让同一个故障被冷却两次不一样久。
   *
   * ⚠️ **供应商级冷却覆盖**(2026-10-16;2026-10-18 起并进 `scheduler.rules`):
   * `cooldownFloorS` 允许按失败端点的 provider 覆盖 —— 优先级
   * `scheduler.rules` 里该 provider 的 `cooldown` 规则(分钟)>
   * `retry.logical_cooldown`(全局)。覆盖是**可选**的,缺省 = 不覆盖。
   *
   * ⚠️ **配置读不动时返回 `null` 而不是抛**:那是「不熔断」(0 秒),而不是让一次
   * 记账把请求路径炸掉 —— 与「配置问题不升级成请求失败」是同一条原则。
   */
  cooldownPolicy(provider = "") {
    const floor = this.globalCooldownFloorS();
    if (floor === null) {
      return null;
    }
    const overrideMin = this.cooldownMinOverride(provider);
    return {
      maxAttempts: 0,
      cooldownFloorS: overrideMin !== null ? overrideMin * 60 : floor,
      baseS: 0,
      factor: 0,
      capS: 0,
      jitterRatio: 0,
      codes: EMPTY_CODES
    };
  }
  /**
   * 全局冷却时长(秒)= `retry.logical_cooldown`(分钟)× 60。
   *
   * ⚠️ **键缺失 / 值坏了 → 900 秒,不是 0**:Nexus 走
   * `RetryPolicy.of(repo, abstract=False)` → `retry_setting()` → 键缺失时
   * **播种** `RETRY_DEFAULTS["retry.logical_cooldown"] = 15` 后回读,值非法时
   * 「写回默认值再回读」。所以那个函数永远返回一个数,Router 侧拿到的就是
   * 默认的 15 分钟。本方法用 {@link coerceRetryNumber} 等价地做到这点。
   *
   * 只有**读不动**(没有 repo / `get_setting` 抛错)才返回 `null` —— 对应 Nexus
   * `_cooldown_policy` 的 `except` 分支,语义是「本次不熔断」。
   */
  globalCooldownFloorS() {
    const source = this.deps.settings;
    if (source === null || source === void 0) {
      return null;
    }
    let raw;
    try {
      raw = source.getSetting(SETTING_LOGICAL_COOLDOWN);
    } catch {
      return null;
    }
    const minutes = coerceRetryNumber(raw, DEFAULT_LOGICAL_COOLDOWN_MIN);
    return minutes * 60;
  }
  /**
   * 供应商级冷却时长覆盖(**分钟**,`null` = 不覆盖)。
   *
   * 优先级(命中即停,**两级**):
   * 1. `scheduler.rules` 里该 provider 的 `cooldown` 规则
   *    (`{"provider": "<id>", "cooldown": 分钟}`),只对写了的供应商生效;
   * 2. 没写到 → `null`,调用方回落全局 `retry.logical_cooldown`。
   *
   * ⚠️ **只做两级**(2026-10-17 用户定案:「逻辑模型成员冷却优先级只做两级,
   * 全局和供应商覆盖」)。更早的两级早已退役、设了不再被读。
   */
  cooldownMinOverride(provider = "") {
    if (!provider) {
      return null;
    }
    return this.cooldownRules()[provider] ?? null;
  }
  /**
   * 生效中的供应商冷却覆盖表(`scheduler.cooldown_overrides` → `{provider: 分钟}`)。
   *
   * 5s TTL 实例级缓存:热路径不重复 `JSON.parse` 整份配置;面板改完 5s 内生效。
   * ⚠️ 缓存**不能**放模块级 —— 一个进程里可能有多个 repo,那会把 A 库的覆盖表
   * 喂给 B 库。
   */
  cooldownRules() {
    const now = this.clock.wallNow();
    if (this.cdRules !== null && now - this.cdRulesAt < RULES_TTL_SECONDS2) {
      return this.cdRules;
    }
    let table;
    if (this.deps.applyCooldownRules) {
      table = this.deps.applyCooldownRules();
    } else {
      table = parseCooldownOverrides(this.readSetting(SETTING_COOLDOWN_OVERRIDES));
    }
    this.cdRules = table;
    this.cdRulesAt = now;
    return table;
  }
  /**
   * 「实时日志」最大显示条数(设置键 `ui.recent_limit`,默认 50)。
   *
   * ⚠️ 这个方法**同时是保留区容量的活来源**:`Router` 把它作为 `maxRecentFn` 交给
   * {@link InflightLedger},账本每次收尾 / purge 时问一次。所以这里**不能**缓存 ——
   * 缓存会让用户在面板上改完条数后要等缓存过期才生效。
   *
   * ⚠️ 读失败 / 没配 / 值非法 → 回落默认 50(观测不该因为设置读不到而把整个视图拖垮)。
   *
   * ⚠️ 解析口径照抄 Nexus 的 `int(raw or default)`:`"3.9"` / `"1e3"` 在 Python 里
   * 会抛 `ValueError` → 回落 50,而不是被截成 3 —— 见 {@link parseStrictInt}。
   */
  recentLimit() {
    const raw = this.readSetting(SETTING_RECENT_LIMIT);
    return parseStrictInt(raw, DEFAULT_RECENT_LIMIT, 1);
  }
  /** 读设置;缺失 / 抛错 / 非字符串一律按「没有」处理(返回 `null`)。 */
  readSetting(key3) {
    const source = this.deps.settings;
    if (source === null || source === void 0) {
      return null;
    }
    try {
      const raw = source.getSetting(key3);
      if (raw === null || raw === void 0) {
        return null;
      }
      return String(raw);
    } catch {
      return null;
    }
  }
  // ------------------------------------------------------------------ 观测
  /**
   * **解冻一个账号名下的所有端点冷却**(用户 m16528:凭据换新后不必再等旧冷却)。
   *
   * 端点 id 形如 `<provider>/<model>@<provider>/<username>`
   * (见 {@link endpointIdOf}),所以「账号名」就是 `@` 后面最后一段 —— 按它
   * 匹配,一把 key 在多个模型上的冷却一起清掉。
   *
   * @returns 清掉的条数(0 = 本来就没在冷却)
   */
  thawAccount(provider, username) {
    if (!username) return 0;
    const suffix = `@${provider}/${username}`;
    return this.health.clearWhere((id) => id.endsWith(suffix));
  }
  /** 排障快照(只含端点名与计数,无凭据,**无 sessionId**)。 */
  snapshot() {
    return {
      inflight: this.ledger.snapshot(),
      inflightTotal: this.ledger.total(),
      inflightKey: "real_model_id",
      // ⚠️ v3 是 endpoint_id(D12 改了键)
      pinSeconds: this.pinSeconds,
      pins: this.pins.count(),
      health: this.health.snapshot()
    };
  }
};
var EMPTY_CODES = /* @__PURE__ */ new Set();
function emptyHealthRecord() {
  return { fails: 0, cooldownUntil: 0, lastError: "", updatedAt: 0, lastKind: "", lastStatus: 0 };
}
function withHealth(item, rec) {
  if (item.endpoint.health === rec) {
    return item;
  }
  const ep = item.endpoint;
  const descriptors = Object.getOwnPropertyDescriptors(ep);
  const withoutHealth = { ...descriptors };
  delete withoutHealth.health;
  const next = Object.defineProperties(
    { ...ep, health: rec },
    withoutHealth
  );
  return { ...item, endpoint: next };
}

// ../core/src/gateway/auth.ts
import { timingSafeEqual } from "node:crypto";

// ../core/src/gateway/types.ts
var UpstreamErrorKind2 = {
  RateLimit: "rate_limit",
  Auth: "auth",
  AuthChallenge: "auth_challenge",
  Upstream: "upstream",
  BadRequest: "bad_request",
  Timeout: "timeout",
  Connection: "connection",
  AlreadyStreaming: "already_streaming"
};
var KIND_SPEC = {
  rate_limit: [429, true],
  auth: [401, false],
  auth_challenge: [502, false],
  upstream: [502, true],
  bad_request: [400, false],
  timeout: [504, true],
  connection: [502, true],
  already_streaming: [502, false]
};
var RAW_BODY_MAX = 256 * 1024;
var UpstreamError = class _UpstreamError extends Error {
  kind;
  detail;
  retryAfter;
  /** 上游原始 HTTP 状态码(若有);`_busy_or_upstream` 的 all_cooldown 出口要用。 */
  statusCode;
  /**
   * 上游错误响应的原件(有上游答复时必带)。
   *
   * `upstreamErrorToHttp()` 见到它就**原样**写回客户端的 body + 状态码,
   * `detail` 只在没有原件(自造错误:并发已满、池耗尽、网络异常)时才上屏。
   */
  raw;
  constructor(kind, detail2, opts = {}) {
    super(detail2 || kind);
    this.name = "UpstreamError";
    this.kind = kind;
    this.detail = detail2 || kind;
    if (opts.retryAfter !== void 0) this.retryAfter = opts.retryAfter;
    if (opts.statusCode !== void 0) this.statusCode = opts.statusCode;
    if (opts.raw !== void 0) this.raw = opts.raw;
  }
  /** 回给客户端的 HTTP 状态码(errors.py `_KIND_SPEC` 派生)。 */
  get httpStatus() {
    return KIND_SPEC[this.kind]?.[0] ?? 502;
  }
  /** 能否换一个端点重试。 */
  get retryable() {
    return KIND_SPEC[this.kind]?.[1] ?? true;
  }
  /** 上游非 2xx → 分类错误(对齐 `classify_status`,errors.py:73)。 */
  static fromStatus(statusCode, detail2, retryAfter) {
    let kind;
    if (statusCode === 429) kind = UpstreamErrorKind2.RateLimit;
    else if (statusCode === 401 || statusCode === 403) kind = UpstreamErrorKind2.Auth;
    else if (statusCode >= 500 && statusCode <= 599) kind = UpstreamErrorKind2.Upstream;
    else kind = UpstreamErrorKind2.BadRequest;
    return new _UpstreamError(kind, detail2, { retryAfter, statusCode });
  }
};
var EnvKeyProvider = class {
  constructor(envVarName = "ONE_API_KEY", env2 = process.env) {
    this.envVarName = envVarName;
    this.env = env2;
  }
  envVarName;
  env;
  getKey() {
    const raw = this.env[this.envVarName];
    return raw === void 0 ? void 0 : raw.trim();
  }
};

// ../core/src/gateway/auth.ts
var AUTH_ERROR_DETAIL = "\u7F3A\u5C11\u6216\u9519\u8BEF\u7684\u7F51\u5173 key";
function missingKeyWarning(source) {
  return `\u672A\u8BBE\u7F6E ${source} \u2014\u2014 \u7F51\u5173\u5F53\u524D\u65E0\u9274\u6743:\u6240\u6709\u8BF7\u6C42\u653E\u884C\u3002\u8BBE\u7F6E\u5B83\u5E76\u91CD\u542F\u7F51\u5173\u5373\u6062\u590D\u9274\u6743\u3002`;
}
function extractPresentedKey(req) {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.length > 0) {
    const text = authorization.trim();
    if (text.toLowerCase().startsWith("bearer ")) return text.slice(7).trim();
    return text;
  }
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey.length > 0) return xApiKey.trim();
  const url = req.url ?? "";
  const qIndex = url.indexOf("?");
  if (qIndex !== -1) {
    const query = new URLSearchParams(url.slice(qIndex + 1));
    const key3 = query.get("key");
    if (key3) return key3.trim();
  }
  return "";
}
function constantTimeEqual(a, b) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}
function checkAuth(req, keyProvider) {
  const expected = (keyProvider.getKey() ?? "").trim();
  const presented = extractPresentedKey(req);
  if (!expected) {
    warnMissingKeyOnce(keyProvider);
    return { ok: true, presentedKey: presented };
  }
  if (!presented || !constantTimeEqual(presented, expected)) {
    return { ok: false, status: 401, body: { detail: AUTH_ERROR_DETAIL } };
  }
  return { ok: true, presentedKey: presented };
}
function requireKey(req, keyProvider) {
  const result = checkAuth(req, keyProvider);
  return result.ok ? null : { status: result.status, body: result.body };
}
var warnedMissing = false;
function warnMissingKeyOnce(keyProvider) {
  if (warnedMissing) return;
  warnedMissing = true;
  const source = keyProvider instanceof EnvKeyProvider ? keyProvider.envVarName ?? "ONE_API_KEY" : "\u7F51\u5173 key \u6765\u6E90";
  const message = missingKeyWarning(source);
  const emit = keyProvider.onMissingKeyWarning ?? ((msg) => console.warn(msg));
  emit(message);
}

// ../core/src/connectors/types.ts
var UpstreamError2 = class extends Error {
  kind;
  retryable;
  httpStatus;
  retryAfter;
  /**
   * 上游响应的**原件**(有上游答复时才带)。
   *
   * 连接器把上游原文改写进了 `message`(「认证失败 — 上游:…」),那对日志有用、
   * 对客户端是误导。带上原件后,网关出口(`upstreamErrorToHttp`)可以逐字写回
   * 上游的状态码与响应体,分类结果只用于内部的换档/冷却 —— 用户 m36329
   * 「只要上游有返回值,就返回上游返回的原始内容,不做修改」。
   *
   * 自造错误(缺凭据、池耗尽、客户端断开)没有原件,保持 undefined。
   */
  raw;
  constructor(kind, message, retryable, httpStatus, retryAfter, raw) {
    super(message);
    this.name = "UpstreamError";
    this.kind = kind;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
    if (retryAfter !== void 0) this.retryAfter = retryAfter;
    if (raw !== void 0) this.raw = raw;
  }
};
function upstreamRawResponse(status, body) {
  let text;
  let json;
  if (typeof body === "string") {
    text = body;
    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        json = JSON.parse(trimmed);
      } catch {
      }
    }
  } else {
    json = body ?? void 0;
    try {
      text = JSON.stringify(body ?? null);
    } catch {
      text = String(body);
    }
  }
  const raw = {
    text: text.length > RAW_BODY_MAX ? text.slice(0, RAW_BODY_MAX) : text,
    status
  };
  if (json !== void 0) raw.json = json;
  return raw;
}

// ../core/src/connectors/openai-compat.ts
var OpenAICompatAdapter = class {
  vendorId = "openai_compat";
  extraHeaders;
  constructor(extraHeaders) {
    this.extraHeaders = extraHeaders ?? {};
  }
  async getToken(creds) {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      throw new UpstreamError2(
        "auth",
        "[openai_compat] \u7F3A\u5C11 api_key",
        false,
        401
      );
    }
    return {
      accessToken: apiKey,
      expiresAt: Number.POSITIVE_INFINITY
    };
  }
  decorateRequest(base, token) {
    return {
      ...base,
      headers: {
        ...base.headers,
        ...this.extraHeaders,
        Authorization: `Bearer ${token.accessToken}`
      }
    };
  }
  classifyError(httpStatus, body, headers) {
    return classify_openai_error(httpStatus, body, headers);
  }
};
function retryAfterOf(body, headers) {
  const fromBody = numberFrom(body);
  if (fromBody !== void 0) return fromBody;
  if (!headers) return void 0;
  const raw = pickHeader(headers, "retry-after");
  if (raw === void 0) return void 0;
  const secs = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(secs)) {
    return secs >= 0 ? Math.ceil(secs) : void 0;
  }
  const at = Date.parse(raw);
  if (Number.isFinite(at)) {
    const delta = Math.ceil((at - Date.now()) / 1e3);
    return delta >= 0 ? delta : void 0;
  }
  return void 0;
}
function pickHeader(headers, name2) {
  if (!headers) return void 0;
  const want = name2.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== want) continue;
    const text = Array.isArray(v) ? v[0] : v;
    if (typeof text === "string") return text;
  }
  return void 0;
}
function numberFrom(body) {
  if (!body || typeof body !== "object") return void 0;
  const b = body;
  for (const key3 of ["retry_after", "retryAfter", "retry-after", "retry_in", "retryIn"]) {
    const v = b[key3];
    if (typeof v === "number" && Number.isFinite(v)) {
      return v >= 0 ? Math.ceil(v) : void 0;
    }
    if (typeof v === "string") {
      const n = Number(v.trim());
      if (v.trim() !== "" && Number.isFinite(n)) return n >= 0 ? Math.ceil(n) : void 0;
    }
  }
  const err = b["error"];
  if (err && typeof err === "object") return numberFrom(err);
  return void 0;
}
function upstreamDetailOf(body) {
  if (!body || typeof body !== "object") return "";
  const b = body;
  const err = b["error"];
  if (err && typeof err === "object") {
    const inner = upstreamDetailOf(err);
    if (inner) return inner;
  }
  for (const key3 of ["message", "detail", "msg", "error"]) {
    const v = b[key3];
    if (typeof v === "string" && v.trim() !== "") return v.trim().slice(0, 300);
  }
  return "";
}
function classify_openai_error(httpStatus, body, headers) {
  const detail2 = upstreamDetailOf(body);
  const retryAfter = retryAfterOf(body, headers);
  const original = upstreamRawResponse(httpStatus, body);
  const make = (kind, label, retryable, status) => new UpstreamError2(
    kind,
    detail2 ? `${label}:${detail2}` : label,
    retryable,
    status,
    retryAfter,
    original
  );
  if (httpStatus === 200) {
    const code = extractCode(body);
    if (code !== void 0 && code !== 0) {
      return new UpstreamError2(
        "bad_request",
        detail2 ? `\u4E0A\u6E38\u8FD4\u56DE\u975E\u96F6 code: ${code}:${detail2}` : `\u4E0A\u6E38\u8FD4\u56DE\u975E\u96F6 code: ${code}`,
        false,
        400,
        retryAfter,
        original
      );
    }
    return new UpstreamError2(
      "bad_request",
      detail2 ? `\u4E0A\u6E38\u8FD4\u56DE\u975E\u96F6 code:${detail2}` : "\u4E0A\u6E38\u8FD4\u56DE\u975E\u96F6 code",
      false,
      400,
      retryAfter,
      original
    );
  }
  if (httpStatus === 429) {
    return make("rate_limit", "\u4E0A\u6E38\u9650\u6D41", true, 429);
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return make("auth", "\u8BA4\u8BC1\u5931\u8D25", false, httpStatus);
  }
  if (httpStatus >= 500) {
    return make("upstream", "\u4E0A\u6E38\u9519\u8BEF", true, httpStatus);
  }
  if (httpStatus >= 400) {
    return make("bad_request", "\u8BF7\u6C42\u9519\u8BEF", false, httpStatus);
  }
  return make("upstream", "\u672A\u77E5\u9519\u8BEF", true, httpStatus);
}
function extractCode(body) {
  if (body && typeof body === "object") {
    const code = body["code"];
    if (typeof code === "number") return code;
  }
  return void 0;
}

// ../core/src/connectors/trae.ts
import { createDecipheriv, createHash as createHash2, createSign, randomBytes } from "node:crypto";
var APP_ID = "6eefa01c-1036-4c7e-9ca5-d891f63bfcd8";
var DEFAULT_IDE_VERSION = "0.1.50";
var DEFAULT_IDE_VERSION_CODE = "20260811";
var DEFAULT_API_BASE_CN = "https://trae-api-cn.mchost.guru";
var DEFAULT_API_BASE_AI = "https://coresg-normal.trae.ai";
var REGION_BASES = {
  cn: DEFAULT_API_BASE_CN,
  ai: DEFAULT_API_BASE_AI
};
var REGION_ALIASES = {
  cn: "cn",
  ai: "ai",
  sg: "ai",
  global: "ai",
  intl: "ai"
};
var AUTH_STORAGE_KEY = "iCubeAuthInfo://icube.cloudide";
var DEVICE_CENTER_PREFIX = "iCubeAuthInfo://icube-dc:";
var HEADER_AES = Buffer.from([116, 99, 5, 16, 0, 0]);
var HEADER_AES_PRIVATE = Buffer.from([18, 57, 32, 32, 2, 3]);
var SALT_A = Buffer.from([
  82,
  9,
  106,
  213,
  48,
  54,
  165,
  56,
  191,
  64,
  163,
  158,
  129,
  243,
  215,
  251,
  124,
  227,
  57,
  130,
  155,
  47,
  255,
  135,
  52,
  142,
  67,
  68,
  196,
  222,
  233,
  203,
  84,
  123,
  148,
  50,
  166,
  194,
  35,
  61,
  238,
  76,
  149,
  11,
  66,
  250,
  195,
  78,
  8,
  46,
  161,
  102,
  40,
  217,
  36,
  178,
  118,
  91,
  162,
  73,
  109,
  139,
  209,
  37
]);
var SALT_B = Buffer.from([
  31,
  221,
  168,
  51,
  136,
  7,
  199,
  49,
  177,
  18,
  16,
  89,
  39,
  128,
  236,
  95,
  96,
  81,
  127,
  169,
  25,
  181,
  74,
  13,
  45,
  229,
  122,
  159,
  147,
  201,
  156,
  239,
  160,
  224,
  59,
  77,
  174,
  42,
  245,
  176,
  200,
  235,
  187,
  60,
  131,
  83,
  153,
  97,
  23,
  43,
  4,
  126,
  186,
  119,
  214,
  38,
  225,
  105,
  20,
  99,
  85,
  33,
  12,
  125
]);
var SALT_C = Buffer.from([
  191,
  192,
  216,
  250,
  122,
  246,
  220,
  97,
  31,
  254,
  98,
  27,
  8,
  72,
  71,
  176,
  135,
  99,
  96,
  18,
  127,
  101,
  203,
  104,
  211,
  102,
  191,
  125,
  37,
  72,
  150,
  156,
  51,
  229,
  121,
  35,
  17,
  153,
  141,
  177,
  110,
  131,
  150,
  128,
  172,
  255,
  254,
  6,
  18,
  140,
  55,
  62,
  236,
  249,
  135,
  64,
  135,
  12,
  117,
  4,
  89,
  149,
  168,
  209
]);
var SALT_D = Buffer.from([
  246,
  204,
  26,
  232,
  232,
  70,
  129,
  109,
  223,
  146,
  169,
  242,
  23,
  241,
  105,
  145,
  50,
  196,
  165,
  42,
  254,
  120,
  3,
  54,
  244,
  207,
  209,
  85,
  53,
  6,
  138,
  106,
  175,
  148,
  31,
  204,
  186,
  186,
  165,
  182,
  87,
  142,
  49,
  10,
  39,
  110,
  26,
  154,
  86,
  56,
  173,
  125,
  18,
  64,
  198,
  225,
  99,
  99,
  83,
  82,
  191,
  134,
  76,
  170
]);
function normalize_region(region) {
  const key3 = (region ?? "").trim().toLowerCase();
  return REGION_ALIASES[key3] ?? "cn";
}
function resolve_api_base(base_url, region, extra) {
  if (base_url && base_url.trim()) {
    return base_url.trim().replace(/\/+$/, "");
  }
  const extraBase = extra?.["api_base"];
  if (typeof extraBase === "string" && extraBase.trim()) {
    return extraBase.trim().replace(/\/+$/, "");
  }
  return REGION_BASES[normalize_region(region)];
}
function resolve_identity(api_key, extra) {
  const machine_id = extra?.["machine_id"] ?? createHash2("sha256").update(`trae-machine\0${api_key}`).digest("hex");
  const device_id = extra?.["device_id"] ?? createHash2("sha256").update(`trae-device\0${api_key}`).digest("hex").slice(0, 32);
  const user_id = extra?.["user_id"] ?? extra?.["uid"] ?? "";
  return { machine_id, device_id, user_id };
}
function build_headers(api_key, identity, request_id) {
  const rid = request_id ?? randomBytes(16).toString("hex");
  const trace_id = rid.replace("-", "").slice(0, 32);
  return {
    Authorization: `Cloud-IDE-JWT ${api_key}`,
    "X-Cloudide-Token": api_key,
    "X-Ide-Token": api_key,
    // x-uid 必须是真实 user_id(计费/签到接口校验;发整串 JWT 会 401)
    "x-uid": identity.user_id ?? "",
    "x-app-id": APP_ID,
    "x-machine-id": identity.machine_id,
    "x-device-id": identity.device_id,
    "x-device-type": "windows",
    "x-os-version": "Windows 10",
    "x-app-version": DEFAULT_IDE_VERSION,
    "x-ide-version": DEFAULT_IDE_VERSION,
    "x-app-version-code": DEFAULT_IDE_VERSION_CODE,
    "x-ide-version-code": DEFAULT_IDE_VERSION_CODE,
    "x-ide-version-type": "stable",
    "request-traffic-type": "prod",
    "package-type": "stable_cn",
    "x-custom-trace-id": trace_id,
    "x-flow-traceparent": `04-${trace_id}-${trace_id.slice(0, 16)}-01`,
    "x-request-id": rid,
    "x-trae-request-id": rid,
    "User-Agent": `Trae/${DEFAULT_IDE_VERSION}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream"
  };
}
function decrypt_storage_value(encoded) {
  const raw = Buffer.from(encoded, "base64");
  if (raw.length <= 102) {
    throw new UpstreamError2(
      "bad_request",
      "AES \u89E3\u5BC6: \u5BC6\u6587\u8FC7\u77ED",
      false,
      400
    );
  }
  const header = raw.subarray(0, 6);
  let salt;
  if (header.equals(HEADER_AES)) {
    salt = xorBuffers(SALT_A, SALT_B);
  } else if (header.equals(HEADER_AES_PRIVATE)) {
    salt = xorBuffers(SALT_C, SALT_D);
  } else {
    throw new UpstreamError2(
      "bad_request",
      "AES \u89E3\u5BC6: \u672A\u77E5\u52A0\u5BC6\u5934",
      false,
      400
    );
  }
  const random = raw.subarray(6, 38);
  const ciphertext = raw.subarray(38);
  const derived = createHash2("sha512").update(Buffer.concat([createHash2("sha512").update(random).digest(), salt])).digest();
  const key3 = derived.subarray(0, 16);
  const iv = derived.subarray(16, 32);
  const decipher = createDecipheriv("aes-128-cbc", key3, iv);
  decipher.setAutoPadding(false);
  let padded;
  try {
    padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new UpstreamError2(
      "bad_request",
      `AES \u89E3\u5BC6: ${err instanceof Error ? err.message : "\u89E3\u5BC6\u5931\u8D25"}`,
      false,
      400
    );
  }
  const padLen = padded[padded.length - 1];
  if (padLen < 1 || padLen > 16 || padLen > padded.length) {
    throw new UpstreamError2(
      "bad_request",
      "AES \u89E3\u5BC6: \u65E0\u6548\u7684 PKCS7 \u586B\u5145",
      false,
      400
    );
  }
  const plaintext = padded.subarray(0, padded.length - padLen);
  if (plaintext.length < 64) {
    throw new UpstreamError2(
      "bad_request",
      "AES \u89E3\u5BC6: \u660E\u6587\u8FC7\u77ED",
      false,
      400
    );
  }
  const expectedHash = plaintext.subarray(0, 64);
  const body = plaintext.subarray(64);
  const actualHash = createHash2("sha512").update(body).digest();
  if (!expectedHash.equals(actualHash)) {
    throw new UpstreamError2(
      "bad_request",
      "AES \u89E3\u5BC6: \u5B8C\u6574\u6027\u6821\u9A8C\u5931\u8D25",
      false,
      400
    );
  }
  return body.toString("utf-8");
}
function xorBuffers(a, b) {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] ^ (b[i] ?? 0);
  }
  return out;
}
function parse_refresh_response(body) {
  if (!body || typeof body !== "object") {
    throw new UpstreamError2("bad_request", "\u5237\u65B0\u5E94\u7B54\u683C\u5F0F\u9519\u8BEF", false, 400);
  }
  const result = body["Result"];
  if (!result) {
    throw new UpstreamError2("bad_request", "\u5237\u65B0\u5E94\u7B54\u7F3A\u5C11 Result", false, 400);
  }
  const token = result["Token"];
  if (!token) {
    throw new UpstreamError2("bad_request", "\u5237\u65B0\u5E94\u7B54\u7F3A\u5C11 Token", false, 400);
  }
  const expiresAt = parse_expiry(result["TokenExpireAt"]);
  const refreshToken = result["RefreshToken"];
  return {
    accessToken: token,
    expiresAt,
    refreshToken
  };
}
function parse_expiry(value) {
  if (typeof value === "number") {
    if (value >= 1e11) return Math.floor(value / 1e3);
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const num2 = Number(value);
    if (Number.isFinite(num2)) {
      if (num2 >= 1e11) return Math.floor(num2 / 1e3);
      return Math.floor(num2);
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return Math.floor(date.getTime() / 1e3);
    }
  }
  return Number.POSITIVE_INFINITY;
}
function classify_solo_error(code) {
  if (code === 1005) {
    return new UpstreamError2("rate_limit", "\u5957\u9910\u989D\u5EA6\u8017\u5C3D", true, 429);
  }
  if (code === 4001 || code === 4002) {
    return new UpstreamError2("bad_request", "\u6A21\u578B\u914D\u7F6E\u9519\u8BEF", false, 400);
  }
  if (code === 401 || code === 403) {
    return new UpstreamError2("auth", "\u8D26\u53F7\u5DF2\u5931\u6548", false, 401);
  }
  if (code === 4008 || code === 4011 || code === 429) {
    return new UpstreamError2("rate_limit", "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41", true, 429);
  }
  if (code >= 500) {
    return new UpstreamError2("upstream", "\u4E0A\u6E38\u9519\u8BEF", true, code);
  }
  return new UpstreamError2("bad_request", "\u8BF7\u6C42\u9519\u8BEF", false, 400);
}
var TraeAdapter = class {
  vendorId = "trae";
  async getToken(creds) {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      throw new UpstreamError2("auth", "[trae] \u7F3A\u5C11 api_key", false, 401);
    }
    return {
      accessToken: apiKey,
      expiresAt: Number.POSITIVE_INFINITY
    };
  }
  decorateRequest(base, token, creds) {
    const identity = resolve_identity(token.accessToken, creds);
    return {
      ...base,
      headers: {
        ...base.headers,
        ...build_headers(token.accessToken, identity)
      }
    };
  }
  classifyError(httpStatus, body) {
    const original = upstreamRawResponse(httpStatus, body);
    if (httpStatus === 200) {
      const code = extract_code(body);
      if (code !== void 0) {
        return classify_solo_error(code);
      }
    }
    if (httpStatus === 429) {
      return new UpstreamError2("rate_limit", "\u4E0A\u6E38\u9650\u6D41", true, 429, void 0, original);
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return new UpstreamError2("auth", "\u8BA4\u8BC1\u5931\u8D25", false, httpStatus, void 0, original);
    }
    if (httpStatus >= 500) {
      return new UpstreamError2("upstream", "\u4E0A\u6E38\u9519\u8BEF", true, httpStatus, void 0, original);
    }
    if (httpStatus >= 400) {
      return new UpstreamError2("bad_request", "\u8BF7\u6C42\u9519\u8BEF", false, httpStatus, void 0, original);
    }
    return new UpstreamError2("upstream", "\u672A\u77E5\u9519\u8BEF", true, httpStatus, void 0, original);
  }
};
function extract_code(body) {
  if (body && typeof body === "object") {
    const code = body["code"];
    if (typeof code === "number") return code;
  }
  return void 0;
}

// ../core/src/connectors/workbuddy.ts
import { createHash as createHash3 } from "node:crypto";
var REGION_BASES2 = {
  cn: "https://copilot.tencent.com",
  global: "https://www.workbuddy.ai"
};
var REGION_ALIASES2 = {
  intl: "global",
  cn: "cn"
};
var IDENTITY_VERSIONS = {
  cn: {
    ide: "5.5.6",
    ua: "WorkBuddy/5.5.6 WorkBuddy/5.5.6 CLI/2.137.1"
  },
  global: {
    ide: "5.5.2",
    ua: "WorkBuddy/5.5.2 WorkBuddy AI/5.5.2 CLI/5.5.2"
  }
};
function normalize_region2(region) {
  const key3 = (region ?? "").trim().toLowerCase();
  return REGION_ALIASES2[key3] ?? "global";
}
function detect_region_from_token(token) {
  const iss = jwt_claim(token, "iss").toLowerCase();
  if (iss.includes("copilot.tencent.com") || iss.includes("codebuddy.cn") || iss.includes("workbuddy.cn")) {
    return "cn";
  }
  return "global";
}
function _jwt_claims(token) {
  try {
    const segment = token.split(".")[1];
    const padded = segment + "=".repeat(-segment.length % 4);
    const decoded = Buffer.from(padded, "base64url").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}
function jwt_claim(token, key3) {
  const claims = _jwt_claims(token);
  const value = claims[key3];
  return value != null ? String(value) : "";
}
function derive_id(uid, salt) {
  return createHash3("md5").update(`${salt}:${uid || "anonymous"}`).digest("hex").slice(0, 36);
}
function build_chat_headers(token, region, uid, domain, enterprise_id) {
  const realm = normalize_region2(region);
  const cfg = IDENTITY_VERSIONS[realm];
  const origin = REGION_BASES2[realm];
  const effectiveDomain = domain || (realm === "cn" ? "copilot.tencent.com" : "www.workbuddy.ai");
  const effectiveUid = uid || jwt_claim(token, "sub") || "anonymous";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    Origin: origin,
    Referer: `${origin}/`,
    "X-CodeBuddy-Request": "1",
    "Accept-Language": realm === "cn" ? "zh-CN" : "en-US",
    "X-Agent-Purpose": "conversation",
    "X-IDE-Name": "WorkBuddy",
    "X-IDE-Type": "WorkBuddy",
    "X-IDE-Version": cfg.ide,
    "X-Product": "WorkBuddy",
    "X-Domain": effectiveDomain,
    "User-Agent": cfg.ua,
    "X-User-Id": effectiveUid,
    Authorization: `Bearer ${token}`,
    "X-Request-ID": `${derive_id(effectiveUid, "req")}-${String(Date.now() % 1e6).padStart(6, "0")}`,
    "X-Machine-ID": derive_id(effectiveUid, "machine"),
    "X-Session-ID": derive_id(effectiveUid, "session")
  };
  if (enterprise_id) {
    headers["X-Enterprise-Id"] = enterprise_id;
    headers["X-Tenant-Id"] = enterprise_id;
  }
  return headers;
}
function build_refresh_headers(refresh_token) {
  return {
    "Content-Type": "application/json",
    "X-Refresh-Token": refresh_token
  };
}
function parse_refresh_response2(body) {
  if (!body || typeof body !== "object") {
    throw new UpstreamError2("bad_request", "\u5237\u65B0\u5E94\u7B54\u683C\u5F0F\u9519\u8BEF", false, 400);
  }
  const code = body["code"];
  if (code !== 0) {
    const msg = body["message"] ?? "\u672A\u77E5\u9519\u8BEF";
    throw new UpstreamError2("auth", `\u5237\u65B0\u5931\u8D25: ${msg}`, false, 401);
  }
  const data = body["data"];
  if (!data) {
    throw new UpstreamError2("bad_request", "\u5237\u65B0\u5E94\u7B54\u7F3A\u5C11 data", false, 400);
  }
  const accessToken = data["accessToken"];
  if (!accessToken) {
    throw new UpstreamError2("bad_request", "\u5237\u65B0\u5E94\u7B54\u7F3A\u5C11 accessToken", false, 400);
  }
  const expiresIn = data["expiresIn"];
  const expiresAt = expiresIn != null ? Math.floor(Date.now() / 1e3) + expiresIn : Number.POSITIVE_INFINITY;
  const refreshToken = data["refreshToken"];
  return {
    accessToken,
    expiresAt,
    refreshToken
  };
}
function classify_workbuddy_error(httpStatus, body) {
  const original = upstreamRawResponse(httpStatus, body);
  const detail2 = workbuddyErrorDetail(body);
  if (typeof detail2.code === "number") {
    if (detail2.code === 11128) {
      return new UpstreamError2(
        "bad_request",
        `\u6E20\u9053\u6821\u9A8C\u62E6\u622A(code 11128)${detail2.text ? `:${detail2.text}` : ""}`,
        false,
        httpStatus,
        void 0,
        original
      );
    }
    if (detail2.code === 11140) {
      return new UpstreamError2(
        "auth",
        `\u8D26\u53F7\u5B58\u5728\u5F02\u5E38\u884C\u4E3A,\u5DF2\u88AB\u9650\u5236\u4F7F\u7528(code 11140)${detail2.text ? `:${detail2.text}` : ""}`,
        false,
        httpStatus,
        void 0,
        original
      );
    }
  }
  const raw = workbuddySnippet(body);
  const withRaw = (text) => raw === "" ? text : `${text} \u2014 \u4E0A\u6E38:${raw}`;
  if (httpStatus === 401 || httpStatus === 403) {
    return new UpstreamError2("auth", withRaw("\u8BA4\u8BC1\u5931\u8D25"), false, httpStatus, void 0, original);
  }
  if (httpStatus === 429) {
    const retryAfter = workbuddyResetAfter(body);
    return new UpstreamError2("rate_limit", withRaw("\u4E0A\u6E38\u9650\u6D41"), true, 429, retryAfter, original);
  }
  if (httpStatus >= 500) {
    return new UpstreamError2("upstream", withRaw("\u4E0A\u6E38\u9519\u8BEF"), true, httpStatus, void 0, original);
  }
  if (httpStatus >= 400) {
    return new UpstreamError2("bad_request", withRaw("\u8BF7\u6C42\u9519\u8BEF"), false, httpStatus, void 0, original);
  }
  return new UpstreamError2("upstream", withRaw("\u672A\u77E5\u9519\u8BEF"), true, httpStatus, void 0, original);
}
function workbuddySnippet(body) {
  const detail2 = workbuddyErrorDetail(body);
  const raw = detail2.text !== "" ? detail2.text : JSON.stringify(body ?? "");
  return String(raw).replace(/\s+/g, " ").trim().slice(0, 200);
}
function workbuddyErrorDetail(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { code: null, text: "" };
  }
  const b = body;
  const rawCode = b["code"];
  const code = typeof rawCode === "number" ? rawCode : typeof rawCode === "string" && /^\d+$/.test(rawCode) ? Number(rawCode) : null;
  const displayMsg = b["displayMsg"];
  const dm = displayMsg !== null && typeof displayMsg === "object" && !Array.isArray(displayMsg) ? displayMsg : null;
  const dmZh = dm?.["zh"];
  const text = [dmZh, b["msg"], b["message"]].find((v) => typeof v === "string" && v.trim() !== "");
  return { code, text: text?.trim() ?? "" };
}
function workbuddyResetAfter(body) {
  const detail2 = workbuddyErrorDetail(body);
  if (detail2.text === "") return void 0;
  const m = /将在\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s*(UTC([+-]\d{1,2})(?::(\d{2}))?)?\s*重置/.exec(detail2.text);
  if (!m) return void 0;
  const date = m[1];
  const time = m[2];
  const tzSign = m[4];
  const tzMin = m[5];
  let iso;
  if (tzSign !== void 0) {
    const sign = tzSign[0];
    const hh = tzSign.slice(1).padStart(2, "0");
    const mm = tzMin ?? "00";
    iso = `${date}T${time}${sign}${hh}:${mm}`;
  } else {
    iso = `${date}T${time}`;
  }
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return void 0;
  const secs = Math.ceil((at - Date.now()) / 1e3);
  return secs >= 0 ? secs : 0;
}
function asOptionalString(v) {
  if (typeof v === "string" && v.trim() !== "") return v;
  return void 0;
}
var WorkbuddyAdapter = class {
  vendorId = "workbuddy";
  async getToken(creds) {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      throw new UpstreamError2("auth", "[workbuddy] \u7F3A\u5C11 api_key", false, 401);
    }
    return {
      accessToken: apiKey,
      expiresAt: Number.POSITIVE_INFINITY
    };
  }
  decorateRequest(base, token, creds) {
    const region = (creds?.region && creds.region.trim() ? creds.region : void 0) ?? detect_region_from_token(token.accessToken);
    const uid = asOptionalString(creds?.["uid"]);
    const domain = asOptionalString(creds?.["domain"]);
    const enterpriseId = asOptionalString(creds?.["enterprise_id"]);
    return {
      ...base,
      headers: {
        ...base.headers,
        ...build_chat_headers(token.accessToken, region, uid, domain, enterpriseId)
      }
    };
  }
  classifyError(httpStatus, body) {
    return classify_workbuddy_error(httpStatus, body);
  }
};

// ../core/src/connectors/sensenova-usage.ts
var DEFAULT_BASE_URL = "https://token.sensenova.cn/v1";
var PLATFORM_BASE = "https://platform.sensenova.cn";
var POOL_USAGE_URL = `${PLATFORM_BASE}/lite/console/v1/tokenplan/pool-usage`;
var ATTR_RPM = "rpm_exhausted";
var ATTR_SHARED = "shared_or_transient";
var ATTR_UNKNOWN = "unknown";
var POOL_SATURATED = "pool_saturated";
var POOL_EXHAUSTED = "pool_exhausted";
var CODE_SHARED_RE = /429003|tpm\/rpm\s+limit/i;
var CODE_RPM_RE = /code["\s:=]+8\b|rpm\s+exhausted/i;
function classify_rate_limit(body) {
  const text = body || "";
  if (CODE_SHARED_RE.test(text)) {
    return ATTR_SHARED;
  }
  if (CODE_RPM_RE.test(text)) {
    return ATTR_RPM;
  }
  return ATTR_UNKNOWN;
}
function billable_tokens(usage) {
  if (!usage || typeof usage !== "object") {
    return 0;
  }
  const u = usage;
  const prompt = Number(u["prompt_tokens"] ?? 0);
  const details = u["prompt_tokens_details"];
  const cached = details && typeof details === "object" ? Number(details["cached_tokens"] ?? 0) : 0;
  const completion = Number(u["completion_tokens"] ?? 0);
  return Math.max(0, prompt - cached) + completion;
}
function sensenova_username(name2) {
  return name2.replace(/^sensenova-/, "");
}
function numOrNull(value) {
  if (value === null || value === void 0 || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : null;
}
function toEpochSeconds(value) {
  const n = numOrNull(value);
  if (n === null) return null;
  if (n === 0) return null;
  return n >= 1e11 ? Math.round(n / 1e3) : n;
}
function intRound(value) {
  return value === null ? null : Math.round(value);
}
function windowOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const w = raw;
  const limit = numOrNull(w["limit"]);
  const used = numOrNull(w["used"] ?? w["used_tokens"]);
  const givenRemain = numOrNull(w["remaining"] ?? w["remain"]);
  const remaining = givenRemain !== null ? givenRemain : limit !== null && used !== null ? Math.max(0, limit - used) : null;
  return {
    limit,
    used,
    remaining,
    reset_at: toEpochSeconds(w["reset_at"])
  };
}
function parse_pool_usage(data) {
  const root = data && typeof data === "object" ? data : {};
  const planRaw = root["plan"] && typeof root["plan"] === "object" ? root["plan"] : {};
  const poolsRaw = root["pools"];
  const poolList = Array.isArray(poolsRaw) ? poolsRaw : poolsRaw && typeof poolsRaw === "object" ? Object.values(poolsRaw) : [];
  const pools = [];
  let grantKnown = false;
  let grantSum = 0;
  let weekLimit = 0;
  let weekRemaining = 0;
  let weekFound = false;
  for (const item of poolList) {
    if (!item || typeof item !== "object") continue;
    const pool = item;
    const typeRaw = typeof pool["pool_type"] === "string" ? pool["pool_type"].trim() : "";
    const nameRaw = typeof pool["name"] === "string" && pool["name"].trim() !== "" ? pool["name"].trim() : typeRaw !== "" ? typeRaw : "(\u672A\u547D\u540D)";
    const grant = intRound(numOrNull(pool["grant_balance"]));
    if (grant !== null) {
      grantKnown = true;
      grantSum += grant;
    }
    const w5 = windowOf(pool["window_5h"]);
    const w7 = windowOf(pool["window_7d"]);
    const week = w7 ?? w5;
    if (week) {
      if (week.limit !== null) weekLimit += week.limit;
      if (week.remaining !== null) {
        weekRemaining += week.remaining;
        weekFound = true;
      }
    } else {
      const fallbackLimit = numOrNull(pool["week_limit"]);
      const fallbackRemain = numOrNull(pool["week_balance"] ?? pool["week_remaining"]);
      if (fallbackLimit !== null) weekLimit += fallbackLimit;
      if (fallbackRemain !== null) {
        weekRemaining += fallbackRemain;
        weekFound = true;
      }
    }
    pools.push({
      pool_type: typeRaw !== "" ? typeRaw : nameRaw,
      pool_name: nameRaw,
      grant_balance: grant,
      grant_expiry: toEpochSeconds(pool["nearest_grant_expiry"]),
      // 在途发放**不取整**(collector 同款):round(0.53)=1 会凭空造数字。
      grant_expiring_balance: numOrNull(pool["nearest_grant_expiring_balance"]),
      w5,
      w7
    });
  }
  const grantTotal = grantKnown ? grantSum : null;
  const remaining = grantKnown || weekFound ? Math.round((grantTotal ?? 0) + weekRemaining) : null;
  const limit = weekLimit > 0 ? Math.round(weekLimit) : null;
  return {
    plan_name: typeof planRaw["name"] === "string" ? planRaw["name"] : null,
    plan_type: typeof planRaw["type"] === "string" ? planRaw["type"] : null,
    pools,
    grant_total: grantTotal,
    grant_known: grantKnown,
    remaining,
    limit
  };
}
function jwt_expiry_epoch_s(token) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const exp = payload["exp"];
  const n = Number(exp);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ../core/src/connectors/sensenova-pool.ts
import { createHash as createHash4 } from "node:crypto";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
var BILLABLE_WINDOW_S = 60;
var COOLDOWN_ON_HOLD = 5;
var ACCOUNT_WAIT_BUDGET_S = 100;
var SensenovaAccountRuntime = class {
  /** 60s 窗口内的 `(ts, billable)` 序列。 */
  spend = [];
  requests = 0;
  errors = 0;
  lastTtftMs = 0;
  lastUsedAt = 0;
  /** 模型 → 冷却截止(ms epoch)。键 `""` = 账号级兜底格。 */
  cooldownUntil = /* @__PURE__ */ new Map();
  /** 模型 → 冷却原因(上游报文摘要,已压白)。 */
  cooldownReason = /* @__PURE__ */ new Map();
  /** 单账号单并发:当前在途请求数(连接器内部,不经 router 账本)。 */
  inflight = 0;
  /** 账号名(池内;池外 adhoc 为 key 摘要)。**不进 snapshot**。 */
  name = "";
  /**
   * 该账号的 api_key(**进程内使用;绝不进 snapshot / 日志**)。
   *
   * 挂在运行态上而不是回头查池:池外 adhoc 账号不在 `pool.keys` 里,
   * 用 `pool.keyOf(name)` 会拿到空串 → Authorization 空 Bearer → 上游 401。
   */
  key = "";
  /**
   * 该账号的**钉连接**池(对应 Nexus `AccountRuntime._clients`)。
   *
   * ⚠️ **前缀缓存亲和的关键**(2026-10-24 用户定案,m06730② 真根因之一):
   * 上游的前缀缓存按 1024-token 块存放在**推理节点本地**,而请求落到哪个节点
   * 由 TCP 连接决定。用 Node 默认的 `fetch`(undici 全局连接池)时,每账号的
   * 请求会在池里的多条连接间轮转 → 落到不同节点 → 缓存块丢一半。
   *
   * Nexus `sensenova.py` 的解法:每账号一条
   * `httpx.Limits(max_connections=1, max_keepalive_connections=1)` 的 client,
   * 单条 keep-alive 连接顺序请求 → 稳定命中同一个节点。
   *
   * 这里用 `node:https.Agent({ keepAlive: true, maxSockets: 1 })` 达到同样效果
   * (不引入 undici 依赖;`maxSockets: 1` 即「该 agent 下最多一条在途连接」)。
   *
   * 实测(同一前缀 4092 token,间隔 6s 连打):
   * - 裸 fetch: `cached` 在 3072 / 2048 之间抖动(换节点),首字 6s → 29s;
   * - 钉连接: 稳定 3072,首字 0.8s。
   */
  pinnedAgent = null;
  /** 取(必要时创建)该账号的钉连接 agent。 */
  pinnedHttpAgent() {
    if (this.pinnedAgent === null) {
      this.pinnedAgent = new HttpsAgent({
        keepAlive: true,
        maxSockets: 1,
        // 单账号单并发:一条连接串行,节点亲和
        maxFreeSockets: 1,
        timeout: 9e5
        // 对齐 Nexus read_timeout=900s(长回答)
      });
    }
    return this.pinnedAgent;
  }
  /** 释放钉连接(账号被移除 / 进程收尾时调,避免 socket 泄漏)。 */
  closePinnedAgent() {
    if (this.pinnedAgent !== null) {
      this.pinnedAgent.destroy();
      this.pinnedAgent = null;
    }
  }
  /** 记一笔可计费消耗(成功后调用;命中 prompt cache 的不计)。 */
  recordSpend(tokens, now) {
    if (!(tokens > 0)) return;
    this.spend.push({ t: now, n: tokens });
    this.lastUsedAt = now;
  }
  /** 窗口内可计费 token 总和。 */
  billableInWindow(now) {
    const cutoff = now - BILLABLE_WINDOW_S * 1e3;
    let drop = 0;
    while (drop < this.spend.length && this.spend[drop].t < cutoff) drop += 1;
    if (drop > 0) this.spend.splice(0, drop);
    let sum = 0;
    for (const e of this.spend) sum += e.n;
    return sum;
  }
  recordOutcome(ok2, ttftMs, now) {
    this.requests += 1;
    this.lastUsedAt = now;
    if (ok2) {
      if (ttftMs > 0) this.lastTtftMs = ttftMs;
    } else {
      this.errors += 1;
    }
  }
  /**
   * 给 (账号, 模型) 这一格降温 —— **取 max 不覆盖**。
   *
   * 同号硬等会反复写这一格(每次 `COOLDOWN_ON_HOLD`);取 max 是为了别让后写
   * 的短值把更长的退避抹短。⚠️ 模型格**纯展示**,不参与选号(用户 m23215:
   * 不同模型可以用同一个账号)。
   */
  coolFor(seconds, reason, model, now) {
    const key3 = model || "";
    const until = now + seconds * 1e3;
    const prev = this.cooldownUntil.get(key3) ?? 0;
    if (until > prev) {
      this.cooldownUntil.set(key3, until);
      this.cooldownReason.set(key3, reason);
    }
  }
  /**
   * 给**整个账号**降温(键 `""`)—— 新会话选号时跳过它(用户 m23215)。
   *
   * 只在「同号等待预算耗尽、这个号确实在限流」时才写:已粘住的会话不受影响
   * (粘性期内不换号),之后的新会话挑空闲号时会跳过它,直到冷却过期。
   */
  coolAccountFor(seconds, reason, now) {
    this.coolFor(seconds, reason, "", now);
  }
  isCooling(model, now) {
    return (this.cooldownUntil.get(model || "") ?? 0) > now;
  }
  /**
   * 账号级是否冷却中 —— **新会话选号**的判据。
   *
   * ⚠️ 不看模型:`isCooling(model)` 只作面板展示,选号一律走这一条
   * (用户 m23215:不同模型可以用同一个账号)。
   */
  isAccountCooling(now) {
    return this.isCooling("", now);
  }
  coolingRemaining(model, now) {
    const until = this.cooldownUntil.get(model || "") ?? 0;
    return until > now ? Math.ceil((until - now) / 1e3) : 0;
  }
  snapshot() {
    const now = Date.now();
    return {
      requests: this.requests,
      errors: this.errors,
      last_ttft_ms: this.lastTtftMs || null,
      last_used_at: this.lastUsedAt || null,
      cooldown_models: [...this.cooldownUntil.entries()].filter(([, until]) => until > now).map(([model, until]) => ({
        model: model || null,
        remaining_s: Math.ceil((until - now) / 1e3),
        reason: this.cooldownReason.get(model) ?? null
      }))
    };
  }
};
var SensenovaAccountPool = class {
  runtimes = /* @__PURE__ */ new Map();
  /** `username → api_key`(凭据投影,`setAccounts` 时重建)。 */
  keys = /* @__PURE__ */ new Map();
  setAccounts(accounts) {
    const seen = /* @__PURE__ */ new Set();
    const nextKeys = /* @__PURE__ */ new Map();
    for (const a of accounts) {
      if (!a.api_key) continue;
      let name2 = a.username || "?";
      while (seen.has(name2)) name2 = `${name2}#2`;
      seen.add(name2);
      nextKeys.set(name2, a.api_key);
      let rt = this.runtimes.get(name2);
      if (!rt) {
        rt = new SensenovaAccountRuntime();
        rt.name = name2;
        this.runtimes.set(name2, rt);
      }
      rt.key = a.api_key;
    }
    for (const name2 of [...this.runtimes.keys()]) {
      if (!seen.has(name2)) this.runtimes.delete(name2);
    }
    this.keys.clear();
    for (const [k, v] of nextKeys) this.keys.set(k, v);
  }
  get size() {
    return this.runtimes.size;
  }
  names() {
    return [...this.runtimes.keys()];
  }
  runtime(name2) {
    const rt = this.runtimes.get(name2);
    if (!rt) throw new Error(`sensenova \u8D26\u53F7\u6C60\u91CC\u6CA1\u6709 ${name2}`);
    return rt;
  }
  /** 网关注入的 api_key 属池 → 返回账号名(不在池返回 `null`)。 */
  nameByKey(apiKey) {
    if (!apiKey) return null;
    for (const [name2, key3] of this.keys) {
      if (key3 === apiKey) return name2;
    }
    return null;
  }
  /** 账号名 → api_key(**进程内使用;绝不进 snapshot / 日志**)。 */
  keyOf(name2) {
    return this.keys.get(name2) ?? "";
  }
  /** 账号池快照(**不含明文 key**)—— 面板 / 日志唯一出口。 */
  snapshot() {
    const out = {};
    for (const [name2, rt] of this.runtimes) out[name2] = rt.snapshot();
    return out;
  }
};
function sensenovaKeyFingerprint(apiKey) {
  return createHash4("sha256").update(apiKey).digest("hex").slice(0, 12);
}
function sensenovaSnippet(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return text.replace(/\s+/g, " ").slice(0, 160);
}
function pinnedPostJson(url, headers, payload, agent, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UpstreamError2("connection", "\u5BA2\u6237\u7AEF\u65AD\u5F00", false, 499));
      return;
    }
    const req = httpsRequest(
      url,
      {
        method: "POST",
        agent,
        headers: {
          ...headers,
          "Content-Length": String(Buffer.byteLength(payload))
        }
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const body = Readable.toWeb(res);
        const outHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) for (const one of v) outHeaders.append(k, one);
          else if (v !== void 0) outHeaders.set(k, String(v));
        }
        resolve(
          new Response(body, {
            status,
            statusText: res.statusMessage ?? "",
            headers: outHeaders
          })
        );
      }
    );
    req.on("error", (err) => {
      const aborted = signal?.aborted === true;
      reject(
        aborted ? new UpstreamError2("connection", "\u5BA2\u6237\u7AEF\u65AD\u5F00", false, 499) : new UpstreamError2("connection", `\u4E0A\u6E38\u8FDE\u63A5\u5931\u8D25:${err.message}`, true, 502)
      );
    });
    if (signal) {
      const onAbort = () => {
        req.destroy(new Error("aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      req.on("close", () => signal.removeEventListener("abort", onAbort));
    }
    req.end(payload);
  });
}

// ../core/src/connectors/sensenova-auth.ts
import {
  createCipheriv as createCipheriv2,
  createHash as createHash5,
  createPublicKey,
  publicEncrypt,
  randomBytes as randomBytes2
} from "node:crypto";
var IAM_BASE = "https://iam.sensecoreapi.cn";
var OIDC_AUTH = "https://platform.sensenova.cn/oauth2/auth";
var OIDC_TOKEN = "https://signin.sensecore.cn/oauth2/token";
var JWKS_URL = "https://signin.sensecore.cn/.well-known/jwks.json";
var APIKEYS_URL = `${IAM_BASE}/iam/idp/v1/apiKeys`;
var SENSENOVA_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
var CLIENT_ID = "nova";
var REDIRECT_URI = "https://platform.sensenova.cn";
var SCOPE = "openid offline offline_access";
var JWKS_KID = "public:hydra.openid.id-token";
function pkce() {
  const verifier = base64url(randomBytes2(32));
  const challenge = base64url(createHash5("sha256").update(verifier, "ascii").digest());
  return { verifier, challenge };
}
function encrypt_password_jwe(password, jwk) {
  const modulus = Buffer.from(jwk.n, "base64url");
  const exponent = Buffer.from(jwk.e, "base64url");
  const publicKey = createPublicKey({
    key: {
      kty: "RSA",
      n: modulus.toString("base64url"),
      e: exponent.toString("base64url")
    },
    format: "jwk"
  });
  const protectedHeader = { alg: "RSA-OAEP", enc: "A256GCM" };
  const protectedB64 = base64url(
    Buffer.from(JSON.stringify(protectedHeader), "utf-8")
  );
  const cek = randomBytes2(32);
  const iv = randomBytes2(12);
  const encryptedKey = publicEncrypt(
    {
      key: publicKey,
      padding: 4,
      // RSA_PKCS1_OAEP_PADDING
      oaepHash: "sha1"
    },
    cek
  );
  const cipher = createCipheriv2("aes-256-gcm", cek, iv);
  cipher.setAAD(Buffer.from(protectedB64, "utf-8"));
  const ciphertext = Buffer.concat([
    cipher.update(password, "utf-8"),
    cipher.final()
  ]);
  const tagBytes = cipher.getAuthTag();
  return [
    protectedB64,
    base64url(encryptedKey),
    base64url(iv),
    base64url(ciphertext),
    base64url(tagBytes)
  ].join(".");
}
function base64url(buf) {
  return buf.toString("base64url");
}
var SensenovaAuthFlow = class {
  constructor(fetchFn = fetch) {
    this.fetchFn = fetchFn;
  }
  fetchFn;
  jwks = null;
  jwtCache = /* @__PURE__ */ new Map();
  /**
   * refresh_token 缓存(`username → token`)。
   *
   * ⚠️ 登录时申请的 scope 含 `offline_access`,所以平台会**同时**发一个
   * refresh_token 出来。它的用处:控制台 JWT 只有约 3 小时有效期,到期后
   * 常规恢复路径是「用密码重新登录一遍」—— 但那要求用户把密码**明文**留在
   * 机器上。有 refresh_token 就不需要:拿它换一个新的 JWT 即可,密码可以不留。
   *
   * 上游没发 refresh_token 时这里就是空的,行为回落到「用密码重登」。
   */
  refreshTokenCache = /* @__PURE__ */ new Map();
  /**
   * 账号密码 → JWT（3h）。
   *
   * ⚠️ 每次登录用**独立的新 client**（登录完关闭）：平台把 OAuth 会话
   * 粘在连接上，复用单例 client 跨账号连续登录时会失败。
   */
  async login(account, username, password) {
    const name2 = sensenova_username(account) || sensenova_username(username);
    if (!username || !password) {
      throw new UpstreamError2("auth", "\u767B\u5F55\u9700\u8981 username \u4E0E password", false, 401);
    }
    const { verifier, challenge } = pkce();
    const state = base64url(randomBytes2(16));
    const jar = new CookieJar();
    const authUrl = `${OIDC_AUTH}?client_id=${CLIENT_ID}&code_challenge=${challenge}&code_challenge_method=S256&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE.replace(/ /g, "%20")}&state=${state}`;
    const challengeUrl = await this._followUntil(
      authUrl,
      (u) => u.includes("login_challenge="),
      8,
      jar
    );
    const url = new URL(challengeUrl);
    const loginChallenge = url.searchParams.get("login_challenge");
    if (!loginChallenge) {
      throw new UpstreamError2("auth", "\u672A\u80FD\u89E3\u6790 login_challenge", false, 401);
    }
    const jwk = await this._pubkey();
    const encrypted = encrypt_password_jwe(password, jwk);
    const loginHeaders = {
      "Content-Type": "application/json",
      Origin: "https://platform.sensenova.cn",
      Referer: "https://platform.sensenova.cn/",
      "User-Agent": SENSENOVA_UA,
      Accept: "*/*"
    };
    const loginCookie = jar.header();
    if (loginCookie) loginHeaders["Cookie"] = loginCookie;
    const loginResp = await this.fetchFn(`${IAM_BASE}/iam/authn/v1/auth/nova/login`, {
      method: "POST",
      headers: loginHeaders,
      body: JSON.stringify({
        username,
        password: encrypted,
        challenge: loginChallenge,
        is_encrypt: true
      })
    });
    jar.absorb(loginResp);
    const loginBody = await loginResp.json();
    const redirect = loginBody["redirect"];
    if (!redirect) {
      const msg = loginBody["message"] ?? loginBody["error"] ?? "\u65E0 redirect \u5B57\u6BB5";
      throw new UpstreamError2("auth", `\u767B\u5F55\u5931\u8D25: ${msg}`, false, 401);
    }
    const codeUrl = await this._followUntil(redirect, (u) => u.includes("code="), 8, jar);
    const codeParsed = new URL(codeUrl);
    const code = codeParsed.searchParams.get("code");
    if (!code) {
      throw new UpstreamError2("auth", "\u672A\u80FD\u4ECE\u56DE\u8C03\u5730\u5740\u89E3\u6790 code", false, 401);
    }
    const tokenResp = await this.fetchFn(OIDC_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": SENSENOVA_UA
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPE
      })
    });
    const token = await tokenResp.json();
    const access = token["access_token"];
    if (!access) {
      const err = token["error_description"] ?? token["error"] ?? "\u672A\u77E5";
      throw new UpstreamError2("auth", `\u672A\u8FD4\u56DE access_token: ${err}`, false, 401);
    }
    this.jwtCache.set(sensenova_username(account), access);
    const refresh = token["refresh_token"];
    if (typeof refresh === "string" && refresh !== "") {
      this.refreshTokenCache.set(sensenova_username(account), refresh);
    }
    return access;
  }
  /** 本次登录拿到的 refresh_token(没有则 undefined)。 */
  refreshTokenFor(account) {
    return this.refreshTokenCache.get(sensenova_username(account));
  }
  /**
   * 用 refresh_token 换一个新的控制台 JWT —— **不需要密码**。
   *
   * ⚠️ 为什么要有这条路:控制台 JWT 约 3 小时过期,常规恢复是「用存下来的密码
   * 重新登录一遍」。那要求用户把**明文密码**留在机器上;而 refresh_token 是
   * 平台专门为「离线续期」发的凭证(scope 里就写了 `offline_access`),用它换
   * JWT 既安全又省一次风控敏感的登录。
   *
   * 平台没发 refresh_token / 它已失效 → 抛 `auth` 错,调用方回落到「用密码重登」。
   */
  async refreshConsoleJwt(account, refreshToken) {
    if (!refreshToken) {
      throw new UpstreamError2("auth", "\u6CA1\u6709 refresh_token", false, 401);
    }
    const resp = await this.fetchFn(OIDC_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPE
      })
    });
    const token = await resp.json();
    const access = token["access_token"];
    if (!access) {
      const err = token["error_description"] ?? token["error"] ?? "\u672A\u77E5";
      throw new UpstreamError2("auth", `\u5237\u65B0 JWT \u5931\u8D25: ${err}`, false, 401);
    }
    this.jwtCache.set(sensenova_username(account), access);
    const next = token["refresh_token"];
    if (typeof next === "string" && next !== "") {
      this.refreshTokenCache.set(sensenova_username(account), next);
    }
    return access;
  }
  /**
   * 用 JWT 枚举账号 API key（明文 sk-），返回 `(key, 总数)`。
   */
  async fetch_api_key(account) {
    const jwt = this.jwtCache.get(sensenova_username(account));
    if (!jwt) {
      throw new UpstreamError2("auth", `\u8D26\u53F7 ${account} \u6CA1\u6709\u53EF\u7528 JWT`, false, 401);
    }
    const resp = await this.fetchFn(`${APIKEYS_URL}?page_size=100`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console"
      }
    });
    if (resp.status !== 200) {
      throw new UpstreamError2("auth", `apiKeys \u62C9\u53D6\u5931\u8D25 HTTP ${resp.status}`, false, resp.status);
    }
    const body = await resp.json();
    const keys = body["api_keys"] ?? [];
    const enabled = keys.filter(
      (k) => k["status"] === "enabled" && k["api_key"]
    );
    const picked = enabled.find((k) => k["type"] === "nova.tokenplan.v1") ?? enabled[0];
    if (!picked) {
      throw new UpstreamError2("auth", "\u8D26\u53F7\u4E0B\u6CA1\u6709\u53EF\u7528\u7684 API key", false, 401);
    }
    return {
      apiKey: picked["api_key"],
      total: keys.length
    };
  }
  /**
   * 用 JWT 列出现有 API key(**不含** api_key 明文之外的筛选)。
   *
   * 与 {@link fetch_api_key} 的区别:这里把每一把都交出去(含 id / status /
   * 是否默认),交给装配层判断「有没有、能不能用」。创建前的探查与创建后的
   * 核对都用它 —— 网关不该为「列一把」和「列全部」各写一个接口。
   */
  async list_api_keys(account) {
    const jwt = this.jwtCache.get(sensenova_username(account));
    if (!jwt) {
      throw new UpstreamError2("auth", `\u8D26\u53F7 ${account} \u6CA1\u6709\u53EF\u7528 JWT`, false, 401);
    }
    const resp = await this.fetchFn(`${APIKEYS_URL}?page_size=100`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console"
      }
    });
    if (resp.status !== 200) {
      throw new UpstreamError2("auth", `apiKeys \u62C9\u53D6\u5931\u8D25 HTTP ${resp.status}`, false, resp.status);
    }
    const body = await resp.json();
    const raw = body["api_keys"] ?? [];
    return raw.map((k) => ({
      id: typeof k["id"] === "string" ? k["id"] : "",
      displayname: typeof k["displayname"] === "string" ? k["displayname"] : "",
      api_key: typeof k["api_key"] === "string" ? k["api_key"] : "",
      status: typeof k["status"] === "string" ? k["status"] : "",
      type: typeof k["type"] === "string" ? k["type"] : "",
      is_default: k["is_default"] === true
    }));
  }
  /**
   * 用 JWT 新建一把 API key,返回**明文 sk-**(平台只在创建响应里给一次)。
   *
   * ⚠️ 字段名是 `displayname`(不是 `name`):上游 400 会明说
   * `invalid APIKey.Displayname`,用 `name` 一律被拒。
   * ⚠️ 上游不认 `type` / `content`,创建的 key `type` 为空串 —— 所以
   * {@link fetch_api_key} 里「优先 type=nova.tokenplan.v1」的选择逻辑在新 key
   * 上不生效,但仍能取到(回落 `enabled[0]`)。
   */
  async create_api_key(account, displayname) {
    const jwt = this.jwtCache.get(sensenova_username(account));
    if (!jwt) {
      throw new UpstreamError2("auth", `\u8D26\u53F7 ${account} \u6CA1\u6709\u53EF\u7528 JWT`, false, 401);
    }
    const name2 = displayname && displayname.trim() !== "" ? displayname.trim().slice(0, 64) : `as-one-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`;
    const resp = await this.fetchFn(APIKEYS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console"
      },
      body: JSON.stringify({ displayname: name2 })
    });
    if (resp.status !== 200) {
      const text = await resp.text().catch(() => "");
      throw new UpstreamError2(
        "auth",
        `\u521B\u5EFA API key \u5931\u8D25 HTTP ${resp.status}${text ? `: ${sensenovaSnippet(text)}` : ""}`,
        false,
        resp.status
      );
    }
    const body = await resp.json();
    const key3 = body["api_key"];
    if (typeof key3 !== "string" || key3 === "") {
      throw new UpstreamError2("auth", "\u521B\u5EFA\u6210\u529F\u4F46\u54CD\u5E94\u91CC\u6CA1\u6709 api_key", false, 502);
    }
    return key3;
  }
  /**
   * 删掉一把 API key(按 id)。
   *
   * 平台对「遗失的 key」的处置就是删除重建,所以清理失败的那把是正道 ——
   * 但删不掉不能算致命:旧 key 留在账号下不影响新 key 可用,如实抛给上层
   * 让它决定要不要继续。
   */
  async delete_api_key(account, id) {
    if (!id) return;
    const jwt = this.jwtCache.get(sensenova_username(account));
    if (!jwt) {
      throw new UpstreamError2("auth", `\u8D26\u53F7 ${account} \u6CA1\u6709\u53EF\u7528 JWT`, false, 401);
    }
    const resp = await this.fetchFn(`${APIKEYS_URL}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console"
      }
    });
    if (resp.status !== 200) {
      const text = await resp.text().catch(() => "");
      throw new UpstreamError2(
        "auth",
        `\u5220\u9664 API key \u5931\u8D25 HTTP ${resp.status}${text ? `: ${sensenovaSnippet(text)}` : ""}`,
        false,
        resp.status
      );
    }
  }
  /**
   * 「确保有一把能用的 key」—— 自愈链的收口。
   *
   * 与 {@link ensure_api_key} 的区别:除了新建,还会**把无效的旧 key 删掉**。
   * 平台对「遗失/失效的 key」的处置就是删除重建,留着旧 key 只是占位
   * (列表里它仍然 `enabled`,下次 ensure 又会挑到它 —— 死循环)。
   *
   * 顺序:
   * 1. 列出全部,挑 enabled(优先套餐那把);
   * 2. 一把都没有 → 新建;
   * 3. `dropIds` 里点名的旧 key → 建完新的再删(先建后删,绝不出现
   *    「删了但没建成」的窗口);删不掉不算失败,回执里如实说。
   */
  async ensure_api_key_replacing(account, dropIds = [], displayname) {
    const keys = await this.list_api_keys(account);
    const enabled = keys.filter((k) => k.status === "enabled" && k.api_key !== "");
    const picked = enabled.find((k) => k.type === "nova.tokenplan.v1") ?? enabled[0];
    if (picked && dropIds.length === 0) {
      return { apiKey: picked.api_key, total: keys.length, created: false, dropped: [] };
    }
    const apiKey = await this.create_api_key(account, displayname);
    const dropped = [];
    for (const id of dropIds) {
      try {
        await this.delete_api_key(account, id);
        dropped.push(id);
      } catch {
      }
    }
    const after = await this.list_api_keys(account).catch(() => []);
    return { apiKey, total: after.length || keys.length + 1, created: true, dropped };
  }
  async ensure_api_key(account, displayname) {
    const keys = await this.list_api_keys(account);
    const enabled = keys.filter((k) => k.status === "enabled" && k.api_key !== "");
    const picked = enabled.find((k) => k.type === "nova.tokenplan.v1") ?? enabled[0];
    if (picked) {
      return { apiKey: picked.api_key, total: keys.length, created: false };
    }
    const apiKey = await this.create_api_key(account, displayname);
    const after = await this.list_api_keys(account).catch(() => keys);
    return { apiKey, total: after.length + 1, created: true };
  }
  /** 获取缓存的 JWT */
  jwtFor(account) {
    return this.jwtCache.get(sensenova_username(account));
  }
  /**
   * 拉取控制台积分池用量(pool-usage)。
   *
   * `jwt` 可不传:优先用显式传入的 JWT,否则回落本实例登录时缓存的 JWT
   * (登录后同一实例直接调用即可)。响应体原样返回,解析交给
   * {@link parse_pool_usage}(纯函数,层间解耦)。
   */
  async fetch_pool_usage(account, jwt) {
    const token = jwt ?? this.jwtCache.get(sensenova_username(account));
    if (!token) {
      throw new UpstreamError2("auth", `\u8D26\u53F7 ${account} \u6CA1\u6709\u53EF\u7528 JWT`, false, 401);
    }
    const resp = await this.fetchFn(POOL_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console",
        "User-Agent": SENSENOVA_UA
      }
    });
    if (resp.status >= 400) {
      throw new UpstreamError2("auth", `sensenova \u79EF\u5206\u6C60\u63A5\u53E3 HTTP ${resp.status}`, false, resp.status);
    }
    return resp.json();
  }
  /** 拉取 JWKS 公钥 */
  async _pubkey() {
    if (this.jwks) return this.jwks;
    const resp = await this.fetchFn(JWKS_URL);
    if (resp.status !== 200) {
      throw new UpstreamError2("auth", `JWKS \u62C9\u53D6\u5931\u8D25 HTTP ${resp.status}`, false, resp.status);
    }
    const body = await resp.json();
    const keys = body["keys"] ?? [];
    const jwk = keys.find((k) => k["kid"] === JWKS_KID);
    if (!jwk) {
      throw new UpstreamError2("auth", `JWKS \u4E2D\u6CA1\u6709 ${JWKS_KID}`, false, 401);
    }
    this.jwks = { n: jwk["n"], e: jwk["e"] };
    return this.jwks;
  }
  /**
   * 手动跟随重定向直到 predicate 成立。
   *
   * ⚠️ 必须带上 cookie jar(对齐 Nexus `_follow_until`):登录链的前几跳
   * (OIDC_AUTH → … → iam 登录页)会下发 `Set-Cookie`,**POST `/nova/login`
   * 必须把那条 session cookie 带回去**,否则服务端拿不到 CSRF 值,直接
   * 回 `InvalidArgument`(Nexus 的模块 docstring 第 8 行写明了这个坑:
   * 「缺少 session cookie 时报 No CSRF value available in the session cookie」)。
   */
  async _followUntil(start, predicate, maxHops = 8, jar) {
    let location = start;
    for (let i = 0; i < maxHops; i++) {
      if (location && predicate(location)) {
        return location;
      }
      const headers = { Accept: "*/*", "User-Agent": SENSENOVA_UA };
      const cookie = jar?.header();
      if (cookie) headers["Cookie"] = cookie;
      const resp = await this.fetchFn(location, { redirect: "manual", headers });
      jar?.absorb(resp);
      const loc = resp.headers.get("location");
      if (loc) {
        location = new URL(loc, location).toString();
        continue;
      }
      if (resp.status === 200 || resp.status === 201) {
        const text = await resp.text();
        const next = this._nextFromHtml(text);
        if (next) {
          location = new URL(next, location).toString();
          continue;
        }
      }
      break;
    }
    if (location && predicate(location)) {
      return location;
    }
    throw new UpstreamError2("auth", "\u767B\u5F55\u56DE\u8C03\u94FE\u4E2D\u65AD:\u672A\u53D6\u5230 authorization code", false, 401);
  }
  /**
   * 从 HTML 响应体里找下一跳(对齐 Nexus `_next_from_html`)。
   *
   * 只认 `url=` 太窄:真实登录页给的是 `code=` 的完整 URL、`<meta http-equiv
   * ="refresh">`,或 `window.location.replace(...)` 这类 JS 跳转。少一种形态
   * 就会在中间页断链,报「登录回调链中断」。
   */
  _nextFromHtml(html) {
    if (!html) return null;
    const codeUrl = html.match(/(https?:\/\/[^"'\s<>]+[?&]code=[^&"'\s<>]+)/);
    if (codeUrl) return codeUrl[1];
    const meta = html.match(
      /<meta[^>]+http-equiv=["']refresh["'][^>]+url=["']([^"']+)/i
    );
    if (meta) return meta[1].replace(/&amp;/g, "&");
    for (const pattern of [
      /window\.location\.replace\(["']([^"']+)["']\)/,
      /window\.location\.href\s*=\s*["']([^"']+)["']/,
      /location\.href\s*=\s*["']([^"']+)["']/,
      /window\.location\s*=\s*["']([^"']+)["']/
    ]) {
      const js = html.match(pattern);
      if (js) return js[1].replace(/&amp;/g, "&");
    }
    return null;
  }
};
var CookieJar = class {
  cookies = /* @__PURE__ */ new Map();
  absorb(resp) {
    const withSet = resp.headers;
    const lines = typeof withSet.getSetCookie === "function" ? withSet.getSetCookie() : [];
    const raw = lines.length > 0 ? lines : [resp.headers.get("set-cookie") ?? ""];
    for (const line of raw) {
      if (!line) continue;
      const pair = line.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair);
    }
  }
  header() {
    return [...this.cookies.values()].join("; ");
  }
};

// ../core/src/connectors/sensenova.ts
var SensenovaAdapter = class {
  constructor(accounts = [], fetchFn = fetch) {
    this.accounts = accounts;
    this.fetchFn = fetchFn;
    this.pool.setAccounts(accounts);
  }
  accounts;
  fetchFn;
  vendorId = "sensenova";
  /** 账号池(跨请求存活 —— tpm/rpm 记账与冷却都挂在这里)。 */
  pool = new SensenovaAccountPool();
  /**
   * 账号池版本号:`setAccounts` 每次调用 +1。
   *
   * `getToken` 在选号前比对 —— 凭据在两次请求之间被改过(面板增删账号)
   * 就立刻重投影一次。没有它,新加的账号要等下一次 `setAccounts` 才生效。
   */
  poolVersion = 0;
  /**
   * 替换账号池(整池替换,**保留已存在账号的运行态**)。
   *
   * 装配层在凭据变化时调用(面板增删 sensenova 账号 / 刷新任务写完新 key)。
   */
  setAccounts(accounts) {
    this.accounts = accounts;
    this.pool.setAccounts(accounts);
    this.poolVersion += 1;
  }
  /** 账号池快照(**不含明文 key**)—— 面板展示。 */
  poolSnapshot() {
    return this.pool.snapshot();
  }
  /** 账号名 → api_key(仅进程内使用;测试与面板诊断)。 */
  accountKeyOf(username) {
    return this.accounts.find((a) => a.username === username)?.api_key;
  }
  /** 池外 api_key 的临时运行态(按 key 摘要做键,绝不把 key 本身当键名)。 */
  adhoc = /* @__PURE__ */ new Map();
  adhocRuntime(apiKey) {
    const fp = sensenovaKeyFingerprint(apiKey);
    let rt = this.adhoc.get(fp);
    if (!rt) {
      rt = new SensenovaAccountRuntime();
      rt.name = fp;
      this.adhoc.set(fp, rt);
    }
    rt.key = apiKey;
    return rt;
  }
  /**
   * 本轮请求要用**哪一个**账号(单账号,绝不返回候选列表)。
   *
   * 分支(优先级从高到低):
   * 1. `creds.sensenova_account` 钉死 → 只有它(池里没有 → 400);
   * 2. 池空 → 只用 `creds.apiKey`(单账号,按 key 摘要建临时运行态);
   * 3. `creds.apiKey` 属池 → **就是它**(网关注入哪号就用哪号,不拿池内别的号顶替);
   * 4. `creds.apiKey` 不在池 → 只用它(单账号,失败也不拿别的身份顶替);
   * 5. 都没带 → 从池里挑**一个空闲账号**({@link pickIdle})。
   *
   * ⚠️ 旧实现在分支 3 返回「该号排第一 + 池内其余跟上」,那是换号机制的入口,
   * 已随用户 m23215 一起删除。
   */
  accountFor(creds) {
    const pinned = typeof creds["sensenova_account"] === "string" ? String(creds["sensenova_account"]) : "";
    if (pinned) {
      try {
        return this.pool.runtime(pinned);
      } catch {
        throw new UpstreamError2(
          "bad_request",
          `[sensenova] \u8D26\u53F7\u6C60\u91CC\u6CA1\u6709 ${pinned};\u53EF\u7528:${this.pool.names().join(", ") || "(\u7A7A)"}`,
          false,
          400
        );
      }
    }
    const apiKey = creds.apiKey;
    if (this.pool.size === 0) {
      if (!apiKey) {
        throw new UpstreamError2("auth", "[sensenova] \u8D26\u53F7\u6C60\u4E3A\u7A7A\u4E14\u8BF7\u6C42\u672A\u5E26 api_key", false, 401);
      }
      return this.adhocRuntime(apiKey);
    }
    if (apiKey) {
      const name2 = this.pool.nameByKey(apiKey);
      return name2 === null ? this.adhocRuntime(apiKey) : this.pool.runtime(name2);
    }
    return this.pickIdle();
  }
  /**
   * 从池里挑**一个空闲账号**(新会话 / 粘性过期时的选号,用户 m23215)。
   *
   * 判据只有两条:
   * - `inflight === 0`(没在途请求 —— 上游要求单账号单并发);
   * - 账号级没冷却(`isAccountCooling`,键 `""` 那一格)。
   *
   * **不看模型** —— 不同模型可以用同一个账号;按 (账号,模型) 的冷却记录只作
   * 面板展示,不参与选号(旧实现会因某模型冷却就把该号排除,甚至误判池空)。
   *
   * 一个都没有 → 池空(`POOL_EXHAUSTED`,可重试 429):等占用释放 / 冷却过期,
   * **不换身份**(这里本来就是在挑号,没有「换」的概念)。
   */
  pickIdle() {
    const now = Date.now();
    const idle = this.pool.names().map((n) => this.pool.runtime(n)).filter((rt) => rt.inflight === 0 && !rt.isAccountCooling(now));
    if (idle.length === 0) {
      throw new UpstreamError2(
        POOL_EXHAUSTED,
        "[sensenova] \u6CA1\u6709\u7A7A\u95F2\u8D26\u53F7(\u5168\u90E8\u5355\u5E76\u53D1\u5360\u7528\u4E2D\u6216\u8D26\u53F7\u7EA7\u51B7\u5374\u4E2D),\u8BF7\u9000\u907F\u7EA6 15s",
        true,
        429,
        15
      );
    }
    return idle[Math.floor(Math.random() * idle.length)];
  }
  /**
   * 取**本轮请求**要用的账号并占用它(单并发 +1)。
   *
   * 调用方必须配对 {@link releaseFor}(`runWithAccount` 里在 finally)。
   *
   * ⚠️ 钉死/网关注入的账号**不判冷却**:粘性期内不换号,冷却与否都是同一个号
   * (429 交给 {@link runWithAccount} 同号硬等)。只有 {@link pickIdle} 这条
   * 「挑一个新号」的路才会跳过占用中 / 账号级冷却的号。
   */
  acquireFor(creds) {
    const rt = this.accountFor(creds);
    rt.inflight += 1;
    return rt;
  }
  releaseFor(rt) {
    if (rt.inflight > 0) rt.inflight -= 1;
  }
  /**
   * 取一次上游调用要用的账号(运行时),**不发起请求**。
   *
   * 供装配层/测试直接验证调度判据;请求路径走 {@link runWithAccount}。
   */
  runtimeFor(creds) {
    return this.acquireFor(creds);
  }
  /**
   * 补记一次成功请求的可计费 token(SSE 尾块拿到 usage 后调用)。
   *
   * @param username 池内账号名(池外 adhoc 传运行时 name)。
   */
  recordSpendFor(username, usage, ttftMs) {
    let rt;
    try {
      rt = this.pool.runtime(username);
    } catch {
      rt = void 0;
    }
    if (!rt) rt = this.adhoc.get(username);
    if (!rt) return;
    const now = Date.now();
    rt.recordSpend(billable_tokens(usage), now);
    rt.recordOutcome(true, ttftMs, now);
  }
  /**
   * 账号运行态快照(面板诊断)—— **不含明文 key**。
   */
  runtimeSnapshot(username) {
    try {
      return this.pool.runtime(username).snapshot();
    } catch {
      return null;
    }
  }
  // -------------------------------------------------------------------------
  // 上游请求 + 单账号调度(对应 Nexus `_attempt`,**不含** `_iter_upstream` 换号)
  // -------------------------------------------------------------------------
  /**
   * 打一次上游 chat 请求 —— **只用一个账号**,429 时同号硬等,绝不换号。
   *
   * 判据顺序(结论本身):
   * 1. 选号({@link accountFor}):钉死 > 网关注入 key > 池外单账号 > 池里一个空闲号;
   * 2. 非 429 失败(401/403/400/5xx)→ 直接抛(不换号:拿别的身份顶替会掩盖真问题);
   * 3. 429 → 归因 + 记账;等待预算还没用完(`ACCOUNT_WAIT_BUDGET_S`)→
   *    **同号硬等** `min(COOLDOWN_ON_HOLD, waitLeft)` 后**重试同一个号** ——
   *    TPM/RPM 是分钟级窗口,等一会儿就恢复;
   * 4. 预算耗尽 → 给该号记**账号级**冷却(新会话会跳过它,粘性中的会话不受影响)
   *    并抛 {@link heldTooLong}:可重试 `rate_limit` + `retryAfter`,由调用方退避。
   *
   * ⏱️ 等待时间由调用方计入 TTFT:客户端请求进入网关那一刻就是起点。
   */
  async runWithAccount(url, body, model, creds, signal, waitBudgetSeconds = ACCOUNT_WAIT_BUDGET_S) {
    const rt = this.acquireFor(creds);
    let waitLeft = Math.max(0, waitBudgetSeconds);
    let waitedS = 0;
    try {
      for (; ; ) {
        if (signal?.aborted) throw new UpstreamError2("connection", "\u5BA2\u6237\u7AEF\u65AD\u5F00", false, 499);
        const res = await this.pinnedFetch(rt, url, body, signal);
        if (res.ok) return { res, runtime: rt };
        const text = await res.text().catch(() => "");
        const err = this.classifyError(res.status, text);
        rt.recordOutcome(false, 0, Date.now());
        if (res.status !== 429) throw err;
        const now = Date.now();
        if (waitLeft <= 0) {
          rt.coolAccountFor(BILLABLE_WINDOW_S, sensenovaSnippet(text), now);
          throw this.heldTooLong(rt, err, waitedS);
        }
        const delay = Math.min(COOLDOWN_ON_HOLD, waitLeft);
        rt.coolFor(COOLDOWN_ON_HOLD, sensenovaSnippet(text), model, now);
        await this.sleep(delay * 1e3);
        waitLeft -= delay;
        waitedS += delay;
      }
    } finally {
      this.releaseFor(rt);
    }
  }
  /**
   * 同号等待预算耗尽后的错误 —— 用户 m23215:**不换号**,交给调用方退避。
   *
   * 抛 `rate_limit`(可重试,HTTP 429)并带 `retryAfter = ` 一个可计费滚动窗口
   * ({@link BILLABLE_WINDOW_S}s):网关把它当 `Retry-After` 回给客户端。
   * 上游原文(含 `code=8` / `shared` 归因)不动,拼在消息里 —— 面板/客户端该看到
   * 上游那句报错本身。
   */
  heldTooLong(rt, err, waitedS) {
    return new UpstreamError2(
      "rate_limit",
      `[sensenova] \u8D26\u53F7 ${rt.name || "(adhoc)"} \u540C\u53F7\u7B49\u5F85 ${Math.round(waitedS)}s \u540E\u4ECD\u88AB\u9650\u6D41(\u5355\u8D26\u53F7:\u7C98\u6027\u671F\u5185\u4E0D\u6362\u53F7,\u8BF7\u9000\u907F\u7EA6 ${BILLABLE_WINDOW_S}s \u540E\u91CD\u8BD5) \u2014 ${err.message}`,
      true,
      429,
      BILLABLE_WINDOW_S,
      err.raw
    );
  }
  /** sleep(连接器内部等待,不让客户端重试;时长计入 TTFT)。 */
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  /**
   * 走**该账号的钉连接**发一次请求(返回标准 `Response`,与 fetch 同形)。
   *
   * 为什么不用 `this.fetchFn`(Node 全局 fetch):undici 全局连接池会为同一
   * origin 开多条连接并轮转,每换一条就可能落到不同推理节点 → 上游前缀缓存
   * (按 1024-token 块存在节点本地)**命中率掉一半**。Nexus 用
   * `max_connections=1` 的独立 client 钉死节点,这里用 `maxSockets: 1` 的
   * `https.Agent` 达到同样效果。
   *
   * 注入的 `fetchFn`(测试替身)仍然优先 —— 单测不该真的连网。
   */
  async pinnedFetch(rt, url, body, signal) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rt.key}`
    };
    if (this.fetchFn !== fetch) {
      return this.fetchFn(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal
      });
    }
    return pinnedPostJson(url, headers, JSON.stringify(body), rt.pinnedHttpAgent(), signal);
  }
  async getToken(creds) {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      const enabled = this.accounts.filter((a) => a.enabled !== false);
      if (enabled.length === 0) {
        throw new UpstreamError2("auth", "[sensenova] \u8D26\u53F7\u6C60\u4E3A\u7A7A\u4E14\u8BF7\u6C42\u672A\u5E26 api_key", false, 401);
      }
      return { accessToken: enabled[0].api_key, expiresAt: Number.POSITIVE_INFINITY };
    }
    return { accessToken: apiKey, expiresAt: Number.POSITIVE_INFINITY };
  }
  decorateRequest(base, token) {
    return {
      ...base,
      headers: { ...base.headers, Authorization: `Bearer ${token.accessToken}` }
    };
  }
  classifyError(httpStatus, body) {
    const raw = sensenovaSnippet(body);
    const rawText = raw.replace(/^(null|""|'')$/, "").trim();
    const withRaw = (text) => rawText ? `${text} \u2014 \u4E0A\u6E38:${rawText}` : text;
    const original = upstreamRawResponse(httpStatus, body);
    if (httpStatus === 429) {
      const bodyStr = typeof body === "string" ? body : JSON.stringify(body ?? "");
      const attribution = classify_rate_limit(bodyStr);
      if (attribution === ATTR_SHARED) {
        return new UpstreamError2(POOL_SATURATED, withRaw("\u6574\u4E2A\u6C60\u5B50\u90FD\u6EE1"), false, 429, void 0, original);
      }
      if (attribution === ATTR_RPM) {
        return new UpstreamError2(POOL_EXHAUSTED, withRaw("\u8D26\u53F7\u989D\u5EA6\u8017\u5C3D"), true, 429, void 0, original);
      }
      return new UpstreamError2("rate_limit", withRaw("\u4E0A\u6E38\u9650\u6D41"), true, 429, void 0, original);
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return new UpstreamError2("auth", withRaw("\u8BA4\u8BC1\u5931\u8D25"), false, httpStatus, void 0, original);
    }
    if (httpStatus >= 500) {
      return new UpstreamError2("upstream", withRaw("\u4E0A\u6E38\u9519\u8BEF"), true, httpStatus, void 0, original);
    }
    if (httpStatus >= 400) {
      return new UpstreamError2("bad_request", withRaw("\u8BF7\u6C42\u9519\u8BEF"), false, httpStatus, void 0, original);
    }
    return new UpstreamError2("upstream", withRaw("\u672A\u77E5\u9519\u8BEF"), true, httpStatus, void 0, original);
  }
};

// ../core/src/connectors/qoder-cosy.ts
import {
  createCipheriv as createCipheriv3,
  createDecipheriv as createDecipheriv2,
  createHash as createHash6,
  privateDecrypt,
  publicEncrypt as publicEncrypt2,
  randomBytes as randomBytes3,
  randomUUID
} from "node:crypto";
var CUSTOM_ALPHABET = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
var STD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var CUSTOM_PAD = "$";
var s2c = /* @__PURE__ */ new Map();
var c2s = /* @__PURE__ */ new Map();
for (let i = 0; i < 64; i += 1) {
  s2c.set(STD_ALPHABET[i], CUSTOM_ALPHABET[i]);
  c2s.set(CUSTOM_ALPHABET[i], STD_ALPHABET[i]);
}
s2c.set("=", CUSTOM_PAD);
c2s.set(CUSTOM_PAD, "=");
function cosyEncode(plaintext) {
  const std = Buffer.from(plaintext).toString("base64");
  const n = std.length;
  const a = Math.floor(n / 3);
  const rearranged = std.slice(n - a) + std.slice(a, n - a) + std.slice(0, a);
  let out = "";
  for (const ch of rearranged) {
    const mapped = s2c.get(ch);
    if (mapped === void 0) throw new Error(`cosy encode: char out of alphabet: ${ch}`);
    out += mapped;
  }
  return out;
}
function md5Hex(input) {
  return createHash6("md5").update(input, "utf8").digest("hex");
}
function sha512Base64Url(input) {
  return createHash6("sha512").update(input, "utf8").digest("base64url");
}
function currentRfc1123Date(now = /* @__PURE__ */ new Date()) {
  return now.toUTCString();
}
var COSY_APPCODE = "cosy";
var COSY_SECRET_B64 = "d2FyLCB3YXIgbmV2ZXIgY2hhbmdlcw==";
var COSY_VERSION = "0.1.43";
function signLegacy(date) {
  return md5Hex(`${COSY_APPCODE}&${COSY_SECRET_B64}&${date}`);
}
var SERVER_PUBKEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;
function aesCbcEncrypt(plain, key3) {
  const blockSize = 16;
  const padLen = blockSize - plain.length % blockSize;
  const padded = new Uint8Array(plain.length + padLen);
  padded.set(plain);
  padded.fill(padLen, plain.length);
  const cipher = createCipheriv3("aes-128-cbc", key3, key3);
  return new Uint8Array(Buffer.concat([cipher.update(padded), cipher.final()]));
}
function rsaEncrypt(plain) {
  const out = publicEncrypt2(
    { key: SERVER_PUBKEY_PEM, padding: 1 },
    Buffer.from(plain)
  );
  return new Uint8Array(out);
}
function identityFromJobToken(jt) {
  const id = String(jt.id ?? jt.aid ?? jt.uid ?? "");
  return {
    name: String(jt.name ?? ""),
    aid: id,
    uid: id,
    yx_uid: "",
    organization_id: "",
    organization_name: "",
    user_type: String(jt.userType ?? jt.user_type ?? "personal_standard"),
    security_oauth_token: String(jt.securityOauthToken ?? jt.security_oauth_token ?? ""),
    refresh_token: String(jt.refreshToken ?? jt.refresh_token ?? "")
  };
}
function identityPayload(identity) {
  return {
    name: identity.name,
    aid: identity.aid,
    uid: identity.uid,
    yx_uid: identity.yx_uid,
    organization_id: identity.organization_id,
    organization_name: identity.organization_name,
    user_type: identity.user_type,
    security_oauth_token: identity.security_oauth_token,
    refresh_token: identity.refresh_token
  };
}
function newCosySession(identity, machineId, machineToken, machineType) {
  const tempKey = new Uint8Array(Buffer.from(randomBytes3(16).toString("hex").slice(0, 16), "utf8"));
  const cosyKey = Buffer.from(rsaEncrypt(tempKey)).toString("base64");
  const payload = JSON.stringify(identityPayload(identity));
  const info = Buffer.from(
    aesCbcEncrypt(new Uint8Array(Buffer.from(payload, "utf8")), tempKey)
  ).toString("base64");
  return { tempKey, cosyKey, info, identity, machineId, machineToken, machineType };
}
function buildPayloadB64(info, requestId = randomUUID()) {
  const payload = {
    cosyVersion: COSY_VERSION,
    ideVersion: "",
    info,
    requestId,
    version: "v1"
  };
  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => a < b ? -1 : 1)
  );
  return Buffer.from(JSON.stringify(sorted)).toString("base64");
}
function signRequest(payloadB64, cosyKey, cosyDate, body, pathSig) {
  return md5Hex(`${payloadB64}
${cosyKey}
${cosyDate}
${body}
${pathSig}`);
}
function composeBearer(payloadB64, sig) {
  return `Bearer COSY.${payloadB64}.${sig}`;
}
function pathSigFrom(fullUrl) {
  let path;
  try {
    path = new URL(fullUrl).pathname;
  } catch {
    path = fullUrl;
  }
  return path.startsWith("/algo") ? path.slice("/algo".length) : path;
}
function cosyDateOf(nowMs = Date.now()) {
  return String(Math.floor(nowMs / 1e3));
}
var MAX_MACHINE_TYPE_LEN = 18;
var MAX_MACHINE_TOKEN_LEN = 43;
function saltedSeed(seed, installSalt) {
  return installSalt ? `${seed}|salt:${installSalt}` : seed;
}
function deriveId(seed, salt, installSalt) {
  return md5Hex(`${salt}:${saltedSeed(seed, installSalt)}`);
}
function deriveFingerprint(uid, credential, installSalt) {
  const seed = uid !== "" ? uid : `cred:${credential}`;
  return {
    machineId: deriveId(seed, "machine", installSalt),
    machineType: deriveId(seed, "machinetype", installSalt).slice(0, MAX_MACHINE_TYPE_LEN),
    machineToken: sha512Base64Url(`machinetoken:${saltedSeed(seed, installSalt)}`).slice(
      0,
      MAX_MACHINE_TOKEN_LEN
    )
  };
}

// ../core/src/connectors/qoder-wire.ts
var QODER_REGIONS = ["qoder"];
function isQoderRegion(v) {
  return v === "qoder";
}
var QODER_CHAT_PATH = "/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentMode=prompt_enhancer";
var MODELS_PATH = "/algo/api/v2/model/list?Encode=1";
var JOB_TOKEN_PATH = "/algo/api/v3/user/jobToken?Encode=1";
var CAMPAIGNS_PATH = "/sash/api/v1/me/campaigns";
var QODER_REGION_CONFIGS = {
  qoder: {
    region: "qoder",
    label: "Qoder\uFF08\u56FD\u5185\uFF09",
    gateway: "https://gateway.qoder.com.cn",
    openapi: "https://openapi.qoder.com.cn",
    chatPath: QODER_CHAT_PATH,
    modelsPath: MODELS_PATH,
    jobTokenPath: JOB_TOKEN_PATH,
    campaignsPath: CAMPAIGNS_PATH,
    requiresDeviceRisk: false
  }
};
var COSY_CLIENT_TYPE = "10";
var SASH_CLIENT_TYPE = "10";
var SASH_USER_AGENT = "Qoder";
var QODER_DEFAULT_HEADERS = {
  "cosy-data-policy": "agree",
  "content-type": "application/json",
  "cosy-clienttype": COSY_CLIENT_TYPE,
  "login-version": "v2",
  "user-agent": "Go-http-client/2.0",
  "cosy-scene": "assistant",
  "cosy-business-product": "ide",
  "cosy-business-type": "agent"
};
function jobTokenBody(credential) {
  const isRefresh = credential.startsWith("drt-");
  const inner = {
    personalToken: isRefresh ? "" : credential,
    securityOauthToken: "",
    refreshToken: isRefresh ? credential : "",
    needRefresh: isRefresh,
    authInfo: {}
  };
  const outer = { payload: JSON.stringify(inner), encodeVersion: "1" };
  return cosyEncode(new TextEncoder().encode(JSON.stringify(outer)));
}
var QUOTA_CODES = /* @__PURE__ */ new Set(["110", "111", "112"]);
var CONTENT_POLICY_MARKERS = [
  "DataInspectionFailed",
  "inappropriate content",
  "content_policy",
  "content policy"
];
function isContentPolicy(detail2) {
  const lower = detail2.toLowerCase();
  return CONTENT_POLICY_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}
function classifyHttpStatus(status, detail2 = "") {
  if (isContentPolicy(detail2)) return "content-policy";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limited";
  if (status === 400) return "invalid-request";
  if (status === 418 || status >= 500) return "transient";
  return "unknown";
}
function businessCodeOf(detail2) {
  const trimmed = detail2.trim();
  if (!trimmed.startsWith("{")) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return void 0;
  }
  if (typeof parsed !== "object" || parsed === null) return void 0;
  const raw = parsed["code"];
  if (typeof raw === "string" && raw !== "") return raw;
  if (typeof raw === "number" && Number.isInteger(raw)) return String(raw);
  return void 0;
}
var MAX_CODE_NESTING = 6;
function deepestBusinessCode(detail2, depth = 0) {
  const code = businessCodeOf(detail2);
  if (code !== void 0) return code;
  if (depth >= MAX_CODE_NESTING) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(detail2.trim());
  } catch {
    return void 0;
  }
  if (typeof parsed !== "object" || parsed === null) return void 0;
  const message = parsed["message"];
  if (typeof message !== "string") return void 0;
  return deepestBusinessCode(message, depth + 1);
}
function classifyBusinessCode(code) {
  if (code === void 0) return void 0;
  if (QUOTA_CODES.has(code)) return "quota-exhausted";
  if (code === "10605") return "rate-limited";
  return void 0;
}
function classifyFailure(status, detail2) {
  if (isContentPolicy(detail2)) return "content-policy";
  return classifyBusinessCode(deepestBusinessCode(detail2)) ?? classifyHttpStatus(status, detail2);
}
function retryAfterMsOf(detail2, depth = 0) {
  const trimmed = detail2.trim();
  if (!trimmed.startsWith("{")) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return void 0;
  }
  if (typeof parsed !== "object" || parsed === null) return void 0;
  const rec = parsed;
  const seconds = rec["retryAfterSeconds"];
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1e3);
  }
  if (depth >= MAX_CODE_NESTING) return void 0;
  const message = rec["message"];
  return typeof message === "string" ? retryAfterMsOf(message, depth + 1) : void 0;
}
function retryAfterMsOfHeader(value, nowMs = Date.now()) {
  if (value === null || value.trim() === "") return void 0;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - nowMs);
}
function sseDataPayload(line) {
  if (!line.startsWith("data:")) return void 0;
  const payload = line.slice("data:".length).trim();
  if (payload === "" || payload === "[DONE]") return void 0;
  return payload;
}
function parseQoderFrame(payload) {
  let outer;
  try {
    outer = JSON.parse(payload);
  } catch {
    return void 0;
  }
  if (typeof outer !== "object" || outer === null) return void 0;
  const rec = outer;
  const statusRaw = rec["statusCodeValue"] ?? rec["statusCode"];
  const statusCode = typeof statusRaw === "number" ? statusRaw : 200;
  const body = rec["body"];
  if (typeof body === "string" && body.trim() !== "") {
    try {
      const inner = JSON.parse(body);
      if (typeof inner === "object" && inner !== null) {
        return { inner, statusCode, raw: payload };
      }
    } catch {
      return { inner: { __raw: body }, statusCode, raw: payload };
    }
    return void 0;
  }
  return { inner: rec, statusCode, raw: payload };
}
function qoderErrorFrameOf(inner, raw) {
  const failed = inner["success"] === false;
  const codeRaw = inner["msgCode"] ?? inner["code"] ?? inner["statusCode"];
  const code = typeof codeRaw === "number" && Number.isFinite(codeRaw) ? codeRaw : void 0;
  const hasChoices = Array.isArray(inner["choices"]) && inner["choices"].length > 0;
  if (!failed && (code === void 0 || hasChoices)) return void 0;
  const message = typeof inner["message"] === "string" ? inner["message"] : typeof inner["msgInfo"] === "string" ? inner["msgInfo"] : "";
  return {
    status: code !== void 0 && code >= 400 ? code : 500,
    detail: message !== "" ? `${message} | ${raw}` : raw
  };
}
function qoderErrorBlockOf(text) {
  let status;
  let message = "";
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const payload = line.startsWith("data:") ? line.slice("data:".length).trim() : line;
    if (!payload.startsWith("{")) continue;
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const frame = qoderErrorFrameOf(parsed, payload);
    if (frame === void 0) continue;
    status = frame.status;
    if (message === "" || /msgInfo|message/.test(payload)) {
      message = frame.detail.split(" | ")[0] ?? "";
    }
  }
  return {
    status: status !== void 0 && status >= 400 ? status : 500,
    detail: message !== "" ? `${message} | ${text}` : text
  };
}
function readCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function parseCachedTokens(usage) {
  const details = usage["prompt_tokens_details"];
  if (typeof details === "object" && details !== null) {
    const fromDetails = readCount(details["cached_tokens"]);
    if (fromDetails !== void 0) return fromDetails;
  }
  return readCount(usage["prompt_cache_hit_tokens"]) ?? readCount(usage["cached_tokens"]);
}
function parseStreamDelta(inner) {
  const choices = inner["choices"];
  const first = Array.isArray(choices) && choices.length > 0 && typeof choices[0] === "object" && choices[0] !== null ? choices[0] : void 0;
  const delta = first?.["delta"];
  const message = first?.["message"];
  const source = delta ?? message ?? {};
  const content = typeof source["content"] === "string" ? source["content"] : "";
  const reasoning = typeof source["reasoning_content"] === "string" ? source["reasoning_content"] : typeof source["reasoning"] === "string" ? source["reasoning"] : "";
  const toolCalls = Array.isArray(source["tool_calls"]) ? source["tool_calls"] : Array.isArray(inner["tool_calls"]) ? inner["tool_calls"] : void 0;
  const usage = inner["usage"];
  const usageRec = typeof usage === "object" && usage !== null ? usage : void 0;
  const finishRaw = first?.["finish_reason"];
  return {
    content,
    reasoning,
    toolCalls,
    finishReason: typeof finishRaw === "string" && finishRaw !== "" ? finishRaw : void 0,
    inputTokens: usageRec ? readCount(usageRec["prompt_tokens"]) : void 0,
    outputTokens: usageRec ? readCount(usageRec["completion_tokens"]) : void 0,
    cachedTokens: usageRec ? parseCachedTokens(usageRec) : void 0
  };
}
function pickList(payload, keys) {
  for (const key3 of keys) {
    const v = payload[key3];
    if (Array.isArray(v)) return v;
  }
  const data = payload["data"];
  if (typeof data === "object" && data !== null) return pickList(data, keys);
  return [];
}
function maxContextOf(rec) {
  const cfg = rec["context_config"];
  if (typeof cfg !== "object" || cfg === null) return void 0;
  let max;
  for (const value of Object.values(cfg)) {
    if (typeof value !== "object" || value === null) continue;
    const count = value["token_count"];
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) continue;
    if (max === void 0 || count > max) max = count;
  }
  return max;
}
function parseModelCatalog(payload) {
  const rows = pickList(payload, ["models", "chat", "model_list"]);
  const out = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const rec = row;
    const key3 = typeof rec["key"] === "string" ? rec["key"] : "";
    if (key3 === "") continue;
    const displayName = typeof rec["display_name"] === "string" && rec["display_name"] !== "" ? rec["display_name"] : typeof rec["name"] === "string" && rec["name"] !== "" ? rec["name"] : key3;
    out.push({
      key: key3,
      displayName,
      enable: rec["enable"] !== false,
      isDefault: rec["is_default"] === true,
      isVl: rec["is_vl"] === true,
      isReasoning: rec["is_reasoning"] === true,
      isFree: rec["is_free"] === true,
      priceFactor: typeof rec["price_factor"] === "number" ? rec["price_factor"] : void 0,
      maxInputTokens: typeof rec["max_input_tokens"] === "number" ? rec["max_input_tokens"] : void 0,
      maxContextTokens: maxContextOf(rec),
      maxOutputTokens: typeof rec["max_output_tokens"] === "number" ? rec["max_output_tokens"] : void 0,
      raw: rec
    });
  }
  return out;
}
function numOrUndefined(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : void 0;
}
function epochSecondsOf(v) {
  const n = numOrUndefined(v);
  if (n === void 0) return void 0;
  return n >= 1e11 ? Math.floor(n / 1e3) : n;
}
function readBucket(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const v = value;
  return {
    total: numOrUndefined(v["total"]),
    used: numOrUndefined(v["used"]),
    remaining: numOrUndefined(v["remaining"]),
    percentage: numOrUndefined(v["percentage"])
  };
}
function parseUsage(payload) {
  const nested = payload["qoderUsage"];
  const source = typeof nested === "object" && nested !== null ? nested : payload;
  const userQuota = readBucket(source["userQuota"]);
  const addOnRaw = source["addOnQuota"];
  const addOn = readBucket(addOnRaw);
  const orgRaw = source["orgResourcePackage"];
  const org = typeof orgRaw === "object" && orgRaw !== null ? orgRaw : void 0;
  const expRaw = source["expiresAt"];
  return {
    userType: typeof source["userType"] === "string" ? source["userType"] : void 0,
    expiresAt: epochSecondsOf(expRaw),
    upgradeUrl: typeof source["upgradeUrl"] === "string" ? source["upgradeUrl"] : void 0,
    userQuota,
    addOnQuota: addOn === void 0 ? void 0 : {
      ...addOn,
      detailUrl: typeof addOnRaw["detailUrl"] === "string" ? String(addOnRaw["detailUrl"]) : void 0
    },
    orgResourcePackage: org === void 0 ? void 0 : {
      used: numOrUndefined(org["used"]),
      cap: numOrUndefined(org["cap"]),
      remaining: numOrUndefined(org["remaining"]),
      percentage: numOrUndefined(org["percentage"]),
      available: org["available"] === true
    },
    isQuotaExceeded: source["isQuotaExceeded"] === true
  };
}
function projectCampaignEntry(entry) {
  if (typeof entry !== "object" || entry === null) return void 0;
  const raw = entry;
  const campaignId = typeof raw["campaignId"] === "string" ? raw["campaignId"] : "";
  if (campaignId === "") return void 0;
  const benefit = typeof raw["benefit"] === "object" && raw["benefit"] !== null ? raw["benefit"] : {};
  const validity = typeof benefit["validity"] === "object" && benefit["validity"] !== null ? benefit["validity"] : {};
  const placements = Array.isArray(raw["placements"]) ? raw["placements"] : [];
  let campaignUrl;
  const content = {};
  for (const p of placements) {
    if (typeof p !== "object" || p === null) continue;
    const slot = p;
    if (campaignUrl === void 0 && typeof slot["campaignUrl"] === "string") {
      campaignUrl = slot["campaignUrl"];
    }
    const slotContent = slot["content"];
    if (typeof slotContent !== "object" || slotContent === null) continue;
    for (const [lang, text] of Object.entries(slotContent)) {
      if (typeof text !== "object" || text === null) continue;
      const t = text;
      const row = {
        ...typeof t["title"] === "string" ? { title: t["title"] } : {},
        ...typeof t["description"] === "string" ? { description: t["description"] } : {},
        ...typeof t["detailUrl"] === "string" ? { detailUrl: t["detailUrl"] } : {},
        ...typeof t["buttonText"] === "string" ? { buttonText: t["buttonText"] } : {}
      };
      const prior = content[lang];
      if (prior === void 0 || Object.keys(prior).length === 0 && Object.keys(row).length > 0) {
        content[lang] = row;
      }
    }
  }
  return {
    campaignId,
    campaignKey: typeof raw["campaignKey"] === "string" ? raw["campaignKey"] : void 0,
    actionType: typeof raw["actionType"] === "string" ? raw["actionType"] : "",
    claimStatus: typeof raw["claimStatus"] === "string" ? raw["claimStatus"] : "",
    amount: numOrUndefined(benefit["amount"]),
    validityDays: numOrUndefined(validity["days"]),
    startAt: numOrUndefined(raw["startAt"]),
    endAt: numOrUndefined(raw["endAt"]),
    campaignUrl,
    content
  };
}
function parseCampaignFeed(payload) {
  const data = typeof payload["data"] === "object" && payload["data"] !== null ? payload["data"] : payload;
  const rows = Array.isArray(data["campaigns"]) ? data["campaigns"] : [];
  return {
    campaigns: rows.map((entry) => projectCampaignEntry(entry)).filter((c) => c !== void 0),
    claimable: typeof data["claimable"] === "boolean" ? data["claimable"] : void 0,
    showCampaign: typeof data["showCampaign"] === "boolean" ? data["showCampaign"] : void 0,
    campaignUrl: typeof data["campaignUrl"] === "string" ? data["campaignUrl"] : void 0
  };
}
function createChatBodyTemplate() {
  return {
    request_id: "",
    request_set_id: "",
    chat_record_id: "",
    stream: true,
    chat_task: "FREE_INPUT",
    chat_context: {
      extra: {
        modelConfig: { is_reasoning: false, key: "lite" },
        originalContent: { type: "text", text: "" }
      },
      text: { type: "text", text: "" }
    },
    session_id: "",
    source: 1,
    version: "3",
    aliyun_user_type: "personal_standard",
    session_type: "qodercli",
    agent_id: "agent_common",
    task_id: "common",
    model_config: { key: "lite", is_vl: false, is_reasoning: false, source: "system" },
    messages: [],
    business: { id: "", name: "hi", begin_at: 0 }
  };
}
function applyModelKey(template, modelKey, userType, isVl) {
  template.model_config.key = modelKey;
  template.model_config.is_vl = isVl;
  template.chat_context.extra.modelConfig.key = modelKey;
  template.aliyun_user_type = userType !== "" ? userType : "personal_standard";
}
function blankResponseMeta() {
  return {
    id: "",
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      completion_tokens_details: { reasoning_tokens: 0 },
      prompt_tokens_details: { cached_tokens: 0 }
    }
  };
}
function structuredMessage(role, text) {
  return { role, content: text, response_meta: blankResponseMeta(), reasoning_content_signature: "" };
}
function normalizeMessageText(message) {
  const content = message["content"];
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const part of content) {
      if (typeof part === "string") {
        parts.push(part);
        continue;
      }
      if (typeof part === "object" && part !== null) {
        const rec = part;
        if (typeof rec["text"] === "string") parts.push(rec["text"]);
        else if (typeof rec["value"] === "string") parts.push(rec["value"]);
      }
    }
    return parts.join("");
  }
  return "";
}
function extractMessageImages(message) {
  if (message["role"] !== "user") return [];
  const content = message["content"];
  if (!Array.isArray(content)) return [];
  const urls = [];
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const iu = part["image_url"];
    if (typeof iu === "object" && iu !== null) {
      const url = iu["url"];
      if (typeof url === "string") urls.push(url);
    }
  }
  return urls;
}
function extractLatestUserPrompt(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m["role"] === "user") {
      const text = normalizeMessageText(m);
      if (text.trim() !== "") return text;
    }
  }
  return "";
}
function buildQoderMessages(messages) {
  const out = [];
  for (const message of messages) {
    const role = typeof message["role"] === "string" ? message["role"] : "user";
    if (role === "user") {
      const images = extractMessageImages(message);
      const text = normalizeMessageText(message);
      const parts = [];
      for (const url of images) parts.push({ type: "image_url", image_url: { url } });
      if (text.trim() !== "") parts.push({ type: "text", text });
      if (parts.length === 0) parts.push({ type: "text", text: "" });
      out.push({
        role: "user",
        content: "",
        contents: parts,
        response_meta: blankResponseMeta(),
        reasoning_content_signature: ""
      });
      continue;
    }
    if (role === "tool") {
      const row = structuredMessage("tool", normalizeMessageText(message));
      if (typeof message["name"] === "string") row["name"] = message["name"];
      if (typeof message["tool_call_id"] === "string") row["tool_call_id"] = message["tool_call_id"];
      out.push(row);
      continue;
    }
    if (role === "assistant") {
      const row = structuredMessage("assistant", normalizeMessageText(message));
      if (Array.isArray(message["tool_calls"])) row["tool_calls"] = message["tool_calls"];
      out.push(row);
      continue;
    }
    out.push(structuredMessage(role, normalizeMessageText(message)));
  }
  return out;
}

// ../core/src/connectors/qoder.ts
function parseJobToken(payload) {
  const data = typeof payload["data"] === "object" && payload["data"] !== null ? payload["data"] : payload;
  const str = (key3) => typeof data[key3] === "string" ? String(data[key3]) : "";
  return {
    id: str("id") !== "" ? str("id") : str("uid"),
    name: str("name"),
    userType: str("userType") !== "" ? str("userType") : str("user_type"),
    expireTime: typeof data["expireTime"] === "number" ? data["expireTime"] : typeof data["expire_time"] === "number" ? data["expire_time"] : void 0,
    securityOauthToken: str("securityOauthToken") !== "" ? str("securityOauthToken") : str("security_oauth_token"),
    refreshToken: str("refreshToken") !== "" ? str("refreshToken") : str("refresh_token")
  };
}
function toCoreErrorKind(kind) {
  switch (kind) {
    case "auth":
      return { kind: "auth", retryable: false };
    case "rate-limited":
      return { kind: "rate_limit", retryable: true };
    case "quota-exhausted":
      return { kind: "pool_exhausted", retryable: false };
    case "invalid-request":
      return { kind: "bad_request", retryable: false };
    case "content-policy":
      return { kind: "bad_request", retryable: false };
    case "transient":
      return { kind: "upstream", retryable: true };
    default:
      return { kind: "upstream", retryable: false };
  }
}
var QoderUpstreamError = class extends UpstreamError2 {
  /** Qoder 侧细分分类（`quota-exhausted` 这类核心枚举里没有的）。 */
  qoderKind;
  code;
  constructor(kind, message, status = 0, code, retryAfter, raw) {
    const mapped = toCoreErrorKind(kind);
    super(mapped.kind, message, mapped.retryable, status, retryAfter, raw);
    this.qoderKind = kind;
    this.code = code;
  }
};
var ERROR_RING_SIZE = 8;
var RETRY_AFTER_HINT_MS = 500;
var QoderClient = class {
  region;
  config;
  fetchImpl;
  installSalt;
  logger;
  holders = /* @__PURE__ */ new Map();
  errors = [];
  constructor(region, options = {}) {
    this.region = region;
    this.config = QODER_REGION_CONFIGS[region];
    this.fetchImpl = options.fetch ?? fetch;
    this.installSalt = options.installSalt;
    this.logger = options.logger ?? (() => {
    });
  }
  /** 最近的上游错误（新的在前）。 */
  recentErrors() {
    return [...this.errors];
  }
  record(kind, status, body) {
    this.errors.unshift({
      atMs: Date.now(),
      region: this.region,
      status,
      kind,
      body: body.slice(0, 2048)
    });
    if (this.errors.length > ERROR_RING_SIZE) this.errors.length = ERROR_RING_SIZE;
  }
  /** 凭据 → 会话（按凭证键控；换 PAT 必换会话）。 */
  async ensureSession(credential, signal) {
    const cached = this.holders.get(credential);
    if (cached !== void 0) {
      const remaining = (cached.jobToken.expireTime ?? 0) * 1e3 - Date.now();
      if (cached.jobToken.expireTime === void 0 || remaining > 5 * 60 * 1e3) return cached;
    }
    const jobToken = await this.exchangeJobToken(credential, signal);
    const identity = identityFromJobToken({
      id: jobToken.id,
      name: jobToken.name,
      userType: jobToken.userType,
      securityOauthToken: jobToken.securityOauthToken,
      refreshToken: jobToken.refreshToken
    });
    const fingerprint2 = deriveFingerprint(jobToken.id, credential, this.installSalt);
    const session = newCosySession(
      identity,
      fingerprint2.machineId,
      fingerprint2.machineToken,
      fingerprint2.machineType
    );
    const sashToken = await this.exchangeSashToken(credential, signal).catch(() => jobToken.securityOauthToken);
    const holder = {
      session,
      fingerprint: fingerprint2,
      jobToken,
      sashToken: sashToken !== "" ? sashToken : jobToken.securityOauthToken,
      createdAtMs: Date.now()
    };
    this.holders.set(credential, holder);
    return holder;
  }
  /**
   * `POST {gateway}{jobTokenPath}`：PAT → jobToken。
   *
   * ⚠️ 这里是 **认证面**，不是 cosy 数据面 —— 两者签的不是同一套头。实测
   * （2026-10-30，真 PAT）用数据面那套（`cosy-key` + `authorization: <bearer>`）
   * 换 jobToken 会被上游直接丢弃：
   *
   * `HTTP 403 {"success":false,"errorMessage":"Request discarded","errorCode":"Forbidden"}`
   *
   * 认证面要的是**旧式签名**：`appcode: cosy` + `date: <RFC1123 UTC>` +
   * `signature: md5("cosy&<secret>&<date>")`，再配设备三件套
   * （`cosy-machineid/-token/-type`），且**不带** `authorization` 与 `cosy-key`。
   * 两个独立参考实现（`dingminhua/dsh-connect-qoder` 的 `exchangeJobToken`、
   * `fengyinxia/qoder2api` 的 `jobTokenPost`）都是这套头；`signLegacy()` 与
   * `currentRfc1123Date()` 早就在 `qoder-cosy.ts` 里备好，只是此前没人调。
   */
  async exchangeJobToken(credential, signal) {
    const url = `${this.config.gateway}${this.config.jobTokenPath}`;
    const body = jobTokenBody(credential);
    const fingerprint2 = deriveFingerprint("", credential, this.installSalt);
    const date = currentRfc1123Date();
    const resp = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "cosy-machinetoken": fingerprint2.machineToken,
        "cosy-machinetype": fingerprint2.machineType,
        "login-version": "v2",
        appcode: COSY_APPCODE,
        accept: "application/json",
        "accept-encoding": "identity",
        "cosy-version": "1.1.69",
        "cosy-clienttype": "10",
        date,
        signature: signLegacy(date),
        "content-type": "application/json",
        "cosy-machineid": fingerprint2.machineId,
        "user-agent": "Go-http-client/2.0"
      },
      body,
      ...signal ? { signal } : {}
    });
    const text = await resp.text();
    if (resp.status !== 200) {
      const kind = classifyFailure(resp.status, text);
      this.record(kind, resp.status, text);
      throw new QoderUpstreamError(
        kind,
        `jobToken \u4EA4\u6362\u5931\u8D25: HTTP ${resp.status} ${text.slice(0, 200)}`,
        resp.status,
        deepestBusinessCode(text),
        retryAfterMsOf(text) ?? retryAfterMsOfHeader(resp.headers.get("retry-after")),
        upstreamRawResponse(resp.status, text)
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new QoderUpstreamError("unknown", `jobToken \u54CD\u5E94\u4E0D\u662F JSON: ${text.slice(0, 200)}`, resp.status);
    }
    const jt = parseJobToken(parsed);
    if (jt.id === "" && jt.securityOauthToken === "") {
      throw new QoderUpstreamError("auth", `jobToken \u4EA4\u6362\u54CD\u5E94\u7F3A\u5C11\u8EAB\u4EFD\u5B57\u6BB5: ${text.slice(0, 200)}`, resp.status);
    }
    return jt;
  }
  /**
   * `POST {openapi}/api/v1/jobToken/exchange`：换 sash 面令牌（失败回落）。
   *
   * 与 {@link exchangeJobToken} 是**不同的端点、不同的请求头**（2026-10-30 对齐
   * 参考实现 `dingminhua/dsh-connect-qoder`）：
   * - 主机是 `openapi`（sash 面），不是 cosy `gateway`；
   * - body 是 `{ personal_token: <PAT> }` —— 参考实现实测 `personal_access_token`
   *   拼写会回 400 BadRequest；
   * - 只带 `content-type` + `accept`，**不带** Authorization、不带 cosy 协议头。
   *
   * 国内版两族令牌等价，所以这一支失败时回落到 `securityOauthToken` 是安全的；
   * 但它决定「积分/签到能不能读」，故仍按正确形状发，而不是随便带个 Bearer。
   */
  async exchangeSashToken(credential, signal) {
    const url = `${this.config.openapi}/api/v1/jobToken/exchange`;
    const resp = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ personal_token: credential }),
      ...signal ? { signal } : {}
    });
    if (resp.status !== 200 && resp.status !== 201) return "";
    const text = await resp.text();
    try {
      const parsed = JSON.parse(text);
      const data = typeof parsed["data"] === "object" && parsed["data"] !== null ? parsed["data"] : parsed;
      for (const key3 of ["token", "job_token", "jobToken", "accessToken"]) {
        const v = data[key3];
        if (typeof v === "string" && v !== "") return v;
      }
    } catch {
      return "";
    }
    return "";
  }
  /** 签名后的通用请求（GET/POST 都走这条）。 */
  async signedRequest(holder, url, init) {
    const rawBody = init.body === void 0 ? "" : JSON.stringify(init.body);
    const encoded = rawBody === "" ? "" : cosyEncode(new TextEncoder().encode(rawBody));
    const date = cosyDateOf();
    const payloadB64 = buildPayloadB64(holder.session.info);
    const sig = signRequest(payloadB64, holder.session.cosyKey, date, encoded, pathSigFrom(url));
    return this.fetchImpl(url, {
      method: init.method,
      headers: {
        ...QODER_DEFAULT_HEADERS,
        "cosy-machinetype": holder.session.machineType,
        "cosy-date": date,
        "cosy-user": holder.session.identity.uid,
        "cosy-key": holder.session.cosyKey,
        "cosy-machineid": holder.session.machineId,
        "cosy-machinetoken": holder.session.machineToken,
        "cosy-version": "1.1.69",
        authorization: composeBearer(payloadB64, sig),
        ...init.stream ? { accept: "text/event-stream", "cache-control": "no-cache" } : {},
        ...init.modelKey ? { "x-model-key": init.modelKey, "x-model-source": "system" } : {}
      },
      ...encoded === "" ? {} : { body: encoded },
      ...init.signal ? { signal: init.signal } : {}
    });
  }
  /** sash 面请求（`jt-` 令牌 + sash 专有头；国际版带设备风控头）。 */
  async sashRequest(holder, url, init) {
    const token = holder.sashToken !== "" ? holder.sashToken : holder.jobToken.securityOauthToken;
    if (token === "") {
      throw new QoderUpstreamError("auth", "\u6CA1\u6709\u53EF\u7528\u7684 sash \u4EE4\u724C\uFF08jobToken \u4EA4\u6362\u672A\u4EA7\u51FA\uFF09", 401);
    }
    const resp = await this.fetchImpl(url, {
      method: init.method,
      headers: {
        authorization: `Bearer ${token}`,
        "cosy-clienttype": SASH_CLIENT_TYPE,
        accept: "application/json",
        "accept-language": "zh-CN",
        "user-agent": SASH_USER_AGENT,
        ...this.config.requiresDeviceRisk ? {
          "cosy-machinetoken": holder.session.machineToken,
          "cosy-machineid": holder.session.machineId,
          "cosy-machinetype": holder.session.machineType
        } : {},
        ...init.method === "POST" ? { "content-type": "application/json", origin: this.config.openapi } : {}
      },
      ...init.method === "POST" ? { body: JSON.stringify(init.body ?? {}) } : {},
      ...init.signal ? { signal: init.signal } : {}
    });
    const text = await resp.text();
    if (resp.status !== 200 && resp.status !== 201) {
      throw this.failFromHttp(resp.status, text, resp.headers.get("retry-after"));
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new QoderUpstreamError("unknown", `\u54CD\u5E94\u4E0D\u662F JSON: ${text.slice(0, 200)}`, resp.status);
    }
  }
  failFromHttp(status, text, retryAfterHeader) {
    const kind = classifyFailure(status, text);
    this.record(kind, status, text);
    return new QoderUpstreamError(
      kind,
      `\u8BF7\u6C42\u5931\u8D25: HTTP ${status} ${text.slice(0, 200)}`,
      status,
      deepestBusinessCode(text),
      retryAfterMsOf(text) ?? retryAfterMsOfHeader(retryAfterHeader) ?? (kind === "rate-limited" ? RETRY_AFTER_HINT_MS : void 0),
      upstreamRawResponse(status, text)
    );
  }
  // -------------------------------------------------------------------------
  // 数据面
  // -------------------------------------------------------------------------
  /** 模型目录（`/algo/api/v2/model/list`）。 */
  async fetchModels(credential, signal) {
    const holder = await this.ensureSession(credential, signal);
    const url = `${this.config.gateway}${this.config.modelsPath}`;
    const resp = await this.signedRequest(holder, url, { method: "GET", signal });
    const text = await resp.text();
    if (resp.status !== 200) throw this.failFromHttp(resp.status, text, resp.headers.get("retry-after"));
    try {
      return parseModelCatalog(JSON.parse(text));
    } catch {
      throw new QoderUpstreamError("unknown", `\u6A21\u578B\u76EE\u5F55\u4E0D\u662F JSON: ${text.slice(0, 200)}`, resp.status);
    }
  }
  /** 用量（`{openapi}/sash/api/v2/me/usage`，需 `jt-` 令牌）。 */
  async fetchUsage(credential, signal) {
    const holder = await this.ensureSession(credential, signal);
    const url = `${this.config.openapi}/sash/api/v2/me/usage`;
    const data = await this.sashRequest(holder, url, { method: "GET", signal });
    return parseUsage(data);
  }
  /** 活动列表（签到活动就在这里面）。 */
  async fetchCampaigns(credential, signal) {
    const holder = await this.ensureSession(credential, signal);
    const url = `${this.config.openapi}${this.config.campaignsPath}?forceRefresh=true`;
    const data = await this.sashRequest(holder, url, { method: "GET", signal });
    return parseCampaignFeed(data).campaigns;
  }
  /**
   * 每日签到：先拉活动找 `CLAIM_BENEFIT` 可领的那条，再领。
   *
   * 三态分清：`claimed` / `already-claimed`（幂等，409 也算）/ `unavailable`。
   */
  async claimDailyCredits(credential, signal) {
    const campaigns = await this.fetchCampaigns(credential, signal);
    const daily = campaigns.find((c) => c.actionType === "CLAIM_BENEFIT");
    const claimable = campaigns.find((c) => c.actionType === "CLAIM_BENEFIT" && c.claimStatus === "CLAIMABLE");
    const nextRefreshAtMs = daily?.endAt === void 0 ? void 0 : daily.endAt * 1e3;
    if (claimable === void 0) {
      return daily?.claimStatus === "CLAIMED" ? { status: "already-claimed", nextRefreshAtMs } : { status: "unavailable", message: "\u4E0A\u6E38\u4ECA\u65E5\u6CA1\u6709\u4E0B\u53D1\u53EF\u9886\u53D6\u7684\u7B7E\u5230\u6D3B\u52A8" };
    }
    const holder = await this.ensureSession(credential, signal);
    const url = `${this.config.openapi}${this.config.campaignsPath}/${encodeURIComponent(claimable.campaignId)}/claim`;
    try {
      const data = await this.sashRequest(holder, url, { method: "POST", body: {}, signal });
      if (String(data["status"] ?? "") === "CLAIMED") {
        return {
          status: "claimed",
          amount: claimable.amount,
          validityDays: claimable.validityDays,
          nextRefreshAtMs
        };
      }
      return { status: "unavailable", message: `\u7B7E\u5230\u672A\u5B8C\u6210\uFF08\u4E0A\u6E38\u72B6\u6001 ${String(data["status"] ?? "\u672A\u77E5")}\uFF09` };
    } catch (error) {
      if (error instanceof QoderUpstreamError && error.httpStatus === 409) {
        return { status: "already-claimed", nextRefreshAtMs };
      }
      throw error;
    }
  }
  /**
   * 流式 chat。逐帧产出 OpenAI 形状的增量（由调用方包成 SSE 行）。
   *
   * 会话必须已经建好（会按 credential 惰性交换）。
   */
  async *chatStream(credential, request, signal) {
    const holder = await this.ensureSession(credential, signal);
    const template = createChatBodyTemplate();
    const userType = holder.jobToken.userType;
    applyModelKey(template, request.modelKey, userType, request.isVl === true);
    if (request.isReasoning === true) {
      template.model_config.is_reasoning = true;
      template.chat_context.extra.modelConfig.is_reasoning = true;
    }
    if (request.reasoningEffort !== void 0 && request.reasoningEffort !== "") {
      template.reasoningEffort = request.reasoningEffort;
      template.parameters = { ...template.parameters ?? {}, reasoning_effort: request.reasoningEffort };
    }
    const prompt = extractLatestUserPrompt(request.messages);
    template.messages = buildQoderMessages(request.messages);
    if (request.tools !== void 0 && request.tools.length > 0) template.tools = request.tools;
    const requestId = request.requestId ?? cryptoRandomId();
    template.request_id = requestId;
    template.chat_record_id = requestId;
    template.request_set_id = cryptoRandomId();
    template.session_id = cryptoRandomId();
    template.business.id = cryptoRandomId();
    template.business.name = prompt.slice(0, 30) || "hi";
    template.business.begin_at = Date.now();
    const url = `${this.config.gateway}${this.config.chatPath}`;
    const resp = await this.signedRequest(holder, url, {
      method: "POST",
      body: template,
      signal,
      modelKey: request.modelKey,
      stream: true
    });
    if (resp.status !== 200) {
      const text = await resp.text();
      throw this.failFromHttp(resp.status, text, resp.headers.get("retry-after"));
    }
    if (resp.body === null) {
      throw new QoderUpstreamError("unknown", "\u804A\u5929\u54CD\u5E94\u6CA1\u6709 body", resp.status);
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let frameEvent = "";
    let errorBlock = null;
    const flushErrorBlock = () => {
      if (errorBlock === null) return;
      const text = errorBlock.join("\n");
      errorBlock = null;
      if (text.trim() === "") return;
      const failure = qoderErrorBlockOf(text);
      this.record("transient", failure.status, text);
      throw new QoderUpstreamError(
        "transient",
        `\u4E0A\u6E38\u9519\u8BEF\u5E27: ${failure.detail.slice(0, 300)}`,
        failure.status,
        deepestBusinessCode(text),
        void 0,
        upstreamRawResponse(failure.status, text)
      );
    };
    for await (const raw of resp.body) {
      buffer += decoder.decode(raw, { stream: true });
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line.startsWith("event:")) {
          flushErrorBlock();
          frameEvent = line.slice("event:".length).trim();
          errorBlock = frameEvent === "error" ? [] : null;
          index = buffer.indexOf("\n");
          continue;
        }
        if (errorBlock !== null && line.trim() !== "") {
          errorBlock.push(line);
          index = buffer.indexOf("\n");
          continue;
        }
        const payload = sseDataPayload(line);
        if (payload !== void 0) {
          const chunk = this.translateFrame(payload, frameEvent, requestId, request.modelKey);
          frameEvent = "";
          if (chunk !== void 0) yield chunk;
        } else if (line.trim() === "") {
          flushErrorBlock();
          frameEvent = "";
        }
        index = buffer.indexOf("\n");
      }
    }
    if (buffer.trim() !== "") {
      const leftover = buffer.replace(/\r$/, "");
      if (errorBlock !== null) {
        errorBlock.push(leftover);
      } else {
        const payload = sseDataPayload(leftover);
        if (payload !== void 0) {
          const chunk = this.translateFrame(payload, frameEvent, requestId, request.modelKey);
          if (chunk !== void 0) yield chunk;
        }
      }
    }
    flushErrorBlock();
  }
  /** 一帧 → 增量（错误帧抛 {@link QoderUpstreamError}，带原文）。 */
  translateFrame(payload, eventName, requestId, modelKey) {
    const frame = parseQoderFrame(payload);
    if (frame === void 0) return void 0;
    if (frame.statusCode !== 200) {
      const kind = classifyFailure(frame.statusCode, frame.raw);
      this.record(kind, frame.statusCode, frame.raw);
      throw new QoderUpstreamError(
        kind,
        `\u6D41\u5185\u9519\u8BEF\u5E27: HTTP ${frame.statusCode} ${frame.raw.slice(0, 300)}`,
        frame.statusCode,
        deepestBusinessCode(frame.raw),
        void 0,
        upstreamRawResponse(frame.statusCode, frame.raw)
      );
    }
    const failure = qoderErrorFrameOf(frame.inner, frame.raw);
    if (failure !== void 0) {
      const kinds = classifyFailure(failure.status, frame.raw);
      this.record(kinds, failure.status, frame.raw);
      const kind = eventName === "error" ? "transient" : kinds;
      throw new QoderUpstreamError(
        kind,
        `\u4E0A\u6E38\u9519\u8BEF\u5E27: ${failure.detail.slice(0, 300)}`,
        failure.status,
        deepestBusinessCode(frame.raw),
        void 0,
        upstreamRawResponse(failure.status, frame.raw)
      );
    }
    const delta = parseStreamDelta(frame.inner);
    const text = /\{"code"/.test(payload) && delta.content === "" && delta.reasoning === "" ? payload : void 0;
    if (text !== void 0 && deepestBusinessCode(payload) !== void 0) {
      const kind = classifyFailure(frame.statusCode, payload);
      this.record(kind, frame.statusCode, payload);
      throw new QoderUpstreamError(
        kind,
        `\u6D41\u5185\u4E1A\u52A1\u9519\u8BEF: ${payload.slice(0, 300)}`,
        frame.statusCode,
        deepestBusinessCode(payload),
        void 0,
        upstreamRawResponse(frame.statusCode, payload)
      );
    }
    return {
      id: requestId,
      created: Math.floor(Date.now() / 1e3),
      model: modelKey,
      content: delta.content,
      reasoning: delta.reasoning,
      toolCalls: delta.toolCalls,
      finishReason: delta.finishReason,
      inputTokens: delta.inputTokens,
      outputTokens: delta.outputTokens,
      cachedTokens: delta.cachedTokens
    };
  }
};
function cryptoRandomId() {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
var clients = /* @__PURE__ */ new Map();
function getQoderClient(region, options = {}) {
  const existing = clients.get(region);
  if (existing !== void 0) return existing;
  const created = new QoderClient(region, options);
  clients.set(region, created);
  return created;
}
var QoderAdapter = class {
  vendorId;
  region;
  constructor(region = "qoder") {
    this.region = region;
    this.vendorId = region;
  }
  credentialOf(creds) {
    const pat = typeof creds.apiKey === "string" ? creds.apiKey.trim() : "";
    if (pat !== "") return pat;
    const refresh = typeof creds.refreshToken === "string" ? creds.refreshToken.trim() : "";
    return refresh;
  }
  async getToken(creds) {
    const credential = this.credentialOf(creds);
    if (credential === "") {
      throw new QoderUpstreamError("auth", "Qoder \u51ED\u636E\u4E3A\u7A7A\uFF1A\u9700\u8981 PAT\uFF08pt-\u2026\uFF09", 401);
    }
    const client = getQoderClient(this.region);
    const probe = await client.fetchModels(credential).catch((error) => {
      if (error instanceof QoderUpstreamError) throw error;
      throw new QoderUpstreamError("unknown", String(error), 0);
    });
    const expiresAt = Math.floor(Date.now() / 1e3) + 3600;
    void probe;
    return { accessToken: `qoder:${this.region}`, expiresAt };
  }
  decorateRequest(base, _token, _creds) {
    return {
      headers: { ...base.headers ?? {}, ...QODER_DEFAULT_HEADERS, "cosy-version": "1.1.69" },
      ...base.query === void 0 ? {} : { query: base.query }
    };
  }
  classifyError(httpStatus, body, headers) {
    const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
    const kind = classifyFailure(httpStatus, text);
    const retryHeader = headers?.["retry-after"];
    const retryValue = Array.isArray(retryHeader) ? retryHeader[0] : retryHeader;
    const retryAfter = retryAfterMsOf(text) ?? retryAfterMsOfHeader(retryValue ?? null) ?? void 0;
    void classifyHttpStatus;
    return new QoderUpstreamError(
      kind,
      `Qoder \u4E0A\u6E38\u9519\u8BEF: HTTP ${httpStatus} ${text.slice(0, 200)}`,
      httpStatus,
      deepestBusinessCode(text),
      retryAfter,
      upstreamRawResponse(httpStatus, text)
    );
  }
  /**
   * 网关侧「打一次上游」的出口 —— 形状对齐 `SensenovaAdapter.runWithAccount`。
   *
   * 为什么不是普通 fetch：
   * - Qoder 的请求体是**固定模板 + 签名**，签名覆盖 body，所以必须由本类
   *   自己组包（网关那层只给 OpenAI 形状的 body）；
   * - 上游回的是 cosy 信封帧（`{statusCodeValue, body}` 双层 JSON），要在这里
   *   翻译成 OpenAI chunk 流，网关的 `iterUpstreamChunks` 才能按 openai 口径解析。
   *
   * 返回的 `res` 是**本地合成的 SSE Response**（不是上游原始响应）：上层
   * 照常 `iterUpstreamChunks(res.body, "openai", …)` 消费，错误分类也照常
   * 走 `classifyResponse`（本方法非 200 时抛 `QoderUpstreamError`）。
   */
  async runWithAccount(_url, body, model, creds, signal) {
    const pat = typeof creds.apiKey === "string" ? creds.apiKey.trim() : "";
    const account = typeof creds.username === "string" ? creds.username : model;
    if (pat === "") {
      throw new QoderUpstreamError("auth", "Qoder \u8D26\u53F7\u7F3A\u5C11 PAT\uFF08pt-\u2026\uFF09", 401);
    }
    const region = regionOfCreds(creds, this.region);
    const client = getQoderClient(region);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const tools = Array.isArray(body.tools) ? body.tools : void 0;
    const effort = typeof body.reasoning_effort === "string" ? body.reasoning_effort : void 0;
    const request = {
      modelKey: model,
      messages,
      ...tools === void 0 ? {} : { tools },
      ...creds.is_vl === true ? { isVl: true } : {},
      ...creds.is_reasoning === true ? { isReasoning: true } : {},
      ...effort === void 0 || effort === "" ? {} : { reasoningEffort: effort }
    };
    const completionId = `qoder-${cryptoRandomId()}`;
    const created = Math.floor(Date.now() / 1e3);
    const source = client.chatStream(pat, request, signal);
    const encoder = new TextEncoder();
    let usage = null;
    const line = (obj) => encoder.encode(`data: ${JSON.stringify(obj)}

`);
    const first = await source.next();
    const emit = (controller, chunk) => {
      const delta = {};
      if (chunk.content !== "") delta.content = chunk.content;
      if (chunk.reasoning !== "") delta.reasoning_content = chunk.reasoning;
      if (chunk.toolCalls !== void 0 && chunk.toolCalls.length > 0) delta.tool_calls = chunk.toolCalls;
      controller.enqueue(
        line({
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta,
              finish_reason: chunk.finishReason ?? null
            }
          ]
        })
      );
      if (chunk.inputTokens !== void 0 || chunk.outputTokens !== void 0) {
        usage = {
          ...chunk.inputTokens === void 0 ? {} : { prompt_tokens: chunk.inputTokens },
          ...chunk.outputTokens === void 0 ? {} : { completion_tokens: chunk.outputTokens },
          ...chunk.cachedTokens === void 0 ? {} : { prompt_tokens_details: { cached_tokens: chunk.cachedTokens } }
        };
      }
    };
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (!first.done) emit(controller, first.value);
          for await (const chunk of source) {
            emit(controller, chunk);
          }
          if (usage !== null) {
            controller.enqueue(line({ id: completionId, created, model, choices: [], usage }));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          controller.enqueue(encoder.encode(`: qoder-error ${text.replace(/\n/g, " ").slice(0, 400)}

`));
          controller.close();
        }
      },
      cancel() {
        void source.return(void 0);
      }
    });
    return {
      res: new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" }
      }),
      runtime: { name: account, region }
    };
  }
  /** 记账出口（Qoder 没有 TPM/RPM 池，保留形状供网关统一调用）。 */
  recordSpendFor(_username, _usage, _ttftMs) {
  }
};
function regionOfCreds(_creds, _fallback) {
  return "qoder";
}
var QODER_ADAPTERS = [new QoderAdapter("qoder")];

// ../core/src/connectors/index.ts
var defaultConnectors = [
  new OpenAICompatAdapter(),
  new TraeAdapter(),
  new WorkbuddyAdapter(),
  new SensenovaAdapter(),
  ...QODER_ADAPTERS
];
function getConnector(vendorId) {
  return defaultConnectors.find((c) => c.vendorId === vendorId);
}
function getAllConnectors() {
  return [...defaultConnectors];
}
function registerConnector(connector) {
  const existing = defaultConnectors.findIndex((c) => c.vendorId === connector.vendorId);
  if (existing >= 0) {
    defaultConnectors[existing] = connector;
  } else {
    defaultConnectors.push(connector);
  }
}

// ../core/src/request-log/writer.ts
import {
  closeSync as closeSync2,
  existsSync,
  mkdirSync,
  openSync as openSync2,
  readdirSync as readdirSync2,
  unlinkSync,
  writeSync
} from "node:fs";
import { join as join2 } from "node:path";
var MAX_PAYLOAD_BYTES = 256 * 1024;
var EDGE_CHARS = 100;
var CONTENT_MODES = ["off", "structure", "full", "edges"];
var LOG_FILE_RE = /^requests-(\d{8})\.jsonl$/;
function numValue(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function parseMs(value, fallback = 0) {
  if (value === void 0 || value === null) return numValue(fallback);
  const text = typeof value === "string" ? value.trim() : value;
  if (text === "") return numValue(fallback);
  const n = typeof text === "number" ? text : Number(text);
  return Number.isFinite(n) ? n : numValue(fallback);
}
function dayKey(epochMs) {
  const d = epochMs === void 0 ? /* @__PURE__ */ new Date() : new Date(epochMs);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function stringifyJson(value) {
  try {
    return JSON.stringify(value, (_k, v) => typeof v === "bigint" ? String(v) : v);
  } catch {
    return JSON.stringify({ _error: "request-log: \u8BB0\u5F55\u65E0\u6CD5\u5E8F\u5217\u5316\u4E3A JSON" });
  }
}
function dumpText(value) {
  try {
    const s = JSON.stringify(value, (_k, v) => typeof v === "bigint" ? String(v) : v);
    return s === void 0 ? String(value) : s;
  } catch {
    return String(value);
  }
}
function parseJson(raw, fallback) {
  if (typeof raw !== "string" || raw === "") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function payloadChars(value) {
  if (value === null || value === void 0) return 0;
  if (typeof value === "string") return value.length;
  return dumpText(value).length;
}
function sortedKeys(obj) {
  return Object.keys(obj).sort();
}
function typeName(value) {
  if (value === null) return "NoneType";
  if (Array.isArray(value)) return "list";
  const t = typeof value;
  if (t === "object") return "dict";
  if (t === "string") return "str";
  if (t === "number") return Number.isInteger(value) ? "int" : "float";
  return t === "boolean" ? "bool" : t;
}
function skeleton(value, depth = 0) {
  if (value === null || value === void 0) return null;
  if (typeof value === "string") {
    return parseJson(value, { _raw_chars: value.length });
  }
  if (Array.isArray(value)) {
    if (depth >= 2) return { _len: value.length };
    return value.map((v) => skeleton(v, depth + 1));
  }
  if (typeof value === "object") {
    const obj = value;
    if (Array.isArray(obj.messages) && depth === 0) {
      const out2 = obj.messages.map((msg) => {
        if (msg !== null && typeof msg === "object" && !Array.isArray(msg)) {
          const m = msg;
          return {
            role: m.role ?? null,
            chars: payloadChars(m.content),
            keys: sortedKeys(m)
          };
        }
        return { _type: typeName(msg) };
      });
      return { messages: out2, keys: sortedKeys(obj) };
    }
    if (depth >= 2) return { _keys: sortedKeys(obj) };
    const out = {};
    for (const k of sortedKeys(obj)) out[String(k)] = skeleton(obj[k], depth + 1);
    return out;
  }
  return { _type: typeName(value) };
}
function trim(value, limit = MAX_PAYLOAD_BYTES) {
  if (value === null || value === void 0) return null;
  const text = typeof value === "string" ? value : dumpText(value);
  if (text.length <= limit) return typeof value === "string" ? text : value;
  const head = text.slice(0, Math.floor(limit / 2));
  const tail = text.slice(-Math.floor(limit / 4));
  return `${head}
...[\u622A\u65AD ${text.length - head.length - tail.length} \u5B57\u8282]...
${tail}`;
}
function edges(value, n = EDGE_CHARS) {
  if (value === null || value === void 0) return null;
  const text = typeof value === "string" ? value : dumpText(value);
  if (text.length <= n) return { head: text, tail: null, chars: text.length };
  return { head: text.slice(0, n), tail: text.slice(-n), chars: text.length };
}
var RequestLogWriter = class {
  root = null;
  /** 已打开文件路径 → fd(按天缓存,复用到 close/prune)。 */
  handles = /* @__PURE__ */ new Map();
  constructor(root) {
    if (root !== void 0 && root !== null) this.root = root;
  }
  /** 重定向日志根目录(Nexus `configure`):先关旧句柄再换根。 */
  configure(root) {
    this.close();
    this.root = root ?? null;
  }
  fileName(day) {
    return `requests-${String(day).replaceAll("-", "")}.jsonl`;
  }
  /** 某天文件的完整路径(未配置根目录时按空路径拼接)。 */
  pathFor(day) {
    return join2(this.root ?? "", this.fileName(day));
  }
  handle(day) {
    if (!this.root) {
      throw new Error("RequestLogWriter \u672A\u914D\u7F6E\u65E5\u5FD7\u76EE\u5F55(\u5148\u8C03\u7528 configure)");
    }
    const file = this.pathFor(day);
    const opened = this.handles.get(file);
    if (opened !== void 0) return opened;
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
    const fd = openSync2(file, "a");
    this.handles.set(file, fd);
    return fd;
  }
  /** 写一组记录(某天),立即落盘;空数组不创建文件。 */
  write(day, records) {
    if (!records || records.length === 0) return;
    const blob = records.map((r) => `${stringifyJson(r)}
`).join("");
    const fd = this.handle(day);
    writeSync(fd, Buffer.from(blob, "utf8"));
  }
  /** 删除 day < cutoffDay 的文件(对齐 `prune`);删不掉仅警告不抛。 */
  prune(cutoffDay) {
    if (!this.root) return;
    let names;
    try {
      names = readdirSync2(this.root);
    } catch {
      return;
    }
    for (const name2 of names) {
      const m = LOG_FILE_RE.exec(name2);
      if (!m) continue;
      const day = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
      if (day >= cutoffDay) continue;
      const file = join2(this.root, name2);
      const fd = this.handles.get(file);
      if (fd !== void 0) {
        try {
          closeSync2(fd);
        } catch {
        }
        this.handles.delete(file);
      }
      try {
        unlinkSync(file);
      } catch (exc) {
        console.warn(
          `\u6E05\u7406\u65E7\u8BF7\u6C42\u65E5\u5FD7\u5931\u8D25(${file}): ${exc instanceof Error ? exc.message : String(exc)}`
        );
      }
    }
  }
  /** 关闭全部句柄(atexit 同款收尾;Assembly.dispose 调用)。 */
  close() {
    for (const fd of this.handles.values()) {
      try {
        closeSync2(fd);
      } catch {
      }
    }
    this.handles.clear();
  }
};

// ../core/src/request-log/index.ts
function splitModelId3(value) {
  if (typeof value !== "string" || value.length === 0) return [null, null];
  const idx = value.indexOf("/");
  if (idx < 0) return [null, value];
  return [value.slice(0, idx), value.slice(idx + 1)];
}
function prepareRow(row) {
  const ts = parseMs(row.ts, 0) || Date.now() / 1e3;
  const day = String(row.day ?? "") || dayKey(Math.round(ts * 1e3));
  const [p1, m1] = splitModelId3(row.real_model_id ?? row.id);
  const provider = String(row.provider ?? p1 ?? "");
  const model = String(row.model ?? m1 ?? "");
  const logical = row.logical_model === null || row.logical_model === void 0 ? null : String(row.logical_model);
  const usernameRaw = row.username ?? row.account_id ?? row.credential_key ?? "";
  const username = Array.isArray(usernameRaw) && usernameRaw.length === 2 ? String(usernameRaw[1]) : String(usernameRaw);
  const usage = row.usage && typeof row.usage === "object" && !Array.isArray(row.usage) ? row.usage : {};
  const ttft = row.ttft_ms === void 0 || row.ttft_ms === null ? null : parseMs(row.ttft_ms, 0);
  const error = row.error ?? null;
  const status = parseMs(row.status, 200);
  const ok2 = row.ok !== void 0 ? Boolean(row.ok) : !error && status < 400;
  const endpointId = provider && model ? endpointIdOf(provider, model, username) : null;
  return {
    ts,
    day,
    logical_model: logical,
    provider,
    model,
    username,
    endpoint_id: endpointId,
    session_id: row.session_id ?? null,
    status: row.status ?? null,
    ok: ok2,
    error,
    error_kind: row.error_kind ?? null,
    error_status: row.error_status ?? null,
    latency_ms: parseMs(row.latency_ms, 0),
    ttft_ms: ttft,
    requests: parseMs(row.requests, 1),
    fails: parseMs(row.fails, ok2 ? 0 : 1),
    prompt_tokens: parseMs(row.prompt_tokens, parseMs(usage.prompt_tokens, 0)),
    cached_tokens: parseMs(row.cached_tokens, parseMs(usage.cached_tokens, 0)),
    completion_tokens: parseMs(row.completion_tokens, parseMs(usage.completion_tokens, 0)),
    payload: row.payload !== void 0 ? row.payload : row.request,
    discarded_fields: row.discarded_fields ?? null,
    prompt_cache_key: row.prompt_cache_key ?? null
  };
}
function writeStats(items, record2) {
  const byKey = /* @__PURE__ */ new Map();
  for (const it of items) {
    if (!it.provider || !it.model) continue;
    if (!it.ok) continue;
    const key3 = [it.day, it.logical_model ?? "", it.provider, it.model].join("\0");
    let g = byKey.get(key3);
    if (!g) {
      g = { day: it.day, logical: it.logical_model, provider: it.provider, model: it.model, acc: [0, 0, 0, 0, 0, 0, 0] };
      byKey.set(key3, g);
    }
    g.acc[0] += it.requests;
    g.acc[1] += it.prompt_tokens;
    g.acc[2] += it.cached_tokens;
    g.acc[3] += it.completion_tokens;
    g.acc[4] += it.latency_ms;
    g.acc[5] += it.ttft_ms ?? 0;
    g.acc[6] += it.ttft_ms === null ? 0 : 1;
  }
  for (const g of byKey.values()) {
    const a = g.acc;
    record2({
      day: g.day,
      logical_model: g.logical,
      provider: g.provider,
      model: g.model,
      requests: a[0],
      // fails 恒 0:失败请求不再单独计数(历史行仍留着旧值,面板不再展示)
      fails: 0,
      prompt_tokens: a[1],
      cached_tokens: a[2],
      completion_tokens: a[3],
      latency_sum_ms: a[4],
      ttft_sum_ms: a[5],
      ttft_requests: a[6]
    });
  }
}
function detail(item, mode) {
  const record2 = {
    ts: Math.round(item.ts * 1e6) / 1e6,
    // 6 位小数(repo.py round 语义)
    day: item.day,
    logical_model: item.logical_model,
    provider: item.provider,
    model: item.model,
    endpoint_id: item.endpoint_id,
    username: item.username || null,
    session_id: item.session_id ?? null,
    status: item.status ?? null,
    ok: item.ok,
    error: item.error,
    error_kind: item.error_kind,
    error_status: item.error_status,
    latency_ms: Math.round(item.latency_ms),
    ttft_ms: item.ttft_ms === null ? null : Math.round(item.ttft_ms),
    usage: {
      prompt_tokens: item.prompt_tokens,
      cached_tokens: item.cached_tokens,
      completion_tokens: item.completion_tokens
    },
    content_mode: mode,
    // 字段处置(用户 m09081):**丢弃清单**与**缓存路由键**要能在明细里查到 ——
    // 否则一个客户端参数静默消失,排查成本极高(「我明明传了 X,上游说没收到」)。
    discarded_fields: item.discarded_fields ?? null,
    prompt_cache_key: item.prompt_cache_key ?? null
  };
  if (mode === "full") {
    record2.payload = trim(item.payload);
  } else if (mode === "edges") {
    record2.payload_edges = edges(item.payload);
  } else {
    record2.structure = skeleton(item.payload);
  }
  return record2;
}
var OFF_ENABLED = /* @__PURE__ */ new Set(["0", "false", "off", "no"]);
function parseContentMode(raw, fallback = "structure") {
  const mode = String(raw ?? "").trim().toLowerCase();
  return CONTENT_MODES.includes(mode) ? mode : fallback;
}
function computeMode(getSetting) {
  const mode = parseContentMode(getSetting("request_log.content_mode"), "structure");
  const enabledRaw = String(getSetting("request_log.enabled") ?? "1").trim().toLowerCase();
  return OFF_ENABLED.has(enabledRaw) ? "off" : mode;
}
function createContentModeResolver(getSetting, opts = {}) {
  const ttlMs = opts.ttlMs ?? 5e3;
  const clock = opts.now ?? Date.now;
  let cached = null;
  return () => {
    const now = clock();
    if (cached !== null && now - cached.at < ttlMs) return cached.mode;
    const mode = computeMode(getSetting);
    cached = { mode, at: now };
    return mode;
  };
}
function logRequests(rows, deps) {
  const items = (rows ?? []).map((r) => prepareRow(r));
  if (items.length === 0) return 0;
  writeStats(items, deps.record);
  const mode = deps.getContentMode ? deps.getContentMode() : computeMode(deps.getSetting);
  if (mode !== "off") {
    const byDay = /* @__PURE__ */ new Map();
    for (const it of items) {
      const list = byDay.get(it.day) ?? [];
      list.push(detail(it, mode));
      byDay.set(it.day, list);
    }
    for (const [day, records] of byDay) deps.writer.write(day, records);
  }
  return items.length;
}

// ../panel/src/constants.ts
var KNOWN_PROTOCOLS = ["openai", "workbuddy", "trae", "sensenova", "qoder"];
var REQUEST_LOG_CONTENT_MODES = [
  { value: "off", label: "\u4E0D\u8BB0\u5F55\u65E5\u5FD7" },
  { value: "structure", label: "\u8BB0\u5F55\u7ED3\u6784" },
  { value: "full", label: "\u8BB0\u5F55\u5B8C\u6574\u6B63\u6587" },
  { value: "edges", label: "\u8BB0\u5F55\u6B63\u6587\u9996\u5C3E" }
];
var KIND_BY_PROTOCOL = {
  openai: "endpoint",
  workbuddy: "channel",
  trae: "channel",
  sensenova: "channel",
  // Qoder 是 PAT 账号池(一个 PAT 一条凭据、还要做每日签到与额度读数),
  // 归 "channel" 而不是 "endpoint"。
  qoder: "channel"
};
var CH_QUOTA_PROVIDERS = /* @__PURE__ */ new Set(["trae", "workbuddy"]);
var CH_CATALOG_PROVIDERS = /* @__PURE__ */ new Set(["trae", "workbuddy", "sensenova"]);
var STRATEGY_LABELS = {
  "due-first": "\u6700\u5148\u5230\u671F Due first",
  random: "\u968F\u673A Random",
  "usage-balanced": "\u7528\u91CF\u5E73\u8861 Usage balanced",
  "ordered-fallback": "\u6309\u5E8F\u964D\u7EA7\u94FE Ordered fallback",
  "least-busy": "\u6700\u5C11\u5728\u9014 Least busy",
  balanced: "\u5E73\u5747\u4F7F\u7528 Balanced"
};
var CLIENT_CHANNELS = [
  { channel: "workbuddy", description: "WorkBuddy \u5BA2\u6237\u7AEF\u8DEF\u5F84" },
  { channel: "trae", description: "Trae \u5BA2\u6237\u7AEF\u8DEF\u5F84" },
  { channel: "sensenova", description: "SenseNova \u5BA2\u6237\u7AEF\u8DEF\u5F84" }
];
var LDRIVE = process.env.AS_ONE_CLIENT_DRIVE || "L:";
var CLIENT_INSTALL_ROOTS = [
  { dir: "%LOCALAPPDATA%\\Programs", source: "candidates", label: "%LOCALAPPDATA%\\Programs" },
  { dir: "%PROGRAMFILES%", source: "program-files", label: "C:\\Program Files" },
  { dir: "%PROGRAMFILES(X86)%", source: "program-files-x86", label: "C:\\Program Files (x86)" },
  { dir: "%LOCALAPPDATA%", source: "localappdata", label: "%LOCALAPPDATA%" },
  { dir: LDRIVE + "\\", source: "ldrive", label: LDRIVE + " \u76D8\u7EA6\u5B9A" }
];
var CLIENT_CANDIDATES = {
  // Trae:官方默认 `C:\Program Files\Trae\Trae.exe`;国内版目录名是 `Trae CN`。
  trae: ["Trae\\Trae.exe", "Trae CN\\Trae CN.exe", "Trae.exe"],
  workbuddy: ["WorkBuddy\\WorkBuddy.exe", "WorkBuddy.exe"],
  // sensenova 无 exe 候选表。
  sensenova: []
};
var SETTING_FIELDS = [
  {
    key: "external_refresh.interval_hours",
    def: "5",
    kind: "float",
    label: "\u5916\u90E8\u6570\u636E\u5237\u65B0\u65F6\u95F4(\u5C0F\u65F6)",
    min: 0.1,
    max: 168
  },
  {
    key: "scheduler.rules_p1",
    def: "",
    kind: "json",
    label: "\u8C03\u5EA6\u89C4\u5219 \xB7 \u514D\u8D39\u6863(priority 1)"
  },
  {
    key: "scheduler.rules_p2",
    def: "",
    kind: "json",
    label: "\u8C03\u5EA6\u89C4\u5219 \xB7 \u6709\u5230\u671F\u65F6\u95F4\u7684\u6863(priority 2)"
  },
  {
    key: "scheduler.rules_p3",
    def: "",
    kind: "json",
    label: "\u8C03\u5EA6\u89C4\u5219 \xB7 \u666E\u901A\u6D88\u8017\u6863(priority 3)"
  },
  {
    key: "scheduler.rules_p4",
    def: "",
    kind: "json",
    label: "\u8C03\u5EA6\u89C4\u5219 \xB7 \u9AD8\u5CF0\u4F4E\u4F18\u5148(priority 4)"
  },
  {
    key: "scheduler.rules_p0",
    def: "",
    kind: "json",
    label: "\u8C03\u5EA6\u89C4\u5219 \xB7 \u7981\u7528\u6863(priority 0)"
  },
  {
    key: "scheduler.cooldown_overrides",
    def: "",
    kind: "json",
    label: "\u4F9B\u5E94\u5546\u7EA7\u51B7\u5374\u8986\u76D6(\u5206\u949F)"
  },
  {
    key: "scheduler.pin_seconds",
    def: "900",
    kind: "float",
    label: "\u4F1A\u8BDD\u7C98\u6027\u65F6\u957F(\u79D2)",
    min: 0,
    max: 86400
  },
  {
    key: "retry.base_backoff_s",
    def: "1",
    kind: "float",
    label: "\u521D\u59CB\u9000\u907F(\u79D2)",
    min: 0.05,
    max: 60
  },
  {
    key: "retry.max_backoff_s",
    def: "15",
    kind: "float",
    label: "\u6700\u5927\u9000\u907F(\u79D2)",
    min: 0.05,
    max: 300
  },
  {
    key: "retry.jitter_ratio",
    def: "0.2",
    kind: "float",
    label: "\u6296\u52A8\u6BD4\u4F8B",
    min: 0,
    max: 1
  },
  {
    key: "retry.codes",
    def: "timeout,connection,429,500,502,503,504",
    kind: "str",
    label: "\u53EF\u91CD\u8BD5\u9519\u8BEF\u7801"
  },
  {
    key: "retry.logical_max",
    def: "1",
    kind: "int",
    label: "\u6700\u5927\u91CD\u8BD5\u6B21\u6570(\u4F5C\u4E3A\u903B\u8F91\u6A21\u578B\u6210\u5458)",
    min: 1,
    max: 20
  },
  {
    key: "retry.real_max",
    def: "10",
    kind: "int",
    label: "\u6700\u5927\u91CD\u8BD5\u6B21\u6570",
    min: 0
  },
  {
    key: "retry.logical_cooldown",
    def: "15",
    kind: "int",
    label: "\u903B\u8F91\u6A21\u578B\u6210\u5458\u51B7\u5374(\u5206\u949F)",
    min: 1,
    max: 1440
  },
  // ⭐ 2026-10-18 重进设置页(与 Nexus 同批):键名前缀是 `real` 但**归在 retry 段
  // 渲染** —— 它是「重试之前单次上游调用愿意等多久」,与 retry.* 同一决策语境。
  // 段名只是展示分组,不影响键本身,也不是死开关。
  {
    key: "real.wait_budget_s",
    def: "60",
    kind: "float",
    label: "\u8BF7\u6C42\u8D85\u65F6\u65F6\u95F4(\u79D2)",
    min: 0,
    max: 600,
    section: "retry"
  },
  {
    key: "ui.recent_limit",
    def: "50",
    kind: "int",
    label: "\u5B9E\u65F6\u65E5\u5FD7\u6700\u5927\u663E\u793A\u6761\u6570",
    min: 1,
    max: 500
  }
];

// ../panel/src/utils.ts
import { closeSync as closeSync3, openSync as openSync3, readSync } from "node:fs";
function pad22(n) {
  return String(n).padStart(2, "0");
}
function countJsonlLines(path) {
  const fd = openSync3(path, "r");
  try {
    const chunk = Buffer.alloc(1 << 20);
    let count = 0;
    let pending = false;
    for (; ; ) {
      const read = readSync(fd, chunk, 0, chunk.length, null);
      if (read <= 0) break;
      for (let i = 0; i < read; i += 1) {
        if (chunk[i] === 10) {
          if (pending) count += 1;
          pending = false;
        } else {
          pending = true;
        }
      }
    }
    if (pending) count += 1;
    return count;
  } finally {
    closeSync3(fd);
  }
}
function fmtDay(d) {
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad22(d.getMonth() + 1)}-${pad22(d.getDate())}`;
}
function todayLocal() {
  return fmtDay(/* @__PURE__ */ new Date());
}
function dayAdd(day, delta) {
  const [y, m, d] = day.split("-").map(Number);
  return fmtDay(new Date(y, m - 1, d + delta));
}
function clampDay(day, first) {
  if (first === null) return day;
  return day < first ? first : day;
}
function rangeDays(from, to) {
  const out = [];
  let d = from;
  while (d <= to && out.length < 3660) {
    out.push(d);
    d = dayAdd(d, 1);
  }
  return out;
}
function monthAxis(from, to) {
  const out = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || y === ty && m <= tm) {
    out.push(`${String(y).padStart(4, "0")}-${pad22(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
function round12(x) {
  return Math.round(x * 10) / 10;
}
function pct(part, total) {
  if (!(total > 0)) return null;
  return Math.round(part / total * 1e4) / 1e4;
}
function fpOf(secret) {
  if (secret === null || secret === void 0 || secret === "") return null;
  return secret.length > 8 ? `${secret.slice(0, 8)}\u2026` : secret;
}
function splitRef(credentialRef) {
  const idx = credentialRef.indexOf("/");
  return idx > 0 ? [credentialRef.slice(0, idx), credentialRef.slice(idx + 1)] : [credentialRef, ""];
}
function parseDbMembers(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const item of arr) {
      if (typeof item === "string") {
        const pair = splitModelId2(item);
        if (pair) out.push({ provider: pair[0], model: pair[1] });
      } else if (item !== null && typeof item === "object") {
        const o = item;
        const p = o.provider;
        const m = o.model;
        if (typeof p === "string" && typeof m === "string" && p !== "" && m !== "") {
          out.push({ provider: p, model: m });
        } else if (typeof o.real_model_id === "string") {
          const pair = splitModelId2(o.real_model_id);
          if (pair) out.push({ provider: pair[0], model: pair[1] });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}
function membersFromInput(input) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (id) => {
    const at = id.indexOf("@");
    const real = at > 0 ? id.slice(0, at) : id;
    const pair = splitModelId2(real);
    if (!pair) return;
    const key3 = `${pair[0]}/${pair[1]}`;
    if (seen.has(key3)) return;
    seen.add(key3);
    out.push({ provider: pair[0], model: pair[1] });
  };
  for (const m of input.members ?? []) add(String(m));
  for (const d of input.deployments ?? []) add(String(d));
  for (const g of input.strategy_groups ?? []) {
    for (const m of g?.members ?? []) add(String(m));
  }
  for (const f of input.fallbacks ?? []) add(String(f));
  return out;
}

// ../core/src/gateway/reasoning-effort.ts
var CANONICAL_LADDER = ["low", "medium", "high", "max"];
var LADDER_RANK = {
  off: -1,
  low: 0,
  medium: 1,
  high: 2,
  max: 3
};
var TIE_PREFER_LOW = false;
var LOW_SIDE_INPUTS = /* @__PURE__ */ new Set(["low"]);
function canonicalEffort(name2) {
  const n = name2.trim().toLowerCase().replace(/[-_\s.]/g, "");
  if (n === "off" || n === "none" || n === "disabled" || n === "false" || n === "no") return "off";
  if (n === "low" || n === "minimal" || n === "min" || n === "light" || n === "thinkinglow") {
    return "low";
  }
  if (n === "medium" || n === "med" || n === "default" || n === "mid" || n === "thinkingmedium") {
    return "medium";
  }
  if (n === "high" || n === "thinkinghigh") return "high";
  if (n === "max" || n === "xhigh" || n === "ultra" || n === "extreme" || n === "highest" || n === "thinkingmax") {
    return "max";
  }
  return null;
}
function canonizeLevels(list) {
  const set = /* @__PURE__ */ new Set();
  for (const raw of list) {
    const c = canonicalEffort(String(raw ?? ""));
    if (c !== null && c !== "off") set.add(c);
  }
  return CANONICAL_LADDER.filter((level) => set.has(level));
}
var OFF_FALLBACK = "low";
function resolveReasoningEffort(requested, levels, allowsOff = null) {
  if (typeof requested !== "string" || requested.trim() === "") {
    return { effort: void 0, clamped: false, reason: "unspecified" };
  }
  const req = canonicalEffort(requested);
  if (req === null) {
    return { effort: void 0, clamped: false, reason: "unrecognized" };
  }
  if (levels === null || levels === void 0) {
    return { effort: void 0, clamped: false, reason: "unknown" };
  }
  const supported = canonizeLevels(levels);
  if (supported.length === 0) {
    return { effort: void 0, clamped: false, reason: "unsupported" };
  }
  if (req === "off") {
    if (allowsOff === false) {
      return { effort: OFF_FALLBACK, clamped: true, reason: "off-fallback" };
    }
    return { effort: "off", clamped: false, reason: "off" };
  }
  if (supported.includes(req)) {
    return { effort: req, clamped: false, reason: "exact" };
  }
  const rank = LADDER_RANK[req];
  const tieToLow = LOW_SIDE_INPUTS.has(req);
  let best;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const s of supported) {
    const delta = Math.abs(LADDER_RANK[s] - rank);
    if (delta > bestDelta) continue;
    if (best === void 0 || delta < bestDelta) {
      best = s;
      bestDelta = delta;
      continue;
    }
    const prevRank = LADDER_RANK[best];
    const wantLow = tieToLow || TIE_PREFER_LOW;
    if (wantLow ? LADDER_RANK[s] < prevRank : LADDER_RANK[s] > prevRank) best = s;
  }
  if (best === void 0) {
    return { effort: void 0, clamped: false, reason: "unsupported" };
  }
  return { effort: best, clamped: true, reason: "nearest" };
}

// ../panel/src/modelview.ts
function parseReasoningEfforts(raw) {
  if (raw === null || raw === void 0) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    return canonizeLevels(v.map((x) => String(x ?? "")));
  } catch {
    return null;
  }
}
function parseReasoningAllowsOff(raw) {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  return null;
}
function realModelMapOf(registry, db, pid) {
  const out = /* @__PURE__ */ new Map();
  for (const def of registry.listRealModels(pid)) {
    out.set(`${def.provider}/${def.model}`, {
      provider: def.provider,
      model: def.model,
      name: def.name,
      hidden: def.hidden,
      supportsVision: def.supportsVision,
      maxInputTokens: def.maxInputTokens,
      maxOutputTokens: def.maxOutputTokens,
      concurrency: def.concurrency,
      registered: true,
      // 注册表是「空库首启播种」的投影,不带能力字段;真值一律由 db 行覆盖。
      supportedReasoningEfforts: null,
      reasoningAllowsOff: null
    });
  }
  for (const row of db.realModel.list().filter((r) => pid === void 0 || r.provider === pid)) {
    const prev = out.get(`${row.provider}/${row.model}`);
    out.set(`${row.provider}/${row.model}`, {
      provider: row.provider,
      model: row.model,
      name: row.name,
      hidden: row.hidden === 1,
      supportsVision: row.supports_vision === 1,
      maxInputTokens: row.max_input_tokens,
      maxOutputTokens: row.max_output_tokens,
      concurrency: row.concurrency > 0 ? row.concurrency : null,
      registered: prev?.registered ?? false,
      supportedReasoningEfforts: parseReasoningEfforts(row.supported_reasoning_efforts),
      reasoningAllowsOff: parseReasoningAllowsOff(row.reasoning_allows_off)
    });
  }
  return out;
}

// ../panel/src/modelcatalog.ts
var labelKey = (s) => s.trim().toLowerCase();
function dedupeLabels(bases, tags) {
  const keyCount = /* @__PURE__ */ new Map();
  for (const b of bases) {
    const k = labelKey(b);
    keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
  }
  const out = [];
  const used = /* @__PURE__ */ new Set();
  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    let label = (keyCount.get(labelKey(base)) ?? 0) > 1 && tags[i] ? `${base} (${tags[i]})` : base;
    if (used.has(labelKey(label))) {
      for (let n = 2; ; n += 1) {
        const candidate = `${label} \xB7${n}`;
        if (!used.has(labelKey(candidate))) {
          label = candidate;
          break;
        }
      }
    }
    used.add(labelKey(label));
    out.push(label);
  }
  return out;
}
function listModelEntries(registry, db, providersWithCredentials2) {
  const windowOf2 = /* @__PURE__ */ new Map();
  const visionOf2 = /* @__PURE__ */ new Map();
  const effortOf = /* @__PURE__ */ new Map();
  const allowsOffOf = /* @__PURE__ */ new Map();
  for (const mv of realModelMapOf(registry, db).values()) {
    const key3 = `${mv.provider}/${mv.model}`;
    windowOf2.set(key3, mv.maxInputTokens ?? 0);
    visionOf2.set(key3, mv.supportsVision);
    effortOf.set(key3, mv.supportedReasoningEfforts);
    allowsOffOf.set(key3, mv.reasoningAllowsOff);
  }
  const intersectEfforts = (members) => {
    const lists = [];
    for (const m of members) {
      const e = effortOf.get(`${m.provider}/${m.model}`) ?? null;
      if (e !== null && e.length === 0) return [];
      if (e !== null && e.length > 0) lists.push(e);
    }
    if (lists.length === 0) return null;
    let acc = lists[0];
    for (let i = 1; i < lists.length; i += 1) {
      const want = new Set(lists[i].map((x) => x.toLowerCase()));
      acc = acc.filter((x) => want.has(x.toLowerCase()));
      if (acc.length === 0) return [];
    }
    return acc;
  };
  const intersectAllowsOff = (members) => {
    let saw = false;
    for (const m of members) {
      const a = allowsOffOf.get(`${m.provider}/${m.model}`) ?? null;
      if (a === false) return false;
      if (a === true) saw = true;
    }
    return saw ? true : null;
  };
  const logical = [];
  const seen = /* @__PURE__ */ new Set();
  for (const row of db.logicalModel.list()) {
    if (seen.has(row.name)) continue;
    const members = parseDbMembers(row.members);
    if (members.length === 0) continue;
    seen.add(row.name);
    logical.push({ row, members, base: (row.display_name ?? "").trim() || row.name });
  }
  const reals = [...realModelMapOf(registry, db).values()].filter((mv) => !mv.hidden && providersWithCredentials2.has(mv.provider)).sort(
    (a, b) => a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : a.model < b.model ? -1 : a.model > b.model ? 1 : 0
  );
  const realRows = [];
  for (const mv of reals) {
    const id = `${mv.provider}/${mv.model}`;
    if (seen.has(id)) continue;
    seen.add(id);
    realRows.push({ mv, id });
  }
  const dbReal = /* @__PURE__ */ new Map();
  for (const r of db.realModel.list()) dbReal.set(`${r.provider}/${r.model}`, r.name);
  const bases = [
    ...logical.map((l) => l.base),
    ...realRows.map(({ mv, id }) => {
      const raw = dbReal.has(id) ? dbReal.get(id) : mv.name;
      return (raw ?? "").trim() || mv.model;
    })
  ];
  const tags = [
    ...logical.map((l) => l.base === l.row.name ? null : l.row.name),
    ...realRows.map(({ mv }) => mv.provider)
  ];
  const labels = dedupeLabels(bases, tags);
  const out = [];
  logical.forEach((l, i) => {
    const windows = l.members.map((m) => windowOf2.get(`${m.provider}/${m.model}`) ?? 0).filter((w) => Number.isFinite(w) && w > 0);
    out.push({
      id: l.row.name,
      object: "model",
      owned_by: "as-one",
      litenexus_kind: "logical",
      name: l.base,
      display_name: labels[i],
      max_input_tokens: windows.length > 0 ? Math.min(...windows) : void 0,
      supports_vision: l.members.some((m) => visionOf2.get(`${m.provider}/${m.model}`) === true),
      reasoning_efforts: intersectEfforts(l.members),
      reasoning_allows_off: intersectAllowsOff(l.members)
    });
  });
  realRows.forEach(({ mv, id }, j) => {
    out.push({
      id,
      object: "model",
      owned_by: "as-one",
      litenexus_kind: "real",
      name: (mv.name ?? "").trim() || mv.model,
      display_name: labels[logical.length + j],
      max_input_tokens: mv.maxInputTokens ?? void 0,
      max_output_tokens: mv.maxOutputTokens ?? void 0,
      supports_vision: mv.supportsVision,
      reasoning_efforts: mv.supportedReasoningEfforts,
      reasoning_allows_off: mv.reasoningAllowsOff
    });
  });
  return out;
}
async function providersWithCredentials(registry, vault) {
  const out = /* @__PURE__ */ new Set();
  for (const p of registry.listProviders()) {
    const creds = await vault.list(p.id).catch(() => []);
    if (creds.length > 0) out.add(p.id);
  }
  return out;
}

// ../panel/src/refresh.ts
import { createSign as createSign2, randomBytes as randomBytes4 } from "node:crypto";
var REFRESH_PROVIDERS = ["trae", "workbuddy"];
var REFRESH_MARGIN_S = 300;
var REFRESH_TIMEOUT_MS = 2e4;
var TRAE_DEFAULT_HOST_CN = "https://api.trae.cn";
var TRAE_DEFAULT_HOST_AI = "https://api.trae.ai";
var TRAE_CLOUDIDE_PATH = "/cloudide/api/v3/trae/oauth/ExchangeToken";
var TRAE_SOLO_PATH = "/trae/api/v3/oauth/ExchangeToken";
var TRAE_CN_CLIENT_ID = "ono9krqynydwx5";
var TRAE_SOLO_CLIENT_ID = "en1oxy7wnw8j9n";
var WB_CN_CHAT_BASE = "https://copilot.tencent.com";
var WB_REFRESH_PATH = "/v2/plugin/auth/token/refresh";
var WB_CLIENT_UA = "CLI/2.63.2 CodeBuddy/2.63.2";
var WB_CN_BILLING_BASE = "https://www.codebuddy.cn";
var WB_GLOBAL_DOMAINS = ["workbuddy.ai", "codebuddy.ai"];
var RefreshError = class extends Error {
};
var RefreshCredentialError = class extends RefreshError {
};
function refreshSupported(provider) {
  return REFRESH_PROVIDERS.includes(provider);
}
function strOf(raw, key3) {
  const v = raw[key3];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
function jwtPayloadOf(token) {
  if (token.split(".").length < 2) return null;
  try {
    const seg = token.split(".")[1];
    const padded = seg + "=".repeat(-seg.length % 4);
    const parsed = JSON.parse(Buffer.from(padded, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function traeRefreshHost(cred) {
  const host = strOf(cred.raw, "host");
  if (host) return host.replace(/\/+$/, "");
  const region = (strOf(cred.raw, "region") ?? "").toLowerCase();
  return region === "ai" || region === "sg" || region === "global" ? TRAE_DEFAULT_HOST_AI : TRAE_DEFAULT_HOST_CN;
}
function traeContractOf(cred) {
  const edition = (strOf(cred.raw, "edition") ?? "cn").toLowerCase();
  if (edition === "solo" || edition === "solo-sg") {
    return { path: TRAE_SOLO_PATH, clientId: TRAE_SOLO_CLIENT_ID, deviceInfo: true };
  }
  return { path: TRAE_CLOUDIDE_PATH, clientId: TRAE_CN_CLIENT_ID, deviceInfo: false };
}
function traeUserId(cred) {
  const uid = strOf(cred.raw, "uid");
  if (uid) return uid;
  const userId = strOf(cred.raw, "user_id");
  if (userId) return userId;
  const token = cred.secret ?? "";
  if (token.split(".").length >= 2) {
    const payload = jwtPayloadOf(token);
    const data = payload?.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const key3 of ["user_id", "id"]) {
        const v = data[key3];
        if (v !== void 0 && v !== null && String(v).trim()) return String(v).trim();
      }
    }
  }
  throw new RefreshCredentialError(
    "trae \u8D26\u53F7\u6CA1\u6709 user_id/uid,\u4E14\u65E0\u6CD5\u4ECE token \u91CC\u89E3\u51FA \u2014\u2014 \u65E0\u6CD5\u6784\u9020\u5237\u65B0\u8BF7\u6C42\u3002"
  );
}
function traeDeviceProof(path, clientId, refreshToken, privateKeyPem) {
  const timestamp = String(Date.now());
  const nonce = Buffer.from(randomBytes4(16)).toString("base64url").replace(/=+$/, "");
  const message = ["POST", path, clientId, refreshToken, timestamp, nonce].join("\n");
  const signer = createSign2("SHA256");
  signer.update(message, "utf8");
  const signature = signer.sign(privateKeyPem, "base64");
  return { Signature: signature, Timestamp: timestamp, Nonce: nonce };
}
function wbRegionOf(domain) {
  let d = domain.trim().toLowerCase();
  if (d.startsWith("www.")) d = d.slice(4);
  for (const g of WB_GLOBAL_DOMAINS) {
    if (d === g || d.endsWith(`.${g}`)) return "global";
  }
  return "cn";
}
function wbBillingBase(domain) {
  if (wbRegionOf(domain) !== "global") return WB_CN_BILLING_BASE;
  return domain.toLowerCase().includes("codebuddy.ai") ? "https://www.codebuddy.ai" : "https://www.workbuddy.ai";
}
function wbChatBase(domain) {
  if (wbRegionOf(domain) !== "global") return WB_CN_CHAT_BASE;
  return domain.toLowerCase().includes("codebuddy.ai") ? "https://www.codebuddy.ai" : "https://www.workbuddy.ai";
}
function wbDomainOf(cred) {
  const domain = strOf(cred.raw, "domain");
  if (domain) return domain;
  const regionRaw = strOf(cred.raw, "region");
  const region = regionRaw ? regionRaw.toLowerCase() : detect_region_from_token(cred.secret ?? "");
  return region === "cn" ? "copilot.tencent.com" : "https://www.workbuddy.ai";
}
async function postJson(url, headers, body) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REFRESH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: body !== void 0 ? JSON.stringify(body) : void 0,
      signal: abort.signal
    });
  } catch (err) {
    throw new RefreshError(`\u5237\u65B0\u8BF7\u6C42\u5931\u8D25:${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new RefreshError(`\u5237\u65B0\u7AEF\u70B9\u8FD4\u56DE HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new RefreshError("\u5237\u65B0\u5E94\u7B54\u4E0D\u662F\u5408\u6CD5 JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RefreshError("\u5237\u65B0\u5E94\u7B54\u4E0D\u662F JSON \u5BF9\u8C61");
  }
  return payload;
}
async function refreshTraeToken(cred) {
  if (!cred.refreshSecret) {
    throw new RefreshCredentialError("\u65E0 refresh token,\u8BF7\u5728\u5BA2\u6237\u7AEF\u91CD\u65B0\u767B\u5F55\u540E\u91CD\u65B0\u53D1\u73B0");
  }
  const contract = traeContractOf(cred);
  const userId = traeUserId(cred);
  const refreshToken = cred.refreshSecret.trim();
  const body = {
    ClientID: contract.clientId,
    ClientSecret: "",
    RefreshToken: refreshToken,
    UserID: userId
  };
  const extra = {};
  if (contract.deviceInfo) {
    const deviceId = strOf(cred.raw, "device_id");
    const machineId = strOf(cred.raw, "machine_id");
    if (!deviceId || !machineId) {
      throw new RefreshCredentialError(
        "TRAE SOLO \u5237\u65B0\u9700\u8981 device_id \u4E0E machine_id,\u51ED\u636E\u91CC\u6CA1\u6709\u3002\u8BF7\u5728\u5BA2\u6237\u7AEF\u91CD\u65B0\u767B\u5F55\u540E\u91CD\u65B0\u5BFC\u5165\u3002"
      );
    }
    const keypair = cred.raw["device_keypair"];
    const pem = keypair && typeof keypair === "object" ? keypair["private_key_pem"] : void 0;
    if (typeof pem !== "string" || pem.length === 0) {
      throw new RefreshCredentialError(
        "TRAE SOLO \u5237\u65B0\u9700\u8981 device_keypair(\u8BBE\u5907\u7ED1\u5B9A\u5BC6\u94A5\u5BF9),\u51ED\u636E\u91CC\u6CA1\u6709\u3002\u8BF7\u5728\u5BA2\u6237\u7AEF\u91CD\u65B0\u767B\u5F55\u540E\u91CD\u65B0\u5BFC\u5165\u51ED\u636E\u3002"
      );
    }
    body["DeviceInfo"] = {
      DeviceID: deviceId,
      MachineID: machineId,
      PlatformCode: "SOLO_PC",
      DeviceType: "PC",
      DeviceName: strOf(cred.raw, "device_name") ?? "as-one",
      ClientVersion: strOf(cred.raw, "build_version") ?? ""
    };
    body["DeviceProof"] = traeDeviceProof(contract.path, contract.clientId, refreshToken, pem);
    extra["device_keypair"] = keypair;
  }
  const payload = await postJson(traeRefreshHost(cred) + contract.path, { "Content-Type": "application/json" }, body);
  const parsed = parse_refresh_response(payload);
  if (!Number.isFinite(parsed.expiresAt)) {
    throw new RefreshError("trae \u5237\u65B0\u5E94\u7B54\u672A\u8FD4\u56DE TokenExpireAt");
  }
  return {
    accessToken: parsed.accessToken,
    expiresAtMs: Math.round(parsed.expiresAt * 1e3),
    refreshToken: parsed.refreshToken,
    extra
  };
}
async function refreshWorkbuddyToken(cred) {
  if (!cred.refreshSecret) {
    throw new RefreshCredentialError("\u65E0 refresh token,\u8BF7\u5728\u5BA2\u6237\u7AEF\u91CD\u65B0\u767B\u5F55\u540E\u91CD\u65B0\u53D1\u73B0");
  }
  const domain = wbDomainOf(cred);
  const origin = wbBillingBase(domain);
  const uid = strOf(cred.raw, "uid") ?? (cred.secret ? jwt_claim(cred.secret, "sub") || void 0 : void 0);
  const enterpriseId = strOf(cred.raw, "enterprise_id");
  const headers = {
    ...build_refresh_headers(cred.refreshSecret),
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    Origin: origin,
    Referer: `${origin}/`,
    "User-Agent": WB_CLIENT_UA,
    "X-Auth-Refresh-Source": "workbuddy"
  };
  if (uid) headers["X-User-Id"] = uid;
  if (enterpriseId) headers["X-Enterprise-Id"] = enterpriseId;
  const payload = await postJson(wbChatBase(domain) + WB_REFRESH_PATH, headers);
  const parsed = parse_refresh_response2(payload);
  return {
    accessToken: parsed.accessToken,
    // 上游可能不给 expiresIn → core 返回 Infinity;此时保留旧到期(Nexus 语义)。
    expiresAtMs: Number.isFinite(parsed.expiresAt) ? Math.round(parsed.expiresAt * 1e3) : null,
    refreshToken: parsed.refreshToken
  };
}

// ../panel/src/qoder.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join3 } from "node:path";
var CACHE_TTL_MS = 5 * 60 * 1e3;
function ensureQoderProviderRow(db, region) {
  const cfg = QODER_REGION_CONFIGS[region];
  const row = db.provider.get(region);
  if (row === void 0) {
    db.provider.insert({
      id: region,
      base_url: cfg.gateway,
      protocol: "qoder",
      env_prefix: `ONE_${region.toUpperCase().replace(/-/g, "_")}`
    });
    return;
  }
  if (row.protocol !== "qoder") {
    db.provider.update({ id: region, protocol: "qoder" });
  }
}
function stripMemberFromLogicalModels(db, provider, model) {
  let removed = 0;
  for (const row of db.logicalModel.list()) {
    const parsed = parseDbMembers(row.members);
    const kept = parsed.filter((m) => !(m.provider === provider && m.model === model));
    if (kept.length === parsed.length) continue;
    db.logicalModel.update({ name: row.name, members: JSON.stringify(kept) });
    removed += parsed.length - kept.length;
  }
  return removed;
}
function syncSelectedRealModels(db, region, models, wanted) {
  ensureQoderProviderRow(db, region);
  const byKey = new Map(models.map((m) => [m.key, m]));
  let added = 0;
  let kept = 0;
  const skipped = [];
  for (const key3 of wanted) {
    const m = byKey.get(key3);
    if (m === void 0) {
      skipped.push(key3);
      continue;
    }
    const row = db.realModel.get(region, key3);
    db.realModel.set({
      provider: region,
      model: key3,
      name: row?.name ?? m.displayName,
      supports_vision: row?.supports_vision ?? (m.isVl ? 1 : 0),
      // 上下文窗口:库里没有才按上游补,且优先取 `context_config` 的**最大档**
      // (用户 2026-10-31:m37040 显示 200000 而上游 1M 档白扔 —— 取最大档)。
      max_input_tokens: row?.max_input_tokens ?? m.maxContextTokens ?? m.maxInputTokens ?? null,
      max_output_tokens: row?.max_output_tokens ?? m.maxOutputTokens ?? null,
      hidden: 0,
      concurrency: row !== void 0 && row.concurrency > 0 ? row.concurrency : 1,
      // 非思考模型写 `"[]"`(网关一律不传 reasoning_effort);
      // 思考模型写 null(不拦,交给上游)。
      supported_reasoning_efforts: row?.supported_reasoning_efforts ?? (m.isReasoning ? null : "[]"),
      reasoning_allows_off: row?.reasoning_allows_off ?? null
    });
    if (row === void 0) added += 1;
    else kept += 1;
  }
  let removed = 0;
  let stripped = 0;
  for (const row of db.realModel.listByProvider(region)) {
    if (wanted.has(row.model)) continue;
    stripped += stripMemberFromLogicalModels(db, region, row.model);
    db.realModel.delete(region, row.model);
    removed += 1;
  }
  return { added, kept, skipped, removed, stripped };
}
function createQoderDomain(ctx) {
  const catalogs = /* @__PURE__ */ new Map();
  const selectionPath = join3(ctx.configDir, "qoder-models.json");
  let selection = loadSelection();
  function loadSelection() {
    try {
      if (!existsSync2(selectionPath)) return { version: 1, selected: {} };
      const parsed = JSON.parse(readFileSync2(selectionPath, "utf8"));
      const selected = {};
      for (const [region, keys] of Object.entries(parsed.selected ?? {})) {
        if (!isQoderRegion(region)) continue;
        if (!Array.isArray(keys)) continue;
        selected[region] = keys.filter((k) => typeof k === "string");
      }
      return { version: 1, selected };
    } catch {
      return { version: 1, selected: {} };
    }
  }
  function saveSelection() {
    try {
      writeFileSync2(selectionPath, JSON.stringify(selection, null, 2), "utf8");
    } catch {
    }
  }
  function visualSelection(region) {
    const stored = selection.selected[region] ?? [];
    if (stored.length > 0) return new Set(stored);
    const entry = catalogs.get(region);
    if (entry === void 0) return /* @__PURE__ */ new Set();
    return new Set(
      entry.models.filter((m) => m.isDefault || m.enable).map((m) => m.key)
    );
  }
  function applySelectionToDb(region, wanted) {
    const applied = syncSelectedRealModels(
      ctx.db,
      region,
      catalogs.get(region)?.models ?? [],
      wanted
    );
    try {
      ctx.scheduler.invalidate();
    } catch {
    }
    ctx.syncRegistry();
    return applied;
  }
  async function accountsOf(region) {
    const all = await ctx.vault.list(region);
    return all.filter((c) => c.provider === region);
  }
  async function patOf(region, account) {
    const rows = await accountsOf(region);
    const candidates = account === void 0 || account === "" ? rows : rows.filter((r) => r.username === account);
    for (const row of candidates) {
      if (isDisabled(row.provider, row.username)) continue;
      const cred = await ctx.vault.get(row.provider, row.username);
      const pat = cred?.secret ?? "";
      if (pat !== "") return { name: row.username, pat };
    }
    return null;
  }
  function isDisabled(provider, username) {
    return ctx.accountOverlay.get(`${provider}/${username}`) === false;
  }
  function errorTextOf(error) {
    if (error instanceof QoderUpstreamError) return error.message;
    if (error instanceof Error) return error.message;
    return String(error);
  }
  async function refreshCatalog(region, force = false) {
    const cached = catalogs.get(region);
    if (!force && cached !== void 0 && Date.now() - cached.fetchedAtMs < CACHE_TTL_MS) return cached;
    const pat = await patOf(region);
    if (pat === null) {
      const entry = {
        fetchedAtMs: cached?.fetchedAtMs ?? 0,
        models: cached?.models ?? [],
        error: "\u6CA1\u6709\u53EF\u7528\u7684 PAT \u8D26\u53F7\uFF08\u5148\u5728\u8D26\u53F7\u6C60\u91CC\u6DFB\u52A0\u4E00\u4E2A pt-\u2026 \u51ED\u636E\uFF09"
      };
      catalogs.set(region, entry);
      return entry;
    }
    try {
      const models = await getQoderClient(region).fetchModels(pat.pat);
      const entry = { fetchedAtMs: Date.now(), models, error: null };
      catalogs.set(region, entry);
      return entry;
    } catch (error) {
      const entry = {
        fetchedAtMs: cached?.fetchedAtMs ?? 0,
        models: cached?.models ?? [],
        error: errorTextOf(error)
      };
      catalogs.set(region, entry);
      return entry;
    }
  }
  function toCatalogRows(region, entry) {
    const selected = new Set(selection.selected[region] ?? []);
    return entry.models.map((m) => ({
      region,
      key: m.key,
      displayName: m.displayName,
      selected: selected.size === 0 ? m.isDefault || m.enable : selected.has(m.key),
      upstreamEnabled: m.enable,
      isDefault: m.isDefault,
      isReasoning: m.isReasoning,
      isVl: m.isVl,
      isFree: m.isFree,
      priceFactor: m.priceFactor ?? null,
      maxInputTokens: m.maxInputTokens ?? null,
      maxContextTokens: m.maxContextTokens ?? null,
      maxOutputTokens: m.maxOutputTokens ?? null
    }));
  }
  return {
    methods: {
      async getQoderAccounts() {
        const clients2 = QODER_REGIONS.map((region) => getQoderClient(region));
        const accounts = [];
        for (const region of QODER_REGIONS) {
          const rows = await accountsOf(region);
          const catalog = catalogs.get(region);
          const lastError = clients2.find((c) => c.region === region)?.recentErrors()[0] ?? null;
          for (const row of rows) {
            const cred = await ctx.vault.get(row.provider, row.username);
            const raw = row.raw ?? {};
            accounts.push({
              region,
              account: row.username,
              enabled: !isDisabled(region, row.username),
              hasPat: (cred?.secret ?? "") !== "",
              patHint: fpOf(cred?.secret),
              uid: typeof raw["uid"] === "string" ? raw["uid"] : null,
              userType: typeof raw["userType"] === "string" ? raw["userType"] : null,
              expiresAt: row.expiresAt ?? null,
              models: catalog?.models.length ?? 0,
              lastError: lastError?.body ?? null
            });
          }
        }
        return { accounts, count: accounts.length };
      },
      async getQoderStatus() {
        const regions = [];
        for (const region of QODER_REGIONS) {
          const config = QODER_REGION_CONFIGS[region];
          const client = getQoderClient(region);
          const rows = await accountsOf(region);
          const catalog = catalogs.get(region);
          const errors = client.recentErrors();
          regions.push({
            region,
            label: config.label,
            gateway: config.gateway,
            openapi: config.openapi,
            accounts: rows.length,
            enabledAccounts: rows.filter((r) => !isDisabled(region, r.username)).length,
            catalogModels: catalog?.models.length ?? 0,
            catalogFetchedAtMs: catalog?.fetchedAtMs ?? null,
            catalogError: catalog?.error ?? null,
            lastError: errors[0] ?? null,
            requiresDeviceRisk: config.requiresDeviceRisk
          });
        }
        return { checkedAtMs: Date.now(), regions };
      },
      async getQoderModels(region) {
        const target = isQoderRegion(region) ? region : void 0;
        const out = [];
        for (const r of target === void 0 ? QODER_REGIONS : [target]) {
          const entry = await refreshCatalog(r);
          out.push(...toCatalogRows(r, entry));
        }
        return out;
      },
      async qoderRefreshCatalog(region) {
        const target = isQoderRegion(region) ? region : void 0;
        const changed = [];
        const messages = [];
        for (const r of target === void 0 ? QODER_REGIONS : [target]) {
          const entry = await refreshCatalog(r, true);
          if (entry.error !== null) {
            messages.push(`${QODER_REGION_CONFIGS[r].label}: ${entry.error}`);
            continue;
          }
          changed.push(`${r}:${entry.models.length}`);
          messages.push(`${QODER_REGION_CONFIGS[r].label}: ${entry.models.length} \u4E2A\u6A21\u578B`);
        }
        return {
          ok: messages.every((m) => !m.includes("\u5931\u8D25")),
          message: messages.join("\uFF1B") || "\u76EE\u5F55\u5237\u65B0\u5B8C\u6210",
          changed
        };
      },
      async qoderSetModelEnabled(region, key3, enabled) {
        if (!isQoderRegion(region)) return { ok: false, message: `\u672A\u77E5\u533A\u57DF: ${region}` };
        const modelKey = String(key3 ?? "").trim();
        if (modelKey === "") return { ok: false, message: "\u6A21\u578B\u952E\u4E0D\u80FD\u4E3A\u7A7A" };
        const entry = await refreshCatalog(region);
        const next = visualSelection(region);
        if (enabled) next.add(modelKey);
        else next.delete(modelKey);
        const applied = applySelectionToDb(region, next);
        selection = { version: 1, selected: { ...selection.selected, [region]: [...next] } };
        saveSelection();
        const parts = [enabled ? `\u5DF2\u52FE\u9009 ${modelKey}` : `\u5DF2\u53D6\u6D88 ${modelKey}`];
        if (applied.added > 0) parts.push(`\u65B0\u767B\u8BB0 ${applied.added} \u4E2A\u7AEF\u70B9`);
        if (applied.removed > 0) parts.push(`\u5220\u9664 ${applied.removed} \u4E2A\u7AEF\u70B9`);
        if (applied.stripped > 0) parts.push(`\u4ECE\u903B\u8F91\u6A21\u578B\u6863\u94FE\u8FDE\u9501\u6458\u9664 ${applied.stripped} \u5904`);
        if (applied.skipped.length > 0) {
          parts.push(
            `\u76EE\u5F55\u91CC\u627E\u4E0D\u5230 ${applied.skipped.join(",")},\u672A\u767B\u8BB0(\u5148\u70B9\u300C\u5237\u65B0\u76EE\u5F55\u300D)`
          );
        }
        if (entry.error !== null) parts.push(`\u76EE\u5F55\u5237\u65B0\u5931\u8D25:${entry.error}`);
        return {
          ok: applied.skipped.length === 0 || !enabled,
          message: parts.join("\uFF1B"),
          changed: [...next].map((k) => `${region}/${k}`)
        };
      },
      async qoderCredits(region, account) {
        if (!isQoderRegion(region)) return [];
        const rows = await accountsOf(region);
        const targets = account === void 0 || account === "" ? rows.map((r) => r.username) : [account];
        const out = [];
        for (const name2 of targets) {
          const cred = await ctx.vault.get(region, name2);
          const pat = cred?.secret ?? "";
          if (pat === "") {
            out.push(emptyCredits(region, name2, "\u8BE5\u8D26\u53F7\u6CA1\u6709 PAT \u51ED\u636E"));
            continue;
          }
          try {
            const usage = await getQoderClient(region).fetchUsage(pat);
            out.push(creditsView(region, name2, usage));
          } catch (error) {
            out.push(emptyCredits(region, name2, errorTextOf(error)));
          }
        }
        return out;
      },
      async qoderCheckin(region, account) {
        if (!isQoderRegion(region)) return [];
        const pat = await patOf(region, account);
        if (pat === null) {
          return [
            {
              region,
              account: account ?? "",
              status: "unavailable",
              amount: null,
              validityDays: null,
              nextRefreshAtMs: null,
              message: "\u6CA1\u6709\u53EF\u7528\u7684 PAT \u8D26\u53F7"
            }
          ];
        }
        try {
          const outcome = await getQoderClient(region).claimDailyCredits(pat.pat);
          if (outcome.status === "claimed") {
            return [
              {
                region,
                account: pat.name,
                status: "claimed",
                amount: outcome.amount ?? null,
                validityDays: outcome.validityDays ?? null,
                nextRefreshAtMs: outcome.nextRefreshAtMs ?? null,
                message: `\u5DF2\u9886\u53D6${outcome.amount === void 0 ? "" : ` ${outcome.amount} Credits`}`
              }
            ];
          }
          if (outcome.status === "already-claimed") {
            return [
              {
                region,
                account: pat.name,
                status: "already-claimed",
                amount: null,
                validityDays: null,
                nextRefreshAtMs: outcome.nextRefreshAtMs ?? null,
                message: "\u4ECA\u65E5\u5DF2\u9886\u53D6"
              }
            ];
          }
          return [
            {
              region,
              account: pat.name,
              status: "unavailable",
              amount: null,
              validityDays: null,
              nextRefreshAtMs: null,
              message: outcome.message
            }
          ];
        } catch (error) {
          return [
            {
              region,
              account: pat.name,
              status: "unavailable",
              amount: null,
              validityDays: null,
              nextRefreshAtMs: null,
              message: errorTextOf(error)
            }
          ];
        }
      },
      async qoderCampaigns(region, account) {
        if (!isQoderRegion(region)) return { campaigns: [], error: `\u672A\u77E5\u533A\u57DF: ${region}` };
        const pat = await patOf(region, account);
        if (pat === null) return { campaigns: [], error: "\u6CA1\u6709\u53EF\u7528\u7684 PAT \u8D26\u53F7" };
        try {
          const campaigns = await getQoderClient(region).fetchCampaigns(pat.pat);
          return { campaigns, error: null };
        } catch (error) {
          return { campaigns: [], error: errorTextOf(error) };
        }
      },
      async qoderAddAccount(region, name2, pat) {
        if (!isQoderRegion(region)) return { ok: false, message: `\u672A\u77E5\u533A\u57DF: ${region}\uFF08\u53EA\u652F\u6301 qoder / qoder-global\uFF09` };
        const username = String(name2 ?? "").trim();
        const token = String(pat ?? "").trim();
        if (username === "") return { ok: false, message: "\u8D26\u53F7\u540D\u4E0D\u80FD\u4E3A\u7A7A" };
        if (token === "") return { ok: false, message: "PAT \u4E0D\u80FD\u4E3A\u7A7A\uFF08\u5E94\u4EE5 pt- \u5F00\u5934\uFF09" };
        ensureQoderProviderRow(ctx.db, region);
        await ctx.vault.put({ provider: region, username, secret: token, raw: { kind: "pat" } });
        ctx.accountOverlay.set(`${region}/${username}`, true);
        try {
          const models = await getQoderClient(region).fetchModels(token);
          catalogs.set(region, { fetchedAtMs: Date.now(), models, error: null });
          return { ok: true, message: `\u5DF2\u6DFB\u52A0 ${username}\uFF08\u4E0A\u6E38\u8FD4\u56DE ${models.length} \u4E2A\u6A21\u578B\uFF09`, provider: region, username };
        } catch (error) {
          return {
            ok: false,
            message: `\u51ED\u636E\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u4E0A\u6E38\u6821\u9A8C\u5931\u8D25: ${errorTextOf(error)}`,
            provider: region,
            username
          };
        }
      },
      async qoderRemoveAccount(region, name2) {
        if (!isQoderRegion(region)) return { ok: false, message: `\u672A\u77E5\u533A\u57DF: ${region}` };
        const removed = await ctx.vault.remove(region, name2);
        ctx.accountOverlay.delete(`${region}/${name2}`);
        return {
          ok: removed,
          message: removed ? `\u5DF2\u5220\u9664 ${name2}` : `\u6CA1\u6709\u627E\u5230\u8D26\u53F7 ${name2}`,
          provider: region,
          username: name2
        };
      },
      async qoderSetAccountEnabled(region, name2, enabled) {
        if (!isQoderRegion(region)) return { ok: false, message: `\u672A\u77E5\u533A\u57DF: ${region}` };
        ctx.accountOverlay.set(`${region}/${name2}`, Boolean(enabled));
        return { ok: true, message: `${name2} \u5DF2${enabled ? "\u542F\u7528" : "\u505C\u7528"}`, provider: region, username: name2 };
      },
      /**
       * 连通性探针:真的发一次最小 chat（8 token 上限的流式请求），只取首帧。
       *
       * 为什么不复用 `getToken`:Qoder 的签名与报文体绑定，只有真发一次 body 才能
       * 证明「PAT → jobToken → cosy 会话 → 编码 → 签名 → SSE」整条链路通。这里
       * 只读首帧、立刻中止，成本与一次健康检查相当。
       */
      async qoderProbeChat(region, name2) {
        if (!isQoderRegion(region)) return { ok: false, message: `\u672A\u77E5\u533A\u57DF: ${region}` };
        const pat = await patOf(region, name2);
        if (pat === null) return { ok: false, message: "\u6CA1\u6709\u53EF\u7528\u7684 PAT \u8D26\u53F7" };
        const controller = new AbortController();
        try {
          let head = "";
          for await (const chunk of getQoderClient(region).chatStream(
            pat.pat,
            {
              modelKey: (selection.selected[region] ?? [])[0] ?? "lite",
              messages: [{ role: "user", content: "ping" }]
            },
            controller.signal
          )) {
            head = chunk.content !== "" ? chunk.content : chunk.reasoning;
            break;
          }
          return { ok: true, message: `\u94FE\u8DEF\u6B63\u5E38${head === "" ? "" : `\uFF08\u9996\u5E27: ${head.slice(0, 40)}\uFF09`}`, provider: region, username: pat.name };
        } catch (error) {
          return { ok: false, message: `\u94FE\u8DEF\u63A2\u6D4B\u5931\u8D25: ${errorTextOf(error)}`, provider: region, username: pat.name };
        } finally {
          controller.abort();
        }
      },
      async qoderRecentErrors() {
        const errors = [];
        for (const region of QODER_REGIONS) errors.push(...getQoderClient(region).recentErrors());
        errors.sort((a, b) => b.atMs - a.atMs);
        return { errors: errors.slice(0, 8) };
      }
    }
  };
}
function creditsView(region, account, usage) {
  return {
    region,
    account,
    ok: true,
    error: null,
    userType: usage.userType ?? null,
    expiresAt: usage.expiresAt ?? null,
    userQuota: usage.userQuota ? {
      total: usage.userQuota.total ?? null,
      used: usage.userQuota.used ?? null,
      remaining: usage.userQuota.remaining ?? null,
      percentage: usage.userQuota.percentage ?? null
    } : null,
    addOnQuota: usage.addOnQuota ? {
      total: usage.addOnQuota.total ?? null,
      used: usage.addOnQuota.used ?? null,
      remaining: usage.addOnQuota.remaining ?? null,
      percentage: usage.addOnQuota.percentage ?? null,
      detailUrl: usage.addOnQuota.detailUrl ?? null
    } : null,
    orgResourcePackage: usage.orgResourcePackage ? {
      used: usage.orgResourcePackage.used ?? null,
      cap: usage.orgResourcePackage.cap ?? null,
      remaining: usage.orgResourcePackage.remaining ?? null,
      percentage: usage.orgResourcePackage.percentage ?? null,
      available: usage.orgResourcePackage.available
    } : null,
    isQuotaExceeded: usage.isQuotaExceeded
  };
}
function emptyCredits(region, account, error) {
  return {
    region,
    account,
    ok: false,
    error,
    userType: null,
    expiresAt: null,
    userQuota: null,
    addOnQuota: null,
    orgResourcePackage: null,
    isQuotaExceeded: false
  };
}

// ../panel/src/sensenova.ts
function createSensenovaDomain(ctx, deps) {
  const snUserOf = (name2) => {
    const s = String(name2 ?? "").trim();
    const slash = s.indexOf("/");
    if (slash >= 0 && s.slice(0, slash) === "sensenova") return s.slice(slash + 1);
    return sensenova_username(s);
  };
  const snLoginState = {
    chain: Promise.resolve(),
    lastDoneAtMs: 0,
    running: 0,
    waitMs: 2e3
  };
  const snSerialized = (fn) => {
    snLoginState.running++;
    const run = snLoginState.chain.then(async () => {
      const gapMs = Math.max(0, snLoginState.lastDoneAtMs + snLoginState.waitMs - Date.now());
      if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
      try {
        return await fn();
      } finally {
        snLoginState.lastDoneAtMs = Date.now();
        snLoginState.running--;
      }
    });
    snLoginState.chain = run.then(() => void 0, () => void 0);
    return run;
  };
  const snRefreshState = { running: 0 };
  const snLedger = {
    startedAtMs: null,
    lastRunAtMs: null,
    lastElapsedS: null,
    lastOk: null,
    lastError: null,
    result: "\u5C1A\u672A\u6267\u884C\u8FC7\u767B\u5F55\u6216\u5237\u65B0",
    lastRunAccounts: []
  };
  const snCred = (username) => ctx.vault.get("sensenova", username);
  const snStorePassword = async (username, password) => {
    if (!password) return;
    await ctx.vault.put({ provider: "sensenova", username, refreshSecret: password });
  };
  const snStoreKey = async (username, apiKey) => {
    await ctx.vault.put({ provider: "sensenova", username, secret: apiKey });
  };
  const snAuthFlow = async (username) => {
    const account = `sensenova/${username}`;
    const cred = await snCred(username);
    const rawJwt = cred?.raw?.console_jwt;
    const rawRefresh = cred?.raw?.console_refresh_token;
    const hasRefresh = typeof rawRefresh === "string" && rawRefresh !== "";
    if (typeof rawJwt === "string" && rawJwt !== "") {
      const exp = jwt_expiry_epoch_s(rawJwt);
      if (exp === null || exp > wallNow() + 30) {
        const f2 = new SensenovaAuthFlow();
        f2.jwtCache.set(
          sensenova_username(account),
          rawJwt
        );
        return f2;
      }
    }
    if (hasRefresh) {
      try {
        const f2 = new SensenovaAuthFlow();
        const fresh = await f2.refreshConsoleJwt(account, rawRefresh);
        await snStoreConsoleJwt(username, fresh);
        return f2;
      } catch {
      }
    }
    const pwd = cred?.refreshSecret ?? null;
    if (!pwd) {
      throw new UpstreamError2(
        "auth",
        "\u65E2\u6CA1\u6709\u53EF\u7528\u7684\u63A7\u5236\u53F0\u4EE4\u724C/\u7EED\u671F\u51ED\u8BC1,\u4E5F\u6CA1\u6709\u5DF2\u4FDD\u5B58\u5BC6\u7801 \u2014\u2014 \u8BF7\u70B9\u300C\u767B\u5F55\u5E76\u6293 key\u300D\u8F93\u4E00\u6B21\u5BC6\u7801(\u4E4B\u540E\u4F1A\u5B58\u4E0B\u6765)",
        false,
        401
      );
    }
    const f = await snSerialized(async () => {
      const nf = new SensenovaAuthFlow();
      await nf.login(account, username, pwd);
      return nf;
    });
    const jwt = f.jwtFor(account);
    if (jwt) {
      try {
        await snStoreConsoleJwt(username, jwt);
      } catch {
      }
    }
    const rt = f.refreshTokenFor(account);
    if (rt) {
      try {
        await snStoreConsoleRefreshToken(username, rt);
      } catch {
      }
    }
    return f;
  };
  const SN_KEY_PROBE_WAIT_S = 12;
  const snProbeKey = async (apiKey, waitForNew = false) => {
    if (!apiKey) return "invalid";
    const deadline = Date.now() + SN_KEY_PROBE_WAIT_S * 1e3;
    for (; ; ) {
      let status = 0;
      try {
        const res = await fetch("https://token.sensenova.cn/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
        });
        status = res.status;
      } catch {
        return "unknown";
      }
      if (status === 200) return "ok";
      if (status !== 401 && status !== 403) return "unknown";
      if (!waitForNew || Date.now() >= deadline) return "invalid";
      await new Promise((r) => setTimeout(r, 2e3));
    }
  };
  const snRepairInflight = /* @__PURE__ */ new Map();
  const snRepairKeyRun = async (username, reason) => {
    const cred = await snCred(username);
    const current = cred?.secret?.trim() ?? "";
    if (current !== "") {
      const verdict = await snProbeKey(current);
      if (verdict === "ok") {
        return {
          ok: false,
          message: `API key \u5B9E\u6D4B\u53EF\u7528(\u63A2\u9488 200),\u672C\u6B21\u5931\u8D25\u539F\u56E0\u4E0D\u662F key:${reason} \u2014\u2014 \u672A\u6539\u52A8\u51ED\u636E`,
          created: false,
          dropped: []
        };
      }
      if (verdict === "unknown") {
        return {
          ok: false,
          message: `\u63A2\u4E0D\u6E05 API key \u662F\u5426\u6709\u6548(\u975E 401/403 \u54CD\u5E94\u6216\u7F51\u7EDC\u4E0D\u901A),\u4E0D\u64C5\u81EA\u5220 key:${reason} \u2014\u2014 \u672A\u6539\u52A8\u51ED\u636E`,
          created: false,
          dropped: []
        };
      }
    }
    try {
      const account = `sensenova/${username}`;
      const flow = await snAuthFlow(username);
      let staleIds = [];
      if (current !== "") {
        const keys = await flow.list_api_keys(account).catch(() => []);
        staleIds = keys.filter((k) => k.api_key === current).map((k) => k.id);
      }
      const r = await flow.ensure_api_key_replacing(account, staleIds);
      const verdict = r.created ? await snProbeKey(r.apiKey, true) : await snProbeKey(r.apiKey);
      await snStoreKey(username, r.apiKey);
      await deps.syncSensenovaPool(ctx.vault);
      const msg = staleIds.length > 0 ? `\u539F API key \u5DF2\u5931\u6548,\u5DF2\u65B0\u5EFA 1 \u628A\u5E76\u5220\u9664\u5931\u6548\u7684\u90A3\u628A(${r.dropped.length}/${staleIds.length} \u4E2A\u5DF2\u5220)` : r.created ? "\u8D26\u53F7\u4E0B\u6CA1\u6709\u53EF\u7528 API key,\u5DF2\u65B0\u5EFA 1 \u628A" : "\u5DF2\u91CD\u65B0\u53D6\u56DE\u8D26\u53F7\u4E0B\u7684 API key";
      if (r.created && verdict !== "ok") {
        return {
          ok: true,
          message: `${msg};\u5DF2\u7B49 ${SN_KEY_PROBE_WAIT_S}s \u4ECD${verdict === "unknown" ? "\u63A2\u4E0D\u6E05" : "\u672A\u751F\u6548"},\u8BF7\u7A0D\u5019\u91CD\u8BD5`,
          created: r.created,
          dropped: r.dropped
        };
      }
      return { ok: true, message: msg, created: r.created, dropped: r.dropped };
    } catch (err) {
      const detail2 = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `\u4FEE\u590D API key \u5931\u8D25:${detail2}`, created: false, dropped: [] };
    }
  };
  const snRepairKey = async (username, reason) => {
    const existing = snRepairInflight.get(username);
    if (existing) return existing;
    const p = snRepairKeyRun(username, reason).catch(
      (err) => ({
        ok: false,
        message: `\u4FEE\u590D API key \u5F02\u5E38:${err instanceof Error ? err.message : String(err)}`,
        created: false,
        dropped: []
      })
    ).finally(() => snRepairInflight.delete(username));
    snRepairInflight.set(username, p);
    return p;
  };
  const snStoreConsoleRefreshToken = async (username, token) => {
    const existing = await snCred(username);
    await ctx.vault.put({
      provider: "sensenova",
      username,
      raw: { ...existing?.raw ?? {}, console_refresh_token: token }
    });
  };
  const snStoreConsoleJwt = async (username, jwt) => {
    const existing = await snCred(username);
    await ctx.vault.put({
      provider: "sensenova",
      username,
      raw: { ...existing?.raw ?? {}, console_jwt: jwt }
    });
  };
  const snQuotaCooldownMs = () => {
    const raw = ctx.db.setting.get("external_refresh.interval_hours")?.v ?? "5";
    const hours = Number(raw);
    const h = Number.isFinite(hours) && hours > 0 ? hours : 5;
    return h * 3600 * 1e3;
  };
  const snQuotaCache = /* @__PURE__ */ new Map();
  const snQuotaGate = /* @__PURE__ */ new Map();
  const snQuotaInflight = /* @__PURE__ */ new Map();
  const snQuotaError = /* @__PURE__ */ new Map();
  const snQuotaFetch = async (username) => {
    const account = `sensenova/${username}`;
    const bail = (reason) => {
      snQuotaError.set(username, reason);
      return null;
    };
    const cred = await snCred(username);
    const rawJwt = cred?.raw?.console_jwt;
    const rawRefresh = cred?.raw?.console_refresh_token;
    const hasRefresh = typeof rawRefresh === "string" && rawRefresh !== "";
    if (typeof rawJwt !== "string" || rawJwt === "") {
      if (hasRefresh) {
        try {
          const f = new SensenovaAuthFlow();
          const fresh = await f.refreshConsoleJwt(account, rawRefresh);
          await snStoreConsoleJwt(username, fresh);
          return fetchPoolWith(f, fresh);
        } catch (err) {
          return bail(
            `\u6CA1\u6709\u63A7\u5236\u53F0\u4EE4\u724C,\u81EA\u52A8\u7EED\u671F\u4E5F\u5931\u8D25:${err instanceof Error ? err.message : String(err)} \u2014\u2014 \u8BF7\u5728\u4E0B\u65B9\u300C\u767B\u5F55\u5E76\u6293 key\u300D\u91CD\u65B0\u767B\u5F55\u4E00\u6B21`
          );
        }
      }
      return bail("\u6CA1\u6709\u63A7\u5236\u53F0\u4EE4\u724C \u2014\u2014 \u8BF7\u5728\u4E0B\u65B9\u300C\u767B\u5F55\u5E76\u6293 key\u300D");
    }
    const exp = jwt_expiry_epoch_s(rawJwt);
    const expired = exp !== null && exp <= wallNow() + 30;
    let flow = new SensenovaAuthFlow();
    let jwt = expired ? void 0 : rawJwt;
    if (expired) {
      if (hasRefresh) {
        try {
          const f = new SensenovaAuthFlow();
          jwt = await f.refreshConsoleJwt(account, rawRefresh);
          await snStoreConsoleJwt(username, jwt);
          flow = f;
        } catch (err) {
          jwt = void 0;
          void err;
        }
      }
      if (!jwt) {
        const pwd = cred?.refreshSecret ?? null;
        if (!pwd) {
          return bail(
            `\u63A7\u5236\u53F0\u4EE4\u724C\u5DF2\u4E8E ${exp !== null ? new Date(exp * 1e3).toLocaleString() : "?"} \u8FC7\u671F,\u4E14\u6CA1\u6709\u53EF\u7528\u7684\u7EED\u671F\u51ED\u8BC1\u6216\u5DF2\u4FDD\u5B58\u5BC6\u7801 \u2014\u2014 \u8BF7\u300C\u767B\u5F55\u5E76\u6293 key\u300D\u6216\u300C\u53EA\u4FDD\u5B58\u5BC6\u7801\u300D`
          );
        }
        try {
          flow = await snSerialized(async () => {
            const f = new SensenovaAuthFlow();
            await f.login(account, username, pwd);
            return f;
          });
          jwt = flow.jwtFor(account);
          if (jwt) await snStoreConsoleJwt(username, jwt);
        } catch (err) {
          return bail(
            `\u63A7\u5236\u53F0\u4EE4\u724C\u5DF2\u8FC7\u671F,\u81EA\u52A8\u7EED\u671F\u5931\u8D25:${err instanceof Error ? err.message : String(err)} \u2014\u2014 \u8BF7\u5728\u4E0B\u65B9\u300C\u767B\u5F55\u5E76\u6293 key\u300D\u91CD\u65B0\u767B\u5F55\u4E00\u6B21`
          );
        }
      }
    }
    if (!jwt) return bail("\u62FF\u4E0D\u5230\u63A7\u5236\u53F0\u4EE4\u724C");
    return fetchPoolWith(flow, jwt);
    async function fetchPoolWith(f, token) {
      try {
        const raw = await f.fetch_pool_usage(account, token);
        const parsed = parse_pool_usage(raw);
        const sessionMs = 3 * 3600 * 1e3;
        const quota = {
          account: username,
          pools: parsed.pools.map((p) => ({
            pool_type: p.pool_type ?? "",
            name: p.pool_name ?? "(\u672A\u547D\u540D)",
            w5_limit: p.w5?.limit ?? null,
            w5_used: p.w5?.used ?? null,
            w5_remaining: p.w5?.remaining ?? null,
            w5_reset_at: p.w5?.reset_at ?? null,
            w7_limit: p.w7?.limit ?? null,
            w7_used: p.w7?.used ?? null,
            w7_remaining: p.w7?.remaining ?? null,
            w7_reset_at: p.w7?.reset_at ?? null,
            grant_balance: p.grant_balance,
            grant_expiry: p.grant_expiry,
            grant_expiring_balance: p.grant_expiring_balance
          })),
          grant_balance: parsed.grant_total,
          plan: parsed.plan_name,
          fetched_at: Date.now(),
          remaining: parsed.remaining,
          expires_at: Date.now() + sessionMs
          // 过期为 JWT 换新需求,不是额度到期
        };
        snQuotaCache.set(username, { fetchedAtMs: Date.now(), quota });
        snQuotaError.delete(username);
        return quota;
      } catch (err) {
        return bail(`\u62C9\u53D6\u79EF\u5206\u6C60\u5931\u8D25:${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
  const snMaybeFetchQuota = (username) => {
    const now = Date.now();
    const cooldownMs = snQuotaCooldownMs();
    const cached = snQuotaCache.get(username);
    if (cached && now - cached.fetchedAtMs < cooldownMs) return;
    if (now - (snQuotaGate.get(username) ?? 0) < cooldownMs) return;
    snQuotaGate.set(username, now);
    if (!snQuotaInflight.has(username)) {
      const p = snQuotaFetch(username).finally(() => snQuotaInflight.delete(username));
      snQuotaInflight.set(username, p);
    }
  };
  const snLogin = async (account, username, password, fetchKey = true) => {
    const user = snUserOf(username || account);
    if (!user || !password) {
      return { ok: false, message: "\u8D26\u53F7\u4E0E\u5BC6\u7801\u5747\u4E3A\u5FC5\u586B(\u5BC6\u7801\u4E0D\u56DE\u663E)" };
    }
    const t0 = Date.now();
    snLedger.startedAtMs = t0;
    const record2 = (ok2, result, message, totalKeys) => {
      const now = Date.now();
      snLedger.startedAtMs = t0;
      snLedger.lastRunAtMs = now;
      snLedger.lastElapsedS = Math.round((now - t0) / 1e3 * 10) / 10;
      snLedger.lastOk = ok2;
      snLedger.lastError = ok2 ? null : message;
      snLedger.result = result;
    };
    try {
      const flow = await snSerialized(async () => {
        const f = new SensenovaAuthFlow();
        await f.login(account, user, password);
        return f;
      });
      await snStorePassword(user, password);
      const jwt = flow.jwtFor(account);
      if (jwt) {
        try {
          await snStoreConsoleJwt(user, jwt);
        } catch {
        }
      }
      const refreshToken = flow.refreshTokenFor(account);
      if (refreshToken) {
        try {
          await snStoreConsoleRefreshToken(user, refreshToken);
        } catch {
        }
      }
      if (!fetchKey) {
        record2(true, "\u767B\u5F55\u6210\u529F(\u6309\u8981\u6C42\u672A\u6293\u53D6 API key)", "\u767B\u5F55\u6210\u529F(\u6309\u8981\u6C42\u672A\u6293\u53D6 API key)");
        return { ok: true, account, username: user, logged_in: true, key_updated: false, has_password: true, message: "\u767B\u5F55\u6210\u529F(\u6309\u8981\u6C42\u672A\u6293\u53D6 API key)" };
      }
      try {
        const { apiKey, total, created } = await flow.ensure_api_key(account);
        await snStoreKey(user, apiKey);
        const message = created ? `\u767B\u5F55\u6210\u529F,\u8D26\u53F7\u4E0B\u6CA1\u6709\u53EF\u7528 API key,\u5DF2\u81EA\u52A8\u65B0\u5EFA 1 \u628A(\u73B0\u5171 ${total} \u628A)` : `\u767B\u5F55\u6210\u529F,\u5DF2\u6293\u53D6 API key(\u8D26\u53F7\u4E0B\u5171 ${total} \u628A)`;
        record2(true, message, message, total);
        void snQuotaFetch(user);
        return { ok: true, account, username: user, logged_in: true, key_updated: true, total_keys: total, has_password: true, message };
      } catch (e) {
        const detail2 = e instanceof Error ? e.message : String(e);
        const message = e instanceof UpstreamError2 ? `\u767B\u5F55\u6210\u529F,\u4F46\u6293 API key \u5931\u8D25:${detail2}` : `\u767B\u5F55\u6210\u529F,\u4F46\u6293 key \u5F02\u5E38:${e instanceof Error ? e.constructor.name : typeof e}: ${detail2}`;
        record2(false, message, message);
        return { ok: false, account, username: user, logged_in: true, key_updated: false, has_password: true, message };
      }
    } catch (e) {
      const detail2 = e instanceof Error ? e.message : String(e);
      let message;
      if (e instanceof UpstreamError2 && e.kind === "auth") {
        message = `\u767B\u5F55\u5931\u8D25:${detail2.replace(/^登录失败[:：]\s*/, "")}`;
      } else {
        message = `\u767B\u5F55\u5F02\u5E38:${e instanceof Error ? e.constructor.name : typeof e}: ${detail2}`;
      }
      record2(false, message, message);
      return { ok: false, account, username: user, logged_in: false, key_updated: false, has_password: false, message };
    }
  };
  const methods = {
    // ── SenseNova 登录与账号管理(镜像 Nexus /sensenova/login、/refetch-key、/accounts)──
    /**
     * SenseNova 账号列表(对齐 Nexus `GET /sensenova/accounts` → `_sensenova_accounts`)。
     *
     * 凭据投影,**无明文**。
     */
    async getSensenovaAccounts() {
      const creds = await ctx.vault.list("sensenova").catch(() => []);
      const accounts = [];
      for (let i = 0; i < creds.length; i += 1) {
        const username = snUserOf(creds[i].username);
        const full = await ctx.vault.get("sensenova", creds[i].username);
        const secret = await ctx.vault.secret("sensenova", creds[i].username);
        accounts.push({
          index: i,
          account: username,
          username,
          // D2/D6:没有停用开关;不可用 = 删这一行
          enabled: true,
          has_key: Boolean(secret),
          key_hint: fpOf(secret),
          has_password: Boolean(full?.refreshSecret)
        });
      }
      return { accounts, count: accounts.length };
    },
    async getSensenovaStatus() {
      const pid = "sensenova";
      const pdef = ctx.registry.getProvider(pid);
      const creds = await ctx.vault.list(pid);
      const configAccounts = ctx.registry.listAccounts(pid);
      const enabledByRef = new Map(
        configAccounts.map((a) => [a.credentialRef, ctx.accountOverlay.get(a.credentialRef) ?? a.enabled])
      );
      const lastDay = deps.lastStatsDay();
      const snRows = lastDay ? ctx.db.statsDaily.range(lastDay, lastDay).filter((r) => r.provider === pid) : [];
      let requests = 0, fails = 0, prompt = 0, completion = 0, cached = 0;
      let latencySum = 0, ttftSum = 0, ttftReq = 0;
      for (const r of snRows) {
        requests += r.requests;
        fails += r.fails;
        prompt += r.prompt_tokens;
        completion += r.completion_tokens;
        cached += r.cached_tokens;
        latencySum += r.latency_sum_ms;
        ttftSum += r.ttft_sum_ms;
        ttftReq += r.ttft_requests;
      }
      const genMs = latencySum - ttftSum;
      const nowS = wallNow();
      const leases = ctx.ledger.detail();
      const accounts = [];
      for (let i = 0; i < creds.length; i++) {
        const cred = creds[i];
        const secret = await ctx.vault.secret(pid, cred.username);
        const full = await ctx.vault.get(pid, cred.username);
        const hasPassword = Boolean(full?.refreshSecret);
        const enabled = enabledByRef.get(cred.key) ?? true;
        const inflight = leases.filter((l) => l.endpointId.endsWith(`@${pid}/${cred.username}`)).length;
        let cooling = false;
        let cooldownRemaining = null;
        let lastError = null;
        let lastKind = null;
        let lastUsedAt = null;
        for (const mv of deps.realModelMap(pid).values()) {
          const epId = endpointIdOf(pid, mv.model, cred.username);
          const rec = ctx.health.get(epId);
          if (rec.cooldownUntil > 0 && rec.cooldownUntil > nowS) {
            cooling = true;
            const rem = Math.round((rec.cooldownUntil - nowS) * 10) / 10;
            if (cooldownRemaining === null || rem > cooldownRemaining) cooldownRemaining = rem;
          }
          if (rec.lastError) {
            lastError = rec.lastError || null;
            lastKind = rec.lastKind || null;
          }
          if (rec.updatedAt > 0 && (lastUsedAt === null || rec.updatedAt * 1e3 > lastUsedAt)) {
            lastUsedAt = Math.round(rec.updatedAt * 1e3);
          }
        }
        const q = snQuotaCache.get(cred.username);
        const quotaStale = q !== void 0 && Date.now() - q.fetchedAtMs > snQuotaCooldownMs();
        if (q === void 0 || quotaStale) snMaybeFetchQuota(cred.username);
        accounts.push({
          account: cred.username,
          username: cred.username,
          enabled,
          key_hint: fpOf(secret),
          has_password: hasPassword,
          has_key: secret !== null,
          slots: 0,
          inflight,
          inflight_is_pool_total: null,
          parallel_cap: null,
          // ⚠️ 成功率恒 100%(用户 m11736):失败请求不再进统计 → `requests` 本身就是
          // 成功数,再算「成功数 / 总数」没有意义。字段保留是为了契约兼容,
          // 值不再有信息量 —— 面板也不再展示它。
          success_rate: requests > 0 ? 100 : null,
          avg_ttft_ms: ttftReq > 0 ? round12(ttftSum / ttftReq) : null,
          avg_tps: completion > 0 && genMs > 0 ? round12(completion / (genMs / 1e3)) : null,
          cache_hit_rate: prompt > 0 ? Math.min(1, cached / prompt) : null,
          requests,
          // 同 success_rate:失败请求不进统计,这里恒 0(历史行可能仍是旧值,不再展示)
          errors: 0,
          cooling,
          cooldown_remaining_s: cooldownRemaining,
          last_error: lastError,
          last_error_kind: lastKind,
          last_used_at: lastUsedAt,
          quota: q?.quota ?? null,
          quota_stale: quotaStale
        });
      }
      return {
        accounts,
        pool: null,
        base_url: pdef?.baseUrl ?? null,
        refresh: {
          // 登录队列在跑,或「刷新」在跑 —— 两者都是这一行状态要反映的忙碌态。
          running: snLoginState.running > 0 || snRefreshState.running > 0,
          started_at_ms: snLedger.startedAtMs,
          last_run_at_ms: snLedger.lastRunAtMs,
          last_elapsed_s: snLedger.lastElapsedS,
          last_ok: snLedger.lastOk,
          last_error: snLedger.lastError,
          result: snLedger.result,
          count: snLedger.lastRunAccounts.length,
          last_run_accounts: snLedger.lastRunAccounts
        },
        auto_refresh: null,
        uptime_s: Math.round((Date.now() - ctx.startedAtMs) / 1e3 * 10) / 10,
        note: null
      };
    },
    /**
     * SenseNova「刷新」—— 页面那个按钮以前只 `load()` 本地库(所以「刷了没反应」)。
     * 现在真干两件事(都是**不烧额度**的元数据/控制台接口):
     *   ① 上游模型目录:`token.sensenova.cn/v1/models`(API key 认证)→ 落 db.real_model;
     *   ② 积分池:清空冷却闸门重拉(JWT 过期且已存密码 → 串行免登录续期再拉)。
     */
    async sensenovaRefresh(_force) {
      const pid = "sensenova";
      const force = _force !== false;
      const t0 = Date.now();
      snLedger.startedAtMs = t0;
      const creds = await ctx.vault.list(pid);
      if (creds.length === 0) {
        return { ok: false, provider: pid, message: "SenseNova \u4E0B\u6CA1\u6709\u8D26\u53F7,\u65E0\u6CD5\u5237\u65B0" };
      }
      snRefreshState.running += 1;
      const rows = [];
      const catalogErrs = [];
      const quotaErrs = [];
      let catalogCount = 0;
      let catalogWarn = "";
      let quotaOk = 0;
      try {
        const pdef = ctx.registry.getProvider(pid);
        for (let i = 0; i < creds.length; i++) {
          const username = creds[i].username;
          const preCred = await ctx.vault.get(pid, username);
          if (!preCred?.secret?.trim()) {
            const rep = await snRepairKey(username, "\u8D26\u53F7\u4E0B\u6CA1\u6709 API key");
            if (rep.ok) {
              deps.chCatalogCache.delete(`${pid}/${username}`);
              deps.chCatalogGate.delete(`${pid}/${username}`);
            } else {
              catalogErrs.push(`${username}:${rep.message}`);
            }
          }
          try {
            const res = await deps.chAwaitCatalog(pid, username, force);
            catalogCount = Math.max(
              catalogCount,
              deps.mergeCatalog(pid, res.entries, pdef?.baseUrl ?? null, pdef?.protocol ?? pid)
            );
            if (catalogWarn === "" && res.warnings.length > 0) catalogWarn = res.warnings[0];
          } catch (err) {
            const detail2 = err instanceof Error ? err.message : String(err);
            const authFailed = /401|403|Unauthorized|Forbidden|invalid.*key|没有可用密钥/i.test(detail2);
            if (authFailed) {
              const rep = await snRepairKey(username, detail2);
              if (rep.ok) {
                try {
                  const res2 = await deps.chAwaitCatalog(pid, username, true);
                  catalogCount = Math.max(
                    catalogCount,
                    deps.mergeCatalog(pid, res2.entries, pdef?.baseUrl ?? null, pdef?.protocol ?? pid)
                  );
                } catch (err2) {
                  catalogErrs.push(
                    `${username}:\u91CD\u5EFA key \u540E\u4ECD\u5931\u8D25:${err2 instanceof Error ? err2.message : String(err2)}`
                  );
                }
              } else {
                catalogErrs.push(`${username}:${rep.message}`);
              }
            } else {
              catalogErrs.push(`${username}:${detail2}`);
            }
          }
          snQuotaGate.delete(username);
          const quota = await snQuotaFetch(username);
          if (quota) quotaOk += 1;
          else quotaErrs.push(`${username}:${snQuotaError.get(username) ?? "\u672A\u62C9\u53D6\u5230"}`);
          const full = await ctx.vault.get(pid, username);
          rows.push({
            index: i,
            account: `sensenova/${username}`,
            username,
            uid: strOf(full?.raw ?? {}, "uid"),
            region: strOf(full?.raw ?? {}, "region"),
            has_refresh_token: Boolean(full?.refreshSecret),
            token_expires_at_ms: null,
            needs_refresh: false,
            status: quota ? "ok" : "failed",
            message: quota ? `\u79EF\u5206\u6C60\u5DF2\u5237\u65B0(${quota.pools.length} \u4E2A\u6C60)` : snQuotaError.get(username) ?? "\u79EF\u5206\u6C60\u672A\u62C9\u53D6\u5230"
          });
        }
      } finally {
        snRefreshState.running -= 1;
      }
      const elapsed = Math.round((Date.now() - t0) / 1e3 * 10) / 10;
      const parts = [];
      parts.push(
        catalogCount > 0 ? `\u6A21\u578B\u76EE\u5F55:\u4E0A\u6E38 ${catalogCount} \u4E2A,\u5DF2\u5199\u5165\u5E93${catalogWarn ? `(\u964D\u7EA7:${catalogWarn})` : ""}` : `\u6A21\u578B\u76EE\u5F55:\u672A\u62C9\u5230(${catalogErrs[0] ?? "\u65E0\u53EF\u7528\u5BC6\u94A5"})`
      );
      parts.push(quotaOk > 0 ? `\u79EF\u5206\u6C60:${quotaOk}/${creds.length} \u4E2A\u8D26\u53F7` : `\u79EF\u5206\u6C60:\u672A\u62C9\u5230(${quotaErrs[0] ?? "\u65E0\u8D26\u53F7"})`);
      const message = parts.join("; ");
      const ok2 = catalogCount > 0 || quotaOk > 0;
      snLedger.lastRunAtMs = Date.now();
      snLedger.lastElapsedS = elapsed;
      snLedger.lastOk = ok2;
      snLedger.lastError = ok2 ? null : message;
      snLedger.result = `${ok2 ? "\u6210\u529F" : "\u5931\u8D25"}:${message}`;
      snLedger.lastRunAccounts = rows;
      return { ok: ok2, provider: pid, count: rows.length, message, accounts: rows };
    },
    async getSensenovaModels() {
      const pid = "sensenova";
      return deps.mergedChannelModels(pid).map((m) => ({
        id: m.id,
        name: m.name,
        context_window: m.context_window,
        max_output: m.max_output,
        input_modalities: m.vision ? ["text", "image"] : ["text"],
        vision_upstream: m.default_vision ?? m.vision,
        vision: m.vision,
        registered: m.registered,
        available: m.available
      }));
    },
    async setSensenovaExposure(provider, model, exposed) {
      const pid = String(provider ?? "").trim();
      const mid = String(model ?? "").trim();
      if (!pid || !mid) return { ok: false, message: "provider/model \u4E0D\u80FD\u4E3A\u7A7A" };
      const mv = deps.modelViewOf(pid, mid);
      if (!mv) return { ok: false, message: `\u672A\u77E5\u6A21\u578B ${pid}/${mid}` };
      ctx.db.realModel.update({ provider: pid, model: mid, hidden: exposed ? 0 : 1 });
      ctx.syncRegistry();
      return {
        ok: true,
        message: exposed ? `\u5DF2\u66B4\u9732 ${pid}/${mid}` : `\u5DF2\u9690\u85CF ${pid}/${mid}`,
        changed: [`${pid}/${mid}`]
      };
    },
    async sensenovaLogin(account, username, password, fetchKey = true) {
      if (typeof fetchKey !== "boolean") fetchKey = true;
      const user = snUserOf(username != null && username !== "" ? username : String(account ?? ""));
      return snLogin(String(account ?? ""), user, String(password ?? ""), fetchKey);
    },
    async sensenovaSavePassword(account, username, password) {
      const user = snUserOf(String(username || account || ""));
      if (!user) return { ok: false, message: "\u8D26\u53F7\u4E0E\u5BC6\u7801\u5747\u4E3A\u5FC5\u586B(\u5BC6\u7801\u4E0D\u56DE\u663E)" };
      await ctx.vault.put({ provider: "sensenova", username: user });
      await snStorePassword(user, String(password ?? ""));
      await deps.syncSensenovaPool(ctx.vault);
      const hasPassword = Boolean(password);
      const message = hasPassword ? "\u5DF2\u4FDD\u5B58\u5BC6\u7801(\u672A\u767B\u5F55)" : "\u7A7A\u5BC6\u7801\u4E0D\u5199\u5165,\u672A\u6E05\u9664\u5DF2\u6709\u5BC6\u7801";
      snLedger.lastRunAtMs = Date.now();
      snLedger.result = message;
      return {
        ok: true,
        account: `sensenova/${user}`,
        username: user,
        has_password: hasPassword,
        message
      };
    },
    async sensenovaRefetchKey(account) {
      const user = snUserOf(String(account ?? ""));
      if (!user) return { ok: false, message: "\u7F3A\u5C11\u8D26\u53F7" };
      const cred = await ctx.vault.get("sensenova", user);
      if (!cred?.refreshSecret && !cred?.raw?.console_refresh_token) {
        const msg = "\u8BE5\u8D26\u53F7\u65E2\u6CA1\u6709\u4FDD\u5B58\u5BC6\u7801\u4E5F\u6CA1\u6709\u7EED\u671F\u51ED\u8BC1,\u65E0\u6CD5\u514D\u767B\u5F55\u91CD\u6293 \u2014\u2014 \u8BF7\u70B9\u300C\u767B\u5F55\u5E76\u6293 key\u300D\u8F93\u4E00\u6B21\u5BC6\u7801(\u4E4B\u540E\u4F1A\u5B58\u4E0B\u6765,\u4EE5\u540E\u91CD\u6293\u4E0E\u5237\u65B0\u90FD\u4E0D\u518D\u9700\u8981\u624B\u8F93)";
        snLedger.lastRunAtMs = Date.now();
        snLedger.lastOk = false;
        snLedger.lastError = msg;
        snLedger.result = msg;
        return {
          ok: false,
          account: `sensenova/${user}`,
          has_key: cred?.secret != null,
          key_updated: false,
          message: msg
        };
      }
      const r = await snRepairKey(user, "\u624B\u52A8\u91CD\u6293");
      snLedger.lastRunAtMs = Date.now();
      snLedger.lastOk = r.ok;
      snLedger.lastError = r.ok ? null : r.message;
      snLedger.result = r.message;
      return {
        ok: r.ok,
        account: `sensenova/${user}`,
        has_key: true,
        key_updated: r.created || r.dropped.length > 0,
        message: r.message
      };
    },
    async sensenovaAddAccount(username, password, apiKey) {
      const user = snUserOf(String(username ?? ""));
      if (!user) return { ok: false, message: "\u7F3A\u5C11\u7528\u6237\u540D" };
      const key3 = String(apiKey ?? "").trim();
      const pwd = String(password ?? "");
      await ctx.vault.put({
        provider: "sensenova",
        username: user,
        ...key3 ? { secret: key3 } : {}
      });
      await snStorePassword(user, pwd);
      await deps.syncSensenovaPool(ctx.vault);
      const saved = {
        ok: true,
        created: true,
        account: `sensenova/${user}`,
        username: user,
        has_password: Boolean(pwd),
        has_key: Boolean(key3),
        key_hint: key3 ? fpOf(key3) : null
      };
      if (pwd) {
        const login = await snLogin(`sensenova/${user}`, user, pwd, true);
        if (login.ok) {
          return { ...saved, ...login, login_ok: true, logged_in: true, has_password: true };
        }
        return {
          ...saved,
          login_ok: false,
          logged_in: false,
          message: `\u8D26\u53F7\u5DF2\u4FDD\u5B58,\u4F46${login.message ?? "\u767B\u5F55\u5931\u8D25"}`
        };
      }
      return { ...saved, login_ok: false, logged_in: false };
    },
    async sensenovaRemoveAccount(account) {
      const user = snUserOf(String(account ?? ""));
      if (!user) return { ok: false, message: "\u7F3A\u5C11\u7528\u6237\u540D" };
      const models = ctx.db.realModel.listByProvider("sensenova").length;
      const removed = await ctx.vault.remove("sensenova", user);
      await deps.syncSensenovaPool(ctx.vault);
      const accountsLeft = (await ctx.vault.list("sensenova")).length;
      snQuotaCache.delete(user);
      snQuotaGate.delete(user);
      snQuotaInflight.delete(user);
      const message = removed ? `\u5DF2\u5220\u9664 sensenova/${user};\u8BE5\u6E20\u9053 ${models} \u4E2A\u771F\u5B9E\u6A21\u578B\u5404\u5C11\u4E00\u4E2A\u7AEF\u70B9(\u7AEF\u70B9 = \u771F\u5B9E\u6A21\u578B \xD7 \u51ED\u636E\u884C,D5)\u3002` : `sensenova/${user} \u6CA1\u6709\u51ED\u636E\u884C,\u672A\u5220\u9664`;
      return {
        ok: removed,
        account: user,
        count: accountsLeft,
        removed_endpoints: models,
        message
      };
    }
  };
  return { snRepairKey, methods };
}

// ../core/src/collector/quota.ts
import { randomBytes as randomBytes5 } from "node:crypto";
var QuotaError = class extends Error {
  kind = "quota";
  constructor(message) {
    super(message);
    this.name = "QuotaError";
  }
};
function number_of(value) {
  if (typeof value === "boolean" || value === null || value === void 0) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function to_epoch_seconds(value) {
  const num2 = number_of(value);
  if (num2 !== null) {
    if (num2 >= 1e11) return Math.round(num2 / 1e3);
    return Math.round(num2);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return Math.round(d.getTime() / 1e3);
  }
  return null;
}
function precise_number(raw, preciseKey, numberKey) {
  for (const key3 of [preciseKey, numberKey]) {
    const v = number_of(raw?.[key3]);
    if (v !== null) return Math.max(0, v);
  }
  return 0;
}
var TRAE_PAY_BASE = "https://api.trae.cn";
var TRAE_USAGE_PATH = "/trae/api/v2/pay/web_user_ent_usage";
var TRAE_PAY_STATUS_PATH = "/trae/api/v1/pay/ide_user_pay_status";
var TRAE_QUOTA_TIMEOUT_MS = 15e3;
var TRAE_ORIGIN = "https://www.trae.cn";
function earliest_expiry(packs) {
  const out = [];
  let best = null;
  const list = Array.isArray(packs) ? packs : [];
  for (const pack of list) {
    if (typeof pack !== "object" || pack === null) continue;
    const p = pack;
    const base = p["entitlement_base_info"] ?? {};
    const quota = base["quota"] ?? {};
    const usage = p["usage"] ?? {};
    const end_s = to_epoch_seconds(base["end_time"]);
    const limit = number_of(quota["credits_limit"]);
    const used = number_of(usage["credits_amount"]) ?? 0;
    const name2 = typeof base["name"] === "string" && base["name"] !== "" ? base["name"] : typeof p["display_desc"] === "string" ? String(p["display_desc"]) : "(\u672A\u547D\u540D)";
    if (limit === null || limit <= 0) continue;
    const remain = Math.max(0, limit - used);
    const counts = remain > 0;
    if (counts && end_s !== null && end_s > 0) {
      if (best === null || end_s < best) best = end_s;
    }
    out.push({
      name: name2,
      limit: Math.round(limit * 1e4) / 1e4,
      used: Math.round(used * 1e4) / 1e4,
      remain: Math.round(remain * 1e4) / 1e4,
      expires_at: end_s,
      counts_for_expiry: counts
    });
  }
  return { expires_at: best, packs: out };
}
function parse_trae_usage(data, credentialKey2, fetched_at) {
  const packsRaw = data["user_entitlement_pack_list"];
  const summary = data["usage_summary"] ?? {};
  const total = number_of(summary["total_amount"]);
  const consumed = number_of(summary["consumed_amount"]);
  const { expires_at, packs } = earliest_expiry(packsRaw);
  let remaining = null;
  let limit = null;
  if (total !== null) {
    limit = Math.round(total);
    const spent = consumed !== null ? consumed : 0;
    remaining = Math.round(Math.max(0, total - spent));
  }
  if (remaining === null) {
    let fallback_limit = 0;
    let fallback_left = 0;
    for (const p of packs) {
      fallback_limit += p.limit ?? 0;
      fallback_left += p.remain ?? 0;
    }
    if (fallback_limit > 0) {
      remaining = Math.round(fallback_left);
      limit = Math.round(fallback_limit);
    }
  }
  return {
    credentialKey: credentialKey2,
    remaining,
    limit,
    expires_at,
    fetched_at,
    packs,
    error: null
  };
}
function parse_trae_pay_status(data, credentialKey2, fetched_at) {
  const trial = data["trial_status"] ?? {};
  const expires_s = to_epoch_seconds(trial["trial_end_time"]);
  const expires_at = expires_s !== null && expires_s > 0 ? expires_s : null;
  const status = typeof trial["trial_status"] === "string" ? trial["trial_status"] : typeof data["status"] === "string" ? String(data["status"]) : "";
  return {
    credentialKey: credentialKey2,
    remaining: null,
    limit: null,
    expires_at,
    fetched_at,
    packs: [{
      name: "\u8BA2\u9605\u8BD5\u7528",
      limit: null,
      used: null,
      remain: null,
      expires_at,
      counts_for_expiry: false,
      extra: { kind: "trial", status }
    }],
    error: null
  };
}
function traeQuotaHeaders(token, extras) {
  const identity = resolve_identity(token, extras ?? {});
  const requestId = randomBytes5(16).toString("hex");
  const headers = build_headers(token, identity, requestId);
  headers["Origin"] = TRAE_ORIGIN;
  headers["Referer"] = `${TRAE_ORIGIN}/`;
  headers["Accept"] = "application/json";
  return headers;
}
async function probe_trae_quota(account, opts = {}) {
  const region = (account.region ?? "cn").toString().trim().toLowerCase();
  const base = (opts.baseUrl ?? TRAE_PAY_BASE).replace(/\/+$/, "");
  const path = region === "cn" ? TRAE_USAGE_PATH : TRAE_PAY_STATUS_PATH;
  const url = `${base}${path}`;
  const body = region === "cn" ? JSON.stringify({ require_usage: true }) : "{}";
  const timeoutMs = opts.timeoutMs ?? TRAE_QUOTA_TIMEOUT_MS;
  const fetchFn = opts.fetchFn ?? fetch;
  let resp;
  try {
    resp = await fetchFn(url, {
      method: "POST",
      headers: traeQuotaHeaders(account.token, account.extras),
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    const name2 = err instanceof Error ? err.name : "";
    if (name2 === "TimeoutError" || name2 === "AbortError") {
      throw new QuotaError(`trae \u989D\u5EA6\u67E5\u8BE2\u8D85\u65F6(${timeoutMs}ms)`);
    }
    throw new QuotaError(`trae \u989D\u5EA6\u67E5\u8BE2\u8FDE\u63A5\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`);
  }
  let text;
  try {
    text = await resp.text();
  } catch (err) {
    throw new QuotaError(`trae \u989D\u5EA6\u54CD\u5E94\u8BFB\u53D6\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (resp.status >= 400) {
    throw new QuotaError(`trae \u8BA1\u8D39\u63A5\u53E3 HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new QuotaError(`trae \u989D\u5EA6\u54CD\u5E94\u4E0D\u662F JSON(HTTP ${resp.status}): ${text.replace(/[^\x20-\x7e\u4e00-\u9fff\n]/g, "?").slice(0, 120)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new QuotaError("trae \u989D\u5EA6\u54CD\u5E94\u4E0D\u662F\u5BF9\u8C61");
  }
  const authCode = number_of(parsed["code"]);
  if (authCode === 1001) {
    const msg = String(parsed["message"] ?? "").slice(0, 200);
    throw new QuotaError(`trae \u8BA1\u8D39\u63A5\u53E3\u8BA4\u8BC1\u5931\u8D25(code 1001): ${msg || "authenticate you"}`);
  }
  const fetched_at = Math.floor(Date.now() / 1e3);
  if (region === "cn") {
    return parse_trae_usage(parsed, account.credentialKey, fetched_at);
  }
  return parse_trae_pay_status(parsed, account.credentialKey, fetched_at);
}
var WORKBUDDY_BILLING_BASES = {
  cn: "https://www.codebuddy.cn",
  global: "https://www.workbuddy.ai"
};
var WORKBUDDY_RESOURCE_PATH = "/v2/billing/meter/get-user-resource";
var WORKBUDDY_MONTHLY_CAPACITY_TYPE = 4;
var WORKBUDDY_BILLING_UA = "CodeBuddy/2.63.2 CLI/2.63.2";
var WORKBUDDY_WINDOW_MS = 100 * 365.25 * 86400 * 1e3;
var WORKBUDDY_QUOTA_TIMEOUT_MS = 3e4;
function workbuddy_request_body(now = /* @__PURE__ */ new Date()) {
  const end = new Date(now.getTime() + WORKBUDDY_WINDOW_MS);
  const fmt = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  return {
    PageNumber: 1,
    PageSize: 100,
    ProductCode: "p_tcaca",
    Status: [0, 3],
    PackageEndTimeRangeBegin: fmt(now),
    PackageEndTimeRangeEnd: fmt(end)
  };
}
function wb_accounts_of(data) {
  try {
    const wrapped = data["data"] ?? {};
    const response = wrapped?.["Response"];
    const inner = response?.["Data"];
    const accounts = inner?.["Accounts"];
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}
function parse_workbuddy(data, credentialKey2, fetched_at, now = Date.now() / 1e3) {
  const accounts = wb_accounts_of(data);
  const now_s = now;
  let total = 0;
  let nearest = null;
  const packs = [];
  for (const acc of accounts) {
    if (typeof acc !== "object" || acc === null) continue;
    const a = acc;
    const monthly = a["CapacityType"] === WORKBUDDY_MONTHLY_CAPACITY_TYPE;
    let remain;
    let size;
    let expires_s;
    let refresh_s;
    if (monthly) {
      remain = precise_number(a, "CycleCapacityRemainPrecise", "CycleCapacityRemain");
      size = precise_number(a, "CycleCapacitySizePrecise", "CycleCapacitySize");
      expires_s = null;
      refresh_s = to_epoch_seconds(a["CycleEndTime"]);
    } else {
      remain = precise_number(a, "CapacityRemainPrecise", "CapacityRemain");
      size = precise_number(a, "CapacitySizePrecise", "CapacitySize");
      expires_s = to_epoch_seconds(a["ExpiredTime"]) ?? to_epoch_seconds(a["CycleEndTime"]);
      refresh_s = null;
    }
    if (!monthly && (remain <= 0 || expires_s !== null && expires_s <= now_s)) {
      continue;
    }
    total += remain;
    if (expires_s !== null) {
      if (nearest === null || expires_s < nearest) nearest = expires_s;
    }
    packs.push({
      name: typeof a["PackageName"] === "string" && a["PackageName"] !== "" ? String(a["PackageName"]) : "(\u672A\u547D\u540D)",
      limit: size !== null ? Math.round(size * 100) / 100 : null,
      used: null,
      remain: Math.round(remain * 100) / 100,
      expires_at: expires_s,
      counts_for_expiry: expires_s !== null,
      extra: {
        monthly,
        refresh_at: refresh_s
      }
    });
  }
  return {
    credentialKey: credentialKey2,
    remaining: Math.round(total),
    limit: null,
    // 跨周期总额无意义(dsh 只展示余量)
    expires_at: nearest,
    // 无可用包 → null = 未知,不虚报
    fetched_at,
    packs,
    error: null
  };
}
function workbuddyQuotaHeaders(account, region) {
  const realm = region === "cn" ? "cn" : "global";
  const origin = WORKBUDDY_BILLING_BASES[realm];
  const headers = build_chat_headers(
    account.token,
    realm,
    account.uid ?? void 0,
    void 0,
    account.enterprise_id ?? void 0
  );
  headers["Origin"] = origin;
  headers["Referer"] = `${origin}/`;
  headers["User-Agent"] = WORKBUDDY_BILLING_UA;
  headers["Accept"] = "application/json";
  return headers;
}
async function probe_workbuddy_quota(account, opts = {}) {
  const region = (account.region ?? "").toString().trim().toLowerCase() || detectRegionOfToken(account.token);
  const realm = region === "cn" ? "cn" : "global";
  const base = (opts.baseUrl ?? WORKBUDDY_BILLING_BASES[realm]).replace(/\/+$/, "");
  const url = `${base}${WORKBUDDY_RESOURCE_PATH}`;
  const body = JSON.stringify(workbuddy_request_body());
  const timeoutMs = opts.timeoutMs ?? WORKBUDDY_QUOTA_TIMEOUT_MS;
  const fetchFn = opts.fetchFn ?? fetch;
  let resp;
  try {
    resp = await fetchFn(url, {
      method: "POST",
      headers: workbuddyQuotaHeaders(account, realm),
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    const name2 = err instanceof Error ? err.name : "";
    if (name2 === "TimeoutError" || name2 === "AbortError") {
      throw new QuotaError(`workbuddy \u989D\u5EA6\u67E5\u8BE2\u8D85\u65F6(${timeoutMs}ms)`);
    }
    throw new QuotaError(`workbuddy \u989D\u5EA6\u67E5\u8BE2\u8FDE\u63A5\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`);
  }
  let text;
  try {
    text = await resp.text();
  } catch (err) {
    throw new QuotaError(`workbuddy \u989D\u5EA6\u54CD\u5E94\u8BFB\u53D6\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (resp.status >= 400) {
    throw new QuotaError(`workbuddy \u8BA1\u8D39\u63A5\u53E3 HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new QuotaError(`workbuddy \u989D\u5EA6\u54CD\u5E94\u4E0D\u662F JSON(HTTP ${resp.status}): ${text.replace(/[^\x20-\x7e\u4e00-\u9fff\n]/g, "?").slice(0, 120)}`);
  }
  if (typeof payload !== "object" || payload === null) {
    throw new QuotaError("workbuddy \u989D\u5EA6\u54CD\u5E94\u4E0D\u662F\u5BF9\u8C61");
  }
  return parse_workbuddy(payload, account.credentialKey, Math.floor(Date.now() / 1e3));
}
function detectRegionOfToken(token) {
  try {
    const seg = token.split(".")[1] ?? "";
    const padded = seg + "=".repeat(-seg.length % 4);
    const claims = JSON.parse(Buffer.from(padded, "base64url").toString("utf-8"));
    const iss = String(claims["iss"] ?? "").toLowerCase();
    if (iss.includes("copilot.tencent.com") || iss.includes("codebuddy.cn") || iss.includes("workbuddy.cn")) {
      return "cn";
    }
  } catch {
  }
  return "global";
}

// ../core/src/connectors/checkin.ts
var CheckinError = class extends Error {
  kind = "checkin";
  constructor(message) {
    super(message);
    this.name = "CheckinError";
  }
};
var CheckinRegionError = class extends CheckinError {
  kind = "region";
  constructor(message) {
    super(message);
    this.name = "CheckinRegionError";
  }
};
var CheckinCredentialError = class extends CheckinError {
  kind = "credential";
  constructor(message) {
    super(message);
    this.name = "CheckinCredentialError";
  }
};
var CHECKIN_PROVIDERS = ["trae", "workbuddy"];
function checkinSupported(provider) {
  return typeof provider === "string" && CHECKIN_PROVIDERS.includes(provider);
}
var TRAE_PAY_BASE_CN = "https://api.trae.cn";
var TRAE_CHECKIN_STATUS_PATH = "/trae/api/v2/ug/checkin_credits/status";
var TRAE_CHECKIN_CLAIM_PATH = "/trae/api/v2/ug/checkin_credits/claim";
var TRAE_CODE_NO_DEVICE = 9004;
var TRAE_CODE_DEVICE_ALREADY = 9095;
var TRAE_CHECKIN_TIMEOUT_MS = 15e3;
var TRAE_RETRYABLE_HINTS = [
  "\u53C2\u4E0E\u7528\u6237\u592A\u591A",
  "\u7A0D\u540E\u518D\u8BD5",
  "\u8BF7\u7A0D\u540E",
  "\u7CFB\u7EDF\u7E41\u5FD9",
  "\u670D\u52A1\u7E41\u5FD9",
  "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41",
  "too many",
  "try again",
  "later",
  "busy"
];
var TRAE_NON_RETRYABLE_CODES = /* @__PURE__ */ new Set([TRAE_CODE_NO_DEVICE, TRAE_CODE_DEVICE_ALREADY]);
var TRANSIENT_ERROR_HINTS = [
  "\u8D85\u65F6",
  "timeout",
  "\u8FDE\u63A5",
  "connection",
  "econnreset",
  "socket",
  "http 429",
  "http 500",
  "http 502",
  "http 503",
  "http 504"
];
function isRetryableCheckinFailure(message, code) {
  if (typeof code === "number" && Number.isFinite(code) && TRAE_NON_RETRYABLE_CODES.has(code)) {
    return false;
  }
  const m = (message ?? "").toLowerCase();
  if (m === "") return false;
  return TRAE_RETRYABLE_HINTS.some((h) => m.includes(h.toLowerCase()));
}
function isTransientCheckinError(err) {
  const m = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return TRANSIENT_ERROR_HINTS.some((h) => m.includes(h));
}
var DEFAULT_CHECKIN_RETRY = {
  attempts: 4,
  baseDelayMs: 1200,
  maxDelayMs: 8e3,
  jitterRatio: 0.3
};
function checkinBackoffMs(attempt, p = {}) {
  const base = p.baseDelayMs ?? DEFAULT_CHECKIN_RETRY.baseDelayMs;
  const max = p.maxDelayMs ?? DEFAULT_CHECKIN_RETRY.maxDelayMs;
  const ratio = p.jitterRatio ?? DEFAULT_CHECKIN_RETRY.jitterRatio;
  const step = Math.max(0, attempt);
  const raw = Math.min(max, base * Math.pow(2, step));
  return Math.round(Math.min(max, raw + raw * ratio * Math.random()));
}
async function defaultSleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}
function traeCheckinHeaders(token, device_id) {
  const headers = {
    Authorization: `Cloud-IDE-JWT ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
    Origin: "https://www.trae.cn",
    Referer: "https://www.trae.cn/"
  };
  if (device_id && device_id.length > 0) {
    headers["x-device-id"] = device_id;
  }
  return headers;
}
function isNumber(v) {
  return typeof v === "number" && !Number.isNaN(v);
}
function parseTraeStatus(payload) {
  if (typeof payload !== "object" || payload === null) {
    return {
      checked_in: false,
      credits: 0,
      enable: true,
      did_checked_in: false,
      extra_credits: null,
      code: null,
      message: ""
    };
  }
  const p = payload;
  return {
    checked_in: p["checked_in"] === true,
    credits: isNumber(p["credits"]) ? p["credits"] : 0,
    enable: p["enable"] !== false,
    did_checked_in: p["did_checked_in"] === true,
    extra_credits: isNumber(p["extra_credits"]) && p["extra_credits"] > 0 ? p["extra_credits"] : null,
    code: isNumber(p["code"]) ? p["code"] : null,
    message: typeof p["message"] === "string" ? p["message"] : ""
  };
}
function parseTraeClaim(payload) {
  if (typeof payload !== "object" || payload === null) {
    return { claimed: false, code: -1, message: "claim \u5E94\u7B54\u4E0D\u662F JSON \u5BF9\u8C61" };
  }
  const p = payload;
  const code = isNumber(p["code"]) ? p["code"] : -1;
  return {
    claimed: code === 0,
    code,
    message: typeof p["message"] === "string" ? p["message"].slice(0, 200) : ""
  };
}
async function rawPost(fetchFn, url, headers, timeoutMs) {
  let resp;
  try {
    resp = await fetchFn(url, {
      method: "POST",
      headers,
      body: "{}",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new CheckinError(`\u7B7E\u5230\u8BF7\u6C42\u8D85\u65F6(${timeoutMs}ms)`);
    }
    throw new CheckinError(`\u7B7E\u5230\u8BF7\u6C42\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`);
  }
  let text;
  try {
    text = await resp.text();
  } catch (err) {
    throw new CheckinError(`\u7B7E\u5230\u5E94\u7B54\u8BFB\u53D6\u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { status: resp.status, text };
}
function requireCNCheckinAccount(account, action = "\u7B7E\u5230") {
  const region = (account.region ?? "").toString().trim().toLowerCase();
  if (region && region !== "cn") {
    throw new CheckinRegionError(
      `${action}:\u56FD\u9645\u7248(\u533A\u57DF ${region})\u6CA1\u6709\u7B7E\u5230\u529F\u80FD \u2014\u2014 \u56FD\u9645\u7248\u662F\u8BA2\u9605\u5236,\u989D\u5EA6\u8D70 payStatus \u63A5\u53E3\u3002`
    );
  }
}
function resolveTraeDevice(account) {
  const explicit = account.device_id && account.device_id.length > 0 ? account.device_id : null;
  if (explicit) return explicit;
  return resolve_identity(account.token, account.extra ?? {}).device_id;
}
async function traeCheckinStatus(account, opts = {}) {
  requireCNCheckinAccount(account, "\u7B7E\u5230\u72B6\u6001");
  const deviceId = resolveTraeDevice(account);
  const base = (opts.baseUrl ?? TRAE_PAY_BASE_CN).replace(/\/+$/, "");
  const url = `${base}${TRAE_CHECKIN_STATUS_PATH}`;
  const r = await rawPost(
    opts.fetchFn ?? fetch,
    url,
    traeCheckinHeaders(account.token, deviceId),
    opts.timeoutMs ?? TRAE_CHECKIN_TIMEOUT_MS
  );
  if (r.status < 200 || r.status >= 300) {
    throw new CheckinError(`trae \u7B7E\u5230\u7AEF\u70B9 ${TRAE_CHECKIN_STATUS_PATH} \u8FD4\u56DE HTTP ${r.status}: ${r.text.slice(0, 300)}`);
  }
  let payload;
  try {
    payload = JSON.parse(r.text);
  } catch (err) {
    throw new CheckinError(`trae \u7B7E\u5230\u5E94\u7B54\u4E0D\u662F\u5408\u6CD5 JSON:${err instanceof Error ? err.message : String(err)}`);
  }
  return parseTraeStatus(payload);
}
async function traeCheckinClaim(account, opts) {
  const confirm = opts.confirm === true;
  requireCNCheckinAccount(account, "\u7B7E\u5230");
  const status = await traeCheckinStatus(account, opts);
  const base = { provider: "trae", username: account.username, index: account.index };
  const settled = (over) => ({ attempts: 0, retries: 0, ...base, ...over });
  if (status.enable === false) {
    return settled({ claimed: false, enabled: false, would_claim: false, code: null, message: "\u8BE5\u8D26\u53F7\u672A\u542F\u7528\u7B7E\u5230", checkin: status });
  }
  if (status.checked_in) {
    return settled({ claimed: false, enabled: true, would_claim: false, already_checked_in: true, code: null, message: "\u4ECA\u65E5\u5DF2\u7B7E\u5230", checkin: status });
  }
  if (status.did_checked_in) {
    return settled({
      claimed: false,
      enabled: true,
      would_claim: false,
      device_checked_in: true,
      code: TRAE_CODE_DEVICE_ALREADY,
      message: `\u672C\u8BBE\u5907\u4ECA\u65E5\u5DF2\u7B7E(\u4E0A\u6E38 code ${TRAE_CODE_DEVICE_ALREADY})`,
      checkin: status
    });
  }
  if (!confirm) {
    return settled({ claimed: false, enabled: true, would_claim: true, code: null, message: "\u4ECA\u65E5\u53EF\u7B7E\u5230;\u9700\u663E\u5F0F\u786E\u8BA4(confirm=True)\u624D\u4F1A\u9886\u53D6", checkin: status });
  }
  const deviceId = resolveTraeDevice(account);
  const baseUrl = (opts.baseUrl ?? TRAE_PAY_BASE_CN).replace(/\/+$/, "");
  const claimUrl = `${baseUrl}${TRAE_CHECKIN_CLAIM_PATH}`;
  const policy = opts.retry === null ? null : opts.retry ?? DEFAULT_CHECKIN_RETRY;
  const maxAttempts = policy === null ? 1 : Math.max(1, Math.trunc(policy.attempts ?? DEFAULT_CHECKIN_RETRY.attempts));
  const sleep = policy?.sleepFn ?? defaultSleep;
  const postClaim = async () => {
    const r = await rawPost(
      opts.fetchFn ?? fetch,
      claimUrl,
      traeCheckinHeaders(account.token, deviceId),
      opts.timeoutMs ?? TRAE_CHECKIN_TIMEOUT_MS
    );
    if (r.status < 200 || r.status >= 300) {
      throw new CheckinError(`trae \u7B7E\u5230\u7AEF\u70B9 ${TRAE_CHECKIN_CLAIM_PATH} \u8FD4\u56DE HTTP ${r.status}: ${r.text.slice(0, 300)}`);
    }
    let payload;
    try {
      payload = JSON.parse(r.text);
    } catch (err) {
      throw new CheckinError(`trae \u7B7E\u5230\u5E94\u7B54\u4E0D\u662F\u5408\u6CD5 JSON:${err instanceof Error ? err.message : String(err)}`);
    }
    return parseTraeClaim(payload);
  };
  let parsed = null;
  let lastError = null;
  let tries = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(checkinBackoffMs(attempt - 1, policy ?? void 0));
      tries += 1;
    }
    try {
      parsed = await postClaim();
    } catch (err) {
      lastError = err;
      if (!(err instanceof CheckinError) || !isTransientCheckinError(err)) break;
      continue;
    }
    lastError = null;
    if (parsed.claimed) break;
    if (!isRetryableCheckinFailure(parsed.message, parsed.code)) break;
  }
  if (parsed === null) {
    throw lastError instanceof Error ? lastError : new CheckinError(String(lastError ?? "trae \u9886\u53D6\u5931\u8D25"));
  }
  const attemptsMade = tries + 1;
  if (!parsed.claimed) {
    const retried = tries > 0 ? `(\u5DF2\u91CD\u8BD5 ${tries} \u6B21\u4ECD\u5931\u8D25)` : "";
    return settled({
      claimed: false,
      enabled: true,
      would_claim: false,
      code: parsed.code,
      message: `${parsed.message || "\u4E0A\u6E38\u62D2\u7EDD\u9886\u53D6"}${retried}`,
      checkin: status,
      attempts: attemptsMade,
      retries: tries
    });
  }
  let fresh = status;
  try {
    fresh = await traeCheckinStatus(account, opts);
  } catch {
  }
  const got = fresh.credits > 0 ? `\u9886\u53D6\u6210\u529F,\u5F53\u524D\u79EF\u5206 ${fresh.credits}` : "\u9886\u53D6\u6210\u529F";
  return settled({
    claimed: true,
    enabled: true,
    would_claim: false,
    code: 0,
    message: parsed.message || got,
    checkin: fresh,
    attempts: attemptsMade,
    retries: tries
  });
}
var WB_CN_BILLING_BASE2 = "https://www.codebuddy.cn";
var WB_CHECKIN_STATUS_PATH = "/v2/billing/meter/checkin-activity-status";
var WB_CHECKIN_CLAIM_PATH = "/v2/billing/meter/daily-checkin";
var WB_GLOBAL_BASE = "https://www.workbuddy.ai";
var WB_GLOBAL_BASE_CODEBUDDY = "https://www.codebuddy.ai";
var WB_CHECKIN_TIMEOUT_MS = 3e4;
var GLOBAL_DOMAINS = ["workbuddy.ai", "codebuddy.ai"];
function wbRegionOf2(domain) {
  let d = (domain ?? "").toString().trim().toLowerCase();
  if (d.startsWith("www.")) d = d.slice(4);
  if (GLOBAL_DOMAINS.some((g) => d === g || d.endsWith(`.${g}`))) return "global";
  return "cn";
}
function wbBillingBase2(domain) {
  if (wbRegionOf2(domain) === "global") {
    const d = (domain ?? "").toString().toLowerCase();
    return d.includes("codebuddy.ai") ? WB_GLOBAL_BASE_CODEBUDDY : WB_GLOBAL_BASE;
  }
  return WB_CN_BILLING_BASE2;
}
function wbCheckinHeaders(token, uid, domain, enterpriseId) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (uid && uid.length > 0) headers["X-User-Id"] = uid;
  if (enterpriseId && enterpriseId.length > 0) {
    headers["X-Enterprise-Id"] = enterpriseId;
    headers["X-Tenant-Id"] = enterpriseId;
  }
  if (domain && domain.length > 0) headers["X-Domain"] = domain;
  return headers;
}
function num(v) {
  return isNumber(v) ? v : 0;
}
async function wbPost(opts, path, account) {
  const base = (opts.baseUrl ?? wbBillingBase2(account.domain)).replace(/\/+$/, "");
  const url = `${base}${path}`;
  const r = await rawPost(
    opts.fetchFn ?? fetch,
    url,
    wbCheckinHeaders(account.token ?? "", account.uid, account.domain, account.enterprise_id),
    opts.timeoutMs ?? WB_CHECKIN_TIMEOUT_MS
  );
  if (r.status < 200 || r.status >= 300) {
    throw new CheckinError(`workbuddy \u7B7E\u5230\u7AEF\u70B9\u8FD4\u56DE HTTP ${r.status}`);
  }
  let payload;
  try {
    payload = JSON.parse(r.text);
  } catch {
    throw new CheckinError("workbuddy \u7B7E\u5230\u5E94\u7B54\u4E0D\u662F\u5408\u6CD5 JSON");
  }
  if (typeof payload !== "object" || payload === null) {
    throw new CheckinError("workbuddy \u7B7E\u5230\u5E94\u7B54\u4E0D\u662F\u5BF9\u8C61");
  }
  const envelope = payload;
  if (!(isNumber(envelope["code"]) && envelope["code"] === 0)) {
    const code = isNumber(envelope["code"]) ? envelope["code"] : null;
    const message = (typeof envelope["message"] === "string" && envelope["message"].length > 0 ? envelope["message"] : "") || (typeof envelope["msg"] === "string" && envelope["msg"].length > 0 ? envelope["msg"] : "");
    throw new CheckinError(`workbuddy \u4E1A\u52A1\u5931\u8D25 code=${code === null ? "None" : code}: ${message}`);
  }
  const data = envelope["data"];
  return typeof data === "object" && data !== null ? data : {};
}
async function wbCheckinStatus(account, opts = {}) {
  if (wbRegionOf2(account.domain) !== "cn") {
    throw new CheckinRegionError("\u56FD\u9645\u7248\u65E0\u7B7E\u5230(\u8BA2\u9605\u5236,\u989D\u5EA6\u8D70 payStatus)");
  }
  const data = await wbPost(opts, WB_CHECKIN_STATUS_PATH, account);
  return {
    active: data["active"] === true,
    today_checked_in: data["today_checked_in"] === true,
    streak_days: num(data["streak_days"]),
    daily_credit: num(data["daily_credit"]),
    today_credit: num(data["today_credit"]),
    is_streak_day: data["is_streak_day"] === true,
    claim_button_text: typeof data["claim_button_text"] === "string" && data["claim_button_text"].length > 0 ? data["claim_button_text"] : null
  };
}
async function wbCheckinClaim(account, opts = {}) {
  if (!account.token) {
    throw new CheckinCredentialError("\u8BE5\u8D26\u53F7\u6CA1\u6709\u53EF\u7528\u4EE4\u724C");
  }
  if (wbRegionOf2(account.domain) !== "cn") {
    throw new CheckinRegionError("\u56FD\u9645\u7248\u65E0\u7B7E\u5230(\u8BA2\u9605\u5236,\u989D\u5EA6\u8D70 payStatus)");
  }
  await wbCheckinStatus(account, opts);
  const data = await wbPost(opts, WB_CHECKIN_CLAIM_PATH, account);
  return {
    credit: num(data["credit"]),
    streak_days: num(data["streak_days"]),
    is_streak_day: data["is_streak_day"] === true
  };
}

// ../core/src/connectors/discover.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
import { homedir, platform } from "node:os";
import { join as join4 } from "node:path";
import { createHash as createHash7 } from "node:crypto";
function traeCliCandidates(home) {
  const h = home ?? homedir() ?? "";
  return [
    { edition: "cn", path: join4(h, ".trae-cn", "trae-jwt-token") },
    { edition: "sg", path: join4(h, ".trae", "trae-jwt-token") }
  ];
}
var TRAE_DESKTOP_EDITION_NAMES = {
  cn: ["Trae CN", "trae-cn"],
  sg: ["Trae"],
  solo: ["TRAE SOLO CN", "trae-solo-cn"],
  "solo-sg": ["TRAE SOLO"]
};
function traeDesktopRoot(platformName = platform()) {
  switch (platformName) {
    case "win32": {
      const appdata = process.env.APPDATA?.trim() || "";
      if (appdata) return appdata;
      const h = homedir() || "";
      return h ? join4(h, "AppData", "Roaming") : null;
    }
    case "darwin": {
      const h = homedir() || "";
      return h ? join4(h, "Library", "Application Support") : null;
    }
    case "linux": {
      const xdg = process.env.XDG_CONFIG_HOME?.trim() || "";
      if (xdg) return xdg;
      const h = homedir() || "";
      return h ? join4(h, ".config") : null;
    }
    default:
      return null;
  }
}
function traeDesktopCandidates(home, platformName = platform()) {
  const root = home ?? traeDesktopRoot(platformName);
  if (!root) return [];
  const out = [];
  for (const [edition, names] of Object.entries(TRAE_DESKTOP_EDITION_NAMES)) {
    for (const name2 of names) {
      out.push({ edition, path: join4(root, name2, "User", "globalStorage", "storage.json") });
    }
  }
  return out;
}
function userRegionOf(value) {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object" && "region" in value) {
    const r = value.region;
    if (typeof r === "string") return r.toLowerCase();
  }
  return null;
}
function traeRegionOf(credential, edition) {
  const ur = userRegionOf(credential.userRegion);
  if (ur) return normalize_region(ur);
  const host = credential.host ?? null;
  if (host && typeof host === "string") {
    if (host.includes(".trae.ai")) return "ai";
    if (host.includes(".trae.cn") || host.includes(".trae.com.cn")) return "cn";
  }
  return edition === "sg" || edition === "solo-sg" ? "ai" : "cn";
}
function hostDomainOf(host) {
  if (!host || typeof host !== "string") return null;
  const bare = host.replace(/^[a-z]+:\/\//i, "").split("/")[0].split("?")[0];
  return bare || null;
}
function toEpochMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value >= 1e11 ? value : value * 1e3;
}
function parseTraeDesktopStorage(path, edition) {
  let text;
  try {
    text = readFileSync3(path, "utf8");
  } catch {
    throw new Error(`storage.json \u4E0D\u53EF\u8BFB: ${path}`);
  }
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error(`storage.json \u975E JSON: ${path}`);
  }
  const rawAuth = root[AUTH_STORAGE_KEY];
  if (typeof rawAuth !== "string" || !rawAuth.trim()) {
    throw new Error(`storage.json \u672A\u767B\u5F55:\u65E0 ${AUTH_STORAGE_KEY} \u6761\u76EE`);
  }
  let credJson;
  if (rawAuth.trimStart().startsWith("{")) {
    credJson = rawAuth;
  } else {
    credJson = decrypt_storage_value(rawAuth);
  }
  let cred;
  try {
    cred = JSON.parse(credJson);
  } catch {
    throw new Error(`storage.json auth \u6761\u76EE\u975E JSON: ${path}`);
  }
  const token = typeof cred.token === "string" && cred.token ? cred.token : typeof cred.accessToken === "string" && cred.accessToken ? cred.accessToken : null;
  if (!token) throw new Error(`storage.json \u672A\u767B\u5F55:\u65E0 token`);
  const account = cred.account;
  const username = account && typeof account === "object" && typeof account.username === "string" ? account.username : null;
  const user_id = typeof cred.userId === "string" ? cred.userId : null;
  const host = typeof cred.host === "string" ? cred.host : null;
  const refresh_token = typeof cred.refreshToken === "string" ? cred.refreshToken : null;
  const region = traeRegionOf({ userRegion: cred.userRegion, host }, edition);
  const token_expires_at_ms = toEpochMs(
    typeof cred.expiredAt === "number" ? cred.expiredAt : typeof cred.expiredAt === "string" && cred.expiredAt ? Date.parse(cred.expiredAt) : cred.expiresAt
  );
  let device_id = null;
  let machine_id = null;
  for (const [k, v] of Object.entries(root)) {
    if (k.startsWith(DEVICE_CENTER_PREFIX) && typeof v === "string") {
      device_id = k.slice(DEVICE_CENTER_PREFIX.length);
      break;
    }
  }
  const telemetry = root.telemetry;
  if (telemetry && typeof telemetry === "object") {
    if (!device_id && typeof telemetry.devDeviceId === "string") {
      device_id = telemetry.devDeviceId;
    }
    if (typeof telemetry.machineId === "string") {
      machine_id = telemetry.machineId;
    }
  }
  const domain = hostDomainOf(host);
  const hintParts = [`\u6765\u6E90:\u684C\u9762\u7248 storage.json(${edition})`];
  if (host) hintParts.push(`host ${host}`);
  if (domain) hintParts.push(domain);
  return {
    provider: "trae",
    username: username ?? user_id ?? "trae-desktop",
    token,
    region,
    source: "desktop",
    edition,
    hint: hintParts.join("; "),
    user_id: user_id ?? null,
    token_expires_at_ms,
    host: host ?? null,
    extra: {
      refresh_token,
      device_id,
      machine_id,
      host,
      domain,
      last_refresh: null
    }
  };
}
function base64urlDecode(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}
function parseJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64urlDecode(parts[1]));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}
function parseTraeCliToken(path, edition) {
  let text;
  try {
    text = readFileSync3(path, "utf8").trim();
  } catch {
    throw new Error(`token \u6587\u4EF6\u4E0D\u53EF\u8BFB: ${path}`);
  }
  if (!text) throw new Error(`token \u6587\u4EF6\u4E3A\u7A7A: ${path}`);
  let token = text;
  if (text.startsWith("{")) {
    try {
      const env2 = JSON.parse(text);
      const t = typeof env2.token === "string" ? env2.token : typeof env2.accessToken === "string" ? env2.accessToken : typeof env2.jwt === "string" ? env2.jwt : null;
      if (t) token = t;
    } catch {
    }
  }
  const payload = parseJwtPayload(token);
  if (!payload) throw new Error(`token \u975E 3 \u6BB5 JWT: ${path}`);
  const data = payload.data;
  const user_id = data && typeof data === "object" && typeof data.user_id === "string" ? data.user_id : null;
  if (!user_id) throw new Error(`JWT \u65E0 data.user_id: ${path}`);
  const host = "https://api.trae.cn";
  return {
    provider: "trae",
    username: user_id,
    token,
    region: traeRegionOf({ host }, edition),
    source: "cli",
    edition,
    hint: `\u6765\u6E90:CLI token \u6587\u4EF6(${edition})`,
    user_id,
    token_expires_at_ms: toEpochMs(payload.exp),
    host,
    extra: { host, last_refresh: null }
  };
}
function hashToken(token) {
  if (!token) return "null";
  return createHash7("sha256").update(token).digest("hex").slice(0, 12);
}
function discoverTraeAccounts(options = {}) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (acc) => {
    if (!acc) return;
    const key3 = `${acc.source}\0${acc.edition ?? ""}\0${acc.user_id ?? hashToken(acc.token)}`;
    if (seen.has(key3)) return;
    seen.add(key3);
    out.push(acc);
  };
  if (options.desktop !== false) {
    for (const { edition, path } of traeDesktopCandidates(options.home, options.platformName)) {
      if (!existsSync3(path)) continue;
      try {
        push(parseTraeDesktopStorage(path, edition));
      } catch {
      }
    }
  }
  if (options.cli !== false) {
    for (const { edition, path } of traeCliCandidates(options.home)) {
      if (!existsSync3(path)) continue;
      try {
        push(parseTraeCliToken(path, edition));
      } catch {
      }
    }
  }
  return out;
}

// ../panel/src/channels-methods.ts
function createChannelsMethods(ctx, deps) {
  const {
    chQuotaCache: chQuotaCache2,
    accountsWithKey,
    autoAdoptTrae,
    catalogCooldownStateOf,
    catalogFetchedAt,
    catalogRows,
    chAwaitCatalog,
    chAwaitQuota,
    chCreditsOf,
    chMaybeFetchQuota,
    channelAccountsOf,
    checkinAccountsOf,
    checkinBaseOf,
    checkinClaimOne,
    doRefreshRun,
    getClientPathsImpl,
    mergeCatalog,
    mergedChannelModels,
    modelsSourceOf,
    probeClientPath,
    probeProviderModels,
    rawStrOf,
    refreshAccountsOf,
    refreshInFlight,
    refreshLedger,
    refreshRowBase,
    safeExists,
    serializeReasoningEfforts
  } = deps;
  function upsertRealModelRow(pid, bare, spec) {
    const row = ctx.db.realModel.get(pid, bare);
    const name2 = (spec.name ?? "").trim();
    const vision = spec.vision === void 0 ? void 0 : spec.vision ? 1 : 0;
    const ctxWin = spec.context_window === void 0 ? void 0 : spec.context_window;
    const maxOut = spec.max_output === void 0 ? void 0 : spec.max_output;
    const cat = catalogRows.get(pid)?.get(bare);
    ctx.db.realModel.set({
      provider: pid,
      model: bare,
      name: name2 !== "" ? name2 : row?.name ?? bare,
      supports_vision: vision ?? (row?.supports_vision ?? 0),
      max_input_tokens: ctxWin === void 0 ? row?.max_input_tokens ?? null : ctxWin,
      max_output_tokens: maxOut === void 0 ? row?.max_output_tokens ?? null : maxOut,
      hidden: 0,
      concurrency: row && row.concurrency > 0 ? row.concurrency : 1,
      supported_reasoning_efforts: cat === void 0 ? row?.supported_reasoning_efforts ?? null : serializeReasoningEfforts(cat.reasoning_efforts),
      reasoning_allows_off: cat === void 0 ? row?.reasoning_allows_off ?? null : cat.reasoning_allows_off ?? null
    });
    return !row;
  }
  const methods = {
    /**
     * 拉上游模型目录(**只读**动作)。
     *
     * ⚠️ `decl` 是给「**还没保存**的供应商」用的:用户在新建卡片里填了 base_url/协议、
     * 点「获取可用模型」时,provider 行还不存在。用本次表单给的地址去探测,但
     * **绝不因此建 provider 行**(2026-10-24 用户反馈「点击获取可用模型会导致提供商被创建」)
     * —— 声明落库只发生在「保存」({@link upsertModelProvider})。
     */
    async fetchModels(id, _force, decl) {
      const pid = String(id ?? "");
      const row = ctx.db.provider.get(pid);
      const saved = ctx.registry.getProvider(pid) ?? (row ? { id: row.id, baseUrl: row.base_url, protocol: row.protocol, envPrefix: row.env_prefix } : null);
      if (!saved && !decl) return { ok: false, message: `\u672A\u77E5 provider ${pid}` };
      const baseUrl = String(decl?.baseUrl ?? "").trim() || saved?.baseUrl || "";
      const protocol = String(decl?.protocol ?? "").trim() || saved?.protocol || "openai";
      if (CH_CATALOG_PROVIDERS.has(pid)) {
        const accounts = await refreshAccountsOf(pid);
        if (accounts.length === 0) {
          return { ok: false, message: `${pid} \u4E0B\u6CA1\u6709\u8D26\u53F7,\u6CA1\u6709\u5BC6\u94A5\u53EF\u4EE5\u62FF\u53BB\u62C9\u4E0A\u6E38\u76EE\u5F55\u3002` };
        }
        const failures = [];
        let result = null;
        const pulls = accounts.map((a) => a.cred.username);
        for (const username of pulls) {
          try {
            result = await chAwaitCatalog(pid, username, _force === true);
            break;
          } catch (err) {
            failures.push(`${username}:${err instanceof Error ? err.message : String(err)}`);
          }
        }
        if (result === null) {
          return {
            ok: false,
            message: `\u4E0A\u6E38\u76EE\u5F55\u62C9\u53D6\u5931\u8D25(${failures.length} \u4E2A\u8D26\u53F7;\u793A\u4F8B:${failures[0] ?? "\u65E0\u8D26\u53F7"})`
          };
        }
        const warnNote = result.warnings.length > 0 ? `(\u964D\u7EA7:${result.warnings[0]})` : "";
        const entries = result.entries.map((e) => ({
          id: e.id,
          name: e.name,
          vision: e.vision,
          context_window: e.context_window,
          max_output: e.max_output
        }));
        mergeCatalog(pid, result.entries, baseUrl, protocol);
        const models2 = mergedChannelModels(pid);
        const registeredCount2 = models2.filter((m) => m.exposed).length;
        const extra2 = registeredCount2 > 0 ? "" : ";\u8FD8\u6CA1\u6709\u767B\u8BB0\u4EFB\u4F55\u6A21\u578B(\u52FE\u9009\u540E\u4FDD\u5B58)";
        return {
          ok: true,
          fetched: true,
          count: entries.length,
          message: `\u4E0A\u6E38\u8FD4\u56DE ${entries.length} \u4E2A\u6A21\u578B${warnNote}${extra2}`,
          models: models2
        };
      }
      const base = baseUrl;
      if (!base) {
        return { ok: false, message: "\u8FD9\u5BB6\u6CA1\u6709 base_url:\u8BF7\u6C42\u7531\u672C\u673A\u79C1\u6709\u534F\u8BAE\u9002\u914D\u5668\u8F6C\u6210\u79C1\u6709\u534F\u8BAE,\u6CA1\u6709\u7EDF\u4E00\u7684 /models \u63A5\u53E3\u53EF\u63A2\u6D4B\u3002\u6A21\u578B\u6E05\u5355\u4EE5\u5E93\u91CC\u5DF2\u767B\u8BB0\u7684\u4E3A\u51C6\u3002" };
      }
      let u;
      try {
        u = new URL(base);
      } catch {
        return { ok: false, message: `base_url \u4E0D\u662F\u53EF\u63A2\u6D4B\u7684 http(s) \u5730\u5740:${base}` };
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, message: `base_url \u4E0D\u662F\u53EF\u63A2\u6D4B\u7684 http(s) \u5730\u5740:${base}` };
      }
      const creds = await ctx.vault.list(pid);
      let bearerKey = null;
      for (const c of creds) {
        const secret = await ctx.vault.secret(pid, c.username);
        if (typeof secret === "string" && secret !== "") {
          bearerKey = secret;
          break;
        }
      }
      const root = base.replace(/\/+$/, "");
      const first = await probeProviderModels(`${root}/models`, bearerKey);
      let probe = first;
      if (!probe.ok) {
        return { ok: false, message: probe.message };
      }
      const catalogEntries = probe.entries;
      mergeCatalog(pid, catalogEntries, baseUrl, protocol);
      const models = mergedChannelModels(pid);
      const registeredCount = models.filter((m) => m.exposed).length;
      const extra = registeredCount > 0 ? "" : ";\u8FD8\u6CA1\u6709\u767B\u8BB0\u4EFB\u4F55\u6A21\u578B(\u52FE\u9009\u540E\u4FDD\u5B58)";
      return {
        ok: true,
        fetched: true,
        count: catalogEntries.length,
        message: `\u4E0A\u6E38\u8FD4\u56DE ${catalogEntries.length} \u4E2A\u6A21\u578B${extra}`,
        models
      };
    },
    /**
     * 模型目录**整批保存** —— 对齐 Nexus `POST /providers/{id}/exposure`。
     *
     * As One 原来只有逐行 `setModelExposure(provider, model, exposed)`:它只翻
     * `hidden` 一个位,于是「名称 / 视觉 / 上下文 / 最大输出」这四个**声明字段
     * 改了存不住**(用户在表格里勾了视觉,保存后又被刷回上游那一份)。Nexus 的
     * 提交体本来就带这四个字段,这里按同一口径整批写。
     *
     * ⚠️ 清单外 = 删行(不是隐藏):Nexus 的「提交清单 = 成员名单」是整批替换语义,
     * 取消勾选就是从 `real_model` 摘掉。
     *
     * ⭐ **2026-10-18(m04740)语义:删行即连锁摘除** —— 以前这里在「被逻辑模型
     * 引用」时**整批拒绝**并点名让用户先去「逻辑模型」页手动摘。那是 Nexus
     * 引入连锁摘除**之前**的旧口径。现在的做法是:删之前先把这一档从所有逻辑
     * 模型的 `members` 里摘掉(保序,顺序即 priority 不变),再删行 ——
     * 用户不再需要先跑一趟别的页面,也不会留下指向空气的悬空档位。
     *
     * ⚠️ 提交 id 指向别家供应商时**静默忽略该行**(Nexus 同款 `continue`),
     * 不再整批报错:一个客户端顺手把整张目录表发过来时,别家的行不该让它失败。
     */
    async setChannelModels(provider, models) {
      const pid = String(provider ?? "").trim();
      if (!pid) return { ok: false, message: "provider \u4E0D\u80FD\u4E3A\u7A7A" };
      const list = Array.isArray(models) ? models : [];
      const wanted = /* @__PURE__ */ new Map();
      for (const raw of list) {
        const full = String(raw?.id ?? "").trim();
        const slash = full.lastIndexOf("/");
        const owner = slash >= 0 ? full.slice(0, slash) : pid;
        const bare = slash >= 0 ? full.slice(slash + 1) : full;
        if (bare === "") return { ok: false, message: `\u6A21\u578B id \u4E3A\u7A7A:${full || "(\u7A7A)"}` };
        if (owner !== pid) continue;
        wanted.set(bare, raw);
      }
      const existing = ctx.db.realModel.listByProvider(pid);
      const stale = existing.filter((r) => !wanted.has(r.model));
      let strippedTotal = 0;
      for (const r of stale) {
        strippedTotal += deps.stripMemberFromLogicalModels(`${pid}/${r.model}`);
      }
      let added = 0;
      for (const [bare, spec] of wanted) {
        if (upsertRealModelRow(pid, bare, spec)) added += 1;
      }
      for (const r of stale) ctx.db.realModel.delete(pid, r.model);
      try {
        ctx.scheduler.invalidate();
      } catch {
      }
      ctx.syncRegistry();
      const parts = [`\u5171 ${wanted.size} \u4E2A\u6A21\u578B`];
      if (added > 0) parts.push(`\u65B0\u767B\u8BB0 ${added} \u4E2A`);
      if (stale.length > 0) parts.push(`\u5220\u9664 ${stale.length} \u4E2A`);
      if (strippedTotal > 0) parts.push(`\u4ECE\u903B\u8F91\u6A21\u578B\u6863\u94FE\u8FDE\u9501\u6458\u9664 ${strippedTotal} \u5904`);
      return {
        ok: true,
        provider: pid,
        count: wanted.size,
        changed: [...wanted.keys()].map((m) => `${pid}/${m}`),
        message: `\u6A21\u578B\u8868\u5DF2\u66F4\u65B0:${parts.join(",")}`
      };
    },
    /**
     * 单行实时保存 —— 用户 2026-10-31 定案:四页(Trae/WorkBuddy/Qoder/SenseNova)
     * 删掉「撤销 / 保存」按钮,勾选、改名、改上下文窗口、改最大输出、勾视觉**当场落库**。
     *
     * ⚠️ 与 {@link setChannelModels} 刻意分离:那个是**整批替换**(清单外 = 删行),
     * 实时保存一次只带一行,套用整批语义会把用户没在看的模型全删掉。
     * 这里按 (provider, model) 单行 upsert;`patch.exposed === false` 才删这一行,
     * 并且**照旧先做连锁摘除**(与整批删行同口径,不留下指向空气的档位)。
     *
     * ⚠️ 只碰模型表:不动凭据、不打上游、不写请求日志。失败一律如实回 message。
     */
    async setChannelModel(provider, patch) {
      const pid = String(provider ?? "").trim();
      if (!pid) return { ok: false, message: "provider \u4E0D\u80FD\u4E3A\u7A7A" };
      const full = String(patch?.id ?? "").trim();
      if (full === "") return { ok: false, message: "\u6A21\u578B id \u4E3A\u7A7A" };
      const slash = full.lastIndexOf("/");
      const owner = slash >= 0 ? full.slice(0, slash) : pid;
      const bare = slash >= 0 ? full.slice(slash + 1) : full;
      if (bare === "") return { ok: false, message: `\u6A21\u578B id \u4E3A\u7A7A:${full}` };
      if (owner !== pid) {
        return { ok: true, provider: pid, count: 0, changed: [], message: "" };
      }
      if (patch.exposed === false) {
        const existed = ctx.db.realModel.get(pid, bare) !== null;
        if (!existed) {
          return { ok: true, provider: pid, count: 0, changed: [], message: "" };
        }
        const stripped = deps.stripMemberFromLogicalModels(`${pid}/${bare}`);
        ctx.db.realModel.delete(pid, bare);
        try {
          ctx.scheduler.invalidate();
        } catch {
        }
        ctx.syncRegistry();
        const tail = stripped > 0 ? `,\u4ECE\u903B\u8F91\u6A21\u578B\u6863\u94FE\u8FDE\u9501\u6458\u9664 ${stripped} \u5904` : "";
        return {
          ok: true,
          provider: pid,
          count: 0,
          changed: [`${pid}/${bare}`],
          message: `\u5DF2\u53D6\u6D88\u767B\u8BB0 ${pid}/${bare}${tail}`
        };
      }
      const added = upsertRealModelRow(pid, bare, patch);
      try {
        ctx.scheduler.invalidate();
      } catch {
      }
      ctx.syncRegistry();
      return {
        ok: true,
        provider: pid,
        count: 1,
        changed: [`${pid}/${bare}`],
        message: added ? `\u5DF2\u767B\u8BB0 ${pid}/${bare}` : `\u5DF2\u66F4\u65B0 ${pid}/${bare}`
      };
    },
    /**
     * 单模型检测(对齐 Nexus `POST /providers/{id}/check-model`)。
     *
     * 只回答「这个模型有没有可调用账户」,**不打上游**。
     */
    async checkModel(provider, model) {
      const pid = String(provider ?? "").trim();
      const mid = String(model ?? "").trim();
      if (!pid || !mid) return { ok: false, message: "provider \u4E0E model \u90FD\u4E0D\u80FD\u4E3A\u7A7A" };
      const bare = mid.includes("/") ? mid.slice(mid.lastIndexOf("/") + 1) : mid;
      const mv = deps.modelViewOf(pid, bare);
      if (!mv) return { ok: false, message: `\u672A\u767B\u8BB0\u7684\u6A21\u578B:${pid}/${bare}` };
      const withKey = await accountsWithKey(pid);
      const usable = withKey.filter((a) => a.hasKey).length;
      const ok2 = usable > 0;
      return {
        ok: ok2,
        message: ok2 ? `${pid}/${bare} \u53EF\u8C03\u7528(\u8BE5\u4F9B\u5E94\u5546\u4E0B ${usable} \u4E2A\u6709\u5BC6\u94A5\u7684\u8D26\u6237)` : `${pid}/${bare} \u6CA1\u6709\u53EF\u8C03\u7528\u8D26\u6237(\u8BE5\u4F9B\u5E94\u5546\u4E0B ${withKey.length} \u4E2A\u8D26\u6237,${usable} \u4E2A\u6709\u5BC6\u94A5)`,
        provider: pid,
        changed: []
      };
    },
    /**
     * SenseNova 账号列表(对齐 Nexus `GET /sensenova/accounts` → `_sensenova_accounts`)。
     *
     * 凭据投影,**无明文**。
     */
    /**
     * 额度只读面(对齐 Nexus `GET /api/quota`)。
     *
     * 数据源是采集器的内存快照(不实时打上游)—— 面板上显示的是「上次采集到的
     * 额度」,不是此刻的。
     */
    async getQuota() {
      const out = { providers: [], total: 0, checked_at: null };
      for (const p of ctx.registry.listProviders()) {
        for (const acc of ctx.registry.listAccounts(p.id)) {
          const [, username] = splitRef(acc.credentialRef);
          const cached = chQuotaCache2.get(`${p.id}/${username}`);
          const snap = cached?.snapshot ?? null;
          if (snap === null) continue;
          out.providers.push({
            provider: p.id,
            credential: acc.credentialRef,
            remaining: snap.remaining,
            limit: snap.limit,
            checked_at: Math.round(snap.fetched_at || 0),
            error: snap.error
          });
          out.total += snap.remaining ?? 0;
          out.checked_at = Math.round(snap.fetched_at || 0);
        }
      }
      return out;
    },
    async checkModels(id) {
      const targets = id ? [String(id)] : ctx.registry.listProviders().filter((p) => p.protocol === "openai").map((p) => p.id);
      const checked = [];
      const missing = [];
      for (const pid of targets) {
        const withKey = await accountsWithKey(pid);
        const usable = withKey.filter((a) => a.hasKey).length;
        for (const m of mergedChannelModels(pid)) {
          checked.push(m);
          if (m.registered && usable === 0) missing.push(m.id);
        }
      }
      return {
        ok: true,
        message: missing.length > 0 ? `\u68C0\u67E5\u5B8C\u6210:${missing.length} \u4E2A\u6A21\u578B\u65E0\u53EF\u8C03\u7528\u8D26\u6237(${missing.join(", ")})` : "\u68C0\u67E5\u5B8C\u6210:\u5168\u90E8\u6A21\u578B\u5747\u6709\u53EF\u8C03\u7528\u8D26\u6237",
        models: checked,
        count: checked.length
      };
    },
    // ── 渠道页(Trae / WorkBuddy) ───────────────────────────────────────────
    async getProviderPage(provider, _fresh) {
      const pid = String(provider ?? "");
      const adoptMsg = await autoAdoptTrae(pid);
      const pdef = ctx.registry.getProvider(pid);
      const accounts = await channelAccountsOf(pid);
      const withKey = await accountsWithKey(pid);
      const models = mergedChannelModels(pid);
      const clientPaths = await getClientPathsImpl();
      const cpRow = clientPaths.channels.find((c) => c.channel === pid);
      const searchedHints = cpRow?.saved_path ? [`\u5DF2\u63A5\u5165\u5BA2\u6237\u7AEF: ${cpRow.saved_path}`] : [];
      const checkinProtocol = pdef?.protocol?.toLowerCase() ?? "";
      const checkinCapable = checkinSupported(checkinProtocol);
      const checkinBlock = {
        supported: false,
        active: null,
        checked_in: null,
        did_checked_in: null,
        daily_credit: null,
        extra_credits: null,
        streak_days: null,
        reason: checkinCapable ? "\u652F\u6301\u7B7E\u5230(\u7ECF checkinStatus/checkinClaim \u8C03\u7528;\u6E20\u9053\u9875\u5237\u65B0\u4E0D\u4F1A\u81EA\u52A8\u7B7E\u5230)" : "\u8BE5\u6E20\u9053\u4E0D\u652F\u6301\u7B7E\u5230",
        error: null
      };
      let credits;
      if (CH_QUOTA_PROVIDERS.has(pid)) {
        const primary = withKey.find((a) => a.hasKey);
        if (!primary) {
          credits = {
            left: null,
            total: null,
            expires_at_ms: null,
            fetched_at_ms: 0,
            packages: [],
            expiring_soon: null,
            not_applicable: true,
            error: null
          };
        } else {
          const cached = chQuotaCache2.get(credentialKey(pid, primary.username));
          credits = cached ? chCreditsOf(cached.snapshot, cached.fetchedAtMs) : {
            left: null,
            total: null,
            expires_at_ms: null,
            fetched_at_ms: 0,
            packages: [],
            expiring_soon: null,
            not_applicable: false,
            error: "\u989D\u5EA6\u5C1A\u672A\u62C9\u53D6 \u2014\u2014 \u70B9\u4E0A\u65B9\u300C\u5237\u65B0\u300D"
          };
          chMaybeFetchQuota(pid, primary.username, false);
        }
      } else {
        credits = {
          left: null,
          total: null,
          expires_at_ms: null,
          fetched_at_ms: 0,
          packages: [],
          expiring_soon: null,
          not_applicable: true,
          error: null
        };
      }
      const accountsWithCredits = CH_QUOTA_PROVIDERS.has(pid) ? accounts.map((a) => {
        const cached = chQuotaCache2.get(a.credential_key);
        return {
          ...a,
          credits: cached ? chCreditsOf(cached.snapshot, cached.fetchedAtMs) : null
        };
      }) : accounts;
      return {
        provider: pid,
        env_prefix: pdef?.envPrefix ?? `ONE_${pid.toUpperCase()}`,
        region: null,
        signed_in: accounts.length > 0,
        username: accounts[0]?.label ?? null,
        account: accounts[0]?.label ?? null,
        searched: searchedHints,
        credits,
        checkin: checkinBlock,
        maintenance: {
          enabled: refreshSupported(pid),
          interval_s: null,
          last_run_ts: null,
          result: null,
          error: null,
          reason: refreshSupported(pid) ? "\u4EE4\u724C\u5230\u671F\u524D\u53EF\u624B\u52A8\u5237\u65B0(\u4E24\u6BB5\u5F0F:\u5148\u5E72\u8DD1\u770B\u6E05,\u518D\u786E\u8BA4)" : "\u8BE5\u6E20\u9053\u4E0D\u9700\u8981\u4EE4\u724C\u5237\u65B0"
        },
        models,
        // 契约值域是 modelsSourceLabel 认的那几个(api / mixed / router / error),
        // 判据逐条对齐 Nexus `_models_source`:
        // - 这一轮没拉到上游目录(或该渠道没有这条通路)→ "router"(仅已登记);
        // - 全是上游目录行 → "api";
        // - 上游目录 + 已登记(库里多出上游这一轮没有的模型)→ "mixed"。
        models_source: modelsSourceOf(pid, models),
        models_fetched_at_ms: catalogFetchedAt.get(pid) ?? null,
        models_count: models.length,
        message: [
          adoptMsg ? `${adoptMsg};` : "",
          CH_QUOTA_PROVIDERS.has(pid) ? "" : "\u8BE5\u6E20\u9053\u65E0\u989D\u5EA6\u5B50\u7CFB\u7EDF,\u5DF2\u5C55\u793A\u8BE5\u6E20\u9053\u7684\u51ED\u636E\u4E0E\u6A21\u578B\u914D\u7F6E;\u7B7E\u5230\u7ECF checkinStatus/checkinClaim \u8C03\u7528"
        ].filter(Boolean).join(" "),
        // ⚠️ 目录的冷却状态**如实**给出(B2):页面要能说明「为什么刷新没打上游」。
        auto_refresh: catalogCooldownStateOf(pid),
        accounts: accountsWithCredits,
        client_paths: clientPaths.channels.filter((c) => c.channel === pid)
      };
    },
    async getChannelAccounts(provider) {
      const pid = String(provider ?? "");
      await autoAdoptTrae(pid);
      return channelAccountsOf(pid);
    },
    async checkinStatus(_provider) {
      const pid = String(_provider ?? "");
      const pdef = ctx.registry.getProvider(pid);
      const protocol = pdef?.protocol?.toLowerCase() ?? "";
      const flat = (over) => ({
        active: null,
        checked_in: null,
        did_checked_in: null,
        daily_credit: null,
        extra_credits: null,
        streak_days: null,
        reason: null,
        error: null,
        ...over
      });
      if (!pdef || !checkinSupported(protocol)) {
        return flat({ supported: false, reason: pid ? "\u8BE5\u6E20\u9053\u4E0D\u652F\u6301\u7B7E\u5230" : "\u6E20\u9053\u4E3A\u7A7A,\u4E0D\u652F\u6301\u7B7E\u5230" });
      }
      const accounts = await checkinAccountsOf(pid);
      const withToken = accounts.filter((a) => a.token !== null && a.token !== "");
      if (withToken.length === 0) {
        return flat({ supported: true, reason: "\u8BE5\u6E20\u9053\u6CA1\u6709\u5E26\u4EE4\u724C\u7684\u51ED\u636E,\u65E0\u6CD5\u67E5\u8BE2\u7B7E\u5230" });
      }
      const acc = withToken[0];
      try {
        if (protocol === "trae") {
          const st2 = await traeCheckinStatus(
            {
              index: acc.index,
              username: acc.username,
              token: acc.token,
              region: acc.region,
              device_id: rawStrOf(acc.extra, "device_id"),
              extra: acc.extra
            },
            { baseUrl: checkinBaseOf(pdef) ?? void 0 }
          );
          return flat({
            supported: true,
            active: st2.enable,
            checked_in: st2.checked_in,
            did_checked_in: st2.did_checked_in,
            daily_credit: st2.credits,
            extra_credits: st2.extra_credits,
            code: st2.code,
            message: st2.message ? st2.message.slice(0, 300) : null
          });
        }
        const st = await wbCheckinStatus(
          { index: acc.index, username: acc.username, token: acc.token, domain: acc.domain, uid: acc.uid, enterprise_id: acc.enterprise_id },
          { baseUrl: checkinBaseOf(pdef) ?? void 0 }
        );
        return flat({
          supported: true,
          active: st.active,
          checked_in: st.today_checked_in,
          daily_credit: st.daily_credit,
          streak_days: st.streak_days,
          today_credit: st.today_credit,
          is_streak_day: st.is_streak_day,
          claim_button_text: st.claim_button_text
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (err instanceof CheckinRegionError || err instanceof CheckinCredentialError) {
          return flat({ supported: true, reason: msg.slice(0, 300) });
        }
        return flat({ supported: true, error: msg.slice(0, 300) });
      }
    },
    async checkinClaim(_provider, _confirm, _index) {
      const pid = String(_provider ?? "");
      const pdef = ctx.registry.getProvider(pid);
      const protocol = pdef?.protocol?.toLowerCase() ?? "";
      const confirm = _confirm === true;
      const fail2 = (message2) => ({ ok: false, provider: pid, message: message2 });
      if (!pdef || !checkinSupported(protocol)) {
        return fail2(pid ? "\u8BE5\u6E20\u9053\u4E0D\u652F\u6301\u7B7E\u5230" : "\u6E20\u9053\u4E3A\u7A7A,\u4E0D\u652F\u6301\u7B7E\u5230");
      }
      const accounts = await checkinAccountsOf(pid);
      if (accounts.length === 0) {
        return fail2("\u8BE5\u6E20\u9053\u6CA1\u6709\u51ED\u636E,\u65E0\u6CD5\u7B7E\u5230");
      }
      const targets = _index === void 0 ? accounts : accounts.filter((a) => a.index === _index);
      if (_index !== void 0 && targets.length === 0) {
        return fail2(`\u8D26\u53F7\u5E8F\u53F7\u4E0D\u5B58\u5728: ${_index}(\u8BE5\u6E20\u9053\u5171 ${accounts.length} \u4E2A\u51ED\u636E)`);
      }
      const rows = [];
      for (const acc of targets) {
        rows.push(await checkinClaimOne(pid, protocol, acc, checkinBaseOf(pdef) ?? void 0, confirm));
      }
      const claimedN = rows.filter((r) => r.status === "claimed").length;
      const alreadyN = rows.filter((r) => r.status === "already").length;
      const failedRows = rows.filter((r) => r.status === "failed");
      const ok2 = claimedN + alreadyN > 0 || !confirm && rows.some((r) => r.status === "dry_run" || r.status === "skipped");
      let message;
      if (ok2) {
        if (!confirm) {
          message = "\u5E72\u8DD1\u7ED3\u679C(\u672A\u53D1\u51FA\u9886\u53D6\u8BF7\u6C42)";
        } else {
          const creditSum = rows.reduce((s, r) => s + (r.credit ?? 0), 0);
          const parts = [`\u5DF2\u9886\u53D6 ${claimedN} \u4E2A\u8D26\u53F7`];
          if (alreadyN > 0) parts.push(`\u4ECA\u65E5\u5DF2\u7B7E ${alreadyN} \u4E2A`);
          if (creditSum > 0) parts.push(`\u79EF\u5206\u5408\u8BA1 ${creditSum}`);
          const first = rows.find((r) => r.status === "claimed" || r.status === "already");
          if (first) parts.push(first.message);
          message = parts.join(" \xB7 ");
        }
      } else if (rows.length > 0) {
        message = failedRows.length > 0 ? `\u7B7E\u5230\u5931\u8D25:${failedRows[0].message}`.slice(0, 300) : "\u8BE5\u6E20\u9053\u4ECA\u65E5\u65E0\u7B7E\u5230\u6D3B\u52A8(\u672A\u9886\u53D6)";
      } else {
        message = "\u8BE5\u6E20\u9053\u6CA1\u6709\u53EF\u7528\u8D26\u53F7";
      }
      return {
        ok: ok2,
        provider: pid,
        index: _index,
        message,
        confirm,
        count: rows.length,
        claimed: claimedN,
        already: alreadyN,
        accounts: rows
      };
    },
    async refreshStatus(provider) {
      const pid = String(provider ?? "");
      const unsupported = {
        running: false,
        started_at_ms: null,
        last_run_at_ms: null,
        last_elapsed_s: null,
        last_ok: null,
        last_error: null,
        result: `${pid} \u6682\u65E0\u5237\u65B0\u80FD\u529B(Nexus REFRESH_PROVIDERS = trae/workbuddy)`,
        count: 0,
        accounts: []
      };
      if (!refreshSupported(pid)) return unsupported;
      const accounts = await refreshAccountsOf(pid);
      const rows = accounts.map(({ index, cred }) => refreshRowBase(index, cred));
      const entry = refreshLedger.get(pid);
      const running = [...refreshInFlight.keys()].some((k) => k.startsWith(`${pid}#`));
      return {
        running,
        started_at_ms: entry?.startedAtMs ?? null,
        last_run_at_ms: entry?.lastRunAtMs ?? null,
        last_elapsed_s: entry?.lastElapsedS ?? null,
        last_ok: entry?.lastOk ?? null,
        last_error: entry?.lastError ?? null,
        result: entry?.result ?? "\u5C1A\u672A\u6267\u884C\u8FC7\u51ED\u636E\u5237\u65B0",
        count: rows.length,
        accounts: rows,
        last_run_accounts: entry?.lastRunAccounts ?? []
      };
    },
    async refreshRun(provider, confirm, index) {
      const pid = String(provider ?? "");
      const want = confirm === true;
      const onlyIndex = typeof index === "number" && Number.isInteger(index) ? index : void 0;
      if (!refreshSupported(pid)) {
        return {
          ok: false,
          provider: pid,
          confirm: want,
          count: 0,
          refreshed: 0,
          accounts: [],
          message: `${pid}:\u8BE5\u6E20\u9053\u65E0\u4EE4\u724C\u5237\u65B0\u6982\u5FF5(Nexus REFRESH_PROVIDERS = trae/workbuddy)`
        };
      }
      const flightKey = `${pid}#${onlyIndex === void 0 ? "*" : String(onlyIndex)}`;
      const inflight = refreshInFlight.get(flightKey);
      if (inflight) return inflight;
      const run = doRefreshRun(pid, want, onlyIndex);
      refreshInFlight.set(flightKey, run);
      try {
        return await run;
      } finally {
        refreshInFlight.delete(flightKey);
      }
    },
    async syncChannel(provider, force) {
      const pid = String(provider ?? "");
      const forced = force !== false;
      const accounts = await refreshAccountsOf(pid);
      const checked = accounts.length;
      const protocol = ctx.registry.getProvider(pid)?.protocol?.toLowerCase() ?? "";
      const checkinCapable = checkinSupported(protocol);
      let catalogPart;
      let catalogResult;
      if (CH_CATALOG_PROVIDERS.has(pid)) {
        if (checked === 0) {
          catalogPart = `\u6A21\u578B\u76EE\u5F55:${pid} \u4E0B\u6CA1\u6709\u8D26\u53F7,\u8DF3\u8FC7`;
          catalogResult = { status: "skipped", reason: "\u6CA1\u6709\u8D26\u53F7", count: 0, source: null };
        } else {
          const failures = [];
          let count = 0;
          let warns = [];
          const pulls = accounts.map((a) => a.cred.username);
          for (const username of pulls) {
            try {
              const res = await chAwaitCatalog(pid, username, forced);
              const pdef = ctx.registry.getProvider(pid);
              count = mergeCatalog(pid, res.entries, pdef?.baseUrl ?? null, pdef?.protocol ?? pid);
              warns = res.warnings;
              break;
            } catch (err) {
              failures.push(`${username}:${err instanceof Error ? err.message : String(err)}`);
            }
          }
          const allFailed = failures.length === pulls.length;
          catalogResult = allFailed ? { status: "failed", reason: failures[0] ?? "\u5168\u90E8\u8D26\u53F7\u5931\u8D25", count: 0, source: null } : { status: "ok", reason: `\u4E0A\u6E38 ${count} \u4E2A\u6A21\u578B,\u5DF2\u5199\u5165\u5E93`, count, source: "api" };
          catalogPart = allFailed ? `\u6A21\u578B\u76EE\u5F55\u6CA1\u62C9\u5230(${failures[0] ?? "\u5168\u90E8\u8D26\u53F7\u5931\u8D25"})` : `\u6A21\u578B\u76EE\u5F55 ${count} \u4E2A(\u6765\u6E90:\u4E0A\u6E38 API)${warns.length > 0 ? `(\u964D\u7EA7:${warns[0]})` : ""}`;
        }
      } else {
        catalogPart = "\u6A21\u578B\u76EE\u5F55:\u7F3A\u9879(\u8BE5\u6E20\u9053\u6CA1\u6709 upstream_catalog \u7684\u80FD\u529B\u58F0\u660E)";
        catalogResult = { status: "missing", reason: "\u8BE5\u6E20\u9053\u65E0\u4E0A\u6E38\u76EE\u5F55\u534F\u8BAE", count: 0, source: null };
      }
      const checkinSummary = {
        supported: checkinCapable,
        claimed: 0,
        already: 0,
        skipped: 0,
        failed: 0,
        credit: 0,
        errors: [],
        message: null
      };
      let checkinPart = null;
      if (checkinCapable) {
        if (checked === 0) {
          checkinSummary.message = `${pid} \u4E0B\u6CA1\u6709\u8D26\u53F7,\u8DF3\u8FC7\u7B7E\u5230`;
        } else {
          try {
            const claim = await methods.checkinClaim(pid, true);
            const rows = claim.accounts ?? [];
            checkinSummary.claimed = rows.filter((r) => r.status === "claimed").length;
            checkinSummary.already = rows.filter((r) => r.status === "already").length;
            checkinSummary.skipped = rows.filter((r) => r.status === "skipped").length;
            checkinSummary.failed = rows.filter((r) => r.status === "failed").length;
            checkinSummary.credit = rows.reduce((s, r) => s + Number(r.credit ?? 0), 0);
            checkinSummary.errors = rows.filter((r) => r.status === "failed").map((r) => String(r.message ?? "").slice(0, 300));
          } catch (err) {
            checkinSummary.message = `\u7B7E\u5230\u5931\u8D25:${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
          }
        }
        if (checkinSummary.message) {
          checkinPart = checkinSummary.message;
        } else if (checkinSummary.claimed > 0) {
          const tail = checkinSummary.credit > 0 ? `,\u5171 ${checkinSummary.credit} \u79EF\u5206` : "";
          checkinPart = `\u5DF2\u7B7E\u5230\u9886\u53D6 ${checkinSummary.claimed} \u4E2A\u8D26\u53F7${tail}`;
        } else if (checkinSummary.already > 0) {
          checkinPart = `\u4ECA\u65E5\u5DF2\u7B7E\u5230(${checkinSummary.already} \u4E2A\u8D26\u53F7,\u65E0\u9700\u91CD\u590D\u9886\u53D6)`;
        } else if (checkinSummary.failed > 0) {
          checkinPart = `\u7B7E\u5230\u5931\u8D25:${checkinSummary.errors[0] ?? "\u672A\u77E5\u539F\u56E0"}`;
        } else {
          checkinPart = "\u8BE5\u6E20\u9053\u4ECA\u65E5\u65E0\u7B7E\u5230\u6D3B\u52A8(\u672A\u9886\u53D6)";
        }
      }
      const errors = {};
      let written = 0;
      let probed = 0;
      let quotaPart;
      let quotaResult;
      if (CH_QUOTA_PROVIDERS.has(pid)) {
        if (checked === 0) {
          quotaPart = `${pid} \u4E0B\u6CA1\u6709\u8D26\u53F7,\u8DF3\u8FC7\u989D\u5EA6`;
          quotaResult = { status: "skipped", reason: "\u6CA1\u6709\u8D26\u53F7" };
        } else {
          probed = checked;
          for (const acc of accounts) {
            const snap = await chAwaitQuota(pid, acc.cred.username, forced);
            if (snap && snap.error === null && snap.remaining !== null) {
              written += 1;
            } else {
              errors[credentialKey(pid, acc.cred.username)] = snap?.error ?? "\u65E0\u5BC6\u94A5";
            }
          }
          quotaResult = written === checked ? { status: "ok", reason: `\u5DF2\u5237\u65B0 ${written} \u4E2A\u8D26\u53F7\u989D\u5EA6` } : { status: "partial", reason: `${written} \u6210\u529F / ${checked - written} \u5931\u8D25` };
          quotaPart = quotaResult.status === "ok" ? `\u5DF2\u5237\u65B0 ${written}/${checked} \u4E2A\u8D26\u53F7\u7684\u989D\u5EA6` : `\u5237\u65B0\u5931\u8D25:${Object.values(errors)[0] ?? "\u65E0\u7ED3\u679C"}`;
        }
      } else {
        quotaPart = "\u989D\u5EA6:\u7F3A\u9879(\u8BE5\u6E20\u9053\u65E0\u989D\u5EA6\u534F\u8BAE,Nexus \u4EC5 trae/workbuddy \u6709)";
        quotaResult = { status: "missing", reason: "\u8BE5\u6E20\u9053\u65E0\u989D\u5EA6\u534F\u8BAE" };
      }
      const missing = [];
      if (catalogResult.status === "missing") missing.push("catalog");
      if (quotaResult.status === "missing") missing.push("quota");
      if (!checkinCapable) missing.push("checkin");
      const ok2 = written > 0;
      const message = `${quotaPart};${catalogPart}${checkinPart ? `;${checkinPart}` : ""}`;
      return {
        ok: ok2,
        provider: pid,
        forced,
        checked,
        probed,
        written,
        count: checked,
        message,
        missing,
        errors,
        quota: quotaResult,
        catalog: catalogResult,
        checkin: checkinSummary,
        skipped: []
      };
    },
    // ── 客户端路径 ──────────────────────────────────────────────────────────
    async getClientPaths() {
      return getClientPathsImpl();
    },
    async saveClientPath(channel, path) {
      const pid = String(channel ?? "");
      const key3 = `client_path.${pid}`;
      const raw = String(path ?? "");
      if (raw !== "" && !safeExists(raw)) {
        ctx.db.setting.set(key3, raw);
        return {
          ok: true,
          channel: pid,
          message: `\u5DF2\u4FDD\u5B58 ${key3}(\u26A0\uFE0F \u8BE5\u8DEF\u5F84\u5F53\u524D\u4E0D\u5B58\u5728,\u5BA2\u6237\u7AEF\u88C5\u597D\u540E\u624D\u4F1A\u751F\u6548)`,
          changed: [key3]
        };
      }
      ctx.db.setting.set(key3, raw);
      return { ok: true, message: `\u5DF2\u4FDD\u5B58 ${key3}`, changed: [key3] };
    },
    async detectClientPath(channel) {
      const pid = String(channel ?? "");
      const saved = ctx.db.setting.get(`client_path.${pid}`)?.v ?? null;
      if (saved !== null && saved !== "") {
        return {
          ok: true,
          channel: pid,
          detected_path: saved,
          source: "saved",
          message: `\u4F7F\u7528\u5DF2\u4FDD\u5B58\u7684\u5BA2\u6237\u7AEF\u8DEF\u5F84(\u8BBE\u7F6E client_path.${pid})`
        };
      }
      const det = await probeClientPath(pid);
      if (!det.found || !det.detected_path) {
        return { ok: false, channel: pid, detected_path: null, message: det.message };
      }
      return { ok: true, channel: pid, detected_path: det.detected_path, source: det.source, message: det.message };
    },
    // ── 自动发现 / 接入(镜像 Nexus POST /providers/{id}/discover、/adopt) ───
    async discoverChannelAccounts(provider) {
      const pid = String(provider ?? "");
      switch (pid) {
        case "trae": {
          const found = await discoverTraeAccounts();
          return {
            ok: true,
            provider: pid,
            found: found.length > 0,
            accounts: found.map((a) => ({
              username: a.username,
              region: a.region ?? null,
              hint: `\u6765\u6E90:${a.source}${a.edition ? `(${a.edition})` : ""}${a.host ? `, host=${a.host}` : ""}`,
              token: a.token,
              edition: a.edition ?? null,
              source: a.source,
              token_expires_at_ms: a.token_expires_at_ms ?? null
            })),
            message: found.length > 0 ? `\u53D1\u73B0 ${found.length} \u4E2A\u672C\u673A Trae \u767B\u5F55\u6001(CLI token / \u684C\u9762\u7248 storage.json)` : "\u672A\u53D1\u73B0 Trae \u672C\u673A\u767B\u5F55\u6001(\u5DF2\u626B\u63CF CLI token \u4E0E\u684C\u9762\u7248 storage.json;\u672A\u767B\u5F55\u6216\u672A\u5B89\u88C5)"
          };
        }
        case "workbuddy":
          return {
            ok: true,
            provider: pid,
            found: false,
            accounts: [],
            message: "Nexus \u65E0\u6B64\u6E20\u9053 discover(workbuddy \u6CA1\u6709\u672C\u673A\u767B\u5F55\u6001\u626B\u63CF\u5668);\u8BF7\u5728\u8D26\u53F7\u7BA1\u7406\u91CC\u624B\u52A8\u6DFB\u52A0\u8D26\u53F7\u4E0E\u5BC6\u94A5"
          };
        case "sensenova":
          return {
            ok: true,
            provider: pid,
            found: false,
            accounts: [],
            message: "SenseNova \u65E0\u672C\u673A\u5BA2\u6237\u7AEF\u767B\u5F55\u6001,\u4E0D\u9002\u7528\u81EA\u52A8\u53D1\u73B0"
          };
        default:
          return { ok: false, provider: pid, found: false, accounts: [], message: `\u672A\u77E5\u6E20\u9053 ${pid}` };
      }
    },
    async adoptChannelAccount(provider, username, token, region) {
      const pid = String(provider ?? "");
      const name2 = String(username ?? "").trim();
      const tok = String(token ?? "").trim();
      if (!pid || !name2 || !tok) {
        return { ok: false, provider: pid, message: "adopt \u9700\u8981 provider/username/token" };
      }
      const raw = { source: "discover", adopted_at_ms: wallNow() };
      if (region) raw.region = String(region);
      await ctx.vault.put({ provider: pid, username: name2, secret: tok, raw });
      ctx.syncRegistry();
      return {
        ok: true,
        provider: pid,
        username: name2,
        message: `\u5DF2\u63A5\u5165 ${pid}/${name2}(\u81EA\u52A8\u53D1\u73B0\u5BFC\u5165${region ? `, region=${region}` : ""})`,
        changed: [credentialKey(pid, name2)]
      };
    }
  };
  return methods;
}

// ../panel/src/channels-sync.ts
import { existsSync as existsSync4 } from "node:fs";
import { join as join5 } from "node:path";

// ../core/src/collector/catalog.ts
import { randomBytes as randomBytes6 } from "node:crypto";

// ../core/src/gateway/model-catalog.ts
var CONTEXT_KEYS = [
  "context_length",
  "max_input_tokens",
  "context_window",
  "max_model_len",
  "input_token_limit"
];
var OUTPUT_KEYS = [
  "max_completion_tokens",
  "max_output_tokens",
  "max_output_length",
  "completion_tokens_limit",
  "output_token_limit",
  "max_output"
];
var VISION_FLAG_KEYS = [
  "supports_vision",
  "vision",
  "supports_image_input"
];
var VISION_LIST_KEYS = [
  "input_modalities",
  "supported_input_modalities",
  "modalities",
  "input_types"
];
var MAX_UPSTREAM_MODELS = 500;
var MAX_MODEL_NAME = 200;
function capabilityInt(value) {
  if (typeof value === "boolean") return null;
  if (typeof value === "number") {
    if (Number.isNaN(value) || value === Infinity || value === -Infinity) return null;
    const number = Math.trunc(value);
    return number > 0 ? number : null;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^\d+$/.test(text)) return null;
    const number = Number(text);
    return number > 0 ? number : null;
  }
  return null;
}
function firstCapabilityInt(record2, keys) {
  for (const key3 of keys) {
    const number = capabilityInt(record2[key3]);
    if (number !== null) return number;
  }
  return null;
}
function visionOf(record2) {
  for (const key3 of VISION_FLAG_KEYS) {
    if (record2[key3] === true) return true;
  }
  for (const key3 of VISION_LIST_KEYS) {
    const kinds = record2[key3];
    if (!Array.isArray(kinds)) continue;
    const values = new Set(kinds.map((k) => String(k).trim().toLowerCase()));
    if (values.has("image") || values.has("images") || values.has("vision") || values.has("multimodal")) {
      return true;
    }
  }
  return false;
}
function reasoning_field_of(raw) {
  for (const key3 of ["reasoning", "reasoning_config", "reasoningConfig", "thinking", "thinking_config", "thinkingConfig"]) {
    const v = raw[key3];
    if (v !== void 0 && v !== null && typeof v !== "boolean") return v;
  }
  for (const key3 of ["reasoning_efforts", "supported_reasoning_efforts", "supportedReasoningEfforts"]) {
    const v = raw[key3];
    if (typeof v === "string" && v.trim() !== "") {
      const parts = v.split(/[,，;；|]/).map((s) => s.trim()).filter(Boolean);
      return parts.length > 0 ? { supportedEfforts: parts } : null;
    }
    const list = Array.isArray(v) ? v : [];
    if (list.length > 0) {
      const parts = list.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (parts.length > 0) return { supportedEfforts: parts };
    }
  }
  return null;
}
function reasoning_efforts_of(reasoning, supports_reasoning = void 0) {
  if (reasoning !== null && reasoning !== void 0) {
    const r = reasoning && typeof reasoning === "object" && !Array.isArray(reasoning) ? reasoning : {};
    const rawList = Array.isArray(r["supportedEfforts"]) ? r["supportedEfforts"] : [];
    const levels = canonizeLevels(rawList.map((x) => String(x ?? "")));
    if (levels.length > 0) return levels;
    const single = String(r["effort"] ?? "").trim();
    return single ? canonizeLevels([single]) : [];
  }
  return supports_reasoning === true ? null : [];
}
function reasoning_allows_off_of(reasoning) {
  if (!reasoning || typeof reasoning !== "object" || Array.isArray(reasoning)) return null;
  const v = reasoning["canDisableThinking"];
  if (v === true) return true;
  if (v === false) return false;
  return null;
}
function modelEntry(name2, record2) {
  if (!record2 || typeof record2 !== "object" || Array.isArray(record2)) {
    return {
      id: name2,
      context_window: null,
      max_output: null,
      vision: false,
      reasoning_efforts: null,
      reasoning_allows_off: null
    };
  }
  const r = record2;
  const reasoningField = reasoning_field_of(r);
  return {
    id: name2,
    context_window: firstCapabilityInt(r, CONTEXT_KEYS),
    max_output: firstCapabilityInt(r, OUTPUT_KEYS),
    vision: visionOf(r),
    reasoning_efforts: reasoningField === null ? null : reasoning_efforts_of(reasoningField),
    reasoning_allows_off: reasoningField === null ? null : reasoning_allows_off_of(reasoningField)
  };
}
function parseModelEntries(payload) {
  let items;
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    items = null;
    for (const key3 of ["data", "models", "items", "result"]) {
      const value = payload[key3];
      if (Array.isArray(value)) {
        items = value;
        break;
      }
    }
  } else {
    return null;
  }
  if (!Array.isArray(items)) return null;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of items) {
    let name2;
    let record2;
    if (typeof item === "string") {
      name2 = item.trim();
      record2 = null;
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const r = item;
      name2 = String(r.id ?? r.model ?? r.name ?? "").trim();
      record2 = r;
    } else {
      continue;
    }
    if (!name2 || seen.has(name2)) continue;
    seen.add(name2);
    out.push(modelEntry(name2.slice(0, MAX_MODEL_NAME), record2));
    if (out.length >= MAX_UPSTREAM_MODELS) break;
  }
  return out;
}

// ../core/src/collector/catalog.ts
var CatalogError = class extends Error {
  kind = "catalog";
  constructor(message) {
    super(message);
    this.name = "CatalogError";
  }
};
function positive_int(value) {
  const num2 = number_of(value);
  if (num2 === null || !Number.isFinite(num2) || num2 <= 0) return null;
  return Math.floor(num2);
}
function nonempty_str(value) {
  return typeof value === "string" ? value.trim() : "";
}
function rate_of(value, allowZero = false) {
  const num2 = number_of(value);
  if (num2 === null || !Number.isFinite(num2) || num2 < 0) return null;
  if (num2 === 0 && !allowZero) return null;
  return num2;
}
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function is_list(value) {
  return Array.isArray(value) ? value : [];
}
var CATALOG_PROVIDERS = ["trae", "workbuddy", "sensenova"];
var CATALOG_TIMEOUT_MS = 8e3;
function catalog_supported(provider_id) {
  const p = String(provider_id ?? "").trim().toLowerCase();
  return CATALOG_PROVIDERS.includes(p);
}
var TRAE_REMOTE_BASES = {
  cn: "https://solo.trae.cn/api/remote/v1",
  ai: "https://coresg-normal.trae.ai/api/remote/v1"
};
var TRAE_WIRE_PATH = "/api/ide/v1/get_detail_param";
var TRAE_WIRE_FUNCTIONS = {
  cn: ["solo_work_remote", "solo_work_lite", "solo_agent_remote", "chat_v3", "solo_coder"],
  ai: ["solo_work_remote", "solo_work_lite", "solo_agent_remote", "chat_v3"]
};
var TRAE_REMOTE_FUNCTIONS = [
  "solo_agent",
  "solo_agent_remote",
  "solo_work_remote",
  "solo_work_lite",
  "chat_v3",
  "solo_coder",
  "builder_v3"
];
function trae_region_dressing(region) {
  if (region === "ai") {
    return {
      referer: "https://coresg-normal.trae.ai/",
      timezone: "Asia/Singapore",
      language: "en"
    };
  }
  return {
    referer: "https://solo.trae.cn/",
    timezone: "Asia/Shanghai",
    language: "zh-cn"
  };
}
function trae_wire_body(fn) {
  return {
    function: fn,
    config_names: null,
    need_prompt: false,
    current_config_info: null,
    poly_prompt: true,
    mode_type: null,
    agent_type: null
  };
}
function wire_credit_multiplier(config) {
  const raw = config["display_contact_config"];
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const consumption = record(record(parsed)["consumption_rate"]);
  if (consumption["enable"] !== true) return null;
  return rate_of(record(consumption["data"])["rate"]);
}
function parse_trae_wire_model(value) {
  const raw = record(value);
  const mid = nonempty_str(raw["config_name"]);
  if (!mid) return null;
  const display = record(raw["display_config"]);
  const details = raw["model_detail_list"];
  const detail2 = is_list(details).length > 0 ? record(is_list(details)[0]) : {};
  const tokens = record(raw["context_window_tokens"]);
  const context = positive_int(tokens["max"]) ?? positive_int(tokens["dev"]) ?? positive_int(detail2["prompt_max_tokens"]);
  return {
    id: mid,
    name: nonempty_str(display["display_name"]) || mid,
    vision: raw["multimodal"] === true,
    context_window: context,
    max_output: positive_int(detail2["max_tokens"]),
    rate: wire_credit_multiplier(raw),
    origin: "wire",
    callable: true,
    // trae 的能力字段散在 display_config 与 model_detail_list 里,字段名也没有共识,
    // 所以走通用探测(见 `reasoning_field_of`)—— 探不到就是 `[]`/`null`,不猜。
    reasoning_efforts: reasoning_efforts_of(
      reasoning_field_of(raw) ?? reasoning_field_of(display) ?? reasoning_field_of(detail2)
    ),
    reasoning_allows_off: reasoning_allows_off_of(
      reasoning_field_of(raw) ?? reasoning_field_of(display) ?? reasoning_field_of(detail2)
    )
  };
}
function parse_trae_remote_model(value) {
  const raw = record(value);
  const mid = nonempty_str(raw["name"]);
  if (!mid) return null;
  const tokens = record(raw["context_window_tokens"]);
  const context = positive_int(tokens["max"]) ?? positive_int(tokens["dev"]);
  let features = {};
  if (typeof raw["features"] === "string") {
    try {
      features = record(JSON.parse(raw["features"]));
    } catch {
      features = {};
    }
  }
  const consumption = record(features["consumption_rate"]);
  const rate = consumption["enable"] === true ? rate_of(record(consumption["data"])["rate"]) : null;
  return {
    id: mid,
    name: nonempty_str(raw["display_name"]) || mid,
    vision: raw["multimodal"] === true,
    context_window: context,
    // 远程目录不给输出上限 —— 宁可空着也不猜。
    max_output: null,
    rate,
    origin: "remote",
    callable: false,
    reasoning_efforts: reasoning_efforts_of(reasoning_field_of(raw) ?? reasoning_field_of(features)),
    reasoning_allows_off: reasoning_allows_off_of(
      reasoning_field_of(raw) ?? reasoning_field_of(features)
    )
  };
}
function prefer_stronger(neu, old) {
  if (old === void 0) return neu;
  const newCtx = neu.context_window ?? 0;
  const oldCtx = old.context_window ?? 0;
  if (newCtx > oldCtx) return neu;
  if (newCtx === oldCtx && (neu.max_output ?? 0) > (old.max_output ?? 0)) return neu;
  return old;
}
function display_key(name2) {
  return (name2 || "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}
function merge_trae(remote, wire) {
  const wireByDisplay = /* @__PURE__ */ new Map();
  for (const entry of Object.values(wire)) {
    if (!wireByDisplay.has(display_key(entry.id))) wireByDisplay.set(display_key(entry.id), entry);
    if (!wireByDisplay.has(display_key(entry.name))) wireByDisplay.set(display_key(entry.name), entry);
  }
  const entries = [];
  for (const up of Object.values(remote)) {
    let hit = wire[up.id];
    if (hit === void 0) {
      hit = wireByDisplay.get(display_key(up.id)) ?? wireByDisplay.get(display_key(up.name));
    }
    if (hit === void 0) {
      entries.push({ ...up, callable: false });
      continue;
    }
    entries.push({
      id: hit.id,
      name: up.name || hit.name,
      vision: Boolean(up.vision || hit.vision),
      context_window: hit.context_window ?? up.context_window,
      max_output: hit.max_output ?? up.max_output,
      rate: hit.rate ?? up.rate,
      origin: "wire",
      callable: true
    });
  }
  entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return entries;
}
async function fetch_trae_catalog(account, opts = {}) {
  const region = normalize_region(account.region ?? void 0);
  const extras = account.extras ?? {};
  const identity = resolve_identity(account.token, extras);
  const chatBase = opts.baseUrl ?? account.baseUrl ?? resolve_api_base(void 0, region, extras);
  const warnings = [];
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CATALOG_TIMEOUT_MS;
  const wireHeaders = build_headers(account.token, identity, randomBytes6(16).toString("hex"));
  wireHeaders["Accept"] = "application/json";
  const wire = {};
  for (const fn of TRAE_WIRE_FUNCTIONS[region] ?? TRAE_WIRE_FUNCTIONS.cn) {
    let payload;
    try {
      const res = await fetchFn(`${chatBase.replace(/\/+$/, "")}${TRAE_WIRE_PATH}`, {
        method: "POST",
        headers: wireHeaders,
        body: JSON.stringify(trae_wire_body(fn)),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (res.status >= 400) throw new CatalogError(`HTTP ${res.status}`);
      payload = JSON.parse(await res.text());
    } catch (err) {
      warnings.push(`trae ${fn} \u540D\u5355\u5931\u8D25:${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const rows = record(payload)["config_info_list"];
    for (const raw of is_list(rows)) {
      const entry = parse_trae_wire_model(raw);
      if (entry === null) continue;
      wire[entry.id] = prefer_stronger(entry, wire[entry.id]);
    }
  }
  const remote = {};
  const dress = trae_region_dressing(region);
  const remoteHeaders = {
    Authorization: `Cloud-IDE-JWT ${account.token}`,
    Accept: "application/json",
    "x-trae-client-type": "web",
    "x-trae-user-timezone": dress.timezone,
    "x-preferenced-language": dress.language,
    Referer: dress.referer,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  };
  try {
    const base = TRAE_REMOTE_BASES[region] ?? TRAE_REMOTE_BASES.cn;
    const u = new URL(`${base.replace(/\/+$/, "")}/models`);
    u.searchParams.set("functions", TRAE_REMOTE_FUNCTIONS.join(","));
    const res = await fetchFn(u.toString(), { headers: remoteHeaders, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 400) throw new CatalogError(`HTTP ${res.status}`);
    const payload = JSON.parse(await res.text());
    const groups = record(record(payload)["data"])["list"];
    for (const group of is_list(groups)) {
      for (const raw of is_list(record(group)["models"])) {
        const entry = parse_trae_remote_model(raw);
        if (entry === null) continue;
        remote[entry.id] = prefer_stronger(entry, remote[entry.id]);
      }
    }
  } catch (err) {
    warnings.push(`trae \u8FDC\u7A0B\u76EE\u5F55\u5931\u8D25:${err instanceof Error ? err.message : String(err)}`);
  }
  let entries;
  if (Object.keys(remote).length === 0 && Object.keys(wire).length > 0) {
    warnings.push(
      "trae \u8FDC\u7A0B\u76EE\u5F55\u6CA1\u53D6\u5230,\u6539\u7528 chat \u540D\u5355;\u8FD9\u4EFD\u6E05\u5355\u53EF\u80FD\u542B IDE \u5185\u90E8\u6761\u76EE(custom_model_*/search_agent_*)"
    );
    entries = Object.values(wire).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  } else {
    entries = merge_trae(remote, wire);
  }
  return {
    provider: "trae",
    entries,
    source: entries.length > 0 ? "api" : "empty",
    fetched_at: Math.floor(Date.now() / 1e3),
    warnings
  };
}
var WORKBUDDY_GLOBAL_CONFIG_PATH = "/v3/config";
var WORKBUDDY_PERSONAL_MODELS_PATH = "/v2/enterprises/personal/models";
var WORKBUDDY_CLI_UA = "CLI/2.63.2 CodeBuddy/2.63.2";
var WORKBUDDY_DESKTOP_UA = "WorkBuddy/5.5.2";
var CREDITS_RATE_RE = /x\s*([0-9.]+)/;
var NATIVE_MODALITY_BY_MODEL_ID = {
  "deepseek-v4-pro": "text",
  "glm-5.1": "text",
  "glm-5.2": "text",
  "glm-5.3": "text",
  hy3: "text",
  "hy4-preview": "text",
  "deepseek-v4.1-flash": "multimodal",
  "glm-5.3-flash": "multimodal",
  "glm-5v-turbo": "multimodal",
  "kimi-k2.6": "multimodal",
  "kimi-k2.7": "multimodal",
  "kimi-k3-1": "multimodal",
  "minimax-m3": "multimodal"
};
function workbuddy_vision_default(model_id, supports_images, disabled_multimodal = null) {
  if (supports_images === false || disabled_multimodal === true) return false;
  return NATIVE_MODALITY_BY_MODEL_ID[model_id] === "multimodal";
}
function parse_workbuddy_model(value) {
  const raw = record(value);
  const mid = nonempty_str(raw["id"]);
  if (!mid || raw["disabled"] === true) return null;
  const context = positive_int(raw["maxInputTokens"]);
  const output = positive_int(raw["maxOutputTokens"]);
  if (context === null || output === null) return null;
  const supportsImages = raw["disabledMultimodal"] === true ? false : typeof raw["supportsImages"] === "boolean" ? raw["supportsImages"] : null;
  let rate = null;
  const credits = raw["credits"];
  if (typeof credits === "string") {
    const m = CREDITS_RATE_RE.exec(credits);
    if (m) rate = rate_of(m[1], true);
  }
  return {
    id: mid,
    name: nonempty_str(raw["name"]) || mid,
    vision: workbuddy_vision_default(mid, supportsImages, raw["disabledMultimodal"]),
    context_window: context,
    max_output: output,
    rate,
    origin: "config",
    callable: true,
    reasoning_efforts: reasoning_efforts_of(raw["reasoning"], raw["supportsReasoning"]),
    reasoning_allows_off: reasoning_allows_off_of(raw["reasoning"])
  };
}
function select_cli_models(raw_models, agents) {
  const byId = /* @__PURE__ */ new Map();
  for (const raw of is_list(raw_models)) {
    const entry = parse_workbuddy_model(raw);
    if (entry !== null && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  let order = [];
  for (const agent of is_list(agents)) {
    const row = record(agent);
    if (row["name"] === "cli" && is_list(row["models"]).length > 0) {
      order = is_list(row["models"]).map(nonempty_str).filter(Boolean);
      break;
    }
  }
  if (order.length > 0) {
    const picked = [];
    for (const id of order) {
      const hit = byId.get(id);
      if (hit) picked.push(hit);
    }
    if (picked.length > 0) return picked;
  }
  return [...byId.values()];
}
async function fetch_workbuddy_catalog(account, opts = {}) {
  const realm = normalize_region2(
    (account.region ?? "").toString().trim() || detect_region_from_token(account.token)
  );
  const extras = account.extras ?? {};
  const domain = nonempty_str(extras["domain"]);
  const uid = nonempty_str(account.uid) || nonempty_str(extras["uin"]);
  const enterprise = nonempty_str(account.enterprise_id) || nonempty_str(extras["enterprise_id"]);
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CATALOG_TIMEOUT_MS;
  const warnings = [];
  const readConfig = async (url, headers) => {
    let res;
    let text;
    try {
      res = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new CatalogError(`\u8FDE\u63A5\u5931\u8D25:${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status >= 400) throw new CatalogError(`HTTP ${res.status}`);
    try {
      text = await res.text();
    } catch (err) {
      throw new CatalogError(`\u54CD\u5E94\u8BFB\u53D6\u5931\u8D25:${err instanceof Error ? err.message : String(err)}`);
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new CatalogError("\u54CD\u5E94\u4E0D\u662F JSON");
    }
    const root = record(payload);
    const code = root["code"];
    if (code !== void 0 && code !== null && Number(code) !== 0) {
      throw new CatalogError(`\u4E1A\u52A1\u5931\u8D25 code=${String(code)}:${nonempty_str(root["msg"])}`);
    }
    const data = record(root["data"]);
    const rows = select_cli_models(data["models"], data["agents"]);
    if (rows.length === 0) {
      throw new CatalogError("\u54CD\u5E94\u91CC\u6CA1\u6709\u53EF\u7528\u6A21\u578B(\u4E0A\u4E0B\u6587 / \u8F93\u51FA\u4E0A\u9650\u7F3A\u5931\u6216\u4E3A 0)");
    }
    return rows;
  };
  let entries;
  if (realm === "cn") {
    const base = (opts.baseUrl ?? REGION_BASES2.cn).replace(/\/+$/, "");
    const headers = {
      Authorization: `Bearer ${account.token}`,
      Accept: "application/json",
      "User-Agent": WORKBUDDY_CLI_UA,
      Origin: base,
      Referer: `${base}/`
    };
    if (uid) headers["X-User-Id"] = uid;
    if (enterprise) headers["X-Enterprise-Id"] = enterprise;
    try {
      entries = await readConfig(`${base}${WORKBUDDY_GLOBAL_CONFIG_PATH}`, headers);
    } catch (err) {
      warnings.push(
        `workbuddy ${WORKBUDDY_GLOBAL_CONFIG_PATH} \u5931\u8D25,\u56DE\u9000 ${WORKBUDDY_PERSONAL_MODELS_PATH}:${err instanceof Error ? err.message : String(err)}`
      );
      entries = await readConfig(`${base}${WORKBUDDY_PERSONAL_MODELS_PATH}`, headers);
    }
  } else {
    const base = (opts.baseUrl ?? REGION_BASES2.global).replace(/\/+$/, "");
    const headers = {
      Authorization: `Bearer ${account.token}`,
      Accept: "application/json",
      "User-Agent": WORKBUDDY_DESKTOP_UA,
      "X-Product": "SaaS",
      "X-Requested-With": "XMLHttpRequest",
      Connection: "close"
    };
    if (uid) headers["X-User-Id"] = uid;
    if (domain) headers["X-Domain"] = domain;
    entries = await readConfig(`${base}${WORKBUDDY_GLOBAL_CONFIG_PATH}`, headers);
  }
  return {
    provider: "workbuddy",
    entries,
    source: "api",
    fetched_at: Math.floor(Date.now() / 1e3),
    warnings
  };
}
var SENSENOVA_MODELS_PATH = "/v1/models";
var SENSENOVA_CATALOG_BASE = "https://token.sensenova.cn";
function sensenova_models_url(base = "") {
  const root = (base || "").trim().replace(/\/+$/, "") || SENSENOVA_CATALOG_BASE;
  return root.endsWith("/v1") ? `${root}/models` : `${root}${SENSENOVA_MODELS_PATH}`;
}
function parse_sensenova_model(value) {
  const raw = record(value);
  const mid = nonempty_str(raw["id"]);
  if (!mid) return null;
  const modalities = raw["input_modalities"];
  const vision = is_list(modalities).includes("image");
  const features = is_list(raw["supported_features"]);
  const supportsReasoning = features.includes("reasoning") || nonempty_str(raw["reasoning_efforts"]) !== null;
  return {
    id: mid,
    name: nonempty_str(raw["name"]) || mid,
    vision,
    context_window: positive_int(raw["context_length"]),
    max_output: positive_int(raw["max_output_length"]),
    rate: null,
    origin: "config",
    callable: true,
    reasoning_efforts: reasoning_efforts_of(
      reasoning_field_of(raw),
      supportsReasoning === true ? true : void 0
    ),
    reasoning_allows_off: reasoning_allows_off_of(reasoning_field_of(raw))
  };
}
async function fetch_sensenova_catalog(account, opts = {}) {
  if (!account.token) {
    throw new CatalogError("sensenova \u6CA1\u6709\u53EF\u7528 API key,\u62C9\u4E0D\u4E86\u6A21\u578B\u76EE\u5F55");
  }
  const url = sensenova_models_url(opts.baseUrl ?? account.baseUrl ?? "");
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CATALOG_TIMEOUT_MS;
  let res;
  let text;
  try {
    res = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${account.token}`,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    throw new CatalogError(`\u8FDE\u63A5\u5931\u8D25:${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status >= 400) throw new CatalogError(`HTTP ${res.status}`);
  try {
    text = await res.text();
  } catch (err) {
    throw new CatalogError(`\u54CD\u5E94\u8BFB\u53D6\u5931\u8D25:${err instanceof Error ? err.message : String(err)}`);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new CatalogError("\u54CD\u5E94\u4E0D\u662F JSON");
  }
  const entries = [];
  for (const raw of is_list(record(payload)["data"])) {
    const entry = parse_sensenova_model(raw);
    if (entry !== null) entries.push(entry);
  }
  if (entries.length === 0) {
    throw new CatalogError("sensenova /v1/models \u6CA1\u6709\u8FD4\u56DE\u53EF\u7528\u6A21\u578B");
  }
  entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    provider: "sensenova",
    entries,
    source: "api",
    fetched_at: Math.floor(Date.now() / 1e3),
    warnings: []
  };
}
async function fetch_catalog(provider_id, account, opts = {}) {
  const provider = String(provider_id ?? "").trim().toLowerCase();
  if (provider === "trae") return fetch_trae_catalog(account, opts);
  if (provider === "workbuddy") return fetch_workbuddy_catalog(account, opts);
  if (provider === "sensenova") return fetch_sensenova_catalog(account, opts);
  throw new CatalogError(`${provider} \u6CA1\u6709\u53EF\u62C9\u53D6\u7684\u4E0A\u6E38\u6A21\u578B\u76EE\u5F55`);
}

// ../panel/src/channels-sync.ts
function createChannelsSyncDomain(ctx, deps) {
  const { chQuotaCache: chQuotaCache2, chQuotaGate: chQuotaGate2, chQuotaInflight: chQuotaInflight2 } = deps;
  const chQuotaCooldownMs = () => {
    const raw = ctx.db.setting.get("external_refresh.interval_hours")?.v ?? "24";
    const hours = Number(raw);
    const h = Number.isFinite(hours) && hours > 0 ? hours : 24;
    return h * 3600 * 1e3;
  };
  const chQuotaFetch = async (pid, username) => {
    const key3 = credentialKey(pid, username);
    if (!CH_QUOTA_PROVIDERS.has(pid)) return null;
    const cred = await ctx.vault.get(pid, username);
    const token = cred?.secret ?? null;
    if (!token || !cred) return null;
    const raw = cred.raw ?? {};
    const account = {
      credentialKey: key3,
      provider: pid,
      username,
      token,
      region: strOf(raw, "region"),
      uid: strOf(raw, "uid") ?? strOf(raw, "user_id"),
      enterprise_id: strOf(raw, "enterprise_id"),
      extras: raw
    };
    let snapshot;
    try {
      snapshot = pid === "trae" ? await probe_trae_quota(account) : await probe_workbuddy_quota(account);
    } catch (err) {
      snapshot = {
        credentialKey: key3,
        remaining: null,
        limit: null,
        expires_at: null,
        fetched_at: Math.floor(Date.now() / 1e3),
        packs: [],
        error: err instanceof Error ? err.message : String(err)
      };
    }
    chQuotaCache2.set(key3, { fetchedAtMs: Date.now(), snapshot });
    try {
      ctx.scheduler.invalidate();
    } catch {
    }
    return snapshot;
  };
  function catalogCooldownStateOf(pid) {
    const cooldownS = Math.round(chQuotaCooldownMs() / 1e3);
    let newest = 0;
    for (const [key3, entry] of chCatalogCache.entries()) {
      if (!key3.startsWith(`${pid}/`)) continue;
      if (entry.fetchedAtMs > newest) newest = entry.fetchedAtMs;
    }
    const ageS = newest > 0 ? Math.round((Date.now() - newest) / 1e3) : null;
    const nextInS = ageS === null ? null : Math.max(0, cooldownS - ageS);
    return {
      armed: false,
      cooldown_s: cooldownS,
      catalog_age_s: ageS,
      quota_age_s: null,
      catalog_next_in_s: nextInS,
      quota_next_in_s: null,
      cooling: ageS !== null && nextInS !== null && nextInS > 0,
      quota_exhausted: null
    };
  }
  const chMaybeFetchQuota = (pid, username, force = false) => {
    const key3 = credentialKey(pid, username);
    const now = Date.now();
    const cd = chQuotaCooldownMs();
    if (!force) {
      const cached = chQuotaCache2.get(key3);
      if (cached && now - cached.fetchedAtMs < cd) return;
      if (now - (chQuotaGate2.get(key3) ?? 0) < cd) return;
    }
    chQuotaGate2.set(key3, now);
    if (!chQuotaInflight2.has(key3)) {
      const p = chQuotaFetch(pid, username).finally(() => chQuotaInflight2.delete(key3));
      chQuotaInflight2.set(key3, p);
    }
  };
  const chAwaitQuota = async (pid, username, force = false) => {
    const key3 = credentialKey(pid, username);
    const now = Date.now();
    const cd = chQuotaCooldownMs();
    const cached = chQuotaCache2.get(key3);
    if (!force && cached && now - cached.fetchedAtMs < cd) return cached.snapshot;
    if (!force && now - (chQuotaGate2.get(key3) ?? 0) < cd) {
      if (cached) return cached.snapshot;
      const inflight = chQuotaInflight2.get(key3);
      if (inflight) return inflight;
      return null;
    }
    chQuotaGate2.set(key3, now);
    const p = chQuotaFetch(pid, username);
    chQuotaInflight2.set(key3, p.finally(() => chQuotaInflight2.delete(key3)));
    return p;
  };
  const catalogAccountOf = async (pid, username) => {
    const cred = await ctx.vault.get(pid, username);
    const token = cred?.secret ?? null;
    if (!token || !cred) return null;
    const raw = cred.raw ?? {};
    return {
      provider: pid,
      username,
      token,
      region: strOf(raw, "region"),
      uid: strOf(raw, "uid") ?? strOf(raw, "user_id"),
      enterprise_id: strOf(raw, "enterprise_id"),
      extras: raw,
      // provider.base_url 只给 openai 兼容端点用;trae/workbuddy 的目录主机
      // 在 core catalog.ts 内部按区域推导(刻意不读聊天端点,理由见该文件)。
      baseUrl: null
    };
  };
  const chCatalogCache = /* @__PURE__ */ new Map();
  const chCatalogGate = /* @__PURE__ */ new Map();
  const chCatalogInflight = /* @__PURE__ */ new Map();
  const chCatalogFetch = async (pid, username) => {
    const account = await catalogAccountOf(pid, username);
    if (account === null) throw new Error(`${pid}/${username} \u6CA1\u6709\u53EF\u7528\u5BC6\u94A5`);
    const pdef = ctx.registry.getProvider(pid);
    const result = await fetch_catalog(pid, account, {
      // openai 兼容端点(如 sensenova 的 token 站)可显式覆盖基址。
      baseUrl: catalog_supported(pid) ? void 0 : pdef?.baseUrl ?? void 0
    });
    chCatalogCache.set(`${pid}/${username}`, { fetchedAtMs: Date.now(), result });
    return result;
  };
  const chAwaitCatalog = async (pid, username, force = false) => {
    const key3 = `${pid}/${username}`;
    const now = Date.now();
    const cd = chQuotaCooldownMs();
    const cached = chCatalogCache.get(key3);
    if (!force && cached && now - cached.fetchedAtMs < cd) return cached.result;
    if (!force && now - (chCatalogGate.get(key3) ?? 0) < cd) {
      if (cached) return cached.result;
      const inflight = chCatalogInflight.get(key3);
      if (inflight) return inflight;
      throw new Error("\u51B7\u5374\u4E2D,\u8BF7\u7A0D\u540E\u518D\u8BD5");
    }
    chCatalogGate.set(key3, now);
    const p = chCatalogFetch(pid, username).finally(() => chCatalogInflight.delete(key3));
    chCatalogInflight.set(key3, p);
    return p;
  };
  const catalogFetchedAt = /* @__PURE__ */ new Map();
  const catalogRows = /* @__PURE__ */ new Map();
  const catalogRowsOf = (pid) => catalogRows.get(pid) ?? /* @__PURE__ */ new Map();
  async function probeProviderModels(url, bearerKey) {
    const headers = { Accept: "application/json" };
    if (bearerKey !== null) headers["Authorization"] = `Bearer ${bearerKey}`;
    let res;
    let bodyText;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(1e4) });
    } catch (err) {
      const why = err instanceof Error ? `${err.name}:${err.message}` : String(err);
      const cause = err instanceof Error && err.cause instanceof Error ? `(${err.cause.message})` : "";
      return { ok: false, message: `\u6253\u4E0D\u5230\u4E0A\u6E38(10 \u79D2\u540E\u653E\u5F03):${why}${cause}` };
    }
    if (res.status >= 400) {
      return {
        ok: false,
        message: `\u4E0A\u6E38\u8FD4\u56DE HTTP ${res.status} \u2014\u2014 \u8FD9\u662F**\u63A2\u6D4B\u5931\u8D25**,\u4E0D\u4EE3\u8868\u4E0A\u6E38\u6CA1\u6709\u6A21\u578B(\u5BC6\u94A5\u4E0D\u5BF9/\u7F51\u5173\u4E0A\u7EBF\u8DEF\u7531\u90FD\u53EF\u80FD\u8FD9\u6837)`
      };
    }
    try {
      bodyText = await res.text();
    } catch (err) {
      return { ok: false, message: `\u8BFB\u4E0A\u6E38\u54CD\u5E94\u5931\u8D25:${err instanceof Error ? err.message : String(err)}` };
    }
    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      const clip = bodyText.replace(/[^\x20-\x7e\u4e00-\u9fff\n]/g, "?").slice(0, 120);
      const isHtml = /^\s*</.test(bodyText);
      return {
        ok: false,
        message: isHtml ? `\u4E0A\u6E38\u8FD4\u56DE\u7684\u4E0D\u662F JSON \u800C\u662F\u4E00\u4E2A\u7F51\u9875(HTTP ${res.status})\u3002\u8FD9\u901A\u5E38\u8BF4\u660E**\u5730\u5740\u4E0D\u5BF9** \u2014\u2014 \u8BE5\u7AEF\u70B9\u8FD4\u56DE\u7684\u662F\u7BA1\u7406\u53F0/\u767B\u5F55\u9875,\u4E0D\u662F\u6A21\u578B\u5217\u8868\u63A5\u53E3;\u8BF7\u6838\u5BF9 base_url \u4E0E\u8DEF\u5F84(\u5E38\u89C1\u662F\u5C11\u4E86 /v1)\u3002\u539F\u59CB\u54CD\u5E94\u5F00\u5934:${clip}` : `\u4E0A\u6E38\u8FD4\u56DE\u7684\u4E0D\u662F JSON(HTTP ${res.status}),\u65E0\u6CD5\u89E3\u6790\u6A21\u578B\u6E05\u5355:${clip}`
      };
    }
    const parsed = parseModelEntries(payload);
    if (parsed === null) {
      return {
        ok: false,
        message: "\u4E0A\u6E38\u56DE\u4E86 JSON,\u4F46\u8BA4\u4E0D\u51FA\u6A21\u578B\u5217\u8868(\u671F\u671B data / models \u6570\u7EC4,\u6216\u76F4\u63A5\u662F\u5B57\u7B26\u4E32\u6570\u7EC4)"
      };
    }
    const entries = parsed.map((e) => ({
      id: e.id,
      name: e.id,
      vision: e.vision,
      context_window: e.context_window,
      max_output: e.max_output,
      rate: null,
      origin: "remote",
      callable: true
    }));
    return { ok: true, entries };
  }
  function serializeReasoningEfforts(efforts) {
    if (efforts === null || efforts === void 0) return null;
    return JSON.stringify(efforts);
  }
  const mergeCatalog = (pid, entries, baseUrl, protocol) => {
    const prow = ctx.db.provider.get(pid);
    if (prow) ctx.db.provider.update({ id: pid, base_url: baseUrl, protocol });
    const rows = catalogRows.get(pid) ?? /* @__PURE__ */ new Map();
    for (const entry of entries) rows.set(entry.id, entry);
    catalogRows.set(pid, rows);
    for (const entry of entries) {
      const existing = ctx.db.realModel.get(pid, entry.id);
      if (!existing) continue;
      ctx.db.realModel.update({
        provider: pid,
        model: entry.id,
        // 已登记行的名称不动(用户可能改过)。
        name: existing.name,
        // 声明字段同样不覆盖用户写过的值:刷新的职责是「补进目录」,
        // 不是把用户改过的上下文/输出/视觉覆盖回上游那一份。
        supports_vision: existing.supports_vision,
        max_input_tokens: existing.max_input_tokens,
        max_output_tokens: existing.max_output_tokens,
        // 思考强度**可以**被上游目录覆盖(它是**能力事实**不是用户声明):
        // 上游新支持的档位应当立刻生效。仍尊重「用户手改过」——见
        // setChannelModels 的 upsert:那里优先用目录值,用户想固定就改库。
        supported_reasoning_efforts: serializeReasoningEfforts(entry.reasoning_efforts),
        reasoning_allows_off: entry.reasoning_allows_off ?? null
      });
    }
    catalogFetchedAt.set(pid, Date.now());
    return entries.length;
  };
  function modelsSourceOf(pid, models) {
    if (!catalogFetchedAt.has(pid) || catalogRowsOf(pid).size === 0) return "router";
    const fromUpstream = models.filter((m) => m.origin !== "router").length;
    if (fromUpstream === 0) return "router";
    return fromUpstream === models.length ? "api" : "mixed";
  }
  const chCreditsOf = (snapshot, fetchedAtMs) => {
    return {
      left: snapshot.remaining,
      total: snapshot.limit,
      expires_at_ms: snapshot.expires_at !== null ? snapshot.expires_at * 1e3 : null,
      fetched_at_ms: fetchedAtMs,
      packages: snapshot.packs.map((p) => ({
        package_name: p.name,
        remain: p.remain ?? 0,
        size: p.limit ?? 0,
        monthly: p.extra?.monthly === true,
        expires_at_ms: p.expires_at !== null ? p.expires_at * 1e3 : null,
        refresh_at_ms: p.extra?.refresh_at !== void 0 && p.extra.refresh_at !== null ? Number(p.extra.refresh_at) * 1e3 : null
      })),
      expiring_soon: (() => {
        if (snapshot.packs.length === 0) return null;
        const soonS = wallNow() + 3 * 86400;
        return snapshot.packs.some((p) => p.expires_at !== null && p.expires_at > 0 && p.expires_at <= soonS && p.counts_for_expiry);
      })(),
      not_applicable: false,
      error: snapshot.error
    };
  };
  function safeExists(p) {
    try {
      return existsSync4(p);
    } catch {
      return false;
    }
  }
  async function probeClientPath(channel) {
    const pid = String(channel ?? "");
    const table = CLIENT_CANDIDATES[pid] ?? [];
    const expandRoot = (template) => {
      let missing = false;
      const out = template.replace(/%([^%]+)%/g, (_m, name2) => {
        const v = process.env[name2]?.trim();
        if (!v) {
          missing = true;
          return "";
        }
        return v;
      });
      return missing || out.trim() === "" ? null : out;
    };
    const checked = [];
    for (const root of CLIENT_INSTALL_ROOTS) {
      const expanded = expandRoot(root.dir);
      if (expanded === null) continue;
      checked.push(root.label);
      for (const rel of table) {
        const p = join5(expanded, rel);
        if (safeExists(p)) {
          return {
            detected_path: p,
            found: true,
            source: root.source,
            message: `\u68C0\u6D4B\u5230 ${p}(${root.label})`
          };
        }
      }
    }
    if (table.length === 0) {
      return {
        detected_path: null,
        found: false,
        source: "none",
        message: pid === "sensenova" ? "SenseNova \u65E0\u672C\u673A\u5BA2\u6237\u7AEF(\u5019\u9009\u8868\u4E3A\u7A7A)" : `${pid} \u6CA1\u6709\u767B\u8BB0 exe \u5019\u9009`
      };
    }
    return {
      detected_path: null,
      found: false,
      source: "none",
      message: `\u672A\u68C0\u6D4B\u5230 ${pid} \u5BA2\u6237\u7AEF(\u5DF2\u68C0\u67E5 ${checked.join(" / ") || "\u65E0\u53EF\u7528\u5B89\u88C5\u6839"};\u5019\u9009:${table.join(", ")})`
    };
  }
  async function getClientPathsImpl() {
    const channels = [];
    for (const { channel, description } of CLIENT_CHANNELS) {
      const savedRaw = ctx.db.setting.get(`client_path.${channel}`)?.v ?? null;
      let saved = savedRaw !== null && savedRaw !== "" ? savedRaw : null;
      let repaired = false;
      let note = null;
      const det = await probeClientPath(channel);
      const detected = det.found ? det.detected_path : null;
      const effective = saved ?? detected;
      channels.push({
        channel,
        description,
        saved_path: saved,
        detected_path: detected,
        effective_path: effective,
        exists: effective !== null && safeExists(effective),
        source: saved !== null ? "saved" : det.found ? "detected" : null,
        repaired,
        ...note !== null ? { note } : {}
      });
    }
    return {
      channels,
      // 配置已入库 —— 与 Nexus 一致,不再暴露 JSON 路径。
      config_file: ctx.dbPath
    };
  }
  return {
    chQuotaCooldownMs,
    chQuotaFetch,
    catalogCooldownStateOf,
    chMaybeFetchQuota,
    chAwaitQuota,
    catalogAccountOf,
    chCatalogCache,
    chCatalogGate,
    chCatalogInflight,
    chCatalogFetch,
    chAwaitCatalog,
    catalogFetchedAt,
    catalogRows,
    catalogRowsOf,
    probeProviderModels,
    serializeReasoningEfforts,
    mergeCatalog,
    modelsSourceOf,
    chCreditsOf,
    safeExists,
    probeClientPath,
    getClientPathsImpl
  };
}

// ../panel/src/channels.ts
var chQuotaCache = /* @__PURE__ */ new Map();
var chQuotaGate = /* @__PURE__ */ new Map();
var chQuotaInflight = /* @__PURE__ */ new Map();
function chQuotaTableForScheduler() {
  const out = {};
  const snapshots = [];
  for (const { snapshot } of chQuotaCache.values()) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const k = snapshot.credentialKey;
    if (typeof k !== "string" || k === "") continue;
    snapshots.push(snapshot);
    const row = {};
    if (typeof snapshot.remaining === "number") row.remaining = snapshot.remaining;
    if (typeof snapshot.limit === "number") row.limit = snapshot.limit;
    if (typeof snapshot.expires_at === "number" && snapshot.expires_at > 0) {
      row.expires_at = snapshot.expires_at;
    }
    if (typeof snapshot.fetched_at === "number") row.fetched_at = snapshot.fetched_at;
    if (snapshot.error !== null) row.error = snapshot.error;
    out[k] = row;
  }
  for (const [provider, rollup] of quotaRollupOf(snapshots)) {
    out[provider] = {
      remaining: rollup.remaining ?? void 0,
      limit: rollup.limit ?? void 0,
      expires_at: rollup.expires_at ?? void 0,
      fetched_at: rollup.fetched_at ?? void 0
    };
  }
  return out;
}
function quotaRollupOf(snapshots) {
  const out = /* @__PURE__ */ new Map();
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const key3 = snapshot.credentialKey;
    if (typeof key3 !== "string" || key3 === "") continue;
    const provider = key3.split("/")[0] ?? "";
    if (provider === "") continue;
    const cur = out.get(provider) ?? {
      expires_at: null,
      remaining: null,
      limit: null,
      fetched_at: null,
      accounts: 0
    };
    cur.accounts += 1;
    if (typeof snapshot.remaining === "number") {
      cur.remaining = (cur.remaining ?? 0) + snapshot.remaining;
    }
    if (typeof snapshot.limit === "number") {
      cur.limit = (cur.limit ?? 0) + snapshot.limit;
    }
    if (typeof snapshot.expires_at === "number" && snapshot.expires_at > 0) {
      cur.expires_at = cur.expires_at === null ? snapshot.expires_at : Math.min(cur.expires_at, snapshot.expires_at);
    }
    if (typeof snapshot.fetched_at === "number" && snapshot.fetched_at > 0) {
      cur.fetched_at = cur.fetched_at === null ? snapshot.fetched_at : Math.max(cur.fetched_at, snapshot.fetched_at);
    }
    out.set(provider, cur);
  }
  return out;
}
function createChannelsDomain(ctx, deps) {
  let lastTraeAdoptScanMs = 0;
  const chSync = createChannelsSyncDomain(ctx, { chQuotaCache, chQuotaGate, chQuotaInflight });
  const {
    chQuotaCooldownMs,
    chQuotaFetch,
    catalogCooldownStateOf,
    chMaybeFetchQuota,
    chAwaitQuota,
    catalogAccountOf,
    chCatalogCache,
    chCatalogGate,
    chCatalogInflight,
    chCatalogFetch,
    chAwaitCatalog,
    catalogFetchedAt,
    catalogRows,
    catalogRowsOf,
    probeProviderModels,
    serializeReasoningEfforts,
    mergeCatalog,
    modelsSourceOf,
    chCreditsOf,
    safeExists,
    probeClientPath,
    getClientPathsImpl
  } = chSync;
  let lastTraeAdoptMsg = "";
  const traeTokenBillingEligible = (token) => {
    try {
      const seg = token.split(".")[1];
      if (!seg) return false;
      const payload = JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
      return payload?.data?.source === "refresh_token";
    } catch {
      return false;
    }
  };
  const traeTokenWorks = async (token, extras) => {
    try {
      await probe_trae_quota({
        credentialKey: "trae-selfcheck",
        provider: "trae",
        username: "selfcheck",
        token,
        extras,
        region: "cn"
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/HTTP 401|code["\s:]*1001|authenticate you/i.test(msg)) return false;
      return true;
    }
  };
  const autoAdoptTrae = async (pid) => {
    if (pid !== "trae") return "";
    const nowMs = Date.now();
    if (nowMs - lastTraeAdoptScanMs < 3e4) return lastTraeAdoptMsg;
    lastTraeAdoptScanMs = nowMs;
    lastTraeAdoptMsg = "";
    let adopted = 0;
    let rejectedAuth = 0;
    try {
      const creds = await ctx.vault.list("trae").catch(() => []);
      if (creds.length === 0) return "";
      const found = discoverTraeAccounts();
      const ranked = [...found].sort(
        (a, b) => Number(traeTokenBillingEligible(b.token ?? "")) - Number(traeTokenBillingEligible(a.token ?? ""))
      );
      for (const acc of ranked) {
        if (!acc.token) continue;
        if (!traeTokenBillingEligible(acc.token)) {
          continue;
        }
        const uid = acc.user_id ?? acc.username ?? "";
        const match = creds.find((c) => {
          const rawUid = strOf(c.raw, "uid") ?? strOf(c.raw, "user_id");
          return uid !== "" && (rawUid === uid || c.username === uid) || c.username === acc.username;
        });
        if (!match) continue;
        const secret = await ctx.vault.secret("trae", match.username);
        if (secret === acc.token) continue;
        const selfExtras = { ...match.raw ?? {} };
        if (acc.extra && typeof acc.extra === "object") {
          for (const [k, v] of Object.entries(acc.extra)) {
            if (v !== null && v !== void 0) selfExtras[k] = v;
          }
        }
        const selfOk = await traeTokenWorks(acc.token, selfExtras);
        if (!selfOk) {
          rejectedAuth += 1;
          continue;
        }
        const raw = {
          ...match.raw ?? {},
          source: "discover",
          adopted_at_ms: wallNow() * 1e3,
          last_refresh: null
        };
        if (acc.region) raw.region = acc.region;
        if (acc.edition) raw.edition = acc.edition;
        if (acc.host) raw.host = acc.host;
        if (acc.user_id) {
          raw.user_id = acc.user_id;
          raw.uid = acc.user_id;
        }
        if (acc.token_expires_at_ms) raw.token_expires_at_ms = acc.token_expires_at_ms;
        if (acc.extra && typeof acc.extra === "object") {
          for (const [k, v] of Object.entries(acc.extra)) {
            if (v !== null && v !== void 0) raw[k] = v;
          }
        }
        const refreshToken = acc.extra && typeof acc.extra === "object" && typeof acc.extra.refresh_token === "string" ? acc.extra.refresh_token : void 0;
        await ctx.vault.put({
          provider: "trae",
          username: match.username,
          secret: acc.token,
          ...refreshToken !== void 0 ? { refreshSecret: refreshToken } : {},
          raw
        });
        adopted += 1;
      }
      const cliOnly = found.some((a) => a.token && !traeTokenBillingEligible(a.token)) && !found.some((a) => a.token && traeTokenBillingEligible(a.token));
      if (adopted === 0 && cliOnly) {
        lastTraeAdoptMsg = "trae \u8BA1\u8D39/\u7B7E\u5230\u63A5\u53E3\u53EA\u8BA4\u684C\u9762\u7248 Trae \u767B\u5F55\u6001;\u672C\u673A\u5F53\u524D\u53EA\u6709 CLI token(\u65E0\u6CD5\u7528\u4E8E\u989D\u5EA6\u4E0E\u7B7E\u5230,\u804A\u5929\u4ECD\u53EF\u7528)\u2014\u2014 \u8BF7\u5728 Trae \u684C\u9762\u5BA2\u6237\u7AEF\u767B\u5F55";
      }
      if (adopted === 0 && rejectedAuth > 0) {
        lastTraeAdoptMsg = "\u672C\u673A Trae \u684C\u9762\u7248\u767B\u5F55\u6001\u5DF2\u88AB\u4E0A\u6E38\u62D2\u7EDD(\u8BA1\u8D39/\u7B7E\u5230\u63A5\u53E3\u8FD4\u56DE\u8BA4\u8BC1\u5931\u8D25)\u2014\u2014 \u8BF7\u5728 Trae \u684C\u9762\u5BA2\u6237\u7AEF\u91CD\u65B0\u767B\u5F55,\u767B\u5F55\u540E\u672C\u9875\u4F1A\u81EA\u52A8\u91C7\u7528\u65B0\u4EE4\u724C";
      }
    } catch {
    }
    if (adopted === 0) {
      return lastTraeAdoptMsg;
    }
    ctx.syncRegistry();
    lastTraeAdoptMsg = `\u5DF2\u81EA\u52A8\u91C7\u7528\u672C\u673A\u6700\u65B0\u767B\u5F55\u6001(trae,${adopted} \u4E2A\u8D26\u53F7)`;
    return lastTraeAdoptMsg;
  };
  const accountsWithKeySync = (pid) => {
    const out = [];
    for (const account of ctx.registry.listAccounts(pid)) {
      const [p, u] = splitRef(account.credentialRef);
      out.push({
        credentialRef: account.credentialRef,
        username: u,
        hasKey: ctx.secretPresence.get(`${p}/${u}`) ?? false,
        keyFp: null
      });
    }
    return out;
  };
  const accountsWithKey = async (pid) => {
    const out = [];
    for (const account of ctx.registry.listAccounts(pid)) {
      const [p, u] = splitRef(account.credentialRef);
      const summary = await ctx.vault.describe(p, u);
      const secret = summary ? await ctx.vault.secret(p, u) : null;
      out.push({
        credentialRef: account.credentialRef,
        username: u,
        hasKey: summary !== null,
        keyFp: fpOf(secret)
      });
    }
    return out;
  };
  const channelAccountsOf = async (pid) => {
    const creds = await ctx.vault.list(pid);
    const out = [];
    for (let i = 0; i < creds.length; i++) {
      const s = creds[i];
      const secret = await ctx.vault.secret(pid, s.username);
      const region = typeof s.raw?.region === "string" ? s.raw.region : null;
      out.push({
        index: i,
        // 左侧只写用户名(用户 2026-10-30 定案),完整键另存 —— 见 ChannelAccount 注释。
        label: s.username,
        credential_key: s.key,
        key_fp: fpOf(secret),
        region,
        source: "credential \u8868",
        token_expires_at_ms: s.expiresAt !== null ? Math.round(s.expiresAt * 1e3) : null,
        refresh_expires_at_ms: null,
        last_refresh: null
      });
    }
    return out;
  };
  const checkinBaseOf = (pdef) => {
    if (!pdef) return null;
    const base = pdef.baseUrl?.trim().replace(/\/+$/, "");
    return base && base.length > 0 ? base : null;
  };
  const rawStrOf = (raw, key3) => {
    const v = raw[key3];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  };
  const checkinAccountsOf = async (pid) => {
    const creds = await ctx.vault.list(pid);
    const out = [];
    for (let i = 0; i < creds.length; i++) {
      const s = creds[i];
      const raw = s.raw ?? {};
      out.push({
        index: i,
        username: s.username,
        token: await ctx.vault.secret(pid, s.username),
        region: rawStrOf(raw, "region"),
        domain: rawStrOf(raw, "domain"),
        uid: rawStrOf(raw, "uid") ?? rawStrOf(raw, "user_id"),
        enterprise_id: rawStrOf(raw, "enterprise_id"),
        extra: raw
      });
    }
    return out;
  };
  const checkinErrText = (err) => {
    if (err instanceof Error) {
      return `${err.constructor.name}: ${err.message}`.slice(0, 300);
    }
    return String(err).slice(0, 300);
  };
  const checkinClaimOne = async (pid, protocol, acc, base, confirm) => {
    const baseRow = { index: acc.index, provider: pid, username: acc.username, region: acc.region };
    if (protocol === "trae") {
      if (!acc.token) {
        return { ...baseRow, status: "failed", message: "\u8BE5\u8D26\u53F7\u6CA1\u6709\u53EF\u7528\u4EE4\u724C" };
      }
      try {
        const res = await traeCheckinClaim(
          {
            index: acc.index,
            username: acc.username,
            token: acc.token,
            region: acc.region,
            device_id: rawStrOf(acc.extra, "device_id"),
            extra: acc.extra
          },
          { baseUrl: base ?? void 0, confirm }
        );
        const status = res.claimed ? "claimed" : res.already_checked_in || res.device_checked_in ? "already" : !res.enabled ? "skipped" : res.would_claim ? "dry_run" : "failed";
        const message = res.claimed ? `\u9886\u53D6\u6210\u529F${res.checkin.credits > 0 ? `,\u5F53\u524D\u79EF\u5206 ${res.checkin.credits}` : ""}${res.retries > 0 ? `(\u4E0A\u6E38\u62E5\u6324,\u91CD\u8BD5 ${res.retries} \u6B21\u540E\u6210\u529F)` : ""}` : res.message;
        return {
          ...baseRow,
          status,
          message,
          would_claim: res.would_claim || void 0,
          credit: res.checkin.credits || void 0
        };
      } catch (err) {
        return { ...baseRow, status: "failed", message: checkinErrText(err) };
      }
    }
    if (wbRegionOf2(acc.domain) !== "cn") {
      return { ...baseRow, status: "skipped", message: "\u56FD\u9645\u7248\u65E0\u7B7E\u5230(\u8BA2\u9605\u5236,\u989D\u5EA6\u8D70 payStatus)" };
    }
    if (!acc.token) {
      return { ...baseRow, status: "failed", message: "\u8BE5\u8D26\u53F7\u6CA1\u6709\u53EF\u7528\u4EE4\u724C" };
    }
    try {
      const st = await wbCheckinStatus(
        { index: acc.index, username: acc.username, token: acc.token, domain: acc.domain, uid: acc.uid, enterprise_id: acc.enterprise_id },
        { baseUrl: base ?? void 0 }
      );
      if (!st.active) {
        return { ...baseRow, status: "skipped", message: "\u8BE5\u8D26\u53F7\u672A\u542F\u7528\u7B7E\u5230\u6D3B\u52A8", streak_days: st.streak_days };
      }
      if (st.today_checked_in) {
        return {
          ...baseRow,
          status: "already",
          message: `\u4ECA\u65E5\u5DF2\u7B7E\u5230${st.streak_days > 0 ? ` \xB7 \u8FDE\u7EED ${st.streak_days} \u5929` : ""}`,
          streak_days: st.streak_days
        };
      }
      if (!confirm) {
        return {
          ...baseRow,
          status: "dry_run",
          message: "\u53EF\u9886\u53D6(\u672A\u786E\u8BA4,\u672A\u53D1\u51FA\u9886\u53D6\u8BF7\u6C42)",
          would_claim: true,
          daily_credit: st.daily_credit
        };
      }
      const res = await wbCheckinClaim(
        { index: acc.index, username: acc.username, token: acc.token, domain: acc.domain, uid: acc.uid, enterprise_id: acc.enterprise_id },
        { baseUrl: base }
      );
      const message = `\u9886\u53D6\u6210\u529F${res.credit > 0 ? `,\u83B7\u5F97 ${res.credit} \u79EF\u5206` : ""}${res.streak_days > 0 ? ` \xB7 \u8FDE\u7EED ${res.streak_days} \u5929` : ""}`;
      return { ...baseRow, status: "claimed", message, credit: res.credit, streak_days: res.streak_days };
    } catch (err) {
      return { ...baseRow, status: "failed", message: checkinErrText(err) };
    }
  };
  const catalogModel = (mv, accountsCount, usableCount, exposed) => ({
    id: `${mv.provider}/${mv.model}`,
    name: mv.name ?? mv.model,
    exposed,
    listed: !mv.hidden,
    hidden: mv.hidden,
    available: true,
    vision: mv.supportsVision,
    context_window: mv.maxInputTokens,
    max_output: mv.maxOutputTokens,
    rate: null,
    registered: mv.registered,
    callable: mv.registered && usableCount > 0,
    origin: null,
    endpoints: accountsCount,
    usable_endpoints: usableCount,
    default_vision: null,
    default_context: null,
    default_output: null,
    supported_reasoning_efforts: mv.supportedReasoningEfforts,
    reasoning_allows_off: mv.reasoningAllowsOff
  });
  const mergedChannelModels = (pid) => {
    const withKey = accountsWithKeySync(pid);
    const accountsCount = withKey.length;
    const usableCount = withKey.filter((a) => a.hasKey).length;
    const registryMap = deps.realModelMap(pid);
    const upstream = catalogRowsOf(pid);
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const [model, up] of [...upstream.entries()].sort(
      ([a], [b]) => a < b ? -1 : a > b ? 1 : 0
    )) {
      seen.add(model);
      const mv = registryMap.get(`${pid}/${model}`);
      out.push({
        id: `${pid}/${model}`,
        name: mv?.name && mv.name.length > 0 ? mv.name : up.name && up.name.length > 0 ? up.name : model,
        exposed: mv !== void 0,
        // 勾选 ⇔ 表里有这一行
        hidden: mv ? mv.hidden : null,
        listed: mv !== void 0,
        available: mv !== void 0 || up.vision !== void 0,
        vision: mv ? mv.supportsVision : up.vision,
        context_window: mv ? mv.maxInputTokens : null,
        // 库里空 + 上游有值 → 用上游值顶上(见上面第二条口径)
        max_output: (mv?.maxOutputTokens ?? null) || up.max_output || null,
        // 倍率来自上游目录解析(workbuddy credits / trae consumption_rate);
        // 目录没给(或解析失败)才是 null,不硬编码丢弃。
        rate: up.rate ?? null,
        registered: mv !== void 0,
        callable: true,
        origin: up.origin ?? "remote",
        endpoints: mv ? accountsCount : 0,
        usable_endpoints: mv ? usableCount : 0,
        default_vision: up.vision,
        default_context: up.context_window,
        default_output: up.max_output,
        // 能力事实取**库里已登记行的值**(上游目录这一轮没给时目录项本身就是 null,
        // 不会把库里的学习结果冲掉)。
        supported_reasoning_efforts: mv ? mv.supportedReasoningEfforts : up.reasoning_efforts ?? null,
        reasoning_allows_off: mv ? mv.reasoningAllowsOff : up.reasoning_allows_off ?? null
      });
    }
    for (const mv of [...registryMap.values()].sort(
      (a, b) => a.model < b.model ? -1 : a.model > b.model ? 1 : 0
    )) {
      if (seen.has(mv.model)) continue;
      seen.add(mv.model);
      out.push({
        id: `${pid}/${mv.model}`,
        name: mv.name ?? mv.model,
        exposed: true,
        // 在表里 ⇒ 一律勾着
        hidden: mv.hidden,
        listed: true,
        available: true,
        vision: mv.supportsVision,
        context_window: mv.maxInputTokens,
        max_output: mv.maxOutputTokens,
        rate: null,
        registered: true,
        callable: true,
        origin: "router",
        endpoints: accountsCount,
        usable_endpoints: usableCount,
        default_vision: null,
        default_context: null,
        default_output: null,
        supported_reasoning_efforts: mv.supportedReasoningEfforts,
        reasoning_allows_off: mv.reasoningAllowsOff
      });
    }
    return out;
  };
  const refreshLedger = /* @__PURE__ */ new Map();
  const refreshInFlight = /* @__PURE__ */ new Map();
  const refreshAccountsOf = async (pid) => {
    const creds = await ctx.vault.list(pid);
    const out = [];
    for (let i = 0; i < creds.length; i++) {
      const full = await ctx.vault.get(pid, creds[i].username);
      if (full) out.push({ index: i, cred: full });
    }
    return out;
  };
  const refreshRowBase = (index, cred) => ({
    index,
    account: credentialKey(cred.provider, cred.username),
    username: cred.username,
    uid: strOf(cred.raw, "uid"),
    region: strOf(cred.raw, "region"),
    has_refresh_token: cred.refreshSecret !== null && cred.refreshSecret !== void 0,
    token_expires_at_ms: (() => {
      const sec = expiresAtOf(cred);
      return sec !== null ? Math.round(sec * 1e3) : null;
    })(),
    needs_refresh: cred.refreshSecret ? needsRefresh(cred, { marginSeconds: REFRESH_MARGIN_S }) : false
  });
  const refreshOne = async (pid, index, cred, confirm) => {
    const base = refreshRowBase(index, cred);
    if (!cred.secret) {
      return { ...base, status: "failed", message: "\u8BE5\u8D26\u53F7\u6CA1\u6709\u53EF\u7528\u4EE4\u724C" };
    }
    if (!cred.refreshSecret) {
      return { ...base, status: "skipped", message: "\u65E0 refresh token,\u8BF7\u5728\u5BA2\u6237\u7AEF\u91CD\u65B0\u767B\u5F55\u540E\u91CD\u65B0\u53D1\u73B0" };
    }
    if (!confirm) {
      return {
        ...base,
        status: "dry_run",
        needs_refresh: needsRefresh(cred, { marginSeconds: REFRESH_MARGIN_S }),
        old_token_fp: fingerprint(cred.secret),
        message: "\u53EF\u5237\u65B0(\u672A\u786E\u8BA4,\u672A\u53D1\u51FA\u4E0A\u6E38\u8BF7\u6C42)"
      };
    }
    const oldFp = fingerprint(cred.secret);
    let outcome;
    try {
      outcome = pid === "trae" ? await refreshTraeToken(cred) : await refreshWorkbuddyToken(cred);
    } catch (err) {
      const msg = err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err);
      return { ...base, status: "failed", old_token_fp: oldFp, message: msg.slice(0, 300) };
    }
    let saved = true;
    let saveError = "";
    try {
      const expiresSec = typeof outcome.expiresAtMs === "number" && Number.isFinite(outcome.expiresAtMs) ? outcome.expiresAtMs / 1e3 : void 0;
      await ctx.vault.rotate(pid, cred.username, {
        secret: outcome.accessToken,
        refreshSecret: outcome.refreshToken,
        expiresAt: expiresSec
      });
      if (outcome.extra && Object.keys(outcome.extra).length > 0) {
        const updated = await ctx.vault.get(pid, cred.username);
        if (updated) {
          await ctx.vault.put({ provider: pid, username: cred.username, raw: { ...updated.raw, ...outcome.extra } });
        }
      }
    } catch (err) {
      saved = false;
      saveError = err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err);
    }
    const status = saved ? "refreshed" : "refreshed_unsaved";
    const messages = saved ? ["\u5DF2\u5199\u5165\u6570\u636E\u5E93"] : [`\u843D\u76D8\u51ED\u636E\u5931\u8D25: ${saveError}`, "\u5DF2\u5199\u5165\u6570\u636E\u5E93"];
    return {
      ...base,
      status,
      old_token_fp: oldFp,
      new_token_fp: fingerprint(outcome.accessToken),
      token_expires_at_ms: typeof outcome.expiresAtMs === "number" && Number.isFinite(outcome.expiresAtMs) ? Math.round(outcome.expiresAtMs) : null,
      message: messages.join("; ")
    };
  };
  const doRefreshRun = async (pid, confirm, onlyIndex) => {
    const startedAt = Date.now();
    const prevEntry = refreshLedger.get(pid);
    refreshLedger.set(pid, {
      ...prevEntry ?? {
        startedAtMs: null,
        lastRunAtMs: null,
        lastElapsedS: null,
        lastOk: null,
        lastError: null,
        result: null,
        lastRunAccounts: []
      },
      startedAtMs: startedAt
    });
    const accounts = await refreshAccountsOf(pid);
    const targets = onlyIndex === void 0 ? accounts : accounts.filter((a) => a.index === onlyIndex);
    const rows = [];
    for (const t of targets) {
      rows.push(await refreshOne(pid, t.index, t.cred, confirm));
    }
    const elapsedS = Math.round((Date.now() - startedAt) / 100) / 10;
    const refreshed = rows.filter((r) => r.status === "refreshed" || r.status === "refreshed_unsaved").length;
    const ok2 = refreshed > 0 || !confirm && rows.length > 0;
    const message = confirm ? rows.length > 0 ? "\u5DF2\u5237\u65B0" : `\u6CA1\u6709\u5339\u914D\u7684\u8D26\u53F7(index=${onlyIndex})` : "\u5E72\u8DD1\u7ED3\u679C(\u672A\u53D1\u51FA\u4E0A\u6E38\u8BF7\u6C42)";
    refreshLedger.set(pid, {
      startedAtMs: startedAt,
      lastRunAtMs: startedAt,
      lastElapsedS: elapsedS,
      lastOk: ok2,
      lastError: !ok2 && rows.length > 0 ? rows.find((r) => r.status === "failed")?.message ?? null : null,
      result: `${ok2 ? "\u6210\u529F" : "\u5931\u8D25"}:${message}(${refreshed}/${rows.length} \u4E2A\u8D26\u53F7)`,
      lastRunAccounts: rows
    });
    return {
      ok: ok2,
      provider: pid,
      confirm,
      count: rows.length,
      refreshed,
      message,
      accounts: rows
    };
  };
  return {
    accountsWithKeySync,
    accountsWithKey,
    mergedChannelModels,
    chCatalogCache,
    chCatalogGate,
    chAwaitCatalog,
    mergeCatalog,
    methods: createChannelsMethods(ctx, {
      realModelMap: deps.realModelMap,
      modelViewOf: deps.modelViewOf,
      stripMemberFromLogicalModels: deps.stripMemberFromLogicalModels,
      // 27 个渠道域闭包(与 assembly-channels-methods.ts 的 ChannelsMethodsDeps 对齐)
      chQuotaCache,
      accountsWithKey,
      autoAdoptTrae,
      catalogCooldownStateOf,
      catalogFetchedAt,
      catalogRows,
      chAwaitCatalog,
      chAwaitQuota,
      chCreditsOf,
      chMaybeFetchQuota,
      channelAccountsOf,
      checkinAccountsOf,
      checkinBaseOf,
      checkinClaimOne,
      doRefreshRun,
      getClientPathsImpl,
      mergeCatalog,
      mergedChannelModels,
      modelsSourceOf,
      probeClientPath,
      probeProviderModels,
      rawStrOf,
      refreshAccountsOf,
      refreshInFlight,
      refreshLedger,
      refreshRowBase,
      safeExists,
      serializeReasoningEfforts
    })
  };
}

// ../panel/src/models.ts
function createModelsDomain(ctx, deps) {
  const logicalGroupsContaining = (provider, model) => {
    const out = [];
    const contains = (members) => members.some((m) => m.provider === provider && m.model === model);
    for (const row of ctx.db.logicalModel.list()) {
      if (contains(parseDbMembers(row.members))) out.push(row.name);
    }
    return [...new Set(out)];
  };
  const exposureOverlay = /* @__PURE__ */ new Map();
  const modelDayStats = (provider, model) => {
    const zero = {
      requests: 0,
      errors: 0,
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      rate: null,
      avg_ttft: null,
      avg_tps: null,
      latency_day: null
    };
    const days = [...new Set(ctx.db.statsDaily.range("0000-01-01", "9999-12-31").filter((r) => r.provider === provider && r.model === model).map((r) => r.day))].sort().reverse();
    let rows = [];
    let pickedDay = null;
    for (const day of days) {
      const same = ctx.db.statsDaily.range(day, day).filter((r) => r.provider === provider && r.model === model);
      const ok2 = same.some(
        (r) => r.latency_sum_ms > 0 && r.ttft_sum_ms > 0 && r.ttft_requests > 0
      );
      if (ok2) {
        rows = same;
        pickedDay = day;
        break;
      }
    }
    if (pickedDay === null || rows.length === 0) return zero;
    let requests = 0, errors = 0, prompt = 0, completion = 0, cached = 0;
    let latencySum = 0, ttftSum = 0, ttftReq = 0;
    for (const r of rows) {
      requests += r.requests;
      errors += r.fails;
      prompt += r.prompt_tokens;
      completion += r.completion_tokens;
      cached += r.cached_tokens;
      latencySum += r.latency_sum_ms;
      ttftSum += r.ttft_sum_ms;
      ttftReq += r.ttft_requests;
    }
    const genMs = latencySum - ttftSum;
    return {
      requests,
      errors,
      // ⚠️ total = prompt + completion(cached 是 prompt 子集,不双计)
      total: prompt + completion,
      prompt,
      completion,
      cached,
      rate: prompt > 0 ? Math.round(cached / prompt * 1e4) / 1e4 : null,
      avg_ttft: ttftReq > 0 ? round12(ttftSum / ttftReq) : null,
      avg_tps: completion > 0 && genMs > 0 ? round12(completion / (genMs / 1e3)) : null,
      latency_day: pickedDay
    };
  };
  const methods = {
    async getLogicalModels() {
      const rows = ctx.db.logicalModel.list();
      const names = rows.map((r) => r.name);
      const out = [];
      for (const name2 of [...names].sort()) {
        const row = ctx.db.logicalModel.get(name2);
        const strategy = normalizeStrategy(row?.strategy).strategy;
        const members = parseDbMembers(row?.members ?? null);
        const memberEfforts = members.map(
          (m) => deps.realModelMap(m.provider).get(`${m.provider}/${m.model}`)?.supportedReasoningEfforts ?? null
        );
        const reasoningEfforts = (() => {
          if (memberEfforts.length === 0) return null;
          const known = memberEfforts.filter((e) => e !== null);
          if (known.some((e) => e.length === 0)) return [];
          if (known.length === 0) return null;
          let acc = [...known[0]];
          for (const e of known.slice(1)) {
            const set = new Set(e.map((s) => s.toLowerCase()));
            acc = acc.filter((s) => set.has(s.toLowerCase()));
          }
          return acc;
        })();
        const deployments = [];
        members.forEach((member, order) => {
          const mv = deps.modelViewOf(member.provider, member.model);
          const accounts = deps.accountsWithKeySync(member.provider).map((a) => {
            const depId = endpointIdOf(member.provider, member.model, a.username);
            const rec = ctx.health.get(depId);
            const inCd = rec.cooldownUntil > 0 && rec.cooldownUntil > wallNow();
            return {
              account_id: a.credentialRef,
              username: a.username,
              account_fp: a.keyFp,
              in_cooldown: inCd,
              cooldown_remaining_s: inCd ? Math.max(0, Math.round((rec.cooldownUntil - wallNow()) * 10) / 10) : 0,
              quota_remaining: null
              // 逻辑模型页不查额度(Nexus 同位置给 null)
            };
          });
          const first = accounts[0];
          const hidden = mv?.hidden ?? false;
          deployments.push({
            provider: member.provider,
            model: member.model,
            real_model: member.model,
            real_model_id: `${member.provider}/${member.model}`,
            account_key: first?.username ?? null,
            account_fp: first?.account_fp ?? null,
            order,
            hidden,
            listed: !hidden,
            exposed: !hidden,
            exposed_note: hidden ? "hidden(\u4EC5\u4E0D\u5217\u5165 /v1/models,\u4ECD\u53EF\u8C03\u7528)" : null,
            // ⚠️ 这里给**真实值**(Nexus 该字段恒 false 是占位):逻辑模型页的
            // 「全视觉 / 有视觉」徽章全靠它,恒 false 会让徽章永远不出现。
            supports_vision: mv?.supportsVision ?? null,
            supported_reasoning_efforts: mv?.supportedReasoningEfforts ?? null,
            reasoning_allows_off: mv?.reasoningAllowsOff ?? null,
            endpoint_count: accounts.length,
            accounts,
            blackout: null,
            blackout_managed_by: "scheduler"
          });
        });
        out.push({
          model: name2,
          // 显示名(用户 m44638):空串归一成 null,让 UI 与 /v1/models 回退到 model。
          display_name: (row?.display_name ?? "").trim() || null,
          deployments,
          count: deployments.length,
          routing_strategy: strategy,
          strategy_label: STRATEGY_LABELS[strategy] ?? strategy,
          order_respected: ORDER_STRATEGIES.has(strategy),
          members: members.map((m) => `${m.provider}/${m.model}`),
          // D14:`hidden` 列已删 → 「保留抽象模型」没有数据来源,恒 false。
          reserved: false,
          // v3 残留字段,恒 `[]`(Nexus 同口径;以前错填成了成员清单,
          // 两个字段语义不同,页面若按 fallback 渲染会重复显示一遍成员)。
          fallback_chain: [],
          entry_alias: null,
          hidden: false,
          reasoning_efforts: reasoningEfforts,
          strategy_groups: [{
            group_name: name2,
            model_name: name2,
            routing_strategy: strategy,
            real_models: deployments.map((d) => ({
              real_model: d.real_model_id,
              account_count: d.endpoint_count,
              orders: [d.order],
              supports_vision: d.supports_vision
            }))
          }]
        });
      }
      return out;
    },
    /**
    
         * 写逻辑模型 —— 对齐 Nexus `_logical_write`。
    
         *
    
         * ⚠️ **逐档校验「已登记」**:Nexus `_require_real_model` 对每个成员查
    
         * `real_model`,未登记直接 400。不校验的话可以写进一条指向空气的档位 ——
    
         * 调度时 `endpointChain` 展开出 0 个端点,整条链静默少一档,而页面上
    
         * 看起来「配好了」。
    
         *
    
         * ⚠️ **允许空成员**(`members: []`):Nexus 明确允许先建壳再逐档添加。
    
         * 以前这里直接拒「至少需要一个成员」,于是「新建 → 保存 → 再加档」这条
    
         * 正常使用路径走不通。
    
         */
    async writeLogicalModel(input) {
      const name2 = String(input?.model_name ?? "").trim();
      if (!name2) return { ok: false, message: "\u903B\u8F91\u6A21\u578B\u540D\u4E0D\u80FD\u4E3A\u7A7A" };
      const members = membersFromInput(input ?? {});
      const dangling = [];
      for (const m of members) {
        if (!deps.modelViewOf(m.provider, m.model)) dangling.push(`${m.provider}/${m.model}`);
      }
      if (dangling.length > 0) {
        return {
          ok: false,
          message: `\u4EE5\u4E0B\u6863\u4F4D\u6CA1\u6709\u767B\u8BB0(\u5148\u5728\u5BF9\u5E94\u6E20\u9053\u9875\u52FE\u9009\u767B\u8BB0,\u518D\u56DE\u6765\u52A0\u6863):${dangling.join("\u3001")}`
        };
      }
      const existing = ctx.db.logicalModel.get(name2);
      const strategyRaw = input?.routing_strategy ?? existing?.strategy ?? "random";
      const { strategy } = normalizeStrategy(strategyRaw);
      const membersJson = JSON.stringify(members);
      const dnGiven = input && Object.prototype.hasOwnProperty.call(input, "display_name");
      const dn = dnGiven ? String(input.display_name ?? "").trim() || null : void 0;
      if (existing) {
        ctx.db.logicalModel.update({ name: name2, strategy, members: membersJson, display_name: dn });
      } else {
        ctx.db.logicalModel.insert({
          name: name2,
          strategy,
          members: membersJson,
          ...dn ? { display_name: dn } : {}
        });
      }
      try {
        ctx.scheduler.invalidate();
      } catch {
      }
      ctx.syncRegistry();
      return {
        ok: true,
        message: members.length > 0 ? `\u5DF2\u4FDD\u5B58 ${name2}(${members.length} \u6863,\u987A\u5E8F\u5373\u4F18\u5148\u7EA7)` : `\u5DF2\u4FDD\u5B58 ${name2}(\u8FD8\u6CA1\u6709\u6863\u4F4D \u2014\u2014 \u4FDD\u5B58\u540E\u53EF\u4EE5\u7EE7\u7EED\u52A0\u6863)`,
        changed: [name2]
      };
    },
    async removeLogicalModel(name2) {
      const modelName = String(name2 ?? "").trim();
      if (!ctx.db.logicalModel.get(modelName)) {
        return { ok: false, message: `\u903B\u8F91\u6A21\u578B ${modelName} \u4E0D\u5B58\u5728` };
      }
      ctx.db.logicalModel.delete(modelName);
      ctx.scheduler.invalidate();
      ctx.syncRegistry();
      return { ok: true, message: `\u5DF2\u5220\u9664\u903B\u8F91\u6A21\u578B ${modelName}`, changed: [modelName] };
    },
    async getDeployments() {
      const nowS = wallNow();
      const lastDay = deps.lastStatsDay();
      const out = [];
      const models = [...deps.realModelMap().values()].sort(
        (a, b) => a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : a.model < b.model ? -1 : a.model > b.model ? 1 : 0
      );
      for (const mv of models) {
        const modelId = `${mv.provider}/${mv.model}`;
        const logicals = logicalGroupsContaining(mv.provider, mv.model);
        const withKey = await deps.accountsWithKey(mv.provider);
        const usableCount = withKey.filter((a) => a.hasKey).length;
        const stats = modelDayStats(mv.provider, mv.model);
        const endpointCount = ctx.registry.listAccounts(mv.provider).length;
        let inCd = false;
        let remaining = null;
        for (const account of ctx.registry.listAccounts(mv.provider)) {
          const depId = endpointIdOf(mv.provider, mv.model, splitRef(account.credentialRef)[1]);
          const rec = ctx.health.get(depId);
          if (rec.cooldownUntil > 0 && rec.cooldownUntil > nowS) {
            inCd = true;
            const left = Math.max(0, Math.round((rec.cooldownUntil - nowS) * 10) / 10);
            if (remaining === null || left > remaining) remaining = left;
          }
        }
        const listed = !mv.hidden;
        const live = endpointCount > 0 && !inCd;
        out.push({
          deployment_id: modelId,
          real_model_id: modelId,
          provider: mv.provider,
          // Nexus 同款:只给一个展示标签(provider 名),账号明细在
          // endpoint_count / usable_endpoint_count 里,不在行上摊开。
          account: mv.provider,
          model: mv.model,
          listed,
          hidden: mv.hidden,
          direct_exposed: listed,
          group_exposed: logicals.length > 0,
          exposed: listed || logicals.length > 0,
          direct_live: live,
          group_live: logicals.length > 0 && live,
          live,
          endpoint_count: endpointCount,
          usable_endpoint_count: usableCount,
          logical_models: logicals,
          supports_vision: mv.supportsVision,
          supported_reasoning_efforts: mv.supportedReasoningEfforts,
          reasoning_allows_off: mv.reasoningAllowsOff,
          in_cooldown: inCd,
          cooldown_remaining_s: remaining,
          requests: stats.requests,
          errors: stats.errors,
          total_tokens: stats.total,
          prompt_tokens: stats.prompt,
          completion_tokens: stats.completion,
          cached_tokens: stats.cached,
          cache_hit_rate: stats.rate,
          avg_ttft_ms: stats.avg_ttft,
          avg_tps: stats.avg_tps,
          latency_day: stats.latency_day,
          concurrency: mv.concurrency
        });
      }
      out.sort((a, b) => a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : a.model < b.model ? -1 : a.model > b.model ? 1 : a.account < b.account ? -1 : 1);
      return {
        deployments: out,
        count: out.length,
        note: "\u4E00\u884C = \u4E00\u4E2A\u771F\u5B9E\u6A21\u578B(\u7AEF\u70B9 = \u771F\u5B9E\u6A21\u578B \xD7 \u8BE5\u4F9B\u5E94\u5546\u540D\u4E0B\u7684\u51ED\u636E\u884C,\u81EA\u52A8\u63A8\u5BFC);\u52FE\u9009\u53EA\u51B3\u5B9A\u662F\u5426\u5217\u5165 /v1/models,\u53D6\u6D88\u540E\u4ECD\u53EF\u88AB\u8C03\u7528"
      };
    },
    async setDeploymentExposure(deploymentId, kind, exposed, concurrency) {
      const changed = [];
      const modelId = String(deploymentId ?? "").split("@")[0] ?? "";
      const slash = modelId.indexOf("/");
      if (slash > 0) {
        const provider = modelId.slice(0, slash);
        const model = modelId.slice(slash + 1);
        if (ctx.db.realModel.get(provider, model) !== void 0) {
          ctx.db.realModel.update({ provider, model, hidden: exposed ? 0 : 1 });
          changed.push(`${modelId}::hidden=${exposed ? 0 : 1}`);
        }
      }
      const key3 = `${String(deploymentId ?? "")}::${String(kind ?? "all")}`;
      if (changed.length === 0) {
        exposureOverlay.set(key3, Boolean(exposed));
        changed.push(key3);
      }
      if (concurrency != null && Number.isFinite(concurrency)) {
        const capped = Math.min(1 << 20, Math.max(1, Math.trunc(concurrency)));
        const slash2 = modelId.indexOf("/");
        if (slash2 > 0) {
          const provider = modelId.slice(0, slash2);
          const model = modelId.slice(slash2 + 1);
          if (ctx.db.realModel.get(provider, model) !== void 0) {
            ctx.db.realModel.update({ provider, model, concurrency: capped });
            changed.push(`${modelId}::concurrency=${capped}`);
          }
        }
      }
      ctx.syncRegistry();
      return {
        ok: true,
        message: changed.length > 0 ? `\u5DF2\u4FDD\u5B58(${changed.join("; ")})` : "\u5DF2\u8BB0\u5F55",
        changed
      };
    },
    async getModelProviders() {
      const provIds = /* @__PURE__ */ new Set();
      for (const p of ctx.registry.listProviders()) {
        if (p.protocol === "openai") provIds.add(p.id);
      }
      for (const row of ctx.db.provider.list()) {
        if (row.protocol === "openai") provIds.add(row.id);
      }
      const out = [];
      for (const id of [...provIds].sort()) {
        const pdef = ctx.registry.getProvider(id);
        const drow = ctx.db.provider.get(id);
        const withKey = await deps.accountsWithKey(id);
        const accountsCount = withKey.length;
        const usableCount = withKey.filter((a) => a.hasKey).length;
        const rmap = realModelMapOf(ctx.registry, ctx.db, id);
        const models = [...rmap.values()].sort((a, b) => a.model < b.model ? -1 : a.model > b.model ? 1 : 0).map((mv) => ({
          id: `${id}/${mv.model}`,
          name: mv.name ?? mv.model,
          exposed: true,
          // 在表里 ⇒ 一律勾着
          hidden: mv.hidden,
          listed: true,
          available: true,
          vision: mv.supportsVision,
          context_window: mv.maxInputTokens,
          max_output: mv.maxOutputTokens,
          rate: null,
          registered: true,
          callable: true,
          origin: "router",
          endpoints: accountsCount,
          usable_endpoints: usableCount,
          default_vision: null,
          default_context: null,
          default_output: null,
          supported_reasoning_efforts: mv.supportedReasoningEfforts,
          reasoning_allows_off: mv.reasoningAllowsOff
        }));
        const registeredIds = models.filter((m) => m.registered).map((m) => m.id).sort();
        const listedIds = models.filter((m) => m.registered && m.hidden === false).map((m) => m.id).sort();
        out.push({
          id,
          base_url: pdef?.baseUrl ?? drow?.base_url ?? null,
          protocol: pdef?.protocol ?? drow?.protocol ?? "openai",
          credential_provider: id,
          // 凭据已入库(credential 表)—— 与 Nexus 一致,不再暴露文件路径。
          credential_file: null,
          env_prefix: pdef?.envPrefix ?? drow?.env_prefix ?? `ONE_${id.toUpperCase()}`,
          accounts_count: accountsCount,
          accounts_with_key: usableCount,
          // ⚠️ **不 filter** 掉 null:指纹数组与账号一一对应,过滤后下标错位。
          key_fingerprints: withKey.map((a) => a.keyFp),
          has_plaintext_keys: false,
          models,
          deployed_models: registeredIds,
          exposed: listedIds,
          listed: listedIds,
          is_channel: false
        });
      }
      return out;
    },
    /**
    
         * 新增/更新一个兼容供应商 —— 对齐 Nexus `_provider_upsert`。
    
         *
    
         * ⚠️ **`envPrefix` 与 `keys` 必须能写**:以前的签名只有
    
         * `(id, baseUrl, protocol)`,于是
    
         * - `env_prefix` 永远落到 `ONE_<ID>` 的默认值(用户改成别的值存不住);
    
         * - 页面上「密钥」输入框填的新 key **被静默丢弃**(`saveCard` 拿不到通道),
    
         *   用户以为保存成功了,实际一个字节都没动。
    
         *
    
         * 凭据池语义(Nexus `_replace_credentials`):`keys` 数组即**整池**、按位置
    
         * 对齐座位;**空串座位不删**(留空 = 不改,见下),只删多出来的尾部座位。
    
         */
    async upsertModelProvider(id, baseUrl, protocol, envPrefix, keys) {
      const pid = String(id ?? "").trim();
      if (!pid) return { ok: false, message: "provider id \u4E0D\u80FD\u4E3A\u7A7A" };
      const proto = String(protocol ?? "").trim() || "openai";
      if (!KNOWN_PROTOCOLS.includes(proto)) {
        return { ok: false, message: `\u672A\u77E5\u534F\u8BAE ${proto}` };
      }
      const env2 = String(envPrefix ?? "").trim();
      const existing = ctx.db.provider.get(pid);
      if (existing) {
        ctx.db.provider.update({
          id: pid,
          base_url: baseUrl,
          protocol: proto,
          ...env2 === "" ? {} : { env_prefix: env2 }
        });
      } else {
        ctx.db.provider.insert({
          id: pid,
          base_url: baseUrl,
          protocol: proto,
          ...env2 === "" ? {} : { env_prefix: env2 }
        });
      }
      const changed = [pid];
      if (Array.isArray(keys)) {
        const current = await ctx.vault.list(pid);
        for (let i = 0; i < keys.length; i += 1) {
          const value = String(keys[i] ?? "").trim();
          if (value === "") continue;
          const username = current[i]?.username ?? `${pid}-${i}`;
          await ctx.vault.put({ provider: pid, username, secret: value });
          changed.push(`${pid}/${username}`);
        }
        for (let i = keys.length; i < current.length; i += 1) {
          await ctx.vault.remove(pid, current[i].username);
          changed.push(`-${pid}/${current[i].username}`);
        }
        try {
          const map = await ctx.vault.secretsFor(pid);
          for (const p of ctx.registry.listAccounts(pid)) {
            const u = splitRef(p.credentialRef)[1];
            ctx.secretPresence.set(`${pid}/${u}`, map.has(u));
          }
        } catch {
        }
      }
      try {
        ctx.scheduler.invalidate();
      } catch {
      }
      ctx.syncRegistry();
      return {
        ok: true,
        message: `\u5DF2\u5199\u5165\u4F9B\u5E94\u5546 ${pid}(${existing ? "\u66F4\u65B0" : "\u65B0\u589E"})`,
        provider: pid,
        changed
      };
    },
    /**
    
         * 删除一个兼容供应商 —— 对齐 Nexus `DELETE /providers/{id}` 的**级联**语义。
    
         *
    
         * ⚠️ 以前只删 `provider` 表那一行,`real_model` 行和 vault 里的凭据全部残留 ——
    
         * 而页面上的确认文案写着「其登记的真实模型与凭据会一并移除」。那是**谎话**:
    
         * 用户删完再进模型总览,模型还在;凭据也还在库里躺着。
    
         *
    
         * 级联顺序(与 Nexus 一致):
    
         * 1. 先把该 provider 的每一个真实模型从所有逻辑模型档链里**连锁摘除**(保序);
    
         * 2. 删 `real_model` 行;
    
         * 3. 删 vault 里的凭据行;
    
         * 4. 删 `provider` 行。
    
         */
    async removeModelProvider(id) {
      const pid = String(id ?? "").trim();
      if (!ctx.db.provider.get(pid) && ctx.registry.getProvider(pid) === null) {
        return { ok: false, message: `provider ${pid} \u4E0D\u5B58\u5728` };
      }
      const models = ctx.db.realModel.listByProvider(pid);
      let stripped = 0;
      for (const m of models) stripped += deps.stripMemberFromLogicalModels(`${pid}/${m.model}`);
      for (const m of models) ctx.db.realModel.delete(pid, m.model);
      let creds = 0;
      try {
        for (const c of await ctx.vault.list(pid)) {
          if (await ctx.vault.remove(pid, c.username)) creds += 1;
          ctx.secretPresence.delete(`${pid}/${c.username}`);
        }
      } catch {
      }
      if (ctx.db.provider.get(pid)) ctx.db.provider.delete(pid);
      try {
        ctx.scheduler.invalidate();
      } catch {
      }
      ctx.syncRegistry();
      const parts = [`\u5DF2\u79FB\u9664 ${pid}`];
      if (models.length > 0) parts.push(`\u771F\u5B9E\u6A21\u578B ${models.length} \u4E2A`);
      if (stripped > 0) parts.push(`\u6863\u94FE\u8FDE\u9501\u6458\u9664 ${stripped} \u5904`);
      if (creds > 0) parts.push(`\u51ED\u636E ${creds} \u6761`);
      if (models.length === 0 && creds === 0) parts.push("(\u8BE5\u4F9B\u5E94\u5546\u4E0B\u6CA1\u6709\u6A21\u578B\u4E0E\u51ED\u636E)");
      return {
        ok: true,
        message: parts.join(","),
        provider: pid,
        changed: [pid]
      };
    },
    async setModelExposure(provider, model, exposed) {
      const pid = String(provider ?? "").trim();
      const mid = String(model ?? "").trim();
      if (!pid || !mid) return { ok: false, message: "provider/model \u4E0D\u80FD\u4E3A\u7A7A" };
      if (!ctx.db.realModel.get(pid, mid)) {
        ctx.db.realModel.set({
          provider: pid,
          model: mid,
          name: null,
          supports_vision: 0,
          max_input_tokens: null,
          max_output_tokens: null,
          hidden: exposed ? 0 : 1,
          concurrency: 1,
          // 手工登记的模型没有上游目录可依 → 空 = 不拦(网关不传/照上游的来)。
          supported_reasoning_efforts: null,
          reasoning_allows_off: null
        });
      }
      const mv = deps.modelViewOf(pid, mid);
      if (!mv) return { ok: false, message: `\u672A\u77E5\u6A21\u578B ${pid}/${mid}` };
      ctx.db.realModel.update({ provider: pid, model: mid, hidden: exposed ? 0 : 1 });
      ctx.syncRegistry();
      return {
        ok: true,
        message: exposed ? `\u5DF2\u66B4\u9732 ${pid}/${mid}` : `\u5DF2\u9690\u85CF ${pid}/${mid}`,
        changed: [`${pid}/${mid}`]
      };
    }
  };
  return { methods };
}

// ../panel/src/overview.ts
import { existsSync as existsSync5, readdirSync as readdirSync3, statSync as statSync2 } from "node:fs";
import { join as join6 } from "node:path";
function createOverviewDomain(ctx, deps) {
  const gatewayReady = () => ctx.gatewayState.error === null && ctx.gatewayState.gateway !== null;
  const gatewayReason = () => ctx.gatewayState.error ?? (ctx.gatewayState.gateway === null ? "\u7F51\u5173\u672A\u542F\u52A8" : null);
  const isLogicalModelName = (name2) => ctx.db.logicalModel.get(name2) !== void 0;
  const providers = async () => {
    const configured = ctx.registry.listProviders();
    const knownIds = Array.from(/* @__PURE__ */ new Set([
      ...configured.map((p) => p.id),
      ...getAllConnectors().map((c) => c.vendorId),
      ...KNOWN_PROTOCOLS
    ]));
    const out = [];
    for (const id of knownIds) {
      const pdef = ctx.registry.getProvider(id);
      const accounts = ctx.registry.listAccounts(id);
      const envPrefix = pdef?.envPrefix ?? `ONE_${id.toUpperCase()}`;
      const accountInfos = await Promise.all(
        accounts.map(async (account, index) => {
          const [provider, username] = splitRef(account.credentialRef);
          const summary = await ctx.vault.describe(provider, username);
          return {
            index,
            env_var: `${envPrefix}_KEY${accounts.length > 1 ? `_${index + 1}` : ""}`,
            has_key: summary !== null,
            key_fp: summary?.key ?? null,
            label: account.credentialRef,
            source: "credential \u8868",
            enabled: ctx.accountOverlay.get(account.credentialRef) ?? account.enabled
          };
        })
      );
      const kind = KIND_BY_PROTOCOL[id] ?? (pdef ? KIND_BY_PROTOCOL[pdef.protocol] ?? "channel" : "channel");
      const isChannel = kind === "channel";
      out.push({
        provider: id,
        env_prefix: envPrefix,
        kind,
        base_url: pdef?.baseUrl ?? null,
        model_count: ctx.registry.listRealModels(id).length,
        exists: pdef !== void 0,
        readable: true,
        error: null,
        count: accounts.length,
        accounts: accountInfos,
        login: isChannel ? {
          logged_in: accountInfos.some((a) => a.has_key),
          reason: accountInfos.some((a) => a.has_key) ? null : "\u672A\u914D\u7F6E\u5BC6\u94A5"
        } : null
      });
    }
    return out;
  };
  const recentLimit = () => {
    const raw = ctx.db.setting.get("ui.recent_limit")?.v ?? "50";
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(500, Math.max(1, Math.trunc(n))) : 50;
  };
  const toRecentRequests = (limit) => ctx.ledger.recentRows(limit).map((r) => {
    const denom = r.ttftMs !== null ? (r.latencyMs - r.ttftMs) / 1e3 : 0;
    const tps = r.ttftMs !== null && denom > 0 && r.completionTokens > 0 ? Math.round(r.completionTokens / denom * 10) / 10 : null;
    return {
      seq: r.lease.seq,
      conv: String(r.lease.convNo),
      real_model_id: r.lease.realModelId,
      logical_model: r.lease.logicalModel || null,
      endpoint_id: r.lease.endpointId,
      stream: r.lease.stream,
      ok: r.ok,
      status: r.status ?? null,
      error: r.error ?? null,
      latency_ms: r.latencyMs ?? null,
      ttft_ms: r.ttftMs ?? null,
      prompt_tokens: r.promptTokens ?? null,
      completion_tokens: r.completionTokens ?? null,
      cached_tokens: r.cachedTokens ?? null,
      tps,
      finished_s_ago: Math.round((monotonic() - r.finishedAt) * 10) / 10
    };
  });
  const usageWindow = (range, sortedDays) => {
    const to = sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : todayLocal();
    const first = sortedDays.length > 0 ? sortedDays[0] : null;
    switch (range) {
      case "7":
        return { from: clampDay(dayAdd(to, -6), first), to };
      case "30":
        return { from: clampDay(dayAdd(to, -29), first), to };
      case "90":
        return { from: clampDay(dayAdd(to, -89), first), to };
      case "365":
        return { from: clampDay(dayAdd(to, -364), first), to };
      default: {
        if (sortedDays.length === 0) return { from: null, to: null };
        return { from: sortedDays[0], to: sortedDays[sortedDays.length - 1] };
      }
    }
  };
  function validateCooldownOverrides(parsed) {
    const KEY = "scheduler.cooldown_overrides";
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return `${KEY} \u5E94\u4E3A\u5BF9\u8C61 {"<provider>": \u5206\u949F},\u6536\u5230 ${Array.isArray(parsed) ? "array" : typeof parsed}`;
    }
    for (const [pid, minutes] of Object.entries(parsed)) {
      if (pid.trim() === "") return `${KEY} \u6709\u7A7A provider \u540D`;
      if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
        return `${KEY}.${pid} \u5FC5\u987B\u662F\u6B63\u6570(\u5206\u949F),\u6536\u5230 ${JSON.stringify(minutes)}`;
      }
    }
    return null;
  }
  function validateRulesArray(parsed, priorityKey) {
    const KEY = priorityKey;
    if (!Array.isArray(parsed)) {
      return `${KEY} \u5E94\u4E3A JSON \u6570\u7EC4,\u6536\u5230 ${parsed === null ? "null" : typeof parsed}`;
    }
    for (let i = 0; i < parsed.length; i += 1) {
      const n = i + 1;
      const item = parsed[i];
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return `${KEY} \u7B2C ${n} \u6761\u5E94\u4E3A\u5BF9\u8C61,\u6536\u5230 ${Array.isArray(item) ? "array" : typeof item}`;
      }
      const r = item;
      const provider = r["provider"];
      if (typeof provider !== "string" || provider.trim() === "") {
        return `${KEY} \u7B2C ${n} \u6761:provider \u5FC5\u586B\u4E14\u4E3A\u975E\u7A7A\u5B57\u7B26\u4E32,\u6536\u5230 ${JSON.stringify(provider)}`;
      }
      const tag = `${KEY} \u7B2C ${n} \u6761(provider=${JSON.stringify(provider)})`;
      if ("priority" in r && r["priority"] !== void 0 && r["priority"] !== null) {
        return `${tag}:\u952E\u540D\u5373\u6863\u4F4D,\u5143\u7D20\u91CC\u4E0D\u8981\u5199 priority(\u6863\u4F4D\u7531 scheduler.rules_p<priority> \u7684\u952E\u540D\u51B3\u5B9A)`;
      }
      const model = r["model"];
      if (model !== void 0 && model !== null && (typeof model !== "string" || model.trim() === "")) {
        return `${tag}:model \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32,\u6536\u5230 ${JSON.stringify(model)}`;
      }
      for (const [field, why] of [
        ["logical", "\u65F6\u6BB5\u89C4\u5219\u4E00\u5F8B\u5168\u5C40\u751F\u6548,\u8BF7\u5220\u9664\u8BE5\u5B57\u6BB5"],
        ["times", "\u65F6\u6BB5\u5DF2\u6536\u8FDB window \u5D4C\u5957\u5BF9\u8C61:\u5199 window:{times:[...]}"],
        ["weekdays", "\u661F\u671F\u9650\u5B9A\u5DF2\u6536\u8FDB window \u5D4C\u5957\u5BF9\u8C61:\u5199 window:{weekdays:[...]}"],
        ["cooldown", "\u51B7\u5374\u8986\u76D6\u5DF2\u62C6\u5230\u72EC\u7ACB\u8BBE\u7F6E\u952E scheduler.cooldown_overrides"]
      ]) {
        if (field in r) return `${tag}:${field} \u5B57\u6BB5\u5DF2\u5E9F\u5F03:${why}`;
      }
      const expires = r["expires_at"];
      if (expires !== void 0 && expires !== null && (typeof expires !== "string" || expires.trim() === "")) {
        return `${tag}:expires_at \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32,\u6536\u5230 ${JSON.stringify(expires)}`;
      }
      const win = r["window"];
      if (win !== void 0 && win !== null) {
        if (win === null || typeof win !== "object" || Array.isArray(win)) {
          return `${tag}:window \u5FC5\u987B\u662F\u5BF9\u8C61 {weekdays?, times?},\u6536\u5230 ${Array.isArray(win) ? "array" : typeof win}`;
        }
        const w = win;
        const winExtra = Object.keys(w).filter((k) => k !== "times" && k !== "weekdays").sort();
        if (winExtra.length > 0) {
          return `${tag}:window \u6709\u672A\u77E5\u952E:${winExtra.join(", ")}(\u53EA\u8BA4 times / weekdays)`;
        }
        const times = w["times"];
        if (times !== void 0 && times !== null) {
          const okShape = Array.isArray(times) && times.length > 0 && times.every((span) => Array.isArray(span) && span.length === 2);
          if (!okShape) {
            return `${tag}:window.times \u5FC5\u987B\u662F [["HH:MM","HH:MM"], ...] \u5F62\u72B6\u7684\u65F6\u6BB5\u5217\u8868,\u6536\u5230 ${JSON.stringify(times)}`;
          }
          if (typeof model !== "string" || model.trim() === "") {
            return `${tag}:\u5E26 window.times \u7684\u89C4\u5219\u5FC5\u987B\u540C\u65F6\u6709\u975E\u7A7A model(\u65F6\u6BB5\u89C4\u5219\u6309 provider+model \u7CBE\u786E\u5339\u914D\u7AEF\u70B9),\u6536\u5230 model=${JSON.stringify(model)}`;
          }
        }
        const weekdays = w["weekdays"];
        if (weekdays !== void 0 && weekdays !== null) {
          const ok2 = Array.isArray(weekdays) && weekdays.length > 0 && weekdays.every((d) => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7);
          if (!ok2) return `${tag}:window.weekdays \u5FC5\u987B\u662F 1..7 \u7684\u6574\u6570\u5217\u8868,\u6536\u5230 ${JSON.stringify(weekdays)}`;
        }
      }
    }
    return null;
  }
  const methods = {
    async getStatus() {
      const uptimeS = (Date.now() - ctx.startedAtMs) / 1e3;
      const nowS = wallNow();
      const dbLogicalRows = ctx.db.logicalModel.list();
      const logicalNames = dbLogicalRows.map((r) => r.name);
      const uniqueLogical = [...new Set(logicalNames)];
      const membersOf = (name2) => {
        const row = ctx.db.logicalModel.get(name2);
        return row ? parseDbMembers(row.members) : [];
      };
      const rows = [];
      const inLogical = /* @__PURE__ */ new Set();
      for (const name2 of uniqueLogical) {
        const members = membersOf(name2);
        if (members.length === 0) continue;
        const keys = members.map((m) => `${m.provider}/${m.model}`);
        for (const k of keys) inLogical.add(k);
        rows.push(keys);
      }
      for (const mv of deps.realModelMap().values()) {
        const key3 = `${mv.provider}/${mv.model}`;
        if (inLogical.has(key3)) continue;
        if (ctx.registry.listAccounts(mv.provider).length === 0) continue;
        rows.push([key3]);
      }
      const coolingOf = (realModelKeys) => {
        for (const rmk of realModelKeys) {
          const slash = rmk.indexOf("/");
          const provider = rmk.slice(0, slash);
          const model = rmk.slice(slash + 1);
          for (const acc of ctx.registry.listAccounts(provider)) {
            const id = endpointIdOf(provider, model, splitRef(acc.credentialRef)[1]);
            const rec = ctx.health.get(id);
            if (rec.cooldownUntil > 0 && rec.cooldownUntil > nowS) return true;
          }
        }
        return false;
      };
      const cooldownCount = rows.filter(coolingOf).length;
      return {
        ready: gatewayReady(),
        reason: gatewayReason(),
        uptime_s: Math.round(uptimeS * 10) / 10,
        deployments: rows.length,
        healthy_count: rows.length - cooldownCount,
        cooldown_count: cooldownCount,
        metrics_enabled: true,
        metrics_generated_at: null,
        providers: await providers()
      };
    },
    /**
     * 重启网关 —— **只保留给托盘菜单**(唯一入口)。
     *
     * 面板不再提供重启按钮(用户定案:重启网关唯一入口就是托盘菜单),这里刻意
     * 不暴露给 IPC:若仍被调用说明是旧渲染层残留,返回明确错误而不是静默成功。
     */
    async restartGateway() {
      const message = await ctx.restartGateway();
      const ok2 = ctx.gatewayState.error === null && ctx.gatewayState.gateway !== null;
      return { ok: ok2, message };
    },
    async getRuntime() {
      const limit = recentLimit();
      const leases = ctx.ledger.detail();
      const byLogical = /* @__PURE__ */ new Map();
      for (const l of leases) {
        const key3 = l.logicalModel || "";
        let group = byLogical.get(key3);
        if (!group) {
          group = { logical_model: key3, in_flight: 0, real_models: [], leases: [] };
          byLogical.set(key3, group);
        }
        group.in_flight += 1;
        if (!group.real_models.includes(l.realModelId)) group.real_models.push(l.realModelId);
        group.leases.push({
          seq: l.seq,
          conv: String(l.convNo),
          real_model_id: l.realModelId,
          logical_model: l.logicalModel || null,
          endpoint_id: l.endpointId,
          stream: l.stream,
          elapsed_s: Math.round((monotonic() - l.startedAt) * 10) / 10
        });
      }
      const byLogicalArray = [...byLogical.entries()].map(([key3, group]) => ({ ...group, logical_model: key3 })).sort((a, b) => a.logical_model === "" ? -1 : b.logical_model === "" ? 1 : a.logical_model < b.logical_model ? -1 : 1);
      return {
        ready: gatewayReady(),
        uptime_s: Math.round((Date.now() - ctx.startedAtMs) / 1e3 * 10) / 10,
        in_flight_total: ctx.ledger.total(),
        by_real_model: ctx.ledger.snapshot(),
        by_logical_model: byLogicalArray,
        leases: byLogicalArray.flatMap((g) => g.leases),
        recent: toRecentRequests(limit),
        recent_limit: limit
      };
    },
    async getUsageHistory(range, granularity, group) {
      const rng = ["all", "7", "30", "90", "365"].includes(range) ? range : "all";
      const gran = granularity === "month" ? "month" : "day";
      const grp = group === "logical" ? "logical" : "model";
      const allRows = ctx.db.statsDaily.range("0000-01-01", "9999-12-31");
      const sortedDays = [...new Set(allRows.map((r) => r.day))].sort();
      const { from, to } = usageWindow(rng, sortedDays);
      const rows = from !== null && to !== null ? ctx.db.statsDaily.range(from, to) : [];
      const tokensOf = (row) => row.prompt_tokens + row.completion_tokens;
      const skipRow = (row) => grp === "logical" && !(row.logical_model ?? "").trim();
      const seriesKeyOf = (row) => grp === "model" ? `${row.provider}/${row.model}` : String(row.logical_model ?? "").trim() || `${row.provider}/${row.model}`;
      const seriesMeta = (key3) => {
        if (grp === "model") {
          const idx2 = key3.indexOf("/");
          return {
            name: idx2 >= 0 ? key3.slice(idx2 + 1) : key3,
            provider: idx2 >= 0 ? key3.slice(0, idx2) : null,
            logical_model: null
          };
        }
        if (isLogicalModelName(key3)) return { name: key3, provider: null, logical_model: key3 };
        const idx = key3.indexOf("/");
        if (idx >= 0) return { name: key3, provider: key3.slice(0, idx), logical_model: null };
        return { name: key3, provider: null, logical_model: key3 };
      };
      const seriesAgg = /* @__PURE__ */ new Map();
      const provAgg = /* @__PURE__ */ new Map();
      const bucketTotals = /* @__PURE__ */ new Map();
      const activeDays = /* @__PURE__ */ new Set();
      const totals = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 };
      const addTo = (agg, row, tokens) => {
        agg.tokens += tokens;
        agg.requests += row.requests;
        agg.fails += row.fails;
        agg.prompt += row.prompt_tokens;
        agg.completion += row.completion_tokens;
        agg.cached += row.cached_tokens;
      };
      for (const row of rows) {
        if (skipRow(row)) continue;
        const bucketKey = gran === "month" ? row.day.slice(0, 7) : row.day;
        const tokens = tokensOf(row);
        if (tokens > 0 || row.requests > 0) activeDays.add(row.day);
        addTo(totals, row, tokens);
        const skey = seriesKeyOf(row);
        let s = seriesAgg.get(skey);
        if (!s) {
          s = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0, buckets: /* @__PURE__ */ new Map() };
          seriesAgg.set(skey, s);
        }
        addTo(s, row, tokens);
        let sb = s.buckets.get(bucketKey);
        if (!sb) {
          sb = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 };
          s.buckets.set(bucketKey, sb);
        }
        addTo(sb, row, tokens);
        let p = provAgg.get(row.provider);
        if (!p) {
          p = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0, models: /* @__PURE__ */ new Map() };
          provAgg.set(row.provider, p);
        }
        addTo(p, row, tokens);
        const mkey = `${row.provider}/${row.model}`;
        let pm = p.models.get(mkey);
        if (!pm) {
          pm = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 };
          p.models.set(mkey, pm);
        }
        addTo(pm, row, tokens);
        let bt = bucketTotals.get(bucketKey);
        if (!bt) {
          bt = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 };
          bucketTotals.set(bucketKey, bt);
        }
        addTo(bt, row, tokens);
      }
      const byTokensThenKey = (a, b) => b[1].tokens - a[1].tokens || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      const sortedSeries = [...seriesAgg.entries()].sort(byTokensThenKey);
      const TOP_MODELS = 10;
      const TOP_PROVIDERS = 5;
      const topSeries = sortedSeries.slice(0, TOP_MODELS);
      const displayKeys = new Set(topSeries.map(([k]) => k));
      const OTHER_MODEL_KEY = "\0other";
      const subModels = (seriesKey, aggTokens) => {
        const agg = seriesAgg.get(seriesKey);
        if (!agg) return [];
        const byModel = /* @__PURE__ */ new Map();
        for (const row of rows) {
          if (skipRow(row)) continue;
          if (seriesKeyOf(row) !== seriesKey) continue;
          const mk = `${row.provider}/${row.model}`;
          const cur = byModel.get(mk) ?? { tokens: 0, provider: row.provider };
          cur.tokens += tokensOf(row);
          byModel.set(mk, cur);
        }
        return [...byModel.entries()].map(([mk, v]) => ({
          name: mk.slice(mk.indexOf("/") + 1),
          provider: v.provider,
          tokens: v.tokens,
          percent: pct(v.tokens, aggTokens)
        })).sort((a, b) => b.tokens - a.tokens);
      };
      const series = topSeries.map(([key3, agg]) => {
        const meta = seriesMeta(key3);
        return {
          key: key3,
          name: meta.name,
          provider: meta.provider,
          logical_model: meta.logical_model,
          tokens: agg.tokens,
          requests: agg.requests,
          cache_hit: agg.cached,
          cache_miss: Math.max(0, agg.prompt - agg.cached),
          percent: pct(agg.tokens, totals.tokens),
          is_other: false,
          models: subModels(key3, agg.tokens)
        };
      });
      const foldedSeries = sortedSeries.slice(TOP_MODELS);
      if (foldedSeries.length > 0) {
        const foldedTokens = foldedSeries.reduce((sum, [, agg]) => sum + agg.tokens, 0);
        const foldedRequests = foldedSeries.reduce((sum, [, agg]) => sum + agg.requests, 0);
        series.push({
          key: OTHER_MODEL_KEY,
          name: "\u5176\u4ED6",
          provider: null,
          logical_model: null,
          tokens: foldedTokens,
          requests: foldedRequests,
          cache_hit: foldedSeries.reduce((sum, [, agg]) => sum + agg.cached, 0),
          cache_miss: foldedSeries.reduce((sum, [, agg]) => sum + Math.max(0, agg.prompt - agg.cached), 0),
          percent: pct(foldedTokens, totals.tokens),
          is_other: true,
          models: [],
          folded: foldedSeries.map(([key3, agg]) => {
            const meta = seriesMeta(key3);
            return {
              key: key3,
              name: meta.name,
              provider: meta.provider,
              tokens: agg.tokens,
              requests: agg.requests,
              percent: pct(agg.tokens, totals.tokens),
              models: subModels(key3, agg.tokens)
            };
          })
        });
        displayKeys.add(OTHER_MODEL_KEY);
      }
      const axis = from !== null && to !== null ? gran === "month" ? monthAxis(from, to) : rangeDays(from, to) : [];
      const buckets = axis.map((bk) => {
        const bt = bucketTotals.get(bk) ?? { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 };
        const bySeries = [...displayKeys].map((key3) => ({
          key: key3,
          tokens: key3 === OTHER_MODEL_KEY ? foldedSeries.reduce(
            (sum, [, agg]) => sum + (agg.buckets.get(bk)?.tokens ?? 0),
            0
          ) : seriesAgg.get(key3)?.buckets.get(bk)?.tokens ?? 0
        }));
        const bySum = bySeries.reduce((sum, e) => sum + e.tokens, 0);
        return {
          key: bk,
          tokens: bt.tokens,
          requests: bt.requests,
          fails: bt.fails,
          cache_hit: bt.cached,
          cache_miss: Math.max(0, bt.prompt - bt.cached),
          // Nexus `_pct(cached, prompt)` 口径:round 4 位、prompt=0 → null。
          cache_hit_rate: bt.prompt > 0 ? Math.round(bt.cached / bt.prompt * 1e4) / 1e4 : null,
          by_series: bySeries,
          other: Math.max(0, bt.tokens - bySum)
        };
      });
      const providerRanked = [...provAgg.entries()].filter(([, agg]) => agg.tokens > 0).sort(byTokensThenKey);
      const providerModels = (pid, agg) => [...agg.models.entries()].filter(([, m]) => m.tokens > 0).map(([mk, m]) => ({
        name: mk.slice(mk.indexOf("/") + 1),
        provider: pid,
        tokens: m.tokens,
        percent: pct(m.tokens, agg.tokens)
      })).sort((a, b) => b.tokens - a.tokens);
      const providers2 = providerRanked.slice(0, TOP_PROVIDERS).map(([pid, agg]) => ({
        provider: pid,
        tokens: agg.tokens,
        requests: agg.requests,
        percent: pct(agg.tokens, totals.tokens),
        is_other: false,
        models: providerModels(pid, agg)
      }));
      const foldedProviders = providerRanked.slice(TOP_PROVIDERS);
      if (foldedProviders.length > 0) {
        const foldedTokens = foldedProviders.reduce((sum, [, agg]) => sum + agg.tokens, 0);
        const foldedRequests = foldedProviders.reduce((sum, [, agg]) => sum + agg.requests, 0);
        providers2.push({
          provider: "\0pother",
          tokens: foldedTokens,
          requests: foldedRequests,
          percent: pct(foldedTokens, totals.tokens),
          is_other: true,
          models: [],
          folded: foldedProviders.map(([pid, agg]) => ({
            provider: pid,
            key: pid,
            name: pid,
            tokens: agg.tokens,
            requests: agg.requests,
            percent: pct(agg.tokens, totals.tokens),
            models: providerModels(pid, agg)
          }))
        });
      }
      const usageTotals = {
        tokens: totals.tokens,
        requests: totals.requests,
        fails: totals.fails,
        prompt_tokens: totals.prompt,
        completion_tokens: totals.completion,
        cached_tokens: totals.cached,
        cache_hit: totals.cached,
        cache_miss: Math.max(0, totals.prompt - totals.cached),
        cache_hit_rate: totals.prompt > 0 ? Math.round(totals.cached / totals.prompt * 1e4) / 1e4 : null,
        active_days: activeDays.size
      };
      return {
        generated_at: (/* @__PURE__ */ new Date()).toISOString(),
        source: "stats_daily",
        range: rng,
        granularity: gran,
        group: grp,
        from,
        to,
        last_day: sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : null,
        axis,
        totals: usageTotals,
        top: series[0] ?? null,
        series,
        buckets,
        providers: providers2
      };
    },
    /**
     * 指标页数据(对齐 Nexus `GET /metrics` → `_metrics_page`)。
     *
     * 数据源是 `stats_daily`(按天聚合,D20/D21);TTFT / TPS / 缓存命中率**一律
     * 从原料现算**。
     *
     * ⚠️ v4 的 `stats_daily` **没有凭据维度**,所以「端点」这一层退化成真实
     * 模型本身 —— 页面按 deployment 展示时不会凭空多出一行。
     */
    async getMetrics(days) {
      const span = Math.max(1, Math.min(365, Math.trunc(Number(days ?? 7))));
      const fromDay = dayAdd(todayLocal(), -(span - 1));
      const rows = ctx.db.statsDaily.range(fromDay, todayLocal());
      const perModel = /* @__PURE__ */ new Map();
      for (const r of rows) {
        const mid = `${r.provider}/${r.model}`;
        const cur = perModel.get(mid) ?? {
          requests: 0,
          fails: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          latencySum: 0,
          ttftSum: 0,
          ttftReq: 0
        };
        cur.requests += r.requests;
        cur.fails += r.fails;
        cur.prompt += r.prompt_tokens;
        cur.completion += r.completion_tokens;
        cur.cached += r.cached_tokens;
        cur.latencySum += r.latency_sum_ms;
        cur.ttftSum += r.ttft_sum_ms;
        cur.ttftReq += r.ttft_requests;
        perModel.set(mid, cur);
      }
      const rowOf = (a) => {
        const genMs = a.latencySum - a.ttftSum;
        return {
          requests: a.requests,
          fails: a.fails,
          // ⚠️ total = prompt + completion(cached 是 prompt 子集,不双计)
          total: a.prompt + a.completion,
          prompt_tokens: a.prompt,
          completion_tokens: a.completion,
          cached_tokens: a.cached,
          cache_hit: a.cached,
          cache_miss: Math.max(0, a.prompt - a.cached),
          cache_hit_rate: a.prompt > 0 ? Math.round(a.cached / a.prompt * 1e4) / 1e4 : null,
          avg_ttft_ms: a.ttftReq > 0 ? round12(a.ttftSum / a.ttftReq) : null,
          avg_tps: a.completion > 0 && genMs > 0 ? round12(a.completion / (genMs / 1e3)) : null,
          latency_day: null
        };
      };
      const models = [...perModel.entries()].sort((a, b) => b[1].requests - a[1].requests).map(([mid, agg]) => {
        const row = rowOf(agg);
        return {
          model: mid,
          overall: row,
          buckets: [row],
          deployments: [{
            deployment: mid,
            deployment_id: mid,
            overall: row,
            buckets: [row]
          }]
        };
      });
      return {
        enabled: true,
        generated_at: (/* @__PURE__ */ new Date()).toISOString(),
        uptime_s: Math.round((Date.now() - ctx.startedAtMs) / 1e3),
        source: "stats_daily",
        models
      };
    },
    async getRecentRequests(limit) {
      const n = limit === void 0 ? recentLimit() : Math.min(500, Math.max(1, Math.trunc(Number(limit))));
      return toRecentRequests(n);
    },
    async getUsageSummary() {
      return methods.getUsageHistory("all", "day", "model");
    },
    async getRequestLogStatus() {
      return methods.getRequestLog();
    },
    async listProviders() {
      return providers();
    },
    async setAccountEnabled(providerId, index, enabled) {
      const accounts = ctx.registry.listAccounts(String(providerId ?? ""));
      const account = accounts[Number(index)];
      if (!account) return;
      ctx.accountOverlay.set(account.credentialRef, Boolean(enabled));
    },
    async getSettings() {
      const sections = {};
      for (const spec of SETTING_FIELDS) {
        let value = ctx.db.setting.get(spec.key)?.v ?? null;
        if (value === null || value === "") {
          const seed = spec.key.startsWith("scheduler.rules_p") ? rulesDefaultsJson(Number(spec.key.slice("scheduler.rules_p".length))) : spec.key === "scheduler.cooldown_overrides" ? cooldownDefaultsJson() : spec.def;
          ctx.db.setting.set(spec.key, seed);
          value = seed;
        }
        const dot = spec.key.indexOf(".");
        const section = spec.section ?? (dot > 0 ? spec.key.slice(0, dot) : spec.key);
        const group = sections[section] ?? (sections[section] = {});
        group[spec.key] = value;
      }
      const masterKey = ctx.keyProvider.getKey() ?? null;
      const specs = SETTING_FIELDS.map((f) => ({
        key: f.key,
        kind: f.kind,
        label: f.label,
        ...f.min === void 0 ? {} : { min: f.min },
        ...f.max === void 0 ? {} : { max: f.max },
        ...f.section === void 0 ? {} : { section: f.section }
      }));
      return {
        sections,
        specs,
        master_key: masterKey,
        master_key_note: masterKey ? null : "\u672A\u8BBE\u7F6E ONE_API_KEY:\u5F53\u524D\u65E0\u9274\u6743"
      };
    },
    /**
     * 写设置 —— **逐项按规格校验**(对齐 Nexus `_settings_save`):
     * 未知键拒绝、越界拒绝、JSON 形状不合法拒绝。
     *
     * ⚠️ 为什么必须**先验再落库**:所有这些都是「存进去也不生效」的形状 ——
     * 越界的刷新间隔被运行期夹回默认、坏 JSON 被引擎整段回落、`times` 规则
     * 没有 `model` 永远命中不了任何端点。用户改了半天发现「没生效」,就是一个
     * 静默死开关;保存时报错才能让他当场知道。
     */
    async saveSettings(payload) {
      const byKey = new Map(SETTING_FIELDS.map((f) => [f.key, f]));
      const incoming = [];
      for (const section of Object.keys(payload ?? {})) {
        const fields = payload[section] ?? {};
        if (fields === null || typeof fields !== "object") continue;
        for (const fieldKey of Object.keys(fields)) {
          const fullKey = fieldKey.includes(".") ? fieldKey : `${section}.${fieldKey}`;
          const spec = byKey.get(fullKey);
          if (!spec) {
            return { ok: false, message: `\u672A\u77E5\u8BBE\u7F6E\u9879:${fullKey}` };
          }
          incoming.push({ spec, raw: fields[fieldKey] });
        }
      }
      const writes = [];
      for (const { spec, raw } of incoming) {
        if (spec.kind === "bool") {
          const truthy = raw === true || raw === 1 || raw === "1" || raw === "true" || raw === "True";
          writes.push({ key: spec.key, value: truthy ? "1" : "0" });
          continue;
        }
        if (spec.kind === "int" || spec.kind === "float") {
          const text = typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
          const num2 = Number(text);
          if (text === "" || !Number.isFinite(num2)) {
            return { ok: false, message: `${spec.key} \u5FC5\u987B\u662F\u6570\u5B57,\u6536\u5230:${JSON.stringify(raw)}` };
          }
          if (spec.kind === "int") {
            if (!Number.isInteger(num2)) {
              return { ok: false, message: `${spec.key} \u5FC5\u987B\u662F\u6574\u6570,\u6536\u5230:${text}` };
            }
            if (spec.min !== void 0 && num2 < spec.min) {
              return { ok: false, message: `${spec.key} \u4E0D\u80FD\u5C0F\u4E8E ${spec.min},\u6536\u5230:${num2}` };
            }
            if (spec.max !== void 0 && num2 > spec.max) {
              return { ok: false, message: `${spec.key} \u4E0D\u80FD\u5927\u4E8E ${spec.max},\u6536\u5230:${num2}` };
            }
            writes.push({ key: spec.key, value: String(num2) });
            continue;
          }
          if (spec.min !== void 0 && num2 < spec.min) {
            return { ok: false, message: `${spec.key} \u4E0D\u80FD\u5C0F\u4E8E ${spec.min},\u6536\u5230:${num2}` };
          }
          if (spec.max !== void 0 && num2 > spec.max) {
            return { ok: false, message: `${spec.key} \u4E0D\u80FD\u5927\u4E8E ${spec.max},\u6536\u5230:${num2}` };
          }
          writes.push({ key: spec.key, value: String(num2) });
          continue;
        }
        if (spec.kind === "json") {
          let parsed;
          if (typeof raw === "object" && raw !== null) {
            parsed = raw;
          } else {
            try {
              parsed = JSON.parse(String(raw ?? ""));
            } catch (exc) {
              return {
                ok: false,
                message: `${spec.key} \u4E0D\u662F\u5408\u6CD5 JSON:${exc instanceof Error ? exc.message : String(exc)}`
              };
            }
          }
          if (spec.key.startsWith("scheduler.rules_p")) {
            const bad = validateRulesArray(parsed, spec.key);
            if (bad !== null) return { ok: false, message: bad };
            writes.push({ key: spec.key, value: JSON.stringify(parsed, null, 2) });
            continue;
          }
          if (spec.key === "scheduler.cooldown_overrides") {
            const bad = validateCooldownOverrides(parsed);
            if (bad !== null) return { ok: false, message: bad };
            writes.push({ key: spec.key, value: JSON.stringify(parsed, null, 2) });
            continue;
          }
          writes.push({ key: spec.key, value: JSON.stringify(parsed, null, 2) });
          continue;
        }
        writes.push({ key: spec.key, value: String(raw ?? "") });
      }
      for (const w of writes) ctx.db.setting.set(w.key, w.value);
      try {
        ctx.scheduler.invalidate();
      } catch {
      }
      if (writes.some((w) => w.key.startsWith("scheduler.rules"))) ctx.syncRegistry();
      const changed = writes.map((w) => w.key);
      return {
        ok: true,
        message: changed.length > 0 ? `\u5DF2\u4FDD\u5B58 ${changed.length} \u9879\u8BBE\u7F6E` : "\u6CA1\u6709\u9700\u8981\u4FDD\u5B58\u7684\u8BBE\u7F6E",
        changed
      };
    },
    async getRequestLog() {
      const rawEnabled = ctx.db.setting.get("request_log.enabled")?.v ?? "1";
      const rawMode = ctx.db.setting.get("request_log.content_mode")?.v;
      const mode = parseContentMode(rawMode, "off");
      const logsDir = join6(ctx.configDir, "logs");
      let logFiles = [];
      try {
        logFiles = readdirSync3(logsDir).filter((f) => /^requests-\d{8}\.jsonl$/.test(f)).sort();
      } catch {
      }
      const recent = logFiles.slice(-30);
      let sizeBytes = 0;
      let written = 0;
      for (const f of recent) {
        try {
          sizeBytes += statSync2(join6(logsDir, f)).size;
          written += countJsonlLines(join6(logsDir, f));
        } catch {
        }
      }
      const counters = ctx.db.statsDaily.counters(dayKey(Date.now() - 864e5));
      return {
        enabled: rawEnabled === "1",
        content_mode: mode,
        // 逐字对齐 Nexus `api_pages.py` L5284-5289 的中文说明。
        content_modes: REQUEST_LOG_CONTENT_MODES,
        path: logsDir,
        size_bytes: sizeBytes,
        // `written` = 日志文件里真实的**条目数**(D20:逐请求明细不入库,
        // 库里只有按天聚合的 stats_daily —— 「已写几条」只能从文件数)。
        // `log_files` 一并给出文件名,便于核对「大小与条数对不对得上」。
        counters: { ...counters, written },
        log_files: recent,
        last_error: null
      };
    },
    async setRequestLog(patch) {
      const mode = patch?.content_mode;
      if (mode !== void 0) {
        const text = String(mode);
        if (!["off", "structure", "full", "edges"].includes(text)) {
          return {
            ok: false,
            message: `content_mode \u53EA\u80FD\u662F off/structure/full/edges,\u6536\u5230:'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
          };
        }
        ctx.db.setting.set("request_log.content_mode", text);
      }
      if (patch?.enabled !== void 0) {
        ctx.db.setting.set("request_log.enabled", patch.enabled ? "1" : "0");
      }
      return {
        ok: true,
        enabled: (ctx.db.setting.get("request_log.enabled")?.v ?? "1") === "1",
        content_mode: ctx.db.setting.get("request_log.content_mode")?.v ?? "off",
        message: "\u5DF2\u4FDD\u5B58\u8BF7\u6C42\u65E5\u5FD7\u8BBE\u7F6E"
      };
    },
    /**
     * SenseNova「刷新」—— 页面那个按钮以前只 `load()` 本地库(所以「刷了没反应」)。
     * 现在真干两件事(都是**不烧额度**的元数据/控制台接口):
     *   ① 上游模型目录:`token.sensenova.cn/v1/models`(API key 认证)→ 落 db.real_model;
     *   ② 积分池:清空冷却闸门重拉(JWT 过期且已存密码 → 串行免登录续期再拉)。
     */
    // ── SenseNova 登录与账号管理(镜像 Nexus /sensenova/login、/refetch-key、/accounts) ──
    // ── 数据目录 ────────────────────────────────────────────────────────────
    async getDataDir() {
      const logsDir = join6(ctx.configDir, "logs");
      return {
        data_dir: ctx.configDir,
        credentials_dir: ctx.configDir,
        logs: existsSync5(logsDir) ? logsDir : "",
        state: "ok"
      };
    }
  };
  return { methods };
}

// ../panel/src/panel.ts
function createPanel(ctx, deps) {
  const getSetting = (key3, fallback) => {
    const v = ctx.db.setting.get(key3)?.v;
    return v === null || v === void 0 || v === "" ? fallback : v;
  };
  const lastStatsDay = () => {
    const row = ctx.db.raw.prepare("SELECT MAX(day) AS m FROM stats_daily").get();
    return row?.m ?? null;
  };
  const enabledAccounts = (pid) => ctx.registry.listAccounts(pid).filter((a) => ctx.accountOverlay.get(a.credentialRef) ?? a.enabled).map((a) => ({ username: splitRef(a.credentialRef)[1], credentialRef: a.credentialRef }));
  const realModelMap = (pid) => realModelMapOf(ctx.registry, ctx.db, pid);
  const modelViewOf = (provider, model) => realModelMap(provider).get(`${provider}/${model}`);
  const stripMemberFromLogicalModels2 = (targetRealModelId) => {
    let removed = 0;
    const [tp, tm] = [
      targetRealModelId.slice(0, targetRealModelId.indexOf("/")),
      targetRealModelId.slice(targetRealModelId.indexOf("/") + 1)
    ];
    for (const row of ctx.db.logicalModel.list()) {
      const parsed = parseDbMembers(row.members);
      const kept = parsed.filter((m) => !(m.provider === tp && m.model === tm));
      if (kept.length === parsed.length) continue;
      ctx.db.logicalModel.update({
        name: row.name,
        members: JSON.stringify(kept)
      });
      removed += parsed.length - kept.length;
    }
    return removed;
  };
  const chd = createChannelsDomain(ctx, {
    realModelMap,
    modelViewOf,
    stripMemberFromLogicalModels: stripMemberFromLogicalModels2
  });
  const snn = createSensenovaDomain(ctx, {
    lastStatsDay,
    realModelMap,
    modelViewOf,
    mergedChannelModels: chd.mergedChannelModels,
    chCatalogCache: chd.chCatalogCache,
    chCatalogGate: chd.chCatalogGate,
    chAwaitCatalog: chd.chAwaitCatalog,
    mergeCatalog: chd.mergeCatalog,
    syncSensenovaPool: deps.syncSensenovaPool
  });
  const od = createOverviewDomain(ctx, { realModelMap });
  const qd = createQoderDomain(ctx);
  const md = createModelsDomain(ctx, {
    realModelMap,
    modelViewOf,
    stripMemberFromLogicalModels: stripMemberFromLogicalModels2,
    lastStatsDay,
    accountsWithKeySync: chd.accountsWithKeySync,
    accountsWithKey: chd.accountsWithKey
  });
  const panel = {
    // ── 总览 ───────────────────────────────────────────────────────────────
    ...chd.methods,
    ...snn.methods,
    ...md.methods,
    ...od.methods,
    ...qd.methods
    // ── 用量 ───────────────────────────────────────────────────────────────
    // ── 逻辑模型 ───────────────────────────────────────────────────────────
    // ⚠️ 逻辑模型唯一真源 = db.logical_model(用户指示:删除后必须从页面消失、
    // 调度必须跟着 db 走,providers.json 的 logicalModels 段只作空库首启播种)。
    // ── 模型总览(部署) ──────────────────────────────────────────────────────
    // ── 供应商(其他供应商) ──────────────────────────────────────────────────
    // ── 设置 ────────────────────────────────────────────────────────────────
    // ── 请求日志 ────────────────────────────────────────────────────────────
    // ── 旧兼容方法 ──────────────────────────────────────────────────────────
  };
  return { panel, snRepairKey: snn.snRepairKey };
}
function dispatchPanel(panel, method, args) {
  const a = args ?? [];
  switch (method) {
    // 总览
    case "getStatus":
      return panel.getStatus();
    case "getRuntime":
      return panel.getRuntime();
    // 网关运维:重启入口只在托盘菜单,面板不暴露(用户定案 m03639)
    // case "restartGateway": return panel.restartGateway();
    // 用量
    case "getUsageHistory":
      return panel.getUsageHistory(
        String(a[0] ?? "all"),
        String(a[1] ?? "day"),
        String(a[2] ?? "model")
      );
    // 逻辑模型
    case "getLogicalModels":
      return panel.getLogicalModels();
    case "writeLogicalModel":
      return panel.writeLogicalModel(a[0] ?? {});
    case "removeLogicalModel":
      return panel.removeLogicalModel(String(a[0] ?? ""));
    // 模型总览(部署)
    case "getDeployments":
      return panel.getDeployments();
    case "setDeploymentExposure":
      return panel.setDeploymentExposure(
        String(a[0] ?? ""),
        String(a[1] ?? "all"),
        Boolean(a[2]),
        a[3] == null ? void 0 : Number(a[3])
      );
    // 供应商(其他供应商)
    case "getModelProviders":
      return panel.getModelProviders();
    case "upsertModelProvider":
      return panel.upsertModelProvider(
        String(a[0] ?? ""),
        a[1] === void 0 || a[1] === null ? null : String(a[1]),
        String(a[2] ?? "openai"),
        a[3] === void 0 || a[3] === null ? void 0 : String(a[3]),
        Array.isArray(a[4]) ? a[4].map((v) => String(v ?? "")) : void 0
      );
    case "removeModelProvider":
      return panel.removeModelProvider(String(a[0] ?? ""));
    case "fetchModels":
      return panel.fetchModels(
        String(a[0] ?? ""),
        a[1] === void 0 ? void 0 : Boolean(a[1]),
        a[2] ?? null
      );
    case "setModelExposure":
      return panel.setModelExposure(String(a[0] ?? ""), String(a[1] ?? ""), Boolean(a[2]));
    case "checkModels":
      return panel.checkModels(a[0] === void 0 ? void 0 : String(a[0]));
    case "getMetrics":
      return panel.getMetrics(a[0] === void 0 ? void 0 : Number(a[0]));
    case "checkModel":
      return panel.checkModel(String(a[0] ?? ""), String(a[1] ?? ""));
    case "getSensenovaAccounts":
      return panel.getSensenovaAccounts();
    case "getQuota":
      return panel.getQuota();
    // 渠道页(Trae / WorkBuddy)
    case "getProviderPage":
      return panel.getProviderPage(String(a[0] ?? ""), a[1] === void 0 ? void 0 : Boolean(a[1]));
    case "getChannelAccounts":
      return panel.getChannelAccounts(String(a[0] ?? ""));
    case "checkinStatus":
      return panel.checkinStatus(String(a[0] ?? ""));
    case "checkinClaim":
      return panel.checkinClaim(
        String(a[0] ?? ""),
        Boolean(a[1]),
        a[2] === void 0 ? void 0 : Number(a[2])
      );
    case "refreshStatus":
      return panel.refreshStatus(String(a[0] ?? ""));
    case "refreshRun":
      return panel.refreshRun(
        String(a[0] ?? ""),
        Boolean(a[1]),
        a[2] === void 0 ? void 0 : Number(a[2])
      );
    case "syncChannel":
      return panel.syncChannel(String(a[0] ?? ""), a[1] === void 0 ? void 0 : Boolean(a[1]));
    case "setChannelModels":
      return panel.setChannelModels(
        String(a[0] ?? ""),
        Array.isArray(a[1]) ? a[1] : []
      );
    // 单行实时保存(用户 2026-10-31 定案:四页删掉保存按钮,改成就地落库)
    case "setChannelModel":
      return panel.setChannelModel(String(a[0] ?? ""), a[1] ?? {});
    // 客户端路径
    case "getClientPaths":
      return panel.getClientPaths();
    case "saveClientPath":
      return panel.saveClientPath(String(a[0] ?? ""), String(a[1] ?? ""));
    case "detectClientPath":
      return panel.detectClientPath(String(a[0] ?? ""));
    case "discoverChannelAccounts":
      return panel.discoverChannelAccounts(String(a[0] ?? ""));
    case "adoptChannelAccount":
      return panel.adoptChannelAccount(
        String(a[0] ?? ""),
        String(a[1] ?? ""),
        String(a[2] ?? ""),
        a[3] === void 0 ? void 0 : String(a[3])
      );
    // 设置
    case "getSettings":
      return panel.getSettings();
    case "saveSettings":
      return panel.saveSettings(a[0] ?? {});
    // 请求日志
    case "getRequestLog":
      return panel.getRequestLog();
    case "setRequestLog":
      return panel.setRequestLog(a[0] ?? {});
    // SenseNova
    case "getSensenovaStatus":
      return panel.getSensenovaStatus();
    case "getSensenovaModels":
      return panel.getSensenovaModels();
    case "setSensenovaExposure":
      return panel.setSensenovaExposure(String(a[0] ?? ""), String(a[1] ?? ""), Boolean(a[2]));
    case "sensenovaRefresh":
      return panel.sensenovaRefresh(a[0] === void 0 ? void 0 : Boolean(a[0]));
    case "sensenovaLogin":
      return panel.sensenovaLogin(
        String(a[0] ?? ""),
        a[1] === null ? null : String(a[1] ?? ""),
        String(a[2] ?? ""),
        a[3] === void 0 ? true : Boolean(a[3])
      );
    case "sensenovaSavePassword":
      return panel.sensenovaSavePassword(String(a[0] ?? ""), String(a[1] ?? ""), String(a[2] ?? ""));
    case "sensenovaRefetchKey":
      return panel.sensenovaRefetchKey(String(a[0] ?? ""));
    case "sensenovaAddAccount":
      return panel.sensenovaAddAccount(
        String(a[0] ?? ""),
        a[1] === void 0 ? void 0 : String(a[1]),
        a[2] === void 0 ? void 0 : String(a[2])
      );
    case "sensenovaRemoveAccount":
      return panel.sensenovaRemoveAccount(String(a[0] ?? ""));
    // Qoder(cosy 协议,双区域)。region 一律先过字符串化,未知区域由域内拒绝。
    case "getQoderAccounts":
      return panel.getQoderAccounts();
    case "getQoderStatus":
      return panel.getQoderStatus();
    case "getQoderModels":
      return panel.getQoderModels(a[0] === void 0 || a[0] === null ? void 0 : String(a[0]));
    case "qoderRefreshCatalog":
      return panel.qoderRefreshCatalog(a[0] === void 0 || a[0] === null ? void 0 : String(a[0]));
    case "qoderSetModelEnabled":
      return panel.qoderSetModelEnabled(String(a[0] ?? ""), String(a[1] ?? ""), Boolean(a[2]));
    case "qoderCredits":
      return panel.qoderCredits(String(a[0] ?? ""), a[1] === void 0 || a[1] === null ? void 0 : String(a[1]));
    case "qoderCheckin":
      return panel.qoderCheckin(String(a[0] ?? ""), a[1] === void 0 || a[1] === null ? void 0 : String(a[1]));
    case "qoderCampaigns":
      return panel.qoderCampaigns(String(a[0] ?? ""), a[1] === void 0 || a[1] === null ? void 0 : String(a[1]));
    case "qoderAddAccount":
      return panel.qoderAddAccount(String(a[0] ?? ""), String(a[1] ?? ""), String(a[2] ?? ""));
    case "qoderRemoveAccount":
      return panel.qoderRemoveAccount(String(a[0] ?? ""), String(a[1] ?? ""));
    case "qoderSetAccountEnabled":
      return panel.qoderSetAccountEnabled(String(a[0] ?? ""), String(a[1] ?? ""), Boolean(a[2]));
    case "qoderProbeChat":
      return panel.qoderProbeChat(String(a[0] ?? ""), a[1] === void 0 || a[1] === null ? void 0 : String(a[1]));
    case "qoderRecentErrors":
      return panel.qoderRecentErrors();
    // 数据目录
    case "getDataDir":
      return panel.getDataDir();
    // 旧兼容(保留,防止旧调用点炸)
    case "listProviders":
      return panel.listProviders();
    case "setAccountEnabled":
      return panel.setAccountEnabled(String(a[0] ?? ""), Number(a[1]), Boolean(a[2]));
    case "getRecentRequests":
      return panel.getRecentRequests(a[0] === void 0 ? void 0 : Number(a[0]));
    case "getRequestLogStatus":
      return panel.getRequestLogStatus();
    case "getUsageSummary":
      return panel.getUsageSummary();
    default:
      return Promise.resolve({ ok: false, message: "\u672A\u77E5\u9762\u677F\u65B9\u6CD5" });
  }
}

// src/repo.ts
function intOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}
var AppSchedulerRepo = class {
  constructor(db, registry, env2) {
    this.db = db;
    this.registry = registry;
    this.env = env2;
  }
  db;
  registry;
  env;
  // ── SettingsRepo ────────────────────────────────────────────────────────
  getSetting(key3) {
    const row = this.db.setting.get(key3);
    return row ? row.v : null;
  }
  setSetting(key3, value) {
    this.db.setting.set(key3, value);
  }
  settings() {
    const out = {};
    for (const row of this.db.raw.prepare("SELECT k, v FROM setting WHERE v IS NOT NULL").all()) {
      out[row.k] = row.v;
    }
    return out;
  }
  // ── SchedulerRepo ───────────────────────────────────────────────────────
  logicalModelRow(name2) {
    const lm = this.registry.getLogicalModel(name2);
    if (!lm) return null;
    return {
      name: lm.name,
      strategy: lm.strategy,
      members: lm.members
    };
  }
  membersOf(name2) {
    const lm = this.registry.getLogicalModel(name2);
    return lm ? lm.members : null;
  }
  endpointChain(name2) {
    const members = this.registry.membersOf(name2);
    if (!members || members.length === 0) return [];
    const rows = [];
    for (const member of members) {
      rows.push(...this.#rowsFor(member.provider, member.model, member));
    }
    return rows;
  }
  directChain(name2) {
    const pair = splitModelId2(name2);
    if (!pair) return [];
    return this.#rowsFor(pair[0], pair[1], null);
  }
  quotas() {
    try {
      return this.env.quotaSnapshot?.() ?? {};
    } catch {
      return {};
    }
  }
  // ── 私有 ────────────────────────────────────────────────────────────────
  /** 成员×启用账户展开成 RawEndpointRow(凭据序 = listAccounts 返回序)。 */
  #rowsFor(provider, model, member) {
    const pdef = this.registry.getProvider(provider);
    const rdef = this.registry.getRealModel(provider, model);
    if (!pdef || !rdef) return [];
    const dbRow = this.db.realModel.get(provider, model);
    const concurrency = dbRow && dbRow.concurrency > 0 ? dbRow.concurrency : intOr(rdef.concurrency, 1);
    const supportsVision = dbRow?.supports_vision ?? rdef.supportsVision;
    const maxInputTokens = dbRow?.max_input_tokens ?? intOr(rdef.maxInputTokens, 0);
    const maxOutputTokens = dbRow?.max_output_tokens ?? intOr(rdef.maxOutputTokens, 0);
    const rows = [];
    for (const account of this.registry.listAccounts(provider)) {
      const credentialRef = account.credentialRef;
      if (!this.env.hasSecret(credentialRef) || !this.env.isAccountEnabled(credentialRef)) continue;
      const username = credentialRef.slice(provider.length + 1);
      if (!username) continue;
      const endpoint = {
        endpoint_id: endpointIdOf(provider, model, username),
        provider,
        provider_id: provider,
        model,
        upstream_id: model,
        credential_key: [provider, username],
        username,
        account_id: username,
        protocol: pdef.protocol,
        base_url: pdef.baseUrl ?? "",
        region: "",
        concurrency,
        supports_vision: supportsVision ? 1 : 0,
        max_input_tokens: maxInputTokens,
        max_output_tokens: maxOutputTokens,
        cooldown_until: 0
      };
      if (member) {
        rows.push({ member, real_model_id: `${provider}/${model}`, endpoint });
      } else {
        rows.push(endpoint);
      }
    }
    return rows;
  }
};

// ../core/src/gateway/server.ts
import { createServer } from "node:http";

// ../core/src/gateway/sse.ts
var SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no",
  // 流式响应没有已知长度;node:http 会自动走 chunked。禁 keep-alive 复用由 server 层决定。
  Connection: "keep-alive"
};
function ssePackChunk(chunk) {
  return sseFrame(`data: ${JSON.stringify(chunk)}`);
}
function ssePackDone() {
  return sseFrame("data: [DONE]");
}
function sseFrame(payload) {
  return Buffer.from(`${payload}

`, "utf-8");
}
function clientDisconnectSignal(req, res, external) {
  const controller = new AbortController();
  let settled = false;
  const fire = () => {
    if (settled) return;
    settled = true;
    controller.abort(new Error("client disconnected"));
  };
  if (req.aborted) {
    fire();
    return controller.signal;
  }
  req.once("aborted", fire);
  res?.once("close", () => {
    if (!res.writableEnded) fire();
  });
  if (external) {
    if (external.aborted) {
      fire();
    } else {
      const onAbort = () => fire();
      external.addEventListener("abort", onAbort, { once: true });
      controller.signal.addEventListener("abort", () => {
        external.removeEventListener("abort", onAbort);
      }, { once: true });
    }
  }
  return controller.signal;
}

// ../core/src/gateway/request-fields.ts
var CONSUMED_FIELDS = ["session_id", "prompt_cache_key"];
var CACHE_ROUTING_KEY_FIELD = "prompt_cache_key";
var FORWARDED_FIELDS = [
  "model",
  "messages",
  "stream",
  "temperature",
  "top_p",
  "max_tokens",
  // OpenAI 的同义字段(`max_tokens` 的新名字),网关一起收。
  "max_completion_tokens",
  "stop",
  "tools",
  "tool_choice",
  // 思考强度:只原样透传,网关不解释、不改写。
  "reasoning_effort",
  // camelCase 别名(部分 SDK 这么发)—— 归一到 `reasoning_effort`。
  "reasoningEffort",
  "stream_options",
  "user",
  "n",
  "presence_penalty",
  "frequency_penalty",
  "logprobs",
  "top_logprobs",
  "response_format",
  "seed",
  "metadata",
  "parallel_tool_calls",
  "logit_bias",
  "chat_template_kwargs"
];
var KNOWN_FIELDS = /* @__PURE__ */ new Set([
  ...FORWARDED_FIELDS,
  ...CONSUMED_FIELDS
]);
function classifyRequestFields(body) {
  const forwarded = [];
  const consumed = [];
  const discarded = [];
  if (body === null || typeof body !== "object") {
    return { forwarded, consumed, discarded };
  }
  for (const key3 of Object.keys(body)) {
    if (CONSUMED_FIELDS.includes(key3)) {
      consumed.push(key3);
    } else if (FORWARDED_FIELDS.includes(key3)) {
      forwarded.push(key3);
    } else {
      discarded.push(key3);
    }
  }
  return { forwarded, consumed, discarded };
}
function cacheRoutingKeyOf(body) {
  if (body === null || typeof body !== "object") return void 0;
  const raw = body[CACHE_ROUTING_KEY_FIELD];
  return typeof raw === "string" && raw.length > 0 ? raw : void 0;
}
function reasoningEffortOf(body) {
  if (body === null || typeof body !== "object") return void 0;
  const rec = body;
  const primary = rec["reasoning_effort"];
  if (typeof primary === "string" && primary.length > 0) return primary;
  const alias = rec["reasoningEffort"];
  if (typeof alias === "string" && alias.length > 0) return alias;
  return void 0;
}

// ../core/src/gateway/server.ts
var BUSY_DETAIL = "\u5E76\u53D1\u5DF2\u6EE1:\u8BE5\u6A21\u578B\u5F53\u524D\u6240\u6709\u6863\u4F4D\u7684\u5E76\u53D1\u4E0A\u9650\u90FD\u5DF2\u5360\u6EE1,\u8BF7\u7A0D\u540E\u91CD\u8BD5";
var REQUEST_LEVEL_KINDS = /* @__PURE__ */ new Set([
  UpstreamErrorKind2.BadRequest,
  UpstreamErrorKind2.AuthChallenge
]);
var GatewayHttpError = class extends Error {
  constructor(status, body, headers, rawBody) {
    super(JSON.stringify(body));
    this.status = status;
    this.body = body;
    this.headers = headers;
    this.rawBody = rawBody;
    this.name = "GatewayHttpError";
  }
  status;
  body;
  headers;
  rawBody;
};
function upstreamErrorToHttp(exc) {
  const headers = {};
  if (exc.retryAfter !== void 0) {
    headers["Retry-After"] = String(Math.max(1, Math.floor(exc.retryAfter)));
  }
  const raw = exc.raw;
  if (raw !== void 0) {
    const status = Number.isFinite(raw.status) && raw.status >= 400 ? raw.status : exc.httpStatus;
    const body = raw.json !== void 0 ? raw.json : { detail: raw.text };
    if (raw.contentType !== void 0 && !raw.contentType.startsWith("application/json")) {
      headers["Content-Type"] = raw.contentType;
    }
    return new GatewayHttpError(
      status,
      body,
      Object.keys(headers).length > 0 ? headers : void 0,
      raw.text
    );
  }
  return new GatewayHttpError(
    exc.httpStatus,
    { detail: { error: { type: exc.kind, message: exc.detail } } },
    Object.keys(headers).length > 0 ? headers : void 0
  );
}
function allBusyError() {
  return new GatewayHttpError(503, {
    detail: { error: { type: "capacity", message: BUSY_DETAIL } }
  });
}
async function forwardStream(res, upstream, req, signal, onStreamResult) {
  const t0 = Date.now();
  let firstChunkMs;
  let usage;
  let headSent = false;
  const iterator = upstream.stream(req)[Symbol.asyncIterator]();
  try {
    for (; ; ) {
      if (signal.aborted) {
        onStreamResult?.("client_disconnected", usage, firstChunkMs, Date.now() - t0);
        return;
      }
      const next = await iterator.next();
      if (next.done) break;
      if (!headSent) {
        headSent = true;
        firstChunkMs = Date.now() - t0;
        res.writeHead(200, SSE_RESPONSE_HEADERS);
      }
      const chunk = next.value;
      if (chunk && typeof chunk === "object" && "usage" in chunk && chunk.usage) {
        usage = chunk.usage;
      }
      res.write(ssePackChunk(chunk));
    }
    if (!headSent) {
      res.writeHead(200, SSE_RESPONSE_HEADERS);
    }
    res.write(ssePackDone());
    res.end();
    onStreamResult?.("ok", usage, firstChunkMs, Date.now() - t0);
  } catch (exc) {
    if (signal.aborted) {
      onStreamResult?.("client_disconnected", usage, firstChunkMs, Date.now() - t0);
      return;
    }
    if (headSent) {
      onStreamResult?.("failed_after_start", usage, firstChunkMs, Date.now() - t0);
      try {
        res.end();
      } catch {
      }
      return;
    }
    try {
      await iterator.return?.();
    } catch {
    }
    throw exc;
  }
}

// ../core/src/connectors/stream-aggregate.ts
function normalizeUsageInts(usage) {
  const out = {
    prompt_tokens: toIntOrZero(usage?.prompt_tokens),
    completion_tokens: toIntOrZero(usage?.completion_tokens),
    total_tokens: toIntOrZero(usage?.total_tokens)
  };
  const completionDetails = usage?.completion_tokens_details;
  if (isMapping(completionDetails) && Object.keys(completionDetails).length > 0) {
    out.completion_tokens_details = normalizeDetails(completionDetails);
  }
  const promptDetails = usage?.prompt_tokens_details;
  if (isMapping(promptDetails) && Object.keys(promptDetails).length > 0) {
    out.prompt_tokens_details = normalizeDetails(promptDetails);
  }
  return out;
}
function toIntOrZero(v) {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}
function isMapping(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function normalizeDetails(details) {
  const out = {};
  for (const [k, v] of Object.entries(details)) {
    out[k] = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : v;
  }
  return out;
}
function mergeToolCall(acc, order, raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
  const r = raw;
  const idx = typeof r.index === "number" && Number.isInteger(r.index) ? r.index : 0;
  let slot = acc.get(idx);
  if (!slot) {
    slot = { id: null, type: "function", function: { name: "", arguments: "" } };
    acc.set(idx, slot);
    order.push(idx);
  }
  if (typeof r.id === "string" && r.id !== "" && slot.id === null) {
    slot.id = r.id;
  }
  const fn = r.function;
  if (typeof fn === "object" && fn !== null && !Array.isArray(fn)) {
    const f = fn;
    if (typeof f.name === "string" && f.name !== "" && slot.function.name === "") {
      slot.function.name = f.name;
    }
    if (typeof f.arguments === "string" && f.arguments !== "") {
      slot.function.arguments += f.arguments;
    }
  }
}
async function aggregateCompletion(chunks, options) {
  const { model, completionId, created } = options;
  const textParts = [];
  const reasoningParts = [];
  const toolCalls = /* @__PURE__ */ new Map();
  const order = [];
  let finishReason = null;
  let usage = null;
  for await (const chunk of chunks) {
    if (chunk.usage && typeof chunk.usage === "object") {
      usage = normalizeUsageInts(chunk.usage);
    }
    const choices = chunk.choices ?? [];
    if (choices.length === 0) continue;
    const choice = choices[0];
    if (typeof choice.finish_reason === "string" && choice.finish_reason !== "") {
      finishReason = choice.finish_reason;
    }
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content !== "") {
      textParts.push(delta.content);
    }
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content !== "") {
      reasoningParts.push(delta.reasoning_content);
    }
    for (const tc of delta.tool_calls ?? []) {
      mergeToolCall(toolCalls, order, tc);
    }
  }
  const message = {
    role: "assistant",
    content: textParts.join("") || null
  };
  if (reasoningParts.length > 0) {
    message.reasoning_content = reasoningParts.join("");
  }
  if (toolCalls.size > 0) {
    const suffix = completionId.replace(/^chatcmpl-/, "").slice(0, 8);
    message.tool_calls = order.map((i, n) => {
      const merged = toolCalls.get(i);
      return {
        id: merged.id ?? `call_${suffix}_${n}`,
        type: "function",
        function: merged.function
      };
    });
  }
  return {
    id: completionId,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason ?? (toolCalls.size > 0 ? "tool_calls" : "stop")
      }
    ],
    usage: usage ?? void 0
  };
}

// ../core/src/gateway/image-bridge.ts
import { createHash as createHash8 } from "node:crypto";
var FREE_PARSE_MODEL = "free";
var FREE_PARSE_PROMPT = "\u4F60\u662F\u56FE\u50CF\u8BC1\u636E\u8F6C\u5199\u5668\u3002\u53EA\u505A\u4E00\u4EF6\u4E8B:\u628A\u8FD9\u5F20\u56FE\u91CC**\u80FD\u76F4\u63A5\u770B\u5230**\u7684\u4FE1\u606F\u8F6C\u6210\u6587\u5B57\u8BC1\u636E\u3002\u4E0D\u63A8\u7406\u3001\u4E0D\u8054\u60F3\u3001\u4E0D\u8865\u5168,\u4E0D\u8981\u5199\u56FE\u4E2D\u6CA1\u6709\u7684\u4E1C\u897F\u3002\n\u6309\u4E0B\u9762\u7684\u987A\u5E8F\u8F93\u51FA,\u6CA1\u6709\u5185\u5BB9\u7684\u6BB5\u6574\u6BB5\u7701\u7565:\n\u3010\u6587\u5B57\u3011\u9010\u5B57\u8F6C\u5199\u56FE\u4E2D\u6240\u6709\u53EF\u89C1\u6587\u5B57,\u4FDD\u7559\u539F\u6709\u6362\u884C\u4E0E\u5C42\u7EA7;\u8868\u683C\u6309\u884C\u5217\u5199,\u4E0D\u8981\u6982\u62EC\u3002\n\u3010\u7248\u9762\u3011\u8FD9\u5F20\u56FE\u662F\u4EC0\u4E48\u5F62\u6001(\u622A\u56FE/\u7167\u7247/\u56FE\u8868/\u8868\u683C/\u4EE3\u7801/\u754C\u9762\u2026),\u5173\u952E\u533A\u57DF\u5728\u54EA\u3001\u9605\u8BFB\u987A\u5E8F\u5982\u4F55\u3002\n\u3010\u8981\u7D20\u3011\u56FE\u4E2D\u51FA\u73B0\u7684\u5B9E\u4F53\u4E0E\u5177\u4F53\u503C:\u578B\u53F7\u3001\u7F16\u53F7\u3001\u65E5\u671F\u3001\u91D1\u989D\u3001\u53C2\u6570\u3001\u5B57\u6BB5\u540D\u3001\u6309\u94AE\u540D\u3002\n\u3010\u4E0D\u786E\u5B9A\u3011\u770B\u4E0D\u6E05 / \u88AB\u622A\u65AD / \u65E0\u6CD5\u8FA8\u8BA4\u7684\u90E8\u5206,\u5199\u6E05\u5B83\u5927\u6982\u5728\u54EA\u4E2A\u4F4D\u7F6E\u3002\n\u5982\u679C\u56FE\u7247\u635F\u574F\u3001\u7A7A\u767D\u3001\u8FC7\u4E8E\u6A21\u7CCA\u6216\u6587\u5B57\u5B8C\u5168\u65E0\u6CD5\u8FA8\u8BA4,\u53EA\u56DE\u590D\u56DB\u4E2A\u5B57:\u65E0\u6CD5\u89E3\u6790\n\u53EA\u8F93\u51FA\u4E0A\u9762\u7684\u5185\u5BB9\u672C\u8EAB:\u4E0D\u8981\u89E3\u91CA\u4F60\u7684\u8FC7\u7A0B,\u4E0D\u8981\u7528 markdown \u4EE3\u7801\u5757\u5305\u88F9\u3002";
var FREE_PARSE_UNPARSED = "\u65E0\u6CD5\u89E3\u6790";
var FREE_PARSE_MAX_IMAGES = 8;
var IMAGE_HARD_LIMIT = 50;
var IMAGE_PARSED_TEMPLATE = "[\u56FE\u7247 {seq}/{total} \u89E3\u6790] {text}";
var IMAGE_UNPARSED_TEMPLATE = "[\u56FE\u7247 {seq}/{total} \u65E0\u6CD5\u89E3\u6790:{reason}] \u8FD9\u5F20\u56FE\u6CA1\u6709\u88AB\u8F6C\u5199\u6210\u6587\u5B57;\u4E0D\u8981\u731C\u6D4B\u56FE\u4E2D\u5185\u5BB9\u3002";
var IMAGE_MAX_PASSTHROUGH = 20;
var IMAGE_DROPPED_NOTE = "\u3010\u7F51\u5173\u3011\u672C\u6B21\u8BF7\u6C42\u643A\u5E26\u7684\u56FE\u7247\u6570\u8D85\u8FC7\u4E0A\u9650,\u5DF2\u4E22\u5F03\u6700\u65E9\u7684 {dropped} \u5F20\u5386\u53F2\u56FE\u7247,\u4EC5\u4FDD\u7559\u6700\u8FD1 {kept} \u5F20;\u82E5\u9700\u8981\u66F4\u65E9\u7684\u56FE\u7247\u5185\u5BB9,\u8BF7\u5355\u72EC\u53D1\u9001\u6216\u6539\u7528\u652F\u6301\u957F\u4E0A\u4E0B\u6587\u7684\u6A21\u578B\u3002";
var IMAGE_HISTORY_EMPTY_MARK = "\u3010\u7F51\u5173\u3011\u5386\u53F2\u56FE\u7247\u5DF2\u7701\u7565\u3002";
var IMAGE_BRIDGE_NOTE = "\n\n\u3010\u56FE\u50CF\u6865\u3011\u672C\u8BF7\u6C42\u91CC\u7684\u56FE\u7247\u5DF2\u7531\u56FE\u50CF\u6865\u8F6C\u5199\u6210\u6587\u5B57(\u89C1 [\u56FE\u7247\u89E3\u6790] / [\u56FE\u7247\u65E0\u6CD5\u89E3\u6790] \u6807\u8BB0,\u539F\u6587\u4E0D\u5728\u4E0A\u4E0B\u6587\u4E2D)\u3002\u82E5\u6807\u8BB0\u4E3A\u65E0\u6CD5\u89E3\u6790\u3001\u6216\u8F6C\u5199\u5185\u5BB9\u4E0D\u8DB3\u4EE5\u56DE\u7B54,\u8BF7\u76F4\u63A5\u8981\u6C42\u7528\u6237\u8865\u5145\u8BF4\u660E,\u6216\u5EFA\u8BAE\u6539\u7528\u652F\u6301\u539F\u751F\u56FE\u50CF\u7684\u6A21\u578B;\u4E0D\u8981\u731C\u6D4B\u56FE\u4E2D\u5185\u5BB9,\u4E5F\u4E0D\u8981\u8981\u6C42\u91CD\u590D\u89E3\u6790\u3002";
var PARSE_CACHE_MAX = 128;
var CACHE_OK = "ok\0";
var CACHE_FAIL = "fail\0";
var parseCache = /* @__PURE__ */ new Map();
function parseCacheGet(key3) {
  const value = parseCache.get(key3);
  if (value !== void 0) {
    parseCache.delete(key3);
    parseCache.set(key3, value);
  }
  return value ?? null;
}
function parseCacheSet(key3, value) {
  if (parseCache.has(key3)) parseCache.delete(key3);
  parseCache.set(key3, value);
  while (parseCache.size > PARSE_CACHE_MAX) {
    const oldest = parseCache.keys().next();
    if (oldest.done) break;
    parseCache.delete(oldest.value);
  }
}
function okValue(text) {
  return CACHE_OK + text;
}
function failValue(reason) {
  return CACHE_FAIL + reason;
}
function imagePartIndices(messages) {
  const found = [];
  messages.forEach((msg, mi) => {
    const content = msg?.content;
    if (!Array.isArray(content)) return;
    content.forEach((part, pi) => {
      if (part === null || typeof part !== "object") return;
      const type = part.type;
      if (type === "image_url" || type === "image") found.push([mi, pi]);
    });
  });
  return found;
}
function lastUserMessage(messages) {
  for (let mi = messages.length - 1; mi >= 0; mi -= 1) {
    const msg = messages[mi];
    if (msg !== null && typeof msg === "object" && msg.role === "user") return mi;
  }
  return null;
}
function parseCacheKey(imagePart) {
  const p = imagePart;
  let url;
  if (p.type === "image_url") {
    const inner = p.image_url;
    url = inner !== null && typeof inner === "object" ? inner.url : void 0;
  } else if (p.type === "image") {
    url = p.url;
    if (typeof url !== "string") {
      const inner = p.image_url;
      if (inner !== null && typeof inner === "object") {
        url = inner.url;
      } else if (typeof inner === "string") {
        url = inner;
      }
    }
  } else {
    return null;
  }
  if (typeof url !== "string") return null;
  const canonical = url.trim();
  if (canonical === "") return null;
  return createHash8("sha256").update(`v3|${FREE_PARSE_MODEL}|${canonical}`, "utf-8").digest("hex");
}
function imageReplacement(seq, total, value) {
  if (value.startsWith(CACHE_OK)) {
    return IMAGE_PARSED_TEMPLATE.replace("{seq}", String(seq)).replace("{total}", String(total)).replace("{text}", value.slice(CACHE_OK.length));
  }
  const reason = value.startsWith(CACHE_FAIL) ? value.slice(CACHE_FAIL.length) : value;
  return IMAGE_UNPARSED_TEMPLATE.replace("{seq}", String(seq)).replace("{total}", String(total)).replace("{reason}", reason);
}
function dropExcessImages(messages, keep = IMAGE_MAX_PASSTHROUGH) {
  const images = imagePartIndices(messages);
  const dropped = images.length - keep;
  if (dropped <= 0) return [messages, 0];
  const doomed = new Set(images.slice(0, dropped).map(([mi, pi]) => `${mi}:${pi}`));
  const newMessages = deepCopyMessages(messages);
  const sorted = [...images].reverse();
  for (const [mi, pi] of sorted) {
    if (!doomed.has(`${mi}:${pi}`)) continue;
    const content = newMessages[mi]?.content;
    if (!Array.isArray(content)) continue;
    content.splice(pi, 1);
    if (!content.some((p) => p !== null && typeof p === "object" && p.type === "text")) {
      content.push({ type: "text", text: "\u3010\u7F51\u5173\u3011\u8FD9\u6761\u6D88\u606F\u539F\u672C\u53EA\u6709\u56FE\u7247,\u5DF2\u6309\u4E0A\u9650\u4E22\u5F03\u3002" });
    }
  }
  const note = IMAGE_DROPPED_NOTE.replace("{dropped}", String(dropped)).replace("{kept}", String(images.length - dropped));
  const tail = newMessages[newMessages.length - 1];
  if (tail !== void 0) {
    const content = tail.content;
    if (Array.isArray(content)) {
      content.push({ type: "text", text: note });
    } else if (typeof content === "string") {
      tail.content = content + "\n\n" + note;
    } else {
      tail.content = note;
    }
  }
  return [newMessages, dropped];
}
function deepCopyMessages(messages) {
  return messages.map((m) => ({
    ...m,
    content: Array.isArray(m.content) ? m.content.map((p) => ({ ...p })) : m.content
  }));
}
async function tryParseImages(messages, opts) {
  const images = imagePartIndices(messages);
  const result = {
    replaced: 0,
    cacheHits: 0,
    unparsed: 0,
    droppedHistory: 0,
    parsedNow: 0
  };
  if (images.length === 0) return { messages, result };
  const allowNative = opts.chainHasVision && opts.hardOverflow !== true;
  const maxImages = opts.maxImages ?? FREE_PARSE_MAX_IMAGES;
  const newMessages = deepCopyMessages(messages);
  const totals = /* @__PURE__ */ new Map();
  for (const [mi] of images) totals.set(mi, (totals.get(mi) ?? 0) + 1);
  const seen = /* @__PURE__ */ new Map();
  const shift = /* @__PURE__ */ new Map();
  const currentMi = lastUserMessage(messages);
  let notePlaced = false;
  const place = (mi, pi, seq, total, value) => {
    const suffix = notePlaced ? "" : IMAGE_BRIDGE_NOTE;
    notePlaced = true;
    const content = newMessages[mi]?.content;
    if (!Array.isArray(content)) return;
    const text = imageReplacement(seq, total, value);
    content[pi] = { type: "text", text: text + suffix };
    result.replaced += 1;
  };
  const dropHistoryImage = (mi, pi) => {
    const content = newMessages[mi]?.content;
    if (!Array.isArray(content)) return;
    content.splice(pi, 1);
    result.droppedHistory += 1;
    if (!content.some((p) => p !== null && typeof p === "object" && p.type === "text")) {
      content.push({ type: "text", text: IMAGE_HISTORY_EMPTY_MARK });
    }
  };
  for (const [mi, rawPi] of images) {
    seen.set(mi, (seen.get(mi) ?? 0) + 1);
    const seq = seen.get(mi);
    const total = totals.get(mi);
    const pi = rawPi - (shift.get(mi) ?? 0);
    const content = newMessages[mi]?.content;
    if (!Array.isArray(content)) continue;
    const part = content[pi];
    if (part === void 0) continue;
    const key3 = parseCacheKey(part);
    if (key3 !== null) {
      const cached = parseCacheGet(key3);
      if (cached !== null) {
        place(mi, pi, seq, total, cached);
        result.cacheHits += 1;
        continue;
      }
    }
    if (mi !== currentMi) {
      if (!allowNative) {
        dropHistoryImage(mi, pi);
        shift.set(mi, (shift.get(mi) ?? 0) + 1);
      }
      continue;
    }
    if (result.parsedNow >= maxImages) {
      if (allowNative) continue;
      place(mi, pi, seq, total, failValue("\u8D85\u51FA\u5355\u8BF7\u6C42\u89E3\u6790\u914D\u989D"));
      result.unparsed += 1;
      continue;
    }
    const text = await opts.parseOne(part);
    result.parsedNow += 1;
    if (text === null) {
      if (allowNative) continue;
      place(mi, pi, seq, total, failValue("\u89E3\u6790\u8BF7\u6C42\u5931\u8D25"));
      result.unparsed += 1;
      continue;
    }
    const trimmed = text.trim();
    if (trimmed === "") {
      if (allowNative) continue;
      place(mi, pi, seq, total, failValue("\u89E3\u6790\u7ED3\u679C\u4E3A\u7A7A"));
      result.unparsed += 1;
      continue;
    }
    if (trimmed.includes(FREE_PARSE_UNPARSED)) {
      const value2 = failValue("\u6A21\u578B\u65E0\u6CD5\u8FA8\u8BA4\u8FD9\u5F20\u56FE");
      if (key3 !== null) parseCacheSet(key3, value2);
      if (allowNative) continue;
      place(mi, pi, seq, total, value2);
      result.unparsed += 1;
      continue;
    }
    const value = okValue(trimmed);
    if (key3 !== null) parseCacheSet(key3, value);
    place(mi, pi, seq, total, value);
  }
  return { messages: newMessages, result };
}

// ../core/src/connectors/workbuddy-gate.ts
var WORKBUDDY_NEUTRAL_HEAD = "You are a helpful assistant.";
var KNOWN_CHANNEL_OPENINGS = [
  "You are an AI agent powered by DeepSeek Harness.",
  "You are Claude Code, Anthropic's official CLI for Claude."
];
var ACP_MARKER_HEAD = /^<acp\b/i;
var CHANNEL_REJECT_TIP = "\u88AB WorkBuddy \u7F51\u5173\u7684\u6E20\u9053\u6821\u9A8C\u62E6\u622A(HTTP 400 / code 11128):\u7F51\u5173\u5339\u914D\u8BF7\u6C42\u91CC\u7684 system/assistant \u63D0\u793A\u5185\u5BB9,\u4E0E\u8D26\u53F7\u3001\u79EF\u5206\u3001\u989D\u5EA6\u3001\u7F51\u7EDC\u90FD\u65E0\u5173 \u2014\u2014 \u6362\u8D26\u53F7\u6216\u6362\u533A\u57DF \u4E0D\u4F1A\u6539\u53D8\u7ED3\u679C\u3002\u82E5\u8BE5\u5185\u5BB9\u6765\u81EA\u5BBF\u4E3B\u6216\u5176\u4ED6\u63D2\u4EF6,\u8BF7\u4FEE\u6539\u5BF9\u5E94\u63D0\u793A;\u5DF2\u5BF9\u5DF2\u77E5\u7684\u7B2C\u4E09\u65B9 agent \u6307\u7EB9\u505A\u5F52\u4E00\u5316,\u65B0\u6307\u7EB9\u53EF\u53CD\u9988\u5230 issue\u3002";
function isTextPart(part) {
  return part !== null && typeof part === "object" && !Array.isArray(part) && typeof part.text === "string";
}
function eachTextOf(content) {
  if (typeof content === "string") return [content];
  if (Array.isArray(content)) {
    return content.filter(isTextPart).map((p) => p.text);
  }
  return [];
}
function withTexts(content, next) {
  if (typeof content === "string") return next(content, 0);
  if (Array.isArray(content)) {
    let i = 0;
    return content.map((part) => {
      if (isTextPart(part)) {
        const t = next(part.text, i);
        i += 1;
        return { ...part, text: t };
      }
      return part;
    });
  }
  return content;
}
function isScannedRole(role) {
  return role === "system" || role === "assistant";
}
function matchesKnownOpening(text) {
  const body = text.replace(/^\s+/, "");
  if (KNOWN_CHANNEL_OPENINGS.some((f) => body.startsWith(f))) return true;
  return ACP_MARKER_HEAD.test(body);
}
function neutralizeText(text) {
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const rest = text.slice(lead.length);
  return rest === "" ? text : `${lead}${WORKBUDDY_NEUTRAL_HEAD}

${rest}`;
}
function neutralizeChannelFingerprints(messages) {
  if (!Array.isArray(messages)) return messages;
  let changed = false;
  const out = messages.map((m) => {
    if (!m || typeof m !== "object" || Array.isArray(m)) return m;
    const msg = m;
    if (!isScannedRole(msg.role)) return m;
    const content = msg.content;
    if (typeof content === "string") {
      if (!matchesKnownOpening(content)) return m;
      changed = true;
      return { ...msg, content: neutralizeText(content) };
    }
    if (Array.isArray(content)) {
      let any = false;
      const parts = content.map((part) => {
        if (!isTextPart(part)) return part;
        const t = part.text;
        if (!matchesKnownOpening(t)) return part;
        any = true;
        return { ...part, text: neutralizeText(t) };
      });
      if (!any) return m;
      changed = true;
      return { ...msg, content: parts };
    }
    return m;
  });
  return changed ? out : messages;
}
var WORD_INTERNAL_BREAK = /([A-Z][A-Za-z0-9]*)(\s+)(?=[A-Z][A-Za-z0-9])/g;
var TAG_NAME_BREAK = /<(\/?[A-Za-z][A-Za-z0-9-]{0,40})(?=[\s/>])/g;
var TAG_ATTR_BREAK = /(\s)([a-z][a-z0-9-]{0,30})=(?=["'])/g;
function perturbText(text) {
  if (text.includes("\u200B")) return text;
  return text.replace(/([.!?])(\s+)/g, "$1\u200B$2").replace(/([。！？])/g, "$1\u200B").replace(/([,;])(\s+)/g, "$1\u200B$2").replace(WORD_INTERNAL_BREAK, "$1\u200B$2").replace(TAG_ATTR_BREAK, "$1$2\u200B=").replace(TAG_NAME_BREAK, "<$1\u200B");
}
function perturbChannelFingerprints(messages) {
  if (!Array.isArray(messages)) return messages;
  const out = messages.map((m) => {
    if (!m || typeof m !== "object" || Array.isArray(m)) return m;
    const msg = m;
    if (!isScannedRole(msg.role)) return m;
    return { ...msg, content: withTexts(msg.content, (t) => perturbText(t)) };
  });
  return out;
}
function isChannelRejectDetail(detail2) {
  return /"code"\s*:\s*11128(?!\d)/.test(detail2) || /code\s+11128(?!\d)/.test(detail2) || /(?<!\d)11128(?!\d)/.test(detail2) || detail2.includes("\u6E20\u9053\u6821\u9A8C") || detail2.includes("channel_reject") || detail2.includes("\u4E0D\u662F\u5B98\u65B9\u5BA2\u6237\u7AEF") || detail2.includes("conversation id missing") || detail2.includes("first message is not system prompt");
}
function systemOpeningsOf(messages, limit = 3) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const m of messages) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const msg = m;
    if (!isScannedRole(msg.role)) continue;
    for (const t of eachTextOf(msg.content)) {
      const line = t.trim().split("\n")[0] ?? "";
      if (line === "") continue;
      out.push(`${msg.role}:${line.slice(0, 120)}`);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
function channelRejectMessage(messages) {
  const openings = systemOpeningsOf(messages);
  const hits = openings.length > 0 ? `\u547D\u4E2D\u7684\u63D0\u793A\u5F00\u5934:${openings.map((o) => `\u300C${o}\u300D`).join("\u3001")}\u3002` : "";
  return `${hits}${CHANNEL_REJECT_TIP}`;
}
function isWorkbuddyWire(protocol) {
  return protocol === "workbuddy";
}

// ../core/src/connectors/trae-wire.ts
import { randomUUID as randomUUID2 } from "node:crypto";
var CHAT_PATH = "/api/agent/v3/llm_utils_chat";
var WORKSPACE_ID = "e04cdd";
var DEFAULT_MAX_TOKENS = 4096;
var PROMPT_MAX_TOKENS = 168e3;
var DEFAULT_FUNCTION = "solo_work_lite";
var _IMAGE_PLACEHOLDER = "[\u56FE\u7247\u672A\u53D1\u9001:trae \u901A\u9053\u65E0\u6CD5\u786E\u8BA4\u8BE5\u6A21\u578B\u652F\u6301\u56FE\u50CF\u8F93\u5165]";
function env(name2, fallback) {
  if (typeof process === "undefined") return fallback;
  const v = process.env[name2];
  return v && v.trim() ? v : fallback;
}
function convertContent(content) {
  if (content === null || content === void 0) return [{ type: "text", text: "" }];
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [{ type: "text", text: String(content) }];
  const parts = [];
  let dropped = 0;
  for (const part of content) {
    if (!part || typeof part !== "object") {
      dropped += 1;
      continue;
    }
    const p = part;
    if (typeof p.text === "string") {
      parts.push({ type: "text", text: p.text });
      continue;
    }
    const url = imageUrlOf(p);
    if (url !== null) {
      parts.push({ type: "image_url", image_url: { url } });
      continue;
    }
    dropped += 1;
  }
  if (dropped > 0) {
    parts.push({
      type: "text",
      text: _IMAGE_PLACEHOLDER + (dropped > 1 ? `\xD7${dropped}` : "")
    });
  }
  if (parts.length === 0) return [{ type: "text", text: "" }];
  return parts;
}
function imageUrlOf(part) {
  const inner = part.image_url;
  const url = inner && typeof inner === "object" ? inner.url : part.url;
  if (typeof url === "string" && url.trim() !== "") return url;
  return null;
}
function convertHistoryToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];
  const out = [];
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== "object") continue;
    const t = tc;
    const fn = t.function_call ?? t.function;
    if (!fn || typeof fn !== "object") continue;
    const f = fn;
    if (typeof f.name !== "string" || f.name === "") continue;
    out.push({
      id: typeof t.id === "string" ? t.id : null,
      type: "function",
      function_call: { name: f.name, arguments: typeof f.arguments === "string" ? f.arguments : "" }
    });
  }
  return out;
}
function convertMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg;
    const role = typeof m.role === "string" ? m.role : "user";
    const entry = { role, content: convertContent(m.content) };
    if (role === "assistant") {
      const converted = convertHistoryToolCalls(m.tool_calls);
      if (converted.length > 0) entry.tool_calls = converted;
    }
    if (role === "tool" && typeof m.tool_call_id === "string") {
      entry.tool_call_id = m.tool_call_id;
    }
    if (typeof m.name === "string") entry.name = m.name;
    out.push(entry);
  }
  return out;
}
function normalizeTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const out = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const t = tool;
    if (!t.function || typeof t.function !== "object") continue;
    const fn = { ...t.function };
    if (typeof fn.parameters === "object" && fn.parameters !== null) {
      fn.parameters = JSON.stringify(fn.parameters);
    }
    out.push({ type: typeof t.type === "string" ? t.type : "function", function: fn });
  }
  return out.length > 0 ? out : null;
}
function normalizeToolChoice(toolChoice) {
  if (!toolChoice || typeof toolChoice !== "object" || Array.isArray(toolChoice)) return null;
  const tc = toolChoice;
  const fn = tc.function;
  const name2 = fn && typeof fn === "object" ? fn.name : tc.name;
  if (typeof name2 === "string" && name2.trim() !== "") return name2.trim();
  return null;
}
function buildUpstreamBody(model, messages, identity, optional, requestId) {
  const cleanModel = model.startsWith("trae/") ? model.split("/", 2)[1] ?? model : model;
  const sessionId = randomUUID2();
  const tools = normalizeTools(optional.tools);
  const body = {
    messages: convertMessages(messages),
    model: cleanModel,
    config_name: cleanModel,
    model_name: `${cleanModel}__dev`,
    function: env("TRAE_FUNCTION", DEFAULT_FUNCTION),
    stream: true,
    max_tokens: optional.max_tokens ?? optional.max_completion_tokens ?? DEFAULT_MAX_TOKENS,
    conversation_id: sessionId,
    session_id: sessionId,
    request_id: requestId ?? sessionId,
    user_id: identity.user_id ?? "",
    device_id: identity.device_id,
    machine_id: identity.machine_id,
    project_id: randomUUID2(),
    workspace_id: WORKSPACE_ID,
    prompt_max_tokens: PROMPT_MAX_TOKENS,
    mode: "FunctionCall",
    ide_version: env("TRAE_IDE_VERSION", DEFAULT_IDE_VERSION),
    ide_version_code: env("TRAE_IDE_VERSION_CODE", DEFAULT_IDE_VERSION_CODE),
    app_id: env("TRAE_APP_ID", APP_ID),
    package_type: "stable_cn"
  };
  if (tools) body.tools = tools;
  const choice = normalizeToolChoice(optional.tool_choice);
  if (choice) body.tool_choice = choice;
  if (typeof optional.temperature === "number" && Number.isFinite(optional.temperature)) {
    body.temperature = optional.temperature;
  }
  return body;
}
function resolveChatUrl(baseUrl, region, extra) {
  return resolve_api_base(baseUrl, region, extra) + CHAT_PATH;
}
function decodeTraeEvent(event, data) {
  if (data.trim() === "[DONE]") return { kind: "done", finish_reason: null };
  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return { kind: "unknown", event };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { kind: "unknown", event };
  }
  const p = payload;
  if (event === "request_wait_in_queue") {
    return {
      kind: "queue",
      position: typeof p.position === "number" && Number.isFinite(p.position) ? p.position : null
    };
  }
  if (event === "progress_notice") return { kind: "progress", notice: payload };
  if (event === "token_usage") return { kind: "usage", usage: toOpenAIUsage(payload) };
  if (event === "done" || typeof p.finish_reason === "string" && !String(p.finish_reason).includes("response")) {
    return { kind: "done", finish_reason: typeof p.finish_reason === "string" ? p.finish_reason : "stop" };
  }
  if (event === "error" || (typeof p.code === "number" || typeof p.code === "bigint") && Number(p.code) >= 4e3) {
    return {
      kind: "error",
      code: typeof p.code === "number" ? Number(p.code) : null,
      message: typeof p.message === "string" ? p.message : "",
      extra: p.extra
    };
  }
  if (event === "output" || "response" in p || "reasoning_content" in p) {
    return {
      kind: "delta",
      text: typeof p.response === "string" ? p.response : "",
      reasoning: typeof p.reasoning_content === "string" ? p.reasoning_content : null,
      tool_calls: p.tool_calls
    };
  }
  return { kind: "unknown", event };
}
function toOpenAIUsage(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const p = payload;
  const usage = {};
  for (const key3 of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    const v = p[key3];
    if (typeof v === "number" && Number.isFinite(v) && typeof v !== "boolean") {
      usage[key3] = Math.trunc(v);
    }
  }
  const details = {};
  const rt = p.reasoning_tokens;
  if (typeof rt === "number" && Number.isFinite(rt) && rt !== 0) {
    details.reasoning_tokens = Math.trunc(rt);
  }
  const cached = p.cache_read_input_tokens;
  if (typeof cached === "number" && Number.isFinite(cached) && cached !== 0) {
    details.cached_tokens = Math.trunc(cached);
  }
  const write = p.cache_creation_input_tokens;
  if (typeof write === "number" && Number.isFinite(write) && write !== 0) {
    details.cache_write_tokens = Math.trunc(write);
  }
  if (Object.keys(details).length > 0) {
    usage.prompt_tokens_details = details;
  }
  return usage;
}
function normalizeToolCallDelta(raw, fallbackIndex, ids, idPrefix) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw;
  const fnRaw = r.function_call ?? r.function;
  const fn = fnRaw && typeof fnRaw === "object" ? fnRaw : {};
  const index = typeof r.index === "number" && Number.isInteger(r.index) ? r.index : fallbackIndex;
  const rawId = typeof r.id === "string" && r.id !== "" ? r.id : null;
  if (rawId && !ids.has(index)) ids.set(index, rawId);
  const callId = ids.get(index) ?? `call_${idPrefix}_${index}`;
  ids.set(index, callId);
  const name2 = typeof fn.name === "string" && fn.name !== "" ? fn.name : null;
  const args = typeof fn.arguments === "string" && fn.arguments !== "" ? fn.arguments : "";
  return {
    index,
    id: callId,
    type: "function",
    function: name2 !== null ? { name: name2, arguments: args } : { arguments: args }
  };
}
function makeChunk(completionId, created, model, delta, finishReason = null, usage = null) {
  return {
    id: completionId,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    usage
  };
}
var TraeSseParser = class {
  buffer = "";
  event = null;
  data = [];
  /** 喂入 chunk,返回完整事件对列表(可能为空)。 */
  push(chunk) {
    this.buffer += chunk;
    const out = [];
    let match;
    const newline = /\r?\n/;
    while ((match = newline.exec(this.buffer)) !== null) {
      const line = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const ev = this.consumeLine(line);
      if (ev) out.push(ev);
    }
    return out;
  }
  /** 流结束:冲刷残余缓冲。 */
  finish() {
    const out = [];
    if (this.buffer !== "") {
      const ev = this.consumeLine(this.buffer);
      if (ev) out.push(ev);
      this.buffer = "";
    }
    const dispatched = this.dispatch();
    if (dispatched) out.push(dispatched);
    return out;
  }
  consumeLine(line) {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") {
      this.event = value;
      return null;
    }
    if (field === "data") {
      this.data.push(value);
      return null;
    }
    return null;
  }
  dispatch() {
    if (this.data.length === 0) {
      this.event = null;
      return null;
    }
    const result = [this.event ?? "", this.data.join("\n")];
    this.event = null;
    this.data = [];
    return result;
  }
};
var TraeChunkBuilder = class {
  constructor(completionId, created, model) {
    this.completionId = completionId;
    this.created = created;
    this.model = model;
    this.idPrefix = completionId.replace(/^chatcmpl-/, "").slice(0, 16);
  }
  completionId;
  created;
  model;
  sawToolCalls = false;
  usage = null;
  ids = /* @__PURE__ */ new Map();
  idPrefix;
  opened = false;
  finished = false;
  /** 喂入解码事件,产出 chunk(可能为空数组)。 */
  feed(events) {
    if (this.finished) return [];
    const out = [];
    for (const decoded of events) {
      if (this.finished) return out;
      if (decoded.kind === "delta") {
        const delta = {};
        if (decoded.reasoning && decoded.reasoning !== "") {
          delta.reasoning_content = decoded.reasoning;
        }
        const text = decoded.text ?? "";
        if (text !== "") delta.content = text;
        let normalized = [];
        if (Array.isArray(decoded.tool_calls)) {
          for (let i = 0; i < decoded.tool_calls.length; i++) {
            const norm = normalizeToolCallDelta(decoded.tool_calls[i], i, this.ids, this.idPrefix);
            if (norm) normalized.push(norm);
          }
        }
        if (normalized.length > 0) {
          delta.tool_calls = normalized;
          this.sawToolCalls = true;
        }
        if (Object.keys(delta).length === 0) continue;
        if (!this.opened) {
          this.opened = true;
          const withRole = { role: "assistant", ...delta };
          out.push(makeChunk(this.completionId, this.created, this.model, withRole));
        } else {
          out.push(makeChunk(this.completionId, this.created, this.model, delta));
        }
      } else if (decoded.kind === "usage") {
        this.usage = decoded.usage ?? {};
      } else if (decoded.kind === "done") {
        let finishReason = decoded.finish_reason ?? "stop";
        if (this.sawToolCalls && finishReason === "stop") finishReason = "tool_calls";
        this.finished = true;
        out.push(makeChunk(this.completionId, this.created, this.model, {}, finishReason, this.usage));
      } else if (decoded.kind === "error") {
        throw this.soloError(decoded);
      }
    }
    return out;
  }
  /** 整条流读完后再调:补发收尾块。 */
  finish() {
    if (this.finished) return [];
    this.finished = true;
    return [
      makeChunk(
        this.completionId,
        this.created,
        this.model,
        {},
        this.sawToolCalls ? "tool_calls" : "stop",
        this.usage
      )
    ];
  }
  soloError(decoded) {
    if (typeof decoded.code === "number") {
      return classifySoloError(decoded.code);
    }
    return new UpstreamError2("bad_request", decoded.message || "trae \u6D41\u5185\u9519\u8BEF", false, 400);
  }
};
function classifySoloError(code) {
  if (code === 1005) return new UpstreamError2("rate_limit", "\u5957\u9910\u989D\u5EA6\u8017\u5C3D", true, 429);
  if (code === 4001 || code === 4002) return new UpstreamError2("bad_request", "\u6A21\u578B\u914D\u7F6E\u9519\u8BEF", false, 400);
  if (code === 401 || code === 403) return new UpstreamError2("auth", "\u8D26\u53F7\u5DF2\u5931\u6548", false, 401);
  if (code === 4008 || code === 4011 || code === 429) return new UpstreamError2("rate_limit", "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41", true, 429);
  if (code >= 500) return new UpstreamError2("upstream", "\u4E0A\u6E38\u9519\u8BEF", true, code);
  return new UpstreamError2("bad_request", "\u8BF7\u6C42\u9519\u8BEF", false, 400);
}
function prepareTraeRequest(w) {
  const url = resolveChatUrl(w.baseUrl, w.region, w.extra);
  const body = buildUpstreamBody(
    w.req.model,
    w.req.messages,
    w.identity,
    {
      temperature: w.req.temperature,
      max_tokens: w.req.max_tokens,
      tools: w.req.tools,
      tool_choice: w.req.tool_choice
    },
    w.requestId
  );
  return { url, body };
}
function identityFromExtra(apiKey, extra) {
  const identity = resolve_identity(apiKey, extra);
  return {
    user_id: typeof extra?.["user_id"] === "string" ? extra["user_id"] : void 0,
    machine_id: identity.machine_id,
    device_id: identity.device_id
  };
}

// ../core/src/connectors/workbuddy-wire.ts
var CHAT_PATH2 = "/v2/chat/completions";
var XML_TOOL_OPEN = "<tool_call>";
var XML_TOOL_CLOSE = "</tool_call>";
var XML_TOOL_FN = "<function=";
var XML_TOOL_OPEN_RE = /^\s*<tool_call>/m;
function buildWorkbuddyBody(req) {
  const body = {
    model: req.model,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true }
  };
  const maxTokens = req.max_tokens ?? req.max_completion_tokens;
  if (typeof maxTokens === "number" && Number.isFinite(maxTokens)) {
    body.max_tokens = maxTokens;
  }
  if (typeof req.temperature === "number" && Number.isFinite(req.temperature)) {
    body.temperature = req.temperature;
  }
  if (typeof req.top_p === "number" && Number.isFinite(req.top_p)) {
    body.top_p = req.top_p;
  }
  if (Array.isArray(req.stop) && req.stop.length > 0) {
    body.stop = req.stop;
  }
  if (req.tools) body.tools = req.tools;
  if (req.tool_choice) body.tool_choice = req.tool_choice;
  if (req.reasoning_effort) body.reasoning_effort = req.reasoning_effort;
  return body;
}
var XmlToolCallCopyFilter = class {
  seenStructured = false;
  buf = null;
  /** 喂入一段文本,返回应外发的部分。 */
  feed(text) {
    if (text === "") return "";
    if (this.buf !== null) return this.drain(text);
    const openAt = this.findOpen(text);
    if (openAt === -1) return text;
    return text.slice(0, openAt) + this.open(text.slice(openAt));
  }
  /** 流结束:丢弃未闭合缓冲。 */
  finish() {
    if (this.buf !== null) {
      this.buf = null;
    }
    return "";
  }
  /** 缓冲内追加,寻找闭合标记(闭合标签本身计入缓冲段)。 */
  drain(text) {
    const closeAt = text.indexOf(XML_TOOL_CLOSE);
    if (closeAt === -1) {
      this.buf.push(text);
      return "";
    }
    this.buf.push(text.slice(0, closeAt + XML_TOOL_CLOSE.length));
    const segment = this.buf.join("");
    this.buf = null;
    return this.decide(segment) + this.feed(text.slice(closeAt + XML_TOOL_CLOSE.length));
  }
  /** 开启缓冲(首段可能同帧闭合)。 */
  open(text) {
    const closeAt = text.indexOf(XML_TOOL_CLOSE);
    if (closeAt !== -1) {
      const segment = text.slice(0, closeAt + XML_TOOL_CLOSE.length);
      return this.decide(segment) + this.feed(text.slice(closeAt + XML_TOOL_CLOSE.length));
    }
    this.buf = [text];
    return "";
  }
  /** 闭合段去向:seen_structured 时丢弃,否则原样外发。 */
  decide(segment) {
    return this.seenStructured ? "" : segment;
  }
  /** 找开启位置:行首 <tool_call> 优先;seen_structured 后任意位置也认。 */
  findOpen(text) {
    const m = XML_TOOL_OPEN_RE.exec(text);
    if (m) return m.index;
    if (!this.seenStructured) return -1;
    const openAt = text.indexOf(XML_TOOL_OPEN);
    if (openAt !== -1) return openAt;
    return text.indexOf(XML_TOOL_FN);
  }
};
function filterWorkbuddyChunk(chunk, flt) {
  const choices = chunk.choices;
  if (!Array.isArray(choices) || choices.length === 0) return chunk;
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const c = choice;
    const delta = c.delta;
    if (!delta || typeof delta !== "object") continue;
    const d = delta;
    if (Array.isArray(d.tool_calls) && d.tool_calls.length > 0) {
      flt.seenStructured = true;
    }
    if (typeof d.content !== "string" || d.content === "") continue;
    const text = flt.feed(d.content);
    if (text !== "") {
      d.content = text;
    } else {
      delete d.content;
    }
  }
  return chunk;
}
function decorateWorkbuddyChunk(chunk, completionId, created, model) {
  return {
    ...chunk,
    id: chunk.id ?? completionId,
    object: "chat.completion.chunk",
    created: chunk.created ?? created,
    model: chunk.model ?? model
  };
}
function resolveWorkbuddyChatUrl(baseUrl, region) {
  const base = (baseUrl && baseUrl.trim() ? baseUrl.trim() : REGION_BASES2[normalize_region2(region)]).replace(/\/+$/, "");
  return base + CHAT_PATH2;
}

// src/gateway-upstream-body.ts
function mergeHeaders(headers) {
  const out = {};
  for (const [key3, value] of Object.entries(headers)) {
    const lower = key3.toLowerCase();
    const existing = Object.keys(out).find((k) => k.toLowerCase() === lower);
    if (existing === void 0) {
      out[key3] = value;
    } else {
      out[existing] = value;
    }
  }
  return out;
}
function upstreamHeaders(headers) {
  return mergeHeaders({ "content-type": "application/json", ...headers });
}
function sessionOf(req) {
  const v = req.extra?.session_id;
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
function cacheRoutingKeyOf2(req) {
  const v = req.prompt_cache_key;
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
function affinityKeyOf(req) {
  return cacheRoutingKeyOf2(req) ?? sessionOf(req);
}
function toRouterChain(chain) {
  return chain.map((item) => {
    const ep = item.endpoint;
    return chainItemFrom({
      endpoint: {
        endpointId: ep.endpointId,
        provider: ep.provider,
        model: ep.model,
        credentialKey: ep.credentialKey,
        protocol: ep.protocol,
        baseUrl: ep.baseUrl,
        region: ep.region,
        concurrency: ep.concurrency,
        supportsVision: ep.supportsVision,
        maxInputTokens: ep.maxInputTokens,
        maxOutputTokens: ep.maxOutputTokens,
        cooldownUntil: ep.cooldownUntil
      },
      priority: item.priority,
      blackout: item.blackout,
      strategy: item.strategy,
      // ⚠️ direct 必须搬过去:router 的 plan(ignoreCooldown)与
      // commit(acquireDirect 抢占)都按它判定是不是「真实模型直连」。
      direct: item.direct
    });
  });
}
function completionIdOf() {
  return `chatcmpl-${Math.floor(performance.now()).toString(16)}`;
}
function createdOf() {
  return Math.floor(Date.now() / 1e3);
}
function bodyForProtocol(providerId, protocol, req, creds) {
  if (protocol === "trae") {
    const identity = identityFromExtra(creds["apiKey"] ?? "", creds);
    return prepareTraeRequest({
      req,
      identity,
      baseUrl: creds["base_url"],
      region: creds["region"],
      extra: creds
    }).body;
  }
  if (isWorkbuddyWire(protocol) || protocol === "sensenova") {
    return buildWorkbuddyBody(req);
  }
  return bodyFor(req);
}
function bodyFor(req) {
  const body = {
    model: req.model,
    messages: req.messages,
    stream: req.stream
  };
  if (req.stream === true) {
    body.stream_options = { include_usage: true };
  }
  for (const key3 of [
    "temperature",
    "max_tokens",
    "top_p",
    "stop",
    "tools",
    "tool_choice",
    "reasoning_effort"
  ]) {
    const v = req[key3];
    if (v !== void 0) body[key3] = v;
  }
  if (req.extra) {
    for (const [k, v] of Object.entries(req.extra)) {
      if (k === "session_id" || k === CACHE_ROUTING_KEY_FIELD) continue;
      if (v !== void 0) body[k] = v;
    }
  }
  delete body[CACHE_ROUTING_KEY_FIELD];
  return body;
}
function hasVision(messages) {
  const asBridge = messages;
  if (imagePartIndices(asBridge).length > 0) return true;
  return messages.some((m) => {
    const content = m?.content;
    return typeof content === "string" && content.includes("data:image");
  });
}

// src/gateway-upstream-errors.ts
var CONNECTOR_KIND_TO_GATEWAY = {
  rate_limit: UpstreamErrorKind2.RateLimit,
  auth: UpstreamErrorKind2.Auth,
  auth_challenge: UpstreamErrorKind2.AuthChallenge,
  upstream: UpstreamErrorKind2.Upstream,
  bad_request: UpstreamErrorKind2.BadRequest,
  timeout: UpstreamErrorKind2.Timeout,
  connection: UpstreamErrorKind2.Connection,
  pool_saturated: UpstreamErrorKind2.RateLimit,
  pool_exhausted: UpstreamErrorKind2.RateLimit
};
var MAX_HONORED_RETRY_AFTER_S = 86400;
function cooldownUntilOf(gerr) {
  if (gerr.retryAfter === void 0) return void 0;
  const secs = Number(gerr.retryAfter);
  if (!Number.isFinite(secs) || secs < 0) return void 0;
  return Date.now() / 1e3 + Math.min(secs, MAX_HONORED_RETRY_AFTER_S);
}
function canFailover(gerr, provider) {
  if (isStickyNoSwitchProvider(provider) && gerr.kind === UpstreamErrorKind2.RateLimit) {
    return false;
  }
  return gerr.kind !== UpstreamErrorKind2.BadRequest && gerr.kind !== UpstreamErrorKind2.AuthChallenge;
}
function isReasoningEffortRejection(detail2) {
  if (detail2.length === 0) return false;
  return /reasoning[_ ]?effort/i.test(detail2) || /unsupported.*(reasoning|thinking)/i.test(detail2);
}
function toGatewayError(err) {
  if (err instanceof UpstreamError) return err;
  if (err !== null && typeof err === "object" && typeof err.kind === "string" && typeof err.httpStatus === "number") {
    const ce = err;
    const kind = CONNECTOR_KIND_TO_GATEWAY[ce.kind] ?? UpstreamErrorKind2.Upstream;
    return new UpstreamError(kind, ce.message || "\u4E0A\u6E38\u9519\u8BEF", {
      statusCode: ce.httpStatus,
      ...typeof ce.retryAfter === "number" ? { retryAfter: ce.retryAfter } : {},
      // 连接器若带了上游原件(逐字透传),原封不动接过去。
      ...ce.raw !== void 0 ? { raw: ce.raw } : {}
    });
  }
  if (err instanceof Error) {
    const cause = err.cause;
    const code = err.code ?? cause?.code;
    const name2 = err.name === "TimeoutError" ? "TimeoutError" : cause?.name ?? err.name;
    if (name2 === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
      return new UpstreamError(UpstreamErrorKind2.Timeout, err.message, { statusCode: 504 });
    }
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET" || code === "EPIPE" || code === "EAI_AGAIN" || code === "UND_ERR_SOCKET") {
      const detail2 = cause?.message ?? err.message;
      return new UpstreamError(UpstreamErrorKind2.Connection, detail2, { statusCode: 502 });
    }
    if (name2 === "AbortError") {
      return new UpstreamError(UpstreamErrorKind2.Timeout, `\u4E0A\u6E38\u8FDE\u63A5\u8D85\u65F6:${err.message}`, {
        statusCode: 504
      });
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return new UpstreamError(UpstreamErrorKind2.Upstream, message, { statusCode: 502 });
}
function httpStatusOf(err) {
  return err.httpStatus;
}

// src/gateway-upstream-peers.ts
async function connectorExtra(vault, provider, username) {
  try {
    const cred = await vault.get(provider, username);
    const raw = cred?.raw ?? {};
    const out = {};
    const region = raw["region"];
    if (typeof region === "string" && region.trim() !== "") out.region = region.trim();
    for (const key3 of ["uid", "user_id", "domain", "enterprise_id", "machine_id", "device_id", "api_base"]) {
      const v = raw[key3];
      if (typeof v === "string" && v.trim() !== "") out[key3] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}
async function runSensenova(peer, body, model, signal) {
  const connector = peer.connector;
  return connector.runWithAccount(peer.url, body, model, peer.creds, signal);
}
async function runQoder(peer, body, model, signal) {
  const connector = peer.connector;
  if (connector === void 0 || typeof connector.runWithAccount !== "function") {
    throw new UpstreamError(UpstreamErrorKind2.Auth, "Qoder \u8FDE\u63A5\u5668\u672A\u6CE8\u518C(protocol=qoder)", {
      statusCode: 500
    });
  }
  return connector.runWithAccount(peer.url, body, model, peer.creds, signal);
}
async function preparePeer(item, vault) {
  const ep = item.endpoint;
  const provider = ep.provider;
  const username = ep.credentialKey[1];
  const secret = await vault.secret(provider, username);
  const connector = getConnector(ep.protocol);
  const extra = await connectorExtra(vault, provider, username);
  const protocol = ep.protocol;
  const baseUrl = (ep.baseUrl || "").trim().replace(/\/+$/, "");
  const creds = {
    apiKey: secret ?? void 0,
    username: secret == null ? username : void 0,
    base_url: baseUrl,
    ...extra
  };
  let url;
  const region = ep.region ?? void 0;
  if (protocol === "trae") {
    url = resolveChatUrl(baseUrl || void 0, region, creds);
  } else if (isWorkbuddyWire(protocol)) {
    url = resolveWorkbuddyChatUrl(baseUrl || void 0, extra["region"] ?? region);
  } else if (protocol === "sensenova") {
    const base = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    url = `${base}/chat/completions`;
  } else if (protocol === "qoder") {
    const qRegion = regionOfCreds(creds, "qoder");
    const cfg = QODER_REGION_CONFIGS[qRegion];
    const base = (baseUrl || cfg.gateway).replace(/\/+$/, "");
    url = `${base}${cfg.chatPath}`;
  } else {
    url = `${baseUrl || ""}/chat/completions`;
  }
  let headers = {};
  let connectorRef = connector;
  if (protocol === "qoder") {
    headers = { ...QODER_DEFAULT_HEADERS };
    return { url, headers, connector: connectorRef, creds };
  }
  if (connector) {
    try {
      const token = await connector.getToken(creds);
      headers = connector.decorateRequest({ headers: {} }, token, creds).headers ?? {};
    } catch (err) {
      throw toGatewayError(err);
    }
  } else {
    if (secret) headers.Authorization = `Bearer ${secret}`;
    connectorRef = void 0;
  }
  return { url, headers, connector: connectorRef, creds };
}
async function classifyResponse(res, connector) {
  const text = await res.text();
  let body = text;
  let parsed = false;
  try {
    body = JSON.parse(text);
    parsed = true;
  } catch {
  }
  const detail2 = typeof body === "object" && body !== null ? body.error?.message ?? body.detail ?? text.slice(0, 200) : text.slice(0, 200);
  const raw = rawResponseOf(res, text, parsed ? body : void 0);
  if (connector) {
    try {
      const ce = connector.classifyError(res.status, body, headerRecord(res.headers));
      const kind2 = CONNECTOR_KIND_TO_GATEWAY[ce.kind] ?? UpstreamErrorKind2.Upstream;
      return new UpstreamError(kind2, ce.message || detail2, {
        statusCode: ce.httpStatus || res.status,
        retryAfter: ce.retryAfter,
        raw
      });
    } catch {
    }
  }
  const fallback = classify_openai_error(res.status, body, headerRecord(res.headers));
  const kind = CONNECTOR_KIND_TO_GATEWAY[fallback.kind] ?? UpstreamErrorKind2.Upstream;
  return new UpstreamError(kind, fallback.message || detail2, {
    statusCode: fallback.httpStatus || res.status,
    retryAfter: fallback.retryAfter,
    raw
  });
}
function rawResponseOf(res, text, json) {
  const raw = {
    text: text.length > RAW_BODY_MAX ? text.slice(0, RAW_BODY_MAX) : text,
    status: res.status
  };
  if (json !== void 0) raw.json = json;
  const contentType = res.headers.get("content-type");
  if (contentType !== null && contentType !== "") raw.contentType = contentType;
  return raw;
}
function headerRecord(headers) {
  const out = {};
  headers.forEach((value, key3) => {
    out[key3] = value;
  });
  return out;
}
async function postWorkbuddyWithGate(url, headers, body, signal, connector) {
  const originalMessages = Array.isArray(body.messages) ? body.messages : [];
  let currentBody = body;
  for (let pass = 0; pass < 3; pass += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: upstreamHeaders(headers),
      body: JSON.stringify(currentBody),
      signal
    });
    if (res.ok) return res;
    if (pass >= 2) {
      const err = await classifyResponse(res, connector);
      if (!isChannelRejectDetail(err.detail)) {
        return Promise.reject(err);
      }
      return Promise.reject(
        new UpstreamError(err.kind, `${channelRejectMessage(originalMessages)}
${err.detail}`, {
          statusCode: err.httpStatus,
          ...err.retryAfter !== void 0 ? { retryAfter: err.retryAfter } : {},
          ...err.raw !== void 0 ? { raw: err.raw } : {}
        })
      );
    }
    const probe = await classifyResponse(res, connector);
    if (!isChannelRejectDetail(probe.detail)) {
      return Promise.reject(probe);
    }
    currentBody = pass === 0 ? { ...body, messages: neutralizeChannelFingerprints(originalMessages) } : { ...body, messages: perturbChannelFingerprints(originalMessages) };
  }
  return Promise.reject(
    new UpstreamError(UpstreamErrorKind2.BadRequest, channelRejectMessage(originalMessages), {
      statusCode: 400
    })
  );
}

// src/gateway-upstream-stream.ts
var SSE_DONE = "[DONE]";
function isSseDoneLine(line) {
  return line.startsWith("data:") && line.slice("data:".length).trim() === SSE_DONE;
}
async function* rawLines(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        yield line;
        if (isSseDoneLine(line)) {
          await reader.cancel().catch(() => {
          });
          return;
        }
      }
    }
    const tail = buf.trim();
    if (tail) yield tail;
  } finally {
    try {
      reader.releaseLock();
    } catch {
    }
  }
}
function sseDataPayload2(line) {
  if (!line.startsWith("data:")) return null;
  const data = line.slice("data:".length).trim();
  if (data === "" || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
async function* iterUpstreamChunks(body, protocol, meta, providerId = "") {
  if (protocol === "trae") {
    const parser = new TraeSseParser();
    const builder = new TraeChunkBuilder(meta.completionId, meta.created, meta.model);
    for await (const line of rawLines(body)) {
      for (const [event, data] of parser.push(`${line}
`)) {
        const decoded = decodeTraeEvent(event, data);
        for (const chunk of builder.feed([decoded])) {
          yield chunk;
        }
      }
    }
    for (const chunk of parser.finish().flatMap(([event, data]) => {
      const decoded = decodeTraeEvent(event, data);
      return builder.feed([decoded]);
    })) {
      yield chunk;
    }
    for (const chunk of builder.finish()) {
      yield chunk;
    }
    return;
  }
  if (isWorkbuddyWire(protocol)) {
    const flt = new XmlToolCallCopyFilter();
    for await (const line of rawLines(body)) {
      const obj = sseDataPayload2(line);
      if (obj === null || typeof obj !== "object") continue;
      const chunk = filterWorkbuddyChunk(obj, flt);
      yield decorateWorkbuddyChunk(chunk, meta.completionId, meta.created, meta.model);
    }
    flt.finish();
    return;
  }
  for await (const line of rawLines(body)) {
    const obj = sseDataPayload2(line);
    if (obj === null || typeof obj !== "object") continue;
    const raw = obj;
    if (protocol === "sensenova") {
      const choices2 = raw.choices;
      if ((!Array.isArray(choices2) || choices2.length === 0) && raw.usage == null) continue;
    }
    const choices = raw.choices;
    if ((!Array.isArray(choices) || choices.length === 0) && raw.usage == null) continue;
    yield raw;
  }
}

// src/gateway-upstream.ts
function DEFAULT_RETRY_POLICY(abstract) {
  return new RetryPolicy({
    maxAttempts: abstract ? 1 : 10,
    cooldownFloorS: 15 * 60,
    baseS: 1,
    factor: DEFAULT_FACTOR,
    capS: 15,
    jitterRatio: 0.2,
    codes: new Set(
      "timeout,connection,429,500,502,503,504".split(",").map((s) => s.trim().toLowerCase()).filter((s) => s !== "")
    )
  });
}
var STREAM_CONNECT_TIMEOUT_MS = 6e4;
function armConnectTimeout(abort, seconds) {
  if (!(seconds > 0)) return null;
  return setTimeout(() => abort.abort(), Math.round(seconds * 1e3));
}
var MAX_FAILOVER_ATTEMPTS = 10;
function sleepMs(ms) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function clampMaxTokens(clientMax, memberCap, logicalCap) {
  if (memberCap === null || memberCap === void 0 || !Number.isFinite(memberCap) || memberCap <= 0) {
    return clientMax;
  }
  if (clientMax === void 0) return memberCap;
  if (logicalCap !== null && logicalCap !== void 0 && clientMax === logicalCap) {
    return memberCap;
  }
  return Math.min(clientMax, memberCap);
}
function wireProtocolOf(protocol) {
  return protocol === "qoder" ? "openai" : protocol;
}
function buildResolveUpstream(runtime) {
  const { scheduler, router, vault } = runtime;
  const logicalOutputCapOf = (logicalName) => runtime.logicalOutputCap?.(logicalName) ?? null;
  const policyOf = (abstract) => runtime.retryPolicy?.(abstract) ?? DEFAULT_RETRY_POLICY(abstract);
  const requestTimeoutMs = () => runtime.requestTimeoutMs?.() ?? STREAM_CONNECT_TIMEOUT_MS / 1e3;
  return function resolveUpstream(model) {
    let chain = [];
    try {
      chain = scheduler.chain(model);
    } catch (err) {
      console.error(`[as-one] scheduler.chain("${model}") failed:`, err);
      return void 0;
    }
    if (chain.length === 0) return void 0;
    const routerChain = toRouterChain(chain);
    const directRequest = routerChain.length > 0 && routerChain.every((i) => i.direct === true);
    const parseOneImage = async (part, sessionId) => {
      const freeUpstream = resolveUpstream(FREE_PARSE_MODEL);
      if (!freeUpstream) return null;
      const parseSession = `${sessionId}:free-parse`;
      try {
        const data = await freeUpstream.complete({
          model: FREE_PARSE_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: FREE_PARSE_PROMPT },
                part
              ]
            }
          ],
          stream: false,
          // 「解析时关闭思考」—— 图片解析要的是快和准的证据,不是深度推理。
          // ⚠️ **不传 max_tokens**(用户 m06638①「不限制最大输出 token」,
          // 2026-10-24 定案):以前钉死 768,四段证据经常被截断 —— 截断的证据
          // 比没有更危险(看起来完整,实际丢了一半)。不传时 `clampMaxTokens`
          // 会用该成员的真实 `max_output_tokens` 补(见 clampMaxTokens 文档),
          // 成员上限缺失则保持 undefined,让上游用自己的缺省。
          temperature: 0,
          // 解析要确定性:同样一张图给同样的描述
          reasoning_effort: "none",
          extra: { session_id: parseSession }
        });
        const content = data.choices?.[0]?.message?.content;
        return typeof content === "string" ? content : null;
      } catch (err) {
        console.warn(`[as-one] \u56FE\u7247\u89E3\u6790\u5931\u8D25(${FREE_PARSE_MODEL}):`, err);
        return null;
      }
    };
    const bridgeImagesIfNeeded = async (req, sessionId) => {
      const messages = req.messages;
      const imageCount = imagePartIndices(messages).length;
      if (imageCount === 0) return req;
      const hardOverflow = imageCount > IMAGE_HARD_LIMIT;
      const chainHasVision = chain.some(
        (it) => it.endpoint.supportsVision === true
      );
      if (hardOverflow || !chainHasVision) {
        const bridged = await tryParseImages(messages, {
          parseOne: (part) => parseOneImage(part, sessionId),
          chainHasVision,
          hardOverflow
        });
        if (bridged.result.replaced > 0 || bridged.result.droppedHistory > 0) {
          console.warn(
            `[as-one] \u56FE\u50CF\u6865:\u66FF\u6362 ${bridged.result.replaced} \u5F20(\u7F13\u5B58\u547D\u4E2D ${bridged.result.cacheHits}\u3001\u5931\u8D25 ${bridged.result.unparsed}\u3001\u4E22\u5386\u53F2 ${bridged.result.droppedHistory}\u3001\u672C\u6B21\u5B9E\u89E3\u6790 ${bridged.result.parsedNow})`
          );
        }
        return { ...req, messages: bridged.messages };
      }
      const [trimmed, dropped] = dropExcessImages(messages);
      if (dropped > 0) {
        console.warn(`[as-one] \u89C6\u89C9\u7AEF\u70B9\u8DEF\u5F84:\u4E22\u5F03\u6700\u65E9 ${dropped} \u5F20\u5386\u53F2\u56FE\u7247,\u4FDD\u7559\u6700\u8FD1 ${imageCount - dropped} \u5F20`);
        return { ...req, messages: trimmed };
      }
      return req;
    };
    const planErrorOf = (reason, lastError) => {
      if (reason === "all_busy") return allBusyError();
      if (lastError !== null) return lastError;
      return new UpstreamError(
        UpstreamErrorKind2.Connection,
        `\u65E0\u53EF\u7528\u4E0A\u6E38:${reason || "no endpoint"}`,
        { statusCode: 502 }
      );
    };
    return {
      async *stream(req) {
        const sessionId = sessionOf(req);
        const affinityKey = affinityKeyOf(req);
        let snRuntime = null;
        let snConnector = null;
        const bridged = await bridgeImagesIfNeeded(req, sessionId ?? "");
        const tried = /* @__PURE__ */ new Set();
        const t0 = performance.now();
        const preemptedEndpoints = /* @__PURE__ */ new Set();
        const policy = policyOf(!directRequest);
        const maxAttempts = directRequest ? Math.max(1, Math.min(policy.maxAttempts, MAX_FAILOVER_ATTEMPTS, routerChain.length)) : Math.max(
          1,
          Math.min(
            MAX_FAILOVER_ATTEMPTS,
            Math.max(policy.maxAttempts, routerChain.length)
          )
        );
        let lastError = null;
        let stripReasoningEffort = false;
        for (let attempt = 1; ; attempt += 1) {
          const plan = router.plan({
            // ⚠️ **被抢占过的端点不再选**(m02240):抢占是「直连要这个位置」,
            // 选回它只会被再抢一次 —— 反复抢、反复换,直到预算耗尽。
            // 换档的语义是「去**别的**模型」,不是「跟抢占者抢同一个位置」。
            chain: preemptedEndpoints.size === 0 ? routerChain : routerChain.filter((it) => !preemptedEndpoints.has(it.endpoint.endpointId)),
            // ⚠️ 亲和键 = 缓存路由键优先(m09081):同前缀 → 同端点 → 上游前缀缓存命中。
            sessionId: affinityKey,
            // ⚠️ 桥接后消息里已无图 → needs_vision 自然为 false,
            // 选路走普通的非视觉池(与 Nexus 同一口径)。
            needsVision: hasVision(bridged.messages),
            ignoreCooldown: directRequest
          });
          const item = plan.item;
          if (!item) throw planErrorOf(plan.reason ?? "", lastError);
          const alreadyTried = tried.has(item.endpoint.endpointId);
          tried.add(item.endpoint.endpointId);
          let preemptedBy = null;
          const abort = new AbortController();
          let clientGone = false;
          const clientSignal = req.clientSignal;
          const onClientAbort = () => {
            clientGone = true;
            abort.abort();
          };
          if (clientSignal) {
            if (clientSignal.aborted) {
              clientGone = true;
              abort.abort();
            } else {
              clientSignal.addEventListener("abort", onClientAbort, { once: true });
            }
          }
          const leaseId = router.commit(item, {
            logicalName: model,
            sessionId: affinityKey,
            stream: true,
            onPreempt: (reason) => {
              preemptedBy = reason;
              abort.abort();
            }
          });
          if (!leaseId) throw planErrorOf("all_busy", null);
          let firstChunkEmitted = false;
          let ttftMs = null;
          const wantedEffort = stripReasoningEffort ? void 0 : resolveReasoningEffort(
            bridged.reasoning_effort,
            runtime.reasoningEffortsOf?.(item.endpoint.provider, item.endpoint.model),
            runtime.reasoningAllowsOffOf?.(item.endpoint.provider, item.endpoint.model) ?? null
          ).effort;
          const bodyReq = { ...bridged, reasoning_effort: wantedEffort };
          try {
            const peer = await preparePeer(item, vault);
            const { url, headers, connector, creds } = peer;
            const clamped = clampMaxTokens(
              bridged.maxTokensClient ?? bridged.max_tokens,
              item.endpoint.maxOutputTokens ?? null,
              logicalOutputCapOf(model)
            );
            const body = bodyForProtocol(item.endpoint.provider, item.endpoint.protocol, { ...bodyReq, model: item.endpoint.model, max_tokens: clamped }, creds);
            const timer = armConnectTimeout(abort, requestTimeoutMs());
            let res;
            try {
              if (item.endpoint.protocol === "sensenova") {
                snConnector = connector;
                const sn = await runSensenova(peer, body, model, abort.signal);
                res = sn.res;
                snRuntime = sn.runtime;
              } else if (item.endpoint.protocol === "qoder") {
                snConnector = connector;
                const q = await runQoder(peer, body, model, abort.signal);
                res = q.res;
                snRuntime = q.runtime;
              } else {
                res = isWorkbuddyWire(item.endpoint.protocol) ? (
                  // 渠道校验闸门必须在流式路径上也生效 —— DSH 的对话请求
                  // 全是流式的,只在 complete() 挂闸门等于没挂(用户实测拿到的
                  // 就是「渠道校验拦截(code 11128):请求被拦截,请重新发送」)。
                  // ⚠️ 判据只有 protocol(2026-10-31 用户定案收回按名字放宽):
                  // 名字带 workbuddy/wb 但 protocol=openai 的 provider 一律按
                  // 普通 OpenAI 直连,不改它的提示词。
                  await postWorkbuddyWithGate(url, headers, body, abort.signal, connector)
                ) : await fetch(url, {
                  method: "POST",
                  headers: upstreamHeaders(headers),
                  body: JSON.stringify(body),
                  signal: abort.signal
                });
              }
            } finally {
              if (timer !== null) clearTimeout(timer);
            }
            if (!res.ok || !res.body) {
              throw await classifyResponse(res, connector);
            }
            const chunkMeta = { completionId: completionIdOf(), created: createdOf(), model: req.model };
            let usage = null;
            for await (const chunk of iterUpstreamChunks(res.body, wireProtocolOf(item.endpoint.protocol), chunkMeta, item.endpoint.provider)) {
              if (chunk.usage) usage = chunk.usage;
              if (ttftMs === null) ttftMs = performance.now() - t0;
              firstChunkEmitted = true;
              yield chunk;
            }
            if (snRuntime) {
              snConnector?.recordSpendFor(snRuntime.name, usage, ttftMs === null ? 0 : Math.round(ttftMs));
            }
            router.finish(item, {
              leaseId,
              ok: true,
              status: 200,
              latencyMs: Math.round(performance.now() - t0),
              ttftMs: ttftMs === null ? void 0 : Math.round(ttftMs),
              promptTokens: usage?.prompt_tokens,
              completionTokens: usage?.completion_tokens,
              cachedTokens: usage?.prompt_tokens_details?.cached_tokens
            });
            if (stripReasoningEffort) {
              runtime.onReasoningEffortLearned?.(item.endpoint.provider, item.endpoint.model);
            }
            return;
          } catch (err) {
            if (preemptedBy !== null) {
              router.finish(item, {
                leaseId,
                ok: false,
                preempted: true,
                status: 0,
                error: preemptedBy,
                latencyMs: Math.round(performance.now() - t0)
              });
              if (firstChunkEmitted) {
                console.warn(
                  `[as-one] stream preempted after first chunk (${model}): ${preemptedBy}`
                );
                return;
              }
              preemptedEndpoints.add(item.endpoint.endpointId);
              console.warn(
                `[as-one] preempted by direct request (${model}) endpoint=${item.endpoint.endpointId}: ${preemptedBy} \u2192 \u6362\u6863`
              );
              if (attempt < maxAttempts) {
                continue;
              }
              throw new UpstreamError(
                UpstreamErrorKind2.Upstream,
                `\u88AB\u76F4\u8FDE\u8BF7\u6C42\u62A2\u5360,\u4E14\u5DF2\u65E0\u66F4\u591A\u6863\u4F4D\u53EF\u6362:${preemptedBy}`,
                { statusCode: 503 }
              );
            }
            const gerr = toGatewayError(err);
            if (clientGone) {
              router.finish(item, {
                leaseId,
                ok: firstChunkEmitted,
                status: firstChunkEmitted ? 200 : 0,
                error: firstChunkEmitted ? void 0 : "\u5BA2\u6237\u7AEF\u65AD\u5F00",
                kind: firstChunkEmitted ? void 0 : "client_disconnected",
                latencyMs: Math.round(performance.now() - t0)
              });
              return;
            }
            if (!stripReasoningEffort && !firstChunkEmitted && isReasoningEffortRejection(gerr.detail)) {
              router.finish(item, {
                leaseId,
                ok: false,
                voidAttempt: true,
                status: 0,
                error: `reasoning_effort \u4E0D\u88AB\u652F\u6301,\u4E22\u53C2\u91CD\u8BD5:${gerr.detail}`,
                latencyMs: Math.round(performance.now() - t0)
              });
              stripReasoningEffort = true;
              console.warn(
                `[as-one] reasoning_effort rejected (${model}, ${item.endpoint.endpointId}) \u2192 \u4E22\u53C2\u91CD\u8BD5: ${gerr.detail}`
              );
              if (attempt < maxAttempts) {
                continue;
              }
            }
            router.finish(item, {
              leaseId,
              ok: firstChunkEmitted,
              // 首块已发则不算上游失败(客户端断开属正常)
              status: firstChunkEmitted ? 200 : httpStatusOf(gerr),
              error: firstChunkEmitted ? void 0 : gerr.detail,
              kind: firstChunkEmitted ? void 0 : gerr.kind,
              latencyMs: Math.round(performance.now() - t0),
              // 上游给了 retry_after 就按它冷却(优先按上游给出的时间);
              // 没给 → undefined,回落 provider 覆盖 / 全局 floor。
              cooldownUntil: firstChunkEmitted ? void 0 : cooldownUntilOf(gerr)
            });
            if (!firstChunkEmitted && gerr.kind === UpstreamErrorKind2.Auth && item.endpoint.provider === "sensenova") {
              try {
                runtime.onSensenovaKeyInvalid?.(item.endpoint.credentialKey[1]);
              } catch {
              }
            }
            if (firstChunkEmitted) {
              console.warn(`[as-one] stream cut after first chunk (${model}): ${gerr.detail}`);
              return;
            }
            lastError = gerr;
            if (canFailover(gerr, item.endpoint.provider) && policy.shouldRetry(gerr) && !alreadyTried && attempt < maxAttempts) {
              const delayS = policy.delayFor(attempt);
              console.warn(
                `[as-one] failover ${attempt}/${maxAttempts} model=${model} endpoint=${item.endpoint.endpointId} kind=${gerr.kind}: ${gerr.detail} (\u9000\u907F ${delayS.toFixed(2)}s \u540E\u6362\u6863)`
              );
              await sleepMs(delayS * 1e3);
              continue;
            }
            throw gerr;
          } finally {
            try {
              scheduler.invalidate();
            } catch {
            }
          }
        }
      },
      async complete(req) {
        const sessionId = sessionOf(req);
        const affinityKey = affinityKeyOf(req);
        let snRuntime = null;
        let snConnector = null;
        const bridged = await bridgeImagesIfNeeded(req, sessionId ?? "");
        const tried = /* @__PURE__ */ new Set();
        const preemptedEndpoints = /* @__PURE__ */ new Set();
        const policy = policyOf(!directRequest);
        const maxAttempts = directRequest ? Math.max(1, Math.min(policy.maxAttempts, MAX_FAILOVER_ATTEMPTS, routerChain.length)) : Math.max(
          1,
          Math.min(
            MAX_FAILOVER_ATTEMPTS,
            Math.max(policy.maxAttempts, routerChain.length)
          )
        );
        let lastError = null;
        let stripReasoningEffort = false;
        const t0 = performance.now();
        for (let attempt = 1; ; attempt += 1) {
          const plan = router.plan({
            // ⚠️ **被抢占过的端点不再选**(m02240):同 stream() 口径。
            chain: preemptedEndpoints.size === 0 ? routerChain : routerChain.filter((it) => !preemptedEndpoints.has(it.endpoint.endpointId)),
            sessionId: affinityKey,
            // ⚠️ 桥接后消息里已无图 → needs_vision 自然为 false,
            // 选路走普通的非视觉池(与 Nexus 同一口径)。
            needsVision: hasVision(bridged.messages),
            ignoreCooldown: directRequest
          });
          const item = plan.item;
          if (!item) throw planErrorOf(plan.reason ?? "", lastError);
          const alreadyTried = tried.has(item.endpoint.endpointId);
          tried.add(item.endpoint.endpointId);
          let preemptedBy = null;
          const abort = new AbortController();
          let clientGone = false;
          const clientSignal = req.clientSignal;
          const onClientAbort = () => {
            clientGone = true;
            abort.abort();
          };
          if (clientSignal) {
            if (clientSignal.aborted) {
              clientGone = true;
              abort.abort();
            } else {
              clientSignal.addEventListener("abort", onClientAbort, { once: true });
            }
          }
          const leaseId = router.commit(item, {
            logicalName: model,
            sessionId: affinityKey,
            stream: false,
            onPreempt: (reason) => {
              preemptedBy = reason;
              abort.abort();
            }
          });
          if (!leaseId) throw planErrorOf("all_busy", null);
          const wantedEffort = stripReasoningEffort ? void 0 : resolveReasoningEffort(
            bridged.reasoning_effort,
            runtime.reasoningEffortsOf?.(item.endpoint.provider, item.endpoint.model),
            runtime.reasoningAllowsOffOf?.(item.endpoint.provider, item.endpoint.model) ?? null
          ).effort;
          const bodyReq = { ...bridged, reasoning_effort: wantedEffort };
          try {
            const protocol = item.endpoint.protocol;
            const peer = await preparePeer(item, vault);
            const { url, headers, connector, creds } = peer;
            const clamped = clampMaxTokens(
              bridged.maxTokensClient ?? bridged.max_tokens,
              item.endpoint.maxOutputTokens ?? null,
              logicalOutputCapOf(model)
            );
            const body = bodyForProtocol(item.endpoint.provider, protocol, { ...bodyReq, model: item.endpoint.model, max_tokens: clamped }, creds);
            const timer = armConnectTimeout(abort, requestTimeoutMs());
            let res;
            try {
              if (protocol === "sensenova") {
                snConnector = connector;
                const sn = await runSensenova(peer, body, model, abort.signal);
                res = sn.res;
                snRuntime = sn.runtime;
              } else if (protocol === "qoder") {
                snConnector = connector;
                const q = await runQoder(peer, body, model, abort.signal);
                res = q.res;
                snRuntime = q.runtime;
              } else {
                res = isWorkbuddyWire(protocol) ? await postWorkbuddyWithGate(url, headers, body, abort.signal, connector) : await fetch(url, {
                  method: "POST",
                  headers: upstreamHeaders(headers),
                  body: JSON.stringify(body),
                  signal: abort.signal
                });
              }
            } finally {
              if (timer !== null) clearTimeout(timer);
            }
            if (!res.ok) {
              throw await classifyResponse(res, connector);
            }
            let data;
            if (protocol === "openai" && !req.stream) {
              data = await res.json();
            } else {
              const completionId = completionIdOf();
              const created = createdOf();
              const chunks = iterUpstreamChunks(res.body, wireProtocolOf(protocol), { completionId, created, model: req.model }, item.endpoint.provider);
              data = await aggregateCompletion(chunks, { model: req.model, completionId, created });
            }
            if (snRuntime) {
              snConnector?.recordSpendFor(snRuntime.name, data.usage, 0);
            }
            router.finish(item, {
              leaseId,
              ok: true,
              status: 200,
              latencyMs: Math.round(performance.now() - t0),
              promptTokens: data.usage?.prompt_tokens,
              completionTokens: data.usage?.completion_tokens,
              cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens
            });
            if (stripReasoningEffort) {
              runtime.onReasoningEffortLearned?.(item.endpoint.provider, item.endpoint.model);
            }
            return data;
          } catch (err) {
            if (preemptedBy !== null) {
              router.finish(item, {
                leaseId,
                ok: false,
                preempted: true,
                status: 0,
                error: preemptedBy,
                latencyMs: Math.round(performance.now() - t0)
              });
              preemptedEndpoints.add(item.endpoint.endpointId);
              console.warn(
                `[as-one] preempted by direct request (${model}) endpoint=${item.endpoint.endpointId}: ${preemptedBy} \u2192 \u6362\u6863`
              );
              if (attempt < maxAttempts) {
                continue;
              }
              throw new UpstreamError(
                UpstreamErrorKind2.Upstream,
                `\u88AB\u76F4\u8FDE\u8BF7\u6C42\u62A2\u5360,\u4E14\u5DF2\u65E0\u66F4\u591A\u6863\u4F4D\u53EF\u6362:${preemptedBy}`,
                { statusCode: 503 }
              );
            }
            if (clientGone) {
              router.finish(item, {
                leaseId,
                ok: false,
                status: 0,
                error: "\u5BA2\u6237\u7AEF\u65AD\u5F00",
                kind: "client_disconnected",
                latencyMs: Math.round(performance.now() - t0)
              });
              throw new UpstreamError(UpstreamErrorKind2.Connection, "\u5BA2\u6237\u7AEF\u65AD\u5F00");
            }
            const gerr = toGatewayError(err);
            if (!stripReasoningEffort && isReasoningEffortRejection(gerr.detail)) {
              router.finish(item, {
                leaseId,
                ok: false,
                voidAttempt: true,
                status: 0,
                error: `reasoning_effort \u4E0D\u88AB\u652F\u6301,\u4E22\u53C2\u91CD\u8BD5:${gerr.detail}`,
                latencyMs: Math.round(performance.now() - t0)
              });
              stripReasoningEffort = true;
              console.warn(
                `[as-one] reasoning_effort rejected (${model}, ${item.endpoint.endpointId}) \u2192 \u4E22\u53C2\u91CD\u8BD5: ${gerr.detail}`
              );
              if (attempt < maxAttempts) {
                continue;
              }
            }
            router.finish(item, {
              leaseId,
              ok: false,
              status: httpStatusOf(gerr),
              error: gerr.detail,
              kind: gerr.kind,
              latencyMs: Math.round(performance.now() - t0),
              cooldownUntil: cooldownUntilOf(gerr)
            });
            if (gerr.kind === UpstreamErrorKind2.Auth && item.endpoint.provider === "sensenova") {
              try {
                runtime.onSensenovaKeyInvalid?.(item.endpoint.credentialKey[1]);
              } catch {
              }
            }
            lastError = gerr;
            if (canFailover(gerr, item.endpoint.provider) && policy.shouldRetry(gerr) && !alreadyTried && attempt < maxAttempts) {
              const delayS = policy.delayFor(attempt);
              console.warn(
                `[as-one] failover ${attempt}/${maxAttempts} model=${model} endpoint=${item.endpoint.endpointId} kind=${gerr.kind}: ${gerr.detail} (\u9000\u907F ${delayS.toFixed(2)}s \u540E\u6362\u6863)`
              );
              await sleepMs(delayS * 1e3);
              continue;
            }
            throw gerr;
          } finally {
            try {
              scheduler.invalidate();
            } catch {
            }
          }
        }
      },
      // 真实模型直连判 404 用;阶段一统一返回 undefined(未知)。
      hasModel() {
        return void 0;
      }
    };
  };
}

// src/setup.ts
var sensenovaPoolConnector = new SensenovaAdapter();
registerConnector(sensenovaPoolConnector);
async function syncSensenovaPool(vault) {
  try {
    const creds = await vault.list("sensenova").catch(() => []);
    const accounts = [];
    for (const c of creds) {
      const full = await vault.get("sensenova", c.username).catch(() => null);
      const key3 = full?.secret?.trim();
      if (!key3) continue;
      accounts.push({ username: c.username, api_key: key3, enabled: true });
    }
    sensenovaPoolConnector.setAccounts(accounts);
  } catch (err) {
    console.error("[as-one] sensenova account pool sync failed:", err);
  }
}
function settingOf(db, key3) {
  const row = db.setting.get(key3);
  return row ? row.v : null;
}
function numSetting(db, key3, def, min = 0) {
  const raw = settingOf(db, key3);
  if (raw === null || raw === "") return def;
  const n = Number(raw);
  if (Number.isNaN(n) || n < min) return def;
  return n;
}
function parseMembers(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const item of arr) {
      if (typeof item === "string") {
        const pair = splitModelId2(item);
        if (pair) out.push({ provider: pair[0], model: pair[1] });
      } else if (item !== null && typeof item === "object") {
        const o = item;
        const p = o.provider;
        const m = o.model;
        if (typeof p === "string" && typeof m === "string" && p !== "" && m !== "") {
          out.push({ provider: p, model: m });
        } else if (typeof o.real_model_id === "string") {
          const pair = splitModelId2(o.real_model_id);
          if (pair) out.push({ provider: pair[0], model: pair[1] });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}
function parseEfforts(raw) {
  if (raw === null || raw === void 0) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.filter((x) => typeof x === "string");
  } catch {
    return null;
  }
}
function parseAllowsOff(raw) {
  if (raw === null || raw === void 0) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  return null;
}
async function setupAsOne(options) {
  const { configDir, dbPath } = options;
  const env2 = options.env ?? process.env;
  const startedAtMs = Date.now();
  mkdirSync2(configDir, { recursive: true });
  const db = openDatabase(dbPath);
  const providersPath = join7(configDir, "as-one.providers.json");
  const registry = ProviderRegistry.fromSnapshot(snapshotFromDb(db).snapshot, {
    filePath: providersPath
  });
  const syncRegistry = () => {
    try {
      registry.refreshFromSnapshot(snapshotFromDb(db).snapshot);
    } catch (err) {
      console.error("[as-one] registry reprojection failed:", err);
    }
  };
  const vault = new CredentialVault(new DbCredentialBackend(db));
  await syncSensenovaPool(vault);
  const secretPresence = /* @__PURE__ */ new Map();
  for (const pdef of registry.listProviders()) {
    try {
      for (const username of (await vault.secretsFor(pdef.id)).keys()) {
        secretPresence.set(`${pdef.id}/${username}`, true);
      }
    } catch (err) {
      console.error(`[as-one] credential probe failed for provider ${pdef.id}:`, err);
    }
  }
  const accountOverlay = /* @__PURE__ */ new Map();
  const repo = new AppSchedulerRepo(db, registry, {
    hasSecret: (ref) => secretPresence.get(ref) ?? false,
    isAccountEnabled: (ref) => accountOverlay.get(ref) ?? (registry.getAccount(ref)?.enabled ?? false),
    // 运行期额度快照:与 electron 同一份投影(`@as-one/panel` 模块级 chQuotaCache)。
    // 没喂它 → due-first 的 `_expiryOf()` 两个来源全空 → 排序键并列 → 只能按
    // members 数组序,「到期早的先上」等于没生效(用户 m17562/m34799)。
    // 面板刷新写完缓存后会 `scheduler.invalidate()`,所以这里不必自己缓存。
    quotaSnapshot: () => chQuotaTableForScheduler()
  });
  const scheduler = new Scheduler(repo, {});
  const router = new Router(repo, {
    // 会话粘性活读设置项(与 electron 同口径:default 900s;0 = 关掉粘性)。
    pinSecondsOf: () => numSetting(db, "scheduler.pin_seconds", 900),
    onCommit: () => {
      try {
        scheduler.invalidate();
      } catch {
      }
    }
  });
  const keyProvider = new EnvKeyProvider("ONE_API_KEY", env2);
  const logDir = options.logDir ?? join7(configDir, "logs");
  const requestLogWriter = new RequestLogWriter(logDir);
  const requestLogMode = createContentModeResolver((key3) => settingOf(db, key3));
  const onRequestDone = (info) => {
    let realModelId;
    let endpointId;
    try {
      const affinityKeys = /* @__PURE__ */ new Set();
      if (info.session_id) affinityKeys.add(info.session_id);
      if (info.prompt_cache_key) affinityKeys.add(info.prompt_cache_key);
      const matched = router.ledger.recentRows(40).find(
        (r) => r.lease.logicalModel === info.model && r.lease.stream === info.stream && (affinityKeys.size === 0 || affinityKeys.has(r.lease.sessionId))
      );
      if (matched) {
        realModelId = matched.lease.realModelId;
        endpointId = matched.lease.endpointId;
      }
    } catch {
    }
    const logicalName = repo.logicalModelRow(info.model) !== null ? info.model : null;
    const row = {
      ts: Date.now() / 1e3,
      real_model_id: realModelId,
      logical_model: logicalName,
      username: endpointId ? endpointId.split("@")[1]?.split("/")[1] : void 0,
      session_id: info.session_id ?? null,
      prompt_cache_key: info.prompt_cache_key ?? null,
      discarded_fields: info.discarded_fields ?? null,
      status: info.status,
      ok: info.ok,
      error: info.error ?? void 0,
      error_kind: info.error_kind ?? void 0,
      latency_ms: info.latency_ms,
      ttft_ms: info.ttft_ms,
      usage: info.usage ?? void 0,
      request: info.request
    };
    try {
      logRequests([row], {
        record: (delta) => db.statsDaily.record(delta),
        writer: requestLogWriter,
        getSetting: (key3) => settingOf(db, key3),
        getContentMode: requestLogMode
      });
    } catch {
    }
  };
  let sensenovaKeyRepair = null;
  const resolveUpstream = buildResolveUpstream({
    scheduler,
    router,
    registry,
    vault,
    // 逻辑模型级输出上限(成员链最小值)—— `max_tokens` 钳制要用。
    // 唯一真源 = db(不读 registry:面板删掉的模型不该还参与钳制)。
    logicalOutputCap: (logicalName) => {
      const row = db.logicalModel.get(logicalName);
      if (!row) return null;
      const members = parseMembers(row.members);
      if (members.length === 0) return null;
      const caps = [];
      for (const m of members) {
        const dbRow = db.realModel.get(m.provider, m.model);
        const rdef = registry.getRealModel(m.provider, m.model);
        const cap = dbRow?.max_output_tokens ?? rdef?.maxOutputTokens ?? null;
        if (cap === null || cap === void 0) return null;
        caps.push(cap);
      }
      return caps.length > 0 ? Math.min(...caps) : null;
    },
    // 思考强度能力表(三态:NULL 不拦 / [] 一律不发 / [...] 钳制)。
    reasoningEffortsOf: (provider, model) => parseEfforts(db.realModel.get(provider, model)?.supported_reasoning_efforts),
    reasoningAllowsOffOf: (provider, model) => parseAllowsOff(db.realModel.get(provider, model)?.reasoning_allows_off),
    // 上游拒了 reasoning_effort → 丢参重试成功 ⇒ 清空能力表(学习结果)。
    onReasoningEffortLearned: (provider, model) => {
      try {
        db.realModel.update({ provider, model, supported_reasoning_efforts: null });
      } catch (err) {
        console.error("[as-one] \u6E05\u7A7A\u601D\u8003\u5F3A\u5EA6\u80FD\u529B\u8868\u5931\u8D25:", err);
      }
    },
    // 连接超时(秒)= 设置项 `real.wait_budget_s`;0 = 不设超时;坏值回退 60。
    requestTimeoutMs: () => numSetting(db, "real.wait_budget_s", 60),
    // 重试策略(次数上限 + 退避 + 可重试白名单);一次读齐,请求内前后一致。
    retryPolicy: (abstract) => RetryPolicy.of(
      {
        getSetting: (key3) => settingOf(db, key3),
        setSetting: (key3, value) => {
          db.setting.set(key3, value);
        }
      },
      { abstract }
    ),
    // ⚠️ **凭据类失败 → 后台换 key**(用户 m16528)。这里是**不阻塞**的:换 key
    //    要登录 + 建 key + 等 IAM 传播(实测 ~8s),原地等会把这次请求的 TTFT
    //    硬拖 8 秒起跳;换档去别的账号**立刻**能试。冷却照常落(按
    //    `scheduler.cooldown_overrides` 里的 sensenova 设置值),后台修好 + 冷却
    //    到期 ⇒ 下一跳即用新 key。
    //    自愈实现由 `setSensenovaKeyRepair` 后挂(面板构造完才有)。
    onSensenovaKeyInvalid: (username) => {
      const repair = sensenovaKeyRepair;
      if (!repair) return;
      void repair(username, "\u4E0A\u6E38\u8FD4\u56DE 401/403:API key \u65E0\u6548\u6216\u5DF2\u88AB\u56DE\u6536").then((r) => {
        console.warn(
          `[as-one] [sensenova] key \u81EA\u6108 ${r.ok ? "\u5B8C\u6210" : "\u672A\u6210\u529F"}(${username}):${r.message}`
        );
        if (!r.ok) return;
        try {
          router.thawAccount("sensenova", username);
        } catch {
        }
      }).catch((err) => {
        console.error(
          `[as-one] [sensenova] key \u81EA\u6108\u5F02\u5E38(${username}):${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
  });
  return {
    configDir,
    dbPath,
    logDir,
    db,
    registry,
    vault,
    repo,
    scheduler,
    router,
    ledger: router.ledger,
    health: router.health,
    keyProvider,
    accountOverlay,
    secretPresence,
    syncRegistry,
    resolveUpstream,
    listModels: async () => listModelEntries(registry, db, await providersWithCredentials(registry, vault)),
    onRequestDone,
    startedAtMs,
    setSensenovaKeyRepair(fn) {
      sensenovaKeyRepair = fn;
    },
    dispose() {
      try {
        sensenovaPoolConnector.setAccounts([]);
      } catch {
      }
      vault.close();
      registry.close();
      db.close();
    }
  };
}

// ../core/src/gateway/session.ts
var HASH_LIMIT = 4e3;
function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
      } else if (item !== null && typeof item === "object") {
        const text = item["text"];
        if (typeof text === "string") parts.push(text);
      }
    }
    return parts.join("\n");
  }
  return "";
}
function sha256Hex(text) {
  const nodeCrypto = globalThis.require;
  try {
    if (typeof nodeCrypto === "function") {
      const mod = nodeCrypto("node:crypto");
      if (mod?.createHash) {
        return mod.createHash("sha256").update(text, "utf-8").digest("hex");
      }
    }
  } catch {
  }
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c + i, 2246822507) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
function deriveSessionId(messages, limit = HASH_LIMIT) {
  if (!Array.isArray(messages)) return "";
  for (const msg of messages) {
    if (msg === null || typeof msg !== "object") continue;
    const role = msg["role"];
    if (String(role ?? "") !== "user") continue;
    const text = textOf(msg["content"]).trim();
    if (!text) continue;
    const digest = sha256Hex(text.slice(0, limit));
    return `lnx-${digest.slice(0, 32)}`;
  }
  return "";
}
function sessionIdOf(body, model = "") {
  if (body === null || typeof body !== "object") return void 0;
  const b = body;
  const meta = b["metadata"];
  if (meta !== null && typeof meta === "object") {
    const value = meta["session_id"] ?? meta["user"];
    if (value) return String(value);
  }
  for (const field of ["litellm_metadata", "user"]) {
    const holder = b[field];
    if (holder !== null && typeof holder === "object") {
      const value = holder["session_id"];
      if (value) return String(value);
    }
  }
  const derived = deriveSessionId(b["messages"]);
  if (derived === "") return void 0;
  return model ? `${model}:${derived}` : derived;
}

// src/wire.ts
var MAX_BODY_BYTES = 64 * 1024 * 1024;
async function readJsonBody(req, limitBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limitBytes) {
      throw new GatewayHttpError(413, { detail: "\u8BF7\u6C42\u4F53\u8FC7\u5927" });
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new GatewayHttpError(400, { detail: "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON" });
  }
}
function writeJson(res, status, body, headers, rawBody) {
  const payload = rawBody !== void 0 ? Buffer.from(rawBody, "utf8") : Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": String(payload.length),
    ...headers
  });
  res.end(payload);
}
function toUpstreamRequest(body, stream) {
  const mtClient = body.max_tokens || body.max_completion_tokens;
  const reasoningEffort = reasoningEffortOf(body);
  return {
    model: String(body.model ?? ""),
    messages: Array.isArray(body.messages) ? body.messages : [],
    stream,
    temperature: body.temperature,
    max_tokens: mtClient,
    maxTokensClient: mtClient,
    top_p: body.top_p,
    stop: body.stop,
    tools: body.tools,
    tool_choice: body.tool_choice,
    ...reasoningEffort === void 0 ? {} : { reasoning_effort: reasoningEffort },
    extra: {}
  };
}

// src/routes.ts
function usageOf(usage) {
  if (!usage) return null;
  const details = usage.prompt_tokens_details ?? {};
  const num2 = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    prompt_tokens: num2(usage.prompt_tokens),
    cached_tokens: num2(details.cached_tokens),
    completion_tokens: num2(usage.completion_tokens)
  };
}
function buildGatewayRoutes(rt, opts = {}) {
  const logger = opts.logger ?? console;
  const authGuard = (req, res) => {
    const denied = requireKey(req, rt.keyProvider);
    if (denied) {
      writeJson(res, denied.status, denied.body);
      return true;
    }
    return false;
  };
  const done = (info) => {
    try {
      rt.onRequestDone(info);
    } catch (err) {
      logger.error?.("[as-one] onRequestDone failed", err);
    }
  };
  return [
    {
      kind: "exact",
      path: "/v1/models",
      handler: async (req, res) => {
        const nreq = req;
        const nres = res;
        if ((nreq.method ?? "GET").toUpperCase() !== "GET") {
          writeJson(nres, 405, { detail: `Method Not Allowed: ${nreq.method} GET` });
          return;
        }
        if (authGuard(nreq, nres)) return;
        writeJson(nres, 200, { object: "list", data: await rt.listModels() });
      }
    },
    {
      kind: "exact",
      path: "/v1/chat/completions",
      handler: async (req, res) => {
        const nreq = req;
        const nres = res;
        let model = "";
        let stream = false;
        let sessionId = null;
        let cacheKey = null;
        let discarded = null;
        let body = {};
        const t0 = Date.now();
        try {
          if ((nreq.method ?? "POST").toUpperCase() !== "POST") {
            writeJson(nres, 405, { detail: `Method Not Allowed: ${nreq.method} POST` });
            return;
          }
          if (authGuard(nreq, nres)) return;
          body = await readJsonBody(req);
          model = String(body.model ?? "").trim();
          if (!model) throw new GatewayHttpError(400, { detail: "\u7F3A\u5C11 model" });
          stream = Boolean(body.stream);
          sessionId = sessionIdOf(body, model) ?? null;
          cacheKey = cacheRoutingKeyOf(body) ?? null;
          const fields = classifyRequestFields(body);
          discarded = fields.discarded.length > 0 ? fields.discarded : null;
          const upstream = rt.resolveUpstream(model);
          if (!upstream) throw new GatewayHttpError(404, { detail: `\u672A\u77E5\u6A21\u578B: ${model}` });
          const signal = clientDisconnectSignal(nreq, nres);
          const upstreamReq = toUpstreamRequest(body, stream);
          upstreamReq.prompt_cache_key = cacheKey ?? void 0;
          upstreamReq.discarded_fields = discarded ?? void 0;
          upstreamReq.extra = { ...upstreamReq.extra ?? {}, session_id: sessionId ?? void 0 };
          if (stream) {
            await forwardStream(
              nres,
              upstream,
              upstreamReq,
              signal,
              (outcome, usage, firstChunkMs, totalMs2) => {
                if (outcome !== "ok") {
                  logger.warn?.(
                    `[as-one] stream ${outcome} model=${model} ttft=${firstChunkMs ?? "-"}ms total=${totalMs2}ms`
                  );
                }
                done({
                  model,
                  stream: true,
                  // 已发字节后失败:状态码仍是 200(客户端拿到的是断流);
                  // 客户端断开(未发响应)= 0,与 core 口径一致。
                  ok: outcome === "ok",
                  status: outcome === "client_disconnected" ? 0 : 200,
                  error: outcome === "ok" ? null : outcome === "client_disconnected" ? "\u5BA2\u6237\u7AEF\u65AD\u5F00" : "\u6D41\u5F0F\u4F20\u8F93\u4E2D\u65AD",
                  error_kind: outcome === "ok" ? null : outcome === "client_disconnected" ? "connection" : "timeout",
                  latency_ms: Math.round(totalMs2),
                  ttft_ms: firstChunkMs === void 0 ? null : Math.round(firstChunkMs),
                  usage: usageOf(usage),
                  session_id: sessionId,
                  prompt_cache_key: cacheKey,
                  discarded_fields: discarded,
                  request: body
                });
              }
            );
            return;
          }
          const payload = await upstream.complete(upstreamReq);
          const totalMs = Date.now() - t0;
          writeJson(nres, 200, payload);
          done({
            model,
            stream: false,
            ok: true,
            status: 200,
            error: null,
            error_kind: null,
            latency_ms: totalMs,
            ttft_ms: null,
            usage: usageOf(payload.usage),
            session_id: sessionId,
            prompt_cache_key: cacheKey,
            discarded_fields: discarded,
            request: body
          });
        } catch (exc) {
          const mapped = exc instanceof GatewayHttpError ? exc : exc instanceof UpstreamError ? upstreamErrorToHttp(exc) : null;
          if (mapped) {
            writeJson(nres, mapped.status, mapped.body, mapped.headers, mapped.rawBody);
          } else {
            logger.error?.("[as-one] chat completions internal error", exc);
            writeJson(nres, 500, { detail: "Internal Server Error" });
          }
          done({
            model,
            stream,
            ok: false,
            status: mapped ? mapped.status : 500,
            error: exc instanceof Error ? exc.message : String(exc),
            error_kind: exc instanceof UpstreamError ? exc.kind : null,
            latency_ms: Date.now() - t0,
            ttft_ms: null,
            usage: null,
            session_id: sessionId,
            prompt_cache_key: cacheKey,
            discarded_fields: discarded,
            request: body
          });
        }
      }
    }
  ];
}

// src/panel-host.ts
function createPanelHost(rt, options = {}) {
  const port = options.gatewayPort ?? 4e3;
  const gatewayHost = options.gatewayHost ?? "127.0.0.1";
  const gatewayState = {
    gateway: {
      port,
      close: async () => void 0
    },
    error: null
  };
  const ctx = {
    db: rt.db,
    registry: rt.registry,
    vault: rt.vault,
    scheduler: rt.scheduler,
    router: rt.router,
    ledger: rt.ledger,
    health: rt.health,
    keyProvider: rt.keyProvider,
    gatewayState,
    gatewayHost,
    restartGateway: async () => "\u63D2\u4EF6\u6A21\u5F0F:\u7F51\u5173\u7531\u5BBF\u4E3B DSH \u8FDB\u7A0B\u6258\u7BA1,\u9762\u677F\u4E0D\u80FD\u91CD\u542F\u5B83(\u91CD\u8F7D\u63D2\u4EF6\u5373\u91CD\u5EFA\u8DEF\u7531)",
    startedAtMs: rt.startedAtMs,
    accountOverlay: rt.accountOverlay,
    configDir: rt.configDir,
    dbPath: rt.dbPath,
    secretPresence: rt.secretPresence,
    syncRegistry: rt.syncRegistry
  };
  const bundle = createPanel(ctx, { syncSensenovaPool });
  rt.setSensenovaKeyRepair(bundle.snRepairKey);
  return {
    panel: bundle.panel,
    dispatch: (method, args) => dispatchPanel(bundle.panel, method, args),
    ctx,
    bundle
  };
}

// src/panel-routes.ts
var PANEL_METHODS = [
  // 总览 / 运行期
  "getStatus",
  "getRuntime",
  "restartGateway",
  // 用量
  "getUsageHistory",
  // 逻辑模型
  "getLogicalModels",
  "writeLogicalModel",
  "removeLogicalModel",
  // 模型总览(部署)
  "getDeployments",
  "setDeploymentExposure",
  "getModelProviders",
  "upsertModelProvider",
  "removeModelProvider",
  "fetchModels",
  "setModelExposure",
  "checkModels",
  "getMetrics",
  "checkModel",
  // 渠道(SenseNova / Trae / WorkBuddy)
  "getSensenovaAccounts",
  "getQuota",
  "getProviderPage",
  "getChannelAccounts",
  "checkinStatus",
  "checkinClaim",
  "refreshStatus",
  "refreshRun",
  "syncChannel",
  "setChannelModels",
  "setChannelModel",
  "getClientPaths",
  "saveClientPath",
  "detectClientPath",
  "discoverChannelAccounts",
  "adoptChannelAccount",
  // 设置
  "getSettings",
  "saveSettings",
  "getRequestLog",
  "setRequestLog",
  // sensenova 页
  "getSensenovaStatus",
  "getSensenovaModels",
  "setSensenovaExposure",
  "sensenovaRefresh",
  "sensenovaLogin",
  "sensenovaSavePassword",
  "sensenovaRefetchKey",
  "sensenovaAddAccount",
  "sensenovaRemoveAccount",
  // qoder 页
  "getQoderAccounts",
  "getQoderStatus",
  "getQoderModels",
  "qoderRefreshCatalog",
  "qoderSetModelEnabled",
  "qoderCredits",
  "qoderCheckin",
  "qoderCampaigns",
  "qoderAddAccount",
  "qoderRemoveAccount",
  "qoderSetAccountEnabled",
  "qoderProbeChat",
  "qoderRecentErrors",
  // 数据目录
  "getDataDir",
  // 旧兼容
  "listProviders",
  "setAccountEnabled",
  "getRecentRequests",
  "getRequestLogStatus"
];
var LEGACY_ARGS = {
  setAccountEnabled: (b) => [String(b.provider ?? ""), Number(b.index), Boolean(b.enabled)],
  getRecentRequests: (b) => b.limit === void 0 ? [] : [Number(b.limit)],
  getUsageHistory: (b) => [
    String(b.range ?? "all"),
    String(b.granularity ?? "day"),
    String(b.group ?? "model")
  ],
  removeLogicalModel: (b) => [String(b.name ?? "")],
  writeLogicalModel: (b) => [b.input ?? b],
  getQuota: (b) => [String(b.provider ?? "")],
  getProviderPage: (b) => [String(b.provider ?? "")],
  getChannelAccounts: (b) => [String(b.provider ?? "")],
  syncChannel: (b) => [String(b.provider ?? ""), Boolean(b.force)],
  checkModel: (b) => [String(b.provider ?? ""), String(b.model ?? "")],
  saveSettings: (b) => [b.updates ?? b],
  setRequestLog: (b) => [
    b.enabled === void 0 ? void 0 : Boolean(b.enabled),
    String(b.contentMode ?? b.content_mode ?? "off")
  ]
};
function ok(value) {
  return { ok: true, value };
}
function fail(code, message) {
  return { ok: false, error: { code, message } };
}
function argsOf(method, body) {
  if (Array.isArray(body)) return body;
  if (body === null || typeof body !== "object") return [];
  const rec = body;
  if (Array.isArray(rec.args)) return rec.args;
  const legacy = LEGACY_ARGS[method];
  return legacy ? legacy(rec) : [];
}
function buildPanelRoutes(rt, options = {}) {
  const host = createPanelHost(rt, options);
  const route = (path, method) => ({
    kind: "exact",
    path,
    handler: async (req, res) => {
      if ((req.method ?? "GET").toUpperCase() !== "POST") {
        writeJson(res, 405, fail("method_not_allowed", `expected POST, got ${req.method ?? "?"}`));
        return;
      }
      try {
        const body = await readJsonBody(req);
        const value = method === "getUsageSummary" ? await host.dispatch("getUsageHistory", ["all", "day", "model"]) : await host.dispatch(method, argsOf(method, body));
        writeJson(res, 200, ok(value));
      } catch (err) {
        const detail2 = err instanceof Error ? err.message : String(err);
        const status = typeof err.status === "number" ? err.status : 500;
        writeJson(res, status, fail("internal_error", detail2));
      }
    }
  });
  const routes = PANEL_METHODS.map((m) => route(`/as-one/api/${m}`, m));
  routes.push(route("/as-one/api/getUsageSummary", "getUsageSummary"));
  return routes;
}

// src/llm-adapter.ts
var AS_ONE_PROVIDER = "as-one";
var AS_ONE_PROVIDER_NAME = "As One \xB7 \u5408\u4E00";
var AsOneLlmError = class extends Error {
  code;
  failure;
  constructor(message, code, extra = {}) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    const failure = { message, code };
    if (typeof extra.status === "number" && Number.isInteger(extra.status) && extra.status >= 100 && extra.status <= 599) {
      failure.status = extra.status;
    }
    if (typeof extra.providerRetryAfterMs === "number" && Number.isFinite(extra.providerRetryAfterMs) && extra.providerRetryAfterMs > 0) {
      failure.providerRetryAfterMs = extra.providerRetryAfterMs;
    }
    if (typeof extra.requestId === "string" && extra.requestId.length > 0) {
      failure.requestId = extra.requestId;
    }
    this.failure = Object.freeze(failure);
  }
};
var KIND_TO_CODE = {
  rate_limit: "RATE_LIMIT",
  auth: "AUTH",
  auth_challenge: "AUTH",
  bad_request: "INVALID_REQUEST",
  timeout: "TIMEOUT",
  connection: "TRANSPORT",
  upstream: "SERVER",
  already_streaming: "INVALID_REQUEST"
};
function toLlmError(err, fallbackMessage) {
  if (err instanceof AsOneLlmError) return err;
  if (err instanceof UpstreamError) {
    const code = KIND_TO_CODE[err.kind] ?? "SERVER";
    const status = typeof err.statusCode === "number" ? err.statusCode : void 0;
    const message2 = err.raw?.text?.trim() || err.detail || err.kind;
    return new AsOneLlmError(message2, code, {
      status,
      providerRetryAfterMs: typeof err.retryAfter === "number" ? Math.round(err.retryAfter * 1e3) : void 0
    });
  }
  const message = err instanceof Error && err.message ? err.message : fallbackMessage;
  return new AsOneLlmError(message, "SERVER");
}
function positiveInt(v) {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : void 0;
}
function modelInfoOf(entry, provider = AS_ONE_PROVIDER) {
  const info = {
    provider,
    id: entry.id,
    // 选择器上显示的就是这个字段(宿主 buildModelCatalog 取 model.name)。
    // 优先用清单算好的 `display_name` —— 它是**整张表**去重后的名字;裸 `name`
    // 单独看没问题,摆在一起会和逻辑模型撞车(用户 m44638)。
    name: entry.display_name ?? entry.name ?? entry.id,
    description: entry.litenexus_kind === "logical" ? `\u903B\u8F91\u6A21\u578B \xB7 \u7531 ${entry.owned_by} \u8C03\u5EA6` : `\u771F\u5B9E\u6A21\u578B \xB7 ${entry.owned_by}`,
    // 一律声明纯文本:宿主会自己把图片投影成文字(projectImagesForTextModel),
    // 比我们无声丢图后模型答非所问要好。
    inputModalities: ["text"],
    systemPromptUpdate: "in-history",
    toolUpdate: "in-history"
  };
  const ctx = positiveInt(entry.max_input_tokens);
  if (ctx !== void 0) info.context = { contextWindow: ctx };
  const out = positiveInt(entry.max_output_tokens);
  if (out !== void 0) info.defaultMaxTokens = out;
  const efforts = Array.isArray(entry.reasoning_efforts) ? entry.reasoning_efforts : [];
  if (efforts.length > 0) {
    const list = efforts.filter((e) => typeof e === "string" && e.length > 0).map((id) => ({ id, name: id }));
    if (entry.reasoning_allows_off === true) list.push({ id: "off", name: "off" });
    if (list.length > 0) info.reasoning = { efforts: list };
  }
  return info;
}
function blockText(block) {
  if (block.type === "text" || block.type === "reasoning") {
    const t = block.text;
    return typeof t === "string" ? t : "";
  }
  return "";
}
function messageText(message) {
  return (message.content ?? []).filter((b) => b.type === "text").map(blockText).filter((s) => s.length > 0).join("\n");
}
function toChatMessages(options) {
  const systemParts = [];
  if (typeof options.system === "string" && options.system.trim()) systemParts.push(options.system);
  const messages = [];
  for (const message of options.messages ?? []) {
    switch (message.role) {
      case "system":
      case "developer": {
        const text = messageText(message);
        if (text) systemParts.push(text);
        break;
      }
      case "assistant": {
        const text = messageText(message);
        const reasoning = (message.content ?? []).filter((b) => b.type === "reasoning").map((b) => blockText(b)).join("");
        const toolCalls = (message.content ?? []).filter((b) => b.type === "tool-call").map((b) => ({
          id: String(b.id ?? ""),
          type: "function",
          function: {
            name: String(b.name ?? ""),
            arguments: String(b.arguments ?? "")
          }
        })).filter((tc) => tc.id !== "" || tc.function.name !== "");
        messages.push({
          role: "assistant",
          // 只有 tool_calls 没有正文时给空串:`ChatMessageContent` 不收 null,
          // 而上游对 `content: ""` + `tool_calls` 的接受度比 null 更好。
          content: text,
          ...reasoning ? { reasoning_content: reasoning } : {},
          ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
        });
        break;
      }
      case "tool": {
        messages.push({
          role: "tool",
          content: messageText(message),
          tool_call_id: message.toolCallId ?? ""
        });
        break;
      }
      default: {
        messages.push({ role: "user", content: messageText(message) });
      }
    }
  }
  if (systemParts.length > 0) messages.unshift({ role: "system", content: systemParts.join("\n\n") });
  return messages;
}
function toChatTools(options) {
  const tools = options.tools;
  if (!Array.isArray(tools) || tools.length === 0) return void 0;
  return tools.filter((t) => typeof t?.name === "string" && t.name.length > 0).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));
}
function toUpstreamRequestFromOptions(options) {
  const maxTokens = positiveInt(options.maxTokens);
  return {
    model: options.model,
    messages: toChatMessages(options),
    stream: true,
    temperature: options.temperature,
    max_tokens: maxTokens,
    maxTokensClient: maxTokens,
    stop: Array.isArray(options.stop) && options.stop.length > 0 ? options.stop : void 0,
    tools: toChatTools(options),
    ...options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {},
    // 会话亲和:宿主每个会话给一个 sessionId,与 /v1 路由侧的 session_id 同义。
    prompt_cache_key: options.sessionId,
    extra: { session_id: options.sessionId },
    clientSignal: options.signal
  };
}
function usageFromOpenAI(usage) {
  const num2 = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
  const details = usage.prompt_tokens_details ?? {};
  const completionDetails = usage.completion_tokens_details ?? {};
  const inputTokens = num2(usage.prompt_tokens);
  const outputTokens = num2(usage.completion_tokens);
  const cacheReadTokens = num2(details.cached_tokens);
  const out = { inputTokens, outputTokens, totalTokens: num2(usage.total_tokens) || inputTokens + outputTokens };
  if (cacheReadTokens > 0) out.cacheReadTokens = cacheReadTokens;
  const reasoningTokens = num2(completionDetails.reasoning_tokens);
  if (reasoningTokens > 0) out.reasoningTokens = reasoningTokens;
  return out;
}
function finishKindOf(reason) {
  if (reason === "length") return "max-tokens";
  if (reason === "tool_calls" || reason === "function_call") return "tool-calls";
  return "stop";
}
async function* translateStream(source, modelName) {
  const blocks = /* @__PURE__ */ new Map();
  const order = [];
  let usage;
  let finishReason = null;
  let toolSeq = 0;
  const openBlock = function* (key3, type) {
    const existing = blocks.get(key3);
    if (existing) return;
    const block = { index: order.length, type, text: "" };
    blocks.set(key3, block);
    order.push(block);
    yield { type: "block-start", index: block.index, blockType: type };
  };
  try {
    for await (const chunk of source) {
      if (chunk.usage) usage = usageFromOpenAI(chunk.usage);
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta ?? {};
      if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
        yield* openBlock("reasoning", "reasoning");
        const block = blocks.get("reasoning");
        block.text += delta.reasoning_content;
        yield { type: "reasoning-delta", index: block.index, text: delta.reasoning_content };
      }
      if (typeof delta.content === "string" && delta.content.length > 0) {
        yield* openBlock("text", "text");
        const block = blocks.get("text");
        block.text += delta.content;
        yield { type: "text-delta", index: block.index, text: delta.content };
      }
      for (const call of delta.tool_calls ?? []) {
        const slot = typeof call.index === "number" ? call.index : toolSeq++;
        const key3 = `tool:${slot}`;
        let block = blocks.get(key3);
        if (!block) {
          yield* openBlock(key3, "tool-call");
          block = blocks.get(key3);
        }
        const id = call.id ?? "";
        const name2 = call.function?.name ?? "";
        const args = call.function?.arguments ?? "";
        if (id) block.toolCallId = id;
        if (name2) block.toolName = name2;
        block.text += args;
        yield {
          type: "tool-call-delta",
          index: block.index,
          id: block.toolCallId ?? `call-${block.index}`,
          ...block.toolName ? { name: block.toolName } : {},
          argumentsDelta: args
        };
      }
    }
  } catch (err) {
    for (const block of order) yield blockEndOf(block);
    throw toLlmError(err, `As One \u4E0A\u6E38\u6D41\u4E2D\u65AD(${modelName})`);
  }
  for (const block of order) yield blockEndOf(block);
  const kind = finishKindOf(finishReason);
  if (order.length === 0 && kind === "stop") {
    throw new AsOneLlmError(`As One \u672A\u8FD4\u56DE\u4EFB\u4F55\u5185\u5BB9(${modelName})`, "EMPTY_RESPONSE");
  }
  if (usage) yield { type: "usage", usage };
  yield { type: "finish", reason: { kind } };
}
function blockEndOf(block) {
  const content = block.type === "tool-call" ? {
    type: "tool-call",
    id: block.toolCallId ?? `call-${block.index}`,
    name: block.toolName ?? "",
    arguments: block.text
  } : { type: block.type, text: block.text };
  return { type: "block-end", index: block.index, block: content };
}
var AsOneLlmAdapter = class {
  constructor(rt, opts = {}) {
    this.rt = rt;
    this.provider = opts.provider ?? AS_ONE_PROVIDER;
    this.providerName = opts.providerName ?? AS_ONE_PROVIDER_NAME;
  }
  rt;
  provider;
  providerName;
  /** `id` 必须**逐字**等于注册时的 provider,否则宿主判 `INVALID_ADAPTER`。 */
  providerInfo(provider) {
    return { id: provider, name: this.providerName };
  }
  /** 退避策略交给宿主默认(`{mode:"normal", maxRetries:5, …}`)。 */
  providerRetryPolicy() {
    return void 0;
  }
  async listModels() {
    const entries = await this.rt.listModels();
    return entries.map((entry) => {
      const info = modelInfoOf(entry, this.provider);
      return {
        provider: this.provider,
        id: info.id,
        name: info.name,
        description: info.description,
        inputModalities: info.inputModalities
      };
    });
  }
  async resolveModel(provider, model) {
    const entries = await this.rt.listModels();
    const entry = entries.find((e) => e.id === model);
    if (!entry) {
      throw new AsOneLlmError(`As One \u6CA1\u6709\u8FD9\u4E2A\u6A21\u578B:${model}`, "INVALID_REQUEST", { status: 404 });
    }
    return modelInfoOf(entry, provider || this.provider);
  }
  async prepareCall(provider, model, signal) {
    const resolved = await this.resolveModel(provider, model);
    if (signal?.aborted) throw abortError();
    return {
      model: resolved,
      stream: (options) => this.stream(options)
    };
  }
  /** 唯一的抽象:产出**语法合法**的块流。 */
  async *stream(options) {
    const model = options.model;
    const upstream = this.rt.resolveUpstream(model);
    if (!upstream) {
      throw new AsOneLlmError(`As One \u672A\u77E5\u6A21\u578B:${model}`, "INVALID_REQUEST", { status: 404 });
    }
    const request = toUpstreamRequestFromOptions({ ...options, provider: this.provider });
    const t0 = Date.now();
    let firstChunkMs;
    let seen;
    let ok2 = false;
    let failure;
    try {
      for await (const chunk of translateStream(upstream.stream(request), model)) {
        if (firstChunkMs === void 0 && chunk.type !== "usage" && chunk.type !== "finish") {
          firstChunkMs = Date.now() - t0;
        }
        if (chunk.type === "usage") seen = chunk.usage;
        yield chunk;
      }
      ok2 = true;
    } catch (err) {
      failure = err instanceof AsOneLlmError ? err : toLlmError(err, `As One \u8C03\u7528\u5931\u8D25(${model})`);
      throw failure;
    } finally {
      const aborted = options.signal?.aborted === true;
      this.record(model, ok2, failure, aborted, t0, firstChunkMs, seen, request);
    }
  }
  /** 统计挂钩失败绝不能影响已经发出的响应。 */
  record(model, ok2, failure, aborted, t0, firstChunkMs, usage, request) {
    try {
      this.rt.onRequestDone({
        model,
        stream: true,
        ok: ok2,
        status: ok2 ? 200 : aborted ? 0 : failure?.failure.status ?? 500,
        error: ok2 ? null : failure?.message ?? "\u8C03\u7528\u5931\u8D25",
        error_kind: ok2 ? null : aborted ? "connection" : kindOfFailure(failure) ?? "upstream",
        latency_ms: Math.round(Date.now() - t0),
        ttft_ms: firstChunkMs === void 0 ? null : Math.round(firstChunkMs),
        usage: usage ? {
          prompt_tokens: usage.inputTokens,
          cached_tokens: usage.cacheReadTokens ?? 0,
          completion_tokens: usage.outputTokens
        } : null,
        session_id: typeof request.extra?.session_id === "string" ? request.extra.session_id : null,
        prompt_cache_key: request.prompt_cache_key ?? null,
        discarded_fields: null,
        request: { model: request.model, messages: request.messages, stream: true }
      });
    } catch {
    }
  }
};
function kindOfFailure(failure) {
  switch (failure?.code) {
    case "RATE_LIMIT":
      return "rate_limit";
    case "AUTH":
      return "auth";
    case "INVALID_REQUEST":
      return "bad_request";
    case "TIMEOUT":
      return "timeout";
    case "TRANSPORT":
      return "connection";
    case "SERVER":
      return "upstream";
    default:
      return null;
  }
}
function abortError() {
  return new AsOneLlmError("\u8C03\u7528\u5DF2\u53D6\u6D88", "ABORTED");
}

// src/index.ts
var name = "@as-one/plugin";
var inject = ["webServer"];
function ctxDataDir(_ctx) {
  return void 0;
}
function resolveDirs(ctx, config = {}) {
  const dataDir = config.dataDir ?? process.env.AS_ONE_DATA_DIR ?? ctxDataDir(ctx) ?? join8(homedir2(), ".as-one");
  const configDir = config.configDir ?? join8(dataDir, "config");
  const dbPath = config.dbPath ?? join8(dataDir, "as-one.db");
  return { dataDir, configDir, dbPath };
}
function apply(ctx, config = {}) {
  void startAsOne(ctx, config);
}
async function startAsOne(ctx, config) {
  const { dataDir, configDir, dbPath } = resolveDirs(ctx, config);
  let runtime;
  try {
    runtime = await setupAsOne({ configDir, dbPath, logDir: join8(dataDir, "logs") });
  } catch (err) {
    ctx.logger?.warn?.("[as-one] setup failed, gateway routes not mounted:", err);
    return;
  }
  ctx.effect(
    () => {
      const gatewayRoutes = buildGatewayRoutes(runtime, { logger: ctx.logger });
      const panelRoutes = buildPanelRoutes(runtime, { gatewayPort: config.gatewayPort });
      const disposers = [];
      for (const route of [...gatewayRoutes, ...panelRoutes]) {
        try {
          disposers.push(ctx.webServer.register(route));
        } catch (err) {
          ctx.logger?.warn?.(`[as-one] register route ${route.path} failed:`, err);
        }
      }
      ctx.logger?.info?.(
        `[as-one] mounted ${gatewayRoutes.length} gateway route(s) + ${panelRoutes.length} panel route(s)`
      );
      return () => {
        for (const dispose of disposers) dispose();
        runtime.dispose();
      };
    },
    "@as-one/plugin: gateway + panel routes"
  );
  ctx.inject(["llm"], (child) => {
    child.effect(() => {
      const adapter = new AsOneLlmAdapter(runtime);
      let unregister;
      try {
        unregister = child.llm.registerAdapter([AS_ONE_PROVIDER], adapter);
        child.logger?.info?.(`[as-one] llm adapter registered as "${AS_ONE_PROVIDER}"`);
      } catch (err) {
        child.logger?.warn?.("[as-one] llm adapter registration failed:", err);
      }
      return () => {
        try {
          unregister?.();
        } catch (err) {
          child.logger?.warn?.("[as-one] llm adapter dispose failed:", err);
        }
      };
    }, "@as-one/plugin: llm adapter");
  });
}
export {
  apply,
  inject,
  name,
  resolveDirs
};
//# sourceMappingURL=index.js.map
