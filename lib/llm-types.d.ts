/**
 * DSH `ctx.llm` 的**结构镜像**(零运行时依赖)。
 *
 * 为什么是镜像而不是 `import type { … } from "@deepseek-ai/dsh-llm"`:
 * 插件包的 dependencies 里没有也不需要那个包(宿主提供),一旦 import 就会
 * 在 tsc 与 esbuild 两处都变成硬依赖。宿主是鸭子类型校验的(零 `instanceof`),
 * 所以只要形状对得上就成立。
 *
 * 事实来源(逐条核对过,勿凭记忆改):
 * - `dsh-llm/lib/types/invariant.js` validateStream —— 流语法;
 * - `dsh-llm/lib/index.js` registerAdapter / normalizeModelInfo /
 *   normalizeLlmFailure —— 注册与元数据校验;
 * - `dsh-llm-deepseek/lib/index.js` —— 唯一可参考的真实 adapter 实现。
 */
/** 内容块(adapter 需要发出/接收的那几种;其余形态只作占位)。 */
export type DshContentBlock = {
    type: "text";
    text: string;
} | {
    type: "reasoning";
    text: string;
} | {
    type: "tool-call";
    id: string;
    name: string;
    arguments: string;
} | {
    type: string;
    [key: string]: unknown;
};
/** 会话消息(loop 构建的请求以深度冻结状态到达,只读)。 */
export interface DshMessage {
    id?: string;
    role: "system" | "developer" | "user" | "assistant" | "tool";
    content: DshContentBlock[];
    /** role=tool 时指向对应的 tool-call id。 */
    toolCallId?: string;
    isError?: boolean;
    source?: {
        kind?: string;
        provider?: string;
        model?: string;
        replayState?: unknown;
    };
}
/** 工具定义(开发者视角的名字/描述/JSON Schema 参数)。 */
export interface DshToolDefinition {
    name: string;
    description?: string;
    parameters?: unknown;
}
/** token 用量(chunk `usage`)。 */
export interface DshUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
}
/** 失败事实(必须与 LlmError.failure 同形,否则宿主整份丢弃)。 */
export interface DshFailure {
    message: string;
    code: string;
    status?: number;
    providerRetryAfterMs?: number;
    requestId?: string;
}
/** 结束原因。finish 是流的**唯一**终止 chunk。 */
export interface DshFinishReason {
    kind: "stop" | "max-tokens" | "tool-calls" | "error" | "aborted";
    failure?: DshFailure;
}
/**
 * 流式分片。硬约束(validateStream):
 * - block-start 的 index 不得重复;
 * - text/reasoning/tool-call delta 必须落在已开的**同型**块上;
 * - block-end 的 index 必须已开且 `block.type` 与该块类型一致;
 * - usage 最多一次;
 * - 流结束必须有 finish,且 finish 时不得有未关闭的块(除非 error/aborted)。
 */
export type DshStreamChunk = {
    type: "block-start";
    index: number;
    blockType: "text" | "reasoning" | "tool-call";
} | {
    type: "text-delta";
    index: number;
    text: string;
} | {
    type: "reasoning-delta";
    index: number;
    text: string;
} | {
    type: "tool-call-delta";
    index: number;
    id: string;
    name?: string;
    argumentsDelta: string;
} | {
    type: "block-end";
    index: number;
    block: DshContentBlock;
} | {
    type: "usage";
    usage: DshUsage;
} | {
    type: "finish";
    reason: DshFinishReason;
    replayState?: unknown;
};
/** 目录条目(GUI 模型选择器读的就是这个;`id` 必须非空且不重复)。 */
export interface DshCatalogModelInfo {
    provider: string;
    id: string;
    name: string;
    description?: string;
    inputModalities?: string[];
}
/** 精确模型元数据(`resolveModel` 的返回;每次能力查询都校验一遍)。 */
export interface DshResolvedModelInfo extends DshCatalogModelInfo {
    context?: {
        contextWindow: number;
    };
    defaultMaxTokens?: number;
    systemPromptUpdate?: "in-history";
    toolUpdate?: "in-history" | "addition-only";
    reasoning?: {
        efforts: Array<{
            id: string;
            name: string;
            description?: string;
        }>;
        defaultEffort?: string;
    };
}
/**
 * `stream(options)` 的入参。宿主只会填这几个字段
 * (README:「GenerateOptions 采样只包含 temperature／maxTokens／stop」),
 * 别期望 tool_choice / top_p —— 它们根本不存在。
 */
export interface DshGenerateOptions {
    provider: string;
    model: string;
    messages: DshMessage[];
    /** 系统提示词是**独立字段**,不在 messages 里。 */
    system?: string;
    tools?: DshToolDefinition[];
    toolHistory?: unknown;
    temperature?: number;
    maxTokens?: number;
    stop?: string[];
    reasoningEffort?: string;
    sessionId?: string;
    signal?: AbortSignal;
}
/** `prepareCall` 的返回:一次调用绑定的元数据 + 分发入口。 */
export interface DshPreparedCall {
    model: DshResolvedModelInfo;
    stream(options: DshGenerateOptions): AsyncIterable<DshStreamChunk>;
}
/** 适配器契约(只实现用到的那几个方法;其余由宿主基类默认实现兜底)。 */
export interface DshLlmAdapter {
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    providerRetryPolicy?(provider: string): unknown;
    listModels(provider: string): DshCatalogModelInfo[] | Promise<DshCatalogModelInfo[]>;
    resolveModel(provider: string, model: string, signal?: AbortSignal): DshResolvedModelInfo | Promise<DshResolvedModelInfo>;
    prepareCall(provider: string, model: string, signal?: AbortSignal): DshPreparedCall | Promise<DshPreparedCall>;
    stream(options: DshGenerateOptions): AsyncIterable<DshStreamChunk>;
}
/** `ctx.llm` 服务(只镜像注册相关的那一个方法)。 */
export interface DshLlmService {
    registerAdapter(providers: string[], adapter: DshLlmAdapter): (() => void) & {
        replace(nextProviders: string[]): void;
    };
}
