import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

(async () => {
  const unauthenticated = await middleware(new NextRequest("http://localhost/api/certificates"));
  assert.equal(unauthenticated.status, 401);
  const crossSite = await middleware(new NextRequest("http://localhost/api/certificates", { method: "POST", headers: { origin: "https://evil.example" } }));
  assert.equal(crossSite.status, 403);
  process.env.BETTER_AUTH_URL = "https://certs.example.com";
  const proxiedSameSite = await middleware(new NextRequest("http://web:3000/api/servers/fingerprint", { method: "POST", headers: { origin: "https://certs.example.com" } }));
  assert.equal(proxiedSameSite.status, 401);
  const proxiedCrossSite = await middleware(new NextRequest("http://web:3000/api/servers/fingerprint", { method: "POST", headers: { origin: "https://evil.example" } }));
  assert.equal(proxiedCrossSite.status, 403);
  const health = await middleware(new NextRequest("http://localhost/api/health"));
  assert.equal(health.status, 200);
  console.log("security tests passed");
})();
