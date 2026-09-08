"use client";

import {
  Check,
  CheckCircle2,
  Copy,
  Fingerprint,
  Globe,
  Key,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { copyToClipboard } from "@/lib/utils";
import type { DeleteTarget, ManagedServer } from "./types";

type ServerPanelProps = {
  servers: ManagedServer[];
  loading: boolean;
  busy: boolean;
  onCreate: () => void;
  onEdit: (server: ManagedServer) => void;
  onTest: (server: ManagedServer) => void;
  onDelete: (target: DeleteTarget) => void;
  onToggleEnabled?: (server: ManagedServer) => void;
  onViewSshKey?: () => void;
  onDeployServer?: (server: ManagedServer) => void;
};

type ServerFilterStatus = "all" | "enabled" | "disabled";

export function ServerPanel({
  servers,
  loading,
  busy,
  onCreate,
  onEdit,
  onTest,
  onDelete,
  onToggleEnabled,
  onViewSshKey,
  onDeployServer,
}: ServerPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServerFilterStatus>("all");

  const counts = useMemo(() => {
    const enabled = servers.filter((s) => s.enabled).length;
    const verified = servers.filter((s) => Boolean(s.hostFingerprint)).length;
    return {
      all: servers.length,
      enabled,
      disabled: servers.length - enabled,
      verified,
    };
  }, [servers]);

  const filteredServers = useMemo(() => {
    return servers.filter((server) => {
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matchesName = server.name.toLowerCase().includes(query);
        const matchesHost = server.host.toLowerCase().includes(query);
        const matchesUser = server.username.toLowerCase().includes(query);
        if (!matchesName && !matchesHost && !matchesUser) return false;
      }

      if (statusFilter === "enabled") return server.enabled;
      if (statusFilter === "disabled") return !server.enabled;
      return true;
    });
  }, [servers, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Server className="size-5 text-primary" />
              <CardTitle className="text-lg font-semibold">目标服务器管理</CardTitle>
            </div>
            <CardDescription className="text-xs">
              配置远程 Nginx 目标主机的 SSH 连接与严格主机指纹校验，实现无密码幂等推送
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {onViewSshKey && (
              <Button
                variant="outline"
                size="sm"
                onClick={onViewSshKey}
                className="gap-1.5 text-xs font-medium"
              >
                <Key className="size-3.5" />
                <span>部署公钥配置</span>
              </Button>
            )}
            <Button size="sm" onClick={onCreate} className="gap-1.5 text-xs font-medium shadow-sm">
              <Plus className="size-3.5" />
              <span>添加服务器</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Toolbar: Search and Filter Chips */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索服务器名称、IP 或主机..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                  statusFilter === "all"
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span>全部</span>
                <span className="font-mono text-[10px] opacity-80">{counts.all}</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("enabled")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                  statusFilter === "enabled"
                    ? "bg-emerald-600 text-white font-medium"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>已就绪</span>
                <span className="font-mono text-[10px] opacity-80">{counts.enabled}</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("disabled")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
                  statusFilter === "disabled"
                    ? "bg-neutral-600 text-white font-medium"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 rounded-full bg-neutral-400" />
                <span>已停用</span>
                <span className="font-mono text-[10px] opacity-80">{counts.disabled}</span>
              </button>
            </div>
          </div>

          {/* Servers Table */}
          <div className="rounded-lg border border-border/80 overflow-hidden">
            <Table className="min-w-[680px]">
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[25%] text-xs font-semibold">服务器名称</TableHead>
                  <TableHead className="w-[28%] text-xs font-semibold">SSH 连接地址</TableHead>
                  <TableHead className="w-[22%] text-xs font-semibold">主机指纹 (SHA-256)</TableHead>
                  <TableHead className="w-[10%] text-xs font-semibold">启用状态</TableHead>
                  <TableHead className="w-[15%] text-right text-xs font-semibold">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <EmptyRow text="正在加载服务器列表..." />
                ) : filteredServers.length === 0 ? (
                  servers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-44 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                            <Server className="size-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium">暂无受管服务器</p>
                          <p className="text-xs text-muted-foreground">添加目标服务器并录入主机指纹，即可开始自动化安全推送。</p>
                          <Button size="sm" className="mt-2 text-xs gap-1" onClick={onCreate}>
                            <Plus className="size-3.5" /> 添加第一台服务器
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <EmptyRow text="未找到符合筛选条件的服务器" />
                  )
                ) : (
                  filteredServers.map((server) => (
                    <ServerRow
                      key={server.id}
                      server={server}
                      busy={busy}
                      onEdit={onEdit}
                      onTest={onTest}
                      onDelete={onDelete}
                      onToggleEnabled={onToggleEnabled}
                      onDeployServer={onDeployServer}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ServerRow({
  server,
  busy,
  onEdit,
  onTest,
  onDelete,
  onToggleEnabled,
  onDeployServer,
}: Omit<ServerPanelProps, "servers" | "loading" | "onCreate"> & { server: ManagedServer }) {
  const [testing, setTesting] = useState(false);

  const copyText = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      toast.success(`${label}已复制到剪贴板`);
    } else {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const hasFingerprint = Boolean(server.hostFingerprint);
  const connString = `${server.username}@${server.host}:${server.port}`;

  async function handleTest() {
    setTesting(true);
    try {
      await onTest(server);
    } finally {
      setTesting(false);
    }
  }

  return (
    <TableRow className="transition-colors hover:bg-muted/30">
      {/* 1. Name & Tags */}
      <TableCell>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground">{server.name}</span>
            <Badge variant="outline" className="text-[10px] font-normal py-0 h-4 text-muted-foreground">
              SSH 节点
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            超时：{server.timeoutSeconds}s · 校验：{server.validationCommand ? "已配" : "默认"}
          </p>
        </div>
      </TableCell>

      {/* 2. SSH Address */}
      <TableCell>
        <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
          <span className="truncate">{connString}</span>
          <button
            type="button"
            onClick={() => copyText(connString, "SSH 地址 ")}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            title="复制 SSH 连接地址"
          >
            <Copy className="size-3" />
          </button>
        </div>
      </TableCell>

      {/* 3. Host Fingerprint */}
      <TableCell>
        {hasFingerprint ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 font-mono text-xs">
              <ShieldCheck className="size-3.5 text-emerald-500 shrink-0" />
              <span className="truncate max-w-[150px] text-[11px] text-muted-foreground">
                {server.hostFingerprint}
              </span>
              <button
                type="button"
                onClick={() => copyText(server.hostFingerprint!, "主机指纹 ")}
                className="text-muted-foreground/60 hover:text-foreground transition-colors ml-0.5"
                title="复制完整主机指纹"
              >
                <Copy className="size-3" />
              </button>
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">已录入校验</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <ShieldAlert className="size-3.5 shrink-0" />
            <span>未录入指纹</span>
          </div>
        )}
      </TableCell>

      {/* 4. Switch */}
      <TableCell>
        <Switch
          checked={server.enabled}
          disabled={busy}
          onCheckedChange={() => onToggleEnabled?.(server)}
          aria-label={`切换服务器 ${server.name} 启用状态`}
        />
      </TableCell>

      {/* 5. Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {onDeployServer && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !server.enabled || !hasFingerprint}
              onClick={() => onDeployServer(server)}
              className="h-7 px-2 text-xs gap-1"
              title="部署该节点分配的所有证书"
            >
              <Play className="size-3 text-primary" />
              <span className="hidden sm:inline">部署证书</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={busy || !hasFingerprint || testing}
            onClick={handleTest}
            className="h-7 px-2 text-xs gap-1"
            title="测试 SSH 连接与主机指纹"
          >
            <RefreshCw className={`size-3 ${testing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">测试连接</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={busy}
            onClick={() => onEdit(server)}
            aria-label={`编辑服务器 ${server.name}`}
          >
            <Pencil className="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={() => onDelete({ type: "server", id: server.id, name: server.name })}
            aria-label={`删除服务器 ${server.name}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}
