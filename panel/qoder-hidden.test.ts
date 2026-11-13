/**
 * 回归测试:`syncSelectedRealModels` 不能把已登记模型的 `hidden` 重置为 0。
 *
 * 背景(2026-11-11 用户报):「调整 qoder 的模型列表,会导致 qoder 的所有模型
 * hidden 重置」。根因是 `fixed hidden: 0` —— 每次勾选/取消任何一个模型,
 * qoder 全部行的 hidden 都被抹成 0,用户手改的隐藏状态全没了。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type NexusDatabase } from "@as-one/core/src/db/database.js";
import type { QoderCatalogModel } from "@as-one/core/src/connectors/qoder-wire.js";

import { syncSelectedRealModels } from "./qoder.js";

let db: NexusDatabase;

beforeEach(() => {
  db = openDatabase(":memory:");
});

function catalogModel(key: string, over: Partial<QoderCatalogModel> = {}): QoderCatalogModel {
  return {
    key,
    displayName: `name-${key}`,
    enable: true,
    isDefault: false,
    isVl: false,
    isReasoning: false,
    isFree: false,
    priceFactor: undefined,
    maxInputTokens: 200_000,
    maxContextTokens: undefined,
    maxOutputTokens: 32_000,
    raw: {},
    ...over,
  };
}

describe("qoder 同步保留 hidden", () => {
  it("已登记模型 hidden=1 → 再次同步后仍为 1(不被重置为 0)", () => {
    // 第一次同步:建立两行
    syncSelectedRealModels(
      db,
      "qoder",
      [catalogModel("A"), catalogModel("B")],
      new Set(["A", "B"]),
    );
    // 用户把 A 设为隐藏
    db.realModel.update({ provider: "qoder", model: "A", hidden: 1 });
    expect(db.realModel.get("qoder", "A")?.hidden).toBe(1);

    // 再次同步(模拟用户又调整了模型列表 / 勾选)
    syncSelectedRealModels(
      db,
      "qoder",
      [catalogModel("A"), catalogModel("B"), catalogModel("C")],
      new Set(["A", "B", "C"]),
    );

    // A 的 hidden 必须保留 1
    expect(db.realModel.get("qoder", "A")?.hidden).toBe(1);
    // B 未动过,保持 0
    expect(db.realModel.get("qoder", "B")?.hidden).toBe(0);
    // 新行 C 默认 0(显示)
    expect(db.realModel.get("qoder", "C")?.hidden).toBe(0);
  });

  it("同一次同步里:保留所有已登记行的 hidden 现值,只有新行落 0", () => {
    syncSelectedRealModels(
      db,
      "qoder",
      [catalogModel("X")],
      new Set(["X"]),
    );
    db.realModel.update({ provider: "qoder", model: "X", hidden: 1 });

    syncSelectedRealModels(
      db,
      "qoder",
      [catalogModel("X"), catalogModel("Y")],
      new Set(["X", "Y"]),
    );

    expect(db.realModel.get("qoder", "X")?.hidden).toBe(1);
    expect(db.realModel.get("qoder", "Y")?.hidden).toBe(0);
  });
});