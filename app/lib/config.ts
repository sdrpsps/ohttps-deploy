import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().trim().min(1).default("./data/ohttps-deploy.db"),
  CERTIFICATE_STORAGE_DIR: z.string().trim().min(1).default("./data/certs"),
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
    certificateStorageDir: config.CERTIFICATE_STORAGE_DIR,
  };
}
