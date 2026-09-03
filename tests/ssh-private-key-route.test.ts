import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { settings }, { GET, POST }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"),
    import("../app/db"),
    import("../app/db/schema"),
    import("../app/api/settings/ssh-private-key/route"),
  ]);

  await migrate(db, { migrationsFolder: "./drizzle" });
  assert.equal((await POST(new Request("http://localhost/api/settings/ssh-private-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ privateKey: "test-private-key" }) }))).status, 200);
  assert.equal((await db.select().from(settings))[0]?.value, "test-private-key");
  assert.deepEqual(await (await GET()).json(), { data: { configured: true } });

  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }) as string;
  const postRes = await POST(new Request("http://localhost/api/settings/ssh-private-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ privateKey: pem }) }));
  const postJson = await postRes.json();
  assert.equal(postRes.status, 200);
  assert.ok(postJson.data.publicKey?.startsWith("ssh-rsa "));
  const getJson = await (await GET()).json();
  assert.equal(getJson.data.configured, true);
  assert.ok(getJson.data.publicKey?.startsWith("ssh-rsa "));

  // Test encrypted key detection
  const encPem = privateKey.export({ type: "pkcs1", format: "pem", cipher: "aes-256-cbc", passphrase: "testpassphrase" }) as string;
  const encRes = await POST(new Request("http://localhost/api/settings/ssh-private-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ privateKey: encPem }) }));
  const encJson = await encRes.json();
  assert.equal(encRes.status, 200);
  assert.equal(encJson.data.publicKey, undefined);
  assert.equal(encJson.data.isEncrypted, true);

  console.log("SSH private key route tests passed");
}

run();
