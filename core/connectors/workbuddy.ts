/**
 * WorkBuddy 连接器 —— X-Refresh-Token 头 + expiresIn / JWT exp。
 *
 * 协议要点（原始来源 Nexus `workbuddy.py` / `refresh.py`；身份标头已于
 * 2026-11 对齐公开反代样本 `workbuddy2api-hub`/`workbuddy2api-panel` 的
 * 5.8.x 桌面端抓包）：
 *
 * ## 认证
 * - 头：`Authorization: Bearer <token>`
 * - 身份头：`X-IDE-Name/Type: WorkBuddy`, `X-IDE-Version`（cn: 5.8.3, global: **5.9.4**）
 * - 桌面端对话：`X-Agent-Intent: craft` / `X-Agent-Purpose: conversation` /
 *   `X-Agent-Type: main` / `X-Private-Data` / `X-Product: SaaS`，以及
 *   `X-Conversation-ID` / `-Request-ID` / `-Root-Request-ID` / `-Message-ID`
 *   会话头族（`X-Request-ID` 即 message id）。对话**不带** `X-Machine-ID` /
 *   `X-Session-ID`（那两个只用于反馈上报）。
 * - 域头：`X-Domain`（cn: copilot.tencent.com, global: www.workbuddy.ai）
 *
 * ## 区域
 * - cn → `https://copilot.tencent.com`
 * - global → `https://www.workbuddy.ai`
 * - 从 JWT `iss` 推断区域（workbuddy.cn 必须算 CN）
 *
 * ## 端点
 * - `/v2/chat/completions`, 恒走 SSE
 *
 * ## 刷新
 * - 头：`X-Refresh-Token: <token>`（不带 Authorization），另带
 *   `X-Auth-Refresh-Source`（cn: `workbuddy`, global: `plugin`）
 * - 应答：code=0 + data.accessToken + data.expiresIn（秒，相对）+ refreshToken；
 *   刷新到期以新 accessToken 的 JWT `exp` 为准（无法解析到 exp 时退回 expiresIn）。
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  AuthConnector,
  ConnectorCredentials,
  RequestDecoration,
  TokenState,
  UpstreamError,
  upstreamRawResponse,
} from "./types.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 区域 → API 地址映射 */
export const REGION_BASES: Record<string, string> = {
  cn: "https://copilot.tencent.com",
  global: "https://www.workbuddy.ai",
};

/** 区域别名 */
const REGION_ALIASES: Record<string, string> = {
  intl: "global",
  cn: "cn",
};

/**
 * 桌面端 WorkBuddy 身分的版本串（CN 与 Global 不同）。
 *
 * ⚠️ 对齐 `workbuddy2api-hub`/`workbuddy2api-panel` 的抓包（有出处）：
 * 官方桌面端 UA 两段式 —— CN `WorkBuddy/<ver> WorkBuddy/<ver> CLI/<ver>`（5.8.3），
 * Global `WorkBuddy/<ver> workbuddy-ai/<ver> CLI/<ver>`（**5.9.4**，UA 末段
 * 内置 CLI 版本 `2.165.0`）。
 *
 * 2026-11-08 更新（用户转述 hub 最新源码 `wb_identity.py` L72-84 的 5.9.4 实测）：
 * 国际版桌面端已到 **5.9.4**，UA 末段的内置 CLI 也从 2.161.0 升到 **2.165.0**；
 * CN 仍是 5.8.3 / 2.161.0。旧值 5.8.4 / 2.161.0 在 intl 上落后一个大版本，
 * 那本身就是一处「网关特征」。
 *
 * 五段 UA 中：第 1 段 = 应用名（官方 product.json 的 applicationName，CN `WorkBuddy`
 * / Global `workbuddy-ai`）、第 2 段 = 产品名（CN `WorkBuddy` / Global `workbuddy-ai`）、
 * 第 3 段 = 内置 CLI。第 2 段的 `WorkBuddy/...`（非 `workbuddy-ai/...`）是官方 CN
 * 链路，别照抄 Global 的 `workbuddy-ai` 段。
 */
const IDENTITY_VERSIONS: Record<
  string,
  { ide: string; ua: string }
> = {
  cn: {
    ide: "5.8.3",
    ua: "WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0",
  },
  global: {
    ide: "5.9.4",
    ua: "WorkBuddy/5.9.4 workbuddy-ai/5.9.4 CLI/2.165.0",
  },
};

