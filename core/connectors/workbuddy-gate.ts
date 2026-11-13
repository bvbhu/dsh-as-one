/**
 * WorkBuddy 上游「渠道校验」归一化 —— 镜像 dsh-connect-workbuddy 插件
 * (dingminhua)在 issue #98 里实测并修复的三道门:
 *
 * 上游(2026-10-21 起)对 `system` / `assistant` 消息做**内容指纹扫描**,
 * 命中即 HTTP 400 / code 11128「请求被网关的渠道校验拦截」:
 *
 * - 门 A(开头指纹):消息 **content 开头**命中已知第三方 agent 句式
 *   (`You are an AI agent powered by DeepSeek Harness.` / `You are Claude Code...`)
 *   → `neutralizeChannelFingerprints()` 给命中消息前缀中性头;
 * - 门 B(中段指纹):content **正文任意位置**含 DSH 相关句式(精确子串,
 *   与长度无关,251 字符也能触发)→ `perturbChannelFingerprints()` 在句读处
 *   **与词内断点**插 U+200B 零宽空格,截断跨句/裸产品名指纹
 *   (词不改、对模型无意义、对读者不可见);
 * - 门 C(账号级封禁):code 11140「账号存在异常行为」→ 无法绕过,不在此处理。
 *
 * 规则要点(全部来自 issue #98 实测):
 * - **每条** `system` / `assistant` 消息都被独立扫描(不只第一条);
 * - content 为 **parts 数组**时逐 text part 处理;
 * - `user` / `tool` 消息不扫;
 * - **换号拿到同一个 400**(指纹在请求内容里,不在账号上) → 重试不换档;
 * - 报错回显必须读**宿主原始 body**(归一化后的 body 会把插件/网关自己加的
 *   中性头误报成命中对象,正是 #98 里 43 条评论误导的根源)。
 *
 * 2026-10-22 按参考插件 #113 修订(两处):
 * 1. `isChannelRejectDetail` 改为**按 code 认一族**(11128),不再靠 msg 措辞
 *    排除 —— #113 实测一条内容拒绝的 msg 写着 `conversation id missing`
 *    而三个会话头全带着;旧规则把它判成普通 client,救援阶梯空转。
 * 2. `perturbText` 补**词内断点**:结尾无标点的裸产品名(`DeepSeek Harness`)
 *    一个句读都没有,只按句读插零宽等于没插。
 */

/** 中性头(插到命中消息开头,把黑名单句式推出 offset 0)。 */
export const WORKBUDDY_NEUTRAL_HEAD = "You are a helpful assistant.";

/** 已知被拦的第三方 agent 开头指纹(门 A:BINGO 列表;完整黑名单上游不公开)。 */
export const KNOWN_CHANNEL_OPENINGS: readonly string[] = [
  "You are an AI agent powered by DeepSeek Harness.",
  "You are Claude Code, Anthropic's official CLI for Claude.",
];

/**
 * DSH 的 **ACP 消息标记** —— `<acp tokens="1.7K" type="text">m35968</acp>`。
 *
 * 这是宿主自己注入的记账标记(它把「这条消息对应哪个 m 编号、占多少 token」
 * 写在正文里),会随历史一路发给上游。2026-10-31 用户实测:assistant 消息
 * 以这种标记开头时,上游 11128 渠道校验拦截(counted as 提示开头指纹),
 * 而**门 B 拦不住它** —— 标记串里既没有句读(`,.!?。`),也没有大写词边界
 * (`<acp tokens=...>` 全是小写),`perturbText` 一条规则都不落。
 *
 * 更根本的原因是它**不是散文**:普通文本可以靠「句读 / 大写词」找断点,
 * 而标签的断点在 `<` 与标签名之间、标签名与属性之间。所以这里给标签类
 * 形态单独一条规则(见 {@link TAG_NAME_BREAK} / {@link TAG_ATTR_BREAK}),
 * ACP 只是其中最常见的一个实例。
 */
const ACP_MARKER_HEAD = /^<acp\b/i;

/** 文本(忽略前导空白)是否以 ACP 标记开头 —— 门 A 的额外命中条件。 */
export function startsWithAcpMarker(text: string): boolean {
  return ACP_MARKER_HEAD.test(text.replace(/^\s+/, ""));
}

