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
 * 输入框上方那条 dock(`conversation.input.dock`,list 型)。
 *
 * 用它而不是 `conversation.composer.bar`:后者是 **single** 槽位且已被默认
 * 输入框本体占用,再注册会把默认输入框挤掉。dock 是 list,允许多个条目挂
 * 在输入框上方的同一行(宿主把该槽位渲染在 inputBar **之前**),是「真实
 * 模型胶囊」这类状态行的正确座位。
 */
export interface AsOneDockEntrySpec {
    name: "conversation.input.dock";
    id: string;
    order: number;
    locale?: string;
    priority?: number;
    /** 宿主按会话 id 调用它注入 props(`session-maybe` 会话作用域)。 */
    inject?: (sessionId: string) => Record<string, unknown>;
}
export type AsOneSlotEntrySpec = AsOneSidebarEntrySpec | AsOneMainEntrySpec | AsOneDockEntrySpec;
export type AsOneSlotName = "sidebar.panellist" | "main" | "conversation.input.dock";
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
