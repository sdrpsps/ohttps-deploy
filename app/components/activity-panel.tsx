"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Send,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityMetrics } from "@/components/activity/activity-metrics";
import { DashboardSkeleton } from "@/components/console/dashboard-skeleton";
import { DeploymentDetailSheet } from "@/components/activity/deployment-detail-sheet";
import { DeploymentHistory, SyncJobHistory } from "@/components/activity/task-history";
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
  const [activeTab, setActiveTab] = useState("deployments");
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
    if (tab === "tasks") setActiveTab("deployments");
    else if (tab && ["deployments", "sync", "logs", "audit"].includes(tab)) setActiveTab(tab);
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
    refetchInterval: (current) => {
      const detail = current.state.data as DeploymentDetail | undefined;
      return detail && !terminalStatuses.has(detail.status) ? 2_000 : false;
    },
  });

  const deployments = deploymentsQuery.data ?? [];
  const logs = logsQuery.data ?? [];
  const auditEvents = auditEventsQuery.data ?? [];
  const selected = selectedQuery.data ?? null;

  const initialLoading = [deploymentsQuery, logsQuery, auditEventsQuery].some((query) => query.isLoading);

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

  const selectedIdForStream = selected?.id ?? null;
  const isSelectedTerminal = selected ? terminalStatuses.has(selected.status) : false;

  // SSE 实时日志流连接
  useEffect(() => {
    if (!selectedIdForStream || isSelectedTerminal) return;
    const cached = queryClient.getQueryData<DeploymentDetail>(
      queryKeys.deployment(selectedIdForStream)
    );
    const lastSequence =
      cached?.logs.reduce((max, item) => Math.max(max, item.sequence || 0), 0) ?? 0;
    const streamUrl =
      lastSequence > 0
        ? `/api/deployments/${selectedIdForStream}/events?after=${lastSequence}`
        : `/api/deployments/${selectedIdForStream}/events`;
    const source = new EventSource(streamUrl);
    source.onmessage = (event) => {
      const entry = JSON.parse(event.data) as LogEntry;
      let targetChanged = false;
      queryClient.setQueryData<DeploymentDetail>(
        queryKeys.deployment(selectedIdForStream),
        (current) => {
          if (!current || current.id !== selectedIdForStream) return current;
          const exists = current.logs.some(
            (item) =>
              (entry.id && item.id === entry.id) ||
              (entry.sequence && item.sequence === entry.sequence)
          );
          if (exists) return current;

          const updatedTargets = entry.targetId
            ? current.targets.map((target) => {
                if (target.id !== entry.targetId) return target;
                const isFailureLog =
                  entry.level === "error" && entry.message.includes("部署失败：");
                const isCancelledLog = entry.message.includes("部署已取消");
                const isSucceededLog =
                  entry.message.includes("已成功部署") ||
                  entry.message.includes("dry-run 模拟校验成功");

                if (isFailureLog) {
                  targetChanged = true;
                  const errorSummary =
                    entry.message.split("部署失败：")[1]?.trim() || target.errorSummary;
                  return { ...target, status: "failed", errorSummary };
                }
                if (isCancelledLog) {
                  targetChanged = true;
                  return { ...target, status: "cancelled" };
                }
                if (isSucceededLog) {
                  targetChanged = true;
                  return { ...target, status: "succeeded", exitCode: target.exitCode ?? 0 };
                }
                if (target.status === "queued") {
                  targetChanged = true;
                  return { ...target, status: "running" };
                }
                return target;
              })
            : current.targets;

          return {
            ...current,
            status: current.status === "queued" ? "running" : current.status,
            targets: updatedTargets,
            logs: [...current.logs, entry],
          };
        }
      );

      if (targetChanged) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.deployment(selectedIdForStream),
        });
      }
    };
    source.addEventListener("end", () => {
      source.close();
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deployment(selectedIdForStream) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
      ]);
    });
    return () => source.close();
  }, [selectedIdForStream, isSelectedTerminal, queryClient]);

  if (initialLoading) return <DashboardSkeleton section="activity" />;

  return (
    <div className="space-y-6">
      {/* 1. 顶部运维运行态势指标卡 */}
      <ActivityMetrics
        deployments={deployments}
        syncJobs={syncJobs}
        auditEvents={auditEvents}
        onFilterFailed={() => {
          const hasFailedDeployments = deployments.some(
            (d) => d.status === "failed" || d.status === "partial"
          );
          const hasFailedSyncs = syncJobs.some((s) => s.status === "failed");
          setActiveTab(hasFailedDeployments || !hasFailedSyncs ? "deployments" : "sync");
          setStatus("failed");
        }}
        onFilterActive={() => {
          const hasActiveDeployments = deployments.some(
            (d) => d.status === "running" || d.status === "queued"
          );
          const hasActiveSyncs = syncJobs.some(
            (s) => s.status === "running" || s.status === "queued"
          );
          setActiveTab(hasActiveDeployments || !hasActiveSyncs ? "deployments" : "sync");
          setStatus("running");
        }}
      />

      {/* 2. 标签页组织：部署任务 / 证书同步 / 系统日志 / 操作审计 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="grid h-auto w-full grid-cols-2 justify-start gap-1 sm:inline-flex sm:h-10 sm:w-auto sm:justify-start">
            <TabsTrigger value="deployments" className="flex items-center justify-start gap-1.5 text-left text-xs">
              <Send className="size-3.5 shrink-0" />
              部署任务 ({deployments.length})
            </TabsTrigger>
            <TabsTrigger value="sync" className="flex items-center justify-start gap-1.5 text-left text-xs">
              <RefreshCw className="size-3.5 shrink-0" />
              证书同步 ({syncJobs.length})
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center justify-start gap-1.5 text-left text-xs">
              <Terminal className="size-3.5 shrink-0" />
              系统日志
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center justify-start gap-1.5 text-left text-xs">
              <ShieldCheck className="size-3.5 shrink-0" />
              操作审计
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 标签 1: 部署任务 */}
        <TabsContent value="deployments" className="mt-0 space-y-4">
          <DeploymentHistory
            certificates={certificates}
            servers={servers}
            deployments={deployments}
            certificateId={certificateId}
            serverId={serverId}
            status={status}
            from={from}
            onCertificateChange={setCertificateId}
            onServerChange={setServerId}
            onStatusChange={setStatus}
            onFromChange={setFrom}
            onOpenDeployment={(id) => setSelectedId(id)}
            onClearFailed={() => void clearFailedDeployments()}
          />
        </TabsContent>

        {/* 标签 2: 证书同步 */}
        <TabsContent value="sync" className="mt-0 space-y-4">
          <SyncJobHistory
            certificates={certificates}
            syncJobs={syncJobs}
            certificateId={certificateId}
            status={status}
            from={from}
            onCertificateChange={setCertificateId}
            onStatusChange={setStatus}
            onFromChange={setFrom}
            onOpenSyncJob={(id) => onViewSyncJob?.(id)}
          />
        </TabsContent>

        {/* 标签 2: 系统日志 */}
        <TabsContent value="logs" className="mt-0 space-y-4">
          <SystemLogViewer
            logs={logs}
            certificates={certificates}
            servers={servers}
            certificateId={certificateId}
            serverId={serverId}
            level={logLevel}
            from={from}
            onCertificateChange={setCertificateId}
            onServerChange={setServerId}
            onLevelChange={setLogLevel}
            onFromChange={setFrom}
            onOpenDeployment={(id) => setSelectedId(id)}
            onResetFilters={() => {
              setCertificateId("");
              setServerId("");
              setLogLevel("");
              setFrom("");
            }}
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
