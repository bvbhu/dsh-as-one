import { describe, it, expect } from "vitest";
import {
  resolveModel,
  capFor,
  limitError,
  readConfig,
  SUBAGENT_LIMIT_DEFAULTS,
  type SubagentLimitConfig,
  type ResolvedModel,
} from "./subagent-limit.js";

const cfg: SubagentLimitConfig = {
  ...SUBAGENT_LIMIT_DEFAULTS,
  defaultLimit: 9,
  limits: [
    { provider: "as-one", model: "auto", max: 2 },
    { provider: "as-one", model: "*", max: 5 },
    { provider: "*", model: "glm-flash", max: 7 },
    { provider: "*", model: "*", max: 8 },
  ],
};

function execWith(args: unknown, parent?: unknown) {
  return {
    arguments: args,
    agent: parent === undefined ? undefined : { model: { current: () => parent } },
  };
}

describe("resolveModel", () => {
  it("参数 provider/model 优先", () => {
    const r = resolveModel(execWith({ provider: "as-one", model: "glm-flash" }, { provider: "as-one", model: "auto" }));
    expect(r).toMatchObject({ provider: "as-one", model: "glm-flash", source: "arguments" });
  });
  it("无参数时取父会话模型", () => {
    const r = resolveModel(execWith({}, { provider: "as-one", model: "auto" }));
    expect(r).toMatchObject({ provider: "as-one", model: "auto", source: "agent.model" });
  });
  it("只给 model 时 provider 为空", () => {
    const r = resolveModel(execWith({ model: "hy4free" }));
    expect(r).toMatchObject({ provider: undefined, model: "hy4free" });
  });
  it("都没有时兜底", () => {
    const r = resolveModel(execWith({}));
    expect(r.source).toBe("fallback");
  });
  it("current() 抛错不崩", () => {
    const r = resolveModel({
      arguments: {},
      agent: { model: { current: () => { throw new Error("x"); } } },
    });
    expect(r.source).toBe("fallback");
  });
});

describe("capFor 四级匹配", () => {
  it("provider+model 精确最优先", () => {
    expect(capFor(cfg, { provider: "as-one", model: "auto", source: "arguments" })).toBe(2);
  });
  it("provider/* 次之", () => {
    expect(capFor(cfg, { provider: "as-one", model: "other", source: "arguments" })).toBe(5);
  });
  it("*/model 再次", () => {
    expect(capFor(cfg, { provider: "trae", model: "glm-flash", source: "arguments" })).toBe(7);
  });
  it("*/* 兜底", () => {
    expect(capFor(cfg, { provider: "trae", model: "unknown", source: "arguments" })).toBe(8);
  });
  it("无规则用 defaultLimit", () => {
    const bare = { ...SUBAGENT_LIMIT_DEFAULTS, defaultLimit: 3, limits: [] };
    expect(capFor(bare, { provider: "x", model: "y", source: "arguments" })).toBe(3);
  });
});

describe("limitError 不可重试", () => {
  it("code 是 ABORTED，message 含上限信息", () => {
    const err = limitError({ provider: "as-one", model: "auto", source: "arguments" }, 2, 2);
    expect(err.code).toBe("ABORTED");
    expect(err.name).toBe("AbortedError");
    expect(err.message).toContain("as-one/auto");
    expect(err.message).toContain("2/2");
  });
});

describe("readConfig", () => {
  it("空设置用默认值", () => {
    const c = readConfig(() => null);
    expect(c.enabled).toBe(true);
    expect(c.defaultLimit).toBe(4);
    expect(c.limits).toEqual([]);
    expect(c.countMainAgent).toBe(true);
  });
  it("读 JSON 规则与布尔开关", () => {
    const store: Record<string, string> = {
      "subagentLimit.enabled": "false",
      "subagentLimit.defaultLimit": "6",
      "subagentLimit.limits": '[{"provider":"as-one","model":"auto","max":2}]',
      "subagentLimit.countMainAgent": "false",
    };
    const c = readConfig((k) => store[k] ?? null);
    expect(c.enabled).toBe(false);
    expect(c.defaultLimit).toBe(6);
    expect(c.limits).toEqual([{ provider: "as-one", model: "auto", max: 2 }]);
    expect(c.countMainAgent).toBe(false);
  });
  it("坏 JSON 不抛，回落空规则", () => {
    const c = readConfig((k) => (k === "subagentLimit.limits" ? "{bad" : null));
    expect(c.limits).toEqual([]);
  });
  it("bool 认面板存的 1/0", () => {
    const c = readConfig((k) => {
      if (k === "subagentLimit.enabled") return "0";
      if (k === "subagentLimit.countMainAgent") return "1";
      return null;
    });
    expect(c.enabled).toBe(false);
    expect(c.countMainAgent).toBe(true);
  });
});
