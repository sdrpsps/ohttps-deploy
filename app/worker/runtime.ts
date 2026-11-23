import { eq, inArray } from "drizzle-orm";
import { databaseReady, db } from "../db";
import { deployments, deploymentTargets, settings } from "../db/schema";
import { ensureAdmin } from "../lib/auth";
import { createLogger } from "../lib/logger";
import { loadRuntimeSettings } from "../lib/runtime-settings";
import { startWorkerControlServer, type WorkerControlServer } from "../lib/worker-signal";
import { redactSensitive } from "../domain/ohttps-client";
import { workerAdapters, workerConfig, workerContext } from "./context";
import { reconcileAutoDeployments, recoverInterruptedTasks } from "./automation";
import { processSyncJob, scanCertificates, selectEligibleQueuedSyncJobs } from "./certificate-sync";
import { cancelRunningDeployment, failDeployment, processDeployment } from "./deployments";
import { InMemoryTaskLock, TaskExecutor } from "./executor";
import { deliverPendingNotifications } from "./notifications";
import { WorkerLease } from "./lease";
import { archiveExpiredRecords, pruneCertificateVersionDirectories } from "./archive";
import { startHeartbeat } from "./heartbeat";
import { nextScanAt } from "./schedule";

const logger = createLogger("worker");

const MAX_CONCURRENT_SYNC_JOBS = 3;
const MAX_CONCURRENT_DEPLOYMENTS = 4;
const LEASE_RENEW_INTERVAL_MS = 10_000;
const IMMEDIATE_FALLBACK_POLL_MS = 5_000;
const SCAN_CHECK_INTERVAL_MS = 15_000;
const BACKGROUND_INTERVAL_MS = 10_000;
const LEASE_RETRY_INTERVAL_MS = 3_000;

let stopping = false;
let stopHeartbeat: (() => void) | undefined;
let controlServer: WorkerControlServer | undefined;

let leaseHeld = false;
let leaseLost = false;
let leaseController: AbortController | undefined;
let renewLeaseTimer: NodeJS.Timeout | undefined;

let wakePending = false;
let immediateWakeResolver: (() => void) | undefined;
const channelWakeResolvers = new Set<() => void>();

let dispatching = false;
let polling = false;
let scheduledScanAt = 0;

const workerLease = new WorkerLease();
const taskLock = new InMemoryTaskLock();
const taskExecutor = new TaskExecutor(taskLock);

const inFlightSyncTasks = new Set<Promise<void>>();
const inFlightDeploymentTasks = new Set<Promise<void>>();
const inFlightTaskIds = new Set<string>();
const reservedLockKeys = new Set<string>();

function wakeChannels() {
  wakePending = true;
  immediateWakeResolver?.();
  for (const resolver of [...channelWakeResolvers]) {
    resolver();
  }
}

export function wakeWorker() {
  wakePending = true;
  immediateWakeResolver?.();
}

export function cancelWorkerDeployment(deploymentId: string): boolean {
  const cancelledExecutor = taskExecutor.cancel(deploymentId);
  const cancelledRunning = cancelRunningDeployment(deploymentId);
  wakeWorker();
  return cancelledExecutor || cancelledRunning;
}

function waitForImmediateWake(ms: number): Promise<void> {
  if (stopping || leaseLost || !leaseHeld) return Promise.resolve();
  if (wakePending) {
    wakePending = false;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const onWake = () => {
      if (timer) clearTimeout(timer);
      if (immediateWakeResolver === onWake) immediateWakeResolver = undefined;
      wakePending = false;
      resolve();
    };
    immediateWakeResolver = onWake;
    timer = setTimeout(onWake, ms);
    timer.unref?.();
  });
}

function sleepInterruptible(ms: number, stopOnLeaseLoss = true): Promise<void> {
  if (stopping || (stopOnLeaseLoss && leaseLost)) return Promise.resolve();
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const onWake = () => {
      if (timer) clearTimeout(timer);
      channelWakeResolvers.delete(onWake);
      resolve();
    };
    channelWakeResolvers.add(onWake);
    timer = setTimeout(onWake, ms);
    timer.unref?.();
  });
}

