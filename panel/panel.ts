/**
 * `createPanel` —— 面板方法总装(域工厂 → 一份 Panel 对象)。
 *
 * 它与各域一起住在 `@as-one/panel`,Electron 主进程与 DSH 插件宿主**调用同一份**:
 * 装配层只要构造出 {@link PanelContext} 再补宿主专有依赖({@link PanelDeps}),
 * 两边面板行为就不会漂移。
 *
 * ⚠️ 面板方法的唯一真源是 `db`(SQLite)+ 运行期对象(registry / vault /
 * scheduler / router / ledger / health);这里不缓存任何派生状态,每次调用现读。
 */

import type { CredentialVault } from "@as-one/core/src/config/credentials.js";
import { providerDisplayName } from "@as-one/core/src/config/provider-labels.js";
import { CHECKIN_PROVIDERS, checkinSupported } from "@as-one/core/src/connectors/checkin.js";
import { MINIMAX_QUOTA_TIMEOUT_MS } from "@as-one/core/src/collector/quota.js";
import { minimaxSigninStatus } from "@as-one/core/src/connectors/minimax-signin.js";
import { minimaxAccountFor } from "./minimax-renew.js";
import { panelClaimedToday, panelTodayPoints } from "@as-one/core/src/connectors/minimax-wire.js";
import { generalPoolSummary } from "./sensenova-pool.js";

import type { PanelContext } from "./context.js";
import { realModelMapOf } from "./modelview.js";
import type { ModelView } from "./modelview.js";
import { parseDbMembers, splitRef } from "./utils.js";
import { createChannelsDomain } from "./channels.js";
import { createSensenovaDomain } from "./sensenova.js";
import { createModelsDomain } from "./models.js";
import { createOverviewDomain } from "./overview.js";
import { createQoderDomain } from "./qoder.js";
import { getCachedCheckin, setCachedCheckin, invalidateCheckinCache } from "./checkin-cache.js";
import type {
  ApiResult,
  ChannelModelPatch,
  ChannelModelSpec,
  ChannelOverview,
  ChannelOverviewAccount,
  ChannelOverviewCard,
  CheckinAllResult,
  CheckinChannelStatus,
  CheckinOverview,
  LogicalModelsWriteInput,
  ProviderState,
  RecentRequest,
  RendererApi,
  RequestLogStatus,
  UsageGranularity,
  UsageGroup,
  UsageHistory,
  UsageRange,
} from "./types.js";

/**
 * 面板装配的宿主依赖 —— 只有一样东西必须由装配层提供:
 * `syncSensenovaPool`(读 vault 里的 secret 重灌连接器账号池;vault 实例是各宿主
 * 自己的,所以不能写在面板包里)。其余全部来自 {@link PanelContext}。
 */
export interface PanelDeps {
  /** 用库里 sensenova 凭据重灌连接器账号池(整池替换,保留同名运行态)。 */
  syncSensenovaPool: (vault: CredentialVault) => Promise<void>;
}

/** `createPanel` 的产物:方法表 + sensenova key 自愈入口(网关 401 时用)。 */
export interface PanelBundle {
  panel: Panel;
  /**
   * sensenova 账号的 API key 自愈(先探活,失效则建新 key 并换池)。
   * 网关注入点拿到 401/403 时 fire-and-forget 调它;建 key 要等 IAM 传播,
   * 所以**不阻塞当轮请求**,当轮仍按失败处理(照常落冷却)。
   */
  snRepairKey: (username: string, reason: string) => Promise<{
    ok: boolean;
    message: string;
    created: boolean;
    dropped: string[];
  }>;
}

export interface Panel extends RendererApi {
  listProviders(): Promise<ProviderState[]>;
  setAccountEnabled(provider: string, index: number, enabled: boolean): Promise<void>;
  getRecentRequests(limit?: number): Promise<RecentRequest[]>;
  getRequestLogStatus(): Promise<RequestLogStatus>;
  getUsageSummary(): Promise<UsageHistory>;
  /** 网关运维:重启监听(托盘菜单与面板按钮同一实现,返回人话结论)。 */
  restartGateway(): Promise<ApiResult>;
}

