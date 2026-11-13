/**
 * 数据库 → 注册表快照投影。
 *
 * ## 为什么有这个文件
 *
 * 阶段一 / 迁移期,provider / real_model / logical_model / scheduler.rules
 * 同时存在于 **JSON 文件**与 **SQLite 表**里,于是出现「删了 nexus-flash
 * 页面还显示」「面板新建的逻辑模型调度看不见」这类双源错位。
 *
 * 用户裁定(m28134 / m28051):**数据库是唯一真源**,JSON 退化为
 * 导入 / 导出 / 备份格式。于是注册表不再是「文件读取器」,而是
 * **数据库在内存里的索引** —— 本文件就是「表 → 索引」这一步。
 *
 * 依赖方向:db 层只 import ``node:sqlite`` / schema / 行类型
 * (见 database.ts 头部),config 层不认识 db —— 所以投影放在 db 层,
 * 由装配层把结果喂给 ``ProviderRegistry.fromSnapshot()``,避免
 * db → config → db 的环。
 *
 * ## 与文件路径的语义对齐
 *
 * 列名到字段名的映射、NULL 语义、缺省值全部镜像 ``loadProviderConfig``
 * (providers.ts),保证「同一份数据,无论来自文件还是表,快照完全一致」:
 *
 * - ``base_url`` NULL → ``baseUrl: null``(回落连接器内建端点);
 * - ``protocol`` 空 → ``openai``;
 * - ``supports_vision`` / ``hidden`` 是 INTEGER 0/1 → ``boolean``;
 * - ``concurrency`` NULL → ``null``(未覆盖,回落 provider 缺省);
 * - 账户的 ``enabled`` 不在表里(用户 m28134 明确不加列)→ 恒 ``true``,
 *   运行期启用态由装配层的 overlay 决定(重启重置,用户已接受);
 * - ``scheduler.rules`` 走 ``validRules`` 清洗(与 engine 同一套口径)。
 */

import type { NexusDatabase } from "./database.js";
import type { LogicalModelRow, RealModelRow } from "./types.js";
import type { RegistrySnapshot } from "../config/providers.js";
import type {
  AccountConfig,
  ChainMember,
  LogicalModelDefinition,
  ProviderDefinition,
  ProviderProtocol,
  RealModelDefinition,
  SchedulerRule,
} from "../config/types.js";
import { PROVIDER_PROTOCOLS } from "../config/types.js";
import { RULES_PRIORITY_KEYS, rulesKeyOf, validRules } from "../scheduler/engine.js";

/** 把任意字符串收敛成已知协议;未知 → ``openai``(与 loadProviderConfig 一致)。 */
function toProtocol(value: unknown): ProviderProtocol {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (PROVIDER_PROTOCOLS as readonly string[]).includes(text)
    ? (text as ProviderProtocol)
    : "openai";
}

/** ``"<provider>/<model>"`` —— repo.py L181 ``real_model_id`` 的字符串形态。 */
function realModelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

/**
 * ``logical_model.members`` 解析。
 *
 * 兼容两种历史形态(Nexus 侧 ``normalize_members`` repo.py L287-312 同义):
 * - ``{provider, model}`` 对象数组(当前写库形态);
 * - ``"provider/model"`` 字符串数组(早期手写数据)。
 * 完全重复的成员只保留第一次出现(顺序即优先级)。
 */
export function parseMembersColumn(raw: string | null | undefined): ChainMember[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ChainMember[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    let provider = "";
    let model = "";
    if (typeof item === "string") {
      const slash = item.indexOf("/");
      if (slash <= 0 || slash === item.length - 1) continue;
      provider = item.slice(0, slash).trim();
      model = item.slice(slash + 1).trim();
    } else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      provider = typeof rec.provider === "string" ? rec.provider.trim() : "";
      model = typeof rec.model === "string" ? rec.model.trim() : "";
    }
    if (!provider || !model) continue;
    const key = realModelKey(provider, model);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ provider, model });
  }
  return out;
}

