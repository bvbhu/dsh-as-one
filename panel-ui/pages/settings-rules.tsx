/* ── 调度规则编辑器域(第十三刀从 SettingsPage.tsx 抽出,2026-10-29) ──
 * 五档规则模型/校验/序列化 + 行组件(DayPicker / TimeSummary / TimeEditor /
 * TierRuleRow / CooldownRuleRow)+ ruleCard 包装。
 * 依赖: 仅 React;不引用设置页常量(SECTION_TITLES 等)与退避曲线。
 *
 * 2026-11 用户定案:星期/时段**从规则里拆出来**做命名时段配置
 * (`scheduler.window_profiles`)。规则只存 `window.profile = <id>`,
 * 改一处时段即让所有引用它的规则生效。本文件的 profile 模型/序列化/行内下拉
 * 是这条链的前端半边(引擎半边见 core/scheduler 的 `windowProfilesMap`)。 */

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
  /**
   * 引用的命名时段 id(`scheduler.window_profiles` 里的 `id`);空串 = 不限/全天。
   *
   * 2026-11:星期/时段不再内联在规则里 —— 与后端 `SchedulerWindow` 一致,
   * **给了 profile 就忽略内联 weekdays/times**(后端 `validRules` 里 profile 优先)。
   * 这里已经不保留内联字段,序列化时若 profile 为空也不会写出 window
   * (旧的内联配置在读入时由 `parseRules` 读成空 profile,用户重新选一次时段即可)。
   */
  profile: string;
}
/** 时段里的一条子规则(星期 × 时间,都是 OR 语义)。 */
interface WindowProfileSegmentRow {
  /** `1..7`(1 = 周一);空 = 每天。 */
  weekdays: number[];
  /** 空 = 全天。 */
  times: TimeSpan[];
}

/**
 * 命名时段配置(settings 键 `scheduler.window_profiles` 的一条)。
 *
 * ⚠️ **不拆分**「梁文谷」这类口径:一个时段内部可有**多条子规则**
 * (工作日非高峰 + 周末全天),对外仍是一条,规则只引用一个 id。
 */
interface WindowProfileRow {
  id: string;
  name: string;
  segments: WindowProfileSegmentRow[];
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
  /** 命名时段表(settings 键 `scheduler.window_profiles`);规则用 profile id 引用。 */
  profiles: WindowProfileRow[];
  /** 不匹配五类的规则:原样保留,保证往返不丢数据。 */
  other: unknown[];
}

function freshGroups(): RuleGroups {
  return { free: [], expiry: [], consume: [], degrade: [], disabled: [], cooldown: [], profiles: [], other: [] };
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
      // 命名时段引用优先:profile 非空 → 只认它,内联 weekdays/times 一律忽略
      // (与后端 `validRules` 同口径:给了 profile 就不再解析内联字段)。
      const profile = typeof winSrc.profile === "string" ? winSrc.profile.trim() : "";
      const hasTimes = profile === "" && Array.isArray(winSrc.times);
      const hasCooldown = r.cooldown !== undefined && r.cooldown !== null;
      // ⚠️ 跨类组合(一条规则同时属于两类)不猜:原样保留让 JSON 视图修。
      if (hasTimes && hasCooldown) {
        groups.other.push(item);
        continue;
      }
      if (profile !== "") {
        // 引用时段表:不读内联星期/时段。带 cooldown 的组合同上,不猜。
        if (hasCooldown) {
          groups.other.push(item);
          continue;
        }
        pushTier(groups, key, { provider, model, expires_at, profile });
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
        // 旧数据兼容:内联 weekdays/times 没有对应的命名时段可引用。TierRule 已经
        // 不再持有内联字段,这里只做「能读进来、不炸」——规则进档位、profile 留空,
        // 保存时 window 会被省掉(引擎侧等价的既有语义是「旧内联段仍在库里」,
        // 用户点一次「时段」下拉重新选定即可迁到引用式)。
        pushTier(groups, key, { provider, model, expires_at, profile: "" });
        continue;
      }
      if (hasCooldown) {
        // 旧数据迁移:cooldown 已拆到 scheduler.cooldown_overrides。
        groups.cooldown.push({ provider, cooldown: Number(r.cooldown) });
        continue;
      }
      // 2026-10-24 起五个档位统一形状:无 times 的规则也归各自档位。
      pushTier(groups, key, { provider, model, expires_at, profile: "" });
    }
  }
  // 顶层缺某些键 = 空数组(显式,避免误以为丢数据)。
  for (const key of RULES_PRIORITY_KEYS) {
    if (!seen.has(key)) groups.other.push({ __missing: key } as unknown);
  }
  return { ok: true, groups };}

