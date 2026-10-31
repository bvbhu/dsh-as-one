/**
 * 网关 resolveUpstream 注入 —— 把「调度器链 → Router 选路 → 凭据 → 连接器装饰 →
 * fetch 上游」串成 gateway 需要的 Upstream(stream/complete/hasModel)。
 *
 * 契约:packages/core/src/gateway/types.ts 的 Upstream / UpstreamRequest /
 * UpstreamError(网关版,kind+detail);注入方负责真实网络(网关核心零网络)。
 *
 * 流程图(每请求):
 *   resolveUpstream(model) → scheduler.chain(model) 取链
 *   → upstream.stream/complete: router.plan({chain, sessionId, needsVision})
 *     → plan.item 为空 ⇒ 抛 UpstreamError(无可用上游)
 *     → router.commit(占并发) → 连接器 getToken/decorateRequest → fetch
 *     → router.finish(记结果/释放) → scheduler.invalidate()(清 TTL 缓存)
 *
 * 上游线层(wire)按协议分派,URL/报文体/SSE 解析全在
 * packages/core/src/connectors/{trae,workbuddy}-wire.ts 与
 * stream-aggregate.ts 里(纯函数可测),本文件只 import 不编辑 core:
 * - openai(兼容):${base}/chat/completions,bodyFor,SSE data 行;
 * - trae:        resolve_api_base + /api/agent/v3/llm_utils_chat,
 *                trae 专用报文体,SseParser+decode+ChunkBuilder;
 * - workbuddy:   REGION_BASES + /v2/chat/completions,stream_options,
 *                data 行 + XML 工具副本过滤;
 * - sensenova:   DEFAULT_BASE_URL + /chat/completions,data 行 + 心跳丢块。
 */
import { UpstreamError, UpstreamErrorKind } from "@as-one/core/src/gateway/types.js";
import { allBusyError } from "@as-one/core/src/gateway/server.js";
import { aggregateCompletion } from "@as-one/core/src/connectors/stream-aggregate.js";
import { DEFAULT_FACTOR, RetryPolicy } from "@as-one/core/src/scheduler/backoff.js";
import { FREE_PARSE_MODEL, FREE_PARSE_PROMPT, IMAGE_HARD_LIMIT, dropExcessImages, imagePartIndices, tryParseImages, } from "@as-one/core/src/gateway/image-bridge.js";
import { isWorkbuddyWire, } from "@as-one/core/src/connectors/workbuddy-gate.js";
// 思考强度映射(精确 → 就近 → 保底)放在 core 里,这样能用例钉死(electron 无测试运行器)。
import { resolveReasoningEffort } from "@as-one/core/src/gateway/reasoning-effort.js";
/**
 * 内置缺省重试策略 —— 与 Nexus `core/backoff.py:RETRY_DEFAULTS` 同值。
 * 装配层没注入 `retryPolicy` 时用它兜底(行为与 Nexus 默认设置一致)。
 */
export function DEFAULT_RETRY_POLICY(abstract) {
    return new RetryPolicy({
        maxAttempts: abstract ? 1 : 10,
        cooldownFloorS: 15 * 60,
        baseS: 1,
        factor: DEFAULT_FACTOR,
        capS: 15,
        jitterRatio: 0.2,
        codes: new Set("timeout,connection,429,500,502,503,504"
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s !== "")),
    });
}
/**
 * 缺省的连接超时(毫秒)—— 与设置项 `real.wait_budget_s` 的缺省值一致(60s)。
 */
const STREAM_CONNECT_TIMEOUT_MS = 60_000;
const STREAM_IDLE_TIMEOUT_MS = 300_000;
/**
 * 装上连接超时的闸门(到期就 abort 掉这一轮上游调用)。
 *
 * ⚠️ 返回 `null` 而不是裸 timer:调用点随后要 `clearTimeout(timer)`,而
 * 「不设超时」(0 / 负数)时**根本没有句柄可清** —— `clearTimeout(null)` 在
 * TypeScript 里会报 TS2769(参数类型是 `number | Timeout`,不接受 null)。
 * 所以「不设超时」一律用 `null` 表达,调用点判 `timer !== null` 再清。
 */
function armConnectTimeout(abort, seconds) {
    if (!(seconds > 0))
        return null;
    return setTimeout(() => abort.abort(), Math.round(seconds * 1000));
}
/**
 * 单次请求里换档次数的**硬顶**(在 `RetryPolicy.maxAttempts` 之上再夹一层)。
 *
 * ⚠️ 为什么还要这一层:策略上限来自设置(`retry.real_max` 默认 10),而链长也
 * 可能有十几名成员 —— 全试一遍会把一次请求拖成好几分钟(每次还要退避)。
 * 10 = 「多试几次值得」,但**不是无限」;链长本身也会再夹一层。
 */
