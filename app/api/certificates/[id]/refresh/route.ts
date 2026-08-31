import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { certificateTargets, certificates, certificateVersions, deploymentTargets, deployments, servers } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [certificate] = await db.select().from(certificates).where(eq(certificates.id, id)).limit(1);
  if (!certificate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  if (!certificate.currentVersionId) {
    return NextResponse.json({ error: { code: "NO_VERSION", message: "certificate has no cached version" } }, { status: 409 });
  }
  const [version] = await db.select({ id: certificateVersions.id }).from(certificateVersions)
    .where(and(eq(certificateVersions.id, certificate.currentVersionId), eq(certificateVersions.certificateId, id))).limit(1);
  if (!version) return NextResponse.json({ error: { code: "NO_VERSION", message: "current certificate version is unavailable" } }, { status: 409 });
  const deploymentId = randomUUID();
  await db.insert(deployments).values({ id: deploymentId, certificateId: id, certificateVersionId: version.id, trigger: "refresh" });
  const enabledServers = await db.select({ id: servers.id }).from(certificateTargets).innerJoin(servers, eq(certificateTargets.serverId, servers.id)).where(and(eq(certificateTargets.certificateId, id), eq(certificateTargets.autoDeploy, true), eq(servers.enabled, true)));
  if (enabledServers.length) await db.insert(deploymentTargets).values(enabledServers.map((server) => ({ id: randomUUID(), deploymentId, serverId: server.id })));
  await recordAudit("certificate.refresh_requested", "certificate", id);
  return NextResponse.json({ data: { taskId: deploymentId, status: "queued", charged: true } }, { status: 202 });
}
