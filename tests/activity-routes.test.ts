import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { auditEvents, certificates, certificateSyncJobs, logs }, { GET: getLogs }, { GET: getAuditEvents }, { GET: getSyncLogs }, { GET: getSyncJob }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/api/logs/route"), import("../app/api/audit-events/route"), import("../app/api/certificate-sync-jobs/[id]/logs/route"), import("../app/api/certificate-sync-jobs/[id]/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(logs).values({ id: "log-1", sequence: 1, level: "info", message: "deployment queued" });
  await db.insert(certificates).values({ id: "certificate-1", ohttpsCertificateId: "remote-1", name: "Test certificate", domain: "example.com" });
  await db.insert(certificateSyncJobs).values({ id: "sync-1", certificateId: "certificate-1", trigger: "manual", status: "running", phase: "fetching" });
  await db.insert(logs).values({ id: "sync-log-1", syncJobId: "sync-1", sequence: 1, level: "info", message: "fetching certificate" });
  await db.insert(auditEvents).values({ id: "audit-1", action: "certificate.created", objectType: "certificate", objectId: "certificate-1", result: "success" });
  assert.equal((await (await getLogs(new Request("http://localhost/api/logs"))).json()).data[0].message, "deployment queued");
  assert.equal((await (await getAuditEvents(new Request("http://localhost/api/audit-events?objectType=certificate"))).json()).data[0].action, "certificate.created");
  assert.equal((await (await getSyncLogs(new Request("http://localhost/api/certificate-sync-jobs/sync-1/logs"), { params: Promise.resolve({ id: "sync-1" }) })).json()).data[0].message, "fetching certificate");
  assert.equal((await (await getSyncJob(new Request("http://localhost/api/certificate-sync-jobs/sync-1"), { params: Promise.resolve({ id: "sync-1" }) })).json()).data.phase, "fetching");
  console.log("activity route tests passed");
}

run();
