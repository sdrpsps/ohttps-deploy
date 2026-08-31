# 灾备与恢复

## 备份

1. 使用已认证的管理员会话请求 `GET /api/backup`，将返回的 SQLite 文件保存到加密、异地的备份存储。
2. 同时备份 Docker volume 中的 `certs` 目录；数据库备份本身包含 ohttps、SSH 和 Webhook 凭据，按最高敏感级别保管。
3. 每日执行一次，保留至少 30 个版本，并定期做恢复演练。

## 恢复

1. 停止 Worker，暂停 Web 流量并确认没有正在运行的部署。
2. 登录控制台后，向 `POST /api/backup` 上传备份文件，并设置请求头 `x-confirm-restore: yes`。
3. 保留接口生成的 `.before-restore` 文件，运行 `pnpm run db:migrate`，启动 Worker。
4. 检查 `/api/health`、证书当前版本、服务器配置和最近任务；必要时执行 dry-run，再恢复自动调度。

恢复失败时，将 `.before-restore` 文件移回数据库路径并重新启动服务。恢复后的数据库和证书目录必须由应用用户拥有且不可被其他容器读取。

## 目标

- RPO：24 小时（每日备份）。
- RTO：30 分钟内恢复 Web、Worker 和最近一次可用证书版本。
- 每季度至少进行一次完整恢复演练并记录结果。
