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
- 上下文整形交由宿主 `compaction-basic`；插件只在内部切换模型时触发一次压缩。
- 图像桥只使用 `routes.vision` 指定的视觉模型；解析结果附带「能否完成任务」的
  结构化判断，判定不能完成时结束本轮并提示更换模型。
- 辅助请求的重路由见下节，**默认全空 = 不做任何重路由**。

## 重路由（routes）

压缩摘要、图像解析、会话标题这三类请求由宿主/网关自己发起，带 `purpose` 标记。
默认不重路由 —— 它们跟着客户端选的模型走。需要时按用途指定目标模型：

```yaml
- id: as-one-gateway
  name: '@bvbhu/as-one'
  config:
    routes:
      compact: free       # purpose: "compaction"（分块再摘要）
      vision: free        # 图像桥解析（必须真的能看图）
      sessionTitle: free  # purpose: "session-title"
```

- 值 = as-one 里的**抽象模型名**；某一项不写就是该用途不重路由。
- 重路由的请求会**隔离会话号**（`<sid>:<purpose>`）、**不带工具**、图片只留
  可寻址占位（不读像素、不发 base64），因此不会占用用户会话的亲和 pin。
- 配了但库里没有该模型：该次请求**回落原模型并告警**，不产生「半个重路由」。

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
