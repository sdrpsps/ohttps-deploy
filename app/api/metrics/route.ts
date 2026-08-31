import { sql } from "drizzle-orm";
import { db } from "@/db";
import { certificates, deployments, servers } from "@/db/schema";
export const runtime = "nodejs";
export async function GET() {
  const [[certs], [serverCount], [queued], [failed]] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(certificates),
    db.select({ count: sql<number>`count(*)` }).from(servers),
    db.select({ count: sql<number>`count(*)` }).from(deployments).where(sql`${deployments.status} in ('queued','running')`),
    db.select({ count: sql<number>`count(*)` }).from(deployments).where(sql`${deployments.status} in ('failed','partial')`),
  ]);
  const body = [`ohttps_certificates_total ${certs.count}`, `ohttps_servers_total ${serverCount.count}`, `ohttps_deployments_active ${queued.count}`, `ohttps_deployments_failed ${failed.count}`].join("\n") + "\n";
  return new Response(body, { headers: { "content-type": "text/plain; version=0.0.4" } });
}
