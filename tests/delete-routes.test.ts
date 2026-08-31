import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { certificateTargets, certificates, servers }, { DELETE: deleteCertificate }, { DELETE: deleteServer }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/api/certificates/[id]/route"), import("../app/api/servers/[id]/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(certificates).values({ id: "certificate-1", ohttpsCertificateId: "remote-1", name: "Test certificate", domain: "example.com" });
  await db.insert(servers).values({ id: "server-1", name: "Test server", host: "example.com", username: "cert", authRef: "shared-key" });
  await db.insert(certificateTargets).values({ certificateId: "certificate-1", serverId: "server-1" });
  assert.equal((await deleteCertificate(new Request("http://localhost/api/certificates/certificate-1", { method: "DELETE" }), { params: Promise.resolve({ id: "certificate-1" }) })).status, 204);
  assert.equal((await db.select().from(certificateTargets)).length, 0);
  assert.equal((await deleteServer(new Request("http://localhost/api/servers/server-1", { method: "DELETE" }), { params: Promise.resolve({ id: "server-1" }) })).status, 204);
  assert.equal((await db.select().from(servers)).length, 0);
  console.log("delete route tests passed");
}

run();
