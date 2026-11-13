/**
 * 装配层模块级常量与设置表 —— 从 assembly.ts 拆出。
 *
 * 内容:引擎级协议/策略常量(KNOWN_PROTOCOLS / STRATEGY_LABELS / KIND_BY_PROTOCOL),请求日志档位表(REQUEST_LOG_CONTENT_MODES),客户端路径约定(LDRIVE / CLIENT_CANDIDATES / CLIENT_CHANNELS),设置页字段表(SETTING_FIELDS + SettingFieldSpec)。
 *
 * 谁在用:assembly.ts(读服务/设置页)与 index.ts(DEFAULT_GATEWAY_PORT)。
 * 契约:只 import;zero-dependency(仅 process.env 全局)。
 */

export const GATEWAY_HOST = "127.0.0.1";
export const DEFAULT_GATEWAY_PORT = 4000;

export const KNOWN_PROTOCOLS = ["openai", "workbuddy", "trae", "sensenova", "qoder"] as const;

/**
 * 请求日志记录档位 —— 逐字对齐 Nexus `api_pages.py` L5284-5289。
 *
 * ⚠️ label 是**中文说明**,不是机器值:下拉框里摆 `off` / `structure` 等于把
 * 这一层信息丢掉(用户能看到的只有四个英文单词)。
 */
export const REQUEST_LOG_CONTENT_MODES: Array<{
  value: "off" | "structure" | "full" | "edges";
  label: string;
}> = [
  { value: "off", label: "不记录日志" },
  { value: "structure", label: "记录结构" },
  { value: "full", label: "记录完整正文" },
  { value: "edges", label: "记录正文首尾" },
];
export const KIND_BY_PROTOCOL: Record<string, "channel" | "endpoint"> = {
  openai: "endpoint",
  workbuddy: "channel",
  trae: "channel",
  sensenova: "channel",
  // Qoder 是 PAT 账号池(一个 PAT 一条凭据、还要做每日签到与额度读数),
  // 归 "channel" 而不是 "endpoint"。
  qoder: "channel",
  // MiniMax 有签到/额度/内置模型目录,同样是渠道;2026-11-08 接通聊天转发后
  // 仍是渠道 → 只是多了一条 `/mavis/api/v1/llm/v1/messages` 的出站路径。
  minimax: "channel",
};

/** 有运行期额度探针的渠道(assembly-channels.ts 从这里取,第十一刀从 channels 域搬来)。 */
export const CH_QUOTA_PROVIDERS = new Set(["trae", "workbuddy", "minimax"]);
/**
 * 有模型目录采集的渠道(与 core catalog.ts `CATALOG_PROVIDERS` 一致)。
 *
 * ⚠️ 2026-11-08 补回 `minimax`:core 的 `fetch_minimax_catalog` 是**内置固定
 * 名单**(`MINIMAX_BUILTIN_MODELS` 6 行,纯本地合成、不打上游),但以前这个
 * Set 漏了 minimax → 展开 MiniMax 卡片调 `syncChannelCatalog` 时,
 * `runCatalogSegment` 直接判「该渠道没有 upstream_catalog 的能力声明」返回,
 * 内置清单永远进不了 `catalogRows`,页面的「模型目录」就一直空着。
 * 名字叫 CATALOG 不是 CATALOG_UPSTREAM:内置目录同样要走这条合并路径。
 */
export const CH_CATALOG_PROVIDERS = new Set(["trae", "workbuddy", "sensenova", "minimax", "qoder"]);

/**
 * 策略机器键 → 显示名 —— 逐字对齐 Nexus `api_pages.py:_STRATEGY_LABELS`。
 *
 * ⚠️ 是「中文 + 英文全名」而不是简短中文:这个值经 `strategy_label` 回给面板,
 * 而面板的逻辑模型页用的是自己的 `STRATEGY_LABELS`(同款全名)。两处写不一样
 * 会让同一个策略在 API 响应和页面标签里显示成两个名字。
 */
