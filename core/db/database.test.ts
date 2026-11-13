import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type NexusDatabase } from "./database.js";

let db: NexusDatabase;

beforeEach(() => {
	db = openDatabase(":memory:");
});

afterEach(() => {
	db.close();
});

describe("openDatabase(:memory:)", () => {
	it("建出 7 张表并种上版本行", () => {
		const rows = db.raw
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
			)
			.all() as Array<{ name: string }>;
		expect(rows.map((r) => r.name)).toEqual([
			"credential",
			"logical_model",
			"provider",
			"real_model",
			"setting",
			"stats_daily",
			"stats_external_daily",
		]);
		expect(db.setting.get("version")?.v).toBe("4");
	});

	it("磁盘文件打开时启用 WAL", async () => {
		const os = await import("node:os");
		const fs = await import("node:fs");
		const path = await import("node:path");
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "as-one-db-test-"));
		const file = path.join(dir, "test.db");
		const fileDb = openDatabase(file);
		try {
			const row = fileDb.raw.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
			expect(row.journal_mode).toBe("wal");
		} finally {
			fileDb.close();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("provider CRUD", () => {
	it("insert → get → list → update → delete 往返", () => {
		db.provider.insert({
			id: "workbuddy",
			base_url: "https://api.workbuddy.ai/v1",
			protocol: "workbuddy",
			env_prefix: "WORKBUDDY",
		});
		const got = db.provider.get("workbuddy");
		expect(got?.id).toBe("workbuddy");
		expect(got?.protocol).toBe("workbuddy");
		expect(got?.env_prefix).toBe("WORKBUDDY");

		db.provider.update({ id: "workbuddy", base_url: "https://new.example.com/v1" });
		expect(db.provider.get("workbuddy")?.base_url).toBe("https://new.example.com/v1");

		expect(db.provider.list()).toHaveLength(1);
		db.provider.delete("workbuddy");
		expect(db.provider.get("workbuddy")).toBeUndefined();
	});

	it("未提供 base_url 时列为 NULL(走默认值)", () => {
		db.provider.insert({ id: "trae", protocol: "trae", env_prefix: "TRAE" });
		const got = db.provider.get("trae")!;
		expect(got.base_url).toBeNull();
		expect(got.protocol).toBe("trae");
	});
});

describe("credential CRUD", () => {
	it("insert → get → update → delete 往返,expires_at 按秒存取", () => {
		db.provider.insert({ id: "sensenova", protocol: "sensenova", env_prefix: null });
		const expiresAt = 1_736_000_000; // 秒,epoch
		db.credential.insert({
			provider: "sensenova",
			username: "u1",
			secret: "sk-xxx",
			refresh_secret: null,
			expires_at: expiresAt,
			raw_json: null,
		});
		const got = db.credential.get("sensenova", "u1")!;
		expect(got.secret).toBe("sk-xxx");
		expect(got.expires_at).toBe(expiresAt); // 数值秒,不是 Date/ms

		db.credential.update({
			provider: "sensenova",
			username: "u1",
			secret: "sk-yyy",
		});
		expect(db.credential.get("sensenova", "u1")?.secret).toBe("sk-yyy");
		expect(db.credential.get("sensenova", "u1")?.expires_at).toBe(expiresAt); // 更新未动 expires_at

		db.credential.delete("sensenova", "u1");
		expect(db.credential.get("sensenova", "u1")).toBeUndefined();
	});

	it("listByProvider 只返回该 provider 的行;secretsFor 返回 username→secret 映射", () => {
		db.provider.insert({ id: "p1", protocol: "openai", env_prefix: null });
		db.provider.insert({ id: "p2", protocol: "openai", env_prefix: null });
		db.credential.insert({
			provider: "p1",
			username: "a",
			secret: "s1",
			refresh_secret: null,
			expires_at: null,
			raw_json: null,
		});
		db.credential.insert({
			provider: "p1",
			username: "b",
			secret: "s2",
			refresh_secret: null,
			expires_at: null,
			raw_json: null,
		});
		db.credential.insert({
			provider: "p2",
			username: "c",
			secret: "s3",
			refresh_secret: null,
			expires_at: null,
			raw_json: null,
		});
		expect(db.credential.listByProvider("p1").map((r) => r.username)).toEqual(["a", "b"]);
		expect(db.credential.list()).toHaveLength(3);
		expect(db.credential.secretsFor("p1")).toEqual({ a: "s1", b: "s2" });
	});

	it("外键约束:credential 的 provider 必须存在", () => {
		expect(() =>
			db.credential.insert({
				provider: "nope",
				username: "u",
				secret: "s",
				refresh_secret: null,
				expires_at: null,
				raw_json: null,
			}),
		).toThrow();
	});

	it("删除 provider 级联删除其 credential(FK ON DELETE CASCADE)", () => {
		db.provider.insert({ id: "p1", protocol: "openai", env_prefix: null });
		db.credential.insert({
			provider: "p1",
			username: "a",
			secret: "s",
			refresh_secret: null,
			expires_at: null,
			raw_json: null,
		});
		db.provider.delete("p1");
		expect(db.credential.list()).toHaveLength(0);
	});
});

describe("real_model CRUD", () => {
	it("set 是 upsert(ON CONFLICT (provider, model) DO UPDATE)", () => {
		db.provider.insert({ id: "p1", protocol: "openai", env_prefix: null });
		db.realModel.set({
			provider: "p1",
			model: "gpt-4o",
			name: "GPT-4o",
			supports_vision: 1,
			max_input_tokens: 128000,
			max_output_tokens: 4096,
			hidden: 0,
			concurrency: 2,
		});
		// 同键再次写入 → 更新而非新增
		db.realModel.set({
			provider: "p1",
			model: "gpt-4o",
			name: "GPT-4o 新版",
			supports_vision: 1,
			max_input_tokens: 128000,
			max_output_tokens: 4096,
			hidden: 0,
			concurrency: 2,
		});
		expect(db.realModel.list()).toHaveLength(1);
		expect(db.realModel.get("p1", "gpt-4o")?.name).toBe("GPT-4o 新版");
	});

	it("insert/get/listByProvider/delete 往返", () => {
		db.provider.insert({ id: "p1", protocol: "openai", env_prefix: null });
		db.realModel.set({
			provider: "p1",
			model: "m1",
			name: null,
			supports_vision: 0,
			max_input_tokens: null,
			max_output_tokens: null,
			hidden: 0,
			concurrency: 1,
		});
		expect(db.realModel.get("p1", "m1")?.name).toBeNull();
		expect(db.realModel.listByProvider("p1")).toHaveLength(1);
		db.realModel.delete("p1", "m1");
		expect(db.realModel.get("p1", "m1")).toBeUndefined();
	});

	it("删除 provider 级联删除其 real_model", () => {
		db.provider.insert({ id: "p1", protocol: "openai", env_prefix: null });
		db.realModel.set({
			provider: "p1",
			model: "m1",
			name: null,
			supports_vision: 0,
			max_input_tokens: null,
			max_output_tokens: null,
			hidden: 0,
			concurrency: 1,
		});
		db.provider.delete("p1");
		expect(db.realModel.list()).toHaveLength(0);
	});

	// 回归:node:sqlite 的 run() 只接受 number/string/bigint/Uint8Array/null,
	// 绑 true/false 会抛 `TypeError: Provided value cannot be bound to SQLite
	// parameter N`。RealModelRow.reasoning_allows_off 的类型是 boolean|null,
	// 而上游目录(reasoning_allows_off_of)确实会算出 true —— 写层必须归一成 0/1,
	// 否则刷新目录落库会整条中断。
	it("set/update 把 boolean 归一成 INTEGER 0/1(reasoning_allows_off)", () => {
		db.provider.insert({ id: "p1", protocol: "openai", env_prefix: null });
		db.realModel.set({
			provider: "p1",
			model: "m1",
			name: null,
			supports_vision: 0,
			max_input_tokens: null,
			max_output_tokens: null,
			hidden: 0,
			concurrency: 1,
			supported_reasoning_efforts: null,
			reasoning_allows_off: true,
		});
		expect(db.realModel.get("p1", "m1")?.reasoning_allows_off).toBe(1);

		db.realModel.update({ provider: "p1", model: "m1", reasoning_allows_off: false });
		expect(db.realModel.get("p1", "m1")?.reasoning_allows_off).toBe(0);
	});
});

describe("logical_model CRUD", () => {
	it("insert/get/list/update/delete 往返", () => {
		db.logicalModel.insert({ name: "fast", strategy: "due-first", members: '["a","b"]' });
		expect(db.logicalModel.get("fast")?.strategy).toBe("due-first");
		expect(db.logicalModel.get("fast")?.members).toBe('["a","b"]');

		db.logicalModel.update({ name: "fast", strategy: "round-robin" });
		expect(db.logicalModel.get("fast")?.strategy).toBe("round-robin");
		expect(db.logicalModel.list()).toHaveLength(1);

		db.logicalModel.delete("fast");
		expect(db.logicalModel.get("fast")).toBeUndefined();
	});

	it("重复 insert 同 name 抛唯一键冲突", () => {
		db.logicalModel.insert({ name: "fast", strategy: "due-first", members: "[]" });
		expect(() =>
			db.logicalModel.insert({ name: "fast", strategy: "due-first", members: "[]" }),
		).toThrow();
	});
});

describe("stats_daily", () => {
	const day = "2026-05-01";

	it("record 增量累加(同 repo.py _UPSERT_STATS)", () => {
		db.statsDaily.record({
			day,
			logical_model: "fast",
			provider: "p1",
			model: "m1",
			requests: 3,
			latency_sum_ms: 1200,
			ttft_requests: 2,
		});
		db.statsDaily.record({
			day,
			logical_model: "fast",
			provider: "p1",
			model: "m1",
			requests: 2,
			fails: 1,
			latency_sum_ms: 800,
		});
		const row = db.statsDaily.range(day, day, "fast")[0];
		expect(row.requests).toBe(5);
		expect(row.fails).toBe(1);
		expect(row.latency_sum_ms).toBe(2000);
		expect(row.ttft_requests).toBe(2);
	});

	it("logical_model 为 NULL 的聚合行(record 用 undefined 表示任意聚合),同样增量累加", () => {
		db.statsDaily.record({
			day,
			logical_model: undefined,
			provider: "p1",
			model: "m1",
			requests: 1,
		});
		db.statsDaily.record({
			day,
			logical_model: undefined,
			provider: "p1",
			model: "m1",
			requests: 2,
		});
		const rows = db.statsDaily.range(day, day, null);
		expect(rows).toHaveLength(1); // NULL 聚合行不会被重复插入
		expect(rows[0].logical_model).toBeNull();
		expect(rows[0].requests).toBe(3);
	});

	it("range 按日期范围过滤(含两端)", () => {
		db.statsDaily.insert({
			day: "2026-04-30",
			logical_model: null,
			provider: "p1",
			model: "m1",
			requests: 1,
			fails: 0,
			prompt_tokens: 0,
			cached_tokens: 0,
			completion_tokens: 0,
			latency_sum_ms: 0,
			ttft_sum_ms: 0,
			ttft_requests: 0,
		});
		db.statsDaily.insert({
			day: "2026-05-01",
			logical_model: null,
			provider: "p1",
			model: "m1",
			requests: 2,
			fails: 0,
			prompt_tokens: 0,
			cached_tokens: 0,
			completion_tokens: 0,
			latency_sum_ms: 0,
			ttft_sum_ms: 0,
			ttft_requests: 0,
		});
		db.statsDaily.insert({
			day: "2026-05-02",
			logical_model: null,
			provider: "p1",
			model: "m1",
			requests: 4,
			fails: 0,
			prompt_tokens: 0,
			cached_tokens: 0,
			completion_tokens: 0,
			latency_sum_ms: 0,
			ttft_sum_ms: 0,
			ttft_requests: 0,
		});
		const inRange = db.statsDaily.range("2026-04-30", "2026-05-01", null);
		expect(inRange.map((r) => r.day)).toEqual(["2026-04-30", "2026-05-01"]);
	});
});

describe("stats_external_daily", () => {
	it("增量累加 + 按天范围查询", () => {
		db.statsExternalDaily.record({
			day: "2026-11-14",
			provider: "yn",
			model: "deepseek-v4.1-flash",
			calls: 1,
			prompt_tokens: 100,
			cached_tokens: 80,
			completion_tokens: 10,
			last_seen: 1_000,
		});
		db.statsExternalDaily.record({
			day: "2026-11-14",
			provider: "yn",
			model: "deepseek-v4.1-flash",
			calls: 2,
			prompt_tokens: 50,
			completion_tokens: 5,
			last_seen: 2_000,
		});
		db.statsExternalDaily.record({
			day: "2026-11-13",
			provider: "hyperai",
			model: "m",
			calls: 1,
		});

		const rows = db.statsExternalDaily.range("2026-11-14", "2026-11-14");
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			provider: "yn",
			calls: 3,
			prompt_tokens: 150,
			cached_tokens: 80,
			completion_tokens: 15,
			// last_seen 取最大值,不是累加
			last_seen: 2_000,
		});

		expect(db.statsExternalDaily.range("2026-11-01", "2026-11-30")).toHaveLength(2);
	});

	it("全列 NOT NULL ⇒ 主键真正生效(不会像 stats_daily 的 NULL 行那样重复)", () => {
		const delta = { day: "2026-11-14", provider: "yn", model: "m", calls: 1 };
		db.statsExternalDaily.record(delta);
		db.statsExternalDaily.record(delta);
		const rows = db.raw
			.prepare("SELECT COUNT(*) AS n FROM stats_external_daily")
			.get() as { n: number };
		expect(rows.n).toBe(1);
		expect(db.statsExternalDaily.range("2026-11-14", "2026-11-14")[0]?.calls).toBe(2);
	});
});

describe("setting", () => {
	it("get/set/delete 往返,set 是 upsert", () => {
		expect(db.setting.get("missing")).toBeUndefined();
		db.setting.set("k1", "v1");
		expect(db.setting.get("k1")?.v).toBe("v1");
		db.setting.set("k1", "v2"); // upsert
		expect(db.setting.get("k1")?.v).toBe("v2");
		db.setting.delete("k1");
		expect(db.setting.get("k1")).toBeUndefined();
	});
});
