/**
 * SenseNova Token Plan 专页 —— 1:1 移植 Nexus `SenseNovaPanel.vue`(两段式):
 *
 *   ① 顶部:账号状态行 —— 一行一个账号,左侧账号名 + key 指纹 + 状态点,
 *      右侧**一行文本**(2026-11-08 用户重新定案):
 *        `**5h可用 119,839** 重置 12:45  **周可用 914,851** 重置 11-10`
 *      `****` 内是徽章,两段「重置」是纯文本。**只显示通用积分池**:活动固定
 *      积分(活动已结束)、Flash-Lite 专属池(限模型)、余量条、分母、控制台
 *      会话到期一律不显示。**卡上不放任何按钮**。
 *   ② 中部:模型目录。**勾选 = 登记**(取消勾选 = 删掉 `real_model` 那一行);
 *      是否列入 /v1/models 归**部署页**那一列管。
 *
 * ⚠️ 2026-11-08 用户定案:**「账号配置」整段已移除**(用户名 / 密码 / API key
 *   输入框、添加账号、逐行删除按钮)。账号一律由 Agent 直接写 `credential` 表
 *   配置,面板只读展示。理由:该表会带着密码登录控制台并自动抓 key,与「接入
 *   账号必须经 Agent 显式操作」冲突。后端 `sensenovaAddAccount` /
 *   `sensenovaRemoveAccount` / `sensenovaLogin` 等 RPC 保留,不再从 UI 触发。
 *
 * 「不显示假数字」的纪律(照抄 Nexus 的注释,因为代码就照它写):
 * 1. **没有数据 ≠ 0**。上游没给某个窗口就不摆那枚徽章,不拿另一个窗口的
 *    数顶替,也不摆「—」占位;明确给了 0 才显示 0(黄色)。
 * 2. 两个窗口各带名字、**互不相加**:5h 是当下能否发请求,周是本周余额。
 * 3. 卡头与账号行同源于 `generalPoolSummary`,口径不允许再分叉。
 *
 * ── 契约差异(按 `shared/panel-types.ts` 实际字段渲染,不编造) ─────────────
 * · `SensenovaStatus.refresh` 是 `ChannelRefreshStatus`(running / last_run_at_ms /
 *   last_elapsed_s / last_ok / last_error / result),没有 Nexus 的
 *   `finished_at` / `ok` / `accounts` / `errors` → `refreshNote` 用现有字段重组文案。
 * · `getSensenovaModels()` 只返回 `SensenovaCatalogRow[]`,没有 Nexus 的
 *   `catalogView`(source / count / ok / stale / warnings)→ `catalogSourceLabel`
 *   按行数重组;目录问题行复用 `status.note`(不编造 source 语义)。
 * · 账号状态行的 key 指纹 / 状态点来自 `getSensenovaStatus()`;不再有账号增删
 *   面板方法调用(见上方 2026-11-08 定案),页面不持有任何账号写操作。
 * · 刷新语义(2026-11-08 用户定案):**本页不再有页面级刷新按钮**。
 *   积分池由渠道页顶部「全部刷新」刷(`sensenovaRefresh(force, { catalog: false })`),
 *   模型目录由模型列表表头那颗「刷新模型列表」刷(`{ quota: false }`);
 *   页面不渲染 h1(Nexus 本页也没有页头)。
 * · 装配层对凭据刷新/额度查询返回诚实消息(`refresh.result`、`note` 如实描述),
 *   本页照实展示,不假装成功。
 */
import React from "react";
import { rendererApi } from "../../api";
import type { SensenovaAccount, SensenovaCatalogRow, SensenovaStatus } from "../../api";
import { generalPoolSummary } from "@as-one/panel/src/sensenova-pool.js";
import ModelTable from "../../components/ModelTable";
import type { ModelTableEdit, ModelTableRow } from "../../components/ModelTable";
import { AccountRows } from "../../components/AccountRows";
import type { AccountRow, AccountRowRight } from "../../components/AccountRows";

