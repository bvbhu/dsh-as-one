/**
 * 压缩增强组件的纯函数单测（从 quilt/test/unit/*.test.js 移植并适配 TS）。
 * @module src/components/compaction/compaction.test
 */

import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  readCompactionConfig,
  toQuiltConfig,
  tiersFromLogicalModel,
  type CompactionComponentConfig,
} from "./config.js";
import {
  computeOutputBudget,
  computeUsableInputTokens,
  computeChunkBudget,
  OUTPUT_RESERVATION_RATIO,
  DEFAULT_CONTEXT_WINDOW,
} from "./budget.js";
import { computeCooldownUntil, MemoryCooldownStore } from "./cooldown.js";
import {
  ANCHOR_OPEN_TAG,
  ANCHOR_CLOSE_TAG,
  ANCHOR_PROMPT_INSTRUCTION,
  buildAnchorBlock,
} from "./summarize.js";
import {
  runStage0,
  chunkLines,
  lineTokenCost,
  dedupLines,
  purgeNoiseLines,
  skipBlankBlocks,
} from "./stage0.js";
import { chunkJob, mergeJob, describeAttempts, sessionTarget } from "./model-chain.js";
import {
  isCompactionRequestForTest,
  regionMessagesForTest,
} from "./intercept.js";

const baseTiers = () => ({
  tiers: [
    {
      name: "primary",
      models: [
        { provider: "p1", model: "m1", maxConcurrent: 1, cooldownHours: 24 },
        { provider: "p1", model: "m2", maxConcurrent: 2, cooldownHours: 5 },
      ],
    },
  ],
});

describe("config: 纯函数校验（替代 schemastery/zod）", () => {
  it("defaults are applied for every omitted field", () => {
    const config = resolveConfig(baseTiers());
    expect(config.chunkRatio).toBe(0.8);
    expect(config.chunkOverlapRatio).toBe(0.1);
    expect(config.fallbackToSessionModel).toBe(true);
    expect(config.chunkPromptSuffix).toBe("");
    expect(config.mergePromptSuffix).toBe("");
    expect(config.preprocessing.dedup).toBe(true);
    expect(config.preprocessing.purgeErrors).toBe(true);
    expect(config.preprocessing.astSkeleton).toEqual({ enabled: false, maxDepth: 2 });
    expect(config.preprocessing.logCondense).toEqual({ mode: "balanced", maxLines: 200 });
    expect(config.mergeMaxContextTokens).toBe(128000);
  });

  it("resolves tier models with key + defaults", () => {
    const config = resolveConfig(baseTiers());
    const models = config.tiers[0]!.models;
    expect(models[0]!.key).toBe("p1/m1");
    expect(models[0]!.maxConcurrent).toBe(1);
    expect(models[0]!.cooldownHours).toBe(24);
  });

  it("rejects unknown top-level keys and empty tiers", () => {
    expect(() => resolveConfig({ ...baseTiers(), typo: "x" })).toThrow(/unknown key "typo"/);
    expect(() => resolveConfig({ tiers: [] })).toThrow(/non-empty array/);
  });

  it("rejects duplicate routes", () => {
    expect(() => resolveConfig({
      tiers: [{ name: "t", models: [
        { provider: "p", model: "m" },
        { provider: "p", model: "m" },
      ] }],
    })).toThrow(/duplicate pool route/);
  });

  it("reads component settings from setting table", () => {
    const settings: Record<string, string> = {
      "compaction.enabled": "true",
      "compaction.promptMode": "anchored",
      "compaction.logicalModel": "free",
      "compaction.tiers": JSON.stringify(baseTiers().tiers),
    };
    const cfg = readCompactionConfig((k) => settings[k] ?? null);
    expect(cfg.enabled).toBe(true);
    expect(cfg.promptMode).toBe("anchored");
    expect(cfg.logicalModel).toBe("free");
    expect(cfg.tiers).toHaveLength(1);
  });

  it("defaults promptMode to default and disabled when setting says 0", () => {
    const cfg = readCompactionConfig((k) => (k === "compaction.enabled" ? "0" : null));
    expect(cfg.enabled).toBe(false);
    expect(cfg.promptMode).toBe("default");
    expect(cfg.tiers).toEqual([]);
  });

  it("accepts all three prompt modes and falls back to default on unknown", () => {
    const read = (mode: string | null) =>
      readCompactionConfig((k) => (k === "compaction.promptMode" ? mode : null)).promptMode;
    expect(read("default")).toBe("default");
    expect(read("anchored")).toBe("anchored");
    expect(read("quilt")).toBe("quilt");
    // 大小写与空白容忍
    expect(read("  ANCHORED ")).toBe("anchored");
    // 未知值回落 default（最接近宿主自带行为的一档）
    expect(read("bogus")).toBe("default");
  });

  it("toQuiltConfig produces usable engine config", () => {
    const comp: CompactionComponentConfig = {
      enabled: true,
      promptMode: "anchored",
      logicalModel: "",
      tiers: resolveConfig(baseTiers()).tiers as CompactionComponentConfig["tiers"],
      mergeMaxContextTokens: 8000,
    };
    const cfg = toQuiltConfig(comp);
    expect(cfg.mergeMaxContextTokens).toBe(8000);
    expect(cfg.tiers).toHaveLength(1);
  });

  it("tiersFromLogicalModel maps members in order; empty name yields no tiers", () => {
    const registry = {
      membersOf: (name: string) => (name === "free" ? [
        { provider: "p1", model: "m1" },
        { provider: "p2", model: "m2" },
      ] : []),
      getRealModel: (provider: string, model: string) =>
        provider === "p1" ? { concurrency: 3 } : null,
    };
    const tiers = tiersFromLogicalModel(registry as never, "free");
    expect(tiers).toHaveLength(1);
    expect(tiers[0]!.name).toBe("free");
    expect(tiers[0]!.models.map((m) => m.key)).toEqual(["p1/m1", "p2/m2"]);
    expect(tiers[0]!.models[0]!.maxConcurrent).toBe(3);
    expect(tiers[0]!.models[1]!.maxConcurrent).toBe(1);
    expect(tiersFromLogicalModel(registry as never, "")).toEqual([]);
    expect(tiersFromLogicalModel(registry as never, "missing")).toEqual([]);
  });
});

