import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { deployments, deploymentTargets, logs, servers } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [deployment] = await db.select().from(deployments).where(eq(deployments.id, id)).limit(1);
  if (!deployment) return NextResponse.json({ error: { code: "NOT_FOUND", message: "deployment not found" } }, { status: 404 });
  const [targets, entries] = await Promise.all([
    db.select({ id: deploymentTargets.id, serverId: deploymentTargets.serverId, status: deploymentTargets.status, retryCount: deploymentTargets.retryCount, exitCode: deploymentTargets.exitCode, errorSummary: deploymentTargets.errorSummary, startedAt: deploymentTargets.startedAt, finishedAt: deploymentTargets.finishedAt, serverName: servers.name, host: servers.host }).from(deploymentTargets).innerJoin(servers, eq(deploymentTargets.serverId, servers.id)).where(eq(deploymentTargets.deploymentId, id)),
    db.select().from(logs).where(eq(logs.deploymentId, id)).orderBy(asc(logs.sequence)),
  ]);
  return NextResponse.json({ data: { ...deployment, targets, logs: entries } });
}
