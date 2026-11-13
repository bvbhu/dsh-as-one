/**
 * reasoning-effort.ts —— 规范阶梯 + 能力声明 + 统一钳制算法。
 *
 * 用户 m10437:「目标是**简单且通用**,那么就不应该为每个模型维护一张
 * 『档位 → 档位』的静态映射表。更合适的做法是定义一个**有序的规范阶梯**,
 * 让每个模型只声明『我能接受哪些档位』,由一套统一的钳制算法在运行时解析。」
 *
 * 所以这里**没有**逐模型的映射表。模型侧只有两个声明:
 *
 * ```text
 * ModelCapability:
 *   supported_levels: Set<Effort>   # 支持的非 off 档位子集
 *   allows_off: bool                # 是否允许关闭思考
 * ```
 *
 * `off` 的退路是**该模型支持的最低档**(2026-11-08 定案:有档位表时「关闭」
 * 自然只能退到最低档),`default_level` 不参与算法 ——
 * 用户没有显式选择时**不发送**该字段,把默认权交还给上游模型(见下)。
 *
 * ## 规范阶梯
 *
 * ```text
 * off  <  low  <  medium  <  high  <  max
 * ```
 *
 * 主流 effort 轴(OpenAI `reasoning_effort`、Anthropic `output_config.effort`、
 * Gemini `thinking_level`)都落在这条阶梯上。上游的杂名(`xhigh`/`ultra`/`minimal`/
 * `med`/`default`…)先**归一**到阶梯,认不出的一律丢弃 —— 归一表是**全局常量**,
 * 不是逐模型的。
 *
 * ## 出参是「表里的原文」,不是规范名
 *
 * 档位表(`real_model.supported_reasoning_efforts`)存的是**上游自己的拼写** ——
 * workbuddy/qoder 顶端叫 `xhigh`、trae 叫 `light`/`extra_high`,都是目录原样落库。
 * 所以钳制的产物必须是**那一行原文**,直接写进报文;这里**不做任何改名**,
 * 也就不需要「规范档位 → 各协议取值」的翻译表。
 * 规范阶梯只用于**排序与比较**,是算法内部的东西,不出口。
 *
 * ## 钳制算法(顺序不能颠倒)
 *
 * 1. **`off` 单独处理**:`off` 不是阶梯上的「强度点」,不能参与最近档位比较。
 *    上游没明说关不掉(`allows_off !== false`)→ 交给 wire 层写该协议的关闭取值;
 *    否则 → **该模型支持的最低档**(表里 rank 最小的那行原文)。
 * 2. **精确命中** → 原样使用那行原文。
 * 3. **最近档位钳制** → 在表里找 `|rank 差|` 最小的那行,发它的原文。
 *
 * ## 并列(距离相等)的方向
 *
 * 用户 m10447:「非法值只尝试贴靠,off/none/disabled/minimal/min/low 往低映射,
 * 其他往高映射」。
 *
 * 即:**请求本身落在「关闭/低思考」这一侧时向下取,其余向上取**。
 * 例:要 `medium`、上游只有 `low`/`high`,距离都是 1 → 给 `high`(别比我要的更笨)。
 * 例:要 `low`、上游只有 `minimal`/`medium`,距离都是 1 → 给 `minimal`(意图是少想)。
 *
 * ⚠️ 这是**产品策略**,不是数学必然 —— 想改成「一律偏保守(取更弱)」只需把
 * {@link TIE_PREFER_LOW} 改成 `true` 一处。
 *
 * ## 三态(与 `real_model.supported_reasoning_efforts` 对应)
 *
 * - `null` = 上游没给档位表 ⇒ **不传**(未知,不拦);
 * - `[]`   = 上游明说不支持思考 ⇒ **不传**;
 * - 非空   ⇒ 按上面的算法解析。
 *
 * ## 省略 ≠ 显式选择
 *
 * 客户端**没传** `reasoning_effort` 时直接省略该字段,让模型用它自己的
 * `default_level`。绝不用一个全局默认值去覆盖 —— 各模型的默认思考档差别很大
 * (有的默认一档、有的默认最高档),强行统一会踩掉上游精心设计的行为。
 *
 * ## 可观测
 *
 * {@link resolveReasoningEffort} 在**钳制函数出口**统一返回
 * `{ value, off, clamped, reason }` —— 请求日志与调试都看这一个出口,不用逐处埋点。
 *
 * ⚠️ 与 `stripReasoningEffort`(上游拒过就摘)是**两条独立的闸**:这条是
 * 「事先按能力表匹配」,那条是「事后按上游报错摘」。两者都会让本次请求不带
 * `reasoning_effort`,但只有后者会把结果**写回库**。
 */

