# @as-one/plugin

As One 网关的 **DSH(Cordis)宿主半插件**。把 `@as-one/core`(纯 TS 核心包,零
Electron/React 依赖)以真正的 Cordis 插件形态装进 DSH:启动时读取
`as-one.providers.json` 与 `as-one.credentials.json`、打开 SQLite(`as-one.db`)、
构造 Scheduler + Router,并把 OpenAI 兼容网关面挂在 **`ctx.webServer`** 上
(不是自建 `http.Server`)。

> 包名说明:选用 `@as-one/plugin`(任务二选一)。它是宿主半(服务端)的包名;
> client 半(React 面板)共用同一个包,入口为 `./client`(见「client 半接口约定」)。

## 包结构

```
packages/dsh-plugin/
├── package.json          # DSH 插件 manifest(dsh.bundle.patch / dsh.client / peerDeps)
├── cordis.patch.yml      # 注册条目(id: as-one-gateway, name: @as-one/plugin)
├── tsconfig.json         # typecheck(noEmit)
├── tsconfig.build.json   # 构建到 lib/
├── src/
│   ├── index.ts          # Cordis 入口:apply(ctx, config) → resolveDirs → setupAsOne → ctx.effect 挂路由
│   ├── context-types.ts  # ctx.webServer 等宿主服务的结构镜像(零 Node 类型,client 半可引用)
│   ├── setup.ts          # setupAsOne(options) 纯函数:配置+凭据+DB+调度+路由 装配(可冒烟测)
│   ├── repo.ts           # AppSchedulerRepo: AsOneDatabase+ProviderRegistry → SchedulerRepo
│   ├── upstream.ts       # buildResolveUpstream: 链 → Router 选路 → 凭据 → 连接器 → fetch
│   ├── models.ts         # /v1/models 条目(逻辑+真实模型)
│   ├── routes.ts         # ctx.webServer 路由 handler(GET /v1/models, POST /v1/chat/completions)
│   ├── panel-routes.ts   # 面板数据面 /as-one/api/*(client 半数据路由,8 方法)
│   ├── panel-types.ts    # 面板数据类型(type-only 镜像,零 Node 类型,client 半可引用)
│   ├── wire.ts           # readJsonBody / writeJson / toUpstreamRequest(port core gateway 内部工具)
│   └── client.ts         # ⚠️ 占位符,并行任务(client 半)整体替换
└── test/setup.test.ts    # 冒烟:tmp 目录建库/加载配置/构造链,不依赖真实上游 token
```

## 与 apps/electron 的复用关系

宿主半**不复制 electron 主进程逻辑**,而是与它共享同一份 `@as-one/core`
冻结 API(`package.json` 依赖 `"@as-one/core": "workspace:*"`,运行时经
`@as-one/core/src/<file>.js` 子路径导入;构建期由 DSH 的 dev-profile 任务负责
编译/打包,与 electron 的 `externalizeDepsPlugin({ exclude: ['@as-one/core'] })`
同思路):

| 本包文件 | 对应 electron 文件 | 说明 |
| --- | --- | --- |
| `src/repo.ts` | `apps/electron/src/main/core-repo.ts` | 逐字段移植(不共享代码,只共享 core API) |
| `src/upstream.ts` | `apps/electron/src/main/gateway-upstream.ts` | 同上,含 toRouterChain 转换 |
| `src/setup.ts` | `apps/electron/src/main/assembly.ts` | 同装配顺序,**去掉建 http.Server 与面板** |
| `src/models.ts` | `assembly.ts 的 listModelEntries` | 逐字段一致 |
| `src/routes.ts` | `packages/core/src/gateway/server.ts 的 handleRequest` | 语义同款,输出接 ctx.webServer |
| `src/panel-routes.ts` | `assembly.ts 的 createPanel` | 8 方法逐字段移植,wire 换 `{ok,value}/{ok,error}` |

关键坑(装配期已踩平,port 时保留注释):

- **Router.plan 只吃 router 侧链项**:engine 的 `Endpoint` 类实例不能直接喂
  `Router.plan` —— `withEndpointViews` 把 `inCooldown/realModelKey/username`
  挂成不可枚举自有属性,`withHealth` 用 descriptor 拷贝。必须经
  `chainItemFrom` 显式搬运字段(`toRouterChain`)。
- **directChain 必须返回扁平行**:engine 直连路径把整行当端点 dict 喂
  `Endpoint.fromData`;嵌套行会让 provider/base_url 全空。
- **webServer handler 抛错 = 400**:宿主 catch 住 handler 异常后只写
  `writeHead(400)`+end(若 headersSent 则 destroy)。所以鉴权 401、未知模型
  404、无可用上游 503 **必须在自己 handler 里 writeJson**,不能靠 throw。

## ctx.webServer 挂载的路由表

宿主 `webServer` 契约(事实来源
已安装的 `@deepseek-ai/dsh-host-webserver` 包内 `lib/index.js`):

- `register(route)`:route = `{ kind: 'exact'|'prefix', path, handler }`;
  重复 (kind, path) 直接 throw;返回 disposer(删表条目)。
- 匹配顺序:exact 表命中 → prefix 表最长前缀胜 → fallback(桌面包的 SPA dist
  已占 fallback,**OpenAI 路由必须用 exact/prefix**)。
- gzip 中间件对 `text/event-stream` 显式放行 → SSE 流式不受缓冲。

