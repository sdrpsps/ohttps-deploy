import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [
    { migrate },
    { db },
    { certificateTargets, certificates, certificateVersions, deployments, deploymentTargets, logs, servers, settings },
    { POST: postCertificate },
    { PATCH: patchCertificate, DELETE: deleteCertificate },
    { PATCH: patchServer, DELETE: deleteServer },
    { DELETE: deleteDeployment },
    { DELETE: clearDeployments },
  ] = await Promise.all([
    import("drizzle-orm/libsql/migrator"),
    import("../app/db"),
    import("../app/db/schema"),
    import("../app/api/certificates/route"),
    import("../app/api/certificates/[id]/route"),
    import("../app/api/servers/[id]/route"),
    import("../app/api/deployments/[id]/route"),
    import("../app/api/deployments/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });

  // 1. Certificate & server create / update / validation
  await db.insert(certificates).values({ id: "certificate-1", ohttpsCertificateId: "remote-1", name: "Old certificate", domain: "old.example.com" });
  await db.insert(servers).values({ id: "server-1", name: "Old server", host: "old.example.com", username: "cert", authRef: "shared-key" });

  const certificateResponse = await patchCertificate(
    new Request("http://localhost/api/certificates/certificate-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New certificate", domain: "new.example.com", ohttpsCertificateId: "remote-2", renewBeforeDays: 30, serverIds: ["server-1"] }),
    }),
    { params: Promise.resolve({ id: "certificate-1" }) }
  );
  const serverResponse = await patchServer(
    new Request("http://localhost/api/servers/server-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "New server",
        host: "new.example.com",
        port: 2222,
        username: "deploy",
        hostFingerprint: "SHA256:test",
        certPath: "/etc/nginx/new.pem",
        privateKeyPath: "/etc/nginx/new.key",
        validationCommand: "sudo -n nginx -t",
        reloadCommand: "sudo -n nginx -s reload",
        healthCheckCommand: "nginx -t",
        timeoutSeconds: 45,
      }),
    }),
    { params: Promise.resolve({ id: "server-1" }) }
  );
  assert.equal((await certificateResponse.json()).data.name, "New certificate");
  assert.equal((await db.select().from(certificateTargets)).length, 1);
  assert.equal((await db.select().from(certificateTargets))[0].serverId, "server-1");

  const createRes = await postCertificate(
    new Request("http://localhost/api/certificates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Created Cert", domain: "created.example.com", ohttpsCertificateId: "remote-created", serverIds: ["server-1"] }),
    })
  );
  assert.equal(createRes.status, 201);
  const createdId = (await createRes.json()).data.id;
  const createdTargets = await db.select().from(certificateTargets);
  assert.ok(createdTargets.some((t) => t.certificateId === createdId && t.serverId === "server-1"));

  const invalidServerRes = await postCertificate(
    new Request("http://localhost/api/certificates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Invalid Cert", domain: "invalid.example.com", ohttpsCertificateId: "remote-inv", serverIds: ["non-existent-server"] }),
    })
  );
  assert.equal(invalidServerRes.status, 400);

  const invalidPatchRes = await patchCertificate(
    new Request("http://localhost/api/certificates/certificate-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverIds: ["non-existent-server"] }),
    }),
    { params: Promise.resolve({ id: "certificate-1" }) }
  );
  assert.equal(invalidPatchRes.status, 400);

  const emptyServerRes = await postCertificate(
    new Request("http://localhost/api/certificates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Empty Server Cert", domain: "empty.example.com", ohttpsCertificateId: "remote-empty", serverIds: [] }),
    })
  );
  assert.equal(emptyServerRes.status, 201);
  const emptyCertId = (await emptyServerRes.json()).data.id;
  const [configSetting] = await db.select().from(settings).where(eq(settings.key, `deployment_policy_configured_${emptyCertId}`));
  assert.equal(configSetting?.value, "1");

  const updatedServer = (await serverResponse.json()).data;
  assert.equal(updatedServer.port, 2222);
  assert.equal(updatedServer.certPath, "/etc/nginx/new.pem");
  assert.equal(updatedServer.validationCommand, "sudo -n nginx -t");
  assert.equal(updatedServer.timeoutSeconds, 45);

  // 2. Delete without history
  assert.equal(
    (
      await deleteCertificate(new Request("http://localhost/api/certificates/certificate-1", { method: "DELETE" }), {
        params: Promise.resolve({ id: "certificate-1" }),
      })
    ).status,
    204
  );
  assert.equal(
    (
      await deleteCertificate(new Request(`http://localhost/api/certificates/${createdId}`, { method: "DELETE" }), {
        params: Promise.resolve({ id: createdId }),
      })
    ).status,
    204
  );
  assert.equal((await db.select().from(certificateTargets)).length, 0);
  assert.equal(
    (
      await deleteServer(new Request("http://localhost/api/servers/server-1", { method: "DELETE" }), {
        params: Promise.resolve({ id: "server-1" }),
      })
    ).status,
    204
  );
  assert.equal((await db.select().from(servers)).length, 0);

  // 3. Server cascade delete with deployment history (transactional)
  await db.insert(certificates).values({ id: "certificate-2", ohttpsCertificateId: "remote-2", name: "Test 2", domain: "test2.com" });
  await db.insert(certificateVersions).values({
    id: "version-2",
    certificateId: "certificate-2",
    version: 1,
    fingerprint: "fp-2",
    fetchedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    certPath: "/tmp/c",
    privateKeyPath: "/tmp/k",
  });
  await db.insert(servers).values({ id: "server-2", name: "Server 2", host: "s2.example.com", username: "cert", authRef: "shared-key" });
  await db.insert(certificateTargets).values({ certificateId: "certificate-2", serverId: "server-2" });
  await db.insert(deployments).values({ id: "dep-2", certificateId: "certificate-2", certificateVersionId: "version-2", trigger: "manual" });
  await db.insert(deploymentTargets).values({ id: "target-2", deploymentId: "dep-2", serverId: "server-2", status: "succeeded" });
  await db.insert(logs).values({ id: "log-2", deploymentId: "dep-2", targetId: "target-2", sequence: 1, message: "deployed successfully" });

  const deleteRes = await deleteServer(new Request("http://localhost/api/servers/server-2", { method: "DELETE" }), {
    params: Promise.resolve({ id: "server-2" }),
  });
  assert.equal(deleteRes.status, 204);
  assert.equal((await db.select().from(servers)).length, 0);
  assert.equal((await db.select().from(deploymentTargets)).length, 0);
  assert.equal((await db.select().from(logs)).length, 0);
  assert.equal((await db.select().from(certificateTargets)).length, 0);

  // 4. Deployment single & bulk delete routes
  await db.insert(deployments).values([
    { id: "dep-del-1", certificateId: "certificate-2", certificateVersionId: "version-2", status: "failed", trigger: "manual" },
    { id: "dep-del-2", certificateId: "certificate-2", certificateVersionId: "version-2", status: "failed", trigger: "manual" },
    { id: "dep-del-3", certificateId: "certificate-2", certificateVersionId: "version-2", status: "succeeded", trigger: "manual" },
  ]);

  const singleDel = await deleteDeployment(new Request("http://localhost/api/deployments/dep-del-1", { method: "DELETE" }), {
    params: Promise.resolve({ id: "dep-del-1" }),
  });
  assert.equal(singleDel.status, 200);
  assert.equal((await db.select().from(deployments)).filter((d) => d.id === "dep-del-1").length, 0);

  const bulkClear = await clearDeployments(new Request("http://localhost/api/deployments?status=failed", { method: "DELETE" }));
  assert.equal(bulkClear.status, 200);
  assert.equal((await bulkClear.json()).data.deletedCount, 1);
  const remaining = await db.select().from(deployments);
  assert.equal(remaining.length, 2);
  assert.ok(remaining.some((d) => d.id === "dep-del-3"));
  assert.ok(remaining.every((d) => d.status !== "failed"));

  console.log("resource CRUD and cascade delete tests passed");
}

run();