export const STRATEGY_LABELS: Record<string, string> = {
  "due-first": "最先到期 Due first",
  random: "随机 Random",
  "usage-balanced": "用量平衡 Usage balanced",
  "ordered-fallback": "按序降级链 Ordered fallback",
  "least-busy": "最少在途 Least busy",
  balanced: "平均使用 Balanced",
};

/**
 * 客户端路径页的渠道清单(设置键 client_path.<channel>)。
 */
export const CLIENT_CHANNELS: Array<{ channel: string; description: string }> = [
  { channel: "workbuddy", description: "WorkBuddy 客户端路径" },
  { channel: "trae", description: "Trae 客户端路径" },
  { channel: "sensenova", description: "SenseNova 客户端路径" },
];

/** L 盘约定根(可经 AS_ONE_CLIENT_DRIVE 覆盖)。 */
export const LDRIVE = process.env.AS_ONE_CLIENT_DRIVE || "L:";

/**
 * 客户端安装根目录(按探测顺序)。
 *
 * 2026-10-30 修正:原先只试 `%LOCALAPPDATA%\Programs` 与 L 盘,查证后补上
 * **官方默认安装位置**——
 * - Trae CN 官方安装器默认装到 `C:\Program Files\Trae\`(部分分支在
 *   `%LOCALAPPDATA%\TRAE`),见 CLI 帮助与社区教程;
 * - 因此 `%PROGRAMFILES%` / `%PROGRAMFILES(X86)%` / `%LOCALAPPDATA%` 都要试。
 *
 * `%...%` 由 `probeClientPath` 运行期展开;展开不出来的根整条跳过。
 * `source` 回流到页面的 `source` 字段(命中哪一类根)。
 */
export const CLIENT_INSTALL_ROOTS: ReadonlyArray<{ dir: string; source: string; label: string }> = [
  { dir: "%LOCALAPPDATA%\\Programs", source: "candidates", label: "%LOCALAPPDATA%\\Programs" },
  { dir: "%PROGRAMFILES%", source: "program-files", label: "C:\\Program Files" },
  { dir: "%PROGRAMFILES(X86)%", source: "program-files-x86", label: "C:\\Program Files (x86)" },
  { dir: "%LOCALAPPDATA%", source: "localappdata", label: "%LOCALAPPDATA%" },
  { dir: LDRIVE + "\\", source: "ldrive", label: LDRIVE + " 盘约定" },
];

/** 客户端 exe 候选表(相对上面的安装根);顺序即优先级。 */
export const CLIENT_CANDIDATES: Record<string, string[]> = {
  // Trae:官方默认 `C:\Program Files\Trae\Trae.exe`;国内版目录名是 `Trae CN`。
  trae: ["Trae\\Trae.exe", "Trae CN\\Trae CN.exe", "Trae.exe"],
  workbuddy: ["WorkBuddy\\WorkBuddy.exe", "WorkBuddy.exe"],
  // sensenova 无 exe 候选表。
  sensenova: [],
};

/** 设置页字段表(键 = db.setting 点号键;kind 按 Nexus 设置值形态推断)。 */
export interface SettingFieldSpec {
  key: string;
  def: string;
  kind: "str" | "int" | "float" | "bool" | "json";
  label: string;
  /** 数值型下界(Nexus spec 同名字段);页面据此给输入框 min。 */
  min?: number;
  /** 数值型上界。 */
  max?: number;
  /** 展示分组覆盖(Nexus:`real.wait_budget_s` 归 retry 段,不按键前缀落 real 段)。 */
  section?: string;
}
/**
 * 设置页字段表 —— 逐字段对齐 Nexus `api_pages.py:_SETTING_SPECS`。
 *
 * ⚠️ **这一张表就是代码里读到的设置键全集**(Nexus 同款纪律):新增设置项时,
 * 先让代码真的读它,再在这里加一行 —— 顺序反了就会出现死开关。
 *
 * ⚠️ `min` / `max` 不是装饰:Nexus `_settings_save` 会拿它们**拒绝越界值**,
 * 缺了就等于把校验关掉(用户填 0.01 小时的刷新间隔也能存进去)。
 */
