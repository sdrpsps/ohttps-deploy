import assert from "node:assert/strict";
import { SSHDeployer } from "../app/deployer";

type Mode = "config-failure" | "timeout";

async function run() {
  const configFailure = await deployWith("config-failure");
  assert.equal(configFailure.result.ok, false);
  assert.match(configFailure.result.error ?? "", /previous certificate restored/);
  assert.ok(configFailure.commands.some((command) => command.includes("sudo -n nginx -t")));
  assert.ok(configFailure.commands.some((command) => command.includes("mkdir -p -- '/etc/nginx/ssl'")));
  assert.ok(configFailure.commands.some((command) => command.includes("previous-fullchain.pem")));

  const timeout = await deployWith("timeout");
  assert.equal(timeout.result.ok, false);
  assert.match(timeout.result.error ?? "", /remote command timed out/);
  assert.equal(timeout.destroyed, true);
  console.log("SSH deployer tests passed");
}

async function deployWith(mode: Mode) {
  const commands: string[] = [];
  let destroyed = false;
  let nginxChecks = 0;
  const listeners: Record<string, () => void> = {};
  const client = {
    once(event: string, listener: () => void) { listeners[event] = listener; return this; },
    connect() { listeners.ready?.(); },
    sftp(callback: (error: null, sftp: { fastPut: (_source: string, _destination: string, done: (error?: Error) => void) => void }) => void) {
      callback(null, { fastPut: (_source, _destination, done) => done() });
    },
    exec(command: string, callback: (error: null, stream: { stderr: { on: () => void }; on: (event: string, listener: (code: number) => void) => void; destroy: () => void }) => void) {
      commands.push(command);
      if (command.includes("sudo -n nginx -t")) nginxChecks += 1;
      const hangs = mode === "timeout" && command.includes("sudo -n nginx -t") && nginxChecks === 2;
      const exitCode = mode === "config-failure" && command.includes("sudo -n nginx -t") && nginxChecks === 2 ? 1 : 0;
      callback(null, {
        stderr: { on: () => undefined },
        on: (event, listener) => { if (event === "close" && !hangs) queueMicrotask(() => listener(exitCode)); },
        destroy: () => { destroyed = true; },
      });
    },
    end() {},
  };
  const result = await new SSHDeployer({ privateKey: "test", clientFactory: () => client as never }).deploy({
    id: "server-1", host: "server.example.com", port: 22, username: "cert", hostFingerprint: "SHA256:test",
    certPath: "/etc/nginx/ssl/fullchain.pem", privateKeyPath: "/etc/nginx/ssl/privkey.pem", validationCommand: "sudo -n nginx -t", reloadCommand: "sudo -n nginx -s reload", timeoutSeconds: 0.01,
  }, { certificatePath: "tests/fixtures/test-cert.pem", privateKeyPath: "tests/fixtures/test-key.pem" });
  return { result, commands, destroyed };
}

run();
