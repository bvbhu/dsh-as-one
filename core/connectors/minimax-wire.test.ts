/**
 * minimax-wire 的对照测试 —— 期望值全部由参考实现(minimax2api)本机生成,
 * 见 .tmp-probe/golden.py(不参与构建)。签名/查询串错一个字节上游就 401/403,
 * 所以这里逐字断言。
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MINIMAX_SIGNIN_PROFILE,
  MINIMAX_BASE_CN,
  MINIMAX_BASE_GLOBAL,
  baseUrlOf,
  buildSigninQuery,
  coreOf,
  earliestGrantExpiry,
  formEncode,
  md5Hex,
  minimaxHeaders,
  parseCredit,
  parseCreditGrants,
  parseSigninClaim,
  parseSigninPanel,
  panelClaimedToday,
  panelTodayPoints,
  signinTarget,
  xSignature,
  yy,
  type MinimaxCredential,
} from "./minimax-wire.js";

const UNIX_MS = 1759999999123;
const UNIX_S = Math.floor(UNIX_MS / 1000);

const credCn: MinimaxCredential = {
  region: "cn",
  token: "TOKEN-XYZ",
  userId: "123456",
  deviceId: "deviceid-abc",
  uuid: "uuid-001",
  screenWidth: 1920,
  screenHeight: 1080,
};

const credDesktop: MinimaxCredential = {
  region: "cn",
  token: "ACCESS",
  bearer: "BEARER-1",
  userId: "123456",
  deviceId: "deviceid-abc",
  uuid: "uuid-001",
};

describe("minimax 签名", () => {
  it("x-signature = md5(秒 + salt + body)", () => {
    expect(xSignature(UNIX_S, '{"content":"hi"}')).toBe("de9b7704a1f33dcc4e9121bff7679523");
  });

  it("yy = md5(encodeURIComponent(signUrl) + _ + body + md5(ms) + ooui)", () => {
    expect(
      yy("/minimax-cloud/api/v1/signin/status?device_platform=web&uuid=uuid-001", "{}", UNIX_MS),
    ).toBe("530d99d52b0cc712a8c6947887ca1b8e");
  });

  it("form_encode 走 URLSearchParams 口径(空格转 +,JS 的 encodeURIComponent 集合)", () => {
    expect(formEncode("a b!~*'()ü中")).toBe("a+b!~*'()%C3%BC%E4%B8%AD");
  });

  it("md5Hex 是小写 32 位", () => {
    expect(md5Hex("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
  });
});

describe("minimax 查询串(顺序即契约)", () => {
  it("web 凭据:签名版带 op_ticket=undefined", () => {
    expect(buildSigninQuery(credCn, UNIX_MS, true)).toBe(
      "device_platform=web&biz_id=3&app_id=3001&version_code=22201" +
        "&unix=1759999999123&timezone_offset=28800&sys_language=en&lang=en" +
        "&uuid=uuid-001&device_id=deviceid-abc&os_name=Windows&browser_name=Chrome" +
        "&device_memory=16&cpu_core_num=8&browser_language=en-US&browser_platform=Win32" +
        "&user_id=123456&op_ticket=undefined&screen_width=1920&screen_height=1080" +
        "&token=TOKEN-XYZ&client=web",
    );
  });

  it("web 凭据:上线版丢掉 op_ticket", () => {
    expect(buildSigninQuery(credCn, UNIX_MS, false)).toBe(
      "device_platform=web&biz_id=3&app_id=3001&version_code=22201" +
        "&unix=1759999999123&timezone_offset=28800&sys_language=en&lang=en" +
        "&uuid=uuid-001&device_id=deviceid-abc&os_name=Windows&browser_name=Chrome" +
        "&device_memory=16&cpu_core_num=8&browser_language=en-US&browser_platform=Win32" +
        "&user_id=123456&screen_width=1920&screen_height=1080" +
        "&token=TOKEN-XYZ&client=web",
    );
  });

  it("桌面凭据:token 为空被跳过,bearer 走 Authorization", () => {
    expect(buildSigninQuery(credDesktop, UNIX_MS, true)).toBe(
      "device_platform=web&biz_id=3&app_id=3001&version_code=22201" +
        "&unix=1759999999123&timezone_offset=28800&sys_language=en&lang=en" +
        "&uuid=uuid-001&device_id=deviceid-abc&os_name=Windows&browser_name=Chrome" +
        "&device_memory=16&cpu_core_num=8&browser_language=en-US&browser_platform=Win32" +
        "&user_id=123456&op_ticket=undefined&screen_width=1920&screen_height=1080&client=web",
    );

    const target = signinTarget(credDesktop, "/minimax-cloud/api/v1/signin/status", {
      method: "GET",
      unixMs: UNIX_MS,
    });
    const headers = minimaxHeaders(credDesktop, target);
    expect(headers["Authorization"]).toBe("Bearer BEARER-1");
    expect(headers["token"]).toBeUndefined();
    expect(target.url).toContain("https://agent.minimaxi.com/minimax-cloud/api/v1/signin/status?");
    expect(target.signUrl).not.toContain("https://");
  });
});

describe("minimax base 与默认画像", () => {
  it("base 按区域取,显式 baseUrl 优先", () => {
    expect(baseUrlOf(credCn)).toBe(MINIMAX_BASE_CN);
    expect(baseUrlOf({ ...credCn, region: "global" })).toBe(MINIMAX_BASE_GLOBAL);
    expect(baseUrlOf({ ...credCn, baseUrl: "https://x.example/" })).toBe("https://x.example");
  });

  it("默认画像与 Web 包一致", () => {
    expect(DEFAULT_MINIMAX_SIGNIN_PROFILE.timezoneOffsetMin).toBe(480);
    expect(DEFAULT_MINIMAX_SIGNIN_PROFILE.screenWidth).toBe(1920);
    expect(DEFAULT_MINIMAX_SIGNIN_PROFILE.screenHeight).toBe(1080);
  });
});

describe("minimax 响应解析", () => {
  it("core 优先取 data", () => {
    expect(coreOf({ data: { a: 1 } })).toEqual({ a: 1 });
    expect(coreOf({ a: 1 })).toEqual({ a: 1 });
  });

  it("签到面板:day 字段与「今日已签」口径(status=3,不是 1)", () => {
    const panel = parseSigninPanel({
      scene: 4,
      days: [
        { day_no: 1, points: 400, status: 3, is_today: true },
        { day_no: 2, points: 400, status: 1 },
      ],
    });
    expect(panel.scene).toBe(4);
    expect(panel.days).toEqual([
      { dayNo: 1, points: 400, status: 3, isToday: true },
      { dayNo: 2, points: 400, status: 1, isToday: false },
    ]);
    expect(panelClaimedToday(panel)).toBe(true);

    const unclaimed = parseSigninPanel({
      scene: 4,
      days: [{ day_no: 1, points: 400, status: 2, is_today: true }],
    });
    expect(panelClaimedToday(unclaimed)).toBe(false);
  });

  it("panelTodayPoints:不论已签/未签都给当日真实积分(「领到多少」的显示源)", () => {
    // 旧语义在已签(status=3)时返回 0 → 概览卡「已签但看不到领了多少」
    // (2026-11-07 用户实测)。现在两处都读同一个真实值。
    const claimed = parseSigninPanel({
      scene: 2,
      days: [{ day_no: 1, points: 400, status: 3, is_today: true }],
    });
    expect(panelTodayPoints(claimed)).toBe(400);
    const unclaimed = parseSigninPanel({
      scene: 2,
      days: [{ day_no: 1, points: 1000, status: 2, is_today: true }],
    });
    expect(panelTodayPoints(unclaimed)).toBe(1000);
    const noToday = parseSigninPanel({ scene: 2, days: [{ day_no: 2, points: 400, status: 1 }] });
    expect(panelTodayPoints(noToday)).toBe(0);
  });

  it("claim 结果", () => {
    const claim = parseSigninClaim({
      claim_id: 2118780486674322176,
      claim_result: 1,
      day_no: 1,
      points: 400,
    });
    expect(claim).toEqual({
      claimId: 2118780486674322176,
      result: 1,
      dayNo: 1,
      points: 400,
      panel: null,
    });
  });

  it("余额:op_credit_summary 的字符串口径", () => {
    expect(
      parseCredit({
        plan_name: "Max",
        plan_type: 2,
        op_credit_summary: {
          total_remaining_amount: "800.269",
          free_remaining_amount: "800.269",
          purchased_remaining_amount: "0.0",
        },
      }),
    ).toEqual({ planName: "Max", planType: 2, total: 800.269, free: 800.269, purchased: 0 });
  });

  it("发放明细 → 最早到期(只算仍有余额的)", () => {
    const grants = parseCreditGrants({
      details: [
        { granted_at: 1, expires_at: 2000, granted: 800, remaining: 800 },
        { granted_at: 2, expires_at: 1000, granted: 100, remaining: 0 },
        { granted_at: 3, expires_at: 3000, granted: 50, remaining: 50 },
      ],
    });
    expect(grants).toHaveLength(3);
    // 1000 那份已用光(remaining=0),不算进最早到期。
    expect(earliestGrantExpiry(grants)).toBe(2000);
    expect(earliestGrantExpiry([])).toBeNull();
  });

  it("发放明细:线上真实字段(granted_amount/expire_at_ms 毫秒)", () => {
    // 2026-11 实测报文:金额是字符串、时间是毫秒。
    const grants = parseCreditGrants({
      details: [
        {
          credit_type: 2,
          granted_amount: "400.00",
          remaining_amount: "400.00",
          consumed_amount: "0.00",
          granted_at_ms: 1794004172246,
          expire_at_ms: 1796572800000,
        },
        {
          consumed_amount: "1423.73",
          expire_at_ms: 1795363200000,
          credit_type: 2,
          granted_amount: "1424.00",
          remaining_amount: "0.27",
          granted_at_ms: 1792823966587,
        },
        {
          expire_at_ms: 1795017600000,
          credit_type: 2,
          granted_amount: "400.00",
          remaining_amount: "0.00",
          consumed_amount: "400.00",
          granted_at_ms: 1792491327961,
        },
      ],
    });
    expect(grants[0]).toEqual({
      grantedAt: 1794004172,
      expiresAt: 1796572800,
      granted: 400,
      remaining: 400,
    });
    // 毫秒 → 秒;最早到期取 1795363200(仍有 0.27),已用光的 1795017600 排除。
    expect(earliestGrantExpiry(grants)).toBe(1795363200);
  });
});