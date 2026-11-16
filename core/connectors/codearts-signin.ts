/**
 * 华为云 CodeArts（码道）**网页 / 控制台族（A 族）签到 + 积分**网络层。
 *
 * 上游事实来源：`xu20060420fan-cell/workbuddy2api-trae-qoder-minimax-panel` 的
 * `internal/codearts/api.go`（2026-11 实测）。本文件只负责「发请求 + 解包 + 错误
 * 分类 + 领取时序」，不碰 DB、不碰调度、不碰 Cookie 的获取方式（用户自备网页 Cookie）。
 *
 * ## 鉴权（A 族）
 * - base：`https://devcloud.cn-north-4.huaweicloud.com`
 * - 凭据是**网页 Cookie**（必须含 `devclouddevuibjtcftk`），并额外发请求头 `cftk`，
 *   其值取该 cookie；没有再取同名 `cftk` cookie。
 * - 缺 cftk 时上游回 `invalid channel, group not found` —— 这是**可读的错误提示**，
 *   不是「活动不存在」，所以本地先拦下并给出明确的文案。
 *
 * ## 四个端点
 * - `GET  /chat/snap-manager/v1/package/overview`                积分总览（兼探活）
 * - `GET  /chat/PromptCenterService/v1/ops/delivery?channel=WEB` 活动列表
 * - `POST /chat/PromptCenterService/v1/ops/claim`                领取
 * - `POST /chat/PromptCenterService/v1/ops/confirm`              领取确认（**漏了积分不入账**）
 *
 * ## 幂等 / confirm 口径（踩过的坑，不要「顺手简化」）
 * 1. `campaignId` 是**数字**且**每次从响应里取**：上游 2026-11 把它从 `1` 换成 `34`、
 *    面额从 1000 换成 100 —— 写死 id 的实现在那天全部失效。
 * 2. 签到活动判据是 `type === "USER_LOGIN"`；标题含「签到」只作兜底（活动改标题时
 *    仍能签上，同时又不会把学生认证 / 邀请类活动当成签到去自动领）。
 * 3. 可领金额字段是 **`benefitAmount`**；不可领时 `status` 为 **`null`**（不是空串）。
 * 4. **claim 之后必须 confirm**：claim 只提交，confirm 才入账。claim 成功但 confirm
 *    失败一律按**失败**返回（`ok:false`），否则会变成「界面成功、积分未到账」。
 *    `status === "CLAIMED"` = 已领未确认 → **跳过 claim 只补 confirm**。
 * 5. 幂等键 `codearts-daily-<label>-<campaignId>-<yyyyMMdd>`，按**本地日期**固定；
 *    同一天重复调用不会重复发放，跨天自然换键。
 * 6. 会话失效特征：**HTTP 200 + 空 body**，或 401/403；**超时不算失效**（单独报网络错误）。
 *
 * 错误一律复用签到模块的 {@link CheckinError}（不新建错误体系），message 里保留
 * 「网络」「超时」「会话失效」「上游错误 <code>」等可区分口径，**绝不把失败包装成成功**。
 */

import { createHash } from "node:crypto";

import { CheckinError } from "./checkin.js";

// ---------------------------------------------------------------------------
// 常量（全部来自上游实测）
// ---------------------------------------------------------------------------

/** 网页族上游 base（自建代理时可用账号的 `baseUrl` 覆盖）。 */
export const CODEARTS_WEB_BASE = "https://devcloud.cn-north-4.huaweicloud.com";

export const CODEARTS_OVERVIEW_PATH = "/chat/snap-manager/v1/package/overview";
export const CODEARTS_DELIVERY_PATH = "/chat/PromptCenterService/v1/ops/delivery?channel=WEB";
export const CODEARTS_CLAIM_PATH = "/chat/PromptCenterService/v1/ops/claim";
export const CODEARTS_CONFIRM_PATH = "/chat/PromptCenterService/v1/ops/confirm";

