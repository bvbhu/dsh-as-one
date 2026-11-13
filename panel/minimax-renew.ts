/**
 * minimax 凭据的**自动续期**(2026-11-07 用户报「凭据可能已过期」后加)。
 *
 * ## 为什么需要
 *
 * minimax 的 access token 寿命很短(实测 `expires_in` 43200 秒 = 12 小时,
 * 首次登录时甚至是 3600 秒),而 `refresh_token` 长期有效。以前 401 直接抛错,
 * 用户必须手动点刷新 —— 面板上就显示成「签到查询失败 / 未采集」。
 *
 * ## 做法
 *
 * 网络层(`minimax-signin.ts` / `collector/quota.ts`)在 401/403 时调用
 * `onAuthExpired` 回调;本模块提供那个回调的实现:
 *   1. 读凭据的 `refresh_secret`;
 *   2. 调 `minimaxRefreshToken` 换新 token(上游会轮换 refresh_token);
 *   3. **写回库**(`vault.rotate`:secret + refreshSecret + expiresAt 秒);
 *   4. 返回带新 token 的账号供网络层重试。
 *
 * ## 并发
 *
 * 同一账号可能被多个面板方法同时读(签到总览 / 渠道卡头 / 额度探针)。
 * 并发续期会让上游把同一个 refresh_token 用两次 —— 第二次可能被判重放。
 * 所以这里用**单飞表**按 `provider/username` 合并并发请求。
 */

import type { CredentialVault } from "@as-one/core/src/config/credentials.js";
import { CheckinError } from "@as-one/core/src/connectors/checkin.js";
import {
  minimaxAccountOf,
  minimaxRefreshToken,
  type MinimaxAccount,
} from "@as-one/core/src/connectors/minimax-signin.js";

/** 续期成功后把新 token 写回库。 */
export interface MinimaxRenewDeps {
  vault: CredentialVault;
  /** 该账号在库里的 provider(通常就是 "minimax")。 */
  provider: string;
  /** 该账号的 username(credential 表主键之一)。 */
  username: string;
}

/** 单飞表:`provider/username` → 进行中的续期 Promise。 */
const inflight = new Map<string, Promise<MinimaxAccount | null>>();

/**
 * 用 refresh_token 续期并写回库。
 *
 * @returns 带新 token 的账号(可直接重试);`null` = 库里根本没有 refresh_token
 * @throws 上游拒绝续期 / 网络失败 / 写库失败时抛 {@link CheckinError},消息里带
 *         上游原因;网络层会把它接进最终 401 文案,不再静默吞掉(2026-11-08)。
 */
export async function renewMinimaxAccount(
  account: MinimaxAccount,
  deps: MinimaxRenewDeps,
): Promise<MinimaxAccount | null> {
  const key = `${deps.provider}/${deps.username}`;
  const running = inflight.get(key);
  if (running !== undefined) return running;

  const run = (async (): Promise<MinimaxAccount | null> => {
    const stored = await deps.vault.get(deps.provider, deps.username).catch(() => null);
    const refreshToken = stored?.refreshSecret ?? "";
    if (!refreshToken) return null; // 无 refresh_token:不重试,按原 401 报错

    let res;
    try {
      res = await minimaxRefreshToken({
        refreshToken,
        region: account.region === "global" ? "global" : "cn",
      });
    } catch (err) {
      // 2026-11-08:上游的 `invalid_grant / this refresh token can no longer be used`
      // 是**确定答案**(refresh_token 已作废,常见于被诊断脚本消耗过或在别处重新登录),
      // 重试无意义。以前这里 return null,错误在两层 catch 里被吞成
      // 「已尝试自动续期,仍失败」—— 用户完全看不出要做的是重新授权。
      // 现在把上游原因 + 可操作指引抛给网络层,由它接进最终 401 文案。
      const detail = err instanceof Error ? err.message : String(err);
      const revoked = /invalid_grant|no longer be used|invalid.?refresh|expired/i.test(detail);
      throw new CheckinError(
        `minimax 自动续期失败: ${detail} —— ` +
          (revoked
            ? "该账号的 refresh_token 已作废,需重新授权:node scripts/minimax-device-login.mjs"
            : "请检查网络后重试(若持续失败,同样需要重新授权)"),
      );
    }

    // 写回库:expiresAt 单位是**秒**(vault 契约)。
    await deps.vault.rotate(deps.provider, deps.username, {
      secret: res.accessToken,
      refreshSecret: res.refreshToken ?? undefined,
      expiresAt:
        res.expiresInSec !== null && Number.isFinite(res.expiresInSec)
          ? Math.floor(Date.now() / 1000) + res.expiresInSec
          : undefined,
    });

    // 用新 token 重建账号:桌面凭据(kind=oauth)时 bearer 也要跟着换。
    const merged: MinimaxAccount = {
      ...account,
      token: res.accessToken,
      bearer: account.bearer ? res.accessToken : null,
    };
    return merged;
  })().finally(() => inflight.delete(key));

  inflight.set(key, run);
  return run;
}

/**
 * 从库里的凭据构造账号 + 绑定自动续期回调 —— 面板各处读 minimax 时用这个,
 * 免得每处都手写一遍 onAuthExpired。
 *
 * @returns `{ account, httpOptions }`,直接展开给网络层
 */
export async function minimaxAccountFor(
  vault: CredentialVault,
  provider: string,
  username: string,
): Promise<{
  account: MinimaxAccount;
  httpOptions: {
    onAuthExpired: (acct: MinimaxAccount) => Promise<MinimaxAccount | null>;
  };
} | null> {
  const stored = await vault.get(provider, username).catch(() => null);
  if (stored === null) return null;
  const token = await vault.secret(provider, username).catch(() => null);
  if (!token) return null;
  const raw = stored.raw ?? {};
  const account = minimaxAccountOf({
    token,
    region: raw["region"] == null ? null : String(raw["region"]),
    extra: raw,
  });
  return {
    account,
    httpOptions: {
      onAuthExpired: (acct) => renewMinimaxAccount(acct, { vault, provider, username }),
    },
  };
}

/** 测试/诊断用:清空单飞表。 */
export function resetMinimaxRenewInflight(): void {
  inflight.clear();
}
