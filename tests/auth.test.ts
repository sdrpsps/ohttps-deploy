import assert from "node:assert/strict";
import { auth } from "../app/lib/auth";

async function run() {
  assert.equal(auth.options.emailAndPassword?.enabled, true);
  assert.equal(auth.options.emailAndPassword?.disableSignUp, true);
  const { POST } = await import("../app/api/auth/change-password/route");
  const response = await POST(new Request("http://localhost/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: "old", newPassword: "too-short" }) }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_CREDENTIALS");
  console.log("auth tests passed");
}

run();
