/**
 * SenseNova 账号池 —— 从 sensenova.ts 拆出(重构第九刀)。
 *
 * 职责:单账号的滚动窗口 / 冷却 / 占用状态(`SensenovaAccountRuntime`),
 * 与整池的挑选轮转(`SensenovaAccountPool`);还有钉连接用的 `pinnedPostJson`
 * —— 前缀缓存按 1024-token 块存在推理节点本地,换连接就掉块,所以每账号固定
 * 一条 keep-alive 连接(maxSockets=1)。
 *
 * 零跨组依赖(除下面的错误类型)。
 */

import { createHash } from "node:crypto";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

import { UpstreamError } from "./types.js";

// ---------------------------------------------------------------------------
// SenseNova 账号池调度(tpm/rpm 本地记账 + 429 同号硬等)
// ---------------------------------------------------------------------------

/**
 * 可计费滚动窗口长度(秒)—— Nexus `BILLABLE_WINDOW_S`。
 *
 * TPM/RPM 是**分钟级**窗口:上游按最近 60s 的消耗判定限流,所以本地记账也
 * 必须按 60s 滚动窗口记。记成累计值会在长连接上误判「这个号烧了很多」。
 */
export const BILLABLE_WINDOW_S = 60;
/**
 * 429 时的**同号重试间隔**(秒)—— Nexus `COOLDOWN_ON_HOLD`。
 *
 * 单账号策略下不再换号(用户 m23215):粘性期内 429 → 等这么久后打**同一个**
 * 账号。同时给 (账号,模型) 冷却表记一笔,供面板看到「这个号的这个模型在限流」
 * (纯展示,不参与选号)。
 */
export const COOLDOWN_ON_HOLD = 5;
/** 单账号累计等待预算(秒)—— Nexus `ACCOUNT_WAIT_BUDGET_S`。 */
export const ACCOUNT_WAIT_BUDGET_S = 100;
/** 健康度滚动窗口(秒)—— Nexus `HEALTH_WINDOW_S`。 */
export const HEALTH_WINDOW_S = 300;
/**
 * 日志纪律阈值(窗口内可计费 token)—— 用户 m05751 定案。
 *
 * 只有「60s 窗口内可计费 token 低于这个值、却仍然触发 429」才写日志:
 * 那意味着我们**什么都没发**就被限流,是上游侧异常(配额/风控),不是我们
 * 自己打太快。常规 429 / 连续失败不写(那是正常现象,写了就是刷屏)。
 */
export const LOG_LOW_TPM_THRESHOLD = 16384;
/** 账号池条目 */
export interface SensenovaAccount {
  username: string;
  api_key: string;
  enabled?: boolean;
}
/**
 * 控制台上「一把 API key」的形状。
 *
 * 平台返回字段里我们只认这六个:`id`(删除要用)、`displayname`(展示)、
 * `api_key`(明文,**只在列表与创建响应里出现**)、`status`(enabled / 已删除)、
 * `type`(套餐 key 是 `nova.tokenplan.v1`,新建的为空串)、`is_default`。
 */
export interface SensenovaApiKey {
  id: string;
  displayname: string;
  api_key: string;
  status: string;
  type: string;
  is_default: boolean;
}
/**
 * 单账号运行态 —— 每账号一份,**跨请求存活**(账号池挂在适配器实例上)。
 *
 * 对应 Nexus `AccountRuntime`。三样东西:
 * - `spend`:60s 滚动可计费窗口(只记账 / 诊断,**不再**参与换号判据);
 * - `health`:成功/失败计数 + 最近 TTFT(供面板展示,不参与选路);
 * - `cooldown`:按 (账号, 模型) 分格的冷却表 —— 模型格只作展示;账号格
 *   (键 `""`)才是**新会话选号**时跳过的判据(`isAccountCooling`)。
 */
