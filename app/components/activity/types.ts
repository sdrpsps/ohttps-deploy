export type Deployment = {
  id: string;
  certificateId: string;
  certificateName: string;
  domain: string;
  trigger: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  errorSummary: string | null;
};

export type LogEntry = {
  id?: string;
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
  }[];
  logs: LogEntry[];
};

export type AuditEntry = {
  id: string;
  action: string;
  objectType: string;
  objectId: string | null;
  result: string;
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
