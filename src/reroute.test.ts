/**
 * 重路由设置的单测。
 *
 * 这里钉死三件事,少一件都会让「默认没有重路由」这个定案悄悄失效:
 * 1. **没配 = 不重路由** —— 同一个 `purpose` 在没有设置时,模型 / 会话号 / 工具
 *    必须与客户端给的**逐字相同**(以前是写死 `free` 的,回归即变红);
 * 2. 配了之后,辅助请求要换模型、隔离会话号、丢掉工具、图片只留可寻址占位;
 * 3. 配了但库里没有这个模型 → **整体回落**成不重路由(不能出现"会话号换了、
 *    模型没换"的半个重路由)。
 */

import { describe, expect, it } from "vitest";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  Upstream,
  UpstreamRequest,
} from "@as-one/core/src/gateway/types.js";
import type { AsOneRuntime } from "../src/setup.js";
import { AsOneLlmAdapter } from "../src/llm-adapter.js";
import { normalizeReroutes, rerouteCount, rerouteModel } from "../src/reroute.js";
import type { DshGenerateOptions, DshStreamChunk } from "../src/llm-types.js";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

function chunkOf(text: string): ChatCompletionChunk {
  return {
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "m",
    choices: [{ index: 0, delta: { content: text }, finish_reason: "stop" }],
  } as unknown as ChatCompletionChunk;
}

function completionOf(text: string): ChatCompletion {
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    created: 1,
    model: "m",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
  } as unknown as ChatCompletion;
}

function fixture() {
  const captured: { stream: UpstreamRequest[]; complete: UpstreamRequest[] } = {
    stream: [],
    complete: [],
  };
  const upstream: Upstream = {
    stream(req) {
      captured.stream.push(req);
      return (async function* () {
        yield chunkOf("ok");
      })();
    },
    complete: async (req) => {
      captured.complete.push(req);
      return completionOf("SUMMARY");
    },
  };
  const rt = {
    listModels: async () => [],
    resolveUpstream: (model: string) => (model === "auto" || model === "free" ? upstream : undefined),
    onRequestDone: () => {},
  } as unknown as AsOneRuntime;
  const adapter = (routes?: Record<string, string>) =>
    new AsOneLlmAdapter(rt, routes ? { routes } : undefined);
  return { adapter, captured };
}

async function drain(source: AsyncIterable<DshStreamChunk>): Promise<DshStreamChunk[]> {
  const out: DshStreamChunk[] = [];
  for await (const chunk of source) out.push(chunk);
  return out;
}

/** 一条带图、带工具、带会话号的请求 —— 三个维度都可被重路由改掉。 */
function options(purpose?: string): DshGenerateOptions {
  return {
    provider: "as-one",
    model: "auto",
    sessionId: "s1",
    purpose,
    tools: [{ name: "read_image" }],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "这是什么" },
          { type: "image", attachment: { attachmentId: "att-1", name: "a.png" } },
        ],
      },
    ],
  } as unknown as DshGenerateOptions;
}

// ---------------------------------------------------------------------------
// 设置本身
// ---------------------------------------------------------------------------

describe("normalizeReroutes", () => {
  it("未配置 / 类型不对 → 空设置(没有重路由机制)", () => {
    expect(normalizeReroutes(undefined)).toEqual({});
    expect(normalizeReroutes(null)).toEqual({});
    expect(normalizeReroutes("free")).toEqual({});
    expect(normalizeReroutes(["free"])).toEqual({});
    expect(normalizeReroutes({ compact: 123, vision: null, sessionTitle: [] })).toEqual({});
  });

  it("去空白、忽略空串、接受 kebab / snake 别名", () => {
    expect(
      normalizeReroutes({
        compact: "  free  ",
        "image-parse": "vision-a",
        "session-title": "cheap",
      }),
    ).toEqual({ compact: "free", vision: "vision-a", sessionTitle: "cheap" });
    expect(normalizeReroutes({ compact: "   " })).toEqual({});
  });

  it("rerouteCount 只数非空项", () => {
    expect(rerouteCount({})).toBe(0);
    expect(rerouteCount({ compact: "free", vision: "" })).toBe(1);
  });
});

describe("rerouteModel", () => {
  const routes = { compact: "free", vision: "vis", sessionTitle: "cheap" };

  it("按 purpose 取对应的设置项", () => {
    expect(rerouteModel(routes, "compaction")).toBe("free");
    expect(rerouteModel(routes, "vision")).toBe("vis");
    expect(rerouteModel(routes, "session-title")).toBe("cheap");
  });

  it("没配 / 认不出的 purpose → 不重路由", () => {
    expect(rerouteModel(undefined, "compaction")).toBeUndefined();
    expect(rerouteModel({}, "compaction")).toBeUndefined();
    expect(rerouteModel(routes, undefined)).toBeUndefined();
    // 宿主以后新增的用途:不认就是不换模型。
    expect(rerouteModel(routes, "some-future-purpose")).toBeUndefined();
    expect(rerouteModel({ compact: "  " }, "compaction")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// adapter 行为
// ---------------------------------------------------------------------------

describe("AsOneLlmAdapter 重路由", () => {
  it("默认(未配置):purpose 不改变任何东西", async () => {
    const { adapter, captured } = fixture();
    await drain(adapter().stream(options("compaction")));
    const req = captured.stream[0];
    expect(req?.model).toBe("auto");
    // 会话号 = 客户端给的,不加后缀
    expect(req?.extra?.session_id).toBe("s1");
    expect(req?.prompt_cache_key).toBe("s1");
    // 工具照旧
    expect(req?.tools?.length).toBe(1);
    // 而且没有走分块压缩(complete 一次都没调)
    expect(captured.complete).toHaveLength(0);
  });

  it("配了 compact:purpose=compaction 切车道 + 隔离会话号 + 丢工具 + 图占位 + 分块摘要", async () => {
    const { adapter, captured } = fixture();
    await drain(adapter({ compact: "free" }).stream(options("compaction")));
    expect(captured.complete.length).toBeGreaterThan(0);
    const req = captured.complete[0];
    expect(req?.model).toBe("free");
    expect(req?.extra?.session_id).toBe("s1:compaction");
    expect(req?.tools).toBeUndefined();
    // 图片没有被读成 base64,而是留下了可寻址占位
    const body = JSON.stringify(req?.messages ?? []);
    expect(body).toContain("att-1");
    expect(body).not.toContain("base64");
  });

  it("配了 sessionTitle:会话标题切车道,但仍是普通流(不分块)", async () => {
    const { adapter, captured } = fixture();
    await drain(adapter({ sessionTitle: "free" }).stream(options("session-title")));
    const req = captured.stream[0];
    expect(req?.model).toBe("free");
    expect(req?.extra?.session_id).toBe("s1:session-title");
    expect(req?.tools).toBeUndefined();
    expect(captured.complete).toHaveLength(0);
  });

  it("配了但模型不存在:整体回落原模型(不产生半个重路由)", async () => {
    const { adapter, captured } = fixture();
    await drain(adapter({ compact: "ghost" }).stream(options("compaction")));
    const req = captured.stream[0];
    expect(req?.model).toBe("auto");
    expect(req?.extra?.session_id).toBe("s1");
    expect(req?.tools?.length).toBe(1);
    expect(captured.complete).toHaveLength(0);
  });
});
