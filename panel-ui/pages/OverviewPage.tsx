/**
 * 总览频道(1:1 移植 Nexus 面板 /nexus/ → Overview.vue)。
 *
 * 页面结构照搬 Nexus:状态行(标题 + 运行时长 + 就绪/健康与冷却计数)→
 * 「运行中」在途租约卡片(按逻辑模型分卡,直连高亮)→「实时日志」按对话分组
 * 的可展开卡片列表(固定按时间排序 / 条数输入 / 默认折叠)。供应商概览与指标表在
 * Nexus 已整块删除(2026-10-12),本页同样不放回。
 *
 * 数据契约(见 src/renderer/src/api.ts):rendererApi.getStatus() →
 * GatewayStatus;rendererApi.getRuntime() → RuntimeSnapshot(含
 * in_flight_total / by_logical_model / leases / recent / recent_limit)。
 * 轮询照搬 Nexus 的固定 5s 间隔。
 *
 * ⚠️ Nexus 前端自己给 recent/lease 补的 ``conv``(整数)在 As One 契约里是
 * 后端直出的 ``string | null``(装配层 ``String(convNo)``,"0" = 无会话 id,
 * 与 Nexus 的 ``conv === 0`` 同义),页面直接消费,不再本地派生。契约允许的
 * 真 null(防御分支)按用户定案「conv 为 null 的按 real_model_id 归类」处理。
 */
import React from "react";
import { rendererApi } from "../api";
import type {
  CheckinChannelStatus,
  CheckinOverview,
  GatewayStatus,
  InflightLogicalGroup,
  RecentRequest,
  RuntimeSnapshot,
} from "../api";
import { fmtCount, fmtDuration } from "../format";
// 渠道风险提示文案(与「模型 → 渠道」页共用同一份,见 @as-one/panel 的同名模块)。
import { providerRiskNote } from "@as-one/panel/src/channel-risk-note.js";

/** 「直连」文案:逻辑模型为空 = 客户端直接调真实模型。 */
const DIRECT_LABEL = "直连";

/** 实时日志条数设置的兜底默认值(与后端 Router._recent_limit 默认一致)。 */
const DEFAULT_LIMIT = 50;

// ── 实时日志排序:只按时间(最新在前),不再提供排序档选择器(2026-10-25 定案) ──

// ── 按对话分组视图(2026-10-16 Nexus 定案,取代旧的 9 列表格) ────────────────

/** 一个 conv 一张卡;``conv`` 为 null 时按真实模型归类(用户定案)。 */
interface RecentConvGroup {
  id: string;
  conv: string | null;
  label: string;
  noConv: boolean;
  rows: RecentRequest[];
  okCount: number;
  failCount: number;
  firstError: string;
  latencyMin: number | null;
  latencyMax: number | null;
  ttftMin: number | null;
  ttftMax: number | null;
  tpsAvg: number | null;
  promptSum: number;
  completionSum: number;
  cachedSum: number;
  finishedSago: number;
  /** 折叠态也能看出用的模型:去重后按出现条数降序;空逻辑模型统一记「直连」。 */
  lms: string[];
  rms: string[];
}

