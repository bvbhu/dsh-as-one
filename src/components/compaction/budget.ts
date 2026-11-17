/**
 * Context budget math（逐行搬自 quilt/lib/budget.js，仅改 import/type）。
 * @module src/components/compaction/budget
 */

import { DEFAULT_MAX_TOKENS } from "./summarize.js";

export const OUTPUT_RESERVATION_RATIO = 0.15;
export const PROMPT_OVERHEAD_TOKENS = 512;
export const SAFETY_HEADROOM_TOKENS = 512;
export const DEFAULT_CONTEXT_WINDOW = 262144;

export function computeOutputBudget(contextWindow: number): number {
  return Math.min(DEFAULT_MAX_TOKENS, Math.floor(contextWindow * OUTPUT_RESERVATION_RATIO));
}

export function computeUsableInputTokens(contextWindow: number): number {
  return Math.max(1, contextWindow - computeOutputBudget(contextWindow) - PROMPT_OVERHEAD_TOKENS - SAFETY_HEADROOM_TOKENS);
}

export function computeChunkBudget(contextWindow: number, chunkRatio: number): number {
  return Math.max(1, Math.floor(computeUsableInputTokens(contextWindow) * chunkRatio));
}
