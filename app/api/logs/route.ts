import { and, desc, eq, gte, isNull, lte, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificates, deploymentTargets, deployments, logs, servers } from "@/db/schema";

export const runtime = "nodejs";

const querySchema = z.object({
  deploymentId: z.string().optional(),
  certificateId: z.string().optional(),
  serverId: z.string().optional(),
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid log filters" } }, { status: 400 });
  const { deploymentId, certificateId, serverId, level, from, to } = parsed.data;
  const conditions = [
    isNull(logs.syncJobId),
    deploymentId ? eq(logs.deploymentId, deploymentId) : undefined,
    certificateId ? eq(deployments.certificateId, certificateId) : undefined,
    serverId ? eq(deploymentTargets.serverId, serverId) : undefined,
    level ? eq(logs.level, level) : undefined,
    from ? gte(logs.createdAt, from) : undefined,
    to ? lte(logs.createdAt, to) : undefined,
  ].filter((condition): condition is SQL => Boolean(condition));
  const rows = await db.select({ id: logs.id, deploymentId: logs.deploymentId, targetId: logs.targetId, sequence: logs.sequence, level: logs.level, message: logs.message, createdAt: logs.createdAt, certificateId: certificates.id, certificateName: certificates.name, serverId: servers.id, serverName: servers.name })
    .from(logs).leftJoin(deployments, eq(logs.deploymentId, deployments.id)).leftJoin(certificates, eq(deployments.certificateId, certificates.id)).leftJoin(deploymentTargets, eq(logs.targetId, deploymentTargets.id)).leftJoin(servers, eq(deploymentTargets.serverId, servers.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(logs.createdAt)).limit(200);
  return NextResponse.json({ data: rows });
}
