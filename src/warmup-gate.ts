/**
 * 启动后**首次额度预热**：先刷全部渠道的额度/到期时间，再允许调度。
 *
 * ## 为什么要这一步
 *
 * `due-first` 的 T3 消耗档按**到期时间升序**排（快到期的先上）。但到期时间来自
 * 运行期额度快照（`chQuotaCache` → `chQuotaTableForScheduler()`），**进程刚起来
 * 时它是空的** —— 于是所有成员排序键并列，退化成「按 members 数组序」，等于
 * 策略失效（用户 m17562/m34799 的同一个坑）。
 *
 * 以前靠「请求路径顺手刷」兜底（`Scheduler._maybeRefreshQuotas` 是
 * fire-and-forget）：**那一次的排序已经用旧/空快照算完了**，要等下一个请求
 * 才吃到新值。启动后第一次请求因此总是排错序。
 *
 * ## 语义（用户 2026-11-16 定案）
 *
 * - **启动后首次调度前**强制刷新一遍全部渠道的额度（`force=true`，不吃冷却）；
 * - **先更新、再调度**：刷完才放行，不在刷的过程中拿空快照排一次；
 * - **允许首次有等待时间**：第一次请求可以因此变慢，但顺序是对的。
 *
 * ## 为什么要做成「门」而不是「直接 await」
 *
 * 刷新要打多个上游（每个渠道 1–N 次），可能几秒到十几秒；而 `buildGatewayRoutes`
 * 是同步的，不能在里面 await 一整个刷新。所以做成一个**惰性门**：路由在真正
 * `resolveUpstream` 之前 `await gate()`，第一个请求触发刷新并等待，后续请求
 * 直接放行（门已开）。
 *
 * 失败策略：刷新抛错 / 超时都**放行**（记 warn）—— 预热是优化，不是正确性前提；
 * 让请求因为预热失败而不可用是本末倒置。
 */

export interface WarmupGateOptions {
  /**
   * 执行一次全渠道强制刷新。
   *
   * 由装配层注入（面板的 `syncAllQuota(true)`）—— 这里不 import 面板，
   * 保持 `src/` 与 `panel/` 的单向依赖。
   */
  refresh: () => Promise<unknown>;
  /** 日志（缺省 console）。 */
  logger?: Pick<Console, "warn" | "info">;
  /** 整体超时毫秒；超时即放行（缺省 30s）。 */
  timeoutMs?: number;
  /** 注入时钟（测试用）。 */
  now?: () => number;
  /**
   * 「还有没有有效到期数据」的判定（缺省恒 `false` = 只在启动后首次触发）。
   *
   * 用户 2026-11-16 定案：**没有有效数据时也要先更新再调度**。所以这个门不只
   * 在启动后开一次 —— 只要判定说「快照无效」（空 / 全部过期 / 全部 error），
   * 下一次调度前就再强制刷一轮。
   *
   * 判定必须**廉价**（内存快照读，不打上游）：它在每个请求的调度前都会跑一次。
   */
  needsRefresh?: () => boolean;
  /**
   * 两次「无有效数据」触发的**最小间隔**（毫秒，缺省 60s）。
   *
   * 为什么需要：上游真挂了的时候快照永远是空的，不加节流就变成「每个请求都
   * 先打一轮全渠道探针」—— 把一次故障放大成持续加压。冷却到了才再试。
   */
  retryAfterMs?: number;
}

export interface WarmupGate {
  /** 等待预热完成（幂等：多次调用共享同一个 Promise）。 */
  wait(): Promise<WarmupOutcome>;
  /** 预热是否已结束（不论成败）。 */
  settled(): boolean;
  /** 预热结果（未结束返回 null）。 */
  outcome(): WarmupOutcome | null;
}

