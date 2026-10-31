/**
 * /v1/models 的条目构建 —— 逻辑模型 + 真实模型并列(与 assembly.ts
 * listModelEntries 逐字段一致)。导入方为 src/routes.ts。
 */
import type { ProviderRegistry } from "@as-one/core/src/config/providers.js";
import type { ModelEntry } from "@as-one/core/src/gateway/types.js";
export declare function listModelEntries(registry: ProviderRegistry): ModelEntry[];
