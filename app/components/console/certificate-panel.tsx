"use client";
import { Activity, FileCode, MoreHorizontal, Pencil, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { daysUntil, formatDate } from "@/lib/utils";
import { NginxConfigDialog } from "./nginx-config-dialog";
import type { Certificate, DeleteTarget } from "./types";

type CertificatePanelProps = {
  certificates: Certificate[];
  jobs: Array<{ id: string; certificateId: string; certificateName: string; trigger: string; status: string; errorSummary: string | null; createdAt: string }>;
  loading: boolean;
  busy: boolean;
  onCreate: () => void;
  onEdit: (certificate: Certificate) => void;
  onRefresh: (id: string) => void;
  onDeploy: (id: string) => void;
  onDelete: (target: DeleteTarget) => void;
  ohttpsConfigured: boolean;
  onViewSyncJob: (id: string) => void;
  onConfigureSettings: () => void;
};

export function CertificatePanel({
  certificates,
  jobs,
  loading,
  busy,
  onCreate,
  onEdit,
  onRefresh,
  onDeploy,
  onDelete,
  ohttpsConfigured,
  onViewSyncJob,
  onConfigureSettings,
}: CertificatePanelProps) {
  const [confirming, setConfirming] = useState<Certificate | null>(null);
  const [nginxConfigCert, setNginxConfigCert] = useState<Certificate | null>(null);

  return (
    <div className="space-y-6"><Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>证书</CardTitle>
          <CardDescription>管理 ohttps 证书及其续期状态</CardDescription>
        </div>
        <Button onClick={onCreate}>
          <Plus /> 添加证书
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>域名</TableHead>
              <TableHead>到期时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <EmptyRow text="加载中..." />
            ) : certificates.length === 0 ? (
              <EmptyRow text="暂无证书" />
            ) : (
              certificates.map((certificate) => (
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
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>同步任务</CardTitle><CardDescription>最近的 ohttps 获取记录。打开即可查看实时与历史日志。</CardDescription></CardHeader>
      <CardContent><Table><TableHeader><TableRow><TableHead>证书</TableHead><TableHead>触发</TableHead><TableHead>状态</TableHead><TableHead>时间</TableHead><TableHead>错误</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{jobs.map((job) => <TableRow key={job.id}><TableCell>{job.certificateName}</TableCell><TableCell>{job.trigger === "manual" ? "手动" : "定时"}</TableCell><TableCell><Badge variant={job.status === "succeeded" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>{({ queued: "排队中", running: "同步中", succeeded: "成功", failed: "失败", cancelled: "已取消" } as Record<string, string>)[job.status] ?? job.status}</Badge></TableCell><TableCell>{formatDate(job.createdAt)}</TableCell><TableCell className="text-xs text-destructive">{job.errorSummary ?? "-"}</TableCell><TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => onViewSyncJob(job.id)}>查看</Button></TableCell></TableRow>)}{jobs.length === 0 && <EmptyRow text="暂无同步任务" columns={6} />}</TableBody></Table></CardContent>
    </Card>
      <Dialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}><DialogContent><DialogHeader><DialogTitle>确认立即同步？</DialogTitle><DialogDescription>将调用 ohttps 获取“{confirming?.name}”的最新证书。该操作可能产生费用，成功后会根据部署策略自动创建部署任务。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirming(null)}>取消</Button><Button onClick={() => { if (confirming) onRefresh(confirming.id); setConfirming(null); }}>确认同步</Button></DialogFooter></DialogContent></Dialog>
      <NginxConfigDialog certificate={nginxConfigCert} open={Boolean(nginxConfigCert)} onOpenChange={(open) => !open && setNginxConfigCert(null)} />
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
}: Pick<CertificatePanelProps, "busy" | "onEdit" | "onDelete" | "ohttpsConfigured" | "onConfigureSettings" | "onViewSyncJob" | "onDeploy"> & {
  certificate: Certificate;
  latestJob?: { id: string; status: string; errorSummary: string | null } | undefined;
  onConfirmRefresh: (certificate: Certificate) => void;
  onViewNginxConfig: (certificate: Certificate) => void;
}) {
  const days = daysUntil(certificate.expiresAt);
  const needsAttention = days !== null && days <= certificate.renewBeforeDays;
  const statusClass = needsAttention && certificate.status === "active"
    ? "border-primary bg-primary-foreground text-primary"
    : undefined;
  const statusLabel = certificate.status === "disabled" ? "停用" : needsAttention ? "需关注" : "正常";
  const statusVariant = certificate.status === "disabled" ? "secondary" : needsAttention ? "outline" : "default";

  const syncInProgress = latestJob?.status === "queued" || latestJob?.status === "running";
  const action = !ohttpsConfigured ? { label: "去配置 ohttps 凭据", onClick: onConfigureSettings } : syncInProgress ? { label: "查看同步", onClick: () => onViewSyncJob(latestJob!.id) } : { label: latestJob?.status === "failed" ? "重新同步" : "立即同步", onClick: () => onConfirmRefresh(certificate) };
  const canDeploy = Boolean(certificate.currentVersionId && certificate.status === "active");

  return (
    <TableRow>
      <TableCell className="font-medium">
        {certificate.name}
        <p className="mt-1 text-xs font-normal text-muted-foreground">
          ID · {certificate.ohttpsCertificateId}
        </p>
      </TableCell>
      <TableCell>{certificate.domain}</TableCell>
      <TableCell>
        {formatDate(certificate.expiresAt)}
        {days !== null && (
          <p className="mt-1 text-xs text-muted-foreground">
            {days > 0 ? `${days} 天后` : "已过期"}
          </p>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant} className={statusClass}>
          {statusLabel}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {canDeploy ? (
            <Button size="sm" disabled={busy} onClick={() => onDeploy(certificate.id)}>
              <Send className="mr-1 size-3.5" /> 部署
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={action.onClick}>
              <RefreshCw className="mr-1 size-3.5" /> {action.label}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" disabled={busy} aria-label={`操作 ${certificate.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canDeploy && (
                <DropdownMenuItem disabled={busy} onClick={action.onClick}>
                  <RefreshCw className="mr-2 size-3.5" /> {action.label}
                </DropdownMenuItem>
              )}
              {!canDeploy && certificate.currentVersionId && (
                <DropdownMenuItem disabled={busy} onClick={() => onDeploy(certificate.id)}>
                  <Send className="mr-2 size-3.5" /> 部署到服务器
                </DropdownMenuItem>
              )}
              {latestJob && !syncInProgress && (
                <DropdownMenuItem onClick={() => onViewSyncJob(latestJob.id)}>
                  <Activity className="mr-2 size-3.5" /> 查看同步记录
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onViewNginxConfig(certificate)}>
                <FileCode className="mr-2 size-3.5" /> Nginx 配置引用
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onClick={() => onEdit(certificate)}>
                <Pencil className="mr-2 size-3.5" /> 编辑证书
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={busy}
                onClick={() => onDelete({ type: "certificate", id: certificate.id, name: certificate.name })}
              >
                <Trash2 className="mr-2 size-3.5" /> 删除证书
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
      <TableCell colSpan={columns} className="h-24 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}
