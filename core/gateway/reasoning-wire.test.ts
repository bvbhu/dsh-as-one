import { describe, expect, it } from "vitest";
import { offWireValue } from "./reasoning-wire.js";

describe("offWireValue:关闭思考在各协议里的写法", () => {
  it("OpenAI 口径(含 sensenova / workbuddy / qoder)写 none", () => {
    for (const p of ["openai", "sensenova", "workbuddy", "qoder", "some-future-vendor"]) {
      expect(offWireValue(p)).toBe("none");
    }
  });

  it("minimax 是 Anthropic 方言,没有关闭表达 → 不写该字段", () => {
    // `output_config.effort` 没有 none 档;`thinking:{type:"disabled"}` 会被
    // 400 `requires adaptive thinking`。目录侧 allows_off=false,正常路径不到这里。
    expect(offWireValue("minimax")).toBeUndefined();
  });

  it("协议缺失也能给一个安全值(不因 null 崩)", () => {
    expect(offWireValue(null)).toBe("none");
    expect(offWireValue(undefined)).toBe("none");
  });
});
