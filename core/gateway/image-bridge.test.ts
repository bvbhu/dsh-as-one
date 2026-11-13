/**
 * 图像桥的回归测试(对齐 Nexus `gateway/app.py` 图像桥段)。
 *
 * 禁止真实网络:所有上游调用都用注入的假实现。
 */

import { describe, expect, it } from "vitest";
import {
  FREE_PARSE_MAX_IMAGES,
  FREE_PARSE_UNPARSED,
  IMAGE_HARD_LIMIT,
  IMAGE_MAX_PASSTHROUGH,
  dropExcessImages,
  imagePartIndices,
  imageReplacement,
  lastUserMessage,
  parseCacheClear,
  failValue,
  okValue,
  parseCacheKey,
  tryParseImages,
  type BridgeMessage,
  type ContentPart,
} from "./image-bridge.js";

// ---------------------------------------------------------------------------
// 图像桥
// ---------------------------------------------------------------------------

/** 一张 1×1 PNG 的 data URL(内容哈希稳定即可)。 */
const PNG = "data:image/png;base64,iVBORw0KGgo=";

function imgPart(url = PNG): ContentPart {
  return { type: "image_url", image_url: { url } };
}

function userMsg(parts: ContentPart[]): BridgeMessage {
  return { role: "user", content: parts };
}

describe("图像桥:图片块识别", () => {
  it("只认 image_url / image 块", () => {
    const msgs: BridgeMessage[] = [
      userMsg([{ type: "text", text: "看图" }, imgPart()]),
      { role: "assistant", content: [{ type: "text", text: "好的" }] },
    ];
    expect(imagePartIndices(msgs)).toEqual([[0, 1]]);
  });

  it("字符串 content 不算图片", () => {
    expect(imagePartIndices([{ role: "user", content: "data:image/png;base64,xx" }])).toEqual([]);
  });

  it("lastUserMessage 从尾部往前找,不限 content 形状", () => {
    // ⚠️ 最后一条 user 是纯字符串 → 它是「本轮」载体,更早那条带图的算历史。
    const msgs: BridgeMessage[] = [
      userMsg([imgPart()]),
      { role: "assistant", content: [{ type: "text", text: "x" }] },
      { role: "user", content: "继续" },
    ];
    expect(lastUserMessage(msgs)).toBe(2);
  });
});

