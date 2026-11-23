import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Plus,
  Server,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, daysUntil, formatDate } from "@/lib/utils";
import type { Certificate, ManagedServer } from "./types";

type OverviewPanelProps = {
  certificates: Certificate[];
  servers: ManagedServer[];
  expiringCount: number;
  onCreateCertificate: () => void;
  onNavigate: (section: "certificates" | "servers" | "policies" | "activity") => void;
  workerOnline: boolean;
  failedDeployments: number;
  failedSyncJobs: number;
  onHandleFailedDeployments?: () => void;
  onHandleFailedSyncJobs?: () => void;
};

export function OverviewPanel({
  certificates,
  servers,
  expiringCount,
  onCreateCertificate,
  onNavigate,
  workerOnline,
  failedDeployments,
  failedSyncJobs,
  onHandleFailedDeployments,
  onHandleFailedSyncJobs,
}: OverviewPanelProps) {
  const enabledServers = servers.filter((server) => server.enabled).length;
  const activeCerts = certificates.filter((c) => c.status === "active").length;

  const metrics = [
    {
      label: "证书总数",
      value: certificates.length,
      detail: `${activeCerts} 张已启用`,
      icon: ShieldCheck,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      onClick: () => onNavigate("certificates"),
    },
    {
      label: "续期窗口内",
      value: expiringCount,
      detail: expiringCount > 0 ? "点击查看即将到期证书" : "暂无即将到期证书",
      icon: Clock3,
      iconColor: expiringCount > 0 ? "text-amber-500" : "text-emerald-500",
      iconBg: expiringCount > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
      onClick: () => onNavigate("certificates"),
    },
    {
      label: "部署服务器",
      value: `${enabledServers}/${servers.length}`,
      detail: `${enabledServers} 台已启用`,
      icon: Server,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      onClick: () => onNavigate("servers"),
    },
    {
      label: "Worker 状态",
      value: workerOnline ? "运行中" : "已离线",
      detail: workerOnline ? "后台自动扫描与调度正常" : "自动同步与部署已暂停",
      icon: workerOnline ? CheckCircle2 : AlertCircle,
      iconColor: workerOnline ? "text-emerald-500" : "text-rose-500",
      iconBg: workerOnline ? "bg-emerald-500/10" : "bg-rose-500/10",
      onClick: () => onNavigate("activity"),
    },
  ];

  // Top expiring or recent certificates (up to 5)
  const sortedCertificates = [...certificates].sort((a, b) => {
    const daysA = daysUntil(a.expiresAt) ?? 9999;
    const daysB = daysUntil(b.expiresAt) ?? 9999;
    return daysA - daysB;
  }).slice(0, 5);

  // Top servers (up to 5)
  const displayServers = servers.slice(0, 5);

  const nextActions = [
    !workerOnline && {
      type: "danger" as const,
      title: "Worker 服务离线",
      description: "后台扫描与自动推送已暂停，请检查 Worker 容器。",
      action: "查看活动",
      onClick: () => onNavigate("activity"),
    },
    failedDeployments > 0 && {
      type: "danger" as const,
      title: `${failedDeployments} 个部署任务失败`,
      description: "部分目标服务器未能成功更新证书，建议立即排查并重试。",
      action: "排查部署",
      onClick: onHandleFailedDeployments ?? (() => onNavigate("activity")),
    },
    failedSyncJobs > 0 && {
      type: "warning" as const,
      title: `${failedSyncJobs} 个证书同步失败`,
      description: "从 ohttps 拉取证书失败，请检查网络或 API 凭据。",
      action: "查看同步",
      onClick: onHandleFailedSyncJobs ?? (() => onNavigate("certificates")),
    },
    expiringCount > 0 && {
      type: "warning" as const,
      title: `${expiringCount} 张证书进入续期窗口`,
      description: "已达到预设提前续期天数，请确认自动同步及部署状态。",
      action: "查看证书",
      onClick: () => onNavigate("certificates"),
    },
  ].filter(Boolean) as NextAction[];

  return (
    <div className="space-y-5">
      {/* 1. Ops Todo / Next Actions (Top priority in F-pattern) */}
      <NextActions items={nextActions} />

      {/* 2. Core Metrics Grid (Clickable) */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, iconColor, iconBg, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="group rounded-xl border bg-card p-4 text-left transition-all duration-150 hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <div className={cn("grid size-8 place-items-center rounded-lg", iconBg, iconColor)}>
                <Icon className="size-4" />
              </div>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
              <ArrowRight className="size-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </button>
        ))}
      </section>

      {/* 3. Asset Preview */}
      <section className="grid gap-5 lg:grid-cols-2">
        {/* Certificates Quick View */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">证书状态</CardTitle>
              <span className="font-mono text-xs text-muted-foreground">({certificates.length})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-xs" onClick={onCreateCertificate}>
                <Plus className="size-3.5" />
                添加证书
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => onNavigate("certificates")}>
                全部
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {sortedCertificates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ShieldCheck className="size-8 text-muted-foreground/40" />
                <p className="mt-2.5 text-xs font-medium text-muted-foreground">暂无托管证书</p>
                <Button size="sm" className="mt-3 h-7 gap-1 px-2.5 text-xs" onClick={onCreateCertificate}>
                  <Plus className="size-3.5" /> 添加第一张证书
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {sortedCertificates.map((cert) => {
                  const days = daysUntil(cert.expiresAt);
                  const isExpiring = days !== null && days <= cert.renewBeforeDays;
                  const isExpired = days !== null && days <= 0;
                  const isDisabled = cert.status === "disabled";

                  return (
                    <button
                      key={cert.id}
                      type="button"
                      onClick={() => onNavigate("certificates")}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-foreground">{cert.name}</span>
                          <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {cert.domain}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          到期：{cert.expiresAt ? formatDate(cert.expiresAt) : "待首次同步"}
                        </p>
                      </div>

                      <div className="shrink-0">
                        {isDisabled ? (
                          <Badge variant="secondary" className="text-[11px]">已停用</Badge>
                        ) : isExpired ? (
                          <Badge variant="destructive" className="text-[11px]">已过期</Badge>
                        ) : isExpiring ? (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400">
                            剩 {days} 天 (续期中)
                          </Badge>
                        ) : days !== null ? (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-[11px] text-emerald-600 dark:text-emerald-400">
                            剩 {days} 天
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">未同步</Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Server Nodes Quick View */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">目标服务器</CardTitle>
              <span className="font-mono text-xs text-muted-foreground">({enabledServers}/{servers.length})</span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => onNavigate("servers")}>
              全部
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {displayServers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Server className="size-8 text-muted-foreground/40" />
                <p className="mt-2.5 text-xs font-medium text-muted-foreground">暂无目标服务器</p>
                <Button variant="outline" size="sm" className="mt-3 h-7 gap-1 px-2.5 text-xs" onClick={() => onNavigate("servers")}>
                  <Plus className="size-3.5" /> 添加服务器
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {displayServers.map((server) => (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => onNavigate("servers")}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-foreground">{server.name}</span>
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {server.username}@{server.host}:{server.port}
                        </span>
                      </div>
                      <p className="max-w-xs truncate font-mono text-[10px] text-muted-foreground">
                        {server.hostFingerprint ? server.hostFingerprint : "未录入主机指纹"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 text-xs">
                      <span className={`size-1.5 rounded-full ${!server.enabled ? "bg-neutral-400" : !server.hostFingerprint ? "bg-amber-500" : "bg-emerald-500"}`} />
                      <span className={`text-[11px] ${!server.enabled ? "text-muted-foreground" : !server.hostFingerprint ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {!server.enabled ? "已停用" : !server.hostFingerprint ? "待录指纹" : "已就绪"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

type NextAction = {
  type?: "danger" | "warning" | "info";
  title: string;
  description: string;
  action: string;
  onClick: () => void;
};

function NextActions({ items }: { items: NextAction[] }) {
  if (!items.length) return null;
  const hasDanger = items.some((item) => item.type === "danger");

  return (
    <Card className={hasDanger ? "border-rose-500/35 bg-rose-500/[0.02]" : "border-amber-500/35 bg-amber-500/[0.02]"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`flex size-6 items-center justify-center rounded-md ${hasDanger ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
            {hasDanger ? <ShieldAlert className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          </div>
          <CardTitle className="text-sm font-semibold">待处理告警</CardTitle>
          <Badge
            variant="outline"
            className={`font-mono text-[11px] ${hasDanger ? "border-rose-500/40 text-rose-600 dark:text-rose-400" : "border-amber-500/40 text-amber-600 dark:text-amber-400"}`}
          >
            {items.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2">
        {items.map((item) => {
          const isDanger = item.type === "danger";
          return (
            <div
              key={item.title}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                isDanger
                  ? "border-rose-500/30 bg-rose-500/[0.03] dark:border-rose-500/20"
                  : "border-amber-500/30 bg-amber-500/[0.03] dark:border-amber-500/20"
              }`}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  {isDanger ? (
                    <ShieldAlert className="size-3.5 shrink-0 text-rose-500" />
                  ) : (
                    <AlertCircle className="size-3.5 shrink-0 text-amber-500" />
                  )}
                  <p className="truncate text-xs font-semibold text-foreground">{item.title}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">{item.description}</p>
              </div>
              <Button
                variant={isDanger ? "destructive" : "outline"}
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={item.onClick}
              >
                {item.action}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
