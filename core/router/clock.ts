/**
 * 时钟注入 —— 选路核心里唯一的时间来源。
 *
 * 为什么必须注入:Nexus 的 ``time.monotonic()``(租约 / pin / 会话序号)与
 * ``time.time()``(冷却截止、墙钟比对)是**两个不同的时钟**,而 TS 侧的
 * ``Date.now()`` 与 ``performance.now()`` 各自对应一个。把它们收在一个接口后面,
 * 测试就能把两个时钟一起拨到任意时刻,既不会 flaky(不依赖真实流逝),
 * 又能精确断言「冷却到绝对时刻」「租期扫掉在途」这类时间语义。
 *
 * ⚠️ 与 Nexus 同口径:**租约 / pin / 会话序号用单调钟**(不受 NTP 校时影响),
 * **冷却截止用墙钟**(要和上游给的 epoch 秒比)。
 */

/** 秒(不是毫秒)。 */
export type Seconds = number;

/**
 * 单调钟:进程内相对时钟,**不受 NTP 校时影响**。
 * 租约租期、会话 pin 租期、会话序号、保留区排序都用它。
 */
export type MonotonicClock = () => Seconds;

/** 墙钟:绝对 epoch 秒。冷却截止、`Retry-After` 换算都用它。 */
export type WallClock = () => Seconds;

/** 两个时钟合起来的最小接口。 */
export interface Clock {
  /** 单调钟(秒)。 */
  monoNow: MonotonicClock;
  /** 墙钟(epoch 秒)。 */
  wallNow: WallClock;
}

/**
 * 生产用默认时钟。
 *
 * - 单调钟 = `performance.now() / 1000`(Node ≥ 8.5 全局可用,`types: ["node"]` 有声明);
 * - 墙钟 = `Date.now() / 1000`(epoch 秒,与 `EndpointHealth.cooldownUntil` 同口径)。
 */
export const systemClock: Clock = {
  monoNow: () => performance.now() / 1000,
  wallNow: () => Date.now() / 1000,
};

/** 一个**固定不动**的时钟(测试基线;要推进就用 {@link mutableClock})。 */
export function fixedClock(at = 0): Clock {
  return { monoNow: () => at, wallNow: () => at };
}

/** 可手动推进的时钟(测试用:``clock.advance(601)``)。 */
export interface MutableClock extends Clock {
  /** 把两个时钟同时往前拨 `delta` 秒。 */
  advance(delta: Seconds): void;
  /** 直接设定(两个时钟同值)。 */
  set(at: Seconds): void;
  /** 当前值(两个时钟同值)。 */
  readonly now: Seconds;
}

/** 构造一个可推进的时钟,初值 `start`(默认 0)。 */
export function mutableClock(start = 0): MutableClock {
  let at = start;
  return {
    get now() {
      return at;
    },
    monoNow: () => at,
    wallNow: () => at,
    advance: (delta: Seconds) => {
      at += delta;
    },
    set: (value: Seconds) => {
      at = value;
    },
  };
}
