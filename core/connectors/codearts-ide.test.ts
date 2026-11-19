/**
 * `codearts-ide.ts`（B 族 AK/SK 签到）的行为测试。
 *
 * 所有上游形态取自 **2026-11-16 真实响应**：
 * - delivery：`{code:0,data:{items:[{campaignId,type,status,claimable,benefitAmount,extra}]}}`
 * - claim：`{code:0,data:{id,status:"CLAIMED",totalAmount,expireAt}}`
 * - confirm：`{code:0,data:{status:"CONFIRMED",...}}`
 * - confirm 带 channel → 400 `{error_code:"HDN.1000"}`
 * - claim 重复 → `{code:40001,message:"并发冲突，请重试"}`
 */
import { describe, expect, it } from "vitest";

import {
  CODEARTS_IDE_CHECKIN_TYPE,
  CODEARTS_IDE_CONFLICT_CODE,
  codeartsIdeCampaigns,
  codeartsIdeCheckin,
  pickIdeCheckinCampaign,
} from "./codearts-ide.js";

const ACCOUNT = { accessKey: "AK", secretKey: "SK", domainId: "bv_bhu", label: "bv_bhu" };

/** 按 URL 后缀分派的假 fetch，并记录调用顺序。 */
function fakeFetch(routes: Record<string, () => { status?: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string; body: string | null; headers: Record<string, string> }> = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET");
    calls.push({
      url,
      method,
      body: typeof init?.body === "string" ? init.body : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    for (const [frag, make] of Object.entries(routes)) {
      if (url.includes(frag)) {
        const { status = 200, body } = make();
        return new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const ELIGIBLE = {
  campaignId: 34,
  title: "每日签到领100积分",
  type: CODEARTS_IDE_CHECKIN_TYPE,
  benefitAmount: 100,
  claimable: true,
  status: "ELIGIBLE",
  extra: { startTime: "2026-10-26T16:00:00Z", endTime: "2026-12-31T15:59:59Z" },
};

const deliveryOf = (items: unknown[]) => ({ code: 0, message: "ok", data: { items } });

describe("codeartsIdeCampaigns", () => {
  it("解析 data.items，campaignId 转数字、extra 时间转 epoch", async () => {
    const { fetchFn } = fakeFetch({ "/v1/ops/delivery": () => ({ body: deliveryOf([ELIGIBLE]) }) });
    const list = await codeartsIdeCampaigns(ACCOUNT, { fetchFn });
    expect(list).toHaveLength(1);
    expect(list[0]!.campaignId).toBe(34);
    expect(list[0]!.type).toBe("USER_LOGIN");
    expect(list[0]!.claimable).toBe(true);
    expect(list[0]!.endAt).toBe(Math.floor(Date.parse("2026-12-31T15:59:59Z") / 1000));
  });

  it("业务码非 0 → 抛错（不返回空列表假装没活动）", async () => {
    const { fetchFn } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: { code: 40001, message: "并发冲突", data: null } }),
    });
    await expect(codeartsIdeCampaigns(ACCOUNT, { fetchFn })).rejects.toThrow(/业务失败/);
  });

  it("缺 data.items → 抛错（形态变了要能看出来）", async () => {
    const { fetchFn } = fakeFetch({ "/v1/ops/delivery": () => ({ body: { code: 0, data: {} } }) });
    await expect(codeartsIdeCampaigns(ACCOUNT, { fetchFn })).rejects.toThrow(/items/);
  });

  it("没有 campaignId 的行被丢弃", async () => {
    const { fetchFn } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([{ title: "无 id" }, ELIGIBLE]) }),
    });
    const list = await codeartsIdeCampaigns(ACCOUNT, { fetchFn });
    expect(list).toHaveLength(1);
  });
});

describe("pickIdeCheckinCampaign", () => {
  it("优先 USER_LOGIN，标题兜底", () => {
    const a = { campaignId: 1, title: "邀请", type: "INVITE", benefitAmount: 1, claimable: true, status: null, startAt: null, endAt: null };
    const b = { ...a, campaignId: 34, title: "每日签到领100积分", type: "USER_LOGIN" };
    expect(pickIdeCheckinCampaign([a, b])!.campaignId).toBe(34);
    // type 变了但标题含「签到」→ 仍能签
    const c = { ...a, campaignId: 9, title: "每日签到", type: "SOMETHING_NEW" };
    expect(pickIdeCheckinCampaign([a, c])!.campaignId).toBe(9);
    expect(pickIdeCheckinCampaign([a])).toBeUndefined();
  });
});

