/**
 * 「会话粘性 = 不换账号」的供应商策略(用户 2026-10-30 定案)。
 *
 * 背景:SenseNova 的账号是**同一个上游账号池里的多个 API key**,换号对用户
 * 没有意义 —— 它换的不是「更好的上游」,而是「同一个服务的另一把钥匙」。用户
 * 的要求原话:
 *   「重做sensenova调度，不做账号切换机制，会话粘性期间不切换，超过粘性时间/
 *     新会话，选择一个空闲的账号（不同模型可以用同一个账号）即可」
 *
 * 三层含义,分别落在三个地方:
 * 1. **连接器层**(`connectors/sensenova.ts`):一次请求只用一个账号;429 时同号
 *    有界硬等,预算耗尽就抛可重试的 `rate_limit`(429 + Retry-After),**不换号**。
 * 2. **选路层**(本文件 → `engine-planner.ts`):已粘住的端点即使进了本地冷却,
 *    也**不解除粘性**(否则下一次请求就换到另一个账号了);粘性到期/新会话才会
 *    重新选一个空闲账号。
 * 3. **换档层**(`gateway-upstream-errors.ts` 的 {@link isStickyNoSwitchProvider}
 *    判据):该供应商的 `rate_limit` 失败**不触发换档重试** —— 重试会重新 plan,
 *    而重新 plan 就会落到同模型的另一个账号端点,等于绕过了第 1、2 层。
 *
 * ⚠️ 这条策略**只对限流有效**:401/403(凭据坏了)、400(请求本身有问题)
 * 仍然走原来的口径(key 自愈 / 直接报错),否则「不换号」会变成「永远钉死在
 * 一把坏钥匙上」。
 */

/** 命中即「会话粘性期间不换账号」的供应商 id。 */
export const STICKY_NO_SWITCH_PROVIDERS: ReadonlySet<string> = new Set(["sensenova"]);

/** 该 provider 是否属于「粘性期间不换号」一族(大小写不敏感,容忍空值)。 */
export function isStickyNoSwitchProvider(provider: string | null | undefined): boolean {
  if (typeof provider !== "string" || provider === "") return false;
  return STICKY_NO_SWITCH_PROVIDERS.has(provider.toLowerCase());
}
