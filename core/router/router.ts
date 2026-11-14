/**
 * Router —— 选路引擎(从 `nexus/core/router.py:Router` / `HealthRegistry` /
 * `SessionPinTable` 移植;测试规格 `tests/test_v4_semantics.py`)。
 *
 * 选择顺序(2026-10-10 用户定案,**不可调换**):
 * -----------------------------------------
 * 1. **会话亲和优先** —— 本会话有 pin 记录、且那台当前空闲,就直接回到它,
 *    **不管它现在排第几**。一场长会话必须固定在同一模型上,否则上游 prompt cache
 *    全部落空。
 * 2. **按序分配** —— 没有 pin、或 pin 那台正忙/已下线时,按**链的顺序**取第一台
 *    空闲的。第一个并发占住首选后,第二个并发自动落到次选。
 * 3. 全忙 / 全冷却 → 返回 `Plan(null, reason)`,由调用方决定退避还是报错。
 *
 * ⚠️ **负载感知策略的选择权在这里,不在调度器**。`least-busy` / `balanced` 要看
 * **实时**在途数,而调度器给出的链会被按分钟记忆化 —— 拿分钟级快照去「挑最闲的
 * 那台」等于挑了个寂寞。
 *
 * ⚠️ **运行期状态全部只在内存**(D17 / D18 / D19):连续失败数、冷却截止时间、
 * 会话 pin 三者都不落盘。语义:**最近没有失败记录的端点一律视为可用**。
 *
 * ⚠️ 会话 pin **不再跨重启**:重启后第一轮请求会重新选路,长会话可能因此丢掉一次
 * prompt cache(已评估为可接受)。
 *
 * **框架无关**:不 import fastapi / dsh / electron,也不 import 本仓库其他子代理
 * 负责的 `src/scheduler`、`src/db`。DB 与 provider 注册表用注入接口
 * ({@link RouterDeps})表达,并附**纯内存实现**({@link InMemoryRouterDeps})
 * 供测试与离线场景使用。
 */

import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { HealthRegistry } from "./health.js";
import { InflightLedger } from "./inflight-ledger.js";
import { SessionPinTable } from "./session-pin.js";
import {
  DEFAULT_LOGICAL_COOLDOWN_MIN,
  DEFAULT_PIN_SECONDS,
  DEFAULT_RECENT_LIMIT,
  LOAD_AWARE_STRATEGIES,
  PLAN_FAILURE_REASONS,
  SETTING_COOLDOWN_OVERRIDES,
  SETTING_LOGICAL_COOLDOWN,
  SETTING_RECENT_LIMIT,
  type ChainItem,
  type CooldownHint,
  type CredentialKey,
  type Endpoint,
  type EndpointHealth,
  type Plan,
  type PreemptNotifier,
  type RequestOutcome,
  type RetryPolicy,
  coerceRetryNumber,
  inCooldown,
  noteFailure,
  noteSuccess,
  parseStrictInt,
  planResult,
} from "./types.js";

export type {
  ChainItem,
  CooldownHint,
  CredentialKey,
  Endpoint,
  EndpointHealth,
  Plan,
  RequestOutcome,
  RetryPolicy,
};

export { PLAN_FAILURE_REASONS, LOAD_AWARE_STRATEGIES };

/** 设置读取(等价于 Nexus 的 `repo.get_setting("<字面量键>")`)。 */
export interface SettingSource {
  /** 读一个设置;缺失 / 抛错都按「没有」处理(调用方各自回落)。 */
  getSetting(key: string): string | null | undefined;
}

/** 供应商冷却覆盖表:`{provider: 分钟}`(`scheduler.cooldown_overrides` 键)。 */
export type CooldownRuleMap = Readonly<Record<string, number>>;

/**
 * Router 的外部依赖(DB + provider 注册表)。
 *
 * 只声明选路真正用到的两个动作:**读设置**与**解析供应商冷却覆盖**。
 * `applyCooldownRules` 是给「配置解析在别处」的调用方留的口子 —— 不传就回落到
 * 从 `scheduler.cooldown_overrides` JSON 自己解析(2026-10-21 拆出独立键)。
 */
export interface RouterDeps {
  /** 设置读取;`null` = 没有设置源(冷却 / 显示容量一律走默认值)。 */
  readonly settings?: SettingSource | null;
  /**
   * 供应商冷却覆盖表解析;缺省 = 从 `settings.getSetting("scheduler.cooldown_overrides")`
   * 自己解析(只收「形状合法」的正数分钟;0 / 负数 / 非数字不进表)。
   */
  readonly applyCooldownRules?: (() => CooldownRuleMap) | null;
}

/**
 * **纯内存** `RouterDeps` 实现(测试 / 离线用)。
 *
 * ⚠️ 只服务选路测试,**不是** DB 层替代品:没有 provider 表、没有凭据、没有
 * `endpoint_chain`。链由调用方构造(`chainItemFrom`),设置是一张 `Map`。
 */
export class InMemoryRouterDeps implements RouterDeps {
  readonly settings: SettingSource;
  private readonly table = new Map<string, string>();
  private cooldownRules: CooldownRuleMap | null = null;

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.table.set(key, value);
    }
    this.settings = {
      getSetting: (key: string) => this.table.get(key) ?? null,
    };
  }

  /** 读一个设置(不存在返回 `null`)。 */
  getSetting(key: string): string | null {
    return this.table.get(key) ?? null;
  }

  /** 写一个设置(与 `repo.set_setting` 同形)。 */
  setSetting(key: string, value: string | null | undefined): void {
    if (value === null || value === undefined) {
      this.table.delete(key);
      return;
    }
    this.table.set(key, String(value));
  }

  /** 供应商标记为「冷却覆盖解析走注入」(测试里直接给定覆盖表)。 */
  withCooldownRules(rules: CooldownRuleMap | null): this {
    this.cooldownRules = rules;
    return this;
  }

  /** 显式走注入的覆盖表(`null` = 回落 `scheduler.cooldown_overrides` 解析)。 */
  applyCooldownRules(): CooldownRuleMap {
    return this.cooldownRules ?? parseCooldownOverrides(this.getSetting(SETTING_COOLDOWN_OVERRIDES));
  }
}

