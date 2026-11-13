/**
 * SenseNova 连接器 —— 协议要点（来自 Nexus `sensenova_auth.py` / `sensenova.py`）。
 *
 * 这个文件现在只剩**连接器本体**（`SensenovaAdapter`）。原来 1798 行的实现按职责
 * 拆成了四个文件（重构第九刀），本文件仍 re-export 其余三组的全部符号，所以
 * `import ... from "./sensenova.js"` 的老写法一行都不用改：
 *
 * | 文件 | 职责 |
 * | --- | --- |
 * | `sensenova-usage.ts` | 429 归因、可计费 token 折算、pool-usage 解析、JWT 到期（纯函数） |
 * | `sensenova-auth.ts` | OAuth2 + PKCE + JWE 登录、JWT 刷新、API key 的列出/新建/删除/替换 |
 * | `sensenova-pool.ts` | 账号池运行时与钉连接（`SensenovaAccountRuntime` / `SensenovaAccountPool`） |
 * | 本文件 | `SensenovaAdapter`：把池 + 传输接到连接器契约上 |
 *
 * ## 认证流程（细节在 sensenova-auth.ts）
 * 1. PKCE S256：verifier = base64url(random 32), challenge = base64url(sha256(verifier 字符串的 ASCII))
 * 2. 密码 JWE：RSA-OAEP(SHA-1!) + A256GCM
 * 3. 登录：GET OIDC_AUTH → 跟随重定向 → 拿 login_challenge → POST iam/login with JWE password
 *    → 跟随重定向 → 拿 code → POST OIDC_TOKEN with code_verifier → JWT(3h)
 * 4. apiKeys：GET IAM_BASE/iam/idp/v1/apiKeys with Bearer console JWT → 找 enabled + api_key
 *
 * ## 连接器
 * - `Authorization: Bearer <api_key>`（从池中选择）
 * - 端点：`/chat/completions`, 恒走 SSE
 *
 * ## 429 双码（归因逻辑在 sensenova-usage.ts）
 * - code=8 → ATTR_RPM（账号级限流）
 * - code=429003 → ATTR_SHARED（上游共享容量）
 *
 * ⚠️ 两种归因都**不换号**：一次请求只用拿到的那一个账号（用户 m23215 定案，
 * 见 {@link SensenovaAdapter} 类注释）。
 */

import {
  AuthConnector,
  ConnectorCredentials,
  RequestDecoration,
  TokenState,
  UpstreamError,
  upstreamRawResponse,
} from "./types.js";
import {
  ATTR_RPM,
  ATTR_SHARED,
  POOL_EXHAUSTED,
  POOL_SATURATED,
  billable_tokens,
  classify_rate_limit,
} from "./sensenova-usage.js";
import {
  ACCOUNT_WAIT_BUDGET_S,
  BILLABLE_WINDOW_S,
  COOLDOWN_ON_HOLD,
  SensenovaAccountPool,
  SensenovaAccountRuntime,
  pinnedPostJson,
  sensenovaKeyFingerprint,
  sensenovaSnippet,
} from "./sensenova-pool.js";
import type { SensenovaAccount } from "./sensenova-pool.js";
export {
  ATTR_RPM,
  ATTR_SHARED,
  ATTR_UNKNOWN,
  CODE_RPM_RE,
  CODE_SHARED_RE,
  DEFAULT_BASE_URL,
  PLATFORM_BASE,
  POOL_EXHAUSTED,
  POOL_SATURATED,
  POOL_USAGE_URL,
  billable_tokens,
  classify_rate_limit,
  intRound,
  jwt_expiry_epoch_s,
  numOrNull,
  parse_pool_usage,
  sensenova_username,
  toEpochSeconds,
  windowOf,
} from "./sensenova-usage.js";
export type {
  SensenovaPoolUsageParsed,
  SensenovaPoolWindow,
  SensenovaQuotaPoolParsed,
} from "./sensenova-usage.js";
export {
  APIKEYS_URL,
  CLIENT_ID,
  CookieJar,
  IAM_BASE,
  JWKS_KID,
  JWKS_URL,
  OIDC_AUTH,
  OIDC_TOKEN,
  REDIRECT_URI,
  SCOPE,
  SENSENOVA_UA,
  SensenovaAuthFlow,
  base64url,
  encrypt_password_jwe,
  pkce,
} from "./sensenova-auth.js";
export {
  ACCOUNT_WAIT_BUDGET_S,
  BILLABLE_WINDOW_S,
  COOLDOWN_ON_HOLD,
  HEALTH_WINDOW_S,
  LOG_LOW_TPM_THRESHOLD,
  SensenovaAccountPool,
  SensenovaAccountRuntime,
  pinnedPostJson,
  sensenovaKeyFingerprint,
  sensenovaSnippet,
} from "./sensenova-pool.js";
export type {
  SensenovaAccount,
  SensenovaApiKey,
} from "./sensenova-pool.js";
// ---------------------------------------------------------------------------
// SenseNova 连接器
// ---------------------------------------------------------------------------

