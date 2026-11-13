/**
 * checkin.ts 测试 —— mock fetch,零真实网络。
 * 语义对齐 Nexus `nexus/checkin.py`:
 *   - trae Authorization 是 `Cloud-IDE-JWT`,确认 false 时零写请求;
 *   - HTTP 200 + 非 0 业务 code = 业务拒绝,不算成功;
 *   - 区域门禁(国际版)直接拒绝,不发出任何请求。
 */
import { describe, it, expect } from "vitest";

import {
  CHECKIN_PROVIDERS,
  checkinSupported,
  parseTraeStatus,
  parseTraeClaim,
  traeCheckinHeaders,
  traeCheckinStatus,
  traeCheckinClaim,
  wbRegionOf,
  wbBillingBase,
  wbCheckinHeaders,
  wbCheckinStatus,
  wbCheckinClaim,
  CheckinError,
  CheckinRegionError,
  CheckinCredentialError,
  TRAE_CHECKIN_STATUS_PATH,
  TRAE_CHECKIN_CLAIM_PATH,
  WB_CHECKIN_STATUS_PATH,
  WB_CHECKIN_CLAIM_PATH,
  resolveTraeDevice,
  isRetryableCheckinFailure,
  isTransientCheckinError,
  checkinBackoffMs,
} from "./checkin.js";
import { resolve_identity } from "./trae.js";

interface MockCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** 造一个记录调用并把每个请求路由到 handler 的 fake fetch。 */
function makeFetch(
  handler: (call: MockCall) => { status: number; text: string },
): { fetchFn: typeof fetch; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const fetchFn = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const call: MockCall = {
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      headers: (init?.headers as Record<string, string>) ?? {},
      body: String(init?.body ?? ""),
    };
    calls.push(call);
    const r = handler(call);
    return {
      status: r.status,
      async text() {
        return r.text;
      },
    } as unknown as Response;
  }) as typeof fetch;
  return { fetchFn, calls };
}

const STATUS_OK = (body: unknown, status = 200) => ({ status, text: JSON.stringify(body) });

const traeAccount = (over: Record<string, unknown> = {}) => ({
  index: 0,
  username: "u@example.com",
  token: "tok-trea",
  region: "cn",
  ...over,
});

const wbAccount = (over: Record<string, unknown> = {}) => ({
  index: 0,
  username: "u@example.com",
  token: "tok-wb",
  domain: "codebuddy.cn",
  ...over,
});

describe("checkinSupported / CHECKIN_PROVIDERS", () => {
  it("认 trae / workbuddy / minimax", () => {
    expect([...CHECKIN_PROVIDERS]).toEqual(["trae", "workbuddy", "minimax"]);
    expect(checkinSupported("trae")).toBe(true);
    expect(checkinSupported("workbuddy")).toBe(true);
    expect(checkinSupported("minimax")).toBe(true);
    expect(checkinSupported("sensenova")).toBe(false);
    expect(checkinSupported("")).toBe(false);
    expect(checkinSupported(null)).toBe(false);
  });
});

describe("traeCheckinHeaders", () => {
  it("用 Cloud-IDE-JWT 而非 Bearer,带 Origin/Referer/UA", () => {
    const h = traeCheckinHeaders("tok", "dev-123");
    expect(h["Authorization"]).toBe("Cloud-IDE-JWT tok");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["User-Agent"]).toBe("Mozilla/5.0");
    expect(h["Origin"]).toBe("https://www.trae.cn");
    expect(h["Referer"]).toBe("https://www.trae.cn/");
    expect(h["x-device-id"]).toBe("dev-123");
    expect(h["Authorization"]?.startsWith("Bearer")).toBe(false);
  });

  it("无 device_id 时**不发** x-device-id 头(缺失 ≠ 空串)", () => {
    const h = traeCheckinHeaders("tok");
    expect("x-device-id" in h).toBe(false);
  });
});

