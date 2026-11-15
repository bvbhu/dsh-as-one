/**
 * 华为云 CodeArts（码道）**请求签名**：`SDK-HMAC-SHA256`（纯函数，零网络）。
 *
 * 逐字对齐官方 `@huaweicloud/huaweicloud-sdk-core` 的 JS 实现 —— 但其中**有两处
 * 与官方文档不同**，必须一起复刻，否则上游必然回 `APIG.0301 verify ak sk signature fail`：
 *
 * 1. `CanonicalURI` **每段单独编码后强制补尾斜杠**
 *    `/api/v2/chat/completions` → `/api/v2/chat/completions/`
 * 2. `CanonicalHeaders` 每行自带尾 `\n`，拼装时**再补一个 `\n`**
 *    → `SignedHeaders` 之前多一个空行
 *
 * 依据：`xu20060420fan-cell` 参考仓库的 `docs/UPSTREAM.md` §4（其 `signer_test.go`
 * 的期望值由独立 Python 复刻算出）；本文件用「金标准 canonical 串」把它钉住，
 * 任何一处拼装改动都会让 `codearts-sign.test.ts` 变红。
 *
 * 口径补充（同 §4）：
 * - URL 编码只保留 `A-Za-z0-9-._~`，其余一律 `%XX`（**大写**）。
 *   ⚠️ 不能用 `encodeURIComponent` 直接交差：它会放过 `!*'()`，而本实现不放。
 * - 查询串：键、值各自排序后再编码。
 * - 只有 `PUT` / `PATCH` / `POST` 的 body 参与签名；其余方法按空 body。
 * - header 名小写化后参与签名；只对**值**做 `trim`，不对名字做 `trim`。
 * - `Agent-Type` / `X-Language` **必须签名后追加**，进 SignedHeaders 会 401；
 *   所以本模块默认只签 `host` + `x-sdk-date`（临时凭据再加 `x-security-token`），
 *   与官方 SDK 的默认集合一致。
 */

import { createHash, createHmac } from "node:crypto";

/* ------------------------------------------------------------------ *
 * 编码
 * ------------------------------------------------------------------ */

