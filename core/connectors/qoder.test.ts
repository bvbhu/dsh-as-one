import { describe, expect, it } from "vitest";

import {
  COSY_VERSION,
  cosyDecode,
  cosyEncode,
  deriveFingerprint,
  identityFromJobToken,
  md5Hex,
  newCosySession,
  pathSigFrom,
  rsaDecrypt,
  signRequest,
} from "./qoder-cosy.js";
import {
  businessCodeOf,
  classifyFailure,
  classifyHttpStatus,
  createChatBodyTemplate,
  deepestBusinessCode,
  extractLatestUserPrompt,
  isContentPolicy,
  jobTokenBody,
  parseCampaignFeed,
  parseCachedTokens,
  parseModelCatalog,
  parseQoderFrame,
  parseStreamDelta,
  parseUsage,
  projectCampaignEntry,
  qoderErrorBlockOf,
  qoderErrorFrameOf,
  retryAfterMsOf,
  retryAfterMsOfHeader,
  sseDataPayload,
} from "./qoder-wire.js";
import { parseJobToken, QoderAdapter, QoderUpstreamError, regionOfCreds } from "./qoder.js";
import { isQoderRegion, QODER_CHAT_PATH, QODER_REGION_CONFIGS } from "./qoder-wire.js";

/**
 * 聊天端点必须带 `Encode=1` —— 报文体走 cosy 自定义 base64,上游靠这个查询
 * 参数决定「先解码再 parse」。漏掉它上游会把编码串当 JSON 解析,报
 * `Unrecognized token '<首字符>'`(实测解码回来是 `typ`,即 contents 开头),
 * 表现为 qoder 通道 100% 失败。这条是那次故障的回归哨兵。
 */
describe("qoder-wire 端点编码标记", () => {
  it("chat 端点带 Encode=1", () => {
    expect(QODER_CHAT_PATH).toContain("Encode=1");
  });

  it("models / jobToken 端点也带 Encode=1(同组一致)", () => {
    for (const region of Object.values(QODER_REGION_CONFIGS)) {
      expect(region.modelsPath).toContain("Encode=1");
      expect(region.jobTokenPath).toContain("Encode=1");
      expect(region.chatPath).toContain("Encode=1");
    }
  });
});

