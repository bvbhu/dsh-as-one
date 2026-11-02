# @as-one/plugin

As One 网关的 **DSH(Cordis)插件** —— 宿主半 + client 半同一个包。它把
`@as-one/core`(纯 TS 核心,零 Electron 依赖)、`@as-one/panel`(面板方法)、
`@as-one/panel-ui`(React 页面)装进 DSH:打开 SQLite、构造 Scheduler + Router,
把 OpenAI 兼容网关面挂在 **`ctx.webServer`**(不是自建 `http.Server`),把面板页
挂进 DSH 侧栏,并且通过 **LLM adapter 把模型列表直接嵌进 DSH 原生模型选择器**。

> 安装形态:DSH 插件管理器按 `github:owner/repo` 安装时会剥掉 `#` 之后的全部内容,
> **子目录装不了** —— 发布仓库的根必须就是这个插件包本身(`lib/` + `cordis.patch.yml`
> + `package.json` 直接入库)。`lib/` 是构建产物,发布前要先 `pnpm -C packages/dsh-plugin build`。

## 包结构

```
packages/dsh-plugin/
├── package.json          # DSH 插件 manifest(dsh.bundle.patch / dsh.client / peer)
├── cordis.patch.yml      # 注册条目(id: as-one-gateway, name: @as-one/plugin)
├── tsconfig.json         # typecheck(noEmit)
├── tsconfig.build.json   # 构建到 lib/
├── scripts/
│   ├── bundle-host.mjs   # esbuild 打 lib/index.js(自包含,只 import node 内置)
│   └── bundle-client.mjs # esbuild 打 lib/client.js(内联面板 CSS + React 页面)
├── src/
│   ├── index.ts          # Cordis 入口:resolveDirs → setupAsOne → 挂路由 / 面板 / llm adapter
│   ├── context-types.ts  # ctx.webServer / ctx.llm 的宿主服务结构镜像(零 Node 类型)
│   ├── setup.ts          # setupAsOne(options) 装配:DB + 凭据 + 调度 + 路由(可冒烟测)
│   ├── repo.ts           # AppSchedulerRepo: AsOneDatabase+ProviderRegistry → SchedulerRepo
│   ├── upstream.ts       # 转口 gateway-upstream.js 的 buildResolveUpstream(parity 副本)
│   ├── gateway-upstream*.ts   # ⚠️ apps/electron 的**逐字副本**(5 文件),见「与 Electron 的复用关系」
│   ├── models.ts         # 转口 @as-one/panel/modelcatalog(/v1/models 清单唯一真源)
│   ├── routes.ts         # 网关面 GET /v1/models、POST /v1/chat/completions
│   ├── panel-routes.ts   # 面板数据面 /as-one/api/<method>(PANEL_METHODS 白名单)
│   ├── panel-host.ts     # 把 AsOneRuntime 装成 PanelContext,复用 @as-one/panel 的 createPanel
│   ├── llm-adapter.ts    # ★ DSH LLM adapter:模型进原生选择器 + OpenAI delta → StreamChunk
│   ├── llm-types.ts      # dsh-llm 的类型结构镜像(宿主包只有 .js 无 .d.ts,不能 import)
│   ├── wire.ts           # readJsonBody / writeJson / toUpstreamRequest
│   ├── panel-types.ts    # 面板数据类型 type-only 镜像
│   ├── client.ts         # client 半入口(platform "web")
│   └── client/           # api.ts / panel.tsx / locales.ts / styles.ts / context.ts
└── test/                 # setup / api / gateway-max-tokens / llm-adapter
```

## 与 apps/electron 的复用关系

两个宿主**共用同一份核心与面板**,只有装配层各写一份:

| 本包文件 | 对应 electron 文件 | 复用方式 |
| --- | --- | --- |
| `src/setup.ts` | `apps/electron/src/main/assembly.ts` | 同装配顺序,去掉 `http.Server` 与窗口 |
| `src/repo.ts` | `apps/electron/src/main/core-repo.ts` | 逐字段移植(只共享 core API) |
| `src/gateway-upstream*.ts` | `apps/electron/src/main/gateway-upstream*.ts` | **逐字副本**,`cp` 同步 |
| `src/panel-host.ts` | `assembly.ts` 的 createPanel 段 | 共用 `@as-one/panel` 的 `createPanel`/`dispatchPanel` |
| `src/models.ts` | `assembly.ts` | **都只是转口** —— 真源在 `@as-one/panel/src/modelcatalog.ts`(见下) |