/** ``setting.scheduler.rules_p<priority>`` 各键的 ``v`` 列 → 合并规则数组(键名即档位)。 */
export function parseSchedulerRulesFromDb(db: NexusDatabase): SchedulerRule[] {
  const out: SchedulerRule[] = [];
  let any = false;
  for (const p of RULES_PRIORITY_KEYS) {
    const row = db.setting.get(rulesKeyOf(p));
    if (row === null || row === undefined || !row.v) continue;
    any = true;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.v);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const r of validRules(parsed)) {
      out.push({ ...r, priority: p } as SchedulerRule);
    }
  }
  if (any) return out;
  // 迁移期兼容:5 个档位键全空 → 回落旧 scheduler.rules 单键。
  const legacyRow = db.setting.get("scheduler.rules");
  return parseSchedulerRulesColumn(legacyRow?.v ?? null);
}

/** ``setting.scheduler.rules`` 的 ``v`` 列 → 规则数组(旧单键格式,仅迁移期/兼容)。 */
export function parseSchedulerRulesColumn(raw: string | null | undefined): SchedulerRule[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  // 落库形态是 ``{"rules": [...]}``(与 Nexus setting 一致);也容忍裸数组。
  const container = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { rules?: unknown }).rules)
      ? (parsed as { rules: unknown[] }).rules
      : [];
  return validRules(container) as SchedulerRule[];
}

/** 真实模型行 → 定义。 */
function toRealModel(row: RealModelRow): RealModelDefinition {
  return {
    provider: row.provider,
    model: row.model,
    name: row.name ?? null,
    supportsVision: Number(row.supports_vision) !== 0,
    maxInputTokens: row.max_input_tokens ?? null,
    maxOutputTokens: row.max_output_tokens ?? null,
    hidden: Number(row.hidden) !== 0,
    concurrency: row.concurrency ?? null,
  };
}

/** 逻辑模型行 → 定义。 */
function toLogicalModel(row: LogicalModelRow): LogicalModelDefinition {
  const strategy = row.strategy === "random" ? "random" : "due-first";
  return {
    name: row.name,
    strategy,
    members: parseMembersColumn(row.members),
  };
}

/**
 * 从数据库造一份注册表快照。
 *
 * 只读 —— 不写库、不缓存。装配层在每次「面板改了配置」后重新调用本函数,
 * 再用 ``ProviderRegistry.fromSnapshot()`` 换掉索引,现有 scheduler /
 * gateway 的读取点完全不用改(它们只认 registry 的查找 API)。
 *
 * @param db 已打开的数据库。
 * @returns 快照 + 解析期问题(目前只有 rules 的清洗丢弃项,便于面板提示)。
 */
export function snapshotFromDb(db: NexusDatabase): {
  snapshot: RegistrySnapshot;
  issues: readonly { path: string; message: string }[];
} {
  const providers = new Map<string, ProviderDefinition>();
  for (const row of db.provider.list()) {
    providers.set(row.id, {
      id: row.id,
      baseUrl: row.base_url ?? null,
      protocol: toProtocol(row.protocol),
      envPrefix: row.env_prefix ?? null,
    });
  }

  const realModels = new Map<string, RealModelDefinition>();
  for (const row of db.realModel.list()) {
    realModels.set(realModelKey(row.provider, row.model), toRealModel(row));
  }

  const logicalModels = new Map<string, LogicalModelDefinition>();
  for (const row of db.logicalModel.list()) {
    logicalModels.set(row.name, toLogicalModel(row));
  }

  // 账户:表里没有独立的账户行(Nexus 语义:账户 = credential 行)。
  // 用 credential 表造账户视图,enabled 恒 true(用户 m28134 不新增列,
  // 运行期启用态由装配层 overlay 维护,重启重置)。
  const accounts = new Map<string, AccountConfig>();
  for (const row of db.credential.list()) {
    const credentialRef = `${row.provider}/${row.username}`;
    accounts.set(credentialRef, {
      credentialRef,
      enabled: true,
      cooldownOverrideMinutes: null,
      sessionPinTtlSeconds: null,
    });
  }

  const schedulerRules = parseSchedulerRulesFromDb(db);

  return {
    snapshot: { providers, realModels, accounts, logicalModels, schedulerRules },
    issues: [],
  };
}
