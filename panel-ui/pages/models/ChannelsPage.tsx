/**
 * 「渠道」合并页:Trae / WorkBuddy / MiniMax / Qoder / SenseNova 五张折叠卡
 * (2026-11-08 用户定案:WorkBuddy **重新显性化**)。
 *
 * 卡序:**恢复隐藏前的原顺序** —— Trae → WorkBuddy → MiniMax → Qoder → SenseNova。
 * 为什么不把 WorkBuddy 挪到最后(风险最高的一档):这个顺序是渠道接入历史
 * (Trae 最早、其后 WorkBuddy),也是用户肌肉记忆的位置;而「风险」已经由
 * 卡头 title + 展开处的短提示 + 总览签到行的 title 三处显式告知 ——
 * 靠挪位置暗示风险既不明显,还会让老用户多点一次。
 *
 * 版式:
 *   - 卡头**常显余额**(读 channelOverview 的运行期缓存,绝不为卡头打上游);
 *     没采集过显示「未采集」。
 *   - 展开 = 复用现有页面组件原样渲染(QoderPage / SenseNovaPage / ChannelPage),
 *     模型目录与配置区随之折叠。
 *   - ⚠️ 2026-11-08 刷新语义**彻底拆开**(用户定案),三个入口各管一件事:
 *       ① 「全部刷新」(页面顶部**常显**,也由进入页面自动触发)= **只刷积分余额**
 *          —— trae/workbuddy/minimax 走 `syncAllQuota`,sensenova 走
 *          `sensenovaRefresh(force, { catalog: false })`,qoder 走 `qoderCredits`;
 *       ② 「全部签到」= 只签到(显式动作,失败/已签如实汇总);
 *       ③ 「刷新模型列表」= **各卡片模型目录自己的按钮**(内嵌页里),只拉目录落库。
 *     展开卡片**不再**自动拉目录 —— 那会让「我只是想看看」也打一轮上游。
 *
 * ⚠️ 页面内按钮不走 `models-action` 通道(那条通道是给内嵌页的子标题行用的);
 *   渠道页自己就是整页,按钮直接摆在签到带上更常显。
 *
 * ⚠️ 2026-11-08:WorkBuddy 的**风险提示**文案来自 `@as-one/panel` 的
 *   `channel-risk-note`(与总览页签到行共用一份,避免两处文案走偏)。
 */
import React from "react";
import { rendererApi } from "../../api";
import type { ChannelOverview, ChannelOverviewCard, CheckinChannelStatus, CheckinOverview } from "../../api";
import {
  checkinChipText,
  checkinSignedText,
  formatCheckinCredit,
} from "@as-one/panel/src/checkin-chip-format.js";
import { providerRiskNote } from "@as-one/panel/src/channel-risk-note.js";
import ChannelPage from "./ChannelPage";
import QoderPage from "./QoderPage";
import SenseNovaPage from "./SenseNovaPage";

/** 卡序(2026-11-08 恢复):Trae → WorkBuddy → MiniMax → Qoder → SenseNova。 */
const CARDS = [
  { provider: "trae", label: "Trae" },
  { provider: "workbuddy", label: "WorkBuddy" },
  { provider: "minimax", label: "MiniMax" },
  { provider: "qoder", label: "Qoder" },
  { provider: "sensenova", label: "SenseNova" },
] as const;

/**
 * 支持签到的渠道(2026-11-07 定案):SenseNova 没有签到概念,chip 都不摆 ——
 * 之前它显示「不支持签到」既误导又占位。加载中的 chip 显示「…」而不是
 * 「不支持签到」(checkinById 未命中 ≠ 不支持)。
 *
 * ⚠️ 2026-11-08:补回 `workbuddy` —— 它一直有签到能力(工作流签到接口,
 * 见 `@as-one/core` 的 `connectors/checkin.ts` `CHECKIN_PROVIDERS`),隐藏期间
 * 只是不显示。签到是用户显式动作,不会自己触发风控。
 */
const CHECKIN_PROVIDERS = new Set(["trae", "workbuddy", "minimax", "qoder"]);

/** Qoder 的区域键(与 QoderPage 的 `REGION` 同值;积分接口按区域取账号池)。 */
const QODER_REGION = "qoder";

