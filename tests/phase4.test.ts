import assert from "node:assert/strict";
import { shouldScheduleSync } from "../app/domain/renewal";
import { postWebhook, toBarkPayload } from "../app/domain/webhook";

const now = new Date("2026-08-31T00:00:00Z");
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), lastCheckedAt: new Date("2026-08-30T23:30:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), false);
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), lastCheckedAt: new Date("2026-08-30T22:00:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), true);
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-10-10T00:00:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), false);
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600, syncedForCurrentVersion: true }), false);
async function run() {
  const event = { eventId: "event-1", eventType: "deployment.failed", occurredAt: "2026-08-31T00:00:00.000Z", object: { type: "deployment", id: "deployment-1" }, status: "failure" as const, errorSummary: "reload failed" };
  assert.deepEqual(toBarkPayload(event), { title: "ohttps-deploy · 证书部署失败", body: "事件：deployment.failed\n对象：deployment/deployment-1\n错误：reload failed", group: "ohttps-deploy" });
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
