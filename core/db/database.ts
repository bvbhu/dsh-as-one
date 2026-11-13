/**
 * Nexus 持久层 — node:sqlite (DatabaseSync) 访问层。
 *
 * 用法:
 *   const db = openDatabase(":memory:");            // 测试
 *   const db = openDatabase("/path/to/nexus.db");   // 磁盘文件 → WAL
 *
 * 只依赖 Node 内建 node:sqlite(node >= 22.5),同步 API 是预期行为。
 * 参照 D:\projects\nexus 的访问层(repo.py)实际操作面:
 *   - provider: get/list/insert/update/delete
 *   - credential: get(provider, username)/listByProvider/secretsFor/insert/update/delete
 *   - real_model: get/list/insert-upsert/update/delete
 *   - logical_model: get/list/insert/update/delete
 *   - stats_daily: upsert(增量累加,同 repo.py _UPSERT_STATS)/range(按日范围 query)
 *   - setting: get/set
 */

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { SCHEMA_V7 } from "./schema.js";
import type {
	ProviderRow,
	CredentialRow,
	RealModelRow,
	LogicalModelRow,
	StatsDailyRow,
	SettingRow,
	StatsExternalRow,
} from "./types.js";

/** node:sqlite 接受的绑定参数类型。 */
export type BindValue = SQLInputValue;

/** stats_daily.record 的增量:键列(除 logical_model)必填;logical_model 与计数列可省略。 */
export type StatsDelta = Omit<
	StatsDailyRow,
	| "logical_model"
	| "requests"
	| "fails"
	| "prompt_tokens"
	| "cached_tokens"
	| "completion_tokens"
	| "latency_sum_ms"
	| "ttft_sum_ms"
	| "ttft_requests"
> &
	Partial<
		Pick<
			StatsDailyRow,
			| "logical_model"
			| "requests"
			| "fails"
			| "prompt_tokens"
			| "cached_tokens"
			| "completion_tokens"
			| "latency_sum_ms"
			| "ttft_sum_ms"
			| "ttft_requests"
		>
	>;

/** stats_external_daily.record 的增量:键列必填,计数列可省略。 */
export type StatsExternalDelta = Pick<StatsExternalRow, "day" | "provider" | "model"> &
	Partial<
		Pick<
			StatsExternalRow,
			"calls" | "prompt_tokens" | "cached_tokens" | "completion_tokens" | "last_seen"
		>
	>;

/** openDatabase 返回的数据库封装。 */
export interface NexusDatabase {
	/** 底层 DatabaseSync 句柄(需要原生能力时使用)。 */
	raw: DatabaseSync;
	/** 关闭连接。 */
	close(): void;
	/**
	 * `PRAGMA data_version` —— **别的连接**提交后才会变的版本号(本连接自己的提交不变)。
	 *
	 * 用途:多实例共用一个库时,把「内存快照」按它做失效判断,而不是每次全量重读。
	 * 语义边界(重要):它只反映跨连接提交;同进程同连接里我们自己写的值由调用方
	 * 直接更新缓存,不依赖这个号。
	 */
	dataVersion(): number;

	// ---- provider --------------------------------------------------
	provider: {
		get(id: string): ProviderRow | undefined;
		list(): ProviderRow[];
		/** 省略的字段(undefined)走列默认值/NULL。 */
		insert(row: Partial<ProviderRow> & Pick<ProviderRow, "id">): void;
		/** 只更新提供的字段,键 id 必须给出。 */
		update(row: Partial<ProviderRow> & Pick<ProviderRow, "id">): void;
		delete(id: string): void;
	};

	// ---- credential ------------------------------------------------
	credential: {
		get(provider: string, username: string): CredentialRow | undefined;
		listByProvider(provider: string): CredentialRow[];
		list(): CredentialRow[];
		/** 省略的字段(undefined)走列默认值/NULL。 */
		insert(
			row: Partial<CredentialRow> & Pick<CredentialRow, "provider" | "username">,
		): void;
		/** 只更新提供的字段,键 provider+username 必须给出。 */
		update(
			row: Partial<CredentialRow> & Pick<CredentialRow, "provider" | "username">,
		): void;
		/**
		 * ON CONFLICT (provider, username) DO UPDATE —— 凭据的 upsert 语义。
		 *
		 * `insert` 是纯 INSERT,重复主键会抛 UNIQUE constraint;而凭据的日常
		 * 写路径(面板保存、令牌轮换、迁移脚本补密钥)**必然是覆盖已有行**,
		 * 所以这些地方都该走 `set`(镜像 Nexus `upsert_credential`)。
		 */
		set(row: Partial<CredentialRow> & Pick<CredentialRow, "provider" | "username">): void;
		delete(provider: string, username: string): void;
		/** 某 provider 下 username → secret 的映射(同 repo.py secrets_for)。 */
		secretsFor(provider: string): Record<string, string | null>;
	};

