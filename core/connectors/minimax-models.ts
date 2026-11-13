/**
 * MiniMax Agent 的**内置模型表** —— 目录展示与聊天转发共用同一份。
 *
 * 为什么要单独一个文件:这两个用途以前分居两地 ——
 * - 目录(`collector/catalog.ts`)需要 `name` / `context` / `vision` / 思考档位;
 * - 转发(`connectors/minimax-llm.ts`)需要 `upstreamModel`(上游 chat 端点真正
 *   接受的串)与 `reasoning`(变体语义)。
 * 分开写必然漂移:目录里改名、转发还发旧串,上游回「没有这个模型」。所以表只留
 * 一份,两边 import。
 *
 * ⚠️ **本地 id ≠ 上游串**。`real_model.model` 存本地 id(minimax-m3.1-flash),
 * 而上游只认 `MiniMax-M3.1-Flash`;三个变体共享同一个上游串,靠 `thinking`
 * 参数区分 —— 拿上游串当 id 会在 `real_model` 里塌缩成一行。
 */

/** 思考变体语义:能否关、是否强制。 */
export type MinimaxReasoningMode = "none" | "switchable" | "forced";

export interface MinimaxModelSpec {
  /** 本地 id(`real_model.model` / `/v1/models` 的 id)。 */
  id: string;
  /** 人话名。 */
  name: string;
  /** 上游 chat 端点接受的模型串;空串 = 不是 chat 模型(图像)。 */
  upstreamModel: string;
  context: number | null;
  output: number | null;
  vision: boolean;
  reasoning: MinimaxReasoningMode;
}

/**
 * 内置固定名单(参考实现 minimax2api 的模型表也是内置的)。
 *
 * 上游没有 `/models` 可拉,所以 `origin=router`(本地合成)。
 */
export const MINIMAX_MODELS: readonly MinimaxModelSpec[] = [
  {
    id: "minimax-agent",
    name: "MiniMax Agent",
    upstreamModel: "MiniMax-M3.1-Flash",
    context: 1_048_576,
    output: null,
    vision: true,
    reasoning: "switchable",
  },
  {
    id: "minimax-m3.1-flash",
    name: "MiniMax M3.1 Flash",
    upstreamModel: "MiniMax-M3.1-Flash",
    context: 1_048_576,
    output: null,
    vision: true,
    reasoning: "switchable",
  },
  {
    id: "minimax-m3.1-flash-thinking",
    name: "MiniMax M3.1 Flash Thinking",
    upstreamModel: "MiniMax-M3.1-Flash",
    context: 1_048_576,
    output: null,
    vision: true,
    reasoning: "forced",
  },
  {
    id: "minimax-m3",
    name: "MiniMax M3",
    upstreamModel: "MiniMax-M3",
    context: 1_048_576,
    output: null,
    vision: true,
    reasoning: "switchable",
  },
  {
    id: "minimax-m3-thinking",
    name: "MiniMax M3 Thinking",
    upstreamModel: "MiniMax-M3",
    context: 1_048_576,
    output: null,
    vision: true,
    reasoning: "forced",
  },
  {
    id: "minimax-image",
    name: "MiniMax Image",
    upstreamModel: "",
    context: null,
    output: null,
    vision: true,
    reasoning: "none",
  },
];

/** 本地 id → 表项;未知 id 返回 `null`(不猜)。 */
export function minimaxModelOf(localId: string): MinimaxModelSpec | null {
  const key = String(localId ?? "").trim().toLowerCase();
  if (key === "") return null;
  return MINIMAX_MODELS.find((m) => m.id === key) ?? null;
}

/**
 * 本地 id → 上游 chat 模型串。
 *
 * 未知 id **原样返回**:用户可能自己登记了上游新模型(`minimax-m4` 之类),
 * 原样发过去让上游裁决,比在本地编一个串更诚实 —— 编错只会得到一句
 * 「没有这个模型」,反而看不出问题在本地。
 */
export function minimaxUpstreamModelOf(localId: string): string {
  const spec = minimaxModelOf(localId);
  if (spec !== null && spec.upstreamModel !== "") return spec.upstreamModel;
  return String(localId ?? "").trim();
}

/** 该模型能不能被 chat 端点调用(图像行 callable=false)。 */
export function minimaxCallableOf(localId: string): boolean {
  const spec = minimaxModelOf(localId);
  return spec === null ? true : spec.upstreamModel !== "";
}