export class SensenovaAccountRuntime {
  /** 60s 窗口内的 `(ts, billable)` 序列。 */
  private readonly spend: Array<{ t: number; n: number }> = [];
  private requests = 0;
  private errors = 0;
  private lastTtftMs = 0;
  private lastUsedAt = 0;
  /** 模型 → 冷却截止(ms epoch)。键 `""` = 账号级兜底格。 */
  private readonly cooldownUntil = new Map<string, number>();
  /** 模型 → 冷却原因(上游报文摘要,已压白)。 */
  private readonly cooldownReason = new Map<string, string>();
  /** 单账号单并发:当前在途请求数(连接器内部,不经 router 账本)。 */
  inflight = 0;

  /** 账号名(池内;池外 adhoc 为 key 摘要)。**不进 snapshot**。 */
  name = "";

  /**
   * 该账号的 api_key(**进程内使用;绝不进 snapshot / 日志**)。
   *
   * 挂在运行态上而不是回头查池:池外 adhoc 账号不在 `pool.keys` 里,
   * 用 `pool.keyOf(name)` 会拿到空串 → Authorization 空 Bearer → 上游 401。
   */
  key = "";

  /**
   * 该账号的**钉连接**池(对应 Nexus `AccountRuntime._clients`)。
   *
   * ⚠️ **前缀缓存亲和的关键**(2026-10-24 用户定案,m06730② 真根因之一):
   * 上游的前缀缓存按 1024-token 块存放在**推理节点本地**,而请求落到哪个节点
   * 由 TCP 连接决定。用 Node 默认的 `fetch`(undici 全局连接池)时,每账号的
   * 请求会在池里的多条连接间轮转 → 落到不同节点 → 缓存块丢一半。
   *
   * Nexus `sensenova.py` 的解法:每账号一条
   * `httpx.Limits(max_connections=1, max_keepalive_connections=1)` 的 client,
   * 单条 keep-alive 连接顺序请求 → 稳定命中同一个节点。
   *
   * 这里用 `node:https.Agent({ keepAlive: true, maxSockets: 1 })` 达到同样效果
   * (不引入 undici 依赖;`maxSockets: 1` 即「该 agent 下最多一条在途连接」)。
   *
   * 实测(同一前缀 4092 token,间隔 6s 连打):
   * - 裸 fetch: `cached` 在 3072 / 2048 之间抖动(换节点),首字 6s → 29s;
   * - 钉连接: 稳定 3072,首字 0.8s。
   */
  private pinnedAgent: HttpsAgent | null = null;

  /** 取(必要时创建)该账号的钉连接 agent。 */
  pinnedHttpAgent(): HttpsAgent {
    if (this.pinnedAgent === null) {
      this.pinnedAgent = new HttpsAgent({
        keepAlive: true,
        maxSockets: 1, // 单账号单并发:一条连接串行,节点亲和
        maxFreeSockets: 1,
        timeout: 900_000, // 对齐 Nexus read_timeout=900s(长回答)
      });
    }
    return this.pinnedAgent;
  }

  /** 释放钉连接(账号被移除 / 进程收尾时调,避免 socket 泄漏)。 */
  closePinnedAgent(): void {
    if (this.pinnedAgent !== null) {
      this.pinnedAgent.destroy();
      this.pinnedAgent = null;
    }
  }

  /** 记一笔可计费消耗(成功后调用;命中 prompt cache 的不计)。 */
  recordSpend(tokens: number, now: number): void {
    if (!(tokens > 0)) return;
    this.spend.push({ t: now, n: tokens });
    this.lastUsedAt = now;
  }

  /** 窗口内可计费 token 总和。 */
  billableInWindow(now: number): number {
    const cutoff = now - BILLABLE_WINDOW_S * 1000;
    let drop = 0;
    while (drop < this.spend.length && this.spend[drop].t < cutoff) drop += 1;
    if (drop > 0) this.spend.splice(0, drop);
    let sum = 0;
    for (const e of this.spend) sum += e.n;
    return sum;
  }