⚠️ **`/v1/models` 清单只有一份实现**。历史上它是两个宿主各一份逐字副本,漂移过一次
(插件版不过滤 `hidden`);现在 `listModelEntries` / `providersWithCredentials` /
`dedupeLabels` 全在 `packages/panel/src/modelcatalog.ts`,`src/models.ts` 与
`assembly.ts` 都只做 re-export —— 改口径只需改一处,不会再两边跑。
| `src/client/` + `@as-one/panel-ui` | Electron 渲染进程 | 同一套 React 页面 |

⚠️ **`gateway-upstream*.ts` 是副本,会漂移**。改完 Electron 侧必须同步:

```bash
cp apps/electron/src/main/gateway-upstream*.ts packages/dsh-plugin/src/
for f in gateway-upstream gateway-upstream-body gateway-upstream-errors \
         gateway-upstream-peers gateway-upstream-stream; do
  diff -q apps/electron/src/main/$f.ts packages/dsh-plugin/src/$f.ts
done
```

历史上就漂移过一次:插件副本缺 qoder 通道整块、`canFailover(gerr)` 少传 `provider`,
导致 sensenova/workbuddy 的「429 不换档」在插件里完全失效(提交 390d876 修)。

关键坑(装配期已踩平,port 时保留注释):

- **Router.plan 只吃 router 侧链项**:engine 的 `Endpoint` 实例不能直接喂
  `Router.plan` —— `withEndpointViews` 把 `inCooldown/realModelKey/username` 挂成
  不可枚举自有属性。必须经 `chainItemFrom` 显式搬运字段(`toRouterChain`)。
- **directChain 必须返回扁平行**:engine 直连路径把整行当端点 dict 喂
  `Endpoint.fromData`;嵌套行会让 provider/base_url 全空。
- **webServer handler 抛错 = 400**:宿主 catch 住 handler 异常后只写
  `writeHead(400)`+end。所以鉴权 401、未知模型 404、无可用上游 503
  **必须在自己 handler 里 writeJson**,不能靠 throw。

## ctx.webServer 挂载的路由表

宿主 `webServer` 契约(事实来源:已安装的 `@deepseek-ai/dsh-host-webserver`
包内 `lib/index.js`,需要时从宿主的 `resources/app.asar` 解包查阅):

- `register(route)`:route = `{ kind: 'exact'|'prefix', path, handler }`;
  重复 (kind, path) 直接 throw;返回 disposer(删表条目)。
- 匹配顺序:exact 表命中 → prefix 表最长前缀胜 → fallback(桌面包的 SPA dist
  已占 fallback,**OpenAI 路由必须用 exact/prefix**)。
- gzip 中间件对 `text/event-stream` 显式放行 → SSE 流式不受缓冲。

| 方法 | 路径 | kind | 行为 |
| --- | --- | --- | --- |
| GET | `/v1/models` | exact | 鉴权 → `{ object:"list", data: ModelEntry[] }`(**`rt.listModels()` 是 async,必须 await**) |
| POST | `/v1/chat/completions` | exact | 鉴权 → 读 body → resolveUpstream → `stream ? SSE : JSON` |
| POST | `/as-one/api/<method>` | exact × N | 面板数据面,白名单 = `panel-routes.ts` 的 `PANEL_METHODS`(64 项)+ `getUsageSummary`,共 **65 条 exact 路由** |

面板数据面 wire 形状(docs/client-half-design.md §5):
`{ ok: true, value: T }` 成功 / `{ ok: false, error: { code, message } }` 失败。
新增面板方法要**五处登记**:`@as-one/panel` 的 `types.ts` 与实现、
`panel.ts` 的 dispatchPanel、`panel-ui/src/api.ts`、本包 `panel-routes.ts` 白名单。

SSE 流式复用 core 导出的 `forwardStream`(gateway/server.js):逐块
`res.write(ssePackChunk(chunk))`、收尾 `ssePackDone()`;客户端断开经
`clientDisconnectSignal` 感知,首块后失败不再向外抛。

