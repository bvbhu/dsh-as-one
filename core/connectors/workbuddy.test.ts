/**
 * WorkBuddy 连接器测试 —— X-Refresh-Token + expiresIn 秒。
 *
 * 禁止真实网络/真实子进程。
 */

import { describe, it, expect } from "vitest";
import {
  WorkbuddyAdapter,
  build_chat_headers,
  build_refresh_headers,
  parse_refresh_response,
  detect_region_from_token,
  normalize_identity,
  normalize_region,
  classify_workbuddy_error,
  jwt_claim,
  jwtClaimNumber,
  new_request_id_hex,
  REGION_BASES,
} from "./workbuddy.js";
import { UpstreamError } from "./types.js";

// ---------------------------------------------------------------------------
// 区域
// ---------------------------------------------------------------------------

describe("normalize_region", () => {
  it("cn → cn", () => {
    expect(normalize_region("cn")).toBe("cn");
  });

  it("intl → global", () => {
    expect(normalize_region("intl")).toBe("global");
  });

  it("未知 → global", () => {
    expect(normalize_region("unknown")).toBe("global");
  });
});

describe("detect_region_from_token", () => {
  it("copilot.tencent.com → cn", () => {
    // 构造一个 iss 包含 copilot.tencent.com 的 JWT
    const payload = btoa(JSON.stringify({ iss: "https://copilot.tencent.com/auth" }));
    const token = `header.${payload}.signature`;
    expect(detect_region_from_token(token)).toBe("cn");
  });

  it("workbuddy.cn → cn", () => {
    const payload = btoa(JSON.stringify({ iss: "https://www.workbuddy.cn/auth/realms/copilot" }));
    const token = `header.${payload}.signature`;
    expect(detect_region_from_token(token)).toBe("cn");
  });

  it("其他 → global", () => {
    const payload = btoa(JSON.stringify({ iss: "https://www.workbuddy.ai/auth" }));
    const token = `header.${payload}.signature`;
    expect(detect_region_from_token(token)).toBe("global");
  });
});

// ---------------------------------------------------------------------------
// JWT 工具
// ---------------------------------------------------------------------------

