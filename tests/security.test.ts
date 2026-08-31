import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

(async () => {
  const unauthenticated = await middleware(new NextRequest("http://localhost/api/certificates"));
  assert.equal(unauthenticated.status, 401);
  const crossSite = await middleware(new NextRequest("http://localhost/api/certificates", { method: "POST", headers: { origin: "https://evil.example" } }));
  assert.equal(crossSite.status, 403);
  const health = await middleware(new NextRequest("http://localhost/api/health"));
  assert.equal(health.status, 200);
  console.log("security tests passed");
})();