describe("parseTraeStatus(扁平应答)", () => {
  it("正常扁平应答 → 全字段", () => {
    const s = parseTraeStatus({ checked_in: true, credits: 12, enable: true, did_checked_in: false, extra_credits: 3, code: 0, message: "ok" });
    expect(s.checked_in).toBe(true);
    expect(s.credits).toBe(12);
    expect(s.enable).toBe(true);
    expect(s.did_checked_in).toBe(false);
    expect(s.extra_credits).toBe(3);
    expect(s.code).toBe(0);
    expect(s.message).toBe("ok");
  });

  it("非对象 → Nexus 缺省(enable 缺省开,credits 0)", () => {
    const s = parseTraeStatus(null);
    expect(s).toEqual({
      checked_in: false,
      credits: 0,
      enable: true,
      did_checked_in: false,
      extra_credits: null,
      code: null,
      message: "",
    });
  });

  it("enable 缺失=开;false 才是关;布尔值不当数字;字符串 code 不当数字", () => {
    expect(parseTraeStatus({}).enable).toBe(true);
    expect(parseTraeStatus({ enable: false }).enable).toBe(false);
    // 布尔 true 不算数字(与 Nexus int/float not bool 一致)
    expect(parseTraeStatus({ credits: true }).credits).toBe(0);
    expect(parseTraeStatus({ credits: "12" }).credits).toBe(0);
    // 字符串 code 不算数字 → null
    expect(parseTraeStatus({ code: "0" }).code).toBe(null);
    expect(parseTraeStatus({ extra_credits: 0 }).extra_credits).toBe(null);
  });
});

describe("parseTraeClaim", () => {
  it("code 0 = claimed", () => {
    expect(parseTraeClaim({ code: 0, message: "ok" })).toEqual({ claimed: true, code: 0, message: "ok" });
  });
  it("非 0 业务码 = 拒绝(9095 今日已签)", () => {
    const r = parseTraeClaim({ code: 9095, message: "already" });
    expect(r.claimed).toBe(false);
    expect(r.code).toBe(9095);
    expect(r.message).toBe("already");
  });
  it("非对象 → claimed:false code:-1", () => {
    expect(parseTraeClaim("nope")).toEqual({ claimed: false, code: -1, message: "claim 应答不是 JSON 对象" });
  });
});

describe("traeCheckinStatus", () => {
  it("POST 到 status 端点,请求体 {} ,校验派生 device_id 头", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({ checked_in: false, credits: 5, enable: true, code: 0 }));
    const acc = traeAccount(); // 无 device_id → 派生
    const st = await traeCheckinStatus(acc, { baseUrl: "https://api.trae.cn", fetchFn });
    expect(st.checked_in).toBe(false);
    expect(st.credits).toBe(5);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://api.trae.cn${TRAE_CHECKIN_STATUS_PATH}`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toBe("{}");
    expect(calls[0].headers["Authorization"]).toBe("Cloud-IDE-JWT tok-trea");
    expect(calls[0].headers["x-device-id"]).toBe(resolveTraeDevice(acc));
    expect(calls[0].headers["x-device-id"]).toBe(resolve_identity("tok-trea").device_id);
  });

  it("区域 != cn → CheckinRegionError,零请求", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({}));
    await expect(traeCheckinStatus(traeAccount({ region: "global" }), { fetchFn })).rejects.toThrow(CheckinRegionError);
    expect(calls).toHaveLength(0);
  });

  it("HTTP 500 → CheckinError 带路径与状态", async () => {
    const { fetchFn, calls } = makeFetch(() => ({ status: 500, text: "boom" }));
    const err = await traeCheckinStatus(traeAccount(), { fetchFn }).catch((e) => e);
    expect(err).toBeInstanceOf(CheckinError);
    expect(String(err.message)).toContain(`HTTP 500`);
    expect(calls).toHaveLength(1);
  });

  it("应答不是合法 JSON → CheckinError", async () => {
    const { fetchFn } = makeFetch(() => ({ status: 200, text: "<html>" }));
    const err = await traeCheckinStatus(traeAccount(), { fetchFn }).catch((e) => e);
    expect(err).toBeInstanceOf(CheckinError);
    expect(String(err.message)).toContain("不是合法 JSON");
  });

  it("网络失败 → CheckinError(不冒泡)", async () => {
    const fetchFn = (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    const err = await traeCheckinStatus(traeAccount(), { fetchFn }).catch((e) => e);
    expect(err).toBeInstanceOf(CheckinError);
    expect(String(err.message)).toContain("fetch failed");
  });
});

