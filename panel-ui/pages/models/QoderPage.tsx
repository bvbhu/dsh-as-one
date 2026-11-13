/**
 * Qoder 独立管理页(只做国内版,单区域)。
 *
 * 为什么单独一页而不塞进「其他供应商」:
 * - Qoder **不是 OpenAI 兼容上游**:请求体是固定模板 + 按 body 签名(cosy 协议),
 *   一个 provider 行 + 一把 API key 解释不了它;
 * - 它有 OpenAI 兼容供应商没有的东西:账号池(PAT)、模型目录勾选、积分/额度读数
 *   —— 这些读数在供应商通用页里没有位置。
 *
 * 版式(用户 2026-10-30 定案,与 Trae / WorkBuddy / SenseNova 三页统一下来三段):
 * 1. **账号状态** —— 一个账号一个框:左用户名,右「剩余积分 / 最近到期」;
 * 2. **模型目录** —— 勾选要暴露给网关的模型(勾选即登记,不用再点保存);
 *    目录的刷新是**表格表头那颗「刷新模型列表」**(只拉目录,不签到、不刷额度)。
 *
 * ⚠️ 2026-11-08 用户定案:**「账号配置」整段已移除**(PAT 输入框 / 添加并校验 /
 *   逐行删除按钮)。PAT 账号一律由 Agent 直接写 `credential` 表配置,面板只读展示
 *   账号行(第一段)与额度。后端 `qoderAddAccount` / `qoderRemoveAccount` RPC 保留,
 *   供 Agent 侧脚本使用,不再从 UI 触发。
 * **不写说明文字**(用户 2026-10-30 明确要求):原先的「用量预览」深卡、
 * 上游地址那行长 hint、PAT 生成方式提示、空态里的「点右上…」全部删掉;
 * 数字直接摆进账号行。
 *
 * 2026-10-30 第三轮定案(m34784 原话「移除qcoder 的独立上游错误框,移除启用和停用机制,
 * 刷新统一读额度、签到,移除探针,所以账号配置只需要有删除按钮」):
 * - **上游错误框整块删除** —— 刷新失败的原因已经进 note banner,独立大框只是噪音;
 * - **启用/停用机制删除** —— 能不能派发只看「有没有 PAT」,多一个开关等于多一个
 *   会让调度莫名空转的状态;`QoderAccountRow.enabled` 仍在契约里,但页面不再操作它;
 * - **探针按钮删除** —— 刷新本身就会真打上游(目录/额度/签到),再单独探一次没有意义;
 * - **账号配置的「操作」列只剩删除**;每行的「读额度」「签到」也一并删除,
 *   签到与读额度都并进子标题行的「刷新」。
 *
 * 三条纪律(照 SenseNova 页与 Nexus 的同款口径):
 * 1. **没有数据 ≠ 0**。`null` 渲染成「—」,`0` 渲染成「0」。
 * 2. **仍能区分「没查」与「查了没拿到」**:额度/目录各自带独立错误文案,
 *    一处失败不许把整页涂成红色。
 * 3. **勾选 = 本地偏好 + 登记端点**:偏好落 `configDir/qoder-models.json`,
 *    同时把勾上的模型写成 `real_model` 行(取消则删行并摘逻辑模型成员),
 *    勾完就能被调度,不必再去「其他供应商」页手建一遍。
 */
import React from "react";
import { rendererApi } from "../../api";
import type {
  QoderAccountRow,
  QoderCatalogRow,
  QoderCreditsView,
  QoderRegionStatus,
  QoderStatus,
} from "../../api";
import ModelTable from "../../components/ModelTable";
import type { ModelTableEdit, ModelTableRow } from "../../components/ModelTable";
import { AccountRows } from "../../components/AccountRows";
import type { AccountRow } from "../../components/AccountRows";

/** 只接国内版 —— 区域常量留给接口,页面不提供切换。 */
const REGION = "qoder";

