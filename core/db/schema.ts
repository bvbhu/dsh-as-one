/**
 * Nexus SQLite schema — v7 最终形态,照抄自 D:\projects\nexus\nexus\db\schema.sql(单一真源)。
 *
 * v4 → v7 之间 DDL 形状未变:
 *  - v5(v4→v5 迁移)只改 real_model 的 `name`/`region` 数据列;
 *  - v6(v5→v6 迁移)把 real_model 重建为 schema.sql 声明的规范列序(provider, model, name,
 *    supports_vision, max_input_tokens, max_output_tokens, hidden, concurrency);
 *  - v7(v6→v7 迁移)只改 setting 行数据(scheduler.rules 扁平化、retry.logical_cooldown、
 *    provider.cooldown_overrides 迁移)——不碰 DDL。
 * 所以「v7 最终 DDL」≡ schema.sql 的建表语句,直接按此建库,不做迁移链。
 *
 * 与 Nexus 的版本行约定:repo.py:81 的 SCHEMA_VERSION 常量 = "4",schema.sql 种子行也写 '4'
 * (活库实测 version 行 = '4')。v5/v6/v7 迁移脚本会把该行更新为 5/6/7,但 DDL 单源从未越过 '4'。
 * 我们直接建 v7 语义库,版本行按 Nexus 新鲜建库行为种子为 "4"(见 SCHEMA_VERSION)。
 *
 * 列单位约定(重要):
 *  - credential.expires_at 单位为**秒**(epoch seconds),不是毫秒(Nexus 侧 also 以秒计)。
 *  - stats_daily 的 *_ms 列为毫秒累加值(整数);requests/fails/tokens 均为整数计数。
 *  - provider_policy / logical_model_policy 的 timeout_s / cooldown_*_s 单位是**秒**(REAL)。
 */