describe("budget: context math", () => {
  it("output budget is 15% of window capped at DEFAULT_MAX_TOKENS", () => {
    expect(computeOutputBudget(1000)).toBe(150);
    expect(computeOutputBudget(1_000_000)).toBe(32768);
  });

  it("usable input subtracts output + overhead + headroom", () => {
    const window = 8000;
    expect(computeUsableInputTokens(window)).toBe(window - computeOutputBudget(window) - 512 - 512);
  });

  it("chunk budget is chunkRatio of usable input", () => {
    const window = 128000;
    const expected = Math.floor(computeUsableInputTokens(window) * 0.8);
    expect(computeChunkBudget(window, 0.8)).toBe(expected);
  });
});

describe("cooldown", () => {
  it("computeCooldownUntil adds hours (decimals supported)", () => {
    expect(computeCooldownUntil(1, 1000)).toBe(1000 + 3_600_000);
    expect(computeCooldownUntil(0.5, 0)).toBe(1_800_000);
  });

  it("memory store is healthy until cooldown until", async () => {
    const store = new MemoryCooldownStore();
    expect(store.isHealthy("p/m", 100)).toBe(true);
    await store.applyCooldown("p/m", 500);
    expect(store.cooldownUntil("p/m")).toBe(500);
    expect(store.isHealthy("p/m", 400)).toBe(false);
    expect(store.isHealthy("p/m", 600)).toBe(true);
    await store.clearAll();
    expect(store.cooldownUntil("p/m")).toBe(0);
  });
});

