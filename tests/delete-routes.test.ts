import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { certificateTargets, certificates, servers, deployments, deploymentTargets, logs, certificateVersions }, { DELETE: deleteCertificate }, { DELETE: deleteServer }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/api/certificates/[id]/route"), import("../app/api/servers/[id]/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });

  // 1. Basic delete without deployment history
  await db.insert(certificates).values({ id: "certificate-1", ohttpsCertificateId: "remote-1", name: "Test certificate", domain: "example.com" });
  await db.insert(servers).values({ id: "server-1", name: "Test server", host: "example.com", username: "cert", authRef: "shared-key" });
  await db.insert(certificateTargets).values({ certificateId: "certificate-1", serverId: "server-1" });
  assert.equal((await deleteCertificate(new Request("http://localhost/api/certificates/certificate-1", { method: "DELETE" }), { params: Promise.resolve({ id: "certificate-1" }) })).status, 204);
  assert.equal((await db.select().from(certificateTargets)).length, 0);
  assert.equal((await deleteServer(new Request("http://localhost/api/servers/server-1", { method: "DELETE" }), { params: Promise.resolve({ id: "server-1" }) })).status, 204);
  assert.equal((await db.select().from(servers)).length, 0);

  // 2. Server with deployment history: default delete cascades and returns 204
  await db.insert(certificates).values({ id: "certificate-2", ohttpsCertificateId: "remote-2", name: "Test 2", domain: "test2.com" });
  await db.insert(certificateVersions).values({ id: "version-2", certificateId: "certificate-2", version: 1, fingerprint: "fp-2", fetchedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), certPath: "/tmp/c", privateKeyPath: "/tmp/k" });
  await db.insert(servers).values({ id: "server-2", name: "Server 2", host: "s2.example.com", username: "cert", authRef: "shared-key" });
  await db.insert(certificateTargets).values({ certificateId: "certificate-2", serverId: "server-2" });
  await db.insert(deployments).values({ id: "dep-2", certificateId: "certificate-2", certificateVersionId: "version-2", trigger: "manual" });
  await db.insert(deploymentTargets).values({ id: "target-2", deploymentId: "dep-2", serverId: "server-2", status: "succeeded" });
  await db.insert(logs).values({ id: "log-2", deploymentId: "dep-2", targetId: "target-2", sequence: 1, message: "deployed successfully" });

  const deleteRes = await deleteServer(new Request("http://localhost/api/servers/server-2", { method: "DELETE" }), { params: Promise.resolve({ id: "server-2" }) });
  assert.equal(deleteRes.status, 204);
  assert.equal((await db.select().from(servers)).length, 0);
  assert.equal((await db.select().from(deploymentTargets)).length, 0);
  assert.equal((await db.select().from(logs)).length, 0);
  assert.equal((await db.select().from(certificateTargets)).length, 0);

  // 3. Deployment delete routes
  const [{ DELETE: deleteDeployment }, { DELETE: clearDeployments }] = await Promise.all([
    import("../app/api/deployments/[id]/route"),
    import("../app/api/deployments/route"),
  ]);

  await db.insert(deployments).values([
    { id: "dep-del-1", certificateId: "certificate-2", certificateVersionId: "version-2", status: "failed", trigger: "manual" },
    { id: "dep-del-2", certificateId: "certificate-2", certificateVersionId: "version-2", status: "failed", trigger: "manual" },
    { id: "dep-del-3", certificateId: "certificate-2", certificateVersionId: "version-2", status: "succeeded", trigger: "manual" },
  ]);

  const singleDel = await deleteDeployment(new Request("http://localhost/api/deployments/dep-del-1", { method: "DELETE" }), { params: Promise.resolve({ id: "dep-del-1" }) });
  assert.equal(singleDel.status, 200);
  assert.equal((await db.select().from(deployments)).filter((d) => d.id === "dep-del-1").length, 0);

  const bulkClear = await clearDeployments(new Request("http://localhost/api/deployments?status=failed", { method: "DELETE" }));
  assert.equal(bulkClear.status, 200);
  assert.equal((await bulkClear.json()).data.deletedCount, 1);
  const remaining = await db.select().from(deployments);
  assert.equal(remaining.length, 2);
  assert.ok(remaining.some((d) => d.id === "dep-del-3"));
  assert.ok(remaining.every((d) => d.status !== "failed"));

  console.log("delete route tests passed");
}

run();
