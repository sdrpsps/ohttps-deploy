"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Command, LayoutDashboard, Menu, Pencil, Plus, RefreshCw, Server, Settings2, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ActivityPanel } from "@/components/activity-panel";
import { PoliciesPanel } from "@/components/policies-panel";
import { cn } from "@/lib/utils";
import { z } from "zod";

type Certificate = { id: string; name: string; domain: string; ohttpsCertificateId: string; status: "active" | "disabled"; expiresAt: string | null; renewBeforeDays: number };
type ManagedServer = { id: string; name: string; host: string; port: number; username: string; enabled: boolean; hostFingerprint: string | null };
export type DashboardSection = "overview" | "certificates" | "servers" | "policies" | "activity";

const navigation: { value: DashboardSection; label: string; description: string; href: string; icon: typeof LayoutDashboard }[] = [
  { value: "overview", label: "总览", description: "证书与部署状态概览", href: "/", icon: LayoutDashboard },
  { value: "certificates", label: "证书", description: "管理证书、续期阈值与当前状态", href: "/certificates", icon: ShieldCheck },
  { value: "servers", label: "服务器", description: "管理部署目标与 SSH 连接配置", href: "/servers", icon: Server },
  { value: "policies", label: "部署策略", description: "配置证书到服务器的自动部署映射", href: "/deployment-policies", icon: Settings2 },
  { value: "activity", label: "任务日志", description: "查看部署任务、实时日志与审计记录", href: "/deployments", icon: Activity },
];

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(value)) : "未同步";
const daysUntil = (value: string | null) => value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000) : null;
const certificateSchema = z.object({ name: z.string().min(1, "请输入名称"), domain: z.string().min(1, "请输入域名"), ohttpsCertificateId: z.string().min(1, "请输入证书 ID"), renewBeforeDays: z.coerce.number().int().min(1).max(365) });
const serverSchema = z.object({ name: z.string().min(1, "请输入名称"), host: z.string().min(1, "请输入主机"), port: z.coerce.number().int().min(1).max(65535), username: z.string().min(1, "请输入用户名"), hostFingerprint: z.string().min(1, "请输入主机指纹") });
const privateKeySchema = z.object({ privateKey: z.string().min(1, "请输入私钥内容") });