export function createPanel(ctx: PanelContext, deps: PanelDeps): PanelBundle {
  // 网关状态**每次现读**(不缓存):restartGateway 会换掉 ctx.gatewayState.gateway。
  
  // 暴露面的内存 overlay(setDeploymentExposure 记录用户意图;持久化由逻辑模型成员表达)。
  // 模型暴露标记(setModelExposure / setSensenovaExposure)已改为真写 db.real_model.hidden。
  

  // ── 小工具 ───────────────────────────────────────────────────────────────

  
  const getSetting = (key: string, fallback: string): string => {
    const v = ctx.db.setting.get(key)?.v;
    return v === null || v === undefined || v === "" ? fallback : v;
  };

  /** stats_daily 最大日期(= 数据里"今天";无数据 → null)。 */
  const lastStatsDay = (): string | null => {
    const row = ctx.db.raw.prepare("SELECT MAX(day) AS m FROM stats_daily").get() as
      | { m: string | null }
      | undefined;
    return row?.m ?? null;
  };

  /** 该 provider 的启用账户(overlay 优先,其次配置)。 */
  const enabledAccounts = (pid: string): Array<{ username: string; credentialRef: string }> =>
    ctx.registry.listAccounts(pid)
      .filter((a) => ctx.accountOverlay.get(a.credentialRef) ?? a.enabled)
      .map((a) => ({ username: splitRef(a.credentialRef)[1], credentialRef: a.credentialRef }));

  /** 真实模型视图(注册表为主,db.real_model 行作 overlay)。 */
  const realModelMap = (pid?: string): Map<string, ModelView> =>
    realModelMapOf(ctx.registry, ctx.db, pid);

  const modelViewOf = (provider: string, model: string): ModelView | undefined =>
    realModelMap(provider).get(`${provider}/${model}`);

  

  
  /**
   * 从所有逻辑模型的 `members` 里摘掉 `targetRealModelId`(`"provider/model"`),
   * 返回摘掉的**成员条数**(跨逻辑模型累加)。对齐 Nexus
   * `api.py:_strip_member_from_logical_models`。
   *
   * ⭐ 为什么必须连锁摘: `logical_model.members` 是 JSON 数组,**没有**
   * `ON DELETE CASCADE` —— 直接删 `real_model` 行会让引用它的档链留下一档
   * 指向空气(调度时 `endpointChain` 展开出 0 个端点,整条链静默少一档)。
   * Nexus 2026-10-18(m04740)把旧的「409 拦下来让用户先去手动摘」改成
   * 「删除即连锁摘除」。
   *
   * ⚠️ **摘除时保持原数组顺序** —— `members` 的有序性就是 priority(D13),
   * 过滤掉一项后其余项下标整体前移,恰好等于「这一档没了、后面顺位顶上」。
   *
   * ⚠️ 只动 **db.logical_model**(唯一真源);摘完调用 syncRegistry 让内存
   * 索引立刻对齐,页面与调度同时消失。返回值 = 真正摘掉的条数。
   */
  const stripMemberFromLogicalModels = (targetRealModelId: string): number => {
    let removed = 0;
    const [tp, tm] = [targetRealModelId.slice(0, targetRealModelId.indexOf("/")),
      targetRealModelId.slice(targetRealModelId.indexOf("/") + 1)];
    for (const row of ctx.db.logicalModel.list()) {
      const parsed = parseDbMembers(row.members);
      const kept = parsed.filter((m) => !(m.provider === tp && m.model === tm));
      if (kept.length === parsed.length) continue;
      ctx.db.logicalModel.update({
        name: row.name,
        members: JSON.stringify(kept),
      });
      removed += parsed.length - kept.length;
    }
    return removed;
  };/**
   * 该 (provider, model) **自己最近一个有可用计时数据的那天**的全部原料
   * (Nexus `_deployments_list` 的 `valid/ranked` 窗口查询,2026-10-14 用户定)。
   *
   * ⭐ 三条口径,一条都不能改:
   * 1. **逐模型各自取最近一天**,不取全库同一天 —— 不同模型的流量分布差得远
   *    (有的天天在用,有的半个月才调一次),强行统一到全库最后一天会让冷门模型
   *    永远没有徽章,而它们上一次调用的数字其实还在库里。
   * 2. **异常行整行剔除**:`latency_sum_ms` / `ttft_sum_ms` / `ttft_requests`
   *    **任意一个为 0** 就当「这天没采到计时」跳过,继续往前找。历史上有一段
   *    日子网关还没埋 TTFT,那几天三列全是 0;不剔掉会把分母压成 0,或者拿
   *    0 ms 冒充一次真实的首字延迟。
   * 3. **选中日全部字段都按那一天取**,不只是 TTFT/TPS 两个比率 —— 否则同一行里
   *    会出现「TTFT 是 10-13 的、请求数是全历史的」这种缝合怪。
   *
   * ⚠️ `latency_day` 是**选中那天的日期字符串**(「这条数字是哪天的」),
   * 不是平均延迟毫秒数。以前它返回 `latencySum / requests`,前端
   * `latencyTitle` 按 Nexus 口径当日期渲染,于是把一个毫秒数当天,
   * tooltip 里出现「2026-10-19 记录 · 1234 ms」之外的第三处错位。
   * 从来没有有效计时行 → `latency_day = null`,两个徽章都不显示。
   */
  // ── 旧兼容:providers 视图 / 最近请求 ─────────────────────────────────────

  
  
  // ── 用量历史聚合(getUsageHistory 的共享骨架) ─────────────────────────────

  
  /**
 * `scheduler.rules_p<priority>` 的深校验 —— 数组形状,键名即档位。
 *
 * 2026-10-22 用户定案拆 5 键:priority 1/2/3/4/0 各一个键,数组元素里
 * **不写 priority**(键名即档位,写了由这里拒绝,避免双真源)。
 *
 * 为什么保存时就要拒:下面每一种形状**存进去都不会生效**(引擎会逐条回落),
 * 而回落后用户看到的是「我明明改了,怎么没变化」。挑几个最典型的:
 * - 带 `times` 的规则**必须同时有 model**:引擎 `_rules_for` 按精确
 *   `provider+model` 匹配端点,没有 model 的时段规则永远命中不了任何端点;
 * - 时段规则(带 `window.times`)只允许出现在 priority 0(禁用)或 4(高峰降级)
 *   两个档位键里;写进 1/2/3 档在读取端会被静默按 exclude 处理
 *   (「priority 1 莫名变成禁用」);
 * - `cooldown` 规则只进冷却覆盖表、**不参与调度**,出现在这里就是死配置。
 *
 * @param priorityKey 档位键名(如 `scheduler.rules_p4`),决定这条校验允许什么。
 * @returns 错误文案;`null` = 通过。
 */


  // ── 域装配 ──────────────────────────────────────────────────────────────
  // 拆分第五刀:渠道域(48 闭包 + 17 方法 + 3 个客户端路径函数)已搬去
  // assembly-channels.ts;第四刀:sensenova 域已搬去 assembly-sensenova.ts。
  // 顺序有讲究:sensenova 域要拿渠道域的目录缓存与合并结果,所以渠道域先建。
  const chd = createChannelsDomain(ctx, {
    realModelMap,
    modelViewOf,
    stripMemberFromLogicalModels,
    /**
     * Qoder 额度刷新(2026-11-09 用户报「qoder 不会自动更新」)。
     *
     * 用 getter 延迟解引用:`qd` 在下面才创建(顺序有讲究),直接传引用会是
     * undefined;而调用发生在用户点「刷新」时,那时 `qd` 早就就位了。
     *
     * 行为:逐账号打上游拉积分(`qoderCredits` 内部已有单飞与冷却),
     * 结果写进 qoder 域的 `lastCredits` —— 卡头 `channelOverview` 读的就是它。
     */
    qoderQuotaRefresh: () => async (force: boolean) => {
      try {
        const rows = await qd.methods.qoderCredits("qoder");
        let written = 0;
        let failed = 0;
        const errors: Record<string, string> = {};
        for (const r of rows) {
          if (r.error) {
            failed += 1;
            errors[`qoder/${r.account}`] = r.error;
          } else {
            written += 1;
          }
        }
        const probed = rows.length;
        const message =
          probed === 0
            ? "qoder 下没有账号,跳过额度"
            : `已刷新 ${written}/${probed} 个账号的积分` +
              (failed > 0 ? `,${failed} 个失败` : "");
        return { probed, written, message, errors };
      } catch (e) {
        return {
          probed: 0,
          written: 0,
          message: `qoder 额度刷新失败:${errTextOf(e)}`,
          errors: { qoder: errTextOf(e) },
        };
      }
    },
  });

  const snn = createSensenovaDomain(ctx, {
    lastStatsDay,
    realModelMap,
    modelViewOf,
    mergedChannelModels: chd.mergedChannelModels,
    chCatalogCache: chd.chCatalogCache,
    chCatalogGate: chd.chCatalogGate,
    chAwaitCatalog: chd.chAwaitCatalog,
    mergeCatalog: chd.mergeCatalog,
    syncSensenovaPool: deps.syncSensenovaPool,
  });

  const od = createOverviewDomain(ctx, { realModelMap });

  // Qoder 域(第七刀):独立管理页的数据面。账号池真源是 vault,启停是
  // accountOverlay,模型勾选是 configDir/qoder-models.json —— 都不改库表。
  const qd = createQoderDomain(ctx);

  // 模型域(第六刀):逻辑模型 / 部署与暴露 / 供应商侧读写。
  // 三个共享闭包走 deps —— 它们也被渠道域与 sensenova 域用,只留一份在这里。
  const md = createModelsDomain(ctx, {
    realModelMap,
    modelViewOf,
    stripMemberFromLogicalModels,
    lastStatsDay,
    accountsWithKeySync: chd.accountsWithKeySync,
    accountsWithKey: chd.accountsWithKey,
    // 「尝试从上游获取」思考档位:trae/workbuddy/sensenova 的档位只在
    // 各自的目录端点里,得走渠道域这条现成的路。
    chAwaitCatalog: chd.chAwaitCatalog,
  });

  // 签到总览 / 一键全部签到(总览页「每日签到」卡)。
  //
  // 真源分散在两个域:trae/workbuddy 在渠道域(checkinStatus/checkinClaim),
  // qoder 在 qoder 域(活动 CLAIM_BENEFIT 的 claimStatus + qoderCheckin)。
  // 这里只做**聚合**,不自己打上游。
  const errTextOf = (err: unknown): string => {
    if (err instanceof Error) return `${err.constructor.name}: ${err.message}`.slice(0, 300);
    return String(err).slice(0, 300);
  };
  const checkinLabelOf = (pid: string): string => providerDisplayName(pid);

  const checkinOverviewImpl = async (): Promise<CheckinOverview> => {
    const channels: CheckinChannelStatus[] = [];

    // 每个渠道的「打上游取状态」fetcher + 按日缓存(2026-11-07 性能定案):
    // 签到一天一次,同周期内重复进页面不再打上游;失败只缓存 1 分钟。
    // fetcher 返回 CheckinChannelStatus,failed 由 error 字段有无决定。
    const cachedChannel = async (
      provider: string,
      /**
       * 取数回调。返回 `null` = **这一行不该出现**(典型:渠道一个账号都没有)。
       *
       * ⚠️ 2026-11-09 用户定案「accounts === 0 直接隐藏行」:隐藏是**展示层
       * 的决定**,所以让它从这里表达,而不是塞一个 accounts=0 的空状态
       * 再让前端过滤 —— 后者会让「缓存里有什么」和「页面显示什么」两套口径。
       * 返回 null 时**不写缓存**(下次照样重新判,账号导入后立刻出现)。
       */
      fetcher: () => Promise<CheckinChannelStatus | null>,
    ): Promise<CheckinChannelStatus | null> => {
      const hit = getCachedCheckin(provider);
      if (hit !== undefined) return hit.value as CheckinChannelStatus;
      let result: CheckinChannelStatus | null;
      try {
        result = await fetcher();
      } catch (e) {
        // fetcher 自己兜错误(不抛);走到这里说明它坏了,兜一层再缓存。
        result = {
          provider,
          label: checkinLabelOf(provider),
          supported: true,
          accounts: 0,
          countExact: false,
          checkedIn: null,
          pending: null,
          dailyCredit: null,
          perAccountCredit: null,
          streak: null,
          reason: null,
          error: errTextOf(e),
        };
      }
      // null = 隐藏:不写缓存,免得「隐藏」被缓存成一份可命中的值。
      if (result === null) return null;
      setCachedCheckin(provider, result, result.error !== null);
      return result;
    };

    // ── workbuddy:原生签到模块(representative status + 账号数)──
    // ⚠️ trae / minimax 都不在这条通道里:它们必须**逐账号读**(见下方专段)——
    //   代表账号通道只给一个 0/1,两个账号「一个已签一个未签」会显示错,
    //   且「领到多少」按账号可能不同(400/1000 连签档),聚合会吞掉数字。
    //   trae 在 2026-11-09 从这条通道拆出(用户报「两个账号只显示一个」)。
    for (const pid of CHECKIN_PROVIDERS) {
      if (pid === "minimax" || pid === "trae") continue;
      const pdef = ctx.registry.getProvider(pid);
      const protocol = pdef?.protocol?.toLowerCase() ?? "";
      if (!pdef || !checkinSupported(protocol)) {
        // ⚠️ 未配置 / 不支持签到的渠道**不再出现在概览里**(2026-11-09 用户定案
        // 「accounts === 0 直接隐藏行」):一行「不支持签到」既不提供信息,
        // 又把「本可以签到、只是还没导入账号」的渠道混在一起,看起来像故障。
        continue;
      }
      {
        // ⚠️ cachedChannel 可能返回 null(该渠道 0 账号 → 不占一行)。
        // 用局部变量接住再判,避免把 null 塞进 channels(那会让下游
        // `.provider` 读到 undefined)。
        const row = await cachedChannel(pid, async () => {
          const accounts = await chd.methods.getChannelAccounts(pid).catch(() => []);
          // 0 账号 → 不占一行(用户定案:accounts === 0 直接隐藏)。
          if (accounts.length === 0) return null;
          try {
            const st = await chd.methods.checkinStatus(pid);
            const claimed =
              st.checked_in === true || st.did_checked_in === true
                ? true
                : st.checked_in === false || st.did_checked_in === false
                  ? false
                  : null;
            return {
              provider: pid,
              label: checkinLabelOf(pid),
              supported: true,
              accounts: accounts.length,
              countExact: false,
              checkedIn: claimed === null ? null : claimed ? 1 : 0,
              pending: claimed === null ? null : claimed ? 0 : 1,
              dailyCredit: st.daily_credit ?? st.today_credit ?? null,
              perAccountCredit: null,
              streak: st.streak_days ?? null,
              reason: st.reason ?? null,
              error: st.error ?? null,
            };
          } catch (e) {
            return {
              provider: pid,
              label: checkinLabelOf(pid),
              supported: true,
              accounts: accounts.length,
              countExact: false,
              checkedIn: null,
              pending: null,
              dailyCredit: null,
              perAccountCredit: null,
              streak: null,
              reason: null,
              error: errTextOf(e),
            };
          }
        });
        if (row !== null) channels.push(row);
      }
    }

    // ── minimax:逐账号读签到面板 ──────────────────────────────────────────
    // countExact=true:每个账号单独查(两个号一个已签一个未签时,代表账号通道
    // 会显示错);dailyCredit = 各账号「今日档」积分之和 —— 已签时读作「今天
    // ── trae:逐账号查签到(2026-11-09 用户报「两个账号只显示一个」)──
    //
    // 以前 trae 走上面的「代表账号」通道(checkinStatus 只查第一个带令牌的账号),
    // 所以 2 个账号时 `checkedIn` 只有 0/1、`countExact:false` —— 页面显示
    // 「Trae 已签」,看不出是 1 个还是 2 个账号签了。改成与 minimax/qoder
    // 同一口径:逐账号查,`countExact:true`,前端就能显示 `已签 2/2`。
    //
    // ⚠️ 签到是**账号级幂等**的(trae 侧实测:`checked_in` 恒按账号返回),
    // 所以逐账号查不会产生重复领取 —— 这里只读 status,不发 claim。
    if (ctx.registry.getProvider("trae")) {
      const row = await cachedChannel("trae", async () => {
        const accounts = await chd.methods.getChannelAccounts("trae").catch(() => []);
        // 0 账号 → 不占一行(用户定案:accounts === 0 直接隐藏)。
        if (accounts.length === 0) return null;
          let checkedIn = 0;
          let pending = 0;
          let dailyCredit = 0;
          let error: string | null = null;
          /**
           * 被「本设备今日已签」挡住的账号数(2026-11-11)。
           *
           * 只用于把 `reason` 写清 —— **不参与 checkedIn/pending 的计数**。
           * 那些账号在计数上就是「未签」(它们确实没签到),但原因是设备限制,
           * 不是账号有问题。
           */
          let deviceBlocked = 0;
          for (const acc of accounts) {
            // 逐账号查:checkinClaim 的 `_index` 参数走同一套账号索引。
            const st = await chd.methods.checkinStatus("trae", acc.index).catch((e: unknown) => {
              error = errTextOf(e);
              return null;
            });
            if (st === null) continue;
            if (st.error) {
              error = error ?? st.error;
              continue;
            }
            // ⚠️ **只有真的签上了才计积分**(2026-11-11 用户报「今日 +200」不对)。
            //
            // `st.daily_credit` 是「这个账号今日的额度」——**未签的账号也有**
            // (bvbhu 已签 100、用户2767 未签也是 100),旧代码全加 → 显示 +200,
            // 但实际只领到 100。改成只累计 `checked_in === true` 的账号。
            const points = st.daily_credit ?? st.today_credit ?? 0;
            // ⚠️ **只有 `checked_in` 才算「这个账号已签」**(2026-11-11 用户指出)。
            //
            // 以前把 `did_checked_in`(设备已签)也算进去,于是同机第二个账号
            // 明明没签到、却因为「本设备今日已签」被计成「已签」——
            // 页面显示 `已签 2/2`,看起来像两个号都签上了,实际只有一个。
            //
            // 两者语义完全不同:
            // - `checked_in`    = **这个账号**今天领到了;
            // - `did_checked_in` = **这台设备**今天签过(可能是别的账号签的)。
            //
            // 设备已签的账号应算「未签」,并在文案里说清原因(见下方 reason)。
            const claimed =
              st.checked_in === true ? true : st.checked_in === false ? false : null;
            if (claimed === true) {
              checkedIn += 1;
              // 只有真签上的账号才把它的当日额度计进来(见上方 points 的说明)。
              if (points > 0) dailyCredit += points;
            } else if (claimed === false) {
              pending += 1;
            }
            // 记下「本设备已签」的账号数:用于把 reason 写清(不改变计数口径)。
            if (st.checked_in !== true && st.did_checked_in === true) deviceBlocked += 1;
          }
          return {
            provider: "trae",
            label: checkinLabelOf("trae"),
            supported: true,
            accounts: accounts.length,
            // ⚠️ **不显示账号数**(2026-11-11 用户定案)。
            //
            // trae 按**设备**放行每日签到:同一台机器上的多个账号,一天只有第一个
            // 能签上,其余全是 9095「本设备今日已签」。这是上游硬限制,绕不过去。
            //
            // 所以「已签 1/2」这种比例**没有意义** —— 那个「未签的 1」永远签不上,
            // 显示成 2 分之 1 只会让人以为「再点点就好了」。改成只报**结果**:
            // 签上了就是「已签 +100」,没签上就是「未签」,不说分母。
            countExact: false,
            checkedIn,
            pending,
            dailyCredit: dailyCredit > 0 ? dailyCredit : null,
            // 不显示「×N」:同上,账号数不是这行的有效信息。
            perAccountCredit: null,
            streak: null,
            // 设备限制说清:有账号被「本设备已签」挡住时,如实解释为什么签不上。
            reason:
              deviceBlocked > 0
                ? "trae 按设备放行:本设备今日已签(同机多账号一天只能签一个)"
                : null,
            error,
          };
      });
      if (row !== null) channels.push(row);
    }

    // ── minimax:逐账号查(见上方注释:代表账号通道会吞掉数字)──
    if (ctx.registry.getProvider("minimax")) {
      const row = await cachedChannel("minimax", async () => {
          const summaries = await ctx.vault.list("minimax");
          let checkedIn = 0;
          let pending = 0;
          let dailyCredit = 0;
          let error: string | null = null;
          // 每账号今日积分:全部相同才给 perAccountCredit(前端显示「值×账号数」)。
          const perAccountPoints: number[] = [];
          for (const s of summaries) {
            // 走 minimaxAccountFor:它绑定 onAuthExpired,401 时自动用
            // refresh_token 续期并重试(2026-11-07:token 寿命只有数小时)。
            const bound = await minimaxAccountFor(ctx.vault, "minimax", s.username);
            if (bound === null) {
              error = error ?? `账号 ${s.username} 没有可用令牌`;
              continue;
            }
            try {
              const panel = await minimaxSigninStatus(bound.account, {
                timeoutMs: MINIMAX_QUOTA_TIMEOUT_MS,
                ...bound.httpOptions,
              });
              const points = panelTodayPoints(panel);
              if (points > 0) {
                dailyCredit += points;
                perAccountPoints.push(points);
              }
              if (panelClaimedToday(panel)) checkedIn += 1;
              else pending += 1;
            } catch (e) {
              error = errTextOf(e);
            }
          }
          return {
            provider: "minimax",
            label: checkinLabelOf("minimax"),
            supported: true,
            accounts: summaries.length,
            countExact: true,
            checkedIn,
            pending,
            dailyCredit: dailyCredit > 0 ? dailyCredit : null,
            // 多账号且各账号积分完全一致 → 给统一单账号值(前端显示 `400×2`)
            perAccountCredit:
              perAccountPoints.length > 1 && new Set(perAccountPoints).size === 1
                ? perAccountPoints[0]!
                : null,
            streak: null,
            reason: null,
            error,
          };
      });
      if (row !== null) channels.push(row);
    }

    // ── qoder:逐账号查 CLAIM_BENEFIT 活动的 claimStatus ──
    {
      const row = await cachedChannel("qoder", async () => {
        const acc = await qd.methods.getQoderAccounts();
        let checkedIn = 0;
        let pending = 0;
        // 逐账号求和(2026-11-07 合并页定案):「今日积分」= 每个账号可领/已领的
        // 当日额度之和,不是最后一个账号的值 —— 与 minimax 同口径。
        let dailyCredit = 0;
        // 每账号今日积分:全部相同才给 perAccountCredit(前端显示「值×账号数」)。
        const perAccountAmounts: number[] = [];
        let reason: string | null = null;
        let error: string | null = null;
        for (const row of acc.accounts) {
          if (!row.hasPat) {
            reason = reason ?? "账号缺 PAT,无法查询签到";
            continue;
          }
          const res = await qd.methods.qoderCampaigns("qoder", row.account);
          if (res.error) {
            error = res.error;
            continue;
          }
          const daily = res.campaigns.find((c) => c.actionType === "CLAIM_BENEFIT");
          if (!daily) {
            pending += 1;
            continue;
          }
          if (typeof daily.amount === "number") {
            dailyCredit += daily.amount;
            perAccountAmounts.push(daily.amount);
          }
          if (daily.claimStatus === "CLAIMED") checkedIn += 1;
          else pending += 1;
        }
        return {
          provider: "qoder",
          label: checkinLabelOf("qoder"),
          supported: true,
          accounts: acc.count,
          countExact: true,
          checkedIn,
          pending,
          dailyCredit,
          // 多账号且各账号积分完全一致 → 给统一单账号值(前端显示 `100×2`)
          perAccountCredit:
            perAccountAmounts.length > 1 && new Set(perAccountAmounts).size === 1
              ? perAccountAmounts[0]!
              : null,
          streak: null,
          reason,
          error,
        };
      });
      if (row !== null) channels.push(row);
    }

    return { channels };
  };

  // ── 渠道页卡头聚合(2026-11-07 合并页定案)──────────────────────────────
  //
  // **只读缓存,绝不打上游**:卡头"余额常显"的数据源是各域的运行期缓存
  // (chQuotaCache / qoderCreditsCached / sensenovaQuotaCached)。缓存没命中
  // 就显示「未采集」,展开卡片后由页面自己的刷新走真取数。
  // 五个渠道固定顺序:Trae → MiniMax → Qoder → SenseNova → WorkBuddy(隐藏)。
  const channelOverviewImpl = async (): Promise<ChannelOverview> => {
    const cards: ChannelOverviewCard[] = [];

    const accountsOfProvider = async (pid: string): Promise<ChannelOverviewAccount[]> => {
      const out: ChannelOverviewAccount[] = [];
      for (const acc of ctx.registry.listAccounts(pid)) {
        const [, username] = splitRef(acc.credentialRef);
        const cached = chd.chQuotaCache.get(`${pid}/${username}`);
        const snap = cached?.snapshot ?? null;
        out.push({
          label: username,
          left: snap?.remaining ?? null,
          expiresAtMs: snap?.expires_at ? snap.expires_at * 1000 : null,
          // trae/workbuddy 的到期来自上游包里真实到期(minimax 走自己的分支)
          expiresEstimated: false,
          fetchedAtMs: cached?.fetchedAtMs ?? 0,
        });
      }
      return out;
    };

    // Trae / WorkBuddy:运行期额度缓存(chQuotaCache)
    for (const pid of ["trae", "workbuddy"]) {
      const accounts = await accountsOfProvider(pid);
      cards.push({
        provider: pid,
        label: checkinLabelOf(pid),
        signedIn: accounts.length > 0,
        accounts,
        note: null,
      });
    }

    // MiniMax:额度缓存(probe_minimax_quota 写的同一份 chQuotaCache)
    {
      const accounts = await accountsOfProvider("minimax");
      cards.push({
        provider: "minimax",
        label: checkinLabelOf("minimax"),
        signedIn: accounts.length > 0,
        accounts,
        note: null,
      });
    }

    // Qoder:qoderCredits 的运行期缓存(账号行里读到的那份)
    {
      const cached = qd.methods.qoderCreditsCached();
      const accounts: ChannelOverviewAccount[] = cached.map((c) => ({
        label: c.account,
        left:
          c.userQuota?.remaining != null || c.addOnQuota?.remaining != null
            ? (c.userQuota?.remaining ?? 0) + (c.addOnQuota?.remaining ?? 0)
            : null,
        expiresAtMs: c.expiresAt !== null ? c.expiresAt * 1000 : null,
        // qoder 的到期是签到积分 FIFO 阶梯**估算**(2026-11-05 定案)
        expiresEstimated: true,
        fetchedAtMs: 0,
      }));
      // 从没拉过额度也要按凭据行出行(显示「未采集」),整卡不能因为缓存空就消失。
      if (accounts.length === 0) {
        for (const acc of ctx.registry.listAccounts("qoder")) {
          const [, username] = splitRef(acc.credentialRef);
          accounts.push({ label: username, left: null, expiresAtMs: null, expiresEstimated: true, fetchedAtMs: 0 });
        }
      }
      cards.push({
        provider: "qoder",
        label: checkinLabelOf("qoder"),
        signedIn: accounts.length > 0,
        accounts,
        note: null,
      });
    }

    // SenseNova:2026-11-08 重新设计 —— 卡头与展开页共用 generalPoolSummary。
    // 以前这里读 quota.remaining(= 活动积分 + 7d 余量,如 914,851),展开页读
    // w5_remaining(如 119,839),同一张卡两个对不上的数字;expires_at 还是控制台
    // JWT 会话到期(卡头那个 03-04),跟积分没关系。现在主数字统一取通用池的
    // 5h 可用,时间取 5h 窗口重置,且按凭据行把账号列全。
    {
      const cached = new Map(
        snn.methods.sensenovaQuotaCached().map((c) => [c.username, c]),
      );
      // ⚠️ 以 registry 的凭据行为准出行:以前只在「一条缓存都没有」时补行,
      // 于是 3 个账号只拉到 2 个额度快照时,第三个账号在卡头直接消失。
      // 缓存里有、registry 没列出的账号也补上 —— 两个来源的 username 口径
      // 万一漂移,宁可多列也别把有数据的账号弄丢。
      const names = ctx.registry
        .listAccounts("sensenova")
        .map((acc) => splitRef(acc.credentialRef)[1]);
      const known = new Set(names);
      const labels = [...names, ...[...cached.keys()].filter((u) => !known.has(u))];
      const accounts: ChannelOverviewAccount[] = labels.map((username) => {
        const hit = cached.get(username);
        const pool = generalPoolSummary(hit?.quota.pools ?? null);
        return {
          label: username,
          left: pool?.remaining ?? null,
          expiresAtMs: pool?.w5ResetAt ? pool.w5ResetAt * 1000 : null,
          expiresEstimated: false,
          fetchedAtMs: hit?.fetchedAtMs ?? 0,
        };
      });
      cards.push({
        provider: "sensenova",
        label: checkinLabelOf("sensenova"),
        signedIn: accounts.length > 0,
        accounts,
        note: null,
      });
    }

    return { cards };
  };

  const panel: Panel = {
    // ── 总览 ───────────────────────────────────────────────────────────────
    ...chd.methods,
    ...snn.methods,
    ...md.methods,
    ...od.methods,
    ...qd.methods,

    // ── 签到总览 / 一键全部签到(总览页「每日签到」卡)────────────────────
    checkinOverview: () => checkinOverviewImpl(),
    channelOverview: () => channelOverviewImpl(),
    checkinAll: async (confirm: boolean): Promise<CheckinAllResult> => {
      const confirmOn = confirm === true;
      const parts: string[] = [];
      let anyOk = false;
      /** 成功签到/已签的渠道数(摘要用,不塞进长文案)。 */
      let okChannels = 0;
      /** 失败的渠道(摘要里点名,方便用户知道去查哪个)。 */
      const failedLabels: string[] = [];

      // trae / workbuddy
      for (const pid of CHECKIN_PROVIDERS) {
        const pdef = ctx.registry.getProvider(pid);
        const protocol = pdef?.protocol?.toLowerCase() ?? "";
        if (!pdef || !checkinSupported(protocol)) continue;
        // ⚠️ **没有凭据的渠道直接跳过**(2026-11-09 用户报「提示太长太乱」):
        // WorkBuddy 因 11140 熔断被物理删光凭据后,每次「全部签到」都会往
        // 摘要里塞一句「该渠道没有凭据,无法签到」—— 那不是签到结果,是噪音。
        // 与概览卡「accounts === 0 直接隐藏行」同一口径。
        const accounts = await chd.methods.getChannelAccounts(pid).catch(() => []);
        if (accounts.length === 0) continue;
        try {
          const r = await chd.methods.checkinClaim(pid, confirmOn);
          if (r.ok) {
            anyOk = true;
            okChannels += 1;
          } else {
            failedLabels.push(checkinLabelOf(pid));
          }
          parts.push(`${checkinLabelOf(pid)}:${r.message ?? (r.ok ? "签到完成" : "签到失败")}`);
        } catch (e) {
          failedLabels.push(checkinLabelOf(pid));
          parts.push(`${checkinLabelOf(pid)}:${errTextOf(e)}`);
        }
      }

      // qoder:整池逐个签(qoderCheckin 内部已按账号池循环)
      try {
        const views = await qd.methods.qoderCheckin("qoder");
        const claimed = views.filter((v) => v.status === "claimed").length;
        const already = views.filter((v) => v.status === "already-claimed").length;
        const unavailable = views.filter((v) => v.status === "unavailable").length;
        if (claimed + already > 0) {
          anyOk = true;
          // Qoder 也是一个渠道:计入摘要的成功数(与上面循环同口径)。
          okChannels += 1;
        } else if (unavailable > 0) {
          failedLabels.push("Qoder");
        }
        parts.push(
          `Qoder:签到 ${claimed} / 已签 ${already}${unavailable ? ` / 不可用 ${unavailable}` : ""}`,
        );
      } catch (e) {
        failedLabels.push("Qoder");
        parts.push(`Qoder:${errTextOf(e)}`);
      }

      // ⚠️ 真签到动作后必须打掉日缓存(2026-11-07 缓存引入):否则下面重读
      // 拿到的还是「签之前」的缓存,「签完还显示未签」就回来了。
      // confirm=false 的 dry-run 没改任何状态,但重读一次也无妨(它会把新结果
      // 写回缓存,周期内后续读取继续命中)。
      invalidateCheckinCache();
      const channels = (await checkinOverviewImpl()).channels;
      // ⚠️ 摘要**短**:以前把每个渠道的完整 message 用 ` · ` 串起来,一行能到
      // 两三百字(截图里就是一整段),既难读又把真正的失败点淹没。
      // 现在只给「成功几个 / 失败哪几个」,细节看下方每行 chip。
      const okTotal = okChannels;
      let message: string;
      if (failedLabels.length > 0) {
        message = `签到完成 ${okTotal} 个渠道;失败:${failedLabels.join("、")}`;
      } else if (okTotal > 0) {
        message = `签到完成 ${okTotal} 个渠道`;
      } else if (parts.length === 0) {
        message = "没有可签到的渠道(未配置或没有账号)";
      } else {
        message = "签到完成";
      }
      return {
        ok: anyOk,
        message,
        channels,
      };
    },

    
    
    
    // ── 用量 ───────────────────────────────────────────────────────────────
    
    // ── 逻辑模型 ───────────────────────────────────────────────────────────
    // ⚠️ 逻辑模型唯一真源 = db.logical_model(用户指示:删除后必须从页面消失、
    // 调度必须跟着 db 走,providers.json 的 logicalModels 段只作空库首启播种)。
    
    
    
    // ── 模型总览(部署) ──────────────────────────────────────────────────────
    
    
    // ── 供应商(其他供应商) ──────────────────────────────────────────────────
    
    
    // ── 设置 ────────────────────────────────────────────────────────────────
    
    
    // ── 请求日志 ────────────────────────────────────────────────────────────
    
    
    
    // ── 旧兼容方法 ──────────────────────────────────────────────────────────
    
    
    
    
    
  };
  return { panel, snRepairKey: snn.snRepairKey };
}