| 方法 | 路径 | kind | 行为 |
| --- | --- | --- | --- |
| GET | `/v1/models` | exact | 鉴权 → `{ object:"list", data: ModelEntry[] }` |
| POST | `/v1/chat/completions` | exact | 鉴权 → 读 body → resolveUpstream → `stream ? SSE : JSON` |
| POST | `/as-one/api/getStatus` | exact | 面板数据面:网关状态 |
| POST | `/as-one/api/getRuntime` | exact | 在途租约 + 最近请求 |
| POST | `/as-one/api/getUsageSummary` | exact | statsDaily 汇总 |
| POST | `/as-one/api/listProviders` | exact | 渠道/账户状态 |
| POST | `/as-one/api/setAccountEnabled` | exact | `{provider,index,enabled}` → 内存 overlay |
| POST | `/as-one/api/getRecentRequests` | exact | `{limit?}` → 最近请求(裁剪) |
| POST | `/as-one/api/getRequestLogStatus` | exact | 落盘状态(disabled 空实现) |
| POST | `/as-one/api/getSettings` | exact | 网关合成 + master_key + request_log |

面板数据面 wire 形状(docs/client-half-design.md §5):
`{ ok: true, value: T }` 成功 / `{ ok: false, error: { code, message } }` 失败;
面板类型为 **type-only** 镜像 `src/panel-types.ts`(零 Node 类型,client 半
可 `import type` 引用,数据全走 host 路由、不 import @as-one/core)。

SSE 流式复用 core 导出的 `forwardStream`(gateway/server.js):逐块
`res.write(ssePackChunk(chunk))`、收尾 `ssePackDone()`;客户端断开经
`clientDisconnectSignal` 感知,首块后失败不再向外抛。

## 鉴权(核心语义)

沿 core `EnvKeyProvider`:`ONE_API_KEY` 环境变量;未设置 → 放行 + 一次性
警告(missingKeyWarning)。请求携带方式:Authorization Bearer / x-api-key /
`?key=`(core auth.ts 的 extractPresentedKey 语义)。

> TODO(阶段二):接入 `ctx.credentials`(DSH 凭据服务)替换/补充
> `FileCredentialBackend`。当前阶段凭据 = `<configDir>/as-one.credentials.json`
> (JSON 明文文件,与 electron 版一致)。

## 路径与配置

`cordis.patch.yml` 注册 `id: as-one-gateway`、`name: @as-one/plugin`,
`config.gatewayPort: 4000`(保留字段,宿主路由形态不建端口)。

路径解析(全部可被 patch 的 config 覆盖):

| 配置键 | 默认 | 说明 |
| --- | --- | --- |
| `dataDir` | `$AS_ONE_DATA_DIR` → ctx.dataDir → `<homedir>/.as-one` | 数据目录,**绝不写死到桌面 profile 既定文件** |
| `configDir` | `<dataDir>/config` | 放 `as-one.providers.json` / `as-one.credentials.json` |
| `dbPath` | `<dataDir>/as-one.db` | SQLite(WAL + foreign_keys + SCHEMA_V7) |

## 构建与自测

```bash
pnpm install            # 根工作区:链接 @as-one/core workspace:* + 装 devDeps
pnpm --filter @as-one/plugin typecheck   # tsc -p tsconfig.json (noEmit)
pnpm --filter @as-one/plugin build       # 产出 lib/index.js 等
pnpm --filter @as-one/plugin test        # vitest run(冒烟:tmp 目录,不上网)
```

冒烟测试只断言 setupAsOne 不抛、空配置返回空链/空计划、stub 配置能构造出链,
**不依赖真实上游 token**(credentials 里是 dummy secret)。

## 与独立 Electron 版的差异

| 维度 | Electron 版(apps/electron) | 本插件(DSH 宿主半) |
| --- | --- | --- |
| HTTP 服务 | `startGateway` 自建 `http.Server`(:4000) | `ctx.webServer.register` 挂路由,宿主管端口 |
| 面板 | createPanel IPC | client 半(并行任务) |
| 数据目录 | `configDir` / `dbPath` 显式传入 | patch config 可覆盖,默认 `<homedir>/.as-one` |
| 热重载 | 需重启 | DSH HMR:apply 里现建现放,dispose 清理 |
| core 编译 | externalizeDepsPlugin exclude + workspace:* | dev-profile 任务负责(parallel) |

## client 半接口约定(留给并行任务)

- 入口:`lib/client.js`(本包现为占位符 `src/client.ts`),必须是 cordis 插件
  形状(`export const name` + `export function apply(ctx, config)`),platform
  "web" 已由 `dsh.client` 声明;
- inject 最小集:`@deepseek-ai/dsh-client-locale`、`dsh-client-ui-slots`、
  `dsh-client-ui-primitives`(package.json `dsh.client.inject` 已配);
- 宿主侧可复用 `src/context-types.ts` 的结构镜像做类型(零 Node 类型);
- **面板数据面已就绪**:`/as-one/api/*` 8 个 POST exact 路由(见路由表),
  wire 为 `{ok,value}/{ok,error}`;client 半直接 `fetch('as-one/api/<method>', …)`
  相对地址(文档相对,绝不 root-absolute),形状类型自 `src/panel-types.ts`
  type-only 导入(等价 `apps/electron/src/shared/panel-types.ts` 的 RendererApi
  8 方法子集);
- setAccountEnabled 写 `runtime.accountOverlay`(内存态,阶段二再持久化),
  listProviders 的 `enabled` 字段即 overlay 与配置的合并结果。
