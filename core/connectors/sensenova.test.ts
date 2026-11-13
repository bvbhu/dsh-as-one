/**
 * SenseNova 连接器测试 —— OAuth2 + PKCE + JWE。
 *
 * 禁止真实网络/真实子进程。
 */

import { describe, it, expect } from "vitest";
import { createDecipheriv, generateKeyPairSync, privateDecrypt } from "node:crypto";
import {
  SensenovaAdapter,
  SensenovaAuthFlow,
  holdDelaySeconds,
  pkce,
  encrypt_password_jwe,
  classify_rate_limit,
  billable_tokens,
  sensenova_username,
  ATTR_RPM,
  ATTR_SHARED,
  ATTR_UNKNOWN,
  POOL_SATURATED,
  POOL_EXHAUSTED,
  CLIENT_ID,
  REDIRECT_URI,
  SCOPE,
  JWKS_KID,
  jwt_expiry_epoch_s,
  parse_pool_usage,
  POOL_USAGE_URL,
  APIKEYS_URL,
} from "./sensenova.js";
import { UpstreamError } from "./types.js";
import type { SensenovaAccountRuntime } from "./sensenova.js";

/** 造一个能过 jwt_expiry_epoch_s 的假三段 JWT(exp 可注入)。 */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(payload)}.sig`;
}

/** pool-usage 报文样例(镜像 Nexus collector 实测形状)。 */
function samplePoolUsage(): Record<string, unknown> {
  return {
    plan: { id: "free", name: "Free Plan", type: "PLATFORM_FREE" },
    pools: [
      {
        id: "p1",
        name: "通用积分池",
        pool_type: "default",
        model_ids: ["nova-lite"],
        window_5h: {
          limit: "200000",
          used: "98000",
          remaining: "102000",
          reset_at: "1790000000",
        },
        window_7d: {
          limit: "1000000",
          used: "600000",
          remaining: "400000",
          reset_at: "1790000000",
        },
        grant_balance: "2062.5432",
        nearest_grant_expiry: "1793973600",
        nearest_grant_expiring_balance: "0.53",
      },
      {
        name: "Flash-Lite积分池",
        pool_type: "dedicated",
        grant_balance: "0",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 用户名归一
// ---------------------------------------------------------------------------

describe("sensenova_username", () => {
  it("sensenova-xxx → xxx", () => {
    expect(sensenova_username("sensenova-test")).toBe("test");
  });

  it("无前缀保持不变", () => {
    expect(sensenova_username("test")).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

describe("pkce", () => {
  it("生成 verifier 和 challenge", () => {
    const { verifier, challenge } = pkce();
    expect(verifier).toBeDefined();
    expect(challenge).toBeDefined();
    expect(verifier).not.toBe(challenge);
  });

  it("verifier 和 challenge 不同", () => {
    const { verifier, challenge } = pkce();
    expect(verifier).not.toBe(challenge);
  });

  it("两次生成不同", () => {
    const p1 = pkce();
    const p2 = pkce();
    expect(p1.verifier).not.toBe(p2.verifier);
    expect(p1.challenge).not.toBe(p2.challenge);
  });
});

// ---------------------------------------------------------------------------
// JWE 加密
// ---------------------------------------------------------------------------

describe("encrypt_password_jwe", () => {
  // 动态生成有效 RSA 密钥对（避免硬编码无效 n 值）
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
  const testJwk = { n: jwk.n, e: jwk.e };

  it("生成五段 JWE", () => {
    const jwe = encrypt_password_jwe("password123", testJwk);
    const parts = jwe.split(".");
    expect(parts.length).toBe(5);
  });

  it("五段都非空", () => {
    const jwe = encrypt_password_jwe("password123", testJwk);
    const parts = jwe.split(".");
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });

  // 2026-10-22 两个线上坑的回归锁:
  //   ①Node 的 GCM `update()` 返回纯密文、`getAuthTag()` 单独给 tag,
  //     照搬 Python「ciphertext‖tag 再减 16 字节」会把密文切坏;
  //   ②AAD 必须显式 setAAD(protected header),否则服务端 GCM 校验失败,
  //     却报 `InvalidArgument / incorrectUsernameOrPassword`(像密码错)。
  it("密文长度 == 明文长度,tag 恰好 16 字节(不切坏)", () => {
    const password = "password123";
    const parts = encrypt_password_jwe(password, testJwk).split(".");
    const ciphertext = Buffer.from(parts[3], "base64url");
    const tag = Buffer.from(parts[4], "base64url");
    expect(ciphertext.length).toBe(Buffer.byteLength(password, "utf-8"));
    expect(tag.length).toBe(16);
  });

  it("能用私钥解出原密码(AAD=protected header 必须参与认证)", () => {
    const password = "password123";
    const parts = encrypt_password_jwe(password, testJwk).split(".");
    const [protectedB64, encKeyB64, ivB64, ctB64, tagB64] = parts;

    const cek = privateDecrypt(
      { key: privateKey, padding: 4, oaepHash: "sha1" },
      Buffer.from(encKeyB64, "base64url"),
    );
    expect(cek.length).toBe(32);

    const decipher = createDecipheriv(
      "aes-256-gcm",
      cek,
      Buffer.from(ivB64, "base64url"),
    );
    // 不设 AAD 就解不开 —— 这条断言正是线上那个 bug 的形状。
    decipher.setAAD(Buffer.from(protectedB64, "utf-8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]);
    expect(plain.toString("utf-8")).toBe(password);
  });

  it("不设 AAD 解密必须失败(GCM 认证)", () => {
    const parts = encrypt_password_jwe("password123", testJwk).split(".");
    const [protectedB64, encKeyB64, ivB64, ctB64, tagB64] = parts;
    const cek = privateDecrypt(
      { key: privateKey, padding: 4, oaepHash: "sha1" },
      Buffer.from(encKeyB64, "base64url"),
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      cek,
      Buffer.from(ivB64, "base64url"),
    );
    // 只设一个别的 AAD(模拟「AAD 对不上」)
    decipher.setAAD(Buffer.from("wrong-aad", "utf-8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    expect(() =>
      Buffer.concat([
        decipher.update(Buffer.from(ctB64, "base64url")),
        decipher.final(),
      ]),
    ).toThrow();
    expect(protectedB64.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 429 归因
// ---------------------------------------------------------------------------

describe("classify_rate_limit", () => {
  it("429003 → ATTR_SHARED", () => {
    expect(classify_rate_limit('{"code":429003,"message":"tpm/rpm limit"}')).toBe(ATTR_SHARED);
  });

  it("tpm/rpm limit → ATTR_SHARED", () => {
    expect(classify_rate_limit("tpm/rpm limit exceeded")).toBe(ATTR_SHARED);
  });

  it("code=8 → ATTR_RPM", () => {
    expect(classify_rate_limit('{"code":8,"message":"rpm exhausted"}')).toBe(ATTR_RPM);
  });

  it("rpm exhausted → ATTR_RPM", () => {
    expect(classify_rate_limit("rpm exhausted")).toBe(ATTR_RPM);
  });

  it("未知 → ATTR_UNKNOWN", () => {
    expect(classify_rate_limit("unknown error")).toBe(ATTR_UNKNOWN);
  });

  it("空 → ATTR_UNKNOWN", () => {
    expect(classify_rate_limit("")).toBe(ATTR_UNKNOWN);
  });
});

// ---------------------------------------------------------------------------
// holdDelaySeconds —— tpm exhausted 等待一个完整窗口
// ---------------------------------------------------------------------------

describe("holdDelaySeconds", () => {
  it("code=8 / rpm exhausted(ATTR_RPM)→ 等满 BILLABLE_WINDOW_S 窗口", () => {
    expect(holdDelaySeconds('{"code":8,"message":"tpm exhausted"}', 100)).toBe(60);
    expect(holdDelaySeconds('{"code":8,"message":"rpm exhausted"}', 100)).toBe(60);
    expect(holdDelaySeconds("tpm/rpm limit exceeded", 100)).toBe(60);
    expect(holdDelaySeconds('{"code":429003,"message":"shared"}', 100)).toBe(60);
  });

  it("窗口型但预算不足 → 预算截断(等 `Math.min(窗口, waitLeft)`)", () => {
    expect(holdDelaySeconds('{"code":8,"message":"tpm exhausted"}', 30)).toBe(30);
    expect(holdDelaySeconds('{"code":8,"message":"tpm exhausted"}', 0)).toBe(0);
  });

  it("未知归因(非窗口型)→ 短间隔 COOLDOWN_ON_HOLD", () => {
    expect(holdDelaySeconds("unknown error", 100)).toBe(5);
    expect(holdDelaySeconds("", 100)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// billable_tokens
// ---------------------------------------------------------------------------

describe("billable_tokens", () => {
  it("正常计算", () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      prompt_tokens_details: { cached_tokens: 20 },
    };
    expect(billable_tokens(usage)).toBe(130); // (100-20) + 50
  });

  it("无缓存", () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
    };
    expect(billable_tokens(usage)).toBe(150);
  });

  it("全部缓存", () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      prompt_tokens_details: { cached_tokens: 100 },
    };
    expect(billable_tokens(usage)).toBe(50);
  });

  it("空 usage", () => {
    expect(billable_tokens(null)).toBe(0);
    expect(billable_tokens(undefined)).toBe(0);
    expect(billable_tokens({})).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SenseNova 认证流
// ---------------------------------------------------------------------------

describe("SensenovaAuthFlow", () => {
  it("login 缺少 username 抛错", async () => {
    const flow = new SensenovaAuthFlow();
    await expect(flow.login("account", "", "pass")).rejects.toThrow(UpstreamError);
  });

  it("login 缺少 password 抛错", async () => {
    const flow = new SensenovaAuthFlow();
    await expect(flow.login("account", "user", "")).rejects.toThrow(UpstreamError);
  });

  it("fetch_api_key 无 JWT 抛错", async () => {
    const flow = new SensenovaAuthFlow();
    await expect(flow.fetch_api_key("account")).rejects.toThrow(UpstreamError);
  });

  it("jwtFor 未登录返回 undefined", () => {
    const flow = new SensenovaAuthFlow();
    expect(flow.jwtFor("account")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SensenovaAdapter
// ---------------------------------------------------------------------------

describe("SensenovaAdapter", () => {
  it("vendorId 是 sensenova", () => {
    const adapter = new SensenovaAdapter();
    expect(adapter.vendorId).toBe("sensenova");
  });

  it("getToken 返回 api_key 作为 accessToken", async () => {
    const adapter = new SensenovaAdapter();
    const token = await adapter.getToken({ apiKey: "my-api-key" });
    expect(token.accessToken).toBe("my-api-key");
  });

  it("getToken 从账号池选择(兼容路径:池非空取首个 enabled)", async () => {
    const adapter = new SensenovaAdapter([
      { username: "user1", api_key: "key1" },
      { username: "user2", api_key: "key2", enabled: false },
    ]);
    const token = await adapter.getToken({});
    expect(token.accessToken).toBe("key1");
  });

  it("runtimeFor 钉死账号(creds.sensenova_account)", () => {
    const adapter = new SensenovaAdapter([
      { username: "a", api_key: "ka" },
      { username: "b", api_key: "kb" },
    ]);
    const rt = adapter.runtimeFor({ sensenova_account: "b" });
    expect(rt.name).toBe("b");
    rt.inflight = 0; // runtimeFor 内部 acquireFor 会 +1,归还
  });

  it("runtimeFor 钉死不存在的账号 → bad_request 且带可用名单", () => {
    const adapter = new SensenovaAdapter([{ username: "a", api_key: "ka" }]);
    let err: unknown;
    try {
      adapter.runtimeFor({ sensenova_account: "zzz" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).kind).toBe("bad_request");
    expect((err as UpstreamError).message).toContain("zzz");
    expect((err as UpstreamError).message).toContain("a");
  });

  it("runtimeFor 空池 + creds.apiKey → adhoc 单账号(name 是 key 摘要,绝不明文)", () => {
    const adapter = new SensenovaAdapter([]);
    const rt = adapter.runtimeFor({ apiKey: "secret-key" });
    expect(rt.name).not.toContain("secret");
    expect(rt.name.length).toBe(12);
    rt.inflight = 0;
  });

  it("recordSpendFor 记进滚动窗口(命中缓存不计 tpm)", () => {
    const adapter = new SensenovaAdapter([{ username: "a", api_key: "ka" }]);
    adapter.recordSpendFor(
      "a",
      { prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 900 }, completion_tokens: 200 },
      120,
    );
    const snap = adapter.runtimeSnapshot("a");
    expect(snap).not.toBeNull();
    const rt = adapter.runtimeFor({ apiKey: "ka" });
    // billable = (1000-900)+200 = 300
    expect(rt.billableInWindow(Date.now())).toBe(300);
    rt.inflight = 0;
  });

  it("setAccounts 同名账号保留运行态(冷却/滚动计数不归零)", () => {
    const adapter = new SensenovaAdapter([{ username: "a", api_key: "ka" }]);
    const rt = adapter.runtimeFor({ apiKey: "ka" });
    rt.inflight = 0;
    rt.coolFor(30, "tpm", "m1", Date.now());
    const before = rt.coolingRemaining("m1", Date.now());
    expect(before).toBeGreaterThan(0);
    // 凭据刷新(同一账号,key 换了)之后重灌:运行态必须保留(冷却不归零)。
    // ⚠️ 不在这里断言「选号会拒绝它」—— 冷却按 (账号,模型) 分格只作展示、
    // 不参与选号(用户 m23215:不同模型可以用同一个账号)。这里要验的是
    // 「运行态没被 setAccounts 抹掉」,看快照。
    adapter.setAccounts([{ username: "a", api_key: "ka2" }]);
    const snap = adapter.poolSnapshot()["a"] as Record<string, unknown>;
    expect(snap).toBeDefined();
    const cooling = snap["cooldown_models"] as Array<{ model: string; remaining_s: number }>;
    expect(cooling.some((c) => c.model === "m1" && c.remaining_s > 0)).toBe(true);
    // key 已换:再取运行时必须是新 key(冷却仍在,故用内部运行时读取)。
    const rtNow = (adapter as unknown as { pool: { runtime(n: string): SensenovaAccountRuntime } }).pool.runtime("a");
    expect(rtNow.key).toBe("ka2");
    expect(rtNow.coolingRemaining("m1", Date.now())).toBeGreaterThan(0);
  });

  it("setAccounts 已删除账号从池里摘掉", () => {
    const adapter = new SensenovaAdapter([
      { username: "a", api_key: "ka" },
      { username: "b", api_key: "kb" },
    ]);
    adapter.setAccounts([{ username: "a", api_key: "ka" }]);
    expect(adapter.poolSnapshot()["b"]).toBeUndefined();
  });

  it("runWithAccount:429 时**换到池内其它空闲账号**(用户 2026-11-01 定案)", async () => {
    // 背景修正:此前是 m23215「绝不换号」(理由:换号只是把限流甩给下一个号 +
    // 打散前缀缓存亲和)。用户 2026-11-01 定案推翻它 —— sensenova 前缀缓存
    // **跨账号共享**(按推理节点存放,与凭证无关),粘性绑真实模型级即可,账号
    // 是同模型下的负载分担;rpm/rps/tpm 都是**账号级**限流,换号就能继续。
    // 实测旧行为:死等同一个号,latency 100~160s 后仍 429(用户看到 rps exhausted)。
    const seen: string[] = [];
    let calls = 0;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      calls += 1;
      seen.push(String((init.headers as Record<string, string>)["Authorization"]));
      return new Response(JSON.stringify({ error: { message: "rpm exhausted", code: "8" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const adapter = new SensenovaAdapter(
      [
        { username: "a", api_key: "ka" },
        { username: "b", api_key: "kb" },
      ],
      fetchFn,
    );
    let err: unknown;
    try {
      // apiKey="ka" 属池 → 从 a 开始;429 → 换到 b(池内唯一其它号);b 也 429 →
      // 换无可换 + 预算 0 → 抛错。所以是 **2 次调用、两个不同账号**。
      await adapter.runWithAccount("https://x/v1/chat/completions", {}, "m1", { apiKey: "ka" }, undefined, 0);
    } catch (e) {
      err = e;
    }
    const e = err as UpstreamError;
    expect(e).toBeInstanceOf(UpstreamError);
    expect(calls).toBe(2); // 死循环时是 Infinity;不换号时是 1
    expect(seen).toEqual(["Bearer ka", "Bearer kb"]); // 确实换了号,不是同号重试
    // 可重试的 rate_limit + retryAfter(= 一个可计费滚动窗口),由客户端/上游退避。
    expect(e.kind).toBe("rate_limit");
    expect(e.retryable).toBe(true);
    expect(e.retryAfter).toBe(60); // = BILLABLE_WINDOW_S
    expect(e.message).toContain("rpm exhausted"); // 上游原样透传
    expect(e.message).toContain("池内已无可换");
    // 两个号都记了账号级冷却(新会话选号会跳过它们)。
    const pool = (adapter as unknown as {
      pool: { runtime(n: string): SensenovaAccountRuntime };
    }).pool;
    expect(pool.runtime("a").isAccountCooling(Date.now())).toBe(true);
    expect(pool.runtime("b").isAccountCooling(Date.now())).toBe(true);
  });

  it("换无可换(单号池)才同号硬等;预算耗尽抛错并记账号级冷却", async () => {
    const seen: string[] = [];
    let calls = 0;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      calls += 1;
      seen.push(String((init.headers as Record<string, string>)["Authorization"]));
      return new Response(JSON.stringify({ error: { message: "rpm exhausted", code: "8" } }), {
        status: 429,
      });
    }) as unknown as typeof fetch;
    // **单号池**:没有别的号可换 → 只能同号硬等。
    const adapter = new SensenovaAdapter([{ username: "a", api_key: "ka" }], fetchFn);
    const t0 = Date.now();
    // 预算 0.05s:先硬等 50ms(同号)→ 再打**同一个号** → 预算耗尽抛错。
    await expect(
      adapter.runWithAccount("https://x/v1/chat/completions", {}, "m1", { apiKey: "ka" }, undefined, 0.05),
    ).rejects.toThrow(/池内已无可换/);
    expect(calls).toBe(2);
    expect(seen).toEqual(["Bearer ka", "Bearer ka"]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
    // 预算耗尽 → 该号账号级冷却:新会话选号跳过它。
    const pool = (adapter as unknown as {
      pool: { runtime(n: string): SensenovaAccountRuntime };
    }).pool;
    expect(pool.runtime("a").isAccountCooling(Date.now())).toBe(true);
  });

  it("非 429 失败直接抛:不重试、不换号", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      return new Response("{}", { status: 401 });
    }) as unknown as typeof fetch;
    const adapter = new SensenovaAdapter(
      [
        { username: "a", api_key: "ka" },
        { username: "b", api_key: "kb" },
      ],
      fetchFn,
    );
    await expect(
      adapter.runWithAccount("https://x/v1/chat/completions", {}, "m1", { apiKey: "ka" }, undefined, 5),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(calls).toBe(1); // 401 是凭据问题,换号只会掩盖真问题
  });

  it("pickAvailable 单并发互斥:占用的账号不再被选(池空 → 可重试)", () => {
    const adapter = new SensenovaAdapter([{ username: "a", api_key: "ka" }]);
    const rt = adapter.runtimeFor({ apiKey: "ka" }); // inflight=1,没归还
    let err: unknown;
    try {
      adapter.runtimeFor({});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).kind).toBe(POOL_EXHAUSTED);
    // 旧语义「换号无效 → 不可重试」已随换号机制删除:现在只是等占用释放,
    // 报可重试的 429(带 retryAfter)。
    expect((err as UpstreamError).retryable).toBe(true);
    expect((err as UpstreamError).retryAfter).toBe(15);
    rt.inflight = 0; // 归还
  });

  it("新会话选号只挑空闲账号:占用中的 a 被跳过,选中 b(用户 m23215)", () => {
    const adapter = new SensenovaAdapter([
      { username: "a", api_key: "ka" },
      { username: "b", api_key: "kb" },
    ]);
    const busy = adapter.runtimeFor({ apiKey: "ka" }); // a: inflight = 1
    const picked = adapter.runtimeFor({}); // 都没带 → 从池里挑一个空闲号
    expect(picked.name).toBe("b");
    picked.inflight = 0;
    busy.inflight = 0;
  });

  it("账号级冷却中的号不被新会话选中;全池都不可用才算池空", () => {
    const adapter = new SensenovaAdapter([
      { username: "a", api_key: "ka" },
      { username: "b", api_key: "kb" },
    ]);
    const pool = (adapter as unknown as {
      pool: { runtime(n: string): SensenovaAccountRuntime };
    }).pool;
    pool.runtime("a").coolAccountFor(30, "429", Date.now());
    const picked = adapter.runtimeFor({});
    expect(picked.name).toBe("b"); // a 账号级冷却中 → 跳过
    picked.inflight = 0;
    pool.runtime("b").coolAccountFor(30, "429", Date.now());
    let err: unknown;
    try {
      adapter.runtimeFor({});
    } catch (e) {
      err = e;
    }
    expect((err as UpstreamError).kind).toBe(POOL_EXHAUSTED);
    expect((err as UpstreamError).retryable).toBe(true);
  });

  it("冷却按 (账号,模型) 分格:卡在 m1 不影响 m2,且**不**因此判池空", () => {
    const adapter = new SensenovaAdapter([{ username: "a", api_key: "ka" }]);
    const rt = adapter.runtimeFor({ apiKey: "ka" });
    rt.inflight = 0;
    rt.coolFor(30, "tpm", "m1", Date.now());
    expect(rt.isCooling("m1", Date.now())).toBe(true);
    expect(rt.isCooling("m2", Date.now())).toBe(false);
    // 选号只看「空闲 + 账号级冷却」,不看模型(不同模型可共用同一个账号)。
    const rt2 = adapter.runtimeFor({});
    expect(rt2.name).toBe("a");
    rt2.inflight = 0;
  });

  it("getToken 账号池为空抛错", async () => {
    const adapter = new SensenovaAdapter([]);
    await expect(adapter.getToken({})).rejects.toThrow(UpstreamError);
  });

  it("decorateRequest 注入 Bearer <_REDACTED>", () => {
    const adapter = new SensenovaAdapter();
    const decorated = adapter.decorateRequest(
      { headers: {} },
      { accessToken: "my-token", expiresAt: Number.POSITIVE_INFINITY },
    );
    expect(decorated.headers["Authorization"]).toBe("Bearer my-token");
  });

  it("classifyError 429 + code=8 → pool_exhausted", () => {
    const adapter = new SensenovaAdapter();
    const err = adapter.classifyError(429, { code: 8 });
    expect(err.kind).toBe(POOL_EXHAUSTED);
  });

  it("classifyError 429 + code=429003 → pool_saturated", () => {
    const adapter = new SensenovaAdapter();
    const err = adapter.classifyError(429, { code: 429003 });
    expect(err.kind).toBe(POOL_SATURATED);
  });

  it("classifyError 401 → auth", () => {
    const adapter = new SensenovaAdapter();
    const err = adapter.classifyError(401, {});
    expect(err.kind).toBe("auth");
  });

  it("classifyError 500 → upstream", () => {
    const adapter = new SensenovaAdapter();
    const err = adapter.classifyError(500, {});
    expect(err.kind).toBe("upstream");
  });
});

// ---------------------------------------------------------------------------
// 控制台 JWT 过期判定
// ---------------------------------------------------------------------------

describe("jwt_expiry_epoch_s", () => {
  it("标准三段 JWT 读 exp(epoch 秒)", () => {
    expect(jwt_expiry_epoch_s(fakeJwt({ exp: 1793973600 }))).toBe(1793973600);
  });

  it("坏 payload(非 JSON) → null", () => {
    const b64 = Buffer.from("not json").toString("base64url");
    expect(jwt_expiry_epoch_s(`a.${b64}.c`)).toBeNull();
  });

  it("缺 exp / 段数不足 / 空串 → null", () => {
    expect(jwt_expiry_epoch_s(fakeJwt({ sub: "x" }))).toBeNull();
    expect(jwt_expiry_epoch_s("only-two-parts")).toBeNull();
    expect(jwt_expiry_epoch_s("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 积分池解析
// ---------------------------------------------------------------------------

describe("parse_pool_usage", () => {
  it("解析实测报文形状(通用池 + 专属池)", () => {
    const p = parse_pool_usage(samplePoolUsage());
    expect(p.plan_name).toBe("Free Plan");
    expect(p.plan_type).toBe("PLATFORM_FREE");
    expect(p.pools).toHaveLength(2);

    const general = p.pools[0]!;
    expect(general.pool_type).toBe("default");
    expect(general.pool_name).toBe("通用积分池");
    // 窗口字段齐全
    expect(general.w5).toEqual({
      limit: 200000,
      used: 98000,
      remaining: 102000,
      reset_at: 1790000000,
    });
    expect(general.w7!.remaining).toBe(400000);
    // 固定积分 round,在途发放不取整
    expect(general.grant_balance).toBe(2063);
    expect(general.grant_expiry).toBe(1793973600);
    expect(general.grant_expiring_balance).toBe(0.53);

    const dedicated = p.pools[1]!;
    expect(dedicated.pool_type).toBe("dedicated");
    expect(dedicated.grant_balance).toBe(0); // 明确是 0,不是 null
    expect(dedicated.w5).toBeNull();
    expect(dedicated.w7).toBeNull();
    expect(dedicated.grant_expiry).toBeNull();

    // 总余量 = round(2063 + 400000),**只算通用池**;周上限 1000000。
    // 专属池(Flash-Lite积分池)的 grant_balance=0 不进这里 —— 它有模型白名单,
    // 并进来会让「可用余额」既不能随便花、也不等于任何单池余额(用户 2026-11-07 定案)。
    expect(p.grant_total).toBe(2063);
    expect(p.grant_known).toBe(true);
    expect(p.remaining).toBe(402063);
    expect(p.limit).toBe(1000000);
    // 专属池单独计数,供按池展示用。
    expect(p.dedicated_grant_known).toBe(true);
    expect(p.dedicated_grant_total).toBe(0);
  });

  it("pools 为 dict 时取 values", () => {
    const p = parse_pool_usage({ pools: { a: { name: "池A", pool_type: "default" } } });
    expect(p.pools).toHaveLength(1);
    expect(p.pools[0]!.pool_name).toBe("池A");
  });

  it("上游只给 limit/used 时按 max(0, limit-used) 补余量", () => {
    const p = parse_pool_usage({
      pools: [
        {
          name: "池B",
          pool_type: "default",
          window_7d: { limit: "100", used: "60" },
        },
      ],
    });
    expect(p.pools[0]!.w7!.remaining).toBe(40);
    expect(p.remaining).toBe(40);
    expect(p.limit).toBe(100);
  });

  it("窗口缺省时退池级 week_* 字段", () => {
    const p = parse_pool_usage({
      pools: [
        { name: "池C", pool_type: "default", week_limit: "5000", week_balance: "3000" },
      ],
    });
    expect(p.pools[0]!.w5).toBeNull();
    expect(p.pools[0]!.w7).toBeNull();
    expect(p.remaining).toBe(3000);
    expect(p.limit).toBe(5000);
    expect(p.grant_total).toBeNull(); // 没给 grant → null(不是 0)
  });

  it("空报文 → 全空(remaining 也是 null,不是 0)", () => {
    const p = parse_pool_usage(null);
    expect(p.plan_name).toBeNull();
    expect(p.pools).toHaveLength(0);
    expect(p.grant_total).toBeNull();
    expect(p.grant_known).toBe(false);
    expect(p.remaining).toBeNull();
    expect(p.limit).toBeNull();
    // 没有任何专属池 → 专属合计也是 null(不是 0)
    expect(p.dedicated_grant_total).toBeNull();
    expect(p.dedicated_grant_known).toBe(false);
  });

  it("grant_balance 缺 vs 0 不混淆", () => {
    const p = parse_pool_usage({
      pools: [{ name: "池D", pool_type: "default" }],
    });
    expect(p.pools[0]!.grant_balance).toBeNull();
    expect(p.grant_known).toBe(false);
  });

  // -------------------------------------------------------------------
  // 通用池 / 专属池必须分开统计(用户 2026-11-07 定案)
  // -------------------------------------------------------------------

  it("专属池的发放与周窗口都不并入 remaining", () => {
    const p = parse_pool_usage({
      pools: [
        {
          name: "通用积分池",
          pool_type: "default",
          grant_balance: "100",
          window_7d: { limit: "1000", used: "400" },
        },
        {
          // 专属池:有模型白名单,只能跑特定模型 —— 它的额度不能当通用余额花。
          name: "Flash-Lite积分池",
          pool_type: "dedicated",
          grant_balance: "9999",
          window_7d: { limit: "88888", used: "0" },
        },
      ],
    });
    // remaining/limit 只来自通用池:100 + 600,上限 1000。
    expect(p.grant_total).toBe(100);
    expect(p.remaining).toBe(700);
    expect(p.limit).toBe(1000);
    // 专属池单独记账,供按池展示。
    expect(p.dedicated_grant_total).toBe(9999);
    expect(p.dedicated_grant_known).toBe(true);
    // 两个池都还在 pools[] 里逐条可见 —— 不隐藏,只是不合并。
    expect(p.pools).toHaveLength(2);
    expect(p.pools[1]!.grant_balance).toBe(9999);
    expect(p.pools[1]!.w7!.remaining).toBe(88888);
  });

  it("只有专属池时 remaining 为 null(不拿受限额度冒充通用余额)", () => {
    const p = parse_pool_usage({
      pools: [{ name: "Flash-Lite积分池", pool_type: "dedicated", grant_balance: "500" }],
    });
    expect(p.remaining).toBeNull();
    expect(p.grant_total).toBeNull();
    expect(p.grant_known).toBe(false);
    expect(p.dedicated_grant_total).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// fetch_pool_usage(注入 mock fetchFn,禁真实网络)
// ---------------------------------------------------------------------------

describe("SensenovaAuthFlow.fetch_pool_usage", () => {
  it("无 JWT 抛 UpstreamError(401)", async () => {
    const flow = new SensenovaAuthFlow();
    await expect(flow.fetch_pool_usage("user1")).rejects.toThrow(UpstreamError);
  });

  it("显式传 jwt,响应体原样返回", async () => {
    const body = samplePoolUsage();
    const mockFetch = (async () => ({
      status: 200,
      json: async () => body,
    })) as unknown as typeof fetch;
    const flow = new SensenovaAuthFlow(mockFetch);
    const raw = await flow.fetch_pool_usage("user1", "some.jwt");
    expect(raw).toBe(body);
  });

  it("非 2xx 抛 UpstreamError(HTTP 状态透传)", async () => {
    const mockFetch = (async () => ({
      status: 403,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const flow = new SensenovaAuthFlow(mockFetch);
    const err = await flow
      .fetch_pool_usage("user1", "some.jwt")
      .then(() => null, (e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).httpStatus).toBe(403);
  });

  it("请求头带 Bearer + Referer + UA,URL 是 POOL_USAGE_URL", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const mockFetch = (async (url: unknown, init: unknown) => {
      captured = { url: String(url), init: init as RequestInit };
      return { status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;
    const flow = new SensenovaAuthFlow(mockFetch);
    await flow.fetch_pool_usage("user1", "abc.jwt");
    expect(captured!.url).toBe(POOL_USAGE_URL);
    const headers = captured!.init!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer abc.jwt");
    expect(headers["Referer"]).toBe("https://platform.sensenova.cn/console");
    expect(String(headers["User-Agent"])).toContain("Chrome");
  });
});

// ---------------------------------------------------------------------------
// API key 自愈链:list / create / delete / ensure(用户 m16204)
// ---------------------------------------------------------------------------

/** 往私有的 jwtCache 里塞一把假 JWT(测试不该真走登录链)。 */
function withJwt(flow: SensenovaAuthFlow, account: string): void {
  const priv = flow as unknown as { jwtCache: Map<string, string> };
  priv.jwtCache.set(sensenova_username(account), "fake.jwt.token");
}

describe("SensenovaAuthFlow API key 自愈链", () => {
  it("list_api_keys:把每一把都交出去(含 id/status/type)", async () => {
    const mockFetch = (async () => ({
      status: 200,
      json: async () => ({
        api_keys: [
          { id: "k1", displayname: "0", api_key: "sk-old", status: "enabled", type: "nova.tokenplan.v1", is_default: true },
          { id: "k2", displayname: "tmp", api_key: "sk-tmp", status: "disabled", type: "" },
        ],
      }),
    })) as unknown as typeof fetch;
    const flow = new SensenovaAuthFlow(mockFetch);
    withJwt(flow, "u1");
    const keys = await flow.list_api_keys("u1");
    expect(keys).toHaveLength(2);
    expect(keys[0]!.id).toBe("k1");
    expect(keys[0]!.type).toBe("nova.tokenplan.v1");
    expect(keys[0]!.is_default).toBe(true);
    expect(keys[1]!.status).toBe("disabled");
    expect(keys[1]!.is_default).toBe(false);
  });

  it("create_api_key:字段名必须是 displayname(用 name 会被上游 400)", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const mockFetch = (async (url: unknown, init: unknown) => {
      captured = { url: String(url), init: init as RequestInit };
      return { status: 200, json: async () => ({ api_key: "sk-new" }) };
    }) as unknown as typeof fetch;
    const flow = new SensenovaAuthFlow(mockFetch);
    withJwt(flow, "u1");
    const key = await flow.create_api_key("u1", "as-one-probe");
    expect(key).toBe("sk-new");
    expect(captured!.url).toBe(APIKEYS_URL);
    expect(captured!.init!.method).toBe("POST");
    const body = JSON.parse(String(captured!.init!.body));
    expect(body.displayname).toBe("as-one-probe");
    expect(body.name).toBeUndefined();
  });

  it("create_api_key:非 200 抛 UpstreamError(状态透传)", async () => {
    const mockFetch = (async () => ({
      status: 400,
      text: async () => '{"code":3,"message":"InvalidArgument"}',
    })) as unknown as typeof fetch;
    const flow = new SensenovaAuthFlow(mockFetch);
    withJwt(flow, "u1");
    const err = await flow.create_api_key("u1").then(() => null, (e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect((err as UpstreamError).httpStatus).toBe(400);
  });

  it("delete_api_key:按 id 拼路径 + DELETE", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const mockFetch = (async (url: unknown, init: unknown) => {
      captured = { url: String(url), init: init as RequestInit };
      return { status: 200, text: async () => "{}" };
    }) as unknown as typeof fetch;
    const flow = new SensenovaAuthFlow(mockFetch);
    withJwt(flow, "u1");
    await flow.delete_api_key("u1", "k-abc");
    expect(captured!.url).toBe(`${APIKEYS_URL}/k-abc`);
    expect(captured!.init!.method).toBe("DELETE");
  });

  it("ensure_api_key:已有 enabled → 复用,created=false(优先套餐那把)", async () => {
    const mockFetch = (async () => ({
      status: 200,
      json: async () => ({
        api_keys: [
          { id: "k2", displayname: "tmp", api_key: "sk-tmp", status: "enabled", type: "" },
          { id: "k1", displayname: "0", api_key: "sk-plan", status: "enabled", type: "nova.tokenplan.v1" },
        ],
      }),
    })) as unknown as typeof fetch;
    const flow = new SensenovaAuthFlow(mockFetch);
    withJwt(flow, "u1");
    const r = await flow.ensure_api_key("u1");
    expect(r.created).toBe(false);
    expect(r.apiKey).toBe("sk-plan"); // 不是数组第一个,是套餐那把
    expect(r.total).toBe(2);
  });

  it("ensure_api_key:一把都没有 → 新建,created=true", async () => {
    let phase = 0;
    const mockFetch = (async (url: unknown, init: unknown) => {
      const i = init as RequestInit | undefined;
      if (i?.method === "POST") {
        return { status: 200, json: async () => ({ api_key: "sk-fresh" }) };
      }
      phase += 1;
      // 创建前:列表里只有一把已删除的
      return {
        status: 200,
        json: async () =>
          phase === 1
            ? { api_keys: [{ id: "k0", displayname: "gone", api_key: "sk-gone", status: "deleted", type: "" }] }
            : { api_keys: [{ id: "k9", displayname: "as-one", api_key: "sk-fresh", status: "enabled", type: "" }] },
      };
    }) as unknown as typeof fetch;
    const flow = new SensenovaAuthFlow(mockFetch);
    withJwt(flow, "u1");
    const r = await flow.ensure_api_key("u1");
    expect(r.created).toBe(true);
    expect(r.apiKey).toBe("sk-fresh");
  });

  it("无 JWT 时三个入口都抛 UpstreamError(绝不静默成功)", async () => {
    const flow = new SensenovaAuthFlow();
    await expect(flow.list_api_keys("nobody")).rejects.toThrow(UpstreamError);
    await expect(flow.create_api_key("nobody")).rejects.toThrow(UpstreamError);
    await expect(flow.ensure_api_key("nobody")).rejects.toThrow(UpstreamError);
  });
});

describe("classifyError 上游原样(用户 m05267)", () => {
  const ad = new SensenovaAdapter([{ username: "a", api_key: "ka" }]);

  it("429 带上游 body 摘要(双码归因仍生效)", () => {
    const shared = ad.classifyError(429, { code: 429003, message: "inference exceeds tpm/rpm limit" });
    expect(shared.kind).toBe(POOL_SATURATED);
    expect(shared.retryable).toBe(false);
    expect(shared.message).toContain("上游:");
    expect(shared.message).toContain("inference exceeds tpm/rpm limit");

    const rpm = ad.classifyError(429, { code: 8, message: "rpm exhausted" });
    expect(rpm.kind).toBe(POOL_EXHAUSTED);
    expect(rpm.message).toContain("rpm exhausted");
  });

  it("401/400 也带上游原文,不透传凭据片段以外的东西", () => {
    const auth = ad.classifyError(401, { message: "Invalid API key" });
    expect(auth.kind).toBe("auth");
    expect(auth.message).toContain("Invalid API key");

    const bad = ad.classifyError(400, { message: "bad model" });
    expect(bad.kind).toBe("bad_request");
    expect(bad.message).toContain("bad model");
  });

  it("body 为空时退化为纯 kind 文案(不出现空「上游:」)", () => {
    expect(ad.classifyError(500, "").message).toBe("上游错误");
    expect(ad.classifyError(500, null).message).toBe("上游错误");
  });
});
