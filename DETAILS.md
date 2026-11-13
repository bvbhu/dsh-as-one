# @bvbhu/as-one 说明

## 形态

仓库即插件包本身：根目录的 `package.json` / `cordis.patch.yml` / `lib/` 是 DSH
安装入口，`lib/index.js` 由 esbuild 把全部源码内联打包，运行时零依赖。
源码按职责平铺在 `src/`（宿主半）、`core/`（调度与网关）、`panel/`、
`panel-ui/`（client 半）。

## 安装

`dsh plugin --profile <name> add github:bvbhu/dsh-as-one`，或在插件管理器中启用。

路径固定，没有配置文件、没有 YAML config：数据目录 `<homedir>/.as-one`，
库 `<homedir>/.as-one/as-one.db`，请求日志 `<homedir>/.as-one/logs`。

## 存储

**`as-one.db` 是唯一真源**：模型库、凭据、日统计、设置都在这个库里。

- 设置项在面板「设置」页读写，存 `setting` 表；保存后**下一个请求**即生效，不用重载。
- 账号启停、Qoder 模型勾选同样落 `setting` 表，重启后仍然记得。
- 没有任何 JSON 配置文件：备份只需拷 `as-one.db`。

## 能力

- 通过 `ctx.llm.registerAdapter` 把网关的逻辑模型嵌进 DSH 原生模型选择器。
- 宿主半以 `ctx.webServer` 暴露 OpenAI 兼容网关面，不自建 HTTP 服务。
- 多账号调度、冷却、路由与健康检查由 `core/` 承担。
- 上下文整形交由宿主 `compaction-basic`；插件只在内部切换模型时触发一次压缩。
- 图像桥只使用 `route.vision` 指定的视觉模型；解析结果附带「能否完成任务」的
  结构化判断，判定不能完成时结束本轮并提示更换模型。
- 辅助请求的重路由见下节，**默认全空 = 不做任何重路由**。

## 重路由

压缩摘要、图像解析、会话标题这三类请求由宿主/网关自己发起，带 `purpose` 标记。
默认不重路由 —— 它们跟着客户端选的模型走。需要时在「设置」页填目标模型：

| 设置项 | 作用 | 默认 |
|---|---|---|
| `route.compact` | `purpose: "compaction"`（分块再摘要） | 空 = 不重路由 |
| `route.vision` | 图像桥解析（必须真的能看图） | 空 = 不做图像桥 |
| `route.session_title` | `purpose: "session-title"` | 空 = 不重路由 |

- 值 = as-one 里的**抽象模型名**（逻辑模型名），例如 `free`。
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
