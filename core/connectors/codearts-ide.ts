/**
 * 华为云 CodeArts **IDE 族（B 族，AK/SK 签名网关）签到 + 积分**网络层。
 *
 * 这是 CodeArts 唯一的签到路径 —— AK/SK 就是网关推理用的那份凭据
 * （`credential.raw_json` 的 `accessKey`/`secretKey`/`securityToken`/`domainId`）。
 *
 * ## 协议事实（全部 2026-11-16 实测，签名用 {@link signCodeartsRequest}）
 * - `GET  /v1/ops/delivery?channel=IDE` 活动列表（需 `Agent-Type: PromptCenter`）；
 *   签到活动判据 `type === "USER_LOGIN"`，可领 `status === "ELIGIBLE"`；
 * - `POST /v1/ops/claim`   body `{campaignId, channel:"IDE"}` → `status:"CLAIMED"`
 *   并返回逐笔记录（`id` / `expireAt` 等）；
 * - `POST /v1/ops/confirm` body `{campaignId}` → `status:"CONFIRMED"` = **积分入账**。
 *   ⚠️ confirm 带 `channel` 会 400 `HDN.1000`（实测踩过），**只发 campaignId**。
 * - `40001`（并发冲突）= 同日已领（另一通道已签/重试竞态）→ 视为 already。
 *
 * ## 到期事实（实测，对调度器 due-first 很重要）
 * - **签到积分只有 24 小时**：claim 响应 `expireAt = claimedAt + 1d`；
 * - 订阅套餐积分到 `end_date` 前一天 23:59:59（`end_date` 是次日起始日）；
 * - 领取明细的逐笔 `expireAt` 上游只在 claim/confirm 响应里出现过一次，
 *   没有公开的逐笔查询端点 —— 到期估算见 `collector/quota.ts` 的探针。
 */

import { createHash, createHmac } from "node:crypto";

import {
  CODEARTS_BASE_CN,
  codeartsIdentityHeaders,
} from "./codearts.js";
import { signCodeartsRequest } from "./codearts-sign.js";
import { CheckinError } from "./checkin.js";

// ---------------------------------------------------------------------------
// 活动模型
// ---------------------------------------------------------------------------

/** CodeArts 运营活动（AK/SK 网关形态）。 */
export interface CodeartsCampaign {
  campaignId: number;
  title: string;
  type: string;
  benefitAmount: number;
  claimable: boolean;
  /** 不可领时为 `null`（上游就是这么给的，不是空串）。 */
  status: string | null;
  /** 活动开始时刻（epoch 秒，来自 `extra.startTime`）；读不到为 null。 */
  startAt: number | null;
  /** 活动结束时刻（epoch 秒，来自 `extra.endTime`）；读不到为 null。 */
  endAt: number | null;
}

// ---------------------------------------------------------------------------
// 常量（实测）
// ---------------------------------------------------------------------------

/** B 族活动/领取路径（与推理同域）。 */
export const CODEARTS_IDE_DELIVERY_PATH = "/v1/ops/delivery?channel=IDE";
export const CODEARTS_IDE_CLAIM_PATH = "/v1/ops/claim";
export const CODEARTS_IDE_CONFIRM_PATH = "/v1/ops/confirm";

/** 签到活动的 `type`。 */
export const CODEARTS_IDE_CHECKIN_TYPE = "USER_LOGIN";

/** claim 并发冲突业务码：另一通道已领 / 重试竞态 → 视为「今日已签」。 */
export const CODEARTS_IDE_CONFLICT_CODE = 40001;

export const CODEARTS_IDE_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// 账号 / 请求
// ---------------------------------------------------------------------------

/** B 族账号：AK/SK 从凭据 raw_json 取（与网关 connectorExtra 同一份口径）。 */
export interface CodeartsIdeAccount {
  accessKey: string;
  secretKey: string;
  /** STS 临时令牌（长期 AK/SK 账号没有）。 */
  securityToken?: string;
  /** IAM 域 ID（`x-ot-session-id` 派生用；缺省忽略）。 */
  domainId?: string;
  /** 账号标识（日志/错误文案用）。 */
  label?: string;
}

export interface CodeartsIdeHttpOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** base 覆盖（自建反代）。 */
  baseUrl?: string;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** 身份头（与推理同一套；`Agent-Type` 签名后追加）。 */
function identityHeaders(account: CodeartsIdeAccount): Record<string, string> {
  return {
    ...codeartsIdentityHeaders({
      accessKey: account.accessKey,
      ...(account.domainId ? { domainId: account.domainId } : {}),
    }),
    "Agent-Type": "PromptCenter",
  };
}