## LLM adapter:模型直接进 DSH 选择器

`src/llm-adapter.ts` 注册 provider `as-one`(显示名「As One · 合一」),DSH 的
模型下拉就多了这一组 —— **前端零改动**,数据源是唯一的:
`dsh-api-session-controller` 的 `buildModelCatalog` = `ctx.llm.listProviders()`
→ 每 provider `listModels` → 每 model `resolveModelInfo`,
`groups.filter(g => g.models.length > 0)`。所以 **`listModels` 返回空 = GUI 里没这个组**。

注册走 `ctx.inject(["llm"], child => …)` 而不是加进顶层 `export const inject`:
加进 inject 会让**整个插件**在宿主没有 llm 服务时(老版本宿主/纯 Web 形态)连网关
路由都不挂;`inject(deps, callback)` 是独立子 fiber,依赖不满足只是不执行。
注册本身必须在 `child.effect` 里 —— 宿主 `registerAdapter` 靠 `ctx.effect` 记账,
子 fiber 销毁(HMR/卸载)时不摘路由,下次 apply 就撞 `DUPLICATE_ADAPTER`。

四条硬规矩(逐条对着宿主源码核过,违反就是整条链路报错):

1. **流语法**(`dsh-llm/lib/types/invariant.js` `validateStream`):
   `block-start` 的 index 不得重复;`*-delta` 必须落在已开的**同型**块上;
   `block-end` 必须 index 已开且 `block.type` 一致;`usage` 最多一次;
   **`finish` 唯一、收尾时不得有未关闭块、finish 后再出 chunk 直接 fail**。
   上游是 OpenAI delta 形态(没有块概念),所以块由 `translateStream` 合成,
   按出现顺序分配 index,同类内容复用同一 index。
2. **错误形状**(`normalizeLlmFailure`):宿主只在「own `failure` 且
   `failure.code === own code`」时复用失败信息,否则一律 `UNKNOWN` —— 状态码与
   Retry-After 全丢。所以抛错必须用 `AsOneLlmError`(自带 `code` + `failure`),
   且 message 优先取**上游原文**(`err.raw.text`),与网关的「原样透传」定案同口径。
3. **元数据边界**(`normalizeModelInfo`):`contextWindow` / `defaultMaxTokens`
   必须是**正安全整数**(库里 NULL 就不给,别填 0);`reasoning.efforts` 不得是
   空数组(空 → `INVALID_MODEL_REASONING`),所以只在真有名单时声明,且不填
   `defaultEffort`(填了宿主会强制带强度)。
4. **方法表必须补齐**(`LlmAdapter` 基类)**—— 2026-11-01 踩过**。宿主基类为
   `providerInfo` / `providerRetryPolicy` / `imageRequestPricing` /
   `imageRequestTarget` / `listModels` / `resolveModel` / `prepareCall` / `stream`
   都写了默认实现,但本 adapter 是**普通类**(宿主只有 .js 没有 .d.ts),
   **一个默认实现都拿不到**。宿主调用处写成
   `this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model)`,
   可选链只护前面的 `get()` —— 方法不存在时抛的是
   `TypeError: … imageRequestPricing is not a function`,而且发生在**计量阶段**,
   现象是「请求发不出去」而日志指向 llm runtime 深处。
   声明了 `inputModalities: ["text","image"]` 之后宿主才会调图像计价/目标,
   于是这个缺口在对纯文本模型时看不出、一上视觉模型就炸。
   `test/llm-adapter.test.ts` 里有一条**逐字对照宿主方法表**的用例钉住它。

另外:`inputModalities` 按**能力事实**声明 —— 只有 `supports_vision === true` 才给
`["text","image"]`,否则 `["text"]`(宿主会把图片投影成文字)。声明 image 之后请求
侧必须真能接住图片(见 `toChatMessages` 的图片块转换),否则就是「声明了支持却丢图」。
`imageRequestPricing` 返回 `undefined`(不声明视觉 token 定价,由计量方回落中性估算);
`imageRequestTarget` 原样透传宽/高/字节。基类文档要求的 `attributionHeaders()` 在这里
不适用:adapter 不发公网 HTTP,调的是**同进程内**的 `rt.resolveUpstream`,
归因头由各连接器在真正的出口负责。

