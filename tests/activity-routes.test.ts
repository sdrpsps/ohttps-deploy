import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [
    { migrate },
    { db },
    { auditEvents, certificates, certificateSyncJobs, certificateVersions, deployments, logs },
    { GET: getLogs },
    { GET: getAuditEvents },
    { GET: getSyncLogs },
    { GET: getSyncJob },
    { GET: getDeploymentEvents },
    { GET: getSyncEvents },
  ] = await Promise.all([
    import("drizzle-orm/libsql/migrator"),
    import("../app/db"),
    import("../app/db/schema"),
    import("../app/api/logs/route"),
    import("../app/api/audit-events/route"),
    import("../app/api/certificate-sync-jobs/[id]/logs/route"),
    import("../app/api/certificate-sync-jobs/[id]/route"),
    import("../app/api/deployments/[id]/events/route"),
    import("../app/api/certificate-sync-jobs/[id]/events/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });

  // 1. Logs, audit events, sync job query routes
  await db.insert(logs).values({ id: "log-1", sequence: 1, level: "info", message: "deployment queued" });
  await db.insert(certificates).values({ id: "certificate-1", ohttpsCertificateId: "remote-1", name: "Test certificate", domain: "example.com" });
  await db.insert(certificateSyncJobs).values({ id: "sync-1", certificateId: "certificate-1", trigger: "manual", status: "running", phase: "fetching" });
  await db.insert(logs).values({ id: "sync-log-1", syncJobId: "sync-1", sequence: 1, level: "info", message: "fetching certificate" });
  await db.insert(auditEvents).values({ id: "audit-1", action: "certificate.created", objectType: "certificate", objectId: "certificate-1", result: "success" });

  assert.equal((await (await getLogs(new Request("http://localhost/api/logs"))).json()).data[0].message, "deployment queued");
  assert.equal((await (await getLogs(new Request("http://localhost/api/logs?level=error"))).json()).data.length, 0);
  assert.equal((await (await getLogs(new Request("http://localhost/api/logs?level=info"))).json()).data.length, 1);
  assert.equal((await (await getAuditEvents(new Request("http://localhost/api/audit-events?objectType=certificate"))).json()).data[0].action, "certificate.created");
  assert.equal((await (await getSyncLogs(new Request("http://localhost/api/certificate-sync-jobs/sync-1/logs"), { params: Promise.resolve({ id: "sync-1" }) })).json()).data[0].message, "fetching certificate");
  assert.equal((await (await getSyncJob(new Request("http://localhost/api/certificate-sync-jobs/sync-1"), { params: Promise.resolve({ id: "sync-1" }) })).json()).data.phase, "fetching");

  // 2. SSE headers, immediate : connected frame, : keepalive heartbeat, and ?after= filtering
  await db.insert(certificateVersions).values({
    id: "version-1",
    certificateId: "certificate-1",
    version: 1,
    fingerprint: "fp-1",
    fetchedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    certPath: "/tmp/c.pem",
    privateKeyPath: "/tmp/k.pem",
  });
  await db.insert(deployments).values({
    id: "sse-dep",
    certificateId: "certificate-1",
    certificateVersionId: "version-1",
    trigger: "manual",
    status: "queued",
  });
  const sseAbort = new AbortController();
  const sseRes = await getDeploymentEvents(
    new Request("http://localhost/api/deployments/sse-dep/events?keepaliveMs=60", {
      signal: sseAbort.signal,
    }),
    { params: Promise.resolve({ id: "sse-dep" }) }
  );
  assert.equal(sseRes.headers.get("x-accel-buffering"), "no");
  assert.equal(sseRes.headers.get("cache-control"), "no-cache, no-transform");
  const reader = sseRes.body!.getReader();
  const decoder = new TextDecoder();
  const firstChunk = await reader.read();
  assert.equal(decoder.decode(firstChunk.value), ": connected\n\n");

  let collected = "";
  for (let i = 0; i < 6; i++) {
    const next = await reader.read();
    if (next.done) break;
    collected += decoder.decode(next.value);
    if (collected.includes(": keepalive\n\n")) break;
  }
  assert.ok(collected.includes(": keepalive\n\n"), "Expected SSE keepalive frame while queued");
  sseAbort.abort();
  await reader.cancel().catch(() => undefined);

  await db.insert(logs).values([
    { id: "sse-l1", deploymentId: "sse-dep", sequence: 1, level: "info", message: "first" },
    { id: "sse-l2", deploymentId: "sse-dep", sequence: 2, level: "info", message: "second" },
  ]);
  await db.update(deployments).set({ status: "succeeded" }).where(eq(deployments.id, "sse-dep"));
  const afterRes = await getDeploymentEvents(
    new Request("http://localhost/api/deployments/sse-dep/events?after=1"),
    { params: Promise.resolve({ id: "sse-dep" }) }
  );
  const afterText = await afterRes.text();
  assert.ok(afterText.startsWith(": connected\n\n"));
  assert.equal(afterText.includes('"message":"first"'), false);
  assert.equal(afterText.includes('"message":"second"'), true);
  assert.ok(afterText.includes("event: end"));

  await db.insert(certificateSyncJobs).values({
    id: "sse-sync",
    certificateId: "certificate-1",
    trigger: "manual",
    status: "queued",
    phase: "queued",
  });
  const syncAbort = new AbortController();
  const syncSseRes = await getSyncEvents(
    new Request("http://localhost/api/certificate-sync-jobs/sse-sync/events?keepaliveMs=60", {
      signal: syncAbort.signal,
    }),
    { params: Promise.resolve({ id: "sse-sync" }) }
  );
  assert.equal(syncSseRes.headers.get("x-accel-buffering"), "no");
  assert.equal(syncSseRes.headers.get("cache-control"), "no-cache, no-transform");
  const syncReader = syncSseRes.body!.getReader();
  const syncFirst = await syncReader.read();
  assert.equal(decoder.decode(syncFirst.value), ": connected\n\n");
  let syncCollected = "";
  for (let i = 0; i < 6; i++) {
    const next = await syncReader.read();
    if (next.done) break;
    syncCollected += decoder.decode(next.value);
    if (syncCollected.includes(": keepalive\n\n")) break;
  }
  assert.ok(syncCollected.includes(": keepalive\n\n"));
  syncAbort.abort();
  await syncReader.cancel().catch(() => undefined);

  console.log("activity and SSE route tests passed");
}

run();
