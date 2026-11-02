/**
 * As One 的 DSH LLM adapter —— 把网关的模型嵌进 DSH 原生模型选择器。
 *
 * 为什么需要它:`dsh-api-session-controller` 的 `buildModelCatalog` 只认
 * `ctx.llm.listProviders()` → 每个 provider 的 `listModels()`,GUI 的模型
 * 下拉就是这份数据。As One 的模型此前只在 `/v1/models` 与自己的面板里,
 * DSH 选择器看不到。注册这个 adapter 后**前端零改动**。
 *
 * 三条硬规矩(逐条对着宿主源码核过,违反就是整条链路报错):
 * 1. **流语法**:宿主 `validateStream` 要求 block-start / delta / block-end 配平,
 *    `finish` 唯一且收尾时不得有未关闭块。上游是 OpenAI delta 形态(没有块概念),
 *    所以**块由本文件合成**。
 * 2. **错误形状**:宿主 `normalizeLlmFailure` 只在「own `failure` 且
 *    `failure.code === own code`」时复用失败信息,否则一律 `UNKNOWN` ——
 *    状态码与 Retry-After 全丢。所以抛错必须用 {@link AsOneLlmError}。
 * 3. **元数据边界**:`contextWindow` / `defaultMaxTokens` 必须是正安全整数,
 *    `reasoning.efforts` 不得是空数组(空 → `INVALID_MODEL_REASONING`),
 *    所以拿不准的一律**不给**,让宿主用默认值。
 *
 * 关于 `attributionHeaders()`:基类文档要求每个 provider HTTP 请求带归因头。
 * 本 adapter 不发公网 HTTP —— 它调的是**同进程内**的 As One 上游
 * (`rt.resolveUpstream`),归因头由真正的出口(各连接器)在上游侧负责。
 */
import type { ChatCompletionChunk, ChatMessage, ModelEntry, UpstreamRequest } from "@as-one/core/src/gateway/types.js";
import type { AsOneRuntime } from "./setup.js";
import type { DshAttachmentService, DshCatalogModelInfo, DshFailure, DshFinishReason, DshGenerateOptions, DshImageAttachmentRef, DshImageTarget, DshLlmAdapter, DshMessage, DshPreparedCall, DshRequestImage, DshResolvedModelInfo, DshStreamChunk } from "./llm-types.js";
/** 注册用的 provider id —— 必须与 `registerAdapter(["as-one"], …)` 逐字一致。 */
export declare const AS_ONE_PROVIDER = "as-one";
/** 选择器里显示的组名。 */
export declare const AS_ONE_PROVIDER_NAME = "As One \u00B7 \u5408\u4E00";
/**
 * 与宿主 `LlmError` **同形**的失败(不能 import,所以自己实现)。
 *
 * 校验口径抄自 `dsh-llm/lib/index.js` 的 `failureSnapshot`:message/code 非空、
 * `status` ∈ [100,599] 整数、`providerRetryAfterMs` 正有限数、`requestId` 非空。
 * 任一项不合规就整项丢掉 —— 宁可少给,不能因为一个坏字段让宿主把**整份** failure
 * 作废(那样状态码和退避时间一起没了)。
 */
export declare class AsOneLlmError extends Error {
    readonly code: string;
    readonly failure: DshFailure;
    constructor(message: string, code: string, extra?: {
        status?: number;
        providerRetryAfterMs?: number;
        requestId?: string;
    });
}
/** 把 As One 侧的任意异常翻译成宿主认得的失败。 */
export declare function toLlmError(err: unknown, fallbackMessage: string): AsOneLlmError;
/**
 * `ModelEntry` → 宿主元数据。
 *
 * 思考强度:`reasoning_efforts` 为 `null`/`[]`/缺省 时**不声明** `reasoning` ——
 * 声明了就必须给非空 efforts,而空数组在宿主侧直接 `INVALID_MODEL_REASONING`。
 * `reasoning_allows_off === true` 才追加一档 `off`(三态里 `null` 是「上游没说」,
 * 不等同于「可以关」)。档位 id 原样透传给网关(它按规范阶梯认值),显示名用中文,
 * 用户在 DSH 的「推理等级」子菜单里看到的是 低/中/高/最高/关闭。
 */
export declare function modelInfoOf(entry: ModelEntry, provider?: string): DshResolvedModelInfo;
/**
 * 把消息里的图片块解析成**内联数据 URL**(只动 image 块,其余原样返回)。
 *
 * ⚠️ 为什么必需:DSH 的图片块只带附件引用,宿主对 adapter 的图片契约
 * (`imageRequestTarget`)只给宽/高/字节数、**不给字节内容** —— 想要字节必须
 * 自己经 `ctx.attachments.readImageRequest()` 读。不解析 = 图永远到不了网关
 * (用户「会话模型看不到图」的根因)。
 *
 * 已经能直接取到 URL 的块(自带 url/data_url/裸 base64)原样保留,交给
 * {@link imageUrlOf} 的宽容探测。没有附件服务(纯 Web 宿主)时图片块按旧行为
 * 丢弃 —— 文字照常。
 */
export declare function resolveImagesInMessages(messages: DshMessage[], attachments: DshAttachmentService | undefined, targetOf: (ref: DshImageAttachmentRef) => DshImageTarget, signal?: AbortSignal): Promise<DshMessage[]>;
/**
 * DSH 消息历史 → OpenAI `messages`。
 *
 * `options.system` 是**独立字段**(不在 messages 里),而历史里也可能带 system /
 * developer 块(in-history 语义)。这里统一收拢成**一条**前置 system —— 与参考
 * 实现 `[options.system, historySystem].filter(Boolean).join("\n\n")` 同口径。
 */