export default function Dashboard({ section = "overview" }: { section?: DashboardSection }) {
  const router = useRouter();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [servers, setServers] = useState<ManagedServer[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [serverDialogOpen, setServerDialogOpen] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [sharedKeyConfigured, setSharedKeyConfigured] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "certificate" | "server"; id: string; name: string } | null>(null);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [editingServer, setEditingServer] = useState<ManagedServer | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const certificateForm = useForm<z.infer<typeof certificateSchema>>({ resolver: zodResolver(certificateSchema), defaultValues: { name: "", domain: "", ohttpsCertificateId: "", renewBeforeDays: 20 } });
  const serverForm = useForm<z.infer<typeof serverSchema>>({ resolver: zodResolver(serverSchema), defaultValues: { name: "", host: "", port: 22, username: "cert", hostFingerprint: "" } });
  const privateKeyForm = useForm<z.infer<typeof privateKeySchema>>({ resolver: zodResolver(privateKeySchema), defaultValues: { privateKey: "" } });

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

  useEffect(() => { load().catch((cause) => toast.error(cause.message)); }, []);

  const save = async (endpoint: string, data: Record<string, unknown>, done: () => void, message: string, method = "POST") => {
    setBusy(true);
    const response = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    if (!response.ok) {
      toast.error((await response.json().catch(() => null))?.error?.message ?? "保存失败，请检查输入");
      setBusy(false);
      return;
    }
    done();
    toast.success(message);
    await load().catch((cause) => toast.error(cause.message));
    setBusy(false);
  };

  const refresh = async (id: string) => {
    setBusy(true);
    const response = await fetch(`/api/certificates/${id}/refresh`, { method: "POST" });
    if (!response.ok) toast.error((await response.json().catch(() => null))?.error?.message ?? "刷新任务创建失败");
    else toast.success("刷新任务已创建");
    setBusy(false);
  };

  const testConnection = async (server: ManagedServer) => {
    setBusy(true);
    const response = await fetch(`/api/servers/${server.id}/test-connection`, { method: "POST" });
    const body = await response.json().catch(() => null);
    if (!response.ok) toast.error(body?.error?.message ?? body?.data?.error ?? "连接测试失败");
    else toast.success(`${server.name} 连接成功，主机指纹已校验。`);
    setBusy(false);
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const response = await fetch(`/api/${deleteTarget.type === "certificate" ? "certificates" : "servers"}/${deleteTarget.id}`, { method: "DELETE" });
    if (!response.ok) toast.error((await response.json().catch(() => null))?.error?.message ?? "删除失败");
    else { toast.success(`${deleteTarget.name} 已删除`); setDeleteTarget(null); await load().catch((cause) => toast.error(cause.message)); }
    setBusy(false);
  };

  const editCertificate = (certificate: Certificate) => { certificateForm.reset({ name: certificate.name, domain: certificate.domain, ohttpsCertificateId: certificate.ohttpsCertificateId, renewBeforeDays: certificate.renewBeforeDays }); setEditingCertificate(certificate); setCertificateDialogOpen(true); };
  const editServer = (server: ManagedServer) => { serverForm.reset({ name: server.name, host: server.host, port: server.port, username: server.username, hostFingerprint: server.hostFingerprint ?? "" }); setEditingServer(server); setServerDialogOpen(true); };

  const expiring = useMemo(() => certificates.filter((certificate) => {
    const days = daysUntil(certificate.expiresAt);
    return days !== null && days <= certificate.renewBeforeDays;
  }).length, [certificates]);
  const selected = navigation.find((item) => item.value === section) ?? navigation[0];
  const chooseSection = (value: string) => { const item = navigation.find((entry) => entry.value === value); if (item) router.push(item.href); setMobileNavOpen(false); };
  const nav = (mobile = false) => <TabsList className="h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
    {navigation.map(({ value, label, icon: Icon }) => <TabsTrigger key={value} value={value} className="w-full justify-start gap-3 rounded-lg px-3 py-2.5 data-[state=active]:bg-slate-100 data-[state=active]:text-primary data-[state=active]:shadow-none"><Icon className="size-4" />{label}</TabsTrigger>)}
    <Button variant="ghost" className="mt-7 justify-start gap-3 px-3 text-muted-foreground" onClick={() => { setKeyDialogOpen(true); if (mobile) setMobileNavOpen(false); }}><Settings2 className="size-4" />设置</Button>
  </TabsList>;

  return <Tabs value={section} onValueChange={chooseSection} className="min-h-screen bg-slate-50 text-slate-950">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 lg:block">
      <div className="mb-8 flex items-center gap-3 px-3"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Command className="size-5" /></div><div><p className="text-[10px] font-bold tracking-[0.24em] text-primary">OHTTPS</p><p className="text-sm font-semibold">Deploy Console</p></div></div>
      {nav()}
      <Card className="absolute inset-x-4 bottom-5 border-slate-200 bg-slate-50 shadow-none"><CardContent className="p-4"><div className="flex items-center justify-between text-xs font-medium"><span>Worker 队列</span><span className="flex items-center gap-1.5 text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500" />已启用</span></div><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Worker 会轮询并执行已创建的部署任务。</p></CardContent></Card>
    </aside>

    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}><SheetContent side="left" className="w-72 bg-white p-5"><SheetHeader className="mb-6 text-left"><SheetTitle className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Command className="size-5" /></span>Deploy Console</SheetTitle><SheetDescription>证书管理与部署控制台</SheetDescription></SheetHeader>{nav(true)}</SheetContent></Sheet>

    <div className="lg:pl-64"><header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-8"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="打开导航"><Menu className="size-5" /></Button><div><h1 className="text-base font-semibold">{selected.label}</h1><p className="text-xs text-muted-foreground">{selected.description}</p></div></div><Button variant="outline" size="sm" disabled={loading} onClick={() => load().catch((cause) => toast.error(cause.message))}><RefreshCw className={cn("size-3.5", loading && "animate-spin")} />同步状态</Button></header>
      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">

        <TabsContent value="overview" className="space-y-6"><section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-8 text-primary-foreground sm:px-8"><div className="relative z-10 max-w-xl"><Badge className="mb-4 bg-white/15 text-white hover:bg-white/15"><Sparkles className="mr-1 size-3" />安全部署中心</Badge><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">让每一次证书更新，<span className="text-cyan-200">都井然有序。</span></h2><p className="mt-3 text-sm leading-relaxed text-slate-200">集中管理证书、服务器与自动部署策略。Worker 正在后台持续守护你的 HTTPS 资产。</p><div className="mt-6 flex flex-wrap gap-3"><Button className="bg-white text-primary hover:bg-slate-100" onClick={() => { certificateForm.reset(); setEditingCertificate(null); setCertificateDialogOpen(true); }}><Plus />添加证书</Button><Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => chooseSection("activity")}>查看任务日志<ArrowUpRight /></Button></div></div><div className="absolute -right-12 -top-14 size-64 rounded-full border-[24px] border-white/10" /></section>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
            ["证书总数", certificates.length, "已纳入管理", ShieldCheck, "text-cyan-600 bg-cyan-50"],
            ["需要关注", expiring, "续期窗口内", Clock3, "text-amber-600 bg-amber-50"],
            ["在线服务器", `${servers.filter((server) => server.enabled).length}/${servers.length}`, "连接配置", Server, "text-violet-600 bg-violet-50"],
            ["系统状态", "正常", "Worker 运行中", CheckCircle2, "text-emerald-600 bg-emerald-50"],
          ].map(([label, value, detail, Icon, color]) => { const MetricIcon = Icon as typeof ShieldCheck; return <Card key={label as string}><CardContent className="flex items-start justify-between p-5"><div><p className="text-xs font-medium text-muted-foreground">{label as string}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value as string | number}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail as string}</p></div><div className={cn("grid size-10 place-items-center rounded-xl", color as string)}><MetricIcon className="size-5" /></div></CardContent></Card>; })}</section>
          <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>证书资产</CardTitle><CardDescription>已管理 {certificates.length} 张证书，其中 {expiring} 张需要关注</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => chooseSection("certificates")}>查看证书<ArrowUpRight /></Button></CardContent></Card><Card><CardHeader><CardTitle>服务器节点</CardTitle><CardDescription>{servers.filter((server) => server.enabled).length} 个已启用目标准备接收部署</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => chooseSection("servers")}>管理服务器<ArrowUpRight /></Button></CardContent></Card></div>
        </TabsContent>

        <TabsContent value="certificates"><Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>证书</CardTitle><CardDescription>管理 ohttps 证书及其续期状态</CardDescription></div><Button onClick={() => { certificateForm.reset(); setEditingCertificate(null); setCertificateDialogOpen(true); }}><Plus />添加证书</Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>域名</TableHead><TableHead>到期时间</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">加载中...</TableCell></TableRow> : certificates.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无证书</TableCell></TableRow> : certificates.map((certificate) => { const days = daysUntil(certificate.expiresAt); const needsAttention = days !== null && days <= certificate.renewBeforeDays; return <TableRow key={certificate.id}><TableCell className="font-medium">{certificate.name}<p className="mt-1 text-xs font-normal text-muted-foreground">ID · {certificate.ohttpsCertificateId}</p></TableCell><TableCell>{certificate.domain}</TableCell><TableCell>{formatDate(certificate.expiresAt)}{days !== null && <p className="mt-1 text-xs text-muted-foreground">{days > 0 ? `${days} 天后` : "已过期"}</p>}</TableCell><TableCell><Badge variant={certificate.status === "disabled" ? "secondary" : needsAttention ? "outline" : "default"} className={needsAttention && certificate.status === "active" ? "border-amber-200 bg-amber-50 text-amber-700" : ""}>{certificate.status === "disabled" ? "停用" : needsAttention ? "需关注" : "正常"}</Badge></TableCell><TableCell className="space-x-1 text-right"><Button variant="outline" size="sm" disabled={busy} onClick={() => refresh(certificate.id)}><RefreshCw />立即刷新</Button><Button variant="ghost" size="icon" disabled={busy} onClick={() => editCertificate(certificate)} aria-label={`编辑证书 ${certificate.name}`}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" disabled={busy} onClick={() => setDeleteTarget({ type: "certificate", id: certificate.id, name: certificate.name })} aria-label={`删除证书 ${certificate.name}`}><Trash2 className="size-4 text-destructive" /></Button></TableCell></TableRow>; })}</TableBody></Table></CardContent></Card></TabsContent>

        <TabsContent value="servers"><Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>服务器</CardTitle><CardDescription>所有服务器使用设置中的共享 SSH 私钥</CardDescription></div><Button onClick={() => { serverForm.reset(); setEditingServer(null); setServerDialogOpen(true); }}><Plus />添加服务器</Button></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>地址</TableHead><TableHead>主机指纹</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">加载中...</TableCell></TableRow> : servers.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">暂无服务器</TableCell></TableRow> : servers.map((server) => <TableRow key={server.id}><TableCell className="font-medium">{server.name}</TableCell><TableCell>{server.username}@{server.host}:{server.port}</TableCell><TableCell className="font-mono text-xs">{server.hostFingerprint ? `${server.hostFingerprint.slice(0, 24)}…` : "未设置"}</TableCell><TableCell><Badge variant={server.enabled ? "default" : "secondary"}>{server.enabled ? "启用" : "停用"}</Badge></TableCell><TableCell className="space-x-1 text-right"><Button variant="outline" size="sm" disabled={busy || !server.hostFingerprint} onClick={() => testConnection(server)}><RefreshCw />测试连接</Button><Button variant="ghost" size="icon" disabled={busy} onClick={() => editServer(server)} aria-label={`编辑服务器 ${server.name}`}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" disabled={busy} onClick={() => setDeleteTarget({ type: "server", id: server.id, name: server.name })} aria-label={`删除服务器 ${server.name}`}><Trash2 className="size-4 text-destructive" /></Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>

        <TabsContent value="policies"><PoliciesPanel certificates={certificates} servers={servers} /></TabsContent>

        <TabsContent value="activity"><ActivityPanel certificates={certificates} servers={servers} /></TabsContent>
      </main>
    </div>

    <Dialog open={certificateDialogOpen} onOpenChange={(open) => { setCertificateDialogOpen(open); if (!open) setEditingCertificate(null); }}><DialogContent><DialogHeader><DialogTitle>{editingCertificate ? "编辑证书" : "添加证书"}</DialogTitle><DialogDescription>{editingCertificate ? "修改证书配置，不会覆盖已缓存的证书版本。" : "接入 ohttps 证书并设置续期提醒"}</DialogDescription></DialogHeader><Form {...certificateForm}><form className="space-y-4" onSubmit={certificateForm.handleSubmit((values) => save(editingCertificate ? `/api/certificates/${editingCertificate.id}` : "/api/certificates", values, () => { certificateForm.reset(); setEditingCertificate(null); setCertificateDialogOpen(false); }, editingCertificate ? "证书已更新" : "证书已创建", editingCertificate ? "PATCH" : "POST"))}>{(["name", "domain", "ohttpsCertificateId"] as const).map((name) => <FormField key={name} control={certificateForm.control} name={name} render={({ field }) => <FormItem><FormLabel>{name === "name" ? "名称" : name === "domain" ? "域名" : "ohttps 证书 ID"}</FormLabel><FormControl><Input placeholder={name === "name" ? "生产环境主站" : name === "domain" ? "example.com" : "cert_xxxxxxxxx"} {...field} /></FormControl><FormMessage /></FormItem>} />)}<FormField control={certificateForm.control} name="renewBeforeDays" render={({ field }) => <FormItem><FormLabel>提前续期天数</FormLabel><FormControl><Input type="number" min={1} max={365} {...field} onChange={(event) => field.onChange(event.target.valueAsNumber)} /></FormControl><FormMessage /></FormItem>} /><Button className="w-full" disabled={busy}>{busy ? "保存中..." : editingCertificate ? "保存修改" : "创建证书"}</Button></form></Form></DialogContent></Dialog>

    <Dialog open={serverDialogOpen} onOpenChange={(open) => { setServerDialogOpen(open); if (!open) setEditingServer(null); }}><DialogContent><DialogHeader><DialogTitle>{editingServer ? "编辑服务器" : "添加服务器"}</DialogTitle><DialogDescription>配置 SSH 连接与主机指纹；私钥由共享设置统一管理。</DialogDescription></DialogHeader><Form {...serverForm}><form className="space-y-4" onSubmit={serverForm.handleSubmit((values) => save(editingServer ? `/api/servers/${editingServer.id}` : "/api/servers", values, () => { serverForm.reset(); setEditingServer(null); setServerDialogOpen(false); }, editingServer ? "服务器已更新" : "服务器已保存", editingServer ? "PATCH" : "POST"))}><div className="grid gap-4 sm:grid-cols-2">{(["name", "host"] as const).map((name) => <FormField key={name} control={serverForm.control} name={name} render={({ field }) => <FormItem><FormLabel>{name === "name" ? "名称" : "主机"}</FormLabel><FormControl><Input placeholder={name === "name" ? "Nginx · Tokyo" : "host.example.com"} {...field} /></FormControl><FormMessage /></FormItem>} />)}</div><div className="grid gap-4 sm:grid-cols-2"><FormField control={serverForm.control} name="port" render={({ field }) => <FormItem><FormLabel>端口</FormLabel><FormControl><Input type="number" {...field} onChange={(event) => field.onChange(event.target.valueAsNumber)} /></FormControl><FormMessage /></FormItem>} /><FormField control={serverForm.control} name="username" render={({ field }) => <FormItem><FormLabel>用户名</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} /></div><FormField control={serverForm.control} name="hostFingerprint" render={({ field }) => <FormItem><FormLabel>主机指纹</FormLabel><FormControl><Input placeholder="SHA256:..." {...field} /></FormControl><FormMessage /></FormItem>} /><Button className="w-full" disabled={busy}>{busy ? "保存中..." : editingServer ? "保存修改" : "保存服务器"}</Button></form></Form></DialogContent></Dialog>

    <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}><DialogContent><DialogHeader><DialogTitle>共享 SSH 私钥</DialogTitle><DialogDescription>{sharedKeyConfigured ? "已配置。粘贴新内容会替换当前密钥。" : "配置后，所有服务器将使用这把私钥连接。"}</DialogDescription></DialogHeader><Form {...privateKeyForm}><form className="space-y-4" onSubmit={privateKeyForm.handleSubmit((values) => save("/api/settings/ssh-private-key", values, () => { privateKeyForm.reset(); setSharedKeyConfigured(true); setKeyDialogOpen(false); }, "SSH 私钥已保存"))}><FormField control={privateKeyForm.control} name="privateKey" render={({ field }) => <FormItem><FormLabel>私钥内容</FormLabel><FormControl><Textarea autoComplete="off" spellCheck={false} className="min-h-48 font-mono text-xs" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" {...field} /></FormControl><FormMessage /></FormItem>} /><p className="text-xs text-muted-foreground">私钥仅提交给服务端 SQLite，不会在界面或 API 中再次显示。</p><Button className="w-full" disabled={busy}>{busy ? "保存中..." : "保存私钥"}</Button></form></Form></DialogContent></Dialog>
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>确认删除</DialogTitle><DialogDescription>将删除“{deleteTarget?.name}”及其未使用的策略映射。已有证书版本或部署历史的对象不能删除，请改为停用。</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={remove}>删除</Button></div></DialogContent></Dialog>
  </Tabs>;
}
