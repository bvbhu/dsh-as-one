/**
 * 设置页 —— 严格 1:1 复刻既有面板(用户 m08793「所有页面严格按既有面板复刻」)。
 *
 * 结构(逐元素对齐 Settings.vue):
 * - 页头 h1.ui-page-title「设置」+ p.ui-page-desc;busy → p.hint「加载中…」,err → p.ui-err;
 * - .ui-layout:仅 .ui-content(2026-10-25 m14922 移除左侧 sticky nav.ui-nav,
 *   所有卡片纵向铺满全宽);
 * - 四卡:外部数据刷新 / 调度规则(可视化四组编辑器 + 原始 JSON 折叠视图)/
 *   重试策略(两小节 + 内联退避曲线 SVG)/ 界面;
 * - 请求日志卡(独立端点,change 即保存)+ 只读信息卡;
 * - 底部 sticky 保存栏(.ui-content 内):「N 项未保存」/「没有未保存的改动」+ 放弃改动 + 保存设置。
 *
 * 数据契约(以 As One 契约实际字段为准,不编造):
 * - getSettings():sections 内层键是完整点号键(如 "ui.recent_limit");specs 为扁平数组,
 *   specOf 按完整键名匹配,section 由键名前缀推导(字段表见 src/main/assembly.ts SETTING_FIELDS)。
 * - 契约缺 real.wait_budget_s:「重试次数与冷却」组按现有规格渲染(pick 同款过滤),不留空位提示。
 * - RequestLogStatus.content_modes 为 {value,label}:option 显示中文 label(不再摆机器值)。
 * - 请求日志卡无「开关」(2026-10-27 用户 m17413:移除开关,档位即全部控制 —— off=不写明细,仅统计聚合)。
 * - master_key 未设置 → 空态文案「未设置 ONE_API_KEY:当前无鉴权(所有请求放行)」。
 * - saveSettings → msg = r.message || "已保存";changedPayload 逐键 JSON.stringify diff。
 * - As One 的 setRequestLog 诚实返回 {ok:false}(未实现落盘):照既有交互渲染,
 *   r.message 经 logMsg 展示,不隐藏失败。
 */
import React from "react";
import { rendererApi } from "../api";
import {
  CooldownRuleRow,
  RULES_PRIORITY_KEYS,
  RuleRow,
  freshGroups,
  parseProfiles,
  parseRules,
  ruleCard,
  rulesProblem,
  serializeCooldowns,
  serializeGroups,
  serializeProfiles,
  serializeRulesByKey,
} from "./settings-rules";
import type { CooldownRule, RuleGroups, TierRule, WindowProfileRow } from "./settings-rules";
import { moveItemTo, insertIndexAt, outsideRect } from "../components/logical-model-dnd.js";
import type {
  DeploymentItem,
  LogicalModelGroup,
  RequestLogContentMode,
  RequestLogStatus,
  SettingSpec,
  SettingsRead,
} from "../api";

/* ── 常量(与既有设定逐字对齐) ─────────────────────── */

const SECTION_TITLES: Record<string, { title: string }> = {
  // ⚠️ 这些 key 必须与后端 sections 的段名一字不差。
  external_refresh: {
    title: "外部数据刷新",
  },
  // 「调度规则」不再是总卡:五档 + 冷却各自拆成平级面板(见 TIER_PANELS)。
  retry: {
    title: "重试策略",
  },
  ui: {
    title: "界面",
  },
};

/**
 * 调度规则面板清单 —— 每档一张与「外部数据刷新」同级的独立卡片。
 *
 * 2026-11-03 用户定案:移除「调度规则」总卡框,P1~P4 / 禁用 / 冷却全部拆开。
 * 2026-11-03 用户定案(二):标题口径统一 —— P1~P4 的副标题一律「调度优先级」,
 * 2026-11-07 删除各档行为说明文字:档位差异只由徽标(P1/P2/P3/P4)承载,
 * 不再有说明文字;「禁用」只留徽标、副标题留空。
 */
const TIER_PANELS = [
  { badge: "P1", key: "free", title: "调度优先级" },
  { badge: "P2", key: "expiry", title: "调度优先级" },
  { badge: "P3", key: "consume", title: "调度优先级" },
  { badge: "P4", key: "degrade", title: "调度优先级" },
  { badge: "禁用", key: "disabled", title: "" },
] as const;

/**
 * 设置页顶层分段(2026-11-18 重设计):一次只显示一个任务域,不恢复左侧固定导航。
 * 卡片内部一律「标签左 / 控件右」的紧凑行(settings-row),无说明段落。
 */
/**
 * 二级导航(2026-11 用户定案):原先「集成 / 界面 / 系统」三组各只有一两个
 * 零散设置项,单独成 tab 太空。**合并成一个「其他」**。
 */
const SETTINGS_TABS = [
  { key: "scheduler", label: "调度" },
  { key: "policy", label: "策略" },
  { key: "misc", label: "其他" },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];


/* ── 退避曲线(与 backoffChart computed 对齐,草稿值实时重算) ── */

interface BackoffChart {
  W: number;
  H: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  N: number;
  seq: number[];
  jit: number;
  bandW: number;
  dashX: number;
  x: (i: number) => number;
  y: (v: number) => number;
  seqText: string;
  budgetKText: string;
  budgetMText: string;
  yTop: number;
  yTicks: { v: number; y: number }[];
  fmtAxis: (v: number) => string;
}

