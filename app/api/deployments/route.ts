import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificateTargets, certificates, certificateVersions, deployments, deploymentCertificates, deploymentTargets, logs, servers } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const createSchema = z.object({
  certificateId: z.string().min(1).optional(),
  certificateVersionId: z.string().min(1).optional(),
  certificateIds: z.array(z.string().min(1)).optional(),
  serverId: z.string().min(1).optional(),
  all: z.boolean().optional(),
  title: z.string().optional(),
  trigger: z.enum(["manual", "scheduled", "refresh", "retry"]).default("manual"),
  failurePolicy: z.enum(["all_success", "allow_partial"]).default("all_success"),
  concurrency: z.number().int().min(1).max(32).default(4),
  dryRun: z.boolean().default(false),
});

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const certificateId = search.get("certificateId");
  const serverId = search.get("serverId");
  const matching = serverId
    ? await db.select({ id: deploymentTargets.deploymentId }).from(deploymentTargets).where(eq(deploymentTargets.serverId, serverId))
    : [];
  const conditions = [
    certificateId ? eq(deployments.certificateId, certificateId) : undefined,
    serverId ? inArray(deployments.id, matching.map((row: { id: string }) => row.id)) : undefined,
  ].filter(Boolean);

  const rows = await db.select({
    id: deployments.id,
    title: deployments.title,
    certificateId: deployments.certificateId,
    certificateVersionId: deployments.certificateVersionId,
    syncJobId: deployments.syncJobId,
    trigger: deployments.trigger,
    status: deployments.status,
    failurePolicy: deployments.failurePolicy,
    concurrency: deployments.concurrency,
    dryRun: deployments.dryRun,
    startedAt: deployments.startedAt,
    finishedAt: deployments.finishedAt,
    errorSummary: deployments.errorSummary,
    createdAt: deployments.createdAt,
    singleCertName: certificates.name,
    singleCertDomain: certificates.domain,
  })
    .from(deployments)
    .leftJoin(certificates, eq(deployments.certificateId, certificates.id))
    .where(conditions.length ? and(...conditions as Parameters<typeof and>) : undefined)
    .orderBy(desc(deployments.createdAt))
    .limit(100);

  const deploymentIds = rows.map((r: { id: string }) => r.id);

  const [targetRows, certRows] = await Promise.all([
    deploymentIds.length > 0
      ? db.select({ deploymentId: deploymentTargets.deploymentId, serverId: deploymentTargets.serverId })
          .from(deploymentTargets)
          .where(inArray(deploymentTargets.deploymentId, deploymentIds))
      : Promise.resolve([]),
    deploymentIds.length > 0
      ? db.select({
          deploymentId: deploymentCertificates.deploymentId,
          certificateId: certificates.id,
          certificateName: certificates.name,
          domain: certificates.domain,
        })
          .from(deploymentCertificates)
          .innerJoin(certificates, eq(deploymentCertificates.certificateId, certificates.id))
          .where(inArray(deploymentCertificates.deploymentId, deploymentIds))
      : Promise.resolve([]),
  ]);

  const serverIdsMap = new Map<string, string[]>();
  for (const t of targetRows) {
    const list = serverIdsMap.get(t.deploymentId) ?? [];
    list.push(t.serverId);
    serverIdsMap.set(t.deploymentId, list);
  }

  const certsMap = new Map<string, Array<{ id: string; name: string; domain: string }>>();
  for (const c of certRows) {
    const list = certsMap.get(c.deploymentId) ?? [];
    list.push({ id: c.certificateId, name: c.certificateName, domain: c.domain });
    certsMap.set(c.deploymentId, list);
  }

  const data = rows.map((row: typeof rows[number]) => {
    const certList = certsMap.get(row.id) ?? (row.certificateId && row.singleCertName ? [{ id: row.certificateId, name: row.singleCertName, domain: row.singleCertDomain ?? "" }] : []);
    const certificateName = row.singleCertName ?? (certList.length === 1 ? certList[0].name : row.title ?? `批量部署 (${certList.length} 张证书)`);
    const domain = row.singleCertDomain ?? (certList.length === 1 ? certList[0].domain : `${certList.length} 个域名`);
    return {
      ...row,
      certificateName,
      domain,
      certificates: certList,
      serverIds: serverIdsMap.get(row.id) ?? [],
    };
  });

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid deployment fields" } }, { status: 400 });

  const input = parsed.data;
  type SelectedCert = { id: string; versionId: string; name: string; domain: string };
  let selectedCerts: SelectedCert[] = [];
  let targetServerIds: string[] = [];
  let defaultTitle = "";

  // 1. 按服务器部署该服务器上的全部证书
  if (input.serverId) {
    const [targetServer] = await db.select().from(servers).where(eq(servers.id, input.serverId)).limit(1);
    if (!targetServer || !targetServer.enabled) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "server not found or disabled" } }, { status: 404 });
    }
    const mappings = await db.select({
      id: certificates.id,
      name: certificates.name,
      domain: certificates.domain,
      currentVersionId: certificates.currentVersionId,
    })
      .from(certificateTargets)
      .innerJoin(certificates, eq(certificateTargets.certificateId, certificates.id))
      .where(and(eq(certificateTargets.serverId, input.serverId), eq(certificates.status, "active")));

    const validCerts = mappings.filter((c) => Boolean(c.currentVersionId));
    if (!validCerts.length) {
      return NextResponse.json({ error: { code: "NO_CERTIFICATE_VERSION", message: "no synced certificates assigned to this server" } }, { status: 409 });
    }

    selectedCerts = validCerts.map((c) => ({
      id: c.id,
      versionId: c.currentVersionId!,
      name: c.name,
      domain: c.domain,
    }));
    targetServerIds = [targetServer.id];
    defaultTitle = `${targetServer.name} 节点部署 (${selectedCerts.length} 张证书)`;
  } else if (input.all || (input.certificateIds && input.certificateIds.length > 0)) {
    // 2. 批量部署指定证书列表或全部有效证书
    const allActiveCerts = await db.select({
      id: certificates.id,
      name: certificates.name,
      domain: certificates.domain,
      currentVersionId: certificates.currentVersionId,
    })
      .from(certificates)
      .where(and(
        eq(certificates.status, "active"),
        input.certificateIds ? inArray(certificates.id, input.certificateIds) : undefined
      ));

    const validCerts = allActiveCerts.filter((c) => Boolean(c.currentVersionId));
    if (!validCerts.length) {
      return NextResponse.json({ error: { code: "NO_CERTIFICATE_VERSION", message: "no certificates with synced versions to deploy" } }, { status: 409 });
    }

    selectedCerts = validCerts.map((c) => ({
      id: c.id,
      versionId: c.currentVersionId!,
      name: c.name,
      domain: c.domain,
    }));

    const certIds = selectedCerts.map((c) => c.id);
    const assignedServers = await db.select({ id: servers.id })
      .from(certificateTargets)
      .innerJoin(servers, eq(certificateTargets.serverId, servers.id))
      .where(and(inArray(certificateTargets.certificateId, certIds), eq(servers.enabled, true)));

    targetServerIds = [...new Set(assignedServers.map((s) => s.id))];
    if (!targetServerIds.length) {
      return NextResponse.json({ error: { code: "NO_DEPLOYMENT_TARGET", message: "no enabled servers assigned to these certificates" } }, { status: 409 });
    }
    defaultTitle = `全量部署 (${selectedCerts.length} 张证书 · ${targetServerIds.length} 台服务器)`;
  } else if (input.certificateId) {
    // 3. 单证书部署模式（兼容现有交互）
    const [certificate] = await db.select({ id: certificates.id, name: certificates.name, domain: certificates.domain, currentVersionId: certificates.currentVersionId })
      .from(certificates).where(eq(certificates.id, input.certificateId)).limit(1);
    if (!certificate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
    const certificateVersionId = input.certificateVersionId ?? certificate.currentVersionId;
    if (!certificateVersionId) return NextResponse.json({ error: { code: "NO_CERTIFICATE_VERSION", message: "certificate has no synced version to deploy" } }, { status: 409 });

    const [version] = await db.select({ id: certificateVersions.id, certificateId: certificateVersions.certificateId })
      .from(certificateVersions).where(eq(certificateVersions.id, certificateVersionId)).limit(1);
    if (!version || version.certificateId !== input.certificateId) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate version not found" } }, { status: 404 });

    const enabledServers = await db.select({ id: servers.id })
      .from(certificateTargets).innerJoin(servers, eq(certificateTargets.serverId, servers.id))
      .where(and(eq(certificateTargets.certificateId, input.certificateId), eq(servers.enabled, true)));
    if (!enabledServers.length) return NextResponse.json({ error: { code: "NO_DEPLOYMENT_TARGET", message: "no enabled servers are assigned to this certificate" } }, { status: 409 });

    selectedCerts = [{ id: certificate.id, versionId: certificateVersionId, name: certificate.name, domain: certificate.domain }];
    targetServerIds = enabledServers.map((s: { id: string }) => s.id);
    defaultTitle = `${certificate.name} 证书部署`;
  } else {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "please specify certificateId, serverId, or all" } }, { status: 400 });
  }

  const id = randomUUID();
  const primaryCert = selectedCerts[0];

  await db.insert(deployments).values({
    id,
    title: input.title ?? defaultTitle,
    certificateId: primaryCert.id,
    certificateVersionId: primaryCert.versionId,
    trigger: input.trigger,
    failurePolicy: input.failurePolicy,
    concurrency: input.concurrency,
    dryRun: input.dryRun,
  });

  await db.insert(deploymentCertificates).values(
    selectedCerts.map((c) => ({
      id: randomUUID(),
      deploymentId: id,
      certificateId: c.id,
      certificateVersionId: c.versionId,
    }))
  );

  await db.insert(deploymentTargets).values(
    targetServerIds.map((sid) => ({
      id: randomUUID(),
      deploymentId: id,
      serverId: sid,
    }))
  );

  await recordAudit("deployment.created", "deployment", id);
  return NextResponse.json({
    data: {
      id,
      status: "queued",
      targetCount: targetServerIds.length,
      certificateCount: selectedCerts.length,
      title: input.title ?? defaultTitle,
    },
  }, { status: 202 });
}

export async function DELETE(request: Request) {
  const search = new URL(request.url).searchParams;
  const status = search.get("status");
  if (status !== "failed" && status !== "cancelled") {
    return NextResponse.json({ error: { code: "INVALID_STATUS", message: "can only bulk delete failed or cancelled deployments" } }, { status: 400 });
  }

  const rows = await db.select({ id: deployments.id }).from(deployments).where(eq(deployments.status, status));
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(logs).where(inArray(logs.deploymentId, ids));
    await db.delete(deploymentTargets).where(inArray(deploymentTargets.deploymentId, ids));
    await db.delete(deploymentCertificates).where(inArray(deploymentCertificates.deploymentId, ids));
    await db.delete(deployments).where(inArray(deployments.id, ids));
  }
  return NextResponse.json({ data: { deletedCount: ids.length } });
}
