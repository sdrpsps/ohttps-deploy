import { Ban, RotateCcw } from "lucide-react";
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
import { Deployment, formatActivityDate, terminalStatuses } from "./types";

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
  onOpen: (id: string) => void;
  onAction: (id: string, action: "retry" | "cancel") => void;
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
  onOpen,
  onAction,
}: DeploymentHistoryProps) {
  const filteredDeployments = deployments.filter((item) => {
    if (certificateId && item.certificateId !== certificateId) return false;
    if (status && status !== "all") {
      if (status === "failed") {
        if (item.status !== "failed" && item.status !== "partial") return false;
      } else if (item.status !== status) {
        return false;
      }
    }
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>任务历史</CardTitle>
        <CardDescription>最多显示最近 100 个任务；选择任务可查看目标状态与实时日志。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={certificateId || "all"} onValueChange={(value) => onCertificateChange(value === "all" ? "" : value)}>
            <SelectTrigger><SelectValue placeholder="按证书筛选" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有证书</SelectItem>
              {certificates.map((certificate) => <SelectItem key={certificate.id} value={certificate.id}>{certificate.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={serverId || "all"} onValueChange={(value) => onServerChange(value === "all" ? "" : value)}>
            <SelectTrigger><SelectValue placeholder="按服务器筛选" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有服务器</SelectItem>
              {servers.map((server) => <SelectItem key={server.id} value={server.id}>{server.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status || "all"} onValueChange={(value) => onStatusChange(value === "all" ? "" : value)}>
            <SelectTrigger><SelectValue placeholder="按状态筛选" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有状态</SelectItem>
              <SelectItem value="failed">失败 / 异常</SelectItem>
              <SelectItem value="queued">排队中</SelectItem>
              <SelectItem value="running">执行中</SelectItem>
              <SelectItem value="succeeded">成功</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} aria-label="开始日期" />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>证书</TableHead>
              <TableHead>触发</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDeployments.map((deployment) => (
              <DeploymentRow key={deployment.id} deployment={deployment} onOpen={onOpen} onAction={onAction} />
            ))}
            {filteredDeployments.length === 0 && <EmptyRow colSpan={5} text="暂无符合条件的任务" />}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DeploymentRow({
  deployment,
  onOpen,
  onAction,
}: Pick<DeploymentHistoryProps, "onOpen" | "onAction"> & { deployment: Deployment }) {
  const isTerminal = terminalStatuses.has(deployment.status);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {deployment.certificateName}
        <p className="mt-1 text-xs font-normal text-muted-foreground">{deployment.domain}</p>
      </TableCell>
      <TableCell>{deployment.trigger}</TableCell>
      <TableCell><StatusBadge status={deployment.status} /></TableCell>
      <TableCell className="text-xs">{formatActivityDate(deployment.createdAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onOpen(deployment.id)}>详情</Button>
          {!isTerminal && (
            <Button variant="outline" size="sm" onClick={() => onAction(deployment.id, "cancel")} aria-label="取消任务">
              <Ban className="mr-1 size-3.5" /> 取消
            </Button>
          )}
          {isTerminal && deployment.status !== "succeeded" && (
            <Button variant="outline" size="sm" onClick={() => onAction(deployment.id, "retry")} aria-label="重试任务">
              <RotateCcw className="mr-1 size-3.5" /> 重试
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant = status === "succeeded" ? "default" : status === "failed" ? "destructive" : "secondary";
  const labels: Record<string, string> = { queued: "排队中", running: "执行中", succeeded: "成功", failed: "失败", cancelled: "已取消", partial: "部分成功" };
  return <Badge variant={variant}>{labels[status] ?? status}</Badge>;
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-20 text-center text-muted-foreground">{text}</TableCell>
    </TableRow>
  );
}
