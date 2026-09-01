import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { certificates, certificateSyncJobs, logs }, { WorkerLease }, { enqueueSyncJob }, { reserveOhttpsCall }, { watchCancellation }, { startHeartbeat }, { nextScanAt }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/worker/lease"), import("../app/worker/sync-jobs"), import("../app/worker/daily-limit"), import("../app/worker/cancellation"), import("../app/worker/heartbeat"), import("../app/worker/schedule"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });

  const first = new WorkerLease();
  const second = new WorkerLease();
  assert.equal(await first.acquire(), true);
  assert.equal(await second.acquire(), false);
  assert.equal(await first.renew(), true);
  await first.release();
  assert.equal(await second.acquire(), true);
  await second.release();

  await db.insert(certificates).values({ id: "certificate-1", ohttpsCertificateId: "remote-1", name: "Test", domain: "example.com" });
  const queued = await Promise.all(Array.from({ length: 8 }, () => enqueueSyncJob("certificate-1", "scheduled")));
  assert.equal(queued.filter((job) => job.created).length, 1);
  assert.equal((await db.select().from(certificateSyncJobs)).length, 1);
  assert.equal((await db.select().from(logs)).length, 1);
  assert.equal(nextScanAt(0, 1_000, 60), 3_601_000);
  assert.equal(nextScanAt(3_601_000, 1_001, 60), 3_601_000);
  assert.equal(await reserveOhttpsCall(2), true);
  assert.equal(await reserveOhttpsCall(2), true);
  assert.equal(await reserveOhttpsCall(2), false);
  let cancellationChecks = 0;
  const cancellation = watchCancellation(async () => ++cancellationChecks === 2, 60_000);
  await cancellation.check();
  assert.equal(cancellation.signal.aborted, false);
  await cancellation.check();
  assert.equal(cancellation.signal.aborted, true);
  cancellation.stop();
  let heartbeats = 0;
  const stopHeartbeat = startHeartbeat(async () => { heartbeats += 1; }, 10);
  await new Promise((resolve) => setTimeout(resolve, 35));
  stopHeartbeat();
  const stoppedAt = heartbeats;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(stoppedAt >= 2);
  assert.equal(heartbeats, stoppedAt);
  console.log("worker coordination tests passed");
}

run();
