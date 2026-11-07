/**
 * WorkBuddy 渠道级**彻底熔断**(2026-11-07 用户定案)。
 *
 * ## 为什么是「物理删除 + 熔断」而不是「冷却窗口」
 *
 * 上游对反代行为的处置是业务码 **11140**(「账号存在异常行为,已被限制使用」)。
 * 调研项目 `ardeyouxipianyi/workbuddy2api-hub` 的原文警告:
 *
 * > 看到 11140 立即停手,解封前**严禁换号继续打同一台设备**,否则**设备指纹会连坐**。
 *
 * 也就是说,「给个冷却窗口然后换号重试」正是**加剧封禁**的行为。用户的要求:
 *
 * > 我确认,就是异常后彻底熔断,冷静,修复后再添加账号
 *
 * 所以这里的语义是:
 *   1. 命中 11140 → **物理删除**该 provider 下**全部**凭据行(`credential` 表真删);
 *   2. 同时写一条**持久化熔断标记**(DB `setting` 表,重启后仍在);
 *   3. 熔断期间网关**在选路之前**就跳过该 provider,任何请求都到不了上游;
 *   4. 恢复只能人工:清掉熔断标记 → 重新从客户端导出并添加账号。
 *
 * ## 为什么删除而不是停用
 *
 * 停用(accountOverlay=false)会留下凭据,而只要凭据还在,任何一个漏掉 overlay
 * 判断的代码路径都可能拿它去打上游 —— 对「设备指纹连坐」这个风险来说,
 * 留一条可能漏发的路径就是不可接受。物理删除让「不可能再发」成为结构性保证。
 * 代价是凭据不可恢复,用户明确接受(解封后重新导入)。
 */
import type { NexusDatabase } from "@as-one/core/src/db/database.js";
import type { CredentialVault } from "@as-one/core/src/config/credentials.js";
/** 熔断标记在 `setting` 表的键。 */
export declare const WB_BREAKER_SETTING_KEY = "provider.workbuddy.breaker";
/** 触发熔断的上游业务码。 */
export declare const WB_BAN_CODE = 11140;
/** 熔断标记的持久化形状(JSON)。 */
export interface WorkbuddyBreakerState {
    /** 触发时刻(epoch 毫秒)。 */
    trippedAtMs: number;
    /** 触发原因(上游原文摘要)。 */
    reason: string;
    /** 本次熔断物理删除了多少个凭据(供面板显示「删了几个」)。 */
    removedAccounts: number;
}
/**
 * 读熔断状态。返回 `null` = 未熔断(正常可用)。
 *
 * 解析失败按「未熔断」处理并清掉坏值:坏 JSON 不应该把渠道永久锁死,
 * 那会让用户完全无法恢复。
 */
export declare function readWorkbuddyBreaker(db: NexusDatabase): WorkbuddyBreakerState | null;
/** 渠道当前是否处于熔断态。 */
export declare function isWorkbuddyBreakerTripped(db: NexusDatabase): boolean;
/**
 * 人工清除熔断(恢复路径的第一步)。
 *
 * ⚠️ 只清标记,**不恢复凭据** —— 凭据已在熔断时被物理删除,必须重新导入。
 * 返回是否真的清掉了一条标记(没熔断时返回 false,便于面板提示)。
 */
export declare function clearWorkbuddyBreaker(db: NexusDatabase): boolean;
/**
 * 触发熔断:物理删除该 provider 全部凭据 + 写持久化标记。
 *
 * 幂等:重复触发不会报错(第二次删不到东西,标记会被更新为最新一次的原因)。
 * 删除失败的账号会被计入 `failedAccounts` 并原样保留在库里 —— 宁可留下记录
 * 让用户看见「这几个没删掉」,也不要静默假装删干净了。
 *
 * @returns 删除统计 + 最终熔断状态
 */
export declare function tripWorkbuddyBreaker(db: NexusDatabase, vault: CredentialVault, provider: string, reason: string): Promise<{
    state: WorkbuddyBreakerState;
    removedAccounts: number;
    failedAccounts: string[];
}>;
/**
 * 从一条上游错误消息里识别 11140。
 *
 * 为什么用消息而不是结构化字段:`classify_workbuddy_error` 是 core 的纯函数
 * (不碰 DB),它已经把 `code 11140` 写进了 message;网关侧读 message 比给
 * `UpstreamError` 加新字段的侵入面小得多。格式固定为
 * `账号存在异常行为,已被限制使用(code 11140)`。
 */
export declare function isWorkbuddyBanMessage(message: string): boolean;
