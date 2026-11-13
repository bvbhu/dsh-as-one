/**
 * 本机登录态自动发现(「自动发现并接入」)—— 镜像 Nexus connectors 的
 * ``discover_local_accounts`` 语义,完全容错:任何候选缺失 / 未登录 / 损坏 /
 * 未知加密都跳过,绝不抛错(失败只意味着这条来源没扫到)。
 *
 * 覆盖矩阵(Nexus 参照,``grep discover`` 确认):
 * - trae:CLI token 文件(``~/.trae-cn/trae-jwt-token``、``~/.trae/trae-jwt-token``)
 *   + 桌面版 ``User/globalStorage/storage.json``(Trae CN / Trae / TRAE SOLO CN /
 *   TRAE SOLO 四个 edition,密文为 "tc" AES-CBC,解密复用 trae.ts 的
 *   ``decrypt_storage_value``,不重写)。
 * - workbuddy:**Nexus 没有** discover_local_accounts(仅 trae.py 有),
 *   As One 亦不伪造 —— 恒返回 ``[]``,由装配层给出文案。
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  AUTH_STORAGE_KEY,
  DEVICE_CENTER_PREFIX,
  decrypt_storage_value,
  normalize_region,
} from "./trae.js";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 发现来源。 */
export type DiscoverSource = "cli" | "desktop" | "credentials";

/**
 * 一条被发现的账号态(镜像 Nexus ``discover_local_accounts`` 返回的 dict 项)。
 * ``token`` 为原始登录令牌(调用方展示时必须脱敏;adopt 用同一对象回传)。
 */
export interface DiscoveredAccount {
  provider: "trae";
  /** 展示/入池用账号名(优先 account.username,回退 user_id / 固定名)。 */
  username: string;
  /** 登录令牌(JWT / AccessToken);CLI/desktop 来源必有,credentials 来源二者取其强。 */
  token: string | null;
  /** 区域归一(trae: cn/ai)。 */
  region: string | null;
  source: DiscoverSource;
  /** 一句话来源说明(渲染层逐行 hint,如「来源:CLI token 文件(cn)」)。 */
  hint: string;
  /** trae: edition(cn/sg/solo/solo-sg)。 */
  edition?: string | null;
  /** trae: JWT payload data.user_id / storage userId。 */
  user_id?: string | null;
  /** epoch 毫秒;未知为 null。 */
  token_expires_at_ms?: number | null;
  host?: string | null;
  /** 其余身份/请求字段(调用方按需透传,adopt 可写入 vault raw)。 */
  extra?: Record<string, unknown>;
}

export interface TraeDiscoverOptions {
  /** 手工指定 home(测试用);默认 os.homedir()。 */
  home?: string;
  /** 手工指定平台(测试用);默认 os.platform()。 */
  platformName?: string;
  /** 是否扫桌面版 storage.json;默认 true。 */
  desktop?: boolean;
  /** 是否扫 CLI token 文件;默认 true。 */
  cli?: boolean;
}

/** Nexus trae.py ``_cli_candidates``:CLI token 文件候选。 */
export function traeCliCandidates(home?: string): Array<{ edition: string; path: string }> {
  const h = home ?? homedir() ?? "";
  return [
    { edition: "cn", path: join(h, ".trae-cn", "trae-jwt-token") },
    { edition: "sg", path: join(h, ".trae", "trae-jwt-token") },
  ];
}

/** Nexus trae.py ``_desktop_candidates`` 的 edition → 应用名表。 */
export const TRAE_DESKTOP_EDITION_NAMES: Record<string, string[]> = {
  cn: ["Trae CN", "trae-cn"],
  sg: ["Trae"],
  solo: ["TRAE SOLO CN", "trae-solo-cn"],
  "solo-sg": ["TRAE SOLO"],
};

/** Nexus trae.py ``_desktop_candidates``:平台根目录。 */
export function traeDesktopRoot(platformName: string = platform()): string | null {
  switch (platformName) {
    case "win32": {
      const appdata = process.env.APPDATA?.trim() || "";
      if (appdata) return appdata;
      const h = homedir() || "";
      return h ? join(h, "AppData", "Roaming") : null;
    }
    case "darwin": {
      const h = homedir() || "";
      return h ? join(h, "Library", "Application Support") : null;
    }
    case "linux": {
      const xdg = process.env.XDG_CONFIG_HOME?.trim() || "";
      if (xdg) return xdg;
      const h = homedir() || "";
      return h ? join(h, ".config") : null;
    }
    default:
      return null;
  }
}

