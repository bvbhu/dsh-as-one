/**
 * 模型面板域 —— 从 assembly.ts 的 createPanel 闭包拆出(重构第六刀)。
 *
 * 职责:模型这一侧的全部读写 ——
 *   - 逻辑模型(抽象模型):`getLogicalModels` / `writeLogicalModel` /
 *     `removeLogicalModel`(成员有序 = priority,写库后 syncRegistry 即刻生效)
 *   - 模型部署列表与暴露:`getDeployments` / `setDeploymentExposure` /
 *     `setModelExposure`(真写 db.real_model.hidden,重启不丢)
 *   - 供应商侧:`getModelProviders` / `upsertModelProvider` /
 *     `removeModelProvider`(含密钥在场与逻辑模型成员摘除)
 *
 * 边界:
 *   - `realModelMap` / `modelViewOf` / `stripMemberFromLogicalModels`
 *     走 deps —— 它们也被渠道域与 sensenova 域用,留在 createPanel 一份,
 *     避免域间互引(纯映射函数本体在 assembly-modelview.ts)。
 *   - `logicalGroupsContaining` / `exposureOverlay` / `modelDayStats` 是本域私有,
 *     一起搬进来了。
 *   - 账户能力探测(`accountsWithKeySync` / `accountsWithKey`)属于渠道域
 *     产物,经 deps 取。
 */

import {
  normalizeStrategy,
} from "@as-one/core/src/config/types.js";
import { endpointIdOf, ORDER_STRATEGIES, wallNow } from "@as-one/core/src/scheduler/engine.js";
import { defaultConcurrencyOf } from "@as-one/core/src/config/concurrency-defaults.js";
import { orderRawLevels } from "@as-one/core/src/gateway/reasoning-effort.js";
import { parseModelEntries } from "@as-one/core/src/gateway/model-catalog.js";
import type { CatalogResult } from "@as-one/core/src/collector/catalog.js";
import type { StatsDailyRow } from "@as-one/core/src/db/types.js";
import { CH_CATALOG_PROVIDERS, KNOWN_PROTOCOLS, STRATEGY_LABELS } from "./constants.js";
import { membersFromInput, parseDbMembers, round1, splitRef } from "./utils.js";
import type { ModelView } from "./modelview.js";
import { realModelMapOf, serializeReasoningEfforts } from "./modelview.js";
import type {
  ApiResult,
  CatalogModel,
  DeploymentItem,
  DeploymentList,
  LogicalDeployment,
  LogicalModelGroup,
  LogicalModelsWriteInput,
  ModelProvider,
} from "./types.js";
import type { PanelContext } from "./context.js";

/** createPanel 传给模型域的闭包(都被别的域共用,所以留在 createPanel)。 */
export interface ModelsDomainDeps {
  /** 注册表投影(provider → Map<"provider/model", ModelView>)。 */
  realModelMap: (pid?: string) => Map<string, ModelView>;
  /** 单模型查找。 */
  modelViewOf: (provider: string, model: string) => ModelView | undefined;
  /** 从所有逻辑模型 members 里摘掉某个真实模型,返回摘掉的条数。 */
  stripMemberFromLogicalModels: (targetRealModelId: string) => number;
  /** stats_daily 最大日期(= 数据里"今天";无数据 → null)。 */
  lastStatsDay: () => string | null;
  /** 某 provider 的账户 + 密钥在场(**同步版**)。渠道域产物。 */
  accountsWithKeySync: (pid: string) => Array<{ credentialRef: string; username: string; hasKey: boolean; keyFp: string | null }>;
  /** 某 provider 的账户 + 密钥在场(打 vault)。渠道域产物。 */
  accountsWithKey: (pid: string) => Promise<Array<{ credentialRef: string; username: string; hasKey: boolean; keyFp: string | null }>>;
  /**
   * per-vendor 上游目录拉取(trae/workbuddy/sensenova 的专用端点)。渠道域产物。
   *
   * 这几家没有统一的 `/models` 接口,档位只能从各自的目录端点拿,所以
   * 「尝试从上游获取」对它们走这条路。
   */
  chAwaitCatalog: (pid: string, username: string, force?: boolean) => Promise<CatalogResult>;
}

/** 领域产物:9 个模型面板方法。 */
export interface ModelsDomain {
  methods: {
    getLogicalModels(): Promise<LogicalModelGroup[]>;
    writeLogicalModel(input: LogicalModelsWriteInput): Promise<ApiResult>;
    removeLogicalModel(name: string): Promise<ApiResult>;
    getDeployments(): Promise<DeploymentList>;
    setDeploymentExposure(
      deploymentId: string,
      kind: "direct" | "group" | "all",
      exposed: boolean,
      concurrency?: number,
    ): Promise<ApiResult>;
    setDeploymentReasoning(
      deploymentId: string,
      efforts: string[] | null,
      allowsOff: boolean | null,
    ): Promise<ApiResult>;
    fetchDeploymentReasoning(deploymentId: string): Promise<ApiResult>;
    setModelExposure(provider: string, model: string, exposed: boolean): Promise<ApiResult>;
    getModelProviders(): Promise<ModelProvider[]>;
    upsertModelProvider(id: string, baseUrl: string, protocol: string, envPrefix?: string): Promise<ApiResult>;
    removeModelProvider(id: string): Promise<ApiResult>;
  };
}

