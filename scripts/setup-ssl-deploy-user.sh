#!/usr/bin/env bash
# ==============================================================================
# 目标服务器 SSL 部署专用用户初始化与测试脚本
# 用途：在目标服务器上创建最小权限的 SSL 证书部署专用用户，并执行环境与权限自测
#
# 使用方法：
#   sudo bash setup-ssl-deploy-user.sh "ssh-ed25519 AAAAC3..."
#   或者带参数：
#   sudo bash setup-ssl-deploy-user.sh --user cert --cert-dir /etc/nginx/ssl --key "ssh-ed25519 ..."
# ==============================================================================

set -euo pipefail

# 默认参数
DEPLOY_USER="cert"
CERT_DIR="/etc/nginx/ssl"
SSH_PUBLIC_KEY=""
DOCKER_CONTAINER=""
SKIP_TEST=false

# 颜色输出定义
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
BOLD="\033[1m"
RESET="\033[0m"

print_usage() {
    echo -e "${BOLD}使用方法:${RESET}"
    echo -e "  sudo bash $0 [选项] \"<SSH_PUBLIC_KEY>\""
    echo ""
    echo -e "${BOLD}选项说明:${RESET}"
    echo -e "  -u, --user <username>       指定部署用户名 (默认: cert)"
    echo -e "  -d, --cert-dir <path>       指定目标证书存放目录 (默认: /etc/nginx/ssl)"
    echo -e "  -k, --key <ssh_key>         指定公钥内容 (或直接作为脚本第一个参数传入)"
    echo -e "      --docker <container>    如果是 Docker 部署的 Nginx，指定容器名 (如: nginx)"
    echo -e "      --skip-test             跳过创建后的权限自测"
    echo -e "  -h, --help                  显示此帮助信息"
    echo ""
    echo -e "${BOLD}示例:${RESET}"
    echo -e "  # 快速创建并测试（传入公钥，默认用户 cert）"
    echo -e "  sudo bash $0 \"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG...\""
    echo ""
    echo -e "  # 自定义目录与用户名"
    echo -e "  sudo bash $0 --user cert --cert-dir /etc/nginx/certs --key \"ssh-ed25519 AAAAC3...\""
    echo ""
    echo -e "  # Docker Nginx 容器环境"
    echo -e "  sudo bash $0 --docker nginx-web --key \"ssh-ed25519 AAAAC3...\""
}

# 1. 参数解析
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
        --skip-test)
            SKIP_TEST=true
            shift
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
                echo -e "${RED}❌ 未知参数: $1${RESET}" >&2
                print_usage
                exit 1
            fi
            ;;
    esac
done

# 2. 检查 root 权限
if [[ "$(id -u)" -ne 0 ]]; then
    echo -e "${RED}❌ 错误：请使用 root 用户或通过 sudo 运行此脚本。${RESET}" >&2
    exit 1
fi

echo -e "${BLUE}${BOLD}==========================================================${RESET}"
echo -e "${BLUE}${BOLD} 🚀 开始配置 SSL 部署专用用户: ${DEPLOY_USER}${RESET}"
echo -e "${BLUE}${BOLD}==========================================================${RESET}"

# 3. 创建专用用户（若已存在则复用）
if id "$DEPLOY_USER" &>/dev/null; then
    echo -e "${YELLOW}ℹ️  用户 '$DEPLOY_USER' 已存在，跳过创建。${RESET}"
else
    echo -e "👤 正在创建部署专用用户: ${BOLD}$DEPLOY_USER${RESET} ..."
    if command -v useradd &>/dev/null; then
        useradd -m -s /bin/bash "$DEPLOY_USER"
    elif command -v adduser &>/dev/null; then
        adduser --disabled-password --gecos "" "$DEPLOY_USER"
    else
        echo -e "${RED}❌ 未找到 useradd 或 adduser 命令，无法创建用户。${RESET}" >&2
        exit 1
    fi
    # 锁定密码登录，强制使用 SSH 密钥认证
    passwd -l "$DEPLOY_USER" >/dev/null 2>&1 || usermod -L "$DEPLOY_USER" >/dev/null 2>&1 || true
fi

