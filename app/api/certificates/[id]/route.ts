import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificateTargets, certificateVersions, certificates, deployments } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { isCertificateDomain } from "@/domain/deployment-path";

export const runtime = "nodejs";

const patchSchema = z.object({
  ohttpsCertificateId: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  domain: z.string().trim().min(1).max(253).refine(isCertificateDomain, "invalid certificate domain").optional(),
  renewBeforeDays: z.coerce.number().int().min(1).max(365).optional(),
  status: z.enum(["active", "disabled"]).optional(),
}).strict();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [row] = await db.select().from(certificates).where(eq(certificates.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  return NextResponse.json({ data: row });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid certificate fields" } }, { status: 400 });
  const [row] = await db.update(certificates).set({ ...parsed.data, updatedAt: new Date() }).where(eq(certificates.id, id)).returning();
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  await recordAudit("certificate.updated", "certificate", id);
  return NextResponse.json({ data: row });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [[certificate], [version], [deployment]] = await Promise.all([
    db.select({ id: certificates.id }).from(certificates).where(eq(certificates.id, id)).limit(1),
    db.select({ id: certificateVersions.id }).from(certificateVersions).where(eq(certificateVersions.certificateId, id)).limit(1),
    db.select({ id: deployments.id }).from(deployments).where(eq(deployments.certificateId, id)).limit(1),
  ]);
  if (!certificate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  if (version || deployment) return NextResponse.json({ error: { code: "HAS_HISTORY", message: "certificate has version or deployment history; disable it instead" } }, { status: 409 });
  await db.delete(certificateTargets).where(eq(certificateTargets.certificateId, id));
  await db.delete(certificates).where(eq(certificates.id, id));
  await recordAudit("certificate.deleted", "certificate", id);
  return new NextResponse(null, { status: 204 });
}
