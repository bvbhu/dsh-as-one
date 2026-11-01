/**
 * DSH `ctx.llm` 的**结构镜像**(零运行时依赖)。
 *
 * 为什么是镜像而不是 `import type { … } from "@deepseek-ai/dsh-llm"`:
 * 插件包的 dependencies 里没有也不需要那个包(宿主提供),一旦 import 就会
 * 在 tsc 与 esbuild 两处都变成硬依赖。宿主是鸭子类型校验的(零 `instanceof`),
 * 所以只要形状对得上就成立。
 *
 * 事实来源(逐条核对过,勿凭记忆改):
 * - `dsh-llm/lib/types/invariant.js` validateStream —— 流语法;
 * - `dsh-llm/lib/index.js` registerAdapter / normalizeModelInfo /
 *   normalizeLlmFailure —— 注册与元数据校验;
 * - `dsh-llm-deepseek/lib/index.js` —— 唯一可参考的真实 adapter 实现。
 */
export {};
//# sourceMappingURL=llm-types.js.map