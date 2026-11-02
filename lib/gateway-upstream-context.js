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
import { deepseekTokenCount } from "@as-one/core/src/tokenizer/deepseek.js";
/**
 * 中日韩字符权重:只在拿不到词表时兜底用。
 *
 * 0.75 是 DeepSeek 词表下中日韩的**下沿**(实测 0.5~1.0,常见 1.0)。估低会
 * 让请求被上游打回,估高只是多裁一点 —— 兜底路径宁可取 1.0,但这会让所有
 * 非 DeepSeek 厂商的报文白裁 25%,所以保持 0.75 并在日志里标明用的是估算。
 */
const CJK_TOKENS_PER_CHAR = 0.75;
/** 其余字符(英文/数字/代码/标点):1 token ≈ 3.4 字。 */
const ASCII_CHARS_PER_TOKEN = 3.4;
/** 每条消息的固定开销(role、分隔符、chat template 的标记)。 */
const MESSAGE_OVERHEAD_TOKENS = 4;
/** 一张图片按经验值计(不按 base64 字符数算 —— 那是字节,不是 token)。 */
const IMAGE_TOKENS = 1024;
/**
 * 工具结果超过这个长度才截断(短结果全留,截了只是丢信息)。
 *
 * 为什么单列一条阈值:工具结果动辄 4 万字符(日志里的 `tool` 消息就有 40163),
 * 而用户/助手的文本通常只有几百字 —— 需要腾地方时,先动工具结果永远是对的。
 */
const TOOL_COMPACT_MIN_CHARS = 1500;
/** 截断后保留的头部字符数(通常含命令、错误摘要、表头)。 */
const TOOL_KEEP_HEAD_CHARS = 900;
/** 截断后保留的尾部字符数(通常含结论、状态码)。 */
const TOOL_KEEP_TAIL_CHARS = 300;
/**
 * 「泛化 400」也会被当成上下文溢出重试的最低估算长度。
 *
 * 像 sensenova 的 `code: "3"` 这种不带任何说明的 400,无法从文案判断原因。
 * 但**请求本身巨长**(≥12.8 万 token)时,上下文超限是最可能的解释 —— 而重复
 * 试错的代价(多一轮大请求)远小于「压缩上下文永远失败」的代价。
 *
 * 阈值定在 128k:低于它的请求即使真超限,也是模型窗口极小(如 32k)的罕见情形,
 * 那种情况上游一般会明确说 context_length_exceeded。
 */
