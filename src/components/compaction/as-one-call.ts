/**
 * 把压缩组件（从 quilt 移植）的一次 LLM 调用翻译成 **as-one 适配器**能识别的调用。
 *
 * ## 为什么必须有这一层（2026-11 用户定案「重写，别照搬插件行为」）
 * quilt 原插件假设 `ctx.llm.stream({ provider, model })` 能按**真实 provider**
 * 分发（maas / openrouter / sensenova 各有适配器）。但 as-one 只注册了**一个**
 * 适配器：`as-one`（见 llm-adapter.ts 的 AS_ONE_PROVIDER）。直接传真实 provider
 * 会得到 `NO_ADAPTER`，分块全部失败 —— 这就是「压缩失败」的根因。
 *
 * as-one 适配器只认 `options.model`，并把它交给 `resolveUpstream(model)`：
 * - 真实模型直连键 = `"provider/model"`（如 `maas/spark-x2.6-4b`），走
 *   scheduler.chain → directChain → 该真实模型的凭据端点；
 * - 逻辑模型名（如 `free`）走逻辑模型成员链。
 *
 * 因此翻译规则：
 * - `provider` = `as-one`；
 * - `model` = `provider/model`（组件锁定真实成员时）或原样（已是逻辑名/完整键）；
 * - **去掉 `purpose: "compaction"`** —— 否则适配器会按 `route.compact` 再重路由 +
 *   再走一遍 compactStream 二次分块，锁不住成员（用户定案：组件选中的成员即实际
 *   调用成员）。组件自己已经把压缩提示词写进 messages，适配器当普通请求直连即可。
 *
 * @module src/components/compaction/as-one-call
 */

/** 默认适配器 provider id（与 llm-adapter.ts 的 AS_ONE_PROVIDER 同值）。 */
export const DEFAULT_AS_ONE_PROVIDER = "as-one";

/**
 * 把一次组件调用翻译成 as-one 适配器调用。
 *
 * @param options 组件原始调用（含真实 provider/model、可能含 purpose）
 * @param asOneProvider as-one 注册的 provider id
 * @returns 交给 `ctx.llm.stream` 的选项
 */
export function toAsOneStreamOptions(
  options: Record<string, unknown>,
  asOneProvider: string = DEFAULT_AS_ONE_PROVIDER,
): Record<string, unknown> {
  const provider = typeof options.provider === "string" ? options.provider : "";
  const model = typeof options.model === "string" ? options.model : "";
  // 已经是完整键（含 /）就原样用；否则拼 provider/model。
  const key = model.includes("/")
    ? model
    : provider !== "" && model !== ""
      ? `${provider}/${model}`
      : model;
  // 去掉 purpose：不要让适配器再触发重路由 / compactStream 二次分块。
  const { purpose: _drop, ...rest } = options;
  void _drop;
  return { ...rest, provider: asOneProvider, model: key };
}
