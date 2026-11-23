import assert from "node:assert/strict";
import { NextRequest } from "next/server";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [
    { migrate },
    { db },
    schema,
    { auth },
    { POST: changePassword },
    { GET: getHealth },
    { GET: getMetrics },
    middlewareMod,
  ] = await Promise.all([
    import("drizzle-orm/libsql/migrator"),
    import("../app/db"),
    import("../app/db/schema"),
    import("../app/lib/auth"),
    import("../app/api/auth/change-password/route"),
    import("../app/api/health/route"),
    import("../app/api/metrics/route"),
    import("../middleware"),
  ]);

  await migrate(db, { migrationsFolder: "./drizzle" });

  // 1. Auth configuration & password validation
  assert.equal(auth.options.emailAndPassword?.enabled, true);
  assert.equal(auth.options.emailAndPassword?.disableSignUp, true);
  const pwResponse = await changePassword(
    new Request("http://localhost/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "old", newPassword: "short" }),
    })
  );
  assert.equal(pwResponse.status, 400);
  assert.equal((await pwResponse.json()).error.code, "INVALID_CREDENTIALS");

  // 2. Middleware authentication, CSRF, and public /api/health route
  const { middleware, rateLimitBuckets, pruneRateLimitMap } = middlewareMod;
  const unauthenticated = await middleware(new NextRequest("http://localhost/api/certificates"));
  assert.equal(unauthenticated.status, 401);
  const crossSite = await middleware(
    new NextRequest("http://localhost/api/certificates", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    })
  );
  assert.equal(crossSite.status, 403);
  process.env.BETTER_AUTH_URL = "https://certs.example.com";
  const proxiedSameSite = await middleware(
    new NextRequest("http://web:3000/api/servers/fingerprint", {
      method: "POST",
      headers: { origin: "https://certs.example.com" },
    })
  );
  assert.equal(proxiedSameSite.status, 401);
  const proxiedCrossSite = await middleware(
    new NextRequest("http://web:3000/api/servers/fingerprint", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    })
  );
  assert.equal(proxiedCrossSite.status, 403);
  const healthMiddlewareRes = await middleware(new NextRequest("http://localhost/api/health"));
  assert.equal(healthMiddlewareRes.status, 200);

  const healthBody = await (await getHealth()).json();
  assert.equal(typeof healthBody.data.worker, "boolean");
  assert.equal(healthBody.data.status, "degraded");

  // 3. Prometheus /api/metrics & METRICS_BEARER_TOKEN authentication
  await db.insert(schema.certificates).values({
    id: "cert-m1",
    ohttpsCertificateId: "remote-m1",
    name: "Metrics Cert",
    domain: "metrics.example.com",
  });
  await db.insert(schema.settings).values({
    key: "worker_heartbeat",
    value: new Date().toISOString(),
  });
  await db.insert(schema.certificateSyncJobs).values({
    id: "sync-metric-1",
    certificateId: "cert-m1",
    trigger: "manual",
    status: "queued",
  });
  await db.insert(schema.notifications).values([
    {
      id: "notif-pending",
      eventId: "ev-p",
      eventType: "deployment.succeeded",
      objectType: "deployment",
      payloadJson: "{}",
      status: "pending",
    },
    {
      id: "notif-failed",
      eventId: "ev-f",
      eventType: "deployment.failed",
      objectType: "deployment",
      payloadJson: "{}",
      status: "failed",
    },
  ]);

  const metricsText = await (await getMetrics()).text();
  assert.match(metricsText, /^ohttps_worker_up 1$/m);
  assert.match(metricsText, /^ohttps_sync_jobs_active 1$/m);
  assert.match(metricsText, /^ohttps_notifications_pending 1$/m);
  assert.match(metricsText, /^ohttps_notifications_failed 1$/m);

  process.env.METRICS_BEARER_TOKEN = "prom-secret-token";
  try {
    const authedMetrics = await middleware(
      new NextRequest("http://localhost/api/metrics", {
        headers: { authorization: "Bearer prom-secret-token" },
      })
    );
    assert.equal(authedMetrics.status, 200);

    const badMetrics = await middleware(
      new NextRequest("http://localhost/api/metrics", {
        headers: { authorization: "Bearer wrong-token" },
      })
    );
    assert.equal(badMetrics.status, 401);
  } finally {
    delete process.env.METRICS_BEARER_TOKEN;
  }

  // 4. Rate-limit bucket pruning & SSE rate-limit exemption
  rateLimitBuckets.clear();
  for (let i = 0; i < 125; i++) {
    const sseRes = await middleware(
      new NextRequest("http://localhost/api/deployments/dep-1/events", {
        headers: { "x-forwarded-for": "203.0.113.10" },
      })
    );
    assert.equal(sseRes.status, 401, "SSE requests must bypass rate limit counting");
  }

  const nowMs = Date.now();
  rateLimitBuckets.set("expired-ip", { count: 5, resetAt: nowMs - 1000 });
  for (let i = 0; i < 20; i++) {
    rateLimitBuckets.set(`active-${i}`, { count: 1, resetAt: nowMs + 60_000 });
  }
  pruneRateLimitMap(nowMs, 10);
  assert.equal(rateLimitBuckets.has("expired-ip"), false);
  assert.ok(rateLimitBuckets.size < 10);
  rateLimitBuckets.clear();

  console.log("security, health, and metrics tests passed");
}

run();
