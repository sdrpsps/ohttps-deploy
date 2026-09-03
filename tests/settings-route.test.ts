import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { settings }, { GET, POST }] = await Promise.all([import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/api/settings/route")]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const response = await POST(new Request("http://localhost/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ohttpsApiId: "api-id", ohttpsApiKey: "api-key", webhookUrl: "https://example.com/events", webhookSecret: "hook-secret", renewBeforeDays: 20, ohttpsMinIntervalSeconds: 3600, ohttpsDailyCallLimit: 10, schedulerIntervalMinutes: 15, logRetentionDays: 30 }) }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.webhookUrl, "https://example.com/events");
  assert.equal(body.data.ohttpsApiId, "api-id");
  assert.equal(body.data.ohttpsApiKey, undefined);
  assert.equal(body.data.ohttpsApiKeyMasked, "••••••••");
  assert.equal(body.data.webhookSecret, undefined);
  assert.equal(body.data.webhookSecretConfigured, true);
  assert.equal((await db.select().from(settings)).find((row: { key: string; isSecret: boolean }) => row.key === "webhook_secret")?.isSecret, true);
  assert.equal((await GET()).status, 200);
  console.log("settings route tests passed");
}

run();
