import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { servers, settings } from "@/db/schema";
import { SSHDeployer } from "@/deployer";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [server] = await db.select().from(servers).where(eq(servers.id, id)).limit(1);
  if (!server) return NextResponse.json({ error: { code: "NOT_FOUND", message: "server not found" } }, { status: 404 });
  const [sharedKey] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "shared_ssh_private_key")).limit(1);
  if (!sharedKey) return NextResponse.json({ error: { code: "SSH_KEY_UNCONFIGURED", message: "shared SSH private key is not configured" } }, { status: 409 });
  const result = await new SSHDeployer({ privateKey: sharedKey.value }).testConnection(server);
  return NextResponse.json({ data: result }, { status: result.ok ? 200 : 422 });
}
