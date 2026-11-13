/**
 * 本机登录态自动发现测试 —— discover.ts(trae CLI/desktop、
 * workbuddy 无)。全部本地文件系统,禁止真实网络。
 *
 * "tc" AES 密文由测试侧按与 trae.ts decrypt_storage_value 完全相同的算法构造
 * (盐值字节与 trae.ts 常量一致,仅用于构造已知密文,验证往返解密)。
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createHash } from "node:crypto";
import {
  discoverTraeAccounts,
  discoverWorkbuddyAccounts,
  parseTraeCliToken,
  parseTraeDesktopStorage,
  traeRegionOf,
  type DiscoveredAccount,
} from "./discover.js";

// ---------------------------------------------------------------------------
// 测试夹具:"tc" AES 加密构造(镜像 trae.ts decrypt_storage_value 的算法)
// ---------------------------------------------------------------------------

/** 与 trae.ts SALT_A / SALT_B 字节一致(仅测试内构造密文用)。 */
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
const HEADER_AES = Buffer.from([0x74, 0x63, 0x05, 0x10, 0x00, 0x00]);

function xorBuffers(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ (b[i] ?? 0);
  return out;
}

/** 构造一条可由 decrypt_storage_value 解开的 "tc" 密文(base64)。 */
function encryptTcStorage(body: string): string {
  const plain = Buffer.concat([createHash("sha512").update(body).digest(), Buffer.from(body, "utf8")]);
  const padLen = 16 - (plain.length % 16);
  const padded = Buffer.concat([plain, Buffer.alloc(padLen, padLen)]);
  const random = createHash("sha256").update(body).digest(); // 32 字节,确定性即可
  const salt = xorBuffers(SALT_A, SALT_B);
  const derived = createHash("sha512")
    .update(Buffer.concat([createHash("sha512").update(random).digest(), salt]))
    .digest();
  const cipher = createCipheriv("aes-128-cbc", derived.subarray(0, 16), derived.subarray(16, 32));
  cipher.setAutoPadding(false);
  const ct = Buffer.concat([cipher.update(padded), cipher.final()]);
  return Buffer.concat([HEADER_AES, random, ct]).toString("base64");
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload)}.${b64url({})}`;
}

// ---------------------------------------------------------------------------
// 夹具:临时目录
// ---------------------------------------------------------------------------

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "as-one-disc-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// trae:desktop storage.json
// ---------------------------------------------------------------------------

describe("parseTraeDesktopStorage", () => {
  it("解析明文 JSON auth 条目(含 region / 到期 / device 回退)", () => {
    const auth = JSON.stringify({
      token: "t-desktop-1",
      account: { username: "tester" },
      userId: "u-1",
      host: "https://api.trae.cn",
      refreshToken: "rt-1",
      expiredAt: 1.8e12,
      userRegion: { region: "cn" },
    });
    const storage = JSON.stringify({
      [AUTH_KEY]: auth,
      [`${DEVICE_PREFIX}dc-1234`]: "device-xyz",
      telemetry: { machineId: "mach-1" },
    });
    const path = join(dir, "storage.json");
    writeFileSync(path, storage, "utf8");

    const acc = parseTraeDesktopStorage(path, "cn");
    expect(acc.provider).toBe("trae");
    expect(acc.username).toBe("tester");
    expect(acc.user_id).toBe("u-1");
    expect(acc.token).toBe("t-desktop-1");
    expect(acc.region).toBe("cn");
    expect(acc.source).toBe("desktop");
    expect(acc.edition).toBe("cn");
    expect(acc.token_expires_at_ms).toBe(1.8e12);
    expect(acc.extra).toMatchObject({
      refresh_token: "rt-1",
      // device_id 取**键名后缀**(键值是密文,不能直接用)。
      device_id: "dc-1234",
      machine_id: "mach-1",
      domain: "api.trae.cn",
    });
    expect(acc.hint).toContain("桌面版");
  });

  it("expiredAt 是 ISO 字符串也能解析成到期(实机 storage.json 形态)", () => {
    const auth = JSON.stringify({
      token: "t-desktop-iso",
      account: { username: "iso-user" },
      userId: "u-iso",
      host: "https://api.trae.cn",
      expiredAt: "2026-11-04T13:34:43.412Z",
    });
    const path = join(dir, "storage-iso.json");
    writeFileSync(path, JSON.stringify({ [AUTH_KEY]: auth }), "utf8");
    const acc = parseTraeDesktopStorage(path, "cn");
    expect(acc.token_expires_at_ms).toBe(Date.parse("2026-11-04T13:34:43.412Z"));
    expect(Number.isFinite(acc.token_expires_at_ms as number)).toBe(true);
  });

  it("解析 'tc' AES 密文 auth 条目(与 decrypt_storage_value 往返)", () => {
    const auth = JSON.stringify({
      token: "t-cipher",
      account: { username: "encrypted-user" },
      userId: "u-c1",
      host: "https://api.trae.ai",
    });
    const storage = JSON.stringify({
      [AUTH_KEY]: encryptTcStorage(auth),
    });
    const path = join(dir, "storage.json");
    writeFileSync(path, storage, "utf8");

    const acc = parseTraeDesktopStorage(path, "sg");
    expect(acc.username).toBe("encrypted-user");
    expect(acc.token).toBe("t-cipher");
    // host .trae.ai 优先于 edition 默认
    expect(acc.region).toBe("ai");
  });

  it("无 auth 条目 / 损坏 JSON 抛错(由 discover 逐候选容错)", () => {
    const p1 = join(dir, "noauth.json");
    writeFileSync(p1, JSON.stringify({ other: 1 }), "utf8");
    expect(() => parseTraeDesktopStorage(p1, "cn")).toThrow(/未登录/);

    const p2 = join(dir, "broken.json");
    writeFileSync(p2, "{not json", "utf8");
    expect(() => parseTraeDesktopStorage(p2, "cn")).toThrow(/非 JSON/);
  });
});

// ---------------------------------------------------------------------------
// trae:CLI token
// ---------------------------------------------------------------------------

describe("parseTraeCliToken", () => {
  it("解析裸 3 段 JWT,区域走 host 规则 = cn,exp 转毫秒", () => {
    const jwt = makeJwt({ exp: 1.9e9, data: { user_id: "cli-user" } });
    const path = join(dir, "token");
    writeFileSync(path, jwt, "utf8");
    const acc = parseTraeCliToken(path, "cn");
    expect(acc.username).toBe("cli-user");
    expect(acc.user_id).toBe("cli-user");
    expect(acc.token).toBe(jwt);
    expect(acc.region).toBe("cn");
    expect(acc.source).toBe("cli");
    expect(acc.token_expires_at_ms).toBe(1.9e12);
  });

  it("解析 JSON 信封(token 字段)", () => {
    const jwt = makeJwt({ data: { user_id: "env-user" } });
    const path = join(dir, "token.json");
    writeFileSync(path, JSON.stringify({ token: jwt }), "utf8");
    const acc = parseTraeCliToken(path, "sg");
    expect(acc.username).toBe("env-user");
    // host 固定 api.trae.cn → 恒 cn(Nexus 语义)
    expect(acc.region).toBe("cn");
  });

  it("非 JWT / 无 data.user_id 抛错", () => {
    const p1 = join(dir, "plain.txt");
    writeFileSync(p1, "not-a-jwt", "utf8");
    expect(() => parseTraeCliToken(p1, "cn")).toThrow(/非 3 段 JWT/);

    const p2 = join(dir, "no-uid.txt");
    writeFileSync(p2, makeJwt({ exp: 123 }), "utf8");
    expect(() => parseTraeCliToken(p2, "cn")).toThrow(/无 data.user_id/);
  });
});

// ---------------------------------------------------------------------------
// trae:汇总 discover(容错 + 去重)
// ---------------------------------------------------------------------------

describe("discoverTraeAccounts", () => {
  it("扫到 CLI + desktop 两来源,损坏候选被跳过", () => {
    // CLI cn
    const cliDir = join(dir, ".trae-cn");
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(join(cliDir, "trae-jwt-token"), makeJwt({ data: { user_id: "u-cli" } }), "utf8");
    // CLI sg:损坏 → 跳过
    const sgCli = join(dir, ".trae");
    mkdirSync(sgCli, { recursive: true });
    writeFileSync(join(sgCli, "trae-jwt-token"), "garbage", "utf8");
    // desktop cn:明文 auth
    const desktopDir = join(dir, "Trae CN", "User", "globalStorage");
    mkdirSync(desktopDir, { recursive: true });
    writeFileSync(
      join(desktopDir, "storage.json"),
      JSON.stringify({ [AUTH_KEY]: JSON.stringify({ token: "t-d1", account: { username: "du" }, userId: "u-d1" }) }),
      "utf8",
    );
    // desktop sg:损坏 JSON → 跳过
    const desktopDir2 = join(dir, "Trae", "User", "globalStorage");
    mkdirSync(desktopDir2, { recursive: true });
    writeFileSync(join(desktopDir2, "storage.json"), "broken", "utf8");

    const accounts = discoverTraeAccounts({ home: dir, platformName: "win32" });
    expect(accounts.length).toBe(2);
    expect(accounts.map((a) => a.source).sort()).toEqual(["cli", "desktop"]);
    expect(accounts.map((a) => a.user_id)).toContain("u-cli");
    expect(accounts.map((a) => a.user_id)).toContain("u-d1");
  });

  it("同一 edition 同 user_id **不**跨来源去重(desktop 优先且 CLI 独立保留)", () => {
    const cliDir = join(dir, ".trae-cn");
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(join(cliDir, "trae-jwt-token"), makeJwt({ data: { user_id: "same" } }), "utf8");
    const desktopDir = join(dir, "Trae CN", "User", "globalStorage");
    mkdirSync(desktopDir, { recursive: true });
    writeFileSync(
      join(desktopDir, "storage.json"),
      JSON.stringify({ [AUTH_KEY]: JSON.stringify({ token: "t-d", account: { username: "same" }, userId: "same" }) }),
      "utf8",
    );
    const accounts = discoverTraeAccounts({ home: dir, platformName: "win32" });
    // desktop 与 cli 是两条独立登录态:桌面版 token 才是计费/签到认的,
    // 按 edition\0user_id 去重会让先扫到的来源挡掉另一条(实机踩过:CLI 挡掉 desktop)。
    expect(accounts.length).toBe(2);
    expect(accounts.map((a) => a.source)).toEqual(["desktop", "cli"]);
  });

  it("desktop 优先于 cli(同 edition 同 user_id 时 desktop 排第一)", () => {
    const cliDir = join(dir, ".trae-cn");
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(join(cliDir, "trae-jwt-token"), makeJwt({ data: { user_id: "same" } }), "utf8");
    const desktopDir = join(dir, "Trae CN", "User", "globalStorage");
    mkdirSync(desktopDir, { recursive: true });
    writeFileSync(
      join(desktopDir, "storage.json"),
      JSON.stringify({ [AUTH_KEY]: JSON.stringify({ token: "t-d", account: { username: "same" }, userId: "same" }) }),
      "utf8",
    );
    const accounts = discoverTraeAccounts({ home: dir, platformName: "win32" });
    expect(accounts.length).toBe(2);
    expect(accounts[0].source).toBe("desktop");
  });

  it("无任何登录态 → []", () => {
    expect(discoverTraeAccounts({ home: dir, platformName: "win32" })).toEqual([]);
    expect(discoverTraeAccounts({ home: dir, platformName: "win32", cli: false, desktop: false })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// trae:区域
// ---------------------------------------------------------------------------

describe("traeRegionOf", () => {
  it("userRegion 优先", () => {
    expect(traeRegionOf({ userRegion: { region: "sg" }, host: "https://api.trae.cn" }, "cn")).toBe("ai");
    expect(traeRegionOf({ userRegion: "cn" }, "sg")).toBe("cn");
  });
  it("host 域名次之", () => {
    expect(traeRegionOf({ host: "https://api.trae.ai" }, "cn")).toBe("ai");
    expect(traeRegionOf({ host: "https://api.trae.cn" }, "sg")).toBe("cn");
    expect(traeRegionOf({ host: "https://www.trae.com.cn" })).toBe("cn");
  });
  it("edition 兜底:国际 edition → ai,其余 → cn", () => {
    expect(traeRegionOf({}, "sg")).toBe("ai");
    expect(traeRegionOf({}, "solo-sg")).toBe("ai");
    expect(traeRegionOf({}, "cn")).toBe("cn");
    expect(traeRegionOf({})).toBe("cn");
  });
});

// ---------------------------------------------------------------------------
// workbuddy:Nexus 无 discover
// ---------------------------------------------------------------------------

describe("discoverWorkbuddyAccounts", () => {
  it("恒 [] —— Nexus connectors/workbuddy.py 无 discover_local_accounts", () => {
    expect(discoverWorkbuddyAccounts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 契约常量(storage.json 键,与 trae.ts 导出保持一致)
// ---------------------------------------------------------------------------

const AUTH_KEY = "iCubeAuthInfo://icube.cloudide";
const DEVICE_PREFIX = "iCubeAuthInfo://icube-dc:";