/**
 * 规范阶梯的**非 off** 部分,从弱到强。
 *
 * `off` 不在这条数组里 —— 它是「关闭」这个**状态**,不是强度点。
 */
export const CANONICAL_LADDER = ["low", "medium", "high", "max"] as const;

/** 阶梯上的一个非 off 档位。 */
export type LadderLevel = (typeof CANONICAL_LADDER)[number];

/** 客户端/上游可能给的思考强度取值:关闭态 + 阶梯四档。 */
export type CanonicalEffort = "off" | LadderLevel;

/** 各档位在阶梯上的位置(数值越小越「少想」)。 */
const LADDER_RANK: Record<CanonicalEffort, number> = {
  off: -1,
  low: 0,
  medium: 1,
  high: 2,
  max: 3,
};

/**
 * 并列时的方向偏好(用户 m10447)。
 *
 * `false` = 默认**偏能力**(取更强的一侧);请求本身落在「关闭/低思考」侧时,
 * 由 {@link LOW_SIDE_INPUTS} 单独翻成取更弱。
 */
const TIE_PREFER_LOW = false;

/**
 * 「关闭思考 / 低思考」这一侧的**输入**取值(归一后)。
 *
 * 这些值的用户意图就是**少想**,并列时向上取会违背意图。其余取值一律取更高。
 * `off` 不在这里 —— 它在算法第 1 步就被单独处理掉了。
 */
const LOW_SIDE_INPUTS: ReadonlySet<string> = new Set(["low"]);

/**
 * 上游拼写 → 规范阶梯。
 *
 * 归一规则:小写 → 去 `-`/`_`/空白/`.` → 查别名表。认不出返回 `null`
 * (调用方据此丢弃该取值,而不是猜一个)。
 *
 * 别名覆盖实测到的写法:workbuddy `low/high/xhigh/max/medium`、
 * `canDisableThinking` 系列的 `high`;OpenAI `minimal/low/medium/high`;
 * Anthropic `minimal/low/medium/high`;Gemini `low/high`。
 */
export function canonicalEffort(name: string): CanonicalEffort | null {
  const n = name.trim().toLowerCase().replace(/[-_\s.]/g, "");
  if (n === "off" || n === "none" || n === "disabled" || n === "false" || n === "no") return "off";
  if (n === "low" || n === "minimal" || n === "min" || n === "light" || n === "thinkinglow") {
    return "low";
  }
  if (n === "medium" || n === "med" || n === "default" || n === "mid" || n === "thinkingmedium") {
    return "medium";
  }
  if (n === "high" || n === "thinkinghigh") return "high";
  if (
    n === "max" || n === "xhigh" || n === "ultra" || n === "extreme" ||
    n === "highest" || n === "thinkingmax" ||
    // trae 的目录用 `light` / `high` / `extra_high` 三档(2026-11-08 实测
    // `reasoning_effort_config.options`),`extra_high` 就是它的最高档。
    n === "extrahigh" || n === "veryhigh" || n === "superhigh"
  ) {
    return "max";
  }
  return null;
}