/** 数值取整 + 千分位(与 Nexus `n()` 一致);null/undefined → "—"。 */
function n(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/** epoch **秒** → 「HH:mm」(5h 窗口重置,当天内给到分钟才有意义)。 */
function tsTime(value: number | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** epoch **秒** → 「MM-DD」(周窗口重置,给到分钟只是噪音)。 */
function tsDate(value: number | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 时长(秒)→ 「1h 30m / 2m 5s / 45s」(与 Nexus `format.fmtDuration` 一致)。 */
function fmtDuration(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  const s = Math.max(0, Math.floor(Number(v)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** 完整 id(`sensenova/xxx`)→ 裸模型名。 */
function bare(id: string): string {
  const i = id.lastIndexOf("/");
  return i >= 0 ? id.slice(i + 1) : id;
}

/** 输入框字符串 → 声明值。空 / 0 / 非法一律当「不声明」,不写库(与 Nexus `num` 同义)。 */
function numOf(v: string): number | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** 子标题行那一行刷新状态 —— **全页唯一的刷新状态出口**。
 *
 *  ⚠️ 契约没有 Nexus 的 `finished_at` / `ok` / `accounts` / `errors`,只用
 *  `ChannelRefreshStatus` 现有字段重组:刷新中 → 「正在刷新 · 已用 Ns」;
 *  否则把后端 `result`(装配层的诚实消息)照实上屏。
 *
 *  ⚠️ 2026-11-02:刷新**结束**后不再只认后端 `result`。那一份是宿主进程内存里的
 *  一次性回执:刷新若在写账之前抛错(或页面/宿主刚重启),它会停在初始值
 *  「尚未执行过登录或刷新」—— 用户看到的就是「刚刷完还显示未刷新」。本页
 *  最近一次**自己点的**刷新结果(`localResult`)优先,它是这次点击亲手拿到的
 *  返回值,别人覆盖不掉;没有本地结果时才回落到后端的回执(从其它窗口/自动
 *  刷新看到的变化)。
 */
function refreshNoteOf(
  refresh: SensenovaStatus["refresh"],
  elapsedSecText: string,
  busy: boolean,
  localResult: { ok: boolean; text: string; elapsedMs: number } | null,
): string {
  if (busy) return `正在刷新 · 已用 ${elapsedSecText}s`;
  if (localResult !== null) {
    const verdict = localResult.ok ? "成功" : "失败";
    const body = localResult.text === "" ? verdict : `${verdict}:${localResult.text}`;
    return `${body} · 用时 ${(localResult.elapsedMs / 1000).toFixed(1)}s`;
  }
  return refresh?.result ?? "";
}

export default function SenseNovaPage(): React.JSX.Element {
  const [status, setStatus] = React.useState<SensenovaStatus | null>(null);
  const [catalog, setCatalog] = React.useState<SensenovaCatalogRow[]>([]);
  const [error, setError] = React.useState("");
  /** 刷新的成功回执。以前「刷新」只重读本地库(点了像没点),现在真拉上游并给回执。 */
  const [refreshMsg, setRefreshMsg] = React.useState("");
  /** 本地忙碌标:后端 `refresh.running` 要等下一次轮询才反映,按钮不能等它。 */
  const [refreshingLocal, setRefreshingLocal] = React.useState(false);
  /**
   * 本页最近一次「自己点的」刷新回执(成功/失败 + 这段用时)。
   *
   * 为什么不直接读后端 `refresh.result`:那是宿主进程内存里的一份回执,刷新若在
   * 写账之前出问题(抛错 / 宿主重启),它就停在初始值「尚未执行过登录或刷新」——
   * 用户看到「刚刷完还显示未刷新」。本地这份来自**这次点击的返回值**,可靠得多;
   * 没有本地结果时才回落到后端回执(其它窗口/自动刷新引起的状态变化)。
   */
  const [localResult, setLocalResult] = React.useState<{
    ok: boolean;
    text: string;
    elapsedMs: number;
  } | null>(null);
  /** 本地**毫秒**表:刷新中 200ms 走一次。实测整轮刷新 0.8s,秒级粒度永远只看到 0 秒。 */
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());
  /**
   * 本次「本地发起」刷新的开始时刻(毫秒)。为什么要它:
   *  点「刷新」时 `status` 还是**上一轮快照**,其 `started_at_ms` 是上一次刷新的
   *  开始时刻 —— 拿它当起点,`nowMs - started` 会从大数字(上次刷新距今)开始,
   *  表现就是「后续刷新不从 0.0 开始」。本地记一个 t0,手动刷新就恒从 0.0 起算。
   *  后端在跑的刷新(自动/登录/队列)仍用 `started_at_ms`(装配层入口即写)。
   */
  const localStartMsRef = React.useRef<number | null>(null);
  /** 模型目录行级草稿:改动先进草稿,提交后由 `load()` 换回后端真值。
   *  只有被改过的行才有条目。 */
  const [draft, setDraft] = React.useState<Record<string, Record<string, string | boolean>>>({});
  const [saving, setSaving] = React.useState(false);
  /** 脏标镜像:Nexus 用 ref 做「没改过才允许回读覆盖草稿」的判据。React 的状态更新是
   *  异步的,保存路径里「先清脏标再 load()」必须走同步可读的 ref,否则 load() 仍会
   *  看到脏标而拒绝覆盖,页面停在旧值。 */
  const dirtyRef = React.useRef(false);
  function markDirty(v: boolean): void {
    dirtyRef.current = v;
  }

  async function load(): Promise<void> {
    try {
      const [s, m] = await Promise.all([rendererApi.getSensenovaStatus(), rendererApi.getSensenovaModels()]);
      setStatus(s);
      setCatalog(m);
      // ⚠️ 用户改过草稿就不覆盖 —— 否则后台轮询会把刚敲进去的内容连同整个草稿一起
      // 冲掉(症状:「明明填了,保存时又变回原样」)。
      if (!dirtyRef.current) setDraft({});
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 后台轮询:Nexus 是「刷新期间 2 秒一次、平时 10 秒一次」。
   *  ⚠️ 用 ref 读 `running`,避免把 interval 挂在 `status` 上反复重建(那样每次都
   *  会立刻重发一轮,节奏会变成「2 秒 × N」)。 */
  const runningRef = React.useRef(false);
  const fastRef = React.useRef<number | null>(null);
  const slowRef = React.useRef<number | null>(null);
  function stopFast(): void {
    if (fastRef.current !== null) {
      window.clearInterval(fastRef.current);
      fastRef.current = null;
    }
  }
  function startSlow(): void {
    if (slowRef.current === null) {
      slowRef.current = window.setInterval(() => void load(), 10000);
    }
  }
  function startFast(): void {
    stopFast();
    if (slowRef.current !== null) {
      window.clearInterval(slowRef.current);
      slowRef.current = null;
    }
    fastRef.current = window.setInterval(() => {
      void load();
      if (runningRef.current) return;
      stopFast();
      startSlow();
    }, 2000);
  }

  React.useEffect(() => {
    runningRef.current = Boolean(status?.refresh?.running);
  }, [status]);

  React.useEffect(() => {
    void (async () => {
      await load();
      startSlow();
      // ⚠️ 2026-11-08 用户定案:**内嵌页不再自动打上游** ——
      // 积分池归渠道页顶部的「全部刷新」,模型目录归下面「刷新模型列表」按钮。
      // 这里只开进度轮询(读后端账本,便宜),让「于 x 前刷新」自己往前走。
    })();
    return () => {
      stopFast();
      if (slowRef.current !== null) {
        window.clearInterval(slowRef.current);
        slowRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 后端在跑(登录/刷新队列)或本地刚发起 —— 两者都算「刷新中」。 */
  const refreshing = Boolean(status?.refresh?.running) || refreshingLocal;
  React.useEffect(() => {
    // ⚠️ 表必须**恒在走**:早先的写法是「只在 refreshing 时才挂 interval」,于是
    //  首帧 `nowMs` 停在挂载时刻,点下刷新后要等第一跳(200ms)才对齐 —— 亚秒级
    //  刷新整个生命周期都在过期时间戳里算,表现就是「计时不动」。空闲 20s 一跳,
    //  只为让任何「多久之前」型文案自己往前走,不白占 CPU。
    const iv = window.setInterval(() => setNowMs(Date.now()), refreshing ? 200 : 20000);
    return () => window.clearInterval(iv);
  }, [refreshing]);

  const accounts: SensenovaAccount[] = status?.accounts ?? [];
  const refresh = status?.refresh ?? null;
  /** 本次刷新已用**毫秒**:以本轮**开始**时刻为准。
   *  ⚠️ 本地发起的刷新(点按钮)用 `localStartMsRef` —— 它恒从点击时刻起算,
   *  保证「已用」从 0.0 开始递增;后端在跑的刷新(自动/登录/队列)用契约
   *  `started_at_ms`(装配层入口即写),`last_run_at_ms` 是上次**完成**锚点,
   *  进行中读到旧值/null —— 拿它当起点就是「刷新计时一直 0 秒」的旧根因,
   *  只作兼容兜底。 */
  const elapsedMs = (() => {
    const started =
      (refreshingLocal && localStartMsRef.current !== null && localStartMsRef.current !== undefined)
        ? localStartMsRef.current
        : refresh?.started_at_ms ?? refresh?.last_run_at_ms;
    if (!started) return 0;
    return Math.max(0, nowMs - started);
  })();
  /** 显示成「0.8」这种一位小数 —— 亚秒级刷新才看得出在走。 */
  const elapsedSecText = (elapsedMs / 1000).toFixed(1);
  const refreshNote = refreshNoteOf(refresh, elapsedSecText, refreshing, localResult);

  /** 账号行(第一段,2026-11-08 用户重新定案):**只显示通用积分池**,压成一行文本:
   *
   *   `**5h可用 119,839** 重置 12:45  **周可用 914,851** 重置 11-10`
   *
   * `****` 包住的是徽章,两段「重置」是**纯文本**(`subPlain`)。两个口径各带名字、
   * 互不相加:5h 是当下能不能发请求,周是本周还剩多少,合成一个数两边都不对。
   *
   * 不再显示:活动固定积分(活动已结束,恒为 0)、Flash-Lite 专属池(限模型)、
   * 分母 / 进度条、以及控制台 JWT 的会话到期(那不是积分到期)。
   *
   * ⚠️ 口径与卡头同源于 `generalPoolSummary`,避免再次出现「卡头 914,851 /
   * 账号行 119,839」这种对不上的统计。没拉到余量 → 该徽章不摆(不用 0 或「—」
   * 冒充),重置时刻缺失 → 该段纯文本不摆。
   */
  const accountRows: AccountRow[] = React.useMemo(() => {
    return accounts.map((acc) => {
      const pool = generalPoolSummary(acc.quota?.pools ?? null);
      const rights: AccountRowRight[] = [];
      if (pool && pool.remaining !== null) {
        rights.push({
          key: "5h可用",
          value: n(pool.remaining),
          sub: pool.w5ResetAt ? `重置 ${tsTime(pool.w5ResetAt)}` : null,
          subPlain: true,
          tone: pool.remaining > 0 ? "ok" : "warn",
        });
      }
      if (pool && pool.weekRemaining !== null) {
        rights.push({
          key: "周可用",
          value: n(pool.weekRemaining),
          sub: pool.w7ResetAt ? `重置 ${tsDate(pool.w7ResetAt)}` : null,
          subPlain: true,
          tone: pool.weekRemaining > 0 ? "ok" : "warn",
        });
      }
      // 冷却中 → 红点(此刻派不出去);否则有密钥绿点、无密钥灰点。
      const dot: "ok" | "bad" | "off" = acc.cooling ? "bad" : acc.has_key ? "ok" : "off";
      const flags: string[] = [];
      if (acc.key_hint) flags.push(`key ${acc.key_hint}`);
      if (!acc.has_key) flags.push("无密钥");
      if (!acc.has_password) flags.push("无密码");
      if (acc.cooling) flags.push(`冷却 ${fmtDuration(acc.cooldown_remaining_s)}`);
      return {
        id: acc.account || acc.username,
        label: acc.account || acc.username,
        note: flags.join(" · "),
        dot,
        right: rights.length > 0 ? rights : null,
      };
    });
  }, [accounts]);

  /**
   * 「刷新模型列表」:**只拉上游模型目录**(2026-11-08 用户定案)。
   *
   * ⚠️ 以前这里「刷新」一次干两件事:拉目录 + 重拉积分池 —— 于是「只想更新
   *   模型列表」也顺手打了一轮积分池。现在拆开:
   *   - 积分池 → 渠道页顶部「全部刷新」(`{ catalog: false }`);
   *   - 模型目录 → 这里(`{ quota: false }`)。
   *
   * ⚠️ 结果同时记进 `localResult`(这次点击亲手拿到的返回值):后端回执在宿主
   *   进程内存里,刷新若在写账之前抛错就永远停在「尚未执行过登录或刷新」。
   *
   * @param force 按钮点的是 true;传入 false 时遵守装配层 5h 冷却闸门。
   */
  async function refreshCatalog(force = true): Promise<void> {
    if (refreshing) return;
    const startedMs = Date.now();
    setError("");
    setRefreshMsg("");
    setNowMs(startedMs); // 先把表对齐到现在,别让第 0.0s 用的是挂载时的旧值
    localStartMsRef.current = startedMs;
    setRefreshingLocal(true);
    try {
      const r = await rendererApi.sensenovaRefresh(force, { quota: false });
      setLocalResult({
        ok: r.ok,
        text: r.message ?? "",
        elapsedMs: Date.now() - startedMs,
      });
      await load();
      if (!r.ok) setError(r.message ?? "刷新失败");
      else setRefreshMsg(r.message ?? "已刷新");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 抛错也要留回执,否则 note 会退回「未刷新」那种陈旧状态。
      setLocalResult({ ok: false, text: msg, elapsedMs: Date.now() - startedMs });
      setError(msg);
    } finally {
      setRefreshingLocal(false);
    }
    // 后端还在跑(串行登录队列)就按 2s 轮询进度(与 Nexus pollFast 同款)。
    const s = await rendererApi.getSensenovaStatus().catch(() => null);
    if (s?.refresh?.running) startFast();
  }

  /* ── 模型目录草稿(与 Nexus toDraft / applyCatalogEdit 同构) ────────────── */

  /** 目录行 → 表格行。
   *  ⚠️ `id` 是**裸模型名**(行键 + 「模型」列显示),`fullId` 是完整 id(`sensenova/xxx`)。
   *  `defaultContext` / `defaultOutput` 同时是输入框的**占位提示**(灰字里露出的就是
   *  上游那份声明)。 */
  function rowsOf(models: SensenovaCatalogRow[]): ModelTableRow[] {
    return models.map((m) => {
      const id = bare(m.id);
      const d = draft[id] ?? {};
      return {
        id,
        fullId: m.id,
        name: typeof d.name === "string" ? d.name : (m.name ?? id),
        context: typeof d.context === "string" ? d.context : m.context_window != null ? String(m.context_window) : "",
        output: typeof d.output === "string" ? d.output : m.max_output != null ? String(m.max_output) : "",
        vision: typeof d.vision === "boolean" ? d.vision : m.vision,
        exposed: typeof d.exposed === "boolean" ? d.exposed : m.registered,
        // ⚠️ 2026-10-23 修复:这里原来写 `m.available === false` —— 布尔被反转了。
        // ModelTable 用 `row.available === false` 来禁用 checkbox(L108)并加 "off" 类,
        // 反转后**所有可用模型**的行都 available=false → checkbox 全被禁用 →
        // 「sensenova页面不能配置模型」(不可用模型反而能勾选)。与 ChannelPage 对齐,
        // 且 null(未知可用性)不当禁用看。
        available: m.available ?? true,
        defaultContext: m.context_window,
        defaultOutput: m.max_output,
        visionUpstream: m.vision_upstream,
      };
    });
  }

  const modelRows = rowsOf(catalog);

  /** 表格单字段变更:按裸名回指草稿行。
   *
   *  ⚠️ 改草稿**不等于落库** —— 实时保存由 `commitCatalogEdit` 负责(勾选框立刻提交,
   *  文本/数字在 blur / 回车提交)。`draft` 只是「输入框正在显示的值」,让用户
   *  打字时不被 2s 轮询回来的后端快照覆盖。 */
  function handleCatalogEdit(e: ModelTableEdit): void {
    setDraft((d) => ({ ...d, [e.id]: { ...(d[e.id] ?? {}), [e.field]: e.value } }));
    markDirty(true);
  }

  /** 把一次编辑**叠加**到模型行上,得到「这一格改完后的完整声明」。
   *
   *  ⚠️ 不能直接读 `modelRows` 里的那一行:勾选框的 `onChange` 会先 `onEdit`(setState
   *  是异步的)再立刻 `onCommit`,此刻草稿还是**上一帧**的值 —— 直接读会把旧状态写回
   *  库,表现为「点了勾选它自己跳回去」。所以用 `e` 覆盖对应字段。 */
  function withEdit(row: ModelTableRow, e: ModelTableEdit): ModelTableRow {
    switch (e.field) {
      case "exposed":
        return { ...row, exposed: Boolean(e.value) };
      case "vision":
        return { ...row, vision: Boolean(e.value) };
      case "name":
        return { ...row, name: String(e.value) };
      case "context":
        return { ...row, context: String(e.value) };
      case "output":
        return { ...row, output: String(e.value) };
    }
    return row;
  }

  /** 实时保存单行 —— 用户 2026-10-31 定案「能实时保存则删除所有页面的保存按钮」,
   *  Trae / WorkBuddy / Qoder / SenseNova 四页同一口径。
   *
   *  语义:勾上 = 登记(单行 upsert `real_model`),取消 = **删掉那一行**(「勾选即真值」)。
   *  ⚠️ 必须用 `setChannelModel`(单行)而不是 `setChannelModels`(整批替换):
   *  一次只发一行会把其余没在看的模型全删掉。
   *  ⚠️ 被逻辑模型引用的行删不掉,后端会拒绝并点名;这里原样抛出那句话。
   *  ⚠️ 失败要回滚:界面已经变了而库里没变,不回滚就是界面撒谎。
   */
  async function commitCatalogEdit(e: ModelTableEdit): Promise<void> {
    const base = modelRows.find((r) => r.id === e.id);
    if (!base) return;
    const row = withEdit(base, e);
    setSaving(true);
    setError("");
    try {
      const r = await rendererApi.setChannelModel("sensenova", {
        id: row.fullId ?? `sensenova/${row.id}`,
        name: String(row.name ?? "").trim(),
        vision: Boolean(row.vision),
        context_window: numOf(row.context),
        max_output: numOf(row.output),
        exposed: row.exposed,
      });
      if (!r.ok) {
        setError(r.message ?? "保存登记失败");
        markDirty(false);
        await load();
        return;
      }
      // 先清脏标再 load():顺序反了 load() 会看见脏草稿而拒绝覆盖,页面停在旧值。
      markDirty(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      markDirty(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="chan-page">
      {error ? (
        <p className="chan-banner err" role="alert">
          {error}
        </p>
      ) : null}
      {refreshMsg ? (
        <p className="chan-banner ok" role="status">
          {refreshMsg}
        </p>
      ) : null}

      {/* 第一段:账号状态 —— 一个账号一个框(框内左用户名 / 右各池 5h 剩余 + 重置时刻)。
          刷新按钮在子标题行右端(2026-10-30 第二轮定案),页面内不再摆刷新条。 */}
      <AccountRows accounts={accountRows} emptyText="暂无账号" />

      {/* 第三段:模型目录。勾选 = 登记(取消勾选 = 删除该行);是否列入 /v1/models 在部署页。
          ⚠️ 2026-10-31:保存按钮删掉了(用户定案「能实时保存则删除所有页面的保存按钮」),
          勾选/改名/改窗口都在 blur 或回车时直接落库。 */}
      <article className="chan-card">
        <ModelTable
          rows={modelRows}
          showRate={false}
          disabled={saving}
          emptyText="暂无模型"
          onEdit={handleCatalogEdit}
          onCommit={(e) => void commitCatalogEdit(e)}
          toolbar={
            <header className="chan-head">
              <h3>模型目录</h3>
              <button
                type="button"
                className="btn btn-sm"
                disabled={refreshing}
                onClick={() => void refreshCatalog(true)}
              >
                {refreshing ? "刷新中…" : "刷新模型列表"}
              </button>
              {/* 原来这句话挂在子标题行的刷新按钮旁边;按钮搬到模型列表后跟着搬,
                  否则「上次什么时候刷的」就没人看了。 */}
              <span className={`act-note${refreshing ? " busy" : ""}`} title={refreshNote}>
                {refreshNote}
              </span>
            </header>
          }
        />
      </article>

    </section>
  );
}

export { SenseNovaPage };