describe("resolveTraeDevice:真机指纹优先(2026-11-10 实测修正)", () => {
  it("凭据 raw 里有 device_id → 用真机指纹(不再强制派生)", () => {
    // 2026-11-09 曾改成「一律按 token 派生」,以为能绕过同机多账号的设备限制。
    // 2026-11-10 实测推翻:真机指纹 → 9095(准确:本设备已签);
    // 派生指纹 → 9074(误导:人多)。所以回到真机指纹优先。
    const acc = traeAccount({ extra: { device_id: "machine-fingerprint-1580244703019" } });
    expect(resolveTraeDevice(acc)).toBe("machine-fingerprint-1580244703019");
  });

  it("extra 里没有 → 用调用方显式给的 device_id", () => {
    const acc = traeAccount({ device_id: "explicit-dev-123" });
    expect(resolveTraeDevice(acc)).toBe("explicit-dev-123");
  });

  it("两者都没有 → 按 token 派生(最后手段)", () => {
    const acc = traeAccount({ token: "tok-trea" });
    expect(resolveTraeDevice(acc)).toBe(resolve_identity("tok-trea").device_id);
  });

  it("同机两账号共享真机指纹 → 指纹相同(这是上游的设备级语义,不再试图区分)", () => {
    // 单台机器一天只能签 1 个 trae 账号 —— 上游硬限制。用同一个真机指纹
    // 才能拿到准确的 9095,而不是伪造出来的 9074。
    const sharedRaw = { device_id: "machine-shared-fingerprint" };
    const a = traeAccount({ token: "tok-trea-A", extra: sharedRaw });
    const b = traeAccount({ token: "tok-trea-B", extra: sharedRaw });
    expect(resolveTraeDevice(a)).toBe(resolveTraeDevice(b));
    expect(resolveTraeDevice(a)).toBe("machine-shared-fingerprint");
  });

  it("空串/纯空白不算有 → 继续回落", () => {
    expect(resolveTraeDevice(traeAccount({ extra: { device_id: "   " }, device_id: "dev-x" }))).toBe("dev-x");
  });
});

