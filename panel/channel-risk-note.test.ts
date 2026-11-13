/**
 * 渠道风险提示文案单测(2026-11-08)。
 *
 * 断言的重点不是措辞本身,而是**只有该提示的渠道才提示** ——
 * 一旦有人手滑给所有渠道都挂上「可能被封」,界面就成了狼来了。
 */

import { describe, expect, it } from "vitest";
import { WORKBUDDY_RISK_NOTE, providerRiskNote } from "./channel-risk-note.js";

describe("providerRiskNote", () => {
  it("WorkBuddy 有提示,且文案点明 11140 与「删凭据 + 熔断」的处置", () => {
    const note = providerRiskNote("workbuddy");
    expect(note).toBe(WORKBUDDY_RISK_NOTE);
    expect(note).toContain("11140");
    expect(note).toContain("熔断");
    expect(note).toContain("物理删除");
  });

  it("其它渠道不提示(空串,界面据此不挂 title)", () => {
    for (const p of ["trae", "minimax", "qoder", "sensenova", "openai", ""]) {
      expect(providerRiskNote(p)).toBe("");
    }
  });

  it("大小写/空格不影响判据?——**不影响才怪,这里刻意严格匹配**", () => {
    // provider id 是库里的小写机器值;写成大写说明调用方传错了 ID,
    // 此时宁愿不提示(静默)也不要给错渠道挂风险文案。
    expect(providerRiskNote("WorkBuddy")).toBe("");
    expect(providerRiskNote(" workbuddy ")).toBe("");
  });
});
