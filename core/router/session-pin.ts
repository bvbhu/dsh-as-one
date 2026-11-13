/**
 * SessionPinTable —— `sessionId -> endpointId` 的内存表
 * (从 `nexus/core/router.py:SessionPinTable` 移植,取代已删的 `session_pin` 表)。
 *
 * 用**单调钟**计时:会话租期是纯进程内计时,不受 NTP 校时影响。
 *
 * ⚠️ **重启即失效**:会话 pin 只在内存(D18),重启后第一轮请求会重新选路,
 * 长会话可能因此丢掉一次 prompt cache(已评估为可接受)。
 */

import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { DEFAULT_PIN_SECONDS } from "./types.js";

export interface SessionPinTableOptions {
  /** 会话粘住租期(秒),默认 {@link DEFAULT_PIN_SECONDS}。 */
  ttlSeconds?: number;
  /** 单调钟(测试注入)。 */
  clock?: Clock;
}

export class SessionPinTable {
  private readonly ttl: number;
  private readonly clock: Clock;
  /** `sessionId -> { endpointId, expiresAt }`(单调钟) */
  private readonly pins = new Map<string, { endpointId: string; expiresAt: number }>();

  constructor(ttlSeconds: number = DEFAULT_PIN_SECONDS, clock: Clock = systemClock) {
    this.ttl = Number(ttlSeconds);
    this.clock = clock;
  }

  /** 会话粘住租期(秒)。 */
  get ttlSeconds(): number {
    return this.ttl;
  }

  /** 取粘住的 `endpointId`;不存在或**已过期**返回 `null`(顺带删掉过期项)。 */
  get(sessionId: string): string | null {
    if (!sessionId) {
      return null;
    }
    const now = this.clock.monoNow();
    const hit = this.pins.get(sessionId);
    if (hit === undefined) {
      return null;
    }
    if (hit.expiresAt <= now) {
      this.pins.delete(sessionId);
      return null;
    }
    return hit.endpointId;
  }

  /** 建立 / 续期粘住。空 `sessionId` 直接忽略(不编号、不粘住)。 */
  set(sessionId: string, endpointId: string, ttlSeconds?: number): void {
    if (!sessionId) {
      return;
    }
    this.pins.set(sessionId, {
      endpointId,
      // 按次可选 ttl:Router 活读设置项时逐次传入当前值,
      // 不传则用表构造时的默认。
      expiresAt: this.clock.monoNow() + (Number.isFinite(ttlSeconds as number) ? (ttlSeconds as number) : this.ttl),
    });
  }

  /**
   * 解除粘住。给了 `endpointId` 就**只在指向它时才解**。
   *
   * 「只在指向它时才解」防的是竞态:旧请求的失败回调晚到时,不能把会话从
   * **已经迁移到的新端点**上摘下来。
   */
  drop(sessionId: string, endpointId?: string | null): void {
    if (!sessionId) {
      return;
    }
    const hit = this.pins.get(sessionId);
    if (hit === undefined) {
      return;
    }
    if (endpointId && hit.endpointId !== endpointId) {
      return;
    }
    this.pins.delete(sessionId);
  }

  /** 当前未过期的粘住条数。 */
  count(): number {
    const now = this.clock.monoNow();
    let n = 0;
    for (const { expiresAt } of this.pins.values()) {
      if (expiresAt > now) {
        n += 1;
      }
    }
    return n;
  }

  /** `{sessionId: endpointId}` —— 值是**粘住的端点**,不是过期时刻。 */
  snapshot(): { ttlSeconds: number; active: number; sessions: Record<string, string> } {
    const now = this.clock.monoNow();
    const alive: Record<string, string> = {};
    for (const [sessionId, { endpointId, expiresAt }] of this.pins) {
      if (expiresAt > now) {
        alive[sessionId] = endpointId;
      }
    }
    return {
      ttlSeconds: this.ttl,
      active: Object.keys(alive).length,
      sessions: Object.fromEntries(Object.entries(alive).sort(([a], [b]) => (a < b ? -1 : 1))),
    };
  }
}
