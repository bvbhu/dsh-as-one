/**
 * WorkBuddy **首用自检**(2026-11-08 用户定案,A4)。
 *
 * ## 解决什么问题
 *
 * 凭据可以「配了就进池」—— 只要 `credential` 表里有一行,调度器就会把它当
 * 可用端点。于是一个**已经失效 / 已经被封**的账号会在第一次真正的对话请求里
 * 才暴露问题,而那次请求已经打到上游、已经带着反代身份、已经计入风控。
 * 调研报告的语气是「看到 11140 立即停手」—— 那么最理想的位置是**它根本没被
 * 打进对话接口**。
 *
 * ## 做法
 *
 * 新账号(或凭据 raw 里没有自检标记的账号)第一次被选中时,先打**一个只读**
 * 计费探针(`/v2/billing/meter/get-user-resource`,与面板额度采集同一条路径),
 * 拿它当「钥匙还灵不灵」的判据:
 * - **ok** ⇒ 记一条标记(`raw.selfcheck`),之后**不再探**(每账号只探一次,
 *   标记带 TTL,过期才重探);
 * - **11140**(账号异常/被限)⇒ **不发送任何对话请求**,直接抛认证类错误 ——
 *   网关的错误出口会认出这条消息并触发**物理删除凭据 + 渠道熔断**
 *   (`workbuddy-breaker.ts`),坏号从此不可能再被选中;
 * - **其它失败**(网络抖动 / 计费接口 500 / 超时)⇒ **放行**(fail-open)。
 *
 * ## 为什么「其它失败」要 fail-open
 *
 * 自检的目的是「拦住坏号」,不是「把计费接口变成单点故障」。计费接口抖一下、
 * 或者本机网络差,不应该让整个对话停摆 —— 那等于用一个新的可用性故障换取
 * 一个尚未证实的账号风险。只有**上游明确说这个账号被限**才拦。
 *
 * ⚠️ 自检同样计入账号节流(`account-throttle.ts`):它也是打上游的请求。
 */

import type { CredentialVault } from "../config/credentials.js";
import type { QuotaAccountInput } from "../collector/quota.js";
import {
  WORKBUDDY_BILLING_BASES,
  WORKBUDDY_RESOURCE_PATH,
  workbuddyQuotaHeaders,
  workbuddy_request_body,
} from "../collector/quota.js";
import { detect_region_from_token } from "./workbuddy.js";

/** 自检标记在凭据 `raw_json` 里的字段名。 */
export const WORKBUDDY_SELFCHECK_FIELD = "selfcheck";

/** 自检标记有效期(毫秒)—— 一天。 */
export const WORKBUDDY_SELFCHECK_TTL_MS = 24 * 3600 * 1000;

/**
 * 自检探针的**连接超时**(毫秒)—— 8 秒。
 *
 * ⚠️ 比额度采集的 30 秒短得多:这是**请求路径上**的同步探针(新账号首个对话请求
 * 之前),计费接口卡住 30 秒等于把用户的首字延迟硬拖 30 秒。自检的语义是
 * 「能快速判断就判断,判断不了就放行」—— 超时按 `unknown` 走 fail-open。
 */
export const WORKBUDDY_SELFCHECK_TIMEOUT_MS = 8_000;

/** 自检结论:可用 / 被限(11140)/ 无法判定。 */
export type SelfCheckVerdict = "ok" | "banned" | "unknown";

export interface SelfCheckMarker {
  verdict: SelfCheckVerdict;
  /** 结论时刻(epoch 毫秒)。 */
  atMs: number;
  /** 判成 banned 时的上游原文摘要(留证,面板/日志可读)。 */
  message?: string;
}

/** 从凭据 raw 里读自检标记(坏值按「没有」处理)。 */
export function readSelfCheck(raw: Record<string, unknown> | null | undefined): SelfCheckMarker | null {
  const value = raw?.[WORKBUDDY_SELFCHECK_FIELD];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const verdict = rec["verdict"];
  if (verdict !== "ok" && verdict !== "banned" && verdict !== "unknown") return null;
  const atMs = typeof rec["atMs"] === "number" && Number.isFinite(rec["atMs"]) ? rec["atMs"] : 0;
  const message = typeof rec["message"] === "string" ? rec["message"] : undefined;
  return message !== undefined ? { verdict, atMs, message } : { verdict, atMs };
}

/**
 * 这个账号现在要不要自检。
 *
 * - 没有标记 ⇒ 要(新账号);
 * - `banned` ⇒ **不要**再探(账号已被限,自重只会再吃一次风控;真正的处置是
 *   熔断/删凭据,不该靠反复探测来「确认」);
 * - `ok` / `unknown` 且未过期 ⇒ 不要;过期 ⇒ 要。
 */
export function selfCheckDue(
  raw: Record<string, unknown> | null | undefined,
  nowMs: number,
  ttlMs: number = WORKBUDDY_SELFCHECK_TTL_MS,
): boolean {
  const marker = readSelfCheck(raw);
  if (marker === null) return true;
  if (marker.verdict === "banned") return false;
  const age = nowMs - marker.atMs;
  return !(age >= 0 && age < ttlMs);
}

