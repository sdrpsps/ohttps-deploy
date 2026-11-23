import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function run() {
  const temporary = mkdtempSync(join(tmpdir(), "ohttps-runtime-"));
  const dbPath = join(temporary, "test.db");
  process.env.DATABASE_URL = dbPath;
  process.env.CERTIFICATE_STORAGE_DIR = join(temporary, "certs");
  process.env.LOG_ARCHIVE_DIR = join(temporary, "logs");

  try {
    const [
      { migrate },
      { db, client },
      schema,
      workerSignal,
      workerRuntime,
      { workerAdapters },
      { processDeployment },
      { POST: createDeployment },
      { POST: cancelDeployment },
    ] = await Promise.all([
      import("drizzle-orm/libsql/migrator"),
      import("../app/db"),
      import("../app/db/schema"),
      import("../app/lib/worker-signal"),
      import("../app/worker/runtime"),
      import("../app/worker/context"),
      import("../app/worker/deployments"),
      import("../app/api/deployments/route"),
      import("../app/api/deployments/[id]/cancel/route"),
    ]);

    await migrate(db, { migrationsFolder: "./drizzle" });
    const {
      certificates,
      certificateSyncJobs,
      deployments,
      deploymentCertificates,
      deploymentTargets,
      servers,
      settings,
    } = schema;

    const certPath = join(temporary, "cert.pem");
    const keyPath = join(temporary, "key.pem");
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", keyPath, "-out", certPath, "-days", "90",
        "-subj", "/CN=example.com", "-addext", "subjectAltName=DNS:example.com",
      ],
      { stdio: "ignore" }
    );
    const certPem = readFileSync(certPath, "utf8");
    const keyPem = readFileSync(keyPath, "utf8");

    const clock = Date.now();
    workerAdapters.now = () => clock;
    for (const [key, value] of Object.entries({
      ohttps_api_id: "test-id",
      ohttps_api_key: "test-key",
      shared_ssh_private_key: "test-ssh-key",
      ohttps_min_interval_seconds: "1",
      scheduler_interval_minutes: "60",
      ohttps_daily_call_limit: "100",
    })) {
      await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
    }
    workerAdapters.ohttpsClient = () => ({
      getCertificate: async () => ({
        fullChainCerts: certPem,
        certKey: keyPem,
        expiredTime: "ignored",
      }),
    });
    workerAdapters.deployer = () => ({
      deploy: async (target) => ({ targetId: target.id, ok: true, exitCode: 0 }),
    });

    await db.insert(certificates).values({
      id: "cert-1",
      name: "Primary",
      domain: "example.com",
      ohttpsCertificateId: "remote-1",
    });
    await db.insert(servers).values([
      { id: "srv-a", name: "Server A", host: "a.example.com", username: "cert", authRef: "shared", hostFingerprint: "SHA256:a" },
      { id: "srv-b", name: "Server B", host: "b.example.com", username: "cert", authRef: "shared", hostFingerprint: "SHA256:b" },
    ]);

    // 1. Persistent WorkerLease & single recoverInterruptedTasks() per lease
    await db.insert(certificateSyncJobs).values({
      id: "sync-interrupted-1",
      certificateId: "cert-1",
      trigger: "manual",
      force: true,
      status: "running",
      phase: "fetching",
    });
    await workerRuntime.pollQueue();
    assert.equal(
      (await db.select().from(certificateSyncJobs).where(eq(certificateSyncJobs.id, "sync-interrupted-1")))[0].status,
      "succeeded"
    );
    const [heldLease] = await db.select().from(settings).where(eq(settings.key, "worker_lease"));
    assert.ok(heldLease, "WorkerLease must remain persistently held after pollQueue");

    // While lease is held, a running record must NOT be reset by recoverInterruptedTasks()
    await db.insert(certificateSyncJobs).values({
      id: "sync-synthetic-running",
      certificateId: "cert-1",
      trigger: "manual",
      force: true,
      status: "running",
      phase: "fetching",
    });
    await workerRuntime.pollQueue();
    assert.equal(
      (await db.select().from(certificateSyncJobs).where(eq(certificateSyncJobs.id, "sync-synthetic-running")))[0].status,
      "running"
    );

    await workerRuntime.releaseWorkerLease();
    assert.equal((await db.select().from(settings).where(eq(settings.key, "worker_lease"))).length, 0);

    // Re-acquiring lease runs recoverInterruptedTasks() once and recovers the interrupted job
    await workerRuntime.pollQueue();
    assert.equal(
      (await db.select().from(certificateSyncJobs).where(eq(certificateSyncJobs.id, "sync-synthetic-running")))[0].status,
      "succeeded"
    );

    // 2. Concurrent deployments + per-serverId mutex + no head-of-line blocking
    const [certRow] = await db.select().from(certificates).where(eq(certificates.id, "cert-1"));
    const versionId = certRow.currentVersionId!;
    const createQueuedDeployment = async (id: string, serverId: string) => {
      await db.insert(deployments).values({
        id,
        certificateId: "cert-1",
        certificateVersionId: versionId,
        trigger: "manual",
        status: "queued",
      });
      await db.insert(deploymentCertificates).values({
        id: `dc-${id}`,
        deploymentId: id,
        certificateId: "cert-1",
        certificateVersionId: versionId,
      });
      await db.insert(deploymentTargets).values({
        id: `dt-${id}-${serverId}`,
        deploymentId: id,
        serverId,
      });
    };

    await createQueuedDeployment("dep-a1", "srv-a");
    await createQueuedDeployment("dep-a2", "srv-a");
    await createQueuedDeployment("dep-b1", "srv-b");

    const startedTargets: string[] = [];
    const activeByServer = new Map<string, number>();
    const maxConcurrentByServer = new Map<string, number>();
    const gateA1 = deferred();
    const gateB1 = deferred();
    const a1Started = deferred();
    const b1Started = deferred();

    workerAdapters.deployer = () => ({
      deploy: async (target) => {
        const current = (activeByServer.get(target.host) ?? 0) + 1;
        activeByServer.set(target.host, current);
        maxConcurrentByServer.set(
          target.host,
          Math.max(maxConcurrentByServer.get(target.host) ?? 0, current)
        );
        startedTargets.push(target.id);
        try {
          if (target.id === "dt-dep-a1-srv-a") {
            a1Started.resolve();
            await gateA1.promise;
          } else if (target.id === "dt-dep-b1-srv-b") {
            b1Started.resolve();
            await gateB1.promise;
          }
          return { targetId: target.id, ok: true, exitCode: 0 };
        } finally {
          activeByServer.set(target.host, (activeByServer.get(target.host) ?? 1) - 1);
        }
      },
    });

    const concurrentPoll = workerRuntime.pollQueue();
    await Promise.all([a1Started.promise, b1Started.promise]);
    assert.ok(startedTargets.includes("dt-dep-a1-srv-a"));
    assert.ok(startedTargets.includes("dt-dep-b1-srv-b"));
    assert.equal(startedTargets.includes("dt-dep-a2-srv-a"), false);

    gateA1.resolve();
    gateB1.resolve();
    await concurrentPoll;

    assert.equal(startedTargets.includes("dt-dep-a2-srv-a"), true);
    assert.equal(maxConcurrentByServer.get("a.example.com"), 1);
    assert.equal(maxConcurrentByServer.get("b.example.com"), 1);
    for (const id of ["dep-a1", "dep-a2", "dep-b1"]) {
      assert.equal((await db.select().from(deployments).where(eq(deployments.id, id)))[0].status, "succeeded");
    }

    await workerRuntime.releaseWorkerLease();

    // 3. Concurrent sync jobs for different certificates + direct processDeployment per-server mutex
    await db.insert(certificates).values({
      id: "cert-2",
      name: "Secondary",
      domain: "example.com",
      ohttpsCertificateId: "remote-2",
    });
    const syncGate = deferred();
    const sync1Started = deferred();
    const sync2Started = deferred();
    let activeSyncs = 0;
    let maxConcurrentSyncs = 0;
    workerAdapters.ohttpsClient = () => ({
      getCertificate: async (ohttpsId) => {
        activeSyncs += 1;
        maxConcurrentSyncs = Math.max(maxConcurrentSyncs, activeSyncs);
        try {
          if (ohttpsId === "remote-1") sync1Started.resolve();
          if (ohttpsId === "remote-2") sync2Started.resolve();
          await syncGate.promise;
          return { fullChainCerts: certPem, certKey: keyPem, expiredTime: "ignored" };
        } finally {
          activeSyncs -= 1;
        }
      },
    });
    await db.insert(certificateSyncJobs).values([
      { id: "sync-c1", certificateId: "cert-1", trigger: "manual", force: true, status: "queued" },
      { id: "sync-c2", certificateId: "cert-2", trigger: "manual", force: true, status: "queued" },
    ]);
    const syncPoll = workerRuntime.pollQueue();
    await Promise.all([sync1Started.promise, sync2Started.promise]);
    assert.equal(maxConcurrentSyncs, 2, "Different certificates must sync concurrently");
    syncGate.resolve();
    await syncPoll;
    assert.equal((await db.select().from(certificateSyncJobs).where(eq(certificateSyncJobs.id, "sync-c1")))[0].status, "succeeded");
    assert.equal((await db.select().from(certificateSyncJobs).where(eq(certificateSyncJobs.id, "sync-c2")))[0].status, "succeeded");
    await db.update(certificates).set({ status: "disabled" }).where(eq(certificates.id, "cert-2"));

    await createQueuedDeployment("dep-direct-1", "srv-a");
    await createQueuedDeployment("dep-direct-2", "srv-a");
    let directActiveOnA = 0;
    let directMaxOnA = 0;
    workerAdapters.deployer = () => ({
      deploy: async (target) => {
        directActiveOnA += 1;
        directMaxOnA = Math.max(directMaxOnA, directActiveOnA);
        await new Promise((r) => setTimeout(r, 25));
        directActiveOnA -= 1;
        return { targetId: target.id, ok: true, exitCode: 0 };
      },
    });
    await Promise.all([processDeployment("dep-direct-1"), processDeployment("dep-direct-2")]);
    assert.equal(directMaxOnA, 1);

    await workerRuntime.releaseWorkerLease();

    // 4. runWorker(): immediate wake on POST /api/deployments & immediate cancel via AbortSignal
    const wakeStarted = deferred();
    const cancelSawAbort = deferred<number>();
    let cancelRequestedAt = 0;

    workerAdapters.deployer = () => ({
      deploy: async (target, _materials, opts) => {
        if (target.host === "b.example.com") {
          wakeStarted.resolve();
          return { targetId: target.id, ok: true, exitCode: 0 };
        }
        wakeStarted.resolve();
        await new Promise<void>((resolve) => {
          if (opts?.signal?.aborted) {
            cancelSawAbort.resolve(Date.now());
            resolve();
            return;
          }
          opts?.signal?.addEventListener(
            "abort",
            () => {
              cancelSawAbort.resolve(Date.now());
              resolve();
            },
            { once: true }
          );
        });
        return { targetId: target.id, ok: false, error: "cancelled" };
      },
    });

    const workerLoopPromise = workerRuntime.runWorker();
    const expectedSocket = workerSignal.resolveWorkerSocketPath({ DATABASE_URL: dbPath })!;
    for (let i = 0; i < 40; i++) {
      if (existsSync(expectedSocket)) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(existsSync(expectedSocket), true);

    await db.insert(schema.certificateTargets).values({ certificateId: "cert-1", serverId: "srv-b", autoDeploy: true });
    const createRes = await createDeployment(
      new Request("http://localhost/api/deployments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ certificateId: "cert-1" }),
      })
    );
    assert.equal(createRes.status, 202);
    const createdDepId = (await createRes.json()).data.id as string;
    const t0 = Date.now();
    await wakeStarted.promise;
    assert.ok(Date.now() - t0 < 1500, "Worker should wake immediately rather than waiting 5s fallback poll");
    for (let i = 0; i < 40; i++) {
      const [row] = await db.select().from(deployments).where(eq(deployments.id, createdDepId));
      if (row?.status === "succeeded") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal((await db.select().from(deployments).where(eq(deployments.id, createdDepId)))[0].status, "succeeded");

    await db.delete(schema.certificateTargets).where(eq(schema.certificateTargets.serverId, "srv-b"));
    await db.insert(schema.certificateTargets).values({ certificateId: "cert-1", serverId: "srv-a", autoDeploy: true });
    const cancelTargetRes = await createDeployment(
      new Request("http://localhost/api/deployments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ certificateId: "cert-1" }),
      })
    );
    const cancelDepId = (await cancelTargetRes.json()).data.id as string;
    for (let i = 0; i < 40; i++) {
      const [row] = await db.select().from(deployments).where(eq(deployments.id, cancelDepId));
      if (row?.status === "running") break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal((await db.select().from(deployments).where(eq(deployments.id, cancelDepId)))[0].status, "running");

    cancelRequestedAt = Date.now();
    const cancelRes = await cancelDeployment(
      new Request(`http://localhost/api/deployments/${cancelDepId}/cancel`, { method: "POST" }),
      { params: Promise.resolve({ id: cancelDepId }) }
    );
    assert.equal(cancelRes.status, 200);
    const abortedAt = await cancelSawAbort.promise;
    assert.ok(abortedAt - cancelRequestedAt < 1000, "Cancellation should abort running SSH deploy immediately");

    workerRuntime.stopWorker();
    await workerLoopPromise;

    client.close();
    console.log("worker runtime tests passed");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
