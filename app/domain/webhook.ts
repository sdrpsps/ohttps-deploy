import { redactSensitive } from "./ohttps-client";

export type WebhookEvent = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  object: { type: string; id?: string };
  status: "success" | "failure" | "warning";
  errorSummary?: string;
};

const barkEventTitles: Record<string, string> = {
  "certificate.cache_missing": "证书本地缓存缺失",
  "certificate.expired": "证书已过期",
  "certificate.expiring": "证书即将过期",
  "certificate.recovered": "证书已恢复",
  "certificate.synced": "证书同步成功",
  "certificate.sync_failed": "证书同步失败",
  "deployment.succeeded": "证书部署成功",
  "deployment.partial": "证书部署部分失败",
  "deployment.failed": "证书部署失败",
  "notification.test": "Bark 测试消息",
};

export function toBarkPayload(event: WebhookEvent) {
  const object = event.object.id ? `${event.object.type}/${event.object.id}` : event.object.type;
  return {
    title: `ohttps-deploy · ${barkEventTitles[event.eventType] ?? event.eventType}`,
    body: [`事件：${event.eventType}`, `对象：${object}`, ...(event.errorSummary ? [`错误：${event.errorSummary}`] : [])].join("\n"),
    group: "ohttps-deploy",
  };
}

export async function postWebhook(event: WebhookEvent, url: string, fetchImpl: typeof fetch = fetch) {
  const body = JSON.stringify(toBarkPayload(event));
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const summary = redactSensitive((await response.text().catch(() => "")).slice(0, 500));
    return response.ok ? { ok: true as const, summary } : { ok: false as const, error: `webhook returned HTTP ${response.status}`, summary };
  } catch (error) {
    return { ok: false as const, error: redactSensitive(error instanceof Error ? error.message : "webhook request failed"), summary: "" };
  }
}
