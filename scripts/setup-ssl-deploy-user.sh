#!/usr/bin/env bash
# ==============================================================================
# 目标服务器 SSL 部署专用用户初始化脚本
# 用途：为 ssl-deploy 平台配置具有最小特权的 SSH 证书部署专用账户
#
# 使用方法：
#   sudo bash setup-ssl-deploy-user.sh "ssh-ed25519 AAAAC3..."
#   或者带参数：
#   sudo bash setup-ssl-deploy-user.sh --user ssl-deploy --cert-dir /etc/nginx/ssl --key "ssh-ed25519 ..."
# ==============================================================================

set -euo pipefail

# 默认配置
DEPLOY_USER="ssl-deploy"
CERT_DIR="/etc/nginx/ssl"
SSH_PUBLIC_KEY=""
DOCKER_CONTAINER=""

print_usage() {
    cat <<EOF
使用帮助:
  sudo bash $0 [选项] "<SSH_PUBLIC_KEY>"

选项:
  -u, --user <username>       指定部署用户名 (默认: ssl-deploy)
  -d, --cert-dir <path>       指定目标证书存放目录 (默认: /etc/nginx/ssl)
  -k, --key <ssh_key>         指定公钥内容
      --docker <container>    如果使用 Docker Nginx，指定容器名 (如: nginx)
  -h, --help                  显示本帮助信息

示例:
  sudo bash $0 "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI..."
  sudo bash $0 --cert-dir /etc/ssl/local --key "ssh-ed25519 AAAAC3NzaC1..."
EOF
}

# 必须以 root 运行
if [[ "$(id -u)" -ne 0 ]]; then
    echo "❌ 错误：请使用 root 或通过 sudo 运行此脚本。" >&2
    exit 1
fi

# 参数解析
while [[ $# -gt 0 ]]; do
    case "$1" in
        -u|--user)
            DEPLOY_USER="$2"
            shift 2
            ;;
        -d|--cert-dir)
            CERT_DIR="$2"
            shift 2
            ;;
        -k|--key)
            SSH_PUBLIC_KEY="$2"
            shift 2
            ;;
        --docker)
            DOCKER_CONTAINER="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            if [[ -z "$SSH_PUBLIC_KEY" ]]; then
                SSH_PUBLIC_KEY="$1"
                shift
            else
                echo "❌ 未知参数: $1" >&2
                print_usage
                exit 1
            fi
            ;;
    esac
done

echo "=========================================================="
echo " 开始配置 SSL 部署专用用户: $DEPLOY_USER"
echo "=========================================================="

# 1. 创建专用用户（如果不存在）
if id "$DEPLOY_USER" &>/dev/null; then
    echo "ℹ️  用户 '$DEPLOY_USER' 已存在，跳过用户创建。"
else
    echo "👤 正在创建用户: $DEPLOY_USER ..."
    useradd -m -s /bin/bash "$DEPLOY_USER"
    # 锁定密码（禁止通过密码方式登录）
    passwd -l "$DEPLOY_USER" >/dev/null 2>&1 || true
fi

# 2. 配置 SSH 目录及授权密钥
USER_HOME=$(eval echo "~$DEPLOY_USER")
SSH_DIR="$USER_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [[ -n "$SSH_PUBLIC_KEY" ]]; then
    echo "🔑 正在配置 SSH 公钥到 $AUTH_KEYS ..."
    # 如果 authorized_keys 中尚未包含该公钥，则追加写入
    if [[ -f "$AUTH_KEYS" ]] && grep -Fxq "$SSH_PUBLIC_KEY" "$AUTH_KEYS"; then
        echo "ℹ️  公钥已存在于 $AUTH_KEYS 中。"
    else
        echo "$SSH_PUBLIC_KEY" >> "$AUTH_KEYS"
    fi
else
    echo "⚠️  未传入公钥参数，请稍后手动将平台公钥写入: $AUTH_KEYS"
    touch "$AUTH_KEYS"
fi

chmod 600 "$AUTH_KEYS"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$SSH_DIR"

# 3. 准备证书目标目录并设置安全权限
echo "📁 正在配置证书目录: $CERT_DIR ..."
mkdir -p "$CERT_DIR"
chown -R "$DEPLOY_USER:root" "$CERT_DIR"
chmod 750 "$CERT_DIR"

# 4. 配置最小权限的 sudoers 规则
SUDOERS_FILE="/etc/sudoers.d/$DEPLOY_USER"
TMP_SUDOERS="/tmp/sudoers_${DEPLOY_USER}_$$"
echo "🛡️  正在配置 sudo 权限: $SUDOERS_FILE ..."

NGINX_BIN="$(which nginx 2>/dev/null || echo '/usr/sbin/nginx')"
SYSTEMCTL_BIN="$(which systemctl 2>/dev/null || echo '/bin/systemctl')"
DOCKER_BIN="$(which docker 2>/dev/null || echo '/usr/bin/docker')"

cat <<EOF > "$TMP_SUDOERS"
# ==============================================================================
# 由 ssl-deploy 用户配置脚本自动生成
# 仅允许 $DEPLOY_USER 执行证书检测与热重载相关命令
# ==============================================================================
EOF

if [[ -n "$DOCKER_CONTAINER" ]]; then
    cat <<EOF >> "$TMP_SUDOERS"
$DEPLOY_USER ALL=(ALL) NOPASSWD: $DOCKER_BIN exec $DOCKER_CONTAINER nginx -t
$DEPLOY_USER ALL=(ALL) NOPASSWD: $DOCKER_BIN exec $DOCKER_CONTAINER nginx -s reload
EOF
else
    cat <<EOF >> "$TMP_SUDOERS"
$DEPLOY_USER ALL=(ALL) NOPASSWD: $NGINX_BIN -t
$DEPLOY_USER ALL=(ALL) NOPASSWD: $NGINX_BIN -s reload
$DEPLOY_USER ALL=(ALL) NOPASSWD: $SYSTEMCTL_BIN reload nginx
$DEPLOY_USER ALL=(ALL) NOPASSWD: $SYSTEMCTL_BIN status nginx
$DEPLOY_USER ALL=(ALL) NOPASSWD: $SYSTEMCTL_BIN is-active nginx
EOF
fi

# 语法验证
if visudo -cf "$TMP_SUDOERS" &>/dev/null; then
    install -m 0440 "$TMP_SUDOERS" "$SUDOERS_FILE"
    rm -f "$TMP_SUDOERS"
    echo "✅ Sudoers 配置已生效: $SUDOERS_FILE"
else
    rm -f "$TMP_SUDOERS"
    echo "❌ 错误：生成的 sudoers 语法检查未通过，已中止写入！" >&2
    exit 1
fi

echo "=========================================================="
echo "🎉 部署用户 [$DEPLOY_USER] 配置成功！"
echo ""
echo "在 ssl-deploy 平台中添加该服务器时可填入："
echo "  - 用户名 (Username): $DEPLOY_USER"
echo "  - 证书路径 (Cert Path): $CERT_DIR/fullchain.pem"
echo "  - 私钥路径 (Key Path): $CERT_DIR/privkey.pem"
if [[ -n "$DOCKER_CONTAINER" ]]; then
    echo "  - 重载命令 (Reload Command): sudo docker exec $DOCKER_CONTAINER nginx -s reload"
else
    echo "  - 重载命令 (Reload Command): sudo nginx -t && sudo systemctl reload nginx"
fi
echo "=========================================================="
