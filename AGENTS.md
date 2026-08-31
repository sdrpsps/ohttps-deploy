# SSL Deploy 项目协作与实现规范

## 1. 项目目标

构建一个 Docker 化的证书管理与部署平台：从 ohttps 获取证书（或复用本地缓存），检查有效期，按配置分发到多台服务器，执行部署/reload 命令，提供过期提醒、实时日志和历史审计。

当前仓库为空；`/Users/sunny/Library/Mobile Documents/com~apple~CloudDocs/杂项/ohttps/` 中的三个文件是旧版参考实现，不应直接复制为生产代码。

## 2. 已确认的 ohttps 对接约定

旧版使用以下请求模型，封装时必须集中在 `OHTTPSClient`（或等价适配器）中，不要散落到业务代码：

- 接口：`https://ohttps.com/api/open/getCertificate`
- 查询参数：`apiId`、`timestamp`、`certificateId`、`sign`
- 签名原文：`apiId={apiId}&apiKey={apiKey}&certificateId={certificateId}&timestamp={timestamp}`
- 签名算法：小写 32 位 MD5
- 成功响应字段：`success`、`msg`、`payload.certKey`、`payload.fullChainCerts`、`payload.expiredTime`

API 凭据属于机密。旧版配置含有明文凭据，提交任何代码前应立即轮换/撤销；仓库、日志、截图、测试夹具和错误响应中都不得出现真实 `apiKey`。

## 3. 推荐架构（MVP）

采用“中心控制器 push 到远端”的第一版方案，并为后续 pull agent 保留接口：

1. **API/Web 控制器**：管理证书、服务器、部署策略、任务和审计记录。
2. **任务执行器**：异步执行获取、检查、分发、reload、通知任务；任务状态可重试、取消、超时。
3. **ohttps 适配器**：负责签名、HTTP 超时、响应校验和证书字段解码。
4. **部署器接口**：`Deployer` 抽象至少支持 `SSHDeployer`；未来可增加 `AgentDeployer`、Webhook 或云厂商实现。
5. **持久化**：MVP 使用 SQLite（Docker volume）保存业务配置、任务、日志以及敏感配置；代码不得依赖 SQLite 特性，以便以后切换 PostgreSQL。
6. **前端**：Next.js 页面实现证书/服务器/策略配置、手动执行、任务详情、实时日志和历史检索。
7. **通知器**：Webhook 为首选，支持超时、指数退避、签名和幂等；通知失败不能覆盖部署任务的原始错误。

### 已确认技术栈

- Web/API 使用 Next.js App Router + TypeScript，以 Node.js Runtime 自托管在 Docker 中。
- 使用 Next.js Route Handlers 实现 REST API、Webhook 接收和 SSE 日志流；不使用静态导出，也不在 Edge Runtime 中执行 SSH、SQLite 或文件系统逻辑。
- 数据访问使用 SQLite + Drizzle ORM；SQLite、证书版本目录和日志目录挂载到持久化卷。
- 前端组件统一基于 shadcn/ui；需要新增或修改前端组件时，必须先使用可用的 shadcn skill，若当前环境没有该 skill，则使用 shadcn/ui 官方组件和 CLI，再进行业务定制。
- SSH/SFTP 使用 Node.js SSH 库（优先 `ssh2`/`node-ssh`），部署逻辑放在独立的 `SSHDeployer` 适配器中。
- 定时任务和长耗时操作运行在独立 Worker 进程/容器中。Next.js 请求只创建任务、查询状态或订阅日志，不在 HTTP 请求中同步等待部署完成。
- `web` 与 `worker` 共享 SQLite 数据卷；Worker 是唯一执行定时任务和部署任务的进程，并使用数据库锁避免重复执行。

推荐使用 `docker compose` 启动 `web`、`worker` 和可选反向代理。Next.js 官方支持以 Node.js 服务或 Docker 自托管；生产环境应由 Nginx 等反向代理置于 Next.js 之前。

本项目为单管理员模式，用户名固定为 `admin`。首次启动若数据库没有管理员，应生成初始密码并在容器启动日志中显示；不要求强制修改密码，但密码不得写入 API 响应或普通业务日志。启动日志中的初始密码属于敏感信息，后续应支持管理员主动修改。

