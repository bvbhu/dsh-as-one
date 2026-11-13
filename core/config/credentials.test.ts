/**
 * credentials.ts 测试 —— 凭据读写 / 轮换 / 到期归一 / 文件后端 / 事件。
 *
 * 覆盖:
 * - 内存后端:put / get / list(无密钥)/ describe / secret(唯一明文出口) /
 *   secretsFor / 空用户名兜底 / remove;
 * - rotate:立即覆盖(Nexus 无宽限期)、refreshSecret 不在未提供时覆盖、
 *   raw 到期字段同步成毫秒、不存在时抛错;
 * - expiresAtOf:列优先 + 毫秒判定 + raw 回退键;
 * - needsRefresh:无 refresh token / 到期未知 / margin 边界;
 * - fingerprint:SHA-256 前 8 位;
 * - 文件后端:roundtrip / 外部热编辑(external 事件)/ 坏文件抛错 /
 *   写事件不重复;
 * - 只读后端:写操作抛 UnsupportedBackendOperation。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CredentialConfigError,
  CredentialVault,
  CredentialError,
  expiresAtOf,
  fingerprint,
  MemoryCredentialBackend,
  FileCredentialBackend,
  needsRefresh,
  UnsupportedBackendOperation,
  type CredentialBackend,
  type CredentialEvent,
  type StoredCredential,
} from "./credentials.js";
import { writeJsonFileAtomic } from "./store.js";
import { systemWallClock } from "./types.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "as-one-cred-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function stored(overrides: Partial<StoredCredential> = {}): StoredCredential {
  return {
    provider: "workbuddy",
    username: "user@example.com",
    secret: "token-1",
    refresh_secret: "refresh-1",
    expires_at: null,
    raw_json: { region: "cn", label: "ops" },
    ...overrides,
  };
}

// ===========================================================================
// 内存后端 + vault 读写
// ===========================================================================

describe("CredentialVault(内存后端)", () => {
  it("put → get 往返,字段完整", async () => {
    const backend = new MemoryCredentialBackend();
    const vault = new CredentialVault(backend);

    const cred = await vault.put({
      provider: "workbuddy",
      username: "user@example.com",
      secret: "token-1",
      refreshSecret: "refresh-1",
      expiresAt: 1_800_000_000,
      raw: { region: "cn" },
    });

    expect(cred.provider).toBe("workbuddy");
    expect(cred.username).toBe("user@example.com");
    expect(cred.secret).toBe("token-1");
    expect(cred.refreshSecret).toBe("refresh-1");
    expect(cred.expiresAt).toBe(1_800_000_000);
    expect(cred.raw).toEqual({ region: "cn" });

    const got = await vault.get("workbuddy", "user@example.com");
    expect(got).toEqual(cred);
  });

  it("空用户名兜底成 provider 名(repo.py L675)", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    const cred = await vault.put({ provider: "sensenova", username: "  ", secret: "t" });
    expect(cred.username).toBe("sensenova");

    const cred2 = await vault.put({ provider: "sensenova", secret: "t2" });
    expect(cred2.username).toBe("sensenova");
  });

  it("provider 缺失 → CredentialConfigError", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await expect(vault.put({ username: "u", secret: "t" })).rejects.toThrow(CredentialConfigError);
  });

  it("list 不含密钥,按 (provider, username) 排序(repo ORDER BY provider, username)", async () => {
    const backend = new MemoryCredentialBackend();
    const vault = new CredentialVault(backend);
    await vault.put({ provider: "workbuddy", username: "b@example.com", secret: "sb" });
    await vault.put({ provider: "workbuddy", username: "a@example.com", secret: "sa" });
    await vault.put({ provider: "trae", username: "t1", secret: "st" });

    const list = await vault.list();
    // "trae" < "workbuddy"(字典序),所以 trae 在前 —— 与 SQL ORDER BY 一致。
    expect(list.map((c) => c.key)).toEqual([
      "trae/t1",
      "workbuddy/a@example.com",
      "workbuddy/b@example.com",
    ]);
    // 摘要里绝不能有密钥。
    for (const c of list) {
      expect(c).not.toHaveProperty("secret");
      expect(c).not.toHaveProperty("refreshSecret");
    }
  });

  it("list(provider) 按 provider 过滤", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({ provider: "workbuddy", username: "u1", secret: "s1" });
    await vault.put({ provider: "trae", username: "u2", secret: "s2" });

    const list = await vault.list("trae");
    expect(list).toHaveLength(1);
    expect(list[0]!.key).toBe("trae/u2");
  });

  it("describe 返回无密钥摘要", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({ provider: "p", username: "u", secret: "s" });

    const summary = await vault.describe("p", "u");
    expect(summary).not.toBeNull();
    expect(summary!.key).toBe("p/u");
    expect(summary).not.toHaveProperty("secret");
  });

  it("secret 是唯一明文出口", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({ provider: "p", username: "u", secret: "top-secret" });

    expect(await vault.secret("p", "u")).toBe("top-secret");
    expect(await vault.secret("p", "nope")).toBeNull();
  });

  it("secretsFor 返回 {username: secret},跳过 null secret", async () => {
    const backend = new MemoryCredentialBackend();
    await backend.put(stored({ provider: "workbuddy", username: "a", secret: "sa" }));
    await backend.put(stored({ provider: "workbuddy", username: "b", secret: null }));
    const vault = new CredentialVault(backend);

    const map = await vault.secretsFor("workbuddy");
    expect([...map.entries()]).toEqual([["a", "sa"]]);
  });

  it("remove 删除并返回是否存在", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({ provider: "p", username: "u", secret: "s" });

    expect(await vault.remove("p", "u")).toBe(true);
    expect(await vault.get("p", "u")).toBeNull();
    expect(await vault.remove("p", "u")).toBe(false);
  });

  it("部分更新:undefined 保留原值,null 清空", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({ provider: "p", username: "u", secret: "s1", refreshSecret: "r1", expiresAt: 100 });

    const updated = await vault.put({ provider: "p", username: "u", secret: "s2" });
    expect(updated.secret).toBe("s2");
    expect(updated.refreshSecret).toBe("r1"); // 未给 → 保留
    expect(updated.expiresAt).toBe(100);

    const cleared = await vault.put({ provider: "p", username: "u", refreshSecret: null });
    expect(cleared.refreshSecret).toBeNull();
    expect(cleared.secret).toBe("s2");
  });
});

// ===========================================================================
// rotate(热轮换)
// ===========================================================================

describe("CredentialVault.rotate", () => {
  it("立即覆盖 secret(Nexus 无宽限期)", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({ provider: "p", username: "u", secret: "old" });

    const rotated = await vault.rotate("p", "u", { secret: "new" });
    expect(rotated.secret).toBe("new");
    expect(await vault.secret("p", "u")).toBe("new");
  });

  it("refreshSecret 未提供时不覆盖(credentials.py L267-268)", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({ provider: "p", username: "u", secret: "s", refreshSecret: "r1" });

    const rotated = await vault.rotate("p", "u", { secret: "s2" });
    expect(rotated.refreshSecret).toBe("r1");
  });

  it("expiresAt 给了就覆盖,并同步 raw 里的到期字段成毫秒(credentials.py L293-298)", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({
      provider: "p",
      username: "u",
      secret: "s",
      expiresAt: 100,
      raw: { token_expires_at_ms: 100_000, label: "x" },
    });

    const rotated = await vault.rotate("p", "u", { secret: "s2", expiresAt: 200 });
    expect(rotated.expiresAt).toBe(200);
    expect(rotated.raw.token_expires_at_ms).toBe(200_000); // 毫秒口径
    expect(rotated.raw.label).toBe("x"); // 其他字段不动
  });

  it("raw 里没有到期字段时不新增", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await vault.put({ provider: "p", username: "u", secret: "s", expiresAt: 100, raw: { label: "x" } });

    const rotated = await vault.rotate("p", "u", { expiresAt: 200 });
    expect(rotated.raw).toEqual({ label: "x" });
  });

  it("轮换不存在的凭据 → CredentialConfigError", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    await expect(vault.rotate("p", "nope", { secret: "x" })).rejects.toThrow(CredentialConfigError);
  });
});

// ===========================================================================
// 到期归一(credentials.py L148-182)
// ===========================================================================

describe("expiresAtOf", () => {
  it("列是秒 → 原样返回", () => {
    expect(expiresAtOf({ expiresAt: 1_800_000_000, raw: {} })).toBe(1_800_000_000);
  });

  it("列是毫秒(>= 1e11)→ 折成秒", () => {
    expect(expiresAtOf({ expiresAt: 1_800_000_000_000, raw: {} })).toBe(1_800_000_000);
  });

  it("列缺失 → 回退 raw.token_expires_at_ms(毫秒)", () => {
    expect(expiresAtOf({ expiresAt: null, raw: { token_expires_at_ms: 1_800_000_000_000 } })).toBe(
      1_800_000_000,
    );
  });

  it("列缺失且 raw 只有 expires_at → 回退它", () => {
    expect(expiresAtOf({ expiresAt: null, raw: { expires_at: 1_800_000_000 } })).toBe(1_800_000_000);
  });

  it("列优先于 raw(credentials.py L152-157:反过来会在刷新后给错答案)", () => {
    expect(
      expiresAtOf({ expiresAt: 1_900_000_000, raw: { token_expires_at_ms: 1_000_000_000_000 } }),
    ).toBe(1_900_000_000);
  });

  it("列与 raw 都缺失 → null", () => {
    expect(expiresAtOf({ expiresAt: null, raw: {} })).toBeNull();
  });

  it("0 / 负数 → null(没有到期)", () => {
    expect(expiresAtOf({ expiresAt: 0, raw: {} })).toBeNull();
    expect(expiresAtOf({ expiresAt: -5, raw: {} })).toBeNull();
  });
});

// ===========================================================================
// needsRefresh(credentials.py L185-199)
// ===========================================================================

describe("needsRefresh", () => {
  const now = 1_000_000;

  it("没有 refresh token → false(没得刷)", () => {
    expect(needsRefresh({ provider: "p", username: "u", secret: "s", refreshSecret: null, expiresAt: null, raw: {} }, { now })).toBe(false);
    expect(needsRefresh({ provider: "p", username: "u", secret: "s", refreshSecret: "", expiresAt: null, raw: {} }, { now })).toBe(false);
  });

  it("到期未知 → true(该刷没刷会让账号失效)", () => {
    expect(needsRefresh({ provider: "p", username: "u", secret: "s", refreshSecret: "r", expiresAt: null, raw: {} }, { now })).toBe(true);
  });

  it("未到期 → false", () => {
    expect(needsRefresh({ provider: "p", username: "u", secret: "s", refreshSecret: "r", expiresAt: now + 3600, raw: {} }, { now })).toBe(false);
  });

  it("到期边界:expires - margin <= now → true", () => {
    // margin 缺省 300:now + 300 恰好到期 → 该刷。
    expect(needsRefresh({ provider: "p", username: "u", secret: "s", refreshSecret: "r", expiresAt: now + 300, raw: {} }, { now })).toBe(true);
    expect(needsRefresh({ provider: "p", username: "u", secret: "s", refreshSecret: "r", expiresAt: now + 301, raw: {} }, { now })).toBe(false);
  });

  it("自定义 margin 生效", () => {
    expect(needsRefresh({ provider: "p", username: "u", secret: "s", refreshSecret: "r", expiresAt: now + 60, raw: {} }, { now, marginSeconds: 120 })).toBe(true);
  });
});

// ===========================================================================
// fingerprint(credentials.py L228-238)
// ===========================================================================

describe("fingerprint", () => {
  it("SHA-256 前 8 位十六进制,稳定", () => {
    const a = fingerprint("token-abc");
    const b = fingerprint("token-abc");
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(a).toBe(b);
  });

  it("空值 → null", () => {
    expect(fingerprint(null)).toBeNull();
    expect(fingerprint("")).toBeNull();
    expect(fingerprint(undefined)).toBeNull();
  });
});

// ===========================================================================
// 事件
// ===========================================================================

describe("CredentialVault 事件", () => {
  it("put / rotate / remove 各发射对应类型的事件", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    const events: CredentialEvent[] = [];
    vault.onChange((e) => events.push(...e));

    await vault.put({ provider: "p", username: "u", secret: "s" });
    await vault.rotate("p", "u", { secret: "s2" });
    await vault.remove("p", "u");

    expect(events.map((e) => e.type)).toEqual(["put", "rotate", "remove"]);
  });

  it("事件携带 (provider, username)", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    const events: CredentialEvent[] = [];
    vault.onChange((e) => events.push(...e));

    await vault.put({ provider: "workbuddy", username: "u", secret: "s" });
    expect(events[0]).toMatchObject({ type: "put", provider: "workbuddy", username: "u" });
  });
});

// ===========================================================================
// 文件后端(阶段一)
// ===========================================================================

describe("FileCredentialBackend", () => {
  function credFile(path: string, rows: StoredCredential[]): void {
    writeJsonFileAtomic(path, { version: 1, credentials: rows });
  }

  it("初始加载:文件不存在 → 空库", async () => {
    const backend = new FileCredentialBackend(join(dir, "creds.json"));
    expect(await backend.list()).toEqual([]);
    backend.close();
  });

  it("put → 文件落盘 → 新后端实例能读到(跨进程持久化)", async () => {
    const path = join(dir, "creds.json");
    const backend = new FileCredentialBackend(path);
    await backend.put(stored({ secret: "s1" }));

    const reopened = new FileCredentialBackend(path);
    const rows = await reopened.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.secret).toBe("s1");

    backend.close();
    reopened.close();
  });

  it("坏 JSON → CredentialConfigError(凭据文件坏了必须出声)", async () => {
    const path = join(dir, "creds.json");
    writeFileSync(path, '{"credentials": [', "utf8");

    const backend = new FileCredentialBackend(path);
    try {
      await expect(backend.list()).rejects.toThrow(CredentialConfigError);
    } finally {
      backend.close();
    }
  });

  it("外部进程改文件 → external 事件 + 新内容可见(跨进程热轮换)", async () => {
    const path = join(dir, "creds.json");
    credFile(path, [stored({ username: "a", secret: "old" })]);

    const backend = new FileCredentialBackend(path);
    const events: CredentialEvent[] = [];
    backend.onChange((e) => events.push(...e));
    try {
      await backend.list(); // 确保加载完成 + watch 已启动,再模拟外部写入

      // 模拟另一个进程(面板 / 另一台机器同步盘)改了文件。
      credFile(path, [stored({ username: "a", secret: "new" })]);

      await vi.waitFor(() => expect(events.some((e) => e.type === "external")).toBe(true), { timeout: 3000 });

      const rows = await backend.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.secret).toBe("new");
    } finally {
      backend.close();
    }
  });

  it("外部删除某条凭据 → external 事件标记删除", async () => {
    const path = join(dir, "creds.json");
    credFile(path, [stored({ username: "a", secret: "s" }), stored({ username: "b", secret: "s2" })]);

    const backend = new FileCredentialBackend(path);
    const events: CredentialEvent[] = [];
    backend.onChange((e) => events.push(...e));
    try {
      await backend.list(); // 先确保 watch 已启动
      credFile(path, [stored({ username: "b", secret: "s2" })]); // a 被删

      await vi.waitFor(() => expect(events.some((e) => e.username === "a")).toBe(true), { timeout: 3000 });
      const rows = await backend.list();
      expect(rows.map((r) => r.username)).toEqual(["b"]);
    } finally {
      backend.close();
    }
  });

  it("本进程写入不重复发射外部事件(diff 为空)", async () => {
    const path = join(dir, "creds.json");
    const backend = new FileCredentialBackend(path);
    const events: CredentialEvent[] = [];
    backend.onChange((e) => events.push(...e));
    try {
      await backend.put(stored({ secret: "s1" }));
      await new Promise((r) => setTimeout(r, 400)); // 等 watch 防抖窗口过去

      expect(events.filter((e) => e.type === "external")).toEqual([]);
    } finally {
      backend.close();
    }
  });

  it("非法凭据行(缺 provider)→ 跳过,不影响其他行", async () => {
    const path = join(dir, "creds.json");
    writeJsonFileAtomic(path, {
      version: 1,
      credentials: [
        stored({ username: "good", secret: "s" }),
        { username: "bad", secret: "x" } as unknown as StoredCredential, // 缺 provider
      ],
    });

    const backend = new FileCredentialBackend(path);
    try {
      const rows = await backend.list();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.username).toBe("good");
    } finally {
      backend.close();
    }
  });
});

// ===========================================================================
// 只读后端(阶段二 DSH 形态的本地替身)
// ===========================================================================

describe("只读后端", () => {
  it("put / rotate / remove → UnsupportedBackendOperation", async () => {
    const readOnly: CredentialBackend = {
      name: "dsh-stub",
      writable: false,
      async list() {
        return [stored()];
      },
      async get() {
        return stored();
      },
      async put() {
        throw new UnsupportedBackendOperation("put");
      },
      async remove() {
        throw new UnsupportedBackendOperation("remove");
      },
    };
    const vault = new CredentialVault(readOnly);

    await expect(vault.put({ provider: "p", username: "u", secret: "s" })).rejects.toThrow(
      UnsupportedBackendOperation,
    );
    await expect(vault.rotate("p", "u", { secret: "s" })).rejects.toThrow(UnsupportedBackendOperation);
    await expect(vault.remove("p", "u")).rejects.toThrow(UnsupportedBackendOperation);
    // 读路径不受影响。
    expect(await vault.secret("p", "u")).toBe("token-1");
  });

  it("UnsupportedBackendOperation 是 CredentialError 的子类", () => {
    expect(new UnsupportedBackendOperation("put")).toBeInstanceOf(CredentialError);
  });
});

// ===========================================================================
// 其他
// ===========================================================================

describe("CredentialVault 杂项", () => {
  it("close() 幂等,停止文件 watch", async () => {
    const path = join(dir, "creds.json");
    const backend = new FileCredentialBackend(path);
    const vault = new CredentialVault(backend);

    vault.close();
    vault.close(); // 不抛
  });

  it("系统墙钟与注入时钟:shouldRefresh 用注入 now", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend(), { clock: () => systemWallClock() });
    await vault.put({ provider: "p", username: "u", secret: "s", refreshSecret: "r", expiresAt: null });

    // 到期未知 → 该刷。
    expect(await vault.shouldRefresh("p", "u")).toBe(true);
  });

  it("describe 对不存在的凭据 → null", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend());
    expect(await vault.describe("p", "nope")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// raw_json 的两种形态(2026-10-21:SenseNova 积分池恒报「没有控制台令牌」)
// ---------------------------------------------------------------------------

describe("raw_json 形态兼容", () => {
  /**
   * ⚠️ 凭据文件里 `raw_json` 是 **JSON 字符串**(`"{\"console_jwt\": \"…\"}"`),
   * Nexus 的 DB 列也是 TEXT(`credentials.py:_load_json` 走 `json.loads`)。
   * 以前 As One 的读侧只认**对象**,于是文件里那串字符串一律被当成「不是对象」
   * → `cred.raw` 恒为 `{}` → `raw.console_jwt` 读不到 → SenseNova 刷新恒报
   * 「没有控制台令牌」(而令牌确实在文件里);trae / workbuddy 账号行的
   * uid / region 也全是空的。
   */
  it("字符串形态 → 解析出对象(旧文件)", async () => {
    const path = join(dir, "creds.json");
    writeJsonFileAtomic(path, {
      version: 1,
      credentials: [
        {
          provider: "sensenova",
          username: "buhhuv",
          secret: "k",
          refresh_secret: "p",
          expires_at: null,
          raw_json: JSON.stringify({ console_jwt: "eyJhbGciOiJSUzI1NiJ9" }),
        },
      ],
    });
    const vault = new CredentialVault(new FileCredentialBackend(path));
    const cred = await vault.get("sensenova", "buhhuv");
    expect(cred?.raw?.console_jwt).toBe("eyJhbGciOiJSUzI1NiJ9");
    vault.close();
  });

  it("对象形态 → 同样读得出(内存后端 / 旧版写出的行)", async () => {
    const backend = new MemoryCredentialBackend([
      {
        provider: "sensenova",
        username: "buhhuv",
        secret: "k",
        refresh_secret: "p",
        expires_at: null,
        raw_json: { console_jwt: "eyJhbGciOiJSUzI1NiJ9" },
      },
    ]);
    const vault = new CredentialVault(backend);
    const cred = await vault.get("sensenova", "buhhuv");
    expect(cred?.raw?.console_jwt).toBe("eyJhbGciOiJSUzI1NiJ9");
  });

  it("坏 JSON 字符串 → 空对象(不炸整份文件)", async () => {
    const backend = new MemoryCredentialBackend([
      {
        provider: "sensenova",
        username: "buhhuv",
        secret: "k",
        refresh_secret: "p",
        expires_at: null,
        raw_json: "{半截 JSON",
      },
    ]);
    const vault = new CredentialVault(backend);
    const cred = await vault.get("sensenova", "buhhuv");
    expect(cred?.raw).toEqual({});
    expect(cred?.secret).toBe("k"); // 其余字段不受影响
  });

  it("写出的文件里 raw_json 是 JSON 字符串(与 Nexus 列语义一致)", async () => {
    const path = join(dir, "creds.json");
    const vault = new CredentialVault(new FileCredentialBackend(path));
    await vault.put({
      provider: "sensenova",
      username: "buhhuv",
      raw: { console_jwt: "eyJ" },
    });
    vault.close();

    const text = readFileSync(path, "utf-8");
    const doc = JSON.parse(text) as { credentials: Array<{ raw_json: unknown }> };
    expect(typeof doc.credentials[0]!.raw_json).toBe("string");
    // 且读回来仍是同一个对象(往返一致)。
    const vault2 = new CredentialVault(new FileCredentialBackend(path));
    expect((await vault2.get("sensenova", "buhhuv"))?.raw?.console_jwt).toBe("eyJ");
    vault2.close();
  });

  it("put 只带 raw 时保留 refreshSecret(两个写入路径不互相抹掉)", async () => {
    const vault = new CredentialVault(new MemoryCredentialBackend([]));
    await vault.put({ provider: "sensenova", username: "u", refreshSecret: "pw" });
    await vault.put({ provider: "sensenova", username: "u", raw: { console_jwt: "eyJ" } });
    const cred = await vault.get("sensenova", "u");
    expect(cred?.refreshSecret).toBe("pw");
    expect(cred?.raw?.console_jwt).toBe("eyJ");
  });
});