/** 向上的页面文案就写死这一份,便于用户一眼看懂(镜像插件 channel_reject)。 */
export const CHANNEL_REJECT_TIP =
  "被 WorkBuddy 网关的渠道校验拦截(HTTP 400 / code 11128):网关匹配请求里的 " +
  "system/assistant 提示内容,与账号、积分、额度、网络都无关 —— 换账号或换区域 " +
  "不会改变结果。若该内容来自宿主或其他插件,请修改对应提示;已对已知的第三方 " +
  "agent 指纹做归一化,新指纹可反馈到 issue。";

/* ------------------------------------------------------------------ *
 * content 形态处理(string 或 parts 数组,逐 text part)
 * ------------------------------------------------------------------ */

type AnyContent = unknown;

function isTextPart(part: unknown): part is { type?: string; text?: unknown } {
  return (
    part !== null &&
    typeof part === "object" &&
    !Array.isArray(part) &&
    typeof (part as { text?: unknown }).text === "string"
  );
}

/** 提取某条消息的可改写文本(仅 text 部分;图片等 part 原样保留)。 */
function eachTextOf(content: AnyContent): string[] {
  if (typeof content === "string") return [content];
  if (Array.isArray(content)) {
    return content.filter(isTextPart).map((p) => p.text as string);
  }
  return [];
}

/** 按 text 位置回写(parts 数组时保留非文本 part 原样)。 */
function withTexts(content: AnyContent, next: (text: string, i: number) => string): AnyContent {
  if (typeof content === "string") return next(content, 0);
  if (Array.isArray(content)) {
    let i = 0;
    return content.map((part) => {
      if (isTextPart(part)) {
        const t = next(part.text as string, i);
        i += 1;
        return { ...part, text: t };
      }
      return part;
    });
  }
  return content;
}

/** 消息本身是否会被扫描:system / assistant 恒扫,user / tool 不扫。 */
function isScannedRole(role: unknown): boolean {
  return role === "system" || role === "assistant";
}

/* ------------------------------------------------------------------ *
 * 门 A —— 开头指纹:命中已知句式 → 前缀中性头(保留原前导空白)
 * ------------------------------------------------------------------ */

/**
 * 字符串是否以任一已知指纹开头(忽略前导空白)。
 *
 * 两类指纹:散文句式({@link KNOWN_CHANNEL_OPENINGS})与**标签形态的宿主标记**
 * ({@link startsWithAcpMarker})。后者是 2026-10-31 补的:上游把「assistant
 * 正文以 `<acp …>` 开头」也当成 agent 指纹,而它不是任何一句已知英文。
 */
export function matchesKnownOpening(text: string): boolean {
  const body = text.replace(/^\s+/, "");
  if (KNOWN_CHANNEL_OPENINGS.some((f) => body.startsWith(f))) return true;
  return ACP_MARKER_HEAD.test(body);
}

/** 给一条命中消息的文本前缀中性头:保留前导空白,中性头 + 空行 + 原文。 */
export function neutralizeText(text: string): string {
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const rest = text.slice(lead.length);
  return rest === "" ? text : `${lead}${WORKBUDDY_NEUTRAL_HEAD}\n\n${rest}`;
}

/**
 * 门 A:遍历所有消息,system/assistant 且开头命中已知指纹时前缀中性头。
 * 返回**新数组**,未命中的消息 / 未命中文本保持原样(不篡改正常请求)。
 */
export function neutralizeChannelFingerprints(
  messages: unknown[] | null | undefined,
): unknown[] | null | undefined {
  if (!Array.isArray(messages)) return messages;
  let changed = false;
  const out = messages.map((m) => {
    if (!m || typeof m !== "object" || Array.isArray(m)) return m;
    const msg = m as { role?: unknown; content?: unknown };
    if (!isScannedRole(msg.role)) return m;
    const content = msg.content;
    if (typeof content === "string") {
      if (!matchesKnownOpening(content)) return m;
      changed = true;
      return { ...msg, content: neutralizeText(content) };
    }
    if (Array.isArray(content)) {
      let any = false;
      const parts = content.map((part) => {
        if (!isTextPart(part)) return part;
        const t = part.text as string;
        if (!matchesKnownOpening(t)) return part;
        any = true;
        return { ...part, text: neutralizeText(t) };
      });
      if (!any) return m;
      changed = true;
      return { ...msg, content: parts };
    }
    return m;
  });
  return changed ? out : messages;
}

/* ------------------------------------------------------------------ *
 * 门 B —— 中段指纹:句读/子句处插 U+200B 零宽空格,截断任何精确子串指纹
 * ------------------------------------------------------------------ */

