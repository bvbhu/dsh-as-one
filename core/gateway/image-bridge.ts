/**
 * 图像桥(D31 重做)—— 1:1 对齐 Nexus `nexus/gateway/app.py` 的图像桥段。
 *
 * ## 这个模块解决什么
 *
 * 请求带图,而目标链**没有视觉端点**时,档位根本看不见图 —— 结果是模型**凭空
 * 回答**。图像桥把图片**逐张**转成**文字证据**,塞回原位置,让看不见图的档位
 * 也能用图。
 *
 * ## 「图像桥」两层意思,别混
 *
 * - **桥接动作**(本模块):把请求里的图片块换成文字块;
 * - **桥接策略**:什么时候桥、桥不动了怎么办 —— 由下面的常量与
 *   {@link tryParseImages} 定。
 *
 * ## 关键决策(都是用户定案,不是实现细节)
 *
 * 1. **modlens 式证据,只用提示词实现**:要全文转写 / 版面 / 要素 / 不确定项
 *    四类**证据**,而不是一句概括。不做结构化 JSON schema、不做多引擎链、
 *    不做持久化证据库 —— 证据以纯文本 + 固定小节标题返回,于是它是确定的、
 *    可缓存的、任何纯文本档位都读得懂。
 * 2. **一次定胜负 —— 不做多轮解析**:不换提示词、不换切图方式重试。读不出来就
 *    给用户一条可执行的线索(补充信息 / 换原生图像模型),而不是拿一串不同问法
 *    反复问同一张图。
 * 3. **逐张发**:一次发 N 张会撞上游「单请求图片张数」硬限,而每请求 1 张
 *    **永远碰不到**它。
 * 4. **历史图不逐张解析**(2026-10-17):只有**最后一条 user 消息**里的图算
 *    「本轮输入」,享受「未缓存就逐张解析」;更早消息里的图,缓存命中 → 换缓存
 *    证据文本,未命中 → **静默删块**。理由:历史图上一轮就解析过了,把它当本轮
 *    输入逐张打免费档,TTFT 会被历史图片的串行解析线性拖长。
 */

import { createHash } from "node:crypto";

import type { ChatContentPart } from "./types.js";

// ---------------------------------------------------------------------------
// 常量(逐字对齐 Nexus)
// ---------------------------------------------------------------------------

/**
 * 图片解析用的**抽象模型名**。它就是库里一条普通的 `logical_model`,
 * **在调度上与其他抽象模型毫无区别** —— 不现算、不按免费名单收人。
 * 「被指定用于图片解析」只是网关这里的一个名字约定。
 */
export const FREE_PARSE_MODEL = "free";

/**
 * 图像桥的提示词(modlens 式证据 + 明确的失败出口)。
 *
 * 为什么上一版(「用一句简洁的中文描述这张图片」)不行:
 * 1. 摘要 lane / 代码截图要的是**图里的字**,概括型提示词把信息量当场压掉;
 * 2. 没有「我读不出来」这个出口,模型只能硬编:模糊图被猜成具体内容,而
 *    **猜测比承认失败贵得多**(错误信息会被下游当真);
 * 3. 「只回复 无法解析」让网关有一个**可判定的**失败信号(不必靠长度阈值猜)。
 */
export const FREE_PARSE_PROMPT =
  "你是图像证据转写器。只做一件事:把这张图里**能直接看到**的信息转成文字证据。" +
  "不推理、不联想、不补全,不要写图中没有的东西。\n" +
  "按下面的顺序输出,没有内容的段整段省略:\n" +
  "【文字】逐字转写图中所有可见文字,保留原有换行与层级;表格按行列写,不要概括。\n" +
  "【版面】这张图是什么形态(截图/照片/图表/表格/代码/界面…),关键区域在哪、" +
  "阅读顺序如何。\n" +
  "【要素】图中出现的实体与具体值:型号、编号、日期、金额、参数、字段名、按钮名。\n" +
  "【不确定】看不清 / 被截断 / 无法辨认的部分,写清它大概在哪个位置。\n" +
  "如果图片损坏、空白、过于模糊或文字完全无法辨认,只回复四个字:无法解析\n" +
  "【任务可行性】最后一行单独输出:可以完成 或 无法完成任务: <原因>。" +
  "判据:只看这张图里能直接读到的信息,能否完成用户当前任务;信息不足、过于模糊、" +
  "或必须依赖原生视觉能力才能继续时,一律输出无法完成任务。\n" +
  "只输出上面的内容本身:不要解释你的过程,不要用 markdown 代码块包裹。";

/**
 * 解析器回复里出现这个串 = **明确失败**。提示词要求「只回复 无法解析」,但模型
 * 常写成「无法解析这张图」,所以按**包含**判定而不是相等判定。
 */
export const FREE_PARSE_UNPARSED = "无法解析";

/** 视觉模型判定「凭这张图无法完成任务」的明确标记。命中即结束本轮、提示换模型。 */
export const FREE_PARSE_CANNOT_COMPLETE = "无法完成任务";

/** 图像桥解析车道:只提供具备视觉输入的模型;该车道缺失时回落 free。 */
export const VISION_PARSE_MODEL = "vision";