describe("codeartsIdeCheckin", () => {
  it("ELIGIBLE → claim(channel=IDE) → confirm(仅 campaignId) → 成功入账", async () => {
    const { fetchFn, calls } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([ELIGIBLE]) }),
      "/v1/ops/claim": () => ({
        body: {
          code: 0,
          data: {
            id: 1756513,
            status: "CLAIMED",
            totalAmount: 100,
            expireAt: "2026-11-17T13:54:17.761Z",
          },
        },
      }),
      "/v1/ops/confirm": () => ({ body: { code: 0, data: { status: "CONFIRMED" } } }),
    });

    const res = await codeartsIdeCheckin(ACCOUNT, { fetchFn });

    expect(res.ok).toBe(true);
    expect(res.credit).toBe(100);
    expect(res.expireAt).toBe(Math.floor(Date.parse("2026-11-17T13:54:17.761Z") / 1000));
    // claim 必须带 channel=IDE；confirm 必须只带 campaignId（带 channel 会 400 HDN.1000）
    const claimCall = calls.find((c) => c.url.includes("/v1/ops/claim"))!;
    expect(JSON.parse(claimCall.body!)).toEqual({ campaignId: 34, channel: "IDE" });
    const confirmCall = calls.find((c) => c.url.includes("/v1/ops/confirm"))!;
    expect(JSON.parse(confirmCall.body!)).toEqual({ campaignId: 34 });
  });

  it("confirm 被拒 → ok=false（claim 已提交但没入账，不能报成功）", async () => {
    const { fetchFn } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([ELIGIBLE]) }),
      "/v1/ops/claim": () => ({ body: { code: 0, data: { status: "CLAIMED", totalAmount: 100 } } }),
      "/v1/ops/confirm": () => ({ body: { code: 500, message: "boom", data: null } }),
    });
    const res = await codeartsIdeCheckin(ACCOUNT, { fetchFn });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("积分未入账");
  });

  it("claim 回 40001 并发冲突 → already（今日已签，不是错误）", async () => {
    const { fetchFn } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([ELIGIBLE]) }),
      "/v1/ops/claim": () => ({ body: { code: CODEARTS_IDE_CONFLICT_CODE, message: "并发冲突，请重试", data: null } }),
    });
    const res = await codeartsIdeCheckin(ACCOUNT, { fetchFn });
    expect(res.already).toBe(true);
    expect(res.ok).toBe(false);
  });

  it("status=CLAIMED（已领未确认）→ 跳过 claim，只补 confirm", async () => {
    const { fetchFn, calls } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([{ ...ELIGIBLE, claimable: false, status: "CLAIMED" }]) }),
      "/v1/ops/confirm": () => ({ body: { code: 0, data: { status: "CONFIRMED", totalAmount: 100 } } }),
    });
    const res = await codeartsIdeCheckin(ACCOUNT, { fetchFn });
    expect(res.ok).toBe(true);
    expect(res.already).toBe(true);
    expect(calls.some((c) => c.url.includes("/v1/ops/claim"))).toBe(false);
  });

  it("status=CONFIRMED → 今日已签，零写请求", async () => {
    const { fetchFn, calls } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([{ ...ELIGIBLE, claimable: false, status: "CONFIRMED" }]) }),
    });
    const res = await codeartsIdeCheckin(ACCOUNT, { fetchFn });
    expect(res.already).toBe(true);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("status=CONSUMED（2026-11-19 实测上游口径）→ 今日已签，零写请求", async () => {
    // 真实上游把「今日已签且奖励已消费」的活动标成 CONSUMED（claimable:false），
    // 不再是 CONFIRMED。漏判会误报「可领取(未签)」，点签到还多打一发 claim 被回 40001。
    const { fetchFn, calls } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([{ ...ELIGIBLE, claimable: false, status: "CONSUMED" }]) }),
    });
    const res = await codeartsIdeCheckin(ACCOUNT, { fetchFn, confirm: false });
    expect(res.already).toBe(true);
    expect(res.credit).toBe(100);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("status=consumed（小写）→ 同样识别为已签（大小写不敏感）", async () => {
    const { fetchFn, calls } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([{ ...ELIGIBLE, claimable: false, status: "consumed" }]) }),
    });
    const res = await codeartsIdeCheckin(ACCOUNT, { fetchFn });
    expect(res.already).toBe(true);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("confirm:false 干跑 → 零写请求，返回可领面额", async () => {
    const { fetchFn, calls } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([ELIGIBLE]) }),
    });
    const res = await codeartsIdeCheckin(ACCOUNT, { fetchFn, confirm: false });
    expect(res.ok).toBe(false);
    expect(res.credit).toBe(100);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("没有签到活动 → 明确报错", async () => {
    const { fetchFn } = fakeFetch({
      "/v1/ops/delivery": () => ({ body: deliveryOf([{ ...ELIGIBLE, type: "INVITE", title: "邀请好友" }]) }),
    });
    const res = await codeartsIdeCheckin(ACCOUNT, { fetchFn });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("没有签到活动");
  });
});
