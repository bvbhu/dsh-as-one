/**
 * 网关 → 连接器的**凭据透传**口径测试。
 *
 * 背景（2026-11-16 真实故障）：CodeArts 的 AK/SK 存在凭据的 `raw_json` 里
 * （`secret` 列只放得下 AK 一份），但 `connectorExtra()` 的透传白名单里没有
 * `accessKey` / `secretKey` —— 于是 `preparePeer` 拼出的 `creds` 里根本没有
 * 这两个键，连接器直接抛「凭据不完整：需要 accessKey + secretKey」，
 * 客户端看到的是「API 密钥无效」。
 *
 * 这份测试钉的就是「raw_json 里有的、连接器要用的字段，必须被透传」。
 */

import { describe, expect, it, vi } from "vitest";

import { connectorExtra } from "../src/gateway-upstream-peers.js";

/** 假 vault：`get(provider, username)` 回一行凭据。 */
function vaultOf(raw: Record<string, unknown> | null): {
  get: (p: string, u: string) => Promise<{ raw: Record<string, unknown> } | null>;
} {
  return {
    get: vi.fn(async () => (raw === null ? null : { raw })),
  } as never;
}

describe("connectorExtra：凭据字段透传", () => {
  it("CodeArts 的 AK/SK 三元组必须透传（否则报「API 密钥无效」）", async () => {
    const extra = await connectorExtra(
      vaultOf({
        accessKey: "HPUAPUHEEATXNDUPYEEY",
        secretKey: "MPgcVpsAGZ5elvTlFUGzsCT5jSz3OQvpTmBT2JHk",
        securityToken: "STS-TOKEN",
        domainId: "bv_bhu",
      }) as never,
      "codearts",
      "bv_bhu",
    );
    expect(extra.accessKey).toBe("HPUAPUHEEATXNDUPYEEY");
    expect(extra.secretKey).toBe("MPgcVpsAGZ5elvTlFUGzsCT5jSz3OQvpTmBT2JHk");
    expect(extra.securityToken).toBe("STS-TOKEN");
    expect(extra.domainId).toBe("bv_bhu");
  });

  it("expiresAtMs 是数字，必须按数字透传（不能当字符串 trim）", async () => {
    const extra = await connectorExtra(
      vaultOf({ accessKey: "AK", secretKey: "SK", expiresAtMs: 1_800_000_000_000 }) as never,
      "codearts",
      "bv_bhu",
    );
    expect(extra.expiresAtMs).toBe(1_800_000_000_000);
    expect(typeof extra.expiresAtMs).toBe("number");
  });

  it("没有 securityToken（IAM 永久凭据）时不塞空串", async () => {
    const extra = await connectorExtra(
      vaultOf({ accessKey: "AK", secretKey: "SK", securityToken: null }) as never,
      "codearts",
      "bv_bhu",
    );
    expect(extra.accessKey).toBe("AK");
    expect("securityToken" in extra).toBe(false);
  });

  it("原有身份字段照旧透传（region / uid / domain / enterprise_id）", async () => {
    const extra = await connectorExtra(
      vaultOf({
        region: "cn",
        uid: "u1",
        user_id: "u2",
        domain: "www.workbuddy.cn",
        enterprise_id: "ent",
      }) as never,
      "workbuddy",
      "330134472138",
    );
    expect(extra).toEqual({
      region: "cn",
      uid: "u1",
      user_id: "u2",
      domain: "www.workbuddy.cn",
      enterprise_id: "ent",
    });
  });

  it("空白值不透传（trim 后为空就跳过）", async () => {
    const extra = await connectorExtra(
      vaultOf({ accessKey: "  ", secretKey: "SK", region: "" }) as never,
      "codearts",
      "bv_bhu",
    );
    expect("accessKey" in extra).toBe(false);
    expect("region" in extra).toBe(false);
    expect(extra.secretKey).toBe("SK");
  });

  it("凭据不存在 → 空对象，不抛", async () => {
    await expect(connectorExtra(vaultOf(null) as never, "codearts", "x")).resolves.toEqual({});
  });
});
