/**
 * 客户端请求体**字段处理表**(2026-10-24 用户定案,m09081)。
 *
 * ## 原则:能处理就处理,不能处理就丢弃,**绝不拒绝请求**
 *
 * 网关是「OpenAI 兼容」的入口,而客户端(DSH、bili 代理、各种 SDK)会带上一堆
 * 网关并不认识的顶层字段 —— 有些是标准 OpenAI 参数,有些是宿主自己的扩展
 * (billion-context 的 `prompt_cache_key`),还有些纯属未来/别家的字段。
 *
 * 旧行为是**静默丢弃**:请求能过,但用户完全不知道自己的字段没了。
 * 现在改成三段式,并且**把丢弃记录下来**:
 *
 * | action    | 含义 | 去向 |
 * | --- | --- | --- |
 * | `forward` | 认识,且语义明确 | 原样透传给上游 |
 * | `consume` | 认识,但属**网关内部键** | 网关自己用(路由亲和等),**不进上游 body** |
 * | `drop`    | 不认识 / 无语义 | 丢弃,只记日志与请求明细 |
 *
 * ⚠️ **不要因为「字段不认识」就返回 400**。OpenAI 兼容接口的现实是:
 * 客户端升级会带新字段,网关不可能永远跟得上;而拒掉一个本来能跑的对话,
 * 代价远大于少用一个参数。所以默认出口是「丢弃 + 记录」,不是「拒绝」。
 *
 * ## 两条容易被忽略的线
 *
 * 1. **`prompt_cache_key` 是路由键,不是上游参数**。它是 billion-context 插件
 *    给「前缀相同的一批请求」算出的缓存路由键 —— 上游拿到它只会 400
 *    (实测:带键 400、去键成功),但**网关拿它可以做端点亲和**:
 *    同一前缀 → 同一推理节点 → 上游前缀缓存命中。所以它进 `consume`。
 * 2. **`reasoning_effort` 只原样透传**。网关不解释它、不改写它;上游说不支持,
 *    就丢掉重试一次(见 `apps/electron/src/main/gateway-upstream.ts` 的
 *    `isReasoningEffortRejection`)。**未指定时不添加** —— 让上游自己决定。
 *    唯一例外是「图像和长上下文拓展」这类网关内部的辅助调用:它们未指定时必须
 *    显式 `reasoning_effort: "none"`(开着思考会把输出预算烧在推理上)。
 */

/** 字段处理动作。 */
export type RequestFieldAction = "forward" | "consume" | "drop";

export interface RequestFieldSpec {
  readonly name: string;
  readonly action: RequestFieldAction;
  /** 人类可读说明(排查「这个字段怎么没了」时看)。 */
  readonly note: string;
}

/**
 * 网关**内部消费**的顶层字段 —— 绝不进上游 body。
 *
 * - `session_id`:会话亲和键(DSH 透传)。
 * - `prompt_cache_key`:billion-context 的前缀缓存路由键 → 端点亲和键。
 */
export const CONSUMED_FIELDS: readonly string[] = ["session_id", "prompt_cache_key"] as const;

/** `prompt_cache_key` 的字段名(billion-context 插件)。 */
export const CACHE_ROUTING_KEY_FIELD = "prompt_cache_key";

/** `session_id` 的字段名。 */
export const SESSION_ID_FIELD = "session_id";

/**
 * 透传给上游的字段(OpenAI 兼容形状)。
 *
 * ⚠️ 只放**语义明确**的字段。拿不准的一律不进这张表 —— 丢了最多是「少个参数」,
 * 传错可能让整个请求被上游拒(例如把 Anthropic 的 `thinking` 发给 OpenAI 兼容端点)。
 */
export const FORWARDED_FIELDS: readonly string[] = [
  "model",
  "messages",
  "stream",
  "temperature",
  "top_p",
  "max_tokens",
  // OpenAI 的同义字段(`max_tokens` 的新名字),网关一起收。
  "max_completion_tokens",
  "stop",
  "tools",
  "tool_choice",
  // 思考强度:只原样透传,网关不解释、不改写。
  "reasoning_effort",
  // camelCase 别名(部分 SDK 这么发)—— 归一到 `reasoning_effort`。
  "reasoningEffort",
  "stream_options",
  "user",
  "n",
  "presence_penalty",
  "frequency_penalty",
  "logprobs",
  "top_logprobs",
  "response_format",
  "seed",
  "metadata",
  "parallel_tool_calls",
  "logit_bias",
  "chat_template_kwargs",
] as const;

