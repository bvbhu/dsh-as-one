/**
 * Qoder cosy 协议 —— 编码 / 签名 / 指纹（纯函数，不触网）。
 *
 * 协议来源（社区逆向 + 官方产物核对，见 docs/qoder.md 的致谢段）：
 * - fengyinxia/qoder2api（MIT）：PAT→jobToken 交换、cosy 签名、自定义 base64、
 *   RSA/AES 会话构建，实测可用（国内网关）；
 * - x_Zhengyuuuui/qoder2api（Go 版）：同一协议的 Go 实现 + 设备指纹派生，
 *   含国内 / 国际双区域端点；
 * - @qoder-ai/qoder-agent-sdk 官方 .d.ts：模型字段、用量字段的官方命名。
 *
 * ⚠️ 本文件是**独立实现**（只依据协议行为），不复制任何第三方仓库源码。
 *
 * 一条请求的完整签名要素（全部在这里产出）：
 * ```
 * tempKey  = 16 字节随机串的 hex 前 16 字符
 * cosyKey  = base64(RSA_PKCS1(tempKey))                 → 请求头 cosy-key
 * info     = base64(AES-128-CBC(tempKey, identityJson)) → Bearer 载荷字段 info
 * payload  = base64(JSON({cosyVersion,ideVersion,info,requestId,version}))
 * date     = 秒级时间戳（字符串）
 * sig      = md5(payloadB64 \n cosyKey \n date \n body \n pathSig)
 * 请求头   = Authorization: Bearer COSY.<payloadB64>.<sig>
 * ```
 * `body` 是 **cosyEncode 之后**的字符串（GET 请求用空串），`pathSig` 是去掉
 * `/algo` 前缀的路径（含查询串之前的部分）。
 *
 * @module connectors/qoder-cosy
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  randomUUID,
} from "node:crypto";

// ---------------------------------------------------------------------------
// 自定义 base64
// ---------------------------------------------------------------------------

/** cosy 自定义 base64 字母表（与参考实现逐字节一致）。 */
export const CUSTOM_ALPHABET = "_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!";
const STD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** cosy 的填充符（不是标准 base64 的 `=`）。 */
export const CUSTOM_PAD = "$";

const s2c = new Map<string, string>();
const c2s = new Map<string, string>();
for (let i = 0; i < 64; i += 1) {
  s2c.set(STD_ALPHABET[i]!, CUSTOM_ALPHABET[i]!);
  c2s.set(CUSTOM_ALPHABET[i]!, STD_ALPHABET[i]!);
}
s2c.set("=", CUSTOM_PAD);
c2s.set(CUSTOM_PAD, "=");

/**
 * Qoder 自定义 base64 编码：先标准 base64，再按 `n/3` 三段重排
 * （尾段 → 中段 → 头段），最后逐字符映射到自定义字母表。
 */
export function cosyEncode(plaintext: Uint8Array): string {
  const std = Buffer.from(plaintext).toString("base64");
  const n = std.length;
  const a = Math.floor(n / 3);
  const rearranged = std.slice(n - a) + std.slice(a, n - a) + std.slice(0, a);
  let out = "";
  for (const ch of rearranged) {
    const mapped = s2c.get(ch);
    if (mapped === undefined) throw new Error(`cosy encode: char out of alphabet: ${ch}`);
    out += mapped;
  }
  return out;
}

/** 自定义 base64 解码（{@link cosyEncode} 的逆运算）。 */
export function cosyDecode(encoded: string): Uint8Array {
  let mapped = "";
  for (const ch of encoded) {
    const std = c2s.get(ch);
    if (std === undefined) throw new Error(`cosy decode: char out of custom alphabet: ${ch}`);
    mapped += std;
  }
  const n = mapped.length;
  const a = Math.floor(n / 3);
  const std = mapped.slice(n - a) + mapped.slice(a, n - a) + mapped.slice(0, a);
  return new Uint8Array(Buffer.from(std, "base64"));
}

// ---------------------------------------------------------------------------
// 哈希与常量
// ---------------------------------------------------------------------------

export function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

export function sha512Base64Url(input: string): string {
  return createHash("sha512").update(input, "utf8").digest("base64url");
}

/** RFC1123（UTC）当前时间 —— 旧式 jobToken 交换签名头用。 */
export function currentRfc1123Date(now: Date = new Date()): string {
  return now.toUTCString();
}