export interface WarmupOutcome {
  /** 是否成功刷完（false = 抛错或超时，已放行）。 */
  ok: boolean;
  /** 是否超时。 */
  timedOut: boolean;
  /** 耗时毫秒。 */
  elapsedMs: number;
  /** 失败原因（ok=true 时为 null）。 */
  error: string | null;
  /**
   * 这一轮为什么刷。
   *
   * - `startup`：进程启动后第一次调度前（用户定案：先更新再调度）；
   * - `stale`：快照无效（空 / 全过期 / 全 error）——「没有有效数据时先更新再调度」；
   * - `throttled`：需要刷但还在冷却里，本轮**没刷**、直接放行。
   */
  reason: "startup" | "stale" | "throttled";
}

/**
 * 建一个「首次调度前必须等一次全渠道额度刷新」的门。
 *
 * ⚠️ 只在**第一个** `wait()` 触发刷新；之后的 `wait()` 立即返回同一个结果。
 * 这样并发进来的多个请求共享一次刷新，不会 N 个请求打 N 轮上游。
 *
 * ⚠️ 2026-11-16 扩展：`needsRefresh()` 为真时（快照无效），**每次** `wait()`
 * 都重新刷一轮（受 `retryAfterMs` 节流）。这样「上游一开始拿不到数据、后来
 * 恢复了」也能自愈，不需要重启进程。
 */
export function createWarmupGate(opts: WarmupGateOptions): WarmupGate {
  const logger = opts.logger ?? console;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const retryAfterMs = opts.retryAfterMs ?? 60_000;
  const now = opts.now ?? Date.now;

  let promise: Promise<WarmupOutcome> | null = null;
  let result: WarmupOutcome | null = null;
  /** 上一轮**真的发起了刷新**的时刻（节流用；`throttled` 不更新它）。 */
  let lastRunAt: number | null = null;

  const run = async (reason: WarmupOutcome["reason"]): Promise<WarmupOutcome> => {
    const t0 = now();
    lastRunAt = t0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
        // 别让这个定时器拖住进程退出（Node 专有；浏览器侧 undefined 安全）。
        (timer as unknown as { unref?: () => void }).unref?.();
      });
      const outcome = await Promise.race([opts.refresh().then(() => "ok" as const), timeout]);
      const elapsedMs = Math.max(0, now() - t0);
      if (outcome === "timeout") {
        logger.warn?.(`[as-one] 额度预热超时（${timeoutMs}ms），已放行请求；到期排序本轮可能不准`);
        result = { ok: false, timedOut: true, elapsedMs, error: `超时 ${timeoutMs}ms`, reason };
      } else {
        logger.info?.(
          `[as-one] 额度预热完成（${Math.round(elapsedMs)}ms，原因 ${reason}），due-first 到期排序已就绪`,
        );
        result = { ok: true, timedOut: false, elapsedMs, error: null, reason };
      }
      return result;
    } catch (err) {
      const elapsedMs = Math.max(0, now() - t0);
      const message = err instanceof Error ? err.message : String(err);
      // 预热失败**不影响可用性**：放行，只是这一轮排序可能退化成链序。
      logger.warn?.(`[as-one] 额度预热失败（${Math.round(elapsedMs)}ms），已放行请求：${message}`);
      result = { ok: false, timedOut: false, elapsedMs, error: message, reason };
      return result;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };

  return {
    async wait(): Promise<WarmupOutcome> {
      // ── 第一次：无条件刷（启动后先更新再调度）──
      if (promise === null) {
        promise = run("startup");
        return promise;
      }
      await promise;
      // ── 之后：只有「没有有效数据」才再刷，且受节流约束 ──
      if (!opts.needsRefresh?.()) return result as WarmupOutcome;
      const t = now();
      if (lastRunAt !== null && t - lastRunAt < retryAfterMs) {
        return { ok: false, timedOut: false, elapsedMs: 0, error: null, reason: "throttled" };
      }
      promise = run("stale");
      return promise;
    },
    settled(): boolean {
      return result !== null;
    },
    outcome(): WarmupOutcome | null {
      return result;
    },
  };
}
