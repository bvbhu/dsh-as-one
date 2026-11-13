/**
 * 账号级**出站节流**(2026-11-08 用户定案,A1)。
 *
 * ## 为什么需要
 *
 * 上游(WorkBuddy)对反代行为的处置是 403 / code 11140「账号存在异常行为」。
 * 调研报告 `docs/workbuddy-alignment.md` §4 的结论是:**不存在不封号的第三方版本**,
 * 能做的只有把「明显的网关特征」消掉。而「高频请求」正是最典型的网关特征之一 ——
 * 官方桌面端是一个人一台机器在聊天,不会一分钟发几十个请求。
 *
 * 之前的 as-one **没有任何 per-account 节流**:DSH 的会话请求、图片解析、
 * 标题生成、面板刷新/签到/额度探针,都可能在几百毫秒内连续打同一个账号。
 *
 * ## 节流放在哪一层 / 为什么
 *
 * 放在**网关选路之后、router.commit 之前**(见 `gateway-upstream.ts` 两处调用):
 * - 这里**唯一**能拿到「这一轮到底用哪个账号」(`item.endpoint.credentialKey[1]`);
 * - 放在 commit **之前**:等待期不占并发租约 —— 若放在 `preparePeer`(commit 之后),
 *   一串排队请求会把 workbuddy 的并发槽位全占住,变成 503「并发已满」,
 *   那是拿一个可用性故障去换一个风控收益;
 * - 连接器层不合适:连接器是**无状态纯装饰**(`getToken` / `decorateRequest`),
 *   它不知道「这是第几次请求」;面板的额度/签到探针也不走连接器。
 *
 * ## 语义
 *
 * **预留时隙**(reserve),不是「等到上一次发完」:
 * 第 N 个并发请求拿到的发送时刻是 `前一保留时刻 + interval`,天然把并发摊成
 * 等间隔序列。所以「同一账号的最小请求间隔」在并发下**真的被守住**,
 * 而不是大家各自等 4 秒然后一起打出去。
 *
 * 代价(必须说清楚):一个账号的请求是**串行化**成 interval 间隔的。单用户
 * 顺序对话通常感觉不到(一问一答本身远慢于 4 秒);但同一账号上并发多路时,
 * 第 N 路最多多等 `N × interval`。这是刻意选择的**保守**:账号安全优先。
 *
 * ⚠️ 间隔**写死**在 {@link ACCOUNT_MIN_INTERVAL_MS}(2026-11-09 用户定案
 * 「写死在 wb 连接器中,不作为可设置项」):它是安全下限,不是使用偏好。
 */

import type { Rng } from "../scheduler/types.js";

/** 节流时隙的键(`<provider>:<username>`)。 */
export function accountThrottleKey(provider: string, username: string): string {
  return `${provider}:${username}`;
}

/**
 * 最小间隔(毫秒)—— **写死 4 秒,不做成设置项**(2026-11-09 用户定案)。
 *
 * 取值理由(保守,但不过分保守):
 * - 官方桌面端真人一问一答的节奏远慢于此,4 秒不会把正常使用变成「卡」;
 * - 又足够把「脚本连续打」这个特征摊开:一分钟最多 15 个请求。
 *
 * ⚠️ 这是**工程经验值**,不是抓包实锤(报告 §5 已标注同类手段属「推测」)。
 *
 * ⚠️ **为什么不做成可配置**(用户原话「写死在 wb 连接器中,不作为可设置项」):
 * 这个值是**账号安全**的下限,不是使用偏好。做成设置项意味着用户可以把
 * 它调成 0(关掉节流)—— 那正是导致 11140 封号的行为,而封号的代价是
 * 凭据被物理删除。安全下限不该交给「顺手调一下」的手感。
 *
 * 要调这个数,改这里 + 重新构建;不要退回设置项。
 */
export const ACCOUNT_MIN_INTERVAL_MS = 4_000;

/** 抖动上限:间隔的 25%,在 `[0, jitterMs)` 内随机 —— 避免机械节拍。 */
export const ACCOUNT_INTERVAL_JITTER_MS = Math.round(ACCOUNT_MIN_INTERVAL_MS * 0.25);

/**
 * @deprecated 旧名(带 DEFAULT_ 前缀,曾由设置项覆盖)。保留别名只为不打断
 * 既有 import;新代码用 {@link ACCOUNT_MIN_INTERVAL_MS}。
 */
export const DEFAULT_ACCOUNT_INTERVAL_MS = ACCOUNT_MIN_INTERVAL_MS;

export interface AccountThrottleOptions {
  /** 墙钟(测试注入;缺省 `Date.now`)。 */
  now?: () => number;
  /** 睡眠(测试注入;缺省真实 `setTimeout`,支持 abort)。 */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** 抖动源(缺省 `Math.random`):在 `[0, jitterMs)` 内再加一点随机,
   *  让多个账号/多路请求的发送时刻不至于呈现同一条「机械节拍」。 */
  jitterMsOf?: () => number;
  rng?: Rng;
}

