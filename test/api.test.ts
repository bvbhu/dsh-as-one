/**
 * client 半数据桥单测:mock 全局 fetch,验证
 *   1) 共享视图层的 invokePanel 被接到 `POST as-one/api/<method>`(文档相对路径)
 *   2) 位置参数以 `{ args: [...] }` 传给宿主半(routes 的 argsOf 接受该形状)
 *   3) wire 形状 ({ok:true,value} / {ok:false,error:{code,message}})的解析与错误类型
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { invokePanel } from "@as-one/panel-ui";
import { AsOneApiError, bindPanelBridge } from "../src/client/api.js";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function call0(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return fetchMock.mock.calls[0] as [string, RequestInit];
}

describe("面板数据桥(HTTP 宿主)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功 wire:返回 value,POST 到文档相对路径", async () => {
    const value = { ready: true, uptime_s: 42 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, value }));
    vi.stubGlobal("fetch", fetchMock);
    bindPanelBridge();

    const result = await invokePanel("getStatus");

    expect(result).toEqual(value);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = call0(fetchMock);
    expect(url).toBe("as-one/api/getStatus"); // 文档相对,绝非 root-absolute
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ args: [] });
  });

  it("失败 wire:抛 AsOneApiError 并透传 code/message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ ok: false, error: { code: "not_ready", message: "gateway 未就绪" } }),
      ),
    );
    bindPanelBridge();

    let caught: unknown;
    try {
      await invokePanel("getStatus");
      expect.unreachable("应当抛错");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsOneApiError);
    expect((caught as AsOneApiError).code).toBe("not_ready");
    expect((caught as AsOneApiError).message).toBe("gateway 未就绪");
  });

  it("网络错误:抛 AsOneApiError('network')", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    bindPanelBridge();

    let caught: unknown;
    try {
      await invokePanel("getStatus");
      expect.unreachable("应当抛错");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsOneApiError);
    expect((caught as AsOneApiError).code).toBe("network");
  });

  it("非 JSON 响应:抛 AsOneApiError('bad-response')", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>not json</html>", { status: 500 })),
    );
    bindPanelBridge();

    let caught: unknown;
    try {
      await invokePanel("getStatus");
      expect.unreachable("应当抛错");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AsOneApiError);
    expect((caught as AsOneApiError).code).toBe("bad-response");
  });

  it("位置参数:以 { args: [...] } 原序传给宿主", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, value: null }));
    vi.stubGlobal("fetch", fetchMock);
    bindPanelBridge();

    await invokePanel("setAccountEnabled", "stub", 2, false);

    const [url, init] = call0(fetchMock);
    expect(url).toBe("as-one/api/setAccountEnabled");
    expect(JSON.parse(init.body as string)).toEqual({ args: ["stub", 2, false] });
  });

  it.each([
    ["getRuntime", "as-one/api/getRuntime"],
    ["listProviders", "as-one/api/listProviders"],
    ["getSettings", "as-one/api/getSettings"],
  ])("%s:使用文档相对路径 POST", async (method, expectedUrl) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, value: {} }));
    vi.stubGlobal("fetch", fetchMock);
    bindPanelBridge();

    await invokePanel(method);

    const [url, init] = call0(fetchMock);
    expect(url).toBe(expectedUrl);
    expect(init.method).toBe("POST");
  });
});
