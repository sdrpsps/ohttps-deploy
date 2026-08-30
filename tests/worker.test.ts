import assert from "node:assert/strict";
import { InMemoryTaskLock, TaskExecutor } from "../app/worker/executor";
import { redactSensitive } from "../app/domain/ohttps-client";
import { SSHDeployer, validateCommand } from "../app/deployer";

async function run() {
  const executor = new TaskExecutor(new InMemoryTaskLock());
  const result = await executor.execute(async ({ taskId }) => `${taskId}:ok`, { taskId: "task-1" });
  assert.equal(result, "task-1:ok");

  const controller = new AbortController();
  await assert.rejects(
    executor.execute(async ({ signal }) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (signal.aborted) throw new Error("aborted");
      return "unexpected";
    }, { taskId: "task-2", timeoutMs: 5 }),
    /cancelled or timed out/,
  );
  controller.abort();
  assert.equal(redactSensitive("Authorization: Bearer token, apiKey=secret"), "Authorization=[REDACTED], apiKey=[REDACTED]");
  assert.doesNotThrow(() => validateCommand("nginx -t"));
  assert.throws(() => validateCommand("nginx -s reload; rm -rf /"), /metacharacters/);
  const dryRun = await new SSHDeployer({ privateKey: "test" }).deploy({ id: "server-1", host: "host", port: 22, username: "admin", hostFingerprint: "sha256:x", certPath: "/etc/nginx/fullchain.pem", privateKeyPath: "/etc/nginx/privkey.pem", reloadCommand: "nginx -s reload", timeoutSeconds: 10 }, { certificatePath: "missing", privateKeyPath: "missing" }, { dryRun: true });
  assert.equal(dryRun.ok, true);
  console.log("worker tests passed");
}

run();
