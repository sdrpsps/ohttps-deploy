import { z } from "zod";

const optionalSecret = z.string().trim().min(1).optional();

export const envSchema = z.object({
  DATABASE_URL: z.string().trim().min(1).default("./data/ssl-deploy.db"),
  OHTTPS_API_ID: optionalSecret,
  OHTTPS_API_KEY: optionalSecret,
  SSH_PRIVATE_KEY_PATH: z.string().trim().min(1).default("./secrets/id_ed25519"),
  WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  WEBHOOK_SECRET: optionalSecret,
  RENEW_BEFORE_DAYS: z.coerce.number().int().min(1).max(365).default(20),
  OHTTPS_MIN_INTERVAL_SECONDS: z.coerce.number().int().min(60).default(86400),
  OHTTPS_DAILY_CALL_LIMIT: z.coerce.number().int().min(1).default(100),
  SCHEDULER_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(60),
  LOG_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }
  return parsed.data;
}

/** Return metadata suitable for logs without exposing credentials or secrets. */
export function redactedConfig(config: AppConfig) {
  return {
    databaseUrl: config.DATABASE_URL,
    hasOhttpsCredentials: Boolean(config.OHTTPS_API_ID && config.OHTTPS_API_KEY),
    sshPrivateKeyPath: config.SSH_PRIVATE_KEY_PATH,
    webhookConfigured: Boolean(config.WEBHOOK_URL && config.WEBHOOK_SECRET),
    renewBeforeDays: config.RENEW_BEFORE_DAYS,
    schedulerIntervalMinutes: config.SCHEDULER_INTERVAL_MINUTES,
  };
}
