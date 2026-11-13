/**
 * 请求日志模块测试 —— 对齐 Nexus repo.py `_RequestLogWriter` / `_skeleton` /
 * `_trim` / `_edges` / `log_requests` / `_content_mode` 语义。
 *
 * 覆盖:writer 句柄缓存/重定向/prune/close、正文裁剪(structure 的 _keys/_len/_type
 * 与 messages 特判、full trim 头尾、edges 首尾)、content_mode 解析(5s 缓存 +
 * enabled 判定)、prepareRow / writeStats / logRequests 集成(真实 :memory: db +
 * 临时目录)。
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db/database.js";
import {
  createContentModeResolver,
  detail,
  logRequests,
  parseContentMode,
  prepareRow,
  resolveContentMode,
  splitModelId,
  writeStats,
  type RequestLogRow,
} from "./index.js";
import {
  EDGE_CHARS,
  MAX_PAYLOAD_BYTES,
  RequestLogWriter,
  dayKey,
  edges,
  parseMs,
  payloadChars,
  skeleton,
  trim,
} from "./writer.js";

// ---------------------------------------------------------------------------
// 基建:临时目录 + :memory: 数据库
// ---------------------------------------------------------------------------

let dir = "";
let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "as-one-reqlog-"));
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function bytes(path: string): number {
  return statSync(path).size;
}

// ---------------------------------------------------------------------------
// writer:句柄缓存 / 落盘 / 重定向 / prune / close
// ---------------------------------------------------------------------------

describe("RequestLogWriter", () => {
  it("write() 立即落盘并按天命名 requests-YYYYMMDD.jsonl", () => {
    const w = new RequestLogWriter(dir);
    const day = dayKey();
    w.write(day, [{ a: 1 }, { b: "中文" }]);
    w.write(day, [{ c: 3 }]);
    const file = join(dir, `requests-${day.replaceAll("-", "")}.jsonl`);
    const lines = readFileSync(file, "utf8").split("\n").filter((s) => s !== "");
    expect(lines).toEqual(['{"a":1}', '{"b":"中文"}', '{"c":3}']);
    w.close();
  });

  it("同一天复用句柄,续写不覆盖", () => {
    const w = new RequestLogWriter(dir);
    w.write(dayKey(), [{ n: 1 }]);
    const size1 = bytes(w.pathFor(dayKey()));
    w.write(dayKey(), [{ n: 2 }]);
    expect(bytes(w.pathFor(dayKey()))).toBeGreaterThan(size1);
    w.close();
  });

  it("configure() 重定向:先关旧句柄,新 root 生效", () => {
    const w = new RequestLogWriter(dir);
    w.write(dayKey(), [{ a: 1 }]);
    const oldFile = w.pathFor(dayKey());
    const dir2 = mkdtempSync(join(tmpdir(), "as-one-reqlog-b-"));
    try {
      w.configure(dir2);
      w.write(dayKey(), [{ b: 2 }]);
      expect(readFileSync(join(dir2, `requests-${dayKey().replaceAll("-", "")}.jsonl`), "utf8")).toBe('{"b":2}\n');
      // 旧 root 文件保留(只重定向,不迁移)
      expect(bytes(oldFile)).toBeGreaterThan(0);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
      w.close();
    }
  });

  it("prune() 只删 cutoffDay 之前的请求日志,非日志文件原样保留", () => {
    const w = new RequestLogWriter(dir);
    w.write("2026-10-10", [{ a: 1 }]);
    w.write("2026-10-12", [{ b: 2 }]);
    w.write("2026-10-13", [{ c: 3 }]);
    // 乖离文件(不匹配 requests-NNNNNNNN.jsonl)不得动
    const stray = join(dir, "requests-notes.txt");
    const keep = join(dir, "settings.json");
    const strayDayDir = join(dir, "requests-20261012.bak");

    // 手动造两个不匹配文件
    writeFileSync(stray, "x");
    writeFileSync(keep, "{}");
    mkdirSync(strayDayDir);

    w.prune("2026-10-13");
    expect(readdirSync(dir).sort()).toEqual([
      "requests-20261012.bak",
      "requests-20261013.jsonl",
      "requests-notes.txt",
      "settings.json",
    ]);
    // 被删的 10-10 文件即使句柄还开着也能删(先关句柄)
    w.prune("2026-10-20");
    expect(readdirSync(dir).sort()).toEqual([
      "requests-20261012.bak",
      "requests-notes.txt",
      "settings.json",
    ]);
    w.close();
  });

  it("prune() 目录不存在时是 no-op,不抛", () => {
    const w = new RequestLogWriter(join(dir, "no-such-dir"));
    expect(() => w.prune("2026-10-13")).not.toThrow();
    w.close();
  });

  it("未 configure 的 writer 调用 write() 抛出明确错误", () => {
    const w = new RequestLogWriter();
    expect(() => w.write("2026-10-13", [{ a: 1 }])).toThrow(/未配置日志目录/);
  });

  it("close() 后再次 write() 会重新开句柄", () => {
    const w = new RequestLogWriter(dir);
    w.write(dayKey(), [{ a: 1 }]);
    w.close();
    w.write(dayKey(), [{ b: 2 }]);
    const lines = readFileSync(w.pathFor(dayKey()), "utf8").split("\n").filter(Boolean);
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    w.close();
  });
});

// ---------------------------------------------------------------------------
// trim / edges(正文裁剪)
// ---------------------------------------------------------------------------

describe("trim(_trim)", () => {
  it("短文本原样返回", () => {
    expect(trim("hello")).toBe("hello");
  });

  it("非 str 且未超限:返回原值(与 Nexus 一致,不转文本)", () => {
    const obj = { a: [1, 2, 3] };
    expect(trim(obj, 1_000_000)).toBe(obj);
  });

  it("超长:头 + 截断标记 + 尾,标记逐字 '\\n...[截断 N 字节]...\\n'", () => {
    const limit = 1000;
    const text = "x".repeat(5000);
    const out = trim(text, limit) as string;
    expect(out).toContain("\n...");
    expect(out).toContain("...\n");
    const m = /\n\.\.\.\[截断 (\d+) 字节\]\.\.\.\n/.exec(out);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(5000 - Math.floor(limit / 2) - Math.floor(limit / 4));
    expect(out.startsWith(text.slice(0, Math.floor(limit / 2)))).toBe(true);
    expect(out.endsWith(text.slice(-Math.floor(limit / 4)))).toBe(true);
  });

  it("超长非 str:先序列化再裁", () => {
    const big = { data: "y".repeat(MAX_PAYLOAD_BYTES + 1) };
    const out = trim(big) as string;
    expect(out.length).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect(out).toContain("截断");
  });

  it("null → null", () => {
    expect(trim(null)).toBeNull();
    expect(trim(undefined)).toBeNull();
  });
});

describe("edges(_edges)", () => {
  const n = EDGE_CHARS;
  it("短文本:head 即全文,tail 为 null,chars 记长", () => {
    expect(edges("abc", 10)).toEqual({ head: "abc", tail: null, chars: 3 });
  });

  it("长文本:只留首尾各 n 字符", () => {
    const text = "一二三四五六七八九十".repeat(50);
    const out = edges(text, 10)!;
    expect(out.head).toBe("一二三四五六七八九十");
    expect(out.tail).toBe("一二三四五六七八九十");
    expect(out.chars).toBe(text.length);
  });

  it("null → null;非 str 先序列化", () => {
    expect(edges(null)).toBeNull();
    const out = edges({ k: "v" }, 5);
    expect(out!.chars).toBe(9); // {"k":"v"} 序列化后长度
    expect(out!.head.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// skeleton(structure 档)
// ---------------------------------------------------------------------------

describe("skeleton(_skeleton)", () => {
  it("messages 顶层特判:{role, chars, keys} 不抄正文", () => {
    const payload = {
      messages: [
        { role: "user", content: "你好", extra_field: 1 },
        { role: "assistant", content: "hi" },
        "not-an-object",
      ],
      model: "gpt-x",
    };
    const out = skeleton(payload) as Record<string, unknown>;
    expect(out.keys).toEqual(["messages", "model"]);
    const messages = out.messages as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: "user", chars: 2, keys: ["content", "extra_field", "role"] });
    expect(messages[1]).toEqual({ role: "assistant", chars: 2, keys: ["content", "role"] });
    expect(messages[2]).toEqual({ _type: "str" });
    // messages 顶层特判只留 {messages, keys}(Nexus 语义:其余顶层键不展开)
    expect(Object.keys(out)).toEqual(["messages", "keys"]);
  });

  it("depth>=2:对象只剩 {_keys}、列表只剩 {_len}", () => {
    const payload = {
      outer: {
        inner: { a: 1, b: 2 },
        list: [1, 2, 3],
      },
    };
    const out = skeleton(payload) as Record<string, unknown>;
    const outer = out.outer as Record<string, unknown>;
    expect(outer.inner as Record<string, unknown>).toEqual({ _keys: ["a", "b"] });
    expect(outer.list as Record<string, unknown>).toEqual({ _len: 3 });
  });

  it("标量 → {_type};null → null;字符串 JSON 能展结构就展,否则记 {_raw_chars}", () => {
    expect(skeleton(42)).toEqual({ _type: "int" });
    expect(skeleton(true)).toEqual({ _type: "bool" });
    expect(skeleton(null)).toBeNull();
    expect(skeleton("[1, 2]")).toEqual([1, 2]); // 字符串本身是合法 JSON
    expect(skeleton("not json")).toEqual({ _raw_chars: 8 });
    expect(skeleton("")).toEqual({ _raw_chars: 0 });
  });

  it("depth 0 普通对象:每键递归下降一层", () => {
    const out = skeleton({ a: { b: { c: 1 } } }) as Record<string, unknown>;
    expect(out).toEqual({ a: { b: { _keys: ["c"] } } });
  });
});

describe("payloadChars", () => {
  it("str 记字符数,None 记 0,非 str 按序列化长度", () => {
    expect(payloadChars("你好")).toBe(2);
    expect(payloadChars(null)).toBe(0);
    expect(payloadChars({ k: "v" })).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// parseMs / dayKey / splitModelId
// ---------------------------------------------------------------------------

describe("辅助 parseMs / dayKey / splitModelId", () => {
  it("parseMs:None→默认,数字直取(含小数),字符串可解析,坏值→默认", () => {
    expect(parseMs(undefined, 5)).toBe(5);
    expect(parseMs(null, 5)).toBe(5);
    expect(parseMs(123.45, 5)).toBe(123.45);
    expect(parseMs("67", 5)).toBe(67);
    expect(parseMs("", 5)).toBe(5);
    expect(parseMs("  ", 5)).toBe(5);
    expect(parseMs("abc", 5)).toBe(5);
    expect(parseMs(true, 5)).toBe(1);
  });

  it("dayKey 本地时间格式 YYYY-MM-DD,单月单日补零", () => {
    expect(dayKey(new Date(2026, 9, 15, 12).getTime())).toBe("2026-10-15");
    expect(dayKey(new Date(2026, 0, 5, 0).getTime())).toBe("2026-01-05");
  });

  it("splitModelId:首个 / 拆;无斜杠 → (null, text)", () => {
    expect(splitModelId("p/m")).toEqual(["p", "m"]);
    expect(splitModelId("p/a/b")).toEqual(["p", "a/b"]);
    expect(splitModelId("plain")).toEqual([null, "plain"]);
    expect(splitModelId(null)).toEqual([null, null]);
  });
});

// ---------------------------------------------------------------------------
// content_mode 解析
// ---------------------------------------------------------------------------

describe("content_mode 解析(_content_mode)", () => {
  const settings = new Map<string, string>();
  const getSetting = (k: string): string | null | undefined => settings.get(k) ?? null;
  beforeEach(() => settings.clear());

  it("parseContentMode:合法档位直收,非法回退 fallback,容忍大小写/空白", () => {
    expect(parseContentMode("structure", "off")).toBe("structure");
    expect(parseContentMode(" FULL ", "structure")).toBe("full");
    expect(parseContentMode("weird", "structure")).toBe("structure");
    expect(parseContentMode(null, "off")).toBe("off");
  });

  it("resolveContentMode:无设置默认 structure;enabled 关(0/false/off/no)→ off", () => {
    expect(resolveContentMode(getSetting)).toBe("structure");
    for (const v of ["0", "false", "off", "no"]) {
      settings.set("request_log.enabled", v);
      expect(resolveContentMode(getSetting)).toBe("off");
    }
  });

  it("enabled 未命中关闭值时尊重存储的档位;非法档位回退 structure", () => {
    settings.set("request_log.content_mode", "full");
    expect(resolveContentMode(getSetting)).toBe("full");
    settings.set("request_log.content_mode", "banana");
    expect(resolveContentMode(getSetting)).toBe("structure");
  });

  it("createContentModeResolver:5 秒缓存,T 内不读新值,T 后读到新值", () => {
    let now = 1_000_000;
    const resolve = createContentModeResolver(getSetting, { ttlMs: 5_000, now: () => now });
    settings.set("request_log.content_mode", "edges");
    expect(resolve()).toBe("edges");
    settings.set("request_log.content_mode", "full");
    expect(resolve()).toBe("edges"); // 缓存内
    settings.set("request_log.enabled", "0");
    expect(resolve()).toBe("edges"); // 缓存内
    now += 6_000;
    expect(resolve()).toBe("off"); // 过期后 enabled=0 生效
    settings.set("request_log.enabled", "1");
    now += 6_000;
    expect(resolve()).toBe("full");
  });
});

// ---------------------------------------------------------------------------
// prepareRow / writeStats / logRequests
// ---------------------------------------------------------------------------

describe("prepareRow(_prepare_row)", () => {
  it("real_model_id 拆分 provider/model;username 二元组取第 2 项", () => {
    const row = prepareRow({
      ts: 0,
      real_model_id: "sensenova/deepseek-v4",
      logical_model: "flash",
      username: ["sensenova", "u1"],
      session_id: "s-1",
      usage: { prompt_tokens: 3, cached_tokens: 2, completion_tokens: 5 },
      latency_ms: 12.6,
      ttft_ms: 3.2,
      status: 200,
      request: { messages: [{ role: "user", content: "hi" }] },
    });
    expect(row.provider).toBe("sensenova");
    expect(row.model).toBe("deepseek-v4");
    expect(row.username).toBe("u1");
    expect(row.endpoint_id).toBe("sensenova/deepseek-v4@sensenova/u1");
    expect(row.session_id).toBe("s-1");
    expect(row.prompt_tokens).toBe(3);
    expect(row.cached_tokens).toBe(2);
    expect(row.completion_tokens).toBe(5);
    expect(row.latency_ms).toBe(12.6);
    expect(row.ttft_ms).toBe(3.2);
    expect(row.ok).toBe(true);
    expect(row.fails).toBe(0);
    expect(row.payload).toEqual({ messages: [{ role: "user", content: "hi" }] });
  });

  it("ok 默认 = 无 error 且 status<400;失败行 fails=1", () => {
    const good = prepareRow({ status: 503, error: undefined });
    expect(good.ok).toBe(false);
    expect(good.fails).toBe(1);
    const bad = prepareRow({ status: 200, error: null, ok: true });
    expect(bad.ok).toBe(true);
    expect(bad.fails).toBe(0);
    const explicitFail = prepareRow({ ok: false, error: "boom" });
    expect(explicitFail.ok).toBe(false);
    expect(explicitFail.fails).toBe(1);
  });

  it("ttft_ms 缺省 → null(ttft_requests 不计);day 缺省按 ts 推算", () => {
    const row = prepareRow({ ts: new Date(2026, 9, 15, 12).getTime() / 1000 });
    expect(row.ttft_ms).toBeNull();
    expect(row.day).toBe("2026-10-15");
  });
});

describe("writeStats(_write_stats)", () => {
  it("按 (day, logical, provider, model) 分组累加;失败行整条跳过(m11736)", () => {
    const out: Array<Record<string, number | string | null>> = [];
    const items = [
      prepareRow({ day: "2026-10-15", real_model_id: "p/m", logical_model: "l", ok: true, prompt_tokens: 1, cached_tokens: 1, completion_tokens: 2, latency_ms: 10, ttft_ms: 5, requests: 1 }),
      // 失败行:requests/token/延迟一律不进统计,但明细日志仍会写它
      prepareRow({ day: "2026-10-15", real_model_id: "p/m", logical_model: "l", ok: false, prompt_tokens: 3, completion_tokens: 4, latency_ms: 30, ttft_ms: null, requests: 1 }),
      prepareRow({ day: "2026-10-15", real_model_id: "p/m", logical_model: null, ok: true, latency_ms: 7, ttft_ms: 2, requests: 1 }),
      prepareRow({ day: "2026-10-16", real_model_id: "p/m", logical_model: null, ok: true, latency_ms: 1, ttft_ms: null, requests: 2 }),
    ];
    writeStats(items, (d) => out.push({ ...d }));
    expect(out).toEqual([
      { day: "2026-10-15", logical_model: "l", provider: "p", model: "m", requests: 1, fails: 0, prompt_tokens: 1, cached_tokens: 1, completion_tokens: 2, latency_sum_ms: 10, ttft_sum_ms: 5, ttft_requests: 1 },
      { day: "2026-10-15", logical_model: null, provider: "p", model: "m", requests: 1, fails: 0, prompt_tokens: 0, cached_tokens: 0, completion_tokens: 0, latency_sum_ms: 7, ttft_sum_ms: 2, ttft_requests: 1 },
      { day: "2026-10-16", logical_model: null, provider: "p", model: "m", requests: 2, fails: 0, prompt_tokens: 0, cached_tokens: 0, completion_tokens: 0, latency_sum_ms: 1, ttft_sum_ms: 0, ttft_requests: 0 },
    ]);
  });

  it("全是失败行 → 不进聚合(但明细日志照写)", () => {
    const out: unknown[] = [];
    writeStats(
      [
        prepareRow({ day: "2026-10-15", real_model_id: "p/m", logical_model: "l", ok: false, prompt_tokens: 9, completion_tokens: 9 }),
      ],
      (d) => out.push(d),
    );
    expect(out).toEqual([]);
  });

  it("没有真实 provider/model 的行不进聚合(诚实降级:不伪造)", () => {
    const out: unknown[] = [];
    writeStats([prepareRow({ real_model_id: undefined })], (d) => out.push(d));
    expect(out).toEqual([]);
  });

  it("record 直接喂 statsDaily.record(复用存量实现,不写新 SQL)", () => {
    db.statsDaily.record({ day: "2026-10-15", logical_model: "l", provider: "p", model: "m", requests: 1, fails: 0, prompt_tokens: 1 });
    const item = prepareRow({ day: "2026-10-15", real_model_id: "p/m", logical_model: "l", ok: true, prompt_tokens: 2 });
    writeStats([item], (d) => db.statsDaily.record({ ...d, logical_model: d.logical_model }));
    const rows = db.statsDaily.range("2026-10-15", "2026-10-15");
    expect(rows).toHaveLength(1);
    expect(rows[0].prompt_tokens).toBe(3);
    expect(rows[0].requests).toBe(2);
  });
});

describe("detail(_detail)", () => {
  it("元数据永远写全,usage 三键恒定,ts 保留 6 位小数", () => {
    const item = prepareRow({ ts: 1234.5678912, day: "2026-10-15", real_model_id: "p/m", logical_model: null, username: "u", session_id: "s", status: 200, ok: true, latency_ms: 12.6, ttft_ms: 3.25, usage: { prompt_tokens: 3, cached_tokens: 1, completion_tokens: 2 }, request: {} });
    const rec = detail(item, "structure");
    expect(rec.ts).toBe(1234.567891);
    expect(rec.day).toBe("2026-10-15");
    expect(rec.logical_model).toBeNull();
    expect(rec.endpoint_id).toBe("p/m@p/u");
    expect(rec.username).toBe("u");
    expect(rec.session_id).toBe("s");
    expect(rec.latency_ms).toBe(13);
    expect(rec.ttft_ms).toBe(3);
    expect(rec.usage).toEqual({ prompt_tokens: 3, cached_tokens: 1, completion_tokens: 2 });
    expect(rec.content_mode).toBe("structure");
  });
});

describe("logRequests(log_requests) 集成", () => {
  const makeRows = (): RequestLogRow[] => [
    { ts: new Date(2026, 9, 15, 12).getTime() / 1000, real_model_id: "p/m", logical_model: "flash", ok: true, status: 200, latency_ms: 20, ttft_ms: 4, usage: { prompt_tokens: 10, cached_tokens: 2, completion_tokens: 8 }, request: { messages: [{ role: "user", content: "你好" }] } },
  ];

  function withMode(mode: import("./writer.js").ContentMode): () => import("./writer.js").ContentMode {
    const settings = new Map<string, string>([["request_log.content_mode", mode]]);
    return createContentModeResolver((k) => settings.get(k) ?? null);
  }

  it("structure 档:stats 入账 + 明细写 structure;off 档:只写 stats 不落明细", () => {
    const w = new RequestLogWriter(dir);

    const n = logRequests(makeRows(), {
      record: (d) => db.statsDaily.record({ ...d, logical_model: d.logical_model }),
      writer: w,
      getSetting: () => "1",
      getContentMode: withMode("structure"),
    });
    expect(n).toBe(1);
    expect(readdirSync(dir)).toEqual([`requests-20261015.jsonl`]);
    const line = JSON.parse(readFileSync(join(dir, "requests-20261015.jsonl"), "utf8").trim());
    expect(line.provider).toBe("p");
    expect(line.model).toBe("m");
    expect(line.content_mode).toBe("structure");
    expect(line.usage).toEqual({ prompt_tokens: 10, cached_tokens: 2, completion_tokens: 8 });
    expect(line.structure).toEqual({
      messages: [{ role: "user", chars: 2, keys: ["content", "role"] }],
      keys: ["messages"],
    });

    const rows = db.statsDaily.range("2026-10-15", "2026-10-15");
    expect(rows).toHaveLength(1);
    expect(rows[0].requests).toBe(1);
    expect(rows[0].ttft_requests).toBe(1);
    expect(rows[0].ttft_sum_ms).toBe(4);

    rmSync(dir, { recursive: true, force: true });
    mkdtempDir();
    const w2 = new RequestLogWriter(dir);
    const n2 = logRequests(makeRows(), {
      record: (d) => db.statsDaily.record({ ...d, logical_model: d.logical_model }),
      writer: w2,
      getSetting: () => "1",
      getContentMode: withMode("off"),
    });
    expect(n2).toBe(1);
    expect(readdirSync(dir)).toEqual([]);
    expect(db.statsDaily.range("2026-10-15", "2026-10-15")).toHaveLength(1);
    w.close();
    w2.close();
  });

  it("full 档写 payload,edges 档写 payload_edges", () => {
    for (const [mode, expects] of [
      // 短正文未超限时 _trim 返回原值(Nexus 语义:非 str 超短不转文本)
      ["full", (line: Record<string, unknown>) => expect(line.payload).toEqual({
        messages: [{ role: "user", content: "你好" }],
      })],
      ["edges", (line: Record<string, unknown>) => expect((line.payload_edges as { head: string }).head.length).toBeGreaterThan(0)],
    ] as const) {
      const w = new RequestLogWriter(dir);
      logRequests(makeRows(), {
        record: () => undefined,
        writer: w,
        getSetting: () => "1",
        getContentMode: withMode(mode),
      });
      const content = readFileSync(join(dir, "requests-20261015.jsonl"), "utf8").trim();
      expects(JSON.parse(content) as Record<string, unknown>);
      rmSync(dir, { recursive: true, force: true });
      mkdtempDir();
    }
  });

  it("失败的请求:不进统计,但明细照写(m11736)", () => {
    const w = new RequestLogWriter(dir);
    const n = logRequests(
      [
        {
          ts: new Date(2026, 9, 15, 12).getTime() / 1000,
          real_model_id: "p/m",
          logical_model: "flash",
          ok: false,
          status: 502,
          error: "上游连接失败",
          latency_ms: 12,
          request: { messages: [{ role: "user", content: "你好" }] },
        },
      ],
      {
        record: (d) => db.statsDaily.record({ ...d, logical_model: d.logical_model }),
        writer: w,
        getSetting: () => "1",
        getContentMode: withMode("structure"),
      },
    );
    expect(n).toBe(1);
    // 明细写下来了(排障要看的就是它)
    const lines = readFileSync(join(dir, "requests-20261015.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(line.provider).toBe("p");
    expect(line.ok).toBe(false);
    expect(line.error).toBe("上游连接失败");
    // 统计里没有它
    expect(db.statsDaily.range("2026-10-15", "2026-10-15")).toEqual([]);
    w.close();
  });

  it("空列表返回 0 且什么都不写;缺 provider/model 的行只写明细不进聚合", () => {
    const w = new RequestLogWriter(dir);
    expect(logRequests([], { record: () => undefined, writer: w, getSetting: () => "1" })).toBe(0);
    expect(readdirSync(dir)).toEqual([]);

    const n = logRequests(
      [
        { ts: new Date(2026, 9, 15, 12).getTime() / 1000, logical_model: "ghost", ok: true, status: 200, request: { a: 1 } },
      ],
      {
        record: (d) => db.statsDaily.record({ ...d, logical_model: d.logical_model }),
        writer: w,
        getSetting: () => "1",
        getContentMode: withMode("full"),
      },
    );
    expect(n).toBe(1);
    // 明细照写(带我们知道的 logical_model;provider/model 空)
    const lines = readFileSync(join(dir, "requests-20261015.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).logical_model).toBe("ghost");
    // 聚合无行(不伪造 provider/model)
    expect(db.statsDaily.range("2026-10-15", "2026-10-15")).toEqual([]);
    w.close();
  });
});

/** 重新建一个干净的临时目录(mkdtemp 保底重试一次)。 */
function mkdtempDir(): void {
  dir = mkdtempSync(join(tmpdir(), "as-one-reqlog-"));
}