/**
 * 真实模型视图与思考强度三态 —— 从 assembly.ts 模块级拆出(重构第六刀)。
 *
 * 为什么单独一个文件:这套东西被**三个域**同时用 ——
 *   - 渠道域(assembly-channels.ts)的 `realModelMap` / `modelViewOf` 注入
 *   - 模型域(assembly-models.ts)的所有读写方法
 *   - assembly.ts 模块级的 `/v1/models` 清单、逻辑模型 token 钳制
 * 放在任何一个域里都会造成域与域互引,所以提到共用的最底层。
 *
 * 只放纯映射:注册表/db 行 → 内存视图。不摸网络、不摸面板状态。
 */

import { orderRawLevels } from "@as-one/core/src/gateway/reasoning-effort.js";
import type { NexusDatabase } from "@as-one/core/src/db/database.js";
import type { ProviderRegistry } from "@as-one/core/src/config/providers.js";

/** 真实模型视图(注册表为主,db.real_model 行作 overlay)。 */
export interface ModelView {
  provider: string;
  model: string;
  name: string | null;
  hidden: boolean;
  supportsVision: boolean;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  concurrency: number | null;
  /** 是否在运行期注册表(网关 /v1/models 与调度只认注册表)。 */
  registered: boolean;
  /**
   * 上游目录给的**思考强度档位表**(`real_model.supported_reasoning_efforts`),
   * **上游原文**(`xhigh`/`light`/`extra_high`…),按阶梯升序。
   *
   * 三态,与那一列的语义一一对应:
   * - `null` = 上游没给档位表(或还没回源)⇒ 网关**不发送该字段**;
   * - `[]` = 上游明确说「不吃思考强度」⇒ 一律不发;
   * - `[...]` = 按这些档位钳制,选中哪行就发哪行的原文。
   */
  supportedReasoningEfforts: string[] | null;
  /**
   * `real_model.supported_reasoning_efforts` 列的**原始文本**(未加工)。
   *
   * 2026-11-03 用户定案:面板上「思考强度」要显示**库里原文**,不是归一后的数组
   * —— 归一({@link parseReasoningEfforts})会丢掉上游的原始拼写(如 `xhigh`),
   * 只看归一结果就发现不了「库里存的和生效的不是一回事」。
   *
   * - `null` = 列是 NULL(数据库默认:网关不拦也不发);
   * - 字符串 = 列里的原文(通常是 JSON 数组文本,如 `["low","medium","high"]`)。
   */
  supportedReasoningEffortsRaw: string | null;
  /** 是否允许关思考(`off`)。`null` = 上游没说(按允许处理)。 */
  reasoningAllowsOff: boolean | null;
}

/**
 * 库里的 TEXT 列 → 内存三态(见 {@link serializeReasoningEfforts})。
 *
 * **保留上游原文**:`["xhigh"]` 读出来还是 `["xhigh"]`,不归一成 `["max"]`。
 * 网关拿这张表做钳制,选中的就是这行原文、原样写进上游报文;归一会把
 * `xhigh`/`light`/`extra_high` 抹成规范名,上游反而认不出。
 *
 * 只做排序去噪(丢掉 `off`/认不出的值),见 core 的 `orderRawLevels`。
 */
export function parseReasoningEfforts(raw: string | null | undefined): string[] | null {
  if (raw === null || raw === undefined) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    return orderRawLevels(v.map((x) => String(x ?? "")));
  } catch {
    return null;
  }
}

/**
 * `real_model.reasoning_allows_off`(INTEGER)→ 内存三态。
 *
 * `null`(列不存在/上游没说)= **按允许处理**;`0` = 不允许(退到 `low`)。
 *
 * ⚠️ 入参是 SQLite 的 INTEGER(`1`/`0`),不是 JS 布尔 —— 直接 `=== true` 判不出来。
 */
export function parseReasoningAllowsOff(raw: boolean | number | null | undefined): boolean | null {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  return null;
}

/**
 * 内存三态 → 库里的 TEXT 列(可空 JSON)。
 *
 * `null` 存 NULL(不拦),`[]` 存 `"[]"`(一律不发),其余原样存 JSON 数组。
 * 写入口只做序列化,不做归一批处理 —— 库里的原文就是网关要发的值。
 */
export function serializeReasoningEfforts(
  efforts: readonly string[] | null | undefined,
): string | null {
  if (efforts === null || efforts === undefined) return null;
  return JSON.stringify(efforts);
}

/** 真实模型视图(注册表为主,db.real_model 行作 overlay)。 */
export function realModelMapOf(
  registry: ProviderRegistry,
  db: NexusDatabase,
  pid?: string,
): Map<string, ModelView> {
  const out = new Map<string, ModelView>();
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
      supportedReasoningEffortsRaw: null,
      reasoningAllowsOff: null,
    });
  }
  for (const row of db.realModel.list().filter((r) => pid === undefined || r.provider === pid)) {
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
      supportedReasoningEffortsRaw: row.supported_reasoning_efforts ?? null,
      reasoningAllowsOff: parseReasoningAllowsOff(row.reasoning_allows_off),
    });
  }
  return out;
}
