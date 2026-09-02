# ohttps-deploy 协作规范

## 项目现状

`ohttps-deploy` 是已可运行的单管理员自托管证书控制台。它从 ohttps 同步证书，验证并以不可变版本缓存到本地，再通过 SSH 安全部署到受管服务器。Web 进程只提供控制台与 API；独立 Worker 负责迁移、调度、同步、部署、通知和清理。

当前仓库不是空骨架。修改前先阅读相关 Route Handler、Worker 流程、Drizzle schema 和已有测试；不要把早期方案文档当作现状，也不要从旧版参考文件复制生产代码。

## 已实现的边界

- 单管理员模式，账号名固定为 `admin`。Worker 首次启动时生成一次初始密码并仅写入 Worker 启动日志；认证使用 Better Auth，会话、受保护路由和同源 CSRF 校验均已接入。
- Web/API 基于 Next.js App Router 的 Node.js Runtime；SQLite + Drizzle 是默认持久化方案。`web` 与 `worker` 共享数据目录，Worker lease 保证只有一个 Worker 执行队列与定时任务。
- 证书版本保存为不可变目录，`current` 指针原子切换；私钥 `0600`、证书链 `0644`。本地 X.509 `NotAfter` 是有效期的依据，ohttps 的 `expiredTime` 仅作辅助字段。
- SSH push 是唯一部署模式。所有目标服务器共用一把 SSH 私钥；每台服务器必须保存并校验 SHA-256 主机指纹。部署先执行 `nginx -t`，上传到临时目录，再原子替换、reload、可选健康检查；替换后的失败会尝试回滚。
- 自动扫描只读取本地证书。默认剩余 20 天才同步 ohttps；每个本地证书版本至多同步一次，并受最小调用间隔和每日调用上限保护。新版本会按已启用策略自动创建部署任务。
- Webhook 使用 JSON `POST`，并发送 `x-ohttps-deploy-signature: sha256=<HMAC-SHA256>` 与 `x-ohttps-deploy-event-id`。事件不包含私钥或完整 PEM；失败投递指数退避，且不覆盖同步/部署任务的原始状态。
- Docker Compose 的持久目录默认是 `./data`，包含数据库、证书版本和归档日志。数据库备份等同于 ohttps、SSH 和 Webhook 凭据备份。

## ohttps 协议约定

所有 ohttps 协议细节必须集中在 `app/domain/ohttps-client.ts`（或它的直接替代适配器）中，业务代码不得自行拼签名或请求。

- Endpoint：`https://ohttps.com/api/open/getCertificate`
- 参数：`apiId`、`timestamp`、`certificateId`、`sign`
- 签名原文：`apiId={apiId}&apiKey={apiKey}&certificateId={certificateId}&timestamp={timestamp}`
- 算法：小写 32 位 MD5
- 成功响应：`success`、`msg`、`payload.certKey`、`payload.fullChainCerts`、`payload.expiredTime`

真实 API key、SSH 私钥、证书、Webhook secret、cookie 和 Authorization 值不得出现在仓库、测试夹具、截图、API 响应、普通日志或错误信息中。旧版曾含明文凭据；如仍可访问，应立即轮换或撤销。

## 关键安全约束

- 所有外部 I/O 必须有超时、明确错误处理和脱敏日志。不得以 `StrictHostKeyChecking=no` 或等价方式跳过 SSH 主机校验。
- SSH 命令是高风险输入。继续使用既有命令校验和非交互式 `sudo -n` 模式，不要把未经验证的配置拼进本机 shell 命令。
- API 不得返回任何 secret 或 PEM；设置接口只能返回“是否已配置”的摘要。敏感值可以按本项目单管理员 MVP 决策明文保存在 SQLite，但数据卷必须仅对应用用户可读。
- 长任务只由 Worker 执行。HTTP 请求只能创建/查询/取消/重试任务或订阅 SSE，不能等待同步或 SSH 部署完成。
- 证书写入、远端替换和任务创建必须保持幂等或原子化；失败不能破坏上一份可用证书。
- 恢复数据库前要停止 Worker 并隔离外部流量。保留 `.before-restore` 回退文件，恢复后运行迁移并先做 dry-run 验证。

## 开发方式

1. 先追踪完整调用链和已有测试，再以最小可审查改动解决问题。复用 `app/domain`、`app/deployer`、`app/worker` 与 `app/lib` 的现有边界；不要为单一实现添加抽象层。
2. 数据模型变更先写可重复执行的 Drizzle migration，再更新 schema、领域逻辑、Route Handler 和 UI。避免依赖 SQLite 专有行为，除非迁移同时说明替代方案。
3. 前端改动必须先阅读并遵守 `ui-styling` skill；优先复用 `app/components/ui/` 中的 shadcn/ui 组件。Dialog、Sheet、Tabs、表单、表格、提示等通用交互不得手写替代品。
4. 外部系统通过可替换适配器访问；ohttps、SSH 和 Webhook 测试使用 fake 实现或注入的依赖，绝不访问真实凭据或生产主机。
5. 每项逻辑变更都要补最小相关测试。运行 `pnpm test`、`pnpm typecheck`；涉及构建或 Docker 时还要运行 `pnpm build`、`docker build .`。不要覆盖或回退用户已有的工作区改动。

## 当前范围与未实现项

- 支持 SSH 私钥认证与中心端 push；不支持 pull agent、密码认证、多管理员、RBAC 或任意部署器。
- SQLite 数据卷是主路径。可配置 libSQL/Turso URL，但这不表示 PostgreSQL 已被验证或可以无缝替代所有运行假设。
- `/api/metrics` 提供基础 Prometheus 文本指标；它不是完整的监控、告警或高可用方案。
- 生产部署仍需要使用者提供 HTTPS 反向代理、防火墙/网络隔离、加密备份和恢复演练。参见 `docs/disaster-recovery.md`。

## 提交规范

使用 Conventional Commits：`<type>[optional scope]: <description>`。常用 type：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`、`build`、`ci`、`perf`。描述简洁、使用祈使句、不加句号；一个提交只处理一个逻辑变更。任何兼容性破坏以 `!` 或 `BREAKING CHANGE:` 标注，且绝不包含敏感值。
