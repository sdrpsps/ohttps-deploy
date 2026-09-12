import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function run() {
  const directory = await mkdtemp(join(tmpdir(), "ohttps-deploy-sqlite-"));
  process.env.DATABASE_URL = join(directory, "test.db");

  try {
    const { client, databaseReady } = await import("../app/db");
    await databaseReady;
    const journalMode = await client.execute("PRAGMA journal_mode");
    const busyTimeout = await client.execute("PRAGMA busy_timeout");
    assert.equal(journalMode.rows[0].journal_mode, "wal");
    assert.equal(busyTimeout.rows[0].timeout, 10000);
    client.close();
    console.log("sqlite configuration tests passed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
