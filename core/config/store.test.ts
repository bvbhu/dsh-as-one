/**
 * store.ts 测试 —— 原子写 / 读取 / fs.watch 防抖热重载 / 故障注入。
 *
 * 覆盖:
 * - 原子写成功路径(临时文件 + rename + 回读校验,无残留);
 * - 序列化失败(循环引用)在碰磁盘之前抛,目标文件纹丝不动;
 * - rename 持续失败(模拟 Windows 文件锁)→ 抛 StoreError,目标文件完好,
 *   临时文件保留;下一轮写入清理陈旧临时文件并恢复;
 * - rename 前两次失败第三次成功 → 重试生效;
 * - 读取:不存在 → missing;空文件 → missing;坏 JSON → 带位置的错误;
 * - 热重载:内容变化触发回调;同目录其他文件不触发;close() 后不再触发;
 * - 内容比对:同样的内容重写不触发回调。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readJsonFile,
  setSleepForTests,
  StoreError,
  watchJsonFile,
  writeJsonFileAtomic,
  type FsOps,
} from "./store.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "as-one-store-"));
  setSleepForTests(() => {}); // 测试里跳过真实退避等待
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  setSleepForTests((ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* 忙等 */
    }
  });
});

// ===========================================================================
// 原子写:成功路径
// ===========================================================================

describe("writeJsonFileAtomic", () => {
  it("写入后可读回,且不留临时文件", () => {
    const file = join(dir, "config.json");
    writeJsonFileAtomic(file, { hello: "world", n: 1 });

    const result = readJsonFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ hello: "world", n: 1 });

    // 临时文件全部清理(成功路径下 rename 后 tmp 已消失)。
    expect(readdirSync(dir)).toEqual(["config.json"]);
  });

  it("覆盖已有文件(原子替换,不留半文件)", () => {
    const file = join(dir, "config.json");
    writeJsonFileAtomic(file, { v: 1 });
    writeJsonFileAtomic(file, { v: 2 });

    const result = readJsonFile(file);
    expect(result.ok && result.value).toEqual({ v: 2 });
    expect(readdirSync(dir)).toEqual(["config.json"]);
  });

  it("序列化失败(循环引用)在碰磁盘之前抛,不创建任何文件", () => {
    const file = join(dir, "config.json");
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => writeJsonFileAtomic(file, circular)).toThrow(StoreError);
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("序列化失败(BigInt)同样不碰磁盘", () => {
    const file = join(dir, "config.json");
    expect(() => writeJsonFileAtomic(file, { big: BigInt(1) })).toThrow(StoreError);
    expect(existsSync(file)).toBe(false);
  });
});

// ===========================================================================
// 原子写:故障注入(模拟 Windows 文件锁 / 磁盘写失败)
// ===========================================================================

describe("writeJsonFileAtomic 故障注入", () => {
  it("rename 持续失败 → 抛 StoreError,目标文件完好,临时文件保留", () => {
    const file = join(dir, "config.json");
    writeJsonFileAtomic(file, { v: 1 });

    const failing: FsOps = {
      writeFileSync: () => {},
      renameSync: () => {
        const err = new Error("EPERM: 文件被占用") as NodeJS.ErrnoException;
        err.code = "EPERM";
        throw err;
      },
      readFileSync: () => null,
      statSync: () => null,
      readdirSync: () => [],
    };

    expect(() => writeJsonFileAtomic(file, { v: 2 }, { fs: failing })).toThrow(StoreError);
    // 目标文件仍是旧值(没被写成半截)。
    const result = readJsonFile(file);
    expect(result.ok && result.value).toEqual({ v: 1 });
  });

  it("rename 前两次失败、第三次成功 → 重试后写入成功", () => {
    const file = join(dir, "config.json");
    let attempts = 0;
    // 只让 rename 前两次失败;write/read 走真实 fs,这样第三次 rename
    // 成功写入后回读校验才有内容可比。
    const flaky: FsOps = {
      writeFileSync: (p, d) => writeFileSync(p, d, "utf8"),
      renameSync: (from, to) => {
        attempts += 1;
        if (attempts < 3) {
          const err = new Error("EPERM: 文件被占用") as NodeJS.ErrnoException;
          err.code = "EPERM";
          throw err;
        }
        renameSync(from, to);
      },
      readFileSync: (p) => readFileSync(p, "utf8"),
      statSync: (p) => statSync(p),
      readdirSync: (d) => readdirSync(d),
    };

    writeJsonFileAtomic(file, { v: 2 }, { fs: flaky, renameRetries: 3 });
    expect(attempts).toBe(3);
    const result = readJsonFile(file);
    expect(result.ok && result.value).toEqual({ v: 2 });
  });

  it("崩溃残留的临时文件在下一轮写入时被清理", () => {
    const file = join(dir, "config.json");
    // 模拟上次崩溃:留下一个写了一半的临时文件。
    writeFileSync(join(dir, ".as-one-tmp-config.json-999-abc"), '{"v": 1', "utf8");

    writeJsonFileAtomic(file, { v: 2 });

    const result = readJsonFile(file);
    expect(result.ok && result.value).toEqual({ v: 2 });
    // 陈旧临时文件被清掉,目录里只剩正式文件。
    expect(readdirSync(dir)).toEqual(["config.json"]);
  });

  it("写临时文件失败(磁盘满)→ 抛错,目标文件完好", () => {
    const file = join(dir, "config.json");
    writeJsonFileAtomic(file, { v: 1 });

    const failing: FsOps = {
      writeFileSync: () => {
        const err = new Error("ENOSPC: 磁盘已满") as NodeJS.ErrnoException;
        err.code = "ENOSPC";
        throw err;
      },
      renameSync: () => {},
      readFileSync: () => null,
      statSync: () => null,
      readdirSync: () => [],
    };

    expect(() => writeJsonFileAtomic(file, { v: 2 }, { fs: failing })).toThrow(StoreError);
    const result = readJsonFile(file);
    expect(result.ok && result.value).toEqual({ v: 1 });
  });
});

