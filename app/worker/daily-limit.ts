import { client } from "@/db";

export async function reserveOhttpsCall(limit: number, now = new Date()): Promise<boolean> {
  const key = `ohttps_calls_${now.toISOString().slice(0, 10)}`;
  const result = await client.execute({
    sql: `INSERT INTO settings (key, value, is_secret, created_at, updated_at)
          VALUES (?, '1', 0, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(settings.value AS INTEGER) + 1 AS TEXT), updated_at = excluded.updated_at
          WHERE CAST(settings.value AS INTEGER) >= 0 AND CAST(settings.value AS INTEGER) < ?`,
    args: [key, now.getTime(), now.getTime(), limit],
  });
  return result.rowsAffected > 0;
}
