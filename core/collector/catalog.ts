/**
 * 渠道模型目录采集 —— 与 Nexus `nexus/collector/catalog.py` (864 行) 对齐。
 *
 * 支持渠道({@link CATALOG_PROVIDERS}):
 *   - trae      wire(`POST /api/ide/v1/get_detail_param`,chat 端点真正认的名单)
 *               ∪ remote(`GET /models`,面向用户的目录骨架);
 *   - workbuddy `GET /v3/config`(两区域首选;CN 失败回退
 *               `/v2/enterprises/personal/models`);
 *   - sensenova `GET https://token.sensenova.cn/v1/models`(OpenAI 形态,
 *               **API key** 认证,不是控制台 JWT)。
 *
 * 两条 business 口径(不可改):
 *   1. **读目录绝不烧额度** —— 三个渠道的目录端点都是配置/元数据接口,与
 *      计费通路无关(这正是用户 m12222「避免使用额度也要求能够读到读取模型列表」
 *      的实现点);
 *   2. **`context_window_tokens` 取 max 档 → dev 档**,不取
 *      `model_detail_list.prompt_max_tokens`(那是 function 路径的 prompt 上限,
 *      实测五个 function 全回 168000,与模型真实窗口无关)。
 *
 * 与 Nexus 的刻意差异(顶部声明):
 *   - 网络级失败统一包装为 {@link CatalogError}(含超时/非 JSON/连接失败),
 *     与 {@link ../collector/quota.ts} 的 QuotaError、checkin.ts 的 CheckinError
 *     包装约定一致;
 *   - `fetchFn` 可注入(测试用假 fetch,零真实上游);
 *   - 共享数值函数复用 quota.ts 的 `number_of` / `to_epoch_seconds`,不重复实现。
 */

import { randomBytes } from "node:crypto";
import {
  build_headers,
  normalize_region as normalize_trae_region,
  resolve_api_base,
  resolve_identity,
} from "../connectors/trae.js";
import {
  detect_region_from_token,
  normalize_region as normalize_wb_region,
  REGION_BASES as WORKBUDDY_BASES,
} from "../connectors/workbuddy.js";
import { number_of } from "./quota.js";
// re-export 不会把名字带进本模块作用域,所以本地还要再 import 一份。
import { reasoning_allows_off_of, reasoning_efforts_of, reasoning_field_of } from "../gateway/model-catalog.js";
import { MINIMAX_MODELS } from "../connectors/minimax-models.js";
import { QoderClient } from "../connectors/qoder.js";

// ---------------------------------------------------------------------------
// 错误类型
// ---------------------------------------------------------------------------

