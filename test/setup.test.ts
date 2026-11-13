/**
 * 冒烟测试:setupAsOne 纯函数在 tmp 目录建库 / 投影注册表 / 构造 Scheduler+Router。
 *
 * 不碰真实 DSH、不依赖真实上游 token:凭据表里放 dummy secret 即可
 * (测试只断言链构造,不发网络请求)。
 *
 * 存储语义(用户裁定 m28134 / m28051):**数据库是唯一真源**,JSON 退化为
 * 导入 / 导出格式。所以这里的夹具直接往表里播种,不再写 JSON 文件。
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "@as-one/core/src/db/database.js";
import { chQuotaTableForScheduler } from "@as-one/panel/src/index.js";
import { setupAsOne } from "../src/setup.js";
import { createPanelMethods } from "../src/panel-routes.js";
import { createPanelHost } from "../src/panel-host.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "as-one-plugin-"));
}

describe("setupAsOne", () => {
  it("在 tmp 目录建库、加载空配置、构造调度器与路由(不抛)", async () => {
    const dir = makeTmpDir();
    const rt = await setupAsOne({
      dbPath: join(dir, "as-one.db"),
      env: {}, // 无 ONE_API_KEY → 网关放行(与 core EnvKeyProvider 语义一致)
    });

    // 空配置 → 空注册表
    expect(rt.registry.listProviders()).toEqual([]);
    expect(rt.registry.listLogicalModels()).toEqual([]);

    // 空配置 → 任何模型名都无链
    expect(rt.scheduler.chain("anything")).toEqual([]);

    // 路由计划对空配置返回空(all_blackout,item 为 null)
    const plan = rt.router.plan({ chain: [] });
    expect(plan.item).toBeNull();
    expect(plan.reason).toBe("all_blackout");

    // 模型列表为空
    expect(await rt.listModels()).toEqual([]);

    rt.dispose();
  });

  it("带 stub 提供方(表播种)+ dummy 凭据时能构造出链(不上网)", async () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, "as-one.db");

    // 直接把夹具写进表 —— 数据库是唯一真源,启动不再读 JSON。
    const seed = openDatabase(dbPath);
    seed.provider.insert({
      id: "stub",
      base_url: "http://127.0.0.1:9", // 绝不真正连接
      protocol: "openai",
      env_prefix: null,
    });
    seed.realModel.set({
      provider: "stub",
      model: "m1",
      name: null,
      supports_vision: 0,
      max_input_tokens: null,
      max_output_tokens: null,
      hidden: 0,
      concurrency: 1,
    });
    seed.logicalModel.insert({
      name: "lg1",
      strategy: "due-first",
      members: JSON.stringify([{ provider: "stub", model: "m1" }]),
    });
    seed.credential.set({
      provider: "stub",
      username: "u1",
      secret: "sk-dummy-not-real",
      refresh_secret: null,
      expires_at: null,
      raw_json: null,
    });
    seed.close();

    const rt = await setupAsOne({
      dbPath,
      env: {},
    });

    expect(rt.registry.listProviders()).toHaveLength(1);
    expect((await rt.listModels()).map((m) => m.id).sort()).toEqual(["lg1", "stub/m1"]);

    // 逻辑模型链:1 个成员 × 1 个启用账户 = 1 条端点
    const chain = rt.scheduler.chain("lg1");
    expect(chain).toHaveLength(1);
    expect(chain[0].endpoint.provider).toBe("stub");
    expect(chain[0].endpoint.username).toBe("u1");

    // 直连链(provider/model 语法)同样能解析
    const direct = rt.scheduler.chain("stub/m1");
    expect(direct).toHaveLength(1);
    expect(direct[0].endpoint.model).toBe("m1");

    // resolveUpstream 对未知模型返回 undefined
    expect(rt.resolveUpstream("nope")).toBeUndefined();

    // 面板数据面:listProviders 应含 stub 与账户(凭据存在),getStatus 就绪
    const panel = createPanelMethods(rt, { gatewayPort: 4000 });
    const providers = await panel.listProviders();
    const stub = providers.find((p) => p.provider === "stub");
    expect(stub).toBeDefined();
    expect(stub?.kind).toBe("endpoint"); // openai 协议 → endpoint
    expect(stub?.accounts).toHaveLength(1);
    expect(stub?.accounts[0]?.has_key).toBe(true); // dummy 凭据存在
    expect(stub?.accounts[0]?.key_fp).toBeTypeOf("string");
    expect(stub?.accounts[0]?.enabled).toBe(true);
    const status = await panel.getStatus();
    expect(status.ready).toBe(true);
    expect(status.providers.some((p) => p.provider === "stub")).toBe(true);

    // setAccountEnabled 写内存 overlay:停用后再查 enabled=false
    await panel.setAccountEnabled("stub", 0, false);
    const after = await panel.listProviders();
    expect(after.find((p) => p.provider === "stub")?.accounts[0]?.enabled).toBe(false);
    expect(rt.accountOverlay.get("stub/u1")).toBe(false);

    // getSettings 走共享契约(ONE_API_KEY 未设 → master_key 为 null;
    // 设置字段按 SETTING_FIELDS 播种,section 键为段名)
    const settings = await panel.getSettings();
    expect(settings.master_key).toBeNull();
    expect(settings.specs.length).toBeGreaterThan(0);
    expect(settings.sections.scheduler).toBeDefined();
    expect(settings.sections.scheduler["scheduler.pin_seconds"]).toBe("900");

    // 空数据 → 用量汇总为 zeroed totals(共享契约的 getUsageHistory;
    // 旧 client 的 getUsageSummary 别名在路由层映射到这个方法)
    const usage = await panel.getUsageHistory("all", "day", "model");
    expect(usage.totals.tokens).toBe(0);
    expect(usage.totals.requests).toBe(0);

    rt.dispose();
  });

  it("额度快照投影接到共享面板缓存(不是恒 null),自愈注册口由面板后半挂", async () => {
    const dir = makeTmpDir();

    const rt = await setupAsOne({
      dbPath: join(dir, "as-one.db"),
      env: {},
    });

    // ① 额度快照:必须与共享面板的投影**同一份**,不能是恒 null ——
    //    否则 due-first 的 T3 到期排序在插件里失效(用户 m17562/m34799)。
    //    空缓存时两者都是 {};断言同源即可证明接线方向对。
    expect(rt.repo.quotas()).toEqual(chQuotaTableForScheduler());

    // ② sensenova key 自愈注册口:面板构造之前网关侧拿不到实现(静默跳过),
    //    面板构造完之后由 panel-host 挂上来。
    let registered: unknown = null;
    const original = rt.setSensenovaKeyRepair.bind(rt);
    rt.setSensenovaKeyRepair = (fn): void => {
      registered = fn;
      original(fn);
    };
    expect(registered).toBeNull();

    const host = createPanelHost(rt, { gatewayPort: 4000 });
    expect(typeof registered).toBe("function");
    expect(host.bundle.snRepairKey).toBeTypeOf("function");

    // 拆掉也不抛(卸载路径)
    expect(() => rt.setSensenovaKeyRepair(null)).not.toThrow();

    rt.dispose();
  });

  it("账号启停落库:换一个进程(重新 setup)仍然记得停用", async () => {
    const dir = makeTmpDir();
    const dbPath = join(dir, "as-one.db");
    const seed = openDatabase(dbPath);
    seed.provider.insert({ id: "stub", base_url: "http://127.0.0.1:9", protocol: "openai", env_prefix: null });
    seed.credential.set({
      provider: "stub",
      username: "u1",
      secret: "sk-dummy-not-real",
      refresh_secret: null,
      expires_at: null,
      raw_json: null,
    });
    seed.close();

    const first = await setupAsOne({ dbPath, env: {} });
    first.setAccountEnabled("stub/u1", false);
    first.dispose();

    // 模拟重启:同一个库、新的运行时。
    const second = await setupAsOne({ dbPath, env: {} });
    expect(second.accountOverlay.get("stub/u1")).toBe(false);
    // 调度侧立刻按覆盖走(链为空 = 该账号没被算进来)
    expect(second.scheduler.chain("stub/u1")).toEqual([]);
    second.dispose();
  });

  it("重路由设置来自 setting 表(默认空 → 不重路由)", async () => {
    const dir = makeTmpDir();
    const rt = await setupAsOne({ dbPath: join(dir, "as-one.db"), env: {} });
    expect(rt.getSetting("route.compact")).toBeNull();
    rt.db.setting.set("route.compact", "free");
    expect(rt.getSetting("route.compact")).toBe("free");
    rt.dispose();
  });
});
