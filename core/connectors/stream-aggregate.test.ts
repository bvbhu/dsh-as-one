/**
 * 流 → chat.completion 聚合的回归测试。
 *
 * ## 为什么有这个文件
 *
 * 2026-11-02 实测 `qoder/qfmodel`:非流式(DSH 里走 `complete()`)返回的
 * `usage.total_tokens` 是 **0**,而 prompt/completion 都正常(65 / 25)。
 * 根因是 Qoder 的 `response_meta.usage` 只报前两项,上游从不给 total;
 * `normalizeUsageInts` 又直接 `toIntOrZero(undefined) → 0`,把「没报」写成了
 * 「花了 0 个 token」。客户端按 total 计费/显示就会当成免费请求。
 *
 * 判据:total 缺失(或 0)时按 OpenAI 口径补成 prompt + completion;
 * 上游给了非 0 的数就尊重上游(它是唯一知道真实值的一方)。
 */

import { describe, expect, it } from "vitest";
import { aggregateCompletion, normalizeUsageInts } from "./stream-aggregate.js";
import type { ChatCompletionChunk } from "../gateway/types.js";

describe("normalizeUsageInts", () => {
  it("上游没报 total_tokens → 补成 prompt + completion", () => {
    expect(normalizeUsageInts({ prompt_tokens: 65, completion_tokens: 25 })).toEqual({
      prompt_tokens: 65,
      completion_tokens: 25,
      total_tokens: 90,
    });
  });

  it("上游报了 total_tokens → 原样尊重(哪怕与两项之和不一致)", () => {
    expect(normalizeUsageInts({ prompt_tokens: 1, completion_tokens: 2, total_tokens: 99 }).total_tokens).toBe(99);
  });

  it("total_tokens 为 0(旧版 Qoder 尾块形态)→ 仍然补和", () => {
    expect(normalizeUsageInts({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 0 }).total_tokens).toBe(15);
  });

  it("缺项按 0 处理,小数截断,details 保留", () => {
    const out = normalizeUsageInts({
      prompt_tokens: 12.9,
      prompt_tokens_details: { cached_tokens: 8 },
    });
    expect(out.prompt_tokens).toBe(12);
    expect(out.completion_tokens).toBe(0);
    expect(out.total_tokens).toBe(12);
    expect(out.prompt_tokens_details).toEqual({ cached_tokens: 8 });
  });

  it("usage 整个缺失时返回全 0(不抛)", () => {
    expect(normalizeUsageInts(null)).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
  });
});

/**
 * 造一个最小 OpenAI chunk。
 *
 * 参数故意收 `Record<string, unknown>`:要复现的正是「上游 usage 缺
 * `total_tokens`」这种**不完整**报文,按 `ChatCompletionChunk` 写就通不过
 * 类型检查 —— 那等于用类型系统把 bug 挡在门外,测不到真实形状。
 */
function chunk(partial: Record<string, unknown>): ChatCompletionChunk {
  return {
    id: "chatcmpl-x",
    object: "chat.completion.chunk",
    created: 0,
    model: "qfmodel",
    choices: [],
    ...partial,
  } as unknown as ChatCompletionChunk;
}

describe("aggregateCompletion", () => {
  const opts = { model: "qoder/qfmodel", completionId: "chatcmpl-abc12345", created: 1 };

  it("尾块 usage 没有 total_tokens → 聚合结果仍带正确的 total", async () => {
    const out = await aggregateCompletion(
      (async function* () {
        yield chunk({
          choices: [{ index: 0, delta: { content: "OK" }, finish_reason: null }],
        });
        yield chunk({
          choices: [],
          usage: { prompt_tokens: 65, completion_tokens: 25, prompt_tokens_details: { cached_tokens: 40 } },
        });
      })(),
      opts,
    );
    expect(out.choices[0].message.content).toBe("OK");
    expect(out.usage).toEqual({
      prompt_tokens: 65,
      completion_tokens: 25,
      total_tokens: 90,
      prompt_tokens_details: { cached_tokens: 40 },
    });
  });

  it("tool_calls 按 index 合并(先给 id+name,后续帧只给 arguments 片段)", async () => {
    const out = await aggregateCompletion(
      (async function* () {
        yield chunk({
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, id: "call_1", type: "function", function: { name: "get_weather", arguments: "" } },
                ],
              },
              finish_reason: null,
            },
          ],
        });
        yield chunk({
          choices: [
            {
              index: 0,
              delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] },
              finish_reason: null,
            },
          ],
        });
        yield chunk({
          choices: [
            {
              index: 0,
              delta: { tool_calls: [{ index: 0, function: { arguments: '"北京"}' } }] },
              finish_reason: "tool_calls",
            },
          ],
        });
      })(),
      opts,
    );
    expect(out.choices[0].message.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: '{"city":"北京"}' },
      },
    ]);
    expect(out.choices[0].finish_reason).toBe("tool_calls");
  });
});
