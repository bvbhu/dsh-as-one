/**
 * 档链拖拽的纯逻辑契约 —— 顺序就是优先级,UI 只做搬移,后端不排序,
 * 所以「插到哪条缝隙」和「什么算拖出范围」必须钉死。
 */
import { describe, expect, it } from "vitest";
import {
  insertIndexAt,
  moveItemTo,
  outsideRect,
} from "../panel-ui/components/logical-model-dnd.js";

describe("moveItemTo:插入位置是搬移前的缝隙下标", () => {
  const xs = ["a", "b", "c", "d"];

  it("往下搬:0 → 缝隙 3(即 c 与 d 之间)", () => {
    expect(moveItemTo(xs, 0, 3)).toEqual(["b", "c", "a", "d"]);
  });

  it("往下搬到末尾:0 → 缝隙 4", () => {
    expect(moveItemTo(xs, 0, 4)).toEqual(["b", "c", "d", "a"]);
  });

  it("往上搬:3 → 缝隙 1(即 a 与 b 之间)", () => {
    expect(moveItemTo(xs, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("搬到自己所在缝隙:顺序不变", () => {
    expect(moveItemTo(xs, 1, 1)).toEqual(xs);
    expect(moveItemTo(xs, 1, 2)).toEqual(xs);
  });

  it("脏坐标不抛错:from 越界 / insertAt 越界都夹到合法范围", () => {
    expect(moveItemTo(xs, -1, 2)).toEqual(xs);
    expect(moveItemTo(xs, 9, 2)).toEqual(xs);
    expect(moveItemTo(xs, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveItemTo(xs, 3, -5)).toEqual(["d", "a", "b", "c"]);
  });

  it("不改动原数组(受控组件的 members 由页面持有)", () => {
    const snapshot = [...xs];
    moveItemTo(xs, 0, 3);
    expect(xs).toEqual(snapshot);
  });
});

describe("insertIndexAt:按行中线判缝隙", () => {
  const rows = [
    { top: 0, bottom: 20 },
    { top: 22, bottom: 42 },
    { top: 44, bottom: 64 },
  ];

  it("上半部 → 插在该行之前", () => {
    expect(insertIndexAt(rows, 2)).toBe(0);
    expect(insertIndexAt(rows, 25)).toBe(1);
  });

  it("下半部 → 插在该行之后", () => {
    expect(insertIndexAt(rows, 18)).toBe(1);
    expect(insertIndexAt(rows, 40)).toBe(2);
  });

  it("全部之下 → 末尾;空列表 → 0", () => {
    expect(insertIndexAt(rows, 100)).toBe(3);
    expect(insertIndexAt([], 10)).toBe(0);
  });
});

describe("outsideRect:拖出列表才删除", () => {
  const rect = { left: 100, top: 100, right: 300, bottom: 200 };

  it("内部(含边界)不算拖出", () => {
    expect(outsideRect(rect, 150, 150)).toBe(false);
    expect(outsideRect(rect, 100, 200)).toBe(false);
  });

  it("四个方向越界都算", () => {
    expect(outsideRect(rect, 99, 150)).toBe(true);
    expect(outsideRect(rect, 301, 150)).toBe(true);
    expect(outsideRect(rect, 150, 99)).toBe(true);
    expect(outsideRect(rect, 150, 201)).toBe(true);
  });

  it("margin 容差:蹭到边框一点点不误删", () => {
    expect(outsideRect(rect, 95, 150, 8)).toBe(false);
    expect(outsideRect(rect, 90, 150, 8)).toBe(true);
  });
});