/**
 * 大写词之间的词内断点(如 `DeepSeek|Harness`、`Visual|Studio`)。
 *
 * ⚠️ 只按句读插是**不够的**:句读规则只在 `.!?。！？`、`,;` 处落点,
 * 而结尾无标点的裸产品名(DSH agent 提示首行 `… powered by DeepSeek Harness`,
 * 到文本结尾)一个句读都没有 → 指纹原封不动发出去,救援空转(参考插件 #113 实测)。
 * 这条规则在大写词之间插零宽:一句正常散文里很少有两个大写词相邻,除非是
 * 专有名词 —— 而打断专有名词正是这里的意图。
 */
const WORD_INTERNAL_BREAK = /([A-Z][A-Za-z0-9]*)(\s+)(?=[A-Z][A-Za-z0-9])/g;

/**
 * 标签名后的断点:`<acp tokens="…">` → `<acp\u200b tokens="…">`。
 *
 * 为什么需要:上面三条规则全部以**散文**为前提 —— 句读要 `. ! ? , ;`,大写词
 * 边界要两个大写词相邻。宿主注入的 ACP 标记 `<acp tokens="1.7K" type="text">
 * m35968</acp>` 里一个句读都没有、全小写,四条规则一条都不落,标记原样发给
 * 上游(2026-10-31 实测 11128)。标签的天然断点在**标签名与属性之间**,补这一条。
 *
 * 保守约束:要求标签名后紧跟空白 / `>` / `/`,避免把 `x<y1` 这种普通比较式
 * 当成标签切开(insert 一个零宽对模型无意义,但没必要动正常文本)。
 */
const TAG_NAME_BREAK = /<(\/?[A-Za-z][A-Za-z0-9-]{0,40})(?=[\s/>])/g;