/** 签名并 GET，返回 JSON（业务失败/网络失败抛 CheckinError）。 */
async function ideGet(
  account: CodeartsIdeAccount,
  path: string,
  label: string,
  opts: CodeartsIdeHttpOptions,
): Promise<Record<string, unknown>> {
  const base = (opts.baseUrl || CODEARTS_BASE_CN).replace(/\/+$/, "");
  const url = `${base}${path}`;
  const signed = signCodeartsRequest({
    accessKey: account.accessKey,
    secretKey: account.secretKey,
    ...(account.securityToken ? { securityToken: account.securityToken } : {}),
    method: "GET",
    url,
    headers: identityHeaders(account),
  });
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CODEARTS_IDE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetchFn(url, { method: "GET", headers: signed.headers, signal: controller.signal });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CheckinError(
      controller.signal.aborted ? `${label}超时(${timeoutMs}ms)` : `${label}连接失败: ${msg}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await resp.text();
  if (!resp.ok) {
    throw new CheckinError(`${label} HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new CheckinError(`${label}响应不是 JSON(HTTP ${resp.status})`);
  }
}

/** 签名并 POST JSON，返回 `{code, message, data}`。 */
async function idePost(
  account: CodeartsIdeAccount,
  path: string,
  body: Record<string, unknown>,
  label: string,
  opts: CodeartsIdeHttpOptions,
): Promise<Record<string, unknown>> {
  const base = (opts.baseUrl || CODEARTS_BASE_CN).replace(/\/+$/, "");
  const url = `${base}${path}`;
  const bodyText = JSON.stringify(body);
  const signed = signCodeartsRequest({
    accessKey: account.accessKey,
    secretKey: account.secretKey,
    ...(account.securityToken ? { securityToken: account.securityToken } : {}),
    method: "POST",
    url,
    headers: identityHeaders(account),
    body: bodyText,
  });
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CODEARTS_IDE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetchFn(url, { method: "POST", headers: signed.headers, body: bodyText, signal: controller.signal });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CheckinError(
      controller.signal.aborted ? `${label}超时(${timeoutMs}ms)` : `${label}连接失败: ${msg}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await resp.text();
  if (!resp.ok) {
    throw new CheckinError(`${label} HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new CheckinError(`${label}响应不是 JSON(HTTP ${resp.status})`);
  }
}

// ---------------------------------------------------------------------------
// 活动列表 / 签到
// ---------------------------------------------------------------------------

