import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { certificates, certificateVersions, deployments, deploymentCertificates, deploymentTargets, logs, servers } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [deployment] = await db.select().from(deployments).where(eq(deployments.id, id)).limit(1);
  if (!deployment) return NextResponse.json({ error: { code: "NOT_FOUND", message: "deployment not found" } }, { status: 404 });
  const [targets, entries, certRows] = await Promise.all([
    db.select({ id: deploymentTargets.id, serverId: deploymentTargets.serverId, status: deploymentTargets.status, retryCount: deploymentTargets.retryCount, exitCode: deploymentTargets.exitCode, errorSummary: deploymentTargets.errorSummary, startedAt: deploymentTargets.startedAt, finishedAt: deploymentTargets.finishedAt, serverName: servers.name, host: servers.host }).from(deploymentTargets).innerJoin(servers, eq(deploymentTargets.serverId, servers.id)).where(eq(deploymentTargets.deploymentId, id)),
    db.select().from(logs).where(eq(logs.deploymentId, id)).orderBy(asc(logs.sequence)),
    db.select({ id: certificates.id, name: certificates.name, domain: certificates.domain, versionId: certificateVersions.id, version: certificateVersions.version })
      .from(deploymentCertificates)
      .innerJoin(certificates, eq(deploymentCertificates.certificateId, certificates.id))
      .innerJoin(certificateVersions, eq(deploymentCertificates.certificateVersionId, certificateVersions.id))
      .where(eq(deploymentCertificates.deploymentId, id)),
  ]);

  let certList = certRows;
  let singleCertName: string | null = null;
  let singleCertDomain: string | null = null;
  if (!certList.length && deployment.certificateId) {
    const [c] = await db.select({ id: certificates.id, name: certificates.name, domain: certificates.domain }).from(certificates).where(eq(certificates.id, deployment.certificateId)).limit(1);
    if (c) {
      singleCertName = c.name;
      singleCertDomain = c.domain;
      certList = [{ id: c.id, name: c.name, domain: c.domain, versionId: deployment.certificateVersionId ?? "", version: 1 }];
    }
  }

  const certificateName = singleCertName ?? (certList.length === 1 ? certList[0].name : deployment.title ?? `批量部署 (${certList.length} 张证书)`);
  const domain = singleCertDomain ?? (certList.length === 1 ? certList[0].domain : `${certList.length} 个域名`);

  return NextResponse.json({
    data: {
      ...deployment,
      certificateName,
      domain,
      certificates: certList,
      targets,
      logs: entries,
    },
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [deployment] = await db.select().from(deployments).where(eq(deployments.id, id)).limit(1);
  if (!deployment) return NextResponse.json({ error: { code: "NOT_FOUND", message: "deployment not found" } }, { status: 404 });
  if (deployment.status === "running") {
    return NextResponse.json({ error: { code: "CANNOT_DELETE_RUNNING", message: "cannot delete a running deployment" } }, { status: 409 });
  }

  await db.delete(logs).where(eq(logs.deploymentId, id));
  await db.delete(deploymentTargets).where(eq(deploymentTargets.deploymentId, id));
  await db.delete(deploymentCertificates).where(eq(deploymentCertificates.deploymentId, id));
  await db.delete(deployments).where(eq(deployments.id, id));

  return NextResponse.json({ data: { success: true } });
}
