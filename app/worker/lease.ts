import { randomUUID } from "node:crypto";
import { client } from "@/db";

const leaseKey = "worker_lease";

/** SQLite-backed lease: only one Worker may execute the queue at a time. */
export class WorkerLease {
  private readonly owner = randomUUID();

  constructor(private readonly durationMs = 30_000, private readonly now = Date.now) {}

  async acquire(): Promise<boolean> {
    const now = this.now();
    const result = await client.execute({
      sql: `INSERT INTO settings (key, value, is_secret, created_at, updated_at)
            VALUES (?, ?, 0, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            WHERE settings.updated_at <= ? OR settings.value = excluded.value`,
      args: [leaseKey, this.owner, now, now + this.durationMs, now],
    });
    return result.rowsAffected > 0;
  }

  async renew(): Promise<boolean> {
    const now = this.now();
    const result = await client.execute({
      sql: "UPDATE settings SET updated_at = ? WHERE key = ? AND value = ? AND updated_at > ?",
      args: [now + this.durationMs, leaseKey, this.owner, now],
    });
    return result.rowsAffected > 0;
  }

  async release(): Promise<void> {
    await client.execute({ sql: "DELETE FROM settings WHERE key = ? AND value = ?", args: [leaseKey, this.owner] });
  }
}
