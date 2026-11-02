/**
 * 上下文预算守卫 —— 让「这条请求比模型窗口还大」不再是一条死路。
 *
 * ## 为什么需要这个文件(2026-11-01 真实故障)
 *
 * 用户在 DSH 里跑 `/compact`,宿主把**整段历史**交给模型去总结,报文长到
 * 2337 条消息 / 127 万字符;上游 sensenova 直接回:
 *
 * ```
 * 400 {"error":{"message":"inference request is invalid",
 *               "type":"invalid_request_error","code":"3"}}     ← deepseek-v4-flash
 * 400 {"error":{"message":"inference request is invalid",
 *               "type":"invalid_request_error","code":"context_length_exceeded"}}
 * ```
 *
 * 于是「压缩上下文」这件事本身失败在了上下文超限上 —— 而且它**永远**不会自己好:
 * 之后的每一条消息都带着同样超长的历史,每次都被同一个 400 打回来。日志里
 * 连续 10 条同款失败就是这么来的。
 *
 * 网关之前的做法是「原样转发,上游怎么说就怎么回」—— 这对小请求是对的(网关
 * 不该偷偷改用户的输入),但对**物理上装不下**的请求是错的:装不下就是装不下,
 * 把 400 交回去不会让它装下。
 *
 * ## 三层策略(由轻到重,每层都只在「装不下」时触发)
 *
 * 1. **发之前就量**:估算整条报文的 token 数,超过 `max_input_tokens` 就先裁;
 * 2. **裁的优先级**:先把超长的工具结果截成「头部 + 尾部 + 省略标记」(叙事骨架
 *    全留着,只丢工具产物这种可再生的东西),还不够才丢最老的对话轮;
 * 3. **上游说溢出了就学乖**:记下「这台端点在 ~E tokens 处被拒」,本次立刻按
 *    一半重发(本轮不记失败、不冷却 —— 端点没做错任何事),下次同样的请求
 *    发之前就直接裁到位,不用再白跑一轮。
 *
 * ## ⚠️ 现在量得准了(2026-11-01 用户给了 DeepSeek 官方 tokenizer)
 *
 * 上一版这里写的是「精确分词要上游的 tokenizer,拿不到」,于是按字符宽度猜
 * (中日韩 0.75 token/字、ASCII 3.4 字/token),并且自以为「刻意偏高」。
 *
 * 拿到词表一量才发现这个自以为是错的 —— **两个方向都在错**:
 *
 * | 内容 | 字符加权估算 | DeepSeek V4 实测 | 偏差 |
 * |---|---|---|---|
 * | 纯中文(上/工/中/的/是) | 0.75 token/字 | 1.0 token/字 | **低估 25%** |
 * | 代码(`const x = foo(bar, 1);`) | 0.294 token/字 | 0.435 token/字 | **低估 32%** |
 * | 普通英文散文 | 0.294 token/字 | ≈0.22 token/字 | 高估 33% |
 * | 重复字符 `"a"×1000` | 295 | 125 | 高估 136% |
 *
 * 也就是说:在一份以**中文 + 代码 + 日志**为主的 DSH 会话里,它一直在**低估**,
 * 而低估意味着「明明装不下却以为装得下」→ 放过去 → 上游 400 → 用户等 30 秒
 * 看到一条红字。高估只是多裁一段,低估是真的会把请求打死。
 *
 * DeepSeek V4 的 tokenizer 现在已经内联在 `@as-one/core`(见
 * `src/tokenizer/deepseek.ts`,纯 TS 的字节级 BPE,与官方 Python tokenizers
 * 逐字对齐,276 条黄金向量钉着)。DeepSeek 系模型量**精确值**,其余厂商继续用
 * 加权估算 —— 估算只在拿不到词表时兜底,不再是我们对 DeepSeek 的态度。
 */
