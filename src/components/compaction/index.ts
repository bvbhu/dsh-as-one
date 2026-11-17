/**
 * 内嵌压缩引擎组件（从 dsh-quilt-compact 完整搬入）。
 * @module src/components/compaction
 */

export { applyCompaction } from "./intercept.js";
export {
  resolveConfig,
  readCompactionConfig,
  toQuiltConfig,
  COMPACTION_DEFAULTS,
  type QuiltConfig,
  type QuiltPoolTier,
  type CompactionComponentConfig,
  type QuiltPoolModel,
} from "./config.js";
export {
  ANCHOR_OPEN_TAG,
  ANCHOR_CLOSE_TAG,
  ANCHOR_PROMPT_INSTRUCTION,
  buildAnchorBlock,
  CHUNK_PROMPT,
  MERGE_PROMPT,
  chunkInstruction,
  mergeInstruction,
} from "./summarize.js";
export { computeCooldownUntil, MemoryCooldownStore } from "./cooldown.js";
export {
  computeOutputBudget,
  computeUsableInputTokens,
  computeChunkBudget,
  DEFAULT_CONTEXT_WINDOW,
  PROMPT_OVERHEAD_TOKENS,
} from "./budget.js";
export { runStage0, chunkLines, sliceNextChunk, lineTokenCost } from "./stage0.js";
export { countTokens, messageTokens } from "./tokenizer.js";
export { ModelChain, chunkJob, mergeJob, sessionTarget, describeAttempts } from "./model-chain.js";
