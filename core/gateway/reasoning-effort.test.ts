import { describe, expect, it } from "vitest";
import {
  CANONICAL_LADDER,
  canonicalEffort,
  canonizeLevels,
  resolveReasoningEffort,
} from "./reasoning-effort.js";

describe("canonicalEffort:上游拼写 → 规范阶梯", () => {
  it("归一大小写 / 连字符 / 下划线 / 空白", () => {
    expect(canonicalEffort("High")).toBe("high");
    expect(canonicalEffort("x-high")).toBe("max");
    expect(canonicalEffort("X_HIGH")).toBe("max");
    expect(canonicalEffort("  Low  ")).toBe("low");
    expect(canonicalEffort("MINIMAL")).toBe("low");
    expect(canonicalEffort("med")).toBe("medium");
    expect(canonicalEffort("default")).toBe("medium");
    expect(canonicalEffort("ultra")).toBe("max");
    expect(canonicalEffort("none")).toBe("off");
    expect(canonicalEffort("disabled")).toBe("off");
  });

  it("trae 的三档拼写也落在同一阶梯上", () => {
    expect(canonicalEffort("light")).toBe("low");
    expect(canonicalEffort("extra_high")).toBe("max");
  });

  it("认不出的取值返回 null(不猜)", () => {
    expect(canonicalEffort("banana")).toBeNull();
    expect(canonicalEffort("")).toBeNull();
  });
});

describe("canonizeLevels:原始名单 → 阶梯档位", () => {
  it("归一并去重、按阶梯升序、丢掉 off 与认不出的", () => {
    expect(canonizeLevels(["max", "low", "xhigh", "medium", "low", "banana", "none"]))
      .toEqual(["low", "medium", "max"]);
    expect(canonizeLevels(["off", "none"])).toEqual([]);
    expect(canonizeLevels([])).toEqual([]);
  });

  it("CANONICAL_LADDER 就是从弱到强四档", () => {
    expect(CANONICAL_LADDER).toEqual(["low", "medium", "high", "max"]);
  });
});

describe("resolveReasoningEffort:省略 ≠ 显式选择", () => {
  it("客户端没传 → 不发送(交还上游默认档)", () => {
    expect(resolveReasoningEffort(undefined, ["low", "high"]).reason).toBe("unspecified");
    expect(resolveReasoningEffort(undefined, ["low", "high"]).value).toBeUndefined();
    expect(resolveReasoningEffort("", ["low", "high"]).reason).toBe("unspecified");
    expect(resolveReasoningEffort(null, ["low", "high"]).reason).toBe("unspecified");
  });

  it("上游没给档位表 → 不传(未知,不拦;也不造默认梯)", () => {
    expect(resolveReasoningEffort("high", null).reason).toBe("unknown");
    expect(resolveReasoningEffort("high", null).value).toBeUndefined();
  });

  it("上游明说不支持思考 → 不传", () => {
    expect(resolveReasoningEffort("high", []).reason).toBe("unsupported");
    expect(resolveReasoningEffort("high", []).value).toBeUndefined();
  });

  it("客户端给的值认不出 → 不传(交给上游拒,由事后闸摘)", () => {
    expect(resolveReasoningEffort("banana", ["low", "high"]).reason).toBe("unrecognized");
  });
});

describe("resolveReasoningEffort:off 单独处理(不进阶梯比较)", () => {
  it("没否认能关 → 交给 wire 层写关闭取值", () => {
    expect(resolveReasoningEffort("off", ["low", "high"], true)).toEqual({
      value: undefined,
      off: true,
      clamped: false,
      reason: "off",
    });
    // allowsOff = null(未知)也按「能关」处理,发出去由上游判。
    expect(resolveReasoningEffort("off", ["low", "high"], null).off).toBe(true);
  });

  it("明说关不掉 → 退到表里**最低的那行原文**", () => {
    expect(resolveReasoningEffort("off", ["medium", "high"], false)).toEqual({
      value: "medium",
      off: false,
      clamped: true,
      reason: "off-fallback",
    });
    // 上游只有 high/max 时退到 high(发 low 一样会被拒)。
    expect(resolveReasoningEffort("off", ["high", "max"], false).value).toBe("high");
    // 表是乱序的:最低档必须按 rank 找,不能取数组首项。
    expect(resolveReasoningEffort("off", ["max", "high"], false).value).toBe("high");
    expect(resolveReasoningEffort("none", ["low", "high"], false).value).toBe("low");
  });
});

