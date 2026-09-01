import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { certificateTargets, certificates, servers }, { GET, PUT }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/api/deployment-policies/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(certificates).values({ id: "certificate-1", ohttpsCertificateId: "remote-1", name: "Test", domain: "example.com" });
  await db.insert(servers).values([
    { id: "server-1", name: "One", host: "one.example.com", username: "cert", authRef: "shared-key" },
    { id: "server-2", name: "Two", host: "two.example.com", username: "cert", authRef: "shared-key" },
    { id: "disabled", name: "Disabled", host: "disabled.example.com", username: "cert", authRef: "shared-key", enabled: false },
  ]);
  const saved = await PUT(new Request("http://localhost/api/deployment-policies", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ certificateId: "certificate-1", serverIds: ["server-2"] }) }));
  assert.equal(saved.status, 200);
  assert.deepEqual((await db.select({ serverId: certificateTargets.serverId }).from(certificateTargets)).map((row) => row.serverId), ["server-2"]);
  await PUT(new Request("http://localhost/api/deployment-policies", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ certificateId: "certificate-1", serverIds: [] }) }));
  assert.equal((await db.select().from(certificateTargets)).length, 0);
  const data = (await (await GET()).json()).data;
  assert.deepEqual(data.configuredCertificateIds, ["certificate-1"]);
  console.log("deployment policies route tests passed");
}

run();
