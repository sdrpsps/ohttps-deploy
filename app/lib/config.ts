import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().trim().min(1).default("./data/ohttps-deploy.db"),
  CERTIFICATE_STORAGE_DIR: z.string().trim().min(1).default("./data/certs"),
  LOG_ARCHIVE_DIR: z.string().trim().min(1).default("./data/logs"),
  AUTH_SECRET: z.string().trim().min(32).default("development-only-change-me-32chars"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }
  if (source.NODE_ENV === "production" && source.NEXT_PHASE !== "phase-production-build" && parsed.data.AUTH_SECRET === "development-only-change-me-32chars") throw new Error("Invalid configuration: AUTH_SECRET must be set in production");
  return parsed.data;
}

/** Return metadata suitable for logs without exposing credentials or secrets. */
export function redactedConfig(config: AppConfig) {
  return {
    databaseUrl: config.DATABASE_URL,
    certificateStorageDir: config.CERTIFICATE_STORAGE_DIR,
    logArchiveDir: config.LOG_ARCHIVE_DIR,
    authSecretConfigured: config.AUTH_SECRET !== "development-only-change-me-32chars",
  };
}
