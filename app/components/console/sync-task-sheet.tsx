"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getApiData, queryKeys } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type SyncTask = { id: string; certificateName: string; status: string; phase: string; trigger: string; errorSummary: string | null; startedAt: string | null; finishedAt: string | null; createdAt: string };
type SyncLog = { id: string; sequence: number; level: string; message: string; createdAt: string };

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);
const phaseLabels: Record<string, string> = { queued: "等待 Worker", checking: "检查本地版本", quota: "检查调用额度", fetching: "获取远端证书", validating: "校验证书", saving: "保存新版本", deploying: "创建部署任务", succeeded: "同步完成", failed: "同步失败", cancelled: "任务已取消" };

export function SyncTaskSheet({ taskId, onOpenChange }: { taskId: string | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const taskQuery = useQuery({ queryKey: queryKeys.syncJob(taskId ?? ""), queryFn: () => getApiData<SyncTask>(`/api/certificate-sync-jobs/${taskId}`), enabled: Boolean(taskId), refetchInterval: (current) => terminalStatuses.has((current.state.data as SyncTask | undefined)?.status ?? "") ? false : 5_000 });
  const logsQuery = useQuery({ queryKey: queryKeys.syncJobLogs(taskId ?? ""), queryFn: () => getApiData<SyncLog[]>(`/api/certificate-sync-jobs/${taskId}/logs`), enabled: Boolean(taskId) });
  const task = taskQuery.data;
  const logs = logsQuery.data ?? [];

  useEffect(() => {
    if (!taskId || !task || terminalStatuses.has(task.status)) return;
    const source = new EventSource(`/api/certificate-sync-jobs/${taskId}/events`);
    source.onmessage = (event) => {
      const entry = JSON.parse(event.data) as SyncLog;
      queryClient.setQueryData<SyncLog[]>(queryKeys.syncJobLogs(taskId), (current = []) => current.some((item) => item.id === entry.id) ? current : [...current, entry]);
    };
    source.addEventListener("end", () => {
      source.close();
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.syncJob(taskId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.syncJobs }),
        queryClient.invalidateQueries({ queryKey: queryKeys.certificates }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
      ]);
    });
    return () => source.close();
  }, [taskId, task?.status, queryClient]);

  useEffect(() => {
    if (task && terminalStatuses.has(task.status)) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.certificates }),
        queryClient.invalidateQueries({ queryKey: queryKeys.syncJobs }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
      ]);
    }
  }, [task?.status, queryClient]);

  return <Sheet open={Boolean(taskId)} onOpenChange={onOpenChange}><SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>同步任务</SheetTitle><SheetDescription>{task ? `${task.certificateName} · ${task.id}` : "正在读取任务详情…"}</SheetDescription></SheetHeader>{task && <div className="mt-6 space-y-6"><div className="rounded-lg border bg-muted/50 p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant={task.status === "failed" ? "destructive" : task.status === "succeeded" ? "default" : "secondary"}>{({ queued: "排队中", running: "同步中", succeeded: "成功", failed: "失败", cancelled: "已取消" } as Record<string, string>)[task.status] ?? task.status}</Badge><span className="text-sm font-medium">{phaseLabels[task.phase] ?? task.phase}</span></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">触发方式</dt><dd className="mt-1">{task.trigger === "manual" ? "手动" : "定时"}</dd></div><div><dt className="text-xs text-muted-foreground">创建时间</dt><dd className="mt-1">{formatDate(task.createdAt)}</dd></div><div><dt className="text-xs text-muted-foreground">开始时间</dt><dd className="mt-1">{task.startedAt ? formatDate(task.startedAt) : "等待 Worker"}</dd></div><div><dt className="text-xs text-muted-foreground">结束时间</dt><dd className="mt-1">{task.finishedAt ? formatDate(task.finishedAt) : "进行中"}</dd></div></dl>{task.errorSummary && <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{task.errorSummary}</p>}</div><div><h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><Activity className="size-4" />实时日志</h3><div className="max-h-[50vh] space-y-2 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-100">{logs.map((entry) => <p key={entry.id}><span className="text-slate-500">{formatDate(entry.createdAt)} </span><span className={entry.level === "error" ? "text-red-300" : entry.level === "warn" ? "text-amber-300" : "text-emerald-300"}>{entry.level.toUpperCase()}</span>{" "}{entry.message}</p>)}{logs.length === 0 && <p className="text-slate-400">{task.status === "queued" ? "等待 Worker 接手任务…" : "等待任务日志…"}</p>}</div></div></div>}</SheetContent></Sheet>;
}
