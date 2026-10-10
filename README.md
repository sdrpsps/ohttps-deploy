# ohttps-deploy

ohttps-deploy 是一个自托管的 HTTPS 证书管理和自动部署控制台。

它从 [ohttps](https://ohttps.com) 获取证书，在本地保存可回滚的证书版本，再通过 SSH 将证书安全地推送到 Nginx 服务器。证书续期、部署、通知和日志归档由后台 Worker 自动执行，不需要一直打开浏览器。

> 这个系统会管理证书私钥和 SSH 私钥。正式使用前，请先阅读[安全与边界](#安全与边界)，并确保 data 目录、数据库备份和服务器访问权限只对可信管理员开放。

## 你可以用它做什么

- 从 ohttps 定时获取证书，并校验证书、私钥、域名和有效期。
- 保存不可变的证书版本。新版本部署失败时，旧版本仍然保留，可以继续回滚或重新部署。
- 通过已经验证过的 SSH 主机指纹连接目标服务器。
- 部署前执行 nginx -t，上传到临时文件，再原子替换证书并 reload Nginx。
- 为每张证书选择要部署的服务器，并查看每台服务器的成功、失败和实时日志。
- 在证书进入续期窗口后自动同步，并限制调用间隔和每日调用次数，避免重复消耗 ohttps 配额。
- 通过 Bark 接收证书同步、部署失败、即将过期等通知。
- 查看活动审计、Prometheus 基础指标、Worker 健康状态，并进行数据库备份和恢复。

## 它是怎样工作的

项目由两个容器组成：

| 组件 | 作用 |
| --- | --- |
| Web | 登录、保存配置、创建任务、查看证书和日志。它不等待耗时任务完成。 |
| Worker | 运行数据库迁移、定时扫描、ohttps 同步、SSH 部署、通知、重试和日志归档。 |
| data 目录 | Web 和 Worker 共享的持久目录，包含数据库、证书版本、敏感配置和日志归档。 |
| 目标服务器 | 接收证书并验证、reload Nginx。所有目标服务器共用控制台里配置的那把 SSH 私钥。 |

Worker 停止时，Web 仍可能可以打开，但任务不会继续执行。Worker 恢复后会接着处理未完成的任务。

## 开始前准备

你需要准备：

1. 一台可以运行 Docker Compose 的中心机。
2. 中心机能够访问 ohttps.com 和目标服务器的 SSH 端口。
3. ohttps 的 API ID、API Key，以及要管理的 certificateId。
4. 一把专门给本项目使用的 SSH 私钥。对应的公钥要放到每台目标服务器上。
5. 目标服务器上的 Nginx、证书目录，以及允许执行 nginx -t 和 reload 的部署用户。
6. 生产环境使用 HTTPS 反向代理，并限制 3000 端口只能被反向代理或可信网络访问。

可以在中心机生成专用的 Ed25519 密钥：

```bash
ssh-keygen -t ed25519 -f ./ohttps-deploy -C ohttps-deploy
```

私钥 ./ohttps-deploy 只放在受信任的地方，稍后粘贴到控制台。只把公钥 ./ohttps-deploy.pub 配置到目标服务器。

## 第一步：用 Docker Compose 启动

### 1. 准备目录和环境变量

在项目目录中执行：

```bash
cp .env.example .env
mkdir -p data
chmod 700 data
```

编辑 .env。最少需要检查下面几个值：

```dotenv
# 生产环境必须换成随机长字符串，至少 32 个字符
AUTH_SECRET=请替换成随机字符串

# 本地试用
BETTER_AUTH_URL=http://localhost:3000

# 生产环境示例：浏览器实际访问的地址，不要加路径或末尾斜杠
# BETTER_AUTH_URL=https://certs.example.com
```

可以使用下面的命令生成 AUTH_SECRET：

```bash
openssl rand -base64 48
```

默认情况下，以下内容都保存在 ./data：

| 内容 | 默认位置 |
| --- | --- |
| SQLite 数据库 | ./data/ohttps-deploy.db |
| 证书版本 | ./data/certs |
| 历史日志归档 | ./data/logs |

如果要把数据放到其他位置，设置一个绝对路径：

```dotenv
OHTTPS_DATA_DIR=/srv/ohttps-deploy/data
```

这个目录包含数据库、ohttps 凭据、SSH 私钥、证书和日志，请按照最高敏感级别保护。不要把真实 .env、证书、私钥、Cookie 或 API Key 提交到 Git、截图或普通日志中。

### 环境变量速查

大多数用户只需要修改 `AUTH_SECRET`、`BETTER_AUTH_URL`，以及可选的 `OHTTPS_DATA_DIR` 和 Pocket ID 三项。完整配置如下：

| 变量 | 是否必须 | 作用 |
| --- | --- | --- |
| `AUTH_SECRET` | 生产环境必须 | 签名登录会话，至少 32 个字符。 |
| `BETTER_AUTH_URL` | 建议设置 | 浏览器实际访问的完整 Origin，例如 `https://certs.example.com`。 |
| `OHTTPS_DATA_DIR` | 可选 | Docker 主机上的数据目录，默认 `./data`。 |
| `DATABASE_URL` | 可选 | 数据库地址，默认 `./data/ohttps-deploy.db`。默认路径适合 SQLite；也支持配置 libSQL/Turso。 |
| `CERTIFICATE_STORAGE_DIR` | 可选 | 证书版本目录，默认 `./data/certs`。 |
| `LOG_ARCHIVE_DIR` | 可选 | 日志归档目录，默认 `./data/logs`。 |
| `TURSO_AUTH_TOKEN` | 使用 Turso 时需要 | 连接远程 libSQL 数据库的令牌。 |
| `POCKET_ID_ISSUER` | 使用 Pocket ID 时需要 | Pocket ID 的 HTTPS issuer。 |
| `POCKET_ID_CLIENT_ID` | 使用 Pocket ID 时需要 | OIDC 客户端 ID。 |
| `POCKET_ID_CLIENT_SECRET` | 使用 Pocket ID 时需要 | OIDC 客户端密钥。 |

Pocket ID 的三项要么全部配置，要么全部留空。`POCKET_ID_ADMIN_SUB` 已经移除，不需要查找或填写 Pocket ID 用户 ID。

### 2. 启动两个服务

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f worker
```

第一次使用空数据库时，Worker 会创建本地账号 admin，并且只在 Worker 启动日志中打印一次初始密码。看到密码后立即保存，然后打开 http://localhost:3000 登录并在设置中修改密码。

初始密码不会通过 API 返回；复用已有 data 目录或恢复数据库时也不会重新生成。

检查 Web 和 Worker：

```bash
curl -fsS http://localhost:3000/api/health
```

返回内容中的 status 应为 ok，worker 应为 true。如果 worker 为 false，通常是 Worker 尚未启动、无法连接共享数据库，或超过两分钟没有更新心跳。

常用命令：

```bash
docker compose logs -f web
docker compose logs -f worker
docker compose restart web worker
docker compose down
```

docker compose down 不会删除 data。除非已有可用备份，否则不要使用会删除数据卷或主机目录的清理命令。

## 登录方式

### 本地管理员

本地账号固定为 admin，密码只用于本地恢复和没有配置 Pocket ID 的环境。登录后可以在设置中修改密码。

### Pocket ID（推荐）

Pocket ID 登录按钮在页面上显示为“使用通行密钥登录”。它使用 Pocket ID 的 OIDC 授权流程；每位通过该客户端验证的用户都会拥有独立的本地账号、会话和审计身份，但所有获准用户都拥有本项目的完整管理权限。

访问资格由 Pocket ID 的 OIDC 客户端允许用户组决定：

1. 在 Pocket ID 的 OIDC Clients 中创建机密客户端。
2. 回调地址填写：

   ```text
   https://你的域名/api/auth/callback/pocket-id
   ```

   这里的域名必须和 BETTER_AUTH_URL 完全对应。
3. 启用授权码流程和 PKCE，允许 openid profile email scopes。
4. 在这个 OIDC 客户端本身限制允许的用户组。只创建用户组、但没有把组绑定到客户端，并不能限制访问。
5. 在 .env 中配置三项，并让 Web 和 Worker 使用相同值：

   ```dotenv
   POCKET_ID_ISSUER=https://id.example.com
   POCKET_ID_CLIENT_ID=你的客户端 ID
   POCKET_ID_CLIENT_SECRET=你的客户端密钥
   ```

从 Pocket ID 允许组移除用户会阻止这个用户再次登录，但已经签发的本地会话会继续有效，直到用户退出、会话到期或管理员撤销该会话。更换 issuer 或 Client ID 后，旧身份会失去访问资格，Worker 会在启动时清理旧绑定和旧会话。本地 admin 仍然可以作为恢复入口。

## 第二步：完成首次配置

登录后，按首页的初始化向导操作。推荐顺序如下：

1. 在系统设置中保存 ohttps 凭据。
2. 配置共享 SSH 私钥。
3. 在每台目标服务器上创建部署用户并校验 SSH 连接。
4. 添加证书。
5. 添加服务器。
6. 在部署策略中把证书绑定到服务器。
7. 手动同步一张低风险证书，确认部署链路正常后，再接入生产证书。

### 配置 ohttps 凭据和调度

打开侧边栏的系统设置，填写：

- API ID：ohttps 提供的 API ID。
- API Key：ohttps 提供的 API Key。已经保存的 Key 只会掩码显示，留空保存不会覆盖它。
- Bark 推送 URL：可选，例如 https://api.day.app/你的设备 Key。可以先发送测试消息，再保存。
- 默认提前续期天数：证书距离到期还有多少天时进入续期窗口，默认 20 天。
- API 最小调用间隔：同一张证书两次向 ohttps 请求之间的最短时间，默认 86,400 秒（24 小时）。
- 每日 API 调用限额：默认 100 次。
- 后台扫描轮询周期：默认 60 分钟。
- 日志保留天数：默认 90 天。

### 配置共享 SSH 私钥

在系统设置 → 共享 SSH 私钥中粘贴私钥全文。保存后，控制台会显示配套公钥，可以复制到目标服务器。

私钥只提交给服务端并保存在 SQLite 中，不会在界面或 API 中再次显示。后台自动部署需要不带密码短语的私钥。如果界面提示私钥带有 Passphrase，可以在安全的管理机上处理后再导入：

```bash
ssh-keygen -p -f ./ohttps-deploy
```

## 第三步：准备目标服务器

项目提供 scripts/setup-ohttps-deploy-user.sh，可以在目标服务器上创建权限受限的部署用户、写入公钥、创建证书目录和最小化的 sudo 规则。

### 使用初始化脚本（推荐）

先把仓库或脚本放到目标服务器，再以 root 或 sudo 执行。下面的命令使用默认用户 cert 和默认目录 /etc/nginx/ssl：

```bash
sudo bash scripts/setup-ohttps-deploy-user.sh \
  --key "ssh-ed25519 AAAA..."
```

如果需要自定义用户或证书目录：

```bash
sudo bash scripts/setup-ohttps-deploy-user.sh \
  --user cert \
  --cert-dir /etc/nginx/certs \
  --key "ssh-ed25519 AAAA..."
```

如果 Nginx 在 Docker 容器中：

```bash
sudo bash scripts/setup-ohttps-deploy-user.sh \
  --docker nginx \
  --key "ssh-ed25519 AAAA..."
```

脚本会执行权限和 Nginx 自测，最后输出控制台需要填写的信息。默认情况下，证书会写到：

```text
/etc/nginx/ssl/<域名>/fullchain.pem
/etc/nginx/ssl/<域名>/privkey.pem
```

目标服务器上的 Nginx 配置必须引用这两个路径。Docker 场景下，证书目录要以相同路径挂载到 Nginx 容器中。

脚本授予部署用户的权限只有：

- 使用 SSH 公钥登录；
- 写入证书目录；
- 免密执行指定的 nginx -t 和 reload 命令。

不要让部署用户使用 root SSH 登录，也不要给它配置需要交互输入密码的命令。

### 在控制台添加服务器

打开服务器，填写：

- 名称：例如 生产 Nginx - Tokyo。
- 主机和 SSH 端口，默认端口为 22。
- 用户名，默认是脚本创建的 cert。
- 主机指纹：点击“获取指纹”，或者在可信终端执行控制台给出的 ssh-keyscan 命令后粘贴 SHA256:...。
- 是否启用：停用后不会接收后续自动或手动部署。

高级配置通常保持默认：

| 项目 | 默认值 |
| --- | --- |
| 部署前检查 | sudo -n nginx -t |
| reload 命令 | sudo -n nginx -s reload |
| 健康检查 | 可选，例如 curl -fsS http://127.0.0.1/health |
| 单台服务器超时 | 30 秒 |

保存后先执行“连接测试”。如果主机更换了 SSH 密钥，先确认确实是预期变更，再重新获取并保存指纹。不要使用 StrictHostKeyChecking=no 或其他跳过主机校验的配置。

## 第四步：添加证书和部署策略

### 添加证书

打开证书 → 添加证书，填写：

- 名称：控制台里的易读名称，例如“生产主站”。
- 域名：必须包含在证书 SAN 中，例如 example.com。
- ohttps 证书 ID：来自 ohttps 的 certificateId。
- 提前续期天数：可覆盖全局默认值，通常保持 20 天。

没有本地缓存时，Worker 会在下一次扫描中自动获取证书。也可以点击“立即同步”马上创建同步任务。手动同步会消耗 ohttps 调用额度，请只在需要时使用。

### 建立部署策略

打开部署策略，为每张证书勾选允许自动部署的已启用服务器。首次配置时，界面可能默认选中所有已启用服务器，请根据实际范围检查后保存。

证书没有绑定服务器时，仍会安全地保存在本地，但不会推送到远程主机。

### 做第一次部署

建议先用一张低风险证书验证完整流程：

1. 点击“立即同步”。
2. 在同步任务中确认 Worker 正在执行。
3. 查看证书是否通过 PEM、私钥匹配、域名和有效期校验。
4. 查看部署任务中的每台服务器状态。
5. 到目标服务器检查 Nginx 配置和 HTTPS 访问。

部署流程是：检查 Nginx 配置 → 上传临时文件 → 原子替换 → 再次验证 → reload → 可选健康检查。中间步骤失败时会尽量回滚远端文件，不会主动删除上一份可用证书。

## 日常使用

### 自动续期

Worker 会按照扫描周期读取本地证书。扫描本身不会每次都调用 ohttps：

- 没有本地版本时，会自动获取。
- 已有版本时，只有进入提前续期窗口才会检查上游。
- 受到每证书最小调用间隔和每日调用上限保护。
- 上游返回旧版本或暂时失败时，Worker 会在后续时间继续检查，不会永久停止。
- 新证书同步成功后，会按部署策略自动创建部署任务。
- 失败的服务器大约每小时重试；已经成功的服务器不会重复部署。
- Worker 重启或租约切换后，会恢复未完成的同步和部署任务。

完成配置后不需要一直保持登录，Worker 会在后台继续工作。

### 手动同步和部署

“立即同步”会强制向 ohttps 发起请求，仍然受到额度保护并可能产生费用。

“部署证书”会使用本地已经验证过的证书版本推送到选定服务器，不会自动从 ohttps 获取新证书。

### 查看任务、日志和活动

打开活动与日志可以查看：

- 证书同步阶段和错误摘要；
- 每个部署任务和每台服务器的结果；
- 实时 SSH 部署日志；
- 审计记录，包括证书、服务器、部署策略和系统设置的变更；
- 失败任务的重试和取消操作。

同步成功但某一台服务器失败时，其他已经成功的服务器不会被重复部署；失败目标会保留并可以手动重试。

### Bark 通知

配置 Bark URL 后，系统会发送证书同步、部署成功或失败、证书即将过期等通知。通知不包含私钥、完整证书或原始 API Key。

通知使用 JSON POST，大致形状如下：

```json
{
  "title": "ohttps-deploy · 证书部署成功",
  "body": "事件：deployment.succeeded\\n对象：deployment/…",
  "group": "ohttps-deploy"
}
```

投递失败会自动重试。可以在系统通知中查看投递历史和失败原因摘要。

## 备份与恢复

数据库里包含 ohttps 凭据、SSH 私钥、Bark URL、服务器配置和认证数据；certs 目录包含数据库所引用的证书版本。备份时必须把它们当作一组数据处理。

### 备份

1. 选择没有同步、部署或恢复任务写入的时间窗口。必要时先停止 Worker。
2. 使用已经登录的管理员会话下载数据库：

   ```bash
   curl -fL \
     -H 'Cookie: 你的会话 Cookie' \
     http://localhost:3000/api/backup \
     -o ohttps-deploy-$(date +%F).db
   ```

   不要把真实 Cookie 写入脚本、Shell 历史或日志。也可以通过浏览器开发者工具或受信任的备份程序调用该接口。
3. 在同一时间点备份数据目录中的 certs：

   ```bash
   tar -C data -czf certs-$(date +%F).tar.gz certs
   ```

4. 按最高敏感级别加密并异地保存数据库、证书目录和需要保留的 logs 归档。

建议每天备份一次，至少保留 30 个版本，并每季度完成一次完整恢复演练。

### 恢复

恢复会覆盖当前数据库，操作前先确认备份文件和证书目录来自同一时间点：

1. 停止 Worker，暂停公网或反向代理流量，并确认没有正在运行的部署。保留一条受信任的维护路径访问 Web。
2. 登录控制台后，把 SQLite 文件以原始二进制内容提交到 POST /api/backup，并带上请求头：

   ```text
   x-confirm-restore: yes
   ```

3. 同时把配套的 certs 快照恢复到数据目录。
4. 保留接口生成的 <数据库路径>.before-restore 文件。它是恢复前数据库的回退副本。
5. Docker Compose 会在 Worker 启动时运行迁移；本地开发环境先执行：

   ```bash
   pnpm run db:migrate
   ```

6. 启动服务后检查 /api/health、当前证书版本、服务器配置和最近任务。必要时先做 dry-run，再恢复自动调度和公网流量。

如果恢复后的数据库有问题，可以把 .before-restore 文件移回数据库路径，但它只回退数据库，不会回退 certs 目录，所以必须同时使用匹配的证书快照。

灾备目标建议：RPO 24 小时（每天备份），RTO 30 分钟内恢复 Web、Worker 和最近的可用证书版本。

## 健康检查和常见问题

### Worker 显示离线

先查看：

```bash
docker compose ps
docker compose logs --tail=200 worker
curl -fsS http://localhost:3000/api/health
```

检查 Web 和 Worker 是否使用同一个 data 目录、同一个 DATABASE_URL，以及容器是否有权限读写 /app/data。

### 登录后页面无法打开

- 检查 BETTER_AUTH_URL 是否是浏览器实际访问的 Origin。
- 反向代理使用 HTTPS 时，不要把内部的 http://web:3000 写入 BETTER_AUTH_URL。
- 检查浏览器时间和服务器时间是否大幅偏差。
- Pocket ID 用户要确认自己仍在该 OIDC 客户端允许的用户组中。
- 本地管理员可以使用密码入口恢复访问。

### Pocket ID 按钮报错

确认 issuer、Client ID、Client Secret 三项同时存在，回调地址完全匹配，OIDC 客户端允许 openid profile email，并且 Pocket ID 可以从 Web 容器访问。查看 docker compose logs web 时只会看到脱敏后的通用错误，不会显示 Client Secret 或令牌。

### SSH 连接失败

1. 从 Web 容器所在网络检查目标主机和端口是否可达。
2. 在控制台重新获取并核对 SHA-256 主机指纹。
3. 确认目标服务器已经放入配套公钥，用户名称和端口正确。
4. 确认私钥没有 Passphrase，且目标用户可以写入证书目录。
5. 确认 sudo -n nginx -t 和 reload 命令不需要交互输入。
6. 目标主机上的 Nginx 配置必须引用控制台显示的证书路径。

### 证书同步失败

检查 ohttps API ID、API Key、certificateId、中心机外网连接、证书是否已经进入续期窗口，以及每日调用限额。手动同步会绕过续期窗口，但不会绕过调用限额。

## API 和监控入口

这些接口需要登录，除健康检查和认证接口外都受到会话与同源 CSRF 保护：

| 接口 | 用途 |
| --- | --- |
| GET /api/health | 查看 Web 和 Worker 状态 |
| GET /api/metrics | Prometheus 文本指标 |
| GET /api/backup | 下载 SQLite 数据库备份 |
| POST /api/backup | 在明确确认后恢复 SQLite 数据库 |
| /api/certificates | 证书资产和同步任务 |
| /api/servers | 目标服务器和连接测试 |
| /api/deployment-policies | 证书到服务器的自动部署策略 |
| /api/deployments | 创建、查询、取消和重试部署 |
| /api/logs、/api/audit-events | 执行日志和审计活动 |
| /api/notifications | Bark 通知历史 |

HTTP 请求只负责创建、查询、取消或重试任务；同步和 SSH 部署由 Worker 执行，不会让浏览器请求长时间等待。

## 安全与边界

- 本地恢复账号是固定的 admin；Pocket ID 用户以个人身份登录，但获准用户权限相同。
- 项目不提供用户管理页、RBAC、多级权限、密码 SSH 登录或 pull agent。
- ohttps 凭据、SSH 私钥、Bark 设备 Key 和认证数据会保存在本地 SQLite。数据库备份因此也是敏感备份。
- Web 和 Worker 必须使用 HTTPS 反向代理、长期随机的 AUTH_SECRET 和受限网络边界。
- SSH 连接必须校验主机指纹。不要使用 StrictHostKeyChecking=no，不要共享 root SSH 私钥。
- API、日志、前端和通知都不应输出私钥、完整 PEM、访问令牌或 Client Secret。
- 生产上线前至少完成一次备份恢复演练和一次低风险 dry-run。
- data 目录的备份、恢复和删除都可能影响线上证书部署，请先停止 Worker 并确认外部流量状态。

项目的部署模式是“中心端 SSH push”：中心机主动把证书推送到目标服务器。它不支持让目标服务器反向拉取证书，也不支持每台服务器单独配置不同的 SSH 私钥。

## 本地开发

本地开发需要同时运行 Web 和 Worker：

```bash
cp .env.example .env
# 将 BETTER_AUTH_URL 设置为 http://localhost:3000
# AUTH_SECRET 设置为至少 32 个字符的本地随机值
pnpm install
pnpm run db:migrate
pnpm run dev:all
```

也可以分开运行：

```bash
pnpm run dev
pnpm run worker
```

提交代码前运行：

```bash
pnpm test
pnpm typecheck
pnpm build
docker build .
```

单独运行一个测试文件：

```bash
pnpm exec tsx --test tests/automation.test.ts
```

## 项目边界和贡献提示

项目使用 Next.js App Router、TypeScript、Drizzle、SQLite/libSQL、Better Auth、shadcn/ui、ssh2 和 Docker Compose。所有耗时任务位于 Worker；ohttps 协议、证书校验、部署和通知都有可替换的测试适配器。

改动数据模型时，先添加可重复执行的 Drizzle migration，再更新 schema、领域逻辑、Route Handler 和界面。外部系统测试不能访问真实 ohttps 凭据、生产主机或真实 Webhook。提交信息使用 Conventional Commits，例如：

```text
feat(auth): add Pocket ID user sessions
fix(worker): retry failed certificate deployment
docs: rewrite user guide
```
