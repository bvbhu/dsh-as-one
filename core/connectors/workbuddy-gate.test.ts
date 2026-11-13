/**
 * workbuddy-gate 测试 —— 镜像 dsh-connect-workbuddy 插件 issue #98 的三道门:
 * 门 A(开头指纹→中性头)、门 B(中段指纹→零宽扰动)、报错回显读宿主原文。
 */
import { describe, expect, it } from "vitest";
import * as gate from "./workbuddy-gate.js";
import {
  CHANNEL_REJECT_TIP,
  KNOWN_CHANNEL_OPENINGS,
  channelRejectMessage,
  isChannelRejectDetail,
  isWorkbuddyWire,
  matchesKnownOpening,
  neutralizeChannelFingerprints,
  neutralizeText,
  perturbChannelFingerprints,
  perturbText,
  systemOpeningsOf,
  WORKBUDDY_NEUTRAL_HEAD,
} from "./workbuddy-gate.js";

const DSH_OPENING = "You are an AI agent powered by DeepSeek Harness.";

describe("matchesKnownOpening / neutralizeText(门 A)", () => {
  it("命中已知指纹(忽略前导空白)", () => {
    expect(matchesKnownOpening(DSH_OPENING)).toBe(true);
    expect(matchesKnownOpening(`  \n${DSH_OPENING}`)).toBe(true);
    expect(matchesKnownOpening(KNOWN_CHANNEL_OPENINGS[1])).toBe(true);
  });

  it("不命中普通提示", () => {
    expect(matchesKnownOpening("You are a helpful assistant.")).toBe(false);
    expect(matchesKnownOpening("你是腾讯云 CodeBuddy 的 AI 编程助手。")).toBe(false);
  });

  it("neutralizeText 保留前导空白,中性头 + 空行 + 原文", () => {
    const out = neutralizeText(`\n\n${DSH_OPENING}\n后续内容`);
    expect(out).toBe(`\n\n${WORKBUDDY_NEUTRAL_HEAD}\n\n${DSH_OPENING}\n后续内容`);
  });

  it("宿主的 ACP 标记也算开头指纹(2026-10-31 实测 11128)", () => {
    // <acp tokens="1.7K" type="text">m35968</acp> —— 上游把 assistant 以它开头
    // 判成 agent 指纹;它不是任何一句已知英文,旧实现一律 false。
    expect(matchesKnownOpening('<acp tokens="1.7K" type="text">m35968</acp>')).toBe(true);
    expect(matchesKnownOpening('  <acp tokens="490" type="text">m35969</acp>')).toBe(true);
    // 正文里出现(不在开头)不算开头指纹 —— 交给门 B 的标签断点处理。
    expect(matchesKnownOpening('上一轮的正文。<acp tokens="1" type="text">m1</acp>')).toBe(false);
    // 普通尖括号/比较式不许误判。
    expect(matchesKnownOpening("<acpx>")).toBe(false);
    expect(matchesKnownOpening("<div>hi</div>")).toBe(false);
  });
});

describe("neutralizeChannelFingerprints(门 A)", () => {
  it("system 消息开头命中 → 前缀中性头,其余消息原样", () => {
    const messages = [
      { role: "system", content: `${DSH_OPENING}\n\n当前实现 checkout 在 D:\\dsh\\` },
      { role: "user", content: "你好" },
      { role: "assistant", content: "我是助手。" },
    ];
    const out = neutralizeChannelFingerprints(messages);
    expect(out).not.toBe(messages);
    expect((out![0] as { content: string }).content.startsWith(WORKBUDDY_NEUTRAL_HEAD)).toBe(true);
    expect(out![1]).toBe(messages[1]);
    expect(out![2]).toBe(messages[2]);
  });

  it("assistant 历史消息开头命中 → 同样归一化(issue:assistant 也被独立扫)", () => {
    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "assistant", content: `${DSH_OPENING}\n重复 system 的内容` },
    ];
    const out = neutralizeChannelFingerprints(messages);
    expect((out![1] as { content: string }).content.startsWith(WORKBUDDY_NEUTRAL_HEAD)).toBe(true);
  });

  it("content 是 parts 数组 → 逐 text part 处理,非文本 part 原样(issue:命中第 2 个 part)", () => {
    const messages = [
      {
        role: "system",
        content: [
          { type: "text", text: "普通开头" },
          { type: "text", text: `${DSH_OPENING}\n内容` },
          { type: "image_url", image_url: { url: "data:image/png;base64,xxx" } },
        ],
      },
    ];
    const out = neutralizeChannelFingerprints(messages);
    const parts = (out![0] as { content: Array<{ type?: string; text?: string }> }).content;
    expect(parts[0].text).toBe("普通开头");
    expect(parts[1].text?.startsWith(WORKBUDDY_NEUTRAL_HEAD)).toBe(true);
    expect(parts[2].type).toBe("image_url");
  });

  it("全不命中 → 返回原数组(不无谓篡改正常请求)", () => {
    const messages = [
      { role: "system", content: "You are a helpful assistant.\n\n正常提示" },
      { role: "user", content: "hi" },
    ];
    expect(neutralizeChannelFingerprints(messages)).toBe(messages);
  });

  it("user / tool 消息不归一化(issue:user/tool 不扫)", () => {
    const messages = [
      { role: "user", content: `${DSH_OPENING}\n用户消息里说` },
      { role: "tool", content: `${DSH_OPENING}` },
    ];
    expect(neutralizeChannelFingerprints(messages)).toBe(messages);
  });
});