## 4. 证书生命周期

### 获取与缓存

- 证书缓存按 `certificateId`（可附带域名别名）建立版本目录，不直接覆盖当前版本。
- 优先读取本地缓存并解析 X.509 叶子证书的 `NotAfter`；API 的 `expiredTime` 只作辅助信息，不能替代本地解析。
- 距离过期日大于 `renew_before` 时默认跳过拉取；支持“立即刷新”强制调用 ohttps，但必须在界面明确提示该操作可能产生费用。
- ohttps 的自动更新会在证书到期前约 30 天运行；本项目只在本地证书剩余 20 天时同步一次 ohttps 证书内容和实际过期时间。检测到新版本后直接自动部署，不再等待网页确认。
- 自动任务平时只解析本地 X.509 到期时间；同步动作默认每个证书续期周期只执行一次。管理员可手动强制同步，但必须明确提示可能产生费用。
- 同步成功后记录 `last_checked_at`、远端证书指纹、实际 `NotAfter` 和同步结果；同步失败使用退避重试，但必须有每证书最小间隔，避免重复任务产生额外费用。
- 价格页明确列出证书更新、部署和监控任务的余额消耗，但未明确说明 `getCertificate` 查询调用是否单独计费；实现仍应按“调用有成本”设计，并保留全局调用统计。
- 拉取成功后校验 PEM、私钥与证书匹配、域名/SAN（如策略要求）和有效期，再做原子提交。
- 当前版本用不可变版本目录 + `current` 指针（或等价原子替换）；失败时保留上一份可用证书。
- 私钥文件权限为 `0600`，证书链可为 `0644`；API、日志和前端不得返回私钥内容。

### 多服务器分发（推荐的 SSH push MVP）

- 每台服务器保存地址、端口、用户名、认证引用、目标证书路径、目标私钥路径、reload 命令、健康检查命令、超时和启用状态。所有服务器默认使用统一的 Nginx 目标路径，允许单台覆盖。
- MVP 使用所有服务器共用的一把 SSH 私钥；按单管理员部署假设，私钥、ohttps 凭据和 Webhook Secret 可以明文保存在 SQLite。数据库文件和 Docker volume 必须限制为应用用户可读，绝不通过 API、前端、普通日志或错误响应返回；备份数据库等同于备份全部凭据。
- MVP 默认只支持 SSH 私钥认证；密码认证需显式开启并使用外部 secret，不写入普通业务表或日志。
- 使用 `known_hosts`/主机指纹校验，禁止无条件 `StrictHostKeyChecking=no`。
- 先上传到远端临时目录，再校验文件、设置权限、原子替换目标文件，执行 reload，最后清理临时文件。
- reload 命令是高风险配置：保存前做语法校验和明确提示；执行时使用非交互模式、超时、完整退出码记录。不要把未经授权的任意 shell 拼接到系统命令中。
- 同一证书对多台服务器采用 fan-out 任务；每台主机独立成功/失败，可配置“全部成功才算成功”或“允许部分成功”。默认不因一台失败而停止其它主机。
- 自动获取到新版本后立即创建并执行 SSH 分发任务；通用 Webhook 仅用于通知获取成功、部署成功/失败、即将过期和异常，不提供确认链接。
- SSH 部署应支持 dry-run、单机重试、并发上限和全局取消。

后续可增加 **pull agent**：远端 agent 定期向中心拉取已批准版本，中心无需保存入站 SSH 凭据；不要在 MVP 中同时实现两套完整协议。

## 5. 过期提醒与调度

- 后台定时任务周期性扫描所有证书的本地缓存：即将过期、已过期、获取失败、分发失败分别生成事件。默认不因扫描本身调用 ohttps。
- 每小时（可配置）解析本地证书；剩余 20 天时执行一次同步，读取 ohttps 返回的证书和实际过期时间。若指纹或过期时间发生变化，立即创建并执行分发任务；若未变化，标记本周期已同步。同步失败按退避重试，并通过 Webhook 告警。
- 事件应去重（同一证书/服务器/状态/时间窗口只通知一次），状态恢复时发送恢复通知。
- Webhook 请求包含事件 ID、时间、对象、状态、错误摘要和签名；不得包含私钥或完整证书内容。
- 记录投递次数、最后错误和下次重试时间；提供手动重发。
- 所有时间统一存储 UTC，前端按用户时区显示。