import type { ChatMessage } from "@as-one/core/src/gateway/types.js";
/** 一次请求最多自动压缩几轮(每轮把量出来的长度砍半:1 → 1/2 → 1/4 → 1/8)。 */
export declare const MAX_CONTEXT_SHRINKS = 3;
/** 文本 → token 数。默认实现是字符加权估算,DeepSeek 系换成官方分词器。 */
export type TextCounter = (text: string) => number;
/** 计数器 + 它的名字(名字只给日志用,不影响行为)。 */
export interface TokenCounter {
    count: TextCounter;
    /** `deepseek-v4`(精确)/ `heuristic`(字符加权估算)。 */
    name: string;
}
/**
 * 按真实模型挑计数器。
 *
 * 只有 DeepSeek 系的报文能量到精确值 —— 我们手里恰好只有这一家的词表。
 * 其它厂商(通义、智谱、Kimi …)词表各不相同且没拿到,继续用加权估算:
 * 一个外来词表算出来的数不会比「按字符宽度猜」更可信,还可能偏低(更危险)。
 *
 * @param provider 端点提供方 id(如 `sensenova`)
 * @param model    真实模型 id(如 `deepseek-v4-flash`)
 */
export declare function counterForModel(provider: string | null | undefined, model: string | null | undefined): TokenCounter;
/** 裁剪结果(全部字段都是给日志/测试用的,不影响请求语义)。 */
export interface ContextFit {
    /** 真正要发出去的消息数组;没裁时是**原数组的浅拷贝**。 */
    messages: ChatMessage[];
    /** 裁剪前 token 数。 */
    estimatedBefore: number;
    /** 裁剪后 token 数。 */
    estimatedAfter: number;
    /** 丢掉的消息条数。 */
    droppedMessages: number;
    /** 被截短的工具结果条数。 */
    compactedToolResults: number;
    /** 是否真的改动过(没改动时调用方可完全忽略)。 */
    changed: boolean;
    /** 这些数字是用什么量出来的(`deepseek-v4` 精确 / `heuristic` 估算)。 */
    counterName: string;
}
/**
 * 估算一段文本的 token 数(拿不到词表时的兜底)。
 *
 * 遍历的是**码点**而不是 UTF-16 码元(emoji / 生僻字不会被算成两个字符)。
 */
export declare function estimateTextTokens(text: string): number;
/** 单条消息的 token 数(含 tool_calls 的 JSON 与固定开销)。 */
export declare function estimateMessageTokens(message: ChatMessage, count?: TextCounter): number;
/** 整条报文的 prompt 侧 token 数。 */
export declare function estimateMessagesTokens(messages: readonly ChatMessage[], count?: TextCounter): number;
/** 把一段长文本裁成「头 + 省略标记 + 尾」。 */
export declare function truncateMiddle(text: string, headChars?: number, tailChars?: number): string;
/**
 * 把消息裁到 `budget` tokens 以内 —— 三级瀑布,能停在越早的一级越好。
 *
 * 每条消息只量一次:先算出一整排计数,后面两级裁剪都复用它。1.2M 字符的会话里
 * 「量三遍」是三倍延迟,而这三遍的输入完全是同一批字符串。
 *
 * @param messages 原始消息(不会被修改)。
 * @param budget   目标 prompt token 预算;`<= 0` 表示「不知道窗口」→ 原样返回。
 * @param counter  计数器(默认字符加权估算;DeepSeek 系传官方分词器)。
 */
export declare function fitMessagesToBudget(messages: readonly ChatMessage[], budget: number, counter?: TokenCounter): ContextFit;
/** 文案里点名了「上下文超限」吗(不看长度,只看说法)。 */
export declare function mentionsContextOverflow(detail: string): boolean;
/**
 * 这次失败是不是「装不下」。
 *
 * 三档判据:
 * 1. 文案点名 → 是;
 * 2. 文案没点名,但是 400/422 且请求本身 ≥12.8 万 token(如 sensenova 的裸
 *    `code: 3`)→ 认为大概率是(代价分析见 {@link GENERIC_OVERFLOW_MIN_TOKENS});
 * 3. 其余 → 不是。
 *
 * @param detail          上游原文(`gerr.detail`)。
 * @param kind            归一后的错误族(`gerr.kind`)。
 * @param estimatedTokens 本次实际发出的 prompt 估算。
 */
export declare function isContextOverflow(detail: string, kind: string, estimatedTokens: number): boolean;
/**
 * 「一单就把每分钟配额吃掉大半」的比例线 —— 请求量到窗口的 50% 才算。
 *
 * 为什么定 50%:普通长对话(sensenova 实测 28 万 / 1M 窗口 ≈ 27%)要能在限流
 * 时保住原样重试,不能被顺手裁掉工具结果;而压缩类请求(`/compact` 一次发整段
 * 历史)通常在 55%~95%,正是该瘦身的那一类。
 */
