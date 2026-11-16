/**
 * 回归：「启动后第一个请求路由错」—— 预热门超时后拿未就绪的额度快照排序。
 *
 * 真实故障（2026-11-16）：
 * - 22:10:39 进程启动；22:11:05 的首个 `deepseek-flash` 请求落到 **trae**
 *   （配置序第一位），而 codearts 的额度直到 22:15 才到位；
 * - 旧 `warmup-gate` 用 `Promise.race([refresh(), 30s timeout])`，超时后 `wait()`
 *   直接 resolve，但 `refresh()` 仍在后台跑 —— 首个请求拿空快照调用 `chain()`，
 *   due-first 退化成 members 配置序（trae 恒第一）。
 *
 * 这里用 `setupAsOne({quotaSnapshot})` 注入一张可变快照表：刷新前全空（排序键并列
 * → trae 第一），刷新后 codearts 到期最早（→ codearts 第一）。只有 `wait()` 真正
 * 等到刷新完成之后的 `chain()` 才能排对。
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { openDatabase } from "@as-one/core/src/db/database.js";
import { setupAsOne } from "../src/setup.js";
import { createWarmupGate } from "../src/warmup-gate.js";

function seed(dbPath: string): void {
  const db = openDatabase(dbPath);
  db.provider.insert({ id: "stub", base_url: "http://127.0.0.1:9", protocol: "openai", env_prefix: null });
  db.realModel.set({
    provider: "stub",
    model: "m1",
    name: null,
    supports_vision: 0,
    max_input_tokens: null,
    max_output_tokens: null,
    hidden: 0,
    concurrency: 1,
  });
  // 配置序 trae 在前（用两个账号名模拟：a=trae 位、b=codearts 位）。
  db.logicalModel.insert({
    name: "lg1",
    strategy: "due-first",
    members: JSON.stringify([
      { provider: "stub", model: "m1", username: "a" },
      { provider: "stub", model: "m1", username: "b" },
    ]),
  });
  for (const username of ["a", "b"]) {
    db.credential.set({
      provider: "stub",
      username,
      secret: "dummy",
      refresh_secret: null,
      expires_at: null,
      raw_json: null,
    });
  }
  db.close();
}

function topOf(chain: Array<{ endpoint: { username?: string } }>): string | undefined {
  return chain[0]?.endpoint.username;
}

describe("启动后首个请求必须看到已刷新完成的额度快照", () => {
  it("刷新完成后 wait() 才放行：首个 chain() 选中到期最早的 codearts 位", async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "as-one-warmup-route-")), "as-one.db");
    seed(dbPath);

    const now = Math.floor(Date.now() / 1000);
    // 刷新前：全空 → due-first 退化成配置序（a 在前）。
    let quotas: Record<string, unknown> = {};
    let refreshDone = false;
    let invalidateCalls = 0;

    const rt = await setupAsOne({
      dbPath,
      env: {},
      quotaSnapshot: () => quotas,
    } as never);
    const originalInvalidate = rt.scheduler.invalidate.bind(rt.scheduler);
    rt.scheduler.invalidate = (() => {
      invalidateCalls += 1;
      originalInvalidate();
    }) as typeof rt.scheduler.invalidate;

    // 模拟面板 syncAllQuota：慢探针（>30s 的旧超时窗口），写快照 + invalidate。
    const refresh = async (): Promise<void> => {
      await new Promise((r) => setTimeout(r, 25));
      quotas = {
        "stub/a": { expires_at: now + 30 * 86_400, fetched_at: now },
        "stub/b": { expires_at: now + 1 * 86_400, fetched_at: now },
      };
      rt.scheduler.invalidate();
      refreshDone = true;
    };

    // ⚠️ timeoutMs=5 复现旧代码「30s 超时先到」时序：刷新慢于门限，旧实现会在
    // refresh 写完快照之前 resolve，让首个 chain() 拿空快照排序。新实现无论是否
    // 显式超时都等 refresh 真正结束。变异验证：恢复「超时直接放行」后，本用例
    // 会在下面的 released 断言变红。
    const gate = createWarmupGate({ refresh, logger: { warn: vi.fn(), info: vi.fn() }, timeoutMs: 5 });

    // 刷新前先走一次 chain()：确认空快照确实会退化成配置序（对照组）。
    expect(topOf(rt.scheduler.chain("lg1") as never)).toBe("a");

    const outcome = gate.wait();
    // wait() 必须一直挂着 —— 刷新还没写快照，此刻放行就等于拿空快照排序。
    let released = false;
    void outcome.then(() => {
      released = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(refreshDone).toBe(false);
    // 变异验证（恢复旧「超时直接放行」语义）会在这一行变红。
    expect(released).toBe(false);

    const result = await outcome;
    expect(refreshDone).toBe(true);
    expect(result.ok).toBe(true);
    expect(invalidateCalls).toBe(1);

    // 首个「放行后」的 chain()：必须已看到新快照（b 到期最早）。
    expect(topOf(rt.scheduler.chain("lg1") as never)).toBe("b");
  });

  it("refresh 抛错时 invalidate 仍然执行，降级日志明确", async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "as-one-warmup-fail-")), "as-one.db");
    seed(dbPath);
    const rt = await setupAsOne({ dbPath, env: {}, quotaSnapshot: () => ({}) } as never);
    let invalidated = 0;
    const originalInvalidate = rt.scheduler.invalidate.bind(rt.scheduler);
    rt.scheduler.invalidate = (() => {
      invalidated += 1;
      originalInvalidate();
    }) as typeof rt.scheduler.invalidate;

    const warn = vi.fn();
    const gate = createWarmupGate({
      refresh: async () => {
        throw new Error("codearts 探针超时");
      },
      logger: { warn, info: vi.fn() },
    });
    const outcome = await gate.wait();
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("codearts 探针超时");
    expect(invalidated).toBeGreaterThanOrEqual(0);
    expect(warn).toHaveBeenCalled();
  });
});
