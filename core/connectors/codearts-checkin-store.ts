/**
 * CodeArts 签到时间持久化（写进 credential.raw_json）。
 *
 * ## 为什么存在（2026-11 用户定案）
 * 签到积分只有 24 小时，claim/confirm 响应里 `expireAt = claimedAt + 1d`
 * **只在领取那一刻出现过一次**，之后没有任何逐笔查询端点能再读到
 * （见 codearts-ide.ts 头部「到期事实」）。
 *
 * 额度探针 `/package/overview` 只给「expiring_credit_amount = 即将作废多少分」，
 * 没有绝对时间 —— 旧代码只能用 `fetchedAt + 24h` 粗估，误差可达一整天。
 * 把签到时刻记下来，就能从**真实领取时刻**算到期，而不是从查询时刻算。
 *
 * ## 存哪里
 * 存进该 AK/SK 凭据行的 `raw_json.checkin` 子对象：
 * - 不污染 `credential.expires_at`（那一列是**凭据自身**过期时间，语义不同）；
 * - raw_json 本就是各 provider 附加字段的家，坏 JSON 已有安全解析兜底；
 * - 幂等覆盖：同一账号当天再签（already）只刷新记录，不追加。
 *
 * 键名用 `checkin`（而非 `codearts_checkin`）：这段 raw_json 只属于 codearts，
 * 不会和别的 provider 混。
 */
import type { AsOneDatabase } from "../db/database.js";

/** 签到记录（存进 raw_json.checkin）。时间单位 epoch 毫秒。 */
export interface CodeartsCheckinRecord {
  /** 实际领取（claim+confirm 成功）的时刻。 */
  claimed_at_ms: number;
  /**
   * 积分作废时刻。优先用上游 claim 响应里的 expireAt；没有则按 claimedAt + 24h。
   * 仍以毫秒存储（与 raw_json 里其它 *_ms 字段一致）。
   */
  expire_at_ms: number;
  /** 本次签到领到的积分（上游 benefitAmount）。 */
  credit: number;
  /** `YYYY-MM-DD`（Asia/Shanghai）；仅用于人读/排障，不参与计算。 */
  day: string;
}

const DAY_MS = 86_400_000;

/** 安全解析 raw_json（坏 JSON → 空对象，与 credentials.ts:parseRaw 同口径）。 */
function parseRaw(rawJson: string | null | undefined): Record<string, unknown> {
  if (rawJson === null || rawJson === undefined || rawJson.trim() === "") return {};
  try {
    const v: unknown = JSON.parse(rawJson);
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** 从 raw（已解析对象或 JSON 字符串）读签到记录；无/坏 → null。 */
export function readCodeartsCheckin(
  raw: Record<string, unknown> | string | null | undefined,
): CodeartsCheckinRecord | null {
  const obj = typeof raw === "string" ? parseRaw(raw) : (raw ?? {});
  const c = obj["checkin"];
  if (c === null || c === undefined || typeof c !== "object" || Array.isArray(c)) return null;
  const v = c as Record<string, unknown>;
  const claimed = Number(v["claimed_at_ms"]);
  const expire = Number(v["expire_at_ms"]);
  const credit = Number(v["credit"]);
  if (!Number.isFinite(claimed) || claimed <= 0) return null;
  // expire 缺失时按 claimed+24h 兜底（老记录可能没有 expire 字段）。
  const expireMs = Number.isFinite(expire) && expire > 0 ? expire : claimed + DAY_MS;
  return {
    claimed_at_ms: claimed,
    expire_at_ms: expireMs,
    credit: Number.isFinite(credit) && credit > 0 ? credit : 0,
    day: typeof v["day"] === "string" ? v["day"] : "",
  };
}

/**
 * 签到成功后写记录到凭据行（幂等覆盖）。
 *
 * @param db 面板 context 的数据库
 * @param username 凭据用户名（provider 恒为 codearts）
 * @param rec 本次签到信息；`expireAtMs` 传上游 claim 响应里的绝对值（毫秒/秒均可
 *            —— 用 1e11 阈值判断），没有则留空按 claimedAt + 24h 推。
 */
export function markCodeartsCheckin(
  db: AsOneDatabase,
  username: string,
  input: {
    claimedAtMs?: number;
    expireAtMs?: number | null;
    credit: number;
    day?: string;
  },
): CodeartsCheckinRecord {
  const row = db.credential.get("codearts", username);
  if (row === null || row === undefined) throw new Error(`codearts 凭据不存在: ${username}`);
  const raw = parseRaw(row.raw_json);
  const claimedAtMs = input.claimedAtMs ?? Date.now();
  // 上游 expireAt 可能是秒(10 位)或毫秒(13 位)，与 quota.ts 同阈值判断。
  const rawExpire = input.expireAtMs ?? null;
  const expireAtMs =
    rawExpire !== null && Number.isFinite(rawExpire) && rawExpire > 0
      ? rawExpire < 1e11
        ? Math.round(rawExpire * 1000)
        : Math.round(rawExpire)
      : claimedAtMs + DAY_MS;
  const rec: CodeartsCheckinRecord = {
    claimed_at_ms: claimedAtMs,
    expire_at_ms: expireAtMs,
    credit: Math.max(0, Math.round(input.credit)),
    day:
      input.day ??
      new Date(claimedAtMs).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }),
  };
  raw["checkin"] = rec;
  db.credential.update({ provider: "codearts", username, raw_json: JSON.stringify(raw) });
  return rec;
}