/**
 * 单张图片解析的输出上限(已不再使用 —— 见下)。
 *
 * 历史:200 → 768(证据四段比一句话长,截断的证据比没有更危险)。
 * **2026-10-24 用户定案(m06638①「不限制最大输出 token」):不再设硬上限** ——
 * 解析请求改为**不带 `max_tokens`**,由网关的 `clampMaxTokens` 按该成员的
 * 真实 `max_output_tokens` 补(成员上限缺失时上游用自身缺省)。
 *
 * 为什么保留这个导出:`packages/core/lib` 的既有 .d.ts 与外部引用还在,
 * 且测试用它断言「不再被当成硬限」。新代码不要再用它当 `max_tokens`。
 */
export const FREE_PARSE_MAX_TOKENS = 768;

/**
 * 单次请求最多**尝试解析**的图片张数。超出的图不再尝试解析,直接写成
 * 「无法解析(超出单请求解析配额)」占位 —— 防止恶意/超大请求把免费档打穿,
 * 同时**不静默丢图**。
 *
 * ⚠️ 配额只数**本轮图**里「真的打了免费档」的张数:历史图缓存命中不花钱、
 * 未命中被静默丢弃,两者都不占配额。
 */
export const FREE_PARSE_MAX_IMAGES = 8;

/**
 * 上游**单请求图片张数**的硬限(`sensenova` 端点实测)。
 *
 * 错误原话:`{"error":{"message":"image num 51 exceeds limit 50",…}}`(HTTP 400)。
 * 它的三个性质决定了处理方式:
 * 1. **不是故障,是参数校验** —— 重试 / 换号 / 换档全部必然复现;
 * 2. **它是上游的约束,网关原本不知道** —— 档位声明支持视觉时,网关会把 51 张
 *    原样透传,撞在它上面;
 * 3. **图像桥天然绕开它**:桥是逐张发的,永远碰不到这个上限。
 *
 * 因此桥接的触发条件里多了一条:**图片数超过这个硬限时,即使链上有视觉端点
 * 也走图像桥**。否则这条请求是**确定性 400**,而且要烧掉一整轮无意义重试。
 */
export const IMAGE_HARD_LIMIT = 50;

/**
 * 图片被成功转写后的替换文本。`{seq}/{total}` = **该图在其所属消息中的序号**
 * (用户定案:「注意记录在用户信息中的序号」)。
 *
 * 为什么序号必须在:桥是逐张解析、逐张替换的,多图消息里下游模型只能靠这个序号
 * 把「第 3 张截图」和「第 3 段证据」对上。
 */
export const IMAGE_PARSED_TEMPLATE = "[图片 {seq}/{total} 解析] {text}";

/**
 * 图片无法解析时的**占位文本**(替换掉原图块,而不是「原样保留等连接器丢弃」
 * —— 后者是**静默丢失**:模型看不到任何线索,只会凭空回答)。
 */
export const IMAGE_UNPARSED_TEMPLATE =
  "[图片 {seq}/{total} 无法解析:{reason}] 这张图没有被转写成文字;不要猜测图中内容。";

/**
 * 视觉端点上**透传图片**的数量上限(2026-10-16 用户定案)。
 *
 * 背景:DSH 每轮最多发 20 张图,而历史图片会**随对话累积** —— 一轮里带 60 张的
 * 请求是常态,上游的硬限是 50。
 *
 * 处置:保留**最后** N 张(用户最近真正发的那些,最可能是本轮要问的);更早的
 * 历史图**丢掉**,并在消息尾追加一句说明;**不解析**(这条路径的档位自己就能看图,
 * 降级成文本白费额度)。
 */
export const IMAGE_MAX_PASSTHROUGH = 20;

/**
 * @deprecated **不再使用**(2026-11-13)。保留导出只为不打断既有引用。
 *
 * 弃用原因:它的文案里带 `{dropped}` / `{kept}` **两个每轮都会变的数字**,
 * 追加到消息尾等于每轮改一次前缀字节 —— 直接把上游 prompt cache 打散。
 * 现在统一的处置是 {@link foldedImagePlaceholder}(只含图片类型,同图恒同字节)。
 */
export const IMAGE_DROPPED_NOTE =
  "【网关】本次请求携带的图片数超过上限,已丢弃最早的 {dropped} 张历史图片," +
  "仅保留最近 {kept} 张;若需要更早的图片内容,请单独发送或改用支持长上下文的模型。";

/**
 * 图像桥**静默丢弃**未缓存的历史图后,整条消息只剩图片时补的极短文本。
 *
 * 为什么必须有:删块之后 content 可能变成空数组,而空数组会让部分上游 400。
 * 文案刻意短到不含任何信息量 —— 「静默丢弃」的语义就是**不向模型交代**丢了什么。
 */
export const IMAGE_HISTORY_EMPTY_MARK = "【网关】历史图片已省略。";

/**
 * 图像桥的**一次性说明**,追加在**第一个**被桥接的图片块后面(只追加一次)。
 *
 * 为什么必须有它:桥接把图片换成文字之后,下游模型并不知道「这里原来有图、
 * 而且我可能没看到全部信息」。没有这句话,模型会拿半份证据硬答;有了它,模型
 * 知道可以**要求用户补充**或**建议换原生图像模型**。
 *
 * ⚠️ 只追加一次、且固定在**第一个**被桥接的块上:同一组图片在任何一轮里的字节
 * 位置都一样,前缀缓存才不会被打散。
 */
