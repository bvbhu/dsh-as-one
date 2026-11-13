/**
 * 模型总览(部署)子页(移植 Nexus panel/web/src/Deployments.vue,2026-10-12 定案;
 * 2026-10-25 m14379 重新设计布局:headActions 从右侧竖排改为顶部工具条,
 * 分组列表占满全宽;2026-10-25 m14922 再改:去掉收起/展开,改为多列卡片式布局)。
 *
 * 结构对照(Nexus 模板 → 本页):
 *   section.section                  → section.section.dep-section
 *   div.err / p.savedNotice          → 同(错误 / 保存成功)
 *   p.hint.na(无部署)                → 同文案
 *   div.listLayout                   → 顶部 .dep-toolbar(统计 + 供应商筛选,无批量按钮)
 *     div.group > div.groupHead      → (已移除:不再按 provider 分组折叠)
 *     div.groupBody > div.depRow     → .dep-grid > .depCard 每部署一卡(provider 名 + depCode
 *                                     + depChips 徽章串 + 并发输入 + /v1/models 复选框)
 *
 * ⚠️ 契约说明(panel-types.ts):
 * 1. Nexus 的行/组级「冷却」取 status.deployments 运行时行(runtimeOf(d));As One 契约把
 *    in_cooldown / cooldown_remaining_s 直接放在 DeploymentItem 上 → 本页直接用这两个字段,
 *    不再需要 /status。Nexus fmtCooldown 的 cooldown.status_code 后缀(HTTP n)契约没有
 *    → 只显示时长(fmtDuration)。
 * 2. Nexus anomalyOf 的 ②运行态分支(last_kind: auth/auth_challenge/bad_request)契约无
 *    对应字段 → 只保留 ①usable_endpoint_count === 0 的缺配置判定。
 * 3. 并发上限输入即存:setDeploymentExposure(id, kind, listed, concurrency) 第 4 参
 *    真写 db.real_model.concurrency(1~2^20 = 1048576),调度端点并发即时生效(core-repo 读 db 覆盖)。
 *    ⚠️ 2026-11-08 用户改口:**这个值是「每个凭据」的并发上限** —— 同一真实模型下
 *    N 个凭据 = N × 该值(并发填 1、三个凭据就是三并发),不再按真实模型共享一个桶。
 * 4. toggleDirect 调 setDeploymentExposure(id, "direct", !listed) → 真写 db.real_model.hidden
 *    (面板 listed 即时生效;网关 /v1/models 走配置注册表,重启后一致)。
 * 5. 保存的 !r.ok 分支:Nexus 的 api 层在 !ok 时抛错进 catch;As One 契约直接返回
 *    {ok, message},故这里显式把 !ok 落进 error(等价语义)。
 */
import React from "react";
import { rendererApi } from "../../api";
import type { DeploymentItem } from "../../api";
import { fmtDuration, fmtInt, fmtPct, fmtSecFromMs } from "../../format";

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 「思考强度」当前值的**展示文案** —— 显示**数据库原始文本**。
 *
 * 2026-11-03 用户定案:思考强度可以出现两种值:
 * - **数据库原始文本**(`real_model.supported_reasoning_efforts` 列的原文,
 *   如 `["low","medium","high"]`)—— 原样显示,不做归一、不做美化。归一后的
 *   数组会丢掉上游原始拼写(如 `xhigh`),只显示归一结果就看不出「存的≠生效的」。
 * - **「默认」** —— 列是 NULL 时(网关不拦也不发,交给上游自己决定)。
 *
 * 原始文本取自 `supported_reasoning_efforts_raw`(库里那一列的原文)。
 * 空字符串按「默认」处理(等价于没存)。
 */
