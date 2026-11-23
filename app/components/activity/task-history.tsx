"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  formatTaskError,
  statusLabels,
  syncPhaseLabels,
  triggerLabels,
} from "./types";

function matchesStatusFilter(itemStatus: string, filterStatus: string): boolean {
  if (!filterStatus || filterStatus === "all") return true;
  if (filterStatus === "failed") return itemStatus === "failed" || itemStatus === "partial";
  if (filterStatus === "running") return itemStatus === "running" || itemStatus === "queued";
  return itemStatus === filterStatus;
}

function matchesFromDate(createdAt: string, from: string): boolean {
  if (!from) return true;
  const fromDate = new Date(`${from}T00:00:00`);
  return new Date(createdAt) >= fromDate;
}

function StatusBadge({ status }: { status: string }) {
  const isFailed = status === "failed" || status === "partial";
  return (
    <Badge
      variant={status === "succeeded" ? "default" : isFailed ? "destructive" : "secondary"}
      className="text-[11px]"
    >
      {statusLabels[status] ?? status}
    </Badge>
  );
}

type DeploymentHistoryProps = {
  certificates: Certificate[];
  servers: ManagedServer[];
  deployments: Deployment[];
  certificateId: string;
  serverId: string;
  status: string;
  from: string;
  onCertificateChange: (id: string) => void;
  onServerChange: (id: string) => void;
  onStatusChange: (status: string) => void;
  onFromChange: (value: string) => void;
  onOpenDeployment: (id: string) => void;
  onClearFailed?: () => void;
};

