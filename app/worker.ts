import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lte, or } from "drizzle-orm";
import { loadConfig } from "./lib/config";
import { createLogger } from "./lib/logger";
import { loadRuntimeSettings, runtimeDefaults, type RuntimeSettings } from "./lib/runtime-settings";
import { db } from "./db";
import { CertificateStore } from "./domain/certificate-store";
import { validateCertificatePair } from "./domain/certificate";
import { OHTTPSClient, redactSensitive } from "./domain/ohttps-client";
import { shouldScheduleSync } from "./domain/renewal";
import { postWebhook, type WebhookEvent } from "./domain/webhook";
import { certificateSyncJobs, certificateTargets, certificates, certificateVersions, deployments, deploymentTargets, logs, notifications, servers, settings } from "./db/schema";
import { SSHDeployer } from "./deployer";

const config = loadConfig();
const logger = createLogger("worker");
logger.info("worker started");
const certificateStore = new CertificateStore(config.CERTIFICATE_STORAGE_DIR);
let runtimeSettings: RuntimeSettings = { ...runtimeDefaults, ohttpsApiId: "", ohttpsApiKey: "", webhookUrl: "", webhookSecret: "" };

let stopping = false;
const stop = (signal: string) => { stopping = true; logger.info("worker stopping", { signal }); };
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

let polling = false;
async function pollQueue() {
  if (polling || stopping) return;
  polling = true;
  try {
    runtimeSettings = await loadRuntimeSettings();
    await scanCertificates();
    await processSyncQueue();
    const queued = await db.select().from(deployments).where(eq(deployments.status, "queued")).limit(10);
    for (const deployment of queued) await processDeployment(deployment.id);
    await deliverPendingNotifications();
  } catch (error) { logger.error("queue poll failed", { error: String(error) }); }
  finally { polling = false; }
}

async function scanCertificates() {
  const now = new Date();
  const active = await db.select().from(certificates).where(eq(certificates.status, "active"));
  for (const certificate of active) {
    const current = await certificateStore.getCurrent(certificate.id);
    await db.update(certificates).set({ expiresAt: current?.notAfter ?? certificate.expiresAt, lastCheckedAt: now, updatedAt: now }).where(eq(certificates.id, certificate.id));
    if (!current) {
      await queueNotification("certificate.cache_missing", "certificate", certificate.id, "warning");
      continue;
    }
    const remaining = current.notAfter.getTime() - now.getTime();
    if (remaining <= 0) await queueNotification("certificate.expired", "certificate", certificate.id, "failure");
    else if (remaining <= certificate.renewBeforeDays * 24 * 60 * 60 * 1000) await queueNotification("certificate.expiring", "certificate", certificate.id, "warning");
    const syncedForCurrentVersion = await hasSyncedCurrentVersion(certificate.id, current.fingerprint);
    if (!shouldScheduleSync({ expiresAt: current.notAfter, lastCheckedAt: certificate.lastSyncAt ?? certificate.lastCheckedAt, now, renewBeforeDays: certificate.renewBeforeDays, minimumIntervalSeconds: runtimeSettings.ohttpsMinIntervalSeconds, syncedForCurrentVersion })) continue;
    const [existing] = await db.select({ id: certificateSyncJobs.id }).from(certificateSyncJobs)
      .where(and(eq(certificateSyncJobs.certificateId, certificate.id), or(eq(certificateSyncJobs.status, "queued"), eq(certificateSyncJobs.status, "running")))).limit(1);
    if (!existing) await db.insert(certificateSyncJobs).values({ id: randomUUID(), certificateId: certificate.id, trigger: "scheduled" });
  }
}

async function processSyncQueue() {
  const queued = await db.select({ id: certificateSyncJobs.id }).from(certificateSyncJobs).where(eq(certificateSyncJobs.status, "queued")).limit(10);
  for (const job of queued) await processSyncJob(job.id);
}

