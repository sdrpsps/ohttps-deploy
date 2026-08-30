import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import { loadConfig } from "./lib/config";
import { createLogger } from "./lib/logger";
import { db } from "./db";
import { certificateVersions, deployments, deploymentTargets, logs, servers } from "./db/schema";
import { SSHDeployer } from "./deployer";

const config = loadConfig();
const logger = createLogger("worker");
logger.info("worker started", { intervalMinutes: config.SCHEDULER_INTERVAL_MINUTES });

let stopping = false;
const stop = (signal: string) => { stopping = true; logger.info("worker stopping", { signal }); };
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

let polling = false;
async function pollQueue() {
  if (polling || stopping) return;
  polling = true;
  try {
    const queued = await db.select().from(deployments).where(eq(deployments.status, "queued")).limit(10);
    for (const deployment of queued) await processDeployment(deployment.id);
  } catch (error) { logger.error("queue poll failed", { error: String(error) }); }
  finally { polling = false; }
}

async function processDeployment(deploymentId: string) {
  const [deployment] = await db.update(deployments).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(and(eq(deployments.id, deploymentId), eq(deployments.status, "queued"))).returning();
  if (!deployment) return;
  const targets = await db.select({ id: deploymentTargets.id, serverId: servers.id, name: servers.name, host: servers.host, port: servers.port, username: servers.username, hostFingerprint: servers.hostFingerprint, certPath: servers.certPath, privateKeyPath: servers.privateKeyPath, reloadCommand: servers.reloadCommand, healthCheckCommand: servers.healthCheckCommand, timeoutSeconds: servers.timeoutSeconds }).from(deploymentTargets).innerJoin(servers, eq(deploymentTargets.serverId, servers.id)).where(eq(deploymentTargets.deploymentId, deploymentId));
  const [version] = await db.select({ certPath: certificateVersions.certPath, privateKeyPath: certificateVersions.privateKeyPath }).from(certificateVersions).where(eq(certificateVersions.id, deployment.certificateVersionId)).limit(1);
  if (!version) { await failDeployment(deploymentId, "certificate version not found"); return; }
  let key: Buffer;
  try { key = await readFile(config.SSH_PRIVATE_KEY_PATH); } catch { await failDeployment(deploymentId, "shared SSH private key unavailable"); return; }
  const results = await Promise.all(targets.map(async (target, index) => {
    await db.update(deploymentTargets).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(eq(deploymentTargets.id, target.id));
    const result = await new SSHDeployer({ privateKey: key }).deploy(target, { certificatePath: version.certPath, privateKeyPath: version.privateKeyPath });
    await db.update(deploymentTargets).set({ status: result.ok ? "succeeded" : "failed", exitCode: result.exitCode ?? null, errorSummary: result.error ?? null, finishedAt: new Date(), updatedAt: new Date() }).where(eq(deploymentTargets.id, target.id));
    await db.insert(logs).values({ id: randomUUID(), deploymentId, targetId: target.id, sequence: index + 1, level: result.ok ? "info" : "error", message: result.ok ? `${target.name} deployed successfully` : `${target.name} deployment failed: ${result.error ?? "unknown error"}` });
    return result;
  }));
  const failed = results.filter((result) => !result.ok).length;
  const status = failed === 0 ? "succeeded" : failed === results.length || deployment.failurePolicy === "all_success" ? "failed" : "partial";
  await db.update(deployments).set({ status, finishedAt: new Date(), errorSummary: failed ? `${failed} target(s) failed` : null, updatedAt: new Date() }).where(eq(deployments.id, deploymentId));
}

async function failDeployment(id: string, message: string) {
  await db.update(deployments).set({ status: "failed", errorSummary: message, finishedAt: new Date(), updatedAt: new Date() }).where(eq(deployments.id, id));
  await db.insert(logs).values({ id: randomUUID(), deploymentId: id, sequence: 1, level: "error", message });
}

async function run() {
  await pollQueue();
  const timer = setInterval(() => { void pollQueue(); }, Math.max(15_000, config.SCHEDULER_INTERVAL_MINUTES * 60_000));
  while (!stopping) await new Promise((resolve) => setTimeout(resolve, 1_000));
  clearInterval(timer);
}

run().catch((error) => { logger.error("worker crashed", { error: String(error) }); process.exitCode = 1; });
