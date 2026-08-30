import assert from "node:assert/strict";
import { loadConfig, redactedConfig } from "../app/lib/config";

const config = loadConfig({ DATABASE_URL: ":memory:", OHTTPS_API_ID: "id", OHTTPS_API_KEY: "secret", WEBHOOK_URL: "", WEBHOOK_SECRET: "hook" });
assert.equal(config.RENEW_BEFORE_DAYS, 20);
const redacted = redactedConfig(config);
assert.equal(redacted.hasOhttpsCredentials, true);
assert.equal("OHTTPS_API_KEY" in redacted, false);
assert.throws(() => loadConfig({ DATABASE_URL: "", RENEW_BEFORE_DAYS: "0" }), /Invalid configuration/);
console.log("config tests passed");
