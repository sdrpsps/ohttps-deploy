"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileCode,
  Filter,
  Globe,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { copyToClipboard, daysUntil, formatDate, formatDateTime } from "@/lib/utils";
import { NginxConfigDialog } from "./nginx-config-dialog";
import type { Certificate, DeleteTarget } from "./types";

type CertificatePanelProps = {
  certificates: Certificate[];
  jobs: Array<{
    id: string;
    certificateId: string;
    certificateName: string;
    trigger: string;
    status: string;
    errorSummary: string | null;
    createdAt: string;
  }>;
  loading: boolean;
  busy: boolean;
  onCreate: () => void;
  onEdit: (certificate: Certificate) => void;
  onRefresh: (id: string) => void;
  onDeploy: (id: string) => void;
  onDeployAll?: () => void;
  onDelete: (target: DeleteTarget) => void;
  ohttpsConfigured: boolean;
  onViewSyncJob: (id: string) => void;
  onConfigureSettings: () => void;
};

type FilterStatus = "all" | "active" | "expiring" | "disabled";

export function CertificatePanel({
  certificates,
  jobs,
  loading,
  busy,
  onCreate,
  onEdit,
  onRefresh,
  onDeploy,
  onDeployAll,
  onDelete,
  ohttpsConfigured,
  onViewSyncJob,
  onConfigureSettings,
}: CertificatePanelProps) {
  const [confirming, setConfirming] = useState<Certificate | null>(null);
  const [confirmDeployAll, setConfirmDeployAll] = useState(false);
  const [nginxConfigCert, setNginxConfigCert] = useState<Certificate | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const hasDeployableCerts = certificates.some((c) => Boolean(c.currentVersionId));
  const deployableCount = certificates.filter((c) => Boolean(c.currentVersionId && c.status === "active")).length;

  const counts = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let disabled = 0;

    for (const cert of certificates) {
      if (cert.status === "disabled") {
        disabled++;
      } else {
        const days = daysUntil(cert.expiresAt);
        if (days !== null && days <= cert.renewBeforeDays) {
          expiring++;
        } else {
          active++;
        }
      }
    }
    return { all: certificates.length, active, expiring, disabled };
  }, [certificates]);

  const filteredCertificates = useMemo(() => {
    return certificates.filter((cert) => {
      // 1. Search filter
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matchesName = cert.name.toLowerCase().includes(query);
        const matchesDomain = cert.domain.toLowerCase().includes(query);
        const matchesId = cert.ohttpsCertificateId.toLowerCase().includes(query);
        if (!matchesName && !matchesDomain && !matchesId) return false;
      }

      // 2. Status filter
      if (statusFilter === "disabled") return cert.status === "disabled";
      if (statusFilter === "expiring") {
        const days = daysUntil(cert.expiresAt);
        return cert.status !== "disabled" && days !== null && days <= cert.renewBeforeDays;
      }
      if (statusFilter === "active") {
        const days = daysUntil(cert.expiresAt);
        return cert.status === "active" && (days === null || days > cert.renewBeforeDays);
      }
      return true;
    });
  }, [certificates, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* 1. Main Certificates Card */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <CardTitle className="text-lg font-semibold">证书资产管理</CardTitle>
            </div>
            <CardDescription className="text-xs">
              集中管理 ohttps 证书生命周期，监控到期窗口并支持版本回溯与一键部署
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {onDeployAll && hasDeployableCerts && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmDeployAll(true)}
                className="gap-1.5 text-xs font-medium"
              >
                <Send className="size-3.5" />
                <span>全量部署</span>
                {deployableCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-mono">
                    {deployableCount}
                  </Badge>
                )}
              </Button>
            )}
            <Button size="sm" onClick={onCreate} className="gap-1.5 text-xs font-medium shadow-sm">
              <Plus className="size-3.5" />
              <span>添加证书</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Toolbar: Search and Filter Chips */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索证书名称、域名或 ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

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
                <span>全部</span>
                <span className="font-mono text-[10px] opacity-80">{counts.all}</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                  statusFilter === "active"
                    ? "bg-emerald-600 text-white font-medium"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>正常运行</span>
                <span className="font-mono text-[10px] opacity-80">{counts.active}</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("expiring")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                  statusFilter === "expiring"
                    ? "bg-amber-600 text-white font-medium"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-amber-500" />
                <span>需关注</span>
                <span className="font-mono text-[10px] opacity-80">{counts.expiring}</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("disabled")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                  statusFilter === "disabled"
                    ? "bg-neutral-600 text-white font-medium"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-neutral-400" />
                <span>已停用</span>
                <span className="font-mono text-[10px] opacity-80">{counts.disabled}</span>
              </button>
            </div>
          </div>

          {/* Certificates Table */}
          <div className="rounded-lg border border-border/80 overflow-hidden">
            <Table className="min-w-[720px]">
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[28%] text-xs font-semibold">证书标识与名称</TableHead>
                  <TableHead className="w-[24%] text-xs font-semibold">绑定域名</TableHead>
                  <TableHead className="w-[24%] text-xs font-semibold">有效期与到期窗口</TableHead>
                  <TableHead className="w-[12%] text-xs font-semibold">状态</TableHead>
                  <TableHead className="w-[12%] text-right text-xs font-semibold">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <EmptyRow text="正在加载证书资产..." />
                ) : filteredCertificates.length === 0 ? (
                  certificates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-44 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                            <ShieldCheck className="size-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium">暂无证书资产</p>
                          <p className="text-xs text-muted-foreground">接入 ohttps 证书后，系统将自动缓存并提供安全推送。</p>
                          <Button size="sm" className="mt-2 text-xs gap-1" onClick={onCreate}>
                            <Plus className="size-3.5" /> 添加第一张证书
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <EmptyRow text="未找到符合筛选条件的证书" />
                  )
                ) : (
                  filteredCertificates.map((certificate) => (
                    <CertificateRow
                      key={certificate.id}
                      certificate={certificate}
                      busy={busy}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      ohttpsConfigured={ohttpsConfigured}
                      latestJob={jobs.find((job) => job.certificateId === certificate.id)}
                      onViewSyncJob={onViewSyncJob}
                      onConfigureSettings={onConfigureSettings}
                      onConfirmRefresh={setConfirming}
                      onDeploy={onDeploy}
                      onViewNginxConfig={setNginxConfigCert}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 2. Sync Task History Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <RefreshCw className="size-4 text-primary" />
              <CardTitle className="text-base font-semibold">证书同步任务记录</CardTitle>
            </div>
            <CardDescription className="text-xs">
              最近的 ohttps 证书获取与验证记录，支持查看实时与历史日志
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {jobs.length} 条记录
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/80 overflow-hidden">
            <Table className="min-w-[700px]">
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-xs font-semibold">证书名称</TableHead>
                  <TableHead className="text-xs font-semibold">触发方式</TableHead>
                  <TableHead className="text-xs font-semibold">任务状态</TableHead>
                  <TableHead className="text-xs font-semibold">执行时间</TableHead>
                  <TableHead className="text-xs font-semibold">异常信息</TableHead>
                  <TableHead className="text-right text-xs font-semibold">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.slice(0, 10).map((job) => {
                  const statusMap: Record<string, { label: string; variant: "default" | "destructive" | "secondary" | "outline"; dotClass?: string }> = {
                    queued: { label: "排队中", variant: "secondary", dotClass: "bg-neutral-400" },
                    running: { label: "同步中", variant: "outline", dotClass: "bg-amber-500 animate-pulse" },
                    succeeded: { label: "同步成功", variant: "default", dotClass: "bg-emerald-500" },
                    failed: { label: "同步失败", variant: "destructive", dotClass: "bg-rose-500" },
                    cancelled: { label: "已取消", variant: "secondary", dotClass: "bg-neutral-400" },
                  };
                  const meta = statusMap[job.status] ?? { label: job.status, variant: "secondary" };

                  return (
                    <TableRow key={job.id} className="text-xs">
                      <TableCell className="font-medium text-foreground">{job.certificateName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {job.trigger === "manual" ? "手动触发" : "定时调度"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          {meta.dotClass && <span className={`size-1.5 rounded-full ${meta.dotClass}`} />}
                          <Badge variant={meta.variant} className="text-[10px] py-0">
                            {meta.label}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-[11px]">{formatDateTime(job.createdAt)}</TableCell>
                      <TableCell className="max-w-xs truncate text-[11px] text-destructive">
                        {job.errorSummary ? (
                          <span title={job.errorSummary}>{job.errorSummary}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onViewSyncJob(job.id)}
                        >
                          查看日志
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {jobs.length === 0 && <EmptyRow text="暂无同步任务记录" columns={6} />}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Manual Refresh */}
      <Dialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认立即同步证书？</DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-xs leading-relaxed">
              <p>
                即将向 ohttps 发起 API 请求，获取并校验证书{" "}
                <span className="font-semibold text-foreground">“{confirming?.name}”</span>{" "}
                的最新 PEM 文件与私钥。
              </p>
              <p className="text-muted-foreground">
                该操作将计入每日 API 调用次数。同步成功后，系统将依据已启用的部署策略自动创建推送任务。
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirming(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (confirming) onRefresh(confirming.id);
                setConfirming(null);
              }}
            >
              确认同步
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Deploy All */}
      <Dialog open={confirmDeployAll} onOpenChange={setConfirmDeployAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="size-4 text-primary" />
              <span>确认执行全量部署？</span>
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-xs leading-relaxed">
              <p>
                即将为所有具有就绪版本且处于活跃状态的证书（共{" "}
                <span className="font-semibold text-foreground">{deployableCount} 张</span>
                ）发起并行部署任务。
              </p>
              <p className="text-muted-foreground">
                系统将通过 SSH 依次推送到已关联的受管目标服务器，在远程执行预检通过后原子重载 Nginx 服务。
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDeployAll(false)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setConfirmDeployAll(false);
                onDeployAll?.();
              }}
              className="gap-1.5 shadow-sm"
            >
              <Send className="size-3.5" />
              <span>确认全量部署</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nginx Config Dialog */}
      <NginxConfigDialog
        certificate={nginxConfigCert}
        open={Boolean(nginxConfigCert)}
        onOpenChange={(open) => !open && setNginxConfigCert(null)}
      />
    </div>
  );
}

function CertificateRow({
  certificate,
  busy,
  onEdit,
  onDelete,
  ohttpsConfigured,
  latestJob,
  onViewSyncJob,
  onConfigureSettings,
  onConfirmRefresh,
  onDeploy,
  onViewNginxConfig,
}: Pick<
  CertificatePanelProps,
  "busy" | "onEdit" | "onDelete" | "ohttpsConfigured" | "onConfigureSettings" | "onViewSyncJob" | "onDeploy"
> & {
  certificate: Certificate;
  latestJob?: { id: string; status: string; errorSummary: string | null } | undefined;
  onConfirmRefresh: (certificate: Certificate) => void;
  onViewNginxConfig: (certificate: Certificate) => void;
}) {
  const days = daysUntil(certificate.expiresAt);
  const needsAttention = days !== null && days <= certificate.renewBeforeDays;
  const isExpired = days !== null && days <= 0;
  const isDisabled = certificate.status === "disabled";

  const syncInProgress = latestJob?.status === "queued" || latestJob?.status === "running";
  const action = !ohttpsConfigured
    ? { label: "配置凭据", onClick: onConfigureSettings }
    : syncInProgress
    ? { label: "查看同步", onClick: () => onViewSyncJob(latestJob!.id) }
    : {
        label: latestJob?.status === "failed" ? "重试同步" : "立即同步",
        onClick: () => onConfirmRefresh(certificate),
      };

  const canDeploy = Boolean(certificate.currentVersionId && certificate.status === "active");

  const copyText = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success(`${label}已复制到剪贴板`);
    } else {
      toast.error("复制失败，请手动选择复制");
    }
  };

  return (
    <TableRow className="transition-colors hover:bg-muted/30">
      {/* 1. Name & ID */}
      <TableCell>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground">{certificate.name}</span>
            {certificate.currentVersionId && (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-[9px] text-emerald-600 dark:text-emerald-400 font-mono py-0 h-4">
                版本已就绪
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
            <span>ID:</span>
            <span className="truncate max-w-[140px]">{certificate.ohttpsCertificateId}</span>
            <button
              type="button"
              onClick={() => void copyText(certificate.ohttpsCertificateId, "证书 ID ")}
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
              title="复制证书 ID"
            >
              <Copy className="size-3" />
            </button>
          </div>
        </div>
      </TableCell>

      {/* 2. Domain */}
      <TableCell>
        <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
          <Globe className="size-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{certificate.domain}</span>
          <button
            type="button"
            onClick={() => void copyText(certificate.domain, "域名 ")}
            className="text-muted-foreground/60 hover:text-foreground transition-colors ml-1"
            title="复制域名"
          >
            <Copy className="size-3" />
          </button>
        </div>
      </TableCell>

      {/* 3. Expiry & Renew Window */}
      <TableCell>
        <div className="space-y-1">
          <div className="text-xs font-mono text-foreground">
            {certificate.expiresAt ? formatDate(certificate.expiresAt) : "待首次同步"}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {isExpired ? (
              <Badge variant="destructive" className="text-[10px] py-0 h-4">
                已过期
              </Badge>
            ) : needsAttention ? (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400 py-0 h-4 font-medium">
                剩 {days} 天 (续期中)
              </Badge>
            ) : days !== null ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                剩 {days} 天
              </span>
            ) : (
              <span className="text-muted-foreground">未同步文件</span>
            )}
            <span className="text-muted-foreground/70 text-[10px]">
              (提前 {certificate.renewBeforeDays} 天续期)
            </span>
          </div>
        </div>
      </TableCell>

      {/* 4. Status Badge */}
      <TableCell>
        {isDisabled ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-neutral-400" />
            已停用
          </span>
        ) : needsAttention ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
            需关注
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            正常
          </span>
        )}
      </TableCell>

      {/* 5. Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {canDeploy ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onDeploy(certificate.id)}
              className="h-7 px-2.5 text-xs gap-1 shadow-sm"
            >
              <Send className="size-3" />
              <span>部署</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={action.onClick}
              className="h-7 px-2.5 text-xs gap-1"
            >
              <RefreshCw className={`size-3 ${syncInProgress ? "animate-spin" : ""}`} />
              <span>{action.label}</span>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={busy}
                aria-label={`操作 ${certificate.name}`}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 text-xs">
              {canDeploy && (
                <DropdownMenuItem disabled={busy} onClick={action.onClick}>
                  <RefreshCw className="mr-2 size-3.5" />
                  <span>{action.label}</span>
                </DropdownMenuItem>
              )}
              {!canDeploy && certificate.currentVersionId && (
                <DropdownMenuItem disabled={busy} onClick={() => onDeploy(certificate.id)}>
                  <Send className="mr-2 size-3.5" />
                  <span>部署到服务器</span>
                </DropdownMenuItem>
              )}
              {latestJob && !syncInProgress && (
                <DropdownMenuItem onClick={() => onViewSyncJob(latestJob.id)}>
                  <Activity className="mr-2 size-3.5" />
                  <span>查看同步日志</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onViewNginxConfig(certificate)}>
                <FileCode className="mr-2 size-3.5" />
                <span>Nginx 配置参考</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onClick={() => onEdit(certificate)}>
                <Pencil className="mr-2 size-3.5" />
                <span>编辑证书</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={busy}
                onClick={() =>
                  onDelete({
                    type: "certificate",
                    id: certificate.id,
                    name: certificate.name,
                  })
                }
              >
                <Trash2 className="mr-2 size-3.5" />
                <span>删除证书</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EmptyRow({ text, columns = 5 }: { text: string; columns?: number }) {
  return (
    <TableRow>
      <TableCell colSpan={columns} className="h-24 text-center text-xs text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}
