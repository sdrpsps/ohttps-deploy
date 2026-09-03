export type Deployment = {
  id: string;
  title?: string | null;
  certificateId?: string | null;
  certificateName?: string | null;
  domain?: string | null;
  certificates?: Array<{ id: string; name: string; domain: string }>;
  trigger: string;
  status: string;
  createdAt: string;
  startedAt?: string | null;
  finishedAt: string | null;
  errorSummary: string | null;
  syncJobId?: string | null;
  serverIds?: string[];
};

export type LogEntry = {
  id?: string;
  deploymentId?: string | null;
  targetId?: string | null;
  syncJobId?: string | null;
  sequence: number;
  level: string;
  message: string;
  createdAt: string;
  certificateName?: string | null;
  serverName?: string | null;
};

export type DeploymentDetail = Deployment & {
  targets: {
    id: string;
    serverName: string;
    host: string;
    status: string;
    exitCode: number | null;
    errorSummary: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  }[];
  logs: LogEntry[];
};

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  objectType: string;
  objectId: string | null;
  result: string;
  errorSummary?: string | null;
  createdAt: string;
};

export type SyncJobItem = {
  id: string;
  certificateId: string;
  certificateName: string;
  trigger: string;
  status: string;
  phase?: string;
  errorSummary: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
};

export const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "partial"]);

export function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return `${Math.floor(diff / 86400_000)} 天前`;
}

export function formatDuration(startStr?: string | null, endStr?: string | null): string | null {
  if (!startStr) return null;
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Date.now();
  const seconds = Math.max(0, (end - start) / 1000);
  if (seconds < 1) return "< 1 秒";
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${Math.floor(seconds % 60)} 秒`;
}

export const actionLabels: Record<string, string> = {
  "certificate.created": "创建证书",
  "certificate.updated": "更新证书配置",
  "certificate.deleted": "删除证书",
  "certificate.refresh_requested": "发起证书同步",
  "deployment.created": "创建部署任务",
  "deployment.retried": "重试部署任务",
  "deployment.cancelled": "取消部署任务",
  "server.created": "添加服务器",
  "server.updated": "更新服务器配置",
  "server.deleted": "删除服务器",
  "deployment_policy.saved": "配置部署策略",
  "deployment_policy.deleted": "移除部署策略",
  "settings.updated": "更新系统设置",
  "settings.shared_ssh_private_key_updated": "更新 SSH 私钥",
};

export const triggerLabels: Record<string, string> = {
  manual: "手动触发",
  scheduled: "定时自动",
  refresh: "同步更新",
  retry: "重试任务",
};

export const statusLabels: Record<string, string> = {
  queued: "排队中",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
  partial: "部分成功",
};
