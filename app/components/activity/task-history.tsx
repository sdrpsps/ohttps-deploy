"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Ban,
  Clock,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Certificate, ManagedServer } from "@/components/console/types";
import type { Deployment, SyncJobItem } from "./types";
import {
  formatActivityDate,
  formatDuration,
  statusLabels,
  terminalStatuses,
  triggerLabels,
} from "./types";

type UnifiedTask = {
  kind: "deployment" | "sync";
  id: string;
  title?: string | null;
  certificateId?: string | null;
  certificateName?: string | null;
  domain?: string | null;
  trigger: string;
  status: string;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorSummary?: string | null;
  serverIds?: string[];
  phase?: string;
  rawDeployment?: Deployment;
  rawSyncJob?: SyncJobItem;
};

type TaskHistoryProps = {
  certificates: Certificate[];
  servers: ManagedServer[];
  deployments: Deployment[];
  syncJobs: SyncJobItem[];
  certificateId: string;
  serverId: string;
  status: string;
  from: string;
  onCertificateChange: (id: string) => void;
  onServerChange: (id: string) => void;
  onStatusChange: (status: string) => void;
  onFromChange: (value: string) => void;
  onOpenDeployment: (id: string) => void;
  onOpenSyncJob: (id: string) => void;
  onDeploymentAction: (id: string, action: "retry" | "cancel") => void;
  onClearFailed?: () => void;
};

