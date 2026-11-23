import assert from "node:assert/strict";
import { SSHDeployer, validateCommand } from "../app/deployer";
import { fingerprintErrorMessage, normalizeFingerprint } from "../app/deployer/ssh-deployer";
import { POST as fetchFingerprint } from "../app/api/servers/fingerprint/route";

type Mode = "config-failure" | "timeout" | "upload-timeout";

async function run() {
  // 1. Deployer rollback, timeouts, and multi-cert batched backupCommand
  const configFailure = await deployWith("config-failure");
  assert.equal(configFailure.result.ok, false);
  assert.match(configFailure.result.error ?? "", /previous certificate restored/);
  assert.ok(configFailure.commands.some((command) => command.includes("sudo -n nginx -t")));
  assert.ok(configFailure.commands.some((command) => command.includes("mkdir -p -- '/etc/nginx/ssl'")));
  assert.ok(configFailure.commands.some((command) => command.includes("previous-fullchain.pem")));
  assert.ok(configFailure.progressPhases.includes("rollback"));
  assert.ok(configFailure.progressPhases.includes("rolled_back"));

  const timeout = await deployWith("timeout");
  assert.equal(timeout.result.ok, false);
  assert.match(timeout.result.error ?? "", /remote command timed out/);
  assert.equal(timeout.destroyed, true);

  const uploadTimeout = await deployWith("upload-timeout");
  assert.equal(uploadTimeout.result.ok, false);
  assert.match(uploadTimeout.result.error ?? "", /SFTP upload timed out/);

  const multiDeploy = await deployMulti();
  assert.equal(multiDeploy.result.ok, true);
  assert.ok(multiDeploy.commands.some((cmd) => cmd.includes("fullchain-1.pem")));
  assert.ok(multiDeploy.commands.some((cmd) => cmd.includes("sudo -n nginx -s reload")));
  const backupExecs = multiDeploy.commands.filter((cmd) => cmd.includes("previous-fullchain"));
  assert.equal(backupExecs.length, 1, "All backupCommand invocations should be batched into one exec call");
  assert.ok(backupExecs[0].includes("previous-fullchain.pem"));
  assert.ok(backupExecs[0].includes("previous-fullchain-1.pem"));
  assert.deepEqual(multiDeploy.progressPhases, [
    "connecting",
    "connected",
    "pre_validating",
    "pre_validated",
    "uploading",
    "uploaded",
    "replacing",
    "replaced",
    "testing",
    "tested",
    "reloading",
    "reloaded",
  ]);

  // 2. Command validation & host fingerprint normalization / lookup
  assert.doesNotThrow(() => validateCommand("nginx -t"));
  assert.throws(() => validateCommand("nginx -s reload; rm -rf /"), /metacharacters/);
  assert.equal(normalizeFingerprint("SHA256:MsB48clb9+ArTrw8In3WYXa2nA6NrouWVH7TC4dTxFU"), "32c078f1c95bf7e02b4ebc3c227dd66176b69c0e8dae8b96547ed30b8753c455");
  assert.equal(normalizeFingerprint("256 SHA256:MsB48clb9+ArTrw8In3WYXa2nA6NrouWVH7TC4dTxFU host (ED25519)"), "32c078f1c95bf7e02b4ebc3c227dd66176b69c0e8dae8b96547ed30b8753c455");
  assert.equal(normalizeFingerprint("MsB48clb9+ArTrw8In3WYXa2nA6NrouWVH7TC4dTxFU"), "32c078f1c95bf7e02b4ebc3c227dd66176b69c0e8dae8b96547ed30b8753c455");
  assert.equal(normalizeFingerprint("32c078f1c95bf7e02b4ebc3c227dd66176b69c0e8dae8b96547ed30b8753c455"), "32c078f1c95bf7e02b4ebc3c227dd66176b69c0e8dae8b96547ed30b8753c455");
  assert.equal(normalizeFingerprint(""), "");

  const fakeClient = {
    once(_event: string, _listener: unknown) { return this; },
    connect(config: { username?: string; hostVerifier?: (hash: string) => boolean }) {
      assert.equal(config.username, "fingerprint");
      config.hostVerifier?.("server-key-hash");
    },
    end() {},
  };
  const fingerprint = await new SSHDeployer({ privateKey: "", clientFactory: () => fakeClient as never }).getHostFingerprint({
    host: "server.example.com",
    port: 22,
    timeoutSeconds: 1,
  });
  assert.equal(fingerprint, "SHA256:server-key-hash");

  // 3. Fingerprint API input validation & error formatting
  const fpRes = await fetchFingerprint(
    new Request("http://localhost/api/servers/fingerprint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: "server.example.com", port: 0 }),
    })
  );
  assert.equal(fpRes.status, 400);
  assert.equal((await fpRes.json()).error.code, "INVALID_INPUT");
  assert.match(fingerprintErrorMessage(new Error("connect ECONNREFUSED 192.0.2.1:22")), /port refused/);
  assert.match(fingerprintErrorMessage(new Error("getaddrinfo ENOTFOUND host")), /could not be resolved/);
  assert.match(fingerprintErrorMessage(new Error("SSH host-key lookup timed out")), /timed out/);

  console.log("SSH deployer tests passed");
}

