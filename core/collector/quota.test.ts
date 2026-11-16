/**
 * collector/quota 探针的纯函数测试 —— 数据形状对齐 Nexus 采集器实测口径。
 */
import { describe, expect, it } from "vitest";
import {
  earliest_expiry,
  number_of,
  parse_codearts_credits,
  parse_trae_pay_status,
  parse_trae_usage,
  parse_workbuddy,
  periodEndSecondsOf,
  precise_number,
  probe_codearts_quota,
  probe_trae_quota,
  to_epoch_seconds,
  workbuddy_request_body,
  type QuotaAccountInput,
} from "./quota.js";

const KEY = "trae/u1";

describe("number_of", () => {
  it("bool 不算数值", () => {
    expect(number_of(true)).toBeNull();
    expect(number_of(false)).toBeNull();
  });
  it("数值直通", () => {
    expect(number_of(42)).toBe(42);
    expect(number_of(41.02)).toBeCloseTo(41.02);
  });
  it("NaN/Infinity → null", () => {
    expect(number_of(Number.NaN)).toBeNull();
    expect(number_of(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("数字字符串解析,非数字 → null", () => {
    expect(number_of("41.02000309")).toBeCloseTo(41.02000309);
    expect(number_of("  ")).toBeNull();
    expect(number_of("abc")).toBeNull();
  });
});

describe("to_epoch_seconds", () => {
  it("毫秒阈值 1e11", () => {
    expect(to_epoch_seconds(1_755_586_113_000)).toBe(1_755_586_113);
    expect(to_epoch_seconds(1_755_586_113)).toBe(1_755_586_113);
  });
  it("字符串 ISO 解析", () => {
    const s = to_epoch_seconds("2026-10-10T13:51:10Z");
    expect(s).not.toBeNull();
    expect(s).toBe(Math.round(new Date("2026-10-10T13:51:10Z").getTime() / 1000));
  });
});

describe("precise_number", () => {
  it("优先 *Precise 字符串(实测 41.02000309 vs 41)", () => {
    const raw = { CapacityRemainPrecise: "41.02000309", CapacityRemain: 41 };
    expect(precise_number(raw, "CapacityRemainPrecise", "CapacityRemain")).toBeCloseTo(41.02000309);
  });
  it("缺 Precise 回退数字字段", () => {
    expect(precise_number({ CapacityRemain: 41 }, "CapacityRemainPrecise", "CapacityRemain")).toBe(41);
  });
  it("都没有 → 0.0", () => {
    expect(precise_number({}, "A", "B")).toBe(0);
  });
});

describe("earliest_expiry(trae)", () => {
  const pack = (name: string, endMs: number, creditsLimit: number, creditsAmount: number) => ({
    display_desc: name,
    entitlement_base_info: { name, end_time: endMs, quota: { credits_limit: creditsLimit } },
    usage: { credits_amount: creditsAmount },
  });
  it("还有余额的包里最早到期", () => {
    const { expires_at } = earliest_expiry([
      pack("已用光", 1_800_000_000_000, 100, 100), // remain 0 → 不参与
      pack("A", 1_900_000_000_000, 100, 40), // remain 60
      pack("B", 1_850_000_000_000, 50, 0), // remain 50 → 最早
    ]);
    expect(expires_at).toBe(1_850_000_000);
  });
  it("免费包(无额度字段/limit 0)不参与,一个都不剩 → null", () => {
    const { expires_at, packs } = earliest_expiry([
      pack("免费", 1_800_000_000_000, 0, 0),
      { display_desc: "无字段", entitlement_base_info: { name: "无字段", end_time: 1_800_000_000_000 } },
    ]);
    expect(expires_at).toBeNull();
    expect(packs.length).toBe(0);
  });
  it("全部用光 → null(绝不回落到所有包最早)", () => {
    const { expires_at } = earliest_expiry([pack("用光1", 1_800_000_000_000, 10, 10)]);
    expect(expires_at).toBeNull();
  });
  it("非数组/坏条目容错", () => {
    expect(earliest_expiry(null).expires_at).toBeNull();
    expect(earliest_expiry([null, "str", 42]).packs.length).toBe(0);
  });
  it("名称回退链 display_desc → base.name → 未命名", () => {
    const { packs } = earliest_expiry([pack("x", 1_900_000_000_000, 10, 0)]);
    expect(packs[0]).toMatchObject({
      name: "x",
      expires_at: 1_900_000_000,
      counts_for_expiry: true,
    });
  });
});

describe("parse_trae_usage", () => {
  it("usage_summary 权威(total − consumed)", () => {
    const snap = parse_trae_usage({
      usage_summary: { total_amount: 4550, consumed_amount: 2910.52 },
      user_entitlement_pack_list: [],
    }, KEY, 1_700_000_000);
    expect(snap.remaining).toBe(1639); // round(4550 − 2910.52)
    expect(snap.limit).toBe(4550);
    expect(snap.fetched_at).toBe(1_700_000_000);
    expect(snap.error).toBeNull();
  });
  it("consumed 缺失按 0 处理(不把额度清零)", () => {
    const snap = parse_trae_usage({ usage_summary: { total_amount: 100 } }, KEY, 1);
    expect(snap.remaining).toBe(100);
  });
  it("usage_summary 缺失 → 回退 Σ(包额度−包消耗)", () => {
    const snap = parse_trae_usage({
      user_entitlement_pack_list: [
        { entitlement_base_info: { name: "A", quota: { credits_limit: 100 } }, usage: { credits_amount: 40 } },
        { entitlement_base_info: { name: "B", quota: { credits_limit: 50 } }, usage: { credits_amount: 10 } },
      ],
    }, KEY, 1);
    expect(snap.remaining).toBe(100); // 60 + 40
    expect(snap.limit).toBe(150);
  });
});

describe("parse_trae_pay_status", () => {
  it("国际版:remaining null(不是 0)、到期来自 trial_end_time", () => {
    const snap = parse_trae_pay_status({
      trial_status: { trial_status: "active", trial_end_time: 1_800_000_000_000 },
    }, KEY, 1);
    expect(snap.remaining).toBeNull();
    expect(snap.limit).toBeNull();
    expect(snap.expires_at).toBe(1_800_000_000);
    expect(snap.packs[0]).toMatchObject({ extra: { kind: "trial", status: "active" } });
  });
});

describe("parse_workbuddy", () => {
  const accountsPayload = (accounts: unknown[]) => ({ data: { Response: { Data: { Accounts: accounts } } } });
  const monthlyPack = (over = {}) => ({
    CapacityType: 4,
    PackageName: "月度套餐",
    CycleCapacityRemainPrecise: "41.02",
    CycleCapacitySize: 100,
    CycleEndTime: 1_800_000_000_000, // 刷新时间
    ...over,
  });
  const oncePack = (over = {}) => ({
    CapacityType: 3,
    PackageName: "一次性包",
    CapacityRemainPrecise: "15.5",
    CapacitySizePrecise: "100",
    ExpiredTime: 1_900_000_000_000,
    ...over,
  });
  it("月周期 + 一次性合计,最近到期取两者中最早", () => {
    const snap = parse_workbuddy(accountsPayload([
      monthlyPack(), // expire 未知(刷新时间不算到期);remain 41.02
      oncePack(), // remain 15.5;expire 1900000000
    ]), KEY, 1, 1_700_000_000);
    expect(snap.remaining).toBe(57); // round(41.02 + 15.5)
    expect(snap.expires_at).toBe(1_900_000_000);
    const monthly = snap.packs.find((p) => p.extra?.monthly === true);
    expect(monthly?.remain).toBeCloseTo(41.02);
    expect(monthly?.expires_at).toBeNull(); // 月周期无真实到期
    expect(monthly?.extra?.refresh_at).toBe(1_800_000_000);
    expect(snap.packs.find((p) => p.extra?.monthly === false)?.expires_at).toBe(1_900_000_000);
  });
  it("余量 ≤0 或已过期的一次性包整包剔除", () => {
    const snap = parse_workbuddy(accountsPayload([
      oncePack({ CapacityRemainPrecise: "0" }),
      oncePack({ ExpiredTime: 1_500_000_000_000 }), // 已过期
      oncePack(),
    ]), KEY, 1, 1_700_000_000);
    expect(snap.remaining).toBe(16); // round(15.5)
    expect(snap.packs.length).toBe(1);
  });
  it("无可用包 → remaining 0、expires null(不虚报)", () => {
    const snap = parse_workbuddy(accountsPayload([oncePack({ CapacityRemainPrecise: "0" })]), KEY, 1, 1_700_000_000);
    expect(snap.remaining).toBe(0);
    expect(snap.expires_at).toBeNull();
  });
  it("坏数据退化成空列表", () => {
    const snap = parse_workbuddy({}, KEY, 1);
    expect(snap.remaining).toBe(0);
    expect(snap.packs.length).toBe(0);
    expect(snap.error).toBeNull();
  });
});

describe("workbuddy_request_body", () => {
  it("时间窗 现在→100 年后,ProductCode p_tcaca", () => {
    const now = new Date(2026, 9, 10, 0, 0, 0); // 本地时区 2026-10-10 00:00:00
    const body = workbuddy_request_body(now);
    expect(body.ProductCode).toBe("p_tcaca");
    expect(body.PageSize).toBe(100);
    expect(body.Status).toEqual([0, 3]);
    expect(body.PackageEndTimeRangeBegin).toBe("2026-10-10 00:00:00");
  });
});

describe("probe_trae_quota:鉴权失败是 HTTP 200 + body.code 1001", () => {
  const account: QuotaAccountInput = {
    credentialKey: "trae/bvbhu",
    provider: "trae",
    username: "bvbhu",
    token: "eyJhbGciOiJSUzI1NiJ9.eyJkYXRhIjp7InNvdXJjZSI6InJlZnJlc2hfdG9rZW4ifX0.sig",
    region: "cn",
  };
  it("code 1001 → 抛 QuotaError(不是静默成功摆 0/0)", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({
        code: 1001,
        is_dollar_usage_billing: false,
        message: "We're sorry, but we are not able to authenticate you.",
        usage_summary: {},
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    await expect(probe_trae_quota(account, { fetchFn })).rejects.toThrow(/认证失败\(code 1001\)/);
  });
  it("正常 200 → 正常返回快照", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({
        code: 0,
        usage_summary: { total_amount: 3800, consumed_amount: 2139.85 },
        user_entitlement_pack_list: [],
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const snap = await probe_trae_quota(account, { fetchFn });
    expect(snap.remaining).toBe(1660);
    expect(snap.limit).toBe(3800);
    expect(snap.error).toBeNull();
  });
});

/**
 * CodeArts 积分总览（B 族 AK/SK）。
 *
 * 形状取自 2026-11-16 **真实上游响应**（`GET /snap-manager/v1/package/overview`，200）。
 */
describe("parse_codearts_credits", () => {
  const REAL = {
    all_credit_package: {
      package_credit_amount: 4500,
      package_credit_used: 0.65,
      package_credit_remain: 4499.35,
      package_credit_user_amount: 4500,
      package_credit_user_used: 0.65,
      package_credit_user_remain: 4499.35,
      expiring_credit_amount: 0,
      expiring_credit_user_amount: 0,
    },
    basic_package: {
      package_credit_amount: 500,
      package_credit_used: 0,
      package_credit_remain: 500,
      expiring_credit_amount: 0,
    },
    ondemand_credit_package: null,
    bonus_credit_package: {
      package_credit_amount: 4000,
      package_credit_used: 0.65,
      package_credit_remain: 3999.35,
      expiring_credit_amount: 0,
    },
    model_package: [],
  };

  it("实测形状：取 all_credit_package 的总额/已用/剩余", () => {
    const c = parse_codearts_credits(REAL);
    expect(c.remaining).toBeCloseTo(4499.35);
    expect(c.limit).toBe(4500);
    expect(c.used).toBeCloseTo(0.65);
    expect(c.expiring).toBe(0);
  });

  it("缺 all_credit_package → 逐包相加（ondemand 为 null 时跳过）", () => {
    const c = parse_codearts_credits({
      basic_package: REAL.basic_package,
      ondemand_credit_package: null,
      bonus_credit_package: REAL.bonus_credit_package,
    });
    expect(c.limit).toBe(4500);
    expect(c.remaining).toBeCloseTo(4499.35);
    expect(c.used).toBeCloseTo(0.65);
  });

  it("没有任何可用包 → 报错（不返回全 0 骗过上层）", () => {
    expect(() => parse_codearts_credits({ model_package: [] })).toThrow(/all_credit_package/);
    expect(() => parse_codearts_credits({})).toThrow(/all_credit_package/);
  });

  it("合计节点缺关键字段 → 报错（形态变了要能看出来）", () => {
    expect(() => parse_codearts_credits({ all_credit_package: { package_credit_amount: 100 } })).toThrow(
      /package_credit_remain/,
    );
  });
});

/**
 * CodeArts 到期估算：积分总览只给数量，绝对时间来自运营活动的 `extra.endTime`。
 *
 * 2026-11-16 实测真实响应：签到 `2026-12-31T15:59:59Z`、注册/学生认证
 * `2026-12-30T16:00:00Z`。
 */
describe("probe_codearts_quota:到期取活动 endTime", () => {
  const CREDIT_KEYS = {
    accessKey: "AK",
    secretKey: "SK",
    domainId: "bv_bhu",
  };
  const overviewBody = {
    all_credit_package: {
      package_credit_amount: 4500,
      package_credit_used: 0.65,
      package_credit_remain: 4499.35,
      expiring_credit_amount: 0,
    },
  };
  const deliveryBody = (items: unknown[]) => ({ code: 0, message: "ok", data: { items } });

  const account: QuotaAccountInput = {
    credentialKey: "codearts/bv_bhu",
    provider: "codearts",
    username: "bv_bhu",
    token: "",
    extras: CREDIT_KEYS,
  };

  /** 按路径分派的假 fetch。 */
  const routed = (routes: Record<string, unknown>): typeof fetch =>
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [frag, body] of Object.entries(routes)) {
        if (url.includes(frag)) {
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

  // ── 到期估算规则（用户 2026-11-16 最终定案）──────────────────────────
  //
  // 背景实测：活动的 extra.endTime 是「可领取截止时间」而非积分作废（已证伪弃用）；
  // 签到积分只有 24h；订阅套餐 end_date=2026-12-17 → 前一天 23:59:59 到期。
  it("无即将到期 → end_date 前一天 23:59:59（end_date=2026-12-17 → 12/16 23:59:59）", async () => {
    const fetchFn = routed({
      "package/overview": overviewBody,
      "/statistics/plugin": { start_date: "2026-11-16", end_date: "2026-12-17" },
    });
    const snap = await probe_codearts_quota(account, { fetchFn });
    expect(snap.remaining).toBeCloseTo(4499.35);
    expect(snap.expires_at).toBe(Math.floor(Date.UTC(2026, 11, 16, 23, 59, 59) / 1000));
    expect(snap.error).toBeNull();
  });

  it("有即将到期 → 明天此刻（fetched_at + 24h）", async () => {
    const fetchFn = routed({
      "package/overview": {
        ...overviewBody,
        all_credit_package: { ...overviewBody.all_credit_package, expiring_credit_amount: 100 },
      },
      "/statistics/plugin": { end_date: "2026-12-17" },
    });
    const snap = await probe_codearts_quota(account, { fetchFn });
    expect(snap.expires_at).toBe(snap.fetched_at + 86_400);
  });

  it("end_date 读不到 → 写死 2026-12-16 23:59:59（保底）", async () => {
    const fetchFn = routed({
      "package/overview": overviewBody,
      "/statistics/plugin": { foo: 1 },
    });
    const snap = await probe_codearts_quota(account, { fetchFn });
    expect(snap.expires_at).toBe(Math.floor(Date.UTC(2026, 11, 16, 23, 59, 59) / 1000));
  });

  it("statistics 读失败 → 仍走写死兜底", async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("package/overview")) {
        return new Response(JSON.stringify(overviewBody), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("boom", { status: 500 });
    }) as unknown as typeof fetch;
    const snap = await probe_codearts_quota(account, { fetchFn });
    expect(snap.expires_at).toBe(Math.floor(Date.UTC(2026, 11, 16, 23, 59, 59) / 1000));
  });

  it("缺 accessKey/secretKey → 直接报错（不去打上游）", async () => {
    const fetchFn = (async () => {
      throw new Error("不应该发起请求");
    }) as unknown as typeof fetch;
    await expect(
      probe_codearts_quota({ ...account, extras: {} }, { fetchFn }),
    ).rejects.toThrow(/accessKey/);
  });
});

describe("periodEndSecondsOf", () => {
  it("YYYY-MM-DD → 当天 UTC 23:59:59", () => {
    expect(periodEndSecondsOf("2026-12-17")).toBe(Math.floor(Date.UTC(2026, 11, 17, 23, 59, 59) / 1000));
  });
  it("非日期形态 → null（不猜）", () => {
    expect(periodEndSecondsOf("2026-12-17T00:00:00Z")).toBeNull();
    expect(periodEndSecondsOf("")).toBeNull();
    expect(periodEndSecondsOf(12345)).toBeNull();
    expect(periodEndSecondsOf(null)).toBeNull();
    expect(periodEndSecondsOf("2026/12/17")).toBeNull();
  });
});