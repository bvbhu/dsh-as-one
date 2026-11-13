/**
 * 渠道页(Trae / WorkBuddy)—— 1:1 复刻 Nexus `ProviderCard.vue` 的数据与交互,
 * 版式按用户 2026-10-30 定案统一(与 Qoder / SenseNova 三处同形):
 *
 * ⭐ 两段式(卡序固定,与 Qoder / SenseNova 同形):
 *   ① 账号状态 —— **一个账号一行**(`components/AccountRows.tsx`):
 *      左 = 用户名(只写名字,不写「workbuddy/」这类渠道前缀,已加粗);
 *      右 = 「剩余积分 N」+「最近到期 TIME」。
 *   ② 模型目录 —— 列与交互由共享 `components/ModelTable.tsx` 统一定义,
 *      本页只负责**草稿 → 脏判 → 撤销 / 保存**。
 *
 * ⚠️ 2026-11-08 刷新语义重排(用户定案):
 *   - 本页**不再有**页面级刷新按钮(原来登记到子标题行右端的那颗已删);
 *     额度统一由渠道页顶部常显的「全部刷新」刷,签到由「全部签到」刷;
 *   - 模型目录的刷新是**表格表头那颗「刷新模型列表」**,只拉目录、不碰额度与签到。
 *
 * ⚠️ 2026-11-08 用户定案:**本页不再提供任何「接入/配置账号」的入口**。
 *   「自动发现并接入」按钮、「客户端路径」输入与「检测」按钮已整段移除 ——
 *   账号一律由 Agent 直接写 `credential` 表配置,面板只读展示。理由:这些入口
 *   会扫本机登录态并自动写凭据,与「接入账号必须经 Agent 显式操作」冲突。
 *   后端 RPC(discoverChannelAccounts / adoptChannelAccount / saveClientPath /
 *   detectClientPath)保留,供 Agent 侧脚本使用,但不再从 UI 触发。
 *
 * ⚠️ 2026-10-30 版式统一时**删掉了所有说明文字**(用户明确要求「不写说明文字」):
 *   顶部的 `maintenance.reason`、`page.message`(渠道无额度子系统的长句)、
 *   未登录时逐行 `searched` hint、客户端路径的常驻 hint —— 这些信息原本都是
 *   「解释为什么界面长这样」,现在只保留**出错时**的 `chan-banner err`。
 *   数据没拉到时右侧不摆徽章(而不是摆「未知」),错误原因仍走 warn-line。
 *
 * ⚠️ 已裁定可接受的偏差(不要试图改):
 *   - 「As One · 模型」h1 由壳渲染,本页不渲染 h1。
 *
 * ⚠️ 诚实降级(契约没有的能力,如实说明,不编造数据):
 *   - `credits`:trae / workbuddy 是**真额度**(chQuotaCache,按需拉取 + 冷却闸门),
 *     且 2026-10-30 起**逐账号**各带一份(`ChannelAccount.credits`)—— 多账号时每行
 *     摆自己的数字,不再把第一个账号的额度复制到所有行。`left == null` 时该行右侧
 *     留空,`credits.error` 原样摆 warn-line。
 *   - `checkin.supported=false`:不摆「刷新时顺带签到」徽章。
 *   - 名称 / 视觉 / 上下文 / 最大输出仍是**真落库**(`setChannelModels` 整批提交,
 *     见 save())。
 *
 * ⚠️ 页面拿到的所有时间戳都是 **epoch 毫秒**;`ago()` 入参是本地毫秒表 `nowMs`,
 *   那句「多久之前」才会自己往前走。
 * ⚠️ 「正在刷新 · 已用 N.Ns」也走毫秒表:实测 trae/workbuddy 整轮刷新只要 0.3~0.8 秒,
 *   秒级粒度下用户永远只看到 0 秒(那不是没在刷新,是量不出来)。
 */
