"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Ban,
  Check,
  Clock,
  Copy,
  ExternalLink,
  RotateCcw,
  Server,
  Shield,
  Terminal,
  Trash2,
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
import type { DeploymentDetail } from "./types";
import {
  formatActivityDate,
  formatDuration,
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
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [deployment?.logs.length, autoScroll]);

  if (!deployment) return null;

  const isTerminal = terminalStatuses.has(deployment.status);
  const duration = formatDuration(deployment.startedAt, deployment.finishedAt);

  const copyLogs = () => {
    const text = deployment.logs
      .map(
        (l) =>
          `[${formatActivityDate(l.createdAt)}] [${l.level.toUpperCase()}] ${l.message}`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("已复制任务执行日志");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <Badge
              variant={
                deployment.status === "succeeded"
                  ? "default"
                  : deployment.status === "failed"
                  ? "destructive"
                  : "secondary"
              }
            >
              {statusLabels[deployment.status] ?? deployment.status}
            </Badge>
            <SheetTitle className="text-base font-semibold truncate">
              {deployment.title ?? `部署任务：${deployment.certificateName}`}
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            {deployment.certificates && deployment.certificates.length > 1
              ? `分发 ${deployment.certificates.length} 张证书 · 任务 ID: ${deployment.id}`
              : `域名: ${deployment.domain} · 任务 ID: ${deployment.id}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-4">
          {/* 基本信息概览卡片 */}
          <Card className="border-border/70 bg-muted/40 shadow-none">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">触发方式</p>
                  <p className="mt-1 font-medium">
                    {triggerLabels[deployment.trigger] ?? deployment.trigger}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">耗时</p>
                  <p className="mt-1 font-medium">{duration ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">创建时间</p>
                  <p className="mt-1 font-medium">
                    {formatActivityDate(deployment.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">结束时间</p>
                  <p className="mt-1 font-medium">
                    {deployment.finishedAt
                      ? formatActivityDate(deployment.finishedAt)
                      : "进行中"}
                  </p>
                </div>
              </div>

              {deployment.syncJobId && (
                <div className="pt-2 border-t flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">关联证书同步任务</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs font-mono text-primary flex items-center gap-1"
                    onClick={() => {
                      onOpenChange(false);
                      onViewSyncJob?.(deployment.syncJobId!);
                    }}
                  >
                    {deployment.syncJobId.slice(0, 12)}…
                    <ExternalLink className="size-3" />
                  </Button>
                </div>
              )}

              {deployment.errorSummary && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <p className="font-semibold">失败原因：</p>
                  <p className="mt-0.5 whitespace-pre-wrap">{deployment.errorSummary}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 包含的证书列表 */}
          {deployment.certificates && deployment.certificates.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Shield className="size-3.5" />
                包含证书清单 ({deployment.certificates.length})
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {deployment.certificates.map((cert) => (
                  <div
                    key={cert.id}
                    className="rounded-lg border bg-card p-2.5 text-xs shadow-sm"
                  >
                    <div className="font-medium text-foreground truncate">{cert.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">{cert.domain}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 目标服务器列表 */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Server className="size-3.5" />
              受管服务器节点 ({deployment.targets.length})
            </h4>
            <div className="space-y-2">
              {deployment.targets.map((target) => (
                <div
                  key={target.id}
                  className="rounded-lg border bg-card p-3 text-xs space-y-1.5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {target.serverName}
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {target.host}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {target.exitCode !== null && (
                        <span
                          className={`font-mono text-[11px] ${
                            target.exitCode === 0
                              ? "text-emerald-600"
                              : "text-destructive font-semibold"
                          }`}
                        >
                          exit: {target.exitCode}
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
                        className="text-[10px] px-1.5 py-0"
                      >
                        {statusLabels[target.status] ?? target.status}
                      </Badge>
                    </div>
                  </div>
                  {target.errorSummary && (
                    <p className="mt-1 rounded bg-destructive/10 p-2 font-mono text-[11px] text-destructive whitespace-pre-wrap break-all">
                      {target.errorSummary}
                    </p>
                  )}
                </div>
              ))}
              {deployment.targets.length === 0 && (
                <p className="text-xs text-muted-foreground">暂无目标服务器记录</p>
              )}
            </div>
          </div>

          {/* 实时执行日志 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Terminal className="size-3.5" />
                执行日志 ({deployment.logs.length})
                {!isTerminal && (
                  <span className="flex items-center gap-1 text-[11px] font-normal text-primary lowercase tracking-normal">
                    <span className="size-1.5 rounded-full bg-primary animate-ping" />
                    实时流式输出中
                  </span>
                )}
              </h4>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-2 text-muted-foreground"
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  {autoScroll ? "自动滚动: 开" : "自动滚动: 关"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={copyLogs}
                  disabled={deployment.logs.length === 0}
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

            <div className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-100 shadow-inner">
              {deployment.logs.map((entry) => (
                <div
                  key={`${entry.sequence}-${entry.createdAt}`}
                  className="leading-relaxed py-0.5 flex gap-2 items-baseline"
                >
                  <span className="shrink-0 text-slate-500 select-none text-[11px]">
                    {formatActivityDate(entry.createdAt).split(" ")[1] ?? entry.createdAt}
                  </span>
                  <span
                    className={`shrink-0 font-semibold text-[10px] px-1 rounded ${
                      entry.level === "error"
                        ? "bg-red-500/20 text-red-300"
                        : entry.level === "warn"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {entry.level.toUpperCase()}
                  </span>
                  <span className="break-all whitespace-pre-wrap text-slate-200">
                    {entry.message}
                  </span>
                </div>
              ))}
              {deployment.logs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 text-slate-400 gap-2">
                  {!isTerminal ? (
                    <div className="flex items-center gap-2">
                      <span className="relative flex size-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs text-slate-300 font-sans">
                        {deployment.status === "queued"
                          ? "等待 Worker 接手任务中，即将开始执行…"
                          : "Worker 正在建立 SSH 连接并准备执行部署…"}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">暂无日志输出</p>
                  )}
                </div>
              )}
              {!isTerminal && deployment.logs.length > 0 && (
                <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-400 select-none">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>任务进行中，正在保持连接...</span>
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        <SheetFooter className="border-t pt-3 flex flex-row items-center justify-between sm:justify-between">
          <div className="flex items-center gap-2">
            {!isTerminal && onAction && (
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
            {isTerminal && deployment.status !== "succeeded" && onAction && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onAction(deployment.id, "retry")}
              >
                <RotateCcw className="mr-1.5 size-4" />
                重试部署
              </Button>
            )}
            {isTerminal && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive text-xs"
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
