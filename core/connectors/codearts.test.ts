/**
 * CodeArts 连接器（身份头 / 错误语义 / 凭据）的口径测试。
 *
 * 重点钉三件事：
 *   1. `model-id` / `model-name` 与请求体模型名**逐字一致**（不做 trim）；
 *   2. `error_code` → 真实状态码的三种形态（纯业务码 / 纯状态码 / 复合码）；
 *   3. 凭据类错误码**即使 HTTP 400 也算账号故障**，不能当客户端错误。
 */

import { describe, expect, it } from "vitest";

import {
  CODEARTS_ADAPTER,
  codeartsErrorKind,
  codeartsErrorOf,
  codeartsIdentityHeaders,
  codeartsSessionId,
  isCodeartsClientRequestError,
  requireCodeartsKeys,
  statusFromCode,
} from "./codearts.js";
import { UpstreamError } from "./types.js";

describe("codeartsSessionId：按凭据派生并复用", () => {
  it("同凭据稳定、不同凭据不同", () => {
    const a = codeartsSessionId("AKID-1234");
    expect(codeartsSessionId("AKID-1234")).toBe(a);
    expect(codeartsSessionId("AKID-5678")).not.toBe(a);
    expect(codeartsSessionId("AKID-1234", "domain-A")).not.toBe(a);
    expect(a.startsWith("ses_")).toBe(true);
  });
});

describe("codeartsIdentityHeaders", () => {
  it("模型名逐字进 model-id / model-name（尾随空格也不改）", () => {
    const h = codeartsIdentityHeaders({ accessKey: "AK", model: "glm-5.3 " });
    expect(h["model-id"]).toBe("glm-5.3 ");
    expect(h["model-name"]).toBe("glm-5.3 ");
  });

  it("没有模型时两个头都不出现", () => {
    const h = codeartsIdentityHeaders({ accessKey: "AK" });
    expect(h["model-id"]).toBeUndefined();
    expect(h["model-name"]).toBeUndefined();
  });

  it("不带 maas_type（benefit 通道已下线）", () => {
    const h = codeartsIdentityHeaders({ accessKey: "AK", model: "glm-5.3" });
    expect(h["maas_type"]).toBeUndefined();
  });

  it("identity 头齐全且 session id 稳定", () => {
    const h = codeartsIdentityHeaders({ accessKey: "AK", model: "glm-5.3", now: Date.UTC(2026, 10, 16) });
    expect(h["plugin-name"]).toBe("codemate_vscode");
    expect(h["app-id"]).toBe("CodeAgent3.0");
    expect(h["x-ot-client-type"]).toBe("IDE");
    expect(h["x-ot-session-id"]).toBe(codeartsSessionId("AK"));
    expect(h["created-time"]).toBe("2026-11-16T00:00:00.000Z");
  });
});

describe("statusFromCode：三种 error_code 形态", () => {
  it("纯数字业务码不在 400–599 → 兜底 400", () => {
    expect(statusFromCode("4005")).toBe(400);
  });

  it("纯数字状态码直接用", () => {
    expect(statusFromCode("400")).toBe(400);
    expect(statusFromCode("422")).toBe(422);
    expect(statusFromCode(429)).toBe(429);
  });

  it("复合码取末段", () => {
    expect(statusFromCode("InferHub.002002009.404")).toBe(404);
    expect(statusFromCode("InferHub.001001005.400")).toBe(400);
    expect(statusFromCode("InferHub.001001011.406")).toBe(406);
  });

  it("取不到一律兜底 400（绝不返回 200）", () => {
    expect(statusFromCode(null)).toBe(400);
    expect(statusFromCode(undefined)).toBe(400);
    expect(statusFromCode("APIG.0301")).toBe(400);
    expect(statusFromCode("")).toBe(400);
  });
});

describe("codeartsErrorOf", () => {
  it("error_code + error_msg", () => {
    expect(codeartsErrorOf({ error_code: "InferHub.002002009.404", error_msg: "模型未注册" })).toEqual({
      code: "InferHub.002002009.404",
      message: "模型未注册",
      status: 404,
    });
  });

  it("details[0].error_msg 优先（参数越界形态）", () => {
    const got = codeartsErrorOf({
      error_code: "InferHub.001001005.400",
      details: [{ error_code: "RANGE_VALIDATOR", error_msg: "temperature should be between 0 and 2" }],
    });
    expect(got?.message).toBe("temperature should be between 0 and 2");
    expect(got?.status).toBe(400);
  });

  it("code:0 不是错误；非 0 是错误", () => {
    expect(codeartsErrorOf({ code: 0 })).toBeNull();
    expect(codeartsErrorOf({ code: 40001, message: "尚未到达权益刷新时间" })).toEqual({
      code: "40001",
      message: "尚未到达权益刷新时间",
      status: 400,
    });
  });

  it("非对象 / 无错误码 → null", () => {
    expect(codeartsErrorOf(null)).toBeNull();
    expect(codeartsErrorOf("plain text")).toBeNull();
    expect(codeartsErrorOf([1, 2])).toBeNull();
    expect(codeartsErrorOf({ ok: true })).toBeNull();
  });
});

