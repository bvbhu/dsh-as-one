/**
 * 总览 / 追踪 / 设置面板域 —— 从 assembly.ts 的 createPanel 闭包拆出(重构第七刀)。
 *
 * 职责:
 *   - 网关与运行期:`getStatus` / `restartGateway` / `getRuntime`(在途租约、按模型聚合)
 *   - 用量与指标:`getUsageHistory`(range × granularity × group 三维聚合)/
 *     `getMetrics` / `getUsageSummary` / `getRecentRequests`
 *   - 设置:`getSettings`(缺键即播种并回显) / `saveSettings`(校验规则/冷却)
 *   - 请求日志:`getRequestLog` / `getRequestLogStatus` / `setRequestLog`
 *   - 杂项:`getDataDir` / `listProviders` / `setAccountEnabled`
 *
 * 边界:
 *   - 这 15 个方法与 10 个闭包完全自洽(AST 验算:域外依赖为空、域外引用者仅
 *     三处 `realModelMap`),所以整块搬出,createPanel 只留装配。
 *   - `realModelMap` / `modelViewOf` / `stripMemberFromLogicalModels` /
 *     `lastStatsDay` 仍留在 createPanel —— 渠道域/模型域/sensenova 域经 deps 取它们。
 *   - `this.getUsageHistory` / `this.getRequestLog` 这种域内自调改成了
 *     `methods.xxx`,因为域对象不再有 `this === panel` 的语义。
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  cooldownDefaultsJson,
  endpointIdOf,
  monotonic,
  rulesDefaultsJson,
  wallNow,
} from "@as-one/core/src/scheduler/engine.js";
import { getAllConnectors } from "@as-one/core/src/connectors/index.js";
import { dayKey, parseContentMode } from "@as-one/core/src/request-log/index.js";
import { computeTps } from "@as-one/core/src/request-log/tps.js";
import { providerDisplayName } from "@as-one/core/src/config/provider-labels.js";
import { KIND_BY_PROTOCOL, KNOWN_PROTOCOLS, REQUEST_LOG_CONTENT_MODES, SETTING_FIELDS } from "./constants.js";
import type { SettingFieldSpec } from "./constants.js";
import {
  clampDay,
  countJsonlLines,
  dayAdd,
  monthAxis,
  parseDbMembers,
  pct,
  rangeDays,
  round1,
  splitRef,
  todayLocal,
} from "./utils.js";
import type { ModelView } from "./modelview.js";
import type {
  AccountInfo,
  ApiResult,
  DataDirInfo,
  GatewayStatus,
  InflightLogicalGroup,
  MetricsSnapshot,
  ProviderState,
  RecentRequest,
  RequestLogStatus,
  RequestLogContentMode,
  RuntimeSnapshot,
  SessionCurrentRoute,
  SettingSpec,
  SettingsRead,
  UsageBucket,
  UsageGranularity,
  UsageGroup,
  ExternalUsage,
  ExternalUsageDaily,
  ExternalUsageSeries,
  UsageHistory,
  UsageProvider,
  UsageRange,
  UsageSeries,
  UsageSeriesModel,
  UsageSource,
  UsageTotals,
} from "./types.js";
import type { PanelContext } from "./context.js";

/** createPanel 传给总览域的两个闭包(其它域也要它们,所以留在 createPanel)。 */
export interface OverviewDomainDeps {
  /** 注册表投影(provider → Map<"provider/model", ModelView>),两处用到。 */
  realModelMap: (pid?: string) => Map<string, ModelView>;
}

/** 领域产物:15 个总览/设置面板方法。 */
export interface OverviewDomain {
  methods: {
    getStatus(): Promise<GatewayStatus>;
    restartGateway(): Promise<ApiResult>;
    getRuntime(): Promise<RuntimeSnapshot>;
    getUsageHistory(
      range: UsageRange,
      granularity: UsageGranularity,
      group: UsageGroup,
      source?: UsageSource,
    ): Promise<UsageHistory>;
    getMetrics(days?: number): Promise<MetricsSnapshot>;
    getRecentRequests(limit?: number): Promise<RecentRequest[]>;
    /**
     * 某 DSH 会话**当前请求**的真实模型(输入框内徽标用)。
     *
     * @param sessionId DSH 会话 id(与网关记账用的 `session_id` 同字段)。
     * @param model 会话当前选中的模型名 —— 空闲态靠它把亲和 pin 的 `endpointId`
     *   翻回「哪台真实模型」。
     * @returns 在途请求的真实模型 / 亲和钉住的下一跳;查不到 `null`(界面不画)。
     */
    getSessionCurrentRoute(
      sessionId: string,
      model?: string,
    ): Promise<SessionCurrentRoute | null>;
    getUsageSummary(): Promise<UsageHistory>;
    getRequestLogStatus(): Promise<RequestLogStatus>;
    listProviders(): Promise<ProviderState[]>;
    setAccountEnabled(providerId: string, index: number, enabled: boolean): Promise<void>;
    getSettings(): Promise<SettingsRead>;
    saveSettings(payload: Record<string, Record<string, string>>): Promise<ApiResult>;
    getRequestLog(): Promise<RequestLogStatus>;
    setRequestLog(patch: { enabled?: boolean; content_mode?: RequestLogContentMode }): Promise<ApiResult>;
    getDataDir(): Promise<DataDirInfo>;
  };
}