/** Nexus trae.py ``_desktop_candidates``:4 个 edition × 应用名的 storage.json 候选。 */
export function traeDesktopCandidates(
  home?: string,
  platformName: string = platform(),
): Array<{ edition: string; path: string }> {
  const root = home ?? traeDesktopRoot(platformName);
  if (!root) return [];
  const out: Array<{ edition: string; path: string }> = [];
  for (const [edition, names] of Object.entries(TRAE_DESKTOP_EDITION_NAMES)) {
    for (const name of names) {
      out.push({ edition, path: join(root, name, "User", "globalStorage", "storage.json") });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// trae:storage.json 解析(镜像 _parse_desktop_storage + _normalize_credential)
// ---------------------------------------------------------------------------

/** 从任意可空 userRegion(对象 .region / 字符串)取归一区域。 */
function userRegionOf(value: unknown): string | null {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object" && "region" in value) {
    const r = (value as { region?: unknown }).region;
    if (typeof r === "string") return r.toLowerCase();
  }
  return null;
}

/**
 * Nexus trae.py ``region_of_credential``:
 * userRegion > host 域名 > edition 默认(国际 edition → ai,其余 → cn)。
 */
export function traeRegionOf(
  credential: { userRegion?: unknown; host?: string | null },
  edition?: string,
): string {
  const ur = userRegionOf(credential.userRegion);
  if (ur) return normalize_region(ur);
  const host = credential.host ?? null;
  if (host && typeof host === "string") {
    if (host.includes(".trae.ai")) return "ai";
    if (host.includes(".trae.cn") || host.includes(".trae.com.cn")) return "cn";
  }
  return edition === "sg" || edition === "solo-sg" ? "ai" : "cn";
}

/** host → 裸域名(展示用)。 */
export function hostDomainOf(host: string | null | undefined): string | null {
  if (!host || typeof host !== "string") return null;
  const bare = host.replace(/^[a-z]+:\/\//i, "").split("/")[0].split("?")[0];
  return bare || null;
}

/** 秒 → 毫秒(>=1e11 视为已是毫秒)。 */
export function toEpochMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value >= 1e11 ? value : value * 1000;
}

/**
 * 解析桌面版 storage.json(明文 JSON auth 条目或 "tc" AES 密文)。
 * 形状不符抛错(由调用方逐候选容错跳过)。
 */
export function parseTraeDesktopStorage(path: string, edition: string): DiscoveredAccount {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`storage.json 不可读: ${path}`);
  }
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`storage.json 非 JSON: ${path}`);
  }
  const rawAuth = root[AUTH_STORAGE_KEY];
  if (typeof rawAuth !== "string" || !rawAuth.trim()) {
    throw new Error(`storage.json 未登录:无 ${AUTH_STORAGE_KEY} 条目`);
  }
  let credJson: string;
  if (rawAuth.trimStart().startsWith("{")) {
    credJson = rawAuth; // 明文 JSON 形态
  } else {
    credJson = decrypt_storage_value(rawAuth); // "tc" AES 密文;坏值抛 UpstreamError
  }
  let cred: Record<string, unknown>;
  try {
    cred = JSON.parse(credJson) as Record<string, unknown>;
  } catch {
    throw new Error(`storage.json auth 条目非 JSON: ${path}`);
  }
  const token =
    typeof cred.token === "string" && cred.token
      ? cred.token
      : typeof cred.accessToken === "string" && cred.accessToken
        ? cred.accessToken
        : null;
  if (!token) throw new Error(`storage.json 未登录:无 token`);
  const account = cred.account as { username?: unknown } | null | undefined;
  const username =
    account && typeof account === "object" && typeof account.username === "string"
      ? account.username
      : null;
  const user_id = typeof cred.userId === "string" ? cred.userId : null;
  const host = typeof cred.host === "string" ? cred.host : null;
  const refresh_token = typeof cred.refreshToken === "string" ? cred.refreshToken : null;
  const region = traeRegionOf({ userRegion: cred.userRegion, host }, edition);
  const token_expires_at_ms = toEpochMs(
    typeof cred.expiredAt === "number"
      ? cred.expiredAt
      : typeof cred.expiredAt === "string" && cred.expiredAt
        ? Date.parse(cred.expiredAt)
        : cred.expiresAt,
  );

  // device_id:DEVICE_CENTER_PREFIX 键的剩余部分(键名后缀才是 id,键值是密文);
  // 回退 telemetry.devDeviceId / machineId。
  let device_id: string | null = null;
  let machine_id: string | null = null;
  for (const [k, v] of Object.entries(root)) {
    if (k.startsWith(DEVICE_CENTER_PREFIX) && typeof v === "string") {
      device_id = k.slice(DEVICE_CENTER_PREFIX.length);
      break;
    }
  }
  const telemetry = root.telemetry as Record<string, unknown> | null | undefined;
  if (telemetry && typeof telemetry === "object") {
    if (!device_id && typeof telemetry.devDeviceId === "string") {
      device_id = telemetry.devDeviceId;
    }
    if (typeof telemetry.machineId === "string") {
      machine_id = telemetry.machineId;
    }
  }

  const domain = hostDomainOf(host);
  const hintParts = [`来源:桌面版 storage.json(${edition})`];
  if (host) hintParts.push(`host ${host}`);
  if (domain) hintParts.push(domain);
  return {
    provider: "trae",
    username: username ?? user_id ?? "trae-desktop",
    token,
    region,
    source: "desktop",
    edition,
    hint: hintParts.join("; "),
    user_id: user_id ?? null,
    token_expires_at_ms,
    host: host ?? null,
    extra: {
      refresh_token,
      device_id,
      machine_id,
      host,
      domain,
      last_refresh: null,
    },
  };
}

