"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  FileText,
  Filter,
  Search,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Certificate, ManagedServer } from "@/components/console/types";
import type { AuditEntry, LogEntry } from "./types";
import {
  actionLabels,
  formatActivityDate,
  formatRelativeTime,
} from "./types";

// ==========================================
// 1. 系统日志查看器 (SystemLogViewer)
// ==========================================
export function SystemLogViewer({
  logs,
  level,
  onLevelChange,
}: {
  logs: LogEntry[];
  level: string;
  onLevelChange: (level: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [copied, setCopied] = useState(false);

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (keyword.trim()) {
        const kw = keyword.toLowerCase();
        const matchesMsg = entry.message.toLowerCase().includes(kw);
        const matchesCert = entry.certificateName?.toLowerCase().includes(kw) ?? false;
        const matchesServer = entry.serverName?.toLowerCase().includes(kw) ?? false;
        if (!matchesMsg && !matchesCert && !matchesServer) return false;
      }
      return true;
    });
  }, [logs, keyword]);

  const copyVisibleLogs = () => {
    const text = filteredLogs
      .map(
        (l) =>
          `[${formatActivityDate(l.createdAt)}] [${l.level.toUpperCase()}] ${
            l.certificateName ? `[${l.certificateName}]` : ""
          } ${l.serverName ? `[${l.serverName}]` : ""} ${l.message}`
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`已复制 ${filteredLogs.length} 条日志`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">系统执行日志</CardTitle>
            <CardDescription className="text-xs">
              检索与排查自动化 Worker、部署任务与 SSH 执行的具体输出。
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs self-start sm:self-auto"
            onClick={copyVisibleLogs}
            disabled={filteredLogs.length === 0}
          >
            {copied ? (
              <>
                <Check className="mr-1 size-3.5 text-emerald-600" />
                已复制
              </>
            ) : (
              <>
                <Copy className="mr-1 size-3.5" />
                复制当前日志
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 日志过滤工具栏 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="搜索日志内容、证书或服务器…"
              className="pl-8 text-xs h-9"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <div className="w-full sm:w-48">
            <Select
              value={level || "all"}
              onValueChange={(val) => onLevelChange(val === "all" ? "" : val)}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="日志级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部级别</SelectItem>
                <SelectItem value="error">仅错误 (ERROR)</SelectItem>
                <SelectItem value="warn">警告 (WARN)</SelectItem>
                <SelectItem value="info">信息 (INFO)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 日志表格 */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[160px]">记录时间</TableHead>
                <TableHead className="w-[80px]">级别</TableHead>
                <TableHead className="w-[180px]">关联对象</TableHead>
                <TableHead>日志内容</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((entry) => (
                <TableRow
                  key={entry.id ?? `${entry.sequence}-${entry.createdAt}`}
                  className={entry.level === "error" ? "bg-destructive/5 hover:bg-destructive/10" : ""}
                >
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground font-mono">
                    {formatActivityDate(entry.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entry.level === "error"
                          ? "destructive"
                          : entry.level === "warn"
                          ? "secondary"
                          : "outline"
                      }
                      className="text-[10px] px-1.5 py-0 font-mono font-semibold"
                    >
                      {entry.level.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {entry.certificateName ? (
                      <div className="font-medium text-foreground truncate max-w-[160px]">
                        {entry.certificateName}
                        {entry.serverName && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            / {entry.serverName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all whitespace-pre-wrap">
                    {entry.message}
                  </TableCell>
                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-28 text-center text-xs text-muted-foreground"
                  >
                    暂无匹配的系统日志
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ==========================================
// 2. 人话审计记录查看器 (AuditTrailViewer)
// ==========================================
export function AuditTrailViewer({
  events,
  certificates,
  servers,
}: {
  events: AuditEntry[];
  certificates: Certificate[];
  servers: ManagedServer[];
}) {
  const [objectFilter, setObjectFilter] = useState("all");

  const certMap = useMemo(
    () => new Map(certificates.map((c) => [c.id, `${c.name} (${c.domain})`])),
    [certificates]
  );
  const serverMap = useMemo(
    () => new Map(servers.map((s) => [s.id, `${s.name} (${s.host})`])),
    [servers]
  );

  const resolveObjectDisplay = (objectType: string, objectId: string | null) => {
    if (!objectId) {
      if (objectType === "settings") return "系统全局设置";
      return objectType;
    }
    if (objectType === "certificate") {
      return certMap.get(objectId) ?? `证书 [${objectId.slice(0, 8)}…]`;
    }
    if (objectType === "server") {
      return serverMap.get(objectId) ?? `服务器 [${objectId.slice(0, 8)}…]`;
    }
    if (objectType === "deployment") {
      return `部署任务 #${objectId.slice(0, 8)}`;
    }
    return `${objectType} #${objectId.slice(0, 8)}`;
  };

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (objectFilter !== "all" && e.objectType !== objectFilter) return false;
      return true;
    });
  }, [events, objectFilter]);

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">管理员操作审计</CardTitle>
            <CardDescription className="text-xs">
              完整记录管理员对证书、受管节点、部署策略与系统配置的变动轨迹。
            </CardDescription>
          </div>
          <div className="w-full sm:w-44">
            <Select value={objectFilter} onValueChange={setObjectFilter}>
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="筛选对象" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部对象类型</SelectItem>
                <SelectItem value="certificate">证书相关</SelectItem>
                <SelectItem value="server">服务器相关</SelectItem>
                <SelectItem value="deployment">部署任务相关</SelectItem>
                <SelectItem value="settings">系统设置相关</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[160px]">操作时间</TableHead>
                <TableHead className="w-[100px]">操作人</TableHead>
                <TableHead>动作说明</TableHead>
                <TableHead>影响对象</TableHead>
                <TableHead className="w-[90px] text-right">结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs">
                    <div className="text-foreground">
                      {formatActivityDate(entry.createdAt)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatRelativeTime(entry.createdAt)}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <User className="size-3" />
                      {entry.actor}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-foreground">
                    {actionLabels[entry.action] ?? entry.action}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="rounded border bg-muted/30 px-2 py-0.5 text-foreground font-mono">
                      {resolveObjectDisplay(entry.objectType, entry.objectId)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={entry.result === "success" ? "default" : "destructive"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {entry.result === "success" ? "成功" : "失败"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {filteredEvents.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-xs text-muted-foreground"
                  >
                    暂无审计操作记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
