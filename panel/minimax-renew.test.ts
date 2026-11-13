/**
 * minimax 凭据自动续期的单测(2026-11-07)。
 *
 * 覆盖三件容易出错的事:
 *   1. **并发单飞** —— 同一账号被签到总览 / 渠道卡头 / 额度探针同时读时,
 *      只能打一次 refresh(上游会轮换 refresh_token,用两次可能被判重放);
 *   2. **无 refresh_token 时不重试** —— 返回 null,让调用方按原 401 报错,
 *      不能假装续期成功;
 *   3. **写回库的形状** —— secret 换新、refreshSecret 换新(上游轮换)、
 *      expiresAt 是**秒**而不是毫秒。
 */

import { describe, expect, it, vi } from "vitest";
import type { CredentialVault } from "@as-one/core/src/config/credentials.js";
import type { MinimaxAccount } from "@as-one/core/src/connectors/minimax-signin.js";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("@as-one/core/src/connectors/minimax-signin.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@as-one/core/src/connectors/minimax-signin.js")>();
  return {
    ...actual,
    minimaxRefreshToken: refreshMock,
  };
});

const { renewMinimaxAccount, minimaxAccountFor, resetMinimaxRenewInflight } = await import(
  "./minimax-renew.js"
);

/**
 * 轮换时可能带上的载荷字段。
 * 显式声明是为了让 `rotate.mock.calls[0][2]` 有下标可推断 —— 若写成
 * `vi.fn(async () => undefined)`，参数被推断成空元组 `[]`，
 * 取 `[2]` 会报 TS2493「Tuple type '[]' of length '0' has no element at index '2'」。
 */
interface RotatePayload {
  secret?: string;
  refreshSecret?: string;
  expiresAt?: number;
}

/** 最小可用的 vault 替身:只实现被测代码用到的方法。 */
function makeVault(init: {
  secret?: string | null;
  refreshSecret?: string | null;
  raw?: Record<string, unknown>;
}) {
  const rotate = vi.fn(
    async (_provider: string, _username: string, _payload: RotatePayload): Promise<void> => undefined,
  );
  const vault = {
    get: vi.fn(async () => ({
      username: "u1",
      secret: init.secret ?? "old-token",
      refreshSecret: init.refreshSecret === undefined ? "old-refresh" : init.refreshSecret,
      raw: init.raw ?? { region: "cn", kind: "oauth" },
    })),
    secret: vi.fn(async () => init.secret ?? "old-token"),
    rotate,
    list: vi.fn(async () => []),
    remove: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  } as unknown as CredentialVault & { rotate: typeof rotate };
  return { vault, rotate };
}

const ACCOUNT: MinimaxAccount = {
  token: "old-token",
  bearer: "old-token",
  region: "cn",
  uuid: "uu",
  deviceId: "dd",
  userId: "uid",
  baseUrl: "https://example.invalid",
} as unknown as MinimaxAccount;

describe("renewMinimaxAccount", () => {
  it("无 refresh_token 时返回 null,不调上游", async () => {
    resetMinimaxRenewInflight();
    refreshMock.mockClear();
    const { vault } = makeVault({ refreshSecret: null });
    const got = await renewMinimaxAccount(ACCOUNT, { vault, provider: "minimax", username: "u1" });
    expect(got).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("续期成功:返回新 token 并写回库(expiresAt 是秒)", async () => {
    resetMinimaxRenewInflight();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue({
      accessToken: "new-token",
      refreshToken: "new-refresh",
      expiresInSec: 43200,
    });
    const { vault, rotate } = makeVault({});
    const before = Math.floor(Date.now() / 1000);
    const got = await renewMinimaxAccount(ACCOUNT, { vault, provider: "minimax", username: "u1" });
    expect(got).not.toBeNull();
    expect(got!.token).toBe("new-token");
    // 桌面凭据(kind=oauth)的 bearer 必须跟着换 —— 否则 /matrix/ 计费面仍 401。
    expect(got!.bearer).toBe("new-token");
    expect(rotate).toHaveBeenCalledTimes(1);
    const [pid, username, payload] = rotate.mock.calls[0];
    expect(pid).toBe("minimax");
    expect(username).toBe("u1");
    expect(payload.secret).toBe("new-token");
    expect(payload.refreshSecret).toBe("new-refresh");
    // 秒级:应在 [before+43200, now+43200] 区间内,绝不可能是毫秒。
    expect(payload.expiresAt).toBeGreaterThanOrEqual(before + 43200);
    expect(payload.expiresAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 43200 + 2);
  });

  it("并发续期只打一次上游(单飞)", async () => {
    resetMinimaxRenewInflight();
    refreshMock.mockReset();
    let resolveIt: ((v: unknown) => void) | null = null;
    refreshMock.mockImplementation(
      () => new Promise((r) => { resolveIt = r; }),
    );
    const { vault, rotate } = makeVault({});
    const deps = { vault, provider: "minimax", username: "u1" };
    const a = renewMinimaxAccount(ACCOUNT, deps);
    const b = renewMinimaxAccount(ACCOUNT, deps);
    // 第二个调用必须复用第一个的 Promise,而不是再走一遍 vault.get + refresh。
    // 注意 renewMinimaxAccount 的第一步是 `await vault.get(...)`,所以此刻上游
    // 还没被调用 —— 先让微任务队列跑干净再断言。"flush"
    await new Promise((r) => setTimeout(r, 0));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    resolveIt!({ accessToken: "t2", refreshToken: "r2", expiresInSec: 100 });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb); // 同一个 Promise 的结果
    expect(rotate).toHaveBeenCalledTimes(1);
  });

  it("上游拒绝续期:抛出带原因和重新授权指引的错误,不写库", async () => {
    resetMinimaxRenewInflight();
    refreshMock.mockReset();
    refreshMock.mockRejectedValue(
      new Error("minimax 续期被拒(HTTP 400): this refresh token can no longer be used, start a new authorization"),
    );
    const { vault, rotate } = makeVault({});
    await expect(
      renewMinimaxAccount(ACCOUNT, { vault, provider: "minimax", username: "u1" }),
    ).rejects.toThrow(/no longer be used.*重新授权|重新授权/s);
    expect(rotate).not.toHaveBeenCalled();
  });

  it("expiresInSec 缺失时不写 expiresAt(不瞎编到期)", async () => {
    resetMinimaxRenewInflight();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue({ accessToken: "t3", refreshToken: null, expiresInSec: null });
    const { vault, rotate } = makeVault({});
    await renewMinimaxAccount(ACCOUNT, { vault, provider: "minimax", username: "u1" });
    const payload = rotate.mock.calls[0][2];
    expect(payload.expiresAt).toBeUndefined();
  });
});

describe("minimaxAccountFor", () => {
  it("凭据不存在时返回 null", async () => {
    resetMinimaxRenewInflight();
    const { vault } = makeVault({});
    (vault.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await minimaxAccountFor(vault, "minimax", "u1")).toBeNull();
  });

  it("绑定 onAuthExpired:回调能真正续期", async () => {
    resetMinimaxRenewInflight();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue({ accessToken: "t4", refreshToken: "r4", expiresInSec: 60 });
    const { vault } = makeVault({});
    const bound = await minimaxAccountFor(vault, "minimax", "u1");
    expect(bound).not.toBeNull();
    expect(bound!.account.token).toBe("old-token");
    const renewed = await bound!.httpOptions.onAuthExpired(bound!.account);
    expect(renewed!.token).toBe("t4");
  });
});