/**
 * `scheduler.cooldown_overrides` → `{provider: 分钟}`(**无缓存**,纯解析)。
 *
 * 2026-10-21 起冷却覆盖从 `scheduler.rules` 拆出独立键,形状是
 * `{"<provider>": 分钟}`(与引擎 `validCooldownOverrides` 同口径)。
 */
export function parseCooldownOverrides(raw: string | null | undefined): CooldownRuleMap {
  const out: Record<string, number> = {};
  if (!raw) {
    return out;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return out; // 配置坏了不该让请求路径跟着崩
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return out;
  }
  for (const [provider, minutes] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof provider !== "string" || provider.trim() === "") {
      continue;
    }
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
      continue;
    }
    out[provider] = minutes;
  }
  return out;
}

/**
 * `scheduler.rules` 里 `cooldown` 规则 → `{provider: 分钟}`(**旧格式**,
 * 2026-10-21 拆出独立键前;仅迁移期 / 测试兼容,不再被 Router 回落路径使用)。
 */
export function parseCooldownRules(raw: string | null | undefined): CooldownRuleMap {
  const out: Record<string, number> = {};
  if (!raw) {
    return out;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return out; // 配置坏了一不该让请求路径跟着崩
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return out;
  }
  const rules = (parsed as { rules?: unknown }).rules;
  if (!Array.isArray(rules)) {
    return out;
  }
  for (const entry of rules) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const rule = entry as { provider?: unknown; cooldown?: unknown };
    const provider = rule.provider;
    const cd = rule.cooldown;
    if (typeof provider !== "string" || provider.trim() === "") {
      continue;
    }
    if (typeof cd !== "number" || !Number.isFinite(cd) || cd <= 0) {
      continue;
    }
    // 同一 provider 写了多条 cooldown 规则时**最后一条赢**(数组序即优先序)
    out[provider] = cd;
  }
  return out;
}

/**
 * `scheduler.rules` 的供应商冷却覆盖表解析 TTL(秒)。
 *
 * 热路径不重复 `JSON.parse` 整份配置 —— 照抄 `Scheduler._config()` 的 5s TTL 手法。
 * ⚠️ 缓存挂在 **Router 实例**上,不是模块级:同一个进程里可能同时存在多个 repo
 * (面板 / 网关 / 测试各一份),模块级缓存会把 A 库的覆盖表喂给 B 库。
 */
export const RULES_TTL_SECONDS = 5.0;

export interface RouterOptions {
  /** 在途租约账本;缺省新建一个(容量走 `ui.recent_limit` 活读)。 */
  ledger?: InflightLedger;
  /** 端点健康账本;缺省新建。 */
  health?: HealthRegistry;
  /** 会话 pin 表;缺省新建。 */
  pins?: SessionPinTable;
  /** 会话粘住租期(秒),默认 {@link DEFAULT_PIN_SECONDS}。 */
  pinSeconds?: number;
  /**
   * 会话粘住的**活读**时长来源(秒):`commit` 每写一条 pin 前现调一次,
   * 返回值兜底用 `pinSeconds`/默认值。设置页把粘性做成可调项后,改设置
   * **不用重启**即生效(与 `real.wait_budget_s` 同一套活读风格)。
   */
  pinSecondsOf?: () => number;
  /** 选中后的回调(观测扩展点)。抛错只记 debug,不拖垮请求。 */
  onCommit?: ((realModelId: string, logicalName: string) => void) | null;
  /** `balanced` 的随机源(seed 让测试可复现)。 */
  rng?: RandomSource;
  /** 时钟(测试注入可推进的时钟)。 */
  clock?: Clock;
}

/** 随机源(只需 `next(): [0,1)`)。测试注入可复现序列。 */
export interface RandomSource {
  next(): number;
}

/** 可播种的确定性 PRNG(mulberry32 —— 不依赖任何运行时 API)。 */
export function seededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** 默认随机源(真随机)。 */
export const systemRandom: RandomSource = {
  next: () => Math.random(),
};

/** 负载感知策略的一个候选桶 —— **一个端点(凭据)一个桶**(2026-11-08)。 */
interface Bucket {
  item: ChainItem;
  used: number;
  room: number;
}

/**
 * 选路器。会话 pin、冷却、健康全部**只在内存**(D18 / D19)。
 *
 * ⚠️ 构造签名保持 `(repo, options)` 的兼容形状:`deps` 是**第一个位置参数**,
 * 与 `Router(repo)` 一致;只跑纯内存选路的测试可以直接传 `new InMemoryRouterDeps()`。
 */
export class Router {
  readonly deps: RouterDeps;
  readonly ledger: InflightLedger;
  readonly health: HealthRegistry;
  readonly pins: SessionPinTable;
  readonly onCommit: ((realModelId: string, logicalName: string) => void) | null;
  private readonly pinSeconds: number;
  private readonly pinSecondsOf: (() => number) | null;
  private readonly clock: Clock;
  private readonly rng: RandomSource;
  /** `scheduler.rules` 的供应商冷却覆盖表(5s TTL 缓存,**挂在实例上**)。 */
  private cdRules: CooldownRuleMap | null = null;
  private cdRulesAt = 0;