describe("anchor block (session-search 联动)", () => {
  it("buildAnchorBlock is XML tags + single-line JSON", () => {
    const block = buildAnchorBlock({
      id: "QC-ABC",
      sessionId: "s-1",
      seqStart: 12,
      seqEnd: 40,
      chunks: [{ i: 1, lines: [0, 120], tokens: 9000, anchor: "QC-ABC-1" }],
    });
    const lines = block.split("\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(ANCHOR_OPEN_TAG);
    expect(lines[2]).toBe(ANCHOR_CLOSE_TAG);
    const parsed = JSON.parse(lines[1]!) as { sessionId: string; seqStart: number; seqEnd: number; chunks: unknown[] };
    expect(parsed.sessionId).toBe("s-1");
    expect(parsed.seqStart).toBe(12);
    expect(parsed.seqEnd).toBe(40);
    expect(parsed.chunks).toHaveLength(1);
    expect(ANCHOR_PROMPT_INSTRUCTION).toContain("session_event_search");
  });
});

describe("stage0 preprocessing + chunking", () => {
  it("dedup collapses consecutive duplicates only", () => {
    expect(dedupLines(["a", "a", "b", "a"])).toEqual(["a", "b", "a"]);
  });

  it("purgeNoiseLines strips ANSI and cursor markers", () => {
    const out = purgeNoiseLines(["\u001b[31mred\u001b[0m", "^^^^", "---keep---"]);
    expect(out).toEqual(["red", "---keep---"]);
  });

  it("skipBlankBlocks collapses blank runs", () => {
    expect(skipBlankBlocks(["a", "", "", "", "", "b"])).toEqual(["a", "", "b"]);
  });

  it("runStage0 flattens messages + applies preprocessing", () => {
    const lines = runStage0([
      { role: "system", content: [{ type: "text", text: "sys" }] },
      { role: "user", content: [{ type: "text", text: "hello\nhello\nworld" }] },
    ], resolveConfig(baseTiers()).preprocessing);
    expect(lines[0]).toBe("[system]");
    expect(lines).toContain("sys");
    expect(lines).toContain("hello");
    expect(lines).toContain("world");
    expect(lines.filter((l) => l === "hello")).toHaveLength(1); // dedup
  });

  it("chunkLines partitions with overlap", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i} content`);
    const chunks = chunkLines(lines, 200, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.start).toBe(0);
    expect(chunks.at(-1)!.end).toBe(lines.length);
  });

  it("lineTokenCost > 0", () => {
    expect(lineTokenCost("hello")).toBeGreaterThan(0);
  });
});

describe("model-chain helpers", () => {
  it("chunkJob carries meta + split halves", () => {
    const text = "line1\nline2\nline3\nline4";
    const job = chunkJob("chunk 1", text, { tokens: 100, lineStart: 0, lineEnd: 4 }, "p/m", 50);
    expect(job.inputTokens).toBe(100);
    expect(job.capTokens).toBe(50);
    const halves = job.split?.();
    expect(halves).toHaveLength(2);
    expect((halves![0]!.meta!.tokens as number)).toBeLessThan(100);
  });

  it("mergeJob builds messages from digests", () => {
    const job = mergeJob(["digest A", "digest B"], { sourceChunks: 2 });
    const messages = job.buildMessages({ chunkPromptSuffix: "", mergePromptSuffix: "" });
    expect(messages).toHaveLength(2);
    expect(messages[0]!.content[0]!.text).toContain("digest A");
    expect(messages[1]!.content[0]!.text).toContain("tier-2");
  });

  it("describeAttempts groups by route", () => {
    const summary = describeAttempts([
      { model: "p/m", error: "boom" },
      { model: "p/m", error: "boom2" },
      { model: "q/m", error: "down" },
    ]);
    expect(summary).toContain("p/m x2");
    expect(summary).toContain("q/m x1");
  });

  it("sessionTarget prefers requestHeader config", () => {
    const agent = {
      session: {
        id: "s",
        requestHeader: () => ({ config: { provider: "p", model: "m" } }),
      },
      options: { provider: "q", model: "n" },
    };
    expect(sessionTarget(agent)).toEqual({ provider: "p", model: "m" });
  });
});

describe("interceptor predicates", () => {
  it("only purpose=compaction is a compaction request", () => {
    expect(isCompactionRequestForTest({ purpose: "compaction" })).toBe(true);
    expect(isCompactionRequestForTest({ purpose: "session-title" })).toBe(false);
    expect(isCompactionRequestForTest({})).toBe(false);
  });

  it("regionMessages strips host compaction instruction", () => {
    const options = {
      purpose: "compaction",
      messages: [
        { role: "system", content: [{ type: "text", text: "sys" }] },
        { role: "user", content: [{ type: "text", text: "region" }] },
        { role: "user", content: [{ type: "text", text: "You are now acting as a compaction engine. Condense the conversation ABOVE." }] },
      ],
    };
    const region = regionMessagesForTest(options);
    expect(region).toHaveLength(2);
    expect(JSON.stringify(region)).not.toContain("acting as a compaction engine");
  });
});