const GENERIC_OVERFLOW_MIN_TOKENS = 128_000;
/** 一次请求最多自动压缩几轮(每轮把量出来的长度砍半:1 → 1/2 → 1/4 → 1/8)。 */
export const MAX_CONTEXT_SHRINKS = 3;
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
export function counterForModel(provider, model) {
    const hay = `${provider ?? ""}/${model ?? ""}`.toLowerCase();
    if (hay.includes("deepseek"))
        return { count: deepseekTokenCount, name: "deepseek-v4" };
    return { count: estimateTextTokens, name: "heuristic" };
}
// ---------------------------------------------------------------------------
// 估算
// ---------------------------------------------------------------------------
/** 是否中日韩字符(含全角标点、谚文、CJK 兼容区)。 */
function isCjk(cp) {
    return ((cp >= 0x2e80 && cp <= 0x9fff) || // 部首扩展 + CJK 统一表意(含扩展 A)
        (cp >= 0xac00 && cp <= 0xd7af) || // 谚文音节
        (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意
        (cp >= 0xff00 && cp <= 0xffef) || // 全角/半角形式
        (cp >= 0x3000 && cp <= 0x303f) // CJK 标点
    );
}
/**
 * 估算一段文本的 token 数(拿不到词表时的兜底)。
 *
 * 遍历的是**码点**而不是 UTF-16 码元(emoji / 生僻字不会被算成两个字符)。
 */
export function estimateTextTokens(text) {
    let cjk = 0;
    let other = 0;
    for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0;
        if (isCjk(cp))
            cjk += 1;
        else
            other += 1;
    }
    return Math.ceil(cjk * CJK_TOKENS_PER_CHAR + other / ASCII_CHARS_PER_TOKEN);
}
/** 多模态分段数组 → token 数(图片按常量算,文本交给计数器)。 */
function contentTokens(content, count) {
    if (typeof content === "string")
        return count(content);
    if (Array.isArray(content)) {
        let total = 0;
        for (const part of content) {
            if (typeof part === "string") {
                total += count(part);
            }
            else if (part !== null && typeof part === "object") {
                const p = part;
                const type = typeof p["type"] === "string" ? p["type"] : "";
                if (type === "image_url" || type === "image" || type === "input_image") {
                    total += IMAGE_TOKENS;
                }
                else if (typeof p["text"] === "string") {
                    total += count(p["text"]);
                }
                else {
                    total += 8;
                }
            }
        }
        return total;
    }
    return 0;
}
/** 单条消息的 token 数(含 tool_calls 的 JSON 与固定开销)。 */
export function estimateMessageTokens(message, count = estimateTextTokens) {
    let total = MESSAGE_OVERHEAD_TOKENS;
    total += contentTokens(message.content, count);
    if (message.tool_calls !== undefined && message.tool_calls !== null) {
        try {
            total += count(JSON.stringify(message.tool_calls));
        }
        catch {
            total += 32;
        }
    }
    if (typeof message.reasoning_content === "string") {
        total += count(message.reasoning_content);
    }
    if (typeof message.name === "string")
        total += count(message.name);
    if (typeof message.tool_call_id === "string")
        total += 8;
    return total;
}
/** 请求头开销(role 分隔、chat template 的固定部分)。 */
const REQUEST_OVERHEAD_TOKENS = 8;
/** 整条报文的 prompt 侧 token 数。 */
export function estimateMessagesTokens(messages, count = estimateTextTokens) {
    let total = REQUEST_OVERHEAD_TOKENS;
    for (const message of messages)
        total += estimateMessageTokens(message, count);
    return total;
}
// ---------------------------------------------------------------------------
// 裁剪
// ---------------------------------------------------------------------------
/**
 * 安全切片:不切在两字节代理对中间。
 *
 * 切坏代理对会得到一个孤立代理,`JSON.stringify` 把它写成 `\ud800` —— 合法 JSON、
 * 非法 UTF-8 语义,部分上游会以「请求不合法」整条拒掉(比超长更难查)。
 */
function safeSlice(text, start, end) {
    let from = Math.max(0, start);
    let to = Math.min(text.length, end);
    if (from > 0 && from < text.length) {
        const code = text.charCodeAt(from);
        if (code >= 0xdc00 && code <= 0xdfff)
            from -= 1;
    }
    if (to > 0 && to < text.length) {
        const code = text.charCodeAt(to - 1);
        if (code >= 0xd800 && code <= 0xdbff)
            to += 1;
    }
    if (to <= from)
        return "";
    return text.slice(from, to);
}
/** 把一段长文本裁成「头 + 省略标记 + 尾」。 */
export function truncateMiddle(text, headChars = TOOL_KEEP_HEAD_CHARS, tailChars = TOOL_KEEP_TAIL_CHARS) {
    if (text.length <= headChars + tailChars)
        return text;
    const removed = text.length - headChars - tailChars;
    return (safeSlice(text, 0, headChars) +
        `\n…[As One:为装进上下文窗口,此处省略 ${removed} 字符]…\n` +
        safeSlice(text, text.length - tailChars, text.length));
}
/** 截短所有超长工具结果(不改动其它角色)。只重算被动过的那几条。 */
function compactToolResults(messages, counts, count) {
    let compacted = 0;
    const out = messages.map((message) => {
        if (message.role !== "tool")
            return message;
        if (typeof message.content !== "string")
            return message;
        if (message.content.length <= TOOL_COMPACT_MIN_CHARS)
            return message;
        compacted += 1;
        return { ...message, content: truncateMiddle(message.content) };
    });
    if (compacted === 0)
        return { messages: out, counts: [...counts], compacted };
    // 没变的消息沿用原计数 —— 在 1.2M 字符的会话里,「一条没动的消息也重新分词」
    // 是把 1 秒变成 3 秒的主要来源。
    const next = out.map((message, i) => message === messages[i] ? counts[i] : estimateMessageTokens(message, count));
    return { messages: out, counts: next, compacted };
}
/**
 * 丢掉最老的对话轮,只保留能装下的尾部窗口。
 *
 * **为什么按 `user` 边界切**:一条 assistant 的 `tool_calls` 必须和紧随其后的
 * `tool` 结果同生共死 —— 从中间切会留下「有结果的工具调用没有发起者」或反过来,
 * 上游一律 400。`user` 消息天然是每一轮的起点,从它开始切永远不会切开工具对。
 */
