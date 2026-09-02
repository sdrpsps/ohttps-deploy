import { and, desc, eq, inArray, like } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificateTargets, certificates, servers, settings } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const policySchema = z.object({ certificateId: z.string().min(1), serverId: z.string().min(1), autoDeploy: z.coerce.boolean().default(true) });
const selectionSchema = z.object({ certificateId: z.string().min(1), serverIds: z.array(z.string().min(1)).max(1_000) }).strict();
const selectionKey = (certificateId: string) => `deployment_policy_configured_${certificateId}`;

export async function GET() {
  const [policies, configured] = await Promise.all([
    db.select({ certificateId: certificates.id, certificateName: certificates.name, domain: certificates.domain, serverId: servers.id, serverName: servers.name, host: servers.host, autoDeploy: certificateTargets.autoDeploy, updatedAt: certificateTargets.updatedAt })
      .from(certificateTargets).innerJoin(certificates, eq(certificateTargets.certificateId, certificates.id)).innerJoin(servers, eq(certificateTargets.serverId, servers.id)).where(eq(servers.enabled, true)).orderBy(desc(certificateTargets.updatedAt)),
    db.select({ key: settings.key }).from(settings).where(like(settings.key, "deployment_policy_configured_%")),
  ]);
  return NextResponse.json({ data: { policies, configuredCertificateIds: configured.map(({ key }) => key.slice("deployment_policy_configured_".length)) } });
}

export async function POST(request: Request) {
  const parsed = policySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid deployment policy" } }, { status: 400 });
  const [certificate] = await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.id, parsed.data.certificateId)).limit(1);
  const [server] = await db.select({ id: servers.id }).from(servers).where(eq(servers.id, parsed.data.serverId)).limit(1);
  if (!certificate || !server) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate or server not found" } }, { status: 404 });
  await db.insert(certificateTargets).values(parsed.data).onConflictDoUpdate({ target: [certificateTargets.certificateId, certificateTargets.serverId], set: { autoDeploy: parsed.data.autoDeploy, updatedAt: new Date() } });
  await markConfigured(parsed.data.certificateId);
  await recordAudit("deployment_policy.saved", "certificate", parsed.data.certificateId);
  return NextResponse.json({ data: parsed.data }, { status: 201 });
}

export async function PUT(request: Request) {
  const parsed = selectionSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid deployment policy selection" } }, { status: 400 });
  const serverIds = [...new Set(parsed.data.serverIds)];
  const [certificate] = await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.id, parsed.data.certificateId)).limit(1);
  if (!certificate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  const enabledServers = await db.select({ id: servers.id }).from(servers).where(eq(servers.enabled, true));
  const enabledIds = enabledServers.map(({ id }) => id);
  if (serverIds.some((id) => !enabledIds.includes(id))) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "selected server is unavailable" } }, { status: 400 });
  await db.delete(certificateTargets).where(eq(certificateTargets.certificateId, parsed.data.certificateId));
  if (serverIds.length) await db.insert(certificateTargets).values(serverIds.map((serverId) => ({ certificateId: parsed.data.certificateId, serverId, autoDeploy: true })));
  await markConfigured(parsed.data.certificateId);
  await recordAudit("deployment_policy.saved", "certificate", parsed.data.certificateId);
  return NextResponse.json({ data: { certificateId: parsed.data.certificateId, serverIds } });
}

export async function DELETE(request: Request) {
  const parsed = policySchema.pick({ certificateId: true, serverId: true }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid deployment policy" } }, { status: 400 });
  await db.delete(certificateTargets).where(and(eq(certificateTargets.certificateId, parsed.data.certificateId), eq(certificateTargets.serverId, parsed.data.serverId)));
  await markConfigured(parsed.data.certificateId);
  await recordAudit("deployment_policy.deleted", "certificate", parsed.data.certificateId);
  return new NextResponse(null, { status: 204 });
}

function markConfigured(certificateId: string) {
  return db.insert(settings).values({ key: selectionKey(certificateId), value: "1" }).onConflictDoUpdate({ target: settings.key, set: { value: "1", updatedAt: new Date() } });
}