import React from "react";
import { rendererApi } from "../../api";
import type { CatalogModel, ChannelAccount, ChannelCredits, ProviderPage } from "../../api";
import ModelTable from "../../components/ModelTable";
import type { ModelTableEdit } from "../../components/ModelTable";
import { AccountRows } from "../../components/AccountRows";
import type { AccountRow } from "../../components/AccountRows";

export interface ChannelPageProps {
  /** minimax(2026-11-07 渠道合并页):走同一套三段式,但目录是内置名单、
   *  无本机客户端段、凭据走 bridge 导入脚本(见 fetch_minimax_catalog)。 */
  provider: "trae" | "workbuddy" | "minimax";
}

/** 完整 id(`provider/模型`)→ 裸模型名(表格行键 + 提交用)。 */
function bare(id: string): string {
  const i = id.lastIndexOf("/");
  return i >= 0 ? id.slice(i + 1) : id;
}

/** epoch 毫秒 → 本地时间。入参必须是毫秒(后端投影层已折算)。 */
function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/** 数字人话(千分位,最多两位小数);null / undefined → 「—」。 */
function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** 输入框字符串 → 声明值。空 / 0 / 非法一律当「不声明」(与 Nexus num 同义)。 */
function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** 模型目录草稿行:字段与 Nexus ProviderCard.DraftRow / toDraft 逐项对应。
 *
 *  ⚠️ `id` 是**裸模型名**(表格的行键与显示值,也是 `setModelExposure` 的入参),
 *  `fullId` 才是完整对外 id。两者不能合成一个字段:合成之后提交体与表格显示会
 *  互相拖累(与 Nexus ProviderCard 同一条教训)。
 */
interface DraftRow {
  /** 裸模型名(`glm-5.3-flash`)。 */
  id: string;
  /** 完整对外 id(`<provider>/<模型>`),表格 title 提示用。 */
  fullId: string;
  name: string;
  exposed: boolean;
  available: boolean;
  vision: boolean;
  /** 输入框里的字符串,空 = 用目录值 / 清空声明。 */
  context: string;
  output: string;
  rate: number | null;
  registered: boolean;
  callable: boolean;
  origin: string | null;
  endpoints: number;
  /** 上游核验表说它是图像模型 → 表格上的绿点。 */
  visionUpstream: boolean;
  defaultContext: number | null;
  defaultOutput: number | null;
}

/** 目录行 → 草稿行(与 Nexus ProviderCard.toDraft 逐字段一致)。 */
function toDraft(models: CatalogModel[]): DraftRow[] {
  return models.map((m) => ({
    id: bare(m.id),
    fullId: m.id,
    name: m.name,
    exposed: m.exposed,
    available: m.available,
    vision: m.vision,
    context: m.context_window != null ? String(m.context_window) : "",
    output: m.max_output != null ? String(m.max_output) : "",
    rate: m.rate,
    registered: m.registered,
    callable: m.callable,
    origin: m.origin,
    endpoints: m.endpoints,
    visionUpstream: m.default_vision ?? false,
    defaultContext: m.default_context,
    defaultOutput: m.default_output,
  }));
}

