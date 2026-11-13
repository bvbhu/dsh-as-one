/**
 * 输入框内的「当前请求真实模型」徽标(`conversation.input.left`)。
 *
 * ## 为什么在这个槽位
 *
 * 用户 2026-11-01 定案:位置**严格对齐 dsh-connect 系列**(qoder / trae / workbuddy
 * 把积分读数放在 `conversation.input.left`)—— 就是输入框卡片里那一行工具条,
 * 不是输入框上方、也不是面板里。选的正是同一个槽位:它是 **list 型**、
 * 会话作用域,多插件可以并排各占一格,不存在 `single` 槽位的互相顶替问题
 * (上一版用的 `conversation.input.dock` 在输入框**外面**,用户明确否掉)。
 *
 * ## 为什么显示「当前」而不是「上次」
 *
 * 用户选的是**逻辑模型**(`auto` / `free` / 自建档链),真正应答的是链里某个真实
 * 模型;选路发生在网关内部、请求时刻(亲和 / 抢占 / 失败换成员),DSH 侧完全看不到。
 * 上一版显示的是「上次已结束请求命中的真实模型」—— 用户看了一天的过去式,否掉了。
 *
 * 现在的口径:
 * - 有请求在跑 → 那个请求**此刻**在用的真实模型(网关在途账本,精确值);
 * - 空闲 → 会话亲和 pin 指向的下一跳(下一条消息预计使用),淡显;
 * - 都查不到 → **什么都不画**。比编一个「上次是 X」诚实。
 *
 * ## 为什么供应商单独一枚标签
 *
 * 同一台真实模型(同 provider/model)往往在多个渠道下都有端点,而「哪家在应答」
 * 恰恰是用户最想确认的事 —— 但 `display_name`(`Seed-2.1-Pro`)里没有它。所以
 * provider 既不拼进名字(截断时先丢的就是模型名),也不塞进 `title`(得悬停才看得见),
 * 而是紧跟在状态词后面占一枚淡色标签。
 *
 * ## 为什么轮询而不订阅
 *
 * 选路结果只有网关知道,DSH 事件里没有它。轮询自己的面板接口是最小实现:
 * 会话级 HTTP 一次往返,2s 一次;请求进行中时徽标最多滞后 2s —— 对「我在用谁」
 * 这个问题足够。
 */

import React from "react";
import type { SessionCurrentRoute } from "@as-one/panel-ui";

import { AS_ONE_PROVIDER_ID, fetchSessionCurrentRoute } from "./api.js";

/** 轮询间隔(ms):略快于「发一条消息」的节奏,又不至于把面板接口当心跳。 */
const POLL_MS = 2000;

/** 宿主注入的会话标准属性(只声明我们用到的两个,零宿主依赖)。 */
export type AsOneCurrentModelBadgeProps = {
  /** 宿主按会话注入(`session-maybe` 作用域;无会话时可能是空串)。 */
  sessionId?: string;
  /**
   * 会话投影读取钩子(宿主标准属性)。`modelSelection` 给出本会话**选中的**
   * 模型 —— 用它做两件事:只在本插件当值时渲染、以及把亲和 pin 翻回真实模型。
   *
   * 宿主版本较老时它可能不存在:那时降级成「只显示在途请求」(不传模型名),
   * 而不是整块消失。
   */
  useProjection?: (name: string) => unknown;
};

/** `modelSelection` 投影里我们需要的部分(其余字段不关心)。 */
type ModelSelectionLike = {
  next?: { provider?: unknown; model?: unknown };
  lastUsed?: { provider?: unknown; model?: unknown };
};

/** 本会话选中的 provider/model;`next` 优先于 `lastUsed`(与选择器同口径)。 */
function selectionOf(projection: unknown): { provider: string; model: string } | null {
  if (projection === null || typeof projection !== "object") return null;
  const typed = projection as ModelSelectionLike;
  const picked = typed.next ?? typed.lastUsed;
  if (picked === null || picked === undefined) return null;
  const provider = typeof picked.provider === "string" ? picked.provider : "";
  const model = typeof picked.model === "string" ? picked.model : "";
  if (provider === "" || model === "") return null;
  return { provider, model };
}

/**
 * 真实模型的**名字**部分(不含供应商)。
 *
 * 展示名优先用库里的 `name`(人话,如 `Seed-2.1-Pro`);库里没有则退回
 * `model_id`。**不再拼 `provider/`** —— 供应商由旁边那枚独立小标签承担,
 * 拼进名字里会重复,而且一截断就只剩 `sensenova/deep…` 看不出模型是谁。
 */
function realNameOf(route: SessionCurrentRoute): string {
  return route.display_name !== null && route.display_name !== ""
    ? route.display_name
    : route.model;
}

/**
 * 逻辑模型的**人话名字**(不含「→」那半边)。
 *
 * 服务端填的 `logical_display_name` 是 `logical_model.display_name`(库里没有时
 * 它已回退成逻辑名,所以有值时就是人话)。老宿主没这个字段时退回 `logical_model`
 * —— 显示最好还是显示名,但绝不编一个出来。
 */