function dropOldestTurns(messages, counts, budget) {
    const total = messages.length;
    if (total === 0)
        return { messages: [], dropped: 0 };
    const systemIdx = [];
    let systemTokens = 0;
    for (let i = 0; i < total; i += 1) {
        const message = messages[i];
        if (message !== undefined && message.role === "system") {
            systemIdx.push(i);
            systemTokens += counts[i] ?? 0;
        }
    }
    const room = Math.max(1024, budget - systemTokens);
    // 从尾部往前累计,直到装不下为止 —— 至少保留一条(哪怕它自己就超预算,
    // 否则会发出一个空 messages 的请求,那是另一种 400)。
    let acc = 0;
    let start = total;
    for (let i = total - 1; i >= 0; i -= 1) {
        if (systemIdx.includes(i))
            continue;
        const message = messages[i];
        if (message === undefined)
            continue;
        const tokens = counts[i] ?? 0;
        if (acc + tokens > room && start !== total)
            break;
        acc += tokens;
        start = i;
    }
    // 向前对齐到最近的一条 user(可能把窗口再扩大一点,但保证结构合法)。
    while (start > 0 && messages[start]?.role !== "user")
        start -= 1;
    if (start >= total)
        start = Math.max(0, total - 1);
    const kept = [];
    const keptIdx = new Set();
    for (const i of systemIdx) {
        const message = messages[i];
        if (message !== undefined) {
            kept.push(message);
            keptIdx.add(i);
        }
    }
    // 首条 user 消息 = 用户最初的任务描述,信息密度最高 —— 只要装得下就带上,
    // 不然后面的总结会「不知道为什么做这些事」。
    const firstUser = messages.findIndex((m) => m.role === "user");
    const headTokens = firstUser >= 0 ? (counts[firstUser] ?? 0) : 0;
    if (firstUser >= 0 && firstUser < start && headTokens <= room * 0.25) {
        const message = messages[firstUser];
        if (message !== undefined) {
            kept.push(message);
            keptIdx.add(firstUser);
        }
    }
    for (let i = start; i < total; i += 1) {
        if (keptIdx.has(i))
            continue;
        const message = messages[i];
        if (message !== undefined)
            kept.push(message);
    }
    const dropped = total - kept.length;
    if (dropped <= 0)
        return { messages: [...messages], dropped: 0 };
    return { messages: withOmittedNotice(kept, dropped), dropped };
}
/** 在第一条 system 消息末尾标注「更早的消息被省略」,让模型知道上下文有缺口。 */
function withOmittedNotice(messages, dropped) {
    const firstSystem = messages.findIndex((m) => m.role === "system");
    if (firstSystem < 0)
        return messages;
    const message = messages[firstSystem];
    if (message === undefined || typeof message.content !== "string")
        return messages;
    const notice = `\n\n[As One] 为了让请求装进模型上下文窗口,更早的 ${dropped} 条消息已被省略。`;
    const out = [...messages];
    out[firstSystem] = { ...message, content: message.content + notice };
    return out;
}
/** 默认计数器:字符加权估算(取不到词表的厂商走这条)。 */
const HEURISTIC_COUNTER = { count: estimateTextTokens, name: "heuristic" };
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
export function fitMessagesToBudget(messages, budget, counter = HEURISTIC_COUNTER) {
    const count = counter.count;
    const counts = messages.map((message) => estimateMessageTokens(message, count));
    let before = REQUEST_OVERHEAD_TOKENS;
    for (const value of counts)
        before += value;
    const untouched = {
        messages: [...messages],
        estimatedBefore: before,
        estimatedAfter: before,
        droppedMessages: 0,
        compactedToolResults: 0,
        changed: false,
        counterName: counter.name,
    };
    if (!(budget > 0) || before <= budget)
        return untouched;
    const compacted = compactToolResults(messages, counts, count);
    let afterCompact = REQUEST_OVERHEAD_TOKENS;
    for (const value of compacted.counts)
        afterCompact += value;
    if (afterCompact <= budget) {
        return {
            messages: compacted.messages,
            estimatedBefore: before,
            estimatedAfter: afterCompact,
            droppedMessages: 0,
            compactedToolResults: compacted.compacted,
            changed: true,
            counterName: counter.name,
        };
    }
    const dropped = dropOldestTurns(compacted.messages, compacted.counts, budget);
    return {
        messages: dropped.messages,
        estimatedBefore: before,
        estimatedAfter: estimateMessagesTokens(dropped.messages, count),
        droppedMessages: dropped.dropped,
        compactedToolResults: compacted.compacted,
        changed: true,
        counterName: counter.name,
    };
}
// ---------------------------------------------------------------------------
// 溢出识别
// ---------------------------------------------------------------------------
/**
 * 上游文案里那些**明确**表示「prompt 太长」的说法。
 *
 * 只收点名的说法,不做「所有 400 都当超长」的宽判据 —— 400 也可能是工具 schema
 * 不合法、图片格式不认、字段类型错,那些情况重发多少次都一样,只会白等。
 */
