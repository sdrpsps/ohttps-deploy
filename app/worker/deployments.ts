import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { certificateTargets, certificates, certificateVersions, deployments, deploymentCertificates, deploymentTargets, logs, servers, settings } from "../db/schema";
import { deploymentPaths } from "../domain/deployment-path";
import { redactSensitive } from "../domain/ohttps-client";
import { workerAdapters, workerContext } from "./context";
import { watchCancellation } from "./cancellation";
import { queueNotification } from "./notifications";

export async function processDeployment(deploymentId: string) {
  const [deployment] = await db.update(deployments).set({ status: "running", startedAt: new Date(workerAdapters.now()), updatedAt: new Date(workerAdapters.now()) }).where(and(eq(deployments.id, deploymentId), eq(deployments.status, "queued"))).returning();
  if (!deployment) return;

  // 1. 获取本次部署包含的所有证书
  let deploymentCerts = await db.select({
    certificateId: deploymentCertificates.certificateId,
    domain: certificates.domain,
    certPath: certificateVersions.certPath,
    privateKeyPath: certificateVersions.privateKeyPath,
    certificateStatus: certificates.status,
    currentVersionId: certificates.currentVersionId,
    versionId: certificateVersions.id,
  })
    .from(deploymentCertificates)
    .innerJoin(certificates, eq(deploymentCertificates.certificateId, certificates.id))
    .innerJoin(certificateVersions, eq(deploymentCertificates.certificateVersionId, certificateVersions.id))
    .where(eq(deploymentCertificates.deploymentId, deploymentId));

  // 兼容老单证书记录
  if (!deploymentCerts.length && deployment.certificateId && deployment.certificateVersionId) {
    const [cert] = await db.select({ domain: certificates.domain, status: certificates.status, currentVersionId: certificates.currentVersionId }).from(certificates).where(eq(certificates.id, deployment.certificateId)).limit(1);
    const [ver] = await db.select({ certPath: certificateVersions.certPath, privateKeyPath: certificateVersions.privateKeyPath }).from(certificateVersions).where(eq(certificateVersions.id, deployment.certificateVersionId)).limit(1);
    if (cert && ver) {
      deploymentCerts = [{ certificateId: deployment.certificateId, domain: cert.domain, certPath: ver.certPath, privateKeyPath: ver.privateKeyPath, certificateStatus: cert.status, currentVersionId: cert.currentVersionId, versionId: deployment.certificateVersionId }];
    }
  }

  if (!deploymentCerts.length) {
    await failDeployment(deploymentId, "no valid certificates found for deployment");
    return;
  }

  const targets = await db.select({
    id: deploymentTargets.id,
    serverId: servers.id,
    name: servers.name,
    status: deploymentTargets.status,
    enabled: servers.enabled,
    host: servers.host,
    port: servers.port,
    username: servers.username,
    hostFingerprint: servers.hostFingerprint,
    certPath: servers.certPath,
    privateKeyPath: servers.privateKeyPath,
    validationCommand: servers.validationCommand,
    reloadCommand: servers.reloadCommand,
    healthCheckCommand: servers.healthCheckCommand,
    timeoutSeconds: servers.timeoutSeconds,
  })
    .from(deploymentTargets)
    .innerJoin(servers, eq(deploymentTargets.serverId, servers.id))
    .where(eq(deploymentTargets.deploymentId, deploymentId));

  if (!targets.length) {
    await failDeployment(deploymentId, "no deployment targets configured");
    return;
  }

  const [sharedKey] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "shared_ssh_private_key")).limit(1);
  if (!sharedKey && !deployment.dryRun) {
    await failDeployment(deploymentId, "shared SSH private key is not configured");
    return;
  }

  // 获取证书与服务器的分配关系
  const targetServerIds = targets.map((t) => t.serverId);
  const certTargetMappings = targetServerIds.length > 0
    ? await db.select({
        certificateId: certificateTargets.certificateId,
        serverId: certificateTargets.serverId,
        autoDeploy: certificateTargets.autoDeploy,
      })
        .from(certificateTargets)
        .where(inArray(certificateTargets.serverId, targetServerIds))
    : [];

  const serverToCertIds = new Map<string, Set<string>>();
  for (const m of certTargetMappings) {
    if (deployment.trigger === "scheduled" && !m.autoDeploy) continue;
    const set = serverToCertIds.get(m.serverId) ?? new Set();
    set.add(m.certificateId);
    serverToCertIds.set(m.serverId, set);
  }

  let sequence = (await db.select({ sequence: logs.sequence }).from(logs).where(eq(logs.deploymentId, deploymentId)).orderBy(desc(logs.sequence)).limit(1))[0]?.sequence ?? 0;
  const logProgress = async (message: string, targetId?: string | null, level: "info" | "warn" | "error" = "info") => {
    const currentSeq = ++sequence;
    await db.insert(logs).values({
      id: randomUUID(),
      deploymentId,
      targetId: targetId ?? null,
      sequence: currentSeq,
      level,
      message,
    });
  };

  await logProgress(`Worker 已接手部署任务，准备部署至 ${targets.length} 台受管服务器`);

  const results: Array<{ ok: boolean; error?: string; exitCode?: number }> = targets.filter((t) => t.status === "succeeded").map(() => ({ ok: true }));
  const pendingTargets = targets.filter((t) => t.status !== "succeeded" && t.status !== "cancelled");
  const concurrency = Math.max(1, Math.min(deployment.concurrency, targets.length || 1));
  const cancellation = watchCancellation(async () => (await db.select({ status: deployments.status }).from(deployments).where(eq(deployments.id, deploymentId)).limit(1))[0]?.status === "cancelled");

  try {
    await cancellation.check();
    for (let offset = 0; offset < pendingTargets.length; offset += concurrency) {
      const batch = pendingTargets.slice(offset, offset + concurrency);
      const batchResults = await Promise.all(batch.map(async (target) => {
        if (cancellation.signal.aborted || workerContext.leaseSignal?.aborted) return { ok: false, error: "cancelled" };
        await db.update(deploymentTargets).set({ status: "running", startedAt: new Date(workerAdapters.now()), updatedAt: new Date(workerAdapters.now()) }).where(eq(deploymentTargets.id, target.id));

        // 筛选归属当前服务器的待部署证书
        const assignedCertIds = serverToCertIds.get(target.serverId);
        const serverCerts = deploymentCerts.filter((c) => assignedCertIds ? assignedCertIds.has(c.certificateId) : true);
        const certsToDeploy = deployment.trigger === "scheduled"
          ? deploymentCerts.filter((c) => target.enabled && assignedCertIds?.has(c.certificateId) && c.certificateStatus === "active" && c.currentVersionId === c.versionId)
          : serverCerts.length > 0 ? serverCerts : deploymentCerts;
        if (!certsToDeploy.length) {
          await db.update(deploymentTargets).set({ status: "failed", errorSummary: "automatic deployment policy no longer applies", finishedAt: new Date(workerAdapters.now()), updatedAt: new Date(workerAdapters.now()) }).where(eq(deploymentTargets.id, target.id));
          return { ok: false, error: "automatic deployment policy no longer applies" };
        }

        const materials = certsToDeploy.map((c) => {
          const paths = deploymentPaths(c.domain);
          return {
            domain: c.domain,
            certificatePath: c.certPath,
            privateKeyPath: c.privateKeyPath,
            certPath: paths.certPath,
            privateKeyPathRemote: paths.privateKeyPath,
          };
        });

        const certNames = certsToDeploy.map((c) => c.domain).join(", ");
        await logProgress(`[${target.name}] 开始部署证书 (${certNames}) 至服务器节点...`, target.id);

        // 单次 SSH 连接，合并分发全部证书并统一 reload
        let result;
        try {
          result = await workerAdapters.deployer(sharedKey?.value ?? "").deploy(
            target,
            materials,
            {
              dryRun: deployment.dryRun,
              signal: workerContext.leaseSignal ? AbortSignal.any([cancellation.signal, workerContext.leaseSignal]) : cancellation.signal,
              onProgress: async (_phase, msg, level) => {
                await logProgress(`[${target.name}] ${msg}`, target.id, level ?? "info");
              },
            }
          );
        } catch (error) {
          result = { targetId: target.id, ok: false, error: redactSensitive(String(error), sharedKey?.value) };
        }
        await db.update(deploymentTargets).set({
          status: result.ok ? "succeeded" : result.error === "cancelled" && cancellation.signal.aborted ? "cancelled" : "failed",
          exitCode: result.exitCode ?? null,
          errorSummary: result.error ?? null,
          finishedAt: new Date(workerAdapters.now()),
          updatedAt: new Date(workerAdapters.now()),
        }).where(and(eq(deploymentTargets.id, target.id), eq(deploymentTargets.status, "running")));

        await logProgress(
          result.ok
            ? `[${target.name}] ${deployment.dryRun ? "dry-run 模拟校验成功" : `已成功部署 ${certsToDeploy.length} 张证书 (${certNames})`}`
            : `[${target.name}] 部署失败：${result.error ?? "未知错误"}`,
          target.id,
          result.ok ? "info" : "error"
        );
        return result;
      }));
      results.push(...batchResults);
    }
  } finally { cancellation.stop(); }

  const [latestState] = await db.select({ status: deployments.status }).from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
  if (latestState?.status === "cancelled") return;
  const failed = results.filter((result) => !result.ok).length;
  const status = failed === 0 ? "succeeded" : failed === results.length || deployment.failurePolicy === "all_success" ? "failed" : "partial";
  if (targets.length > 1) {
    const succeededCount = results.filter((r) => r.ok).length;
    await logProgress(`所有服务器部署完毕：${succeededCount} 成功，${failed} 失败`);
  }
  await db.update(deployments).set({ status, finishedAt: new Date(workerAdapters.now()), errorSummary: failed ? `${failed} target(s) failed` : null, updatedAt: new Date(workerAdapters.now()) }).where(and(eq(deployments.id, deploymentId), eq(deployments.status, "running")));
  await queueNotification(`deployment.${status}`, "deployment", deploymentId, status === "succeeded" ? "success" : status === "partial" ? "warning" : "failure", failed ? `${failed} 台服务器部署失败` : undefined);
}

export async function failDeployment(id: string, message: string) {
  const failed = await db.update(deployments).set({ status: "failed", errorSummary: message, finishedAt: new Date(workerAdapters.now()), updatedAt: new Date(workerAdapters.now()) }).where(and(eq(deployments.id, id), eq(deployments.status, "running"))).returning({ id: deployments.id });
  if (!failed.length) return;
  await db.update(deploymentTargets).set({ status: "failed", errorSummary: message, finishedAt: new Date(workerAdapters.now()), updatedAt: new Date(workerAdapters.now()) })
    .where(and(eq(deploymentTargets.deploymentId, id), inArray(deploymentTargets.status, ["queued", "running"])));
  const sequence = ((await db.select({ sequence: logs.sequence }).from(logs).where(eq(logs.deploymentId, id)).orderBy(desc(logs.sequence)).limit(1))[0]?.sequence ?? 0) + 1;
  await db.insert(logs).values({ id: randomUUID(), deploymentId: id, sequence, level: "error", message });
  await queueNotification("deployment.failed", "deployment", id, "failure", message);
}

