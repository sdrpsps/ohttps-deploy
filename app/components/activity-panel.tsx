"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ActivityTables } from "@/components/activity/activity-tables";
import { DeploymentDetailPanel } from "@/components/activity/deployment-detail";
import { DeploymentHistory } from "@/components/activity/deployment-history";
import type { AuditEntry, Deployment, DeploymentDetail, LogEntry } from "@/components/activity/types";
import { terminalStatuses } from "@/components/activity/types";
import type { Certificate, ManagedServer } from "@/components/console/types";

type ActivityPanelProps = {
  certificates: Certificate[];
  servers: ManagedServer[];
};

export function ActivityPanel({ certificates, servers }: ActivityPanelProps) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEntry[]>([]);
  const [selected, setSelected] = useState<DeploymentDetail | null>(null);
  const [certificateId, setCertificateId] = useState("");
  const [serverId, setServerId] = useState("");
  const [from, setFrom] = useState("");
  const query = useMemo(() => new URLSearchParams(Object.entries({
    certificateId,
    serverId,
    from: from && new Date(`${from}T00:00:00+08:00`).toISOString(),
  }).filter(([, value]) => value)).toString(), [certificateId, serverId, from]);

  async function load() {
    const [deploymentResponse, logResponse, auditResponse] = await Promise.all([
      fetch("/api/deployments", { cache: "no-store" }),
      fetch(`/api/logs?${query}`, { cache: "no-store" }),
      fetch("/api/audit-events", { cache: "no-store" }),
    ]);
    if (!deploymentResponse.ok || !logResponse.ok || !auditResponse.ok) {
      throw new Error("无法加载任务历史");
    }
    setDeployments((await deploymentResponse.json()).data);
    setLogs((await logResponse.json()).data);
    setAuditEvents((await auditResponse.json()).data);
  }

  async function open(id: string) {
    const response = await fetch(`/api/deployments/${id}`, { cache: "no-store" });
    if (!response.ok) {
      toast.error("无法加载任务详情");
      return;
    }
    setSelected((await response.json()).data);
  }

  async function action(id: string, name: "retry" | "cancel") {
    const response = await fetch(`/api/deployments/${id}/${name}`, { method: "POST" });
    if (!response.ok) {
      toast.error("操作未完成");
      return;
    }
    toast.success(name === "retry" ? "重试任务已创建" : "任务已取消");
    await load().catch((cause) => toast.error(cause.message));
    if (name === "cancel") await open(id);
  }

  useEffect(() => {
    load().catch((cause) => toast.error(cause.message));
  }, [query]);

  useEffect(() => {
    if (!selected || terminalStatuses.has(selected.status)) return;
    const source = new EventSource(`/api/deployments/${selected.id}/events`);
    source.onmessage = (event) => {
      const entry = JSON.parse(event.data) as LogEntry;
      setSelected((current) => current?.id === selected.id
        ? { ...current, logs: [...current.logs, entry] }
        : current);
    };
    source.addEventListener("end", () => {
      source.close();
      void open(selected.id);
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
        onOpen={(id) => void open(id)}
        onAction={(id, name) => void action(id, name)}
      />
      {selected && <DeploymentDetailPanel deployment={selected} onClose={() => setSelected(null)} />}
      <ActivityTables logs={logs} auditEvents={auditEvents} />
    </div>
  );
}
