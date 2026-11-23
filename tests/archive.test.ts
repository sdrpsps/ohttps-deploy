import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function run() {
  const temporary = mkdtempSync(join(tmpdir(), "ohttps-archive-"));
  const dbPath = join(temporary, "test.db");
  const certsDir = join(temporary, "certs");
  const archiveDir = join(temporary, "archives");
  process.env.DATABASE_URL = dbPath;
  process.env.CERTIFICATE_STORAGE_DIR = certsDir;
  process.env.LOG_ARCHIVE_DIR = archiveDir;

  try {
    const [
      { migrate },
      { db, client },
      schema,
      { archiveExpiredRecords, pruneCertificateVersionDirectories },
      { CertificateStore },
      { workerAdapters },
    ] = await Promise.all([
      import("drizzle-orm/libsql/migrator"),
      import("../app/db"),
      import("../app/db/schema"),
      import("../app/worker/archive"),
      import("../app/domain/certificate-store"),
      import("../app/worker/context"),
    ]);

    await migrate(db, { migrationsFolder: "./drizzle" });
    const { auditEvents, certificates, certificateVersions, deployments, logs } = schema;

    // 1. Single-batch archive & idempotent empty check
    const old = new Date("2026-01-01T00:00:00Z");
    const fresh = new Date("2026-08-01T00:00:00Z");
    const cutoff = new Date("2026-06-01T00:00:00Z");
    await db.insert(logs).values([
      { id: "old-log", sequence: 1, message: "old", createdAt: old },
      { id: "fresh-log", sequence: 2, message: "fresh", createdAt: fresh },
    ]);
    await db.insert(auditEvents).values([
      { id: "old-audit", action: "old", objectType: "test", result: "success", createdAt: old, updatedAt: old },
      { id: "fresh-audit", action: "fresh", objectType: "test", result: "success", createdAt: fresh, updatedAt: fresh },
    ]);
    const singleDir = join(temporary, "single");
    assert.equal(await archiveExpiredRecords(cutoff, singleDir), true);
    const [file] = await readdir(singleDir);
    const archive = JSON.parse(await readFile(join(singleDir, file), "utf8"));
    assert.equal(archive.logs[0].id, "old-log");
    assert.equal(archive.auditEvents[0].id, "old-audit");
    assert.deepEqual((await db.select().from(logs)).map((row) => row.id), ["fresh-log"]);
    assert.deepEqual((await db.select().from(auditEvents)).map((row) => row.id), ["fresh-audit"]);
    assert.equal(await archiveExpiredRecords(cutoff, singleDir), false);

    // 2. Multi-batch archive deletes strictly archived IDs
    await db.insert(logs).values([
      { id: "l-old-1", sequence: 10, message: "old-1", createdAt: new Date(old.getTime() + 1) },
      { id: "l-old-2", sequence: 11, message: "old-2", createdAt: new Date(old.getTime() + 2) },
      { id: "l-old-3", sequence: 12, message: "old-3", createdAt: new Date(old.getTime() + 3) },
    ]);
    await db.insert(auditEvents).values([
      { id: "a-old-1", action: "test", objectType: "t", result: "success", createdAt: new Date(old.getTime() + 1), updatedAt: old },
      { id: "a-old-2", action: "test", objectType: "t", result: "success", createdAt: new Date(old.getTime() + 2), updatedAt: old },
      { id: "a-old-3", action: "test", objectType: "t", result: "success", createdAt: new Date(old.getTime() + 3), updatedAt: old },
    ]);
    assert.equal(await archiveExpiredRecords(cutoff, archiveDir, 2), true);
    const batchFiles = await readdir(archiveDir);
    assert.equal(batchFiles.length, 2);
    assert.deepEqual((await db.select({ id: logs.id }).from(logs)).map((r) => r.id), ["fresh-log"]);
    assert.deepEqual((await db.select({ id: auditEvents.id }).from(auditEvents)).map((r) => r.id), ["fresh-audit"]);

    // 3. pruneCertificateVersionDirectories protects current and active running deployment versions
    const certPath = join(temporary, "cert.pem");
    const keyPath = join(temporary, "key.pem");
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", keyPath, "-out", certPath, "-days", "90",
        "-subj", "/CN=example.com", "-addext", "subjectAltName=DNS:example.com",
      ],
      { stdio: "ignore" }
    );
    const certPem = readFileSync(certPath, "utf8");
    const keyPem = readFileSync(keyPath, "utf8");

    const store = new CertificateStore(certsDir);
    workerAdapters.certificateStore = store;
    const savedVersions = [];
    for (let i = 0; i < 6; i++) {
      savedVersions.push(
        await store.saveVersion("cert-prune", {
          certificatePem: certPem,
          privateKeyPem: keyPem,
          fetchedAt: new Date(Date.UTC(2026, 0, i + 1)),
        })
      );
    }
    await db.insert(certificates).values({
      id: "cert-prune",
      ohttpsCertificateId: "remote-prune",
      name: "Prune Cert",
      domain: "example.com",
      currentVersionId: "ver-current",
    });
    for (let i = 0; i < savedVersions.length; i++) {
      await db.insert(certificateVersions).values({
        id: i === 5 ? "ver-current" : `ver-${i}`,
        certificateId: "cert-prune",
        version: i + 1,
        fingerprint: savedVersions[i].fingerprint,
        fetchedAt: savedVersions[i].fetchedAt,
        expiresAt: savedVersions[i].notAfter,
        certPath: `${savedVersions[i].directory}/fullchain.pem`,
        privateKeyPath: `${savedVersions[i].directory}/privkey.pem`,
        validationStatus: "valid",
      });
    }
    await db.insert(deployments).values({
      id: "dep-active-ver0",
      certificateId: "cert-prune",
      certificateVersionId: "ver-0",
      trigger: "manual",
      status: "running",
    });

    const removed = await pruneCertificateVersionDirectories(2);
    assert.equal(removed.length, 3);
    assert.equal(existsSync(savedVersions[0].directory), true);
    assert.equal(existsSync(savedVersions[4].directory), true);
    assert.equal(existsSync(savedVersions[5].directory), true);
    assert.equal(existsSync(savedVersions[1].directory), false);
    assert.equal(existsSync(savedVersions[2].directory), false);
    assert.equal(existsSync(savedVersions[3].directory), false);

    client.close();
    console.log("archive and version pruning tests passed");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

run();
