/**
 * reasoning-wire.ts —— 思考强度的**字段方言**,不含任何「档位 → 档位」映射。
 *
 * ## 分工(改这里之前先读)
 *
 * - `reasoning-effort.ts` 负责**取值**:它拿 `real_model.supported_reasoning_efforts`
 *   这张表(上游自己的拼写,如 `xhigh` / `light` / `extra_high`)做精确命中与
 *   最近档位钳制,产出**表里那行原文**。这套映射与协议无关,全渠道共用一套。
 * - 本文件只管两件**协议方言**的事:
 *   1. 字段落在报文的哪儿(`reasoning_effort` vs Anthropic 的 `output_config.effort`);
 *   2. 「关闭思考」这个**状态**在该协议里写成什么值。
 *
 * 因为取值直接来自表,这里**没有** `max → xhigh`、`low → light` 这类翻译 —
 * 那些拼写本来就躺在表里,钳制时选中的就是它们。
 *
 * ## 为什么「关闭」还要单独判
 *
 * `off` 不是阶梯上的强度点,表里也不该出现(落库时会被丢掉)。它写进报文时
 * 各协议并非都有对应表达:
 *
 * | 协议 | 关闭取值 | 依据(2026-11-08) |
 * |---|---|---|
 * | `openai` 兼容 / `sensenova` / `workbuddy` / `qoder` | `none` | OpenAI 口径;实测 low~max 之外 `none` 也被接受 |
 * | `minimax` | **不发** | Anthropic Messages 自适应思考:`thinking:{type:"disabled"}` 与 `effort:"none"` 均被 400 拒(`requires adaptive thinking`),关不掉 |
 * | `trae` | `none`(实际不会走到) | 目录 `reasoning_effort_config.options` = light/high/extra_high,无关闭档 → 目录侧 `allows_off=false`,钳制阶段已退到最低档 |
 *
 * ⚠️ `trae` / `minimax` 的「关不掉」是**目录声明**(`reasoning_allows_off=false`),
 * 不是这里的特判 —— 例外只有 minimax 的字段方言确实没有关闭表达。
 */

/** 关闭思考时写进 `reasoning_effort` 的取值;`undefined` = 该协议无法表达关闭。 */
export function offWireValue(protocol: string | null | undefined): string | undefined {
  // MiniMax 直连 LLM 是 Anthropic Messages 方言,`output_config.effort` 没有
  // 「关闭」这一档(见文件头表格)。目录侧已声明 allows_off=false,正常路径
  // 根本到不了这里;真到了也只发「不带该字段」,不发一个必定 400 的值。
  if (protocol === "minimax") return undefined;
  return "none";
}
