import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import type { Client, ConnectConfig } from "ssh2";
import { Deployer, DeploymentMaterial, DeployTarget, DeploymentResult, validateCommand } from "./deployer";

type SshFactory = () => Client;

/** SSH push deployer: upload temp files, validate, atomically replace, reload, clean up. */
export class SSHDeployer implements Deployer {
  constructor(private readonly options: { privateKey: string | Buffer; knownHosts?: Record<string, string>; clientFactory?: SshFactory } ) {}

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
      await this.exec(client, `mkdir -p ${tempRoot}`);
      await new Promise<void>((resolve, reject) => client.sftp((error, sftp) => {
        if (error || !sftp) return reject(error ?? new Error("sftp unavailable"));
        sftp.fastPut(material.certificatePath, posix.join(tempRoot, "fullchain.pem"), (putError) => {
          if (putError) return reject(putError);
          sftp.fastPut(material.privateKeyPath, posix.join(tempRoot, "privkey.pem"), (keyError) => keyError ? reject(keyError) : resolve());
        });
      }));
      await this.exec(client, `chmod 0644 ${tempRoot}/fullchain.pem && chmod 0600 ${tempRoot}/privkey.pem && test -s ${tempRoot}/fullchain.pem && test -s ${tempRoot}/privkey.pem`);
      await this.exec(client, `mv ${tempRoot}/fullchain.pem ${target.certPath} && mv ${tempRoot}/privkey.pem ${target.privateKeyPath}`);
      await this.exec(client, target.reloadCommand);
      if (target.healthCheckCommand) await this.exec(client, target.healthCheckCommand);
      return { targetId: target.id, ok: true, exitCode: 0 };
    } catch (error) { return { targetId: target.id, ok: false, error: sanitizeError((error as Error).message) }; }
    finally { try { await this.exec(client, `rm -rf ${tempRoot}`); } catch { /* best effort cleanup */ } client.end(); }
  }

  private exec(client: Client, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      client.exec(command, (error, stream) => {
        if (error) { reject(error); return; }
        let output = "";
        stream.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        stream.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        stream.on("close", (code: number) => code === 0 ? resolve(output) : reject(new Error(`remote command exited with code ${code}`)));
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
