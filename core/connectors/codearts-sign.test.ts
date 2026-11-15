/**
 * `SDK-HMAC-SHA256` 签名的**金标准**测试。
 *
 * 这里钉的是**两处与官方文档不同的怪癖**（参考实现 `docs/UPSTREAM.md` §4）：
 *   1. `CanonicalURI` 强制补尾斜杠；
 *   2. `CanonicalHeaders` 与 `SignedHeaders` 之间**多一个空行**。
 *
 * 期望值按官方拼接规则**逐字列出**（不调被测函数去造期望值），所以任何一处
 * 拼装漂移都会红 —— 这是本模块唯一能防住「改一改就 401」的手段。
 */

import { describe, expect, it } from "vitest";

import {
  buildCanonicalRequest,
  buildStringToSign,
  canonicalQuery,
  canonicalUri,
  encodeRfc3986,
  hmacSha256Hex,
  sdkDateOf,
  sha256Hex,
  signCodeartsRequest,
} from "./codearts-sign.js";

const HOST = "snap-access.cn-north-4.myhuaweicloud.com";
const BODY = '{"model":"glm-5.3","stream":true}';

describe("编码：encodeRfc3986 / canonicalUri / canonicalQuery", () => {
  it("只保留 A-Za-z0-9-._~,其余 %XX 大写", () => {
    expect(encodeRfc3986("a b/c")).toBe("a%20b%2Fc");
    // ⚠️ 与 encodeURIComponent 的差别:这些字符必须被编码
    expect(encodeRfc3986("!*'()")).toBe("%21%2A%27%28%29");
    expect(encodeRfc3986("a~b-c_d.e")).toBe("a~b-c_d.e");
    expect(encodeRfc3986("中文")).toBe("%E4%B8%AD%E6%96%87");
  });

  it("CanonicalURI 强制补尾斜杠(怪癖 1)", () => {
    expect(canonicalUri("/api/v2/chat/completions")).toBe("/api/v2/chat/completions/");
    // 已经是目录形态就不重复加
    expect(canonicalUri("/api/v2/chat/completions/")).toBe("/api/v2/chat/completions/");
    expect(canonicalUri("/")).toBe("/");
    expect(canonicalUri("")).toBe("/");
    // 每段单独编码,斜杠本身保持
    expect(canonicalUri("/a b/c")).toBe("/a%20b/c/");
  });

  it("CanonicalQuery 按(键, 值)排序后编码", () => {
    expect(canonicalQuery("?b=2&a=1&a=0")).toBe("a=0&a=1&b=2");
    expect(canonicalQuery("")).toBe("");
    expect(canonicalQuery("?")).toBe("");
    // 已编码的值不能二次编码
    expect(canonicalQuery("?q=a%20b")).toBe("q=a%20b");
    expect(canonicalQuery("?k")).toBe("k=");
  });
});

