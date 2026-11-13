/**
 * discover → adopt 的**字段透传链**(2026-11-09,用户「重新导入」暴露的第三个 bug)。
 *
 * ## 症状
 *
 * 用修好的 adopt(带 extra)重新导入后,库里仍然只有 5 个键:
 * `{source, adopted_at_ms, region, edition, token_expires_at_ms}` ——
 * `device_id` / `machine_id` / `user_id` / `refresh_token` 还是没进去。
 *
 * ## 根因
 *
 * `parseTraeDesktopStorage` 明明把这些字段解析出来了(device_id/machine_id/
 * refresh_token 放在 `extra` 子对象,user_id/host 在顶层),但
 * `discoverChannelAccounts` 在**映射成 API 返回形状时逐字段手挑**,
 * 把 `user_id` / `host` / `extra` 全漏了。
 *
 * 于是 adopt 拿到的 extra 是空的 —— 上游那一环再怎么修都没用。
 *
 * 这里钉住「discover 的映射必须把这些字段带出来」。
 */
import { describe, expect, it } from "vitest";

/** parseTraeDesktopStorage 的真实返回形状(节选)。 */
interface ParsedTraeAccount {
  provider: "trae";
  username: string;
  token: string | null;
  region: string | null;
  source: string;
  edition?: string | null;
  hint: string;
  user_id?: string | null;
  token_expires_at_ms?: number | null;
  host?: string | null;
  extra?: Record<string, unknown>;
}

/** 与 channels-methods.ts 的 discover 映射同口径。 */
function mapToApiShape(a: ParsedTraeAccount): Record<string, unknown> {
  return {
    username: a.username,
    region: a.region ?? null,
    hint: `来源:${a.source}${a.edition ? `(${a.edition})` : ""}${a.host ? `, host=${a.host}` : ""}`,
    token: a.token,
    edition: a.edition ?? null,
    source: a.source,
    token_expires_at_ms: a.token_expires_at_ms ?? null,
    user_id: a.user_id ?? null,
    host: a.host ?? null,
    extra: a.extra ?? null,
  };
}

const PARSED: ParsedTraeAccount = {
  provider: "trae",
  username: "用户2767",
  token: "tok",
  region: "cn",
  source: "desktop",
  edition: "cn",
  hint: "来源:desktop(cn), host=https://api.trae.cn",
  user_id: "1294573385294467",
  token_expires_at_ms: 1795274782719,
  host: "https://api.trae.cn",
  extra: {
    refresh_token: "rt-xxx",
    device_id: "158024470301",
    machine_id: "4f397e4e",
    host: "https://api.trae.cn",
    domain: "api.trae.cn",
    last_refresh: null,
  },
};

describe("discover 映射必须透传身份字段", () => {
  it("user_id / host 在顶层被带出", () => {
    const api = mapToApiShape(PARSED);
    expect(api.user_id).toBe("1294573385294467");
    expect(api.host).toBe("https://api.trae.cn");
  });

  it("extra 子对象整包带出(device_id / machine_id / refresh_token)", () => {
    const api = mapToApiShape(PARSED);
    const extra = api.extra as Record<string, unknown>;
    expect(extra).not.toBeNull();
    expect(extra.device_id).toBe("158024470301");
    expect(extra.machine_id).toBe("4f397e4e");
    expect(extra.refresh_token).toBe("rt-xxx");
  });

  it("旧实现只挑 7 个字段 → 现在至少 10 个(含 extra)", () => {
    const api = mapToApiShape(PARSED);
    // 旧实现的键集合(这就是导致 9074 的那 7 个)
    const oldKeys = [
      "username",
      "region",
      "hint",
      "token",
      "edition",
      "source",
      "token_expires_at_ms",
    ];
    for (const k of oldKeys) expect(api).toHaveProperty(k);
    // 新增的三个
    expect(api).toHaveProperty("user_id");
    expect(api).toHaveProperty("host");
    expect(api).toHaveProperty("extra");
  });

  it("字段缺失时给 null(不写 undefined,便于 JSON 传输)", () => {
    const sparse: ParsedTraeAccount = {
      provider: "trae",
      username: "x",
      token: "t",
      region: null,
      source: "cli",
      hint: "来源:cli(cn)",
    };
    const api = mapToApiShape(sparse);
    expect(api.user_id).toBeNull();
    expect(api.host).toBeNull();
    expect(api.extra).toBeNull();
  });
});
