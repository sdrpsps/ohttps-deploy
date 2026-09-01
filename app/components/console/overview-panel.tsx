import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Server,
  ShieldCheck,
  Sparkles,
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
import { cn } from "@/lib/utils";
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

const metricStyles = {
  certificates: "bg-[var(--accent)] text-[var(--chart-4)]",
  expiring: "bg-[var(--primary-foreground)] text-primary",
  servers: "bg-[var(--muted)] text-foreground",
  worker: "bg-[var(--accent)] text-[var(--chart-4)]",
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
      label: "证书总数",
      value: certificates.length,
      detail: "已纳入管理",
      icon: ShieldCheck,
      style: metricStyles.certificates,
    },
    {
      label: "需要关注",
      value: expiringCount,
      detail: "续期窗口内",
      icon: Clock3,
      style: metricStyles.expiring,
    },
    {
      label: "在线服务器",
      value: `${enabledServers}/${servers.length}`,
      detail: "连接配置",
      icon: Server,
      style: metricStyles.servers,
    },
    {
      label: "系统状态",
      value: "正常",
      detail: workerOnline ? "Worker 运行中" : "Worker 离线",
      icon: CheckCircle2,
      style: workerOnline ? metricStyles.worker : metricStyles.expiring,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="relative isolate z-0 overflow-hidden rounded-2xl bg-primary px-6 py-7 text-primary-foreground sm:px-8 sm:py-8">
        <div className="relative z-0 max-w-xl">
          <Badge className="mb-4 bg-white/15 text-white hover:bg-white/15">
            <Sparkles className="mr-1 size-3" />
            安全部署中心
          </Badge>
          <h2 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
            让每一次证书更新，<span className="text-[var(--chart-1)]">都井然有序。</span>
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/85">
            集中管理证书、服务器与自动部署策略。Worker 正在后台持续守护你的 HTTPS 资产。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button className="bg-primary-foreground text-primary hover:bg-primary-foreground" onClick={onCreateCertificate}>
              添加证书
            </Button>
            <Button
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => onNavigate("activity")}
            >
              查看任务日志 <ArrowUpRight />
            </Button>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-12 -top-14 z-0 size-64 rounded-full border-[24px] border-white/10" />
      </section>

      <NextActions
        items={[
          !workerOnline && {
            title: "Worker 处于离线状态",
            description: "后台定时扫描与自动部署已暂停，请检查 Worker 容器。",
            action: "查看任务",
            onClick: () => onNavigate("activity"),
          },
          failedDeployments > 0 && {
            title: `有 ${failedDeployments} 个部署任务失败`,
            description: "部分服务器未能成功应用新证书，建议前往排查或重试。",
            action: "处理部署",
            onClick: onHandleFailedDeployments ?? (() => onNavigate("activity")),
          },
          failedSyncJobs > 0 && {
            title: `有 ${failedSyncJobs} 个证书同步失败`,
            description: "从 ohttps 同步最新证书未成功，建议检查网络与 API 凭据。",
            action: "处理同步",
            onClick: onHandleFailedSyncJobs ?? (() => onNavigate("certificates")),
          },
          expiringCount > 0 && {
            title: `有 ${expiringCount} 张证书即将过期`,
            description: "已进入续期时间窗口，请关注自动同步与部署进展。",
            action: "查看证书",
            onClick: () => onNavigate("certificates"),
          },
        ].filter(Boolean) as NextAction[]}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, style }) => (
          <Card key={label}>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
              </div>
              <div className={cn("grid size-10 place-items-center rounded-xl", style)}>
                <Icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>证书资产</CardTitle>
            <CardDescription>
              已管理 {certificates.length} 张证书，其中 {expiringCount} 张需要关注
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => onNavigate("certificates")}>
              查看证书 <ArrowUpRight />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>服务器节点</CardTitle>
            <CardDescription>{enabledServers} 个已启用目标准备接收部署</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => onNavigate("servers")}>
              管理服务器 <ArrowUpRight />
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

type NextAction = { title: string; description: string; action: string; onClick: () => void };

function NextActions({ items }: { items: NextAction[] }) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">运维待办</CardTitle>
        <CardDescription>检测到以下需要关注或处理的运维事项。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Button variant="outline" size="sm" onClick={item.onClick}>
              {item.action}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