export function dispatchPanel(panel: Panel, method: string, args: unknown[]): Promise<unknown> {
  const a = args ?? [];
  switch (method) {
    // 总览
    case "getStatus": return panel.getStatus();
    case "getRuntime": return panel.getRuntime();
    // 网关运维:重启入口只在托盘菜单,面板不暴露(用户定案 m03639)
    // case "restartGateway": return panel.restartGateway();
    // 用量
    case "getUsageHistory":
      return panel.getUsageHistory(
        String(a[0] ?? "all") as UsageRange,
        String(a[1] ?? "day") as UsageGranularity,
        String(a[2] ?? "model") as UsageGroup,
      );
    // 逻辑模型
    case "getLogicalModels": return panel.getLogicalModels();
    case "writeLogicalModel":
      return panel.writeLogicalModel((a[0] ?? {}) as LogicalModelsWriteInput);
    case "removeLogicalModel": return panel.removeLogicalModel(String(a[0] ?? ""));
    // 模型总览(部署)
    case "getDeployments": return panel.getDeployments();
    case "setDeploymentExposure":
      return panel.setDeploymentExposure(
        String(a[0] ?? ""),
        (String(a[1] ?? "all") as "direct" | "group" | "all"),
        Boolean(a[2]),
        a[3] == null ? undefined : Number(a[3]),
      );
    case "setDeploymentReasoning":
      return panel.setDeploymentReasoning(
        String(a[0] ?? ""),
        Array.isArray(a[1]) ? (a[1] as unknown[]).map((v) => String(v ?? "")) : null,
        a[2] === undefined || a[2] === null ? null : Boolean(a[2]),
      );
    case "fetchDeploymentReasoning":
      return panel.fetchDeploymentReasoning(String(a[0] ?? ""));
    // 供应商(其他供应商)
    case "getModelProviders": return panel.getModelProviders();
    case "upsertModelProvider":
      return panel.upsertModelProvider(
        String(a[0] ?? ""),
        a[1] === undefined || a[1] === null ? null : String(a[1]),
        String(a[2] ?? "openai"),
        a[3] === undefined || a[3] === null ? undefined : String(a[3]),
        Array.isArray(a[4]) ? (a[4] as unknown[]).map((v) => String(v ?? "")) : undefined,
      );
    case "removeModelProvider": return panel.removeModelProvider(String(a[0] ?? ""));
    case "fetchModels":
      return panel.fetchModels(
        String(a[0] ?? ""),
        a[1] === undefined ? undefined : Boolean(a[1]),
        (a[2] as { baseUrl?: string | null; protocol?: string | null } | null | undefined) ?? null,
      );
    case "setModelExposure":
      return panel.setModelExposure(String(a[0] ?? ""), String(a[1] ?? ""), Boolean(a[2]));
    case "checkModels":
      return panel.checkModels(a[0] === undefined ? undefined : String(a[0]));
    case "getMetrics":
      return panel.getMetrics(a[0] === undefined ? undefined : Number(a[0]));
    case "checkModel":
      return panel.checkModel(String(a[0] ?? ""), String(a[1] ?? ""));
    case "getSensenovaAccounts":
      return panel.getSensenovaAccounts();
    case "getQuota":
      return panel.getQuota();
    // 渠道页(Trae / WorkBuddy)
    case "getProviderPage":
      return panel.getProviderPage(String(a[0] ?? ""), a[1] === undefined ? undefined : Boolean(a[1]));
    case "getChannelAccounts": return panel.getChannelAccounts(String(a[0] ?? ""));
    case "checkinStatus":
      // 第二参可选:给了就查那一个账号(逐账号概览用),没给走代表账号。
      return panel.checkinStatus(
        String(a[0] ?? ""),
        a[1] === undefined || a[1] === null ? undefined : Number(a[1]),
      );
    case "checkinClaim":
      return panel.checkinClaim(
        String(a[0] ?? ""),
        Boolean(a[1]),
        a[2] === undefined ? undefined : Number(a[2]),
      );
    case "checkinOverview": return panel.checkinOverview();
    case "checkinAll": return panel.checkinAll(Boolean(a[0]));
    case "channelOverview": return panel.channelOverview();
    case "refreshStatus": return panel.refreshStatus(String(a[0] ?? ""));
    case "refreshRun":
      return panel.refreshRun(
        String(a[0] ?? ""),
        Boolean(a[1]),
        a[2] === undefined ? undefined : Number(a[2]),
      );
    case "syncChannel":
      return panel.syncChannel(String(a[0] ?? ""), a[1] === undefined ? undefined : Boolean(a[1]));
    // ⚠️ 拆分后的额度通道(2026-11-07):打开页面/点刷新只刷额度,不再隐式拉目录或签到。
    case "syncChannelQuota":
      return panel.syncChannelQuota(String(a[0] ?? ""), a[1] === undefined ? undefined : Boolean(a[1]));
    // ⚠️ 拆开后的模型目录:展开渠道卡片才拉,不刷额度、不签到。
    case "syncChannelCatalog":
      return panel.syncChannelCatalog(String(a[0] ?? ""), a[1] === undefined ? undefined : Boolean(a[1]));
    // ⚠️ 打开渠道页的批量额度刷新(对所有有额度能力的渠道各自跑额度段)。
    case "syncAllQuota":
      return panel.syncAllQuota(a[0] === undefined ? undefined : Boolean(a[0]));
    case "setChannelModels":
      return panel.setChannelModels(
        String(a[0] ?? ""),
        (Array.isArray(a[1]) ? a[1] : []) as ChannelModelSpec[],
      );
    // 单行实时保存(用户 2026-10-31 定案:四页删掉保存按钮,改成就地落库)
    case "setChannelModel":
      return panel.setChannelModel(String(a[0] ?? ""), (a[1] ?? {}) as ChannelModelPatch);
    // 客户端路径
    case "getClientPaths": return panel.getClientPaths();
    case "saveClientPath": return panel.saveClientPath(String(a[0] ?? ""), String(a[1] ?? ""));
    case "detectClientPath": return panel.detectClientPath(String(a[0] ?? ""));
    case "discoverChannelAccounts": return panel.discoverChannelAccounts(String(a[0] ?? ""));
    case "adoptChannelAccount":
      return panel.adoptChannelAccount(
        String(a[0] ?? ""),
        String(a[1] ?? ""),
        String(a[2] ?? ""),
        a[3] === undefined ? undefined : String(a[3]),
        // 第五参 = 发现阶段的身份字段(2026-11-09):不传就退回「只有 3 个键」的
        // 残缺凭据,签到时上游会持续回 9074。
        a[4] !== null && typeof a[4] === "object" && !Array.isArray(a[4])
          ? (a[4] as Record<string, unknown>)
          : undefined,
      );
    // 设置
    case "getSettings": return panel.getSettings();
    case "saveSettings":
      return panel.saveSettings((a[0] ?? {}) as Record<string, Record<string, string>>);
    // 请求日志
    case "getRequestLog": return panel.getRequestLog();
    case "setRequestLog": return panel.setRequestLog((a[0] ?? {}) as { enabled?: boolean; content_mode?: "off" | "structure" | "full" | "edges" });
    // SenseNova
    case "getSensenovaStatus": return panel.getSensenovaStatus();
    case "getSensenovaModels": return panel.getSensenovaModels();
    case "setSensenovaExposure":
      return panel.setSensenovaExposure(String(a[0] ?? ""), String(a[1] ?? ""), Boolean(a[2]));
    case "sensenovaRefresh":
      return panel.sensenovaRefresh(
        a[0] === undefined ? undefined : Boolean(a[0]),
        a[1] !== null && typeof a[1] === "object" ? (a[1] as { catalog?: boolean; quota?: boolean }) : undefined,
      );
    case "sensenovaLogin":
      return panel.sensenovaLogin(
        String(a[0] ?? ""),
        a[1] === null ? null : String(a[1] ?? ""),
        String(a[2] ?? ""),
        a[3] === undefined ? true : Boolean(a[3]),
      );
    case "sensenovaSavePassword":
      return panel.sensenovaSavePassword(String(a[0] ?? ""), String(a[1] ?? ""), String(a[2] ?? ""));
    case "sensenovaRefetchKey":
      return panel.sensenovaRefetchKey(String(a[0] ?? ""));
    case "sensenovaAddAccount":
      return panel.sensenovaAddAccount(
        String(a[0] ?? ""),
        a[1] === undefined ? undefined : String(a[1]),
        a[2] === undefined ? undefined : String(a[2]),
      );
    case "sensenovaRemoveAccount":
      return panel.sensenovaRemoveAccount(String(a[0] ?? ""));
    // Qoder(cosy 协议,双区域)。region 一律先过字符串化,未知区域由域内拒绝。
    case "getQoderAccounts": return panel.getQoderAccounts();
    case "getQoderStatus": return panel.getQoderStatus();
    case "getQoderModels":
      return panel.getQoderModels(a[0] === undefined || a[0] === null ? undefined : String(a[0]));
    case "qoderRefreshCatalog":
      return panel.qoderRefreshCatalog(a[0] === undefined || a[0] === null ? undefined : String(a[0]));
    case "qoderSetModelEnabled":
      return panel.qoderSetModelEnabled(String(a[0] ?? ""), String(a[1] ?? ""), Boolean(a[2]));
    case "qoderCredits":
      return panel.qoderCredits(String(a[0] ?? ""), a[1] === undefined || a[1] === null ? undefined : String(a[1]));
    case "qoderCheckin":
      return panel.qoderCheckin(String(a[0] ?? ""), a[1] === undefined || a[1] === null ? undefined : String(a[1]));
    case "qoderCampaigns":
      return panel.qoderCampaigns(String(a[0] ?? ""), a[1] === undefined || a[1] === null ? undefined : String(a[1]));
    case "qoderAddAccount":
      return panel.qoderAddAccount(String(a[0] ?? ""), String(a[1] ?? ""), String(a[2] ?? ""));
    case "qoderRemoveAccount":
      return panel.qoderRemoveAccount(String(a[0] ?? ""), String(a[1] ?? ""));
    case "qoderSetAccountEnabled":
      return panel.qoderSetAccountEnabled(String(a[0] ?? ""), String(a[1] ?? ""), Boolean(a[2]));
    case "qoderProbeChat":
      return panel.qoderProbeChat(String(a[0] ?? ""), a[1] === undefined || a[1] === null ? undefined : String(a[1]));
    case "qoderRecentErrors": return panel.qoderRecentErrors();
    // 数据目录
    case "getDataDir": return panel.getDataDir();
    // 旧兼容(保留,防止旧调用点炸)
    case "listProviders": return panel.listProviders();
    case "setAccountEnabled":
      return panel.setAccountEnabled(String(a[0] ?? ""), Number(a[1]), Boolean(a[2]));
    case "getRecentRequests":
      return panel.getRecentRequests(a[0] === undefined ? undefined : Number(a[0]));
    case "getSessionCurrentRoute":
      return panel.getSessionCurrentRoute(String(a[0] ?? ""), a[1] === undefined ? undefined : String(a[1]));
    case "getRequestLogStatus": return panel.getRequestLogStatus();
    case "getUsageSummary": return panel.getUsageSummary();
    default:
      return Promise.resolve({ ok: false, message: "未知面板方法" });
  }
}
