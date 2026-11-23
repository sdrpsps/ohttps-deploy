import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OHTTPSClient } from "../app/domain/ohttps-client";
import { isWithinRenewalWindow, validateCertificatePair } from "../app/domain/certificate";
import { deploymentPaths } from "../app/domain/deployment-path";
import { shouldScheduleSync } from "../app/domain/renewal";
import { CertificateStore } from "../app/domain/certificate-store";

async function run() {
  // 1. OHTTPSClient signing, fetch, and secret redaction
  assert.equal(OHTTPSClient.sign("demo-id", "demo-key", "cert-1", 1700000000000), "b018929911c37d8ecfefd706d87d29cc");

  let calledUrl = "";
  const client = new OHTTPSClient("id", "secret", {
    now: () => 123,
    fetchImpl: async (input) => {
      calledUrl = String(input);
      return new Response(JSON.stringify({ success: true, payload: { certKey: "key", fullChainCerts: "cert", expiredTime: "2030-01-01" } }));
    },
  });
  const result = await client.getCertificate("c");
  assert.equal(result.expiredTime, "2030-01-01");
  assert.equal(new URL(calledUrl).searchParams.get("apiId"), "id");
  assert.equal(new URL(calledUrl).searchParams.get("timestamp"), "123");

  const errorClient = new OHTTPSClient("id", "super-secret", {
    fetchImpl: async () => new Response(JSON.stringify({ success: false, msg: "bad super-secret" })),
  });
  await assert.rejects(() => errorClient.getCertificate("c"), (error: Error & { code?: string }) => error.code === "API_ERROR" && !error.message.includes("super-secret"));

  // 2. Certificate PEM validation, SAN matching, and renewal window
  assert.throws(() => validateCertificatePair("not pem", "not key"), /invalid certificate PEM/);
  const cert = await readFile(new URL("./fixtures/test-cert.pem", import.meta.url), "utf8");
  const key = await readFile(new URL("./fixtures/test-key.pem", import.meta.url), "utf8");
  const parsed = validateCertificatePair(cert, key, { checkValidity: false });
  assert.match(parsed.fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.throws(() => validateCertificatePair(cert, key, { requiredSans: ["missing.example"], checkValidity: false }), /SAN/);

  const now = new Date("2026-08-30T00:00:00Z");
  assert.equal(isWithinRenewalWindow(new Date("2026-09-10T00:00:00Z"), now), true);
  assert.equal(isWithinRenewalWindow(new Date("2026-10-01T00:00:00Z"), now), false);

  // 3. Deployment path normalization & traversal protection
  assert.deepEqual(deploymentPaths("Example.COM"), {
    certPath: "/etc/nginx/ssl/example.com/fullchain.pem",
    privateKeyPath: "/etc/nginx/ssl/example.com/privkey.pem",
  });
  assert.throws(() => deploymentPaths("../etc"), /not safe/);

  // 4. Sync scheduling policy
  const schedNow = new Date("2026-08-31T00:00:00Z");
  assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), lastCheckedAt: new Date("2026-08-30T23:30:00Z"), now: schedNow, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), false);
  assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), lastCheckedAt: new Date("2026-08-30T22:00:00Z"), now: schedNow, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), true);
  assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-10-10T00:00:00Z"), now: schedNow, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), false);
  assert.equal(shouldScheduleSync({ expiresAt: new Date("2026-09-10T00:00:00Z"), now: schedNow, renewBeforeDays: 20, minimumIntervalSeconds: 3600, lastCheckedAt: new Date("2026-08-29T00:00:00Z") }), true);
  assert.equal(shouldScheduleSync({ now: schedNow, renewBeforeDays: 20, minimumIntervalSeconds: 3600 }), true);

  // 5. CertificateStore.pruneOldVersions keeps newest, current, and protected versions
  const temporary = mkdtempSync(join(tmpdir(), "ohttps-domain-store-"));
  try {
    const certFile = join(temporary, "cert.pem");
    const keyFile = join(temporary, "key.pem");
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", keyFile, "-out", certFile, "-days", "90",
        "-subj", "/CN=example.com", "-addext", "subjectAltName=DNS:example.com",
      ],
      { stdio: "ignore" }
    );
    const certPem = readFileSync(certFile, "utf8");
    const keyPem = readFileSync(keyFile, "utf8");
    const store = new CertificateStore(join(temporary, "certs"));
    const versions = [];
    for (let i = 0; i < 5; i++) {
      versions.push(
        await store.saveVersion("cert-1", {
          certificatePem: certPem,
          privateKeyPem: keyPem,
          fetchedAt: new Date(Date.UTC(2026, 0, i + 1)),
        })
      );
    }
    const removed = await store.pruneOldVersions("cert-1", {
      keepCount: 2,
      protectedDirectories: [versions[0].directory],
    });
    assert.equal(removed.length, 2);
    assert.equal(existsSync(versions[0].directory), true);
    assert.equal(existsSync(versions[1].directory), false);
    assert.equal(existsSync(versions[2].directory), false);
    assert.equal(existsSync(versions[3].directory), true);
    assert.equal(existsSync(versions[4].directory), true);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  console.log("domain tests passed");
}

run();