**显示名**:`ModelEntry` 有两个字段 —— `name` 是这个模型自己填的人话名,
`display_name` 是整张清单摆一起后**保证互不相同**的名字(`listModelEntries` 里
统一算:真实模型撞名追加 provider,逻辑模型只在填了 `logical_model.display_name`
时追加调用串,追加后仍撞用序号兜底)。adapter 取
`display_name ?? name ?? id`,所以选择器里看到的是 `deepseek-flash (sensenova)`
这种可分辨的名字,而**调用串 `id` 永远不变** —— 宿主 `normalizeModelInfo` 要求
`model.id` 逐字等于请求的 model,改 id 就是改 API。

`stream()` 结束会调 `rt.onRequestDone(...)`,所以 DSH 里发起的对话与外部 API 调用
记在**同一份** `logs/requests-YYYYMMDD.jsonl` 与同一套用量统计里。

## 上下文长度:量,而不是猜

网关发包前的裁剪(`gateway-upstream-context.ts`)要一个 prompt token 数。这个数
**不能猜**:猜高了白扔用户的历史,猜低了请求被上游 400 打回,用户干等半分钟看到
一条红字。

DeepSeek V4 的官方 tokenizer 已经内联进来(`@as-one/core/src/tokenizer/`):

```
packages/core/scripts/build-deepseek-tokenizer.mjs  # 官方 tokenizer.json → 1.1MB 的 TS 模块
packages/core/src/tokenizer/deepseek-v4-vocab.generated.ts  # 只留 merges + 特殊 token 字面量
packages/core/src/tokenizer/deepseek.ts             # 纯 TS 字节级 BPE,零依赖
packages/core/src/tokenizer/deepseek.test.ts        # 官方 Python tokenizers 的黄金向量
```

- **为什么内联而不是运行时读文件**:插件装进 `~/.dsh/profiles/<p>/node_modules/`
  之后,`import.meta.url` 指向的是 esbuild 打出来的 `lib/index.js`,
  再去按相对路径找资源就是在赌安装形态。内联之后不存在这种失败模式,
  也不依赖 wasm/原生模块(Electron 侧同样吃);
- **为什么只留 merges**:数个数只要「合并的先后顺序」;vocab(128k 条 token→id)、
  normalizer、decoder 全是死重(6.3MB → 1.1MB);
- **准到什么程度**:40 条逐 token 串对比 + 15 条边界 + 276 条随机样本,与官方
  Python `tokenizers` **0 差异**;
- **成本**:建表 ~100ms(`index.ts` 启动时预热),1.2M 字符 ≈ 1.0s,常规请求几十毫秒;
- **谁用它**:`counterForModel(provider, model)` —— 名字带 `deepseek` 的走词表,
  其它厂商(词表没拿到)继续用字符加权估算,日志里标 `deepseek-v4` / `heuristic`。

改词表(换了 tokenizer.json)之后重跑生成脚本即可,`deepseekMergeCount()` 那条
测试会盯着文件是否完整。

### 装得进窗口 ≠ 装得进配额

量准了只解决「装不装得下」,不解决「一次能不能发那么多」。2026-11-02 凌晨
`/compact` 连试三次全红的记录:

| 时间 | 报文 | 上游答复 |
|---|---|---|
| 22:43 | 2333 条 / 125 万字符 | `400 context_length_exceeded` |
| 23:32 | 2337 条 / 126 万字符 | `400` 裸 `code: 3` |
| 00:14 | 2338 条 / 126 万字符 | **`429 inference exceeds tpm/rpm limit`** |

前两条是窗口问题(裁到装得下就好了),第三条换了性质:请求约 60 万 token,
在 1M 窗口里,但**一次就吃掉了上游一分钟的配额**。压缩请求天生是这个形状——
把整段历史再发一遍去做总结——所以硬等 60 秒回来它还是这么大,还是把下一个
窗口打满。

判据拆成两条(`isContextOverflow` / `isRateLimitOversize`):

