# 渠道接入指南（Trae / WorkBuddy / Qoder / CodeArts / MiniMax）

> 面向：要在 As One 里接入上游模型渠道的使用者与 agent。
> 目标：说清**每个渠道需要什么凭据、你必须亲手做什么、以及最容易踩的坑**。
> 代码依据：`core/connectors/*`、`core/collector/*`、`scripts/*-login.mjs`（截至 0.5.1）。

---

## 0. 先理解接入模型

As One 里一个「渠道」= **provider 定义** + **若干凭据（credential）** + **真实模型（real_model）**。
接入一个新渠道，本质是让 `credential` 表里出现一行可用密钥，且它对应的 provider 协议正确。

- **唯一真源**：`~/.as-one/as-one.db`（SQLite）。`secret` 列是全流程唯一的明文出口。
- **凭据键**：`<provider>/<username>`，例如 `workbuddy/<你的账号名>`。
- **入口**：面板「模型 → 渠道 / 供应商」页；部分渠道另有专门的一次性脚本（见各节）。

五个渠道分两类：

| 类型 | 渠道 | 你得做什么 |
|---|---|---|
| **能自动发现** | Trae | 只需在桌面客户端登录一次 |
| **要手工给凭据** | WorkBuddy、Qoder | 自己从客户端/网页取令牌，粘贴进面板 |
| **跑一次性脚本** | CodeArts、MiniMax | 执行登录脚本，按提示在浏览器授权 |

---

## 1. Trae —— 唯一支持自动发现的渠道

### 需要什么
- 一个 **Trae 桌面客户端**的登录态。

### 你要做什么
1. 打开 Trae 桌面客户端并登录（国内版 `Trae CN`；国际版 `Trae`；另有 `TRAE SOLO` 两个变体）。
2. 打开 As One 面板「模型 → 渠道 → Trae」，点刷新/自动发现。As One 会扫本机：
   - CLI 令牌：`~/.trae-cn/trae-jwt-token`（cn）、`~/.trae/trae-jwt-token`（sg）
   - 桌面登录态：`%APPDATA%\<Edition>\User\globalStorage\storage.json`（Windows）；
     macOS 在 `~/Library/Application Support/<Edition>/...`；Linux 在 `~/.config/<Edition>/...`
     —— 四个 edition 全扫：`Trae CN` / `Trae` / `TRAE SOLO CN` / `TRAE SOLO`
3. 发现结果会逐行标出来源（如「来源:CLI token 文件(cn)」），点采纳即可入池。

桌面登录态是 **"tc" AES-CBC 密文**，As One 自己解密，你不需要手动解。

### 坑
- ⚠️ **CLI 令牌不能用于计费与签到**。Trae 的计费/签到接口只认桌面版登录态，CLI token 会回 `401 code 1001`。
  如果你的机器只有 CLI 登录，聊天能跑，但**额度页和签到会失败** —— 必须去桌面客户端登录一次。
- ⚠️ **签到按设备放行**：同一台机器上多个 Trae 账号，一天只有第一个能签上，其余回 `9095 本设备今日已签`。
  As One 会把这些账号标成 `skipped`（不是失败）。想让某个账号优先签，配 `checkin.trae.priority.accounts`（逗号分隔用户名）。
- ⚠️ **`9074 当前参与用户太多` 是上游高峰限流，不是账号坏了**。隔几分钟再点一次即可，别重置凭据。
- ⚠️ **凭据字段不全也会表现为 9074**：通过不完整导入路径进来、只有 3 个键的账号，缺 `user_id` / `device_id`，
  上游会把不完整会话当异常，签到**持续**回 9074。正规的做法是让自动发现写完整的 raw（含 `user_id` / `edition` / `refresh_token`），
  而不是手工拼一个残缺凭据。对照样本：走完整自动发现的凭据有 18 个键、签到正常；残缺导入的只有 3 个键、持续 9074。
- 设备指纹由 As One 按 token 派生，**不会**复用 raw 里的真机指纹（否则多账号会被上游判定成同一设备）。

---

