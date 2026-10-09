import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "../db";
import { notifications } from "../db/schema";
import { postWebhook, type WebhookEvent } from "../domain/webhook";
import { workerAdapters, workerContext } from "./context";

export async function hasRecentCertificateAlert(certificateId: string) {
  const [alert] = await db.select({ id: notifications.id }).from(notifications)
    .where(and(eq(notifications.objectType, "certificate"), eq(notifications.objectId, certificateId), or(eq(notifications.eventType, "certificate.expired"), eq(notifications.eventType, "certificate.expiring"), eq(notifications.eventType, "certificate.sync_failed")))).limit(1);
  return Boolean(alert);
}

export async function queueNotification(eventType: string, objectType: string, objectId: string, status: WebhookEvent["status"], errorSummary?: string) {
  if (!workerContext.runtimeSettings.webhookUrl) return;
  const occurredAt = new Date(workerAdapters.now()).toISOString();
  // A day is the notification time window; retries reuse the same event id.
  const eventId = createHash("sha256").update(`${eventType}:${objectType}:${objectId}:${occurredAt.slice(0, 10)}`).digest("hex");
  const event: WebhookEvent = { eventId, eventType, occurredAt, object: { type: objectType, id: objectId }, status, ...(errorSummary ? { errorSummary } : {}) };
  await db.insert(notifications).values({ id: randomUUID(), eventId, eventType, objectType, objectId, payloadJson: JSON.stringify(event) }).onConflictDoNothing();
}

export async function deliverPendingNotifications() {
  if (!workerContext.runtimeSettings.webhookUrl) return;
  const now = new Date(workerAdapters.now());
  const pending = await db.select().from(notifications)
    .where(or(eq(notifications.status, "pending"), and(eq(notifications.status, "failed"), lte(notifications.nextRetryAt, now), isNull(notifications.deliveredAt))))
    .limit(20);
  for (const notification of pending) {
    let event: WebhookEvent;
    try { event = JSON.parse(notification.payloadJson) as WebhookEvent; }
    catch {
      await db.update(notifications).set({ status: "failed", lastError: "stored webhook event is invalid", updatedAt: new Date(workerAdapters.now()) }).where(eq(notifications.id, notification.id));
      continue;
    }
    const result = await postWebhook(event, workerContext.runtimeSettings.webhookUrl);
    const attempts = notification.attempts + 1;
    if (result.ok) {
      await db.update(notifications).set({ status: "delivered", attempts, responseSummary: result.summary, lastError: null, deliveredAt: new Date(workerAdapters.now()), nextRetryAt: null, updatedAt: new Date(workerAdapters.now()) }).where(eq(notifications.id, notification.id));
      continue;
    }
    const delayMs = Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.min(attempts - 1, 6));
    await db.update(notifications).set({ status: "failed", attempts, lastError: result.error, responseSummary: result.summary, nextRetryAt: new Date(workerAdapters.now() + delayMs), updatedAt: new Date(workerAdapters.now()) }).where(eq(notifications.id, notification.id));
  }
}

