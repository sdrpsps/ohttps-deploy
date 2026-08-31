"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Power, Trash2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Certificate, ManagedServer } from "@/components/console/types";

type Policy = {
  certificateId: string;
  certificateName: string;
  domain: string;
  serverId: string;
  serverName: string;
  host: string;
  autoDeploy: boolean;
};

type PoliciesPanelProps = {
  certificates: Certificate[];
  servers: ManagedServer[];
};

export function PoliciesPanel({ certificates, servers }: PoliciesPanelProps) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);

  async function load() {
    const response = await fetch("/api/deployment-policies", { cache: "no-store" });
    if (!response.ok) throw new Error("无法加载部署策略");
    setPolicies((await response.json()).data);
  }

  async function save(certificateId: string, serverId: string, autoDeploy = true) {
    const response = await fetch("/api/deployment-policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificateId, serverId, autoDeploy }),
    });
    if (!response.ok) {
      toast.error("保存部署策略失败");
      return;
    }
    setSelectedCertificate(null);
    toast.success("部署策略已保存");
    await load().catch((cause) => toast.error(cause.message));
  }

  async function remove(policy: Policy) {
    const query = new URLSearchParams({ certificateId: policy.certificateId, serverId: policy.serverId });
    const response = await fetch(`/api/deployment-policies?${query}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("删除部署策略失败");
      return;
    }
    toast.success("部署策略已删除");
    await load().catch((cause) => toast.error(cause.message));
  }

  useEffect(() => {
    load().catch((cause) => toast.error(cause.message));
  }, []);

  const assignedServerIds = useMemo(() => new Set(
    policies
      .filter((policy) => policy.certificateId === selectedCertificate?.id)
      .map((policy) => policy.serverId),
  ), [policies, selectedCertificate]);
  const availableServers = servers.filter((server) => server.enabled && !assignedServerIds.has(server.id));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>部署策略</CardTitle>
          <CardDescription>将证书映射到服务器；启用自动部署的目标会在刷新后加入任务。</CardDescription>
        </div>
        <Badge variant="secondary">{policies.length} 个映射</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>证书</TableHead>
              <TableHead>服务器</TableHead>
              <TableHead>自动部署</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies.map((policy) => (
              <TableRow key={`${policy.certificateId}-${policy.serverId}`}>
                <TableCell className="font-medium">
                  {policy.certificateName}
                  <p className="mt-1 text-xs font-normal text-muted-foreground">{policy.domain}</p>
                </TableCell>
                <TableCell>
                  {policy.serverName}
                  <p className="mt-1 text-xs text-muted-foreground">{policy.host}</p>
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => void save(policy.certificateId, policy.serverId, !policy.autoDeploy)}>
                    <Power /> {policy.autoDeploy ? "已启用" : "已停用"}
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => void remove(policy)} aria-label="删除部署策略">
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {policies.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">还没有策略映射</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex flex-wrap gap-2">
          {certificates.map((certificate) => (
            <Button key={certificate.id} variant="outline" size="sm" onClick={() => setSelectedCertificate(certificate)}>
              <Plus /> 为“{certificate.name}”添加服务器
            </Button>
          ))}
        </div>
      </CardContent>

      <Dialog open={Boolean(selectedCertificate)} onOpenChange={(open) => !open && setSelectedCertificate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加部署目标</DialogTitle>
            <DialogDescription>为 {selectedCertificate?.name} 选择一个已启用服务器。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {availableServers.map((server) => (
              <Button
                key={server.id}
                className="w-full justify-between"
                variant="outline"
                onClick={() => selectedCertificate && void save(selectedCertificate.id, server.id)}
              >
                <span>{server.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{server.host}</span>
              </Button>
            ))}
            {availableServers.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">没有可添加的已启用服务器。</p>}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
