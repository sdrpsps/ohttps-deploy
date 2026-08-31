import assert from "node:assert/strict";
import { shouldScheduleSync } from "../app/domain/renewal";
import { signWebhook } from "../app/domain/webhook";

const now = new Date("2026-08-31T00:00:00Z");
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), lastCheckedAt: new Date("2026-08-30T23:30:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), false);
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), lastCheckedAt: new Date("2026-08-30T22:00:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), true);
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-10-10T00:00:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), false);
assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), now, renewBeforeDays: 20, minimumIntervalSeconds: 3600, syncedForCurrentVersion: true }), false);
assert.equal(signWebhook('{"ok":true}', "secret"), "sha256=f6b4a2841c93f8bf2fb8f2c13d8fb0b6c8e8019f09ee405d248daa8385fad638");
console.log("phase 4 tests passed");
