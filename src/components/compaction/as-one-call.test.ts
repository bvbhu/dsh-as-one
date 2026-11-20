/**
 * as-one 适配层单测（压缩组件从 quilt 移植后针对 as-one 的调用翻译）。
 */
import { describe, it, expect } from "vitest";
import { toAsOneStreamOptions } from "./as-one-call.js";
import { SINGLE_CHUNK_PROMPT } from "./summarize.js";

describe("toAsOneStreamOptions", () => {
  it("真实 provider/model → as-one + provider/model 键，且去掉 purpose", () => {
    const out = toAsOneStreamOptions({
      provider: "maas",
      model: "spark-x2.6-4b",
      messages: [{ role: "user", content: "x" }],
      purpose: "compaction",
      sessionId: "s1",
    });
    expect(out.provider).toBe("as-one");
    expect(out.model).toBe("maas/spark-x2.6-4b");
    expect(out.purpose).toBeUndefined();
    expect(out.sessionId).toBe("s1");
    expect(out.messages).toEqual([{ role: "user", content: "x" }]);
  });

  it("model 已是完整键则原样保留", () => {
    const out = toAsOneStreamOptions({
      provider: "maas",
      model: "openrouter/free",
      purpose: "compaction",
    });
    expect(out.model).toBe("openrouter/free");
    expect(out.provider).toBe("as-one");
  });

  it("缺省 provider 时使用自定义 asOneProvider", () => {
    const out = toAsOneStreamOptions({ model: "free" }, "my-as-one");
    expect(out.provider).toBe("my-as-one");
    expect(out.model).toBe("free");
  });
});

describe("SINGLE_CHUNK_PROMPT", () => {
  it("单块提示词要求一次成稿且含检索键", () => {
    expect(SINGLE_CHUNK_PROMPT).toContain("ONE contiguous excerpt");
    expect(SINGLE_CHUNK_PROMPT).toContain("literal retrieval keys");
  });
});
