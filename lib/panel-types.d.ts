/**
 * 面板数据类型 —— 宿主半路由与 client 半共享的 type-only 镜像。
 *
 * 形状与 apps/electron/src/shared/panel-types.ts 对齐(该文件为三端共享),
 * 这里复制 client 需要的子集,避免 client 包依赖 electron 目录或 Node 类型。
 * ⚠️ 本文件必须零 Node 类型、零运行时(可被 client 半引用)。
 */
/** 渠道类型:channel=Nexus 托管渠道(trae/workbuddy/sensenova 等);endpoint=OpenAI 兼容端点。 */
export type ProviderKind = "channel" | "endpoint";
/** 渠道账户(Nexus Status.ProviderState.Account;enabled 为面板扩展,见 setAccountEnabled)。 */
export interface AccountInfo {
    index: number;
    env_var: string;
    has_key: boolean;
    /** 密钥指纹(SHA-256 前 8 位;未配置时为 null)。明文密钥绝不回传,只读展示。 */
    key_fp: string | null;
    label: string;
    source: string;
    /** 面板扩展字段:enabled 以宿主半内存 overlay 维护(阶段二再持久化)。 */
    enabled: boolean;
}
/** 渠道/供应商状态。 */
export interface ProviderState {
    provider: string;
    env_prefix: string;
    kind: ProviderKind;
    base_url: string | null;
    model_count: number;
    exists: boolean;
    readable: boolean;
    error: string | null;
    count: number;
    accounts: AccountInfo[];
    login: {
        logged_in: boolean;
        reason: string | null;
    } | null;
}
/** 网关状态。 */
export interface GatewayStatus {
    ready: boolean;
    reason: string | null;
    uptime_s: number;
    deployments: number;
    healthy_count: number;
    cooldown_count: number;
    metrics_enabled: boolean;
    metrics_generated_at: string | null;
    providers: ProviderState[];
}
/** 用量合计。cache_hit_rate 取值 0..1,null=无样本。 */
export interface UsageTotals {
    tokens: number;
    requests: number;
    fails: number;
    prompt_tokens: number;
    completion_tokens: number;
    cached_tokens: number;
    cache_hit_rate: number | null;
    active_days: number;
}
/** 模型用量行。 */
export interface UsageModelRow {
    model: string;
    provider: string;
    tokens: number;
    requests: number;
    fails: number;
    cache_hit_rate: number | null;
}
/** 供应商用量行。percent 取值 0..1。 */
export interface UsageProviderRow {
    provider: string;
    tokens: number;
    requests: number;
    fails: number;
    percent: number;
}
/** 用量汇总。 */
export interface UsageSummary {
    generated_at: string | null;
    source: string;
    range: string;
    granularity: "day" | "month";
    from: string | null;
    to: string | null;
    last_day: string | null;
    totals: UsageTotals;
    providers: UsageProviderRow[];
    models: UsageModelRow[];
}
/** 在途租约(conv 为会话序号,重启清零,绝不展示 session_id)。 */
export interface InflightLease {
    seq: number;
    conv: number;
    real_model_id: string;
    endpoint_id: string | null;
    stream: boolean;
    elapsed_s: number;
}
/** 最近请求(logical_model 为 null 表示直连)。 */
export interface RecentRequest {
    seq: number;
    conv: number;
    real_model_id: string;
    logical_model: string | null;
    endpoint_id: string | null;
    stream: boolean;
    ok: boolean;
    status: number | null;
    error: string | null;
    latency_ms: number | null;
    ttft_ms: number | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    cached_tokens: number | null;
    tps: number | null;
    finished_s_ago: number;
}
/** 运行时快照。 */
export interface RuntimeSnapshot {
    ready: boolean;
    uptime_s: number;
    in_flight_total: number;
    by_real_model: Record<string, number>;
    leases: InflightLease[];
    recent: RecentRequest[];
    recent_limit: number;
}
/** 请求日志落盘模式。 */
export type RequestLogContentMode = "off" | "structure" | "full" | "edges";
/** 请求日志状态。 */
export interface RequestLogStatus {
    enabled: boolean;
    content_mode: RequestLogContentMode;
    content_modes: {
        value: RequestLogContentMode;
        label: string;
    }[];
    path: string | null;
    size_bytes: number;
    counters: Record<string, number>;
    last_error: string | null;
}
/** 设置段。 */
export interface SettingsSection {
    key: string;
    label: string;
    items: {
        key: string;
        value: unknown;
    }[];
}
/** 设置快照(gateway 字段为合成,见 getSettings 注释)。 */
export interface SettingsSnapshot {
    gateway: {
        base_url: string;
        port: number;
        auth_required: boolean;
    };
    master_key: string | null;
    request_log: RequestLogStatus;
    sections: SettingsSection[];
}
/** setAccountEnabled 请求体。 */
export interface SetAccountEnabledBody {
    provider: string;
    index: number;
    enabled: boolean;
}
/** getRecentRequests 请求体(limit 可选)。 */
export interface GetRecentRequestsBody {
    limit?: number;
}
