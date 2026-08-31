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
  onNavigate: (section: "certificates" | "servers" | "activity") => void;
};

const metricStyles = {
  certificates: "bg-cyan-50 text-cyan-600",
  expiring: "bg-amber-50 text-amber-600",
  servers: "bg-violet-50 text-violet-600",
  worker: "bg-emerald-50 text-emerald-600",
};

export function OverviewPanel({
  certificates,
  servers,
  expiringCount,
  onCreateCertificate,
  onNavigate,
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
      detail: "Worker 运行中",
      icon: CheckCircle2,
      style: metricStyles.worker,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-primary px-6 py-8 text-primary-foreground sm:px-8">
        <div className="relative z-10 max-w-xl">
          <Badge className="mb-4 bg-white/15 text-white hover:bg-white/15">
            <Sparkles className="mr-1 size-3" />
            安全部署中心
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            让每一次证书更新，<span className="text-cyan-200">都井然有序。</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-200">
            集中管理证书、服务器与自动部署策略。Worker 正在后台持续守护你的 HTTPS 资产。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button className="bg-white text-primary hover:bg-slate-100" onClick={onCreateCertificate}>
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
        <div className="absolute -right-12 -top-14 size-64 rounded-full border-[24px] border-white/10" />
      </section>

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
