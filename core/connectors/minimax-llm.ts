/**
 * MiniMax 直连 LLM 端点的**方言层**（薄壳）。
 *
 * 通用转换逻辑已经搬到 `core/wire/anthropic.ts`（统一转换器）；这里只保留：
 * - MiniMax 的方言开关 {@link MINIMAX_QUIRKS}
 * - 与旧调用点/旧测试兼容的薄包装
 *
 * ## 端点事实（2026-11-08 真机实测）
 *
 * 桌面端走 `{base}/mavis/api/v1/llm/v1/messages`：
 * - 认证只要 `Authorization: Bearer <access_token>` + `anthropic-version`；
 * - **不需要签名**（x-signature / yy 只用于签到与 agent 会话接口）；
 * - **不需要设备查询串**（那是 agent session 协议才有的）；
 * - 请求体是 Anthropic Messages，响应是 Anthropic SSE 或 JSON。
 *
 * ## 方言要点（实测见 `docs/probe-anthropic-thinking.md`）
 *
 * - 思考强度只走 `output_config.effort`（`budget_tokens` 200 但不产思考，
 *   `thinking:{type:"disabled"}` 必 400）；
 * - **不校验思考签名、不绑请求前缀** → 历史思考可以不带签名回放。
 */

import {
  DEFAULT_ANTHROPIC_QUIRKS,
  toAnthropicRequest as encodeAnthropicRequest,
  type AnthropicQuirks,
} from "../wire/anthropic.js";

export {
  anthropicErrorOf,
  anthropicUnmappedStopReasons,
  anthropicUsageOf,
  createAnthropicChunkTranslator,
} from "../wire/anthropic.js";
export type { AnthropicChunkMeta as MinimaxChunkMeta } from "../wire/anthropic.js";

/** MiniMax 的方言开关（与 {@link DEFAULT_ANTHROPIC_QUIRKS} 相同，显式写出来防漂移）。 */
export const MINIMAX_QUIRKS: AnthropicQuirks = {
  ...DEFAULT_ANTHROPIC_QUIRKS,
  effortField: "output_config",
  requiresSignature: false,
  systemShape: "string",
  streamOnly: true,
  maxTokensDefault: 4096,
};

/**
 * OpenAI chat 请求体 → MiniMax 的 Anthropic Messages 请求体。
 *
 * 参数与返回值与拆分前完全一致（`effort` 是**已经翻成上游取值**的档位串）。
 */
export function toAnthropicRequest(
  body: Record<string, unknown>,
  model: string,
  effort?: string,
): Record<string, unknown> {
  return encodeAnthropicRequest(body, model, effort, MINIMAX_QUIRKS);
}
