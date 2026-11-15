/**
 * `codearts-signin.ts`（华为云 CodeArts 网页族签到）单测。
 *
 * 全部注入假 fetch（**零真实网络**）。锁住的都是「踩过才知道」的口径：
 * - cftk 取 `devclouddevuibjtcftk`，回落 `cftk`，缺了本地报错（上游只会回
 *   `invalid channel, group not found`，容易被误读成没配渠道）；
 * - `campaignId` 是响应里的数字，`benefitAmount` 才是面额，不可领时 `status` 为 `null`；
 * - claim 之后**必须 confirm**，claim 成功但 confirm 失败要 `ok:false`；
 * - `status === "CLAIMED"` 只补 confirm，不重复 claim；
 * - HTTP 200 + 空 body 判会话失效；**超时不算失效**。
 */
import { describe, expect, it, vi } from "vitest";

import { CheckinError } from "./checkin.js";
import {
  CODEARTS_CLAIM_PATH,
  CODEARTS_CONFIRM_PATH,
  CODEARTS_DELIVERY_PATH,
  CODEARTS_OVERVIEW_PATH,
  CODEARTS_WEB_BASE,
  codeartsAccountLabel,
  codeartsCampaigns,
  codeartsCheckinOne,
  codeartsClaimCheckin,
  codeartsCredits,
  codeartsDayStamp,
  codeartsIdempotentKey,
  codeartsWebHeaders,
  cookieValue,
  isCodeartsClaimRetryable,
  pickCheckinCampaign,
  type CodeartsCampaign,
} from "./codearts-signin.js";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

const ACCOUNT = {
  cookies: "devclouddevuibjtcftk=CFTK-VALUE; other=1",
  label: "acct-a",
};

/** 2026-11-16 09:30 **本地时间**（幂等键日期 = 20261116）。 */
const NOW = new Date(2026, 10, 16, 9, 30, 0).getTime();
/** 次日同一时刻。 */
const NOW_NEXT_DAY = new Date(2026, 10, 17, 9, 30, 0).getTime();

const CAMP: CodeartsCampaign = {
  campaignId: 34,
  title: "每日签到领积分",
  type: "USER_LOGIN",
  benefitAmount: 100,
  claimable: true,
  status: null,
};

const OVERVIEW = {
  all_credit_package: {
    package_credit_amount: 5000,
    package_credit_used: 1200,
    package_credit_remain: 3800,
    expiring_credit_amount: 300,
  },
};

const DELIVERY = {
  code: 0,
  message: "",
  data: { items: [CAMP] },
};

interface FakeReply {
  status?: number;
  body?: unknown;
  raw?: string;
  throwErr?: Error;
}

interface RecordedCall {
  url: string;
  init: RequestInit;
}

/** 假 fetch：按顺序吐出预置应答；用完后重复最后一条。 */
function fakeFetch(replies: FakeReply[]): {
  fetchFn: typeof fetch;
  calls: RecordedCall[];
  spy: ReturnType<typeof vi.fn>;
} {
  const calls: RecordedCall[] = [];
  let index = 0;
  const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const reply = replies[Math.min(index, replies.length - 1)];
    index += 1;
    if (reply === undefined) throw new Error("fakeFetch 没有应答");
    if (reply.throwErr !== undefined) throw reply.throwErr;
    const status = reply.status ?? 200;
    const text = reply.raw !== undefined ? reply.raw : JSON.stringify(reply.body ?? {});
    return new Response(text, { status });
  });
  return { fetchFn: spy as unknown as typeof fetch, calls, spy };
}

function timeoutError(): Error {
  const err = new Error("The operation was aborted due to timeout");
  err.name = "TimeoutError";
  return err;
}

