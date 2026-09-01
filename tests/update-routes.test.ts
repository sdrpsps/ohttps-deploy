import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { certificates, servers }, { PATCH: patchCertificate }, { PATCH: patchServer }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/api/certificates/[id]/route"), import("../app/api/servers/[id]/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(certificates).values({ id: "certificate-1", ohttpsCertificateId: "remote-1", name: "Old certificate", domain: "old.example.com" });
  await db.insert(servers).values({ id: "server-1", name: "Old server", host: "old.example.com", username: "cert", authRef: "shared-key" });
  const certificateResponse = await patchCertificate(new Request("http://localhost/api/certificates/certificate-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New certificate", domain: "new.example.com", ohttpsCertificateId: "remote-2", renewBeforeDays: 30 }) }), { params: Promise.resolve({ id: "certificate-1" }) });
  const serverResponse = await patchServer(new Request("http://localhost/api/servers/server-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New server", host: "new.example.com", port: 2222, username: "deploy", hostFingerprint: "SHA256:test", certPath: "/etc/nginx/new.pem", privateKeyPath: "/etc/nginx/new.key", reloadCommand: "nginx -s reload", healthCheckCommand: "nginx -t", timeoutSeconds: 45 }) }), { params: Promise.resolve({ id: "server-1" }) });
  assert.equal((await certificateResponse.json()).data.name, "New certificate");
  const updatedServer = (await serverResponse.json()).data;
  assert.equal(updatedServer.port, 2222);
  assert.equal(updatedServer.certPath, "/etc/nginx/new.pem");
  assert.equal(updatedServer.timeoutSeconds, 45);
  console.log("update route tests passed");
}

run();
