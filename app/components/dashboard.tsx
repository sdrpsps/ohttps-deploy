"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, CheckCircle2, CircleAlert, Clock3, Command, Globe2, LayoutDashboard, Menu, Plus, RefreshCw, Server, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Certificate = { id: string; name: string; domain: string; ohttpsCertificateId: string; status: "active" | "disabled"; expiresAt: string | null; renewBeforeDays: number };
type ManagedServer = { id: string; name: string; host: string; port: number; username: string; enabled: boolean; hostFingerprint: string | null };
type Section = "overview" | "certificates" | "servers" | "activity";

const navigation: { value: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { value: "overview", label: "总览", icon: LayoutDashboard },
  { value: "certificates", label: "证书", icon: ShieldCheck },
  { value: "servers", label: "服务器", icon: Server },
  { value: "activity", label: "任务日志", icon: Activity },
];

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "未同步";
const daysUntil = (value: string | null) => value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000) : null;

export default function Dashboard() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [servers, setServers] = useState<ManagedServer[]>([]);
  const [section, setSection] = useState<Section>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [sharedKeyConfigured, setSharedKeyConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [certificateResponse, serverResponse, keyResponse] = await Promise.all([
        fetch("/api/certificates", { cache: "no-store" }),
        fetch("/api/servers", { cache: "no-store" }),
        fetch("/api/settings/ssh-private-key", { cache: "no-store" }),
      ]);
      if (!certificateResponse.ok) throw new Error("无法加载证书列表");
      setCertificates((await certificateResponse.json()).data);
      if (serverResponse.ok) setServers((await serverResponse.json()).data);
      if (keyResponse.ok) setSharedKeyConfigured((await keyResponse.json()).data.configured);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load().catch((cause) => setError(cause.message)); }, []);

  const save = async (event: FormEvent<HTMLFormElement>, endpoint: string, done: () => void) => {
    event.preventDefault();
    setBusy(true); setError(null);
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    if (!response.ok) {
      setError((await response.json().catch(() => null))?.error?.message ?? "保存失败，请检查输入");
      setBusy(false);
      return;
    }
    event.currentTarget.reset();
    done();
    await load().catch((cause) => setError(cause.message));
    setBusy(false);
  };

  const saveSharedKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(null);
    const privateKey = new FormData(event.currentTarget).get("privateKey");
    const response = await fetch("/api/settings/ssh-private-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ privateKey }) });
    if (!response.ok) {
      setError((await response.json().catch(() => null))?.error?.message ?? "保存 SSH 私钥失败");
      setBusy(false);
      return;
    }
    event.currentTarget.reset();
    setSharedKeyConfigured(true); setKeyDialogOpen(false); setBusy(false);
  };

  const refresh = async (id: string) => {
    setBusy(true); setError(null);
    const response = await fetch(`/api/certificates/${id}/refresh`, { method: "POST" });
    if (!response.ok) setError((await response.json().catch(() => null))?.error?.message ?? "刷新任务创建失败");
    setBusy(false);
  };

  const expiring = useMemo(() => certificates.filter((certificate) => {
    const days = daysUntil(certificate.expiresAt);
    return days !== null && days <= certificate.renewBeforeDays;
  }).length, [certificates]);
  const selected = navigation.find((item) => item.value === section)?.label ?? "总览";
  const chooseSection = (value: string) => { setSection(value as Section); setMobileNavOpen(false); };
  const nav = (mobile = false) => <TabsList className="h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
    {navigation.map(({ value, label, icon: Icon }) => <TabsTrigger key={value} value={value} className="w-full justify-start gap-3 rounded-lg px-3 py-2.5 data-[state=active]:bg-slate-100 data-[state=active]:text-primary data-[state=active]:shadow-none"><Icon className="size-4" />{label}</TabsTrigger>)}
    <Button variant="ghost" className="mt-7 justify-start gap-3 px-3 text-muted-foreground" onClick={() => { setKeyDialogOpen(true); if (mobile) setMobileNavOpen(false); }}><Settings2 className="size-4" />设置</Button>
  </TabsList>;

  return <Tabs value={section} onValueChange={chooseSection} className="min-h-screen bg-slate-50 text-slate-950">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 lg:block">
      <div className="mb-8 flex items-center gap-3 px-3"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Command className="size-5" /></div><div><p className="text-[10px] font-bold tracking-[0.24em] text-primary">OHTTPS</p><p className="text-sm font-semibold">Deploy Console</p></div></div>
      {nav()}
      <Card className="absolute inset-x-4 bottom-5 border-slate-200 bg-slate-50 shadow-none"><CardContent className="p-4"><div className="flex items-center justify-between text-xs font-medium"><span>Worker 状态</span><span className="flex items-center gap-1.5 text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500" />运行中</span></div><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">自动扫描与部署任务均已启用</p></CardContent></Card>
    </aside>

    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}><SheetContent side="left" className="w-72 bg-white p-5"><SheetHeader className="mb-6 text-left"><SheetTitle className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Command className="size-5" /></span>Deploy Console</SheetTitle><SheetDescription>证书管理与部署控制台</SheetDescription></SheetHeader>{nav(true)}</SheetContent></Sheet>

    <div className="lg:pl-64"><header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-8"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="打开导航"><Menu className="size-5" /></Button><div><p className="text-xs text-muted-foreground">控制台 / <span className="text-foreground">{selected}</span></p><h1 className="font-semibold">{section === "overview" ? "早上好，Admin" : selected}</h1></div></div><div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground sm:flex"><Globe2 className="size-3.5" />Asia/Shanghai</div><Button variant="outline" size="sm" disabled={loading} onClick={() => load().catch((cause) => setError(cause.message))}><RefreshCw className={cn("size-3.5", loading && "animate-spin")} />同步状态</Button></div></header>
      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
        {error && <Alert variant="destructive"><CircleAlert className="size-4" /><AlertTitle>操作未完成</AlertTitle><AlertDescription className="flex items-center justify-between gap-3">{error}<Button variant="ghost" size="sm" onClick={() => setError(null)}>关闭</Button></AlertDescription></Alert>}

        <TabsContent value="overview" className="space-y-6"><section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-8 text-primary-foreground sm:px-8"><div className="relative z-10 max-w-xl"><Badge className="mb-4 bg-white/15 text-white hover:bg-white/15"><Sparkles className="mr-1 size-3" />安全部署中心</Badge><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">让每一次证书更新，<span className="text-cyan-200">都井然有序。</span></h2><p className="mt-3 text-sm leading-relaxed text-slate-200">集中管理证书、服务器与自动部署策略。Worker 正在后台持续守护你的 HTTPS 资产。</p><div className="mt-6 flex flex-wrap gap-3"><Button className="bg-white text-primary hover:bg-slate-100" onClick={() => setCertificateDialogOpen(true)}><Plus />添加证书</Button><Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setSection("activity")}>查看任务日志<ArrowUpRight /></Button></div></div><div className="absolute -right-12 -top-14 size-64 rounded-full border-[24px] border-white/10" /></section>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
            ["证书总数", certificates.length, "已纳入管理", ShieldCheck, "text-cyan-600 bg-cyan-50"],
            ["需要关注", expiring, "续期窗口内", Clock3, "text-amber-600 bg-amber-50"],
            ["在线服务器", `${servers.filter((server) => server.enabled).length}/${servers.length}`, "连接配置", Server, "text-violet-600 bg-violet-50"],
            ["系统状态", "正常", "Worker 运行中", CheckCircle2, "text-emerald-600 bg-emerald-50"],
          ].map(([label, value, detail, Icon, color]) => { const MetricIcon = Icon as typeof ShieldCheck; return <Card key={label as string}><CardContent className="flex items-start justify-between p-5"><div><p className="text-xs font-medium text-muted-foreground">{label as string}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value as string | number}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail as string}</p></div><div className={cn("grid size-10 place-items-center rounded-xl", color as string)}><MetricIcon className="size-5" /></div></CardContent></Card>; })}</section>
          <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>证书资产</CardTitle><CardDescription>已管理 {certificates.length} 张证书，其中 {expiring} 张需要关注</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => setSection("certificates")}>查看证书<ArrowUpRight /></Button></CardContent></Card><Card><CardHeader><CardTitle>服务器节点</CardTitle><CardDescription>{servers.filter((server) => server.enabled).length} 个已启用目标准备接收部署</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => setSection("servers")}>管理服务器<ArrowUpRight /></Button></CardContent></Card></div>
        </TabsContent>

        <TabsContent value="certificates"><Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>证书</CardTitle><CardDescription>管理 ohttps 证书及其续期状态</CardDescription></div><Button onClick={() => setCertificateDialogOpen(true)}><Plus />添加证书</Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>域名</TableHead><TableHead>到期时间</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">加载中...</TableCell></TableRow> : certificates.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无证书</TableCell></TableRow> : certificates.map((certificate) => { const days = daysUntil(certificate.expiresAt); const needsAttention = days !== null && days <= certificate.renewBeforeDays; return <TableRow key={certificate.id}><TableCell className="font-medium">{certificate.name}<p className="mt-1 text-xs font-normal text-muted-foreground">ID · {certificate.ohttpsCertificateId}</p></TableCell><TableCell>{certificate.domain}</TableCell><TableCell>{formatDate(certificate.expiresAt)}{days !== null && <p className="mt-1 text-xs text-muted-foreground">{days > 0 ? `${days} 天后` : "已过期"}</p>}</TableCell><TableCell><Badge variant={certificate.status === "disabled" ? "secondary" : needsAttention ? "outline" : "default"} className={needsAttention && certificate.status === "active" ? "border-amber-200 bg-amber-50 text-amber-700" : ""}>{certificate.status === "disabled" ? "停用" : needsAttention ? "需关注" : "正常"}</Badge></TableCell><TableCell className="text-right"><Button variant="outline" size="sm" disabled={busy} onClick={() => refresh(certificate.id)}><RefreshCw />立即刷新</Button></TableCell></TableRow>; })}</TableBody></Table></CardContent></Card></TabsContent>

        <TabsContent value="servers"><Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>服务器</CardTitle><CardDescription>所有服务器使用设置中的共享 SSH 私钥</CardDescription></div><Button onClick={() => setServerDialogOpen(true)}><Plus />添加服务器</Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>地址</TableHead><TableHead>主机指纹</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">加载中...</TableCell></TableRow> : servers.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">暂无服务器</TableCell></TableRow> : servers.map((server) => <TableRow key={server.id}><TableCell className="font-medium">{server.name}</TableCell><TableCell>{server.username}@{server.host}:{server.port}</TableCell><TableCell className="font-mono text-xs">{server.hostFingerprint ? `${server.hostFingerprint.slice(0, 24)}…` : "未设置"}</TableCell><TableCell><Badge variant={server.enabled ? "default" : "secondary"}>{server.enabled ? "启用" : "停用"}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>

        <TabsContent value="activity"><Card><CardHeader><CardTitle>任务日志</CardTitle><CardDescription>实时查看证书同步与服务器部署事件</CardDescription></CardHeader><CardContent><div className="grid min-h-64 place-items-center rounded-lg border border-dashed bg-muted/30 text-center"><div><Activity className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="text-sm font-medium">暂无最近任务</p><p className="mt-1 text-xs text-muted-foreground">创建证书或执行刷新后，任务日志会显示在这里</p></div></div></CardContent></Card></TabsContent>
      </main>
    </div>

    <Dialog open={certificateDialogOpen} onOpenChange={setCertificateDialogOpen}><DialogContent><DialogHeader><DialogTitle>添加证书</DialogTitle><DialogDescription>接入 ohttps 证书并设置续期提醒</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => save(event, "/api/certificates", () => setCertificateDialogOpen(false))}><div className="space-y-2"><Label htmlFor="name">名称</Label><Input id="name" name="name" placeholder="生产环境主站" required /></div><div className="space-y-2"><Label htmlFor="domain">域名</Label><Input id="domain" name="domain" placeholder="example.com" required /></div><div className="space-y-2"><Label htmlFor="certificate-id">ohttps 证书 ID</Label><Input id="certificate-id" name="ohttpsCertificateId" placeholder="cert_xxxxxxxxx" required /></div><div className="space-y-2"><Label htmlFor="renew-before">提前续期天数</Label><Input id="renew-before" name="renewBeforeDays" type="number" min={1} max={365} defaultValue={20} required /></div><Button className="w-full" disabled={busy}>{busy ? "提交中..." : "创建证书"}</Button></form></DialogContent></Dialog>

    <Dialog open={serverDialogOpen} onOpenChange={setServerDialogOpen}><DialogContent><DialogHeader><DialogTitle>添加服务器</DialogTitle><DialogDescription>配置 SSH 连接与主机指纹；私钥由共享设置统一管理。</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => save(event, "/api/servers", () => setServerDialogOpen(false))}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="server-name">名称</Label><Input id="server-name" name="name" placeholder="Nginx · Tokyo" required /></div><div className="space-y-2"><Label htmlFor="server-host">主机</Label><Input id="server-host" name="host" placeholder="host.example.com" required /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="server-port">端口</Label><Input id="server-port" name="port" type="number" defaultValue={22} required /></div><div className="space-y-2"><Label htmlFor="server-user">用户名</Label><Input id="server-user" name="username" defaultValue="root" required /></div></div><div className="space-y-2"><Label htmlFor="server-fingerprint">主机指纹</Label><Input id="server-fingerprint" name="hostFingerprint" placeholder="SHA256:..." required /></div><Button className="w-full" disabled={busy}>{busy ? "保存中..." : "保存服务器"}</Button></form></DialogContent></Dialog>

    <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}><DialogContent><DialogHeader><DialogTitle>共享 SSH 私钥</DialogTitle><DialogDescription>{sharedKeyConfigured ? "已配置。粘贴新内容会替换当前密钥。" : "配置后，所有服务器将使用这把私钥连接。"}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={saveSharedKey}><div className="space-y-2"><Label htmlFor="shared-private-key">私钥内容</Label><Textarea id="shared-private-key" name="privateKey" required autoComplete="off" spellCheck={false} className="min-h-48 font-mono text-xs" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" /></div><p className="text-xs text-muted-foreground">私钥仅提交给服务端 SQLite，不会在界面或 API 中再次显示。</p><Button className="w-full" disabled={busy}>{busy ? "保存中..." : "保存私钥"}</Button></form></DialogContent></Dialog>
  </Tabs>;
}
