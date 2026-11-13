/**
 * 通用 OpenAI chunk 流 → chat.completion 聚合(core 层,纯函数零网络)。
 *
 * 移植自 Nexus 的 connectors/trae.py L751-830(`_merge_tool_call` /
 * `_normalize_usage_ints` / `aggregate_completion`),供 workbuddy / sensenova /
 * trae 等「上游恒走 SSE、非流式在内部聚流」的通道复用同一条解析路径 ——
 * 避免每处各写一遍聚合导致「流式能出工具调用、非流式丢字段」这类不一致
 * (workbuddy.py L424-426 / sensenova.py L1087-1089 注释里的历史教训)。
 *
 * 语义要点(与 Nexus 逐条对齐):
 * - tool_calls 按 index 合并(不能按到达顺序 —— 多工具并发时张冠李戴);
 * - usage 取流内最后一块;finish_reason 取最后非空值;
 * - content / reasoning_content 逐段拼接;
 * - 空 choices(纯 usage 块)不产文本;
 * - tool_calls 存在且 finish_reason 未给出时,缺省 finish_reason = "tool_calls";
 *   id 缺省 `call_{completion_id 去前缀后 8 位}_{index}`。
 *
 * 约束:core 包零依赖(zod 之外不引第三方);tsconfig strict;中文注释。
 */

import type {
  ChatChoice,
  ChatCompletion,
  ChatCompletionChunk,
  ChatToolCall,
  ChatUsage,
} from "../gateway/types.js";

/* ------------------------------------------------------------------ *
 * _normalize_usage_ints(trae.py L581-594)
 * ------------------------------------------------------------------ */

/** 把上游 usage 里的数值规范化成 OpenAI 整数形状。 */
export function normalizeUsageInts(usage: Record<string, unknown> | null | undefined): ChatUsage {
  const prompt = toIntOrZero(usage?.prompt_tokens);
  const completion = toIntOrZero(usage?.completion_tokens);
  /**
   * `total_tokens` 上游可以不给(qoder 的 `response_meta.usage` 就只报
   * prompt/completion 两项),缺省时按 OpenAI 口径补成两者之和。
   *
   * 之前这里直接 `toIntOrZero(→ 0)`,于是非流式聚合出来的
   * `chat.completion` 带着 `total_tokens: 0`:客户端按 total 计费/显示时
   * 看到的是「这次请求没花 token」,而 prompt/completion 明明有值。
   */
  const totalRaw = toIntOrZero(usage?.total_tokens);
  const out: ChatUsage = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: totalRaw > 0 ? totalRaw : prompt + completion,
  };
  const completionDetails = usage?.completion_tokens_details;
  if (isMapping(completionDetails) && Object.keys(completionDetails).length > 0) {
    out.completion_tokens_details = normalizeDetails(completionDetails);
  }
  const promptDetails = usage?.prompt_tokens_details;
  if (isMapping(promptDetails) && Object.keys(promptDetails).length > 0) {
    out.prompt_tokens_details = normalizeDetails(promptDetails);
  }
  return out;
}

function toIntOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}

