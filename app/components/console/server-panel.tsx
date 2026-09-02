import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
};

export function ServerPanel({
  servers,
  loading,
  busy,
  onCreate,
  onEdit,
  onTest,
  onDelete,
  onToggleEnabled,
}: ServerPanelProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>服务器</CardTitle>
          <CardDescription>所有服务器使用设置中的共享 SSH 私钥</CardDescription>
        </div>
        <Button onClick={onCreate}>
          <Plus /> 添加服务器
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>地址</TableHead>
              <TableHead>主机指纹</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <EmptyRow text="加载中..." />
            ) : servers.length === 0 ? (
              <EmptyRow text="暂无服务器" />
            ) : (
              servers.map((server) => (
                <ServerRow
                  key={server.id}
                  server={server}
                  busy={busy}
                  onEdit={onEdit}
                  onTest={onTest}
                  onDelete={onDelete}
                  onToggleEnabled={onToggleEnabled}
                />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ServerRow({
  server,
  busy,
  onEdit,
  onTest,
  onDelete,
  onToggleEnabled,
}: Omit<ServerPanelProps, "servers" | "loading" | "onCreate"> & { server: ManagedServer }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{server.name}</TableCell>
      <TableCell>{server.username}@{server.host}:{server.port}</TableCell>
      <TableCell className="font-mono text-xs">
        {server.hostFingerprint ? `${server.hostFingerprint.slice(0, 24)}…` : "未设置"}
      </TableCell>
      <TableCell>
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleEnabled?.(server)}
          className="inline-flex cursor-pointer transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          title={`点击${server.enabled ? "停用" : "启用"}此服务器`}
        >
          <Badge variant={server.enabled ? "default" : "secondary"}>
            {server.enabled ? "启用" : "停用"}
          </Badge>
        </button>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="sm" disabled={busy || !server.hostFingerprint} onClick={() => onTest(server)}>
            <RefreshCw /> 测试连接
          </Button>
          <Button variant="ghost" size="icon" disabled={busy} onClick={() => onEdit(server)} aria-label={`编辑服务器 ${server.name}`}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={() => onDelete({ type: "server", id: server.id, name: server.name })}
            aria-label={`删除服务器 ${server.name}`}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}
