/**
 * types.ts 测试 —— 纯函数与常量(策略归一化 / 到期归一 / 默认值导出)。
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PIN_TTL_SECONDS,
  DEFAULT_PROVIDER_PROTOCOL,
  DEFAULT_SCHEDULER_RULES,
  DEFAULT_SCHEDULER_COOLDOWN_OVERRIDES,
  DEFAULT_SCHEDULER_STRATEGY,
  MILLIS_THRESHOLD,
  normalizeExpiresSeconds,
  normalizeStrategy,
  PROVIDER_PROTOCOLS,
  RETRY_DEFAULTS,
  RETRY_KEYS,
  SCHEDULER_STRATEGIES,
  STRATEGY_ALIASES,
} from "./types.js";

describe("normalizeStrategy", () => {
  it("机器键原样返回", () => {
    for (const s of SCHEDULER_STRATEGIES) {
      expect(normalizeStrategy(s)).toEqual({ strategy: s, fellBack: false });
    }
  });

  it("别名表逐条映射(含中文/英文旧值)", () => {
    expect(normalizeStrategy("最先到期 due first").strategy).toBe("due-first");
    expect(normalizeStrategy("nexus").strategy).toBe("due-first");
    expect(normalizeStrategy("随机").strategy).toBe("random");
    expect(normalizeStrategy("平均使用").strategy).toBe("balanced");
    expect(normalizeStrategy("按序降级链").strategy).toBe("ordered-fallback");
    expect(normalizeStrategy("用量平衡").strategy).toBe("least-busy");
  });

  it("usage-balanced(已移除)→ least-busy,不退化", () => {
    expect(normalizeStrategy("usage-balanced").strategy).toBe("least-busy");
  });

  it("大小写不敏感(仅对别名键的小写形式再查一次)", () => {
    // 别名表只有小写键;"Ordered" → 小写 "ordered" 命中别名。
    expect(normalizeStrategy("Ordered").strategy).toBe("ordered-fallback");
    expect(normalizeStrategy("  随机  ").strategy).toBe("random"); // strip
  });

  it("大写机器键不认(别名表没有大写键)→ 缺省 random", () => {
    // Nexus 同口径:STRATEGIES 大小写敏感,别名表只查原值与小写。
    expect(normalizeStrategy("RANDOM").strategy).toBe("random");
  });

  it("未知值 → 缺省 random + fellBack: true", () => {
    expect(normalizeStrategy("no-such-strategy")).toEqual({
      strategy: "random",
      fellBack: true,
    });
  });

  it("空 / None → 缺省 + fellBack", () => {
    expect(normalizeStrategy(undefined).strategy).toBe("random");
    expect(normalizeStrategy(null).strategy).toBe("random");
    expect(normalizeStrategy("").strategy).toBe("random");
    expect(normalizeStrategy("   ").strategy).toBe("random");
  });
});

describe("normalizeExpiresSeconds", () => {
  it("秒 → 原样", () => {
    expect(normalizeExpiresSeconds(1_800_000_000)).toBe(1_800_000_000);
  });
  it("毫秒(>= 1e11)→ 折成秒", () => {
    expect(normalizeExpiresSeconds(MILLIS_THRESHOLD)).toBe(MILLIS_THRESHOLD / 1000);
    expect(normalizeExpiresSeconds(1_794_232_268_011)).toBe(1_794_232_268.011);
  });
  it("数字字符串也认", () => {
    expect(normalizeExpiresSeconds("1800000000")).toBe(1_800_000_000);
    expect(normalizeExpiresSeconds("1800000000000")).toBe(1_800_000_000);
  });
  it("0 / 负数 / 非数字 → null", () => {
    expect(normalizeExpiresSeconds(0)).toBeNull();
    expect(normalizeExpiresSeconds(-1)).toBeNull();
    expect(normalizeExpiresSeconds("abc")).toBeNull();
    expect(normalizeExpiresSeconds(null)).toBeNull();
    expect(normalizeExpiresSeconds(undefined)).toBeNull();
    expect(normalizeExpiresSeconds(Number.NaN)).toBeNull();
    expect(normalizeExpiresSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("常量导出", () => {
  it("协议集合与缺省", () => {
    // 第五个协议是 As One 自己加的(qoder 走 cosy 协议,不是 OpenAI 兼容上游);
    // 第六个 minimax 目前只承载签到 + 额度,聊天转发尚未接入。
    expect(PROVIDER_PROTOCOLS).toEqual([
      "openai",
      "workbuddy",
      "trae",
      "sensenova",
      "qoder",
      "minimax",
    ]);
    expect(DEFAULT_PROVIDER_PROTOCOL).toBe("openai");
  });

  it("策略集合与缺省", () => {
    expect(SCHEDULER_STRATEGIES).toEqual([
      "due-first",
      "random",
      "ordered-fallback",
      "least-busy",
      "balanced",
    ]);
    expect(DEFAULT_SCHEDULER_STRATEGY).toBe("random");
  });

  it("别名表与 Nexus 一致(21 条)", () => {
    expect(Object.keys(STRATEGY_ALIASES)).toHaveLength(17);
  });

  it("retry 缺省 7 键齐全,logical_cooldown 单位是分钟(值 15)", () => {
    expect(RETRY_KEYS).toHaveLength(7);
    expect(Object.keys(RETRY_DEFAULTS)).toHaveLength(7);
    expect(RETRY_DEFAULTS["retry.logical_cooldown"]).toBe(15);
    expect(RETRY_DEFAULTS["retry.base_backoff_s"]).toBe(1.0);
    expect(RETRY_DEFAULTS["retry.codes"]).toBe("timeout,connection,429,500,502,503,504");
  });

  it("会话亲和 pin TTL 缺省 600 秒(repo.py L1391)", () => {
    expect(DEFAULT_PIN_TTL_SECONDS).toBe(600.0);
  });

  it("默认调度规则恒空(2026-10-30 移除代码缺省)", () => {
    expect(DEFAULT_SCHEDULER_RULES).toHaveLength(0);
    // 冷却覆盖已拆出独立键;2026-10-24 起不再有供应商级缺省
    expect(DEFAULT_SCHEDULER_COOLDOWN_OVERRIDES).toEqual({});
  });
});