  recordOutcome(ok: boolean, ttftMs: number, now: number): void {
    this.requests += 1;
    this.lastUsedAt = now;
    if (ok) {
      if (ttftMs > 0) this.lastTtftMs = ttftMs;
    } else {
      this.errors += 1;
    }
  }

  /**
   * 给 (账号, 模型) 这一格降温 —— **取 max 不覆盖**。
   *
   * 同号硬等会反复写这一格(每次 `COOLDOWN_ON_HOLD`);取 max 是为了别让后写
   * 的短值把更长的退避抹短。⚠️ 模型格**纯展示**,不参与选号(用户 m23215:
   * 不同模型可以用同一个账号)。
   */
  coolFor(seconds: number, reason: string, model: string, now: number): void {
    const key = model || "";
    const until = now + seconds * 1000;
    const prev = this.cooldownUntil.get(key) ?? 0;
    if (until > prev) {
      this.cooldownUntil.set(key, until);
      this.cooldownReason.set(key, reason);
    }
  }

  /**
   * 给**整个账号**降温(键 `""`)—— 新会话选号时跳过它(用户 m23215)。
   *
   * 只在「同号等待预算耗尽、这个号确实在限流」时才写:已粘住的会话不受影响
   * (粘性期内不换号),之后的新会话挑空闲号时会跳过它,直到冷却过期。
   */
  coolAccountFor(seconds: number, reason: string, now: number): void {
    this.coolFor(seconds, reason, "", now);
  }

  isCooling(model: string, now: number): boolean {
    return (this.cooldownUntil.get(model || "") ?? 0) > now;
  }

  /**
   * 账号级是否冷却中 —— **新会话选号**的判据。
   *
   * ⚠️ 不看模型:`isCooling(model)` 只作面板展示,选号一律走这一条
   * (用户 m23215:不同模型可以用同一个账号)。
   */
  isAccountCooling(now: number): boolean {
    return this.isCooling("", now);
  }

  coolingRemaining(model: string, now: number): number {
    const until = this.cooldownUntil.get(model || "") ?? 0;
    return until > now ? Math.ceil((until - now) / 1000) : 0;
  }

  snapshot(): Record<string, unknown> {
    const now = Date.now();
    return {
      requests: this.requests,
      errors: this.errors,
      last_ttft_ms: this.lastTtftMs || null,
      last_used_at: this.lastUsedAt || null,
      cooldown_models: [...this.cooldownUntil.entries()]
        .filter(([, until]) => until > now)
        .map(([model, until]) => ({
          model: model || null,
          remaining_s: Math.ceil((until - now) / 1000),
          reason: this.cooldownReason.get(model) ?? null,
        })),
    };
  }
}
/**
 * SenseNova 账号池 —— 整池替换 + 运行态保留 + 按 api_key 反查。
 *
 * 对应 Nexus `AccountPool`。**同名账号加 `#2`/`#3` 后缀**去重(绝不静默
 * 覆盖);已存在账号**保留运行态**(冷却/健康/滚动计数是运行事实,不能因
 * 凭据刷新归零)。
 */
export class SensenovaAccountPool {
  private readonly runtimes = new Map<string, SensenovaAccountRuntime>();
  /** `username → api_key`(凭据投影,`setAccounts` 时重建)。 */
  private readonly keys = new Map<string, string>();

  setAccounts(accounts: SensenovaAccount[]): void {
    const seen = new Set<string>();
    const nextKeys = new Map<string, string>();
    for (const a of accounts) {
      if (!a.api_key) continue;
      let name = a.username || "?";
      while (seen.has(name)) name = `${name}#2`;
      seen.add(name);
      nextKeys.set(name, a.api_key);
      let rt = this.runtimes.get(name);
      if (!rt) {
        rt = new SensenovaAccountRuntime();
        rt.name = name;
        this.runtimes.set(name, rt);
      }
      rt.key = a.api_key; // 凭据刷新:key 跟着换,运行态(冷却/记账)保留
    }
    // 凭据已删除的账号:清掉运行态(否则冷却永远不消失)。
    for (const name of [...this.runtimes.keys()]) {
      if (!seen.has(name)) this.runtimes.delete(name);
    }
    this.keys.clear();
    for (const [k, v] of nextKeys) this.keys.set(k, v);
  }