export class CatalogError extends Error {
  readonly kind: string = "catalog";
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

// ---------------------------------------------------------------------------
// 形状
// ---------------------------------------------------------------------------

/** 一行目录。`id` 是**上游真正认的模型 id**(chat 端点接受的那个)。 */
export interface CatalogEntry {
  id: string;
  name: string;
  vision: boolean;
  context_window: number | null;
  max_output: number | null;
  /** 积分倍率(折后);null = 上游没给。 */
  rate: number | null;
  /**
   * 来源:
   * - `wire`   chat 端点认的名单(trae 的 get_detail_param);
   * - `remote` 远程目录(`/models` 等);
   * - `config` 本地配置声明;
   * - `router` **本地合成的固定名单**(没有远程目录可拉的渠道:名单由本地
   *   能力表现场合成)。来源标签据此显示「已登记的固定模型表」。
   */
  origin: "wire" | "remote" | "config" | "router";
  /** 是否在「chat 端点认的名单」里。false 的行照样展示但要标出来。 */
  callable: boolean;
  /**
   * 该模型**支持**的思考强度档位(上游目录给的,如 `["low","high","max"]`)。
   *
   * - `null` = 上游没给档位表(未知);
   * - `[]`   = 上游明说不支持思考;
   * - `[...]`= 档位表。
   *
   * 网关据此决定要不要发 `reasoning_effort`(2026-10-24 用户定案 m09328:
   * **空 ⇒ 不传**)。目前只有 workbuddy 的 `/v3/config` 真给档位表;
    * sensenova 只给 `supported_features` 布尔、trae 的目录不带能力字段。
   *
   * ⚠️ 取值已**归一到规范阶梯**(`low`/`medium`/`high`/`max`,升序;用户 m10437)。
   */
  reasoning_efforts?: string[] | null;
  /**
   * 是否允许**关闭思考**(`off`);`null` = 上游没说。
   * 实测只有 workbuddy 给(`reasoning.canDisableThinking`)。
   */
  reasoning_allows_off?: boolean | null;
}

/** 一次目录拉取的结果(`source='api'` 才有 entries)。 */
export interface CatalogResult {
  provider: string;
  entries: CatalogEntry[];
  /** `api` = 上游真拉到了;`empty` = 上游答了但一条都没有。 */
  source: "api" | "empty";
  /** epoch 秒。 */
  fetched_at: number;
  /** 非致命降级说明(某个 function 失败 / 走了回退路径)—— **必须展示**。 */
  warnings: string[];
}

/** 目录拉取的账号上下文(与 nexus/collector/base.py `AccountContext` 对应字段)。 */
export interface CatalogAccountInput {
  provider: string;
  username: string;
  token: string;
  /** 区域;缺省时 trae 按 cn、workbuddy 按 token 推断。 */
  region?: string | null;
  /** workbuddy 用;缺省不发送 X-User-Id。 */
  uid?: string | null;
  /** workbuddy 企业账号用;缺省不发送 X-Enterprise-Id。 */
  enterprise_id?: string | null;
  /** 凭据 raw 的其他字段(domain / enterprise_id / machine_id / device_id / api_base)。 */
  extras?: Record<string, unknown>;
  /** 显式覆盖基址(测试 / 企业代理);不读 provider.base_url 的渠道才需要它。 */
  baseUrl?: string | null;
}

// ---------------------------------------------------------------------------
// 公共小工具(catalog.py L157-195)
// ---------------------------------------------------------------------------

/**
 * 正的有限数 → int;其余(0 / 负 / 缺失 / 布尔 / 非有限)一律 `null`。
 *
 * ⚠️ `bool` 必须排除:`true` 放进数值比较会变成「1 token」,比解析失败更难查。
 * ⚠️ 同样不放行 `inf`/`nan`——`int(inf)` 在 Python 里直接抛 OverflowError,
 * TS 里得到 `Infinity`/`NaN`,两者都是「这一行数据坏了」而非「这一行没有值」。
 */
export function positive_int(value: unknown): number | null {
  const num = number_of(value);
  if (num === null || !Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

/** 非空字符串;非字符串/空白串 → ""。 */
function nonempty_str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 积分倍率 → float。
 *
 * `allowZero=true` 给 workbuddy 的 `x0.00 credits`:那是**免费**的真实值,
 * 与「解析失败」必须区分开(显示成「—」等于说上游没给倍率)。
 */
function rate_of(value: unknown, allowZero = false): number | null {
  const num = number_of(value);
  if (num === null || !Number.isFinite(num) || num < 0) return null;
  if (num === 0 && !allowZero) return null;
  return num;
}

/** dict 形态的值(数组 / null / 标量一律当空)。 */
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function is_list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** 有上游目录通路的渠道。其余渠道的清单来自 real_model(登记),无可拉目录。 */
export const CATALOG_PROVIDERS = ["trae", "workbuddy", "sensenova", "minimax", "qoder"] as const;

/** 目录请求超时。比额度采集**更紧**:目录只影响页面展示,不值得让「刷新」等 15 秒。 */
export const CATALOG_TIMEOUT_MS = 8_000;

export function catalog_supported(provider_id: string): boolean {
  const p = String(provider_id ?? "").trim().toLowerCase();
  return (CATALOG_PROVIDERS as readonly string[]).includes(p);
}

// ---------------------------------------------------------------------------
// trae
// ---------------------------------------------------------------------------

/** 远程目录主机(dsh-connect-trae region.ts REGION_GATEWAYS.remote)。 */
export const TRAE_REMOTE_BASES: Record<string, string> = {
  cn: "https://solo.trae.cn/api/remote/v1",
  ai: "https://coresg-normal.trae.ai/api/remote/v1",
};

/** chat 网关上的模型明细端点 = **真正能被 llm_utils_chat 接受的那份名单**。 */
export const TRAE_WIRE_PATH = "/api/ide/v1/get_detail_param";

/**
 * wire 端点逐 function 问,五个 function 全问。
 * ⚠️ **同 id 取窗口更大的那份**,不取第一个出现的 —— 上游按 function 报告的
 * 能力并不一致(实测 2026-10-11:同一个 `deepseek-v4.1-flash`,work 路由报
 * dev=200K、agent 路由报 dev=200K + max=1M)。先到先得会把 1M 档吞成 200K。
 */
export const TRAE_WIRE_FUNCTIONS: Record<string, readonly string[]> = {
  cn: ["solo_work_remote", "solo_work_lite", "solo_agent_remote", "chat_v3", "solo_coder"],
  ai: ["solo_work_remote", "solo_work_lite", "solo_agent_remote", "chat_v3"],
};

/**
 * 远程目录要问的 function 组。**两区域同一份**:
 * 只问 `solo_agent_remote` 会漏掉 `solo_agent` 独有的 9 个模型;
 * 不服务的名字上游忽略不报错,所以多问无害。
 */
export const TRAE_REMOTE_FUNCTIONS: readonly string[] = [
  "solo_agent",
  "solo_agent_remote",
  "solo_work_remote",
  "solo_work_lite",
  "chat_v3",
  "solo_coder",
  "builder_v3",
];

/** 远程目录的区域化请求头(dsh `remoteDressing`)。 */
function trae_region_dressing(region: string): Record<string, string> {
  if (region === "ai") {
    return {
      referer: "https://coresg-normal.trae.ai/",
      timezone: "Asia/Singapore",
      language: "en",
    };
  }
  return {
    referer: "https://solo.trae.cn/",
    timezone: "Asia/Shanghai",
    language: "zh-cn",
  };
}

/** `get_detail_param` 请求体(dsh 原样)。其余字段上游不校验,照抄最省事。 */
function trae_wire_body(fn: string): Record<string, unknown> {
  return {
    function: fn,
    config_names: null,
    need_prompt: false,
    current_config_info: null,
    poly_prompt: true,
    mode_type: null,
    agent_type: null,
  };
}

/**
 * wire 行的积分倍率:`display_contact_config`(内嵌第二份 JSON)。
 *
 * ⚠️ 这个值是**折后价**,与远程目录的 `consumption_rate` 可以差 10 倍
 * (限时 1 折时前者 0.08、后者 0.8)。两者都取时以本字段为准。
 */
function wire_credit_multiplier(config: Record<string, unknown>): number | null {
  const raw = config["display_contact_config"];
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const consumption = record(record(parsed)["consumption_rate"]);
  if (consumption["enable"] !== true) return null;
  return rate_of(record(consumption["data"])["rate"]);
}

/** `config_info_list` 单行 → 目录行(纯函数)。 */
export function parse_trae_wire_model(value: unknown): CatalogEntry | null {
  const raw = record(value);
  const mid = nonempty_str(raw["config_name"]);
  if (!mid) return null;
  const display = record(raw["display_config"]);
  const details = raw["model_detail_list"];
  const detail = is_list(details).length > 0 ? record(is_list(details)[0]) : {};
  const tokens = record(raw["context_window_tokens"]);
  const context =
    positive_int(tokens["max"]) ?? positive_int(tokens["dev"]) ?? positive_int(detail["prompt_max_tokens"]);
  return {
    id: mid,
    name: nonempty_str(display["display_name"]) || mid,
    vision: raw["multimodal"] === true,
    context_window: context,
    max_output: positive_int(detail["max_tokens"]),
    rate: wire_credit_multiplier(raw),
    origin: "wire",
    callable: true,
    // trae 的能力字段散在 display_config 与 model_detail_list 里,字段名也没有共识,
    // 所以走通用探测(见 `reasoning_field_of`)—— 探不到就是 `[]`/`null`,不猜。
    reasoning_efforts: reasoning_efforts_of(
      reasoning_field_of(raw) ?? reasoning_field_of(display) ?? reasoning_field_of(detail),
    ),
    reasoning_allows_off: reasoning_allows_off_of(
      reasoning_field_of(raw) ?? reasoning_field_of(display) ?? reasoning_field_of(detail),
    ),
  };
}

/** 远程目录单行 → 目录行(纯函数,dsh `parseTraeRemoteModel`)。 */
export function parse_trae_remote_model(value: unknown): CatalogEntry | null {
  const raw = record(value);
  const mid = nonempty_str(raw["name"]);
  if (!mid) return null;
  const tokens = record(raw["context_window_tokens"]);
  const context = positive_int(tokens["max"]) ?? positive_int(tokens["dev"]);
  // `features` 是 **JSON 字符串**(实测);解析失败按「没有倍率」处理。
  let features: Record<string, unknown> = {};
  if (typeof raw["features"] === "string") {
    try {
      features = record(JSON.parse(raw["features"] as string));
    } catch {
      features = {};
    }
  }
  const consumption = record(features["consumption_rate"]);
  const rate =
    consumption["enable"] === true ? rate_of(record(consumption["data"])["rate"]) : null;
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
      reasoning_field_of(raw) ?? reasoning_field_of(features),
    ),
  };
}

/**
 * 同一 id 两行时留**容量更大**的那行(dsh `preferStrongerRow`)。
 *
 * 上游按 function 分组报告容量,且组序在两次调用间会变 —— 留第一个出现
 * 会让同一个模型的窗口在两次刷新之间跳来跳去(实测 DeepSeek-V4 系列:
 * `solo_agent` 组报 max=1000000,其它组报 max=0)。
 */
export function prefer_stronger(neu: CatalogEntry, old: CatalogEntry | undefined): CatalogEntry {
  if (old === undefined) return neu;
  const newCtx = neu.context_window ?? 0;
  const oldCtx = old.context_window ?? 0;
  if (newCtx > oldCtx) return neu;
  if (newCtx === oldCtx && (neu.max_output ?? 0) > (old.max_output ?? 0)) return neu;
  return old;
}

/** 展示名归一键(跨源 join 用)。 */
function display_key(name: string): string {
  return (name || "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

/**
 * remote 骨架 + wire 补「chat 端点真正认的名字」。
 *
 * 两级 join(dsh `mergeTraeModelSources` 同口径):
 *
 * 1. `wire.id`(config_name)等于 remote id —— 常见情况,两者同名;
 * 2. 归一后的**展示名**相等 —— 少数情况两边写法不一样
 *    (`DeepSeek-V4-Flash` vs `deepseek-v4-flash`)。
 *
 * join 上的行以 **wire 为准**(id / 上下文 / 输出上限 / 折后倍率),展示名与多模态
 * 标志取 remote 的;**只在 remote 里的行照样保留**,标成「不可调用」——
 * 能不能调取决于账号与 function,本地判不了,静默丢掉才是把用户自己的模型藏起来。
 */
export function merge_trae(
  remote: Record<string, CatalogEntry>,
  wire: Record<string, CatalogEntry>,
): CatalogEntry[] {
  const wireByDisplay = new Map<string, CatalogEntry>();
  for (const entry of Object.values(wire)) {
    if (!wireByDisplay.has(display_key(entry.id))) wireByDisplay.set(display_key(entry.id), entry);
    if (!wireByDisplay.has(display_key(entry.name))) wireByDisplay.set(display_key(entry.name), entry);
  }

  const entries: CatalogEntry[] = [];
  for (const up of Object.values(remote)) {
    let hit: CatalogEntry | undefined = wire[up.id];
    if (hit === undefined) {
      hit = wireByDisplay.get(display_key(up.id)) ?? wireByDisplay.get(display_key(up.name));
    }
    if (hit === undefined) {
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
      callable: true,
      // ⚠️ 思考档位只在 wire 行里有(2026-11-08:`reasoning_effort_config`),
      // 合成时**必须带过来** —— 漏了它,「从上游获取思考强度」对 trae 永远是
      // 「上游没给档位」,尽管上游明明给了 light/high/extra_high。
      reasoning_efforts: hit.reasoning_efforts ?? up.reasoning_efforts,
      reasoning_allows_off: hit.reasoning_allows_off ?? up.reasoning_allows_off,
    });
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return entries;
}

/** trae 模型目录 = wire(get_detail_param)∪ remote(/models)。 */
export async function fetch_trae_catalog(
  account: CatalogAccountInput,
  opts: { baseUrl?: string; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<CatalogResult> {
  const region = normalize_trae_region(account.region ?? undefined);
  const extras = account.extras ?? {};
  const identity = resolve_identity(account.token, extras);
  // 显式覆盖(ctx.base_url,测试 / 企业代理)> provider 表里的聊天端点 > raw_json
  // 的 api_base > 区域默认。`get_detail_param` 是**聊天主机**上的接口。
  const chatBase = opts.baseUrl ?? account.baseUrl ?? resolve_api_base(undefined, region, extras);
  const warnings: string[] = [];
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CATALOG_TIMEOUT_MS;
  const wireHeaders = build_headers(account.token, identity, randomBytes(16).toString("hex"));
  wireHeaders["Accept"] = "application/json";

  // ── wire:chat 端点真正认的那份名字(可调用性权威)────────────────────────
  const wire: Record<string, CatalogEntry> = {};
  for (const fn of TRAE_WIRE_FUNCTIONS[region] ?? TRAE_WIRE_FUNCTIONS.cn) {
    let payload: unknown;
    try {
      const res = await fetchFn(`${chatBase.replace(/\/+$/, "")}${TRAE_WIRE_PATH}`, {
        method: "POST",
        headers: wireHeaders,
        body: JSON.stringify(trae_wire_body(fn)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 400) throw new CatalogError(`HTTP ${res.status}`);
      payload = JSON.parse(await res.text());
    } catch (err) {
      // 单个 function 失败不丢弃整轮:另一个组仍可能给出完整名单。
      warnings.push(`trae ${fn} 名单失败:${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const rows = record(payload)["config_info_list"];
    for (const raw of is_list(rows)) {
      const entry = parse_trae_wire_model(raw);
      if (entry === null) continue;
      wire[entry.id] = prefer_stronger(entry, wire[entry.id]);
    }
  }

  // ── remote:面向用户的目录(**骨架**,决定页面上出现哪些行)──────────────
  const remote: Record<string, CatalogEntry> = {};
  const dress = trae_region_dressing(region);
  const remoteHeaders: Record<string, string> = {
    Authorization: `Cloud-IDE-JWT ${account.token}`,
    Accept: "application/json",
    "x-trae-client-type": "web",
    "x-trae-user-timezone": dress.timezone,
    "x-preferenced-language": dress.language,
    Referer: dress.referer,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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
    warnings.push(`trae 远程目录失败:${err instanceof Error ? err.message : String(err)}`);
  }

  // ⚠️ **骨架必须是 remote,不是 wire** —— 实测(2026-10-11,真凭据):
  // wire 的 5 个 function 一共回了 82 行,其中 30 多行是 Trae IDE 自己都不展示的
  // 内部条目(`custom_model_*` / `search_agent_qwen_fast` / `file_search_agent` /
  // `title_generation` / `*-auto` 路由别名)。把它们列进面板等于替用户编一批
  // 调不通的模型(dsh-connect-trae 的 mergeTraeModelSources 同一条结论)。
  let entries: CatalogEntry[];
  if (Object.keys(remote).length === 0 && Object.keys(wire).length > 0) {
    warnings.push(
      "trae 远程目录没取到,改用 chat 名单;这份清单可能含 IDE 内部条目(custom_model_*/search_agent_*)",
    );
    entries = Object.values(wire).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  } else {
    entries = merge_trae(remote, wire);
  }

  return {
    provider: "trae",
    entries,
    source: entries.length > 0 ? "api" : "empty",
    fetched_at: Math.floor(Date.now() / 1000),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// workbuddy
// ---------------------------------------------------------------------------

/**
 * 远程产品配置。**两个区域的首选**:桌面端 App 自己读的就是它,
 * 用它才能让插件/面板的名单与 App 一致(dsh 实测 2026-10-04)。
 */
export const WORKBUDDY_GLOBAL_CONFIG_PATH = "/v3/config";

/**
 * 旧文档,只作 CN 回退:它答的是 CLI 渠道的名单,付费 `hy4-preview`
 * 与 App 里的免费 `hy4-preview-f` 同名不同价 —— 读它会让面板和 App 对不上。
 */
export const WORKBUDDY_PERSONAL_MODELS_PATH = "/v2/enterprises/personal/models";

/**
 * `/v3/config` **按客户端渠道给不同名单**(版本后缀被忽略),这个差异是承重的:
 * CN 用 CLI UA(实测唯一含免费 `hy4-preview-f` 的渠道),
 * 国际版用桌面 UA(CLI UA 会少 `deepseek-v4.1-flash` / `gpt-6-astra`)。
 */
export const WORKBUDDY_CLI_UA = "CLI/2.63.2 CodeBuddy/2.63.2";
export const WORKBUDDY_DESKTOP_UA = "WorkBuddy/5.5.2";

const CREDITS_RATE_RE = /x\s*([0-9.]+)/;

/**
 * 厂商核验表(dsh `NATIVE_MODALITY_BY_MODEL_ID`,**精确 id 匹配**)。
 * 上游的 `supportsImages` 标志猜错过,所以默认勾选不信它,只信这张表。
 */
export const NATIVE_MODALITY_BY_MODEL_ID: Record<string, string> = {
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
  "minimax-m3": "multimodal",
};

/**
 * 图片默认勾选(dsh `imageDefaultFor`)。
 *
 * - `supportsImages === false` 或 `disabledMultimodal === true` → **一票否决**;
 * - 只有「厂商核验表里标明 multimodal」才默认勾;
 * - 表里没有的 id = `unknown` → **不猜**(返回 false)。
 */
export function workbuddy_vision_default(
  model_id: string,
  supports_images: unknown,
  disabled_multimodal: unknown = null,
): boolean {
  if (supports_images === false || disabled_multimodal === true) return false;
  return NATIVE_MODALITY_BY_MODEL_ID[model_id] === "multimodal";
}

/**
 * 「思考配置」字段与思考强度档位表的解析**已上移到 `gateway/model-catalog.ts`**
 * (那里是「解析上游单条模型条目」的共同归属地,`/models` 探测与各渠道目录共用)。
 * 这里只做 re-export,保持既有 import 路径不变。
 */
export { reasoning_efforts_of, reasoning_field_of, reasoning_allows_off_of } from "../gateway/model-catalog.js";

/**
 * `/v3/config` 与 personal/models 共用的行解析(两份文档同形)。
 *
 * ⚠️ 上下文或输出上限任一 `≤ 0` 就**整行丢弃**(dsh `parseUpstreamModel`):
 * 那是上游没配好这一项的行,拿一个 0 去当上限会让 `max_tokens=0` 发出去,
 * 表现为「模型一调就 400」而不是「这一行数据不全」。
 */
export function parse_workbuddy_model(value: unknown): CatalogEntry | null {
  const raw = record(value);
  const mid = nonempty_str(raw["id"]);
  if (!mid || raw["disabled"] === true) return null;
  const context = positive_int(raw["maxInputTokens"]);
  const output = positive_int(raw["maxOutputTokens"]);
  if (context === null || output === null) return null;
  const supportsImages =
    raw["disabledMultimodal"] === true
      ? false
      : typeof raw["supportsImages"] === "boolean"
        ? raw["supportsImages"]
        : null;
  let rate: number | null = null;
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
    reasoning_allows_off: reasoning_allows_off_of(raw["reasoning"]),
  };
}

/**
 * 解析全部行,再按 `agents[]` 里 `name=='cli'` 的名单定序兼过滤。
 *
 * 拿不到可用名单时返回**全量**而不是空:名单是上游细节,它一变就静默
 * disarm 整个渠道是最坏的一种坏法(页面一片空白却看不出原因)。
 */
export function select_cli_models(raw_models: unknown, agents: unknown): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>();
  for (const raw of is_list(raw_models)) {
    const entry = parse_workbuddy_model(raw);
    if (entry !== null && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  let order: string[] = [];
  for (const agent of is_list(agents)) {
    const row = record(agent);
    if (row["name"] === "cli" && is_list(row["models"]).length > 0) {
      order = is_list(row["models"]).map(nonempty_str).filter(Boolean);
      break;
    }
  }
  if (order.length > 0) {
    const picked: CatalogEntry[] = [];
    for (const id of order) {
      const hit = byId.get(id);
      if (hit) picked.push(hit);
    }
    if (picked.length > 0) return picked;
  }
  return [...byId.values()];
}

/** workbuddy 模型目录 = `/v3/config`(CN 失败再回退 personal/models)。 */
export async function fetch_workbuddy_catalog(
  account: CatalogAccountInput,
  opts: { baseUrl?: string; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<CatalogResult> {
  const realm = normalize_wb_region(
    ((account.region ?? "").toString().trim() || detect_region_from_token(account.token)),
  );
  const extras = account.extras ?? {};
  const domain = nonempty_str(extras["domain"]);
  const uid = nonempty_str(account.uid) || nonempty_str(extras["uin"]);
  const enterprise = nonempty_str(account.enterprise_id) || nonempty_str(extras["enterprise_id"]);
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CATALOG_TIMEOUT_MS;
  const warnings: string[] = [];

  const readConfig = async (url: string, headers: Record<string, string>): Promise<CatalogEntry[]> => {
    let res: Response;
    let text: string;
    try {
      res = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new CatalogError(`连接失败:${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status >= 400) throw new CatalogError(`HTTP ${res.status}`);
    try {
      text = await res.text();
    } catch (err) {
      throw new CatalogError(`响应读取失败:${err instanceof Error ? err.message : String(err)}`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new CatalogError("响应不是 JSON");
    }
    // `{code, msg, data}` 信封:HTTP 200 + 非零 code = 业务拒绝。
    // 把它当成功会拿到空 data,于是「这一轮没模型」被渲染成「上游没有模型」。
    const root = record(payload);
    const code = root["code"];
    if (code !== undefined && code !== null && Number(code) !== 0) {
      throw new CatalogError(`业务失败 code=${String(code)}:${nonempty_str(root["msg"])}`);
    }
    const data = record(root["data"]);
    const rows = select_cli_models(data["models"], data["agents"]);
    if (rows.length === 0) {
      throw new CatalogError("响应里没有可用模型(上下文 / 输出上限缺失或为 0)");
    }
    return rows;
  };

  // ⚠️ 这一支**只用** WORKBUDDY_BASES / opts.baseUrl(显式覆盖),
  // 刻意不读 `provider.base_url`:那列存的是**聊天**主机
  // (CN = `copilot.tencent.com`),而 `/v3/config` 与 personal/models
  // 只在产品配置主机上有,拿聊天主机去请求必然 404 ——
  // 那正是五个 probe 一律「不读 provider.base_url」的同款理由。
  let entries: CatalogEntry[];
  if (realm === "cn") {
    const base = (opts.baseUrl ?? WORKBUDDY_BASES.cn).replace(/\/+$/, "");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${account.token}`,
      Accept: "application/json",
      "User-Agent": WORKBUDDY_CLI_UA,
      Origin: base,
      Referer: `${base}/`,
    };
    if (uid) headers["X-User-Id"] = uid;
    if (enterprise) headers["X-Enterprise-Id"] = enterprise;
    try {
      entries = await readConfig(`${base}${WORKBUDDY_GLOBAL_CONFIG_PATH}`, headers);
    } catch (err) {
      warnings.push(
        `workbuddy ${WORKBUDDY_GLOBAL_CONFIG_PATH} 失败,回退 ${WORKBUDDY_PERSONAL_MODELS_PATH}:${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      entries = await readConfig(`${base}${WORKBUDDY_PERSONAL_MODELS_PATH}`, headers);
    }
  } else {
    const base = (opts.baseUrl ?? WORKBUDDY_BASES.global).replace(/\/+$/, "");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${account.token}`,
      Accept: "application/json",
      "User-Agent": WORKBUDDY_DESKTOP_UA,
      "X-Product": "SaaS",
      "X-Requested-With": "XMLHttpRequest",
      Connection: "close",
    };
    if (uid) headers["X-User-Id"] = uid;
    if (domain) headers["X-Domain"] = domain;
    entries = await readConfig(`${base}${WORKBUDDY_GLOBAL_CONFIG_PATH}`, headers);
  }

  return {
    provider: "workbuddy",
    entries,
    source: "api",
    fetched_at: Math.floor(Date.now() / 1000),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// sensenova
// ---------------------------------------------------------------------------

/**
 * sensenova 模型目录端点。**聊天端点**的 `/v1/models` —— 文档明确:
 * `GET https://token.sensenova.cn/v1/models`,`Authorization: Bearer <API key>`。
 *
 * 与额度采集(`platform.sensenova.cn` 控制台 + JWT)是**两条完全不同的通路**:
 * 目录用 API key(`credential.secret` = `sk-…`),与聊天请求同一凭据。
 */
export const SENSENOVA_MODELS_PATH = "/v1/models";

/**
 * sensenova 目录的默认主机。**只到主机,不带 `/v1`** —— `/v1` 由
 * {@link sensenova_models_url} 按 {@link SENSENOVA_MODELS_PATH} 拼。
 *
 * ⚠️ 这里曾经写 `https://token.sensenova.cn/v1`,再无脑拼 `/v1/models`,
 * 于是真打出去的是 `/v1/v1/models` —— **稳定 404**,而面板如实报
 * 「模型目录没拉到(HTTP 404)」,看起来像上游没有目录接口。根因是同一个词
 * `base_url` 在两处含义不同:连接器 `DEFAULT_BASE_URL`(OpenAI 形态,**含**
 * `/v1`)与这里的**主机根**。宁可少写一段前缀,也不要让拼接去猜。
 */
export const SENSENOVA_CATALOG_BASE = "https://token.sensenova.cn";

/**
 * → `/v1/models` 的完整 URL(**纯函数**,单测直接喂 base)。
 *
 * `base` 可以是两种形状,都要接受:
 *
 * * **主机根** —— `https://token.sensenova.cn` → 补 `/v1/models`;
 * * **OpenAI 形态的 base**(连接器 `DEFAULT_BASE_URL` / `provider.base_url`
 *   就是这个形状,**已经含尾部 `/v1`**)→ 只补 `/models`。
 *
 * 为什么必须归一:这两个形状在库里同时存在(`provider.base_url` 存的是
 * 第二个),而拼接只有一条规则时,总有一个形状会变成 `/v1/v1/models`。
 * 上游对那种路径**不报错说明、只回 404**,于是「配置错了」和「上游没有这个
 * 接口」在页面上长得一模一样 —— 只能在这里就把形状吃掉。
 */
export function sensenova_models_url(base: string = ""): string {
  const root = (base || "").trim().replace(/\/+$/, "") || SENSENOVA_CATALOG_BASE;
  return root.endsWith("/v1") ? `${root}/models` : `${root}${SENSENOVA_MODELS_PATH}`;
}

/**
 * `/v1/models` 的 `data[]` 单行 → 目录行(纯函数)。
 *
 * ⚠️ `context_length` / `max_output_length` 缺失或 ≤0 时**整行保留**,
 * 只是窗口留 `null`(sensenova 文档里这两个字段恒在;万一某行缺了,
 * 面板仍要能看到这个模型,不能因为缺一个字段就把用户自己的模型藏起来)。
 */
export function parse_sensenova_model(value: unknown): CatalogEntry | null {
  const raw = record(value);
  const mid = nonempty_str(raw["id"]);
  if (!mid) return null;
  const modalities = raw["input_modalities"];
  const vision = is_list(modalities).includes("image");
  // 思考强度:sensenova 的目录**只给布尔** —— 实测每行都是
  // `supported_features: ["tools","json_mode","reasoning"]`,没有档位列表。
  // 所以「含 reasoning 但没给档位」= `null`(承认支持、不拦),不含 = `[]`(明说不支持)。
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
      supportsReasoning === true ? true : undefined,
    ),
    reasoning_allows_off: reasoning_allows_off_of(reasoning_field_of(raw)),
  };
}

/** sensenova 模型目录 = `token.sensenova.cn/v1/models`(API key 认证)。 */
export async function fetch_sensenova_catalog(
  account: CatalogAccountInput,
  opts: { baseUrl?: string; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<CatalogResult> {
  if (!account.token) {
    throw new CatalogError("sensenova 没有可用 API key,拉不了模型目录");
  }
  // base 取用顺序(probe 显式覆盖 > provider.base_url > 主机根)与
  // sensenova_models_url 的归一是配套的:两者任一形状都拼得出 …/v1/models。
  const url = sensenova_models_url(opts.baseUrl ?? account.baseUrl ?? "");
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CATALOG_TIMEOUT_MS;

  let res: Response;
  let text: string;
  try {
    res = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${account.token}`,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new CatalogError(`连接失败:${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status >= 400) throw new CatalogError(`HTTP ${res.status}`);
  try {
    text = await res.text();
  } catch (err) {
    throw new CatalogError(`响应读取失败:${err instanceof Error ? err.message : String(err)}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new CatalogError("响应不是 JSON");
  }

  const entries: CatalogEntry[] = [];
  for (const raw of is_list(record(payload)["data"])) {
    const entry = parse_sensenova_model(raw);
    if (entry !== null) entries.push(entry);
  }
  if (entries.length === 0) {
    throw new CatalogError("sensenova /v1/models 没有返回可用模型");
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    provider: "sensenova",
    entries,
    source: "api",
    fetched_at: Math.floor(Date.now() / 1000),
    warnings: [],
  };
}


// ---------------------------------------------------------------------------
// minimax(内置固定名单)
// ---------------------------------------------------------------------------

/**
 * MiniMax Agent 没有可拉的上游模型目录 API(参考实现 minimax2api 的模型表也是
 * **内置**的,启动时只做改名/下线同步)。这里就是那份内置清单,`origin=router`
 * ——「本地合成的固定名单」,面板据此显示「已登记的固定模型表」而不是「上游目录」。
 *
 * 上游 id(`upstream_model`)是 MiniMax Code 消息端点真正接受的模型串;thinking
 * 变体与主行同 id,靠 `thinking_config` 区分(参考实现 model_api.py),As One
 * 接入聊天转发前它们只是**可登记的声明**,不代表已可调度。
 */

/** minimax 目录:纯本地合成,永不失败,也永不打上游。模型表见 connectors/minimax-models.ts(与转发共用)。 */
export function fetch_minimax_catalog(
  _account: CatalogAccountInput,
  _opts: { baseUrl?: string; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): CatalogResult {
  const entries: CatalogEntry[] = MINIMAX_MODELS.map((m) => ({
    // ⚠️ 登记键用**本地 id**(minimax-agent 等),不是上游串:
    // minimax-agent / m3.1-flash / m3.1-flash-thinking 三行的 upstream 相同
    // (MiniMax-M3.1-Flash,thinking 靠 thinking_config 区分),拿上游串当 id
    // 会在 real_model 里塌缩成一行。将来接 minimax GatewayAdapter 时,
    // 本地 id → 上游模型 + 变体的映射在这里的表里现成。
    id: m.id,
    name: m.name,
    vision: m.vision,
    context_window: m.context,
    max_output: m.output,
    rate: null,
    origin: "router",
    // image 行不是 chat 端点认的名单(参考实现的 /v1/models 也只放 chat 类)。
    callable: m.upstreamModel !== "",
    // switchable / forced = 支持思考;none = 无思考(空数组 = 明说不支持)。
    reasoning_efforts:
      m.reasoning === "none" ? [] : ["low", "medium", "high", "max"],
    // ⚠️ **一律不可关**(2026-11-08 真机):MiniMax 直连 LLM 对
    // `thinking:{type:"disabled"}`(以及 `reasoning.effort:"none"`)回
    // 400 `requires adaptive thinking`。所以即使是 switchable 也不能声明
    // allows_off —— 声明了只会让用户在界面上选到一个必定失败的「关闭」。
    reasoning_allows_off: m.reasoning === "none" ? null : false,
  }));
  return {
    provider: "minimax",
    entries,
    source: "api",
    fetched_at: Math.floor(Date.now() / 1000),
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// 分流
// ---------------------------------------------------------------------------

/** qoder 目录行 → 目录行(纯函数,便于单测;真正的网络在 {@link fetch_qoder_catalog})。 */
export function qoder_entry_of(m: {
  key: string;
  displayName: string;
  enable: boolean;
  isVl: boolean;
  maxInputTokens?: number | undefined;
  maxContextTokens?: number | undefined;
  maxOutputTokens?: number | undefined;
  raw?: Record<string, unknown> | undefined;
}): CatalogEntry {
  const tc = record(m.raw?.["thinking_config"]);
  const enabled = record(tc["enabled"]);
  const effortKeys = Object.keys(record(enabled["efforts"]));
  const efforts =
    effortKeys.length > 0
      ? (reasoning_efforts_of({ supported_efforts: effortKeys }) ?? [])
      : // 有思考能力但没有档位键(或压根不思考)→ 明说「没有可选档位」
        [];
  return {
    id: m.key,
    name: m.displayName,
    vision: m.isVl,
    context_window: m.maxContextTokens ?? m.maxInputTokens ?? null,
    max_output: m.maxOutputTokens ?? null,
    rate: null,
    origin: "remote",
    callable: m.enable,
    reasoning_efforts: efforts,
    // 目录里有 `disabled` 才算能关;否则「能思考但关不掉」。
    reasoning_allows_off: tc["disabled"] === undefined ? (efforts.length > 0 ? false : null) : true,
  };
}

/**
 * qoder 上游目录(`/algo/api/v2/model/list`,连接器负责换会话 + 签名)。
 *
 * 上游每行带 **`thinking_config`**(2026-11-08 实测 12 个模型):
 *
 * ```json
 * {"disabled":{},
 *  "enabled":{"efforts":{"xhigh":{},"low":{},"medium":{"is_default":true}},
 *             "is_default":true}}
 * ```
 *
 * - `enabled.efforts` 的**键**就是档位名(值只是 `{is_default}` 标记);
 * - 有 `disabled` 才是「能关」;`gmodel`/`kmodel` 这类没有 `disabled` 的只能思考;
 * - 没有 `thinking_config`(如 `auto` / `fast`)但 `is_reasoning=true`:恒定思考,
 *   没有档位可选 → `[]`。
 */
export async function fetch_qoder_catalog(
  account: CatalogAccountInput,
  opts: { baseUrl?: string; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<CatalogResult> {
  const client = new QoderClient("qoder", opts.fetchFn === undefined ? {} : { fetch: opts.fetchFn });
  const models = await client.fetchModels(
    account.token,
    AbortSignal.timeout(opts.timeoutMs ?? CATALOG_TIMEOUT_MS),
  );
  return {
    provider: "qoder",
    entries: models.map((m) => qoder_entry_of(m)),
    source: "api",
    fetched_at: Math.floor(Date.now() / 1000),
    warnings: [],
  };
}

/** 按渠道拉目录;不支持的渠道抛 {@link CatalogError}(调用方按能力分流)。 */
export async function fetch_catalog(
  provider_id: string,
  account: CatalogAccountInput,
  opts: { baseUrl?: string; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<CatalogResult> {
  const provider = String(provider_id ?? "").trim().toLowerCase();
  if (provider === "trae") return fetch_trae_catalog(account, opts);
  if (provider === "workbuddy") return fetch_workbuddy_catalog(account, opts);
  if (provider === "sensenova") return fetch_sensenova_catalog(account, opts);
  if (provider === "qoder") return fetch_qoder_catalog(account, opts);
  // minimax 没有上游目录 API:内置固定名单(origin=router),不打上游。
  if (provider === "minimax") return Promise.resolve(fetch_minimax_catalog(account, opts));
  throw new CatalogError(`${provider} 没有可拉取的上游模型目录`);
}