	// ---- real_model ------------------------------------------------
	realModel: {
		get(provider: string, model: string): RealModelRow | undefined;
		list(): RealModelRow[];
		listByProvider(provider: string): RealModelRow[];
		/** ON CONFLICT DO UPDATE —— real_model 以 (provider, model) 为键,Nexus 用 upsert 语义。 */
		set(row: RealModelRow): void;
		/** 只更新提供的字段,键 provider+model 必须给出。 */
		update(
			row: Partial<RealModelRow> & Pick<RealModelRow, "provider" | "model">,
		): void;
		delete(provider: string, model: string): void;
	};

	// ---- logical_model ---------------------------------------------
	logicalModel: {
		get(name: string): LogicalModelRow | undefined;
		list(): LogicalModelRow[];
		/** 省略的字段(undefined)走列默认值/NULL。 */
		insert(row: Partial<LogicalModelRow> & Pick<LogicalModelRow, "name">): void;
		/** 只更新提供的字段,键 name 必须给出。 */
		update(row: Partial<LogicalModelRow> & Pick<LogicalModelRow, "name">): void;
		delete(name: string): void;
	};

	// ---- stats_daily -----------------------------------------------
	statsDaily: {
		/** 按天范围查询(含两端);logicalModel 为 null 时要查"任意"聚合行请传 undefined。 */
		range(
			dayFrom: string,
			dayTo: string,
			logicalModel?: string | null,
		): StatsDailyRow[];
		/** 同 repo.py _UPSERT_STATS:当日该键存在则各计数列累加增量,否则插入。 */
		record(delta: StatsDelta): void;
		insert(row: StatsDailyRow): void;
		/**
		 * 聚合表整体规模(面板「请求日志」counters,Nexus api_pages.py L5264-5269 同款 SQL):
		 * stats_rows(COUNT) / last_24h(day >= 传入边界日) / errors(SUM(fails))。
		 * 边界日由调用方按 dayKey(now - 86400s) 传入,保持本层零时间依赖。
		 */
		counters(dayFrom24h: string): { stats_rows: number; last_24h: number; errors: number };
	};

	// ---- stats_external_daily(网关外)------------------------------
	/**
	 * DSH 直连其它 provider 的用量。与 statsDaily **完全独立**:
	 * 没有逻辑模型/账号/延迟,计数列是上游调用次数而不是客户端请求数。
	 */
	statsExternalDaily: {
		/** 按天范围查询(含两端)。 */
		range(dayFrom: string, dayTo: string): StatsExternalRow[];
		/** 键存在则累加,否则插入(与 statsDaily.record 同款增量语义)。 */
		record(delta: StatsExternalDelta): void;
	};

	// ---- setting ---------------------------------------------------
	setting: {
		get(key: string): SettingRow | undefined;
		/** 按键前缀批量读(`account.enabled.` 这类「一族一键」的设置用)。 */
		entries(prefix: string): SettingRow[];
		set(key: string, value: string | null): void;
		delete(key: string): void;
	};
}

/** 列标识 → SQL 绑定值(含 undefined 表示"不参与 SQL 组装")。 */
type RowLike = Record<string, unknown>;

function assertNonNullable<T>(v: T | undefined, what: string): T {
	if (v === undefined || v === null) {
		throw new Error(`as-one-db: missing required value: ${what}`);
	}
	return v;
}