export const SCHEMA_V7: string = `
-- ============================================================
-- provider 表 (schema.sql L97-102)
-- ============================================================
CREATE TABLE IF NOT EXISTS provider (
    id                  TEXT PRIMARY KEY,            -- 'workbuddy' / 'trae' / 'sensenova' ...
    base_url            TEXT,                        -- OpenAI 兼容端点的 api_base
    protocol            TEXT NOT NULL DEFAULT 'openai',  -- openai | workbuddy | trae | sensenova
    env_prefix          TEXT                         -- 账号密钥的环境变量前缀,如 WORKBUDDY_TOKEN
);
CREATE INDEX IF NOT EXISTS ix_provider_protocol ON provider(protocol);

-- ============================================================
-- credential 表 (schema.sql L117-128)
-- ============================================================
CREATE TABLE IF NOT EXISTS credential (
    provider       TEXT NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    username       TEXT NOT NULL,
    secret         TEXT,
    refresh_secret TEXT,
    expires_at     REAL,                              -- ⚠️ 单位是秒(epoch seconds),不是毫秒
    raw_json       TEXT,
    PRIMARY KEY (provider, username)
);

-- ============================================================
-- real_model 表 (schema.sql L151-166)
-- ============================================================
CREATE TABLE IF NOT EXISTS real_model (
    provider          TEXT NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    model             TEXT NOT NULL,
    name              TEXT,
    supports_vision   INTEGER NOT NULL DEFAULT 0,
    max_input_tokens  INTEGER,
    max_output_tokens INTEGER,
    hidden            INTEGER NOT NULL DEFAULT 0,
    -- ⚠️ 列默认 1 只是「INSERT 没给值」时的形状兜底,**不是**供应商策略:
    -- 真源是 config/concurrency-defaults.ts 的 defaultConcurrencyOf(provider)
    -- (2026-11-08:sensenova=1 / workbuddy=2 / 其余 3)。所有正常写入路径都显式给值,
    -- 这里刻意不改成 3 —— 裸插 sensenova 行时给 1 比给 3 安全。
    concurrency       INTEGER NOT NULL DEFAULT 1,
    -- 该模型**支持**的思考强度(上游模型目录给的档位表,如 ["low","high","max"])。
    -- JSON 数组字符串;NULL = 上游没给 / 还没回源。
    -- ⚠️ 语义(2026-10-24 用户定案 m09328):**空(NULL 或 [])就不传
    -- reasoning_effort**;非空时也只放行名单里的值。上游报「不支持该思考强度」
    -- 时网关丢参重试,重试成功即把本列**清空**(学习结果,下次不再发)。
    supported_reasoning_efforts TEXT,
    -- 该模型**是否允许关闭思考**(off)。1 = 允许(原样发 off);
    -- 0 = 不允许(退到最低思考档 low);NULL = 上游没说(按「允许」处理,
    -- 交给上游自己拒 —— 总比擅自把「关闭思考」改成「low」好)。
    -- 实测只有 workbuddy 的 reasoning.canDisableThinking 给这个信号。
    reasoning_allows_off INTEGER,
    PRIMARY KEY (provider, model)
);
CREATE INDEX IF NOT EXISTS ix_real_model_hidden ON real_model(hidden);

-- ============================================================
-- logical_model 表 (schema.sql L188-195)
-- ============================================================
CREATE TABLE IF NOT EXISTS logical_model (
    name       TEXT PRIMARY KEY,
    -- 2026-10-26 用户 m15445 定案:缺省策略改为随机(与 DEFAULT_SCHEDULER_STRATEGY 一致)。
    -- ⚠️ 仅对**新建**库生效:CREATE TABLE IF NOT EXISTS 不会改已存在的表。
    strategy   TEXT NOT NULL DEFAULT 'random',
    members    TEXT NOT NULL DEFAULT '[]',            -- JSON 数组,顺序即优先级
    -- 2026-11-01 用户 m44638:逻辑模型的人话显示名(NULL = 直接用 name)。
    -- name 是调用标识(进 /v1/models 的 id、客户端请求串),不能为了好看改它;
    -- 显示名走这一列,撞名时由 listModelEntries 追加 provider 区分。
    -- ⚠️ 这段注释里不要写反引号 —— 整个 schema 是一个模板字符串,反引号会截断它。
    display_name TEXT
);

-- ============================================================
-- stats_daily 表 (schema.sql L211-225)
-- ============================================================
CREATE TABLE IF NOT EXISTS stats_daily (
    day               TEXT NOT NULL,                  -- 'YYYY-MM-DD'
    logical_model     TEXT,                           -- NULL 表示"任何 logical_model"聚合行
    provider          TEXT NOT NULL,
    model             TEXT NOT NULL,
    requests          INTEGER NOT NULL DEFAULT 0,
    fails             INTEGER NOT NULL DEFAULT 0,
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    cached_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    latency_sum_ms    INTEGER NOT NULL DEFAULT 0,     -- 毫秒累加值
    ttft_sum_ms       INTEGER NOT NULL DEFAULT 0,     -- 毫秒累加值
    ttft_requests     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, logical_model, provider, model)
);
CREATE INDEX IF NOT EXISTS ix_stats_provider_model ON stats_daily(provider, model);

-- ============================================================
-- stats_external_daily 表 —— **网关外**用量(DSH 直连其它 provider)
-- ============================================================
-- 为什么单开一张表而不是塞进 stats_daily:
--   1. 语义不同:这里没有逻辑模型(恒无 logical_model),也没有账号/延迟/TTFT
--      —— 那些是网关独有的观测;
--   2. 计数不同:calls 是**上游调用次数**(step/start + 重试),而 stats_daily 的
--      requests 是**客户端请求数**,同名相加会永远对不上账;
--   3. 唯一性:所有列 NOT NULL,主键才真正生效(SQLite 对含 NULL 的主键不做唯一约束,
--      stats_daily 的 NULL 聚合行因此只能靠 UPDATE→INSERT 兜,跨进程有 TOCTOU 窗口)。
CREATE TABLE IF NOT EXISTS stats_external_daily (
    day               TEXT NOT NULL,                  -- 'YYYY-MM-DD'
    provider          TEXT NOT NULL,                  -- DSH 里的 provider id(非 as-one)
    model             TEXT NOT NULL,                  -- 真实模型名
    calls             INTEGER NOT NULL DEFAULT 0,     -- 上游调用次数(不是客户端请求数)
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,     -- 含 cached(与 stats_daily 同口径)
    cached_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    last_seen         INTEGER NOT NULL DEFAULT 0,     -- epoch ms
    PRIMARY KEY (day, provider, model)
);

-- ============================================================
-- setting 表 (schema.sql L234-240)
-- ============================================================
CREATE TABLE IF NOT EXISTS setting (
    k TEXT PRIMARY KEY,
    v TEXT
);
INSERT OR IGNORE INTO setting (k, v) VALUES ('version', '4');
`;

/**
 * 与 Nexus 的版本行约定一致:repo.py:81 `SCHEMA_VERSION = "4"`;schema.sql L240 种子行也是 '4';
 * 实测活库 D:\projects\nexus\data\nexus.db 的 version 行 = '4'。v5/v6/v7 迁移脚本会把该行
 * 更新为 5/6/7,但本项目直接建 v7 语义终态库,不跑迁移链,故按 Nexus 新鲜建库行为种子 '4'。
 */
export const SCHEMA_VERSION: string = "4";