/**
 * 图像桥的**一次性说明**（追加在第一个被桥接的块后）。
 *
 * ## 为什么必须说清「你现在看到的是转述，不是原图」
 *
 * 被桥接的模型**没有视觉能力**——它看到的 `[图片 N/M 解析] …` 是另一个模型
 * 转写的**文字证据**，原文根本不在上下文里。不明说的话，模型会把转述当原图，
 * 自信地讨论它其实没看见的细节（构图、颜色、文字、占比），这是最坏的失败模式：
 * 答得很像，但全是编的。
 *
 * ## 为什么高要求任务要**中止**而不是硬做（2026-11-12 用户定案）
 *
 * 文字转述描述的是「这张图大致有什么」，它**承载不了**需要逐像素核对的任务：
 * 图像生成/改图的参考与自检、按图比对构图与站位、读小字与精确数值、
 * 判断配色/光影/材质细节……这类任务拿转述去做，产出会看起来合理但**必然错**，
 * 而且用户往往没法一眼发现。
 *
 * 所以这里给的是**硬指令**：遇到这类任务就停，明确要求用户换支持原生图像
 * 的模型——把「能力不足」暴露在第一步，好过交付一个错的东西。
 *
 * ⚠️ 只追加一次、且固定在**第一个**被桥接的块上：同一组图片在任何一轮里的字节
 * 位置都一样，前缀缓存才不会被打散。
 */
export const IMAGE_BRIDGE_NOTE =
  "\n\n【图像桥】重要：本请求里的图片**不是原图**——它们已由图像桥转写成文字" +
  "(见 [图片解析] / [图片无法解析] 标记)，原文不在你的上下文中。你看到的图像信息" +
  "**来自图像桥的文字转述**，不是你自己的视觉。\n" +
  "因此：\n" +
  "1. 一般性的问答、描述、概要识别，可以基于转述回答；但**不要**声称看到转述里" +
  "没有的具体细节（精确颜色、构图比例、小字、像素级差异），也不要猜测图中内容。\n" +
  "2. **若本任务对图像要求较高**——例如图像生成/改图（需要按参考图核对产出）、" +
  "按图比对构图或站位、读取图中细微文字与数值、判断配色光影材质等——" +
  "**文字转述不足以完成任务**。此时请**立即中止任务**，直接告诉用户：" +
  "「本模型没有原生视觉能力，当前图片是图像桥的文字转述，无法可靠完成该任务，" +
  "请更换支持原生图像的模型」。\n" +
  "宁可停下换模型，也不要基于转述硬交付一个看起来对、实际错的结果。";

/** 图片解析结果的**进程内 LRU 缓存上限**(条)。纯内存,重启即清(设计如此)。 */
export const PARSE_CACHE_MAX = 128;

/** 缓存值前缀:成功 = `ok\0` + 转写证据。 */
const CACHE_OK = "ok\u0000";
/** 缓存值前缀:确定性失败 = `fail\0` + 失败原因。 */
const CACHE_FAIL = "fail\u0000";

// ---------------------------------------------------------------------------
// 缓存(进程内 LRU)
// ---------------------------------------------------------------------------

/**
 * 进程内 LRU:图片内容哈希 → **这张图的解析结果**。
 *
 * ⚠️ 缓存存的是**结果**,不是「替换进消息的文本」:替换文本里带**位置序号**
 * (「第 2/5 张」),而同一张图可以在不同消息里出现在不同位置 —— 序号必须按
 * **本次**位置现算,不能让缓存把上一轮的序号带进来。
 */
const parseCache = new Map<string, string>();

/** 取缓存:命中返回结果并刷新 LRU 位置。 */
export function parseCacheGet(key: string): string | null {
  const value = parseCache.get(key);
  if (value !== undefined) {
    // 刷新 LRU 位置(删了再插 → 变成最新)
    parseCache.delete(key);
    parseCache.set(key, value);
  }
  return value ?? null;
}

/** 写缓存:超上限时淘汰最旧的一条。 */
export function parseCacheSet(key: string, value: string): void {
  if (parseCache.has(key)) parseCache.delete(key);
  parseCache.set(key, value);
  while (parseCache.size > PARSE_CACHE_MAX) {
    const oldest = parseCache.keys().next();
    if (oldest.done) break;
    parseCache.delete(oldest.value);
  }
}

/** 清缓存(测试 / 维护用)。 */
export function parseCacheClear(): void {
  parseCache.clear();
}

/** 成功结果入缓存的编码。 */
export function okValue(text: string): string {
  return CACHE_OK + text;
}

/** 确定性失败入缓存的编码。 */
export function failValue(reason: string): string {
  return CACHE_FAIL + reason;
}

// ---------------------------------------------------------------------------
// 消息里的图片块
// ---------------------------------------------------------------------------

/**
 * 消息里的一块(OpenAI 多模态形状)。
 *
 * ⚠️ 用网关的 {@link ChatContentPart} 而不是自定义宽松类型:桥接产出的块要**原样
 * 进回请求体**,类型不一致就得强转 —— 而 `image_url` 有「对象」与「字符串」两种
 * 写法,强转时最容易把字符串写法悄悄改成对象(上游只认一种)。
 */
export type ContentPart = ChatContentPart;

export type BridgeMessage = {
  role: string;
  content: string | ContentPart[];
  [k: string]: unknown;
};

