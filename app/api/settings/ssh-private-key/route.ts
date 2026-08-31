import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const keySchema = z.object({ privateKey: z.string().min(1).max(100_000) });
const settingKey = "shared_ssh_private_key";

export async function GET() {
  const [row] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, settingKey)).limit(1);
  return NextResponse.json({ data: { configured: Boolean(row) } });
}

export async function POST(request: Request) {
  const parsed = keySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid SSH private key" } }, { status: 400 });
  await db.insert(settings).values({ key: settingKey, value: parsed.data.privateKey, isSecret: true, updatedAt: new Date() }).onConflictDoUpdate({ target: settings.key, set: { value: parsed.data.privateKey, isSecret: true, updatedAt: new Date() } });
  await recordAudit("settings.shared_ssh_private_key_updated", "settings", settingKey);
  return NextResponse.json({ data: { configured: true } });
}
