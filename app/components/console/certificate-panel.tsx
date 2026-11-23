"use client";

import {
  Activity,
  Copy,
  FileCode,
  Globe,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Send,
  Server,
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
  CardHeader,
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
import type { Certificate, DeleteTarget, ManagedServer, PolicyItem } from "./types";

type CertificatePanelProps = {
  certificates: Certificate[];
  servers?: ManagedServer[];
  policies?: PolicyItem[];
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
  onRefresh: (id: string) => Promise<unknown> | void;
  onDeploy: (id: string) => Promise<unknown> | void;
  onDeployAll?: () => Promise<unknown> | void;
  onToggleStatus?: (certificate: Certificate) => Promise<unknown> | void;
  onDelete: (target: DeleteTarget) => void;
  ohttpsConfigured: boolean;
  onViewSyncJob: (id: string) => void;
  onConfigureSettings: () => void;
};

type FilterStatus = "all" | "active" | "expiring" | "disabled";

export function CertificatePanel({
  certificates,
  servers = [],
  policies = [],
  jobs,
  loading,
  busy,
  onCreate,
  onEdit,
  onRefresh,
  onDeploy,
  onDeployAll,
  onToggleStatus,
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

  const serverMap = useMemo(() => new Map(servers.map((s) => [s.id, s])), [servers]);

  const targetsByCert = useMemo(() => {
    const map = new Map<string, ManagedServer[]>();
    for (const p of policies) {
      if (!p.autoDeploy) continue;
      const srv = serverMap.get(p.serverId);
      if (!srv) continue;
      const list = map.get(p.certificateId) ?? [];
      list.push(srv);
      map.set(p.certificateId, list);
    }
    return map;
  }, [policies, serverMap]);

  const latestJobByCert = useMemo(() => {
    const map = new Map<string, CertificatePanelProps["jobs"][number]>();
    for (const job of jobs) {
      if (!map.has(job.certificateId)) {
        map.set(job.certificateId, job);
      }
    }
    return map;
  }, [jobs]);

  const deployableCount = useMemo(() => {
    return certificates.filter((c) => {
      if (c.status !== "active" || !c.currentVersionId) return false;
      const targets = targetsByCert.get(c.id) ?? [];
      return targets.some((s) => s.enabled);
    }).length;
  }, [certificates, targetsByCert]);

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
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matchesName = cert.name.toLowerCase().includes(query);
        const matchesDomain = cert.domain.toLowerCase().includes(query);
        const matchesId = cert.ohttpsCertificateId.toLowerCase().includes(query);
        if (!matchesName && !matchesDomain && !matchesId) return false;
      }

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
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索名称、域名或证书 ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="清空搜索"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

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
                onClick={() => setStatusFilter("active")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                  statusFilter === "active"
                    ? "bg-emerald-600 font-medium text-white"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>正常</span>
                <span className="font-mono text-[10px] opacity-80">{counts.active}</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("expiring")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                  statusFilter === "expiring"
                    ? "bg-amber-600 font-medium text-white"
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
                    ? "bg-neutral-600 font-medium text-white"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-neutral-400" />
                <span>已停用</span>
                <span className="font-mono text-[10px] opacity-80">{counts.disabled}</span>
              </button>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onDeployAll && deployableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmDeployAll(true)}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <Send className="size-3.5" />
                <span>全量部署</span>
                <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[10px]">
                  {deployableCount}
                </Badge>
              </Button>
            )}
            <Button size="sm" onClick={onCreate} className="h-8 gap-1.5 text-xs font-medium shadow-sm">
              <Plus className="size-3.5" />
              <span>添加证书</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table className="min-w-[860px]">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[26%] text-xs font-semibold">证书 / 域名</TableHead>
                <TableHead className="w-[22%] text-xs font-semibold">部署目标</TableHead>
                <TableHead className="w-[20%] text-xs font-semibold">有效期</TableHead>
                <TableHead className="w-[16%] text-xs font-semibold">最近同步</TableHead>
                <TableHead className="w-[16%] text-right text-xs font-semibold">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <EmptyRow text="正在加载证书列表..." />
              ) : filteredCertificates.length === 0 ? (
                certificates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-44 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                          <ShieldCheck className="size-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">暂无证书</p>
                        <Button size="sm" className="mt-1 h-8 gap-1 text-xs" onClick={onCreate}>
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
                    boundServers={targetsByCert.get(certificate.id) ?? []}
                    busy={busy}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleStatus={onToggleStatus}
                    ohttpsConfigured={ohttpsConfigured}
                    latestJob={latestJobByCert.get(certificate.id)}
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
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Manual Refresh */}
      <Dialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认立即同步证书？</DialogTitle>
            <DialogDescription className="space-y-1.5 pt-2 text-xs leading-relaxed">
              <p>
                即将向 ohttps 请求并校验证书{" "}
                <span className="font-semibold text-foreground">“{confirming?.name}”</span>{" "}
                的最新版本（计入每日 API 调用额度）。
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setConfirming(null)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (confirming) void onRefresh(confirming.id);
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
            <DialogDescription className="pt-2 text-xs leading-relaxed">
              即将为{" "}
              <span className="font-semibold text-foreground">{deployableCount} 张</span>{" "}
              已就绪且绑定了启用服务器的证书创建部署任务并推送至对应主机。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeployAll(false)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setConfirmDeployAll(false);
                void onDeployAll?.();
              }}
              className="gap-1.5"
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
  boundServers,
  busy,
  onEdit,
  onDelete,
  onToggleStatus,
  ohttpsConfigured,
  latestJob,
  onViewSyncJob,
  onConfigureSettings,
  onConfirmRefresh,
  onDeploy,
  onViewNginxConfig,
}: Pick<
  CertificatePanelProps,
  "busy" | "onEdit" | "onDelete" | "onToggleStatus" | "ohttpsConfigured" | "onConfigureSettings" | "onViewSyncJob" | "onDeploy"