export function createOverviewDomain(ctx: PanelContext, deps: OverviewDomainDeps): OverviewDomain {
  interface RowAgg {
    tokens: number;
    requests: number;
    fails: number;
    prompt: number;
    completion: number;
    cached: number;
  }

  /**
   * `stats_daily` 与 `stats_external_daily` 归一后的同一行形状。
   *
   * 两张表的列名不同(requests vs calls、logical_model 有无),但**统计语义可以对齐**:
   * 一行就是一个 (day, provider, model) 的用量。归一之后聚合只写一遍,
   * 「所有」自然就是在同一个循环里相加,不再有两套 KPI/趋势/排名。
   */
  interface UsageStatRow {
    day: string;
    provider: string;
    model: string;
    logical_model: string | null;
    /** 该行代表多少次调用:网关侧取 requests,外部侧取 calls。 */
    count: number;
    fails: number;
    prompt: number;
    completion: number;
    cached: number;
    /** 是否来自 `stats_daily`(逻辑模型视图的跳过规则只对网关行生效)。 */
    gateway: boolean;
  }

  const gatewayReady = (): boolean => ctx.gatewayState.error === null && ctx.gatewayState.gateway !== null;

  const gatewayReason = (): string | null =>
    ctx.gatewayState.error ?? (ctx.gatewayState.gateway === null ? "网关未启动" : null);

  const isLogicalModelName = (name: string): boolean =>
    ctx.db.logicalModel.get(name) !== undefined;

  const providers = async (): Promise<ProviderState[]> => {
    const configured = ctx.registry.listProviders();
    const knownIds = Array.from(new Set([
      ...configured.map((p) => p.id),
      ...getAllConnectors().map((c) => c.vendorId),
      ...KNOWN_PROTOCOLS,
    ]));
    const out: ProviderState[] = [];
    for (const id of knownIds) {
      const pdef = ctx.registry.getProvider(id);
      const accounts = ctx.registry.listAccounts(id);
      const envPrefix = pdef?.envPrefix ?? `ONE_${id.toUpperCase()}`;
      const accountInfos: AccountInfo[] = await Promise.all(
        accounts.map(async (account, index) => {
          const [provider, username] = splitRef(account.credentialRef);
          const summary = await ctx.vault.describe(provider, username);
          return {
            index,
            env_var: `${envPrefix}_KEY${accounts.length > 1 ? `_${index + 1}` : ""}`,
            has_key: summary !== null,
            key_fp: summary?.key ?? null,
            label: account.credentialRef,
            source: "credential 表",
            enabled: ctx.accountOverlay.get(account.credentialRef) ?? account.enabled,
          };
        }),
      );
      const kind = KIND_BY_PROTOCOL[id] ?? (pdef ? KIND_BY_PROTOCOL[pdef.protocol] ?? "channel" : "channel");
      const isChannel = kind === "channel";
      out.push({
        provider: id,
        env_prefix: envPrefix,
        kind,
        base_url: pdef?.baseUrl ?? null,
        model_count: ctx.registry.listRealModels(id).length,
        exists: pdef !== undefined,
        readable: true,
        error: null,
        count: accounts.length,
        accounts: accountInfos,
        login: isChannel ? {
          logged_in: accountInfos.some((a) => a.has_key),
          reason: accountInfos.some((a) => a.has_key) ? null : "未配置密钥",
        } : null,
      });
    }
    return out;
  };

  const recentLimit = (): number => {
    const raw = ctx.db.setting.get("ui.recent_limit")?.v ?? "50";
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(500, Math.max(1, Math.trunc(n))) : 50;
  };

  const toRecentRequests = (limit: number): RecentRequest[] =>
    ctx.ledger.recentRows(limit).map((r) => {
      // 输出速率 tok/s(recentRows 无 tps 字段,按引擎同款算法现算)。
      // ⚠️ 必须走 core 的 `computeTps`:它会识别「非流式」与「伪流式」
      // 两种 tps 分母不成立的情况,退回端到端吞吐 —— 早先这里直接
      // `(latency - ttft)`,遇到首块≈末块的上游会算出 43 万 tok/s。
      const tps = computeTps({
        completionTokens: r.completionTokens,
        latencyMs: r.latencyMs,
        ttftMs: r.ttftMs,
      });
      return {
        seq: r.lease.seq,
        conv: String(r.lease.convNo),
        real_model_id: r.lease.realModelId,
        logical_model: r.lease.logicalModel || null,
        endpoint_id: r.lease.endpointId,
        stream: r.lease.stream,
        ok: r.ok,
        status: r.status ?? null,
        error: r.error ?? null,
        latency_ms: r.latencyMs ?? null,
        ttft_ms: r.ttftMs ?? null,
        prompt_tokens: r.promptTokens ?? null,
        completion_tokens: r.completionTokens ?? null,
        cached_tokens: r.cachedTokens ?? null,
        tps,
        finished_s_ago: Math.round((monotonic() - r.finishedAt) * 10) / 10,
      };
    });

  /**
   * 时间范围 → [from, to]。
   *
   * ⚠️ **N 天/月档要把 `from` 夹到库内首日**(Nexus L946-947):选 365 而库里只有
   * 60 天数据时,直接 `to - 364` 会多画 ~305 根**空柱** —— 横轴被「没有数据的
   * 日子」撑开,趋势图看起来像用量断崖式下跌。Nexus 明确反对这种画法。
   */
  const usageWindow = (
    range: UsageRange,
    sortedDays: string[],
  ): { from: string | null; to: string | null } => {
    const to = sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : todayLocal();
    const first = sortedDays.length > 0 ? sortedDays[0] : null;
    switch (range) {
      case "7": return { from: clampDay(dayAdd(to, -6), first), to };
      case "30": return { from: clampDay(dayAdd(to, -29), first), to };
      case "90": return { from: clampDay(dayAdd(to, -89), first), to };
      case "365": return { from: clampDay(dayAdd(to, -364), first), to };
      default: { // "all":整个数据范围;无数据 → 全空
        if (sortedDays.length === 0) return { from: null, to: null };
        return { from: sortedDays[0], to: sortedDays[sortedDays.length - 1] };
      }
    }
  };

/**
 * `scheduler.cooldown_overrides` 的深校验 —— `{"<provider>": 分钟}`。
 *
 * 从 `scheduler.rules` 拆出来的独立键(2026-10-21):冷却熔断是失败恢复语义,
 * 与档位调度(priority)正交。写进 rules 里会让人以为改冷却就是改优先级。
 */
function validateCooldownOverrides(parsed: unknown): string | null {
  const KEY = "scheduler.cooldown_overrides";
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return `${KEY} 应为对象 {"<provider>": 分钟},收到 ${Array.isArray(parsed) ? "array" : typeof parsed}`;
  }
  for (const [pid, minutes] of Object.entries(parsed as Record<string, unknown>)) {
    if (pid.trim() === "") return `${KEY} 有空 provider 名`;
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
      return `${KEY}.${pid} 必须是正数(分钟),收到 ${JSON.stringify(minutes)}`;
    }
  }
  return null;
}

