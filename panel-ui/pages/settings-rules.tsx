/* ── 调度规则编辑器域(第十三刀从 SettingsPage.tsx 抽出,2026-10-29) ──
 * 五档规则模型/校验/序列化 + 7 个槽位卡片组件 + ruleCard 包装。
 * 依赖: 仅 React;不引用设置页常量(SECTION_TITLES 等)与退避曲线。 */

import React from "react";

const WEEKDAYS = Array.from({ length: 7 }, (_, i) => ({
  k: i + 1, // 1=周一 .. 7=周日(后端口径)
  label: "一二三四五六日"[i],
}));
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/* ── 调度规则模型(2026-10-22 拆 5 键:键名即档位,元素不含 priority) ──
 * 2026-10-24 用户定案:五个档位键**统一形状**(provider 必填,其余可选,
 * window 嵌套),各档卡片一律显示全部 5 个模块框。 */

interface TimeSpan {
  start: string;
  end: string;
}

/** 档位规则(priority 1/2/3/4/0 共用同一形状)。 */
interface TierRule {
  provider: string;
  model: string;
  expires_at: string;
  weekdays: number[];
  times: TimeSpan[];
}
interface CooldownRule {
  provider: string;
  /** v-model.number 语义:可解析为数字,否则为空串(与 Nexus 一致)。 */
  cooldown: number | "";
}
interface RuleGroups {
  /** priority 1:免费档(键 scheduler.rules_p1)。 */
  free: TierRule[];
  /** priority 2:积分到期(键 scheduler.rules_p2)。 */
  expiry: TierRule[];
  /** priority 3:普通消耗档(键 scheduler.rules_p3)。 */
  consume: TierRule[];
  /** priority 4:高峰低优先(键 scheduler.rules_p4,时段规则)。 */
  degrade: TierRule[];
  /** priority 0:禁用(键 scheduler.rules_p0,时段规则)。 */
  disabled: TierRule[];
  cooldown: CooldownRule[];
  /** 不匹配五类的规则:原样保留,保证往返不丢数据。 */
  other: unknown[];
}

function freshGroups(): RuleGroups {
  return { free: [], expiry: [], consume: [], degrade: [], disabled: [], cooldown: [], other: [] };
}

/** 档位键常量(顺序 = 1,2,3,4,0)。 */
const RULES_PRIORITY_KEYS = ["scheduler.rules_p1", "scheduler.rules_p2", "scheduler.rules_p3", "scheduler.rules_p4", "scheduler.rules_p0"] as const;

/** 按档位键把统一形状的规则分派进对应组(2026-10-24 五档统一)。 */
function pushTier(groups: RuleGroups, key: string, tr: TierRule): void {
  switch (key) {
    case "scheduler.rules_p1":
      groups.free.push(tr);
      break;
    case "scheduler.rules_p2":
      groups.expiry.push(tr);
      break;
    case "scheduler.rules_p3":
      groups.consume.push(tr);
      break;
    case "scheduler.rules_p4":
      groups.degrade.push(tr);
      break;
    case "scheduler.rules_p0":
      groups.disabled.push(tr);
      break;
    default:
      groups.other.push(tr);
  }
}

