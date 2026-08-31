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
  const { normalizeFingerprint } = await import("../app/deployer/ssh-deployer");
  assert.equal(normalizeFingerprint("SHA256:MsB48clb9+ArTrw8In3WYXa2nA6NrouWVH7TC4dTxFU"), "32c078f1c95bf7e02b4ebc3c227dd66176b69c0e8dae8b96547ed30b8753c455");
  assert.equal(normalizeFingerprint("32c078f1c95bf7e02b4ebc3c227dd66176b69c0e8dae8b96547ed30b8753c455"), "32c078f1c95bf7e02b4ebc3c227dd66176b69c0e8dae8b96547ed30b8753c455");
  assert.equal(normalizeFingerprint(""), "");
  console.log("worker tests passed");
}

run();