const stop = (signal: string) => {
  stopping = true;
  leaseController?.abort();
  stopHeartbeat?.();
  wakeChannels();
  logger.info("worker stopping", { signal });
};
export function stopWorker(signal = "MANUAL") {
  stop(signal);
}
const onSigterm = () => stop("SIGTERM");
const onSigint = () => stop("SIGINT");

async function recordHeartbeat() {
  const now = new Date(workerAdapters.now());
  await db
    .insert(settings)
    .values({ key: "worker_heartbeat", value: now.toISOString() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: now.toISOString(), updatedAt: now },
    });
}

function loseLease() {
  if (leaseLost) return;
  leaseLost = true;
  leaseController?.abort();
  wakeChannels();
}

export async function releaseWorkerLease() {
  if (renewLeaseTimer) {
    clearInterval(renewLeaseTimer);
    renewLeaseTimer = undefined;
  }
  leaseController?.abort();
  leaseController = undefined;
  workerContext.leaseSignal = undefined;
  const wasHeld = leaseHeld;
  leaseHeld = false;
  leaseLost = false;
  if (wasHeld) {
    await workerLease
      .release()
      .catch((error) => logger.warn("worker lease release failed", { error: String(error) }));
  }
}

async function ensureWorkerLease(): Promise<boolean> {
  if (leaseHeld && !leaseLost) {
    workerContext.runtimeSettings = await loadRuntimeSettings();
    return true;
  }
  if (leaseLost) {
    await releaseWorkerLease();
  }
  const acquired = await workerLease.acquire();
  if (!acquired) return false;

  leaseHeld = true;
  leaseLost = false;
  leaseController = new AbortController();
  workerContext.leaseSignal = leaseController.signal;
  renewLeaseTimer = setInterval(() => {
    void workerLease
      .renew()
      .then((held) => {
        if (!held) loseLease();
      })
      .catch(loseLease);
  }, LEASE_RENEW_INTERVAL_MS);
  renewLeaseTimer.unref?.();

  try {
    workerContext.runtimeSettings = await loadRuntimeSettings();
    await recoverInterruptedTasks();
    return true;
  } catch (error) {
    await releaseWorkerLease();
    throw error;
  }
}

function assertLease() {
  if (leaseLost || !leaseHeld) {
    throw new Error("worker lease lost");
  }
}

