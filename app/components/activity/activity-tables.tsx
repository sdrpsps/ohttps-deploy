"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  ListFilter,
  Search,
  User,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
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
import { copyToClipboard } from "@/lib/utils";
import type { AuditEntry, LogEntry } from "./types";
import {
  actionLabels,
  classifyLogTone,
  formatActivityDate,
  formatRelativeTime,
  parseServerLogPrefix,
} from "./types";

function isSummaryLogEntry(entry: LogEntry): boolean {
  if (entry.level === "error" || entry.level === "warn") return true;
  if (!entry.targetId) return true;
  return (
    entry.message.includes("已成功部署") ||
    entry.message.includes("dry-run 模拟校验成功") ||
    entry.message.includes("部署已取消") ||
    entry.message.includes("回滚") ||
    entry.message.includes("失败")
  );
}

// ==========================================
// 1. 系统日志查看器 (SystemLogViewer)
// ==========================================
export function SystemLogViewer({
  logs,
  certificates,
  servers,
  certificateId,
  serverId,
  level,
  from,
  onCertificateChange,
  onServerChange,
  onLevelChange,
  onFromChange,
  onOpenDeployment,
  onResetFilters,
}: {
  logs: LogEntry[];
  certificates: Certificate[];
  servers: ManagedServer[];
  certificateId: string;
  serverId: string;
  level: string;
  from: string;
  onCertificateChange: (id: string) => void;
  onServerChange: (id: string) => void;
  onLevelChange: (level: string) => void;
  onFromChange: (value: string) => void;
  onOpenDeployment?: (deploymentId: string) => void;
  onResetFilters: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [copied, setCopied] = useState(false);
  const [summaryOnly, setSummaryOnly] = useState(true);

  const keywordFilteredLogs = useMemo(() => {
    const sorted = [...logs].sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (b.sequence ?? 0) - (a.sequence ?? 0);
    });

    if (!keyword.trim()) return sorted;
    const kw = keyword.toLowerCase();
    return sorted.filter((entry) => {
      const matchesMsg = entry.message.toLowerCase().includes(kw);
      const matchesCert = entry.certificateName?.toLowerCase().includes(kw) ?? false;
      const matchesServer = entry.serverName?.toLowerCase().includes(kw) ?? false;
      return matchesMsg || matchesCert || matchesServer;
    });
  }, [logs, keyword]);

  const filteredLogs = useMemo(() => {
    if (!summaryOnly || level === "error" || level === "warn") return keywordFilteredLogs;
    return keywordFilteredLogs.filter(isSummaryLogEntry);
  }, [keywordFilteredLogs, summaryOnly, level]);

  const hiddenStepCount = keywordFilteredLogs.length - filteredLogs.length;
  const hasActiveFilters = Boolean(keyword || certificateId || serverId || level || from);

  const copyVisibleLogs = async () => {
    const text = filteredLogs
      .map(
        (l) =>
          `[${formatActivityDate(l.createdAt)}] [${l.level.toUpperCase()}] ${
            l.certificateName ? `[${l.certificateName}]` : ""
          } ${l.serverName ? `[${l.serverName}]` : ""} ${l.message}`
      )
      .join("\n");
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast.success(`已复制 ${filteredLogs.length} 条日志`);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("复制失败，请手动选择复制");
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3 border-b px-4 py-3.5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid flex-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索日志内容…"
                className="h-8 pl-8 text-xs"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <Select
              value={certificateId || "all"}
              onValueChange={(val) => onCertificateChange(val === "all" ? "" : val)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="全部证书" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部证书</SelectItem>
                {certificates.map((cert) => (
                  <SelectItem key={cert.id} value={cert.id}>
                    {cert.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={serverId || "all"}
              onValueChange={(val) => onServerChange(val === "all" ? "" : val)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="全部服务器" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部服务器</SelectItem>
                {servers.map((srv) => (
                  <SelectItem key={srv.id} value={srv.id}>
                    {srv.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={level || "all"}
              onValueChange={(val) => onLevelChange(val === "all" ? "" : val)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="日志级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部级别</SelectItem>
                <SelectItem value="error">仅错误 (ERROR)</SelectItem>
                <SelectItem value="warn">警告 (WARN)</SelectItem>
                <SelectItem value="info">信息 (INFO)</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              className="h-8 text-xs"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              aria-label="起始日期"
            />
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant={summaryOnly ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setSummaryOnly((prev) => !prev)}
              title="切换是否折叠部署中间过程步骤"
            >
              <ListFilter className="size-3.5" />
              <span>
                {summaryOnly
                  ? `仅关键结果${hiddenStepCount > 0 ? ` (已折 ${hiddenStepCount})` : ""}`
                  : "全部执行步骤"}
              </span>
            </Button>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setKeyword("");
                  onResetFilters();
                }}
              >
                <X className="size-3.5" />
                重置
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => void copyVisibleLogs()}
              disabled={filteredLogs.length === 0}
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-600" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  复制日志
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-[155px] text-xs font-semibold">时间</TableHead>
              <TableHead className="w-[82px] text-xs font-semibold">状态</TableHead>
              <TableHead className="w-[200px] text-xs font-semibold">关联对象</TableHead>
              <TableHead className="text-xs font-semibold">内容</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map((entry) => {
              const { serverPrefix, body } = parseServerLogPrefix(entry.message);
              const tone = classifyLogTone(entry.level, entry.message);
              const displayServer = entry.serverName ?? serverPrefix;
              const cleanMessage = serverPrefix && displayServer === serverPrefix ? body : entry.message;
              const clickable = Boolean(entry.deploymentId && onOpenDeployment);

              return (
                <TableRow
                  key={entry.id ?? `${entry.sequence}-${entry.createdAt}`}
                  onClick={() => entry.deploymentId && onOpenDeployment?.(entry.deploymentId)}
                  className={`${clickable ? "cursor-pointer" : ""} ${
                    entry.level === "error"
                      ? "bg-destructive/5 hover:bg-destructive/10"
                      : entry.level === "warn"
                      ? "bg-amber-500/[0.04] hover:bg-amber-500/10"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {formatActivityDate(entry.createdAt)}
                  </TableCell>
                  <TableCell>
                    {tone === "error" ? (
                      <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                        <XCircle className="size-3" />
                        失败
                      </Badge>
                    ) : tone === "warn" ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400"
                      >
                        <AlertTriangle className="size-3" />
                        警告
                      </Badge>
                    ) : tone === "success" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Check className="size-3.5" />
                        完成
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                        {tone === "progress" ? "步骤" : "记录"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {entry.certificateName || displayServer ? (
                      <div className="max-w-[190px] truncate">
                        {entry.certificateName && (
                          <span className="font-medium text-foreground">{entry.certificateName}</span>
                        )}
                        {displayServer && (
                          <span className="text-muted-foreground">
                            {entry.certificateName ? " · " : ""}
                            {displayServer}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`break-all whitespace-pre-wrap ${
                          tone === "progress" ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {cleanMessage}
                      </span>
                      {clickable && (
                        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/40" />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredLogs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-28 text-center text-xs text-muted-foreground"
                >
                  {hiddenStepCount > 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <span>已折叠 {hiddenStepCount} 条中间步骤日志</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSummaryOnly(false)}
                      >
                        显示全部执行步骤
                      </Button>
                    </div>
                  ) : (
                    "暂无匹配的系统日志"
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ==========================================
// 2. 操作审计查看器 (AuditTrailViewer)
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
  const [keyword, setKeyword] = useState("");

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
    const kw = keyword.trim().toLowerCase();
    return events.filter((e) => {
      if (objectFilter !== "all" && e.objectType !== objectFilter) return false;
      if (kw) {
        const label = (actionLabels[e.action] ?? e.action).toLowerCase();
        const obj = resolveObjectDisplay(e.objectType, e.objectId).toLowerCase();
        const actor = e.actor.toLowerCase();
        if (!label.includes(kw) && !obj.includes(kw) && !actor.includes(kw)) return false;
      }
      return true;
    });
  }, [events, objectFilter, keyword, certMap, serverMap]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索操作、对象或操作人…"
            className="h-8 pl-8 pr-8 text-xs"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="清空搜索"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="w-full sm:w-44">
          <Select value={objectFilter} onValueChange={setObjectFilter}>
            <SelectTrigger className="h-8 text-xs">
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
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-[160px] text-xs font-semibold">操作时间</TableHead>
              <TableHead className="w-[100px] text-xs font-semibold">操作人</TableHead>
              <TableHead className="text-xs font-semibold">操作</TableHead>
              <TableHead className="text-xs font-semibold">影响对象</TableHead>
              <TableHead className="w-[90px] text-right text-xs font-semibold">结果</TableHead>
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
                  <span className="rounded border bg-muted/30 px-2 py-0.5 font-mono text-foreground">
                    {resolveObjectDisplay(entry.objectType, entry.objectId)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={entry.result === "success" ? "default" : "destructive"}
                    className="px-1.5 py-0 text-[10px]"
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
      </CardContent>
    </Card>
  );
}