  constructor(
    deps: RouterDeps | SettingSource | null = null,
    options: RouterOptions = {},
  ) {
    // 兼容形状:`new Router(repo)`(repo 只要带 get_setting 就当作 SettingSource)
    if (deps !== null && typeof (deps as SettingSource).getSetting === "function") {
      const source = deps as SettingSource;
      this.deps = { settings: source, applyCooldownRules: null };
    } else if (deps === null) {
      this.deps = { settings: null, applyCooldownRules: null };
    } else {
      this.deps = deps as RouterDeps;
    }
    this.clock = options.clock ?? systemClock;
    this.pinSeconds = Number(options.pinSeconds ?? DEFAULT_PIN_SECONDS);
    this.pinSecondsOf = options.pinSecondsOf ?? null;
    this.pins = options.pins ?? new SessionPinTable(this.pinSeconds, this.clock);
    // ⚠️ 默认健康表必须挂在**注入的时钟**上:Nexus 里 `EndpointHealth` 的
    // `in_cooldown()` 直接读墙钟,而 Router 与它同源;若这里退回真实 `Date.now()`,
    // 注入时钟的测试就会出现「刚写完冷却就被判已过期」的假象(冷却截止是 epoch 秒)。
    this.health =
      options.health ?? new HealthRegistry({ wallNow: () => this.clock.wallNow() });
    this.ledger =
      options.ledger ??
      new InflightLedger({ maxRecentFn: () => this.recentLimit(), clock: this.clock });
    this.rng = options.rng ?? systemRandom;
    this.onCommit = options.onCommit ?? null;
  }

  // ------------------------------------------------------------------ 选路

  /**
   * 选出本次请求该用的端点。
   *
   * @param chain **已排好序、且已剔除时段禁用项**的端点链(时段判定属于调度器
   *   职责;这里只管「谁空闲、谁排前面」)。⚠️ **必须每个请求重新取** —— 健康状态
   *   是内存态且随时变,在别处缓存了 chain,冷却与在途就会停在旧值上。
   * @param sessionId 会话 id(客户端没带时由上层从首条 user 消息派生)
   * @param needsVision 请求是否带图片。为真时**只从视觉端点里挑** —— 普通端点
   *   接不住图片。带图规则(D30)**对一切调度策略生效**:链上有视觉端点时,
   *   视觉端点占住整条 pool;链上**没有**视觉端点时,pool 就是整条链
   *   (图像桥 / 连接器兜底的场景)。视觉端点全忙 / 全冷却时如实返回
   *   `all_busy` / `all_cooldown`,而不是把图丢给文本模型。
   * @param ignoreCooldown 为真时**无视端点冷却**参加选路 —— 冷却中的端点不再被
   *   跳过。这是**直连真实模型**(名字不在 `logical_model` 表)的请求语义:冷却挡不住
   *   「这一次」尝试,失败照常记冷却、后续请求照旧被冷却挡住,直到成功清零。
   *   逻辑模型档链**不许**传它(默认 `false` = 照旧跳过冷却端点)。
   */
  plan(opts: {
    chain: readonly ChainItem[];
    sessionId?: string;
    needsVision?: boolean;
    ignoreCooldown?: boolean;
    /**
     * 本次报文的 prompt 量(token):装不下它的端点不参与选路。
     *
     * 只给**压缩分块**用(块大小是按窗口算的):同一个逻辑模型下可能挂着 64k
     * 与 1M 两种成员,按最小成员切块会让块数翻几倍。给了这个约束,块就能按
     * 「真实模型能装下的最大窗口」来切,再由选路保证落到装得下的那台上。
     *
     * `null`/`0`/缺省 = 不约束(普通对话的语义不变)。
     */
    minInputTokens?: number | null;
  }): Plan {
    const chain = opts.chain;
    const sessionId = opts.sessionId ?? "";
    const needsVision = opts.needsVision ?? false;
    const ignoreCooldown = opts.ignoreCooldown ?? false;
    const minInputTokens =
      typeof opts.minInputTokens === "number" && Number.isFinite(opts.minInputTokens) && opts.minInputTokens > 0
        ? Math.floor(opts.minInputTokens)
        : 0;

    if (!chain || chain.length === 0) {
      return planResult(null, "all_blackout");
    }

    const now = this.clock.wallNow();

    // 把内存里的健康记录注入端点(链来自 Repo,自己不带最新状态)
    const items = chain.map((item) =>
      withHealth(item, this.health.get(item.endpoint.endpointId)),
    );

    // 带图请求选路(D30):链上有视觉端点 → pool 收窄成视觉端点,非视觉端点完全不参与;
    // 链上**没有**视觉端点 → pool 就是整条链(图像桥 / 连接器兜底处理图片)。
    let pool = items;
    if (needsVision) {
      const vision = items.filter((it) => it.endpoint.supportsVision);
      if (vision.length > 0) {
        pool = vision;
      }
    }

    // 输入窗口约束(仅压缩分块):装不下这条报文的端点不参与。
    // ⚠️ **全滤光时不过滤**:否则会变成 all_busy,而真正该走的兜底是
    // 「让更小的窗口试一次、失败就减半重切」—— 那条路在调用方。
    if (minInputTokens > 0) {
      const fits = pool.filter((item) => {
        const window = item.endpoint.maxInputTokens;
        // `null`/0 = 这个端点没声明窗口:保留,不能凭未知就排除它。
        return window === null || window <= 0 || window >= minInputTokens;
      });
      if (fits.length > 0) pool = fits;
    }

    // 1) 会话亲和:跨优先级优先回到粘住的那台
    const pinned = this.pins.get(sessionId);
    if (pinned) {
      const wanted = pinned;
      let onChain = false;
      for (const item of pool) {
        if (item.endpoint.endpointId !== wanted) {
          continue;
        }
        onChain = true;
        // 冷却中的粘住端点:解除 pin 换档(默认)。直连无视冷却(`ignoreCooldown`)
        // 时**保留** pin 并照常尝试它 —— 冷却只该挡后续请求,不该挡「直连的这一次」。
        if (inCooldown(item.endpoint.health ?? emptyHealthRecord(), now) && !ignoreCooldown) {
          this.pins.drop(sessionId, wanted);
          break;
        }
        if (this.ledger.hasRoom(item.endpoint.endpointId, item.endpoint.concurrency)) {
          return planResult(item, "affinity", true);
        }
        // ⚠️ 只是**忙**不是故障:端点一秒后就空出来,粘住必须保留 ——
        // 在这里解除 pin 会在并发高峰期正好摧毁亲和。
        break;
      }
      // 只有「真出问题了」才解除粘住:进冷却,或已不在链上(下线/被删;带图请求时,
      // 粘在非视觉端点上 = 不在视觉池里,同样解除)。
      if (!onChain) {
        this.pins.drop(sessionId, wanted);
      }
    }

    // 2) 负载感知策略:选择动作**必须在这里做**,因为只有这里拿得到实时在途数
    const strategy = chain[0]?.strategy ?? "";
    if (LOAD_AWARE_STRATEGIES.has(strategy)) {
      return this.planLoadAware(pool, strategy, ignoreCooldown);
    }

    // 3) 按序分配:pool 的顺序就是调度顺序,取第一台可用的
    const healthy = pool.filter(
      (item) => ignoreCooldown || !item.endpoint.inCooldown(now),
    );
    if (healthy.length === 0) {
      return planResult(null, "all_cooldown");
    }
    for (const item of healthy) {
      // ⚠️ 容量键是**端点(凭据)**,不是真实模型(2026-11-08):同一模型下三个
      // 凭据 concurrency=1 就是三个并发位,链上逐个检查即可,不需要再按模型归并。
      if (this.ledger.hasRoom(item.endpoint.endpointId, item.endpoint.concurrency)) {
        return planResult(item, "ordered");
      }
    }
    // 3b) **抢占式兜底**(m02240):直连请求的槽位满了,但桶里还有**可让的逻辑
    //     租约** → 照样把它选出来,让 `commit` 走抢占路径(踢掉一条逻辑租约)。
    //
    //     ⚠️ 这段是抢占能真正生效的**前提**:没有它,`plan` 在满桶时直接返回
    //     `all_busy`,请求在**选路**阶段就被 503 挡掉,根本走不到 `commit`
    //     里的 `acquireDirect` —— 抢占逻辑写了等于没写。
    //
    //     ⚠️ 只对**直连**条目放行(优先级高于任何逻辑模型成员);逻辑模型
    //     之间不互抢(那会让整条档链互相踩,谁都跑不完)。
    for (const item of healthy) {
      if (item.direct !== true) {
        continue;
      }
      if (this.ledger.hasPreemptable(item.endpoint.endpointId)) {
        return planResult(item, "ordered");
      }
    }
    // 有健康端点但全忙 —— 关键:返回 all_busy 而**不是**冷却,上层据此给「并发已满」
    // 的提示,而不是把这批端点判失败。
    return planResult(null, "all_busy");
  }

