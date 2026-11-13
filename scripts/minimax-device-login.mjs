#!/usr/bin/env node
/**
 * MiniMax 设备码登录 —— 给 As One 添加/重新授权 minimax 账号。
 *
 * 为什么需要它:
 *   2026-11-07 上线的凭据因诊断误用导致 refresh_token 被上游轮换作废,
 *   而原本唯一的凭据来源(minimax2api 的 bridge.sqlite3)已随参考项目一起删除。
 *   本脚本直接复刻 MiniMax 官方 OAuth2 **设备码流程**(RFC 8628 + PKCE S256),
 *   不监听端口、不读 Cookie、不需要参考项目在场。
 *
 * 流程(与官方桌面客户端一致,端点经实测定案):
 *   1. POST {account-origin}/oauth2/device/code
 *        JSON { client_id, code_challenge, code_challenge_method:"S256",
 *               scope:"agent.default", audience:"agent-backend" }
 *        → { device_code, user_code, verification_uri_complete, expires_in, interval }
 *   2. 你在浏览器打开 verification_uri_complete 并授权
 *   3. 脚本按 interval 轮询 POST {account-origin}/oauth2/token
 *        form { client_id, grant_type:"urn:ietf:params:oauth:grant-type:device_code",
 *               device_code, code_verifier }
 *        → { access_token, refresh_token, expires_in }
 *   4. 把凭据写进 as-one.db 的 credential 表(kind=oauth → Bearer,带 refresh_token 可续期)
 *
 * 用法:
 *   node scripts/minimax-device-login.mjs            # 国内版(account.minimax.cn)
 *   node scripts/minimax-device-login.mjs --global   # 海外版(account.minimax.io)
 *   node scripts/minimax-device-login.mjs --db <path>  # 指定库(默认 ~/.as-one/as-one.db)
 *   node scripts/minimax-device-login.mjs --replace-stale  # 重新授权后清理作废凭据
 *   node scripts/minimax-device-login.mjs --username <名字>  # 显式命名账号
 *
 * ⚠️ 上游 access_token 是不透明令牌(mmoat_…),不是 JWT,通常解不出手机号 /
 * user_id。脚本会退到「令牌哈希短名」(如 mm-1a2b3c4d)保证授权一定落库;
 * 想用易读名字就加 `--username`。
 *
 * `--replace-stale`(2026-11-08):refresh_token 被上游作废后必须重新授权,而新
 * 授权的 username 由新 token 的 JWT 解出(手机号/邮箱/user_id),大概率与旧行
 * 不同 —— 旧行会留在库里继续报 401。加这个开关,写入新凭据后**只删除其它已
 * 过期的 minimax 凭据行**;未过期的绝不删(可能刚授权过第二个账号)。
 * 删除前会先把待删 username 打印出来核对。
 *
 * ⚠️ 重新授权会生成一套新的 uuid / device_id,等于换了一台设备会话 —— 这是
 * 正常行为,不必复用旧指纹(旧指纹绑定的旧会话本来就已失效)。
 *
 * 区域不可混用:两个区域是独立账号体系,凭据只对同区域 Agent 站点有效。
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const CLIENT_ID = "mcode-public";
const OAUTH_SCOPE = "agent.default";
const OAUTH_AUDIENCE = "agent-backend";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const ORIGINS = {
  cn: "https://account.minimax.cn",
  global: "https://account.minimax.io",
};

const args = process.argv.slice(2);
const region = args.includes("--global") ? "global" : "cn";
/** 重新授权后清理其它已过期的 minimax 凭据行(缺省关闭,绝不误删)。 */
const REPLACE_STALE = args.includes("--replace-stale");
/** 显式指定账号名:上游令牌不透明、解不出用户标识时用它,避免自动命名没辨识度。 */
const userIdx = args.indexOf("--username");
const USERNAME =
  userIdx >= 0 && args[userIdx + 1] && !String(args[userIdx + 1]).startsWith("--")
    ? String(args[userIdx + 1]).trim()
    : "";
const dbIdx = args.indexOf("--db");
const DB =
  dbIdx >= 0 && args[dbIdx + 1]
    ? args[dbIdx + 1]
    : join(homedir(), ".as-one", "as-one.db");

if (!existsSync(DB)) {
  console.error(`✗ 找不到 As One 数据库: ${DB}(先启动一次 As One 让它建库)`);
  process.exit(1);
}

const origin = ORIGINS[region];

