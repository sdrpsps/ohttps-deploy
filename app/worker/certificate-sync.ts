import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import { certificateSyncJobs, certificates, certificateVersions, logs, settings } from "../db/schema";
import { validateCertificatePair } from "../domain/certificate";
import { redactSensitive } from "../domain/ohttps-client";
import { shouldScheduleSync } from "../domain/renewal";
import { createLogger } from "../lib/logger";
import { workerAdapters, workerContext } from "./context";
import { notifyCertificateRecovery, notifySyncRecovery, queueNotification } from "./notifications";
import { enqueueSyncJob } from "./sync-jobs";
import { reserveOhttpsCall } from "./daily-limit";
import { reconcileAutoDeployments } from "./automation";

const logger = createLogger("worker");

export async function scanCertificates() {
  const now = new Date(workerAdapters.now());
  const active = await db.select().from(certificates).where(eq(certificates.status, "active"));
  for (const certificate of active) {
    try {
      const current = await workerAdapters.certificateStore.getCurrent(certificate.id);
      await db.update(certificates).set({ expiresAt: current?.notAfter ?? certificate.expiresAt, lastCheckedAt: now, updatedAt: now }).where(eq(certificates.id, certificate.id));
      if (!current) await queueNotification("certificate.cache_missing", "certificate", certificate.id, "warning");
      const remaining = current ? current.notAfter.getTime() - now.getTime() : Infinity;
      if (remaining <= 0) await queueNotification("certificate.expired", "certificate", certificate.id, "failure");
      else if (remaining <= certificate.renewBeforeDays * 24 * 60 * 60 * 1000) await queueNotification("certificate.expiring", "certificate", certificate.id, "warning");
      else if (current) await notifyCertificateRecovery(certificate.id);
      // Persist actual upstream attempts, including failed requests. Local scans,
      // missing credentials and exhausted daily quota are not upstream calls.
      const [attempt] = await db.select({ value: settings.value }).from(settings)
        .where(eq(settings.key, `ohttps_last_attempt_${certificate.id}`)).limit(1);
      const lastAttemptAt = Math.max(certificate.lastSyncAt?.getTime() ?? 0, Number(attempt?.value) || 0);
      if (!shouldScheduleSync({ expiresAt: current?.notAfter, lastCheckedAt: lastAttemptAt ? new Date(lastAttemptAt) : null, now, renewBeforeDays: certificate.renewBeforeDays, minimumIntervalSeconds: workerContext.runtimeSettings.ohttpsMinIntervalSeconds })) continue;
      await enqueueSyncJob(certificate.id, "scheduled");
    } catch (error) { logger.error("certificate scan failed", { certificateId: certificate.id, error: redactSensitive(String(error), workerContext.runtimeSettings.ohttpsApiKey) }); }
  }
}

export async function processSyncQueue(assertLease: () => void) {
  const cutoff = workerAdapters.now() - workerContext.runtimeSettings.ohttpsMinIntervalSeconds * 1000;
  const queued = await db.select({ id: certificateSyncJobs.id }).from(certificateSyncJobs)
    .where(and(eq(certificateSyncJobs.status, "queued"), or(eq(certificateSyncJobs.force, true), sql`NOT EXISTS (
      SELECT 1 FROM settings WHERE key = 'ohttps_last_attempt_' || ${certificateSyncJobs.certificateId}
      AND CAST(value AS INTEGER) > ${cutoff}
    )`)))
    .orderBy(certificateSyncJobs.createdAt).limit(10);
  for (const job of queued) { assertLease(); await processSyncJob(job.id); }
}