/** 数值取整 + 千分位;null/undefined → "—"(「没有数据」不等于 0)。 */
function n(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/** epoch 秒 → 「2026/11/8 18:05:36」这种完整时刻(账号行的「最近到期」用它)。 */
function fmtAt(value: number | null | undefined): string {
  if (!value) return "—";
  return new Date(value * 1000).toLocaleString();
}

/** 异常 → 一句人话(接口抛的 `Error` 直接用 message,别显示 `[object Object]`)。 */
function errText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function QoderPage(): React.JSX.Element {
  const [status, setStatus] = React.useState<QoderStatus | null>(null);
  const [accounts, setAccounts] = React.useState<QoderAccountRow[]>([]);
  const [models, setModels] = React.useState<QoderCatalogRow[]>([]);
  const [credits, setCredits] = React.useState<QoderCreditsView[]>([]);
  const [creditError, setCreditError] = React.useState<string | null>(null);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  /**
   * 读账号 / 上游状态 / 目录 / **额度预览**。
   *
   * 额度也在这里读,是因为账号行右侧要进来就有数 —— 让用户点一下才出数字,
   * 等于把最重要的读数藏在交互后面。
   */
  const load = React.useCallback(async (): Promise<void> => {
    setBusy("load");
    try {
      const [st, acc] = await Promise.all([
        rendererApi.getQoderStatus().catch(() => null),
        rendererApi.getQoderAccounts().catch(() => ({ accounts: [], count: 0 })),
      ]);
      setStatus(st);
      setAccounts(acc.accounts);
      const rows = await rendererApi.getQoderModels(REGION).catch(() => []);
      setModels(rows);
      setCatalogError(rows.length === 0 ? "目录为空:上游没给模型或还没拉过" : null);
      if (acc.accounts.length > 0) {
        const credit = await rendererApi.qoderCredits(REGION).catch((error: unknown) => {
          setCreditError(errText(error));
          return [];
        });
        setCredits(credit);
        if (credit.length > 0) setCreditError(null);
      }
    } finally {
      setBusy(null);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const st: QoderRegionStatus | null =
    status === null ? null : (status.regions.find((r) => r.region === REGION) ?? null);

  const run = async (key: string, what: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key);
    setNote(null);
    try {
      await action();
    } catch (error) {
      setNote({ kind: "err", text: `${what}失败:${errText(error)}` });
    } finally {
      setBusy(null);
    }
  };

  /** 「刷新模型列表」—— **只拉上游目录**(2026-11-08 用户定案)。
   *
   *  拆分前这一颗按钮干三件事(目录 + 签到 + 额度),于是「只想更新模型列表」也会
   *  顺手签到、顺带打一圈额度接口。现在:
   *    - 签到 → 渠道页顶部「全部签到」;
   *    - 积分 → 渠道页顶部「全部刷新」;
   *    - 目录 → 这里。
   */
  const refreshModels = (): void => {
    void run("catalog", "刷新模型列表", async () => {
      const res = await rendererApi.qoderRefreshCatalog(REGION);
      const rows = await rendererApi.getQoderModels(REGION).catch(() => []);
      setModels(rows);
      setCatalogError(rows.length === 0 ? "目录为空:上游没给模型" : null);
      setNote({
        kind: res.ok ? "ok" : "warn",
        text: res.message ?? (res.ok ? "目录已刷新" : "目录刷新未成功"),
      });
    });
  };

  const onToggleModel = (row: QoderCatalogRow, enabled: boolean): void => {
    // 乐观更新:勾选是本地偏好,失败再回滚并给文案。
    setModels((prev) => prev.map((m) => (m.key === row.key ? { ...m, selected: enabled } : m)));
    void run(`model:${row.key}`, "保存勾选", async () => {
      const res = await rendererApi.qoderSetModelEnabled(REGION, row.key, enabled);
      if (!res.ok) {
        setModels((prev) => prev.map((m) => (m.key === row.key ? { ...m, selected: !enabled } : m)));
        setNote({ kind: "err", text: res.message ?? "保存失败" });
        return;
      }
      // 勾选会连带登记/删除 real_model 端点,把结果如实说出来(新登记几个、
      // 摘掉几处逻辑模型成员),否则用户不知道库里发生了什么。
      setNote({ kind: "ok", text: res.message ?? "已保存" });
    });
  };

  /** 账号行(第一段):一行一个账号,右侧一枚「剩余积分」= 套餐 + 资源包。
   *
   *  ⚠️ 为什么要把两个桶加在一起(2026-11-02 用户定案「直接合并到一起,显示剩余
   *  积分即可」):Qoder 的可用额度分两处 —— `userQuota`(套餐)与 `addOnQuota`
   *  (资源包,每日签到领的 100 Credits 按官方规则记在这里)。两者都能扣费(按各自
   *  到期时间先扣,同时到期先扣套餐),所以对用户来说就是「还剩多少积分」一个数。
   *
   *  ⚠️ 只摆套餐会漏账(用户报「领完了还是 0 积分」):套餐用尽的账号,签到涨的
   *  100 一个数都看不见。实测账号池:一个 `套餐 0/300 + 资源包 0/400`(真空),
   *  另一个 `套餐 190/300 + 资源包 400/400` —— 合并后分别是 0 与 590。
   *
   *  ⚠️ 数字取自**该账号自己的**额度读数;没读到就留空,不把别的账号的数字抄过来。
   *  ⚠️ 两个桶一个有一个缺(null)时只加有值的那个;两个都没值才不摆徽章。
   *  ⚠️ 状态点只看「有没有 PAT」(2026-10-30 第三轮:启停机制已移除),
   *  有 PAT 但上游报错就点红。
   */
  const accountRows: AccountRow[] = React.useMemo(
    () =>
      accounts.map((a) => {
        const c = credits.find((x) => x.account === a.account) ?? null;
        const ready = c !== null && c.ok;
        /** 合并两个桶的剩余;null 表示「这个桶没读数」,不参与求和。 */
        const sumRemaining = (): number | null => {
          if (!ready) return null;
          const buckets = [c.userQuota?.remaining, c.addOnQuota?.remaining];
          const known = buckets.filter((v): v is number => v !== null && v !== undefined);
          return known.length === 0 ? null : known.reduce((sum, v) => sum + v, 0);
        };
        const left = sumRemaining();
        // ⚠️ 到期只显示签到积分估算值(panel viewExpiresAt,2026-11-05 用户定案:
        // 上游套餐级真实值也不准,统一按 FIFO 阶梯推算)。addOn 无余额 → null,
        // 此时不摆「到期」徽章;不回退凭据里的 expiresAt。
        const exp = c?.expiresAt ?? null;
        return {
          id: a.account,
          label: a.account,
          note: [c?.userType ?? a.userType, `${a.models} 个模型`].filter(Boolean).join(" · "),
          dot: a.lastError ? ("bad" as const) : a.hasPat ? ("ok" as const) : ("off" as const),
          right:
            left !== null
              ? {
                  key: "剩余积分",
                  value: n(left),
                  sub: exp !== null ? `约 ${fmtAt(exp)}` : null,
                  // 有余额才是绿;0 表示两个桶都空了 —— 用黄,不假装正常。
                  tone: left > 0 ? ("ok" as const) : ("warn" as const),
                }
              : null,
        };
      }),
    [accounts, credits],
  );

  /** 模型目录行(第二段):统一 ModelTable,勾选 = 登记并立刻落库(没有保存按钮)。
   *
   *  ⚠️ `context` 摆的是**上游 `context_config` 最大档**,不是 `max_input_tokens`
   *  (后者只是 is_default 那一档,例如 200K/400K/1M 里选 200K)。网关按声明上限走,
   *  取默认档等于白扔 80% 窗口(用户 2026-10-31 指出)。
   *  ⚠️ 未勾选的行库里没有记录,所以本表用 `plainColumns`(只读文本)—— 给一个
   *  改了也存不住的输入框等于骗人。 */
  const modelRows: ModelTableRow[] = React.useMemo(
    () =>
      models.map((m) => {
        const ctx = m.maxContextTokens ?? m.maxInputTokens;
        return {
          id: m.key,
          name: m.displayName,
          rate: m.priceFactor,
          context: ctx === null ? "" : String(ctx),
          output: m.maxOutputTokens === null ? "" : String(m.maxOutputTokens),
          vision: m.isVl,
          exposed: m.selected,
          available: m.upstreamEnabled,
          defaultContext: ctx,
          defaultOutput: m.maxOutputTokens,
          visionUpstream: m.isVl,
        };
      }),
    [models],
  );

  const handleModelEdit = (e: ModelTableEdit): void => {
    const row = models.find((m) => m.key === e.id);
    if (row === undefined) return;
    if (e.field === "exposed") onToggleModel(row, Boolean(e.value));
  };

  return (
    <div className="chan-page">
      {note ? <div className={`chan-banner ${note.kind}`}>{note.text}</div> : null}

      {/* ① 账号状态 —— 一个账号一个框 */}
      <AccountRows
        accounts={accountRows}
        emptyText="暂无账号"
        footer={creditError ? <p className="chan-hint warn-line">{creditError}</p> : null}
      />

      {/* ② 模型目录(统一表;勾选即登记) */}
      <div className="chan-card">
        <ModelTable
          rows={modelRows}
          plainColumns
          disabled={busy !== null}
          emptyText="暂无模型"
          onEdit={handleModelEdit}
          toolbar={
            <header className="chan-head">
              <h3>模型目录</h3>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy !== null}
                onClick={refreshModels}
              >
                {busy === "catalog" ? "刷新中…" : "刷新模型列表"}
              </button>
            </header>
          }
        />
        {catalogError ? <p className="chan-hint warn-line">{catalogError}</p> : null}
      </div>

    </div>
  );
}

export default QoderPage;
