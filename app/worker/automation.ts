import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db";
import { certificates, certificateVersions, certificateTargets, servers, deployments, deploymentCertificates, deploymentTargets, certificateSyncJobs } from "../db/schema";

// Called only while holding the Worker lease, before starting any external work.
// A previous lease owner cannot leave a task permanently blocking the queue.
export async function recoverInterruptedTasks() {
  await db.transaction(async (tx) => {
    await tx.update(certificateSyncJobs).set({ status: "queued", phase: "queued", updatedAt: new Date() })
      .where(eq(certificateSyncJobs.status, "running"));
    const interrupted = await tx.select({ id: deployments.id }).from(deployments).where(eq(deployments.status, "running"));
    if (!interrupted.length) return;
    const ids = interrupted.map(({ id }) => id);
    await tx.update(deploymentTargets).set({ status: "queued", updatedAt: new Date() })
      .where(and(inArray(deploymentTargets.deploymentId, ids), eq(deploymentTargets.status, "running")));
    await tx.update(deployments).set({ status: "queued", updatedAt: new Date() }).where(inArray(deployments.id, ids));
  });
}

/** Reconcile the current version to enabled targets, independently of upstream sync.
 * Missing/failed targets retry at most hourly; successes and explicit cancellations
 * for this version are preserved. A new version or newly enabled target is eligible.
 */
export async function reconcileAutoDeployments(now = new Date(), source?: { certificateId: string; syncJobId: string }) {
  await db.transaction(async (tx) => {
    const desired = await tx.select({ certificateId: certificates.id, versionId: certificateVersions.id, serverId: servers.id })
      .from(certificates).innerJoin(certificateVersions, eq(certificates.currentVersionId, certificateVersions.id))
      .innerJoin(certificateTargets, eq(certificates.id, certificateTargets.certificateId))
      .innerJoin(servers, eq(certificateTargets.serverId, servers.id))
      .where(and(eq(certificates.status, "active"), eq(certificateVersions.validationStatus, "valid"), eq(servers.enabled, true), eq(certificateTargets.autoDeploy, true), source ? eq(certificates.id, source.certificateId) : undefined));
    const groups = new Map<string, { versionId: string; serverIds: string[] }>();
    for (const target of desired) {
      // Include legacy single-certificate deployments and batch deployments.
      const history = await tx.select({ status: deploymentTargets.status, deploymentStatus: deployments.status, versionId: deploymentCertificates.certificateVersionId, legacyVersionId: deployments.certificateVersionId, finishedAt: deployments.finishedAt, updatedAt: deployments.updatedAt })
        .from(deploymentTargets).innerJoin(deployments, eq(deploymentTargets.deploymentId, deployments.id))
        .leftJoin(deploymentCertificates, and(eq(deploymentCertificates.deploymentId, deployments.id), eq(deploymentCertificates.certificateId, target.certificateId)))
        .where(and(eq(deploymentTargets.serverId, target.serverId), eq(deployments.dryRun, false), or(eq(deployments.certificateId, target.certificateId), eq(deploymentCertificates.certificateId, target.certificateId))))
        .orderBy(desc(deployments.createdAt), desc(deploymentTargets.createdAt));
      if (history.some((h) => h.deploymentStatus === "queued" || h.deploymentStatus === "running")) continue;
      const latest = history[0];
      if (latest && (latest.versionId ?? latest.legacyVersionId) === target.versionId) {
        if (latest.status === "succeeded" || latest.status === "cancelled" || latest.deploymentStatus === "cancelled") continue;
        if (now.getTime() - (latest.finishedAt ?? latest.updatedAt).getTime() < 3_600_000) continue;
      }
      const group = groups.get(target.certificateId) ?? { versionId: target.versionId, serverIds: [] };
      group.serverIds.push(target.serverId);
      groups.set(target.certificateId, group);
    }
    for (const [certificateId, group] of groups) {
      const id = randomUUID();
      await tx.insert(deployments).values({ id, certificateId, certificateVersionId: group.versionId, syncJobId: source?.certificateId === certificateId ? source.syncJobId : undefined, trigger: "scheduled", createdAt: now, updatedAt: now });
      await tx.insert(deploymentCertificates).values({ id: randomUUID(), deploymentId: id, certificateId, certificateVersionId: group.versionId });
      await tx.insert(deploymentTargets).values(group.serverIds.map((serverId) => ({ id: randomUUID(), deploymentId: id, serverId })));
    }
  });
}
