/**
 * catalog.ts 单测 —— 零真实上游(fetch 全程注入假实现)。
 *
 * 覆盖三类最容易静默出错的地方:
 *   1. **基址拼错**(`/v1/v1/models`)—— 上游只回 404,看起来像「没有目录接口」;
 *   2. **解析把坏行当空**(context/output ≤ 0 不丢);
 *   3. **按源 join**(trae 的 remote×wire 两级 join)。
 */

import { describe, expect, it, vi } from "vitest";
import {
  CATALOG_PROVIDERS,
  CatalogError,
  catalog_supported,
  fetch_catalog,
  fetch_minimax_catalog,
  fetch_sensenova_catalog,
  fetch_trae_catalog,
  fetch_workbuddy_catalog,
  merge_trae,
  NATIVE_MODALITY_BY_MODEL_ID,
  parse_sensenova_model,
  parse_trae_remote_model,
  parse_trae_wire_model,
  parse_workbuddy_model,
  prefer_stronger,
  qoder_entry_of,
  reasoning_efforts_of,
  SENSENOVA_CATALOG_BASE,
  SENSENOVA_MODELS_PATH,
  select_cli_models,
  sensenova_models_url,
  TRAE_REMOTE_BASES,
  TRAE_WIRE_FUNCTIONS,
  TRAE_WIRE_PATH,
  WORKBUDDY_CLI_UA,
  WORKBUDDY_DESKTOP_UA,
  WORKBUDDY_GLOBAL_CONFIG_PATH,
  WORKBUDDY_PERSONAL_MODELS_PATH,
  workbuddy_vision_default,
} from "./catalog.js";

/**
 * 假 fetch 的类型别名:只实现 `text()`(模块只用它读 body),
 * 其余 Response 字段在调用处用 `as never` 抹平 —— 测试关心的是
 * **请求形状与解析**,不是 Response 的每个字段。
 */
type FakeFetch = ((input: string | URL, init?: RequestInit) => Promise<{ status: number; text: () => Promise<string> }>) & {
  mock: { calls: unknown[][] };
};

/** 造一个「HTTP 200 + JSON」假 fetch。 */
function fakeJson(body: unknown, init: { status?: number } = {}): FakeFetch {
  const fn = vi.fn(async () => ({
    status: init.status ?? 200,
    text: async () => JSON.stringify(body),
  }));
  return fn as unknown as FakeFetch;
}

const ACCOUNT = {
  provider: "trae",
  username: "u@example.com",
  token: "tok",
  region: "cn",
  extras: {},
};

// ---------------------------------------------------------------------------
// 公共工具
// ---------------------------------------------------------------------------

describe("catalog_supported", () => {
  it("列五个渠道(minimax 是本地内置名单,也算可拉目录;qoder 有 model/list)", () => {
    expect(CATALOG_PROVIDERS).toEqual(["trae", "workbuddy", "sensenova", "minimax", "qoder"]);
  });
  it("大小写/空白不敏感", () => {
    expect(catalog_supported(" Trae ")).toBe(true);
    expect(catalog_supported("openai")).toBe(false);
  });
});

