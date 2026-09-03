import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificateTargets, certificates, certificateVersions, deployments, deploymentTargets, servers } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const createSchema = z.object({
  certificateId: z.string().min(1),
  certificateVersionId: z.string().min(1).optional(),
  trigger: z.enum(["manual", "scheduled", "refresh", "retry"]).default("manual"),
  failurePolicy: z.enum(["all_success", "allow_partial"]).default("all_success"),
  concurrency: z.number().int().min(1).max(32).default(4),
  dryRun: z.boolean().default(false),
});

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const certificateId = search.get("certificateId"); const serverId = search.get("serverId");
  const matching = serverId ? await db.select({ id: deploymentTargets.deploymentId }).from(deploymentTargets).where(eq(deploymentTargets.serverId, serverId)) : [];
  const conditions = [certificateId ? eq(deployments.certificateId, certificateId) : undefined, serverId ? inArray(deployments.id, matching.map((row: { id: string }) => row.id)) : undefined].filter(Boolean);
  const rows = await db.select({ id: deployments.id, certificateId: deployments.certificateId, certificateVersionId: deployments.certificateVersionId, syncJobId: deployments.syncJobId, trigger: deployments.trigger, status: deployments.status, failurePolicy: deployments.failurePolicy, concurrency: deployments.concurrency, dryRun: deployments.dryRun, startedAt: deployments.startedAt, finishedAt: deployments.finishedAt, errorSummary: deployments.errorSummary, createdAt: deployments.createdAt, certificateName: certificates.name, domain: certificates.domain })
    .from(deployments).innerJoin(certificates, eq(deployments.certificateId, certificates.id)).where(conditions.length ? and(...conditions as Parameters<typeof and>) : undefined).orderBy(desc(deployments.createdAt)).limit(100);
  const deploymentIds = rows.map((r: { id: string }) => r.id);
  const targetRows = deploymentIds.length > 0
    ? await db.select({ deploymentId: deploymentTargets.deploymentId, serverId: deploymentTargets.serverId })
        .from(deploymentTargets)
        .where(inArray(deploymentTargets.deploymentId, deploymentIds))
    : [];
  const serverIdsMap = new Map<string, string[]>();
  for (const t of targetRows) {
    const list = serverIdsMap.get(t.deploymentId) ?? [];
    list.push(t.serverId);
    serverIdsMap.set(t.deploymentId, list);
  }
  const data = rows.map((row: typeof rows[number]) => ({
    ...row,
    serverIds: serverIdsMap.get(row.id) ?? [],
  }));
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid deployment fields" } }, { status: 400 });
  const { certificateVersionId: requestedVersionId, ...input } = parsed.data;
  const [certificate] = await db.select({ id: certificates.id, currentVersionId: certificates.currentVersionId }).from(certificates).where(eq(certificates.id, input.certificateId)).limit(1);
  if (!certificate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  const certificateVersionId = requestedVersionId ?? certificate.currentVersionId;
  if (!certificateVersionId) return NextResponse.json({ error: { code: "NO_CERTIFICATE_VERSION", message: "certificate has no synced version to deploy" } }, { status: 409 });
  const [version] = await db.select({ id: certificateVersions.id, certificateId: certificateVersions.certificateId }).from(certificateVersions).where(eq(certificateVersions.id, certificateVersionId)).limit(1);
  if (!version || version.certificateId !== input.certificateId) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate version not found" } }, { status: 404 });
  const enabledServers = await db.select({ id: servers.id }).from(certificateTargets).innerJoin(servers, eq(certificateTargets.serverId, servers.id)).where(and(eq(certificateTargets.certificateId, input.certificateId), eq(servers.enabled, true)));
  if (!enabledServers.length) return NextResponse.json({ error: { code: "NO_DEPLOYMENT_TARGET", message: "no enabled servers are assigned to this certificate" } }, { status: 409 });
  const id = randomUUID();
  await db.insert(deployments).values({ id, ...input, certificateVersionId });
  await db.insert(deploymentTargets).values(enabledServers.map((server: { id: string }) => ({ id: randomUUID(), deploymentId: id, serverId: server.id })));
  await recordAudit("deployment.created", "deployment", id);
  return NextResponse.json({ data: { id, status: "queued", targetCount: enabledServers.length } }, { status: 202 });
}
