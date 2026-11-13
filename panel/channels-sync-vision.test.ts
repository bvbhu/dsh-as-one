/**
 * 目录合并时 `supports_vision` 的取值口径 —— 只升不降。
 *
 * 背景:2026-11-02 用户报「模型不能读图」。两件事叠在一起:
 *
 * 1. DSH 宿主按 `inputModalities` 决定要不要把图交给模型:不声明 image 就把整块图
 *    换成一占位文本(`projectImagesForTextModel`),`read_image` 工具直接拒绝执行。
 *    修在 `llm-adapter.ts` —— 现在一律声明 ["text","image"],由网关的图像桥兜底。
 * 2. `sensenova` 的 `/v1/models` 把 `deepseek-flash` 写成 `input_modalities:["text"]`,
 *    实测同一把 key 直接发图,**它准确读出了图里的两行文字**。所以「目录说 text」
 *    被证伪,**不能**拿它把库里的 1 改成 0 —— 那等于主动蒙上看得见的眼睛。
 */
import { describe, expect, it } from "vitest";
import { nextDeclaredCapability, nextSupportsVision } from "./channels-sync.js";

describe("nextSupportsVision", () => {
  it("上游目录说能读图 → 置 1(缺省 0 也能升上来)", () => {
    expect(nextSupportsVision(0, { vision: true })).toBe(1);
    expect(nextSupportsVision(1, { vision: true })).toBe(1);
  });

  it("上游目录说只读文本 → **保留旧值**,不降级(实测目录会漏报)", () => {
    expect(nextSupportsVision(1, { vision: false })).toBe(1);
    expect(nextSupportsVision(0, { vision: false })).toBe(0);
  });

  it("幂等:连续刷新不会抖动", () => {
    let v = 1;
    for (let i = 0; i < 3; i++) v = nextSupportsVision(v, { vision: false });
    expect(v).toBe(1);
  });
});

describe("nextDeclaredCapability(刷新补空,不覆盖手改)", () => {
  it("用户没填(null)→ 用上游目录值补上(上下文窗口的核心场景)", () => {
    // simulates: existing.max_input_tokens 是 null,上游 context_length 1048576
    expect(nextDeclaredCapability(null, 1_048_576)).toBe(1_048_576);
    // 上游也没有 → null(不虚报)
    expect(nextDeclaredCapability(null, null)).toBeNull();
    expect(nextDeclaredCapability(null, undefined)).toBeNull();
  });

  it("用户填过(非 null)→ 保留用户值,不被上游覆盖", () => {
    expect(nextDeclaredCapability(131_072, 1_048_576)).toBe(131_072);
    expect(nextDeclaredCapability(0, 1_048_576)).toBe(0);
  });

  it("空值(undefined)等价于没填 → 补上游", () => {
    expect(nextDeclaredCapability(undefined, 262_144)).toBe(262_144);
  });
});