  // ------------------------------------------------------- 负载感知策略

  /**
   * `least-busy` / `balanced` 的裁决 —— 两者共用同一份「剩余空位」。
   *
   * ⚠️ 2026-11-08 起**按端点(凭据)分桶**,每桶 = **一个凭据的剩余空位**
   * (`concurrency - 该凭据 inFlight`)。这正是新的并发语义本身:桶与链路上的
   * 端点一一对应,`concurrency` 就是每个凭据的上限。
   *
   * 旧口径(D12)必须先按 `realModelKey` 归并,是因为账本对同一模型的各凭据返回
   * **同一个在途数** —— 逐项加权会让「凭据多的模型」拿到成倍权重、随后被
   * `hasRoom` 挡下(表现为明明还有空位却 all_busy)。现在账本按端点计数,
   * 逐端点分桶反而**正确**:3 个凭据 × concurrency=1 = 3 个桶,各算各的空位。
   *
   * - `least-busy`:取**在途最少**的桶(并列 → 配置序,由链序保证)
   * - `balanced` :按**剩余空位**加权随机 —— 每个空位等概率被选中,
   *   这就是「平均使用」的字面含义
   *
   * ⚠️ 两个策略都**不会**超过任何一个凭据的并发上限:加权用的是
   * `concurrency - inFlight`,等于 0 的桶根本不进候选。
   */
  private planLoadAware(
    pool: readonly ChainItem[],
    strategy: string,
    ignoreCooldown: boolean,
  ): Plan {
    const now = this.clock.wallNow();
    const buckets = new Map<string, Bucket>();
    for (const item of pool) {
      if (item.endpoint.inCooldown(now) && !ignoreCooldown) {
        continue;
      }
      // 容量键 = 端点 id(含 username):一个凭据一个桶,互不共享在途数。
      const key = item.endpoint.endpointId;
      const used = this.ledger.inFlight(key);
      const room = Math.max(0, item.endpoint.concurrency - used);
      const cur = buckets.get(key);
      if (cur === undefined) {
        // ⚠️ 桶内取链序最前的那枚端点(端点顺序 = 凭据序)
        buckets.set(key, { item, used, room });
      } else {
        // 同一端点在同一条链上重复出现(理论上不该有):保守取**更小**的空位
        // (宁可少发一个,也不要超发)。
        cur.room = Math.min(cur.room, room);
        cur.used = Math.max(cur.used, used);
      }
    }

    if (buckets.size === 0) {
      // 一个候选都没有:区分「全冷却」与「全忙」,两者对上层是两回事。
      // 直连无视冷却时桶不可能为空(冷却端点也进了候选),这条分支只可能是「全忙」。
      if (pool.some((item) => item.endpoint.inCooldown(now)) && !ignoreCooldown) {
        return planResult(null, "all_cooldown");
      }
      return planResult(null, "all_busy");
    }

    const roomy = [...buckets.values()].filter((b) => b.room > 0);
    if (roomy.length === 0) {
      return planResult(null, "all_busy");
    }

    // 2026-11-07(修 P4 未生效):负载感知策略不看链序,降级必须在这里体现 ——
    // 只要还有**未降级**的可用桶,就把降级桶排除在候选外(等价于「排到最后」)。
    // 全部候选都降级时仍然用它们:降级 = 少用,不是禁用(禁用是 P0 的事)。
    const preferred = roomy.filter((b) => b.item.degraded !== true);
    const candidates = preferred.length > 0 ? preferred : roomy;

    if (strategy === "least-busy") {
      candidates.sort((a, b) => a.used - b.used || a.item.priority - b.item.priority);
      return planResult(candidates[0].item, "least_busy");
    }

    // balanced:按剩余空位加权随机
    const total = candidates.reduce((sum, b) => sum + b.room, 0);
    let pick = this.rng.next() * total;
    for (const b of candidates) {
      pick -= b.room;
      if (pick <= 0) {
        return planResult(b.item, "balanced");
      }
    }
    return planResult(candidates[candidates.length - 1].item, "balanced");
  }

