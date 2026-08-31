import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { servers } from "@/db/schema";
import { validateCommand } from "@/deployer";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const serverSchema = z.object({
  name: z.string().trim().min(1).max(120), host: z.string().trim().min(1).max(253), port: z.coerce.number().int().min(1).max(65535).default(22), username: z.string().trim().min(1).max(120), hostFingerprint: z.string().trim().min(1).optional(), certPath: z.string().trim().min(1).default("/etc/nginx/ssl/fullchain.pem"), privateKeyPath: z.string().trim().min(1).default("/etc/nginx/ssl/privkey.pem"), reloadCommand: z.string().trim().min(1).default("nginx -s reload"), healthCheckCommand: z.string().trim().min(1).optional(), timeoutSeconds: z.coerce.number().int().min(1).max(300).default(30), enabled: z.coerce.boolean().default(true),
});

export async function GET() {
  const rows = await db.select({ id: servers.id, name: servers.name, host: servers.host, port: servers.port, username: servers.username, hostFingerprint: servers.hostFingerprint, certPath: servers.certPath, privateKeyPath: servers.privateKeyPath, reloadCommand: servers.reloadCommand, healthCheckCommand: servers.healthCheckCommand, timeoutSeconds: servers.timeoutSeconds, enabled: servers.enabled }).from(servers).orderBy(desc(servers.createdAt));
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const parsed = serverSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid server fields" } }, { status: 400 });
  try { validateCommand(parsed.data.reloadCommand); if (parsed.data.healthCheckCommand) validateCommand(parsed.data.healthCheckCommand); } catch (error) { return NextResponse.json({ error: { code: "INVALID_COMMAND", message: (error as Error).message } }, { status: 400 }); }
  const id = randomUUID(); await db.insert(servers).values({ id, ...parsed.data, authRef: "shared-key" }); await recordAudit("server.created", "server", id);
  return NextResponse.json({ data: { id } }, { status: 201 });
}
