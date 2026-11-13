/**
 * 用量统计频道(1:1 移植 Nexus 面板 /nexus/usage → UsageStats.vue)。
 *
 * 一份 `/metrics/history` 响应喂整页:范围/粒度/分组三档控件 + 刷新 →
 * 5 张 KPI 卡 → 堆叠柱状趋势(叠加缓存命中率折线,悬浮卡)→ 模型用量
 * (环形图 + 排名)→ 各供应商用量(环形图 + 排名)→ 页脚日期。图表全部
 * SVG 手绘(照 Nexus),不引入任何 npm 依赖。
 *
 * 数据契约:rendererApi.getUsageHistory(range, granularity, group) →
 * UsageHistory(见 src/renderer/src/api.ts)。响应里的比率一律 0..1,分母为
 * 0 时是 null —— 没有样本显示「—」,不显示 0%。
 *
 * ⚠️ SVG 必须显式给 width/height(只写 viewBox 会被浏览器拉满整屏);宽度由
 * ResizeObserver 给实测值,环形图尺寸与柱宽都吃实测宽度。
 */
import React from "react";
import { rendererApi } from "../api";
import type {
  UsageGranularity,
  UsageGroup,
  UsageHistory,
  UsageProvider,
  UsageRange,
  UsageSeries,
} from "../api";
import { fmtCount, fmtPct } from "../format";

/** 时间范围:默认「全部」(从库里有数据的第一天起),其余是常规档。 */
const RANGES: Array<{ key: UsageRange; label: string }> = [
  { key: "all", label: "全部" },
  { key: "7", label: "最近 7 天" },
  { key: "30", label: "最近 30 天" },
  { key: "90", label: "最近 90 天" },
  { key: "365", label: "最近 365 天" },
];

/** 参考插件的调色板:名次序即色序;「其他」永远是那格灰。 */
const MODEL_COLORS = [
  "#0576ff",
  "#2f6f37",
  "#c46212",
  "#975bf1",
  "#d34591",
  "#0d8a8a",
  "#b3341f",
  "#7a9018",
  "#4b3fd0",
  "#d4a017",
];
const PROVIDER_COLORS = ["#1f7a8c", "#6a8e3a", "#a15c2f", "#7b5ea7", "#b03a5b"];
const OTHER_COLOR = "#576270";
const LINE_COLOR = "#4d6bfe";

/** 趋势图几何(照参考实现;plotH=184)。 */
const GEO = { w: 720, h: 220, padL: 46, padR: 65, padB: 26, padT: 10 };
const PLOT_H = GEO.h - GEO.padT - GEO.padB;
const MIN_PITCH = 4;

/** 千分位全量数字(排名榜与 KPI 卡用;紧凑单位只留给坐标轴与提示)。 */
function full(v: number | null | undefined): string {
  return v == null ? "N/A" : Math.round(v).toLocaleString("en-US");
}

/** 比率 0..1 → 百分数;null(无样本)给「—」。 */
function rateText(r: number | null | undefined): string {
  return r == null ? "—" : fmtPct(r);
}

/** 图例 / 提示里的序列名:按模型时是 `provider/model`(照参考面板)。 */
function seriesLabel(s: UsageSeries, group: UsageGroup): string {
  return group === "logical" || !s.provider ? s.name : `${s.provider}/${s.name}`;
}

/** 序列取色:索引对齐 series 数组次序;「其他」恒为灰。 */
function seriesColor(s: UsageSeries, list: UsageSeries[]): string {
  if (s.is_other) return OTHER_COLOR;
  const i = list.findIndex((x) => x.key === s.key);
  return MODEL_COLORS[Math.max(0, i) % MODEL_COLORS.length];
}

function providerColor(p: UsageProvider, i: number): string {
  return p.is_other ? OTHER_COLOR : PROVIDER_COLORS[i % PROVIDER_COLORS.length];
}

/** 排名榜第一行的名字 / 副行。 */
function rowMain(s: UsageSeries): string {
  return s.name;
}

/** 纵轴刻度:nice 化,不标 0(0 的刻度线只是贴着底边的一条线)。 */
function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = step; v <= max * 1.0000001; v += step) out.push(v);
  return out;
}