  // ------------------------------------------------------- 落账 / 收尾

  /**
   * 选路成功后的落账:占在途租约(**容量键 = 端点/凭据**,见 `InflightLedger`;
   * `realModelId` 只用于展示聚合与抢占标记)+ 建立/续期会话 pin。
   *
   * @returns 租约句柄。**必须**原样交回 {@link finish} 才能精确释放。
   *
   * ⚠️ 会话 pin 只在**尚未指向任何端点**时才写(2026-10-13)。以前无条件覆盖:
   * 同一会话的 N 个并发请求会把 pin 依次推到第 N 档 —— 第 1 个占住首选后,
   * 第 2 个顺延到次选并**覆盖**掉 pin,第 3 个再推到第 3 档。于是下一轮顺序
   * 请求回到**最后**那一档,恰恰是刚被最重的并发请求占过的那台。亲和存在的
   * 唯一理由(长会话固定同一模型,prompt cache 才命中)因此被并发反向摧毁。
   *
   * ⚠️ **直连条目走抢占式 acquire**(m02240):`planItem.direct === true` 时
   * 用 {@link InflightLedger.acquireDirect} —— 并发槽被逻辑请求占满就踢掉
   * 该真实模型上**最新入队**的逻辑租约(记 PREEMPT_ERROR),把容量让给直连。
   * 无可抢占对象(全为直连在途)时返回 `""`,调用方按「无可用上游」处理。
   */
  commit(
    planItem: Plan["item"],
    opts: {
      sessionId?: string;
      logicalName?: string;
      stream?: boolean;
      /**
       * 被抢占时的通知回调(m02240)—— 直连请求挤掉本租约时被调用,
       * 用来打断本请求自己的上游调用。
       *
       * ⚠️ 只对**逻辑**租约有意义:直连租约不被抢占(见 `acquireDirect`)。
       */
      onPreempt?: PreemptNotifier;
    } = {},
  ): string {
    if (planItem === null || planItem === undefined) {
      return "";
    }
    const ep = planItem.endpoint;
    const sessionId = opts.sessionId ?? "";
    const logicalName = opts.logicalName ?? "";
    let leaseId: string;
    if (planItem.direct === true) {
      // 直连:抢占式获取。null = 该真实模型上全是直连在途,没有可让的逻辑租约。
      const preempted = this.ledger.acquireDirect(
        ep.realModelKey,
        ep.concurrency,
        {
          endpointId: ep.endpointId,
          logicalModel: logicalName,
          sessionId,
          stream: opts.stream ?? false,
        },
      );
      if (preempted === null) return "";
      leaseId = preempted;
    } else {
      leaseId = this.ledger.acquire(ep.realModelKey, {
        endpointId: ep.endpointId,
        logicalModel: logicalName,
        sessionId,
        stream: opts.stream ?? false,
        // ⚠️ 登记抢占回调:直连请求挤掉本租约时,靠它打断本请求的上游调用。
        onPreempt: opts.onPreempt,
      });
    }
    // 「已有 pin 就不覆盖」—— 并发请求顺延到别的档是**临时的**,不该改写会话的长期归属。
    if (!this.pins.get(sessionId)) {
      this.pins.set(
        sessionId,
        ep.endpointId,
        this.pinSecondsOf !== null ? this.pinSecondsOf() : undefined,
      );
    }
    if (this.onCommit !== null) {
      try {
        this.onCommit(ep.realModelKey, logicalName);
      } catch {
        // 观测回调不该拖垮请求
      }
    }
    return leaseId;
  }

  /** 续期在途租约(流式每收到一个 chunk 调一次)。不存在返回 `false`。 */
  touch(leaseId: string): boolean {
    return this.ledger.touch(leaseId);
  }

