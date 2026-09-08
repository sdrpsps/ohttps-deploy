import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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

  const metrics = [
    {
      label: "证书资产总数",
      value: certificates.length,
      detail: `${certificates.filter((c) => c.status === "active").length} 张证书处于活跃状态`,
      icon: ShieldCheck,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
      badge: "资产管理",
    },
    {
      label: "续期窗口内",
      value: expiringCount,
      detail: expiringCount > 0 ? "需关注自动同步与部署" : "近期无即将过期证书",
      icon: Clock3,
      iconColor: expiringCount > 0 ? "text-amber-500" : "text-emerald-500",
      iconBg: expiringCount > 0 ? "bg-amber-500/10" : "bg-emerald-500/10",
      badge: expiringCount > 0 ? "待处理" : "状态良好",
    },
    {
      label: "受管目标服务器",
      value: `${enabledServers}/${servers.length}`,
      detail: `${enabledServers} 个节点已启用 SSH 部署`,
      icon: Server,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-500/10",
      badge: "部署节点",
    },
    {
      label: "Worker 队列调度",
      value: workerOnline ? "正常运行" : "服务离线",
      detail: workerOnline ? "后台轮询与定时任务正常" : "定时任务与自动推送已暂停",
      icon: workerOnline ? CheckCircle2 : AlertCircle,
      iconColor: workerOnline ? "text-emerald-500" : "text-rose-500",
      iconBg: workerOnline ? "bg-emerald-500/10" : "bg-rose-500/10",
      badge: workerOnline ? "心跳正常" : "异常离线",
    },
  ];

  // Top expiring or recent certificates (up to 4)
  const sortedCertificates = [...certificates].sort((a, b) => {
    const daysA = daysUntil(a.expiresAt) ?? 9999;
    const daysB = daysUntil(b.expiresAt) ?? 9999;
    return daysA - daysB;
  }).slice(0, 4);

  // Top servers (up to 4)
  const displayServers = servers.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* 1. Hero Welcome Banner */}
      <section className="relative isolate overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 p-6 text-white shadow-lg sm:p-8">
        {/* Subtle glow background elements */}
        <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 size-64 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/15">
              <Sparkles className="mr-1.5 size-3 text-amber-300" />
              自托管自动化控制台
            </Badge>
            <Badge variant="outline" className="border-white/15 text-[11px] text-white/70">
              SSH Push · Nginx Reload
            </Badge>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              HTTPS 证书全生命周期自动化管理
            </h2>
            <p className="text-xs leading-relaxed text-neutral-300 sm:text-sm">
              从 ohttps 自动同步，不可变版本归档至本地，通过受控 SSH 幂等部署至目标服务器。Worker 在后台 7×24 小时守护全站 HTTPS 资产安全。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              className="gap-1.5 bg-white text-neutral-900 hover:bg-neutral-100 shadow-md font-medium text-xs sm:text-sm"
              onClick={onCreateCertificate}
            >
              <Plus className="size-4" />
              添加新证书
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white text-xs sm:text-sm"
              onClick={() => onNavigate("policies")}
            >
              <Workflow className="size-3.5" />
              部署策略配置
            </Button>
            <Button
              variant="ghost"
              className="gap-1.5 text-neutral-300 hover:bg-white/10 hover:text-white text-xs sm:text-sm"
              onClick={() => onNavigate("activity")}
            >
              任务执行日志
              <ArrowUpRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* 2. Ops Todo / Next Actions */}
      <NextActions
        items={[
          !workerOnline && {
            type: "danger" as const,
            title: "Worker 服务处于离线状态",
            description: "后台定时证书扫描、过期预警与自动部署任务已暂停。请检查 Worker 容器运行状态。",
            action: "查看任务详情",
            onClick: () => onNavigate("activity"),
          },
          failedDeployments > 0 && {
            type: "danger" as const,
            title: `检测到 ${failedDeployments} 个部署任务执行失败`,
            description: "部分目标服务器未能成功部署并重载新证书，建议前往活动与日志排查原因并重试。",
            action: "排查部署",
            onClick: onHandleFailedDeployments ?? (() => onNavigate("activity")),
          },
          failedSyncJobs > 0 && {
            type: "warning" as const,
            title: `检测到 ${failedSyncJobs} 个证书同步任务失败`,
            description: "从 ohttps 接口拉取最新证书未成功，请检查外网连通性或 API 凭据配置。",
            action: "处理同步",
            onClick: onHandleFailedSyncJobs ?? (() => onNavigate("certificates")),
          },
          expiringCount > 0 && {
            type: "warning" as const,
            title: `有 ${expiringCount} 张证书已进入续期时间窗口`,
            description: "证书即将在设定的提前天数内到期，系统将按计划触发同步或已具备推送条件。",
            action: "查看证书",
            onClick: () => onNavigate("certificates"),
          },
        ].filter(Boolean) as NextAction[]}
      />

      {/* 3. Core Metrics Grid */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, iconColor, iconBg, badge }) => (
          <Card key={label} className="transition-all duration-200 hover:border-primary/30 hover:shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <div className={cn("grid size-9 place-items-center rounded-xl", iconBg, iconColor)}>
                  <Icon className="size-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">{value}</span>
                  <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                    {badge}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 4. Asset Preview & Operational Quick-Hub */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Certificates Quick View */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <CardTitle className="text-base font-semibold">证书资产动态</CardTitle>
              </div>
              <CardDescription className="text-xs">
                共管理 {certificates.length} 张证书 · {expiringCount > 0 ? `${expiringCount} 张需关注` : "状态健康"}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onNavigate("certificates")}>
              全部证书
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1">
            {sortedCertificates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <ShieldCheck className="size-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium">暂无托管证书</p>
                <p className="mt-1 text-xs text-muted-foreground">从 ohttps 接入证书后，系统将自动进行版本管理与部署。</p>
                <Button size="sm" className="mt-4 gap-1 text-xs" onClick={onCreateCertificate}>
                  <Plus className="size-3.5" /> 添加第一张证书
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedCertificates.map((cert) => {
                  const days = daysUntil(cert.expiresAt);
                  const isExpiring = days !== null && days <= cert.renewBeforeDays;
                  const isExpired = days !== null && days <= 0;

                  return (
                    <div
                      key={cert.id}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold">{cert.name}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {cert.domain}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          到期日：{formatDate(cert.expiresAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isExpired ? (
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
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Server Nodes Quick View */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Server className="size-4 text-primary" />
                <CardTitle className="text-base font-semibold">部署目标服务器</CardTitle>
              </div>
              <CardDescription className="text-xs">
                {enabledServers} / {servers.length} 个节点已启用 SSH 部署
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onNavigate("servers")}>
              全部服务器
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1">
            {displayServers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <Server className="size-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium">暂无部署服务器</p>
                <p className="mt-1 text-xs text-muted-foreground">添加服务器并绑定 SSH 公钥后，证书即可实现自动化推送。</p>
                <Button variant="outline" size="sm" className="mt-4 gap-1 text-xs" onClick={() => onNavigate("servers")}>
                  <Plus className="size-3.5" /> 添加受管服务器
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {displayServers.map((server) => (
                  <div
                    key={server.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold">{server.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {server.username}@{server.host}:{server.port}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground truncate max-w-xs">
                        指纹：{server.hostFingerprint ? `${server.hostFingerprint.slice(0, 20)}...` : "未录入指纹"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className={`size-1.5 rounded-full ${!server.enabled ? "bg-neutral-400" : !server.hostFingerprint ? "bg-amber-500" : "bg-emerald-500"}`} />
                        <span className={`text-[11px] ${!server.enabled ? "text-muted-foreground" : !server.hostFingerprint ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                          {!server.enabled ? "已停用" : !server.hostFingerprint ? "待录指纹" : "已就绪"}
                        </span>
                      </span>
                    </div>
                  </div>
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
    <Card className={hasDanger ? "border-rose-500/30 bg-rose-500/[0.02]" : "border-amber-500/30 bg-amber-500/[0.02]"}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className={`flex size-6 items-center justify-center rounded-lg ${hasDanger ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
            {hasDanger ? <ShieldAlert className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          </div>
          <CardTitle className="text-base font-semibold">运维待办事项</CardTitle>
          <Badge
            variant="outline"
            className={`text-xs font-mono ${hasDanger ? "border-rose-500/40 text-rose-600 dark:text-rose-400" : "border-amber-500/40 text-amber-600 dark:text-amber-400"}`}
          >
            {items.length} 项关注
          </Badge>
        </div>
        <CardDescription className="text-xs">
          系统检测到以下需要管理员介入或排查的运行事项
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const isDanger = item.type === "danger";
          return (
            <div
              key={item.title}
              className={`flex items-center justify-between gap-4 rounded-xl border p-3.5 transition-all ${
                isDanger
                  ? "border-rose-500/30 bg-rose-500/[0.03] dark:border-rose-500/20"
                  : "border-amber-500/30 bg-amber-500/[0.03] dark:border-amber-500/20"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  {isDanger ? (
                    <ShieldAlert className="size-3.5 text-rose-500 shrink-0" />
                  ) : (
                    <AlertCircle className="size-3.5 text-amber-500 shrink-0" />
                  )}
                  <p className="text-xs font-semibold text-foreground">{item.title}</p>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
              <Button
                variant={isDanger ? "destructive" : "outline"}
                size="sm"
                className="shrink-0 text-xs h-8 px-3 shadow-sm"
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