/** 全部已知字段(forward + consume)。 */
const KNOWN_FIELDS: ReadonlySet<string> = new Set<string>([
  ...FORWARDED_FIELDS,
  ...CONSUMED_FIELDS,
]);

const FIELD_NOTES: Readonly<Record<string, string>> = {
  model: "对外模型名(逻辑模型或 provider/model)",
  messages: "对话历史",
  stream: "流式开关",
  temperature: "采样温度",
  top_p: "核采样",
  max_tokens: "输出预算",
  max_completion_tokens: "max_tokens 的同义字段",
  stop: "停止串",
  tools: "工具定义",
  tool_choice: "工具选择策略",
  reasoning_effort: "思考强度(只原样透传)",
  reasoningEffort: "reasoning_effort 的 camelCase 别名",
  stream_options: "流式选项(include_usage)",
  user: "调用方标识",
  n: "生成条数",
  presence_penalty: "存在惩罚",
  frequency_penalty: "频率惩罚",
  logprobs: "返回 logprobs",
  top_logprobs: "logprobs 条数",
  response_format: "响应格式约束",
  seed: "随机种子",
  metadata: "元数据",
  parallel_tool_calls: "允许并行工具调用",
  logit_bias: "token 偏置",
  chat_template_kwargs: "模板参数(部分上游支持)",
  session_id: "网关内部键:会话亲和",
  prompt_cache_key: "网关内部键:前缀缓存路由键 → 端点亲和",
};

/** 字段处理报告(给日志与请求明细用)。 */
export interface RequestFieldReport {
  /** 透传给上游的字段名(已归一,含 `reasoning_effort`)。 */
  readonly forwarded: string[];
  /** 网关内部消费的字段名(不进上游 body)。 */
  readonly consumed: string[];
  /** 无法处理 → 丢弃的字段名。 */
  readonly discarded: string[];
}

/**
 * 给客户端请求体分类:哪些透传、哪些内部消费、哪些丢弃。
 *
 * ⚠️ 只读顶层键 —— 不递归,不解释嵌套结构(`messages` 里的东西由上游自己解析)。
 * 未知键一律进 `discarded`(**不抛错、不拒绝**)。
 */
export function classifyRequestFields(body: unknown): RequestFieldReport {
  const forwarded: string[] = [];
  const consumed: string[] = [];
  const discarded: string[] = [];
  if (body === null || typeof body !== "object") {
    return { forwarded, consumed, discarded };
  }
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if ((CONSUMED_FIELDS as readonly string[]).includes(key)) {
      consumed.push(key);
    } else if ((FORWARDED_FIELDS as readonly string[]).includes(key)) {
      forwarded.push(key);
    } else {
      discarded.push(key);
    }
  }
  return { forwarded, consumed, discarded };
}

/** 字段的处理动作(给排查用;未知字段返回 `drop`)。 */
export function requestFieldAction(name: string): RequestFieldAction {
  if ((CONSUMED_FIELDS as readonly string[]).includes(name)) return "consume";
  if ((FORWARDED_FIELDS as readonly string[]).includes(name)) return "forward";
  return "drop";
}

/** 字段的说明(未知字段返回空串)。 */
export function requestFieldNote(name: string): string {
  return FIELD_NOTES[name] ?? "";
}

/**
 * 取客户端的**缓存路由键**(billion-context 的 `prompt_cache_key`)。
 *
 * ⚠️ 它进 `consume`:网关拿它做端点亲和(前缀缓存),但**绝不转发给上游** ——
 * 上游见到这个键会直接 400(实测:带键 400、去键成功)。
 */
export function cacheRoutingKeyOf(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const raw = (body as Record<string, unknown>)[CACHE_ROUTING_KEY_FIELD];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * 取客户端的思考强度:`reasoning_effort` 为主,`reasoningEffort` 别名兜底。
 *
 * ⚠️ **只原样透传** —— 网关不解释档位值、不做映射。非字符串一律视为未指定。
 */
export function reasoningEffortOf(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  const primary = rec["reasoning_effort"];
  if (typeof primary === "string" && primary.length > 0) return primary;
  const alias = rec["reasoningEffort"];
  if (typeof alias === "string" && alias.length > 0) return alias;
  return undefined;
}

export const REQUEST_FIELDS = {
  CACHE_ROUTING_KEY_FIELD,
  SESSION_ID_FIELD,
  CONSUMED_FIELDS,
  FORWARDED_FIELDS,
  classifyRequestFields,
  requestFieldAction,
  requestFieldNote,
  cacheRoutingKeyOf,
  reasoningEffortOf,
} as const;

/** 已知字段集合(测试/排查用)。 */
export { KNOWN_FIELDS };
