/**
 * `providerDisplayName` —— 唯一 provider id → 人话名映射的纪律单测。
 *
 * 重点只守两条,别的都不是事:
 * 1. **未知 provider 必须原样返回 id**(这是硬纪律:界面永远不编名);
 * 2. 空 provider 返回空串(调用方据此判断「这份路由没有供应商信息,别画标签」)。
 */

import { describe, expect, it } from "vitest";
import {
  providerDisplayName,
  PROVIDER_DISPLAY_NAMES,
} from "./provider-labels.js";

describe("providerDisplayName", () => {
  it("已知渠道返回人话名", () => {
    expect(providerDisplayName("qoder")).toBe("Qoder");
    expect(providerDisplayName("trae")).toBe("Trae");
    expect(providerDisplayName("workbuddy")).toBe("WorkBuddy");
    expect(providerDisplayName("minimax")).toBe("MiniMax");
    expect(providerDisplayName("sensenova")).toBe("SenseNova");
    expect(providerDisplayName("openrouter")).toBe("OpenRouter");
  });

  it("未知 provider 原样返回 id(绝不编名)", () => {
    expect(providerDisplayName("acme")).toBe("acme");
    expect(providerDisplayName("openrouter-free")).toBe("openrouter-free");
    expect(providerDisplayName("as-one")).toBe("as-one");
  });

  it("空 provider 返回空串,不当成「有名字但空」", () => {
    expect(providerDisplayName("")).toBe("");
  });

  it("映射是冻结的(只增不减,防止有人就手改散)", () => {
    expect(Object.isFrozen(PROVIDER_DISPLAY_NAMES)).toBe(true);
  });
});
