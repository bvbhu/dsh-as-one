/**
 * 额度缓存 TTL 的口径测试（2026-11-16「due-first 一直失效」的回归）。
 *
 * 故障链（真实发生）：
 * 1. 进程刚启动，`chQuotaCache` 还是空的；
 * 2. 第一个请求触发 `chain()` → `_quotaMap()` 读到空表，把「空」连同**当前时刻**
 *    一起固化进 `_quotas` / `_quotasAt`；
 * 3. 之后 300 秒内 `chain()` 都判定「额度新鲜」，继续复用它 —— 到期排序键全空，
 *    due-first 退化成 members 配置序（trae 恒第一）；
 * 4. 面板刷完额度调 `invalidate()` 清了 `_quotas`，但 `_quotasAt` 若不同时归零，
 *    下一轮又是「空表 + 新时间戳」= 新鲜，bug 复现。
 *
 * 结论：**空表永远不算新鲜**；`invalidate()` 必须把时间戳一起归零。
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@as-one/core/src/db/database.js";
import { setupAsOne } from "../src/setup.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "as-one-quota-ttl-"));
}

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
  db.logicalModel.insert({
    name: "lg1",
    strategy: "due-first",
    members: JSON.stringify([{ provider: "stub", model: "m1" }]),
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

describe("额度缓存：空表不缓存（due-first 修复）", () => {
  it("先空后有时，第二次调度立刻用上新额度（不等 TTL 过期）", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    seed(dbPath);

    const now = Math.floor(Date.now() / 1000);
    // 可变的数据源：第一次空，之后有值 —— 模拟「调度先跑、额度后到」。
    let quotas: Record<string, unknown> = {};
    const rt = await setupAsOne({
      dbPath,
      env: {},
      quotaSnapshot: () => quotas,
    } as never);

    // 第 1 次：空表 → 两个账号都「到期未知」，保持凭据序（a, b）
    const first = rt.scheduler.chain("lg1");
    expect(first.map((c) => c.endpoint.username)).toEqual(["a", "b"]);

    // 额度到账：b 先到期
    quotas = {
      "stub/a": { expires_at: now + 30 * 86_400, fetched_at: now },
      "stub/b": { expires_at: now + 1 * 86_400, fetched_at: now },
    };

    // 第 2 次：**同一分钟内**也必须立刻排成 (b, a)。
    //
    // ⚠️ 两个坑都踩过：
    // 1. `chain()` 还有一层**按分钟**的 `_cache` 记忆化 —— 同一分钟的第二次调用
    //    根本走不到 `_quotaMap()`，测不到 TTL 逻辑。所以传 `force` 绕过它。
    // 2. 不能调 `invalidate()`：它会把 `_quotasAt` 归零，正好绕过「空表被当新鲜」
    //    那条 bug 路径（变异验证确认过：调了就抓不到）。
    const second = rt.scheduler.chain("lg1", { force: true });
    expect(second.map((c) => c.endpoint.username)).toEqual(["b", "a"]);
  });

  it("invalidate() 之后即使数据源变空，也不会把空表当成新鲜", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    seed(dbPath);

    const now = Math.floor(Date.now() / 1000);
    let quotas: Record<string, unknown> = {
      "stub/a": { expires_at: now + 30 * 86_400, fetched_at: now },
      "stub/b": { expires_at: now + 1 * 86_400, fetched_at: now },
    };
    const rt = await setupAsOne({
      dbPath,
      env: {},
      quotaSnapshot: () => quotas,
    } as never);

    expect(rt.scheduler.chain("lg1").map((c) => c.endpoint.username)).toEqual(["b", "a"]);

    // 数据源清了 + invalidate：下一次必须重新读，而不是拿旧快照
    quotas = {};
    rt.scheduler.invalidate();
    const after = rt.scheduler.chain("lg1");
    expect(after.map((c) => c.endpoint.username)).toEqual(["a", "b"]);
  });

  /**
   * 2026-11-16「启动后首个请求没读到到期时间就路由」的直接回归。
   *
   * 与上面两条的区别：这里**不传 force**，专打 `_plan()` 的按分钟缓存
   * （`_cache`）。旧实现里 `_quotaMap` 会给空表盖上新鲜时间戳，于是
   * `_plan` 的 `quotaFresh` 判定为真 → 「到期全 null」的排序被缓存 300s，
   * 额度到账后同分钟内依旧走旧序。
   */
  it("空快照排出来的顺序不进 _cache：额度到账后同分钟内立刻生效（不传 force）", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    seed(dbPath);

    const now = Math.floor(Date.now() / 1000);
    let quotas: Record<string, unknown> = {};
    const rt = await setupAsOne({
      dbPath,
      env: {},
      quotaSnapshot: () => quotas,
    } as never);

    // 第 1 次：空快照 → 凭据序 (a, b)，且**不该**被记忆化
    expect(rt.scheduler.chain("lg1").map((c) => c.endpoint.username)).toEqual(["a", "b"]);

    quotas = {
      "stub/a": { expires_at: now + 30 * 86_400, fetched_at: now },
      "stub/b": { expires_at: now + 1 * 86_400, fetched_at: now },
    };

    // 第 2 次：同一分钟内、**不传 force** —— 必须立刻排成 (b, a)。
    // 若空快照被缓存，这里会拿到旧的 (a, b) 而失败。
    expect(rt.scheduler.chain("lg1").map((c) => c.endpoint.username)).toEqual(["b", "a"]);
  });
});
