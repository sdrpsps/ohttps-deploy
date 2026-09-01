import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { certificates } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { enqueueSyncJob } from "@/worker/sync-jobs";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [certificate] = await db.select().from(certificates).where(eq(certificates.id, id)).limit(1);
  if (!certificate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate not found" } }, { status: 404 });
  const task = await enqueueSyncJob(id, "manual", true);
  if (task.created) await recordAudit("certificate.refresh_requested", "certificate", id);
  return NextResponse.json({ data: { taskId: task.id, status: "queued", charged: task.created } }, { status: 202 });
}