async function dispatchImmediateTasks(): Promise<number> {
  if (dispatching || stopping || leaseLost || !leaseHeld) {
    if (dispatching) wakePending = true;
    return 0;
  }
  dispatching = true;
  let launched = 0;

  try {
    // 1. Concurrent certificate sync jobs with per-certificateId mutex
    if (inFlightSyncTasks.size < MAX_CONCURRENT_SYNC_JOBS) {
      const queuedSyncJobs = await selectEligibleQueuedSyncJobs(20);
      for (const job of queuedSyncJobs) {
        if (stopping || leaseLost) break;
        if (inFlightSyncTasks.size >= MAX_CONCURRENT_SYNC_JOBS) break;
        const lockKey = `sync:${job.certificateId}`;
        if (
          inFlightTaskIds.has(job.id) ||
          taskExecutor.isRunning(job.id) ||
          taskLock.isLocked(lockKey) ||
          reservedLockKeys.has(lockKey)
        ) {
          continue;
        }

        inFlightTaskIds.add(job.id);
        reservedLockKeys.add(lockKey);
        launched += 1;

        const taskPromise = taskExecutor
          .execute(
            ({ signal }) =>
              processSyncJob(job.id, {
                signal,
                onDeploymentQueued: () => wakeWorker(),
              }),
            {
              taskId: job.id,
              lockKey,
              signal: workerContext.leaseSignal,
            }
          )
          .catch((error) => {
            logger.error("sync job failed", {
              syncJobId: job.id,
              error: redactSensitive(String(error), workerContext.runtimeSettings.ohttpsApiKey),
            });
          })
          .finally(() => {
            inFlightTaskIds.delete(job.id);
            reservedLockKeys.delete(lockKey);
            inFlightSyncTasks.delete(taskPromise);
            wakeWorker();
          });
        inFlightSyncTasks.add(taskPromise);
      }
    }

    // 2. Concurrent deployments with per-serverId mutex (skip conflicting, avoid head-of-line blocking)
    if (inFlightDeploymentTasks.size < MAX_CONCURRENT_DEPLOYMENTS) {
      const queuedDeployments = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(eq(deployments.status, "queued"))
        .orderBy(deployments.createdAt)
        .limit(50);

      if (queuedDeployments.length > 0) {
        const deploymentIds = queuedDeployments.map((d) => d.id);
        const targetRows = await db
          .select({
            deploymentId: deploymentTargets.deploymentId,
            serverId: deploymentTargets.serverId,
          })
          .from(deploymentTargets)
          .where(inArray(deploymentTargets.deploymentId, deploymentIds));

        const serverIdsByDeployment = new Map<string, string[]>();
        for (const row of targetRows) {
          const list = serverIdsByDeployment.get(row.deploymentId) ?? [];
          list.push(row.serverId);
          serverIdsByDeployment.set(row.deploymentId, list);
        }

        for (const deployment of queuedDeployments) {
          if (stopping || leaseLost) break;
          if (inFlightDeploymentTasks.size >= MAX_CONCURRENT_DEPLOYMENTS) break;
          if (inFlightTaskIds.has(deployment.id) || taskExecutor.isRunning(deployment.id)) continue;

          const serverIds = [...new Set(serverIdsByDeployment.get(deployment.id) ?? [])];
          const serverLockKeys = serverIds.map((id) => `server:${id}`);
          const allLockKeys = [`deploy:${deployment.id}`, ...serverLockKeys];
          if (allLockKeys.some((key) => taskLock.isLocked(key) || reservedLockKeys.has(key))) {
            continue;
          }

          inFlightTaskIds.add(deployment.id);
          for (const key of allLockKeys) reservedLockKeys.add(key);
          launched += 1;

          const taskPromise = taskExecutor
            .execute(
              async ({ signal }) => {
                try {
                  await processDeployment(deployment.id, {
                    signal,
                    serverLocksHeld: true,
                  });
                } catch (error) {
                  await failDeployment(
                    deployment.id,
                    redactSensitive(String(error), workerContext.runtimeSettings.ohttpsApiKey)
                  );
                }
              },
              {
                taskId: deployment.id,
                lockKeys: allLockKeys,
                signal: workerContext.leaseSignal,
              }
            )
            .catch((error) => {
              logger.error("deployment execution failed", {
                deploymentId: deployment.id,
                error: redactSensitive(String(error), workerContext.runtimeSettings.ohttpsApiKey),
              });
            })
            .finally(() => {
              inFlightTaskIds.delete(deployment.id);
              for (const key of allLockKeys) reservedLockKeys.delete(key);
              inFlightDeploymentTasks.delete(taskPromise);
              wakeWorker();
            });
          inFlightDeploymentTasks.add(taskPromise);
        }
      }
    }
  } finally {
    dispatching = false;
  }

  return launched;
}

async function runPeriodicScanTick() {
  assertLease();
  const now = workerAdapters.now();
  const next = nextScanAt(
    scheduledScanAt,
    now,
    workerContext.runtimeSettings.schedulerIntervalMinutes
  );
  let scanTriggered = false;
  if (next !== scheduledScanAt) {
    await scanCertificates();
    scheduledScanAt = next;
    scanTriggered = true;
  }
  assertLease();
  const createdDeployments = await reconcileAutoDeployments(new Date(workerAdapters.now()));
  if (scanTriggered || createdDeployments.length > 0) {
    wakeWorker();
  }
}

async function runBackgroundTick() {
  assertLease();
  await deliverPendingNotifications();
  assertLease();
  await purgeExpiredRecords();
}

