import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { certificates, certificateSyncJobs, deployments, notifications, servers, settings } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const [
    [certs],
    [serverCount],
    [queued],
    [failed],
    [syncActive],
    [notifPending],
    [notifFailed],
    [heartbeat],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(certificates),
    db.select({ count: sql<number>`count(*)` }).from(servers),
    db.select({ count: sql<number>`count(*)` }).from(deployments).where(sql`${deployments.status} in ('queued','running')`),
    db.select({ count: sql<number>`count(*)` }).from(deployments).where(sql`${deployments.status} in ('failed','partial')`),
    db.select({ count: sql<number>`count(*)` }).from(certificateSyncJobs).where(sql`${certificateSyncJobs.status} in ('queued','running')`),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(eq(notifications.status, "pending")),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(eq(notifications.status, "failed")),
    db.select({ value: settings.value }).from(settings).where(eq(settings.key, "worker_heartbeat")).limit(1),
  ]);

  const workerAt = heartbeat?.value ? new Date(heartbeat.value).getTime() : 0;
  const workerUp = workerAt > Date.now() - 2 * 60 * 1000 ? 1 : 0;

  const body =
    [
      `ohttps_certificates_total ${certs.count}`,
      `ohttps_servers_total ${serverCount.count}`,
      `ohttps_deployments_active ${queued.count}`,
      `ohttps_deployments_failed ${failed.count}`,
      `ohttps_worker_up ${workerUp}`,
      `ohttps_sync_jobs_active ${syncActive.count}`,
      `ohttps_notifications_pending ${notifPending.count}`,
      `ohttps_notifications_failed ${notifFailed.count}`,
    ].join("\n") + "\n";

  return new Response(body, { headers: { "content-type": "text/plain; version=0.0.4" } });
}