export declare function toChatMessages(options: DshGenerateOptions): ChatMessage[];
/**
 * `GenerateOptions` → 上游请求。
 *
 * ⚠️ `max_tokens` 与 `maxTokensClient` 都要给:前者是本轮发往上游的预算,
 * 后者是**未钳制**的客户端原值 —— 换档重试时 `clampMaxTokens` 必须从原值重算
 * (拿上一轮钳过的值再 min 会越试越小)。
 */
export declare function toUpstreamRequestFromOptions(options: DshGenerateOptions): UpstreamRequest;
/** OpenAI `finish_reason` → 宿主 finish kind。 */
export declare function finishKindOf(reason: string | null | undefined): DshFinishReason["kind"];
/**
 * OpenAI delta 流 → DSH 块流。
 *
 * 上游没有「块」的概念,所以这里按**出现顺序**给每种内容分配 index:
 * 同一种内容(如 reasoning)始终占同一个 index,换类型才开新 index。
 * 收尾时按 index 升序关闭所有块 —— 宿主 `validateStream` 要求 finish 时
 * `open.size === 0`。
 */
export declare function translateStream(source: AsyncIterable<ChatCompletionChunk>, modelName: string): AsyncGenerator<DshStreamChunk>;
export interface AsOneLlmAdapterOptions {
    /** 覆盖注册 id(测试用)。 */
    provider?: string;
    /** 覆盖显示名。 */
    providerName?: string;
    /**
     * 宿主 `attachments` 服务的惰性取用口(每次请求现取 —— 服务可能晚于本 adapter
     * 挂载,或者根本没有;没有时 adapter 如实降级丢掉图片块)。
     *
     * 用**回调**而不是直接传服务实例:插件 `ctx.inject(["llm"], …)` 注册 adapter
     * 时 attachments 可能还没挂,拿一次快照会永远拿不到。
     */
    resolveAttachments?: () => DshAttachmentService | undefined;
}
/**
 * 适配器本体。一个实例对应一个 As One 运行时。
 *
 * ⚠️ **不是"实现五个必需方法就行"**。宿主 `LlmAdapter` 基类虽然为 `providerInfo`
 * / `providerRetryPolicy` / `imageRequestPricing` / `imageRequestTarget` /
 * `listModels` / `resolveModel` / `prepareCall` / `stream` 都写了默认实现,
 * 但本类是**普通类**(宿主包只有 .js 没有 .d.ts,运行时不 import),继承链不存在
 * ⇒ 基类默认实现**一个都不会生效**。宿主调用处大量写成
 * `adapter.xxx(...)`(可选链只护前面的 `get()`),漏一个方法就是
 * `TypeError: ... is not a function` —— 2026-11-01 的
 * `imageRequestPricing is not a function` 就是这么来的(声明了 image 模态之后,
 * 宿主的 token meter 才开始调它)。新增能力时**先把基类方法表对一遍**。
 */
export declare class AsOneLlmAdapter implements DshLlmAdapter {
    private readonly rt;
    private readonly provider;
    private readonly providerName;
    private readonly resolveAttachments;
    constructor(rt: Pick<AsOneRuntime, "listModels" | "resolveUpstream" | "onRequestDone">, opts?: AsOneLlmAdapterOptions);
    /** `id` 必须**逐字**等于注册时的 provider,否则宿主判 `INVALID_ADAPTER`。 */
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    /** 退避策略交给宿主默认(`{mode:"normal", maxRetries:5, …}`)。 */
    providerRetryPolicy(): undefined;
    /**
     * 本路由的**图片计价**声明 —— 宿主 token meter 每次测量都同步调它。
     *
     * ⚠️ **这个方法不写就整条链路崩**:宿主调用处是
     * `this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model)`,
     * 可选链只护前面的 `get()`;方法本身不存在时抛的是
     * `TypeError: ... imageRequestPricing is not a function`,而且发生在**计量
     * 阶段** —— 用户看到的是"请求发不出去",日志里却在 llm runtime 深处。
     * 宿主基类 `LlmAdapter` 给了默认实现(`return undefined`),但本 adapter 是
     * 普通类、不继承宿主基类(宿主只有 .js 没有 .d.ts),默认实现落不到这里。
     *
     * 为什么返回 `undefined` 而不是一套单价:As One 的上游计费口径各不相同
     * (按次 / 按图块 / 按 token),拿不出一份对所有渠道都成立的视觉 token 换算;
     * 声明一个假单价会让宿主算出一个理直气壮的错数,比"不声明、由计量方回落
     * 中性估算"更糟。
     */
    imageRequestPricing(_provider: string, _model: string): undefined;
    /**
     * 本路由发出去的图片尺寸/字节目标。
     *
     * As One **不做二次缩放**:图片原样透传给上游连接器(`toChatMessages` 把图片
     * 块转成 `image_url` 分段),要不要压缩由各连接器自己决定。所以这里原样回传
     * 宿主给的宽/高/字节数 —— 与宿主基类默认实现同义,但必须**显式存在**:
     * `ctx.llm.imageRequestTarget()` 的调用处同样会对 `undefined` 抛
     * `is not a function`。
     */
    imageRequestTarget(_provider: string, _model: string, image: DshRequestImage): DshImageTarget;
    listModels(): Promise<DshCatalogModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<DshResolvedModelInfo>;
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<DshPreparedCall>;
    /** 唯一的抽象:产出**语法合法**的块流。 */
    stream(options: DshGenerateOptions): AsyncGenerator<DshStreamChunk>;
    /** 统计挂钩失败绝不能影响已经发出的响应。 */
    private record;
}
