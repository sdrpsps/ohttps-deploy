import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deployments, deploymentTargets } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [source] = await db.select().from(deployments).where(eq(deployments.id, id)).limit(1);
  if (!source) return NextResponse.json({ error: { code: "NOT_FOUND", message: "deployment not found" } }, { status: 404 });
  const retryId = randomUUID();
  await db.insert(deployments).values({ id: retryId, certificateId: source.certificateId, certificateVersionId: source.certificateVersionId, trigger: "retry", failurePolicy: source.failurePolicy, concurrency: source.concurrency, dryRun: source.dryRun });
  const targets = await db.select({ serverId: deploymentTargets.serverId }).from(deploymentTargets).where(eq(deploymentTargets.deploymentId, id));
  if (targets.length) await db.insert(deploymentTargets).values(targets.map((target: { serverId: string }) => ({ id: randomUUID(), deploymentId: retryId, serverId: target.serverId })));
  await recordAudit("deployment.retried", "deployment", retryId);
  return NextResponse.json({ data: { id: retryId, status: "queued" } }, { status: 202 });
}