/** 把自检结论合并进凭据 raw(纯函数,返回**新对象**,不改入参)。 */
export function withSelfCheck(
  raw: Record<string, unknown> | null | undefined,
  marker: SelfCheckMarker,
): Record<string, unknown> {
  return { ...(raw ?? {}), [WORKBUDDY_SELFCHECK_FIELD]: marker };
}

/** 探针输入(网关侧只需要这些;`credentialKey` / `provider` 由调用方补齐)。 */
export interface WorkbuddyProbeCreds {
  /** 明文令牌(`Authorization: Bearer <token>`)。 */
  token: string;
  /** 区域(cn / global);缺省按 JWT `iss` 推断。 */
  region?: string;
  /** 桌面端身份头要的 uid;缺省按 JWT `sub` 推断(计费探针同口径)。 */
  uid?: string;
  /** 企业号标识;缺省不发。 */
  enterpriseId?: string;
}

export interface WorkbuddyProbeOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * 只读探测一次:计费额度接口(不消耗额度、不改状态、不签到)。
 *
 * 结论三态:
 * - `ok`:HTTP 2xx 且业务 code 正常;
 * - `banned`:上游回了业务码 **11140**(账号存在异常行为,已被限制使用)——
 *   无论是 HTTP 4xx 还是「HTTP 200 + code=11140」都一样判;
 * - `unknown`:其它一切失败(网络 / 超时 / 5xx / 解析失败)—— **不构成封号证据**。
 *
 * ⚠️ 为什么不复用 `probe_workbuddy_quota`:
 * 那条路是**额度采集**用的 —— 它把「HTTP 200 + 业务 code 非 0」按「0 额度」
 * 记账(面板要显示得出来),而自检必须把 `code=11140` 认成**封号**。
 * 两者的判据不同,硬塞进同一个函数会让额度采集的行为被迫改变。
 */