/**
 * epoch 毫秒 → 卡头用的**紧凑**到期时间(2026-11-07 用户定案)。
 *
 * 口径按「远近来决定精度」:
 *   - **24 小时内** → `HH:MM`(如 `23:51`):马上要过期了,日期没有信息量,
 *     精确到分钟才有用;
 *   - **超过 24 小时** → `MM-DD`(如 `12-08`):还早,给到分钟只是噪音;
 *   - 已经过期(负差)-> 仍按 `MM-DD` 显示(过期时刻本身要能看见)。
 *
 * ⚠️ 边界用「从现在起 24×3600×1000 毫秒」而不是「同一天」:后者在 23:59
 * 会把 00:01 的到期显示成 `MM-DD`,又在 00:01 把当天 23:59 显示成 `HH:MM`,
 * 同一个时长在一天里跳来跳去,看着莫名其妙。
 *
 * 完整时刻(含秒)+ 是否估算,一律放 title —— 卡头不放「约」字。
 */
function fmtExpiry(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const within24h = ms - Date.now() <= 24 * 3600 * 1000 && ms >= Date.now();
  return within24h ? `${hh}:${mi}` : `${mm}-${dd}`;
}

function n(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/**
 * 签到 chip 的文案与色调。
 *
 * ⚠️ 加载态(2026-11-07 用户定案):`c === undefined` 只代表「还没取到」,
 * 显示「不支持签到」是误导(它可能只是慢)。只有后端明确 supported=false
 * (如未配置渠道)才说「不支持」。
 *
 * ⚠️ **0 账号 ≠ 签到未知**(2026-11-09):渠道支持签到、但一个凭据都没有时,
 * `checkedIn`/`pending` 恒为 null —— 旧逻辑会显示「签到未知」,看起来像
 * 「网关查不出来」。实际上答案是确定的:**没有账号可签**。所以这里先判
 * `accounts === 0`,给出「无账号」并带上后端 reason(如「该渠道没有带令牌
 * 的凭据」),用户一眼就知道该去导入账号而不是等它自己好。
 */
function checkinChip(
  c: CheckinChannelStatus | undefined,
  loading = false,
): { text: string; tone: "ok" | "warn" | "na" } {
  if (!c) return { text: loading ? "…" : "签到未知", tone: "na" };
  if (!c.supported) return { text: "不支持签到", tone: "na" };
  if (c.error) return { text: "签到查询失败", tone: "warn" };
  // 支持签到但没有账号:这是**确定状态**,不是「查不到」。
  if (c.accounts === 0) return { text: "无账号", tone: "na" };
  if (c.checkedIn === null || c.pending === null) return { text: "签到未知", tone: "na" };
  // ⚠️ **部分已签要把已签数说出来**(2026-11-09 用户报「trae 还是没有显示两个账号」):
  // 以前 `pending > 0` 只给「待签 N」,把已签的那几个和积分全丢了 ——
  // 2 个账号「1 个已签 1 个未签」显示成「待签 1」,看起来像「一个都没签」。
  //
  // ⚠️ 文案要**短**(同日第二版):`已签 1/2(待签 1)` 在 chip 里会折行,
  // 改成 `1/2 已签` —— 比例在前、状态在后,短一半且信息不减。
  if (c.pending > 0) {
    if (c.countExact && c.accounts > 1) {
      const points = formatCheckinCredit(c);
      // 状态词与总览卡共用一份:`0/2 未签`,不是「0/2 已签」。
      return { text: `${checkinSignedText(c)}${points}`, tone: "warn" };
    }
    // ⚠️ **countExact=false 且有账号签上 → 仍报「已签」**(2026-11-11 用户报
    // 「trae 点击签到后仍显示未签」):trae 不报分母,但 `checkedIn>0` 说明这个
    // 渠道今天**确实领到了**;显示「待签 N」等于把已签的事实抹掉。
    if (c.checkedIn > 0) {
      return { text: checkinChipText(c), tone: "ok" };
    }
    return { text: `待签 ${c.pending}`, tone: "warn" };
  }
  // 「已签」这一态的拼装走共享纯函数(panel 包,有单测):多账号时显示
  // `今日 400×2` 而不是笼统合计 `800`(2026-11-07 用户定案)。
  return { text: checkinChipText(c), tone: "ok" };
}

/** 卡头右侧的余额摘要(常显;缓存里没有就是「未采集」)。 */
function BalanceSummary({ card }: { card: ChannelOverviewCard | undefined }): React.JSX.Element {
  if (!card || card.accounts.length === 0) {
    return <span className="chx-balance none">未接入账号</span>;
  }
  const collected = card.accounts.some((a) => a.left !== null);
  return (
    <span className="chx-balance">
      {card.accounts.map((a) => (
        <span
          key={a.label}
          className="chx-acct"
          // 完整时刻(含日期/秒)与「是否估算」只在 title 里说 —— 卡头不放「约」字
          // (2026-11-07 用户定案:紧凑列里那个字只会挤占宽度)。
          title={
            a.expiresAtMs
              ? `${card.provider === "sensenova" ? "5h 窗口重置" : "到期"} ${new Date(a.expiresAtMs).toLocaleString()}${a.expiresEstimated ? "(估算)" : ""}`
              : undefined
          }
        >
          <b>{a.label}</b>{" "}
          {a.left === null ? (
            <span className="chx-none">未采集</span>
          ) : (
            <>
              {n(a.left)}
              {a.expiresAtMs !== null && (
                <em className="chx-expiry">{fmtExpiry(a.expiresAtMs)}</em>
              )}
            </>
          )}
        </span>
      ))}
      {!collected ? <span className="chx-hint">展开刷新后显示</span> : null}
    </span>
  );
}

export default function ChannelsPage(): React.JSX.Element {
  const [ov, setOv] = React.useState<ChannelOverview | null>(null);
  const [checkin, setCheckin] = React.useState<CheckinOverview | null>(null);
  /** 签到状态是否在取:加载中的 chip 显示「…」而不是「不支持签到」。 */
  const [checkinLoading, setCheckinLoading] = React.useState(true);
  const [openId, setOpenId] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  /** 「全部刷新」在跑(只刷积分余额,不碰目录/签到)。 */
  const [refreshing, setRefreshing] = React.useState(false);
  const [note, setNote] = React.useState("");
  /** 刷新计数:每次「全部刷新」后 +1,**只用来给内嵌页换 key** ——
   *  内嵌页读的是本地库,重挂一次就能显示新缓存,不必给三页各加一个 props。 */
  const [quotaTick, setQuotaTick] = React.useState(0);

  const loadHead = React.useCallback(async () => {
    // 卡头聚合只读缓存,便宜(这一读不打上游);额度/目录刷新后重调它,摘要才跟得上。
    try {
      setOv(await rendererApi.channelOverview());
    } catch {
      /* 卡头读不到不报错:内嵌页自己会显示错误 */
    }
  }, []);

  const loadCheckin = React.useCallback(async () => {
    setCheckinLoading(true);
    try {
      setCheckin(await rendererApi.checkinOverview());
    } catch {
      /* 同上 */
    } finally {
      setCheckinLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // ⚠️ 2026-11-08 定案:**进入页面只刷积分余额**(且受装配层冷却约束 force=false),
    // 不拉模型目录、不签到 —— 目录在内嵌页的「刷新模型列表」按钮上,
    // 签到在「全部签到」按钮上。
    // ⚠️ 签到**状态**这里仍然读一次 checkinOverview:这是**查询**、不是签到动作,
    // 真正的签到只在用户点「全部签到」时发生。后端 checkin-cache 按渠道按天缓存,
    // 成功结果缓存到周期结束 —— 首次打开打一轮上游,当天再开就是 0 次。
    void loadHead();
    void loadCheckin();
    void refreshAllRef.current(false);
  }, [loadHead, loadCheckin]);

  /**
   * 「全部刷新」—— **只刷积分余额**(2026-11-08 用户定案)。
   *
   * 三条额度通路各不相同,所以不是一次 `syncAllQuota` 能覆盖的:
   *   - trae / workbuddy / minimax → `syncAllQuota(true)`(`CH_QUOTA_PROVIDERS`);
   *   - sensenova → `sensenovaRefresh(true, { catalog: false })`(只刷池,不拉目录);
   *   - qoder → `qoderCredits(region)`(逐个账号读积分)。
   * 全部 `allSettled`:某一家挂了不该拦着另外两家刷新(这与「全部签到」的fail-soft 同一条纪律)。
   * 目录与签到**一律不碰** —— 它们各有自己的按钮。
   */
  const refreshAll = React.useCallback(async (force: boolean) => {
    if (refreshing) return;
    setRefreshing(true);
    setNote("");
    const failed: string[] = [];
    try {
      // 自动触发(force=false)不碰 qoder:它的积分接口没有冷却闸门,进一次页面
      // 就打一轮上游太吵;卡头读的是 `qoderCreditsCached` 的缓存,本来就有数。
      const calls: Array<Promise<unknown>> = [
        rendererApi.syncAllQuota(force),
        rendererApi.sensenovaRefresh(force, { catalog: false }),
      ];
      const labels = ["额度", "SenseNova 积分池"];
      if (force) {
        calls.push(rendererApi.qoderCredits(QODER_REGION));
        labels.push("Qoder 积分");
      }
      const results = await Promise.allSettled(calls);
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          failed.push(`${labels[i]}:${String(r.reason)}`);
          return;
        }
        // ⚠️ 装配层对「该渠道没有额度能力」是**返回值 ok:false + 诚实 message**,
        // 不 throw —— 只看 rejected 会把这类失败静默吞掉。qoder 返回的是数组
        // (逐账号积分),没有 ok 字段,这里按形状跳过。
        const v = r.value as { ok?: boolean; message?: string } | unknown[] | null;
        if (v !== null && !Array.isArray(v) && v.ok === false) {
          failed.push(`${labels[i]}:${v.message ?? "未刷新"}`);
        }
      });
      // 自动刷新(force=false)失败不打扰:那是进页面顺手做的,没成下次进来再试。
      if (failed.length > 0 && force) setNote(`部分未刷新 —— ${failed.join(";")}`);
      await loadHead();
      setQuotaTick((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }, [loadHead, refreshing]);

  const refreshAllRef = React.useRef(refreshAll);
  refreshAllRef.current = refreshAll;

  const claimAll = React.useCallback(async () => {
    setBusy(true);
    setNote("");
    try {
      const r = await rendererApi.checkinAll(true);
      setNote(r.message);
      if (r.channels?.length) setCheckin({ channels: r.channels });
      await loadHead();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [loadHead]);

  const toggle = React.useCallback(
    (provider: string) => {
      setOpenId((cur) => (cur === provider ? "" : provider));
      // 展开/收起都重读卡头:内嵌页刷新过的渠道,收起后摘要要反映新缓存。
      void loadHead();
      // ⚠️ 2026-11-08 用户定案:**展开不再自动拉模型目录**。
      // 想更新目录就点卡片里模型列表上的「刷新模型列表」—— 展开只是「看一眼」,
      // 不该顺手打一轮上游。**同样不签到、不刷额度**(各有自己的按钮)。
    },
    [loadHead],
  );

  const checkinById = React.useMemo(
    () => new Map((checkin?.channels ?? []).map((c) => [c.provider, c])),
    [checkin],
  );
  const cardById = React.useMemo(
    () => new Map((ov?.cards ?? []).map((c) => [c.provider, c])),
    [ov],
  );

  /**
   * **只显示「配了凭据」的渠道**(2026-11-13 用户定案)。
   *
   * 凭据一律由 Agent 直接写 `credential` 表(面板不提供任何可见入口),
   * 所以「一个凭据都没有的渠道」对用户**不存在** —— 摆一张空卡只会让人
   * 以为是故障。判据用 `card.accounts.length > 0`(那是凭据列表,不是额度缓存),
   * 与签到 chip 的 `accounts > 0` 同一口径。
   *
   * ⚠️ 首帧 `ov` 还没到时 `cardById` 是空的 —— 此时**先不渲染任何卡**
   * (宁可短暂空白,也不要闪出 5 张空卡再消失)。
   * 全部渠道都没凭据时,下面有专门的空态文案。
   */
  const visibleCards = React.useMemo(
    () =>
      ov === null
        ? []
        : CARDS.filter((spec) => {
            const card = cardById.get(spec.provider);
            return card !== undefined && card.accounts.length > 0;
          }),
    [ov, cardById],
  );

  return (
    <section className="channels-page">
      <div className="channels-checkin">
        <div className="channels-checkin-chips">
          {visibleCards.filter((spec) => CHECKIN_PROVIDERS.has(spec.provider))
            .filter((spec) => {
              // ⚠️ **0 账号的渠道不摆 chip**(2026-11-09 用户定案「accounts === 0
              // 直接隐藏行」):后端已经不返回它了,这里再挡一层 —— 免得将来
              // 有人把「无账号」也塞回来,页面又冒出一行「无账号」占位。
              // 加载中(还没拿到状态)照常显示「…」,否则 chip 会在首帧闪一下消失。
              const c = checkinById.get(spec.provider);
              if (c === undefined) return checkinLoading;
              return c.accounts > 0;
            })
            .map((spec) => {
              const chip = checkinChip(checkinById.get(spec.provider), checkinLoading);
              return (
                <span key={spec.provider} className={`chx-chip is-${chip.tone}`} title={`${spec.label} 今日签到`}>
                  {spec.label} {chip.text}
                </span>
              );
            })}
        </div>
        <div className="channels-checkin-actions">
          {/* 「全部刷新」= 只刷积分余额(不拉目录、不签到)。**常显**,不依赖内嵌页
              是否展开 —— 以前它由内嵌页登记到子标题行,收起卡片就没了。 */}
          <button type="button" className="btn" disabled={refreshing} onClick={() => void refreshAll(true)}>
            {refreshing ? "刷新中…" : "全部刷新"}
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void claimAll()}>
            {busy ? "签到中…" : "全部签到"}
          </button>
        </div>
      </div>
      {note ? <p className="chx-note">{note}</p> : null}

      {ov !== null && visibleCards.length === 0 ? (
        // 全部渠道都没凭据:如实说明「没有渠道」而不是摆 5 张空卡。
        // 凭据由 Agent 写入数据库,所以这句话对用户是可执行的指引。
        <p className="chx-empty hint na">
          还没有任何渠道 —— 凭据配置由 Agent 直接写入数据库,配置后这里会自动出现对应渠道。
        </p>
      ) : null}

      {visibleCards.map((spec) => {
        const open = openId === spec.provider;
        const card = cardById.get(spec.provider);
        const risk = providerRiskNote(spec.provider);
        return (
          <article
            key={spec.provider}
            className={`chx-card${open ? " open" : ""}${risk ? " has-risk" : ""}`}
          >
            <header className="chx-head">
              <button
                type="button"
                className="chx-toggle"
                onClick={() => toggle(spec.provider)}
                aria-expanded={open}
                // ⚠️ 风险提示挂在**可点元素**上:悬停名字就能看到,不必展开。
                // 文案克制(见 `channel-risk-note`):说清 11140 与「删凭据 + 熔断」。
                title={risk || undefined}
              >
                <span className={`chx-caret${open ? " open" : ""}`} aria-hidden="true" />
                <span className="chx-name">{spec.label}</span>
                {risk ? (
                  // 一个小徽标:光靠 title 等于「没人会看到」,而这是安全相关告知。
                  <span className="chx-risk-badge" aria-label="上游风控较严">
                    风控
                  </span>
                ) : null}
              </button>
              <BalanceSummary card={card} />
            </header>
            {open ? (
              <div className="chx-body">
                {risk ? (
                  // 展开处的**完整说明**:短提示 + 一句「出事后我们会怎么做」。
                  <p className="chx-risk-note">{risk}</p>
                ) : null}
                {spec.provider === "qoder" ? (
                  // `key` 里带 `quotaTick`:点过「全部刷新」后重挂一次,
                  // 让内嵌页重新读本地库(它读的是落库后的积分,不重读就还是旧数)。
                  <QoderPage key={`qoder:${quotaTick}`} />
                ) : spec.provider === "sensenova" ? (
                  <SenseNovaPage key={`sensenova:${quotaTick}`} />
                ) : (
                  <ChannelPage key={`${spec.provider}:${quotaTick}`} provider={spec.provider} />
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
