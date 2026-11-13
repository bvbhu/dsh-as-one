/**
 * WorkBuddy 首用自检单测(`workbuddy-selfcheck`)。
 *
 * 规格来源:`docs/workbuddy-alignment.md` §4 R2 的语气 ——「看到 11140 立即停手」。
 * 这条单测钉死的正是「立即」两个字:
 * - 新账号在**发对话请求之前**探一次只读接口;
 * - 探测结论是 11140 ⇒ 网关拿到 `ok:false`,那一次对话请求**根本不会发出**;
 * - 探过了就记标记(**每账号只探一次**),不是每个请求都探;
 * - 非 11140 的失败 **fail-open**(不能把计费接口变成对话的单点故障);
 * - 标记读不出来/写不进去,只退化成「下次再探」,不影响本次判定。
 *
 * ⚠️ 文件里全是中文注释 —— 只允许用 write/edit 工具改,不要用 PowerShell
 * `Set-Content`/`Out-File` 回写(会双重编码成乱码,本项目已 3 次事故)。
 */

import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialBackend, CredentialVault } from "../config/credentials.js";
import { detect_region_from_token } from "./workbuddy.js";
import {
  BAN_CODE,
  WORKBUDDY_SELFCHECK_FIELD,
  businessCodeOf,
  createWorkbuddySelfCheck,
  isBanText,
  probeWorkbuddyAccount,
  readSelfCheck,
  selfCheckDue,
  withSelfCheck,
} from "./workbuddy-selfcheck.js";

/** 一个够长的假 JWT(cn 区域),只有 payload 参与 iss/sub 解析。 */
function fakeToken(iss = "https://www.workbuddy.cn/auth/realms/copilot", sub = "u-1"): string {
  const payload = Buffer.from(JSON.stringify({ iss, sub, exp: 9999999999 })).toString("base64url");
  return `h.${payload}.s`;
}

/** 造一个 fetch stub:返回给定的 status + body,并记录调用。 */
function stubFetch(status: number, body: string) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const OK_BODY = JSON.stringify({ code: 0, data: [] });
const BAN_BODY = JSON.stringify({ code: 11140, msg: "账号存在异常行为,已被限制使用" });

describe("标记的读写", () => {
  it("坏值一律当「没有标记」,不抛错", () => {
    expect(readSelfCheck(null)).toBeNull();
    expect(readSelfCheck({})).toBeNull();
    expect(readSelfCheck({ [WORKBUDDY_SELFCHECK_FIELD]: "ok" })).toBeNull();
    expect(readSelfCheck({ [WORKBUDDY_SELFCHECK_FIELD]: { verdict: "nope" } })).toBeNull();
    expect(readSelfCheck({ [WORKBUDDY_SELFCHECK_FIELD]: { verdict: "ok" } })).toEqual({
      verdict: "ok",
      atMs: 0,
    });
  });

  it("withSelfCheck 返回**新对象**,不动入参", () => {
    const raw = { region: "cn" };
    const next = withSelfCheck(raw, { verdict: "ok", atMs: 5 });
    expect(next).toEqual({ region: "cn", [WORKBUDDY_SELFCHECK_FIELD]: { verdict: "ok", atMs: 5 } });
    expect(raw).toEqual({ region: "cn" });
  });
});

describe("selfCheckDue(该不该探)", () => {
  const TTL = 24 * 3600 * 1000;
  it("没有标记 ⇒ 要探(新账号)", () => {
    expect(selfCheckDue({}, 1_000, TTL)).toBe(true);
  });
  it("ok 且未过期 ⇒ 不探;过期 ⇒ 再探", () => {
    const raw = { [WORKBUDDY_SELFCHECK_FIELD]: { verdict: "ok", atMs: 1_000 } };
    expect(selfCheckDue(raw, 1_000 + TTL - 1, TTL)).toBe(false);
    expect(selfCheckDue(raw, 1_000 + TTL, TTL)).toBe(true);
  });
  it("banned ⇒ **永不重探**(自重只会再吃一次风控;处置靠熔断+删凭据)", () => {
    const raw = { [WORKBUDDY_SELFCHECK_FIELD]: { verdict: "banned", atMs: 1 } };
    expect(selfCheckDue(raw, 1 + TTL * 10, TTL)).toBe(false);
  });
  it("unknown 过期后重探", () => {
    const raw = { [WORKBUDDY_SELFCHECK_FIELD]: { verdict: "unknown", atMs: 1 } };
    expect(selfCheckDue(raw, 1 + TTL, TTL)).toBe(true);
  });
});

