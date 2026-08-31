import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { certificateSyncJobs, certificates } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [certificate] = await db.select().from(certificates).where(eq(certificates.id, id)).limit(1);
  if (!certificate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  const taskId = randomUUID();
  await db.insert(certificateSyncJobs).values({ id: taskId, certificateId: id, trigger: "manual", force: true });
  await recordAudit("certificate.refresh_requested", "certificate", id);
  return NextResponse.json({ data: { taskId, status: "queued", charged: true } }, { status: 202 });
}