/**
 * 内联 base64 的**最短**长度门槛(64 字符 ≈ 48 字节原始数据)。
 *
 * 为什么要有:base64 字母表(`A-Za-z0-9+/=`)与英文单词重叠,而
 * `data:image/png;base64,AAAA nextword` 这种写法里 `nextword` 也是合法 base64
 * 字符 —— 扫描会把它一起吞掉。真实内联图至少几百字节,用 64 字符做门槛既挡掉
 * 误判,又不会漏掉任何真实图片。
 */
const MIN_INLINE_BASE64_LEN = 64;

/**
 * 一条 content **字符串**里的内联 data URL(2026-11-09,用户报「网关扔图」)。
 *
 * ## 为什么需要它
 *
 * OpenAI 多模态有两种写法:标准的 `content: [{type:"image_url",...}]` **块数组**,
 * 以及**把 base64 直接拼进 content 字符串**。DSH(以及不少客户端)发的是后者 ——
 * 实测 AIGC 会话单条 user 消息 `content` 长 **3,787,862 字符**(3.7MB),
 * 消息键只有 `{content, role}`,没有 `image_url`。
 *
 * 旧实现 `imagePartIndices` 只认**块**,于是字符串形态的图:
 * - 不被计成图片(`IMAGE_TOKENS=1024` 用不上,按字符估成几十万 token)
 * - 不走图像桥(转不成文字证据)
 * - 不被 `dropExcessImages` 管(超上限也不丢,整条消息直接被上游拒收/忽略)
 *
 * 用户看到的现象就是「网关把图丢了」—— 其实是**网关根本没把图当图**。
 *
 * ## 做法
 *
 * 把字符串里的每个 `data:image/...;base64,...` **切出来变成标准块**,
 * 文本片段保留为 `text` 块。之后所有既有逻辑(桥接、丢超额、token 估算)
 * 都自动生效,不需要在每处再判一次字符串。
 *
 * @returns 该消息的块数组;字符串里没有 data URL 时返回 `null`(调用方保持原样)。
 */
export function splitInlineImageDataUrls(content: string): ContentPart[] | null {
  // `data:image/<subtype>[;param...];base64,<payload>`
  //
  // ⚠️ 分两段匹配,不用「贪婪 + 负向前瞻」:
  // 1. 先找 `data:image/...;base64,` 这个**头**(短,廉价);
  // 2. 再从头的末尾**手动**往后扫 base64 字符,直到遇到第一个非 base64 字符。
  //
  // 为什么不写成一个正则:base64 字母表与英文单词重叠,`...AAAA nextword` 用
  // `[A-Za-z0-9+/=]+(?![A-Za-z0-9])` 会让正则先吃到 `nextword` 再回溯 ——
  // 在 3.7MB 的 payload 上这种回溯是灾难性的(实测会卡住)。手动扫是 O(n) 一次过。
  const HEAD = /data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=.+-]+)*;base64,/g;
  const isB64 = (code: number): boolean =>
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    (code >= 0x30 && code <= 0x39) || // 0-9
    code === 0x2b || // +
    code === 0x2f || // /
    code === 0x3d; // =
  const parts: ContentPart[] = [];
  let last = 0;
  let hit = false;
  for (;;) {
    const m = HEAD.exec(content);
    if (m === null) break;
    const start = m.index;
    let end = m.index + m[0].length;
    while (end < content.length && isB64(content.charCodeAt(end))) end += 1;
    // ⚠️ **长度校验**:base64 字母表与英文单词重叠,`...AAAA nextword` 里
    // `nextword` 也是合法 base64 字符,扫到尾会把它一起吞进来。
    //
    // 现实约束:真实内联图的 payload 至少几百字节(短于 64 字符的 data URL 在
    // 浏览器/客户端侧根本不会被当成图)。所以这里要求 payload **至少 64 字符**;
    // 不足就认为不是图,跳过这个头(继续找下一个)。
    const payloadLen = end - (m.index + m[0].length);
    if (payloadLen < MIN_INLINE_BASE64_LEN) {
      continue;
    }
    hit = true;
    const before = content.slice(last, start);
    if (before.trim() !== "") parts.push({ type: "text", text: before } as ContentPart);
    parts.push({
      type: "image_url",
      image_url: { url: content.slice(start, end) },
    } as ContentPart);
    last = end;
    // 下一轮从 end 之后继续找头(避免重叠匹配)。
    HEAD.lastIndex = end;
  }
  if (!hit) return null;
  const tail = content.slice(last);
  if (tail.trim() !== "") parts.push({ type: "text", text: tail } as ContentPart);
  return parts.length > 0 ? parts : null;
}

/**
 * 历史图折叠后的**确定性占位符**(2026-11-13)。
 *
 * ## 为什么强调「确定性」
 *
 * 上游 prompt cache 要求前缀**逐字节相同**。同一个历史图在每一轮都必须产出
 * **同样的一串字符** —— 不能带序号、不能带时间、不能带「本轮丢弃了几张」
 * 这种每轮都变的数字(那正是旧 `IMAGE_DROPPED_NOTE` 的问题)。
 *
 * ## 为什么带 `ref=`
 *
 * 只写 `[图片 已折叠]` 的话,**两张不同的图会产出同一段字节** —— 模型无法
 * 区分「这里有过两张图」,用户也没法定向检索。带上**内容哈希**({@link
 * imageContentRef})后:
 * - 不同图 → 不同字节(模型能分辨);
 * - 同图同轮 → 同字节(前缀稳定);
 * - ref 是个可搜的锚(会话记录/日志里能搜到)。
 *
 * 代价:占位符里放不下「这张图是什么内容」—— 那是宿主/agent 侧的活(OCR/描述),
 * 不是网关的活。网关只负责**如实说明「有图、多大、什么格式、原始字节在哪」**。
 */