## 2. WorkBuddy —— 只需一个 token

### 需要什么
**只要 `token`**（JWT，三段点分）。其余字段 As One 会自动补：

| 字段 | 是否必填 | 来源 |
|---|---|---|
| `token` | **必填** | 你从客户端/网页取 |
| `uid` | 自动 | 从 JWT 的 `sub` 解析 |
| `region` | 自动 | 从 JWT 的 `iss` 推断（含 `workbuddy.cn` 判为 `cn`） |
| `domain` | 自动 | cn → `copilot.tencent.com`；global → `www.workbuddy.ai` |
| `enterprise_id` | 可选 | 仅企业号才发 |

### 你要做什么
1. 登录 WorkBuddy 桌面客户端（或网页版）。
2. 从登录态里取出 access token（JWT 形态，形如 `eyJ...`）。可用浏览器 DevTools 的
   Application → Local Storage / Cookies 找，或从客户端存储文件里读。
3. 面板「模型 → 供应商 → WorkBuddy」填入 token 保存。
4. 验证：渠道页看额度是否刷出来；或直接发一条消息。

### 坑
- ⚠️ **没有自动发现**。WorkBuddy 不像 Trae 有本机登录态扫描，`discover` 对它是恒空 —— 必须手工填。
- ⚠️ **`11140` 是设备级封禁**，不是普通 401。换号继续打同一台设备会「指纹连坐」，越换越糟。
  遇到 11140 应停手人工处理，不要靠换凭据绕过。
- ⚠️ **签到只有国内版有**。国际版是订阅制，签到入口直接跳过（「国际版无签到，额度走 payStatus」）。
- **别用不完整会话导入凭据**。残缺的 raw 会让上游把会话当异常处理（Trae 侧表现为持续 `9074`），
  走面板正常填入即可（As One 会把发现阶段的字段整包写进 raw）。

---

## 3. Qoder —— 给 PAT 或 refreshToken

### 需要什么
- `apiKey`：**PAT**（`pt-…`），或
- `refreshToken`（`drt-…`）。两者给其一即可，PAT 优先。

### 你要做什么
1. 登录 Qoder（**只接国内版**，`gateway.qoder.com.cn`）。
2. 取 PAT 或 refreshToken。
3. 面板「模型 → 渠道 → Qoder」填入。
4. 验证：Qoder 页面能拉到模型目录与积分。

### 坑
- ⚠️ **Qoder 不是 OpenAI 兼容上游**。它要自定义 base64 请求体 + cosy 签名
  (`md5(payloadB64 \n cosyKey \n date \n body \n path)`)，凭据是 PAT 先换 jobToken 再建 AES/RSA 会话。
  所以**不能**把它当普通 `openai` 协议配 —— 协议必须是 `qoder`。
- ⚠️ **国际版已移除**（2026-10-30 定案）。旧配置里 `base_url` 指向 `api1.qoder.sh` 也一律按国内处理。
- 签到活动每日 **10:00 (UTC+8)** 刷新；一天内的状态按这个周期算，不是自然日 0 点。

---

## 4. CodeArts —— 两族互不相通，跑脚本

### 需要什么
CodeArts 有**两条完全不通的路**，别混：

| 族 | 用途 | 鉴权 |
|---|---|---|
| **B 族（IDE/CLI）** | **推理**（聊天） | OAuth2 PKCE + DPoP → STS 临时 AK/SK → 每请求 `SDK-HMAC-SHA256` 签名 |
| **A 族（网页）** | 只能**签到/积分** | 网页 Cookie，必须含 `devclouddevuibjtcftk` |

### 你要做什么

**B 族（推理，最常用）**：
```bash
node scripts/codearts-login.mjs --oauth        # 起本地回调，浏览器授权后自动写库
node scripts/codearts-login.mjs --print-url    # 只打印授权链接，不监听本地端口
```

**A 族（签到/积分）**：
```bash
node scripts/codearts-login.mjs --cookie "a=1; devclouddevuibjtcftk=xxx; ..."
```

**导入别人导出的 session JSON**：
```bash
node scripts/codearts-login.mjs --from-json path/to/session.json
```

