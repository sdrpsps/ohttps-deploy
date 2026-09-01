import assert from "node:assert/strict";
import { POST } from "../app/api/servers/fingerprint/route";
import { fingerprintErrorMessage } from "../app/deployer/ssh-deployer";

async function run() {
  const response = await POST(new Request("http://localhost/api/servers/fingerprint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "server.example.com", port: 0 }),
  }));

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_INPUT");
  assert.match(fingerprintErrorMessage(new Error("connect ECONNREFUSED 192.0.2.1:22")), /port refused/);
  assert.match(fingerprintErrorMessage(new Error("getaddrinfo ENOTFOUND host")), /could not be resolved/);
  assert.match(fingerprintErrorMessage(new Error("SSH host-key lookup timed out")), /timed out/);
}

run();
