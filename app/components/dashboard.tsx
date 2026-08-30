"use client";

import { FormEvent, useEffect, useState } from "react";
import { Activity, Plus, RefreshCw, ShieldCheck, Server, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Certificate = { id: string; name: string; domain: string; ohttpsCertificateId: string; status: "active" | "disabled"; expiresAt: string | null; renewBeforeDays: number };
type ManagedServer = { id: string; name: string; host: string; port: number; username: string; enabled: boolean; hostFingerprint: string | null };

export default function Dashboard() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [servers, setServers] = useState<ManagedServer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showServerForm, setShowServerForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/certificates", { cache: "no-store" });
    if (!response.ok) throw new Error("无法加载证书列表");
    setCertificates((await response.json()).data);
    const serverResponse = await fetch("/api/servers", { cache: "no-store" });
    if (serverResponse.ok) setServers((await serverResponse.json()).data);
  };

  const createServer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null);
    const response = await fetch("/api/servers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    if (!response.ok) { setError((await response.json().catch(() => null))?.error?.message ?? "创建服务器失败"); setBusy(false); return; }
    event.currentTarget.reset(); setShowServerForm(false); await load(); setBusy(false);
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  const createCertificate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/certificates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    if (!response.ok) { setError("创建证书失败，请检查输入"); setBusy(false); return; }
    event.currentTarget.reset(); setShowForm(false); await load(); setBusy(false);
  };

  const refresh = async (id: string) => {
    setBusy(true); setError(null);
    const response = await fetch(`/api/certificates/${id}/refresh`, { method: "POST" });
    if (!response.ok) setError((await response.json().catch(() => null))?.error?.message ?? "刷新任务创建失败");
    setBusy(false);
  };

  const expiring = certificates.filter((item) => item.expiresAt && new Date(item.expiresAt).getTime() - Date.now() < item.renewBeforeDays * 86400000).length;
  return <main className="min-h-screen bg-background">
    <header className="border-b bg-card"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><div><p className="text-sm font-medium text-primary">SSL DEPLOY</p><h1 className="text-2xl font-semibold tracking-tight">证书控制台</h1></div><Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" />添加证书</Button></div></header>
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="grid gap-4 md:grid-cols-3"><Card><CardContent className="flex items-center gap-4 p-5"><ShieldCheck className="h-8 w-8 text-primary" /><div><p className="text-2xl font-semibold">{certificates.length}</p><p className="text-sm text-muted-foreground">证书总数</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><Activity className="h-8 w-8 text-amber-500" /><div><p className="text-2xl font-semibold">{expiring}</p><p className="text-sm text-muted-foreground">需要关注</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-5"><Server className="h-8 w-8 text-emerald-600" /><div><p className="text-2xl font-semibold">Worker</p><p className="text-sm text-muted-foreground">任务执行器</p></div></CardContent></Card></div>
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
      <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>证书</CardTitle><Button variant="ghost" size="icon" onClick={() => load().catch((e) => setError(e.message))} aria-label="刷新列表"><RefreshCw className="h-4 w-4" /></Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>域名</TableHead><TableHead>到期时间</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{certificates.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无证书</TableCell></TableRow> : certificates.map((certificate) => <TableRow key={certificate.id}><TableCell className="font-medium">{certificate.name}</TableCell><TableCell>{certificate.domain}</TableCell><TableCell>{certificate.expiresAt ? new Date(certificate.expiresAt).toLocaleDateString() : "未同步"}</TableCell><TableCell><Badge variant={certificate.status === "active" ? "default" : "secondary"}>{certificate.status === "active" ? "启用" : "停用"}</Badge></TableCell><TableCell className="text-right"><Button variant="outline" size="sm" disabled={busy} onClick={() => refresh(certificate.id)}><RefreshCw className="mr-2 h-3.5 w-3.5" />立即刷新</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>服务器</CardTitle><Button size="sm" onClick={() => setShowServerForm(true)}><Plus className="mr-2 h-4 w-4" />添加服务器</Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>地址</TableHead><TableHead>主机指纹</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{servers.length === 0 ? <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">暂无服务器</TableCell></TableRow> : servers.map((server) => <TableRow key={server.id}><TableCell className="font-medium">{server.name}</TableCell><TableCell>{server.username}@{server.host}:{server.port}</TableCell><TableCell className="font-mono text-xs">{server.hostFingerprint ? `${server.hostFingerprint.slice(0, 24)}...` : "未设置"}</TableCell><TableCell><Badge variant={server.enabled ? "default" : "secondary"}>{server.enabled ? "启用" : "停用"}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-lg"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>添加证书</CardTitle><Button variant="ghost" size="icon" onClick={() => setShowForm(false)} aria-label="关闭"><X className="h-4 w-4" /></Button></CardHeader><CardContent><form className="space-y-4" onSubmit={createCertificate}><div className="space-y-2"><Label htmlFor="name">名称</Label><Input id="name" name="name" required /></div><div className="space-y-2"><Label htmlFor="domain">域名</Label><Input id="domain" name="domain" placeholder="example.com" required /></div><div className="space-y-2"><Label htmlFor="ohttpsCertificateId">ohttps 证书 ID</Label><Input id="ohttpsCertificateId" name="ohttpsCertificateId" required /></div><div className="space-y-2"><Label htmlFor="renewBeforeDays">提前续期天数</Label><Input id="renewBeforeDays" name="renewBeforeDays" type="number" min={1} max={365} defaultValue={20} /></div><Button className="w-full" disabled={busy}>{busy ? "提交中..." : "创建证书"}</Button></form></CardContent></Card></div>}
    {showServerForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-lg"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>添加服务器</CardTitle><Button variant="ghost" size="icon" onClick={() => setShowServerForm(false)} aria-label="关闭"><X className="h-4 w-4" /></Button></CardHeader><CardContent><form className="space-y-4" onSubmit={createServer}><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="server-name">名称</Label><Input id="server-name" name="name" required /></div><div className="space-y-2"><Label htmlFor="server-host">主机</Label><Input id="server-host" name="host" required /></div></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="server-port">端口</Label><Input id="server-port" name="port" type="number" defaultValue={22} /></div><div className="space-y-2"><Label htmlFor="server-user">用户名</Label><Input id="server-user" name="username" defaultValue="root" required /></div></div><div className="space-y-2"><Label htmlFor="server-auth">SSH 私钥引用</Label><Input id="server-auth" name="authRef" placeholder="shared-key" required /></div><div className="space-y-2"><Label htmlFor="server-fingerprint">主机指纹</Label><Input id="server-fingerprint" name="hostFingerprint" placeholder="SHA256:..." required /></div><Button className="w-full" disabled={busy}>{busy ? "提交中..." : "保存服务器"}</Button></form></CardContent></Card></div>}
  </main>;
}
