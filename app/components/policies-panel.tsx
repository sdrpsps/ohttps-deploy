"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Certificate, ManagedServer } from "@/components/console/types";
import { getApiData, queryKeys } from "@/lib/api";

type Policy = { certificateId: string; serverId: string; autoDeploy: boolean };
type PolicyData = { policies: Policy[]; configuredCertificateIds: string[] };
const emptyPolicyData: PolicyData = { policies: [], configuredCertificateIds: [] };

type PoliciesPanelProps = { certificates: Certificate[]; servers: ManagedServer[] };

export function PoliciesPanel({ certificates, servers }: PoliciesPanelProps) {
  const queryClient = useQueryClient();
  const { data = emptyPolicyData, isLoading } = useQuery({ queryKey: queryKeys.policies, queryFn: () => getApiData<PolicyData>("/api/deployment-policies") });
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const enabledServers = useMemo(() => servers.filter((server) => server.enabled), [servers]);

  function currentSelection(certificateId: string) {
    const existing = data.policies.filter((policy) => policy.certificateId === certificateId);
    return new Set(existing.filter((policy) => policy.autoDeploy && enabledServers.some((server) => server.id === policy.serverId)).map((policy) => policy.serverId));
  }

  const activeMappingCount = useMemo(() => {
    return certificates.reduce((sum, cert) => sum + currentSelection(cert.id).size, 0);
  }, [certificates, data, enabledServers]);

  function openEditor(certificate: Certificate) {
    setSelectedCertificate(certificate);
    const existing = currentSelection(certificate.id);
    if (!existing.size && !data.configuredCertificateIds.includes(certificate.id)) {
      setSelectedServerIds(new Set(enabledServers.map((server) => server.id)));
    } else {
      setSelectedServerIds(existing);
    }
  }

  function toggleServer(serverId: string, checked: boolean) {
    setSelectedServerIds((ids) => {
      const next = new Set(ids);
      if (checked) next.add(serverId); else next.delete(serverId);
      return next;
    });
  }

  async function save() {
    if (!selectedCertificate) return;
    setSaving(true);
    try {
      const response = await fetch("/api/deployment-policies", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ certificateId: selectedCertificate.id, serverIds: [...selectedServerIds] }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message ?? "保存部署策略失败");
      await queryClient.invalidateQueries({ queryKey: queryKeys.policies });
      setSelectedCertificate(null);
      toast.success("部署服务器已保存");
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存部署策略失败"); }
    finally { setSaving(false); }
  }

  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-4">
      <div><CardTitle>部署策略</CardTitle><CardDescription>分别为每张证书选择部署服务器；首次配置默认选择所有已启用服务器。</CardDescription></div>
      <Badge variant="secondary">{activeMappingCount} 个生效映射</Badge>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader><TableRow><TableHead>证书</TableHead><TableHead>部署服务器</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
        <TableBody>
          {certificates.map((certificate) => {
            const count = currentSelection(certificate.id).size;
            return <TableRow key={certificate.id}>
              <TableCell className="font-medium">{certificate.name}<p className="mt-1 text-xs font-normal text-muted-foreground">{certificate.domain}</p></TableCell>
              <TableCell><Badge variant={count ? "secondary" : "outline"}>{count} / {enabledServers.length} 台已启用服务器</Badge></TableCell>
              <TableCell className="text-right"><Button variant="outline" size="sm" disabled={isLoading} onClick={() => openEditor(certificate)}>配置服务器</Button></TableCell>
            </TableRow>;
          })}
          {!certificates.length && <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">请先添加证书。</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent>

    <Dialog open={Boolean(selectedCertificate)} onOpenChange={(open) => !open && setSelectedCertificate(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>选择部署服务器</DialogTitle><DialogDescription>为 {selectedCertificate?.name} 勾选部署目标。路径会自动使用 /etc/nginx/ssl/{selectedCertificate?.domain}/。</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setSelectedServerIds(new Set())}>取消全选</Button><Button type="button" variant="outline" size="sm" onClick={() => setSelectedServerIds(new Set(enabledServers.map((server) => server.id)))}>全选</Button></div>
          {enabledServers.map((server) => {
            const id = `policy-${selectedCertificate?.id}-${server.id}`;
            return <div key={server.id} className="flex items-center gap-3 rounded-lg border p-3"><Checkbox id={id} checked={selectedServerIds.has(server.id)} onCheckedChange={(checked) => toggleServer(server.id, checked === true)} /><Label htmlFor={id} className="flex-1 cursor-pointer"><span className="font-medium">{server.name}</span><span className="ml-2 font-mono text-xs text-muted-foreground">{server.host}:{server.port}</span></Label></div>;
          })}
          {!enabledServers.length && <p className="py-4 text-center text-sm text-muted-foreground">没有已启用的服务器可供选择。</p>}
          <Button className="w-full" disabled={saving} onClick={() => void save()}>{saving ? "保存中..." : "保存选择"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </Card>;
}
