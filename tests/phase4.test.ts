import assert from "node:assert/strict";
import { shouldScheduleSync } from "../app/domain/renewal";
import { postWebhook, toBarkPayload } from "../app/domain/webhook";

const now = new Date("2026-08-31T00:00:00Z");
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), lastCheckedAt: new Date("2026-08-30T23:30:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), false);
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), lastCheckedAt: new Date("2026-08-30T22:00:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), true);
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-10-10T00:00:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), false);
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600, lastCheckedAt: new Date("2026-08-29T00:00:00Z") }), true);
// Bootstrap and lost cache must be repaired without a browser session.
assert.equal(shouldScheduleSync({ now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), true);
async function run() {
  const event = { eventId: "event-1", eventType: "deployment.failed", occurredAt: "2026-08-31T00:00:00.000Z", object: { type: "deployment", id: "deployment-1" }, status: "failure" as const, errorSummary: "reload failed" };
  assert.deepEqual(toBarkPayload(event), { title: "ohttps-deploy · 证书部署失败", body: "本次部署未达到成功条件，请检查服务器结果和错误原因。\n原因：reload failed", group: "ohttps-deploy" });
  let request: RequestInit | undefined;
  const result = await postWebhook(event, "https://api.day.app/device-key", async (_input, init) => {
    request = init;
    return new Response("ok");
  });
  assert.equal(result.ok, true);
  assert.equal((request?.headers as Record<string, string>)["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(String(request?.body)), toBarkPayload(event));
  console.log("phase 4 tests passed");
}

run();

// Every supported event has useful prose and never exposes internal IDs.
for (const [eventType, expected] of Object.entries({
  "certificate.cache_missing": "重新获取",
  "certificate.expired": "已过期",
  "certificate.expiring": "续期提醒窗口",
  "certificate.recovered": "有效期已超过",
  "certificate.synced": "自动部署结果将另行通知",
  "certificate.sync_failed": "已有本地版本会保留",
  "certificate.sync_recovered": "先前的同步故障已解除",
  "deployment.succeeded": "部署已完成",
  "deployment.partial": "部分成功",
  "deployment.failed": "未达到成功条件",
  "notification.test": "推送连接正常",
})) {
  const payload = toBarkPayload({ eventId: "hidden-event-id", eventType, occurredAt: "2026-10-10T00:00:00Z", object: { type: eventType.startsWith("certificate.") ? "certificate" : "deployment", id: "hidden-object-id" }, status: "success", context: { certificates: [{ name: "主站 TLS", domain: "example.com", expiresAt: "2026-10-20T00:00:00Z" }] } });
  assert.ok(payload.body.includes(expected), eventType);
  assert.match(payload.body, /证书：主站 TLS；/);
  assert.ok(!payload.body.includes("example.com"));
  assert.match(payload.body, /剩余 10 天/);
  assert.ok(!payload.body.includes("hidden-object-id"));
  assert.ok(!payload.body.includes(eventType));
}
const missingCertificate = toBarkPayload({ eventId: "hidden", eventType: "certificate.expired", occurredAt: now.toISOString(), object: { type: "certificate", id: "removed-certificate-id" }, status: "failure" });
assert.match(missingCertificate.body, /证书信息不可用/);
assert.ok(!missingCertificate.body.includes("removed-certificate-id"));