export default function ChannelPage({ provider }: ChannelPageProps): React.JSX.Element {
  const [page, setPage] = React.useState<ProviderPage | null>(null);
  /** 模型目录草稿:保存才生效(与 Nexus ProviderCard.draft 同构)。 */
  const [draft, setDraft] = React.useState<DraftRow[]>([]);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  /** 「刷新模型列表」在跑(只拉上游目录并落库;不碰额度、不签到)。 */
  const [catalogBusy, setCatalogBusy] = React.useState(false);

  /** 读页面。**不打上游**:凭据与模型目录都来自本地库(与 Nexus load() 同义:
   *  Nexus 的 load() 也是无条件把草稿同步成后端给的状态)。 */
  async function load(): Promise<void> {
    try {
      const p = await rendererApi.getProviderPage(provider);
      setPage(p);
      setDraft(toDraft(p.models));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ⚠️ 2026-11-08 用户定案:**内嵌页不再自己打上游**。
  // 额度由渠道页顶部的「全部刷新」统一刷(进入页面时也只刷积分余额),
  // 模型目录由下面模型列表上的「刷新模型列表」按钮刷。挂载只读本地库。
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      await load();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const signedIn = page?.signed_in === true;
  const credits: ChannelCredits | null = page?.credits ?? null;

  /** 账号行(第一段):一行一个账号,右侧摆**该账号自己的**额度。
   *
   *  ⚠️ 用 `account.credits`(逐账号快照)而不是顶层 `page.credits`:后者只有一个口径
   *  (第一把有密钥的账号),多账号时会把同一个数字抄到每一行 —— 那是在撒谎。
   *  没拉到额度的账号右侧留空(不摆「未知」)。 */
  const accountRows: AccountRow[] = React.useMemo(() => {
    const list: ChannelAccount[] = page?.accounts ?? [];
    return list.map((a) => {
      const c = a.credits ?? null;
      const hasLeft = c !== null && !c.not_applicable && c.left != null;
      return {
        id: a.label,
        label: a.label,
        note: a.region,
        dot: "ok",
        right: hasLeft && c
          ? {
              key: "剩余积分",
              value: fmtNum(c.left),
              sub: `最近到期 ${fmtTime(c.expires_at_ms)}`,
              tone: "ok",
            }
          : null,
      };
    });
  }, [page]);

  /** 一行额度都没拉到 → 把原因摆一行 warn-line(只摆一次,不按行重复)。
   *
   *  ⚠️ 判据是「所有账号都没有可用余额」,**不是**「credits 为空」:单账号正常时
   *  `credits` 非空但没有 `left` 也可能是因为上游只给了 error。 */
  const creditsError = React.useMemo(() => {
    if (!page || page.accounts.length === 0) return "";
    const anyLeft = page.accounts.some((a) => {
      const c = a.credits;
      return c !== null && c !== undefined && !c.not_applicable && c.left != null;
    });
    if (anyLeft) return "";
    return page.credits?.error ?? "";
  }, [page]);

  /** 表格单字段变更:按裸名回指行,原地改草稿(组件不持有状态)。
   *
   *  ⚠️ 改草稿**不等于落库**:实时保存由 `commitEdit` 负责(勾选框立刻提交,
   *  文本/数字在 blur / 回车提交)。`draft` 在这里只是「输入框正在显示的值」,
   *  让用户打字时不被后端快照覆盖。 */
  function applyEdit(e: ModelTableEdit): void {
    setDraft((rows) =>
      rows.map((row) => {
        if (row.id !== e.id) return row;
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
      }),
    );
  }

  /** 把一次编辑**叠加**到草稿行上,得到「这一格改完后的完整声明」。
   *
   *  ⚠️ 不能直接读 `draft` 里的那一行:勾选框的 `onChange` 会先 `onEdit`(setState 是
   *  异步的)再立刻 `onCommit`,此刻 `draft` 还是**上一帧**的值 —— 直接读会把旧状态
   *  写回库,表现为「点了勾选它自己跳回去」。所以用 `e` 覆盖对应字段。 */
  function withEdit(row: DraftRow, e: ModelTableEdit): DraftRow {
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

  /** 实时保存单行 —— 用户 2026-10-31 定案「如果你可以设计成实时保存,则删除所有页面的
   *  保存按钮(统一)」,四页(Trae / WorkBuddy / Qoder / SenseNova)同一口径。
   *
   *  ⚠️ 必须用 `setChannelModel`(**单行 upsert**)而不是 `setChannelModels`:
   *  后者是整批替换语义(清单外 = 删行),一次只发一行会把用户没在看的模型全删掉。
   *  ⚠️ 失败要**回滚草稿**:界面上的勾/数字已经变了,而库里没变;不回滚就是
   *  界面在撒谎,用户下次刷新才莫名其妙地跳回去。
   *  ⚠️ 成功不弹绿字横幅(与 Nexus 2026-10-12 删掉「模型表已更新」同口径)。
   */
  async function commitEdit(e: ModelTableEdit): Promise<void> {
    const base = draft.find((r) => r.id === e.id);
    if (!base) return;
    const row = withEdit(base, e);
    setSaving(true);
    setError("");
    try {
      const r = await rendererApi.setChannelModel(provider, {
        id: row.fullId,
        name: row.name.trim(),
        vision: row.vision,
        context_window: num(row.context),
        max_output: num(row.output),
        exposed: row.exposed,
      });
      if (!r.ok) {
        setError(r.message ?? "保存失败");
        await load(); // 回滚成库里的真实状态
        return;
      }
      // 成功:静默重读一次,让草稿变成「库里的事实」(下一个脏判从新基线起算)。
      // 此刻用户已经离开那个输入框(提交发生在 blur / 回车),重读不会打断打字。
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setSaving(false);
    }
  }

  /** 「刷新模型列表」—— **只拉上游模型目录并落库**(2026-11-08 用户定案)。
   *
   *  位置:模型目录那张表的表头(与列表在一起),不再是页面级刷新。
   *  额度归渠道页顶部的「全部刷新」,签到归「全部签到」—— 这个按钮两样都不碰。
   *
   *  ⚠️ 装配层对没有目录通路的渠道返回 `ok:false` + 诚实 message(如「该渠道没有
   *  可拉取的上游模型目录」),原样显示在 `chan-banner err` 位置,不假装成功。
   *  ⚠️ `setError` 排在 `await load()` **之后**:load() 会清 error,先设后清会吞掉这句话。
   */
  async function refreshModels(): Promise<void> {
    if (catalogBusy) return;
    setCatalogBusy(true);
    setError("");
    try {
      const r = await rendererApi.syncChannelCatalog(provider, true);
      await load();
      if (!r.ok) setError(r.message ?? "模型目录刷新未成功");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCatalogBusy(false);
    }
  }

  return (
    <section className="chan-page">
      {error ? (
        <p className="chan-banner err" role="alert">
          {error}
        </p>
      ) : null}

      {/* 第一段:账号状态 —— 一个账号一个框。刷新按钮在子标题行右端(2026-10-30
          第二轮定案),这里不再摆刷新条。框内右侧「剩余积分 / 最近到期」;
          说明性信息一律不写。 */}
      <AccountRows
        accounts={accountRows}
        emptyText={signedIn ? "暂无账号" : "未接入账号"}
        footer={creditsError ? <p className="chan-hint warn-line">{creditsError}</p> : null}
      />
      {!page ? (
        <div className="chan-card">
          <p className="chan-empty">加载中…</p>
        </div>
      ) : (
        <>
          {/* 第三段:模型目录(上游目录 ∪ 已登记;列与交互由 ModelTable 统一定义)。
              ⚠️ 2026-10-31:保存按钮删掉了(用户定案「能实时保存则删除所有页面的保存
              按钮」),勾选/改名/改窗口都在 blur 或回车时直接落库。 */}
          <article className="chan-card">
            <ModelTable
              rows={draft}
              disabled={saving}
              emptyText={page.message ?? "未查到模型目录"}
              onEdit={applyEdit}
              onCommit={(e) => void commitEdit(e)}
              toolbar={
                <header className="chan-head">
                  <h3>模型目录</h3>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={catalogBusy}
                    onClick={() => void refreshModels()}
                  >
                    {catalogBusy ? "刷新中…" : "刷新模型列表"}
                  </button>
                </header>
              }
            />
          </article>

        </>
      )}
    </section>
  );
}

export { ChannelPage };