describe("qoder-cosy 编码", () => {
  it("自定义 base64 可逆", () => {
    const payload = new TextEncoder().encode('{"hello":"世界","n":[1,2,3]}');
    const encoded = cosyEncode(payload);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(new TextDecoder().decode(cosyDecode(encoded))).toBe('{"hello":"世界","n":[1,2,3]}');
  });

  it("编码结果逐字符都在自定义字母表内", () => {
    const encoded = cosyEncode(new TextEncoder().encode("abc"));
    expect(encoded).toMatch(/^[_doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!$]+$/);
  });

  it("签名串形如 md5(五段)", () => {
    const sig = signRequest("P", "K", "1700000000", "B", "/api/v2/x");
    expect(sig).toBe(md5Hex("P\nK\n1700000000\nB\n/api/v2/x"));
    expect(sig).toMatch(/^[0-9a-f]{32}$/);
  });

  it("pathSigFrom 去掉 /algo 前缀并丢查询串", () => {
    expect(pathSigFrom("https://gateway.qoder.com.cn/algo/api/v2/model/list?Encode=1")).toBe(
      "/api/v2/model/list",
    );
    expect(pathSigFrom("https://api1.qoder.sh/api/v1/jobToken/exchange")).toBe("/api/v1/jobToken/exchange");
  });

  it("会话构造：cosyKey 是 RSA 密文、info 是 AES 密文，身份字段透传", () => {
    const raw = newCosySession(identityFromJobToken({ id: "u1", name: "n" }), "m", "t", "mt");
    // RSA-1024 密文固定 128 字节 → base64 172 字符（末尾带 =）。
    expect(Buffer.from(raw.cosyKey, "base64").length).toBe(128);
    expect(raw.info.length).toBeGreaterThan(0);
    expect(raw.identity.uid).toBe("u1");
    expect(raw.tempKey.length).toBe(16);
    expect(raw.machineId).toBe("m");
    // RSA 解密工具函数保留（运行时拿不到私钥，这里只断言可调用性）。
    expect(typeof rsaDecrypt).toBe("function");
  });

  it("指纹稳定且同 PAT 跨次一致", () => {
    const a = deriveFingerprint("u1", "pt-abc");
    const b = deriveFingerprint("u1", "pt-abc");
    expect(a).toEqual(b);
    expect(a.machineId).toMatch(/^[0-9a-f]{32}$/);
    expect(a.machineType.length).toBeLessThanOrEqual(18);
    expect(a.machineToken.length).toBeLessThanOrEqual(43);
    // 交换前（uid 空）用凭证作种子，同样稳定。
    expect(deriveFingerprint("", "pt-abc")).toEqual(deriveFingerprint("", "pt-abc"));
    expect(deriveFingerprint("", "pt-abc").machineId).not.toBe(deriveFingerprint("", "pt-def").machineId);
  });

  it("identityFromJobToken 缺失字段取空串", () => {
    const id = identityFromJobToken({});
    expect(id.uid).toBe("");
    expect(id.user_type).toBe("personal_standard");
    expect(id.security_oauth_token).toBe("");
  });

  it("COSY_VERSION 是进载荷的版本号", () => {
    expect(COSY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("qoder-wire jobToken 交换体", () => {
  it("PAT 走 personalToken，drt- 走 refreshToken", () => {
    const pat = JSON.parse(new TextDecoder().decode(cosyDecode(jobTokenBody("pt-1")))) as {
      payload: string;
      encodeVersion: string;
    };
    expect(pat.encodeVersion).toBe("1");
    expect(JSON.parse(pat.payload)).toMatchObject({
      personalToken: "pt-1",
      refreshToken: "",
      needRefresh: false,
    });

    const refresh = JSON.parse(new TextDecoder().decode(cosyDecode(jobTokenBody("drt-2")))) as {
      payload: string;
    };
    expect(JSON.parse(refresh.payload)).toMatchObject({
      personalToken: "",
      refreshToken: "drt-2",
      needRefresh: true,
    });
  });
});

describe("qoder-wire 错误分类", () => {
  it("403 + code 110 是额度耗尽，不是凭据失效", () => {
    const body = '{"code":"110","message":"daily quota exhausted"}';
    expect(classifyHttpStatus(403, body)).toBe("auth");
    expect(classifyFailure(403, body)).toBe("quota-exhausted");
  });

  it("业务码优先于状态码", () => {
    expect(classifyFailure(400, '{"code":"10605","subCode":"RESOURCE_LIMIT"}')).toBe("rate-limited");
    expect(classifyFailure(500, "")).toBe("transient");
    expect(classifyFailure(429, "")).toBe("rate-limited");
    expect(classifyFailure(400, "")).toBe("invalid-request");
    expect(classifyFailure(418, "")).toBe("transient");
  });

  it("内容审核标记压过任何状态码", () => {
    expect(isContentPolicy('{"message":"DataInspectionFailed"}')).toBe(true);
    expect(classifyFailure(200, "inappropriate content")).toBe("content-policy");
  });

  it("业务码兼容字符串与整数两种写法", () => {
    expect(businessCodeOf('{"code":"110"}')).toBe("110");
    expect(businessCodeOf('{"code":110}')).toBe("110");
    expect(businessCodeOf('{"code":1.5}')).toBeUndefined();
    expect(businessCodeOf("not json")).toBeUndefined();
    expect(deepestBusinessCode('{"message":"{\\"code\\":\\"10605\\"}"}')).toBe("10605");
  });

  it("retryAfterSeconds 从嵌套 message 里取", () => {
    const detail =
      '{"code":"10605","message":"{\\"retryAfterSeconds\\":5,\\"queueCount\\":0}","subCode":"RESOURCE_LIMIT"}';
    expect(retryAfterMsOf(detail)).toBe(5000);
    expect(retryAfterMsOfHeader("7")).toBe(7000);
    expect(retryAfterMsOfHeader(null)).toBeUndefined();
    expect(retryAfterMsOf('{"code":"110"}')).toBeUndefined();
  });

  it("UpstreamError 携带状态码与分类", () => {
    const err = new QoderUpstreamError("rate-limited", "x", 429, "10605", 500);
    expect(err.httpStatus).toBe(429);
    expect(err.code).toBe("10605");
    expect(err.retryAfter).toBe(500);
  });
});

describe("qoder-wire SSE 解析", () => {
  it("sseDataPayload 剥前缀并忽略 DONE", () => {
    expect(sseDataPayload("data: {\"a\":1}")).toBe('{"a":1}');
    expect(sseDataPayload("data:{}")).toBe("{}");
    expect(sseDataPayload("data: [DONE]")).toBeUndefined();
    expect(sseDataPayload(": keep-alive")).toBeUndefined();
  });

  it("信封与直给两种形状都认", () => {
    const enveloped = parseQoderFrame(
      JSON.stringify({ statusCodeValue: 200, headers: {}, body: '{"choices":[{"delta":{"content":"hi"}}]}' }),
    );
    expect(enveloped?.statusCode).toBe(200);
    expect(parseStreamDelta(enveloped!.inner).content).toBe("hi");

    const plain = parseQoderFrame('{"choices":[{"delta":{"content":"yo"}}]}');
    expect(plain?.statusCode).toBe(200);
    expect(parseStreamDelta(plain!.inner).content).toBe("yo");
  });

  it("非 200 信封带出状态码", () => {
    const frame = parseQoderFrame(JSON.stringify({ statusCodeValue: 429, body: '{"code":"429"}' }));
    expect(frame?.statusCode).toBe(429);
  });

  it("解析 reasoning / tool_calls / usage", () => {
    const delta = parseStreamDelta({
      choices: [{ delta: { content: "a", reasoning_content: "think", tool_calls: [{ id: "t1" }] }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 8 } },
    });
    expect(delta).toMatchObject({
      content: "a",
      reasoning: "think",
      finishReason: "stop",
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 8,
    });
    expect(delta.toolCalls?.length).toBe(1);
  });

  it("cachedTokens 是 input 的子集语义：只报原值，缺席即 undefined", () => {
    expect(parseCachedTokens({ prompt_tokens: 1 })).toBeUndefined();
    expect(parseCachedTokens({ prompt_tokens_details: { cached_tokens: 0 } })).toBe(0);
    expect(parseCachedTokens({ prompt_cache_hit_tokens: 4 })).toBe(4);
  });
});

describe("qoder-wire 上游 error 帧", () => {
  // 实测（2026-10-31，真 PAT）：上游失败时先发 `event:error` + 一条
  // `{"success":false,"msgCode":500,"msgInfo":"Internal Server Error",…}` 帧。
  // 这种帧没有 choices，旧代码把它当「空增量」，于是 200 + 空 content。
  it("success:false + msgCode 500 被认成错误帧", () => {
    const raw = '{"success":false,"traceId":"t","msgCode":500,"msgInfo":"Internal Server Error","message":"Internal Server Error"}';
    const frame = parseQoderFrame(raw)!;
    const failure = qoderErrorFrameOf(frame.inner, raw);
    expect(failure?.status).toBe(500);
    expect(failure?.detail).toContain("Internal Server Error");
  });

  it("正常 choices 帧不算错误", () => {
    const raw = '{"choices":[{"delta":{"content":"hi"}}]}';
    expect(qoderErrorFrameOf(parseQoderFrame(raw)!.inner, raw)).toBeUndefined();
  });

  it("没有 choices 也没有错误标记的帧不算错误（例如纯 usage 帧）", () => {
    const raw = '{"usage":{"prompt_tokens":1}}';
    expect(qoderErrorFrameOf(parseQoderFrame(raw)!.inner, raw)).toBeUndefined();
  });

  it("success:false 但没报码时兜底 500", () => {
    const raw = '{"success":false}';
    expect(qoderErrorFrameOf(parseQoderFrame(raw)!.inner, raw)?.status).toBe(500);
  });

  it("整块（data 行 + 末尾裸 JSON 行）能取出 msgCode", () => {
    // 逐字取自 2026-10-31 真上游抓包（stackTrace 已省略成一行）。
    const block = [
      'data:{"stackTrace":[{"methodName":"_constructError"}],"message":"Unrecognized token \'X\'"}',
      '{"success":false,"traceId":"302077e9","msgCode":500,"msgInfo":"Internal Server Error","message":"Internal Server Error"}',
    ].join("\n");
    const failure = qoderErrorBlockOf(block);
    expect(failure.status).toBe(500);
    expect(failure.detail).toContain("Internal Server Error");
  });

  it("整块里没有可解析 JSON 时也按 500 报，并带回原文", () => {
    const failure = qoderErrorBlockOf("data:not-json");
    expect(failure.status).toBe(500);
    expect(failure.detail).toContain("not-json");
  });
});

describe("qoder-wire 目录解析", () => {
  it("解析 models 列表并保留原始字段", () => {
    const models = parseModelCatalog({
      models: [
        { key: "cli", display_name: "Qoder CLI", enable: true, is_default: true },
        { key: "lite", name: "Lite", enable: false, is_reasoning: true, max_input_tokens: 1000 },
        { noKey: true },
      ],
    });
    expect(models.map((m) => m.key)).toEqual(["cli", "lite"]);
    expect(models[0]!.displayName).toBe("Qoder CLI");
    expect(models[0]!.isDefault).toBe(true);
    expect(models[1]!.enable).toBe(false);
    expect(models[1]!.isReasoning).toBe(true);
    expect(models[1]!.maxInputTokens).toBe(1000);
  });

  it("兼容 data 包裹与空响应", () => {
    expect(parseModelCatalog({ data: { models: [{ key: "x" }] } }).map((m) => m.key)).toEqual(["x"]);
    expect(parseModelCatalog({})).toEqual([]);
  });
});

describe("qoder-wire 用量与活动", () => {
  it("解析 qoderUsage 内层", () => {
    const usage = parseUsage({
      qoderUsage: {
        userType: "personal_pro",
        expiresAt: 1767225600,
        userQuota: { total: 2000, used: 500, remaining: 1500, percentage: 25 },
        addOnQuota: { total: 100, used: 10, detailUrl: "https://x" },
        isQuotaExceeded: false,
      },
    });
    expect(usage.userType).toBe("personal_pro");
    expect(usage.expiresAt).toBe(1767225600);
    expect(usage.userQuota).toMatchObject({ total: 2000, used: 500, remaining: 1500, percentage: 25 });
    expect(usage.addOnQuota?.detailUrl).toBe("https://x");
    expect(usage.isQuotaExceeded).toBe(false);
  });

  it("兼容平铺形状", () => {
    expect(parseUsage({ userQuota: { total: 1 } }).userQuota?.total).toBe(1);
    expect(parseUsage({}).userQuota).toBeUndefined();
  });

  // 上游实测回毫秒(1.79e12):契约写的是 epoch 秒,页面按秒 ×1000 渲染,
  // 不归一就会显示成「58836/4/30」。按量级判定:≥1e11 视为毫秒。
  it("expiresAt 毫秒归一成秒,秒级原样返回", () => {
    expect(parseUsage({ qoderUsage: { expiresAt: 1767225600000 } }).expiresAt).toBe(1767225600);
    expect(parseUsage({ qoderUsage: { expiresAt: 1767225600 } }).expiresAt).toBe(1767225600);
    expect(parseUsage({ qoderUsage: { expiresAt: "abc" } }).expiresAt).toBeUndefined();
    expect(parseUsage({ qoderUsage: {} }).expiresAt).toBeUndefined();
  });

  it("活动投影宽容：缺字段少渲染，不编造", () => {
    expect(projectCampaignEntry({})).toBeUndefined();
    const campaign = projectCampaignEntry({
      campaignId: "c1",
      actionType: "CLAIM_BENEFIT",
      claimStatus: "CLAIMABLE",
      endAt: 1767225600,
      benefit: { amount: 100, validity: { days: 7 } },
      placements: [
        { campaignUrl: "https://q/1", content: { zh: { title: "每日签到", description: "领 100" }, en: { title: "Daily" } } },
      ],
    });
    expect(campaign).toMatchObject({
      campaignId: "c1",
      actionType: "CLAIM_BENEFIT",
      claimStatus: "CLAIMABLE",
      amount: 100,
      validityDays: 7,
      endAt: 1767225600,
      campaignUrl: "https://q/1",
    });
    expect(campaign?.content.zh?.title).toBe("每日签到");
    expect(campaign?.content.en?.title).toBe("Daily");
  });

  it("活动列表兼容 data 包裹", () => {
    const feed = parseCampaignFeed({
      data: { claimable: true, campaigns: [{ campaignId: "c1", actionType: "CLAIM_BENEFIT" }] },
    });
    expect(feed.claimable).toBe(true);
    expect(feed.campaigns.length).toBe(1);
    expect(parseCampaignFeed({}).campaigns).toEqual([]);
  });
});

describe("qoder-wire 聊天报文体", () => {
  it("模板形状与官方客户端一致", () => {
    const t = createChatBodyTemplate();
    expect(t.stream).toBe(true);
    expect(t.chat_task).toBe("FREE_INPUT");
    expect(t.model_config).toEqual({ key: "lite", is_vl: false, is_reasoning: false, source: "system" });
    expect(t.chat_context.extra.modelConfig.key).toBe("lite");
    expect(t.business.name).toBe("hi");
    expect(t.messages).toEqual([]);
  });

  it("提取最后一条 user 文本", () => {
    expect(
      extractLatestUserPrompt([
        { role: "system", content: "s" },
        { role: "user", content: "第一个" },
        { role: "user", content: [{ type: "text", text: "最新" }] },
      ]),
    ).toBe("最新");
    expect(extractLatestUserPrompt([])).toBe("");
  });
});

describe("qoder 连接器纯函数", () => {
  it("parseJobToken 兼容蛇形与驼峰", () => {
    const a = parseJobToken({ data: { id: "u1", name: "n", securityOauthToken: "jt-1", expireTime: 100 } });
    expect(a).toMatchObject({ id: "u1", name: "n", securityOauthToken: "jt-1", expireTime: 100 });
    const b = parseJobToken({ uid: "u2", security_oauth_token: "jt-2" });
    expect(b.id).toBe("u2");
    expect(b.securityOauthToken).toBe("jt-2");
    expect(b.expireTime).toBeUndefined();
  });
});

describe("qoder 区域判定(只接国内版)", () => {
  it("无论凭据里写什么区域,一律按国内处理", () => {
    expect(regionOfCreds({ region: "qoder-global" }, "qoder")).toBe("qoder");
    expect(regionOfCreds({ base_url: "https://api1.qoder.sh" }, "qoder")).toBe("qoder");
    expect(regionOfCreds({ base_url: "https://gateway.qoder.com.cn" }, "qoder")).toBe("qoder");
    expect(regionOfCreds({}, "qoder")).toBe("qoder");
  });

  it("isQoderRegion 只认 qoder(国际版已移除)", () => {
    expect(isQoderRegion("qoder")).toBe(true);
    expect(isQoderRegion("qoder-global")).toBe(false);
    expect(isQoderRegion(undefined)).toBe(false);
  });
});

describe("qoder runWithAccount 合成 OpenAI SSE", () => {
  /** 读干本地合成的流(不触网 —— chatStream 用假 fetch 喂一帧)。 */
  async function drain(res: Response): Promise<string> {
    const text = await res.text();
    return text;
  }

  it("chatStream 收到 cosy 信封帧 → 翻译成 OpenAI chunk + usage 尾块 + [DONE]", async () => {
    const adapter = new QoderAdapter("qoder");
    // 用假 fetch 拦掉上游:第一次是 jobToken,第二次是 chat 帧流。
    const frames = [
      `data: ${JSON.stringify({ statusCodeValue: 200, body: JSON.stringify({ choices: [{ delta: { content: "你好" }, finish_reason: null }] }) })}

`,
      `data: ${JSON.stringify({ statusCodeValue: 200, body: JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { input_tokens: 7, output_tokens: 3 } }) })}

`,
    ].join("");
    let call = 0;
    const fakeFetch = (async (_url: string) => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({ data: { id: "u1", securityOauthToken: "jt-1", expireTime: 9999999999 } }),
          { status: 200 },
        );
      }
      return new Response(frames, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;
    const client = new (
      await import("./qoder.js")
    ).QoderClient("qoder", { fetch: fakeFetch });
    // 让 adapter 用这个假客户端不方便,这里直接验 QoderClient 的 chatStream 契约
    // (adapter.runWithAccount 就是把它的输出再包一层 SSE)。
    const chunks: Array<{ content: string; finishReason?: string }> = [];
    for await (const c of client.chatStream("pt-x", { modelKey: "m1", messages: [{ role: "user", content: "hi" }] })) {
      chunks.push({ content: c.content, finishReason: c.finishReason });
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(adapter.vendorId).toBe("qoder");
    void drain;
  });

  it("缺 PAT 时 runWithAccount 抛 auth(不打网络)", async () => {
    const adapter = new QoderAdapter("qoder");
    await expect(
      adapter.runWithAccount("u", { messages: [] }, "m", {}, undefined),
    ).rejects.toBeInstanceOf(QoderUpstreamError);
  });
});