/** 活动列表（B 族）。`code != 0` 或缺 `data.items` 抛 CheckinError。 */
export async function codeartsIdeCampaigns(
  account: CodeartsIdeAccount,
  opts: CodeartsIdeHttpOptions = {},
): Promise<CodeartsCampaign[]> {
  const payload = await ideGet(account, CODEARTS_IDE_DELIVERY_PATH, "活动列表", opts);
  const code = typeof payload["code"] === "number" ? payload["code"] : Number(payload["code"]);
  if (code !== 0) {
    throw new CheckinError(`活动列表业务失败(code ${payload["code"]})`);
  }
  const data = payload["data"];
  const items =
    data !== null && typeof data === "object" && Array.isArray((data as Record<string, unknown>)["items"])
      ? ((data as Record<string, unknown>)["items"] as unknown[])
      : null;
  if (items === null) throw new CheckinError("活动列表缺少 data.items(上游应答形态变了)");
  // 行解析：campaignId 数字优先、extra 里取 start/end 时刻。
  const out: CodeartsCampaign[] = [];
  for (const raw of items) {
    if (raw === null || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const campaignId = Number(item["campaignId"]);
    if (!Number.isFinite(campaignId) || campaignId <= 0) continue;
    const extra =
      item["extra"] !== null && typeof item["extra"] === "object"
        ? (item["extra"] as Record<string, unknown>)
        : null;
    const isoSecondsOf = (v: unknown): number | null => {
      if (typeof v !== "string" || v.trim() === "") return null;
      const ms = Date.parse(v);
      return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
    };
    out.push({
      campaignId,
      title: typeof item["title"] === "string" ? item["title"] : "",
      type: typeof item["type"] === "string" ? item["type"] : "",
      benefitAmount: Number(item["benefitAmount"]) || 0,
      claimable: item["claimable"] === true,
      status: typeof item["status"] === "string" ? item["status"] : null,
      startAt: isoSecondsOf(extra?.["startTime"]),
      endAt: isoSecondsOf(extra?.["endTime"]),
    });
  }
  return out;
}

/**
 * 今日签到活动（B 族）：判据与 A 族一致 —— `type === USER_LOGIN` 先行，标题兜底。
 */
export function pickIdeCheckinCampaign(campaigns: CodeartsCampaign[]): CodeartsCampaign | undefined {
  return (
    campaigns.find((c) => c.type.toUpperCase() === CODEARTS_IDE_CHECKIN_TYPE) ??
    campaigns.find((c) => c.title.includes("签到"))
  );
}

export interface CodeartsIdeClaimResult {
  /** true = 已入账（confirm 成功）。 */
  ok: boolean;
  /** 上游业务码（0 = 成功；40001 = 并发冲突/已领）。 */
  code: number;
  message: string;
  /** 本次领取的积分数（claim 响应 `totalAmount`）。 */
  credit: number;
  /** 积分作废时刻（epoch 秒；claim 响应 `expireAt`，实测 = claimedAt + 24h）。 */
  expireAt: number | null;
  /** true = 今日已签（重复领取或并发冲突）。 */
  already: boolean;
}

/**
 * 领一次（B 族）：delivery → 挑签到活动 → claim → confirm。
 *
 * - 干跑（`confirm:false`）：只查活动列表，零写请求；
 * - `ELIGIBLE` → claim → confirm（**漏 confirm 积分不入账**，实测踩过）；
 * - claim 回 `40001` 并发冲突 / 状态 `CLAIMED|CONFIRMED` → `already:true`；
 * - confirm 业务码非 0 → `ok:false`（claim 已提交但没入账，调用方必须能分辨）。
 */
export async function codeartsIdeCheckin(
  account: CodeartsIdeAccount,
  opts: CodeartsIdeHttpOptions & { confirm?: boolean } = {},
): Promise<CodeartsIdeClaimResult> {
  const confirm = opts.confirm !== false;
  const campaigns = await codeartsIdeCampaigns(account, opts);
  const campaign = pickIdeCheckinCampaign(campaigns);
  if (campaign === undefined) {
    return { ok: false, code: -1, message: "没有签到活动(USER_LOGIN)", credit: 0, expireAt: null, already: false };
  }
  const today = campaign.status;
  if (today === "CONFIRMED") {
    return { ok: false, code: 0, message: "今日已签到(已确认入账)", credit: campaign.benefitAmount, expireAt: null, already: true };
  }
  if (today === "CLAIMED") {
    // 已领未确认：补 confirm。
    if (!confirm) {
      return { ok: false, code: -1, message: "干跑:已领取但未确认", credit: 0, expireAt: null, already: true };
    }
    const ack = await idePost(account, CODEARTS_IDE_CONFIRM_PATH, { campaignId: campaign.campaignId }, "领取确认", opts);
    const code = typeof ack["code"] === "number" ? ack["code"] : -1;
    if (code !== 0) {
      return { ok: false, code, message: `补确认被拒(code ${code}) —— 积分未入账`, credit: 0, expireAt: null, already: true };
    }
    const data = (ack["data"] ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      code: 0,
      message: "补确认成功,积分应已入账",
      credit: Number(data["totalAmount"]) || campaign.benefitAmount,
      expireAt: isoToSeconds(data["expireAt"]),
      already: true,
    };
  }
  if (!confirm) {
    return {
      ok: false,
      code: -1,
      message: `可领取 ${campaign.benefitAmount} 积分(干跑,未写)`,
      credit: campaign.benefitAmount,
      expireAt: null,
      already: false,
    };
  }
  // claim（必须带 channel=IDE，实测缺它 400「channel : 参数无效」）
  const claim = await idePost(
    account,
    CODEARTS_IDE_CLAIM_PATH,
    { campaignId: campaign.campaignId, channel: "IDE" },
    "领取",
    opts,
  );
  const claimCode = typeof claim["code"] === "number" ? claim["code"] : -1;
  if (claimCode === CODEARTS_IDE_CONFLICT_CODE) {
    return { ok: false, code: claimCode, message: "今日已签(上游回报并发冲突/重复领取)", credit: 0, expireAt: null, already: true };
  }
  if (claimCode !== 0) {
    const msg = typeof claim["message"] === "string" ? claim["message"] : "";
    return { ok: false, code: claimCode, message: `claim 被拒(code ${claimCode})${msg ? `:${msg}` : ""}`, credit: 0, expireAt: null, already: false };
  }
  const claimData = (claim["data"] ?? {}) as Record<string, unknown>;
  const claimStatus = typeof claimData["status"] === "string" ? claimData["status"] : "";
  const credit = Number(claimData["totalAmount"]) || campaign.benefitAmount;
  const expireAt = isoToSeconds(claimData["expireAt"]);
  // claim 已回 CLAIMED：紧接着 confirm（漏了积分不入账）。
  if (claimStatus === "CLAIMED") {
    const ack = await idePost(account, CODEARTS_IDE_CONFIRM_PATH, { campaignId: campaign.campaignId }, "领取确认", opts);
    const confirmCode = typeof ack["code"] === "number" ? ack["code"] : -1;
    if (confirmCode !== 0) {
      const msg = typeof ack["message"] === "string" ? ack["message"] : "";
      return {
        ok: false,
        code: confirmCode,
        message: `claim 成功但 confirm 被拒(code ${confirmCode})${msg ? `:${msg}` : ""} —— 积分未入账`,
        credit,
        expireAt,
        already: false,
      };
    }
    const confirmData = (ack["data"] ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      code: 0,
      message: `领取成功,获得 ${credit} 积分${expireAt !== null ? "(次日同期作废,签到积分只有24小时)" : ""}`,
      credit,
      expireAt: isoToSeconds(confirmData["expireAt"]) ?? expireAt,
      already: false,
    };
  }
  // 意外状态（上游改协议）：照实报，不当成功。
  return { ok: false, code: -1, message: `claim 返回异常状态 ${claimStatus}`, credit, expireAt, already: false };
}

/** ISO 串 → epoch 秒；解析不出 null。 */
function isoToSeconds(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
