/**
 * minimax-signin.ts 的 401 自动续期路径测试(2026-11-08)。
 *
 * 起因:线上报「minimax signin status 鉴权失败(HTTP 401)…(已尝试用
 * refresh_token 自动续期,仍失败)」,但这条文案把上游的确定答案
 * (`invalid_grant: this refresh token can no longer be used`)吞掉了,
 * 用户看不出真正要做的是**重新授权**。这里锁住三种分支的错误文案,
 * 防止以后又把原因吞回去。
 *
 * 零真实网络:全部注入假 fetch。
 */
import { describe, expect, it, vi } from "vitest";

import { minimaxSigninStatus, type MinimaxAccount } from "./minimax-signin.js";

const ACCOUNT: MinimaxAccount = {
  region: "cn",
  token: "old-token",
  bearer: "old-token",
  uuid: "uuid-1",
  deviceId: "device-1",
  userId: "123",
};

/** 假 fetch:每次都回 401(上游对过期令牌常回空 body)。 */
function fake401() {
  return vi.fn(async () => new Response('{"error":"invalid access token"}', { status: 401 }));
}

function optsWith(fetchFn: ReturnType<typeof fake401>, extra: object = {}) {
  return { fetchFn: fetchFn as unknown as typeof fetch, ...extra };
}

describe("minimaxSigninStatus 401 自动续期", () => {
  it("续期回调被上游拒绝:错误信息带出真实原因,且不再重试请求", async () => {
    const fetchFn = fake401();
    await expect(
      minimaxSigninStatus(
        ACCOUNT,
        optsWith(fetchFn, {
          onAuthExpired: async () => {
            throw new Error("minimax 自动续期失败: invalid_grant —— 该账号需重新授权");
          },
        }),
      ),
    ).rejects.toThrow(/自动续期未成功: .*invalid_grant.*重新授权/s);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("续期拿到新令牌仍 401:文案区分「已换新令牌」与「没救成」", async () => {
    const fetchFn = fake401();
    await expect(
      minimaxSigninStatus(
        ACCOUNT,
        optsWith(fetchFn, {
          onAuthExpired: async (acct: MinimaxAccount) => ({
            ...acct,
            token: "fresh-token",
            bearer: "fresh-token",
          }),
        }),
      ),
    ).rejects.toThrow(/换新令牌并重试.*设备指纹/);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("回调返回 null(无 refresh_token):指明没有可用续期凭据", async () => {
    const fetchFn = fake401();
    await expect(
      minimaxSigninStatus(ACCOUNT, optsWith(fetchFn, { onAuthExpired: async () => null })),
    ).rejects.toThrow(/没有可用的 refresh_token/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("未注入续期回调:保持原来的简洁文案", async () => {
    const fetchFn = fake401();
    await expect(minimaxSigninStatus(ACCOUNT, optsWith(fetchFn))).rejects.toThrow(
      /^minimax signin status 鉴权失败\(HTTP 401\):凭据可能已过期$/,
    );
  });
});
