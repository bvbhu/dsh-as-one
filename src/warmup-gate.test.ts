/**
 * 额度预热门的口径测试。
 *
 * 钉四件事：**只刷一次**（并发共享）、**先刷后放行**（wait 不 resolve 就不许调度）、
 * **失败/超时都放行**（预热不是正确性前提）、结果可重复读。
 */

import { describe, expect, it, vi } from "vitest";

import { createWarmupGate } from "./warmup-gate.js";

/** 只收集 warn/info，不往 stdout 打。 */
const quiet = { warn: vi.fn(), info: vi.fn() };

describe("createWarmupGate", () => {
  it("首次 wait 触发刷新，成功则 ok=true", async () => {
    const refresh = vi.fn(async () => undefined);
    const gate = createWarmupGate({ refresh, logger: quiet });
    const out = await gate.wait();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(true);
    expect(out.timedOut).toBe(false);
    expect(out.error).toBeNull();
  });

  it("并发 wait 共享同一次刷新（不打 N 轮上游）", async () => {
    let calls = 0;
    const refresh = async (): Promise<void> => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
    };
    const gate = createWarmupGate({ refresh, logger: quiet });
    const [a, b, c] = await Promise.all([gate.wait(), gate.wait(), gate.wait()]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("wait 未 resolve 前不许调度（先刷后放行）", async () => {
    let release!: () => void;
    const refresh = (): Promise<void> => new Promise<void>((r) => (release = r));
    const gate = createWarmupGate({ refresh, logger: quiet });
    const pending = gate.wait();
    expect(gate.settled()).toBe(false);
    expect(gate.outcome()).toBeNull();
    release();
    const out = await pending;
    expect(out.ok).toBe(true);
    expect(gate.settled()).toBe(true);
    expect(gate.outcome()).toBe(out);
  });

  it("刷新抛错 → 放行，ok=false 且带原因", async () => {
    const refresh = async (): Promise<void> => {
      throw new Error("上游 502");
    };
    const gate = createWarmupGate({ refresh, logger: quiet });
    const out = await gate.wait();
    expect(out.ok).toBe(false);
    expect(out.timedOut).toBe(false);
    expect(out.error).toContain("上游 502");
  });

  it("超时 → 放行，timedOut=true", async () => {
    // 永不 resolve 的刷新 + 极短超时
    const refresh = (): Promise<void> => new Promise<void>(() => undefined);
    const gate = createWarmupGate({ refresh, logger: quiet, timeoutMs: 30 });
    const out = await gate.wait();
    expect(out.ok).toBe(false);
    expect(out.timedOut).toBe(true);
    expect(out.error).toContain("超时");
  });

  it("失败后再次 wait 不重试（结果稳定，不反复打上游）", async () => {
    const refresh = vi.fn(async () => {
      throw new Error("boom");
    });
    const gate = createWarmupGate({ refresh, logger: quiet });
    await gate.wait();
    const again = await gate.wait();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(again.ok).toBe(false);
  });

  it("elapsedMs 用注入时钟算（不依赖真实时间）", async () => {
    let t = 1000;
    const refresh = async (): Promise<void> => {
      t += 250;
    };
    const gate = createWarmupGate({ refresh, logger: quiet, now: () => t });
    const out = await gate.wait();
    expect(out.elapsedMs).toBe(250);
  });
});
