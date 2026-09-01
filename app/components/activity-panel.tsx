"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ActivityTables } from "@/components/activity/activity-tables";
import { DeploymentDetailPanel } from "@/components/activity/deployment-detail";
import { DeploymentHistory } from "@/components/activity/deployment-history";
import type { AuditEntry, Deployment, DeploymentDetail, LogEntry } from "@/components/activity/types";
import { terminalStatuses } from "@/components/activity/types";
import type { Certificate, ManagedServer } from "@/components/console/types";
import { getApiData, queryKeys } from "@/lib/api";

type ActivityPanelProps = {
  certificates: Certificate[];
  servers: ManagedServer[];
};

export function ActivityPanel({ certificates, servers }: ActivityPanelProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [certificateId, setCertificateId] = useState("");
  const [serverId, setServerId] = useState("");
  const [from, setFrom] = useState("");
  const query = useMemo(() => new URLSearchParams(Object.entries({
    certificateId,
    serverId,
    from: from && new Date(`${from}T00:00:00+08:00`).toISOString(),
  }).filter(([, value]) => value)).toString(), [certificateId, serverId, from]);

  const deploymentsQuery = useQuery({ queryKey: queryKeys.deployments, queryFn: () => getApiData<Deployment[]>("/api/deployments") });
  const logsQuery = useQuery({ queryKey: queryKeys.logs(query), queryFn: () => getApiData<LogEntry[]>(`/api/logs?${query}`) });
  const auditEventsQuery = useQuery({ queryKey: queryKeys.auditEvents, queryFn: () => getApiData<AuditEntry[]>("/api/audit-events") });
  const selectedQuery = useQuery({
    queryKey: queryKeys.deployment(selectedId ?? ""),
    queryFn: () => getApiData<DeploymentDetail>(`/api/deployments/${selectedId}`),
    enabled: Boolean(selectedId),
  });
  const deployments = deploymentsQuery.data ?? [];
  const logs = logsQuery.data ?? [];
  const auditEvents = auditEventsQuery.data ?? [];
  const selected = selectedQuery.data ?? null;
  const historyError = [deploymentsQuery, logsQuery, auditEventsQuery].find((result) => result.error)?.error;

  useEffect(() => {
    if (historyError instanceof Error) toast.error(historyError.message);
  }, [historyError]);

  async function action(id: string, name: "retry" | "cancel") {
    const response = await fetch(`/api/deployments/${id}/${name}`, { method: "POST" });
    if (!response.ok) {
      toast.error("操作未完成");
      return;
    }
    toast.success(name === "retry" ? "重试任务已创建" : "任务已取消");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
      queryClient.invalidateQueries({ queryKey: queryKeys.logs(query) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.auditEvents }),
    ]);
    if (name === "cancel") await queryClient.invalidateQueries({ queryKey: queryKeys.deployment(id) });
  }

  useEffect(() => {
    if (!selected || terminalStatuses.has(selected.status)) return;
    const source = new EventSource(`/api/deployments/${selected.id}/events`);
    source.onmessage = (event) => {
      const entry = JSON.parse(event.data) as LogEntry;
      queryClient.setQueryData<DeploymentDetail>(queryKeys.deployment(selected.id), (current) => current?.id === selected.id
        ? { ...current, logs: [...current.logs, entry] }
        : current);
    };
    source.addEventListener("end", () => {
      source.close();
      void queryClient.invalidateQueries({ queryKey: queryKeys.deployment(selected.id) });
    });
    return () => source.close();
  }, [selected?.id, selected?.status]);

  return (
    <div className="space-y-6">
      <DeploymentHistory
        certificates={certificates}
        servers={servers}
        deployments={deployments}
        certificateId={certificateId}
        serverId={serverId}
        from={from}
        onCertificateChange={setCertificateId}
        onServerChange={setServerId}
        onFromChange={setFrom}
        onOpen={setSelectedId}
        onAction={(id, name) => void action(id, name)}
      />
      {selected && <DeploymentDetailPanel deployment={selected} onClose={() => setSelectedId(null)} />}
      <ActivityTables logs={logs} auditEvents={auditEvents} />
    </div>
  );
}