## 6. 前端最低功能

1. 仪表盘：证书数量、即将过期、部署失败、最近任务。
2. 证书：ohttps `certificateId`、域名、当前版本、到期时间、续期阈值、启用/停用、立即刷新。
3. 服务器：连接测试、主机指纹、路径、reload/健康检查命令、并发组和启用状态；敏感字段只显示摘要。
4. 部署策略：证书到服务器的映射、自动部署开关、失败策略和并发设置。
5. 任务详情：阶段、每台服务器状态、实时日志、退出码、重试/取消；历史日志支持按时间、证书、服务器筛选。
6. 设置：ohttps 凭据、Webhook、默认阈值、调用最小间隔、每日调用上限、调度频率和保留期限。

实时日志优先使用 SSE（简单、适合单向日志流）；若未来需要双向终端控制再升级 WebSocket。断线后必须能用任务 ID 从历史日志续读，不能只依赖内存缓冲。

## 7. 建议的数据模型

- `certificates`：`id`、`ohttps_certificate_id`、名称/域名、`renew_before`、状态、当前版本、到期时间。
- `certificate_versions`：版本号、证书指纹、获取时间、到期时间、证书/私钥存储引用、校验结果。
- `servers`：连接信息、主机指纹、路径、命令、超时、启用状态、secret 引用。
- `deployments`：任务 ID、证书版本、触发来源、整体状态、策略、开始/结束时间。
- `deployment_targets`：任务与服务器的关联、状态、重试次数、退出码、错误摘要。
- `logs`：任务/目标、序号、时间、级别、消息（脱敏后），保证序号单调递增。
- `notifications`：事件、渠道、投递状态、重试信息、响应摘要。
- `audit_events`：谁在何时对什么对象执行了什么动作及结果。

所有表需要创建时间、更新时间和软删除/停用字段（适用时）；迁移必须可重复执行。

## 8. API 约定（起步）

- `GET /api/health`
- `GET/POST/PATCH /api/certificates`
- `POST /api/certificates/{id}/refresh`
- `GET/POST/PATCH /api/servers`
- `POST /api/servers/{id}/test-connection`
- `GET/POST /api/deployments`
- `GET /api/deployments/{id}`
- `POST /api/deployments/{id}/cancel`、`/retry`
- `GET /api/deployments/{id}/events`（SSE）
- `GET /api/logs`、`GET /api/audit-events`

接口返回稳定的错误码和脱敏消息；长任务接口返回任务 ID，不要同步阻塞 HTTP 请求。

## 9. 安全与可靠性底线

- 默认绑定在反向代理之后；生产环境必须启用认证、CSRF/CORS 策略和 HTTPS。
- 按单管理员和自部署场景，API key、SSH 私钥、Webhook secret 可明文保存在 SQLite；必须限制数据库文件和 Docker volume 权限，并确保它们不会通过 API、前端、日志或错误响应泄露。数据库备份必须视为凭据备份。
- 日志统一脱敏：`apiKey`、私钥、Authorization、cookie、Webhook secret、完整 PEM 均不得输出。
- 所有外部请求设置连接/读取超时、重试上限和速率限制；ohttps 时间戳与签名错误要给出可诊断但不泄密的错误。
- 任务具备幂等键，避免重复部署；证书写入和远端替换必须原子化。
- 保留审计和任务日志，默认保留期可配置；清理前先归档或确认。
- 测试必须覆盖签名向量、响应异常、证书/私钥匹配、过期阈值、远端失败回滚、日志脱敏和通知重试。

## 10. 开发约定

- 先写迁移、领域模型和接口，再接 UI；业务逻辑不得放在前端或 shell 脚本中。
- 当任务需要编写前端组件时，先检查并使用 shadcn skill；组件应优先复用 shadcn/ui，保持可访问性、键盘操作、响应式布局、主题变量和项目整体视觉一致性。
- 外部系统全部通过接口和可替换适配器访问；测试使用 fake ohttps、fake SSH 和 fake notifier。
- 每个变更提供单元测试；涉及任务编排或 SSH 时增加集成测试，Docker 镜像构建和健康检查必须在 CI 验证。
- 不提交真实配置、证书、私钥、生产主机名或 API 凭据；提供 `.env.example` 和脱敏示例。
- 任何部署命令、数据库迁移或凭据格式变更，都要在变更说明中写出回滚方式。
- 保持小而可审查的提交；不要为了重构而改动与任务无关的文件。