const CONTEXT_OVERFLOW_PATTERNS = [
    /context[_ ]length/i,
    /maximum context/i,
    /context window/i,
    /prompt is too long/i,
    /input is too long/i,
    /too many tokens/i,
    /maximum number of tokens/i,
    /exceed(?:s|ed)? (?:the )?(?:maximum|max)/i,
    /token(?:s)? limit/i,
    /输入(?:内容)?(?:过长|超出|太长)/,
    /上下文(?:长度|窗口)/,
    /超出(?:模型)?(?:上下文|长度|窗口)/,
];
/** 文案里点名了「上下文超限」吗(不看长度,只看说法)。 */
export function mentionsContextOverflow(detail) {
    const text = detail ?? "";
    return CONTEXT_OVERFLOW_PATTERNS.some((pattern) => pattern.test(text));
}
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
export function isContextOverflow(detail, kind, estimatedTokens) {
    if (mentionsContextOverflow(detail))
        return true;
    const badRequest = kind === "bad_request" || kind === "invalid_request";
    return badRequest && estimatedTokens >= GENERIC_OVERFLOW_MIN_TOKENS;
}
/**
 * 「一单就把每分钟配额吃掉大半」的比例线 —— 请求量到窗口的 50% 才算。
 *
 * 为什么定 50%:普通长对话(sensenova 实测 28 万 / 1M 窗口 ≈ 27%)要能在限流
 * 时保住原样重试,不能被顺手裁掉工具结果;而压缩类请求(`/compact` 一次发整段
 * 历史)通常在 55%~95%,正是该瘦身的那一类。
 */
