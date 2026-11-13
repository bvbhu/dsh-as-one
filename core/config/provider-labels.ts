/**
 * provider id → 界面展示名(人话)的**服务端**映射(2026-11-07 用户定案)。
 *
 * ## 为什么单独一个文件
 *
 * 之前的人话名查询散在两处、各带一份:`packages/panel/src/panel.ts` 的
 * `checkinLabelOf`(签到页)和 `packages/panel-ui/.../ChannelsPage.tsx` 的 `CARDS`。
 * 徽标(`conversation.input.left`)也要用它。散着写必然慢慢漂移 —— 同一个
 * `qoder` 在两处写成不一样的名字,是迟早的事。所以这里收成一份,**服务端侧
 * 只此一处**。
 *
 * ## 设计纪律
 *
 * - **查不到就原样返回 id**,绝不编名。这是硬约束:`provider` 表可能来自
 *   用户自建档 / 内部扫描器,里面的 id 不在内建表里。这种渠道与其给它起个
 *   「好听」的名字,不如保持 id 原样 —— 编出去的名字是界面在撒谎。所以
 *   未知 provider 的行为与今天完全一致(显示裸 id),只有已知渠道变成人话。
 * - **纯展示、零依赖**:不 import 任何 node / 网络 / 文件模块。panel、
 *   dsh-plugin host 都能安全引用;**client bundle 不要 import 它** —— 徽标
 *   拿的是服务端填好的 `SessionCurrentRoute.provider_display_name`,不走网络
 *   之外的第二条数据通路。
 *
 * 已收录的名字来自盘点:面板/管理界面里人工写过的那几个渠道(`panel.ts` 的
 * `checkinLabelOf`、`ChannelsPage.tsx` 的 `CARDS` 注释与文案)。清单只增不减,
 * 新增渠道时在这里补一行即可。
 *
 * ## 与「唯一映射」的边界(读这段再改代码)
 *
 * 这份 map **服务端/宿主专用**:`packages/panel`(路由装配、签到标签)与
 * dsh-plugin 宿主在这里取人话名。**client bundle(`dsh-plugin/lib/client.js`)
 * 不 import 它** —— 徽标的人话名是服务端填进 `SessionCurrentRoute` 的字段,
 * 客户端只负责挑一个字段显示。这样 browser 包永远不含 node 依赖(能被
 * `scripts/bundle-client.mjs` 安全打进浏览器),也不会出现「客户端猜的名字」
 * 和「服务端猜的名字」打架。
 *
 * 另有两处**不在这里**的名字,别混淆:
 * - **逻辑模型的显示名** —— 它是 `logical_model.display_name`(用户自填),
 *   见 `packages/panel/src/overview.ts` 的 `routeOf`;
 * - `OpenRouter` —— 用户点名过的已知渠道名,但它不在本机渠道页里(走的是
 *   `openrouter/free` 中转),所以只登记「id → 人话」这一行,不附带任何选择逻辑。
 *
 * 由此而来的一处**已知重复**:`packages/panel-ui/src/pages/models/ChannelsPage.tsx`
 * 的 `CARDS` 里还有一份 `provider → 导航卡标题` 常量。panel-ui **没有运行时依赖**
 * `@as-one/core`(它只收到 `@as-one/panel` 的类型);给它加 core 依赖会动
 * `pnpm-lock.yaml`,还让 browser 包直接拉进 core,收益(少写四行标注)不值得。
 * 所以那里暂不合并 —— **改渠道名时记得两边一起改**。
 */

/** provider id → 人话展示名。只增不减;键必须与 `provider.id` 完全一致。 */
export const PROVIDER_DISPLAY_NAMES: Readonly<Record<string, string>> = Object.freeze({
  trae: "Trae",
  workbuddy: "WorkBuddy",
  qoder: "Qoder",
  minimax: "MiniMax",
  sensenova: "SenseNova",
  openrouter: "OpenRouter",
});

/**
 * 取 provider 的人话展示名;未知 provider **原样返回**(宁可显示 id,不可编名)。
 *
 * `provider` 为空串时返回空串 —— 调用方据此判断「这份路由没有供应商信息,
 * 别画那枚标签」,不要把它当成「有名字,只是空」。
 */
export function providerDisplayName(provider: string): string {
  if (provider === "") return "";
  return Object.prototype.hasOwnProperty.call(PROVIDER_DISPLAY_NAMES, provider)
    ? PROVIDER_DISPLAY_NAMES[provider]
    : provider;
}
