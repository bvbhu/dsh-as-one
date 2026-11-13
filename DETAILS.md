# @bvbhu/as-one 说明

## 形态

仓库即插件包本身：根目录的 `package.json` / `cordis.patch.yml` / `lib/` 是 DSH
安装入口，`lib/index.js` 由 esbuild 把全部源码内联打包，运行时零依赖。
源码按职责平铺在 `src/`（宿主半）、`core/`（调度与网关）、`panel/`、
`panel-ui/`（client 半）。

## 安装

`dsh plugin --profile <name> add github:bvbhu/dsh-as-one`，或在插件管理器中启用。
数据目录默认 `<homedir>/.as-one`，可用 `cordis.patch.yml` 的
`dataDir` / `configDir` / `dbPath` 覆盖。

## 能力

- 通过 `ctx.llm.registerAdapter` 把网关的逻辑模型嵌进 DSH 原生模型选择器。
- 宿主半以 `ctx.webServer` 暴露 OpenAI 兼容网关面，不自建 HTTP 服务。
- 多账号调度、冷却、路由与健康检查由 `core/` 承担，持久状态放 SQLite。
- 上下文整形交由宿主 `compaction-basic`；插件只在内部切换模型时触发一次压缩，
  并把带 `purpose: compaction` 的请求路由到独立的低成本车道。
- 图像桥只使用具备视觉输入的模型；解析结果附带「能否完成任务」的结构化判断，
  判定不能完成时结束本轮并提示更换模型。

## 构建与检查

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` 生成 `lib/index.js` 与 `lib/client.js`。发布前需把 `lib/` 一并入库。

## 许可

MIT。
