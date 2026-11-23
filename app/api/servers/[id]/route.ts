import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { certificateTargets, deploymentTargets, logs, servers } from "@/db/schema";
import { validateCommand } from "@/deployer";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  host: z.string().trim().min(1).max(253).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().trim().min(1).max(120).optional(),
  hostFingerprint: z.string().trim().min(1).optional(),
  certPath: z.string().trim().min(1).optional(),
  privateKeyPath: z.string().trim().min(1).optional(),
  validationCommand: z.string().trim().min(1).optional(),
  reloadCommand: z.string().trim().min(1).optional(),
  healthCheckCommand: z.string().trim().max(1_000).transform((value) => value || null).optional(),
  timeoutSeconds: z.coerce.number().int().min(1).max(300).optional(),
  enabled: z.coerce.boolean().optional(),
}).strict();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid server fields" } }, { status: 400 });
  try { if (parsed.data.validationCommand) validateCommand(parsed.data.validationCommand); if (parsed.data.reloadCommand) validateCommand(parsed.data.reloadCommand); if (parsed.data.healthCheckCommand) validateCommand(parsed.data.healthCheckCommand); } catch (error) { return NextResponse.json({ error: { code: "INVALID_COMMAND", message: (error as Error).message } }, { status: 400 }); }
  const [server] = await db.update(servers).set({ ...parsed.data, updatedAt: new Date() }).where(eq(servers.id, id)).returning();
  if (!server) return NextResponse.json({ error: { code: "NOT_FOUND", message: "server not found" } }, { status: 404 });
  await recordAudit(request, "server.updated", "server", id);
  return NextResponse.json({ data: server });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const deleted = await db.transaction(async (tx) => {
    const [server] = await tx.select({ id: servers.id }).from(servers).where(eq(servers.id, id)).limit(1);
    if (!server) return false;

    const targets = await tx.select({ id: deploymentTargets.id }).from(deploymentTargets).where(eq(deploymentTargets.serverId, id));
    if (targets.length > 0) {
      const targetIds = targets.map((t) => t.id);
      await tx.delete(logs).where(inArray(logs.targetId, targetIds));
      await tx.delete(deploymentTargets).where(eq(deploymentTargets.serverId, id));
    }

    await tx.delete(certificateTargets).where(eq(certificateTargets.serverId, id));
    await tx.delete(servers).where(eq(servers.id, id));
    return true;
  });

  if (!deleted) return NextResponse.json({ error: { code: "NOT_FOUND", message: "server not found" } }, { status: 404 });
  await recordAudit(request, "server.deleted", "server", id);
  return new NextResponse(null, { status: 204 });
}

