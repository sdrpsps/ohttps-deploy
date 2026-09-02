import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificates } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { isCertificateDomain } from "@/domain/deployment-path";

export const runtime = "nodejs";

const createSchema = z.object({
  ohttpsCertificateId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().min(1).max(253).refine(isCertificateDomain, "invalid certificate domain"),
  renewBeforeDays: z.coerce.number().int().min(1).max(365).optional(),
});

export async function GET() {
  const rows = await db.select({
    id: certificates.id,
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
  const id = randomUUID();
  await db.insert(certificates).values({ id, ...parsed.data });
  await recordAudit("certificate.created", "certificate", id);
  return NextResponse.json({ data: { id } }, { status: 201 });
}