export async function processSyncJob(jobId: string) {
  const [job] = await db.update(certificateSyncJobs).set({ status: "running", startedAt: new Date(workerAdapters.now()), updatedAt: new Date(workerAdapters.now()) })
    .where(and(eq(certificateSyncJobs.id, jobId), eq(certificateSyncJobs.status, "queued"))).returning();
  if (!job) return;
  let sequence = (await db.select({ sequence: logs.sequence }).from(logs).where(eq(logs.syncJobId, jobId)).orderBy(desc(logs.sequence)).limit(1))[0]?.sequence ?? 0;
  const progress = async (phase: string, message: string, level: "info" | "warn" | "error" = "info") => {
    sequence += 1;
    await db.update(certificateSyncJobs).set({ phase, updatedAt: new Date(workerAdapters.now()) }).where(eq(certificateSyncJobs.id, jobId));
    await db.insert(logs).values({ id: randomUUID(), syncJobId: jobId, sequence, level, message });
  };
  await progress("checking", "Worker 已接手任务，正在检查本地证书版本");
  const [certificate] = await db.select().from(certificates).where(eq(certificates.id, job.certificateId)).limit(1);
  if (!certificate || certificate.status !== "active") {
    await progress("cancelled", "证书不存在或已停用，任务已取消", "warn");
    return finishSyncJob(jobId, "cancelled", "certificate is unavailable or disabled");
  }
  try {
    const current = await workerAdapters.certificateStore.getCurrent(certificate.id);
    if (!workerContext.runtimeSettings.ohttpsApiId || !workerContext.runtimeSettings.ohttpsApiKey) throw new Error("ohttps credentials are not configured");
    await progress("quota", "正在检查本次 ohttps 调用额度");
    await consumeOhttpsCall();
    await progress("fetching", `正在从 ohttps 获取最新证书 (证书 ID: ${certificate.ohttpsCertificateId})`);
    const attemptedAt = new Date(workerAdapters.now());
    await db.insert(settings).values({ key: `ohttps_last_attempt_${certificate.id}`, value: String(attemptedAt.getTime()) })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(attemptedAt.getTime()), updatedAt: attemptedAt } });
    const payload = await workerAdapters.ohttpsClient(workerContext.runtimeSettings.ohttpsApiId, workerContext.runtimeSettings.ohttpsApiKey).getCertificate(certificate.ohttpsCertificateId, { signal: workerContext.leaseSignal });
    if (workerContext.leaseSignal?.aborted) throw new Error("worker lease lost or stopping");
    await progress("validating", `正在校验证书、私钥与域名匹配: ${certificate.domain}`);
    const parsed = validateCertificatePair(payload.fullChainCerts, payload.certKey, { requiredSans: [certificate.domain], now: new Date(workerAdapters.now()) });
    const now = new Date(workerAdapters.now());
    if (current && parsed.notAfter.getTime() < current.notAfter.getTime()) throw new Error("upstream certificate expires before the current certificate");
    const unchanged = current && current.fingerprint === parsed.fingerprint && current.notAfter.getTime() === parsed.notAfter.getTime();
    const [registered] = await db.select().from(certificateVersions).where(eq(certificateVersions.id, certificate.currentVersionId ?? "")).limit(1);
    if (unchanged && registered?.fingerprint === parsed.fingerprint) {
      await db.update(certificates).set({ expiresAt: parsed.notAfter, lastCheckedAt: now, lastSyncAt: now, updatedAt: now }).where(eq(certificates.id, certificate.id));
      await progress("succeeded", `远端证书与本地版本一致 (到期时间: ${parsed.notAfter.toISOString().slice(0, 10)})，无需更新`);
      await notifySyncRecovery(certificate.id);
      return finishSyncJob(jobId, "succeeded");
    }
    await progress("saving", `发现新证书版本 (到期时间: ${parsed.notAfter.toISOString().slice(0, 10)})，正在安全保存`);
    const stored = unchanged ? current : await workerAdapters.certificateStore.saveVersion(certificate.id, { certificatePem: payload.fullChainCerts, privateKeyPem: payload.certKey, fetchedAt: now, metadata: { source: "ohttps" } });
    const [latest] = await db.select({ version: certificateVersions.version }).from(certificateVersions).where(eq(certificateVersions.certificateId, certificate.id)).orderBy(desc(certificateVersions.version)).limit(1);
    const versionId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(certificateVersions).values({ id: versionId, certificateId: certificate.id, version: (latest?.version ?? 0) + 1, fingerprint: stored.fingerprint, fetchedAt: now, expiresAt: stored.notAfter, certPath: `${stored.directory}/fullchain.pem`, privateKeyPath: `${stored.directory}/privkey.pem`, validationStatus: "valid" });
      await tx.update(certificates).set({ currentVersionId: versionId, expiresAt: stored.notAfter, lastCheckedAt: now, lastSyncAt: now, updatedAt: now }).where(eq(certificates.id, certificate.id));
    });
    await progress("deploying", "新版本已保存，正在按部署策略创建部署任务");
    await reconcileAutoDeployments(new Date(workerAdapters.now()), { certificateId: certificate.id, syncJobId: jobId });
    await queueNotification("certificate.synced", "certificate", certificate.id, "success", undefined, `sync:${jobId}`);
    await progress("succeeded", "同步完成；如有已勾选的部署服务器，将在部署任务中继续执行");
    await finishSyncJob(jobId, "succeeded");
  } catch (error) {
    const message = redactSensitive(error instanceof Error ? error.message : "certificate sync failed", workerContext.runtimeSettings.ohttpsApiKey);
    await db.update(certificates).set({ lastCheckedAt: new Date(workerAdapters.now()), updatedAt: new Date(workerAdapters.now()) }).where(eq(certificates.id, job.certificateId));
    await progress("failed", `同步失败：${message}`, "error");
    await finishSyncJob(jobId, "failed", message);
    await queueNotification("certificate.sync_failed", "certificate", job.certificateId, "failure", message);
  }
}

async function finishSyncJob(id: string, status: "succeeded" | "failed" | "cancelled", errorSummary?: string) {
  await db.update(certificateSyncJobs).set({ status, phase: status, errorSummary: errorSummary ?? null, finishedAt: new Date(workerAdapters.now()), updatedAt: new Date(workerAdapters.now()) }).where(eq(certificateSyncJobs.id, id));
}

async function consumeOhttpsCall() {
  if (!await reserveOhttpsCall(workerContext.runtimeSettings.ohttpsDailyCallLimit, new Date(workerAdapters.now()))) throw new Error("ohttps daily call limit reached");
}