describe("traeCheckinClaim(confirm 语义:false 恒为零写请求)", () => {
  it("可签且 confirm=false → would_claim 干跑,只发 status 一个请求", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({ checked_in: false, credits: 10, enable: true, code: 0 }));
    const r = await traeCheckinClaim(traeAccount(), { baseUrl: "https://api.trae.cn", fetchFn, confirm: false });
    expect(r.claimed).toBe(false);
    expect(r.would_claim).toBe(true);
    expect(r.message).toContain("confirm=True");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(TRAE_CHECKIN_STATUS_PATH);
  });

  it("今日已签(checked_in) → already_checked_in,零写请求", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({ checked_in: true, credits: 10, enable: true, code: 0 }));
    const r = await traeCheckinClaim(traeAccount(), { fetchFn, confirm: true });
    expect(r.claimed).toBe(false);
    expect(r.already_checked_in).toBe(true);
    expect(r.message).toBe("今日已签到");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(TRAE_CHECKIN_STATUS_PATH);
  });

  it("本设备已签(did_checked_in) → device_checked_in(9095)", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({ checked_in: false, did_checked_in: true, credits: 10, enable: true, code: 0 }));
    const r = await traeCheckinClaim(traeAccount(), { fetchFn, confirm: true });
    expect(r.claimed).toBe(false);
    expect(r.device_checked_in).toBe(true);
    expect(r.message).toContain("9095");
    expect(calls).toHaveLength(1);
  });

  it("未启用(enable=false) → skipped,零写请求", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({ checked_in: false, enable: false, credits: 0, code: 0 }));
    const r = await traeCheckinClaim(traeAccount(), { fetchFn, confirm: true });
    expect(r.claimed).toBe(false);
    expect(r.enabled).toBe(false);
    expect(r.would_claim).toBe(false);
    expect(r.message).toBe("该账号未启用签到");
    expect(calls).toHaveLength(1);
  });

  it("confirm=true 且可签 → POST claim 领取;成功后重查 status(共 3 个请求)", async () => {
    const { fetchFn, calls } = makeFetch((call) => {
      if (call.url.includes(TRAE_CHECKIN_CLAIM_PATH)) return STATUS_OK({ code: 0, message: "领取成功" });
      return STATUS_OK({ checked_in: false, credits: 10, enable: true, code: 0 });
    });
    const r = await traeCheckinClaim(traeAccount(), { baseUrl: "https://api.trae.cn", fetchFn, confirm: true });
    expect(r.claimed).toBe(true);
    expect(r.code).toBe(0);
    expect(r.message).toBe("领取成功");
    // status(claim 前) → claim → status(重查)
    expect(calls).toHaveLength(3);
    expect(calls[1].url).toBe(`https://api.trae.cn${TRAE_CHECKIN_CLAIM_PATH}`);
    expect(calls[1].method).toBe("POST");
    expect(calls[1].body).toBe("{}");
    expect(calls[1].headers["x-device-id"]).toBe(resolveTraeDevice(traeAccount()));
    expect(calls[2].url).toContain(TRAE_CHECKIN_STATUS_PATH);
  });

  it("confirm=true 且上游业务拒绝(code 9095)→ 不算成功,带 code", async () => {
    const { fetchFn, calls } = makeFetch((call) => {
      if (call.url.includes(TRAE_CHECKIN_CLAIM_PATH)) return STATUS_OK({ code: 9095, message: "" });
      return STATUS_OK({ checked_in: false, credits: 10, enable: true, code: 0 });
    });
    const r = await traeCheckinClaim(traeAccount(), { fetchFn, confirm: true });
    expect(r.claimed).toBe(false);
    expect(r.code).toBe(9095);
    expect(r.message).toBe("上游拒绝领取");
    expect(calls).toHaveLength(2);
  });

  it("区域 != cn → CheckinRegionError,零请求(即使 confirm=true)", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({}));
    await expect(traeCheckinClaim(traeAccount({ region: "intl" }), { fetchFn, confirm: true })).rejects.toThrow(
      CheckinRegionError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("wbRegionOf / wbBillingBase", () => {
  it("全球域名(含 www. 与子域)→ global;其余 → cn", () => {
    expect(wbRegionOf("workbuddy.ai")).toBe("global");
    expect(wbRegionOf("www.workbuddy.ai")).toBe("global");
    expect(wbRegionOf("codebuddy.ai")).toBe("global");
    expect(wbRegionOf("sub.codebuddy.ai")).toBe("global");
    expect(wbRegionOf("www.codebuddy.cn")).toBe("cn");
    expect(wbRegionOf("codebuddy.cn")).toBe("cn");
    expect(wbRegionOf(null)).toBe("cn");
    expect(wbRegionOf("")).toBe("cn");
  });

  it("计费基址:global=workbuddy.ai,含 codebuddy.ai → codebuddy.ai;cn=codebuddy.cn", () => {
    expect(wbBillingBase("workbuddy.ai")).toBe("https://www.workbuddy.ai");
    expect(wbBillingBase("www.codebuddy.ai")).toBe("https://www.codebuddy.ai");
    expect(wbBillingBase("codebuddy.cn")).toBe("https://www.codebuddy.cn");
  });
});

describe("wbCheckinHeaders", () => {
  it("Bearer 前缀 + 可选 X-User-Id / X-Enterprise-Id / X-Tenant-Id / X-Domain", () => {
    const h = wbCheckinHeaders("tok", "uid-1", "codebuddy.cn", "ent-9");
    expect(h["Authorization"]).toBe("Bearer tok");
    expect(h["Accept"]).toBe("application/json");
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["X-User-Id"]).toBe("uid-1");
    expect(h["X-Enterprise-Id"]).toBe("ent-9");
    expect(h["X-Tenant-Id"]).toBe("ent-9");
    expect(h["X-Domain"]).toBe("codebuddy.cn");
  });

  it("可选项缺省不出现", () => {
    const h = wbCheckinHeaders("tok");
    expect("X-User-Id" in h).toBe(false);
    expect("X-Enterprise-Id" in h).toBe(false);
    expect("X-Domain" in h).toBe(false);
  });
});