export function foldedImagePlaceholder(mime: string | null, ref: string | null): string {
  const segs: string[] = [];
  if (ref !== null) segs.push(`ref=${ref}`);
  if (mime !== null) segs.push(mime);
  segs.push("历史轮次,未载入像素");
  return `[图片 已折叠 · ${segs.join(" · ")}]`;
}

/**
 * 从图片块里提取**载荷 URL**(data URL 或 http(s));认不出返回 `null`。
 *
 * 这是三处共用的一份口径(以前各写一遍,容易漂):
 * - {@link imageMimeOf}(读 mime);
 * - {@link imageContentRef}(算内容寻址的短哈希);
 * - {@link parseCacheKey}(算解析缓存键)。
 */
export function imageUrlOfPart(imagePart: ContentPart): string | null {
  const p = imagePart as unknown as Record<string, unknown>;
  let url: unknown;
  if (p.type === "image_url") {
    const inner = p.image_url;
    url = inner !== null && typeof inner === "object" ? (inner as { url?: unknown }).url : undefined;
  } else if ((p.type as string) === "image") {
    url = p.url;
    if (typeof url !== "string") {
      const inner = p.image_url;
      if (inner !== null && typeof inner === "object") {
        url = (inner as { url?: unknown }).url;
      } else if (typeof inner === "string") {
        url = inner;
      }
    }
  }
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 图片块的**内容寻址短哈希**(16 hex 字符),用于折叠占位符里的 `ref=`。
 *
 * ⚠️ 与 {@link parseCacheKey} 的区别:那个掺了「解析模型 + 提示词版本」,
 * 会随解析策略变化;占位符要的是**只反映图片内容**的稳定标识,所以这里
 * 只 hash 载荷 URL 本身。
 *
 * 两个用途:
 * 1. 让**不同的图产出不同的占位符字节** —— 模型能区分「这里有过两张图」,
 *    而不是看到两段一模一样的文字;
 * 2. 提供一个**可被人检索的锚**(用户可以在会话/日志里搜这个 ref)。
 */
export function imageContentRef(imagePart: ContentPart): string | null {
  const url = imageUrlOfPart(imagePart);
  if (url === null) return null;
  return createHash("sha256").update(url, "utf-8").digest("hex").slice(0, 16);
}

/**
 * 从图片块里读 `media type`(只认 data URL 前缀,**不解码像素**)。
 *
 * 返回**完整 mime**(如 `image/png`,不是 `png`)—— 占位符里写全名,
 * 模型与人都能一眼认出格式;取不到就返回 null(占位符退化成不带类型的版本)。
 * 绝不猜。
 */
export function imageMimeOf(imagePart: ContentPart): string | null {
  const url = imageUrlOfPart(imagePart);
  if (url === null) return null;
  const m = /^data:(image\/[a-z0-9.+-]+)/i.exec(url);
  return m?.[1]?.toLowerCase() ?? null;
}

/**
 * 要不要走图像桥(2026-11-12 用户定案)。
 *
 * ## 唯一判据:链上有没有视觉端点
 *
 * ⚠️ **图片数不再是判据**。旧实现是「超上限(>50)就走桥,**哪怕有视觉端点**」,
 * 而 DSH 的历史图是**逐轮累积**的,聊久了轻松破 50 张 —— 于是视觉模型被
 * 强制降级成文字转述,用户看到的是「我的原生图像模型怎么开始说『图是转述的』」。
 *
 * 正确顺序:**有视觉端点就裁图**({@link dropExcessImages} 会裁到
 * {@link IMAGE_MAX_PASSTHROUGH}=20 张,远低于上游硬限),没有视觉端点才转文字。
 *
 * @param chainHasVision 链上是否存在 `supportsVision` 端点
 * @returns `true` = 走图像桥(把图转成文字证据)
 */
export function shouldBridgeImages(chainHasVision: boolean): boolean {
  return !chainHasVision;
}

/**
 * 把**字符串形态的内联图**规范化成标准块数组(纯函数,不改入参)。
 *
 * 只处理「content 是字符串且含 data:image」的消息;块数组原样保留
 * (已经标准了,再切一遍反而可能把文本块拆碎)。
 *
 * 调用点在 `bridgeImagesIfNeeded` **之前**:先规范化,后面所有环节就都按块处理了。
 */
export function normalizeInlineImages(messages: BridgeMessage[]): BridgeMessage[] {
  let changed = false;
  const out = messages.map((msg) => {
    const content = msg?.content;
    if (typeof content !== "string" || !content.includes("data:image")) return msg;
    const parts = splitInlineImageDataUrls(content);
    if (parts === null) return msg;
    changed = true;
    return { ...msg, content: parts };
  });
  return changed ? out : messages;
}

/**
 * 收集所有图片块的下标 `(消息号, 块号)`。
 *
 * 只认 `image_url` / `image` 块;解析按出现顺序进行,保证替换回新消息后顺序与
 * 原文一致。
 *
 * ⚠️ 字符串形态的内联图**要先过 {@link normalizeInlineImages}** —— 这个函数
 * 只看块,认不出 `content` 里的 data URL(2026-11-09 用户报「网关扔图」的根因)。
 */
export function imagePartIndices(messages: BridgeMessage[]): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  messages.forEach((msg, mi) => {
    const content = msg?.content;
    if (!Array.isArray(content)) return;
    content.forEach((part, pi) => {
      if (part === null || typeof part !== "object") return;
      const type = (part as { type?: unknown }).type;
      // ⚠️ `ChatContentPart` 的类型联合里目前只有 `text` / `image_url`,但连接器
      // 也接受 `image` 形态 —— 这里按**运行时**判,不按联合类型判(否则 TS 会
      // 报「这俩类型没有交集」,而运行时它是存在的)。
      if (type === "image_url" || type === "image") found.push([mi, pi]);
    });
  });
  return found;
}