脚本成功后写库：`provider(codearts)` + `credential(codearts/<label>)`，
`raw_json` 里带 `accessKey` / `secretKey` / `securityToken` / `expiresAtMs` / `refreshToken` /
`domainId`，以及续期要用的 DPoP 私钥与 PKCE verifier。

### 坑
- ⚠️ **`refresh_token` 是一次性轮转的**：IDE 和网关同时续期会**互相作废**。
  所以脚本只做首次登录、不做后台刷新。别让 IDE 和网关同时在线续期同一个账号。
- ⚠️ **上游用 HTTP 200 + `error_code` 表达业务失败**，HTTP 状态码本身不可信。
  As One 会按 `error_code` 定案，否则会把「参数越界」误判成账号故障并熔断健康号。
- ⚠️ A 族和 B 族**不能互相替代**：拿 Cookie 去跑推理、或拿 AK/SK 去签到，都会失败。

---

## 5. MiniMax —— 设备码授权

### 需要什么
OAuth2 **设备码**流程（RFC 8628 + PKCE S256）签发的 `access_token` + `refresh_token`。

### 你要做什么
```bash
node scripts/minimax-device-login.mjs              # 国内版(account.minimax.cn)
node scripts/minimax-device-login.mjs --global     # 海外版(account.minimax.io)
node scripts/minimax-device-login.mjs --username <名字>      # 显式命名账号
node scripts/minimax-device-login.mjs --replace-stale        # 清掉已作废的旧凭据
node scripts/minimax-device-login.mjs --db <path>            # 指定库(默认 ~/.as-one/as-one.db)
```

1. 脚本会打印一个 `verification_uri_complete` 链接。
2. **你在浏览器打开它并授权**。
3. 脚本按 `interval` 轮询，拿到 token 后写进 `credential` 表（`kind=oauth` → Bearer）。

### 坑
- ⚠️ **区域不可混用**。国内版和海外版是两套独立账号体系，凭据只对同区域的 Agent 站点有效。
- ⚠️ `access_token` 是**不透明令牌**（`mmoat_…`），不是 JWT，解不出手机号/user_id。
  所以脚本会退化成「令牌哈希短名」（如 `mm-1a2b3c4d`）；想可读就加 `--username`。
- ⚠️ **`refresh_token` 被上游作废后必须重新授权**，而且新的授权会生成**一套新的 `uuid` / `device_id`**
  —— 等于换了一台设备会话。这是正常行为，不用复用旧指纹。
- 旧授权行会留在库里继续报 401，用 `--replace-stale` 清理（它只删**已过期**的 minimax 凭据，未过期的绝不删）。

---

## 6. 通用检查清单

接入任何渠道后，按这个顺序确认：

1. **凭据进库了吗** —— 渠道页能看到账号行。
2. **协议对了吗** —— 面板「供应商」里该 provider 的 protocol 必须是正确值
   （`trae` / `workbuddy` / `qoder` / `codearts` / `minimax`，**不能**一律填 `openai`）。
3. **额度能刷出来吗** —— 额度页有数字 = 凭据有效。
4. **模型目录能拉吗** —— 渠道页展开卡片能看到模型列表。
5. **真发一条消息** —— 这是最终验收。

出现问题先看 `~/.as-one/logs/requests-YYYYMMDD.jsonl`（结构化请求日志），
`kind` 字段会直接告诉你失败类型（`auth` / `rate_limit` / `upstream` / `connection` / `timeout`）。

---

## 7. 风控红线（重要）

- **不要用不完整会话导入凭据**（WorkBuddy 9074、Trae 身份不全都由此而来）。
- **不要靠换账号绕过设备级封禁**（WorkBuddy `11140`、Trae `11128`）。换号会指纹连坐。
- **不要让同一账号在两个客户端同时续期**（CodeArts refresh_token 一次性轮转）。
- **不要混用区域**（MiniMax 双区、Trae cn/sg 都是独立体系）。
- 遇到封禁类错误码，**停下来人工处理**，不要写循环重试。
