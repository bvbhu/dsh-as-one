/**
 * 输入框上方的「真实模型」胶囊(`conversation.input.dock`)。
 *
 * 为什么需要它:用户选的是**逻辑模型**(`auto` / `free` / `deepseek-flash`),
 * 但真正应答的是链里某个真实模型 —— 那个决策在网关内部(选路在请求到来时
 * 才发生:due-first / random / 亲和 / 抢占),DSH 界面完全看不到。于是
 * 「这条消息到底发给了谁」在界面上是黑洞,排障只能事后翻请求日志。
 *
 * ⚠️ 语义边界(刻意保守,不替调度器说话):
 * - 展示**最近一次已结束请求**实际命中的真实模型,不是「下一次会用谁」。
 *   会话亲和让人在同一会话里通常继续用同一个真实模型,所以这个值对
 *   「我现在在用谁」是诚实的近似 —— 措辞用「上次实际使用」而不是「当前」。
 * - **只对逻辑模型显示**。直连真实模型时,DSH 自己的模型选择器已经写着它是
 *   谁,再画一行是重复。
 * - 查不到(新会话还没跑过请求 / 滑出账本保留窗口 / 后端不可用)→ **什么都不画**。
 *   编一个「上次是 X」比空着更糟。
 *
 * 数据源是网关的**内存账本**(`getSessionRoute`),不是 JSONL 明细日志 ——
 * 后者在「不记录日志」档位下完全不写(用户定案),拿它当数据源会让这个胶囊
 * 在用户关掉日志后凭空消失。
 */
import React from "react";
export type AsOneRouteDockProps = {
    /** 宿主按会话注入(`session-maybe` 作用域);无会话时可能是空串。 */
    sessionId?: string;
};
export declare function AsOneRouteDock({ sessionId }: AsOneRouteDockProps): React.JSX.Element | null;