describe("wbCheckinStatus(仅国内版)", () => {
  it("全球域名 → CheckinRegionError,零请求", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({ code: 0, data: {} }));
    await expect(wbCheckinStatus(wbAccount({ domain: "www.workbuddy.ai" }), { fetchFn })).rejects.toThrow(
      CheckinRegionError,
    );
    expect(calls).toHaveLength(0);
  });

  it("envelope {code:0,data} → 解析全字段(_num 换算)", async () => {
    const { fetchFn, calls } = makeFetch(() =>
      STATUS_OK({
        code: 0,
        data: { active: true, today_checked_in: false, streak_days: 3, daily_credit: 20, today_credit: 0, is_streak_day: true, claim_button_text: "签到" },
      }),
    );
    const st = await wbCheckinStatus(wbAccount(), { baseUrl: "https://www.codebuddy.cn", fetchFn });
    expect(st.active).toBe(true);
    expect(st.today_checked_in).toBe(false);
    expect(st.streak_days).toBe(3);
    expect(st.daily_credit).toBe(20);
    expect(st.today_credit).toBe(0);
    expect(st.is_streak_day).toBe(true);
    expect(st.claim_button_text).toBe("签到");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://www.codebuddy.cn${WB_CHECKIN_STATUS_PATH}`);
    expect(calls[0].body).toBe("{}");
  });

  it("code != 0 → CheckinError 业务失败(HTTP 200 不算成功)", async () => {
    const { fetchFn } = makeFetch(() => STATUS_OK({ code: 1001, message: "nope" }));
    const err = await wbCheckinStatus(wbAccount(), { fetchFn }).catch((e) => e);
    expect(err).toBeInstanceOf(CheckinError);
    expect(String(err.message)).toContain("code=1001");
    expect(String(err.message)).toContain("nope");
  });

  it("HTTP 400 → CheckinError", async () => {
    const { fetchFn } = makeFetch(() => ({ status: 400, text: "bad request" }));
    const err = await wbCheckinStatus(wbAccount(), { fetchFn }).catch((e) => e);
    expect(err).toBeInstanceOf(CheckinError);
    expect(String(err.message)).toContain("HTTP 400");
  });
});

describe("wbCheckinClaim", () => {
  it("无令牌 → CheckinCredentialError,零请求", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({ code: 0, data: {} }));
    await expect(wbCheckinClaim(wbAccount({ token: null }), { fetchFn })).rejects.toThrow(CheckinCredentialError);
    expect(calls).toHaveLength(0);
  });

  it("全球域名 → CheckinRegionError,零请求", async () => {
    const { fetchFn, calls } = makeFetch(() => STATUS_OK({ code: 0, data: {} }));
    await expect(wbCheckinClaim(wbAccount({ domain: "workbuddy.ai" }), { fetchFn })).rejects.toThrow(
      CheckinRegionError,
    );
    expect(calls).toHaveLength(0);
  });

  it("成功:先 status 再 POST claim,返回 credit/streak_days", async () => {
    const { fetchFn, calls } = makeFetch((call) => {
      if (call.url.includes(WB_CHECKIN_CLAIM_PATH))
        return STATUS_OK({ code: 0, data: { credit: 30, streak_days: 4, is_streak_day: true } });
      return STATUS_OK({ code: 0, data: { active: true, today_checked_in: false, streak_days: 3, daily_credit: 20 } });
    });
    const r = await wbCheckinClaim(wbAccount(), { baseUrl: "https://www.codebuddy.cn", fetchFn });
    expect(r.credit).toBe(30);
    expect(r.streak_days).toBe(4);
    expect(r.is_streak_day).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain(WB_CHECKIN_STATUS_PATH);
    expect(calls[1].url).toBe(`https://www.codebuddy.cn${WB_CHECKIN_CLAIM_PATH}`);
    expect(calls[1].body).toBe("{}");
    expect(calls[1].headers["Authorization"]).toBe("Bearer tok-wb");
  });
});
// ── 瞬时失败重试(trae 签到高峰「当前参与用户太多,请稍后再试」) ──────────────