describe("错误分类：换号 / 退避 / 直接回客户端", () => {
  it("凭据类错误码 → auth（即使状态码是 400）", () => {
    for (const code of ["APIG.0301", "APIG.0303", "STS5.1804", "STS5.1806", "invalid_grant"]) {
      expect(codeartsErrorKind(code, 400)).toBe("auth");
      expect(isCodeartsClientRequestError(code, 400)).toBe(false);
    }
  });

  it("并发上限 TM.00001041 → 可重试，且不计账号故障", () => {
    expect(codeartsErrorKind("TM.00001041", 400)).toBe("rate_limit");
    expect(isCodeartsClientRequestError("TM.00001041", 400)).toBe(false);
  });

  it("参数/模型类 → bad_request 且算客户端错误", () => {
    expect(codeartsErrorKind("InferHub.001001005.400", 400)).toBe("bad_request");
    expect(isCodeartsClientRequestError("InferHub.001001005.400", 400)).toBe(true);
    expect(isCodeartsClientRequestError("InferHub.002002009.404", 404)).toBe(true);
    expect(isCodeartsClientRequestError("InferHub.001001011.406", 406)).toBe(true);
    expect(isCodeartsClientRequestError("4005", 400)).toBe(true);
  });

  it("HTTP 层：429 限流 / 5xx 上游 / 401 认证", () => {
    expect(codeartsErrorKind("", 429)).toBe("rate_limit");
    expect(codeartsErrorKind("", 502)).toBe("upstream");
    expect(codeartsErrorKind("", 401)).toBe("auth");
  });
});

describe("凭据", () => {
  it("缺 AK/SK 直接抛认证错误（不发请求）", () => {
    expect(() => requireCodeartsKeys({})).toThrow(UpstreamError);
    expect(() => requireCodeartsKeys({ accessKey: "AK" })).toThrow(/accessKey \+ secretKey/);
  });

  it("取到则返回去掉首尾空白的值", () => {
    expect(requireCodeartsKeys({ accessKey: " AK ", secretKey: " SK " })).toEqual({
      accessKey: "AK",
      secretKey: "SK",
    });
  });

  it("adapter.getToken 不联网，只回 accessKey + 过期秒", async () => {
    const t = await CODEARTS_ADAPTER.getToken({ accessKey: "AK", secretKey: "SK", expiresAtMs: 1_800_000_000_000 });
    expect(t.accessToken).toBe("AK");
    expect(t.expiresAt).toBe(1_800_000_000);
  });

  it("adapter.decorateRequest 只给 identity 头，不给 Authorization", () => {
    const d = CODEARTS_ADAPTER.decorateRequest({ headers: {} }, { accessToken: "AK", expiresAt: 0 }, {
      accessKey: "AK",
      secretKey: "SK",
    });
    expect(d.headers["plugin-name"]).toBe("codemate_vscode");
    expect(d.headers["x-ot-session-id"]).toBe(codeartsSessionId("AK"));
    expect(d.headers["Authorization"]).toBeUndefined();
  });

  it("classifyError 先看业务码再看 HTTP 状态", () => {
    const e = CODEARTS_ADAPTER.classifyError(200, {
      error_code: "TM.00001041",
      error_msg: "并发会话数已达上限",
    });
    expect(e.kind).toBe("rate_limit");
    expect(e.httpStatus).toBe(400); // 真实状态由业务码定，不是 200
    expect(e.message).toContain("TM.00001041");
  });

  it("classifyError 无业务码时按 HTTP 走", () => {
    expect(CODEARTS_ADAPTER.classifyError(401, "unauthorized").kind).toBe("auth");
    expect(CODEARTS_ADAPTER.classifyError(502, "bad gateway").kind).toBe("upstream");
    expect(CODEARTS_ADAPTER.classifyError(400, "bad").kind).toBe("bad_request");
  });
});