/**
 * 官方 **CodeBuddy CLI** 身份（`@tencent-ai/codebuddy-code` 2.168.2，解包核对）。
 *
 * 为什么提供这个身份（2026-11-08 用户定案，**默认关闭**）：
 * 桌面端对话是「Electron 客户端里的 CLI 子进程」发出的，它**同时**带浏览器会话
 * 包装（`Origin` / `Referer` / `X-Requested-With` / `X-CodeBuddy-Request` /
 * `Accept-Language`）。而 CLI 身份**一个浏览器头都没有**（`Accept` 就是
 * `application/json`），更没有设备 token —— 从「像不像网页反代」这个角度看，
 * CLI 身份更干净。
 *
 * ⚠️ 但它是**另一种出站形态**，而 as-one 现有的一切（签到/计费/闸门）都是按桌面端
 * 对齐的。切身份属于「换一种假设」，必须可回退，所以默认仍是桌面端：
 * 凭据 `raw.identity = "cli"` 才切（见 `decorateRequest`）。
 */
export const CLI_IDENTITY = {
  ide: "2.168.2",
  ua: "CLI/2.168.2 CodeBuddy/2.168.2",
} as const;

/** 出站身份形态（`desktop` = 官方桌面端，`cli` = 官方 CodeBuddy CLI）。 */
export type WorkbuddyIdentity = "desktop" | "cli";

/** 身份归一：只认 `cli`，其余（含空/未知）一律 `desktop`。 */
export function normalize_identity(value: unknown): WorkbuddyIdentity {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return key === "cli" ? "cli" : "desktop";
}

// ---------------------------------------------------------------------------
// 区域
// ---------------------------------------------------------------------------

/**
 * 区域归一：`cn` / `global`（接受 intl 写法）。未知值回退 global。
 */
export function normalize_region(region?: string): string {
  const key = (region ?? "").trim().toLowerCase();
  return REGION_ALIASES[key] ?? "global";
}

/**
 * 从 JWT `iss` 推断区域。
 *
 * ⚠️ `workbuddy.cn` 必须算 CN —— 刷新后的 CN 账号 token 的 iss 是
 * `https://www.workbuddy.cn/auth/realms/copilot`，漏了它会被判成 global。
 */
export function detect_region_from_token(token: string): string {
  const iss = jwt_claim(token, "iss").toLowerCase();
  if (
    iss.includes("copilot.tencent.com") ||
    iss.includes("codebuddy.cn") ||
    iss.includes("workbuddy.cn")
  ) {
    return "cn";
  }
  return "global";
}

// ---------------------------------------------------------------------------
// JWT 工具
// ---------------------------------------------------------------------------

/**
 * 解析 JWT claims（不验证签名）。
 */
