import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { asc, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db";
import { auditEvents, certificates, certificateVersions, deploymentCertificates, deployments, logs } from "../db/schema";
import { workerAdapters } from "./context";

export async function archiveExpiredRecords(cutoff: Date, archiveDirectory: string, batchSize = 500) {
  const limit = Math.max(1, batchSize);
  let archivedAny = false;

  while (true) {
    const [expiredLogs, expiredAuditEvents] = await Promise.all([
      db.select().from(logs).where(lt(logs.createdAt, cutoff)).orderBy(asc(logs.createdAt)).limit(limit),
      db.select().from(auditEvents).where(lt(auditEvents.createdAt, cutoff)).orderBy(asc(auditEvents.createdAt)).limit(limit),
    ]);
    if (!expiredLogs.length && !expiredAuditEvents.length) break;

    await mkdir(archiveDirectory, { recursive: true, mode: 0o700 });
    const name = `retention-${new Date().toISOString().replace(/[.:]/g, "-")}-${randomUUID()}.json`;
    const destination = join(archiveDirectory, name);
    const temporary = `${destination}.tmp`;
    await writeFile(
      temporary,
      JSON.stringify({
        version: 1,
        archivedAt: new Date().toISOString(),
        cutoff: cutoff.toISOString(),
        logs: expiredLogs,
        auditEvents: expiredAuditEvents,
      }),
      { mode: 0o600 }
    );
    await rename(temporary, destination);

    const logIds = expiredLogs.map((row) => row.id);
    const auditIds = expiredAuditEvents.map((row) => row.id);
    await db.transaction(async (tx) => {
      if (logIds.length > 0) {
        await tx.delete(logs).where(inArray(logs.id, logIds));
      }
      if (auditIds.length > 0) {
        await tx.delete(auditEvents).where(inArray(auditEvents.id, auditIds));
      }
    });

    archivedAny = true;
    if (expiredLogs.length < limit && expiredAuditEvents.length < limit) break;
  }

  return archivedAny;
}

export async function pruneCertificateVersionDirectories(keepCount = 5): Promise<string[]> {
  const [certRows, activeDeployments, activeDeploymentCerts] = await Promise.all([
    db.select({ id: certificates.id, currentVersionId: certificates.currentVersionId }).from(certificates),
    db
      .select({ certificateVersionId: deployments.certificateVersionId })
      .from(deployments)
      .where(inArray(deployments.status, ["queued", "running"])),
    db
      .select({ certificateVersionId: deploymentCertificates.certificateVersionId })
      .from(deploymentCertificates)
      .innerJoin(deployments, eq(deploymentCertificates.deploymentId, deployments.id))
      .where(inArray(deployments.status, ["queued", "running"])),
  ]);

  const protectedVersionIds = [
    ...new Set([
      ...certRows.map((c) => c.currentVersionId).filter((id): id is string => Boolean(id)),
      ...activeDeployments.map((d) => d.certificateVersionId).filter((id): id is string => Boolean(id)),
      ...activeDeploymentCerts.map((dc) => dc.certificateVersionId).filter((id): id is string => Boolean(id)),
    ]),
  ];

  const protectedVersionRows =
    protectedVersionIds.length > 0
      ? await db
          .select({ certificateId: certificateVersions.certificateId, certPath: certificateVersions.certPath })
          .from(certificateVersions)
          .where(inArray(certificateVersions.id, protectedVersionIds))
      : [];

  const protectedByCert = new Map<string, Set<string>>();
  for (const row of protectedVersionRows) {
    const set = protectedByCert.get(row.certificateId) ?? new Set<string>();
    set.add(dirname(row.certPath));
    protectedByCert.set(row.certificateId, set);
  }

  const removed: string[] = [];
  for (const cert of certRows) {
    try {
      const dirs = await workerAdapters.certificateStore.pruneOldVersions(cert.id, {
        keepCount,
        protectedDirectories: protectedByCert.get(cert.id),
      });
      removed.push(...dirs);
    } catch {
      // Best-effort per certificate so one failed cleanup never aborts others.
    }
  }
  return removed;
}

