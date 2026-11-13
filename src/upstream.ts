/**
 * 网关 resolveUpstream —— **parity 转口**。
 *
 * 历史:本文件原是一份 557 行的简化移植(只处理 openai 直连路径)。
 * 2026-10-30 起改为**整份复用** electron 版实现:
 * `apps/electron/src/main/gateway-upstream.ts` 与它的 4 个伴生文件
 * (`gateway-upstream-{body,errors,peers,stream}.ts`)**只依赖 `@as-one/core`
 * 与彼此**,没有 electron API 依赖,所以可以原样搬进插件包 —— 行为与桌面版
 * 严格一致(workbuddy 闸门/线格式、trae 报文体、sensenova 账号池、图像桥、
 * 换档重试、思考强度钳制、逻辑模型输出上限、连接超时…)。
 *
 * ⚠️ 同步纪律:electron 侧的这 5 个文件改动后,必须同步复制到本包
 * (`cp apps/electron/src/main/gateway-upstream*.ts packages/dsh-plugin/src/`),
 * 否则两形态行为漂移。同步后用 `pnpm --filter @bvbhu/as-one typecheck` 兜底。
 */

export { buildResolveUpstream, type UpstreamRuntime } from "./gateway-upstream.js";