function _jwt_claims(token: string): Record<string, unknown> {
  try {
    const segment = token.split(".")[1];
    // ⚠️ 2026-11-08 修:padding 必须按 `(4 - len % 4) % 4` 算。旧写法 `(-len) % 4`
    // 在长度不是 4 的倍数时得到**负数**(`-101 % 4 === -1`),`"=".repeat(-1)` 抛
    // `RangeError` 被 catch 吞掉 → 返回 `{}`。症状极隐蔽:`detect_region_from_token`
    // 会在某些 token 长度上**静默判成 global**,CN 账号被打到国际主机。
    const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64url").toString("utf-8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * 获取 JWT 某个 claim 的值。
 */
export function jwt_claim(token: string, key: string): string {
  const claims = _jwt_claims(token);
  const value = claims[key];
  return value != null ? String(value) : "";
}

/**
 * 获取 JWT 某个 claim 的数值（用于 `exp`）。无法解析 / 非有限数 → undefined。
 */
export function jwtClaimNumber(token: string, key: string): number | undefined {
  const claims = _jwt_claims(token);
  const raw = claims[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 身份标识派生
// ---------------------------------------------------------------------------

/**
 * uid + 加盐 md5 单向派生稳定的伪设备标识。
 *
 * 与 Nexus `_derive_id` 对齐：
 * - 幂等，多账号天然隔离
 * - 同一台机器换账号不该被看成同一设备
 *
 * ⚠️ 仅用于**计费 / 反馈上报**路径的 X-Machine-ID / X-Session-ID（hub 明确：
 * 官方**对话**请求不带这两个头，它们是「网关特征」来源）。见
 * {@link build_identity_headers}。
 */
export function derive_id(uid: string, salt: string): string {
  return createHash("md5")
    .update(`${salt}:${uid || "anonymous"}`)
    .digest("hex")
    .slice(0, 36);
}

/**
 * 32 位**无连字符** hex 的请求 / 消息 id —— 官方 `uuidv7().hex` 形态。
 *
 * ⚠️ 2026-11-08 修正（用户转述 hub 最新源码 `wb_identity.new_message_id`）：
 * 5.8.4 抓包里 `X-Request-ID` / `X-Conversation-Message-ID` /
 * `X-Conversation-Request-ID` / `X-Root-Request-ID` 都是 **32 位无连字符 hex**
 * （官方是 `uuidv7()` 去掉连字符）。as-one 之前四个头全用 `randomUUID()`
 * （36 位带连字符），**形态与官方不一致** —— 这本身就是「网关特征」。
 *
 * 这里按 UUIDv7 的布局生成：48 位毫秒时间戳 + 80 位随机（12 + 20 = 32 hex），
 * 时间有序、每请求唯一。⚠️ 上游不校验版本位（hub 抓包实测 v4 / v7 都被接受），
 * 所以「贴形态」即可，不承担语义。
 *
 * ⚠️ `X-Conversation-ID` **不**走这个函数：官方那个头是**带连字符**的 UUID
 * （`new_conversation_id()` = `str(uuid7())`），形态不同，别一起改。
 */
export function new_request_id_hex(nowMs: number = Date.now()): string {
  // ⚠️ 必须用**取模**而不是位与:`Date.now()` 已超过 32 位,JS 的 `&` 会先把两边
  // 截成 int32,`& 0xffffffffffff` 得到的是一个被截断的怪值(实测 id 变成
  // `000-485a…`)。取模得到真正的 48 位毫秒。
  const ms = Math.trunc(nowMs) % 2 ** 48;
  return `${ms.toString(16).padStart(12, "0")}${randomBytes(10).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// 桌面端身份标头（对齐 `workbuddy2api-hub` wb_identity.build_identity_headers）
// ---------------------------------------------------------------------------

/**
 * 官方桌面端（product=workbuddy）聊天出站标头。
 *
 * ⚠️ 依据：`workbuddy2api-hub` `wb_identity.build_identity_headers`（5.8.4 / 5.9.4
 * 抓包 + 官方包解包）与 `workbuddy2api-panel` `internal/upstream/desktop.go`。
 *
 * 关键差异（有出处，`wb_accounts.Account.headers` docstring 明确）：
 * - 官方 **对话请求不带 `X-Machine-ID` / `X-Session-ID`**（那两个只用于反馈上报）；
 *   旧实现把每个账号恒定的派生值塞进对话标头，反而构成一处「网关特征」。
 * - `X-Request-ID` / `X-Conversation-Message-ID` / `X-Conversation-Request-ID` /
 *   `X-Root-Request-ID` 是 **32 位无连字符 hex**（官方 `uuidv7().hex`，每请求新生成），
 *   不是 `derive_id(uid,…)-微秒` 这种恒定前缀，也不是带连字符的 `randomUUID()`。
 * - `X-Product` 官方主对话用 **`SaaS`**（非 `WorkBuddy`）。
 * - 官方对话带 `X-Conversation-ID` / `-Request-ID` / `-Root-Request-ID` /
 *   `-Message-ID` 会话头族，且 `-Request-ID` 与 `-Root-Request-ID` **同值**。
 * - ⚠️ 关于「`X-Request-ID` 是不是等于 `X-Conversation-Request-ID`」：**桌面端不等**
 *   —— 官方桌面端 `X-Request-ID` 取的是**消息 id**（`msg_id`），
 *   `-Conversation-Request-ID` 取的是本轮 request id（`wb_identity.py` 桌面分支
 *   原文：`"X-Conversation-Request-ID": conv_req_id, "X-Root-Request-ID": conv_req_id,
 *   "X-Conversation-Message-ID": msg_id, "X-Request-ID": msg_id`）。只有 **VSCode
 *   身份**才把 `X-Request-ID` 设成 `conv_req_id`。as-one 走桌面端身份，所以保持
 *   `X-Request-ID = -Conversation-Message-ID`（2026-11-08 核对源码后确认，不改）。
 *
 * @param enterprise_id 非空时补企业标识（官方桌面端仅企业号发）。
 * @param conversation_id 为空则每次请求新生成（官方桌面端行为：桌面 UUIDv7）。
 * @param identity 出站身份形态（缺省桌面端；`cli` 见 {@link CLI_IDENTITY}）。
 */
export function build_identity_headers(
  token: string,
  region: string,
  uid?: string,
  domain?: string,
  enterprise_id?: string,
  conversation_id?: string,
  identity?: WorkbuddyIdentity,
): Record<string, string> {
  const realm = normalize_region(region);
  const kind = normalize_identity(identity);
  const effectiveDomain =
    domain || (realm === "cn" ? "copilot.tencent.com" : "www.workbuddy.ai");
  const effectiveUid = uid || jwt_claim(token, "sub") || "anonymous";
  // `X-Conversation-ID` 官方是**带连字符**的 UUID（`str(uuid7())`），每请求现生成
  // （桌面端没有「会话」概念可复用）。CLI 身份同样每请求生成 —— 网关这一层拿不到
  // 宿主会话键，官方「没有会话键 → 每请求新生」正是同一个兜底。
  const conv = conversation_id || randomUUID();
  // main 请求里 X-Conversation-Request-ID 与 X-Root-Request-ID 同值，
  // 且早于消息 id（一轮 user send 开始时生成）。桌面端每请求现生成。
  const convRequestId = new_request_id_hex();
  const messageId = new_request_id_hex();

  if (kind === "cli") {
    // --- 官方 CodeBuddy CLI 2.168.2（见 {@link CLI_IDENTITY}）---
    //
    // ⚠️ 刻意**不发** x-stainless-* 与 trace 头：那是官方 OpenAI Node SDK 6.25.0
    // 自带的一整套指纹头，值里含 SDK 版本 / 运行时版本。我们不是那个 SDK，
    // 手抄一套「对不上的 SDK 指纹」比不发光盘更差（hub 自己的注释也写着
    // 「在这些身份上设置平台变量不会改变出站头」）。
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Agent-Intent": "craft",
      "X-Agent-Purpose": "conversation",
      "X-Agent-Runtime": "other",
      "X-Agent-Type": "main",
      "X-IDE-Name": "CLI",
      "X-IDE-Type": "CLI",
      "X-IDE-Version": CLI_IDENTITY.ide,
      "X-Product": "SaaS",
      "X-Domain": effectiveDomain,
      "User-Agent": CLI_IDENTITY.ua,
      "X-User-Id": effectiveUid,
      Authorization: `Bearer ${token}`,
      "X-Conversation-ID": conv,
      "X-Conversation-Request-ID": convRequestId,
      "X-Root-Request-ID": convRequestId,
      "X-Conversation-Message-ID": messageId,
      "X-Request-ID": messageId,
    };
    if (enterprise_id) {
      headers["X-Enterprise-Id"] = enterprise_id;
      headers["X-Tenant-Id"] = enterprise_id;
    }
    return headers;
  }

  const cfg = IDENTITY_VERSIONS[realm];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Agent-Intent": "craft",
    "X-Agent-Purpose": "conversation",
    "X-Agent-Type": "main",
    "X-IDE-Name": "WorkBuddy",
    "X-IDE-Type": "WorkBuddy",
    "X-IDE-Version": cfg.ide,
    "X-Private-Data": enterprise_id ? "true" : "false",
    "X-Product": "SaaS",
    "X-Domain": effectiveDomain,
    "User-Agent": cfg.ua,
    "X-User-Id": effectiveUid,
    Authorization: `Bearer ${token}`,
    "X-Conversation-ID": conv,
    "X-Conversation-Request-ID": convRequestId,
    "X-Root-Request-ID": convRequestId,
    "X-Conversation-Message-ID": messageId,
    "X-Request-ID": messageId,
  };

  if (enterprise_id) {
    headers["X-Enterprise-Id"] = enterprise_id;
    headers["X-Tenant-Id"] = enterprise_id;
  }

  return headers;
}

// ---------------------------------------------------------------------------
// 请求头
// ---------------------------------------------------------------------------

/**
 * 构建出站聊天请求头。
 *
 * 与 `workbuddy2api-hub`/`workbuddy2api-panel` 抓包对齐：先用
 * {@link build_identity_headers} 组装官方身份标头，再补浏览器会话包装
 * （X-Requested-With / Origin / Referer / X-CodeBuddy-Request / Accept /
 * Accept-Language）。对话请求**不再**带 X-Machine-ID / X-Session-ID（官方
 * 聊天标头没有那两个，见 {@link build_identity_headers}）。
 *
 * ⚠️ 浏览器包装**只属于桌面端**：官方 CodeBuddy CLI 的 chat 请求一个浏览器头都
 * 没有（`Accept` 就是 `application/json`，也没有设备 token）。所以 `identity="cli"`
 * 时这里只留 `Accept: application/json`（见 `wb_accounts.Account.headers`
 * 的 CLI 分支：`Origin` / `Referer` / `X-CodeBuddy-Request` / `Accept-Language`
 * 全部不发）。
 */
export function build_chat_headers(
  token: string,
  region: string,
  uid?: string,
  domain?: string,
  enterprise_id?: string,
  identity?: WorkbuddyIdentity,
): Record<string, string> {
  const realm = normalize_region(region);
  const origin = REGION_BASES[realm];
  const kind = normalize_identity(identity);
  const base = build_identity_headers(token, realm, uid, domain, enterprise_id, undefined, kind);

  if (kind === "cli") {
    return { ...base, Accept: "application/json" };
  }

  return {
    ...base,
    // --- 浏览器会话包装（官方桌面端对话确有这些头）---
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    Origin: origin,
    Referer: `${origin}/`,
    "X-CodeBuddy-Request": "1",
    "Accept-Language": realm === "cn" ? "zh-CN" : "en-US",
  };
}

// ---------------------------------------------------------------------------
// 刷新
// ---------------------------------------------------------------------------

/**
 * 构建刷新请求头（X-Refresh-Token，不带 Authorization）。
 *
 * 与 `workbuddy2api-hub` wb_accounts.ProviderRefresh 对齐：补
 * `X-Auth-Refresh-Source`（cn: workbuddy / global: plugin）与 Billing 会话包装
 * （Origin/Referer/X-Requested-With/Accept-Language/X-User-Id/X-Domain）。
 * 注意 panel 的 refreshWorkbuddyToken 会再覆盖部分头，这里的默认值以 hub 为准。
 */
export function build_refresh_headers(
  refresh_token: string,
  region: string = "cn",
): Record<string, string> {
  const realm = normalize_region(region);
  const origin = REGION_BASES[realm];
  return {
    "Content-Type": "application/json",
    "X-Refresh-Token": refresh_token,
    "X-Auth-Refresh-Source": realm === "cn" ? "workbuddy" : "plugin",
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    Origin: origin,
    Referer: `${origin}/`,
    "Accept-Language": realm === "cn" ? "zh-CN" : "en-US",
    "X-CodeBuddy-Request": "1",
  };
}

/**
 * 解析刷新应答。
 *
 * 与 Nexus workbuddy 刷新对齐：code=0 + data.accessToken + expiresIn（秒）+ refreshToken
 */
export function parse_refresh_response(body: unknown): TokenState {
  if (!body || typeof body !== "object") {
    throw new UpstreamError("bad_request", "刷新应答格式错误", false, 400);
  }
  const code = (body as Record<string, unknown>)["code"];
  if (code !== 0) {
    const msg = (body as Record<string, unknown>)["message"] ?? "未知错误";
    throw new UpstreamError("auth", `刷新失败: ${msg}`, false, 401);
  }
  const data = (body as Record<string, unknown>)["data"] as Record<string, unknown> | undefined;
  if (!data) {
    throw new UpstreamError("bad_request", "刷新应答缺少 data", false, 400);
  }
  const accessToken = data["accessToken"] as string | undefined;
  if (!accessToken) {
    throw new UpstreamError("bad_request", "刷新应答缺少 accessToken", false, 400);
  }
  const expiresIn = data["expiresIn"] as number | undefined;
  // 与 `workbuddy2api-hub` wb_accounts 对齐：刷新到期以新 accessToken 的
  // JWT `exp`（绝对秒）为准（hub `self.expires_at = jwt_exp(token)`）；
  // 解析不到 exp 时才退回 expiresIn 相对秒。
  const exp = jwtClaimNumber(accessToken, "exp");
  const expiresAt =
    exp != null
      ? exp
      : expiresIn != null
        ? Math.floor(Date.now() / 1000) + expiresIn
        : Number.POSITIVE_INFINITY;
  const refreshToken = data["refreshToken"] as string | undefined;
  return {
    accessToken,
    expiresAt,
    refreshToken,
  };
}

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

/**
 * WorkBuddy 错误分类。
 *
 * 与 Nexus `raise_for_status` 对齐：
 * - 401 → auth（不可重试）
 * - 429 → rate_limit（可重试）
 * - 5xx → upstream（可重试）
 * - 4xx → bad_request（不可重试）
 */
export function classify_workbuddy_error(httpStatus: number, body: unknown): UpstreamError {
  // ⚠️ 2026-10-21 上游新增**内容指纹渠道校验**(HTTP 400 / code 11128)与
  // 账号级封禁(code 11140) —— 错误码藏在 body 的 `code` 字段里,httpStatus
  // 全是 400/401,不读 body 就把它们全并进了「bad_request 请求错误」。
  // 这里把 code 带进 message,让网关能识别 channel_reject(11128)并走
  // 归一化重试(见 connectors/workbuddy-gate.ts)。
  //
  // ⚠️ 2026-10-31(用户 m36329):**客户端看到的是上游原件**,不是这些改写过的
  // message —— 每个分支都把 `raw` 挂上,网关出口逐字写回上游状态码 + 响应体。
  const original = upstreamRawResponse(httpStatus, body);
  const detail = workbuddyErrorDetail(body);
  if (typeof detail.code === "number") {
    if (detail.code === 11128) {
      return new UpstreamError(
        "bad_request",
        `渠道校验拦截(code 11128)${detail.text ? `:${detail.text}` : ""}`,
        false,
        httpStatus,
        undefined,
        original,
      );
    }
    if (detail.code === 11140) {
      return new UpstreamError(
        "auth",
        `账号存在异常行为,已被限制使用(code 11140)${detail.text ? `:${detail.text}` : ""}`,
        false,
        httpStatus,
        undefined,
        original,
      );
    }
  }
  // ⚠️ 2026-10-24(用户 m08590):「模型使用量超限」这类错误要**原样**回到客户端 ——
  // 不能只给「上游限流 / 上游错误」这种被我们改写过的四个字,用户要能看见上游
  // 自己写的原因(额度耗尽 / 模型被限流 / 区域限制…)。所以通用分支统一带上游原文;
  // 11128 / 11140 已有专门文案,不重复加。
  const raw = workbuddySnippet(body);
  const withRaw = (text: string): string => (raw === "" ? text : `${text} — 上游:${raw}`);
  if (httpStatus === 401 || httpStatus === 403) {
    return new UpstreamError("auth", withRaw("认证失败"), false, httpStatus, undefined, original);
  }
  if (httpStatus === 429) {
    // ⚠️ 2026-10-25(用户 m13888):上游额度耗尽(6004)的 msg 里明确写了
    // 「将在 <时刻> 重置」—— 这是上游给的**绝对等待时间**,应遵守它而不是
    // 用全局固定冷却(实测面板只冷却 12m58s,上游说 9 小时后重置)。解析成
    // retryAfter 秒,`cooldownUntilOf` 会算出准确的冷却截止时刻。
    const retryAfter = workbuddyResetAfter(body);
    return new UpstreamError("rate_limit", withRaw("上游限流"), true, 429, retryAfter, original);
  }
  if (httpStatus >= 500) {
    return new UpstreamError("upstream", withRaw("上游错误"), true, httpStatus, undefined, original);
  }
  if (httpStatus >= 400) {
    return new UpstreamError("bad_request", withRaw("请求错误"), false, httpStatus, undefined, original);
  }
  return new UpstreamError("upstream", withRaw("未知错误"), true, httpStatus, undefined, original);
}

/** 压白 + 截断,取一段能安全回显的上游原文(错误体可能很长,也可能带账号标识)。 */
function workbuddySnippet(body: unknown): string {
  const detail = workbuddyErrorDetail(body);
  const raw = detail.text !== "" ? detail.text : JSON.stringify(body ?? "");
  return String(raw).replace(/\s+/g, " ").trim().slice(0, 200);
}

/** 从 workbuddy 错误体里取 {code, text(优先 displayMsg.zh → msg → message)}。 */
function workbuddyErrorDetail(body: unknown): { code: number | null; text: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { code: null, text: "" };
  }
  const b = body as Record<string, unknown>;
  const rawCode = b["code"];
  const code = typeof rawCode === "number" ? rawCode : typeof rawCode === "string"
    && /^\d+$/.test(rawCode)
    ? Number(rawCode)
    : null;
  const displayMsg = b["displayMsg"];
  const dm =
    displayMsg !== null && typeof displayMsg === "object" && !Array.isArray(displayMsg)
      ? (displayMsg as Record<string, unknown>)
      : null;
  const dmZh = dm?.["zh"];
  const text = [dmZh, b["msg"], b["message"]]
    .find((v): v is string => typeof v === "string" && v.trim() !== "");
  return { code, text: text?.trim() ?? "" };
}

/**
 * 从 workbuddy 错误体里解析上游给的**绝对重置时刻** → 距今秒数。
 *
 * 上游额度耗尽(429 / code 6004)的 msg 形如:
 *   「您的使用量已超出频率限制,将在 2026-10-25 22:45:53 UTC+8 重置,……」
 *
 * 解析「将在 <YYYY-MM-DD HH:MM:SS> [UTC±HH(:MM)] 重置」:
 * - 带时区后缀 → 按该时区解析成绝对时刻;
 * - 不带时区 → 按本机时区(与上游「本地重置时刻」语义一致)。
 * 读不出 → `undefined`(调用方走原分类路径)。
 * 重置时刻已过 → `0`(上游说「已重置」,不用再等)。
 */
function workbuddyResetAfter(body: unknown): number | undefined {
  const detail = workbuddyErrorDetail(body);
  if (detail.text === "") return undefined;
  const m = /将在\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s*(UTC([+-]\d{1,2})(?::(\d{2}))?)?\s*重置/.exec(detail.text);
  if (!m) return undefined;
  const date = m[1]!;
  const time = m[2]!;
  const tzSign = m[4] as string | undefined; // "+8" / "-8" / "+08:00"
  const tzMin = m[5] as string | undefined;
  let iso: string;
  if (tzSign !== undefined) {
    const sign = tzSign[0];
    const hh = tzSign.slice(1).padStart(2, "0");
    const mm = tzMin ?? "00";
    iso = `${date}T${time}${sign}${hh}:${mm}`;
  } else {
    // 无时区:本机时区解析(与上游「本地时刻」语义一致)。
    iso = `${date}T${time}`;
  }
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return undefined;
  const secs = Math.ceil((at - Date.now()) / 1000);
  return secs >= 0 ? secs : 0;
}

// ---------------------------------------------------------------------------
// WorkBuddy 连接器
// ---------------------------------------------------------------------------

/**
 * 从凭据扩展字段取非空字符串;否则 undefined。
 * (ConnectorCredentials 扩展字段类型是 unknown,需要窄化)
 */
function asOptionalString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() !== "") return v;
  return undefined;
}

/**
 * WorkBuddy 连接器 —— 实现 {@link AuthConnector} 契约。
 */
export class WorkbuddyAdapter implements AuthConnector {
  readonly vendorId = "workbuddy";

  async getToken(creds: ConnectorCredentials): Promise<TokenState> {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      throw new UpstreamError("auth", "[workbuddy] 缺少 api_key", false, 401);
    }
    return {
      accessToken: apiKey,
      expiresAt: Number.POSITIVE_INFINITY,
    };
  }

  decorateRequest(
    base: RequestDecoration,
    token: TokenState,
    creds?: ConnectorCredentials,
  ): RequestDecoration {
    // 区域:凭据显式 region 优先,否则从 token 探测(与 Nexus _resolve 口径一致)
    const region =
      (creds?.region && creds.region.trim() ? creds.region : undefined) ??
      detect_region_from_token(token.accessToken);
    const uid = asOptionalString(creds?.["uid"]);
    const domain = asOptionalString(creds?.["domain"]);
    const enterpriseId = asOptionalString(creds?.["enterprise_id"]);
    // 出站身份形态:凭据 `raw.identity` 显式指定优先,缺省桌面端。
    // ⚠️ 默认**必须是桌面端**:现有签到/计费/闸门全按桌面端形态对齐,
    // 切身份属于「换一种假设」,只能按账号显式开启(见 CLI_IDENTITY)。
    const identity = normalize_identity(creds?.["identity"]);
    return {
      ...base,
      headers: {
        ...base.headers,
        ...build_chat_headers(token.accessToken, region, uid, domain, enterpriseId, identity),
      },
    };
  }

  classifyError(httpStatus: number, body: unknown): UpstreamError {
    return classify_workbuddy_error(httpStatus, body);
  }
}