/** 从合并对象 {key: 数组} 分组;文本非法 → 错误。 */
function parseRules(text: string): { ok: true; groups: RuleGroups } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON 解析失败:${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, error: "顶层必须是对象(5 个档位键:scheduler.rules_p1..p0)" };
  }
  const groups = freshGroups();
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (!RULES_PRIORITY_KEYS.includes(key as (typeof RULES_PRIORITY_KEYS)[number])) {
      return {
        ok: false,
        error: `未知档位键:${key}(顶层只认 5 个档位键:scheduler.rules_p1..p0;旧单键 {"rules": [...]} 已退役,由引擎迁移)`,
      };
    }
    seen.add(key);
    if (!Array.isArray(value)) {
      return { ok: false, error: `${key} 必须是数组,收到 ${typeof value}` };
    }
    for (const item of value) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        groups.other.push(item);
        continue;
      }
      const r = item as Record<string, unknown>;
      // 键名即档位:元素里写 priority = 双真源,原样保留让后端深校验拒(前端不吞)。
      if ("priority" in r && r["priority"] !== undefined && r["priority"] !== null) {
        groups.other.push(item);
        continue;
      }
      const provider = typeof r.provider === "string" ? r.provider : "";
      const model = typeof r.model === "string" ? r.model : "";
      const expires_at = typeof r.expires_at === "string" ? r.expires_at : "";
      // 时段限定:收在 window 嵌套对象里(旧扁平 times/weekdays 读时迁移)。
      const winSrc = typeof r.window === "object" && r.window !== null && !Array.isArray(r.window)
        ? (r.window as Record<string, unknown>)
        : r;
      const hasTimes = Array.isArray(winSrc.times);
      const hasCooldown = r.cooldown !== undefined && r.cooldown !== null;
      // ⚠️ 跨类组合(一条规则同时属于两类)不猜:原样保留让 JSON 视图修。
      if (hasTimes && hasCooldown) {
        groups.other.push(item);
        continue;
      }
      if (hasTimes) {
        const spans = (winSrc.times as unknown[]).map((s) =>
          Array.isArray(s) && s.length === 2 && typeof s[0] === "string" && typeof s[1] === "string"
            ? { start: s[0] as string, end: s[1] as string }
            : null,
        );
        if (spans.some((s) => s === null)) {
          groups.other.push(item); // times 形状坏了,原样保留让 JSON 视图修
          continue;
        }
        const weekdays = Array.isArray(winSrc.weekdays)
          ? (winSrc.weekdays as unknown[]).filter(
              (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7,
            )
          : [];
        const tr: TierRule = { provider, model, expires_at, weekdays, times: spans as TimeSpan[] };
        pushTier(groups, key, tr);
        continue;
      }
      if (hasCooldown) {
        // 旧数据迁移:cooldown 已拆到 scheduler.cooldown_overrides。
        groups.cooldown.push({ provider, cooldown: Number(r.cooldown) });
        continue;
      }
      // 2026-10-24 起五个档位统一形状:无 times 的规则也归各自档位,
      // weekdays 从 window 读(兼容旧扁平字段)。
      const weekdays = Array.isArray(winSrc.weekdays)
        ? (winSrc.weekdays as unknown[]).filter(
            (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7,
          )
        : [];
      pushTier(groups, key, { provider, model, expires_at, weekdays, times: [] });
    }
  }
  // 顶层缺某些键 = 空数组(显式,避免误以为丢数据)。
  for (const key of RULES_PRIORITY_KEYS) {
    if (!seen.has(key)) groups.other.push({ __missing: key } as unknown);
  }
  return { ok: true, groups };}

/** 合并对象 {scheduler.rules_pX: 数组};元素不含 priority(键名即档位)。 */
function serializeGroups(g: RuleGroups): string {
  // window 净化:weekdays / times 全空 → 不输出整个 window;只有星期或只有时间段 → 只输出有数据的子字段。
  const winOf = (r: TierRule): Record<string, unknown> | undefined => {
    const w: Record<string, unknown> = {};
    if (r.weekdays.length) w.weekdays = [...r.weekdays];
    if (r.times.length) w.times = r.times.map((t) => [t.start, t.end]);
    return Object.keys(w).length > 0 ? w : undefined;
  };
  // 2026-10-24 用户定案:五个档位统一形状(provider/model?/expires_at?/window?)。
  const ruleOf = (r: TierRule): Record<string, unknown> => ({
    provider: r.provider,
    ...(r.model ? { model: r.model } : {}),
    ...(r.expires_at ? { expires_at: r.expires_at } : {}),
    ...(winOf(r) ? { window: winOf(r) } : {}),
  });
  const obj: Record<string, unknown[]> = {
    "scheduler.rules_p1": g.free.map(ruleOf),
    "scheduler.rules_p2": g.expiry.map(ruleOf),
    "scheduler.rules_p3": g.consume.map(ruleOf),
    "scheduler.rules_p4": g.degrade.map(ruleOf),
    "scheduler.rules_p0": g.disabled.map(ruleOf),
  };
  // 不匹配五类的元素原样保留(往返不丢)。
  for (const o of g.other) {
    if (o && typeof o === "object" && "__key" in (o as object) && "__value" in (o as object)) {
      const rec = o as { __key: string; __value: unknown };
      if (!(rec.__key in obj)) obj[rec.__key] = [];
      obj[rec.__key].push(rec.__value as never);
      continue;
    }
    if (o && typeof o === "object" && "__missing" in (o as object)) {
      continue; // 缺键标记:序列化时补齐空数组
    }
    obj["scheduler.rules_p3"].push(o as never);
  }
  // 补上缺失键的空数组(保证往返稳定)。
  for (const key of RULES_PRIORITY_KEYS) {
    if (!(key in obj)) obj[key] = [];
  }
  return JSON.stringify(obj, null, 2);
}

/** 冷却覆盖独立键:`{"<provider>": 分钟}`(2026-10-21 从 rules 拆出)。 */
function serializeCooldowns(g: RuleGroups): string {
  const out: Record<string, number> = {};
  for (const r of g.cooldown) {
    if (r.provider.trim() === "") continue;
    if (!(Number(r.cooldown) > 0)) continue;
    out[r.provider.trim()] = Number(r.cooldown);
  }
  return JSON.stringify(out, null, 2);
}