function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function backoffChart(draft: Record<string, Record<string, string>>): BackoffChart {
  const retry = draft.retry ?? {};
  const read = (key: string, fb: number): number => {
    const v = retry[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : fb;
  };
  const base = Math.max(0.001, read("retry.base_backoff_s", 1.0));
  const cap = Math.max(base, read("retry.max_backoff_s", 15.0));
  const jit = Math.min(1, Math.max(0, read("retry.jitter_ratio", 0.2)));
  const realMax = Math.trunc(read("retry.real_max", 10));
  const logicalMax = Math.max(1, Math.trunc(read("retry.logical_max", 1)));
  const unlimited = realMax <= 0;
  // 确定性序列:n = 1..min(real_max, 12);real_max<=0(不限制)按 12 档显示。
  const N = unlimited ? 12 : Math.min(Math.max(realMax, 1), 12);
  const raw = (n: number): number => Math.min(cap, base * Math.pow(2, n - 1));
  const seq: number[] = [];
  for (let n = 1; n <= N; n++) seq.push(raw(n));
  const maxV = Math.max(...seq, 0.001);
  const sumUpTo = (k: number): number => {
    let s = 0;
    for (let n = 1; n <= k; n++) s += raw(n);
    return s;
  };
  const W = 560;
  const H = 150;
  const padL = 46;
  const padR = 10;
  const padT = 16;
  const padB = 24;
  const x = (i: number): number =>
    padL + (N === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (N - 1));
  const yTop = niceCeil(maxV);
  const y = (v: number): number => padT + (H - padT - padB) * (1 - v / yTop);
  // 刻度文案带单位「s」——纵轴是秒,不写单位就得靠读者猜;尾随零去掉。
  const fmtAxis = (v: number): string => {
    if (v === 0) return "0s";
    if (v >= 10) return `${Math.round(v)}s`;
    return `${v.toFixed(2).replace(/\.?0+$/, "")}s`;
  };
  const yTicks = [0, yTop / 2, yTop].map((v) => ({ v, y: y(v) }));
  const bandW = Math.max(6, Math.min(18, ((W - padL - padR) / N) * 0.7));
  const dashX = x(Math.min(Math.max(logicalMax, 1), N) - 1);
  const truncated = unlimited || realMax > 12;
  const fmt1 = (n: number): string => {
    if (!Number.isFinite(n)) return "0";
    if (Math.abs(n) >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
    return n.toFixed(1);
  };
  const seqText = `序列：${seq.map((v) => `${fmt1(v)}s`).join(" → ")}${truncated ? " …" : ""}（共 ${N} 档${truncated ? "，显示前 12 档" : ""}）`;
  const sumK = sumUpTo(logicalMax);
  const budgetKText = `预算（逻辑模型成员，${logicalMax} 档）：累计 ${fmt1(sumK * (1 - jit))}s~${fmt1(sumK)}s（含抖动区间）`;
  let budgetMText: string;
  if (unlimited) {
    const s = sumUpTo(12);
    budgetMText = `预算（直连，档数不限制）：按前 12 档估算累计 ${fmt1(s * (1 - jit))}s~${fmt1(s)}s（含抖动区间）`;
  } else {
    const s = sumUpTo(realMax);
    budgetMText = `预算（直连，${realMax} 档）：累计 ${fmt1(s * (1 - jit))}s~${fmt1(s)}s（含抖动区间）`;
  }
  return {
    W, H, padL, padR, padT, padB, N, seq, jit, bandW, dashX, x, y,
    seqText, budgetKText, budgetMText, yTop, yTicks, fmtAxis,
  };
}

/* ── 组件 ──────────────────────────────────────────────────── */

function cloneSections(s: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const k of Object.keys(s)) out[k] = { ...s[k] };
  return out;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

/** 一条时段子规则的摘要:`工作日 09:00-12:00、14:00-18:00`。 */
function segSummary(seg: { weekdays: number[]; times: Array<{ start: string; end: string }> }): string {
  const days =
    seg.weekdays.length === 0
      ? "每天"
      : seg.weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => seg.weekdays.includes(d))
        ? "工作日"
        : seg.weekdays.length === 2 && seg.weekdays.includes(6) && seg.weekdays.includes(7)
          ? "周末"
          : seg.weekdays.map((d) => WEEKDAY_LABELS[d - 1]).join("、");
  const times =
    seg.times.length === 0 ? "全天" : seg.times.map((t) => `${t.start}-${t.end}`).join("、");
  return `${days} ${times}`;
}

/**
 * 一条命名时段卡 —— **常展开**，内部可有**多条子规则**。
 *
 * 用户 2026-11 要求「不需要拆分」：梁文谷 = 工作日非高峰 + 周末全天，必须是一条
 * 时段里的两段子规则，而不是两个独立时段。所以这里每张卡渲染
 * 「名称 + 若干子规则（各自的星期方块 + 时间段）」，＋/× 增删子规则。
 */
function ProfileCard(props: {
  profile: WindowProfileRow;
  onPatch: (patch: Partial<WindowProfileRow>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const p = props.profile;
  const setSegs = (segs: WindowProfileRow["segments"]): void => props.onPatch({ segments: segs });
  const patchSeg = (i: number, patch: Partial<WindowProfileRow["segments"][number]>): void =>
    setSegs(p.segments.map((s, at) => (at === i ? { ...s, ...patch } : s)));
  const toggleDay = (i: number, d: number): void => {
    const cur = p.segments[i].weekdays;
    patchSeg(i, { weekdays: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() });
  };
  const patchTime = (i: number, ti: number, patch: Partial<{ start: string; end: string }>): void =>
    patchSeg(i, { times: p.segments[i].times.map((t, at) => (at === ti ? { ...t, ...patch } : t)) });

  return (
    <li className="profileRow">
      <div className="profileTop">
        <input
          className="input profileName"
          value={p.name}
          aria-label="时段名称"
          title="时段名称(规则下拉里显示这个名字)"
          onChange={(ev) => props.onPatch({ name: ev.target.value })}
        />
        <button type="button" className="rowBtn danger profileDel" onClick={props.onRemove}>
          删除
        </button>
      </div>

      {p.segments.map((seg, i) => (
        <div className="profileSeg" key={i}>
          <div className="profileSegDays">
            <div className="rr-day-set" role="group" aria-label="生效星期">
              {WEEKDAY_LABELS.map((label, di) => {
                const d = di + 1;
                const on = seg.weekdays.includes(d);
                return (
                  <button
                    type="button"
                    key={d}
                    className={"rr-day" + (on ? " on" : "")}
                    aria-pressed={on}
                    aria-label={`周${label}`}
                    onClick={() => toggleDay(i, d)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {seg.weekdays.length === 0 ? <span className="profileNote">每天</span> : null}
          </div>
          <div className="profileSegTimes">
            {seg.times.map((t, ti) => (
              <span className="profileTime" key={ti}>
                <input
                  type="time"
                  className="input"
                  value={t.start}
                  aria-label="开始时间"
                  onChange={(ev) => patchTime(i, ti, { start: ev.target.value })}
                />
                <span className="profileNote">–</span>
                <input
                  type="time"
                  className="input"
                  value={t.end}
                  aria-label="结束时间"
                  onChange={(ev) => patchTime(i, ti, { end: ev.target.value })}
                />
                <button
                  type="button"
                  className="rowBtn danger"
                  aria-label="删除该时间段"
                  onClick={() => patchSeg(i, { times: seg.times.filter((_, at) => at !== ti) })}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="rowBtn"
              onClick={() => patchSeg(i, { times: [...seg.times, { start: "09:00", end: "18:00" }] })}
            >
              ＋ 时间段
            </button>
          </div>
        </div>
      ))}

      <div className="profileActions">
        <button
          type="button"
          className="rowBtn"
          onClick={() => setSegs([...p.segments, { weekdays: [], times: [] }])}
        >
          ＋ 添加子规则
        </button>
        {p.segments.length > 1 ? (
          <button
            type="button"
            className="rowBtn danger"
            onClick={() => setSegs(p.segments.slice(0, -1))}
          >
            删除最后一段
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function SettingsPage(): React.JSX.Element {
  const [data, setData] = React.useState<SettingsRead | null>(null);
  const [draft, setDraft] = React.useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("scheduler");

  // 调度规则编辑器状态
  const [ruleGroups, setRuleGroups] = React.useState<RuleGroups>(freshGroups());

  // 部署数据(调度规则编辑器的 provider / 模型候选)
  const [deployments, setDeployments] = React.useState<DeploymentItem[]>([]);

  // 逻辑模型(「辅助请求路由」的候选:重路由只认 as-one 的抽象模型名)
  const [logicalModels, setLogicalModels] = React.useState<LogicalModelGroup[]>([]);

  // 请求日志(独立端点,不在 settings 字段契约里)
  const [reqLog, setReqLog] = React.useState<RequestLogStatus | null>(null);
  const [logMsg, setLogMsg] = React.useState("");

  const [keyCopied, setKeyCopied] = React.useState(false);

  /* ── 数据加载 ── */

  async function load(): Promise<void> {
    setBusy(true);
    setErr("");
    try {
      const r = await rendererApi.getSettings();
      // 深拷贝当前值作为草稿
      const s = cloneSections(r.sections);
      setData(r);
      setDraft(s);
      parseDraftRules(s);
    } catch (e) {
      setErr(`读取失败:${errText(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadReqLog(): Promise<void> {
    try {
      const r = await rendererApi.getRequestLog();
      setReqLog(r);
    } catch (e) {
      setLogMsg(`读取请求日志状态失败:${errText(e)}`);
    }
  }

  async function loadDeployments(): Promise<void> {
    try {
      const r = await rendererApi.getDeployments();
      setDeployments(r.deployments);
    } catch {
      // 拉不到部署数据不阻塞设置页;规则编辑器只是少了候选补全。
    }
  }

  async function loadLogicalModels(): Promise<void> {
    try {
      setLogicalModels(await rendererApi.getLogicalModels());
    } catch {
      // 同上:候选拉不到时路由卡退化成自由输入的当前值,不影响保存。
    }
  }

  React.useEffect(() => {
    void load();
    void loadReqLog();
    void loadDeployments();
    void loadLogicalModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 草稿 / 保存 ── */

  function setValue(section: string, spec: SettingSpec, raw: string | boolean): void {
    const val = spec.kind === "bool" ? (raw ? "true" : "false") : String(raw);
    setDraft((d) => ({ ...d, [section]: { ...(d[section] ?? {}), [spec.key]: val } }));
  }

  /** 只提交与初始值不同的字段,避免无谓写盘。 */
  function changedPayload(): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    if (!data) return out;
    for (const section of Object.keys(draft)) {
      const orig = data.sections[section] ?? {};
      for (const key of Object.keys(draft[section])) {
        if (JSON.stringify(draft[section][key]) !== JSON.stringify(orig[key])) {
          (out[section] ??= {})[key] = draft[section][key];
        }
      }
    }
    return out;
  }

  /* ── spec / 字段辅助 ── */
  function totalChanged(): number {
    if (!data) return 0;
    let n = 0;
    for (const section of Object.keys(draft)) {
      const orig = data.sections[section] ?? {};
      for (const key of Object.keys(draft[section])) {
        if (JSON.stringify(draft[section][key]) !== JSON.stringify(orig[key])) n++;
      }
    }
    return n;
  }

  async function save(): Promise<void> {
    // 2026-10-24 起无原始 JSON 编辑:直接以卡片视图为准。
    let groups = ruleGroups;
    // 卡片级形状校验(前端只做形状,后端深校验兜底)
    const problem = rulesProblem(groups);
    if (problem) {
      setErr(problem);
      return;
    }
    // 冷却覆盖是独立键:保存时按卡片视图重算,避免 JSON 视图编辑后它与 rules 脱节。
    // ⚠️ 不能只 setDraft 再读 draft —— React 状态是异步的,changedPayload() 会读到旧值。
    const rulesFields = serializeRulesByKey(groups);
    const cooldownJson = serializeCooldowns(groups);
    const profilesJson = serializeProfiles(groups);
    // 用户要求:保存时打印/导出清洗后的最终 JSON(净化:空 model / 空到期时间 / 空 window 均省略)。
    console.log(
      "[调度规则] 保存 - 清洗后最终 JSON:",
      JSON.stringify(
        {
          ...JSON.parse(serializeGroups(groups)),
          "scheduler.cooldown_overrides": JSON.parse(cooldownJson),
          "scheduler.window_profiles": JSON.parse(profilesJson),
        },
        null,
        2,
      ),
    );
    setDraft((d) => ({
      ...d,
      scheduler: {
        ...(d.scheduler ?? {}),
        ...rulesFields,
        "scheduler.cooldown_overrides": cooldownJson,
        "scheduler.window_profiles": profilesJson,
      },
    }));
    const payload = changedPayload();
    // 用刚算出的值覆盖(与初始值不同才提交)。
    const origScheduler = data?.sections["scheduler"] ?? {};
    const schedOut: Record<string, string> = {};
    for (const key of RULES_PRIORITY_KEYS) {
      if (JSON.stringify(rulesFields[key]) !== JSON.stringify(origScheduler[key] ?? "")) {
        schedOut[key] = rulesFields[key];
      }
    }
    if (JSON.stringify(cooldownJson) !== JSON.stringify(origScheduler["scheduler.cooldown_overrides"] ?? "")) {
      schedOut["scheduler.cooldown_overrides"] = cooldownJson;
    }
    if (JSON.stringify(profilesJson) !== JSON.stringify(origScheduler["scheduler.window_profiles"] ?? "")) {
      schedOut["scheduler.window_profiles"] = profilesJson;
    }
    if (Object.keys(schedOut).length > 0) payload["scheduler"] = { ...(payload["scheduler"] ?? {}), ...schedOut };
    if (Object.keys(payload).length === 0) {
      setMsg("没有改动");
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const r = await rendererApi.saveSettings(payload);
      setMsg(r.message || "已保存");
      await load();
    } catch (e) {
      setErr(`保存失败:${errText(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /** 放弃改动 = 重新 load()。 */
  function discard(): void {
    void load();
  }

  /* ── 请求日志(独立端点,立即生效) ── */

  async function saveReqLog(contentMode?: RequestLogContentMode): Promise<void> {
    setBusy(true);
    setLogMsg("");
    try {
      const r = await rendererApi.setRequestLog({ content_mode: contentMode });
      setLogMsg(r.message ?? "");
      await loadReqLog();
    } catch (e) {
      setLogMsg(`保存失败:${errText(e)}`);
    } finally {
      setBusy(false);
    }
  }

  /* ── 只读信息(一键复制到剪贴板) ── */

  async function copyKey(): Promise<void> {
    if (!data?.master_key) return;
    try {
      await navigator.clipboard.writeText(data.master_key);
      setKeyCopied(true);
      window.setTimeout(() => setKeyCopied(false), 2000);
    } catch {
      setKeyCopied(false);
    }
  }

  /* ── spec / 字段辅助 ── */

  /** 段名:契约给了 `section` 就用它(原设计把 `real.wait_budget_s` 摆在 retry 段),
   *  否则按键名前缀推导。 */
  function sectionOf(spec: SettingSpec): string {
    if (spec.section) return spec.section;
    return spec.key.includes(".") ? spec.key.slice(0, spec.key.indexOf(".")) : spec.key;
  }

  function specsOf(section: string): SettingSpec[] {
    if (!data) return [];
    return data.specs.filter((s) => !s.hidden && sectionOf(s) === section);
  }

  function specOf(key: string): SettingSpec | undefined {
    if (!data) return undefined;
    return data.specs.find((s) => !s.hidden && s.key === key);
  }

  /** 字段行:复用全站 `.kv-grid`(左 140px 标签 / 右控件),紧凑整齐。 */
  function field(section: string, spec: SettingSpec, wide = false): React.JSX.Element {
    const value = draft[section]?.[spec.key] ?? "";
    const kind = spec.kind;
    const on = value === "true" || value === "1";
    // ⚠️ 2026-11 用户定案:输入框后面**不显示任何单位**(秒/次/条/分钟等)——
    // 有单位的输入框会比没单位的窄一截、右端参差,破坏整列对齐。单位语义由
    // 标签/字段名承载(如「会话粘性时长(s)」的 key 与范围提示),视觉上一律干净。
    let control: React.JSX.Element;
    if (kind === "bool") {
      control = (
        <label className="setting-check">
          <input
            type="checkbox"
            className="checkInput"
            checked={on}
            disabled={busy}
            onChange={(ev) => setValue(section, spec, ev.target.checked)}
          />
          {on ? "已启用" : "已关闭"}
        </label>
      );
    } else if (kind === "enum") {
      control = (
        <select
          className="input selectInput"
          value={value}
          disabled={busy}
          onChange={(ev) => setValue(section, spec, ev.target.value)}
        >
          {(spec.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    } else if (kind === "json") {
      control = (
        <textarea
          className="input setting-json"
          rows={3}
          value={value}
          disabled={busy}
          onChange={(ev) => setValue(section, spec, ev.target.value)}
        />
      );
    } else {
      // 数字/文本输入统一成裸 .input(不再包 .setting-input-unit、不再挂单位后缀),
      // 这样它与下拉框同为 180px、右端严格对齐。
      control = (
        <input
          className={"input" + (wide ? " wideInput" : "")}
          type={kind === "int" || kind === "float" ? "number" : "text"}
          min={spec.min}
          max={spec.max}
          step={kind === "float" ? "0.1" : undefined}
          value={value}
          disabled={busy}
          onChange={(ev) => setValue(section, spec, ev.target.value)}
        />
      );
    }
    return (
      <React.Fragment key={spec.key}>
        <span className="k">{spec.label}</span>
        <span className="v">{control}</span>
      </React.Fragment>
    );
  }

  /* ── retry 段:两小节(与 retryGroups 对齐) ── */

  function retryGroups(): Array<{ title: string; fields: SettingSpec[] }> {
    const pick = (keys: string[]): SettingSpec[] =>
      keys
        .map((k) => specOf(k))
        .filter((s): s is SettingSpec => s !== undefined);
    return [
      {
        title: "退避形状",
        fields: pick(["retry.base_backoff_s", "retry.max_backoff_s", "retry.jitter_ratio"]),
      },
      // ⭐「请求超时时间」(real.wait_budget_s)归在本小节;契约无此字段时 pick 过滤后自然缺席。
      // ⚠️ 2026-11-09:WorkBuddy 的「账号最小请求间隔」已从设置项**移除**
      // (写死在 core 的 `ACCOUNT_MIN_INTERVAL_MS` = 4 秒)—— 它是账号安全下限,
      // 不该让用户调成 0 把节流关掉(那正是 11140 封号的成因)。
      {
        // ⚠️ `retry.logical_cooldown` **不在这里** —— 2026-11 用户定案移到「冷却」卡
        // （同为「失败后多久不选」的语境）。`specOf` 只按 key 查、不看 section，
        // 所以两边都写就会重复渲染同一个字段。
        title: "重试次数",
        fields: pick(["real.wait_budget_s", "retry.logical_max", "retry.real_max"]),
      },
    ];
  }

  /* ── 调度规则编辑器 ── */

  // provider/model 填写器的候选项 = 已登记的真实模型(按 provider 去重)。
  const providerOptions = [...new Set(deployments.map((d) => d.provider))].sort();

  /** 某 provider 下的可选模型;provider 为空时给全部模型(仍只作提示,可自由填)。 */
  function modelOptionsFor(provider: string): string[] {
    const src = provider ? deployments.filter((d) => d.provider === provider) : deployments;
    return [...new Set(src.map((d) => d.model))].sort();
  }

  /** 规则行引用的命名时段表(只读视图)。 */
  const ruleProfiles = ruleGroups.profiles;

  /* ── 拖动排序状态(与逻辑模型档链同一套手势) ── */
  const schedListRef = React.useRef<HTMLUListElement | null>(null);
  const dragSrcRef = React.useRef<{ tier: TierKey; index: number; handled: boolean } | null>(null);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const [dragSrc, setDragSrc] = React.useState<{ tier: TierKey; index: number } | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ tier: TierKey; insertAt: number } | null>(null);
  const [dragOutside, setDragOutside] = React.useState(false);

  React.useEffect(() => {
    if (dragSrc === null) return;
    const onDocDragOver = (e: DragEvent): void => {
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      const rect = schedListRef.current?.getBoundingClientRect();
      setDragOutside(rect ? outsideRect(rect, e.clientX, e.clientY, 8) : false);
    };
    document.addEventListener("dragover", onDocDragOver);
    return () => document.removeEventListener("dragover", onDocDragOver);
  }, [dragSrc]);

  /**
   * 某段内各行的上下边界(算插入缝隙)。
   *
   * ⚠️ 直接查 DOM 而不是按 index 存 ref:拖动重排后 index 整体错位,
   * 存下来的 ref 数组会指向旧行,落点就会算到别处(这正是"拖动有 bug"的成因)。
   * 用 `data-tier` 现查,永远与当前渲染顺序一致。
   */
  function bandsOf(tier: TierKey): Array<{ top: number; bottom: number }> {
    const root = schedListRef.current;
    if (root === null) return [];
    return [...root.querySelectorAll<HTMLElement>(`li[data-tier="${tier}"]`)].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
  }

  function onRuleDragStart(tier: TierKey, index: number, e: React.DragEvent<HTMLSpanElement>): void {
    dragSrcRef.current = { tier, index, handled: false };
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    setDragSrc({ tier, index });
    setDropTarget(null);
    setDragOutside(false);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${tier}:${index}`);
  }

  function onSegDragOver(tier: TierKey, e: React.DragEvent<HTMLElement>): void {
    if (dragSrcRef.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ tier, insertAt: insertIndexAt(bandsOf(tier), e.clientY) });
  }

  function onSegDrop(tier: TierKey, e: React.DragEvent<HTMLElement>): void {
    e.preventDefault();
    const d = dragSrcRef.current;
    if (d === null) return;
    d.handled = true;
    dragMoveRule({ tier: d.tier, index: d.index }, { tier, insertAt: insertIndexAt(bandsOf(tier), e.clientY) });
  }

  function onRuleDragEnd(e: React.DragEvent<HTMLSpanElement>): void {
    const d = dragSrcRef.current;
    dragSrcRef.current = null;
    setDragSrc(null);
    setDropTarget(null);
    setDragOutside(false);
    if (d === null || d.handled) return;
    const rect = schedListRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p =
      e.clientX !== 0 || e.clientY !== 0
        ? { x: e.clientX, y: e.clientY }
        : (lastPointRef.current ?? { x: e.clientX, y: e.clientY });
    // 拖出整个列表松手 = 删除(与逻辑模型档链同一语义)。
    if (outsideRect(rect, p.x, p.y, 8)) removeTier(d.tier, d.index);
  }

  function updateRules(next: RuleGroups): void {
    setRuleGroups(next);
    const rulesFields = serializeRulesByKey(next);
    setDraft((d) => ({
      ...d,
      scheduler: {
        ...(d.scheduler ?? {}),
        ...rulesFields,
        "scheduler.cooldown_overrides": serializeCooldowns(next),
        "scheduler.window_profiles": serializeProfiles(next),
      },
    }));
  }

  /**
   * 拖动换位(2026-11 用户定案:排序**完全靠拖动**,不放 ↑↓ 按钮)。
   *
   * - 段内拖动 = 调整该段内的先后(数组顺序即优先级);
   * - 拖到别的段 = 整条规则改优先级(等价于之前的下拉换档);
   * - 拖出整个列表松手 = 删除该条(与逻辑模型档链同一手势)。
   */
  function dragMoveRule(from: { tier: TierKey; index: number }, to: { tier: TierKey; insertAt: number }): void {
    const fromList = tierList(from.tier);
    const rule = fromList[from.index];
    if (rule === undefined) return;
    if (from.tier === to.tier) {
      updateRules({ ...ruleGroups, [from.tier]: moveItemTo(fromList, from.index, to.insertAt) });
      return;
    }
    const targetList = [...tierList(to.tier)];
    const at = Math.max(0, Math.min(targetList.length, to.insertAt));
    targetList.splice(at, 0, rule);
    updateRules({
      ...ruleGroups,
      [from.tier]: fromList.filter((_, i) => i !== from.index),
      [to.tier]: targetList,
    });
  }

  /** 时段表增删改(设置页「时段配置」卡)。 */
  function patchProfile(id: string, patch: Partial<WindowProfileRow>): void {
    updateRules({
      ...ruleGroups,
      profiles: ruleGroups.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  }
  function addProfile(): void {
    // id 用时间戳保证唯一(用户可见名可改;id 是规则引用键,不随改名变)。
    const id = `custom-${Date.now().toString(36)}`;
    updateRules({
      ...ruleGroups,
      profiles: [...ruleGroups.profiles, { id, name: "新时段", segments: [] }],
    });
  }
  function removeProfile(id: string): void {
    updateRules({ ...ruleGroups, profiles: ruleGroups.profiles.filter((p) => p.id !== id) });
  }

  // 2026-11 用户定案:五档统一形状;P3 已从界面**移除** —— 没有规则就是 P3(基线档)。
  // 保留 "consume" 键只为解析旧库数据能读到(见 tierList),界面上不再出现。
  const TIER_KEYS = ["free", "expiry", "degrade", "disabled"] as const;
  /** 界面可编辑的四个段(P3 不在其中)。 */
  type TierKey = (typeof TIER_KEYS)[number];
  /** 读取包含 P3(旧库数据的 consume 组仍要能解析与往返保留)。 */
  type AnyTierKey = TierKey | "consume";

  function tierList(key: AnyTierKey): TierRule[] {
    switch (key) {
      case "free":
        return ruleGroups.free;
      case "expiry":
        return ruleGroups.expiry;
      case "consume":
        return ruleGroups.consume;
      case "degrade":
        return ruleGroups.degrade;
      case "disabled":
        return ruleGroups.disabled;
    }
  }
  function patchTier(key: TierKey, i: number, patch: Partial<TierRule>): void {
    const next = { ...ruleGroups, [key]: tierList(key).map((r, at) => (at === i ? { ...r, ...patch } : r)) };
    updateRules(next);
  }
  function addTier(key: TierKey): void {
    updateRules({ ...ruleGroups, [key]: [...tierList(key), { provider: "", model: "", expires_at: "", profile: "" }] });
  }
  function removeTier(key: TierKey, i: number): void {
    updateRules({ ...ruleGroups, [key]: tierList(key).filter((_, at) => at !== i) });
  }
  function patchCooldown(i: number, patch: Partial<CooldownRule>): void {
    updateRules({ ...ruleGroups, cooldown: ruleGroups.cooldown.map((r, at) => (at === i ? { ...r, ...patch } : r)) });
  }
  function addCooldown(): void {
    updateRules({ ...ruleGroups, cooldown: [...ruleGroups.cooldown, { provider: "", cooldown: 15 }] });
  }
  function removeCooldown(i: number): void {
    updateRules({ ...ruleGroups, cooldown: ruleGroups.cooldown.filter((_, at) => at !== i) });
  }

  /** 从独立键 `scheduler.cooldown_overrides` 读冷却覆盖,覆盖 rules 里旧数据搬来的那份。 */
  function parseCooldowns(raw: string | undefined, base: RuleGroups): RuleGroups {
    if (!raw) return base;
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      return base;
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return base;
    const cooldown: CooldownRule[] = [];
    for (const [provider, minutes] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) continue;
      cooldown.push({ provider, cooldown: minutes });
    }
    return { ...base, cooldown };
  }

  function parseDraftRules(s: Record<string, Record<string, string>>): void {
    // JSON 坏了不炸卡片 —— 卡片保持空/上次(无 JSON 视图后,坏键由保存时后端深校验兜底)。
    // 2026-10-22 拆 5 键:合并 5 个档位键为一个 JSON 文本给 parseRules。
    const merged: Record<string, unknown> = {};
    for (const key of RULES_PRIORITY_KEYS) {
      const raw = s.scheduler?.[key] ?? "";
      if (raw.trim() === "") continue;
      try {
        merged[key] = JSON.parse(raw);
      } catch {
        /* 单键坏了:跳过,卡片空 */
      }
    }
    const raw = JSON.stringify(merged, null, 2);
    const res = parseRules(raw);
    const base = parseCooldowns(s.scheduler?.["scheduler.cooldown_overrides"], res.ok ? res.groups : freshGroups());
    // 命名时段表(独立键):规则通过 window.profile 引用它。
    const groups: RuleGroups = { ...base, profiles: parseProfiles(s.scheduler?.["scheduler.window_profiles"]) };
    setRuleGroups(groups);
  }

  /**
   * 调度列表（2026-11 用户定案：整合成**一个列表**，用分隔占位符分段）。
   *
   * 结构：分隔 · P1 · 分隔 · P2 · 分隔 · P4 · 分隔 · 禁用
   *   - 分隔条既是**段标题**（高优先 / 次优先 / 低优先 / 禁用），也是**添加位**；
   *   - P3 不显示 —— 没有规则就是 P3（引擎里 P3 是基线档）；
   *   - 排序**完全靠拖动**：段内拖动改先后，拖到别的段即改优先级，拖出列表即删除。
   */
  function schedulerPanels(): React.JSX.Element[] {
    const out: React.JSX.Element[] = [];
    const segments: Array<{ key: TierKey; badge: string; title: string }> = [
      { key: "free", badge: "P1", title: "高优先" },
      { key: "expiry", badge: "P2", title: "次优先" },
      { key: "degrade", badge: "P4", title: "低优先" },
      { key: "disabled", badge: "禁用", title: "禁用" },
    ];
    const rows: React.JSX.Element[] = [];
    for (const seg of segments) {
      const list = tierList(seg.key);
      rows.push(
        <li
          key={`sep-${seg.key}`}
          className="sched-sep"
          onDragOver={(e) => onSegDragOver(seg.key, e)}
          onDrop={(e) => onSegDrop(seg.key, e)}
        >
          <span className="rowTag sched-sep-badge">{seg.badge}</span>
          <span className="sched-sep-title">{seg.title}</span>
          <span className="card-extra">{list.length} 条</span>
          <button type="button" className="rowBtn sched-sep-add" onClick={() => addTier(seg.key)}>
            ＋ 添加
          </button>
        </li>,
      );
      for (const [i, r] of list.entries()) {
        rows.push(
          <li
            key={`${seg.key}-${r.provider}-${r.model}-${i}`}
            className="schedRowOuter"
            data-tier={seg.key}
            onDragOver={(e) => onSegDragOver(seg.key, e)}
            onDrop={(e) => onSegDrop(seg.key, e)}
          >
            <RuleRow
              rule={r}
              profiles={ruleProfiles}
              providerOptions={providerOptions}
              modelOptions={modelOptionsFor(r.provider)}
              dragging={dragSrc !== null && dragSrc.tier === seg.key && dragSrc.index === i}
              dropBefore={dropTarget !== null && dropTarget.tier === seg.key && dropTarget.insertAt === i}
              onDragStart={(e) => onRuleDragStart(seg.key, i, e)}
              onDragEnd={onRuleDragEnd}
              onPatch={(patch) => patchTier(seg.key, i, patch)}
              onRemove={() => removeTier(seg.key, i)}
            />
          </li>,
        );
      }
      // 段内末位的落点标记(拖到该段最末)。
      if (dropTarget !== null && dropTarget.tier === seg.key && dropTarget.insertAt === list.length) {
        rows.push(<li key={`drop-${seg.key}`} className="dropMarker" aria-hidden="true" />);
      }
    }
    out.push(
      <section key="sched-list" className="card setting-card">
        <div className="card-head">
          <h2>调度优先级</h2>
          {/* 只保留**动态反馈**(拖出列表时警告);静态说明交给 ⠿ 的 title 悬浮提示。 */}
          {dragOutside ? <span className="chainHint chainHintDanger">松手即删除</span> : null}
        </div>
        <ul
          className={`rows sched-rows${dragOutside ? " schedRowsOutside" : ""}`}
          ref={(el) => {
            schedListRef.current = el;
            if (el === null) return;
            // 每段一个隐藏的「段容器」标记,供 bandsOf 按段取行。
            void el;
          }}
          onDragOver={(e) => {
            // 列表空白处也接受拖动:按指针落在哪段来决定。
            if (dragSrcRef.current === null) return;
            e.preventDefault();
          }}
        >
          {rows}
        </ul>
      </section>,
    );
    return out;
  }

  /**
   * 命名时段配置卡 —— **常展开**,一条时段可含多条子规则。
   *
   * 与「调度优先级」并列成两张主卡(而不是跟会话粘性、路由挤在一起),
   * 因为它是规则的直接依赖:规则行里的「时段」下拉选项就来自这里。
   */
  function profilesCard(): React.JSX.Element {
    const list = ruleGroups.profiles;
    return (
      <section key="profiles" className="card setting-card">
        <div className="card-head">
          <h2>时段配置</h2>
          <button type="button" className="btn btn-sm" onClick={addProfile}>
            ＋ 添加时段
          </button>
        </div>
        {list.length === 0 ? null : (
          <ul className="rows profileRows">
            {list.map((p) => (
              <ProfileCard
                key={p.id}
                profile={p}
                onPatch={(patch) => patchProfile(p.id, patch)}
                onRemove={() => removeProfile(p.id)}
              />
            ))}
          </ul>
        )}
      </section>
    );
  }

  /**
   * 「辅助请求路由」+ 会话粘性 + 压缩模式 —— 合成一张卡。
   *
   * 2026-11 用户定案:
   * - 压缩增强只剩「压缩模式」一个下拉,并进本卡(逻辑模型复用上面的「压缩摘要」);
   * - **不同的项目不分列**:每个字段一行,标签左、控件右,同一组横向铺开;
   * - 不再有子代理并发限制、不再有压缩启用开关/压缩模型/tiers。
   */
  function miscSchedCard(): React.JSX.Element | null {
    const routeSpecs = ROUTE_KEYS.map((k) => specOf(k)).filter((s): s is SettingSpec => s !== undefined);
    const modeSpec = specOf("compaction.promptMode");
    if (pinSecondsSpec === undefined && routeSpecs.length === 0 && modeSpec === undefined) return null;
    const names = logicalModels.map((m) => m.model).filter((m) => m !== "").sort();
    const labelOf = (name: string): string => {
      const hit = logicalModels.find((m) => m.model === name);
      return hit?.display_name && hit.display_name !== name ? `${hit.display_name}(${name})` : name;
    };
    return (
      <section key="misc" className="card setting-card">
        <div className="card-head">
          <h2>辅助请求路由</h2>
        </div>
        <div className="kv-grid kv-wide-grid">
          {/* 三条重路由车道 */}
          {routeSpecs.map((spec) => {
            const value = draft.route?.[spec.key] ?? "";
            // 历史值(库里配的、但当前逻辑模型列表里没有)也要留在选项里,
            // 否则下拉框会显示成第一项「不重路由」,用户一保存就把配置抹了。
            const options = value === "" || names.includes(value) ? names : [value, ...names];
            return (
              <React.Fragment key={spec.key}>
                <span className="k">{spec.label}</span>
                <span className="v">
                  <select
                    className="input selectInput"
                    value={value}
                    disabled={busy}
                    onChange={(ev) => setValue("route", spec, ev.target.value)}
                  >
                    <option value="">不重路由</option>
                    {options.map((n) => (
                      <option key={n} value={n}>
                        {labelOf(n)}
                      </option>
                    ))}
                  </select>
                </span>
              </React.Fragment>
            );
          })}

          {/* 压缩模式(逻辑模型取自上面的「压缩摘要」) */}
          {modeSpec !== undefined ? field("compaction", modeSpec) : null}

          {/* 会话粘性 */}
          {pinSecondsSpec !== undefined ? field("scheduler", pinSecondsSpec) : null}
        </div>
      </section>
    );
  }

  /**
   * 冷却卡 —— 供应商级冷却覆盖 + 逻辑模型成员冷却，合成一张。
   *
   * 2026-11 用户定案:
   * - 样式参考调度卡（行式，但**没有拖动排序** —— 冷却顺序无意义）;
   * - `retry.logical_cooldown` 从重试卡移到这里（同为「失败后多久不选」语境）。
   */
  function cooldownCard(): React.JSX.Element {
    const g = ruleGroups;
    const memberSpec = specOf("retry.logical_cooldown");
    return (
      <section className="card setting-card">
        <div className="card-head">
          <h2>冷却</h2>
          <button type="button" className="btn btn-sm" onClick={addCooldown}>
            ＋ 添加供应商
          </button>
        </div>
        <ul className="rows sched-rows cooldownRows">
          {/* 逻辑模型成员冷却 —— 与供应商行**同构**(同一个 .rowCard + .ruleRowLine,
           * 同样带边框、同一列宽,只是没有拖动与删除)。
           * 2026-11 用户定案(参考图):标签本身是**带边框的框**(视觉上等同供应商
           * 下拉框那一格),单位「分钟」落在输入框右侧,与供应商行一致。 */}
          {memberSpec !== undefined ? (
            <li className="rowCard ruleRowCard">
              <div className="ruleRowLine">
                <span className="cooldownFieldLabel" title={memberSpec.label}>
                  {memberSpec.label}
                </span>
                <input
                  type="number"
                  min={memberSpec.min}
                  max={memberSpec.max}
                  className="input ruleField ruleNum"
                  title={`${memberSpec.label}(分钟)`}
                  value={draft[sectionOf(memberSpec)]?.[memberSpec.key] ?? ""}
                  disabled={busy}
                  onChange={(ev) => setValue(sectionOf(memberSpec), memberSpec, ev.target.value)}
                />
                <span className="ruleUnit">分钟</span>
              </div>
            </li>
          ) : null}
          {g.cooldown.map((r, i) => (
            <CooldownRuleRow
              key={i}
              rule={r}
              providerOptions={providerOptions}
              onPatch={(patch) => patchCooldown(i, patch)}
              onRemove={() => removeCooldown(i)}
            />
          ))}
        </ul>
      </section>
    );
  }

  /* ── 辅助请求路由(route.*)─────────────────────────────────────── */

  /**
   * 三张「车道」的字段键 —— 与 `src/reroute.ts` 的 `REROUTE_SETTING_KEYS` 逐字对应。
   *
   * 为什么单独开一张卡:这三个键 2026-11-14 之前只在 `SETTING_FIELDS` 里登记过、
   * 页面上**从来没有渲染入口**(`sectionCard` 只认 external_refresh / retry / ui),
   * 于是一个能改行为的功能变成了只能改库的死开关。
   */
  const ROUTE_KEYS = ["route.compact", "route.vision", "route.session_title"] as const;

  /** 单张设置卡(外部数据刷新 / 重试策略 / 界面)。 */
  function sectionCard(section: "external_refresh" | "retry" | "ui"): React.JSX.Element | null {
    const specs = specsOf(section);
    if (specs.length === 0) return null;
    const meta = SECTION_TITLES[section];
    let body: React.JSX.Element;
    if (section === "retry") {
      body = (
        <div className="setting-groups">
          {/* 两个小节**两列并排**(用户 2026-11)。窄屏由 CSS 自动降为一列。 */}
          <div className="setting-group-cols">
            {retryGroups().map((grp) => (
              <div key={grp.title} className="setting-group">
                <div className="setting-group-title">{grp.title}</div>
                <div className="kv-grid">
                  {grp.fields.map((s) => field("retry", s))}
                </div>
              </div>
            ))}
          </div>
          {/* 可重试错误码 —— 标签左/输入框右**同一行**(用户 2026-11:不要分成两行);
              值较长,给它单独一个 .kv-grid,输入框用 .wideInput 撑满剩余宽度。 */}
          {codesField ? (
            <div className="kv-grid">{field("retry", codesField, true)}</div>
          ) : null}
          {chartBlock}
        </div>
      );
    } else {
      body = (
        <div className="kv-grid">
          {specs.map((s) => field(section, s))}
        </div>
      );
    }
    return (
      <section key={section} id={section} className="card setting-card">
        <div className="card-head">
          <h2>{meta.title}</h2>
        </div>
        {body}
      </section>
    );
  }

  /* ── 主渲染 ── */

  const chart = backoffChart(draft);
  const codesField = specOf("retry.codes");
  const pinSecondsSpec = specOf("scheduler.pin_seconds");

  // 退避曲线(随草稿实时重算,挂在 retry 卡内)
  const chartBlock = (
    <div className="ui-chart-wrap">
      <svg className="ui-chart" viewBox={`0 0 ${chart.W} ${chart.H}`}>
        {/* 纵轴:秒数刻度 + 网格线 */}
        <line className="ui-chart-yaxis" x1={chart.padL} y1={chart.padT} x2={chart.padL} y2={chart.y(0)} />
        {chart.yTicks.map((t) => (
          <g key={`y${t.v}`}>
            <line className="ui-chart-grid" x1={chart.padL} y1={t.y} x2={chart.W - chart.padR} y2={t.y} />
            <text className="ui-chart-label" x={chart.padL - 6} y={t.y} textAnchor="end" dominantBaseline="middle">
              {chart.fmtAxis(t.v)}
            </text>
          </g>
        ))}
        <line className="ui-chart-axis" x1={chart.padL} y1={chart.y(0)} x2={chart.W - chart.padR} y2={chart.y(0)} />
        {/* 抖动带:[raw*(1-j), raw],只向下 */}
        {chart.seq.map((v, i) => (
          <rect
            key={`band${i}`}
            className="ui-chart-band"
            x={chart.x(i) - chart.bandW / 2}
            y={chart.y(v)}
            width={chart.bandW}
            height={Math.max(0, chart.y(v * (1 - chart.jit)) - chart.y(v))}
          />
        ))}
        {/* 虚线竖标:逻辑模型档位 */}
        <line className="ui-chart-dash" x1={chart.dashX} y1={chart.padT} x2={chart.dashX} y2={chart.y(0)} />
        {/* 折线 + 圆点 */}
        <polyline className="ui-chart-line" points={chart.seq.map((v, i) => `${chart.x(i)},${chart.y(v)}`).join(" ")} />
        {chart.seq.map((v, i) => (
          <circle key={`dot${i}`} className="ui-chart-dot" cx={chart.x(i)} cy={chart.y(v)} r={4} />
        ))}
        {/* 档位刻度(值本身画在圆点上) */}
        {chart.seq.map((_v, i) => (
          <text key={`tick${i}`} className="ui-chart-tick" x={chart.x(i)} y={chart.H - 8} textAnchor="middle">
            {i + 1}
          </text>
        ))}
      </svg>
      <div className="ui-chart-text">
        <p>{chart.seqText}</p>
        <p>{chart.budgetKText}</p>
        <p>{chart.budgetMText}</p>
      </div>
    </div>
  );

  // ⚠️ 根节点**不要**再挂 `.content` —— `App.tsx` 的 `<main className="content">`
  // 已经提供了一层（padding 16/20/40 + max-width）。再套一层会让 padding 叠加成
  // 40px 左缩进，设置页的标题 / 导航 / 卡片就比模型页整体偏右 20px
  // （用户 2026-11 报的「边距不一致」）。
  return (
    <div className="settings-page">
      <h1 className="page-title">设置</h1>
      {busy ? <p className="hint">加载中…</p> : null}
      {err ? <p className="ov-err">{err}</p> : null}

      {data ? (
        <>
          {/* 二级导航:与「模型」页的 `.subtabs/.subtab` **同款** ——
              用户 2026-11 定案「统一子标题样式,不要用量统计的 usage-seg」。 */}
          <nav className="subtabs" role="tablist" aria-label="设置分类">
            {SETTINGS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={activeTab === t.key}
                className={`subtab${activeTab === t.key ? " on" : ""}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="settings-body">
            {/* 调度:选什么模型(优先级列表 / 时段配置 / 其它调度参数) */}
            {activeTab === "scheduler" ? (
              <>
                {schedulerPanels()}
                {profilesCard()}
                {miscSchedCard()}
              </>
            ) : null}
            {/* 策略:怎么请求(重试+退避 / 冷却) */}
            {activeTab === "policy" ? (
              <>
                {sectionCard("retry")}
                {cooldownCard()}
              </>
            ) : null}
            {/* 其他:原先的「集成 / 界面 / 系统」三组零散项合并到此 */}
            {activeTab === "misc" ? (
              <>
                {sectionCard("external_refresh")}
                {sectionCard("ui")}
                {/* 请求日志(独立端点,立即生效) */}
                {reqLog ? (
                  <section id="request-log" className="card setting-card">
                    <div className="card-head">
                      <h2>请求日志</h2>
                    </div>
                    <div className="kv-grid">
                      <span className="k">记录档位</span>
                      <span className="v">
                        <select
                          className="input selectInput"
                          value={reqLog.content_mode}
                          disabled={busy}
                          onChange={(ev) => void saveReqLog(ev.target.value as RequestLogContentMode)}
                        >
                          {reqLog.content_modes.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </span>
                      {/* 落盘位置:标签左 / 内容右,**同一行**(用户 2026-11:不要分行) */}
                      <span className="k">落盘位置</span>
                      <span className="v">
                        <span className="setting-key-row">
                          <code className="setting-key">{reqLog.path}</code>
                          <span className="pill">{reqLog.counters?.written ?? 0} 条</span>
                          <span className="pill">{reqLog.size_bytes} 字节</span>
                        </span>
                        {reqLog.last_error ? <span className="ov-err">上次记录失败:{reqLog.last_error}</span> : null}
                      </span>
                    </div>
                    {logMsg ? <p className="hint">{logMsg}</p> : null}
                  </section>
                ) : null}
                <section id="readonly" className="card setting-card">
                  <div className="card-head">
                    <h2>只读信息</h2>
                  </div>
                  <div className="kv-grid">
                    <span className="k">ONE_API_KEY</span>
                    <span className="v">
                      {data.master_key ? (
                        <span className="setting-key-row">
                          <code className="setting-key">{data.master_key}</code>
                          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void copyKey()}>
                            {keyCopied ? "已复制 ✓" : "复制"}
                          </button>
                        </span>
                      ) : (
                        <span className="ov-err">未设置</span>
                      )}
                    </span>
                  </div>
                </section>
              </>
            ) : null}
          </div>

          {/* 底部保存栏:静态 footer,不遮挡卡片(复用全站按钮)。 */}
          <div className="setting-savebar">
            <span className="setting-savebar-count">
              {totalChanged() > 0 ? (
                <>
                  <span className="setting-savebar-dot" />
                  {totalChanged()} 项未保存
                </>
              ) : (
                "没有未保存的改动"
              )}
            </span>
            {msg ? <span className="setting-savebar-msg">{msg}</span> : null}
            <span className="setting-savebar-btns">
              <button type="button" className="secondaryButton" disabled={busy} onClick={discard}>
                放弃改动
              </button>
              <button
                type="button"
                className="primaryButton"
                disabled={busy || totalChanged() === 0}
                onClick={() => void save()}
              >
                保存设置
              </button>
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export { SettingsPage };
