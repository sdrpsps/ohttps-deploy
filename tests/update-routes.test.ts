import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { certificateTargets, certificates, servers }, { POST: postCertificate }, { PATCH: patchCertificate }, { PATCH: patchServer }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/api/certificates/route"), import("../app/api/certificates/[id]/route"), import("../app/api/servers/[id]/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(certificates).values({ id: "certificate-1", ohttpsCertificateId: "remote-1", name: "Old certificate", domain: "old.example.com" });
  await db.insert(servers).values({ id: "server-1", name: "Old server", host: "old.example.com", username: "cert", authRef: "shared-key" });
  const certificateResponse = await patchCertificate(new Request("http://localhost/api/certificates/certificate-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New certificate", domain: "new.example.com", ohttpsCertificateId: "remote-2", renewBeforeDays: 30, serverIds: ["server-1"] }) }), { params: Promise.resolve({ id: "certificate-1" }) });
  const serverResponse = await patchServer(new Request("http://localhost/api/servers/server-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New server", host: "new.example.com", port: 2222, username: "deploy", hostFingerprint: "SHA256:test", certPath: "/etc/nginx/new.pem", privateKeyPath: "/etc/nginx/new.key", validationCommand: "sudo -n nginx -t", reloadCommand: "sudo -n nginx -s reload", healthCheckCommand: "nginx -t", timeoutSeconds: 45 }) }), { params: Promise.resolve({ id: "server-1" }) });
  assert.equal((await certificateResponse.json()).data.name, "New certificate");
  assert.equal((await db.select().from(certificateTargets)).length, 1);
  assert.equal((await db.select().from(certificateTargets))[0].serverId, "server-1");

  // Test creating a certificate with serverIds directly
  const createRes = await postCertificate(new Request("http://localhost/api/certificates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Created Cert", domain: "created.example.com", ohttpsCertificateId: "remote-created", serverIds: ["server-1"] }) }));
  assert.equal(createRes.status, 201);
  const createdId = (await createRes.json()).data.id;
  const createdTargets = await db.select().from(certificateTargets);
  assert.ok(createdTargets.some((t) => t.certificateId === createdId && t.serverId === "server-1"));

  // Test creating a certificate with unavailable server returns 400
  const invalidServerRes = await postCertificate(new Request("http://localhost/api/certificates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Invalid Cert", domain: "invalid.example.com", ohttpsCertificateId: "remote-inv", serverIds: ["non-existent-server"] }) }));
  assert.equal(invalidServerRes.status, 400);

  // Test patch with unavailable server returns 400
  const invalidPatchRes = await patchCertificate(new Request("http://localhost/api/certificates/certificate-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverIds: ["non-existent-server"] }) }), { params: Promise.resolve({ id: "certificate-1" }) });
  assert.equal(invalidPatchRes.status, 400);

  // Test creating a certificate with empty serverIds marks policy configured
  const emptyServerRes = await postCertificate(new Request("http://localhost/api/certificates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Empty Server Cert", domain: "empty.example.com", ohttpsCertificateId: "remote-empty", serverIds: [] }) }));
  assert.equal(emptyServerRes.status, 201);
  const emptyCertId = (await emptyServerRes.json()).data.id;
  const { settings } = await import("../app/db/schema");
  const { eq } = await import("drizzle-orm");
  const [configSetting] = await db.select().from(settings).where(eq(settings.key, `deployment_policy_configured_${emptyCertId}`));
  assert.equal(configSetting?.value, "1");

  const updatedServer = (await serverResponse.json()).data;
  assert.equal(updatedServer.port, 2222);
  assert.equal(updatedServer.certPath, "/etc/nginx/new.pem");
  assert.equal(updatedServer.validationCommand, "sudo -n nginx -t");
  assert.equal(updatedServer.timeoutSeconds, 45);
  console.log("update route tests passed");
}

run();
