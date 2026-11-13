import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_V7, SCHEMA_VERSION } from "./schema.js";

/** 从 sqlite_master 读取全部用户表名。 */
function tableNames(db: DatabaseSync): string[] {
	const rows = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
		)
		.all() as Array<{ name: string }>;
	return rows.map((r) => r.name);
}

/** PRAGMA table_info 的列名列表。 */
function columnNames(db: DatabaseSync, table: string): string[] {
	const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
	return rows.map((r) => r.name);
}

/** PRAGMA index_list 的索引名(不含隐式 PRIMARY KEY 索引)。 */
function indexNames(db: DatabaseSync, table: string): string[] {
	const rows = db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>;
	return rows.map((r) => r.name).filter((n) => !n.startsWith("sqlite_autoindex_"));
}

describe("SCHEMA_V7 — 结构", () => {
	it("建出 6 张表(provider/credential/real_model/logical_model/stats_daily/setting)", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(SCHEMA_V7);
		expect(tableNames(db)).toEqual([
			"credential",
			"logical_model",
			"provider",
			"real_model",
			"setting",
			"stats_daily",
		]);
		db.close();
	});

	it("总列数 38(按实际 SQL 核对;logical_model 加了 display_name)", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(SCHEMA_V7);
		const perTable: Record<string, number> = {};
		for (const t of tableNames(db)) perTable[t] = columnNames(db, t).length;
		expect(perTable).toEqual({
			credential: 6,
			logical_model: 4,
			provider: 4,
			real_model: 10,
			setting: 2,
			stats_daily: 12,
		});
		const total = Object.values(perTable).reduce((a, b) => a + b, 0);
		expect(total).toBe(38);
		db.close();
	});

	it("各表列名与 check_schema.py EXPECTED_COLS 一致", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(SCHEMA_V7);
		expect(columnNames(db, "provider")).toEqual([
			"id",
			"base_url",
			"protocol",
			"env_prefix",
		]);
		expect(columnNames(db, "credential")).toEqual([
			"provider",
			"username",
			"secret",
			"refresh_secret",
			"expires_at",
			"raw_json",
		]);
		expect(columnNames(db, "real_model")).toEqual([
			"provider",
			"model",
			"name",
			"supports_vision",
			"max_input_tokens",
			"max_output_tokens",
			"hidden",
			"concurrency",
			"supported_reasoning_efforts",
			"reasoning_allows_off",
		]);
		expect(columnNames(db, "logical_model")).toEqual(["name", "strategy", "members", "display_name"]);
		expect(columnNames(db, "stats_daily")).toEqual([
			"day",
			"logical_model",
			"provider",
			"model",
			"requests",
			"fails",
			"prompt_tokens",
			"cached_tokens",
			"completion_tokens",
			"latency_sum_ms",
			"ttft_sum_ms",
			"ttft_requests",
		]);
		expect(columnNames(db, "setting")).toEqual(["k", "v"]);
		db.close();
	});

	it("建出 3 个显式索引(ix_provider_protocol / ix_real_model_hidden / ix_stats_provider_model)", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(SCHEMA_V7);
		expect(indexNames(db, "provider")).toEqual(["ix_provider_protocol"]);
		expect(indexNames(db, "real_model")).toEqual(["ix_real_model_hidden"]);
		expect(indexNames(db, "stats_daily")).toEqual(["ix_stats_provider_model"]);
		expect(indexNames(db, "credential")).toEqual([]);
		expect(indexNames(db, "logical_model")).toEqual([]);
		expect(indexNames(db, "setting")).toEqual([]);
		db.close();
	});

	it("种子 setting.version 行 = SCHEMA_VERSION('4',与 repo.py:81 / schema.sql:240 一致)", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(SCHEMA_V7);
		const row = db.prepare("SELECT v FROM setting WHERE k = 'version'").get() as
			| { v: string }
			| undefined;
		expect(row?.v).toBe(SCHEMA_VERSION);
		expect(SCHEMA_VERSION).toBe("4");
		db.close();
	});

	it("schema 注释标注 expires_at 单位是秒", () => {
		expect(SCHEMA_V7).toMatch(/expires_at[\s\S]{0,160}秒/);
	});

	it("无 created_at/updated_at 幽灵列(D1 回归防护)", () => {
		const db = new DatabaseSync(":memory:");
		db.exec(SCHEMA_V7);
		for (const t of tableNames(db)) {
			for (const c of columnNames(db, t)) {
				expect(["created_at", "updated_at"]).not.toContain(c);
			}
		}
		db.close();
	});
});
