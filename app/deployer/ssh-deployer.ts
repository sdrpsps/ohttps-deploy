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
    try { validateCommand(target.reloadCommand); if (target.healthCheckCommand) validateCommand(target.healthCheckCommand); } catch (error) { return { targetId: target.id, ok: false, error: (error as Error).message }; }
    if (options.dryRun) return { targetId: target.id, ok: true };
    if (options.signal?.aborted) return { targetId: target.id, ok: false, error: "cancelled" };
    const cert = await readFile(material.certificatePath); const key = await readFile(material.privateKeyPath);
    const { Client: SshClient } = await import("ssh2");
    const client = this.options.clientFactory?.() ?? new SshClient();
    const tempRoot = `/tmp/ohttps-deploy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      await new Promise<void>((resolve, reject) => { client.once("ready", () => resolve()).once("error", reject).connect(this.connectConfig(target)); });
      await this.exec(client, `mkdir -p ${shellQuote(tempRoot)}`, options.signal);
      await new Promise<void>((resolve, reject) => client.sftp((error, sftp) => {
        if (error || !sftp) return reject(error ?? new Error("sftp unavailable"));
        sftp.fastPut(material.certificatePath, posix.join(tempRoot, "fullchain.pem"), (putError) => {
          if (putError) return reject(putError);
          sftp.fastPut(material.privateKeyPath, posix.join(tempRoot, "privkey.pem"), (keyError) => keyError ? reject(keyError) : resolve());
        });
      }));
      await this.exec(client, `chmod 0644 ${shellQuote(posix.join(tempRoot, "fullchain.pem"))} && chmod 0600 ${shellQuote(posix.join(tempRoot, "privkey.pem"))} && test -s ${shellQuote(posix.join(tempRoot, "fullchain.pem"))} && test -s ${shellQuote(posix.join(tempRoot, "privkey.pem"))}`, options.signal);
      await this.exec(client, `mv ${shellQuote(posix.join(tempRoot, "fullchain.pem"))} ${shellQuote(target.certPath)} && mv ${shellQuote(posix.join(tempRoot, "privkey.pem"))} ${shellQuote(target.privateKeyPath)}`, options.signal);
      await this.exec(client, target.reloadCommand, options.signal);
      if (target.healthCheckCommand) await this.exec(client, target.healthCheckCommand, options.signal);
      return { targetId: target.id, ok: true, exitCode: 0 };
    } catch (error) { return { targetId: target.id, ok: false, error: sanitizeError((error as Error).message) }; }
    finally { try { await this.exec(client, `rm -rf -- ${shellQuote(tempRoot)}`); } catch { /* best effort cleanup */ } client.end(); }
  }

  private exec(client: Client, command: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new Error("cancelled")); return; }
      let activeStream: ClientChannel | undefined;
      const abort = () => { activeStream?.destroy(); reject(new Error("cancelled")); };
      signal?.addEventListener("abort", abort, { once: true });
      client.exec(command, (error, stream) => {
        if (error) { signal?.removeEventListener("abort", abort); reject(error); return; }
        activeStream = stream;
        let output = "";
        stream.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        stream.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        stream.on("close", (code: number) => { signal?.removeEventListener("abort", abort); code === 0 ? resolve(output) : reject(new Error(`remote command exited with code ${code}`)); });
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

function sanitizeError(message: string) { return message.replace(/(pass(word)?|private.?key|authorization|token)\s*[:=]\s*[^\s]+/gi, "$1=[REDACTED]").slice(0, 500); }

function shellQuote(value: string) { return `'${value.replace(/'/g, "'\\''")}'`; }
