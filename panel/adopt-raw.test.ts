/**
 * adopt 的两个 bug(2026-11-09,用户「尝试重新导入」时暴露)。
 *
 * ## bug 1:身份字段全丢
 *
 * `adoptChannelAccount` 原来只写 `{source, adopted_at_ms, region}` 三个键,
 * 而 `discoverChannelAccounts` 明明已经解析出 `device_id` / `machine_id` /
 * `user_id` / `edition` / `refresh_token`(在 `extra` 子对象里)。
 * 结果:`bvbhu`(走另一条导入路径)有 18 个键、能正常签到;
 * 通过 adopt 导入的账号只有 3 个键,签到持续被上游回 9074。
 *
 * ## bug 2:时间单位错
 *
 * 字段名是 `adopted_at_ms`(毫秒),但写进去的是 `wallNow()` —— 它返回**秒**。
 * 按毫秒解析落到 1970 年(实测 `1970-01-22 02:21:08`)。
 */
import { describe, expect, it } from "vitest";

/** 与 channels-methods.ts 的 adopt raw 构造同口径(纯逻辑抽取)。 */
function buildAdoptRaw(opts: {
  nowSec: number;
  region?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    source: "discover",
    // ⚠️ wallNow() 返回秒 → 必须 ×1000 才能填 _ms 字段
    adopted_at_ms: Math.round(opts.nowSec * 1000),
  };
  if (opts.region) raw.region = String(opts.region);
  if (opts.extra !== undefined && opts.extra !== null) {
    for (const [k, v] of Object.entries(opts.extra)) {
      if (v === undefined || v === null || v === "") continue;
      if (k === "provider" || k === "token" || k === "region") continue;
      raw[k] = v;
    }
  }
  return raw;
}

describe("adopt raw 构造", () => {
  it("adopted_at_ms 是毫秒,不是秒(不再落到 1970)", () => {
    // 2026-11-09T21:00:00+08:00 的 epoch 秒
    const nowSec = 1794248400;
    const raw = buildAdoptRaw({ nowSec });
    expect(raw.adopted_at_ms).toBe(nowSec * 1000);
    const year = new Date(raw.adopted_at_ms as number).getUTCFullYear();
    expect(year).toBe(2026);
    // 反例:若直接存秒,按毫秒解析会落到 1970
    expect(new Date(nowSec).getUTCFullYear()).toBe(1970);
  });

  it("extra 里的身份字段整包写进 raw(device_id / machine_id / user_id)", () => {
    const raw = buildAdoptRaw({
      nowSec: 1794248400,
      region: "cn",
      extra: {
        device_id: "158024470301",
        machine_id: "4f397e4e",
        user_id: "1294573385294467",
        edition: "cn",
        refresh_token: "rt-xxx",
        host: "https://api.trae.cn",
      },
    });
    expect(raw.device_id).toBe("158024470301");
    expect(raw.machine_id).toBe("4f397e4e");
    expect(raw.user_id).toBe("1294573385294467");
    expect(raw.edition).toBe("cn");
    expect(raw.refresh_token).toBe("rt-xxx");
    // 3 键残缺 → 8 键完整
    expect(Object.keys(raw).length).toBeGreaterThanOrEqual(8);
  });

  it("extra 里的 token 不进 raw(token 走 secret 列,不留第二份明文)", () => {
    const raw = buildAdoptRaw({
      nowSec: 1794248400,
      extra: { token: "should-not-appear", device_id: "d1" },
    });
    expect(raw.token).toBeUndefined();
    expect(raw.device_id).toBe("d1");
  });

  it("extra 里的 region 不覆盖入参 region", () => {
    const raw = buildAdoptRaw({
      nowSec: 1794248400,
      region: "cn",
      extra: { region: "ai" },
    });
    expect(raw.region).toBe("cn");
  });

  it("空值字段被跳过(不写 null/空串污染 raw)", () => {
    const raw = buildAdoptRaw({
      nowSec: 1794248400,
      extra: { device_id: "", machine_id: null, user_id: undefined, edition: "cn" },
    });
    expect("device_id" in raw).toBe(false);
    expect("machine_id" in raw).toBe(false);
    expect("user_id" in raw).toBe(false);
    expect(raw.edition).toBe("cn");
  });
});
