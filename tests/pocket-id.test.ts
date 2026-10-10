import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { loadPocketIdConfig } from "../app/lib/pocket-id";

async function run() {
  assert.equal(loadPocketIdConfig({}), undefined);
  assert.throws(() => loadPocketIdConfig({ POCKET_ID_ISSUER: "https://id.example.test" }), /requires/);
  const env = { POCKET_ID_ISSUER: "https://id.example.test/", POCKET_ID_CLIENT_ID: "test-client", POCKET_ID_CLIENT_SECRET: "fake-client-secret" };
  assert.equal(loadPocketIdConfig(env)?.issuer, "https://id.example.test");
  assert.deepEqual(loadPocketIdConfig({ ...env, POCKET_ID_ADMIN_SUB: "legacy-user-id" }), loadPocketIdConfig(env));
  assert.equal(loadPocketIdConfig({ POCKET_ID_ADMIN_SUB: "legacy-user-id" }), undefined);
  for (const issuer of ["http://id.example.test", "https://user:password@id.example.test", "https://id.example.test?key=secret", "invalid"]) {
    assert.throws(() => loadPocketIdConfig({ ...env, POCKET_ID_ISSUER: issuer }));
  }
  const directory = mkdtempSync(join(tmpdir(), "pocket-id-test-"));
  Object.assign(process.env, env, { DATABASE_URL: join(directory, "test.db"), BETTER_AUTH_URL: "https://certs.example.test", AUTH_SECRET: "test-only-auth-secret-with-at-least-32-characters" });
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const { privateKey: wrongKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "test-key", alg: "RS256", use: "sig" };
  let nonce = "";
  let claims: Record<string, unknown> = {};
  let badSignature = false;
  let discoveryFailure = false;
  let tokenFailure = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      assert.ok(init?.signal);
      if (discoveryFailure) return Response.json({ secret: "fake-upstream-secret" }, { status: 500 });
      return Response.json({ issuer: "https://id.example.test", authorization_endpoint: "https://id.example.test/api/oidc/authorize", token_endpoint: "https://id.example.test/api/oidc/token", jwks_uri: "https://id.example.test/.well-known/jwks.json" });
    }
    if (url.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [jwk] });
    assert.equal(url, "https://id.example.test/api/oidc/token");
    assert.ok(init?.signal);
    assert.equal(init?.redirect, "error");
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("client_id"), env.POCKET_ID_CLIENT_ID);
    assert.equal(body.get("client_secret"), env.POCKET_ID_CLIENT_SECRET);
    assert.equal(body.get("redirect_uri"), "https://certs.example.test/api/auth/callback/pocket-id");
    assert.ok(body.get("code_verifier"));
    if (tokenFailure) return Response.json({ error_description: "fake-upstream-secret" }, { status: 400 });
    const token = await new SignJWT({ name: "Sunny", email: "admin@example.test", email_verified: true, nonce, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(String(claims.iss ?? "https://id.example.test"))
      .setAudience(String(claims.aud ?? "test-client")).setSubject(String(claims.sub ?? "test-admin-sub"))
      .setIssuedAt().setExpirationTime(claims.exp === 1 ? 1 : "5m").sign(badSignature ? wrongKey : privateKey);
    return Response.json({ access_token: "fake-access-token", token_type: "Bearer", id_token: token, expires_in: 300 });
  };
  try {
    const [{ migrate }, { db }, schema, { auth, ensureAdmin, isAuthorizedUser }, { eq }] = await Promise.all([
      import("drizzle-orm/libsql/migrator"), import("../app/db"), import("../app/db/schema"), import("../app/lib/auth"), import("drizzle-orm"),
    ]);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const password = await ensureAdmin();
    assert.ok(password);
    assert.equal(await ensureAdmin(), undefined);
    assert.equal((await db.select().from(schema.authUsers)).length, 1);
    assert.equal((await db.select().from(schema.authAccounts)).length, 1);
    const cookieHeader = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
    const start = () => auth.handler(new Request("https://certs.example.test/api/auth/sign-in/social", {
      method: "POST", headers: { origin: "https://certs.example.test", "content-type": "application/json" },
      body: JSON.stringify({ provider: "pocket-id", callbackURL: "/", errorCallbackURL: "/login?authError=1" }),
    }));
    async function login() {
      const response = await start();
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(JSON.stringify(body).includes("fake-client-secret"), false);
      const authorization = new URL(body.url);
      assert.equal(authorization.pathname, "/api/oidc/authorize");
      assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
      assert.equal(authorization.searchParams.get("scope"), "openid profile email");
      nonce = authorization.searchParams.get("nonce")!;
      assert.ok(nonce);
      const callback = new URL("https://certs.example.test/api/auth/callback/pocket-id");
      callback.searchParams.set("state", authorization.searchParams.get("state")!);
      callback.searchParams.set("code", "fake-code");
      return auth.handler(new Request(callback, { headers: { cookie: cookieHeader(response) } }));
    }
    // Provider failure is recoverable, and does not prevent password login.
    discoveryFailure = true;
    assert.notEqual((await start()).status, 200);
    const local = await auth.api.signInUsername({ body: { username: "admin", password: password! }, asResponse: true });
    assert.equal(local.status, 200);
    discoveryFailure = false;
    const successful = await login();
    assert.equal(successful.status, 302);
    assert.equal(new URL(successful.headers.get("location")!, "https://certs.example.test").pathname, "/");
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(successful) }) });
    assert.ok(session);
    assert.equal(session.user.name, "Sunny");
    assert.equal(session.user.email, "admin@example.test");
    assert.notEqual(session.user.username, "admin");
    assert.equal(await isAuthorizedUser(session.user), true);
    // Each allowed Pocket ID subject gets an independent user and session.
    claims = { sub: "friend-sub", email: "friend@example.test", name: "Friend" };
    const friend = await login();
    assert.equal(new URL(friend.headers.get("location")!, "https://certs.example.test").pathname, "/");
    const friendSession = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(friend) }) });
    assert.notEqual(friendSession?.user.id, session.user.id);
    assert.notEqual(friendSession?.user.username, "admin");
    assert.equal(friendSession?.user.name, "Friend");
    assert.equal(friendSession?.user.email, "friend@example.test");
    assert.equal((await db.select().from(schema.authAccounts)).length, 3);
    assert.equal((await db.select().from(schema.authUsers)).length, 3);
    await ensureAdmin();
    assert.ok(await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(friend) }) }), "Worker restart must preserve sessions for an unchanged client binding");
    claims = {};
    const noState = await auth.handler(new Request("https://certs.example.test/api/auth/callback/pocket-id?code=fake-code"));
    assert.ok(noState.headers.get("location")?.includes("error="));
    const wrongState = await auth.handler(new Request("https://certs.example.test/api/auth/callback/pocket-id?code=fake-code&state=wrong-state"));
    assert.ok(wrongState.headers.get("location")?.includes("error="));
    for (const invalid of [{ sub: "" }, { nonce: "wrong-nonce" }, { iss: "https://evil.example.test" }, { aud: "other-client" }, { azp: "other-client" }, { exp: 1 }, { email: "" }]) {
      claims = invalid;
      const rejected = await login();
      assert.ok(rejected.headers.get("location")?.includes("authError=1"));
      assert.ok(rejected.headers.get("location")?.includes("error="));
      assert.equal(rejected.headers.getSetCookie().some((cookie) => cookie.startsWith("__Secure-better-auth.session_token=")), false);
    }
    claims = {};
    badSignature = true;
    assert.ok((await login()).headers.get("location")?.includes("error="));
    badSignature = false;
    // A group denial at the provider's token endpoint cannot create a local session.
    const sessionsBeforeDenial = (await db.select().from(schema.authSessions)).length;
    tokenFailure = true;
    const tokenRejected = await login();
    assert.ok(tokenRejected.headers.get("location")?.includes("error="));
    assert.equal(tokenRejected.headers.get("location")?.includes("fake-upstream-secret"), false);
    assert.equal((await db.select().from(schema.authSessions)).length, sessionsBeforeDenial);
    tokenFailure = false;
    assert.equal((await db.select().from(schema.authUsers)).length, 3);
    // Account-management endpoints cannot disclose tokens or change the fixed binding.
    for (const path of ["get-access-token", "refresh-token", "account-info", "link-social", "unlink-account", "set-password"]) {
      const blocked = await auth.handler(new Request(`https://certs.example.test/api/auth/${path}`, { method: "POST", headers: { cookie: cookieHeader(successful), "content-type": "application/json" }, body: JSON.stringify({ providerId: "pocket-id" }) }));
      assert.equal(blocked.status, 404);
    }
    const accounts = await db.select().from(schema.authAccounts);
    const account = accounts.find((row) => row.userId === session.user.id)!;
    assert.equal(account.accountId, "test-admin-sub");
    assert.equal(account.issuer, "https://id.example.test#client=test-client");
    // Re-login resolves the same subject rather than creating a new user.
    const repeat = await login();
    const repeatSession = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(repeat) }) });
    assert.equal(repeatSession?.user.id, session.user.id);
    const { recordAudit } = await import("../app/lib/audit");
    await recordAudit(new Request("https://certs.example.test/api/settings", { headers: { cookie: cookieHeader(friend) } }), "settings.updated", "settings");
    const [audit] = await db.select().from(schema.auditEvents);
    assert.equal(audit.actor, `Friend (${friendSession!.user.id})`);
    const { middleware } = await import("../middleware");
    const { NextRequest } = await import("next/server");
    assert.equal((await middleware(new NextRequest("https://certs.example.test/api/settings", { headers: { cookie: cookieHeader(friend) } }))).status, 200);
    // Signing out one person leaves the other's session intact.
    await auth.api.signOut({ headers: new Headers({ cookie: cookieHeader(friend) }) });
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(friend) }) }), null);
    assert.ok(await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(successful) }) }));
    // Legacy shared-admin bindings are retired and only that user's sessions are revoked.
    const localSession = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(local) }) });
    await db.insert(schema.authAccounts).values({ id: "legacy-binding", userId: localSession!.user.id, providerId: "pocket-id", issuer: "https://id.example.test", accountId: "old-admin-sub" });
    await ensureAdmin();
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(local) }) }), null);
    assert.ok(await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(successful) }) }));
    assert.equal((await db.select().from(schema.authAccounts)).length, 3);
    // Matching email never links a new subject to an existing user or local admin.
    for (const email of ["admin@localhost", "admin@example.test"]) {
      claims = { sub: "unlinked-sub", email };
      assert.ok((await login()).headers.get("location")?.includes("error="));
    }
    assert.equal((await db.select().from(schema.authUsers)).length, 3);
    // A changed client/issuer invalidates authorization immediately, before Worker cleanup.
    await db.update(schema.authAccounts).set({ issuer: "https://id.example.test#client=old-client" }).where(eq(schema.authAccounts.id, account.id));
    assert.equal(await isAuthorizedUser(session.user), false);
    assert.equal((await middleware(new NextRequest("https://certs.example.test/api/settings", { headers: { cookie: cookieHeader(successful) } }))).status, 401);
    await ensureAdmin();
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(successful) }) }), null);
    assert.ok((await db.select().from(schema.authAccounts)).some((row) => row.userId === friendSession!.user.id));
    claims = {};
    const reprovisioned = await login();
    assert.equal(new URL(reprovisioned.headers.get("location")!, "https://certs.example.test").pathname, "/");
    const reprovisionedSession = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(reprovisioned) }) });
    assert.ok(reprovisionedSession);
    assert.notEqual(reprovisionedSession.user.id, session.user.id);
    assert.equal(await isAuthorizedUser(reprovisionedSession.user), true);
    console.log("Pocket ID tests passed");
  } finally { globalThis.fetch = originalFetch; rmSync(directory, { recursive: true, force: true }); }
}
run();
