/**
 * setupAsOne —— 纯函数装配(不依赖 ctx / DSH 服务,直接拿 dirs 参数)。
 *
 * 把「配置加载 + 凭据库 + DB 打开 + Scheduler/Router 构造 + resolveUpstream
 * 注入 + 模型列表」提炼成与 apps/electron/src/main/assembly.ts 相同接线顺序
 * 的组装,但**不建 http.Server、不开面板** —— 输出由 src/index.ts 的
 * ctx.webServer 路由消费。这样宿主半可被 vitest 冒烟测(不碰真实 DSH)。
 *
 * ⚠️ **parity 纪律**:本文件是 electron `assembly.ts` 的镜像。装配顺序与注入
 * 的每一项都要对齐(会话粘性、重试策略、连接超时、思考强度能力表、逻辑模型
 * 输出上限、sensenova 账号池、请求日志/统计)。任何一侧改了接线,另一侧必须
 * 同步 —— 否则「同一个库,桌面版和插件版行为不一致」。
 */
import { type NexusDatabase } from "@as-one/core/src/db/database.js";
import { ProviderRegistry } from "@as-one/core/src/config/providers.js";
import { CredentialVault } from "@as-one/core/src/config/credentials.js";
import { Scheduler } from "@as-one/core/src/scheduler/engine.js";
import { Router } from "@as-one/core/src/router/router.js";
import type { KeyProvider, ModelEntry, RequestDoneInfo, Upstream } from "@as-one/core/src/gateway/types.js";
import { type ContentMode } from "@as-one/core/src/request-log/index.js";
import { AppSchedulerRepo } from "./repo.js";
/** sensenova key 自愈结果(与 `@as-one/panel` 的 `PanelBundle["snRepairKey"]` 同形)。 */
export interface SensenovaKeyRepairResult {
    ok: boolean;
    message: string;
    created: boolean;
    dropped: string[];
}
export interface SetupAsOneOptions {
    /** 配置目录:放 as-one.providers.json 等导入/导出文件。 */
    configDir: string;
    /** SQLite 文件路径(或 ":memory:")。 */
    dbPath: string;
    /** 请求明细日志目录(默认 `<configDir>/logs`,与 electron 同口径)。 */
    logDir?: string;
    /** 环境变量来源(默认 process.env),供 EnvKeyProvider 探测 ONE_API_KEY。 */
    env?: Record<string, string | undefined>;
}
export interface AsOneRuntime {
    configDir: string;
    dbPath: string;
    logDir: string;
    db: NexusDatabase;
    registry: ProviderRegistry;
    vault: CredentialVault;
    repo: AppSchedulerRepo;
    scheduler: Scheduler;
    router: Router;
    ledger: Router["ledger"];
    health: Router["health"];
    keyProvider: KeyProvider;
    /** 账户启用/停用 overlay(内存态;setAccountEnabled 写入,阶段二再持久化)。 */
    accountOverlay: Map<string, boolean>;
    resolveUpstream: (model: string) => Upstream | undefined;
    listModels: () => ModelEntry[];
    /**
     * 请求完成 → 明细日志 + stats_daily 聚合(与 electron `logRequestDone` 同口径)。
     *
     * ⚠️ 面板的「用量统计」只读 `stats_daily`;不调这里,统计页永远是空的。
     */
    onRequestDone(info: RequestDoneInfo): void;
    /** 密钥在场表:repo 的 hasSecret 需同步读,装配时一次性探测(不碰明文)。 */
    secretPresence: Map<string, boolean>;
    /** 把库里的最新状态重新投影进注册表(面板写库之后调用,索引即时对齐)。 */
    syncRegistry(): void;
    startedAtMs: number;
    /**
     * sensenova key 自愈的**注册口** —— 面板构造完之后由 `panel-host.ts` 挂上来。
     *
     * 为什么要有这个口:自愈要跑登录 + 建 key(依赖 `PanelContext.vault` 与
     * `snCred` 闭包),只能活在 `createPanel` 里;而网关注入点
     * (`onSensenovaKeyInvalid`)在 `setupAsOne` 里 —— 两个作用域不互通。插件宿主
     * 先 `setupAsOne` 再 `createPanelHost`,于是用一个可变槽搭桥(与 electron
     * `assembly.ts` 的模块级 `sensenovaKeyRepair` 同一手法)。
     *
     * 未注册时网关侧静默跳过自愈:当轮请求照常按 auth 失败处理(落冷却/换档)。
     */
    setSensenovaKeyRepair(fn: ((username: string, reason: string) => Promise<SensenovaKeyRepairResult>) | null): void;
    dispose(): void;
}
/**
 * 用库里 sensenova 凭据(有 secret=api key 的行)重灌连接器账号池。
 *
 * ⚠️ `setAccounts` 是**整池替换**:同名账号保留运行态(冷却/健康/滚动计数是
 * 运行事实,不能因凭据刷新归零),已删除的账号从池里摘掉。
 */
export declare function syncSensenovaPool(vault: CredentialVault): Promise<void>;
export declare function setupAsOne(options: SetupAsOneOptions): Promise<AsOneRuntime>;
/** 供测试/装配复用:把内容档位设定读成 `ContentMode`。 */
export type { ContentMode };
