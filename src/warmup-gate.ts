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
 * `resolveUpstream` 之前 `await gate.wait()`，第一个请求触发刷新并等待，后续请求
 * 直接放行（门已开）。
 *
 * ## 2026-11-16 二次修复：超时不能放行
 *
 * 旧实现用 `Promise.race([refresh(), timeout])` 做 30s 超时，超时后 `wait()` 直接
 * resolve —— 但 **refresh 还在后台跑**。于是首个请求拿着「刷新前的空快照」调用
 * `chain()`，due-first 退化成配置序（trae 恒第一），而真正刷到的额度要几分钟后才
 * 被后续请求看到。实测：进程 22:10:39 启动，22:11:05 的首个请求已经落到 trae，
 * codearts 的额度直到 22:15 才到位。
 *
 * 用户已明确接受「首次可以慢」，所以这里改成：
 * - 启动后的第一轮**不设超时**，一直等 refresh 真正 settle（成功或抛错）；
 * - 只有调用方显式传 `timeoutMs`（诊断/可选场景）才启用超时，且超时时 `wait()`
 *   **抛错并挡住请求**，绝不静默放行；后台 refresh 继续跑完、写快照、失效调度器；
 * - 刷新真正抛错 → 放行但记明确的降级日志（没有后台刷新在写快照，不会半份数据）；
 * - 硬超时只产出诊断，wait() 仍等 refresh 真正结束，之后按真实结果返回/失败。
 */
export interface WarmupGateOptions {
  /** 执行一次全渠道强制刷新（由装配层注入面板 `syncAllQuota(true)`）。 */
  refresh: () => Promise<unknown>;
  /** 日志（缺省 console）。 */
  logger?: Pick<Console, "warn" | "info">;
  /**
   * 可选硬超时毫秒。缺省 = 不超时（首轮必须等刷新完成）。
   *
   * ⚠️ 即使显式设置，超时也只产生诊断 outcome，不会提前放行：`wait()` 仍等
   * refresh 真正结束，再按真实结果返回/失败。网关装配层不传此参数。
   */
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
  /** 刷新是否真正结束（超时而后台仍在跑不算）。 */
  settled(): boolean;
  /** 预热结果（未结束返回 null；超时阶段是诊断快照）。 */
  outcome(): WarmupOutcome | null;
}

export interface WarmupOutcome {
  /** 是否成功刷完（false = 抛错或超时）。 */
  ok: boolean;
  /** 是否超时（超时一律挡住请求，不放行）。 */
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
 * 一轮刷新。`settledPromise` 只有 refresh 真正结束才 resolve —— wait() 必须等它；
 * `outcomePromise` 可能更早因硬超时给出诊断结果（但不会放行 chain）。
 */
interface Run {
  outcomePromise: Promise<WarmupOutcome>;
  settledPromise: Promise<void>;
  settled: boolean;
  latest: WarmupOutcome | null;
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
  const retryAfterMs = opts.retryAfterMs ?? 60_000;
  const now = opts.now ?? Date.now;

  let current: Run | null = null;
  /** 结果可重复读：只放「真正结束」的 outcome，不放超时诊断。 */
  let stableResult: WarmupOutcome | null = null;
  /** 上一轮**真的发起了刷新**的时刻（节流用；`throttled` 不更新它）。 */
  let lastRunAt: number | null = null;