function parsedBody(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

function baseOpts(fetchFn: typeof fetch, now: number = NOW) {
  return { fetchFn, now: () => now };
}

// ---------------------------------------------------------------------------
// cookieValue / codeartsWebHeaders
// ---------------------------------------------------------------------------

describe("cookieValue", () => {
  it("按名字取值（值里可以有 =）", () => {
    expect(cookieValue("a=1; b=x=y; c=3", "b")).toBe("x=y");
    expect(cookieValue(" a = 1 ; b=2 ", "a")).toBe("1");
  });

  it("没有返回 undefined", () => {
    expect(cookieValue("a=1; b=2", "cftk")).toBeUndefined();
    expect(cookieValue("", "cftk")).toBeUndefined();
    expect(cookieValue("noequals; a=1", "noequals")).toBeUndefined();
  });
});

describe("codeartsWebHeaders", () => {
  it("cftk 取 devclouddevuibjtcftk，且带齐公共头", () => {
    const headers = codeartsWebHeaders({ ...ACCOUNT, baseUrl: "https://proxy.test/" });
    expect(headers["cftk"]).toBe("CFTK-VALUE");
    expect(headers["Cookie"]).toBe(ACCOUNT.cookies);
    expect(headers["Referer"]).toBe("https://proxy.test/chat/home");
    expect(headers["Accept"]).toBe("application/json, text/plain, */*");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["language"]).toBe("zh-cn");
    expect(headers["x-codearts-doer-scenario-type"]).toBe("web");
    expect(headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(headers["Agent-Type"]).toBe("PromptCenter");
    expect(headers["User-Agent"]).toContain("Chrome/");
  });

  it("缺 devclouddevuibjtcftk 时回落同名 cftk", () => {
    expect(codeartsWebHeaders({ cookies: "a=1; cftk=FB" })["cftk"]).toBe("FB");
  });

  it("Referer 缺省用官方 base", () => {
    expect(codeartsWebHeaders(ACCOUNT)["Referer"]).toBe(`${CODEARTS_WEB_BASE}/chat/home`);
  });

  it("没有 Cookie / 没有 cftk 时抛 CheckinError（提示 cftk，而不是静默发请求）", () => {
    expect(() => codeartsWebHeaders({ cookies: "" })).toThrow(CheckinError);
    expect(() => codeartsWebHeaders({ cookies: "a=1; b=2" })).toThrow(/cftk/);
    expect(() => codeartsWebHeaders({ cookies: "devclouddevuibjtcftk=  " })).toThrow(/cftk/);
    expect(() => codeartsWebHeaders({ cookies: "a=1; b=2" })).toThrow(/invalid channel, group not found/);
  });
});

// ---------------------------------------------------------------------------
// 积分总览
// ---------------------------------------------------------------------------

describe("codeartsCredits", () => {
  it("解析 all_credit_package 的四个数字字段", async () => {
    const { fetchFn, calls } = fakeFetch([{ body: OVERVIEW }]);
    const credits = await codeartsCredits(ACCOUNT, baseOpts(fetchFn));
    expect(credits).toEqual({ remain: 3800, used: 1200, total: 5000, expiring: 300 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${CODEARTS_WEB_BASE}${CODEARTS_OVERVIEW_PATH}`);
    expect(calls[0].init.method).toBe("GET");
  });

  it("容忍字符串数字与 data 包裹", async () => {
    const { fetchFn } = fakeFetch([
      {
        body: {
          code: 0,
          data: {
            all_credit_package: {
              package_credit_amount: "5000",
              package_credit_used: "0",
              package_credit_remain: "5000",
              expiring_credit_amount: "0",
            },
          },
        },
      },
    ]);
    await expect(codeartsCredits(ACCOUNT, baseOpts(fetchFn))).resolves.toEqual({
      remain: 5000,
      used: 0,
      total: 5000,
      expiring: 0,
    });
  });

  it("缺 all_credit_package 时报错（不返回全 0 假装查到了）", async () => {
    const { fetchFn } = fakeFetch([{ body: { data: {} } }]);
    await expect(codeartsCredits(ACCOUNT, baseOpts(fetchFn))).rejects.toThrow(/all_credit_package/);
  });

  it("信封 code 非 0 报「上游错误 <code>」", async () => {
    const { fetchFn } = fakeFetch([{ body: { code: 40100, message: "无权限" } }]);
    await expect(codeartsCredits(ACCOUNT, baseOpts(fetchFn))).rejects.toThrow(/上游错误 40100: 无权限/);
  });
});

// ---------------------------------------------------------------------------
// 活动列表
// ---------------------------------------------------------------------------

describe("codeartsCampaigns", () => {
  it("campaignId 是数字、面额取 benefitAmount、不可领时 status 为 null", async () => {
    const { fetchFn, calls } = fakeFetch([
      {
        body: {
          code: 0,
          message: "",
          data: {
            items: [
              {
                campaignId: 34,
                title: "每日签到",
                type: "USER_LOGIN",
                benefitAmount: 100,
                benefitUnit: "CREDIT",
                claimable: true,
                status: null,
                extra: { startTime: "2026-11-01", endTime: "2026-11-30" },
              },
              {
                campaignId: "35",
                title: "邀请好友",
                type: "INVITE",
                benefitAmount: "50",
                claimable: false,
                status: "CLAIMED",
              },
              // 没有 campaignId 的条目必须被丢弃（不能写死兜底 id）
              { title: "无 id 活动", benefitAmount: 999 },
            ],
          },
        },
      },
    ]);
    const list = await codeartsCampaigns(ACCOUNT, baseOpts(fetchFn));
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ ...CAMP, title: "每日签到" });
    expect(typeof list[0].campaignId).toBe("number");
    expect(list[1]).toEqual({
      campaignId: 35,
      title: "邀请好友",
      type: "INVITE",
      benefitAmount: 50,
      claimable: false,
      status: "CLAIMED",
    });
    expect(calls[0].url).toBe(`${CODEARTS_WEB_BASE}${CODEARTS_DELIVERY_PATH}`);
  });

  it("缺 items 报错", async () => {
    const { fetchFn } = fakeFetch([{ body: { code: 0, data: {} } }]);
    await expect(codeartsCampaigns(ACCOUNT, baseOpts(fetchFn))).rejects.toThrow(/data\.items/);
  });

  it("信封 code 非 0 报「上游错误 <code>」", async () => {
    const { fetchFn } = fakeFetch([{ body: { code: 40003, message: "活动已结束" } }]);
    await expect(codeartsCampaigns(ACCOUNT, baseOpts(fetchFn))).rejects.toThrow(/上游错误 40003/);
  });
});

// ---------------------------------------------------------------------------
// pickCheckinCampaign
// ---------------------------------------------------------------------------

describe("pickCheckinCampaign", () => {
  it("USER_LOGIN 命中（标题不含「签到」也算）", () => {
    const picked = pickCheckinCampaign([
      { ...CAMP, campaignId: 1, title: "学生认证", type: "STUDENT_VERIFY", claimable: true },
      { ...CAMP, campaignId: 34, title: "每日任务", type: "USER_LOGIN" },
    ]);
    expect(picked?.campaignId).toBe(34);
  });

  it("没有 USER_LOGIN 时按标题「签到」兜底", () => {
    const picked = pickCheckinCampaign([
      { ...CAMP, campaignId: 2, title: "邀请好友", type: "INVITE" },
      { ...CAMP, campaignId: 3, title: "每日签到领积分", type: "DAILY_TASK" },
    ]);
    expect(picked?.campaignId).toBe(3);
  });

  it("同一类型里优先可领的那条（已领的只用来补 confirm，不挡路）", () => {
    const picked = pickCheckinCampaign([
      { ...CAMP, campaignId: 1, claimable: false, status: "CLAIMED" },
      { ...CAMP, campaignId: 2, claimable: true, status: null },
    ]);
    expect(picked?.campaignId).toBe(2);
  });

  it("非签到活动（学生认证 / 邀请）不选", () => {
    expect(
      pickCheckinCampaign([
        { ...CAMP, title: "学生认证享折扣", type: "STUDENT_VERIFY" },
        { ...CAMP, title: "邀请好友得积分", type: "INVITE", claimable: true },
      ]),
    ).toBeUndefined();
    expect(pickCheckinCampaign([])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 幂等键 / 日期
// ---------------------------------------------------------------------------

describe("幂等键", () => {
  it("形如 codearts-daily-<label>-<campaignId>-<yyyyMMdd>，同一天固定", () => {
    const key = codeartsIdempotentKey(ACCOUNT, 34, codeartsDayStamp(NOW));
    expect(key).toBe("codearts-daily-acct-a-34-20261116");
    expect(codeartsIdempotentKey(ACCOUNT, 34, codeartsDayStamp(NOW + 3_600_000))).toBe(key);
    expect(codeartsIdempotentKey(ACCOUNT, 34, codeartsDayStamp(NOW_NEXT_DAY))).toBe(
      "codearts-daily-acct-a-34-20261117",
    );
  });

  it("label 缺省用 cookies 的 sha256 前 12 位", () => {
    const label = codeartsAccountLabel({ cookies: ACCOUNT.cookies });
    expect(label).toMatch(/^[0-9a-f]{12}$/);
    expect(codeartsAccountLabel(ACCOUNT)).toBe("acct-a");
  });
});

// ---------------------------------------------------------------------------
// 领取 + 确认
// ---------------------------------------------------------------------------

describe("codeartsClaimCheckin", () => {
  it("claim 成功 → confirm 成功：ok/confirmed 都为 true，请求体带按天幂等键", async () => {
    const { fetchFn, calls } = fakeFetch([
      { body: { code: 0, message: "领取成功" } },
      { body: { code: 0, message: "ok" } },
    ]);
    const result = await codeartsClaimCheckin(ACCOUNT, CAMP, baseOpts(fetchFn));
    expect(result).toEqual({ ok: true, code: 0, message: "领取成功", confirmed: true });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(`${CODEARTS_WEB_BASE}${CODEARTS_CLAIM_PATH}`);
    expect(calls[0].init.method).toBe("POST");
    expect(parsedBody(calls[0])).toEqual({
      campaignId: 34,
      channel: "WEB",
      idempotentKey: "codearts-daily-acct-a-34-20261116",
    });
    expect(calls[1].url).toBe(`${CODEARTS_WEB_BASE}${CODEARTS_CONFIRM_PATH}`);
    expect(calls[1].init.method).toBe("POST");
    expect(parsedBody(calls[1])).toEqual({ campaignId: 34 });
  });

  it("claim 成功但 confirm 业务码非 0 → ok:false（界面成功、积分未到账）", async () => {
    const { fetchFn } = fakeFetch([
      { body: { code: 0, message: "" } },
      { body: { code: 500, message: "确认失败" } },
    ]);
    const result = await codeartsClaimCheckin(ACCOUNT, CAMP, baseOpts(fetchFn));
    expect(result.ok).toBe(false);
    expect(result.confirmed).toBe(false);
    expect(result.code).toBe(500);
    expect(result.message).toMatch(/confirm/);
    expect(result.message).toMatch(/未入账/);
  });

  it("claim 成功但 confirm 超时 → 也按失败返回（不抛成功）", async () => {
    const { fetchFn } = fakeFetch([
      { body: { code: 0, message: "" } },
      { throwErr: timeoutError() },
    ]);
    const result = await codeartsClaimCheckin(ACCOUNT, CAMP, baseOpts(fetchFn));
    expect(result.ok).toBe(false);
    expect(result.confirmed).toBe(false);
    expect(result.message).toMatch(/超时/);
  });

  it('status === "CLAIMED" 时跳过 claim，只补 confirm', async () => {
    const { fetchFn, calls } = fakeFetch([{ body: { code: 0, message: "" } }]);
    const result = await codeartsClaimCheckin(
      ACCOUNT,
      { ...CAMP, claimable: false, status: "CLAIMED" },
      baseOpts(fetchFn),
    );
    expect(result.ok).toBe(true);
    expect(result.confirmed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${CODEARTS_WEB_BASE}${CODEARTS_CONFIRM_PATH}`);
    expect(parsedBody(calls[0])).toEqual({ campaignId: 34 });
  });

  it("claim 业务码非 0：不 confirm，上游 message 原样带出（40001 可重试）", async () => {
    const upstream = "领取过于频繁,请稍后重试";
    const { fetchFn, calls } = fakeFetch([{ body: { code: 40001, message: upstream } }]);
    const result = await codeartsClaimCheckin(ACCOUNT, CAMP, baseOpts(fetchFn));
    expect(result).toEqual({ ok: false, code: 40001, message: upstream, confirmed: false });
    expect(calls).toHaveLength(1);
    expect(isCodeartsClaimRetryable(result.code, result.message)).toBe(true);
  });

  it("claimable=false 且非 CLAIMED：本地短路，零写请求", async () => {
    const { fetchFn, calls } = fakeFetch([{ body: { code: 0 } }]);
    const result = await codeartsClaimCheckin(
      ACCOUNT,
      { ...CAMP, claimable: false, status: null },
      baseOpts(fetchFn),
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe(-1);
    expect(result.message).toMatch(/不可领取.*status=null/s);
    expect(calls).toHaveLength(0);
  });

  it("confirm=false 时零写请求（干跑不等于成功）", async () => {
    const { fetchFn, calls } = fakeFetch([{ body: { code: 0 } }]);
    const result = await codeartsClaimCheckin(ACCOUNT, CAMP, {
      ...baseOpts(fetchFn),
      confirm: false,
    });
    expect(result.ok).toBe(false);
    expect(result.confirmed).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("注入 day 时幂等键用该日（重复调用不会重复发放）", async () => {
    const { fetchFn, calls } = fakeFetch([
      { body: { code: 0 } },
      { body: { code: 0 } },
      { body: { code: 0 } },
      { body: { code: 0 } },
    ]);
    await codeartsClaimCheckin(ACCOUNT, CAMP, { ...baseOpts(fetchFn), day: "20261116" });
    await codeartsClaimCheckin(ACCOUNT, CAMP, { ...baseOpts(fetchFn), day: "20261116" });
    await codeartsClaimCheckin(ACCOUNT, CAMP, { ...baseOpts(fetchFn), day: "20261117" });
    expect(parsedBody(calls[0])["idempotentKey"]).toBe("codearts-daily-acct-a-34-20261116");
    expect(parsedBody(calls[2])["idempotentKey"]).toBe("codearts-daily-acct-a-34-20261116");
    expect(parsedBody(calls[4])["idempotentKey"]).toBe("codearts-daily-acct-a-34-20261117");
  });
});

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

describe("错误口径", () => {
  it("HTTP 200 + 空 body = 会话失效", async () => {
    const { fetchFn } = fakeFetch([{ status: 200, raw: "" }]);
    const err = await codeartsCredits(ACCOUNT, baseOpts(fetchFn)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CheckinError);
    expect((err as Error).message).toMatch(/会话失效/);
    expect((err as Error).message).toMatch(/空 body/);
  });

  it("401 / 403 = 会话失效", async () => {
    for (const status of [401, 403]) {
      const { fetchFn } = fakeFetch([{ status, raw: '{"error":"unauthorized"}' }]);
      const err = await codeartsCredits(ACCOUNT, baseOpts(fetchFn)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CheckinError);
      expect((err as Error).message).toMatch(new RegExp(`会话失效\\(HTTP ${status}\\)`));
      expect((err as Error).message).toMatch(/重新登录/);
    }
  });

  it("超时判网络错误，绝不判会话失效", async () => {
    const { fetchFn } = fakeFetch([{ throwErr: timeoutError() }]);
    const err = await codeartsCredits(ACCOUNT, baseOpts(fetchFn, NOW)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CheckinError);
    expect((err as Error).message).toMatch(/超时/);
    expect((err as Error).message).not.toMatch(/会话失效/);
  });

  it("连接被拒 = 网络请求失败", async () => {
    const { fetchFn } = fakeFetch([{ throwErr: new Error("fetch failed: ECONNREFUSED") }]);
    await expect(codeartsCredits(ACCOUNT, baseOpts(fetchFn))).rejects.toThrow(
      /网络请求失败: .*ECONNREFUSED/s,
    );
  });

  it("非 JSON 应答报错", async () => {
    const { fetchFn } = fakeFetch([{ raw: "<html>gateway</html>" }]);
    await expect(codeartsCredits(ACCOUNT, baseOpts(fetchFn))).rejects.toThrow(/返回非 JSON/);
  });

  it("非法 JSON 报错", async () => {
    const { fetchFn } = fakeFetch([{ raw: "{broken" }]);
    await expect(codeartsCredits(ACCOUNT, baseOpts(fetchFn))).rejects.toThrow(/非法 JSON/);
  });

  it("HTTP 5xx 报 HTTP 状态（不是会话失效）", async () => {
    const { fetchFn } = fakeFetch([{ status: 503, raw: "" }]);
    await expect(codeartsCredits(ACCOUNT, baseOpts(fetchFn))).rejects.toThrow(/HTTP 503/);
  });

  it("时长为 30s 的 AbortSignal 会被传给 fetch", async () => {
    const { fetchFn, calls } = fakeFetch([{ body: OVERVIEW }]);
    await codeartsCredits(ACCOUNT, baseOpts(fetchFn));
    const signal = calls[0].init.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it("缺 cftk 的账号在发请求前就报错（零请求）", async () => {
    const { fetchFn, calls } = fakeFetch([{ body: OVERVIEW }]);
    await expect(
      codeartsCredits({ cookies: "other=1" }, baseOpts(fetchFn)),
    ).rejects.toThrow(CheckinError);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 单账号一键
// ---------------------------------------------------------------------------

describe("codeartsCheckinOne", () => {
  it("可领 → claim+confirm：signed & claimed 都为 true", async () => {
    const { fetchFn, calls } = fakeFetch([
      { body: OVERVIEW },
      { body: DELIVERY },
      { body: { code: 0, message: "" } },
      { body: { code: 0, message: "" } },
    ]);
    const result = await codeartsCheckinOne(ACCOUNT, baseOpts(fetchFn));
    expect(result.signed).toBe(true);
    expect(result.claimed).toBe(true);
    expect(result.credits).toEqual({ remain: 3800, used: 1200, total: 5000, expiring: 300 });
    expect(result.campaign?.campaignId).toBe(34);
    expect(calls.map((c) => c.init.method)).toEqual(["GET", "GET", "POST", "POST"]);
  });

  it("dryRun 只查不发：只有两个 GET", async () => {
    const { fetchFn, calls } = fakeFetch([{ body: OVERVIEW }, { body: DELIVERY }]);
    const result = await codeartsCheckinOne(ACCOUNT, { ...baseOpts(fetchFn), dryRun: true });
    expect(result.signed).toBe(false);
    expect(result.claimed).toBe(false);
    expect(result.campaign?.campaignId).toBe(34);
    expect(result.message).toMatch(/dryRun/);
    expect(calls.map((c) => c.url)).toEqual([
      `${CODEARTS_WEB_BASE}${CODEARTS_OVERVIEW_PATH}`,
      `${CODEARTS_WEB_BASE}${CODEARTS_DELIVERY_PATH}`,
    ]);
    expect(calls.every((c) => c.init.method === "GET")).toBe(true);
  });

  it('已签（status="CLAIMED"）：signed=true/claimed=false，并补 confirm', async () => {
    const { fetchFn, calls } = fakeFetch([
      { body: OVERVIEW },
      { body: { code: 0, data: { items: [{ ...CAMP, claimable: false, status: "CLAIMED" }] } } },
      { body: { code: 0, message: "" } },
    ]);
    const result = await codeartsCheckinOne(ACCOUNT, baseOpts(fetchFn));
    expect(result.signed).toBe(true);
    expect(result.claimed).toBe(false);
    expect(result.message).toMatch(/补 confirm 成功/);
    expect(calls.at(-1)?.url).toBe(`${CODEARTS_WEB_BASE}${CODEARTS_CONFIRM_PATH}`);
  });

  it('已签（status="CLAIMED"）补 confirm 失败：message 明说失败', async () => {
    const { fetchFn } = fakeFetch([
      { body: OVERVIEW },
      { body: { code: 0, data: { items: [{ ...CAMP, claimable: false, status: "CLAIMED" }] } } },
      { body: { code: 500, message: "确认超时" } },
    ]);
    const result = await codeartsCheckinOne(ACCOUNT, baseOpts(fetchFn));
    expect(result.signed).toBe(true);
    expect(result.claimed).toBe(false);
    expect(result.message).toMatch(/补 confirm 失败/);
  });

  it("claimable=false 且 status=null：signed=true、零写请求", async () => {
    const { fetchFn, calls } = fakeFetch([
      { body: OVERVIEW },
      { body: { code: 0, data: { items: [{ ...CAMP, claimable: false, status: null }] } } },
    ]);
    const result = await codeartsCheckinOne(ACCOUNT, baseOpts(fetchFn));
    expect(result.signed).toBe(true);
    expect(result.claimed).toBe(false);
    expect(calls).toHaveLength(2);
    expect(result.message).toMatch(/status=null/);
  });

  it("领取失败：claimed=false，message 带上游原因", async () => {
    const { fetchFn } = fakeFetch([
      { body: OVERVIEW },
      { body: DELIVERY },
      { body: { code: 40002, message: "活动太火爆,请稍后再试" } },
    ]);
    const result = await codeartsCheckinOne(ACCOUNT, baseOpts(fetchFn));
    expect(result.signed).toBe(false);
    expect(result.claimed).toBe(false);
    expect(result.message).toMatch(/领取失败:活动太火爆/);
  });

  it("没有签到活动：signed=false 并说明原因", async () => {
    const { fetchFn } = fakeFetch([
      { body: OVERVIEW },
      { body: { code: 0, data: { items: [{ ...CAMP, title: "邀请好友", type: "INVITE" }] } } },
    ]);
    const result = await codeartsCheckinOne(ACCOUNT, baseOpts(fetchFn));
    expect(result.signed).toBe(false);
    expect(result.claimed).toBe(false);
    expect(result.campaign).toBeUndefined();
    expect(result.message).toMatch(/USER_LOGIN/);
  });

  it("探活失败直接抛（不会在会话失效时继续发 claim）", async () => {
    const { fetchFn, calls } = fakeFetch([{ status: 200, raw: "" }]);
    await expect(codeartsCheckinOne(ACCOUNT, baseOpts(fetchFn))).rejects.toThrow(/会话失效/);
    expect(calls).toHaveLength(1);
  });
});