export declare const OVERSIZE_WINDOW_RATIO = 0.5;
/**
 * 这次失败是不是「请求本身太大**, 大到上游一分钟的配额一次就装不下**」。
 *
 * ## 与 {@link isContextOverflow} 的区别(2026-11-02 真实故障)
 *
 * `isContextOverflow` 问的是「装得进窗口吗」;这里问的是「装得进**一分钟的
 * 配额**吗」。两者失败的报错完全不同:前者是 400(`context_length_exceeded`),
 * 后者是 429(`inference exceeds tpm/rpm limit` / `code: 8` /
 * `insufficient_quota`)。
 *
 * 实测那条死路(用户 `/compact` 连试三次全红):
 *
 * | 时间 | 报文 | 上游答复 |
 * |---|---|---|
 * | 22:43 | 2333 条 / 125 万字符 | 400 `context_length_exceeded` |
 * | 23:32 | 2337 条 / 126 万字符 | 400 裸 `code: 3` |
 * | 00:14 | 2338 条 / 126 万字符 | **429 `inference exceeds tpm/rpm limit`** |
 *
 * 也就是说:窗口那条路在装上 tokenizer 之后已经修好了(不再报 400),但请求
 * **仍然太大** —— 它一次要吃掉几十万 token,而上游按每分钟配额放行。压缩请求
 * 天生就是这个形状(把整段历史再发一遍去做总结),靠「等」永远不会好:等满
 * 60 秒回来,它还是这么大,还是把下一个窗口打满。
 *
 * ## 为什么只瘦身、不学乖
 *
 * ⚠️ 这条判据**绝不能**写进 {@link noteContextOverflow} 的 `observedCeilings`:
 * 429 只说明「这一分钟配额不够」,不说明「窗口只有这么大」。把两者混在一起
 * 会把该端点永久压到一半窗口,之后每条正常消息都白丢历史。所以它只影响**本次**
 * 重发(见调用方),端点上限一个字都不改。
 *
 * @param kind         归一后的错误族(`gerr.kind`)。
 * @param sentTokens   本次实际发出的 prompt 估算(已按窗口裁过)。
 * @param windowTokens 端点声明的窗口(`max_input_tokens`);未知 → 不判。
 */
export declare function isRateLimitOversize(kind: string, sentTokens: number, windowTokens: number | null | undefined): boolean;
/** 记一笔「该端点在约 `measuredTokens` 处被拒」,只往下调不往上抬。 */
export declare function noteContextOverflow(endpointId: string, measuredTokens: number): void;
/** 该端点实测的窗口上限(没被试错过 → null)。 */
export declare function observedCeiling(endpointId: string): number | null;
/** 清空学习结果(测试用;运行时不调)。 */
export declare function resetObservedCeilings(): void;
/**
 * 本次请求的 prompt 预算。
 *
 * @param maxInputTokens 端点的 `max_input_tokens`(库里声明的,可能虚高)。
 * @param maxOutputTokens 本轮要的输出预算 —— 输入 + 输出必须一起装进窗口。
 * @param endpointId     用于取实测上限(可省)。
 * @returns 预算 token 数;`0` = 完全不知道窗口 → 不裁。
 */
export declare function promptBudget(maxInputTokens: number | null | undefined, maxOutputTokens: number | null | undefined, endpointId?: string): number;
/**
 * 按端点预算裁剪消息(没超就原样返回,`changed === false`)。
 *
 * @param messages        原始消息。
 * @param maxInputTokens  端点声明的输入上限。
 * @param maxOutputTokens 本轮输出预算。
 * @param endpointId      端点 id(用于取实测上限)。
 * @param extraCap        额外的硬上限(溢出重试时按上一轮量出来的长度砍半传进来)。
 * @param counter         计数器;不给 = 字符加权估算。DeepSeek 系务必传
 *                        `counterForModel(...)`,否则又退回「猜」。
 */
export declare function fitForEndpoint(messages: readonly ChatMessage[], maxInputTokens: number | null | undefined, maxOutputTokens: number | null | undefined, endpointId?: string, extraCap?: number | null, counter?: TokenCounter): ContextFit;
