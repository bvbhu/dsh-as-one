import { describe, it, expect } from "vitest";
import { CapacityView, keyOf, modelKeyOfEndpoint } from "./capacity.js";
import type { InflightLease } from "@as-one/core/src/router/types.js";

function lease(endpointId: string): InflightLease {
  return {
    leaseId: Math.random().toString(36).slice(2),
    seq: 1,
    realModelId: endpointId.split("@")[0] as never,
    endpointId: endpointId as never,
    logicalModel: "auto",
    sessionId: "s1",
    stream: true,
    startedAt: 0,
    expiresAt: 999,
    convNo: 1,
  };
}

function ledgerOf(endpoints: string[]) {
  const rows = endpoints.map(lease);
  return { detail: () => rows };
}

describe("keyOf", () => {
  it("缺 provider 时用 *", () => {
    expect(keyOf(undefined, "auto")).toBe("*/auto");
    expect(keyOf("as-one", undefined)).toBe("as-one/*");
  });
});

describe("modelKeyOfEndpoint", () => {
  it("剥掉 @username 后缀", () => {
    expect(modelKeyOfEndpoint("as-one/auto@alice")).toBe("as-one/auto");
    expect(modelKeyOfEndpoint("trae/deepseek-flash")).toBe("trae/deepseek-flash");
  });
});

describe("CapacityView.usage", () => {
  it("按 provider/model 聚合同一模型的多枚凭据", () => {
    const cap = new CapacityView(
      ledgerOf(["as-one/auto@a", "as-one/auto@b", "as-one/auto@c"]),
    );
    expect(cap.usage("as-one", "auto")).toBe(3);
  });

  it("区分不同模型 / 不同 provider", () => {
    const cap = new CapacityView(
      ledgerOf(["as-one/auto@a", "as-one/glm@a", "trae/auto@a"]),
    );
    expect(cap.usage("as-one", "auto")).toBe(1);
    expect(cap.usage("as-one", "glm")).toBe(1);
    expect(cap.usage("trae", "auto")).toBe(1);
  });

  it("provider=* 跨 provider 按模型名聚合", () => {
    const cap = new CapacityView(ledgerOf(["as-one/auto@a", "trae/auto@a"]));
    expect(cap.usage(undefined, "auto")).toBe(2);
  });

  it("model=* 统计该 provider 下所有模型", () => {
    const cap = new CapacityView(ledgerOf(["as-one/auto@a", "as-one/glm@a", "trae/auto@a"]));
    expect(cap.usage("as-one", undefined)).toBe(2);
  });

  it("excludeSessionId 排除指定会话的租约", () => {
    const rows = [lease("as-one/auto@a"), lease("as-one/auto@b")];
    rows[0].sessionId = "main-session";
    rows[1].sessionId = "child-session";
    const cap = new CapacityView({ detail: () => rows });
    expect(cap.usage("as-one", "auto")).toBe(2);
    expect(cap.usage("as-one", "auto", "main-session")).toBe(1);
  });
});

describe("CapacityView pending", () => {
  it("reserve 计入 usage，unreserve 归零后不计", () => {
    const cap = new CapacityView(ledgerOf(["as-one/auto@a"]));
    cap.reserve("as-one", "auto");
    expect(cap.usage("as-one", "auto")).toBe(2);
    cap.unreserve("as-one", "auto");
    expect(cap.usage("as-one", "auto")).toBe(1);
  });

  it("pendingSnapshot 与 reset", () => {
    const cap = new CapacityView(ledgerOf([]));
    cap.reserve("as-one", "auto");
    cap.reserve("as-one", "auto");
    expect(cap.pendingSnapshot()).toEqual({ "as-one/auto": 2 });
    cap.reset();
    expect(cap.pendingSnapshot()).toEqual({});
  });
});
