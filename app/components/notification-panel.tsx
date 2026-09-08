"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

export function NotificationPanel() {
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<NotificationFilter>("all");

  const { data: rows = [], isLoading, isRefetching } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => getApiData<Notification[]>("/api/notifications"),
  });

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

  return (
    <div className="space-y-6">
      {/* 1. Header Overview Card */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Webhook className="size-5 text-primary" />
              <CardTitle className="text-lg font-semibold">系统通知与 Webhook</CardTitle>
            </div>
            <CardDescription className="text-xs">
              实时监控证书同步、SSH 部署与证书过期事件的签名 Webhook 投递记录，支持失败指数退避与手动重试
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || isRefetching}
              onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications })}
              className="gap-1.5 text-xs h-8"
            >
              <RefreshCw className={`size-3.5 ${isRefetching ? "animate-spin" : ""}`} />
              <span>刷新记录</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Status Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                statusFilter === "all"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span>全部通知</span>
              <span className="font-mono text-[10px] opacity-80">{counts.all}</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("delivered")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                statusFilter === "delivered"
                  ? "bg-emerald-600 text-white font-medium"
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
                  ? "bg-rose-600 text-white font-medium"
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
                    ? "bg-amber-600 text-white font-medium"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span>重试排队中</span>
                <span className="font-mono text-[10px] opacity-80">{counts.pending}</span>
              </button>
            )}
          </div>

          {/* Notifications Table */}
          <div className="rounded-lg border border-border/80 overflow-hidden">
            <Table className="min-w-[740px]">
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[22%] text-xs font-semibold">事件类型与时间</TableHead>
                  <TableHead className="w-[20%] text-xs font-semibold">关联业务对象</TableHead>
                  <TableHead className="w-[14%] text-xs font-semibold">投递状态</TableHead>
                  <TableHead className="w-[12%] text-xs font-semibold">尝试次数</TableHead>
                  <TableHead className="w-[22%] text-xs font-semibold">异常原因 / 下次重试</TableHead>
                  <TableHead className="w-[10%] text-right text-xs font-semibold">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                      正在加载通知日志...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-44 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                            <Bell className="size-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium">暂无 Webhook 通知记录</p>
                          <p className="text-xs text-muted-foreground">
                            在系统设置中配置 Webhook URL 后，所有证书同步与部署事件将自动签名投递。
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                        未找到符合筛选条件的通知记录。
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
                        {/* 1. Event Type & Time */}
                        <TableCell>
                          <div className="space-y-1">
                            <Badge
                              variant="outline"
                              className="border-border/80 bg-muted/20 font-mono text-[11px] font-medium"
                            >
                              {row.eventType}
                            </Badge>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {formatDateTime(row.createdAt)}
                            </p>
                          </div>
                        </TableCell>

                        {/* 2. Target Object */}
                        <TableCell>
                          <div className="font-mono text-xs text-foreground">
                            <span className="text-muted-foreground">{row.objectType}/</span>
                            <span className="font-medium">{row.objectId ?? "-"}</span>
                          </div>
                        </TableCell>

                        {/* 3. Status */}
                        <TableCell>
                          {isDelivered ? (
                            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="size-3.5 text-emerald-500" />
                              已成功投递
                            </span>
                          ) : isFailed ? (
                            <span className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium">
                              <XCircle className="size-3.5 text-rose-500" />
                              投递失败
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                              <Clock className="size-3.5 text-amber-500" />
                              排队重试中
                            </span>
                          )}
                        </TableCell>

                        {/* 4. Attempts */}
                        <TableCell>
                          <span className="font-mono text-xs text-foreground">
                            {row.attempts} 次尝试
                          </span>
                        </TableCell>

                        {/* 5. Error & Next Retry */}
                        <TableCell>
                          <div className="space-y-1 max-w-xs">
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

                        {/* 6. Action */}
                        <TableCell className="text-right">
                          {!isDelivered && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isRetrying}
                              onClick={() => void retry(row.id)}
                              className="h-7 px-2 text-xs gap-1 shadow-sm"
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
