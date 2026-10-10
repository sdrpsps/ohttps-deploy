import { redactSensitive } from "./ohttps-client";

export type WebhookEvent = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  object: { type: string; id?: string };
  context?: {
    certificates?: Array<{ name: string; domain: string; expiresAt?: string }>;
    deploymentTitle?: string;
    dryRun?: boolean;
    servers?: Array<{ name: string; status: string; errorSummary?: string }>;
  };
  status: "success" | "failure" | "warning";
  errorSummary?: string;
};

const barkEventTitles: Record<string, string> = {
  "certificate.cache_missing": "证书本地缓存缺失",
  "certificate.expired": "证书已过期",
  "certificate.expiring": "证书即将过期",
  "certificate.recovered": "证书状态已恢复",
  "certificate.sync_recovered": "证书同步已恢复",
  "certificate.synced": "证书同步成功",
  "certificate.sync_failed": "证书同步失败",
  "deployment.succeeded": "证书部署成功",
  "deployment.partial": "证书部署部分失败",
  "deployment.failed": "证书部署失败",
  "notification.test": "Bark 测试消息",
};

const eventDescriptions: Record<string, string> = {
  "certificate.cache_missing": "本地证书缓存缺失，Worker 将尝试重新获取证书。",
  "certificate.expired": "本地证书已过期，请检查续期及部署结果。",
  "certificate.expiring": "本地证书已进入续期提醒窗口，Worker 将按配置检查上游证书。",
  "certificate.recovered": "本地证书缓存已就绪，有效期已超过续期提醒窗口。",
  "certificate.synced": "最新证书版本已保存到本地，自动部署结果将另行通知。",
  "certificate.sync_failed": "本次证书同步失败，请检查错误原因；已有本地版本会保留。",
  "certificate.sync_recovered": "证书同步已成功，先前的同步故障已解除；本地版本无需更新。",
  "deployment.succeeded": "本次证书部署已完成。",
  "deployment.partial": "本次部署部分成功，请检查失败服务器。",
  "deployment.failed": "本次部署未达到成功条件，请检查服务器结果和错误原因。",
  "notification.test": "Bark 推送连接正常，可以接收证书和部署通知。",
};

export function toBarkPayload(event: WebhookEvent) {
  const context = event.context;
  const certificateLines = context?.certificates?.map((certificate) => {
    const label = certificate.name;
    const remainingDays = certificate.expiresAt ? Math.ceil((Date.parse(certificate.expiresAt) - Date.parse(event.occurredAt)) / 86_400_000) : undefined;
    const remaining = remainingDays !== undefined && Number.isFinite(remainingDays) ? (remainingDays > 0 ? `；剩余 ${remainingDays} 天` : "；已到期") : "";
    const expiry = certificate.expiresAt ? `；到期：${certificate.expiresAt.slice(0, 10)}（UTC）${remaining}` : "";
    return `证书：${label}${expiry}`;
  }) ?? [];
  const serverStatuses: Record<string, string> = { succeeded: "成功", failed: "失败", cancelled: "已取消", queued: "待执行", running: "执行中" };
  const serverLines = context?.servers?.map((server) =>
    `服务器：${server.name} · ${serverStatuses[server.status] ?? "未知状态"}${server.errorSummary ? `；原因：${server.errorSummary}` : ""}`
  ) ?? [];
  const dryRun = context?.dryRun && event.eventType.startsWith("deployment.");
  return {
    title: `ohttps-deploy · ${dryRun ? "模拟校验 · " : ""}${barkEventTitles[event.eventType] ?? "系统通知"}`,
    body: [
      dryRun ? "本次仅执行模拟校验，未替换远端证书或重载服务。" : (eventDescriptions[event.eventType] ?? "系统状态已更新，请查看控制台。"),
      ...certificateLines,
      ...(context?.deploymentTitle ? [`任务：${context.deploymentTitle}`] : []),
      ...serverLines,
      ...(!certificateLines.length && event.object.type === "certificate" ? ["证书信息不可用，请查看控制台记录。"] : []),
      ...(event.errorSummary ? [`原因：${event.errorSummary}`] : []),
    ].join("\n"),
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
