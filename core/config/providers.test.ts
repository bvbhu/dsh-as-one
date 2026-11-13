/**
 * providers.ts 测试 —— 加载 / 校验 / 查找 / 调度规则 / 热重载。
 *
 * 覆盖:
 * - 完整合法文档的加载与各类查找(provider / account / realModel /
 *   logicalModel / rules);
 * - 策略归一化(机器键 / 别名 / 未知回退 + issue);
 * - members 归一化(三种形状 / 顺序即 priority / 重复只留第一次);
 * - 账户配置校验(enabled 缺省 / credentialRef 前缀一致性 / 非法数值);
 * - realModel 校验(非法协议跳过整条 / concurrency 语义 / 重复键后者胜);
 * - schedulerRules 逐字段校验(镜像 _valid_rules:坏条目跳过、
 *   window/logical 废弃字段忽略、priority 推导);
 * - 致命错误:version 不认识 / 根节点不是对象 / JSON 语法错误 →
 *   ConfigValidationError;文件不存在 → 空注册表;
 * - 热重载:内容变化 → reloaded 事件 + 快照原子替换;坏文件 →
 *   error 事件 + 保留上次好快照;close() 停止。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ConfigValidationError,
  loadProviderConfig,
  parseExpiryDate,
  ProviderRegistry,
  splitModelId,
  derivePriority,
} from "./providers.js";
import { writeJsonFileAtomic } from "./store.js";
import { DEFAULT_SCHEDULER_RULES } from "./types.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "as-one-prov-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function configPath(name = "providers.json"): string {
  return join(dir, name);
}

function writeConfig(doc: unknown, name?: string): string {
  const path = configPath(name);
  writeJsonFileAtomic(path, doc);
  return path;
}

// ===========================================================================
// 合法文档:加载与查找
// ===========================================================================

describe("ProviderRegistry 加载与查找", () => {
  const validDoc = {
    version: 1,
    providers: [
      {
        id: "workbuddy",
        baseUrl: "https://api.workbuddy.example/v1",
        protocol: "workbuddy",
        envPrefix: "WORKBUDDY",
        realModels: [
          {
            model: "hy4-preview",
            name: "Hy4 Preview",
            supportsVision: true,
            maxInputTokens: 128000,
            maxOutputTokens: 8192,
            hidden: false,
            concurrency: 4,
          },
          { model: "step-5-preview", name: "Step 5 Preview" },
        ],
        accounts: [
          { credentialRef: "workbuddy/ops@example.com", enabled: true, sessionPinTtlSeconds: 600 },
          { credentialRef: "workbuddy/backup@example.com", enabled: false },
        ],
      },
      { id: "trae", protocol: "trae", baseUrl: null, envPrefix: null, realModels: [], accounts: [] },
    ],
    logicalModels: [
      {
        name: "default",
        strategy: "due-first",
        members: [{ provider: "workbuddy", model: "hy4-preview" }],
      },
      {
        name: "fallback",
        strategy: "平均使用", // 别名 → balanced
        members: ["workbuddy/step-5-preview"],
      },
    ],
    schedulerRules: [{ provider: "sensenova", priority: 2 }],
  };

  it("完整加载,issues 为空(除了别名回退?别名不算 issue)", async () => {
    const path = writeConfig(validDoc);
    const registry = await ProviderRegistry.load(path);

    expect(registry.issues).toEqual([]);
    expect(registry.path).toBe(path);
  });

  it("getProvider / listProviders", async () => {
    const registry = await ProviderRegistry.load(writeConfig(validDoc));

    const wb = registry.getProvider("workbuddy");
    expect(wb).not.toBeNull();
    expect(wb!.id).toBe("workbuddy");
    expect(wb!.baseUrl).toBe("https://api.workbuddy.example/v1");
    expect(wb!.protocol).toBe("workbuddy");
    expect(wb!.envPrefix).toBe("WORKBUDDY");

    expect(registry.getProvider("nope")).toBeNull();
    expect(registry.listProviders().map((p) => p.id)).toEqual(["trae", "workbuddy"]);
  });

  it("protocol 缺省 → openai;baseUrl/envPrefix 缺省 → null", async () => {
    const registry = await ProviderRegistry.load(
      writeConfig({
        version: 1,
        providers: [{ id: "plain" }],
        logicalModels: [],
        schedulerRules: [],
      }),
    );

    const p = registry.getProvider("plain");
    expect(p!.protocol).toBe("openai");
    expect(p!.baseUrl).toBeNull();
    expect(p!.envPrefix).toBeNull();
  });

  it("listProvidersByProtocol 按协议过滤", async () => {
    const registry = await ProviderRegistry.load(writeConfig(validDoc));
    expect(registry.listProvidersByProtocol("workbuddy").map((p) => p.id)).toEqual(["workbuddy"]);
    expect(registry.listProvidersByProtocol("openai")).toEqual([]);
  });

  it("账户查找:credentialRef / provider 过滤 / enabled 过滤", async () => {
    const registry = await ProviderRegistry.load(writeConfig(validDoc));

    const acct = registry.getAccount("workbuddy/ops@example.com");
    expect(acct).not.toBeNull();
    expect(acct!.enabled).toBe(true);
    expect(acct!.sessionPinTtlSeconds).toBe(600);
    expect(acct!.cooldownOverrideMinutes).toBeNull();

    expect(registry.getAccount("workbuddy/nope@example.com")).toBeNull();
    expect(registry.listAccounts().map((a) => a.credentialRef)).toEqual([
      "workbuddy/backup@example.com",
      "workbuddy/ops@example.com",
    ]);
    expect(registry.listAccounts("trae")).toEqual([]);
    expect(registry.listEnabledAccounts("workbuddy").map((a) => a.credentialRef)).toEqual([
      "workbuddy/ops@example.com",
    ]);
  });

  it("enabled 缺省 → true", async () => {
    const registry = await ProviderRegistry.load(
      writeConfig({
        version: 1,
        providers: [{ id: "p", accounts: [{ credentialRef: "p/u" }] }],
        logicalModels: [],
        schedulerRules: [],
      }),
    );
    expect(registry.getAccount("p/u")!.enabled).toBe(true);
  });

  it("真实模型查找", async () => {
    const registry = await ProviderRegistry.load(writeConfig(validDoc));

    const m = registry.getRealModel("workbuddy", "hy4-preview");
    expect(m).not.toBeNull();
    expect(m!.name).toBe("Hy4 Preview");
    expect(m!.supportsVision).toBe(true);
    expect(m!.maxInputTokens).toBe(128000);
    expect(m!.maxOutputTokens).toBe(8192);
    expect(m!.hidden).toBe(false);
    expect(m!.concurrency).toBe(4);

    expect(registry.getRealModel("workbuddy", "nope")).toBeNull();
    expect(registry.listRealModels("workbuddy")).toHaveLength(2);
    expect(registry.listRealModels("trae")).toEqual([]);
  });

  it("逻辑模型查找:members 顺序 = priority,strategy 别名归一", async () => {
    const registry = await ProviderRegistry.load(writeConfig(validDoc));

    const def = registry.getLogicalModel("default");
    expect(def).not.toBeNull();
    expect(def!.strategy).toBe("due-first");
    expect(def!.members).toEqual([{ provider: "workbuddy", model: "hy4-preview" }]);

    // 别名「平均使用」→ balanced(repo.py STRATEGY_ALIASES)。
    const fb = registry.getLogicalModel("fallback");
    expect(fb!.strategy).toBe("balanced");
    expect(fb!.members).toEqual([{ provider: "workbuddy", model: "step-5-preview" }]);

    expect(registry.getLogicalModel("nope")).toBeNull();
    expect(registry.strategyOf("default")).toBe("due-first"); // 显式配置优先于缺省
    expect(registry.strategyOf("nope")).toBe("random"); // 缺省回落
    expect(registry.membersOf("default")).toHaveLength(1);
    expect(registry.membersOf("nope")).toEqual([]);
    expect(registry.listLogicalModels().map((l) => l.name)).toEqual(["default", "fallback"]);
  });

  it("调度规则查找", async () => {
    const registry = await ProviderRegistry.load(writeConfig(validDoc));
    const rules = registry.listSchedulerRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ provider: "sensenova", priority: 2 });
    expect(registry.listSchedulerRulesFor("sensenova")).toHaveLength(1);
    expect(registry.listSchedulerRulesFor("trae")).toEqual([]);
  });
});

// ===========================================================================
// 策略归一化
// ===========================================================================

describe("策略归一化(镜像 repo.normalize_strategy)", () => {
  it("机器键原样返回", () => {
    const { snapshot } = loadProviderConfig({
      version: 1,
      providers: [{ id: "p", realModels: [], accounts: [] }],
      logicalModels: [{ name: "l", strategy: "least-busy", members: [] }],
      schedulerRules: [],
    });
    expect(snapshot.logicalModels.get("l")!.strategy).toBe("least-busy");
  });

  it("中文别名 → 机器键", () => {
    const { snapshot } = loadProviderConfig({
      version: 1,
      providers: [{ id: "p", realModels: [], accounts: [] }],
      logicalModels: [{ name: "l", strategy: "用量平衡", members: [] }],
      schedulerRules: [],
    });
    expect(snapshot.logicalModels.get("l")!.strategy).toBe("least-busy");
  });

  it("英文旧值 → 机器键", () => {
    const { snapshot } = loadProviderConfig({
      version: 1,
      providers: [{ id: "p", realModels: [], accounts: [] }],
      logicalModels: [{ name: "l", strategy: "usage balanced", members: [] }],
      schedulerRules: [],
    });
    expect(snapshot.logicalModels.get("l")!.strategy).toBe("least-busy");
  });

  it("usage-balanced(已移除)→ least-busy,不静默退化成 due-first", () => {
    const { snapshot } = loadProviderConfig({
      version: 1,
      providers: [{ id: "p", realModels: [], accounts: [] }],
      logicalModels: [{ name: "l", strategy: "usage-balanced", members: [] }],
      schedulerRules: [],
    });
    expect(snapshot.logicalModels.get("l")!.strategy).toBe("least-busy");
  });

  it("未知策略 → 缺省 random + issue 记录", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [{ id: "p", realModels: [], accounts: [] }],
      logicalModels: [{ name: "l", strategy: "totally-made-up", members: [] }],
      schedulerRules: [],
    });
    expect(snapshot.logicalModels.get("l")!.strategy).toBe("random");
    expect(issues.some((i) => i.path === "logicalModels[0].strategy" && i.message.includes("totally-made-up"))).toBe(true);
  });

  it("strategy 缺省 → random,无 issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [{ id: "p", realModels: [], accounts: [] }],
      logicalModels: [{ name: "l", members: [] }],
      schedulerRules: [],
    });
    expect(snapshot.logicalModels.get("l")!.strategy).toBe("random");
    expect(issues).toEqual([]);
  });
});

// ===========================================================================
// members 归一化(镜像 repo.normalize_members)
// ===========================================================================

describe("members 归一化", () => {
  function loadMembers(members: unknown) {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [{ id: "p", realModels: [], accounts: [] }],
      logicalModels: [{ name: "l", members }],
      schedulerRules: [],
    });
    return { members: snapshot.logicalModels.get("l")!.members, issues };
  }

  it("三种形状都认:{provider, model} / {real_model_id} / 字符串", () => {
    const { members } = loadMembers([
      { provider: "p1", model: "m1" },
      { real_model_id: "p2/m2" },
      "p3/m3",
    ]);
    expect(members).toEqual([
      { provider: "p1", model: "m1" },
      { provider: "p2", model: "m2" },
      { provider: "p3", model: "m3" },
    ]);
  });

  it("{id} 也认(与 real_model_id 同路径)", () => {
    const { members } = loadMembers([{ id: "p/m" }]);
    expect(members).toEqual([{ provider: "p", model: "m" }]);
  });

  it("模型名含斜杠:按第一个 / 切(split_model_id)", () => {
    const { members } = loadMembers(["p/weird/model-name"]);
    expect(members).toEqual([{ provider: "p", model: "weird/model-name" }]);
  });

  it("顺序即 priority,绝不重排", () => {
    const { members } = loadMembers(["p3/m3", "p1/m1", "p2/m2"]);
    expect(members.map((m) => m.provider)).toEqual(["p3", "p1", "p2"]);
  });

  it("完全重复的 (provider, model) 只保留第一次", () => {
    const { members } = loadMembers(["p/m", { provider: "p", model: "m" }, "p/m"]);
    expect(members).toEqual([{ provider: "p", model: "m" }]);
  });

  it("缺 provider/model 的条目跳过 + issue", () => {
    const { members, issues } = loadMembers([
      { provider: "p" }, // 缺 model
      { model: "m" }, // 缺 provider
      42, // 不是对象/字符串
      "no-slash", // 无 /
    ]);
    expect(members).toEqual([]);
    expect(issues.length).toBe(4);
  });

  it("members 缺省 → 空档链,无 issue", () => {
    const { members, issues } = loadMembers(undefined);
    expect(members).toEqual([]);
    expect(issues).toEqual([]);
  });
});

// ===========================================================================
// provider / realModel 校验
// ===========================================================================

describe("provider 与 realModel 校验", () => {
  it("非法 protocol → 跳过整条 provider + issue(猜错协议会送错适配器)", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        { id: "bad", protocol: "grpc", realModels: [], accounts: [] },
        { id: "good", protocol: "openai", realModels: [], accounts: [] },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect([...snapshot.providers.keys()]).toEqual(["good"]);
    expect(issues.some((i) => i.path === "providers[0].protocol")).toBe(true);
  });

  it("缺 provider id → 跳过整条 + issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [{ protocol: "openai", realModels: [], accounts: [] }],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.providers.size).toBe(0);
    expect(issues[0]!.path).toBe("providers[0]");
  });

  it("重复的 provider id → 保留后者 + issue(与 DB upsert 同口径)", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        { id: "dup", baseUrl: "https://old", realModels: [], accounts: [] },
        { id: "dup", baseUrl: "https://new", realModels: [], accounts: [] },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.providers.get("dup")!.baseUrl).toBe("https://new");
    expect(issues.some((i) => i.message.includes("重复的 provider"))).toBe(true);
  });

  it("重复的真实模型 → 保留后者 + issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        {
          id: "p",
          realModels: [
            { model: "m", name: "old" },
            { model: "m", name: "new" },
          ],
          accounts: [],
        },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.realModels.get("p/m")!.name).toBe("new");
    expect(issues.some((i) => i.message.includes("重复的真实模型"))).toBe(true);
  });

  it("非法 maxInputTokens(0 / 负数 / 字符串)→ null + issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        {
          id: "p",
          realModels: [
            { model: "a", maxInputTokens: 0 },
            { model: "b", maxInputTokens: -1 },
            { model: "c", maxInputTokens: "128k" },
            { model: "d", maxInputTokens: 128000 },
          ],
          accounts: [],
        },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.realModels.get("p/a")!.maxInputTokens).toBeNull();
    expect(snapshot.realModels.get("p/b")!.maxInputTokens).toBeNull();
    expect(snapshot.realModels.get("p/c")!.maxInputTokens).toBeNull();
    expect(snapshot.realModels.get("p/d")!.maxInputTokens).toBe(128000);
    expect(issues.length).toBe(3);
  });

  it("非法 concurrency(0 / 负数)→ null(不覆盖语义)+ issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        {
          id: "p",
          realModels: [
            { model: "a", concurrency: 0 },
            { model: "b", concurrency: -2 },
            { model: "c", concurrency: 4 },
          ],
          accounts: [],
        },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.realModels.get("p/a")!.concurrency).toBeNull();
    expect(snapshot.realModels.get("p/b")!.concurrency).toBeNull();
    expect(snapshot.realModels.get("p/c")!.concurrency).toBe(4);
    expect(issues.length).toBe(2);
  });

  it("非法 supportsVision / hidden(字符串)→ 缺省 false + issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        { id: "p", realModels: [{ model: "a", supportsVision: "yes", hidden: 1 }], accounts: [] },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.realModels.get("p/a")!.supportsVision).toBe(false);
    expect(snapshot.realModels.get("p/a")!.hidden).toBe(false);
    expect(issues.length).toBe(2);
  });

  it("baseUrl / envPrefix 非法类型 → null + issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [{ id: "p", baseUrl: 123, envPrefix: [], realModels: [], accounts: [] }],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.providers.get("p")!.baseUrl).toBeNull();
    expect(snapshot.providers.get("p")!.envPrefix).toBeNull();
    expect(issues.length).toBe(2);
  });
});

// ===========================================================================
// 账户配置校验
// ===========================================================================

describe("账户配置校验", () => {
  it("credentialRef 与所在 provider 不一致 → 跳过 + issue(外键一致性)", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        { id: "workbuddy", realModels: [], accounts: [{ credentialRef: "trae/u" }] },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.accounts.size).toBe(0);
    expect(issues[0]!.path).toBe("providers[0].accounts[0].credentialRef");
  });

  it("重复 credentialRef → 保留后者 + issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        {
          id: "p",
          realModels: [],
          accounts: [
            { credentialRef: "p/u", enabled: true },
            { credentialRef: "p/u", enabled: false },
          ],
        },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.accounts.get("p/u")!.enabled).toBe(false);
    expect(issues.some((i) => i.message.includes("重复的账户"))).toBe(true);
  });

  it("非法 cooldownOverrideMinutes / sessionPinTtlSeconds → null + issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        {
          id: "p",
          realModels: [],
          accounts: [
            { credentialRef: "p/u", cooldownOverrideMinutes: -5, sessionPinTtlSeconds: "600" },
            { credentialRef: "p/u2", cooldownOverrideMinutes: 15, sessionPinTtlSeconds: 600 },
          ],
        },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.accounts.get("p/u")!.cooldownOverrideMinutes).toBeNull();
    expect(snapshot.accounts.get("p/u")!.sessionPinTtlSeconds).toBeNull();
    expect(snapshot.accounts.get("p/u2")!.cooldownOverrideMinutes).toBe(15);
    expect(snapshot.accounts.get("p/u2")!.sessionPinTtlSeconds).toBe(600);
    expect(issues.length).toBe(2);
  });

  it("enabled 非法(字符串)→ true + issue", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [
        { id: "p", realModels: [], accounts: [{ credentialRef: "p/u", enabled: "yes" }] },
      ],
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.accounts.get("p/u")!.enabled).toBe(true);
    expect(issues).toHaveLength(1);
  });
});

// ===========================================================================
// schedulerRules 校验(镜像 engine._valid_rules)
// ===========================================================================

describe("schedulerRules 校验", () => {
  function loadRules(rules: unknown) {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: [{ id: "p", realModels: [], accounts: [] }],
      logicalModels: [],
      schedulerRules: rules,
    });
    return { rules: snapshot.schedulerRules, issues };
  }

  it("合法规则全字段通过(window 嵌套形态)", () => {
    const { rules, issues } = loadRules([
      {
        provider: "workbuddy",
        model: "m",
        expiresAt: "2026-12-19",
        window: { times: [["09:00", "12:00"]], weekdays: [1, 5] },
        priority: 4,
      },
    ]);
    expect(issues).toEqual([]);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      provider: "workbuddy",
      model: "m",
      expiresAt: "2026-12-19",
      window: { times: [["09:00", "12:00"]], weekdays: [1, 5] },
      priority: 4,
    });
  });

  it("缺 provider 的规则 → 整条忽略 + issue", () => {
    const { rules, issues } = loadRules([{ priority: 1 }, { provider: "", priority: 2 }, { provider: "ok" }]);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.provider).toBe("ok");
    expect(issues.length).toBe(2);
  });

  it("坏条目跳过,好条目保留(不回滚整份)", () => {
    const { rules } = loadRules([{ provider: "a", priority: 1 }, "garbage", 42, { provider: "b", priority: 0 }]);
    expect(rules.map((r) => r.provider)).toEqual(["a", "b"]);
  });

  it("cooldown 字段已迁到 scheduler.cooldown_overrides → 忽略 + issue", () => {
    const { rules, issues } = loadRules([{ provider: "sensenova", cooldown: 1 }]);
    expect(rules).toHaveLength(1); // 规则本身保留(provider 合法)
    expect((rules[0] as unknown as Record<string, unknown>).cooldown).toBeUndefined();
    expect(issues.some((i) => i.message.includes("scheduler.cooldown_overrides"))).toBe(true);
  });

  it("window 对象被接受(时段收进嵌套对象)", () => {
    const { rules, issues } = loadRules([
      { provider: "a", model: "m", priority: 4, window: { times: [["09:00", "12:00"]], weekdays: [1, 2] } },
    ]);
    expect(rules[0]!.window).toEqual({ times: [["09:00", "12:00"]], weekdays: [1, 2] });
    expect(issues).toHaveLength(0);
  });

  it("window 非对象 → 按无时段处理 + issue", () => {
    const { rules, issues } = loadRules([{ provider: "a", window: [["09:00", "12:00"]] }]);
    expect(rules[0]!.window).toBeUndefined();
    expect(issues.some((i) => i.message.includes("不是对象"))).toBe(true);
  });

  it("旧扁平 times/weekdays 兼容 → 迁入 window", () => {
    const { rules } = loadRules([{ provider: "a", model: "m", times: [["09:00", "12:00"]], weekdays: [1] }]);
    expect(rules[0]!.window).toEqual({ times: [["09:00", "12:00"]], weekdays: [1] });
  });

  it("logical 字段已废弃 → 忽略 + issue(engine.py L1000-1005)", () => {
    const { rules, issues } = loadRules([
      { provider: "a", window: { times: [["09:00", "12:00"]] }, logical: "l" },
    ]);
    expect(rules).toHaveLength(1); // 规则本身保留
    expect(issues.some((i) => i.message.includes("logical 字段已废弃"))).toBe(true);
  });

  it("priority 不再隐式推导:有 expiresAt 且无 model 也不设", () => {
    const { rules } = loadRules([{ provider: "longcat", expiresAt: "2026-10-27" }]);
    expect(rules[0]!.priority).toBeUndefined();
  });

  it("priority 不推导:有 expires_at 但有 model → 不设(不猜)", () => {
    const { rules } = loadRules([{ provider: "p", model: "m", expiresAt: "2026-10-27" }]);
    expect(rules[0]!.priority).toBeUndefined();
  });

  it("显式 priority 保留", () => {
    const { rules } = loadRules([{ provider: "p", expiresAt: "2026-10-27", priority: 1 }]);
    expect(rules[0]!.priority).toBe(1);
  });

  it("非法 times(空数组 / 形状错)→ 按无时段处理 + issue", () => {
    const { rules, issues } = loadRules([
      { provider: "a", window: { times: [] } },
      { provider: "b", window: { times: [["09:00"]] } },
      { provider: "c", window: { times: [["9am", "12:00"]] } },
    ]);
    expect(rules.every((r) => r.window?.times === undefined)).toBe(true);
    expect(issues.length).toBe(3);
  });

  it("非法 weekdays(0 / 8 / 非整数)→ 按每天处理 + issue", () => {
    const { rules, issues } = loadRules([
      { provider: "a", window: { weekdays: [0] } },
      { provider: "b", window: { weekdays: [8] } },
      { provider: "c", window: { weekdays: [1.5] } },
      { provider: "d", window: { weekdays: [1, 7] } },
    ]);
    expect(rules[0]!.window?.weekdays).toBeUndefined();
    expect(rules[1]!.window?.weekdays).toBeUndefined();
    expect(rules[2]!.window?.weekdays).toBeUndefined();
    expect(rules[3]!.window?.weekdays).toEqual([1, 7]);
    expect(issues.length).toBe(3);
  });

  it("非法 priority(负数 / 字符串)→ 按未设置处理 + issue", () => {
    const { rules, issues } = loadRules([{ provider: "a", priority: -1 }, { provider: "b", priority: "1" }]);
    expect(rules.every((r) => r.priority === undefined)).toBe(true);
    expect(issues.length).toBe(2);
  });

  it("非法 expires_at(无法解析)→ 按无到期处理 + issue", () => {
    const { rules, issues } = loadRules([{ provider: "a", expiresAt: "not-a-date" }]);
    expect(rules[0]!.expiresAt).toBeUndefined();
    expect(issues).toHaveLength(1);
  });
});

// ===========================================================================
// 纯函数
// ===========================================================================

describe("splitModelId", () => {
  it("按第一个 / 切", () => {
    expect(splitModelId("p/m")).toEqual(["p", "m"]);
    expect(splitModelId("p/m/extra")).toEqual(["p", "m/extra"]);
  });
  it("无 / → [null, 原文]", () => {
    expect(splitModelId("just-model")).toEqual([null, "just-model"]);
  });
});

describe("parseExpiryDate", () => {
  it("YYYY-MM-DD → 当天 00:00 本地", () => {
    const t = parseExpiryDate("2026-12-19");
    expect(t).not.toBeNull();
    expect(new Date(t! * 1000).getFullYear()).toBe(2026);
  });
  it("YYYY-MM-DD HH:MM:SS → 秒级", () => {
    const t = parseExpiryDate("2026-12-19 12:55:45");
    expect(t).not.toBeNull();
  });
  it("无法解析 → null", () => {
    expect(parseExpiryDate("not-a-date")).toBeNull();
    expect(parseExpiryDate("2026-13-45")).toBeNull(); // 非法日期
    expect(parseExpiryDate(123)).toBeNull();
  });
});

describe("derivePriority(已停用,原样返回)", () => {
  it("显式 priority 不动", () => {
    expect(derivePriority({ provider: "p", priority: 1 }).priority).toBe(1);
  });
  it("expiresAt 且无 model → 不再推导为 2", () => {
    expect(derivePriority({ provider: "p", expiresAt: "2026-01-01" }).priority).toBeUndefined();
  });
  it("有 model → 不设", () => {
    expect(derivePriority({ provider: "p", model: "m" }).priority).toBeUndefined();
  });
});

// ===========================================================================
// 致命错误与空文件
// ===========================================================================

describe("致命错误(整份读不了必须出声)", () => {
  it("version 不认识 → ConfigValidationError", () => {
    expect(() => loadProviderConfig({ version: 2, providers: [], logicalModels: [], schedulerRules: [] })).toThrow(
      ConfigValidationError,
    );
  });

  it("根节点不是对象 → ConfigValidationError", () => {
    expect(() => loadProviderConfig([1, 2, 3])).toThrow(ConfigValidationError);
    expect(() => loadProviderConfig(null)).toThrow(ConfigValidationError);
    expect(() => loadProviderConfig("str")).toThrow(ConfigValidationError);
  });

  it("JSON 语法错误 → ConfigValidationError(经 ProviderRegistry.load)", async () => {
    const path = configPath();
    writeFileSync(path, '{"version": 1,', "utf8");
    await expect(ProviderRegistry.load(path)).rejects.toThrow(ConfigValidationError);
  });

  it("文件不存在 → 空注册表,不算错误(首次安装)", async () => {
    const registry = await ProviderRegistry.load(configPath("missing.json"));
    expect(registry.listProviders()).toEqual([]);
    expect(registry.issues).toEqual([]);
  });

  it("段类型错(providers 不是数组)→ 按空处理 + issue,不致命", () => {
    const { snapshot, issues } = loadProviderConfig({
      version: 1,
      providers: "not-an-array",
      logicalModels: [],
      schedulerRules: [],
    });
    expect(snapshot.providers.size).toBe(0);
    expect(issues[0]!.path).toBe("$.providers");
  });
});

// ===========================================================================
// 热重载
// ===========================================================================

describe("ProviderRegistry 热重载", () => {
  it("内容变化 → reloaded 事件 + 快照原子替换", async () => {
    const path = writeConfig({
      version: 1,
      providers: [{ id: "p1", realModels: [], accounts: [] }],
      logicalModels: [],
      schedulerRules: [],
    });
    const registry = await ProviderRegistry.load(path);

    const events: string[] = [];
    registry.onChange((e) => events.push(e.type));
    await registry.watch({ debounceMs: 20 });

    writeJsonFileAtomic(path, {
      version: 1,
      providers: [
        { id: "p1", realModels: [], accounts: [] },
        { id: "p2", realModels: [], accounts: [] },
      ],
      logicalModels: [],
      schedulerRules: [],
    });

    await vi.waitFor(() => expect(events).toContain("reloaded"), { timeout: 3000 });
    expect(registry.listProviders().map((p) => p.id)).toEqual(["p1", "p2"]);
    registry.close();
  });

  it("坏文件 → error 事件 + 保留上次好快照", async () => {
    const path = writeConfig({
      version: 1,
      providers: [{ id: "p1", realModels: [], accounts: [] }],
      logicalModels: [],
      schedulerRules: [],
    });
    const registry = await ProviderRegistry.load(path);

    const events: string[] = [];
    registry.onChange((e) => events.push(e.type));
    await registry.watch({ debounceMs: 20 });

    writeFileSync(path, '{"version": 1, "providers": [', "utf8"); // 半文件

    await vi.waitFor(() => expect(events).toContain("error"), { timeout: 3000 });
    // 上次好快照还在。
    expect(registry.getProvider("p1")).not.toBeNull();
    expect(registry.listProviders()).toHaveLength(1);
    registry.close();
  });

  it("reload() 手动重载成功 → reloaded", async () => {
    const path = writeConfig({
      version: 1,
      providers: [{ id: "p1", realModels: [], accounts: [] }],
      logicalModels: [],
      schedulerRules: [],
    });
    const registry = await ProviderRegistry.load(path);

    const result = await registry.reload();
    expect(result.reloaded).toBe(true);
    expect(registry.getProvider("p1")).not.toBeNull();
  });

  it("reload() 遇到坏文件 → 返回 reloaded: false 且保留旧快照", async () => {
    const path = writeConfig({
      version: 1,
      providers: [{ id: "p1", realModels: [], accounts: [] }],
      logicalModels: [],
      schedulerRules: [],
    });
    const registry = await ProviderRegistry.load(path);

    writeFileSync(path, "garbage", "utf8");
    const result = await registry.reload();

    expect(result.reloaded).toBe(false);
    expect(registry.getProvider("p1")).not.toBeNull(); // 旧快照保留
  });

  it("close() 后 watch 停止", async () => {
    const path = writeConfig({
      version: 1,
      providers: [{ id: "p1", realModels: [], accounts: [] }],
      logicalModels: [],
      schedulerRules: [],
    });
    const registry = await ProviderRegistry.load(path);

    const events: string[] = [];
    registry.onChange((e) => events.push(e.type));
    const handle = await registry.watch({ debounceMs: 20 });
    registry.close();

    writeJsonFileAtomic(path, {
      version: 1,
      providers: [{ id: "p2", realModels: [], accounts: [] }],
      logicalModels: [],
      schedulerRules: [],
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toEqual([]);
    handle.close();
  });
});

// ===========================================================================
// 默认规则导出
// ===========================================================================

describe("DEFAULT_SCHEDULER_RULES(2026-10-30 移除代码缺省)", () => {
  it("恒为空表 —— 调度规则只来自用户配置", () => {
    expect(DEFAULT_SCHEDULER_RULES).toHaveLength(0);
  });

  it("不含任何供应商/模型名(否则等于把别人账号的状态写进产品)", () => {
    const text = JSON.stringify(DEFAULT_SCHEDULER_RULES);
    for (const name of ["workbuddy", "trae", "longcat", "tokenrhythm", "stepfun"]) {
      expect(text.includes(name)).toBe(false);
    }
  });
});
