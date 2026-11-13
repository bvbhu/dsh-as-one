/**
 * minimax 额度探针的对照测试(假 fetch,不联网)。
 *
 * 关注两处业务口径:
 *   1. `remaining` 取 `op_credit_summary.total_remaining_amount`(字符串浮点);
 *   2. 「最早到期」取**仍有余额**的发放里最早的那一笔 —— 已用光的不参与,
 *      明细读失败只降级 `expires_at`(不能把余额也弄丢)。
 */
import { describe, expect, it, vi } from "vitest";

import { probe_minimax_quota } from "./quota.js";
import type { QuotaAccountInput } from "./quota.js";

const CREDIT_BODY = {
  data: {
    plan_name: "Max",
    plan_type: 2,
    op_credit_summary: {
      total_remaining_amount: "800.269",
      free_remaining_amount: "800.269",
      purchased_remaining_amount: "0.0",
    },
  },
};

const GRANTS_BODY = {
  data: {
    details: [
      { granted_at: 1_760_000_000, expires_at: 1_760_300_000, granted: 800, remaining: 800 },
      { granted_at: 1_760_000_000, expires_at: 1_760_100_000, granted: 100, remaining: 0 },
      { granted_at: 1_760_000_000, expires_at: 1_760_900_000, granted: 50, remaining: 50 },
    ],
  },
};

function account(): QuotaAccountInput {
  return {
    credentialKey: "minimax/c7fdcb9ffc72",
    provider: "minimax",
    username: "c7fdcb9ffc72",
    token: "TOKEN-XYZ",
    region: "cn",
    extras: { uuid: "uuid-001", device_id: "deviceid-abc", user_id: "123456" },
  };
}

function fakeFetch(routes: Array<{ match: RegExp; body: unknown }>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    for (const r of routes) {
      if (r.match.test(url)) {
        return new Response(JSON.stringify(r.body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("probe_minimax_quota", () => {
  it("余额 + 最早到期(排掉已用光的发放)", async () => {
    const fetchFn = fakeFetch([
      { match: /get_membership_info/, body: CREDIT_BODY },
      { match: /credit\/details/, body: GRANTS_BODY },
    ]);

    const snap = await probe_minimax_quota(account(), { fetchFn });

    expect(snap.remaining).toBe(800.269);
    expect(snap.limit).toBeNull();
    // 1_760_100_000 那份 remaining=0,不参与;最早是 1_760_300_000。
    expect(snap.expires_at).toBe(1_760_300_000);
    expect(snap.packs).toHaveLength(3);
    expect(snap.packs[0]).toMatchObject({
      limit: 800,
      remain: 800,
      counts_for_expiry: true,
    });
    expect(snap.packs[1]).toMatchObject({ remain: 0, counts_for_expiry: false });
    expect(snap.error).toBeNull();
    expect(snap.credentialKey).toBe("minimax/c7fdcb9ffc72");
  });

  it("明细失败降级:余额仍在,到期未知", async () => {
    const fetchFn = fakeFetch([{ match: /get_membership_info/, body: CREDIT_BODY }]);

    const snap = await probe_minimax_quota(account(), { fetchFn });

    expect(snap.remaining).toBe(800.269);
    expect(snap.expires_at).toBeNull();
    expect(snap.packs).toEqual([]);
    expect(snap.error).toContain("credit details");
  });

  it("缺 uuid/device_id 直接拒绝(签名必然对不上)", async () => {
    const acc = account();
    acc.extras = {};
    await expect(probe_minimax_quota(acc, { fetchFn: fakeFetch([]) })).rejects.toThrow(/uuid/);
  });
});