// engine-constants.ts
// ========================================================================

import type { Rule, StrategyName } from "./types.js";
// 本节由第十刀从 engine.ts 按行段抽出;import/导出由外面接线。
// ========================================================================

// ===========================================================================
// 模块常量(Nexus 逐字)
// ===========================================================================

/** 全部策略机器键(顺序即 snapshot()["strategies"])。 */
export const STRATEGIES: readonly StrategyName[] = [
  "due-first",
  "random",
  "ordered-fallback",
  "least-busy",
  "balanced",
];
/** 只有 ordered-fallback 把「数组顺序」当档序。 */
export const ORDER_STRATEGIES: ReadonlySet<string> = new Set([
  "ordered-fallback",
]);
/**
 * 缺省调度策略。
 *
 * ⚠️ 2026-11-08 用户定案改为 **due-first（先到期优先）**（此前是 random）：
 * 号池的用途就是「先把快到期的额度用掉」，随机打散会让快过期的号烂在池子里、
 * 反而天天用永不过期的号。五个策略仍是全量可选（设置页「调度规则」卡），
 * 改的是**没有显式配置时**的缺省值。
 *
 * 语义（见 engine.ts `_order` 的 due-first 分支）：
 * T1 免费名单序 → T2 赠送额度 → T3 消耗档（到期升序，**到期未知排本层末**）→ T4 降级。
 */
export const DEFAULT_STRATEGY: StrategyName = "due-first";
/** 可被分钟记忆化的策略(random 不缓存)。 */
export const CACHEABLE_STRATEGIES: ReadonlySet<string> = new Set([
  "due-first",
  "ordered-fallback",
  "least-busy",
  "balanced",
]);

/** 负载感知策略:真实选择在 Planner.plan,调度器只给静态档链。 */
export const LOAD_AWARE_STRATEGIES: ReadonlySet<string> = new Set([
  "least-busy",
  "balanced",
]);
export const DEFAULT_TTL_SECONDS = 300.0;
/** 额度刷新只看这些 provider。 */
export const QUOTA_REFRESH_PROVIDERS: readonly string[] = ["trae", "workbuddy"];

// 档位(1 < 2 < 3 < 4)
export const FREE_TIER = 1;
export const GRANT_TIER = 2;
export const CONSUME_TIER = 3;
export const DEGRADED_TIER = 4;
export const TIER_NAMES: Record<number, string> = {
  1: "T1 免费档",
  2: "T2 赠送额度",
  3: "T3 消耗档",
  4: "T4 高峰期降级(排末)",
};
/** 赠送档名单(空 = 无赠送档;测试可注入替换)。 */
export let GRANT_TIERS: ReadonlyArray<readonly [string, string]> = [];

/** 测试/运行时注入赠送档名单(import 的 let 绑定不可直接赋值)。 */
export function setGrantTiers(entries: ReadonlyArray<readonly [string, string]>): void {
  GRANT_TIERS = entries;
}

/**
 * 免费档名单(仅模块级 is_free_model 用;Scheduler 用 config 的 free_models)。
 *
 * 2026-10-30 用户定案:**代码里不留任何供应商/模型缺省**。免费档由用户在
 * 设置页「调度规则 P1」卡里自己配;这里恒为空表,保留下面的导出只为形状稳定
 * (面板兼容入口 `isFreeModel` / `freeRankOf` 仍在,只是永远答"不是免费")。
 */
const FREE_TIER_ENTRIES: ReadonlyArray<{ provider: string; model: string }> = [];
export const FREE_MODEL_PREFIXES: readonly string[] = FREE_TIER_ENTRIES.map(
  (e) => `${e.provider}/${e.model}`,
);
export const FREE_TIER_ORDER: readonly string[] = FREE_MODEL_PREFIXES;

/** 设置缺省(与 SETTING_DEFAULTS 逐字一致)。 */
export const SETTING_DEFAULTS: Record<string, number> = {
  "abstract.timeout_s": 10.0,
  "real.wait_budget_s": 60.0,
};
/** 配置 TTL(秒)。 */
export const CONFIG_TTL_SECONDS = 5.0;
/** Planner 冷却覆盖表的 TTL(秒)。 */
export const RULES_TTL_SECONDS = 5.0;

/** Router 侧常量。 */
export const DEFAULT_PIN_SECONDS = 900.0;
export const DEFAULT_LEASE_SECONDS = 600.0;
export const DEFAULT_MAX_RECENT = 200;
export const CONV_ORDER_LIMIT = 2048;
/** 已知瞬时故障:只记账,不熔断。 */
export const TRANSIENT_KINDS: ReadonlySet<string> = new Set([
  "timeout",
  "connection",
]);
export const PLAN_FAILURE_REASONS = ["all_blackout", "all_cooldown", "all_busy"];
/** 被直连请求抢占的逻辑租约:记入账本失败记录的 error 文本(m02240)。 */
export const PREEMPT_ERROR = "preempted by direct request";

/**
 * scheduler.rules 缺省规则 —— **恒为空**(2026-10-30 用户定案)。
 *
 * 原先这里硬编码了 8 条(workbuddy/hy4-preview、longcat 到期日、trae 降级时段 …)。
 * 那些都是**某台机器上某几个账号**的状态,不是产品的缺省:写进代码就变成了
 * "新装一台机器,调度器先按别人的账号和到期日跑"。现在全部清空,规则只来自
 * 用户在设置页五张档位卡里填的内容(库里的 `scheduler.rules_p*`)。
 */
export const CONFIG_DEFAULT_RULES: Rule[] = [];

/**
 * scheduler.cooldown_overrides 缺省(供应商级熔断覆盖,分钟)。
 *
 * 2026-10-24 用户定案:**不再有供应商级缺省** —— 缺省统一走全局冷却
 * (retry.logical_cooldown);要单独收紧某供应商就在设置页「冷却」卡里加一条。
 */
export const CONFIG_DEFAULT_COOLDOWN_OVERRIDES: Record<string, number> = {};
export const CONFIG_DEFAULTS_JSON = JSON.stringify({ rules: CONFIG_DEFAULT_RULES });
export const COOLDOWN_DEFAULTS_JSON = JSON.stringify(CONFIG_DEFAULT_COOLDOWN_OVERRIDES);

/**
 * 档位 → 设置键名(2026-10-22 用户定案拆 5 键:priority 1/2/3/4/0 各一个键)。
 *
 * 键名即档位,所以数组元素里**不再写 priority**(写了由校验端拒绝),读取时
 * 由键名注入。顺序固定:1, 2, 3, 4, 0(与档序一致,禁用排最后)。
 */
export const RULES_PRIORITY_KEYS: readonly number[] = [1, 2, 3, 4, 0];
