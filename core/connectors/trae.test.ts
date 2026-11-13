/**
 * Trae 连接器测试 —— Cloud-IDE-JWT + AES-128-CBC 解密。
 *
 * 禁止真实网络/真实子进程。
 */

import { describe, it, expect } from "vitest";
import { createCipheriv, createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import {
  TraeAdapter,
  build_headers,
  decrypt_storage_value,
  resolve_api_base,
  resolve_identity,
  normalize_region,
  classify_solo_error,
  TRAE_CODE_ACCOUNT_RESTRICTED,
  parse_expiry,
  trae_refresh_contract,
  build_refresh_body,
  device_proof,
  APP_ID,
  DEFAULT_IDE_VERSION,
  DEFAULT_IDE_VERSION_CODE,
  DEFAULT_API_BASE_CN,
  DEFAULT_API_BASE_AI,
  AUTH_STORAGE_KEY,
} from "./trae.js";
import { UpstreamError } from "./types.js";

// ---------------------------------------------------------------------------
// 测试辅助：生成有效的 AES 加密夹具
// ---------------------------------------------------------------------------

const SALT_A = Buffer.from([
  82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251,
  124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203,
  84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78,
  8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37,
]);

const SALT_B = Buffer.from([
  31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95,
  96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239,
  160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97,
  23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125,
]);

function xorBuffers(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] ^ (b[i] ?? 0);
  }
  return out;
}

/**
 * 生成有效的 AES 加密夹具（与 trae.ts 的 decrypt_storage_value 对应）。
 */
function encrypt_storage_value(plaintext: string): string {
  const random = randomBytes(32);
  const salt = xorBuffers(SALT_A, SALT_B);
  const derived = createHash("sha512")
    .update(Buffer.concat([createHash("sha512").update(random).digest(), salt]))
    .digest();
  const key = derived.subarray(0, 16);
  const iv = derived.subarray(16, 32);

  const body = Buffer.concat([
    createHash("sha512").update(plaintext).digest(),
    Buffer.from(plaintext, "utf-8"),
  ]);
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  const padded = Buffer.concat([cipher.update(body), cipher.final()]);

  const header = Buffer.from([0x74, 0x63, 0x05, 0x10, 0x00, 0x00]);
  return Buffer.concat([header, random, padded]).toString("base64");
}

// ---------------------------------------------------------------------------
// 区域与地址
// ---------------------------------------------------------------------------

describe("normalize_region", () => {
  it("cn → cn", () => {
    expect(normalize_region("cn")).toBe("cn");
  });

  it("ai → ai", () => {
    expect(normalize_region("ai")).toBe("ai");
  });

  it("sg → ai", () => {
    expect(normalize_region("sg")).toBe("ai");
  });

  it("global → ai", () => {
    expect(normalize_region("global")).toBe("ai");
  });

  it("未知 → cn", () => {
    expect(normalize_region("unknown")).toBe("cn");
  });

  it("空 → cn", () => {
    expect(normalize_region("")).toBe("cn");
  });
});

describe("resolve_api_base", () => {
  it("显式 base_url 优先", () => {
    expect(resolve_api_base("https://custom.example.com", "cn")).toBe(
      "https://custom.example.com",
    );
  });

  it("extra api_base 次之", () => {
    expect(resolve_api_base(undefined, "cn", { api_base: "https://extra.example.com" })).toBe(
      "https://extra.example.com",
    );
  });

  it("cn 默认", () => {
    expect(resolve_api_base(undefined, "cn")).toBe(DEFAULT_API_BASE_CN);
  });

  it("ai 默认", () => {
    expect(resolve_api_base(undefined, "ai")).toBe(DEFAULT_API_BASE_AI);
  });
});

// ---------------------------------------------------------------------------
// 身份派生
// ---------------------------------------------------------------------------

describe("resolve_identity", () => {
  it("从 api_key 确定性派生", () => {
    const id1 = resolve_identity("test-key");
    const id2 = resolve_identity("test-key");
    expect(id1.machine_id).toBe(id2.machine_id);
    expect(id1.device_id).toBe(id2.device_id);
  });

  it("不同 api_key 派生不同", () => {
    const id1 = resolve_identity("key1");
    const id2 = resolve_identity("key2");
    expect(id1.machine_id).not.toBe(id2.machine_id);
  });

  it("extra 覆盖", () => {
    const id = resolve_identity("test-key", { machine_id: "custom-machine" });
    expect(id.machine_id).toBe("custom-machine");
  });
});

// ---------------------------------------------------------------------------
// 请求头
// ---------------------------------------------------------------------------