function effortRawText(d: DeploymentItem): string {
  const raw = d.supported_reasoning_efforts_raw;
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

/** 当前展示值:数据库原始文本,没有则「默认」。 */
function effortDisplayText(d: DeploymentItem): string {
  return effortRawText(d) || "默认";
}

/**
 * 当前 select 的选中值 = **数据库原始文本**(NULL 时 = 「默认」那一项)。
 *
 * 选中项用 `hidden` 渲染:闭合时显示它的文案(= 库里原文),展开时它不出现在
 * 下拉列表里 —— 列表只剩「默认」和「尝试从上游获取」两个**动作**。
 */
function effortSelectValue(d: DeploymentItem): string {
  const raw = effortRawText(d);
  return raw ? EFFORT_RAW_PREFIX + raw : EFFORT_DEFAULT_VALUE;
}

/**
 * 思考强度档位表的**来源**(操作菜单,不是状态)。
 *
 * 2026-11-03 用户定案:原先七档预设(Unset / No reasoning / Low / … / Max-off)
 * 全部去掉,只留两个动作项。理由:档位是**上游的能力事实**,不是用户偏好 ——
 * 手工挑「Low, Medium, High」既容易填错,也跟不上上游新增档位。
 *
 * - `default` = **默认**:把 `supported_reasoning_efforts` 清成 NULL
 *   (网关按该协议的默认梯钳制后翻译成上游字段,见 `core/gateway/reasoning-wire.ts`);
 * - `upstream` = **尝试从上游获取**:现在去问上游一句,把它给的档位表落库。
 *
 * ⚠️ 两项都是**动作**,不是「当前状态」—— 当前状态由旁边的原始文本展示。
 * 实现在后端 `setDeploymentReasoning` / `fetchDeploymentReasoning`。
 */
const EFFORT_ACTIONS = [
  { id: "default", label: "默认" },
  { id: "upstream", label: "尝试从上游获取" },
] as const;

/** 操作项的内部 value(与展示文案分开,避免原始文本与文案撞值)。 */
const EFFORT_DEFAULT_VALUE = "__effort_default__";
const EFFORT_UPSTREAM_VALUE = "__effort_upstream__";
/** 承载「当前数据库原文」的隐藏项前缀(只作 key,不展示)。 */
const EFFORT_RAW_PREFIX = "__effort_raw__";

/**
 * 「异常」徽章判定(2026-10-12):只认配置类故障。
 * ① 缺配置:该 provider 名下一条带密钥的凭据都没有,这个模型必然调不通(来自 DB,重启不丢)。
 * ② 运行态留痕(last_kind)分支契约无字段 → 已按降级说明省略。
 * 返回空串 = 不显示;徽章文字统一是「异常」,具体原因放 tooltip。
 */
function anomalyOf(d: DeploymentItem): string {
  if ((d.usable_endpoint_count ?? 0) === 0) {
    return `${d.provider} 名下没有可用密钥(缺配置),该模型没有可用的端点。`;
  }
  return "";
}

function fmtCooldown(d: DeploymentItem): string {
  if (!d.in_cooldown || d.cooldown_remaining_s == null) return "—";
  return fmtDuration(d.cooldown_remaining_s);
}

/** 最近一次记录的平均 TTFT(秒,一位小数)。无记录 → 「—」。 */
function fmtLatency(d: DeploymentItem): string {
  const v = d.avg_ttft_ms;
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${fmtSecFromMs(v)} s`;
}

/** 最近一次记录的平均 TPS(取整)。无记录 → 「—」。 */
function fmtTps(d: DeploymentItem): string {
  const v = d.avg_tps;
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return fmtInt(v);
}

/** TTFT 与 TPS 各自独立判断有没有记录(缺一个就少一个徽章)。 */
function hasTtft(d: DeploymentItem): boolean {
  const v = d.avg_ttft_ms;
  return v !== null && v !== undefined && Number.isFinite(v);
}

function hasTps(d: DeploymentItem): boolean {
  const v = d.avg_tps;
  return v !== null && v !== undefined && Number.isFinite(v);
}

/** 缓存命中率与 TTFT/TPS **同一天、同一批行**,三者要么一起有、要么一起没有。 */
function hasCache(d: DeploymentItem): boolean {
  const v = d.cache_hit_rate;
  return v !== null && v !== undefined && Number.isFinite(v);
}

/** 悬浮精确值(最近记录来源日期 + 原样数值)。 */
function latencyTitle(d: DeploymentItem): string {
  const parts: string[] = [];
  if (d.latency_day) parts.push(`${d.latency_day} 记录`);
  if (d.avg_ttft_ms != null) parts.push(`平均 TTFT ${d.avg_ttft_ms} ms`);
  if (d.avg_tps != null) parts.push(`平均 TPS ${d.avg_tps}`);
  if (d.cache_hit_rate != null) parts.push(`缓存命中 ${fmtPct(d.cache_hit_rate)}(cached ÷ prompt)`);
  return parts.join(" · ");
}

/** 按钮说明:必须把「不列出 ≠ 不能用」这句话说出来(D28)。 */
function exposeTitle(d: DeploymentItem): string {
  if (d.listed)
    return (
      "已纳入:外部能在模型列表里看到并直接以 供应商/模型id 调用。" +
      "点「未纳入」把它从列表里移除 —— ⚠️ 移除后仍然可以直接请求,也可以被逻辑模型引用。"
    );
  return (
    "未纳入:模型列表里看不到它。" +
    "⚠️ 但它仍然可以被直接请求、也可以被逻辑模型引用 —— 这里只控制「是否纳入」。"
  );
}

/**
 * 供应商筛选器(2026-11-12 新增,**纯前端**按 `provider` 过滤本页卡片)。
 *
 * - 选项 = 当前列表里**出现过的** provider(去重 + 字母序),第一项「全部」;
 * - 默认「全部」;切换后只渲染该供应商的卡片;
 * - 只影响本页显示:不写库、不发请求、不改 `/v1/models`(后端契约不动)。
 *
 * ⚠️ 「全部」用**哨兵值**而不是空串:`provider` 为空串的行是真实存在的
 * (卡头显示「未分组」),空串要留给「未分组」这一项,两者不能撞值。
 */
const ALL_PROVIDERS = "__all_providers__";

/** 分组用的 provider 键(空串保留,渲染时再映射成「未分组」)。 */
function providerKey(d: DeploymentItem): string {
  return (d.provider ?? "").trim();
}

/** 下拉里的显示文案(与卡头 `.depProvider` 的「未分组」回退保持一致)。 */
function providerLabel(key: string): string {
  return key || "未分组";
}

export interface DeploymentsPageProps {
  /** 预留:无外部入参(与 Nexus 页面一致)。 */
}

export function DeploymentsPage(_props: DeploymentsPageProps): React.JSX.Element {
  const [deployments, setDeployments] = React.useState<DeploymentItem[]>([]);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  /** 「是否列入 /v1/models」开关:正在切换的 deployment_id(按钮禁用防连点)。 */
  const [directBusy, setDirectBusy] = React.useState("");
  /** 思考强度选择器:正在保存的 deployment_id。 */
  const [effortBusy, setEffortBusy] = React.useState("");
  /** 供应商筛选器:当前选中的 provider 键;默认「全部」= 不筛选。 */
  const [providerFilter, setProviderFilter] = React.useState<string>(ALL_PROVIDERS);
  async function load(): Promise<void> {
    try {
      const dep = await rendererApi.getDeployments();
      setDeployments(dep.deployments);
      setError("");
    } catch (e) {
      setError(msg(e));
    }
  }

  React.useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, []);

  /** 已列入 /v1/models 的个数(D28:不是「可被调用」的个数)。 */
  const exposedCount = deployments.reduce((n, d) => n + (d.listed ? 1 : 0), 0);

  /** 按使用量排序(m15180):total_tokens 降序,并列时按请求数降序,再按模型名。
   *  用 memo 避免每次渲染都排;10s 轮询新数据自然触发重排。 */
  const sorted = React.useMemo<DeploymentItem[]>(
    () =>
      [...deployments].sort((a, b) => {
        const dt = (b.total_tokens ?? 0) - (a.total_tokens ?? 0);
        if (dt !== 0) return dt;
        const dr = (b.requests ?? 0) - (a.requests ?? 0);
        if (dr !== 0) return dr;
        return a.model.localeCompare(b.model);
      }),
    [deployments],
  );

  /** 下拉选项:列表里出现过的 provider 去重 + 字母序。
   *  依赖 `deployments`(不是 `sorted`):10s 轮询新增供应商时选项自动跟上。 */
  const providerOptions = React.useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const d of deployments) set.add(providerKey(d));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [deployments]);

  /** 供应商筛选**叠加**在原有「按用量排序」之上:先排序,再按 provider 过滤,
   *  顺序不变(不是另开一份排序)。 */
  const visible = React.useMemo<DeploymentItem[]>(
    () =>
      providerFilter === ALL_PROVIDERS
        ? sorted
        : sorted.filter((d) => providerKey(d) === providerFilter),
    [sorted, providerFilter],
  );

  /** 轮询刷新后该供应商可能整体消失(最后一条模型被删/改了 provider)→ 自动回到
   *  「全部」。否则受控 select 会停在一个已不存在的选项上(显示空白)。 */
  React.useEffect(() => {
    if (providerFilter !== ALL_PROVIDERS && !providerOptions.includes(providerFilter)) {
      setProviderFilter(ALL_PROVIDERS);
    }
  }, [providerFilter, providerOptions]);

  /** 「是否列入 /v1/models」开关(只写 hidden;As One 侧仅记录意图,见文件头降级说明)。 */
  async function toggleDirect(d: DeploymentItem): Promise<void> {
    if (directBusy) return;
    setDirectBusy(d.deployment_id);
    setError("");
    setNotice("");
    try {
      const r = await rendererApi.setDeploymentExposure(d.deployment_id, "direct", !d.listed);
      if (!r.ok) {
        setError(r.message || "操作失败");
        return;
      }
      setNotice(r.message ?? (d.listed ? "已从模型列表移除" : "已纳入模型列表"));
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setDirectBusy("");
    }
  }

  /**
   * 并发上限:输入即存。
   *
   * ⚠️ 语义(2026-11-08 改口):这里是**每个凭据**的并发上限 —— 同一真实模型下
   * N 个凭据各自 N 份槽(填 1 + 三个凭据 = 三并发),不是整个模型共享一份。
   *
   * ⚠️ 空输入 = 不改(不是改回 1):用户只是碰了一下输入框又删掉,不该因此把
   * 并发从 8 改成 1 —— 那是一个「我没干什么,它自己变了」的静默变更。所以
   * 空串 / 非法值直接放弃,本地不写回。
   *
   * ⚠️ 不改 listed:这里只提交 concurrency,勾选态原样传给后端。
   */
  async function saveConcurrency(d: DeploymentItem, raw: string): Promise<void> {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return; // 空 / 非法:放弃,不写回
    const capped = Math.min(1 << 20, Math.max(1, Math.trunc(n)));
    if (capped === (d.concurrency ?? 1)) return; // 没变:不发请求
    setDirectBusy(d.deployment_id);
    setError("");
    setNotice("");
    try {
      const r = await rendererApi.setDeploymentExposure(d.deployment_id, "direct", d.listed, capped);
      if (!r.ok) {
        setError(r.message || "操作失败");
        return;
      }
      setNotice(`并发上限已改为 ${capped}(${r.message ?? ""})`);
      setDeployments((prev) =>
        prev.map((it) =>
          it.deployment_id === d.deployment_id ? { ...it, concurrency: capped } : it,
        ),
      ); // 本地立即回写,不等 10s 轮询
    } catch (e) {
      setError(msg(e));
    } finally {
      setDirectBusy("");
    }
  }

  /**
   * 思考强度操作菜单:选中即执行(与并发输入同一风格)。
   *
   * 两个选项走**两个不同的后端动作**(2026-11-03 用户定案):
   * - 「默认」→ 把 `supported_reasoning_efforts` 清成 NULL
   *   (网关一个字段都不发,交还上游默认;不猜、不造默认梯);
   * - 「尝试从上游获取」→ 触发一次上游目录探测,把上游给的档位表落库。
   *
   * 菜单里的两项是**动作**不是「当前状态」—— 当前状态由旁边的数据库原文展示。
   * 落库后 `/v1/models`、DSH adapter 的 `reasoning.efforts`、网关钳制读的都是
   * 同一份表,不需要重启。
   */
  async function saveReasoning(d: DeploymentItem, actionValue: string): Promise<void> {
    if (effortBusy) return;
    // 选中项有两种:动作项(两个),以及承载当前值的隐藏项(点它等于没变)。
    let action: "default" | "upstream" | null = null;
    if (actionValue === EFFORT_DEFAULT_VALUE) action = "default";
    else if (actionValue === EFFORT_UPSTREAM_VALUE) action = "upstream";
    if (!action) return;
    // 「默认」在已经是 NULL 时是空操作,不必发请求。
    if (action === "default" && !effortRawText(d)) return;
    setEffortBusy(d.deployment_id);
    setError("");
    setNotice("");
    try {
      const r = action === "upstream"
        ? await rendererApi.fetchDeploymentReasoning(d.deployment_id)
        : await rendererApi.setDeploymentReasoning(d.deployment_id, null, null);
      if (!r.ok) {
        setError(r.message || "操作失败");
        return;
      }
      setNotice(r.message ?? "思考强度已保存");
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setEffortBusy("");
    }
  }

  return (
    <section className="section dep-section">
      {error ? <div className="err" role="alert">{error}</div> : null}
      {notice ? <p className="savedNotice" role="status">{notice}</p> : null}

      {deployments.length === 0 ? (
        <p className="hint na">
          尚无真实模型 —— 先到「兼容供应商」或对应渠道页登记模型。
          登记后端点自动成立(端点 = 真实模型 × 该供应商名下的凭据行)。
        </p>
      ) : (
        <>
          <div className="dep-toolbar">
            <span className="dep-summary">
              {deployments.length} 个真实模型
              {exposedCount > 0 ? ` · ${exposedCount} 个已纳入模型列表` : ""}
              {providerFilter === ALL_PROVIDERS ? "" : ` · 当前筛出 ${visible.length} 个`}
            </span>
            {/* 供应商筛选(纯前端):复用卡片里既有的 .depChipEdit / .chipLabel /
                .chipSelect 样式,与页面其它控件同一套观感。本页没有别的筛选/搜索,
                所以不存在「叠加互相覆盖」的问题;将来若加搜索,过滤只需再接一层。 */}
            <label
              className="depChipEdit"
              title="按供应商筛选本页模型(只影响显示,不改任何数据)"
            >
              <span className="chipLabel">供应商</span>
              <select
                className="chipSelect"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.currentTarget.value)}
                aria-label="按供应商筛选"
              >
                <option value={ALL_PROVIDERS}>全部</option>
                {providerOptions.map((p) => (
                  <option key={p} value={p}>
                    {providerLabel(p)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="hint na">该供应商下暂无真实模型 —— 下拉切回「全部」可看全部。</p>
          ) : (
            <div className="dep-grid">
              {visible.map((d) => (
                <div key={d.deployment_id} className="depCard">
                  <div className="depCardHead">
                    <span className="depProvider" title="供应商">
                      {d.provider || "未分组"}
                    </span>
                    <code className="depCode" title={`真实模型:${d.deployment_id}`}>{d.model}</code>
                    {/* 勾选 = 出现在模型列表里(D28:不纳入 ≠ 不能用) */}
                    <label className="depCheck" title={exposeTitle(d)}>
                      <input
                        className="checkInput"
                        type="checkbox"
                        checked={d.listed}
                        disabled={directBusy === d.deployment_id}
                        onChange={() => void toggleDirect(d)}
                      />
                      <span>纳入模型列表</span>
                    </label>
                  </div>

                  <div className="depCardBody">
                    <span className="depChips">
                      {anomalyOf(d) ? (
                        <span className="pill alert" title={anomalyOf(d)}>异常</span>
                      ) : null}

                      {d.in_cooldown ? (
                        <span className="pill bad">冷却 {fmtCooldown(d)}</span>
                      ) : null}

                      {d.supports_vision ? <span className="pill info">视觉</span> : null}

                      {/* 思考强度:显示**数据库原始文本**(NULL 时显示「默认」),
                          展开下拉只有「默认」和「尝试从上游获取」两项动作。
                          写库后 /v1/models、DSH 模型选择器的「推理等级」、网关钳制
                          读同一份表,即刻生效、无需重启。2026-11-03 用户定案。
                          ⚠️ 2026-11-09 用户定案:**不再挂说明悬浮框** —— 那段长文案
                          (「这个真实模型支持哪些思考档位…」)已移除,label 只留控件本身。 */}
                      <label className="depChipEdit">
                        <span className="chipLabel">思考强度</span>
                        <select
                          className="chipSelect"
                          value={effortSelectValue(d)}
                          disabled={effortBusy === d.deployment_id}
                          onChange={(e) => void saveReasoning(d, e.currentTarget.value)}
                        >
                          {/* 当前值:库里原文。用 `hidden` ⇒ 闭合时显示它的文案
                              (= 库里原文),展开时它不进列表 —— 下拉里只剩两个
                              动作项。DB 为 NULL 时无需隐藏项:此时「默认」那一项
                              本身就是当前值(文案也是「默认」)。 */}
                          {effortRawText(d) ? (
                            <option value={effortSelectValue(d)} hidden>
                              {effortDisplayText(d)}
                            </option>
                          ) : null}
                          {EFFORT_ACTIONS.map((p) => (
                            <option key={p.id} value={p.id === "default" ? EFFORT_DEFAULT_VALUE : EFFORT_UPSTREAM_VALUE}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {hasTtft(d) ? (
                        <span className="pill metric" title={latencyTitle(d)}>
                          TTFT {fmtLatency(d)}
                        </span>
                      ) : null}
                      {hasTps(d) ? (
                        <span className="pill metric" title={latencyTitle(d)}>
                          TPS {fmtTps(d)}
                        </span>
                      ) : null}
                      {/* 缓存命中率:与 TTFT/TPS **同一天**的口径(modelDayStats 选中的那一天),
                          三者永远来自同一批行,不会出现「TTFT 是 11-13、缓存是 11-12」。 */}
                      {hasCache(d) ? (
                        <span className="pill metric" title={latencyTitle(d)}>
                          缓存 {fmtPct(d.cache_hit_rate)}
                        </span>
                      ) : null}

                      {/* 每凭据并发上限:输入即存(失焦/回车提交),范围 1~1048576 */}
                      <label
                        className="depChipEdit"
                        title={`每凭据并发上限(同一真实模型 N 个凭据 = N × 该值)。改完回车/失焦即存,当前 ${d.concurrency ?? 1}`}
                      >
                        <span className="chipLabel">并发</span>
                        <input
                          className="chipNum"
                          type="number"
                          min={1}
                          max={1048576}
                          step={1}
                          defaultValue={d.concurrency ?? 1}
                          key={`${d.deployment_id}:${d.concurrency ?? 1}`}
                          disabled={directBusy === d.deployment_id}
                          onChange={(e) => void saveConcurrency(d, e.currentTarget.value)}
                        />
                      </label>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default DeploymentsPage;