/** 合并对象 {scheduler.rules_pX: 数组};元素不含 priority(键名即档位)。 */
function serializeGroups(g: RuleGroups): string {
  // window 净化(2026-11):有 profile 引用 → 只输出 `{profile}`(引擎给了 profile
  // 就忽略内联字段,再写内联段只会造出「看着有二真源、其实被忽略」的假象);
  // 空 profile → 不输出整个 window(= 恒为该档),与旧版「两者都不写就省掉 window」一致。
  const winOf = (r: TierRule): Record<string, unknown> | undefined => {
    if (r.profile) return { profile: r.profile };
    return undefined;
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

/**
 * 命名时段表独立键 `scheduler.window_profiles`(2026-11):
 * JSON 数组 `[{id, name, segments:[{weekdays, times:[[s,e],...]}, ...]}]`。
 *
 * ⚠️ **不拆分**:一个时段的多条子规则(工作日非高峰 + 周末全天)都收在同一个
 * profile 的 `segments` 里 —— 与后端 `validWindowProfiles` 同形态。
 * times 从 TimeSpan 对象折回元组(引擎 `validSpans` 只认元组);
 * weekdays / times 为空时不写该字段,与「缺省 = 不限」同口径。
 */
function serializeProfiles(g: RuleGroups): string {
  const out: Array<Record<string, unknown>> = [];
  for (const p of g.profiles) {
    const id = p.id.trim();
    if (id === "") continue;
    const segs: Array<Record<string, unknown>> = [];
    for (const seg of p.segments) {
      const row: Record<string, unknown> = {};
      if (seg.weekdays.length > 0) row.weekdays = [...seg.weekdays];
      if (seg.times.length > 0) row.times = seg.times.map((t) => [t.start, t.end]);
      if (Object.keys(row).length > 0) segs.push(row);
    }
    out.push({ id, name: p.name.trim() || id, segments: segs });
  }
  return JSON.stringify(out, null, 2);
}

/**
 * setting JSON 字符串 → `WindowProfileRow[]`;坏 JSON / 非数组 → 空数组。
 *
 * 与引擎 `validWindowProfiles` 同一哲学:坏条目跳过(不拖垮整份),id 重复时
 * 先出现者胜。前端这边**不补缺省预置表**(那是 `windowProfilesMap` 的职责)——
 * 设置页展示的必须是库里真实内容,否则用户在空表上点保存会把预置表写死回来。
 */
function parseProfiles(raw: string | undefined): WindowProfileRow[] {
  if (raw === undefined || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: WindowProfileRow[] = [];
  const seen = new Set<string>();
  const spansOf = (raw: unknown): TimeSpan[] | null => {
    if (!Array.isArray(raw)) return [];
    const spans = raw.map((s) =>
      Array.isArray(s) && s.length === 2 && typeof s[0] === "string" && typeof s[1] === "string"
        ? { start: s[0] as string, end: s[1] as string }
        : null,
    );
    // 形状坏掉的时段整条跳过:保留半截配置比丢掉更难排查。
    return spans.some((s) => s === null) ? null : (spans as TimeSpan[]);
  };
  for (const item of parsed) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (id === "" || seen.has(id)) continue;
    const name = typeof r.name === "string" && r.name.trim() !== "" ? r.name.trim() : id;
    // 兼容旧形态(顶层 weekdays/times)按单段读取。
    const rawSegs = Array.isArray(r.segments)
      ? r.segments
      : [{ weekdays: r.weekdays, times: r.times }];
    const segments: WindowProfileSegmentRow[] = [];
    let broken = false;
    for (const seg of rawSegs) {
      if (typeof seg !== "object" || seg === null || Array.isArray(seg)) continue;
      const s = seg as Record<string, unknown>;
      const weekdays = Array.isArray(s.weekdays)
        ? (s.weekdays as unknown[]).filter(
            (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7,
          )
        : [];
      const times = spansOf(s.times);
      if (times === null) {
        broken = true;
        break;
      }
      if (weekdays.length === 0 && times.length === 0) continue;
      segments.push({ weekdays, times });
    }
    if (broken) continue;
    seen.add(id);
    out.push({ id, name, segments });
  }
  return out;
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
  // ⚠️ 引擎的时段规则按 provider+model **精确匹配**(`_rulesFor` 要求 model 相等),
  // 带时段却留空 model 的规则永远不命中 → 必填。别放宽这条:放宽只会让人配出一条
  // 「看起来在库里、实际从不生效」的规则。
  // 2026-11:时段改成引用 profile 后,「带了时段」= `profile !== ""`,同一条理由成立
  // (引擎展开 profile 后同样走 provider+model 精确匹配)。
  if (r.profile !== "" && !r.model.trim()) return "带生效时段的规则必须填 model";
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

/* ── 调度规则行组件(2026-11-18 重做:单规则单行;2026-11 改引用命名时段) ──
 *
 * 旧版一条规则 = 5 个纵向堆叠的 .box(Provider / Model / 到期时间 / 生效星期 /
 * 生效时间段),占 4~5 行、约 150px 高。现在压成一行 .rule-row:窄屏按「段」折行,
 * 1440 宽下一行放下。段序 = 供应商 · 模型 · 到期 · 时段 · 删除。
 *
 * 2026-11 用户定案:星期 + 时段**不再内联在规则里**,改成一个「时段」下拉引用
 * `scheduler.window_profiles` 的命名时段(id)。理由:同一条「高峰 09-12/14-18」
 * 要在几十条规则里各填一遍,改一次就得全改;引用式只改时段表一处。
 *   - 不选(空值)= 不限/全天 → 规则「恒为该档」(`serializeGroups` 的 `winOf`
 *     会省掉整个 window,JSON 里不会多出空 `{}`);
 *   - 选了 profile → JSON 里只写 `{profile: id}`(内联 weekdays/times 一律不写,
 *     引擎那边给了 profile 也会忽略内联字段)。
 *
 * `DayPicker` / `TimeSummary` / `TimeEditor` 仍然导出且保持原样:它们是
 * 「时段配置」编辑器(DayPicker 选星期、TimeEditor 编多段起止)的零件,
 * 规则行不再直接用,但报时段表的编辑界面继续用这几个组件,免得再造一套。
 */

/** 候选列表兜底:存量配置手填的 provider/model 不在候选中时注入尾部,防止回显丢失。 */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [...options, current] : options;
}

/** 单行里最多直接摆几个时段 chip,其余收成「+N」(完整列表在展开区)。 */
const INLINE_TIME_SPANS = 2;

/**
 * 命名时段的一句话摘要(给下拉的 title 悬浮用):`周一~周五 09:00-12:00、14:00-18:00`。
 *
 * 星期段压缩成「首~尾」当连续时用区间写法,不连续时逐个列(如 `周一、周三`);
 * 两项都空 = 「全天不限」。用 WEEKDAYS 的 label 拼,与星期方块同一套汉字。
 */
function profileSummary(p: WindowProfileRow): string {
  const dayName = (k: number): string => `周${WEEKDAYS.find((w) => w.k === k)?.label ?? "?"}`;
  const segText = (seg: WindowProfileSegmentRow): string => {
    const wd = [...seg.weekdays].sort((a, b) => a - b);
    let days = "";
    if (wd.length > 0) {
      const contiguous = wd.every((d, i) => i === 0 || d === wd[i - 1] + 1);
      days =
        contiguous && wd.length > 1
          ? `${dayName(wd[0])}~${dayName(wd[wd.length - 1])}`
          : wd.map(dayName).join("、");
    }
    const times = seg.times.map((t) => `${t.start}-${t.end}`).join("、");
    if (days === "" && times === "") return "全天不限";
    return [days, times].filter((s) => s !== "").join(" ");
  };
  if (p.segments.length === 0) return "全天不限";
  return p.segments.map(segText).join(" + ");
}

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
 *
 * 2026-11 起 `TierRuleRow` 不再用它(规则改成引用 profile),但导出的时段表编辑器
 * 还需要「时段摘要 + 展开」这套交互,组件保留。
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
 *
 * 2026-11:末段从「星期方块 + 时段 chip 展开区」换成一个「时段」下拉,选项来自
 * 传入的 `profiles`(命名时段表)。选中即 `onPatch({profile: id})`;空选项 = 不限/全天。
 */
function TierRuleRow(props: {
  rule: TierRule;
  providerOptions: string[];
  modelOptions: string[];
  /** 可引用的命名时段表(`scheduler.window_profiles`),由调用方读 setting 后传入。 */
  profiles: WindowProfileRow[];
  onPatch: (patch: Partial<TierRule>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const r = props.rule;
  const err = tierErr(r);
  // 存量规则引用的 profile 若已从时段表里删掉,也要把它兜在下拉里(沿用 withCurrent
  // 的「回显不丢」口径),否则 React 会把 select 显示成首项「全天」,用户一保存就把
  // 引用抹了。id 当文案是因为此时已经查不到 name。
  const profileIds = withCurrent(
    props.profiles.map((p) => p.id),
    r.profile,
  );
  const profileOf = (id: string): WindowProfileRow | undefined => props.profiles.find((p) => p.id === id);
  return (
    // 与逻辑模型编辑器同款 `.editor` + `.fieldRow`(标签在上、控件在下),
    // 不用内联小标签(rr-lab),也不再单摆一行「供应商*/模型」字样。
    <div className="editor ruleEditor">
      <label className="fieldRow" title="供应商(必填);换供应商会重置模型">
        <span className="fieldLabel">供应商</span>
        <select
          className="input selectInput"
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

      <label className="fieldRow" title="留空 = 该供应商的全部模型">
        <span className="fieldLabel">模型</span>
        <select
          className="input selectInput"
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

      <label className="fieldRow" title="到期日(可留空)">
        <span className="fieldLabel">到期</span>
        <input
          type="date"
          className={`input${r.expires_at ? "" : " is-empty"}`}
          value={r.expires_at}
          onChange={(ev) => props.onPatch({ expires_at: ev.target.value })}
        />
      </label>

      <label
        className="fieldRow"
        title={
          r.profile && profileOf(r.profile)
            ? profileSummary(profileOf(r.profile) as WindowProfileRow)
            : "引用的命名时段(在「时段配置」里维护);不选 = 全天不限"
        }
      >
        <span className="fieldLabel">时段</span>
        <select
          className="input selectInput"
          value={r.profile}
          onChange={(ev) => props.onPatch({ profile: ev.target.value })}
        >
          <option value="">全天/不限</option>
          {profileIds.map((id) => {
            const p = profileOf(id);
            return (
              <option key={id} value={id} title={p ? profileSummary(p) : undefined}>
                {p ? p.name : id}
              </option>
            );
          })}
        </select>
      </label>

      {err ? <p className="rule-err">{err}</p> : null}
    </div>
  );
}

/** 界面可编辑的四档(P3 已移除 —— 没有规则就是 P3 基线档)。 */
const TIER_CHOICES = [
  { key: "free", label: "P1 高优先" },
  { key: "expiry", label: "P2 次优先" },
  { key: "degrade", label: "P4 低优先" },
  { key: "disabled", label: "禁用" },
] as const;
type TierKeyName = (typeof TIER_CHOICES)[number]["key"];

/**
 * 一条规则 = **常展开的一行卡**（2026-11 用户定案）。
 *
 * 为什么不做折叠/编辑：「逻辑模型」折叠是因为它展开后有十几档链成员、占一大片；
 * 一条调度规则只有 4 个字段，折叠再点「编辑」纯属多一步。所以这里始终把
 * 供应商 / 模型 / 到期 / 时段 四个控件平铺出来。
 *
 * 行内**没有** ↑↓、没有档位下拉：顺序靠拖动 ⠿，优先级靠拖到别的段。
 * 卡头只留身份概览（供应商 + 模型/时段/到期 标签）+ 拖动手柄 + 删除。
 */
function RuleRow(props: {
  rule: TierRule;
  profiles: WindowProfileRow[];
  providerOptions: string[];
  modelOptions: string[];
  dragging: boolean;
  dropBefore: boolean;
  onDragStart: (e: React.DragEvent<HTMLSpanElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLSpanElement>) => void;
  onPatch: (patch: Partial<TierRule>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const r = props.rule;
  const prof = props.profiles.find((p) => p.id === r.profile);
  const err = tierErr(r);
  return (
    // ⚠️ 必须是 div 而不是 li:外层 <li className="schedRowOuter"> 已经占用了列表项,
    // li 嵌 li 是非法 HTML,浏览器会把内层 li 拆出去,导致拖动落点/ref 全面错位。
    <div className={"rowCard ruleRowCard" + (props.dragging ? " nodeRowDragging" : "")}>
      {props.dropBefore ? <div className="dropMarker" aria-hidden="true" /> : null}
      <div className="ruleRowLine">
        <span
          className="dragHandle"
          draggable
          title="拖动排序 · 拖到别的段即改优先级 · 拖出列表即删除"
          aria-label="拖动这条规则"
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
        >
          ⠿
        </span>

        <select
          className="input selectInput ruleField ruleProvider"
          value={r.provider}
          title="供应商(必填);换供应商会重置模型"
          onChange={(ev) => props.onPatch({ provider: ev.target.value, model: "" })}
        >
          <option value="">— 选供应商 —</option>
          {withCurrent(props.providerOptions, r.provider).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          className="input selectInput ruleField ruleModel"
          value={r.model}
          disabled={!r.provider}
          title="留空 = 该供应商的全部模型"
          onChange={(ev) => props.onPatch({ model: ev.target.value })}
        >
          <option value="">— 全部模型 —</option>
          {withCurrent(props.modelOptions, r.model).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <input
          type="date"
          className={`input ruleField ruleExpiry${r.expires_at ? "" : " is-empty"}`}
          value={r.expires_at}
          title="到期日(可留空)"
          onChange={(ev) => props.onPatch({ expires_at: ev.target.value })}
        />

        <select
          className="input selectInput ruleField ruleProfile"
          value={r.profile}
          title={
            prof
              ? `时段:${profileSummary(prof)}`
              : "引用的命名时段(在「时段配置」里维护);不选 = 全天不限"
          }
          onChange={(ev) => props.onPatch({ profile: ev.target.value })}
        >
          <option value="">全天/不限</option>
          {withCurrent(props.profiles.map((p) => p.id), r.profile).map((id) => {
            const p = props.profiles.find((x) => x.id === id);
            return (
              <option key={id} value={id} title={p ? profileSummary(p) : undefined}>
                {p ? p.name : id}
              </option>
            );
          })}
        </select>

        <button type="button" className="rowBtn danger ruleDel" title="删除这条规则" onClick={props.onRemove}>
          删除
        </button>
      </div>
      {err ? <p className="rule-err">{err}</p> : null}
    </div>
  );
}

/**
 * 冷却覆盖 = 一行(参考调度规则行样式,但**不需要拖动排序**)。
 *
 * 用户 2026-11:冷却卡参考调度卡的形态,只是没有 ⠿ 与跨段拖动。
 */
function CooldownRuleRow(props: {
  rule: CooldownRule;
  providerOptions: string[];
  onPatch: (patch: Partial<CooldownRule>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const err = cooldownErr(props.rule);
  return (
    <li className={"rowCard ruleRowCard" + (err ? " hasError" : "")}>
      <div className="ruleRowLine">
        <select
          className="input selectInput ruleField ruleProvider"
          value={props.rule.provider}
          title="供应商(必填)"
          onChange={(ev) => props.onPatch({ provider: ev.target.value })}
        >
          <option value="">— 选供应商 —</option>
          {withCurrent(props.providerOptions, props.rule.provider).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <input
          type="number"
          min={1}
          className="input ruleField ruleNum"
          value={props.rule.cooldown}
          title="失败后多久不再选该供应商(分钟)"
          onChange={(ev) =>
            props.onPatch({ cooldown: ev.target.value === "" ? "" : Number(ev.target.value) })
          }
        />
        {/* 单位与「逻辑模型成员」行一致：都落在输入框右侧。 */}
        <span className="ruleUnit">分钟</span>

        <button type="button" className="rowBtn danger ruleDel" title="删除这条冷却" onClick={props.onRemove}>
          删除
        </button>
      </div>
      {err ? <p className="rule-err">{err}</p> : null}
    </li>
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
    <section className="card setting-card">
      <div className="card-head">
        <h2>
          {badge ? <span className="rowTag sched-badge">{badge}</span> : null}
          {title ? <span>{title}</span> : null}
          {count > 0 ? <span className="card-extra">{count} 条</span> : null}
        </h2>
        <button type="button" className="btn btn-sm" onClick={add}>
          ＋ 添加规则
        </button>
      </div>
      {count === 0 ? null : <ul className="rows sched-rows">{rows}</ul>}
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
  serializeProfiles,
  parseProfiles,
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
  RuleRow,
  TIER_CHOICES,
  ruleCard,
};
export type { TimeSpan, TierRule, WindowProfileRow, CooldownRule, RuleGroups, TierKeyName };
