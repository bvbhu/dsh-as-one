/**
 * 签到顺序：把「优先签」的账号排到最前。
 *
 * 为什么只有 trae 需要：trae 的签到积分是**按设备**发的 —— 同机多账号时，
 * 第一个签上的账号拿走当天额度，其余账号按设备级短路直接判「本设备今日已签」
 * （`TRAE_CODE_DEVICE_ALREADY`）。也就是说**顺序决定谁被牺牲**。
 *
 * 名单来自设置项 `checkin.trae.priority.accounts`（逗号分隔的用户名，**不在面板
 * 显示**），缺省为空 = 不干预顺序。代码里**不写死任何账号名**。
 *
 * 口径：
 * - 只做**稳定分区**（保序），不排序、不改变账号集合 —— 面板展示与逐账号查询
 *   都靠 `index` 回指原始顺序，重排数组但不能弄丢 `index`。
 * - 匹配是**大小写不敏感的子串**：账号标签常带后缀（`用户2767@…`），用全等会漏。
 */

/** 设置项键名（不在面板展示，用 `setting` 表直接写）。 */
export const TRAE_PRIORITY_SETTING_KEY = "checkin.trae.priority.accounts";

/** 逗号分隔的名单串 → 去空、去重、保序的数组。 */
export function parsePriorityList(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? "").split(",")) {
    const v = part.trim();
    if (v === "" || out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

/** 标签是否命中「优先签」名单；空标签不命中。 */
export function isPriorityLabel(label: string | null | undefined, priority: readonly string[]): boolean {
  const text = (label ?? "").trim().toLowerCase();
  if (text === "") return false;
  return priority.some((p) => p !== "" && text.includes(p.trim().toLowerCase()));
}

/**
 * 稳定分区：命中的在前（保持原相对顺序），其余在后（同样保持原顺序）。
 *
 * 名单为空时**原样返回**（不制造任何顺序变化）。
 */
export function prioritizeCheckinAccounts<T extends { username?: string | null }>(
  accounts: readonly T[],
  priority: readonly string[],
): T[] {
  const cleaned = priority.map((p) => p.trim()).filter((p) => p !== "");
  if (cleaned.length === 0) return accounts.slice();
  const first: T[] = [];
  const rest: T[] = [];
  for (const acc of accounts) {
    (isPriorityLabel(acc.username, cleaned) ? first : rest).push(acc);
  }
  return [...first, ...rest];
}
