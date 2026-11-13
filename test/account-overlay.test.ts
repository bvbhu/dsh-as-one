/**
 * 账号启停覆盖的多实例语义(docs/multi-instance.md §2.2 的回归测试)。
 *
 * 老实现把覆盖存成整份 JSON `account.enabled`,每个实例启动读一次快照、之后整份写回:
 * A 实例停用账号 X,B 实例下一次拨动就用旧快照把 X 重新"启用"(丢更新),B 也永远
 * 看不到 A 的改动(陈旧读 = 安全向)。这里锁死新语义:
 *   - 写只碰 `account.enabled.<ref>` 这一个键;
 *   - 读数前按 `PRAGMA data_version` 判断别的连接是否提交过,提交过就重读;
 *   - 旧版整份 JSON 被吸收成逐键行后删除,不留两个真源。
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@as-one/core/src/db/database.js";
import { setupAsOne } from "../src/setup.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "as-one-overlay-"));
}

/** 播种一个 provider + 账号 + 一条最小可用的逻辑模型(不发网络请求)。 */
function seedAccount(dbPath: string, username: string): void {
  const db = openDatabase(dbPath);
  if (!db.provider.get("stub")) {
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
  }
  db.credential.set({ provider: "stub", username, secret: "dummy", refresh_secret: null, expires_at: null, raw_json: null });
  db.close();
}

describe("账号启停覆盖(多实例)", () => {
  it("A 停用账号后 B 立刻看得到,且 B 的拨动不会覆盖 A 的改动", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    seedAccount(dbPath, "u1");
    seedAccount(dbPath, "u2");

    // 两个运行时 = 两条独立连接 = 两个实例共用一个库。
    const a = await setupAsOne({ dbPath, env: {} });
    const b = await setupAsOne({ dbPath, env: {} });
    expect(b.scheduler.chain("lg1").length).toBe(2); // u1 + u2

    a.setAccountEnabled("stub/u1", false);
    // 陈旧读必须消失:B 没重启也要看到 A 的停用(调度链里只剩 u2)。
    expect(b.accountOverlay.get("stub/u1")).toBe(false);
    // force:绕开 B 自己的调度缓存(TTL 内的链是热前缀,不属于本次修复的范围)
    expect(b.scheduler.chain("lg1", { force: true }).length).toBe(1);

    // B 拨另一个账号:按旧实现这里会把 B 启动时的快照整份写回,
    // 顺手把 u1=true 复活;逐键之后 A 的改动必须还在。
    b.setAccountEnabled("stub/u2", false);
    const check = openDatabase(dbPath);
    expect(check.setting.get("account.enabled.stub/u1")?.v).toBe("0");
    expect(check.setting.get("account.enabled.stub/u2")?.v).toBe("0");
    // 旧版整份 JSON 键不再被写出来。
    expect(check.setting.get("account.enabled")).toBeUndefined();
    check.close();

    expect(a.accountOverlay.get("stub/u2")).toBe(false);
    expect(a.scheduler.chain("lg1", { force: true })).toEqual([]);

    a.dispose();
    b.dispose();
  });

  it("旧版整份 JSON 被吸收成逐键行并删除旧键", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    seedAccount(dbPath, "u1");
    const seed = openDatabase(dbPath);
    seed.setting.set("account.enabled", JSON.stringify({ "stub/u1": false, "other/x": true }));
    seed.close();

    const rt = await setupAsOne({ dbPath, env: {} });
    expect(rt.accountOverlay.get("stub/u1")).toBe(false);
    expect(rt.accountOverlay.get("other/x")).toBe(true);

    const check = openDatabase(dbPath);
    expect(check.setting.get("account.enabled")).toBeUndefined();
    expect(check.setting.get("account.enabled.stub/u1")?.v).toBe("0");
    expect(check.setting.get("account.enabled.other/x")?.v).toBe("1");
    check.close();
    rt.dispose();
  });

  it("吸收旧 JSON 时不许盖掉已存在的逐键值(逐键为准)", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    const seed = openDatabase(dbPath);
    seed.setting.set("account.enabled.stub/u1", "0"); // 新写入的停用
    seed.setting.set("account.enabled", JSON.stringify({ "stub/u1": true })); // 旧实例的陈旧快照
    seed.close();

    const rt = await setupAsOne({ dbPath, env: {} });
    expect(rt.accountOverlay.get("stub/u1")).toBe(false);
    rt.dispose();
  });

  it("delete 覆盖 = 连库一起删(不是只删内存)", async () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    seedAccount(dbPath, "u1");

    const rt = await setupAsOne({ dbPath, env: {} });
    rt.setAccountEnabled("stub/u1", false);
    expect(rt.accountOverlay.delete("stub/u1")).toBe(true);

    const check = openDatabase(dbPath);
    expect(check.setting.get("account.enabled.stub/u1")).toBeUndefined();
    check.close();

    // 重启后仍是「无覆盖」,不会有一条指向已删账号的孤儿覆盖。
    const again = await setupAsOne({ dbPath, env: {} });
    expect(again.accountOverlay.has("stub/u1")).toBe(false);
    again.dispose();
    rt.dispose();
  });

  it("data_version 只反映别的连接提交", () => {
    const dbPath = join(makeTmpDir(), "as-one.db");
    const a = openDatabase(dbPath);
    const b = openDatabase(dbPath);

    const before = a.dataVersion();
    a.setting.set("k1", "1"); // 自己的提交不改自己的 data_version
    expect(a.dataVersion()).toBe(before);

    b.setting.set("k2", "2"); // 别人的提交 → 变
    expect(a.dataVersion()).not.toBe(before);

    a.close();
    b.close();
  });
});