  /**
   * 请求结束:**释放在途租约** + 记成败;失败时额外解除会话 pin + 端点熔断。
   *
   * @param leaseId {@link commit} 返回的句柄。按句柄**精确**释放 —— 账本不再猜
   *   「该丢哪一条」。缺句柄(未升级的调用点)时退回清掉该真实模型上的一条,
   *   避免永久泄漏。
   * @param cooldownUntil 上游给的**绝对**冷却截止时刻(epoch 秒),由调用方从
   *   `UpstreamError.retryAfter` 算出来。给了就**压过** provider 覆盖与全局 floor ——
   *   见 {@link CooldownHint} 的三层优先级。不传就是现行为:走覆盖链。
   *
   * ⚠️ 成功时**绝不**解除 pin —— 每轮都 unpin 等于根本没有会话亲和:额度刷新
   * 触发的重排会把长会话在几个模型之间来回甩,prompt cache 全失效。
   *
   * ⚠️ `kind` / `status` 必须由调用方**如实传**:否则面板上「密钥失效」和
   * 「上游超时」长得一模一样,都只能显示成一句没有信息量的空白。
   */
  finish(
    planItem: Plan["item"],
    opts: {
      leaseId?: string;
      sessionId?: string;
      ok?: boolean;
      error?: string;
      kind?: string;
      status?: number;
      latencyMs?: number;
      ttftMs?: number | null;
      promptTokens?: number;
      completionTokens?: number;
      cachedTokens?: number;
      cooldownUntil?: number | null;
      /**
       * 本次尝试**作废**:只释放租约 —— 既不记成功也不记失败、不冷却、不动 pin。
       *
       * 用于「客户端参数与上游不兼容,丢掉参数重试」(2026-10-24 m09081 的
       * `reasoning_effort` 被上游拒):上游拒绝的是**参数**,端点本身一次都没失败
       * 过 —— 记成功是虚假吞吐,记失败会让无辜端点吃 15 分钟冷却。
       *
       * ⚠️ 与 {@link preempted} 同一类语义(「这次不算」),只是原因不同:
       * 抢占是别人要位置,作废是我们自己的参数不对。
       */
      voidAttempt?: boolean;
      /**
       * 本次是被**直连请求抢占**的(m02240)—— 不是上游失败。
       *
       * ⚠️ 这个标志必须由调用方如实传:被抢占的请求**没做错任何事**,端点是
       * 健康的、只是「直连优先级更高」。按普通失败记账会给无辜端点记一次连续
       * 失败 + 15 分钟冷却 —— 那个端点其实一次都没失败过。
       *
       * ⚠️ 同时**不解除会话粘性**:抢占不是「这个端点坏了」,粘性该留。
       */
      preempted?: boolean;
    } = {},
  ): void {
    if (planItem === null || planItem === undefined) {
      return;
    }
    const ep = planItem.endpoint;
    const sessionId = opts.sessionId ?? "";
    const ok = opts.ok ?? true;
    const preempted = opts.preempted === true;
    const voidAttempt = opts.voidAttempt === true;
    const latencyMs = opts.latencyMs ?? 0;
    const ttftMs = opts.ttftMs ?? null;
    const promptTokens = opts.promptTokens ?? 0;
    const completionTokens = opts.completionTokens ?? 0;
    const cachedTokens = opts.cachedTokens ?? 0;

    // 后五项给了任何一个就会进**保留区和滚动指标**;一个都不给就只释放,保持旧行为。
    const counted =
      Boolean(latencyMs) ||
      Boolean(ttftMs) ||
      Boolean(promptTokens) ||
      Boolean(completionTokens) ||
      Boolean(cachedTokens);
    const outcome: RequestOutcome | null = counted
      ? {
          ok,
          status: opts.status ?? 0,
          error: opts.error ?? "",
          latencyMs: Math.trunc(latencyMs || 0),
          ttftMs: ttftMs === null || ttftMs === undefined ? null : Math.trunc(ttftMs),
          promptTokens: Math.trunc(promptTokens || 0),
          completionTokens: Math.trunc(completionTokens || 0),
          cachedTokens: Math.trunc(cachedTokens || 0),
        }
      : null;

    const leaseId = opts.leaseId ?? "";
    if (leaseId) {
      this.ledger.release(leaseId, { outcome });
    } else {
      // 缺句柄的退路:只清这个**端点(凭据)**的租约(容量键,2026-11-08)。
      this.ledger.releaseBucket(ep.endpointId);
    }

    const hint: CooldownHint | null = ok
      ? { until: null, policy: null }
      : {
          until: opts.cooldownUntil ?? null,
          policy: this.cooldownPolicy(ep.provider),
        };
    // ⚠️ **被抢占 ≠ 上游失败**(m02240):端点一次都没失败过,只是「直连优先级
    // 更高」。按失败记账会给它记一次连续失败 + 15 分钟冷却 —— 那个端点其实
    // 什么都没做错,却被连累了。
    //
    // ⚠️ **作废同理**(m09081):上游拒的是**客户端参数**(reasoning_effort 等),
    // 端点是健康的。两种情况都**完全不动健康账本**(既不记失败也不清成功),
    // 只释放租约。
    if (!preempted && !voidAttempt) {
      const rec = this.health.get(ep.endpointId);
      this.health.put(
        ep.endpointId,
        ok ? noteSuccess(rec, this.clock.wallNow()) : noteFailure(rec, {
          error: opts.error,
          kind: opts.kind,
          status: opts.status,
          now: this.clock.wallNow(),
          hint,
        }),
      );
    }

    // ⚠️ 被抢占 / 作废都**不解除会话粘性**:两者都不是「这个端点坏了」
    // (抢占是别人要位置,作废是我们参数不对),粘性该留 —— 否则一次抢占或一次
    // 参数丢弃就把长会话的固定模型搅乱了。
    if (!ok && !preempted && !voidAttempt) {
      this.pins.drop(sessionId, ep.endpointId);
    }
  }

  // ------------------------------------------------------- 冷却策略

