/**
 * model-catalog.ts —— 上游模型目录(/models)响应解析。
 *
 * 移植 Nexus `nexus/panel/api.py` 的语义:
 *   - `_capability_int` → capabilityInt:三道护栏(bool 先挡 / NaN±inf 挡 / ≤0 当没说);
 *   - `_vision_of` → visionOf:没明说一律 False(保守),防止给不支持图片的模型勾「图片」;
 *   - `_model_entry` → modelEntry:字符串元素没有能力字段(不猜);
 *   - `_parse_model_entries` → parseModelEntries:裸数组或 dict 的
 *     data/models/items/result 键,元素是字符串或 Mapping,认不出 → null。
 *   常量对齐:_CONTEXT_KEYS / _OUTPUT_KEYS / _VISION_FLAG_KEYS / _VISION_LIST_KEYS /
 *   _MAX_UPSTREAM_MODELS=500 / _MAX_MODEL_NAME=200。
 */

import { orderRawLevels } from "./reasoning-effort.js";

/** `context_window` 的候选键(按顺序取第一个读得出的正整数)。 */
export const CONTEXT_KEYS: readonly string[] = [
  "context_length",
  "max_input_tokens",
  "context_window",
  "max_model_len",
  "input_token_limit",
];

/** `max_output` 的候选键。 */
export const OUTPUT_KEYS: readonly string[] = [
  "max_completion_tokens",
  "max_output_tokens",
  "max_output_length",
  "completion_tokens_limit",
  "output_token_limit",
  "max_output",
];

/** 直接说「支不支持」的布尔键。 */
export const VISION_FLAG_KEYS: readonly string[] = [
  "supports_vision",
  "vision",
  "supports_image_input",
];

/** 用列表罗列输入形态的键(sensenova 的 `input_modalities` 就是这种)。 */
export const VISION_LIST_KEYS: readonly string[] = [
  "input_modalities",
  "supported_input_modalities",
  "modalities",
  "input_types",
];

export const MAX_UPSTREAM_MODELS = 500;
export const MAX_MODEL_NAME = 200;

/** 上游给的数字 → 正整数;**给不出就 null**(宁可空着,不许瞎填)。 */
export function capabilityInt(value: unknown): number | null {
  // bool 先挡掉 —— JS 里 true 会被 Number(true) 当成 1。
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

/** 按 `keys` 顺序取第一个读得出来的正整数。 */
export function firstCapabilityInt(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const number = capabilityInt(record[key]);
    if (number !== null) return number;
  }
  return null;
}

/** 这家有没有明说「能吃图」。没明说一律 false(保守方向)。 */
export function visionOf(record: Record<string, unknown>): boolean {
  for (const key of VISION_FLAG_KEYS) {
    if (record[key] === true) return true;
  }
  for (const key of VISION_LIST_KEYS) {
    const kinds = record[key];
    if (!Array.isArray(kinds)) continue;
    const values = new Set(kinds.map((k) => String(k).trim().toLowerCase()));
    if (values.has("image") || values.has("images") || values.has("vision") || values.has("multimodal")) {
      return true;
    }
  }
  return false;
}

/** 单条上游模型条目解析结果(能力读不出 → null,不瞎填)。 */
export interface CatalogEntry {
  id: string;
  context_window: number | null;
  max_output: number | null;
  vision: boolean;
  /**
   * 该模型**支持的思考强度档位**(用户 m09328/m09937/m10437)。三态:
   * - `null` = 上游没给档位表(网关不拦,客户端给什么发什么);
   * - `[]`   = 上游明说不支持思考(一律不传);
   * - 非空   = 规范阶梯档位表(`low`/`medium`/`high`/`max`,升序)。
   *
   * ⚠️ 这里只认上游**明说**的字段;读不出来就是 `null`,**不猜** —— 猜错会把
   * 一个支持思考的模型标成「一律不传」,用户再也发不出 reasoning_effort。
   */
  reasoning_efforts: string[] | null;
  /**
   * 是否允许**关闭思考**(`off`)。`null` = 上游没说(按「允许」处理,交给上游拒)。
   * 实测只有 workbuddy 给(`reasoning.canDisableThinking`)。
   */
  reasoning_allows_off: boolean | null;
}

