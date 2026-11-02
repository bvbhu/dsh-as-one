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
/**
 * 一张**已归一化**的请求图片(`imageRequestTarget` 的入参形状)。
 *
 * 宿主只把这三项交给 adapter:宽、高、字节数 —— 它不需要也无权知道
 * 图片内容、来源 URL 或附件句柄。
 */
export interface DshRequestImage {
    width: number;
    height: number;
    bytes: number;
}
/**
 * 适配器发给模型的图片尺寸/字节目标(`imageRequestTarget` 的返回形状)。
 * `maxBytes` 是**本次序列化**的上限,不是原图字节数。
 */
export interface DshImageTarget {
    width: number;
    height: number;
    maxBytes: number;
}
/**
 * 一张**已归一化**图片的宿主附件引用 —— 即 DSH `ImageBlock.attachment` 的真实形状。
 *
 * ⚠️ `read_image` 工具的结果与用户附件在消息里都是这个形态:**没有 url**,只有
 * 附件库的内容寻址引用(attachmentId)。想发给上游必须先经宿主
 * `attachments.readImageRequest()` 解出字节,再编成 data URL —— 宿主对 adapter 的
 * 图片契约(`imageRequestTarget`)只给宽/高/字节数,**不给字节内容**。
 */
export interface DshImageAttachmentRef {
    attachmentId: string;
    mediaType: string;
    bytes: number;
    width: number;
    height: number;
    name?: string;
    originalDimensions?: {
        width: number;
        height: number;
    };
}
/**
 * 宿主 `attachments` 服务里 adapter 只用到的那一个方法。
 *
 * 返回的 `data` 是**派生后的请求字节**(不是存储原图);`mediaType` 与宽高是
 * 派生结果的值 —— 序列化时以它为准。
 */
export interface DshAttachmentService {
    readImageRequest(ref: DshImageAttachmentRef, target: DshImageTarget, signal?: AbortSignal): Promise<{
        data: Uint8Array;
        mediaType: string;
        bytes: number;
        width: number;
        height: number;
    }>;
}
/**
 * 适配器契约 —— ⚠️ **这不是"可选方法表"**。
 *
 * 宿主 `LlmAdapter` 基类给每个方法都写了默认实现,但 As One 的 adapter 是
 * **普通类**(不 import 宿主基类,详见本文件头部),所以**基类的默认实现一个都
 * 不会落到我们身上**:没写的方法在宿主眼里就是 `undefined`,而宿主调用处是
 *
 * ```js
 * this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model)
 * ```
 *
 * —— 可选链只护 `adapters.get()`,`adapter.xxx(...)` 本身一旦不存在就是
 * `TypeError: ... is not a function`,整条请求在**计量阶段**直接炸掉(不是上游
 * 报错,是插件自己崩)。`providerInfo` / `listModels` / `resolveModel` /
 * `prepareCall` / `stream` 五个必需方法之外,下列宿主会主动调用的"看起来可选"
 * 的方法**必须逐个实现**:
 *
 * | 方法 | 宿主调用处 | 不实现的现象 |
 * | --- | --- | --- |
 * | `providerInfo` | `prepareRoutes` | `INVALID_ADAPTER`(注册失败) |
 * | `providerRetryPolicy` | `prepareRoutes` | 同左(注册失败) |
 * | `imageRequestPricing` | `llm.imageRequestPricing()` | **本次改动修的就是它** |
 * | `imageRequestTarget` | `llm.imageRequestTarget()` | 截图/图片消费方取不到目标尺寸 |
 */
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
    /**
     * 该路由的**图片计价**声明(宿主 token meter 每次测量都同步调它)。
     *
     * 返回 `undefined` = 本路由不声明视觉 token 定价,计量方回落到自己的中性估算
     * —— 与宿主基类默认实现同义。As One 的上游计费模型各不相同(有的按次、有的
     * 按图块),拿不出一份对所有渠道都成立的换算,所以**不声明**比编一个更诚实。
     *
     * ⚠️ 必须同步返回、不得 I/O(宿主在测量路径上调用)。
     */
    imageRequestPricing(provider: string, model: string): unknown;
    /**
     * 本路由发出去的图片尺寸/字节目标。As One 不做二次缩放(图片原样透传给上游
     * 连接器,由各连接器自己决定),所以原样回传入参 —— 与宿主基类默认实现一致。
     */
    imageRequestTarget(provider: string, model: string, image: DshRequestImage): DshImageTarget;
}
/** `ctx.llm` 服务(只镜像注册相关的那一个方法)。 */
export interface DshLlmService {
    registerAdapter(providers: string[], adapter: DshLlmAdapter): (() => void) & {
        replace(nextProviders: string[]): void;
    };
}