describe("perturbText / perturbChannelFingerprints(门 B)", () => {
  it("句读后插 U+200B,词不改", () => {
    const src = "You are interacting with the user through the DeepSeek Harness Web GUI. They mean this GUI.";
    const out = perturbText(src);
    expect(out).toContain("GUI.\u200b They");
    expect(out.replace(/\u200b/g, "")).toBe(src);
  });

  it("中文句读也插;西文句读须后随空白,URL/小数里的点不插", () => {
    const src = "第一条。第二条! 第三条? 链接 https://a.b/c 值 3.14 结尾. ";
    const out = perturbText(src);
    expect(out).toContain("第一条。\u200b第二条");
    expect(out).toContain("第二条!\u200b 第三条");
    expect(out).toContain("a.b/c"); // 点后跟字母 → 不插
    expect(out).toContain("3.14"); // 小数 → 不插
    expect(out).toContain("结尾.\u200b "); // 点后随空白 → 插(行尾无空白则不动)
    // 中文句读不要求空白,西文句读要求 —— 这是「避开 URL/小数」的代价:
    // 紧贴中文字符的西文 !? 不动(URL/小数同理),长串指纹由中文句读与大写词边界覆盖。
    expect(perturbText("第二条!第三条")).toBe("第二条!第三条");
  });

  it("逐消息扰动,返回新数组;user/tool 不动", () => {
    const messages = [
      { role: "system", content: "Web GUI 段。第二句。" },
      { role: "user", content: "你好" },
    ];
    const out = perturbChannelFingerprints(messages)!;
    expect(out).not.toBe(messages);
    expect((out[0] as { content: string }).content).toContain("\u200b");
    expect((out[1] as { content: string }).content).toBe("你好");
  });

  it("#113:词内断点 —— 结尾无标点的裸产品名也被截断", () => {
    // 只按句读插零宽时,"DeepSeek Harness" 一个句读都没有 → 指纹原样发出,救援空转。
    const src = "You are an AI agent powered by DeepSeek Harness";
    const out = perturbText(src);
    expect(out).not.toContain("DeepSeek Harness");
    expect(out.replace(/\u200b/g, "")).toBe(src);
    // 词本身不改(只是词边界插零宽)。
    expect(out.replace(/\u200b/g, "")).toContain("DeepSeek");
    expect(out).toContain("DeepSeek\u200b");
    expect(out).toContain("Harness");
  });

  it("ACP 标记:标签名/属性边界插零宽(2026-10-31,无句读无大写词也拦得住)", () => {
    // 旧实现四条规则全落空:没有 .!?。、没有 ,;、没有两个大写词相邻 → out === src。
    const src = '<acp tokens="1.7K" type="text">m35968</acp>';
    const out = perturbText(src);
    expect(out).not.toBe(src);
    expect(out.replace(/\u200b/g, "")).toBe(src); // 一个字符都没改,只插零宽
    expect(out).toContain("<acp\u200b");
    expect(out).toContain("tokens\u200b=");
    expect(out).not.toContain("<acp ");
    expect(out).toContain("</acp\u200b>");
  });

  it("普通尖括号/比较式不被当成标签切开", () => {
    // 标签名后必须紧跟空白 / > / / 才落点。
    expect(perturbText("if (a<b1) x=1;")).toBe("if (a<b1) x=1;");
    expect(perturbText("3<4 and 5>2.")).toContain("3<4 and 5>2.");
  });
});

