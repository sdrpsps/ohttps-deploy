import { createHmac } from "node:crypto";
import { redactSensitive } from "./ohttps-client";

export type WebhookEvent = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  object: { type: string; id?: string };
  status: "success" | "failure" | "warning";
  errorSummary?: string;
};

export function signWebhook(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export async function postWebhook(event: WebhookEvent, url: string, secret: string, fetchImpl: typeof fetch = fetch) {
  const body = JSON.stringify(event);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ohttps-deploy-signature": signWebhook(body, secret), "x-ohttps-deploy-event-id": event.eventId },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const summary = redactSensitive((await response.text().catch(() => "")).slice(0, 500));
    return response.ok ? { ok: true as const, summary } : { ok: false as const, error: `webhook returned HTTP ${response.status}`, summary };
  } catch (error) {
    return { ok: false as const, error: redactSensitive(error instanceof Error ? error.message : "webhook request failed"), summary: "" };
  }
}
