import assert from "node:assert/strict";
import { loadConfig, redactedConfig } from "../app/lib/config";

const config = loadConfig({ DATABASE_URL: ":memory:" });
assert.equal(config.CERTIFICATE_STORAGE_DIR, "./data/certs");
const redacted = redactedConfig(config);
assert.equal("OHTTPS_API_KEY" in redacted, false);
assert.throws(() => loadConfig({ DATABASE_URL: "", RENEW_BEFORE_DAYS: "0" }), /Invalid configuration/);
console.log("config tests passed");
