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
export {};
//# sourceMappingURL=context-types.js.map