export function TaskHistory({
  certificates,
  servers,
  deployments,
  syncJobs,
  certificateId,
  serverId,
  status,
  from,
  onCertificateChange,
  onServerChange,
  onStatusChange,
  onFromChange,
  onOpenDeployment,
  onOpenSyncJob,
  onDeploymentAction,
  onClearFailed,
}: TaskHistoryProps) {
  const [taskKind, setTaskKind] = useState<"all" | "deployment" | "sync">("all");
  const [keyword, setKeyword] = useState("");

  const serverMap = useMemo(
    () => new Map(servers.map((s) => [s.id, s.name])),
    [servers]
  );

  // 统一聚合任务
  const unifiedTasks: UnifiedTask[] = useMemo(() => {
    const list: UnifiedTask[] = [];

    if (taskKind === "all" || taskKind === "deployment") {
      for (const d of deployments) {
        list.push({
          kind: "deployment",
          id: d.id,
          title: d.title,
          certificateId: d.certificateId,
          certificateName: d.certificateName,
          domain: d.domain,
          trigger: d.trigger,
          status: d.status,
          createdAt: d.createdAt,
          startedAt: d.startedAt,
          finishedAt: d.finishedAt,
          errorSummary: d.errorSummary,
          serverIds: d.serverIds,
          rawDeployment: d,
        });
      }
    }

    if (taskKind === "all" || taskKind === "sync") {
      for (const s of syncJobs) {
        list.push({
          kind: "sync",
          id: s.id,
          certificateId: s.certificateId,
          certificateName: s.certificateName,
          trigger: s.trigger,
          status: s.status,
          phase: s.phase,
          createdAt: s.createdAt,
          startedAt: s.startedAt,
          finishedAt: s.finishedAt,
          errorSummary: s.errorSummary,
          rawSyncJob: s,
        });
      }
    }

    // 按创建时间倒序
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [deployments, syncJobs, taskKind]);

  // 综合筛选
  const filteredTasks = useMemo(() => {
    return unifiedTasks.filter((item) => {
      if (certificateId && item.certificateId !== certificateId) return false;
      if (serverId) {
        if (item.kind !== "deployment") return false;
        if (!item.serverIds?.includes(serverId)) return false;
      }
      if (status && status !== "all") {
        if (status === "failed") {
          if (item.status !== "failed" && item.status !== "partial") return false;
        } else if (status === "running") {
          if (item.status !== "running" && item.status !== "queued") return false;
        } else if (item.status !== status) {
          return false;
        }
      }
      if (from) {
        const fromDate = new Date(`${from}T00:00:00`);
        if (new Date(item.createdAt) < fromDate) return false;
      }
      if (keyword.trim()) {
        const kw = keyword.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(kw) ?? false;
        const matchesName = item.certificateName?.toLowerCase().includes(kw) ?? false;
        const matchesDomain = item.domain?.toLowerCase().includes(kw) ?? false;
        const matchesErr = item.errorSummary?.toLowerCase().includes(kw) ?? false;
        const matchesServer =
          item.serverIds?.some((sid) =>
            serverMap.get(sid)?.toLowerCase().includes(kw)
          ) ?? false;
        const matchesCerts =
          item.rawDeployment?.certificates?.some(
            (c) => c.name.toLowerCase().includes(kw) || c.domain.toLowerCase().includes(kw)
          ) ?? false;
        if (!matchesTitle && !matchesName && !matchesDomain && !matchesErr && !matchesServer && !matchesCerts) {
          return false;
        }
      }
      return true;
    });
  }, [unifiedTasks, certificateId, serverId, status, from, keyword, serverMap]);

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">任务中心</CardTitle>
            <CardDescription className="text-xs">
              包含所有证书同步与服务器安全部署记录，支持精准过滤与一键重试。
            </CardDescription>
          </div>
          {/* 类型快捷切换 */}
          <div className="flex rounded-lg border bg-muted/60 p-1 text-xs">
            <button
              type="button"
              className={`rounded-md px-3 py-1 font-medium transition-all ${
                taskKind === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTaskKind("all")}
            >
              全部任务 ({deployments.length + syncJobs.length})
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 font-medium transition-all ${
                taskKind === "deployment"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTaskKind("deployment")}
            >
              部署记录 ({deployments.length})
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 font-medium transition-all ${
                taskKind === "sync"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTaskKind("sync")}
            >
              证书同步 ({syncJobs.length})
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 筛选过滤工具栏 */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* 关键字模糊搜 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="搜索证书/域名/错误…"
              className="pl-8 text-xs h-9"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          {/* 证书筛选 */}
          <Select
            value={certificateId || "all"}
            onValueChange={(val) => onCertificateChange(val === "all" ? "" : val)}
          >
            <SelectTrigger className="text-xs h-9">
              <SelectValue placeholder="按证书筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有证书</SelectItem>
              {certificates.map((cert) => (
                <SelectItem key={cert.id} value={cert.id}>
                  {cert.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 服务器筛选 */}
          <Select
            value={serverId || "all"}
            onValueChange={(val) => onServerChange(val === "all" ? "" : val)}
          >
            <SelectTrigger className="text-xs h-9">
              <SelectValue placeholder="按服务器筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有服务器</SelectItem>
              {servers.map((srv) => (
                <SelectItem key={srv.id} value={srv.id}>
                  {srv.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 状态筛选 */}
          <Select
            value={status || "all"}
            onValueChange={(val) => onStatusChange(val === "all" ? "" : val)}
          >
            <SelectTrigger className="text-xs h-9">
              <SelectValue placeholder="按状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有状态</SelectItem>
              <SelectItem value="failed">仅看异常 / 失败</SelectItem>
              <SelectItem value="running">运行中 / 排队中</SelectItem>
              <SelectItem value="succeeded">成功</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>

          {/* 起始日期 */}
          <Input
            type="date"
            className="text-xs h-9"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            aria-label="起始日期"
          />

          {onClearFailed && unifiedTasks.some((t) => t.kind === "deployment" && (t.status === "failed" || t.status === "partial")) && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-9 text-muted-foreground hover:text-destructive shrink-0"
              onClick={onClearFailed}
              title="一键清空所有历史失败部署记录"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              清空失败记录
            </Button>
          )}
        </div>

        {/* 任务表格 */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[85px]">类型</TableHead>
                <TableHead>任务对象 / 证书</TableHead>
                <TableHead>目标节点 / 阶段</TableHead>
                <TableHead>触发来源</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>耗时 / 时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((task) => (
                <TaskRow
                  key={`${task.kind}-${task.id}`}
                  task={task}
                  serverMap={serverMap}
                  onOpenDeployment={onOpenDeployment}
                  onOpenSyncJob={onOpenSyncJob}
                  onDeploymentAction={onDeploymentAction}
                />
              ))}
              {filteredTasks.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-28 text-center text-xs text-muted-foreground"
                  >
                    没有找到符合条件的任务记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskRow({
  task,
  serverMap,
  onOpenDeployment,
  onOpenSyncJob,
  onDeploymentAction,
}: {
  task: UnifiedTask;
  serverMap: Map<string, string>;
  onOpenDeployment: (id: string) => void;
  onOpenSyncJob: (id: string) => void;
  onDeploymentAction: (id: string, action: "retry" | "cancel") => void;
}) {
  const isTerminal = terminalStatuses.has(task.status);
  const isFailed = task.status === "failed" || task.status === "partial";
  const duration = formatDuration(task.startedAt, task.finishedAt);

  return (
    <TableRow className={isFailed ? "bg-destructive/5 hover:bg-destructive/10" : ""}>
      {/* 类型 Badge */}
      <TableCell className="font-medium text-xs">
        {task.kind === "deployment" ? (
          <Badge
            variant="outline"
            className="border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px]"
          >
            部署
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[11px]"
          >
            同步
          </Badge>
        )}
      </TableCell>

      {/* 任务对象 / 证书 */}
      <TableCell>
        <div className="font-medium text-xs text-foreground flex items-center gap-1.5 flex-wrap">
          <span>{task.title ?? task.certificateName ?? "未命名任务"}</span>
          {task.rawDeployment?.certificates && task.rawDeployment.certificates.length > 1 && (
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 py-0 px-1 font-normal">
              {task.rawDeployment.certificates.length} 张证书
            </Badge>
          )}
        </div>
        {task.rawDeployment?.certificates && task.rawDeployment.certificates.length > 1 ? (
          <div className="text-[11px] text-muted-foreground font-mono truncate max-w-sm" title={task.rawDeployment.certificates.map((c) => c.domain).join(", ")}>
            {task.rawDeployment.certificates.map((c) => c.domain).join(", ")}
          </div>
        ) : task.domain ? (
          <div className="text-[11px] text-muted-foreground font-mono">
            {task.domain}
          </div>
        ) : null}
        {/* 若任务失败，直接醒目展示错误摘要，无需多次点击 */}
        {isFailed && task.errorSummary && (
          <div className="mt-1 flex items-start gap-1 text-[11px] text-destructive bg-destructive/10 px-2 py-0.5 rounded max-w-md">
            <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
            <span className="truncate">{task.errorSummary}</span>
          </div>
        )}
      </TableCell>

      {/* 目标节点 / 阶段 */}
      <TableCell className="text-xs">
        {task.kind === "deployment" ? (
          <div>
            {task.serverIds && task.serverIds.length > 0 ? (
              <div className="flex flex-wrap gap-1 max-w-xs">
                {task.serverIds.map((sid) => (
                  <Badge
                    key={sid}
                    variant="secondary"
                    className="text-[10px] font-normal px-1.5 py-0"
                  >
                    {serverMap.get(sid) ?? sid.slice(0, 8)}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">全部受管节点</span>
            )}
          </div>
        ) : (
          <div className="text-muted-foreground text-[11px]">
            {task.phase ? `阶段: ${task.phase}` : "ohttps 远端同步"}
          </div>
        )}
      </TableCell>

      {/* 触发来源 */}
      <TableCell className="text-xs text-muted-foreground">
        {triggerLabels[task.trigger] ?? task.trigger}
      </TableCell>

      {/* 状态 */}
      <TableCell>
        <Badge
          variant={
            task.status === "succeeded"
              ? "default"
              : isFailed
              ? "destructive"
              : "secondary"
          }
          className="text-[11px]"
        >
          {statusLabels[task.status] ?? task.status}
        </Badge>
      </TableCell>

      {/* 耗时与时间 */}
      <TableCell className="text-xs">
        <div className="text-foreground">{formatActivityDate(task.createdAt)}</div>
        {duration && (
          <div className="text-[11px] text-muted-foreground font-mono">
            耗时 {duration}
          </div>
        )}
      </TableCell>

      {/* 操作按钮 */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {task.kind === "deployment" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onOpenDeployment(task.id)}
              >
                详情
              </Button>
              {!isTerminal && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => onDeploymentAction(task.id, "cancel")}
                >
                  <Ban className="size-3 mr-1" />
                  取消
                </Button>
              )}
              {isTerminal && isFailed && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                  onClick={() => onDeploymentAction(task.id, "retry")}
                >
                  <RotateCcw className="size-3 mr-1" />
                  重试
                </Button>
              )}
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onOpenSyncJob(task.id)}
            >
              查看
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
