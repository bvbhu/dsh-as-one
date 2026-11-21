/**
 * 线格式编解码器注册表回归。
 *
 * 钉两件事：
 * 1. 线族判定与协议名解耦（将来新增 Messages 渠道只登记一行，流解析不用改）；
 * 2. 两个 Messages 渠道的方言**真的不同**（minimax 回放思考、自建默认不回放）。
 */

import { describe, expect, it } from "vitest";
import { wireCodecFor, wireFamilyOf } from "./index.js";

const MESSAGES = [
  { role: "user", content: "hi" },
  { role: "assistant", content: "不是", reasoning_content: "先试 7。" },
  { role: "user", content: "谢谢" },
];

describe("wireFamilyOf", () => {
  it("Messages 家族：minimax / anthropic", () => {
    expect(wireFamilyOf("minimax")).toBe("anthropic");
    expect(wireFamilyOf("anthropic")).toBe("anthropic");
  });

  it("其余（含未知）一律 chat —— 与 toProtocol 的兜底口径一致", () => {
    for (const p of ["openai", "trae", "workbuddy", "sensenova", "qoder", "codearts", "unknown"]) {
      expect(wireFamilyOf(p)).toBe("chat");
    }
  });
});

describe("wireCodecFor", () => {
  it("未注册协议 → undefined（调用方按 chat 兜底）", () => {
    expect(wireCodecFor("openai")).toBeUndefined();
    expect(wireCodecFor("nope")).toBeUndefined();
  });

  it("minimax：output_config.effort + 回放思考", () => {
    const codec = wireCodecFor("minimax")!;
    const out = codec.encodeBody({ messages: MESSAGES, max_tokens: 512 }, "MiniMax-M3.1-Flash", "high");
    expect(out["model"]).toBe("MiniMax-M3.1-Flash");
    expect(out["output_config"]).toEqual({ effort: "high" });
    const messages = out["messages"] as Array<Record<string, unknown>>;
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "先试 7。" },
        { type: "text", text: "不是" },
      ],
    });
  });

  it("anthropic：保守默认（不发思考参数、不回放思考、system 为块、max_tokens 兜底 8192）", () => {
    const codec = wireCodecFor("anthropic")!;
    const out = codec.encodeBody(
      { messages: [{ role: "system", content: "你是助手" }, ...MESSAGES] },
      "claude-x",
      "high",
    );
    expect(out["output_config"]).toBeUndefined();
    expect(out["thinking"]).toBeUndefined();
    expect(out["max_tokens"]).toBe(8192);
    expect(out["system"]).toEqual([{ type: "text", text: "你是助手" }]);
    const messages = out["messages"] as Array<Record<string, unknown>>;
    expect(messages[1]).toEqual({ role: "assistant", content: [{ type: "text", text: "不是" }] });
  });

  it("anthropic：凭据 quirks 可逐项打开（变成 minimax 行为）", () => {
    const codec = wireCodecFor("anthropic")!;
    const out = codec.encodeBody({ messages: MESSAGES, max_tokens: 512 }, "MiniMax-M3.1-Flash", "high", {
      quirks: { effortField: "output_config", requiresSignature: false, systemShape: "string" },
    });
    expect(out["output_config"]).toEqual({ effort: "high" });
    expect(out["system"]).toBeUndefined();
    const messages = out["messages"] as Array<Record<string, unknown>>;
    expect((messages[1]["content"] as Array<Record<string, unknown>>)[0]).toMatchObject({ type: "thinking" });
  });

  it("模型串原样使用（本地 id → 上游串由调用方映射）", () => {
    const codec = wireCodecFor("anthropic")!;
    expect(codec.encodeBody({ messages: MESSAGES }, "claude-3-5-sonnet")["model"]).toBe("claude-3-5-sonnet");
  });

  it("有块投影时优先走 blocks → messages（chat 体被忽略）", () => {
    const codec = wireCodecFor("minimax")!;
    const blocks = {
      system: "块里的 system",
      messages: [
        { role: "user" as const, content: [{ type: "text", text: "块里的提问" }] },
        { role: "assistant" as const, content: [{ type: "reasoning", text: "块里的思考" }, { type: "text", text: "答" }] },
      ],
    };
    const out = codec.encodeBody(
      { messages: [{ role: "user", content: "chat 体里的话" }], max_tokens: 100 },
      "MiniMax-M3.1-Flash",
      "high",
      undefined,
      { blocks, maxTokens: 64000 },
    );
    expect(out["system"]).toBe("块里的 system");
    expect(out["max_tokens"]).toBe(64000);
    const messages = out["messages"] as Array<Record<string, unknown>>;
    expect((messages[0]["content"] as Array<Record<string, unknown>>)[0]).toMatchObject({ text: "块里的提问" });
    expect((messages[1]["content"] as Array<Record<string, unknown>>)[0]).toMatchObject({ type: "thinking" });
  });
});
