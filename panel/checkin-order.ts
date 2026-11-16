/**
 * 签到顺序：把「可以少签一个」的账号排到最后。
 *
 * 为什么只有 trae 需要：trae 的签到积分是**按设备**发的 —— 同机多账号时，
 * 第一个签上的账号拿走当天额度，其余账号按设备级短路直接判「本设备今日已签」
 * （`REMOTE_TRAE_CODE_DEVICE_ALREADY`）。也就是说**顺序决定谁被牺牲**。
 *
 * 用户 2026-11-16 定案：优先签**不是 `bvbhu`** 的账号，让自己的号排在最后。
 *
 * 口径：
 * - 只做**稳定分区**（保序），不排序、不改变账号集合 —— 面板展示与逐账号查询
 *   都靠 `index` 回指原始顺序，重排数组但不能弄丢 `index`。
 * - 匹配是**大小写不敏感的子串**：账号标签常带后缀（`bvbhu@example.com`、
 *   `bvbhu-2`），用全等会漏。
 * - 列表可注入（测试与将来的设置项用），缺省 {@link TRAE_DEPRIORITIZED_LABELS}。
 */

/** 缺省「排到后面」的账号标签（大小写不敏感的子串匹配）。 */
export const TRAE_DEPRIORITIZED_LABELS: readonly string[] = ["bvbhu"];

/** 标签是否命中「排后面」列表；空标签不命中（宁可正常顺序，不要误判）。 */
export function isDeprioritizedLabel(
  label: string | null | undefined,
  deprioritized: readonly string[] = TRAE_DEPRIORITIZED_LABELS,
): boolean {
  const text = (label ?? "").trim().toLowerCase();
  if (text === "") return false;
  return deprioritized.some((d) => d !== "" && text.includes(d.trim().toLowerCase()));
}

/**
 * 稳定分区：未命中的在前（保持原相对顺序），命中的在后（同样保持原顺序）。
 *
 * 不改元素本身 —— 调用方靠 `index` 回指原始账号行。
 */
export function prioritizeCheckinAccounts<T extends { username?: string | null }>(
  accounts: readonly T[],
  deprioritized: readonly string[] = TRAE_DEPRIORITIZED_LABELS,
): T[] {
  const first: T[] = [];
  const last: T[] = [];
  for (const acc of accounts) {
    (isDeprioritizedLabel(acc.username, deprioritized) ? last : first).push(acc);
  }
  return [...first, ...last];
}
