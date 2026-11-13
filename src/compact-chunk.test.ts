import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@as-one/core/src/gateway/types.js";
import {
  buildMergePrompt,
  flattenMessages,
  lineTokens,
  planCompactChunks,
  stage0Clean,
} from "./compact-chunk.js";

const text = (role: ChatMessage["role"], body: string): ChatMessage => ({
  role,
  content: body,
});

describe("stage0Clean", () => {
  it("只做无损清理:合并相邻重复行、压缩空行、去掉 ANSI", () => {
    const out = stage0Clean(["a", "a", "\x1b[31mb\x1b[0m", "", "", "c"]);
    expect(out).toEqual(["a", "b", "", "c"]);
  });
});

describe("flattenMessages", () => {
  it("图片不读像素,只留可寻址占位", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "看图" },
          { type: "image_url", image_url: { url: "https://example.test/a.png" } },
        ],
      },
    ];
    const lines = flattenMessages(messages);
    expect(lines).toContain("[user]");
    expect(lines).toContain("看图");
    expect(lines).toContain("[image: https://example.test/a.png]");
  });
});

describe("planCompactChunks", () => {
  it("装得下时单块、不拆分", () => {
    const plan = planCompactChunks([text("user", "短历史")], {
      inputBudgetTokens: 10_000,
    });
    expect(plan.split).toBe(false);
    expect(plan.chunks).toHaveLength(1);
    expect(plan.chunks[0]!.capTokens).toBeGreaterThan(0);
  });

  it("装不下时按窗口切块,块与块有重叠且每块有 digest 上限", () => {
    const messages: ChatMessage[] = Array.from({ length: 60 }, (_, i) =>
      text("user", `第 ${i} 轮:${"x".repeat(120)}`),
    );
    const plan = planCompactChunks(messages, { inputBudgetTokens: 600, chunkRatio: 0.8 });
    expect(plan.split).toBe(true);
    expect(plan.chunks.length).toBeGreaterThan(1);
    for (const chunk of plan.chunks) {
      expect(chunk.lines.length).toBeGreaterThan(0);
      expect(chunk.capTokens).toBeGreaterThan(0);
      expect(chunk.lines.reduce((a, l) => a + lineTokens(l), 0)).toBeLessThanOrEqual(600);
    }
  });

  it("digest 上限之和不超过总预算", () => {
    const messages: ChatMessage[] = Array.from({ length: 40 }, (_, i) =>
      text("assistant", `第 ${i} 轮:${"y".repeat(90)}`),
    );
    const plan = planCompactChunks(messages, {
      inputBudgetTokens: 500,
      digestBudgetTokens: 4096,
    });
    const sum = plan.chunks.reduce((a, c) => a + c.capTokens, 0);
    expect(sum).toBeLessThanOrEqual(4096 + plan.chunks.length * 256);
  });
});

describe("buildMergePrompt", () => {
  it("单级归并包含全部分块并保留精确信息要求", () => {
    const prompt = buildMergePrompt(["第一块", "第二块"]);
    expect(prompt).toContain("分块 1/2");
    expect(prompt).toContain("分块 2/2");
    expect(prompt).toContain("第一块");
    expect(prompt).toContain("精确文件路径");
  });
});