/** cosy 应用码。 */
export const COSY_APPCODE = "cosy";
/** base64("war, war never changes") —— 协议常量，不是密钥。 */
export const COSY_SECRET_B64 = "d2FyLCB3YXIgbmV2ZXIgY2hhbmdlcw==";
/** 进 Bearer **载荷**的协议版本（与请求头 cosy-version 是两个独立的值）。 */
export const COSY_VERSION = "0.1.43";

/** 旧式签名：`md5("cosy&<secret>&<rfc1123date>")`。 */
export function signLegacy(date: string): string {
  return md5Hex(`${COSY_APPCODE}&${COSY_SECRET_B64}&${date}`);
}

/** Qoder 网关 RSA 公钥（客户端用它加密会话临时密钥）。 */
export const SERVER_PUBKEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
-----END PUBLIC KEY-----`;

// ---------------------------------------------------------------------------
// 对称 / 非对称原语
// ---------------------------------------------------------------------------

/** AES-128-CBC + PKCS7（IV 与 key 同值，协议如此）。 */
export function aesCbcEncrypt(plain: Uint8Array, key: Uint8Array): Uint8Array {
  const blockSize = 16;
  const padLen = blockSize - (plain.length % blockSize);
  const padded = new Uint8Array(plain.length + padLen);
  padded.set(plain);
  padded.fill(padLen, plain.length);
  const cipher = createCipheriv("aes-128-cbc", key, key);
  return new Uint8Array(Buffer.concat([cipher.update(padded), cipher.final()]));
}

/** AES-128-CBC 解密（PKCS7）。 */
export function aesCbcDecrypt(encrypted: Uint8Array, key: Uint8Array): Uint8Array {
  const decipher = createDecipheriv("aes-128-cbc", key, key);
  return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]));
}

/** RSA PKCS1v1.5 加密（公钥固定为 {@link SERVER_PUBKEY_PEM}）。 */
export function rsaEncrypt(plain: Uint8Array): Uint8Array {
  const out = publicEncrypt(
    { key: SERVER_PUBKEY_PEM, padding: 1 },
    Buffer.from(plain),
  );
  return new Uint8Array(out);
}

/** RSA PKCS1v1.5 解密（仅供测试；运行时拿不到私钥）。 */
export function rsaDecrypt(encrypted: Uint8Array, privateKeyPem: string): Uint8Array {
  const out = privateDecrypt({ key: privateKeyPem, padding: 1 }, Buffer.from(encrypted));
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// 会话
// ---------------------------------------------------------------------------

/** 会话身份（jobToken 交换响应里的用户字段，蛇形命名进 AES 载荷）。 */
export interface CosyAuthIdentity {
  name: string;
  aid: string;
  uid: string;
  yx_uid: string;
  organization_id: string;
  organization_name: string;
  user_type: string;
  security_oauth_token: string;
  refresh_token: string;
}

/** 一次 cosy 会话的全部签名要素。 */
export interface CosySessionContext {
  /** 16 字节临时密钥（hex 串前 16 字符的 ASCII）。 */
  tempKey: Uint8Array;
  /** base64(RSA(tempKey)) → 请求头 cosy-key。 */
  cosyKey: string;
  /** base64(AES(tempKey, identityJson)) → Bearer 载荷 info。 */
  info: string;
  identity: CosyAuthIdentity;
  machineId: string;
  machineToken: string;
  machineType: string;
}

/** 从 jobToken 响应字段构建身份（缺席字段取空串，不编造）。 */
export function identityFromJobToken(jt: Record<string, unknown>): CosyAuthIdentity {
  const id = String(jt.id ?? jt.aid ?? jt.uid ?? "");
  return {
    name: String(jt.name ?? ""),
    aid: id,
    uid: id,
    yx_uid: "",
    organization_id: "",
    organization_name: "",
    user_type: String(jt.userType ?? jt.user_type ?? "personal_standard"),
    security_oauth_token: String(jt.securityOauthToken ?? jt.security_oauth_token ?? ""),
    refresh_token: String(jt.refreshToken ?? jt.refresh_token ?? ""),
  };
}

/** 身份 → AES 明文对象（键序固定，两份实现必须一致）。 */
export function identityPayload(identity: CosyAuthIdentity): Record<string, string> {
  return {
    name: identity.name,
    aid: identity.aid,
    uid: identity.uid,
    yx_uid: identity.yx_uid,
    organization_id: identity.organization_id,
    organization_name: identity.organization_name,
    user_type: identity.user_type,
    security_oauth_token: identity.security_oauth_token,
    refresh_token: identity.refresh_token,
  };
}

/**
 * 新会话：生成临时密钥 → RSA 加密得 cosyKey → AES 加密身份载荷得 info。
 *
 * `tempKey` 用 16 字节随机数的 hex 前 16 字符（16 个 ASCII 字符 = AES-128 的
 * 合法长度，协议如此，不是把随机字节直接当 key）。
 */
export function newCosySession(
  identity: CosyAuthIdentity,
  machineId: string,
  machineToken: string,
  machineType: string,
): CosySessionContext {
  const tempKey = new Uint8Array(Buffer.from(randomBytes(16).toString("hex").slice(0, 16), "utf8"));
  const cosyKey = Buffer.from(rsaEncrypt(tempKey)).toString("base64");
  const payload = JSON.stringify(identityPayload(identity));
  const info = Buffer.from(
    aesCbcEncrypt(new Uint8Array(Buffer.from(payload, "utf8")), tempKey),
  ).toString("base64");
  return { tempKey, cosyKey, info, identity, machineId, machineToken, machineType };
}

/**
 * Bearer 载荷：`{cosyVersion, ideVersion, info, requestId, version}` 的标准
 * base64，键序按字典序（协议如此）。
 */
export function buildPayloadB64(info: string, requestId: string = randomUUID()): string {
  const payload: Record<string, string> = {
    cosyVersion: COSY_VERSION,
    ideVersion: "",
    info,
    requestId,
    version: "v1",
  };
  const sorted = Object.fromEntries(
    Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return Buffer.from(JSON.stringify(sorted)).toString("base64");
}

/**
 * 请求签名：`md5(payloadB64 \n cosyKey \n date \n body \n pathSig)`。
 *
 * ⚠️ `body` 必须是**编码后**的报文体（GET 用空串）：上游按同一份字节重算。
 */
export function signRequest(
  payloadB64: string,
  cosyKey: string,
  cosyDate: string,
  body: string,
  pathSig: string,
): string {
  return md5Hex(`${payloadB64}\n${cosyKey}\n${cosyDate}\n${body}\n${pathSig}`);
}

/** 组装 Authorization 头：`Bearer COSY.<payloadB64>.<sig>`。 */
export function composeBearer(payloadB64: string, sig: string): string {
  return `Bearer COSY.${payloadB64}.${sig}`;
}

/** 从完整 URL 派生签名路径：去掉 `/algo` 前缀（不含查询串）。 */
export function pathSigFrom(fullUrl: string): string {
  let path: string;
  try {
    path = new URL(fullUrl).pathname;
  } catch {
    path = fullUrl;
  }
  return path.startsWith("/algo") ? path.slice("/algo".length) : path;
}

/** 秒级时间戳字符串（签名头 cosy-date）。 */
export function cosyDateOf(nowMs: number = Date.now()): string {
  return String(Math.floor(nowMs / 1000));
}

// ---------------------------------------------------------------------------
// 设备指纹
// ---------------------------------------------------------------------------

/** 派生出的稳定设备身份三件套。 */
export interface CosyFingerprint {
  machineId: string;
  machineType: string;
  machineToken: string;
}

const MAX_MACHINE_TYPE_LEN = 18;
const MAX_MACHINE_TOKEN_LEN = 43;

function saltedSeed(seed: string, installSalt: string | undefined): string {
  return installSalt ? `${seed}|salt:${installSalt}` : seed;
}

function deriveId(seed: string, salt: string, installSalt: string | undefined): string {
  return md5Hex(`${salt}:${saltedSeed(seed, installSalt)}`);
}

/**
 * 派生设备指纹（同一凭证跨次调用必须稳定，否则上游会当成另一台设备）。
 *
 * `uid` 优先；未知（交换前）时回退 `cred:<credential>` —— 用凭证本身作种子，
 * 保证「同一 PAT 每次派生同一指纹」。
 */
export function deriveFingerprint(
  uid: string,
  credential: string,
  installSalt?: string,
): CosyFingerprint {
  const seed = uid !== "" ? uid : `cred:${credential}`;
  return {
    machineId: deriveId(seed, "machine", installSalt),
    machineType: deriveId(seed, "machinetype", installSalt).slice(0, MAX_MACHINE_TYPE_LEN),
    machineToken: sha512Base64Url(`machinetoken:${saltedSeed(seed, installSalt)}`).slice(
      0,
      MAX_MACHINE_TOKEN_LEN,
    ),
  };
}
