/**
 * client 半 —— DSH 客户端服务契约的结构镜像(零 Node 类型)。
 *
 * 与宿主半 src/context-types.ts 不同,这里镜像的是 DSH 客户端注入的
 * 服务(dsh-client-locale / dsh-client-ui-slots 提供的 slots / locale)。
 * 运行时不 import 任何 @deepseek-ai 包,服务实例由 DSH
 * 客户端按 package.json 的 dsh.client.inject 列表注入到 ctx 上。
 */

export type AsOneSlotLabel = string | (() => string);

export interface AsOneSidebarEntrySpec {
  name: "sidebar.panellist";
  id: string;
  order: number;
  priority?: number;
  label: AsOneSlotLabel;
  locale: string;
}

export interface AsOneMainEntrySpec {
  name: "main";
  key: string;
  order?: number;
  priority?: number;
  locale: string;
  /** 组件额外 props 的提供者;不需要额外 props 时省略。 */
  inject?: () => Record<string, unknown>;
}

/**
 * 输入框卡片里的工具行(`conversation.input.left`,list 型、会话作用域)。
 *
 * 用它而不是 `conversation.input.dock`:dock 渲染在输入框**外面**(上方),
 * 用户 2026-11-01 明确否掉该位置;dsh-connect 系列(qoder / trae / workbuddy)
 * 的积分读数就在这条工具行里,徽标跟着走才叫"同一个位置"。
 *
 * ⚠️ 不要改用 `conversation.input.model.label`:那是 **single** 槽位(最低
 * priority 独占,已被 dsh-connect-qoder 占着),我们进去要么被它顶掉、要么
 * 顶掉它 —— 两条路都会让另一方的徽标消失。list 槽位各占一格,不打架。
 */
export interface AsOneInputEntrySpec {
  name: "conversation.input.left";
  id: string;
  order: number;
  locale?: string;
  priority?: number;
  // ⚠️ 刻意**不声明** inject:会话作用域的框架标准属性已经带 `sessionId` 与
  // `useProjection`(`dsh-client-ui-session` 的 `BUILTIN_SOURCE`),自己再注一次
  // 只会把「inject 有没有拿到参数」这个实现细节变成 props 的真假来源。
}

export type AsOneSlotEntrySpec =
  | AsOneSidebarEntrySpec
  | AsOneMainEntrySpec
  | AsOneInputEntrySpec;

export type AsOneSlotName = "sidebar.panellist" | "main" | "conversation.input.left";

export interface AsOneSlotsService {
  /** 声明一个槽位注入:槽位宿主回调时注册条目,返回的 dispose 由宿主负责。 */
  inject(name: AsOneSlotName, callback: () => () => void): void;
  /** 注册一个槽位条目(侧栏行或主面板),返回移除函数。 */
  register(spec: AsOneSlotEntrySpec, component: unknown): () => void;
}

export interface AsOneLocaleService {
  /** 注册单个语言的字典。 */
  register(namespace: string, locale: string, dict: Record<string, string>): () => void;
  /** 注册多语言字典表 {locale: dict}。 */
  register(namespace: string, dicts: Record<string, Record<string, string>>): () => void;
  /** 绑定命名空间,返回 (key) => string 的翻译函数。 */
  bind(namespace: string): (key: string) => string;
  getLocale(): string;
}

declare module "cordis" {
  interface Context {
    slots: AsOneSlotsService;
    locale: AsOneLocaleService;
  }
}

export type { Context } from "../context-types.js";