/**
 * 上游给的**原始**档位名单 → 规范阶梯的非 off 档位(去重、按阶梯升序)。
 *
 * 认不出的取值直接丢弃;`off`/`none`/`disabled` 是「关闭」信号,不算强度档。
 *
 * ⚠️ 只归一、不保留原文 —— 落库要存上游拼写时用 {@link orderRawLevels}。
 */
export function canonizeLevels(list: readonly string[]): LadderLevel[] {
  const set = new Set<LadderLevel>();
  for (const raw of list) {
    const c = canonicalEffort(String(raw ?? ""));
    if (c !== null && c !== "off") set.add(c);
  }
  return CANONICAL_LADDER.filter((level) => set.has(level));
}

/**
 * 原始档位名单 → **上游原文**清单(去重、丢掉 off 与认不出的、按阶梯升序)。
 *
 * 这是「档位表」那一列该存的东西:值必须是上游自己的拼写(`xhigh` / `light` /
 * `extra_high`),因为网关钳制选中的就是这行原文,直接写进报文。
 * 这里只做**排序与去噪**,一个值都不改写。
 */
export function orderRawLevels(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: Array<{ raw: string; rank: number }> = [];
  for (const item of list) {
    const raw = String(item ?? "").trim();
    if (raw === "") continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    const level = canonicalEffort(raw);
    if (level === null || level === "off") continue;
    seen.add(key);
    out.push({ raw, rank: LADDER_RANK[level] });
  }
  // 稳定排序:同档两个拼写(如 minimal / low)保持上游给的先后。
  return out.sort((a, b) => a.rank - b.rank).map((e) => e.raw);
}

/**
 * 「关闭思考」在**上游没有档位表**时的历史退路。
 *
 * ⚠️ 2026-11-08 起算法不再用它:有档位表时退到表里最低的那行原文,
 * 没有表时压根不走 off 分支(见 {@link resolveReasoningEffort} 的三态判断)。
 * 保留导出只为不破坏既有 import。
 */
export const OFF_FALLBACK: LadderLevel = "low";

/** {@link resolveReasoningEffort} 的解析结论 —— 钳制函数出口的统一形状。 */
export interface ResolvedEffort {
  /**
   * 实际要发给上游的值 —— **档位表里的原文**,不做改名。
   * `undefined` = **不发送**该字段(省略,交还上游默认)。
   */
  value: string | undefined;
  /**
   * 是否「关闭思考」。为 `true` 时 {@link value} 恒为 `undefined` ——
   * 「关闭」到底写什么(`none`?压根关不掉?)属于协议方言,由 wire 层决定
   * (`core/gateway/reasoning-wire.ts` 的 `offWireValue`)。
   */
  off: boolean;
  /** 是否发生了改写(精确命中 / 明示允许关闭时为 `false`)。 */
  clamped: boolean;
  /** 结论来源,供请求日志与调试用。 */
  reason:
    | "unspecified" // 客户端没传 → 省略
    | "unknown" // 上游没给档位表 → 省略(不拦)
    | "unsupported" // 上游明说不支持思考 → 省略
    | "unrecognized" // 客户端给的值认不出 → 省略
    | "off" // 请求关闭思考且模型允许 → 交给 wire 层写关闭取值
    | "off-fallback" // 请求关闭思考但模型不允许 → 退到表里最低的那行
    | "exact" // 精确命中
    | "nearest"; // 最近档位钳制
}

/** 档位表的一行:上游原文 + 它在规范阶梯上的位置。 */
interface TableEntry {
  raw: string;
  level: LadderLevel;
  rank: number;
}

/**
 * 原始档位表 → 可比较的行(丢掉 off 与认不出的,按阶梯升序)。
 *
 * ⚠️ 必须排序:表是手写/目录来的,顺序不可靠,而「最低档」在 `off` 退路上
 * 直接决定发什么 —— 不排序就可能把 `max` 当最低档发出去。
 */
