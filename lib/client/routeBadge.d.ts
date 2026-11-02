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
export declare function AsOneCurrentModelBadge(props: AsOneCurrentModelBadgeProps): React.JSX.Element | null;
