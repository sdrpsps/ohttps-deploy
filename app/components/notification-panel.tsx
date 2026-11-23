"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Settings2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/console/dashboard-skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Certificate } from "@/components/console/types";
import { formatDateTime } from "@/lib/utils";
import { getApiData, queryKeys } from "@/lib/api";

type Notification = {
  id: string;
  eventType: string;
  objectType: string;
  objectId: string | null;
  status: string;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
};

type NotificationFilter = "all" | "delivered" | "failed" | "pending";

type NotificationPanelProps = {
  certificates?: Certificate[];
  deployments?: Array<{
    id: string;
    title?: string | null;
    certificateName?: string | null;
    domain?: string | null;
  }>;
  webhookConfigured?: boolean;
  onConfigureSettings?: () => void;
};

const eventTypeLabels: Record<string, string> = {
  "certificate.cache_missing": "证书缓存缺失",
  "certificate.expired": "证书已过期",
  "certificate.expiring": "证书即将过期",
  "certificate.recovered": "证书状态已恢复",
  "certificate.sync_recovered": "证书同步已恢复",
  "certificate.synced": "证书同步成功",
  "certificate.sync_failed": "证书同步失败",
  "deployment.succeeded": "证书部署成功",
  "deployment.partial": "部署部分失败",
  "deployment.failed": "证书部署失败",
  "notification.test": "Bark 测试通知",
};

