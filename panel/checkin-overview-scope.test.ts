/**
 * 签到概览的两条口径(2026-11-09 用户定案)。
 *
 * 1. **trae 逐账号查**:以前走「代表账号」通道(只查第一个带令牌的账号),
 *    2 个账号时 `checkedIn` 只有 0/1、`countExact:false`,页面显示「Trae 已签」
 *    看不出是 1 个还是 2 个签了。改成逐账号后 `countExact:true`,前端能显示
 *    `已签 2/2`(与 minimax/qoder 同口径)。
 *
 * 2. **0 账号直接隐藏行**:渠道支持签到但一个凭据都没有时,`checkedIn`/`pending`
 *    恒为 null,旧逻辑显示「签到未知」看起来像「网关查不出来」。实际上答案是
 *    确定的:**没有账号可签** —— 所以干脆不摆这一行(用户原话「accounts === 0
 *    直接隐藏行」)。
 *
 * 这里只测**纯判定逻辑**(不碰 DB/上游):逐账号计数与隐藏条件的口径。
 */
import { describe, expect, it } from "vitest";

/** 一条账号的签到读数(与 checkinStatus 返回的字段同形)。 */
interface AccountReading {
  checkedIn: boolean | null;
  points: number | null;
}

/**
 * 逐账号聚合(与 panel.ts 的 trae/minimax 分支同口径):
 * `checkedIn` 计已签数、`pending` 计未签数、`dailyCredit` 求和、
 * 各账号积分完全一致才给 `perAccountCredit`。
 */
function aggregate(readings: AccountReading[]): {
  checkedIn: number;
  pending: number;
  dailyCredit: number | null;
  perAccountCredit: number | null;
} {
  let checkedIn = 0;
  let pending = 0;
  let dailyCredit = 0;
  const points: number[] = [];
  for (const r of readings) {
    if (r.points !== null && r.points > 0) {
      dailyCredit += r.points;
      points.push(r.points);
    }
    if (r.checkedIn === true) checkedIn += 1;
    else if (r.checkedIn === false) pending += 1;
  }
  return {
    checkedIn,
    pending,
    dailyCredit: dailyCredit > 0 ? dailyCredit : null,
    perAccountCredit:
      points.length > 1 && new Set(points).size === 1 ? points[0]! : null,
  };
}

describe("trae 逐账号聚合", () => {
  it("两个账号都签了 → checkedIn=2(旧口径只会有 1)", () => {
    const r = aggregate([
      { checkedIn: true, points: 100 },
      { checkedIn: true, points: 100 },
    ]);
    expect(r.checkedIn).toBe(2);
    expect(r.pending).toBe(0);
    // 两账号各 100 → 合计 200,且能给出统一单账号值 100(前端显示 100×2)
    expect(r.dailyCredit).toBe(200);
    expect(r.perAccountCredit).toBe(100);
  });

  it("一个签了一个没签 → checkedIn=1 / pending=1(代表账号通道会显示错)", () => {
    const r = aggregate([
      { checkedIn: true, points: 100 },
      { checkedIn: false, points: 100 },
    ]);
    expect(r.checkedIn).toBe(1);
    expect(r.pending).toBe(1);
  });

  it("两账号积分不同 → perAccountCredit 为 null(不谎报统一值)", () => {
    const r = aggregate([
      { checkedIn: true, points: 100 },
      { checkedIn: true, points: 400 },
    ]);
    expect(r.dailyCredit).toBe(500);
    expect(r.perAccountCredit).toBeNull();
  });
});

describe("0 账号隐藏", () => {
  /** 与 shownCheckinChannels 同口径:0 账号的渠道不展示。 */
  const visible = (channels: Array<{ provider: string; accounts: number }>) =>
    channels.filter((c) => c.accounts > 0).map((c) => c.provider);

  it("0 账号的渠道不出现在概览里", () => {
    expect(
      visible([
        { provider: "trae", accounts: 2 },
        { provider: "workbuddy", accounts: 0 },
        { provider: "minimax", accounts: 2 },
      ]),
    ).toEqual(["trae", "minimax"]);
  });

  it("全部渠道都没账号 → 空列表(不摆空壳行)", () => {
    expect(visible([{ provider: "workbuddy", accounts: 0 }])).toEqual([]);
  });
});
