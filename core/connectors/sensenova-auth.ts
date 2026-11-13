/**
 * SenseNova 认证 —— 从 sensenova.ts 拆出(重构第九刀)。
 *
 * 职责:OAuth2 授权码 + PKCE 登录拿 console JWT、刷新 JWT、以及用 console JWT
 * 管理 API key(列出 / 新建 / 删除 / 替换)。密码要先按 JWKS 公钥做 JWE 再提交,
 * 所以 pkce / base64url / encrypt_password_jwe 这几个密码学工具也在这里。
 *
 * 依赖方向:auth → usage + pool(auth 不被反向依赖)。
 */

import {
  createCipheriv,
  createHash,
  createPublicKey,
  publicEncrypt,
  randomBytes,
} from "node:crypto";

import { UpstreamError } from "./types.js";
import { POOL_USAGE_URL, sensenova_username } from "./sensenova-usage.js";
import { sensenovaSnippet } from "./sensenova-pool.js";
import type { SensenovaApiKey } from "./sensenova-pool.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** IAM 基础地址 */
export const IAM_BASE = "https://iam.sensecoreapi.cn";
/** OIDC 授权地址（必须用这个发起，CSRF cookie 域问题） */
export const OIDC_AUTH = "https://platform.sensenova.cn/oauth2/auth";
/** OIDC token 地址 */
export const OIDC_TOKEN = "https://signin.sensecore.cn/oauth2/token";
/** JWKS 地址 */
export const JWKS_URL = "https://signin.sensecore.cn/.well-known/jwks.json";
/** apiKeys 地址 */
export const APIKEYS_URL = `${IAM_BASE}/iam/idp/v1/apiKeys`;
/**
 * 浏览器 UA —— 登录链与积分池接口都带它。
 *
 * 对齐 Nexus `sensenova_auth.py:UA`:平台侧对非浏览器 UA 的处理不稳定
 * (登录页可能直接不回 cookie,那就会在 POST /nova/login 阶段被回
 * `InvalidArgument`)。集中一处,免得几个调用点各写一份、日后漂移。
 */
export const SENSENOVA_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
/** OAuth2 Client ID */
export const CLIENT_ID = "nova";
/** 重定向 URI */
export const REDIRECT_URI = "https://platform.sensenova.cn";
/** OAuth2 scope */
export const SCOPE = "openid offline offline_access";
/** JWKS key id */
export const JWKS_KID = "public:hydra.openid.id-token";
// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

/**
 * PKCE S256：(verifier 字符串, challenge)。
 *
 * ⚠️ verifier 必须先 base64url 编码成**字符串**，再对它的 ASCII 做 sha256 ——
 * RFC 7636 的 S256 是 `BASE64URL(SHA256(ASCII(verifier)))`。
 */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier, "ascii").digest());
  return { verifier, challenge };
}
// ---------------------------------------------------------------------------
// JWE 密码加密
// ---------------------------------------------------------------------------

/**
 * 密码 → 标准 JWE **紧凑五段**（RSA-OAEP + A256GCM），与网页端一致。
 *
 * ⚠️ AESGCM 的 `encrypt` 返回 `ciphertext+tag` 拼接，必须拆成
 * **第4段 ciphertext** 与 **第5段 tag** 两段。
 *
 * ⚠️ RSA-OAEP 必须用 **SHA-1**（`RSA-OAEP-256` 才是 SHA-256）。
 */
