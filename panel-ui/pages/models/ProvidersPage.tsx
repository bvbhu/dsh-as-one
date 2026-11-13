/**
 * 「其他供应商(兼容供应商)」子页 —— 严格 1:1 移植 Nexus panel/web/src/Providers.vue
 * (1261 行;2026-10-12 按 dsh 供应商卡片重排的那一版)。
 *
 * 结构对照(Nexus 模板 → 本页;DOM/class/文案逐字对齐,样式全在 styles.css 尾部
 * 的 `.pv-*` 段,颜色/尺寸/间距与 Providers.vue 的 `<style scoped>` 逐字一致):
 *   section.section                              → section.pv-section
 *   div.err(role=alert) / p.savedNotice(role=status) → 同(错误 / 保存成功通知)
 *   ul.rows > li.rowCard                         → 每供应商一张行卡
 *     div.rowHead                                → span.rowName(id)+ span.credentialDot(绿/红点)
 *                                                 + span.rowActions(编辑·收起 / 删除)
 *     展开后 div.panel(供应商字段)                 → API 密钥(password,不回显)/ API 地址 /
 *                                                 API 协议(select:仅 openai 一项)
 *     div.catalogSection                         → 模型目录(span.catalogTitle + div.panel)
 *       div.modelListHead                        → 元信息「已自定义模型目录 / 正在使用提供商默认模型」
 *                                                 + linkButton「获取可用模型」+ iconButton 折叠 ▸▾
 *       div.modelList > div.modelEntry           → 模型 ID / 显示名称 / 选项 ▸▾ / 🗑
 *         div.modelAdvanced                      → 上下文窗口 / 最大输出 token 数 / 输入类型(文本·图片)
 *       button.addModelButton                    → 「＋ 添加模型」
 *     div.rowActions.cardFooter                  → 取消 / 保存(新建卡是「创建提供商」)
 *   li.rowCard 新建卡                             → rowName「添加模型提供商」+ 红点 + 自定义模型 API
 *                                                 + 模型目录 + 保存栏
 *   button.addButton「＋ 添加模型提供商」          → creating 时隐藏
 *   div.mask > div.dialog                        → 「选择要添加的模型」可搜索勾选弹窗
 *
 * ⚠️ 契约降级说明(panel-types.ts / RendererApi 冻结,只有这些方法):
 * 1. **保存是两步**:Nexus 是 `upsert(带 keys/models)` + `exposure(pid, 批量)`。
 *    As One 的 `upsertModelProvider(id, baseUrl, protocol)` **没有 keys / models 参数**
 *    → ① 调 upsertModelProvider(id, base_url, protocol)(不带密钥:密钥由凭据层管理,
 *      API 密钥输入框照画、提交时忽略,卡片内有一行 `.pv-hint` 说明「密钥由凭据层管理」);
 *    ② 契约没有批量 exposure → 对 models 清单里的每一行**逐模型**调
 *      `setModelExposure(provider, 裸模型名, true)`(主进程按 `${provider}/${model}` 存
 *      内存覆盖,与 getModelProviders 的 `exposed` 判定同一口径 —— 所以这里传**裸名**,
 *      Nexus 的 `scopedModelId` 补前缀在 As One 不需要:形参里已经有 provider)。
 * 2. **「目录即清单」删不掉**:Nexus 删掉的行会真从 `real_model` 删;As One 契约没有
 *    deleteModel → 被移除的行仍留在库里、重载后会回到页面。保存后把这些模型名写进
 *    notice 并说明「请通过编辑配置文件管理」(元素结构不变,行为诚实降级)。
 * 3. `deployed_models` 契约是**计数**(Nexus 是 id 数组)→ `draftOf` 只按 `p.models` 建草稿
 *    (As One 的 models 就是该 provider 的 real_model 全量,与 Nexus 的
 *    `models ∪ deployed_models` 语义等价)。
 * 4. **notice 文案**:Nexus 用 exposure 的 message 覆盖 notice;As One 用 upsert 的 message
 *    (+ 被移除行的说明)。setModelExposure 逐条返回的「已记录(内存覆盖…)」不逐条刷屏。
 * 5. **拉取流程**:fetchModels(带本次表单的地址/协议)→ 结果只进选择器,
 *    勾选「添加所选」才并入草稿(只补空草稿,不覆盖用户已填的值)。契约 fetchModels 的
 *    `models[].id` 是 `provider/模型` 复合 id(主进程 catalogModel 拼的)→ 选择器与目录
 *    一律按**裸模型名**索引(bareModelId 剥前缀)。
 * 6. 校验文案 / 红点判定 / 占位符 / 全角标点与 Nexus 逐字一致。
 *    `isOverridden` 也逐字照搬(契约里 name 恒非空、input 恒 ≥1 种)→ 目录非空时
 *    「已自定义模型目录」恒显示,与 Nexus 现网行为一致。
 */
import React from "react";
import { rendererApi } from "../../api";
import type { CatalogModel, ModelProvider } from "../../api";

