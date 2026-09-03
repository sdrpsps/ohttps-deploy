import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AuditEntry, Deployment, SyncJobItem } from "./types";
import { actionLabels, formatRelativeTime } from "./types";

type ActivityMetricsProps = {
  deployments: Deployment[];
  syncJobs: SyncJobItem[];
  auditEvents: AuditEntry[];
  onFilterFailed: () => void;
  onFilterActive: () => void;
};

export function ActivityMetrics({
  deployments,
  syncJobs,
  auditEvents,
  onFilterFailed,
  onFilterActive,
}: ActivityMetricsProps) {
  const stats = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const failedDeployments = deployments.filter(
      (d) => d.status === "failed" || d.status === "partial"
    ).length;
    const failedSyncs = syncJobs.filter((s) => s.status === "failed").length;
    const totalFailed = failedDeployments + failedSyncs;

    const runningDeployments = deployments.filter(
      (d) => d.status === "running" || d.status === "queued"
    ).length;
    const runningSyncs = syncJobs.filter(
      (s) => s.status === "running" || s.status === "queued"
    ).length;
    const totalActive = runningDeployments + runningSyncs;

    const recentDeployments = deployments.filter(
      (d) => new Date(d.createdAt).getTime() >= oneDayAgo
    );
    const recentSyncs = syncJobs.filter(
      (s) => new Date(s.createdAt).getTime() >= oneDayAgo
    );
    const total24h = recentDeployments.length + recentSyncs.length;

    const succeeded24h =
      recentDeployments.filter((d) => d.status === "succeeded").length +
      recentSyncs.filter((s) => s.status === "succeeded").length;

    const successRate = total24h > 0 ? Math.round((succeeded24h / total24h) * 100) : 100;

    const latestAudit = auditEvents[0] ?? null;

    return {
      totalFailed,
      totalActive,
      total24h,
      successRate,
      latestAudit,
    };
  }, [deployments, syncJobs, auditEvents]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. 异常预警卡片 */}
      <Card
        className={
          stats.totalFailed > 0
            ? "border-destructive/40 bg-destructive/5"
            : "border-border/60 bg-card"
        }
      >
        <CardContent className="flex items-center justify-between p-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">异常 / 失败任务</p>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold tracking-tight ${
                  stats.totalFailed > 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {stats.totalFailed}
              </span>
              <span className="text-xs text-muted-foreground">项需关注</span>
            </div>
          </div>
          {stats.totalFailed > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
              onClick={onFilterFailed}
            >
              <AlertTriangle className="mr-1 size-3.5" />
              查看异常
            </Button>
          ) : (
            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600">
              <CheckCircle2 className="size-5" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. 正在执行卡片 */}
      <Card className="border-border/60 bg-card">
        <CardContent className="flex items-center justify-between p-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">运行中 / 排队中</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {stats.totalActive}
              </span>
              <span className="text-xs text-muted-foreground">个后台任务</span>
            </div>
          </div>
          {stats.totalActive > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-primary/30 text-xs text-primary hover:bg-primary/10"
              onClick={onFilterActive}
            >
              <Loader2 className="mr-1 size-3.5 animate-spin" />
              查看进度
            </Button>
          ) : (
            <Badge variant="secondary" className="font-normal text-muted-foreground">
              全部空闲
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* 3. 24 小时执行量与成功率 */}
      <Card className="border-border/60 bg-card">
        <CardContent className="flex items-center justify-between p-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">近 24 小时执行</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {stats.total24h}
              </span>
              <span className="text-xs text-muted-foreground">次任务</span>
              {stats.total24h > 0 && (
                <Badge
                  variant={stats.successRate === 100 ? "default" : "destructive"}
                  className="ml-1 text-[11px] font-normal"
                >
                  {stats.successRate}% 成功
                </Badge>
              )}
            </div>
          </div>
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <Zap className="size-5" />
          </div>
        </CardContent>
      </Card>

      {/* 4. 最近操作审计 */}
      <Card className="border-border/60 bg-card">
        <CardContent className="flex items-center justify-between p-4">
          <div className="space-y-1 min-w-0 pr-2">
            <p className="text-xs font-medium text-muted-foreground">最近运维操作</p>
            {stats.latestAudit ? (
              <div>
                <p className="truncate text-sm font-medium text-foreground">
                  {actionLabels[stats.latestAudit.action] ?? stats.latestAudit.action}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(stats.latestAudit.createdAt)} · {stats.latestAudit.actor}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">暂无操作记录</p>
            )}
          </div>
          <div className="shrink-0 rounded-full bg-muted p-2 text-muted-foreground">
            <ShieldCheck className="size-5" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
