/**
 * 设置页 —— Nexus 面板 Settings.vue 的严格 1:1 复刻(用户 m08793「所有页面严格按 nexus 复刻」)。
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
 * - 契约缺 real.wait_budget_s:「重试次数与冷却」组按现有规格渲染(Nexus pick 同款过滤),不留空位提示。
 * - RequestLogStatus.content_modes 与 Nexus 一致为 {value,label}:option 显示中文 label(不再摆机器值)。
 * - 请求日志卡无「开关」(2026-10-27 用户 m17413:移除开关,档位即全部控制 —— off=不写明细,仅统计聚合)。
 * - master_key 未设置 → 空态文案「未设置 ONE_API_KEY:当前无鉴权(所有请求放行)」。
 * - saveSettings → msg = r.message || "已保存";changedPayload 逐键 JSON.stringify diff。
 * - As One 的 setRequestLog 诚实返回 {ok:false}(未实现落盘):照 Nexus 交互渲染,
 *   r.message 经 logMsg 展示,不隐藏失败。
 */
import React from "react";
import { rendererApi } from "../api";
import {
  CooldownBox,
  ExpiryBox,
  ModelBox,
  ProviderBox,
  RULES_PRIORITY_KEYS,
  TimesBox,
  WeekdayBox,
  cooldownErr,
  freshGroups,
  parseRules,
  ruleCard,
  rulesProblem,
  serializeCooldowns,
  serializeGroups,
  serializeRulesByKey,
  tierErr,
} from "./settings-rules";
import type { CooldownRule, RuleGroups, TierRule } from "./settings-rules";
import type {
  DeploymentItem,
  LogicalModelGroup,
  RequestLogContentMode,
  RequestLogStatus,
  SettingSpec,
  SettingsRead,
} from "../api";

/* ── 常量(与 Nexus Settings.vue 逐字对齐) ─────────────────────── */

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

const UNIT_BY_KEY: Record<string, string> = {
  "external_refresh.interval_hours": "小时",
  "retry.base_backoff_s": "秒",
  "retry.max_backoff_s": "秒",
  "retry.jitter_ratio": "比例",
  "retry.logical_max": "次",
  "retry.real_max": "次",
  "retry.logical_cooldown": "分钟",
  "real.wait_budget_s": "秒",
  "scheduler.pin_seconds": "秒",
  "ui.recent_limit": "条",
};


/* ── 退避曲线(与 Nexus backoffChart computed 对齐,草稿值实时重算) ── */

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

