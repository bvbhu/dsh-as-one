/**
 * 网关自身 API Key 鉴权 —— 对齐 `nexus/gateway/auth.py`(107 行)逐条语义:
 *
 * 1. **三种携带方式都接受**(按优先级,auth.py:101-109 `_extract`):
 *    `Authorization: Bearer <key>`(或裸值)/ `x-api-key` 头 / `?key=` query
 *    (最后这个给浏览器面板用 —— 地址栏没法带自定义头)。
 * 2. **常量时间比较**(`secrets.compare_digest`,auth.py:132):`==` 按字符短路,
 *    理论上可被计时侧信道逐字节猜出。
 * 3. **未配置时不硬拦**(2026-10-17 用户定案,auth.py:15-17/123-131):key 来源
 *    为空 → 打一条**一次性** WARNING 但**所有请求放行**(不 401);配置了则
 *    缺 key / 错 key 一律 **401**(Nexus 没有用 403 —— auth_env 测试全部只断 401)。
 * 4. **每次现读、不缓存**(auth.py:60-68 `current_key`):换 key 立即生效,
 *    不存在要清理的进程内副本。空白值按**未设置**处理(test_gateway_auth_env
 *    `test_blank_env_value_counts_as_unset`)。
 *
 * key 的来源由注入的 {@link KeyProvider} 给出:
 * - 阶段一(独立 Electron 应用)= 环境变量/配置文件({@link EnvKeyProvider});
 * - 阶段二(DSH 插件)= 进程内随机密钥(真实上游 token 永不出进程,
 *   docs/dsh-plugin-reference-research.md 的 loopback shim 同款边界)。
 *
 * ⚠️ 零第三方依赖;node:crypto timingSafeEqual 做常量时间比较。
 */

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { EnvKeyProvider, type GatewayErrorBody, type KeyProvider } from "./types.js";

export { EnvKeyProvider };
export type { KeyProvider };

/** 401 响应体(Nexus `HTTPException(401, detail="缺少或错误的网关 key")`,auth.py:133)。 */
export const AUTH_ERROR_DETAIL = "缺少或错误的网关 key";

/** 未配置告警文案(文案三要素:变量名 / 无鉴权放行 / 怎么恢复,auth_env 断言口径)。 */
export function missingKeyWarning(source: string): string {
  return (
    `未设置 ${source} —— 网关当前无鉴权:所有请求放行。` +
    `设置它并重启网关即恢复鉴权。`
  );
}

/**
 * 提取请求携带的 key(对齐 auth.py `_extract` + query 兜底):
 * `Authorization` 优先(Bearer 前缀剥掉,裸值也收),其次 `x-api-key`,
 * 最后 `?key=` query。
 */
export function extractPresentedKey(req: {
  headers: IncomingMessage["headers"];
  url?: string;
}): string {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.length > 0) {
    const text = authorization.trim();
    if (text.toLowerCase().startsWith("bearer ")) return text.slice(7).trim();
    return text;
  }
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey.length > 0) return xApiKey.trim();
  const url = req.url ?? "";
  const qIndex = url.indexOf("?");
  if (qIndex !== -1) {
    const query = new URLSearchParams(url.slice(qIndex + 1));
    const key = query.get("key");
    if (key) return key.trim();
  }
  return "";
}

/** 常量时间字符串比较(等长才可比;长度差直接不等 —— 与 compare_digest 语义一致)。 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // 仍做一次耗时的比较,抹平「长度不同直接 false」的时长差
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** 鉴权结果:`ok=true` 放行;否则带 401 响应体。 */
export type AuthResult =
  | { ok: true; presentedKey: string }
  | { ok: false; status: 401; body: GatewayErrorBody };

/**
 * 校验一次请求的 key(require_key 的纯函数形态,方便测试与宿主复用)。
 *
 * - `keyProvider.getKey()` 空(未配置)→ 放行 + 触发一次性告警;
 * - 带对了 → 放行;
 * - 缺 key / 错 key → 401 `{"detail": "缺少或错误的网关 key"}`。
 */
export function checkAuth(req: { headers: IncomingMessage["headers"]; url?: string }, keyProvider: KeyProvider): AuthResult {
  const expected = (keyProvider.getKey() ?? "").trim();
  const presented = extractPresentedKey(req);
  if (!expected) {
    warnMissingKeyOnce(keyProvider);
    return { ok: true, presentedKey: presented };
  }
  if (!presented || !constantTimeEqual(presented, expected)) {
    return { ok: false, status: 401, body: { detail: AUTH_ERROR_DETAIL } };
  }
  return { ok: true, presentedKey: presented };
}

/**
 * require_key 的请求级入口:返回 null 表示放行,否则返回要发的 401 响应。
 * (FastAPI `Depends(require_key)` 在 as-one 里没有框架依赖注入,
 * 由 server.ts 在每个 /v1/* 路由入口显式调用。)
 */
export function requireKey(
  req: { headers: IncomingMessage["headers"]; url?: string },
  keyProvider: KeyProvider,
): { status: 401; body: GatewayErrorBody } | null {
  const result = checkAuth(req, keyProvider);
  return result.ok ? null : { status: result.status, body: result.body };
}

// ---------------------------------------------------------------------------
// 「未配置」一次性告警(auth.py:_warn_missing 的进程级标志)
// ---------------------------------------------------------------------------

let warnedMissing = false;

/** 复位一次性告警标志(测试用;Nexus 测试也是显式复位 `auth._warned_missing`)。 */
export function resetMissingKeyWarning(): void {
  warnedMissing = false;
}

function warnMissingKeyOnce(keyProvider: KeyProvider): void {
  if (warnedMissing) return;
  warnedMissing = true;
  const source =
    keyProvider instanceof EnvKeyProvider
      ? (keyProvider as unknown as { envVarName?: string }).envVarName ?? "ONE_API_KEY"
      : "网关 key 来源";
  const message = missingKeyWarning(source);
  const emit = keyProvider.onMissingKeyWarning ?? ((msg: string) => console.warn(msg));
  emit(message);
}
