/* ── 调度规则编辑器域(第十三刀从 SettingsPage.tsx 抽出,2026-10-29) ──
 * 五档规则模型/校验/序列化 + 行组件(DayPicker / TimeSummary / TimeEditor /
 * TierRuleRow / CooldownRuleRow)+ ruleCard 包装。
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
  /** v-model.number 语义:可解析为数字,否则为空串(与既有实现一致)。 */
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
  // 2026-11-18:去掉「带时段必须填 model」这条限制。
  // 引擎侧已修好空 model 的匹配（`_rulesFor` 现在把 "" 解释成「该 provider
  // 的全部模型」），所以「只填 provider + 时段」是合法且有用的写法 ——
  // 用户把 trae 整家压进 P4 时段，正是靠它。旧校验只会让人配不出来。
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

/* ── 调度规则行组件(2026-11-18 重做:单规则单行 + 星期/时段独立配置) ──
 *
 * 旧版一条规则 = 5 个纵向堆叠的 .box(Provider / Model / 到期时间 / 生效星期 /
 * 生效时间段),占 4~5 行、约 150px 高。现在压成一行 .rule-row:窄屏按「段」折行,
 * 1440 宽下一行放下。段序 = 供应商 · 模型 · 到期 · 星期 · 时段 · 删除。
 *
 * 星期与时段是**两个独立段**,各自可为空、互不牵连(这正是「拆分时间与星期」):
 *   - 星期全灭(7 个方块都不亮)= 每天。引擎 `isBlackout` 对空 weekdays 视为不限,
 *     `_staticRulesFor` 对空 weekdays 同样放行,所以空 = 不限是既有语义,不是新约定;
 *   - 时段空 = 全天。引擎只在 `window.times` 非空时才建时段规则(`_readConfig`);
 *   - 两者都不写 → 整条规则「恒为该档」(`serializeGroups` 的 `winOf` 会省掉整个
 *     window 对象,JSON 里不会多出空 `{}`)。
 *
 * 完整编辑能力不丢:时段点行尾 ▾ 展开成完整的起止时间编辑器(可增删多段),
 * 其余字段本身就是内联控件;详情靠 title 悬浮提示承载。
 */

/** 候选列表兜底:存量配置手填的 provider/model 不在候选中时注入尾部,防止回显丢失。 */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [...options, current] : options;
}

/** 单行里最多直接摆几个时段 chip,其余收成「+N」(完整列表在展开区)。 */
const INLINE_TIME_SPANS = 2;

/**
 * 星期段:7 个小方块内联,各自独立开关。
 *
 * 一个都不选 = 每天(而不是「永不生效」):空 weekdays 在引擎里就是不限,
 * 所以空态显式标出「每天」,避免用户以为规则废了;非空态给一个清空按钮。
 */