/**
 * 429 归因 → 下次重试前的等待秒数(受剩余预算 clamp)。
 *
 * tpm/rpm 是**60s 滑动窗口**:上游按「最近 60s 消耗」判定限流,而我们每
 * 5s 打一次会**不断刷新窗口** —— 窗口里永远有一个刚发出的请求,于是永远
 * 429,预算耗完仍失败(实测 100s 预算、115s 才返回)。所以窗口型限流
 * (`code=8` / `rpm exhausted` → ATTR_RPM;`429003` / `tpm/rpm limit` →
 * ATTR_SHARED)必须**等满一个完整窗口**(BILLABLE_WINDOW_S)再打,让窗口
 * 真正滑过去;瞬时型 429(归因未知)保持短间隔 COOLDOWN_ON_HOLD。
 *
 * 返回 `Math.min(step, waitLeft)`:预算只剩一半时等一半,预算耗尽返回 0
 * (调用方在 `waitLeft <= 0` 分支直接抛 heldTooLong,不 sleep)。
 *
 * @param rawBody 429 的原始响应体(归因只认它,空串按瞬时型处理)。
 * @param waitLeft 本请求剩余的同号等待预算(秒)。
 */
export function holdDelaySeconds(rawBody: string, waitLeft: number): number {
  const attribution = classify_rate_limit(rawBody || "");
  const windowed = attribution === ATTR_RPM || attribution === ATTR_SHARED;
  const step = windowed ? BILLABLE_WINDOW_S : COOLDOWN_ON_HOLD;
  return Math.max(0, Math.min(step, waitLeft));
}

/**
 * SenseNova 连接器 —— 实现 {@link AuthConnector} 契约。
 *
 * 认证:`Authorization: Bearer <api_key>`
 * 端点:`/chat/completions`, 恒走 SSE
 *
 * ## 账号调度:粘性绑**真实模型**级,账号可轮换(用户 2026-11-01 定案)
 *
 * 这条**修正**了 m23215 的「绝不换号」:那条定案的前提是「换号会把限流甩给
 * 同池下一个号 + 打散前缀缓存亲和」。实测两点都站不住:
 * - sensenova 的上游**前缀缓存跨账号共享**(按推理节点存放,与凭证无关),
 *   换账号不丢缓存亲和 —— 粘性只需绑在真实模型一级,账号是同模型下的负载分担;
 * - rpm/rps/tpm 都是**账号级**限流,死等同一个号只会把 100s 预算烧光
 *   (实测 latency 100~160s 后仍 429,用户看到「rps exhausted」)。
 *
 * 现行规则:
 * 1. **一次请求一个账号**,但 429 时**可换到池内其它空闲未冷却账号**(见
 *    {@link pickOtherAccount});换过的号进 `tried`,防 A→B→A 打转;
 * 2. **会话粘性由 Router 的 session pin 负责**(`scheduler.pin_seconds`),粘的是
 *    **真实模型**;连接器在模型内部换号不影响它;
 * 3. 换无可换 → **同号有界硬等**(窗口型等满 60s 窗口,瞬时型 5s;总预算
 *    `ACCOUNT_WAIT_BUDGET_S = 100s`);预算耗尽抛**可重试的 `rate_limit`**
 *    (带 `retryAfter`,见 {@link heldTooLong}),由客户端/上游退避;
 * 4. **新会话 / 粘性过期 → 挑一个空闲账号**({@link pickIdle}):判据只有
 *    「`inflight === 0` 且账号级没冷却」;**不看模型** —— 不同模型可以用同一个
 *    账号(冷却仍按 (账号,模型) 记录,只作面板展示,不参与选号);
 * 5. 单账号单并发(`inflight` 标记)+ 每账号一条钉连接 —— 前缀缓存按 1024-token
 *    块存在推理节点本地,单条 keep-alive 顺序请求稳定命中;
 * 6. 日志纪律:**只有窗口可计费 token < 16384 却仍 429**(什么都没发就被限流)
 *    才写 warn;常规 429 / 连续失败不写。
 *
 * 与 Nexus `sensenova.py` 的 `AccountPool` / `AccountRuntime` 对应。Nexus 的
 * `_iter_upstream` 换号循环**在同一请求内也会换号** —— 本连接器保留了这一点
 * (见规则 1),但只在 429 时换、且换过的号不重复试。
 */