async function deployMulti() {
  const commands: string[] = [];
  const progressPhases: string[] = [];
  const listeners: Record<string, () => void> = {};
  const client = {
    once(event: string, listener: () => void) { listeners[event] = listener; return this; },
    connect() { listeners.ready?.(); },
    sftp(callback: (error: null, sftp: { fastPut: (_source: string, _destination: string, done: (error?: Error) => void) => void }) => void) {
      callback(null, { fastPut: (_source, _destination, done) => done() });
    },
    exec(command: string, callback: (error: null, stream: { stderr: { on: () => void }; on: (event: string, listener: (code: number) => void) => void; destroy: () => void }) => void) {
      commands.push(command);
      callback(null, {
        stderr: { on: () => undefined },
        on: (event, listener) => { if (event === "close") queueMicrotask(() => listener(0)); },
        destroy: () => {},
      });
    },
    end() {},
  };
  const result = await new SSHDeployer({ privateKey: "test", clientFactory: () => client as never }).deploy({
    id: "server-1", host: "server.example.com", port: 22, username: "cert", hostFingerprint: "SHA256:test",
    certPath: "/etc/nginx/ssl/fullchain.pem", privateKeyPath: "/etc/nginx/ssl/privkey.pem", validationCommand: "sudo -n nginx -t", reloadCommand: "sudo -n nginx -s reload", timeoutSeconds: 0.1,
  }, [
    { domain: "a.example.com", certificatePath: "tests/fixtures/test-cert.pem", privateKeyPath: "tests/fixtures/test-key.pem" },
    { domain: "b.example.com", certificatePath: "tests/fixtures/test-cert.pem", privateKeyPath: "tests/fixtures/test-key.pem" },
  ], {
    onProgress: (phase) => { progressPhases.push(phase); },
  });
  return { result, commands, progressPhases };
}

async function deployWith(mode: Mode) {
  const commands: string[] = [];
  const progressPhases: string[] = [];
  let destroyed = false;
  let nginxChecks = 0;
  const listeners: Record<string, () => void> = {};
  const client = {
    once(event: string, listener: () => void) { listeners[event] = listener; return this; },
    connect() { listeners.ready?.(); },
    sftp(callback: (error: null, sftp: { fastPut: (_source: string, _destination: string, done: (error?: Error) => void) => void }) => void) {
      callback(null, { fastPut: (_source, _destination, done) => { if (mode !== "upload-timeout") done(); } });
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
  }, { certificatePath: "tests/fixtures/test-cert.pem", privateKeyPath: "tests/fixtures/test-key.pem" }, {
    onProgress: (phase) => { progressPhases.push(phase); },
  });
  return { result, commands, destroyed, progressPhases };
}

run();