async function purgeExpiredRecords() {
  const cutoff = new Date(
    workerAdapters.now() - workerContext.runtimeSettings.logRetentionDays * 24 * 60 * 60 * 1000
  );
  await archiveExpiredRecords(cutoff, workerConfig.LOG_ARCHIVE_DIR);
  await pruneCertificateVersionDirectories();
}

/**
 * Single deterministic queue pass (used by tests and synchronous invocations).
 * Persistently acquires WorkerLease on first call (running recoverInterruptedTasks once per lease)
 * and dispatches concurrent sync/deployment channels with server/certificate mutexes.
 */
export async function pollQueue() {
  if (polling || stopping) return;
  polling = true;
  try {
    const held = await ensureWorkerLease();
    if (!held) return;

    assertLease();
    await recordHeartbeat();
    await runPeriodicScanTick();

    while (!stopping && !leaseLost) {
      assertLease();
      await dispatchImmediateTasks();
      const pending = [...inFlightSyncTasks, ...inFlightDeploymentTasks];
      if (pending.length === 0) break;
      await Promise.race(pending);
    }

    assertLease();
    await runBackgroundTick();
  } catch (error) {
    logger.error("queue poll failed", { error: String(error) });
    if (leaseLost) {
      await releaseWorkerLease();
    }
  } finally {
    polling = false;
  }
}

async function runImmediateChannel() {
  while (!stopping && !leaseLost && leaseHeld) {
    try {
      workerContext.runtimeSettings = await loadRuntimeSettings();
      await dispatchImmediateTasks();
    } catch (error) {
      logger.error("immediate task channel failed", { error: String(error) });
    }
    if (stopping || leaseLost || !leaseHeld) break;
    await waitForImmediateWake(IMMEDIATE_FALLBACK_POLL_MS);
  }
}

async function runPeriodicScanChannel() {
  while (!stopping && !leaseLost && leaseHeld) {
    try {
      workerContext.runtimeSettings = await loadRuntimeSettings();
      await runPeriodicScanTick();
    } catch (error) {
      logger.error("periodic scan channel failed", { error: String(error) });
    }
    if (stopping || leaseLost || !leaseHeld) break;
    await sleepInterruptible(SCAN_CHECK_INTERVAL_MS);
  }
}

async function runBackgroundChannel() {
  while (!stopping && !leaseLost && leaseHeld) {
    try {
      workerContext.runtimeSettings = await loadRuntimeSettings();
      await runBackgroundTick();
    } catch (error) {
      logger.error("background maintenance channel failed", { error: String(error) });
    }
    if (stopping || leaseLost || !leaseHeld) break;
    await sleepInterruptible(BACKGROUND_INTERVAL_MS);
  }
}

export async function runWorker() {
  stopping = false;
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

  controlServer = await startWorkerControlServer({
    onWake: () => wakeWorker(),
    onCancel: (deploymentId) => cancelWorkerDeployment(deploymentId),
  }).catch((error) => {
    logger.warn("worker control server failed to start, falling back to polling", {
      error: String(error),
    });
    return undefined;
  });

  stopHeartbeat = startHeartbeat(recordHeartbeat, 30_000, (error) =>
    logger.warn("worker heartbeat failed", { error: String(error) })
  );

  try {
    while (!stopping) {
      let acquired = false;
      try {
        acquired = await ensureWorkerLease();
      } catch (error) {
        logger.error("worker lease acquisition failed", { error: String(error) });
      }
      if (!acquired) {
        await sleepInterruptible(LEASE_RETRY_INTERVAL_MS, false);
        continue;
      }

      wakePending = false;
      await Promise.allSettled([
        runImmediateChannel(),
        runPeriodicScanChannel(),
        runBackgroundChannel(),
      ]);

      await Promise.allSettled([...inFlightSyncTasks, ...inFlightDeploymentTasks]);
      await releaseWorkerLease();
    }
  } finally {
    stopHeartbeat?.();
    stopHeartbeat = undefined;
    await controlServer?.close().catch(() => undefined);
    controlServer = undefined;
    await releaseWorkerLease();
    process.off("SIGTERM", onSigterm);
    process.off("SIGINT", onSigint);
  }
}
