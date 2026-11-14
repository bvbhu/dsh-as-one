import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@as-one/core/src/gateway/types.js";
import {
  buildMergePrompt,
  digestBudgetFor,
  flattenMessages,
  joinDigests,
  lineTokens,
  needsMerge,
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

describe("Stage 0 的第二刀:超长工具输出截断", () => {
  const long = "x".repeat(5000);
  const messages: ChatMessage[] = [
    { role: "user", content: "跑一下" },
    { role: "tool", content: long },
    { role: "assistant", content: long },
  ];

  it("只截工具结果,不动用户/助手叙述(它们不可再造)", () => {
    const plan = planCompactChunks(messages, { inputBudgetTokens: 10_000 });
    const text = plan.chunks[0]!.lines.join("\n");
    expect(text).toContain("压缩时省略");
    // 助手那条 5000 字符必须原样留着
    expect(text.split("\n").filter((l) => l === long)).toHaveLength(1);
    expect(plan.trimmedChars).toBeGreaterThan(3000);
  });

  it("切断的字符数是可回收的输入量(用来解释这次压缩省了多少)", () => {
    const plan = planCompactChunks(messages, { inputBudgetTokens: 10_000, toolOutputChars: 800 });
    expect(plan.trimmedChars).toBe(5000 - 800 <= 0 ? 0 : 5000 - 900 - 300);
  });

  it("toolOutputChars=0 关闭截断(短会话不需要丢信息)", () => {
    const plan = planCompactChunks(messages, { inputBudgetTokens: 10_000, toolOutputChars: 0 });
    expect(plan.chunks[0]!.lines.join("\n")).not.toContain("压缩时省略");
    expect(plan.trimmedChars).toBe(0);
  });
});

describe("摘要预算按区域大小现算", () => {
  it("小区域:预算跟着缩小(宿主校验要求摘要严格小于被替换的内容)", () => {
    // 实测失败形态:区域 136 token、摘要 390 token → summary is not smaller
    const budget = digestBudgetFor(136);
    expect(budget).toBeLessThan(136);
    expect(budget).toBeGreaterThanOrEqual(48);
  });

  it("大区域:封顶 8192,不随区域线性膨胀", () => {
    expect(digestBudgetFor(3_000_000)).toBe(8192);
    expect(digestBudgetFor(100_000)).toBe(8192);
  });

  it("空区域不至于给出 0 预算(那会让 max_tokens 变 0)", () => {
    expect(digestBudgetFor(0)).toBe(48);
  });

  it("单块计划的 capTokens 不会超过它自己要替换的内容", () => {
    const plan = planCompactChunks([{ role: "user", content: "短" }], {
      inputBudgetTokens: 10_000,
    });
    expect(plan.chunks[0]!.capTokens).toBeLessThanOrEqual(48);
  });
});

describe("归并决策", () => {
  it("块少时直接拼(归并要再读写一遍全部摘要,实测占 15%~25% 墙钟)", () => {
    expect(needsMerge(1)).toBe(false);
    expect(needsMerge(5)).toBe(false);
    expect(needsMerge(6)).toBe(true);
  });

  it("拼接保留分片标题,单块不加标题", () => {
    expect(joinDigests(["a"])).toBe("a");
    expect(joinDigests(["a", "b"])).toContain("片段 1/2");
    expect(joinDigests(["a", "b"])).toContain("片段 2/2");
  });
});