describe("probeWorkbuddyAccount(只读探针)", () => {
  it("HTTP 200 + code=0 ⇒ ok,且打的是计费只读接口", async () => {
    const { fn, calls } = stubFetch(200, OK_BODY);
    const r = await probeWorkbuddyAccount({ token: fakeToken() }, { fetchFn: fn });
    expect(r.verdict).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/v2/billing/meter/get-user-resource");
    // cn 区域按 JWT iss 判定
    expect(detect_region_from_token(fakeToken())).toBe("cn");
    expect(calls[0]!.url.startsWith("https://www.codebuddy.cn")).toBe(true);
  });

  it("HTTP 200 + code=11140 ⇒ banned(200 也可能是封号)", async () => {
    const { fn } = stubFetch(200, BAN_BODY);
    const r = await probeWorkbuddyAccount({ token: fakeToken() }, { fetchFn: fn });
    expect(r.verdict).toBe("banned");
  });

  it("HTTP 403 + code=11140 ⇒ banned", async () => {
    const { fn } = stubFetch(403, BAN_BODY);
    const r = await probeWorkbuddyAccount({ token: fakeToken() }, { fetchFn: fn });
    expect(r.verdict).toBe("banned");
  });

  it("HTTP 500 / 网络异常 / 非 JSON ⇒ unknown(fail-open 的前提)", async () => {
    expect(
      (await probeWorkbuddyAccount({ token: fakeToken() }, { fetchFn: stubFetch(500, "boom").fn }))
        .verdict,
    ).toBe("unknown");
    expect(
      (
        await probeWorkbuddyAccount(
          { token: fakeToken() },
          {
            fetchFn: (async () => {
              throw new Error("ECONNRESET");
            }) as unknown as typeof fetch,
          },
        )
      ).verdict,
    ).toBe("unknown");
    expect(
      (await probeWorkbuddyAccount({ token: fakeToken() }, { fetchFn: stubFetch(200, "<html>").fn }))
        .verdict,
    ).toBe("unknown");
  });

  it("没有令牌 ⇒ unknown(不编造结论)", async () => {
    const r = await probeWorkbuddyAccount({ token: "  " }, {});
    expect(r.verdict).toBe("unknown");
  });

  it("区域显式优先(global 打 workbuddy.ai)", async () => {
    const { fn, calls } = stubFetch(200, OK_BODY);
    await probeWorkbuddyAccount({ token: fakeToken(), region: "global" }, { fetchFn: fn });
    expect(calls[0]!.url.startsWith("https://www.workbuddy.ai")).toBe(true);
  });
});

