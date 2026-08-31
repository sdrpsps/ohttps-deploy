import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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
};

export function CertificatePanel({
  certificates,
  loading,
  busy,
  onCreate,
  onEdit,
  onRefresh,
  onDelete,
}: CertificatePanelProps) {
  return (
    <Card>
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
                  onRefresh={onRefresh}
                  onDelete={onDelete}
                />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CertificateRow({
  certificate,
  busy,
  onEdit,
  onRefresh,
  onDelete,
}: Omit<CertificatePanelProps, "certificates" | "loading" | "onCreate"> & { certificate: Certificate }) {
  const days = daysUntil(certificate.expiresAt);
  const needsAttention = days !== null && days <= certificate.renewBeforeDays;
  const statusClass = needsAttention && certificate.status === "active"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : undefined;
  const statusLabel = certificate.status === "disabled" ? "停用" : needsAttention ? "需关注" : "正常";
  const statusVariant = certificate.status === "disabled" ? "secondary" : needsAttention ? "outline" : "default";

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
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onRefresh(certificate.id)}>
          <RefreshCw /> 立即刷新
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
