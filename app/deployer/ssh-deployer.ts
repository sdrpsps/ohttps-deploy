import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import type { Client, ClientChannel, ConnectConfig } from "ssh2";
import { Deployer, DeploymentMaterial, DeployTarget, DeploymentResult, validateCommand } from "./deployer";

type SshFactory = () => Client;

/** SSH push deployer: upload temp files, validate, atomically replace, reload, clean up. */
export class SSHDeployer implements Deployer {
  constructor(private readonly options: { privateKey: string | Buffer; knownHosts?: Record<string, string>; clientFactory?: SshFactory } ) {}

  async getHostFingerprint(target: Pick<DeployTarget, "host" | "port" | "timeoutSeconds">): Promise<string> {
    const { Client: SshClient } = await import("ssh2");
    const client = this.options.clientFactory?.() ?? new SshClient();
    try {
      return await new Promise<string>((resolve, reject) => {
        let finished = false;
        let timeout: ReturnType<typeof setTimeout>;
        const finish = (callback: () => void) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          callback();
        };
        timeout = setTimeout(() => finish(() => reject(new Error("SSH host-key lookup timed out"))), target.timeoutSeconds * 1000);
        client.once("error", (error) => finish(() => reject(error)));
        try {
          client.connect({
            host: target.host,
            port: target.port,
            // ssh2 validates this before the host-key exchange; authentication never begins here.
            username: "fingerprint",
            readyTimeout: target.timeoutSeconds * 1000,
            hostHash: "sha256",
            hostVerifier: (hash: string) => {
              finish(() => resolve(`SHA256:${hash}`));
              return false;
            },
          });
        } catch (error) {
          finish(() => reject(error as Error));
        }
      });
    } finally { client.end(); }
  }

  async testConnection(target: DeployTarget): Promise<DeploymentResult> {
    const { Client: SshClient } = await import("ssh2");
    const client = this.options.clientFactory?.() ?? new SshClient();
    try {
      await new Promise<void>((resolve, reject) => { client.once("ready", () => resolve()).once("error", reject).connect(this.connectConfig(target)); });
      return { targetId: target.id, ok: true, exitCode: 0 };
    } catch (error) { return { targetId: target.id, ok: false, error: sanitizeError((error as Error).message) }; }
    finally { client.end(); }
  }

  async deploy(target: DeployTarget, material: DeploymentMaterial | DeploymentMaterial[], options: { dryRun?: boolean; signal?: AbortSignal } = {}): Promise<DeploymentResult> {
    try { validateCommand(target.validationCommand); validateCommand(target.reloadCommand); if (target.healthCheckCommand) validateCommand(target.healthCheckCommand); } catch (error) { return { targetId: target.id, ok: false, error: (error as Error).message }; }
    if (options.dryRun) return { targetId: target.id, ok: true };
    if (options.signal?.aborted) return { targetId: target.id, ok: false, error: "cancelled" };

    const materials = Array.isArray(material) ? material : [material];
    if (materials.length === 0) return { targetId: target.id, ok: true, exitCode: 0 };
    await Promise.all(materials.flatMap((m) => [readFile(m.certificatePath), readFile(m.privateKeyPath)]));

    const { Client: SshClient } = await import("ssh2");
    const client = this.options.clientFactory?.() ?? new SshClient();
    const tempRoot = `/tmp/ohttps-deploy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const commandOptions = { signal: options.signal, timeoutMs: target.timeoutSeconds * 1000 };

    const items = materials.map((m, idx) => {
      const destCert = m.certPath ?? (m.domain ? `/etc/nginx/ssl/${m.domain}/fullchain.pem` : target.certPath);
      const destKey = m.privateKeyPathRemote ?? (m.domain ? `/etc/nginx/ssl/${m.domain}/privkey.pem` : target.privateKeyPath);
      const suffix = idx === 0 ? "" : `-${idx}`;
      return {
        m,
        destCert,
        destKey,
        tempCert: posix.join(tempRoot, `fullchain${suffix}.pem`),
        tempKey: posix.join(tempRoot, `privkey${suffix}.pem`),
        backupCert: posix.join(tempRoot, `previous-fullchain${suffix}.pem`),
        backupKey: posix.join(tempRoot, `previous-privkey${suffix}.pem`),
        missingCert: posix.join(tempRoot, `fullchain-was-missing${suffix}`),
        missingKey: posix.join(tempRoot, `privkey-was-missing${suffix}`),
      };
    });

    let replacementStarted = false;
    let preserveArtifacts = false;
    try {
      await new Promise<void>((resolve, reject) => { client.once("ready", () => resolve()).once("error", reject).connect(this.connectConfig(target)); });
      await this.exec(client, target.validationCommand, commandOptions);
      await this.exec(client, `mkdir -p ${shellQuote(tempRoot)}`, commandOptions);
      await new Promise<void>((resolve, reject) => client.sftp((error, sftp) => {
        if (error || !sftp) return reject(error ?? new Error("sftp unavailable"));
        let remaining = items.length * 2;
        let failed = false;
        const done = (putError?: Error | null) => {
          if (putError && !failed) { failed = true; return reject(putError); }
          remaining -= 1;
          if (remaining === 0 && !failed) resolve();
        };
        for (const item of items) {
          sftp.fastPut(item.m.certificatePath, item.tempCert, done);
          sftp.fastPut(item.m.privateKeyPath, item.tempKey, done);
        }
      }));
      const chmodCmd = items.map((item) => `chmod 0644 ${shellQuote(item.tempCert)} && chmod 0600 ${shellQuote(item.tempKey)} && test -s ${shellQuote(item.tempCert)} && test -s ${shellQuote(item.tempKey)}`).join(" && ");
      await this.exec(client, chmodCmd, commandOptions);
      const targetDirs = [...new Set(items.flatMap((item) => [posix.dirname(item.destCert), posix.dirname(item.destKey)]))];
      await this.exec(client, `mkdir -p -- ${targetDirs.map(shellQuote).join(" ")}`, commandOptions);
      for (const item of items) {
        await this.exec(client, backupCommand(item.destCert, item.backupCert, item.missingCert), commandOptions);
        await this.exec(client, backupCommand(item.destKey, item.backupKey, item.missingKey), commandOptions);
      }
      replacementStarted = true;
      const mvCmd = items.map((item) => `mv ${shellQuote(item.tempCert)} ${shellQuote(item.destCert)} && mv ${shellQuote(item.tempKey)} ${shellQuote(item.destKey)}`).join(" && ");
      await this.exec(client, mvCmd, commandOptions);
      await this.exec(client, target.validationCommand, commandOptions);
      await this.exec(client, target.reloadCommand, commandOptions);
      if (target.healthCheckCommand) await this.exec(client, target.healthCheckCommand, commandOptions);
      return { targetId: target.id, ok: true, exitCode: 0 };
    } catch (error) {
      let message = sanitizeError((error as Error).message);
      if (replacementStarted) {
        try {
          const restoreCmds = items.flatMap((item) => [
            restoreCommand(item.destCert, item.backupCert, item.missingCert),
            restoreCommand(item.destKey, item.backupKey, item.missingKey),
          ]).join(" && ");
          await this.exec(client, `${restoreCmds} && ${target.validationCommand} && ${target.reloadCommand}`, commandOptions);
          message = `${message}; previous certificate restored`;
        } catch (rollbackError) {
          preserveArtifacts = true;
          message = `${message}; rollback failed: ${sanitizeError((rollbackError as Error).message)}`;
        }
      }
      return { targetId: target.id, ok: false, error: message };
    } finally {
      if (!preserveArtifacts) try { await this.exec(client, `rm -rf -- ${shellQuote(tempRoot)}`, commandOptions); } catch { /* best effort cleanup */ }
      client.end();
    }
  }

  private exec(client: Client, command: string, options: { signal?: AbortSignal; timeoutMs: number }): Promise<string> {
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) { reject(new Error("cancelled")); return; }
      let activeStream: ClientChannel | undefined;
      let finished = false;
      const finish = (callback: () => void) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
        callback();
      };
      const abort = () => { activeStream?.destroy(); finish(() => reject(new Error("cancelled"))); };
      const timeout = setTimeout(() => { activeStream?.destroy(); finish(() => reject(new Error(`remote command timed out after ${options.timeoutMs}ms`))); }, options.timeoutMs);
      options.signal?.addEventListener("abort", abort, { once: true });
      client.exec(`PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; export PATH; ${command}`, (error, stream) => {
        if (error) { finish(() => reject(error)); return; }
        activeStream = stream;
        let output = "";
        stream.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        stream.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        stream.on("close", (code: number) => { code === 0 ? finish(() => resolve(output)) : finish(() => reject(new Error(`remote command exited with code ${code}`))); });
      });
    });
  }

  private connectConfig(target: DeployTarget): ConnectConfig {
    return {
      host: target.host,
      port: target.port,
      username: target.username,
      privateKey: this.options.privateKey,
      readyTimeout: target.timeoutSeconds * 1000,
      hostHash: "sha256",
      hostVerifier: (hash: string) => Boolean(target.hostFingerprint && normalizeFingerprint(hash) === normalizeFingerprint(target.hostFingerprint)),
    };
  }
}

export function normalizeFingerprint(fp?: string | null): string {
  if (!fp) return "";
  let clean = fp.trim();
  const shaMatch = clean.match(/SHA256:([A-Za-z0-9+/=]+)/i);
  if (shaMatch) {
    clean = shaMatch[1];
  } else {
    clean = clean.replace(/^SHA256:/i, "").trim();
  }
  if (/^[0-9a-fA-F]{64}$/.test(clean)) return clean.toLowerCase();
  try {
    const buf = Buffer.from(clean, "base64");
    if (buf.length === 32) return buf.toString("hex").toLowerCase();
  } catch {}
  return clean.toLowerCase();
}

export function fingerprintErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/timed out/i.test(message)) return "SSH handshake timed out; check host, port, firewall, and SSH service";
  if (/ECONNREFUSED/i.test(message)) return "SSH port refused the connection; check the port and SSH service";
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) return "SSH hostname could not be resolved from the container";
  return "SSH handshake failed; check host, port, and network access from the container";
}

function sanitizeError(message: string) { return message.replace(/(pass(word)?|private.?key|authorization|token)\s*[:=]\s*[^\s]+/gi, "$1=[REDACTED]").slice(0, 500); }

function backupCommand(path: string, backup: string, missing: string) { return `if test -e ${shellQuote(path)}; then cp -p ${shellQuote(path)} ${shellQuote(backup)}; else touch ${shellQuote(missing)}; fi`; }

function restoreCommand(path: string, backup: string, missing: string) { return `if test -e ${shellQuote(missing)}; then rm -f -- ${shellQuote(path)}; else cp -p ${shellQuote(backup)} ${shellQuote(path)}; fi`; }

function shellQuote(value: string) { return `'${value.replace(/'/g, "'\\''")}'`; }
