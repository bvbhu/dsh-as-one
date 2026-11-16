/**
 * **账号层** due-first 排序（2026-11-16 用户报「路由仍然不对」的回归测试）。
 *
 * 故障现场：trae 有 `bvbhu`（额度 12/11 到期）和 `用户2767`（12/8 到期），
 * 额度快照里两条都在，但日志显示请求恒定走 `bvbhu`。
 *
 * 根因不是「没数据」，而是**排序只作用到 member 层**：
 * - `engine._expiryMap` 按 `provider/model` 聚合，同 member 的多账号里取最早那个
 *   到期时间 —— 对 `trae/deepseek-v4.1-flash` 这个 member 来说，12/8 就是它的
 *   排序键（正确）；
 * - 但真正选**哪个账号**是在 router 里按 `endpoint_chain` 的行序取第一个，
 *   而行序原来就是凭据插入序 → `bvbhu` 永远第一。
 *
 * 修法：`#rowsFor` 展开行之后按**账号自己的到期时间升序**排（未知排末位）。
 * 这份测试钉住它，防止以后有人「顺手」把 sort 去掉。
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@as-one/core/src/db/database.js";
import { setupAsOne } from "../src/setup.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "as-one-acct-order-"));
}

/** 播种 provider + 两个账号 + 一条逻辑模型；不发任何网络请求。 */
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
  // 插入序：late 先、early 后 —— 故意让「凭据序」与「到期序」相反。
  for (const username of ["late", "early"]) {
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

/** 造一份额度快照：early 先到期，late 后到期。 */
function quotas() {
  const now = Math.floor(Date.now() / 1000);
  return {
    "stub/early": { expires_at: now + 1 * 86_400, fetched_at: now },
    "stub/late": { expires_at: now + 30 * 86_400, fetched_at: now },
  };
}

describe("账号层 due-first 排序", () => {
  it("同一 member 内，先到期的账号排在前（与凭据插入序相反）", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    seed(dbPath);

    const rt = await setupAsOne({
      dbPath,
      env: {},
      // 额度快照注入：调度器与 repo 都从这里读。
      quotaSnapshot: quotas,
    } as never);

    const chain = rt.scheduler.chain("lg1");
    expect(chain.length).toBe(2);
    // 决定性断言：early 在前（插入序是 late 在前）
    expect(chain[0]!.endpoint.username).toBe("early");
    expect(chain[1]!.endpoint.username).toBe("late");
  });

  it("没有额度数据时退回凭据序（不改变无额度渠道的行为）", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    seed(dbPath);

    const rt = await setupAsOne({ dbPath, env: {}, quotaSnapshot: () => ({}) } as never);
    const chain = rt.scheduler.chain("lg1");
    // 无额度数据 → 所有账号的排序键都是 Infinity → 保持 `listAccounts()` 的顺序。
    // ⚠️ 那个顺序**不是插入序**（`late` 先插入），而是按用户名排的（`early` 在前）
    // —— 这正是「凭据序」的真实含义，也是修复前 trae 恒定先选 `bvbhu` 的原因：
    // `bvbhu` 恰好字典序在 `用户2767` 之前。
    expect(chain.map((c) => c.endpoint.username)).toEqual(["early", "late"]);
  });

  it("只有部分账号有到期数据：有数据的在前，未知的排末位", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    seed(dbPath);

    const now = Math.floor(Date.now() / 1000);
    const rt = await setupAsOne({
      dbPath,
      env: {},
      // 只给 late 数据（30 天后）—— early 未知，必须排到它后面。
      // ⚠️ 这一条正是「未知不是永不过期」的口径：没有数据的账号不该抢在有数据的
      // 前面（否则永远不过期的号会先把额度用光，快过期的烂在池里）。
      quotaSnapshot: () => ({ "stub/late": { expires_at: now + 30 * 86_400, fetched_at: now } }),
    } as never);

    const chain = rt.scheduler.chain("lg1");
    expect(chain[0]!.endpoint.username).toBe("late");
    expect(chain[1]!.endpoint.username).toBe("early");
  });
});
