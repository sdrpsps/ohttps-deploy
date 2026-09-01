import assert from "node:assert/strict";
import { POST } from "../app/api/servers/fingerprint/route";

async function run() {
  const response = await POST(new Request("http://localhost/api/servers/fingerprint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: "server.example.com", port: 0 }),
  }));

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_INPUT");
}

run();