function validateRulesArray(parsed: unknown, priorityKey: string): string | null {
  const KEY = priorityKey;
  if (!Array.isArray(parsed)) {
    return `${KEY} 应为 JSON 数组,收到 ${parsed === null ? "null" : typeof parsed}`;
  }
  for (let i = 0; i < parsed.length; i += 1) {
    const n = i + 1;
    const item = parsed[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return `${KEY} 第 ${n} 条应为对象,收到 ${Array.isArray(item) ? "array" : typeof item}`;
    }
    const r = item as Record<string, unknown>;
    const provider = r["provider"];
    if (typeof provider !== "string" || provider.trim() === "") {
      return `${KEY} 第 ${n} 条:provider 必填且为非空字符串,收到 ${JSON.stringify(provider)}`;
    }
    const tag = `${KEY} 第 ${n} 条(provider=${JSON.stringify(provider)})`;
    // 键名即档位:元素里写 priority = 双真源,直接拒绝。
    if ("priority" in r && r["priority"] !== undefined && r["priority"] !== null) {
      return `${tag}:键名即档位,元素里不要写 priority(档位由 scheduler.rules_p<priority> 的键名决定)`;
    }
    const model = r["model"];
    if (model !== undefined && model !== null && (typeof model !== "string" || model.trim() === "")) {
      return `${tag}:model 必须是非空字符串,收到 ${JSON.stringify(model)}`;
    }
    // 已废弃字段**显式拒绝**并给替代写法(别让用户对着「未知字段」猜)。
    for (const [field, why] of [
      ["logical", "时段规则一律全局生效,请删除该字段"],
      ["times", "时段已收进 window 嵌套对象:写 window:{times:[...]}"],
      ["weekdays", "星期限定已收进 window 嵌套对象:写 window:{weekdays:[...]}"],
      ["cooldown", "冷却覆盖已拆到独立设置键 scheduler.cooldown_overrides"],
    ] as const) {
      if (field in r) return `${tag}:${field} 字段已废弃:${why}`;
    }
    const expires = r["expires_at"];
    if (expires !== undefined && expires !== null && (typeof expires !== "string" || expires.trim() === "")) {
      return `${tag}:expires_at 必须是非空字符串,收到 ${JSON.stringify(expires)}`;
    }
    const win = r["window"];
    if (win !== undefined && win !== null) {
      if (win === null || typeof win !== "object" || Array.isArray(win)) {
        return `${tag}:window 必须是对象 {weekdays?, times?},收到 ${Array.isArray(win) ? "array" : typeof win}`;
      }
      const w = win as Record<string, unknown>;
      const winExtra = Object.keys(w).filter((k) => k !== "times" && k !== "weekdays").sort();
      if (winExtra.length > 0) {
        return `${tag}:window 有未知键:${winExtra.join(", ")}(只认 times / weekdays)`;
      }
      const times = w["times"];
      if (times !== undefined && times !== null) {
        const okShape =
          Array.isArray(times) &&
          times.length > 0 &&
          times.every((span) => Array.isArray(span) && span.length === 2);
        if (!okShape) {
          return `${tag}:window.times 必须是 [["HH:MM","HH:MM"], ...] 形状的时段列表,收到 ${JSON.stringify(times)}`;
        }
        if (typeof model !== "string" || model.trim() === "") {
          return (
            `${tag}:带 window.times 的规则必须同时有非空 model(时段规则按 provider+model 精确匹配端点),` +
            `收到 model=${JSON.stringify(model)}`
          );
        }
        // 2026-10-24:五个档位键都允许时段规则(设置页五张卡统一显示星期/时间段框)。
        // 语义由档位决定:priority 4 = 时段内降级(仍在链里),其余档位 = 时段内不可用。
      }
      const weekdays = w["weekdays"];
      if (weekdays !== undefined && weekdays !== null) {
        const ok =
          Array.isArray(weekdays) &&
          weekdays.length > 0 &&
          weekdays.every((d) => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 7);
        if (!ok) return `${tag}:window.weekdays 必须是 1..7 的整数列表,收到 ${JSON.stringify(weekdays)}`;
      }
    }
  }
  return null;
}


  const methods = {
    async getStatus(): Promise<GatewayStatus> {
      const uptimeS = (Date.now() - ctx.startedAtMs) / 1000;
      // ⚠️ `deployments` / `healthy_count` / `cooldown_count` 三个数必须**同一
      // 分母**,否则页面上「N 个部署 / M 可用 / K 冷却」自相矛盾。
      //
      // Nexus `/status.deployments` 是**一行一条**:
      // - 每个逻辑模型一行(它的档 = 各成员的端点并集);
      // - 每个「不在任何逻辑模型里」的真实模型再单独一行(直通行)。
      // 以前这里 `deployments: ready ? 1 : 0` 是占位数字,而 healthy/cooldown
      // 按**端点**算 —— 三个数各说各话。现在按 Nexus 的行口径统一算:
      // 一行里的端点有任一在冷却 → 这一行算「冷却」,否则算「可用」。
      const nowS = wallNow();
      // 逻辑模型唯一真源 = db.logical_model(不读 registry 快照)。
      const dbLogicalRows = ctx.db.logicalModel.list();
      const logicalNames = dbLogicalRows.map((r) => r.name);
      const uniqueLogical = [...new Set(logicalNames)];
      const membersOf = (name: string): Array<{ provider: string; model: string }> => {
        const row = ctx.db.logicalModel.get(name);
        return row ? parseDbMembers(row.members) : [];
      };
      // 行 → 它名下所有端点的真实模型键集合
      const rows: string[][] = [];
      const inLogical = new Set<string>();
      for (const name of uniqueLogical) {
        const members = membersOf(name);
        if (members.length === 0) continue;
        const keys = members.map((m) => `${m.provider}/${m.model}`);
        for (const k of keys) inLogical.add(k);
        rows.push(keys);
      }
      for (const mv of deps.realModelMap().values()) {
        const key = `${mv.provider}/${mv.model}`;
        if (inLogical.has(key)) continue;
        // 直通行也要有端点(该 provider 名下至少一枚凭据)才算是「部署」
        if (ctx.registry.listAccounts(mv.provider).length === 0) continue;
        rows.push([key]);
      }
      /**
       * 一行（逻辑模型或直通真实模型）是否算「冷却中」。
       *
       * 2026-11-07 用户定案：「多key的情况下，所有key都错误才显示冷却」——
       * 与 models.ts 的模型总览行同口径：**所有端点都在冷却**才算这一行冷却；
       * 只要还有一枚端点能走，调度器就会挑它，面板不该报整行不可用。
       * 端点粒度含凭据（endpointIdOf 带 username），与调度器过滤口径一致。
       */
      const coolingOf = (realModelKeys: string[]): boolean => {
        for (const rmk of realModelKeys) {
          const slash = rmk.indexOf("/");
          const provider = rmk.slice(0, slash);
          const model = rmk.slice(slash + 1);
          const accounts = ctx.registry.listAccounts(provider);
          if (accounts.length === 0) continue; // 无端点 → 不算冷却（由「无凭据」另判）
          let cooling = 0;
          for (const acc of accounts) {
            const id = endpointIdOf(provider, model, splitRef(acc.credentialRef)[1]);
            const rec = ctx.health.get(id);
            if (rec.cooldownUntil > 0 && rec.cooldownUntil > nowS) cooling += 1;
          }
          // 该模型还有可用端点 → 这一行不算冷却
          if (cooling < accounts.length) return false;
        }
        // 所有成员的所有端点都在冷却（且至少有一个端点）→ 这一行冷却
        return realModelKeys.length > 0;
      };
      const cooldownCount = rows.filter(coolingOf).length;
      return {
        ready: gatewayReady(),
        reason: gatewayReason(),
        uptime_s: Math.round(uptimeS * 10) / 10,
        deployments: rows.length,
        healthy_count: rows.length - cooldownCount,
        cooldown_count: cooldownCount,
        metrics_enabled: true,
        metrics_generated_at: null,
        providers: await providers(),
      };
    },

    /**
     * 重启网关 —— **只保留给托盘菜单**(唯一入口)。
     *
     * 面板不再提供重启按钮(用户定案:重启网关唯一入口就是托盘菜单),这里刻意
     * 不暴露给 IPC:若仍被调用说明是旧渲染层残留,返回明确错误而不是静默成功。
     */
    async restartGateway(): Promise<ApiResult> {
      const message = await ctx.restartGateway();
      const ok = ctx.gatewayState.error === null && ctx.gatewayState.gateway !== null;
      return { ok, message };
    },

    async getRuntime(): Promise<RuntimeSnapshot> {
      const limit = recentLimit();
      const leases = ctx.ledger.detail();
      const byLogical = new Map<string, InflightLogicalGroup>();
      for (const l of leases) {
        const key = l.logicalModel || "";
        let group = byLogical.get(key);
        if (!group) {
          group = { logical_model: key, in_flight: 0, real_models: [], leases: [] };
          byLogical.set(key, group);
        }
        group.in_flight += 1;
        if (!group.real_models.includes(l.realModelId)) group.real_models.push(l.realModelId);
        group.leases.push({
          seq: l.seq,
          conv: String(l.convNo),
          real_model_id: l.realModelId,
          logical_model: l.logicalModel || null,
          endpoint_id: l.endpointId,
          stream: l.stream,
          elapsed_s: Math.round((monotonic() - l.startedAt) * 10) / 10,
        });
      }
      const byLogicalArray = [...byLogical.entries()]
        .map(([key, group]) => ({ ...group, logical_model: key }))
        .sort((a, b) =>
          a.logical_model === "" ? -1 : b.logical_model === "" ? 1
            : a.logical_model < b.logical_model ? -1 : 1);
      return {
        ready: gatewayReady(),
        uptime_s: Math.round(((Date.now() - ctx.startedAtMs) / 1000) * 10) / 10,
        in_flight_total: ctx.ledger.total(),
        by_real_model: ctx.ledger.snapshot(),
        by_logical_model: byLogicalArray,
        leases: byLogicalArray.flatMap((g) => g.leases),
        recent: toRecentRequests(limit),
        recent_limit: limit,
      };
    },

    async getUsageHistory(
      range: UsageRange,
      granularity: UsageGranularity,
      group: UsageGroup,
      source: UsageSource = "all",
    ): Promise<UsageHistory> {
      const rng: UsageRange = (["all", "7", "30", "90", "365"] as UsageRange[]).includes(range)
        ? range
        : "all";
      const gran: UsageGranularity = granularity === "month" ? "month" : "day";
      const grp: UsageGroup = group === "logical" ? "logical" : "model";
      const src: UsageSource =
        source === "gateway" || source === "external" ? source : "all";

      // 两张表先归一成同一种行,再走同一套聚合 —— 这就是「所有 = 直接相加」的实现:
      // 没有第二套口径,也没有"选择不相加"的特殊分支。
      const statRow = (
        row: {
          day: string;
          provider: string;
          model: string;
          logical_model?: string | null;
          prompt_tokens: number;
          cached_tokens: number;
          completion_tokens: number;
        },
        count: number,
        fails: number,
        gateway: boolean,
      ): UsageStatRow => ({
        day: row.day,
        provider: row.provider,
        model: row.model,
        logical_model: row.logical_model ?? null,
        count,
        fails,
        prompt: row.prompt_tokens,
        completion: row.completion_tokens,
        cached: row.cached_tokens,
        gateway,
      });

      const gatewayRows: UsageStatRow[] =
        src === "external"
          ? []
          : ctx.db.statsDaily
              .range("0000-01-01", "9999-12-31")
              .map((r) => statRow(r, r.requests, r.fails, true));
      const externalRows: UsageStatRow[] =
        src === "gateway"
          ? []
          : ctx.db.statsExternalDaily
              .range("0000-01-01", "9999-12-31")
              .map((r) => statRow(r, r.calls, 0, false));
      const allRows: UsageStatRow[] = [...gatewayRows, ...externalRows];

      const sortedDays = [...new Set(allRows.map((r) => r.day))].sort();
      const { from, to } = usageWindow(rng, sortedDays);
      const rows =
        from !== null && to !== null ? allRows.filter((r) => r.day >= from && r.day <= to) : [];

      // ⚠️ **tokens 合计 = prompt + completion**,cached 是 prompt 的**子集**、
      // 单独一列(Nexus `_RAW_KEYS` 口径)。以前这里写成
      // `prompt + completion + cached`,于是 cached 被双计,全页数值虚高,而且与
      // 同一行里的 `cache_miss = prompt - cached` 自相矛盾。
      const tokensOf = (row: UsageStatRow): number => row.prompt + row.completion;

      // ⚠️ **group=logical 时 `logical_model` 为空的行整行跳过**(S9 定案,
      // 2026-10-14):直连真实模型的用量没有逻辑名,落进「按逻辑模型」视图会把
      // 一个 `provider/model` 伪键塞进榜/趋势/供应商环/KPI。Nexus 的口径是
      // **没有「其他」桶、直接跳过**(直连 ≠ 逻辑模型)。
      // 只对**网关行**跳过没有逻辑名的行(S9 定案)。外部表本来就没有逻辑模型,
      // 对它们也跳过的话,「仅网关外 + 按逻辑模型」会整页空白。
      const skipRow = (row: UsageStatRow): boolean =>
        grp === "logical" && row.gateway && !(row.logical_model ?? "").trim();

      const seriesKeyOf = (row: UsageStatRow): string =>
        grp === "model"
          ? `${row.provider}/${row.model}`
          : String(row.logical_model ?? "").trim() || `${row.provider}/${row.model}`;

      const seriesMeta = (key: string): { name: string; provider: string | null; logical_model: string | null } => {
        if (grp === "model") {
          const idx = key.indexOf("/");
          return {
            name: idx >= 0 ? key.slice(idx + 1) : key,
            provider: idx >= 0 ? key.slice(0, idx) : null,
            logical_model: null,
          };
        }
        if (isLogicalModelName(key)) return { name: key, provider: null, logical_model: key };
        const idx = key.indexOf("/");
        if (idx >= 0) return { name: key, provider: key.slice(0, idx), logical_model: null };
        return { name: key, provider: null, logical_model: key };
      };

      const seriesAgg = new Map<string, RowAgg & { buckets: Map<string, RowAgg> }>();
      const provAgg = new Map<string, RowAgg & { models: Map<string, RowAgg> }>();
      const bucketTotals = new Map<string, RowAgg>();
      // ⚠️ active_days 只数**真有用量**的日子(tokens>0 或 requests>0),
      // 不是「有行就算」—— 全零行会把活跃天数灌水(Nexus L1065-1066 同口径)。
      const activeDays = new Set<string>();
      const totals: RowAgg = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 };

      const addTo = (agg: RowAgg, row: UsageStatRow, tokens: number): void => {
        agg.tokens += tokens;
        agg.requests += row.count;
        agg.fails += row.fails;
        agg.prompt += row.prompt;
        agg.completion += row.completion;
        agg.cached += row.cached;
      };

      for (const row of rows) {
        if (skipRow(row)) continue; // S9:直连行不进逻辑模型视图
        const bucketKey = gran === "month" ? row.day.slice(0, 7) : row.day;
        const tokens = tokensOf(row);
        if (tokens > 0 || row.count > 0) activeDays.add(row.day);
        addTo(totals, row, tokens);

        const skey = seriesKeyOf(row);
        let s = seriesAgg.get(skey);
        if (!s) { s = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0, buckets: new Map() }; seriesAgg.set(skey, s); }
        addTo(s, row, tokens);
        let sb = s.buckets.get(bucketKey);
        if (!sb) { sb = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 }; s.buckets.set(bucketKey, sb); }
        addTo(sb, row, tokens);

        let p = provAgg.get(row.provider);
        if (!p) { p = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0, models: new Map() }; provAgg.set(row.provider, p); }
        addTo(p, row, tokens);
        const mkey = `${row.provider}/${row.model}`;
        let pm = p.models.get(mkey);
        if (!pm) { pm = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 }; p.models.set(mkey, pm); }
        addTo(pm, row, tokens);

        let bt = bucketTotals.get(bucketKey);
        if (!bt) { bt = { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 }; bucketTotals.set(bucketKey, bt); }
        addTo(bt, row, tokens);
      }

      // ⚠️ 并列名次 tie-break = `(-tokens, key)` 字典序(Nexus L1074/L1196-1197):
      // 同分时次序必须稳定,否则每次刷新榜单都在换位。
      const byTokensThenKey = (
        a: [string, { tokens: number }],
        b: [string, { tokens: number }],
      ): number => b[1].tokens - a[1].tokens || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

      const sortedSeries = [...seriesAgg.entries()].sort(byTokensThenKey);
      // 前 10 名各自成条,尾部聚合成「其他」哨兵行(可展开成明细)——
      // 与 Nexus `_TOP_MODELS=10` 同值。以前是前 5 且尾部静默丢弃,
      // 于是「第 6 名以后的用量」从榜上、环上、图上一起消失,总量对不齐。
      const TOP_MODELS = 10;
      const TOP_PROVIDERS = 5;
      const topSeries = sortedSeries.slice(0, TOP_MODELS);
      const displayKeys = new Set(topSeries.map(([k]) => k));
      // 「其他」哨兵键:NUL 开头,真实模型引用是 `provider/model`、逻辑模型是
      // 名字,都不可能以 NUL 开头 → 不会撞键(Nexus `_OTHER_MODEL` 同值)。
      const OTHER_MODEL_KEY = "\u0000other";

      const subModels = (seriesKey: string, aggTokens: number): UsageSeriesModel[] => {
        const agg = seriesAgg.get(seriesKey);
        if (!agg) return [];
        const byModel = new Map<string, { tokens: number; provider: string }>();
        for (const row of rows) {
          if (skipRow(row)) continue;
          if (seriesKeyOf(row) !== seriesKey) continue;
          const mk = `${row.provider}/${row.model}`;
          const cur = byModel.get(mk) ?? { tokens: 0, provider: row.provider };
          cur.tokens += tokensOf(row);
          byModel.set(mk, cur);
        }
        return [...byModel.entries()]
          .map(([mk, v]) => ({
            name: mk.slice(mk.indexOf("/") + 1),
            provider: v.provider,
            tokens: v.tokens,
            percent: pct(v.tokens, aggTokens),
          }))
          .sort((a, b) => b.tokens - a.tokens);
      };

      const series: UsageSeries[] = topSeries.map(([key, agg]) => {
        const meta = seriesMeta(key);
        return {
          key,
          name: meta.name,
          provider: meta.provider,
          logical_model: meta.logical_model,
          tokens: agg.tokens,
          requests: agg.requests,
          cache_hit: agg.cached,
          cache_miss: Math.max(0, agg.prompt - agg.cached),
          percent: pct(agg.tokens, totals.tokens),
          is_other: false,
          models: subModels(key, agg.tokens),
        };
      });

      // 尾部聚合行:tokens/requests 为被折叠序列之和,percent 分母同区间总量。
      // ⚠️ 只有确实有被折叠的序列时才追加(空「其他」行比没有更糟)。
      const foldedSeries = sortedSeries.slice(TOP_MODELS);
      if (foldedSeries.length > 0) {
        const foldedTokens = foldedSeries.reduce((sum, [, agg]) => sum + agg.tokens, 0);
        const foldedRequests = foldedSeries.reduce((sum, [, agg]) => sum + agg.requests, 0);
        series.push({
          key: OTHER_MODEL_KEY,
          name: "其他",
          provider: null,
          logical_model: null,
          tokens: foldedTokens,
          requests: foldedRequests,
          cache_hit: foldedSeries.reduce((sum, [, agg]) => sum + agg.cached, 0),
          cache_miss: foldedSeries.reduce((sum, [, agg]) => sum + Math.max(0, agg.prompt - agg.cached), 0),
          percent: pct(foldedTokens, totals.tokens),
          is_other: true,
          models: [],
          folded: foldedSeries.map(([key, agg]) => {
            const meta = seriesMeta(key);
            return {
              key,
              name: meta.name,
              provider: meta.provider,
              tokens: agg.tokens,
              requests: agg.requests,
              percent: pct(agg.tokens, totals.tokens),
              models: subModels(key, agg.tokens),
            };
          }),
        });
        displayKeys.add(OTHER_MODEL_KEY);
      }

      const axis = from !== null && to !== null
        ? (gran === "month" ? monthAxis(from, to) : rangeDays(from, to))
        : [];
      const buckets: UsageBucket[] = axis.map((bk) => {
        const bt = bucketTotals.get(bk) ?? { tokens: 0, requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0 };
        const bySeries = [...displayKeys].map((key) => ({
          key,
          tokens: key === OTHER_MODEL_KEY
            ? foldedSeries.reduce(
                (sum, [, agg]) => sum + (agg.buckets.get(bk)?.tokens ?? 0), 0)
            : (seriesAgg.get(key)?.buckets.get(bk)?.tokens ?? 0),
        }));
        const bySum = bySeries.reduce((sum, e) => sum + e.tokens, 0);
        return {
          key: bk,
          tokens: bt.tokens,
          requests: bt.requests,
          fails: bt.fails,
          cache_hit: bt.cached,
          cache_miss: Math.max(0, bt.prompt - bt.cached),
          // Nexus `_pct(cached, prompt)` 口径:round 4 位、prompt=0 → null。
          cache_hit_rate: bt.prompt > 0 ? Math.round((bt.cached / bt.prompt) * 1e4) / 1e4 : null,
          by_series: bySeries,
          other: Math.max(0, bt.tokens - bySum),
        };
      });

      // 供应商排名(对齐 Nexus api_pages.py _metrics_history_page 的 providers 聚合):
      // 按 (-tokens, 键) 排序,前 5 名(_TOP_PROVIDERS)各自成条,排名尾部的供应商
      // 聚合成「其他」行 —— is_other=true、机器键 "\u0000pother"(与 Nexus
      // _OTHER_PROVIDER 同值)、tokens/requests 为被聚合供应商之和、percent
      // 分母同 Nexus(区间总量 totals.tokens)。folded 填被聚合供应商明细
      // (provider/key/name/tokens/requests/percent/models)。仅当确实有被聚合
      // 的供应商时才追加「其他」行。
      // ⚠️ **tokens=0 的供应商不进榜**(Nexus L1199/L1210):只发过请求、一个 token
      // 都没回报的供应商会占一个榜位,把有量用的挤下去。
      const providerRanked = [...provAgg.entries()]
        .filter(([, agg]) => agg.tokens > 0)
        .sort(byTokensThenKey);

      const providerModels = (
        pid: string,
        agg: RowAgg & { models: Map<string, RowAgg> },
      ): UsageSeriesModel[] =>
        [...agg.models.entries()]
          .filter(([, m]) => m.tokens > 0)
          .map(([mk, m]) => ({
            name: mk.slice(mk.indexOf("/") + 1),
            provider: pid,
            tokens: m.tokens,
            percent: pct(m.tokens, agg.tokens),
          }))
          .sort((a, b) => b.tokens - a.tokens);

      const providers: UsageProvider[] = providerRanked.slice(0, TOP_PROVIDERS).map(([pid, agg]) => ({
        provider: pid,
        tokens: agg.tokens,
        requests: agg.requests,
        percent: pct(agg.tokens, totals.tokens),
        is_other: false,
        models: providerModels(pid, agg),
      }));

      const foldedProviders = providerRanked.slice(TOP_PROVIDERS);
      if (foldedProviders.length > 0) {
        const foldedTokens = foldedProviders.reduce((sum, [, agg]) => sum + agg.tokens, 0);
        const foldedRequests = foldedProviders.reduce((sum, [, agg]) => sum + agg.requests, 0);
        providers.push({
          provider: "\u0000pother",
          tokens: foldedTokens,
          requests: foldedRequests,
          percent: pct(foldedTokens, totals.tokens),
          is_other: true,
          models: [],
          folded: foldedProviders.map(([pid, agg]) => ({
            provider: pid,
            key: pid,
            name: pid,
            tokens: agg.tokens,
            requests: agg.requests,
            percent: pct(agg.tokens, totals.tokens),
            models: providerModels(pid, agg),
          })),
        });
      }

      const usageTotals: UsageTotals = {
        tokens: totals.tokens,
        requests: totals.requests,
        fails: totals.fails,
        prompt_tokens: totals.prompt,
        completion_tokens: totals.completion,
        cached_tokens: totals.cached,
        cache_hit: totals.cached,
        cache_miss: Math.max(0, totals.prompt - totals.cached),
        cache_hit_rate: totals.prompt > 0 ? Math.round((totals.cached / totals.prompt) * 1e4) / 1e4 : null,
        active_days: activeDays.size,
      };

      return {
        generated_at: new Date().toISOString(),
        source:
          src === "gateway"
            ? "stats_daily"
            : src === "external"
              ? "stats_external_daily"
              : "stats_daily + stats_external_daily",
        scope: src,
        range: rng,
        granularity: gran,
        group: grp,
        from,
        to,
        last_day: sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : null,
        axis,
        totals: usageTotals,
        top: series[0] ?? null,
        series,
        buckets,
        providers,
      };
    },

    /**
     * 网关外用量(DSH 直连其它 provider)。
     *
     * **与 getUsageHistory 完全独立**:不合并、不相加、不共享 KPI。两边的
     * `calls`(上游调用)与 `requests`(客户端请求)不是一个量纲,一旦混算就再也
     * 对不上账。数据来自 `session/event` 实时采集,没有历史回填。
     */
    async getExternalUsage(range: UsageRange): Promise<ExternalUsage> {
      const rng: UsageRange = (["all", "7", "30", "90", "365"] as UsageRange[]).includes(range)
        ? range
        : "all";
      const allRows = ctx.db.statsExternalDaily.range("0000-01-01", "9999-12-31");
      const sortedDays = [...new Set(allRows.map((r) => r.day))].sort();
      const { from, to } = usageWindow(rng, sortedDays);
      const rows = from !== null && to !== null ? ctx.db.statsExternalDaily.range(from, to) : [];

      let tokens = 0;
      let calls = 0;
      let prompt = 0;
      let completion = 0;
      let cached = 0;
      const active = new Set<string>();
      const perKey = new Map<string, { tokens: number; calls: number }>();
      const perDay = new Map<string, { tokens: number; calls: number }>();

      for (const row of rows) {
        // total = prompt + completion(cached 是 prompt 的子集,不双计)
        const t = row.prompt_tokens + row.completion_tokens;
        tokens += t;
        calls += row.calls;
        prompt += row.prompt_tokens;
        completion += row.completion_tokens;
        cached += row.cached_tokens;
        if (t > 0 || row.calls > 0) active.add(row.day);

        const key = `${row.provider}/${row.model}`;
        const k = perKey.get(key) ?? { tokens: 0, calls: 0 };
        k.tokens += t;
        k.calls += row.calls;
        perKey.set(key, k);

        const d = perDay.get(row.day) ?? { tokens: 0, calls: 0 };
        d.tokens += t;
        d.calls += row.calls;
        perDay.set(row.day, d);
      }

      const series: ExternalUsageSeries[] = [...perKey.entries()]
        .map(([key, v]) => {
          const idx = key.indexOf("/");
          return {
            key,
            provider: idx >= 0 ? key.slice(0, idx) : key,
            model: idx >= 0 ? key.slice(idx + 1) : key,
            tokens: v.tokens,
            calls: v.calls,
            percent: tokens > 0 ? v.tokens / tokens : 0,
          };
        })
        .sort((a, b) => b.tokens - a.tokens || b.calls - a.calls);

      const daily: ExternalUsageDaily[] = [...perDay.entries()]
        .map(([day, v]) => ({ day, tokens: v.tokens, calls: v.calls }))
        .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

      return {
        range: rng,
        from,
        to,
        last_day: sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : null,
        totals: {
          tokens,
          calls,
          prompt_tokens: prompt,
          completion_tokens: completion,
          cached_tokens: cached,
          cache_hit_rate: prompt > 0 ? Math.round((cached / prompt) * 1e4) / 1e4 : null,
          active_days: active.size,
        },
        series,
        daily,
      };
    },

    /**
     * 指标页数据(对齐 Nexus `GET /metrics` → `_metrics_page`)。
     *
     * 数据源是 `stats_daily`(按天聚合,D20/D21);TTFT / TPS / 缓存命中率**一律
     * 从原料现算**。
     *
     * ⚠️ v4 的 `stats_daily` **没有凭据维度**,所以「端点」这一层退化成真实
     * 模型本身 —— 页面按 deployment 展示时不会凭空多出一行。
     */
    async getMetrics(days?: number): Promise<MetricsSnapshot> {
      const span = Math.max(1, Math.min(365, Math.trunc(Number(days ?? 7))));
      const fromDay = dayAdd(todayLocal(), -(span - 1));
      const rows = ctx.db.statsDaily.range(fromDay, todayLocal());
      const perModel = new Map<string, {
        requests: number; fails: number; prompt: number; completion: number; cached: number;
        latencySum: number; ttftSum: number; ttftReq: number;
      }>();
      for (const r of rows) {
        const mid = `${r.provider}/${r.model}`;
        const cur = perModel.get(mid) ?? {
          requests: 0, fails: 0, prompt: 0, completion: 0, cached: 0,
          latencySum: 0, ttftSum: 0, ttftReq: 0,
        };
        cur.requests += r.requests;
        cur.fails += r.fails;
        cur.prompt += r.prompt_tokens;
        cur.completion += r.completion_tokens;
        cur.cached += r.cached_tokens;
        cur.latencySum += r.latency_sum_ms;
        cur.ttftSum += r.ttft_sum_ms;
        cur.ttftReq += r.ttft_requests;
        perModel.set(mid, cur);
      }
      const rowOf = (a: {
        requests: number; fails: number; prompt: number; completion: number; cached: number;
        latencySum: number; ttftSum: number; ttftReq: number;
      }) => {
        // 按天聚合的 tps 用「平均请求」口径:平均耗时 = latencySum/requests,
        // 平均首字节 = ttftSum/ttftReq(只对流式请求求均值,非流式不参与)。
        // 把三个均值喂给同一个 tps 计算函数,与逐请求/引擎侧完全同源,
        // 避免面板按天那一列和「最近请求」那一列出现两套公式。
        const avgLatencyMs = a.requests > 0 ? a.latencySum / a.requests : 0;
        const avgTtftMs = a.ttftReq > 0 ? a.ttftSum / a.ttftReq : null;
        const avgTps = computeTps({
          completionTokens: a.completion,
          latencyMs: avgLatencyMs,
          ttftMs: avgTtftMs,
        });
        return {
          requests: a.requests,
          fails: a.fails,
          // ⚠️ total = prompt + completion(cached 是 prompt 子集,不双计)
          total: a.prompt + a.completion,
          prompt_tokens: a.prompt,
          completion_tokens: a.completion,
          cached_tokens: a.cached,
          cache_hit: a.cached,
          cache_miss: Math.max(0, a.prompt - a.cached),
          cache_hit_rate: a.prompt > 0 ? Math.round((a.cached / a.prompt) * 1e4) / 1e4 : null,
          avg_ttft_ms: a.ttftReq > 0 ? round1(a.ttftSum / a.ttftReq) : null,
          avg_tps: avgTps,
          latency_day: null,
        };
      };
      const models = [...perModel.entries()]
        .sort((a, b) => b[1].requests - a[1].requests)
        .map(([mid, agg]) => {
          const row = rowOf(agg);
          return {
            model: mid,
            overall: row,
            buckets: [row],
            deployments: [{
              deployment: mid,
              deployment_id: mid,
              overall: row,
              buckets: [row],
            }],
          };
        });
      return {
        enabled: true,
        generated_at: new Date().toISOString(),
        uptime_s: Math.round((Date.now() - ctx.startedAtMs) / 1000),
        source: "stats_daily",
        models,
      };
    },

    async getRecentRequests(limit?: number): Promise<RecentRequest[]> {
      const n = limit === undefined ? recentLimit() : Math.min(500, Math.max(1, Math.trunc(Number(limit))));
      return toRecentRequests(n);
    },

    /**
     * 某 DSH 会话**当前请求**的真实模型(输入框内徽标用)。
     *
     * 两段取数,对应两种真实状态:
     *
     * 1. **在途**(`ctx.ledger.detail()` 里租约的 `sessionId` 命中)→ 这就是
     *    「当前这次请求正在用谁」,是账本里的**精确值**,不是推断。租约在
     *    `router.commit` 时建立、`router.finish` 时释放,窗口恰好等于请求时长。
     * 2. **空闲** → 会话亲和 pin(`router.pins`)指向的端点;再拿选中的模型去
     *    `scheduler.chain()` 把 `endpointId` 翻回「哪台真实模型」。pin 只在
     *    **仍在候选链里**时才算数(规则改过之后旧 pin 可能指向已下线的成员)。
     *
     * 数据源一律是**内存账本 / 路由表**,不是 JSONL 明细日志 —— 后者在
     * 「不记录日志」档位下完全不写(用户定案 `off` = 明细全停写),拿它当数据源
     * 会让徽标在用户关掉日志后凭空消失。
     *
     * ⚠️ 都查不到就返回 `null`(新会话没跑过 / 规则全变 / 后端未就绪)→ 界面
     * **什么都不画**。编一个「上次是 X」比如实空着更糟 —— 上一版就是那么做的,
     * 用户看到的因此永远是过去式(2026-11-01 定案改掉)。
     */
    async getSessionCurrentRoute(
      sessionId: string,
      model?: string,
    ): Promise<SessionCurrentRoute | null> {
      const wanted = String(sessionId ?? "");
      if (wanted === "") return null;

      const routeOf = (
        realModelId: string,
        logical: string | null,
        inFlight: boolean,
      ): SessionCurrentRoute => {
        const slash = realModelId.indexOf("/");
        const provider = slash > 0 ? realModelId.slice(0, slash) : "";
        const modelId = slash > 0 ? realModelId.slice(slash + 1) : realModelId;
        // 展示名以库为准;查询异常不该把整个徽标弄没,降级成 null。
        let displayName: string | null = null;
        try {
          displayName = ctx.db.realModel.get(provider, modelId)?.name ?? null;
        } catch {
          displayName = null;
        }

        // 逻辑模型的人话名(`logical_model.display_name`,用户自填的那一列):
        // - 库里有 → 用它(如「快速档」之于 `fast`);
        // - 库里没有 / 空串 / 查询异常 → **回退成逻辑名本身**,不留 null ——
        //   徽标的语义是「这格写的是人话,不是键」,裸 `is_logical` 已经把
        //   「有一条逻辑链」这件事说清楚了,缺的只是名字。而「查不到就不画」
        //   归 `getSessionCurrentRoute` 返回 null 那一层管,不在这里。
        let logicalLabel: string | null = null;
        if (logical !== null && logical !== "") {
          try {
            logicalLabel = (ctx.db.logicalModel.get(logical)?.display_name ?? "").trim();
          } catch {
            logicalLabel = null;
          }
          logicalLabel = logicalLabel === "" ? logical : logicalLabel;
        }

        // provider 的人话名:唯一的 provider id → 人话映射(在 core 里);
        // **未知 provider 原样保留 id,绝不编名** —— 内部扫描出来的渠道没有名字,
        // 编一个好听的出来就是界面在撒谎。
        const providerLabel = provider === "" ? null : providerDisplayName(provider);

        return {
          logical_model: logical === "" ? null : logical,
          logical_display_name: logicalLabel,
          real_model_id: realModelId,
          provider,
          model: modelId,
          display_name: displayName === "" ? null : displayName,
          provider_display_name: providerLabel,
          is_logical: logical !== null && logical !== "" && logical !== realModelId,
          in_flight: inFlight,
        };
      };

      // 1) 在途请求优先 —— 「当前请求」的字面含义。
      const lease = ctx.ledger.detail().find((row) => row.sessionId === wanted);
      if (lease !== undefined) {
        return routeOf(lease.realModelId, lease.logicalModel, true);
      }

      // 2) 空闲:亲和 pin → 候选链里的那台成员。
      const selected = String(model ?? "");
      if (selected === "") return null;
      const pinned = ctx.router.pins.get(wanted);
      if (pinned === null) return null;
      let chain: ReturnType<typeof ctx.scheduler.chain>;
      try {
        chain = ctx.scheduler.chain(selected);
      } catch {
        // 未知模型 / 调度器异常 → 查不到,不画。
        return null;
      }
      const hit = chain.find((item) => item.endpoint.endpointId === pinned);
      if (hit === undefined) return null;
      return routeOf(`${hit.endpoint.provider}/${hit.endpoint.model}`, selected, false);
    },

    async getUsageSummary(): Promise<UsageHistory> {
      // 旧面板方法保留:直接转发用量聚合的轻量视图。
      return methods.getUsageHistory("all", "day", "model");
    },

    async getRequestLogStatus(): Promise<RequestLogStatus> {
      return methods.getRequestLog();
    },

    async listProviders(): Promise<ProviderState[]> {
      return providers();
    },

    async setAccountEnabled(providerId: string, index: number, enabled: boolean): Promise<void> {
      const accounts = ctx.registry.listAccounts(String(providerId ?? ""));
      const account = accounts[Number(index)];
      if (!account) return;
      // 唯一写口:缓存 + 落库(重启后仍然记得「这个账号被停用了」)。
      ctx.setAccountEnabled(account.credentialRef, Boolean(enabled));
    },

    async getSettings(): Promise<SettingsRead> {
      const sections: Record<string, Record<string, string>> = {};
      for (const spec of SETTING_FIELDS) {
        let value = ctx.db.setting.get(spec.key)?.v ?? null;
        if (value === null || value === "") {
          // 缺失就**播种**并把实际生效值回显(不是零)。
          //
          // ⚠️ `scheduler.rules_p<priority>` 的播种值是核心层那份 `CONFIG_DEFAULTS`
          // 按档位分好的数组 —— 以前这里跳过它、回显空串,于是设置页显示
          // 「一条规则都没有」,而引擎实际按默认规则跑。用户改了其中一条再保存,
          // 等于把其余几条一起抹掉。2026-10-22 拆 5 键后每个档位键单独播种。
          const seed =
            spec.key.startsWith("scheduler.rules_p")
              ? rulesDefaultsJson(Number(spec.key.slice("scheduler.rules_p".length)))
              : spec.key === "scheduler.cooldown_overrides"
                ? cooldownDefaultsJson()
                : spec.def;
          ctx.db.setting.set(spec.key, seed);
          value = seed;
        }
        // 段名默认按键前缀推导,`section` 可覆盖(Nexus 把 `real.wait_budget_s`
        // 摆在 retry 段,见 SETTING_FIELDS 那条注释)。
        const dot = spec.key.indexOf(".");
        const section = spec.section ?? (dot > 0 ? spec.key.slice(0, dot) : spec.key);
        const group = sections[section] ?? (sections[section] = {});
        group[spec.key] = value;
      }
      const masterKey = ctx.keyProvider.getKey() ?? null;
      const specs: SettingSpec[] = SETTING_FIELDS.map((f) => ({
        key: f.key,
        kind: f.kind,
        label: f.label,
        ...(f.min === undefined ? {} : { min: f.min }),
        ...(f.max === undefined ? {} : { max: f.max }),
        ...(f.section === undefined ? {} : { section: f.section }),
      }));
      return {
        sections,
        specs,
        master_key: masterKey,
        master_key_note: masterKey ? null : "未设置 ONE_API_KEY:当前无鉴权",
      };
    },

    /**
     * 写设置 —— **逐项按规格校验**(对齐 Nexus `_settings_save`):
     * 未知键拒绝、越界拒绝、JSON 形状不合法拒绝。
     *
     * ⚠️ 为什么必须**先验再落库**:所有这些都是「存进去也不生效」的形状 ——
     * 越界的刷新间隔被运行期夹回默认、坏 JSON 被引擎整段回落、`times` 规则
     * 没有 `model` 永远命中不了任何端点。用户改了半天发现「没生效」,就是一个
     * 静默死开关;保存时报错才能让他当场知道。
     */
    async saveSettings(payload: Record<string, Record<string, string>>): Promise<ApiResult> {
      const byKey = new Map(SETTING_FIELDS.map((f) => [f.key, f]));
      // 1) 先把提交体拍平成 [完整键, 原始值],同时拒绝未知段 / 未知键。
      const incoming: Array<{ spec: SettingFieldSpec; raw: unknown }> = [];
      for (const section of Object.keys(payload ?? {})) {
        const fields = payload[section] ?? {};
        if (fields === null || typeof fields !== "object") continue;
        for (const fieldKey of Object.keys(fields)) {
          const fullKey = fieldKey.includes(".") ? fieldKey : `${section}.${fieldKey}`;
          const spec = byKey.get(fullKey);
          if (!spec) {
            return { ok: false, message: `未知设置项:${fullKey}` };
          }
          incoming.push({ spec, raw: (fields as Record<string, unknown>)[fieldKey] });
        }
      }

      // 2) 逐项校验 + 规范化成入库字符串。
      const writes: Array<{ key: string; value: string }> = [];
      for (const { spec, raw } of incoming) {
        if (spec.kind === "bool") {
          const truthy = raw === true || raw === 1 || raw === "1" || raw === "true" || raw === "True";
          writes.push({ key: spec.key, value: truthy ? "1" : "0" });
          continue;
        }
        if (spec.kind === "int" || spec.kind === "float") {
          const text = typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
          const num = Number(text);
          if (text === "" || !Number.isFinite(num)) {
            return { ok: false, message: `${spec.key} 必须是数字,收到:${JSON.stringify(raw)}` };
          }
          if (spec.kind === "int") {
            if (!Number.isInteger(num)) {
              return { ok: false, message: `${spec.key} 必须是整数,收到:${text}` };
            }
            if (spec.min !== undefined && num < spec.min) {
              return { ok: false, message: `${spec.key} 不能小于 ${spec.min},收到:${num}` };
            }
            if (spec.max !== undefined && num > spec.max) {
              return { ok: false, message: `${spec.key} 不能大于 ${spec.max},收到:${num}` };
            }
            writes.push({ key: spec.key, value: String(num) });
            continue;
          }
          if (spec.min !== undefined && num < spec.min) {
            return { ok: false, message: `${spec.key} 不能小于 ${spec.min},收到:${num}` };
          }
          if (spec.max !== undefined && num > spec.max) {
            return { ok: false, message: `${spec.key} 不能大于 ${spec.max},收到:${num}` };
          }
          writes.push({ key: spec.key, value: String(num) });
          continue;
        }
        if (spec.kind === "json") {
          let parsed: unknown;
          // 表单送来的是 textarea 文本,但结构化值(list/dict)也照收 ——
          // 直接调 API 的脚本天然想发对象,而 `String({...})` 拿去 JSON.parse 必炸。
          if (typeof raw === "object" && raw !== null) {
            parsed = raw;
          } else {
            try {
              parsed = JSON.parse(String(raw ?? ""));
            } catch (exc) {
              return {
                ok: false,
                message: `${spec.key} 不是合法 JSON:${exc instanceof Error ? exc.message : String(exc)}`,
              };
            }
          }
          if (spec.key.startsWith("scheduler.rules_p")) {
            const bad = validateRulesArray(parsed, spec.key);
            if (bad !== null) return { ok: false, message: bad };
            // 规范化成缩进格式再入库:用户写紧凑 JSON 也能被识别,下次回显格式统一。
            writes.push({ key: spec.key, value: JSON.stringify(parsed, null, 2) });
            continue;
          }
          if (spec.key === "scheduler.cooldown_overrides") {
            const bad = validateCooldownOverrides(parsed);
            if (bad !== null) return { ok: false, message: bad };
            writes.push({ key: spec.key, value: JSON.stringify(parsed, null, 2) });
            continue;
          }
          writes.push({ key: spec.key, value: JSON.stringify(parsed, null, 2) });
          continue;
        }
        writes.push({ key: spec.key, value: String(raw ?? "") });
      }

      for (const w of writes) ctx.db.setting.set(w.key, w.value);
      try {
        ctx.scheduler.invalidate(); // 规则/退避改了要让调度器下次重新读配置
      } catch {
        /* 缓存失效失败不影响保存结果 */
      }
      // scheduler.rules_p<priority> 是注册表快照的一部分(引擎按 registry.listSchedulerRules
      // 之外还会读 setting,但 dsh-plugin / 面板读数走注册表),换快照保持一致。
      if (writes.some((w) => w.key.startsWith("scheduler.rules"))) ctx.syncRegistry();
      const changed = writes.map((w) => w.key);
      return {
        ok: true,
        message: changed.length > 0 ? `已保存 ${changed.length} 项设置` : "没有需要保存的设置",
        changed,
      };
    },

    async getRequestLog(): Promise<RequestLogStatus> {
      // Nexus api_pages.py `_request_log_status`(L5255-5292) 对齐:
      // enabled 只看 setting 是否就是 "1";content_mode 默认 "off";path 恒为
      // logs 目录;size_bytes 最近 30 个日志文件求和;counters 是 stats_daily 规模。
      const rawEnabled = ctx.db.setting.get("request_log.enabled")?.v ?? "1";
      const rawMode = ctx.db.setting.get("request_log.content_mode")?.v;
      const mode = parseContentMode(rawMode, "off");
      const logsDir = join(ctx.dataDir, "logs");
      let logFiles: string[] = [];
      try {
        logFiles = readdirSync(logsDir).filter((f) => /^requests-\d{8}\.jsonl$/.test(f)).sort();
      } catch {
        // logs 目录尚不存在(Nexus:files 空,path 照常返回)
      }
      const recent = logFiles.slice(-30);
      let sizeBytes = 0;
      let written = 0;
      for (const f of recent) {
        try {
          sizeBytes += statSync(join(logsDir, f)).size;
          written += countJsonlLines(join(logsDir, f));
        } catch {
          // 文件在 stat 之后被轮转/删除:跳过(宁可少报也不抛)
        }
      }
      const counters = ctx.db.statsDaily.counters(dayKey(Date.now() - 86_400_000));
      return {
        enabled: rawEnabled === "1",
        content_mode: mode,
        // 逐字对齐 Nexus `api_pages.py` L5284-5289 的中文说明。
        content_modes: REQUEST_LOG_CONTENT_MODES,
        path: logsDir,
        size_bytes: sizeBytes,
        // `written` = 日志文件里真实的**条目数**(D20:逐请求明细不入库,
        // 库里只有按天聚合的 stats_daily —— 「已写几条」只能从文件数)。
        // `log_files` 一并给出文件名,便于核对「大小与条数对不对得上」。
        counters: { ...counters, written },
        log_files: recent,
        last_error: null,
      };
    },

    async setRequestLog(patch: { enabled?: boolean; content_mode?: import("./types.js").RequestLogContentMode }): Promise<ApiResult> {
      // Nexus api_pages.py `_request_log_set`(L5294-5308) 对齐:
      // 非法 content_mode 报错文案逐字对齐(400);enabled bool → "1"/"0"。
      const mode = patch?.content_mode;
      if (mode !== undefined) {
        const text = String(mode);
        if (!["off", "structure", "full", "edges"].includes(text)) {
          return {
            ok: false,
            message: `content_mode 只能是 off/structure/full/edges,收到:'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
          };
        }
        ctx.db.setting.set("request_log.content_mode", text);
      }
      if (patch?.enabled !== undefined) {
        ctx.db.setting.set("request_log.enabled", patch.enabled ? "1" : "0");
      }
      return {
        ok: true,
        enabled: (ctx.db.setting.get("request_log.enabled")?.v ?? "1") === "1",
        content_mode: ctx.db.setting.get("request_log.content_mode")?.v ?? "off",
        message: "已保存请求日志设置",
      };
    },

    /**
     * SenseNova「刷新」—— 页面那个按钮以前只 `load()` 本地库(所以「刷了没反应」)。
     * 现在真干两件事(都是**不烧额度**的元数据/控制台接口):
     *   ① 上游模型目录:`token.sensenova.cn/v1/models`(API key 认证)→ 落 db.real_model;
     *   ② 积分池:清空冷却闸门重拉(JWT 过期且已存密码 → 串行免登录续期再拉)。
     */


    // ── SenseNova 登录与账号管理(镜像 Nexus /sensenova/login、/refetch-key、/accounts) ──


    // ── 数据目录 ────────────────────────────────────────────────────────────
    async getDataDir(): Promise<DataDirInfo> {
      const logsDir = join(ctx.dataDir, "logs");
      return {
        data_dir: ctx.dataDir,
        credentials_dir: ctx.dataDir,
        logs: existsSync(logsDir) ? logsDir : "",
        state: "ok",
      };
    }
  };

  return { methods };
}
