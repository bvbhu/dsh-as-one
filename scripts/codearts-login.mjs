#!/usr/bin/env node
/**
 * CodeArts 登录准备 / 凭据导入（一次性工具）。
 *
 * 两条路都支持（都落到 B 族 AK/SK，签到/推理共用同一份凭据）：
 *
 *   # OAuth2 授权码 + PKCE + DPoP → STS 临时 AK/SK
 *   node scripts/codearts-login.mjs --oauth
 *   node scripts/codearts-login.mjs --print-url        # 只打印授权链接（不监听本地回调）
 *
 *   # 导入别人导出的 session JSON（含 refresh_token 的形态）
 *   node scripts/codearts-login.mjs --from-json path/to/session.json
 *
 * 登录成功后写库：`provider(codearts)` + `credential(codearts/<label>)`，
 * `raw_json` 里带 accessKey / secretKey / securityToken / expiresAtMs / refreshToken /
 * domainId，以及续期要用的 DPoP 私钥与 PKCE verifier。
 *
 * ⚠️ 纪律：本脚本只跟华为云官方域通信，不采集、不转发凭据，不打印明文 AK/SK。
 * ⚠️ `refresh_token` 是**一次性轮转**的：IDE 与网关同时续期会互相作废，
 *    所以这里只做**首次登录**，不做后台刷新。
 */

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign as cryptoSign } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

const CLIENT_ID = "codearts-agent";
const STS_TOKENS = "https://sts.cn-north-4.myhuaweicloud.com/v1/oauth2/tokens";
const AUTHORIZE = "https://codearts.huaweicloud.com/portal/authorize";
const PLUGIN_NAME = "snap_AIIDE";
const PLUGIN_VERSION = "26.9.902";
const DSH_DB = join(homedir(), ".as-one", "as-one.db");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const say = (m) => process.stdout.write(`${m}\n`);
const redact = (s) => (typeof s === "string" && s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-2)}(${s.length})` : "(空)");

/* ------------------------------------------------------------------ *
 * PKCE / DPoP
 * ------------------------------------------------------------------ */

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function newPkce() {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function newDpopKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privateKey,
    jwk: publicKey.export({ format: "jwk" }),
    privatePem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicJwk: publicKey.export({ format: "jwk" }),
  };
}

/** 生成一次 DPoP proof（ES256，`ieee-p1363` 裸签名）。 */
function dpopProof(key, htu, htm) {
  const header = { typ: "dpop+jwt", alg: "ES256", jwk: key.publicJwk };
  const payload = { htu, htm, iat: Math.floor(Date.now() / 1000), jti: randomUUID() };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = cryptoSign("sha256", Buffer.from(input), { key: key.privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}

function authorizeUrl(port, challenge) {
  const u = new URL(AUTHORIZE);
  u.searchParams.set("theme", "2");
  u.searchParams.set("locale", "zh-cn");
  u.searchParams.set("uri_scheme", CLIENT_ID);
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("port", String(port));
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("ticket_id", randomBytes(16).toString("hex"));
  u.searchParams.set("plugin-name", PLUGIN_NAME);
  u.searchParams.set("plugin-version", PLUGIN_VERSION);
  return u.toString();
}

/* ------------------------------------------------------------------ *
 * STS 换令牌
 * ------------------------------------------------------------------ */

async function exchangeCode(code, verifier, redirectUri, dpopKey) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(STS_TOKENS, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      DPoP: dpopProof(dpopKey, STS_TOKENS, "POST"),
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 保持原文 */
  }
  if (!res.ok || !json) {
    throw new Error(`STS 换令牌失败 HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

/* ------------------------------------------------------------------ *
 * 写库
 * ------------------------------------------------------------------ */

function maskLabel(label) {
  const s = String(label ?? "").trim();
  if (s === "") return "codearts";
  return s.replace(/[^\p{L}\p{N}_.@-]/gu, "_").slice(0, 40);
}

function saveCredential({ username, accessKey, secretKey, securityToken, refreshToken, expiresAtMs, domainId, dpopPrivatePem, pkceVerifier }) {
  const db = new DatabaseSync(DSH_DB);
  try {
    db.prepare(
      "INSERT INTO provider(id, base_url, protocol, env_prefix) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET protocol=excluded.protocol",
    ).run("codearts", null, "codearts", null);

    const raw = {
      accessKey: accessKey ?? null,
      secretKey: secretKey ?? null,
      securityToken: securityToken ?? null,
      expiresAtMs: expiresAtMs ?? null,
      refreshToken: refreshToken ?? null,
      domainId: domainId ?? null,
      dpopPrivatePem: dpopPrivatePem ?? null,
      pkceVerifier: pkceVerifier ?? null,
    };
    db.prepare(
      `INSERT INTO credential(provider, username, secret, refresh_secret, expires_at, raw_json)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(provider, username) DO UPDATE SET
         secret=excluded.secret, refresh_secret=excluded.refresh_secret,
         expires_at=excluded.expires_at, raw_json=excluded.raw_json`,
    ).run(
      "codearts",
      username,
      accessKey ?? "",
      refreshToken ?? null,
      expiresAtMs ? Math.floor(expiresAtMs / 1000) : null,
      JSON.stringify(raw),
    );
    return username;
  } finally {
    db.close();
  }
}