/** 会话 cookie：A 族鉴权的真正凭据。 */
export const CODEARTS_CFTK_COOKIE = "devclouddevuibjtcftk";
/** 部分环境只叫 `cftk`，作为回落（上游自己也这么取）。 */
export const CODEARTS_CFTK_FALLBACK_COOKIE = "cftk";

export const CODEARTS_TIMEOUT_MS = 30_000;

/** 签到活动的 `type`；`type` 不是它的活动（学生认证 / 邀请）永远不自动领。 */
export const CODEARTS_CHECKIN_TYPE = "USER_LOGIN";

/**
 * claim 的并发冲突业务码：`40001` / `40002`（多人同时点、或同一天重复提交）。
 *
 * 上游文案本身就可以判断「稍后重试」，这里不额外篡改 —— 只把码列出来，
 * 让装配层做「可重试」判定时不必猜。
 */
export const CODEARTS_CLAIM_CONFLICT_CODES = [40001, 40002] as const;

/** Chrome 桌面 UA（少它上游可能按非浏览器会话处理）。 */
export const CODEARTS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/141.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// 账号 / 请求头
// ---------------------------------------------------------------------------

export interface CodeartsCookieAccount {
  /** 全量 Cookie 串，形如 "a=1; b=2"（必须含 devclouddevuibjtcftk）。 */
  cookies: string;
  /** 可选：账号标识（用于幂等键与日志），缺省取 cookies 的 sha256 前 12 位。 */
  label?: string;
  /** 可选：上游 base 覆盖（自建代理时用）。 */
  baseUrl?: string;
}

function codeartsBase(account: CodeartsCookieAccount): string {
  const base = (account.baseUrl ?? CODEARTS_WEB_BASE).trim().replace(/\/+$/, "");
  return base === "" ? CODEARTS_WEB_BASE : base;
}

