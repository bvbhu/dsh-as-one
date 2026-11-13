/**
 * 跨层契约(renderer / preload / main / 插件 client 共用 type-only)。
 *
 * 真实定义在 `@as-one/panel/src/types`(共享面板包),这里只做转出,
 * 使视图层内部的相对 import(`./types`)保持简单。
 */
export * from "@as-one/panel/src/types.js";