describe("build_headers", () => {
  it("Authorization 是 Cloud-IDE-JWT（非 Bearer）", () => {
    const headers = build_headers("my-token", { machine_id: "m1", device_id: "d1" });
    expect(headers["Authorization"]).toBe("Cloud-IDE-JWT my-token");
  });

  it("包含 x-app-id", () => {
    const headers = build_headers("my-token", { machine_id: "m1", device_id: "d1" });
    expect(headers["x-app-id"]).toBe(APP_ID);
  });

  it("包含 x-machine-id 和 x-device-id", () => {
    const headers = build_headers("my-token", { machine_id: "m1", device_id: "d1" });
    expect(headers["x-machine-id"]).toBe("m1");
    expect(headers["x-device-id"]).toBe("d1");
  });

  it("包含版本头", () => {
    const headers = build_headers("my-token", { machine_id: "m1", device_id: "d1" });
    expect(headers["x-ide-version"]).toBe(DEFAULT_IDE_VERSION);
    expect(headers["x-ide-version-code"]).toBe(DEFAULT_IDE_VERSION_CODE);
  });

  it("包含 User-Agent", () => {
    const headers = build_headers("my-token", { machine_id: "m1", device_id: "d1" });
    expect(headers["User-Agent"]).toBe(`Trae/${DEFAULT_IDE_VERSION}`);
  });
});

// ---------------------------------------------------------------------------
// AES 解密
// ---------------------------------------------------------------------------

describe("decrypt_storage_value", () => {
  it("正常解密", () => {
    const plaintext = "test-access-token-123";
    const encrypted = encrypt_storage_value(plaintext);
    expect(decrypt_storage_value(encrypted)).toBe(plaintext);
  });

  it("解密 JSON 对象", () => {
    const plaintext = JSON.stringify({ token: "abc", expires: 1234567890 });
    const encrypted = encrypt_storage_value(plaintext);
    expect(decrypt_storage_value(encrypted)).toBe(plaintext);
  });

  it("密文过短抛错", () => {
    expect(() => decrypt_storage_value("c2hvcnQ=")).toThrow(UpstreamError);
  });

  it("未知加密头抛错", () => {
    const raw = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), randomBytes(200)]);
    expect(() => decrypt_storage_value(raw.toString("base64"))).toThrow(UpstreamError);
  });

  it("完整性校验失败抛错", () => {
    // 生成有效密文后篡改
    const plaintext = "test";
    const encrypted = encrypt_storage_value(plaintext);
    const raw = Buffer.from(encrypted, "base64");
    raw[raw.length - 1] ^= 0xff; // 篡改最后一个字节
    expect(() => decrypt_storage_value(raw.toString("base64"))).toThrow(UpstreamError);
  });
});

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

