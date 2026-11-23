import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, readlink, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { validateCertificatePair, ParsedCertificate } from './certificate';

export interface CertificateMaterial {
  certificatePem: string;
  privateKeyPem: string;
  fetchedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface StoredCertificateVersion extends ParsedCertificate {
  certificateId: string;
  version: string;
  directory: string;
  fetchedAt: Date;
}

function safeCertificateDirectory(id: string): string {
  const slug = id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48) || 'certificate';
  const digest = createHash('sha256').update(id).digest('hex').slice(0, 12);
  return `${slug}-${digest}`;
}

/** Immutable, versioned certificate storage with an atomically replaced `current` pointer. */
export class CertificateStore {
  private readonly baseDir: string;

  constructor(baseDir: string) { this.baseDir = baseDir; }

  private certDir(certificateId: string): string { return join(this.baseDir, safeCertificateDirectory(certificateId)); }

  async saveVersion(certificateId: string, material: CertificateMaterial): Promise<StoredCertificateVersion> {
    const parsed = validateCertificatePair(material.certificatePem, material.privateKeyPem);
    const fetchedAt = material.fetchedAt ?? new Date();
    const version = `${fetchedAt.toISOString().replace(/[-:.TZ]/g, '')}-${parsed.fingerprint.replace(/:/g, '').slice(-12)}-${process.hrtime.bigint().toString(36)}`;
    const certDir = this.certDir(certificateId);
    const versionDir = join(certDir, version);
    await mkdir(versionDir, { recursive: true, mode: 0o700 });
    await writeFile(join(versionDir, 'fullchain.pem'), parsed.certificatePem, { mode: 0o644 });
    await writeFile(join(versionDir, 'privkey.pem'), parsed.privateKeyPem, { mode: 0o600 });
    await chmod(join(versionDir, 'fullchain.pem'), 0o644);
    await chmod(join(versionDir, 'privkey.pem'), 0o600);
    await writeFile(join(versionDir, 'metadata.json'), JSON.stringify({
      ...(material.metadata ?? {}),
      certificateId,
      version,
      fingerprint: parsed.fingerprint,
      notBefore: parsed.notBefore.toISOString(),
      notAfter: parsed.notAfter.toISOString(),
      fetchedAt: fetchedAt.toISOString(),
    }, null, 2), { mode: 0o600 });

    await mkdir(certDir, { recursive: true, mode: 0o700 });
    const pointerTmp = join(certDir, `.current-${process.pid}-${Date.now()}`);
    await symlink(version, pointerTmp, 'dir');
    await rename(pointerTmp, join(certDir, 'current'));
    return { ...parsed, certificateId, version, directory: versionDir, fetchedAt };
  }

  async getCurrent(certificateId: string): Promise<StoredCertificateVersion | undefined> {
    const certDir = this.certDir(certificateId);
    let version: string;
    try { version = await readlink(join(certDir, 'current')); } catch { return undefined; }
    if (version.includes('/') || version.includes('\\') || version === '.' || version === '..') return undefined;
    const versionDir = join(certDir, version);
    try {
      const [certificatePem, privateKeyPem, metadataRaw] = await Promise.all([
        readFile(join(versionDir, 'fullchain.pem'), 'utf8'),
        readFile(join(versionDir, 'privkey.pem'), 'utf8'),
        readFile(join(versionDir, 'metadata.json'), 'utf8'),
      ]);
      const metadata = JSON.parse(metadataRaw) as { fetchedAt?: string };
      const parsed = validateCertificatePair(certificatePem, privateKeyPem, { checkValidity: false });
      return {
        ...parsed,
        certificateId,
        version,
        directory: versionDir,
        fetchedAt: metadata.fetchedAt ? new Date(metadata.fetchedAt) : new Date(0),
      };
    } catch { return undefined; }
  }

  async pruneOldVersions(
    certificateId: string,
    options?: { keepCount?: number; protectedDirectories?: Iterable<string> }
  ): Promise<string[]> {
    const keepCount = Math.max(1, options?.keepCount ?? 5);
    const certDir = this.certDir(certificateId);
    let entries;
    try {
      entries = await readdir(certDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const currentTarget = await readlink(join(certDir, 'current')).catch(() => undefined);
    const protectedSet = new Set<string>();
    if (currentTarget) {
      protectedSet.add(currentTarget);
      protectedSet.add(join(certDir, currentTarget));
    }
    for (const protectedPath of options?.protectedDirectories ?? []) {
      if (!protectedPath) continue;
      protectedSet.add(protectedPath);
      protectedSet.add(basename(protectedPath));
    }

    const versionDirs = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'current')
      .map((entry) => entry.name);

    const withTimes = await Promise.all(
      versionDirs.map(async (name) => {
        const fullPath = join(certDir, name);
        let timestamp = 0;
        try {
          const raw = await readFile(join(fullPath, 'metadata.json'), 'utf8');
          const parsed = JSON.parse(raw) as { fetchedAt?: string };
          if (parsed.fetchedAt) {
            const t = Date.parse(parsed.fetchedAt);
            if (Number.isFinite(t)) timestamp = t;
          }
        } catch {
          // Fall back to directory mtime when metadata is unavailable.
        }
        if (!timestamp) {
          timestamp = await stat(fullPath).then((s) => s.mtimeMs).catch(() => 0);
        }
        return { name, fullPath, timestamp };
      })
    );

    withTimes.sort((a, b) => (b.timestamp !== a.timestamp ? b.timestamp - a.timestamp : b.name.localeCompare(a.name)));

    const removed: string[] = [];
    for (let i = 0; i < withTimes.length; i++) {
      const candidate = withTimes[i];
      if (i < keepCount) continue;
      if (protectedSet.has(candidate.name) || protectedSet.has(candidate.fullPath)) continue;
      await rm(candidate.fullPath, { recursive: true, force: true });
      removed.push(candidate.fullPath);
    }
    return removed;
  }

  store(certificateId: string, material: CertificateMaterial) {
    return this.saveVersion(certificateId, material);
  }

  loadCurrent(certificateId: string) {
    return this.getCurrent(certificateId);
  }
}
