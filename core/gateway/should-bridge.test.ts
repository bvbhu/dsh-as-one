/**
 * `shouldBridgeImages`(2026-11-12 用户报「qoder 原生图像模型的图也走了图像桥」)。
 *
 * ## 旧 bug
 *
 * 判定是 `if (hardOverflow || !chainHasVision)` —— 图片数超过硬限(50)**即使
 * 有视觉端点也走桥**。而 DSH 的历史图逐轮累积，聊久了轻松破 50 张，于是
 * 视觉模型被强制降级成文字转述。
 *
 * ## 新口径
 *
 * **只看有没有视觉端点**：有 → 裁图（裁到 20 张，远低于硬限）；无 → 转文字。
 */
import { describe, expect, it } from "vitest";

import {
  IMAGE_HARD_LIMIT,
  IMAGE_MAX_PASSTHROUGH,
  shouldBridgeImages,
} from "./image-bridge.js";

describe("shouldBridgeImages", () => {
  it("链上有视觉端点 → 永不走桥(哪怕图片超硬限)", () => {
    // 这是本 bug 的核心:视觉模型不该因为历史图多就被降级成文字。
    expect(shouldBridgeImages(true)).toBe(false);
  });

  it("链上无视觉端点 → 走桥(把图转成文字证据)", () => {
    expect(shouldBridgeImages(false)).toBe(true);
  });

  it("判据与图片张数无关(签名里没有张数,从类型上就杜绝)", () => {
    // 只接受一个 boolean —— 想再塞进 imageCount 必须先改签名,是个有意的摩擦。
    expect(shouldBridgeImages.length).toBe(1);
  });

  it("裁图上限远低于上游硬限 → 有视觉时裁完一定不超限", () => {
    // 有视觉 → 不桥 → 只 dropExcessImages(裁到 IMAGE_MAX_PASSTHROUGH)。
    // 只要这个上限 < 硬限,裁完就永远不需要再走桥。
    expect(IMAGE_MAX_PASSTHROUGH).toBeLessThan(IMAGE_HARD_LIMIT);
    expect(IMAGE_MAX_PASSTHROUGH).toBe(20);
    expect(IMAGE_HARD_LIMIT).toBe(50);
  });
});