/**
 * 行值 → SQLite 绑定值:布尔归一到 INTEGER 0/1。
 *
 * `node:sqlite` 的 `run(...values)` 只接受 number / string / bigint /
 * Uint8Array / null —— 传 `true` 会抛
 * `TypeError: Provided value cannot be bound to SQLite parameter N`。
 * 而本项目有若干列在 TS 里是 `boolean | null`、在 SQLite 里是 INTEGER
 * (如 `real_model.reasoning_allows_off`:读侧 `parseReasoningAllowsOff`
 * 本来就同时认 `true` 和 `1`),写侧漏了转换时**整条 INSERT/UPDATE 会失败**
 * —— 上游目录一旦真给出「能关思考」的信号,刷新目录落库就会中断。
 *
 * 归一只做 boolean 一档,SQLite 原生布尔语义(0/1)天然就是它的序列化形态,
 * 所以做成写层兜底而不是要求每个调用方自己记得转。
 */
function toBind(v: unknown): BindValue {
	if (v === true) return 1;
	if (v === false) return 0;
	return v as BindValue;
}

/**
 * 打开数据库:磁盘文件走 WAL,:memory: 跳过 WAL;随后执行 SCHEMA_V7 建立 v7 表结构并种子版本行。
 *
 * @param target ':memory:' 或磁盘路径
 */