export function encrypt_password_jwe(password: string, jwk: { n: string; e: string }): string {
  const modulus = Buffer.from(jwk.n, "base64url");
  const exponent = Buffer.from(jwk.e, "base64url");
  const publicKey = createPublicKey({
    key: {
      kty: "RSA",
      n: modulus.toString("base64url"),
      e: exponent.toString("base64url"),
    },
    format: "jwk",
  });

  // protected 只有 alg/enc，**不带 kid**
  const protectedHeader = { alg: "RSA-OAEP", enc: "A256GCM" };
  const protectedB64 = base64url(
    Buffer.from(JSON.stringify(protectedHeader), "utf-8"),
  );

  const cek = randomBytes(32);
  const iv = randomBytes(12);

  // RSA-OAEP(SHA-1) 加密 CEK
  const encryptedKey = publicEncrypt(
    {
      key: publicKey,
      padding: 4, // RSA_PKCS1_OAEP_PADDING
      oaepHash: "sha1",
    },
    cek,
  );

  // AES-256-GCM 加密密码
  //
  // ⚠️ Node 与 Python 的语义差别(2026-10-22 踩坑):
  //   Python `AESGCM.encrypt()` 返回 **ciphertext‖tag 拼接**,所以要拆两段;
  //   Node 的 `cipher.update()` 直接返回 **纯 ciphertext**,`final()` 返回空,
  //   tag 由 `getAuthTag()` 单独给。照搬 Python 的「减 16 字节」会把 10 字节
  //   密文切成 4+6,服务端解不开密码 → `InvalidArgument / incorrectUsernameOrPassword`。
  const cipher = createCipheriv("aes-256-gcm", cek, iv);
  // ⚠️ AAD 必须设(2026-10-22 踩坑):Python `AESGCM.encrypt(iv, data, aad)`
  // 的第三个参数是 AAD;Node 侧不调 `setAAD` 就等于没有 AAD,服务端按
  // protected header 当 AAD 校验时 GCM 认证失败 —— 报的却是
  // `InvalidArgument / incorrectUsernameOrPassword`(像密码错,实为加密错)。
  cipher.setAAD(Buffer.from(protectedB64, "utf-8"));
  const ciphertext = Buffer.concat([
    cipher.update(password, "utf-8"),
    cipher.final(),
  ]);
  const tagBytes = cipher.getAuthTag();

  return [
    protectedB64,
    base64url(encryptedKey),
    base64url(iv),
    base64url(ciphertext),
    base64url(tagBytes),
  ].join(".");
}
// ---------------------------------------------------------------------------
// base64url 工具
// ---------------------------------------------------------------------------

/**
 * base64url 编码（无填充）。
 */
export function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}
// ---------------------------------------------------------------------------
// SenseNova 认证流
// ---------------------------------------------------------------------------

/**
 * SenseNova 认证流 —— OAuth2 + PKCE + JWE 完整实现。
 *
 * 与 Nexus `sensenova_auth.py` 对齐。
 */
export class SensenovaAuthFlow {
  private jwks: { n: string; e: string } | null = null;
  private jwtCache = new Map<string, string>();
  /**
   * refresh_token 缓存(`username → token`)。
   *
   * ⚠️ 登录时申请的 scope 含 `offline_access`,所以平台会**同时**发一个
   * refresh_token 出来。它的用处:控制台 JWT 只有约 3 小时有效期,到期后
   * 常规恢复路径是「用密码重新登录一遍」—— 但那要求用户把密码**明文**留在
   * 机器上。有 refresh_token 就不需要:拿它换一个新的 JWT 即可,密码可以不留。
   *
   * 上游没发 refresh_token 时这里就是空的,行为回落到「用密码重登」。
   */
  private refreshTokenCache = new Map<string, string>();

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /**
   * 账号密码 → JWT（3h）。
   *
   * ⚠️ 每次登录用**独立的新 client**（登录完关闭）：平台把 OAuth 会话
   * 粘在连接上，复用单例 client 跨账号连续登录时会失败。
   */
  async login(account: string, username: string, password: string): Promise<string> {
    const name = sensenova_username(account) || sensenova_username(username);
    if (!username || !password) {
      throw new UpstreamError("auth", "登录需要 username 与 password", false, 401);
    }

    const { verifier, challenge } = pkce();
    const state = base64url(randomBytes(16));
    // 整条登录链共用一只 jar(见 _followUntil 注释:POST /nova/login 缺
    // session cookie 会被上游回 InvalidArgument)。
    const jar = new CookieJar();

    const authUrl =
      `${OIDC_AUTH}?client_id=${CLIENT_ID}&code_challenge=${challenge}` +
      `&code_challenge_method=S256&redirect_uri=${REDIRECT_URI}` +
      `&response_type=code&scope=${SCOPE.replace(/ /g, "%20")}&state=${state}`;

    // 跟随重定向直到 login_challenge= 出现
    const challengeUrl = await this._followUntil(
      authUrl,
      (u) => u.includes("login_challenge="),
      8,
      jar,
    );
    const url = new URL(challengeUrl);
    const loginChallenge = url.searchParams.get("login_challenge");
    if (!loginChallenge) {
      throw new UpstreamError("auth", "未能解析 login_challenge", false, 401);
    }

    // 拉 JWKS
    const jwk = await this._pubkey();

    // 加密密码
    const encrypted = encrypt_password_jwe(password, jwk);

    // POST iam/login —— **带 cookie**(对齐 Nexus `_login_with`)
    const loginHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Origin: "https://platform.sensenova.cn",
      Referer: "https://platform.sensenova.cn/",
      "User-Agent": SENSENOVA_UA,
      Accept: "*/*",
    };
    const loginCookie = jar.header();
    if (loginCookie) loginHeaders["Cookie"] = loginCookie;
    const loginResp = await this.fetchFn(`${IAM_BASE}/iam/authn/v1/auth/nova/login`, {
      method: "POST",
      headers: loginHeaders,
      body: JSON.stringify({
        username,
        password: encrypted,
        challenge: loginChallenge,
        is_encrypt: true,
      }),
    });
    jar.absorb(loginResp);