/** 模型名去重 + 按出现条数降序(条数相同保持首次出现顺序,稳定排序)。 */
function countModels(names: string[]): string[] {
  const n = new Map<string, number>();
  for (const s of names) {
    const key = String(s || "");
    if (!key) continue;
    n.set(key, (n.get(key) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}

/** 卡头模型名:单模型给全名;多模型给「首个 +N」(完整列表放 title)。 */
function modelSummary(names: string[]): string {
  if (!names.length) return "—";
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

/** 唯一排序键:最近结束(``finished_s_ago`` 越小越靠前)= 按时间倒序。 */
function byActivity(a: RecentConvGroup, b: RecentConvGroup): number {
  return a.finishedSago - b.finishedSago;
}

/** 无会话 id 的卡永远排最后;其余按时间排序(最新在前)。 */
function sortConvGroups(groups: RecentConvGroup[]): RecentConvGroup[] {
  const noConv = groups.filter((g) => g.noConv);
  const conv = groups.filter((g) => !g.noConv);
  return [...conv.sort(byActivity), ...noConv];
}

/** 延迟 / TTFT 的卡内取值:min–max(秒,一位小数),全部相同时给单个值。 */
function fmtMsRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  const lo = Math.round(min ?? max!);
  const hi = Math.round(max ?? min!);
  const loS = (lo / 1000).toFixed(1);
  const hiS = (hi / 1000).toFixed(1);
  return loS === hiS ? `${loS}s` : `${loS}–${hiS}s`;
}

/** 毫秒 → 「2.6s」(一位小数);空值给「—」。 */
function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${(Math.round(ms) / 1000).toFixed(1)}s`;
}

/** TPS:最多一位小数。 */
function fmtTps(tps: number | null | undefined): string {
  if (tps == null) return "—";
  return `${Number(tps).toFixed(1)} tok/s`;
}

/** 错误串截断:卡片里放不下,完整内容在 title 属性里。 */
function truncate(text: string, max: number): string {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 「运行中」卡片里的真实模型 → 在途条数行(条数自同卡 leases 前端计数)。 */function realModelRows(lm: InflightLogicalGroup): Array<{ real_model: string; n: number }> {
  const counts = new Map<string, number>();
  for (const l of lm.leases) {
    counts.set(l.real_model_id, (counts.get(l.real_model_id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([real_model, n]) => ({ real_model, n }))
    .sort((a, b) => b.n - a.n || a.real_model.localeCompare(b.real_model));
}

/** 单渠道签到状态行(总览「每日签到」卡)。 */
function CheckinRow({ c }: { c: CheckinChannelStatus }): React.JSX.Element {
  let state = "已签";
  let cls = "ok";
  if (!c.supported) {
    state = "不支持";
    cls = "na";
  } else if (c.error) {
    state = "查询失败";
    cls = "err";
  } else if (c.accounts === 0) {
    // 支持签到但一个账号都没有:确定状态,不是「查不到」。
    state = "无账号";
    cls = "na";
  } else if (c.checkedIn === null) {
    state = "未知";
    cls = "na";
  } else if (c.pending !== null && c.pending > 0) {
    // ⚠️ **部分已签要把已签数说出来**(2026-11-09 用户报「trae 还是没有显示
    // 两个账号」):以前这里只给「未签 N」,把已签的那几个全丢了 ——
    // 2 个账号「1 个已签 1 个未签」显示成「未签 1」,看起来像「一个都没签」。
    //
    // ⚠️ 文案要**短**(2026-11-09 第二版):`已签 1/2(待签 1)` 在窄列里会折成
    // 两行(截图里括号被挤到下一行),所以改成 `1/2 已签` —— 比例在前、状态在后,
    // 比「已签 1/2(待签 1)」短一半,且信息量不减(2 减 1 就是待签数)。
    //
    // ⚠️ **countExact=false 时不能直接判「未签」**(2026-11-11 用户报
    // 「trae 点击签到后仍显示未签」):trae 不报分母,但 `checkedIn>0` 说明
    // **这个渠道今天确实领到了**。以前这里一刀切显示「未签」,把已签的事实抹掉,
    // 用户以为签到失败。现在:有账号签上 → 「已签」(ok),一个都没签 → 「未签」。
    if (c.countExact && c.accounts > 1) {
      state = `${c.checkedIn}/${c.accounts} 已签`;
      cls = "ok";
    } else if (c.checkedIn > 0) {
      state = "已签";
      cls = "ok";
    } else {
      state = "未签";
      cls = "warn";
    }
  } else if (c.countExact && c.accounts > 1) {
    state = `${c.checkedIn}/${c.accounts} 已签`;
    cls = "ok";
  } else {
    state = "已签";
    cls = "ok";
  }

  const meta: string[] = [];
  if (c.dailyCredit !== null) meta.push(`今日 +${c.dailyCredit}`);
  if (c.streak !== null) meta.push(`连签 ${c.streak} 天`);
  if (c.reason) meta.push(c.reason);
  if (c.error) meta.push(c.error);

  return (
    <div className="ov-checkinRow">
      <span
        className="ov-checkinName"
        // ⚠️ 2026-11-08(WorkBuddy 重新显性化):这一行不再是「隐藏期间」的样子 ——
        // 把上游风险挂在 title 上。语气克制:说清事实与我们的处置,不吓人也不隐瞒。
        title={providerRiskNote(c.provider)}
      >
        {c.label}
      </span>
      <span className={`ov-checkinState is-${cls}`} title={meta.join(" · ")}>
        {state}
      </span>
      <span className="ov-checkinMeta">{meta.join(" · ")}</span>
    </div>
  );
}

/**
 * 总览「每日签到」隐藏的渠道。
 *
 * ⚠️ 2026-11-08 **清空**:WorkBuddy 已重新在「模型 → 渠道」页显性化(用户定案),
 * 总览的签到行同时恢复显示。之前隐藏的理由是「上游风控期,避免误点触发」;
 * 现在风险由**代码级缓解**(账号节流 / 首用自检 / 11140 熔断)与**界面提示**
 * (`providerRiskNote` 挂在行名 title 上)承担,而不是靠「不显示」。
 * 保留这个集合(空集)是因为过滤逻辑本身还有用:将来若要临时隐藏某渠道,
 * 加一行即可,不必再改渲染流程。
 */
const HIDDEN_CHECKIN_ROWS = new Set<string>();

/**
 * 展示口径:过滤掉隐藏渠道 + **0 账号的渠道**(头部计数与行列表共用同一份)。
 *
 * ⚠️ 0 账号过滤(2026-11-09 用户定案「accounts === 0 直接隐藏行」):
 * 一个还没导入账号的渠道,签到状态是「未知」而不是「有问题」——摆一行
 * 「未知 / 该渠道没有带令牌的凭据」既占位又像故障。后端也已经不返回它,
 * 这里再挡一层,保证计数分母永远等于看得见的行数。
 */
function shownCheckinChannels(
  channels: CheckinChannelStatus[] | undefined,
): CheckinChannelStatus[] {
  return (channels ?? []).filter(
    (c) => !HIDDEN_CHECKIN_ROWS.has(c.provider) && c.accounts > 0,
  );
}

export default function OverviewPage(): React.JSX.Element {
  const [status, setStatus] = React.useState<GatewayStatus | null>(null);
  const [error, setError] = React.useState("");
  /** 在途明细拿不到**不**算页面故障:只有拿到才渲染运行中/实时日志两块。 */
  const [inflight, setInflight] = React.useState<RuntimeSnapshot | null>(null);
  const [recentLimit, setRecentLimit] = React.useState<string>(String(DEFAULT_LIMIT));
  const [recentLimitSaved, setRecentLimitSaved] = React.useState(DEFAULT_LIMIT);
  const [recentLimitSaving, setRecentLimitSaving] = React.useState(false);
  const [recentLimitError, setRecentLimitError] = React.useState("");
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    //: 独立 try/catch:在途明细失败不该把网关状态一起刷掉。
    try {
      setStatus(await rendererApi.getStatus());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    try {
      setInflight(await rendererApi.getRuntime());
    } catch {
      setInflight(null);
    }
  }, []);

  /** 条数设置的初值只拉一次(它不会自己变;改了也是本页写回去的)。 */
  const loadRecentLimit = React.useCallback(async () => {
    try {
      const r = await rendererApi.getSettings();
      //: sections 的内层键是完整点号键 "ui.recent_limit"(与 Nexus 一致)。
      const n = Number(
        r.sections?.["ui"]?.["ui.recent_limit"] ?? r.sections?.["ui"]?.["recent_limit"],
      );
      if (Number.isFinite(n) && n >= 1) {
        setRecentLimit(String(n));
        setRecentLimitSaved(n);
      }
    } catch {
      /* 静默:读不到时保持 50 兜底 */
    }
  }, []);

  /** 每日签到:状态只拉一次(签到是上游可感接口,别放进 5s 轮询)。 */
  const [checkin, setCheckin] = React.useState<CheckinOverview | null>(null);
  const [checkinLoading, setCheckinLoading] = React.useState(true);
  const [checkinBusy, setCheckinBusy] = React.useState(false);
  const [checkinMsg, setCheckinMsg] = React.useState("");
  const [checkinErr, setCheckinErr] = React.useState("");

  const loadCheckin = React.useCallback(async () => {
    setCheckinLoading(true);
    try {
      setCheckin(await rendererApi.checkinOverview());
      setCheckinErr("");
    } catch (e) {
      setCheckinErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckinLoading(false);
    }
  }, []);

  /** 全部签到:确认是真写(confirm=true),完成后重拉状态。 */
  const claimAll = React.useCallback(async () => {
    setCheckinBusy(true);
    setCheckinMsg("");
    setCheckinErr("");
    try {
      const r = await rendererApi.checkinAll(true);
      setCheckinMsg(r.message);
      if (r.channels?.length) setCheckin({ channels: r.channels });
      if (!r.ok) setCheckinErr("没有渠道签到成功");
    } catch (e) {
      setCheckinErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckinBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    void loadRecentLimit();
    void loadCheckin();
    //: 照搬 Nexus 的固定 5s 轮询。
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load, loadRecentLimit, loadCheckin]);

  /**
   * 保存条数 —— 时机是失焦 / 回车(React 的 onChange 是每键击,与 Vue 的
   * @change 语义不同,这里显式挂 onBlur / onKeyDown-Enter)。范围对齐后端
   * min 1 / max 500;空值静默还原,超范围给提示;成功后立刻重拉一次。
   */
  const saveRecentLimit = React.useCallback(async () => {
    const raw = recentLimit;
    const n = raw.trim() === "" ? NaN : Math.trunc(Number(raw));
    if (!Number.isFinite(n)) {
      setRecentLimit(String(recentLimitSaved));
      setRecentLimitError("");
      return;
    }
    if (n < 1 || n > 500) {
      setRecentLimitError("条数需为 1–500 的整数");
      return;
    }
    setRecentLimit(String(n));
    setRecentLimitError("");
    setRecentLimitSaving(true);
    try {
      await rendererApi.saveSettings({ ui: { recent_limit: String(n) } });
      setRecentLimitSaved(n);
      await load();
    } catch (e) {
      setRecentLimitError(`保存失败:${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRecentLimitSaving(false);
    }
  }, [recentLimit, recentLimitSaved, load]);

  const toggleGroup = React.useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** 网关健康摘要:就绪 / 运行秒数 / 健康与冷却模型数。 */
  const summary = status
    ? {
        ready: status.ready,
        reason: status.reason,
        uptime_s: status.uptime_s,
        healthy: status.healthy_count,
        cooldown: status.cooldown_count,
      }
    : null;

  /** 每日签到展示口径:隐藏 WorkBuddy 后只统计**展示出来的**渠道。 */
  const shownCheckin = React.useMemo(
    () => shownCheckinChannels(checkin?.channels),
    [checkin],
  );

  /** 实时日志按对话分组(conv 为 null 的按 real_model_id 归类),组间按时间排序。 */
  const recentConvGroups = React.useMemo<RecentConvGroup[]>(() => {
    const list = inflight?.recent ?? [];
    const byConv = new Map<string, RecentRequest[]>();
    for (const r of list) {
      const key = r.conv === null ? `rm:${r.real_model_id}` : `conv:${r.conv}`;
      const bucket = byConv.get(key);
      if (bucket) bucket.push(r);
      else byConv.set(key, [r]);
    }
    const groups: RecentConvGroup[] = [];
    for (const [key, rows] of byConv) {
      //: 新的在上:后端 recent 是「最近结束」优先,seq 降序即时间倒序。
      rows.sort((a, b) => b.seq - a.seq);
      const conv = key.startsWith("conv:") ? key.slice(5) : null;
      const noConv = conv === null || conv === "0";
      const label =
        conv === null
          ? rows[0]?.real_model_id || "无对话"
          : conv === "0"
            ? "无对话"
            : `#${conv}`;
      const lat = rows.map((r) => r.latency_ms).filter((v): v is number => v != null);
      const ttft = rows.map((r) => r.ttft_ms).filter((v): v is number => v != null);
      const tps = rows.map((r) => r.tps).filter((v): v is number => v != null);
      const fago = rows.map((r) => r.finished_s_ago).filter((v): v is number => v != null);
      groups.push({
        id: key,
        conv,
        label,
        noConv,
        rows,
        okCount: rows.filter((r) => r.ok).length,
        failCount: rows.length - rows.filter((r) => r.ok).length,
        firstError: rows.find((r) => !r.ok && r.error)?.error ?? "",
        latencyMin: lat.length ? Math.min(...lat) : null,
        latencyMax: lat.length ? Math.max(...lat) : null,
        ttftMin: ttft.length ? Math.min(...ttft) : null,
        ttftMax: ttft.length ? Math.max(...ttft) : null,
        tpsAvg: tps.length ? tps.reduce((a, b) => a + b, 0) / tps.length : null,
        promptSum: rows.reduce((a, r) => a + (r.prompt_tokens || 0), 0),
        completionSum: rows.reduce((a, r) => a + (r.completion_tokens || 0), 0),
        cachedSum: rows.reduce((a, r) => a + (r.cached_tokens || 0), 0),
        finishedSago: fago.length ? Math.min(...fago) : 0,
        lms: countModels(rows.map((r) => r.logical_model || DIRECT_LABEL)),
        rms: countModels(rows.map((r) => r.real_model_id)),
      });
    }
    return sortConvGroups(groups);
  }, [inflight]);

  return (
    <React.Fragment>
      <h1 className="page-title">As One 管理面板</h1>
      {summary ? (
        <p>
          {summary.ready ? (
            <>
              网关运行中 · 运行 {fmtDuration(summary.uptime_s)} · 可用 {summary.healthy} / 冷却{" "}
              {summary.cooldown}
            </>
          ) : (
            <>网关未就绪:{summary.reason ?? "未知原因"}</>
          )}
        </p>
      ) : (
        <p className="na">加载中…</p>
      )}

      {error ? (
        <div className="ov-err">
          {error}
          {error.includes("401") ? (
            <span>
              {" "}
              —— 请在网址后追加 <code>?key=&lt;ONE_API_KEY&gt;</code>
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── 每日签到:各渠道状态 + 全部签到 ─────────────────────────────── */}
      <div className="ov-checkin">
        <div className="ov-checkinHead">
          <h2>
            每日签到
            {checkin?.channels?.length ? (
              <span className="count">
                {shownCheckin.filter(
                  (c) => c.supported && c.pending === 0 && c.checkedIn !== null,
                ).length}
                /{shownCheckin.filter((c) => c.supported).length}
              </span>
            ) : null}
          </h2>
          <button
            className="btn"
            disabled={checkinBusy || checkinLoading}
            title="对所有支持签到的渠道签到(含已从列表隐藏的 WorkBuddy)"
            onClick={() => void claimAll()}
          >
            {checkinBusy ? "签到中…" : "全部签到"}
          </button>
        </div>
        {checkinErr ? <div className="ov-checkinErr">{checkinErr}</div> : null}
        {checkinMsg ? <div className="ov-checkinMsg">{checkinMsg}</div> : null}
        {checkinLoading && !checkin ? (
          <p className="na">加载签到状态…</p>
        ) : (
          <div className="ov-checkinRows">
            {shownCheckin.map((c) => (
              <CheckinRow key={c.provider} c={c} />
            ))}
            {!shownCheckin.length ? (
              <p className="na">没有支持签到的渠道</p>
            ) : null}
          </div>
        )}
      </div>

      {inflight ? (
        <>
          {/* ── 运行中:此刻哪些逻辑模型在用哪些真实模型(5s 刷新) ── */}
          <div className="ov-inflight">
            <div className="ov-inflightHead">
              <h2>运行中</h2>
              <span className="count">{inflight.in_flight_total} 条在途</span>
            </div>
            {inflight.in_flight_total === 0 ? null : (
              <div className="ov-inflightGrid">
                {/* 按逻辑模型:谁在用谁。空逻辑模型 = 直连,套 ov-inflightDirect 高亮。 */}
                {inflight.by_logical_model.map((lm) => (
                  <div
                    key={lm.logical_model}
                    className={`ov-inflightCard${lm.logical_model === "" ? " ov-inflightDirect" : ""}`}
                  >
                    <div className="ov-inflightCardHead">
                      {/* 直连卡给固定文案 + 解释(title),别露一个空白标题让人猜。 */}
                      {lm.logical_model === "" ? (
                        <span
                          className="ov-inflightLm"
                          title="客户端直接调用真实模型(provider/model),未经过逻辑模型"
                        >
                          {DIRECT_LABEL}
                        </span>
                      ) : (
                        <span className="ov-inflightLm">{lm.logical_model}</span>
                      )}
                      <span className="count">{lm.in_flight}</span>
                    </div>
                    <ul className="ov-inflightMap">
                      {/* 每行带该真实模型的在途条数(leases 前端计数),条数降序。 */}
                      {realModelRows(lm).map((rm) => (
                        <li key={rm.real_model}>
                          <span className="ov-mono">→ {rm.real_model}</span>
                          <span className="ov-inflightRmN ov-mono">×{rm.n}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="ov-inflightLeases">
                      {lm.leases.map((l) => (
                        <span
                          key={l.seq}
                          className="ov-lease"
                          title={`${l.real_model_id} · ${l.stream ? "流式" : "非流式"} · 已跑 ${l.elapsed_s}s`}
                        >
                          #{l.conv ?? 0}#{l.seq}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 实时日志(已结束的请求,固定条数可配置,5s 刷新) ── */}
          <div className="ov-recentBlock">
            <div className="ov-inflightHead">
              <h2>实时日志</h2>
              <span className="count">{inflight.recent?.length ?? 0} 条</span>
              <label
                className="ov-recentLimit"
                title="实时日志最多显示几条;同时决定后端保留区容量(ui.recent_limit)"
              >
                最多
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={recentLimit}
                  disabled={recentLimitSaving}
                  onChange={(e) => setRecentLimit(e.target.value)}
                  onBlur={() => void saveRecentLimit()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveRecentLimit();
                  }}
                />
                条
              </label>
              {recentLimitError ? <span className="ov-recentLimitErr">{recentLimitError}</span> : null}
            </div>
            {!inflight.recent?.length ? (
              <p className="hint on">暂无已结束的请求。</p>
            ) : (
              <div className="ov-recentConvList">
                {/* 一个 conv 一张卡;卡头汇总 + 卡内逐条(默认收起,点头展开)。 */}
                {recentConvGroups.map((g) => (
                  <div
                    key={g.id}
                    className={`ov-recentConv${expandedGroups.has(g.id) ? " open" : ""}`}
                  >
                    <div
                      className="ov-recentConvHead"
                      title={expandedGroups.has(g.id) ? "收起明细" : "展开明细"}
                      onClick={() => toggleGroup(g.id)}
                    >
                      <span className="ov-recentConvHeadId">
                        <span className="ov-recentConvCaret">
                          {expandedGroups.has(g.id) ? "▾" : "▸"}
                        </span>
                        <span className={`ov-recentConvTitle ov-mono${g.noConv ? " direct" : ""}`}>
                          {g.label}
                        </span>
                      </span>
                      {/* 折叠态也显示模型名;空逻辑模型统一记「直连」。 */}
                      <span
                        className={`ov-mono ov-recentConvLm${g.noConv ? " direct" : ""}`}
                        title={g.lms.join(" / ")}
                      >
                        {modelSummary(g.lms)}
                      </span>
                      <span className="ov-mono ov-dim ov-recentConvRm" title={g.rms.join(" / ")}>
                        {modelSummary(g.rms)}
                      </span>
                      <span className="ov-recentConvRes">
                        <span className="ov-recentConvN">{g.rows.length} 条</span>
                        <span className={`ov-badge${g.failCount ? " bad" : " ok"}`}>OK ×{g.okCount}</span>
                        {g.firstError ? (
                          <span className="ov-errText" title={g.firstError}>
                            {truncate(g.firstError, 40)}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="ov-num"
                        title={`延迟 ${fmtMsRange(g.latencyMin, g.latencyMax)}(卡内最小–最大)`}
                      >
                        {fmtMsRange(g.latencyMin, g.latencyMax)}
                      </span>
                      <span className="ov-num" title="TTFT 首字延迟(卡内最小–最大)">
                        TTFT {fmtMsRange(g.ttftMin, g.ttftMax)}
                      </span>
                      <span className="ov-num">{fmtTps(g.tpsAvg)}</span>
                      <span className="ov-num ov-dim">
                        {fmtCount(g.promptSum)} / {fmtCount(g.completionSum)} /{" "}
                        {fmtCount(g.cachedSum)}
                      </span>
                      <span className="ov-num ov-dim">{g.finishedSago}s 前</span>
                    </div>
                    {/* 明细行:字段与旧表格逐列一致(编号/逻辑模型/真实模型/结果/
                         延迟/TTFT/TPS/token 三格/结束),只是紧凑行式布局。 */}
                    {expandedGroups.has(g.id)
                      ? g.rows.map((r) => (
                          <div
                            key={r.seq}
                            className={`ov-recentConvRow${!r.ok ? " fail" : ""}`}
                          >
                            <span
                              className="ov-mono ov-recentConvSeq"
                              title={`第 ${r.conv ?? 0} 个对话的第 ${r.seq} 个请求`}
                            >
                              #{r.conv ?? 0}#{r.seq}
                            </span>
                            {/* 空逻辑模型 = 直连,与「运行中」卡片同一文案。 */}
                            <span
                              className={`ov-mono ov-recentConvLm${!r.logical_model ? " direct" : ""}`}
                            >
                              {r.logical_model || DIRECT_LABEL}
                            </span>
                            <span className="ov-mono ov-dim ov-recentConvRm" title={r.real_model_id}>
                              {r.real_model_id}
                            </span>
                            <span className="ov-recentConvRes">
                              <span className={`ov-badge${r.ok ? " ok" : " bad"}`}>
                                {r.ok ? r.status || "OK" : r.status || "失败"}
                              </span>
                              {!r.ok && r.error ? (
                                <span className="ov-errText" title={r.error}>
                                  {truncate(r.error, 40)}
                                </span>
                              ) : null}
                            </span>
                            <span className="ov-num">{fmtMs(r.latency_ms)}</span>
                            <span className="ov-num">{fmtMs(r.ttft_ms)}</span>
                            <span className="ov-num">{fmtTps(r.tps)}</span>
                            <span className="ov-num ov-dim">
                              {fmtCount(r.prompt_tokens || 0)} / {fmtCount(r.completion_tokens || 0)}{" "}
                              / {fmtCount(r.cached_tokens || 0)}
                            </span>
                            <span className="ov-num ov-dim">
                              {r.finished_s_ago == null ? "—" : `${r.finished_s_ago}s 前`}
                            </span>
                          </div>
                        ))
                      : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </React.Fragment>
  );
}

export { OverviewPage };