  get size(): number {
    return this.runtimes.size;
  }

  names(): string[] {
    return [...this.runtimes.keys()];
  }

  runtime(name: string): SensenovaAccountRuntime {
    const rt = this.runtimes.get(name);
    if (!rt) throw new Error(`sensenova 账号池里没有 ${name}`);
    return rt;
  }

  /** 网关注入的 api_key 属池 → 返回账号名(不在池返回 `null`)。 */
  nameByKey(apiKey: string): string | null {
    if (!apiKey) return null;
    for (const [name, key] of this.keys) {
      if (key === apiKey) return name;
    }
    return null;
  }

  /** 账号名 → api_key(**进程内使用;绝不进 snapshot / 日志**)。 */
  keyOf(name: string): string {
    return this.keys.get(name) ?? "";
  }

  /** 账号池快照(**不含明文 key**)—— 面板 / 日志唯一出口。 */
  snapshot(): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [name, rt] of this.runtimes) out[name] = rt.snapshot();
    return out;
  }
}
/** api_key 摘要(sha256 前 12 hex)—— 只做 Map 键,绝不还原。 */
export function sensenovaKeyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}
/** 上游报文摘要(压白 + 截断)—— 冷却原因/日志专用。 */
export function sensenovaSnippet(body: unknown): string {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return text.replace(/\s+/g, " ").slice(0, 160);
}
/**
 * 用**钉连接**(`node:https` + 单 socket agent)POST 一个 JSON,返回标准
 * `Response`(与 fetch 同形,下游 `res.ok / res.status / res.text() /
 * res.body` 全部可用)。
 *
 * 为什么不用全局 fetch:见 `SensenovaAccountRuntime.pinnedHttpAgent` ——
 * undici 连接池轮转会打散上游的前缀缓存亲和。
 *
 * ⚠️ `signal` 必须接:客户端断开时要立刻销毁这条在途连接(否则并发槽位
 * 一直占着,是租约泄漏)。`agent` 的 `maxSockets: 1` 让同一账号的请求串行,
 * 这正好也是上游要求的「单账号单并发」。
 */
export function pinnedPostJson(
  url: string,
  headers: Record<string, string>,
  payload: string,
  agent: HttpsAgent,
  signal?: AbortSignal,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UpstreamError("connection", "客户端断开", false, 499));
      return;
    }
    const req = httpsRequest(
      url,
      {
        method: "POST",
        agent,
        headers: {
          ...headers,
          "Content-Length": String(Buffer.byteLength(payload)),
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        // node:https 的 IncomingMessage 是 Readable —— 直接转 Web ReadableStream,
        // 让下游可以用标准 `for await` / `getReader()` 逐块消费(SSE 场景)。
        const body = Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>;
        const outHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) for (const one of v) outHeaders.append(k, one);
          else if (v !== undefined) outHeaders.set(k, String(v));
        }
        resolve(
          new Response(body, {
            status,
            statusText: res.statusMessage ?? "",
            headers: outHeaders,
          }),
        );
      },
    );
    req.on("error", (err) => {
      const aborted = signal?.aborted === true;
      reject(
        aborted
          ? new UpstreamError("connection", "客户端断开", false, 499)
          : new UpstreamError("connection", `上游连接失败:${err.message}`, true, 502),
      );
    });
    // 客户端断开 → 立刻销毁这条连接(不留给 keep-alive 池)。
    if (signal) {
      const onAbort = (): void => {
        req.destroy(new Error("aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      req.on("close", () => signal.removeEventListener("abort", onAbort));
    }
    req.end(payload);
  });
}