/**
 * 最后一条 `role=user` 消息的下标(不论其 `content` 是字符串还是数组)。
 *
 * 图像桥靠它区分「本轮输入的图」与「历史图」:最后一条 user 消息**及其之后**的
 * assistant / tool 消息里的图(工具调用循环,如 `read_image` 返回)都算本轮,
 * 未缓存就逐张解析;更早的消息才算历史。
 *
 * 为什么从尾部往前找:assistant / tool 消息可能出现在最后一条 user 消息之后
 * (工具调用循环),而「本次输入」永远指**最后那条 user**。取不到(整个请求没有
 * user 消息)时返回 `null` —— 调用方按「全部是历史图」处理。
 *
 * ⚠️ **不要求 content 是数组**:最后一条 user 消息是纯字符串(如「继续」)时,它
 * 依然是「本轮输入」的载体 —— 只是它不可能带图,于是**没有任何图**算本轮。
 */
export function lastUserMessage(messages: BridgeMessage[]): number | null {
  for (let mi = messages.length - 1; mi >= 0; mi -= 1) {
    const msg = messages[mi];
    if (msg !== null && typeof msg === "object" && msg.role === "user") return mi;
  }
  return null;
}

/**
 * 图片解析缓存的键 = 图片**内容哈希**;形状无法识别返回 `null`(不缓存)。
 *
 * canonical 串 = 图片载荷字符串,去前后空白后参与哈希:
 * - `image_url` 取 `image_url.url`(data URL / http(s) URL 都行);
 * - `image` 取顶层 `url`,没有则取 `image_url.url` / `image_url` 字符串。
 *
 * 键前缀 `v3|` + 解析模型名:提示词或解析模型变更时键**自然失效**,无需手工清
 * 缓存。⚠️ 版本号从 `v1` 提到 `v3`:提示词(概括 → modlens 式证据)与「无法解析」
 * 判据都变了,同一张图在旧提示词下的转写与新提示词下的转写**不是同一种东西** ——
 * 不换版本会让升级后第一轮命中旧缓存,看起来「新提示词没生效」。
 */
export function parseCacheKey(imagePart: ContentPart): string | null {
  const canonical = imageUrlOfPart(imagePart);
  if (canonical === null) return null;
  return createHash("sha256")
    .update(`v3|${FREE_PARSE_MODEL}|${canonical}`, "utf-8")
    .digest("hex");
}

/**
 * 把「这张图的解析结果」渲染成**替换进消息的文本**。
 *
 * - 成功 → `[图片 2/5 解析] <证据>`
 * - 失败 → `[图片 2/5 无法解析:<理由>] 这张图没有被转写成文字;不要猜测图中内容。`
 *
 * ⚠️ `seq`/`total` 是**本次**位置(该图在其所属消息里的第几张、共几张),与缓存里
 * 的结果分开 —— 同一张图换个位置,序号跟着变,证据不变。
 */
export function imageReplacement(seq: number, total: number, value: string): string {
  if (value.startsWith(CACHE_OK)) {
    return IMAGE_PARSED_TEMPLATE.replace("{seq}", String(seq)).replace("{total}", String(total))
      .replace("{text}", value.slice(CACHE_OK.length));
  }
  const reason = value.startsWith(CACHE_FAIL) ? value.slice(CACHE_FAIL.length) : value;
  return IMAGE_UNPARSED_TEMPLATE.replace("{seq}", String(seq)).replace("{total}", String(total))
    .replace("{reason}", reason);
}

// ---------------------------------------------------------------------------
// 视觉端点路径:图片太多时丢掉最早的
// ---------------------------------------------------------------------------

/**
 * 视觉端点路径:图片太多时**丢掉最早的**,在消息尾说明丢了几张。
 *
 * 只动图片块,消息结构与顺序一律不动 —— 丢掉的是**块**(直接删),不是留空槽:
 * 空槽(`{type:"image_url"}` 没有 url)会让部分上游 400,而说明句已经交代了
 * 「哪一段没了」。
 *
 * @param keep 保留**最后**几张(用户最近发的)。
 * @returns `[新 messages, 丢掉几张]`;没超限返回 `[原 messages, 0]`(零开销旁路)。
 */
/**
 * 超过透传上限时,**把最早的图原位换成确定性占位符**(2026-11-13 改)。
 *
 * ## 为什么不再「删块 + 动态尾注」
 *
 * 旧实现做两件破坏前缀缓存的事:
 * 1. `content.splice(pi, 1)` —— 删块后消息变短,块序列与上一轮不同;
 * 2. 末尾追加 `IMAGE_DROPPED_NOTE`,文案里带 `{dropped}` / `{kept}` ——
 *    **这两个数字每轮都变**,于是消息尾每轮都是新字节。
 *
 * 上游 prompt cache 要求「前 k 个字节逐字相同」,上面两条都会让它整体失效
 * (这正是 bili #2607 删掉滑动裁剪的原因)。
 *
 * 现在改成与历史图折叠**同一套**策略:原位替换成 {@link foldedImagePlaceholder}
 * —— 块数量不变(下标稳定)、占位符只含图片类型(同图恒同字节)。
 *
 * @returns `[新消息, 被替换的张数]`(张数仍返回,供调用方打日志)
 */