export function NotificationPanel({
  certificates = [],
  deployments = [],
  webhookConfigured = true,
  onConfigureSettings,
}: NotificationPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<NotificationFilter>("all");

  const { data: rows = [], isLoading, isRefetching } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => getApiData<Notification[]>("/api/notifications"),
  });

  const certMap = useMemo(
    () => new Map(certificates.map((c) => [c.id, c])),
    [certificates]
  );

  const depMap = useMemo(
    () => new Map(deployments.map((d) => [d.id, d])),
    [deployments]
  );

  const counts = useMemo(() => {
    let delivered = 0;
    let failed = 0;
    let pending = 0;

    for (const item of rows) {
      if (item.status === "delivered") delivered++;
      else if (item.status === "failed") failed++;
      else pending++;
    }

    return { all: rows.length, delivered, failed, pending };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "delivered") return rows.filter((r) => r.status === "delivered");
    if (statusFilter === "failed") return rows.filter((r) => r.status === "failed");
    if (statusFilter === "pending") return rows.filter((r) => r.status !== "delivered" && r.status !== "failed");
    return rows;
  }, [rows, statusFilter]);

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "重试投递请求失败");
      }
      toast.success("已加入立即重试队列");
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重试投递失败");
    } finally {
      setRetryingId(null);
    }
  }

  function renderObjectCell(row: Notification) {
    if (row.objectType === "notification") {
      return <span className="text-xs text-muted-foreground">系统测试消息</span>;
    }

    if (row.objectType === "certificate" && row.objectId) {
      const cert = certMap.get(row.objectId);
      if (cert) {
        return (
          <button
            type="button"
            onClick={() => router.push("/certificates")}
            className="group space-y-0.5 text-left"
          >
            <div className="text-xs font-medium text-foreground group-hover:text-primary group-hover:underline">
              {cert.name}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">{cert.domain}</div>
          </button>
        );
      }
      return (
        <span className="font-mono text-xs text-muted-foreground">
          证书 #{row.objectId.slice(0, 8)}
        </span>
      );
    }

    if (row.objectType === "deployment" && row.objectId) {
      const dep = depMap.get(row.objectId);
      return (
        <button
          type="button"
          onClick={() => router.push(`/activity?deploymentId=${row.objectId}`)}
          className="group inline-flex items-center gap-1 text-left text-xs font-medium text-foreground hover:text-primary hover:underline"
        >
          <span>{dep?.title ?? dep?.certificateName ?? `部署任务 #${row.objectId.slice(0, 8)}`}</span>
          <ExternalLink className="size-3 text-muted-foreground group-hover:text-primary" />
        </button>
      );
    }

    return (
      <span className="font-mono text-xs text-muted-foreground">
        {row.objectType}
        {row.objectId ? ` #${row.objectId.slice(0, 8)}` : ""}
      </span>
    );
  }

  if (isLoading) return <DashboardSkeleton section="notifications" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                statusFilter === "all"
                  ? "bg-primary font-medium text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span>全部</span>
              <span className="font-mono text-[10px] opacity-80">{counts.all}</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("delivered")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                statusFilter === "delivered"
                  ? "bg-emerald-600 font-medium text-white"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>投递成功</span>
              <span className="font-mono text-[10px] opacity-80">{counts.delivered}</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("failed")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                statusFilter === "failed"
                  ? "bg-rose-600 font-medium text-white"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="size-1.5 rounded-full bg-rose-500" />
              <span>投递失败</span>
              <span className="font-mono text-[10px] opacity-80">{counts.failed}</span>
            </button>

            {counts.pending > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("pending")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                  statusFilter === "pending"
                    ? "bg-amber-600 font-medium text-white"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span>重试排队中</span>
                <span className="font-mono text-[10px] opacity-80">{counts.pending}</span>
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onConfigureSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={onConfigureSettings}
                className="h-8 gap-1.5 text-xs"
              >
                <Settings2 className="size-3.5" />
                <span>Bark 设置</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || isRefetching}
              onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications })}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`size-3.5 ${isRefetching ? "animate-spin" : ""}`} />
              <span>刷新</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table className="min-w-[740px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[22%] text-xs font-semibold">通知事件</TableHead>
                <TableHead className="w-[22%] text-xs font-semibold">关联对象</TableHead>
                <TableHead className="w-[14%] text-xs font-semibold">投递状态</TableHead>
                <TableHead className="w-[10%] text-xs font-semibold">尝试</TableHead>
                <TableHead className="w-[22%] text-xs font-semibold">异常 / 下次重试</TableHead>
                <TableHead className="w-[10%] text-right text-xs font-semibold">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-44 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2.5">
                        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                          <Bell className="size-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">暂无推送记录</p>
                        {!webhookConfigured && onConfigureSettings && (
                          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onConfigureSettings}>
                            <Settings2 className="size-3.5" /> 配置 Bark 推送
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                      未找到符合筛选条件的通知记录
                    </TableCell>
                  </TableRow>
                )
              ) : (
                filteredRows.map((row) => {
                  const isDelivered = row.status === "delivered";
                  const isFailed = row.status === "failed";
                  const isRetrying = retryingId === row.id;

                  return (
                    <TableRow key={row.id} className="transition-colors hover:bg-muted/30">
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="text-xs font-medium text-foreground">
                            {eventTypeLabels[row.eventType] ?? row.eventType}
                          </div>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {formatDateTime(row.createdAt)}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell>{renderObjectCell(row)}</TableCell>

                      <TableCell>
                        {isDelivered ? (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5 text-emerald-500" />
                            已投递
                          </span>
                        ) : isFailed ? (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                            <XCircle className="size-3.5 text-rose-500" />
                            失败
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <Clock className="size-3.5 text-amber-500" />
                            排队重试
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[11px] font-normal">
                          {row.attempts} 次
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="max-w-xs space-y-1">
                          {row.lastError ? (
                            <p className="truncate font-mono text-[11px] text-destructive" title={row.lastError}>
                              {row.lastError}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                          {row.nextRetryAt && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                              <Clock className="size-3 shrink-0" />
                              <span>下次：{formatDateTime(row.nextRetryAt)}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        {!isDelivered && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isRetrying}
                            onClick={() => void retry(row.id)}
                            className="h-7 gap-1 px-2 text-xs"
                          >
                            {isRetrying ? (
                              <LoaderCircle className="size-3 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3" />
                            )}
                            <span>重试</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