function tableOf(levels: readonly string[]): TableEntry[] {
  const out: TableEntry[] = [];
  for (const item of levels) {
    const raw = String(item ?? "").trim();
    if (raw === "") continue;
    const level = canonicalEffort(raw);
    if (level === null || level === "off") continue;
    out.push({ raw, level, rank: LADDER_RANK[level] });
  }
  // 稳定排序:同 rank 的两行(如 minimal / low)保持表内原序。
  return out.sort((a, b) => a.rank - b.rank);
}

/**
 * 统一钳制入口。
 *
 * @param requested 客户端给的 `reasoning_effort`(任意类型,非字符串/空串 = 没传)
 * @param levels 上游给的**原始**档位名单(`real_model.supported_reasoning_efforts`
 *               的原样);`null` = 没给表,`[]` = 明说不支持 —— 两者都「不传」
 * @param allowsOff 是否允许关闭思考;`false` = 明说关不掉(退最低档);
 *                   其余情况(含 `null` 未知)交给 wire 层写关闭取值
 *
 * 返回的 `value` 是**表里那行原文** —— 上游认什么拼写就发什么拼写。
 */
export function resolveReasoningEffort(
  requested: unknown,
  levels: readonly string[] | null | undefined,
  allowsOff: boolean | null = null,
): ResolvedEffort {
  if (typeof requested !== "string" || requested.trim() === "") {
    return { value: undefined, off: false, clamped: false, reason: "unspecified" };
  }
  const req = canonicalEffort(requested);
  if (req === null) {
    // 认不出的取值:无法排进阶梯,只能不传(交给上游拒,由事后闸摘掉)。
    return { value: undefined, off: false, clamped: false, reason: "unrecognized" };
  }

  // 三态:没给表 / 明说不支持 —— 两者都「不传」,但原因不同(日志要分清)。
  if (levels === null || levels === undefined) {
    return { value: undefined, off: false, clamped: false, reason: "unknown" };
  }
  const table = tableOf(levels);
  if (table.length === 0) {
    return { value: undefined, off: false, clamped: false, reason: "unsupported" };
  }

  // ① off 单独处理 —— 它不是阶梯上的强度点。
  //
  // 用户 2026-11-08 定案:「只要有思考强度表,关闭自然只能退到最低档」。
  // 也就是**只有上游没否认能关**才真的发「关闭」;`allowsOff === false`
  // (目录明说关不掉,如 minimax 的 adaptive thinking / trae 无 off 档)时
  // 退到该模型**自己支持的最低档** —— 不是固定的 `low`:表里只有 high/max 时,
  // 发 low 一样会被拒。
  if (req === "off") {
    if (allowsOff !== false) {
      return { value: undefined, off: true, clamped: false, reason: "off" };
    }
    return { value: table[0]!.raw, off: false, clamped: true, reason: "off-fallback" };
  }

  // ② 精确命中:优先「原文逐字相同」的那行(表里可能同时有 minimal/low 两个
  // 同档拼写,用户点名 low 就该发 low),退而求其次按规范档位匹配。
  const wanted = requested.trim().toLowerCase();
  const exact =
    table.find((e) => e.raw.toLowerCase() === wanted) ?? table.find((e) => e.level === req);
  if (exact !== undefined) {
    return { value: exact.raw, off: false, clamped: false, reason: "exact" };
  }

  // ③ 最近档位钳制 —— 比较用 rank,发出去的仍是原文。
  const rank = LADDER_RANK[req];
  const tieToLow = LOW_SIDE_INPUTS.has(req);
  let best = table[0]!;
  let bestDelta = Math.abs(best.rank - rank);
  for (const entry of table) {
    const delta = Math.abs(entry.rank - rank);
    if (delta > bestDelta) continue;
    if (delta < bestDelta) {
      best = entry;
      bestDelta = delta;
      continue;
    }
    // 距离相等:按请求自身的方向取舍(m10447)。
    const wantLow = tieToLow || TIE_PREFER_LOW;
    if (wantLow ? entry.rank < best.rank : entry.rank > best.rank) best = entry;
  }
  return { value: best.raw, off: false, clamped: true, reason: "nearest" };
}