  /**
   * 本次失败要用的冷却策略(只有它的 `cooldownFloorS` 会被用到)。
   *
   * ⚠️ **真实/抽象档在这里没差别**:两档只有 `maxAttempts` 不同,而
   * `cooldownFloorS` 两档**完全一致**(都读 `retry.logical_cooldown`)。
   * 端点熔断是**端点**自己的事,不该跟着「这次谁在调用」换时长:同一个端点被
   * 两个逻辑模型共用时,分档只会让同一个故障被冷却两次不一样久。
   *
   * ⚠️ **供应商级冷却覆盖**(2026-10-16;2026-10-18 起并进 `scheduler.rules`):
   * `cooldownFloorS` 允许按失败端点的 provider 覆盖 —— 优先级
   * `scheduler.rules` 里该 provider 的 `cooldown` 规则(分钟)>
   * `retry.logical_cooldown`(全局)。覆盖是**可选**的,缺省 = 不覆盖。
   *
   * ⚠️ **配置读不动时返回 `null` 而不是抛**:那是「不熔断」(0 秒),而不是让一次
   * 记账把请求路径炸掉 —— 与「配置问题不升级成请求失败」是同一条原则。
   */
  cooldownPolicy(provider = ""): RetryPolicy | null {
    const floor = this.globalCooldownFloorS();
    if (floor === null) {
      return null;
    }
    const overrideMin = this.cooldownMinOverride(provider);
    return {
      maxAttempts: 0,
      cooldownFloorS: overrideMin !== null ? overrideMin * 60.0 : floor,
      baseS: 0,
      factor: 0,
      capS: 0,
      jitterRatio: 0,
      codes: EMPTY_CODES,
    };
  }

  /**
   * 全局冷却时长(秒)= `retry.logical_cooldown`(分钟)× 60。
   *
   * ⚠️ **键缺失 / 值坏了 → 900 秒,不是 0**:Nexus 走
   * `RetryPolicy.of(repo, abstract=False)` → `retry_setting()` → 键缺失时
   * **播种** `RETRY_DEFAULTS["retry.logical_cooldown"] = 15` 后回读,值非法时
   * 「写回默认值再回读」。所以那个函数永远返回一个数,Router 侧拿到的就是
   * 默认的 15 分钟。本方法用 {@link coerceRetryNumber} 等价地做到这点。
   *
   * 只有**读不动**(没有 repo / `get_setting` 抛错)才返回 `null` —— 对应 Nexus
   * `_cooldown_policy` 的 `except` 分支,语义是「本次不熔断」。
   */
  private globalCooldownFloorS(): number | null {
    const source = this.deps.settings;
    if (source === null || source === undefined) {
      return null;
    }
    let raw: unknown;
    try {
      raw = source.getSetting(SETTING_LOGICAL_COOLDOWN);
    } catch {
      return null;
    }
    const minutes = coerceRetryNumber(raw, DEFAULT_LOGICAL_COOLDOWN_MIN);
    return minutes * 60.0;
  }

  /**
   * 供应商级冷却时长覆盖(**分钟**,`null` = 不覆盖)。
   *
   * 优先级(命中即停,**两级**):
   * 1. `scheduler.rules` 里该 provider 的 `cooldown` 规则
   *    (`{"provider": "<id>", "cooldown": 分钟}`),只对写了的供应商生效;
   * 2. 没写到 → `null`,调用方回落全局 `retry.logical_cooldown`。
   *
   * ⚠️ **只做两级**(2026-10-17 用户定案:「逻辑模型成员冷却优先级只做两级,
   * 全局和供应商覆盖」)。更早的两级早已退役、设了不再被读。
   */
  cooldownMinOverride(provider = ""): number | null {
    if (!provider) {
      return null;
    }
    return this.cooldownRules()[provider] ?? null;
  }

  /**
   * 生效中的供应商冷却覆盖表(`scheduler.cooldown_overrides` → `{provider: 分钟}`)。
   *
   * 5s TTL 实例级缓存:热路径不重复 `JSON.parse` 整份配置;面板改完 5s 内生效。
   * ⚠️ 缓存**不能**放模块级 —— 一个进程里可能有多个 repo,那会把 A 库的覆盖表
   * 喂给 B 库。
   */
  private cooldownRules(): CooldownRuleMap {
    const now = this.clock.wallNow();
    if (this.cdRules !== null && now - this.cdRulesAt < RULES_TTL_SECONDS) {
      return this.cdRules;
    }
    let table: CooldownRuleMap;
    if (this.deps.applyCooldownRules) {
      table = this.deps.applyCooldownRules();
    } else {
      table = parseCooldownOverrides(this.readSetting(SETTING_COOLDOWN_OVERRIDES));
    }
    this.cdRules = table;
    this.cdRulesAt = now;
    return table;
  }

  /**
   * 「实时日志」最大显示条数(设置键 `ui.recent_limit`,默认 50)。
   *
   * ⚠️ 这个方法**同时是保留区容量的活来源**:`Router` 把它作为 `maxRecentFn` 交给
   * {@link InflightLedger},账本每次收尾 / purge 时问一次。所以这里**不能**缓存 ——
   * 缓存会让用户在面板上改完条数后要等缓存过期才生效。
   *
   * ⚠️ 读失败 / 没配 / 值非法 → 回落默认 50(观测不该因为设置读不到而把整个视图拖垮)。
   *
   * ⚠️ 解析口径照抄 Nexus 的 `int(raw or default)`:`"3.9"` / `"1e3"` 在 Python 里
   * 会抛 `ValueError` → 回落 50,而不是被截成 3 —— 见 {@link parseStrictInt}。
   */
  recentLimit(): number {
    const raw = this.readSetting(SETTING_RECENT_LIMIT);
    return parseStrictInt(raw, DEFAULT_RECENT_LIMIT, 1);
  }

