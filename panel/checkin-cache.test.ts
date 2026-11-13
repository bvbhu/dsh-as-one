/**
 * 签到日缓存的周期键与读写语义(2026-11-07 性能定案)。
 *
 * 盯两件事:
 *   1. 周期切分:qoder 按 10 点、其余按 0 点 —— 10 点前查 qoder 属于「昨天
 *      的周期」,不能提前显示「未签到」;
 *   2. 失败只缓 1 分钟、成功缓到周期结束、invalidate 立即可重查。
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  CHECKIN_ERROR_RETRY_MS,
  checkinCycleKey,
  getCachedCheckin,
  invalidateCheckinCache,
  setCachedCheckin,
} from "./checkin-cache.js";

/** 本地时刻构造(避开时区歧义:测试全在本机时区跑)。 */
const at = (y: number, mo: number, d: number, h = 0, mi = 0): number =>
  new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

describe("checkinCycleKey", () => {
  it("qoder 以 10 点切日:09:59 仍属昨天,10:00 起是新周期", () => {
    // 参照点用中午 12:00(00:00 对 qoder 属于「昨天」的周期,不能当参照)
    const noon = (day: number) => checkinCycleKey("qoder", at(2026, 11, day, 12, 0));
    // 11-07 09:59 → 昨天的活动还没刷新,周期键 = 11-06
    expect(checkinCycleKey("qoder", at(2026, 11, 7, 9, 59))).toBe(noon(6));
    // 11-07 10:00 → 新周期,与当天中午、深夜同键
    expect(checkinCycleKey("qoder", at(2026, 11, 7, 10, 0))).toBe(noon(7));
    expect(checkinCycleKey("qoder", at(2026, 11, 7, 23, 59))).toBe(noon(7));
    expect(checkinCycleKey("qoder", at(2026, 11, 7, 10, 0))).not.toBe(noon(6));
  });

  it("trae / minimax / workbuddy 以 0 点切日", () => {
    for (const pid of ["trae", "minimax", "workbuddy"]) {
      expect(checkinCycleKey(pid, at(2026, 11, 7, 0, 1))).toBe(checkinCycleKey(pid, at(2026, 11, 7, 23, 59)));
      expect(checkinCycleKey(pid, at(2026, 11, 7, 0, 1))).not.toBe(checkinCycleKey(pid, at(2026, 11, 6, 23, 59)));
    }
  });
});

describe("缓存读写", () => {
  afterEach(() => invalidateCheckinCache());

  it("成功结果在同周期内命中,跨周期失效", () => {
    setCachedCheckin("qoder", { checkedIn: 2 }, false, at(2026, 11, 7, 10, 30));
    // 同周期(11-07 10:00 ~ 11-08 10:00)内命中
    expect(getCachedCheckin("qoder", at(2026, 11, 7, 23, 0))?.value).toEqual({ checkedIn: 2 });
    expect(getCachedCheckin("qoder", at(2026, 11, 8, 9, 59))?.value).toEqual({ checkedIn: 2 });
    // 过了 11-08 10:00 → 新周期,旧值作废
    expect(getCachedCheckin("qoder", at(2026, 11, 8, 10, 1))).toBeUndefined();
  });

  it("失败结果只缓 CHECKIN_ERROR_RETRY_MS,过期即让重查", () => {
    const t0 = at(2026, 11, 7, 12, 0);
    setCachedCheckin("trae", { error: "网络抖动" }, true, t0);
    // 重试窗内:仍然返回(调用方拿旧错误,不打上游)
    expect(getCachedCheckin("trae", t0 + 1000)?.failed).toBe(true);
    // 窗外:作废
    expect(getCachedCheckin("trae", t0 + CHECKIN_ERROR_RETRY_MS + 1000)).toBeUndefined();
  });

  it("invalidate 立即生效;按渠道只清自己", () => {
    setCachedCheckin("qoder", 1, false);
    setCachedCheckin("trae", 2, false);
    invalidateCheckinCache("qoder");
    expect(getCachedCheckin("qoder")).toBeUndefined();
    expect(getCachedCheckin("trae")?.value).toBe(2);
    invalidateCheckinCache();
    expect(getCachedCheckin("trae")).toBeUndefined();
  });
});
