/**
 * As One(合一)DSH 插件 —— client 半入口。
 *
 * cordis 插件形状(platform "web" 由 package.json 的 dsh.client 声明):
 * 注册 locale 字典、侧栏行(sidebar.panellist)与主面板(main)。
 *
 * 页面本体是共享视图层 @as-one/panel-ui(与 Electron 面板同一套代码);
 * 数据全部走文档相对 fetch(见 ./client/api.ts),不 import 任何宿主/Node 类型。
 */

import { bindPanelBridge } from "./client/api.js";
import { injectAsOneStyles } from "./client/styles.js";

import type { Context } from "./client/context.js";
import { LOCALE_NS, en, zh } from "./client/locales.js";
import { AsOnePanelIcon, AsOnePanelPage } from "./client/panel.js";
import { AsOneCurrentModelBadge } from "./client/routeBadge.js";

// 共享面板样式内联注入(幂等)+ 数据桥接到 HTTP 路由,使 lib/client.js 自包含。
injectAsOneStyles();
bindPanelBridge();

export const BUNDLE_NAME = "@bvbhu/as-one";
export const PANEL_ID = "as-one";
export const PANEL_ORDER = 30;

export const name = "@bvbhu/as-one/client";

/** client 侧依赖的服务座位(与 dsh.client.inject 的包一致)。 */
export const inject = ["slots", "locale"];

export function apply(ctx: Context, _config: Record<string, unknown> = {}): void {
  // ── locale 字典 ─────────────────────────────────────────────
  ctx.effect(() => ctx.locale.register(LOCALE_NS, "zh-CN", zh));
  ctx.effect(() => ctx.locale.register(LOCALE_NS, "zh", zh));
  ctx.effect(() => ctx.locale.register(LOCALE_NS, "en", en));
  const t = ctx.locale.bind(LOCALE_NS);

  // ── 侧栏行 + 主面板 ─────────────────────────────────────────
  ctx.effect(() =>
    ctx.slots.inject("sidebar.panellist", () =>
      ctx.slots.register(
        { name: "sidebar.panellist", id: PANEL_ID, order: PANEL_ORDER, label: () => t("nav"), locale: LOCALE_NS },
        AsOnePanelIcon,
      ),
    ),
  );
  ctx.effect(() =>
    ctx.slots.inject("main", () =>
      ctx.slots.register(
        { name: "main", key: PANEL_ID, locale: LOCALE_NS },
        AsOnePanelPage,
      ),
    ),
  );
  // 输入框**内部**的工具行:显示这个会话**当前请求**实际使用的真实模型。
  // 槽位与 dsh-connect 系列同一格(`conversation.input.left`,list 型、会话作用域),
  // `order` 排在 dsh-connect 的积分读数(4)之后,读起来是「模型在前、额度在后」。
  //
  // ⚠️ **不要在这里给 inject**:会话作用域的 `BUILTIN_SOURCE`
  // (`dsh-client-ui-session/lib/client.js`) 已经会把 `{ sessionId }` 与
  // `useProjection` 作为框架标准属性发给每个条目。再写一个
  // `inject: (sessionId) => ({ sessionId })` 只会让「宿主是否给 inject 传参」
  // 这个实现细节决定 `props.sessionId` 是真是假 —— 传空就把它覆盖成 undefined,
  // 徽标从此静默消失(不报错,最难查的那种)。
  ctx.effect(() =>
    ctx.slots.inject("conversation.input.left", () =>
      ctx.slots.register(
        {
          name: "conversation.input.left",
          id: "as-one-current-model",
          order: 5,
          locale: LOCALE_NS,
        },
        AsOneCurrentModelBadge,
      ),
    ),
  );
}