/** 内存态:每个键的下一个可用时隙(epoch 毫秒)。 */
interface Slot {
  nextFreeMs: number;
  /** 最近一次保留时刻,用于惰性清理(避免 map 无限增长)。 */
  touchedMs: number;
}

/**
 * 账号级出站节流器。
 *
 * ⚠️ **不要做成模块级单例**:插件测试会并行建多个 runtime,模块级状态会串味
 * (后建的覆盖先建的配置)。由装配层建一个、注入网关(与 sensenova key 自愈
 * 槽同一纪律)。
 */
export class AccountThrottle {
  private readonly slots = new Map<string, Slot>();
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly jitterMsOf: () => number;
  private readonly rng: Rng;
  /** 惰性清理阈值:超过这么多键时顺手扫一遍(正常只有个位数账号,不会触发)。 */
  private readonly maxKeys = 256;

  constructor(options: AccountThrottleOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? sleepWithSignal;
    // 抖动缺省 = 间隔的 25%(模块级常量,不再是「谁都能改」的注入项)。
    this.jitterMsOf = options.jitterMsOf ?? (() => ACCOUNT_INTERVAL_JITTER_MS);
    this.rng = options.rng ?? { random: () => Math.random(), uniform: (a, b) => a + (b - a) * Math.random(), shuffle: () => {} };
  }

  /**
   * 纯计算:**预留**这个键的下一时隙,返回需要等待的毫秒数(0 = 立刻可发)。
   *
   * 会把「下一时隙」推进 `interval + jitter` —— 即调用方**承诺**在这段时间内
   * 用掉这个时隙。不 sleep、不抛错,便于单测与「先判容量再决定要不要等」。
   *
   * ⚠️ 间隔是**模块常量** `ACCOUNT_MIN_INTERVAL_MS`,不再从设置读(用户 2026-11-09
   * 定案「写死在 wb 连接器中,不作为可设置项」)。所以这里没有「关闭」分支:
   * 节流永远开着 —— 它是账号安全下限,不该被顺手调成 0。
   */
  reserve(key: string, nowMs: number = this.now()): number {
    const interval = ACCOUNT_MIN_INTERVAL_MS;
    const jitter = Math.max(0, this.jitterMsOf());
    const spacing = interval + (jitter > 0 ? this.rng.random() * jitter : 0);
    const slot = this.slots.get(key);
    const at = Math.max(nowMs, slot?.nextFreeMs ?? 0);
    this.slots.set(key, { nextFreeMs: at + spacing, touchedMs: nowMs });
    this.prune(nowMs, interval);
    return Math.max(0, at - nowMs);
  }

  /**
   * 预约并等到时隙。返回实际等待的毫秒数(便于日志/测试断言)。
   *
   * @param signal 客户端断开 / 抢占的信号:等待期间被 abort 会**立刻**抛
   *   `AbortError`,不把租约和客户端都晾在那里。
   */
  async acquire(key: string, signal?: AbortSignal): Promise<number> {
    const waitMs = this.reserve(key);
    if (waitMs <= 0) return 0;
    await this.sleep(waitMs, signal);
    return waitMs;
  }

  /** 清空全部时隙(凭据被删/熔断恢复后调用,避免带着旧节拍继续)。 */
  reset(key?: string): void {
    if (key === undefined) {
      this.slots.clear();
      return;
    }
    this.slots.delete(key);
  }

  /** 当前已知的键数量(诊断/测试用)。 */
  get size(): number {
    return this.slots.size;
  }

  /**
   * 惰性清理:丢掉「已经不用、且最早就空闲」的键。
   *
   * 条件:键数超过 {@link maxKeys},且该键的空闲时刻已经过去 `interval × 2`
   * (那种键再被用到时 `max(now, nextFree)` 与直接删除等价,删了不改变行为)。
   */
  private prune(nowMs: number, interval: number): void {
    if (this.slots.size <= this.maxKeys) return;
    const cutoff = nowMs - interval * 2;
    for (const [key, slot] of this.slots) {
      if (slot.nextFreeMs <= cutoff) this.slots.delete(key);
    }
  }
}

/**
 * 真实睡眠(可被 abort 打断)。
 *
 * ⚠️ 用 `AbortError` 而不是自定义错误:`gateway-upstream` 的抢占/客户端断开
 * 两条路都以 AbortError 为判据(见 `toGatewayError` 的 name === "AbortError" 分支)。
 */
export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 造一个与 `fetch` 同形的 AbortError(DOMException 在 Node 18+ 全局可用)。 */
function abortError(): Error {
  const err = new Error("This operation was aborted");
  err.name = "AbortError";
  return err;
}
