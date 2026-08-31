import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { auditEvents, logs }, { GET: getLogs }, { GET: getAuditEvents }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/api/logs/route"), import("../app/api/audit-events/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(logs).values({ id: "log-1", sequence: 1, level: "info", message: "deployment queued" });
  await db.insert(auditEvents).values({ id: "audit-1", action: "certificate.created", objectType: "certificate", objectId: "certificate-1", result: "success" });
  assert.equal((await (await getLogs(new Request("http://localhost/api/logs"))).json()).data[0].message, "deployment queued");
  assert.equal((await (await getAuditEvents(new Request("http://localhost/api/audit-events?objectType=certificate"))).json()).data[0].action, "certificate.created");
  console.log("activity route tests passed");
}

run();
