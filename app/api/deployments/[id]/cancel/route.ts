import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deployments, deploymentTargets } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [row] = await db.update(deployments).set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() }).where(eq(deployments.id, id)).returning({ id: deployments.id });
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "deployment not found" } }, { status: 404 });
  await db.update(deploymentTargets).set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() }).where(inArray(deploymentTargets.deploymentId, [id]));
  await recordAudit("deployment.cancelled", "deployment", id);
  return NextResponse.json({ data: { id, status: "cancelled" } });
}
