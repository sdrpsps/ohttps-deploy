"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Check, Copy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  classifyLogTone,
  formatActivityDate,
  formatDuration,
  formatLogTime,
  formatTaskError,
  syncPhaseLabels,
} from "@/components/activity/types";
import { getApiData, queryKeys } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";

type SyncTask = { id: string; certificateName: string; status: string; phase: string; trigger: string; errorSummary: string | null; startedAt: string | null; finishedAt: string | null; createdAt: string };
type SyncLog = { id: string; sequence: number; level: string; message: string; createdAt: string };

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);
const syncStepOrder = ["checking", "quota", "fetching", "validating", "saving", "deploying"] as const;
const syncStepShortLabels: Record<string, string> = {
  checking: "检查版本",
  quota: "检查额度",
  fetching: "拉取证书",
  validating: "校验匹配",
  saving: "保存版本",
  deploying: "创建部署",
};

export function SyncTaskSheet({ taskId, onOpenChange }: { taskId: string | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const logEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const taskQuery = useQuery({ queryKey: queryKeys.syncJob(taskId ?? ""), queryFn: () => getApiData<SyncTask>(`/api/certificate-sync-jobs/${taskId}`), enabled: Boolean(taskId), refetchInterval: (current) => terminalStatuses.has((current.state.data as SyncTask | undefined)?.status ?? "") ? false : 3_000 });
  const logsQuery = useQuery({ queryKey: queryKeys.syncJobLogs(taskId ?? ""), queryFn: () => getApiData<SyncLog[]>(`/api/certificate-sync-jobs/${taskId}/logs`), enabled: Boolean(taskId) });
  const task = taskQuery.data;
  const logs = logsQuery.data ?? [];
  const hasTask = Boolean(task);
  const isTerminal = terminalStatuses.has(task?.status ?? "");

  useEffect(() => {
    if (logs.length > 0 && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length]);

  useEffect(() => {
    if (!taskId || !hasTask || isTerminal) return;
    const cachedLogs = queryClient.getQueryData<SyncLog[]>(queryKeys.syncJobLogs(taskId)) ?? [];
    const lastSequence = cachedLogs.reduce((max, item) => Math.max(max, item.sequence || 0), 0);
    const streamUrl =
      lastSequence > 0
        ? `/api/certificate-sync-jobs/${taskId}/events?after=${lastSequence}`
        : `/api/certificate-sync-jobs/${taskId}/events`;
    const source = new EventSource(streamUrl);
    source.onmessage = (event) => {
      const entry = JSON.parse(event.data) as SyncLog;
      queryClient.setQueryData<SyncLog[]>(queryKeys.syncJobLogs(taskId), (current = []) =>
        current.some((item) => (entry.id && item.id === entry.id) || (entry.sequence && item.sequence === entry.sequence))
          ? current
          : [...current, entry]
      );
      queryClient.setQueryData<SyncTask>(queryKeys.syncJob(taskId), (curr) =>
        curr && curr.status === "queued" ? { ...curr, status: "running" } : curr
      );
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
  }, [taskId, hasTask, isTerminal, queryClient]);

  useEffect(() => {
    if (task && terminalStatuses.has(task.status)) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.certificates }),
        queryClient.invalidateQueries({ queryKey: queryKeys.syncJobs }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deployments }),
      ]);
    }
  }, [task?.status, queryClient]);

  const currentStepIndex = task
    ? task.status === "succeeded"
      ? syncStepOrder.length
      : syncStepOrder.indexOf(task.phase as (typeof syncStepOrder)[number])
    : -1;
  const duration = task ? formatDuration(task.startedAt, task.finishedAt) : null;
  const formattedError = formatTaskError(task?.errorSummary);

  const copyLogs = async () => {
    const text = logs
      .map((l) => `[${formatActivityDate(l.createdAt)}] [${l.level.toUpperCase()}] ${l.message}`)
      .join("\n");
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast.success("已复制同步日志");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("复制失败，请手动选择复制");
    }
  };

  return (
    <Sheet open={Boolean(taskId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b pb-3.5">
          <div className="flex items-center gap-2 pr-6">
            {task && (
              <Badge variant={task.status === "failed" ? "destructive" : task.status === "succeeded" ? "default" : "secondary"}>
                {({ queued: "排队中", running: "同步中", succeeded: "成功", failed: "失败", cancelled: "已取消" } as Record<string, string>)[task.status] ?? task.status}
              </Badge>
            )}
            <SheetTitle className="truncate text-base font-semibold">
              {task ? `证书同步：${task.certificateName}` : "同步任务"}
            </SheetTitle>
          </div>
          <SheetDescription className="flex items-center gap-2 text-xs text-muted-foreground">
            {task ? (
              <>
                <span>{syncPhaseLabels[task.phase] ?? task.phase}</span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => void copyToClipboard(task.id).then((ok) => ok && toast.success("任务 ID 已复制"))}
                  className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-foreground"
                  title={`点击复制完整 ID: ${task.id}`}
                >
                  <span>#{task.id.slice(0, 8)}</span>
                  <Copy className="size-3 opacity-60" />
                </button>
              </>
            ) : (
              "正在读取任务详情…"
            )}
          </SheetDescription>
        </SheetHeader>

        {task && (
          <div className="flex-1 space-y-5 py-4">
            {/* 基本信息卡片 */}
            <Card className="border-border/70 bg-muted/30 shadow-none">
              <CardContent className="space-y-3 p-3.5">
                <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">触发方式</dt>
                    <dd className="mt-0.5 font-medium">{task.trigger === "manual" ? "手动触发" : "定时调度"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">耗时</dt>
                    <dd className="mt-0.5 font-mono font-medium">{duration ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">创建时间</dt>
                    <dd className="mt-0.5 font-mono text-[11px] font-medium">{formatActivityDate(task.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">结束时间</dt>
                    <dd className="mt-0.5 font-mono text-[11px] font-medium">
                      {task.finishedAt ? formatActivityDate(task.finishedAt) : "进行中"}
                    </dd>
                  </div>
                </dl>

                {/* 阶段进度条 */}
                <div className="grid grid-cols-3 gap-1.5 border-t pt-3 sm:grid-cols-6">
                  {syncStepOrder.map((stepKey, idx) => {
                    const isCompleted = task.status === "succeeded" || (currentStepIndex > idx);
                    const isCurrent = task.status === "running" && currentStepIndex === idx;
                    const isStepFailed = task.status === "failed" && currentStepIndex === idx;
                    return (
                      <div
                        key={stepKey}
                        className={`rounded-md border px-2 py-1.5 text-center text-[11px] ${
                          isStepFailed
                            ? "border-destructive/40 bg-destructive/10 font-medium text-destructive"
                            : isCurrent
                            ? "border-primary/40 bg-primary/10 font-medium text-primary"
                            : isCompleted
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-border/60 bg-background/60 text-muted-foreground"
                        }`}
                      >
                        {syncStepShortLabels[stepKey]}
                      </div>
                    );
                  })}
                </div>

                {formattedError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <span className="font-semibold">失败原因：</span>
                    <span>{formattedError}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 结构化执行日志 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Activity className="size-3.5" />
                    执行日志 ({logs.length})
                  </h3>
                  {!isTerminal && (
                    <span className="flex items-center gap-1 text-[11px] text-primary">
                      <span className="size-1.5 animate-ping rounded-full bg-primary" />
                      实时同步中
                    </span>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => void copyLogs()}
                  disabled={logs.length === 0}
                >
                  {copied ? (
                    <>
                      <Check className="mr-1 size-3 text-emerald-500" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 size-3" />
                      复制日志
                    </>
                  )}
                </Button>
              </div>

              <div className="max-h-[52vh] divide-y divide-slate-800/40 overflow-auto rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">
                {logs.map((entry) => {
                  const tone = classifyLogTone(entry.level, entry.message);
                  return (
                    <div
                      key={entry.id || entry.sequence}
                      className={`flex items-start gap-2 rounded px-1.5 py-1.5 leading-relaxed ${
                        tone === "error"
                          ? "bg-rose-500/10 text-rose-200"
                          : tone === "warn"
                          ? "bg-amber-500/10 text-amber-200"
                          : ""
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 select-none text-[11px] tabular-nums text-slate-500">
                        {formatLogTime(entry.createdAt)}
                      </span>
                      <span className="mt-1 shrink-0">
                        {tone === "error" ? (
                          <XCircle className="size-3.5 text-rose-400" />
                        ) : tone === "warn" ? (
                          <AlertTriangle className="size-3.5 text-amber-400" />
                        ) : tone === "success" ? (
                          <Check className="size-3.5 text-emerald-400" />
                        ) : tone === "progress" ? (
                          <span className="mx-1 block size-1.5 rounded-full bg-slate-600" />
                        ) : (
                          <span className="mx-1 block size-1.5 rounded-full bg-sky-400/70" />
                        )}
                      </span>
                      <span
                        className={`min-w-0 flex-1 break-words whitespace-pre-wrap ${
                          tone === "progress"
                            ? "text-slate-400"
                            : tone === "success"
                            ? "text-slate-100"
                            : tone === "error"
                            ? "text-rose-200"
                            : tone === "warn"
                            ? "text-amber-200"
                            : "text-slate-200"
                        }`}
                      >
                        {entry.message}
                      </span>
                    </div>
                  );
                })}

                {logs.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                    {!isTerminal ? (
                      <div className="flex items-center gap-2">
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                        </span>
                        <span className="font-sans text-xs text-slate-300">
                          {task.status === "queued" ? "等待 Worker 接手任务…" : "正在执行同步…"}
                        </span>
                      </div>
                    ) : (
                      <p className="font-sans text-xs text-slate-500">暂无日志输出</p>
                    )}
                  </div>
                )}

                {!isTerminal && logs.length > 0 && (
                  <div className="flex items-center gap-2 px-1.5 pt-2 font-sans text-[11px] text-slate-400 select-none">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                    <span>正在接收实时输出…</span>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