export async function probeWorkbuddyAccount(
  creds: WorkbuddyProbeCreds,
  options: WorkbuddyProbeOptions = {},
): Promise<{ verdict: SelfCheckVerdict; message: string }> {
  const token = (creds.token ?? "").trim();
  if (token === "") return { verdict: "unknown", message: "缺少令牌,无法自检" };
  const region = (creds.region ?? "").trim() || detect_region_from_token(token);
  const realm = region === "cn" ? "cn" : "global";
  const base = (WORKBUDDY_BILLING_BASES[realm] ?? "").replace(/\/+$/, "");
  const account: QuotaAccountInput = {
    credentialKey: `workbuddy/selfcheck`,
    provider: "workbuddy",
    username: "selfcheck",
    token,
    region: realm,
    uid: creds.uid ?? null,
    enterprise_id: creds.enterpriseId ?? null,
  };
  const timeoutMs = options.timeoutMs ?? WORKBUDDY_SELFCHECK_TIMEOUT_MS;
  const fetchFn = options.fetchFn ?? fetch;

  let resp: Response;
  try {
    resp = await fetchFn(`${base}${WORKBUDDY_RESOURCE_PATH}`, {
      method: "POST",
      headers: workbuddyQuotaHeaders(account, realm),
      body: JSON.stringify(workbuddy_request_body()),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { verdict: "unknown", message: `自检请求失败: ${errText(err)}` };
  }
  let text: string;
  try {
    text = await resp.text();
  } catch (err) {
    return { verdict: "unknown", message: `自检响应读取失败: ${errText(err)}` };
  }
  const body = parseJsonObject(text);
  const code = businessCodeOf(body);
  // 业务码优先;body 不是 JSON(网关页/HTML 错误页)时退回文本兜底判据。
  if (code === BAN_CODE || (code === null && isBanText(text))) {
    return { verdict: "banned", message: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
  }
  if (resp.status >= 400) {
    // 非 11140 的 4xx/5xx:可能是区域不对、接口改版,也可能是临时风控 ——
    // 都不构成「这个账号被封」的结论,放行。
    return { verdict: "unknown", message: `自检 HTTP ${resp.status}: ${text.slice(0, 300)}` };
  }
  if (body === null) {
    return { verdict: "unknown", message: `自检响应不是 JSON 对象: ${text.slice(0, 120)}` };
  }
  if (code !== null && code !== 0) {
    return { verdict: "unknown", message: `自检业务码 ${code}: ${text.slice(0, 300)}` };
  }
  return { verdict: "ok", message: "自检通过(只读额度探针可用)" };
}

/** 业务码 11140(账号异常 / 被限制使用)。 */
export const BAN_CODE = 11140;

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 上游业务码(`body.code`)。
 *
 * ⚠️ workbuddy 的 `code` 既可能是 number 也可能是**数字字符串**,两种都认;
 * 其它形状(null / 布尔 / 对象)一律当「读不到」,不猜。
 */
export function businessCodeOf(body: Record<string, unknown> | null): number | null {
  const raw = body?.["code"];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw.trim());
  return null;
}

/**
 * 文本里有没有业务码 11140。
 *
 * ⚠️ 兜底判据:某些路径的错误信息里只剩上游原文
 * (`... HTTP 400: {"code":11140,...}`)。用边界而不是裸 `includes`:
 * 111401 / 1114000 这类码不该被误判成封号。
 */
export function isBanText(text: string): boolean {
  return /(?<!\d)11140(?!\d)/.test(text);
}

/** 网关注入用:一次自检的结论。 */
export interface SelfCheckResult {
  /** `true` = 可以继续发对话请求;`false` = **必须拦下**(只剩 banned 这一种)。 */
  ok: boolean;
  /** `true` 时 `message` 里带 `code 11140`(网关错误出口据此触发熔断)。 */
  banned: boolean;
  message: string;
}

export interface WorkbuddySelfCheckDeps {
  vault: CredentialVault;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** 墙钟(测试注入)。 */
  now?: () => number;
  ttlMs?: number;
  /** 告警出口(缺省 console.warn)。 */
  warn?: (message: string) => void;
}

/**
 * 造一个「首用自检」回调给网关注入(`UpstreamRuntime.workbuddySelfCheck`)。
 *
 * 输入是网关侧已解析好的凭据;返回 `{ok:false}` 时网关**不会**发出对话请求。
 * 标记写回凭据 raw(`vault.put`,只改 raw) —— 所以每个账号**只探一次**,
 * 进程重启也不会重探(除非标记过期)。
 */
export function createWorkbuddySelfCheck(
  deps: WorkbuddySelfCheckDeps,
): (input: { username: string; creds: WorkbuddyProbeCreds }) => Promise<SelfCheckResult> {
  const now = deps.now ?? (() => Date.now());
  const ttlMs = deps.ttlMs ?? WORKBUDDY_SELFCHECK_TTL_MS;
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  /**
   * 进程内自检结论缓存(键 = 账号名)。
   *
   * ⚠️ 为什么持久化标记还不够:凭据后端可能是**只读**的(阶段二的宿主管理后端),
   * 那时 `vault.put` 抛错 → 标记永远写不进去 → 每个请求都再打一次探针,
   * 等于给上游**翻倍**请求量。这份缓存保证「同一进程里每个账号最多探一次」,
   * 持久化标记只负责跨重启。
   */
  const memo = new Map<string, SelfCheckMarker>();

  return async (input): Promise<SelfCheckResult> => {
    const username = (input.username ?? "").trim();
    // 没有账号名 / 没有令牌:不是「新账号首次使用」,而是凭据形状不对 —— 交给
    // 原有的鉴权路径去报错,自检不越权判定。
    if (username === "" || (input.creds?.token ?? "").trim() === "") {
      return { ok: true, banned: false, message: "跳过自检(凭据不完整)" };
    }
    let raw: Record<string, unknown> = {};
    try {
      const existing = await deps.vault.get("workbuddy", username);
      raw = (existing?.raw ?? {}) as Record<string, unknown>;
    } catch {
      // 读不到凭据 raw 不该阻断请求:自检退化成「每次都探」也不影响正确性。
    }
    // 持久化标记与进程内缓存取**较新**的那一条。
    const stored = readSelfCheck(raw);
    const memory = memo.get(username) ?? null;
    const latest =
      memory === null ? stored : stored === null ? memory : memory.atMs >= stored.atMs ? memory : stored;
    if (latest !== null && !selfCheckDue({ [WORKBUDDY_SELFCHECK_FIELD]: latest }, now(), ttlMs)) {
      return {
        ok: true,
        banned: false,
        message: latest.verdict === "banned" ? "该账号曾命中 11140(不再自检)" : "已有自检标记,跳过",
      };
    }

    const probe = await probeWorkbuddyAccount(input.creds, {
      ...(deps.fetchFn !== undefined ? { fetchFn: deps.fetchFn } : {}),
      ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
    });
    const marker: SelfCheckMarker = { verdict: probe.verdict, atMs: now() };
    if (probe.verdict === "banned") marker.message = probe.message.slice(0, 300);
    memo.set(username, marker);
    try {
      await deps.vault.put({
        provider: "workbuddy",
        username,
        raw: withSelfCheck(raw, marker),
      });
    } catch (err) {
      // 标记写不进去只影响「下次还要再探一次」,不影响本次判定。
      warn(
        `[as-one] WorkBuddy 自检标记写入失败(${username}):` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (probe.verdict === "banned") {
      warn(`[as-one] WorkBuddy 自检命中 11140(${username}):${probe.message}`);
      return {
        ok: false,
        banned: true,
        // 文案与本项目 11140 的统一口径一致(网关/熔断器按 `code 11140` 识别)。
        message: `账号存在异常行为,已被限制使用(code 11140):${probe.message}`,
      };
    }
    if (probe.verdict === "unknown") {
      // fail-open:只有上游明说「账号被限」才拦,其它失败不改变可用性。
      warn(`[as-one] WorkBuddy 自检无法判定(${username}),放行:${probe.message}`);
      return { ok: true, banned: false, message: probe.message };
    }
    return { ok: true, banned: false, message: probe.message };
  };
}