/** 拆 5 键:每组 → 各档位键的 JSON 字符串(键名即档位,元素不含 priority)。 */
function serializeRulesByKey(g: RuleGroups): Record<string, string> {
  const obj = JSON.parse(serializeGroups(g)) as Record<string, unknown[]>;
  const out: Record<string, string> = {};
  for (const key of RULES_PRIORITY_KEYS) {
    out[key] = JSON.stringify(obj[key] ?? [], null, 2);
  }
  return out;
}

/* ── 形状校验(2026-10-24 五档统一形状:一个 tierErr 覆盖全部) ── */

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function tierErr(r: TierRule): string | null {
  if (!r.provider.trim()) return "provider 必填";
  // ⚠️ 引擎按 provider+model 精确匹配端点:带生效时间段的规则缺 model 永不命中 → 必填。
  if (r.times.length > 0 && !r.model.trim()) return "带生效时间段的规则必须填 model";
  for (const t of r.times) {
    if (!HHMM_RE.test(t.start) || !HHMM_RE.test(t.end)) return "时段须为 HH:MM 格式";
    if (t.start === t.end) return "开始与结束不能相同";
  }
  if (r.expires_at && !validDate(r.expires_at)) return "到期日须为 YYYY-MM-DD";
  return null;
}

function cooldownErr(r: CooldownRule): string | null {
  if (!r.provider.trim()) return "provider 必填";
  if (!(Number(r.cooldown) > 0)) return "冷却须为正数(分钟)";
  return null;
}

function rulesProblem(g: RuleGroups): string | null {
  for (const [group, name] of [
    [g.free, "P1 调度优先级"],
    [g.expiry, "P2 调度优先级"],
    [g.consume, "P3 调度优先级"],
    [g.degrade, "P4 调度优先级"],
    [g.disabled, "禁用"],
  ] as const) {
    for (const r of group) {
      const e = tierErr(r);
      if (e) return `${name}:${e}`;
    }
  }
  for (const r of g.cooldown) {
    const e = cooldownErr(r);
    if (e) return `冷却:${e}`;
  }
  return null;
}

/* ── 调度规则卡片组件(2026-10-24 按设计稿重做:5 个独立模块框 + 严格断行星期) ── */

/** 候选列表兜底:存量配置手填的 provider/model 不在候选中时注入尾部,防止回显丢失。 */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [...options, current] : options;
}