describe("createWorkbuddySelfCheck(网关注入的回调)", () => {
  async function vaultWith(secret = fakeToken(), raw: Record<string, unknown> = {}) {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({ provider: "workbuddy", username: "a@example.com", secret, raw });
    return vault;
  }

  it("ok ⇒ 放行,并把标记写回凭据 raw", async () => {
    const vault = await vaultWith();
    const { fn, calls } = stubFetch(200, OK_BODY);
    const check = createWorkbuddySelfCheck({ vault, fetchFn: fn, now: () => 1_000, warn: () => {} });
    const r = await check({ username: "a@example.com", creds: { token: fakeToken() } });
    expect(r.ok).toBe(true);
    expect(r.banned).toBe(false);
    expect(calls).toHaveLength(1);
    const cred = await vault.get("workbuddy", "a@example.com");
    expect(readSelfCheck(cred?.raw)?.verdict).toBe("ok");
    // 原始 raw 字段没被覆盖
    expect(cred?.secret).toBe(fakeToken());
  });

  it("banned ⇒ **拦下**(ok:false),标记为 banned,且再次调用不再探", async () => {
    const vault = await vaultWith();
    const { fn, calls } = stubFetch(200, BAN_BODY);
    const check = createWorkbuddySelfCheck({ vault, fetchFn: fn, now: () => 1_000, warn: () => {} });
    const r = await check({ username: "a@example.com", creds: { token: fakeToken() } });
    expect(r.ok).toBe(false);
    expect(r.banned).toBe(true);
    // 网关/熔断器按 `code 11140` 识别,文案必须带它
    expect(r.message).toContain("code 11140");
    const cred = await vault.get("workbuddy", "a@example.com");
    expect(readSelfCheck(cred?.raw)?.verdict).toBe("banned");
    // 第二次:不再打上游(重探只会再吃一次风控)
    expect((await check({ username: "a@example.com", creds: { token: fakeToken() } })).ok).toBe(
      true,
    );
    expect(calls).toHaveLength(1);
  });

  it("未知失败 ⇒ 放行 + 标记 unknown,TTL 内不重探", async () => {
    const vault = await vaultWith();
    const { fn, calls } = stubFetch(503, "unavailable");
    const check = createWorkbuddySelfCheck({ vault, fetchFn: fn, now: () => 1_000, warn: () => {} });
    expect((await check({ username: "a@example.com", creds: { token: fakeToken() } })).ok).toBe(true);
    expect(readSelfCheck((await vault.get("workbuddy", "a@example.com"))?.raw)?.verdict).toBe(
      "unknown",
    );
    expect((await check({ username: "a@example.com", creds: { token: fakeToken() } })).ok).toBe(true);
    expect(calls).toHaveLength(1); // 未过期不重探
  });

  it("已有 ok 标记 ⇒ 直接放行,**一次上游都不打**", async () => {
    const vault = await vaultWith(fakeToken(), {
      [WORKBUDDY_SELFCHECK_FIELD]: { verdict: "ok", atMs: 1_000 },
    });
    const { fn, calls } = stubFetch(200, OK_BODY);
    const check = createWorkbuddySelfCheck({ vault, fetchFn: fn, now: () => 2_000, warn: () => {} });
    await check({ username: "a@example.com", creds: { token: fakeToken() } });
    expect(calls).toHaveLength(0);
  });

  it("标记写不进去(只读后端)也不影响判定,且**不会每个请求都探一次**", async () => {
    const vault = await vaultWith();
    const readOnly = Object.create(vault) as CredentialVault;
    readOnly.put = vi.fn(async () => {
      throw new Error("只读后端");
    });
    const { fn, calls } = stubFetch(200, OK_BODY);
    const check = createWorkbuddySelfCheck({
      vault: readOnly,
      fetchFn: fn,
      now: () => 1_000,
      warn: () => {},
    });
    expect((await check({ username: "a@example.com", creds: { token: fakeToken() } })).ok).toBe(true);
    // 第二次:进程内缓存兜住 —— 若这里再探一次,等于给上游**翻倍**请求量。
    expect((await check({ username: "a@example.com", creds: { token: fakeToken() } })).ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("凭据不完整(没有账号名/令牌)⇒ 不越权判定,放行给原鉴权路径", async () => {
    const vault = await vaultWith();
    const { fn, calls } = stubFetch(200, OK_BODY);
    const check = createWorkbuddySelfCheck({ vault, fetchFn: fn, warn: () => {} });
    expect((await check({ username: "", creds: { token: fakeToken() } })).ok).toBe(true);
    expect((await check({ username: "a@example.com", creds: { token: "" } })).ok).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("码的判据", () => {
  it("businessCodeOf:数字与数字字符串都认,其它一律 null", () => {
    expect(businessCodeOf({ code: 11140 })).toBe(11140);
    expect(businessCodeOf({ code: "11140" })).toBe(11140);
    expect(businessCodeOf({ code: "abc" })).toBeNull();
    expect(businessCodeOf({ code: null })).toBeNull();
    expect(businessCodeOf({})).toBeNull();
    expect(businessCodeOf(null)).toBeNull();
  });

  it("isBanText:边界匹配,不误伤更长的码", () => {
    expect(isBanText(`HTTP 400: {"code":11140}`)).toBe(true);
    expect(isBanText("code 11140 账号异常")).toBe(true);
    expect(isBanText("111401")).toBe(false);
    expect(isBanText("11128")).toBe(false);
    expect(BAN_CODE).toBe(11140);
  });
});