export function dropExcessImages(
  messages: BridgeMessage[],
  keep: number = IMAGE_MAX_PASSTHROUGH,
): [BridgeMessage[], number] {
  const images = imagePartIndices(messages);
  const dropped = images.length - keep;
  if (dropped <= 0) return [messages, 0];

  // 标记「最早的那批」,再一次性重建(避免边遍历边改导致下标漂移)。
  const doomed = new Set(images.slice(0, dropped).map(([mi, pi]) => `${mi}:${pi}`));
  const newMessages = deepCopyMessages(messages);
  for (const [mi, pi] of images) {
    if (!doomed.has(`${mi}:${pi}`)) continue;
    const content = newMessages[mi]?.content;
    if (!Array.isArray(content)) continue;
    const part = content[pi];
    if (part === undefined) continue;
    content[pi] = {
      type: "text",
      text: foldedImagePlaceholder(imageMimeOf(part), imageContentRef(part)),
    } as ContentPart;
  }
  return [newMessages, dropped];
}

/** 深拷贝消息数组 —— 解析回退要替换图片块,不能就地改请求体。 */
export function deepCopyMessages(messages: BridgeMessage[]): BridgeMessage[] {
  return messages.map((m) => ({
    ...m,
    content: Array.isArray(m.content) ? m.content.map((p) => ({ ...p })) : m.content,
  }));
}

// ---------------------------------------------------------------------------
// 图像桥本体
// ---------------------------------------------------------------------------

/** 解析单张图的回调:成功返回转写文字,失败返回 `null`。 */
export type ParseOneImage = (imagePart: ContentPart) => Promise<string | null>;

/** 图像桥的结果统计(供日志 / 面板)。 */
export interface ImageBridgeResult {
  /** 替换成文字块的图片张数。 */
  replaced: number;
  /** 命中缓存的张数。 */
  cacheHits: number;
  /** 明确失败(占位)的张数。 */
  unparsed: number;
  /** 静默丢弃的历史图张数。 */
  droppedHistory: number;
  /** 本轮真的打了免费档的张数(配额只看它)。 */
  parsedNow: number;
}

/**
 * **逐张**把图片块转成文字证据,失败也给一条可执行的线索。
 *
 * 条件(调用方判定):请求带图,且满足下面**任一**条 ——
 * - 目标链**没有**视觉端点;或
 * - `hardOverflow`:图片数超过上游硬限({@link IMAGE_HARD_LIMIT}),**即使链上有
 *   视觉端点也得桥**(否则就是确定性 400 + 一整轮无意义重试)。
 *
 * 行为:
 * 1. **逐张**发单图请求(提示词 + 图片),`stream=false` +
 *    `reasoning_effort="none"` + `temperature=0`;
 * 2. 每张图的结果按**内容哈希**入进程内 LRU 缓存 —— 同一张图(含「读不出来」这种
 *    确定性结论)在后续轮次里不再打免费档;
 * 3. 原位替换成 `[图片 {seq}/{total} 解析] …` / `[图片 {seq}/{total} 无法解析:<理由>] …`,
 *    **序号按该图在其所属消息中的位置现算**;失败的也写占位,**不再原样保留等
 *    连接器静默丢弃**;
 * 4. 调用方链**自己有视觉端点**时(`hardOverflow` 除外),失败退回「保留原图让
 *    上游亲眼看」—— 那种情况把图换掉才是真的丢信息;
 * 5. 在**第一个**被桥接的块后追加一次 {@link IMAGE_BRIDGE_NOTE};
 * 6. **历史图**:只有**最后一条 user 消息起**(含其后的 assistant / tool 消息)
 *    的图算「本轮输入」,享受「未缓存就逐张解析」;更早消息里的图,缓存命中 →
 *    换成缓存证据文本,未命中 → 静默删块。
 *
 * **一次定胜负 —— 不做多轮解析**。
 */