describe("resolveReasoningEffort:精确命中(发回表里的原文)", () => {
  it("规范名命中,原样发", () => {
    expect(resolveReasoningEffort("HIGH", ["low", "high", "max"])).toEqual({
      value: "high",
      off: false,
      clamped: false,
      reason: "exact",
    });
  });

  it("杂名归一后命中", () => {
    expect(resolveReasoningEffort("xhigh", ["low", "high", "max"]).value).toBe("max");
    expect(resolveReasoningEffort("minimal", ["low", "medium"]).value).toBe("low");
  });
});

describe("resolveReasoningEffort:最近档位钳制(比较用 rank,发原文)", () => {
  it("取 |rank 差| 最小的", () => {
    expect(resolveReasoningEffort("max", ["low", "high"]).value).toBe("high");
    expect(resolveReasoningEffort("low", ["high", "max"]).value).toBe("high");
  });

  it("并列时**优先取更高**(m10447:其余往高映射)", () => {
    expect(resolveReasoningEffort("medium", ["low", "high"])).toEqual({
      value: "high",
      off: false,
      clamped: true,
      reason: "nearest",
    });
    expect(resolveReasoningEffort("high", ["medium", "max"]).value).toBe("max");
  });

  it("low 侧并列往低(意图是少想)", () => {
    expect(resolveReasoningEffort("low", ["medium", "high"]).value).toBe("medium");
  });

  it("唯一候选时直接用它", () => {
    expect(resolveReasoningEffort("medium", ["high"]).value).toBe("high");
    expect(resolveReasoningEffort("medium", ["low"]).value).toBe("low");
  });

  it("四档表:各档都能命中或贴靠", () => {
    const four = ["low", "medium", "high", "max"];
    expect(resolveReasoningEffort("minimal", four).value).toBe("low");
    expect(resolveReasoningEffort("low", four).value).toBe("low");
    expect(resolveReasoningEffort("medium", four).value).toBe("medium");
    expect(resolveReasoningEffort("high", four).value).toBe("high");
    expect(resolveReasoningEffort("max", four).value).toBe("max");
    expect(resolveReasoningEffort("ultra", four).value).toBe("max");
    expect(resolveReasoningEffort("xhigh", four).value).toBe("max");
  });
});

describe("统一映射:表里存上游拼写,出口就是那行原文(不再有按协议的翻译表)", () => {
  it("workbuddy / qoder 表 {low,medium,high,xhigh}:max → xhigh", () => {
    const table = ["low", "medium", "high", "xhigh"];
    expect(resolveReasoningEffort("max", table).value).toBe("xhigh");
    expect(resolveReasoningEffort("high", table).value).toBe("high");
    expect(resolveReasoningEffort("medium", table).value).toBe("medium");
  });

  it("trae 表 {light,high,extra_high}:三档各自命中,medium 贴到 high", () => {
    const table = ["light", "high", "extra_high"];
    expect(resolveReasoningEffort("low", table).value).toBe("light");
    expect(resolveReasoningEffort("off", table, false).value).toBe("light");
    expect(resolveReasoningEffort("medium", table).value).toBe("high");
    expect(resolveReasoningEffort("high", table).value).toBe("high");
    expect(resolveReasoningEffort("max", table).value).toBe("extra_high");
  });

  it("同档两个拼写并存时,用户点名哪个就发哪个", () => {
    expect(resolveReasoningEffort("low", ["minimal", "low", "high"]).value).toBe("low");
    expect(resolveReasoningEffort("minimal", ["minimal", "low", "high"]).value).toBe("minimal");
  });
});