/** Cookie 串里取某个 cookie 的值；没有返回 undefined（名字大小写敏感，与浏览器一致）。 */
export function cookieValue(cookies: string, name: string): string | undefined {
  if (!cookies || !name) return undefined;
  for (const part of cookies.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * 公共请求头（含 cftk 提取）。导出给测试与网关复用。
 *
 * 缺 Cookie / 缺 cftk 时**本地**抛 {@link CheckinError}：上游对此只会回
 * `invalid channel, group not found`，那句文案会被误读成「渠道没配好」，
 * 而真正要做的是「重新登录 CodeArts 网页版、把 Cookie 补上」。
 */
export function codeartsWebHeaders(account: CodeartsCookieAccount): Record<string, string> {
  const cookies = (account.cookies ?? "").trim();
  if (cookies === "") {
    throw new CheckinError(
      `codearts 账号没有网页 Cookie:必须包含 cookie "${CODEARTS_CFTK_COOKIE}"(登录 devcloud 控制台后取)`,
    );
  }
  const cftk = (
    cookieValue(cookies, CODEARTS_CFTK_COOKIE) ??
    cookieValue(cookies, CODEARTS_CFTK_FALLBACK_COOKIE) ??
    ""
  ).trim();
  if (cftk === "") {
    throw new CheckinError(
      `codearts Cookie 里没有 cftk(缺 "${CODEARTS_CFTK_COOKIE}" 与 "${CODEARTS_CFTK_FALLBACK_COOKIE}"):` +
        `上游会回 "invalid channel, group not found"`,
    );
  }
  return {
    Cookie: cookies,
    "User-Agent": CODEARTS_USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Referer: `${codeartsBase(account)}/chat/home`,
    language: "zh-cn",
    "x-codearts-doer-scenario-type": "web",
    "x-requested-with": "XMLHttpRequest",
    "Agent-Type": "PromptCenter",
    cftk,
  };
}

/** 幂等键里的账号标识：显式 label 优先，否则 cookies 的 sha256 前 12 位（稳定、不泄漏 cookie）。 */
export function codeartsAccountLabel(account: CodeartsCookieAccount): string {
  const explicit = (account.label ?? "").trim();
  if (explicit !== "") return explicit;
  return createHash("sha256").update(account.cookies ?? "", "utf8").digest("hex").slice(0, 12);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 幂等键里的日期戳 `yyyyMMdd`。
 *
 * 必须是**本地时区**：用户看到的「今天」是本地今天，用 UTC 会让东八区在 00:00~08:00
 * 之间把明天/昨天的键发出去，导致「今天签不上」或「一天领两次」。
 */
export function codeartsDayStamp(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** 幂等键：同一天同一活动同一账号**恒定**，重复调用不重复发放。 */
export function codeartsIdempotentKey(
  account: CodeartsCookieAccount,
  campaignId: number,
  day: string = codeartsDayStamp(),
): string {
  return `codearts-daily-${codeartsAccountLabel(account)}-${campaignId}-${day}`;
}

// ---------------------------------------------------------------------------
// HTTP 选项与传输层
// ---------------------------------------------------------------------------

export interface CodeartsHttpOptions {
  /** 注入 fetch（测试替身）；缺省 globalThis.fetch。 */
  fetchFn?: typeof fetch;
  /** 超时毫秒；缺省 30_000。 */
  timeoutMs?: number;
  /** 注入时钟（幂等键 / 日期）；缺省 Date.now。 */
  now?: () => number;
}

interface CodeartsRaw {
  status: number;
  text: string;
}

/**
 * 发一次请求并把 body 读成文本。
 *
 * 错误分类在此**一次做完**，上层只管解包：
 * - 超时 → 「请求超时」（TimeoutError 单独识别，**绝不**判成会话失效）；
 * - fetch 拒绝 → 「网络请求失败」；
 * - 401/403 → 「会话失效」；
 * - 其它非 2xx → 原样带 HTTP 状态（装配层的瞬时重试按 "http 5xx" 命中）；
 * - 2xx + 空 body → 「会话失效」（上游掉会话时就是 200 + 空，这是唯一信号）。
 */
async function codeartsRawRequest(
  account: CodeartsCookieAccount,
  path: string,
  label: string,
  opts: CodeartsHttpOptions,
  method: "GET" | "POST",
  body?: string,
): Promise<CodeartsRaw> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? CODEARTS_TIMEOUT_MS;
  const url = `${codeartsBase(account)}${path}`;
  const headers = codeartsWebHeaders(account);

  let resp: Response;
  try {
    resp = await fetchFn(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new CheckinError(`codearts ${label} 请求超时(${timeoutMs}ms)`);
    }
    throw new CheckinError(
      `codearts ${label} 网络请求失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let text: string;
  try {
    text = await resp.text();
  } catch (err) {
    throw new CheckinError(
      `codearts ${label} 读取应答失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new CheckinError(
      `codearts ${label} 会话失效(HTTP ${resp.status}):网页 Cookie 已过期或 cftk 失效,请重新登录取 Cookie`,
    );
  }
  // 非 2xx 的 5xx 先按 HTTP 错误报：空 body 的 500 不是「会话失效」。
  if (resp.status < 200 || resp.status >= 300) {
    throw new CheckinError(
      `codearts ${label} 返回 HTTP ${resp.status}: ${text.trim().slice(0, 200)}`,
    );
  }
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new CheckinError(
      `codearts ${label} 会话失效(HTTP ${resp.status} + 空 body):上游会话已掉,请重新登录取 Cookie`,
    );
  }
  return { status: resp.status, text: trimmed };
}

/** 发请求 + 解成 JSON 对象（非 JSON / 非对象都按 CheckinError 报）。 */
async function codeartsJson(
  account: CodeartsCookieAccount,
  path: string,
  label: string,
  opts: CodeartsHttpOptions,
  method: "GET" | "POST" = "GET",
  body?: string,
): Promise<Record<string, unknown>> {
  const raw = await codeartsRawRequest(account, path, label, opts, method, body);
  if (!raw.text.startsWith("{")) {
    throw new CheckinError(
      `codearts ${label} 返回非 JSON(HTTP ${raw.status}): ${raw.text.slice(0, 200)}`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw.text);
  } catch {
    throw new CheckinError(`codearts ${label} 返回非法 JSON: ${raw.text.slice(0, 200)}`);
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new CheckinError(`codearts ${label} 返回非对象(HTTP ${raw.status})`);
  }
  return payload as Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * 业务码解析：**失败关闭**。
 *
 * 缺失 / 非数字一律 `-1`（= 失败），绝不因为「解析不出来」就当成 0。
 * 上游 claim + confirm 用 `code == 0` 表示成功，别的一律是拒绝。
 */
function ackCode(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return -1;
}

function ackMessage(payload: Record<string, unknown>): string {
  const m = payload["message"];
  if (typeof m === "string" && m.trim() !== "") return m;
  const msg = payload["msg"];
  return typeof msg === "string" ? msg : "";
}

/** 活动列表 / 总览都带 `{code,message,...}` 信封；code 非 0 时抛「上游错误 <code>」。 */
function envelopeError(payload: Record<string, unknown>, label: string): string | null {
  if (!("code" in payload) || payload["code"] === null || payload["code"] === undefined) return null;
  const code = ackCode(payload["code"]);
  if (code === 0) return null;
  const message = ackMessage(payload);
  return `codearts ${label} 上游错误 ${code}: ${message || "(上游未给 message)"}`;
}

function dataOf(payload: Record<string, unknown>): Record<string, unknown> | null {
  const data = payload["data"];
  return isRecord(data) ? data : null;
}

// ---------------------------------------------------------------------------
// 积分总览（探活）
// ---------------------------------------------------------------------------

export interface CodeartsCredits {
  remain: number;
  used: number;
  total: number;
  expiring: number;
}

/** 取 `all_credit_package` 节点（顶层直接给，或包在 `data` 里 —— 两种都见过）。 */
function creditPackageNode(payload: Record<string, unknown>): Record<string, unknown> | null {
  const top = payload["all_credit_package"];
  if (isRecord(top)) return top;
  const inner = dataOf(payload)?.["all_credit_package"];
  return isRecord(inner) ? inner : null;
}

/** 积分总览解包（导出给测试；缺 `all_credit_package` 直接报错，不返回全 0）。 */
export function parseCodeartsCredits(payload: Record<string, unknown>): CodeartsCredits {
  const node = creditPackageNode(payload);
  if (node === null) {
    throw new CheckinError("codearts 积分总览缺少 all_credit_package 字段(上游应答形态变了)");
  }
  return {
    remain: toNumber(node["package_credit_remain"]),
    used: toNumber(node["package_credit_used"]),
    total: toNumber(node["package_credit_amount"]),
    expiring: toNumber(node["expiring_credit_amount"]),
  };
}

/** 积分总览（探活）。会话失效（200+空 body / 401 / 403）抛 CheckinError。 */
export async function codeartsCredits(
  account: CodeartsCookieAccount,
  opts: CodeartsHttpOptions = {},
): Promise<CodeartsCredits> {
  const payload = await codeartsJson(account, CODEARTS_OVERVIEW_PATH, "积分总览", opts);
  const error = envelopeError(payload, "积分总览");
  if (error !== null) throw new CheckinError(error);
  return parseCodeartsCredits(payload);
}

// ---------------------------------------------------------------------------
// 活动列表
// ---------------------------------------------------------------------------

export interface CodeartsCampaign {
  campaignId: number;
  title: string;
  type: string;
  benefitAmount: number;
  claimable: boolean;
  /** 不可领时为 `null`（上游就是这么给的，不是空串）。 */
  status: string | null;
  /**
   * 活动开始时刻（epoch 秒）；上游 `extra.startTime` 的 ISO 串转来，读不到为 null。
   *
   * 用途：到期估算的时间基准（见 {@link CodeartsCampaign.endAt}）。
   */
  startAt: number | null;
  /**
   * 活动结束时刻（epoch 秒）= **这批积分的有效期终点**；读不到为 null。
   *
   * ⚠️ 2026-11-16：`/snap-manager/v1/package/overview` 只给
   * `expiring_credit_amount`（数量），**没有绝对到期时间**。想要 due-first 能按
   * 到期排序，只能用这里 —— 且必须在 UI/日志里标明是「按活动期估算」，不能当成
   * 上游权威值。
   */
  endAt: number | null;
}

/**
 * 活动列表解包。
 *
 * `campaignId` 逐条转成**数字**：字符串形态也接受（上游偶尔给 "34"），
 * 转不出来就**跳过**该条 —— 没有 id 的条目根本无法领取，留着只会误导用户。
 */
export function parseCodeartsCampaigns(payload: Record<string, unknown>): CodeartsCampaign[] {
  const data = dataOf(payload);
  const rawItems = data?.["items"] ?? payload["items"];
  if (!Array.isArray(rawItems)) {
    throw new CheckinError("codearts 活动列表缺少 data.items(上游应答形态变了)");
  }
  const out: CodeartsCampaign[] = [];
  for (const item of rawItems) {
    if (!isRecord(item)) continue;
    const campaignId = toNumber(item["campaignId"]);
    // campaignId 是领取的唯一输入，缺失/非法就丢弃（绝不写死兜底 id）。
    if (!(campaignId > 0)) continue;
    // `extra.endTime` 是**积分有效期**的唯一权威来源（2026-11-16 实测：
    // 签到活动 `"endTime":"2026-12-31T15:59:59Z"`）。积分总览接口只给
    // `expiring_credit_amount`（即将过期的**数量**），没有绝对时间 —— 到期估算
    // 必须靠这里。解析不出来一律 null，不臆造。
    const extra = isRecord(item["extra"]) ? item["extra"] : null;
    out.push({
      campaignId,
      title: typeof item["title"] === "string" ? item["title"] : "",
      type: typeof item["type"] === "string" ? item["type"] : "",
      benefitAmount: toNumber(item["benefitAmount"]),
      claimable: item["claimable"] === true,
      status: typeof item["status"] === "string" ? item["status"] : null,
      startAt: isoSecondsOf(extra?.["startTime"]),
      endAt: isoSecondsOf(extra?.["endTime"]),
    });
  }
  return out;
}

/** ISO 8601 串 → epoch 秒；解析不出来返回 null（绝不拿当前时间顶上）。 */
function isoSecondsOf(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** 活动列表。 */
export async function codeartsCampaigns(
  account: CodeartsCookieAccount,
  opts: CodeartsHttpOptions = {},
): Promise<CodeartsCampaign[]> {
  const payload = await codeartsJson(account, CODEARTS_DELIVERY_PATH, "活动列表", opts);
  const error = envelopeError(payload, "活动列表");
  if (error !== null) throw new CheckinError(error);
  return parseCodeartsCampaigns(payload);
}

/** 同一批里优先挑「可领」的那条（已领的留作补 confirm 用，但别挡住可领的）。 */
function preferClaimable(list: CodeartsCampaign[]): CodeartsCampaign {
  return list.find((c) => c.claimable) ?? list[0];
}

/**
 * 今日签到活动。
 *
 * 判据顺序（**先类型、后标题**）：
 * 1. `type === "USER_LOGIN"`（大小写不敏感）：这是权威判据；
 * 2. 兜底：标题含「签到」（上游改 title、或 type 字段临时变更时仍能签上）；
 * 3. 都没有 → undefined。学生认证 / 邀请类活动（type 不是 USER_LOGIN、标题也不含
 *    「签到」）**永远不自动领**。
 */
export function pickCheckinCampaign(list: CodeartsCampaign[]): CodeartsCampaign | undefined {
  const byType = list.filter((c) => c.type.trim().toUpperCase() === CODEARTS_CHECKIN_TYPE);
  if (byType.length > 0) return preferClaimable(byType);
  const byTitle = list.filter((c) => c.title.includes("签到"));
  if (byTitle.length > 0) return preferClaimable(byTitle);
  return undefined;
}

// ---------------------------------------------------------------------------
// 领取 + 确认
// ---------------------------------------------------------------------------

export interface CodeartsClaimResult {
  ok: boolean;
  /** 上游业务码；`-1` = 本地短路（没发请求）或上游应答无 code。 */
  code: number;
  message: string;
  /** 是否成功 confirm（**只有 true 才代表积分真的入账**）。 */
  confirmed: boolean;
}

interface CodeartsAck {
  code: number;
  message: string;
}

async function postAck(
  account: CodeartsCookieAccount,
  path: string,
  label: string,
  opts: CodeartsHttpOptions,
  body: string,
): Promise<CodeartsAck> {
  const payload = await codeartsJson(account, path, label, opts, "POST", body);
  return { code: ackCode(payload["code"]), message: ackMessage(payload) };
}

/**
 * claim 成功后的**补确认**：这是积分入账的那一步。
 *
 * 这里把 confirm 的失败（业务码非 0 / 网络 / 超时 / 会话失效）**全部收敛成
 * `ok:false` 结果**而不是抛异常：调用方必须知道「claim 已提交、但没入账」，
 * 才不会再点一次 claim 或误报成功。
 */
async function confirmClaim(
  account: CodeartsCookieAccount,
  campaign: CodeartsCampaign,
  opts: CodeartsHttpOptions,
  claimMessage: string,
): Promise<CodeartsClaimResult> {
  const body = JSON.stringify({ campaignId: campaign.campaignId });
  let ack: CodeartsAck;
  try {
    ack = await postAck(account, CODEARTS_CONFIRM_PATH, "领取确认", opts, body);
  } catch (err) {
    if (err instanceof CheckinError) {
      return {
        ok: false,
        code: -1,
        message: `claim 成功但 confirm 失败(${err.message}) —— 积分未入账`,
        confirmed: false,
      };
    }
    throw err;
  }
  if (ack.code !== 0) {
    return {
      ok: false,
      code: ack.code,
      message:
        `claim 成功但 confirm 被拒(code ${ack.code})${ack.message ? `:${ack.message}` : ""} —— 积分未入账`,
      confirmed: false,
    };
  }
  return {
    ok: true,
    code: 0,
    message: claimMessage !== "" ? claimMessage : "领取成功(已确认入账)",
    confirmed: true,
  };
}

/**
 * 领一次：claim → 失败不 confirm → 成功再 confirm（幂等键按天）。
 *
 * - `status === "CLAIMED"`：已领未确认 → **跳过 claim，只补 confirm**；
 * - `claimable === false` 且非 CLAIMED：本地短路，零写请求；
 * - `confirm: false`：干跑，零写请求（返回 `ok:false`，别当成功用）；
 * - claim 业务码非 0：`message` **原样带出**上游文案（`40001` / `40002` 类并发冲突
 *   上层可据此判「可重试」，不要改写它）；
 * - 传输层失败（网络 / 超时 / 会话失效 / 非 JSON / HTTP 错误）：抛 {@link CheckinError}。
 */
export async function codeartsClaimCheckin(
  account: CodeartsCookieAccount,
  campaign: CodeartsCampaign,
  opts: CodeartsHttpOptions & { confirm?: boolean; day?: string } = {},
): Promise<CodeartsClaimResult> {
  const confirm = opts.confirm !== false;

  // 已领未确认：claim 再来一次会撞「已领取」，只有 confirm 能把积分落账。
  if (campaign.status === "CLAIMED") {
    if (!confirm) {
      return {
        ok: false,
        code: -1,
        message: "干跑(confirm=false):该活动已领取(CLAIMED)但未确认,未发送补确认请求",
        confirmed: false,
      };
    }
    return confirmClaim(account, campaign, opts, "该活动此前已领取,本次补确认成功");
  }

  if (!campaign.claimable) {
    return {
      ok: false,
      code: -1,
      message: `活动当前不可领取(status=${campaign.status ?? "null"}),未发领取请求`,
      confirmed: false,
    };
  }

  if (!confirm) {
    return {
      ok: false,
      code: -1,
      message: "干跑(confirm=false):未发送 claim / confirm 写请求",
      confirmed: false,
    };
  }

  const key = codeartsIdempotentKey(
    account,
    campaign.campaignId,
    opts.day ?? codeartsDayStamp((opts.now ?? Date.now)()),
  );
  const claimBody = JSON.stringify({
    campaignId: campaign.campaignId,
    channel: "WEB",
    idempotentKey: key,
  });
  const ack = await postAck(account, CODEARTS_CLAIM_PATH, "领取", opts, claimBody);
  if (ack.code !== 0) {
    // 上游文案原样带出：`40001` / `40002` 这类并发冲突要能被上层识别成「可重试」。
    return {
      ok: false,
      code: ack.code,
      message: ack.message !== "" ? ack.message : `上游拒绝领取(code ${ack.code})`,
      confirmed: false,
    };
  }
  return confirmClaim(account, campaign, opts, ack.message);
}

// ---------------------------------------------------------------------------
// 单账号一键
// ---------------------------------------------------------------------------

/**
 * 单账号一键：查总览（探活）→ 查活动 → 挑签到活动 → claim+confirm。
 *
 * `credits` 是**领取前**的总览快照（不再二次查询：签到成功后积分到账需要上游
 * 一段时间异步入账，立刻重查反而会显示旧值）。
 * `dryRun` 只查不发写请求：只发 overview + delivery 两个 GET。
 */
export async function codeartsCheckinOne(
  account: CodeartsCookieAccount,
  opts: CodeartsHttpOptions & { confirm?: boolean; dryRun?: boolean } = {},
): Promise<{
  signed: boolean;
  claimed: boolean;
  credits?: CodeartsCredits;
  campaign?: CodeartsCampaign;
  message: string;
}> {
  const credits = await codeartsCredits(account, opts);
  const list = await codeartsCampaigns(account, opts);
  const campaign = pickCheckinCampaign(list);
  if (campaign === undefined) {
    return {
      signed: false,
      claimed: false,
      credits,
      message: '未找到今日签到活动(需要一条 type="USER_LOGIN" 的活动)',
    };
  }

  // 已领未确认（CLAIMED）：今天算「已签」，但积分可能还没入账 → 补 confirm。
  if (campaign.status === "CLAIMED") {
    if (opts.dryRun === true) {
      return {
        signed: true,
        claimed: false,
        credits,
        campaign,
        message: "今日已领取(CLAIMED)但尚未确认;dryRun 未发送补确认请求",
      };
    }
    const repair = await codeartsClaimCheckin(account, campaign, opts);
    return {
      signed: true,
      claimed: false,
      credits,
      campaign,
      message: repair.confirmed
        ? "今日已签到;补 confirm 成功,积分应已入账"
        : `今日已签到,但补 confirm 失败:${repair.message}`,
    };
  }

  // claimable === false 且不是 CLAIMED：今天已经签过 / 活动尚未开放，本地短路。
  if (!campaign.claimable) {
    return {
      signed: true,
      claimed: false,
      credits,
      campaign,
      message: `今日签到不可领取(status=${campaign.status ?? "null"}):今天已签或活动尚未开放`,
    };
  }

  if (opts.dryRun === true) {
    return {
      signed: false,
      claimed: false,
      credits,
      campaign,
      message: `今日可签到(campaignId=${campaign.campaignId}, +${campaign.benefitAmount});dryRun 未发领取请求`,
    };
  }

  const result = await codeartsClaimCheckin(account, campaign, opts);
  if (!result.ok) {
    return {
      signed: false,
      claimed: false,
      credits,
      campaign,
      message: `领取失败:${result.message}`,
    };
  }
  return {
    signed: true,
    claimed: true,
    credits,
    campaign,
    message: result.message,
  };
}

/**
 * claim 失败是否「可重试」：只有并发冲突码（40001 / 40002）与上游「稍后 / 繁忙」
 * 类文案才值得再点一次；确定性拒绝（如活动已结束）重试多少次都一样。
 */
export function isCodeartsClaimRetryable(code: number, message: string): boolean {
  if ((CODEARTS_CLAIM_CONFLICT_CODES as readonly number[]).includes(code)) return true;
  const m = message.toLowerCase();
  return ["稍后", "繁忙", "频繁", "too many", "try again", "later", "busy"].some((h) => m.includes(h));
}