/** Catmull-Rom 桥接(命中率为 null 的那些桶不画点,但保留索引,折线跨过去)。 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)}`
      + ` ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/** 环形分段:percent 0..1 → 弧长,按累计 offset 排布(null = 无样本,按 0 处理)。 */
function segments<T extends { key: string; percent: number | null }>(
  rows: T[],
  colorOf: (row: T, i: number) => string,
  circ: number,
): Array<{ key: string; color: string; len: number; off: number }> {
  let acc = 0;
  return rows.map((row, i) => {
    const p = row.percent ?? 0;
    const len = Math.max(0, Math.min(1, p)) * circ;
    const seg = { key: row.key, color: colorOf(row, i), len, off: acc * circ };
    acc += p;
    return seg;
  });
}

export default function UsageStatsPage(): React.JSX.Element {
  const [range, setRange] = React.useState<UsageRange>("all");
  const [granularity, setGranularity] = React.useState<UsageGranularity>("day");
  const [group, setGroup] = React.useState<UsageGroup>("model");
  const [data, setData] = React.useState<UsageHistory | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  /** 展开状态:模型榜 = `m:<key>`;供应商行 = `p:<key>`。 */
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [chartW, setChartW] = React.useState(GEO.w);
  const [donutW, setDonutW] = React.useState(760);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const [tipW, setTipW] = React.useState(0);

  const chartEl = React.useRef<HTMLDivElement | null>(null);
  const donutEl = React.useRef<HTMLDivElement | null>(null);
  const tipEl = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await rendererApi.getUsageHistory(range, granularity, group);
      setData(r);
      setExpanded({});
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range, granularity, group]);

  //: 三档控件任一变化即重新加载(照 Nexus watch([range, granularity, group]))。
  React.useEffect(() => {
    void load();
  }, [load]);

  const toggle = React.useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ---- 顶栏 KPI -----------------------------------------------------------
  const totals = data?.totals ?? null;
  const top = data?.top ?? null;
  const totalTokens = totals?.tokens ?? 0;
  const hasData = totalTokens > 0;
  const trendTitle = granularity === "month" ? "按月 Token 趋势" : "按天 Token 趋势";
  const rangeText = data ? `${data.from} → ${data.to}` : "";

  const rowSub = (s: UsageSeries): string => {
    if (s.provider) return s.provider;
    return group === "logical" && !s.is_other ? "逻辑模型" : "";
  };

  // ---- 趋势图 -------------------------------------------------------------
  const chart = React.useMemo(() => {
    const all = data?.buckets ?? [];
    const series = data?.series ?? [];
    const inner = Math.max(40, chartW - GEO.padL - GEO.padR);
    // 柱子挤到看不清时裁掉**最旧**的桶(不滚动),页面上如实说明裁了多少。
    const maxBars = Math.max(1, Math.floor(inner / MIN_PITCH) + 1);
    const hidden = Math.max(0, all.length - maxBars);
    const bs = hidden ? all.slice(hidden) : all;
    const n = bs.length;
    const pitch = n > 1 ? inner / (n - 1) : inner;
    const barW = Math.max(3, Math.min(30, pitch * 0.62));
    const xOf = (i: number) => (n > 1 ? GEO.padL + i * pitch : GEO.padL + inner / 2);
    const bottom = GEO.padT + PLOT_H;
    const maxTotal = bs.reduce((m, b) => Math.max(m, b.tokens), 0);

    //: As One 契约的 by_series 是数组 [{key, tokens}],转 Map 供按序列取值。
    const bars: Array<{ key: string; x: number; y: number; w: number; h: number; color: string }> = [];
    bs.forEach((b, i) => {
      const by = new Map(b.by_series.map((e) => [e.key, e.tokens] as const));
      let yb = bottom;
      for (const s of series) {
        const t = by.get(s.key) ?? 0;
        if (t <= 0) continue; // 没有用量的段不画(也不占高度)
        const h = maxTotal > 0 ? (t / maxTotal) * PLOT_H : 0;
        yb -= h;
        bars.push({
          key: `${b.key}|${s.key}`,
          x: xOf(i) - barW / 2,
          y: yb,
          w: barW,
          h,
          color: seriesColor(s, series),
        });
      }
    });

    const pts = bs
      .map((b, i) => (b.cache_hit_rate == null ? null : { x: xOf(i), y: bottom - b.cache_hit_rate * PLOT_H }))
      .filter((p): p is { x: number; y: number } => p !== null);

    const labels: Array<{ x: number; text: string }> = [];
    const want = Math.min(8, n);
    const seen = new Set<number>();
    for (let k = 0; k < want; k++) {
      const i = want > 1 ? Math.round(((n - 1) * k) / (want - 1)) : Math.max(0, n - 1);
      if (seen.has(i) || !bs[i]) continue;
      seen.add(i);
      labels.push({
        x: xOf(i),
        text: granularity === "month" ? bs[i].key : bs[i].key.slice(5),
      });
    }

    return {
      bs,
      n,
      pitch,
      barW,
      xOf,
      bottom,
      maxTotal,
      bars,
      path: smoothPath(pts),
      labels,
      ticksLeft: maxTotal > 0
        ? niceTicks(maxTotal, 4).map((v) => ({ v, y: bottom - (v / maxTotal) * PLOT_H, text: fmtCount(v) }))
        : [],
      // 右轴固定 0/25/50/75/100,只写百分比,不画网线。
      ticksRight: [0, 25, 50, 75, 100].map((p) => ({
        p,
        y: bottom - (p / 100) * PLOT_H,
        text: `${p}%`,
      })),
      hidden,
    };
  }, [data, chartW, granularity]);

  const hover = React.useMemo(() => {
    const i = hoverIdx;
    if (i == null || !data) return null;
    const b = chart.bs[i];
    if (!b) return null;
    const by = new Map(b.by_series.map((e) => [e.key, e.tokens] as const));
    const rows = data.series
      .map((s) => ({
        key: s.key,
        name: seriesLabel(s, group),
        color: seriesColor(s, data.series),
        tokens: by.get(s.key) ?? 0,
      }))
      .filter((r) => r.tokens > 0)
      .sort((a, c) => c.tokens - a.tokens);
    const x = chart.xOf(i);
    // 悬浮卡夹在 [half, chartW - half],中心永不越过图表容器左右边。
    const half = Math.max(85, (tipW || 170) / 2);
    return {
      key: b.key,
      tokens: b.tokens,
      requests: b.requests,
      rate: rateText(b.cache_hit_rate),
      rows: rows.slice(0, 6),
      more: Math.max(0, rows.length - 6),
      left: Math.min(Math.max(half, x), Math.max(half, chartW - half)),
    };
  }, [hoverIdx, data, chart, group, tipW, chartW]);

  // 悬浮卡只在 hover 变化后量一次宽度(宽度由内容决定,同一次 hover 内不变)。
  React.useEffect(() => {
    if (hoverIdx == null) {
      setTipW(0);
      return;
    }
    const el = tipEl.current;
    if (el) setTipW(el.offsetWidth);
  }, [hoverIdx]);

  // ---- 环形图 -------------------------------------------------------------
  //: 图表 DOM 在 data && hasData 之后才存在,effect 以 showCharts 为依赖,
  //: 首帧渲染落定后 refs 就位,ResizeObserver 才能绑上。
  const showCharts = data !== null && hasData;
  React.useEffect(() => {
    if (!showCharts) return;
    const ros: ResizeObserver[] = [];
    if (typeof ResizeObserver !== "undefined") {
      const bind = (el: HTMLDivElement | null, out: (w: number) => void) => {
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
          const w = entries[0]?.contentRect.width ?? 0;
          if (w > 0) out(Math.max(320, Math.round(w)));
        });
        ro.observe(el);
        ros.push(ro);
      };
      bind(chartEl.current, setChartW);
      bind(donutEl.current, setDonutW);
    }
    return () => {
      for (const ro of ros) ro.disconnect();
    };
  }, [showCharts]);

  /** 参考实现的尺寸公式:给右侧列表留 260px,环形图 200..280。 */
  const donutSize = React.useMemo(() => Math.max(200, Math.min(280, donutW - 16 - 260)), [donutW]);
  const ring = React.useMemo(() => {
    const s = donutSize;
    const sw = s * 0.15;
    const outer = s * 0.475;
    const r = outer - sw / 2;
    return { s, sw, r, c: s / 2, circ: 2 * Math.PI * r };
  }, [donutSize]);

  const modelSegs = React.useMemo(
    () => segments(data?.series ?? [], (s: UsageSeries, i: number) => seriesColor(s, data?.series ?? []), ring.circ),
    [data, ring.circ],
  );
  //: As One 契约的 UsageProvider 无 key 字段,这里用 provider 当环形图键。
  const providerSegs = React.useMemo(() => {
    const list = data?.providers ?? [];
    const rows = list.map((p, i) => ({ key: p.provider, percent: p.percent, idx: i }));
    return segments(rows, (r) => providerColor(list[r.idx], r.idx), ring.circ);
  }, [data, ring.circ]);
  const modelRingTotal = totalTokens;
  const providerRingTotal = React.useMemo(
    () => (data?.providers ?? []).reduce((m, p) => m + p.tokens, 0),
    [data],
  );

  return (
    <React.Fragment>
      <h1 className="page-title">用量统计</h1>

      <div className="usage-ctl">
        <div className="usage-seg" role="group" aria-label="时间范围">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={range === r.key ? "on" : ""}
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="usage-seg" role="group" aria-label="聚合">
          <button
            type="button"
            className={granularity === "day" ? "on" : ""}
            aria-pressed={granularity === "day"}
            onClick={() => setGranularity("day")}
          >
            按天
          </button>
          <button
            type="button"
            className={granularity === "month" ? "on" : ""}
            aria-pressed={granularity === "month"}
            onClick={() => setGranularity("month")}
          >
            按月
          </button>
        </div>
        <div className="usage-seg" role="group" aria-label="统计维度">
          <button
            type="button"
            className={group === "model" ? "on" : ""}
            aria-pressed={group === "model"}
            onClick={() => setGroup("model")}
          >
            按真实模型
          </button>
          <button
            type="button"
            className={group === "logical" ? "on" : ""}
            aria-pressed={group === "logical"}
            onClick={() => setGroup("logical")}
          >
            按逻辑模型
          </button>
        </div>
        <button type="button" className="usage-refresh" disabled={loading} onClick={() => void load()}>
          {loading ? "加载中…" : "刷新"}
        </button>
        {data ? (
          <span className="hint usage-ctl-info">
            {rangeText} · {data.axis.length} 个{granularity === "month" ? "月" : "天"}
          </span>
        ) : null}
      </div>

      {error ? <p className="err">{error}</p> : null}

      {data && hasData ? (
        <>
          <div className="usage-cards">
            <div className="usage-card">
              <div className="usage-card-k">Tokens 用量</div>
              <div className="usage-card-v">{full(totals?.tokens)}</div>
              <div className="usage-card-s">
                输入 {full(totals?.prompt_tokens)} · 输出 {full(totals?.completion_tokens)}
              </div>
            </div>
            <div className="usage-card">
              <div className="usage-card-k">请求数量</div>
              <div className="usage-card-v">{full(totals?.requests)}</div>
              <div className="usage-card-s">仅统计成功请求</div>
            </div>
            <div className="usage-card">
              <div className="usage-card-k">平均缓存命中</div>
              <div className="usage-card-v">{rateText(totals?.cache_hit_rate)}</div>
              <div className="usage-card-s">{fmtCount(totals?.cached_tokens ?? 0)} 缓存命中</div>
            </div>
            <div className="usage-card">
              <div className="usage-card-k">活跃天数</div>
              <div className="usage-card-v">{totals?.active_days ?? 0}</div>
              <div className="usage-card-s">
                区间 {data.axis.length} {granularity === "month" ? "个月" : "天"}
              </div>
            </div>
            <div className="usage-card">
              <div className="usage-card-k">{group === "logical" ? "最常用逻辑模型" : "最常用模型"}</div>
              <div className="usage-card-v usage-card-v-sm">{top?.name ?? "—"}</div>
              <div className="usage-card-s">
                {/* 按逻辑模型统计时,库中 logical_model 可能整列为 NULL ⇒ 全归「其他」,top 为 null */}
                {top ? top.provider ?? (group === "logical" ? "逻辑模型" : "") : "全部归「其他」"}
              </div>
            </div>
          </div>

          <section className="usage-sec">
            <h2>{trendTitle}</h2>
            <div ref={chartEl} className="usage-chart-wrap">
              <svg
                width="100%"
                height={GEO.h}
                viewBox={`0 0 ${chartW} ${GEO.h}`}
                className="usage-chart"
                onMouseLeave={() => setHoverIdx(null)}
              >
                {/* 左轴(tokens,紧凑单位)与右轴(命中率 %) */}
                {chart.ticksLeft.map((t) => (
                  <text key={`lt${t.v}`} className="axis-text" x={GEO.padL - 6} y={t.y + 3.5} textAnchor="end">
                    {t.text}
                  </text>
                ))}
                {chart.ticksRight.map((t) => (
                  <text
                    key={`rt${t.p}`}
                    className="axis-text axis-text-r"
                    x={GEO.padL + (chartW - GEO.padL - GEO.padR) + 6}
                    y={t.y + 3.5}
                  >
                    {t.text}
                  </text>
                ))}
                {chart.labels.map((l) => (
                  <text key={`lb${l.x}`} className="axis-text" x={l.x} y={GEO.padT + PLOT_H + 16} textAnchor="middle">
                    {l.text}
                  </text>
                ))}

                {/* 堆叠柱:段与段无缝、无圆角(照参考实现) */}
                {chart.bars.map((b) => (
                  <rect key={b.key} x={b.x} y={b.y} width={b.w} height={Math.max(0, b.h)} fill={b.color} className="usage-bar" />
                ))}

                {/* 缓存命中率折线(跨过没有样本的桶) */}
                {chart.path ? (
                  <path d={chart.path} fill="none" stroke={LINE_COLOR} strokeWidth={2} className="usage-line" />
                ) : null}

                {/* 整列透明命中区:负责 hover(柱子太窄时也能点中) */}
                {chart.bs.map((b, i) => (
                  <rect
                    key={`hit${b.key}`}
                    className="bar-hit"
                    x={chart.xOf(i) - Math.max(chart.barW, chart.pitch) / 2}
                    y={GEO.padT}
                    width={Math.max(chart.barW, chart.pitch)}
                    height={PLOT_H}
                    onMouseEnter={() => setHoverIdx(i)}
                  />
                ))}

                {hoverIdx != null && chart.bs[hoverIdx] && chart.bs[hoverIdx].cache_hit_rate != null ? (
                  <circle
                    cx={chart.xOf(hoverIdx)}
                    cy={chart.bottom - (chart.bs[hoverIdx].cache_hit_rate ?? 0) * PLOT_H}
                    r={4}
                    fill={LINE_COLOR}
                  />
                ) : null}
              </svg>

              {hover ? (
                <div ref={tipEl} className="usage-tip" style={{ left: `${hover.left}px` }}>
                  <div className="usage-tip-head">{hover.key}</div>
                  <div className="usage-tip-line"><span>总 Token</span><b>{full(hover.tokens)}</b></div>
                  <div className="usage-tip-line"><span>请求</span><b>{full(hover.requests)}</b></div>
                  <div className="usage-tip-line"><span>缓存命中率</span><b>{hover.rate}</b></div>
                  {hover.rows.length ? <div className="usage-tip-sep" /> : null}
                  {hover.rows.map((r) => (
                    <div key={r.key} className="usage-tip-line">
                      <span className="usage-tip-nm">
                        <i className="usage-dot sm" style={{ background: r.color }} />
                        {/* 模型名必须单行:nowrap + ellipsis,完整名放 title */}
                        <span className="usage-tip-nm-t" title={r.name}>{r.name}</span>
                      </span>
                      <b>{fmtCount(r.tokens)}</b>
                    </div>
                  ))}
                  {hover.more ? <div className="usage-tip-more">…另有 {hover.more} 个序列</div> : null}
                </div>
              ) : null}
            </div>

            <div className="usage-legend">
              {data.series.map((s) => (
                <span key={s.key} className="usage-legend-i">
                  <i className="usage-dot" style={{ background: seriesColor(s, data.series) }} />
                  {seriesLabel(s, group)}
                </span>
              ))}
              <span className="usage-legend-i">
                <i className="usage-line-sw" style={{ background: LINE_COLOR }} />
                缓存命中率
              </span>
            </div>
            {chart.hidden ? (
              <p className="hint">
                桶太密,只画最近 {chart.bs.length} 个(更早 {chart.hidden} 个没画入柱状图),可切「按月」看更长的跨度。
              </p>
            ) : null}
          </section>

          <section className="usage-sec">
            <h2>模型用量</h2>
            <div ref={donutEl} className="usage-split">
              <svg className="usage-donut" width={ring.s} height={ring.s} viewBox={`0 0 ${ring.s} ${ring.s}`}>
                <circle cx={ring.c} cy={ring.c} r={ring.r} fill="none" stroke="#22262e" strokeWidth={ring.sw} />
                {modelSegs.map((g) => (
                  <circle
                    key={g.key}
                    cx={ring.c}
                    cy={ring.c}
                    r={ring.r}
                    fill="none"
                    stroke={g.color}
                    strokeWidth={ring.sw}
                    strokeDasharray={`${g.len} ${ring.circ - g.len}`}
                    strokeDashoffset={-g.off}
                    transform={`rotate(-90 ${ring.c} ${ring.c})`}
                  />
                ))}
                <text x={ring.c} y={ring.c + ring.s * 0.04} className="usage-donut-v" textAnchor="middle">
                  {fmtCount(modelRingTotal)}
                </text>
                <text x={ring.c} y={ring.c + ring.s * 0.13} className="usage-donut-k" textAnchor="middle">
                  Tokens 用量
                </text>
              </svg>

              <ol className="usage-rank">
                {data.series.map((s, i) => {
                  // 「其他」行的明细在 folded(被折叠的序列);head 行的明细在 models。
                  const kids = s.is_other ? (s.folded ?? []) : s.models;
                  const kidKey = (m: (typeof kids)[number], j: number): string =>
                    m.key ?? `${m.provider ?? ""}/${m.name}:${j}`;
                  return (
                  <li key={s.key}>
                    <div
                      className={`usage-row${kids.length > 0 ? " clickable" : ""}`}
                      onClick={kids.length ? () => toggle(`m:${s.key}`) : undefined}
                    >
                      <span className="usage-rank-i">{i + 1}</span>
                      <span className={`usage-caret${expanded[`m:${s.key}`] ? " open" : ""}`}>
                        {kids.length ? "›" : ""}
                      </span>
                      <i className="usage-dot" style={{ background: seriesColor(s, data.series) }} />
                      <span className="usage-name">
                        <span className="usage-name-m">{s.is_other ? "其他" : rowMain(s)}</span>
                        {rowSub(s) ? <span className="usage-name-s">{rowSub(s)}</span> : null}
                      </span>
                      <span className="usage-val">{full(s.tokens)}</span>
                      <span className="usage-pct">{fmtPct(s.percent)}</span>
                    </div>
                    {expanded[`m:${s.key}`] ? (
                      <div className="usage-fold">
                        {kids.map((m, j) => (
                          <div key={kidKey(m, j)} className="usage-subrow">
                            <i className="usage-dot sm" style={{ background: OTHER_COLOR }} />
                            <span className="usage-name">
                              <span className="usage-name-m">{m.name}</span>
                              {m.provider ? <span className="usage-name-s">{m.provider}</span> : null}
                            </span>
                            <span className="usage-val">{full(m.tokens)}</span>
                            <span className="usage-pct">{fmtPct(m.percent)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </li>
                  );
                })}
              </ol>
            </div>
          </section>

          <section className="usage-sec">
            <h2>各供应商用量</h2>
            <div className="usage-split">
              <svg className="usage-donut" width={ring.s} height={ring.s} viewBox={`0 0 ${ring.s} ${ring.s}`}>
                <circle cx={ring.c} cy={ring.c} r={ring.r} fill="none" stroke="#22262e" strokeWidth={ring.sw} />
                {providerSegs.map((g) => (
                  <circle
                    key={g.key}
                    cx={ring.c}
                    cy={ring.c}
                    r={ring.r}
                    fill="none"
                    stroke={g.color}
                    strokeWidth={ring.sw}
                    strokeDasharray={`${g.len} ${ring.circ - g.len}`}
                    strokeDashoffset={-g.off}
                    transform={`rotate(-90 ${ring.c} ${ring.c})`}
                  />
                ))}
                <text x={ring.c} y={ring.c + ring.s * 0.04} className="usage-donut-v" textAnchor="middle">
                  {fmtCount(providerRingTotal)}
                </text>
                <text x={ring.c} y={ring.c + ring.s * 0.13} className="usage-donut-k" textAnchor="middle">
                  Tokens 用量
                </text>
              </svg>

              <ol className="usage-rank">
                {data.providers.map((p, i) => (
                  //: As One 契约的 UsageProvider 无 key/name,用 provider 当键;「其他」行
                  //: 的显示名固定为「其他」(Nexus 的 p.name),机器键为哨兵
                  //: "\u0000pother"。folded 为对齐 Nexus is_other 行新增(见
                  //: panel-types.ts),assembly 在排名尾部确有被聚合供应商时产出。
                  <li key={p.provider}>
                    <div
                      className={`usage-row${(p.is_other ? (p.folded?.length ?? 0) > 0 : p.models.length > 0) ? " clickable" : ""}`}
                      onClick={
                        (p.is_other ? (p.folded?.length ?? 0) > 0 : p.models.length > 0)
                          ? () => toggle(`p:${p.provider}`)
                          : undefined
                      }
                    >
                      <span className="usage-rank-i">{i + 1}</span>
                      <span className={`usage-caret${expanded[`p:${p.provider}`] ? " open" : ""}`}>
                        {p.is_other ? (p.folded?.length ?? 0) ? "›" : "" : p.models.length ? "›" : ""}
                      </span>
                      <i className="usage-dot" style={{ background: providerColor(p, i) }} />
                      <span className="usage-name">
                        <span className="usage-name-m">{p.is_other ? "其他" : p.provider}</span>
                        <span className="usage-name-s">
                          {p.is_other ? `${p.folded?.length ?? 0} 个供应商` : `${p.models.length} 个模型`}
                        </span>
                      </span>
                      <span className="usage-val">{full(p.tokens)}</span>
                      <span className="usage-pct">{fmtPct(p.percent)}</span>
                    </div>
                    {expanded[`p:${p.provider}`] ? (
                      p.is_other ? (
                        <div className="usage-fold">
                          {(p.folded ?? []).map((f) => (
                            <div key={f.key}>
                              <div
                                className={`usage-subrow${f.models.length > 0 ? " clickable" : ""}`}
                                onClick={f.models.length ? () => toggle(`pf:${f.key}`) : undefined}
                              >
                                <span className={`usage-caret fold${expanded[`pf:${f.key}`] ? " open" : ""}`}>
                                  {f.models.length ? "›" : ""}
                                </span>
                                <i className="usage-dot sm" style={{ background: OTHER_COLOR }} />
                                <span className="usage-name">
                                  <span className="usage-name-m">{f.name}</span>
                                  <span className="usage-name-s">{f.models.length} 个模型</span>
                                </span>
                                <span className="usage-val">{full(f.tokens)}</span>
                                <span className="usage-pct">{fmtPct(f.percent)}</span>
                              </div>
                              {expanded[`pf:${f.key}`] ? (
                                <div className="usage-fold deep">
                                  {f.models.map((m) => (
                                    <div key={`${m.provider ?? ""}/${m.name}`} className="usage-subrow">
                                      <span className="usage-name">
                                        <span className="usage-name-m">{m.name}</span>
                                      </span>
                                      <span className="usage-val">{full(m.tokens)}</span>
                                      <span className="usage-pct">{fmtPct(m.percent)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="usage-fold">
                          {p.models.map((m) => (
                            <div key={`${m.provider ?? ""}/${m.name}`} className="usage-subrow">
                              <i className="usage-dot sm" style={{ background: OTHER_COLOR }} />
                              <span className="usage-name">
                                <span className="usage-name-m">{m.name}</span>
                              </span>
                              <span className="usage-val">{full(m.tokens)}</span>
                              <span className="usage-pct">{fmtPct(m.percent)}</span>
                            </div>
                          ))}
                        </div>
                      )
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <p className="hint usage-foot">
            统计截至 {data.last_day ?? "—"} · 区间 {rangeText} · 数据源 {data.source}
          </p>
        </>
      ) : null}

      {data && !hasData ? (
        <p className="hint">
          这个区间内没有用量数据(库里有数据的范围是 {data.from} → {data.last_day ?? data.to},换一个时间范围看看)。
        </p>
      ) : null}

      {!data && !loading ? <p className="hint">暂无留存数据(网关处理请求后自动按天落盘)。</p> : null}
    </React.Fragment>
  );
}

export { UsageStatsPage };