> & {
  certificate: Certificate;
  boundServers: ManagedServer[];
  latestJob?: CertificatePanelProps["jobs"][number] | undefined;
  onConfirmRefresh: (certificate: Certificate) => void;
  onViewNginxConfig: (certificate: Certificate) => void;
}) {
  const [deploying, setDeploying] = useState(false);

  const days = daysUntil(certificate.expiresAt);
  const needsAttention = days !== null && days <= certificate.renewBeforeDays;
  const isExpired = days !== null && days <= 0;
  const isDisabled = certificate.status === "disabled";

  const activeBoundServers = boundServers.filter((s) => s.enabled);
  const syncInProgress = latestJob?.status === "queued" || latestJob?.status === "running";

  const syncAction = !ohttpsConfigured
    ? { label: "配置凭据", onClick: onConfigureSettings }
    : syncInProgress
    ? { label: "同步中", onClick: () => onViewSyncJob(latestJob!.id) }
    : {
        label: latestJob?.status === "failed" ? "重试同步" : "同步",
        onClick: () => onConfirmRefresh(certificate),
      };

  const canDeploy = Boolean(
    certificate.currentVersionId &&
      certificate.status === "active" &&
      activeBoundServers.length > 0
  );

  const deployDisabledReason = isDisabled
    ? "证书已停用"
    : !certificate.currentVersionId
    ? "请先同步获取证书文件"
    : activeBoundServers.length === 0
    ? "请先绑定已启用的目标服务器"
    : "部署证书到已绑定的目标服务器";

  const copyText = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success(`${label}已复制到剪贴板`);
    } else {
      toast.error("复制失败，请手动选择复制");
    }
  };

  async function handleDeploy() {
    setDeploying(true);
    try {
      await onDeploy(certificate.id);
    } finally {
      setDeploying(false);
    }
  }

  const syncStatusMeta: Record<string, { label: string; dotClass: string; textClass: string }> = {
    queued: { label: "排队中", dotClass: "bg-neutral-400", textClass: "text-muted-foreground" },
    running: { label: "同步中", dotClass: "bg-amber-500 animate-pulse", textClass: "text-amber-600 dark:text-amber-400" },
    succeeded: { label: "同步成功", dotClass: "bg-emerald-500", textClass: "text-emerald-600 dark:text-emerald-400" },
    failed: { label: "同步失败", dotClass: "bg-rose-500", textClass: "text-destructive" },
    cancelled: { label: "已取消", dotClass: "bg-neutral-400", textClass: "text-muted-foreground" },
  };

  return (
    <TableRow className={`transition-colors hover:bg-muted/30 ${isDisabled ? "opacity-65" : ""}`}>
      {/* 1. Name, Domain & ID */}
      <TableCell>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="max-w-[220px] break-words text-xs font-semibold text-foreground">
              {certificate.name}
            </span>
            {isDisabled && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                已停用
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-foreground/80">
            <Globe className="size-3 shrink-0 text-muted-foreground" />
            <span className="max-w-[180px] truncate">{certificate.domain}</span>
            <button
              type="button"
              onClick={() => void copyText(certificate.domain, "域名")}
              className="text-muted-foreground/60 transition-colors hover:text-foreground"
              title="复制域名"
            >
              <Copy className="size-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <span>ID:</span>
            <span className="max-w-[130px] truncate">{certificate.ohttpsCertificateId}</span>
            <button
              type="button"
              onClick={() => void copyText(certificate.ohttpsCertificateId, "证书 ID")}
              className="text-muted-foreground/60 transition-colors hover:text-foreground"
              title="复制证书 ID"
            >
              <Copy className="size-3" />
            </button>
          </div>
        </div>
      </TableCell>

      {/* 2. Bound Deployment Targets */}
      <TableCell>
        <button
          type="button"
          onClick={() => onEdit(certificate)}
          className="group flex flex-wrap items-center gap-1 text-left"
          title="点击修改绑定的目标服务器"
        >
          {activeBoundServers.length > 0 ? (
            <>
              {activeBoundServers.slice(0, 2).map((srv) => (
                <span
                  key={srv.id}
                  className="inline-flex items-center gap-1 rounded border border-border/80 bg-muted/30 px-1.5 py-0.5 text-[11px] font-medium text-foreground transition-colors group-hover:border-primary/40"
                >
                  <Server className="size-2.5 text-primary" />
                  <span className="max-w-[90px] truncate">{srv.name}</span>
                </span>
              ))}
              {activeBoundServers.length > 2 && (
                <span className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  +{activeBoundServers.length - 2}
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-dashed border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-[11px] text-amber-600 transition-colors group-hover:border-amber-500 dark:text-amber-400">
              未绑定节点 · 配置
            </span>
          )}
        </button>
      </TableCell>

      {/* 3. Expiry & Renew Window */}
      <TableCell>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-foreground">
              {certificate.expiresAt ? formatDate(certificate.expiresAt) : "待首次同步"}
            </span>
            {!isDisabled && (
              isExpired ? (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                  已过期
                </Badge>
              ) : needsAttention ? (
                <Badge variant="outline" className="h-4 border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  剩 {days} 天
                </Badge>
              ) : days !== null ? (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  剩 {days} 天
                </span>
              ) : null
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            提前 {certificate.renewBeforeDays} 天自动续期
          </p>
        </div>
      </TableCell>

      {/* 4. Latest Sync Status */}
      <TableCell>
        {latestJob ? (
          <button
            type="button"
            onClick={() => onViewSyncJob(latestJob.id)}
            className="group space-y-0.5 text-left"
            title={latestJob.errorSummary ?? "点击查看同步日志"}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span className={`size-1.5 rounded-full ${(syncStatusMeta[latestJob.status] ?? syncStatusMeta.queued).dotClass}`} />
              <span className={`${(syncStatusMeta[latestJob.status] ?? syncStatusMeta.queued).textClass} group-hover:underline`}>
                {(syncStatusMeta[latestJob.status] ?? { label: latestJob.status }).label}
              </span>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              {formatDateTime(latestJob.createdAt)}
            </p>
          </button>
        ) : certificate.currentVersionId ? (
          <span className="text-xs text-muted-foreground">缓存就绪</span>
        ) : (
          <span className="text-xs text-muted-foreground">尚未同步</span>
        )}
      </TableCell>

      {/* 5. Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={syncAction.onClick}
            className="h-7 gap-1 px-2 text-xs"
          >
            <RefreshCw className={`size-3 ${syncInProgress ? "animate-spin" : ""}`} />
            <span>{syncAction.label}</span>
          </Button>

          <Button
            size="sm"
            disabled={busy || deploying || !canDeploy}
            onClick={() => void handleDeploy()}
            title={deployDisabledReason}
            className="h-7 gap-1 px-2.5 text-xs shadow-sm"
          >
            <Send className="size-3" />
            <span>{deploying ? "创建中" : "部署"}</span>
          </Button>

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
              <DropdownMenuItem disabled={busy} onClick={() => onEdit(certificate)}>
                <Pencil className="mr-2 size-3.5" />
                <span>编辑与绑定节点</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewNginxConfig(certificate)}>
                <FileCode className="mr-2 size-3.5" />
                <span>Nginx 配置参考</span>
              </DropdownMenuItem>
              {latestJob && (
                <DropdownMenuItem onClick={() => onViewSyncJob(latestJob.id)}>
                  <Activity className="mr-2 size-3.5" />
                  <span>查看最近同步日志</span>
                </DropdownMenuItem>
              )}
              {onToggleStatus && (
                <DropdownMenuItem disabled={busy} onClick={() => void onToggleStatus(certificate)}>
                  <Power className="mr-2 size-3.5" />
                  <span>{isDisabled ? "启用证书" : "停用证书"}</span>
                </DropdownMenuItem>
              )}
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