describe("fetch_minimax_catalog(内置固定名单)", () => {
  it("六行内置模型:origin=router,不打上游(fetch 被调用就炸)", async () => {
    const boomFetch = (() => {
      throw new Error("minimax 目录不该发任何请求");
    }) as unknown as typeof fetch;
    const res = await fetch_catalog("minimax", { ...ACCOUNT, provider: "minimax" }, { fetchFn: boomFetch });
    expect(res.provider).toBe("minimax");
    expect(res.source).toBe("api");
    expect(res.entries).toHaveLength(6);
    for (const e of res.entries) {
      expect(e.origin).toBe("router");
      expect(e.id).toBe(String(e.id)); // 本地 id(minimax-agent 等),不是上游串
    }
    // thinking 变体与主行同上游模型(靠 thinking_config 区分),本地 id 必须互不相同
    const ids = res.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("思考档位三态:chat 模型一律不可关(上游 400 requires adaptive)、image 明说不支持", async () => {
    const res = fetch_minimax_catalog({ ...ACCOUNT, provider: "minimax" });
    const byId = new Map(res.entries.map((e) => [e.id, e]));
    const flash = byId.get("minimax-m3.1-flash");
    expect(flash?.reasoning_efforts).toEqual(["low", "medium", "high", "max"]);
    // 2026-11-08 真机:thinking.type="disabled" 被 400 拒绝 → 不能声明可关
    expect(flash?.reasoning_allows_off).toBe(false);
    const thinking = byId.get("minimax-m3.1-flash-thinking");
    expect(thinking?.reasoning_efforts).toEqual(["low", "medium", "high", "max"]);
    expect(thinking?.reasoning_allows_off).toBe(false);
    const image = byId.get("minimax-image");
    expect(image?.reasoning_efforts).toEqual([]);
    expect(image?.callable).toBe(false);
  });
});

describe("fetch_catalog", () => {
  it("不支持的渠道抛 CatalogError", async () => {
    await expect(fetch_catalog("openai", ACCOUNT)).rejects.toThrow(CatalogError);
  });
});

// ---------------------------------------------------------------------------
// sensenova 基址归一(防 /v1/v1/models)
// ---------------------------------------------------------------------------

describe("sensenova_models_url", () => {
  it("主机根 → 补 /v1/models", () => {
    expect(sensenova_models_url("https://token.sensenova.cn")).toBe(
      "https://token.sensenova.cn/v1/models",
    );
  });
  it("已是 /v1 的 base → 只补 /models(绝不出 /v1/v1)", () => {
    expect(sensenova_models_url("https://token.sensenova.cn/v1")).toBe(
      "https://token.sensenova.cn/v1/models",
    );
  });
  it("带尾斜杠的主机根也正确", () => {
    expect(sensenova_models_url("https://token.sensenova.cn/")).toBe(
      "https://token.sensenova.cn/v1/models",
    );
  });
  it("空 base → 默认主机", () => {
    expect(sensenova_models_url("")).toBe(`${SENSENOVA_CATALOG_BASE}${SENSENOVA_MODELS_PATH}`);
  });
  it("任何形状都不产生 /v1/v1/", () => {
    for (const base of [
      "https://token.sensenova.cn",
      "https://token.sensenova.cn/",
      "https://token.sensenova.cn/v1",
      "https://token.sensenova.cn/v1/",
      "",
    ]) {
      expect(sensenova_models_url(base)).not.toContain("/v1/v1/");
    }
  });
});

describe("parse_sensenova_model", () => {
  it("读 id/name/窗口/视觉", () => {
    const entry = parse_sensenova_model({
      id: "SenseNova-V6-Turbo",
      name: "SenseNova V6 Turbo",
      context_length: 32768,
      max_output_length: 8192,
      input_modalities: ["text", "image"],
    });
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("SenseNova-V6-Turbo");
    expect(entry!.vision).toBe(true);
    expect(entry!.context_window).toBe(32768);
    expect(entry!.max_output).toBe(8192);
  });
  it("缺 id 的行丢弃", () => {
    expect(parse_sensenova_model({ name: "no id" })).toBeNull();
  });
  it("缺 context_length 的行保留(窗口留 null,不藏模型)", () => {
    const entry = parse_sensenova_model({ id: "x" });
    expect(entry).not.toBeNull();
    expect(entry!.context_window).toBeNull();
    expect(entry!.max_output).toBeNull();
  });
  it("context 为 0 → null(0 不是 0 token)", () => {
    const entry = parse_sensenova_model({ id: "x", context_length: 0 });
    expect(entry!.context_window).toBeNull();
  });
  it("input_modalities 不含 image → 非视觉", () => {
    const entry = parse_sensenova_model({ id: "x", input_modalities: ["text"] });
    expect(entry!.vision).toBe(false);
  });
});

describe("fetch_sensenova_catalog", () => {
  it("成功:排序 + 计数", async () => {
    const fetchFn = fakeJson({
      data: [
        { id: "b", name: "B", context_length: 100, max_output_length: 10 },
        { id: "a", name: "A", context_length: 200, max_output_length: 20 },
      ],
    });
    const res = await fetch_sensenova_catalog(
      { provider: "sensenova", username: "u", token: "sk-x" },
      { fetchFn: fetchFn as never },
    );
    expect(res.entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(res.source).toBe("api");
    expect(fetchFn.mock.calls).toHaveLength(1);
    // 走的是 …/v1/models(绝不 /v1/v1/models)
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://token.sensenova.cn/v1/models");
  });
  it("provider.base_url 已含 /v1 时不重复拼", async () => {
    const fetchFn = fakeJson({ data: [{ id: "a", name: "A" }] });
    await fetch_sensenova_catalog(
      {
        provider: "sensenova",
        username: "u",
        token: "sk-x",
        baseUrl: "https://token.sensenova.cn/v1",
      },
      { fetchFn: fetchFn as never },
    );
    expect(String(fetchFn.mock.calls[0][0])).toBe("https://token.sensenova.cn/v1/models");
  });
  it("401 → CatalogError", async () => {
    const fetchFn = fakeJson({}, { status: 401 });
    await expect(
      fetch_sensenova_catalog(
        { provider: "sensenova", username: "u", token: "bad" },
        { fetchFn: fetchFn as never },
      ),
    ).rejects.toThrow(/HTTP 401/);
  });
  it("无 token → CatalogError", async () => {
    await expect(
      fetch_sensenova_catalog(
        { provider: "sensenova", username: "u", token: "" },
        { fetchFn: fakeJson({}) as never },
      ),
    ).rejects.toThrow(CatalogError);
  });
  it("data 为空 → CatalogError(不是静默返回空列表)", async () => {
    await expect(
      fetch_sensenova_catalog(
        { provider: "sensenova", username: "u", token: "sk-x" },
        { fetchFn: fakeJson({ data: [] }) as never },
      ),
    ).rejects.toThrow(/没有返回可用模型/);
  });
  it("非 JSON → CatalogError", async () => {
    const fetchFn = vi.fn(async () => ({ status: 200, text: async () => "<html>404</html>" }));
    await expect(
      fetch_sensenova_catalog(
        { provider: "sensenova", username: "u", token: "sk-x" },
        { fetchFn: fetchFn as never },
      ),
    ).rejects.toThrow(/响应不是 JSON/);
  });
});

// ---------------------------------------------------------------------------
// trae wire 解析
// ---------------------------------------------------------------------------

describe("parse_trae_wire_model", () => {
  it("读 config_name / display_config / model_detail_list / tokens", () => {
    const entry = parse_trae_wire_model({
      config_name: "deepseek-v4-pro",
      display_config: { display_name: "DeepSeek V4 Pro" },
      multimodal: true,
      context_window_tokens: { max: 1000000, dev: 200000 },
      model_detail_list: [{ prompt_max_tokens: 168000, max_tokens: 8192 }],
    });
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("deepseek-v4-pro");
    expect(entry!.name).toBe("DeepSeek V4 Pro");
    expect(entry!.vision).toBe(true);
    // max 档优先(不取 model_detail_list 的 prompt 上限)
    expect(entry!.context_window).toBe(1000000);
    expect(entry!.max_output).toBe(8192);
    expect(entry!.callable).toBe(true);
    expect(entry!.origin).toBe("wire");
  });
  it("max 缺失回退 dev 档", () => {
    const entry = parse_trae_wire_model({
      config_name: "m",
      context_window_tokens: { dev: 200000 },
    });
    expect(entry!.context_window).toBe(200000);
  });
  it("tokens 全缺时回退 model_detail_list.prompt_max_tokens", () => {
    const entry = parse_trae_wire_model({
      config_name: "m",
      model_detail_list: [{ prompt_max_tokens: 168000 }],
    });
    expect(entry!.context_window).toBe(168000);
  });
  it("display_contact_config 内嵌 JSON 的折后倍率", () => {
    const entry = parse_trae_wire_model({
      config_name: "m",
      display_contact_config: JSON.stringify({
        consumption_rate: { enable: true, data: { rate: 0.08 } },
      }),
    });
    expect(entry!.rate).toBe(0.08);
  });
  it("consumption_rate.enable=false → 无倍率", () => {
    const entry = parse_trae_wire_model({
      config_name: "m",
      display_contact_config: JSON.stringify({
        consumption_rate: { enable: false, data: { rate: 0.8 } },
      }),
    });
    expect(entry!.rate).toBeNull();
  });
  it("display_contact_config 不是 JSON → 无倍率(不抛)", () => {
    const entry = parse_trae_wire_model({ config_name: "m", display_contact_config: "{oops" });
    expect(entry!.rate).toBeNull();
  });
  it("无 config_name → null", () => {
    expect(parse_trae_wire_model({ display_config: { display_name: "x" } })).toBeNull();
  });
  it("display_name 缺失回退 config_name", () => {
    const entry = parse_trae_wire_model({ config_name: "m" });
    expect(entry!.name).toBe("m");
  });
});

describe("parse_trae_remote_model", () => {
  it("读 name/display_name/features JSON 字符串/tokens", () => {
    const entry = parse_trae_remote_model({
      name: "DeepSeek-V4-Flash",
      display_name: "DeepSeek V4 Flash",
      multimodal: true,
      context_window_tokens: { max: 1000000, dev: 200000 },
      features: JSON.stringify({ consumption_rate: { enable: true, data: { rate: 0.8 } } }),
    });
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("DeepSeek-V4-Flash");
    expect(entry!.context_window).toBe(1000000);
    expect(entry!.rate).toBe(0.8);
    expect(entry!.origin).toBe("remote");
    expect(entry!.callable).toBe(false);
    // 远程目录不给输出上限
    expect(entry!.max_output).toBeNull();
  });
  it("features 非字符串/坏 JSON → 无倍率", () => {
    expect(parse_trae_remote_model({ name: "m", features: 42 })!.rate).toBeNull();
    expect(parse_trae_remote_model({ name: "m", features: "{bad" })!.rate).toBeNull();
  });
});

describe("prefer_stronger", () => {
  const base = {
    id: "m",
    name: "m",
    vision: false,
    context_window: 100,
    max_output: null,
    rate: null,
    origin: "wire" as const,
    callable: true,
  };

  it("新行上下文更大 → 赢", () => {
    const neu = { ...base, context_window: 500 };
    expect(prefer_stronger(neu, base).context_window).toBe(500);
  });
  it("新行更小 → 保留旧行(同 id 两 function 容量不同,留大的)", () => {
    const old = { ...base, context_window: 500 };
    const neu = { ...base, context_window: 100 };
    expect(prefer_stronger(neu, old).context_window).toBe(500);
  });
  it("无旧行 → 新行", () => {
    const neu = { ...base, context_window: 100 };
    expect(prefer_stronger(neu, undefined)).toBe(neu);
  });
});

describe("merge_trae", () => {
  const mk = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    name: id,
    vision: false,
    context_window: 100,
    max_output: null,
    rate: null,
    origin: "remote" as const,
    callable: false,
    ...over,
  });

  it("按 id join:wire 值优先,展示名与视觉取 remote", () => {
    const merged = merge_trae(
      { "deepseek-v4-pro": mk("deepseek-v4-pro", { name: "DeepSeek V4 Pro", vision: true }) },
      {
        "deepseek-v4-pro": mk("deepseek-v4-pro", {
          name: "DeepSeek V4 Pro",
          context_window: 1000000,
          origin: "wire",
          callable: true,
        }),
      },
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("deepseek-v4-pro");
    expect(merged[0].context_window).toBe(1000000);
    expect(merged[0].vision).toBe(true);
    expect(merged[0].origin).toBe("wire");
    expect(merged[0].callable).toBe(true);
  });

  it("按展示名 join(两边写法不同)", () => {
    const merged = merge_trae(
      { "DeepSeek-V4-Flash": mk("DeepSeek-V4-Flash", { name: "DeepSeek V4 Flash" }) },
      {
        "deepseek-v4-flash": mk("deepseek-v4-flash", {
          name: "DeepSeek V4 Flash",
          origin: "wire",
          callable: true,
        }),
      },
    );
    expect(merged).toHaveLength(1);
    // id 取 wire 的(chat 端点真认的名字)
    expect(merged[0].id).toBe("deepseek-v4-flash");
    expect(merged[0].name).toBe("DeepSeek V4 Flash");
    expect(merged[0].callable).toBe(true);
  });

  it("只在 remote 里的行保留但标不可调用(不藏用户自己的模型)", () => {
    const merged = merge_trae({ "only-remote": mk("only-remote") }, {});
    expect(merged).toHaveLength(1);
    expect(merged[0].callable).toBe(false);
    expect(merged[0].origin).toBe("remote");
  });

  it("只在 wire 里的行不进结果(骨架是 remote)", () => {
    const merged = merge_trae({}, { "only-wire": mk("only-wire", { origin: "wire", callable: true }) });
    expect(merged).toEqual([]);
  });

  it("思考档位从 wire 行带过来(remote 行没有这些字段)", () => {
    const merged = merge_trae(
      { "deepseek-v4.1-flash": mk("deepseek-v4.1-flash") },
      {
        "deepseek-v4.1-flash": mk("deepseek-v4.1-flash", {
          origin: "wire",
          callable: true,
          reasoning_efforts: ["low", "high", "max"],
          reasoning_allows_off: false,
        }),
      },
    );
    expect(merged[0].reasoning_efforts).toEqual(["low", "high", "max"]);
    expect(merged[0].reasoning_allows_off).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// trae 抓取
// ---------------------------------------------------------------------------

describe("fetch_trae_catalog", () => {
  it("wire + remote 都成功 → 合并", async () => {
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith(TRAE_WIRE_PATH)) {
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(Object.keys(TRAE_WIRE_FUNCTIONS).length).toBeGreaterThan(0);
        expect(body.function).toBeTruthy();
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              config_info_list: [
                {
                  config_name: "deepseek-v4-pro",
                  display_config: { display_name: "DeepSeek V4 Pro" },
                  multimodal: true,
                  context_window_tokens: { max: 1000000, dev: 200000 },
                  model_detail_list: [{ prompt_max_tokens: 168000, max_tokens: 8192 }],
                },
              ],
            }),
        };
      }
      if (u.startsWith(TRAE_REMOTE_BASES.cn) && u.includes("/models")) {
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              data: {
                list: [
                  {
                    models: [
                      {
                        name: "deepseek-v4-pro",
                        display_name: "DeepSeek V4 Pro",
                        multimodal: true,
                        context_window_tokens: { max: 1000000, dev: 200000 },
                      },
                    ],
                  },
                ],
              },
            }),
        };
      }
      throw new Error(`unexpected url ${u}`);
    });
    const res = await fetch_trae_catalog(ACCOUNT, { fetchFn: fetchFn as never });
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].id).toBe("deepseek-v4-pro");
    expect(res.entries[0].callable).toBe(true);
    expect(res.entries[0].context_window).toBe(1000000);
    expect(res.warnings).toEqual([]);
    // 5 个 function + 1 次 remote
    expect(fetchFn).toHaveBeenCalledTimes(TRAE_WIRE_FUNCTIONS.cn.length + 1);
  });

  it("remote 失败 → 降级用 wire 名单 + 两条 warning(远程失败 + 改用 chat 名单)", async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/models")) return { status: 500, text: async () => "" };
      return {
        status: 200,
        text: async () => JSON.stringify({ config_info_list: [{ config_name: "m" }] }),
      };
    });
    const res = await fetch_trae_catalog(ACCOUNT, { fetchFn: fetchFn as never });
    expect(res.entries).toHaveLength(1);
    expect(res.warnings.length).toBe(2);
    expect(res.warnings[0]).toContain("远程目录失败");
    expect(res.warnings[1]).toContain("改用 chat 名单");
  });

  it("两个源全空 → source=empty", async () => {
    const fetchFn = fakeJson({});
    const res = await fetch_trae_catalog(ACCOUNT, { fetchFn: fetchFn as never });
    expect(res.entries).toEqual([]);
    expect(res.source).toBe("empty");
  });

  it("单个 function 失败不丢弃整轮(其余组仍可用)", async () => {
    let n = 0;
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/models")) {
        return { status: 200, text: async () => JSON.stringify({ data: { list: [] } }) };
      }
      n += 1;
      if (n === 1) return { status: 500, text: async () => "" };
      return { status: 200, text: async () => JSON.stringify({ config_info_list: [{ config_name: `m${n}` }] }) };
    });
    const res = await fetch_trae_catalog(ACCOUNT, { fetchFn: fetchFn as never });
    // 骨架空 → 降级 wire,于是 = 1 条名单失败 + 1 条「改用 chat 名单」
    expect(res.entries.length).toBeGreaterThan(0);
    expect(res.warnings.length).toBe(2);
    expect(res.warnings[0]).toContain("名单失败");
    expect(res.warnings[1]).toContain("改用 chat 名单");
  });

  it("ai 区域用不同的 wire function 组与远程基址", async () => {
    const seen: string[] = [];
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      seen.push(u);
      return {
        status: 200,
        text: async () => JSON.stringify({ config_info_list: [], data: { list: [] } }),
      };
    });
    await fetch_trae_catalog({ ...ACCOUNT, region: "ai" }, { fetchFn: fetchFn as never });
    expect(seen.some((u) => u.startsWith(TRAE_REMOTE_BASES.ai))).toBe(true);
    expect(seen.some((u) => u.startsWith(TRAE_REMOTE_BASES.cn))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// workbuddy
// ---------------------------------------------------------------------------

describe("parse_workbuddy_model", () => {
  it("读 id/name/窗口/credits 倍率", () => {
    const entry = parse_workbuddy_model({
      id: "hy4-preview",
      name: "Hy4 Preview",
      maxInputTokens: 128000,
      maxOutputTokens: 4096,
      credits: "x0.80 credits",
    });
    expect(entry).not.toBeNull();
    expect(entry!.context_window).toBe(128000);
    expect(entry!.max_output).toBe(4096);
    expect(entry!.rate).toBe(0.8);
  });
  it("reasoning_efforts 取上游的 supportedEfforts 档位表(m09328)", () => {
    // 实测形状(workbuddy /v3/config):每条模型都带 reasoning 对象 +
    // supportsReasoning / onlyReasoning。
    expect(
      parse_workbuddy_model({
        id: "m",
        maxInputTokens: 1,
        maxOutputTokens: 1,
        reasoning: { canDisableThinking: false, defaultEffort: "high", summary: "auto", supportedEfforts: ["low", "high", "max"] },
        supportsReasoning: true,
      })!.reasoning_efforts,
    ).toEqual(["low", "high", "max"]);
    // canDisableThinking:true 的档位表(high/xhigh)照**原文**收下 —— 落库后网关
    // 发的就是 xhigh(上游认的拼写),不再改写成规范名 max。
    expect(
      parse_workbuddy_model({
        id: "m",
        maxInputTokens: 1,
        maxOutputTokens: 1,
        reasoning: { canDisableThinking: true, defaultEffort: "high", summary: "auto", supportedEfforts: ["high", "xhigh"] },
      })!.reasoning_efforts,
    ).toEqual(["high", "xhigh"]);
    // 允许关闭思考的能力也一并带出来(workbuddy 的 canDisableThinking)。
    expect(
      parse_workbuddy_model({
        id: "m",
        maxInputTokens: 1,
        maxOutputTokens: 1,
        reasoning: { canDisableThinking: true, defaultEffort: "high", summary: "auto", supportedEfforts: ["high"] },
      })!.reasoning_allows_off,
    ).toBe(true);
    expect(
      parse_workbuddy_model({
        id: "m",
        maxInputTokens: 1,
        maxOutputTokens: 1,
        reasoning: { canDisableThinking: false, defaultEffort: "high", summary: "auto", supportedEfforts: ["high"] },
      })!.reasoning_allows_off,
    ).toBe(false);
    // 只有单值 effort、没有 supportedEfforts → 折成单元素名单(实测 16 条模型如此)。
    expect(
      parse_workbuddy_model({
        id: "m",
        maxInputTokens: 1,
        maxOutputTokens: 1,
        reasoning: { effort: "medium", summary: "auto" },
      })!.reasoning_efforts,
    ).toEqual(["medium"]);
    // reasoning:null + supportsReasoning 未给 → 明说**不支持**思考(空数组,不是 null)。
    expect(
      parse_workbuddy_model({ id: "m", maxInputTokens: 1, maxOutputTokens: 1 })!.reasoning_efforts,
    ).toEqual([]);
    // reasoning:null + supportsReasoning:true → 上游承认支持但没给档位表 → null(不拦)。
    expect(
      parse_workbuddy_model({ id: "m", maxInputTokens: 1, maxOutputTokens: 1, supportsReasoning: true })!
        .reasoning_efforts,
    ).toBeNull();
  });
  it("reasoning_efforts_of 三态与去重", () => {
    expect(reasoning_efforts_of({ supportedEfforts: ["low", "high", "low"] })).toEqual(["low", "high"]);
    expect(reasoning_efforts_of({ effort: "high" })).toEqual(["high"]);
    expect(reasoning_efforts_of({ summary: "auto" })).toEqual([]);
    // reasoning 缺失/null 且上游没说 supportsReasoning → 明说**不支持**(空名单)。
    expect(reasoning_efforts_of(null)).toEqual([]);
    expect(reasoning_efforts_of(undefined)).toEqual([]);
    expect(reasoning_efforts_of(undefined, true)).toBeNull();
    expect(reasoning_efforts_of(undefined, false)).toEqual([]);
    expect(reasoning_efforts_of(undefined)).toEqual([]);
  });
  it("credits 里 0 是免费(与解析失败区分)", () => {
    const entry = parse_workbuddy_model({
      id: "hy4-preview-f",
      maxInputTokens: 1,
      maxOutputTokens: 1,
      credits: "x0.00 credits",
    });
    expect(entry!.rate).toBe(0);
  });
  it("credits 非字符串/无匹配 → 无倍率", () => {
    expect(
      parse_workbuddy_model({ id: "m", maxInputTokens: 1, maxOutputTokens: 1, credits: 42 })!.rate,
    ).toBeNull();
    expect(
      parse_workbuddy_model({ id: "m", maxInputTokens: 1, maxOutputTokens: 1, credits: "free" })!.rate,
    ).toBeNull();
  });
  it("context 缺失/≤0 → 整行丢弃(max_tokens=0 会 400)", () => {
    expect(parse_workbuddy_model({ id: "m", maxOutputTokens: 100 })).toBeNull();
    expect(parse_workbuddy_model({ id: "m", maxInputTokens: 0, maxOutputTokens: 100 })).toBeNull();
    expect(parse_workbuddy_model({ id: "m", maxInputTokens: -5, maxOutputTokens: 100 })).toBeNull();
  });
  it("output 缺失/≤0 → 整行丢弃", () => {
    expect(parse_workbuddy_model({ id: "m", maxInputTokens: 100 })).toBeNull();
    expect(parse_workbuddy_model({ id: "m", maxInputTokens: 100, maxOutputTokens: 0 })).toBeNull();
  });
  it("disabled=true → 丢弃", () => {
    expect(
      parse_workbuddy_model({ id: "m", maxInputTokens: 1, maxOutputTokens: 1, disabled: true }),
    ).toBeNull();
  });
  it("缺 id → 丢弃", () => {
    expect(parse_workbuddy_model({ maxInputTokens: 1, maxOutputTokens: 1 })).toBeNull();
  });
});

describe("workbuddy_vision_default", () => {
  it("表里标 multimodal → 默认勾", () => {
    expect(NATIVE_MODALITY_BY_MODEL_ID["deepseek-v4.1-flash"]).toBe("multimodal");
    expect(workbuddy_vision_default("deepseek-v4.1-flash", null)).toBe(true);
  });
  it("表里标 text → 不勾", () => {
    expect(workbuddy_vision_default("hy3", true)).toBe(false);
    expect(workbuddy_vision_default("hy4-preview", true)).toBe(false);
  });
  it("表里没有的 id → 不猜(unknown → false)", () => {
    expect(workbuddy_vision_default("mystery-model", true)).toBe(false);
  });
  it("supportsImages=false 一票否决", () => {
    expect(workbuddy_vision_default("deepseek-v4.1-flash", false)).toBe(false);
  });
  it("disabledMultimodal=true 一票否决", () => {
    expect(workbuddy_vision_default("deepseek-v4.1-flash", true, true)).toBe(false);
  });
});

describe("select_cli_models", () => {
  const models = [
    { id: "hy3", name: "Hy3", maxInputTokens: 100, maxOutputTokens: 10 },
    { id: "hy4-preview", name: "Hy4", maxInputTokens: 200, maxOutputTokens: 20 },
    { id: "broken", name: "Broken" },
  ];

  it("按 agents 里 cli 名单定序", () => {
    const picked = select_cli_models(models, [{ name: "cli", models: ["hy4-preview", "hy3"] }]);
    expect(picked.map((e) => e.id)).toEqual(["hy4-preview", "hy3"]);
  });

  it("坏行(无窗口)被丢弃", () => {
    const picked = select_cli_models(models, []);
    expect(picked.map((e) => e.id)).toEqual(["hy3", "hy4-preview"]);
  });

  it("拿不到 cli 名单 → 全量(不静默 disarm 整个渠道)", () => {
    const picked = select_cli_models(models, [{ name: "other", models: ["hy3"] }]);
    expect(picked.map((e) => e.id)).toEqual(["hy3", "hy4-preview"]);
  });

  it("cli 名单引用了不存在的 id → 忽略该 id", () => {
    const picked = select_cli_models(models, [{ name: "cli", models: ["hy3", "ghost"] }]);
    expect(picked.map((e) => e.id)).toEqual(["hy3"]);
  });

  it("重复 id 去重(留第一个)", () => {
    const picked = select_cli_models(
      [
        { id: "hy3", name: "A", maxInputTokens: 1, maxOutputTokens: 1 },
        { id: "hy3", name: "B", maxInputTokens: 2, maxOutputTokens: 2 },
      ],
      [],
    );
    expect(picked).toHaveLength(1);
    expect(picked[0].name).toBe("A");
  });
});

describe("fetch_workbuddy_catalog", () => {
  const body = {
    code: 0,
    data: {
      models: [{ id: "hy3", name: "Hy3", maxInputTokens: 100, maxOutputTokens: 10 }],
      agents: [{ name: "cli", models: ["hy3"] }],
    },
  };

  it("CN 走 /v3/config + CLI UA,成功时不碰 personal/models", async () => {
    const fetchFn = fakeJson(body);
    const res = await fetch_workbuddy_catalog(
      { provider: "workbuddy", username: "u", token: "t", region: "cn" },
      { fetchFn: fetchFn as never },
    );
    expect(res.entries.map((e) => e.id)).toEqual(["hy3"]);
    expect(String(fetchFn.mock.calls[0][0])).toBe(
      `https://copilot.tencent.com${WORKBUDDY_GLOBAL_CONFIG_PATH}`,
    );
    expect((fetchFn.mock.calls[0][1] as RequestInit).headers?.["User-Agent" as never]).toBe(
      WORKBUDDY_CLI_UA,
    );
    expect(fetchFn.mock.calls).toHaveLength(1);
  });

  it("global 走 /v3/config + 桌面 UA", async () => {
    const fetchFn = fakeJson(body);
    await fetch_workbuddy_catalog(
      { provider: "workbuddy", username: "u", token: "t", region: "global" },
      { fetchFn: fetchFn as never },
    );
    expect(String(fetchFn.mock.calls[0][0])).toBe(
      `https://www.workbuddy.ai${WORKBUDDY_GLOBAL_CONFIG_PATH}`,
    );
    expect((fetchFn.mock.calls[0][1] as RequestInit).headers?.["User-Agent" as never]).toBe(
      WORKBUDDY_DESKTOP_UA,
    );
  });

  it("CN 的 /v3/config 失败 → 回退 personal/models + warning", async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith(WORKBUDDY_GLOBAL_CONFIG_PATH)) return { status: 500, text: async () => "" };
      if (u.endsWith(WORKBUDDY_PERSONAL_MODELS_PATH)) {
        return { status: 200, text: async () => JSON.stringify(body) };
      }
      throw new Error(`unexpected ${u}`);
    });
    const res = await fetch_workbuddy_catalog(
      { provider: "workbuddy", username: "u", token: "t", region: "cn" },
      { fetchFn: fetchFn as never },
    );
    expect(res.entries).toHaveLength(1);
    expect(res.warnings.length).toBe(1);
    expect(res.warnings[0]).toContain("回退");
  });

  it("HTTP 200 + 非零 code → CatalogError(不渲染成「上游没模型」)", async () => {
    const fetchFn = fakeJson({ code: 401, msg: "unauthorized", data: { models: [] } });
    await expect(
      fetch_workbuddy_catalog(
        { provider: "workbuddy", username: "u", token: "t", region: "cn" },
        { fetchFn: fetchFn as never },
      ),
    ).rejects.toThrow(/业务失败 code=401/);
  });

  it("models 解析后为空 → CatalogError", async () => {
    const fetchFn = fakeJson({ code: 0, data: { models: [{ id: "broken" }], agents: [] } });
    await expect(
      fetch_workbuddy_catalog(
        { provider: "workbuddy", username: "u", token: "t", region: "cn" },
        { fetchFn: fetchFn as never },
      ),
    ).rejects.toThrow(/没有可用模型/);
  });

  it("region 缺省 → 从 token 推断", async () => {
    const fetchFn = fakeJson(body);
    // 不带 region:token 不是 JWT,detect 回退 global
    await fetch_workbuddy_catalog(
      { provider: "workbuddy", username: "u", token: "not-a-jwt" },
      { fetchFn: fetchFn as never },
    );
    expect(String(fetchFn.mock.calls[0][0])).toContain("www.workbuddy.ai");
  });

  it("连接失败 → CatalogError", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      fetch_workbuddy_catalog(
        { provider: "workbuddy", username: "u", token: "t", region: "cn" },
        { fetchFn: fetchFn as never },
      ),
    ).rejects.toThrow(/连接失败/);
  });
});