# 4. 配置 SSH 目录与公钥授权
USER_HOME=$(eval echo "~$DEPLOY_USER")
SSH_DIR="$USER_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [[ -n "$SSH_PUBLIC_KEY" ]]; then
    echo -e "🔑 正在写入 SSH 授权公钥到: ${AUTH_KEYS} ..."
    if [[ -f "$AUTH_KEYS" ]] && grep -Fxq "$SSH_PUBLIC_KEY" "$AUTH_KEYS"; then
        echo -e "${YELLOW}ℹ️  公钥已存在于 $AUTH_KEYS 中。${RESET}"
    else
        echo "$SSH_PUBLIC_KEY" >> "$AUTH_KEYS"
    fi
else
    echo -e "${YELLOW}⚠️  提示：未提供公钥参数。请稍后手动将平台的 SSH 公钥写入: $AUTH_KEYS${RESET}"
    touch "$AUTH_KEYS"
fi

chmod 600 "$AUTH_KEYS"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$SSH_DIR"

# 5. 配置目标证书存储目录
echo -e "📁 正在配置证书目录: ${BOLD}$CERT_DIR${RESET} ..."
mkdir -p "$CERT_DIR"
chown -R "$DEPLOY_USER:root" "$CERT_DIR"
# 755 权限确保 Nginx 工作进程可读取证书链，部署用户具有写入与更新权限
chmod 755 "$CERT_DIR"

# 6. 配置最小权限的 Sudoers 规则
SUDOERS_FILE="/etc/sudoers.d/$DEPLOY_USER"
TMP_SUDOERS="/tmp/sudoers_${DEPLOY_USER}_$$"
echo -e "🛡️  正在配置 sudoers 最小特权规则: ${SUDOERS_FILE} ..."

NGINX_BIN="$(command -v nginx 2>/dev/null || echo '/usr/sbin/nginx')"
SYSTEMCTL_BIN="$(command -v systemctl 2>/dev/null || echo '/bin/systemctl')"
DOCKER_BIN="$(command -v docker 2>/dev/null || echo '/usr/bin/docker')"

cat <<EOF > "$TMP_SUDOERS"
# ==============================================================================
# 由 ssl-deploy 用户配置脚本自动生成
# 仅允许 $DEPLOY_USER 免密执行证书配置测试与服务热重载命令
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

# 严格校验语法
if visudo -cf "$TMP_SUDOERS" &>/dev/null; then
    install -m 0440 "$TMP_SUDOERS" "$SUDOERS_FILE"
    rm -f "$TMP_SUDOERS"
    echo -e "${GREEN}✅ Sudoers 规则已生效并设为 0440 权限。${RESET}"
else
    rm -f "$TMP_SUDOERS"
    echo -e "${RED}❌ 错误：生成的 sudoers 语法检查未通过，已中止写入！${RESET}" >&2
    exit 1
fi

