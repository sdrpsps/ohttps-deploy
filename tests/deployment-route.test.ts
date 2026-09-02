import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { certificateTargets, certificates, certificateVersions, deploymentTargets, servers }, { POST }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/api/deployments/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const now = new Date();
  await db.insert(certificates).values([{ id: "certificate-1", currentVersionId: "version-1", ohttpsCertificateId: "remote-1", name: "Test", domain: "example.com" }, { id: "certificate-2", ohttpsCertificateId: "remote-2", name: "Empty", domain: "empty.example.com" }]);
  await db.insert(certificateVersions).values({ id: "version-1", certificateId: "certificate-1", version: 1, fingerprint: "fingerprint", fetchedAt: now, expiresAt: now, certPath: "/tmp/cert", privateKeyPath: "/tmp/key" });
  await db.insert(servers).values([
    { id: "mapped", name: "Mapped", host: "mapped.example.com", username: "cert", authRef: "shared-key" },
    { id: "unmapped", name: "Unmapped", host: "unmapped.example.com", username: "cert", authRef: "shared-key" },
    { id: "disabled", name: "Disabled", host: "disabled.example.com", username: "cert", authRef: "shared-key", enabled: false },
  ]);
  await db.insert(certificateTargets).values([{ certificateId: "certificate-1", serverId: "mapped" }, { certificateId: "certificate-1", serverId: "disabled" }]);
  const response = await POST(new Request("http://localhost/api/deployments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ certificateId: "certificate-1" }) }));
  assert.equal(response.status, 202);
  assert.equal((await response.json()).data.targetCount, 1);
  assert.deepEqual((await db.select({ serverId: deploymentTargets.serverId }).from(deploymentTargets)).map((row) => row.serverId), ["mapped"]);
  const noVersion = await POST(new Request("http://localhost/api/deployments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ certificateId: "certificate-2" }) }));
  assert.equal(noVersion.status, 409);
  console.log("deployment route tests passed");
}

run();
