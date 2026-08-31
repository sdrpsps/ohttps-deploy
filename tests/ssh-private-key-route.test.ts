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
  console.log("SSH private key route tests passed");
}

run();
