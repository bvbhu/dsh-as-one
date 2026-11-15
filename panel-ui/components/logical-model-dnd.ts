/**
 * 逻辑模型档链的拖拽排序纯逻辑(不含 DOM / React,便于在 node 环境下单测)。
 *
 * 2026-11-15 用户定案:档链不再显示序号,也不再摆 ↑↓✕ 三个按钮 ——
 * 行首的拖动手柄承担「排序 + 拖出列表即删除」。顺序就是优先级,所以这里
 * 只做数组搬移,不做任何排序,结果由页面原样提交给后端。
 */

/** 与 DOMRect 兼容的最小矩形(测试里可直接给字面量)。 */
export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 行的上下边界(算插入位置只需要这两个)。 */
export interface RowBand {
  top: number;
  bottom: number;
}

/**
 * 把 `from` 上的元素搬到**插入位置** `insertAt`。
 *
 * ⚠️ `insertAt` 是「搬移前数组」的缝隙下标(0..len),不是目标元素下标:
 * 先 splice 掉源元素,后面的下标会整体左移一位,所以从右往左搬时要减 1。
 * 越界/无效输入一律返回原数组的副本,不抛错(DnD 事件可能给出脏坐标)。
 */
export function moveItemTo<T>(items: readonly T[], from: number, insertAt: number): T[] {
  if (!Number.isInteger(from) || from < 0 || from >= items.length) return [...items];
  const next = [...items];
  const item = next.splice(from, 1)[0] as T;
  const at = Math.max(0, Math.min(next.length, insertAt > from ? insertAt - 1 : insertAt));
  next.splice(at, 0, item);
  return next;
}

/**
 * 指针 Y 落在哪条缝隙:从上往下找第一条「指针在中线之上」的行。
 * 全在下方 → 末尾(n)。rows 为空 → 0。
 */
export function insertIndexAt(rows: readonly RowBand[], y: number): number {
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    if (y < (r.top + r.bottom) / 2) return i;
  }
  return rows.length;
}

/**
 * 指针是否已在矩形外。`margin` 是宽容差:手抖蹭到边框不算「拖出去删除」。
 */
export function outsideRect(rect: RectLike, x: number, y: number, margin = 0): boolean {
  return (
    x < rect.left - margin ||
    x > rect.right + margin ||
    y < rect.top - margin ||
    y > rect.bottom + margin
  );
}