async function processSyncJob(jobId: string) {
  const [job] = await db.update(certificateSyncJobs).set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(certificateSyncJobs.id, jobId), eq(certificateSyncJobs.status, "queued"))).returning();
  if (!job) return;
  const [certificate] = await db.select().from(certificates).where(eq(certificates.id, job.certificateId)).limit(1);
  if (!certificate || certificate.status !== "active") return finishSyncJob(jobId, "cancelled", "certificate is unavailable or disabled");
  try {
    const current = await certificateStore.getCurrent(certificate.id);
    if (!runtimeSettings.ohttpsApiId || !runtimeSettings.ohttpsApiKey) throw new Error("ohttps credentials are not configured");
    await consumeOhttpsCall();
    const payload = await new OHTTPSClient(runtimeSettings.ohttpsApiId, runtimeSettings.ohttpsApiKey).getCertificate(certificate.ohttpsCertificateId);
    const parsed = validateCertificatePair(payload.fullChainCerts, payload.certKey, { requiredSans: [certificate.domain] });
    const now = new Date();
    if (current && current.fingerprint === parsed.fingerprint && current.notAfter.getTime() === parsed.notAfter.getTime()) {
      await db.update(certificates).set({ expiresAt: parsed.notAfter, lastCheckedAt: now, lastSyncAt: now, updatedAt: now }).where(eq(certificates.id, certificate.id));
      await markSyncedCurrentVersion(certificate.id, current.fingerprint);
      return finishSyncJob(jobId, "succeeded");
    }
    const stored = await certificateStore.saveVersion(certificate.id, { certificatePem: payload.fullChainCerts, privateKeyPem: payload.certKey, fetchedAt: now, metadata: { source: "ohttps" } });
    const [latest] = await db.select({ version: certificateVersions.version }).from(certificateVersions).where(eq(certificateVersions.certificateId, certificate.id)).orderBy(desc(certificateVersions.version)).limit(1);
    const versionId = randomUUID();
    await db.insert(certificateVersions).values({ id: versionId, certificateId: certificate.id, version: (latest?.version ?? 0) + 1, fingerprint: stored.fingerprint, fetchedAt: now, expiresAt: stored.notAfter, certPath: `${stored.directory}/fullchain.pem`, privateKeyPath: `${stored.directory}/privkey.pem`, validationStatus: "valid" });
    await db.update(certificates).set({ currentVersionId: versionId, expiresAt: stored.notAfter, lastCheckedAt: now, lastSyncAt: now, updatedAt: now }).where(eq(certificates.id, certificate.id));
    await markSyncedCurrentVersion(certificate.id, stored.fingerprint);
    await createAutoDeployment(certificate.id, versionId);
    await queueNotification("certificate.synced", "certificate", certificate.id, "success");
    await finishSyncJob(jobId, "succeeded");
  } catch (error) {
    const message = redactSensitive(error instanceof Error ? error.message : "certificate sync failed", runtimeSettings.ohttpsApiKey);
    await db.update(certificates).set({ lastCheckedAt: new Date(), updatedAt: new Date() }).where(eq(certificates.id, job.certificateId));
    await finishSyncJob(jobId, "failed", message);
    await queueNotification("certificate.sync_failed", "certificate", job.certificateId, "failure", message);
  }
}

async function finishSyncJob(id: string, status: "succeeded" | "failed" | "cancelled", errorSummary?: string) {
  await db.update(certificateSyncJobs).set({ status, errorSummary: errorSummary ?? null, finishedAt: new Date(), updatedAt: new Date() }).where(eq(certificateSyncJobs.id, id));
}

async function createAutoDeployment(certificateId: string, certificateVersionId: string) {
  const targets = await db.select({ serverId: servers.id }).from(certificateTargets).innerJoin(servers, eq(certificateTargets.serverId, servers.id))
    .where(and(eq(certificateTargets.certificateId, certificateId), eq(certificateTargets.autoDeploy, true), eq(servers.enabled, true)));
  if (!targets.length) return;
  const deploymentId = randomUUID();
  await db.insert(deployments).values({ id: deploymentId, certificateId, certificateVersionId, trigger: "scheduled" });
  await db.insert(deploymentTargets).values(targets.map(({ serverId }) => ({ id: randomUUID(), deploymentId, serverId })));
}

async function consumeOhttpsCall() {
  const key = `ohttps_calls_${new Date().toISOString().slice(0, 10)}`;
  const [counter] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  const count = Number(counter?.value ?? 0);
  if (!Number.isSafeInteger(count) || count >= runtimeSettings.ohttpsDailyCallLimit) throw new Error("ohttps daily call limit reached");
  await db.insert(settings).values({ key, value: String(count + 1) }).onConflictDoUpdate({ target: settings.key, set: { value: String(count + 1), updatedAt: new Date() } });
}

function syncCycleKey(certificateId: string, fingerprint: string) {
  return `ohttps_synced_${certificateId}_${fingerprint.replace(/[^A-Za-z0-9]/g, "")}`;
}

async function hasSyncedCurrentVersion(certificateId: string, fingerprint: string) {
  const [value] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, syncCycleKey(certificateId, fingerprint))).limit(1);
  return Boolean(value);
}

async function markSyncedCurrentVersion(certificateId: string, fingerprint: string) {
  const key = syncCycleKey(certificateId, fingerprint);
  await db.insert(settings).values({ key, value: new Date().toISOString() }).onConflictDoUpdate({ target: settings.key, set: { value: new Date().toISOString(), updatedAt: new Date() } });
}