/**
 * 从一行**形状未知**的上游条目里挖出「思考配置」字段。
 *
 * 为什么需要它:各家目录的字段名完全没共识 —— workbuddy 叫 `reasoning`(对象)、
 * sensenova 叫 `supported_features`(字符串数组)、trae 的 `features` 是**字符串化的
 * JSON**、自建网关经常直接叫 `reasoning_efforts`。逐个 parser 手写一遍既啰嗦又容易
 * 漏,所以抽一个通用探测:按常见名字挨个找,拿到什么算什么。
 *
 * 返回值直接喂给 {@link reasoning_efforts_of}:
 * - 找到对象(如 `{supportedEfforts:[…]}`)→ 当 `reasoning` 用;
 * - 找到字符串(如 `"low,high"`)→ 拆成数组再包成对象;
 * - 找不到 → `null`(由调用方用「上游有没有明说支持思考」决定 `[]` 还是 `null`)。
 */
export function reasoning_field_of(raw: Record<string, unknown>): unknown {
  for (const key of [
    "reasoning",
    "reasoning_config",
    "reasoningConfig",
    "thinking",
    "thinking_config",
    "thinkingConfig",
    // trae wire 目录:`{"default_level":"high","options":["light","high","extra_high"],
    // "support_thinking":true}`(2026-11-08 实测 get_detail_param)
    "reasoning_effort_config",
    "reasoningEffortConfig",
  ]) {
    const v = raw[key];
    if (v !== undefined && v !== null && typeof v !== "boolean") return v;
  }
  // 有些网关直接把档位数组/逗号串摊平在顶层。
  for (const key of ["reasoning_efforts", "supported_reasoning_efforts", "supportedReasoningEfforts"]) {
    const v = raw[key];
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

/**
 * 「思考配置」字段 → 该模型**支持**的思考强度档位表。
 *
 * 三种返回:
 * - `null`  **上游没给档位表** —— 网关不发送该字段;
 * - `[]`    **上游明说不支持思考** —— 一律不传 reasoning_effort;
 * - `[...]` 档位表,**上游原文**(如 `["light","high","extra_high"]`),按阶梯升序。
 *
 * `supports_reasoning` 用来区分前两种:有的目录只给一个布尔
 * (实测 sensenova 每行 `supported_features: ["tools","json_mode","reasoning"]`,
 * 含 reasoning 但**没给档位**)—— 含 = `null`(承认支持、不拦),不含 = `[]`。
 *
 * ⚠️ 不归一成规范名(`xhigh` 不会变成 `max`):这张表要原样落库,网关钳制
 * 选中的就是这行原文,直接写进上游报文。认不出的值(orderRawLevels 处理)丢掉。
 *
 * 实测形态(2026-10-24 探 workbuddy `/v3/config`,61 个模型):
 * - `{"supportedEfforts":["low","high"], …}` → `["low","high"]`;
 * - `{"effort":"high","summary":"auto"}`(无 supportedEfforts)→ `["high"]`;
 * - `reasoning: null` + 没说 supportsReasoning → `[]`;
 * - `reasoning: null` + `supportsReasoning: true` → `null`。
 */
export function reasoning_efforts_of(
  reasoning: unknown,
  supports_reasoning: unknown = undefined,
): string[] | null {
  if (reasoning !== null && reasoning !== undefined) {
    const r = (reasoning && typeof reasoning === "object" && !Array.isArray(reasoning)
      ? reasoning
      : {}) as Record<string, unknown>;
    // 上游明说**不支持思考**(trae 的 `support_thinking:false`)→ 空表。
    if (r["support_thinking"] === false || r["supports_thinking"] === false) return [];
    // ⚠️ 三种拼写都要认:camelCase(workbuddy 自建目录)、snake_case
    // (OpenRouter 官方 `/models`,2026-11-08 实测 194/425 条带这张表)、
    // 以及 trae 的 `options`。只认驼峰会把这些**真给了档位**的上游当成「没给」。
    const rawList =
      (Array.isArray(r["supportedEfforts"]) && r["supportedEfforts"]) ||
      (Array.isArray(r["supported_efforts"]) && r["supported_efforts"]) ||
      (Array.isArray(r["options"]) && r["options"]) ||
      (Array.isArray(r["efforts"]) && r["efforts"]) ||
      [];
    // ⚠️ 落库存**上游原文**(`xhigh`/`light`/`extra_high`…),不归一成规范名 ——
    // 网关钳制选中的就是这行原文,直接写进报文;归一会把拼写丢掉,再发出去
    // 就成了上游不认识的「max」。这里只排序去噪(见 `orderRawLevels`)。
    const levels = orderRawLevels((rawList as unknown[]).map((x) => String(x ?? "")));
    if (levels.length > 0) return levels;
    const single = String(r["effort"] ?? r["default_effort"] ?? r["defaultEffort"] ?? "").trim();
    return single ? orderRawLevels([single]) : [];
  }
  // reasoning 缺失/为 null:用 supportsReasoning 布尔区分「不支持」与「支持但没给表」。
  return supports_reasoning === true ? null : [];
}

/**
 * 该模型**是否允许关闭思考**(`off`)。
 *
 * 实测只有 workbuddy 明说:`reasoning.canDisableThinking: true|false`。
 * 其余目录没这个字段 → `null`(**未知**),由 {@link resolveReasoningEffort}
 * 按「允许」处理(交给上游自己拒)—— 总比擅自把「关闭思考」改成「low」好。
 */
export function reasoning_allows_off_of(reasoning: unknown): boolean | null {
  if (!reasoning || typeof reasoning !== "object" || Array.isArray(reasoning)) return null;
  const r = reasoning as Record<string, unknown>;
  const v = r["canDisableThinking"];
  if (v === true) return true;
  if (v === false) return false;

  // OpenRouter 口径(2026-11-08 实测 425 条目录):
  //   `mandatory: true`  → 必须思考,关不掉           → false
  //   `mandatory: false` → 可以关                     → true
  // 档位表里出现 `none`/`off` 也是「能关」的直接证据(如 tencent/hy4)。
  const mandatory = r["mandatory"];
  if (mandatory === true) return false;
  if (mandatory === false) return true;
  const efforts =
    (Array.isArray(r["supportedEfforts"]) && r["supportedEfforts"]) ||
    (Array.isArray(r["supported_efforts"]) && r["supported_efforts"]) ||
    (Array.isArray(r["options"]) && r["options"]) ||
    [];
  for (const raw of efforts as unknown[]) {
    const name = String(raw ?? "").trim().toLowerCase();
    if (name === "none" || name === "off" || name === "disabled" || name === "disable") return true;
  }
  // trae 口径:目录给了 `support_thinking` 但档位表里没有「关闭」这一项
  // (实测只有 light/high/extra_high)→ 表示**能思考但不能关**。
  const supportThinking = r["support_thinking"] ?? r["supports_thinking"];
  if (supportThinking === true) return false;
  if (supportThinking === false) return null; // 根本不能思考,off 无意义
  return null;
}

/** 单条记录 → entry。record 不是对象 → 三能力字段全空(字符串元素只有名字)。 */
export function modelEntry(name: string, record: unknown): CatalogEntry {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      id: name,
      context_window: null,
      max_output: null,
      vision: false,
      reasoning_efforts: null,
      reasoning_allows_off: null,
    };
  }
  const r = record as Record<string, unknown>;
  // ⚠️ 这里与渠道目录的口径**故意不同**:通用 `/models` 探测时,「这条目上
  // 压根没有思考相关字段」= **未知**(`null`,网关不拦),而不是「明说不支持」(`[]`)。
  // 各家目录的字段名毫无共识,凭「没有这个字段」就断言不支持,会把一个其实支持
  // 思考的模型永久标记成「一律不传 reasoning_effort」——那是不可逆的误判。
  // 反过来,只要**有**思考字段(哪怕是 `{summary:"auto"}` 这种读不出档位的),
  // 就交给 `reasoning_efforts_of` 去判 `[]`/`[...]`。
  const reasoningField = reasoning_field_of(r);
  return {
    id: name,
    context_window: firstCapabilityInt(r, CONTEXT_KEYS),
    max_output: firstCapabilityInt(r, OUTPUT_KEYS),
    vision: visionOf(r),
    reasoning_efforts: reasoningField === null ? null : reasoning_efforts_of(reasoningField),
    reasoning_allows_off:
      reasoningField === null ? null : reasoning_allows_off_of(reasoningField),
  };
}

/**
 * `GET /models` 响应体 → 条目列表;认不出 → null。
 *
 * 接受裸数组或 dict 的 data/models/items/result 键(第一个是数组的);
 * 每元素:字符串 → 只有 id(能力不猜);Mapping → id|model|name 取名字,其余字段读能力;
 * 名字空或重复跳过;名字截断 200;到 500 条停。
 */
export function parseModelEntries(payload: unknown): CatalogEntry[] | null {
  let items: unknown;
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    items = null;
    for (const key of ["data", "models", "items", "result"] as const) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        items = value;
        break;
      }
    }
  } else {
    return null;
  }
  if (!Array.isArray(items)) return null;

  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    let name: string;
    let record: unknown;
    if (typeof item === "string") {
      name = item.trim();
      record = null;
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const r = item as Record<string, unknown>;
      name = String(r.id ?? r.model ?? r.name ?? "").trim();
      record = r;
    } else {
      continue;
    }
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(modelEntry(name.slice(0, MAX_MODEL_NAME), record));
    if (out.length >= MAX_UPSTREAM_MODELS) break;
  }
  return out;
}