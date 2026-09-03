import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { loadRuntimeSettings } from "@/lib/runtime-settings";

export const runtime = "nodejs";

const schema = z.object({
  ohttpsApiId: z.string().trim().max(200).default(""),
  ohttpsApiKey: z.string().trim().max(500).default(""),
  webhookUrl: z.string().trim().url().or(z.literal("")),
  webhookSecret: z.string().trim().max(500).default(""),
  renewBeforeDays: z.coerce.number().int().min(1).max(365),
  ohttpsMinIntervalSeconds: z.coerce.number().int().min(60).max(31_536_000),
  ohttpsDailyCallLimit: z.coerce.number().int().min(1).max(100_000),
  schedulerIntervalMinutes: z.coerce.number().int().min(1).max(1_440),
  logRetentionDays: z.coerce.number().int().min(1).max(3_650),
});

const secretKeys = new Set(["ohttps_api_key", "webhook_secret"]);

function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`;
}

async function saveSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value, isSecret: secretKeys.has(key), updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, isSecret: secretKeys.has(key), updatedAt: new Date() } });
}

export async function GET() {
  const [value, ssh] = await Promise.all([
    loadRuntimeSettings(),
    db.select({ key: settings.key }).from(settings).where(eq(settings.key, "shared_ssh_private_key")).limit(1),
  ]);
  return NextResponse.json({ data: {
    renewBeforeDays: value.renewBeforeDays,
    ohttpsMinIntervalSeconds: value.ohttpsMinIntervalSeconds,
    ohttpsDailyCallLimit: value.ohttpsDailyCallLimit,
    schedulerIntervalMinutes: value.schedulerIntervalMinutes,
    logRetentionDays: value.logRetentionDays,
    webhookUrl: value.webhookUrl,
    ohttpsApiId: value.ohttpsApiId,
    ohttpsApiKeyMasked: maskSecret(value.ohttpsApiKey),
    ohttpsConfigured: Boolean(value.ohttpsApiId && value.ohttpsApiKey),
    webhookSecretConfigured: Boolean(value.webhookSecret),
    sharedSshPrivateKeyConfigured: Boolean(ssh[0]),
  } });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "invalid settings" } }, { status: 400 });
  const value = parsed.data;
  await Promise.all([
    saveSetting("webhook_url", value.webhookUrl),
    saveSetting("renew_before_days", String(value.renewBeforeDays)),
    saveSetting("ohttps_min_interval_seconds", String(value.ohttpsMinIntervalSeconds)),
    saveSetting("ohttps_daily_call_limit", String(value.ohttpsDailyCallLimit)),
    saveSetting("scheduler_interval_minutes", String(value.schedulerIntervalMinutes)),
    saveSetting("log_retention_days", String(value.logRetentionDays)),
    ...(value.ohttpsApiId ? [saveSetting("ohttps_api_id", value.ohttpsApiId)] : []),
    ...(value.ohttpsApiKey ? [saveSetting("ohttps_api_key", value.ohttpsApiKey)] : []),
    ...(value.webhookSecret ? [saveSetting("webhook_secret", value.webhookSecret)] : []),
  ]);
  await recordAudit("settings.updated", "settings");
  return GET();
}