describe("isRetryableCheckinFailure / isTransientCheckinError", () => {
  it("拥挤类文案可重试(实测上游原话)", () => {
    expect(isRetryableCheckinFailure("当前参与用户太多,请稍后再试")).toBe(true);
    expect(isRetryableCheckinFailure("系统繁忙,请稍后再试")).toBe(true);
    expect(isRetryableCheckinFailure("请求过于频繁")).toBe(true);
  });

  it("确定性业务码绝不重试(9004 缺设备号 / 9095 本设备已签)", () => {
    expect(isRetryableCheckinFailure("当前参与用户太多", 9004)).toBe(false);
    expect(isRetryableCheckinFailure("当前参与用户太多", 9095)).toBe(false);
    expect(isRetryableCheckinFailure("", null)).toBe(false);
    expect(isRetryableCheckinFailure("该账号未启用签到")).toBe(false);
  });

  it("网络/HTTP 瞬时失败可重试,4xx 不重试", () => {
    expect(isTransientCheckinError(new CheckinError("签到请求超时(15000ms)"))).toBe(true);
    expect(isTransientCheckinError(new CheckinError("...返回 HTTP 429: ..."))).toBe(true);
    expect(isTransientCheckinError(new CheckinError("...返回 HTTP 503: ..."))).toBe(true);
    expect(isTransientCheckinError(new CheckinError("...返回 HTTP 400: bad"))).toBe(false);
  });
});

describe("checkinBackoffMs", () => {
  it("指数增长 + 抖动,且封顶", () => {
    for (let i = 0; i < 6; i++) {
      const ms = checkinBackoffMs(i, { baseDelayMs: 1000, maxDelayMs: 5000, jitterRatio: 0 });
      expect(ms).toBe(Math.min(5000, 1000 * 2 ** i));
    }
    expect(checkinBackoffMs(99, { baseDelayMs: 1000, maxDelayMs: 8000, jitterRatio: 0 })).toBe(8000);
  });
});