describe("图像桥:缓存键", () => {
  it("同一张图 → 同一个键;不同图 → 不同键", () => {
    parseCacheClear();
    const a = parseCacheKey(imgPart(PNG));
    const b = parseCacheKey(imgPart(PNG));
    const c = parseCacheKey(imgPart("data:image/png;base64,OTHER"));
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("键带 v3|free| 前缀(提示词/模型变更即自然失效)", () => {
    const key = parseCacheKey(imgPart(PNG));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("形状认不出 → null(不缓存)", () => {
    expect(parseCacheKey({ type: "text", text: "x" })).toBeNull();
  });
});

describe("图像桥:替换文本", () => {
  it("成功 → [图片 2/5 解析] …", () => {
    expect(imageReplacement(2, 5, okValue("证据正文"))).toBe("[图片 2/5 解析] 证据正文");
  });

  it("失败 → [图片 2/5 无法解析:理由] …", () => {
    expect(imageReplacement(2, 5, failValue("模型无法辨认这张图"))).toBe(
      "[图片 2/5 无法解析:模型无法辨认这张图] 这张图没有被转写成文字;不要猜测图中内容。",
    );
  });
});

describe("图像桥:逐张桥接", () => {
  it("本轮图 → 替换成证据文本,并在第一块后追加一次性说明", async () => {
    parseCacheClear();
    const msgs: BridgeMessage[] = [userMsg([{ type: "text", text: "看图" }, imgPart()])];
    const out = await tryParseImages(msgs, {
      parseOne: async () => "【文字】hello",
      chainHasVision: false,
    });
    const content = out.messages[0].content as ContentPart[];
    expect(content).toHaveLength(2);
    const text = (content[1] as { text: string }).text;
    expect(text.startsWith("[图片 1/1 解析] 【文字】hello")).toBe(true);
    expect(text).toContain("【图像桥】");
    expect(out.result.replaced).toBe(1);
    expect(out.result.parsedNow).toBe(1);
  });

  it("模型说「无法解析」→ 占位 + 不再缓存(下次重试)", async () => {
    parseCacheClear();
    const msgs: BridgeMessage[] = [userMsg([imgPart()])];
    const out = await tryParseImages(msgs, {
      parseOne: async () => `${FREE_PARSE_UNPARSED}这张图`,
      chainHasVision: false,
    });
    const content = out.messages[0].content as ContentPart[];
    expect((content[0] as { text: string }).text).toContain("无法解析:模型无法辨认这张图");
    expect(out.result.unparsed).toBe(1);
    // 「读不出来」是**确定性结论** → 入缓存,下轮不再烧免费档。
    const key = parseCacheKey(imgPart());
    expect(key).not.toBeNull();
  });

  it("历史图未缓存 → 静默删块(不写占位)", async () => {
    parseCacheClear();
    const msgs: BridgeMessage[] = [
      userMsg([imgPart()]),
      { role: "assistant", content: [{ type: "text", text: "x" }] },
      { role: "user", content: "继续" },
    ];
    const out = await tryParseImages(msgs, {
      parseOne: async () => "证据",
      chainHasVision: false,
    });
    expect(out.result.droppedHistory).toBe(1);
    expect(out.result.replaced).toBe(0);
    // 最后那条 user(字符串)没被改。
    expect(out.messages[2].content).toBe("继续");
  });

  /**
   * 工具调用循环里的图(read_image 的返回)出现在**最后一条 user 消息之后**的
   * tool 消息里。它和「本轮对话框里的图」是同一回事,必须按本轮图解析 ——
   * 此前按「历史图」静默丢弃,于是文本模型链路上读图工具白读。
   */
  it("最后一条 user 之后的 tool 消息图算本轮 → 解析替换(不是历史丢弃)", async () => {
    parseCacheClear();
    const msgs: BridgeMessage[] = [
      { role: "user", content: "读一下这张图" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "read_image", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: [{ type: "text", text: "信封" }, imgPart()] },
    ];
    const out = await tryParseImages(msgs, {
      parseOne: async () => "【文字】AI4 红色 2026 蓝色",
      chainHasVision: false,
    });
    expect(out.result.droppedHistory).toBe(0);
    expect(out.result.replaced).toBe(1);
    expect(out.result.parsedNow).toBe(1);
    const content = out.messages[2].content as ContentPart[];
    expect(content).toHaveLength(2);
    expect((content[1] as { text: string }).text.startsWith("[图片 1/1 解析] 【文字】AI4 红色 2026 蓝色")).toBe(true);
  });

  it("配额用尽 → 占位「超出单请求解析配额」", async () => {
    parseCacheClear();
    const parts: ContentPart[] = [];
    for (let i = 0; i < FREE_PARSE_MAX_IMAGES + 2; i += 1) {
      parts.push(imgPart(`data:image/png;base64,IMG${i}`));
    }
    const msgs: BridgeMessage[] = [userMsg(parts)];
    const out = await tryParseImages(msgs, {
      parseOne: async () => "证据",
      chainHasVision: false,
    });
    expect(out.result.parsedNow).toBe(FREE_PARSE_MAX_IMAGES);
    expect(out.result.unparsed).toBe(2);
    const content = out.messages[0].content as ContentPart[];
    const last = content[content.length - 1] as { text: string };
    expect(last.text).toContain("超出单请求解析配额");
  });

  it("链上有视觉端点 → 失败时保留原图(不换成占位)", async () => {
    parseCacheClear();
    const msgs: BridgeMessage[] = [userMsg([imgPart()])];
    const out = await tryParseImages(msgs, {
      parseOne: async () => null, // 解析失败
      chainHasVision: true,
    });
    const content = out.messages[0].content as ContentPart[];
    expect(content[0].type).toBe("image_url");
    expect(out.result.replaced).toBe(0);
  });
});

describe("图像桥:视觉端点路径的丢图", () => {
  it("超过上限 → 最早的图原位换成确定性占位符(不删块、不追尾注)", () => {
    const parts: ContentPart[] = [];
    for (let i = 0; i < IMAGE_MAX_PASSTHROUGH + 3; i += 1) parts.push(imgPart(`data:image/png;base64,${i}`));
    const msgs: BridgeMessage[] = [userMsg(parts)];
    const [out, dropped] = dropExcessImages(msgs);
    expect(dropped).toBe(3);
    const content = out[0].content as ContentPart[];
    // ⚠️ 2026-11-13 口径变更:最早的 3 张**原位换成确定性占位符**,
    // 而不是删块 + 追尾注 —— 那两者都会移动字节边界,打散 prompt cache。
    const images = content.filter((p) => p.type === "image_url");
    expect(images).toHaveLength(IMAGE_MAX_PASSTHROUGH);
    // 块数量不变(原位替换)
    expect(content).toHaveLength(IMAGE_MAX_PASSTHROUGH + 3);
    const folded = content.filter(
      (p) => p.type === "text" && String((p as { text?: string }).text).includes("已折叠"),
    );
    expect(folded).toHaveLength(3);
    // 关键:占位符**不含**每轮会变的计数,保证前缀稳定
    const joined = folded.map((p) => String((p as { text?: string }).text)).join("|");
    expect(joined).not.toMatch(/\d+ 张/);
    expect(joined).toContain("image/png");
  });

  it("同一输入折叠两次 → 字节完全相同(前缀稳定性)", () => {
    // prompt cache 的硬要求:同样的历史图,每一轮都必须产出同样的字节。
    const parts: ContentPart[] = [];
    for (let i = 0; i < IMAGE_MAX_PASSTHROUGH + 2; i += 1) parts.push(imgPart(`data:image/png;base64,${i}`));
    const msgs: BridgeMessage[] = [userMsg(parts)];
    const [a] = dropExcessImages(msgs);
    const [b] = dropExcessImages(msgs);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("ref= 能区分不同的图(同图同字节、异图异字节)", () => {
    // 只写「已折叠」会让两张不同的图产出同一段字节,模型无法分辨。
    // 带上内容哈希后:同图稳定(前缀缓存友好)、异图可区分。
    const parts: ContentPart[] = [];
    // 前 2 张不同的图 + 20 张凑数,让最前面的被折叠
    parts.push(imgPart("data:image/png;base64,AAAA"));
    parts.push(imgPart("data:image/jpeg;base64,BBBB"));
    for (let i = 0; i < IMAGE_MAX_PASSTHROUGH; i += 1) parts.push(imgPart(`data:image/png;base64,LATER${i}`));
    const msgs: BridgeMessage[] = [userMsg(parts)];
    const [out] = dropExcessImages(msgs);
    const content = out[0].content as ContentPart[];
    const folded = content
      .filter((p) => p.type === "text" && String((p as { text?: string }).text).includes("已折叠"))
      .map((p) => String((p as { text?: string }).text));
    expect(folded).toHaveLength(2);
    // 两张图 → 两段不同的占位符(ref 不同、mime 不同)
    expect(folded[0]).not.toBe(folded[1]);
    expect(folded[0]).toContain("ref=");
    expect(folded[1]).toContain("ref=");
    expect(folded[0]).toContain("image/png");
    expect(folded[1]).toContain("image/jpeg");
  });
  it("没超限 → 原样返回(零开销旁路)", () => {
    const msgs: BridgeMessage[] = [userMsg([imgPart()])];
    const [out, dropped] = dropExcessImages(msgs);
    expect(dropped).toBe(0);
    expect(out).toBe(msgs);
  });

  it("上游硬限是 50 张", () => {
    expect(IMAGE_HARD_LIMIT).toBe(50);
  });
});
