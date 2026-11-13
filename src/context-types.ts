/**
 * DSH 宿主侧服务形状的**结构镜像**(零 Node 类型 —— 可被 client 半引用)。
 *
 * 事实来源:.asar-out\dsh\node_modules\@deepseek-ai\dsh-host-webserver\lib\index.js
 * (真实宿主 WebServer 实现)与 dsh-usage-statistics-panel/src/context-types.ts。
 *
 * 已核实的 WebServer 契约:
 * - `register(route)`:route = { kind: 'exact'|'prefix', path, handler };
 *   重复 (kind, path) 直接 throw;返回 disposer(删表条目)。
 * - 匹配顺序:exact 表命中 → prefix 表最长前缀胜(pathname===prefix 或
 *   startsWith(`${prefix}/`))→ fallback(桌面包默认被 SPA dist 占据,勿用)。
 * - handler 抛错被宿主 catch → logger.warn + 若 headersSent 则 res.destroy(),
 *   否则 writeHead(400)+end —— **错误必须在自己 handler 里写 status/body**。
 * - gzip 中间件对 text/event-stream 不缓冲(compression filter 显式放行 SSE)。
 */

/** 请求侧(结构镜像 node IncomingMessage 的子集;body 走 async iterator)。 */
import type { Context } from "cordis";

export interface AsOneHttpRequest {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>;
}

/** 响应侧(结构镜像 node ServerResponse 的子集)。 */
export interface AsOneHttpResponse {
  statusCode: number;
  writeHead(status: number, headers?: Record<string, string>): void;
  write?(chunk: string | Uint8Array): boolean;
  end(body?: string | Uint8Array): void;
}

/** 宿主 webServer 接受的路由对象(与宿主 register 的参数同形)。 */
export interface AsOneWebRoute {
  kind: "exact" | "prefix";
  path: string;
  handler: (request: AsOneHttpRequest, response: AsOneHttpResponse) => void | Promise<void>;
}

/** 宿主 webServer 服务(ctx.webServer)。 */
export interface AsOneWebServer {
  register(route: AsOneWebRoute): () => void;
}

/**
 * 宿主 `llm` 服务(ctx.llm)—— 结构镜像,见 `llm-types.ts` 的 `DshLlmService`。
 * 这里重复声明一遍是为了让 `declare module "cordis"` 只依赖本地类型。
 */
export interface AsOneLlmService {
  registerAdapter(
    providers: string[],
    adapter: import("./llm-types.js").DshLlmAdapter,
  ): (() => void) & { replace(nextProviders: string[]): void };
}

/** 挂到 cordis Context 上:webServer + llm + DSH 生命周期 effect。 */
declare module "cordis" {
  interface Context {
    /** DSH 生命周期 API:回调立即执行,返回的 disposer 在 ctx 销毁时调用。 */
    effect(dispose: () => void | (() => void), label?: string): void;
    webServer: AsOneWebServer;
    llm: AsOneLlmService;
  }
}

export type { Context };
