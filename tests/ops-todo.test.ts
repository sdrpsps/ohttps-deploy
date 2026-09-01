import assert from "node:assert/strict";

function computeFailedCounts(
  deployments: Array<{ id: string; certificateId: string; status: string }>,
  syncJobs: Array<{ id: string; certificateId: string; status: string }>
) {
  const latestDeploymentByCert = new Map<string, { id: string; certificateId: string; status: string }>();
  for (const dep of deployments) {
    if (!latestDeploymentByCert.has(dep.certificateId)) {
      latestDeploymentByCert.set(dep.certificateId, dep);
    }
  }

  const failedDeploymentItems = Array.from(latestDeploymentByCert.values()).filter(
    (item) => item.status === "failed" || item.status === "partial"
  );

  const latestSyncJobByCert = new Map<string, { id: string; certificateId: string; status: string }>();
  for (const job of syncJobs) {
    if (!latestSyncJobByCert.has(job.certificateId)) {
      latestSyncJobByCert.set(job.certificateId, job);
    }
  }

  const failedSyncJobItems = Array.from(latestSyncJobByCert.values()).filter(
    (job) => job.status === "failed"
  );

  return {
    failedDeployments: failedDeploymentItems.length,
    latestFailedDeploymentId: failedDeploymentItems[0]?.id,
    failedSyncJobs: failedSyncJobItems.length,
    latestFailedSyncJobId: failedSyncJobItems[0]?.id,
  };
}

async function run() {
  // Scenario 1: Certificate 1 deployment failed
  const deployments1 = [
    { id: "dep-1", certificateId: "cert-1", status: "failed" },
  ];
  const syncJobs1 = [
    { id: "sync-1", certificateId: "cert-1", status: "failed" },
  ];

  const result1 = computeFailedCounts(deployments1, syncJobs1);
  assert.equal(result1.failedDeployments, 1);
  assert.equal(result1.latestFailedDeploymentId, "dep-1");
  assert.equal(result1.failedSyncJobs, 1);
  assert.equal(result1.latestFailedSyncJobId, "sync-1");

  // Scenario 2: Certificate 1 is retried and currently running
  const deployments2 = [
    { id: "dep-2", certificateId: "cert-1", status: "running" },
    { id: "dep-1", certificateId: "cert-1", status: "failed" },
  ];
  const result2 = computeFailedCounts(deployments2, syncJobs1);
  assert.equal(result2.failedDeployments, 0, "Running retry should clear active failed status");

  // Scenario 3: Certificate 1 retry succeeded
  const deployments3 = [
    { id: "dep-2", certificateId: "cert-1", status: "succeeded" },
    { id: "dep-1", certificateId: "cert-1", status: "failed" },
  ];
  const syncJobs3 = [
    { id: "sync-2", certificateId: "cert-1", status: "succeeded" },
    { id: "sync-1", certificateId: "cert-1", status: "failed" },
  ];
  const result3 = computeFailedCounts(deployments3, syncJobs3);
  assert.equal(result3.failedDeployments, 0, "Successful new deployment should resolve historical failure");
  assert.equal(result3.failedSyncJobs, 0, "Successful new sync job should resolve historical sync failure");

  // Scenario 4: Multiple certificates, one succeeding and one failing
  const deployments4 = [
    { id: "dep-3", certificateId: "cert-2", status: "failed" },
    { id: "dep-2", certificateId: "cert-1", status: "succeeded" },
    { id: "dep-1", certificateId: "cert-1", status: "failed" },
  ];
  const result4 = computeFailedCounts(deployments4, syncJobs3);
  assert.equal(result4.failedDeployments, 1);
  assert.equal(result4.latestFailedDeploymentId, "dep-3");

  console.log("ops todo aggregation tests passed");
}

run();
