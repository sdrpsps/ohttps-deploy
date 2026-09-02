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

  async deploy(target: DeployTarget, material: DeploymentMaterial, options: { dryRun?: boolean; signal?: AbortSignal } = {}): Promise<DeploymentResult> {
    try { validateCommand(target.validationCommand); validateCommand(target.reloadCommand); if (target.healthCheckCommand) validateCommand(target.healthCheckCommand); } catch (error) { return { targetId: target.id, ok: false, error: (error as Error).message }; }
    if (options.dryRun) return { targetId: target.id, ok: true };
    if (options.signal?.aborted) return { targetId: target.id, ok: false, error: "cancelled" };
    await Promise.all([readFile(material.certificatePath), readFile(material.privateKeyPath)]);
    const { Client: SshClient } = await import("ssh2");
    const client = this.options.clientFactory?.() ?? new SshClient();
    const tempRoot = `/tmp/ohttps-deploy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const backupCert = posix.join(tempRoot, "previous-fullchain.pem");
    const backupKey = posix.join(tempRoot, "previous-privkey.pem");
    const missingCert = posix.join(tempRoot, "fullchain-was-missing");
    const missingKey = posix.join(tempRoot, "privkey-was-missing");
    const commandOptions = { signal: options.signal, timeoutMs: target.timeoutSeconds * 1000 };
    let replacementStarted = false;
    let preserveArtifacts = false;
    try {
      await new Promise<void>((resolve, reject) => { client.once("ready", () => resolve()).once("error", reject).connect(this.connectConfig(target)); });
      await this.exec(client, target.validationCommand, commandOptions);
      await this.exec(client, `mkdir -p ${shellQuote(tempRoot)}`, commandOptions);
      await new Promise<void>((resolve, reject) => client.sftp((error, sftp) => {
        if (error || !sftp) return reject(error ?? new Error("sftp unavailable"));
        sftp.fastPut(material.certificatePath, posix.join(tempRoot, "fullchain.pem"), (putError) => {
          if (putError) return reject(putError);
          sftp.fastPut(material.privateKeyPath, posix.join(tempRoot, "privkey.pem"), (keyError) => keyError ? reject(keyError) : resolve());
        });
      }));
      await this.exec(client, `chmod 0644 ${shellQuote(posix.join(tempRoot, "fullchain.pem"))} && chmod 0600 ${shellQuote(posix.join(tempRoot, "privkey.pem"))} && test -s ${shellQuote(posix.join(tempRoot, "fullchain.pem"))} && test -s ${shellQuote(posix.join(tempRoot, "privkey.pem"))}`, commandOptions);
      await this.exec(client, `mkdir -p -- ${[...new Set([posix.dirname(target.certPath), posix.dirname(target.privateKeyPath)])].map(shellQuote).join(" ")}`, commandOptions);
      await this.exec(client, backupCommand(target.certPath, backupCert, missingCert), commandOptions);
      await this.exec(client, backupCommand(target.privateKeyPath, backupKey, missingKey), commandOptions);
      replacementStarted = true;
      await this.exec(client, `mv ${shellQuote(posix.join(tempRoot, "fullchain.pem"))} ${shellQuote(target.certPath)} && mv ${shellQuote(posix.join(tempRoot, "privkey.pem"))} ${shellQuote(target.privateKeyPath)}`, commandOptions);
      await this.exec(client, target.validationCommand, commandOptions);
      await this.exec(client, target.reloadCommand, commandOptions);
      if (target.healthCheckCommand) await this.exec(client, target.healthCheckCommand, commandOptions);
      return { targetId: target.id, ok: true, exitCode: 0 };
    } catch (error) {
      let message = sanitizeError((error as Error).message);
      if (replacementStarted) {
        try {
          await this.exec(client, `${restoreCommand(target.certPath, backupCert, missingCert)} && ${restoreCommand(target.privateKeyPath, backupKey, missingKey)} && ${target.validationCommand} && ${target.reloadCommand}`, commandOptions);
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
  const clean = fp.trim();
  if (/^[0-9a-fA-F]{64}$/.test(clean)) return clean.toLowerCase();
  const withoutPrefix = clean.replace(/^SHA256:/i, "").replace(/^sha256:/i, "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(withoutPrefix)) return withoutPrefix.toLowerCase();
  try {
    const buf = Buffer.from(withoutPrefix, "base64");
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
