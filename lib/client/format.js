/**
 * 数值展示格式化(面板共用;口径与 apps/electron renderer 一致)。
 *
 * 指标表里 TPM / Token 这类计数跨度极大(几十到几十亿),统一压缩到 K/M/B
 * 量级,既保住信息又不把列撑宽。全部为纯函数,便于单测。
 */
/** 单位阶梯:达到 10³ 的倍数即换挡(与常见监控面板口径一致)。 */
const UNITS = [
    { base: 1_000_000_000, suffix: "B" },
    { base: 1_000_000, suffix: "M" },
    { base: 1_000, suffix: "K" },
];
/**
 * 大数压缩:1 / 12 / 120 → 原样;1200 → "1.2K";12100 → "12.1K";
 * 1_200_000 → "1.2M";3_200_000_000 → "3.2B"。能整就整,否则留一位小数。
 * null/undefined 表示没有样本,统一 "N/A"。
 */
export function fmtCount(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v)))
        return "N/A";
    const n = Number(v);
    const abs = Math.abs(n);
    for (const { base, suffix } of UNITS) {
        if (abs >= base) {
            const scaled = n / base;
            const s = Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
            return s.replace(/\.0$/, "") + suffix;
        }
    }
    return String(Math.round(n));
}
/** 毫秒 → 秒(一位小数)。TTFT/耗时用秒读起来更自然。 */
export function fmtSecFromMs(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v)))
        return "N/A";
    return (Number(v) / 1000).toFixed(1);
}
/** 速率类取整数即可(TPS 的小数位没有信息量)。 */
export function fmtInt(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v)))
        return "N/A";
    return String(Math.round(Number(v)));
}
/** 比率(0..1)→ 百分比(一位小数);无样本 N/A。 */
export function fmtPct(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v)))
        return "N/A";
    return (Number(v) * 100).toFixed(1) + "%";
}
/**
 * 时长(秒)→ 人类可读,阶梯:≥1h → "1h 30m";≥1m → "2m 5s";不足 1 分 → "45s"。
 * 运行时长、冷却剩余、finished_s_ago 统一走这里;null/undefined → "—"。
 */
export function fmtDuration(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v)))
        return "—";
    const s = Math.max(0, Math.floor(Number(v)));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0)
        return `${h}h ${m}m`;
    if (m > 0)
        return `${m}m ${sec}s`;
    return `${sec}s`;
}
/** 字节数 → 人类可读(B/KB/MB/GB,一位小数,整数不带小数)。 */
export function fmtBytes(v) {
    if (v === null || v === undefined || !Number.isFinite(Number(v)))
        return "N/A";
    let n = Number(v);
    if (n < 1024)
        return `${n} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let i = -1;
    do {
        n /= 1024;
        i += 1;
    } while (n >= 1024 && i < units.length - 1);
    const s = n >= 100 ? n.toFixed(0) : n.toFixed(1);
    return `${s} ${units[i]}`;
}
//# sourceMappingURL=format.js.map