export function openDatabase(target: string | ":memory:"): NexusDatabase {
	const raw = new DatabaseSync(target);
	// 磁盘文件开启 WAL;:memory: 无日志模式概念,跳过。
	if (target !== ":memory:") {
		raw.exec("PRAGMA journal_mode = WAL;");
	}
	// 外键约束与 Nexus Python sqlite3 层默认一致(Nexus 表间有 REFERENCES ... ON DELETE CASCADE)。
	raw.exec("PRAGMA foreign_keys = ON;");
	// 忙等待:SQLite 默认 busy_timeout=0,并发写(WAL checkpoint / 插件与 Electron 双进程)会
	// 立刻抛 SQLITE_BUSY。5s 足够覆盖本项目的写冲突窗口,且不掩盖真正的死锁。
	raw.exec("PRAGMA busy_timeout = 5000;");
	raw.exec(SCHEMA_V7);

	// ---------- 幂等 DDL 补丁 ----------
	/**
	 * `CREATE TABLE IF NOT EXISTS` 对**已存在**的表是空操作 —— 老库长不出新增列。
	 * 这里按 `PRAGMA table_info` 查一次,缺列才 `ALTER TABLE ... ADD COLUMN`。
	 *
	 * 为什么不跟 v5→v6→v7 那条迁移链:那套脚本是 Nexus 的,本项目约定是
	 * 「直接建终态库,不跑迁移链」(schema.ts 头部)。对**新增可选列**而言,
	 * 一条幂等 ALTER 比维护版本链简单得多:缺了就加,存在就跳过。
	 */
	const ensureColumn = (table: string, column: string, ddl: string): void => {
		const cols = (
			raw.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name?: unknown }>
		).map((r) => r.name);
		if (!cols.includes(column)) raw.exec(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
	};
	ensureColumn(
		"real_model",
		"supported_reasoning_efforts",
		"supported_reasoning_efforts TEXT",
	);
	ensureColumn(
		"real_model",
		"reasoning_allows_off",
		"reasoning_allows_off INTEGER",
	);
	// 2026-11-01 用户 m44638:逻辑模型显示名。老库长不出这一列,靠同一条幂等 ALTER。
	ensureColumn(
		"logical_model",
		"display_name",
		"display_name TEXT",
	);

	// ---------- 内部助手 ----------
	/** 通用 insert:"INSERT INTO <t> (<cols>) VALUES (?,...)";undefined 值跳过,走列默认值。 */
	function insertRow(table: string, row: RowLike): void {
		const cols = Object.entries(row).filter(([, v]) => v !== undefined);
		if (cols.length === 0) {
			throw new Error(`as-one-db: insert into ${table} with no columns`);
		}
		const names = cols.map(([k]) => `"${k}"`).join(", ");
		const marks = cols.map(() => "?").join(", ");
		const values = cols.map(([, v]) => toBind(v));
		raw.prepare(`INSERT INTO ${table} (${names}) VALUES (${marks})`).run(...values);
	}

	/** 通用 update:"UPDATE <t> SET a=?,b=? WHERE <keySql>";undefined 字段不更新。 */
	function updateRow(table: string, row: RowLike, keySql: string, keyParams: BindValue[]): void {
		const cols = Object.entries(row).filter(([k, v]) => v !== undefined && !k.startsWith("$key"));
		const setClause = cols.map(([k]) => `"${k}" = ?`).join(", ");
		if (setClause.length === 0) {
			throw new Error(`as-one-db: update ${table} with no settable columns`);
		}
		const values = [...cols.map(([, v]) => toBind(v)), ...keyParams];
		raw.prepare(`UPDATE ${table} SET ${setClause} WHERE ${keySql}`).run(...values);
	}

	function deleteRow(table: string, keySql: string, keyParams: BindValue[]): void {
		raw.prepare(`DELETE FROM ${table} WHERE ${keySql}`).run(...keyParams);
	}

	// ---------- 表级 API ----------
	const db: NexusDatabase = {
		raw,
		close() {
			raw.close();
		},

		dataVersion() {
			// PRAGMA 返回单行 `{ data_version: n }`;取不到(极旧 SQLite)按 0 处理,
			// 调用方会退化成「每次重读」,不影响正确性。
			const row = raw.prepare("PRAGMA data_version").get() as
				| { data_version?: unknown }
				| undefined;
			return Number(row?.data_version ?? 0);
		},

		provider: {
			get(id) {
				return raw.prepare("SELECT * FROM provider WHERE id = ?").get(id) as
					| ProviderRow
					| undefined;
			},
			list() {
				return raw.prepare("SELECT * FROM provider").all() as unknown as ProviderRow[];
			},
			insert(row) {
				insertRow("provider", row as unknown as RowLike);
			},
			update(row) {
				const id = assertNonNullable(row.id, "provider.id");
				const { id: _id, ...rest } = row;
				updateRow("provider", rest as unknown as RowLike, "id = ?", [id]);
			},
			delete(id) {
				deleteRow("provider", "id = ?", [id]);
			},
		},

		credential: {
			get(provider, username) {
				return raw
					.prepare("SELECT * FROM credential WHERE provider = ? AND username = ?")
					.get(provider, username) as CredentialRow | undefined;
			},
			listByProvider(provider) {
				return raw
					.prepare("SELECT * FROM credential WHERE provider = ? ORDER BY username")
					.all(provider) as unknown as CredentialRow[];
			},
			list() {
				return raw.prepare("SELECT * FROM credential").all() as unknown as CredentialRow[];
			},
			insert(row) {
				insertRow("credential", row as unknown as RowLike);
			},
			set(row) {
				const cols = Object.entries(row as unknown as RowLike).filter(([, v]) => v !== undefined);
				const names = cols.map(([k]) => `"${k}"`).join(", ");
				const marks = cols.map(() => "?").join(", ");
				const updates = cols
					.map(([k]) => `"${k}" = excluded."${k}"`)
					.join(", ");
				const values = cols.map(([, v]) => toBind(v));
				raw.prepare(
					`INSERT INTO credential (${names}) VALUES (${marks})
					 ON CONFLICT (provider, username) DO UPDATE SET ${updates}`,
				).run(...values);
			},
			update(row) {
				const provider = assertNonNullable(row.provider, "credential.provider");
				const username = assertNonNullable(row.username, "credential.username");
				const { provider: _p, username: _u, ...rest } = row;
				updateRow(
					"credential",
					rest as unknown as RowLike,
					"provider = ? AND username = ?",
					[provider, username],
				);
			},
			delete(provider, username) {
				deleteRow("credential", "provider = ? AND username = ?", [provider, username]);
			},
			secretsFor(provider) {
				const rows = raw
					.prepare("SELECT username, secret FROM credential WHERE provider = ?")
					.all(provider) as Array<Pick<CredentialRow, "username" | "secret">>;
				const out: Record<string, string | null> = {};
				for (const r of rows) out[r.username] = r.secret;
				return out;
			},
		},

		realModel: {
			get(provider, model) {
				return raw
					.prepare("SELECT * FROM real_model WHERE provider = ? AND model = ?")
					.get(provider, model) as RealModelRow | undefined;
			},
			list() {
				return raw.prepare("SELECT * FROM real_model").all() as unknown as RealModelRow[];
			},
			listByProvider(provider) {
				return raw
					.prepare("SELECT * FROM real_model WHERE provider = ? ORDER BY model")
					.all(provider) as unknown as RealModelRow[];
			},
			set(row) {
				const cols = Object.entries(row as unknown as RowLike).filter(([, v]) => v !== undefined);
				const names = cols.map(([k]) => `"${k}"`).join(", ");
				const marks = cols.map(() => "?").join(", ");
				const updates = cols
					.map(([k]) => `"${k}" = excluded."${k}"`)
					.join(", ");
				const values = cols.map(([, v]) => toBind(v));
				raw.prepare(
					`INSERT INTO real_model (${names}) VALUES (${marks})
					 ON CONFLICT (provider, model) DO UPDATE SET ${updates}`,
				).run(...values);
			},
			update(row) {
				const provider = assertNonNullable(row.provider, "real_model.provider");
				const model = assertNonNullable(row.model, "real_model.model");
				const { provider: _p, model: _m, ...rest } = row;
				updateRow("real_model", rest as unknown as RowLike, "provider = ? AND model = ?", [
					provider,
					model,
				]);
			},
			delete(provider, model) {
				deleteRow("real_model", "provider = ? AND model = ?", [provider, model]);
			},
		},

		logicalModel: {
			get(name) {
				return raw.prepare("SELECT * FROM logical_model WHERE name = ?").get(name) as
					| LogicalModelRow
					| undefined;
			},
			list() {
				return raw.prepare("SELECT * FROM logical_model").all() as unknown as LogicalModelRow[];
			},
			insert(row) {
				insertRow("logical_model", row as unknown as RowLike);
			},
			update(row) {
				const name = assertNonNullable(row.name, "logical_model.name");
				const { name: _n, ...rest } = row;
				updateRow("logical_model", rest as unknown as RowLike, "name = ?", [name]);
			},
			delete(name) {
				deleteRow("logical_model", "name = ?", [name]);
			},
		},

		statsDaily: {
			range(dayFrom, dayTo, logicalModel) {
				let sql = "SELECT * FROM stats_daily WHERE day >= ? AND day <= ?";
				const params: BindValue[] = [dayFrom, dayTo];
				if (logicalModel !== undefined) {
					sql += " AND logical_model IS ?";
					params.push(logicalModel);
				}
				sql += " ORDER BY day, logical_model, provider, model";
				return raw.prepare(sql).all(...params) as unknown as StatsDailyRow[];
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
					ttft_requests = 0,
				} = delta;
				assertNonNullable(day, "stats_daily.day");
				assertNonNullable(provider, "stats_daily.provider");
				assertNonNullable(model, "stats_daily.model");
				// NULL logical_model 的聚合行:UPSERT 的 ON CONFLICT 匹配不到 NULL 键
				// (SQLite 认为 NULL ≠ NULL),只能「有则累加、无则插入」。
				//
				// ⚠️ 这两步必须在**同一个写事务**里:多实例共用同一个库时,裸着做
				// UPDATE→INSERT 存在跨进程 TOCTOU 窗口(A 的 UPDATE 落空、B 也落空、
				// 两边各插一行),而含 NULL 的主键没有唯一约束兜底 —— 重复行一旦写进去
				// 就永久存在,面板会把它们加两遍(见 docs/multi-instance.md §2.3)。
				// BEGIN IMMEDIATE 先拿写锁,另一个实例的写会阻塞到本事务结束。
				if (logical_model === undefined || logical_model === null) {
					raw.exec("BEGIN IMMEDIATE");
					try {
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
							 WHERE day = ? AND logical_model IS NULL AND provider = ? AND model = ?`,
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
							model,
						);
						if (Number(upd.changes) === 0) {
							raw.prepare(
								`INSERT INTO stats_daily
									(day, logical_model, provider, model, requests, fails, prompt_tokens,
									 cached_tokens, completion_tokens, latency_sum_ms, ttft_sum_ms, ttft_requests)
								 VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
							).run(
								day,
								provider,
								model,
								requests,
								fails,
								prompt_tokens,
								cached_tokens,
								completion_tokens,
								latency_sum_ms,
								ttft_sum_ms,
								ttft_requests,
							);
						}
						raw.exec("COMMIT");
					} catch (err) {
						try {
							raw.exec("ROLLBACK");
						} catch {
							/* 事务可能已因错误自动回滚 */
						}
						throw err;
					}
					return;
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
						ttft_requests = ttft_requests + excluded.ttft_requests`,
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
					ttft_requests,
				);
			},
			insert(row) {
				insertRow("stats_daily", row as unknown as RowLike);
			},
			/**
			 * 聚合表整体规模(面板「请求日志」counters,Nexus api_pages.py L5264-5269 同款 SQL):
			 * - stats_rows:stats_daily 总行数(COUNT(*));
			 * - last_24h:近 24h 请求数(day >= 传入的边界日,即 dayKey(now-86400s));
			 * - errors:累计失败数(SUM(fails))。
			 */
			counters(dayFrom24h) {
				const statsRows = raw
					.prepare("SELECT COUNT(*) AS n FROM stats_daily")
					.get() as { n?: unknown } | undefined;
				const last24h = raw
					.prepare("SELECT COALESCE(SUM(requests), 0) AS n FROM stats_daily WHERE day >= ?")
					.get(dayFrom24h) as { n?: unknown } | undefined;
				const errors = raw
					.prepare("SELECT COALESCE(SUM(fails), 0) AS n FROM stats_daily")
					.get() as { n?: unknown } | undefined;
				return {
					stats_rows: Number(statsRows?.n ?? 0),
					last_24h: Number(last24h?.n ?? 0),
					errors: Number(errors?.n ?? 0),
				};
			},
		},

		statsExternalDaily: {
			range(dayFrom, dayTo) {
				return raw
					.prepare(
						"SELECT * FROM stats_external_daily WHERE day >= ? AND day <= ? ORDER BY day, provider, model",
					)
					.all(dayFrom, dayTo) as unknown as StatsExternalRow[];
			},
			record(delta) {
				const {
					day,
					provider,
					model,
					calls = 0,
					prompt_tokens = 0,
					cached_tokens = 0,
					completion_tokens = 0,
					last_seen = 0,
				} = delta;
				assertNonNullable(day, "stats_external_daily.day");
				assertNonNullable(provider, "stats_external_daily.provider");
				assertNonNullable(model, "stats_external_daily.model");
				// 全列 NOT NULL ⇒ 主键真正生效,一条 UPSERT 足够;不需要 stats_daily 那套
				// 「先 UPDATE ... IS NULL,没命中再 INSERT」的兜底(也就没有那个 TOCTOU 窗口)。
				raw
					.prepare(
						`INSERT INTO stats_external_daily
							(day, provider, model, calls, prompt_tokens, cached_tokens, completion_tokens, last_seen)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
						 ON CONFLICT (day, provider, model) DO UPDATE SET
							calls = calls + excluded.calls,
							prompt_tokens = prompt_tokens + excluded.prompt_tokens,
							cached_tokens = cached_tokens + excluded.cached_tokens,
							completion_tokens = completion_tokens + excluded.completion_tokens,
							last_seen = MAX(last_seen, excluded.last_seen)`,
					)
					.run(
						day,
						provider,
						model,
						calls,
						prompt_tokens,
						cached_tokens,
						completion_tokens,
						last_seen,
					);
			},
		},

		setting: {
			get(key) {
				return raw.prepare("SELECT * FROM setting WHERE k = ?").get(key) as
					| SettingRow
					| undefined;
			},
			entries(prefix) {
				// 用 substr 而不是 LIKE:键盘上的 `%`/`_` 在供应商名里都可能出现
				// (`_` 尤其常见),LIKE 会把它们当通配符 → 读到不该读的键。
				return raw
					.prepare("SELECT * FROM setting WHERE substr(k, 1, ?) = ? ORDER BY k")
					.all(prefix.length, prefix) as unknown as SettingRow[];
			},
			set(key, value) {
				raw.prepare(
					"INSERT INTO setting (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
				).run(key, value);
			},
			delete(key) {
				deleteRow("setting", "k = ?", [key]);
			},
		},
	};

	return db;
}

// 重新导出类型,方便消费者统一从这里 import 行类型。
export type {
	ProviderRow,
	CredentialRow,
	RealModelRow,
	LogicalModelRow,
	StatsDailyRow,
	SettingRow,
	StatsExternalRow,
};
