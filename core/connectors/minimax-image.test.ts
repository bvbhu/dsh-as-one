/**
 * minimax 图片块映射(2026-11-12 用户报「minimax 疑似没有原生图片支持」)。
 *
 * ## 根因
 *
 * 旧实现把 OpenAI 的 `image_url` **一律**转成
 * `{type:"image", source:{type:"url", url}}`。
 * 但 Anthropic 的 `source.type:"url"` 只接受**公网 http(s) 地址**，
 * 而网关这边绝大多数图是 `data:image/…;base64,…` 的 data URL ——
 * 塞进 `url` 是**无效形状**，上游要么 400 要么静默忽略，
 * 现象就是「这个渠道没有原生图片支持」。
 *
 * ## 正确映射
 *
 * - data URL  → `{type:"base64", media_type, data}`
 * - http(s)   → `{type:"url", url}`
 * - 其它      → 文本占位(明说，不静默丢)
 */
import { describe, expect, it } from "vitest";

import { toAnthropicRequest } from "./minimax-llm.js";

/** 造一个只有一条 user 消息的最小 OpenAI 请求体。 */
function bodyWithImage(url: string): Record<string, unknown> {
  return {
    model: "minimax-m3.1-flash",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "看这张图" },
          { type: "image_url", image_url: { url } },
        ],
      },
    ],
  };
}

/** 取转换后 user 消息的 content blocks。 */
function blocksOf(body: Record<string, unknown>): Array<Record<string, unknown>> {
  const out = toAnthropicRequest(body, "MiniMax-M3.1-Flash") as {
    messages: Array<{ content: unknown }>;
  };
  const content = out.messages[0]?.content;
  return Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
}

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

describe("minimax 图片块映射", () => {
  it("data URL → base64 source(不是 url source)", () => {
    const blocks = blocksOf(bodyWithImage(PNG_DATA_URL));
    const img = blocks.find((b) => b["type"] === "image");
    expect(img).toBeDefined();
    const source = img!["source"] as Record<string, unknown>;
    expect(source["type"]).toBe("base64");
    expect(source["media_type"]).toBe("image/png");
    expect(source["data"]).toBe("iVBORw0KGgoAAAANSUhEUg==");
    // 关键:不能出现 url source
    expect(source["url"]).toBeUndefined();
  });

  it("http(s) URL → url source(保持)", () => {
    const blocks = blocksOf(bodyWithImage("https://example.com/a.png"));
    const img = blocks.find((b) => b["type"] === "image");
    expect(img).toBeDefined();
    const source = img!["source"] as Record<string, unknown>;
    expect(source["type"]).toBe("url");
    expect(source["url"]).toBe("https://example.com/a.png");
  });

  it("jpeg / webp 的 media_type 从 data URL 里取到", () => {
    for (const [mime, payload] of [
      ["image/jpeg", "AAAA"],
      ["image/webp", "BBBB"],
    ] as const) {
      const blocks = blocksOf(bodyWithImage(`data:${mime};base64,${payload}`));
      const source = blocks.find((b) => b["type"] === "image")!["source"] as Record<string, unknown>;
      expect(source["type"]).toBe("base64");
      expect(source["media_type"]).toBe(mime);
      expect(source["data"]).toBe(payload);
    }
  });

  it("认不出的形状 → 文本占位(不静默丢图)", () => {
    const blocks = blocksOf(bodyWithImage("blob:whatever"));
    expect(blocks.some((b) => b["type"] === "image")).toBe(false);
    // 占位可能不是**第一个**文本块(原文「看这张图」也在),用 some 找
    const texts = blocks
      .filter((b) => b["type"] === "text")
      .map((b) => String(b["text"]));
    expect(texts.some((t) => t.includes("未能传给上游"))).toBe(true);
    // 原文也照常保留
    expect(texts.some((t) => t === "看这张图")).toBe(true);
  });

  it("文本块照常保留", () => {
    const blocks = blocksOf(bodyWithImage(PNG_DATA_URL));
    const text = blocks.find((b) => b["type"] === "text");
    expect(String(text?.["text"])).toBe("看这张图");
  });
});