export default function SettingsPage(): React.JSX.Element {
  const [data, setData] = React.useState<SettingsRead | null>(null);
  const [draft, setDraft] = React.useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");

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
    // 用户要求:保存时打印/导出清洗后的最终 JSON(净化:空 model / 空到期时间 / 空 window 均省略)。
    console.log(
      "[调度规则] 保存 - 清洗后最终 JSON:",
      JSON.stringify(
        { ...JSON.parse(serializeGroups(groups)), "scheduler.cooldown_overrides": JSON.parse(cooldownJson) },
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

  /** 段名:契约给了 `section` 就用它(Nexus 把 `real.wait_budget_s` 摆在 retry 段),
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

  function field(section: string, spec: SettingSpec, wide = false): React.JSX.Element {
    const value = draft[section]?.[spec.key] ?? "";
    const kind = spec.kind;
    const unit = UNIT_BY_KEY[spec.key] || "";
    const on = value === "true" || value === "1";
    return (
      <div key={spec.key} className={"ui-field" + (wide || kind === "json" ? " wide" : "")}>
        <div className="ui-field-head">
          <span className="ui-field-label">{spec.label}</span>
          {unit ? <span className="ui-field-unit">{unit}</span> : null}
        </div>
        {kind === "bool" ? (
          <label className="ui-check">
            <input
              type="checkbox"
              checked={on}
              disabled={busy}
              onChange={(ev) => setValue(section, spec, ev.target.checked)}
            />
            {on ? "已启用" : "已关闭"}
          </label>
        ) : kind === "enum" ? (
          <select
            className="ui-select"
            value={value}
            disabled={busy}
            onChange={(ev) => setValue(section, spec, ev.target.value)}
          >
            {(spec.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : kind === "json" ? (
          <textarea
            className="ui-jsonbox"
            rows={10}
            value={value}
            disabled={busy}
            onChange={(ev) => setValue(section, spec, ev.target.value)}
          />
        ) : (
          <input
            className="ui-input"
            type={kind === "int" || kind === "float" ? "number" : "text"}
            min={spec.min}
            max={spec.max}
            step={kind === "float" ? "0.1" : undefined}
            value={value}
            disabled={busy}
            onChange={(ev) => setValue(section, spec, ev.target.value)}
          />
        )}
      </div>
    );
  }

  /* ── retry 段:两小节(与 Nexus retryGroups 对齐) ── */

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
        title: "重试次数与冷却",
        fields: pick([
          "real.wait_budget_s",
          "retry.logical_max",
          "retry.real_max",
          "retry.logical_cooldown",
        ]),
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

  function updateRules(next: RuleGroups): void {
    setRuleGroups(next);
    const rulesFields = serializeRulesByKey(next);
    setDraft((d) => ({
      ...d,
      scheduler: {
        ...(d.scheduler ?? {}),
        ...rulesFields,
        "scheduler.cooldown_overrides": serializeCooldowns(next),
      },
    }));
  }

  // 2026-10-24 五档统一形状:一个 patch / add / remove 函数覆盖全部档位。
  const TIER_KEYS = ["free", "expiry", "consume", "degrade", "disabled"] as const;
  type TierKey = (typeof TIER_KEYS)[number];

  function tierList(key: TierKey): TierRule[] {
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
    updateRules({ ...ruleGroups, [key]: [...tierList(key), { provider: "", model: "", expires_at: "", weekdays: [], times: [] }] });
  }
  function removeTier(key: TierKey, i: number): void {
    updateRules({ ...ruleGroups, [key]: tierList(key).filter((_, at) => at !== i) });
  }
  function addTime(i: number, key: TierKey): void {
    const list = tierList(key);
    patchTier(key, i, { times: [...list[i].times, { start: "09:00", end: "18:00" }] });
  }
  function removeTime(i: number, ti: number, key: TierKey): void {
    const list = tierList(key);
    patchTier(key, i, { times: list[i].times.filter((_, at) => at !== ti) });
  }
  function toggleDay(i: number, d: number, key: TierKey): void {
    const list = tierList(key);
    const r = list[i];
    const weekdays = r.weekdays.includes(d)
      ? r.weekdays.filter((w) => w !== d)
      : [...r.weekdays, d];
    patchTier(key, i, { weekdays });
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
    const groups = parseCooldowns(s.scheduler?.["scheduler.cooldown_overrides"], res.ok ? res.groups : freshGroups());
    setRuleGroups(groups);
  }

  /**
   * 调度规则面板组 —— 五档(P1~P4 + 禁用)+ 冷却各自一张平级卡片。
   *
   * 2026-11-03 用户定案:移除「调度规则」总卡框。原先 rulesEditor() 返回的
   * 单个 .asone-scheduler 容器被拆成 7 张与「外部数据刷新」同级的 .ui-card,
   * 保存逻辑(ruleGroups → serializeRulesByKey)完全不变。
   *
   * 2026-11-03 用户定案(二):卡片标题口径统一 —— P1~P4 副标题一律「调度优先级」,
   * 「禁用」「冷却」两张卡只留徽标(副标题传空串,ruleCard 不渲染副标题 span)。
   * 2026-11-07 起不再传任何行为说明(hint),档位差异只由徽标承载。
   */
  function schedulerPanels(): React.JSX.Element[] {
    const g = ruleGroups;
    const out: React.JSX.Element[] = [];

    for (const p of TIER_PANELS) {
      const key = p.key as TierKey;
      out.push(
        <React.Fragment key={p.key}>
          {ruleCard(
            p.badge,
            p.title,
            tierList(key),
            () => addTier(key),
            (r, i) => {
              const e = tierErr(r);
              return (
                <>
                  <div className="blocks-container">
                    <ProviderBox
                      value={r.provider}
                      options={providerOptions}
                      onSelect={(v) => patchTier(key, i, { provider: v, model: "" })} // 联动重置:换 Provider 清空 Model
                      onDelete={() => removeTier(key, i)}
                    />
                    <ModelBox
                      optional
                      value={r.model}
                      options={modelOptionsFor(r.provider)}
                      onSelect={(v) => patchTier(key, i, { model: v })}
                    />
                    <ExpiryBox value={r.expires_at} onChange={(v) => patchTier(key, i, { expires_at: v })} />
                    <WeekdayBox idPrefix={`tier-${key}-${i}`} weekdays={r.weekdays} onToggle={(d) => toggleDay(i, d, key)} />
                    <TimesBox times={r.times} onPatch={(next) => patchTier(key, i, { times: next })} />
                  </div>
                  {e ? <p className="rule-err">{e}</p> : null}
                </>
              );
            },
          )}
        </React.Fragment>,
      );
    }

    // 供应商级冷却覆盖(独立设置键 scheduler.cooldown_overrides)
    out.push(
      <React.Fragment key="cooldown">
        {ruleCard(
          "冷却",
          "",
          g.cooldown,
          addCooldown,
          (r, i) => {
            const e = cooldownErr(r);
            return (
              <>
                <div className="blocks-container">
                  <ProviderBox
                    value={r.provider}
                    options={providerOptions}
                    onSelect={(v) => patchCooldown(i, { provider: v })}
                    onDelete={() => removeCooldown(i)}
                  />
                  <CooldownBox value={r.cooldown} onChange={(v) => patchCooldown(i, { cooldown: v })} />
                </div>
                {e ? <p className="rule-err">{e}</p> : null}
              </>
            );
          },
        )}
      </React.Fragment>,
    );

    // 会话粘性(独立设置键 scheduler.pin_seconds):同样拆成平级卡片,字段仍可编辑
    if (pinSecondsSpec) {
      out.push(
        <section key="pin" id="sched-pin" className="ui-card">
          <div className="ui-card-head">
            <h2 className="ui-card-title">会话粘性</h2>
            <span className="ui-card-sub">同一会话在粘性时长内保持同一后端</span>
          </div>
          <div className="ui-fields">{field("scheduler", pinSecondsSpec)}</div>
        </section>,
      );
    }

    return out;
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

  function routingCard(): React.JSX.Element | null {
    const specs = ROUTE_KEYS.map((k) => specOf(k)).filter((s): s is SettingSpec => s !== undefined);
    if (specs.length === 0) return null;
    const names = logicalModels.map((m) => m.model).filter((m) => m !== "").sort();
    const labelOf = (name: string): string => {
      const hit = logicalModels.find((m) => m.model === name);
      return hit?.display_name && hit.display_name !== name ? `${hit.display_name}(${name})` : name;
    };
    return (
      <section key="route" id="route" className="ui-card">
        <div className="ui-card-head">
          <h2 className="ui-card-title">辅助请求路由</h2>
          <span className="ui-card-sub">压缩摘要 / 图片解析 / 会话标题走哪个模型</span>
        </div>
        <p className="ui-field-hint">
          宿主除了你这一轮对话,还会自己发三种辅助请求。这里给每种请求单独指定 as-one 里的
          <b>逻辑模型</b>;留空 = <b>不重路由</b>,按客户端给的模型原样走。配了库里没有的模型会回落原模型并告警。
        </p>
        <div className="ui-fields">
          {specs.map((spec) => {
            const value = draft.route?.[spec.key] ?? "";
            // 历史值(库里配的、但当前逻辑模型列表里没有)也要留在选项里,
            // 否则下拉框会显示成第一项「不重路由」,用户一保存就把配置抹了。
            const options = value === "" || names.includes(value) ? names : [value, ...names];
            return (
              <div key={spec.key} className="ui-field">
                <div className="ui-field-head">
                  <span className="ui-field-label">{spec.label}</span>
                </div>
                <select
                  className="ui-select"
                  value={value}
                  disabled={busy}
                  onChange={(ev) => setValue("route", spec, ev.target.value)}
                >
                  <option value="">不重路由(跟随客户端)</option>
                  {options.map((n) => (
                    <option key={n} value={n}>
                      {labelOf(n)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  /** 单张设置卡(外部数据刷新 / 重试策略 / 界面)。 */
  function sectionCard(section: "external_refresh" | "retry" | "ui"): React.JSX.Element | null {
    const specs = specsOf(section);
    if (specs.length === 0) return null;
    const meta = SECTION_TITLES[section];
    let body: React.JSX.Element;
    if (section === "retry") {
      body = (
        <div className="ui-rule-groups">
          {retryGroups().map((grp) => (
            <div key={grp.title} className="ui-group">
              <div className="ui-group-head">
                <span className="ui-group-title">{grp.title}</span>
              </div>
              <div className="ui-fields">
                {grp.fields.map((s) => field("retry", s))}
              </div>
            </div>
          ))}
          {/* 可重试错误码(独立宽卡) */}
          {codesField ? field("retry", codesField, true) : null}
          {chartBlock}
        </div>
      );
    } else {
      body = (
        <div className="ui-fields">
          {specs.map((s) => field(section, s))}
        </div>
      );
    }
    return (
      <section key={section} id={section} className="ui-card">
        <div className="ui-card-head">
          <h2 className="ui-card-title">{meta.title}</h2>
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
        <p>每次 ×2 递增并在「最大退避」处封顶;抖动使每一档在 [80%, 100%] × 确定值 内随机。</p>
      </div>
    </div>
  );

  return (
    <div className="ui-shell">
      <h1 className="ui-page-title">设置</h1>
      {busy ? <p className="hint">加载中…</p> : null}
      {err ? <p className="ui-err">{err}</p> : null}

      {data ? (
        <div className="ui-layout">
          <div className="ui-content">
            {/* 设置卡:外部数据刷新 → 调度规则(每档一张平级面板)→ 重试策略 → 界面 */}
            {sectionCard("external_refresh")}
            {schedulerPanels()}
            {routingCard()}
            {sectionCard("retry")}
            {sectionCard("ui")}

            {/* 请求日志(独立端点,立即生效) */}
            {reqLog ? (
              <section id="request-log" className="ui-card">
                <div className="ui-card-head">
                  <h2 className="ui-card-title">请求日志</h2>
                </div>
                <div className="ui-fields">
                  <div className="ui-field">
                    <div className="ui-field-head">
                      <span className="ui-field-label">记录档位</span>
                    </div>
                    <select
                      className="ui-select"
                      value={reqLog.content_mode}
                      disabled={busy}
                      onChange={(ev) => void saveReqLog(ev.target.value as RequestLogContentMode)}
                    >
                      {/* 契约从 Nexus 起就是 {value,label}:label 是中文说明,
                          摆 value(off/structure/…)等于把说明丢掉。 */}
                      {reqLog.content_modes.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ui-field wide">
                    <div className="ui-field-head">
                      <span className="ui-field-label">落盘位置</span>
                    </div>
                    <div className="ui-key-row">
                      <code className="ui-key">{reqLog.path}</code>
                      <span className="ui-badge">已写 {reqLog.counters?.written ?? 0} 条</span>
                      <span className="ui-badge">{reqLog.size_bytes} 字节</span>
                    </div>
                    {reqLog.last_error ? <p className="ui-field-err">上次记录失败:{reqLog.last_error}</p> : null}
                  </div>
                </div>
                {logMsg ? <p className="ui-field-hint">{logMsg}</p> : null}
              </section>
            ) : null}

            {/* 只读信息 */}
            <section id="readonly" className="ui-card">
              <div className="ui-card-head">
                <h2 className="ui-card-title">只读信息</h2>
                <span className="ui-card-sub">环境变量 ONE_API_KEY · 只读</span>
              </div>
              {data.master_key ? (
                <div className="ui-key-row">
                  <code className="ui-key">{data.master_key}</code>
                  <button type="button" className="ui-btn-ghost" disabled={busy} onClick={() => void copyKey()}>
                    {keyCopied ? "已复制 ✓" : "复制"}
                  </button>
                </div>
              ) : (
                <span className="ui-field-hint">未设置 ONE_API_KEY:当前无鉴权(所有请求放行)</span>
              )}
            </section>

            {/* 底部常驻保存栏 */}
            <div className="ui-savebar">
              <span className="ui-savebar-count">
                {totalChanged() > 0 ? (
                  <>
                    <span className="ui-savebar-dot" />
                    {totalChanged()} 项未保存
                  </>
                ) : (
                  "没有未保存的改动"
                )}
              </span>
              {msg ? <span className="ui-savebar-msg">{msg}</span> : null}
              <div className="ui-savebar-btns">
                <button type="button" className="ui-btn-ghost" disabled={busy} onClick={discard}>
                  放弃改动
                </button>
                <button
                  type="button"
                  className="ui-btn-primary"
                  disabled={busy || totalChanged() === 0}
                  onClick={() => void save()}
                >
                  保存设置
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { SettingsPage };