    const loginBody = (await loginResp.json()) as Record<string, unknown>;
    const redirect = loginBody["redirect"] as string | undefined;
    if (!redirect) {
      const msg = loginBody["message"] ?? loginBody["error"] ?? "无 redirect 字段";
      throw new UpstreamError("auth", `登录失败: ${msg}`, false, 401);
    }

    // 跟随重定向直到 code= 出现
    const codeUrl = await this._followUntil(redirect, (u) => u.includes("code="), 8, jar);
    const codeParsed = new URL(codeUrl);
    const code = codeParsed.searchParams.get("code");
    if (!code) {
      throw new UpstreamError("auth", "未能从回调地址解析 code", false, 401);
    }

    // POST OIDC_TOKEN
    const tokenResp = await this.fetchFn(OIDC_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": SENSENOVA_UA,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
      }),
    });

    const token = (await tokenResp.json()) as Record<string, unknown>;
    const access = token["access_token"] as string | undefined;
    if (!access) {
      const err = token["error_description"] ?? token["error"] ?? "未知";
      throw new UpstreamError("auth", `未返回 access_token: ${err}`, false, 401);
    }

    // 缓存 JWT
    this.jwtCache.set(sensenova_username(account), access);
    // ⚠️ refresh_token 也要留着(scope 含 `offline_access`):控制台 JWT 只有
    // 约 3 小时有效期,到期后拿它换一个就行,不必让用户把密码留在机器上。
    const refresh = token["refresh_token"] as string | undefined;
    if (typeof refresh === "string" && refresh !== "") {
      this.refreshTokenCache.set(sensenova_username(account), refresh);
    }
    return access;
  }

  /** 本次登录拿到的 refresh_token(没有则 undefined)。 */
  refreshTokenFor(account: string): string | undefined {
    return this.refreshTokenCache.get(sensenova_username(account));
  }

  /**
   * 用 refresh_token 换一个新的控制台 JWT —— **不需要密码**。
   *
   * ⚠️ 为什么要有这条路:控制台 JWT 约 3 小时过期,常规恢复是「用存下来的密码
   * 重新登录一遍」。那要求用户把**明文密码**留在机器上;而 refresh_token 是
   * 平台专门为「离线续期」发的凭证(scope 里就写了 `offline_access`),用它换
   * JWT 既安全又省一次风控敏感的登录。
   *
   * 平台没发 refresh_token / 它已失效 → 抛 `auth` 错,调用方回落到「用密码重登」。
   */
  async refreshConsoleJwt(
    account: string,
    refreshToken: string,
  ): Promise<string> {
    if (!refreshToken) {
      throw new UpstreamError("auth", "没有 refresh_token", false, 401);
    }
    const resp = await this.fetchFn(OIDC_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
      }),
    });
    const token = (await resp.json()) as Record<string, unknown>;
    const access = token["access_token"] as string | undefined;
    if (!access) {
      const err = token["error_description"] ?? token["error"] ?? "未知";
      throw new UpstreamError("auth", `刷新 JWT 失败: ${err}`, false, 401);
    }
    this.jwtCache.set(sensenova_username(account), access);
    const next = token["refresh_token"] as string | undefined;
    if (typeof next === "string" && next !== "") {
      this.refreshTokenCache.set(sensenova_username(account), next);
    }
    return access;
  }

  /**
   * 用 JWT 枚举账号 API key（明文 sk-），返回 `(key, 总数)`。
   */
  async fetch_api_key(account: string): Promise<{ apiKey: string; total: number }> {
    const jwt = this.jwtCache.get(sensenova_username(account));
    if (!jwt) {
      throw new UpstreamError("auth", `账号 ${account} 没有可用 JWT`, false, 401);
    }
    const resp = await this.fetchFn(`${APIKEYS_URL}?page_size=100`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console",
      },
    });
    if (resp.status !== 200) {
      throw new UpstreamError("auth", `apiKeys 拉取失败 HTTP ${resp.status}`, false, resp.status);
    }
    const body = (await resp.json()) as Record<string, unknown>;
    const keys = (body["api_keys"] as Record<string, unknown>[]) ?? [];
    const enabled = keys.filter(
      (k) => k["status"] === "enabled" && k["api_key"],
    );
    const picked =
      enabled.find((k) => k["type"] === "nova.tokenplan.v1") ?? enabled[0];
    if (!picked) {
      throw new UpstreamError("auth", "账号下没有可用的 API key", false, 401);
    }
    return {
      apiKey: picked["api_key"] as string,
      total: keys.length,
    };
  }

  /**
   * 用 JWT 列出现有 API key(**不含** api_key 明文之外的筛选)。
   *
   * 与 {@link fetch_api_key} 的区别:这里把每一把都交出去(含 id / status /
   * 是否默认),交给装配层判断「有没有、能不能用」。创建前的探查与创建后的
   * 核对都用它 —— 网关不该为「列一把」和「列全部」各写一个接口。
   */
  async list_api_keys(account: string): Promise<SensenovaApiKey[]> {
    const jwt = this.jwtCache.get(sensenova_username(account));
    if (!jwt) {
      throw new UpstreamError("auth", `账号 ${account} 没有可用 JWT`, false, 401);
    }
    const resp = await this.fetchFn(`${APIKEYS_URL}?page_size=100`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console",
      },
    });
    if (resp.status !== 200) {
      throw new UpstreamError("auth", `apiKeys 拉取失败 HTTP ${resp.status}`, false, resp.status);
    }
    const body = (await resp.json()) as Record<string, unknown>;
    const raw = (body["api_keys"] as Record<string, unknown>[]) ?? [];
    return raw.map((k) => ({
      id: typeof k["id"] === "string" ? k["id"] : "",
      displayname: typeof k["displayname"] === "string" ? k["displayname"] : "",
      api_key: typeof k["api_key"] === "string" ? k["api_key"] : "",
      status: typeof k["status"] === "string" ? k["status"] : "",
      type: typeof k["type"] === "string" ? k["type"] : "",
      is_default: k["is_default"] === true,
    }));
  }

  /**
   * 用 JWT 新建一把 API key,返回**明文 sk-**(平台只在创建响应里给一次)。
   *
   * ⚠️ 字段名是 `displayname`(不是 `name`):上游 400 会明说
   * `invalid APIKey.Displayname`,用 `name` 一律被拒。
   * ⚠️ 上游不认 `type` / `content`,创建的 key `type` 为空串 —— 所以
   * {@link fetch_api_key} 里「优先 type=nova.tokenplan.v1」的选择逻辑在新 key
   * 上不生效,但仍能取到(回落 `enabled[0]`)。
   */
  async create_api_key(account: string, displayname?: string): Promise<string> {
    const jwt = this.jwtCache.get(sensenova_username(account));
    if (!jwt) {
      throw new UpstreamError("auth", `账号 ${account} 没有可用 JWT`, false, 401);
    }
    const name =
      displayname && displayname.trim() !== ""
        ? displayname.trim().slice(0, 64)
        : `as-one-${new Date().toISOString().slice(0, 10)}`;
    const resp = await this.fetchFn(APIKEYS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console",
      },
      body: JSON.stringify({ displayname: name }),
    });
    if (resp.status !== 200) {
      const text = await resp.text().catch(() => "");
      throw new UpstreamError(
        "auth",
        `创建 API key 失败 HTTP ${resp.status}${text ? `: ${sensenovaSnippet(text)}` : ""}`,
        false,
        resp.status,
      );
    }
    const body = (await resp.json()) as Record<string, unknown>;
    const key = body["api_key"];
    if (typeof key !== "string" || key === "") {
      throw new UpstreamError("auth", "创建成功但响应里没有 api_key", false, 502);
    }
    return key;
  }

  /**
   * 删掉一把 API key(按 id)。
   *
   * 平台对「遗失的 key」的处置就是删除重建,所以清理失败的那把是正道 ——
   * 但删不掉不能算致命:旧 key 留在账号下不影响新 key 可用,如实抛给上层
   * 让它决定要不要继续。
   */
  async delete_api_key(account: string, id: string): Promise<void> {
    if (!id) return;
    const jwt = this.jwtCache.get(sensenova_username(account));
    if (!jwt) {
      throw new UpstreamError("auth", `账号 ${account} 没有可用 JWT`, false, 401);
    }
    const resp = await this.fetchFn(`${APIKEYS_URL}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console",
      },
    });
    if (resp.status !== 200) {
      const text = await resp.text().catch(() => "");
      throw new UpstreamError(
        "auth",
        `删除 API key 失败 HTTP ${resp.status}${text ? `: ${sensenovaSnippet(text)}` : ""}`,
        false,
        resp.status,
      );
    }
  }

  /**
   * 「确保有一把能用的 key」—— 自愈链的收口。
   *
   * 与 {@link ensure_api_key} 的区别:除了新建,还会**把无效的旧 key 删掉**。
   * 平台对「遗失/失效的 key」的处置就是删除重建,留着旧 key 只是占位
   * (列表里它仍然 `enabled`,下次 ensure 又会挑到它 —— 死循环)。
   *
   * 顺序:
   * 1. 列出全部,挑 enabled(优先套餐那把);
   * 2. 一把都没有 → 新建;
   * 3. `dropIds` 里点名的旧 key → 建完新的再删(先建后删,绝不出现
   *    「删了但没建成」的窗口);删不掉不算失败,回执里如实说。
   */
  async ensure_api_key_replacing(
    account: string,
    dropIds: string[] = [],
    displayname?: string,
  ): Promise<{ apiKey: string; total: number; created: boolean; dropped: string[] }> {
    const keys = await this.list_api_keys(account);
    const enabled = keys.filter((k) => k.status === "enabled" && k.api_key !== "");
    const picked =
      enabled.find((k) => k.type === "nova.tokenplan.v1") ?? enabled[0];
    if (picked && dropIds.length === 0) {
      return { apiKey: picked.api_key, total: keys.length, created: false, dropped: [] };
    }
    const apiKey = await this.create_api_key(account, displayname);
    const dropped: string[] = [];
    for (const id of dropIds) {
      try {
        await this.delete_api_key(account, id);
        dropped.push(id);
      } catch {
        /* 删不掉不算失败:新 key 已经能用,旧 key 留着不影响 */
      }
    }
    const after = await this.list_api_keys(account).catch(() => []);
    return { apiKey, total: after.length || keys.length + 1, created: true, dropped };
  }

  async ensure_api_key(
    account: string,
    displayname?: string,
  ): Promise<{ apiKey: string; total: number; created: boolean }> {
    const keys = await this.list_api_keys(account);
    const enabled = keys.filter((k) => k.status === "enabled" && k.api_key !== "");
    const picked =
      enabled.find((k) => k.type === "nova.tokenplan.v1") ?? enabled[0];
    if (picked) {
      return { apiKey: picked.api_key, total: keys.length, created: false };
    }
    const apiKey = await this.create_api_key(account, displayname);
    const after = await this.list_api_keys(account).catch(() => keys);
    return { apiKey, total: after.length + 1, created: true };
  }

  /** 获取缓存的 JWT */
  jwtFor(account: string): string | undefined {
    return this.jwtCache.get(sensenova_username(account));
  }

  /**
   * 拉取控制台积分池用量(pool-usage)。
   *
   * `jwt` 可不传:优先用显式传入的 JWT,否则回落本实例登录时缓存的 JWT
   * (登录后同一实例直接调用即可)。响应体原样返回,解析交给
   * {@link parse_pool_usage}(纯函数,层间解耦)。
   */
  async fetch_pool_usage(account: string, jwt?: string): Promise<unknown> {
    const token = jwt ?? this.jwtCache.get(sensenova_username(account));
    if (!token) {
      throw new UpstreamError("auth", `账号 ${account} 没有可用 JWT`, false, 401);
    }
    const resp = await this.fetchFn(POOL_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        Referer: "https://platform.sensenova.cn/console",
        "User-Agent": SENSENOVA_UA,
      },
    });
    if (resp.status >= 400) {
      throw new UpstreamError("auth", `sensenova 积分池接口 HTTP ${resp.status}`, false, resp.status);
    }
    return resp.json();
  }

  /** 拉取 JWKS 公钥 */
  private async _pubkey(): Promise<{ n: string; e: string }> {
    if (this.jwks) return this.jwks;
    const resp = await this.fetchFn(JWKS_URL);
    if (resp.status !== 200) {
      throw new UpstreamError("auth", `JWKS 拉取失败 HTTP ${resp.status}`, false, resp.status);
    }
    const body = (await resp.json()) as Record<string, unknown>;
    const keys = (body["keys"] as Record<string, unknown>[]) ?? [];
    const jwk = keys.find((k) => k["kid"] === JWKS_KID);
    if (!jwk) {
      throw new UpstreamError("auth", `JWKS 中没有 ${JWKS_KID}`, false, 401);
    }
    this.jwks = { n: jwk["n"] as string, e: jwk["e"] as string };
    return this.jwks;
  }

  /**
   * 手动跟随重定向直到 predicate 成立。
   *
   * ⚠️ 必须带上 cookie jar(对齐 Nexus `_follow_until`):登录链的前几跳
   * (OIDC_AUTH → … → iam 登录页)会下发 `Set-Cookie`,**POST `/nova/login`
   * 必须把那条 session cookie 带回去**,否则服务端拿不到 CSRF 值,直接
   * 回 `InvalidArgument`(Nexus 的模块 docstring 第 8 行写明了这个坑:
   * 「缺少 session cookie 时报 No CSRF value available in the session cookie」)。
   */
  private async _followUntil(
    start: string,
    predicate: (url: string) => boolean,
    maxHops = 8,
    jar?: CookieJar,
  ): Promise<string> {
    let location = start;
    for (let i = 0; i < maxHops; i++) {
      if (location && predicate(location)) {
        return location;
      }
      const headers: Record<string, string> = { Accept: "*/*", "User-Agent": SENSENOVA_UA };
      const cookie = jar?.header();
      if (cookie) headers["Cookie"] = cookie;
      const resp = await this.fetchFn(location, { redirect: "manual", headers });
      jar?.absorb(resp);
      const loc = resp.headers.get("location");
      if (loc) {
        location = new URL(loc, location).toString();
        continue;
      }
      if (resp.status === 200 || resp.status === 201) {
        const text = await resp.text();
        const next = this._nextFromHtml(text);
        if (next) {
          location = new URL(next, location).toString();
          continue;
        }
      }
      break;
    }
    if (location && predicate(location)) {
      return location;
    }
    throw new UpstreamError("auth", "登录回调链中断:未取到 authorization code", false, 401);
  }

  /**
   * 从 HTML 响应体里找下一跳(对齐 Nexus `_next_from_html`)。
   *
   * 只认 `url=` 太窄:真实登录页给的是 `code=` 的完整 URL、`<meta http-equiv
   * ="refresh">`,或 `window.location.replace(...)` 这类 JS 跳转。少一种形态
   * 就会在中间页断链,报「登录回调链中断」。
   */
  private _nextFromHtml(html: string): string | null {
    if (!html) return null;
    const codeUrl = html.match(/(https?:\/\/[^"'\s<>]+[?&]code=[^&"'\s<>]+)/);
    if (codeUrl) return codeUrl[1];
    const meta = html.match(
      /<meta[^>]+http-equiv=["']refresh["'][^>]+url=["']([^"']+)/i,
    );
    if (meta) return meta[1].replace(/&amp;/g, "&");
    for (const pattern of [
      /window\.location\.replace\(["']([^"']+)["']\)/,
      /window\.location\.href\s*=\s*["']([^"']+)["']/,
      /location\.href\s*=\s*["']([^"']+)["']/,
      /window\.location\s*=\s*["']([^"']+)["']/,
    ]) {
      const js = html.match(pattern);
      if (js) return js[1].replace(/&amp;/g, "&");
    }
    return null;
  }
}
/**
 * 极简 cookie jar:合并 `Set-Cookie`,逐跳回传(同域)。
 *
 * 对齐 Nexus `_CookieJar`:只取每个 `Set-Cookie` 的 `name=value` 部分,
 * 丢弃 Path/HttpOnly/SameSite 等属性 —— 手动跟重定向时用不上,带回去反而
 * 可能被服务端按属性重新解释。
 */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(resp: { headers: Headers }): void {
    // undici 的 Headers 有 getSetCookie();没有时回落单值解析。
    const withSet = resp.headers as Headers & { getSetCookie?: () => string[] };
    const lines = typeof withSet.getSetCookie === "function" ? withSet.getSetCookie() : [];
    const raw = lines.length > 0 ? lines : [resp.headers.get("set-cookie") ?? ""];
    for (const line of raw) {
      if (!line) continue;
      const pair = line.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair);
    }
  }

  header(): string {
    return [...this.cookies.values()].join("; ");
  }
}
