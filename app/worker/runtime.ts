import { eq } from "drizzle-orm";
import { databaseReady, db } from "../db";
import { deployments, settings } from "../db/schema";
import { ensureAdmin } from "../lib/auth";
import { createLogger } from "../lib/logger";
import { loadRuntimeSettings } from "../lib/runtime-settings";
import { redactSensitive } from "../domain/ohttps-client";
import { workerAdapters, workerConfig, workerContext } from "./context";
import { reconcileAutoDeployments, recoverInterruptedTasks } from "./automation";
import { processSyncQueue, scanCertificates } from "./certificate-sync";
import { processDeployment, failDeployment } from "./deployments";
import { deliverPendingNotifications } from "./notifications";
import { WorkerLease } from "./lease";
import { archiveExpiredRecords } from "./archive";
import { startHeartbeat } from "./heartbeat";
import { nextScanAt } from "./schedule";

const logger = createLogger("worker");

let stopping = false;
let stopHeartbeat: (() => void) | undefined;
let wakeWorker: (() => void) | undefined;
let leaseController: AbortController | undefined;

function sleep(ms: number): Promise<void> {
  if (stopping) return Promise.resolve();
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const onWake = () => {
      if (timer) clearTimeout(timer);
      wakeWorker = undefined;
      resolve();
    };
    wakeWorker = onWake;
    timer = setTimeout(onWake, ms);
  });
}

const stop = (signal: string) => {
  stopping = true;
  leaseController?.abort();
  stopHeartbeat?.();
  wakeWorker?.();
  logger.info("worker stopping", { signal });
};
const onSigterm = () => stop("SIGTERM");
const onSigint = () => stop("SIGINT");

let polling = false;
let scheduledScanAt = 0;
const workerLease = new WorkerLease();
async function recordHeartbeat() {
  await db.insert(settings).values({ key: "worker_heartbeat", value: new Date(workerAdapters.now()).toISOString() }).onConflictDoUpdate({ target: settings.key, set: { value: new Date(workerAdapters.now()).toISOString(), updatedAt: new Date(workerAdapters.now()) } });
}
export async function pollQueue() {
  if (polling || stopping) return;
  polling = true;
  let leaseLost = false;
  let leaseHeld = false;
  let renewLease: NodeJS.Timeout | undefined;
  try {
    leaseHeld = await workerLease.acquire();
    if (!leaseHeld) return;
    leaseController = new AbortController();
    workerContext.leaseSignal = leaseController.signal;
    const loseLease = () => { leaseLost = true; stopping = true; leaseController?.abort(); };
    renewLease = setInterval(() => {
      void workerLease.renew().then((held) => { if (!held) loseLease(); }).catch(loseLease);
    }, 10_000);
    const assertLease = () => { if (leaseLost) stopping = true; if (leaseLost) throw new Error("worker lease lost"); };
    workerContext.runtimeSettings = await loadRuntimeSettings();
    assertLease();
    await recoverInterruptedTasks();
    await recordHeartbeat();
    const now = workerAdapters.now();
    const next = nextScanAt(scheduledScanAt, now, workerContext.runtimeSettings.schedulerIntervalMinutes);
    if (next !== scheduledScanAt) {
      await scanCertificates();
      scheduledScanAt = next;
    }
    assertLease();
    await processSyncQueue(assertLease);
    assertLease();
    await reconcileAutoDeployments(new Date(workerAdapters.now()));
    assertLease();
    const queued = await db.select().from(deployments).where(eq(deployments.status, "queued")).orderBy(deployments.createdAt).limit(10);
    for (const deployment of queued) {
      assertLease();
      try { await processDeployment(deployment.id); }
      catch (error) { await failDeployment(deployment.id, redactSensitive(String(error), workerContext.runtimeSettings.ohttpsApiKey)); }
    }
    assertLease();
    await deliverPendingNotifications();
    await purgeExpiredRecords();
  } catch (error) { logger.error("queue poll failed", { error: String(error) }); }
  finally {
    if (renewLease) clearInterval(renewLease);
    if (leaseHeld) await workerLease.release().catch((error) => logger.warn("worker lease release failed", { error: String(error) }));
    leaseController = undefined;
    workerContext.leaseSignal = undefined;
    polling = false;
  }
}

async function purgeExpiredRecords() {
  const cutoff = new Date(workerAdapters.now() - workerContext.runtimeSettings.logRetentionDays * 24 * 60 * 60 * 1000);
  await archiveExpiredRecords(cutoff, workerConfig.LOG_ARCHIVE_DIR);
}

export async function runWorker() {
  process.on("SIGTERM", onSigterm);
  process.on("SIGINT", onSigint);
  try {
    await databaseReady;
    const password = await ensureAdmin();
    logger.info("worker started");
    if (password) logger.info("initial admin password generated", { username: "admin", password });
  } catch (error) {
    logger.error("admin bootstrap failed", { error: String(error) });
  }
  stopHeartbeat = startHeartbeat(recordHeartbeat, 30_000, (error) => logger.warn("worker heartbeat failed", { error: String(error) }));
  try {
    while (!stopping) {
      await pollQueue();
      if (stopping) break;
      await sleep(3_000);
    }
  } finally {
    stopHeartbeat?.();
    stopHeartbeat = undefined;
    process.off("SIGTERM", onSigterm);
    process.off("SIGINT", onSigint);
  }
}

