import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { certificateSyncJobs, certificates } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [row] = await db.select({ id: certificateSyncJobs.id, certificateId: certificateSyncJobs.certificateId, certificateName: certificates.name, status: certificateSyncJobs.status, phase: certificateSyncJobs.phase, trigger: certificateSyncJobs.trigger, errorSummary: certificateSyncJobs.errorSummary, startedAt: certificateSyncJobs.startedAt, finishedAt: certificateSyncJobs.finishedAt, createdAt: certificateSyncJobs.createdAt })
    .from(certificateSyncJobs).innerJoin(certificates, eq(certificateSyncJobs.certificateId, certificates.id)).where(eq(certificateSyncJobs.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "sync task not found" } }, { status: 404 });
  return NextResponse.json({ data: row });
}
