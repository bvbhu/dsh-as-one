/**
 * 供应商级「每凭据并发」缺省 —— 2026-11-08 并发语义改口后新增。
 *
 * ⚠️ **语义**（用户原话：「修改并发设置的含义，改为按凭据记，即并发设置为 1，
 * 三个凭据就可以三并发」）：`concurrency` 是**每个凭据**同时能跑几个请求；
 * 同一个真实模型下 N 个凭据的总并发 = `N × concurrency`（不再共用一份）。
 * 占用键是端点（`provider/model@username`），见 `router/inflight-ledger.ts`
 * 与 `scheduler/engine-health.ts` 的头注释。
 *
 * ⚠️ **改过默认值要同步的地方**（都走 {@link defaultConcurrencyOf}，别再写死 1）：
 * - `packages/dsh-plugin/src/repo.ts`（运行态端点行，db 没行时兜底）
 * - `apps/electron/src/main/core-repo.ts`（同上，桌面端）
 * - `packages/core/src/scheduler/engine.ts`（InMemoryProviderRegistry，测试夹具）
 * - `packages/core/src/router/types.ts`（EndpointData 归一化兜底）
 * - `packages/panel/src/models.ts`（手工登记新模型时的库初值）
 *
 * 逐渠道缺省（2026-11-08 用户定案：**除 sensenova / workbuddy 外统一 3**）：
 *
 * | 渠道 | 缺省 | 理由 |
 * |---|---|---|
 * | sensenova | **1** | 连接器硬约束：`connectors/sensenova-pool.ts` 每账号
 *   `maxSockets: 1` 的钉连接 + `SensenovaAccountRuntime.inflight` 单账号单并发；
 *   上游按 TPM/RPM 分钟窗限流。抬高只会堆请求，不会更快。 |
 * | workbuddy | **2** | `docs/workbuddy-alignment.md` §2.2 / R3：panel 的
 *   `pool.max_in_flight_global` 缺省 2，理由「国际版 WAF 风控更紧」。属工程经验
 *   而非抓包实锤，保持不动。 |
 * | 其余全部 | **3** | 用户定案。新语义下总并发 = 凭据数 × 3；此前全局 1 过于
 *   保守（trae / qoder / minimax / openai 兼容等渠道均**未找到**上游并发上限的
 *   公开证据，当时按「没证据就别抬」取了 1）。现在改为先给一个可用的中位值，
 *   出现 429 再由用户在部署页按实际上游调低。 |
 *
 * ⚠️ 这档只是**兜底**：`db.real_model.concurrency`（部署页输入即存）> 配置文件
 * `realModels[].concurrency` > 本表。用户显式配了值永远以用户为准。
 *
 * ⚠️ `sensenova: 1` 必须显式写进表里：它以前是靠全局缺省 1「蹭」到的，全局抬到
 * 3 后不钉住就会跟着变 3，直接违反连接器的单并发硬约束。
 */

/** 没有供应商专属缺省时的每凭据并发：3（2026-11-08 用户定案）。 */
export const DEFAULT_CONCURRENCY = 3;

/** 供应商 → 每凭据并发缺省（表内为例外；表外回落 {@link DEFAULT_CONCURRENCY}）。 */
export const PROVIDER_CONCURRENCY_DEFAULTS: Readonly<Record<string, number>> = {
  // 硬约束:每账号 maxSockets=1,抬并发没有意义。
  sensenova: 1,
  // 风控:国际版 WAF 更紧,保持 2。
  workbuddy: 2,
};

/**
 * 某供应商的每凭据并发缺省。
 *
 * ⚠️ **只作兜底**：db.real_model.concurrency（部署页输入即存）> 配置文件
 * `realModels[].concurrency` > 本函数。用户显式配了值就以用户为准。
 */
export function defaultConcurrencyOf(provider: string): number {
  const hit = PROVIDER_CONCURRENCY_DEFAULTS[provider];
  if (hit === undefined) return DEFAULT_CONCURRENCY;
  return Number.isFinite(hit) && hit >= 1 ? Math.trunc(hit) : DEFAULT_CONCURRENCY;
}
