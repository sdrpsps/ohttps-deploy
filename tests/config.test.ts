import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, redactedConfig } from "../app/lib/config";

async function run() {
  // 1. Config parsing & secret redaction
  const config = loadConfig({ DATABASE_URL: ":memory:" });
  assert.equal(config.CERTIFICATE_STORAGE_DIR, "./data/certs");
  const redacted = redactedConfig(config);
  assert.equal("OHTTPS_API_KEY" in redacted, false);
  assert.throws(() => loadConfig({ DATABASE_URL: "", RENEW_BEFORE_DAYS: "0" }), /Invalid configuration/);
  assert.throws(() => loadConfig({ DATABASE_URL: ":memory:", NODE_ENV: "production" }), /AUTH_SECRET/);

  // 2. SQLite WAL configuration & Drizzle migration query indexes
  const directory = await mkdtemp(join(tmpdir(), "ohttps-deploy-sqlite-"));
  process.env.DATABASE_URL = join(directory, "test.db");

  try {
    const [{ migrate }, { client, databaseReady, db }] = await Promise.all([
      import("drizzle-orm/libsql/migrator"),
      import("../app/db"),
    ]);
    await databaseReady;
    const journalMode = await client.execute("PRAGMA journal_mode");
    const busyTimeout = await client.execute("PRAGMA busy_timeout");
    assert.equal(journalMode.rows[0].journal_mode, "wal");
    assert.equal(busyTimeout.rows[0].timeout, 10000);

    await migrate(db, { migrationsFolder: "./drizzle" });
    const indexRows = await client.execute("SELECT name FROM sqlite_master WHERE type = 'index'");
    const indexNames = new Set(indexRows.rows.map((r) => String(r.name)));
    for (const expectedIndex of [
      "deployments_status_created_at_idx",
      "deployments_certificate_created_at_idx",
      "certificate_sync_jobs_status_created_at_idx",
      "certificate_sync_jobs_certificate_status_idx",
      "notifications_status_next_retry_at_idx",
      "notifications_object_created_at_idx",
      "logs_target_id_idx",
      "logs_deployment_created_at_idx",
      "audit_events_created_at_idx",
    ]) {
      assert.ok(indexNames.has(expectedIndex), `missing SQLite index: ${expectedIndex}`);
    }

    client.close();
    console.log("config and sqlite migration tests passed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
