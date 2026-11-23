"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  ExternalLink,
  RotateCcw,
  Server,
  Shield,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { copyToClipboard } from "@/lib/utils";
import type { DeploymentDetail } from "./types";
import {
  classifyLogTone,
  formatActivityDate,
  formatDuration,
  formatLogTime,
  formatTaskError,
  parseServerLogPrefix,
  statusLabels,
  terminalStatuses,
  triggerLabels,
} from "./types";

type DeploymentDetailSheetProps = {
  deployment: DeploymentDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction?: (id: string, action: "retry" | "cancel") => void;
  onDelete?: (id: string) => void;
  onViewSyncJob?: (jobId: string) => void;
  busy?: boolean;
};

export function DeploymentDetailSheet({
  deployment,
  open,
  onOpenChange,
  onAction,
  onDelete,
  onViewSyncJob,
  busy = false,
}: DeploymentDetailSheetProps) {
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedTargetId(null);
  }, [deployment?.id, open]);

  const visibleLogs = useMemo(() => {
    if (!deployment) return [];
    if (!selectedTargetId) return deployment.logs;
    return deployment.logs.filter((entry) => entry.targetId === selectedTargetId);
  }, [deployment, selectedTargetId]);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [visibleLogs.length, autoScroll]);

  const isTerminal = deployment ? terminalStatuses.has(deployment.status) : false;
  const duration = deployment ? formatDuration(deployment.startedAt, deployment.finishedAt) : null;
  const formattedError = formatTaskError(deployment?.errorSummary);
  const hasMultipleTargets = (deployment?.targets.length ?? 0) > 1;

  const copyLogs = async () => {
    const text = visibleLogs
      .map(
        (l) =>
          `[${formatActivityDate(l.createdAt)}] [${l.level.toUpperCase()}] ${l.message}`
      )
      .join("\n");
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast.success("已复制任务执行日志");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const copyDeploymentId = async () => {
    if (!deployment) return;
    const ok = await copyToClipboard(deployment.id);
    if (ok) toast.success("任务 ID 已复制");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader className="border-b pb-3.5">
          <div className="flex items-center gap-2 pr-6">
            {deployment && (
              <Badge
                variant={
                  deployment.status === "succeeded"
                    ? "default"
                    : deployment.status === "failed" || deployment.status === "partial"
                    ? "destructive"
                    : "secondary"
                }
              >
                {statusLabels[deployment.status] ?? deployment.status}
              </Badge>
            )}
            <SheetTitle className="truncate text-base font-semibold">
              {deployment
                ? deployment.title ?? `部署：${deployment.certificateName}`
                : "部署任务详情"}
            </SheetTitle>
          </div>
          <SheetDescription className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {deployment ? (
              <>
                <span>
                  {deployment.certificates && deployment.certificates.length > 1
                    ? `${deployment.certificates.length} 张证书`
                    : deployment.domain}
                </span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => void copyDeploymentId()}
                  className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-foreground"
                  title={`点击复制完整 ID: ${deployment.id}`}
                >
                  <span>#{deployment.id.slice(0, 8)}</span>
                  <Copy className="size-3 opacity-60" />
                </button>
              </>
            ) : (
              "正在读取任务详情…"
            )}
          </SheetDescription>
        </SheetHeader>

        {!deployment ? (
          <div className="flex-1 space-y-5 py-4">
            <Card className="border-border/70 bg-muted/30 shadow-none">
              <CardContent className="grid grid-cols-2 gap-3 p-3.5 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-5 py-4">
            {/* 基本信息 */}
            <Card className="border-border/70 bg-muted/30 shadow-none">
              <CardContent className="space-y-3 p-3.5">
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                  <p className="text-muted-foreground">触发方式</p>
                  <p className="mt-0.5 font-medium">
                    {triggerLabels[deployment.trigger] ?? deployment.trigger}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">耗时</p>
                  <p className="mt-0.5 font-mono font-medium">{duration ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">创建时间</p>
                  <p className="mt-0.5 font-mono text-[11px] font-medium">
                    {formatActivityDate(deployment.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">结束时间</p>
                  <p className="mt-0.5 font-mono text-[11px] font-medium">
                    {deployment.finishedAt
                      ? formatActivityDate(deployment.finishedAt)
                      : "进行中"}
                  </p>
                </div>
              </div>

              {deployment.syncJobId && (
                <div className="flex items-center justify-between border-t pt-2 text-xs">
                  <span className="text-muted-foreground">关联同步任务</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="flex h-auto items-center gap-1 p-0 font-mono text-xs text-primary"
                    onClick={() => {
                      onOpenChange(false);
                      onViewSyncJob?.(deployment.syncJobId!);
                    }}
                  >
                    #{deployment.syncJobId.slice(0, 8)}
                    <ExternalLink className="size-3" />
                  </Button>
                </div>
              )}

              {formattedError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <span className="font-semibold">失败原因：</span>
                  <span className="whitespace-pre-wrap">{formattedError}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 包含证书 */}
          {deployment.certificates && deployment.certificates.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Shield className="size-3.5" />
                包含证书 ({deployment.certificates.length})
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {deployment.certificates.map((cert) => (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-xs"
                  >
                    <span className="truncate font-medium text-foreground">{cert.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{cert.domain}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 目标服务器列表（多节点时支持点击筛选日志） */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Server className="size-3.5" />
                目标服务器 ({deployment.targets.length})
              </h4>
              {hasMultipleTargets && (
                <span className="text-[11px] text-muted-foreground">
                  点击节点卡片可筛选下方日志
                </span>
              )}
            </div>
            <div className="space-y-2">
              {deployment.targets.map((target) => {
                const isSelected = selectedTargetId === target.id;
                const targetError = formatTaskError(target.errorSummary);
                return (
                  <button
                    key={target.id}
                    type="button"
                    disabled={!hasMultipleTargets}
                    onClick={() =>
                      hasMultipleTargets &&
                      setSelectedTargetId((curr) => (curr === target.id ? null : target.id))
                    }
                    className={`w-full rounded-lg border bg-card p-3 text-left text-xs transition-colors ${
                      hasMultipleTargets ? "cursor-pointer hover:border-primary/40" : "cursor-default"
                    } ${isSelected ? "border-primary ring-1 ring-primary/30" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {target.serverName}
                        </span>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {target.host}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {target.exitCode !== null && target.exitCode !== 0 && (
                          <span className="font-mono text-[11px] font-semibold text-destructive">
                            exit {target.exitCode}
                          </span>
                        )}
                        <Badge
                          variant={
                            target.status === "succeeded"
                              ? "default"
                              : target.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {statusLabels[target.status] ?? target.status}
                        </Badge>
                      </div>
                    </div>
                    {targetError && (
                      <p className="mt-2 whitespace-pre-wrap break-all rounded bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
                        {targetError}
                      </p>
                    )}
                  </button>
                );
              })}
              {deployment.targets.length === 0 && (
                <p className="text-xs text-muted-foreground">暂无目标服务器记录</p>
              )}
            </div>
          </div>

          {/* 结构化执行日志 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Terminal className="size-3.5" />
                  执行日志 ({visibleLogs.length})
                </h4>
                {!isTerminal && (
                  <span className="flex items-center gap-1 text-[11px] text-primary">
                    <span className="size-1.5 animate-ping rounded-full bg-primary" />
                    实时同步中
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground"
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  {autoScroll ? "自动滚动: 开" : "自动滚动: 关"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => void copyLogs()}
                  disabled={visibleLogs.length === 0}
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
            </div>

            {hasMultipleTargets && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedTargetId(null)}
                  className={`rounded-md px-2 py-0.5 transition-colors ${
                    selectedTargetId === null
                      ? "bg-primary font-medium text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  全部节点 ({deployment.logs.length})
                </button>
                {deployment.targets.map((target) => {
                  const count = deployment.logs.filter((l) => l.targetId === target.id).length;
                  return (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() =>
                        setSelectedTargetId((curr) => (curr === target.id ? null : target.id))
                      }
                      className={`rounded-md px-2 py-0.5 transition-colors ${
                        selectedTargetId === target.id
                          ? "bg-primary font-medium text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {target.serverName} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="max-h-80 divide-y divide-slate-800/40 overflow-auto rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">
              {visibleLogs.map((entry) => {
                const { serverPrefix, body } = parseServerLogPrefix(entry.message);
                const tone = classifyLogTone(entry.level, entry.message);
                const showNodeTag = Boolean(serverPrefix && hasMultipleTargets && !selectedTargetId);

                return (
                  <div
                    key={`${entry.sequence}-${entry.createdAt}`}
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

                    <div className="min-w-0 flex-1 break-words whitespace-pre-wrap">
                      {showNodeTag && (
                        <span className="mr-1.5 inline-block rounded bg-slate-800 px-1.5 py-0 text-[10px] font-medium text-slate-300">
                          {serverPrefix}
                        </span>
                      )}
                      <span
                        className={
                          tone === "progress"
                            ? "text-slate-400"
                            : tone === "success"
                            ? "text-slate-100"
                            : tone === "error"
                            ? "text-rose-200"
                            : tone === "warn"
                            ? "text-amber-200"
                            : "text-slate-200"
                        }
                      >
                        {body}
                      </span>
                    </div>
                  </div>
                );
              })}

              {visibleLogs.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                  {!isTerminal ? (
                    <div className="flex items-center gap-2">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                      </span>
                      <span className="font-sans text-xs text-slate-300">
                        {deployment.status === "queued"
                          ? "等待 Worker 接手任务…"
                          : "正在执行部署…"}
                      </span>
                    </div>
                  ) : (
                    <p className="font-sans text-xs text-slate-500">暂无日志输出</p>
                  )}
                </div>
              )}

              {!isTerminal && visibleLogs.length > 0 && (
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

        <SheetFooter className="flex flex-row items-center justify-between border-t pt-3 sm:justify-between">
          <div className="flex items-center gap-2">
            {deployment && !isTerminal && onAction && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                disabled={busy}
                onClick={() => onAction(deployment.id, "cancel")}
              >
                <Ban className="mr-1.5 size-4" />
                取消任务
              </Button>
            )}
            {deployment && isTerminal && deployment.status !== "succeeded" && onAction && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onAction(deployment.id, "retry")}
              >
                <RotateCcw className="mr-1.5 size-4" />
                重试部署
              </Button>
            )}
            {deployment && isTerminal && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => onDelete(deployment.id)}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                删除记录
              </Button>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
