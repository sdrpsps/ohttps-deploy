import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { utils } from "ssh2";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

const keySchema = z.object({ privateKey: z.string().min(1).max(100_000) });
const settingKey = "shared_ssh_private_key";

function extractPublicKey(privateKeyPem: string): { publicKey: string | null; isEncrypted: boolean } {
  try {
    const parsed = utils.parseKey(privateKeyPem);
    if (parsed instanceof Error) {
      const isEncrypted = /passphrase|encrypted/i.test(parsed.message);
      return { publicKey: null, isEncrypted };
    }
    const key = Array.isArray(parsed) ? parsed[0] : parsed;
    if (key && typeof (key as any).getPublicSSH === "function") {
      const type = (key as any).type;
      const pubBuffer = (key as any).getPublicSSH();
      const comment = (key as any).comment ? ` ${(key as any).comment}` : "";
      return { publicKey: `${type} ${pubBuffer.toString("base64")}${comment}`, isEncrypted: false };
    }
  } catch {}
  return { publicKey: null, isEncrypted: false };
}

export async function GET() {
  const [row] = await db.select({ key: settings.key, value: settings.value }).from(settings).where(eq(settings.key, settingKey)).limit(1);
  const { publicKey, isEncrypted } = row?.value ? extractPublicKey(row.value) : { publicKey: null, isEncrypted: false };
  return NextResponse.json({
    data: {
      configured: Boolean(row),
      ...(publicKey ? { publicKey } : {}),
      ...(isEncrypted ? { isEncrypted: true } : {}),
    },
  });
}

export async function POST(request: Request) {
  const parsed = keySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid SSH private key" } }, { status: 400 });
  await db.insert(settings).values({ key: settingKey, value: parsed.data.privateKey, isSecret: true, updatedAt: new Date() }).onConflictDoUpdate({ target: settings.key, set: { value: parsed.data.privateKey, isSecret: true, updatedAt: new Date() } });
  await recordAudit("settings.shared_ssh_private_key_updated", "settings", settingKey);
  const { publicKey, isEncrypted } = extractPublicKey(parsed.data.privateKey);
  return NextResponse.json({
    data: {
      configured: true,
      ...(publicKey ? { publicKey } : {}),
      ...(isEncrypted ? { isEncrypted: true } : {}),
    },
  });
}
