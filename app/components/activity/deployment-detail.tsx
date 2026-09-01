import { Activity, Ban, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "./deployment-history";
import { DeploymentDetail, formatActivityDate, terminalStatuses } from "./types";

type DeploymentDetailPanelProps = {
  deployment: DeploymentDetail;
  onClose: () => void;
  onAction?: (id: string, action: "retry" | "cancel") => void;
  busy?: boolean;
};

export function DeploymentDetailPanel({ deployment, onClose, onAction, busy = false }: DeploymentDetailPanelProps) {
  const isTerminal = terminalStatuses.has(deployment.status);

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>任务详情</CardTitle>
          <CardDescription>{deployment.id}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {!isTerminal && onAction && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={() => onAction(deployment.id, "cancel")}
            >
              <Ban className="mr-1.5 size-4" /> 取消任务
            </Button>
          )}
          {isTerminal && deployment.status !== "succeeded" && onAction && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onAction(deployment.id, "retry")}
            >
              <RotateCcw className="mr-1.5 size-4" /> 重试此部署
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 lg:col-span-2 rounded-lg border bg-muted p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">运行状态</span>
            <StatusBadge status={deployment.status} />
            <span className="text-xs text-muted-foreground">触发：{deployment.trigger}</span>
            {deployment.finishedAt && (
              <span className="text-xs text-muted-foreground">
                结束于：{formatActivityDate(deployment.finishedAt)}
              </span>
            )}
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">当前阶段</p>
              <p className="mt-1 font-medium">{deployment.status === "queued" ? "等待 Worker" : deployment.status === "running" ? "分发与 reload" : "任务已结束"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">自动部署</p>
              <p className="mt-1 font-medium">根据部署策略执行</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">错误原因</p>
              <p className="mt-1 font-medium text-destructive">{deployment.errorSummary ?? "-"}</p>
            </div>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">目标状态</h3>
          {deployment.targets.map((target) => (
            <div key={target.id} className="mb-2 rounded-md border p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span>{target.serverName} <span className="text-muted-foreground">{target.host}</span></span>
                <StatusBadge status={target.status} />
              </div>
              {target.errorSummary && <p className="mt-2 text-xs text-destructive">{target.errorSummary}</p>}
            </div>
          ))}
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><Activity className="size-4" />日志</h3>
          <div className="max-h-80 space-y-2 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-xs text-slate-100">
            {deployment.logs.map((entry) => (
              <p key={`${entry.sequence}-${entry.createdAt}`}>
                <span className="text-slate-500">{formatActivityDate(entry.createdAt)} </span>
                <span className={entry.level === "error" ? "text-red-300" : "text-emerald-300"}>{entry.level.toUpperCase()}</span>
                {" "}{entry.message}
              </p>
            ))}
            {deployment.logs.length === 0 && <p className="text-slate-400">等待任务日志…</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