/** 属性名与 `=` 之间的断点(`tokens=` → `tokens\u200b=`),同上为标签形态服务。 */
const TAG_ATTR_BREAK = /(\s)([a-z][a-z0-9-]{0,30})=(?=["'])/g;

/**
 * 插零宽空格:句读(西文须后随空白)、子句逗号、中文句读、大写词边界(镜像插件
 * #113)、标签名/属性边界(2026-10-31 补,见 {@link TAG_NAME_BREAK})。
 *
 * 幂等:已含 U+200B 的文本原样返回,重试不会叠加扰动。
 */
export function perturbText(text: string): string {
  if (text.includes("\u200b")) return text;
  return text
    .replace(/([.!?])(\s+)/g, "$1\u200b$2")
    .replace(/([。！？])/g, "$1\u200b")
    .replace(/([,;])(\s+)/g, "$1\u200b$2")
    .replace(WORD_INTERNAL_BREAK, "$1\u200b$2")
    .replace(TAG_ATTR_BREAK, "$1$2\u200b=")
    .replace(TAG_NAME_BREAK, "<$1\u200b");
}

/**
 * 门 B:遍历所有消息,对 system/assistant 的每个 text part 在句读/子句/大写词
 * 边界处插零宽空格。
 * 词一个都不改、对读者不可见 —— 但任何精确子串指纹都会被截断。
 * 返回**新数组**(只要扫过就产生新对象,调用方自行决定何时启用)。
 */
export function perturbChannelFingerprints(
  messages: unknown[] | null | undefined,
): unknown[] | null | undefined {
  if (!Array.isArray(messages)) return messages;
  const out = messages.map((m) => {
    if (!m || typeof m !== "object" || Array.isArray(m)) return m;
    const msg = m as { role?: unknown; content?: unknown };
    if (!isScannedRole(msg.role)) return m;
    return { ...msg, content: withTexts(msg.content, (t) => perturbText(t)) };
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * 判定与回显
 * ------------------------------------------------------------------ */

/**
 * 错误 detail 是否属于渠道校验(11128 一族)。
 *
 * ⚠️ 2026-10-22 按参考插件 #113 改为**按 code 判定一族**:上游把同一个
 * 11128 复用于族内三个门(提示指纹 / conversation id missing / first message
 * is not system prompt),而 `msg` 措辞**不可信** —— #113 实测一条内容拒绝
 * 的 msg  literally 写着 `conversation id missing`,而三个会话头全都带着。
 * 旧实现按措辞排除,导致该 body 被判成普通 client → 网关的
 * neutralize/perturb 重试阶梯根本没跑,用户只拿到「请求错误」。
 *
 * 现在:code 命中即入族(重试阶梯照跑),成员判定交给 {@link channelGateMemberOf}
 * (只决定文案建议,不影响是否救援)。`"渠道校验"` 等中文措辞保留,兼容我们
 * 自己 classify_workbuddy_error 产出的 detail。
 */
export function isChannelRejectDetail(detail: string): boolean {
  return (
    /"code"\s*:\s*11128(?!\d)/.test(detail) ||
    /code\s+11128(?!\d)/.test(detail) ||
    /(?<!\d)11128(?!\d)/.test(detail) ||
    detail.includes("渠道校验") ||
    detail.includes("channel_reject") ||
    detail.includes("不是官方客户端") ||
    detail.includes("conversation id missing") ||
    detail.includes("first message is not system prompt")
  );
}

/** 11128 一族的三个门(与参考插件 #113 同枚举)。 */
export type ChannelGateMember = "prompt" | "headers" | "first_message" | "unknown";

/**
 * 哪个门拦的(镜像插件 channelGateMemberOf):用**我们自己的证据**点名,
 * 不信上游措辞。detail 只影响建议文案,不影响是否走重试阶梯。
 */
export function channelGateMemberOf(detail: string): ChannelGateMember {
  const lower = detail.toLowerCase();
  if (lower.includes("unapproved channel") || lower.includes("illegal api invocation")) return "prompt";
  if (lower.includes("conversation id missing")) return "prompt";
  if (lower.includes("first message is not system prompt")) return "first_message";
  return "unknown";
}

/** 从**宿主原始**消息里读每条 system/assistant 的首行(上限 3 条,供回显)。 */
export function systemOpeningsOf(
  messages: unknown[] | null | undefined,
  limit = 3,
): string[] {
  if (!Array.isArray(messages)) return [];
  const out: string[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const msg = m as { role?: unknown; content?: unknown };
    if (!isScannedRole(msg.role)) continue;
    for (const t of eachTextOf(msg.content)) {
      const line = t.trim().split("\n")[0] ?? "";
      if (line === "") continue;
      out.push(`${msg.role}:${line.slice(0, 120)}`);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** 渠道校验失败时的完整用户文案(带命中的提示开头,读的是宿主原文)。 */
export function channelRejectMessage(messages: unknown[] | null | undefined): string {
  const openings = systemOpeningsOf(messages);
  const hits = openings.length > 0 ? `命中的提示开头:${openings.map((o) => `「${o}」`).join("、")}。` : "";
  return `${hits}${CHANNEL_REJECT_TIP}`;
}

/* ------------------------------------------------------------------ *
 * 归属判定:哪些 provider 吃这一套(闸门 + workbuddy 线格式)
 * ------------------------------------------------------------------ */

/**
 * 是否属于 WorkBuddy —— **只看 `protocol`**,一条:`protocol === "workbuddy"`。
 *
 * 这一个判据同时决定三件事(它们本就是同一件事:这个 provider 是不是真的
 * 在跟腾讯 workbuddy 后端说话):
 * - 走 workbuddy **线格式**(定制报文 `buildWorkbuddyBody` + XML 工具副本 +
 *   区域端点 `/v2/chat/completions`);
 * - 挂**渠道校验闸门**({@link ../../../gateway-upstream-peers} 里的
 *   `postWorkbuddyWithGate` 三级阶梯:原文 → 中性头 → 零宽扰动);
 * - 做**提示词覆盖**({@link neutralizeChannelFingerprints} /
 *   {@link perturbChannelFingerprints})。
 *
 * ⚠️ 2026-10-31 用户定案,**收回 2026-10-28「按名字放宽」**:名字里带
 * `workbuddy` / 独立 `wb` 词元的 provider 不再自动吃闸门与提示词改写。
 * 理由是上游把那个问题解决掉了 —— 用户自建的 `workbuddy_yn`(protocol=openai、
 * base_url 指向转售站)现在**按普通 OpenAI 走就行**;网关没有资格因为一个
 * provider 起了什么名字,就去改写别人的提示词。
 *
 * 历史(两次事故,别再走回去):
 * - 只看名字 → `workbuddy_yn` 被套 workbuddy 定制报文 → 上游 401「认证失败」;
 * - 改成「线格式按 protocol、闸门按名字」→ 不再 401,但它背后若是真 workbuddy
 *   后端就会回 11128 渠道校验。现在两边都统一成 protocol,不再分叉。
 */
export function isWorkbuddyWire(protocol: string | null | undefined): boolean {
  return protocol === "workbuddy";
}
