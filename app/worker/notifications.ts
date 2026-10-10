import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { certificates, certificateVersions, deploymentCertificates, deployments, deploymentTargets, notifications, servers } from "../db/schema";
import { postWebhook, type WebhookEvent } from "../domain/webhook";
import { workerAdapters, workerContext } from "./context";

// Recovery follows the latest relevant event, never any historical alert.
// Delivery status is deliberately irrelevant: transport failures are not certificate failures.
async function latestCertificateEvent(certificateId: string, eventTypes: string[]) {
  return (await db.select().from(notifications).where(and(
    eq(notifications.objectType, "certificate"), eq(notifications.objectId, certificateId),
    inArray(notifications.eventType, eventTypes),
  )).orderBy(desc(notifications.createdAt), desc(sql`CASE WHEN ${notifications.eventType} IN ('certificate.recovered', 'certificate.synced', 'certificate.sync_recovered') THEN 1 ELSE 0 END`)).limit(1))[0];
}

const healthEvents = ["certificate.cache_missing", "certificate.expiring", "certificate.expired", "certificate.recovered"];
const syncEvents = ["certificate.sync_failed", "certificate.synced", "certificate.sync_recovered"];

export async function notifyCertificateRecovery(certificateId: string) {
  const previous = await latestCertificateEvent(certificateId, healthEvents);
  if (previous && previous.eventType !== "certificate.recovered") {
    await queueNotification("certificate.recovered", "certificate", certificateId, "success", undefined, `recovery:${previous.id}`);
  }
}

export async function notifySyncRecovery(certificateId: string) {
  const previous = await latestCertificateEvent(certificateId, syncEvents);
  if (previous?.eventType === "certificate.sync_failed") {
    await queueNotification("certificate.sync_recovered", "certificate", certificateId, "success", undefined, `recovery:${previous.id}`);
  }
}

// Only human-readable, non-secret metadata is stored with the event. This snapshot
// remains useful if the certificate/server is renamed or removed before delivery.
async function notificationContext(objectType: string, objectId: string): Promise<WebhookEvent["context"]> {
  const certificateFields = { name: certificates.name, domain: certificates.domain, expiresAt: certificates.expiresAt };
  if (objectType === "certificate") {
    const rows = await db.select(certificateFields).from(certificates).where(eq(certificates.id, objectId));
    return { certificates: rows.map((row) => ({ name: row.name, domain: row.domain, ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}) })) };
  }
  if (objectType !== "deployment") return undefined;
  const [deployment] = await db.select({ title: deployments.title, dryRun: deployments.dryRun, certificateId: deployments.certificateId, certificateVersionId: deployments.certificateVersionId }).from(deployments).where(eq(deployments.id, objectId)).limit(1);
  if (!deployment) return undefined;
  const deploymentCertificateFields = { name: certificates.name, domain: certificates.domain, expiresAt: certificateVersions.expiresAt };
  let certs = await db.select(deploymentCertificateFields).from(deploymentCertificates)
    .innerJoin(certificates, eq(deploymentCertificates.certificateId, certificates.id))
    .innerJoin(certificateVersions, eq(deploymentCertificates.certificateVersionId, certificateVersions.id))
    .where(eq(deploymentCertificates.deploymentId, objectId));
  if (!certs.length && deployment.certificateId && deployment.certificateVersionId) {
    certs = await db.select(deploymentCertificateFields).from(certificates)
      .innerJoin(certificateVersions, eq(certificateVersions.certificateId, certificates.id))
      .where(and(eq(certificates.id, deployment.certificateId), eq(certificateVersions.id, deployment.certificateVersionId)));
  }
  const targets = await db.select({ name: servers.name, status: deploymentTargets.status, errorSummary: deploymentTargets.errorSummary }).from(deploymentTargets).innerJoin(servers, eq(deploymentTargets.serverId, servers.id)).where(eq(deploymentTargets.deploymentId, objectId));
  return {
    deploymentTitle: deployment.title ?? undefined, dryRun: deployment.dryRun,
    certificates: certs.map((row) => ({ name: row.name, domain: row.domain, ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}) })),
    servers: targets.map((row) => ({ name: row.name, status: row.status, ...(row.errorSummary ? { errorSummary: row.errorSummary } : {}) })),
  };
}

export async function queueNotification(eventType: string, objectType: string, objectId: string, status: WebhookEvent["status"], errorSummary?: string, deduplicationKey?: string) {
  if (!workerContext.runtimeSettings.webhookUrl) return;
  const now = new Date(workerAdapters.now());
  const occurredAt = now.toISOString();
  let scope = deduplicationKey ?? occurredAt.slice(0, 10);
  if (!deduplicationKey && objectType === "deployment") {
    const [deployment] = await db.select({ startedAt: deployments.startedAt }).from(deployments).where(eq(deployments.id, objectId)).limit(1);
    scope = deployment?.startedAt?.toISOString() ?? "result";
  } else if (!deduplicationKey && objectType === "certificate") {
    // A new failure after recovery on the same day must not be suppressed.
    const recoveryEvents = eventType === "certificate.sync_failed" ? ["certificate.synced", "certificate.sync_recovered"] : ["certificate.recovered"];
    const previous = await latestCertificateEvent(objectId, recoveryEvents);
    scope += `:${previous?.id ?? "initial"}`;
  }
  // Preserve insertion order even when several events share a millisecond or
  // legacy rows were written with SQLite's second-resolution default timestamp.
  const [latest] = await db.select({ createdAt: notifications.createdAt }).from(notifications)
    .where(and(eq(notifications.objectType, objectType), eq(notifications.objectId, objectId)))
    .orderBy(desc(notifications.createdAt)).limit(1);
  const createdAt = new Date(Math.max(now.getTime(), (latest?.createdAt.getTime() ?? 0) + 1));
  const eventId = createHash("sha256").update(`${eventType}:${objectType}:${objectId}:${scope}`).digest("hex");
  const event: WebhookEvent = { eventId, eventType, occurredAt, object: { type: objectType, id: objectId }, status, context: await notificationContext(objectType, objectId), ...(errorSummary ? { errorSummary } : {}) };
  await db.insert(notifications).values({ id: randomUUID(), eventId, eventType, objectType, objectId, payloadJson: JSON.stringify(event), createdAt, updatedAt: now }).onConflictDoNothing();
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
    if (!event.context && event.object.id) {
      event.context = await notificationContext(event.object.type, event.object.id);
      await db.update(notifications).set({ payloadJson: JSON.stringify(event) }).where(eq(notifications.id, notification.id));
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

