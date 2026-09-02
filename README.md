# ohttps-deploy

一个面向单管理员自托管环境的证书同步与 SSH 部署控制台。它从 ohttps 获取证书，验证证书与私钥、保留不可变版本，并把新版本安全分发到已配置的 Nginx 服务器。

它适合“中心机可以 SSH 连接目标服务器”的场景。Web 控制台只负责配置和观察；独立 Worker 执行所有耗时工作，因此刷新、部署和通知都不会阻塞浏览器请求。

> 这是用于管理生产私钥的系统。请先阅读[安全边界](#安全边界)，再将它暴露给网络。

## 能做什么

- 通过 ohttps `certificateId` 同步证书，并集中处理签名、超时和响应校验。
- 校验 PEM、私钥匹配、域名 SAN 和叶子证书有效期；证书按不可变版本保存，失败时保留上一份可用版本。
- 按服务器指纹验证 SSH 主机，临时上传后原子替换证书和私钥，执行 `nginx -t`、reload 与可选健康检查；失败后尝试回滚远端文件。
- 为每张证书设置部署目标；查看任务、目标级状态、实时日志和历史记录，并可取消或重试任务。API 也支持任务级并发、失败策略和 dry-run。
- 定时扫描本地证书。仅在进入续期窗口后同步 ohttps，且受到每证书最小间隔、每日调用上限和“每版本一次”保护，避免无意义的调用成本。
- 将同步、部署、过期和恢复事件作为带 HMAC 签名的 JSON Webhook 投递，并记录失败、重试和投递结果。
- 提供审计记录、基础 Prometheus 指标、数据库备份/恢复接口和日志归档。

## 工作方式

| 组件 | 职责 | 必须持久化的内容 |
| --- | --- | --- |
| Web | 登录、配置、创建任务、查询历史、SSE 日志流 | 无状态；与 Worker 共享数据目录 |
| Worker | 数据库迁移、调度、本地检查、ohttps 同步、SSH 部署、Webhook 与归档 | SQLite、证书版本、日志归档 |
| 目标服务器 | 验证来源 SSH 主机、接收证书、验证并重载 Nginx | 当前使用中的证书与私钥 |

## 开始前准备

- 一台可运行 Docker Compose 的中心机；中心机网络必须能访问 ohttps 和所有目标服务器的 SSH 端口。
- ohttps 的 API ID、API Key 和需要管理的 `certificateId`。
- 一把专用于本系统的 SSH 私钥；对应公钥必须已配置到每台目标服务器。当前版本的所有服务器共用这一把私钥。
- 目标服务器上的 Nginx、证书目标目录，以及允许部署用户执行的非交互 `nginx -t` / reload 命令。
- 一个 HTTPS 反向代理和只允许可信来源访问的网络边界（生产环境）。

可使用已有私钥，或在安全的管理机上生成一把专用密钥：

```bash
ssh-keygen -t ed25519 -f ./ohttps-deploy -C ohttps-deploy
```

妥善保管私钥 `./ohttps-deploy`。稍后将其内容粘贴到控制台；只把公钥 `./ohttps-deploy.pub` 配置到目标服务器。

## 用 Docker Compose 启动

### 1. 准备配置和数据目录

```bash
cp .env.example .env
mkdir -p data
chmod 700 data
```

在 Linux Docker 主机上，bind mount 的 `data` 目录还必须可由镜像内的 `app` 用户写入；否则 Worker 无法创建数据库和证书版本。先查看容器内 UID/GID，再在主机上把目录所有权交给它：

```bash
docker compose run --rm --no-deps --entrypoint sh worker -c 'id'
sudo chown -R <上一步的uid>:<上一步的gid> data
```

Docker Desktop 的文件共享通常会映射当前用户；仍应在首次启动后查看 Worker 日志，确认没有 `EACCES` 或数据库写入错误。

编辑 `.env`：

- 将 `AUTH_SECRET` 换成至少 32 个字符的随机值。例如运行 `openssl rand -base64 48`，将输出完整复制进去。
- 本地试用时设为 `BETTER_AUTH_URL=http://localhost:3000`。
- 通过 HTTPS 反向代理部署时，设为浏览器实际访问的完整 Origin，例如 `https://certs.example.com`；不要添加路径或末尾 `/`。
- 如需把持久数据放到其他位置，设置 `OHTTPS_DATA_DIR` 为中心机上的绝对路径。该目录包含数据库、私钥、证书版本和归档日志，必须限制访问权限。

默认 `DATABASE_URL`、`CERTIFICATE_STORAGE_DIR` 和 `LOG_ARCHIVE_DIR` 都位于 `./data`。不要把真实 ohttps 凭据、私钥、证书或 Webhook secret 写进 `.env`、仓库或截图：它们应在登录后通过控制台保存。

### 2. 启动 Web 与 Worker

```bash
docker compose up -d --build
docker compose logs -f worker
```

Worker 首次连接到**空数据库**时会创建 `admin` 并在日志中打印一次初始密码。立即保存该密码，随后访问 `http://localhost:3000` 登录并在**设置**中修改它。复用已有 `data` 或恢复数据库时不会生成或再次显示密码；初始密码也不会通过 API 返回。

确认服务和 Worker 均正常：

```bash
curl -fsS http://localhost:3000/api/health
```

响应中的 `status` 为 `ok` 且 `worker` 为 `true` 时，Worker 心跳正常。`degraded` 通常表示 Worker 尚未启动、无法连接共享数据库，或两分钟内没有更新心跳。

常用维护命令：

```bash
docker compose ps
docker compose logs -f web
docker compose logs -f worker
docker compose down
```

停止服务不会删除 `data` 目录。不要使用会删除数据卷或主机目录的清理命令，除非已经完成可用备份。

## 首次配置与首次部署

按以下顺序执行。控制台首页的“首次配置向导”也会显示缺失项。

### 1. 保存系统凭据与调度策略

登录后打开侧边栏的**设置**：

1. 填写 ohttps API ID 和 API Key。
2. 点击“配置私钥”，粘贴专用 SSH 私钥完整内容。
3. 可选：填写 Webhook URL 和签名密钥。
4. 检查续期与调度值。默认值为提前 20 天续期、最小调用间隔 86,400 秒、每日最多 100 次调用、每 60 分钟扫描、日志保留 90 天。

保存后，页面和 API 只会显示凭据是否已配置，不会显示已保存的内容。

### 2. 准备目标服务器

仓库包含一份幂等的辅助脚本，可创建受限部署用户、写入公钥、创建证书目录，并只授权 Nginx 验证和 reload 所需的 `sudo -n` 命令。在每个目标服务器上以 root 或 sudo 运行：

```bash
sudo bash scripts/setup-ohttps-deploy-user.sh --key "$(cat /安全路径/ohttps-deploy.pub)"
```

这条命令是在**目标服务器**上执行的；请先通过可信渠道将公钥文件传到该服务器。中心机上的路径不会自动在目标服务器可见。

默认用户为 `cert`、证书目录为 `/etc/nginx/ssl`。脚本完成后会输出需要填入控制台的用户名、证书路径、私钥路径、验证命令和 reload 命令。

如果 Nginx 运行在 Docker 容器中，使用容器名：

```bash
sudo bash scripts/setup-ohttps-deploy-user.sh --docker nginx --key "$(cat /安全路径/ohttps-deploy.pub)"
```

运行前请确认：目标目录已挂载给 Nginx（容器场景）、Nginx 配置已引用该路径、中心机可通过 SSH 到达目标主机。脚本会做权限和 `nginx -t` 自检；先解决脚本的失败项，再继续添加服务器。

### 3. 添加证书

打开**证书**并选择“添加证书”，填写：

- **名称**：仅用于控制台识别，例如“生产主站”。
- **域名**：必须存在于证书的 SAN 中，例如 `example.com`。同步时会校验。
- **ohttps 证书 ID**：来自 ohttps 的 `certificateId`。
- **提前续期天数**：通常保持 20；该值可以按证书覆盖全局默认值。

创建记录不会马上调用 ohttps。首次点击“立即同步”才会创建同步任务；该请求可能产生 ohttps 调用费用。

### 4. 添加并验证服务器

打开**服务器**，填写主机、端口和部署用户名。先点击“获取指纹”，由 Web 服务所在网络发起 SSH 握手并填入 SHA-256 主机指纹；保存服务器后执行“连接测试”。

默认远端路径和命令如下，可按单机实际情况覆盖：

| 设置 | 默认值 |
| --- | --- |
| 证书路径 | `/etc/nginx/ssl/fullchain.pem` |
| 私钥路径 | `/etc/nginx/ssl/privkey.pem` |
| 部署前检查 | `sudo -n nginx -t` |
| reload 命令 | `sudo -n nginx -s reload` |
| 单台超时 | 30 秒 |

不要手工跳过主机指纹验证，也不要配置要求交互式密码输入的命令。主机密钥更换时，先在目标服务器确认变更，再重新获取并保存指纹。

### 5. 建立部署策略并执行

在**部署策略**中，为每张证书勾选允许自动部署的已启用服务器。首次为某张证书配置策略时，控制台默认选中所有已启用服务器，请按实际范围检查后再保存。

回到**证书**点击“立即同步”。Worker 将按以下顺序执行：

1. 读取 ohttps，检查额度与最小调用间隔。
2. 验证证书、私钥和域名 SAN；发现新版本后原子保存。
3. 为该证书所有已勾选且已启用的服务器创建部署任务。
4. 在每台服务器上先校验现有 Nginx 配置，上传临时文件，原子替换，再验证、reload 和可选健康检查。

在**任务**页面打开任务详情，查看每台服务器的状态和日志。首次接入建议先只把低风险服务器纳入策略，验证连接、路径和命令成功后，再扩展到生产服务器；需要 dry-run 时可通过认证 API 创建任务。

## 日常使用

### 自动续期

Worker 按“设置”中的扫描频率读取每张启用证书的本地版本。扫描本身不会调用 ohttps。进入该证书的续期窗口后，Worker 才会排队同步，且同一当前版本只同步一次；同步失败受最小调用间隔和每日上限约束。发现指纹或到期时间变化时，Worker 保存新版本并立即按部署策略分发。

手动“立即同步”是强制同步，会绕过正常续期时机，但仍会消耗调用额度并可能产生 ohttps 费用。只在明确需要检查远端新版本时使用。

### 任务、日志与重试

- **任务**：查看队列、运行、成功、部分成功、失败和取消状态；正在执行的任务可以取消，未成功任务可以按原策略重试。
- **同步历史**：查看证书同步阶段、错误摘要和日志。相同版本不会重复部署。
- **审计与活动**：按证书、服务器、状态和时间筛选。日志使用 SSE 实时显示，断线后可按任务 ID 从历史记录恢复。
- **通知**：配置 Webhook 后，系统投递带事件 ID 和 HMAC 签名的 JSON。接收端应校验 `x-ohttps-deploy-signature`，并使用 `x-ohttps-deploy-event-id` 去重。

Webhook 事件体的形状如下；不包含私钥、完整证书或原始密钥：

```json
{
  "eventId": "…",
  "eventType": "deployment.succeeded",
  "occurredAt": "2026-09-02T00:00:00.000Z",
  "object": { "type": "deployment", "id": "…" },
  "status": "success"
}
```

## 备份、恢复与观测

- 在没有同步、部署或恢复任务写入时，用已登录管理员会话请求 `GET /api/backup` 下载 SQLite 数据库；数据库本身包含敏感配置，必须加密并异地保存。
- 在同一无写入时间窗口，备份 Compose bind mount `${OHTTPS_DATA_DIR:-./data}` 下的 `certs` 目录；否则数据库记录可能指向缺失或不匹配的证书版本。日志归档保存在 `logs` 目录，可按审计要求一并备份。
- 恢复通过 `POST /api/backup` 完成，必须带 `x-confirm-restore: yes`。恢复前停止 Worker、将公网/反向代理流量切走，但保留受信任的维护路径到 Web；系统会保留一个仅用于数据库的 `.before-restore` 回退文件。恢复证书版本时，必须同时恢复与数据库快照配套的 `certs` 目录。完整步骤和恢复目标见 [灾备与恢复](docs/disaster-recovery.md)。
- `GET /api/metrics` 返回基础 Prometheus 文本指标；`GET /api/health` 返回 Web 与 Worker 心跳状态。请在反向代理或监控网络内访问这些接口。

## 安全边界

- 当前版本只支持**单管理员**和**中心端 SSH push**；不提供多用户、RBAC、密码 SSH 登录或 pull agent。
- ohttps 凭据、共享 SSH 私钥和 Webhook secret 按该自托管 MVP 的设计明文保存在 SQLite。数据库备份包含这些凭据；完整恢复还需要与之配套的证书目录快照。数据目录、备份和容器主机访问权限必须按最高敏感级别管理。
- 为站点配置 HTTPS 反向代理，设置正确的 `BETTER_AUTH_URL`，限制 `3000` 端口只对反向代理或可信网络开放，并设置长期随机 `AUTH_SECRET`。
- 目标服务器必须使用专用低权限用户和已验证的主机指纹。不要使用 `StrictHostKeyChecking=no`、共享 root SSH 密钥，或在 reload 命令中放入不受控制的 shell 内容。
- API、日志、前端和 Webhook 都不应暴露私钥或完整 PEM；看到此类内容时，立即轮换受影响凭据并检查日志与备份访问范围。
- 生产前至少完成一次备份恢复演练和一次 dry-run。此项目提供基础指标与恢复接口，但不替代网络隔离、备份加密、监控告警和运维响应流程。

## 本地开发与验证

开发模式仍需同时运行 Web 与 Worker：

```bash
cp .env.example .env
# 将 BETTER_AUTH_URL 改为 http://localhost:3000，并设置本地 AUTH_SECRET
pnpm install
pnpm run db:migrate
pnpm run dev
pnpm run worker
```

提交前运行：

```bash
pnpm test
pnpm typecheck
pnpm build
docker build .
```

项目使用 Next.js App Router、TypeScript、Drizzle、SQLite/libSQL、shadcn/ui、`ssh2` 和 Docker Compose。贡献约束、协议和安全不变量见 [AGENTS.md](AGENTS.md)。