async function processDeployment(deploymentId: string) {
  const [deployment] = await db.update(deployments).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(and(eq(deployments.id, deploymentId), eq(deployments.status, "queued"))).returning();
  if (!deployment) return;
  const targets = await db.select({ id: deploymentTargets.id, serverId: servers.id, name: servers.name, host: servers.host, port: servers.port, username: servers.username, hostFingerprint: servers.hostFingerprint, certPath: servers.certPath, privateKeyPath: servers.privateKeyPath, reloadCommand: servers.reloadCommand, healthCheckCommand: servers.healthCheckCommand, timeoutSeconds: servers.timeoutSeconds }).from(deploymentTargets).innerJoin(servers, eq(deploymentTargets.serverId, servers.id)).where(eq(deploymentTargets.deploymentId, deploymentId));
  const [version] = await db.select({ certPath: certificateVersions.certPath, privateKeyPath: certificateVersions.privateKeyPath }).from(certificateVersions).where(eq(certificateVersions.id, deployment.certificateVersionId)).limit(1);
  if (!version) { await failDeployment(deploymentId, "certificate version not found"); return; }
  const [sharedKey] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "shared_ssh_private_key")).limit(1);
  if (!sharedKey) { await failDeployment(deploymentId, "shared SSH private key is not configured"); return; }
  const results = await Promise.all(targets.map(async (target, index) => {
    await db.update(deploymentTargets).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(eq(deploymentTargets.id, target.id));
    const result = await new SSHDeployer({ privateKey: sharedKey.value }).deploy(target, { certificatePath: version.certPath, privateKeyPath: version.privateKeyPath });
    await db.update(deploymentTargets).set({ status: result.ok ? "succeeded" : "failed", exitCode: result.exitCode ?? null, errorSummary: result.error ?? null, finishedAt: new Date(), updatedAt: new Date() }).where(eq(deploymentTargets.id, target.id));
    await db.insert(logs).values({ id: randomUUID(), deploymentId, targetId: target.id, sequence: index + 1, level: result.ok ? "info" : "error", message: result.ok ? `${target.name} deployed successfully` : `${target.name} deployment failed: ${result.error ?? "unknown error"}` });
    return result;
  }));
  const failed = results.filter((result) => !result.ok).length;
  const status = failed === 0 ? "succeeded" : failed === results.length || deployment.failurePolicy === "all_success" ? "failed" : "partial";
  await db.update(deployments).set({ status, finishedAt: new Date(), errorSummary: failed ? `${failed} target(s) failed` : null, updatedAt: new Date() }).where(eq(deployments.id, deploymentId));
  await queueNotification(`deployment.${status}`, "deployment", deploymentId, status === "succeeded" ? "success" : "failure", failed ? `${failed} target(s) failed` : undefined);
}

async function failDeployment(id: string, message: string) {
  await db.update(deployments).set({ status: "failed", errorSummary: message, finishedAt: new Date(), updatedAt: new Date() }).where(eq(deployments.id, id));
  await db.insert(logs).values({ id: randomUUID(), deploymentId: id, sequence: 1, level: "error", message });
  await queueNotification("deployment.failed", "deployment", id, "failure", message);
}

async function queueNotification(eventType: string, objectType: string, objectId: string, status: WebhookEvent["status"], errorSummary?: string) {
  if (!runtimeSettings.webhookUrl || !runtimeSettings.webhookSecret) return;
  const occurredAt = new Date().toISOString();
  // A day is the notification time window; retries reuse the same event id.
  const eventId = createHash("sha256").update(`${eventType}:${objectType}:${objectId}:${occurredAt.slice(0, 10)}`).digest("hex");
  const event: WebhookEvent = { eventId, eventType, occurredAt, object: { type: objectType, id: objectId }, status, ...(errorSummary ? { errorSummary } : {}) };
  await db.insert(notifications).values({ id: randomUUID(), eventId, eventType, objectType, objectId, payloadJson: JSON.stringify(event) }).onConflictDoNothing();
}

async function deliverPendingNotifications() {
  if (!runtimeSettings.webhookUrl || !runtimeSettings.webhookSecret) return;
  const now = new Date();
  const pending = await db.select().from(notifications)
    .where(or(eq(notifications.status, "pending"), and(eq(notifications.status, "failed"), lte(notifications.nextRetryAt, now), isNull(notifications.deliveredAt))))
    .limit(20);
  for (const notification of pending) {
    let event: WebhookEvent;
    try { event = JSON.parse(notification.payloadJson) as WebhookEvent; }
    catch {
      await db.update(notifications).set({ status: "failed", lastError: "stored webhook event is invalid", updatedAt: new Date() }).where(eq(notifications.id, notification.id));
      continue;
    }
    const result = await postWebhook(event, runtimeSettings.webhookUrl, runtimeSettings.webhookSecret);
    const attempts = notification.attempts + 1;
    if (result.ok) {
      await db.update(notifications).set({ status: "delivered", attempts, responseSummary: result.summary, lastError: null, deliveredAt: new Date(), nextRetryAt: null, updatedAt: new Date() }).where(eq(notifications.id, notification.id));
      continue;
    }
    const delayMs = Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.min(attempts - 1, 6));
    await db.update(notifications).set({ status: "failed", attempts, lastError: result.error, responseSummary: result.summary, nextRetryAt: new Date(Date.now() + delayMs), updatedAt: new Date() }).where(eq(notifications.id, notification.id));
  }
}

async function run() {
  while (!stopping) {
    await pollQueue();
    await new Promise((resolve) => setTimeout(resolve, Math.max(15_000, runtimeSettings.schedulerIntervalMinutes * 60_000)));
  }
}

run().catch((error) => { logger.error("worker crashed", { error: String(error) }); process.exitCode = 1; });
