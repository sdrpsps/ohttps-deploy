import "dotenv/config";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db, client } from "./index";

export async function runMigrations() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  // Keep existing SQLite volumes safe when a release introduced a migration
  // file after the volume was created or the migration was interrupted.
  const table = await client.execute("PRAGMA table_info('deployments')");
  const hasDryRun = table.rows.some((row: Record<string, unknown>) => row.name === "dry_run");
  if (!hasDryRun) await client.execute("ALTER TABLE deployments ADD COLUMN dry_run integer NOT NULL DEFAULT 0");
  console.log("Database migrations applied");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations().catch((error) => { console.error(error); process.exitCode = 1; });
}
