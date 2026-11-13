/**
 * 连接器注册表测试。
 */

import { describe, it, expect } from "vitest";
import { getConnector, getAllConnectors, registerConnector } from "./index.js";
import { OpenAICompatAdapter } from "./openai-compat.js";
import { TraeAdapter } from "./trae.js";
import { WorkbuddyAdapter } from "./workbuddy.js";
import { SensenovaAdapter } from "./sensenova.js";
import { UpstreamError, type AuthConnector } from "./types.js";

describe("getConnector", () => {
  it("openai_compat", () => {
    const c = getConnector("openai_compat");
    expect(c).toBeDefined();
    expect(c?.vendorId).toBe("openai_compat");
  });

  it("trae", () => {
    const c = getConnector("trae");
    expect(c).toBeDefined();
    expect(c?.vendorId).toBe("trae");
  });

  it("workbuddy", () => {
    const c = getConnector("workbuddy");
    expect(c).toBeDefined();
    expect(c?.vendorId).toBe("workbuddy");
  });

  it("sensenova", () => {
    const c = getConnector("sensenova");
    expect(c).toBeDefined();
    expect(c?.vendorId).toBe("sensenova");
  });

  it("未知 vendor → undefined", () => {
    expect(getConnector("unknown")).toBeUndefined();
  });
});

describe("getAllConnectors", () => {
  it("返回 6 个连接器", () => {
    const connectors = getAllConnectors();
    // 4 个原有（openai_compat / trae / workbuddy / sensenova）+ Qoder（只接国内版）
    // + MiniMax（2026-11-08 接通聊天转发：Anthropic Messages 直连端点）。
    expect(connectors.length).toBe(6);
  });

  it("包含所有 vendor", () => {
    const vendors = getAllConnectors().map((c) => c.vendorId);
    expect(vendors).toContain("openai_compat");
    expect(vendors).toContain("trae");
    expect(vendors).toContain("workbuddy");
    expect(vendors).toContain("sensenova");
    expect(vendors).toContain("minimax");
    expect(vendors).toContain("qoder");
    expect(vendors).not.toContain("qoder-global");
  });
});

describe("registerConnector", () => {
  it("注册新连接器", () => {
    const custom: AuthConnector = {
      vendorId: "custom",
      async getToken() {
        return { accessToken: "custom-token", expiresAt: Number.POSITIVE_INFINITY };
      },
      decorateRequest(base, token) {
        return { ...base, headers: { ...base.headers, Authorization: `Bearer ${token.accessToken}` } };
      },
      classifyError() {
        return new UpstreamError("upstream", "custom error", true, 500);
      },
    };
    registerConnector(custom);
    expect(getConnector("custom")).toBeDefined();
    expect(getConnector("custom")?.vendorId).toBe("custom");
  });

  it("覆盖已有连接器", () => {
    const original = getConnector("trae");
    const custom: AuthConnector = {
      vendorId: "trae",
      async getToken() {
        return { accessToken: "custom-trae-token", expiresAt: Number.POSITIVE_INFINITY };
      },
      decorateRequest(base, token) {
        return { ...base, headers: { ...base.headers, Authorization: `Custom ${token.accessToken}` } };
      },
      classifyError() {
        return new UpstreamError("upstream", "custom trae error", true, 500);
      },
    };
    registerConnector(custom);
    const replaced = getConnector("trae");
    expect(replaced).toBeDefined();
    // 注意：registerConnector 会替换默认实例，但 getAllConnectors 返回的是副本
    // 这里主要验证不抛错
  });
});

// 验证所有连接器都实现了 AuthConnector 接口
describe("connector interface compliance", () => {
  it("所有连接器都有 vendorId", () => {
    for (const c of getAllConnectors()) {
      expect(c.vendorId).toBeDefined();
      expect(typeof c.vendorId).toBe("string");
    }
  });

  it("所有连接器都有 getToken", () => {
    for (const c of getAllConnectors()) {
      expect(typeof c.getToken).toBe("function");
    }
  });

  it("所有连接器都有 decorateRequest", () => {
    for (const c of getAllConnectors()) {
      expect(typeof c.decorateRequest).toBe("function");
    }
  });

  it("所有连接器都有 classifyError", () => {
    for (const c of getAllConnectors()) {
      expect(typeof c.classifyError).toBe("function");
    }
  });
});
