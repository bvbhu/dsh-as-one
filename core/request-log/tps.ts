// tps.ts
// ========================================================================
// 输出速率(tok/s)的**唯一**计算口径。
//
// 为什么需要这个文件(2026-11-07 用户定案):
//   面板与引擎各自现算 tps,分母一律取「生成窗口」= latency - ttft。
//   但有两种请求这个分母不成立:
//
//   1. **非流式请求**:`ttft_ms` 恒为 null(server.ts 的非流式分支就写 null),
//      旧公式直接 denom=0 → tps 恒 null。全库一堆纯非流式渠道(glm-5.2 3145 次、
//      deepseek-v4-pro 3090 次…)在面板上永远是「—」。
//
//   2. **伪流式请求**:上游(如 opencsg/deepseek-v4.1-flash-1017)先把话攒完
//      再整块吐出,首块几乎等于总耗时 —— 实测 ttft 只比 latency 小 1~5ms。
//      分母被压到几毫秒后 861 个 token 能算出 **430500 tok/s**,
//      22 条样本里 17 条突破 5000,完全没参考价值。
//
// 口径:**生成窗口站得住脚才用它,否则退回整段 latency(端到端吞吐)**。
//   - 站得住脚 = genMs >= max(50ms, latency * 5%)
//   - 50ms 是「至少够分出首块与生成」的下限;5% 是相对下限,
//     避免长请求里 900ms 的抖动被当成生成窗口。
//   两种口径都是 tok/s,数值可比;差别只在标签,调用方可用 `endToEnd`
//   自行加注(当前面板未加注,刻意保持简单)。
// ========================================================================

/** 生成窗口的绝对下限:短于此视为「首块即末块」,不给它算纯生成吞吐。 */
export const TPS_MIN_GEN_MS = 50;

/** 生成窗口占整段耗时的相对下限。 */
export const TPS_MIN_GEN_RATIO = 0.05;

export interface TpsInput {
  /** 输出 token 数。<= 0 视为不可算。 */
  completionTokens: number;
  /** 整段耗时(毫秒)。<= 0 视为不可算。 */
  latencyMs: number;
  /** 首字节耗时(毫秒);非流式传 null。 */
  ttftMs: number | null;
}

export interface TpsDetail {
  /** 四舍五入到 1 位小数的 tok/s;不可算时为 null。 */
  tps: number | null;
  /**
   * true = 分母用的是整段 latency(非流式,或伪流式退让)。
   * false = 用的是真实生成窗口(纯解码吞吐)。
   * tps 为 null 时无意义(置 false)。
   */
  endToEnd: boolean;
}

/** 按 1 位小数取整,与引擎/面板原有精度一致。 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 计算输出速率,并告诉你用的是哪种分母。
 *
 * 这是 tps 的唯一实现 —— 引擎侧 `EngineHealth.tps` 与面板侧
 * 逐请求、按天聚合三处都必须调它,不要再各写一遍公式。
 */
export function tpsOf(input: TpsInput): TpsDetail {
  const ct = input.completionTokens;
  const latencyMs = input.latencyMs;
  // 没有输出或没有耗时:不是「慢」,是「不可算」,必须给 null 而不是 0。
  if (!Number.isFinite(ct) || ct <= 0) return { tps: null, endToEnd: false };
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return { tps: null, endToEnd: false };

  const ttftMs = input.ttftMs !== null && Number.isFinite(input.ttftMs) && input.ttftMs > 0
    ? Math.min(input.ttftMs, latencyMs)
    : null;
  const genMs = ttftMs !== null ? latencyMs - ttftMs : 0;
  const minGenMs = Math.max(TPS_MIN_GEN_MS, latencyMs * TPS_MIN_GEN_RATIO);

  if (genMs >= minGenMs) {
    return { tps: round1(ct / (genMs / 1000)), endToEnd: false };
  }
  // 非流式(无 ttft)或伪流式(ttft≈latency):退回端到端吞吐。
  return { tps: round1(ct / (latencyMs / 1000)), endToEnd: true };
}

/** 只要数值时的便捷封装(绝大多数调用点用这个)。 */
export function computeTps(input: TpsInput): number | null {
  return tpsOf(input).tps;
}