export const OVERSIZE_WINDOW_RATIO = 0.5;
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
export function isRateLimitOversize(kind, sentTokens, windowTokens) {
    if (kind !== "rate_limit")
        return false;
    if (typeof windowTokens !== "number" || !Number.isFinite(windowTokens) || windowTokens <= 0) {
        return false;
    }
    return sentTokens >= windowTokens * OVERSIZE_WINDOW_RATIO;
}
// ---------------------------------------------------------------------------
// 学到的窗口上限(内存)
// ---------------------------------------------------------------------------
/**
 * 端点 → 「实测被拒过的 prompt 长度」。
 *
 * 为什么要有:**库里的 `max_input_tokens` 可能是错的**(用户手填 1M,上游实际
 * 只认 25 万 —— 本文件的故障就是这种:声明 1048576,1.27M 字符的报文照样被
 * `context_length_exceeded` 打回)。发之前的裁剪只能信库里的数字,于是第一发
 * 必然白跑;把「被拒的长度」记下来,后续请求就能一次裁到位。
 *
 * 只在内存里:进程重启后忘掉,重新学一次(代价 = 一轮大请求),不值得为它写库。
 */
const observedCeilings = new Map();
/** 记一笔「该端点在约 `measuredTokens` 处被拒」,只往下调不往上抬。 */
export function noteContextOverflow(endpointId, measuredTokens) {
    if (!(measuredTokens > 0))
        return;
    // 被拒说明「超过」:真实上限在它之下,但不是「远在它之下」—— 上一版估算偏高
    // 30%,所以打 0.75 的折扣;现在 DeepSeek 系量的是精确值,折扣收到 0.95,
    // 只留 chat template 那部分(模板 token 我们看不到,按每条 4 个估算)的余量。
    const ceiling = Math.max(1024, Math.floor(measuredTokens * 0.95));
    const previous = observedCeilings.get(endpointId);
    if (previous === undefined || ceiling < previous) {
        observedCeilings.set(endpointId, ceiling);
    }
}
/** 该端点实测的窗口上限(没被试错过 → null)。 */
export function observedCeiling(endpointId) {
    return observedCeilings.get(endpointId) ?? null;
}
/** 清空学习结果(测试用;运行时不调)。 */
export function resetObservedCeilings() {
    observedCeilings.clear();
}
/**
 * 本次请求的 prompt 预算。
 *
 * @param maxInputTokens 端点的 `max_input_tokens`(库里声明的,可能虚高)。
 * @param maxOutputTokens 本轮要的输出预算 —— 输入 + 输出必须一起装进窗口。
 * @param endpointId     用于取实测上限(可省)。
 * @returns 预算 token 数;`0` = 完全不知道窗口 → 不裁。
 */
export function promptBudget(maxInputTokens, maxOutputTokens, endpointId) {
    const declared = typeof maxInputTokens === "number" && Number.isFinite(maxInputTokens) && maxInputTokens > 0
        ? Math.floor(maxInputTokens)
        : 0;
    const learned = endpointId === undefined ? null : observedCeiling(endpointId);
    // 声明值与实测值取小的:声明 1M 而实测 25 万时,信实测 —— 那一发是真的被拒过。
    const ceiling = declared > 0 && learned !== null ? Math.min(declared, learned) : Math.max(declared, learned ?? 0);
    if (!(ceiling > 0))
        return 0;
    const output = typeof maxOutputTokens === "number" && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
        ? Math.floor(maxOutputTokens)
        : 0;
    // 留 1024 的余量给 chat template 与逐条估算的那 4 个标记 token(精确分词只覆盖
    // 正文,模板标记我们看不到,只能按条数估)。
    return Math.max(1024, ceiling - output - 1024);
}
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
export function fitForEndpoint(messages, maxInputTokens, maxOutputTokens, endpointId, extraCap, counter = HEURISTIC_COUNTER) {
    const budget = promptBudget(maxInputTokens, maxOutputTokens, endpointId);
    const capped = extraCap !== null && extraCap !== undefined && extraCap > 0
        ? budget > 0
            ? Math.min(budget, extraCap)
            : extraCap
        : budget;
    return fitMessagesToBudget(messages, capped, counter);
}
//# sourceMappingURL=gateway-upstream-context.js.map