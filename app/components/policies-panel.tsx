"use client";

import { useEffect, useState } from "react";
import { Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Certificate = { id: string; name: string; domain: string };
type ManagedServer = { id: string; name: string; host: string; enabled: boolean };
type Policy = { certificateId: string; certificateName: string; domain: string; serverId: string; serverName: string; host: string; autoDeploy: boolean };

export function PoliciesPanel({ certificates, servers }: { certificates: Certificate[]; servers: ManagedServer[] }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const load = async () => { const response = await fetch("/api/deployment-policies", { cache: "no-store" }); if (!response.ok) throw new Error("无法加载部署策略"); setPolicies((await response.json()).data); };
  useEffect(() => { load().catch((cause) => toast.error(cause.message)); }, []);
  const save = async (certificateId: string, serverId: string, autoDeploy = true) => { const response = await fetch("/api/deployment-policies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ certificateId, serverId, autoDeploy }) }); if (!response.ok) return toast.error("保存部署策略失败"); setCertificate(null); toast.success("部署策略已保存"); await load().catch((cause) => toast.error(cause.message)); };
  const remove = async (policy: Policy) => { const response = await fetch(`/api/deployment-policies?certificateId=${encodeURIComponent(policy.certificateId)}&serverId=${encodeURIComponent(policy.serverId)}`, { method: "DELETE" }); if (!response.ok) return toast.error("删除部署策略失败"); toast.success("部署策略已删除"); await load().catch((cause) => toast.error(cause.message)); };
  const assigned = new Set(policies.filter((policy) => policy.certificateId === certificate?.id).map((policy) => policy.serverId));

  return <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>部署策略</CardTitle><CardDescription>将证书映射到服务器；启用自动部署的目标会在刷新后加入任务。</CardDescription></div><Badge variant="secondary">{policies.length} 个映射</Badge></CardHeader><CardContent className="space-y-4"><Table><TableHeader><TableRow><TableHead>证书</TableHead><TableHead>服务器</TableHead><TableHead>自动部署</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{policies.map((policy) => <TableRow key={`${policy.certificateId}-${policy.serverId}`}><TableCell className="font-medium">{policy.certificateName}<p className="mt-1 text-xs font-normal text-muted-foreground">{policy.domain}</p></TableCell><TableCell>{policy.serverName}<p className="mt-1 text-xs text-muted-foreground">{policy.host}</p></TableCell><TableCell><Button variant="outline" size="sm" onClick={() => save(policy.certificateId, policy.serverId, !policy.autoDeploy)}><Power />{policy.autoDeploy ? "已启用" : "已停用"}</Button></TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => remove(policy)} aria-label="删除部署策略"><Trash2 className="size-4" /></Button></TableCell></TableRow>)}{policies.length === 0 && <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">还没有策略映射</TableCell></TableRow>}</TableBody></Table><div className="flex flex-wrap gap-2">{certificates.map((item) => <Button key={item.id} variant="outline" size="sm" onClick={() => setCertificate(item)}><Plus />为“{item.name}”添加服务器</Button>)}</div></CardContent><Dialog open={Boolean(certificate)} onOpenChange={(open) => !open && setCertificate(null)}><DialogContent><DialogHeader><DialogTitle>添加部署目标</DialogTitle><DialogDescription>为 {certificate?.name} 选择一个已启用服务器。</DialogDescription></DialogHeader><div className="space-y-2">{servers.filter((server) => server.enabled && !assigned.has(server.id)).map((server) => <Button key={server.id} className="w-full justify-between" variant="outline" onClick={() => certificate && save(certificate.id, server.id)}><span>{server.name}</span><span className="font-mono text-xs text-muted-foreground">{server.host}</span></Button>)}{servers.filter((server) => server.enabled && !assigned.has(server.id)).length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">没有可添加的已启用服务器。</p>}</div></DialogContent></Dialog></Card>;
}