// ---------------------------------------------------------------------------
// trae:CLI token 解析(镜像 _parse_cli_token)
// ---------------------------------------------------------------------------

function base64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64urlDecode(parts[1])) as Record<string, unknown>;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

/**
 * 解析 CLI token 文件(裸 JWT 或 JSON 信封取 token/accessToken/jwt)。
 * 必须为 3 段 JWT 且 payload 带 ``data.user_id``,否则抛错。
 */
export function parseTraeCliToken(path: string, edition: string): DiscoveredAccount {
  let text: string;
  try {
    text = readFileSync(path, "utf8").trim();
  } catch {
    throw new Error(`token 文件不可读: ${path}`);
  }
  if (!text) throw new Error(`token 文件为空: ${path}`);
  let token = text;
  if (text.startsWith("{")) {
    try {
      const env = JSON.parse(text) as Record<string, unknown>;
      const t =
        typeof env.token === "string"
          ? env.token
          : typeof env.accessToken === "string"
            ? env.accessToken
            : typeof env.jwt === "string"
              ? env.jwt
              : null;
      if (t) token = t;
    } catch {
      // 非 JSON 信封:按裸 JWT 继续。
    }
  }
  const payload = parseJwtPayload(token);
  if (!payload) throw new Error(`token 非 3 段 JWT: ${path}`);
  const data = payload.data as { user_id?: unknown } | null | undefined;
  const user_id =
    data && typeof data === "object" && typeof data.user_id === "string" ? data.user_id : null;
  if (!user_id) throw new Error(`JWT 无 data.user_id: ${path}`);
  // Nexus:CLI token 的 host 固定 api.trae.cn → region 走 host 规则 = cn。
  const host = "https://api.trae.cn";
  return {
    provider: "trae",
    username: user_id,
    token,
    region: traeRegionOf({ host }, edition),
    source: "cli",
    edition,
    hint: `来源:CLI token 文件(${edition})`,
    user_id,
    token_expires_at_ms: toEpochMs(payload.exp),
    host,
    extra: { host, last_refresh: null },
  };
}

// ---------------------------------------------------------------------------
// trae:汇总扫描(镜像 discover_local_accounts,完全容错 + 去重)
// ---------------------------------------------------------------------------

function hashToken(token: string | null): string {
  if (!token) return "null";
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

/**
 * 扫描 trae 本机登录态。任何候选损坏都单独跳过;同 (edition, user_id|token哈希)
 * 去重(镜像 Nexus 的 ``edition\0(user_id or sha256(token)[:12])``)。
 */
export function discoverTraeAccounts(options: TraeDiscoverOptions = {}): DiscoveredAccount[] {
  const out: DiscoveredAccount[] = [];
  const seen = new Set<string>();
  const push = (acc: DiscoveredAccount | null | undefined): void => {
    if (!acc) return;
    const key = `${acc.source}\0${acc.edition ?? ""}\0${acc.user_id ?? hashToken(acc.token)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(acc);
  };
  // 桌面版优先(镜像 Nexus discover_local_accounts:candidates = desktop + cli,
  // desktop 在前) —— 且去重键必须是「edition + 来源 + user_id」三要素:
  // CN 版桌面 storage 与 CLI token 同 user_id 同 edition,只按 edition\0user_id
  // 去重会让先扫到的 cli 挡掉 desktop(桌面版 token 才是计费/签到认的)。
  if (options.desktop !== false) {
    for (const { edition, path } of traeDesktopCandidates(options.home, options.platformName)) {
      if (!existsSync(path)) continue;
      try {
        push(parseTraeDesktopStorage(path, edition));
      } catch {
        // 损坏/未登录/未知加密:跳过该来源。
      }
    }
  }
  if (options.cli !== false) {
    for (const { edition, path } of traeCliCandidates(options.home)) {
      if (!existsSync(path)) continue;
      try {
        push(parseTraeCliToken(path, edition));
      } catch {
        // 损坏/未登录:跳过该来源。
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// workbuddy:Nexus 无 discover
// ---------------------------------------------------------------------------

/**
 * Nexus connectors/workbuddy.py **没有** discover_local_accounts(grep 确认,仅
 * trae.py 有)。As One 不伪造 —— 恒返回 [](
 * 装配层据此给「无此渠道自动发现」文案)。
 */
export function discoverWorkbuddyAccounts(): DiscoveredAccount[] {
  return [];
}