export function createModelsDomain(ctx: PanelContext, deps: ModelsDomainDeps): ModelsDomain {
  /** 包含该真实模型的逻辑模型名(唯一真源 = db.logical_model)。 */
  const logicalGroupsContaining = (provider: string, model: string): string[] => {
    const out: string[] = [];
    const contains = (members: Array<{ provider: string; model: string }>): boolean =>
      members.some((m) => m.provider === provider && m.model === model);
    for (const row of ctx.db.logicalModel.list()) {
      if (contains(parseDbMembers(row.members))) out.push(row.name);
    }
    return [...new Set(out)];
  };

  const exposureOverlay = new Map<string, boolean>();

  /**
   * 拉一次上游模型目录(**只读**),返回带思考档位的条目列表。
   *
   * 两条路:
   * - `trae` / `workbuddy` / `sensenova` 走各自的目录端点(渠道域的
   *   `chAwaitCatalog`)—— 这几家没有统一的 `/models`,档位只在专用端点里;
   * - 其余 OpenAI 兼容渠道探测 `base_url + /models`,用 core 的
   *   `parseModelEntries` 解析(它已经会把 `reasoning` 字段读成档位表)。
   *
   * ⚠️ 与渠道页「获取可用模型」同一口径:**不自动补 `/v1`、不猜路径**。
   * 地址填错就原样报错 —— 猜对了是运气,猜错了会把错的档位表写进库。
   */
  const fetchUpstreamCatalog = async (pid: string): Promise<
    Array<{ id: string; reasoning_efforts?: string[] | null; reasoning_allows_off?: boolean | null }>
  > => {
    if (CH_CATALOG_PROVIDERS.has(pid)) {
      const accounts = await deps.accountsWithKey(pid);
      const username = accounts.find((a) => a.hasKey)?.username ?? accounts[0]?.username;
      if (!username) throw new Error(`${pid} 下没有账号,没有密钥可以拿去拉上游目录`);
      const result = await deps.chAwaitCatalog(pid, username, true);
      return result.entries;
    }
    const row = ctx.db.provider.get(pid);
    const base = String(row?.base_url ?? "").trim();
    if (!base) {
      throw new Error("这家没有 base_url:请求由本机私有协议适配器转成私有协议,没有统一的 /models 接口可探测");
    }
    let u: URL;
    try {
      u = new URL(base);
    } catch {
      throw new Error(`base_url 不是可探测的 http(s) 地址:${base}`);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error(`base_url 不是可探测的 http(s) 地址:${base}`);
    }
    // 取第一条有明文密钥的凭据;取不到也**不拦** —— 本地/内网网关常常本来就不需要密钥。
    const creds = await ctx.vault.list(pid);
    let bearerKey: string | null = null;
    for (const c of creds) {
      const secret = await ctx.vault.secret(pid, c.username);
      if (typeof secret === "string" && secret !== "") {
        bearerKey = secret;
        break;
      }
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    if (bearerKey !== null) headers["Authorization"] = `Bearer ${bearerKey}`;
    const root = base.replace(/\/+$/, "");
    let res: Response;
    try {
      res = await fetch(`${root}/models`, { headers, signal: AbortSignal.timeout(10000) });
    } catch (err) {
      const why = err instanceof Error ? `${err.name}:${err.message}` : String(err);
      const cause = err instanceof Error && err.cause instanceof Error ? `(${err.cause.message})` : "";
      throw new Error(`打不到上游(10 秒后放弃):${why}${cause}`);
    }
    if (res.status >= 400) throw new Error(`上游返回 HTTP ${res.status}`);
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new Error("上游返回的不是 JSON,无法解析模型清单");
    }
    const parsed = parseModelEntries(payload);
    if (!parsed) throw new Error("上游回了 JSON,但认不出模型列表(期望 data / models 数组)");
    return parsed;
  };

  const modelDayStats = (
    provider: string,
    model: string,
  ): {
    requests: number; errors: number; total: number; prompt: number; completion: number;
    cached: number; rate: number | null; avg_ttft: number | null; avg_tps: number | null;
    latency_day: string | null;
  } => {
    const zero = {
      requests: 0, errors: 0, total: 0, prompt: 0, completion: 0, cached: 0,
      rate: null, avg_ttft: null, avg_tps: null, latency_day: null,
    };
    // 逐日倒序找第一个「计时三列都 > 0」的日子;找不到 → 全零(无徽章)。
    const days = [...new Set(ctx.db.statsDaily.range("0000-01-01", "9999-12-31")
      .filter((r) => r.provider === provider && r.model === model)
      .map((r) => r.day))].sort().reverse();
    let rows: StatsDailyRow[] = [];
    let pickedDay: string | null = null;
    for (const day of days) {
      const same = ctx.db.statsDaily.range(day, day)
        .filter((r) => r.provider === provider && r.model === model);
      const ok = same.some(
        (r) => r.latency_sum_ms > 0 && r.ttft_sum_ms > 0 && r.ttft_requests > 0,
      );
      if (ok) { rows = same; pickedDay = day; break; }
    }
    if (pickedDay === null || rows.length === 0) return zero;
    let requests = 0, errors = 0, prompt = 0, completion = 0, cached = 0;
    let latencySum = 0, ttftSum = 0, ttftReq = 0;
    for (const r of rows) {
      requests += r.requests;
      errors += r.fails;
      prompt += r.prompt_tokens;
      completion += r.completion_tokens;
      cached += r.cached_tokens;
      latencySum += r.latency_sum_ms;
      ttftSum += r.ttft_sum_ms;
      ttftReq += r.ttft_requests;
    }
    const genMs = latencySum - ttftSum;
    return {
      requests,
      errors,
      // ⚠️ total = prompt + completion(cached 是 prompt 子集,不双计)
      total: prompt + completion,
      prompt,
      completion,
      cached,
      rate: prompt > 0 ? Math.round((cached / prompt) * 1e4) / 1e4 : null,
      avg_ttft: ttftReq > 0 ? round1(ttftSum / ttftReq) : null,
      avg_tps: completion > 0 && genMs > 0 ? round1(completion / (genMs / 1000)) : null,
      latency_day: pickedDay,
    };
  };


  const methods = {

    async getLogicalModels(): Promise<LogicalModelGroup[]> {
      const rows = ctx.db.logicalModel.list();
      const names = rows.map((r) => r.name);
      const out: LogicalModelGroup[] = [];
      for (const name of [...names].sort()) {
        const row = ctx.db.logicalModel.get(name);
        // ⚠️ 同上:库里残留的旧/已删策略名在此归一成缺省 `random`。
        const strategy = normalizeStrategy(row?.strategy).strategy;
        const members = parseDbMembers(row?.members ?? null);

        // ── 思考强度档位:各档成员能力表的**交集**(用户 m09937)──────────────
        // 口径理由:调度可能选中链里任何一档,所以「这条逻辑模型能安全接受哪些
        // 档位」= 每一档都支持的那些。任一档明说不支持(`[]`)⇒ 整条 `[]`;
        // 全都没给(`null`)⇒ `null`(不拦);其余取非空名单的交集。
        // ⚠️ 这是**展示用**的安全边界,不是硬保证:网关仍按当轮真实模型逐档匹配。
        const memberEfforts = members.map(
          (m) => deps.realModelMap(m.provider).get(`${m.provider}/${m.model}`)?.supportedReasoningEfforts ?? null,
        );
        const reasoningEfforts: string[] | null = (() => {
          if (memberEfforts.length === 0) return null;
          const known = memberEfforts.filter((e): e is string[] => e !== null);
          // 有任一档明说不支持 ⇒ 整条逻辑模型不可用思考。
          if (known.some((e) => e.length === 0)) return [];
          if (known.length === 0) return null; // 一档都没给过档位表 ⇒ 不拦
          let acc: string[] = [...known[0]];
          for (const e of known.slice(1)) {
            const set = new Set(e.map((s) => s.toLowerCase()));
            acc = acc.filter((s) => set.has(s.toLowerCase()));
          }
          // 交集为空 = 没有任何档位是所有档都支持的 ⇒ 与「明说不支持」同义。
          return acc;
        })();

        // ⚠️ **一行 = 一个档位成员(真实模型)**,不是 (成员 × 账号) ——
        // Nexus `_logical_list` 的 `deployments[]` 下标就是 priority(D13),
        // 账号明细放在 `accounts[]` 里。按账号展开会让 3 账号的 sensenova
        // 同一个档位出现 3 遍,`order` 也就不再是成员优先级。
        const deployments: LogicalDeployment[] = [];
        members.forEach((member, order) => {
          const mv = deps.modelViewOf(member.provider, member.model);
          const accounts = deps.accountsWithKeySync(member.provider).map((a) => {
            const depId = endpointIdOf(member.provider, member.model, a.username);
            const rec = ctx.health.get(depId);
            const inCd = rec.cooldownUntil > 0 && rec.cooldownUntil > wallNow();
            return {
              account_id: a.credentialRef,
              username: a.username,
              account_fp: a.keyFp,
              in_cooldown: inCd,
              cooldown_remaining_s: inCd
                ? Math.max(0, Math.round((rec.cooldownUntil - wallNow()) * 10) / 10)
                : 0,
              quota_remaining: null, // 逻辑模型页不查额度(Nexus 同位置给 null)
            };
          });
          const first = accounts[0];
          const hidden = mv?.hidden ?? false;
          deployments.push({
            provider: member.provider,
            model: member.model,
            real_model: member.model,
            real_model_id: `${member.provider}/${member.model}`,
            account_key: first?.username ?? null,
            account_fp: first?.account_fp ?? null,
            order,
            hidden,
            listed: !hidden,
            exposed: !hidden,
            exposed_note: hidden ? "hidden(仅不纳入模型列表,仍可调用)" : null,
            // ⚠️ 这里给**真实值**(Nexus 该字段恒 false 是占位):逻辑模型页的
            // 「全视觉 / 有视觉」徽章全靠它,恒 false 会让徽章永远不出现。
            supports_vision: mv?.supportsVision ?? null,
            supported_reasoning_efforts: mv?.supportedReasoningEfforts ?? null,
            reasoning_allows_off: mv?.reasoningAllowsOff ?? null,
            endpoint_count: accounts.length,
            accounts,
            blackout: null,
            blackout_managed_by: "scheduler",
          });
        });

        out.push({
          model: name,
          // 显示名(用户 m44638):空串归一成 null,让 UI 与 /v1/models 回退到 model。
          display_name: (row?.display_name ?? "").trim() || null,
          deployments,
          count: deployments.length,
          routing_strategy: strategy,
          strategy_label: STRATEGY_LABELS[strategy] ?? strategy,
          order_respected: ORDER_STRATEGIES.has(strategy),
          members: members.map((m) => `${m.provider}/${m.model}`),
          // D14:`hidden` 列已删 → 「保留抽象模型」没有数据来源,恒 false。
          reserved: false,
          // v3 残留字段,恒 `[]`(Nexus 同口径;以前错填成了成员清单,
          // 两个字段语义不同,页面若按 fallback 渲染会重复显示一遍成员)。
          fallback_chain: [],
          entry_alias: null,
          hidden: false,
          reasoning_efforts: reasoningEfforts,
          strategy_groups: [{
            group_name: name,
            model_name: name,
            routing_strategy: strategy,
            real_models: deployments.map((d) => ({
              real_model: d.real_model_id,
              account_count: d.endpoint_count,
              orders: [d.order],
              supports_vision: d.supports_vision,
            })),
          }],
        });
      }
      return out;
    },
    /**
     * 写逻辑模型 —— 对齐 Nexus `_logical_write`。
     *
     * ⚠️ **逐档校验「已登记」**:Nexus `_require_real_model` 对每个成员查
     * `real_model`,未登记直接 400。不校验的话可以写进一条指向空气的档位 ——
     * 调度时 `endpointChain` 展开出 0 个端点,整条链静默少一档,而页面上
     * 看起来「配好了」。
     *
     * ⚠️ **允许空成员**(`members: []`):Nexus 明确允许先建壳再逐档添加。
     * 以前这里直接拒「至少需要一个成员」,于是「新建 → 保存 → 再加档」这条
     * 正常使用路径走不通。
     */
    async writeLogicalModel(input: LogicalModelsWriteInput): Promise<ApiResult> {
      const name = String(input?.model_name ?? "").trim();
      if (!name) return { ok: false, message: "逻辑模型名不能为空" };
      const members = membersFromInput(input ?? {});
      // 逐档校验已登记(允许 0 档)。
      const dangling: string[] = [];
      for (const m of members) {
        if (!deps.modelViewOf(m.provider, m.model)) dangling.push(`${m.provider}/${m.model}`);
      }
      if (dangling.length > 0) {
        return {
          ok: false,
          message: `以下档位没有登记(先在对应渠道页勾选登记,再回来加档):${dangling.join("、")}`,
        };
      }
      const existing = ctx.db.logicalModel.get(name);
      const strategyRaw = input?.routing_strategy ?? existing?.strategy ?? "random";
      const { strategy } = normalizeStrategy(strategyRaw);
      const membersJson = JSON.stringify(members);
      // 显示名三态(用户 m44638):未给 = 本次不动这一列;空串 = 清成 NULL(回退用 name);
      // 非空 = 写入。updateRow 会跳过 undefined,所以「清空」必须显式给 null。
      const dnGiven = input && Object.prototype.hasOwnProperty.call(input, "display_name");
      const dn = dnGiven ? String(input.display_name ?? "").trim() || null : undefined;
      if (existing) {
        ctx.db.logicalModel.update({ name, strategy, members: membersJson, display_name: dn });
      } else {
        ctx.db.logicalModel.insert({
          name,
          strategy,
          members: membersJson,
          ...(dn ? { display_name: dn } : {}),
        });
      }
      try {
        ctx.scheduler.invalidate(); // 成员/策略变了 → 档链要重算
      } catch {
        /* 忽略 */
      }
      ctx.syncRegistry(); // 索引跟上库(页面/网关读数即时反映)
      return {
        ok: true,
        message: members.length > 0
          ? `已保存 ${name}(${members.length} 档,顺序即优先级)`
          : `已保存 ${name}(还没有档位 —— 保存后可以继续加档)`,
        changed: [name],
      };
    },
    async removeLogicalModel(name: string): Promise<ApiResult> {
      const modelName = String(name ?? "").trim();
      if (!ctx.db.logicalModel.get(modelName)) {
        return { ok: false, message: `逻辑模型 ${modelName} 不存在` };
      }
      ctx.db.logicalModel.delete(modelName);
      // ⚠️ 删除后必须失效调度缓存:AppSchedulerRepo 现在只读 db,
      // 但 Scheduler 内部按 logicalName 缓存了档链(endpointChain),
      // 不 invalidate 的话删掉的模型还留在链缓存里被调度。
      ctx.scheduler.invalidate();
      ctx.syncRegistry(); // 索引跟上库 → 页面立刻不再列出它
      return { ok: true, message: `已删除逻辑模型 ${modelName}`, changed: [modelName] };
    },
    async getDeployments(): Promise<DeploymentList> {
      const nowS = wallNow();
      const lastDay = deps.lastStatsDay();
      const out: DeploymentItem[] = [];
      // ⚠️ **一行 = 一个真实模型**(Nexus v4 `_deployments_list` 的口径)。
      // 以前这里按 (真实模型 × 账号) 展开,于是 sensenova 这种 3 账号的渠道,
      // 同一个模型在「模型总览」里出现 3 遍 —— 而 Nexus 从 v4 起就把粒度改成了
      // 真实模型:`stats_daily` 没有凭据维度,按账号切分算不出各自的 TTFT/TPS,
      // 硬切只会把「全渠道合数」重复显示好几遍;端点本身由 (真实模型 × 该
      // provider 名下的凭据行) 自动推导(D5),也不可单独停用(D6)。
      //
      // 账号信息没有丢:`endpoint_count` / `usable_endpoint_count` 就是
      // 「这名成员名下有几枚凭据、几枚有密钥」,组头的「N 可用 / M 冷却」
      // 也按真实模型口径汇总。
      const models = [...deps.realModelMap().values()].sort((a, b) =>
        a.provider < b.provider ? -1 : a.provider > b.provider ? 1
          : a.model < b.model ? -1 : a.model > b.model ? 1 : 0,
      );
      for (const mv of models) {
        const modelId = `${mv.provider}/${mv.model}`;
        const logicals = logicalGroupsContaining(mv.provider, mv.model);
        const withKey = await deps.accountsWithKey(mv.provider);
        // ⚠️ **不跳过 0 账号模型**(Nexus `_deployments_list` 同口径):没有凭据的
        // 档也要列出来,`endpoint_count=0` + 「异常」徽章(缺配置)正是用户要看到
        // 的信号 —— 跳过它等于把「这个模型调不通」藏起来。
        const usableCount = withKey.filter((a) => a.hasKey).length;
        const stats = modelDayStats(mv.provider, mv.model);
        // 端点数 = 该 provider 名下的**全部**凭据行(D5),不是「启用」的账号数
        // —— Nexus 没有停用概念,端点由 (真实模型 × 凭据行) 自动推导。
        const endpointCount = ctx.registry.listAccounts(mv.provider).length;
        // 冷却按该真实模型下**所有端点**汇总(2026-11-07 用户定案:
        // 「多key的情况下,所有key都错误才显示冷却」)。
        //
        // 端点粒度 = (真实模型 × 该 provider 名下的凭据行),调度器 plan 会
        // 过滤掉冷却端点继续挑别的 key(router.ts:419-422)—— 所以「一把 key
        // 坏了」**不等于**「这个模型用不了」,旧口径把它误报成整模型冷却。
        //
        // 分母 = **有密钥的凭据**(与 usable_endpoint_count 同源):
        //   - 没密钥的凭据永远不会产生端点记录,计入分母会让「全部冷却」永不成立;
        //   - 只有一个 key 时:它冷却 = 该模型冷却(与旧口径一致,行为不变)。
        // 剩余时长取在冷却端点里**最长的那枚**(面板回答「还得等多久才能全好」)。
        let inCd = false;
        let remaining: number | null = null;
        const keyedAccounts = withKey.filter((a) => a.hasKey);
        if (keyedAccounts.length > 0) {
          let coolingCount = 0;
          for (const account of keyedAccounts) {
            const depId = endpointIdOf(mv.provider, mv.model, account.username);
            const rec = ctx.health.get(depId);
            if (rec.cooldownUntil > 0 && rec.cooldownUntil > nowS) {
              coolingCount += 1;
              const left = Math.max(0, Math.round((rec.cooldownUntil - nowS) * 10) / 10);
              if (remaining === null || left > remaining) remaining = left;
            }
          }
          // 全部(有密钥的)端点都在冷却 ⇒ 这个模型真的用不了。
          inCd = coolingCount > 0 && coolingCount === keyedAccounts.length;
        }
        const listed = !mv.hidden;
        const live = endpointCount > 0 && !inCd;
        out.push({
          deployment_id: modelId,
          real_model_id: modelId,
          provider: mv.provider,
          // Nexus 同款:只给一个展示标签(provider 名),账号明细在
          // endpoint_count / usable_endpoint_count 里,不在行上摊开。
          account: mv.provider,
          model: mv.model,
          listed,
          hidden: mv.hidden,
          direct_exposed: listed,
          group_exposed: logicals.length > 0,
          exposed: listed || logicals.length > 0,
          direct_live: live,
          group_live: logicals.length > 0 && live,
          live,
          endpoint_count: endpointCount,
          usable_endpoint_count: usableCount,
          logical_models: logicals,
          supports_vision: mv.supportsVision,
          supported_reasoning_efforts: mv.supportedReasoningEfforts,
          supported_reasoning_efforts_raw: mv.supportedReasoningEffortsRaw,
          reasoning_allows_off: mv.reasoningAllowsOff,
          in_cooldown: inCd,
          cooldown_remaining_s: remaining,
          requests: stats.requests,
          errors: stats.errors,
          total_tokens: stats.total,
          prompt_tokens: stats.prompt,
          completion_tokens: stats.completion,
          cached_tokens: stats.cached,
          cache_hit_rate: stats.rate,
          avg_ttft_ms: stats.avg_ttft,
          avg_tps: stats.avg_tps,
          latency_day: stats.latency_day,
          concurrency: mv.concurrency,
        });
      }
      out.sort((a, b) =>
        a.provider < b.provider ? -1 : a.provider > b.provider ? 1
          : a.model < b.model ? -1 : a.model > b.model ? 1
            : a.account < b.account ? -1 : 1);
      return {
        deployments: out,
        count: out.length,
        note: "一行 = 一个真实模型(端点 = 真实模型 × 该供应商名下的凭据行,自动推导);勾选只决定是否纳入模型列表,取消后仍可被调用",
      };
    },
    async setDeploymentExposure(
      deploymentId: string,
      kind: "direct" | "group" | "all",
      exposed: boolean,
      concurrency?: number,
    ): Promise<ApiResult> {
      const changed: string[] = [];
      // D28:listed 语义 = real_model.hidden(真写 db,重启不丢)。
      const modelId = String(deploymentId ?? "").split("@")[0] ?? "";
      const slash = modelId.indexOf("/");
      if (slash > 0) {
        const provider = modelId.slice(0, slash);
        const model = modelId.slice(slash + 1);
        if (ctx.db.realModel.get(provider, model) !== undefined) {
          ctx.db.realModel.update({ provider, model, hidden: exposed ? 0 : 1 });
          changed.push(`${modelId}::hidden=${exposed ? 0 : 1}`);
        }
      }
      // 兜底:db 没有该行时退回内存 overlay(旧行为)。
      const key = `${String(deploymentId ?? "")}::${String(kind ?? "all")}`;
      if (changed.length === 0) {
        exposureOverlay.set(key, Boolean(exposed));
        changed.push(key);
      }
      // 并发上限(2026-11-08 改口):这一列是**每个凭据**的并发上限,真写
      // db.real_model.concurrency(1~2^20);同一真实模型下 N 个凭据 = N × 该值。
      // ⚠️ 上限是 **1048576**(Nexus `_body_int(..., 1, 1 << 20)`),不是 4096 ——
      // 以前的 4096 会把用户填的更大值**静默截断**,而且截断后的值直接进了调度。
      if (concurrency != null && Number.isFinite(concurrency)) {
        const capped = Math.min(1 << 20, Math.max(1, Math.trunc(concurrency)));
        const slash2 = modelId.indexOf("/");
        if (slash2 > 0) {
          const provider = modelId.slice(0, slash2);
          const model = modelId.slice(slash2 + 1);
          if (ctx.db.realModel.get(provider, model) !== undefined) {
            ctx.db.realModel.update({ provider, model, concurrency: capped });
            changed.push(`${modelId}::concurrency=${capped}`);
          }
        }
      }
      ctx.syncRegistry();
      return {
        ok: true,
        message: changed.length > 0 ? `已保存(${changed.join("; ")})` : "已记录",
        changed,
      };
    },
    /**
     * 「思考强度选择器」落库入口 —— 把真实模型的思考能力写进
     * `real_model.supported_reasoning_efforts` / `reasoning_allows_off`。
     *
     * 三态语义与读侧({@link parseReasoningEfforts})一一对应:
     * - `efforts === null` → NULL(未设置:网关不发送该字段,DSH 里不出现档位);
     * - `efforts === []`   → `"[]"`(明说不支持思考,一律不发);
     * - 非空 → **上游原文**档位表(去重、按阶梯升序;`off` 由 `allowsOff` 单独表达)。
     *
     * 写完之后 `/v1/models`、DSH adapter 声明的 `reasoning.efforts`、网关的
     * 钳制算法读的是**同一份表** —— 不存在第二处真源,也不需要重启。
     */
    async setDeploymentReasoning(
      deploymentId: string,
      efforts: string[] | null,
      allowsOff: boolean | null,
    ): Promise<ApiResult> {
      const modelId = String(deploymentId ?? "").split("@")[0] ?? "";
      const slash = modelId.indexOf("/");
      if (slash <= 0) return { ok: false, message: `无法解析部署 id:${deploymentId}`, changed: [] };
      const provider = modelId.slice(0, slash);
      const model = modelId.slice(slash + 1);
      if (ctx.db.realModel.get(provider, model) === undefined) {
        return { ok: false, message: `真实模型不存在:${modelId}`, changed: [] };
      }
      const normalized: string[] | null =
        efforts === null
          ? null
          : orderRawLevels((Array.isArray(efforts) ? efforts : []).map((x) => String(x ?? "")));
      const allow = allowsOff === null || allowsOff === undefined ? null : Boolean(allowsOff);
      ctx.db.realModel.update({
        provider,
        model,
        supported_reasoning_efforts: serializeReasoningEfforts(normalized),
        reasoning_allows_off: allow,
      });
      ctx.syncRegistry();
      const allowText = allow === null ? "未设置" : allow ? "可关" : "不可关";
      return {
        ok: true,
        message:
          normalized === null
            ? "已清除思考强度(未设置,网关不拦不发)"
            : normalized.length === 0
              ? "已标记为不支持思考(网关一律不发)"
              : `思考强度已保存:${normalized.join("/")}(${allowText})`,
        changed: [
          `${modelId}::supported_reasoning_efforts=${JSON.stringify(normalized)}`,
          `${modelId}::reasoning_allows_off=${allow === null ? "null" : allow ? "1" : "0"}`,
        ],
      };
    },
    /**
     * 「尝试从上游获取」思考强度档位(2026-11-03 用户定案)。
     *
     * 背景:思考档位是**上游的能力事实**,不是用户偏好。手工填「low/high/max」
     * 那套预设既容易填错,又跟不上上游新增的档位 —— 所以 UI 上只留两个选项:
     * 「默认(数据库 null)」= 不管它,交给上游;「尝试从上游获取」= 现在去问上游一句。
     *
     * 落库口径与 {@link setDeploymentReasoning} 完全一致:
     * - 上游给了档位表 → 写规范阶梯子集(`reasoning_allows_off` 单独存);
     * - 上游明说不支持思考 → 写 `"[]"`;
     * - 上游没给 / 目录里没有这个模型 → 写 NULL(网关不拦也不发)。
     *
     * ⚠️ 探测是**只读**动作:绝不因此建 provider 行、绝不改已登记行的其它声明字段
     * (与渠道页「获取可用模型」同一口径)。
     */
    async fetchDeploymentReasoning(deploymentId: string): Promise<ApiResult> {
      const modelId = String(deploymentId ?? "").split("@")[0] ?? "";
      const slash = modelId.indexOf("/");
      if (slash <= 0) return { ok: false, message: `无法解析部署 id:${deploymentId}`, changed: [] };
      const provider = modelId.slice(0, slash);
      const model = modelId.slice(slash + 1);
      if (ctx.db.realModel.get(provider, model) === undefined) {
        return { ok: false, message: `真实模型不存在:${modelId}`, changed: [] };
      }

      // ── 1. 拉上游目录(只读) ──────────────────────────────────────────
      let entries: Array<{ id: string; reasoning_efforts?: string[] | null; reasoning_allows_off?: boolean | null }>;
      try {
        entries = await fetchUpstreamCatalog(provider);
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `拉上游目录失败:${why}`, changed: [] };
      }

      // ── 2. 在目录里找本模型 → 取档位 ─────────────────────────────────
      const hit = entries.find((e) => e.id === model);
      const efforts = hit?.reasoning_efforts ?? null;
      const allowsOff = hit?.reasoning_allows_off ?? null;

      // ── 3. 落库(只碰这两个字段,别的声明字段一律不动) ──────────────────
      //
      // ⚠️ 存**上游原文**,不归一(与 modelview 的读写分工一致:库存原文、
      // 读侧 parseReasoningEfforts 再归一)。归一会把上游的原始拼写(如
      // `xhigh`)丢掉,面板上显示的「数据库原文」也就失去了对照价值 ——
      // 用户要的正是「库里存的原文」,不是替它改过一遍的阶梯子集。
      const stored: string[] | null =
        efforts === null ? null : efforts.map((x) => String(x ?? "")).filter((x) => x !== "");
      ctx.db.realModel.update({
        provider,
        model,
        supported_reasoning_efforts: serializeReasoningEfforts(stored),
        reasoning_allows_off: allowsOff === null || allowsOff === undefined ? null : Boolean(allowsOff),
      });
      ctx.syncRegistry();

      const where = hit ? `上游目录里有 ${model}` : `上游目录里没有 ${model}`;
      const allowText = allowsOff === null ? "未设置" : allowsOff ? "可关" : "不可关";
      // 上游没给表时把「接下来会发生什么」说清楚:NULL = 网关**一个字段都不发**
      // (不猜、不造默认梯),等上游给了表再发。不写这一句,面板上只会看到
      // 「→ 已存 NULL」,读起来像「白点了一次」。
      const message =
        stored === null
          ? `${where},但上游没给思考档位 → 已存 NULL(网关不发送该字段)`
          : stored.length === 0
            ? `${where},上游明说不支持思考 → 已存 [](网关一律不发)`
            : `${where},档位 ${stored.join("/")}(${allowText})→ 已落库`;
      return {
        ok: true,
        message,
        changed: [
          `${modelId}::supported_reasoning_efforts=${JSON.stringify(stored)}`,
          `${modelId}::reasoning_allows_off=${allowsOff === null ? "null" : allowsOff ? "1" : "0"}`,
        ],
      };
    },
    async getModelProviders(): Promise<ModelProvider[]> {
      const provIds = new Set<string>();
      for (const p of ctx.registry.listProviders()) {
        if (p.protocol === "openai") provIds.add(p.id);
      }
      for (const row of ctx.db.provider.list()) {
        if (row.protocol === "openai") provIds.add(row.id);
      }
      const out: ModelProvider[] = [];
      for (const id of [...provIds].sort()) {
        const pdef = ctx.registry.getProvider(id);
        const drow = ctx.db.provider.get(id);
        const withKey = await deps.accountsWithKey(id);
        const accountsCount = withKey.length;
        const usableCount = withKey.filter((a) => a.hasKey).length;
        // ⚠️ 供应商页口径 = **只读 real_model 表**(Nexus `_providers_view`):
        // 上游目录(「获取可用模型」探测结果)只进选择器候选,绝不合并进列表 ——
        // 一旦合并(旧实现 mergedChannelModels 渠道页口径),「获取可用模型」
        // 就把上游目录全部模型带进列表,保存时全部登记进 real_model
        // (症状:列表里只有一个模型,保存后 /v1/models 下出现所有模型)。
        const rmap = realModelMapOf(ctx.registry, ctx.db, id);
        const models: CatalogModel[] = [...rmap.values()]
          .sort((a, b) => (a.model < b.model ? -1 : a.model > b.model ? 1 : 0))
          .map((mv) => ({
            id: `${id}/${mv.model}`,
            name: mv.name ?? mv.model,
            exposed: true, // 在表里 ⇒ 一律勾着
            hidden: mv.hidden,
            listed: true,
            available: true,
            vision: mv.supportsVision,
            context_window: mv.maxInputTokens,
            max_output: mv.maxOutputTokens,
            rate: null,
            registered: true,
            callable: true,
            origin: "router",
            endpoints: accountsCount,
            usable_endpoints: usableCount,
            default_vision: null,
            default_context: null,
            default_output: null,
            supported_reasoning_efforts: mv.supportedReasoningEfforts,
            reasoning_allows_off: mv.reasoningAllowsOff,
          }));
        // 已登记 / 列入 /v1/models 两个 id 清单(Nexus `deployed` / `listed`)。
        const registeredIds = models.filter((m) => m.registered).map((m) => m.id).sort();
        const listedIds = models
          .filter((m) => m.registered && m.hidden === false)
          .map((m) => m.id)
          .sort();
        out.push({
          id,
          base_url: pdef?.baseUrl ?? drow?.base_url ?? null,
          protocol: pdef?.protocol ?? drow?.protocol ?? "openai",
          credential_provider: id,
          // 凭据已入库(credential 表)—— 与 Nexus 一致,不再暴露文件路径。
          credential_file: null,
          env_prefix: pdef?.envPrefix ?? drow?.env_prefix ?? `ONE_${id.toUpperCase()}`,
          accounts_count: accountsCount,
          accounts_with_key: usableCount,
          // ⚠️ **不 filter** 掉 null:指纹数组与账号一一对应,过滤后下标错位。
          key_fingerprints: withKey.map((a) => a.keyFp),
          has_plaintext_keys: false,
          models,
          deployed_models: registeredIds,
          exposed: listedIds,
          listed: listedIds,
          is_channel: false,
        });
      }
      return out;
    },
    /**
     * 新增/更新一个兼容供应商 —— 对齐 Nexus `_provider_upsert`。
     *
     * ⚠️ **`envPrefix` 与 `keys` 必须能写**:以前的签名只有
     * `(id, baseUrl, protocol)`,于是
     * - `env_prefix` 永远落到 `ONE_<ID>` 的默认值(用户改成别的值存不住);
     * - 页面上「密钥」输入框填的新 key **被静默丢弃**(`saveCard` 拿不到通道),
     *   用户以为保存成功了,实际一个字节都没动。
     *
     * 凭据池语义(Nexus `_replace_credentials`):`keys` 数组即**整池**、按位置
     * 对齐座位;**空串座位不删**(留空 = 不改,见下),只删多出来的尾部座位。
     */
    async upsertModelProvider(
      id: string,
      baseUrl: string | null,
      protocol: string,
      envPrefix?: string | null,
      keys?: string[] | null,
    ): Promise<ApiResult> {
      const pid = String(id ?? "").trim();
      if (!pid) return { ok: false, message: "provider id 不能为空" };
      const proto = String(protocol ?? "").trim() || "openai";
      if (!(KNOWN_PROTOCOLS as readonly string[]).includes(proto)) {
        return { ok: false, message: `未知协议 ${proto}` };
      }
      const env = String(envPrefix ?? "").trim();
      const existing = ctx.db.provider.get(pid);
      if (existing) {
        ctx.db.provider.update({
          id: pid,
          base_url: baseUrl,
          protocol: proto,
          ...(env === "" ? {} : { env_prefix: env }),
        });
      } else {
        ctx.db.provider.insert({
          id: pid,
          base_url: baseUrl,
          protocol: proto,
          ...(env === "" ? {} : { env_prefix: env }),
        });
      }

      // ── 凭据池整体替换(按位置对齐;空串座位不删) ──────────────────────
      const changed: string[] = [pid];
      if (Array.isArray(keys)) {
        const current = await ctx.vault.list(pid);
        for (let i = 0; i < keys.length; i += 1) {
          const value = String(keys[i] ?? "").trim();
          // ⚠️ **留空串的座位不删也不改**:用户只是没填,不是要删掉这个号。
          // 删座位必须走专门的删除动作(Nexus 同一口径)。
          if (value === "") continue;
          const username = current[i]?.username ?? `${pid}-${i}`;
          await ctx.vault.put({ provider: pid, username, secret: value });
          changed.push(`${pid}/${username}`);
        }
        // 只删**多出来的尾部座位**(数组比现有池长时才有)。
        for (let i = keys.length; i < current.length; i += 1) {
          await ctx.vault.remove(pid, current[i].username);
          changed.push(`-${pid}/${current[i].username}`);
        }
        // 凭据变了 → 密钥在场表要刷新,否则调度器仍按旧快照过滤端点。
        try {
          const map = await ctx.vault.secretsFor(pid);
          for (const p of ctx.registry.listAccounts(pid)) {
            const u = splitRef(p.credentialRef)[1];
            ctx.secretPresence.set(`${pid}/${u}`, map.has(u));
          }
        } catch {
          /* 探测失败不改行为:下次启动会重新探测 */
        }
      }

      try {
        ctx.scheduler.invalidate();
      } catch {
        /* 忽略 */
      }
      ctx.syncRegistry();
      return {
        ok: true,
        message: `已写入供应商 ${pid}(${existing ? "更新" : "新增"})`,
        provider: pid,
        changed,
      };
    },
    /**
     * 删除一个兼容供应商 —— 对齐 Nexus `DELETE /providers/{id}` 的**级联**语义。
     *
     * ⚠️ 以前只删 `provider` 表那一行,`real_model` 行和 vault 里的凭据全部残留 ——
     * 而页面上的确认文案写着「其登记的真实模型与凭据会一并移除」。那是**谎话**:
     * 用户删完再进模型总览,模型还在;凭据也还在库里躺着。
     *
     * 级联顺序(与 Nexus 一致):
     * 1. 先把该 provider 的每一个真实模型从所有逻辑模型档链里**连锁摘除**(保序);
     * 2. 删 `real_model` 行;
     * 3. 删 vault 里的凭据行;
     * 4. 删 `provider` 行。
     */
    async removeModelProvider(id: string): Promise<ApiResult> {
      const pid = String(id ?? "").trim();
      if (!ctx.db.provider.get(pid) && ctx.registry.getProvider(pid) === null) {
        return { ok: false, message: `provider ${pid} 不存在` };
      }
      const models = ctx.db.realModel.listByProvider(pid);
      let stripped = 0;
      for (const m of models) stripped += deps.stripMemberFromLogicalModels(`${pid}/${m.model}`);
      for (const m of models) ctx.db.realModel.delete(pid, m.model);

      let creds = 0;
      try {
        for (const c of await ctx.vault.list(pid)) {
          if (await ctx.vault.remove(pid, c.username)) creds += 1;
          ctx.secretPresence.delete(`${pid}/${c.username}`);
        }
      } catch {
        /* 凭据删除失败不阻断配置删除;如实计数 */
      }
      if (ctx.db.provider.get(pid)) ctx.db.provider.delete(pid);
      try {
        ctx.scheduler.invalidate();
      } catch {
        /* 忽略 */
      }
      ctx.syncRegistry();
      const parts = [`已移除 ${pid}`];
      if (models.length > 0) parts.push(`真实模型 ${models.length} 个`);
      if (stripped > 0) parts.push(`档链连锁摘除 ${stripped} 处`);
      if (creds > 0) parts.push(`凭据 ${creds} 条`);
      if (models.length === 0 && creds === 0) parts.push("(该供应商下没有模型与凭据)");
      return {
        ok: true,
        message: parts.join(","),
        provider: pid,
        changed: [pid],
      };
    },
    async setModelExposure(provider: string, model: string, exposed: boolean): Promise<ApiResult> {
      const pid = String(provider ?? "").trim();
      const mid = String(model ?? "").trim();
      if (!pid || !mid) return { ok: false, message: "provider/model 不能为空" };
      // 手工登记的模型(模型目录页「＋ 添加模型」/ 新建提供商卡)在 real_model 里
      // 还没有行;这里直接插入缺失行(镜像 fetchModels 的落库形状),
      // 否则面板保存「已保存」后重载即消失。
      if (!ctx.db.realModel.get(pid, mid)) {
        ctx.db.realModel.set({
          provider: pid,
          model: mid,
          name: null,
          supports_vision: 0,
          max_input_tokens: null,
          max_output_tokens: null,
          hidden: exposed ? 0 : 1,
          // ⚠️ 2026-11-08:并发是**每凭据**的;缺省按供应商查
          // (sensenova=1 / workbuddy=2 / 其余 3),手工登记的新模型别写死 1。
          concurrency: defaultConcurrencyOf(pid),
          // 手工登记的模型没有上游目录可依 → 空 = 不拦(网关不传/照上游的来)。
          supported_reasoning_efforts: null,
          reasoning_allows_off: null,
        });
      }
      const mv = deps.modelViewOf(pid, mid);
      if (!mv) return { ok: false, message: `未知模型 ${pid}/${mid}` };
      // Nexus 语义:exposed=true ⇔ hidden=0。真写 db.real_model.hidden ——
      // deps.realModelMap 的 db 行无条件覆盖注册表,面板读数即时生效;
      // 调度端点并发/可见性经 core-repo #rowsFor 同样读 db,即时生效。
      ctx.db.realModel.update({ provider: pid, model: mid, hidden: exposed ? 0 : 1 });
      ctx.syncRegistry();
      return {
        ok: true,
        message: exposed ? `已暴露 ${pid}/${mid}` : `已隐藏 ${pid}/${mid}`,
        changed: [`${pid}/${mid}`],
      };
    }

  };

  return { methods };
}
