/**
 * 回归：**DSH 的对话请求走进程内 adapter，不经过 HTTP 路由**。
 *
 * 真实故障（2026-11-16 二次复现）：`routes.ts` 里那句 `await awaitWarmup()` 只对
 * 外部 `/v1/*` 调用方有效。DSH 宿主通过 `ctx.inject(["llm"])` 注册本 adapter 后，
 * 对话请求是**进程内** `adapter.stream()` → `rt.resolveUpstream()`，压根不经过
 * HTTP 路由 —— 所以预热从未在用户真正走的路径上执行：
 *
 * - 23:02 重启后，请求日志里首个 `deepseek-flash` 仍落到 `trae`；
 * - `getSchedulerPlan` 显示 `quota_keys` 数量为 **0**（额度表全空）；
 * - 进程内预热的诊断日志一条都没写（refresh 从未被调用）。
 *
 * 修法：把 warmup 也注入 adapter，并在 `stream()` 的 `resolveUpstream()` **之前**
 * await。本用例用假 rt 断言「先等待、后选路」的**顺序**，以及门抛错时不阻断请求。
 */

import { describe, expect, it, vi } from "vitest";

import { AsOneLlmAdapter } from "../src/llm-adapter.js";

/** 最小可用的假 runtime：记录 resolveUpstream 被调用的时刻。 */
function makeRt(events: string[]) {
  return {
    async listModels() {
      return [];
    },
    resolveUpstream() {
      events.push("resolveUpstream");
      // 返回 undefined 会让 adapter 抛「未知模型」，这里用一个最小 Upstream 桩。
      return {
        async *stream() {
          yield { type: "finish", reason: { kind: "stop" } } as never;
        },
      } as never;
    },
    onRequestDone() {
      /* noop */
    },
  } as never;
}

describe("adapter.stream 必须先在预热门放行后才选路", () => {
  it("warmup 未完成时 resolveUpstream 不得被调用（顺序断言）", async () => {
    const events: string[] = [];
    let releaseWarmup!: () => void;
    const warmupDone = new Promise<void>((resolve) => {
      releaseWarmup = resolve;
    });

    const adapter = new AsOneLlmAdapter(makeRt(events), {
      warmup: {
        async wait() {
          events.push("warmup.wait 开始");
          await warmupDone;
          events.push("warmup.wait 结束");
          return { ok: true, timedOut: false, elapsedMs: 0, error: null, reason: "startup" };
        },
      },
    });

    const iter = adapter.stream({
      model: "deepseek-flash",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    } as never);

    // 推进一帧：此时必须卡在预热里，尚未选路。
    const first = iter.next();
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toContain("warmup.wait 开始");
    expect(events).not.toContain("resolveUpstream");

    // 放行预热 → 这时才允许 resolveUpstream。
    releaseWarmup();
    await first.catch(() => undefined);
    expect(events).toContain("resolveUpstream");

    // 顺序必须是「预热结束」在「选路」之前。
    expect(events.indexOf("warmup.wait 结束")).toBeLessThan(events.indexOf("resolveUpstream"));
  });

  it("门抛错时放行请求（预热是优化，不是可用性前提）", async () => {
    const events: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const adapter = new AsOneLlmAdapter(makeRt(events), {
      warmup: {
        async wait() {
          throw new Error("探针全挂");
        },
      },
    });

    const iter = adapter.stream({
      model: "deepseek-flash",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    } as never);
    await iter.next().catch(() => undefined);

    // 预热抛错不影响选路继续。
    expect(events).toContain("resolveUpstream");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("没有注入 warmup 时行为不变（老部署/测试不受影响）", async () => {
    const events: string[] = [];
    const adapter = new AsOneLlmAdapter(makeRt(events));
    const iter = adapter.stream({
      model: "deepseek-flash",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    } as never);
    await iter.next().catch(() => undefined);
    expect(events).toEqual(["resolveUpstream"]);
  });
});