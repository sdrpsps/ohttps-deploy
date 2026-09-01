import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { certificateSyncJobs, certificates } from "@/db/schema";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const certificateId = new URL(request.url).searchParams.get("certificateId");
  const rows = await db.select({ id: certificateSyncJobs.id, certificateId: certificateSyncJobs.certificateId, certificateName: certificates.name, trigger: certificateSyncJobs.trigger, force: certificateSyncJobs.force, status: certificateSyncJobs.status, phase: certificateSyncJobs.phase, errorSummary: certificateSyncJobs.errorSummary, startedAt: certificateSyncJobs.startedAt, finishedAt: certificateSyncJobs.finishedAt, createdAt: certificateSyncJobs.createdAt }).from(certificateSyncJobs).innerJoin(certificates, eq(certificateSyncJobs.certificateId, certificates.id)).where(certificateId ? eq(certificateSyncJobs.certificateId, certificateId) : undefined).orderBy(desc(certificateSyncJobs.createdAt)).limit(100);
  return NextResponse.json({ data: rows });
}