describe("sdkDateOf / 摘要", () => {
  it("X-Sdk-Date 是 UTC 基础格式", () => {
    expect(sdkDateOf(Date.UTC(2026, 10, 16, 0, 0, 0))).toBe("20261116T000000Z");
    expect(sdkDateOf(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe("20260102T030405Z");
  });

  it("sha256 / hmac 与 node:crypto 同口径", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    // RFC 4231 test case 2
    expect(hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});

describe("CanonicalRequest:两处怪癖逐字钉住", () => {
  const headers = { "content-type": "application/json", "X-Sdk-Date": "20261116T000000Z" };
  const url = `https://${HOST}/api/v2/chat/completions`;

  it("POST + 有 body:尾斜杠 + 空行 + body 哈希", () => {
    const got = buildCanonicalRequest({ method: "POST", url, headers, body: BODY });
    const expected =
      "POST\n" +
      "/api/v2/chat/completions/\n" + // 怪癖 1:尾斜杠
      "\n" + // 空查询串
      `host:${HOST}\n` + // 每个头一行,自带 \n
      "x-sdk-date:20261116T000000Z\n" +
      "\n" + // 怪癖 2:多出来的空行
      "host;x-sdk-date\n" +
      sha256Hex(BODY);
    expect(got).toBe(expected);
    // 决定性断言:空行确实存在(去掉它就等于「顺手修好了」,上游会 401)
    expect(got).toContain("\n\nhost;x-sdk-date\n");
  });

  it("GET 的 body 不参与签名(按空串哈希)", () => {
    const got = buildCanonicalRequest({ method: "GET", url, headers, body: BODY });
    expect(got.endsWith(sha256Hex(""))).toBe(true);
    expect(got).not.toContain(sha256Hex(BODY));
  });

  it("查询串进 CanonicalQuery 位", () => {
    const got = buildCanonicalRequest({
      method: "GET",
      url: `https://${HOST}/v1/ops/delivery?channel=IDE&b=2`,
      headers,
    });
    expect(got.split("\n")[2]).toBe("b=2&channel=IDE");
  });

  it("host 缺省从 URL 补;头名大小写不敏感", () => {
    const a = buildCanonicalRequest({ method: "GET", url, headers: { host: HOST, "x-sdk-date": "D" } });
    const b = buildCanonicalRequest({ method: "GET", url, headers: { Host: HOST, "X-Sdk-Date": "D" } });
    expect(a).toBe(b);
    expect(a).toContain(`host:${HOST}\n`);
  });

  it("只对头值 trim,不对头名 trim", () => {
    const got = buildCanonicalRequest({
      method: "GET",
      url,
      headers: { host: `  ${HOST}  `, "x-sdk-date": "D" },
    });
    expect(got).toContain(`host:${HOST}\n`);
  });
});

describe("StringToSign 与 Authorization", () => {
  it("StringToSign = 算法名 \\n 日期 \\n canonical 哈希", () => {
    const canonical = "POST\n/a/\n\nhost:h\n\nhost;x-sdk-date\nE";
    expect(buildStringToSign("20261116T000000Z", canonical)).toBe(
      `SDK-HMAC-SHA256\n20261116T000000Z\n${sha256Hex(canonical)}`,
    );
  });

  it("默认只签 host + x-sdk-date,identity 头绝不进 SignedHeaders", () => {
    const r = signCodeartsRequest({
      accessKey: "AKID",
      secretKey: "SKID",
      method: "POST",
      url: `https://${HOST}/api/v2/chat/completions`,
      headers: {
        "content-type": "application/json",
        // identity 头:必须在签名**之后**追加,进来就 401
        "Agent-Type": "PromptCenter",
        "X-Language": "zh-cn",
        "model-id": "glm-5.3",
        "model-name": "glm-5.3",
      },
      body: BODY,
      sdkDate: "20261116T000000Z",
    });
    expect(r.signedHeaders).toEqual(["host", "x-sdk-date"]);
    expect(r.headers["Authorization"]).toMatch(
      /^SDK-HMAC-SHA256 Access=AKID, SignedHeaders=host;x-sdk-date, Signature=[0-9a-f]{64}$/,
    );
    expect(r.headers["X-Sdk-Date"]).toBe("20261116T000000Z");
    // identity 头原样透传,只是不参与签名
    expect(r.headers["Agent-Type"]).toBe("PromptCenter");
    expect(r.canonicalRequest).not.toContain("agent-type");
  });

  it("临时凭据:带 X-Security-Token 且一并签名", () => {
    const r = signCodeartsRequest({
      accessKey: "AKID",
      secretKey: "SKID",
      securityToken: "STS-TOKEN",
      method: "GET",
      url: `https://${HOST}/v1/model/builtin`,
      headers: {},
      sdkDate: "20261116T000000Z",
    });
    expect(r.signedHeaders).toEqual(["host", "x-sdk-date", "x-security-token"]);
    expect(r.headers["X-Security-Token"]).toBe("STS-TOKEN");
    expect(r.canonicalRequest).toContain("x-security-token:STS-TOKEN\n");
  });

  it("签名与 secret 绑定:换 SK 结果就变", () => {
    const base = {
      accessKey: "AKID",
      method: "POST",
      url: `https://${HOST}/api/v2/chat/completions`,
      headers: { "content-type": "application/json" },
      body: BODY,
      sdkDate: "20261116T000000Z",
    };
    const a = signCodeartsRequest({ ...base, secretKey: "SK-A" });
    const b = signCodeartsRequest({ ...base, secretKey: "SK-B" });
    expect(a.headers["Authorization"]).not.toBe(b.headers["Authorization"]);
    // canonical 与 secret 无关(只有 StringToSign 之后才用到 SK)
    expect(a.canonicalRequest).toBe(b.canonicalRequest);
  });
});
