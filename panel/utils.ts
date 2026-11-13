/**
 * 装配层模块级纯工具 —— 从 assembly.ts 拆出。
 *
 * 内容:日期/区间(dayAdd / rangeDays / monthAxis / fmtDay / todayLocal / clampDay),数字(pad2 / round1 / pct),文件行数统计(countJsonlLines),密钥指纹(fpOf),凭据引用拆分(splitRef),逻辑模型成员解析(parseDbMembers / membersFromInput)。
 *
 * 谁在用:assembly.ts 的面板闭包(统计页 / 逻辑模型页 / 客户端路径页)。
 * 契约:只 import;纯函数,不摸 DB / 配置 / 网络。
 */

import { closeSync, openSync, readSync } from "node:fs";

import { splitModelId } from "@as-one/core/src/scheduler/engine.js";
import type { LogicalModelsWriteInput } from "./types.js";

// ── 纯工具(模块级) ────────────────────────────────────────────────────────

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 数 JSONL 日志文件的**条目数**(= 非空物理行数)。
 *
 * ⚠️ D20:逐请求明细不入库,只按天写 `logs/requests-YYYYMMDD.jsonl` ——
 * 面板「已写 N 条」只能从文件数,库里没有这个数(stats_daily 是按天聚合的)。
 *
 * 逐字节扫换行、不按行 JSON.parse:①快(13MB 也就几毫秒);②不会数错 ——
 * 正文里的真换行经 JSON.stringify 会转义成 `\n` 两个字符,不会真断行。
 */
export function countJsonlLines(path: string): number {
  const fd = openSync(path, "r");
  try {
    const chunk = Buffer.alloc(1 << 20);
    let count = 0;
    let pending = false; // 当前这一行有内容吗
    for (;;) {
      const read = readSync(fd, chunk, 0, chunk.length, null);
      if (read <= 0) break;
      for (let i = 0; i < read; i += 1) {
        if (chunk[i] === 0x0a) {
          if (pending) count += 1;
          pending = false;
        } else {
          pending = true;
        }
      }
    }
    if (pending) count += 1; // 末行没带换行
    return count;
  } finally {
    closeSync(fd);
  }
}

/** localtime "YYYY-MM-DD"。 */
export function fmtDay(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayLocal(): string {
  return fmtDay(new Date());
}

/** "YYYY-MM-DD" 加 delta 天(本地历法,避开 DST 用日期构造器)。 */
export function dayAdd(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return fmtDay(new Date(y, m - 1, d + delta));
}

/** 把区间左端夹到 `first`(不早于库内首日);`first` 为 null(空库)时原样返回。 */
export function clampDay(day: string, first: string | null): string {
  if (first === null) return day;
  return day < first ? first : day;
}

/** 从 from 到 to(含两端)的逐日键;防跑飞上限 3660 天。 */
export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  while (d <= to && out.length < 3660) {
    out.push(d);
    d = dayAdd(d, 1);
  }
  return out;
}

/** from..to 的逐月键("YYYY-MM")。 */
export function monthAxis(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${String(y).padStart(4, "0")}-${pad2(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** 百分比(**0..1**,保留 4 位;Nexus `_pct` 口径);total<=0 → null。
 *
 * ⚠️ 单位是 0..1 不是 0..100:前端 `fmtPct` 会再 ×100。以前这里返回 0..100,
 * 于是排名榜/环形图/子行百分比全部放大 100 倍(25% 显示成 2500.0%)。 */
export function pct(part: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.round((part / total) * 1e4) / 1e4;
}

/** 密钥指纹提示(前 8 字符;null → null)。 */
export function fpOf(secret: string | null | undefined): string | null {
  if (secret === null || secret === undefined || secret === "") return null;
  return secret.length > 8 ? `${secret.slice(0, 8)}…` : secret;
}

export function splitRef(credentialRef: string): [string, string] {
  const idx = credentialRef.indexOf("/");
  return idx > 0
    ? [credentialRef.slice(0, idx), credentialRef.slice(idx + 1)]
    : [credentialRef, ""];
}

/** 逻辑模型 members 的 JSON 数组 → 成员对(兼容 {provider,model} 对象与 "p/m" 串)。 */
export function parseDbMembers(raw: string | null | undefined): Array<{ provider: string; model: string }> {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: Array<{ provider: string; model: string }> = [];
    for (const item of arr) {
      if (typeof item === "string") {
        const pair = splitModelId(item);
        if (pair) out.push({ provider: pair[0], model: pair[1] });
      } else if (item !== null && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const p = o.provider;
        const m = o.model;
        if (typeof p === "string" && typeof m === "string" && p !== "" && m !== "") {
          out.push({ provider: p, model: m });
        } else if (typeof o.real_model_id === "string") {
          const pair = splitModelId(o.real_model_id);
          if (pair) out.push({ provider: pair[0], model: pair[1] });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** 写接口的 members/deployments/strategy_groups/fallbacks → 去重成员对。 */
export function membersFromInput(input: LogicalModelsWriteInput): Array<{ provider: string; model: string }> {
  const out: Array<{ provider: string; model: string }> = [];
  const seen = new Set<string>();
  const add = (id: string): void => {
    const at = id.indexOf("@");
    const real = at > 0 ? id.slice(0, at) : id;
    const pair = splitModelId(real);
    if (!pair) return;
    const key = `${pair[0]}/${pair[1]}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ provider: pair[0], model: pair[1] });
  };
  for (const m of input.members ?? []) add(String(m));
  for (const d of input.deployments ?? []) add(String(d));
  for (const g of input.strategy_groups ?? []) {
    for (const m of g?.members ?? []) add(String(m));
  }
  for (const f of input.fallbacks ?? []) add(String(f));
  return out;
}
