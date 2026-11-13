/**
 * 徽标文案单测 —— 输入框徽标那几个字,就是这里算出来的。
 *
 * 覆盖的规则只有一条要紧的:**显示人话名,不显示裸 id**。
 * - 逻辑模型:用来自服务端的 `logical_display_name`(`logical_model.display_name`);
 *   字段缺失(老宿主)时退回 `logical_model`,绝不编名;
 * - 供应商:用 `provider_display_name`(服务端唯一映射给的名字);字段缺失时退回
 *   `provider` id —— **未知渠道就是显示 id**,这跟服务端一样,是「宁可不编」。
 *
 * 只测纯函数(`labelOf` / `providerLabelOf` / `logicalLabelOf`),不测 React 渲染 ——
 * 文案的口径才是要锁住的东西;渲染只有 40 行内联样式,渲染错不在字形上错。
 */

import { describe, expect, it } from "vitest";
import type { SessionCurrentRoute } from "@as-one/panel-ui";

import { labelOf, logicalLabelOf, providerLabelOf } from "../src/client/routeBadge.js";

/** 本次需求的原始场景:`qoder(Auto → Qwen3.8-Flash)`。 */
function route(over: Partial<SessionCurrentRoute> = {}): SessionCurrentRoute {
  return {
    logical_model: "auto",
    logical_display_name: "Auto",
    real_model_id: "qoder/qwen3.8-flash",
    provider: "qoder",
    model: "qwen3.8-flash",
    display_name: "Qwen3.8-Flash",
    provider_display_name: "Qoder",
    is_logical: true,
    in_flight: true,
    ...over,
  };
}

describe("徽标文案(`labelOf`)", () => {
  it("用户点名的那条:`Auto → Qwen3.8-Flash`(不是 `auto → Qwen3.8-Flash`)", () => {
    expect(labelOf(route())).toBe("Auto → Qwen3.8-Flash");
  });

  it("逻辑模型名就是 id 本身(库里没填 display_name)时,显示名也还是它自己", () => {
    // 服务端在 `routeOf` 里已经把空 display_name 回退成逻辑名了,这里看到的就是回退后。
    expect(labelOf(route({ logical_display_name: "auto" }))).toBe("auto → Qwen3.8-Flash");
  });

  it("老宿主没传 `logical_display_name` → 退回 `logical_model`", () => {
    expect(labelOf(route({ logical_display_name: null }))).toBe("auto → Qwen3.8-Flash");
  });

  it("`logical_display_name` 与 `logical_model` 都没有 → 不画「→」,只显示真实模型名", () => {
    expect(labelOf(route({ logical_model: null, logical_display_name: null }))).toBe(
      "Qwen3.8-Flash",
    );
  });

  it("直连真实模型(is_logical=false)→ 只显示模型名,不带箭头", () => {
    expect(
      labelOf(
        route({
          logical_model: "qoder/qwen3.8-flash",
          logical_display_name: "qoder/qwen3.8-flash",
          is_logical: false,
        }),
      ),
    ).toBe("Qwen3.8-Flash");
  });

  it("库里连真实模型名都没有 → 退回 `model` id(原行为,不动)", () => {
    expect(labelOf(route({ display_name: null }))).toBe("Auto → qwen3.8-flash");
  });
});

describe("供应商标签(`providerLabelOf`)", () => {
  it("已知渠道显示人话名", () => {
    expect(providerLabelOf(route())).toBe("Qoder");
    expect(providerLabelOf(route({ provider: "sensenova", provider_display_name: "SenseNova" }))).toBe(
      "SenseNova",
    );
  });

  it("未知渠道原样显示 id(不编名)", () => {
    expect(providerLabelOf(route({ provider: "acme", provider_display_name: "acme" }))).toBe("acme");
  });

  it("老宿主没传 `provider_display_name` → 退回 `provider` id", () => {
    expect(providerLabelOf(route({ provider_display_name: null }))).toBe("qoder");
  });
});

describe("`logicalLabelOf`", () => {
  it("空串与 null 都当作「没名字」,返回 null", () => {
    expect(logicalLabelOf(route({ logical_model: null, logical_display_name: null }))).toBeNull();
    expect(logicalLabelOf(route({ logical_display_name: "", logical_model: "" }))).toBeNull();
  });
});