const MAX_FAILOVER_ATTEMPTS = 10;
/** 退避等待(毫秒)。用 `setTimeout` 而不是忙等 —— 事件循环要继续跑别的请求。 */
function sleepMs(ms) {
    if (!(ms > 0))
        return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * 按**当轮成员**的输出上限钳制 `max_tokens`（O1，对齐 Nexus `_clamp_max_tokens`）。
 *
 * 规则表：
 * ```
 * 客户端缺(mtClient 未带)          → 补成成员上限
 * 客户端带了 + 成员上限有            → min(mtClient, cap)
 * 客户端带了 + 成员上限 None         → mtClient 原样(不放大也不缩小)
 * 成员上限 None                     → 不钳制(缺 / 带都一样透传)
 * 客户端带 == 逻辑模型最大输出上限    → 用**真实成员**的上限(放大到成员能力)
 * ```
 *
 * 最后一条是 2026-10-20 用户定案：harness 带的 `max_tokens` 是**逻辑模型级**
 * 上限（成员最小值，见 {@link logicalOutputCapOf}）。路由到某个真实成员时,
 * 该成员自己的 `max_output_tokens` 只可能 ≥ 逻辑最小值,于是 `min` 会把能跑的
 * 成员压到最弱成员的水平 —— 比如链 [A(64000), B(32000)],harness 带 32000,
 * 路由到 A 时正确行为是用 A 的 64000。
 *
 * 为什么必须补发：客户端常常不带 `max_tokens`,而上游各自的行为很差 ——
 * workbuddy 大 prompt 会隐式截断在 1861、trae 被上游强制 4096、longcat 小预算
 * 时 reasoning 抢占生成额度。带上成员真实上限就是把这些「隐式行为」显式化。
 *
 * ⚠️ **重复钳制防护（关键）**：多档重试时每轮都必须从**客户端原始值**
 * `maxTokensClient` 重新算,不能拿上一轮已经钳过的 `max_tokens` 继续 `min` ——
 * 否则 A 档 64000 钳过之后,B 档 262144 就永远回不去。
 */
export function clampMaxTokens(clientMax, memberCap, logicalCap) {
    if (memberCap === null ||
        memberCap === undefined ||
        !Number.isFinite(memberCap) ||
        memberCap <= 0) {
        // 成员上限缺失(trae 的远程目录拉不到 / 端点没带该字段):不钳制 ——
        // 客户端带了就原样发,没带就保持 undefined,让上游用自己的缺省。
        //
        // ⚠️ `<= 0` 与 `null` **同等对待**(2026-10-31 用户 m40778 报的真 bug):
        // 库里 `real_model.max_output_tokens` 允许为 NULL,而调度层把它归一成 `0`
        // (`engine-models.ts` 的 `toInt(data.max_output_tokens, 0)`)。若把 0 当成
        // 一个真实上限,客户端没带 max_tokens 时这一层就会返回 0,body 里于是出现
        // `"max_tokens": 0` —— 讯飞 maas 直接回
        // `400 {"code":10005,"message":"invalid request"}`(错误码文档:用户参数值有错误)。
        return clientMax;
    }
    if (clientMax === undefined)
        return memberCap; // 客户端没带 → 用成员真实上限
    if (logicalCap !== null && logicalCap !== undefined && clientMax === logicalCap) {
        return memberCap; // 客户端带的是逻辑模型级上限 → 放开到真实成员的能力
    }
    return Math.min(clientMax, memberCap);
}
/**
 * **逻辑模型最大输出上限** = 成员链中**最小的** `max_output_tokens`。
 *
 * 2026-10-20 用户定案：客户端(harness)带 `max_tokens` 时带的是**逻辑模型级**
 * 的上限 —— 它能期望的生成长度被最弱的那个成员钉死,所以取成员最小值。
 *
 * 任一成员查不到上限 → `null` = **不确定**。拿不准就宁可不放大,退回
 * `min(mtClient, cap)` 的保守钳制。
 */
import { affinityKeyOf, bodyForProtocol, completionIdOf, createdOf, hasVision, sessionOf, toRouterChain, upstreamHeaders, } from "./gateway-upstream-body.js";
import { canFailover, cooldownUntilOf, httpStatusOf, isReasoningEffortRejection, toGatewayError, } from "./gateway-upstream-errors.js";
import { classifyResponse, postWorkbuddyWithGate, preparePeer, runQoder, runSensenova, } from "./gateway-upstream-peers.js";
import { iterUpstreamChunks } from "./gateway-upstream-stream.js";
/**
 * 端点协议 → **流解析**协议。
 *
 * qoder 的响应由连接器翻译成 OpenAI chunk 流(`runWithAccount` 合成的本地
 * SSE),所以流解析要按 openai 口径走;其它协议一一对应。
 */
function wireProtocolOf(protocol) {
    return protocol === "qoder" ? "openai" : protocol;
}
/** 工厂:gateway 每次调用(每个请求)都会调 resolveUpstream(model)。 */
export function buildResolveUpstream(runtime) {
    const { scheduler, router, vault } = runtime;
    /**
     * 逻辑模型级输出上限 —— 见 {@link UpstreamRuntime.logicalOutputCap}。
     */
    const logicalOutputCapOf = (logicalName) => runtime.logicalOutputCap?.(logicalName) ?? null;
    /**
     * 本次请求的重试策略 —— **一次读齐**(Nexus `RetryPolicy` 的 immutability 理由):
     * 一次请求里退避参数必须前后一致。若每次算延迟都回库读一遍,运维在两次重试
     * 之间改了 `retry.base_backoff_s`,这一次请求的退避序列就变成两段不同斜率的
     * 拼接 —— 那种曲线排查起来毫无头绪。
     *
     * 抽象模型(逻辑模型)与直连真实模型取**不同的次数上限**:
     * - 逻辑模型:`retry.logical_max`(默认 1)—— 档链是我们自己编的候选序列,
     *   换档只是换一条规则,第 1 档不成就该尽快把结论交回调用方;
     * - 直连真实模型:`retry.real_max`(默认 10)—— 换档 = 换账号/换端点,是真的
     *   在绕过上游故障,值得多试几次。
     */
    const policyOf = (abstract) => runtime.retryPolicy?.(abstract) ?? DEFAULT_RETRY_POLICY(abstract);
    /**
     * 本次上游调用的连接超时(秒)—— 见 {@link UpstreamRuntime.requestTimeoutMs}。
     * 每次调用现读(设置改了立刻生效,不必重启)。
     */
    const requestTimeoutMs = () => runtime.requestTimeoutMs?.() ?? STREAM_CONNECT_TIMEOUT_MS / 1000;
    return function resolveUpstream(model) {
        let chain = [];
        try {
            chain = scheduler.chain(model);
        }
        catch (err) {
            // 调度器对未知/异常模型不应抛;若抛则视为无此模型。
            console.error(`[as-one] scheduler.chain("${model}") failed:`, err);
            return undefined;
        }
        if (chain.length === 0)
            return undefined;
        // ⚠️ Router.plan 只认 router 侧构造的链项(withEndpointViews 把 inCooldown /
        // realModelKey / username 挂成不可枚举自有属性;engine 的 Endpoint 类实例是
        // 原型方法,过 withHealth 的 descriptor 拷贝后会丢失 → inCooldown is not a
        // function)。统一经 chainItemFrom 转换。
        const routerChain = toRouterChain(chain);
        // 直连(真实模型)请求判据:整条链都是 direct 条目。直连请求的冷却
        // **不挡这一次尝试**(m02240)—— 否则一次 503 之后,同一模型在冷却期内
        // 永远返回「无可用上游:all_cooldown」,连上游自己说的 30 秒都不给试。
        const directRequest = routerChain.length > 0 && routerChain.every((i) => i.direct === true);
        /**
         * 选路失败 → 该抛给客户端的错误 —— 对齐 Nexus `_busy_or_upstream`。
         *
         * ⚠️ 以前两种情况都抛 `UpstreamError(upstream, …)`,而 kind=upstream 的
         * `httpStatus` 是 **502**。于是:
         * - 「并发打满了」在客户端眼里等于「上游挂了」—— 用户看到 502 只会去查上游,
         *   而真相是他自己把并发打满了;
         * - 「全在冷却」也被压成 502,丢掉了上游原始状态码(429/503 全变成 502)。
         *
         * Nexus 的口径:
         * - `all_busy`     → **503** + `{"detail":{"error":{"type":"capacity",…}}}`
         *   (**不带 Retry-After** —— 不排队就没有「到点一定腾位置」的承诺);
         * - `all_cooldown` → 把**最后一次上游错误的原始状态码**交出去(换号失败不该
         *   伪装成容量问题);没有 lastError(第一轮就没选出来)→ 502 connection。
         *
         * ⚠️ 返回错误对象而不是自己 throw:调用点写 `throw planErrorOf(...)`,
         * 这样 `if (!planItem) throw …` 的 never 语义由 `throw` 保证,TS 能正常窄化
         * `planItem`(写成 `if (!x) helper()` 时 TS 不认 const 箭头函数的 never 返回)。
         */
        /**
         * 解析单张图 —— 发一次「单图解析」请求,成功返回转写文字,失败返回 `null`。
         *
         * ⚠️ **一次定胜负**:不会换提示词 / 换切图方式重试 —— 用户定案是「不做多轮
         * 解析」:读不出来就直接给用户一条可执行的线索(补充信息 / 换原生图像模型),
         * 而不是拿一串不同问法反复问同一张图。
         *
         * 复用**同一套选路 / 换档 / 记账链路**(走 `free` 抽象模型),所以解析请求
         * 同样吃冷却、同样记在途、同样有失败换档 —— 不另造一条旁路。
         *
         * ⚠️ 解析用**独立的会话号**(`<sid>:free-parse`),与主请求的 pin 隔离 ——
         * 免费端点不该被解析动作粘到用户会话上,用户会话的亲和 pin 也不该被解析
         * 请求占用。
         */
        const parseOneImage = async (part, sessionId) => {
            const freeUpstream = resolveUpstream(FREE_PARSE_MODEL);
            if (!freeUpstream)
                return null;
            const parseSession = `${sessionId}:free-parse`;
            try {
                const data = await freeUpstream.complete({
                    model: FREE_PARSE_MODEL,
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: FREE_PARSE_PROMPT },
                                part,
                            ],
                        },
                    ],
                    stream: false,
                    // 「解析时关闭思考」—— 图片解析要的是快和准的证据,不是深度推理。
                    // ⚠️ **不传 max_tokens**(用户 m06638①「不限制最大输出 token」,
                    // 2026-10-24 定案):以前钉死 768,四段证据经常被截断 —— 截断的证据
                    // 比没有更危险(看起来完整,实际丢了一半)。不传时 `clampMaxTokens`
                    // 会用该成员的真实 `max_output_tokens` 补(见 clampMaxTokens 文档),
                    // 成员上限缺失则保持 undefined,让上游用自己的缺省。
                    temperature: 0, // 解析要确定性:同样一张图给同样的描述
                    reasoning_effort: "none",
                    extra: { session_id: parseSession },
                });
                const content = data.choices?.[0]?.message?.content;
                return typeof content === "string" ? content : null;
            }
            catch (err) {
                console.warn(`[as-one] 图片解析失败(${FREE_PARSE_MODEL}):`, err);
                return null;
            }
        };
        /**
         * 请求带图时按需桥接 —— 对齐 Nexus `_try_parse_images` 的调用点判据。
         *
         * - **链上没有视觉端点** → 桥接(图转成文字证据);
         * - **图片数超过上游硬限**({@link IMAGE_HARD_LIMIT})→ 桥接,**即使链上有
         *   视觉端点**:否则这条请求是**确定性 400**
         *   (`image num 51 exceeds limit 50`),而且要烧掉一整轮无意义重试;
         * - 否则(链上有视觉端点、图片数不超限)→ **透传**,但图片太多时丢掉最早的
         *   并在消息尾说明(用户定案 2026-10-16):这条路径的档位自己就能看图,降级
         *   成文本白费额度。
         *
         * 桥接**不阻断主请求**:整个动作失败(取不到 `free` 链等)时原样放行。
         */
        const bridgeImagesIfNeeded = async (req, sessionId) => {
            const messages = req.messages;
            const imageCount = imagePartIndices(messages).length;
            if (imageCount === 0)
                return req;
            const hardOverflow = imageCount > IMAGE_HARD_LIMIT;
            const chainHasVision = chain.some((it) => it.endpoint.supportsVision === true);
            if (hardOverflow || !chainHasVision) {
                const bridged = await tryParseImages(messages, {
                    parseOne: (part) => parseOneImage(part, sessionId),
                    chainHasVision,
                    hardOverflow,
                });
                if (bridged.result.replaced > 0 || bridged.result.droppedHistory > 0) {
                    console.warn(`[as-one] 图像桥:替换 ${bridged.result.replaced} 张(缓存命中 ` +
                        `${bridged.result.cacheHits}、失败 ${bridged.result.unparsed}、` +
                        `丢历史 ${bridged.result.droppedHistory}、本次实解析 ${bridged.result.parsedNow})`);
                }
                return { ...req, messages: bridged.messages };
            }
            // 视觉端点路径:图片太多 → 丢最早的 + 消息尾说明。
            const [trimmed, dropped] = dropExcessImages(messages);
            if (dropped > 0) {
                console.warn(`[as-one] 视觉端点路径:丢弃最早 ${dropped} 张历史图片,保留最近 ${imageCount - dropped} 张`);
                return { ...req, messages: trimmed };
            }
            return req;
        };
        const planErrorOf = (reason, lastError) => {
            if (reason === "all_busy")
                return allBusyError();
            if (lastError !== null)
                return lastError;
            return new UpstreamError(UpstreamErrorKind.Connection, `无可用上游:${reason || "no endpoint"}`, { statusCode: 502 });
        };
        return {
            async *stream(req) {
                const sessionId = sessionOf(req);
                // ⚠️ **缓存路由键优先**(m09081):`prompt_cache_key` 表达「前缀相同」,
                // 比会话号更贴近上游前缀缓存的命中条件 —— 同键钉同一端点才有缓存收益。
                // 没有缓存键时回落会话号(DSH 的会话亲和)。
                const affinityKey = affinityKeyOf(req);
                // sensenova 账号池运行时(记账/诊断用;非 sensenova 协议恒为 null)。
                let snRuntime = null;
                // sensenova 连接器引用(拿 runWithAccount / recordSpendFor;非 sensenova 恒 null)。
                let snConnector = null;
                // ⚠️ 图像桥:请求带图且链上看不见图(或图片超上游硬限)时,先把图转成
                // 文字证据再选路 —— 桥接**不阻断**主请求(失败时原样放行)。
                const bridged = await bridgeImagesIfNeeded(req, sessionId ?? "");
                const tried = new Set();
                // ⏱️ TTFT 起点:客户端请求进网关的时刻(Nexus `req_t0 = time.monotonic()`
                // 只取一次,不随每档 attempt 重开)。⚠️ 放在 attempt 循环**外**:sensenova
                // 的「429 同号硬等」发生在连接器内部(runWithAccount),那段时间也是
                // 客户端在等首字 —— 用户 m05340 定案「等待的时间也计入 ttft」。
                const t0 = performance.now();
                // ⚠️ **被抢占过的端点**(m02240):抢占是「直连要这个位置」,选回它
                // 只会被再抢一次 —— 反复抢、反复换,直到预算耗尽。换档的语义是
                // 「去**别的**模型」,不是「跟抢占者抢同一个位置」。
                const preemptedEndpoints = new Set();
                // ⚠️ 次数上限取自 `RetryPolicy`(逻辑模型 `retry.logical_max` / 直连
                // `retry.real_max`),不再是硬编码的 3 —— 直连真实模型换档 = 换账号,
                // 值得多试几次(Nexus 默认 10)。
                const policy = policyOf(!directRequest);
                // ⚠️ **逻辑模型的下限是「走完候选链」**(Nexus `app.py:1952` 同款:
                // `max(policy.max_attempts, len(chain))`)。
                //
                // 之前这里用的是 `min(policy.maxAttempts, 链长)`,而 `retry.logical_max`
                // 默认 = 1 → 逻辑模型**只会试 1 档**。那样一来:
                //   · 首个成员 429 就把整个请求判失败(链上明明还有别的成员可用);
                //   · **被直连抢占后无法「切换模型」** —— 换档预算被压成 0 次,
                //     「打断对话并切到另一档」根本无从谈起。
                // Nexus 的口径是:逻辑模型只要还有成员可用,就不该把错误交回客户端。
                //
                // 直连**不**抬到链长:换档 = 换账号,能换几个取决于该真实模型有几个
                // 凭据(`retry.real_max` 默认 10 已覆盖),链长夹一次更准。
                const maxAttempts = directRequest
                    ? Math.max(1, Math.min(policy.maxAttempts, MAX_FAILOVER_ATTEMPTS, routerChain.length))
                    : Math.max(1, Math.min(MAX_FAILOVER_ATTEMPTS, Math.max(policy.maxAttempts, routerChain.length)));
                // 最后一次上游错误:换档耗尽后要把它原样交出去(all_cooldown 出口
                // 保留上游原始状态码,而不是压成 502)。
                let lastError = null;
                // ⚠️ **reasoning_effort 被上游拒过一次就丢掉**(用户 m09081:「只原样透传,
                // 上游报相关错误则丢弃」)。置位后本轮及后续尝试都不带这个字段 —— 网关
                // 不解释档位值,上游说不支持就绕开,而不是把 400 交回客户端。
                let stripReasoningEffort = false;
                for (let attempt = 1;; attempt += 1) {
                    const plan = router.plan({
                        // ⚠️ **被抢占过的端点不再选**(m02240):抢占是「直连要这个位置」,
                        // 选回它只会被再抢一次 —— 反复抢、反复换,直到预算耗尽。
                        // 换档的语义是「去**别的**模型」,不是「跟抢占者抢同一个位置」。
                        chain: preemptedEndpoints.size === 0
                            ? routerChain
                            : routerChain.filter((it) => !preemptedEndpoints.has(it.endpoint.endpointId)),
                        // ⚠️ 亲和键 = 缓存路由键优先(m09081):同前缀 → 同端点 → 上游前缀缓存命中。
                        sessionId: affinityKey,
                        // ⚠️ 桥接后消息里已无图 → needs_vision 自然为 false,
                        // 选路走普通的非视觉池(与 Nexus 同一口径)。
                        needsVision: hasVision(bridged.messages),
                        ignoreCooldown: directRequest,
                    });
                    const item = plan.item;
                    if (!item)
                        throw planErrorOf(plan.reason ?? "", lastError);
                    const alreadyTried = tried.has(item.endpoint.endpointId);
                    tried.add(item.endpoint.endpointId);
                    // ⚠️ **抢占通知**(m02240):本请求的租约若被直连请求挤掉,靠这个
                    // 回调打断自己的上游调用。**必须真的中断** —— 只释放账本槽位的话,
                    // 受害方的连接还在真实上游占着,直连请求照样被上游限流。
                    //
                    // `preemptedBy` 记下是谁抢的:抢占**不是**上游故障,收尾时按
                    // `preempted: true` 走(不记端点失败、不冷却它),并换一档继续。
                    let preemptedBy = null;
                    const abort = new AbortController();
                    // ⚠️ **客户端断开**(m04527):客户端中途放弃(关连接 / reader.cancel())
                    // 时,网关会把 `req.clientSignal` 递进来 —— 这里把它接到本轮那个
                    // abort controller 上,**真的打断上游 fetch**。
                    //
                    // 为什么必须打断 fetch 而不是让 server 调 `iterator.return?.()`:
                    // 生成器悬停在 `await reader.read()`(**await 点**,不是 yield 点),
                    // 而 async generator 的 `.return()` 请求要等那个 await 落地才被处理 ——
                    // 上游还在持续产块时可以等很久(实测 20s 槽位仍未释放)。只有 fetch
                    // 被 abort,生成器才会立刻抛错 → 走进下面的 catch → `router.finish`
                    // → `ledger.release(leaseId)`,槽位当场归还。
                    //
                    // 不接这根线,后果是:客户端一断开,该档位的并发槽位卡到租期
                    // (inflight-ledger 600s)被 purge 扫掉,后续请求一律 503「并发已满」。
                    let clientGone = false;
                    const clientSignal = req.clientSignal;
                    const onClientAbort = () => {
                        clientGone = true;
                        abort.abort();
                    };
                    if (clientSignal) {
                        if (clientSignal.aborted) {
                            clientGone = true;
                            abort.abort();
                        }
                        else {
                            clientSignal.addEventListener("abort", onClientAbort, { once: true });
                        }
                    }
                    const leaseId = router.commit(item, {
                        logicalName: model,
                        sessionId: affinityKey,
                        stream: true,
                        onPreempt: (reason) => {
                            preemptedBy = reason;
                            abort.abort();
                        },
                    });
                    // 直连抢占失败:**该真实模型上全是直连在途**,没有可让的逻辑租约 ——
                    // 这是货真价实的「容量已满」,与上游故障无关。
                    if (!leaseId)
                        throw planErrorOf("all_busy", null);
                    let firstChunkEmitted = false;
                    let ttftMs = null;
                    // 本轮实际发出去的思考强度(m09081 + m09328 + m10437,两条闸):
                    // ① 被上游拒过一次 → 不带(stripReasoningEffort);
                    // ② 按当轮真实模型的能力表走**统一钳制算法**。两者都不写键。
                    const wantedEffort = stripReasoningEffort
                        ? undefined
                        : resolveReasoningEffort(bridged.reasoning_effort, runtime.reasoningEffortsOf?.(item.endpoint.provider, item.endpoint.model), runtime.reasoningAllowsOffOf?.(item.endpoint.provider, item.endpoint.model) ?? null).effort;
                    const bodyReq = { ...bridged, reasoning_effort: wantedEffort };
                    try {
                        const peer = await preparePeer(item, vault);
                        const { url, headers, connector, creds } = peer;
                        // ⚠️ O1:按**当轮成员**的输出上限钳 max_tokens。每轮都从**客户端原值**
                        // 重算(不能拿上一轮钳过的值继续 min)。
                        const clamped = clampMaxTokens(bridged.maxTokensClient ?? bridged.max_tokens, item.endpoint.maxOutputTokens ?? null, logicalOutputCapOf(model));
                        const body = bodyForProtocol(item.endpoint.provider, item.endpoint.protocol, { ...bodyReq, model: item.endpoint.model, max_tokens: clamped }, creds);
                        // ⚠️ **复用外层那个 controller**(而不是新建一个):抢占回调中断的
                        // 正是它 —— 新建一个的话,抢占只会中断一个没人用的 controller,
                        // 本次上游调用照跑不误,抢占等于没做。
                        //
                        // ⚠️ 超时只覆盖「拿到响应头之前」:头到手后 timer 就被清掉,之后
                        // 的流式读取靠 `STREAM_IDLE_TIMEOUT_MS` 那条路(见 iterUpstreamChunks)。
                        // ⚠️ 时长来自设置项「请求超时时间(秒)」(`real.wait_budget_s`),
                        // 0 = 不设超时 → `armConnectTimeout` 返回 null(没有句柄可清)。
                        const timer = armConnectTimeout(abort, requestTimeoutMs());
                        let res;
                        try {
                            if (item.endpoint.protocol === "sensenova") {
                                // sensenova 走连接器账号池调度(选号/429 同号硬等/换号),
                                // 不走 getToken+decorateRequest 的普通路径。
                                snConnector = connector;
                                const sn = await runSensenova(peer, body, model, abort.signal);
                                res = sn.res;
                                snRuntime = sn.runtime;
                            }
                            else if (item.endpoint.protocol === "qoder") {
                                // Qoder:连接器自己组体+签名,返回的是本地合成的 OpenAI SSE。
                                snConnector = connector;
                                const q = await runQoder(peer, body, model, abort.signal);
                                res = q.res;
                                snRuntime = q.runtime;
                            }
                            else {
                                res = isWorkbuddyWire(item.endpoint.protocol)
                                    ? // 渠道校验闸门必须在流式路径上也生效 —— DSH 的对话请求
                                        // 全是流式的,只在 complete() 挂闸门等于没挂(用户实测拿到的
                                        // 就是「渠道校验拦截(code 11128):请求被拦截,请重新发送」)。
                                        // ⚠️ 判据只有 protocol(2026-10-31 用户定案收回按名字放宽):
                                        // 名字带 workbuddy/wb 但 protocol=openai 的 provider 一律按
                                        // 普通 OpenAI 直连,不改它的提示词。
                                        await postWorkbuddyWithGate(url, headers, body, abort.signal, connector)
                                    : await fetch(url, {
                                        method: "POST",
                                        headers: upstreamHeaders(headers),
                                        body: JSON.stringify(body),
                                        signal: abort.signal,
                                    });
                            }
                        }
                        finally {
                            // `null` = 这一轮没设超时(设置成 0)→ 没有句柄可清。
                            if (timer !== null)
                                clearTimeout(timer);
                        }
                        if (!res.ok || !res.body) {
                            throw await classifyResponse(res, connector);
                        }
                        const chunkMeta = { completionId: completionIdOf(), created: createdOf(), model: req.model };
                        // ⚠️ 流式 token 统计:usage-only 尾块(include_usage 的载体)已被
                        // iterUpstreamChunks 放行,yield 出来的最后一个 chunk 带着 usage。
                        // 以前只给 complete() 传 token 三件套,流式请求的实时日志 token 恒为 0。
                        let usage = null;
                        for await (const chunk of iterUpstreamChunks(res.body, wireProtocolOf(item.endpoint.protocol), chunkMeta, item.endpoint.provider)) {
                            if (chunk.usage)
                                usage = chunk.usage;
                            if (ttftMs === null)
                                ttftMs = performance.now() - t0;
                            firstChunkEmitted = true;
                            yield chunk;
                        }
                        // sensenova 账号池:补记本次可计费 token(SSE 尾块 usage)。
                        if (snRuntime) {
                            snConnector?.recordSpendFor(snRuntime.name, usage, ttftMs === null ? 0 : Math.round(ttftMs));
                        }
                        router.finish(item, {
                            leaseId,
                            ok: true,
                            status: 200,
                            latencyMs: Math.round(performance.now() - t0),
                            ttftMs: ttftMs === null ? undefined : Math.round(ttftMs),
                            promptTokens: usage?.prompt_tokens,
                            completionTokens: usage?.completion_tokens,
                            cachedTokens: usage?.prompt_tokens_details?.cached_tokens,
                        });
                        // 「实测这个模型不接受 reasoning_effort」的学习结果(2026-10-24 m09328):
                        // 本轮是**丢掉参数之后**才成功的 ⇒ 把库里的能力表清空,下次直接不发。
                        if (stripReasoningEffort) {
                            runtime.onReasoningEffortLearned?.(item.endpoint.provider, item.endpoint.model);
                        }
                        // ⚠️ **必须 return**:成功收尾后就该结束这次调用。少了这一行,
                        // 外层 `for (attempt…)` 会继续下一轮 → 重新 plan/commit/请求上游
                        // → 把**第二个完整回答**的 chunk 继续 yield 进同一个客户端流。
                        // 实测症状(m06730②):同一个回答重复 4 遍、整轮 latency 变成
                        // 单轮的 4 倍(68s / 128s),客户端首 token 看起来「非常慢」,
                        // 而日志里的 ttft 只记第一轮 —— 用户看到的高延迟就是这里放大的。
                        return;
                    }
                    catch (err) {
                        // ⚠️ **被直连请求抢占**(m02240):这不是上游故障,是「直连优先级更高,
                        // 你让位」。收尾口径与普通失败**完全不同**:
                        //   · 端点**没有失败过** → 不记失败、不冷却它(`preempted: true`);
                        //   · 也不解除会话粘性(不是「这个端点坏了」);
                        //   · 换一档继续(这正是「打断对话并切换模型」)。
                        //
                        // ⚠️ 必须**先于** `toGatewayError` 判断:被抢占时 err 是 AbortError,
                        // 转成错误会落成 `timeout` —— 那会让网关以为「上游超时」,退避
                        // 一次再换档,凭空慢一轮。
                        if (preemptedBy !== null) {
                            router.finish(item, {
                                leaseId,
                                ok: false,
                                preempted: true,
                                status: 0,
                                error: preemptedBy,
                                latencyMs: Math.round(performance.now() - t0),
                            });
                            if (firstChunkEmitted) {
                                // ⚠️ 已发过字节 → **不能换档**(客户端已经拿到了半个流,换模型
                                // 续上会内容重复/错乱,与 Nexus 的「已发字节不改投其它端点」同款)。
                                // 只能到此为止:流断在这里。
                                console.warn(`[as-one] stream preempted after first chunk (${model}): ${preemptedBy}`);
                                return;
                            }
                            // 首块前被抢占 → 换一档继续(不计入失败预算:抢占不是这台机器的错,
                            // 退避也没意义 —— 该让位的是**本档**)。
                            //
                            // ⚠️ 记下被抢占的端点:下一轮**不再选它** —— 直连要的就是这个
                            // 位置,选回去只会被再抢一次(反复抢、反复换,直到预算耗尽)。
                            preemptedEndpoints.add(item.endpoint.endpointId);
                            console.warn(`[as-one] preempted by direct request (${model}) ` +
                                `endpoint=${item.endpoint.endpointId}: ${preemptedBy} → 换档`);
                            if (attempt < maxAttempts) {
                                continue;
                            }
                            throw new UpstreamError(UpstreamErrorKind.Upstream, `被直连请求抢占,且已无更多档位可换:${preemptedBy}`, { statusCode: 503 });
                        }
                        const gerr = toGatewayError(err);
                        // ⚠️ **客户端已自己断开**(m04527):这是本案里 abort 的真正来源。
                        // 必须**立刻收手**,理由有三条:
                        //   · 换档毫无意义 —— 客户端已经不在了,新请求只是白占上游一个槽位;
                        //   · 不能按上游故障记账 —— 端点是被我们主动打断的,它没做错任何事
                        //     (`toGatewayError` 会把 AbortError 落成 `timeout`,虽然那是
                        //     TRANSIENT 不落冷却,但会白记一次失败);
                        //   · 租约必须在这里归还 —— `router.finish` 里的 `ledger.release`
                        //     是本 bug 唯一要保的那一步。
                        //
                        // 口径沿用首块与否:首块已发 = 这次调用是成功的,只是对端不要了;
                        // 首块未发 = 记为 0(与 server 侧 `status: 0` 的 client_disconnected
                        // 一致),且不换档、不抛错。
                        if (clientGone) {
                            router.finish(item, {
                                leaseId,
                                ok: firstChunkEmitted,
                                status: firstChunkEmitted ? 200 : 0,
                                error: firstChunkEmitted ? undefined : "客户端断开",
                                kind: firstChunkEmitted ? undefined : "client_disconnected",
                                latencyMs: Math.round(performance.now() - t0),
                            });
                            return;
                        }
                        // ⚠️ **上游因为 `reasoning_effort` 拒了 → 丢掉这个参数重试**(用户 m09081)。
                        // 网关**不解释**思考档位值:客户端要 `high`,我们原样透传;上游说这个模型
                        // 不支持,那就绕开 —— 而不是把 400 交回客户端(那等于网关替上游做产品决策)。
                        // ① 只认「文案点名 reasoning」的错(见 `isReasoningEffortRejection`),
                        //    不做「所有 400 都摘」的宽判据:400 也可能是消息/工具/图片的真问题,
                        //    盲目摘参数只会把真实错误藏起来、再多打一轮上游;
                        // ② `voidAttempt: true` —— 这一轮尝试**作废**:只释放租约,不记失败、
                        //    不冷却、不动粘性。端点没做错任何事,是参数不对;
                        // ③ 只有还有档位/预算可换时才重来;否则原样交出去。
                        if (!stripReasoningEffort &&
                            !firstChunkEmitted &&
                            isReasoningEffortRejection(gerr.detail)) {
                            router.finish(item, {
                                leaseId,
                                ok: false,
                                voidAttempt: true,
                                status: 0,
                                error: `reasoning_effort 不被支持,丢参重试:${gerr.detail}`,
                                latencyMs: Math.round(performance.now() - t0),
                            });
                            stripReasoningEffort = true;
                            console.warn(`[as-one] reasoning_effort rejected (${model}, ${item.endpoint.endpointId}) → 丢参重试: ${gerr.detail}`);
                            if (attempt < maxAttempts) {
                                continue;
                            }
                        }
                        router.finish(item, {
                            leaseId,
                            ok: firstChunkEmitted, // 首块已发则不算上游失败(客户端断开属正常)
                            status: firstChunkEmitted ? 200 : httpStatusOf(gerr),
                            error: firstChunkEmitted ? undefined : gerr.detail,
                            kind: firstChunkEmitted ? undefined : gerr.kind,
                            latencyMs: Math.round(performance.now() - t0),
                            // 上游给了 retry_after 就按它冷却(优先按上游给出的时间);
                            // 没给 → undefined,回落 provider 覆盖 / 全局 floor。
                            cooldownUntil: firstChunkEmitted ? undefined : cooldownUntilOf(gerr),
                        });
                        // ⚠️ **凭据类失败 → 通知装配层后台换 key**(用户 m16528)。
                        //    这里是**不阻塞**的:换 key 要登录 + 建 key + 等 IAM 传播
                        //    (实测 ~8s),原地等会把这次请求的 TTFT 硬拖 8 秒起跳;
                        //    而换档去别的账号**立刻**能试。冷却照常落(按 sensenova 的
                        //    设置值),后台修好 + 冷却到期 ⇒ 下一跳即用新 key。
                        if (!firstChunkEmitted &&
                            gerr.kind === UpstreamErrorKind.Auth &&
                            item.endpoint.provider === "sensenova") {
                            try {
                                runtime.onSensenovaKeyInvalid?.(item.endpoint.credentialKey[1]);
                            }
                            catch {
                                /* 通知失败不影响请求路径 */
                            }
                        }
                        if (firstChunkEmitted) {
                            // 首块后断流:客户端断开或上游中途错 —— 不再向外抛(网关流已开)。
                            console.warn(`[as-one] stream cut after first chunk (${model}): ${gerr.detail}`);
                            return;
                        }
                        lastError = gerr;
                        // 换档:首块前失败 + 错误可换(第一层判据)+ 策略允许重试(第二层:
                        // 白名单 / retryable 显式否决 / reset_deadline 远期否决)+ 还没试过这台
                        // + 没用满次数 → 退避后重试。
                        // 「已经试过」这一条专门防 timeout / connection(不落冷却)时在同一台上打转。
                        if (canFailover(gerr, item.endpoint.provider) && policy.shouldRetry(gerr) && !alreadyTried && attempt < maxAttempts) {
                            const delayS = policy.delayFor(attempt);
                            console.warn(`[as-one] failover ${attempt}/${maxAttempts} model=${model} ` +
                                `endpoint=${item.endpoint.endpointId} kind=${gerr.kind}: ${gerr.detail} ` +
                                `(退避 ${delayS.toFixed(2)}s 后换档)`);
                            await sleepMs(delayS * 1000);
                            continue;
                        }
                        throw gerr;
                    }
                    finally {
                        try {
                            scheduler.invalidate();
                        }
                        catch {
                            /* 缓存失效失败不影响请求结果 */
                        }
                    }
                }
            },
            async complete(req) {
                const sessionId = sessionOf(req);
                // ⚠️ **缓存路由键优先**(m09081):同 stream() 口径 —— 亲和键取
                // `prompt_cache_key`,没有才回落会话号。
                const affinityKey = affinityKeyOf(req);
                // sensenova 账号池运行时/连接器(记账用;非 sensenova 协议恒 null)。
                let snRuntime = null;
                let snConnector = null;
                // ⚠️ 图像桥:请求带图且链上看不见图(或图片超上游硬限)时,先把图转成
                // 文字证据再选路 —— 桥接**不阻断**主请求(失败时原样放行)。
                const bridged = await bridgeImagesIfNeeded(req, sessionId ?? "");
                const tried = new Set();
                // ⚠️ **被抢占过的端点**(m02240):同 stream() 口径 —— 抢占是「直连要这个
                // 位置」,选回它只会被再抢一次。换档 = 去**别的**模型。
                const preemptedEndpoints = new Set();
                // ⚠️ 次数上限取自 `RetryPolicy`(同 stream() 口径)。
                const policy = policyOf(!directRequest);
                // ⚠️ 逻辑模型下限 = 走完候选链(Nexus 同款,详见 stream() 处的说明):
                // 少了它,被直连抢占后就没有「切换模型」的预算了。
                const maxAttempts = directRequest
                    ? Math.max(1, Math.min(policy.maxAttempts, MAX_FAILOVER_ATTEMPTS, routerChain.length))
                    : Math.max(1, Math.min(MAX_FAILOVER_ATTEMPTS, Math.max(policy.maxAttempts, routerChain.length)));
                // 最后一次上游错误:换档耗尽后原样交出去(all_cooldown 保留原始状态码)。
                let lastError = null;
                // ⚠️ **reasoning_effort 被上游拒过一次就丢掉**(用户 m09081):同 stream() 口径。
                let stripReasoningEffort = false;
                // ⏱️ TTFT 起点(同 stream()):客户端请求进网关的时刻,不随每档重开 ——
                // sensenova 连接器内部的「429 同号硬等」也算客户端等首字的一部分。
                const t0 = performance.now();
                for (let attempt = 1;; attempt += 1) {
                    const plan = router.plan({
                        // ⚠️ **被抢占过的端点不再选**(m02240):同 stream() 口径。
                        chain: preemptedEndpoints.size === 0
                            ? routerChain
                            : routerChain.filter((it) => !preemptedEndpoints.has(it.endpoint.endpointId)),
                        sessionId: affinityKey,
                        // ⚠️ 桥接后消息里已无图 → needs_vision 自然为 false,
                        // 选路走普通的非视觉池(与 Nexus 同一口径)。
                        needsVision: hasVision(bridged.messages),
                        ignoreCooldown: directRequest,
                    });
                    const item = plan.item;
                    if (!item)
                        throw planErrorOf(plan.reason ?? "", lastError);
                    const alreadyTried = tried.has(item.endpoint.endpointId);
                    tried.add(item.endpoint.endpointId);
                    // ⚠️ **抢占通知**(m02240):同 stream() 口径 —— 被直连请求挤掉时
                    // 打断自己的上游调用,并在收尾时按「抢占」而非「上游失败」记账。
                    let preemptedBy = null;
                    const abort = new AbortController();
                    // ⚠️ **客户端断开**(m04527):同 stream() 口径 —— 把网关递进来的
                    // `req.clientSignal` 接到本轮 controller 上。非流式下客户端放弃时,
                    // 上游 fetch 会被立刻打断,租约当场归还;否则要卡到 600s 租期被 purge。
                    //
                    // 非流式还有一层意义:响应**尚未发出**,如果不打断,这次调用会一路
                    // 跑到换档重试(为一个已经不在的客户端白打上游好几个账号)。
                    let clientGone = false;
                    const clientSignal = req.clientSignal;
                    const onClientAbort = () => {
                        clientGone = true;
                        abort.abort();
                    };
                    if (clientSignal) {
                        if (clientSignal.aborted) {
                            clientGone = true;
                            abort.abort();
                        }
                        else {
                            clientSignal.addEventListener("abort", onClientAbort, { once: true });
                        }
                    }
                    const leaseId = router.commit(item, {
                        logicalName: model,
                        sessionId: affinityKey,
                        stream: false,
                        onPreempt: (reason) => {
                            preemptedBy = reason;
                            abort.abort();
                        },
                    });
                    if (!leaseId)
                        throw planErrorOf("all_busy", null);
                    // 本轮实际发出去的思考强度(m09081 + m09328 + m10437,两条闸):
                    // ① 被上游拒过一次 → 不带(stripReasoningEffort);
                    // ② 按当轮真实模型的能力表走**统一钳制算法**。两者都不写键。
                    const wantedEffort = stripReasoningEffort
                        ? undefined
                        : resolveReasoningEffort(bridged.reasoning_effort, runtime.reasoningEffortsOf?.(item.endpoint.provider, item.endpoint.model), runtime.reasoningAllowsOffOf?.(item.endpoint.provider, item.endpoint.model) ?? null).effort;
                    const bodyReq = { ...bridged, reasoning_effort: wantedEffort };
                    try {
                        const protocol = item.endpoint.protocol;
                        const peer = await preparePeer(item, vault);
                        const { url, headers, connector, creds } = peer;
                        // ⚠️ O1:同上,按当轮成员钳 max_tokens。
                        const clamped = clampMaxTokens(bridged.maxTokensClient ?? bridged.max_tokens, item.endpoint.maxOutputTokens ?? null, logicalOutputCapOf(model));
                        const body = bodyForProtocol(item.endpoint.provider, protocol, { ...bodyReq, model: item.endpoint.model, max_tokens: clamped }, creds);
                        // ⚠️ **复用外层那个 controller**(同 stream() 口径):抢占要中断的
                        // 正是它 —— 新建一个的话,抢占只会中断一个没人用的 controller。
                        // ⚠️ 时长来自设置项「请求超时时间(秒)」(`real.wait_budget_s`),
                        // 0 = 不设超时 → `armConnectTimeout` 返回 null(没有句柄可清)。
                        const timer = armConnectTimeout(abort, requestTimeoutMs());
                        let res;
                        try {
                            if (protocol === "sensenova") {
                                // sensenova 走连接器账号池调度(选号/429 同号硬等/换号)。
                                snConnector = connector;
                                const sn = await runSensenova(peer, body, model, abort.signal);
                                res = sn.res;
                                snRuntime = sn.runtime;
                            }
                            else if (protocol === "qoder") {
                                // Qoder:同流式分支(合成 SSE,complete 侧再聚合)。
                                snConnector = connector;
                                const q = await runQoder(peer, body, model, abort.signal);
                                res = q.res;
                                snRuntime = q.runtime;
                            }
                            else {
                                res = isWorkbuddyWire(protocol)
                                    ? await postWorkbuddyWithGate(url, headers, body, abort.signal, connector)
                                    : await fetch(url, {
                                        method: "POST",
                                        headers: upstreamHeaders(headers),
                                        body: JSON.stringify(body),
                                        signal: abort.signal,
                                    });
                            }
                        }
                        finally {
                            // `null` = 这一轮没设超时(设置成 0)→ 没有句柄可清。
                            if (timer !== null)
                                clearTimeout(timer);
                        }
                        if (!res.ok) {
                            throw await classifyResponse(res, connector);
                        }
                        let data;
                        if (protocol === "openai" && !req.stream) {
                            // OpenAI 兼容:非流式直接读 JSON。
                            // ⚠️ 能走到这里的 workbuddy 只有 `protocol === "workbuddy"`,
                            // 它在请求体构造阶段就被置了 `stream: true`(buildWorkbuddyBody),
                            // 响应体是 SSE → 由下面的 else 分支聚合。所以本分支不必再排除它。
                            // 2026-10-31 之前这里带着 `!isWorkbuddyGateFamily(...)`,那是「按名字
                            // 放宽」时期的补丁(名字带 wb 的 provider 被套了 workbuddy 报文);
                            // 判据收回 protocol 之后,条件恒真,已删。
                            data = (await res.json());
                        }
                        else {
                            // trae/workbuddy/sensenova 恒走 SSE(请求体已置 stream:true,
                            // 与 Nexus 一致:非流式在内部聚合同一条解析路径)。
                            const completionId = completionIdOf();
                            const created = createdOf();
                            const chunks = iterUpstreamChunks(res.body, wireProtocolOf(protocol), { completionId, created, model: req.model }, item.endpoint.provider);
                            data = await aggregateCompletion(chunks, { model: req.model, completionId, created });
                        }
                        // sensenova 账号池:补记本次可计费 token(同 stream() 口径)。
                        if (snRuntime) {
                            snConnector?.recordSpendFor(snRuntime.name, data.usage, 0);
                        }
                        router.finish(item, {
                            leaseId,
                            ok: true,
                            status: 200,
                            latencyMs: Math.round(performance.now() - t0),
                            promptTokens: data.usage?.prompt_tokens,
                            completionTokens: data.usage?.completion_tokens,
                            cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens,
                        });
                        if (stripReasoningEffort) {
                            runtime.onReasoningEffortLearned?.(item.endpoint.provider, item.endpoint.model);
                        }
                        return data;
                    }
                    catch (err) {
                        // ⚠️ **被直连请求抢占**(m02240):同 stream() 口径 —— 不是上游故障,
                        // 不记端点失败、不冷却它,换一档继续。
                        // ⚠️ 必须先于 `toGatewayError`:被抢占时 err 是 AbortError,转成
                        // 错误会落成 `timeout`,凭空多退避一轮。
                        if (preemptedBy !== null) {
                            router.finish(item, {
                                leaseId,
                                ok: false,
                                preempted: true,
                                status: 0,
                                error: preemptedBy,
                                latencyMs: Math.round(performance.now() - t0),
                            });
                            // ⚠️ 记下被抢占的端点:下一轮不再选它(同 stream() 口径)。
                            preemptedEndpoints.add(item.endpoint.endpointId);
                            console.warn(`[as-one] preempted by direct request (${model}) ` +
                                `endpoint=${item.endpoint.endpointId}: ${preemptedBy} → 换档`);
                            if (attempt < maxAttempts) {
                                continue;
                            }
                            throw new UpstreamError(UpstreamErrorKind.Upstream, `被直连请求抢占,且已无更多档位可换:${preemptedBy}`, { statusCode: 503 });
                        }
                        // ⚠️ **客户端已自己断开**(m04527):同 stream() 口径 —— 立刻收手,
                        // 不换档(客户端不在了,换档只是白占上游槽位),租约在此归还。
                        // 抛 `client_disconnected` 让 server 侧按断连记账(status 0)。
                        if (clientGone) {
                            router.finish(item, {
                                leaseId,
                                ok: false,
                                status: 0,
                                error: "客户端断开",
                                kind: "client_disconnected",
                                latencyMs: Math.round(performance.now() - t0),
                            });
                            throw new UpstreamError(UpstreamErrorKind.Connection, "客户端断开");
                        }
                        const gerr = toGatewayError(err);
                        // ⚠️ **上游因为 `reasoning_effort` 拒了 → 丢掉这个参数重试**(用户 m09081,
                        // 同 stream() 口径)。判据只认「文案点名 reasoning」的错,不做宽判据;
                        // 本轮尝试作废(`voidAttempt`),端点没做错任何事 —— 是参数不对。
                        if (!stripReasoningEffort && isReasoningEffortRejection(gerr.detail)) {
                            router.finish(item, {
                                leaseId,
                                ok: false,
                                voidAttempt: true,
                                status: 0,
                                error: `reasoning_effort 不被支持,丢参重试:${gerr.detail}`,
                                latencyMs: Math.round(performance.now() - t0),
                            });
                            stripReasoningEffort = true;
                            console.warn(`[as-one] reasoning_effort rejected (${model}, ${item.endpoint.endpointId}) → 丢参重试: ${gerr.detail}`);
                            if (attempt < maxAttempts) {
                                continue;
                            }
                        }
                        router.finish(item, {
                            leaseId,
                            ok: false,
                            status: httpStatusOf(gerr),
                            error: gerr.detail,
                            kind: gerr.kind,
                            latencyMs: Math.round(performance.now() - t0),
                            cooldownUntil: cooldownUntilOf(gerr),
                        });
                        // ⚠️ 与 stream() 同口径:凭据类失败 → 后台换 key(不阻塞)。
                        if (gerr.kind === UpstreamErrorKind.Auth && item.endpoint.provider === "sensenova") {
                            try {
                                runtime.onSensenovaKeyInvalid?.(item.endpoint.credentialKey[1]);
                            }
                            catch {
                                /* 通知失败不影响请求路径 */
                            }
                        }
                        lastError = gerr;
                        if (canFailover(gerr, item.endpoint.provider) && policy.shouldRetry(gerr) && !alreadyTried && attempt < maxAttempts) {
                            const delayS = policy.delayFor(attempt);
                            console.warn(`[as-one] failover ${attempt}/${maxAttempts} model=${model} ` +
                                `endpoint=${item.endpoint.endpointId} kind=${gerr.kind}: ${gerr.detail} ` +
                                `(退避 ${delayS.toFixed(2)}s 后换档)`);
                            await sleepMs(delayS * 1000);
                            continue;
                        }
                        throw gerr;
                    }
                    finally {
                        try {
                            scheduler.invalidate();
                        }
                        catch {
                            /* 忽略 */
                        }
                    }
                }
            },
            // 真实模型直连判 404 用;阶段一统一返回 undefined(未知)。
            hasModel() {
                return undefined;
            },
        };
    };
}
// ── 内部工具 ─────────────────────────────────────────────────────────────
/* ── 上游 SSE 解析(按协议) ─────────────────────────────────────────────── */
//# sourceMappingURL=gateway-upstream.js.map