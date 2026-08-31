import { Activity } from "lucide-react";
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
import { DeploymentDetail, formatActivityDate } from "./types";

type DeploymentDetailPanelProps = {
  deployment: DeploymentDetail;
  onClose: () => void;
};

export function DeploymentDetailPanel({ deployment, onClose }: DeploymentDetailPanelProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>任务详情</CardTitle>
          <CardDescription>{deployment.id}</CardDescription>
        </div>
        <Button variant="ghost" onClick={onClose}>关闭</Button>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
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