export function DeploymentHistory({
  certificates,
  servers,
  deployments,
  certificateId,
  serverId,
  status,
  from,
  onCertificateChange,
  onServerChange,
  onStatusChange,
  onFromChange,
  onOpenDeployment,
  onClearFailed,
}: DeploymentHistoryProps) {
  const [keyword, setKeyword] = useState("");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const serverMap = useMemo(
    () => new Map(servers.map((s) => [s.id, s.name])),
    [servers]
  );

  const failedDeploymentCount = useMemo(
    () => deployments.filter((d) => d.status === "failed" || d.status === "partial").length,
    [deployments]
  );

  const filteredDeployments = useMemo(() => {
    const sorted = [...deployments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const kw = keyword.trim().toLowerCase();

    return sorted.filter((d) => {
      if (certificateId) {
        const matchesCertId =
          d.certificateId === certificateId ||
          d.certificates?.some((c) => c.id === certificateId);
        if (!matchesCertId) return false;
      }
      if (serverId && !d.serverIds?.includes(serverId)) return false;
      if (!matchesStatusFilter(d.status, status)) return false;
      if (!matchesFromDate(d.createdAt, from)) return false;

      if (kw) {
        const matchesTitle = d.title?.toLowerCase().includes(kw) ?? false;
        const matchesName = d.certificateName?.toLowerCase().includes(kw) ?? false;
        const matchesDomain = d.domain?.toLowerCase().includes(kw) ?? false;
        const matchesErr = d.errorSummary?.toLowerCase().includes(kw) ?? false;
        const matchesServer =
          d.serverIds?.some((sid) => serverMap.get(sid)?.toLowerCase().includes(kw)) ?? false;
        const matchesCerts =
          d.certificates?.some(
            (c) => c.name.toLowerCase().includes(kw) || c.domain.toLowerCase().includes(kw)
          ) ?? false;
        if (!matchesTitle && !matchesName && !matchesDomain && !matchesErr && !matchesServer && !matchesCerts) {
          return false;
        }
      }
      return true;
    });
  }, [deployments, certificateId, serverId, status, from, keyword, serverMap]);

  const hasActiveFilters = Boolean(keyword || certificateId || serverId || status || from);

  const resetFilters = () => {
    setKeyword("");
    onCertificateChange("");
    onServerChange("");
    onStatusChange("");
    onFromChange("");
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-3 border-b px-4 py-3.5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid flex-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索任务/证书/节点/错误…"
                  className="h-8 pl-8 text-xs"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>

              <Select
                value={certificateId || "all"}
                onValueChange={(val) => onCertificateChange(val === "all" ? "" : val)}
              >
                <SelectTrigger className="h-8 text-xs">
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

              <Select
                value={serverId || "all"}
                onValueChange={(val) => onServerChange(val === "all" ? "" : val)}
              >
                <SelectTrigger className="h-8 text-xs">
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

              <Select
                value={status || "all"}
                onValueChange={(val) => onStatusChange(val === "all" ? "" : val)}
              >
                <SelectTrigger className="h-8 text-xs">
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

              <Input
                type="date"
                className="h-8 text-xs"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
                aria-label="起始日期"
              />
            </div>

            {(hasActiveFilters || (onClearFailed && failedDeploymentCount > 0)) && (
              <div className="flex shrink-0 items-center gap-2">
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={resetFilters}
                  >
                    <X className="size-3.5" />
                    重置
                  </Button>
                )}
                {onClearFailed && failedDeploymentCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmClearOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    清空失败记录 ({failedDeploymentCount})
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table className="min-w-[880px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="min-w-[180px] text-xs font-semibold">任务名称</TableHead>
                <TableHead className="min-w-[200px] text-xs font-semibold">关联证书</TableHead>
                <TableHead className="min-w-[160px] text-xs font-semibold">目标服务器</TableHead>
                <TableHead className="w-[100px] text-xs font-semibold">触发来源</TableHead>
                <TableHead className="w-[90px] text-xs font-semibold">状态</TableHead>
                <TableHead className="w-[160px] text-xs font-semibold">耗时 / 时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeployments.map((deployment) => {
                const isFailed = deployment.status === "failed" || deployment.status === "partial";
                const duration = formatDuration(deployment.startedAt, deployment.finishedAt);
                const formattedError = formatTaskError(deployment.errorSummary);
                const certs = deployment.certificates ?? [];
                const displayTitle =
                  deployment.title ??
                  (deployment.certificateName ? `${deployment.certificateName} 证书部署` : "证书部署");

                return (
                  <TableRow
                    key={deployment.id}
                    onClick={() => onOpenDeployment(deployment.id)}
                    className={`cursor-pointer ${
                      isFailed ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/40"
                    }`}
                  >
                    <TableCell className="max-w-[260px] break-words">
                      <div className="text-xs font-medium text-foreground">{displayTitle}</div>
                      {isFailed && formattedError && (
                        <div className="mt-1 flex max-w-xs items-start gap-1 rounded bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                          <span className="truncate">{formattedError}</span>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="max-w-[260px]">
                      {certs.length > 1 ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="truncate font-medium text-foreground">{certs[0].name}</span>
                            <Badge variant="outline" className="border-primary/30 px-1 py-0 text-[10px] font-normal text-primary">
                              {certs.length} 张
                            </Badge>
                          </div>
                          <div
                            className="truncate font-mono text-[11px] text-muted-foreground"
                            title={certs.map((c) => c.domain).join(", ")}
                          >
                            {certs.map((c) => c.domain).join(", ")}
                          </div>
                        </div>
                      ) : certs.length === 1 || deployment.certificateName || deployment.domain ? (
                        <div className="space-y-0.5">
                          <div className="truncate text-xs font-medium text-foreground">
                            {certs[0]?.name ?? deployment.certificateName ?? "—"}
                          </div>
                          {(certs[0]?.domain ?? deployment.domain) && (
                            <div className="truncate font-mono text-[11px] text-muted-foreground">
                              {certs[0]?.domain ?? deployment.domain}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs">
                      {deployment.serverIds && deployment.serverIds.length > 0 ? (
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {deployment.serverIds.map((sid) => (
                            <Badge
                              key={sid}
                              variant="secondary"
                              className="max-w-[160px] px-1.5 py-0 text-[10px] font-normal"
                            >
                              <span className="truncate" title={serverMap.get(sid) ?? sid}>
                                {serverMap.get(sid) ?? sid.slice(0, 8)}
                              </span>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">全部节点</span>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {triggerLabels[deployment.trigger] ?? deployment.trigger}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={deployment.status} />
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-xs">
                      <div className="text-foreground">{formatActivityDate(deployment.createdAt)}</div>
                      {duration && (
                        <div className="font-mono text-[11px] text-muted-foreground">
                          耗时 {duration}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {filteredDeployments.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-xs text-muted-foreground"
                  >
                    没有找到符合条件的部署记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">确认清空失败记录？</DialogTitle>
            <DialogDescription className="pt-1 text-xs">
              将删除全部 <strong className="text-foreground">{failedDeploymentCount} 条</strong>{" "}
              历史失败部署记录及其对应日志，且不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setConfirmClearOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmClearOpen(false);
                onClearFailed?.();
              }}
            >
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type SyncJobHistoryProps = {
  certificates: Certificate[];
  syncJobs: SyncJobItem[];
  certificateId: string;
  status: string;
  from: string;
  onCertificateChange: (id: string) => void;
  onStatusChange: (status: string) => void;
  onFromChange: (value: string) => void;
  onOpenSyncJob: (id: string) => void;
};

export function SyncJobHistory({
  certificates,
  syncJobs,
  certificateId,
  status,
  from,
  onCertificateChange,
  onStatusChange,
  onFromChange,
  onOpenSyncJob,
}: SyncJobHistoryProps) {
  const [keyword, setKeyword] = useState("");

  const certDomainMap = useMemo(
    () => new Map(certificates.map((c) => [c.id, c.domain])),
    [certificates]
  );

  const filteredJobs = useMemo(() => {
    const sorted = [...syncJobs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const kw = keyword.trim().toLowerCase();

    return sorted.filter((job) => {
      if (certificateId && job.certificateId !== certificateId) return false;
      if (!matchesStatusFilter(job.status, status)) return false;
      if (!matchesFromDate(job.createdAt, from)) return false;

      if (kw) {
        const domain = certDomainMap.get(job.certificateId) ?? "";
        const matchesName = job.certificateName.toLowerCase().includes(kw);
        const matchesDomain = domain.toLowerCase().includes(kw);
        const matchesErr = job.errorSummary?.toLowerCase().includes(kw) ?? false;
        if (!matchesName && !matchesDomain && !matchesErr) return false;
      }
      return true;
    });
  }, [syncJobs, certificateId, status, from, keyword, certDomainMap]);

  const hasActiveFilters = Boolean(keyword || certificateId || status || from);

  const resetFilters = () => {
    setKeyword("");
    onCertificateChange("");
    onStatusChange("");
    onFromChange("");
  };

  return (
    <Card>
      <CardHeader className="space-y-3 border-b px-4 py-3.5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid flex-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索证书/域名/错误…"
                className="h-8 pl-8 text-xs"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <Select
              value={certificateId || "all"}
              onValueChange={(val) => onCertificateChange(val === "all" ? "" : val)}
            >
              <SelectTrigger className="h-8 text-xs">
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

            <Select
              value={status || "all"}
              onValueChange={(val) => onStatusChange(val === "all" ? "" : val)}
            >
              <SelectTrigger className="h-8 text-xs">
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

            <Input
              type="date"
              className="h-8 text-xs"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              aria-label="起始日期"
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1 self-start px-2 text-xs text-muted-foreground hover:text-foreground lg:self-auto"
              onClick={resetFilters}
            >
              <X className="size-3.5" />
              重置
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table className="min-w-[820px]">
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="min-w-[200px] text-xs font-semibold">证书名称</TableHead>
              <TableHead className="min-w-[180px] text-xs font-semibold">绑定域名</TableHead>
              <TableHead className="w-[140px] text-xs font-semibold">同步阶段</TableHead>
              <TableHead className="w-[100px] text-xs font-semibold">触发来源</TableHead>
              <TableHead className="w-[90px] text-xs font-semibold">状态</TableHead>
              <TableHead className="w-[160px] text-xs font-semibold">耗时 / 时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredJobs.map((job) => {
              const isFailed = job.status === "failed";
              const duration = formatDuration(job.startedAt, job.finishedAt);
              const formattedError = formatTaskError(job.errorSummary);
              const domain = certDomainMap.get(job.certificateId);

              return (
                <TableRow
                  key={job.id}
                  onClick={() => onOpenSyncJob(job.id)}
                  className={`cursor-pointer ${
                    isFailed ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/40"
                  }`}
                >
                  <TableCell className="max-w-[280px] break-words">
                    <div className="text-xs font-medium text-foreground">{job.certificateName}</div>
                    {isFailed && formattedError && (
                      <div className="mt-1 flex max-w-xs items-start gap-1 rounded bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        <span className="truncate">{formattedError}</span>
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                    {domain ?? "—"}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {job.phase ? syncPhaseLabels[job.phase] ?? job.phase : "—"}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {triggerLabels[job.trigger] ?? job.trigger}
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-xs">
                    <div className="text-foreground">{formatActivityDate(job.createdAt)}</div>
                    {duration && (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        耗时 {duration}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

            {filteredJobs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-28 text-center text-xs text-muted-foreground"
                >
                  没有找到符合条件的同步记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
