/**
 * Nexus v7 各表的 TypeScript 行类型(camelCase),与 Python 侧 dict 行一一对应。
 *
 * 约定:
 *  - provider.id / real_model.provider / credential.provider / stats_daily.provider → "provider";
 *  - 所有 *_at / *_ms / 计数列在 SQLite 中存数字,读回后映射到 number;
 *  - credential.expires_at 单位为秒(epoch seconds);
 *  - logical_model.members 与 credential.raw_json 是 JSON 字符串。
 */

/** provider 表:一个 OpenAI 兼容上游(见 D:\projects\nexus\nexus\db\schema.sql L97-102)。 */
export interface ProviderRow {
	/** 上游服务商 id:'workbuddy'/'trae'/'sensenova'… */
	id: string;
	/** OpenAI 兼容端点 api_base */
	base_url: string | null;
	/** openai | workbuddy | trae | sensenova */
	protocol: string;
	/** 账号密钥的环境变量前缀,如 WORKBUDDY_TOKEN */
	env_prefix: string | null;
}

/** credential 表:某个 provider 下的用户名/密钥对(复合主键 provider+username,schema.sql L117-128)。 */
export interface CredentialRow {
	provider: string;
	username: string;
	secret: string | null;
	refresh_secret: string | null;
	/** ⚠️ 单位是秒(epoch seconds),而非毫秒 */
	expires_at: number | null;
	/** 原始 JSON 凭据负载(透传) */
	raw_json: string | null;
}

/**
 * real_model 表:一个 provider 实际提供、可被路由的具体模型(schema.sql L151-166)。
 * 列序即 v5→v6 迁移脚本 migrate_v5_to_v6.py 的 EXPECTED_COLUMNS 声明的规范列序。
 */
export interface RealModelRow {
	provider: string;
	model: string;
	/** 展示名,可为 NULL */
	name: string | null;
	supports_vision: number;
	max_input_tokens: number | null;
	max_output_tokens: number | null;
	hidden: number;
	concurrency: number;
	/**
	 * 该模型**支持**的思考强度档位(上游目录给的,如 `["low","high","max"]`),
	 * JSON 数组字符串;**NULL = 上游没给 / 还没回源**。
	 *
	 * 语义(2026-10-24 用户定案 m09328):**空(NULL 或 `[]`)⇒ 不传
	 * `reasoning_effort`**;非空 ⇒ 只放行名单里的值。上游报「不支持该思考强度」
	 * 时网关丢参重试,重试成功即把本列清空(学习结果)。
	 *
	 * ⚠️ 可选:这是后加的列,老调用点(手工登记、测试夹具)不写就是 NULL
	 * (= 不拦,网关照上游的来),不必逐处补。
	 */
	supported_reasoning_efforts?: string | null;
	/**
	 * 是否允许**关闭思考**(`off`):`true`/`false`,或 `null`(上游没说)。
	 *
	 * 实测只有 workbuddy 的 `reasoning.canDisableThinking` 给这个信号;
	 * 其余目录没有 → `null`,由网关按「允许」处理(交给上游自己拒)。
	 *
	 * ⚠️ 可选:后加的列,老调用点不写就是 NULL。
	 */
	reasoning_allows_off?: boolean | null;
}

/** logical_model 表:路由层的逻辑模型名,strategy 决定成员选择策略(schema.sql L188-195)。 */
export interface LogicalModelRow {
	name: string;
	/** 'random'(缺省,2026-10-26 起)等路由策略名 */
	strategy: string;
	/** JSON 数组字符串,顺序即优先级 */
	members: string;
	/**
	 * 人话显示名(用户 m44638,2026-11-01)。`null` / 省略 = 直接用 `name`。
	 * `name` 是调用标识(客户端请求串),不为了好看而改;显示层的事归这一列。
	 */
	display_name?: string | null;
}

/**
 * stats_daily 表:按天聚合的用量统计(schema.sql L211-225)。
 * logical_model 为 NULL 的行表示"任何 logical_model"聚合;*_ms 列是毫秒累加值。
 */
export interface StatsDailyRow {
	/** 'YYYY-MM-DD' */
	day: string;
	/** NULL = 任意逻辑模型聚合行 */
	logical_model: string | null;
	provider: string;
	model: string;
	requests: number;
	fails: number;
	prompt_tokens: number;
	cached_tokens: number;
	completion_tokens: number;
	latency_sum_ms: number;
	ttft_sum_ms: number;
	ttft_requests: number;
}

/**
 * stats_external_daily:网关外(DSH 直连其它 provider)的按天用量。
 *
 * ⚠️ 没有 logical_model / 账号 / 延迟 —— 这些观测网关根本看不到,留空列只会诱使
 * 上层把它们和网关行混进同一个分母。
 */
export interface StatsExternalRow {
	/** 'YYYY-MM-DD' */
	day: string;
	provider: string;
	model: string;
	/** 上游调用次数(step/start + llm/retry-started),**不是**客户端请求数。 */
	calls: number;
	/** 含 cached,与 stats_daily.prompt_tokens 同口径。 */
	prompt_tokens: number;
	cached_tokens: number;
	completion_tokens: number;
	/** epoch ms */
	last_seen: number;
}

/** setting 表:键值配置(schema.sql L234-240),k 为主键。 */
export interface SettingRow {
	k: string;
	v: string | null;
}

/** 六张表行类型的联合(用于泛型 CRUD 装配)。 */
export type AnyRow =
	| ProviderRow
	| CredentialRow
	| RealModelRow
	| LogicalModelRow
	| StatsDailyRow
	| SettingRow;