export const SETTING_FIELDS: SettingFieldSpec[] = [
  {
    key: "external_refresh.interval_hours",
    def: "5",
    kind: "float",
    label: "外部数据刷新时间(小时)",
    min: 0.1,
    max: 168,
  },
  {
    key: "scheduler.rules_p1",
    def: "",
    kind: "json",
    label: "调度规则 · 免费档(priority 1)",
  },
  {
    key: "scheduler.rules_p2",
    def: "",
    kind: "json",
    label: "调度规则 · 有到期时间的档(priority 2)",
  },
  {
    key: "scheduler.rules_p3",
    def: "",
    kind: "json",
    label: "调度规则 · 普通消耗档(priority 3)",
  },
  {
    key: "scheduler.rules_p4",
    def: "",
    kind: "json",
    label: "调度规则 · 高峰低优先(priority 4)",
  },
  {
    key: "scheduler.rules_p0",
    def: "",
    kind: "json",
    label: "调度规则 · 禁用档(priority 0)",
  },
  {
    key: "scheduler.cooldown_overrides",
    def: "",
    kind: "json",
    label: "供应商级冷却覆盖(分钟)",
  },
  {
    key: "scheduler.pin_seconds",
    def: "900",
    kind: "float",
    label: "会话粘性时长(秒)",
    min: 0,
    max: 86400,
  },
  {
    key: "retry.base_backoff_s",
    def: "1",
    kind: "float",
    label: "初始退避(秒)",
    min: 0.05,
    max: 60,
  },
  {
    key: "retry.max_backoff_s",
    def: "15",
    kind: "float",
    label: "最大退避(秒)",
    min: 0.05,
    max: 300,
  },
  {
    key: "retry.jitter_ratio",
    def: "0.2",
    kind: "float",
    label: "抖动比例",
    min: 0,
    max: 1,
  },
  {
    key: "retry.codes",
    def: "timeout,connection,429,500,502,503,504",
    kind: "str",
    label: "可重试错误码",
  },
  {
    key: "retry.logical_max",
    def: "1",
    kind: "int",
    label: "最大重试次数(作为逻辑模型成员)",
    min: 1,
    max: 20,
  },
  {
    key: "retry.real_max",
    def: "10",
    kind: "int",
    label: "最大重试次数",
    min: 0,
  },
  {
    key: "retry.logical_cooldown",
    def: "15",
    kind: "int",
    label: "逻辑模型成员冷却(分钟)",
    min: 1,
    max: 1440,
  },
  // ⭐ 2026-10-18 重进设置页(与 Nexus 同批):键名前缀是 `real` 但**归在 retry 段
  // 渲染** —— 它是「重试之前单次上游调用愿意等多久」,与 retry.* 同一决策语境。
  // 段名只是展示分组,不影响键本身,也不是死开关。
  {
    key: "real.wait_budget_s",
    def: "60",
    kind: "float",
    label: "请求超时时间(秒)",
    min: 0,
    max: 600,
    section: "retry",
  },
  // ⚠️ 2026-11-09 用户定案:「WorkBuddy 账号最小请求间隔」**不再是设置项** ——
  // 写死在 `@as-one/core/router/account-throttle` 的 `ACCOUNT_MIN_INTERVAL_MS`
  // (4 秒,抖动 25%)。它是账号安全下限,不是使用偏好:做成设置项意味着能被
  // 调成 0(关掉节流),而那正是导致 11140 封号、凭据被物理删除的行为。
  {
    key: "ui.recent_limit",
    def: "50",
    kind: "int",
    label: "实时日志最大显示条数",
    min: 1,
    max: 500,
  },
];
