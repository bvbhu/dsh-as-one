/**
 * client 半 —— DSH 客户端服务契约的结构镜像(零 Node 类型)。
 *
 * 与宿主半 src/context-types.ts 不同,这里镜像的是 DSH 客户端注入的
 * 服务(dsh-client-locale / dsh-client-ui-slots 提供的 slots / locale /
 * layout)。运行时不 import 任何 @deepseek-ai 包,服务实例由 DSH
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
    inject: () => Record<string, unknown>;
}
export type AsOneSlotEntrySpec = AsOneSidebarEntrySpec | AsOneMainEntrySpec;
export type AsOneSlotName = "sidebar.panellist" | "main";
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
export interface AsOnePanelInfo {
    getSnapshot(): {
        activePanelId: string | null;
    };
    subscribe(callback: () => void): () => void;
}
export interface AsOneLayoutService {
    panelInfo: AsOnePanelInfo;
    selectPanel(panelId: string | null): void;
}
declare module "cordis" {
    interface Context {
        slots: AsOneSlotsService;
        locale: AsOneLocaleService;
        layout: AsOneLayoutService;
    }
}
export type { Context } from "../context-types.js";