function isMapping(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    out[k] = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * _merge_tool_call(trae.py L751-770)
 * ------------------------------------------------------------------ */

/** 增量 tool_calls 合并缓冲(按 index 累积)。 */
export interface MergedToolCall {
  id: string | null;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * 把流式增量 tool_calls 分片拼成完整条目(按 index 合并)。
 * 先给 id+name,后续帧只给 arguments 片段 —— 必须按 index 归位。
 */
export function mergeToolCall(
  acc: Map<number, MergedToolCall>,
  order: number[],
  raw: unknown,
): void {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
  const r = raw as Record<string, unknown>;
  const idx = typeof r.index === "number" && Number.isInteger(r.index) ? r.index : 0;
  let slot = acc.get(idx);
  if (!slot) {
    slot = { id: null, type: "function", function: { name: "", arguments: "" } };
    acc.set(idx, slot);
    order.push(idx);
  }
  if (typeof r.id === "string" && r.id !== "" && slot.id === null) {
    slot.id = r.id;
  }
  const fn = r.function;
  if (typeof fn === "object" && fn !== null && !Array.isArray(fn)) {
    const f = fn as Record<string, unknown>;
    if (typeof f.name === "string" && f.name !== "" && slot.function.name === "") {
      slot.function.name = f.name;
    }
    if (typeof f.arguments === "string" && f.arguments !== "") {
      slot.function.arguments += f.arguments;
    }
  }
}

/* ------------------------------------------------------------------ *
 * aggregate_completion(trae.py L773-830)
 * ------------------------------------------------------------------ */

export interface AggregateCompletionOptions {
  model: string;
  completionId: string;
  created: number;
}

/**
 * 聚合整条 chunk 流为完整 chat.completion。
 * chunk 已是 OpenAI chunk 形状(id/object/created/model/choices/delta/usage)。
 */
export async function aggregateCompletion(
  chunks: AsyncIterable<ChatCompletionChunk>,
  options: AggregateCompletionOptions,
): Promise<ChatCompletion> {
  const { model, completionId, created } = options;
  const textParts: string[] = [];
  const reasoningParts: string[] = [];
  const toolCalls = new Map<number, MergedToolCall>();
  const order: number[] = [];
  let finishReason: string | null = null;
  let usage: ChatUsage | null = null;

  for await (const chunk of chunks) {
    if (chunk.usage && (typeof chunk.usage === "object")) {
      usage = normalizeUsageInts(chunk.usage as unknown as Record<string, unknown>);
    }
    const choices = chunk.choices ?? [];
    if (choices.length === 0) continue;
    const choice = choices[0];
    if (typeof choice.finish_reason === "string" && choice.finish_reason !== "") {
      finishReason = choice.finish_reason;
    }
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content !== "") {
      textParts.push(delta.content);
    }
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content !== "") {
      reasoningParts.push(delta.reasoning_content);
    }
    for (const tc of delta.tool_calls ?? []) {
      mergeToolCall(toolCalls, order, tc);
    }
  }

  const message: ChatChoice["message"] = {
    role: "assistant",
    content: textParts.join("") || null,
  };
  if (reasoningParts.length > 0) {
    message.reasoning_content = reasoningParts.join("");
  }
  if (toolCalls.size > 0) {
    const suffix = completionId.replace(/^chatcmpl-/, "").slice(0, 8);
    message.tool_calls = order.map((i, n) => {
      const merged = toolCalls.get(i)!;
      return {
        id: merged.id ?? `call_${suffix}_${n}`,
        type: "function" as const,
        function: merged.function,
      };
    });
  }

  return {
    id: completionId,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason ?? (toolCalls.size > 0 ? "tool_calls" : "stop"),
      },
    ],
    usage: usage ?? undefined,
  };
}

/** 逐条 merge 一条 tool_calls 的便捷导出(供流式侧提前看拼装结果)。 */
export function mergeToolCallInto(
  raw: unknown,
  acc: Map<number, MergedToolCall> = new Map(),
  order: number[] = [],
): { acc: Map<number, MergedToolCall>; order: number[] } {
  mergeToolCall(acc, order, raw);
  return { acc, order };
}

/** 把已完成聚合的 tool_calls 摊平成 OpenAI 数组(与 message.tool_calls 同形状)。 */
export function assembledToolCalls(
  toolCalls: Map<number, MergedToolCall>,
  order: number[],
  completionId: string,
): ChatToolCall[] {
  if (toolCalls.size === 0) return [];
  const suffix = completionId.replace(/^chatcmpl-/, "").slice(0, 8);
  return order.map((i, n) => {
    const merged = toolCalls.get(i)!;
    return {
      id: merged.id ?? `call_${suffix}_${n}`,
      type: "function" as const,
      function: merged.function,
    };
  });
}
