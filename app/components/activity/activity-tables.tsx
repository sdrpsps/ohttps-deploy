import { Badge } from "@/components/ui/badge";
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
import { EmptyRow } from "./deployment-history";
import { AuditEntry, formatActivityDate, LogEntry } from "./types";

export function ActivityTables({ logs, auditEvents }: { logs: LogEntry[]; auditEvents: AuditEntry[] }) {
  return (
    <>
      <HistoryLogs logs={logs} />
      <AuditEvents events={auditEvents} />
    </>
  );
}

function HistoryLogs({ logs }: { logs: LogEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>历史日志</CardTitle>
        <CardDescription>支持按证书、服务器与开始日期筛选，最多返回 200 条。</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>对象</TableHead><TableHead>级别</TableHead><TableHead>消息</TableHead></TableRow></TableHeader>
          <TableBody>
            {logs.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatActivityDate(entry.createdAt)}</TableCell>
                <TableCell className="text-xs">{entry.certificateName ?? "—"}{entry.serverName && ` / ${entry.serverName}`}</TableCell>
                <TableCell><Badge variant={entry.level === "error" ? "destructive" : "secondary"}>{entry.level}</Badge></TableCell>
                <TableCell>{entry.message}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && <EmptyRow colSpan={4} text="暂无匹配日志" />}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AuditEvents({ events }: { events: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>审计记录</CardTitle>
        <CardDescription>记录管理员对证书、服务器和部署策略的变更。</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>操作</TableHead><TableHead>对象</TableHead><TableHead>结果</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-xs">{formatActivityDate(entry.createdAt)}</TableCell>
                <TableCell>{entry.action}</TableCell>
                <TableCell className="text-xs">{entry.objectType} / {entry.objectId ?? "—"}</TableCell>
                <TableCell><Badge variant={entry.result === "success" ? "default" : "destructive"}>{entry.result}</Badge></TableCell>
              </TableRow>
            ))}
            {events.length === 0 && <EmptyRow colSpan={4} text="暂无审计记录" />}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