export function logicalLabelOf(route: SessionCurrentRoute): string | null {
  const name = route.logical_display_name ?? route.logical_model;
  return name !== null && name !== "" ? name : null;
}

/** 徽标正文:逻辑模型带「→ 真实模型」,直连真实模型只显示它自己。 */
export function labelOf(route: SessionCurrentRoute): string {
  const real = realNameOf(route);
  // 逻辑模型的人话名由服务端给(`logical_model.display_name`,查不到时它已回退
  // 成逻辑名);老宿主没有这个字段时退回 `logical_model`。
  const logical = route.is_logical ? logicalLabelOf(route) : null;
  return logical !== null ? `${logical} → ${real}` : real;
}

/** 徽标正文里那枚供应商标签的文案:人话名优先,查不到就用 provider id 本身。 */
export function providerLabelOf(route: SessionCurrentRoute): string {
  return route.provider_display_name ?? route.provider;
}

/**
 * 上面三个纯函数 `export` 出来是为了单测(斑标文案就是这么定的,不能靠人眼)。
 * 组件本身只从 `AsOneCurrentModelBadge` 那个入口暴露给宿主。
 */

/** 一句话说明数据来源,放在 title 里(不占正文宽度)。 */
function titleOf(route: SessionCurrentRoute): string {
  const base = `真实模型:${providerLabelOf(route)}/${route.model}`;
  return route.in_flight
    ? `本次请求正在使用 ${base}(网关在途账本,${POLL_MS / 1000}s 刷新)`
    : `下一条消息预计使用 ${base}(会话亲和钉住的成员;规则变动会重新选路)`;
}

export function AsOneCurrentModelBadge(
  props: AsOneCurrentModelBadgeProps,
): React.JSX.Element | null {
  const sid = typeof props.sessionId === "string" ? props.sessionId : "";
  const projection =
    typeof props.useProjection === "function"
      ? props.useProjection("modelSelection")
      : undefined;
  const selection = selectionOf(projection);
  const mine = selection !== null && selection.provider === AS_ONE_PROVIDER_ID;
  const model = mine ? selection.model : "";
  const [route, setRoute] = React.useState<SessionCurrentRoute | null>(null);

  React.useEffect(() => {
    if (sid === "" || !mine) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    const load = (): void => {
      void fetchSessionCurrentRoute(sid, model)
        .then((next) => {
          if (!cancelled) setRoute(next);
        })
        .catch(() => {
          // 后端不可用 / 路由未注册 → 当作「查不到」:不画,也不刷错误提示。
          if (!cancelled) setRoute(null);
        });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sid, model, mine]);

  // 别家 provider 当值 → 不画(不抢 dsh-connect 的地盘);查不到 → 不画。
  if (!mine || route === null) return null;
  // 直连真实模型**也画**(2026-11-02 用户定案):虽然 DSH 选择器已写着模型名,
  // 但那里**不带供应商** —— 同一台模型挂在几个渠道下时,看不出是哪个渠道应答。
  // 这条徽标的价值不只是「逻辑 → 真实」的映射,还包括供应商这一层。

  const dotColor = route.in_flight
    ? "var(--dsw-alias-state-business-primary, #2ea043)"
    : "var(--dsw-alias-label-tertiary, #8b94a3)";
  return (
    <span
      data-as-one-current-model=""
      title={titleOf(route)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        maxWidth: 300,
        fontSize: 11,
        lineHeight: "16px",
        color: route.in_flight
          ? "var(--dsw-alias-label-secondary, #4c5563)"
          : "var(--dsw-alias-label-tertiary, #8b94a3)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: "0 0 auto",
          width: 6,
          height: 6,
          borderRadius: 3,
          background: dotColor,
        }}
      />
      <span style={{ flex: "0 0 auto", opacity: 0.75 }}>
        {route.in_flight ? "正在使用" : "预计使用"}
      </span>
      {/* 供应商:同一台真实模型可能由不同渠道供着(sensenova / qoder / trae …),
          只写模型名分不出是哪个渠道在应答,所以单独占一枚小标签。标签文案取服务端
          给的 `provider_display_name`(人话名,未知 provider 时就是 id 本身 ——
          宁可显示 id,不编名),而不是在这猜映射。 */}
      {route.provider !== "" && (
        <span
          data-as-one-current-model-provider=""
          title={`供应商:${providerLabelOf(route)}`}
          style={{
            flex: "0 0 auto",
            maxWidth: 96,
            padding: "0 4px",
            borderRadius: 3,
            fontSize: 10,
            lineHeight: "14px",
            color: "var(--dsw-alias-label-tertiary, #8b94a3)",
            background: "var(--dsw-alias-bg-secondary, rgba(127, 127, 127, 0.12))",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {providerLabelOf(route)}
        </span>
      )}
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {labelOf(route)}
      </span>
    </span>
  );
}
