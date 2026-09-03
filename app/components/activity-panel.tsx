"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Layers,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityMetrics } from "@/components/activity/activity-metrics";
import { DeploymentDetailSheet } from "@/components/activity/deployment-detail-sheet";
import { TaskHistory } from "@/components/activity/task-history";
import {
  AuditTrailViewer,
  SystemLogViewer,
} from "@/components/activity/activity-tables";
import type {
  AuditEntry,
  Deployment,
  DeploymentDetail,
  LogEntry,
  SyncJobItem,
} from "@/components/activity/types";
import { terminalStatuses } from "@/components/activity/types";
import type { Certificate, ManagedServer } from "@/components/console/types";
import { getApiData, queryKeys } from "@/lib/api";

type ActivityPanelProps = {
  certificates: Certificate[];
  servers: ManagedServer[];
  syncJobs?: SyncJobItem[];
  onViewSyncJob?: (jobId: string) => void;
};

export function ActivityPanel({
  certificates,
  servers,
  syncJobs = [],
  onViewSyncJob,
}: ActivityPanelProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("tasks");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [certificateId, setCertificateId] = useState("");
  const [serverId, setServerId] = useState("");
  const [status, setStatus] = useState("");
  const [logLevel, setLogLevel] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const depId = params.get("deploymentId");
    const st = params.get("status");
    const certId = params.get("certificateId");
    const srvId = params.get("serverId");
    const tab = params.get("tab");
    if (depId) setSelectedId(depId);
    if (st) setStatus(st);
    if (certId) setCertificateId(certId);
    if (srvId) setServerId(srvId);
    if (tab && ["tasks", "logs", "audit"].includes(tab)) setActiveTab(tab);
  }, []);

  const logsQueryParam = useMemo(
    () =>
      new URLSearchParams(
        Object.entries({
          certificateId,
          serverId,
          level: logLevel,
          from: from && new Date(`${from}T00:00:00+08:00`).toISOString(),
        }).filter(([, value]) => value)
      ).toString(),
    [certificateId, serverId, logLevel, from]
  );

  const deploymentsQuery = useQuery({
    queryKey: queryKeys.deployments,
    queryFn: () => getApiData<Deployment[]>("/api/deployments"),
    refetchInterval: (current) =>
      (current.state.data as Deployment[] | undefined)?.some(
        (item) => !terminalStatuses.has(item.status)
      )
        ? 2_000
        : false,
  });

  const logsQuery = useQuery({
    queryKey: queryKeys.logs(logsQueryParam),
    queryFn: () => getApiData<LogEntry[]>(`/api/logs?${logsQueryParam}`),
  });

  const auditEventsQuery = useQuery({
    queryKey: queryKeys.auditEvents,
    queryFn: () => getApiData<AuditEntry[]>("/api/audit-events"),
  });

  const selectedQuery = useQuery({
    queryKey: queryKeys.deployment(selectedId ?? ""),
    queryFn: () => getApiData<DeploymentDetail>(`/api/deployments/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const deployments = deploymentsQuery.data ?? [];
  const logs = logsQuery.data ?? [];
  const auditEvents = auditEventsQuery.data ?? [];
  const selected = selectedQuery.data ?? null;

  const historyError = [deploymentsQuery, logsQuery, auditEventsQuery].find(
    (result) => result.error
  )?.error;

  useEffect(() => {
    if (historyError instanceof Error) toast.error(historyError.message);
  }, [historyError]);

  async function action(id: string, name: "retry" | "cancel") {
    setBusy(true);
    try {
      const response = await fetch(`/api/deployments/${id}/${name}`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error?.message ?? "操作未完成");
        return;
      }
      toast.success(name === "retry" ? "重试任务已创建" : "任务已取消");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
        queryClient.invalidateQueries({ queryKey: queryKeys.logs(logsQueryParam) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auditEvents }),
      ]);
      if (name === "cancel") {
        await queryClient.invalidateQueries({ queryKey: queryKeys.deployment(id) });
      }
      if (name === "retry" && body?.data?.id) {
        setSelectedId(body.data.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteDeployment(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/deployments/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error?.message ?? "删除失败");
        return;
      }
      toast.success("已删除部署记录");
      setSelectedId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auditEvents }),
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function clearFailedDeployments() {
    setBusy(true);
    try {
      const response = await fetch("/api/deployments?status=failed", { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error?.message ?? "清理失败");
        return;
      }
      toast.success(`已清理 ${body.data.deletedCount} 条历史失败记录`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auditEvents }),
      ]);
    } finally {
      setBusy(false);
    }
  }

  // SSE 实时日志流连接
  useEffect(() => {
    if (!selected || terminalStatuses.has(selected.status)) return;
    const source = new EventSource(`/api/deployments/${selected.id}/events`);
    source.onmessage = (event) => {
      const entry = JSON.parse(event.data) as LogEntry;
      queryClient.setQueryData<DeploymentDetail>(
        queryKeys.deployment(selected.id),
        (current) =>
          current?.id === selected.id
            ? { ...current, logs: [...current.logs, entry] }
            : current
      );
    };
    source.addEventListener("end", () => {
      source.close();
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deployment(selected.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
      ]);
    });
    return () => source.close();
  }, [selected?.id, selected?.status, queryClient]);

  return (
    <div className="space-y-6">
      {/* 1. 顶部运维运行态势指标卡 */}
      <ActivityMetrics
        deployments={deployments}
        syncJobs={syncJobs}
        auditEvents={auditEvents}
        onFilterFailed={() => {
          setActiveTab("tasks");
          setStatus("failed");
        }}
        onFilterActive={() => {
          setActiveTab("tasks");
          setStatus("running");
        }}
      />

      {/* 2. 标签页组织：任务中心 / 系统日志 / 操作审计 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList className="grid w-full sm:w-auto grid-cols-3">
            <TabsTrigger value="tasks" className="flex items-center gap-1.5 text-xs">
              <Layers className="size-3.5" />
              任务中心
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-1.5 text-xs">
              <Terminal className="size-3.5" />
              系统日志
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-1.5 text-xs">
              <ShieldCheck className="size-3.5" />
              操作审计
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 标签 1: 任务中心 */}
        <TabsContent value="tasks" className="mt-0 space-y-4">
          <TaskHistory
            certificates={certificates}
            servers={servers}
            deployments={deployments}
            syncJobs={syncJobs}
            certificateId={certificateId}
            serverId={serverId}
            status={status}
            from={from}
            onCertificateChange={setCertificateId}
            onServerChange={setServerId}
            onStatusChange={setStatus}
            onFromChange={setFrom}
            onOpenDeployment={(id) => setSelectedId(id)}
            onOpenSyncJob={(id) => onViewSyncJob?.(id)}
            onDeploymentAction={(id, name) => void action(id, name)}
            onClearFailed={() => void clearFailedDeployments()}
          />
        </TabsContent>

        {/* 标签 2: 系统日志 */}
        <TabsContent value="logs" className="mt-0 space-y-4">
          <SystemLogViewer
            logs={logs}
            level={logLevel}
            onLevelChange={setLogLevel}
          />
        </TabsContent>

        {/* 标签 3: 操作审计 */}
        <TabsContent value="audit" className="mt-0 space-y-4">
          <AuditTrailViewer
            events={auditEvents}
            certificates={certificates}
            servers={servers}
          />
        </TabsContent>
      </Tabs>

      {/* 3. 抽屉式部署详情面板 (Sheet) */}
      <DeploymentDetailSheet
        deployment={selected}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onAction={(id, name) => void action(id, name)}
        onDelete={(id) => void deleteDeployment(id)}
        onViewSyncJob={onViewSyncJob}
        busy={busy}
      />
    </div>
  );
}
