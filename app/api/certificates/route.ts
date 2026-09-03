import { randomUUID } from "node:crypto";
import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificateTargets, certificates, servers, settings } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { isCertificateDomain } from "@/domain/deployment-path";

export const runtime = "nodejs";

const createSchema = z.object({
  ohttpsCertificateId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().min(1).max(253).refine(isCertificateDomain, "invalid certificate domain"),
  renewBeforeDays: z.coerce.number().int().min(1).max(365).optional(),
  serverIds: z.array(z.string().min(1)).optional(),
});

export async function GET() {
  const rows = await db.select({
    id: certificates.id,
    currentVersionId: certificates.currentVersionId,
    ohttpsCertificateId: certificates.ohttpsCertificateId,
    name: certificates.name,
    domain: certificates.domain,
    renewBeforeDays: certificates.renewBeforeDays,
    status: certificates.status,
    expiresAt: certificates.expiresAt,
    lastCheckedAt: certificates.lastCheckedAt,
    lastSyncAt: certificates.lastSyncAt,
  }).from(certificates).orderBy(desc(certificates.createdAt));
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid certificate fields" } }, { status: 400 });
  const { serverIds, ...certData } = parsed.data;

  if (serverIds && serverIds.length > 0) {
    const uniqueIds = [...new Set(serverIds)];
    const existing = await db.select({ id: servers.id }).from(servers).where(inArray(servers.id, uniqueIds));
    if (existing.length !== uniqueIds.length) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "selected server is unavailable" } }, { status: 400 });
    }
  }

  const id = randomUUID();
  await db.insert(certificates).values({ id, ...certData });
  if (serverIds !== undefined) {
    const uniqueIds = [...new Set(serverIds)];
    if (uniqueIds.length > 0) {
      await db.insert(certificateTargets).values(uniqueIds.map((serverId) => ({ certificateId: id, serverId, autoDeploy: true })));
    }
    await db.insert(settings).values({ key: `deployment_policy_configured_${id}`, value: "1" }).onConflictDoUpdate({ target: settings.key, set: { value: "1", updatedAt: new Date() } });
  }
  await recordAudit("certificate.created", "certificate", id);
  return NextResponse.json({ data: { id } }, { status: 201 });
}