export class SensenovaAdapter implements AuthConnector {
  readonly vendorId = "sensenova";

  /** 账号池(跨请求存活 —— tpm/rpm 记账与冷却都挂在这里)。 */
  private readonly pool = new SensenovaAccountPool();

  /**
   * 账号池版本号:`setAccounts` 每次调用 +1。
   *
   * `getToken` 在选号前比对 —— 凭据在两次请求之间被改过(面板增删账号)
   * 就立刻重投影一次。没有它,新加的账号要等下一次 `setAccounts` 才生效。
   */
  private poolVersion = 0;

  constructor(
    private accounts: SensenovaAccount[] = [],
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.pool.setAccounts(accounts);
  }

  /**
   * 替换账号池(整池替换,**保留已存在账号的运行态**)。
   *
   * 装配层在凭据变化时调用(面板增删 sensenova 账号 / 刷新任务写完新 key)。
   */
  setAccounts(accounts: SensenovaAccount[]): void {
    this.accounts = accounts;
    this.pool.setAccounts(accounts);
    this.poolVersion += 1;
  }

  /** 账号池快照(**不含明文 key**)—— 面板展示。 */
  poolSnapshot(): Record<string, Record<string, unknown>> {
    return this.pool.snapshot();
  }

  /** 账号名 → api_key(仅进程内使用;测试与面板诊断)。 */
  accountKeyOf(username: string): string | undefined {
    return this.accounts.find((a) => a.username === username)?.api_key;
  }

  /** 池外 api_key 的临时运行态(按 key 摘要做键,绝不把 key 本身当键名)。 */
  private readonly adhoc = new Map<string, SensenovaAccountRuntime>();
  private adhocRuntime(apiKey: string): SensenovaAccountRuntime {
    const fp = sensenovaKeyFingerprint(apiKey);
    let rt = this.adhoc.get(fp);
    if (!rt) {
      rt = new SensenovaAccountRuntime();
      rt.name = fp;
      this.adhoc.set(fp, rt);
    }
    rt.key = apiKey;
    return rt;
  }

  /**
   * 本轮请求**起始**用哪一个账号(单账号;换号在 {@link runWithAccount} 里发生)。
   *
   * 分支(优先级从高到低):
   * 1. `creds.sensenova_account` 钉死 → 只有它(池里没有 → 400);
   * 2. 池空 → 只用 `creds.apiKey`(单账号,按 key 摘要建临时运行态);
   * 3. `creds.apiKey` 属池 → **从它开始**(网关注入哪号就先试哪号);
   * 4. `creds.apiKey` 不在池 → 只用它(池外身份,不拿别的身份顶替);
   * 5. 都没带 → 从池里挑**一个空闲账号**({@link pickIdle})。
   *
   * ⚠️ 分支 3 只决定**起点**。429 时 {@link runWithAccount} 会换到池内其它空闲
   * 账号(用户 2026-11-01 定案:缓存跨账号共享,粘性绑真实模型级)。
   * 分支 4 的池外 key **不参与换号** —— 池里没有它,也就没有第二个身份可选。
   */
  private accountFor(creds: ConnectorCredentials): SensenovaAccountRuntime {
    const pinned =
      typeof creds["sensenova_account"] === "string" ? String(creds["sensenova_account"]) : "";
    if (pinned) {
      try {
        return this.pool.runtime(pinned);
      } catch {
        throw new UpstreamError(
          "bad_request",
          `[sensenova] 账号池里没有 ${pinned};可用:${this.pool.names().join(", ") || "(空)"}`,
          false,
          400,
        );
      }
    }
    const apiKey = creds.apiKey;
    if (this.pool.size === 0) {
      if (!apiKey) {
        throw new UpstreamError("auth", "[sensenova] 账号池为空且请求未带 api_key", false, 401);
      }
      return this.adhocRuntime(apiKey);
    }
    if (apiKey) {
      const name = this.pool.nameByKey(apiKey);
      // 池外 key 也按单账号处理(不建池内运行态,避免日志/快照留明文)。
      return name === null ? this.adhocRuntime(apiKey) : this.pool.runtime(name);
    }
    return this.pickIdle();
  }

