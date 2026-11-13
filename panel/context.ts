/**
 * 面板域的共享上下文 —— 装配层注入给各域工厂的唯一入口。
 *
 * 为什么单独抽成一个包(`@as-one/panel`):Electron 与 DSH 插件要把同一套
 * 管理面板(逻辑模型 / 渠道 / 账号池 / 用量 / 设置)挂出来,过去面板逻辑长在
 * `apps/electron/src/main/assembly.ts` 里,插件只能各写一份精简版,两边必然漂移。
 * 现在面板域只认这里的 `PanelContext`,谁来装配(Electron 主进程 / 插件宿主进程)
 * 就由谁提供实现。
 *
 * 字段全部来自 `@as-one/core`,只有 `GatewayState` 是面板自己定义的可变状态对象
 * (重启网关后要能被面板看到,所以是引用不是快照)。
 */
import type { NexusDatabase } from "@as-one/core/src/db/database.js";
import type { ProviderRegistry } from "@as-one/core/src/config/providers.js";
import type { CredentialVault } from "@as-one/core/src/config/credentials.js";
import type { Scheduler } from "@as-one/core/src/scheduler/engine.js";
import type { Router } from "@as-one/core/src/router/router.js";
import type { InflightLedger as RouterLedger } from "@as-one/core/src/router/inflight-ledger.js";
import type { HealthRegistry as RouterHealthRegistry } from "@as-one/core/src/router/health.js";
import type { KeyProvider } from "@as-one/core/src/gateway/types.js";

/**
 * 网关运行时状态(可变对象,装配层与面板共享同一个引用)。
 *
 * `gateway` 为 null 表示当前没有监听(首次绑定失败或重启中);`error` 是最近
 * 一次失败原因。面板的 `ready/reason` 与托盘的「网关运行中 …」都读它 ——
 * 重启网关后不需要重建面板,状态自然跟着变。
 */
export interface GatewayState {
  gateway: { port: number; close(): Promise<void> } | null;
  error: string | null;
}

export interface PanelContext {
  db: NexusDatabase;
  registry: ProviderRegistry;
  vault: CredentialVault;
  scheduler: Scheduler;
  router: Router;
  ledger: RouterLedger;
  health: RouterHealthRegistry;
  keyProvider: KeyProvider;
  /**
   * 网关运行时状态(可变引用)。
   *
   * 用对象引用而不是两个标量,是因为「重启网关」会在面板已创建之后
   * 换掉 gateway 实例 —— 标量会被域工厂的闭包按值捕获,重启后
   * 面板仍报旧状态。
   */
  gatewayState: GatewayState;
  gatewayHost: string;
  /**
   * 重启网关的实现(装配层持有,面板只转发)。
   *
   * 放 ctx 里而不是让面板自己 close/start:startGateway 需要完整
   * `gatewayOptions`(keyProvider/modelProvider/resolveUpstream/onRequestDone
   * 等闭包),那份配置只有装配层有;面板再造一份必然漏字段。
   */
  restartGateway: () => Promise<string>;
  startedAtMs: number;
  accountOverlay: Map<string, boolean>;
  configDir: string;
  dbPath: string;
  /**
   * 密钥在场表(`"<provider>/<username>" → true`)。
   *
   * `vault.secret` 是异步 API,而面板读数路径全是同步的(契约方法不是 async),
   * 所以装配时一次性探测完各账号的密钥在场情况,同步读这里。
   */
  secretPresence: Map<string, boolean>;
  /**
   * 把库里的最新状态重新投影进注册表索引(面板写库之后调用)。
   *
   * 数据库是唯一真源,但 scheduler / gateway / 面板读数仍走
   * `registry.getXxx` 这套查找 API —— 写完库不刷新索引,就会出现
   * 「库里已删、页面还在」。每个写入方法在 `scheduler.invalidate()` 旁边
   * 一并调用本函数。
   */
  syncRegistry: () => void;
}