/* ------------------------------------------------------------------ *
 * 模式：--from-json
 * ------------------------------------------------------------------ */

async function runFromJson(file) {
  const { readFileSync } = await import("node:fs");
  const json = JSON.parse(readFileSync(file, "utf8"));
  const accessKey = json.accessKey ?? json.access_key ?? json.ak;
  const secretKey = json.secretKey ?? json.secret_key ?? json.sk;
  if (!accessKey || !secretKey) throw new Error("session JSON 里找不到 accessKey / secretKey");
  const label = maskLabel(val("--label") ?? json.domain_id ?? json.domainId ?? "codearts");
  saveCredential({
    username: label,
    accessKey,
    secretKey,
    securityToken: json.securitytoken ?? json.securityToken ?? null,
    refreshToken: json.refreshToken ?? json.refresh_token ?? null,
    expiresAtMs: json.expiresAtMs ?? (json.expires_at ? Number(json.expires_at) * 1000 : null),
    domainId: json.domainId ?? json.domain_id ?? null,
  });
  say(`✓ 已写入凭据：codearts/${label}（B 族推理用；AK ${redact(accessKey)}）`);
}

/* ------------------------------------------------------------------ *
 * 模式：--oauth / --print-url
 * ------------------------------------------------------------------ */

async function runOauth(printOnly) {
  const pkce = newPkce();
  const dpop = newDpopKey();

  if (printOnly) {
    const port = Number(val("--port") ?? 17890);
    say("授权链接（手动模式：登录后把浏览器地址栏里 code= 后面那段贴给我）：");
    say(authorizeUrl(port, pkce.challenge));
    say(`\nPKCE verifier（本次会话有效，别丢）：${pkce.verifier}`);
    return;
  }

  const port = Number(val("--port") ?? 0);
  const state = { code: null, resolver: null };
  const codePromise = new Promise((resolve) => {
    state.resolver = resolve;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${(server.address()?.port ?? port) || port}`);
    const code = url.searchParams.get("code");
    const secret = url.searchParams.get("secret");
    const redirect = url.searchParams.get("redirect");
    if (secret && redirect) {
      // 官方回调第一跳：带 secret 的 307 重定向。我们要把它转过去，票据交换才会继续。
      res.writeHead(307, { Location: redirect });
      res.end();
      return;
    }
    if (code) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<h2>登录成功，可以关闭这个窗口回到终端了。</h2>");
      state.resolver(code);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const bound = server.address().port;
  const redirectUri = `http://127.0.0.1:${bound}/oauth/callback`;
  say(`→ 本地回调已监听：${redirectUri}`);
  say("→ 请在浏览器打开下面这个链接并完成登录：\n");
  say(authorizeUrl(bound, pkce.challenge));
  say("\n（等待授权回调，最长 10 分钟…）");

  const timer = setTimeout(() => state.resolver(null), 10 * 60 * 1000);
  const code = await codePromise;
  clearTimeout(timer);
  server.close();
  if (!code) {
    say("✗ 超时：这次会话没拿到 code，重新跑一次脚本。");
    process.exitCode = 1;
    return;
  }

  say("→ 已拿到 code，正在换 STS 令牌…");
  const tok = await exchangeCode(code, pkce.verifier, redirectUri, dpop);
  const accessKey = tok.accessKey ?? tok.access_key ?? tok.ak;
  const secretKey = tok.secretKey ?? tok.secret_key ?? tok.sk;
  if (!accessKey || !secretKey) throw new Error(`STS 返回里没有 AK/SK：${JSON.stringify(tok).slice(0, 300)}`);
  const expiresAtMs = tok.expires_at ? Number(tok.expires_at) * 1000 : Date.now() + 2 * 60 * 60 * 1000;
  const label = maskLabel(val("--label") ?? tok.domainId ?? tok.domain_id ?? "codearts");

  saveCredential({
    username: label,
    accessKey,
    secretKey,
    securityToken: tok.securitytoken ?? tok.securityToken ?? null,
    refreshToken: tok.refresh_token ?? tok.refreshToken ?? null,
    expiresAtMs,
    domainId: tok.domainId ?? tok.domain_id ?? null,
    dpopPrivatePem: dpop.privatePem,
    pkceVerifier: pkce.verifier,
  });
  say(`✓ 已写入凭据：codearts/${label}（B 族推理用；AK ${redact(accessKey)}，过期 ${new Date(expiresAtMs).toLocaleString("zh-CN")}）`);
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

async function main() {
  try {
    if (val("--from-json")) return await runFromJson(val("--from-json"));
    if (has("--print-url")) return await runOauth(true);
    if (has("--oauth")) return await runOauth(false);
    say("用法：");
    say("  node scripts/codearts-login.mjs --oauth                 # B 族：开浏览器登录 → 自动换 STS");
    say("  node scripts/codearts-login.mjs --print-url             # 只打印授权链接");
    say("  node scripts/codearts-login.mjs --from-json <file>        # 导入 session JSON");
    say("\n可选：--label <账号名>  --port <端口>");
  } catch (err) {
    say(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

main();