  /**
   * 从池里挑**一个空闲账号**(新会话 / 粘性过期时的选号,用户 m23215)。
   *
   * 判据只有两条:
   * - `inflight === 0`(没在途请求 —— 上游要求单账号单并发);
   * - 账号级没冷却(`isAccountCooling`,键 `""` 那一格)。
   *
   * **不看模型** —— 不同模型可以用同一个账号;按 (账号,模型) 的冷却记录只作
   * 面板展示,不参与选号(旧实现会因某模型冷却就把该号排除,甚至误判池空)。
   *
   * 一个都没有 → 池空(`POOL_EXHAUSTED`,可重试 429):等占用释放 / 冷却过期,
   * **不换身份**(这里本来就是在挑号,没有「换」的概念)。
   */
  private pickIdle(): SensenovaAccountRuntime {
    const now = Date.now();
    const idle = this.pool
      .names()
      .map((n) => this.pool.runtime(n))
      .filter((rt) => rt.inflight === 0 && !rt.isAccountCooling(now));
    if (idle.length === 0) {
      throw new UpstreamError(
        POOL_EXHAUSTED,
        "[sensenova] 没有空闲账号(全部单并发占用中或账号级冷却中),请退避约 15s",
        true,
        429,
        15,
      );
    }
    // 空闲随机:并发新会话不要都压第一个号(也没有别的轮转机制了)。
    return idle[Math.floor(Math.random() * idle.length)]!;
  }

  /**
   * 429 换号:从池里挑一个**没试过**的空闲未冷却账号(没有 → `null`)。
   *
   * 为什么允许换号(用户 2026-11-01 定案,修正 m23215 的「绝不换号」):
   * sensenova 的上游**前缀缓存跨账号共享**(按推理节点存放,与凭证无关),
   * 所以换账号不会丢缓存亲和 —— 粘性只需要绑在**真实模型**一级,账号是
   * 同模型下的负载分担。rpm/rps/tpm 都是**账号级**限流,换一个号就能继续,
   * 死等同一个号只会把 100s 预算烧光(实测)。
   *
   * `tried` 由调用方维护:防 A→B→A 打转。池外 adhoc 账号(`name === ""`)
   * 不参与换号 —— 没有池就没有第二个身份可选。
   */
  private pickOtherAccount(
    tried: ReadonlySet<string>,
    now: number,
  ): SensenovaAccountRuntime | null {
    const idle = this.pool
      .names()
      .map((n) => this.pool.runtime(n))
      .filter((rt) => rt.inflight === 0 && !rt.isAccountCooling(now) && !tried.has(rt.name));
    if (idle.length === 0) return null;
    return idle[Math.floor(Math.random() * idle.length)]!;
  }

  /**
   * 取**本轮请求**要用的账号并占用它(单并发 +1)。
   *
   * 调用方必须配对 {@link releaseFor}(`runWithAccount` 里在 finally)。
   *
   * ⚠️ 钉死/网关注入的账号**不判冷却**:它只是本轮的**起点**,429 时
   * {@link runWithAccount} 仍会换到池内其它空闲号(见 {@link pickOtherAccount})。
   * 只有 {@link pickIdle} 这条「挑一个新号」的路才会在选号阶段就跳过
   * 占用中 / 账号级冷却的号。
   */
  private acquireFor(creds: ConnectorCredentials): SensenovaAccountRuntime {
    const rt = this.accountFor(creds);
    rt.inflight += 1;
    return rt;
  }