/** RFC 3986 严格编码：只留 `A-Za-z0-9-._~`，其余 `%XX` 大写。 */
export function encodeRfc3986(value: string): string {
  let out = "";
  for (const byte of Buffer.from(value, "utf8")) {
    const ch = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

/**
 * `CanonicalURI`：路径按 `/` 切段、逐段编码，再**强制补尾斜杠**。
 *
 * 为什么强制补：官方 SDK 把 URI 规范成「目录形态」（`/a/b` → `/a/b/`），
 * 上游按这个形态重算签名；少那一个斜杠就签名不一致。
 */
export function canonicalUri(pathname: string): string {
  const raw = pathname === "" ? "/" : pathname;
  const encoded = raw
    .split("/")
    .map((seg) => encodeRfc3986(seg))
    .join("/");
  return encoded.endsWith("/") ? encoded : `${encoded}/`;
}

/** `CanonicalQuery`：键值各自编码后按（键, 值）排序，`&` 连接。 */
export function canonicalQuery(search: string): string {
  if (!search || search === "?") return "";
  const pairs: Array<[string, string]> = [];
  for (const part of search.replace(/^\?/, "").split("&")) {
    if (part === "") continue;
    const eq = part.indexOf("=");
    const k = eq < 0 ? part : part.slice(0, eq);
    const v = eq < 0 ? "" : part.slice(eq + 1);
    // 已编码过的值先解回来再统一编，避免双重编码（`%20` → `%2520`）。
    pairs.push([decodeURIComponent(k), decodeURIComponent(v)]);
  }
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
  return pairs.map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`).join("&");
}

/* ------------------------------------------------------------------ *
 * 摘要
 * ------------------------------------------------------------------ */

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function hmacSha256Hex(key: string, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

/** `X-Sdk-Date` 格式：UTC 基础格式 `YYYYMMDDTHHMMSSZ`。 */
export function sdkDateOf(now: number = Date.now()): string {
  const d = new Date(now);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/* ------------------------------------------------------------------ *
 * 签名
 * ------------------------------------------------------------------ */

/** 默认参与签名的头：官方 SDK 的缺省集合（`host` + `x-sdk-date` [+ `x-security-token`]）。 */
function defaultSignedHeaderNames(securityToken?: string): string[] {
  const names = ["host", "x-sdk-date"];
  if (securityToken) names.push("x-security-token");
  return names;
}

export interface CanonicalRequestInput {
  method: string;
  /** 完整 URL（含协议与查询串）。 */
  url: string;
  /** 参与签名的头（名字大小写不敏感；缺 `host` 时从 URL 补）。 */
  headers: Record<string, string>;
  /** 请求体原文；只有 PUT/PATCH/POST 参与签名。 */
  body?: string | null;
  /** 参与签名的头名；缺省 {@link defaultSignedHeaderNames}。 */
  signedNames?: string[];
}

/** 拼 `CanonicalRequest`（两处怪癖都在这里）。 */
export function buildCanonicalRequest(input: CanonicalRequestInput): string {
  const u = new URL(input.url);
  const method = input.method.toUpperCase();
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers)) lowerHeaders[k.toLowerCase()] = v;
  // 官方 SDK 总是把 host 纳入签名，且值取 URL 的 host（含端口）。
  if (!("host" in lowerHeaders)) lowerHeaders["host"] = u.host;

  const names = (input.signedNames ?? defaultSignedHeaderNames(lowerHeaders["x-security-token"]))
    .map((n) => n.toLowerCase())
    .sort();

  // 每行自带尾 \n（这是第一处怪癖的一半）。
  const canonicalHeaders = names.map((n) => `${n}:${(lowerHeaders[n] ?? "").trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const bodySigned = method === "PUT" || method === "PATCH" || method === "POST";
  const payloadHash = sha256Hex(bodySigned && input.body ? input.body : "");

  // ⚠️ 第二处怪癖：`canonicalHeaders` 已以 \n 结尾，这里再补一个 \n —— SignedHeaders
  // 之前因此多出一个空行。**不要「顺手修掉」它**，上游就是按这个算的。
  return (
    `${method}\n` +
    `${canonicalUri(u.pathname)}\n` +
    `${canonicalQuery(u.search)}\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`
  );
}

/** `StringToSign`（第一步的哈希 + 日期行）。 */
export function buildStringToSign(sdkDate: string, canonicalRequest: string): string {
  return `SDK-HMAC-SHA256\n${sdkDate}\n${sha256Hex(canonicalRequest)}`;
}

export interface SignOptions {
  accessKey: string;
  secretKey: string;
  /** STS 临时凭据令牌；传了就一并签名并附到出站头。 */
  securityToken?: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | null;
  /** 注入时钟（测试用）。 */
  now?: number;
  /** 覆盖 `X-Sdk-Date`（测试用）。 */
  sdkDate?: string;
  signedNames?: string[];
}

export interface SignResult {
  headers: Record<string, string>;
  /** 便于日志/排障：本次实际参与签名的头名（已排序、小写）。 */
  signedHeaders: string[];
  canonicalRequest: string;
}

/**
 * 给一次请求签名，返回**可直接发送**的头集合。
 *
 * 出站头 = 原头 + `X-Sdk-Date` + `Authorization` [+ `X-Security-Token`]。
 * 特意**不**动 identity 头（`Agent-Type` / `X-Language` / `model-id` 等）：它们必须
 * 在签名之后追加，进了 SignedHeaders 就会 401。
 */
export function signCodeartsRequest(opts: SignOptions): SignResult {
  const sdkDate = opts.sdkDate ?? sdkDateOf(opts.now);
  const headers: Record<string, string> = { ...opts.headers, "X-Sdk-Date": sdkDate };
  if (opts.securityToken) headers["X-Security-Token"] = opts.securityToken;

  const canonicalRequest = buildCanonicalRequest({
    method: opts.method,
    url: opts.url,
    headers,
    body: opts.body ?? null,
    ...(opts.signedNames ? { signedNames: opts.signedNames } : {}),
  });
  const stringToSign = buildStringToSign(sdkDate, canonicalRequest);
  const signature = hmacSha256Hex(opts.secretKey, stringToSign);

  const signedNames = (
    opts.signedNames ?? defaultSignedHeaderNames(opts.securityToken)
  )
    .map((n) => n.toLowerCase())
    .sort();
  headers["Authorization"] =
    `SDK-HMAC-SHA256 Access=${opts.accessKey}, ` +
    `SignedHeaders=${signedNames.join(";")}, Signature=${signature}`;

  return { headers, signedHeaders: signedNames, canonicalRequest };
}
