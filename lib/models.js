/**
 * /v1/models 的条目构建 —— 转口到唯一真源。
 *
 * ⚠️ 这里以前是一份**逐字副本**(Electron `apps/electron/src/main/assembly.ts` 里
 * 另有一份),漂移过一次:插件版不过滤 `hidden`、逻辑模型一个能力字段都不带,
 * 于是同一个「藏起来」的勾选在独立应用里生效、在插件里漏出去(2026-10-30 修)。
 * SQLite 是唯一真源,清单口径也必须是唯一真源 —— 现在两个宿主都从
 * `@as-one/panel/src/modelcatalog.js` 取同一份实现,显示名去重(用户 m44638)
 * 也只改一处。
 *
 * 保留这个文件只为不动调用方(`setup.ts` 的 import 路径)。
 */
export { listModelEntries, providersWithCredentials, dedupeLabels, } from "@as-one/panel/src/modelcatalog.js";
//# sourceMappingURL=models.js.map