describe("traeCheckinClaim 重试", () => {
  /** 前 n-1 次回「拥挤」,第 n 次回成功。 */
  const flakyFetch = (failTimes: number, failBody: unknown) => {
    let claims = 0;
    return makeFetch((call) => {
      if (call.url.includes(TRAE_CHECKIN_STATUS_PATH)) {
        return STATUS_OK({ checked_in: false, credits: 0, enable: true, did_checked_in: false, code: 0 });
      }
      if (call.url.includes(TRAE_CHECKIN_CLAIM_PATH)) {
        claims += 1;
        if (claims <= failTimes) return STATUS_OK(failBody);
        return STATUS_OK({ code: 0, message: "" });
      }
      return { status: 404, text: "unexpected" };
    });
  };

  it("上游「当前参与用户太多,请稍后再试」→ 退避重试后领到", async () => {
    const { fetchFn, calls } = flakyFetch(2, { code: 10001, message: "当前参与用户太多,请稍后再试" });
    const sleeps: number[] = [];
    const r = await traeCheckinClaim(traeAccount(), {
      fetchFn,
      confirm: true,
      retry: { attempts: 4, baseDelayMs: 10, maxDelayMs: 20, jitterRatio: 0, sleepFn: async (ms) => { sleeps.push(ms); } },
    });
    expect(r.claimed).toBe(true);
    expect(r.retries).toBe(2);
    expect(r.attempts).toBe(3);
    expect(sleeps).toEqual([10, 20]);
    // status(首) + claim 三次 + 成功后的 status 回查
    expect(calls.filter((c) => c.url.includes(TRAE_CHECKIN_CLAIM_PATH))).toHaveLength(3);
  });

  it("确定性拒绝(9095)不重试 —— 只发一次写请求", async () => {
    let claimCalls = 0;
    const { fetchFn } = makeFetch((call) => {
      if (call.url.includes(TRAE_CHECKIN_STATUS_PATH)) {
        return STATUS_OK({ checked_in: false, credits: 0, enable: true, did_checked_in: false, code: 0 });
      }
      claimCalls += 1;
      return STATUS_OK({ code: 9095, message: "本设备今日已签" });
    });
    const sleeps: number[] = [];
    const r = await traeCheckinClaim(traeAccount(), {
      fetchFn,
      confirm: true,
      retry: { attempts: 4, baseDelayMs: 10, sleepFn: async (ms) => { sleeps.push(ms); } },
    });
    expect(r.claimed).toBe(false);
    expect(claimCalls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("重试次数用尽仍失败 → claimed=false 且如实标注重试次数", async () => {
    const { fetchFn } = flakyFetch(99, { code: 10001, message: "当前参与用户太多,请稍后再试" });
    const r = await traeCheckinClaim(traeAccount(), {
      fetchFn,
      confirm: true,
      retry: { attempts: 3, baseDelayMs: 5, maxDelayMs: 5, jitterRatio: 0, sleepFn: async () => undefined },
    });
    expect(r.claimed).toBe(false);
    expect(r.retries).toBe(2);
    expect(r.attempts).toBe(3);
    expect(r.message).toContain("当前参与用户太多");
    expect(r.message).toContain("已重试 2 次仍失败");
  });

  it("retry: null 显式关闭重试", async () => {
    const { fetchFn } = flakyFetch(99, { code: 10001, message: "系统繁忙,请稍后再试" });
    const r = await traeCheckinClaim(traeAccount(), {
      fetchFn,
      confirm: true,
      retry: null,
    });
    expect(r.retries).toBe(0);
    expect(r.attempts).toBe(1);
  });

  it("传输层 503 也重试;4xx 不重试", async () => {
    let claimCalls = 0;
    const { fetchFn } = makeFetch((call) => {
      if (call.url.includes(TRAE_CHECKIN_STATUS_PATH)) {
        return STATUS_OK({ checked_in: false, credits: 0, enable: true, did_checked_in: false, code: 0 });
      }
      claimCalls += 1;
      return claimCalls === 1 ? { status: 503, text: "upstream busy" } : STATUS_OK({ code: 0 });
    });
    const r = await traeCheckinClaim(traeAccount(), {
      fetchFn,
      confirm: true,
      retry: { attempts: 3, baseDelayMs: 5, maxDelayMs: 5, jitterRatio: 0, sleepFn: async () => undefined },
    });
    expect(r.claimed).toBe(true);
    expect(r.retries).toBe(1);
  });

  it("未走到 claim 的分支 attempts/retries 都是 0(零写请求)", async () => {
    const { fetchFn, calls } = makeFetch(() =>
      STATUS_OK({ checked_in: true, credits: 5, enable: true, did_checked_in: false, code: 0 }),
    );
    const r = await traeCheckinClaim(traeAccount(), { fetchFn, confirm: true });
    expect(r.claimed).toBe(false);
    expect(r.already_checked_in).toBe(true);
    expect(r.attempts).toBe(0);
    expect(r.retries).toBe(0);
    expect(calls).toHaveLength(1);
  });
});
