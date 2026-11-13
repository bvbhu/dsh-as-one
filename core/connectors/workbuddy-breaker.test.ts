/**
 * WorkBuddy 11140 彻底熔断(2026-11-07 用户定案)。
 *
 * 语义:命中上游 11140 → **物理删除**该 provider 全部凭据 + 持久化熔断标记;
 * 熔断期间网关在选路前就拒绝,任何请求都到不了上游。
 *
 * 为什么测这些:这是**账号安全**相关逻辑,漏一个分支就可能出现
 * 「熔断后仍有一个账号在打上游」—— 那正是上游警告的「换号连坐」。
 */
import { describe, expect, it } from "vitest";

import { MemoryCredentialBackend, CredentialVault } from "../config/credentials.js";
import {
  clearWorkbuddyBreaker,
  isWorkbuddyBanMessage,
  isWorkbuddyBreakerTripped,
  readWorkbuddyBreaker,
  tripWorkbuddyBreaker,
  WB_BAN_CODE,
} from "./workbuddy-breaker.js";

/** 最小 setting 表替身(只实现 get/set,与 NexusDatabase.setting 同形状)。 */
function fakeDb(): { setting: { get: (k: string) => { v: string } | undefined; set: (k: string, v: string) => void } } {
  const store = new Map<string, string>();
  return {
    setting: {
      get: (k) => (store.has(k) ? { v: store.get(k)! } : undefined),
      set: (k, v) => {
        store.set(k, v);
      },
    },
  };
}

async function vaultWith(usernames: string[]): Promise<CredentialVault> {
  const backend = new MemoryCredentialBackend();
  const vault = new CredentialVault(backend);
  for (const u of usernames) {
    await vault.put({ provider: "workbuddy", username: u, secret: `tok-${u}` });
  }
  return vault;
}

describe("isWorkbuddyBanMessage", () => {
  it("识别 classify_workbuddy_error 产出的 11140 文案", () => {
    expect(
      isWorkbuddyBanMessage(
        "账号存在异常行为,已被限制使用(code 11140):device restricted",
      ),
    ).toBe(true);
  });

  it("不误伤其它错误码", () => {
    expect(isWorkbuddyBanMessage("渠道校验拦截(code 11128)")).toBe(false);
    expect(isWorkbuddyBanMessage("认证失败")).toBe(false);
    expect(isWorkbuddyBanMessage("")).toBe(false);
  });

  it("常量与上游码一致", () => {
    expect(WB_BAN_CODE).toBe(11140);
  });
});

describe("tripWorkbuddyBreaker", () => {
  it("物理删除全部凭据并写持久化标记", async () => {
    const db = fakeDb();
    const vault = await vaultWith(["a", "b", "c"]);

    expect(isWorkbuddyBreakerTripped(db as never)).toBe(false);
    const r = await tripWorkbuddyBreaker(db as never, vault, "workbuddy", "code 11140 测试");

    expect(r.removedAccounts).toBe(3);
    expect(r.failedAccounts).toEqual([]);
    // 关键:库里真的一个都不剩(物理删除,不是停用)
    expect(await vault.list("workbuddy")).toEqual([]);
    // 标记持久化
    expect(isWorkbuddyBreakerTripped(db as never)).toBe(true);
    const state = readWorkbuddyBreaker(db as never);
    expect(state?.removedAccounts).toBe(3);
    expect(state?.reason).toContain("11140");
    expect(state?.trippedAtMs).toBeGreaterThan(0);
  });

  it("幂等:重复触发不报错,标记更新为最新原因", async () => {
    const db = fakeDb();
    const vault = await vaultWith(["a"]);
    await tripWorkbuddyBreaker(db as never, vault, "workbuddy", "第一次");
    const r2 = await tripWorkbuddyBreaker(db as never, vault, "workbuddy", "第二次");
    expect(r2.removedAccounts).toBe(0); // 已经删光了
    expect(readWorkbuddyBreaker(db as never)?.reason).toBe("第二次");
  });

  it("无凭据时也能熔断(只写标记)", async () => {
    const db = fakeDb();
    const vault = await vaultWith([]);
    const r = await tripWorkbuddyBreaker(db as never, vault, "workbuddy", "空池");
    expect(r.removedAccounts).toBe(0);
    expect(isWorkbuddyBreakerTripped(db as never)).toBe(true);
  });
});

describe("clearWorkbuddyBreaker", () => {
  it("清除标记后可再次使用(但凭据仍需重新导入)", async () => {
    const db = fakeDb();
    const vault = await vaultWith(["a"]);
    await tripWorkbuddyBreaker(db as never, vault, "workbuddy", "触发");

    expect(clearWorkbuddyBreaker(db as never)).toBe(true);
    expect(isWorkbuddyBreakerTripped(db as never)).toBe(false);
    // 凭据不会因为清标记而回来 —— 这是刻意的
    expect(await vault.list("workbuddy")).toEqual([]);
    // 重复清除返回 false(没熔断)
    expect(clearWorkbuddyBreaker(db as never)).toBe(false);
  });
});

describe("坏值容错", () => {
  it("setting 里是坏 JSON → 视为未熔断(不能把渠道永久锁死)", () => {
    const db = fakeDb();
    db.setting.set("provider.workbuddy.breaker", "{not json");
    expect(isWorkbuddyBreakerTripped(db as never)).toBe(false);
  });

  it("空字符串 = 未熔断(clear 后的状态)", () => {
    const db = fakeDb();
    db.setting.set("provider.workbuddy.breaker", "");
    expect(isWorkbuddyBreakerTripped(db as never)).toBe(false);
  });
});