describe("思考档位:从上游目录里读(2026-11-08)", () => {
  it("trae wire 行:reasoning_effort_config.options → 档位,不可关", () => {
    const e = parse_trae_wire_model({
      config_name: "deepseek-v4.1-flash",
      display_config: { display_name: "DeepSeek V4.1 Flash" },
      context_window_tokens: { max: 256000 },
      reasoning_effort_config: {
        default_level: "high",
        options: ["light", "high", "extra_high"],
        support_thinking: true,
      },
    });
    // 存上游原文:light / high / extra_high 就是 trae 报文里的取值,不归一。
    expect(e?.reasoning_efforts).toEqual(["light", "high", "extra_high"]);
    expect(e?.reasoning_allows_off).toBe(false);
  });

  it("trae wire 行:support_thinking=false → 明说不支持([])", () => {
    const e = parse_trae_wire_model({
      config_name: "Doubao-Seed-2.1-Turbo",
      reasoning_effort_config: { support_thinking: false },
    });
    expect(e?.reasoning_efforts).toEqual([]);
  });

  it("qoder 行:thinking_config.enabled.efforts 的键就是档位", () => {
    // 真实形状(qmodel_38max 一类):只有 xhigh/low/medium,且有 disabled
    const e = qoder_entry_of({
      key: "qmodel_38max",
      displayName: "Qmodel 38 Max",
      enable: true,
      isVl: true,
      maxContextTokens: 1_000_000,
      raw: {
        thinking_config: {
          disabled: {},
          enabled: { efforts: { xhigh: {}, low: {}, medium: { is_default: true } }, is_default: true },
        },
      },
    });
    expect(e.reasoning_efforts).toEqual(["low", "medium", "xhigh"]);
    expect(e.reasoning_allows_off).toBe(true);
    expect(e.context_window).toBe(1_000_000);
  });

  it("qoder 行:没有 disabled → 能思考但关不掉", () => {
    const e = qoder_entry_of({
      key: "gmodel",
      displayName: "G",
      enable: true,
      isVl: false,
      raw: {
        thinking_config: { enabled: { efforts: { high: { is_default: true }, low: {}, max: {} } } },
      },
    });
    expect(e.reasoning_efforts).toEqual(["low", "high", "max"]);
    expect(e.reasoning_allows_off).toBe(false);
  });

  it("qoder 行:没有 thinking_config(auto/fast)→ 没有可选档位", () => {
    const e = qoder_entry_of({ key: "auto", displayName: "Auto", enable: true, isVl: true, raw: {} });
    expect(e.reasoning_efforts).toEqual([]);
    expect(e.reasoning_allows_off).toBeNull();
  });
});
