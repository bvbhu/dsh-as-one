/**
 * 连接器注册表 —— 按 vendor id 查找连接器。
 *
 * 与 Nexus 的 `ADAPTERS` 映射对齐。
 */

import type { AuthConnector } from "./types.js";
import { OpenAICompatAdapter } from "./openai-compat.js";
import { TraeAdapter } from "./trae.js";
import { WorkbuddyAdapter } from "./workbuddy.js";
import { SensenovaAdapter } from "./sensenova.js";
import { MinimaxAdapter } from "./minimax.js";
import { QODER_ADAPTERS } from "./qoder.js";

/** 默认连接器实例 */
const defaultConnectors: AuthConnector[] = [
  new OpenAICompatAdapter(),
  new TraeAdapter(),
  new WorkbuddyAdapter(),
  new SensenovaAdapter(),
  new MinimaxAdapter(),
  ...QODER_ADAPTERS,
];

/** 按 vendor id 查找连接器 */
export function getConnector(vendorId: string): AuthConnector | undefined {
  return defaultConnectors.find((c) => c.vendorId === vendorId);
}

/** 获取所有连接器 */
export function getAllConnectors(): AuthConnector[] {
  return [...defaultConnectors];
}

/** 注册自定义连接器 */
export function registerConnector(connector: AuthConnector): void {
  const existing = defaultConnectors.findIndex((c) => c.vendorId === connector.vendorId);
  if (existing >= 0) {
    defaultConnectors[existing] = connector;
  } else {
    defaultConnectors.push(connector);
  }
}

export { OpenAICompatAdapter } from "./openai-compat.js";
export { TraeAdapter } from "./trae.js";
export { WorkbuddyAdapter } from "./workbuddy.js";
export { SensenovaAdapter } from "./sensenova.js";
export { MinimaxAdapter, MINIMAX_LLM_PATH, MINIMAX_ANTHROPIC_VERSION } from "./minimax.js";
export { MINIMAX_MODELS, minimaxModelOf, minimaxUpstreamModelOf, minimaxCallableOf } from "./minimax-models.js";
export {
  toAnthropicRequest,
  createAnthropicChunkTranslator,
  anthropicUsageOf,
  anthropicErrorOf,
} from "./minimax-llm.js";
export type { MinimaxModelSpec, MinimaxReasoningMode } from "./minimax-models.js";
export type { MinimaxChunkMeta } from "./minimax-llm.js";
export { QoderAdapter, QODER_ADAPTERS, QoderClient, getQoderClient, QoderUpstreamError } from "./qoder.js";
export type { AuthConnector, ConnectorCredentials, RequestDecoration, TokenState, UpstreamError, UpstreamErrorKind } from "./types.js";
