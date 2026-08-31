import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

const keys = ["ohttps_api_id", "ohttps_api_key", "webhook_url", "webhook_secret", "renew_before_days", "ohttps_min_interval_seconds", "ohttps_daily_call_limit", "scheduler_interval_minutes", "log_retention_days"] as const;
type Key = (typeof keys)[number];

export const runtimeDefaults = {
  renewBeforeDays: 20,
  ohttpsMinIntervalSeconds: 86400,
  ohttpsDailyCallLimit: 100,
  schedulerIntervalMinutes: 60,
  logRetentionDays: 90,
};

export type RuntimeSettings = typeof runtimeDefaults & {
  ohttpsApiId: string;
  ohttpsApiKey: string;
  webhookUrl: string;
  webhookSecret: string;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

/** Loads mutable operational settings. Secrets stay in SQLite and are never returned by the settings API. */
export async function loadRuntimeSettings(): Promise<RuntimeSettings> {
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings).where(inArray(settings.key, [...keys]));
  const values = Object.fromEntries(rows.map((row: { key: string; value: string }) => [row.key, row.value])) as Partial<Record<Key, string>>;
  return {
    ohttpsApiId: values.ohttps_api_id ?? "",
    ohttpsApiKey: values.ohttps_api_key ?? "",
    webhookUrl: values.webhook_url ?? "",
    webhookSecret: values.webhook_secret ?? "",
    renewBeforeDays: positiveInteger(values.renew_before_days, runtimeDefaults.renewBeforeDays),
    ohttpsMinIntervalSeconds: positiveInteger(values.ohttps_min_interval_seconds, runtimeDefaults.ohttpsMinIntervalSeconds),
    ohttpsDailyCallLimit: positiveInteger(values.ohttps_daily_call_limit, runtimeDefaults.ohttpsDailyCallLimit),
    schedulerIntervalMinutes: positiveInteger(values.scheduler_interval_minutes, runtimeDefaults.schedulerIntervalMinutes),
    logRetentionDays: positiveInteger(values.log_retention_days, runtimeDefaults.logRetentionDays),
  };
}