describe("classify_solo_error", () => {
  it("1005 → rate_limit", () => {
    const err = classify_solo_error(1005);
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("4001 → bad_request", () => {
    const err = classify_solo_error(4001);
    expect(err.kind).toBe("bad_request");
    expect(err.retryable).toBe(false);
  });

  it("401 → auth", () => {
    const err = classify_solo_error(401);
    expect(err.kind).toBe("auth");
    expect(err.retryable).toBe(false);
  });

  it("429 → rate_limit", () => {
    const err = classify_solo_error(429);
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("500 → upstream", () => {
    const err = classify_solo_error(500);
    expect(err.kind).toBe("upstream");
    expect(err.retryable).toBe(true);
  });

  it("4017(账号临时限制)→ rate_limit + 可换号(2026-11-11 巡检新增语义)", () => {
    // 依据 docs/ban-watch.md 2026-11-11:上游插件 PR #84 把 4017 映射
    // 429/soft_rate 交由号池切换。此前它落到 bad_request(不可重试)→ 不换号,
    // 一个被临时限制的账号会把后续请求全吃掉。
    const err = classify_solo_error(TRAE_CODE_ACCOUNT_RESTRICTED);
    expect(TRAE_CODE_ACCOUNT_RESTRICTED).toBe(4017);
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
    expect(err.httpStatus).toBe(429);
    expect(err.message).toContain("临时限制");
  });

  it("4017 与 11140(永久封禁)处置不同:不删凭据、不熔断渠道", () => {
    // 4017 是可自解的临时限制,只换号;workbuddy 的 11140 才是不可逆的账号级封禁。
    // 这里用「分类是 rate_limit 而不是 auth」来体现:auth 会触发凭据处置路径。
    expect(classify_solo_error(TRAE_CODE_ACCOUNT_RESTRICTED).kind).not.toBe("auth");
  });

  it("4017 不会盖住既有的确定性错误码", () => {
    // 回归保护:加上 4017 分支后,原有的 4001/401/429/5xx 语义不受影响。
    expect(classify_solo_error(4001).kind).toBe("bad_request");
    expect(classify_solo_error(401).kind).toBe("auth");
    expect(classify_solo_error(429).kind).toBe("rate_limit");
    expect(classify_solo_error(503).kind).toBe("upstream");
  });
});

// ---------------------------------------------------------------------------
// 过期时间解析
// ---------------------------------------------------------------------------

describe("parse_expiry", () => {
  it("毫秒时间戳 → 秒", () => {
    const ms = 1_700_000_000_000; // 2023-11-14
    const seconds = parse_expiry(ms);
    expect(seconds).toBe(1_700_000_000);
  });

  it("秒时间戳 → 秒", () => {
    const seconds = parse_expiry(1_700_000_000);
    expect(seconds).toBe(1_700_000_000);
  });

  it("ISO 字符串 → 秒", () => {
    const iso = "2023-11-14T00:00:00Z";
    const seconds = parse_expiry(iso);
    // 2023-11-14T00:00:00Z = 1699920000 秒
    expect(seconds).toBe(1699920000);
  });

  it("无效值 → Infinity", () => {
    expect(parse_expiry("invalid")).toBe(Number.POSITIVE_INFINITY);
  });
});

// ---------------------------------------------------------------------------
// 刷新
// ---------------------------------------------------------------------------

describe("trae_refresh_contract", () => {
  it("cn → ono9krqynydwx5", () => {
    const contract = trae_refresh_contract("cn");
    expect(contract.clientId).toBe("ono9krqynydwx5");
    expect(contract.needsDeviceProof).toBe(false);
  });

  it("ai → en1oxy7wnw8j9n + DeviceProof", () => {
    const contract = trae_refresh_contract("ai");
    expect(contract.clientId).toBe("en1oxy7wnw8j9n");
    expect(contract.needsDeviceProof).toBe(true);
  });
});

describe("build_refresh_body", () => {
  it("cn 无 DeviceProof", () => {
    const contract = trae_refresh_contract("cn");
    const body = build_refresh_body(contract, "refresh-123", "user-1");
    expect(body["ClientID"]).toBe("ono9krqynydwx5");
    expect(body["RefreshToken"]).toBe("refresh-123");
    expect(body["UserID"]).toBe("user-1");
    expect(body["DeviceProof"]).toBeUndefined();
  });

  it("ai 有 DeviceProof", () => {
    const contract = trae_refresh_contract("ai");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const body = build_refresh_body(
      contract,
      "refresh-123",
      "user-1",
      { machine_id: "m1", device_id: "d1" },
      pem,
    );
    expect(body["DeviceProof"]).toBeDefined();
    expect((body["DeviceProof"] as { Signature: string }).Signature).toBeDefined();
  });
});

describe("device_proof", () => {
  it("生成签名", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const proof = device_proof(pem, { machine_id: "m1", device_id: "d1" });
    expect(proof.Signature).toBeDefined();
    expect(typeof proof.Signature).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// TraeAdapter
// ---------------------------------------------------------------------------

describe("TraeAdapter", () => {
  it("vendorId 是 trae", () => {
    const adapter = new TraeAdapter();
    expect(adapter.vendorId).toBe("trae");
  });

  it("getToken 返回 api_key 作为 accessToken", async () => {
    const adapter = new TraeAdapter();
    const token = await adapter.getToken({ apiKey: "my-api-key" });
    expect(token.accessToken).toBe("my-api-key");
  });

  it("getToken 缺少 api_key 抛错", async () => {
    const adapter = new TraeAdapter();
    await expect(adapter.getToken({})).rejects.toThrow(UpstreamError);
  });

  it("decorateRequest 注入 Cloud-IDE-JWT 头", () => {
    const adapter = new TraeAdapter();
    const decorated = adapter.decorateRequest(
      { headers: {} },
      { accessToken: "my-token", expiresAt: Number.POSITIVE_INFINITY },
    );
    expect(decorated.headers["Authorization"]).toBe("Cloud-IDE-JWT my-token");
  });

  it("classifyError 200 + code=1005 → rate_limit", () => {
    const adapter = new TraeAdapter();
    const err = adapter.classifyError(200, { code: 1005 });
    expect(err.kind).toBe("rate_limit");
  });

  it("classifyError 401 → auth", () => {
    const adapter = new TraeAdapter();
    const err = adapter.classifyError(401, {});
    expect(err.kind).toBe("auth");
  });
});
