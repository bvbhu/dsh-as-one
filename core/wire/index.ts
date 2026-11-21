/**
 * 线格式编解码器注册表 —— 协议名 → 「谁能编这个协议的请求」。
 *
 * ## 为什么要有这一层
 *
 * 拆出 `wire/anthropic.ts` 之后，`bodyForProtocol` 里仍然是一个个
 * `if (protocol === "minimax")` / `if (protocol === "anthropic")`。每接一个
 * Messages 渠道就要再抄一段，而两处的协议分支（组体 / 解析帧）迟早漂移。
 *
 * 这里只收**请求方向**的注册（响应方向的翻译器与协议无关，同一个
 * `createAnthropicChunkTranslator` 就够），并给出 `wireFamilyOf` 供流解析层按
 * **线族**而不是按协议名分支。
 *
 * ## 两条输入路径（跳数账的关键）
 *
 * - **有块投影**（DSH 进程内路径）：`blocks → messages`，**一次**形状转换。
 * - **没有块投影**（HTTP 客户端从 chat 进来）：`chat → messages`，也是**一次**，
 *   但源形状是 chat。
 *
 * 两条都不会出现「chat → messages → chat → messages」那种来回切。
 *
 * ## 分层说明
 *
 * 本模块是**组装层**：它 import 各连接器里的方言常量（MiniMax 的
 * `MINIMAX_QUIRKS`、自建渠道的 `ANTHROPIC_QUIRKS`）。基础层 `wire/anthropic.ts`
 * 不反向依赖本模块，所以没有环。
 */

import {
  toAnthropicRequest,
  toAnthropicRequestFromBlocks,
  type AnthropicQuirks,
  type BlockRequest,
} from "./anthropic.js";
import { MINIMAX_QUIRKS } from "../connectors/minimax-llm.js";
import { ANTHROPIC_QUIRKS, anthropicQuirksFrom } from "../connectors/anthropic.js";

/** 线族：决定请求怎么组、流怎么解。 */
export type WireFamily = "chat" | "anthropic";

/** 编解码器组体时的可选上下文（都是可选：HTTP 路径没有块投影）。 */
export interface WireEncodeExtra {
  /** DSH 路径的块投影；有就**优先**走块 → messages（省一次形状转换）。 */
  blocks?: BlockRequest;
  /** 网关钳制后的输出预算（块路径没有 chat body 可读）。 */
  maxTokens?: number;
}

/** 线格式编解码器（请求方向）。 */
export interface WireCodec {
  family: WireFamily;
  /**
   * OpenAI chat 请求体 → 该协议的请求体。
   *
   * @param body   网关组好的 chat 请求体（已剥内部键）
   * @param model  **上游**模型串（调用方负责本地 id 映射）
   * @param effort 已翻成上游取值的思考强度
   * @param creds  连接器附加字段（`quirks` 从这里取）
   * @param extra  块投影 / 输出预算
   */
  encodeBody(
    body: Record<string, unknown>,
    model: string,
    effort?: string,
    creds?: Record<string, unknown>,
    extra?: WireEncodeExtra,
  ): Record<string, unknown>;
}

/** 块投影优先；没有就退回 chat 体。 */
function encodeWith(
  quirks: AnthropicQuirks,
  body: Record<string, unknown>,
  model: string,
  effort: string | undefined,
  extra: WireEncodeExtra | undefined,
): Record<string, unknown> {
  if (extra?.blocks !== undefined) {
    return toAnthropicRequestFromBlocks(extra.blocks, model, effort, quirks, extra.maxTokens);
  }
  return toAnthropicRequest(body, model, effort, quirks);
}

/** MiniMax：内建渠道，方言固定（实测见 `docs/probe-anthropic-thinking.md`）。 */
const MINIMAX_CODEC: WireCodec = {
  family: "anthropic",
  encodeBody(body, model, effort, _creds, extra) {
    return encodeWith(MINIMAX_QUIRKS, body, model, effort, extra);
  },
};

/** 自建 Messages 渠道：保守默认 + 凭据 `quirks` 逐项覆盖。 */
const ANTHROPIC_CODEC: WireCodec = {
  family: "anthropic",
  encodeBody(body, model, effort, creds, extra) {
    const quirks: AnthropicQuirks = { ...ANTHROPIC_QUIRKS, ...anthropicQuirksFrom(creds?.["quirks"]) };
    return encodeWith(quirks, body, model, effort, extra);
  },
};

/** 协议 → 编解码器。未注册的协议返回 `undefined`（调用方按 chat 族兜底）。 */
export function wireCodecFor(protocol: string): WireCodec | undefined {
  if (protocol === "minimax") return MINIMAX_CODEC;
  if (protocol === "anthropic") return ANTHROPIC_CODEC;
  return undefined;
}

/**
 * 协议 → 线族。流解析层按它分支（`anthropic` 族共用同一个翻译器），
 * 未注册协议一律 `chat` —— 与 `toProtocol()` 的兜底口径一致。
 */
export function wireFamilyOf(protocol: string): WireFamily {
  return wireCodecFor(protocol)?.family ?? "chat";
}