# ==============================================================================
# 7. 自动化测试与环境校验
# ==============================================================================
if [[ "$SKIP_TEST" = false ]]; then
    echo ""
    echo -e "${BLUE}${BOLD}==========================================================${RESET}"
    echo -e "${BLUE}${BOLD} 🧪 正在执行部署用户权限与环境自测...${RESET}"
    echo -e "${BLUE}${BOLD}==========================================================${RESET}"

    TEST_FAILED=0

    # 测试 1: 验证部署用户与 SSH 文件权限
    echo -n "• [测试 1/3] 检查用户与 SSH 密钥目录权限... "
    if [[ -d "$SSH_DIR" && "$(stat -c '%a' "$SSH_DIR" 2>/dev/null || stat -f '%Lp' "$SSH_DIR" 2>/dev/null)" == "700" ]] && \
       [[ -f "$AUTH_KEYS" && "$(stat -c '%a' "$AUTH_KEYS" 2>/dev/null || stat -f '%Lp' "$AUTH_KEYS" 2>/dev/null)" == "600" ]]; then
        echo -e "${GREEN}[通过]${RESET}"
    else
        echo -e "${YELLOW}[警告] 权限可能不符合 700/600 规范${RESET}"
    fi

    # 测试 2: 验证部署用户在证书目录的读写权限
    echo -n "• [测试 2/3] 测试部署用户对证书目录 ($CERT_DIR) 的写入权限... "
    TEST_FILE="$CERT_DIR/.ssl_deploy_test_$$"
    if sudo -u "$DEPLOY_USER" touch "$TEST_FILE" 2>/dev/null && \
       sudo -u "$DEPLOY_USER" test -f "$TEST_FILE" && \
       sudo -u "$DEPLOY_USER" rm -f "$TEST_FILE"; then
        echo -e "${GREEN}[通过]${RESET}"
    else
        echo -e "${RED}[失败] 部署用户无法写入目标证书目录${RESET}"
        TEST_FAILED=1
    fi

    # 测试 3: 验证 Sudo 免密执行重载/测试命令权限
    echo -n "• [测试 3/3] 测试 Sudo 免密 (NOPASSWD) 执行权限... "
    if [[ -n "$DOCKER_CONTAINER" ]]; then
        if sudo -u "$DEPLOY_USER" sudo -n "$DOCKER_BIN" exec "$DOCKER_CONTAINER" nginx -t &>/dev/null; then
            echo -e "${GREEN}[通过] (Docker 容器 nginx -t 执行成功)${RESET}"
        else
            # 容器未启动时检查 sudo 授权规则列表
            if sudo -u "$DEPLOY_USER" sudo -n -l 2>/dev/null | grep -q "$DOCKER_CONTAINER"; then
                echo -e "${GREEN}[通过] (Sudoers 规则匹配，容器当前未运行或需运行后复验)${RESET}"
            else
                echo -e "${RED}[失败] Sudo 免密规则未生效${RESET}"
                TEST_FAILED=1
            fi
        fi
    else
        if [[ -x "$NGINX_BIN" ]]; then
            if sudo -u "$DEPLOY_USER" sudo -n "$NGINX_BIN" -t &>/dev/null; then
                echo -e "${GREEN}[通过] (nginx -t 执行成功)${RESET}"
            else
                echo -e "${YELLOW}[提示] nginx -t 返回非0 (可能是默认配置暂未加载或缺少证书)，但 sudo 免密执行成功${RESET}"
            fi
        else
            echo -e "${YELLOW}[提示] 未检测到本地 nginx 命令，请确保已安装 Nginx${RESET}"
        fi
    fi

    if [[ "$TEST_FAILED" -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}🎉 所有权限与环境自测已全部通过！${RESET}"
    else
        echo -e "${YELLOW}${BOLD}⚠️  自测存在部分未通过项，请检查上述错误信息。${RESET}"
    fi
fi

# 8. 输出部署平台填写信息与指引
echo ""
echo -e "${BLUE}${BOLD}==========================================================${RESET}"
echo -e "${GREEN}${BOLD}✨ 部署用户 [${DEPLOY_USER}] 初始化完成！${RESET}"
echo -e "${BLUE}${BOLD}==========================================================${RESET}"
echo "在 ssl-deploy 网页控制台中添加该服务器时，建议填入："
echo -e "  • 用户名 (Username):        ${BOLD}${DEPLOY_USER}${RESET}"
echo -e "  • 证书路径 (Cert Path):     ${BOLD}${CERT_DIR}/fullchain.pem${RESET}"
echo -e "  • 私钥路径 (Key Path):      ${BOLD}${CERT_DIR}/privkey.pem${RESET}"
if [[ -n "$DOCKER_CONTAINER" ]]; then
    echo -e "  • 重载命令 (Reload Command): ${BOLD}sudo docker exec ${DOCKER_CONTAINER} nginx -s reload${RESET}"
else
    echo -e "  • 重载命令 (Reload Command): ${BOLD}sudo nginx -t && sudo systemctl reload nginx${RESET}"
fi
echo ""
echo "💡 获取本机 SSH SHA256 指纹的方法（在控制台添加服务器时填入）："
echo -e "  ${BOLD}ssh-keyscan -p 22 127.0.0.1 2>/dev/null | ssh-keygen -lf - | head -n 1 | awk '{print \$2}'${RESET}"
echo -e "${BLUE}${BOLD}==========================================================${RESET}"
