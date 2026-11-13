/**
 * 内联字符串图片的规范化(2026-11-09,用户报「网关扔图」)。
 *
 * ## 症状与根因
 *
 * 用户那个 AIGC 会话的请求:单条 user 消息 `content` 长 **3,787,862 字符**
 * (3.7MB),消息键只有 `{content, role}` —— 图是**内联在 content 字符串里**的
 * `data:image/png;base64,...`,不是标准的 `image_url` 块数组。
 *
 * 而 `imagePartIndices` 只认块,于是这些图:
 * - 不被计成图片(`IMAGE_TOKENS` 用不上,按字符估成几十万 token)
 * - 不走图像桥(转不成文字证据)
 * - 不被 `dropExcessImages` 管(超上限也不丢,整条消息被上游拒收)
 *
 * 用户看到的现象就是「网关把图丢了」——其实是网关根本没把图当图。
 *
 * 修法:`normalizeInlineImages` 把字符串里的 data URL 切出来变成标准块,
 * 之后所有既有逻辑自动生效。
 */
import { describe, expect, it } from "vitest";

import {
  IMAGE_MAX_PASSTHROUGH,
  dropExcessImages,
  imagePartIndices,
  normalizeInlineImages,
  splitInlineImageDataUrls,
  type BridgeMessage,
} from "./image-bridge.js";

/** 造一个可控长度的 base64(不真解码,只测形状)。 */
const b64 = (n: number): string => "A".repeat(n);

describe("splitInlineImageDataUrls", () => {
  it("把 3.7MB 内联图切成 [text, image_url, text]", () => {
    const parts = splitInlineImageDataUrls(`按这张图标注:data:image/png;base64,${b64(3_700_000)} 完成后回复`);
    expect(parts).not.toBeNull();
    expect(parts!.map((p) => p.type)).toEqual(["text", "image_url", "text"]);
    const img = parts!.find((p) => p.type === "image_url");
    expect(String(img!.image_url?.url ?? "").startsWith("data:image/png;base64,")).toBe(true);
  });

  it("没有 data URL → null(调用方保持原消息不动)", () => {
    expect(splitInlineImageDataUrls("你好,继续")).toBeNull();
  });

  it("纯图无文字 → 只有 image_url 块", () => {
    const parts = splitInlineImageDataUrls(`data:image/jpeg;base64,${b64(100)}`);
    expect(parts).not.toBeNull();
    expect(parts!.map((p) => p.type)).toEqual(["image_url"]);
  });

  it("多张图 + 多段文字,顺序保持", () => {
    const parts = splitInlineImageDataUrls(
      `A data:image/png;base64,${b64(128)} B data:image/webp;base64,${b64(128)} C`,
    );
    expect(parts).not.toBeNull();
    expect(parts!.map((p) => p.type)).toEqual([
      "text",
      "image_url",
      "text",
      "image_url",
      "text",
    ]);
  });

  it("短 payload 不算图(防误判:base64 字母表与英文单词重叠)", () => {
    // `data:image/png;base64,AAAA nextword` —— 8 个字符的「payload」不是图,
    // 真实内联图至少几百字节。门槛 64 字符把它挡掉,不会把 nextword 当 base64。
    const parts = splitInlineImageDataUrls("data:image/png;base64,AAAA nextword");
    expect(parts).toBeNull();
  });

  it("真实长度的 payload 能正确切出,且不吃后面的正文", () => {
    // 256 字符的 payload(过 64 门槛),后面跟空格 + 英文正文。
    const parts = splitInlineImageDataUrls(
      `图:data:image/png;base64,${b64(256)} 这是后续正文`,
    );
    expect(parts).not.toBeNull();
    const img = parts!.find((p) => p.type === "image_url");
    const url = String(img!.image_url?.url ?? "");
    // payload 长度恰好 256(不含头),没把「这是后续正文」吞进来
    expect(url.length - "data:image/png;base64,".length).toBe(256);
    const tail = parts!.filter((p) => p.type === "text").map((p) => p.text).join("");
    expect(tail).toContain("这是后续正文");
  });
});

describe("normalizeInlineImages", () => {
  it("字符串内联图 → 块数组,且 imagePartIndices 能数出来", () => {
    const before: BridgeMessage[] = [
      { role: "user", content: `图:data:image/png;base64,${b64(1000)}` },
    ];
    // 修复前:认不出(这是 bug 的核心)
    expect(imagePartIndices(before)).toHaveLength(0);
    const after = normalizeInlineImages(before);
    expect(Array.isArray(after[0]!.content)).toBe(true);
    expect(imagePartIndices(after)).toHaveLength(1);
  });

  it("块数组形态原样返回(同一引用,零开销)", () => {
    const blocks: BridgeMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "看这张" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        ] as never,
      },
    ];
    expect(normalizeInlineImages(blocks)).toBe(blocks);
  });

  it("纯文本消息原样返回(同一引用)", () => {
    const plain: BridgeMessage[] = [{ role: "user", content: "继续" }];
    expect(normalizeInlineImages(plain)).toBe(plain);
  });

  it("多张内联图超过上限 → dropExcessImages 能正常丢弃", () => {
    // ⚠️ 每张用 128 字符 payload(过 64 门槛):真实内联图至少几百字节,
    // 用 4 个字符的 "AAAA" 造数据会被门槛当成「不是图」,测出来的是假象。
    const many: BridgeMessage[] = Array.from({ length: 25 }, (_, i) => ({
      role: "user",
      content: `图${i}:data:image/png;base64,${b64(128)}`,
    }));
    const normalized = normalizeInlineImages(many);
    expect(imagePartIndices(normalized)).toHaveLength(25);
    const [trimmed, dropped] = dropExcessImages(normalized);
    expect(dropped).toBe(25 - IMAGE_MAX_PASSTHROUGH);
    expect(imagePartIndices(trimmed)).toHaveLength(IMAGE_MAX_PASSTHROUGH);
  });
});