describe("isChannelRejectDetail", () => {
  it("识别 11128 / 渠道校验 / channel_reject / 不是官方客户端", () => {
    expect(isChannelRejectDetail("渠道校验拦截(code 11128):x")).toBe(true);
    expect(isChannelRejectDetail("code 11128")).toBe(true);
    expect(isChannelRejectDetail("channel_reject")).toBe(true);
    expect(isChannelRejectDetail("该请求被上游按参数拒绝:与网络、账号、额度都无关")).toBe(false);
  });

  it("#113:按 code 认一族 —— msg 写着 conversation id missing 的也入族", () => {
    // #113 实测:内容拒绝的 msg 写着 conversation id missing,而三个会话头全带着。
    // 旧实现按措辞排除 → 判成普通 client → neutralize/perturb 阶梯空转。
    expect(isChannelRejectDetail('{"code":11128,"msg":"conversation id missing"}')).toBe(true);
    expect(isChannelRejectDetail('{"code":11128,"msg":"first message is not system prompt"}')).toBe(true);
    expect(isChannelRejectDetail("code 11128, requestId abc")).toBe(true);
  });

  it("#113:requestId 里的数字不算(11128 要带引号键或 code 前缀)", () => {
    expect(isChannelRejectDetail('{"requestId":"b1112801ff"}')).toBe(false);
    expect(isChannelRejectDetail("id 111280 x")).toBe(false);
  });
});

describe("systemOpeningsOf / channelRejectMessage(报错回显读宿主原文)", () => {
  it("列出每条 system/assistant 首行(上限 3),user 不列", () => {
    const messages = [
      { role: "system", content: "You are a helpful assistant.\n\n内文" },
      { role: "user", content: "你好" },
      { role: "assistant", content: `${DSH_OPENING}\n重放` },
      { role: "system", content: "第三条\n\n内容" },
      { role: "system", content: "第四条" },
    ];
    const out = systemOpeningsOf(messages);
    expect(out).toEqual([
      "system:You are a helpful assistant.",
      `assistant:${DSH_OPENING}`,
      "system:第三条",
    ]);
  });

  it("channelRejectMessage 带中性头提示与命中开头(不把中性头当命中)", () => {
    const messages = [{ role: "system", content: `${DSH_OPENING}\n\n正常提示` }];
    const msg = channelRejectMessage(messages);
    expect(msg).toContain(`「system:${DSH_OPENING}」`);
    expect(msg).not.toContain(WORKBUDDY_NEUTRAL_HEAD);
    expect(msg).toContain(CHANNEL_REJECT_TIP);
  });
});

/**
 * 2026-10-31 用户定案:**只看 protocol**,收回 2026-10-28 的「按名字放宽」。
 *
 * 上游把那个问题解决了,用户的原话是「撤销对除 WorkBuddy 以外的提示词改写,
 * 上游解决了这个问题」「workbuddy_yn 直接按普通 openai 走就行」。
 * 网关没有资格因为一个 provider 起了什么名字,就去改写别人的提示词。
 *
 * 历史(别再走回去):名字判据 → 定制报文 → 401;名字判据 → 闸门 →
 * workbuddy_yn 被强行改提示词。
 */
describe("isWorkbuddyWire(唯一判据:protocol === 'workbuddy')", () => {
  it("线格式:只有 protocol === workbuddy", () => {
    expect(isWorkbuddyWire("workbuddy")).toBe(true);
    expect(isWorkbuddyWire("openai")).toBe(false);
    expect(isWorkbuddyWire("trae")).toBe(false);
    expect(isWorkbuddyWire("sensenova")).toBe(false);
    expect(isWorkbuddyWire("")).toBe(false);
    expect(isWorkbuddyWire(null)).toBe(false);
    expect(isWorkbuddyWire(undefined)).toBe(false);
  });

  it("workbuddy_yn(protocol=openai)不吃闸门、不改提示词 —— 按普通 OpenAI 直连", () => {
    // 它确实是 protocol=openai(用户自建、base_url 指向转售站)。
    // 2026-10-31 之前它按名字被卷进来,现在不卷了。
    expect(isWorkbuddyWire("openai")).toBe(false);
  });

  it("已移除的按名字判据不再导出(防止有人顺手加回来)", () => {
    // @ts-expect-error 2026-10-31 删除:按名字放宽的判据
    expect(gate.isWorkbuddyGateFamily).toBeUndefined();
    // @ts-expect-error 2026-10-31 删除:闸门 = 提示词覆盖的别名
    expect(gate.isWorkbuddyPromptFamily).toBeUndefined();
    // @ts-expect-error 2026-10-31 删除:最老的合并判据
    expect(gate.isWorkbuddyFamily).toBeUndefined();
  });
});