  private releaseFor(rt: SensenovaAccountRuntime): void {
    if (rt.inflight > 0) rt.inflight -= 1;
  }

  /**
   * 取一次上游调用要用的账号(运行时),**不发起请求**。
   *
   * 供装配层/测试直接验证调度判据;请求路径走 {@link runWithAccount}。
   */
  runtimeFor(creds: ConnectorCredentials): SensenovaAccountRuntime {
    return this.acquireFor(creds);
  }

  /**
   * 补记一次成功请求的可计费 token(SSE 尾块拿到 usage 后调用)。
   *
   * @param username 池内账号名(池外 adhoc 传运行时 name)。
   */
  recordSpendFor(username: string, usage: unknown, ttftMs: number): void {
    let rt: SensenovaAccountRuntime | undefined;
    try {
      rt = this.pool.runtime(username);
    } catch {
      rt = undefined;
    }
    if (!rt) rt = this.adhoc.get(username);
    if (!rt) return;
    const now = Date.now();
    rt.recordSpend(billable_tokens(usage), now);
    rt.recordOutcome(true, ttftMs, now);
  }

  /**
   * 账号运行态快照(面板诊断)—— **不含明文 key**。
   */
  runtimeSnapshot(username: string): Record<string, unknown> | null {
    try {
      return this.pool.runtime(username).snapshot();
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // 上游请求 + 单账号调度(对应 Nexus `_attempt`,**不含** `_iter_upstream` 换号)
  // -------------------------------------------------------------------------

  /**
   * 打一次上游 chat 请求。
   *
   * 账号策略(用户 2026-11-01 更新定案,修正 m23215「绝不换号」):
   * - **粘性绑定在真实模型一级**,不是账号一级 —— sensenova 上游前缀缓存
   *   跨账号共享(按推理节点存放,与凭证无关),换账号不丢缓存亲和;
   * - 所以池内**多个账号**时,429(账号级限流 rpm/rps/tpm)应**轮换到其它
   *   空闲未冷却账号**继续试,而不是死等同一个号 —— 这正是「rps exhausted
   *   报错时应该换号」的机制依据;
   * - 换无可换(全部试过 / 全在冷却 / 池就一个号)→ 回落到**同号硬等**
   *   (窗口型等满 60s,瞬时型 5s),预算耗尽抛 `rate_limit` 交给调用方退避。
   *
   * 判据顺序:
   * 1. 选号({@link accountFor}):钉死 > 网关注入 key 属池 > 池外单账号 > 池里一个空闲号;
   * 2. 非 429 失败(401/403/400/5xx)→ 直接抛(不换号:拿别的身份顶替会掩盖真问题);
   * 3. 429 → 池内还有**其它**空闲未冷却账号 → 换过去重试(旧号记账号级冷却,
   *    新会话选号会跳过它),换出的号继续试;
   * 4. 换无可换 → 同号硬等(窗口型等满一个窗口再打,见 {@link holdDelaySeconds});
   * 5. 预算耗尽 → 给该号记**账号级**冷却并抛 {@link heldTooLong}。
   *
   * ⏱️ 等待时间由调用方计入 TTFT:客户端请求进入网关那一刻就是起点。
   */
  async runWithAccount(
    url: string,
    body: Record<string, unknown>,
    model: string,
    creds: ConnectorCredentials,
    signal?: AbortSignal,
    /** 同号等待预算(秒)。默认 {@link ACCOUNT_WAIT_BUDGET_S};测试传 0 跳过真实等待。 */
    waitBudgetSeconds: number = ACCOUNT_WAIT_BUDGET_S,
  ): Promise<{ res: Response; runtime: SensenovaAccountRuntime }> {
    // ⚠️ 有界:绝不能用无预算的 `for(;;)`,那会在上游持续 429 时让请求挂起。
    // `let` 而非 `const`:429 换号会把本轮用的账号换成池里另一个号。
    let rt = this.acquireFor(creds);
    let waitLeft = Math.max(0, waitBudgetSeconds);
    let waitedS = 0;
    /** 本轮已试过的账号名(防 A→B→A 死循环)。 */
    const tried = new Set<string>([rt.name]);
    try {
      for (;;) {
        // 客户端已断开 → 不要再打上游。
        if (signal?.aborted) throw new UpstreamError("connection", "客户端断开", false, 499);
        // ⚠️ **走钉连接**(不是全局 fetchFn):前缀缓存按推理节点本地存放,
        // 连接换了节点就换,缓存块丢一半(见 pinnedHttpAgent 注释)。
        const res = await this.pinnedFetch(rt, url, body, signal);
        if (res.ok) return { res, runtime: rt };

        const text = await res.text().catch(() => "");
        const err = this.classifyError(res.status, text);
        rt.recordOutcome(false, 0, Date.now());
        if (res.status !== 429) throw err; // 非限流:401/403 是凭据问题,换号也无用

        const now = Date.now();
        // 429 且池内还有其它空闲未冷却账号 → 换号重试(缓存跨账号共享,粘性=真实模型级)。
        // 旧号记账号级冷却:新会话选号会跳过它(已粘住的会话不受影响,见 runWithAccount 头注)。
        if (rt.name !== "" && this.pool.size > 1) {
          const next = this.pickOtherAccount(tried, now);
          if (next !== null) {
            tried.add(next.name);
            rt.coolAccountFor(BILLABLE_WINDOW_S, sensenovaSnippet(text), now);
            this.releaseFor(rt); // 释放旧号占用(单账号单并发)
            next.inflight += 1; // 占用新号
            rt = next;
            continue; // 换到新号直接打(它可能没被限流)
          }
        }
        if (waitLeft <= 0) {
          // 换无可换 + 预算耗尽:报可重试的 rate_limit + retryAfter,
          // 让客户端/上游退避;退避回来还是这个号(会话还粘着它)。
          rt.coolAccountFor(BILLABLE_WINDOW_S, sensenovaSnippet(text), now);
          throw this.heldTooLong(rt, err, waitedS);
        }
        // 同号硬等:窗口型限流(tpm/rpm,60s 滑动)等满一个窗口再打 ——
        // 每 5s 刷一次会把窗口永远顶在「刚打过」,实测 100s 预算仍 429;
        // 瞬时型 429 保持 COOLDOWN_ON_HOLD 短间隔(见 holdDelaySeconds)。
        const delay = holdDelaySeconds(text, waitLeft);
        rt.coolFor(delay, sensenovaSnippet(text), model, now);
        await this.sleep(delay * 1000);
        waitLeft -= delay;
        waitedS += delay;
      }
    } finally {
      this.releaseFor(rt);
    }
  }

  /**
   * 换无可换 + 同号等待预算耗尽后的错误,交给调用方退避。
   *
   * 抛 `rate_limit`(可重试,HTTP 429)并带 `retryAfter = ` 一个可计费滚动窗口
   * ({@link BILLABLE_WINDOW_S}s):网关把它当 `Retry-After` 回给客户端。
   * 上游原文(含 `code=8` / `shared` 归因)不动,拼在消息里 —— 面板/客户端该看到
   * 上游那句报错本身。
   *
   * ⚠️ 走到这里说明**池里所有号都试过/都在冷却**(单号池则只试过一个):
   * 这是「确实没有可用的号了」,不是「懒得换」。会话粘性绑在真实模型级,
   * 退避回来后同模型下任意一个恢复的号都能接(见 runWithAccount 头注)。
   */
  private heldTooLong(
    rt: SensenovaAccountRuntime,
    err: UpstreamError,
    waitedS: number,
  ): UpstreamError {
    // ⚠️ 上游原件透传(用户 m36329):这一层只是「我们等太久了」的包装,
    // 但客户端真正该看到的还是上游那次 429 的原文 —— 把 err.raw 原样带上去。
    return new UpstreamError(
      "rate_limit",
      `[sensenova] 账号 ${rt.name || "(adhoc)"} 同号等待 ${Math.round(waitedS)}s 后仍被限流` +
        `(池内已无可换的空闲账号,请退避约 ${BILLABLE_WINDOW_S}s 后重试) — ${err.message}`,
      true,
      429,
      BILLABLE_WINDOW_S,
      err.raw,
    );
  }

  /** sleep(连接器内部等待,不让客户端重试;时长计入 TTFT)。 */
  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * 走**该账号的钉连接**发一次请求(返回标准 `Response`,与 fetch 同形)。
   *
   * 为什么不用 `this.fetchFn`(Node 全局 fetch):undici 全局连接池会为同一
   * origin 开多条连接并轮转,每换一条就可能落到不同推理节点 → 上游前缀缓存
   * (按 1024-token 块存在节点本地)**命中率掉一半**。Nexus 用
   * `max_connections=1` 的独立 client 钉死节点,这里用 `maxSockets: 1` 的
   * `https.Agent` 达到同样效果。
   *
   * 注入的 `fetchFn`(测试替身)仍然优先 —— 单测不该真的连网。
   */
  private async pinnedFetch(
    rt: SensenovaAccountRuntime,
    url: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rt.key}`,
    };
    // 测试注入的 fetchFn(非全局 fetch)优先:保持既有单测可替换。
    if (this.fetchFn !== fetch) {
      return this.fetchFn(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    }
    return pinnedPostJson(url, headers, JSON.stringify(body), rt.pinnedHttpAgent(), signal);
  }

  async getToken(creds: ConnectorCredentials): Promise<TokenState> {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      // 从账号池选第一个 enabled 的(旧路径:装配层不注入账号池时仍可用)
      const enabled = this.accounts.filter((a) => a.enabled !== false);
      if (enabled.length === 0) {
        throw new UpstreamError("auth", "[sensenova] 账号池为空且请求未带 api_key", false, 401);
      }
      return { accessToken: enabled[0].api_key, expiresAt: Number.POSITIVE_INFINITY };
    }
    return { accessToken: apiKey, expiresAt: Number.POSITIVE_INFINITY };
  }

  decorateRequest(base: RequestDecoration, token: TokenState): RequestDecoration {
    return {
      ...base,
      headers: { ...base.headers, Authorization: `Bearer ${token.accessToken}` },
    };
  }

  classifyError(httpStatus: number, body: unknown): UpstreamError {
    // ⚠️ 上游原样优先(用户 m05267):sensenova 的报错 body 带 message/displayMsg,
    // 面板/客户端该看到上游那句话,而不是网关的通用文案。这里把 body 摘要
    // 拼在 kind 文案后面 —— 连接器层 UpstreamError 的 message 是给**日志**看的。
    // ⚠️ 客户端看到的是 `raw`(上游原件逐字,用户 m36329):message 里的改写
    // 只影响日志,不影响对外的响应体。
    const raw = sensenovaSnippet(body);
    // ⚠️ JSON.stringify(null)="null"、stringify("")='""' 都不是有效摘要。
    const rawText = raw.replace(/^(null|""|'')$/, "").trim();
    const withRaw = (text: string): string =>
      rawText ? `${text} — 上游:${rawText}` : text;
    const original = upstreamRawResponse(httpStatus, body);
    // 429 双码归因
    if (httpStatus === 429) {
      const bodyStr = typeof body === "string" ? body : JSON.stringify(body ?? "");
      const attribution = classify_rate_limit(bodyStr);
      if (attribution === ATTR_SHARED) {
        return new UpstreamError(POOL_SATURATED, withRaw("整个池子都满"), false, 429, undefined, original);
      }
      if (attribution === ATTR_RPM) {
        return new UpstreamError(POOL_EXHAUSTED, withRaw("账号额度耗尽"), true, 429, undefined, original);
      }
      return new UpstreamError("rate_limit", withRaw("上游限流"), true, 429, undefined, original);
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return new UpstreamError("auth", withRaw("认证失败"), false, httpStatus, undefined, original);
    }
    if (httpStatus >= 500) {
      return new UpstreamError("upstream", withRaw("上游错误"), true, httpStatus, undefined, original);
    }
    if (httpStatus >= 400) {
      return new UpstreamError("bad_request", withRaw("请求错误"), false, httpStatus, undefined, original);
    }
    return new UpstreamError("upstream", withRaw("未知错误"), true, httpStatus, undefined, original);
  }
}
