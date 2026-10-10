import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { toBarkPayload } from "../app/domain/webhook";

async function run() {
  process.env.DATABASE_URL = ":memory:";
  const [{ migrate }, { db, client }, schema, notificationWorker, { workerAdapters, workerContext }, { scanCertificates }] = await Promise.all([
    import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/worker/notifications"), import("../app/worker/context"), import("../app/worker/certificate-sync"),
  ]);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const { certificates, notifications, deployments, deploymentCertificates, deploymentTargets, certificateVersions, servers } = schema;
  const { queueNotification, notifySyncRecovery, deliverPendingNotifications } = notificationWorker;
  let clock = Date.parse("2026-10-10T00:00:00Z");
  const day = 86_400_000;
  workerAdapters.now = () => clock;
  workerContext.runtimeSettings.webhookUrl = "https://bark.example.test/test-device";
  await db.insert(certificates).values({ id: "cert-id", name: "主站 TLS", domain: "example.com", ohttpsCertificateId: "remote-id", expiresAt: new Date(clock + 90 * day) });
  let remainingDays: number | null = 90;
  workerAdapters.certificateStore.getCurrent = async () => remainingDays === null ? undefined : ({ notAfter: new Date(clock + remainingDays * day) }) as never;
  const rows = async (eventType: string) => db.select().from(notifications).where(eq(notifications.eventType, eventType));

  // Healthy local material is not proof of successful upstream synchronization.
  await queueNotification("certificate.sync_failed", "certificate", "cert-id", "failure", "network failure");
  await scanCertificates();
  assert.equal((await rows("certificate.recovered")).length, 0);
  // Resolve only after actual successful sync, once across scans/days.
  await notifySyncRecovery("cert-id");
  await notifySyncRecovery("cert-id");
  clock += day;
  await notifySyncRecovery("cert-id");
  assert.equal((await rows("certificate.sync_recovered")).length, 1);
  // A second incident on the same day must still notify.
  await queueNotification("certificate.sync_failed", "certificate", "cert-id", "failure", "network failure");
  await notifySyncRecovery("cert-id");
  assert.equal((await rows("certificate.sync_failed")).length, 2);
  assert.equal((await rows("certificate.sync_recovered")).length, 2);

  remainingDays = 10;
  await scanCertificates();
  await scanCertificates();
  assert.equal((await rows("certificate.expiring")).length, 1);
  clock += day;
  await scanCertificates();
  assert.equal((await rows("certificate.expiring")).length, 2); // Unresolved warnings retain daily reminders.
  remainingDays = 90;
  await scanCertificates();
  await scanCertificates();
  clock += day;
  await scanCertificates();
  assert.equal((await rows("certificate.recovered")).length, 1);
  // Another alert/recovery in the same millisecond remains a distinct incident.
  remainingDays = 10;
  await scanCertificates();
  remainingDays = 90;
  await scanCertificates();
  assert.equal((await rows("certificate.recovered")).length, 2);
  remainingDays = -1;
  await scanCertificates();
  assert.equal((await rows("certificate.expired")).length, 1);
  remainingDays = 90;
  await scanCertificates();
  assert.equal((await rows("certificate.recovered")).length, 3);
  remainingDays = null;
  await scanCertificates();
  assert.equal((await rows("certificate.cache_missing")).length, 1);
  remainingDays = 90;
  await scanCertificates();
  assert.equal((await rows("certificate.recovered")).length, 4);

  // Old daily recovery rows already resolved their preceding alert.
  await db.insert(certificates).values({ id: "legacy", name: "旧记录", domain: "legacy.example.com", ohttpsCertificateId: "legacy-remote" });
  for (const [id, eventType] of [["old-alert", "certificate.expiring"], ["old-recovery", "certificate.recovered"]]) {
    await db.insert(notifications).values({ id, eventId: id, eventType, objectType: "certificate", objectId: "legacy", payloadJson: "{}", createdAt: new Date(clock - day) });
  }
  await scanCertificates();
  clock += day;
  await scanCertificates();
  assert.equal((await db.select().from(notifications).where(eq(notifications.objectId, "legacy"))).length, 2);

  // Multiple genuine updates within one day must not collapse into one event.
  await queueNotification("certificate.synced", "certificate", "cert-id", "success", undefined, "sync:job-1");
  await queueNotification("certificate.synced", "certificate", "cert-id", "success", undefined, "sync:job-1");
  await queueNotification("certificate.synced", "certificate", "cert-id", "success", undefined, "sync:job-2");
  assert.equal((await rows("certificate.synced")).length, 2);
  const synced = JSON.parse((await rows("certificate.synced"))[0].payloadJson);
  const message = toBarkPayload(synced);
  assert.match(message.body, /主站 TLS/);
  assert.ok(!message.body.includes("cert-id"));

  // Multi-certificate deployments identify certificates and individual server results.
  await db.insert(certificateVersions).values({ id: "version", certificateId: "cert-id", version: 1, fingerprint: "test", fetchedAt: new Date(clock), expiresAt: new Date(clock + 90 * day), certPath: "unused", privateKeyPath: "unused", validationStatus: "valid" });
  await db.insert(deployments).values({ id: "deployment-id", certificateId: "cert-id", certificateVersionId: "version", title: "网站更新", trigger: "manual", status: "partial", dryRun: true, startedAt: new Date(clock) });
  await db.insert(certificateVersions).values({ id: "version-legacy", certificateId: "legacy", version: 1, fingerprint: "test-legacy", fetchedAt: new Date(clock), expiresAt: new Date(clock + 60 * day), certPath: "unused", privateKeyPath: "unused", validationStatus: "valid" });
  await db.insert(deploymentCertificates).values([
    { id: "dc", deploymentId: "deployment-id", certificateId: "cert-id", certificateVersionId: "version" },
    { id: "dc-legacy", deploymentId: "deployment-id", certificateId: "legacy", certificateVersionId: "version-legacy" },
  ]);
  await db.insert(servers).values(["北京节点", "上海节点"].map((name, i) => ({ id: `server-${i}`, name, host: "unused", username: "test", authRef: "shared" })));
  await db.insert(deploymentTargets).values([
    { id: "target-0", deploymentId: "deployment-id", serverId: "server-0", status: "succeeded" },
    { id: "target-1", deploymentId: "deployment-id", serverId: "server-1", status: "failed", errorSummary: "nginx validation failed" },
  ]);
  await queueNotification("deployment.partial", "deployment", "deployment-id", "warning");
  clock += day;
  await queueNotification("deployment.partial", "deployment", "deployment-id", "warning");
  assert.equal((await rows("deployment.partial")).length, 1); // Same attempt remains deduplicated across days.
  const deploymentMessage = toBarkPayload(JSON.parse((await rows("deployment.partial"))[0].payloadJson));
  assert.match(deploymentMessage.title, /模拟校验/);
  assert.match(deploymentMessage.body, /主站 TLS/);
  assert.match(deploymentMessage.body, /旧记录/);
  assert.match(deploymentMessage.body, /北京节点 · 成功/);
  assert.match(deploymentMessage.body, /上海节点 · 失败；原因：nginx validation failed/);
  assert.ok(!deploymentMessage.body.includes("deployment-id"));
  await db.update(deployments).set({ startedAt: new Date(clock) }).where(eq(deployments.id, "deployment-id"));
  await queueNotification("deployment.partial", "deployment", "deployment-id", "warning");
  assert.equal((await rows("deployment.partial")).length, 2);

  // Retry reuses the event and obeys exponential backoff. A manual retry of a
  // delivered message must clear deliveredAt, so a failed resend can retry too.
  await db.delete(notifications);
  await queueNotification("certificate.synced", "certificate", "cert-id", "success", undefined, "sync:retry");
  // Simulate a queued event created before the context field existed.
  const [oldQueued] = await rows("certificate.synced");
  const oldPayload = JSON.parse(oldQueued.payloadJson);
  delete oldPayload.context;
  await db.update(notifications).set({ payloadJson: JSON.stringify(oldPayload) }).where(eq(notifications.id, oldQueued.id));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let fail = false;
  const bodies: string[] = [];
  globalThis.fetch = async (_url, init) => { calls++; bodies.push(String(init?.body)); return new Response("test", { status: fail ? 503 : 200 }); };
  try {
    await deliverPendingNotifications();
    const [delivered] = await rows("certificate.synced");
    assert.ok(JSON.parse(delivered.payloadJson).context.certificates.length);
    assert.match(bodies[0], /主站 TLS/);
    await db.update(certificates).set({ name: "重命名的证书" }).where(eq(certificates.id, "cert-id"));
    const { POST } = await import("../app/api/notifications/route");
    await POST(new Request("http://localhost/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: delivered.id }) }));
    fail = true;
    await deliverPendingNotifications();
    const [failed] = await rows("certificate.synced");
    assert.equal(failed.deliveredAt, null);
    assert.equal(failed.eventId, delivered.eventId);
    assert.equal(failed.status, "failed");
    assert.equal(failed.nextRetryAt!.getTime(), clock + 120_000);
    await deliverPendingNotifications();
    assert.equal(calls, 2);
    clock += 120_000;
    fail = false;
    await deliverPendingNotifications();
    assert.equal(calls, 3);
    assert.equal((await rows("certificate.synced"))[0].status, "delivered");
    assert.equal(new Set(bodies).size, 1);
  } finally { globalThis.fetch = originalFetch; client.close(); }
  console.log("notification lifecycle tests passed");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
