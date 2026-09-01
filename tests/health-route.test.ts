import assert from "node:assert/strict";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db }, { GET }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/api/health/route"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const body = await (await GET()).json();
  assert.equal(typeof body.data.worker, "boolean");
  assert.equal(body.data.status, "degraded");
  console.log("health route tests passed");
}

run();