### 10.1 前端组件与 shadcn/ui 强制约定

- 任何前端页面、布局或交互组件改动，必须先阅读并遵守可用的 `ui-styling` skill。
- 必须优先复用 `app/components/ui/` 中已有的 shadcn/ui 组件；缺少组件时，使用 `pnpm dlx shadcn@latest add <component>` 生成，不得手写或复制低层 UI primitive。
- Dialog、Sheet/Drawer、Tabs、Alert、Toast、Popover、表单控件、表格等通用交互必须使用 shadcn/ui 组件。页面仅负责领域数据、事件处理与这些组件的组合。
- 不得手写替代 shadcn/ui 的 Modal、抽屉、导航 Tab、提示框、按钮、输入框或其他通用组件。仅在 shadcn/ui 无法覆盖的业务展示结构中使用语义化 HTML 与 Tailwind 组合。
- 保持单个业务页面组件约 250 行为宜（不是硬性限制）；超过时应首先通过 shadcn/ui 组合、数据映射或复用已有组件缩减，而不是新增自定义通用组件库。
- 新增 shadcn 组件后，必须运行类型检查和构建；不得删除 shadcn 生成的无障碍行为、键盘交互或焦点管理。

## 11. 分阶段交付

### Phase 0：设计与安全基线

确认部署模式、认证方式、secret 存储、通知渠道和单机/多用户边界；完成目录结构、迁移、配置校验、日志脱敏和 Docker Compose 骨架。

### Phase 1：单证书本地流程

实现 ohttps 适配器、本地缓存、X.509 校验、版本化存储、手动刷新和基础任务日志。

### Phase 2：SSH 多服务器部署

实现主机指纹校验、临时上传、原子替换、reload/健康检查、并发/重试/dry-run和目标级状态。

### Phase 3：Web 前端与实时历史日志

完成证书/服务器/策略页面、SSE、筛选、审计和连接测试。

### Phase 4：自动化与通知

实现定时扫描、自动刷新/部署、过期事件、Webhook 签名、去重、重试和恢复通知。

### Phase 5：生产加固

认证授权、备份恢复、PostgreSQL 兼容验证、指标/告警、限流、灾备和可选 pull agent。

## 12. 已确认的产品决策

1. 远端允许中心机 SSH push。
2. 单管理员，固定用户名 `admin`；首次启动自动生成初始密码并在启动日志显示，不强制首次修改。
3. 所有服务器共用一把 SSH 私钥，私钥明文保存于 SQLite，并依靠数据库文件权限保护。
4. 服务器使用统一的 Nginx 证书路径，允许例外覆盖。
5. ohttps 自动更新窗口按证书到期前 20 天执行；获取到新版本后自动部署，不需要网页确认。
6. 通知使用通用 JSON Webhook。
7. SQLite 保存配置、任务和日志。
8. 尽量降低 ohttps API 调用次数；每小时本地检查，证书剩余 20 天时每个续期周期同步一次 ohttps，发现版本变化后自动部署。
9. 技术栈采用 Next.js App Router + TypeScript、SQLite + Drizzle、独立 Node.js Worker 和 Docker Compose。

## 13. 编码前仍需确认

1. Webhook 是否需要在通用 JSON 之外增加自定义请求头或固定事件字段？
2. 是否需要在每次自动部署前执行 `nginx -t`，失败时禁止替换证书并保留旧版本？默认建议开启。

## 14. Git 提交规范

项目提交信息遵循 Conventional Commits 1.0.0（约定式提交）格式：

```
<type>[optional scope]: <description>
```

允许的常用 `type` 包括：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`、`build`、`ci` 和 `perf`。描述使用祈使句、简洁明确，不以句号结尾；一次提交只包含一个逻辑变更。

不兼容变更在 `type` 后添加 `!`，或在提交正文/页脚使用 `BREAKING CHANGE:` 说明。提交正文可用于解释背景和取舍，但不得包含 API key、私钥、完整证书、Webhook secret 或其他敏感信息。