  const start = (reason: WarmupOutcome["reason"]): Run => {
    const t0 = now();
    lastRunAt = t0;

    let resolveSettled!: () => void;
    const settledPromise = new Promise<void>((resolve) => {
      resolveSettled = resolve;
    });

    const run: Run = {
      outcomePromise: Promise.resolve({ ok: true, timedOut: false, elapsedMs: 0, error: null, reason }),
      settledPromise,
      settled: false,
      latest: null,
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // ⚠️ 唯一的刷新调用点。无论 race 怎么判，refresh 一直跑到真正 settle；
    // 快照写入 + scheduler.invalidate() 都在 refresh 内部完成。
    // 同步调用（不在微任务里延迟）—— 让「wait() 返回时 refresh 已发起」可被观测，
    // 也让注入的 refresh 的同步部分立刻执行（测试/诊断依赖这一点）。
    let refreshPromise: Promise<unknown>;
    try {
      refreshPromise = Promise.resolve(opts.refresh());
    } catch (err) {
      refreshPromise = Promise.reject(err);
    }

    const finalize = (outcome: WarmupOutcome): void => {
      run.latest = outcome;
      if (!run.settled) {
        run.settled = true;
        stableResult = outcome;
        resolveSettled();
        clearTimer();
      }
    };

    const finished = refreshPromise.then(
      () => {
        const outcome: WarmupOutcome = {
          ok: true,
          timedOut: false,
          elapsedMs: Math.max(0, now() - t0),
          error: null,
          reason,
        };
        logger.info?.(
          `[as-one] 额度预热完成（${Math.round(outcome.elapsedMs)}ms，原因 ${reason}），due-first 到期排序已就绪`,
        );
        finalize(outcome);
        return outcome;
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        // refresh 真正抛错 → 可以放行（没有后台刷新在写快照），但必须说清降级。
        logger.warn?.(
          `[as-one] 额度预热失败（${Math.max(0, Math.round(now() - t0))}ms），放行请求但到期排序不可用：${message}`,
        );
        const outcome: WarmupOutcome = {
          ok: false,
          timedOut: false,
          elapsedMs: Math.max(0, now() - t0),
          error: message,
          reason,
        };
        finalize(outcome);
        return outcome;
      },
    );

    if (opts.timeoutMs !== undefined) {
      // 显式硬超时：只产出诊断 outcome，绝不放行 chain();后台 refresh 继续跑。
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), opts.timeoutMs);
        (timer as unknown as { unref?: () => void }).unref?.();
      });
      run.outcomePromise = Promise.race([
        finished,
        timeout.then(() => {
          const message = `超时 ${opts.timeoutMs}ms（刷新仍在后台进行；已挡住本轮请求，等待刷新完成后重试）`;
          logger.warn?.(`[as-one] ${message}；due-first 到期排序不可用，本轮不放行`);
          const timedOut: WarmupOutcome = {
            ok: false,
            timedOut: true,
            elapsedMs: Math.max(0, now() - t0),
            error: message,
            reason,
          };
          if (run.latest === null) run.latest = timedOut;
          return timedOut;
        }),
      ]);
    } else {
      run.outcomePromise = finished;
    }
    return run;
  };

  return {
    async wait(): Promise<WarmupOutcome> {
      // ── 第一次：无条件刷（启动后先更新再调度）──
      if (current === null) current = start("startup");
      const active = current;
      const outcome = await active.outcomePromise;
      // ⚠️ 关键：即使 outcomePromise 因超时先返回，也要等 refresh 真正结束才放行。
      // 否则 chain() 一定用旧快照（这正是 22:11:06 走 trae 的原因）。
      await active.settledPromise;
      const finalOutcome = active.latest ?? outcome;
      if (finalOutcome.timedOut) {
        throw new Error(finalOutcome.error ?? "额度预热超时，刷新未完成，拒绝按旧快照调度");
      }
      // ── 之后：只有「没有有效数据」才再刷，且受节流约束 ──
      if (!opts.needsRefresh?.()) return finalOutcome;
      const t = now();
      if (lastRunAt !== null && t - lastRunAt < retryAfterMs) {
        return { ok: false, timedOut: false, elapsedMs: 0, error: null, reason: "throttled" };
      }
      current = start("stale");
      const next = current;
      const nextOutcome = await next.outcomePromise;
      await next.settledPromise;
      return next.latest ?? nextOutcome;
    },
    settled(): boolean {
      return current !== null && current.settled;
    },
    outcome(): WarmupOutcome | null {
      if (current !== null && current.settled) return current.latest;
      return stableResult;
    },
  };
}