/** base64url(无 padding)—— PKCE 与挑战串都要求这个编码。 */
function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCE:verifier 32 字节随机,challenge = base64url(sha256(verifier))。 */
function pkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier, "ascii").digest());
  return { verifier, challenge };
}

/** 解 JWT payload(不解签)——只用来取 user_id/邮箱/手机号当展示名。 */
function jwtClaims(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length < 2) return {};
  try {
    const padded = parts[1] + "=".repeat(-parts[1].length % 4);
    const parsed = JSON.parse(Buffer.from(padded, "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** 从多条候选 claim 里取第一个非空字符串。 */
function claimString(claims, keys) {
  for (const k of keys) {
    const v = claims[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

async function deviceCode(challenge) {
  const res = await fetch(`${origin}/oauth2/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: OAUTH_SCOPE,
      audience: OAUTH_AUDIENCE,
    }),
  });
  const text = await res.text();
  if (res.status >= 400) {
    throw new Error(`申请设备码失败(HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text);
  if (typeof json?.device_code !== "string" || typeof json?.user_code !== "string") {
    throw new Error(`设备码响应形状不对: ${text.slice(0, 300)}`);
  }
  return json;
}

/** 轮询换 token;返回 {access_token, refresh_token, expires_in} 或抛错。 */
async function pollToken(device, verifier, intervalS, expiresInS) {
  const deadline = Date.now() + (expiresInS || 300) * 1000;
  let interval = Math.max(1, intervalS || 3);
  let lastError = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    const res = await fetch(`${origin}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: DEVICE_GRANT_TYPE,
        device_code: device,
        code_verifier: verifier,
      }).toString(),
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      lastError = `非 JSON 响应(HTTP ${res.status}): ${text.slice(0, 200)}`;
      continue;
    }
    if (typeof json?.access_token === "string" && json.access_token !== "") {
      return json;
    }
    const err = String(json?.error ?? "");
    if (err === "authorization_pending" || err === "") {
      lastError = "";
      continue;
    }
    // slow_down:上游要求放慢;其余错误(expired_token / access_denied)直接终结。
    if (err === "slow_down") {
      interval = Math.min(interval + 5, 30);
      lastError = "";
      continue;
    }
    throw new Error(`授权失败(${err || "unknown"}): ${String(json.error_description ?? "").slice(0, 200)}`);
  }
  throw new Error(
    `设备码在有效期内未被授权${lastError ? `(${lastError})` : ""} —— 重新运行脚本再试`,
  );
}

/** 写库:provider 行(缺则补)+ credential 行(按 username 覆盖)。 */
function persist(username, accessToken, refreshToken, expiresAtSec, raw) {
  const db = new DatabaseSync(DB);
  try {
    db.exec("BEGIN");
    db.prepare(
      `INSERT INTO provider (id, base_url, protocol, env_prefix)
       VALUES ('minimax', NULL, 'minimax', 'MINIMAX_TOKEN')
       ON CONFLICT(id) DO NOTHING`,
    ).run();
    db.prepare(
      `INSERT INTO credential (provider, username, secret, refresh_secret, expires_at, raw_json)
       VALUES ('minimax', ?, ?, ?, ?, ?)
       ON CONFLICT(provider, username) DO UPDATE SET
         secret = excluded.secret,
         refresh_secret = excluded.refresh_secret,
         expires_at = excluded.expires_at,
         raw_json = excluded.raw_json`,
    ).run(username, accessToken, refreshToken, expiresAtSec, JSON.stringify(raw));

    // 只清理「其它 + 已过期」的行:新写入的这行与所有未过期凭据(可能是刚
    // 授权的第二个账号)都保留。删除前先把名单打出来,便于核对。
    if (REPLACE_STALE) {
      const nowSec = Math.floor(Date.now() / 1000);
      const stale = db.prepare(
        `SELECT username FROM credential
          WHERE provider = 'minimax' AND username <> ?
            AND expires_at IS NOT NULL AND expires_at < ?
          ORDER BY username`,
      ).all(username, nowSec);
      console.log("");
      if (stale.length === 0) {
        console.log("  --replace-stale: 没有其它已过期的 minimax 凭据,无需删除");
      } else {
        console.log(
          `  --replace-stale: 待删除 ${stale.length} 条已过期凭据: ${stale.map((r) => r.username).join(", ")}`,
        );
        const info = db.prepare(
          `DELETE FROM credential
            WHERE provider = 'minimax' AND username <> ?
              AND expires_at IS NOT NULL AND expires_at < ?`,
        ).run(username, nowSec);
        console.log(
          `  已删除 ${Number(info.changes)} 条(新授权的 ${username} 与所有未过期凭据均保留)`,
        );
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* 事务可能已自动回滚 */ }
    throw err;
  } finally {
    db.close();
  }
}

const { verifier, challenge } = pkcePair();
console.log(`区域: ${region}(${origin})`);
console.log("正在申请设备码…");
const device = await deviceCode(challenge);

const verifyUrl =
  typeof device.verification_uri_complete === "string" && device.verification_uri_complete !== ""
    ? device.verification_uri_complete
    : `${origin}/oauth-authorize?user_code=${encodeURIComponent(device.user_code)}`;

console.log("");
console.log("┌──────────────────────────────────────────────────────────────┐");
console.log("│ 请在浏览器打开下面的地址并登录/授权(国内版=手机号):          │");
console.log("└──────────────────────────────────────────────────────────────┘");
console.log("");
console.log(`  ${verifyUrl}`);
console.log("");
console.log(`  用户码: ${device.user_code}`);
console.log(`  有效期: ${device.expires_in ?? 300} 秒,脚本会自动轮询结果`);
console.log("");

console.log("等待授权…");
const tok = await pollToken(
  device.device_code,
  verifier,
  device.interval ?? 3,
  device.expires_in ?? 300,
);

const accessToken = tok.access_token;
const refreshToken = typeof tok.refresh_token === "string" ? tok.refresh_token : "";
const expiresIn = Number(tok.expires_in ?? 0);
const expiresAtSec = Number.isFinite(expiresIn) && expiresIn > 0 ? Math.floor(Date.now() / 1000) + expiresIn : null;
// ⚠️ 2026-11-08 实测:设备码流程返回的 access_token 是**不透明令牌**
// (`mmoat_…` 60 字),不是 JWT —— 旧版在这里解不出 user_id 就直接 exit(1),
// 把刚授权到手的令牌白白丢掉。现在按「显式 --username > id_token > access_token
// > token 应答顶层字段」找名字,全都没有就用令牌哈希生成稳定标识,保证一定落库。
const idClaims = jwtClaims(typeof tok["id_token"] === "string" ? tok["id_token"] : "");
const accessClaims = jwtClaims(accessToken);
const claimOf = (keys) =>
  claimString(idClaims, keys) || claimString(accessClaims, keys) || claimString(tok, keys);
const userId = claimOf(["user_id", "sub", "userId", "uid", "id"]);
const email = claimOf(["email"]);
const phone = claimOf(["phone", "phone_number", "mobile", "phoneNumber"]);
const fallback = `mm-${createHash("sha256").update(accessToken).digest("hex").slice(0, 8)}`;
const username = USERNAME || phone || email || userId || fallback;
if (!USERNAME && !phone && !email && !userId) {
  console.log(`  ⚠️ 上游令牌不含用户标识,自动命名为 ${username}`);
  console.log("     想要易读的名字,下次授权时加 --username <手机号/备注>。");
}

// 设备指纹:官方客户端每个账号一套稳定 uuid/device_id,签名串里带它们。
// 随机生成并**持久化**,之后刷新/签到都复用同一套(否则上游会认成另一台设备)。
const uuid = randomUUID();
const deviceId = String(Math.floor(10000000 + Math.random() * 89999999));

persist(username, accessToken, refreshToken, expiresAtSec, {
  kind: "oauth",
  region,
  uuid,
  device_id: deviceId,
  user_id: userId,
  email,
  phone,
  source: "device",
});

console.log("");
console.log("✓ 已写入 As One 库");
console.log(`  账号: minimax/${username}`);
console.log(`  区域: ${region}  kind: oauth(Bearer)`);
console.log(`  access token: ${accessToken.length} 字${expiresAtSec ? `, 到期 ${new Date(expiresAtSec * 1000).toLocaleString()}` : ""}`);
console.log(`  refresh token: ${refreshToken ? `${refreshToken.length} 字(可自动续期)` : "**没有**(过期后需重新授权)"}`);
console.log("");
console.log("下一步:重启 DSH 后,在「渠道」页展开 MiniMax 点刷新即可看到余额与签到。");
console.log("⚠️ 宿主进程持有凭据的内存缓存,写库后**必须重启 DSH**;只刷新面板会继续用旧令牌。");
