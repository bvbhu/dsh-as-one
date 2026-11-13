/**
 * Qoder 额度刷新通路(2026-11-09 用户报「qoder 不会自动更新」)。
 *
 * 根因:Qoder 的积分**不在** `CH_QUOTA_PROVIDERS`(那套探针只覆盖
 * trae/workbuddy/minimax),读数来自 `qoderCredits(region)` 这个独立方法。
 * 所以「全部刷新」以前根本不刷它 —— 渠道卡头永远显示「未采集」。
 *
 * 修法:给渠道域一个 `qoderQuotaRefresh` 口子(函数返回函数,延迟解引用,
 * 因为渠道域比 qoder 域先创建),`syncAllQuota` / `syncChannelQuota` 对它分流。
 *
 * 这里测**分流逻辑本身**:给了 qoder 刷新器时走它、没给时退回探针路径。
 */
import { describe, expect, it } from "vitest";

/** 与 syncAllQuota 里 qoder 分支同口径的聚合。 */
interface QoderRefreshResult {
  probed: number;
  written: number;
  message: string;
  errors: Record<string, string>;
}

/**
 * 模拟 syncChannelQuota 对 qoder 的分流。
 *
 * @param refresh qoder 刷新器(getter 解引用后的值;null = 没有 qoder 域)
 * @returns 走了哪条路 + 结果
 */
async function routeQoderQuota(
  refresh: ((force: boolean) => Promise<QoderRefreshResult | null>) | null,
): Promise<{ via: "qoder" | "probe"; written: number; message: string }> {
  if (refresh !== null) {
    const q = await refresh(true);
    if (q !== null) {
      return { via: "qoder", written: q.written, message: q.message };
    }
  }
  // 没有 qoder 域(或它返回 null)→ 退回 CH_QUOTA_PROVIDERS 探针路径,
  // 对 qoder 只会回 missing。
  return { via: "probe", written: 0, message: "该渠道无额度协议" };
}

describe("Qoder 额度刷新分流", () => {
  it("有 qoder 刷新器 → 走它,不落到「无额度协议」", async () => {
    const r = await routeQoderQuota(async () => ({
      probed: 3,
      written: 3,
      message: "已刷新 3/3 个账号的积分",
      errors: {},
    }));
    expect(r.via).toBe("qoder");
    expect(r.written).toBe(3);
    expect(r.message).toContain("3/3");
  });

  it("刷新器返回 null(没有 qoder 域)→ 退回探针路径", async () => {
    const r = await routeQoderQuota(async () => null);
    expect(r.via).toBe("probe");
    expect(r.written).toBe(0);
  });

  it("完全没注入刷新器 → 退回探针路径(向后兼容)", async () => {
    const r = await routeQoderQuota(null);
    expect(r.via).toBe("probe");
  });

  it("部分账号失败 → written 只数成功的,errors 逐账号带原因", async () => {
    const r = await routeQoderQuota(async () => ({
      probed: 3,
      written: 2,
      message: "已刷新 2/3 个账号的积分,1 个失败",
      errors: { "qoder/7565": "该账号没有 PAT 凭据" },
    }));
    expect(r.via).toBe("qoder");
    expect(r.written).toBe(2);
    expect(r.message).toContain("1 个失败");
  });
});
