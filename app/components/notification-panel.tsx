"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type Notification = { id: string; eventType: string; objectType: string; objectId: string | null; status: string; attempts: number; lastError: string | null; nextRetryAt: string | null; createdAt: string };
export function NotificationPanel() {
  const [rows, setRows] = useState<Notification[]>([]);
  async function load() { const response = await fetch("/api/notifications", { cache: "no-store" }); if (response.ok) setRows((await response.json()).data); }
  useEffect(() => { void load(); }, []);
  async function retry(id: string) { await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }); await load(); }
  return <Card><CardHeader><CardTitle>通知投递</CardTitle><CardDescription>Webhook 投递状态与失败重试</CardDescription></CardHeader><CardContent><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">事件</th><th className="p-2">对象</th><th className="p-2">状态</th><th className="p-2">时间</th><th className="p-2">投递次数</th><th className="p-2">最后错误 / 下次重试</th><th className="p-2">操作</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b"><td className="p-2">{row.eventType}</td><td className="p-2">{row.objectType}/{row.objectId ?? "-"}</td><td className="p-2"><Badge variant={row.status === "delivered" ? "default" : row.status === "failed" ? "destructive" : "secondary"}>{row.status}</Badge></td><td className="p-2 text-xs">{formatDate(row.createdAt)}</td><td className="p-2">{row.attempts}</td><td className="max-w-xs p-2 text-xs text-destructive">{row.lastError ?? "-"}{row.nextRetryAt && <span className="mt-1 block text-muted-foreground">下次：{formatDate(row.nextRetryAt)}</span>}</td><td className="p-2">{row.status !== "delivered" && <Button size="sm" variant="outline" onClick={() => void retry(row.id)}>立即重试</Button>}</td></tr>)}{rows.length === 0 && <tr><td className="p-4 text-muted-foreground" colSpan={7}>暂无通知记录</td></tr>}</tbody></table></div></CardContent></Card>;
}
