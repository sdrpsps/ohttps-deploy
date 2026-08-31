import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificateTargets, certificates, servers } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const policySchema = z.object({ certificateId: z.string().min(1), serverId: z.string().min(1), autoDeploy: z.coerce.boolean().default(true) });

export async function GET() {
  const rows = await db.select({ certificateId: certificates.id, certificateName: certificates.name, domain: certificates.domain, serverId: servers.id, serverName: servers.name, host: servers.host, autoDeploy: certificateTargets.autoDeploy, updatedAt: certificateTargets.updatedAt })
    .from(certificateTargets).innerJoin(certificates, eq(certificateTargets.certificateId, certificates.id)).innerJoin(servers, eq(certificateTargets.serverId, servers.id)).orderBy(desc(certificateTargets.updatedAt));
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const parsed = policySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid deployment policy" } }, { status: 400 });
  const [certificate] = await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.id, parsed.data.certificateId)).limit(1);
  const [server] = await db.select({ id: servers.id }).from(servers).where(eq(servers.id, parsed.data.serverId)).limit(1);
  if (!certificate || !server) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate or server not found" } }, { status: 404 });
  await db.insert(certificateTargets).values(parsed.data).onConflictDoUpdate({ target: [certificateTargets.certificateId, certificateTargets.serverId], set: { autoDeploy: parsed.data.autoDeploy, updatedAt: new Date() } });
  await recordAudit("deployment_policy.saved", "certificate", parsed.data.certificateId);
  return NextResponse.json({ data: parsed.data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const parsed = policySchema.pick({ certificateId: true, serverId: true }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid deployment policy" } }, { status: 400 });
  await db.delete(certificateTargets).where(and(eq(certificateTargets.certificateId, parsed.data.certificateId), eq(certificateTargets.serverId, parsed.data.serverId)));
  await recordAudit("deployment_policy.deleted", "certificate", parsed.data.certificateId);
  return new NextResponse(null, { status: 204 });
}
