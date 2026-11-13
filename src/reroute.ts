/**
 * 辅助请求的**重路由设置**。
 *
 * 宿主除了用户那一轮对话,还会自己发几种「辅助请求」:压缩摘要、会话标题;
 * 网关自己还有图像桥解析。这些请求全部经同一个 adapter 出站,只是带了
 * `purpose` 标记(见 `llm-types.ts` 的 `DshGenerateOptions.purpose`)。
 *
 * 口径(2026-11-14 用户定案):
 * - **默认全空 = 没有重路由机制** —— 任何 `purpose` 都按客户端给的模型走,
 *   网关不改模型、不改会话号、也不做分块;
 * - 每个用途**一个独立设置项**,值是 as-one 的抽象模型名(逻辑模型);
 * - 配了但库里没有该模型 → 回落原模型并告警(半个重路由比没有更糟:
 *   会话号 / 图片占位都按"重路由"处理了,模型却没换,排查时会误以为是模型问题)。
 *
 * 为什么是设置项而不是常量:这几个车道的成本/能力差异完全取决于用户自己的
 * 模型库(免费额度、视觉能力、窗口大小),写死等于替用户做了一次不可撤销的选择。
 */

/** 宿主 / 网关已经接线的辅助请求用途。 */
export type ReroutePurpose = "compaction" | "vision" | "session-title";

export interface RerouteSettings {
  /** 压缩摘要(`purpose: "compaction"`):会被分块再摘要,窗口可以小于主模型。 */
  compact?: string;
  /** 图像桥解析:必须真的能看图,否则解析必然失败。 */
  vision?: string;
  /** 会话标题(`purpose: "session-title"`):短请求,适合最便宜的那条车道。 */
  sessionTitle?: string;
}

/**
 * 用途 → 设置项。**只列已接线的用途**;未列出的 `purpose`(宿主以后新加的)
 * 一律不重路由 —— 认不出的用途贸然换模型,风险远大于省下的那点钱。
 */
const PURPOSE_TO_KEY: Record<string, keyof RerouteSettings> = {
  compaction: "compact",
  vision: "vision",
  "session-title": "sessionTitle",
};

/** 配置里接受的键名别名(容忍 kebab / snake / 旧名)。 */
const KEY_ALIASES: Record<keyof RerouteSettings, string[]> = {
  compact: ["compact", "compaction"],
  vision: ["vision", "imageParse", "image-parse", "image_parse"],
  sessionTitle: ["sessionTitle", "session-title", "session_title", "title"],
};

const EMPTY: RerouteSettings = {};

/**
 * 把 YAML 里的原始配置洗成 {@link RerouteSettings}。
 *
 * 只认非空字符串;其余(数字、数组、空串、null)一律**当作没配** ——
 * 这类配置错误的后果是"多花一次钱",不是"请求失败",所以宽松处理并留痕即可。
 */
export function normalizeReroutes(raw: unknown): RerouteSettings {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return EMPTY;
  const src = raw as Record<string, unknown>;
  const out: RerouteSettings = {};
  for (const key of Object.keys(KEY_ALIASES) as (keyof RerouteSettings)[]) {
    for (const alias of KEY_ALIASES[key]) {
      const value = src[alias];
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;
      out[key] = trimmed;
      break;
    }
  }
  return out;
}

/**
 * 某个 `purpose` 该走的模型;`undefined` = **不重路由**(按原模型走)。
 *
 * 这是整个重路由机制的唯一开关:调用方只需要判断返回值是否为 `undefined`,
 * 不必知道有哪些用途、也不必知道配置长什么样。
 */
export function rerouteModel(
  settings: RerouteSettings | undefined,
  purpose: string | undefined,
): string | undefined {
  if (!settings || !purpose) return undefined;
  const key = PURPOSE_TO_KEY[purpose];
  if (key === undefined) return undefined;
  const model = settings[key];
  if (typeof model !== "string") return undefined;
  const trimmed = model.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 已配置的重路由条数(启动日志用;0 = 无重路由机制)。 */
export function rerouteCount(settings: RerouteSettings): number {
  let count = 0;
  for (const model of Object.values(settings)) {
    if (typeof model === "string" && model.trim().length > 0) count += 1;
  }
  return count;
}
