import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [
    { migrate },
    { db },
    { settings },
    { GET, POST },
    { GET: getSshKey, POST: postSshKey },
    { POST: testBark },
  ] = await Promise.all([
    import("drizzle-orm/libsql/migrator"),
    import("../app/db"),
    import("../app/db/schema"),
    import("../app/api/settings/route"),
    import("../app/api/settings/ssh-private-key/route"),
    import("../app/api/settings/test-bark/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });

  // 1. General settings & secret masking (ohttpsApiKey, webhookSecret)
  const webhookSecret = "super-secret-webhook-key-1234";
  const response = await POST(
    new Request("http://localhost/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ohttpsApiId: "api-id",
        ohttpsApiKey: "api-key",
        webhookUrl: "https://api.day.app/device-key",
        webhookSecret,
        renewBeforeDays: 20,
        ohttpsMinIntervalSeconds: 3600,
        ohttpsDailyCallLimit: 10,
        schedulerIntervalMinutes: 15,
        logRetentionDays: 30,
      }),
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.webhookUrl, "https://api.day.app/device-key");
  assert.equal(body.data.ohttpsApiId, "api-id");
  assert.equal(body.data.ohttpsApiKey, undefined);
  assert.equal(body.data.ohttpsApiKeyMasked, "••••••••");
  assert.equal(body.data.webhookSecret, undefined);
  assert.equal(body.data.webhookSecretConfigured, true);
  assert.match(body.data.webhookSecretMasked, /•/);
  assert.equal(body.data.webhookSecretMasked.includes(webhookSecret), false);
  assert.equal(
    (await db.select().from(settings)).find((row: { key: string; isSecret: boolean }) => row.key === "webhook_url")?.isSecret,
    false
  );
  assert.equal(
    (await db.select().from(settings)).find((row: { key: string; isSecret: boolean }) => row.key === "webhook_secret")?.isSecret,
    true
  );
  assert.equal((await GET()).status, 200);

  // 2. Shared SSH private key management & public key / encrypted key detection
  assert.equal(
    (
      await postSshKey(
        new Request("http://localhost/api/settings/ssh-private-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ privateKey: "test-private-key" }),
        })
      )
    ).status,
    200
  );
  assert.equal(
    (await db.select().from(settings)).find((r) => r.key === "shared_ssh_private_key")?.value,
    "test-private-key"
  );
  assert.deepEqual(await (await getSshKey()).json(), { data: { configured: true } });

  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }) as string;
  const postRes = await postSshKey(
    new Request("http://localhost/api/settings/ssh-private-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ privateKey: pem }),
    })
  );
  const postJson = await postRes.json();
  assert.equal(postRes.status, 200);
  assert.ok(postJson.data.publicKey?.startsWith("ssh-rsa "));
  const getJson = await (await getSshKey()).json();
  assert.equal(getJson.data.configured, true);
  assert.ok(getJson.data.publicKey?.startsWith("ssh-rsa "));

  const encPem = privateKey.export({
    type: "pkcs1",
    format: "pem",
    cipher: "aes-256-cbc",
    passphrase: "testpassphrase",
  }) as string;
  const encRes = await postSshKey(
    new Request("http://localhost/api/settings/ssh-private-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ privateKey: encPem }),
    })
  );
  const encJson = await encRes.json();
  assert.equal(encRes.status, 200);
  assert.equal(encJson.data.publicKey, undefined);
  assert.equal(encJson.data.isEncrypted, true);

  // 3. Bark test route
  assert.equal(
    (
      await testBark(
        new Request("http://localhost/api/settings/test-bark", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      )
    ).status,
    400
  );
  const originalFetch = globalThis.fetch;
  let barkBody = "";
  globalThis.fetch = async (_url, init) => {
    barkBody = String(init?.body);
    return new Response("ok");
  };
  try {
    const barkRes = await testBark(
      new Request("http://localhost/api/settings/test-bark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ webhookUrl: "https://api.day.app/device-key" }),
      })
    );
    assert.equal(barkRes.status, 200);
    assert.deepEqual(JSON.parse(barkBody), {
      title: "ohttps-deploy · Bark 测试消息",
      body: "Bark 推送连接正常，可以接收证书和部署通知。",
      group: "ohttps-deploy",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("settings route tests passed");
}

run();
