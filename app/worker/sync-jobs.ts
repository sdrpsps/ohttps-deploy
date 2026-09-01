import { randomUUID } from "node:crypto";
import { client } from "@/db";

export async function enqueueSyncJob(certificateId: string, trigger: "manual" | "scheduled", force = false) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const id = randomUUID();
    const inserted = await client.execute({
      sql: `INSERT INTO certificate_sync_jobs (id, certificate_id, trigger, force, status)
            SELECT ?, ?, ?, ?, 'queued'
            WHERE NOT EXISTS (
              SELECT 1 FROM certificate_sync_jobs
              WHERE certificate_id = ? AND status IN ('queued', 'running')
            )`,
      args: [id, certificateId, trigger, force ? 1 : 0, certificateId],
    });
    if (inserted.rowsAffected > 0) {
      await client.execute({ sql: "INSERT INTO logs (id, sync_job_id, sequence, level, message) VALUES (?, ?, 0, 'info', '同步任务已创建，等待 Worker 接手')", args: [randomUUID(), id] });
      return { id, created: true };
    }

    const existing = await client.execute({
      sql: "SELECT id FROM certificate_sync_jobs WHERE certificate_id = ? AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1",
      args: [certificateId],
    });
    const activeId = existing.rows[0]?.id;
    if (typeof activeId === "string") return { id: activeId, created: false };
  }
  throw new Error("unable to enqueue certificate sync job");
}