- 400 类 → 裁到装进窗口,并把「被拒的长度」记进 `observedCeilings` 供后续请求预裁;
- **429 且请求 ≥ 窗口 50%** → 同样砍半重发,但**不写** `observedCeilings`。
  429 只说明这一分钟配额不够,不说明窗口只有这么大;混在一起会把端点永久压到
  一半窗口,之后每条正常消息都白丢历史。

50% 这条线是为了保住普通长对话:sensenova 实测 28.8 万 / 1M ≈ 27%,限流时该
原样退避重试,不该被顺手裁掉工具结果。

## 鉴权

沿 core `EnvKeyProvider`:`ONE_API_KEY` 环境变量;未设置 → 放行 + 一次性
警告(missingKeyWarning)。请求携带方式:Authorization Bearer / x-api-key /
`?key=`(core auth.ts 的 `extractPresentedKey` 语义)。

> ⚠️ 已知缺口:面板路由 `/as-one/api/*` 与 `/v1/models` 目前**不过 DSH 的 token
> 校验**,同机任意进程可裸调。宿主 webServer 的鉴权只覆盖它自己的会话面。

凭据(上游账号的 secret)存在 **SQLite 的 `credential` 表**,经
`DbCredentialBackend` 读写 —— SQLite 是唯一真源,运行期没有 JSON 配置文件。

## 路径与配置

`cordis.patch.yml` 注册 `id: as-one-gateway`、`name: @as-one/plugin`,
`config.gatewayPort: 4000`(保留字段,宿主路由形态**不建端口**)。

路径解析(全部可被 patch 的 config 覆盖;`resolveDirs` in `src/index.ts`):

| 配置键 | 默认 | 说明 |
| --- | --- | --- |
| `dataDir` | `config.dataDir` → `$AS_ONE_DATA_DIR` → `<homedir>/.as-one` | 数据目录 |
| `configDir` | `<dataDir>/config` | 保留字段(SQLite 为真源后不再放 JSON 配置) |
| `dbPath` | `<dataDir>/as-one.db` | SQLite(WAL + foreign_keys) |
| 明细日志 | `<dataDir>/logs/requests-YYYYMMDD.jsonl` | **显式按 dataDir 对齐**,不用 setupAsOne 的 `<configDir>/logs` 缺省 —— 否则与独立应用共用 dataDir 时日志会分叉成两份 |

与独立 Electron 版默认同一个 `<homedir>/.as-one`,所以两个形态**看到同一份数据**。

## 构建与自测

```bash
pnpm install                              # 根工作区:链接 @as-one/core 等 workspace:*
pnpm -C packages/dsh-plugin typecheck     # tsc -p tsconfig.json (noEmit)
pnpm -C packages/dsh-plugin build         # lib/index.js + lib/client.js(自包含)
pnpm -C packages/dsh-plugin test          # vitest run(冒烟:tmp 目录,不上网)
```

`lib/index.js` 只 import node 内置(`node:os/path/fs/sqlite/crypto/https/stream/
perf_hooks`),**没有任何 `@deepseek-ai/*` 运行时依赖** —— 宿主那些包只有 .js 没有
.d.ts,类型全靠本包 `llm-types.ts` / `context-types.ts` 的结构镜像,运行时不 import。

冒烟测试只断言 setupAsOne 不抛、空配置返回空链/空计划、stub 配置能构造出链,
**不依赖真实上游 token**。`test/llm-adapter.test.ts` 里的 `hostValidateStream` 是宿主
`validateStream` 的**逐字转录**(注释标了来源路径与行号),宿主改了要同步。

## 与独立 Electron 版的差异

| 维度 | Electron 版(apps/electron) | 本插件(DSH 内) |
| --- | --- | --- |
| HTTP 服务 | `startGateway` 自建 `http.Server`(:4000) | `ctx.webServer.register` 挂路由,宿主管端口 |
| 面板 | IPC(`createPanel` → preload) | HTTP `/as-one/api/*` + client 半 React 页 |
| 模型选择器 | 自己的页面 | `llm-adapter.ts` 注册进 **DSH 原生选择器** |
| 数据目录 | `<homedir>/.as-one`(默认,同插件) | `<homedir>/.as-one`(可 patch 覆盖) |
| 热重载 | 需重启应用 | DSH HMR:apply 里现建现放,dispose 清理 |
| 上游逻辑 | `gateway-upstream*.ts`(源) | 同名**逐字副本**,`cp` 同步 |