/**
 * 模型目录一行(Nexus `ProviderModelEntry` 同形;`id` 一律是**裸模型名**)。
 *
 * ⚠️ 契约里没有这个类型(panel-types.ts 冻结):As One 的目录行由
 * `ModelProvider.models: CatalogModel[]` 派生 —— name/context_window/max_output 是目录
 * 字段,`input` 由 `CatalogModel.vision` 折成 `["text"] | ["text","image"]`
 * (Nexus 列表端点也是同样地从 supports_vision 折)。
 */
interface ModelRow {
  id: string;
  name?: string;
  context_window?: number | null;
  max_output?: number | null;
  input?: string[];
}

/** 编辑卡表单(Nexus `form` ref 的 TS 化)。 */
interface ProviderForm {
  id: string;
  base_url: string;
  protocol: string;
  /**
   * 单把 API Key 输入。
   *
   * 🔒 **打开卡片时这里永远是空的** —— 契约不回显明文,空串 = 沿用库里那把。
   * ⚠️ As One 的 upsertModelProvider 没有 keys 参数 → 这个输入框**照画但提交时忽略**
   * (见文件头降级 1);卡片内 `.pv-hint` 向用户说明密钥由凭据层管理。
   */
  apiKey: string;
  models: ModelRow[];
}

/** 表单/逐行校验失败(消息给用户看,不是后端故障)。 */
class FormError extends Error {}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 目录里的模型 id 是 `${provider}/${model}` 复合 id,展示/提交用裸模型名。 */
function bareModelId(providerId: string, modelId: string): string {
  const prefix = `${providerId}/`;
  return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}

/** CatalogModel(复合 id / vision 布尔)→ 目录行(裸模型名 / input 数组)。 */
function rowOf(pid: string, m: CatalogModel): ModelRow {
  return {
    id: bareModelId(pid, m.id),
    name: m.name,
    context_window: m.context_window,
    max_output: m.max_output,
    input: m.vision ? ["text", "image"] : ["text"],
  };
}

/** 容量输入的可接受写法:十进制数 + 可选 K/M 后缀(1M = 1000K,对齐 dsh)。 */
const CAPACITY_RE = /^(\d+(?:\.\d+)?)([km])?$/i;

/** 解析容量输入;空串 = 不声明(undefined),非法 = NaN(由校验拦截)。 */
function parseCapacity(text: string): number | undefined {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return undefined;
  const match = CAPACITY_RE.exec(trimmed);
  if (!match) return Number.NaN;
  const suffix = match[2]?.toLowerCase();
  const scale = suffix === "m" ? 1e6 : suffix === "k" ? 1e3 : 1;
  const scaled = Number(match[1]) * scale;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled;
}

