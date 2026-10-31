/**
 * 数值展示格式化(面板共用;口径与 apps/electron renderer 一致)。
 *
 * 指标表里 TPM / Token 这类计数跨度极大(几十到几十亿),统一压缩到 K/M/B
 * 量级,既保住信息又不把列撑宽。全部为纯函数,便于单测。
 */
/**
 * 大数压缩:1 / 12 / 120 → 原样;1200 → "1.2K";12100 → "12.1K";
 * 1_200_000 → "1.2M";3_200_000_000 → "3.2B"。能整就整,否则留一位小数。
 * null/undefined 表示没有样本,统一 "N/A"。
 */
export declare function fmtCount(v: number | null | undefined): string;
/** 毫秒 → 秒(一位小数)。TTFT/耗时用秒读起来更自然。 */
export declare function fmtSecFromMs(v: number | null | undefined): string;
/** 速率类取整数即可(TPS 的小数位没有信息量)。 */
export declare function fmtInt(v: number | null | undefined): string;
/** 比率(0..1)→ 百分比(一位小数);无样本 N/A。 */
export declare function fmtPct(v: number | null | undefined): string;
/**
 * 时长(秒)→ 人类可读,阶梯:≥1h → "1h 30m";≥1m → "2m 5s";不足 1 分 → "45s"。
 * 运行时长、冷却剩余、finished_s_ago 统一走这里;null/undefined → "—"。
 */
export declare function fmtDuration(v: number | null | undefined): string;
/** 字节数 → 人类可读(B/KB/MB/GB,一位小数,整数不带小数)。 */
export declare function fmtBytes(v: number | null | undefined): string;