function ProviderBox(props: {
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  onDelete: () => void;
}): React.JSX.Element {
  return (
    <div className="box box-provider">
      <div className="box-label">
        <span>
          Provider <span className="req">*</span>
        </span>
        <button type="button" className="btn-del" onClick={props.onDelete}>
          删除规则
        </button>
      </div>
      <select className="input-control" value={props.value} onChange={(ev) => props.onSelect(ev.target.value)}>
        <option value="">请选择 Provider</option>
        {withCurrent(props.options, props.value).map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
}

function ModelBox(props: {
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  optional?: boolean;
}): React.JSX.Element {
  return (
    <div className="box box-model">
      <div className="box-label">
        <span>Model{props.optional ? "(可选)" : ""}</span>
      </div>
      <select className="input-control" value={props.value} onChange={(ev) => props.onSelect(ev.target.value)}>
        <option value="">留空 = 全部</option>
        {withCurrent(props.options, props.value).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

function ExpiryBox(props: {
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  // ⚠️ 这里**不能**加 `required`(用户 m11847 报「到期时间无法清除」):
  // Chromium 对 required 的文本类输入**不渲染右侧的 × 清除按钮**
  // (TextFieldInputType::HasVisibleClearButton() = !IsRequired()),于是只能
  // 手动逐段删 yyyy/mm/dd;而且到期时间本身是可选的,required 还会让空值
  // 直接卡住提交。
  // 空态占位符改用 JS 驱动的 `.is-empty` 类隐藏(见 styles.css)——
  // `:invalid` 只在 required 时才匹配空值,去掉 required 后就不再可靠。
  return (
    <div className="box box-expiry">
      <div className="box-label">
        <span>到期时间</span>
      </div>
      <input
        type="date"
        className={`input-control${props.value ? "" : " is-empty"}`}
        value={props.value}
        onChange={(ev) => props.onChange(ev.target.value)}
      />
    </div>
  );
}

function WeekdayBox(props: {
  idPrefix: string;
  weekdays: number[];
  onToggle: (d: number) => void;
}): React.JSX.Element {
  // 一二三四五 / 六日 两组:空间不足时「六日」整体换行,不会在一至五中间断行。
  const renderDay = (w: { k: number; label: string }) => {
    const id = `${props.idPrefix}-w${w.k}`;
    return (
      <React.Fragment key={w.k}>
        <input type="checkbox" id={id} checked={props.weekdays.includes(w.k)} onChange={() => props.onToggle(w.k)} />
        <label htmlFor={id}>{w.label}</label>
      </React.Fragment>
    );
  };
  return (
    <div className="box box-weekdays">
      <div className="box-label">
        <span>生效星期</span>
      </div>
      <div className="weekday-flex">
        <div className="weekday-group">{WEEKDAYS.slice(0, 5).map(renderDay)}</div>
        <div className="weekday-group">{WEEKDAYS.slice(5).map(renderDay)}</div>
      </div>
    </div>
  );
}

function TimesBox(props: { times: TimeSpan[]; onPatch: (next: TimeSpan[]) => void }): React.JSX.Element {
  return (
    <div className="box box-times">
      <div className="box-label">
        <span>生效时间段</span>
      </div>
      <div className="time-flex">
        {props.times.map((t, ti) => (
          <div key={ti} className="time-row">
            <input
              type="time"
              className="input-control"
              value={t.start}
              onChange={(ev) =>
                props.onPatch(props.times.map((x, at) => (at === ti ? { ...x, start: ev.target.value } : x)))
              }
            />
            <span className="separator">~</span>
            <input
              type="time"
              className="input-control"
              value={t.end}
              onChange={(ev) =>
                props.onPatch(props.times.map((x, at) => (at === ti ? { ...x, end: ev.target.value } : x)))
              }
            />
            <button
              type="button"
              className="btn-del-time"
              onClick={() => props.onPatch(props.times.filter((_, at) => at !== ti))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-add-time"
          onClick={() => props.onPatch([...props.times, { start: "09:00", end: "18:00" }])}
        >
          + 添加时间段
        </button>
      </div>
    </div>
  );
}

function CooldownBox(props: { value: number | ""; onChange: (v: number | "") => void }): React.JSX.Element {
  return (
    <div className="box box-cooldown">
      <div className="box-label">
        <span>冷却(分钟)</span>
      </div>
      <input
        type="number"
        min={1}
        className="input-control"
        value={props.value}
        onChange={(ev) => props.onChange(ev.target.value === "" ? "" : Number(ev.target.value))}
      />
    </div>
  );
}

/**
 * 一个调度规则面板 —— 与「外部数据刷新」同级的独立卡片。
 *
 * 2026-11-03 用户定案:原先五档(P1~P4 + 禁用)+ 冷却全塞在一个「调度规则」总卡里,
 * 现在每档一张平级卡片。徽标(P1/P2/P3/P4/禁用/冷却)直接坐在标题行,
 * 「+ 添加规则」按钮放在标题行右侧,规则体纵向堆叠,空组给提示。
 *
 * 2026-11-03 用户定案(二):卡片标题口径统一 —— P1~P4 的副标题一律叫
 * 「调度优先级」,「禁用」「冷却」两张卡只留徽标、副标题留空(此时不渲染副标题 span)。
 * 2026-11-07 起各档不再传任何行为说明(hint),档位差异只由徽标承载;hint 参数保留可选,
 * 为将来可能的卡片级提示预留,但不渲染任何默认文案。
 *
 * 根节点同时挂 `.ui-card` 与 `.asone-scheduler`:前者提供卡片外观,
 * 后者提供 .box / .blocks-container / .input-control 等编辑器样式作用域。
 */
function ruleCard<T>(
  badge: string,
  title: string,
  rules: T[],
  add: () => void,
  render: (r: T, i: number) => React.JSX.Element,
  hint?: string,
): React.JSX.Element {
  return (
    <section className="ui-card rule-panel asone-scheduler">
      <div className="ui-card-head">
        <h2 className="ui-card-title">
          <span className="badge">{badge}</span>
          {title ? <span>{title}</span> : null}
        </h2>
        <button type="button" className="btn-add" onClick={add}>
          + 添加规则
        </button>
      </div>
      {hint ? <p className="card-hint">{hint}</p> : null}
      {rules.length === 0 ? <p className="card-empty">暂无规则,点右上「+ 添加规则」新增</p> : null}
      {rules.map((r, i) => (
        <React.Fragment key={i}>{render(r, i)}</React.Fragment>
      ))}
    </section>
  );
}


/* ── 第十三刀:规则编辑器域导出面(主组件 SettingsPage 引用) ── */
export {
  WEEKDAYS,
  HHMM_RE,
  freshGroups,
  RULES_PRIORITY_KEYS,
  pushTier,
  parseRules,
  serializeGroups,
  serializeCooldowns,
  serializeRulesByKey,
  validDate,
  tierErr,
  cooldownErr,
  rulesProblem,
  withCurrent,
  ProviderBox,
  ModelBox,
  ExpiryBox,
  WeekdayBox,
  TimesBox,
  CooldownBox,
  ruleCard,
};
export type { TimeSpan, TierRule, CooldownRule, RuleGroups };