function numOrNull(v: string): number | null {
  const parsed = parseCapacity(v);
  if (parsed === undefined || Number.isNaN(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function blankForm(): ProviderForm {
  return { id: "", base_url: "", protocol: "openai", apiKey: "", models: [] };
}

export default function ProvidersPage(): React.JSX.Element {
  const [providers, setProviders] = React.useState<ModelProvider[]>([]);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  /* ---------------- 编辑卡状态 ---------------- */

  /** 正在编辑的供应商 id("" = 未展开;新建时另用 creating)。 */
  const [openId, setOpenId] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  /** 已被用户自定义过的模型行下标(决定「已自定义模型目录」是否出现)。 */
  const [overridden, setOverridden] = React.useState<Record<number, boolean>>({});
  /** 上一次保存**没通过校验**的供应商 id(卡片头那个红点就是它)。 */
  const [invalidIds, setInvalidIds] = React.useState<Record<string, boolean>>({});
  /** 新建卡片保存被拦下(它还没进列表,进不了 invalidIds)。 */
  const [createInvalid, setCreateInvalid] = React.useState(false);

  const [form, setForm] = React.useState<ProviderForm>(() => blankForm());
  /** 展开「模型选项」的行下标。 */
  const [rowOpen, setRowOpen] = React.useState<Record<number, boolean>>({});
  /** 模型目录面板是否展开(标题行右侧那个箭头)。 */
  const [catalogOpen, setCatalogOpen] = React.useState(true);
  /** 容量草稿(下标 → 输入框文本;空串 = 不声明)。 */
  const [ctxDraft, setCtxDraft] = React.useState<Record<number, string>>({});
  const [outDraft, setOutDraft] = React.useState<Record<number, string>>({});
  /** 输入类型草稿(下标 → 勾选态;至少一种)。 */
  const [inputChecked, setInputChecked] = React.useState<Record<number, { text: boolean; image: boolean }>>({});

  /* ---------------- 获取可用模型(可搜索选择器) ---------------- */

  const [fetching, setFetching] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [candidates, setCandidates] = React.useState<string[]>([]);
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set());
  const [pickQuery, setPickQuery] = React.useState("");
  /** 最近一次「获取可用模型」返回的合并目录(含上游回填的上下文/最大输出/模态)。 */
  const [fetchedCatalog, setFetchedCatalog] = React.useState<CatalogModel[]>([]);
  /** 打开卡片那一刻目录里已有的裸模型名(保存后用来点名「被移除的行」——降级 2)。 */

  async function load(): Promise<void> {
    try {
      const r = await rendererApi.getModelProviders();
      setProviders(r);
      setError("");
    } catch (e) {
      setError(msg(e));
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  /* ---------------- 编辑卡生命周期 ---------------- */

  /**
   * 目录草稿 = 该 provider 的 real_model 全量(按**裸模型名**去重,保序)。
   *
   * ⚠️ Nexus 这里是 `models ∪ deployed_models`;As One 的 `deployed_models` 是计数,
   * `models` 本身已是 real_model 全量(见文件头降级 3)→ 只按 models 建。
   */
  function draftOf(p: ModelProvider): ModelRow[] {
    const byId = new Map<string, ModelRow>();
    for (const m of p.models) {
      const row = rowOf(p.id, m);
      byId.set(row.id, row);
    }
    return [...byId.values()];
  }

  /** 某行是否被用户自定义过(有 name / 容量 / 输入类型声明)—— 逐字照搬 Nexus。 */
  function isOverridden(m: ModelRow): boolean {
    return Boolean(
      m.name?.trim() ||
        m.context_window != null ||
        m.max_output != null ||
        (m.input && m.input.length > 0),
    );
  }

  function seedRows(rows: ModelRow[]): void {
    const open: Record<number, boolean> = {};
    const over: Record<number, boolean> = {};
    const ctx: Record<number, string> = {};
    const out: Record<number, string> = {};
    const inp: Record<number, { text: boolean; image: boolean }> = {};
    rows.forEach((m, i) => {
      open[i] = false;
      over[i] = isOverridden(m);
      ctx[i] = m.context_window != null ? String(m.context_window) : "";
      out[i] = m.max_output != null ? String(m.max_output) : "";
      const kinds = m.input ?? ["text"];
      inp[i] = { text: kinds.includes("text"), image: kinds.includes("image") };
    });
    setRowOpen(open);
    setOverridden(over);
    setCtxDraft(ctx);
    setOutDraft(out);
    setInputChecked(inp);
  }

  function startEdit(p: ModelProvider): void {
    if (openId === p.id && !creating) {
      closeCard();
      return;
    }
    setCreating(false);
    setOpenId(p.id);
    const models = draftOf(p);
    setForm({
      id: p.id,
      base_url: p.base_url ?? "",
      protocol: p.protocol || "openai",
      // ⚠️ **不回显明文**:输入框留空 = 沿用库里那把,只凭绿点/红点看有没有配。
      apiKey: "",
      models,
    });
    seedRows(models);
    setCatalogOpen(true);
    setError("");
    setNotice("");
  }

  function startCreate(): void {
    setCreating(true);
    setOpenId("");
    setForm(blankForm());
    seedRows([]);
    setCatalogOpen(true);
    setCreateInvalid(false);
    setError("");
    setNotice("");
  }

  function closeCard(): void {
    setOpenId("");
    setCreating(false);
  }

  /** 密钥输入框的占位符:已配置就明说「留空不改」。 */
  function keyPlaceholder(p: ModelProvider): string {
    return p.accounts_with_key > 0 ? "已配置——输入新值可替换" : "输入 API 密钥";
  }

  /* ---------------- 模型行编辑 ---------------- */

  function patchModel(i: number, patch: Partial<ModelRow>): void {
    setForm((f) => ({ ...f, models: f.models.map((m, at) => (at === i ? { ...m, ...patch } : m)) }));
  }

  function addModel(): void {
    const i = form.models.length;
    setForm((f) => ({ ...f, models: [...f.models, { id: "" }] }));
    setRowOpen((v) => ({ ...v, [i]: true }));
    setOverridden((v) => ({ ...v, [i]: false }));
    setCtxDraft((v) => ({ ...v, [i]: "" }));
    setOutDraft((v) => ({ ...v, [i]: "" }));
    setInputChecked((v) => ({ ...v, [i]: { text: true, image: false } }));
  }

  /**
   * 从目录里移除一行。**这只是草稿态** —— 真正删库发生在点「保存」那一刻。
   *
   * ⚠️ 降级:As One 契约没有逐模型删除(panel-types.ts 无 deleteModel),保存后这行
   * 仍会留在库里并随重载回到页面(见文件头降级 2);notice 里会点名。
   */
  function removeModel(i: number): void {
    setForm((f) => ({ ...f, models: f.models.filter((_, at) => at !== i) }));
    // 重排草稿:逐项下移,末尾丢弃
    const shift = <T,>(map: Record<number, T>): Record<number, T> => {
      const next: Record<number, T> = {};
      Object.entries(map).forEach(([k, v]) => {
        const at = Number(k);
        if (at < i) next[at] = v;
        else if (at > i) next[at - 1] = v;
      });
      return next;
    };
    setRowOpen((v) => shift(v));
    setOverridden((v) => shift(v));
    setCtxDraft((v) => shift(v));
    setOutDraft((v) => shift(v));
    setInputChecked((v) => shift(v));
  }

  function toggleRow(i: number): void {
    setRowOpen((v) => ({ ...v, [i]: !v[i] }));
  }

  /** 输入类型至少保留一种(全不选就等于「这个模型不能收任何输入」)。 */
  function toggleInput(i: number, kind: "text" | "image", on: boolean): void {
    setInputChecked((v) => {
      const cur = v[i] ?? { text: true, image: false };
      const next = { ...cur, [kind]: on };
      if (!next.text && !next.image) {
        if (kind === "image") next.image = true;
        else next.text = true;
      }
      return { ...v, [i]: next };
    });
  }

  const anyOverridden = Object.values(overridden).some(Boolean);

  /* ---------------- 校验(只在保存时跑) ---------------- */

  /**
   * 逐行校验。
   *
   * ⚠️ **空模型行不算错** —— 「＋ 添加模型」之后先不填是允许的:那行会被
   * buildModels 直接丢掉,不进库。只有**写错了**才拦:重复 id、非法容量。
   */
  function validateRows(): void {
    const seen = new Set<string>();
    form.models.forEach((m, i) => {
      const id = (m.id ?? "").trim();
      if (!id) return;
      if (seen.has(id)) throw new FormError(`模型 ID 重复:${id}`);
      seen.add(id);
      for (const [map, label] of [
        [ctxDraft, "上下文窗口"],
        [outDraft, "最大输出 token 数"],
      ] as const) {
        if (Number.isNaN(parseCapacity(map[i] ?? ""))) {
          throw new FormError(`${label}必须是正数,例如 131072、256K 或 1M。`);
        }
      }
    });
  }

  /**
   * 保存前的硬校验(只拦「写错了」,不拦「还没写」)。
   *
   * 「API 地址 / API 密钥还没填」属于**允许暂缺** —— 照常保存,卡片头显示红点,
   * 用户什么时候补齐什么时候变绿(见 dotState)。
   */
  function validateForm(): void {
    if (creating) {
      const id = form.id.trim();
      if (!id) throw new FormError("Provider ID 必填。");
      if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
        throw new FormError(
          "Provider ID 需以小写字母开头,只能含小写字母、数字、下划线与连字符。",
        );
      }
      if (providers.some((p) => p.id === id)) {
        throw new FormError("已有提供商使用了这个 ID。");
      }
    }
    const url = form.base_url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      throw new FormError("API 地址必须是 http(s) 地址。");
    }
    validateRows();
  }

  /** 草稿 → 提交用的模型目录条目(容量/输入类型回填)。 */
  function buildModels(): ModelRow[] {
    return form.models
      .map((m, i): ModelRow => {
        const kinds = inputChecked[i] ?? { text: true, image: false };
        const ctx = numOrNull(ctxDraft[i] ?? "");
        const out = numOrNull(outDraft[i] ?? "");
        return {
          id: m.id.trim(),
          ...(m.name?.trim() ? { name: m.name.trim() } : {}),
          ...(ctx != null ? { context_window: ctx } : {}),
          ...(out != null ? { max_output: out } : {}),
          input: kinds.image ? ["text", "image"] : ["text"],
        };
      })
      .filter((m) => m.id);
  }

  /* ---------------- 保存 ---------------- */

  async function saveCard(): Promise<void> {
    const pid = form.id.trim();
    try {
      validateForm();
    } catch (e) {
      // 拦下了 = 红点(校验失败是「这张卡还没齐活」的一部分)。
      if (creating) setCreateInvalid(true);
      else if (pid) setInvalidIds((v) => ({ ...v, [pid]: true }));
      setError(msg(e));
      return;
    }
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const models = buildModels();
      const proto = form.protocol.trim() || "openai";
      // ① 写 provider 行 + **凭据池**。`keys` 数组即整池、按位置对齐座位;
      //    这里只有页面上的那一个输入框 → 传单元素数组,`""`(用户没填)由后端
      //    按「留空座位不改」处理,不会把已有密钥清掉。以前契约没有这个参数,
      //    输入框填的值被**静默丢弃** —— 用户以为保存成功了,库里一个字节没动。
      const keyText = form.apiKey.trim();
      const r = await rendererApi.upsertModelProvider(
        pid,
        form.base_url.trim(),
        proto,
        // `env_prefix` 在 Nexus 页面上是**只读回显**,没有输入框 → 不提交(undefined
        // = 不改),后端保留原值 / 落 `ONE_<ID>` 默认。
        undefined,
        keyText === "" ? undefined : [keyText],
      );
      if (!r.ok) throw new FormError(r.message ?? "保存失败");
      // ② **目录即清单**:勾上的行全部登记进 real_model(整批,与 Nexus
      //    `modelProviders.exposure` 同款),目录里删掉的行 = 从 real_model 删掉
      //    这一行,库里不留残留(409 时后端点名还被档链引用的模型)。
      //    ⚠️ 输入框里是**裸模型名**,这里补回 provider 前缀再提交 ——
      //    裸名里带斜杠时(`openrouter/free`)后端无法分辨它属于哪个供应商。
      const exposure = models.map((m, i) => {
        const kinds = inputChecked[i] ?? { text: true, image: false };
        return {
          id: `${pid}/${m.id}`,
          ...(m.name ? { name: m.name } : {}),
          vision: kinds.image,
          context_window: numOrNull(ctxDraft[i] ?? ""),
          max_output: numOrNull(outDraft[i] ?? ""),
        };
      });
      const e2 = await rendererApi.setChannelModels(pid, exposure);
      if (!e2.ok) throw new FormError(e2.message ?? "设置模型暴露失败");
      // ③ 回执取 exposure 的 message(Nexus:`notice = e2.message ?? notice`)。
      let text = e2.message ?? r.message ?? "已保存";
      setNotice(text);
      // 这次提交通过了 → 撤掉红点(还缺什么,重载后由 dotState 按库里状态再判)。
      if (creating) setCreateInvalid(false);
      if (pid) {
        setInvalidIds((v) => {
          const next = { ...v };
          delete next[pid];
          return next;
        });
      }
      closeCard();
      await load();
    } catch (e) {
      // 后端拒了(比如协议不认)同样算「这张卡没过」,红点留着。
      if (creating) setCreateInvalid(true);
      else if (pid) setInvalidIds((v) => ({ ...v, [pid]: true }));
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeProvider(p: ModelProvider): Promise<void> {
    if (!window.confirm(`确定删除供应商 ${p.id}?(其登记的真实模型与凭据会一并移除)`)) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const r = await rendererApi.removeModelProvider(p.id);
      if (!r.ok) {
        setError(r.message ?? "删除失败");
        return;
      }
      setNotice(r.message ?? "已删除");
      if (openId === p.id) closeCard();
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- 获取可用模型(可搜索选择器) ---------------- */

  /**
   * 上游目录 → 按**裸模型名**索引。
   *
   * ⚠️ 选择器里的候选 id 来自 fetchModels(契约返回复合 id),而 models[] 里存的是裸名
   * —— 两边按原样匹配会永远落空。统一按裸名索引。
   */
  function fetchedIndex(): Map<string, ModelRow> {
    const pid = form.id.trim();
    return new Map<string, ModelRow>(
      fetchedCatalog.map((m): [string, ModelRow] => {
        const row = rowOf(pid, m);
        return [row.id, row];
      }),
    );
  }

  function visibleCandidates(): string[] {
    const q = pickQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((id) => id.toLowerCase().includes(q));
  }

  function allVisiblePicked(): boolean {
    const list = visibleCandidates();
    return list.length > 0 && list.every((id) => picked.has(id));
  }

  /** 真连上游 GET /models,结果**只**进选择器(写回由「添加所选」决定)。 */
  async function fetchModels(): Promise<void> {
    if (!form.base_url.trim()) {
      setError("请先填写 API 地址,再获取。");
      return;
    }
    setFetching(true);
    setError("");
    try {
      // ⚠️ **不预先落库**(2026-10-24 用户反馈:「点击获取可用模型会导致提供商被创建」)。
      // 未保存的供应商也能取目录:把本次表单的地址/协议随请求一起交给主进程,
      // 探测是只读动作 —— provider 行只在「保存」时才建。
      const pid = form.id.trim();
      const r = await rendererApi.fetchModels(pid, false, {
        baseUrl: form.base_url.trim(),
        protocol: form.protocol.trim() || "openai",
      });
      if (!r.ok) {
        // 失败不报错中断 —— 返回可读 message,目录可手工维护
        setError(r.message ?? "该提供商没有列出任何模型,请手动添加。");
        await load();
        return;
      }
      const found = (r.models ?? []).map((m) => bareModelId(pid, m.id)).filter(Boolean);
      if (!found.length) {
        setError(r.message ?? "该提供商没有列出任何模型,请手动添加。");
        await load();
        return;
      }
      // 上游回填的上下文/最大输出/模态要落到**表单草稿**上,否则展开「模型选项」
      // 看到的还是打开卡片时的空值,一保存又把空值写回去。
      // 只补空草稿,不覆盖用户已填的值。
      // ⚠️ 索引必须从**本次响应**现建:React 的 state 更新是异步的,fetchedCatalog
      // 这个闭包变量此刻还是上一次渲染的值(Vue 的 ref 赋值是同步的,Nexus 直接
      // 用 ref 索引不会踩到)。
      const fetched = r.models ?? [];
      setFetchedCatalog(fetched);
      const byId = new Map<string, ModelRow>(
        fetched.map((m): [string, ModelRow] => {
          const row = rowOf(pid, m);
          return [row.id, row];
        }),
      );
      const nextCtx = { ...ctxDraft };
      const nextOut = { ...outDraft };
      const nextInp = { ...inputChecked };
      form.models.forEach((m, i) => {
        const entry = byId.get(m.id.trim());
        if (!entry) return;
        if (!(nextCtx[i] ?? "").trim() && entry.context_window != null) {
          nextCtx[i] = String(entry.context_window);
        }
        if (!(nextOut[i] ?? "").trim() && entry.max_output != null) {
          nextOut[i] = String(entry.max_output);
        }
        if (entry.input?.includes("image")) {
          const cur = nextInp[i] ?? { text: true, image: false };
          if (!cur.image) nextInp[i] = { ...cur, image: true };
        }
      });
      setCtxDraft(nextCtx);
      setOutDraft(nextOut);
      setInputChecked(nextInp);
      const known = new Set(form.models.map((m) => m.id.trim()).filter(Boolean));
      setCandidates(found);
      setPickQuery("");
      // 2026-10-23 用户反馈修复:默认**不**勾选,用户明确勾选要添加的才进 picked。
      // 原来的「目录里还没有的默认全勾」让弹窗一打开全部勾选——用户以为点一下是
      // 「选中它」,但 togglePick 是 toggle,点的那一下反而**取消**它、其余全部保持
      // 勾选,「添加所选」几乎把全部模型并入草稿,保存时全部登记(症状:「列表中
      // 只有一个模型也会保存 /v1/models 下的所有模型」)。弹窗已有「全选」按钮,
      // 需要全部添加的用户一键全选即可,默认不该替用户做决定。
      setPicked(new Set());
      setPickerOpen(true);
    } catch (e) {
      setError(msg(e));
    } finally {
      setFetching(false);
    }
  }

  function togglePick(id: string): void {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  }

  /** 全选只作用于可见项;取消全选清空全部(避免误采用被搜索隐藏的结果)。 */
  function toggleAllVisible(): void {
    if (allVisiblePicked()) {
      setPicked(new Set());
      return;
    }
    const next = new Set(picked);
    for (const id of visibleCandidates()) next.add(id);
    setPicked(next);
  }

  function closePicker(): void {
    setPickerOpen(false);
    setCandidates([]);
    setPicked(new Set());
    setPickQuery("");
  }

  /** 「添加所选」:把勾选的候选并入草稿;声明(上下文/输出/模态)取自获取结果。 */
  function adoptPicked(): void {
    const known = new Set(form.models.map((m) => m.id.trim()));
    const byId = fetchedIndex();
    const rows = [...form.models];
    const nextOpen = { ...rowOpen };
    const nextOver = { ...overridden };
    const nextCtx = { ...ctxDraft };
    const nextOut = { ...outDraft };
    const nextInp = { ...inputChecked };
    for (const id of picked) {
      if (known.has(id)) continue;
      known.add(id);
      rows.push({ id });
      const i = rows.length - 1;
      const entry = byId.get(id);
      nextOpen[i] = false;
      nextOver[i] = entry ? isOverridden(entry) : false;
      nextCtx[i] = entry?.context_window != null ? String(entry.context_window) : "";
      nextOut[i] = entry?.max_output != null ? String(entry.max_output) : "";
      const kinds = entry?.input?.length
        ? { text: entry.input.includes("text"), image: entry.input.includes("image") }
        : { text: true, image: false };
      if (!kinds.text && !kinds.image) kinds.text = true;
      nextInp[i] = kinds;
    }
    setForm((f) => ({ ...f, models: rows }));
    setRowOpen(nextOpen);
    setOverridden(nextOver);
    setCtxDraft(nextCtx);
    setOutDraft(nextOut);
    setInputChecked(nextInp);
    setCatalogOpen(true);
    closePicker();
  }

  /* ---------------- 展示辅助 ---------------- */

  /**
   * 卡片头的状态点:**绿 = 齐活,红 = 还没齐活 / 上次保存被拦下**。
   *
   * 判定只有两条(没有「全部检测」按钮,校验只在保存时发生):
   * - 1) 上一次保存没过校验 → 红(用户可能还没改,别急着显示绿);
   * - 2) 库里还缺东西(没有 API 地址,或一条带密钥的凭据都没有)→ 红。
   *
   * ⚠️ 「缺字段」**不拦保存** —— 红点是提醒,不是闸门;真正的闸门只有格式类错误。
   */
  function dotState(p: ModelProvider): "ok" | "missing" {
    if (invalidIds[p.id]) return "missing";
    return (p.base_url?.trim() ?? "") && p.accounts_with_key > 0 ? "ok" : "missing";
  }

  /** 状态点的悬浮说明(红点要说清「缺什么」,否则用户只能猜)。 */
  function dotTitle(p: ModelProvider): string {
    if (invalidIds[p.id]) return "上次保存没通过校验,请展开卡片检查";
    const lacks: string[] = [];
    if (!(p.base_url?.trim() ?? "")) lacks.push("API 地址");
    if (p.accounts_with_key === 0) lacks.push("API 密钥");
    return lacks.length ? `还缺:${lacks.join(" / ")}(可稍后补)` : "配置齐活";
  }

  /* ---------------- 渲染 ---------------- */

  function catalogSection(): React.JSX.Element {
    const hasBase = form.base_url.trim().length > 0;
    return (
      <div className="pv-catalogSection">
        <span className="pv-catalogTitle">模型目录</span>
        <div className="pv-panel">
          <div className="pv-modelListHead">
            <span className="pv-modelCatalogMeta">
              {anyOverridden ? "已自定义模型目录" : "正在使用提供商默认模型"}
            </span>
            <span className="pv-headActions">
              <button
                type="button"
                className="pv-linkButton"
                disabled={busy || fetching || !hasBase}
                title={
                  hasBase
                    ? "连上游 GET /models,并把上游给的上下文窗口 / 最大输出 / 输入类型带回目录(只补没填过的)"
                    : "请先填写 API 地址,再获取"
                }
                onClick={() => void fetchModels()}
              >
                {fetching ? "正在询问提供商…" : "获取可用模型"}
              </button>
              <button
                type="button"
                className="pv-iconButton"
                aria-expanded={catalogOpen}
                title="展开 / 收起模型目录"
                onClick={() => setCatalogOpen((v) => !v)}
              >
                {catalogOpen ? "▾" : "▸"}
              </button>
            </span>
          </div>

          {catalogOpen ? (
            <>
              {form.models.length === 0 ? (
                <p className="pv-modelEmpty">
                  还没有登记模型;点「获取可用模型」或「＋ 添加模型」补上。
                </p>
              ) : (
                <div className="pv-modelList">
                  {form.models.map((_m, i) => {
                    const kinds = inputChecked[i] ?? { text: true, image: false };
                    return (
                      <div key={i} className="pv-modelEntry">
                        <div className="pv-modelRow">
                          <input
                            className="pv-input"
                            type="text"
                            placeholder="模型 ID"
                            aria-label={`模型 ID ${i + 1}`}
                            value={form.models[i].id ?? ""}
                            onChange={(ev) => patchModel(i, { id: ev.target.value })}
                          />
                          <input
                            className="pv-input"
                            type="text"
                            placeholder="显示名称"
                            aria-label={`显示名称 ${i + 1}`}
                            value={form.models[i].name ?? ""}
                            onChange={(ev) => patchModel(i, { name: ev.target.value })}
                          />
                          <button
                            type="button"
                            className="pv-iconButton"
                            aria-expanded={!!rowOpen[i]}
                            aria-label={`模型选项 ${i + 1}`}
                            title="模型选项"
                            onClick={() => toggleRow(i)}
                          >
                            {rowOpen[i] ? "▾" : "▸"}
                          </button>
                          <button
                            type="button"
                            className="pv-iconButton pv-iconButtonDanger"
                            aria-label={`删除模型 ${i + 1}`}
                            title="从目录移除并删除(保存后从模型表删掉这一行)"
                            disabled={busy}
                            onClick={() => removeModel(i)}
                          >
                            🗑
                          </button>
                        </div>

                        {rowOpen[i] ? (
                          <div className="pv-modelAdvanced">
                            <label className="pv-modelField">
                              <span className="pv-modelFieldLabel">上下文窗口</span>
                              <input
                                className="pv-input"
                                type="text"
                                inputMode="numeric"
                                placeholder="未填则用 256K(262144)兜底"
                                value={ctxDraft[i] ?? ""}
                                onChange={(ev) =>
                                  setCtxDraft((v) => ({ ...v, [i]: ev.target.value }))
                                }
                              />
                            </label>
                            <label className="pv-modelField">
                              <span className="pv-modelFieldLabel">最大输出 token 数</span>
                              <input
                                className="pv-input"
                                type="text"
                                inputMode="numeric"
                                placeholder="使用提供商默认值"
                                value={outDraft[i] ?? ""}
                                onChange={(ev) =>
                                  setOutDraft((v) => ({ ...v, [i]: ev.target.value }))
                                }
                              />
                            </label>
                            <fieldset className="pv-modelInputTypes">
                              <legend className="pv-modelFieldLabel">输入类型</legend>
                              <div className="pv-modelInputChoices">
                                <label className="pv-choice">
                                  <input
                                    type="checkbox"
                                    checked={kinds.text}
                                    onChange={(ev) => toggleInput(i, "text", ev.target.checked)}
                                  />
                                  文本
                                </label>
                                <label className="pv-choice">
                                  <input
                                    type="checkbox"
                                    checked={kinds.image}
                                    onChange={(ev) => toggleInput(i, "image", ev.target.checked)}
                                  />
                                  图片
                                </label>
                              </div>
                            </fieldset>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <button type="button" className="pv-addModelButton" disabled={busy} onClick={addModel}>
                ＋ 添加模型
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  /**
   * 供应商字段面板(编辑卡 / 新建卡共用,DOM 与 Nexus 两块 panel 一致)。
   * `withId=false` 传被编辑的 provider(标题用它的 id、密钥框占位符按它的凭据状态)。
   */
  function providerFields(withId: boolean, p?: ModelProvider): React.JSX.Element {
    const uid = withId ? "new-provider" : p?.id ?? form.id;
    return (
      <div className="pv-panel">
        <div className="pv-panelTitle">{withId ? "自定义模型 API" : p?.id}</div>

        {withId ? (
          <>
            <label className="pv-fieldLabel" htmlFor="new-provider-id">
              Provider ID
            </label>
            <input
              id="new-provider-id"
              className="pv-input"
              type="text"
              placeholder="如 acme_gateway"
              value={form.id}
              onChange={(ev) => setForm((f) => ({ ...f, id: ev.target.value }))}
            />
          </>
        ) : null}

        <label className="pv-fieldLabel" htmlFor={`key-${uid}`}>
          API 密钥
        </label>
        <input
          id={`key-${uid}`}
          className="pv-input"
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          placeholder={withId || !p ? "输入 API 密钥" : keyPlaceholder(p)}
          value={form.apiKey}
          onChange={(ev) => setForm((f) => ({ ...f, apiKey: ev.target.value }))}
        />

        <label className="pv-fieldLabel" htmlFor={`url-${uid}`}>
          API 地址
        </label>
        <input
          id={`url-${uid}`}
          className="pv-input"
          type="text"
          placeholder="https://gateway.example/v1"
          value={form.base_url}
          onChange={(ev) => setForm((f) => ({ ...f, base_url: ev.target.value }))}
        />

        <label className="pv-fieldLabel" htmlFor={`proto-${uid}`}>
          API 协议
        </label>
        <select
          id={`proto-${uid}`}
          className="pv-input pv-selectInput"
          value={form.protocol}
          onChange={(ev) => setForm((f) => ({ ...f, protocol: ev.target.value }))}
        >
          <option value="openai">OpenAI Chat Completions</option>
        </select>
      </div>
    );
  }

  return (
    <>
      <section className="pv-section">
        {error ? (
          <div className="pv-err" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <p className="pv-savedNotice" role="status">
            {notice}
          </p>
        ) : null}

        <ul className="pv-rows">
          {/* ── 每个供应商一张卡片 ─────────────────────────────── */}
          {providers.map((p) => (
            <li key={p.id} className="pv-rowCard">
              <div className="pv-rowHead">
                <span className="pv-rowName">{p.id}</span>
                <span
                  className={"pv-credentialDot " + (dotState(p) === "ok" ? "pv-dotOk" : "pv-dotMissing")}
                  title={dotTitle(p)}
                />
                <span className="pv-rowActions">
                  <button type="button" className="pv-rowBtn" disabled={busy} onClick={() => startEdit(p)}>
                    {openId === p.id && !creating ? "收起" : "编辑"}
                  </button>
                  <button
                    type="button"
                    className="pv-rowBtn pv-rowBtnDanger"
                    disabled={busy}
                    onClick={() => void removeProvider(p)}
                  >
                    删除
                  </button>
                </span>
              </div>

              {openId === p.id && !creating ? (
                <>
                  {providerFields(false, p)}
                  {catalogSection()}
                  <div className="pv-rowActions pv-cardFooter">
                    <button type="button" className="pv-secondaryButton" disabled={busy} onClick={closeCard}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="pv-primaryButton"
                      disabled={busy}
                      onClick={() => void saveCard()}
                    >
                      {busy ? "保存中…" : "保存"}
                    </button>
                  </div>
                </>
              ) : null}
            </li>
          ))}

          {/* ── 新建卡片 ──────────────────────────────────────── */}
          {creating ? (
            <li className="pv-rowCard">
              <div className="pv-rowHead">
                <span className="pv-rowName">添加模型提供商</span>
                {createInvalid ? (
                  <span className="pv-credentialDot pv-dotMissing" title="刚才保存没通过校验,请检查下面的字段" />
                ) : null}
              </div>

              {providerFields(true)}
              {catalogSection()}

              <div className="pv-rowActions pv-cardFooter">
                <button type="button" className="pv-secondaryButton" disabled={busy} onClick={closeCard}>
                  取消
                </button>
                <button
                  type="button"
                  className="pv-primaryButton"
                  disabled={busy}
                  onClick={() => void saveCard()}
                >
                  {busy ? "保存中…" : "创建提供商"}
                </button>
              </div>
            </li>
          ) : null}
        </ul>

        {!creating ? (
          <button type="button" className="pv-addButton" disabled={busy} onClick={startCreate}>
            ＋ 添加模型提供商
          </button>
        ) : null}
      </section>

      {/* ── 获取可用模型:可搜索选择器 ────────────────────────── */}
      {pickerOpen ? (
        <div
          className="pv-mask"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) closePicker();
          }}
        >
          <div className="pv-dialog" role="dialog" aria-modal="true" aria-label="选择要添加的模型">
            <h3 className="pv-dialogTitle">选择要添加的模型</h3>
            <p className="pv-dialogDesc">以下是模型提供商的可用模型,勾选要添加的模型。</p>

            <div className="pv-candidateToolbar">
              <input
                className="pv-input pv-candidateSearch"
                type="search"
                placeholder="搜索模型"
                aria-label="搜索模型"
                value={pickQuery}
                onChange={(ev) => setPickQuery(ev.target.value)}
              />
              <button
                type="button"
                className="pv-linkButton"
                disabled={visibleCandidates().length === 0}
                onClick={toggleAllVisible}
              >
                {allVisiblePicked() ? "取消全选" : "全选"}
              </button>
            </div>

            {visibleCandidates().length === 0 ? (
              <p className="pv-candidateEmpty" role="status">
                没有匹配的模型。
              </p>
            ) : (
              <ul className="pv-candidateList">
                {visibleCandidates().map((c) => (
                  <li key={c} className="pv-candidate">
                    <label className="pv-candidateLabel">
                      <input type="checkbox" checked={picked.has(c)} onChange={() => togglePick(c)} />
                      <span className="pv-candidateId" title={c}>
                        {c}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            <div className="pv-dialogFooter">
              <button type="button" className="pv-secondaryButton" onClick={closePicker}>
                取消
              </button>
              <button type="button" className="pv-secondaryButton" onClick={adoptPicked}>
                添加所选
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export { ProvidersPage };
