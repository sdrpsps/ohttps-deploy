export const queryKeys = {
  certificates: ["certificates"] as const,
  servers: ["servers"] as const,
  settings: ["settings"] as const,
  policies: ["deployment-policies"] as const,
  health: ["health"] as const,
  deployments: ["deployments"] as const,
  deployment: (id: string) => ["deployments", id] as const,
  logs: (filters: string) => ["logs", filters] as const,
  auditEvents: ["audit-events"] as const,
  syncJobs: ["certificate-sync-jobs"] as const,
  syncJob: (id: string) => ["certificate-sync-jobs", id] as const,
  syncJobLogs: (id: string) => ["certificate-sync-jobs", id, "logs"] as const,
  notifications: ["notifications"] as const,
};

export async function getApiData<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? "请求失败");
  return body.data as T;
}
