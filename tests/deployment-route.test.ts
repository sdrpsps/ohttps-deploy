import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [
    { migrate },
    { db },
    { certificateTargets, certificates, certificateVersions, deploymentTargets, servers },
    { GET, POST },
    { GET: getPolicies, PUT: putPolicies },
  ] = await Promise.all([
    import("drizzle-orm/libsql/migrator"),
    import("../app/db"),
    import("../app/db/schema"),
    import("../app/api/deployments/route"),
    import("../app/api/deployment-policies/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });

  const now = new Date();
  await db.insert(certificates).values([
    { id: "certificate-1", currentVersionId: "version-1", ohttpsCertificateId: "remote-1", name: "Test", domain: "example.com" },
    { id: "certificate-2", ohttpsCertificateId: "remote-2", name: "Empty", domain: "empty.example.com" },
    { id: "policy-cert", ohttpsCertificateId: "remote-policy", name: "Policy Cert", domain: "policy.example.com" },
  ]);
  await db.insert(certificateVersions).values({
    id: "version-1",
    certificateId: "certificate-1",
    version: 1,
    fingerprint: "fingerprint",
    fetchedAt: now,
    expiresAt: now,
    certPath: "/tmp/cert",
    privateKeyPath: "/tmp/key",
  });
  await db.insert(servers).values([
    { id: "mapped", name: "Mapped", host: "mapped.example.com", username: "cert", authRef: "shared-key" },
    { id: "unmapped", name: "Unmapped", host: "unmapped.example.com", username: "cert", authRef: "shared-key" },
    { id: "disabled", name: "Disabled", host: "disabled.example.com", username: "cert", authRef: "shared-key", enabled: false },
    { id: "policy-srv-2", name: "Policy Two", host: "two.example.com", username: "cert", authRef: "shared-key" },
  ]);
  await db.insert(certificateTargets).values([
    { certificateId: "certificate-1", serverId: "mapped" },
    { certificateId: "certificate-1", serverId: "disabled" },
    { certificateId: "policy-cert", serverId: "policy-srv-2" },
    { certificateId: "policy-cert", serverId: "disabled" },
  ]);

  // 1. Deployment creation & filtering
  const response = await POST(
    new Request("http://localhost/api/deployments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificateId: "certificate-1" }),
    })
  );
  assert.equal(response.status, 202);
  assert.equal((await response.json()).data.targetCount, 1);
  assert.deepEqual(
    (await db.select({ serverId: deploymentTargets.serverId }).from(deploymentTargets)).map((row) => row.serverId),
    ["mapped"]
  );

  const getRes = await GET(new Request("http://localhost/api/deployments"));
  const getJson = await getRes.json();
  assert.equal(getJson.data.length, 1);
  assert.deepEqual(getJson.data[0].serverIds, ["mapped"]);

  const filterMatch = await GET(new Request("http://localhost/api/deployments?serverId=mapped"));
  assert.equal((await filterMatch.json()).data.length, 1);
  const filterMismatch = await GET(new Request("http://localhost/api/deployments?serverId=unmapped"));
  assert.equal((await filterMismatch.json()).data.length, 0);

  const noVersion = await POST(
    new Request("http://localhost/api/deployments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificateId: "certificate-2" }),
    })
  );
  assert.equal(noVersion.status, 409);

  const serverDeploy = await POST(
    new Request("http://localhost/api/deployments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverId: "mapped" }),
    })
  );
  assert.equal(serverDeploy.status, 202);
  assert.equal((await serverDeploy.json()).data.certificateCount, 1);

  const allDeploy = await POST(
    new Request("http://localhost/api/deployments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
  );
  assert.equal(allDeploy.status, 202);
  assert.equal((await allDeploy.json()).data.certificateCount, 1);

  // 2. Deployment policies route (GET / PUT /api/deployment-policies)
  const initialData = (await (await getPolicies()).json()).data;
  const policyCertRows = initialData.policies.filter((p: { certificateId: string }) => p.certificateId === "policy-cert");
  assert.equal(policyCertRows.length, 1);
  assert.equal(policyCertRows[0].serverId, "policy-srv-2");

  const saved = await putPolicies(
    new Request("http://localhost/api/deployment-policies", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificateId: "policy-cert", serverIds: ["policy-srv-2"] }),
    })
  );
  assert.equal(saved.status, 200);
  assert.deepEqual(
    (
      await db
        .select({ serverId: certificateTargets.serverId })
        .from(certificateTargets)
        .where(eq(certificateTargets.certificateId, "policy-cert"))
    ).map((row) => row.serverId),
    ["policy-srv-2"]
  );

  await putPolicies(
    new Request("http://localhost/api/deployment-policies", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificateId: "policy-cert", serverIds: [] }),
    })
  );
  assert.equal(
    (
      await db
        .select()
        .from(certificateTargets)
        .where(eq(certificateTargets.certificateId, "policy-cert"))
    ).length,
    0
  );
  const data = (await (await getPolicies()).json()).data;
  assert.deepEqual(data.configuredCertificateIds, ["policy-cert"]);

  console.log("deployment and policy route tests passed");
}

run();
