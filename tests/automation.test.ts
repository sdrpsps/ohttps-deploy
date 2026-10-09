import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { eq, and } from "drizzle-orm";

async function run() {
  const temporary = await mkdtemp(join(tmpdir(), "ohttps-automation-"));
  process.env.DATABASE_URL = join(temporary, "test.db");
  process.env.CERTIFICATE_STORAGE_DIR = join(temporary, "certs");
  process.env.LOG_ARCHIVE_DIR = join(temporary, "logs");
  try {
    const signalListeners = [process.listenerCount("SIGTERM"), process.listenerCount("SIGINT")];
    const [{ migrate }, { db, client }, schema, worker, automation, { workerAdapters }, sync, deployment] = await Promise.all([
      import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/worker/runtime"), import("../app/worker/automation"), import("../app/worker/context"), import("../app/worker/certificate-sync"), import("../app/worker/deployments"),
    ]);
    // Importing the entry point must not start a loop or register process handlers.
    await import("../app/worker");
    assert.deepEqual([process.listenerCount("SIGTERM"), process.listenerCount("SIGINT")], signalListeners);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const { certificates, certificateVersions, servers, certificateTargets, settings, certificateSyncJobs, deployments, deploymentTargets, logs } = schema;
    let clock = Date.now();
    workerAdapters.now = () => clock;
    for (const [key, value] of Object.entries({ ohttps_api_id: "test-id", ohttps_api_key: "test-key", shared_ssh_private_key: "test-ssh-key", ohttps_min_interval_seconds: "86400", scheduler_interval_minutes: "60", ohttps_daily_call_limit: "100" })) {
      await db.insert(settings).values({ key, value });
    }
    const generate = async (days: number) => {
      const certPath = join(temporary, `cert-${days}.pem`), keyPath = join(temporary, `key-${days}.pem`);
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", String(days), "-subj", "/CN=example.com", "-addext", "subjectAltName=DNS:example.com"], { stdio: "ignore" });
      return { fullChainCerts: await readFile(certPath, "utf8"), certKey: await readFile(keyPath, "utf8"), expiredTime: "ignored" };
    };
    const old = await generate(30), renewed = await generate(90);
    let payload = old, upstreamFails = false, calls = 0;
    workerAdapters.ohttpsClient = () => ({ getCertificate: async () => { calls++; if (upstreamFails) throw new Error("temporary network failure"); return payload; } });
    const deployed: string[] = [];
    let failingServer = "";
    workerAdapters.deployer = () => ({ deploy: async (target) => { deployed.push(target.host); if (target.host === failingServer) throw new Error("temporary SSH failure"); return { targetId: target.id, ok: true }; } });
    await db.insert(certificates).values({ id: "cert", name: "Test", domain: "example.com", ohttpsCertificateId: "remote" });
    await db.insert(servers).values(["one", "two"].map((id) => ({ id, name: id, host: id, username: "cert", authRef: "shared", hostFingerprint: "SHA256:test" })));
    await db.insert(certificateTargets).values(["one", "two"].map((serverId) => ({ certificateId: "cert", serverId, autoDeploy: true })));

    // One-time configuration: Worker bootstraps and deploys without any HTTP request.
    await worker.pollQueue();
    assert.equal(calls, 1);
    assert.deepEqual(deployed.sort(), ["one", "two"]);
    assert.equal((await db.select().from(certificateVersions).where(eq(certificateVersions.certificateId, "cert"))).length, 1);
    await worker.pollQueue();
    assert.equal(calls, 1);
    assert.equal(deployed.length, 2);

    // Old installations' markers and hourly local scans cannot stop window checks.
    const [version] = await db.select().from(certificateVersions);
    await db.insert(settings).values({ key: `ohttps_synced_cert_${version.fingerprint.replace(/[^A-Za-z0-9]/g, "")}`, value: new Date(clock).toISOString() });
    clock += 11 * 86400_000;
    await worker.pollQueue();
    assert.equal(calls, 2); // Upstream still returns the same certificate.
    assert.equal(deployed.length, 2);
    for (let hour = 0; hour < 23; hour++) { clock += 3600_000; await worker.pollQueue(); }
    assert.equal(calls, 2);
    clock += 3600_000;
    upstreamFails = true;
    await worker.pollQueue();
    assert.equal(calls, 3);
    clock += 3600_000;
    await worker.pollQueue();
    assert.equal(calls, 3); // Failures also honor the minimum interval.
    clock += 23 * 3600_000;
    upstreamFails = false; payload = renewed; failingServer = "two";
    await worker.pollQueue();
    assert.equal(calls, 4);
    assert.equal((await db.select().from(certificateVersions).where(eq(certificateVersions.certificateId, "cert"))).length, 2);
    assert.equal(deployed.length, 4);
    assert.equal((await db.select().from(deployments).where(eq(deployments.status, "failed"))).length, 1);
    await worker.pollQueue();
    assert.equal(deployed.length, 4);
    clock += 3600_000; failingServer = "";
    await worker.pollQueue();
    assert.equal(deployed.length, 5); // Only the failed target retries, no new ohttps call.
    assert.equal(deployed.at(-1), "two");
    assert.equal(calls, 4);

    // Adding an automatic target deploys the cached version without forcing a refresh.
    await db.insert(servers).values({ id: "three", name: "three", host: "three", username: "cert", authRef: "shared" });
    await db.insert(certificateTargets).values({ certificateId: "cert", serverId: "three", autoDeploy: true });
    await worker.pollQueue();
    assert.equal(deployed.at(-1), "three");
    assert.equal(calls, 4);

    // Recovery preserves successful targets, continues log sequences and unblocks sync.
    const [lastDeployment] = await db.select().from(deployments).where(eq(deployments.status, "failed")).orderBy(deployments.createdAt);
    await db.update(deployments).set({ status: "running" }).where(eq(deployments.id, lastDeployment.id));
    const [target] = await db.select().from(deploymentTargets).where(and(eq(deploymentTargets.deploymentId, lastDeployment.id), eq(deploymentTargets.status, "failed")));
    await db.update(deploymentTargets).set({ status: "running" }).where(eq(deploymentTargets.id, target.id));
    const beforeRecovery = deployed.length;
    await automation.recoverInterruptedTasks();
    await deployment.processDeployment(lastDeployment.id);
    assert.equal(deployed.length, beforeRecovery + 1);
    const targetRows = await db.select().from(deploymentTargets).where(eq(deploymentTargets.deploymentId, lastDeployment.id));
    assert.ok(targetRows.every((t) => t.status === "succeeded"));
    const logRows = await db.select().from(logs).where(eq(logs.deploymentId, lastDeployment.id));
    assert.equal(new Set(logRows.map((l) => l.sequence)).size, logRows.length);
    await db.insert(certificateSyncJobs).values({ id: "interrupted", certificateId: "cert", trigger: "scheduled", status: "running", phase: "fetching", startedAt: new Date(clock) });
    await db.insert(logs).values({ id: "interrupted-log", syncJobId: "interrupted", sequence: 7, level: "info", message: "previous worker" });
    await automation.recoverInterruptedTasks();
    await sync.processSyncJob("interrupted");
    assert.equal((await db.select().from(certificateSyncJobs).where(eq(certificateSyncJobs.id, "interrupted")))[0].status, "succeeded");
    assert.ok((await db.select().from(logs).where(and(eq(logs.syncJobId, "interrupted"), eq(logs.sequence, 8)))).length);

    // A sync callback reconciles its own certificate; another pending sync must
    // not receive a deployment of its old version before fetching its renewal.
    const [currentForScope] = await db.select().from(certificates).where(eq(certificates.id, "cert"));
    const [sourceJob] = await db.select().from(certificateSyncJobs).where(eq(certificateSyncJobs.id, "interrupted"));
    await db.insert(certificates).values({ id: "other", name: "Other", domain: "example.com", ohttpsCertificateId: "other", status: "active" });
    await db.insert(certificateVersions).values({ id: "other-old", certificateId: "other", version: 1, fingerprint: "test-other", fetchedAt: new Date(clock), expiresAt: new Date(clock + 10 * 86400_000), certPath: "test-path", privateKeyPath: "test-key-path", validationStatus: "valid" });
    await db.update(certificates).set({ currentVersionId: "other-old" }).where(eq(certificates.id, "other"));
    await db.insert(certificateTargets).values({ certificateId: "other", serverId: "one", autoDeploy: true });
    await automation.reconcileAutoDeployments(new Date(clock), { certificateId: "cert", syncJobId: sourceJob.id });
    assert.equal((await db.select().from(deployments).where(eq(deployments.certificateId, "other"))).length, 0);
    await db.update(certificates).set({ status: "disabled" }).where(eq(certificates.id, "other"));
    assert.ok(currentForScope.currentVersionId);

    // Explicit cancellation is respected for this version; dry-run is not delivery.
    const [currentCert] = await db.select().from(certificates).where(eq(certificates.id, "cert"));
    await db.insert(servers).values(["cancelled", "dry"].map((id) => ({ id, name: id, host: id, username: "cert", authRef: "shared" })));
    await db.insert(certificateTargets).values(["cancelled", "dry"].map((serverId) => ({ certificateId: "cert", serverId, autoDeploy: true })));
    await db.insert(deployments).values([
      { id: "cancelled-deployment", certificateId: "cert", certificateVersionId: currentCert.currentVersionId, trigger: "scheduled", status: "cancelled", createdAt: new Date(clock) },
      { id: "dry-deployment", certificateId: "cert", certificateVersionId: currentCert.currentVersionId, trigger: "manual", status: "succeeded", dryRun: true, createdAt: new Date(clock) },
    ]);
    await db.insert(deploymentTargets).values([
      { id: "cancelled-target", deploymentId: "cancelled-deployment", serverId: "cancelled", status: "cancelled" },
      { id: "dry-target", deploymentId: "dry-deployment", serverId: "dry", status: "succeeded" },
    ]);
    await worker.pollQueue();
    assert.equal(deployed.at(-1), "dry");
    assert.ok(!deployed.includes("cancelled"));
    // A policy removed while queued must not push to the removed target.
    await db.insert(servers).values({ id: "removed", name: "removed", host: "removed", username: "cert", authRef: "shared" });
    await db.insert(certificateTargets).values({ certificateId: "cert", serverId: "removed", autoDeploy: true });
    await automation.reconcileAutoDeployments(new Date(clock));
    await db.delete(certificateTargets).where(eq(certificateTargets.serverId, "removed"));
    await worker.pollQueue();
    assert.ok(!deployed.includes("removed"));

    // The next renewal cycle also works, and stale upstream material cannot downgrade.
    clock += 62 * 86400_000;
    payload = old;
    const beforeSecondCycle = calls;
    await worker.pollQueue();
    assert.equal(calls, beforeSecondCycle + 1);
    assert.equal((await db.select().from(certificates).where(eq(certificates.id, "cert")))[0].currentVersionId, currentCert.currentVersionId);
    payload = await generate(180);
    clock += 86400_000;
    await worker.pollQueue();
    assert.equal(calls, beforeSecondCycle + 2);
    assert.equal((await db.select().from(certificateVersions).where(eq(certificateVersions.certificateId, "cert"))).length, 3);
    assert.ok(deployed.includes("cancelled")); // New version is eligible again.

    // Exhausted quota recovers the next day without a manual action.
    await db.update(settings).set({ value: "1" }).where(eq(settings.key, "ohttps_daily_call_limit"));
    await db.insert(certificates).values({ id: "quota", name: "Quota", domain: "example.com", ohttpsCertificateId: "quota" });
    await db.insert(settings).values({ key: `ohttps_calls_${new Date(clock).toISOString().slice(0, 10)}`, value: "1" }).onConflictDoUpdate({ target: settings.key, set: { value: "1" } });
    const beforeQuota = calls;
    clock += 3600_000;
    await worker.pollQueue();
    assert.equal(calls, beforeQuota);
    clock += 86400_000;
    await worker.pollQueue();
    assert.equal(calls, beforeQuota + 1);
    assert.ok((await db.select().from(certificates).where(eq(certificates.id, "quota")))[0].currentVersionId);

    // Disabled certificates never bootstrap or deploy.
    await db.insert(certificates).values({ id: "disabled", name: "Disabled", domain: "example.com", ohttpsCertificateId: "disabled", status: "disabled" });
    await sync.scanCertificates();
    assert.equal((await db.select().from(certificateSyncJobs).where(eq(certificateSyncJobs.certificateId, "disabled"))).length, 0);
    // Lost cache self-heals even outside the renewal window.
    await db.update(settings).set({ value: "100" }).where(eq(settings.key, "ohttps_daily_call_limit"));
    const cached = await workerAdapters.certificateStore.getCurrent("cert");
    await rm(join(dirname(cached!.directory), "current"));
    clock += 86400_000;
    await worker.pollQueue();
    assert.ok(await workerAdapters.certificateStore.getCurrent("cert"));
    // New certificates inherit the configured global default unless overridden.
    await db.insert(settings).values({ key: "renew_before_days", value: "35" });
    const { POST } = await import("../app/api/certificates/route");
    const response = await POST(new Request("http://localhost/api/certificates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Default", domain: "example.com", ohttpsCertificateId: "default" }) }));
    const created = await response.json();
    assert.equal(response.status, 201);
    assert.equal((await db.select().from(certificates).where(eq(certificates.id, created.data.id)))[0].renewBeforeDays, 35);
    client.close();
    console.log("unattended automation tests passed");
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