function DayPicker(props: {
  weekdays: number[];
  onToggle: (d: number) => void;
  onClear: () => void;
}): React.JSX.Element {
  const empty = props.weekdays.length === 0;
  return (
    <div className="rr-seg rr-days">
      <span className="rr-lab" title="生效星期(1=周一 .. 7=周日);全部不选 = 每天">
        星期
      </span>
      <div className="rr-day-set" role="group" aria-label="生效星期">
        {WEEKDAYS.map((w) => {
          const on = props.weekdays.includes(w.k);
          return (
            <button
              type="button"
              key={w.k}
              className={"rr-day" + (on ? " on" : "")}
              aria-pressed={on}
              aria-label={`周${w.label}`}
              title={`周${w.label}`}
              onClick={() => props.onToggle(w.k)}
            >
              {w.label}
            </button>
          );
        })}
      </div>
      {empty ? (
        <span className="rr-note" title="没勾任何星期 = 每天生效">
          每天
        </span>
      ) : (
        <button type="button" className="rr-clear" title="清空星期(改为每天)" onClick={props.onClear}>
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * 时段段:紧凑 chip(`08:00-23:00`)+ 行尾展开开关。
 *
 * chip 只做**展示**(title 里给完整语义),编辑走展开区 —— 这样一行里不会出现
 * 4 个 time input 把行高撑起来。时段为空时显式标「全天」。
 */
function TimeSummary(props: {
  times: TimeSpan[];
  open: boolean;
  onToggleOpen: () => void;
}): React.JSX.Element {
  const shown = props.times.slice(0, INLINE_TIME_SPANS);
  const extra = props.times.length - shown.length;
  return (
    <div className="rr-seg rr-times">
      <span className="rr-lab" title="生效时间段;不设 = 全天">
        时段
      </span>
      {props.times.length === 0 ? (
        <span className="rr-note" title="没设时间段 = 全天生效">
          全天
        </span>
      ) : (
        <span className="rr-spans">
          {shown.map((t, i) => (
            <span key={i} className="rr-span" title={`${t.start} ~ ${t.end}(左闭右开)`}>
              {t.start}-{t.end}
            </span>
          ))}
          {extra > 0 ? (
            <span
              className="rr-span rr-span-more"
              title={props.times
                .slice(INLINE_TIME_SPANS)
                .map((t) => `${t.start}-${t.end}`)
                .join("、")}
            >
              +{extra}
            </span>
          ) : null}
        </span>
      )}
      <button
        type="button"
        className={"rr-caret" + (props.open ? " on" : "")}
        aria-expanded={props.open}
        aria-label={props.open ? "收起时间段编辑" : "展开时间段编辑"}
        title={props.open ? "收起时间段编辑" : "展开时间段编辑"}
        onClick={props.onToggleOpen}
      >
        ▾
      </button>
    </div>
  );
}

/** 时段展开区:完整的多段起止时间编辑器(增 / 删 / 改)。 */
function TimeEditor(props: { times: TimeSpan[]; onPatch: (next: TimeSpan[]) => void }): React.JSX.Element {
  return (
    <div className="rule-detail">
      <div className="rd-head">
        <span className="rd-title">生效时间段</span>
        <span className="rd-hint">左闭右开;不设 = 全天。跨午夜写 22:00 ~ 06:00。</span>
      </div>
      <div className="rd-times">
        {props.times.map((t, ti) => (
          <div className="rd-time-row" key={ti}>
            <input
              type="time"
              className="input-control"
              value={t.start}
              aria-label="开始时间"
              onChange={(ev) =>
                props.onPatch(props.times.map((x, at) => (at === ti ? { ...x, start: ev.target.value } : x)))
              }
            />
            <span className="rd-tilde">~</span>
            <input
              type="time"
              className="input-control"
              value={t.end}
              aria-label="结束时间"
              onChange={(ev) =>
                props.onPatch(props.times.map((x, at) => (at === ti ? { ...x, end: ev.target.value } : x)))
              }
            />
            <button
              type="button"
              className="btn-del-time"
              title="删除该时段"
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

/**
 * 一条档位规则 = 一行。
 *
 * ⚠️ 到期时间输入**不能**加 `required`(用户 m11847 报「到期时间无法清除」):
 * Chromium 对 required 的文本类输入**不渲染右侧的 × 清除按钮**
 * (`TextFieldInputType::HasVisibleClearButton() = !IsRequired()`),于是只能手动
 * 逐段删 yyyy/mm/dd;而且到期时间本身可选,required 还会让空值卡住提交。
 * 空态占位符改用 JS 驱动的 `.is-empty` 类隐藏(见 styles.css)——
 * `:invalid` 只在 required 时才匹配空值,去掉 required 后就不再可靠。
 */
function TierRuleRow(props: {
  rule: TierRule;
  providerOptions: string[];
  modelOptions: string[];
  onPatch: (patch: Partial<TierRule>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const [openTimes, setOpenTimes] = React.useState(false);
  const r = props.rule;
  const err = tierErr(r);
  return (
    <div className="rule-item">
      <div className="rule-row">
        <label className="rr-seg rr-provider" title="供应商(必填)">
          <span className="rr-lab">
            供应商<span className="rr-req">*</span>
          </span>
          <select
            className="input-control"
            value={r.provider}
            // 换 Provider 联动重置 Model:旧 model 属于旧供应商,留着必然永不命中。
            onChange={(ev) => props.onPatch({ provider: ev.target.value, model: "" })}
          >
            <option value="">请选择</option>
            {withCurrent(props.providerOptions, r.provider).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="rr-seg rr-model" title="留空 = 该供应商的全部模型">
          <span className="rr-lab">模型</span>
          <select
            className="input-control"
            value={r.model}
            onChange={(ev) => props.onPatch({ model: ev.target.value })}
          >
            <option value="">全部</option>
            {withCurrent(props.modelOptions, r.model).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="rr-seg rr-expiry" title="到期日(可留空)">
          <span className="rr-lab">到期</span>
          <input
            type="date"
            className={`input-control${r.expires_at ? "" : " is-empty"}`}
            value={r.expires_at}
            onChange={(ev) => props.onPatch({ expires_at: ev.target.value })}
          />
        </label>

        <DayPicker
          weekdays={r.weekdays}
          onToggle={(d) =>
            props.onPatch({
              weekdays: r.weekdays.includes(d)
                ? r.weekdays.filter((x) => x !== d)
                : [...r.weekdays, d].sort((a, b) => a - b),
            })
          }
          onClear={() => props.onPatch({ weekdays: [] })}
        />

        <TimeSummary times={r.times} open={openTimes} onToggleOpen={() => setOpenTimes((v) => !v)} />

        <div className="rr-actions">
          <button type="button" className="rr-del" title="删除这条规则" aria-label="删除这条规则" onClick={props.onRemove}>
            ×
          </button>
        </div>
      </div>

      {openTimes ? <TimeEditor times={r.times} onPatch={(next) => props.onPatch({ times: next })} /> : null}
      {err ? <p className="rule-err">{err}</p> : null}
    </div>
  );
}

/** 冷却覆盖规则 = 一行(供应商 + 分钟数)。 */
function CooldownRuleRow(props: {
  rule: CooldownRule;
  providerOptions: string[];
  onPatch: (patch: Partial<CooldownRule>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const err = cooldownErr(props.rule);
  return (
    <div className="rule-item">
      <div className="rule-row">
        <label className="rr-seg rr-provider" title="供应商(必填)">
          <span className="rr-lab">
            供应商<span className="rr-req">*</span>
          </span>
          <select
            className="input-control"
            value={props.rule.provider}
            onChange={(ev) => props.onPatch({ provider: ev.target.value })}
          >
            <option value="">请选择</option>
            {withCurrent(props.providerOptions, props.rule.provider).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="rr-seg rr-cooldown" title="失败后多久不再选该供应商">
          <span className="rr-lab">冷却</span>
          <input
            type="number"
            min={1}
            className="input-control"
            value={props.rule.cooldown}
            onChange={(ev) => props.onPatch({ cooldown: ev.target.value === "" ? "" : Number(ev.target.value) })}
          />
          <span className="rr-unit">分钟</span>
        </label>

        <div className="rr-actions">
          <button type="button" className="rr-del" title="删除这条规则" aria-label="删除这条规则" onClick={props.onRemove}>
            ×
          </button>
        </div>
      </div>
      {err ? <p className="rule-err">{err}</p> : null}
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
 * 「调度优先级」,「禁用」「冷却」两张卡只留徽标、副标题留空。
 *
 * 2026-11-18:规则体从「5 个 .box 纵排」换成 `.rule-rows > .rule-item > .rule-row`,
 * 分隔线只由 `.rule-item + .rule-item` 提供(见 styles.css 根因注释)。
 * 标题行右侧顺带给出条数(「3 条」),这样删到空能立刻看出来。
 *
 * 根节点同时挂 `.ui-card` 与 `.asone-scheduler`:前者提供卡片外观,
 * 后者提供 `--asec-*` 变量与 `.input-control` 等编辑器样式作用域。
 */
function ruleCard(
  badge: string,
  title: string,
  count: number,
  add: () => void,
  rows: React.ReactNode,
): React.JSX.Element {
  return (
    <section className="ui-card rule-panel asone-scheduler">
      <div className="ui-card-head">
        <h2 className="ui-card-title">
          <span className="badge">{badge}</span>
          {title ? <span>{title}</span> : null}
          {count > 0 ? <span className="ui-card-sub">{count} 条</span> : null}
        </h2>
        <button type="button" className="btn-add" onClick={add}>
          + 添加规则
        </button>
      </div>
      {count === 0 ? (
        <p className="card-empty">暂无规则,点右上「+ 添加规则」新增</p>
      ) : (
        <div className="rule-rows">{rows}</div>
      )}
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
  DayPicker,
  TimeSummary,
  TimeEditor,
  TierRuleRow,
  CooldownRuleRow,
  ruleCard,
};
export type { TimeSpan, TierRule, CooldownRule, RuleGroups };
