import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { auditEvents, logs }, { archiveExpiredRecords }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/worker/archive"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const old = new Date("2026-01-01T00:00:00Z");
  const fresh = new Date("2026-08-01T00:00:00Z");
  const cutoff = new Date("2026-06-01T00:00:00Z");
  await db.insert(logs).values([{ id: "old-log", sequence: 1, message: "old", createdAt: old }, { id: "fresh-log", sequence: 2, message: "fresh", createdAt: fresh }]);
  await db.insert(auditEvents).values([{ id: "old-audit", action: "old", objectType: "test", result: "success", createdAt: old, updatedAt: old }, { id: "fresh-audit", action: "fresh", objectType: "test", result: "success", createdAt: fresh, updatedAt: fresh }]);
  const directory = await mkdtemp(join(tmpdir(), "ohttps-archive-"));
  assert.equal(await archiveExpiredRecords(cutoff, directory), true);
  const [file] = await readdir(directory);
  const archive = JSON.parse(await readFile(join(directory, file), "utf8"));
  assert.equal(archive.logs[0].id, "old-log");
  assert.equal(archive.auditEvents[0].id, "old-audit");
  assert.deepEqual((await db.select().from(logs)).map((row) => row.id), ["fresh-log"]);
  assert.deepEqual((await db.select().from(auditEvents)).map((row) => row.id), ["fresh-audit"]);
  assert.equal(await archiveExpiredRecords(cutoff, directory), false);
  console.log("archive tests passed");
}

run();