  /** 读设置;缺失 / 抛错 / 非字符串一律按「没有」处理(返回 `null`)。 */
  private readSetting(key: string): string | null {
    const source = this.deps.settings;
    if (source === null || source === undefined) {
      return null;
    }
    try {
      const raw = source.getSetting(key);
      if (raw === null || raw === undefined) {
        return null;
      }
      return String(raw);
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------ 观测

  /**
   * **解冻一个账号名下的所有端点冷却**(用户 m16528:凭据换新后不必再等旧冷却)。
   *
   * 端点 id 形如 `<provider>/<model>@<provider>/<username>`
   * (见 {@link endpointIdOf}),所以「账号名」就是 `@` 后面最后一段 —— 按它
   * 匹配,一把 key 在多个模型上的冷却一起清掉。
   *
   * @returns 清掉的条数(0 = 本来就没在冷却)
   */
  thawAccount(provider: string, username: string): number {
    if (!username) return 0;
    const suffix = `@${provider}/${username}`;
    return this.health.clearWhere((id) => id.endsWith(suffix));
  }

  /** 排障快照(只含端点名与计数,无凭据,**无 sessionId**)。 */
  snapshot(): RouterSnapshot {
    return {
      inflight: this.ledger.snapshot(),
      inflightTotal: this.ledger.total(),
      inflightKey: "real_model_id", // ⚠️ 展示契约:inflight 仍按真实模型聚合(容量键是端点)
      pinSeconds: this.pinSeconds,
      pins: this.pins.count(),
      health: this.health.snapshot(),
    };
  }
}

/** 排障快照形状(与 Nexus 的 `Router.snapshot()` 一致)。 */
export interface RouterSnapshot {
  /** `{realModelId: 在途数}` */
  inflight: Record<string, number>;
  inflightTotal: number;
  inflightKey: string;
  pinSeconds: number;
  pins: number;
  health: HealthSnapshot;
}

/** 健康账本快照形状。 */
export interface HealthSnapshot {
  tracked: number;
  cooling: number;
  items: Record<string, EndpointHealth>;
}

const EMPTY_CODES: ReadonlySet<string> = new Set<string>();

/** 空健康记录(避免每次 new 一个对象;字段全同默认值)。 */
function emptyHealthRecord(): EndpointHealth {
  return { fails: 0, cooldownUntil: 0, lastError: "", updatedAt: 0, lastKind: "", lastStatus: 0 };
}

/** 给链项挂上健康记录(frozen 风格:换一个新实例,而不是改原对象)。 */
/**
 * 给链项挂上健康记录(frozen 风格:换一个新实例,而不是改原对象)。
 *
 * ⚠️ **不能用 `{ ...item.endpoint }` 展开**:`inCooldown` / `realModelKey` /
 * `username` 是 `withEndpointViews` 用 `Object.defineProperties` 挂的
 * **enumerable: false** 属性,对象展开只复制可枚举自有属性 —— 展开后这三个方法
 * 全部丢失,`plan` 第一步调这里就崩 `inCooldown is not a function`。
 * 改用 `getOwnPropertyDescriptors` 把不可枚举属性一起搬过来;`health` 的
 * descriptor 必须剔除,否则它会把本次注入的 `rec` 又覆盖回旧值。
 */
function withHealth(item: ChainItem, rec: EndpointHealth): ChainItem {
  if (item.endpoint.health === rec) {
    return item;
  }
  const ep = item.endpoint;
  const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(ep);
  // health 由本次注入决定,不沿用旧 descriptor(`delete` 对非可选键不合法)
  const withoutHealth = { ...descriptors } as Record<string, unknown>;
  delete withoutHealth.health;
  const next = Object.defineProperties(
    { ...ep, health: rec },
    withoutHealth as PropertyDescriptorMap,
  ) as Endpoint;
  return { ...item, endpoint: next };
}

// ---------------------------------------------------------------------------
// 端点上的便捷视图(纯函数;不持有状态)
// ---------------------------------------------------------------------------

/** 端点的健康记录;没注入时按「可用」处理(`cooldownUntil <= 0`)。 */
export function healthOf(endpoint: Endpoint, now: number): EndpointHealth {
  const rec = endpoint.health;
  if (rec !== null && rec !== undefined) {
    return rec;
  }
  return emptyHealthRecord();
}

/**
 * 端点是否处于冷却(**墙钟比对**)。
 *
 * 优先看注入的健康记录(内存态真值);没有记录时退回链快照里的 `cooldownUntil`
 * (恒为 0,即「没有失败记录 = 可用」)。
 */
export function endpointInCooldown(endpoint: Endpoint, now: number): boolean {
  const rec = endpoint.health;
  if (rec !== null && rec !== undefined) {
    return inCooldown(rec, now);
  }
  return endpoint.cooldownUntil > 0 && endpoint.cooldownUntil > now;
}

/**
 * 端点熔断的冷却时长(**秒**),用于**展示** —— 库里的 `retry.logical_cooldown`。
 *
 * ⚠️ **只读一次**、只用于展示:真正的熔断在 `Router.finish` 里用
 * `Router.cooldownPolicy().cooldownFloorS`,两者同源(都走同一个设置键),
 * 分钟→秒的换算只有一处。
 *
 * ⚠️ 拿到的是**秒**,不是分钟 —— 单位换算在这一层做完,调用方不必再乘 60。
 */
export function endpointCooldownSeconds(deps: RouterDeps | SettingSource | null): number | null {
  const probe = new Router(deps);
  const policy = probe.cooldownPolicy("");
  return policy === null ? null : policy.cooldownFloorS;
}

/** 现拼标识符 / 领域类型 / 常量的一并再导出(与 `nexus/core/router.py` 同口径)。 */
export * from "./types.js";
