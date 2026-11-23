import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificateTargets, certificateVersions, certificates, deployments, servers, settings } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { isCertificateDomain } from "@/domain/deployment-path";

export const runtime = "nodejs";

const patchSchema = z.object({
  ohttpsCertificateId: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  domain: z.string().trim().min(1).max(253).refine(isCertificateDomain, "invalid certificate domain").optional(),
  renewBeforeDays: z.coerce.number().int().min(1).max(365).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  serverIds: z.array(z.string().min(1)).optional(),
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
  const { serverIds, ...certUpdates } = parsed.data;

  if (serverIds !== undefined && serverIds.length > 0) {
    const uniqueIds = [...new Set(serverIds)];
    const existing = await db.select({ id: servers.id }).from(servers).where(inArray(servers.id, uniqueIds));
    if (existing.length !== uniqueIds.length) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "selected server is unavailable" } }, { status: 400 });
    }
  }

  const row = await db.transaction(async (tx) => {
    const [updated] = Object.keys(certUpdates).length > 0
      ? await tx.update(certificates).set({ ...certUpdates, updatedAt: new Date() }).where(eq(certificates.id, id)).returning()
      : await tx.select().from(certificates).where(eq(certificates.id, id)).limit(1);
    if (!updated) return undefined;
    if (serverIds !== undefined) {
      const uniqueIds = [...new Set(serverIds)];
      await tx.delete(certificateTargets).where(eq(certificateTargets.certificateId, id));
      if (uniqueIds.length > 0) {
        await tx.insert(certificateTargets).values(uniqueIds.map((serverId) => ({ certificateId: id, serverId, autoDeploy: true })));
      }
      await tx.insert(settings).values({ key: `deployment_policy_configured_${id}`, value: "1" }).onConflictDoUpdate({ target: settings.key, set: { value: "1", updatedAt: new Date() } });
    }
    return updated;
  });
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  await recordAudit(request, "certificate.updated", "certificate", id);
  return NextResponse.json({ data: row });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const outcome = await db.transaction(async (tx) => {
    const [[certificate], [version], [deployment]] = await Promise.all([
      tx.select({ id: certificates.id }).from(certificates).where(eq(certificates.id, id)).limit(1),
      tx.select({ id: certificateVersions.id }).from(certificateVersions).where(eq(certificateVersions.certificateId, id)).limit(1),
      tx.select({ id: deployments.id }).from(deployments).where(eq(deployments.certificateId, id)).limit(1),
    ]);
    if (!certificate) return "not_found" as const;
    if (version || deployment) return "has_history" as const;
    await tx.delete(certificateTargets).where(eq(certificateTargets.certificateId, id));
    await tx.delete(certificates).where(eq(certificates.id, id));
    return "deleted" as const;
  });
  if (outcome === "not_found") return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  if (outcome === "has_history") return NextResponse.json({ error: { code: "HAS_HISTORY", message: "certificate has version or deployment history; disable it instead" } }, { status: 409 });
  await recordAudit(request, "certificate.deleted", "certificate", id);
  return new NextResponse(null, { status: 204 });
}