describe("jwt_claim", () => {
  it("提取 sub", () => {
    const payload = btoa(JSON.stringify({ sub: "user-123", iss: "test" }));
    const token = `header.${payload}.signature`;
    expect(jwt_claim(token, "sub")).toBe("user-123");
  });

  it("不存在的 claim → 空字符串", () => {
    const payload = btoa(JSON.stringify({ sub: "user-123" }));
    const token = `header.${payload}.signature`;
    expect(jwt_claim(token, "iss")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 请求头
// ---------------------------------------------------------------------------

describe("build_chat_headers", () => {
  it("Authorization 是 Bearer", () => {
    const headers = build_chat_headers("my-token", "cn");
    expect(headers["Authorization"]).toBe("Bearer my-token");
  });

  it("包含 X-IDE-Name", () => {
    const headers = build_chat_headers("my-token", "cn");
    expect(headers["X-IDE-Name"]).toBe("WorkBuddy");
  });

  it("cn 版本 5.8.3", () => {
    const headers = build_chat_headers("my-token", "cn");
    expect(headers["X-IDE-Version"]).toBe("5.8.3");
  });

  it("global 版本 5.9.4（2026-11-08 按 hub 5.9.4 实测更新）", () => {
    const headers = build_chat_headers("my-token", "global");
    expect(headers["X-IDE-Version"]).toBe("5.9.4");
  });

  it("cn UA 为 WorkBuddy/5.8.3", () => {
    const headers = build_chat_headers("my-token", "cn");
    expect(headers["User-Agent"]).toBe("WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0");
  });

  it("global UA 为 WorkBuddy/5.9.4 workbuddy-ai", () => {
    const headers = build_chat_headers("my-token", "global");
    expect(headers["User-Agent"]).toBe("WorkBuddy/5.9.4 workbuddy-ai/5.9.4 CLI/2.165.0");
  });

  it("X-Product 是 SaaS（官方主对话形态）", () => {
    const headers = build_chat_headers("my-token", "cn");
    expect(headers["X-Product"]).toBe("SaaS");
  });

  it("带 X-Agent-Intent / X-Agent-Type 官方身份头", () => {
    const headers = build_chat_headers("my-token", "cn");
    expect(headers["X-Agent-Intent"]).toBe("craft");
    expect(headers["X-Agent-Type"]).toBe("main");
    expect(headers["X-Agent-Purpose"]).toBe("conversation");
  });

  it("带 X-Conversation-* 会话头族", () => {
    const headers = build_chat_headers("my-token", "cn", "user-123");
    expect(headers["X-Conversation-ID"]).toBeDefined();
    expect(headers["X-Conversation-Request-ID"]).toBeDefined();
    expect(headers["X-Root-Request-ID"]).toBe(headers["X-Conversation-Request-ID"]);
    expect(headers["X-Conversation-Message-ID"]).toBeDefined();
  });

  it("X-Conversation-ID 是**带连字符**的 UUID（官方 str(uuid7()) 形态）", () => {
    const headers = build_chat_headers("my-token", "cn", "user-123");
    expect(headers["X-Conversation-ID"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("X-Request-ID 是 32 位无连字符 hex（官方 uuidv7().hex 形态，非 uid 派生）", () => {
    const headers = build_chat_headers("my-token", "cn", "user-123");
    // ⚠️ 2026-11-08 修正:之前是 36 位带连字符的 randomUUID,与 5.8.4 抓包不符。
    expect(headers["X-Request-ID"]).toMatch(/^[0-9a-f]{32}$/);
    expect(headers["X-Request-ID"]).not.toContain("-");
  });

  it("三个请求/消息 id 都是 32hex,且 X-Request-ID = X-Conversation-Message-ID", () => {
    const headers = build_chat_headers("my-token", "cn", "user-123");
    for (const key of [
      "X-Request-ID",
      "X-Conversation-Message-ID",
      "X-Conversation-Request-ID",
      "X-Root-Request-ID",
    ]) {
      expect(headers[key]).toMatch(/^[0-9a-f]{32}$/);
    }
    // ⚠️ 桌面端语义:官方 `X-Request-ID` 取的是**消息 id**(hub 桌面分支原文
    // `"X-Request-ID": msg_id`),不是本轮 request id(那是 VSCode 身份的做法)。
    expect(headers["X-Request-ID"]).toBe(headers["X-Conversation-Message-ID"]);
    // 本轮 request id 与消息 id 是两个不同的值
    expect(headers["X-Conversation-Request-ID"]).not.toBe(headers["X-Request-ID"]);
  });

  it("两次调用的 id 都不同（每请求现生成,不恒定）", () => {
    const a = build_chat_headers("my-token", "cn", "user-123");
    const b = build_chat_headers("my-token", "cn", "user-123");
    expect(a["X-Request-ID"]).not.toBe(b["X-Request-ID"]);
    expect(a["X-Conversation-Request-ID"]).not.toBe(b["X-Conversation-Request-ID"]);
  });

  it("对话请求不带 X-Machine-ID（官方聊天只剩反馈上报用）", () => {
    const headers = build_chat_headers("my-token", "cn", "user-123");
    expect(headers["X-Machine-ID"]).toBeUndefined();
    expect(headers["X-Session-ID"]).toBeUndefined();
  });

  it("对话请求不带 X-No-Enterprise-Id（hub 只在 billing/media 分支补它）", () => {
    const headers = build_chat_headers("my-token", "cn", "user-123");
    expect(headers["X-No-Enterprise-Id"]).toBeUndefined();
  });

  it("包含 X-Enterprise-Id", () => {
    const headers = build_chat_headers("my-token", "cn", "user-123", undefined, "ent-1");
    expect(headers["X-Enterprise-Id"]).toBe("ent-1");
  });
});

describe("build_chat_headers · CLI 身份（可选形态，默认桌面端）", () => {
  const cli = (): Record<string, string> =>
    build_chat_headers("my-token", "global", "user-1", undefined, undefined, "cli");

  it("X-IDE-Name/Type 为 CLI,X-IDE-Version 2.168.2,UA 两段式", () => {
    const headers = cli();
    expect(headers["X-IDE-Name"]).toBe("CLI");
    expect(headers["X-IDE-Type"]).toBe("CLI");
    expect(headers["X-IDE-Version"]).toBe("2.168.2");
    expect(headers["User-Agent"]).toBe("CLI/2.168.2 CodeBuddy/2.168.2");
  });

  it("不带任何浏览器头（Origin/Referer/X-Requested-With/X-CodeBuddy-Request/Accept-Language）", () => {
    const headers = cli();
    for (const key of [
      "Origin",
      "Referer",
      "X-Requested-With",
      "X-CodeBuddy-Request",
      "Accept-Language",
    ]) {
      expect(headers[key]).toBeUndefined();
    }
    expect(headers["Accept"]).toBe("application/json");
  });

  it("带 X-Agent-Runtime: other（官方 CLI 的取值）", () => {
    expect(cli()["X-Agent-Runtime"]).toBe("other");
  });

  it("id 形态与桌面端一致(32hex / Conversation-ID 带连字符)", () => {
    const headers = cli();
    expect(headers["X-Request-ID"]).toMatch(/^[0-9a-f]{32}$/);
    expect(headers["X-Conversation-ID"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("未知/缺省身份一律回落桌面端(normalize_identity)", () => {
    expect(normalize_identity(undefined)).toBe("desktop");
    expect(normalize_identity("")).toBe("desktop");
    expect(normalize_identity("vscode")).toBe("desktop");
    expect(normalize_identity("CLI")).toBe("cli");
    expect(build_chat_headers("t", "cn")["X-IDE-Name"]).toBe("WorkBuddy");
  });
});

describe("new_request_id_hex", () => {
  it("32 位小写 hex,前 12 位是毫秒时间戳(时间有序)", () => {
    const nowMs = 1_700_000_000_123;
    const id = new_request_id_hex(nowMs);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id.slice(0, 12)).toBe(nowMs.toString(16).padStart(12, "0"));
  });

  it("每次不同,且不同毫秒前缀不同", () => {
    expect(new_request_id_hex(1)).not.toBe(new_request_id_hex(1));
    expect(new_request_id_hex(1).slice(0, 12)).not.toBe(new_request_id_hex(2).slice(0, 12));
  });

  it("超过 32 位的时间戳不会被位运算截断(曾经的 bug)", () => {
    const nowMs = 1_700_000_000_000;
    expect(new_request_id_hex(nowMs).slice(0, 12)).toBe(
      (nowMs % 2 ** 48).toString(16).padStart(12, "0"),
    );
  });
});

// ---------------------------------------------------------------------------
// 刷新
// ---------------------------------------------------------------------------

describe("build_refresh_headers", () => {
  it("包含 X-Refresh-Token", () => {
    const headers = build_refresh_headers("refresh-123");
    expect(headers["X-Refresh-Token"]).toBe("refresh-123");
  });

  it("cn 刷新源 workbuddy", () => {
    const headers = build_refresh_headers("refresh-123", "cn");
    expect(headers["X-Auth-Refresh-Source"]).toBe("workbuddy");
  });

  it("global 刷新源 plugin", () => {
    const headers = build_refresh_headers("refresh-123", "global");
    expect(headers["X-Auth-Refresh-Source"]).toBe("plugin");
  });

  it("不包含 Authorization", () => {
    const headers = build_refresh_headers("refresh-123");
    expect(headers["Authorization"]).toBeUndefined();
  });
});

describe("jwtClaimNumber", () => {
  it("提取 exp", () => {
    const payload = btoa(JSON.stringify({ exp: 1700000000 }));
    const token = `header.${payload}.signature`;
    expect(jwtClaimNumber(token, "exp")).toBe(1700000000);
  });

  it("无 exp → undefined", () => {
    const payload = btoa(JSON.stringify({ sub: "u" }));
    const token = `header.${payload}.signature`;
    expect(jwtClaimNumber(token, "exp")).toBeUndefined();
  });
});

describe("parse_refresh_response — JWT exp 优先", () => {
  it("accessToken 带 exp 时以 exp 为准", () => {
    const exp = Math.floor(Date.now() / 1000) + 4000;
    const payload = Buffer.from(JSON.stringify({ exp }))
      .toString("base64url");
    const body = {
      code: 0,
      data: {
        accessToken: `header.${payload}.signature`,
        expiresIn: 3600,
        refreshToken: "r",
      },
    };
    const token = parse_refresh_response(body);
    expect(token.expiresAt).toBe(exp);
    expect(token.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3900);
  });
});

describe("parse_refresh_response", () => {
  it("正常解析", () => {
    const body = {
      code: 0,
      data: {
        accessToken: "new-token",
        expiresIn: 3600,
        refreshToken: "new-refresh",
      },
    };
    const token = parse_refresh_response(body);
    expect(token.accessToken).toBe("new-token");
    expect(token.refreshToken).toBe("new-refresh");
    // expiresAt 应该是当前时间 + 3600 秒
    const now = Math.floor(Date.now() / 1000);
    expect(token.expiresAt).toBeGreaterThanOrEqual(now + 3599);
    expect(token.expiresAt).toBeLessThanOrEqual(now + 3601);
  });

  it("code 非 0 抛错", () => {
    const body = { code: 1, message: "invalid" };
    expect(() => parse_refresh_response(body)).toThrow(UpstreamError);
  });

  it("缺少 data 抛错", () => {
    const body = { code: 0 };
    expect(() => parse_refresh_response(body)).toThrow(UpstreamError);
  });
});

// ---------------------------------------------------------------------------
// 错误分类
// ---------------------------------------------------------------------------

describe("classify_workbuddy_error", () => {
  it("401 → auth", () => {
    const err = classify_workbuddy_error(401, {});
    expect(err.kind).toBe("auth");
    expect(err.retryable).toBe(false);
  });

  it("429 → rate_limit", () => {
    const err = classify_workbuddy_error(429, {});
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("429 + 将在 <时刻> 重置 → retryAfter 遵守上游绝对时刻", () => {
    // 构造一个「距现在约 2 小时」的重置时刻:先定绝对目标,再算 UTC+8 墙钟时间
    // 拼成「YYYY-MM-DD HH:MM:SS UTC+8」,解析回来正好等于目标。
    const target = Date.now() + 2 * 60 * 60 * 1000;
    const wall8 = new Date(target + 8 * 60 * 60 * 1000); // UTC+8 下的墙钟
    const pad = (n: number): string => String(n).padStart(2, "0");
    const iso = `${wall8.getUTCFullYear()}-${pad(wall8.getUTCMonth() + 1)}-${pad(wall8.getUTCDate())} ${pad(wall8.getUTCHours())}:${pad(wall8.getUTCMinutes())}:${pad(wall8.getUTCSeconds())} UTC+8`;
    const err = classify_workbuddy_error(429, {
      code: 6004,
      msg: `您的使用量已超出频率限制,将在 ${iso} 重置,您也可以切换其他模型继续使用。`,
    });
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
    expect(err.retryAfter).toBeDefined();
    expect(err.retryAfter!).toBeGreaterThan(60 * 60); // > 1h
    expect(err.retryAfter!).toBeLessThan(3 * 60 * 60); // < 3h
  });

  it("429 + 重置时刻在过去 → retryAfter 为 0(不再额外等待)", () => {
    const err = classify_workbuddy_error(429, {
      code: 6004,
      msg: "使用量已超出频率限制,将在 2020-01-01 00:00:00 UTC+8 重置。",
    });
    expect(err.kind).toBe("rate_limit");
    expect(err.retryAfter).toBe(0);
  });

  it("429 + 无重置时间文本 → retryAfter 缺失(走固定冷却)", () => {
    const err = classify_workbuddy_error(429, { code: 6004, msg: "请求过于频繁" });
    expect(err.kind).toBe("rate_limit");
    expect(err.retryAfter).toBeUndefined();
  });

  it("500 → upstream", () => {
    const err = classify_workbuddy_error(500, {});
    expect(err.kind).toBe("upstream");
    expect(err.retryable).toBe(true);
  });

  it("400 → bad_request", () => {
    const err = classify_workbuddy_error(400, {});
    expect(err.kind).toBe("bad_request");
    expect(err.retryable).toBe(false);
  });

  it("400 + code 11128 → bad_request,message 带 code(渠道校验,供网关归一化)", () => {
    const err = classify_workbuddy_error(400, {
      code: 11128,
      msg: "request illegal",
      displayMsg: { en: "not an official client", zh: "不是官方客户端" },
    });
    expect(err.kind).toBe("bad_request");
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("11128");
    expect(err.message).toContain("不是官方客户端");
  });

  it("400 + code 11140 → auth,message 带 code(账号级封禁,无法绕过)", () => {
    const err = classify_workbuddy_error(400, {
      code: 11140,
      displayMsg: { zh: "账号存在异常行为,已被限制使用" },
    });
    expect(err.kind).toBe("auth");
    expect(err.retryable).toBe(false);
    expect(err.message).toContain("11140");
    expect(err.message).toContain("异常行为");
  });

  it("code 为字符串数字也识别", () => {
    const err = classify_workbuddy_error(400, { code: "11128" });
    expect(err.message).toContain("11128");
  });
});

// ---------------------------------------------------------------------------
// WorkbuddyAdapter
// ---------------------------------------------------------------------------

describe("WorkbuddyAdapter", () => {
  it("vendorId 是 workbuddy", () => {
    const adapter = new WorkbuddyAdapter();
    expect(adapter.vendorId).toBe("workbuddy");
  });

  it("getToken 返回 api_key 作为 accessToken", async () => {
    const adapter = new WorkbuddyAdapter();
    const token = await adapter.getToken({ apiKey: "my-api-key" });
    expect(token.accessToken).toBe("my-api-key");
  });

  it("getToken 缺少 api_key 抛错", async () => {
    const adapter = new WorkbuddyAdapter();
    await expect(adapter.getToken({})).rejects.toThrow(UpstreamError);
  });

  it("decorateRequest 注入 Bearer <_REDACTED>", () => {
    const adapter = new WorkbuddyAdapter();
    const decorated = adapter.decorateRequest(
      { headers: {} },
      { accessToken: "my-token", expiresAt: Number.POSITIVE_INFINITY },
    );
    expect(decorated.headers["Authorization"]).toBe("Bearer my-token");
  });

  it("classifyError 401 → auth", () => {
    const adapter = new WorkbuddyAdapter();
    const err = adapter.classifyError(401, {});
    expect(err.kind).toBe("auth");
  });
});
