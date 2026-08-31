"use client";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { daysUntil, formatDate } from "@/lib/utils";
import type { Certificate, DeleteTarget } from "./types";

type CertificatePanelProps = {
  certificates: Certificate[];
  loading: boolean;
  busy: boolean;
  onCreate: () => void;
  onEdit: (certificate: Certificate) => void;
  onRefresh: (id: string) => void;
  onDelete: (target: DeleteTarget) => void;
  ohttpsConfigured: boolean;
  deploymentTargetCount: number;
  onNavigate: (section: "servers" | "policies" | "activity") => void;
  onConfigureSettings: () => void;
};

export function CertificatePanel({
  certificates,
  loading,
  busy,
  onCreate,
  onEdit,
  onRefresh,
  onDelete,
  ohttpsConfigured,
  deploymentTargetCount,
  onNavigate,
  onConfigureSettings,
}: CertificatePanelProps) {
  const [jobs, setJobs] = useState<Array<{ id: string; certificateId: string; certificateName: string; trigger: string; status: string; errorSummary: string | null; createdAt: string }>>([]);
  const [confirming, setConfirming] = useState<Certificate | null>(null);
  useEffect(() => { fetch("/api/certificate-sync-jobs", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((body) => { if (body?.data) setJobs(body.data); }).catch(() => undefined); }, [certificates]);
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
                  deploymentTargetCount={deploymentTargetCount}
                  latestJob={jobs.find((job) => job.certificateId === certificate.id)}
                  onNavigate={onNavigate}
                  onConfigureSettings={onConfigureSettings}
                  onConfirmRefresh={setConfirming}
                />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card><Card><CardHeader><CardTitle>同步任务</CardTitle><CardDescription>最近的 ohttps 获取记录与失败原因</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>证书</TableHead><TableHead>触发</TableHead><TableHead>状态</TableHead><TableHead>时间</TableHead><TableHead>错误</TableHead></TableRow></TableHeader><TableBody>{jobs.map((job) => <TableRow key={job.id}><TableCell>{job.certificateName}</TableCell><TableCell>{job.trigger === "manual" ? "手动" : "定时"}</TableCell><TableCell><Badge variant={job.status === "succeeded" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>{({ queued: "排队中", running: "同步中", succeeded: "成功", failed: "失败", cancelled: "已取消" } as Record<string, string>)[job.status] ?? job.status}</Badge></TableCell><TableCell>{formatDate(job.createdAt)}</TableCell><TableCell className="text-xs text-destructive">{job.errorSummary ?? "-"}</TableCell></TableRow>)}{jobs.length === 0 && <EmptyRow text="暂无同步任务" />}</TableBody></Table></CardContent></Card>
      <Dialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}><DialogContent><DialogHeader><DialogTitle>确认立即同步？</DialogTitle><DialogDescription>将调用 ohttps 获取“{confirming?.name}”的最新证书。该操作可能产生费用，成功后会根据部署策略自动创建部署任务。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirming(null)}>取消</Button><Button onClick={() => { if (confirming) onRefresh(confirming.id); setConfirming(null); }}>确认同步</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function CertificateRow({
  certificate,
  busy,
  onEdit,
  onDelete,
  ohttpsConfigured,
  deploymentTargetCount,
  latestJob,
  onNavigate,
  onConfigureSettings,
  onConfirmRefresh,
}: Pick<CertificatePanelProps, "busy" | "onEdit" | "onDelete" | "ohttpsConfigured" | "deploymentTargetCount" | "onNavigate" | "onConfigureSettings"> & { certificate: Certificate; latestJob?: { status: string; errorSummary: string | null } | undefined; onConfirmRefresh: (certificate: Certificate) => void }) {
  const days = daysUntil(certificate.expiresAt);
  const needsAttention = days !== null && days <= certificate.renewBeforeDays;
  const statusClass = needsAttention && certificate.status === "active"
    ? "border-primary bg-primary-foreground text-primary"
    : undefined;
  const statusLabel = certificate.status === "disabled" ? "停用" : needsAttention ? "需关注" : "正常";
  const statusVariant = certificate.status === "disabled" ? "secondary" : needsAttention ? "outline" : "default";

  const syncInProgress = latestJob?.status === "queued" || latestJob?.status === "running";
  const action = !ohttpsConfigured ? { label: "去配置 ohttps 凭据", onClick: onConfigureSettings } : deploymentTargetCount === 0 ? { label: "配置部署服务器", onClick: () => onNavigate("servers") } : syncInProgress ? { label: "查看任务", onClick: () => onNavigate("activity") } : latestJob?.status === "failed" ? { label: "查看原因 / 重试", onClick: () => onConfirmRefresh(certificate) } : { label: "立即同步", onClick: () => onConfirmRefresh(certificate) };
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
      <TableCell className="space-x-1 text-right">
        <Button variant="outline" size="sm" disabled={busy} onClick={action.onClick}>
          <RefreshCw /> {action.label}
        </Button>
        <Button variant="ghost" size="icon" disabled={busy} onClick={() => onEdit(certificate)} aria-label={`编辑证书 ${certificate.name}`}>
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={() => onDelete({ type: "certificate", id: certificate.id, name: certificate.name })}
          aria-label={`删除证书 ${certificate.name}`}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}
