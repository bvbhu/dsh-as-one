/**
 * 账号级出站节流单测(`AccountThrottle`)。
 *
 * 断言的是**行为契约**,不是实现:
 * - 同一账号两次发送之间至少隔 `ACCOUNT_MIN_INTERVAL_MS`;
 * - 不同账号互不牵连;
 * - 并发预留会**排队**(第 N 路等 N×interval),不是大家等完一起打;
 * - 等待可被 abort 打断(客户端断开/抢占不能让请求卡在睡眠里)。
 *
 * ⚠️ 2026-11-09:间隔**写死**为模块常量(用户定案「写死在 wb 连接器中,不作为
 * 可设置项」),所以这里不再有「改设置立刻生效」「interval<=0 关掉」这类用例 ——
 * 那两条契约**随设置项一起删掉了**。取而代之的是一条硬断言:常量就是 4 秒。
 */

import { describe, expect, it } from "vitest";
import {
  ACCOUNT_INTERVAL_JITTER_MS,
  ACCOUNT_MIN_INTERVAL_MS,
  AccountThrottle,
  accountThrottleKey,
  sleepWithSignal,
} from "./account-throttle.js";

/** 可控时钟 + 记录睡眠的探针(抖动恒为 0,便于精确断言)。 */
function harness() {
  let nowMs = 1_000_000;
  const slept: number[] = [];
  const throttle = new AccountThrottle({
    now: () => nowMs,
    sleep: async (ms) => {
      slept.push(ms);
      nowMs += ms;
    },
    // 抖动关掉:断言精确值(抖动是「只加不减」的额外延迟,单测里不需要)。
    jitterMsOf: () => 0,
    rng: { random: () => 0, uniform: (a) => a, shuffle: () => {} },
  });
  return {
    throttle,
    slept,
    get now() {
      return nowMs;
    },
    advance(ms: number) {
      nowMs += ms;
    },
  };
}

describe("间隔常量(写死,不是设置项)", () => {
  it("最小间隔是 4 秒、抖动是它的 25%", () => {
    // 这两个数是**账号安全下限**,不是使用偏好 —— 用户 2026-11-09 定案写死。
    expect(ACCOUNT_MIN_INTERVAL_MS).toBe(4_000);
    expect(ACCOUNT_INTERVAL_JITTER_MS).toBe(1_000);
  });
});

describe("AccountThrottle.reserve", () => {
  it("同一账号:第一次立刻可发,第二次要等满一个间隔", () => {
    const h = harness();
    const key = accountThrottleKey("workbuddy", "a");
    expect(h.throttle.reserve(key)).toBe(0);
    expect(h.throttle.reserve(key)).toBe(ACCOUNT_MIN_INTERVAL_MS);
    // 第三次再推一个间隔(排队语义,不是「上次之后」)
    expect(h.throttle.reserve(key)).toBe(ACCOUNT_MIN_INTERVAL_MS * 2);
  });

  it("不同账号互不牵连", () => {
    const h = harness();
    expect(h.throttle.reserve(accountThrottleKey("workbuddy", "a"))).toBe(0);
    expect(h.throttle.reserve(accountThrottleKey("workbuddy", "b"))).toBe(0);
    expect(h.throttle.reserve(accountThrottleKey("trae", "a"))).toBe(0);
  });

  it("已经空闲足够久 → 立刻可发(不累积欠账)", () => {
    const h = harness();
    const key = accountThrottleKey("workbuddy", "a");
    h.throttle.reserve(key);
    h.advance(ACCOUNT_MIN_INTERVAL_MS + 1);
    expect(h.throttle.reserve(key)).toBe(0);
  });

  it("并发多路:第 N 路要等 (N-1) 个间隔(摊成等间隔,不一起打)", () => {
    const h = harness();
    const key = accountThrottleKey("workbuddy", "a");
    expect(h.throttle.reserve(key)).toBe(0);
    expect(h.throttle.reserve(key)).toBe(ACCOUNT_MIN_INTERVAL_MS);
    expect(h.throttle.reserve(key)).toBe(ACCOUNT_MIN_INTERVAL_MS * 2);
    expect(h.throttle.reserve(key)).toBe(ACCOUNT_MIN_INTERVAL_MS * 3);
  });

  it("抖动只加不减:开了抖动后等待不会小于基准间隔", () => {
    const throttle = new AccountThrottle({
      now: () => 0,
      jitterMsOf: () => ACCOUNT_INTERVAL_JITTER_MS,
      // random 给满 1 → 抖动吃满上限
      rng: { random: () => 1, uniform: (a) => a, shuffle: () => {} },
    });
    const key = accountThrottleKey("workbuddy", "a");
    expect(throttle.reserve(key)).toBe(0);
    expect(throttle.reserve(key)).toBe(ACCOUNT_MIN_INTERVAL_MS + ACCOUNT_INTERVAL_JITTER_MS);
  });
});

describe("AccountThrottle.acquire / reset / size", () => {
  it("acquire 会真的等那么久(睡眠被调用)", async () => {
    const h = harness();
    const key = accountThrottleKey("workbuddy", "a");
    await h.throttle.acquire(key);
    const waited = await h.throttle.acquire(key);
    expect(waited).toBe(ACCOUNT_MIN_INTERVAL_MS);
    expect(h.slept).toEqual([ACCOUNT_MIN_INTERVAL_MS]);
  });

  it("reset 清空后立刻可发", () => {
    const h = harness();
    const key = accountThrottleKey("workbuddy", "a");
    h.throttle.reserve(key);
    h.throttle.reserve(key);
    expect(h.throttle.size).toBe(1);
    h.throttle.reset(key);
    expect(h.throttle.size).toBe(0);
    expect(h.throttle.reserve(key)).toBe(0);
  });

  it("等待可被 abort 打断(不把请求卡在睡眠里)", async () => {
    // ⚠️ 这条必须用**真实 sleep**(harness 的假 sleep 是同步推进时钟的,
    // 不会响应 abort 信号 —— 用它测 abort 等于测了个空)。
    const throttle = new AccountThrottle({ now: () => 0, jitterMsOf: () => 0 });
    const key = accountThrottleKey("workbuddy", "a");
    throttle.reserve(key);
    const ac = new AbortController();
    ac.abort();
    await expect(throttle.acquire(key, ac.signal)).rejects.toThrow();
  });
});

describe("sleepWithSignal", () => {
  it("已经 abort 的信号立刻抛错,不真的睡", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(sleepWithSignal(60_000, ac.signal)).rejects.toThrow();
  });
});
