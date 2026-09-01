import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lt } from "drizzle-orm";
import { db } from "../db";
import { auditEvents, logs } from "../db/schema";

export async function archiveExpiredRecords(cutoff: Date, archiveDirectory: string) {
  const [expiredLogs, expiredAuditEvents] = await Promise.all([
    db.select().from(logs).where(lt(logs.createdAt, cutoff)),
    db.select().from(auditEvents).where(lt(auditEvents.createdAt, cutoff)),
  ]);
  if (!expiredLogs.length && !expiredAuditEvents.length) return false;

  await mkdir(archiveDirectory, { recursive: true, mode: 0o700 });
  const name = `retention-${new Date().toISOString().replace(/[.:]/g, "-")}-${randomUUID()}.json`;
  const destination = join(archiveDirectory, name);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, archivedAt: new Date().toISOString(), cutoff: cutoff.toISOString(), logs: expiredLogs, auditEvents: expiredAuditEvents }), { mode: 0o600 });
  await rename(temporary, destination);
  await Promise.all([
    db.delete(logs).where(lt(logs.createdAt, cutoff)),
    db.delete(auditEvents).where(lt(auditEvents.createdAt, cutoff)),
  ]);
  return true;
}
