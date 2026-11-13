/**
 * 会话 id 解析 —— 会话亲和的前提。1:1 对齐 Nexus `gateway/session.py`。
 *
 * ## 为什么需要派生
 *
 * 实测 **DSH 一个会话标识都不发**:body 无 `metadata` / `user`,header 也没有
 * `x-litellm-session-id` / `x-session-id`。它内部**是有** `sessionId` 的
 * (= `session-<uuid>`)且一路透传到最后一跳,却被
 * `sendSessionAffinityHeaders = isOpenRouter` 关掉(自定义 baseURL 即 false)。
 *
 * 所以对 DSH 这类客户端,亲和必须**自己派生出**一个稳定的会话 id,否则
 * 「同一会话固定同一模型」根本不成立。
 *
 * ## 为什么取「首条 user 消息」而不是整段历史
 *
 * 长会话每轮历史都在变。用整段历史会每轮算出不同的 id → 亲和每轮失效,正好抵消
 * 派生本身的意义。**首条 user 消息在一场对话内恒定**,是天然的会话指纹。
 *
 * 客户端显式给了 id 就用它的 —— 不篡改别人的命名空间。
 */

/** 首条 user 消息取前多少字符参与哈希(避免超长消息的哈希开销)。 */
const HASH_LIMIT = 4000;

/** `message.content` → 可哈希文本(字符串 / 分片列表 / 多模态块)。 */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
      } else if (item !== null && typeof item === "object") {
        const text = (item as Record<string, unknown>)["text"];
        if (typeof text === "string") parts.push(text);
      }
    }
    return parts.join("\n");
  }
  return "";
}

/** SHA-256 十六进制串;拿不到 crypto 时退回一个稳定的 FNV-1a(仍保证同文同值)。 */
function sha256Hex(text: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = (globalThis as { require?: (id: string) => unknown }).require;
  try {
    if (typeof nodeCrypto === "function") {
      const mod = nodeCrypto("node:crypto") as { createHash?: (a: string) => { update(s: string, e: string): { digest(a: string): string } } };
      if (mod?.createHash) {
        return mod.createHash("sha256").update(text, "utf-8").digest("hex");
      }
    }
  } catch {
    /* 落到 FNV-1a */
  }
  // FNV-1a 32 位 × 8 轮 → 64 位十六进制(稳定性够用:只作会话亲和指纹)
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * 从对话首条 **user** 消息派生稳定会话 id(`lnx-<hash 前 32 位>`)。
 *
 * 返回 `""` 表示无法派生(无 messages / 无 user 消息)—— 调用方必须保持
 * 「没有会话 id」这个状态,**不要**写一个空串进去:那会让所有请求共用一个
 * 伪会话,亲和就变成了「全局锁」。
 */
export function deriveSessionId(messages: unknown, limit: number = HASH_LIMIT): string {
  if (!Array.isArray(messages)) return "";
  for (const msg of messages) {
    if (msg === null || typeof msg !== "object") continue;
    const role = (msg as Record<string, unknown>)["role"];
    if (String(role ?? "") !== "user") continue;
    const text = textOf((msg as Record<string, unknown>)["content"]).trim();
    if (!text) continue;
    const digest = sha256Hex(text.slice(0, limit));
    return `lnx-${digest.slice(0, 32)}`;
  }
  return "";
}

/**
 * 从请求体解析会话 id:显式声明优先,否则从首条 user 消息派生。
 *
 * 派生出来的 id **按逻辑模型隔离** —— 两个不同模型各自的首条 user 消息可能
 * 一模一样(比如都是「你好」),不隔离会让两个不相干的会话共用一条粘住记录,
 * 结果是它们被绑到同一个端点上互相挤占。
 *
 * @returns 会话 id;**`undefined` = 没有会话**(不是空串!)
 */
export function sessionIdOf(
  body: unknown,
  model = "",
): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const meta = b["metadata"];
  if (meta !== null && typeof meta === "object") {
    const value = (meta as Record<string, unknown>)["session_id"] ?? (meta as Record<string, unknown>)["user"];
    if (value) return String(value);
  }
  for (const field of ["litellm_metadata", "user"]) {
    const holder = b[field];
    if (holder !== null && typeof holder === "object") {
      const value = (holder as Record<string, unknown>)["session_id"];
      if (value) return String(value);
    }
  }
  const derived = deriveSessionId(b["messages"]);
  if (derived === "") return undefined;
  return model ? `${model}:${derived}` : derived;
}