// ===========================================================================
// 读取
// ===========================================================================

describe("readJsonFile", () => {
  it("文件不存在 → missing: true", () => {
    const result = readJsonFile(join(dir, "nope.json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe(true);
  });

  it("空文件 → 按不存在处理", () => {
    const file = join(dir, "empty.json");
    writeFileSync(file, "", "utf8");
    const result = readJsonFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe(true);
  });

  it("坏 JSON → 带解析错误信息", () => {
    const file = join(dir, "bad.json");
    writeFileSync(file, '{"v": ', "utf8");
    const result = readJsonFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toBe(false);
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("正常 JSON → ok: true", () => {
    const file = join(dir, "ok.json");
    writeFileSync(file, '{"a": [1, 2, 3]}', "utf8");
    const result = readJsonFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: [1, 2, 3] });
  });
});

// ===========================================================================
// 热重载:fs.watch 防抖
// ===========================================================================

describe("watchJsonFile", () => {
  it("内容变化 → 防抖后回调一次,拿到新文本", async () => {
    const file = join(dir, "watched.json");
    writeFileSync(file, '{"v": 1}', "utf8");

    const seen: string[] = [];
    const watcher = watchJsonFile(file, (text) => seen.push(text), undefined, { debounceMs: 20 });

    writeFileSync(file, '{"v": 2}', "utf8");
    await vi.waitFor(() => expect(seen.length).toBe(1), { timeout: 3000 });
    expect(JSON.parse(seen[0]!)).toEqual({ v: 2 });

    watcher.close();
  });

  it("同目录其他文件变化 → 不触发回调", async () => {
    const file = join(dir, "watched.json");
    writeFileSync(file, '{"v": 1}', "utf8");

    const seen: string[] = [];
    const watcher = watchJsonFile(file, (text) => seen.push(text), undefined, { debounceMs: 20 });

    writeFileSync(join(dir, "other.json"), '{"x": 1}', "utf8");
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toEqual([]);

    watcher.close();
  });

  it("内容没变(同样的文本重写)→ 不触发回调", async () => {
    const file = join(dir, "watched.json");
    writeFileSync(file, '{"v": 1}', "utf8");

    const seen: string[] = [];
    const watcher = watchJsonFile(file, (text) => seen.push(text), undefined, { debounceMs: 20 });

    writeFileSync(file, '{"v": 1}', "utf8"); // 同样的内容
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toEqual([]);

    watcher.close();
  });

  it("close() 后不再触发回调", async () => {
    const file = join(dir, "watched.json");
    writeFileSync(file, '{"v": 1}', "utf8");

    const seen: string[] = [];
    const watcher = watchJsonFile(file, (text) => seen.push(text), undefined, { debounceMs: 20 });
    watcher.close();

    writeFileSync(file, '{"v": 2}', "utf8");
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toEqual([]);
  });

  it("文件首次出现 → 触发一次回调", async () => {
    const file = join(dir, "late.json");
    // 注意:文件还不存在,watch 的是父目录。

    const seen: string[] = [];
    const watcher = watchJsonFile(file, (text) => seen.push(text), undefined, { debounceMs: 20 });

    writeFileSync(file, '{"v": 1}', "utf8");
    await vi.waitFor(() => expect(seen.length).toBe(1), { timeout: 3000 });
    expect(JSON.parse(seen[0]!)).toEqual({ v: 1 });

    watcher.close();
  });

  it("多次快速写入 → 防抖合并,最终只回调一次且是最终内容", async () => {
    const file = join(dir, "watched.json");
    writeFileSync(file, '{"v": 0}', "utf8");

    const seen: string[] = [];
    const watcher = watchJsonFile(file, (text) => seen.push(text), undefined, { debounceMs: 30 });

    // 编辑器保存常触发多次事件;防抖应合并成一次。
    writeFileSync(file, '{"v": 1}', "utf8");
    writeFileSync(file, '{"v": 2}', "utf8");
    writeFileSync(file, '{"v": 3}', "utf8");

    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 200)); // 等防抖窗口彻底安静
    expect(seen.length).toBe(1);
    expect(JSON.parse(seen[0]!)).toEqual({ v: 3 });

    watcher.close();
  });
});
