import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactSensitive } from "../app/domain/ohttps-client";
import { InMemoryTaskLock, TaskExecutor } from "../app/worker/executor";
import * as workerSignal from "../app/lib/worker-signal";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { certificates, certificateSyncJobs, logs }, { WorkerLease }, { enqueueSyncJob }, { reserveOhttpsCall }, { watchCancellation }, { startHeartbeat }, { nextScanAt }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"),
    import("../app/db"),
    import("../app/db/schema"),
    import("../app/worker/lease"),
    import("../app/worker/sync-jobs"),
    import("../app/worker/daily-limit"),
    import("../app/worker/cancellation"),
    import("../app/worker/heartbeat"),
    import("../app/worker/schedule"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });

  // 1. WorkerLease, sync-job deduplication, schedule, quota, cancellation watch, heartbeat
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

  // 2. TaskExecutor execution, timeouts, sorted multi-key locking & partial rollback, redaction
  const lock = new InMemoryTaskLock();
  const executor = new TaskExecutor(lock);
  assert.equal(await executor.execute(async ({ taskId }) => `${taskId}:ok`, { taskId: "task-1" }), "task-1:ok");

  await assert.rejects(
    executor.execute(async ({ signal }) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (signal.aborted) throw new Error("aborted");
      return "unexpected";
    }, { taskId: "task-2", timeoutMs: 5 }),
    /cancelled or timed out/
  );

  const entered = deferred();
  const gate = deferred();
  const firstLockTask = executor.execute(
    async () => {
      entered.resolve();
      await gate.promise;
      return "done";
    },
    { taskId: "t1", lockKeys: ["server:b", "server:a"] }
  );
  await entered.promise;
  assert.equal(lock.isLocked("server:a"), true);
  assert.equal(lock.isLocked("server:b"), true);
  assert.equal(executor.isRunning("t1"), true);
  assert.equal(executor.activeCount(), 1);
  await assert.rejects(
    executor.execute(async () => "nope", { taskId: "t2", lockKeys: ["server:c", "server:a"] }),
    /task lock is held/
  );
  assert.equal(lock.isLocked("server:c"), false);
  gate.resolve();
  assert.equal(await firstLockTask, "done");
  assert.equal(lock.isLocked("server:a"), false);
  assert.equal(executor.activeCount(), 0);

  assert.equal(redactSensitive("Authorization: Bearer token, apiKey=secret"), "Authorization=[REDACTED], apiKey=[REDACTED]");

  // 3. worker-signal resolution, UDS server/client, permissions, HMAC verification, and degradation
  const temporary = mkdtempSync(join(tmpdir(), "ohttps-wsig-"));
  try {
    assert.equal(workerSignal.resolveWorkerSocketPath({ DATABASE_URL: ":memory:" }), null);
    assert.equal(workerSignal.resolveWorkerSocketPath({ DATABASE_URL: "libsql://example.turso.io" }), null);
    assert.equal(workerSignal.resolveWorkerSocketPath({ DATABASE_URL: "/data/app.db", WORKER_CONTROL_SOCKET: "none" }), null);
    const longDbPath = join("/tmp", "a".repeat(105), "test.db");
    const resolvedLongSocket = workerSignal.resolveWorkerSocketPath({ DATABASE_URL: longDbPath });
    assert.ok(resolvedLongSocket && Buffer.byteLength(resolvedLongSocket, "utf8") < 100);

    assert.equal(
      await workerSignal.sendWorkerSignal(
        { action: "wake" },
        { socketPath: join(temporary, "nonexistent.sock") }
      ),
      false
    );

    const testSockPath = join(temporary, "ctl.sock");
    const wakes: Array<string | undefined> = [];
    const cancels: string[] = [];
    const ctlServer = await workerSignal.startWorkerControlServer(
      {
        onWake: (reason) => wakes.push(reason),
        onCancel: (id) => {
          cancels.push(id);
          return true;
        },
      },
      { socketPath: testSockPath, authSecret: "test-secret-key-at-least-32-chars!" }
    );
    assert.equal(statSync(testSockPath).mode & 0o777, 0o600);
    assert.equal(
      await workerSignal.sendWorkerSignal(
        { action: "wake", reason: "unit" },
        { socketPath: testSockPath, authSecret: "test-secret-key-at-least-32-chars!" }
      ),
      true
    );
    assert.equal(
      await workerSignal.sendWorkerSignal(
        { action: "cancel", deploymentId: "dep-123" },
        { socketPath: testSockPath, authSecret: "test-secret-key-at-least-32-chars!" }
      ),
      true
    );
    assert.equal(
      await workerSignal.sendWorkerSignal(
        { action: "wake" },
        { socketPath: testSockPath, authSecret: "wrong-secret-key-at-least-32-chars" }
      ),
      false
    );
    assert.deepEqual(wakes, ["unit"]);
    assert.deepEqual(cancels, ["dep-123"]);
    await ctlServer.close();
    assert.equal(existsSync(testSockPath), false);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  console.log("worker coordination tests passed");
}

run();
