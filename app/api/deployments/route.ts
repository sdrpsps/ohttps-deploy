import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificates, certificateVersions, deployments, deploymentTargets, servers } from "@/db/schema";

export const runtime = "nodejs";

const createSchema = z.object({
  certificateId: z.string().min(1),
  certificateVersionId: z.string().min(1),
  trigger: z.enum(["manual", "scheduled", "refresh", "retry"]).default("manual"),
  failurePolicy: z.enum(["all_success", "allow_partial"]).default("all_success"),
  concurrency: z.number().int().min(1).max(32).default(4),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid deployment fields" } }, { status: 400 });
  const input = parsed.data;
  const [certificate] = await db.select({ id: certificates.id }).from(certificates).where(eq(certificates.id, input.certificateId)).limit(1);
  const [version] = await db.select({ id: certificateVersions.id }).from(certificateVersions).where(eq(certificateVersions.id, input.certificateVersionId)).limit(1);
  if (!certificate || !version) return NextResponse.json({ error: { code: "NOT_FOUND", message: "certificate or version not found" } }, { status: 404 });
  const id = randomUUID();
  await db.insert(deployments).values({ id, ...input });
  const enabledServers = await db.select({ id: servers.id }).from(servers).where(eq(servers.enabled, true));
  if (enabledServers.length) {
    await db.insert(deploymentTargets).values(enabledServers.map((server) => ({ id: randomUUID(), deploymentId: id, serverId: server.id })));
  }
  return NextResponse.json({ data: { id, status: "queued", targetCount: enabledServers.length } }, { status: 202 });
}