## 在真机验证

```bash
# 第二个 DSH 实例(as-one-dev profile),不碰当前会话宿主
node scripts/launch-dev-dsh.mjs --port 19399 --profile as-one-dev --no-hmr
curl -s http://127.0.0.1:19399/v1/models      # 应返回 {object:"list", data:[…]}
```

浏览器要打开 `http://127.0.0.1:19399/?token=<打印的 token>` —— DSH 的鉴权是
**只有 `GET /` 带唯一 token 才换 `dsh-auth-<host:port>` HttpOnly cookie**(换 host 名
`localhost` 与 `127.0.0.1` 会因 audience 不匹配 401);旧标签页卡在 401 时必须
关掉重开,复用同一标签页不会重新换 cookie。

模型目录本身**没有 HTTP 出口**(`session/modelCatalog` 是 `@Remote` typert 方法),
只能看 GUI。

## client 半

入口 `lib/client.js`(cordis 插件形状,`export const name = "@as-one/plugin/client"`、
`inject = ["slots","locale"]`,platform "web" 由 `package.json` 的
`dsh.client` 声明)。注册 locale 字典、侧栏行与主面板;页面本体是共享视图层
`@as-one/panel-ui`(与 Electron 同一套代码),数据全部走**文档相对**
`fetch('as-one/api/<method>', …)`(绝不 root-absolute),形状类型从
`src/panel-types.ts` type-only 导入。

面板样式由 `bundle-client.mjs` 把 `@as-one/panel-ui/src/styles.css` 内联进去并在
启动时幂等注入(`injectAsOneStyles()`),所以 client bundle 自包含、不依赖宿主 CSS。

**滚动容器在插件自己这一层**(`src/client/styles.ts` 的 `SHELL_CSS`):宿主的三栏骨架
中列是 `display:flex; overflow:hidden`,槽位锚点是 `display:contents`,面板是它的直接
flex item —— flex item 默认 `min-height:auto`,长页面会撑破中列再被 `overflow:hidden`
裁掉。故 `.asone-panel` 需要 `flex:1 1 auto` + `min-height:0` + `overflow-y:auto`
四条规则成套出现(缺一条就滚不动)。共享样式表 `.app{min-height:100%}` 保持不变,
Electron 独立应用的滚动行为不受影响。

## 输入框里的「当前请求真实模型」徽标

`src/client/routeBadge.tsx` 注册在 **`conversation.input.left`** —— 就是输入框卡片里
那条工具行,dsh-connect 系列(qoder / trae / workbuddy)放积分读数的地方。**list 型、
会话作用域**,各插件并排各占一格。

> ⚠️ 槽位选择是用户定案(2026-11-01):
> - `conversation.input.dock` 渲染在输入框**外面**(上方),否掉;
> - `conversation.input.model.label` 是 **single** 槽位、最低 priority 独占,已被
>   dsh-connect-qoder 占着 —— 进去要么被顶掉,要么顶掉别人,两条路都会让一方徽标消失。

显示的是**当前请求**的真实模型,不是「上次」:

| 状态 | 数据源 | 文案 |
| --- | --- | --- |
| 有请求在跑 | `ctx.ledger.detail()` 里该会话的在途租约(精确值) | `● 正在使用 auto → Seed-2.1-Pro` |
| 空闲 | `router.pins` 的亲和 pin → 在当前 `scheduler.chain()` 里翻回真实模型 | `○ 预计使用 auto → Seed-2.1-Pro` |
| 查不到 | —— | **不画**(新会话没跑过 / 规则改动后旧 pin 失效 / 后端未就绪) |

数据走面板方法 `getSessionCurrentRoute(sessionId, model)`(2s 轮询)。之所以不用
`/v1/models` 或明细日志:前者只有目录、没有选路结果;后者在「不记录日志」档位下
完全不写,拿它当数据源会让徽标在用户关掉日志后凭空消失。

只在本插件当值(`modelSelection` 投影的 `provider === "as-one"`)时渲染 —— 不抢
dsh-connect 的地盘。

