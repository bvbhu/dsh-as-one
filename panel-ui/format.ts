/**
 * 格式化辅助(与 Nexus panel/web/src/format.ts 对齐;只允许改 CSS,数值口径不动)。
 */

/** 数量缩写:1e9→"B"、1e6→"M"、1e3→"K";null → "N/A"。 */
export function fmtCount(v: number | null): string {
  const UNITS: Array<[number, string]> = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  if (v === null || v === undefined) return "N/A";
  for (const [base, suffix] of UNITS) {
    if (Math.abs(v!) >= base) {
      const scaled = v! / base;
      const s = (Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)).replace(/\.0$/, "");
      return `${s}${suffix}`;
    }
  }
  return String(v);
}

/** epoch 毫秒差 → 秒,保留 1 位小数。 */
export function fmtSecFromMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return (ms / 1000).toFixed(1);
}

/** 整数(四舍五入)。 */
export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(Math.round(v));
}

/** 比率(0..1)→ 百分数(1 位小数)。 */
export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

/** 秒 → 人类时长:≥3600 "Xh Ym";≥60 "Xm Ys";否则 "Xs";null → "—"。 */
export function fmtDuration(s: number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m ${sec}s`;
  return `${sec}s`;
}
