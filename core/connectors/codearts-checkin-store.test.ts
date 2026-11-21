/**
 * CodeArts 签到时间落库（credential.raw_json.checkin）单测。
 */
import { describe, it, expect } from "vitest";
import { readCodeartsCheckin, markCodeartsCheckin } from "./codearts-checkin-store.js";

describe("readCodeartsCheckin", () => {
  it("从 JSON 字符串读出签到记录", () => {
    const rec = readCodeartsCheckin(
      JSON.stringify({
        accessKey: "ak",
        checkin: {
          claimed_at_ms: 1_800_000_000_000,
          expire_at_ms: 1_800_086_400_000,
          credit: 100,
          day: "2026-11-21",
        },
      }),
    );
    expect(rec).toEqual({
      claimed_at_ms: 1_800_000_000_000,
      expire_at_ms: 1_800_086_400_000,
      credit: 100,
      day: "2026-11-21",
    });
  });

  it("缺 expire_at_ms 时按 claimedAt + 24h 兜底", () => {
    const rec = readCodeartsCheckin({
      checkin: { claimed_at_ms: 1_800_000_000_000, credit: 100 },
    });
    expect(rec?.expire_at_ms).toBe(1_800_086_400_000);
  });

  it("坏 JSON / 无 checkin / 坏字段 → null", () => {
    expect(readCodeartsCheckin("{bad")).toBeNull();
    expect(readCodeartsCheckin({ accessKey: "ak" })).toBeNull();
    expect(readCodeartsCheckin({ checkin: { claimed_at_ms: "x" } })).toBeNull();
    expect(readCodeartsCheckin(null)).toBeNull();
  });
});

describe("markCodeartsCheckin", () => {
  it("把签到记录写进凭据 raw_json，且保留原有字段", () => {
    // 用一个最小内存 db 桩（只测 store 与 db.credential 的交互契约）。
    let stored: string | null = JSON.stringify({ accessKey: "ak", secretKey: "sk" });
    const db = {
      credential: {
        get: () => ({ provider: "codearts", username: "u", raw_json: stored }),
        update: (row: { raw_json: string }) => {
          stored = row.raw_json;
        },
      },
    } as never;
    const rec = markCodeartsCheckin(db, "u", {
      claimedAtMs: 1_800_000_000_000,
      expireAtMs: 1_800_086_400, // 秒 → 自动转毫秒
      credit: 100,
      day: "2026-11-21",
    });
    expect(rec.expire_at_ms).toBe(1_800_086_400_000);
    const raw = JSON.parse(stored as string);
    expect(raw.accessKey).toBe("ak"); // 原有字段保留
    expect(raw.secretKey).toBe("sk");
    expect(raw.checkin).toEqual(rec);
    expect(readCodeartsCheckin(raw)).toEqual(rec);
  });

  it("上游没给 expireAt → 按 claimedAt + 24h", () => {
    let stored: string | null = null;
    const db = {
      credential: {
        get: () => ({ provider: "codearts", username: "u", raw_json: stored }),
        update: (row: { raw_json: string }) => {
          stored = row.raw_json;
        },
      },
    } as never;
    const rec = markCodeartsCheckin(db, "u", { claimedAtMs: 1_800_000_000_000, credit: 100 });
    expect(rec.expire_at_ms).toBe(1_800_086_400_000);
  });
});