export async function tryParseImages(
  messages: BridgeMessage[],
  opts: {
    /** 解析单图(由调用方注入:走 `free` 抽象模型的完整链路)。 */
    parseOne: ParseOneImage;
    /** 目标链上有没有视觉端点(失败时保留原图)。 */
    chainHasVision: boolean;
    /** 图片数超过上游硬限(即使有视觉端点也桥)。 */
    hardOverflow?: boolean;
    /** 单次请求最多尝试解析的张数。 */
    maxImages?: number;
  },
): Promise<{ messages: BridgeMessage[]; result: ImageBridgeResult }> {
  const images = imagePartIndices(messages);
  const result: ImageBridgeResult = {
    replaced: 0, cacheHits: 0, unparsed: 0, droppedHistory: 0, parsedNow: 0,
  };
  if (images.length === 0) return { messages, result };

  // 「上游自己能看图」= 失败时保留原图。⚠️ 硬限溢出时**不能**保留:保住原图
  // 等于把 N(>50) 张又塞回上游,那是确定性 400。
  const allowNative = opts.chainHasVision && opts.hardOverflow !== true;
  const maxImages = opts.maxImages ?? FREE_PARSE_MAX_IMAGES;

  const newMessages = deepCopyMessages(messages);

  // 序号按**消息内**计数。跨消息不连续是有意的:下游模型看到的是「这条用户消息里
  // 的第 3 张图」,不是全局第几。
  const totals = new Map<number, number>();
  for (const [mi] of images) totals.set(mi, (totals.get(mi) ?? 0) + 1);
  const seen = new Map<number, number>();
  const currentMi = lastUserMessage(messages);
  let notePlaced = false;

  const place = (mi: number, pi: number, seq: number, total: number, value: string): void => {
    const suffix = notePlaced ? "" : IMAGE_BRIDGE_NOTE;
    notePlaced = true;
    const content = newMessages[mi]?.content;
    if (!Array.isArray(content)) return;
    const text = imageReplacement(seq, total, value);
    content[pi] = { type: "text", text: text + suffix };
    result.replaced += 1;
  };

  /**
   * 历史图折叠:把图块**原位换成确定性占位符**。
   *
   * ⚠️ **2026-11-13 从「删块」改成「原位替换」**,两个原因:
   *
   * 1. **前缀稳定**:删块会让消息的块序列变短,而占位符是按「图类型」算的
   *    确定字符串 —— 同样的历史图在任何一轮都产出同样的字节。上游 prompt
   *    cache 要求「前 k 个字节逐字相同」,这一点直接决定缓存命中率
   *    (bili 的 #2607 就是因为滑动裁剪移动字节边界而整个删掉了那个机制)。
   * 2. **信息不丢「存在性」**:以前删块后模型**完全不知道**这里有过图,
   *    现在它会看到「已折叠」的占位,能如实告诉用户「这张历史图没有载入像素」,
   *    而不是假装没收到过图。
   */
  const dropHistoryImage = (mi: number, pi: number): void => {
    const content = newMessages[mi]?.content;
    if (!Array.isArray(content)) return;
    const part = content[pi];
    if (part === undefined) return;
    content[pi] = {
      type: "text",
      text: foldedImagePlaceholder(imageMimeOf(part), imageContentRef(part)),
    } as ContentPart;
    result.droppedHistory += 1;
  };

  for (const [mi, rawPi] of images) {
    seen.set(mi, (seen.get(mi) ?? 0) + 1);
    const seq = seen.get(mi) as number;
    const total = totals.get(mi) as number;
    // 原位替换(不改块数量)→ 下标就是原始下标,不需要位移修正。
    const pi = rawPi;
    const content = newMessages[mi]?.content;
    if (!Array.isArray(content)) continue;
    const part = content[pi];
    if (part === undefined) continue;

    const key = parseCacheKey(part);
    if (key !== null) {
      const cached = parseCacheGet(key);
      if (cached !== null) {
        place(mi, pi, seq, total, cached);
        result.cacheHits += 1;
        continue;
      }
    }

    // 历史图 = **最后一条 user 消息之前**的消息;最后一条 user 消息及其之后的
    // assistant / tool 消息都属于**本轮**(工具调用循环里的图 —— 典型是
    // `read_image` 的返回 —— 是用户刚请求的内容,必须按本轮图解析,不能当历史丢)。
    // 整个请求没有 user 消息(`currentMi === null`)时保持旧语义:全部按历史处理。
    if (currentMi === null || mi < currentMi) {
      // 非本轮图:未缓存就换成**确定性占位符**(见 dropHistoryImage 的注释)。
      // `allowNative` 时不动(上游自己能看,换掉是白丢);但 `hardOverflow` 下必须换。
      if (!allowNative) {
        // ⚠️ 不再 `shift.set(...)`:原位替换不改变块数量,下标自然对齐。
        dropHistoryImage(mi, pi);
      }
      continue;
    }

    // 配额只对**本轮图**生效。
    if (result.parsedNow >= maxImages) {
      if (allowNative) continue;
      place(mi, pi, seq, total, failValue("超出单请求解析配额"));
      result.unparsed += 1;
      continue;
    }

    const text = await opts.parseOne(part);
    result.parsedNow += 1;
    if (text === null) {
      // 上游调用失败(超时 / 5xx / 空回包):**不缓存** —— 那是瞬时故障,下一轮该
      // 重试;但这一轮必须给下游一个明确交代,不能静默丢图。
      if (allowNative) continue;
      place(mi, pi, seq, total, failValue("解析请求失败"));
      result.unparsed += 1;
      continue;
    }
    const trimmed = text.trim();
    if (trimmed === "") {
      if (allowNative) continue;
      place(mi, pi, seq, total, failValue("解析结果为空"));
      result.unparsed += 1;
      continue;
    }
    // 「无法解析」= 模型明说读不出来 → **确定性失败**,入缓存(下轮不再烧免费档)。
    if (trimmed.includes(FREE_PARSE_UNPARSED)) {
      const value = failValue("模型无法辨认这张图");
      if (key !== null) parseCacheSet(key, value);
      if (allowNative) continue;
      place(mi, pi, seq, total, value);
      result.unparsed += 1;
      continue;
    }
    const value = okValue(trimmed);
    if (key !== null) parseCacheSet(key, value);
    place(mi, pi, seq, total, value);
  }

  return { messages: newMessages, result };
}
